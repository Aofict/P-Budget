const $ = (selector) => document.querySelector(selector);
const LEGACY_STORE = 'p-budget-projects-v1';
let projects = [],
  masters = { 'funding-sources': [], statuses: [], 'fiscal-years': [], 'project-types': [] };
let page = 'dashboard',
  ready = false,
  saving = false,
  deletingProject = false,
  toastTimer;
let selectedProjectId = null;
let fiscalYearPage = 0;
const FISCAL_YEAR_PAGE_SIZE = 10;
const masterDefinitions = {
  'funding-sources': { title: 'แหล่งเงินและส่วนประกอบ', label: 'แหล่งเงิน', canAdd: false },
  statuses: { title: 'สถานะโครงการ', label: 'สถานะโครงการ', canAdd: true },
  'fiscal-years': { title: 'ปีงบประมาณ', label: 'ปีงบประมาณ', canAdd: true },
  'project-types': { title: 'ประเภทโครงการ', label: 'ประเภทโครงการ', canAdd: true },
};
let statusFilterInitialized = false;
let projectFormReturnPage = 'projects';
let pendingProjectFormRoute = '';
const visibleProjectStatuses = [
  'กำลังดำเนินการ',
  'เสร็จสิ้น',
  'อยู่ระหว่างศึกษาความเหมาะสมของโครงการ',
  'อยู่ระหว่างนำเสนอคณะกรรมการ กฟภ.',
  'อยู่ระหว่างขอความเห็นจากหน่วยงานต่างๆ เพื่อประกอบขอความเห็นชอบจาก ครม.',
];

const format = (n, d = 3) =>
  Number(n).toLocaleString('en-US', {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ],
  );
const date = (value) =>
  new Date(value).toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
const projectUrl = (id) => `/api/projects/${encodeURIComponent(id)}`;

function toast(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 5000);
}

async function api(path, method = 'GET', data) {
  let response, result;
  try {
    for (let attempt = 0; attempt < (method === 'GET' ? 2 : 1); attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      try {
        response = await fetch(path, {
          method,
          cache: 'no-store',
          headers: data === undefined ? {} : { 'Content-Type': 'application/json' },
          body: data === undefined ? undefined : JSON.stringify(data),
          signal: controller.signal,
        });
        result = await response.json();
        if (method !== 'GET' || ![408, 429, 502, 503, 504].includes(response.status) || attempt === 1) break;
      } catch (error) {
        if (method !== 'GET' || attempt === 1) throw error;
      } finally {
        clearTimeout(timer);
      }
    }
  } catch {
    throw new Error(
      'โหลดข้อมูลไม่สำเร็จหรือเซิร์ฟเวอร์ตอบช้า กรุณาลองใหม่ หากยังค้างให้ตรวจว่าเซิร์ฟเวอร์เปิดอยู่',
    );
  }
  if (!response.ok || !result) {
    const error = new Error(
      result?.error || 'เซิร์ฟเวอร์ไม่พร้อมใช้งาน กรุณาลองใหม่',
    );
    error.status = response.status;
    error.wrongServer = !result;
    throw error;
  }
  return result;
}

async function refresh() {
  let data;
  try {
    data = await api('/api/bootstrap');
    if (!Array.isArray(data.projects) || !data.masters) {
      const error = new Error('ไม่พบ API ของระบบงบประมาณที่ที่อยู่นี้');
      error.wrongServer = true;
      throw error;
    }
  } catch (error) {
    showConnectionError(error);
    throw error;
  }
  projects = data.projects;
  masters = data.masters;
  ready = true;
  $('#add-project').disabled = false;
  $('#connection-banner').hidden = true;
  const selected = statusFilterInitialized ? $('#status-filter').value : 'in-progress';
  $('#status-filter').innerHTML =
    '<option value="">ทุกสถานะ</option>' +
    masters.statuses
      .filter(item => visibleProjectStatuses.includes(item.name))
      .sort((a, b) => visibleProjectStatuses.indexOf(a.name) - visibleProjectStatuses.indexOf(b.name))
      .map(
        (item) =>
          `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`,
      )
      .join('');
  $('#status-filter').value = masters.statuses.some(item => item.id === selected) ? selected : '';
  statusFilterInitialized = true;
  if (page === 'project-form') activateProjectFormRoute(location.hash.slice(1));
  render();
}

function showConnectionError(error) {
  ready = false;
  $('#add-project').disabled = true;
  $('#connection-banner').hidden = false;
  const wrongAddress = error.wrongServer || location.protocol === 'file:';
  $('#connection-message').textContent = wrongAddress
    ? 'หน้านี้เปิดผ่านไฟล์หรือ Live Server ซึ่งไม่มีฐานข้อมูล กรุณาเปิดระบบที่พอร์ต 8080 หากยังเข้าไม่ได้ ให้รัน python server.py ก่อน'
    : error.message;
  let link = $('#open-budget-server');
  if (!link) {
    link = document.createElement('a');
    link.id = 'open-budget-server';
    link.className = 'primary';
    link.textContent = 'เปิดระบบจัดการงบประมาณ';
    $('#connection-banner').append(link);
  }
  link.href = 'http://127.0.0.1:8080/' + location.hash;
  link.hidden = !wrongAddress;
  $('#project-rows').innerHTML =
    '<tr><td colspan="9" class="empty">ยังไม่ได้เชื่อมต่อฐานข้อมูล กรุณาตรวจสอบข้อความด้านบน</td></tr>';
}

function totals() {
  return projects.reduce(
    (sum, p) => ({
      budget: sum.budget + p.budget,
      spent: sum.spent + p.spent,
      progress: sum.progress + p.progress,
    }),
    { budget: 0, spent: 0, progress: 0 },
  );
}

const uiIcon = window.PBudgetIcons.render;
const Navigation = window.createPBudgetNavigation({$, uiIcon});
Navigation.initialize();
const syncThemeButton = Navigation.syncThemeButton;
syncThemeButton();
const finance = window.createPBudgetFinance({format});
const {approvedBudget, cumulativeSpent, disbursementPercent, fundingBreakdown} = finance;
const DashboardAnalytics = window.createPBudgetDashboard({
  $, format, escapeHtml, uiIcon, finance, getPage: () => page,
});


