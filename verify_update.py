"""Exercise the packaged update helper against an isolated, running old EXE."""
from pathlib import Path
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request

ROOT = Path(__file__).resolve().parent


def verify(bundle, old_bundle):
    root = ROOT / '.test-data'
    root.mkdir(exist_ok=True)
    bundle, old_bundle = Path(bundle).resolve(), Path(old_bundle).resolve()
    with tempfile.TemporaryDirectory(prefix='update-', dir=root) as folder:
        current = Path(folder) / 'โปรแกรมเดิม'
        shutil.copytree(old_bundle, current, ignore=shutil.ignore_patterns('data'))
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
        env = dict(os.environ, PORT=str(port), P_BUDGET_OPEN_BROWSER='0')
        env.pop('P_BUDGET_DB', None)
        process = None

        def api(path, data=None):
            request = urllib.request.Request(f'http://127.0.0.1:{port}'+path,
                data=None if data is None else json.dumps(data).encode(),
                headers={} if data is None else {'Content-Type':'application/json'})
            with urllib.request.urlopen(request, timeout=3) as response:
                return json.load(response)

        def start(application):
            nonlocal process
            process = subprocess.Popen([str(application/'PBudgetManager.exe')], cwd=folder, env=env,
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW)
            deadline = time.monotonic()+25
            while time.monotonic()<deadline:
                if process.poll() is not None:
                    raise RuntimeError('EXE exited during startup')
                try:
                    if api('/api/desktop-status')['application']=='PBudgetManager':
                        return
                except (OSError,ValueError):
                    pass
                time.sleep(.1)
            raise RuntimeError('EXE startup timed out')

        def stop():
            nonlocal process
            if process is not None and process.poll() is None:
                process.terminate()
                process.wait(timeout=10)
            process = None

        def update():
            return subprocess.run([str(bundle/'PBudgetManager.exe'),'--prepare-update',str(current)],
                cwd=folder, env=dict(env, PYTHONIOENCODING='utf-8'), capture_output=True,
                text=True, encoding='utf-8', errors='replace', timeout=55, creationflags=subprocess.CREATE_NO_WINDOW)
        try:
            start(current)
            project = api('/api/projects',dict(name='Preserve during update', statusId='pending-approval', progress=0, finances=dict(loan=3,revenue=2)))
            api('/api/nine-box/import',dict(yearsData={'2569':[]}, currentYear='2569', version=0))
            result = update()
            assert result.returncode != 0, 'Must reject updating a running old EXE'
            assert 'Close the old' in result.stderr, result.stderr
            assert not list(Path(folder).glob('PBudgetManager-Updated-*'))
            print('PASS: running old EXE rejected, including a Thai installation path', flush=True)
            stop()
            original_exe = (current/'PBudgetManager.exe').read_bytes()
            original_database = (current/'data/master.db').read_bytes()
            result = update()
            assert result.returncode == 0, result.stderr
            info = json.loads(result.stdout)
            target = Path(info['applicationFolder'])
            assert target.parent == current.parent and target != current
            assert (current/'PBudgetManager.exe').read_bytes() == original_exe
            assert (current/'data/master.db').read_bytes() == original_database
            assert Path(info['backupPath']).is_file()
            assert not (target/'UPDATE-INCOMPLETE.txt').exists()
            start(target)
            assert api('/api/projects/'+project['id'])['name'] == project['name']
            assert api('/api/nine-box')['currentYear'] == '2569'
            assert len(api('/api/nine-box/backups')) == 1
            storage = api('/api/storage-info')
            assert storage['databasePath'] == str(target/'data/master.db')
            assert storage['latestBackup']
            print('PASS: packaged update keeps original files, restores master/nine-box/history in new folder, and creates automatic backup', flush=True)
        finally:
            stop()


if __name__ == '__main__':
    verify(sys.argv[1] if len(sys.argv)>1 else 'dist/MaintenanceUpdate/PBudgetManager',
           sys.argv[2] if len(sys.argv)>2 else 'dist/LoadingUpdate/PBudgetManager')
