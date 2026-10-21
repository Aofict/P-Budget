import tempfile
import unittest
from pathlib import Path

from server import create_app


class ProjectTypeMasterTests(unittest.TestCase):
    def test_custom_type_is_selectable_and_survives_export_import(self):
        with tempfile.TemporaryDirectory() as directory:
            source = create_app(Path(directory) / "source.db").test_client()
            types = source.get("/api/masters").json["project-types"]
            self.assertEqual([item["id"] for item in types], ["continuing", "new"])

            added = source.post("/api/masters/project-types", json={
                "code": "PILOT", "name": "โครงการนำร่อง", "active": True,
            })
            self.assertEqual(added.status_code, 201, added.json)
            type_id = added.json["id"]
            project = source.post("/api/projects", json={
                "name": "โครงการทดสอบ", "statusId": "in-progress", "progress": 0,
                "finances": {"loan": 1, "revenue": 0},
                "details": {"projectType": type_id},
            })
            self.assertEqual(project.status_code, 201, project.json)
            self.assertEqual(project.json["details"]["projectType"], type_id)

            disabled = source.put(f"/api/masters/project-types/{type_id}", json={
                "code": "PILOT", "name": "โครงการนำร่อง", "active": False,
                "version": added.json["version"],
            })
            self.assertEqual(disabled.status_code, 200, disabled.json)
            new_project = source.post("/api/projects", json={
                "name": "โครงการใหม่อีกหนึ่ง", "statusId": "in-progress", "progress": 0,
                "finances": {"loan": 1, "revenue": 0},
                "details": {"projectType": type_id},
            })
            self.assertEqual(new_project.status_code, 400, new_project.json)
            unchanged = source.put(f"/api/projects/{project.json['id']}", json={
                "name": "โครงการทดสอบ", "statusId": "in-progress", "progress": 0,
                "finances": {"loan": 1, "revenue": 0},
                "details": {"projectType": type_id}, "version": project.json["version"],
            })
            self.assertEqual(unchanged.status_code, 200, unchanged.json)

            exported = source.get("/api/backup").json
            target = create_app(Path(directory) / "target.db").test_client()
            imported = target.post("/api/import", json=exported)
            self.assertEqual(imported.status_code, 200, imported.json)
            restored = target.get("/api/projects").json["projects"][0]
            restored_types = target.get("/api/masters").json["project-types"]
            restored_type = next(item for item in restored_types if item["code"] == "PILOT")
            self.assertEqual(restored["details"]["projectType"], restored_type["id"])


if __name__ == "__main__":
    unittest.main()