function render() {
  if (page.startsWith('reports-')) renderReports();
  const analyticsPage = ['dashboard', 'plan-results'].includes(page);
  const selectedStatus = $('#status-filter').value;
  const dashboardDivision = $('#division-filter').value;
  const dashboardQuery = $('#search').value.trim().toLowerCase();
  const cardProjects = projects.filter(p => (!selectedStatus || p.statusId === selectedStatus) &&
    (!analyticsPage || ((!dashboardDivision || String(p.details?.division || '').trim() === dashboardDivision) &&
      [p.name,p.details?.shortName,p.code,p.fund,p.details?.division].join(' ').toLowerCase().includes(dashboardQuery))));
  $('#dashboard-scope').textContent = `${cardProjects.length} โครงการ · ${$('#status-filter').selectedOptions[0]?.textContent || 'ทุกสถานะ'} · ${dashboardDivision || 'ทุกสายงาน'}${dashboardQuery ? ' · ตามคำค้นหา' : ''}`;
  const t = cardProjects.reduce((sum, p) => ({budget: sum.budget + Number(p.budget || 0), spent: sum.spent + Number(p.spent || 0)}), {budget: 0, spent: 0});

  // ใช้ข้อมูลโครงการที่เลือกเฉพาะหน้า "โครงการ" เท่านั้น
  const selectedProject =
    page === 'projects'
      ? projects.find((p) => p.id === selectedProjectId)
      : null;

  // ==========================================
  // เปลี่ยนหัวข้อหน้าตามโครงการที่เลือก
  // ==========================================
  if (page === 'projects') {
    $('#page-title').textContent = selectedProject
      ? selectedProject.name
      : 'โครงการทั้งหมด';

    $('#page-subtitle').textContent = selectedProject
      ? `รหัสโครงการ ${selectedProject.code}`
      : 'จัดการข้อมูล ติดตามงบประมาณ และความคืบหน้าของโครงการ';
  }

  // ==========================================
  // งบประมาณแยกตามแหล่งเงิน
  // ==========================================
  const loanBudget = selectedProject
    ? Number(selectedProject.finances?.loan || 0)
    : cardProjects.reduce((sum, p) => sum + Number(p.finances?.loan || 0), 0);

  const revenueBudget = selectedProject
    ? Number(selectedProject.finances?.revenue || 0)
    : cardProjects.reduce((sum, p) => sum + Number(p.finances?.revenue || 0), 0);

  const loanSpent = selectedProject
    ? cumulativeSpent(selectedProject).loanSpent
    : cardProjects.reduce((sum, p) => sum + cumulativeSpent(p).loanSpent, 0);

  const revenueSpent = selectedProject
    ? cumulativeSpent(selectedProject).revenueSpent
    : cardProjects.reduce((sum, p) => sum + cumulativeSpent(p).revenueSpent, 0);

  const statBudget = selectedProject
    ? Number(selectedProject.budget || 0)
    : t.budget;

  const statSpent = selectedProject
    ? loanSpent + revenueSpent
    : cardProjects.reduce((sum,p)=>{
        const spent=cumulativeSpent(p);
        return sum+spent.loanSpent+spent.revenueSpent;
      },0);

  const statApproved = (selectedProject ? [selectedProject] : cardProjects)
    .reduce((sum, p) => sum + approvedBudget(p), 0);
  const disbursementRate = disbursementPercent(statSpent, statApproved);
  if (analyticsPage) DashboardAnalytics.render(cardProjects);

  // ==========================================
  // KPI Cards
  // ==========================================
  $('#stats').innerHTML = ([
    [
      '▣',
      'purple',
      'โครงการตามเงื่อนไข',
      cardProjects.length,
      `<span class="positive active-project-count">${
        cardProjects.filter((p) => p.statusId === 'in-progress').length
      } โครงการอยู่ระหว่างดำเนินการ</span><div>จากทั้งหมด ${projects.length} โครงการ</div>`,
    ],

    [
      '▰',
      'teal',
      selectedProject ? 'งบประมาณโครงการ' : 'งบประมาณรวม',
      format(statBudget),

      fundingBreakdown(loanBudget, revenueBudget),
      'ล้านบาท',
    ],

    [
      '◈',
      'azure',
      selectedProject ? 'ยอดเบิกจ่ายโครงการ' : 'ยอดเบิกจ่ายรวม',
      format(statSpent),

      fundingBreakdown(loanSpent, revenueSpent),
      'ล้านบาท',
    ],

    [
      '◔',
      'orange',
      selectedProject ? 'อัตราการเบิกจ่าย' : 'อัตราการเบิกจ่ายเฉลี่ย',
      disbursementRate === null ? '—' : format(disbursementRate, 1) + '%',

      `
        <div class="progress" role="img" aria-label="${disbursementRate === null ? 'ยังไม่มีงบประมาณที่อนุมัติสำหรับคำนวณอัตราเบิกจ่าย' : `อัตราการเบิกจ่าย ${format(disbursementRate, 1)}%`}">
          <i style="width:${Math.min(100, disbursementRate ?? 0)}%"></i>
        </div>
        <div class="stat-disbursement-totals">
          <div><span>งบประมาณที่อนุมัติ</span><strong>${format(statApproved)} ล้านบาท</strong></div>
          <div><span>เบิกจ่ายแล้ว</span><strong>${format(statSpent)} ล้านบาท</strong></div>
        </div>
      `,
    ],
  ])
    .map(
      ([icon, color, label, value, foot, unit]) => `
        <article class="stat">

          <div class="stat-icon ${color}">
            ${uiIcon({purple:'grid',teal:'wallet',azure:'chart',orange:'clock'}[color])}
          </div>

          <div class="stat-detail">

            <div class="stat-label">
              ${label}
            </div>

            <div class="stat-value${unit ? ' stat-value-with-unit' : ''}">
              <span class="stat-amount">${value}</span>
              ${unit ? `<span class="stat-unit">${unit}</span>` : ''}
            </div>

            <div class="stat-foot">
              ${foot}
            </div>

          </div>

        </article>
      `,
    )
    .join('');

  // ==========================================
  // ค้นหา / กรอง / เรียงลำดับ
  // ==========================================

  const query = $('#search').value.trim().toLowerCase();
  const status = $('#status-filter').value;

  // ==========================================
  // สร้างรายการสายงานจากข้อมูลโครงการอัตโนมัติ
  // ==========================================

  const divisionSelect = $('#division-filter');
  const currentDivision = divisionSelect?.value || '';

  const divisions = [
    ...new Set(
      projects
        .map((p) => String(p.details?.division || '').trim())
        .filter(Boolean),
    ),
  ].sort((a, b) =>
    a.localeCompare(b, 'th', {
      sensitivity: 'base',
    }),
  );

  if (divisionSelect) {
    divisionSelect.innerHTML =
      '<option value="">ทุกสายงาน</option>' +
      divisions
        .map(
          (division) =>
            `<option value="${escapeHtml(division)}">${escapeHtml(
              division,
            )}</option>`,
        )
        .join('');

    // คืนค่าที่เลือกไว้
    if (divisions.includes(currentDivision)) {
      divisionSelect.value = currentDivision;
    }

    divisionSelect.disabled = divisions.length === 0;
  }

  const division = divisionSelect?.value || '';

  // ==========================================
  // Filter
  // ค้นหา + สถานะ + สายงาน
  // ==========================================

  const filtered = projects.filter((p) => {
    const projectDivision = String(p.details?.division || '').trim();

    const searchableText = [
      p.name,
      p.details?.shortName || '',
      p.code || '',
      p.fund || '',
      projectDivision,
    ]
      .join(' ')
      .toLowerCase();

    const matchSearch = searchableText.includes(query);

    const matchStatus = !status || p.statusId === status;

    const matchDivision = !division || projectDivision === division;

    return matchSearch && matchStatus && matchDivision;
  });

  // ==========================================
  // เรียงลำดับ
  // เก็บสถานะไว้ที่ tbody #project-rows
  // ==========================================

  const projectRows = $('#project-rows');

  const sortKey = projectRows?.dataset.sortKey || 'name';

  const sortDir = projectRows?.dataset.sortDir || 'asc';

  const sortedProjects = [...filtered].sort((a, b) => {
    let result = 0;

    switch (sortKey) {
      case 'budget':
        result = Number(a.budget || 0) - Number(b.budget || 0);
        break;

      case 'spent':
        {
          const spentA = cumulativeSpent(a);
          const spentB = cumulativeSpent(b);
          result =
            spentA.loanSpent + spentA.revenueSpent -
            spentB.loanSpent - spentB.revenueSpent;
        }
        break;

      case 'progress':
        result = Number(a.progress || 0) - Number(b.progress || 0);
        break;

      case 'name':
      default:
        result = String(a.name || '').localeCompare(
          String(b.name || ''),
          'th',
          {
            sensitivity: 'base',
            numeric: true,
          },
        );
        break;
    }

    return sortDir === 'desc' ? -result : result;
  });

  // ==========================================
  // หน้าหลักยังเรียงตามแก้ไขล่าสุด
  // ==========================================

  const sortedByUpdated = [...filtered].sort((a, b) => {
    const dateA = new Date(a.updated || 0).getTime();

    const dateB = new Date(b.updated || 0).getTime();

    return dateB - dateA;
  });

  // หน้าหลัก = ล่าสุด 5 รายการ
  // หน้าโครงการ = ใช้การเรียงจากหัวตาราง
  const shown =
    page === 'dashboard' ? sortedByUpdated.slice(0, 5) : sortedProjects;

  $('#project-count').textContent = page === 'dashboard' ? filtered.length : projects.length;

  // ==========================================
  // ตารางรายการโครงการ
  // ==========================================
  $('#project-rows').innerHTML = shown.length
    ? shown
        .map((p, index) => {
          const spent = cumulativeSpent(p);
          const spentTotal = spent.loanSpent + spent.revenueSpent;
          const badge = p.isTerminal
            ? 'done'
            : p.statusId === 'started'
              ? 'start'
              : p.statusId === 'near-completion'
                ? 'near'
                : '';
          const rowPercent = page === 'dashboard'
            ? disbursementPercent(spentTotal, approvedBudget(p))
            : Number(p.progress || 0);

          return `
            <tr
              data-project-row="${escapeHtml(p.id)}"
              class="${
                p.id === selectedProjectId ? 'project-row-selected' : ''
              }"
            >

              <td>
                ${index + 1}
              </td>

              <td
                class="project-name"
                title="${escapeHtml(p.name)}"
              >
                ${escapeHtml(p.name)}
              </td>

              <td class="number">
                ${format(page === 'dashboard' ? approvedBudget(p) : p.budget)}
              </td>

              <td class="number">
                ${format(spentTotal)}
              </td>

              <td>

              <div class="row-progress">

                  <div class="progress">
                    <i
                      style="width:${Math.min(100, rowPercent ?? 0)}%"
                    ></i>
                  </div>

                  <span>
                    ${rowPercent === null ? '—' : format(rowPercent, 1) + '%'}
                  </span>

                </div>
              </td>

              <td>
                ${escapeHtml(p.details?.division || '-')}
              </td>

              <td>
                <span class="badge ${badge}">
                  ${escapeHtml(p.status)}
                </span>
              </td>

              <td>
                ${date(p.updated)}
              </td>

              <td>

                <button
                  class="row-action"
                  data-edit="${escapeHtml(p.id)}"
                  aria-label="แก้ไข ${escapeHtml(p.code)}"
                  title="แก้ไขโครงการ"
                >
                  ${uiIcon('edit')}
                </button>


              </td>

            </tr>
          `;
        })
        .join('')
    : `
      <tr>
        <td
          colspan="9"
          class="empty"
        >
          ${
            !ready
              ? $('#connection-banner').hidden
                ? 'กำลังเชื่อมต่อฐานข้อมูล…'
                : 'ยังไม่ได้เชื่อมต่อฐานข้อมูล กรุณาตรวจสอบข้อความด้านบน'
              : projects.length
                ? 'ไม่พบโครงการที่ตรงกับเงื่อนไข'
                : 'ยังไม่มีโครงการ — กดเพิ่มโครงการ หรือนำเข้าข้อมูลเดิมที่หน้าตั้งค่า'
          }
        </td>
      </tr>
    `;

  $('#row-caption').textContent =
    `แสดง ${shown.length} จาก ${filtered.length} โครงการ`;

  if (page === 'master') {
    renderMasters();
  }

  if (page === 'meetings' && !$('#meeting-workspace-frame')) {
    MeetingModule.mount($('#meeting-panel'));
  }
}

