# P-Budget Master API v1

## Current project profile contract — schema/export 4

New clients send `name`, `statusId`, `progress`, `finances`, and `details`. Example financing object: `{loan: 6, revenue: 4, oh: 1, idc: 0.5, loanSpent: 1, revenueSpent: 0.5}`. All amounts are millions of THB, at most three decimals. Total budget is loan + revenue (OH/IDC already included in revenue); total spent is loanSpent + revenueSpent. The server computes these totals and rejects contradictory supplied `budget`/`spent`. OH+IDC cannot exceed revenue, and spending from each source cannot exceed its allocation. Both funding sources may be used simultaneously.

`details` supports optional text: `shortName`, `nationalDevelopmentPlan` (up to 180 characters), `director`, `department`, `division`, `objectives`, `area`, `statusNotes`, `studySource`; ISO dates: `startDate`, `endDate`, `cabinetDate`, `studyDate`; `projectType` is a `project-types` master ID or empty. The initial IDs are `continuing` and `new`. Optional numbers: `paybackYears` (nonnegative years), `npv` (million THB), `firr` and `eirr` (percent). Blank return estimates are null, not zero. Negative NPV/FIRR/EIRR are accepted. End date cannot precede start date. Omitted detail properties retain their saved values on edit. No work-quantity fields are included.

Responses include full `finances` and `details`. Financial columns are integer baht; descriptive fields are validated and stored in `details_json`. For mixed financing, `fundingSourceId` is `mixed` and `fund` is a combined display label. The legacy `fundId` column remains for backward compatibility only; **aggregate using `finances.loan` and `finances.revenue`**, never assigning an entire mixed project to its legacy fundId. New snapshots in meetings include these fields. Older snapshots remain immutable.

Schema 4 migrations preserve legacy amounts. Unknown legacy sources become `finances.unallocated`/`unallocatedSpent` rather than being guessed; unchanged legacy balances can be exported/imported, while new projects must use the two supported sources. The UI requires users to classify unknown balances when editing. Legacy single-source API payloads remain accepted, but changing mixed project totals requires an explicit financing object. JSON exports now use schemaVersion 4; imports accept legacy arrays and versions 1, 2, and 4. SQLite backups include the entire database including meetings.

The sections below describe existing endpoints and earlier contracts; this schema 4 financing contract takes precedence over the older single-source examples.

## Budget meetings (database schema 3)

The meeting module stores independent budget proposals and immutable project snapshots. It does not modify project master budgets. Full SQLite backup includes meetings; `/api/backup` remains the version 2 project-only export format.

| Method | Route | Behavior |
|---|---|---|
| GET | `/api/meetings` | List rounds with project counts, newest year/round first |
| POST | `/api/meetings` | `{year: 2569, round: 1, title: "...", date: "2026-09-21"}`; unique year/round |
| GET | `/api/meetings/{id}` | Round, project snapshots, before/after/difference/pending summary |
| POST | `/api/meetings/{id}/projects` | `{projectIds: [...]}`; atomic addition; snapshots captured from active projects |
| PUT | `/api/meetings/{id}/projects/{entryId}` | Save proposal, 12 monthly values, reason, notes, reviewed status; requires entry version |
| GET | `/api/meetings/{id}/projects/{entryId}/history` | Saved snapshots newest first |
| POST | `/api/meetings/{id}/close` | `{version: n}` using current round version; all entries must be reviewed |

Entry update body: `{version: 1, afterBudget: "8.000", monthlyPlan: [0,0,0,0,0,0,0,0,0,0,0,0], reason: "Reduced scope", notes: "...", reviewed: true}`. Money uses millions of THB with at most three decimals, persisted as integer baht. Monthly values run January–December and must total no more than afterBudget. Changed budgets require a nonempty reason. The before snapshot is immutable. New entries initialize afterBudget to beforeBudget and reviewed to false; summaries include those provisional values and expose pending counts. Closing a round rejects empty or unreviewed rounds, then prevents all further entry writes. Stale entry/round versions return 409.

