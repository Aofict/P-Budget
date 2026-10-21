"""Offline full-release patches; stage the updater separately from the installed EXE."""
from pathlib import Path, PurePosixPath
from hashlib import sha256
import ctypes
import hmac
import json
import os
import re
import secrets
import shutil
import subprocess
import sys
import threading
import time
import webbrowser
import zipfile
from flask import request, jsonify, g
from maintenance import no_links

APP_VERSION = '1.0.6'
MAX_ZIP = 512 * 1024 * 1024
MAX_UNPACKED = 1024 * 1024 * 1024
REQUIRED = {'PBudgetManager.exe', 'python313.dll', 'index.html', 'app.js', 'style.css',
            'release.json', 'migrations/001_master.sql', 'meeting-app/index.html', 'nine-box-app/index.html'}


def version(value):
    if not isinstance(value, str) or not re.fullmatch(r'\d{1,5}\.\d{1,5}\.\d{1,5}', value):
        raise ValueError('เลขเวอร์ชันต้องเป็นรูปแบบ 2.1.1')
    return tuple(map(int, value.split('.')))


def safe_name(name):
    if not isinstance(name, str) or len(name) > 230 or '\\' in name:
        raise ValueError('ชื่อไฟล์ในแพตช์ไม่ถูกต้อง')
    p = PurePosixPath(name)
    if p.is_absolute() or str(p) != name or not p.parts:
        raise ValueError('เส้นทางไฟล์ในแพตช์ไม่ถูกต้อง')
    for part in p.parts:
        if part in ('.', '..') or part.endswith((' ', '.')) or re.search(r'[<>:"|?*\x00-\x1f]', part):
            raise ValueError('เส้นทางไฟล์ในแพตช์ไม่ปลอดภัย')
        if part.split('.')[0].upper() in {'CON','PRN','AUX','NUL',*[f'COM{i}' for i in range(10)],*[f'LPT{i}' for i in range(10)]}:
            raise ValueError('ชื่อไฟล์สงวนของ Windows')
    if p.parts[0].lower() in {'data', '.git', '.settings-backups'}:
        raise ValueError('แพตช์ต้องไม่มีฐานข้อมูลหรือข้อมูลผู้ใช้งาน')
    return name


def validate_manifest(manifest, current_version):
    if not isinstance(manifest, dict) or manifest.get('application') != 'PBudgetManager' or manifest.get('format') != 1:
        raise ValueError('ไม่ใช่ไฟล์แพตช์ P-Budget Manager ที่รองรับ')
    if version(manifest.get('version')) <= version(current_version):
        raise ValueError('กรุณาเลือกแพตช์เวอร์ชันใหม่กว่าโปรแกรมปัจจุบัน')
    if version(manifest.get('minimumVersion')) > version(current_version):
        raise ValueError('โปรแกรมรุ่นนี้เก่าเกินไปสำหรับแพตช์ กรุณาติดตั้งรุ่นพื้นฐานที่ระบุก่อน')
    files = manifest.get('files')
    if not isinstance(files, dict) or not REQUIRED.issubset(files) or len(files) > 15000:
        raise ValueError('แพตช์มีไฟล์โปรแกรมไม่ครบ')
    keys = set()
    for name, digest in files.items():
        safe_name(name)
        if name.casefold() in keys or name.casefold() == 'patch.json' or not isinstance(digest, str) or not re.fullmatch('[a-f0-9]{64}', digest):
            raise ValueError('รายการไฟล์หรือค่า SHA-256 ไม่ถูกต้อง')
        keys.add(name.casefold())
    notes = manifest.get('notes', '')
    if not isinstance(notes, str) or len(notes) > 4000:
        raise ValueError('รายละเอียดแพตช์ไม่ถูกต้อง')
    return files


