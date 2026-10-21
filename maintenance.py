"""Consistent SQLite backups and updates into a new, separate application folder."""
from contextlib import closing
from datetime import datetime, timezone, timedelta
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
import time
import threading
from uuid import uuid4

BACKUP_LOCK = threading.RLock()


def retained_backup(database):
    """Publish a checked snapshot before removing older backups in this folder."""
    database = Path(database).resolve()
    folder = database.parent / 'backups'
    if folder.is_symlink() or folder.is_junction():
        raise ValueError('Backup folder must not be a symbolic link or junction')
    folder.mkdir(parents=True, exist_ok=True)
    with BACKUP_LOCK:
        while True:
            stamp = datetime.now(timezone(timedelta(hours=7)))
            destination = folder / f'{stamp:%d_%m_%y_%H%M%S}.db'
            if not destination.exists():
                break
            time.sleep(.05)
        result = snapshot(database, destination)
        for old in folder.glob('*.db'):
            # Only plain files directly inside the verified backup directory.
            if old != result and not old.is_symlink() and old.is_file() and old.resolve().parent == folder:
                old.unlink()
        return result


def snapshot(database, destination):
    database, destination = Path(database).resolve(), Path(destination).resolve()
    if not database.is_file() or destination.exists() or database == destination:
        raise ValueError('Backup requires an existing database and a new destination file')
    destination.parent.mkdir(parents=True, exist_ok=True)
    partial = destination.with_name(destination.name + '.' + uuid4().hex + '.partial')
    deadline = time.monotonic() + 30
    def progress(*_):
        if time.monotonic() > deadline:
            raise TimeoutError('Database backup timed out; close other database applications and retry')
    try:
        with closing(sqlite3.connect(database.as_uri() + '?mode=ro', uri=True, timeout=5)) as source:
            with closing(sqlite3.connect(partial)) as target:
                source.backup(target, pages=256, progress=progress, sleep=.1)
                if target.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                    raise RuntimeError('Backup integrity check failed')
        if destination.exists():
            raise FileExistsError(destination)
        partial.rename(destination)
    except Exception:
        partial.unlink(missing_ok=True)
        raise
    return destination


def auto_backup(database, target_schema):
    database = Path(database).resolve()
    if not database.is_file() or database.stat().st_size == 0:
        return None
    with closing(sqlite3.connect(database.as_uri() + '?mode=ro', uri=True)) as conn:
        has_schema = conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migrations'").fetchone()
        version = conn.execute('SELECT COALESCE(MAX(version),0) FROM schema_migrations').fetchone()[0] if has_schema else 0
    if version > target_schema:
        raise RuntimeError('This database belongs to a newer app version. Use the newer EXE; no database changes were made.')
    return retained_backup(database)


def storage_info(database):
    database = Path(database).resolve()
    folder = database.parent / 'backups'
    backups = sorted((path for path in folder.glob('*.db') if path.is_file() and not path.is_symlink()), key=lambda path: path.stat().st_mtime, reverse=True)
    latest = backups[0] if backups else None
    return dict(databasePath=str(database), backupDirectory=str(folder),
        latestBackup=None if latest is None else dict(path=str(latest), size=latest.stat().st_size,
            createdAt=datetime.fromtimestamp(latest.stat().st_mtime).astimezone().isoformat()))


def assert_closed(current):
    """Fail closed if Windows cannot identify a running copy's location."""
    if sys.platform != 'win32':
        raise RuntimeError('The EXE update helper requires Windows')
    result = subprocess.run([
        str(Path(os.environ.get('SystemRoot', r'C:\Windows')) / 'System32/WindowsPowerShell/v1.0/powershell.exe'),
        '-NoProfile', '-NonInteractive', '-Command',
        "[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new(); $ErrorActionPreference='Stop'; @(Get-CimInstance Win32_Process -Filter \"Name = 'PBudgetManager.exe'\" | Select-Object ExecutablePath,ProcessId) | ConvertTo-Json -Compress",
    ], capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=20,
        creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    if result.returncode:
        raise RuntimeError('Cannot check running programs. Close the old EXE and retry with process-query permission.')
    records = json.loads(result.stdout or '[]') or []
    if isinstance(records, dict):
        records = [records]
    for record in records:
        if record.get('ProcessId') == os.getpid():
            continue
        value = record.get('ExecutablePath')
        if not value or Path(value).resolve() == current / 'PBudgetManager.exe':
            raise RuntimeError('Close the old PBudgetManager.exe (including its server window), then run the update again.')


def no_links(folder):
    if folder.is_symlink() or folder.is_junction():
        raise ValueError('Update folders must not contain symbolic links or junctions')
    for parent, directories, files in os.walk(folder, followlinks=False):
        for name in directories + files:
            path = Path(parent) / name
            if path.is_symlink() or path.is_junction():
                raise ValueError('Update folders must not contain symbolic links or junctions')


def prepare_update(bundle, current):
    bundle, current = Path(bundle).resolve(), Path(current).resolve()
    if os.environ.get('P_BUDGET_DB'):
        raise ValueError('Custom P_BUDGET_DB is set. Keep using that database with the new EXE; this helper is for data/master.db installations.')
    if bundle == current or bundle.is_relative_to(current) or current.is_relative_to(bundle):
        raise ValueError('Extract the new release into a separate folder outside the old application folder')
    for folder in (bundle, current):
        if not (folder / 'PBudgetManager.exe').is_file():
            raise ValueError(f'Application EXE not found: {folder}')
        no_links(folder)
    if not (bundle / 'nine-box-app/index.html').is_file() or not (bundle / 'migrations').is_dir():
        raise ValueError('The new release is incomplete; copy the complete release folder')
    database = current / 'data/master.db'
    if not database.is_file():
        raise ValueError('No data/master.db in the old folder. Choose the folder actually used by the old EXE.')
    assert_closed(current)
    stamp = datetime.now().strftime('%Y%m%d-%H%M%S') + '-' + uuid4().hex[:8]
    backup = retained_backup(database)
    destination = current.parent / f'PBudgetManager-Updated-{stamp}'
    destination.mkdir(exist_ok=False)
    marker = destination / 'UPDATE-INCOMPLETE.txt'
    marker.write_text('Update is incomplete. Continue using the original application folder.', encoding='utf-8')
    # Copy into a new folder; the old program and live database are never overwritten.
    for item in bundle.iterdir():
        if item.name.lower() in {'data', 'pbudgetmanager.exe', 'update-incomplete.txt'}:
            continue
        target = destination / item.name
        if item.is_dir():
            shutil.copytree(item, target)
        else:
            shutil.copy2(item, target)
    def omit_live_database(folder, names):
        return [name for name in names if Path(folder).resolve() == database.parent and name in {'master.db','master.db-wal','master.db-shm'}]
    shutil.copytree(database.parent, destination / 'data', ignore=omit_live_database)
    shutil.copy2(backup, destination / 'data/master.db')
    result = dict(applicationFolder=str(destination), databasePath=str(destination/'data/master.db'),
                  backupPath=str(backup), previousFolder=str(current))
    (destination/'update-result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    # Publish the executable last. Failed copies never provide a runnable new EXE.
    pending_exe = destination/'PBudgetManager.exe.pending'
    shutil.copy2(bundle/'PBudgetManager.exe', pending_exe)
    pending_exe.rename(destination/'PBudgetManager.exe')
    marker.unlink()
    return result