Funding hierarchy update (database/export schema 2): `funding_sources.parent_id` links `oh` and `idc` to `pea-revenue`. The active root sources are `domestic-loan` (เงินกู้), `foreign-loan` (เงินกู้ต่างประเทศ), and `pea-revenue` (เงินรายได้). Schema 10 removes the legacy parent relation for `foreign-loan`, preserving existing project references. Project allocation still uses the existing finance fields. POST projects still accepts `fundId` as the selected leaf: use `oh` or `idc` for those revenue components. Responses additionally include `fundingSourceId` (root ID) and `fundComponent` (OH/IDC or null); `fund` is the root name. Aggregate charts by `fundingSourceId`, never by the leaf ID. The UI allows one selected component per project, not allocation of multiple component amounts within a project.

Funding-source creation is disabled. Updates are allowed for the four configured funding records only; their hierarchy cannot be changed through the API. Status creation remains available. Imports accept schema 1 or 2 and legacy arrays, translating old root names. Unknown funding sources in imports are rejected; existing legacy sources are retained but deactivated during migration. New exports use schemaVersion 2.

Base URL: `http://127.0.0.1:8080`. JSON UTF-8; write requests use `Content-Type: application/json`. No authentication in this local version. Browser writes must come from the same origin. Errors use `{"error": "message"}`.

| Method | Path | Result |
|---|---|---|
| GET | `/api/bootstrap` | Consistent snapshot: projects, masters, schemaVersion, yearBE, codeFormat |
| GET | `/api/projects` | `{projects: [...]}` excluding soft-deleted records |
| GET | `/api/projects/{id}` | One project |
| POST | `/api/projects` | Create and allocate code; HTTP 201 |
| PUT | `/api/projects/{id}` | Update mutable fields; requires current `version` |
| DELETE | `/api/projects/{id}` | Soft delete; JSON body `{version: 1}` |
| GET | `/api/projects/{id}/history` | `{events: [{action, project, at}]}` including deleted projects |
| GET | `/api/masters` | `{funding-sources: [...], statuses: [...], fiscal-years: [...], project-types: [...]}` |
| POST | `/api/masters/{kind}` | Add master, where kind is `statuses`, `fiscal-years`, or `project-types` (`funding-sources` are fixed) |
| PUT | `/api/masters/{kind}/{id}` | Rename/activate/deactivate; requires version |

| GET | `/api/backup` | Portable JSON: schemaVersion, exportedAt, projects, masters |
| GET | `/api/backup/database` | Consistent full SQLite snapshot download |
| POST | `/api/import` | Atomic additive import of a legacy array or v1 export |

`fiscal-years` (database schema 8) stores Buddhist Era budget years as four-digit codes from 2400 through 3000. Names are generated as `ปีงบประมาณ {code}`. The initial list contains 2569–2575. The server automatically keeps the current Thai fiscal year (October–September) and five future years available, retaining older records and their active settings. These are master records only; meeting-year configuration and project allocation behavior are unchanged.

`project-types` (database schema 9) starts with `CONTINUING` / โครงการต่อเนื่อง and `NEW` / โครงการใหม่. Projects store the master ID in `details.projectType`; inactive types remain available to projects already using them, but cannot be newly selected. Master changes are included in portable exports and imports.

## Create project

Do not send `code` or `id`: the server generates them transactionally.

```json
{
  "name": "โครงการปรับปรุงระบบจำหน่าย",
  "fundId": "domestic-loan",
  "statusId": "started",
  "budget": "12.345",
  "spent": "0.123",
  "progress": 1
}
```

Money is in millions of THB, at most three decimal places. Decimal strings are recommended; JSON numbers are also accepted. The database stores integer baht. Budget must be positive and at most 9,000,000,000 million THB; spending is nonnegative and no greater than budget. Progress is finite and between 0 and 100. References must exist and be active for new projects.

Response fields: `id`, `code`, `name`, `fundId`, `statusId`, `fund` (current name), `status` (current name), `isTerminal`, `budget`, `spent`, `progress`, `version`, `createdAt`, `updated`.

Updates use the same mutable fields plus `version`. A stale version returns HTTP 409. UUIDs and codes are immutable. Deleted projects return 404 from GET/PUT; their history remains available. Calendar-year codes use Bangkok time and Buddhist Era; this is not fiscal-year numbering.

