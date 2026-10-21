"""Round-scoped adapter for the supplied MeetingBudget application.

Master project identity remains linked to the existing tables, but MeetingBudget
uses only project identity, name and short name from the Master snapshot. All other project fields
are round-scoped Meeting data and can be edited independently. Annual plans,
detailed changes and Excel workflow are revisioned documents per entry. Summary
formulas intentionally match the supplied application (annual new investment, not
whole-project funding or carry-in commitments).
"""

from copy import deepcopy
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path
import io
import json
import math
import zipfile

from flask import jsonify, request, send_file, send_from_directory

ROOT = Path(__file__).resolve().parent
BUDGET_FIELDS = (
    "committed",
    "investment_set",
    "investment_set_post",
    "investment_change_before",
    "investment_change",
    "disbursement_target",
    "disbursement_target_post",
    "next_year_uncommitted",
    "cabinet_target",
    "high_target",
)
GROUPS = ("continuing_budget", "continuing_no_budget", "new_project")
FUND_KEYS = tuple(
    f"{stage}_{kind}_{source}"
    for stage in ("pre", "post")
    for kind in ("budget", "target")
    for source in ("loan", "revenue")
)


def cycle(year):
    return dict(
        meeting_year=year,
        plan_years=list(range(year, year + 7)),
        change_budget_year=year + 1,
        set_budget_year=year + 2,
    )


def default_document(project, year):
    # จาก Master DB ใช้เฉพาะรหัสภายในและชื่อโครงการ
    # ข้อมูลอื่นเป็นข้อมูลของรอบประชุม ให้ผู้ใช้กรอกเอง
    return dict(
        id=project["code"],
        name=project["name"],
        short_name=(project.get("details") or {}).get("shortName", ""),
        owner="",
        owner_department="",
        owner_division="",
        description="",
        area="",
        timeline="",
        # ค่าเริ่มต้นของระบบ ไม่ได้ดึงจาก Master DB
        status="อยู่ระหว่างขออนุมัติ",
        project_stage="",
        project_type="",
        approval_date="",
        loan_total=0,
        revenue_total=0,
        oh_total=0,
        idc_total=0,
        estimated_return="",
        work_volume="",
        meeting_year=year,
        budget={},
        detailBudget={"setBudget": [], "changeBudget": []},
        workflow={},
    )


def document_for(row, year):
    p = json.loads(row["snapshot_json"])
    result = default_document(p, year)
    result.update(json.loads(row["workspace_json"]))
    result.update(
        id=p["code"],
        name=p["name"],
        short_name=result.get("short_name", (p.get("details") or {}).get("shortName", "")),
        meeting_year=year,
        version=row["version"],
        master_project_id=row["project_id"],
    )
    return result


def summary_row(doc, meta, year):
    b = doc.get("budget", {}).get(str(year), {})
    v = lambda key: Decimal(str(b.get(key) or 0))
    base, pre_change, change = (
        v("investment_set"),
        v("investment_change_before"),
        v("investment_change"),
    )
    before = v("disbursement_target")
    base_after = v("investment_set_post")
    after = before if b.get("disbursement_target_post") is None else v("disbursement_target_post")
    result = dict(
        code=doc["id"],
        name=doc["name"],
        owner=doc.get("owner", ""),
        responsible_unit=doc.get("owner_department", ""),
    )
    result.update(
        {
            k: float(v)
            for k, v in dict(
                budget_before=base,
                committed=v("committed"),
                investment_set_before=base,
                investment_set_after=base_after,
                operating_budget_before=v("committed") + base + pre_change,
                operating_budget_after=v("committed") + base_after + change,
                budget_change_before=pre_change,
                budget_change=change + base_after - base,
                budget_change_delta=change - pre_change,
                budget_change_after=change,
                budget_after=base_after + change,
                budget_total_after_change_year=base_after + change,
                cabinet_target=v("cabinet_target"),
                disbursement_before=before,
                disbursement_change=after - before,
                disbursement_after=after,
                disbursement_vs_cabinet=after - v("cabinet_target"),
                disbursement_target=before,
                disbursement_target_post=after,
            ).items()
        }
    )
    return result


