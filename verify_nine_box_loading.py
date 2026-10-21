"""Real browser verification with all non-local DNS blocked and a fresh profile."""
from pathlib import Path
import json
import logging
import re
import subprocess
import tempfile
import threading

from flask import Response, request
from werkzeug.serving import make_server
from server import create_app

ROOT = Path(__file__).resolve().parent


def main():
    root = ROOT / '.test-data'
    root.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(dir=root) as folder:
        app = create_app(Path(folder) / 'browser.db')
        state = {'mode': 'ok'}

        @app.after_request
        def disable_cache(response):
            response.headers['Cache-Control'] = 'no-store'
            return response

        @app.post('/__loader-mode')
        def loader_mode():
            state['mode'] = request.get_json()['mode']
            return {'ok': True}

        @app.before_request
        def simulate_failure():
            mode = state['mode']
            paths = {'missing-html':'/nine-box-app/index.html',
                     'missing-script':'/nine-box-app/script.js',
                     'missing-css':'/nine-box-app/style.css',
                     'missing-vendor':'/nine-box-app/vendor/exceljs.min.js'}
            if paths.get(mode) == request.path:
                return {'error':'File missing'}, 404
            if mode == 'api-error' and request.path == '/api/nine-box':
                return {'error':'Database unavailable'}, 503
            if mode == 'wrong-content' and request.path == '/nine-box-app/index.html':
                return {'error':'Unexpected JSON'}, 200

        @app.get('/__verify-loader')
        def verification():
            html = (ROOT / 'index.html').read_text(encoding='utf-8')
            html = html.replace('</body>', (ROOT / 'browser_nine_box_loading_checks.js').read_text(encoding='utf-8') + '</body>')
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
            f'--user-data-dir={Path(folder) / "profile"}', '--virtual-time-budget=60000', '--dump-dom',
            f'http://127.0.0.1:{http.server_port}/__verify-loader']
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
