# MeetingBudget integration

Adapted from the user's `MeetingBudget_Test.zip` (`index.html`, `project_detail.html`, Excel parser in `app.py`). Original source is retained for local reference under `.imports/MeetingBudget_Test/` (ignored by version control). No original Python startup, native file picker, database replacement, or global delete code is executed by the server.

The pages run inside the existing P-Budget meeting panel. Their spreadsheet styling is isolated in a same-origin iframe. Navigation between summary and project detail stays inside that panel. `assets/bridge.js` connects original interactions to the selected round; `meeting_workspace.py` implements the API. All runtime assets are local.

## Data and calculations

- Project UUID/code and snapshots use `projects` / `meeting_projects` in `data/master.db`. Zero approved budget is permitted for a draft. No annual plan amount is guessed from whole-project funding.
- `workspace_json` stores annual plans, detailed changes, decisions and Workflow. `workspace_meta_json` stores display groups/order and original import codes. Both share the entry version. Writes append history and increment round version; closed rounds reject writes.
- The source year mapping remains: meeting Y; changes Y+1; setting Y+2; plan Y through Y+5. Workflow has fourteen additional future-year columns.
- Carryover = prior remaining minus prior uncommitted. Annual total = carryover + annual investment + changes before meeting + meeting change. Remaining = annual total minus postmeeting payout target.
- The change-year summary's **ผูกพัน** column reads the same year's `committed` amount shown in the annual plan row **ผูกพันยกมา** (for example, 2570); it is included as a reference alongside the investment change calculations.
- The adjacent **รวม** column is calculated as change-year **ผูกพันยกมา + ตั้งงบประจำปี** (`committed + budget_before`).
- Original summary cards show **annual new investment for the setting year**, excluding carryover, and may show a negative remaining amount. Switching the lower summary table does not change those cards; the badge identifies the setting year.
- Blank post target falls back to the pre target; explicit zero remains zero. Amounts use million THB, three decimal places. OH and IDC remain components of revenue, never additional funding sources.
- Source dashboard fund splits are entered separately and show a mismatch warning when they do not equal the summary totals. They are not automatically inferred from total project financing.
- General project section 2.7 work quantity is available in Tab 1. It includes item/unit, whole-project quantity, prior cumulative quantity, meeting-year actual and forecast quantities, calculated meeting-year total, calculated cumulative quantity and remaining quantity. Percentage inputs for prior cumulative, meeting-year actual, forecast, change-year and setting-year quantities are editable and saved per meeting round. Meeting-year total percentage is actual + forecast; cumulative percentage is prior + meeting-year total; remaining percentage is 100% - cumulative - change-year - setting-year. Calculated quantity values use actual + forecast and prior cumulative + meeting-year total; remaining quantity is whole-project quantity - cumulative quantity - change-year quantity - setting-year quantity. Formula indexes (1) through (7) appear in the relevant table headers. Rows can be added, edited, deleted and saved per round. The prior and meeting-year columns through calculated cumulative quantity can be hidden per round; change-year, setting-year and remaining quantity stay visible. Historical columns default to hidden when no prior/actual/forecast values exist. Older work-volume records remain loadable; newly added quantity fields default to blank. Returns are section 2.8; Workflow template quantity/unit columns remain.
- Base profile fields in the meeting are captured Master DB values. Supplementary plan fields, meeting status/decisions, monthly detail and Workflow are round data. Editing a meeting never overwrites master project budgets.

## Import and backup

The meeting menu imports legacy `.mbg` / `.db` files additively into new rounds. It allocates PRJ codes, retains original codes in metadata, and uses a file SHA-256 to skip repeat imports of identical files. It does not replace Master DB. The same operation is available as:

```
python import_meeting_legacy.py path/to/meeting.mbg --database data/master.db
```

The round export is a JSON record for reporting/integration; it is not the old standalone `.mbg` save format. Full SQLite backup in Settings includes all meeting plans, histories and import mappings and is the supported complete backup. The project-only JSON export retains format version 4 and does not contain meetings.

Excel `.xlsx` / `.xlsm` import uses the original งป.016/1 parser with preview and year matching before confirmation. The request limit is 10 MiB. Formula cells require cached values from Excel; the parser reports missing cached values and does not evaluate Excel formulas.

## Validation

`python -m unittest -v test_server.py test_meetings.py test_project_profile.py test_meeting_workspace.py`

`python verify_meeting_workspace.py` and `python verify_meeting_workspace.py --mobile` use Chrome and a temporary database. The original ZIP database fixture must exist under `.imports/MeetingBudget_Test/budget.db`. Browser tests cover original before/after amounts, same-shell navigation, tabs, carryover, persistence, explicit-zero targets, and closed controls. Excel API tests generate a representative 016-1 workbook and check values, year mismatch and restart persistence.

## Bundled dependencies

- daisyUI 5 and Tailwind CSS 4 (MIT), compiled locally for the two-year dashboard
  into `assets/daisyui.css`. Run `npm run build:meeting-ui` after changing
  `ui/daisyui.css` or component classes. Only prefixed `du-` components are enabled;
  no preflight, built-in theme, Node runtime or network connection is needed in
  the distributed application. License files are included beside the stylesheet.
- Bootstrap 5.3.0 CSS / JS (MIT), copied from jsDelivr distribution.
- Chart.js 4.4.8 UMD (MIT), copied from jsDelivr distribution.
- Font Awesome Free 6.4.0 CSS (MIT) and webfonts (SIL OFL 1.1), copied from cdnjs distribution; original license headers retained.
- openpyxl 3.1.5 is a Python requirement for Excel import.
