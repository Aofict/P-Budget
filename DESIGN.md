---
version: alpha
name: P-Budget Manager
description: Thai project-budget workspace with a financial review dashboard.
colors:
  background: "#071426"
  surface: "#0e2038"
  text: "#f2f6ff"
  muted: "#9eb3d3"
  primary: "#1578cf"
  accent: "#04b9ed"
typography:
  sans:
    fontFamily: "Noto Sans Thai, Tahoma, sans-serif"
rounded:
  panel: "12px"
  control: "8px"
spacing:
  panel: "24px"
  compact: "16px"
omitted:
  - section: components
    reason: Shared CSS component states are documented below; no generated component theme.
---

# P-Budget Manager design context

## Annual meeting plan shifting

The meeting project budget tab provides Shift +1 Year with a before/after preview.
It shifts the editable investment and disbursement plans (before/after meeting)
and next-year uncommitted amounts together. Cabinet-approved targets and derived
carry/remaining amounts are not shifted; derived values recalculate afterward.
The final year is an end-of-project bucket, so overflow accumulates there and
each row retains its total. Applying marks the form dirty and requires normal
Save; Undo Shift restores exact previous input values until another manual edit.
Read-only HTML blocks the shift controls. No database schema changes are needed.

## Shared application header

The แผนและผล menu precedes 9 ช่อง and opens #plan-results. The annual/monthly
chart and comparison table belong permanently to #plan-results-panel and are
displayed only on this route. Home displays the four financial cards. Shared
filter/view state persists across these two routes. No reference sample amounts,
forecast values or missing-as-zero rules from the supplied design replace the
existing saved-data calculations; missing plan/actual entries remain dashes.
The plan/results chart uses slate Plan bars and emerald Actual bars, a shared
five-tick numeric axis and dotted grid. Thailand-local current calendar/fiscal
year determines the year badge and shading of future plan periods. Four footer
cards derive displayed-period plan/actual totals, actual-to-plan rate and the
recorded period with the highest actual disbursement. Annual drilldown and the
monthly view reuse the existing period/sum functions. No fabricated forecasts
or comparison growth rates are inserted from the visual reference.

The welcome date widget is shared across every menu where it is displayed.
style.css owns its translucent surface, blur, calendar icon tile and Thai date
typography. The Home overview stylesheet owns only its grid placement.

Settings is one header entry with General settings and Master data tabs.
Existing #settings and #master routes select these tabs; master data editing,
backup and export actions retain their existing implementations.

index.html has one body-level .app-header containing the existing brand,
horizontal navigation, theme, notifications and profile controls. Project search lives
in the project table heading alongside its filters and is visible only on the Projects page.
The workspace spans the full width. Navigation wraps below the brand on tablets;
Reports uses a dropdown. The former sidebar and collapse behavior are removed.
meeting-app/assets/shell-header.css owns this layout and mobile density;
style.css retains the existing header colors and control treatments. app.js and
meetings.js resolve the shared .app-header for scroll offsets and behavior.
This does not change meeting table headers, widths or financial data.

## Tablet presentation

meeting-app/assets/tablet.css owns the compact tablet variant, loaded by the shell,
meeting summary/details and nine-box page. Coarse-pointer viewports 600–1366px
use smaller typography and spacing while desktop sizes remain unchanged. Native
screen controls and financial values remain unchanged. fullscreen-compat.js is
the shared adapter for fullscreen controls: it tries native fullscreen, then
expands the target and same-origin iframe ancestors inside the viewer if denied.
The adapter restores inline styles on exit/pagehide and emits fullscreenchange
for existing button, chart, modal and scroll handlers. Host-app chrome remains
outside the fallback's control. The compiled desktop bundle includes both files
through the existing meeting-app data directory; portable exports inline them.

## Portable HTML reading variant

Settings owns “ส่งออก HTML ทุกหน้า”, an all-saved-data export independent of report
filters, placed after database import. html_export.py takes a single SQLite read
transaction. html_portable.py packages index.html, the original CSS/JS, original
meeting screens and nine-box screens. html-portable.js adapts their GET requests
to the embedded snapshot and their iframe navigation to srcdoc. There is no second
visual implementation: fonts, sizes, layouts, charts, tables, themes, filters and
tabs come from the original modules. Noto Sans Thai is bundled with its OFL license
in assets/fonts; Font Awesome uses the existing local woff2 files. All assets and
base64-encoded UTF-8 JSON are in one HTML file. CSP forbids network connections and
form submission; the transport rejects every write. View state uses memory storage
only. Editing fields and write actions are locked, while navigation, display
filters, fullscreen and source chart toggles retain their existing behavior.
A small fixed read-only/timestamp notice does not change the screen layout.
The portable meeting workspace uses a same-origin body ResizeObserver to fit its
outer iframe directly. file:// and srcdoc message origins can differ; the normal
live message-origin checks remain intact. The outer page keeps scroll ownership,
and resizing is suspended during fullscreen/presentation then resumes afterward.