def validate_document(data, old, year, error):
    if not isinstance(data, dict):
        raise error("รูปแบบข้อมูลโครงการไม่ถูกต้อง")

    # Bound JSON size/depth and reject non-finite numbers anywhere, including Excel rows.
    def safe(value, depth=0):
        if depth > 12:
            raise error("ข้อมูลซ้อนกันมากเกินไป")
        if isinstance(value, float) and not math.isfinite(value):
            raise error("ตัวเลขต้องเป็นค่าที่คำนวณได้")
        if isinstance(value, str) and len(value) > 32000:
            raise error("ข้อความยาวเกินไป")
        if isinstance(value, list):
            if len(value) > 2000:
                raise error("จำนวนแถวเกิน 2,000 แถว")
            for v in value:
                safe(v, depth + 1)
        elif isinstance(value, dict):
            if len(value) > 250:
                raise error("ข้อมูลมีคอลัมน์มากเกินไป")
            for k, v in value.items():
                if not isinstance(k, str) or len(k) > 100:
                    raise error("ชื่อคอลัมน์ไม่ถูกต้อง")
                safe(v, depth + 1)

    safe(data)
    if len(json.dumps(data, ensure_ascii=False)) > 3_000_000:
        raise error("ข้อมูลโครงการใหญ่เกินไป")

    def amount(value, nullable=False, *, workflow=False):
        if nullable and value in (None, ""):
            return None

        try:
            if isinstance(value, bool) or not isinstance(
                value, (str, int, float)
            ):
                raise ValueError()

            n = Decimal(str(value or 0))

            if not n.is_finite() or abs(n) > Decimal("9000000000"):
                raise ValueError()

            rounded = n.quantize(
                Decimal("0.001"),
                rounding=ROUND_HALF_UP
            )

            # ปัดทศนิยมอัตโนมัติเฉพาะ Workflow
            if not workflow:
                if abs(n - rounded) > Decimal("0.0000001"):
                    raise ValueError()

            return float(rounded)

        except (ValueError, InvalidOperation):
            if workflow:
                raise error("ตัวเลข Workflow ไม่ถูกต้อง")

            raise error(
                "กรอกจำนวนเงินเป็นตัวเลข ทศนิยมไม่เกิน 3 ตำแหน่ง"
            )

    result = deepcopy(old)
    result.update(data)

    # Master DB owns only the project identity/name.  Everything else belongs to
    # this meeting round and is allowed to be edited independently.
    for k in ("id", "name", "master_project_id", "meeting_year"):
        if k in data and data[k] != old.get(k):
            raise error("ข้อมูลอ้างอิงโครงการหรือรอบประชุมไม่ตรงกัน", 409)

    # Clean the editable Tab 1 text fields.  Do not repopulate them from the
    # Master snapshot; values saved here stay with this meeting/.mbg document.
    editable_text_fields = (
        "short_name",
        "owner",
        "owner_department",
        "owner_division",
        "description",
        "area",
        "timeline",
        "status",
        "project_stage",
        "project_type",
        "approval_date",
        "estimated_return",
        "work_volume",
    )
    for k in editable_text_fields:
        value = result.get(k, "")
        if value is None:
            value = ""
        if not isinstance(value, str):
            raise error("ข้อมูลรายละเอียดโครงการไม่ถูกต้อง")
        result[k] = value.strip()

    # Whole-project funding in Tab 1 is meeting-owned data too.
    for k in ("loan_total", "revenue_total", "oh_total", "idc_total"):
        result[k] = amount(result.get(k, 0))
        if result[k] < 0:
            raise error("วงเงินลงทุนต้องไม่ติดลบ")

    budget = data.get("budget", {})
    if not isinstance(budget, dict) or set(budget) - {str(y) for y in range(year, year + 7)}:
        raise error("ปีในแผนงบประมาณไม่ตรงกับรอบประชุม")
    clean = {}
    for y in range(year, year + 7):
        row = budget.get(str(y), {})
        if not isinstance(row, dict) or set(row) - set(BUDGET_FIELDS):
            raise error("คอลัมน์แผนงบประมาณไม่ถูกต้อง")
        clean[str(y)] = {
            k: amount(row.get(k, None if k == "investment_set_post" else 0), k in ("disbursement_target_post", "investment_set_post")) for k in BUDGET_FIELDS
        }
        if "disbursement_target_post" not in row:
            clean[str(y)]["disbursement_target_post"] = None
        for k in (
            "investment_set",
            "investment_set_post",
            "disbursement_target",
            "disbursement_target_post",
            "next_year_uncommitted",
            "cabinet_target",
        ):
            if (clean[str(y)][k] or 0) < 0:
                raise error("วงเงินและเป้าหมายต้องไม่ติดลบ (ผลต่างเพิ่ม/ลดติดลบได้)")
    for key in ("approved_budget_to_prev_year", "actual_disbursement_to_prev_year"):
        result[key] = amount(result.get(key, 0))
    # Recompute derived values on the server as well as in the original UI.
    for i, y in enumerate(range(year, year + 7)):
        r = clean[str(y)]
        if i:
            r["committed"] = float(remaining - Decimal(str(prev["next_year_uncommitted"])))
        else:
            r["committed"] = float(
                Decimal(str(result["approved_budget_to_prev_year"]))
                - Decimal(str(result["actual_disbursement_to_prev_year"]))
            )
        post = (
            r["disbursement_target"]
            if r["disbursement_target_post"] is None
            else r["disbursement_target_post"]
        )
        r["high_target"] = float(Decimal(str(post)) - Decimal(str(r["cabinet_target"])))
        set_after = r["investment_set_post"] or 0
        remaining = Decimal(str(set_after)) + sum(
            Decimal(str(r[k]))
            for k in (
                "committed",
                "investment_change",
            )
        ) - Decimal(str(post))
        prev = r
    result["budget"] = clean
    details = data.get("detailBudget", {})
    if not isinstance(details, dict) or set(details) - {"setBudget", "changeBudget"}:
        raise error("ตารางรายละเอียดไม่ถูกต้อง")
    result["detailBudget"] = {}
    for kind in ("setBudget", "changeBudget"):
        rows = details.get(kind, [])
        if not isinstance(rows, list):
            raise error("รายการงานต้องเป็นแถวข้อมูล")
        output = []
        for row in rows:
            if not isinstance(row, dict) or not isinstance(row.get("work", ""), str):
                raise error("ชื่อรายการงานไม่ถูกต้อง")
            months = row.get("months", [])
            future = row.get("future", {})
            if not isinstance(months, list) or len(months) != 12 or not isinstance(future, dict):
                raise error("แผนรายเดือนต้องมี 12 เดือน")
            if any(not k.isdigit() or not year <= int(k) <= year + 30 for k in future):
                raise error("ปีของรายละเอียดไม่ถูกต้อง")
            output.append(
                dict(
                    work=row.get("work", ""),
                    isSubrow=row.get("isSubrow") is True and bool(output),
                    investment=amount(row.get("investment", 0)),
                    months=[amount(v) for v in months],
                    future={k: amount(v) for k, v in future.items()},
                )
            )
        result["detailBudget"][kind] = output
    workflow = data.get("workflow", {})
    if not isinstance(workflow, dict) or not isinstance(workflow.get("rows", []), list):
        raise error("Workflow ไม่ถูกต้อง")
    seen = set()
    for row in workflow.get("rows", []):
        if not isinstance(row, dict) or not isinstance(row.get("key"), str) or row["key"] in seen:
            raise error("รหัสแถว Workflow ไม่ถูกต้องหรือซ้ำกัน")
        seen.add(row["key"])
        for k in ("target1", "target2"):
            if k in row and (not isinstance(row[k], list) or len(row[k]) != 12):
                raise error("เดือนใน Workflow ต้องมี 12 เดือน")
        for k, v in row.items():
            if k in ("target1", "target2"):
                row[k] = [amount(n, workflow=True) for n in v]
            elif k == "future":
                if not isinstance(v, dict):
                    raise error("ปีใน Workflow ไม่ถูกต้อง")
                row[k] = {y: amount(n, workflow=True) for y, n in v.items()}
            elif k in (
                "estimate_total",
                "budget_set",
                "actual_prev",
                "estimate_current",
                "source_total",
                "source_grand_total",
                "cost_saving",
                "reserve",
                "cancel_budget",
                "over_under",
            ):
                row[k] = amount(
                    v,
                    nullable=k in ("source_total", "source_grand_total"),
                    workflow=True,
                )
            elif isinstance(v, (int, float)) and not isinstance(v, bool):
                if not math.isfinite(v) or abs(v) > 9e9:
                    raise error("ตัวเลข Workflow ไม่ถูกต้อง")
    for k in ("meeting_comment", "change_budget_comment", "cabinet_target_comment"):
        if not isinstance(result.get(k, ""), str) or len(result.get(k, "")) > 8000:
            raise error("บันทึกต้องไม่เกิน 8,000 ตัวอักษร")
    if result.get("meeting_decision", "") not in ("", "เห็นชอบ", "ไม่เห็นชอบ", "ทบทวน"):
        raise error("มติประชุมไม่ถูกต้อง")
    return result


