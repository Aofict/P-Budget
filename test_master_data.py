import tempfile
import sqlite3
from contextlib import closing
import unittest
from pathlib import Path

from server import create_app


class MasterDataTests(unittest.TestCase):
    def test_foreign_loan_is_independent_on_new_and_upgraded_databases(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'master.db'
            client = create_app(path).test_client()
            funds = client.get('/api/masters').json['funding-sources']
            foreign = next(item for item in funds if item['id'] == 'foreign-loan')
            self.assertIsNone(foreign['parent_id'])
            with closing(sqlite3.connect(path)) as connection, connection:
                connection.execute("UPDATE funding_sources SET parent_id='domestic-loan' WHERE id='foreign-loan'")
                connection.execute('DELETE FROM schema_migrations WHERE version=10')
            client = create_app(path).test_client()
            funds = client.get('/api/masters').json['funding-sources']
            foreign = next(item for item in funds if item['id'] == 'foreign-loan')
            self.assertIsNone(foreign['parent_id'])
            for item in funds:
                if item['id'] in ('oh', 'idc'):
                    self.assertEqual(item['parent_id'], 'pea-revenue')

    def test_shared_validation_and_status_terminal_flag(self):
        with tempfile.TemporaryDirectory() as directory:
            client = create_app(Path(directory) / "master.db").test_client()
            for kind in ("statuses", "project-types", "fiscal-years"):
                code = "2580" if kind == "fiscal-years" else "SPECIAL"
                data = {"code": code, "name": "รายการทดสอบ", "active": True,
                        "is_terminal": kind == "statuses"}
                invalid = client.post(f"/api/masters/{kind}", json=data | {"active": 1})
                self.assertEqual(invalid.status_code, 400, invalid.json)
                invalid = client.post(f"/api/masters/{kind}", json=data | {"code": "bad code"})
                self.assertEqual(invalid.status_code, 400, invalid.json)
                added = client.post(f"/api/masters/{kind}", json=data)
                self.assertEqual(added.status_code, 201, added.json)
                if kind == "statuses":
                    self.assertTrue(added.json["is_terminal"])
                    updated = client.put(f"/api/masters/{kind}/{added.json['id']}",
                        json=data | {"version": added.json["version"], "is_terminal": False})
                    self.assertEqual(updated.status_code, 200, updated.json)
                    self.assertFalse(updated.json["is_terminal"])
                if kind == "fiscal-years":
                    self.assertEqual(added.json["name"], "ปีงบประมาณ 2580")

            exported = client.get("/api/backup").json
            target = create_app(Path(directory) / "target.db").test_client()
            restored = target.post("/api/import", json=exported)
            self.assertEqual(restored.status_code, 200, restored.json)
            exported["masters"]["fiscal-years"][-1]["name"] = "ชื่อปีไม่ตรง"
            rejected = target.post("/api/import", json=exported)
            self.assertEqual(rejected.status_code, 400, rejected.json)


if __name__ == "__main__":
    unittest.main()
