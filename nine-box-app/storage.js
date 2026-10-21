// SQLite is the source of truth. The old browser copy is retained for recovery.
let planVersion = 0;
let planReady = false;
let pendingPlan = null;
let savingPlan = null;
let planSaveError = null;
let choosingStartYear = false;

function syncStartYearControls() {
  const needsYear = planVersion === 0;
  document.getElementById('startYearSetup').hidden = !needsYear;
  const locked = needsYear || importInProgress || choosingStartYear;
  document.getElementById('planEditor').disabled = locked;
  document.getElementById('planEditor').inert = locked;
  document.getElementById('startYearSubmit').disabled = importInProgress || choosingStartYear;
}

async function chooseStartYear() {
  if (!planReady || planVersion !== 0 || choosingStartYear || importInProgress) return;
  const input = document.getElementById('startYearInput');
  if (!input.reportValidity()) return;
  const value = input.value.trim();
  const errorPanel = document.getElementById('startYearError');
  if (!/^\d{4}$/.test(value) || Number(value) < 2500 || Number(value) > 2700) {
    errorPanel.textContent = 'กรุณาระบุปี พ.ศ. ระหว่าง 2500–2700';
    return;
  }
  choosingStartYear = true;
  syncStartYearControls();
  errorPanel.textContent = '';
  try {
    const result = await planRequest('/api/nine-box', 'PUT', {
      yearsData: {[value]: []}, currentYear: value, version: 0,
    });
    planVersion = result.version;
    displayPlan({[value]: []}, value);
    storageStatus('บันทึกปีเริ่มต้นแล้ว — พร้อมใช้งานปี ' + value);
  } catch (error) {
    errorPanel.textContent = 'บันทึกปีเริ่มต้นไม่สำเร็จ: ' + error.message;
  } finally {
    choosingStartYear = false;
    syncStartYearControls();
  }
}

function storageStatus(message) {
  document.getElementById('storageStatus').textContent = message;
  document.documentElement.classList.toggle(
    'storage-error',
    /ยังไม่บันทึก|ไม่สำเร็จ|ไม่สามารถ|ตรวจการเชื่อมต่อ/.test(message),
  );
}

