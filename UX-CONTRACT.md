# P-Budget UI ownership and preservation contract

Business sources: README.md and API.md (schema 4 financial rules, project
lifecycle and optimistic version checks). These sources override UI presentation.
Current task: main dashboard and meeting dashboard redesign; preserve existing behavior and data.

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Table Selection | app.js render/navigation handlers | API.md, existing project workflow | Dashboard recent five; Projects selected row | View-all and project navigation |
| Select/Listbox | index.html status/division native selects | Existing shared filters | Native OS popup | Keyboard selection; filtered totals and rows |
| Date | app.js formatters | README.md, API.md | Existing Thai date display | Today and updated columns |
| Form | project-form.js | API.md | Existing create/edit dialog | Open/cancel smoke; no persistence change |
| Scrollbar | style.css | DESIGN.md | Document and internal table/chart overflow | Narrow viewport and keyboard scroll |
| Toast | app.js and #toast | Existing shared feedback | role=status | Existing handlers preserved |
| CRUD | app.js, project-form.js, server.py | API.md | Existing lifecycle and version checks | Existing repository tests; outside redesign |

Dashboard scope is the existing status/division/search state. Cumulative metrics,
the annual/monthly chart and the single project table use that same scope by default.
Selecting a comparison row scopes only the chart to that project. Its native
name button supports Enter/Space and aria-pressed; clicking the row again or
“แสดงทุกโครงการ” restores the filtered chart. The editor button remains independent.
Chart selection survives year/plan/view changes, resets when the project leaves
the filter scope, and never changes summary cards, table totals or saved data.
The Reports menu has annual and monthly routes with independent transient report
filters. Export uses saved database values, includes target/actual and three
funding sources, keeps missing entries blank, prevents repeat export while busy,
and shows failures inline for retry. It does not alter the dashboard filters or
database. Native sidebar disclosure supports keyboard expansion.
Plan/results table search, status tabs and page size filter only the comparison
table; they do not change the chart or stored data. The footer totals all matching records across all pages and names that scope explicitly. Default page size is 6.
User-approved actual/plan thresholds: >=100% complete; >=90% on track;
>=80% caution; below 80% delayed. Missing actuals or non-positive/missing plans
have no rate/status judgment. A total containing such rows is marked incomplete.
The On track tab includes completed rows; Delayed selects only below 80%.
The options dropdown exposes caution, complete and missing-data filters as well.
Search supports Thai composition, retains focus, and resets pagination. Search,
filter, page-size and pagination state survive route changes in memory.