def extract_patch(archive, target, current_version=APP_VERSION):
    target = Path(target)
    if target.exists():
        raise ValueError('พื้นที่เตรียมแพตช์ถูกใช้งานแล้ว')
    with zipfile.ZipFile(archive) as z:
        entries = z.infolist()
        if len(entries) > 15001 or sum(e.file_size for e in entries) > MAX_UNPACKED:
            raise ValueError('แพตช์มีขนาดหลังแตกไฟล์เกิน 1 GB หรือมีไฟล์มากเกินไป')
        names = set()
        for e in entries:
            safe_name(e.filename)
            if e.is_dir() or e.filename.casefold() in names or (e.external_attr >> 16) & 0o170000 == 0o120000 or e.flag_bits & 1:
                raise ValueError('แพตช์มีไฟล์ซ้ำ ลิงก์ หรือไฟล์เข้ารหัสที่ไม่รองรับ')
            names.add(e.filename.casefold())
        if 'patch.json' not in z.namelist() or z.getinfo('patch.json').file_size > 2*1024*1024:
            raise ValueError('ไม่พบ patch.json ที่ถูกต้อง กรุณาใช้ ZIP ที่สร้างสำหรับอัปเดตโปรแกรม')
        manifest = json.loads(z.read('patch.json'))
        files = validate_manifest(manifest, current_version)
        if set(z.namelist()) != set(files) | {'patch.json'}:
            raise ValueError('รายการไฟล์ใน ZIP ไม่ตรงกับแพตช์')
        target.mkdir(parents=True)
        try:
            for name, digest in files.items():
                dest = target / name
                dest.parent.mkdir(parents=True, exist_ok=True)
                h = sha256()
                with z.open(name) as source, dest.open('xb') as out:
                    while chunk := source.read(1024*1024):
                        h.update(chunk)
                        out.write(chunk)
                if not hmac.compare_digest(h.hexdigest(), digest):
                    raise ValueError('ไฟล์แพตช์เสียหาย: ' + name)
            (target/'patch.json').write_text(json.dumps(manifest, ensure_ascii=False), encoding='utf-8')
            verify_staged(target, current_version)
        except Exception:
            shutil.rmtree(target)  # Only this newly-created, validated staging directory.
            raise
    return manifest


def verify_staged(target, current_version):
    target = Path(target)
    no_links(target)
    manifest = json.loads((target/'patch.json').read_text(encoding='utf-8'))
    files = validate_manifest(manifest, current_version)
    actual = {p.relative_to(target).as_posix() for p in target.rglob('*') if p.is_file()}
    if actual != set(files) | {'patch.json'}:
        raise ValueError('ไฟล์แพตช์เปลี่ยนแปลงหลังตรวจสอบ')
    for name, digest in files.items():
        with (target/name).open('rb') as f:
            h = sha256()
            while chunk := f.read(1024*1024): h.update(chunk)
        if not hmac.compare_digest(h.hexdigest(), digest):
            raise ValueError('ไฟล์แพตช์เปลี่ยนแปลง: ' + name)
    if (target/'PBudgetManager.exe').read_bytes()[:2] != b'MZ':
        raise ValueError('ไฟล์โปรแกรม EXE ไม่ถูกต้อง')
    if json.loads((target/'release.json').read_text(encoding='utf-8')).get('version') != manifest['version']:
        raise ValueError('เวอร์ชันของชุดโปรแกรมไม่ตรงกับแพตช์')
    return manifest


def write_result(root, result):
    path = Path(root)/'data/patch-status.json'
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    temp.replace(path)


