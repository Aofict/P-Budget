"""Exercise a packaged EXE with a temporary DB and no visible browser."""
from pathlib import Path
import json
import os
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request


def verify(exe):
    exe=Path(exe).resolve()
    with socket.socket() as listener:
        listener.bind(('127.0.0.1',0));port=listener.getsockname()[1]
    root=Path(__file__).resolve().parent/'.test-data';root.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(dir=root) as folder:
        env=dict(os.environ,PORT=str(port),P_BUDGET_DB=str(Path(folder)/'test.db'),P_BUDGET_OPEN_BROWSER='0')
        base=f'http://127.0.0.1:{port}'
        def call(path,data=None):
            req=urllib.request.Request(base+path,data=None if data is None else json.dumps(data).encode(),
                headers={} if data is None else {'Content-Type':'application/json'})
            with urllib.request.urlopen(req,timeout=3) as response:
                return json.load(response)
        def start():
            process=subprocess.Popen([str(exe)],cwd=folder,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,
                                     creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
            for _ in range(150):
                if process.poll() is not None:raise RuntimeError('EXE exited during startup')
                try:
                    if call('/api/desktop-status')['application']=='PBudgetManager':return process
                except (OSError,ValueError):pass
                time.sleep(.1)
            process.terminate();process.wait(timeout=5)
            raise RuntimeError('EXE did not become ready')
        p=start()
        try:
            assert call('/api/bootstrap')['schemaVersion']==6
            project=call('/api/projects',dict(name='EXE persistence test',statusId='pending-approval',progress=0,finances=dict(loan=1.234,revenue=2)))
            meeting=call('/api/meetings',dict(year=2569,round=1,title='EXE meeting',date='2026-09-22'))
            call('/api/meetings/'+meeting['id']+'/projects',dict(projectIds=[project['id']]))
            assert call('/api/meeting-workspaces/'+meeting['id']+'/api/workflow/status')['openpyxl_installed']
            for path in ['/','/meeting-app/'+meeting['id']+'/project_detail.html','/meeting-app/assets/vendor/chart.umd.min.js']:
                with urllib.request.urlopen(base+path,timeout=3) as r:assert r.status==200
            for filename in ['app.js', 'style.css']:
                with urllib.request.urlopen(base+'/'+filename, timeout=3) as r:
                    assert r.read()==(Path(__file__).resolve().parent/filename).read_bytes(), filename
            for filename,content_type in [('index.html','text/html'),('style.css','text/css'),('script.js','javascript'),('storage.js','javascript'),('vendor/exceljs.min.js','javascript'),('vendor/FileSaver.min.js','javascript')]:
                with urllib.request.urlopen(base+'/nine-box-app/'+filename,timeout=3) as r:
                    assert r.status==200
                    assert content_type in r.headers.get('Content-Type',''), filename
                    expected=(Path(__file__).resolve().parent/'nine-box-app'/filename).read_bytes()
                    if content_type=='text/html':
                        expected=expected.replace(b'<head>', b'<head><script src="/database-session.js"></script>', 1)
                    assert r.read()==expected, filename
            call('/api/nine-box/import',dict(yearsData={'2569':[]},currentYear='2569',version=0))
        finally:p.terminate();p.wait(timeout=5)
        p=start()
        try:
            saved=call('/api/projects/'+project['id']);assert saved['code']==project['code'] and saved['budget']==3.234
            assert len(call('/api/meetings/'+meeting['id'])['projects'])==1
            assert call('/api/nine-box')['currentYear']=='2569'
            assert len(call('/api/nine-box/backups'))==1
        finally:p.terminate();p.wait(timeout=5)
    print('PASS: packaged EXE startup, assets including nine-box HTML/CSS/JS, create/save project, Excel dependency, meeting, restart persistence')


if __name__=='__main__':verify(sys.argv[1] if len(sys.argv)>1 else 'dist/PBudgetManager/PBudgetManager.exe')
