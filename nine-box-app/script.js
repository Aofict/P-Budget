window.nineBoxLoadState = 'loading';
// ==========================================
// 1. GLOBAL VARIABLES & INITIALIZATION
// ==========================================
let currentYear = '';
let yearsData = {};
let projectsData = [];
let masterProjects = [];

const DEFAULT_SOURCES = [
  'เงินกู้ในประเทศ',
  'เงินรายได้ กฟภ.',
  'ที่ดิน',
  'OH',
  'IDC',
];

function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatProjectEndYear(endYear) {
  const year = String(endYear ?? '').trim();
  return year && year !== '-' ? `(สิ้นสุดปี ${year})` : '';
}

function getMasterProjectEndYear(project) {
  const value = String(project?.details?.endDate || '').trim();

  if (!value) {
    return parseInt(currentYear, 10);
  }

  const match = value.match(/\d{4}/);

  if (!match) {
    return parseInt(currentYear, 10);
  }

  let year = Number(match[0]);

  // ถ้าเป็น ค.ศ. ให้แปลงเป็น พ.ศ.
  if (year < 2400) {
    year += 543;
  }

  return year;
}

// ======================================================
// MASTER PROJECTS
// ======================================================

async function loadMasterProjects() {
  try {
    const response = await fetch('/api/bootstrap', {
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`โหลดข้อมูลโครงการไม่สำเร็จ (${response.status})`);
    }

    const data = await response.json();

    if (!Array.isArray(data.projects)) {
      throw new Error('ไม่พบข้อมูลโครงการจากฐานข้อมูลหลัก');
    }

    masterProjects = [...data.projects].sort((a, b) =>
      String(a.name || '').localeCompare(String(b.name || ''), 'th', {
        sensitivity: 'base',
        numeric: true,
      }),
    );

    renderDivisionFilter();
  } catch (error) {
    console.error('โหลดโครงการจาก Master DB ไม่สำเร็จ:', error);

    nineBoxAlert('ไม่สามารถโหลดโครงการจากฐานข้อมูลหลักได้');
  }
}

// ======================================================
// สร้างตัวกรองสายงาน
// ======================================================

function renderDivisionFilter() {
  const select = document.getElementById('masterDivisionFilter');

  if (!select) return;

  const currentValue = select.value;

  const divisions = [
    ...new Set(
      masterProjects
        .map((project) => String(project.details?.division || '').trim())
        .filter(Boolean),
    ),
  ].sort((a, b) =>
    a.localeCompare(b, 'th', {
      sensitivity: 'base',
    }),
  );

  select.innerHTML =
    '<option value="">ทุกสายงาน</option>' +
    divisions
      .map(
        (division) => `
          <option value="${escapeHtml(division)}">
            ${escapeHtml(division)}
          </option>
        `,
      )
      .join('');

  if (divisions.includes(currentValue)) {
    select.value = currentValue;
  }
}

// ======================================================
// Normalize สำหรับค้นหา
// ======================================================

function normalizeProjectSearch(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

// ======================================================
// ตรวจโครงการที่เพิ่มในปีปัจจุบันแล้ว
// ======================================================

function isMasterProjectAdded(projectId) {
  return (yearsData[currentYear] || []).some(
    (project) => String(project.masterProjectId || '') === String(projectId),
  );
}

// ======================================================
// ค้นหาโครงการ
// ======================================================

function filterMasterProjects() {
  const searchInput = document.getElementById('masterProjectSearch');

  const divisionSelect = document.getElementById('masterDivisionFilter');

  const results = document.getElementById('masterProjectResults');

  if (!searchInput || !results) return;

  const query = normalizeProjectSearch(searchInput.value);

  const division = String(divisionSelect?.value || '').trim();

  let filtered = masterProjects.filter((project) => {
    const projectDivision = String(project.details?.division || '').trim();

    const searchable = normalizeProjectSearch(
      [
        project.details?.shortName || '',
        project.code || '',
        project.name || '',
        project.details?.division || '',
        project.details?.department || '',
        project.details?.director || '',
      ].join(' '),
    );

    const matchesSearch = !query || searchable.includes(query);

    const matchesDivision = !division || projectDivision === division;

    return matchesSearch && matchesDivision;
  });

  // จำกัดผลลัพธ์เพื่อไม่ให้ DOM หนัก
  filtered = filtered.slice(0, 30);

  if (!filtered.length) {
    results.innerHTML = `
      <div class="master-project-empty">
        ไม่พบโครงการที่ตรงกับเงื่อนไข
      </div>
    `;

    results.hidden = false;
    return;
  }

  results.innerHTML = filtered
    .map((project) => {
      const added = isMasterProjectAdded(project.id);

      const shortName = project.details?.shortName || project.code || '-';

      const divisionText = project.details?.division || '-';

      return `
        <button
          type="button"
          class="master-project-result ${added ? 'already-added' : ''}"
          data-master-project-id="${escapeHtml(String(project.id))}"
          ${added ? 'disabled' : ''}
        >

          <div class="master-project-result-main">

            <strong>
              ${escapeHtml(shortName)}
            </strong>

            <span>
              ${escapeHtml(project.name || '-')}
            </span>

          </div>

          <div class="master-project-result-meta">

            <span>
              สายงาน:
              ${escapeHtml(divisionText)}
            </span>

            ${added ? '<b class="master-project-added">✓ เพิ่มแล้ว</b>' : ''}

          </div>

        </button>
      `;
    })
    .join('');

  results.hidden = false;

  results.querySelectorAll('[data-master-project-id]').forEach((button) => {
    button.addEventListener('click', () => {
      chooseMasterProject(button.dataset.masterProjectId);
    });
  });
}
function closeMasterProjectResults() {
  const results = document.getElementById('masterProjectResults');

  if (results) {
    results.hidden = true;
  }
}
// ======================================================
// เลือกโครงการ
// ======================================================

function chooseMasterProject(projectId) {
  const project = masterProjects.find(
    (item) => String(item.id) === String(projectId),
  );

  if (!project) return;

  document.getElementById('masterProjectId').value = project.id;

  document.getElementById('masterProjectSearch').value =
    `${project.details?.shortName || project.code || ''} - ${project.name || ''}`;

  document.getElementById('newProjCode').value =
    project.details?.shortName || project.code || '';

  document.getElementById('newProjName').value = project.name || '';

  document.getElementById('newProjEndYear').value =
    getMasterProjectEndYear(project);

  const results = document.getElementById('masterProjectResults');

  if (results) {
    results.hidden = true;
  }
}

// ======================================================
// ปีสิ้นสุดโครงการ
// ======================================================

function getMasterProjectEndYear(project) {
  const value = String(project?.details?.endDate || '').trim();

  if (!value) {
    return parseInt(currentYear, 10);
  }

  const years = value.match(/\d{4}/g);

  if (!years?.length) {
    return parseInt(currentYear, 10);
  }

  let year = Number(years[years.length - 1]);

  // ค.ศ. → พ.ศ.
  if (year < 2400) {
    year += 543;
  }

  return year;
}

// ======================================================
// เพิ่มโครงการเข้า 9 ช่อง
// ======================================================

function submitMasterProject() {
  const masterProjectId = document.getElementById('masterProjectId').value;

  const masterProject = masterProjects.find(
    (project) => String(project.id) === String(masterProjectId),
  );

  if (!masterProject) {
    nineBoxAlert('กรุณาค้นหาและเลือกโครงการจากฐานข้อมูลหลัก');
    return;
  }

  const currentYearNum = parseInt(currentYear, 10);

  const endYearNum =
    parseInt(document.getElementById('newProjEndYear').value, 10) ||
    currentYearNum;

  if (endYearNum < currentYearNum) {
    nineBoxAlert(`ปีสิ้นสุดต้องไม่น้อยกว่าปี ${currentYear}`);
    return;
  }

  if (isMasterProjectAdded(masterProject.id)) {
    nineBoxAlert(`โครงการ "${masterProject.name}" มีอยู่ในปี ${currentYear} แล้ว`);
    return;
  }

  const newProject = {
    id: `ninebox_${masterProject.id}`,

    masterProjectId: String(masterProject.id),

    // ลำดับถาวรของโครงการ
    sortOrder: getNextProjectSortOrder(),

    code: masterProject.details?.shortName || masterProject.code || '',

    masterCode: masterProject.code || '',

    name: masterProject.name || '',

    endYear: endYearNum,

    isUnboundSelected: false,
    unboundLoan: 0,
    unboundRevenue: 0,

    items: DEFAULT_SOURCES.map((source) => ({
      source,
      bComm: 0,
      bInv: 0,
      tComm: 0,
      tInv: 0,
    })),
  };

  // เพิ่มโครงการตั้งแต่ปีปัจจุบัน
  // ถึงปีสิ้นสุด
  for (let year = currentYearNum; year <= endYearNum; year++) {
    const yearKey = String(year);

    if (!yearsData[yearKey]) {
      yearsData[yearKey] = [];
    }

    const exists = yearsData[yearKey].some(
      (project) =>
        String(project.masterProjectId || '') === String(masterProject.id),
    );

    if (!exists) {
      yearsData[yearKey].push(JSON.parse(JSON.stringify(newProject)));
    }
  }

  projectsData = yearsData[currentYear] || [];

  recalculateBudgetsFromPrevYear();

  saveDataToStorage();

  renderYearTabs();

  updateTableForCurrentYear();

  clearMasterProjectSelection();

  filterMasterProjects();
}

// ======================================================
// Clear หลังเพิ่ม
// ======================================================

function clearMasterProjectSelection() {
  const id = document.getElementById('masterProjectId');

  const search = document.getElementById('masterProjectSearch');

  const code = document.getElementById('newProjCode');

  const name = document.getElementById('newProjName');

  const endYear = document.getElementById('newProjEndYear');

  if (id) id.value = '';
  if (search) search.value = '';
  if (code) code.value = '';
  if (name) name.value = '';
  if (endYear) endYear.value = '';

  const results = document.getElementById('masterProjectResults');

  if (results) {
    results.hidden = true;
  }
}
// ปรับให้รองรับการแปลงค่าที่เป็นตัวเลขติดลบ (-)
function parseFloatAllowNegative(val) {
  if (val === null || val === undefined) return 0;
  const text = String(val).trim().replace(/\u2212/g, '-');
  const accountingNegative = /^\(.*\)$/.test(text);
  // ลบตัวอักษรอื่นๆ ออก ยกเว้นตัวเลข, จุดทศนิยม และเครื่องหมายติดลบ
  const cleanVal = text
    .replace(/[^0-9.-]/g, '')
    .trim();
  const num = parseFloat(cleanVal);
  return isNaN(num) ? 0 : accountingNegative ? -Math.abs(num) : num;
}

function isRevenueSource(source) {
  return source === 'เงินรายได้ กฟภ.' || source === 'เงินรายได้ กฟก.';
}

function normalizeSource(source) {
  if (source === 'เงินรายได้ กฟก.') return 'เงินรายได้ กฟภ.';
  return source;
}

// ปรับให้รองรับการจัดรูปแบบตัวเลขติดลบ พร้อมใส่คลาสสีแดง
function formatAccounting(num) {
  const val = parseFloat(num) || 0;

  // ถ้าค่าเป็น 0 ให้แสดงเครื่องหมาย -
  if (Math.abs(val) < 0.00001) return '-';

  if (val < 0) {
    // กรณีติดลบ: แปลงเป็นค่าบวกชั่วคราวเพื่อจัดฟอร์แมต จากนั้นเติมวงเล็บและคลาสสีแดง
    const formattedText = Math.abs(val).toLocaleString('en-US', {
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    });
    return `<span class="text-negative">(${formattedText})</span>`;
  }

  // กรณีค่าบวกปกติ
  return val.toLocaleString('en-US', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
}

async function exportFullTableToExcel() {
  if (exportFullTableToExcel.busy) return;
  exportFullTableToExcel.busy = true;
  try {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    const years = Object.keys(yearsData).filter(y => /^\d{4}$/.test(y)).sort((a,b) => Number(a)-Number(b));
    if (!years.length) { await nineBoxAlert('ยังไม่มีปีงบประมาณสำหรับส่งออก'); return; }
    const division = document.getElementById('masterDivisionFilter')?.value || '';
    const investment = document.getElementById('budgetInvestmentFilter')?.value || '';
    const selected = await selectExcelYears(years, String(currentYear), division);
    if (!selected) return;
    yearsData[currentYear] = projectsData;
    const workbook = new ExcelJS.Workbook();
    for (const year of selected) {
      const projects = getVisibleProjectEntries(yearsData[year] || [], division, investment).map(entry => entry.project);
      const sheet = addNineBoxExcelSheet(workbook, year, projects);
      sheet.getCell('A2').value = [division ? `สายงาน: ${division}` : 'ทุกสายงาน',
        investment ? `วงเงินดำเนินการรวม: ${investment === 'funded' ? 'ตั้งงบ' : 'ไม่ตั้งงบ'}` : 'วงเงินดำเนินการรวม: ทั้งหมด'].join(' • ');
      sheet.mergeCells('A2:L2');
    }
    const buffer = await workbook.xlsx.writeBuffer();
    const dateParts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date());
    const datePart = type => dateParts.find(part => part.type === type).value;
    const fileDate = `${datePart('day')}_${datePart('month')}_${datePart('year').slice(-2)}`;
    saveAs(new Blob([buffer], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}), `9ช่อง_${fileDate}.xlsx`);
  } catch (error) {
    await nineBoxAlert('ส่งออก Excel ไม่สำเร็จ: ' + error.message);
  } finally { exportFullTableToExcel.busy = false; }
}

