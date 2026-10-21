"""Validate and restore a complete SQLite snapshot without copying live WAL files."""
from contextlib import closing
from datetime import datetime
from hashlib import sha256
from pathlib import Path
from urllib.parse import urlsplit
import hmac
import json
import secrets
import sqlite3
import tempfile
import time
from flask import g, jsonify, request
from maintenance import BACKUP_LOCK, retained_backup
from database_schema import SCHEMA_VERSION

MAX_DATABASE = 256 * 1024 * 1024


def schema_signature(db):
    return [(kind, name, table, ' '.join(sql.split())) for kind,name,table,sql in db.execute(
        "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type,name")]


def inspect_database(path, expected):
    path=Path(path).resolve()
    with path.open('rb') as file:
        if file.read(16) != b'SQLite format 3\x00':
            raise ValueError('ไฟล์นี้ไม่ใช่ฐานข้อมูล SQLite (.db)')
    deadline=time.monotonic()+20
    with closing(sqlite3.connect(path.as_uri()+'?mode=ro',uri=True,timeout=5)) as db:
        db.execute('PRAGMA trusted_schema=OFF')
        db.execute('PRAGMA query_only=ON')
        db.set_progress_handler(lambda: int(time.monotonic()>deadline),10000)
        if schema_signature(db)!=expected:
            raise ValueError('โครงสร้างฐานข้อมูลไม่ตรงกับโปรแกรมรุ่นนี้ กรุณาใช้ไฟล์จากเมนูสำรองข้อมูลทั้งหมดของรุ่นที่รองรับ')
        versions=[row[0] for row in db.execute('SELECT version FROM schema_migrations ORDER BY version')]
        if versions != list(range(1,SCHEMA_VERSION+1)):
            raise ValueError('รุ่นฐานข้อมูลไม่รองรับ กรุณาอัปเดตโปรแกรมให้ตรงกันก่อน')
        if db.execute('PRAGMA integrity_check').fetchall() != [('ok',)]:
            raise ValueError('ฐานข้อมูลเสียหาย ไม่สามารถนำเข้าได้')
        if db.execute('PRAGMA foreign_key_check').fetchone():
            raise ValueError('ข้อมูลอ้างอิงในฐานข้อมูลไม่ครบ')
        # These columns are decoded by API routes; reject unusable JSON before replacing data.
        for table in ['projects','meeting_projects','meeting_workspace_state','nine_box_state','nine_box_backups']:
            columns=[r[1] for r in db.execute(f'PRAGMA table_info("{table}")') if r[1].endswith('_json')]
            for column in columns:
                if db.execute(f'SELECT 1 FROM "{table}" WHERE "{column}" IS NOT NULL AND NOT json_valid("{column}") LIMIT 1').fetchone():
                    raise ValueError('ข้อมูลรายละเอียดในฐานข้อมูลไม่สมบูรณ์')
        return dict(projects=db.execute('SELECT COUNT(*) FROM projects WHERE deleted_at IS NULL').fetchone()[0],
            allProjects=db.execute('SELECT COUNT(*) FROM projects').fetchone()[0],
            meetings=db.execute('SELECT COUNT(*) FROM budget_meetings').fetchone()[0],
            schemaVersion=SCHEMA_VERSION,
            latestProjectChange=db.execute('SELECT MAX(updated_at) FROM projects').fetchone()[0])


def replace_contents(source, destination):
    # SQLite's backup API writes one transaction and handles the destination's WAL itself.
    # Never unlink/replace a .db underneath SQLite connections or copy .db-wal/.db-shm.
    deadline=time.monotonic()+45
    def progress(*_):
        if time.monotonic()>deadline: raise TimeoutError('การนำเข้าฐานข้อมูลใช้เวลานานเกินไป')
    with closing(sqlite3.connect(Path(source).resolve().as_uri()+'?mode=ro',uri=True,timeout=5)) as src:
        with closing(sqlite3.connect(destination,timeout=5)) as dst:
            src.backup(dst,pages=256,progress=progress,sleep=.1)


