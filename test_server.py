"""API/integrity tests use isolated databases, never data/master.db."""
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from pathlib import Path
import json
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from server import create_app, current_year


class MasterDatabaseTests(unittest.TestCase):
    def setUp(self):
        test_root = Path(__file__).parent / '.test-data'
        test_root.mkdir(exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=test_root)
        self.db = Path(self.temp.name) / 'test.db'
        self.app = create_app(self.db)
        self.app.config['TESTING'] = True
        self.client = self.app.test_client()
        self.payload = dict(name='โครงการทดสอบ', fundId='domestic-loan', statusId='started', budget='12.345', spent='0.123', progress=1)

    def tearDown(self):
        self.temp.cleanup()

    def create(self, **overrides):
        response = self.client.post('/api/projects', json=self.payload | overrides)
        self.assertEqual(response.status_code, 201, response.json)
        return response.json

    def test_empty_database_and_master_references(self):
        data = self.client.get('/api/bootstrap').json
        self.assertEqual(data['projects'], [])
        self.assertEqual(len(data['masters']['funding-sources']), 5)
        self.assertEqual(len(data['masters']['statuses']), 4)
        self.assertEqual(self.client.get('/data/master.db').status_code, 404)
        self.assertEqual(self.client.get('/server.py').status_code, 404)

    def test_running_code_immutable_delete_and_restart(self):
        p = self.create()
        self.assertEqual(p['code'], f'PRJ-{current_year()}-00001')
        self.assertEqual(self.client.put(f"/api/projects/{p['id']}", json=self.payload | dict(code='BAD', version=1)).status_code, 400)
        updated = self.client.put(f"/api/projects/{p['id']}", json=self.payload | dict(name='แก้ไข', version=1)).json
        self.assertEqual(updated['code'], p['code'])
        self.assertEqual(updated['version'], 2)
        self.assertEqual(self.client.delete(f"/api/projects/{p['id']}", json={'version': 2}).status_code, 200)
        new_client = create_app(self.db).test_client()
        p2 = new_client.post('/api/projects', json=self.payload).json
        self.assertEqual(p2['code'], f'PRJ-{current_year()}-00002')
        history = new_client.get(f"/api/projects/{p['id']}/history").json['events']
        self.assertEqual([event['action'] for event in history], ['create', 'update', 'delete'])
        self.assertEqual(new_client.get(f"/api/projects/{p['id']}").status_code, 404)

    def test_concurrent_creation_unique_codes(self):
        def add(index):
            with self.app.test_client() as client:
                result = client.post('/api/projects', json=self.payload | {'name': f'Project {index}'})
                return result.status_code, result.json
        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(add, range(24)))
        self.assertTrue(all(code == 201 for code, _ in results), results)
        codes = [data['code'] for _, data in results]
        self.assertEqual(len(set(codes)), 24)
        self.assertEqual(sorted(int(code.rsplit('-', 1)[1]) for code in codes), list(range(1, 25)))

    def test_year_rollover(self):
        with patch('server.current_year', return_value=2569):
            p1 = self.create()
        with patch('server.current_year', return_value=2570):
            p2 = self.create()
        self.assertEqual(p1['code'], 'PRJ-2569-00001')
        self.assertEqual(p2['code'], 'PRJ-2570-00001')

    def test_validation_rollback_and_exact_money(self):
        for invalid in [{'budget': 0}, {'spent': 20}, {'budget': 'NaN'}, {'progress': 'Infinity'},
                        {'fundId': 'missing'}, {'statusId': []}, {'budget': True}, {'budget': '0.0001'},
                        {'name': ' '}, {'name': []}, {'code': 'MANUAL'}]:
            with self.subTest(invalid=invalid):
                result = self.client.post('/api/projects', json=self.payload | invalid)
                self.assertEqual(result.status_code, 400, result.json)
        p = self.create()
        self.assertTrue(p['code'].endswith('00001'))
        with closing(sqlite3.connect(self.db)) as db, db:
            self.assertEqual(db.execute('SELECT budget_baht,spent_baht FROM projects').fetchone(), (12345000, 123000))
            with self.assertRaises(sqlite3.IntegrityError):
                db.execute("UPDATE projects SET code='CHANGED'")

    def test_stale_update_and_delete(self):
        p = self.create()
        url = f"/api/projects/{p['id']}"
        self.assertEqual(self.client.put(url, json=self.payload | {'version': 1, 'name': 'Updated'}).status_code, 200)
        self.assertEqual(self.client.put(url, json=self.payload | {'version': 1}).status_code, 409)
        self.assertEqual(self.client.delete(url, json={'version': 1}).status_code, 409)
        self.assertEqual(self.client.get(url).json['name'], 'Updated')

    def test_master_create_rename_deactivate_and_keep_existing(self):
        result = self.client.post('/api/masters/statuses', json={'code': 'NEW', 'name': 'ทุนใหม่'})
        self.assertEqual(result.status_code, 201)
        fund = result.json
        p = self.create(statusId=fund['id'])
        url = f"/api/masters/statuses/{fund['id']}"
        result = self.client.put(url, json=fund | {'name': 'ทุนปรับชื่อ', 'active': False})
        self.assertEqual(result.status_code, 200)
        self.assertEqual(self.client.get(f"/api/projects/{p['id']}").json['status'], 'ทุนปรับชื่อ')
        self.assertEqual(self.client.post('/api/projects', json=self.payload | {'statusId': fund['id']}).status_code, 400)
        self.assertEqual(self.client.put(f"/api/projects/{p['id']}", json=self.payload | {'statusId': fund['id'], 'version': 1}).status_code, 200)
        self.assertEqual(self.client.put(url, json=fund).status_code, 409)

    def test_legacy_import_idempotency_conflict_and_counter(self):
        legacy = dict(id='legacy-1', code=f'PRJ-{current_year()}-00100', name='เดิม', fund='เงินกู้ในประเทศ', status='เริ่มดำเนินการ', budget=1, spent=0, progress=0)
        result = self.client.post('/api/import', json=[legacy])
        self.assertEqual(result.status_code, 200, result.json)
        self.assertEqual(result.json['imported'], 1)
        self.assertEqual(self.client.post('/api/import', json=[legacy]).json['skipped'], 1)
        conflict = self.client.post('/api/import', json=[legacy | {'code': 'NEW', 'id': 'legacy-2'}, legacy | {'budget': 2}])
        self.assertEqual(conflict.status_code, 409)
        self.assertEqual(len(self.client.get('/api/projects').json['projects']), 1)
        self.assertTrue(self.create()['code'].endswith('00101'))

    def test_backup_restore_custom_masters_and_database_snapshot(self):
        fund = self.client.post('/api/masters/statuses', json={'code': 'SPECIAL', 'name': 'ทุนพิเศษ'}).json
        p = self.create(statusId=fund['id'])
        exported = self.client.get('/api/backup').json
        other = create_app(Path(self.temp.name) / 'restored.db').test_client()
        result = other.post('/api/import', json=exported)
        self.assertEqual(result.status_code, 200, result.json)
        restored = other.get(f"/api/projects/{p['id']}").json
        self.assertEqual((restored['code'], restored['status'], restored['budget']), (p['code'], p['status'], p['budget']))
        self.assertEqual(other.post('/api/import', json=exported).json['skipped'], 1)
        self.client.delete(f"/api/projects/{p['id']}", json={'version': 1})
        snapshot = self.client.get('/api/backup/database')
        self.assertEqual(snapshot.status_code, 200)
        snapshot_path = Path(self.temp.name) / 'snapshot.db'
        snapshot_path.write_bytes(snapshot.data)
        with closing(sqlite3.connect(snapshot_path)) as db:
            self.assertEqual(db.execute('PRAGMA integrity_check').fetchone()[0], 'ok')
            self.assertIsNotNone(db.execute('SELECT deleted_at FROM projects').fetchone()[0])
            self.assertEqual(db.execute('SELECT last_number FROM project_sequences').fetchone()[0], 1)
            self.assertEqual(db.execute('SELECT COUNT(*) FROM project_events').fetchone()[0], 2)

    def test_cross_origin_write_rejected(self):
        result = self.client.post('/api/projects', json=self.payload, headers={'Origin': 'https://other.example'})
        self.assertEqual(result.status_code, 403)

    def test_funding_hierarchy_and_import(self):
        sources = self.client.get('/api/masters').json['funding-sources']
        self.assertEqual([f['name'] for f in sources if f['active'] and not f['parent_id']], ['เงินกู้', 'เงินรายได้'])
        for child in ['oh', 'idc']:
            p = self.create(fundId=child)
            self.assertEqual(p['fundingSourceId'], 'pea-revenue')
            self.assertEqual(p['fund'], 'เงินรายได้')
            self.assertEqual(p['fundComponent'], child.upper())
        self.assertEqual(self.client.post('/api/projects', json=self.payload | {'fundId':'land'}).status_code, 400)
        self.assertEqual(self.client.post('/api/masters/funding-sources', json={'code':'OTHER','name':'Other'}).status_code, 400)
        legacy = dict(id='old-oh',code='OLD-OH',name='Old OH',fund='OH',status='เริ่มดำเนินการ',budget=2,spent=0,progress=0)
        self.assertEqual(self.client.post('/api/import', json=[legacy]).status_code, 200)
        self.assertEqual(self.client.get('/api/projects/old-oh').json['fundingSourceId'], 'pea-revenue')
        export = self.client.get('/api/backup').json
        other = create_app(Path(self.temp.name)/'hierarchy.db').test_client()
        self.assertEqual(other.post('/api/import', json=export).status_code, 200)
        self.assertEqual(other.get('/api/projects/old-oh').json['fundComponent'], 'OH')

    def test_v1_migration_preserves_existing_projects(self):
        from server import DEFAULT_FUNDS, DEFAULT_STATUSES, now, ROOT
        path = Path(self.temp.name)/'v1.db'
        with closing(sqlite3.connect(path)) as db, db:
            db.executescript((ROOT/'migrations/001_master.sql').read_text(encoding='utf-8'))
            stamp = now()
            db.executemany('INSERT INTO funding_sources(id,code,name,created_at,updated_at) VALUES(?,?,?,?,?)', [(i,c,n,stamp,stamp) for i,c,n in DEFAULT_FUNDS])
            db.executemany('INSERT INTO project_statuses(id,code,name,is_terminal,created_at,updated_at) VALUES(?,?,?,?,?,?)', [(i,c,n,t,stamp,stamp) for i,c,n,t in DEFAULT_STATUSES])
            db.execute('INSERT INTO schema_migrations VALUES(1,?)',(stamp,))
            db.execute("INSERT INTO projects(id,code,name,funding_source_id,status_id,budget_baht,spent_baht,progress,created_at,updated_at) VALUES('old','OLD','old','oh','started',5000000,2000000,40,?,?)",(stamp,stamp))
        migrated = create_app(path).test_client().get('/api/projects/old').json
        self.assertEqual((migrated['id'],migrated['code'],migrated['budget'],migrated['spent']),('old','OLD',5,2))
        self.assertEqual((migrated['fund'],migrated['fundComponent']),('เงินรายได้','OH'))


if __name__ == '__main__':
    unittest.main()