Light shell navigation uses a brown-grey palette through the existing light-theme rules in `style.css`. All routes inherit the same active and hover appearance; `meetings.css` does not override shell navigation colors. The blue brand mark and financial chart source colors retain their existing meanings.

## Purpose and direction
Product/admin register for Thai PEA budget staff reviewing project allocations,
disbursements and progress. README.md and API.md own product and financial rules.
The dashboard resembles a compact budget review sheet: one scope toolbar, four
cumulative metrics, one chart with annual/monthly views and one project comparison table.
Funding-source charts remain on the Budget page. Avoid marketing
hero layouts, decorative charts and new branding.

## Canonical tokens and typography
Runtime ownership is **meeting-app/assets/theme-tokens.css**, not generated from this document.
`:root` owns dark colors; `body.light` and the meeting dashboard's light selector share the existing light palette. style.css imports this single token source; the iframe links it directly.
Shared `.panel`, `.stat`, `.primary`, `.secondary`, `.filters`, `.table-scroll`
and `.ui-icon` remain the component owners. `.dashboard-view` is their budget
overview variant, not a second component system.
`--radius-panel`, `--space-panel`, `--action-fill`, `--on-action`, `--on-chart` and
`--scroll-*` map directly to CSS consumers. Existing `--bg`, `--surface`,
`--surface2`, `--border`, `--text`, `--muted`, `--blue`, `--cyan`, `--green`
remain canonical. The meeting dashboard's scoped daisyUI adapter in this file
maps semantic colors to these runtime tokens; it never enables a built-in theme.

Thai headings and body use the existing Noto Sans Thai/Tahoma stack; numeric
values use the same family with tabular numerals. Preserve offline fallback.
Heading 28–36px; metrics 24–38px; body 14px; secondary data 11–13px.
Keep Thai labels readable and wrap project names rather than clipping them.

## Layout and components
Home overview follows the supplied Stitch.html reference from the welcome title
and date through the scope filters and four financial cards only. The shared
navigation, page background, lower charts and project table keep their owners.
meeting-app/assets/dashboard-overview.css owns this business-specific variant,
loaded after legacy styles: light-theme financial cards share the Projects
cream gradient, border and soft shadow through --summary-card-background and
--summary-card-shadow in theme-tokens.css. Other overview surfaces retain thin blue-tinted borders,
12px corners, a funding donut on the left and three metrics on the right.
Dark surfaces inherit existing theme tokens. Keep native filter controls and
the existing source split checkbox, calculations and saved-data flow. The donut
center shows the actual largest allocation share; the total sits in its footer.
Reference-only quarterly targets and real-time sync claims are not product data.
No external fonts, icon services or Tailwind CDN scripts are loaded from Stitch.

The Home funding chart uses an SVG ring and a source detail panel. The existing
checkbox expands revenue into land/OH/IDC components. Loan is blue, revenue
teal, foreign loan cyan, land yellow, OH purple and IDC red. Component values
remain in millions; foreign loan is deducted from domestic loan, never added
twice to the total. The current visual treatment is the scoped Stitch variant
described above.
OH/IDC use finances. Land + OH + IDC must not exceed gross revenue. Existing
projects without land default to zero; details_json stores it without a schema
version change. Removing revenue clears all three component amounts together.
Natural document scrolling; never constrain the dashboard to viewport height.
Home financial summary follows the supplied asymmetric reference: total budget
is a loan/revenue donut on the left spanning three rows, with approved budget,
cumulative spent and rate cards stacked on the right. Below 900px all panels
stack. Donut labels include amounts/percentages; center shows total millions.
Zero allocation shows a neutral ring. Financial cards use gradient icon tile,
The summary is approximately 20% shorter through compact vertical padding,
smaller gaps. The total-budget donut is now up to 400px, with shaded blue/teal
segments, subtle depth shadows and larger center/legend typography per the latest
reference. Keep large amounts; source labels, units and
rate supporting totals use readable 14px text with the primary text color.
large amount with inline unit, loan/revenue split labels and stacked percentage
bar. The rate card pairs its progress bar with approved/spent totals. Retain all
four headings. Long money values remain readable. Card radius 24px is a Home financial
variant; other shared panels retain their radius. Reuse fundingBreakdown in app.js
for the existing Projects cards and Home; it owns the split labels/percentages.
Table columns remain intact
inside a keyboard-focusable horizontal scroll region. Mobile gutters are 16px.
Panel corners are 12px; surfaces and thin borders carry hierarchy without shadows.
Existing navigation and project detail/form layouts retain their behavior.

