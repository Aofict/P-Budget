/* Move the editable annual meeting plan without changing its total. */
(() => {
  'use strict';
  const pane = document.getElementById('budget-pane');
  const button = document.getElementById('budget-shift-button');
  const undo = document.getElementById('budget-shift-undo');
  if (!pane || !button || !undo) return;
  const fields = [
    ['investment_set_post', 'ลงทุนตั้งงบประจำปี (หลังประชุม)'],
    ['investment_change', 'ลงทุนเปลี่ยนแปลงงบ (หลังประชุม)'],
    ['disbursement_target_post', 'เป้าหมายเบิกจ่าย (หลังประชุม)'],
  ];
  let backup = null;
  let appliedState = '';
  let pending = null;
  const cell = (year, field) => pane.querySelector(`.input-budget[data-year="${year}"][data-field="${field}"]`);
  const years = () => [...new Set([...pane.querySelectorAll('.input-budget[data-year]')].map(input => Number(input.dataset.year)))].sort((a,b) => a-b);
  const snapshot = () => years().map(year => fields.map(([field]) => cell(year, field)?.value ?? ''));
  const signature = () => JSON.stringify(snapshot());
  const editable = () => !window.__pBudgetReadOnly && fields.every(([field]) => years().every(year => {
    const input = cell(year, field);
    return input && !input.readOnly && !input.disabled;
  }));
  const amount = raw => {
    const text = String(raw).replace(/,/g, '').trim();
    if (!text || text === '-' || text === '—') return 0;
    if (!/^[+-]?\d+(?:\.\d*)?$/.test(text) || !Number.isFinite(Number(text))) throw Error('มีช่องตัวเลขไม่ถูกต้อง กรุณาแก้ไขก่อน Shift แผน');
    const scaled = Math.round(Number(text)*1000);
    if (!Number.isSafeInteger(scaled)) throw Error('จำนวนเงินมากเกินกว่าจะเลื่อนแผนได้อย่างแม่นยำ');
    return scaled;
  };
  const money = scaled => (scaled/1000).toLocaleString('en-US', {minimumFractionDigits:3, maximumFractionDigits:3});
  const dialog = document.createElement('dialog');
  dialog.className = 'budget-shift-dialog';
  dialog.setAttribute('aria-labelledby', 'budget-shift-title');
  dialog.innerHTML = `<section class="du-card"><div class="budget-shift-head"><h2 id="budget-shift-title">Shift แผนออกไป 1 ปี</h2><button type="button" class="btn btn-outline-secondary" data-shift-close>ปิด</button></div><p>เลื่อนเฉพาะแถวหลังประชุม: ลงทุนตั้งงบประจำปี ลงทุนเปลี่ยนแปลงงบ และเป้าหมายเบิกจ่าย ส่วนผูกพันและคงเหลือจะคำนวณใหม่</p><p class="budget-shift-notice">ยอดที่เลื่อนเกินปีสุดท้ายจะรวมในคอลัมน์ “สิ้นสุดโครงการ” เพื่อไม่ให้ยอดรวมสูญหาย</p><div class="budget-shift-preview" tabindex="0" role="region" aria-label="ตัวอย่างแผนก่อนและหลังเลื่อน"></div><p role="status" class="budget-shift-message"></p><div class="budget-shift-footer"><button type="button" class="btn btn-secondary" data-shift-close>ยกเลิก</button><button type="button" class="btn btn-primary" data-shift-apply>เลื่อนแผน +1 ปี</button></div></section>`;
  pane.append(dialog);
  const selection = document.createElement('fieldset');
  selection.className = 'budget-shift-selection';
  const legend = document.createElement('legend');
  legend.textContent = 'เลือกแถวที่ต้องการ Shift';
  selection.append(legend);
  fields.forEach(([field, label]) => {
    const option = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = field;
    checkbox.checked = field === 'disbursement_target_post';
    option.append(checkbox, document.createTextNode(' ' + label));
    selection.append(option);
  });
  dialog.querySelector('.budget-shift-preview').before(selection);
  const selected = index => selection.querySelector(`input[value="${fields[index][0]}"]`).checked;
  const message = dialog.querySelector('.budget-shift-message');
  const apply = dialog.querySelector('[data-shift-apply]');
  dialog.querySelectorAll('[data-shift-close]').forEach(close => close.addEventListener('click', () => dialog.close()));
  dialog.addEventListener('close', () => { pending = null; button.focus({preventScroll:true}); });
  function renderPreview(list, before, after) {
    const table = document.createElement('table');
    const head = table.createTHead().insertRow();
    ['รายการ', ...list.map((year,index) => `ปี ${year}${index===list.length-1?'–สิ้นสุดโครงการ':''}`), 'รวมก่อน / หลัง'].forEach(label => {
      const th = document.createElement('th'); th.scope = 'col'; th.textContent = label; head.append(th);
    });
    const body = table.createTBody();
    fields.forEach(([, label], fieldIndex) => {
      if (!selected(fieldIndex)) return;
      const row = body.insertRow();
      const title = document.createElement('th'); title.scope = 'row'; title.textContent = label; row.append(title);
      list.forEach((_,yearIndex) => {
        const td = row.insertCell();
        const old = document.createElement('span'); old.textContent = money(before[yearIndex][fieldIndex]);
        const next = document.createElement('strong'); next.textContent = '→ '+money(after[yearIndex][fieldIndex]);
        td.append(old,next);
        td.classList.toggle('is-shifted', before[yearIndex][fieldIndex] !== after[yearIndex][fieldIndex]);
      });
      const total = row.insertCell();
      const previousTotal = before.reduce((sum, values) => sum+values[fieldIndex],0);
      const nextTotal = after.reduce((sum, values) => sum+values[fieldIndex],0);
      total.textContent = money(previousTotal)+' / '+money(nextTotal);
      if (!Number.isSafeInteger(nextTotal) || previousTotal !== nextTotal) throw Error('ยอดรวมก่อนและหลังไม่ตรงกัน ไม่สามารถเลื่อนแผนได้');
    });
    dialog.querySelector('.budget-shift-preview').replaceChildren(table);
  }
  button.addEventListener('click', () => {
    if (window.__pBudgetReadOnly) return;
    const list = years();
    if (list.length < 2 || !editable()) return;
    message.textContent = ''; apply.disabled = true; pending = null;
    try {
      if (!fields.some((_, index) => selected(index))) throw Error('กรุณาเลือกอย่างน้อย 1 แถว');
      const raw = snapshot();
      const before = raw.map(values => values.map(amount));
      if (!before.some(values => values.some((value, index) => selected(index) && value !== 0))) throw Error('ยังไม่มีตัวเลขแผนสำหรับเลื่อน');
      const after = before.map(values => values.map((value, index) => selected(index) ? 0 : value));
      before.forEach((values,index) => values.forEach((value,fieldIndex) => {
        if (!selected(fieldIndex)) return;
        after[Math.min(index+1,list.length-1)][fieldIndex] += value;
      }));
      renderPreview(list,before,after);
      pending = {list, raw, after, original:JSON.stringify(raw)};
      apply.disabled = false;
      message.textContent = 'ตัวเลขบน = ก่อนเลื่อน · ตัวเลขล่าง = หลังเลื่อน · กดยืนยันแล้วต้องบันทึกข้อมูลอีกครั้ง';
    } catch (error) {
      dialog.querySelector('.budget-shift-preview').replaceChildren();
      message.textContent = error.message;
    }
    if (!dialog.open) dialog.showModal();
  });
  selection.addEventListener('change', () => button.click());
  function write(list, values) {
    list.forEach((year,index) => fields.forEach(([field],fieldIndex) => {
      const input = cell(year,field);
      input.value = values[index][fieldIndex];
      input.classList.add('is-edited');
    }));
    calculateBudget();
    setEditStatus('dirty');
  }
  apply.addEventListener('click', () => {
    if (!pending || !editable() || signature()!==pending.original) {
      message.textContent = 'ข้อมูลเปลี่ยนแล้ว กรุณาปิดและเปิด Shift แผนอีกครั้ง'; apply.disabled = true; return;
    }
    const {list, raw, after} = pending;
    write(list, after.map((values, yearIndex) => values.map((value, fieldIndex) => selected(fieldIndex) ? money(value) : raw[yearIndex][fieldIndex])));
    backup = {list,raw}; appliedState = signature(); undo.hidden = false;
    dialog.close();
  });
  undo.addEventListener('click', () => {
    if (!backup || !editable() || signature()!==appliedState) { backup = null; undo.hidden = true; return; }
    write(backup.list,backup.raw);
    backup = null; appliedState = ''; undo.hidden = true;
  });
  pane.addEventListener('input', event => {
    if (event.target.matches('.input-budget') && backup) { backup = null; undo.hidden = true; }
  });
})();