def register_workspace(app, db, *, error, now, check_version):
    prefix = "/api/meeting-workspaces/<meeting_id>/api"

    @app.post("/api/meeting-workspaces/import")
    def import_workspace_file():
        import tempfile
        from import_meeting_legacy import import_legacy

        upload = request.files.get("file")
        if not upload or Path(upload.filename or "").suffix.lower() not in (".db", ".mbg"):
            raise error("เลือกไฟล์ .db หรือ .mbg จากแอปประชุมเดิม")
        with tempfile.TemporaryDirectory() as temp:
            source = Path(temp) / "meeting-import.db"
            upload.save(source)
            try:
                result = import_legacy(source, app.config["DATABASE"])
            except (ValueError, KeyError, TypeError) as exc:
                raise error("นำเข้าไม่สำเร็จ: " + str(exc))
        return jsonify(success=True, **result)

    def meeting(conn, mid, write=False):
        row = conn.execute("SELECT * FROM budget_meetings WHERE id=?", (mid,)).fetchone()
        if not row:
            raise error("ไม่พบรอบประชุม", 404)
        if write and row["status"] == "closed":
            raise error("รอบประชุมปิดแล้ว อ่านได้อย่างเดียว", 409)
        return row

    def entries(conn, mid):
        return conn.execute(
            "SELECT * FROM meeting_projects WHERE meeting_id=? ORDER BY created_at,id", (mid,)
        ).fetchall()

    def entry(conn, mid, code):
        for row in entries(conn, mid):
            if json.loads(row["snapshot_json"])["code"] == code:
                return row
        raise error("โครงการนี้ไม่ได้อยู่ในรอบประชุม", 404)

    def payload():
        d = request.get_json()
        if not isinstance(d, dict):
            raise error("ข้อมูลต้องเป็น JSON object")
        return d

    def record(conn, row, doc=None, meta=None):
        if doc is None:
            doc = json.loads(row["workspace_json"])
        if meta is None:
            meta = json.loads(row["workspace_meta_json"])
        reviewed = bool(doc.get("meeting_decision")) if doc else bool(row["reviewed"])
        conn.execute(
            """UPDATE meeting_projects SET workspace_json=?,workspace_meta_json=?,version=version+1,
                     notes=?,reviewed=?,updated_at=? WHERE id=?""",
            (
                json.dumps(doc, ensure_ascii=False),
                json.dumps(meta, ensure_ascii=False),
                doc.get("meeting_comment", row["notes"]),
                int(reviewed),
                now(),
                row["id"],
            ),
        )
        snap = dict(
            workspace=doc,
            metadata=meta,
            version=row["version"] + 1,
            afterBudget=row["after_baht"] / 1e6,
            reviewed=reviewed,
            reason=row["reason"],
        )
        conn.execute(
            "INSERT INTO meeting_project_events(entry_id,snapshot_json,occurred_at) VALUES(?,?,?)",
            (row["id"], json.dumps(snap, ensure_ascii=False), now()),
        )
        conn.execute(
            "UPDATE budget_meetings SET version=version+1,updated_at=? WHERE id=?",
            (now(), row["meeting_id"]),
        )
        return row["version"] + 1

    @app.get("/meeting-app/<meeting_id>/<name>")
    def workspace_page(meeting_id, name):
        with db() as c:
            meeting(c, meeting_id)
        if name not in ("index.html", "project_detail.html"):
            raise error("ไม่พบหน้า", 404)
        return send_from_directory(ROOT / "meeting-app", name)

    @app.get("/meeting-app/assets/<path:name>")
    def workspace_asset(name):
        if Path(name).suffix not in (".js", ".css", ".woff2", ".woff", ".ttf", ".txt", ".svg"):
            raise error("ไม่พบไฟล์", 404)
        return send_from_directory(ROOT / "meeting-app" / "assets", name)

    @app.get(prefix + "/config")
    def workspace_config(meeting_id):
        with db() as c:
            m = meeting(c, meeting_id)
            return jsonify(
                **cycle(m["year_be"]),
                meeting_id=meeting_id,
                round_no=m["round_no"],
                title=m["title"],
                read_only=m["status"] == "closed",
                version=m["version"],
            )

    @app.get(prefix + "/get-project/<path:code>")
    def workspace_get(meeting_id, code):
        with db() as c:
            m = meeting(c, meeting_id)
            return jsonify(
                success=True,
                data=document_for(entry(c, meeting_id, code), m["year_be"]),
                cycle=cycle(m["year_be"]),
            )

    @app.post(prefix + "/save-project")
    def workspace_save(meeting_id):
        d = payload()
        with db(True) as c:
            m = meeting(c, meeting_id, True)
            r = entry(c, meeting_id, d.get("id"))
            check_version(d, r)
            doc = validate_document(d, document_for(r, m["year_be"]), m["year_be"], error)
            version = record(c, r, doc)
            return jsonify(success=True, id=doc["id"], version=version, meeting_year=m["year_be"])

    @app.get(prefix + "/project-master")
    def workspace_master(meeting_id):
        with db() as c:
            m = meeting(c, meeting_id)
            out = []
            for i, r in enumerate(entries(c, meeting_id)):
                d = document_for(r, m["year_be"])
                meta = json.loads(r["workspace_meta_json"])
                out.append(
                    dict(
                        id=i + 1,
                        code=d["id"],
                        name=d["name"],
                        short_name=d.get("short_name", ""),
                        owner=d.get("owner", ""),
                        status=d.get("status", ""),
                        responsible_unit=d.get("owner_department", ""),
                        summary_group=meta.get(
                            "summary_group",
                            (
                                "new_project"
                                if d.get("project_type") in ("new", "โครงการใหม่")
                                else "continuing_budget"
                            ),
                        ),
                        display_order=meta.get("display_order", i),
                        is_active=meta.get("is_active", 1),
                        show_set_summary=meta.get("show_set_summary", 1),
                        show_change_summary=meta.get("show_change_summary", 1),
                        version=r["version"],
                        master_project_id=r["project_id"],
                        meeting_decision=d.get("meeting_decision", ""),
                    )
                )
            return jsonify(success=True, data=out, meeting_year=m["year_be"])

    @app.delete(prefix + "/project-master/<path:code>")
    def workspace_remove_project(meeting_id, code):
        d = payload()
        with db(True) as c:
            meeting(c, meeting_id, True)
            r = entry(c, meeting_id, code)
            check_version(d, r)
            c.execute("DELETE FROM meeting_project_events WHERE entry_id=?", (r["id"],))
            c.execute("DELETE FROM meeting_projects WHERE id=?", (r["id"],))
            c.execute(
                "UPDATE budget_meetings SET version=version+1,updated_at=? WHERE id=?",
                (now(), meeting_id),
            )
            return jsonify(success=True, code=code)

    @app.put(prefix + "/project-master/<path:code>")
    def workspace_metadata(meeting_id, code):
        d = payload()
        with db(True) as c:
            m = meeting(c, meeting_id, True)
            r = entry(c, meeting_id, code)
            check_version(d, r)
            meta = json.loads(r["workspace_meta_json"])
            if "summary_group" in d:
                if d["summary_group"] not in GROUPS:
                    raise error("หมวดโครงการไม่ถูกต้อง")
                meta["summary_group"] = d["summary_group"]
            for k in ("show_set_summary", "show_change_summary", "is_active"):
                if k in d:
                    if type(d[k]) is not bool:
                        raise error("สถานะการแสดงผลไม่ถูกต้อง")
                    meta[k] = int(d[k])
            doc = document_for(r, m["year_be"])
            for source, target in (("owner", "owner"), ("responsible_unit", "owner_department"), ("status", "status")):
                if source in d:
                    doc[target] = d[source]
            doc = validate_document(doc, document_for(r, m["year_be"]), m["year_be"], error)
            return jsonify(success=True, version=record(c, r, doc=doc, meta=meta))

    @app.post(prefix + "/project-master/reorder")
    def workspace_reorder(meeting_id):
        d = payload()
        codes = d.get("ordered_codes")
        versions = d.get("versions", {})
        if (
            not isinstance(codes, list)
            or len(set(codes)) != len(codes)
            or d.get("summary_group") not in GROUPS
            or not isinstance(versions, dict)
        ):
            raise error("ลำดับโครงการไม่ถูกต้อง")
        with db(True) as c:
            meeting(c, meeting_id, True)
            for i, code in enumerate(codes):
                r = entry(c, meeting_id, code)
                check_version({"version": versions.get(code)}, r)
                meta = json.loads(r["workspace_meta_json"])
                meta["display_order"] = i
                record(c, r, meta=meta)
            return jsonify(success=True)

    @app.get(prefix + "/annual-overview")
    def annual_overview(meeting_id):
        with db() as c:
            m = meeting(c, meeting_id)
            documents = [document_for(r, m['year_be']) for r in entries(c, meeting_id)]
            rows = []
            for year in range(2569, 2574):
                total = Decimal(0)
                target = Decimal(0)
                for doc in documents:
                    budget = doc.get('budget', {}).get(str(year), {})
                    set_after = budget.get('investment_set_post')
                    total += Decimal(str(set_after or 0)) + sum((Decimal(str(budget.get(key) or 0)) for key in
                                  ('committed', 'investment_change')), Decimal(0))
                    post = budget.get('disbursement_target_post')
                    target += Decimal(str((budget.get('disbursement_target') if post is None else post) or 0))
                rows.append(dict(year=year, operating_budget=float(total), disbursement_target=float(target)))
            return jsonify(success=True, data=rows, project_count=len(documents))

    @app.get(prefix + "/dashboard/<int:year>")
    def workspace_dashboard(meeting_id, year):
        with db() as c:
            m = meeting(c, meeting_id)

            # รองรับปี 2569-2575 รวม 7 ปี
            if year not in range(m["year_be"], m["year_be"] + 7):
                raise error("ปีไม่ตรงกับรอบประชุม")

            # หน้าสรุปรายปีสามารถขอรวมโครงการที่ปิดแล้วได้
            include_inactive = request.args.get("include_inactive") == "1"

            out = []
            all_rows = []

            for r in entries(c, meeting_id):
                meta = json.loads(r["workspace_meta_json"])

                row = summary_row(
                    document_for(r, m["year_be"]),
                    meta,
                    year,
                )

                all_rows.append(row)

                if include_inactive or meta.get("is_active", 1):
                    out.append(row)

            totals = {
                key: float(
                    sum(
                        (Decimal(str(row[key])) for row in out),
                        Decimal(0),
                    )
                )
                for key in (
                    "operating_budget_before",
                    "operating_budget_after",
                    "disbursement_before",
                    "disbursement_after",
                )
            }

            return jsonify(
                success=True,
                meeting_year=m["year_be"],
                year=year,
                data=out,
                totals=totals,
                project_count=len(out),
            )

    @app.route(prefix + "/dashboard-fund-sources/<int:year>", methods=["GET", "POST"])
    def workspace_funds(meeting_id, year):
        with db(request.method == "POST") as c:
            m = meeting(c, meeting_id, request.method == "POST")
            if year != m["year_be"]:
                raise error("ปีไม่ตรงกับรอบประชุม")
            r = c.execute(
                "SELECT * FROM meeting_workspace_state WHERE meeting_id=?", (meeting_id,)
            ).fetchone()
            version = r["version"] if r else 0
            if request.method == "GET":
                return jsonify(
                    success=True, data=json.loads(r["funds_json"]) if r else {}, version=version
                )
            d = payload()
            check_version(d, {"version": version})
            amounts = d.get("data")
            if not isinstance(amounts, dict) or set(amounts) - set(FUND_KEYS):
                raise error("แหล่งเงินไม่ถูกต้อง")
            from server import money

            amounts = {k: money(amounts.get(k, 0), k) / 1e6 for k in FUND_KEYS}
            c.execute(
                """INSERT INTO meeting_workspace_state VALUES(?,?,?,?) ON CONFLICT(meeting_id)
                       DO UPDATE SET funds_json=excluded.funds_json,version=excluded.version,updated_at=excluded.updated_at""",
                (meeting_id, json.dumps(amounts), version + 1, now()),
            )
            c.execute(
                "UPDATE budget_meetings SET version=version+1,updated_at=? WHERE id=?",
                (now(), meeting_id),
            )
            return jsonify(success=True, version=version + 1)

    @app.get(prefix + "/export")
    def workspace_export(meeting_id):
        with db() as c:
            m = meeting(c, meeting_id)
            funds = c.execute(
                "SELECT * FROM meeting_workspace_state WHERE meeting_id=?", (meeting_id,)
            ).fetchone()
            out = dict(
                format="p-budget-meeting",
                version=1,
                meeting=dict(m),
                fundSources=json.loads(funds["funds_json"]) if funds else {},
                projects=[
                    dict(
                        masterSnapshot=json.loads(r["snapshot_json"]),
                        document=document_for(r, m["year_be"]),
                        metadata=json.loads(r["workspace_meta_json"]),
                    )
                    for r in entries(c, meeting_id)
                ],
            )
        return send_file(
            io.BytesIO(json.dumps(out, ensure_ascii=False, indent=2).encode()),
            mimetype="application/json",
            as_attachment=True,
            download_name=f'meeting-{m["year_be"]}-{m["round_no"]}.json',
        )

    @app.get(prefix + "/workflow/status")
    def workspace_workflow_status(meeting_id):
        with db() as c:
            meeting(c, meeting_id)
        from workflow_excel import load_workbook

        return jsonify(
            success=True,
            workflow_import_ready=load_workbook is not None,
            openpyxl_installed=load_workbook is not None,
        )

    @app.post(prefix + "/workflow/import-preview")
    def workspace_workflow_preview(meeting_id):
        with db() as c:
            m = meeting(c, meeting_id, True)
        upload = request.files.get("file")
        if not upload or not upload.filename:
            raise error("กรุณาเลือกไฟล์ Excel")
        raw = upload.read()
        try:
            with zipfile.ZipFile(io.BytesIO(raw)) as z:
                if sum(i.file_size for i in z.infolist()) > 100 * 1024 * 1024:
                    raise ValueError("ไฟล์ Excel ใหญ่เกินไป")
            from workflow_excel import parse_workflow_excel

            workflow, preview = parse_workflow_excel(raw, upload.filename, m["year_be"])
        except (ValueError, zipfile.BadZipFile) as e:
            raise error(str(e))
        return jsonify(success=True, workflow=workflow, preview=preview)
