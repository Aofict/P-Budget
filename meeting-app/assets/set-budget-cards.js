/* Reuse the annual-allocation dashboard for both meeting budget years. */
(() => {
  const overview = document.querySelector('.comparison-cards-section');
  if (!overview) return;
  overview.id = 'operating-overview-cards';
  overview.hidden = true;
  const panel = document.createElement('section');
  panel.id = 'annual-allocation-cards';
  panel.className = 'allocation-matrix-panel du-card du-card-border';
  panel.setAttribute('aria-label', 'สมการงบประมาณก่อนและหลังประชุม');
  const title = document.createElement('h3');
  title.className = 'allocation-panel-title';
  title.textContent = 'เปรียบเทียบงบประมาณ';
  panel.append(title);
  const tabs = document.createElement('div');
  tabs.className = 'summary-table-tabs allocation-view-tabs';
  tabs.setAttribute('role', 'group');
  tabs.setAttribute('aria-label', 'มุมมองงบประมาณ');
  const overviewButton = document.createElement('button'), allocationButton = document.createElement('button');
  for (const button of [overviewButton, allocationButton]) {
    button.type = 'button';
    button.className = 'summary-table-tab';
    button.setAttribute('aria-controls', panel.id);
    tabs.append(button);
  }
  const layout = document.createElement('div');
  layout.className = 'allocation-dashboard-layout';
  overview.before(tabs);
  overview.after(layout);
  layout.append(panel);
  const chartSection = document.querySelector('.chart-section');
  if (chartSection) {
    layout.append(chartSection);
    const chartCard = chartSection.querySelector('.chart-card');
    if (chartCard) {
      chartCard.classList.add('du-card', 'du-card-border');
      const heading = document.createElement('h3');
      heading.className = 'allocation-chart-title';
      heading.textContent = 'เปรียบเทียบก่อนและหลังประชุม';
      chartCard.prepend(heading);
    }
  }
  const dashboardHeading = document.querySelector('.summary-section-head');
  if (dashboardHeading) {
    const dashboard = document.createElement('section');
    dashboard.id = 'meeting-dashboard-fullscreen';
    dashboard.setAttribute('aria-label', 'Dashboard งบประมาณ');
    dashboardHeading.before(dashboard);
    dashboard.append(dashboardHeading, tabs, overview, layout);
  }
  const labels = ['ผูกพันยกมา', 'ตั้งงบประจำปี', 'รวม', 'เป้าจ่าย', 'คงเหลือ'];
  const values = [], deltas = [], labelNodes = [];
  const scroll = document.createElement('div');
  scroll.className = 'allocation-matrix-scroll';
  scroll.tabIndex = 0;
  scroll.setAttribute('role', 'region');
  scroll.setAttribute('aria-label', 'สมการงบประมาณ เลื่อนแนวนอนเพื่อดูทุกคอลัมน์');
  const table = document.createElement('table');
  table.className = 'du-table allocation-matrix';
  table.setAttribute('aria-label', 'ผูกพันยกมา + ตั้งงบประจำปี = รวม − เป้าจ่าย = คงเหลือ');
  const head = table.createTHead().insertRow();
  const stageHeading = document.createElement('th');
  stageHeading.scope = 'col';
  stageHeading.className = 'allocation-stage-heading';
  stageHeading.setAttribute('aria-label', 'ก่อนหรือหลังประชุม');
  head.append(stageHeading);
  labels.forEach((label,index) => {
    const th = document.createElement('th');
    th.scope = 'col'; th.className = 'allocation-metric-heading';
    th.textContent = label; labelNodes.push(th); head.append(th);
  });
  const body = table.createTBody();
  for (const [stage,title] of [['pre','ก่อนประชุม'],['post','หลังประชุม']]) {
    const row = body.insertRow(); row.className = `allocation-stage-${stage}`;
    const titleCell = document.createElement('th');
    titleCell.scope = 'row'; titleCell.className = 'allocation-stage-label';
    titleCell.textContent = title;
    row.append(titleCell);
    labels.forEach((label,index) => {
      const value = row.insertCell();
      value.className = 'allocation-equation-number'; value.textContent = '—'; values.push(value);
    });
  }
  const difference = body.insertRow(); difference.className = 'allocation-delta-row';
  const differenceLabel = document.createElement('th');
  differenceLabel.scope = 'row';
  differenceLabel.className = 'allocation-delta-label';
  differenceLabel.textContent = 'เพิ่ม / ลด';
  difference.insertCell();
  labels.forEach((label,index) => {
    if (index === 0) {
      difference.append(differenceLabel);
      return;
    }
    const cell = difference.insertCell(); cell.className = 'allocation-equation-foot';
    if (index === 1 || index === 3) {
      const diff = document.createElement('div'); diff.className = 'allocation-difference';
      const number = document.createElement('strong'); number.textContent = '—'; deltas.push(number);
      diff.append(number); cell.append(diff);
    }
  });
  scroll.append(table); panel.append(scroll);
  const status = document.createElement('p'); status.className = 'allocation-status';
  status.setAttribute('role','status'); status.textContent = 'กำลังโหลดข้อมูล…'; panel.append(status);
  const states = {change:null,set:null};
  let active = 'change';
  const format = value => Number(value).toLocaleString('en-US',{minimumFractionDigits:3,maximumFractionDigits:3});
  const originalUpdateChart = updateChart;
  updateChart = (...args) => {
    const state = states[active];
    if (!state) { if (args.length) originalUpdateChart(...args); return; }
    originalUpdateChart(state.before[0]+state.before[1],state.after[0]+state.after[1],state.before[3],state.after[3]);
  };
  function render() {
    overviewButton.textContent = `เปลี่ยนแปลงงบปี ${CHANGE_YEAR}`;
    allocationButton.textContent = `ตั้งงบประจำปี ${SET_YEAR}`;
    [overviewButton,allocationButton].forEach((button,i) => {
      const selected = (i === 0 ? 'change' : 'set') === active;
      button.classList.toggle('active',selected); button.setAttribute('aria-pressed',String(selected));
    });
    const year = active === 'change' ? CHANGE_YEAR : SET_YEAR;
    const heading = document.getElementById('summary-heading-year');
    if (heading) heading.textContent = `ปี ${year}`;
    const badge = document.getElementById('summary-year-badge');
    if (badge) badge.textContent = active === 'change' ? `ปีเปลี่ยนแปลงงบ ${year}` : `ปีตั้งงบ ${year}`;
    labelNodes[1].textContent = active === 'change' ? 'ลงทุน' : 'ตั้งงบประจำปี';
    labelNodes[1].title = active === 'change' ? 'ตั้งงบลงทุน + เปลี่ยนแปลงงบระหว่างปี' : 'ลงทุนตั้งงบประจำปี';
    table.setAttribute('aria-label', active === 'change'
      ? 'ผูกพันยกมา + ลงทุน = รวม − เป้าจ่าย = คงเหลือ'
      : 'ผูกพันยกมา + ตั้งงบประจำปี = รวม − เป้าจ่าย = คงเหลือ');
    const state = states[active];
    if (!state) { values.forEach(v=>v.textContent='—'); deltas.forEach(v=>v.textContent='—');status.textContent='กำลังโหลดข้อมูล…';return; }
    [...state.before,...state.after].forEach((value,i)=>values[i].textContent=format(value));
    [1,3].forEach((index,i)=>{
      const delta=Math.round((state.after[index]-state.before[index])*1000)/1000;
      deltas[i].textContent=(delta>0?'+':'')+format(delta);
      deltas[i].classList.toggle('is-increase',delta>0);deltas[i].classList.toggle('is-decrease',delta<0);
    });
    status.textContent = active === 'change'
      ? `ปี ${year} · ผูกพันยกมา + ลงทุน (ตั้งงบ + เปลี่ยนแปลงงบ) = รวม − เป้าจ่าย = คงเหลือ`
      : `ปี ${year} · ผูกพันยกมา + ตั้งงบประจำปี = รวม − เป้าจ่าย = คงเหลือ`;
    updateChart();
    if (typeof chartInstance !== 'undefined' && chartInstance) {
      chartInstance.canvas.setAttribute('aria-label',`เปรียบเทียบก่อนและหลังประชุม ปี ${year}`);
      chartInstance.resize();
    }
  }
  overviewButton.onclick = () => { active='change';render(); };
  allocationButton.onclick = () => { active='set';render(); };
  const makeTotals = ([committed, investment, target]) => {
    const total = committed + investment;
    return [committed, investment, total, target, total - target];
  };
  window.addEventListener('meeting-set-summary-totals',event=>{
    const {totals,committed=0}=event.detail;
    states.set={before:makeTotals([committed,totals[0],totals[1]]),after:makeTotals([committed,totals[2],totals[3]])};
    render();
  });
  window.addEventListener('meeting-change-summary-totals',event=>{
    const {before,after} = event.detail;
    states.change = {before:makeTotals(before),after:makeTotals(after)};
    render();
  });
  window.addEventListener('meeting-dashboard-error',()=>{
    states.change=null;states.set=null;render();status.textContent='โหลดข้อมูลไม่สำเร็จ กรุณาโหลดหน้าใหม่';
  });
  render();
})();
