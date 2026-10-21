"""Local P-Budget API. Run with python server.py; data stays in data/master.db."""

from contextlib import closing, contextmanager
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path
import io
import json
import os
import re
import sqlite3
import uuid

from flask import Flask, jsonify, request, send_file, send_from_directory
from werkzeug.exceptions import HTTPException
from project_profile import FINANCE_COLUMNS, enrich_project, normalize_finances, profile_details
from database_schema import SCHEMA_VERSION

ROOT = Path(__file__).resolve().parent
NINE_BOX_DIR = ROOT / "nine-box-app"
MASTER_TABLES = {"funding-sources": "funding_sources", "statuses": "project_statuses", "fiscal-years": "fiscal_years", "project-types": "project_types"}
DEFAULT_FUNDS = [
    ("domestic-loan", "LOAN", "เงินกู้ในประเทศ"),
    ("foreign-loan", "FOREIGN_LOAN", "เงินกู้ต่างประเทศ"),
    ("pea-revenue", "REVENUE", "เงินรายได้ กฟภ."),
    ("land", "LAND", "ที่ดิน"),
    ("oh", "OH", "OH"),
    ("idc", "IDC", "IDC"),
]
DEFAULT_STATUSES = [
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
    (
        "approved",
        "APPROVED",
        "ได้รับอนุมัติแล้ว",
        0,
    ),
    (
        "in-progress",
        "IN_PROGRESS",
        "กำลังดำเนินการ",
        0,
    ),
    (
        "completed",
        "COMPLETED",
        "เสร็จสิ้น",
        1,
    ),
    (
        "other",
        "OTHER",
        "อื่นๆ",
        0,
    ),
]


class ApiError(Exception):
    def __init__(self, message, status=400):
        self.message, self.status = message, status


def now():
    return datetime.now(timezone.utc).isoformat(timespec="microseconds")


def current_year():
    # Calendar year in Bangkok, not the fiscal year.
    return datetime.now(timezone(timedelta(hours=7))).year + 543


def current_fiscal_year():
    local_date = datetime.now(timezone(timedelta(hours=7)))
    return local_date.year + 543 + (local_date.month >= 10)


def ensure_fiscal_years(db, fiscal_year=None):
    year = fiscal_year if fiscal_year is not None else current_fiscal_year()
    stamp = now()
    db.executemany(
        "INSERT OR IGNORE INTO fiscal_years(id,code,name,created_at,updated_at) VALUES(?,?,?,?,?)",
        [(str(value), str(value), f"ปีงบประมาณ {value}", stamp, stamp)
         for value in range(year, year + 6)],
    )