function addNineBoxExcelSheet(workbook, currentYear, projectsData) {
  const worksheet = workbook.addWorksheet(`ประมาณการจ่ายเงิน ${currentYear}`);
  worksheet.views = [{ showGridLines: false }];

  const currentYearNum = parseInt(currentYear, 10);
  const nextYearNum = currentYearNum + 1;

  // รูปแบบตัวเลขบัญชี: ทศนิยม 3 ตำแหน่ง, เลขติดลบใส่วงเล็บสีแดง, เลข 0 เป็นเครื่องหมาย -
  const accountingFormat = '#,##0.000;[Red](#,##0.000);"-";@';

  // รูปแบบเส้นตาราง Thin Border
  const thinBorder = {
    top: { style: 'thin', color: { argb: 'FF000000' } },
    left: { style: 'thin', color: { argb: 'FF000000' } },
    bottom: { style: 'thin', color: { argb: 'FF000000' } },
    right: { style: 'thin', color: { argb: 'FF000000' } },
  };
  const sourceRowBorder = {
    left: thinBorder.left,
    right: thinBorder.right,
  };

  // 1. หัวเรื่องหลัก
  worksheet.mergeCells('A1:L1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = `งบลงทุนที่ทำเป็นโครงการ ประจำปี ${currentYear}`;
  titleCell.font = { name: 'Tahoma', size: 16, bold: true };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

  // 2. หัวตาราง (Headers)
  worksheet.getRow(3).values = [
    'ลำดับ',
    'รหัสโครงการ',
    'รายการ / แหล่งเงิน',
    `วงเงินดำเนินการปี ${currentYear}`,
    '',
    '',
    `เป้าหมายการเบิกจ่ายปี ${currentYear}`,
    '',
    '',
    'งบคงเหลือ',
    '',
    '',
  ];
  worksheet.getRow(4).values = [
    '',
    '',
    '',
    'ผูกพัน',
    'ลงทุน',
    'รวม',
    'ผูกพัน',
    'ลงทุน',
    'รวม',
    'ผูกพัน',
    'ลงทุน',
    'รวม',
  ];

  worksheet.mergeCells('A3:A4');
  worksheet.mergeCells('B3:B4');
  worksheet.mergeCells('C3:C4');
  worksheet.mergeCells('D3:F3');
  worksheet.mergeCells('G3:I3');
  worksheet.mergeCells('J3:L3');

  [3, 4].forEach((rowNum) => {
    const row = worksheet.getRow(rowNum);
    row.font = { name: 'Tahoma', bold: true };
    row.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  const grandTotalsBySource = {
    เงินกู้ในประเทศ: { bComm: 0, bInv: 0, tComm: 0, tInv: 0 },
    'เงินรายได้ กฟภ.': { bComm: 0, bInv: 0, tComm: 0, tInv: 0 },
    ที่ดิน: { bComm: 0, bInv: 0, tComm: 0, tInv: 0 },
    OH: { bComm: 0, bInv: 0, tComm: 0, tInv: 0 },
    IDC: { bComm: 0, bInv: 0, tComm: 0, tInv: 0 },
  };

  let currentRow = 5;
  const sourceRowNumbers = new Set();

  // 3. วนลูปข้อมูลโครงการหลัก
  projectsData.forEach((project, pIdx) => {
    const pRow = worksheet.getRow(currentRow);
    pRow.values = [
      pIdx + 1,
      project.code || '',
      project.name,
    ];
    worksheet.mergeCells(`C${currentRow}:L${currentRow}`);
    pRow.font = { name: 'Tahoma', bold: true };
    pRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF7FAFC' },
    };
    currentRow++;

    let projBComm = 0,
      projBInv = 0,
      projTComm = 0,
      projTInv = 0;

    (project.items || []).forEach((item) => {
      const sourceKey = normalizeSource(item.source);
      const bComm = parseFloatAllowNegative(item.bComm);
      const bInv = parseFloatAllowNegative(item.bInv);
      const tComm = parseFloatAllowNegative(item.tComm);
      const tInv = parseFloatAllowNegative(item.tInv);

      if (sourceKey === 'เงินกู้ในประเทศ' || isRevenueSource(sourceKey)) {
        projBComm += bComm;
        projBInv += bInv;
        projTComm += tComm;
        projTInv += tInv;
      }

      if (grandTotalsBySource[sourceKey]) {
        grandTotalsBySource[sourceKey].bComm += bComm;
        grandTotalsBySource[sourceKey].bInv += bInv;
        grandTotalsBySource[sourceKey].tComm += tComm;
        grandTotalsBySource[sourceKey].tInv += tInv;
      }

      const row = worksheet.getRow(currentRow);
      sourceRowNumbers.add(currentRow);
      row.values = [
        '',
        '',
        sourceKey,
        bComm,
        bInv,
        bComm + bInv,
        tComm,
        tInv,
        tComm + tInv,
        bComm - tComm,
        bInv - tInv,
        bComm + bInv - (tComm + tInv),
      ];

      for (let col = 4; col <= 12; col++) {
        const cell = row.getCell(col);
        cell.numberFormat = accountingFormat;
        cell.alignment = { horizontal: 'right' };
      }
      currentRow++;
    });

    // ยอดรวมแต่ละโครงการ
    const subRow = worksheet.getRow(currentRow);
    subRow.values = [
      '',
      '',
      'รวม',
      projBComm,
      projBInv,
      projBComm + projBInv,
      projTComm,
      projTInv,
      projTComm + projTInv,
      projBComm - projTComm,
      projBInv - projTInv,
      projBComm + projBInv - (projTComm + projTInv),
    ];
    subRow.font = { name: 'Tahoma', bold: true };
    subRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF7FAFC' },
    };
    for (let col = 4; col <= 12; col++) {
      const cell = subRow.getCell(col);
      cell.numberFormat = accountingFormat;
      cell.alignment = { horizontal: 'right' };
    }
    currentRow++;
  });

  // 4. สรุปแยกหมวดแหล่งเงิน
  const sources = ['เงินกู้ในประเทศ', 'เงินรายได้ กฟภ.', 'ที่ดิน', 'OH', 'IDC'];
  sources.forEach((sourceKey) => {
    const totals = grandTotalsBySource[sourceKey];
    const rRow = worksheet.getRow(currentRow);
    rRow.values = [
      '',
      '',
      `รวม ${sourceKey}`,
      totals.bComm,
      totals.bInv,
      totals.bComm + totals.bInv,
      totals.tComm,
      totals.tInv,
      totals.tComm + totals.tInv,
      totals.bComm - totals.tComm,
      totals.bInv - totals.tInv,
      totals.bComm + totals.bInv - (totals.tComm + totals.tInv),
    ];
    rRow.font = { name: 'Tahoma', bold: true };
    rRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFEDF2F7' },
    };
    for (let col = 4; col <= 12; col++) {
      const cell = rRow.getCell(col);
      cell.numberFormat = accountingFormat;
      cell.alignment = { horizontal: 'right' };
    }
    currentRow++;
  });

  // 5. รวมทั้งสิ้น
  const gLoan = grandTotalsBySource['เงินกู้ในประเทศ'];
  const gRev = grandTotalsBySource['เงินรายได้ กฟภ.'];
  const gBComm = gLoan.bComm + gRev.bComm;
  const gBInv = gLoan.bInv + gRev.bInv;
  const gTComm = gLoan.tComm + gRev.tComm;
  const gTInv = gLoan.tInv + gRev.tInv;

  const totalRow = worksheet.getRow(currentRow);
  worksheet.mergeCells(`A${currentRow}:C${currentRow}`);
  totalRow.getCell(1).value = 'รวมทั้งสิ้น';
  totalRow.getCell(1).alignment = { horizontal: 'center' };

  totalRow.values = [
    'รวมทั้งสิ้น',
    '',
    '',
    gBComm,
    gBInv,
    gBComm + gBInv,
    gTComm,
    gTInv,
    gTComm + gTInv,
    gBComm - gTComm,
    gBInv - gTInv,
    gBComm + gBInv - (gTComm + gTInv),
  ];
  totalRow.font = { name: 'Tahoma', bold: true };
  totalRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFCBD5E0' },
  };
  for (let col = 4; col <= 12; col++) {
    const cell = totalRow.getCell(col);
    cell.numberFormat = accountingFormat;
    cell.alignment = { horizontal: 'right' };
  }

  // ใส่เส้นขอบ (Border) ให้ตารางหลักทั้งหมด (ตั้งแต่แถวที่ 3 ถึงแถวรวมทั้งสิ้น)
  for (let r = 3; r <= currentRow; r++) {
    const row = worksheet.getRow(r);
    for (let c = 1; c <= 12; c++) {
      row.getCell(c).border = sourceRowNumbers.has(r) ? sourceRowBorder : thinBorder;
    }
  }

  currentRow += 2; // เว้นบรรทัด

  // 6. ส่วนตาราง: โครงการที่ไม่ผูกพันไปปีถัดไป
  const unboundHeaderRow = worksheet.getRow(currentRow);
  worksheet.mergeCells(`A${currentRow}:D${currentRow}`);
  unboundHeaderRow.getCell(1).value = `โครงการที่ไม่ผูกพันไปปี ${nextYearNum}`;
  unboundHeaderRow.font = { name: 'Tahoma', bold: true, size: 11 };
  unboundHeaderRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE2E8F0' },
  };
  unboundHeaderRow.getCell(1).border = thinBorder;
  const unboundStartRow = currentRow;
  currentRow++;

  let totalUnbound = 0;
  let displayedIndex = 1;

  projectsData.forEach((project) => {
    const unbound = getUnboundDetails(project);
    const isAutoEnd = unbound.closed;
    if (unbound.selected) {
      const totalRowUnbound = unbound.total;
      totalUnbound += totalRowUnbound;
      const noteText = unbound.closed ? '' : ' (บางส่วน)';

      const ubProjRow = worksheet.getRow(currentRow);
      ubProjRow.values = [
        displayedIndex++,
        `${project.code || ''}${noteText}`,
      ];
      worksheet.mergeCells(`B${currentRow}:C${currentRow}`);
      ubProjRow.getCell(4).value = totalRowUnbound;
      ubProjRow.getCell(4).numFmt = accountingFormat;
      ubProjRow.getCell(4).alignment = { horizontal: 'right' };
      ubProjRow.font = { name: 'Tahoma', bold: true };
      ubProjRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF7FAFC' },
      };
      ubProjRow.getCell(4).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFEEFC3' },
      };
      currentRow++;
    }
  });

  const ubTotalRow = worksheet.getRow(currentRow);
  worksheet.mergeCells(`A${currentRow}:C${currentRow}`);

  ubTotalRow.getCell(1).value = 'รวม';
  ubTotalRow.getCell(1).alignment = {
    horizontal: 'center',
    vertical: 'middle',
  };
  ubTotalRow.getCell(4).value = totalUnbound;
  ubTotalRow.getCell(4).numFmt = accountingFormat;
  ubTotalRow.height = 24;
  ubTotalRow.getCell(4).alignment = {
    horizontal: 'right',
    vertical: 'middle',
  };

  ubTotalRow.font = { name: 'Tahoma', bold: true };
  ubTotalRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFEDF2F7' },
  };

  // ใส่เส้นขอบ (Border) ให้ตารางล่างทั้งหมด
  for (let r = unboundStartRow; r <= currentRow; r++) {
    const row = worksheet.getRow(r);
    for (let c = 1; c <= 4; c++) {
      row.getCell(c).border = thinBorder;
    }
  }

  // 7. ตั้งความกว้างคอลัมน์อัตโนมัติ
  worksheet.columns.forEach((col, idx) => {
    if (idx === 0) col.width = 8;
    else if (idx === 1) col.width = 14;
    else if (idx === 2) col.width = 45;
    else col.width = 14;
  });

  return worksheet;
}
// ==========================================
// TABLE COLUMN LAYOUT
// ควบคุมความกว้าง 12 คอลัมน์ของตาราง 9 ช่อง
// ==========================================
function ensureBudgetTableColgroup() {
  const table = document.querySelector('.budget-table');

  if (!table) return;

  // ถ้ามีของเราอยู่แล้ว ไม่ต้องสร้างซ้ำ
  const existing = table.querySelector(
    ':scope > colgroup.budget-table-columns',
  );

  if (existing) return;

  // ลบ colgroup เก่าที่อาจเคยทดลองไว้
  table
    .querySelectorAll(':scope > colgroup')
    .forEach((group) => group.remove());

  const colgroup = document.createElement('colgroup');

  colgroup.className = 'budget-table-columns';

  // 12 คอลัมน์จริง
  const columnClasses = [
    'col-order', // 1 ลำดับ
    'col-short', // 2 ชื่อย่อ
    'col-project', // 3 โครงการ / รายการ

    'col-money', // 4
    'col-money', // 5
    'col-money', // 6

    'col-money', // 7
    'col-money', // 8
    'col-money', // 9

    'col-money', // 10
    'col-money', // 11
    'col-money', // 12
  ];

  columnClasses.forEach((className) => {
    const col = document.createElement('col');

    col.className = className;

    colgroup.appendChild(col);
  });

  // ต้องอยู่ก่อน thead
  table.insertBefore(colgroup, table.firstChild);
}
// ==========================================
// FULLSCREEN
// ==========================================

