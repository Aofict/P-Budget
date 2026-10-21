"""Drive the actual packaged EXE through Chrome/Edge using an isolated database.

No test routes, modified application files, or mocked save/export functions.
Reports, screenshots and the actual downloaded Excel are retained for review.
"""
import argparse
from datetime import datetime
from decimal import Decimal
from hashlib import sha256
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import traceback
import urllib.request
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
# Optional project-local installation, excluded from version control and EXE.
sys.path.insert(0, str(ROOT / '.browser-check/python'))
from playwright.sync_api import sync_playwright, expect
from openpyxl import load_workbook


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('exe', nargs='?', default='dist/YearSetupUpdate/PBudgetManager/PBudgetManager.exe')
    parser.add_argument('--browser', type=Path, help='Path to installed Chrome or Edge')
    args = parser.parse_args()
    exe = Path(args.exe).resolve()
    if not exe.is_file():
        parser.error(f'EXE not found: {exe}')
    browser_path = args.browser or next((p for p in [
        Path(r'C:\Program Files\Google\Chrome\Application\chrome.exe'),
        Path(r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'),
    ] if p.is_file()), None)
    if not browser_path:
        parser.error('Install Chrome/Edge or specify --browser')
    artifacts = ROOT / '.browser-check/exe-nine-box' / datetime.now().strftime('%Y%m%d-%H%M%S-%f')
    artifacts.mkdir(parents=True)
    report = dict(exe=str(exe), exeSha256=sha256(exe.read_bytes()).hexdigest(),
                  browser=str(browser_path), status='RUNNING', checks=[], blockedExternalRequests=[], pageErrors=[])
    process = None
    page = None
    browser = None
    test_root = ROOT / '.test-data'
    test_root.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='exe-browser-', dir=test_root) as folder:
        with socket.socket() as listener:
            listener.bind(('127.0.0.1', 0))
            port = listener.getsockname()[1]
        base = f'http://127.0.0.1:{port}'
        env = dict(os.environ, PORT=str(port), P_BUDGET_DB=str(Path(folder)/'test.db'), P_BUDGET_OPEN_BROWSER='0')

        def api(path, data=None):
            request = urllib.request.Request(base + path,
                data=json.dumps(data).encode() if data is not None else None,
                headers={'Content-Type':'application/json'} if data is not None else {})
            with urllib.request.urlopen(request, timeout=3) as response:
                return json.load(response)

        def start():
            nonlocal process
            process = subprocess.Popen([str(exe)], cwd=folder, env=env,
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
            deadline = time.monotonic() + 25
            while time.monotonic() < deadline:
                if process.poll() is not None:
                    raise RuntimeError('EXE exited during startup')
                try:
                    if api('/api/desktop-status')['application'] == 'PBudgetManager':
                        return
                except (OSError, ValueError):
                    pass
                time.sleep(.1)
            raise RuntimeError('EXE did not start within 25 seconds')

        def stop():
            nonlocal process
            if process is not None and process.poll() is None:
                process.terminate()
                process.wait(timeout=10)
            process = None

        def passed(name):
            report['checks'].append(name)
            print('PASS: ' + name, flush=True)

        def new_browser(playwright):
            instance = playwright.chromium.launch(executable_path=str(browser_path), headless=True,
                args=['--disable-background-networking', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'])
            context = instance.new_context(viewport={'width':1600,'height':1000}, accept_downloads=True,
                                          service_workers='block')
            def restrict_network(route):
                url = route.request.url
                if urlparse(url).scheme in ('http', 'https') and urlparse(url).netloc != f'127.0.0.1:{port}':
                    report['blockedExternalRequests'].append(url)
                    route.abort()
                else:
                    route.continue_()
            context.route('**/*', restrict_network)
            tab = context.new_page()
            tab.set_default_timeout(15000)
            tab.on('pageerror', lambda error: report['pageErrors'].append(str(error)))
            tab.on('dialog', lambda dialog: dialog.accept())
            return instance, tab

        def ready_frame():
            expect(page.locator('#nine-box-panel')).to_have_attribute('data-load-state', 'ready', timeout=40000)
            expect(page.locator('#nine-box-frame')).to_be_visible()
            return page.frame_locator('#nine-box-frame')

        def saved(frame):
            expect(frame.locator('#storageStatus')).to_have_text('บันทึกลงฐานข้อมูลแล้ว')

        def verify_loan(frame):
            cells = frame.locator('td[contenteditable="true"]')
            for index, value in enumerate(['12.345', '3.210', '2.111', '1.100']):
                expect(cells.nth(index)).to_have_text(value)

        try:
            start()
            # Arrange master data only; all nine-box additions/edits use the UI.
            project = api('/api/projects', dict(name='โครงการทดสอบ EXE ออฟไลน์', statusId='pending-approval',
                progress=0, finances=dict(loan=20, revenue=5),
                details=dict(shortName='E2E-EXE', endDate='2024-09-30')))
            with sync_playwright() as playwright:
                try:
                    browser, page = new_browser(playwright)
                    page.goto(base, wait_until='domcontentloaded')
                    page.locator('nav button[data-page="settings"]').click()
                    expect(page.locator('#storage-info')).to_contain_text(str(Path(folder)/'test.db'))
                    expect(page.locator('#storage-info')).to_contain_text(str(Path(folder)/'backups'))
                    passed('Settings displays the actual database path and automatic backup folder')
                    page.locator('nav button[data-page="nine-box"]').click()
                    frame = ready_frame()
                    expect(frame.locator('#startYearSetup')).to_be_visible()
                    expect(frame.locator('#startYearInput')).to_have_value(api('/api/nine-box')['currentYear'])
                    expect(frame.locator('#masterProjectSearch')).to_be_disabled()
                    for invalid_year in ['', '2499', '2701', '2569.5']:
                        frame.locator('#startYearInput').fill(invalid_year)
                        frame.get_by_role('button', name='เริ่มใช้งานปีนี้').click()
                        assert api('/api/nine-box')['version'] == 0
                        expect(frame.locator('#startYearSetup')).to_be_visible()
                    frame.locator('#startYearInput').fill('2566')
                    frame.get_by_role('button', name='เริ่มใช้งานปีนี้').click()
                    expect(frame.locator('#startYearSetup')).to_be_hidden()
                    expect(frame.locator('#masterProjectSearch')).to_be_enabled()
                    assert api('/api/nine-box')['yearsData'] == {'2566': []}
                    passed('New database suggests a year, rejects invalid input, and persists the chosen start year')
                    expect(frame.locator('#tableBody')).to_contain_text('ไม่มีข้อมูลโครงการ')
                    frame.locator('#masterProjectSearch').fill('E2E-EXE')
                    frame.locator(f'[data-master-project-id="{project["id"]}"]').click()
                    frame.locator('#newProjEndYear').fill('2567')
                    frame.get_by_role('button', name='เพิ่มเข้า 9 ช่อง').click()
                    saved(frame)
                    expect(frame.locator('#tableBody')).to_contain_text(project['name'])
                    passed('Select a master project and add it to nine-box through the UI')

                    for index, value in enumerate(['12.345', '3.210', '2.111', '1.100']):
                        cell = frame.locator('td[contenteditable="true"]').nth(index)
                        cell.fill(value)
                        if index == 0:
                            cell.press('Control+s')
                        else:
                            frame.locator('#tableTitle').click()
                        saved(frame)
                    verify_loan(frame)
                    loan = api('/api/nine-box')['yearsData']['2566'][0]['items'][0]
                    assert [loan[key] for key in ('bComm','bInv','tComm','tInv')] == [12.345,3.21,2.111,1.1]
                    passed('Edit four real cells; Ctrl+S and blur persist exact amounts in SQLite')

                    frame.locator('#yearTabs button').filter(has_text='2567').click()
                    saved(frame)
                    expect(frame.locator('#tableTitle')).to_contain_text('2567')
                    assert Decimal(str(api('/api/nine-box')['yearsData']['2567'][0]['items'][0]['bComm'])).quantize(Decimal('.001')) == Decimal('12.344')
                    frame.locator('#yearTabs button').filter(has_text='2566').click()
                    saved(frame)
                    verify_loan(frame)
                    page.locator('nav button[data-page="dashboard"]').click()
                    expect(page.locator('#nine-box-panel')).to_be_hidden()
                    page.locator('nav button[data-page="nine-box"]').click()
                    frame = ready_frame()
                    verify_loan(frame)
                    passed('Switch fiscal years and sidebar pages; retain values and next-year balance')

                    page.reload(wait_until='domcontentloaded')
                    frame = ready_frame()
                    expect(frame.locator('#startYearSetup')).to_be_hidden()
                    verify_loan(frame)
                    page.screenshot(path=str(artifacts/'table-after-reload.png'), full_page=True)
                    passed('Reload the full browser page and recover saved table values')

                    # The real FileSaver download is saved to disk, not replaced or mocked.
                    with page.expect_download(timeout=30000) as download_info:
                        frame.get_by_role('button', name='Export เป็น Excel').click()
                    download = download_info.value
                    assert download.failure() is None
                    excel_path = artifacts/'nine-box-export.xlsx'
                    download.save_as(excel_path)
                    book = load_workbook(excel_path, data_only=True)
                    try:
                        sheet = book.worksheets[0]
                        rows = list(sheet.values)
                        assert any(project['name'] in str(value) for row in rows for value in row)
                        row = next(row for row in rows if row[2] == 'เงินกู้ในประเทศ')
                        actual = [Decimal(str(value)).quantize(Decimal('.001')) for value in row[3:12]]
                        expected = [Decimal(value) for value in ['12.345','3.210','15.555','2.111','1.100','3.211','10.234','2.110','12.344']]
                        assert actual == expected, (actual, expected)
                        assert sheet['A1'].value.endswith('2566')
                    finally:
                        book.close()
                    passed('Download real Excel offline; verify fiscal year, project, all nine loan amounts and totals with openpyxl')

                    page.locator('nav button[data-page="dashboard"]').click()
                    stop()
                    page.locator('nav button[data-page="nine-box"]').click()
                    expect(page.locator('#nine-box-panel')).to_have_attribute('data-load-state', 'error')
                    page.screenshot(path=str(artifacts/'server-stopped.png'), full_page=True)
                    start()
                    page.locator('#nine-box-panel').get_by_role('button', name='ลองใหม่').click()
                    frame = ready_frame()
                    verify_loan(frame)
                    passed('Stop and restart the real EXE; use Retry to restore the saved table')

                    browser.close()
                    browser = None
                    stop()
                    start()
                    browser, page = new_browser(playwright)
                    page.goto(base + '/#nine-box', wait_until='domcontentloaded')
                    frame = ready_frame()
                    verify_loan(frame)
                    assert page.evaluate('localStorage.length') == 0
                    expect(frame.locator('#startYearSetup')).to_be_hidden()
                    assert api('/api/nine-box')['yearsData']['2566'][0]['masterProjectId'] == project['id']
                    passed('Restart EXE and use a fresh browser profile with empty localStorage; SQLite restores data')
                    page.locator('nav button[data-page="settings"]').click()
                    backup_info = api('/api/storage-info')['latestBackup']
                    assert backup_info and Path(backup_info['path']).is_file()
                    expect(page.locator('#storage-info')).to_contain_text(backup_info['path'])
                    passed('Restart creates an automatic backup and Settings displays its actual path')
                    assert not report['pageErrors'], report['pageErrors']
                    passed('No uncaught JavaScript errors during the complete workflow')
                    report['status'] = 'PASS'
                except Exception:
                    if page is not None:
                        try:
                            page.screenshot(path=str(artifacts/'failure.png'), full_page=True, timeout=5000)
                        except Exception:
                            pass
                    raise
                finally:
                    if browser is not None:
                        browser.close()
        except Exception as error:
            report['status'] = 'FAIL'
            report['error'] = str(error)
            report['traceback'] = traceback.format_exc()
            print(report['traceback'], flush=True)
        finally:
            stop()
            (artifacts/'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
            print('Report: ' + str(artifacts/'report.json'), flush=True)
    return 0 if report['status'] == 'PASS' else 1


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
    raise SystemExit(main())