async function exportHtmlSnapshot() {
  const button = $('#html-export'), status = $('#html-export-status');
  if (button.disabled) return;
  button.disabled = true; button.setAttribute('aria-busy', 'true');
  status.textContent = 'กำลังรวบรวมข้อมูลทุกหน้าเป็นไฟล์ HTML…';
  try {
    const viewState = {};
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (key && (key.startsWith('meetingBudget:hiddenBudgetRows:') || key.startsWith('meetingBudget:rowFilters:'))) {
        viewState[key] = localStorage.getItem(key);
      }
    }
    const response = await fetch('/api/reports/snapshot.html?theme='+(document.body.classList.contains('light')?'light':'dark'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ viewState }),
    });
    if (!response.ok) {
      const error = await response.json().catch(()=>({}));
      throw Error(response.status===404 ? 'กรุณาปิดและเปิดโปรแกรมใหม่เพื่อโหลดฟังก์ชันส่งออก HTML' : error.error || 'ส่งออก HTML ไม่สำเร็จ');
    }
    const filename = response.headers.get('Content-Disposition')?.match(/filename="?([^";]+)"?/)?.[1] || 'PBudget-ReadOnly.html';
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
    status.textContent = 'ส่งออกแล้ว · เปิดไฟล์ HTML ด้วย Chrome หรือ Edge และส่งต่อไฟล์เดียวได้เลย';
    toast('ส่งออก HTML ทุกหน้าแล้ว');
  } catch (error) { status.textContent = error.message; }
  finally {button.disabled=false;button.removeAttribute('aria-busy');}
}