Settings offers an all-pages HTML snapshot. Its scope is all saved
projects/meeting rounds/nine-box/master data, independent of report filters, and
is stated next to the action. Export is single-flight with a live status and retry
after failure. The portable file reuses the original app shell and module assets,
including project profiles, meeting details/Workflow and nine-box iframes. Their
existing layout and scroll ownership are preserved. Navigation, search, year/
project/round selectors, fullscreen and funding display toggles work in memory.
Save/import/delete/restore/update actions and editable fields are disabled; the
offline transport rejects writes and CSP blocks network connections. Read-only
controls must not disable view tabs, filters or collapse/expand controls.
The snapshot timestamp and read-only badge remain visible. The downloaded file
is for sharing a dated view and does not replace a restorable database backup.
DashboardAnalytics in app.js reads saved details.monthlyDisbursement without writes, using the same canonical
calendar month keys as disbursement-plan.js. Fiscal periods are October of the
previous BE year through September; calendar periods January–December.
Both Home and the project disbursement editor default to calendar mode (January–December).
Home defaults its year selector to All years, aggregating recorded amounts across
all available years in the project table and showing months chronologically across
those years. Selecting one year narrows that view; annual year buttons still drill
down. The editor defaults to the current Buddhist calendar year when available.
Fiscal mode remains selectable.
Cabinet or revised plan selection never changes stored data. All sources in saved history
are included, even if no longer selected in the investment tab. Charts and table
show millions with three decimals; recorded zero is distinct from missing data.
Rate is selected-period actual/selected plan, unavailable when plan is absent/zero
or actual absent. Coverage
counts and a partial-year note make incomplete recording visible. Historical
ledger years remain reachable outside the current timeline. These view selectors
are transient like the existing scope filters. The project comparison table owns
vertical/horizontal scrolling; it never constrains the surrounding page.
Approved budget is approvedLoan + approvedRevenue; the rate is spent / approved
budget, with no rate when approved budget is zero. The Projects page retains its
project-budget and progress columns. The dashboard defaults to annual view;
annual year selection opens monthly view and restores focus to its view button.
Clicking the monthly view button clears the year filter and returns to monthly
view for all years while retaining the selected project and plan.
Only one chart is visible. Four summary cards show project budget, actual approved
budget, cumulative spent and spent/approved (dash if approved is zero); they are
independent of the selected chart year/plan. Removed duplicate cumulative/status/recent/attention panels are
not rendered on Home. Existing Projects metrics and table remain accessible there.
The remaining table opens the existing editor without changing data. Search state remains the
existing transient input; URL-state migration is outside this visual task.
Native select popup geometry is platform-owned. No authored combobox is added.
Project investment sources use the native add-source select in project-form.js.
Domestic/foreign loan and revenue selections reveal matching amount fields once.
Each source has a remove action. Empty sources are removed immediately; populated
sources require an app-owned confirmation and clear their investment/approved
amounts (and OH/IDC for revenue). Removal cannot leave recorded spending above
the remaining source amount. Changes remain pending until the project is saved.
Foreign loan amounts are a persisted subset of aggregate loan and approved loan
amounts; reports continue consuming the aggregates. Existing loans open as domestic.
Investment XLSX imports use /api/investment-plan/preview without database writes.
File selection retrieves sheet names only and opens the sheet-selection dialog.
The user selects one sheet and confirms import there; only that sheet is parsed
and replaces the pending plan. Cancellation retains the previous plan.
The selected sheet's annual table is stored in details.investmentPlan only through
the existing project save/version checks. Import failures retain the previous plan;
save waits for import completion. Sheet selection, values and subtotal rows stay
as imported, without adding subtotals again or altering financing totals.
Project save retains the editor, active tab and scroll position. Successful saves
update the form ID/code/version and clean baseline; new projects replace the current
route with their assigned ID to prevent duplicate creation on the next save.
The displayed disbursement years follow the inclusive start/end years in tab 1.
Changing that range preserves stored month history. Annual and monthly tables
share fixed 200px label and 150px period columns with internal horizontal scrolling.
Monthly disbursement is stored by actual Buddhist calendar year/month. Fiscal
year Y spans October Y-1 through September Y; calendar year Y spans January to
December Y. Annual totals are sums of those months, with no duplicated storage.
Cabinet and revised plans do not change actual spending. Recorded actual amounts
Monthly input rows follow the funding sources selected in tab 2. Source changes
refresh the three monthly tables. Previously recorded month history is preserved.
aggregate into project loan/revenue spending server-side, preserving the existing
funding ceilings and save/version validation. Empty actual history keeps legacy
spending intact. Tab 2 amounts remain in baht. Disbursement table inputs and totals
display millions of baht with three decimal places; additional input decimals round
half up automatically. Canonical monthly storage stays in baht to preserve history.
Pasting one Excel row of 12 tab-separated values into a monthly source field maps
to the 12 months of the displayed period: October–September for fiscal mode,
January–December for calendar mode. Validate all cells before replacing any values; use the same million-unit
rounding as typed input. Blank/dash cells become zero; multi-row pastes are rejected.
Navigation remains hash-based. View-all opens Projects; add-project opens the
shared form. Connection failures retain the existing banner/retry action; empty
results retain existing copy. Theme switching retains the existing shared handler.
Focus rings and accessible names are presentation/accessibility improvements.

Legacy behavior in untouched forms, navigation and tables is implementation
evidence, not a declaration of WCAG compliance. Do not silently rewrite those
workflows to satisfy a dashboard-only audit. Record unrelated findings separately.

Meeting dashboard owners: meetings.js owns round selection and the iframe;
meeting-app/index.html owns summary tabs, cards and original interactions;
assets/bridge.js owns integration, theme synchronization, feedback and save behavior.
assets/theme-tokens.css owns shared theme values and scrollbar styles.
Native round selectors remain platform-owned. No changes to meeting data schemas,
year mapping, annual new investment calculation, source splits, negative balances,
closed-round permissions or database writes. See meeting-app/INTEGRATION.md,
API.md and MEETING-INDEPENDENT.md for authoritative financial/lifecycle context.

Financial summary source bars use the existing aggregate loan/revenue amounts;
The Home rate card uses a thick disbursement gauge: full capacity is actual
approved budget, fill is cumulative spent/approved capped visually at 100%.
The gauge uses the reference split-bar style: blue for spent, green for remaining,
percentages inside and matching amounts above; approved capacity is labeled below. Missing approved budget
leaves the fill empty and explains the unavailable ratio; spending over approved
retains the true rate and displays an over-budget message.
foreign loans remain within loan totals. Approved source bars use approvedLoan
and approvedRevenue only. Percentages are calculated from their matching pair,
with an empty track for zero total; the rate card uses actual approved budget.