async function planRequest(path, method = 'GET', body) {
  const response = await fetch(path, {
    method, cache: 'no-store',
    headers: body ? {'Content-Type': 'application/json'} : {},
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `โหลดข้อมูลไม่สำเร็จ (${response.status})`);
  return result;
}

function displayPlan(data, year) {
  yearsData = data;
  currentYear = year;
  normalizeYearsData();
  projectsData = yearsData[currentYear];
  recalculateBudgetsFromPrevYear();
  renderYearTabs();
  updateTableForCurrentYear();
}

function snapshotPlan() {
  if (yearsData[currentYear]) yearsData[currentYear] = projectsData;
  return JSON.parse(JSON.stringify({yearsData, currentYear}));
}

function saveDataToStorage() {
  if (!planReady || planVersion === 0) return Promise.resolve(false);
  pendingPlan = snapshotPlan();
  return flushPlan();
}

function flushPlan() {
  if (savingPlan) return savingPlan;
  if (!pendingPlan) return Promise.resolve(!planSaveError);
  savingPlan = (async () => {
    try {
      planSaveError = null;
      while (pendingPlan) {
        const snapshot = pendingPlan;
        pendingPlan = null;
        storageStatus('กำลังบันทึก…');
        try {
          const result = await planRequest('/api/nine-box', 'PUT', {...snapshot, version: planVersion});
          planVersion = result.version;
        } catch (error) {
          pendingPlan = pendingPlan || snapshot;
          throw error;
        }
      }
      storageStatus('บันทึกลงฐานข้อมูลแล้ว');
      return true;
    } catch (error) {
      planSaveError = error;
      storageStatus('ยังไม่บันทึก: ' + error.message + ' — ลองบันทึกอีกครั้ง หรือส่งออก JSON เก็บไว้');
      return false;
    } finally {
      savingPlan = null;
    }
  })();
  return savingPlan;
}

async function loadDataFromStorage() {
  try {
    const saved = await planRequest('/api/nine-box');
    planVersion = saved.version;
    let data = saved.yearsData;
    let year = saved.currentYear;
    let migrationMessage = '';
    // Only an uninitialized database can receive the browser copy automatically.
    // Existing DB data always wins; manual import remains available.
    if (saved.version === 0) {
      try {
        const legacy = localStorage.getItem('budget_years_data');
        if (legacy) {
          const old = JSON.parse(legacy);
          const oldYear = localStorage.getItem('budget_current_year');
          const checked = await planRequest('/api/nine-box/import/preview', 'POST', {
            yearsData: old, currentYear: Object.hasOwn(old, oldYear) ? oldYear : Object.keys(old).sort()[0],
          });
          const result = await planRequest('/api/nine-box/import', 'POST', {...checked, version: 0});
          planVersion = result.version;
          data = checked.yearsData;
          year = checked.currentYear;
          migrationMessage = 'ย้ายข้อมูลเดิมเข้าฐานข้อมูลแล้ว (ยังเก็บสำเนาในเบราว์เซอร์ไว้)';
        }
      } catch (error) {
        // Do not enable editing on top of an unsuccessful migration.
        throw new Error('ย้ายข้อมูลเดิมไม่สำเร็จ ข้อมูลเดิมยังอยู่ในเบราว์เซอร์: ' + error.message);
      }
    }
    displayPlan(data, year);
    planReady = true;
    document.getElementById('startYearInput').value = year;
    syncStartYearControls();
    storageStatus(migrationMessage || (planVersion === 0 ? 'เลือกปีงบประมาณเริ่มต้นก่อนจัดทำตาราง' : 'พร้อมใช้งาน — บันทึกอัตโนมัติลงฐานข้อมูล'));
    return true;
  } catch (error) {
    storageStatus(error.message + ' — ตรวจการเชื่อมต่อแล้วกดโหลดข้อมูลล่าสุด');
    return false;
  }
}

function canLeaveNineBox() {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  if (pendingPlan || savingPlan || planSaveError) {
    storageStatus('ยังมีข้อมูลที่ไม่บันทึก กรุณารอ หรือลองบันทึกอีกครั้งก่อนเปลี่ยนหน้า');
    return false;
  }
  return !importInProgress && !choosingStartYear;
}

window.addEventListener('beforeunload', (event) => {
  if (!canLeaveNineBox()) {
    event.preventDefault();
    event.returnValue = '';
  }
});

let importInProgress = false;
async function importPlan(data, preferredYear) {
  if (!planReady || importInProgress || choosingStartYear) return false;
  importInProgress = true;
  document.getElementById('planEditor').disabled = true;
  document.getElementById('planEditor').inert = true;
  syncStartYearControls();
  try {
    if (!await flushPlan()) throw new Error('กรุณาบันทึกข้อมูลปัจจุบันให้สำเร็จก่อนนำเข้า');
    const checked = await planRequest('/api/nine-box/import/preview', 'POST', {
      yearsData: data, currentYear: preferredYear || Object.keys(data || {}).sort()[0],
    });
    if (!await nineBoxConfirm(`นำเข้า ${checked.years} ปี รวม ${checked.projects} รายการโครงการ (นับแยกแต่ละปี)\nข้อมูลปัจจุบันจะถูกแทนที่\nยืนยันนำเข้าหรือไม่?`)) return false;
    const result = await planRequest('/api/nine-box/import', 'POST', {...checked, version: planVersion});
    planVersion = result.version;
    displayPlan(checked.yearsData, checked.currentYear);
    storageStatus('นำเข้าและบันทึกแล้ว');
    return true;
  } catch (error) {
    nineBoxAlert('นำเข้าไม่สำเร็จ: ' + error.message);
    return false;
  } finally {
    importInProgress = false;
    syncStartYearControls();
  }
}

function openFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      if (file.size > 9 * 1024 * 1024) throw new Error('ไฟล์ต้องไม่เกิน 9 MB');
      await importPlan(JSON.parse(await file.text()));
    } catch (error) {
      nineBoxAlert('อ่านไฟล์ไม่สำเร็จ: ' + error.message);
    }
  };
  input.click();
}