async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) {
      // ขยายหน้า 9 ช่องทั้งหมด
      await document.documentElement.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  } catch (error) {
    console.error('Fullscreen error:', error);

    nineBoxAlert('ไม่สามารถเปิดโหมดเต็มหน้าจอได้ กรุณาลองเปิดหน้า 9 ช่องใหม่อีกครั้ง');
  }
}

function updateFullscreenButton() {
  const button = document.getElementById('fullscreenBtn');

  if (!button) return;

  if (document.fullscreenElement) {
    button.innerHTML = '⛶ Exit Fullscreen';
    button.title = 'Exit Fullscreen';
  } else {
    button.innerHTML = '⛶ Fullscreen';
    button.title = 'Fullscreen';
  }
}
document.addEventListener('DOMContentLoaded', async () => {
  // สร้างโครงความกว้าง 12 คอลัมน์
  ensureBudgetTableColgroup();

  if (!await loadDataFromStorage()) {
    window.nineBoxLoadState = 'error';
    return;
  }
  setupKeyboardShortcuts();

  await loadMasterProjects();
  window.nineBoxLoadState = 'ready';
  const fullscreenBtn = document.getElementById('fullscreenBtn');

  if (fullscreenBtn) {
    fullscreenBtn.addEventListener('click', toggleFullscreen);
  }

  document.addEventListener('fullscreenchange', updateFullscreenButton);

  // ==========================================
  // คลิกนอกพื้นที่ค้นหา -> ปิดรายการโครงการ
  // ==========================================
  document.addEventListener('pointerdown', (event) => {
    const searchArea = event.target.closest('.master-project-search-row');

    if (!searchArea) {
      closeMasterProjectResults();
    }
  });

  // ==========================================
  // กด Esc -> ปิดรายการ
  // ==========================================
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeMasterProjectResults();

      const search = document.getElementById('masterProjectSearch');

      if (search) {
        search.blur();
      }
    }
  });
});

