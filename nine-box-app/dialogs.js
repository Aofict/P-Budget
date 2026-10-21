/* In-page dialogs preserve fullscreen while asking for user input. */
let nineBoxDialogId = 0;
function nineBoxDialog(message, kind = 'alert', initialValue = '') {
  return new Promise(resolve => {
    const dialog = document.createElement('dialog');
    dialog.className = 'nine-box-dialog';
    const form = document.createElement('form');
    form.method = 'dialog';
    const label = document.createElement('p');
    label.id = 'nine-box-dialog-' + (++nineBoxDialogId);
    label.textContent = message;
    dialog.setAttribute('aria-labelledby', label.id);
    form.append(label);
    let input;
    if (kind === 'prompt') {
      input = document.createElement('input');
      input.value = initialValue;
      input.setAttribute('aria-labelledby', label.id);
      form.append(input);
    }
    const actions = document.createElement('div');
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'ยกเลิก';
    cancel.onclick = () => dialog.close('cancel');
    if (kind !== 'alert') actions.append(cancel);
    const accept = document.createElement('button');
    accept.type = 'submit';
    accept.textContent = 'ตกลง';
    actions.append(accept);
    form.append(actions);
    form.onsubmit = event => { event.preventDefault(); dialog.close('accept'); };
    dialog.append(form);
    dialog.addEventListener('close', () => {
      const result = dialog.returnValue === 'accept';
      const value = input?.value;
      dialog.remove();
      resolve(kind === 'prompt' ? (result ? value : null) : result);
    }, {once:true});
    (document.fullscreenElement || document.body).append(dialog);
    dialog.showModal();
    (input || (kind === 'confirm' ? cancel : accept)).focus();
    input?.select();
  });
}
const nineBoxAlert = message => nineBoxDialog(message);
const nineBoxConfirm = message => nineBoxDialog(message, 'confirm');
const nineBoxPrompt = (message, value) => nineBoxDialog(message, 'prompt', value);

function selectExcelYears(years, currentYear, division = '') {
  return new Promise(resolve => {
    const dialog = document.createElement('dialog');
    dialog.className = 'nine-box-dialog excel-years-dialog';
    dialog.innerHTML = `<form method="dialog">
      <h2 id="excel-years-title">Export Excel</h2>
      <p>แต่ละปีจะแยกเป็นหนึ่งชีท พร้อมรูปแบบตารางเดิม</p>
      <label><input type="radio" name="scope" value="all" checked> ทุกปี</label>
      <label><input type="radio" name="scope" value="range"> เลือกช่วงปี</label>
      <fieldset disabled><legend>ช่วงปีงบประมาณ</legend>
        <label>ตั้งแต่ปี <select name="start" aria-label="ปีเริ่มต้น"></select></label>
        <label>ถึงปี <select name="end" aria-label="ปีสิ้นสุด"></select></label>
      </fieldset>
      <p class="excel-years-error" role="alert"></p>
      <div><button type="button">ยกเลิก</button><button type="submit">Export Excel</button></div>
    </form>`;
    dialog.setAttribute('aria-labelledby','excel-years-title');
    const form = dialog.querySelector('form');
    form.querySelector('p').textContent = `${division ? 'สายงาน: ' + division : 'ทุกสายงาน'} · แต่ละปีจะแยกเป็นหนึ่งชีท พร้อมรูปแบบตารางเดิม`;
    const start = form.elements.start, end = form.elements.end;
    for (const year of years) { start.add(new Option(year,year)); end.add(new Option(year,year)); }
    start.value = years.includes(currentYear) ? currentYear : years[0];
    end.value = years[years.length-1];
    form.onchange = () => {
      form.querySelector('fieldset').disabled = form.elements.scope.value === 'all';
      form.querySelector('[role="alert"]').textContent = '';
    };
    let selected = null;
    form.onsubmit = event => {
      event.preventDefault();
      if (form.elements.scope.value === 'range' && Number(start.value)>Number(end.value)) {
        form.querySelector('[role="alert"]').textContent = 'ปีเริ่มต้นต้องไม่มากกว่าปีสิ้นสุด';start.focus();return;
      }
      selected = form.elements.scope.value === 'all' ? years : years.filter(y=>Number(y)>=Number(start.value)&&Number(y)<=Number(end.value));
      dialog.close();
    };
    form.querySelector('button[type="button"]').onclick = () => dialog.close();
    dialog.addEventListener('close', () => {dialog.remove();resolve(selected);}, {once:true});
    (document.fullscreenElement || document.body).append(dialog);
    dialog.showModal();
  });
}