async function importBrowserPlan() {
  try {
    const raw = localStorage.getItem('budget_years_data');
    if (!raw) return nineBoxAlert('ไม่พบข้อมูลเดิมในเบราว์เซอร์นี้');
    await importPlan(JSON.parse(raw));
  } catch (error) {
    nineBoxAlert('อ่านข้อมูลเบราว์เซอร์ไม่สำเร็จ: ' + error.message);
  }
}

async function showPlanBackups() {
  try {
    const backups = await planRequest('/api/nine-box/backups');
    const list = document.getElementById('planBackups');
    list.replaceChildren();
    list.hidden = false;
    if (!backups.length) list.textContent = 'ยังไม่มีสำเนาก่อนนำเข้า';
    for (const backup of backups) {
      const link = document.createElement('a');
      link.href = `/api/nine-box/backups/${backup.id}`;
      link.textContent = `ดาวน์โหลดสำเนา ${new Date(backup.created_at).toLocaleString('th-TH')} (#${backup.id})`;
      link.style.display = 'block';
      list.appendChild(link);
    }
  } catch (error) { nineBoxAlert(error.message); }
}

async function reloadPlan() {
  if (importInProgress) return;
  if (!canLeaveNineBox() && !await nineBoxConfirm('ยังมีข้อมูลที่ไม่บันทึก ควรส่งออก JSON เก็บไว้ก่อน ต้องการละทิ้งข้อมูลบนหน้าจอและโหลดใหม่หรือไม่?')) return;
  location.reload();
}


async function editStartYear() {
  if (!planReady || planVersion === 0 || choosingStartYear || importInProgress) return;
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  if (!(await flushPlan())) {nineBoxAlert('กรุณาบันทึกข้อมูลที่ค้างอยู่ให้สำเร็จก่อนแก้ไขปี');return;}
  const years = Object.keys(yearsData).sort((a,b)=>Number(a)-Number(b));
  const oldYear = years[0];
  const answer = await nineBoxPrompt('แก้ไขปีงบประมาณเริ่มต้น (พ.ศ. 2500–2700) ข้อมูลในปีเดิมจะย้ายไปปีที่ระบุ', oldYear);
  if (answer === null) return;
  const year = answer.trim();
  if (!/^\d{4}$/.test(year) || Number(year)<2500 || Number(year)>2700) {nineBoxAlert('กรุณาระบุปี พ.ศ. ระหว่าง 2500–2700');return;}
  if (year === oldYear) return;
  if (Object.hasOwn(yearsData,year)) {nineBoxAlert('ปีนี้มีอยู่แล้ว กรุณาเลือกปีอื่น');return;}
  if (years.length>1 && Number(year)>=Number(years[1])) {nineBoxAlert('ปีเริ่มต้นต้องน้อยกว่าปีถัดไป '+years[1]);return;}
  if (!await nineBoxConfirm(`เปลี่ยนปีเริ่มต้น ${oldYear} เป็น ${year} หรือไม่? ข้อมูลโครงการและยอดเงินของปีเดิมจะย้ายไปปีใหม่ ส่วนปีอื่นและปีสิ้นสุดโครงการคงเดิม`)) return;
  choosingStartYear = true;
  syncStartYearControls();
  try {
    const snapshot = snapshotPlan();
    snapshot.yearsData[year] = snapshot.yearsData[oldYear];
    delete snapshot.yearsData[oldYear];
    if (snapshot.currentYear === oldYear) snapshot.currentYear = year;
    const result = await planRequest('/api/nine-box', 'PUT', {...snapshot, version:planVersion});
    planVersion = result.version;
    displayPlan(snapshot.yearsData, snapshot.currentYear);
    storageStatus('แก้ไขปีเริ่มต้นเป็น '+year+' และบันทึกแล้ว');
  } catch(error) {nineBoxAlert('แก้ไขปีเริ่มต้นไม่สำเร็จ: '+error.message);}
  finally {choosingStartYear=false;syncStartYearControls();}
}