@contextmanager
def connection(path, write=False):
    db = sqlite3.connect(path, timeout=15)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")
    try:
        db.execute("BEGIN IMMEDIATE" if write else "BEGIN")
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def initialize(path):
    from maintenance import auto_backup

    auto_backup(path, target_schema=SCHEMA_VERSION)
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(path, timeout=15)) as db, db:
        db.execute("PRAGMA journal_mode=WAL")
        db.execute(
            "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)"
        )
        if not db.execute("SELECT 1 FROM schema_migrations WHERE version=1").fetchone():
            sql = (ROOT / "migrations/001_master.sql").read_text(encoding="utf-8")
            db.executescript("BEGIN IMMEDIATE;\n" + sql)
            stamp = now()
            db.executemany(
                "INSERT INTO funding_sources(id,code,name,created_at,updated_at) VALUES(?,?,?,?,?)",
                [(i, c, n, stamp, stamp) for i, c, n in DEFAULT_FUNDS],
            )
            db.executemany(
                "INSERT INTO project_statuses(id,code,name,is_terminal,created_at,updated_at) VALUES(?,?,?,?,?,?)",
                [(i, c, n, t, stamp, stamp) for i, c, n, t in DEFAULT_STATUSES],
            )
            db.execute("INSERT INTO schema_migrations VALUES(1,?)", (stamp,))
        db.commit()
        if not db.execute("SELECT 1 FROM schema_migrations WHERE version=2").fetchone():
            sql = (ROOT / "migrations/002_funding_hierarchy.sql").read_text(encoding="utf-8")
            db.executescript("BEGIN IMMEDIATE;\n" + sql)
            db.execute("INSERT INTO schema_migrations VALUES(2,?)", (now(),))
        db.commit()
        if not db.execute("SELECT 1 FROM schema_migrations WHERE version=3").fetchone():
            sql = (ROOT / "migrations/003_budget_meetings.sql").read_text(encoding="utf-8")
            db.executescript("BEGIN IMMEDIATE;\n" + sql)
            db.execute("INSERT INTO schema_migrations VALUES(3,?)", (now(),))
        db.commit()
        if not db.execute("SELECT 1 FROM schema_migrations WHERE version=4").fetchone():
            sql = (ROOT / "migrations/004_project_profile.sql").read_text(encoding="utf-8")
            db.executescript("BEGIN IMMEDIATE;\n" + sql)
            db.execute("INSERT INTO schema_migrations VALUES(4,?)", (now(),))
        db.commit()
        if not db.execute("SELECT 1 FROM schema_migrations WHERE version=5").fetchone():
            sql = (ROOT / "migrations/005_meeting_workspace.sql").read_text(encoding="utf-8")
            db.executescript("BEGIN IMMEDIATE;\n" + sql)
            if db.execute("PRAGMA foreign_key_check").fetchone():
                raise RuntimeError("Meeting migration foreign key check failed")
            db.execute("INSERT INTO schema_migrations VALUES(5,?)", (now(),))
        db.commit()
        if not db.execute("SELECT 1 FROM schema_migrations WHERE version=6").fetchone():
            sql = (ROOT / "migrations/006_nine_box.sql").read_text(encoding="utf-8")
            db.executescript("BEGIN IMMEDIATE;\n" + sql)
            db.execute("INSERT INTO schema_migrations VALUES(6,?)", (now(),))
        db.commit()
        if not db.execute("SELECT 1 FROM schema_migrations WHERE version=7").fetchone():
            sql = (ROOT / "migrations/007_foreign_loan.sql").read_text(encoding="utf-8")
            db.executescript("BEGIN IMMEDIATE;\n" + sql)
            db.execute("INSERT INTO schema_migrations VALUES(7,?)", (now(),))
        db.commit()
        if not db.execute("SELECT 1 FROM schema_migrations WHERE version=8").fetchone():
            sql = (ROOT / "migrations/008_fiscal_years.sql").read_text(encoding="utf-8")
            db.executescript("BEGIN IMMEDIATE;\n" + sql)
            db.execute("INSERT INTO schema_migrations VALUES(8,?)", (now(),))
        db.commit()
        if not db.execute("SELECT 1 FROM schema_migrations WHERE version=9").fetchone():
            sql = (ROOT / "migrations/009_project_types.sql").read_text(encoding="utf-8")
            db.executescript("BEGIN IMMEDIATE;\n" + sql)
            db.execute("INSERT INTO schema_migrations VALUES(9,?)", (now(),))
        db.commit()
        if not db.execute("SELECT 1 FROM schema_migrations WHERE version=10").fetchone():
            sql = (ROOT / "migrations/010_foreign_loan_independent.sql").read_text(encoding="utf-8")
            db.executescript("BEGIN IMMEDIATE;\n" + sql)
            db.execute("INSERT INTO schema_migrations VALUES(10,?)", (now(),))
        ensure_fiscal_years(db)
        from monthly_disbursement import sync_project_spending
        sync_project_spending(db)


def text_field(value, label, maximum):
    if not isinstance(value, str) or not 1 <= len(value.strip()) <= maximum:
        raise ApiError(f"{label}: กรุณาระบุข้อความไม่เกิน {maximum} ตัวอักษร")
    return value.strip()


def money(value, label):
    if isinstance(value, bool) or not isinstance(value, (int, float, str)):
        raise ApiError(f"{label}: ตัวเลขไม่ถูกต้อง")

    try:
        number = Decimal(str(value))

        if not number.is_finite() or number < 0 or number > Decimal("9000000000"):
            raise ValueError()

        # API รับหน่วย "ล้านบาท"
        # แปลงเป็นบาท และอนุญาตทศนิยมได้ถึง 2 ตำแหน่ง (สตางค์)
        baht = number * Decimal("1000000")

        if baht != baht.quantize(Decimal("0.01")):
            raise ValueError()

        baht = baht.quantize(Decimal("0.01"))

        # จำนวนเต็มบาทเก็บเป็น int
        if baht == baht.to_integral_value():
            return int(baht)

        # ถ้ามีสตางค์ เช่น 178.95
        return float(baht)

    except (InvalidOperation, ValueError):
        raise ApiError(f"{label}: จำนวนเงินไม่ถูกต้อง รองรับทศนิยมไม่เกิน 2 ตำแหน่งของหน่วยบาท")