let reportsInitialized = false, reportExporting = false;
function renderReports() {
  const monthly = page === 'reports-monthly';
  $('#report-heading').textContent = monthly ? 'แผนรายเดือน' : 'แผนรายปี';
  const divisions = [...new Set(projects.map(project => project.details?.division?.trim()).filter(Boolean))].sort();
  const division = $('#report-division').value;
  $('#report-division').innerHTML = '<option value="">ทุกสายงาน</option>' + divisions.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
  $('#report-division').value = divisions.includes(division) ? division : '';
  const oldStatus = $('#report-project-status').value;
  $('#report-project-status').innerHTML = '<option value="">ทุกสถานะ</option>' + masters.statuses.map(status=>`<option value="${escapeHtml(status.id)}">${escapeHtml(status.name)}</option>`).join('');
  $('#report-project-status').value = masters.statuses.some(status=>status.id===oldStatus) ? oldStatus : '';
  const scoped = projects.filter(project => (!$('#report-division').value || project.details?.division?.trim() === $('#report-division').value) && (!$('#report-project-status').value || project.statusId === $('#report-project-status').value));
  const years = DashboardAnalytics.yearsFor(scoped, $('#report-mode').value);
  for (const id of ['report-year-from', 'report-year-to']) {
    const select = $(`#${id}`), selected = select.value;
    select.innerHTML = `<option value="">${id.endsWith('from')?'ปีแรกที่มีข้อมูล':'ปีสุดท้ายที่มีข้อมูล'}</option>` + years.map(year=>`<option value="${year}">${year}</option>`).join('');
    select.value = years.includes(Number(selected)) ? selected : '';
    select.disabled = reportExporting || !years.length;
  }
  const from = Number($('#report-year-from').value || years[0]), to = Number($('#report-year-to').value || years.at(-1));
  const invalidRange = from > to;
  $('#report-export').disabled = reportExporting || !ready || !scoped.length || !years.length || invalidRange;
  if (!reportExporting) $('#report-status').textContent = !ready ? 'กำลังรอข้อมูลฐานข้อมูล' : !scoped.length ? 'ไม่พบโครงการที่ตรงกับเงื่อนไข' : !years.length ? 'ยังไม่มีช่วงปีหรือข้อมูลรายเดือนสำหรับรายงาน' : invalidRange ? 'ปีเริ่มต้นต้องไม่มากกว่าปีสิ้นสุด' : `${scoped.length} โครงการ · ปี ${from}–${to}`;
  if (reportsInitialized) return;
  reportsInitialized = true;
  for (const id of ['report-mode', 'report-year-from', 'report-year-to', 'report-plan', 'report-division', 'report-project-status']) $(`#${id}`).addEventListener('change', renderReports);
  $('#report-export').addEventListener('click', async () => {
    if (reportExporting) return;
    const button = $('#report-export');
    const query = new URLSearchParams({view:page === 'reports-monthly' ? 'monthly' : 'annual', mode:$('#report-mode').value, year:'all', fromYear:$('#report-year-from').value, toYear:$('#report-year-to').value, status:$('#report-project-status').value, plan:$('#report-plan').value, division:$('#report-division').value});
    const name = `${$('#report-heading').textContent}-${$('#report-year-from').value || 'เริ่มต้น'}-${$('#report-year-to').value || 'สิ้นสุด'}.xlsx`;
    reportExporting = true;
    button.disabled = true;
    const controls = [...$('#reports-panel').querySelectorAll('select')];
    const disabledBefore = controls.map(control=>control.disabled);
    controls.forEach(control=>control.disabled=true);
    button.setAttribute('aria-busy', 'true');
    $('#report-status').textContent = 'กำลังสร้างไฟล์ Excel…';
    try {
      const response = await fetch('/api/reports/disbursement.xlsx?'+query);
      if (!response.ok) {
        if (response.status === 404) throw Error('เซิร์ฟเวอร์ยังไม่ได้โหลดส่วนรายงาน กรุณาปิดและเปิดโปรแกรมใหม่ หากใช้ EXE ให้บิลด์เวอร์ชันล่าสุด');
        const data = await response.json().catch(()=>({}));
        throw Error(data.error || 'ส่งออกรายงานไม่สำเร็จ');
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
      setTimeout(()=>URL.revokeObjectURL(url), 30000);
      $('#report-status').textContent = 'สร้างไฟล์ Excel แล้ว';
      toast('ส่งออกรายงาน Excel แล้ว');
    } catch (error) {
      $('#report-status').textContent = error.message;
    } finally {
      reportExporting = false;
      controls.forEach((control,index)=>control.disabled=disabledBefore[index]);
      button.removeAttribute('aria-busy');
      button.disabled = !ready;
    }
  });
}

const titles = Navigation.titles;

let cancelNineBoxLoad = () => {};

function mountNineBox() {
  const panel = $('#nine-box-panel');
  if (!panel) return;
  cancelNineBoxLoad();
  panel.replaceChildren();
  panel.setAttribute('aria-busy', 'true');
  panel.dataset.loadState = 'loading';

  const status = document.createElement('div');
  status.className = 'nine-box-load-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const title = document.createElement('h3');
  title.textContent = 'กำลังโหลดหน้า 9 ช่อง…';
  const detail = document.createElement('p');
  detail.textContent = 'กำลังเตรียมตารางและโหลดข้อมูลที่บันทึกไว้';
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.textContent = 'ลองใหม่';
  retry.hidden = true;
  retry.addEventListener('click', mountNineBox);
  status.append(title, detail, retry);
  panel.append(status);

  const controller = new AbortController();
  let active = true;
  let frame;
  let frameLoaded = false;
  let poll;
  let timeout;
  const stop = () => {
    active = false;
    clearInterval(poll);
    clearTimeout(timeout);
    controller.abort();
  };
  cancelNineBoxLoad = stop;
  const fail = message => {
    if (!active) return;
    stop();
    frame?.remove();
    panel.dataset.loadState = 'error';
    panel.setAttribute('aria-busy', 'false');
    title.textContent = 'เปิดหน้า 9 ช่องไม่สำเร็จ';
    detail.textContent = message;
    retry.hidden = false;
  };
  timeout = setTimeout(() => fail('ใช้เวลาโหลดนานเกินไป ตรวจว่าโปรแกรม P-Budget Manager ยังเปิดอยู่ แล้วกดลองใหม่'), 35000);

  (async () => {
    try {
      const response = await fetch('/nine-box-app/index.html', {cache: 'no-store', signal: controller.signal});
      if (!response.ok) {
        fail(response.status === 404
          ? 'ไม่พบไฟล์หน้า 9 ช่อง กรุณาคัดลอกไฟล์ประกอบโปรแกรมให้ครบทั้งโฟลเดอร์ แล้วกดลองใหม่'
          : `โปรแกรมไม่สามารถโหลดหน้า 9 ช่องได้ (รหัส ${response.status}) กรุณาลองใหม่`);
        return;
      }
      const html = await response.text();
      if (!active) return;
      if (!response.headers.get('Content-Type')?.includes('text/html') ||
          !new DOMParser().parseFromString(html, 'text/html').getElementById('planEditor')) {
        fail('ไฟล์หน้า 9 ช่องไม่ถูกต้อง กรุณาใช้ไฟล์จากชุดโปรแกรมรุ่นเดียวกัน แล้วกดลองใหม่');
        return;
      }
      frame = document.createElement('iframe');
      frame.id = 'nine-box-frame';
      frame.className = 'nine-box-frame';
      frame.title = 'ระบบ 9 ช่อง';
      frame.hidden = true;
      frame.setAttribute('allowfullscreen', '');
      frame.setAttribute('allow', 'fullscreen');
      const checkReady = () => {
        if (!active || !frameLoaded) return;
        try {
          const child = frame.contentWindow;
          const doc = frame.contentDocument;
          if (child.nineBoxLoadState === 'error') {
            fail(doc.getElementById('storageStatus')?.textContent || 'โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่');
          } else if (child.nineBoxLoadState === 'ready') {
            stop();
            panel.dataset.loadState = 'ready';
            panel.setAttribute('aria-busy', 'false');
            status.remove();
            frame.hidden = false;
          }
        } catch {
          fail('ไม่สามารถเปิดหน้า 9 ช่องได้ ตรวจว่าโปรแกรมยังทำงานอยู่ แล้วกดลองใหม่');
        }
      };
      frame.addEventListener('load', () => {
        if (!active) return;
        try {
          const child = frame.contentWindow;
          if (!frame.contentDocument?.getElementById('planEditor') ||
              typeof child.loadDataFromStorage !== 'function' || !child.nineBoxLoadState ||
              !child.ExcelJS || typeof child.saveAs !== 'function' ||
              !frame.contentDocument.querySelector('link[href^="style.css"]')?.sheet?.cssRules.length) {
            fail('ไฟล์ประกอบหน้า 9 ช่องโหลดไม่ครบ กรุณาตรวจชุดโปรแกรม แล้วกดลองใหม่');
            return;
          }
          frameLoaded = true;
          checkReady();
        } catch {
          fail('ไม่สามารถโหลดหน้า 9 ช่องได้ ตรวจว่าโปรแกรมยังทำงานอยู่ แล้วกดลองใหม่');
        }
      });
      frame.addEventListener('error', () => fail('การเชื่อมต่อขัดข้อง กรุณาเปิดโปรแกรมไว้แล้วกดลองใหม่'));
      frame.src = '/nine-box-app/index.html?v=division-filter-1';
      panel.append(frame);
      poll = setInterval(checkReady, 200);
    } catch (error) {
      if (active) fail('เชื่อมต่อโปรแกรมไม่ได้ กรุณาตรวจว่า P-Budget Manager ยังเปิดอยู่ แล้วกดลองใหม่');
    }
  })();
}

function navigate(next) {
  if (page === 'project-form') {
    const currentRoute = `project-form/${$('#project-form').dataset.routeId}`;
    if (next !== currentRoute && ProjectForm.isDirty()) {
      pendingProjectFormRoute = next;
      history.replaceState(null, '', `#${currentRoute}`);
      const warning = $('#project-leave-dialog');
      if (!warning.open) warning.showModal();
      return;
    }
    if (next !== currentRoute) $('#project-form').dataset.routeId = '';
  }
  if (page === 'nine-box') {
    const child = document.getElementById('nine-box-frame')?.contentWindow;
    if (child?.canLeaveNineBox && !child.canLeaveNineBox()) {
      history.replaceState(null, '', '#nine-box');
      return;
    }
  }
  if (page === 'meetings' && next !== 'meetings' && !MeetingModule.canLeave()) {
    history.replaceState(null, '', '#meetings');
    return;
  }

  if (page === 'meetings' && next !== 'meetings') {
    $('#meeting-panel').replaceChildren();
  }

  const nextPage = next === 'project-form' || next.startsWith('project-form/')
    ? 'project-form'
    : Object.hasOwn(titles, next) ? next : 'dashboard';

  // ถ้าออกจากหน้าโครงการ ให้ยกเลิกโครงการที่เลือก
  if (nextPage !== 'projects') {
    selectedProjectId = null;
  }

  if (page === 'nine-box' && nextPage !== 'nine-box') {
    const nineBoxPanel = $('#nine-box-panel');

    cancelNineBoxLoad();
    if (nineBoxPanel) {
      nineBoxPanel.replaceChildren();
    }
  }

  page = nextPage;
  const analyticsPage = ['dashboard', 'plan-results'].includes(page);
  document.body.classList.toggle('dashboard-view', analyticsPage);
  document.body.classList.toggle('plan-results-view', page === 'plan-results');
  $('#dashboard-disbursement').hidden = page !== 'dashboard';
  $('#plan-results-panel').hidden = page !== 'plan-results';
  $('#main-panel').before($('#stats'));
  $('#project-budget-heading').textContent = page === 'dashboard' ? 'งบที่อนุมัติ' : 'งบประมาณรวม';
  $('#project-rate-heading').textContent = page === 'dashboard' ? 'อัตราเบิกจ่าย' : 'ความคืบหน้า';
  document.body.classList.toggle('project-form-view', page === 'project-form');
  document.body.classList.toggle('nine-box-view', page === 'nine-box');
  $('.app-header').hidden = false;
  $('#projects-search').hidden = page !== 'projects';
  $('.welcome').hidden = ['project-form', 'nine-box'].includes(page);
  $('#project-form-page').hidden = page !== 'project-form';
  $('.workspace-note').hidden = ['project-form', 'nine-box'].includes(page);
  $('#dashboard-filters').hidden = !analyticsPage;
  (analyticsPage ? $('#dashboard-filters') : $('#main-panel .panel-heading')).append($('.filters'));
  document.body.classList.toggle('projects-fixed-layout', page === 'projects');

  Navigation.updateHeader(page);
  const pageSubtitle = $('#page-subtitle');
  if (page === 'nine-box') {
    const saveStatus = document.createElement('span');
    saveStatus.className = 'nine-box-save-status';
    saveStatus.textContent = 'บันทึกอัตโนมัติ';
    pageSubtitle.append(saveStatus);
  }

  // KPI
  $('#stats').hidden = [
    'dashboard',
    'plan-results',
    'settings',
    'master',
    'meetings',
    'nine-box',
    'project-form',
    'reports-annual',
    'reports-monthly',
  ].includes(page);

  // หน้าประชุม
  $('#meeting-panel').hidden = page !== 'meetings';
  $('#nine-box-panel').hidden = page !== 'nine-box';
  $('#reports-panel').hidden = !page.startsWith('reports-');
  $('#report-nav summary').classList.toggle('active', page.startsWith('reports-'));
  $('#report-nav').open = false;
  if (page.startsWith('reports-')) {
    renderReports();
  }

  if (page === 'nine-box') {
    mountNineBox();
  }

  // ปุ่มเพิ่มโครงการ
  $('#add-project').hidden = page !== 'projects';

  // ตารางโครงการ แสดงเฉพาะหน้าหลักและหน้าโครงการ
  $('#main-panel').hidden = page !== 'projects';

  if (page === 'project-form' && ready) activateProjectFormRoute(next);

  // กราฟแสดงเฉพาะหน้า "ภาพรวมงบประมาณ"

  // Panel สำหรับตั้งค่า / ข้อมูลหลัก
  $('#other-panel').hidden = !['settings', 'master'].includes(page);
  $('#settings-tabs').hidden = !['settings', 'master'].includes(page);
  $('#settings-tabs').querySelectorAll('[role="tab"]').forEach(tab => {
    const selected = tab.dataset.page === page;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  });
  if (['settings', 'master'].includes(page)) {
    $('#other-panel').setAttribute('role', 'tabpanel');
    $('#other-panel').setAttribute('aria-labelledby', page === 'master' ? 'settings-tab-master' : 'settings-tab-general');
  }

  // ตัวกรองแสดงเฉพาะหน้าโครงการ
  $('.filters').hidden = !['projects', 'dashboard', 'plan-results'].includes(page);

  // ปุ่มดูทั้งหมดแสดงเฉพาะหน้าหลัก
  $('#view-all').hidden = page !== 'dashboard';

  // ชื่อตาราง
  $('#table-title').textContent =
    page === 'dashboard' ? 'โครงการที่อัปเดตล่าสุด' : 'รายการโครงการ';

  // Reset ตัวกรอง
  // Preserve the chosen status across page navigation.

  if ($('#division-filter')) {
    $('#division-filter').value = '';
  }

  // =========================
  // Settings
  // =========================
  if (page === 'settings') {
    $('#other-panel').innerHTML = `
      <div class="settings-page">
        <section class="settings-card settings-row" aria-labelledby="settings-display-title">
          <div>
            <h3 id="settings-display-title">การแสดงผล</h3>
            <p>เลือกธีมที่เหมาะกับการใช้งาน</p>
          </div>
          <button class="secondary" data-action="theme">สลับธีมสว่าง / มืด</button>
        </section>

        <section class="settings-card" aria-labelledby="settings-backup-title">
          <div class="settings-row">
            <div>
              <h3 id="settings-backup-title">สำรองข้อมูล</h3>
              <p>เก็บสำเนาข้อมูลทั้งหมด รวมโครงการ การประชุม ข้อมูล 9 ช่อง และประวัติ</p>
            </div>
            <button class="primary" data-action="database-backup">สำรองข้อมูลทั้งหมด</button>
          </div>
          <p id="settings-backup-status" class="settings-note" role="status">กำลังตรวจสอบสำเนาอัตโนมัติ…</p>
          <details class="settings-disclosure" id="settings-storage-details">
            <summary>รายละเอียดการจัดเก็บ</summary>
            <div class="settings-detail-body">
              <div id="storage-info" role="status">กำลังโหลดตำแหน่งข้อมูล…</div>
              <p>สำรองเมื่อเปิดโปรแกรม ก่อนนำเข้าหรือปรับรุ่น และเมื่อกดสำรองข้อมูล เก็บไฟล์ล่าสุดเพียง 1 ไฟล์ในโฟลเดอร์ backups ชื่อ DD_MM_YY_HHMMSS.db โดยลบสำเนาเก่าหลังสร้างไฟล์ใหม่สำเร็จแล้ว</p>
              <p>ไฟล์จากปุ่ม “สำรองข้อมูลทั้งหมด” เป็นฐานข้อมูล SQLite (.db) รวมรายการที่ลบและเลขรันโครงการ</p>
            </div>
          </details>
        </section>

        <section class="settings-card" id="database-settings" aria-label="นำเข้าฐานข้อมูล"></section>
        <section class="settings-card" aria-labelledby="settings-html-title">
          <div class="settings-row">
            <div>
              <h3 id="settings-html-title">ส่งออก HTML ทุกหน้า</h3>
              <p>รวมข้อมูลทุกโครงการ ทุกรอบประชุม และ 9 ช่องที่บันทึกแล้ว เป็นไฟล์เดียวสำหรับเปิดอ่านและส่งต่อ โดยไม่ต้องติดตั้งโปรแกรม</p>
            </div>
            <button type="button" class="secondary" id="html-export">ส่งออก HTML ทุกหน้า</button>
          </div>
          <p id="html-export-status" class="settings-note" role="status">ไฟล์ HTML เป็นสำเนาสำหรับอ่าน ณ เวลาส่งออก</p>
        </section>
        <section class="settings-card" id="patch-settings" aria-label="อัปเดตโปรแกรม"></section>
        <details class="settings-card settings-advanced" id="settings-advanced-tools">
          <summary>เครื่องมือขั้นสูง <span>นำเข้าและส่งออกข้อมูล</span></summary>
          <div class="settings-detail-body">
            <h3>ข้อมูลโครงการ JSON</h3>
            <p>ใช้ย้ายข้อมูลโครงการและข้อมูลหลัก ไม่รวมข้อมูลการประชุม ข้อมูล 9 ช่อง และประวัติทั้งหมด</p>
            <div class="settings-actions">
              <button class="secondary" data-action="backup">ส่งออกข้อมูลโครงการ (.json)</button>
              <button class="secondary" data-action="import">นำเข้าไฟล์ JSON</button>
            </div>
            <p class="settings-note">นำเข้าเพิ่มโดยคงรหัสโครงการเดิม หากข้อมูลขัดแย้งกับรหัสที่มีอยู่ ระบบจะยกเลิกการนำเข้าทั้งชุด</p>
            <input type="file" id="import-file" accept="application/json,.json" hidden>
            <div class="settings-legacy">
              <h3>ย้ายข้อมูลจากเบราว์เซอร์รุ่นเก่า</h3>
              <p>ใช้เฉพาะข้อมูลจากรุ่นที่บันทึกในเบราว์เซอร์ และต้องเปิดด้วยเบราว์เซอร์และที่อยู่เดิม</p>
              <div class="settings-actions">
                <button class="secondary" data-action="migrate-local">นำเข้าข้อมูลจากเบราว์เซอร์เดิม</button>
                <button class="secondary" data-action="export-local">ส่งออกข้อมูลเบราว์เซอร์เดิม</button>
              </div>
            </div>
          </div>
        </details>

        <section class="settings-card settings-row" aria-labelledby="settings-system-title">
          <div>
            <h3 id="settings-system-title">สถานะระบบ</h3>
            <p id="settings-system-status" role="status">กำลังตรวจสอบการเชื่อมต่อ…</p>
          </div>
          <button class="secondary" data-action="refresh">โหลดข้อมูลล่าสุด</button>
        </section>
      </div>
    `;
  }

  if (page === 'settings') {
    $('#html-export').addEventListener('click', exportHtmlSnapshot);
    loadStorageInfo(); window.mountPatchSettings?.(); window.mountDatabaseSettings?.();
  }

  render();
}
async function loadStorageInfo() {
  const panel = document.getElementById('storage-info');
  const backupStatus = document.getElementById('settings-backup-status');
  const systemStatus = document.getElementById('settings-system-status');
  if (!panel) return;
  try {
    const info = await api('/api/storage-info');
    if (!panel.isConnected) return;
    const lastBackup = info.latestBackup
      ? new Date(info.latestBackup.createdAt).toLocaleString('th-TH')
      : null;
    if (backupStatus) backupStatus.textContent = lastBackup
      ? 'สำรองอัตโนมัติล่าสุด: ' + lastBackup
      : 'ยังไม่มีสำเนาอัตโนมัติ — ฐานข้อมูลใหม่จะสำรองเมื่อเปิดโปรแกรมครั้งถัดไป';
    if (systemStatus) systemStatus.textContent = 'เชื่อมต่อกับโปรแกรมในเครื่องแล้ว';
    panel.replaceChildren();
    const rows = [
      ['ไฟล์ฐานข้อมูล', info.databasePath],
      ['โฟลเดอร์สำรอง', info.backupDirectory],
      ['สำเนาล่าสุด', info.latestBackup?.path || 'ยังไม่มีสำเนาอัตโนมัติ'],
    ];
    if (lastBackup) rows.push(['เวลาสำรองล่าสุด', lastBackup]);
    for (const [label, value] of rows) {
      const row = document.createElement('p');
      const name = document.createElement('strong');
      name.textContent = label + ': ';
      const text = document.createElement('span');
      text.textContent = value;
      row.append(name, text);
      panel.append(row);
    }
  } catch (error) {
    if (!panel.isConnected) return;
    panel.textContent = 'โหลดตำแหน่งข้อมูลไม่สำเร็จ: ' + error.message;
    if (backupStatus) backupStatus.textContent = 'ยังตรวจสอบสำเนาอัตโนมัติไม่ได้';
    if (systemStatus) systemStatus.textContent = 'ตรวจสอบการเชื่อมต่อไม่สำเร็จ — กดโหลดข้อมูลล่าสุดเพื่อลองใหม่';
  }
}

function masterName(kind, id) {
  return masters[kind]?.find(item => item.id === id)?.name || id || '';
}

function masterOptions(kind, selected) {
  const removed = new Set(['อยู่ระหว่างอนุมัติ','อยู่ระหว่างขออนุมัติ','ได้รับอนุมัติแล้ว','ชะลอโครงการ']);
  return masters[kind]
    .filter(item => kind !== 'statuses' || !removed.has(item.name) || item.id === selected)
    .filter((item) => item.active || item.id === selected)
    .map(
      (item) =>
        `<option value="${escapeHtml(item.id)}" ${kind === 'statuses' && removed.has(item.name) ? 'disabled' : ''}>${escapeHtml(item.name)}${kind === 'statuses' && removed.has(item.name) ? ' (สถานะเดิม — เลือกใหม่ไม่ได้)' : ''}${item.active ? '' : ' (ปิดใช้งาน)'}</option>`,
    )
    .join('');
}

async function deleteProject(button) {
  if (saving || deletingProject) return;
  const project = projects.find(p => p.id === button.dataset.delete);
  if (!project) return;
  const form = button.closest('#project-form');
  const version = form ? Number(form.dataset.version) : project.version;
  if (!confirm(`ลบโครงการ ${project.code} “${project.name}”?\nโครงการจะออกจากรายการ ระบบเก็บประวัติและข้อมูลที่อยู่ในรอบประชุมไว้ และไม่ใช้รหัสนี้ซ้ำ`)) return;
  deletingProject = true;
  button.disabled = true;
  const submit = form?.querySelector('[type="submit"]');
  if (submit) submit.disabled = true;
  if (form) $('#form-error').textContent = '';
  try {
    await api(projectUrl(project.id), 'DELETE', {version});
    projects = projects.filter(p => p.id !== project.id);
    if (selectedProjectId === project.id) selectedProjectId = null;
    if (page === 'project-form' && $('#project-form').elements.id.value === project.id) {
      ProjectForm.discardChanges();
      closeProjectForm();
    }
    render();
    toast('ลบโครงการแล้ว');
  } catch (error) {
    if (form) $('#form-error').textContent = error.message + (error.status === 409 ? ' กรุณาปิดแล้วเปิดรายละเอียดใหม่ก่อนลบ' : '');
    throw error;
  } finally {
    deletingProject = false;
    button.disabled = false;
    if (submit) submit.disabled = false;
  }
}

function openForm(id) {
  if (saving || deletingProject) return;
  if (!ready) return toast('กรุณาเชื่อมต่อฐานข้อมูลก่อน');
  if (id && !projects.some((project) => project.id === id)) return toast('ไม่พบโครงการ');
  if (page !== 'project-form') projectFormReturnPage = page;
  const route = `project-form/${id || 'new'}`;
  if (location.hash === `#${route}`) navigate(route);
  else location.hash = route;
}

function activateProjectFormRoute(route) {
  if (!ready) return;
  const id = route.startsWith('project-form/') ? route.slice('project-form/'.length) : 'new';
  const form = $('#project-form');
  if (form.dataset.routeId === id) return;
  const project = id === 'new' ? null : projects.find((item) => item.id === id);
  if (id !== 'new' && !project) {
    toast('ไม่พบโครงการ');
    location.hash = 'projects';
    return;
  }
  form.dataset.routeId = id;
  ProjectForm.open(project);
  window.scrollTo(0, 0);
}

function closeProjectForm() {
  location.hash = projectFormReturnPage;
}

ProjectForm.setup();
$('#project-leave-stay').onclick = () => {
  pendingProjectFormRoute = '';
  $('#project-leave-dialog').close();
};
$('#project-leave-discard').onclick = () => {
  const next = pendingProjectFormRoute;
  pendingProjectFormRoute = '';
  ProjectForm.discardChanges();
  $('#project-leave-dialog').close();
  location.hash = next;
};
$('#project-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (saving || deletingProject || !ProjectForm.validate(event.target)) return;
  const form = event.target,
    id = form.elements.id.value,
    data = ProjectForm.payload(form);
  if (id) data.version = Number(form.dataset.version);
  data.progress = Number(data.progress);
  saving = true;
  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true;
  $('#form-error').textContent = '';
  try {
    const result = await api(
      id ? projectUrl(id) : '/api/projects',
      id ? 'PUT' : 'POST',
      data,
    );
    projects = [
      result,
      ...projects.filter((project) => project.id !== result.id),
    ];
    ProjectForm.markSaved(result);
    history.replaceState(null, '', `#project-form/${result.id}`);
    render();
    toast('บันทึกแท็บทั้งหมดเรียบร้อย');
  } catch (error) {
    $('#form-error').textContent = error.message;
    if (error.status === 409) await refresh().catch(() => {});
  } finally {
    saving = false;
    submit.disabled = false;
  }
});

