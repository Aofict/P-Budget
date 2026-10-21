"""Real browser verification with all non-local DNS blocked and a fresh profile."""
from pathlib import Path
import json
import logging
import re
import subprocess
import tempfile
import threading

from flask import Response
from werkzeug.serving import make_server
from server import create_app

ROOT = Path(__file__).resolve().parent


def main():
    root = ROOT / '.test-data'
    root.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(dir=root) as folder:
        app = create_app(Path(folder) / 'browser.db')
        legacy = {'2566': [dict(id='legacy', name='Offline project', code='OFF1', endYear=2569,
            items=[dict(source=source, bComm=10 if index == 0 else 0, bInv=0, tComm=0, tInv=0)
                   for index, source in enumerate(['เงินกู้ในประเทศ','เงินรายได้ กฟภ.','ที่ดิน','OH','IDC'])])]}

        @app.get('/nine-box-app/__verify')
        def verification():
            html = (ROOT / 'nine-box-app/index.html').read_text(encoding='utf-8')
            seed = '<script>localStorage.setItem("budget_years_data", JSON.stringify(' + json.dumps(legacy) + '));</script>'
            html = html.replace('<head>', '<head>' + seed)
            html = html.replace('</body>', (ROOT / 'browser_nine_box_checks.js').read_text(encoding='utf-8') + '</body>')
            return Response(html, mimetype='text/html')

        logging.getLogger('werkzeug').setLevel(logging.ERROR)
        http = make_server('127.0.0.1', 0, app, threaded=True)
        thread = threading.Thread(target=http.serve_forever, daemon=True)
        thread.start()
        browser = Path(r'C:\Program Files\Google\Chrome\Application\chrome.exe')
        if not browser.exists():
            browser = Path(r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe')
        command = [str(browser), '--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
            '--disable-background-networking', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
            f'--user-data-dir={Path(folder) / "profile"}', '--virtual-time-budget=30000', '--dump-dom',
            f'http://127.0.0.1:{http.server_port}/nine-box-app/__verify']
        try:
            result = subprocess.run(command, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=55)
            match = re.search(r'data-test-result="([^"]*)"', result.stdout)
            outcome = match.group(1) if match else 'FAIL: no browser result ' + result.stderr[-1000:]
            print(outcome)
        finally:
            http.shutdown()
            http.server_close()
            thread.join(timeout=3)
        return 0 if outcome.startswith('PASS') else 1


if __name__ == '__main__':
    raise SystemExit(main())