// ==========================================
// 2. FILE & STORAGE OPERATIONS
// ==========================================

function setupKeyboardShortcuts() {
  document.addEventListener('keydown', async (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      if (!await saveDataToStorage()) nineBoxAlert('บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง');
    }
  });
}

function normalizeYearsData() {
  const cleanedYearsData = {};

  Object.keys(yearsData).forEach((y) => {
    const yearNum = parseInt(y, 10);

    // ตัด key ที่ไม่ใช่ปี พ.ศ. ออก เช่น NaN, undefined
    if (!Number.isFinite(yearNum) || yearNum < 2500 || yearNum > 2700) {
      console.warn('ลบปีที่ไม่ถูกต้อง:', y);
      return;
    }

    const yearKey = String(yearNum);
    cleanedYearsData[yearKey] = Array.isArray(yearsData[y]) ? yearsData[y] : [];

    cleanedYearsData[yearKey].forEach((project) => {
      if (project.unboundLoan === undefined) {
        project.unboundLoan = 0;
      }

      if (project.unboundRevenue === undefined) {
        project.unboundRevenue = 0;
      }

      (project.items || []).forEach((item) => {
        item.source = normalizeSource(item.source);
      });
    });
  });

  yearsData = cleanedYearsData;
}

async function saveAsFile() {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  const saved = await saveDataToStorage();
  const dataStr =
    'data:text/json;charset=utf-8,' +
    encodeURIComponent(JSON.stringify(yearsData, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute('href', dataStr);
  const dateParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const datePart = type => dateParts.find(part => part.type === type).value;
  const fileDate = `${datePart('day')}_${datePart('month')}_${datePart('year').slice(-2)}`;
  downloadAnchor.setAttribute(
    'download',
    `9ช่อง_${fileDate}.json`,
  );
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  setTimeout(() => downloadAnchor.remove(), 100);
  if (!saved) nineBoxAlert('บันทึกลงฐานข้อมูลไม่สำเร็จ แต่ได้ส่งไฟล์สำรองให้ดาวน์โหลดแล้ว กรุณาลองบันทึกอีกครั้ง');
}

function exportToCSV() {
  let csvContent = '\uFEFF';
  csvContent +=
    'ปีงบประมาณ,ลำดับ,รหัสโครงการ,ชื่อโครงการ,ปีสิ้นสุด,รายการแหล่งเงิน,วงเงินผูกพัน,วงเงินลงทุน,รวมวงเงิน,เป้าผูกพัน,เป้าลงทุน,รวมเป้า,คงเหลือผูกพัน,คงเหลือลงทุน,รวมคงเหลือ\n';

  const sortedYears = Object.keys(yearsData).sort(
    (a, b) => parseInt(a, 10) - parseInt(b, 10),
  );

  sortedYears.forEach((y) => {
    const projs = yearsData[y] || [];
    projs.forEach((p, pIdx) => {
      (p.items || []).forEach((item) => {
        const bComm = parseFloatAllowNegative(item.bComm);
        const bInv = parseFloatAllowNegative(item.bInv);
        const bTotal = bComm + bInv;

        const tComm = parseFloatAllowNegative(item.tComm);
        const tInv = parseFloatAllowNegative(item.tInv);
        const tTotal = tComm + tInv;

        const rComm = bComm - tComm;
        const rInv = bInv - tInv;
        const rTotal = bTotal - tTotal;

        csvContent += `"${y}","${pIdx + 1}","${p.code || ''}","${(p.name || '').replace(/"/g, '""')}","${p.endYear || ''}","${item.source}",${bComm},${bInv},${bTotal},${tComm},${tInv},${tTotal},${rComm},${rInv},${rTotal}\n`;
      });
    });
  });

  const encodedUri =
    'data:text/csv;charset=utf-8,' + encodeURIComponent(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute(
    'download',
    `รายงานประมาณการจ่ายเงิน_${new Date().toISOString().slice(0, 10)}.csv`,
  );
  document.body.appendChild(link);
  link.click();
  setTimeout(() => link.remove(), 100);
}

// ==========================================
// 3. CALCULATION & DATA MANAGEMENT LOGIC
// ==========================================

function getUnboundDetails(project, year = currentYear) {
  const nextYear = String(Number(year) + 1);
  const hasNextYear = Object.prototype.hasOwnProperty.call(yearsData, nextYear) &&
    Array.isArray(yearsData[nextYear]);
  const sameProject = (candidate) => {
    if (project.masterProjectId && candidate.masterProjectId)
      return String(project.masterProjectId) === String(candidate.masterProjectId);
    if (project.id != null && candidate.id != null && String(project.id) === String(candidate.id)) return true;
    if (project.code && candidate.code && project.code === candidate.code) return true;
    return !!project.name && project.name === candidate.name;
  };
  const nextProject = hasNextYear ? yearsData[nextYear].find(sameProject) : null;
  const balance = (value, revenue, carryOnly = false) =>
    (value?.items || []).filter((item) => revenue
      ? isRevenueSource(item.source)
      : normalizeSource(item.source) === 'เงินกู้ในประเทศ')
      .reduce((sum, item) => sum + parseFloatAllowNegative(item.bComm) +
        (carryOnly ? 0 : parseFloatAllowNegative(item.bInv) -
          parseFloatAllowNegative(item.tComm) - parseFloatAllowNegative(item.tInv)), 0);
  const closed = hasNextYear ? !nextProject : Number(project.endYear) === Number(year);
  const round = (value) => Math.round(value * 1000) / 1000;
  let total;
  if (hasNextYear) {
    const remainingTotal = balance(project, false) + balance(project, true);
    const nextCommitmentTotal = balance(nextProject, false, true) + balance(nextProject, true, true);
    total = round(Math.max(0, remainingTotal - nextCommitmentTotal));
  } else if (project.isUnboundSelected) {
    total = parseFloatAllowNegative(project.unboundLoan) + parseFloatAllowNegative(project.unboundRevenue);
  } else {
    total = balance(project, false) + balance(project, true);
  }
  return {
    automatic: hasNextYear,
    selected: hasNextYear ? total > 0 : !!project.isUnboundSelected || closed,
    closed, total,
  };
}

function recalculateBudgetsFromPrevYear() {
  const sortedYears = Object.keys(yearsData).sort(
    (a, b) => parseInt(a, 10) - parseInt(b, 10),
  );

  for (let i = 1; i < sortedYears.length; i++) {
    const prevYearStr = sortedYears[i - 1];
    const currYearStr = sortedYears[i];

    const prevProjects = yearsData[prevYearStr] || [];
    const currProjects = yearsData[currYearStr] || [];

    currProjects.forEach((cProj) => {
      const pProj = prevProjects.find(
        (p) =>
          (cProj.id && p.id === cProj.id) ||
          (cProj.code && p.code === cProj.code) ||
          p.name === cProj.name,
      );

      if (pProj && pProj.items && cProj.items) {
        const unboundLoan = parseFloatAllowNegative(pProj.unboundLoan);
        const unboundRevenue = parseFloatAllowNegative(pProj.unboundRevenue);

        cProj.items.forEach((cItem) => {
          if (cItem.bCommManual === true) return;
          const pItem = pProj.items.find(
            (pi) =>
              normalizeSource(pi.source) === normalizeSource(cItem.source),
          );
          if (pItem) {
            const prevTotalBudget =
              parseFloatAllowNegative(pItem.bComm) +
              parseFloatAllowNegative(pItem.bInv);
            const prevTotalTarget =
              parseFloatAllowNegative(pItem.tComm) +
              parseFloatAllowNegative(pItem.tInv);
            let prevRemainingTotal = prevTotalBudget - prevTotalTarget;

            if (cItem.source === 'เงินกู้ในประเทศ') {
              prevRemainingTotal = prevRemainingTotal - unboundLoan;
            } else if (isRevenueSource(cItem.source)) {
              prevRemainingTotal = prevRemainingTotal - unboundRevenue;
            }

            cItem.bComm = prevRemainingTotal;
          }
        });
      }
    });
  }
}

function addNewYear() {
  const validYears = Object.keys(yearsData)
    .map((year) => parseInt(year, 10))
    .filter((year) => Number.isFinite(year) && year >= 2500 && year <= 2700)
    .sort((a, b) => a - b);

  const lastYear =
    validYears.length > 0
      ? validYears[validYears.length - 1]
      : Number(currentYear);

  const newYear = lastYear + 1;
  if (!Number.isInteger(newYear) || newYear > 2700) {
    nineBoxAlert('รองรับปี พ.ศ. ไม่เกิน 2700');
    return;
  }
  const newYearStr = String(newYear);

  if (yearsData[newYearStr]) {
    nineBoxAlert(`ปี ${newYearStr} มีอยู่ในระบบแล้ว`);
    return;
  }

  yearsData[newYearStr] = [];

  const prevProjects = yearsData[String(lastYear)] || [];

  prevProjects.forEach((project) => {
    const endYearNum = parseInt(project.endYear, 10);

    if (!Number.isFinite(endYearNum) || endYearNum >= newYear) {
      const copiedProject = JSON.parse(JSON.stringify(project));

      copiedProject.isUnboundSelected = false;
      copiedProject.unboundLoan = 0;
      copiedProject.unboundRevenue = 0;

      (copiedProject.items || []).forEach((item) => {
        delete item.bCommManual;
        item.bComm = 0;
        item.bInv = 0;
        item.tComm = 0;
        item.tInv = 0;
      });

      yearsData[newYearStr].push(copiedProject);
    }
  });

  currentYear = newYearStr;
  projectsData = yearsData[currentYear];

  recalculateBudgetsFromPrevYear();
  saveDataToStorage();
  renderYearTabs();
  updateTableForCurrentYear();
}

async function deleteYear(event, yearToDelete) {
  if (event) event.stopPropagation();

  const sortedYears = Object.keys(yearsData);
  if (sortedYears.length <= 1) {
    nineBoxAlert('⚠️ ไม่สามารถลบได้ ต้องมีอย่างน้อย 1 ปีงบประมาณในระบบ');
    return;
  }

  if (await nineBoxConfirm(`คุณต้องการลบปีงบประมาณ ${yearToDelete} ใช่หรือไม่?`)) {
    delete yearsData[yearToDelete];

    const remainingYears = Object.keys(yearsData).sort(
      (a, b) => parseInt(a, 10) - parseInt(b, 10),
    );
    currentYear = remainingYears.includes(currentYear)
      ? currentYear
      : remainingYears[remainingYears.length - 1];
    projectsData = yearsData[currentYear] || [];

    recalculateBudgetsFromPrevYear();
    saveDataToStorage();
    renderYearTabs();
    updateTableForCurrentYear();
  }
}

function switchYear(year) {
  if (!yearsData[year]) return;
  currentYear = year;
  projectsData = yearsData[currentYear] || [];
  renderYearTabs();
  updateTableForCurrentYear();
  saveDataToStorage();
}

function addNewProject(code, name, endYear) {
  const cleanCode = escapeHtml(code.trim());
  const cleanName = escapeHtml(name.trim());
  const endYearNum = parseInt(endYear, 10) || parseInt(currentYear, 10);

  if (!cleanName) {
    nineBoxAlert('กรุณากรอกชื่อโครงการ');
    return;
  }

  const newProject = {
    id: 'proj_' + Date.now(),
    code: cleanCode,
    name: cleanName,
    endYear: endYearNum,
    isUnboundSelected: false,
    unboundLoan: 0,
    unboundRevenue: 0,
    items: DEFAULT_SOURCES.map((source) => ({
      source: source,
      bComm: 0,
      bInv: 0,
      tComm: 0,
      tInv: 0,
    })),
  };

  const sortedYears = Object.keys(yearsData)
    .map((y) => parseInt(y, 10))
    .sort((a, b) => a - b);
  sortedYears.forEach((yNum) => {
    if (yNum >= parseInt(currentYear, 10) && yNum <= endYearNum) {
      const yrStr = String(yNum);
      if (!yearsData[yrStr]) yearsData[yrStr] = [];

      const exists = yearsData[yrStr].some(
        (p) => p.code === cleanCode && p.name === cleanName,
      );
      if (!exists) {
        yearsData[yrStr].push(JSON.parse(JSON.stringify(newProject)));
      }
    }
  });

  recalculateBudgetsFromPrevYear();
  saveDataToStorage();
  renderYearTabs();
  updateTableForCurrentYear();
}

async function deleteProject(pIndex) {
  const project = projectsData[pIndex];

  if (!project) return;

  const currentYearNum = parseInt(currentYear, 10);
  const newEndYear = currentYearNum - 1;

  // ตรวจว่าเป็นโครงการเดียวกันหรือไม่
  const isSameProject = (p) => {
    if (!p) return false;

    // ใช้ masterProjectId ก่อน
    if (project.masterProjectId && p.masterProjectId) {
      return String(p.masterProjectId) === String(project.masterProjectId);
    }

    // รองรับข้อมูลเดิม
    if (
      project.id != null &&
      p.id != null &&
      String(p.id) === String(project.id)
    ) {
      return true;
    }

    if (project.code && p.code && p.code === project.code) {
      return true;
    }

    return project.name && p.name && p.name === project.name;
  };

  // ตรวจว่ามีโครงการอยู่ในปีก่อนหน้าหรือไม่
  const hasPreviousYear = Object.keys(yearsData).some((yearKey) => {
    const yearNum = parseInt(yearKey, 10);

    if (!Number.isFinite(yearNum) || yearNum >= currentYearNum) {
      return false;
    }

    return (yearsData[yearKey] || []).some(isSameProject);
  });

  const message = hasPreviousYear
    ? `ต้องการสิ้นสุดโครงการ "${project.name}" ที่ปี ${newEndYear} ใช่หรือไม่?\n\nโครงการจะถูกลบตั้งแต่ปี ${currentYearNum} เป็นต้นไป`
    : `ต้องการลบโครงการ "${project.name}" ออกจากปี ${currentYearNum} เป็นต้นไปใช่หรือไม่?`;

  if (!await nineBoxConfirm(message)) {
    return;
  }

  // อัปเดตทุกปี
  Object.keys(yearsData).forEach((yearKey) => {
    const yearNum = parseInt(yearKey, 10);

    if (!Number.isFinite(yearNum)) {
      return;
    }

    const yearProjects = yearsData[yearKey] || [];

    // ปีก่อนหน้าปีที่กดลบ
    // ให้คงโครงการไว้ แต่เปลี่ยนปีสิ้นสุด
    if (yearNum < currentYearNum) {
      yearProjects.forEach((p) => {
        if (isSameProject(p)) {
          p.endYear = newEndYear;
        }
      });

      return;
    }

    // ปีที่กดลบและปีอนาคต
    // เอาโครงการออก
    yearsData[yearKey] = yearProjects.filter((p) => !isSameProject(p));
  });

  projectsData = yearsData[currentYear] || [];

  recalculateBudgetsFromPrevYear();

  saveDataToStorage();

  renderYearTabs();

  updateTableForCurrentYear();

  if (typeof filterMasterProjects === 'function') {
    filterMasterProjects();
  }
}

async function editProjectEndYear(pIndex) {
  const project = projectsData[pIndex];
  if (!project) return;

  const currentYearNum = parseInt(currentYear, 10);
  const inputYear = await nineBoxPrompt(
    `แก้ไขปีสิ้นสุดโครงการ "${project.name}":`,
    project.endYear || currentYear,
  );

  if (inputYear === null || inputYear.trim() === '') return;

  const newEndYearNum = parseInt(inputYear.trim(), 10);
  if (isNaN(newEndYearNum) || newEndYearNum < currentYearNum) {
    nineBoxAlert(
      `กรุณากรอกปี พ.ศ. ให้ถูกต้องและต้องไม่น้อยกว่าปีปัจจุบัน (${currentYearNum})`,
    );
    return;
  }

  project.endYear = newEndYearNum;

  const allYears = Object.keys(yearsData).map((y) => parseInt(y, 10));
  const maxYearInSystem = Math.max(...allYears, newEndYearNum);

  for (let yr = currentYearNum + 1; yr <= maxYearInSystem; yr++) {
    const yrStr = String(yr);

    if (yr <= newEndYearNum) {
      if (!yearsData[yrStr]) yearsData[yrStr] = [];

      let existingProj = yearsData[yrStr].find(
        (p) =>
          (project.id && p.id === project.id) ||
          (project.code && p.code === project.code) ||
          p.name === project.name,
      );

      if (!existingProj) {
        const copiedProject = JSON.parse(JSON.stringify(project));
        copiedProject.endYear = newEndYearNum;
        copiedProject.isUnboundSelected = false;
        copiedProject.unboundLoan = 0;
        copiedProject.unboundRevenue = 0;

        if (copiedProject.items) {
          copiedProject.items.forEach((item) => {
            delete item.bCommManual;
            item.bComm = 0;
            item.bInv = 0;
            item.tComm = 0;
            item.tInv = 0;
          });
        }
        yearsData[yrStr].push(copiedProject);
      } else {
        existingProj.endYear = newEndYearNum;
      }
    } else {
      if (yearsData[yrStr]) {
        yearsData[yrStr] = yearsData[yrStr].filter(
          (p) =>
            !(
              (project.id && p.id === project.id) ||
              (project.code && p.code === project.code) ||
              p.name === project.name
            ),
        );
      }
    }
  }

  // เรียงตามลำดับการเพิ่มโครงการเดิม
  recalculateBudgetsFromPrevYear();

  sortProjectsByAddOrder();

  projectsData = yearsData[currentYear] || [];

  saveDataToStorage();
  renderYearTabs();
  renderTable();
}

function updateValue(projectIndex, itemIndex, field, newValue) {
  let numVal = parseFloatAllowNegative(newValue);

  const project = projectsData[projectIndex];
  if (!project || !project.items[itemIndex]) return;

  const currentItem = project.items[itemIndex];
  const oldVal = currentItem[field] || 0;
  if (numVal === parseFloatAllowNegative(oldVal)) return;

  currentItem[field] = numVal;

  const revItem = project.items.find((i) => isRevenueSource(i.source));
  const landItem = project.items.find((i) => i.source === 'ที่ดิน');
  const ohItem = project.items.find((i) => i.source === 'OH');
  const idcItem = project.items.find((i) => i.source === 'IDC');

  const maxAllowed = revItem ? parseFloatAllowNegative(revItem[field]) : 0;
  const currentSubTotal =
    parseFloatAllowNegative(landItem ? landItem[field] : 0) +
    parseFloatAllowNegative(ohItem ? ohItem[field] : 0) +
    parseFloatAllowNegative(idcItem ? idcItem[field] : 0);

  const isSubSource = ['ที่ดิน', 'OH', 'IDC'].includes(currentItem.source);
  const nonNegativeGroup = [revItem, landItem, ohItem, idcItem]
    .every(item => !item || parseFloatAllowNegative(item[field]) >= 0);
  if (isSubSource && nonNegativeGroup && currentSubTotal > maxAllowed) {
    nineBoxAlert(
      `⚠️ ไม่สามารถกรอกได้!\n\nยอดรวมย่อย (ที่ดิน + OH + IDC) เท่ากับ ${currentSubTotal.toLocaleString('en-US', { minimumFractionDigits: 3 })} ล้านบาท\nเกินกว่ายอด "เงินรายได้ กฟภ." ที่ตั้งไว้ (${maxAllowed.toLocaleString('en-US', { minimumFractionDigits: 3 })} ล้านบาท)`,
    );
    currentItem[field] = oldVal;
    renderTable();
    return;
  }

  if (isRevenueSource(currentItem.source) && nonNegativeGroup && maxAllowed < currentSubTotal) {
    nineBoxAlert(
      `⚠️ ไม่สามารถปรับลดได้!\n\nการปรับยอด "เงินรายได้ กฟภ." เหลือ ${maxAllowed.toLocaleString('en-US', { minimumFractionDigits: 3 })} ล้านบาท\nจะทำให้ต่ำกว่าผลรวมย่อย (ที่ดิน + OH + IDC) ที่มีอยู่เดิม (${currentSubTotal.toLocaleString('en-US', { minimumFractionDigits: 3 })} ล้านบาท)`,
    );
    currentItem[field] = oldVal;
    renderTable();
    return;
  }

  if (field === 'bComm') currentItem.bCommManual = true;
  recalculateBudgetsFromPrevYear();
  saveDataToStorage();
  renderTable();
}

function addUnboundProject(pIndex) {
  if (pIndex === '' || pIndex === null || pIndex === undefined) return;
  const idx = parseInt(pIndex, 10);
  const project = projectsData[idx];
  if (!project) return;

  const loanItem = (project.items || []).find(
    (i) => i.source === 'เงินกู้ในประเทศ',
  );
  const revItem = (project.items || []).find((i) => isRevenueSource(i.source));

  let loanRem = 0,
    revRem = 0;

  if (loanItem) {
    const bTot =
      parseFloatAllowNegative(loanItem.bComm) +
      parseFloatAllowNegative(loanItem.bInv);
    const tTot =
      parseFloatAllowNegative(loanItem.tComm) +
      parseFloatAllowNegative(loanItem.tInv);
    loanRem = bTot - tTot;
  }

  if (revItem) {
    const bTot =
      parseFloatAllowNegative(revItem.bComm) +
      parseFloatAllowNegative(revItem.bInv);
    const tTot =
      parseFloatAllowNegative(revItem.tComm) +
      parseFloatAllowNegative(revItem.tInv);
    revRem = bTot - tTot;
  }

  project.isUnboundSelected = true;
  project.unboundLoan = loanRem;
  project.unboundRevenue = revRem;

  recalculateBudgetsFromPrevYear();
  saveDataToStorage();
  renderTable();
}

function removeUnboundProject(pIndex) {
  const project = projectsData[pIndex];
  if (!project) return;

  project.isUnboundSelected = false;
  project.unboundLoan = 0;
  project.unboundRevenue = 0;

  recalculateBudgetsFromPrevYear();
  saveDataToStorage();
  renderTable();
}

// ==========================================
// 4. RENDER FUNCTIONS
// ==========================================

function renderNumGroup(
  valComm,
  valInv,
  isEditable = false,
  pIndex = 0,
  itemIndex = 0,
  fieldComm = '',
  fieldInv = '',
) {
  const comm = parseFloatAllowNegative(valComm);
  const inv = parseFloatAllowNegative(valInv);
  const total = comm + inv;

  if (isEditable) {
    return `
      <td contenteditable="true" class="editable-cell" onblur="updateValue(${pIndex}, ${itemIndex}, '${fieldComm}', this.innerText)">${formatAccounting(comm)}</td>
      <td contenteditable="true" class="editable-cell" onblur="updateValue(${pIndex}, ${itemIndex}, '${fieldInv}', this.innerText)">${formatAccounting(inv)}</td>
      <td class="read-only-cell">${formatAccounting(total)}</td>
    `;
  }

  return `
    <td class="read-only-cell">${formatAccounting(comm)}</td>
    <td class="read-only-cell">${formatAccounting(inv)}</td>
    <td class="read-only-cell font-weight-bold">${formatAccounting(total)}</td>
  `;
}
// ==========================================
// ลำดับโครงการตามเวลาที่เพิ่มเข้าระบบ
// ==========================================

function getProjectOrderKey(project) {
  if (!project) return '';

  return String(
    project.masterProjectId ||
      project.masterCode ||
      project.id ||
      project.code ||
      project.name ||
      '',
  );
}

// สร้าง sortOrder ให้ข้อมูลเก่าที่เคยบันทึกไว้แล้ว
function ensureProjectSortOrders() {
  const orderMap = new Map();

  let maxOrder = 0;

  const sortedYears = Object.keys(yearsData).sort(
    (a, b) => parseInt(a, 10) - parseInt(b, 10),
  );

  // ------------------------------------------
  // รอบแรก:
  // อ่าน sortOrder ที่มีอยู่แล้ว
  // ------------------------------------------
  sortedYears.forEach((yearKey) => {
    (yearsData[yearKey] || []).forEach((project) => {
      const key = getProjectOrderKey(project);
      const order = Number(project.sortOrder);

      if (key && Number.isFinite(order) && order > 0) {
        if (!orderMap.has(key)) {
          orderMap.set(key, order);
        }

        maxOrder = Math.max(maxOrder, order);
      }
    });
  });

  // ------------------------------------------
  // รอบสอง:
  // ข้อมูลเก่าที่ยังไม่มี sortOrder
  // ให้เรียงตามลำดับที่พบจากปีเก่าสุด
  // ------------------------------------------
  sortedYears.forEach((yearKey) => {
    (yearsData[yearKey] || []).forEach((project) => {
      const key = getProjectOrderKey(project);

      if (!key) return;

      if (!orderMap.has(key)) {
        maxOrder += 1;
        orderMap.set(key, maxOrder);
      }

      project.sortOrder = orderMap.get(key);
    });
  });

  // ------------------------------------------
  // เรียงทุกปีตาม sortOrder
  // ------------------------------------------
  sortedYears.forEach((yearKey) => {
    yearsData[yearKey] = (yearsData[yearKey] || []).sort((a, b) => {
      return Number(a.sortOrder || 999999) - Number(b.sortOrder || 999999);
    });
  });
}

function getNextProjectSortOrder() {
  let maxOrder = 0;

  Object.values(yearsData).forEach((projects) => {
    (projects || []).forEach((project) => {
      const order = Number(project.sortOrder);

      if (Number.isFinite(order)) {
        maxOrder = Math.max(maxOrder, order);
      }
    });
  });

  return maxOrder + 1;
}

function sortProjectsByAddOrder() {
  ensureProjectSortOrders();

  Object.keys(yearsData).forEach((yearKey) => {
    yearsData[yearKey].sort(
      (a, b) => Number(a.sortOrder || 999999) - Number(b.sortOrder || 999999),
    );
  });

  projectsData = yearsData[currentYear] || [];
}

function applyDivisionFilter() {
  closeMasterProjectResults();
  renderTable();
}

function getVisibleProjectEntries(projects = projectsData, division = document.getElementById('masterDivisionFilter')?.value || '', investment = document.getElementById('budgetInvestmentFilter')?.value || '') {
  return (projects || []).map((project, pIndex) => ({project, pIndex}))
    .filter(({project}) => {
      if (division) {
        const master = masterProjects.find(item =>
          (project.masterProjectId && String(item.id) === String(project.masterProjectId)) ||
          (project.masterCode && item.code === project.masterCode));
        if (String(master?.details?.division || project.details?.division || '').trim() !== division) return false;
      }
      const totalInvestment = (project.items || []).reduce((sum, item) => sum + parseFloatAllowNegative(item.bInv), 0);
      const hasInvestment = Math.abs(totalInvestment) >= 0.0005;
      return !investment || (investment === 'funded' ? hasInvestment : !hasInvestment);
    });
}

function renderTable() {
  const tbody = document.getElementById('tableBody');
  if (!tbody) return;

  // บังคับลำดับโครงการตามลำดับที่เพิ่มครั้งแรก
  sortProjectsByAddOrder();

  const visibleEntries = getVisibleProjectEntries();

  let htmlStr = '';

  const grandTotalsBySource = {
    เงินกู้ในประเทศ: { bComm: 0, bInv: 0, tComm: 0, tInv: 0 },
    'เงินรายได้ กฟภ.': { bComm: 0, bInv: 0, tComm: 0, tInv: 0 },
    ที่ดิน: { bComm: 0, bInv: 0, tComm: 0, tInv: 0 },
    OH: { bComm: 0, bInv: 0, tComm: 0, tInv: 0 },
    IDC: { bComm: 0, bInv: 0, tComm: 0, tInv: 0 },
  };

  if (!visibleEntries.length) {
    tbody.innerHTML = `<tr><td colspan="12" style="text-align:center; padding: 20px;">${projectsData?.length ? 'ไม่พบโครงการตามตัวกรองที่เลือก' : 'ไม่มีข้อมูลโครงการในขณะนี้'}</td></tr>`;
    return;
  }

  // --- ส่วนที่ 1: รายการโครงการ ---
  visibleEntries.forEach(({project, pIndex}, visibleIndex) => {
    const endYearLabel = formatProjectEndYear(project.endYear);
    htmlStr += `
  <tr class="project-header-row">

    <td class="project-order-cell">
      ${visibleIndex + 1}
    </td>

    <td class="project-code-cell">
      <b>${escapeHtml(project.code || '')}</b>
    </td>

    <td colspan="10" class="project-title-cell">

      <div class="project-title-content">

        <div class="project-title-text">

          <strong>
            ${escapeHtml(project.name)}
          </strong>

          ${endYearLabel ? `<span class="project-end-year">${escapeHtml(endYearLabel)}</span>` : ''}

        </div>

        <div class="project-actions no-print">

          <button
            type="button"
            onclick="editProjectEndYear(${pIndex})"
          >
            แก้ไขปี
          </button>

          <button
            type="button"
            class="btn-delete-project"
            onclick="deleteProject(${pIndex})"
          >
            ลบ
          </button>

        </div>

      </div>

    </td>

  </tr>`;

    let projBComm = 0,
      projBInv = 0,
      projTComm = 0,
      projTInv = 0;

    (project.items || []).forEach((item, itemIndex) => {
      const sourceKey = normalizeSource(item.source);
      const bComm = parseFloatAllowNegative(item.bComm);
      const bInv = parseFloatAllowNegative(item.bInv);
      const tComm = parseFloatAllowNegative(item.tComm);
      const tInv = parseFloatAllowNegative(item.tInv);

      if (sourceKey === 'เงินกู้ในประเทศ' || isRevenueSource(sourceKey)) {
        projBComm += bComm;
        projBInv += bInv;
        projTComm += tComm;
        projTInv += tInv;
      }

      if (grandTotalsBySource[sourceKey]) {
        grandTotalsBySource[sourceKey].bComm += bComm;
        grandTotalsBySource[sourceKey].bInv += bInv;
        grandTotalsBySource[sourceKey].tComm += tComm;
        grandTotalsBySource[sourceKey].tInv += tInv;
      }

      htmlStr += `
        <tr class="sub-item-row">
          <td></td><td></td>
          <td class="source-label${['ที่ดิน', 'OH', 'IDC'].includes(sourceKey) ? ' source-label-secondary' : ''}"><span>${escapeHtml(sourceKey)}</span></td>
          ${renderNumGroup(bComm, bInv, true, pIndex, itemIndex, 'bComm', 'bInv')}
          ${renderNumGroup(tComm, tInv, true, pIndex, itemIndex, 'tComm', 'tInv')}
          ${renderNumGroup(bComm - tComm, bInv - tInv)}
        </tr>`;
    });

    htmlStr += `
      <tr class="summary-row subtotal-row" style="background-color: #f7fafc;">
        <td colspan="2"></td>
        <td class="project-subtotal-label"><b>รวม</b></td>
        ${renderNumGroup(projBComm, projBInv)}
        ${renderNumGroup(projTComm, projTInv)}
        ${renderNumGroup(projBComm - projTComm, projBInv - projTInv)}
      </tr>`;
  });

  // --- ส่วนที่ 2: สรุปแยกหมวด ---
  const sources = ['เงินกู้ในประเทศ', 'เงินรายได้ กฟภ.', 'ที่ดิน', 'OH', 'IDC'];
  sources.forEach((sourceKey) => {
    const totals = grandTotalsBySource[sourceKey];
    htmlStr += `
      <tr class="summary-source-row subtotal-row" style="background-color: #edf2f7;">
        <td colspan="2"></td>
        <td style="text-align: left; padding-left: 20px;">รวม ${escapeHtml(sourceKey)}</td>
        ${renderNumGroup(totals.bComm, totals.bInv)}
        ${renderNumGroup(totals.tComm, totals.tInv)}
        ${renderNumGroup(totals.bComm - totals.tComm, totals.bInv - totals.tInv)}
      </tr>`;
  });

  // --- ส่วนที่ 3: ยอดรวมทั้งสิ้น ---
  const gLoan = grandTotalsBySource['เงินกู้ในประเทศ'];
  const gRev = grandTotalsBySource['เงินรายได้ กฟภ.'];

  const gBComm = gLoan.bComm + gRev.bComm;
  const gBInv = gLoan.bInv + gRev.bInv;
  const gTComm = gLoan.tComm + gRev.tComm;
  const gTInv = gLoan.tInv + gRev.tInv;

  htmlStr += `
    <tr class="summary-row total-row" style="background-color: #cbd5e0; border-top: 2px solid #4a5568;">
      <td colspan="3" style="text-align:center;"><b>รวมทั้งสิ้น</b></td>
      ${renderNumGroup(gBComm, gBInv)}
      ${renderNumGroup(gTComm, gTInv)}
      ${renderNumGroup(gBComm - gTComm, gBInv - gTInv)}
    </tr>`;

  // --- ส่วนที่ 4: โครงการที่ไม่ผูกพันไปปีถัดไป ---
  const currentYearNum = parseInt(currentYear, 10);
  const nextYearNum = currentYearNum + 1;

  let selectOptions = `<option value="">-- เลือกโครงการเพื่อเพิ่มรายการตัดงบ --</option>`;
  let availableToSelectCount = 0;

  visibleEntries.forEach(({project, pIndex}) => {
    const endYearNum = parseInt(project.endYear, 10);
    const isAutoEnd = endYearNum && endYearNum === currentYearNum;

    if (!getUnboundDetails(project).automatic && !project.isUnboundSelected && !isAutoEnd) {
      selectOptions += `<option value="${pIndex}">${project.code ? escapeHtml(project.code) + ' - ' : ''}${escapeHtml(project.name)}</option>`;
      availableToSelectCount++;
    }
  });

  htmlStr += `
    <tr style="height: 20px;"><td colspan="12" style="background-color: #ffffff; border: none;"></td></tr>
    <tr class="unbound-section">
      <td colspan="12">
        <table class="unbound-table" aria-label="โครงการที่ไม่ผูกพันไปปี ${nextYearNum}">
          <colgroup><col class="unbound-order"><col class="unbound-short"><col class="unbound-money"></colgroup>
          <thead><tr><th colspan="2">โครงการที่ไม่ผูกพันไปปี ${nextYearNum}</th><th aria-label="ยอดไม่ผูกพัน"></th></tr></thead>
          <tbody>
        ${
          availableToSelectCount > 0
            ? `
          <tr class="no-print"><td colspan="3"><select aria-label="เพิ่มรายการไม่ผูกพัน" onchange="addUnboundProject(this.value)">
            ${selectOptions}
          </select></td></tr>
        `
            : ''
        }
    `;

  let totalUnbound = 0;
  let displayedIndex = 1;

  visibleEntries.forEach(({project, pIndex}) => {
    const unbound = getUnboundDetails(project);
    const isAutoEnd = unbound.closed;
    if (unbound.selected) {
      const totalRowUnbound = unbound.total;
      totalUnbound += totalRowUnbound;
      const noteText = unbound.closed ? '' : '(บางส่วน)';

      htmlStr += `
        <tr class="unbound-row">
          <td>${displayedIndex++}</td>
          <td><b>${escapeHtml(project.code || '')}</b> <span class="unbound-note">${noteText}</span>
            ${!unbound.automatic && !isAutoEnd ? `<button type="button" class="btn-delete-project no-print" style="margin-left: 8px;" onclick="removeUnboundProject(${pIndex})">🗑️ ยกเลิก</button>` : ''}
          </td>
          <td class="unbound-amount">
            <b>${formatAccounting(totalRowUnbound)}</b>
          </td>
        </tr>`;

    }
  });

  if (displayedIndex === 1) {
    htmlStr += `
      <tr><td colspan="3">(ไม่มีโครงการที่ไม่ผูกพันไปปีถัดไป)</td></tr>`;
  }

  htmlStr += `
    <tr class="unbound-summary">
      <td colspan="2" class="unbound-total-label"><b>รวม</b></td>
      <td class="unbound-amount">
        <strong>${formatAccounting(totalUnbound)}</strong>
      </td>
    </tr></tbody></table></td></tr>`;

  tbody.innerHTML = htmlStr;
}

function updateTableForCurrentYear() {
  const tableTitle = document.getElementById('tableTitle');
  if (tableTitle)
    tableTitle.innerText = `งบลงทุนที่ทำเป็นโครงการ ประจำปี ${escapeHtml(currentYear)}`;

  const thHeader1 = document.getElementById('thHeader1');
  if (thHeader1)
    thHeader1.innerText = `วงเงินดำเนินการปี ${escapeHtml(currentYear)}`;

  const thHeader2 = document.getElementById('thHeader2');
  if (thHeader2)
    thHeader2.innerText = `เป้าหมายการเบิกจ่ายปี ${escapeHtml(currentYear)}`;

  projectsData = yearsData[currentYear] || [];
  renderTable();
}

function renderYearTabs() {
  const tabsContainer = document.getElementById('yearTabs');
  if (!tabsContainer) return;
  tabsContainer.innerHTML = '';

  const sortedYears = Object.keys(yearsData).sort(
    (a, b) => parseInt(a, 10) - parseInt(b, 10),
  );

  sortedYears.forEach((year) => {
    const btn = document.createElement('button');
    btn.className = `tab-btn ${year === currentYear ? 'active' : ''}`;

    btn.innerHTML = `
      <span>ปี ${escapeHtml(year)}</span>
      <span class="btn-delete-year no-print" onclick="deleteYear(event, '${escapeHtml(year)}')" title="ลบปี ${escapeHtml(year)}">×</span>
    `;

    btn.onclick = () => switchYear(year);
    tabsContainer.appendChild(btn);
  });
}

// ==========================================
// ระบบเลื่อนโฟกัสช่องกรอกข้อมูล (รองรับทั้ง Enter และ Tab)
// ==========================================
function setupInputNavigation() {
  // ดักจับแบบ Capture phase (useCapture = true) เพื่อให้ทำงานก่อน Event อื่นๆ
  document.addEventListener(
    'keydown',
    function (e) {
      const target = e.target;
      const isInput = target.tagName === 'INPUT' || target.isContentEditable;

      if (!isInput) return;

      const isEnter = e.key === 'Enter';
      const isTab = e.key === 'Tab';

      if (isEnter || isTab) {
        // ค้นหา Element ในตารางทั้งหมดที่กรอกข้อมูลได้ (รวมทั้ง <input> และ contenteditable)
        const inputs = Array.from(
          document.querySelectorAll(
            'table input:not([disabled]), table [contenteditable="true"]',
          ),
        );

        const currentIndex = inputs.indexOf(target);

        if (currentIndex !== -1) {
          e.preventDefault();
          e.stopPropagation(); // หยุดการส่ง Event ไปยังตัวดักจับอื่นที่อาจบล็อกปุ่ม Enter

          // ถ้ามีการพิมพ์ค่าอยู่ ให้ยิง Event blur/change เพื่อสั่งบันทึก/คำนวณยอดก่อนย้ายช่อง
          target.blur();

          const nextIndex = e.shiftKey ? currentIndex - 1 : currentIndex + 1;

          if (nextIndex >= 0 && nextIndex < inputs.length) {
            const nextInput = inputs[nextIndex];

            setTimeout(() => {
              nextInput.focus();

              // หากเป็น <input> ให้ทำการเลือกข้อความทั้งหมด
              if (typeof nextInput.select === 'function') {
                nextInput.select();
              } else if (nextInput.isContentEditable) {
                // หากเป็น contenteditable ให้คลุมดำข้อความข้างใน
                const range = document.createRange();
                range.selectNodeContents(nextInput);
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
              }
            }, 20);
          }
        }
      }
    },
    true,
  ); // ใช้ true ตรงนี้เพื่อให้ดักปุ่มได้แน่นอน
}

// เรียกใช้งาน
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupInputNavigation);
} else {
  setupInputNavigation();
}