function renderMasters() {
  const sections = Object.entries(masterDefinitions).map(([kind, definition]) => {
    const isFiscalYear = kind === 'fiscal-years';
    const available = Array.isArray(masters[kind]);
    let rows = (masters[kind] || []).filter(item =>
      kind !== 'funding-sources' ||
      ['domestic-loan', 'foreign-loan', 'pea-revenue', 'oh', 'idc'].includes(item.id),
    );
    let yearNavigation = '';
    if (isFiscalYear && available) {
      rows = [...rows].sort((a, b) => Number(b.code) - Number(a.code));
      const pageCount = Math.max(1, Math.ceil(rows.length / FISCAL_YEAR_PAGE_SIZE));
      fiscalYearPage = Math.min(fiscalYearPage, pageCount - 1);
      const first = fiscalYearPage * FISCAL_YEAR_PAGE_SIZE;
      yearNavigation = `<div class="master-year-navigation"><span>แสดง ${rows.length ? first + 1 : 0}–${Math.min(first + FISCAL_YEAR_PAGE_SIZE, rows.length)} จาก ${rows.length} ปี</span>${pageCount > 1 ? `<div><button class="secondary" data-fiscal-page="previous" ${fiscalYearPage === 0 ? 'disabled' : ''} aria-label="ปีงบประมาณหน้าก่อน">ก่อนหน้า</button><span aria-live="polite">${fiscalYearPage + 1} / ${pageCount}</span><button class="secondary" data-fiscal-page="next" ${fiscalYearPage >= pageCount - 1 ? 'disabled' : ''} aria-label="ปีงบประมาณหน้าถัดไป">ถัดไป</button></div>` : ''}</div>`;
      rows = rows.slice(first, first + FISCAL_YEAR_PAGE_SIZE);
    }
    const addButton = definition.canAdd
      ? `<button class="secondary" data-master-add="${kind}" ${ready && available ? '' : 'disabled'}>＋ เพิ่ม${definition.label}</button>`
      : '';
    const tableRows = rows.map(item => {
      const parent = item.parent_id
        ? ` <span class="badge">ส่วนของ${item.parent_id === 'domestic-loan' ? 'เงินกู้' : 'เงินรายได้'}</span>`
        : '';
      const terminal = item.is_terminal ? ' <span class="badge done">สิ้นสุดโครงการ</span>' : '';
      const nameCell = isFiscalYear ? '' : `<td>${escapeHtml(item.name)}${parent}${terminal}</td>`;
      const active = `<span class="badge ${item.active ? 'start' : 'near'}">${item.active ? 'ใช้งาน' : 'ปิดใช้งาน'}</span>`;
      return `<tr><td>${escapeHtml(item.code)}</td>${nameCell}<td>${active}</td><td><button class="secondary" data-master-kind="${kind}" data-master-edit="${escapeHtml(item.id)}">แก้ไข</button></td></tr>`;
    }).join('');
    const table = available
      ? `<div class="table-scroll"><table><thead><tr><th>${isFiscalYear ? 'ปี พ.ศ.' : 'รหัส'}</th>${isFiscalYear ? '' : '<th>ชื่อ</th>'}<th>การใช้งาน</th><th></th></tr></thead><tbody>${tableRows}</tbody></table></div>`
      : `<p class="settings-note">เปิดแอปใหม่เพื่อใช้งานข้อมูล${definition.label}</p>`;
    return `<section class="master-section"><div class="panel-heading"><h2>${definition.title}</h2>${addButton}</div>${table}${yearNavigation}</section>`;
  }).join('');
  $('#other-panel').innerHTML =
    '<p>แหล่งเงินหลักมี 3 แหล่ง: เงินกู้ เงินกู้ต่างประเทศ และเงินรายได้ โดย OH และ IDC เป็นส่วนของเงินรายได้</p>' + sections;
}

