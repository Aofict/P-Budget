import sqlite3
from pathlib import Path
from datetime import datetime, timezone

DB = Path(__file__).resolve().parent / "data" / "master.db"

STATUSES = [
    (
        "feasibility-study",
        "FEASIBILITY_STUDY",
        "อยู่ระหว่างศึกษาความเหมาะสมของโครงการ",
        0,
    ),
    (
        "pea-board-review",
        "PEA_BOARD_REVIEW",
        "อยู่ระหว่างนำเสนอคณะกรรมการ กฟภ.",
        0,
    ),
    (
        "agency-opinion",
        "AGENCY_OPINION",
        "อยู่ระหว่างขอความเห็นจากหน่วยงานต่างๆ เพื่อประกอบขอความเห็นชอบจาก ครม.",
        0,
    ),
    ("approved", "APPROVED", "ได้รับอนุมัติแล้ว", 0),
    ("in-progress", "IN_PROGRESS", "กำลังดำเนินการ", 0),
    ("completed", "COMPLETED", "เสร็จสิ้น", 1),
    ("other", "OTHER", "อื่นๆ", 0),
]

stamp = datetime.now(timezone.utc).isoformat()

with sqlite3.connect(DB) as db:
    # ปิดสถานะเดิมที่ไม่อยู่ในชุดใหม่
    new_ids = [row[0] for row in STATUSES]

    placeholders = ",".join("?" for _ in new_ids)

    db.execute(
        f"""
        UPDATE project_statuses
        SET active = 0, updated_at = ?
        WHERE id NOT IN ({placeholders})
        """,
        [stamp, *new_ids],
    )

    # เพิ่มหรืออัปเดตสถานะใหม่
    for status_id, code, name, terminal in STATUSES:
        exists = db.execute(
            "SELECT 1 FROM project_statuses WHERE id = ?",
            (status_id,),
        ).fetchone()

        if exists:
            db.execute(
                """
                UPDATE project_statuses
                SET name = ?,
                    active = 1,
                    is_terminal = ?,
                    updated_at = ?,
                    version = version + 1
                WHERE id = ?
                """,
                (name, terminal, stamp, status_id),
            )
        else:
            db.execute(
                """
                INSERT INTO project_statuses
                    (id, code, name, active, is_terminal,
                     version, created_at, updated_at)
                VALUES (?, ?, ?, 1, ?, 1, ?, ?)
                """,
                (status_id, code, name, terminal, stamp, stamp),
            )

    db.commit()

print("อัปเดตสถานะโครงการเรียบร้อย")