## Master data

```json
{
  "code": "INVESTMENT",
  "name": "งบลงทุน",
  "active": true
}
```

For statuses also send `is_terminal` (boolean). PUT requires `version` and the unchanged code. Codes allow A–Z, 0–9, underscore and hyphen, up to 30 characters; names up to 100 characters. Code and name are unique within each master table. Deactivation preserves existing references. A project may retain its inactive master on edit, but cannot switch to another inactive master.

## Import and backup semantics

Legacy arrays use `fund` and `status` names. Existing master names must match. Version 1 exports carry master IDs and definitions; import merges custom masters by code, maps their IDs, and never renames an existing definition. If a matching master code has a different name, import fails with 409.

Import preserves original project IDs and codes where provided, creates new timestamps/history, and advances the code counter for `PRJ-BBBB-NNNNN` codes. Exact duplicates by code and project fields are skipped. Conflicting codes, deleted codes, duplicate IDs, invalid numbers, or missing master references cause the entire import to roll back. Response: `{imported: 3, skipped: 1}`. Maximum request size is 10 MB and 10,000 projects.

Portable JSON excludes deleted rows, sequence history, and audit history. Use the full database snapshot for recovery that must preserve all issued codes and history. See README for restore instructions.

## Extending the database

Use immutable `projects.id` as the reference for future budgets, monthly plans, contracts and disbursements. Legacy imported IDs may not be UUIDs, so consumers must treat IDs as opaque strings. Do not generate project codes on the client or insert projects directly; use POST so counter allocation and audit events remain consistent. Current schema version is recorded in `schema_migrations`; add an explicitly applied migration for future schema changes.

This API is local and unauthenticated. It is not a production authorization boundary. Add identity, access control, authenticated audit actors and a deployment server before sharing over a network.
# Meeting workspace (database schema 5)

`GET /api/bootstrap` now reports `schemaVersion: 6`. Project JSON export remains contract version 4; full SQLite backup includes meeting tables, nine-box plans, and pre-import backups.

### Nine-box plans (schema 6)