def register_updates(app, error):
    root = Path(sys.executable).resolve().parent if getattr(sys, 'frozen', False) else Path(__file__).resolve().parent
    supported = bool(getattr(sys, 'frozen', False) and sys.platform == 'win32' and
        Path(app.config['DATABASE']).resolve() == root/'data/master.db' and not os.environ.get('P_BUDGET_DB'))
    state = {'busy': False, 'staged': None}
    token = secrets.token_urlsafe(32)
    lock = threading.RLock()
    app.extensions['patch_updates'] = state

    @app.before_request
    def patch_guard():
        if request.path.startswith('/api/updates'):
            from urllib.parse import urlsplit
            if request.remote_addr not in ('127.0.0.1','::1') or urlsplit(request.host_url).hostname not in ('127.0.0.1','localhost','::1') or request.headers.get('Origin') not in (None, request.host_url.rstrip('/')):
                raise error('อัปเดตได้จากโปรแกรมบนเครื่องนี้เท่านั้น', 403)
            if request.method == 'POST':
                if not hmac.compare_digest(request.headers.get('X-PBudget-Update', ''), token):
                    raise error('กรุณาโหลดหน้าตั้งค่าใหม่ก่อนอัปเดต', 403)
                if not supported or not app.config.get('PATCH_SHUTDOWN'):
                    raise error('การติดตั้งแพตช์รองรับชุด EXE ที่ใช้ data/master.db เท่านั้น', 409)
                if request.path.endswith('/stage'):
                    request.max_content_length = MAX_ZIP + 1024*1024
        if request.path.startswith('/api/'):
            lock.acquire()
            g.patch_write_lock = True
            if state['busy'] and request.method not in ('GET','HEAD','OPTIONS'):
                raise error('กำลังอัปเดตโปรแกรม กรุณารอจนเปิดเวอร์ชันใหม่', 503)

    @app.teardown_request
    def release_write_lock(exc):
        if g.pop('patch_write_lock', False): lock.release()

    @app.get('/api/updates')
    def status():
        last = None
        try: last = json.loads((root/'data/patch-status.json').read_text(encoding='utf-8'))
        except (OSError, ValueError): pass
        return jsonify(version=APP_VERSION, supported=supported and bool(app.config.get('PATCH_SHUTDOWN')),
            token=token, busy=state['busy'], last=last)

    @app.post('/api/updates/stage')
    def stage():
        upload = request.files.get('patch')
        if not upload or not upload.filename.lower().endswith('.zip'):
            raise error('กรุณาเลือกไฟล์แพตช์ .zip')
        stage_id = secrets.token_hex(16)
        folder = root.parent/'.pbudget-patches'/stage_id
        folder.mkdir(parents=True, exist_ok=False)
        archive = folder/'upload.zip'
        try:
            upload.save(archive)
            if archive.stat().st_size > MAX_ZIP: raise ValueError('ไฟล์แพตช์ต้องไม่เกิน 512 MB')
            manifest = extract_patch(archive, folder/'release')
            state['staged'] = dict(id=stage_id, path=str(folder/'release'), version=manifest['version'])
            return jsonify(id=stage_id, version=manifest['version'], notes=manifest.get('notes',''), files=len(manifest['files']))
        except (ValueError, OSError, zipfile.BadZipFile, RuntimeError) as exc:
            raise error('ตรวจสอบแพตช์ไม่สำเร็จ: ' + str(exc))
        finally:
            archive.unlink(missing_ok=True)

    @app.post('/api/updates/install')
    def install():
        body = request.get_json(silent=True) or {}
        staged = state['staged']
        if not staged or body.get('id') != staged['id']:
            raise error('กรุณาเลือกและตรวจสอบไฟล์แพตช์ใหม่', 409)
        try:
            verify_staged(staged['path'], APP_VERSION)
            job = root/'data/patch-job.json'
            job.write_text(json.dumps(dict(current=str(root), staged=staged['path'], version=APP_VERSION,
                parent=os.getpid(), port=app.config['PATCH_PORT'], openBrowser=os.environ.get('P_BUDGET_OPEN_BROWSER','1')!='0')), encoding='utf-8')
            state['busy'] = True
            write_result(root, dict(status='installing', message='กำลังติดตั้งแพตช์โดยเก็บฐานข้อมูลไว้'))
            updater = Path(staged['path'])
            subprocess.Popen([str(updater/'PBudgetManager.exe'), '--apply-patch', str(job)], cwd=updater,
                creationflags=subprocess.CREATE_NO_WINDOW, close_fds=True)
            timer = threading.Timer(1.0, app.config['PATCH_SHUTDOWN'])
            timer.daemon = True
            timer.start()
        except Exception as exc:
            state['busy'] = False
            write_result(root, dict(status='failed', message=str(exc)))
            raise error('เริ่มอัปเดตไม่สำเร็จ: ' + str(exc))
        return jsonify(restarting=True, version=staged['version'])

    from database_transfer import register_database_transfer
    register_database_transfer(app, error, state)