def master_values(kind, data, importing=False):
    name = text_field(data.get("name"), "ชื่อข้อมูลหลัก", 100)
    code = text_field(data.get("code"), "รหัสข้อมูลหลัก", 30).upper()
    if not re.fullmatch(r"[A-Z0-9_-]+", code):
        raise ApiError("รหัสข้อมูลหลักใช้ A-Z, 0-9, ขีดกลาง และขีดล่าง")
    if kind == "fiscal-years":
        if not re.fullmatch(r"\d{4}", code) or not 2400 <= int(code) <= 3000:
            raise ApiError("ปีงบประมาณต้องเป็นปี พ.ศ. 4 หลัก ระหว่าง 2400–3000")
        expected_name = f"ปีงบประมาณ {code}"
        if importing and name != expected_name:
            raise ApiError("ชื่อปีงบประมาณในไฟล์ไม่ตรงกับปี พ.ศ.")
        name = expected_name
    active, terminal = data.get("active", True), data.get("is_terminal", False)
    if type(active) is not bool or type(terminal) is not bool:
        raise ApiError("active และ is_terminal ต้องเป็น boolean")
    return code, name, active, terminal


def insert_master(db, kind, code, name, active, terminal, stamp):
    table = MASTER_TABLES[kind]
    master_id = code if kind == "fiscal-years" else str(uuid.uuid4())
    db.execute(
        f"INSERT INTO {table}(id,code,name,active,created_at,updated_at) VALUES(?,?,?,?,?,?)",
        (master_id, code, name, active, stamp, stamp),
    )
    if kind == "statuses":
        db.execute(f"UPDATE {table} SET is_terminal=? WHERE id=?", (terminal, master_id))
    return master_id


def validate_master_reference(db, table, value, previous_value, label):
    if not isinstance(value, str):
        raise ApiError(f"กรุณาเลือก{label}จากข้อมูลหลัก")
    row = db.execute(f"SELECT active FROM {table} WHERE id=?", (value,)).fetchone()
    if row is None or (not row["active"] and value != previous_value):
        raise ApiError(f"{label}ไม่มีอยู่หรือปิดใช้งานแล้ว")


def master_item(row):
    data = dict(row)
    data["active"] = bool(data["active"])
    if "is_terminal" in data:
        data["is_terminal"] = bool(data["is_terminal"])
    return data


def read_masters(db):
    return {
        kind: [
            master_item(row)
            for row in db.execute(f"SELECT * FROM {table} ORDER BY created_at, rowid")
        ]
        for kind, table in MASTER_TABLES.items()
    }


PROJECT_SELECT = """SELECT p.*, COALESCE(parent.name,f.name) AS fund_name,
    COALESCE(f.parent_id,f.id) AS root_fund_id,
    CASE WHEN f.parent_id IS NOT NULL THEN f.name END AS component_name,
    s.name AS status_name, s.is_terminal
    FROM projects p JOIN funding_sources f ON p.funding_source_id=f.id
    LEFT JOIN funding_sources parent ON f.parent_id=parent.id
    JOIN project_statuses s ON p.status_id=s.id"""


def project_item(row):
    result = enrich_project(
        {
            "id": row["id"],
            "code": row["code"],
            "name": row["name"],
            "fundId": row["funding_source_id"],
            "statusId": row["status_id"],
            "fundingSourceId": row["root_fund_id"],
            "fundComponent": row["component_name"],
            "fund": row["fund_name"],
            "status": row["status_name"],
            "isTerminal": bool(row["is_terminal"]),
            "budget": row["budget_baht"] / 1_000_000,
            "spent": row["spent_baht"] / 1_000_000,
            "progress": row["progress"],
            "version": row["version"],
            "createdAt": row["created_at"],
            "updated": row["updated_at"],
        },
        row,
    )
    return result


def get_project(db, project_id):
    row = db.execute(
        PROJECT_SELECT + " WHERE p.id=? AND p.deleted_at IS NULL", (project_id,)
    ).fetchone()
    if row is None:
        raise ApiError("ไม่พบโครงการ หรือโครงการถูกลบแล้ว", 404)
    return project_item(row)


def list_projects(db):
    return [
        project_item(row)
        for row in db.execute(
            PROJECT_SELECT + " WHERE p.deleted_at IS NULL ORDER BY p.updated_at DESC, p.id"
        )
    ]