Primary actions use solid emphasis; secondary controls retain borders. Native
select popups are intentionally OS-owned. Visible focus uses the existing cyan
token; pressed/hover states do not move layout. Disabled/busy handling remains
with existing shared JavaScript. Reduced motion suppresses dashboard animation.
Global scrollbars use semantic tokens and forced-colors system fallback.

## Scope and verification
The Home disbursement-rate card shows its title, icon, percentage and one progress
tube using the same stat-source-bar dimensions as sibling cards, with a centered
spent percentage label inside. Source labels above the tube show cumulative
spent amounts for loan and revenue in millions. Remaining amounts and the
approved-budget footer are removed.
Its calculation remains cumulative actual / approved budget; unavailable rates
remain a dash. Other cumulative cards retain their financial breakdowns.
The Reports sidebar disclosure exposes annual/monthly Excel report routes.
Native controls select calendar/fiscal mode, year, plan kind and division.
Report years now use inclusive From/To controls; project status also filters
the export. Empty endpoints use the first/last available year. Invalid reversed
ranges disable export with an inline explanation; saved data remains unchanged.
disbursement_reports.py reads saved canonical months, preserving missing versus
recorded zero. Annual export groups years; monthly export creates one sheet per
year. Both include target and actual per funding source with totals in millions.
Reports are read-only and use /api/reports/disbursement.xlsx without schema changes.
Home combines status/division and native fiscal/calendar/year/plan selectors in
one toolbar. On wide screens, its two scope lines sit beside the controls to
reduce toolbar height by approximately half; below 1350px controls wrap with
compact spacing to preserve readable fields. Four cards show total project budget, actual approved budget,
cumulative disbursement and cumulative disbursement/approved budget. Cards follow
status/division/search scope, while year/plan selection controls the chart/table.
The chart defaults to annual; two native buttons switch monthly/annual views.
Selecting a project row in the dashboard comparison table scopes only the chart
to that project, with its name and an action to restore all filtered projects.
The name button supports keyboard selection; the selected row uses existing
theme tokens and a leading marker. Summary cards and table totals keep their
filter scope. Monthly/annual switching retains the chart selection.
Annual year buttons select a year and return to monthly view. Clicking the
monthly view button restores all years while retaining project selection.
The theme primary tone represents plan (blue in dark mode, brown in light mode), green actual.
Annual and monthly charts overlay a green actual trend line with point markers
on the existing bars. Missing actual periods break the line; recorded zeros keep
their point at the baseline. The overlay follows chart resizing and scrolling.
Long ranges scroll internally. One bounded project table shows plan, actual and
rate; omit the duplicate variance column, cumulative panels, status chart, recent
table and attention list. These are presentation removals, never data deletion.
Missing entries display a dash; recorded zero remains zero. Keep existing themes,
Thai typography, shared filters and project editor destinations. Projects retains
its original metrics/table. No persistence, API or database changes.
Verify both themes, mobile/desktop, keyboard focus, native selects, empty results,
long names and sibling Projects layout. Full application accessibility remediation
and CRUD redesign are outside this visual change.