function openMaster(kind, id) {
  const item = masters[kind].find((row) => row.id === id),
    form = $('#master-form');
  form.reset();
  form.dataset.kind = kind;
  form.dataset.id = id || '';
  form.dataset.version = item?.version || '';
  $('#master-title').textContent =
    (item ? 'แก้ไข' : 'เพิ่ม') +
    masterDefinitions[kind].label;
  const isFiscalYear = kind === 'fiscal-years';
  $('#master-code-label').firstChild.textContent = isFiscalYear ? 'ปีงบประมาณ (พ.ศ.)' : 'รหัสข้อมูลหลัก';
  $('#master-code-help').textContent = isFiscalYear ? 'ระบุปี พ.ศ. 4 หลัก เช่น 2571' : 'ใช้ตัวอักษรอังกฤษ ตัวเลข - หรือ _ และแก้ไขรหัสภายหลังไม่ได้';
  $('#master-name-label').hidden = isFiscalYear;
  form.elements.code.value = item?.code || '';
  form.elements.code.readOnly = !!item;
  form.elements.code.maxLength = isFiscalYear ? 4 : 30;
  form.elements.code.pattern = isFiscalYear ? '[0-9]{4}' : '[A-Za-z0-9_-]+';
  form.elements.code.inputMode = isFiscalYear ? 'numeric' : 'text';
  form.elements.code.placeholder = isFiscalYear ? 'เช่น 2571' : 'เช่น INVESTMENT';
  form.elements.name.value = item?.name || (isFiscalYear ? `ปีงบประมาณ ${form.elements.code.value}` : '');
  form.elements.active.checked = item?.active ?? true;
  form.elements.is_terminal.checked = item?.is_terminal || false;
  $('#terminal-label').hidden = kind !== 'statuses';
  $('#master-error').textContent = '';
  $('#master-dialog').showModal();
}