def validate_project(db, data, previous=None):
    if not isinstance(data, dict):
        raise ApiError("ข้อมูลโครงการต้องเป็น object")
    details = profile_details(data, previous, ApiError)
    from monthly_disbursement import actual_finances
    monthly_actual = actual_finances(details['monthlyDisbursement']) or {'loanSpent': 0, 'revenueSpent': 0}
    project_type = details["projectType"]
    if project_type:
        old_type = (previous or {}).get("details", {}).get("projectType")
        validate_master_reference(db, "project_types", project_type, old_type, "ประเภทโครงการ")
    data, finances = normalize_finances(data, previous, money, ApiError, monthly_actual)
    land = money(details.get('land') or 0, 'ที่ดิน')
    if land + finances[2] + finances[3] > finances[1]:
        raise ApiError('ที่ดิน + OH + IDC ต้องไม่เกินเงินรายได้')
    if money(details.get('foreignLoan') or 0, 'เงินกู้ต่างประเทศ') > finances[0]:
        raise ApiError('เงินกู้ต่างประเทศต้องไม่เกินวงเงินเงินกู้รวม')
    name = text_field(data.get("name"), "ชื่อโครงการ", 180)
    budget, spent = money(data.get("budget"), "งบประมาณ"), money(data.get("spent"), "ยอดเบิกจ่าย")
    if spent > budget:
        raise ApiError("ยอดเบิกจ่ายต้องไม่เกินงบประมาณ")
    try:
        progress = float(data.get("progress"))
        if isinstance(data.get("progress"), bool) or not 0 <= progress <= 100:
            raise ValueError()
    except (TypeError, ValueError):
        raise ApiError("ความคืบหน้าต้องอยู่ระหว่าง 0 ถึง 100")
    refs = []
    for key, table, label in [
        ("fundId", "funding_sources", "แหล่งเงิน"),
        ("statusId", "project_statuses", "สถานะ"),
    ]:
        value = data.get(key)
        validate_master_reference(db, table, value, (previous or {}).get(key), label)
        if key == "fundId":
            parent = db.execute(
                "SELECT p.active FROM funding_sources f JOIN funding_sources p ON f.parent_id=p.id WHERE f.id=?",
                (value,),
            ).fetchone()
            if parent and not parent["active"] and (not previous or previous[key] != value):
                raise ApiError("แหล่งเงินหลักปิดใช้งานแล้ว")
        refs.append(value)
    if data.get("finances"):
        for index, fund_id in [(0, "domestic-loan"), (1, "pea-revenue"), (2, "oh"), (3, "idc")]:
            if not finances[index]:
                continue
            active = db.execute(
                "SELECT active FROM funding_sources WHERE id=?", (fund_id,)
            ).fetchone()
            old_amount = (
                (previous or {}).get("finances", {}).get(("loan", "revenue", "oh", "idc")[index], 0)
            )
            if not active or (not active["active"] and not old_amount):
                raise ApiError("แหล่งเงินหรือส่วนประกอบปิดใช้งานแล้ว")
    return (
        name,
        refs[0],
        refs[1],
        budget,
        spent,
        progress,
        *finances,
        json.dumps(details, ensure_ascii=False, sort_keys=True),
    )


def allocate_code(db, year):
    db.execute(
        "INSERT INTO project_sequences(year_be,last_number) VALUES(?,0) ON CONFLICT DO NOTHING",
        (year,),
    )
    db.execute("UPDATE project_sequences SET last_number=last_number+1 WHERE year_be=?", (year,))
    number = db.execute(
        "SELECT last_number FROM project_sequences WHERE year_be=?", (year,)
    ).fetchone()[0]
    return f"PRJ-{year}-{number:05d}"


def sync_imported_code(db, code):
    match = re.fullmatch(r"PRJ-(\d{4})-(\d{5,})", code, re.IGNORECASE)
    if match:
        year, number = map(int, match.groups())
        if number > 999999999:
            raise ApiError("เลขลำดับรหัสโครงการสูงเกินช่วงที่รองรับ")
        db.execute(
            """INSERT INTO project_sequences VALUES(?,?) ON CONFLICT(year_be)
                      DO UPDATE SET last_number=MAX(last_number,excluded.last_number)""",
            (year, number),
        )


def event(db, project_id, action, snapshot):
    db.execute(
        "INSERT INTO project_events(project_id,action,snapshot_json,occurred_at) VALUES(?,?,?,?)",
        (project_id, action, json.dumps(snapshot, ensure_ascii=False), now()),
    )


def insert_project(db, values, code, project_id=None, action="create"):
    project_id, stamp = project_id or str(uuid.uuid4()), now()
    columns = (
        "id,code,name,funding_source_id,status_id,budget_baht,spent_baht,progress,"
        + ",".join(FINANCE_COLUMNS)
        + ",details_json,created_at,updated_at"
    )
    args = (project_id, code, *values, stamp, stamp)
    db.execute(f"INSERT INTO projects({columns}) VALUES({','.join('?' for _ in args)})", args)
    project = get_project(db, project_id)
    event(db, project_id, action, project)
    return project


def check_version(data, previous):
    if type(data.get("version")) is not int or data["version"] != previous["version"]:
        raise ApiError("ข้อมูลถูกเปลี่ยนแปลง กรุณาโหลดข้อมูลล่าสุดแล้วลองใหม่", 409)


