"""Run a real Chrome + HTTP/API smoke test against an isolated database."""
from pathlib import Path
import logging
import re
import subprocess
import sys
import tempfile
import threading

from flask import Response
from werkzeug.serving import make_server
from server import create_app

ROOT = Path(__file__).resolve().parent
SCREENSHOT_PREFIX = 'preview-master'
CHECKS = (ROOT / 'browser_profile_checks.js').read_text(encoding='utf-8')


def main():
    test_root = ROOT / '.test-data'
    test_root.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(dir=test_root) as temp:
        app = create_app(Path(temp) / 'browser.db')

        @app.get('/__verify')
        def verification_page():
            html = (ROOT / 'index.html').read_text(encoding='utf-8')
            return Response(html.replace('</body>', CHECKS + '</body>'), mimetype='text/html')

        logging.getLogger('werkzeug').setLevel(logging.ERROR)
        http = make_server('127.0.0.1', 0, app, threaded=True)
        thread = threading.Thread(target=http.serve_forever, daemon=True)
        thread.start()
        mobile = '--mobile' in sys.argv
        chrome = Path(r'C:\Program Files\Google\Chrome\Application\chrome.exe')
        if not chrome.exists():
            chrome = Path(r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe')
        screenshot = ROOT / (SCREENSHOT_PREFIX + ('-mobile.png' if mobile else '.png'))
        command = [str(chrome), '--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
                   f'--user-data-dir={ROOT / ".browser-check"}', '--virtual-time-budget=15000',
                   '--window-size=500,900' if mobile else '--window-size=1536,1024',
                   f'--screenshot={screenshot}', '--dump-dom', f'http://127.0.0.1:{http.server_port}/__verify']
        try:
            result = subprocess.run(command, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=45)
            match = re.search(r'data-test-result="([^"]*)"', result.stdout)
            outcome = match.group(1) if match else 'FAIL: no browser result\n' + result.stderr[-1500:]
            print(outcome)
        finally:
            http.shutdown()
            http.server_close()
            thread.join(timeout=3)
        return 0 if outcome.startswith('PASS') else 1


if __name__ == '__main__':
    raise SystemExit(main())