$('#master-form').elements.code.addEventListener('input', (event) => {
  const form = event.target.form;
  if (form.dataset.kind === 'fiscal-years') form.elements.name.value = `ปีงบประมาณ ${event.target.value}`;
});

$('#master-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.target,
    button = form.querySelector('[type="submit"]');
  if (button.disabled || !form.reportValidity()) return;
  button.disabled = true;
  const data = {
    code: form.elements.code.value,
    name: form.elements.name.value,
    active: form.elements.active.checked,
    is_terminal: form.elements.is_terminal.checked,
  };
  const id = form.dataset.id;
  if (id) data.version = Number(form.dataset.version);
  try {
    const result = await api(
      `/api/masters/${form.dataset.kind}${id ? '/' + encodeURIComponent(id) : ''}`,
      id ? 'PUT' : 'POST',
      data,
    );
    masters[form.dataset.kind] = [
      ...masters[form.dataset.kind].filter((item) => item.id !== result.id),
      result,
    ];
    $('#master-dialog').close();
    toast('บันทึกข้อมูลหลักเรียบร้อยแล้ว');
    await refresh().catch((error) =>
      toast('บันทึกแล้ว แต่โหลดข้อมูลล่าสุดไม่สำเร็จ: ' + error.message),
    );
  } catch (error) {
    $('#master-error').textContent = error.message;
    if (error.status === 409) await refresh().catch(() => {});
  } finally {
    button.disabled = false;
  }
});

function backupDateStamp() {
  const parts = new Intl.DateTimeFormat('en-GB-u-ca-buddhist', {
    timeZone: 'Asia/Bangkok', day: '2-digit', month: '2-digit', year: 'numeric',
  }).formatToParts(new Date());
  const part = type => parts.find(p => p.type === type).value;
  return `${part('day')}-${part('month')}-${part('year')}`;
}

function download(content, name, type) {
  const url = URL.createObjectURL(new Blob([content], { type })),
    anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csv() {
  const header = [
    'ID',
    'รหัสโครงการ',
    'ชื่อโครงการ',
    'แหล่งเงิน',
    'ส่วนของเงินรายได้',
    'งบประมาณ (ล้านบาท)',
    'เบิกจ่าย (ล้านบาท)',
    'คงเหลือ (ล้านบาท)',
    'ความคืบหน้า (%)',
    'สถานะ',
  ];
  const cell = (value) =>
    '"' +
    String(
      typeof value === 'string' && /^[=+@\-\t\r]/.test(value)
        ? "'" + value
        : value,
    ).replace(/"/g, '""') +
    '"';
  const rows = [
    header,
    ...projects.map((p) => [
      p.id,
      p.code,
      p.name,
      p.fund,
      p.fundComponent || '',
      p.budget,
      p.spent,
      Number((p.budget - p.spent).toFixed(3)),
      p.progress,
      p.status,
    ]),
  ];
  const fields = [
    ['ชื่อย่อ', 'shortName'],
    ['ผู้อำนวยการโครงการ', 'director'],
    ['หน่วยงาน', 'department'],
    ['สายงาน', 'division'],
    ['วัตถุประสงค์', 'objectives'],
    ['พื้นที่ดำเนินการ', 'area'],
    ['ระยะเวลาดำเนินการ', 'timeline'],
    ['ประเภทโครงการ', 'projectType'],
    ['มติ ครม.', 'cabinetDate'],
    ['หมายเหตุสถานะ', 'statusNotes'],
    ['Payback (ปี)', 'paybackYears'],
    ['NPV (ล้านบาท)', 'npv'],
    ['FIRR (%)', 'firr'],
    ['EIRR (%)', 'eirr'],
    ['วันที่ศึกษา', 'studyDate'],
    ['ที่มาผลศึกษา', 'studySource'],
  ];
  const amounts = [
    ['เงินกู้ (ล้านบาท)', 'loan'],
    ['เงินรายได้รวม OH/IDC (ล้านบาท)', 'revenue'],
    ['OH ภายในเงินรายได้', 'oh'],
    ['IDC ภายในเงินรายได้', 'idc'],
    ['เบิกจ่ายเงินกู้', 'loanSpent'],
    ['เบิกจ่ายเงินรายได้', 'revenueSpent'],
    ['วงเงินเดิมรอจัดแหล่งเงิน', 'unallocated'],
    ['เบิกจ่ายเดิมรอจัดแหล่งเงิน', 'unallocatedSpent'],
  ];
  header.push(
    ...fields.map(([label]) => label),
    ...amounts.map(([label]) => label),
  );
  projects.forEach((p, i) =>
    rows[i + 1].push(
      ...fields.map(([, key]) => key === 'projectType'
        ? masterName('project-types', p.details?.projectType)
        : p.details?.[key] ?? ''),
      ...amounts.map(([, key]) => p.finances?.[key] ?? 0),
    ),
  );
  download(
    '\ufeff' + rows.map((row) => row.map(cell).join(',')).join('\r\n'),
    'p-budget-report.csv',
    'text/csv;charset=utf-8',
  );
}

function renderReport() {
  const t = totals();
  $('#other-panel').innerHTML =
    `<h2>รายงานสรุปงบประมาณโครงการ</h2><p>ข้อมูล ณ ${date(new Date())} · ทั้งหมด ${projects.length} โครงการ</p><p>งบประมาณรวม <strong>${format(t.budget)}</strong> ล้านบาท<br>เบิกจ่ายแล้ว <strong>${format(t.spent)}</strong> ล้านบาท<br>งบประมาณคงเหลือ <strong>${format(t.budget - t.spent)}</strong> ล้านบาท<br>อัตราเบิกจ่าย <strong>${format(t.budget ? (t.spent / t.budget) * 100 : 0, 1)}%</strong></p><button class="primary" data-action="csv">↓ ดาวน์โหลดรายงาน CSV</button><p>รายงานประกอบด้วย ID ถาวร รหัสโครงการ แหล่งเงิน งบประมาณ ยอดเบิกจ่าย ความคืบหน้า และสถานะ</p>`;
}

function theme() {
  document.body.classList.toggle('light');
  syncThemeButton();
  try {
    localStorage.setItem(
      'p-budget-theme',
      document.body.classList.contains('light') ? 'light' : 'dark',
    );
  } catch {
    toast('ไม่สามารถบันทึกการตั้งค่าธีมได้');
  }
}

async function importData(data) {
  const items = Array.isArray(data) ? data : data?.projects;
  if (!Array.isArray(items))
    throw new Error('ไฟล์ต้องเป็น JSON โครงการที่ส่งออกจากระบบ');
  if (
    !confirm(
      `นำเข้าเพิ่ม ${items.length} โครงการ โดยคงรหัสเดิมและไม่แทนที่ข้อมูลที่มีอยู่?`,
    )
  )
    return;
  const result = await api('/api/import', 'POST', data);
  await refresh().catch(() => {});
  toast(
    `นำเข้า ${result.imported} โครงการ ข้ามข้อมูลที่มีอยู่แล้ว ${result.skipped} โครงการ`,
  );
}

$('#settings-tabs').addEventListener('keydown', event => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const tabs = [...$('#settings-tabs').querySelectorAll('[role="tab"]')];
  const current = tabs.indexOf(document.activeElement);
  if (current < 0) return;
  event.preventDefault();
  const index = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (current + (event.key === 'ArrowLeft' ? -1 : 1) + tabs.length) % tabs.length;
  tabs[index].focus();
  location.hash = tabs[index].dataset.page;
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && $('#report-nav').open) {
    $('#report-nav').open = false;
    $('#report-nav summary').focus();
  }
});