def create_app(database=None):
    app = Flask(__name__, static_folder=None)
    app.json.ensure_ascii = False
    app.config.update(
        DATABASE=str(database or os.environ.get("P_BUDGET_DB", ROOT / "data/master.db")),
        MAX_CONTENT_LENGTH=10 * 1024 * 1024,
    )
    initialize(app.config["DATABASE"])

    @app.post('/api/investment-plan/preview')
    def preview_investment_plan():
        from investment_plan import read_investment_workbook
        uploaded = request.files.get('file')
        if not uploaded or not uploaded.filename.lower().endswith('.xlsx'):
            raise ApiError('กรุณาเลือกไฟล์ Excel .xlsx')
        content = uploaded.read()
        if request.form.get('action') == 'sheets':
            return jsonify(sheets=read_investment_workbook(content, ApiError, list_only=True))
        sheet = request.form.get('sheet')
        if not sheet:
            raise ApiError('กรุณาเลือกชีตที่ต้องการนำเข้า')
        return jsonify(plan=read_investment_workbook(content, ApiError, sheet_name=sheet)[0])

    def db(write=False):
        return connection(app.config["DATABASE"], write)

    ensured_fiscal_year = current_fiscal_year()

    @app.before_request
    def extend_fiscal_years():
        nonlocal ensured_fiscal_year
        if request.path.startswith("/api/"):
            fiscal_year = current_fiscal_year()
            if fiscal_year > ensured_fiscal_year:
                with db(True) as conn:
                    ensure_fiscal_years(conn, fiscal_year)
                ensured_fiscal_year = fiscal_year

    @app.get('/api/storage-info')
    def database_storage_info():
        from maintenance import storage_info
        return jsonify(storage_info(app.config['DATABASE']))

    def body():
        data = request.get_json()
        if not isinstance(data, dict):
            raise ApiError("ข้อมูลต้องเป็น JSON object")
        return data

    @app.before_request
    def same_origin_writes():
        if request.path.startswith("/api/") and request.method not in ("GET", "HEAD", "OPTIONS"):
            if request.headers.get("Origin") not in (None, request.host_url.rstrip("/")):
                raise ApiError("ไม่อนุญาตคำขอจากเว็บไซต์อื่น", 403)

    @app.after_request
    def no_cache(response):
        if request.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        elif request.path.startswith("/meeting-app/") and request.path.endswith((".html", ".js", ".css")):
            # Revalidate the embedded document and its integration code together.
            response.headers["Cache-Control"] = "no-cache, max-age=0, must-revalidate"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    @app.errorhandler(ApiError)
    def api_error(error):
        return jsonify(error=error.message), error.status

    @app.errorhandler(sqlite3.IntegrityError)
    def integrity_error(error):
        return jsonify(error="รหัสหรือชื่อซ้ำ หรือข้อมูลไม่ตรงตามข้อกำหนดของฐานข้อมูล"), 409

    @app.errorhandler(sqlite3.OperationalError)
    def database_error(error):
        app.logger.exception("Database operation failed")
        return jsonify(error="ฐานข้อมูลไม่พร้อมใช้งาน กรุณาลองใหม่"), 503

    @app.errorhandler(HTTPException)
    def http_error(error):
        return jsonify(error=error.description), error.code

    @app.get("/")
    def index():
        return send_from_directory(ROOT, "index.html")

    @app.get("/<name>")
    def asset(name):
        if name not in {
            "index.html",
            "app.js",
            "patch-settings.js",
            "database-session.js",
            "database-settings.js",
            "style.css",
            "pea_logo.png",
            "meetings.js",
            "meetings.css",
            "project-form.js",
            "disbursement-plan.js",
            "project-form.css",
        }:
            raise ApiError("ไม่พบไฟล์", 404)
        return send_from_directory(ROOT, name)

    @app.get("/frontend/<name>")
    def frontend_asset(name):
        if name not in {"icons.js", "finance.js", "navigation.js", "dashboard.js", "plan-results-table.js", "plan-results-table.css"}:
            raise ApiError("Not found", 404)
        return send_from_directory(ROOT / "frontend", name)

    @app.get("/api/bootstrap")
    def bootstrap():
        with db() as conn:
            return jsonify(
                projects=list_projects(conn),
                masters=read_masters(conn),
                schemaVersion=SCHEMA_VERSION,
                codeFormat="PRJ-BBBB-NNNNN",
                yearBE=current_year(),
            )

    @app.get("/api/projects")
    def projects():
        with db() as conn:
            return jsonify(projects=list_projects(conn))

    @app.route('/api/reports/snapshot.html', methods=['GET', 'POST'])
    def export_html_snapshot():
        from html_export import snapshot, document
        stamp = now()
        with db() as conn:
            data = snapshot(conn, list_projects(conn), read_masters(conn), SCHEMA_VERSION, stamp)
        data['theme'] = 'dark' if request.args.get('theme') == 'dark' else 'light'
        view_state = request.get_json(silent=True) if request.method == 'POST' else None
        raw_view_state = view_state.get('viewState') if isinstance(view_state, dict) else None
        data['viewState'] = {
            key: value for key, value in (raw_view_state.items() if isinstance(raw_view_state, dict) else [])
            if isinstance(key, str)
            and (key.startswith('meetingBudget:hiddenBudgetRows:') or key.startswith('meetingBudget:rowFilters:'))
            and isinstance(value, str)
        }
        html = document(data, ROOT).encode('utf-8')
        filename = 'PBudget-ReadOnly-' + datetime.now(timezone(timedelta(hours=7))).strftime('%Y%m%d-%H%M%S') + '.html'
        return send_file(io.BytesIO(html), mimetype='text/html; charset=utf-8', as_attachment=True, download_name=filename)

    @app.get('/api/reports/disbursement.xlsx')
    def export_disbursement_report():
        from disbursement_reports import workbook
        view = request.args.get('view', 'annual')
        mode = request.args.get('mode', 'calendar')
        plan = request.args.get('plan', 'cabinet')
        year = request.args.get('year', 'all')
        division = request.args.get('division', '')
        status = request.args.get('status', '')
        start = request.args.get('fromYear', '')
        end = request.args.get('toYear', '')
        if view not in ('annual', 'monthly') or mode not in ('calendar', 'fiscal') or plan not in ('cabinet', 'revised'):
            raise ApiError('ตัวเลือกรายงานไม่ถูกต้อง')
        if year != 'all' and (not year.isdecimal() or not 2400 <= int(year) <= 3000):
            raise ApiError('ปีรายงานไม่ถูกต้อง')
        for value in (start, end):
            if value and (not value.isdecimal() or not 2400 <= int(value) <= 3000):
                raise ApiError('ช่วงปีรายงานไม่ถูกต้อง')
        if start and end and int(start) > int(end):
            raise ApiError('ปีเริ่มต้นต้องไม่มากกว่าปีสิ้นสุด')
        with db() as conn:
            status_row = conn.execute('SELECT name FROM project_statuses WHERE id=?', (status,)).fetchone() if status else None
            if status and status_row is None:
                raise ApiError('ไม่พบสถานะโครงการ')
            items = [item for item in list_projects(conn) if (not division or item['details'].get('division', '').strip() == division) and (not status or item['statusId'] == status)]
        output = workbook(items, view=view, mode=mode, year=year, plan=plan, division=division, from_year=int(start) if start else None, to_year=int(end) if end else None, status_label=status_row['name'] if status_row else 'ทุกสถานะ')
        label = f'{start or "เริ่มต้น"}-{end or "สิ้นสุด"}' if start or end else year
        return send_file(output, as_attachment=True, download_name=f'แผนราย{"ปี" if view == "annual" else "เดือน"}-{label}.xlsx', mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')

    @app.get("/api/projects/<project_id>")
    def project(project_id):
        with db() as conn:
            return jsonify(get_project(conn, project_id))

    @app.post("/api/projects")
    def add_project():
        data = body()
        if "code" in data or "id" in data:
            raise ApiError("ระบบกำหนดรหัสและ ID อัตโนมัติเมื่อบันทึก")
        with db(True) as conn:
            values = validate_project(conn, data)
            return jsonify(insert_project(conn, values, allocate_code(conn, current_year()))), 201

    @app.put("/api/projects/<project_id>")
    def update_project(project_id):
        data = body()
        with db(True) as conn:
            previous = get_project(conn, project_id)
            check_version(data, previous)
            if ("code" in data and data["code"] != previous["code"]) or (
                "id" in data and data["id"] != project_id
            ):
                raise ApiError("ไม่สามารถแก้ไขรหัสหรือ ID โครงการ")
            values = validate_project(conn, data, previous)
            columns = [
                "name",
                "funding_source_id",
                "status_id",
                "budget_baht",
                "spent_baht",
                "progress",
                *FINANCE_COLUMNS,
                "details_json",
            ]
            conn.execute(
                "UPDATE projects SET "
                + ",".join(c + "=?" for c in columns)
                + ",updated_at=?,version=version+1 WHERE id=?",
                (*values, now(), project_id),
            )
            result = get_project(conn, project_id)
            event(conn, project_id, "update", result)
            return jsonify(result)

    @app.delete("/api/projects/<project_id>")
    def delete_project(project_id):
        data = body()
        with db(True) as conn:
            previous = get_project(conn, project_id)
            check_version(data, previous)
            stamp = now()
            conn.execute(
                "UPDATE projects SET deleted_at=?,updated_at=?,version=version+1 WHERE id=?",
                (stamp, stamp, project_id),
            )
            event(conn, project_id, "delete", previous)
        return jsonify(deleted=True)

    @app.get("/api/projects/<project_id>/history")
    def history(project_id):
        with db() as conn:
            rows = conn.execute(
                "SELECT action,snapshot_json,occurred_at FROM project_events WHERE project_id=? ORDER BY id",
                (project_id,),
            )
            return jsonify(
                events=[
                    {
                        "action": r["action"],
                        "project": json.loads(r["snapshot_json"]),
                        "at": r["occurred_at"],
                    }
                    for r in rows
                ]
            )

    @app.get("/api/masters")
    def masters():
        with db() as conn:
            return jsonify(read_masters(conn))

    @app.route("/nine-box-app/")
    @app.route("/nine-box-app/<path:filename>")
    def nine_box_app(filename="index.html"):
        return send_from_directory(str(NINE_BOX_DIR), filename)

    @app.route("/api/masters/<kind>", methods=["POST"])
    @app.route("/api/masters/<kind>/<master_id>", methods=["PUT"])
    def write_master(kind, master_id=None):
        table = MASTER_TABLES.get(kind)
        if not table:
            raise ApiError("ไม่พบประเภทข้อมูลหลัก", 404)
        if kind == "funding-sources" and (
            not master_id or master_id not in {"domestic-loan", "foreign-loan", "pea-revenue", "oh", "idc"}
        ):
            raise ApiError(
                "แหล่งเงินหลักมีเฉพาะเงินกู้และเงินรายได้ โดย OH และ IDC เป็นส่วนของเงินรายได้"
            )
        data = body()
        code, name, active, terminal = master_values(kind, data)
        with db(True) as conn:
            stamp = now()
            if master_id:
                old = conn.execute(f"SELECT * FROM {table} WHERE id=?", (master_id,)).fetchone()
                if old is None:
                    raise ApiError("ไม่พบข้อมูลหลัก", 404)
                check_version(data, old)
                if code != old["code"]:
                    raise ApiError("ไม่สามารถแก้ไขรหัสข้อมูลหลัก")
                conn.execute(
                    f"UPDATE {table} SET name=?,active=?,updated_at=?,version=version+1 WHERE id=?",
                    (name, active, stamp, master_id),
                )
            else:
                if kind == "fiscal-years" and conn.execute(
                    "SELECT 1 FROM fiscal_years WHERE code=?", (code,)
                ).fetchone():
                    raise ApiError("มีปีงบประมาณนี้ในข้อมูลหลักแล้ว", 409)
                master_id = insert_master(conn, kind, code, name, active, terminal, stamp)
            if kind == "statuses" and request.method == "PUT":
                conn.execute(
                    "UPDATE project_statuses SET is_terminal=? WHERE id=?", (terminal, master_id)
                )
            return jsonify(
                master_item(
                    conn.execute(f"SELECT * FROM {table} WHERE id=?", (master_id,)).fetchone()
                )
            ), (200 if request.method == "PUT" else 201)

    @app.get("/api/backup")
    def backup():
        # Portable project export; full DB download also includes tombstones, history and counters.
        with db() as conn:
            return jsonify(
                schemaVersion=4,
                exportedAt=now(),
                projects=list_projects(conn),
                masters=read_masters(conn),
            )

    @app.get("/api/backup/database")
    def database_backup():
        from maintenance import BACKUP_LOCK, retained_backup
        with BACKUP_LOCK:
            backup_file = retained_backup(app.config['DATABASE'])
            content = backup_file.read_bytes()
        return send_file(
            io.BytesIO(content),
            mimetype="application/vnd.sqlite3",
            as_attachment=True,
            download_name=backup_file.name,
        )

    @app.post("/api/import")
    def import_projects():
        payload = request.get_json()
        items = (
            payload
            if isinstance(payload, list)
            else payload.get("projects") if isinstance(payload, dict) else None
        )
        if not isinstance(items, list) or len(items) > 10000:
            raise ApiError("ต้องเป็นรายการโครงการไม่เกิน 10,000 รายการ")
        if isinstance(payload, dict) and payload.get("schemaVersion") not in (1, 2, 4):
            raise ApiError("ไม่รองรับเวอร์ชันไฟล์สำรองนี้")
        with db(True) as conn:
            # Portable exports carry custom master values. Merge by code, never overwrite existing definitions.
            id_maps = {kind: {} for kind in MASTER_TABLES}
            if isinstance(payload, dict):
                supplied = payload.get("masters", {})
                if not isinstance(supplied, dict):
                    raise ApiError("ข้อมูลหลักในไฟล์ไม่ถูกต้อง")
                for kind, table in MASTER_TABLES.items():
                    entries = supplied.get(kind, [])
                    if not isinstance(entries, list):
                        raise ApiError("ข้อมูลหลักต้องเป็นรายการ")
                    for item in entries:
                        if not isinstance(item, dict):
                            raise ApiError("ข้อมูลหลักไม่ถูกต้อง")
                        old_id = text_field(item.get("id"), "ID ข้อมูลหลัก", 100)
                        code, name, active, terminal = master_values(kind, item, importing=True)
                        existing = conn.execute(
                            f"SELECT * FROM {table} WHERE code=?", (code,)
                        ).fetchone()
                        if existing:
                            legacy_name = kind == "funding-sources" and (code, name) in {
                                ("LOAN", "เงินกู้ในประเทศ"),
                                ("REVENUE", "เงินรายได้ กฟภ."),
                            }
                            if existing["name"] != name and not legacy_name:
                                raise ApiError(f"ข้อมูลหลัก {code} มีชื่อไม่ตรงกับฐานข้อมูล", 409)
                            id_maps[kind][old_id] = existing["id"]
                            continue
                        if kind == "funding-sources":
                            raise ApiError(
                                "ไฟล์มีแหล่งเงินที่ไม่รองรับ กรุณาจัดประเภทเป็นเงินกู้หรือเงินรายได้ก่อนนำเข้า"
                            )
                        new_id = insert_master(conn, kind, code, name, active, terminal, now())
                        id_maps[kind][old_id] = new_id
            imported, skipped = 0, 0
            for original in items:
                if not isinstance(original, dict):
                    raise ApiError("ข้อมูลโครงการในไฟล์ไม่ถูกต้อง")
                item = dict(original)
                for key, kind, label in [
                    ("fundId", "funding-sources", "fund"),
                    ("statusId", "statuses", "status"),
                ]:
                    if key in item:
                        item[key] = (
                            id_maps[kind].get(item[key], item[key])
                            if isinstance(item[key], str)
                            else None
                        )
                    else:
                        label_value = item.get(label)
                        if kind == "funding-sources" and isinstance(label_value, str):
                            label_value = {
                                "เงินกู้ในประเทศ": "เงินกู้",
                                "เงินรายได้ กฟภ.": "เงินรายได้",
                            }.get(label_value, label_value)
                        row = (
                            conn.execute(
                                f"SELECT id FROM {MASTER_TABLES[kind]} WHERE name=?", (label_value,)
                            ).fetchone()
                            if isinstance(label_value, str)
                            else None
                        )
                        item[key] = row[0] if row else None
                if isinstance(item.get("details"), dict) and item["details"].get("projectType"):
                    item["details"] = dict(item["details"])
                    if not isinstance(item["details"]["projectType"], str):
                        raise ApiError("ประเภทโครงการไม่ถูกต้อง")
                    item["details"]["projectType"] = id_maps["project-types"].get(
                        item["details"]["projectType"], item["details"]["projectType"]
                    )
                # Import may preserve references to inactive masters, unlike creating a new project.
                values = validate_project(conn, item, item)
                code = text_field(item.get("code"), "รหัสโครงการเดิม", 60)
                original_id = item.get("id")
                if original_id is not None:
                    original_id = text_field(original_id, "ID โครงการ", 100)
                by_code = conn.execute("SELECT * FROM projects WHERE code=?", (code,)).fetchone()
                if by_code:
                    compared = (
                        by_code["name"],
                        by_code["funding_source_id"],
                        by_code["status_id"],
                        by_code["budget_baht"],
                        by_code["spent_baht"],
                        by_code["progress"],
                        *(by_code[c] for c in FINANCE_COLUMNS),
                        json.dumps(
                            profile_details(
                                {"details": json.loads(by_code["details_json"])}, None, ApiError
                            ),
                            ensure_ascii=False,
                            sort_keys=True,
                        ),
                    )
                    if by_code["deleted_at"] is None and compared == values:
                        skipped += 1
                        continue
                    raise ApiError(
                        f"รหัส {code} มีอยู่แล้วแต่ข้อมูลต่างกัน หรือถูกลบแล้ว ไม่มีการนำเข้า", 409
                    )
                if (
                    original_id
                    and conn.execute("SELECT 1 FROM projects WHERE id=?", (original_id,)).fetchone()
                ):
                    raise ApiError(f"ID ของโครงการ {code} ซ้ำกับฐานข้อมูล", 409)
                insert_project(conn, values, code, original_id, "import")
                sync_imported_code(conn, code)
                imported += 1
        return jsonify(imported=imported, skipped=skipped)

    from meetings import register_meetings

    register_meetings(
        app,
        db,
        error=ApiError,
        money=money,
        get_project=get_project,
        now=now,
        check_version=check_version,
        text_field=text_field,
    )
    from meeting_workspace import register_workspace

    register_workspace(app, db, error=ApiError, now=now, check_version=check_version)
    from nine_box import register_nine_box

    register_nine_box(app, db, error=ApiError, now=now)
    from patch_updates import register_updates

    register_updates(app, ApiError)
    return app


if __name__ == "__main__":
    from desktop_launcher import run

    run(create_app)