## Meeting dashboard variant
The master project's investment tab displays read-only cumulative actual
disbursement by domestic loan, foreign loan and revenue, plus a combined total.
Its source rows use the existing funding-source visibility handler so they match
the selected investment sources. Investment and approved panel labels are
“วงเงินการลงทุน” and “งบประมาณที่ได้รับอนุมัติแล้ว”.
DisbursementPlan.updateSums owns these baht outputs and the matching cumulative
card in tab 5. Both read all recorded actual months; no additional stored field
or schema change is used. The shared label is “ผลการเบิกจ่ายสะสม”.
On desktop, overhead/interest is on the left and cumulative disbursement on the
right in the same row. Both follow the budget grid's single-column layout on
narrow screens, preserving that reading order.
Project budget-plan Cabinet targets are editable for the meeting and change-budget
year (2570 for this meeting). Its variance remains read-only and uses
post-meeting payout minus that year's Cabinet target. The shared reason field
starts at the set-budget year; that year's Cabinet target and variance stay locked.
The set-budget summary shows commitment, annual investment before the meeting,
investment change, investment after the meeting, and combined operating total.
Investment after = before + change; operating total = commitment + investment
after. Payout remains before + payout change. Subtotals, grand totals and Excel
export include both added operating columns. Change-budget and future summaries
retain their own column layouts.
All meeting summary tabs share the financial palette: cream identity cells,
green operating-budget headers/cells, orange payout headers/cells, white header
text and transparent numeric fields. --ledger-* tokens belong to
#summary-table-fullscreen and adapt to dark mode. Decision project-list tables
use the same group colors through decision-project-table.css. Existing total-row
colors, column widths, tab colors, formulas and data are preserved. Thick group
dividers are removed from the set-budget table; normal thin grid lines remain.
integration.css is the single owner of summary header colors. Legacy pastel
normal-mode overrides and duplicate inline header color declarations in
meeting-app/index.html are removed, including the old dark group backgrounds.
Annual summary tables normalize the set-budget visual template to the original
three operating columns (commitment, investment, total) and three payout columns.
Their formulas and Excel exports retain that six-value layout.
Project investment sources use a native add-source dropdown with domestic loan,
foreign loan and revenue. Selected sources reveal matching investment and approved
amount fields in a two-column table, with source labels on the left, numeric inputs
on the right and a final total row; duplicate selections are disabled. Legacy loan totals are treated
as domestic loans. Foreign amounts are stored as a subset of aggregate loan totals,
preserving existing report calculations and revenue OH/IDC rules.
OH, IDC and their read-only sum use the same two-column financial table styling.
The investment amount tab places financing and approved amounts in paired desktop
panels, with OH/IDC below. Tablets and phones stack the panels. Use restrained
theme surfaces, aligned financial inputs and one native add-source control; keep
all existing amounts, totals, deletion confirmation and source-selection behavior.
The investment-plan tab imports one selected annual table from XLSX into a
read-only, internally scrolling table. Original year/additional-year columns and
subtotal rows are preserved; stored plans never modify project funding totals.
Import only the first annual table on each selected sheet, ending at its final
grand-total row or the following blank row. Exclude adjacent tables and notes.
Imported columns are item, original full project amount, first full project amount,
all year/additional-year columns, total and remaining. Exclude percentage columns,
adjustment columns and alternate full-project amount sets.
Investment loan sections use a pale blue surface; revenue sections use pale green.
Numbered funding headings and subtotal/grand-total weights provide separation
independently of color. These styles derive from theme surfaces for dark mode.
The investment tab has one compact import/sheet toolbar, a plain status/legend
row and a ledger table. Both the column headings and item column remain sticky
within its own scroll region. Empty plans show import guidance. Percent columns
retain percentage units and financial values align right with tabular numerals.
The disbursement tab follows EX.xlsx: investment/approved/cumulative amounts,
an annual summary and monthly Cabinet/revised/actual tables for three sources.
The annual summary lays years across columns with plan and actual rows. Plan
values use the chosen Cabinet or revised monthly sums via a view selector; switching
does not alter recorded amounts. Year buttons select the corresponding month view.
Canonical calendar months store baht amounts; fiscal years show October of the
previous Buddhist year through September. Changing views never duplicates data.
Actual month totals replace project spending after any actual entry is recorded;
legacy spending stays intact until then. All tabs share the project save/version.
Excel formulas require cached calculated values. Imported plans are pending until
the shared project save succeeds.