`GET /api/storage-info` returns the active absolute `databasePath`, `backupDirectory`, and `latestBackup` (path, size in bytes, createdAt; null before the first backup). The desktop app remains local to 127.0.0.1. On opening an existing database, a consistent SQLite backup is created once per local calendar day and before migrations. A failed backup prevents startup/migration. Backups are retained until manually archived or removed; they are not automatically rotated.

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/nine-box` | `{yearsData, currentYear, version}`; version 0 means uninitialized |
| PUT | `/api/nine-box` | Save `{yearsData, currentYear, version}`; returns new version |
| POST | `/api/nine-box/import/preview` | Validate `{yearsData, currentYear?}` without writing; returns normalized data and year/project counts |
| POST | `/api/nine-box/import` | Validate and replace with optimistic version check, atomically preserving prior data; returns version and backupId |
| GET | `/api/nine-box/backups` | List pre-import backup metadata, newest first |
| GET | `/api/nine-box/backups/<id>` | Download the previous yearsData JSON, suitable for preview/import |

Invalid plans return 400; stale versions return 409 without changing either plan or backups. Years must be 2500–2700. Projects require names and financial items with supported, unique sources and finite numeric bComm/bInv/tComm/tInv. The legacy revenue spelling is normalized. Optional legacy fields are retained. The existing 10 MB request limit applies; the file picker accepts files up to 9 MB to leave room for request metadata.

For version 0, `GET /api/nine-box` suggests the current calendar BE year using Bangkok time, without persisting it. The new-plan screen requires an explicit start-year selection before editing; `PUT /api/nine-box` with version 0 saves that year. This suggestion is not an automatic fiscal-calendar rule. Persisted/imported years remain unchanged across calendar years, reloads, and app updates.

The selected round's original application APIs are under `/api/meeting-workspaces/{meetingId}/api`:

| Method / path | Purpose |
| --- | --- |
| GET `/config` | Immutable round year, Y..Y+5 plan range, Y+1 change year, Y+2 setting year, closed/read-only flag |
| GET `/project-master` | Round membership and display metadata; master UUID and immutable PRJ code |
| GET `/get-project/{code}` | Snapshot plus complete meeting document and entry version |
| POST `/save-project` | Document and `version`; 409 on stale version or closed round |
| PUT `/project-master/{code}` | Category/display flags and `version`; master identity is never edited here |
| POST `/project-master/reorder` | `summary_group`, `ordered_codes`, `versions` map |
| GET `/dashboard/{year}` | Annual new investment and before/after payout projections |
| GET/POST `/dashboard-fund-sources/{meetingYear}` | Manual loan/revenue splits; POST includes state `version` (0 before first save) |
| GET `/workflow/status` | Excel importer availability |
| POST `/workflow/import-preview` | Multipart `file`; parser output and year-match preview; does not save |
| GET `/export` | JSON record of the complete round for downstream use |

`POST /api/meeting-workspaces/import` accepts multipart `file` containing a legacy `.db` or `.mbg`. Import is atomic and additive, generates new master project codes, and returns original-code mappings plus round IDs. Identical file content is skipped by hash. No endpoint replaces the master database or implements the old global delete operations.

Documents store `budget`, `detailBudget`, `workflow`, comments and decision. See [meeting-app/INTEGRATION.md](meeting-app/INTEGRATION.md) for formulas, funding semantics, backup coverage and import details. General project quantity is editable in Tab 1 section 2.7 and saved in the round document `work_volume` field; existing legacy payload is loaded. All writes retain the existing same-origin guard.

# รายงาน Excel

`GET /api/reports/disbursement.xlsx` ส่งออกข้อมูลที่บันทึกแล้วโดยไม่แก้ฐานข้อมูล
ตัวเลือก: `view=annual|monthly`, `mode=calendar|fiscal`, `year=all|ปี พ.ศ.`,
`plan=cabinet|revised`, `division=ชื่อสายงาน` (เว้นว่างสำหรับทุกสายงาน)
เพิ่ม `fromYear=ปีเริ่มต้น`, `toYear=ปีสิ้นสุด` (รวมทั้งสองปี) และ
`status=ID สถานะโครงการ` (เว้นว่างสำหรับทุกสถานะ) ปีเริ่มต้นต้องไม่เกินปีสิ้นสุด
แสดงเป้าหมายและเบิกจ่ายจริงแยกแหล่งเงิน หน่วยล้านบาท ทศนิยม 3 ตำแหน่ง
ปี/เดือนเรียงเป็นคอลัมน์แนวนอน คอลัมน์แผน/ผลอยู่ก่อนแหล่งเงิน
แต่ละโครงการแบ่งกลุ่มแผนและกลุ่มผล แต่ละกลุ่มแสดงแหล่งเงินและแถวรวม
ส่วนรวมทั้งหมดแยกเงินกู้ (ในประเทศ + ต่างประเทศ), เงินรายได้ และรวมสองแหล่ง
สำหรับทั้งแผนและผล
ชื่อโครงการแสดงครั้งเดียว โดยรวมช่องชื่อและข้อมูลโครงการครอบคลุมแถวที่เกี่ยวข้อง
ช่องว่างหมายถึงยังไม่มีข้อมูล ส่วนค่าศูนย์ที่บันทึกจะแสดง 0.000

# Portable HTML export

`GET /api/reports/snapshot.html` downloads a self-contained read-only HTML file.
Includes all saved active master projects and profiles, all meeting rounds with
round-scoped documents/Workflow and grouping/fund data, the current nine-box
dataset and master lists. A single read transaction keeps these data consistent.
No report filters apply. The optional `theme=light|dark` uses the current shell
theme. The file is a dated copy, not a database backup or an editable application;
it contains no DB path or backup files. The original shell/modules are bundled
with all CSS/JS/fonts, including iframe screens. The offline adapter serves saved
GET responses from memory and rejects writes. CSP blocks network connections,
eval and form submission. There is no schema migration. html-portable.js and
assets/fonts must be packaged via PBudgetManager.spec when distributing an EXE.

