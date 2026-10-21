from copy import deepcopy
from contextlib import closing
from pathlib import Path
import json
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from server import create_app


class NineBoxTests(unittest.TestCase):
    def setUp(self):
        root = Path(__file__).parent / '.test-data'
        root.mkdir(exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=root)
        self.path = Path(self.temp.name) / 'test.db'
        self.client = create_app(self.path).test_client()
        self.data = {'2569': [dict(id='legacy_1', name='Legacy project', code='L1', endYear=2570,
            items=[dict(source='เงินกู้ในประเทศ', bComm=5, bInv=2, tComm=1, tInv=0)])]}

    def tearDown(self):
        self.temp.cleanup()

    def save(self, data=None, version=0, importing=False):
        return self.client.open('/api/nine-box/import' if importing else '/api/nine-box',
            method='POST' if importing else 'PUT', json=dict(yearsData=self.data if data is None else data,
                currentYear='2569', version=version))

    def test_persistence_conflict_and_database_backup(self):
        self.assertEqual(self.save().status_code, 200)
        self.assertEqual(create_app(self.path).test_client().get('/api/nine-box').json['yearsData'], self.data)
        self.assertEqual(self.save(version=0).status_code, 409)
        target = Path(self.temp.name) / 'backup.db'
        target.write_bytes(self.client.get('/api/backup/database').data)
        with closing(sqlite3.connect(target)) as conn:
            self.assertEqual(json.loads(conn.execute('SELECT data_json FROM nine_box_state').fetchone()[0]), self.data)

    def test_import_preview_does_not_write_and_import_replaces_without_backup(self):
        self.save()
        replacement = {'2569': []}
        preview = self.client.post('/api/nine-box/import/preview', json={'yearsData': replacement})
        self.assertEqual(preview.json['projects'], 0)
        self.assertEqual(self.client.get('/api/nine-box').json['yearsData'], self.data)
        self.assertEqual(self.client.get('/api/nine-box/backups').json, [])
        result = self.save(replacement, version=1, importing=True)
        self.assertEqual(result.status_code, 200, result.json)
        self.assertIsNone(result.json['backupId'])
        self.assertEqual(self.client.get('/api/nine-box').json['yearsData'], replacement)
        self.assertEqual(self.client.get('/api/nine-box/backups').json, [])
        self.assertEqual(self.save(self.data, version=2, importing=True).status_code, 200)
        target = Path(self.temp.name) / 'backup.db'
        target.write_bytes(self.client.get('/api/backup/database').data)
        restored = create_app(target).test_client()
        self.assertEqual(restored.get('/api/nine-box').json['yearsData'], self.data)
        self.assertEqual(restored.get('/api/nine-box/backups').json, [])

    def test_invalid_imports_and_conflicts_never_replace_or_add_backup(self):
        self.save()
        bad_projects = [None, {}, dict(name='test',items='bad'), dict(name='test',items=[None])]
        bad_data = [None, [], {}, {'invalid': []}, {'2569': {}}, *({'2569': [p]} for p in bad_projects)]
        for value in (True, '12', float('inf'), float('nan')):
            data = deepcopy(self.data)
            data['2569'][0]['items'][0]['bComm'] = value
            bad_data.append(data)
        duplicate = deepcopy(self.data)
        duplicate['2569'] *= 2
        bad_data.append(duplicate)
        for data in bad_data:
            with self.subTest(data=data):
                result = self.client.post('/api/nine-box/import', json={'yearsData': data, 'version': 1})
                self.assertEqual(result.status_code, 400, result.json)
        self.assertEqual(self.save(version=0, importing=True).status_code, 409)
        self.assertEqual(self.client.get('/api/nine-box').json['yearsData'], self.data)
        self.assertEqual(self.client.get('/api/nine-box/backups').json, [])

    def test_legacy_source_alias_and_optional_fields_preserved(self):
        data = deepcopy(self.data)
        data['2569'][0]['items'][0]['source'] = 'เงินรายได้ กฟก.'
        data['2569'][0]['customNote'] = 'keep legacy data'
        result = self.save(data, importing=True)
        self.assertEqual(result.status_code, 200, result.json)
        project = self.client.get('/api/nine-box').json['yearsData']['2569'][0]
        self.assertEqual(project['items'][0]['source'], 'เงินรายได้ กฟภ.')
        self.assertEqual(project['customNote'], 'keep legacy data')

    def test_upgrade_preserves_existing_master_database(self):
        response = self.client.post('/api/projects', json=dict(name='Existing project',
            statusId='pending-approval', progress=0, finances=dict(loan=1, revenue=2)))
        self.assertEqual(response.status_code, 201, response.json)
        project = response.json
        # Simulate the previously released schema, then upgrade it twice.
        with closing(sqlite3.connect(self.path)) as conn, conn:
            conn.execute('DROP TABLE nine_box_state')
            conn.execute('DROP TABLE nine_box_backups')
            conn.execute('DELETE FROM schema_migrations WHERE version=6')
        for _ in range(2):
            client = create_app(self.path).test_client()
            self.assertEqual(client.get('/api/projects/' + project['id']).json, project)
            self.assertEqual(client.get('/api/bootstrap').json['schemaVersion'], 6)
            self.assertEqual(client.get('/api/nine-box').json['version'], 0)

    def test_suggested_year_uses_bangkok_date_but_saved_year_never_changes(self):
        with patch('server.now', return_value='2026-12-31T18:00:00+00:00'):
            client = create_app(self.path).test_client()
            suggested = client.get('/api/nine-box').json
            self.assertEqual(suggested['currentYear'], '2570')
            self.assertEqual(suggested['version'], 0)
            self.assertEqual(suggested['yearsData'], {'2570': []})
            response = client.put('/api/nine-box', json=dict(yearsData={'2568': []}, currentYear='2568', version=0))
            self.assertEqual(response.status_code, 200, response.json)
        with patch('server.now', return_value='2030-01-01T00:00:00+00:00'):
            saved = create_app(self.path).test_client().get('/api/nine-box').json
            self.assertEqual(saved['currentYear'], '2568')
            self.assertEqual(saved['yearsData'], {'2568': []})

    def test_start_year_validation_and_two_window_conflict(self):
        for year in ('2499', '2701', '2569.5', ''):
            result = self.client.put('/api/nine-box', json=dict(yearsData={year: []}, currentYear=year, version=0))
            self.assertEqual(result.status_code, 400, result.json)
            self.assertEqual(self.client.get('/api/nine-box').json['version'], 0)
        for index, year in enumerate(('2500', '2700')):
            result = self.client.put('/api/nine-box', json=dict(yearsData={year: []}, currentYear=year, version=index))
            self.assertEqual(result.status_code, 200, result.json)
        result = self.client.put('/api/nine-box', json=dict(yearsData={'2569': []}, currentYear='2569', version=0))
        self.assertEqual(result.status_code, 409)
        self.assertEqual(self.client.get('/api/nine-box').json['currentYear'], '2700')


if __name__ == '__main__':
    unittest.main()