The meeting overview uses the same panel radius, spacing, action and theme tokens
through assets/dashboard.css. Before/after labels retain green/amber accents.
The meeting dashboard's two top tabs are change-budget year and set-budget year.
set-budget-cards.js reuses the existing allocation panel and comparison Chart.js
canvas. The selected design proposal 1 uses a comparison table with one shared
comparison bar chart. Retired chart tabs, annual-overview cards, allocation donut
renderers and their listeners/styles have been removed from bridge.js and
integration.css. The current chart has only before/after datasets; its plugin
derives differences directly, with no hidden third dataset or percentage helper.
The selected design proposal 1 uses a comparison table with one shared
header and tinted before/after rows under commitment, investment, total,
target and remaining. The displayed equation is commitment + investment = total
− target = remaining; the total is derived from commitment and investment.
There are no operator columns or individual tall metric boxes. A single
increase/decrease footer aligns deltas under investment/target;
its row label uses 18px bold and the amounts use 24px bold in rounded highlight
boxes. Zero has a neutral surface; increases use a green tint and decreases a
warm error tint, retaining signed values and the existing text colors in both themes.
the relationship is explained below the table. The panel heading is
“เปรียบเทียบงบประมาณ”; do not restore “องค์ประกอบงบประมาณ”.
The comparison table header uses a vertical blue gradient (#296bb0 to #174779),
white lettering, subtle text shadow and a soft shadow under the header in both
themes. Its first visible header cell is blank; no “ช่วงประชุม” caption is shown.
Both comparison-table and comparison-chart cards use the cool review-card
variant: --review-card-start/end/border in theme-tokens.css map to pale blue-grey
surfaces in light mode and navy surfaces in dark mode. dashboard.css applies
the shared diagonal gradient and soft shadow only to these two cards.
Review cards use one continuous cool surface, including the transparent chart
canvas, with no nested canvas panel. --review-row-before/after are blue-grey
tints; --review-neutral replaces warm zero-delta boxes. --review-card-text/muted
scope cool ink to this dashboard. The card selector includes the html root to
take precedence over the legacy warm-light chart-card rule without affecting
other charts. Keep the original year-tab palette and green/amber bar meanings.
The graph sits to the right on desktop; only at 900px and below does it stack
below the matrix. The chart column has a 280px minimum. The matrix owns
horizontal scrolling on narrow screens. dashboard.css owns this layout. Change
investment includes annual allocation plus the corresponding pre/post change;
set investment uses the existing set-summary totals event. Both scopes match
their summary table's active/show flags. Selected dashboard year updates the
heading, badge and graph independently of the lower summary-table tabs. Existing
data fields and database schema are preserved.
The dashboard uses locally compiled daisyUI 5 card and table
components with the `du-` prefix, preserving Bootstrap and other screens.
meeting-app/ui/daisyui.css is built with `npm run build:meeting-ui` into
meeting-app/assets/daisyui.css. No browser compiler, CDN or preflight is loaded.
scripts/build-meeting-ui.cjs renames daisyUI's width token to --du-border-width
so the app's existing --border color stays intact. Paired rows use subtle
before/after tints; the shared surfaces, Thai type sizes and chart stay canonical.
The two year-view buttons retain the original summary-table-tab styling and
active colors. Do not restyle these tabs as part of daisyUI improvements.
The dashboard fullscreen button targets #meeting-dashboard-fullscreen only:
heading, year-view buttons, equation matrix and comparison chart. Summary tables
and the round toolbar remain outside. Escape exits through the browser fullscreen
API; the button state and original outer/table scroll positions are restored.
The table preserves its spreadsheet columns inside a keyboard-scrollable region.
Workflow rows with imported details use a small button in the item column to collapse or expand their own child rows. Unnamed Excel detail rows remain in calculations but are omitted from the visible list. These view states do not change totals or saved data.
The Workflow annual payout-target summary leaves all month cells empty. Only
each year's total column sums that year's grand-total monthly values; annual
totals are never injected into month 1. This also applies to imported workbooks.
Outer document scrolling and bridge-reported iframe height remain canonical.
meetings.css owns the shared-shell round toolbar. The existing bridge owns theme
sync, Chart.js styling, persistence and navigation. Detail pages remain unchanged.
Financial inputs, cards, formula semantics, summary tabs, presentation/fullscreen,
round selection, export and save handlers are preserved. Labels/live status and
focus outlines improve accessibility without changing those workflows.



Meeting comparison cards: only the outer before/after card border has a five-second traveling light, using each card's existing green/amber accent. No flip or content animation. Reduced motion stops animation; print hides the decorative light.

Meeting comparison chart: green before and orange after gradient bars. Delta overlays the after column between before/after values; increases use blue fill and reductions use a dashed blue range. The top of the solid after bar always represents the actual after value. Tooltips show actual totals and signed differences; underlying calculations remain unchanged.
The comparison plot fits its card with no minimum-width plot or horizontal
scrollbar. Each category shows only its signed three-decimal difference in a
high-contrast theme-surface badge: green increase, warm reduction, neutral zero.
Labels are 18px bold (14px on narrow cards), with no percentage or duplicated
before/after amount badges. Full totals remain in the table and tooltips. Axis
labels stay horizontal, wrapping the operating-total label on narrow cards;
compact legend spacing and Y-axis grace reserve space for the difference badges.



Meeting summary and project-detail tabs share assets/animated-tabs.css and animated-tabs.js. A sliding background follows the existing active class, retaining each tab group's original theme colors. It adapts to text width, wrapping, resize and theme changes; reduced-motion disables transition. Tab handlers and panel behavior are unchanged.

Project-info subsection headers toggle one highlighted card at a time. The active card uses #4a4a4a for its body, #3d3d3d for its header, and white heading, number and field-label text. Form controls retain their theme surfaces and text. The interaction supports Enter/Space and reduced motion; meeting-app/assets/bridge.js owns selection and integration.css owns its colors.

The investment-plan table applies the same palette to one selected budget row. Native row-label buttons toggle selection; clicking an input selects its row without toggling it off. Input and comment surfaces retain their original colors, including fields whose original background is transparent. Selection is visual only and does not mark financial data as edited.

Budget overview items use the same single-selection interaction and charcoal highlight. Item labels and units turn white, while editable and read-only value boxes keep their theme colors. Label buttons support keyboard activation; clicking an input keeps its item selected.

All three selection surfaces share integration.css tokens: --meeting-selection-body, --meeting-selection-head and --meeting-selection-border. Dark mode uses #505058/#414149 fills with #c4c4d0 edges and white text, separating selection from the #171719/#222225 base surfaces. Active overview items have an inset outline; selected budget rows have top/bottom edges and a leading marker. Light mode retains #4a4a4a/#3d3d3d fills.

Nine-box unbound rows are derived when the adjacent next-year dataset exists. Missing projects are labelled “ปิดโครงการ”; continuing projects with positive differences are labelled “ไม่ผูกพันบางส่วน”. Calculate the combined loan/revenue remaining total minus the combined next-year opening commitment total, then round to three decimals and floor at zero. Sum both funding sources before subtracting or clamping, so a funding-ratio change with the same total does not produce an unbound amount. Shared getUnboundDetails in nine-box-app/script.js owns screen and Excel calculations. Master IDs take precedence for cross-year matching; legacy IDs/codes/names provide fallback. Missing next-year data retains the previous manual/end-year behavior instead of inferring closures. Derived rows are display-only and do not rewrite financial inputs.

Unbound presentation is a compact 540px three-column table: sequence, short name and right-aligned amount (192px). Closed projects show only the short name; continuing projects append “(บางส่วน)”. Full names and closure labels are omitted. Excel uses the same short names and notes, with a single money column rather than merging three money columns. Internal closure/partial classification and calculations remain as described above.

Summary toolbar actions use the UI/Button/02 reference: charcoal fill, blue gradient border and blue glow on hover/focus. Native buttons, handlers, labels and disabled states are preserved; the Master DB status badge remains a status label.

The meeting decision tab places the change-budget and set-budget years in two desktop columns, with each year's three semantic result cards stacked beneath its heading: green approval, rose rejection, and amber review. Narrow screens stack the years. Empty states stay compact, while pending-decision counts remain visible in each year heading so an undecided project is not mistaken for missing data.
Decision project-list dialogs and popup windows share buildGroupedLists in
bridge.js and decision-project-table.css. Both group continuing/new projects
into semantic tables with sequence, project name, investment, investment delta,
payout and payout delta. Signed deltas retain existing amount calculations;
empty categories span all six columns. Project navigation stays unchanged.

Dark palette updated to reference black/charcoal: background #0b0b0c, surfaces #171719/#232325, borders #38383b, primary text #f3f3f3 and muted #b1b1b7. Shell and embedded meeting surfaces share neutral greys; semantic green/amber/blue accents stay distinct. The 9-box iframe follows the host light palette (#ebe6df background, #f3ece3 panels, #e2d6c7 headers, #8b5e3c primary actions) and retains its spreadsheet-specific numeric cell cues.

The investment amount tab places financing and approved amounts in paired desktop panels, with OH/IDC below. Tablets and phones stack the panels. Use restrained theme surfaces, aligned financial inputs and one native add-source control; retain existing totals, deletion confirmation and source-selection behavior.