def apply_job(job_path):
    """Runs from the staged new executable, outside the installed server process."""
    updater = Path(sys.executable).resolve().parent
    job_path = Path(job_path).resolve()
    if job_path.name != 'patch-job.json' or job_path.parent.name != 'data':
        raise ValueError('Invalid update job path')
    job = json.loads(job_path.read_text(encoding='utf-8'))
    root = Path(job['current']).resolve()
    if job_path != root/'data/patch-job.json': raise ValueError('Invalid update job path')
    staged = Path(job['staged']).resolve()
    if staged != updater or staged.parent.parent != root.parent/'.pbudget-patches' or staged.name != 'release':
        raise ValueError('Invalid staging path')
    child = None
    env = dict(os.environ, PORT=str(job['port']), P_BUDGET_OPEN_BROWSER='0')
    env.pop('P_BUDGET_DB', None)
    flags = subprocess.CREATE_NO_WINDOW
    # Synchronize with exact parent process handle, not a guessed delay/PID poll.
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.OpenProcess.restype = ctypes.c_void_p
    kernel.OpenProcess.argtypes = [ctypes.c_uint32, ctypes.c_int, ctypes.c_uint32]
    kernel.WaitForSingleObject.argtypes = [ctypes.c_void_p, ctypes.c_uint32]
    kernel.CloseHandle.argtypes = [ctypes.c_void_p]
    handle = kernel.OpenProcess(0x100000, False, job['parent'])
    if not handle and ctypes.get_last_error() not in (0, 87):
        write_result(root, dict(status='failed', message='ตรวจสอบการปิดโปรแกรมเดิมไม่ได้ กรุณาเปิดโปรแกรมเดิมอีกครั้ง'))
        return
    if handle:
        try:
            if kernel.WaitForSingleObject(handle, 60000) != 0:
                write_result(root, dict(status='failed', message='โปรแกรมเดิมยังไม่ปิด กรุณาปิดแล้วเปิดใหม่'))
                return
        finally: kernel.CloseHandle(handle)
    try:
        manifest = verify_staged(staged, job['version'])
        no_links(root)
        if not (root/'data/master.db').is_file():
            raise ValueError('ไม่พบฐานข้อมูลเดิมใน data/master.db')
        # Replace only files listed in the verified ZIP. Patch manifests reject data/ paths.
        # The updater runs from the staged release, so it can safely replace the installed EXE last.
        def replace_from_patch(source, destination):
            destination.parent.mkdir(parents=True, exist_ok=True)
            pending = destination.with_name(f'.{destination.name}.{secrets.token_hex(8)}.pending')
            try:
                shutil.copy2(source, pending)
                os.replace(pending, destination)
            finally:
                pending.unlink(missing_ok=True)

        for name in manifest['files']:
            if name.casefold() == 'pbudgetmanager.exe':
                continue
            replace_from_patch(staged/name, root/name)
        replace_from_patch(staged/'PBudgetManager.exe', root/'PBudgetManager.exe')
        result = dict(applicationFolder=str(root), databasePath=str(root/'data/master.db'))
        child = subprocess.Popen([str(root/'PBudgetManager.exe')], cwd=root, env=env, creationflags=flags)
        expected = sha256(str(root/'data/master.db').casefold().encode()).hexdigest()
        from desktop_launcher import read_status
        deadline = time.monotonic()+45
        while time.monotonic() < deadline:
            if child.poll() is not None: raise RuntimeError('โปรแกรมเวอร์ชันใหม่เปิดไม่สำเร็จ')
            info = read_status(job['port'])
            if info and info.get('databaseKey') == expected and info.get('version') == manifest['version']:
                success = dict(status='success', message='อัปเดตสำเร็จ', version=json.loads((root/'release.json').read_text())['version'], **result)
                write_result(root, success)
                job_path.unlink(missing_ok=True)
                if job['openBrowser']: webbrowser.open(f"http://127.0.0.1:{job['port']}/#settings", new=2)
                return
            time.sleep(.2)
        raise RuntimeError('เวอร์ชันใหม่ไม่ตอบกลับภายในเวลาที่กำหนด')
    except Exception as exc:
        if child and child.poll() is None:
            child.terminate()
            child.wait(timeout=10)
        failure = dict(status='failed', message='อัปเดตไม่สำเร็จ: ' + str(exc))
        write_result(root, failure)
        env['P_BUDGET_OPEN_BROWSER'] = '1' if job['openBrowser'] else '0'
        subprocess.Popen([str(root/'PBudgetManager.exe')], cwd=root, env=env, creationflags=flags)