document.addEventListener('click', async (event) => {
  const reportMenu = $('#report-nav');
  if (!reportMenu.contains(event.target) || event.target.closest('#report-nav button[data-page]')) {
    reportMenu.open = false;
  }
  // ==========================================
  // คลิกหัวตารางเพื่อเรียงลำดับ
  // ==========================================
  const sortHeader = event.target.closest('#main-panel thead th');

  if (page === 'projects' && sortHeader) {
    const sortKeys = {
      1: 'name',
      2: 'budget',
      3: 'spent',
      4: 'progress',
    };

    const sortKey = sortKeys[sortHeader.cellIndex];

    // ทำงานเฉพาะ 4 คอลัมน์ที่กำหนด
    if (sortKey) {
      const projectRows = $('#project-rows');

      const currentKey = projectRows.dataset.sortKey || 'name';

      const currentDir = projectRows.dataset.sortDir || 'asc';

      // ถ้ากดหัวเดิม -> สลับ asc / desc
      if (currentKey === sortKey) {
        projectRows.dataset.sortDir = currentDir === 'asc' ? 'desc' : 'asc';
      } else {
        projectRows.dataset.sortKey = sortKey;

        // ชื่อเริ่ม ก → ฮ
        // ตัวเลขเริ่ม มาก → น้อย
        projectRows.dataset.sortDir = sortKey === 'name' ? 'asc' : 'desc';
      }

      render();
      return;
    }
  }

  // ==========================================
  // คลิกแถวโครงการ
  // ==========================================
  const projectRow = event.target.closest('[data-project-row]');

  if (projectRow && !event.target.closest('button')) {
    const id = projectRow.dataset.projectRow;

    // โค้ดเดิมต่อจากตรงนี้...

    // คลิกจากหน้าหลัก
    // → ไปหน้าโครงการและเลือกโครงการนั้น
    if (page === 'dashboard') {
      selectedProjectId = id;
      location.hash = 'projects';
      return;
    }

    // หน้าโครงการ
    // คลิกแถวเดิมซ้ำ = กลับภาพรวม
    if (page === 'projects') {
      selectedProjectId = selectedProjectId === id ? null : id;

      render();
      return;
    }
  }

  // ==========================================
  // คลิกพื้นที่ว่างในหน้าโครงการ
  // → กลับไปแสดงภาพรวม
  // ==========================================
  const isInteractive = event.target.closest(
    'button, a, input, select, textarea, dialog, .filters',
  );

  if (
    selectedProjectId &&
    page === 'projects' &&
    !projectRow &&
    !isInteractive
  ) {
    selectedProjectId = null;
    render();
    return;
  }

  // ==========================================
  // การทำงานของปุ่มเดิม
  // ==========================================
  const button = event.target.closest('button');

  if (!button) return;

  if (button.dataset.page) {
    location.hash = button.dataset.page;
  }

  if (button.dataset.edit) {
    openForm(button.dataset.edit);
  }

  if (button.classList.contains('close-dialog')) {
    button.closest('dialog').close();
  }

  if (button.classList.contains('close-project-form')) {
    closeProjectForm();
  }

  if (button.dataset.masterAdd) {
    openMaster(button.dataset.masterAdd);
  }

  if (button.dataset.masterEdit) {
    openMaster(button.dataset.masterKind, button.dataset.masterEdit);
  }

  if (button.dataset.fiscalPage) {
    fiscalYearPage += button.dataset.fiscalPage === 'next' ? 1 : -1;
    renderMasters();
  }

  const action = button.dataset.action;

  try {
    // ==========================================
    // ลบโครงการ
    // ==========================================
    if (button.dataset.delete) await deleteProject(button);

    // ==========================================
    // Actions อื่น ๆ
    // ==========================================
    if (action === 'theme') {
      theme();
    }

    if (action === 'csv') {
      csv();
    }

    if (action === 'refresh') {
      const status = document.getElementById('settings-system-status');
      if (status) status.textContent = 'กำลังโหลดข้อมูลล่าสุด…';
      try {
        await refresh();
        if (page === 'settings') await loadStorageInfo();
      } catch (error) {
        if (status?.isConnected) status.textContent = 'เชื่อมต่อไม่สำเร็จ — กรุณาลองใหม่';
        throw error;
      }
    }

    if (action === 'backup') {
      download(
        JSON.stringify(await api('/api/backup'), null, 2),
        `p-budget-projects-${backupDateStamp()}.json`,
        'application/json',
      );
    }

    if (action === 'database-backup') {
      const response = await fetch('/api/backup/database');

      if (!response.ok) {
        throw new Error('สำรองฐานข้อมูลไม่สำเร็จ');
      }

      download(
        await response.blob(),
        (response.headers.get('Content-Disposition')?.match(/filename="?([^";]+)"?/)?.[1] || 'backup.db'),
        'application/vnd.sqlite3',
      );
    }

    if (action === 'import') {
      $('#import-file').click();
    }

    if (action === 'export-local') {
      const saved = localStorage.getItem(LEGACY_STORE);

      if (!saved) {
        throw new Error(
          'ไม่พบข้อมูลเดิม กรุณาเปิด index.html ด้วยเบราว์เซอร์และที่อยู่เดิมที่เคยใช้งาน',
        );
      }

      download(saved, 'p-budget-legacy.json', 'application/json');
    }

    if (action === 'migrate-local') {
      const saved = localStorage.getItem(LEGACY_STORE);

      if (!saved) {
        throw new Error(
          'ไม่พบข้อมูลเดิมในที่อยู่นี้ กรุณานำเข้าไฟล์ JSON ที่ส่งออกจากเวอร์ชันเดิม',
        );
      }

      await importData(JSON.parse(saved));
    }
  } catch (error) {
    toast(error.message);

    if (error.status === 409) {
      await refresh().catch(() => {});
    }
  } finally {
    if (button.dataset.delete) {
      button.disabled = false;
    }
  }
});

document.addEventListener('change', async (event) => {
  if (event.target.id !== 'import-file') return;
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 10 * 1024 * 1024)
      throw new Error('ไฟล์ต้องมีขนาดไม่เกิน 10 MB');
    await importData(JSON.parse(await file.text()));
  } catch (error) {
    toast(
      error instanceof SyntaxError ? 'ไฟล์ JSON ไม่ถูกต้อง' : error.message,
    );
  }
  event.target.value = '';
});

$('#add-project').onclick = () => openForm();
$('#view-all').onclick = () => {
  location.hash = 'projects';
};
$('#theme').onclick = theme;
$('#search').oninput = () => {
  if ($('#search').value.trim()) $('#status-filter').value = '';
  if (!['dashboard', 'projects'].includes(page)) location.hash = 'projects';
  render();
};
$('#status-filter').onchange = () => { selectedProjectId = null; render(); };
$('#division-filter').onchange = render;
window.addEventListener('hashchange', () => navigate(location.hash.slice(1)));
document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    $('#search').focus();
  }
});
$('#today').textContent = new Date().toLocaleDateString('th-TH', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
try {
  if (localStorage.getItem('p-budget-theme') === 'light')
    document.body.classList.add('light');
} catch {}
syncThemeButton();
$('#add-project').disabled = true;
navigate(location.hash.slice(1));
window.appReady = refresh().catch(() => {});

(() => {
  const header = document.querySelector('.app-header');
  if (!header) return;
  const update = () => document.body.style.setProperty('--app-header-height', header.offsetHeight + 'px');
  if (window.ResizeObserver) new ResizeObserver(update).observe(header);
  window.addEventListener('resize', update);
  update();
  let previousY = Math.max(0, window.scrollY);
  let queued = false;
  const reveal = () => {
    header.classList.remove('header-scrolled');
    previousY = Math.max(0, window.scrollY);
  };
  window.addEventListener('scroll', () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      const currentY = Math.max(0, window.scrollY);
      const distance = currentY - previousY;
      if (currentY <= 8 || document.fullscreenElement) {
        reveal();
      } else if (Math.abs(distance) >= 4) {
        header.classList.toggle('header-scrolled', distance > 0);
        if (distance > 0) $('#report-nav').open = false;
        previousY = currentY;
      }
    });
  }, { passive: true });
  window.addEventListener('hashchange', reveal);
  document.addEventListener('fullscreenchange', reveal);
  header.addEventListener('focusin', reveal);
})();
