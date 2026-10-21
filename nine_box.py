"""Persist nine-box plans and atomically replace plans on import."""
import json
import math
import re
from datetime import datetime, timedelta, timezone

from flask import jsonify, request

SOURCES = {'เงินกู้ในประเทศ', 'เงินรายได้ กฟภ.', 'ที่ดิน', 'OH', 'IDC'}
MONEY_FIELDS = ('bComm', 'bInv', 'tComm', 'tInv')


def validate_plan(data, error):
    if not isinstance(data, dict) or not data:
        raise error('ไฟล์ต้องมีข้อมูลแยกตามปี พ.ศ. อย่างน้อยหนึ่งปี')
    # Work on a copy; never partially change the caller's data.
    try:
        data = json.loads(json.dumps(data, ensure_ascii=False, allow_nan=False))
    except (ValueError, TypeError, RecursionError):
        raise error('ไฟล์มีค่าหรือโครงสร้าง JSON ที่ไม่ถูกต้อง')
    def number(value, label):
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or abs(value) > 9e9:
            raise error(f'{label}: ต้องเป็นตัวเลขที่มีค่าจำกัดไม่เกิน 9,000,000,000 ล้านบาท')
    for year, projects in data.items():
        if not re.fullmatch(r'\d{4}', year) or not 2500 <= int(year) <= 2700:
            raise error('ปีต้องเป็น พ.ศ. ระหว่าง 2500–2700')
        if not isinstance(projects, list) or len(projects) > 10000:
            raise error(f'ปี {year}: รายการโครงการไม่ถูกต้อง')
        identities = set()
        for project in projects:
            if not isinstance(project, dict) or not isinstance(project.get('name'), str) or not project['name'].strip():
                raise error(f'ปี {year}: ต้องมีชื่อโครงการ')
            for key in ('id', 'masterProjectId', 'code', 'masterCode', 'name'):
                if key in project and (not isinstance(project[key], (str, int)) or isinstance(project[key], bool)):
                    raise error(f'ปี {year}: {key} ไม่ถูกต้อง')
            identity = str(project.get('masterProjectId') or project.get('id') or project.get('code') or project['name'])
            if identity in identities:
                raise error(f'ปี {year}: โครงการซ้ำ {project["name"]}')
            identities.add(identity)
            if 'endYear' in project and project['endYear'] not in (None, ''):
                if not re.fullmatch(r'\d{4}', str(project['endYear'])) or not 2500 <= int(project['endYear']) <= 2700:
                    raise error(f'ปี {year}: ปีสิ้นสุดโครงการไม่ถูกต้อง')
            for key in ('unboundLoan', 'unboundRevenue', 'sortOrder'):
                if key in project:
                    number(project[key], key)
            if 'isUnboundSelected' in project and not isinstance(project['isUnboundSelected'], bool):
                raise error('สถานะวงเงินไม่ผูกพันต้องเป็น true หรือ false')
            items = project.get('items')
            if not isinstance(items, list) or not items or len(items) > 5:
                raise error(f'ปี {year}: รายการแหล่งเงินไม่ถูกต้อง')
            seen = set()
            for item in items:
                if not isinstance(item, dict):
                    raise error('รายการแหล่งเงินต้องเป็น object')
                source = item.get('source')
                if source == 'เงินรายได้ กฟก.':
                    source = item['source'] = 'เงินรายได้ กฟภ.'
                if not isinstance(source, str) or source not in SOURCES or source in seen:
                    raise error('แหล่งเงินไม่ถูกต้องหรือซ้ำกัน')
                seen.add(source)
                for key in MONEY_FIELDS:
                    if key not in item:
                        raise error(f'ข้อมูลแหล่งเงินขาดช่อง {key}')
                    number(item[key], key)
    return data


def register_nine_box(app, db, *, error, now):
    def read(conn):
        row = conn.execute('SELECT * FROM nine_box_state WHERE id=1').fetchone()
        if row is None:
            # Suggest the current calendar BE year; the user chooses the fiscal year.
            year = str(datetime.fromisoformat(now()).astimezone(timezone(timedelta(hours=7))).year + 543)
            return dict(yearsData={year: []}, currentYear=year, version=0)
        return dict(yearsData=json.loads(row['data_json']), currentYear=row['current_year'], version=row['version'])

    def payload():
        body = request.get_json()
        if not isinstance(body, dict):
            raise error('ข้อมูลต้องเป็น object')
        data = validate_plan(body.get('yearsData'), error)
        year = body.get('currentYear', sorted(data)[0])
        if not isinstance(year, str) or year not in data:
            raise error('ปีที่เลือกไม่มีในข้อมูล')
        return body, data, year

    @app.get('/api/nine-box')
    def get_plan():
        with db() as conn:
            return jsonify(read(conn))

    @app.post('/api/nine-box/import/preview')
    def preview():
        _, data, year = payload()
        return jsonify(yearsData=data, currentYear=year, years=len(data), projects=sum(map(len, data.values())))

    @app.put('/api/nine-box')
    @app.post('/api/nine-box/import')
    def save_plan():
        body, data, year = payload()
        version = body.get('version')
        if type(version) is not int or version < 0:
            raise error('ต้องระบุเวอร์ชันข้อมูล')
        with db(True) as conn:
            previous = read(conn)
            if version != previous['version']:
                raise error('ข้อมูล 9 ช่องถูกแก้ไขจากหน้าต่างอื่น กรุณาส่งออกข้อมูลที่ยังไม่บันทึก แล้วโหลดข้อมูลล่าสุด', 409)
            conn.execute('INSERT INTO nine_box_state VALUES(1,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data_json=excluded.data_json,current_year=excluded.current_year,version=excluded.version,updated_at=excluded.updated_at',
                (json.dumps(data, ensure_ascii=False, allow_nan=False), year, version + 1, now()))
            return jsonify(version=version + 1, backupId=None)

    @app.get('/api/nine-box/backups')
    def backups():
        with db() as conn:
            return jsonify([dict(row) for row in conn.execute('SELECT id,current_year,version,created_at FROM nine_box_backups ORDER BY id DESC')])

    @app.get('/api/nine-box/backups/<int:backup_id>')
    def nine_box_backup(backup_id):
        with db() as conn:
            row = conn.execute('SELECT data_json FROM nine_box_backups WHERE id=?', (backup_id,)).fetchone()
            if row is None:
                raise error('ไม่พบไฟล์สำรอง', 404)
            response = jsonify(json.loads(row['data_json']))
            response.headers['Content-Disposition'] = f'attachment; filename="nine-box-backup-{backup_id}.json"'
            return response