def register_database_transfer(app, error, update_state):
    database=Path(app.config['DATABASE']).resolve()
    state={'token':secrets.token_urlsafe(32),'staged':None,'changed':False,'schema':None}
    app.extensions['database_transfer']=state
    report_file=database.parent/'database-restore-status.json'

    def expected_schema():
        if state['schema'] is None:
            from server import initialize
            with tempfile.TemporaryDirectory(prefix='schema-') as directory:
                path=Path(directory)/'schema.db'
                initialize(path)
                with closing(sqlite3.connect(path)) as db: state['schema']=schema_signature(db)
        return state['schema']

    @app.before_request
    def protect_transfer():
        # Previously cached embedded HTML must receive the session guard after a patch.
        if request.method == 'GET' and (request.path == '/' or request.path.endswith('.html')):
            request.environ.pop('HTTP_IF_NONE_MATCH', None)
            request.environ.pop('HTTP_IF_MODIFIED_SINCE', None)
        mutation=request.path.startswith('/api/') and request.method not in ('GET','HEAD','OPTIONS')
        if mutation:
            supplied=request.headers.get('X-PBudget-Database')
            if (supplied is not None or state['changed']) and not hmac.compare_digest(supplied or '',state['token']):
                raise error('ฐานข้อมูลเปลี่ยนแล้ว กรุณาโหลดหน้านี้ใหม่ก่อนบันทึก เพื่อไม่ให้ข้อมูลเก่าทับข้อมูลที่นำเข้า',409)
        if request.path.startswith('/api/database-transfer'):
            if request.remote_addr not in ('127.0.0.1','::1') or urlsplit(request.host_url).hostname not in ('127.0.0.1','localhost','::1') or request.headers.get('Origin') not in (None,request.host_url.rstrip('/')):
                raise error('นำเข้าฐานข้อมูลได้จากโปรแกรมบนเครื่องนี้เท่านั้น',403)
            if mutation and not hmac.compare_digest(request.headers.get('X-PBudget-Database',''),state['token']):
                raise error('กรุณาโหลดหน้าตั้งค่าใหม่ก่อนนำเข้าฐานข้อมูล',403)
            if request.path.endswith('/preview'):
                request.max_content_length=MAX_DATABASE+1024*1024

    @app.after_request
    def session_script(response):
        # Include the same generation guard in the main page AND embedded meeting/9-box pages.
        if response.status_code==200 and response.mimetype=='text/html':
            response.direct_passthrough=False
            original_body=response.response
            body=response.get_data(as_text=True)
            if hasattr(original_body,'close'): original_body.close()
            if '<head>' in body:
                response.set_data(body.replace('<head>', '<head><script src="/database-session.js"></script>',1))
                response.headers.pop('ETag',None)
                response.headers['Cache-Control']='no-store'
        return response

    @app.get('/api/database-transfer')
    def database_transfer_status():
        last=None
        try: last=json.loads(report_file.read_text(encoding='utf-8'))
        except (OSError,ValueError): pass
        if last and last.get('backupPath') and not Path(last['backupPath']).is_file():
            last['backupPath'] = None
        return jsonify(token=state['token'],last=last,maxBytes=MAX_DATABASE)

    @app.post('/api/database-transfer/preview')
    def database_transfer_preview():
        previous=state['staged']
        state['staged']=None
        if previous: Path(previous['path']).unlink(missing_ok=True)
        upload=request.files.get('database')
        if not upload or not upload.filename.lower().endswith('.db'):
            raise error('กรุณาเลือกไฟล์ .db จากปุ่มสำรองข้อมูลทั้งหมด')
        folder=database.parent/'restore-staging'
        folder.mkdir(parents=True,exist_ok=True)
        identifier=secrets.token_hex(16)
        candidate=folder/(identifier+'.db')
        try:
            upload.save(candidate)
            if candidate.stat().st_size>MAX_DATABASE: raise ValueError('ไฟล์ฐานข้อมูลต้องไม่เกิน 256 MB')
            summary=inspect_database(candidate,expected_schema())
            current=inspect_database(database,expected_schema())
            state['staged']=dict(id=identifier,path=str(candidate),digest=sha256(candidate.read_bytes()).hexdigest())
            return jsonify(id=identifier,incoming=summary,current=current)
        except (ValueError,sqlite3.Error,OSError) as exc:
            candidate.unlink(missing_ok=True)
            raise error('ตรวจสอบฐานข้อมูลไม่สำเร็จ: '+str(exc))

    @app.post('/api/database-transfer/cancel')
    def database_transfer_cancel():
        if state['staged']: Path(state['staged']['path']).unlink(missing_ok=True)
        state['staged']=None
        return jsonify(cancelled=True)

    @app.post('/api/database-transfer/restore')
    def database_transfer_restore():
        with BACKUP_LOCK:
            return restore_database()

    def restore_database():
        body=request.get_json(silent=True)
        staged=state['staged']
        if not isinstance(body,dict) or not staged or body.get('id')!=staged['id'] or body.get('replaceAll') is not True:
            raise error('กรุณาตรวจสอบไฟล์และยืนยันการแทนที่ข้อมูลทั้งหมดก่อน',409)
        backup=None
        replacing=False
        try:
            candidate=Path(staged['path'])
            if not hmac.compare_digest(sha256(candidate.read_bytes()).hexdigest(),staged['digest']):
                raise ValueError('ไฟล์ที่ตรวจสอบเปลี่ยนไป กรุณาเลือกไฟล์ใหม่')
            summary=inspect_database(candidate,expected_schema())
            backup=retained_backup(database)
            replacing=True
            replace_contents(candidate,database)
            from monthly_disbursement import sync_project_spending
            with closing(sqlite3.connect(database)) as connection, connection:
                sync_project_spending(connection)
            inspect_database(database,expected_schema())
        except Exception as exc:
            if replacing:
                try: replace_contents(backup,database)
                except Exception:
                    update_state['busy']=True
                    raise error('นำเข้าไม่สำเร็จและคืนข้อมูลอัตโนมัติไม่ได้ กรุณาหยุดใช้งานและกู้คืนไฟล์สำรอง: '+str(backup),503)
                finally:
                    state['token']=secrets.token_urlsafe(32)
                    state['changed']=True
            raise error('ไม่ได้เปลี่ยนข้อมูล: '+str(exc))
        # Reject stale forms in other tabs/iframes, even if their row versions happen to match.
        state['token']=secrets.token_urlsafe(32)
        state['changed']=True
        state['staged']=None
        result=dict(status='success',message='นำเข้าฐานข้อมูลสำเร็จ',backupPath=str(backup),
                    restoredAt=datetime.now().astimezone().isoformat(),**summary)
        try:
            report_file.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
            candidate.unlink(missing_ok=True)
        except OSError: pass  # The data has committed; do not falsely report a failed restore.
        return jsonify(result)
