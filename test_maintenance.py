from contextlib import closing
import json
import os
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

import maintenance
from server import create_app


class MaintenanceTests(unittest.TestCase):
    def setUp(self):
        root = Path(__file__).parent / '.test-data'
        root.mkdir(exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=root)
        self.root = Path(self.temp.name).resolve()
        self.database = self.root / 'data/master.db'
        self.client = create_app(self.database).test_client()
        self.client.post('/api/nine-box/import', json=dict(yearsData={'2569': []}, currentYear='2569', version=0))

    def tearDown(self):
        self.temp.cleanup()

    def test_daily_snapshot_includes_committed_wal_and_is_not_overwritten(self):
        with closing(sqlite3.connect(self.database)) as writer:
            writer.execute('CREATE TABLE wal_probe (value TEXT)')
            writer.execute("INSERT INTO wal_probe VALUES('committed in WAL')")
            writer.commit()
            self.assertTrue(Path(str(self.database) + '-wal').exists())
            backup = maintenance.auto_backup(self.database, 6)
            with closing(sqlite3.connect(backup)) as saved:
                self.assertEqual(saved.execute('SELECT value FROM wal_probe').fetchone()[0], 'committed in WAL')
                self.assertEqual(saved.execute('PRAGMA integrity_check').fetchone()[0], 'ok')
            content = backup.read_bytes()
            writer.execute("UPDATE wal_probe SET value='later change'")
            writer.commit()
            self.assertEqual(maintenance.auto_backup(self.database, 6), backup)
            self.assertEqual(backup.read_bytes(), content)

    def test_pre_upgrade_snapshot_and_abort_if_backup_fails(self):
        with closing(sqlite3.connect(self.database)) as conn, conn:
            conn.execute('DROP TABLE nine_box_state')
            conn.execute('DROP TABLE nine_box_backups')
            conn.execute('DELETE FROM schema_migrations WHERE version=6')
        with patch.object(maintenance, 'snapshot', side_effect=OSError('Disk full')):
            with self.assertRaises(OSError):
                create_app(self.database)
        with closing(sqlite3.connect(self.database)) as conn:
            self.assertEqual(conn.execute('SELECT MAX(version) FROM schema_migrations').fetchone()[0], 5)
        create_app(self.database)
        backups = list((self.database.parent / 'backups').glob('*before-upgrade*.db'))
        self.assertEqual(len(backups), 1)
        with closing(sqlite3.connect(backups[0])) as conn:
            self.assertEqual(conn.execute('SELECT MAX(version) FROM schema_migrations').fetchone()[0], 5)

    def test_reject_newer_schema_and_existing_backup_destination(self):
        with closing(sqlite3.connect(self.database)) as conn, conn:
            conn.execute("INSERT INTO schema_migrations VALUES(99,'future')")
        with self.assertRaises(RuntimeError):
            create_app(self.database)
        target = self.root / 'existing.db'
        target.write_bytes(b'keep')
        with self.assertRaises(ValueError):
            maintenance.snapshot(self.database, target)
        self.assertEqual(target.read_bytes(), b'keep')

    def test_settings_reports_actual_paths_and_latest_backup(self):
        info = self.client.get('/api/storage-info').json
        self.assertEqual(info['databasePath'], str(self.database))
        self.assertIsNone(info['latestBackup'])
        backup = maintenance.auto_backup(self.database, 6)
        info = self.client.get('/api/storage-info').json
        self.assertEqual(info['latestBackup']['path'], str(backup))

    def prepare_fixture(self):
        current = self.root / 'old'
        current.mkdir()
        (current/'PBudgetManager.exe').write_bytes(b'old executable')
        (current/'data').mkdir()
        maintenance.snapshot(self.database, current/'data/master.db')
        (current/'data/notes.txt').write_text('user auxiliary file')
        bundle = self.root / 'release'
        (bundle/'nine-box-app').mkdir(parents=True)
        (bundle/'migrations').mkdir()
        (bundle/'nine-box-app/index.html').write_text('new page')
        (bundle/'PBudgetManager.exe').write_bytes(b'new executable')
        (bundle/'data').mkdir()
        (bundle/'data/master.db').write_bytes(b'do not use release database')
        return bundle, current

    def test_update_keeps_old_files_and_copies_database_to_new_folder(self):
        bundle, current = self.prepare_fixture()
        with patch.dict(os.environ), patch.object(maintenance, 'assert_closed'):
            os.environ.pop('P_BUDGET_DB', None)
            result = maintenance.prepare_update(bundle, current)
        destination = Path(result['applicationFolder'])
        self.assertNotEqual(destination, current)
        self.assertEqual((current/'PBudgetManager.exe').read_bytes(), b'old executable')
        self.assertEqual((destination/'PBudgetManager.exe').read_bytes(), b'new executable')
        self.assertEqual((destination/'data/notes.txt').read_text(), 'user auxiliary file')
        restored = create_app(destination/'data/master.db').test_client()
        self.assertEqual(restored.get('/api/nine-box').json['currentYear'], '2569')
        self.assertTrue(Path(result['backupPath']).is_file())
        self.assertFalse((destination/'UPDATE-INCOMPLETE.txt').exists())

    def test_running_copy_and_failed_copy_do_not_publish_update(self):
        bundle, current = self.prepare_fixture()
        with patch.dict(os.environ):
            os.environ.pop('P_BUDGET_DB', None)
            with patch.object(maintenance, 'assert_closed', side_effect=RuntimeError('running')):
                with self.assertRaises(RuntimeError):
                    maintenance.prepare_update(bundle, current)
            self.assertEqual(list(self.root.glob('PBudgetManager-Updated-*')), [])
            with patch.object(maintenance, 'assert_closed'), patch.object(maintenance.shutil, 'copytree', side_effect=OSError('copy failed')):
                with self.assertRaises(OSError):
                    maintenance.prepare_update(bundle, current)
        destination = next(self.root.glob('PBudgetManager-Updated-*'))
        self.assertTrue((destination/'UPDATE-INCOMPLETE.txt').exists())
        self.assertFalse((destination/'PBudgetManager.exe').exists())
        self.assertEqual((current/'PBudgetManager.exe').read_bytes(), b'old executable')


if __name__ == '__main__':
    unittest.main()
