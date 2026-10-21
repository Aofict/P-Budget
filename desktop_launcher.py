"""Start the local server and open the browser only after it answers a probe."""
from hashlib import sha256
from pathlib import Path
import http.client
import json
import logging
import os
import sys
import threading
import time
import webbrowser

from werkzeug.serving import make_server


def database_path():
    if os.environ.get('P_BUDGET_DB'):
        return Path(os.environ['P_BUDGET_DB']).expanduser().resolve()
    # A one-file bundle extracts its assets temporarily. User data must not live there.
    root=Path(sys.executable).resolve().parent if getattr(sys,'frozen',False) else Path(__file__).resolve().parent
    return root/'data'/'master.db'


def read_status(port):
    conn=http.client.HTTPConnection('127.0.0.1',port,timeout=.5)
    try:
        conn.request('GET','/api/desktop-status')
        response=conn.getresponse()
        if response.status!=200:return None
        return json.loads(response.read(4096))
    except (OSError,ValueError,http.client.HTTPException):
        return None
    finally:
        conn.close()


def open_when_ready(port,key,stop,timeout=30):
    deadline=time.monotonic()+timeout
    while not stop.is_set() and time.monotonic()<deadline:
        status=read_status(port)
        if isinstance(status,dict) and status.get('application')=='PBudgetManager' and status.get('databaseKey')==key:
            webbrowser.open(f'http://127.0.0.1:{port}/',new=2)
            return True
        stop.wait(.15)
    return False


def run(app_factory=None):
    if app_factory is None:
        from server import create_app
        app_factory=create_app
    port=int(os.environ.get('PORT','8765'))
    if not 1<=port<=65535:raise ValueError('PORT must be between 1 and 65535')
    path=database_path()
    key=sha256(str(path).casefold().encode()).hexdigest()
    existing=read_status(port)
    open_browser=os.environ.get('P_BUDGET_OPEN_BROWSER','1')!='0'
    if isinstance(existing,dict) and existing.get('application')=='PBudgetManager' and existing.get('databaseKey')==key:
        if open_browser:webbrowser.open(f'http://127.0.0.1:{port}/',new=2)
        return
    # Explicitly detect a listener before binding (Windows may allow address reuse).
    import socket
    with socket.socket() as probe:
        probe.settimeout(.5)
        if probe.connect_ex(('127.0.0.1',port))==0:
            raise RuntimeError(f'Port {port} is already in use. Close the previous EXE / python server.py, then open PBudgetManager again.')
    app=app_factory(path)
    @app.get('/api/desktop-status')
    def desktop_status():
        from patch_updates import APP_VERSION
        return dict(application='PBudgetManager',databaseKey=key,version=APP_VERSION)
    http=make_server('127.0.0.1',port,app,threaded=True)
    app.config['PATCH_SHUTDOWN'] = http.shutdown
    app.config['PATCH_PORT'] = port
    stop=threading.Event()
    logging.getLogger('werkzeug').setLevel(logging.WARNING)
    print(f'P-Budget Manager is ready: http://127.0.0.1:{port}/',flush=True)
    print(f'Database: {path}',flush=True)
    print('Keep this window open while using the app. Close it to stop.',flush=True)
    opener=None
    if open_browser:
        opener=threading.Thread(target=open_when_ready,args=(port,key,stop),daemon=True)
        opener.start()
    try:
        http.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        stop.set()
        http.server_close()
        if opener:opener.join(timeout=1)


if __name__=='__main__':
    try:
        if len(sys.argv) == 3 and sys.argv[1] == '--apply-patch':
            from patch_updates import apply_job
            apply_job(sys.argv[2])
        elif len(sys.argv) > 1 and sys.argv[1] == '--prepare-update':
            sys.stdout.reconfigure(encoding='utf-8')
            sys.stderr.reconfigure(encoding='utf-8')
            from maintenance import prepare_update
            if len(sys.argv) != 3:
                raise ValueError('Usage: PBudgetManager.exe --prepare-update "path to old application folder"')
            bundle = Path(sys.executable).resolve().parent if getattr(sys, 'frozen', False) else Path(__file__).resolve().parent
            result = prepare_update(bundle, sys.argv[2])
            print(json.dumps(result, ensure_ascii=False, indent=2), flush=True)
        else:
            run()
    except Exception as exc:
        if '--prepare-update' in sys.argv or '--apply-patch' in sys.argv:
            print(str(exc), file=sys.stderr, flush=True)
            sys.exit(1)
        if getattr(sys,'frozen',False) and sys.platform=='win32':
            import ctypes
            ctypes.windll.user32.MessageBoxW(None,str(exc),'P-Budget Manager',0x10)
        else:raise
