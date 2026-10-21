window.ProjectForm = (() => {
  const textFields = ['shortName','nationalDevelopmentPlan','director','department','division','objectives','area','timeline','cabinetDate','statusNotes','studySource'];
  const dateFields = ['studyDate'];
  const numberFields = ['paybackYears','npv','firr','eirr'];
  const financialFields = ['loan','revenue','oh','idc','loanSpent','revenueSpent'];
  const approvedFields = ['approvedLoan','approvedRevenue'];
  const splitFields = ['domesticLoan','foreignLoan','approvedDomesticLoan','approvedForeignLoan'];
  const fundingSources = [['domestic','เงินกู้ในประเทศ','domesticLoan','approvedDomesticLoan'],['foreign','เงินกู้ต่างประเทศ','foreignLoan','approvedForeignLoan'],['revenue','เงินรายได้','revenue','approvedRevenue']];
  const cumulativeFundingSources = [['domestic','เงินกู้ในประเทศ','cumulativeDomesticSpent'],['foreign','เงินกู้ต่างประเทศ','cumulativeForeignSpent'],['revenue','เงินรายได้','cumulativeRevenueSpent']];
  const cumulativeFields = cumulativeFundingSources.map(([, , field])=>field);
  let investmentImportPending=false;
  let formGeneration=0;
  const thaiDateAttributes = 'type="text" inputmode="numeric" maxlength="10" placeholder="วว/ดด/พ.ศ. เช่น 22/08/2569"';
  function isoToThaiDate(value) {
    if (!value) return '';
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return value;
    const [,year,month,day] = match;
    return `${day}/${month}/${Number(year)+543}`;
  }
  function thaiDateToIso(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const match = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (!match) return null;
    const day=Number(match[1]), month=Number(match[2]), buddhistYear=Number(match[3]), year=buddhistYear-543;
    if (buddhistYear < 2400 || buddhistYear > 3000 || month < 1 || month > 12 || day < 1 || day > 31) return null;
    const check = new Date(year, month-1, day);
    if (check.getFullYear()!==year || check.getMonth()!==month-1 || check.getDate()!==day) return null;
    return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  }
  function moneyNumber(value) {
    const raw = String(value ?? '').replace(/,/g, '').trim();
    if (!raw) return 0;
    const number = Number(raw);
    return Number.isFinite(number) ? number : NaN;
  }

  function normalizeMoneyText(value) {
    let raw = String(value ?? '').replace(/,/g, '').replace(/[^\d.]/g, '');
    const firstDot = raw.indexOf('.');
    if (firstDot !== -1) {
      raw = raw.slice(0, firstDot + 1) + raw.slice(firstDot + 1).replace(/\./g, '');
    }
    let [integer = '', decimal] = raw.split('.');
    integer = integer.replace(/^0+(?=\d)/, '');
    if (!integer) integer = '0';
    integer = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    if (decimal !== undefined) return `${integer}.${decimal.slice(0, 2)}`;
    return integer;
  }

  function formatBaht(value) {
    const number = typeof value === 'number' ? value : moneyNumber(value);
    if (!Number.isFinite(number)) return '0';
    return number.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  }

  function formatMoneyWhileTyping(input) {
    const oldValue = input.value;
    const oldCursor = input.selectionStart ?? oldValue.length;
    const logicalCursor = oldValue.slice(0, oldCursor).replace(/,/g, '').length;
    const formatted = normalizeMoneyText(oldValue);
    input.value = formatted;

    let seen = 0;
    let newCursor = formatted.length;
    for (let i = 0; i < formatted.length; i += 1) {
      if (formatted[i] !== ',') seen += 1;
      if (seen >= logicalCursor) {
        newCursor = i + 1;
        break;
      }
    }
    try {
      input.setSelectionRange(newCursor, newCursor);
    } catch (_) {}
  }

  const field = (name,label,attributes='') => `<label>${label}<input name="${name}" ${attributes}></label>`;
  function fundingTable(approved=false) {
    const totalName=approved?'approvedTotal':'budget';
    const totalLabel=approved?'รวมงบประมาณที่ได้รับอนุมัติแล้ว':'รวมวงเงินโครงการ';
    const row=(name,label,readonly=false,source='')=>`<tr ${source?`data-funding-source="${source}" hidden`:''} ${readonly?'class="profile-funding-total"':''}><th scope="row"><label for="funding-${name}">${label}</label>${source&&!approved?`<button type="button" class="profile-remove-source secondary" data-remove-source="${source}" aria-label="ลบแหล่งเงิน ${label}">ลบ</button>`:''}</th><td><input id="funding-${name}" name="${name}" ${readonly?'readonly':'type="text" inputmode="decimal" class="money-input" autocomplete="off" required'} value="0"></td></tr>`;
    return `<table class="profile-funding-table" aria-label="${approved?'งบประมาณที่ได้รับอนุมัติแล้ว':'วงเงินการลงทุน'}"><tbody>${fundingSources.map(([key,label,name,approvedName])=>row(approved?approvedName:name,label,false,key)).join('')}${row(totalName,totalLabel,true)}</tbody></table>`;
  }
  function setup() {
    document.querySelector('#project-form-page').innerHTML = `<form id="project-form" novalidate><h2 id="form-title" class="sr-only" tabindex="-1">เพิ่มโครงการใหม่</h2>
      <input type="hidden" name="id"><div class="profile-tab-row"><div class="profile-tabs" role="tablist" aria-label="ข้อมูลโครงการ">${[['info','ข้อมูลโครงการ'],['budget','วงเงินลงทุน'],['investment','แผนการลงทุน'],['status','สถานะโครงการ'],['disbursement','แผนและผลการเบิกจ่าย']].map(([key,label],i)=>`<button type="button" id="profile-tab-${key}" role="tab" aria-controls="profile-section-${key}" aria-selected="${i===0}" data-profile-tab="${key}" class="${i===0?'active':''}">${i+1}. ${label}</button>`).join('')}</div><button type="button" class="secondary close-project-form">← กลับ</button></div>
      <div class="profile-body"><section id="profile-section-info" role="tabpanel" aria-labelledby="profile-tab-info">
        <h3>ชื่อโครงการ</h3>${field('name','ชื่อโครงการ *','required maxlength="180" placeholder="ระบุชื่อเต็มโครงการ"')}<div class="profile-grid profile-name-grid">${field('code','รหัสโครงการ','readonly placeholder="ออกให้อัตโนมัติเมื่อบันทึก"')}${field('shortName','ชื่อย่อ','maxlength="80" placeholder="เช่น คพส.9.3"')}${field('nationalDevelopmentPlan','แผนพัฒนาเศรษฐกิจและสังคมแห่งชาติ','maxlength="180" placeholder="เช่น ฉบับที่ 13"')}</div>
        <h3>ผู้รับผิดชอบ</h3><div class="profile-grid three">${field('director','ผู้อำนวยการโครงการ','maxlength="180"')}${field('department','หน่วยงานที่รับผิดชอบ','maxlength="180"')}${field('division','สายงาน','maxlength="180"')}</div>
        <h3>วัตถุประสงค์ / รายละเอียดงาน</h3><label><span class="sr-only">วัตถุประสงค์และขอบเขตงาน</span><textarea name="objectives" rows="3" maxlength="8000" placeholder="ระบุวัตถุประสงค์ ขอบเขต หรือรายละเอียดสำคัญของโครงการ"></textarea></label>
        <h3>พื้นที่ดำเนินการ</h3><label><span class="sr-only">พื้นที่ดำเนินการ</span><textarea name="area" rows="2" maxlength="4000" placeholder="ระบุพื้นที่ดำเนินการ"></textarea></label>
        <h3>ระยะเวลาดำเนินการ</h3><input type="hidden" name="timeline"><div class="profile-grid profile-timeline-grid">${field('timelineStartYear','ปีเริ่มต้น (พ.ศ.)','type="number" min="2400" max="3000" step="1" placeholder="เช่น 2570"')}${field('timelineEndYear','ปีสิ้นสุด (พ.ศ.)','type="number" min="2400" max="3000" step="1" placeholder="เช่น 2576"')}${field('timelineDuration','ระยะเวลา (ปี)','readonly placeholder="คำนวณอัตโนมัติ"')}</div><p class="profile-hint">นับรวมปีเริ่มต้นและปีสิ้นสุด</p><p id="timeline-legacy" class="profile-hint" hidden></p>
        <h3>ประมาณการผลตอบแทนโครงการ</h3><div class="profile-grid profile-return-grid">${field('paybackYears','ระยะเวลาคืนทุน (Payback Period) · ปี','type="number" min="0" step="any" placeholder="ยังไม่มีผลศึกษา"')}${field('npv','มูลค่าปัจจุบันสุทธิ (NPV) · ล้านบาท','type="number" step="any" placeholder="ยังไม่มีผลศึกษา"')}${field('firr','อัตราผลตอบแทนด้านการเงิน (FIRR) · %','type="number" step="any" placeholder="ยังไม่มีผลศึกษา"')}${field('eirr','อัตราผลตอบแทนด้านเศรษฐศาสตร์ (EIRR) · %','type="number" step="any" placeholder="ยังไม่มีผลศึกษา"')}<input type="hidden" name="studyDate"><input type="hidden" name="studySource"></div>
      </section>
      <section id="profile-section-budget" role="tabpanel" aria-labelledby="profile-tab-budget" hidden><div class="profile-budget-heading"><h3>วงเงินลงทุนทั้งสิ้นของโครงการ</h3><span>หน่วย: บาท</span></div><p id="profile-legacy-warning" class="profile-warning" hidden></p>
        <label class="profile-funding-picker">เพิ่มแหล่งเงิน<select id="profile-funding-source"><option value="">เลือกแหล่งเงิน</option>${fundingSources.map(([key,label])=>`<option value="${key}">${label}</option>`).join('')}</select></label><input type="hidden" name="fundingSources"><input type="hidden" name="loan"><input type="hidden" name="approvedLoan">
        <div class="profile-budget-layout"><section class="profile-budget-panel profile-budget-investment"><h4>วงเงินการลงทุน</h4>${fundingTable()}</section><section class="profile-budget-panel profile-budget-approved"><h4>งบประมาณที่ได้รับอนุมัติแล้ว</h4>${fundingTable(true)}</section>
        <div class="profile-budget-panel profile-budget-overhead" data-funding-source="revenue" hidden><h4>ที่ดิน ค่าใช้จ่ายทางอ้อมและดอกเบี้ยระหว่างก่อสร้าง</h4><table class="profile-funding-table" aria-label="ที่ดิน ค่าใช้จ่ายทางอ้อมและดอกเบี้ยระหว่างก่อสร้าง"><tbody>${[['land','ที่ดิน'],['oh','OH (ค่าใช้จ่ายทางอ้อม)'],['idc','IDC (ดอกเบี้ยระหว่างก่อสร้าง)'],['overheadInterestTotal','รวม']].map(([name,label],i)=>`<tr ${i===3?'class="profile-funding-total"':''}><th scope="row"><label for="funding-${name}">${label}</label></th><td><input id="funding-${name}" name="${name}" ${i===3?'readonly':'type="text" inputmode="decimal" class="money-input" autocomplete="off" required'} value="0"></td></tr>`).join('')}</tbody></table><p class="profile-hint">ที่ดิน + OH + IDC ต้องไม่เกินเงินรายได้ ทั้งสามยอดรวมอยู่ในเงินรายได้แล้ว จึงไม่บวกเพิ่มในวงเงินรวม</p></div>
        <section class="profile-budget-panel profile-budget-cumulative"><h4>ผลการเบิกจ่ายสะสม</h4><table class="profile-funding-table" aria-label="ผลการเบิกจ่ายสะสม"><tbody>${cumulativeFundingSources.map(([key,label,name])=>`<tr data-funding-source="${key}" hidden><th scope="row"><label for="profile-${name}">${label}</label></th><td><input id="profile-${name}" name="${name}" data-manual-cumulative-source type="text" inputmode="decimal" class="money-input" autocomplete="off" value="0"></td></tr>`).join('')}<tr class="profile-funding-total"><th scope="row"><label for="profile-cumulative-total">รวมผลการเบิกจ่ายสะสม</label></th><td><input id="profile-cumulative-total" data-cumulative-total readonly value="0"></td></tr></tbody></table><p class="profile-hint">กรอกยอดสะสมแยกตามแหล่งเงิน · หน่วย: บาท</p></section>
        </div>
      </section>
      <section id="profile-section-investment" role="tabpanel" aria-labelledby="profile-tab-investment" hidden><div class="investment-heading"><div><h3>แผนการลงทุนรายปี</h3><p>วงเงินและแผนรายปี แยกตามแหล่งเงิน</p></div><div class="profile-investment-toolbar"><span class="investment-readonly">แก้ไขตัวเลขได้</span><button type="button" id="investment-import" class="secondary">Import Excel</button><input id="investment-file" type="file" accept=".xlsx" hidden></div></div><div class="investment-table-bar"><p id="investment-status" role="status" aria-live="polite">เลือกไฟล์ Excel เพื่อแสดงตารางแผนการลงทุน</p><div class="investment-legend"><span class="investment-key-loan">เงินกู้</span><span class="investment-key-revenue">เงินรายได้</span></div></div><input type="hidden" name="investmentPlan"><div id="investment-table" class="profile-investment-scroll" tabindex="0" role="region" aria-label="ตารางแผนการลงทุน"></div><p class="investment-scroll-note">เลื่อนตารางด้านข้างเพื่อดูแผนทุกปี · บันทึกพร้อมข้อมูลโครงการ</p></section>
      <section id="profile-section-status" role="tabpanel" aria-labelledby="profile-tab-status" hidden><h3>ประเภทและสถานะโครงการ</h3><div class="profile-grid"><label>ประเภทโครงการ<select name="projectType"><option value="">ยังไม่ระบุ</option></select></label><label>สถานะล่าสุด<select name="statusId" required></select></label>${field('cabinetDate','มติ ครม.','type="text" maxlength="1000" placeholder="ระบุวันที่หรือรายละเอียดมติ ครม. ได้ตามต้องการ"')}${field('progress','ความคืบหน้า (%)','type="number" min="0" max="100" step="0.01" value="0" required')}</div><label>รายละเอียดสถานะล่าสุด / หมายเหตุเพิ่มเติม<textarea name="statusNotes" rows="5" maxlength="4000"></textarea></label></section>
      <section id="profile-section-disbursement" role="tabpanel" aria-labelledby="profile-tab-disbursement" hidden></section></div>
      <input type="hidden" name="loanSpent"><input type="hidden" name="revenueSpent">
      <p id="form-error" role="alert"></p><div class="modal-actions"><button type="button" id="project-delete" class="danger" hidden>ลบโครงการ</button><span class="profile-save-note" role="status" aria-live="polite">บันทึกข้อมูลทุกแท็บพร้อมกัน</span><button class="primary" type="submit">บันทึกโครงการ</button></div></form>`;
    const form=document.querySelector('#project-form');
    DisbursementPlan.setup(form);
    let importSequence=0;
    const fileInput=form.querySelector('#investment-file');
    form.querySelector('#investment-import').addEventListener('click',()=>fileInput.click());
    form.querySelector('#investment-table').addEventListener('input', event=>{
      const input=event.target.closest('[data-investment-row]');
      if(!input)return;
      const raw=input.value.replace(/,/g,'').trim();
      const value=raw===''?null:Number(raw);
      const valid=raw==='' || (/^-?\d+(?:\.\d*)?$/.test(raw) && Number.isFinite(value));
      input.setCustomValidity(valid?'':'กรุณากรอกตัวเลขให้ถูกต้อง');
      if(!valid)return;
      const plan=JSON.parse(form.elements.investmentPlan.value || 'null');
      if(!plan)return;
      plan.rows[Number(input.dataset.investmentRow)][Number(input.dataset.investmentColumn)]=value;
      recalculateInvestmentSums(plan);
      form.elements.investmentPlan.value=JSON.stringify(plan);
      form.querySelectorAll('[data-investment-sum]').forEach(cell=>{
        cell.value=formatBaht(plan.rows[Number(cell.dataset.investmentRow)][Number(cell.dataset.investmentColumn)]);
      });
      syncInvestmentFunding();updateTotals();updateSaveNote();
    });
    form.querySelector('#investment-table').addEventListener('focusout', event=>{
      const input=event.target.closest('[data-investment-row]');
      if(input && input.validity.valid && input.value.trim())input.value=formatBaht(moneyNumber(input.value));
    });
    const sheetDialog=document.createElement('dialog');
    sheetDialog.id='investment-sheet-dialog';sheetDialog.setAttribute('aria-labelledby','investment-sheet-title');
    sheetDialog.innerHTML='<h2 id="investment-sheet-title">เลือกชีตที่ต้องการนำเข้า</h2><label>ชีต<select id="investment-sheet"></select></label><p id="investment-sheet-error" role="alert"></p><div class="modal-actions"><button type="button" class="secondary" data-sheet-cancel>ยกเลิก</button><button type="button" class="primary" data-sheet-import>นำเข้า</button></div>';
    document.querySelector('#project-form-page').append(sheetDialog);
    const sheetPicker=sheetDialog.querySelector('#investment-sheet');
    const importButton=sheetDialog.querySelector('[data-sheet-import]');
    sheetDialog.querySelector('[data-sheet-cancel]').onclick=()=>sheetDialog.close();
    sheetDialog.addEventListener('cancel',event=>{if(investmentImportPending)event.preventDefault();});
    sheetDialog.addEventListener('close',()=>{fileInput.focus();if(selectedFileGeneration===formGeneration)renderInvestmentPlan();});
    let selectedFile=null, selectedFileGeneration=-1;
    async function importWorkbook(listOnly) {
      const file=listOnly?fileInput.files[0]:selectedFile;if(!file || (!listOnly && selectedFileGeneration!==formGeneration))return;
      if(listOnly){selectedFile=null;importButton.disabled=true;}
      const sequence=++importSequence, generation=formGeneration;
      const status=form.querySelector('#investment-status');
      investmentImportPending=true;fileInput.disabled=true;sheetPicker.disabled=true;importButton.disabled=true;status.textContent='กำลังอ่านไฟล์ Excel…';
      sheetDialog.querySelector('[data-sheet-cancel]').disabled=true;
      try {
        const body=new FormData();body.append('file',file);body.append('action',listOnly?'sheets':'import');
        if(!listOnly)body.append('sheet',sheetPicker.value);
        const response=await fetch('/api/investment-plan/preview',{method:'POST',body});
        const data=await response.json();if(!response.ok)throw Error(data.error || 'นำเข้า Excel ไม่สำเร็จ');
        if(sequence!==importSequence || formGeneration!==generation)return;
        if(listOnly) {
          selectedFile=file;selectedFileGeneration=generation;
          sheetPicker.innerHTML=data.sheets.map(sheet=>`<option value="${escapeHtml(sheet)}">${escapeHtml(sheet)}</option>`).join('');
          status.textContent='เลือกชีต แล้วกดนำเข้าชีตที่เลือก';
          sheetDialog.querySelector('#investment-sheet-error').textContent='';sheetDialog.showModal();sheetPicker.focus();
        } else {
          form.elements.investmentPlan.value=JSON.stringify(data.plan);renderInvestmentPlan();syncInvestmentFunding();updateTotals();updateSaveNote();
          sheetDialog.close();
        }
      } catch(error) {
        if(sequence===importSequence && generation===formGeneration) {
          status.textContent=error.message;
          if(sheetDialog.open)sheetDialog.querySelector('#investment-sheet-error').textContent=error.message;
        }
      } finally {
        investmentImportPending=false;fileInput.disabled=false;fileInput.value='';
        sheetPicker.disabled=!selectedFile || selectedFileGeneration!==formGeneration;
        importButton.disabled=sheetPicker.disabled;
        sheetDialog.querySelector('[data-sheet-cancel]').disabled=false;
      }
    }
    fileInput.addEventListener('change',()=>importWorkbook(true));
    importButton.addEventListener('click',()=>importWorkbook(false));
    const removalDialog=document.createElement('dialog');
    removalDialog.id='profile-remove-source-dialog';
    removalDialog.setAttribute('aria-labelledby','profile-remove-source-title');
    removalDialog.innerHTML='<h2 id="profile-remove-source-title">ลบแหล่งเงิน</h2><p id="profile-remove-source-message"></p><div class="modal-actions"><button type="button" class="secondary" data-source-cancel autofocus>ยกเลิก</button><button type="button" class="danger" data-source-confirm>ลบแหล่งเงิน</button></div>';
    document.querySelector('#project-form-page').append(removalDialog);
    let pendingSource='';
    function removeSource(source) {
      const [,,amountKey,approvedKey]=fundingSources.find(([key])=>key===source);
      const cumulativeKey=cumulativeFundingSources.find(([key])=>key===source)?.[2];
      for(const name of [amountKey,approvedKey,cumulativeKey,...(source==='revenue'?['land','oh','idc']:[])])if(name)form.elements[name].value='0';
      setFundingSources(form.elements.fundingSources.value.split(',').filter(key=>key!==source));
      updateTotals();updateSaveNote();form.querySelector('#profile-funding-source').focus();
    }
    removalDialog.querySelector('[data-source-cancel]').onclick=()=>removalDialog.close();
    removalDialog.querySelector('[data-source-confirm]').onclick=()=>{removalDialog.close();removeSource(pendingSource);};
    form.addEventListener('click',event=>{
      const button=event.target.closest('[data-remove-source]');if(!button)return;
      const source=button.dataset.removeSource;
      const [,label,amountKey,approvedKey]=fundingSources.find(([key])=>key===source);
      const value=name=>moneyNumber(form.elements[name].value);
      const cumulativeKey=cumulativeFundingSources.find(([key])=>key===source)?.[2];
      document.querySelector('#form-error').textContent='';
      if(source==='revenue'?value('revenueSpent')>0:value('loanSpent')>(source==='domestic'?value('foreignLoan'):value('domesticLoan'))) {
        document.querySelector('#form-error').textContent='ลบแหล่งเงินนี้ไม่ได้ เนื่องจากมีการเบิกจ่ายเกินวงเงินที่จะเหลือ';return;
      }
      if(value(amountKey)>0 || value(approvedKey)>0 || (cumulativeKey && value(cumulativeKey)>0) || (source==='revenue' && value('land')+value('oh')+value('idc')>0)) {
        pendingSource=source;
        removalDialog.querySelector('#profile-remove-source-message').textContent=`ลบ ${label} และล้างวงเงินกับงบอนุมัติของแหล่งนี้${source==='revenue'?' รวมถึงที่ดิน OH และ IDC':''}? ต้องบันทึกโครงการเพื่อยืนยันการเปลี่ยนแปลง`;
        removalDialog.showModal();
      } else removeSource(source);
    });
    form.addEventListener('click',event=>{const b=event.target.closest('[data-profile-tab]');if(b)showTab(b.dataset.profileTab);});
    form.addEventListener('input',event=>{
      if(event.target.classList?.contains('money-input')) formatMoneyWhileTyping(event.target);
      if(event.target.hasAttribute('data-manual-cumulative-source')) updateCumulativeTotal();
      if(['timelineStartYear','timelineEndYear'].includes(event.target.name)) {updateTimeline(true);DisbursementPlan.syncTimeline();}
      updateTotals();
      updateSaveNote();
    });
    form.addEventListener('change',event=>{
      if(event.target.id==='profile-funding-source' && event.target.value) {
        const source=event.target.value;
        setFundingSources([...form.elements.fundingSources.value.split(',').filter(Boolean),source]);
        form.elements[fundingSources.find(([key])=>key===source)[2]].focus();
      }
      updateSaveNote();
    });
    form.addEventListener('blur',event=>{
      if(!event.target.classList?.contains('money-input')) return;
      const number=moneyNumber(event.target.value);
      event.target.value=formatBaht(Number.isFinite(number)?number:0);
      updateTotals();
    },true);
    form.addEventListener('keydown',event=>{
      const button=event.target.closest('[data-profile-tab]');
      if(!button || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      const buttons=[...form.querySelectorAll('[data-profile-tab]')],i=buttons.indexOf(button);
      const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(i+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;
      event.preventDefault();showTab(buttons[next].dataset.profileTab);buttons[next].focus();
    });
  }
  let savedState = '';
  function recalculateInvestmentSums(plan) {
    if(!plan)return;
    const compactColumns=plan.columns.map(label=>String(label).replace(/\s+/g,''));
    const fullColumn=compactColumns.indexOf('วงเงินเต็มโครงการ');
    const totalColumn=compactColumns.indexOf('รวม');
    const balanceColumn=compactColumns.findIndex(label=>label.startsWith('คงเหลือ'));
    const yearColumns=compactColumns.flatMap((label,index)=>
      index>fullColumn && index<totalColumn && /^(?:ปี(?:พ\.?ศ\.?)?)?\d{4}/.test(label)?[index]:[]);
    const isSection=label=>/^(?:\d+\.\s*)?เงิน(?:กู้|รายได้)/.test(label);
    if(fullColumn>=0 && totalColumn>=0 && yearColumns.length) {
      plan.rows.forEach(row=>{
        const label=String(row[0] || '').trim();
        if(isSection(label) || /^รวม/.test(label))return;
        row[totalColumn]=yearColumns.reduce((sum,index)=>sum+
          (typeof row[index]==='number' && Number.isFinite(row[index])?Math.round(row[index]*100):0),0)/100;
      });
    }
    const sumColumn=(start,end,column)=>{
      const included=[];
      let total=0;
      for(let i=start;i<end;i++) {
        const row=plan.rows[i], label=String(row[0] || '').trim();
        if(/^รวม/.test(label) || isSection(label))continue;
        // Detail lines already belong to their numbered heading's amount.
        if(/^[-–—−]/.test(label))continue;
        const path=label.match(/^(\d+(?:\.\d+)+)(?=\s|[^\d.]|$)/)?.[1];
        if(!path)continue;
        const amount=row[column];
        if(included.some(parent=>path===parent || path.startsWith(parent+'.')))continue;
        if(typeof amount==='number' && Number.isFinite(amount)) {
          total+=Math.round(amount*100);
          included.push(path);
        }
      }
      return total/100;
    };
    let start=0;
    plan.rows.forEach((row,index)=>{
      const label=String(row[0] || '').trim();
      if(isSection(label))start=index+1;
      if(!/^รวม/.test(label))return;
      const from=/^รวม(?:ทั้งสิ้น|ทั้งหมด)/.test(label)?0:start;
      for(let column=1;column<plan.columns.length;column++)row[column]=sumColumn(from,index,column);
    });
    if(fullColumn>=0 && totalColumn>=0 && balanceColumn>=0) {
      plan.rows.forEach(row=>{
        if(isSection(String(row[0] || '').trim()))return;
        const full=typeof row[fullColumn]==='number'?row[fullColumn]:0;
        const total=typeof row[totalColumn]==='number'?row[totalColumn]:0;
        row[balanceColumn]=(Math.round(full*100)-Math.round(total*100))/100;
      });
    }
  }
  function renderInvestmentPlan() {
    const form=document.querySelector('#project-form');
    const plan=JSON.parse(form.elements.investmentPlan.value || 'null');
    recalculateInvestmentSums(plan);
    if(plan)form.elements.investmentPlan.value=JSON.stringify(plan);
    const container=form.querySelector('#investment-table');
    let group='';
    const rows=plan?.rows.map((row,rowIndex)=>{
      const label=String(row[0] || '').trim();
      const section=/^\d+\.\s*เงิน(?:กู้|รายได้)/.test(label);
      if(section)group=label.includes('เงินกู้')?'loan':'revenue';
      const total=/^รวม/.test(label);
      const grand=/^รวม(?:ทั้งสิ้น|ทั้งหมด)/.test(label);
      const rowClass=grand?'investment-grand-total':section?'investment-section':total?'investment-subtotal':'';
      return `<tr class="${rowClass}" data-investment-group="${group}">${row.map((cell,i)=>{
        if(i===0)return `<th scope="row">${escapeHtml(cell || '')}</th>`;
        if(section || (cell!==null && typeof cell!=='number'))return `<td>${escapeHtml(cell ?? '—')}</td>`;
        const calculated=total || ((String(plan.columns[i]).trim()==='รวม' || String(plan.columns[i]).trim().startsWith('คงเหลือ')) && plan.columns.some(column=>String(column).replace(/\s+/g,'')==='วงเงินเต็มโครงการ'));
        return `<td><input type="text" inputmode="decimal" class="investment-cell-input" ${calculated?'readonly data-investment-sum title="คำนวณผลรวมอัตโนมัติ"':''} data-investment-row="${rowIndex}" data-investment-column="${i}" aria-label="${escapeHtml(label+' '+plan.columns[i])}" value="${cell===null?'':escapeHtml(formatBaht(cell))}" placeholder="—" autocomplete="off"></td>`;
      }).join('')}</tr>`;
    }).join('');
    container.classList.toggle('is-empty',!plan);
    container.innerHTML=plan?`<table class="profile-investment-table"><thead><tr>${plan.columns.map(c=>`<th scope="col">${escapeHtml(c)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`:'<div class="investment-empty"><strong>ยังไม่มีแผนการลงทุน</strong><p>เลือกไฟล์ Excel ด้านบนเพื่อนำเข้ารายการและแผนรายปี</p></div>';
    form.querySelector('#investment-status').textContent=plan?`${plan.sheet} · ${plan.rows.length} รายการ · หน่วยตามไฟล์ Excel`:'ยังไม่ได้เลือกไฟล์';
  }
  function syncInvestmentFunding() {
    const form=document.querySelector('#project-form');
    const plan=JSON.parse(form.elements.investmentPlan.value || 'null');
    const column=plan?.columns.findIndex(label=>String(label).replace(/\s+/g,'')==='วงเงินเต็มโครงการ') ?? -1;
    const fields=['domesticLoan','foreignLoan','revenue','land','oh','idc'];
    fields.forEach(key=>{
      form.elements[key].readOnly=column>=0;
      form.elements[key].title=column>=0?'ดึงจากคอลัมน์วงเงินเต็มโครงการ ใน Tab แผนการลงทุน':'';
    });
    form.querySelectorAll('[data-remove-source]').forEach(button=>{
      button.disabled=column>=0;
      button.title=column>=0?'แหล่งเงินเชื่อมจาก Tab แผนการลงทุน':'';
    });
    if(column<0)return;
    const values=Object.fromEntries(fields.map(key=>[key,0]));
    const totals=new Map(), sections=new Map();
    let group=null;
    const sourceFor=label=>label.includes('เงินกู้ต่างประเทศ')?'foreignLoan':label.includes('เงินกู้')?'domesticLoan':label.includes('เงินรายได้')?'revenue':null;
    for(const row of plan.rows) {
      const label=String(row[0] || '').trim();
      const compact=label.replace(/\s+/g,'');
      const amount=typeof row[column]==='number'?row[column]:moneyNumber(String(row[column] ?? '').replace(/^\((.*)\)$/, '-$1'));
      const valid=row[column]!==null && row[column]!=='' && Number.isFinite(amount);
      if(/^(?:\d+\.\s*)?เงิน(?:กู้|รายได้)/.test(label)) {
        group=sourceFor(label);
        if(group && valid)sections.set(group,amount);
      } else if(/^รวม/.test(compact)) {
        if(!/^รวม(?:ทั้งสิ้น|ทั้งหมด)/.test(compact)) {
          const source=sourceFor(label) || group;
          if(source && valid)totals.set(source,amount);
        }
      }
      if(valid && !/^รวม/.test(compact)) {
        if(label.includes('ที่ดิน'))values.land+=amount;
        else if(/ค่าใช้จ่ายทางอ้อม|คชจ\.?ทางอ้อม|\bOH\b/i.test(compact))values.oh+=amount;
        else if(/ดอกเบี้ยระหว่างก่อสร้าง|\bIDC\b/i.test(compact))values.idc+=amount;
      }
    }
    for(const key of ['domesticLoan','foreignLoan','revenue'])values[key]=totals.get(key) ?? sections.get(key) ?? 0;
    fields.forEach(key=>form.elements[key].value=formatBaht(values[key]));
    const selected=form.elements.fundingSources.value.split(',').filter(Boolean);
    fundingSources.forEach(([key,,field])=>{if(values[field]>0)selected.push(key);});
    setFundingSources(selected);
  }
  function setFundingSources(selected) {
    const form=document.querySelector('#project-form');
    form.elements.fundingSources.value=[...new Set(selected)].join(',');
    form.querySelectorAll('[data-funding-source]').forEach(element=>element.hidden=!selected.includes(element.dataset.fundingSource));
    const picker=form.querySelector('#profile-funding-source');
    [...picker.options].forEach(option=>option.disabled=selected.includes(option.value));
    picker.value='';picker.disabled=fundingSources.every(([key])=>selected.includes(key));
    if(form.elements.monthlyDisbursement.value)DisbursementPlan.syncSources();
  }
  function formState() {
    return JSON.stringify([...new FormData(document.querySelector('#project-form')).entries()].filter(([name])=>!name.startsWith('monthly-')));
  }
  function isDirty() { return !!savedState && (formState() !== savedState || !!document.querySelector('[data-disbursement-month]:invalid')); }
  function updateSaveNote() {
    const note=document.querySelector('.profile-save-note');
    const dirty=isDirty();
    note.textContent=dirty?'ยังไม่ได้บันทึก':'บันทึกข้อมูลทุกแท็บพร้อมกัน';
    note.classList.toggle('is-dirty',dirty);
  }
  function discardChanges() { savedState=formState();updateSaveNote(); }
  function markSaved(project) {
    const form=document.querySelector('#project-form');
    form.elements.id.value=project.id;
    form.elements.code.value=project.code;
    form.dataset.version=project.version;
    form.dataset.routeId=project.id;
    const remove=document.querySelector('#project-delete');
    remove.hidden=false;remove.dataset.delete=project.id;
    document.querySelector('#form-title').textContent='รายละเอียด / แก้ไขโครงการ';
    discardChanges();
  }
  function showTab(tab) {
    document.querySelectorAll('[data-profile-tab]').forEach(button=>{const active=button.dataset.profileTab===tab;button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;});
    document.querySelectorAll('[id^="profile-section-"]').forEach(section=>section.hidden=section.id!=='profile-section-'+tab);
  }
  function updateTimeline(write = false) {
    const form=document.querySelector('#project-form');
    const start=form.elements.timelineStartYear.value, end=form.elements.timelineEndYear.value;
    const valid=start && end && Number.isInteger(Number(start)) && Number.isInteger(Number(end)) && Number(start)>=2400 && Number(end)<=3000 && Number(end)>=Number(start);
    form.elements.timelineDuration.value=valid ? (Number(end)-Number(start)+1)+' ปี' : '';
    form.elements.timelineEndYear.setCustomValidity(start && end && Number(end)<Number(start) ? 'ปีสิ้นสุดต้องไม่น้อยกว่าปีเริ่มต้น' : '');
    if(write) form.elements.timeline.value=valid ? start+'–'+end+' ('+(Number(end)-Number(start)+1)+' ปี)' : '';
  }
  function updateTotals() {
    const form=document.querySelector('#project-form');
    const value=name=>{
      const number=moneyNumber(form.elements[name].value);
      return Number.isFinite(number)?number:0;
    };
    form.elements.loan.value=formatBaht(value('domesticLoan')+value('foreignLoan'));
    form.elements.approvedLoan.value=formatBaht(value('approvedDomesticLoan')+value('approvedForeignLoan'));
    form.elements.budget.value=formatBaht(value('loan')+value('revenue'));
    form.elements.approvedTotal.value=formatBaht(value('approvedLoan')+value('approvedRevenue'));
    form.elements.overheadInterestTotal.value=formatBaht(value('land')+value('oh')+value('idc'));
    updateCumulativeTotal();
    DisbursementPlan.updateSums();
  }
  function updateCumulativeTotal() {
    const form=document.querySelector('#project-form');
    if(!form)return;
    const total=cumulativeFields.reduce((sum,key)=>{
      const amount=moneyNumber(form.elements[key]?.value);
      return sum+(Number.isFinite(amount)?amount:0);
    },0);
    const output=form.querySelector('[data-cumulative-total]');
    if(output)output.value=formatBaht(total);
  }
  function open(project) {
    formGeneration++;
    const form=document.querySelector('#project-form');form.reset();form.elements.id.value=project?.id || '';form.dataset.version=project?.version || '';
    form.elements.investmentPlan.value=JSON.stringify(project?.details?.investmentPlan || null);
    renderInvestmentPlan();
    document.querySelector('#form-error').textContent='';document.querySelector('#form-title').textContent=project?'รายละเอียด / แก้ไขโครงการ':'เพิ่มโครงการใหม่';
    const remove=document.querySelector('#project-delete');
    remove.hidden=!project;remove.disabled=false;
    if(project)remove.dataset.delete=project.id;else delete remove.dataset.delete;
    form.elements.code.value=project?.code || '';
    form.elements.statusId.innerHTML=masterOptions('statuses',project?.statusId);
    form.elements.projectType.innerHTML='<option value="">ยังไม่ระบุ</option>'+masterOptions('project-types',project?.details?.projectType);
    for(const key of ['name','progress','statusId'])if(project)form.elements[key].value=project[key];
    for(const key of [...textFields,...numberFields,'projectType'])form.elements[key].value=project?.details?.[key] ?? '';
    for(const key of cumulativeFields)form.elements[key].value=formatBaht(project?.details?.[key] ?? 0);
    form.elements.timeline.value=project?.details?.timeline ?? [project?.details?.startDate,project?.details?.endDate].filter(Boolean).map(isoToThaiDate).join(' – ');
    const oldTimeline=form.elements.timeline.value;
    const yearRange=oldTimeline.match(/^(?:ปี\s*)?(\d{4})\s*[-–—]\s*(\d{4})(?:\s*\(\d+\s*ปี\))?$/);
    const fromDate=key=>project?.details?.[key] ? Number(project.details[key].slice(0,4))+543 : '';
    form.elements.timelineStartYear.value=yearRange ? yearRange[1] : fromDate('startDate');
    form.elements.timelineEndYear.value=yearRange ? yearRange[2] : fromDate('endDate');
    const legacyTimeline=document.querySelector('#timeline-legacy');
    legacyTimeline.hidden=!oldTimeline || !!yearRange;
    legacyTimeline.textContent=oldTimeline ? 'ข้อมูลเดิม: '+oldTimeline : '';
    updateTimeline();
    form.elements.cabinetDate.value=isoToThaiDate(project?.details?.cabinetDate);
    for(const key of dateFields)form.elements[key].value=isoToThaiDate(project?.details?.[key]);
    for(const key of financialFields){const baht=Number(project?.finances?.[key] ?? 0)*1_000_000;form.elements[key].value=formatBaht(baht);}
    for(const key of [...approvedFields,'land']){form.elements[key].value=formatBaht(Number(project?.details?.[key] ?? 0)*1_000_000);}
    updateCumulativeTotal();
    for(const [total,domestic,foreign] of [['loan','domesticLoan','foreignLoan'],['approvedLoan','approvedDomesticLoan','approvedForeignLoan']]) {
      const foreignAmount=Number(project?.details?.[foreign] || 0)*1_000_000;
      form.elements[foreign].value=formatBaht(foreignAmount);
      form.elements[domestic].value=formatBaht(Math.max(0,moneyNumber(form.elements[total].value)-foreignAmount));
    }
    const selected=(project?.details?.fundingSources || '').split(',').filter(Boolean);
    fundingSources.forEach(([key,,amountKey,approvedKey])=>{if(moneyNumber(form.elements[amountKey].value)>0 || moneyNumber(form.elements[approvedKey].value)>0)selected.push(key);});
    setFundingSources(selected);
    const legacy=project?.finances?.unallocated || 0;
    const warning=document.querySelector('#profile-legacy-warning');warning.hidden=!legacy;
    warning.textContent=`ข้อมูลเดิมมีวงเงินที่ยังไม่จัดแหล่งเงิน ${formatBaht(legacy*1_000_000)} บาท และเบิกจ่าย ${formatBaht(Number(project?.finances?.unallocatedSpent || 0)*1_000_000)} บาท กรุณาจัดเป็นเงินกู้/เงินรายได้ก่อนบันทึก`;
    DisbursementPlan.open(project);
    syncInvestmentFunding();
    showTab(legacy?'budget':'info');updateTotals();discardChanges();document.querySelector('#form-title').focus();
  }
  function validate(form) {
    document.querySelector('#form-error').textContent='';
    const invalidInvestment=form.querySelector('[data-investment-row]:invalid');
    if(invalidInvestment) {
      showTab('investment');invalidInvestment.focus();invalidInvestment.reportValidity();return false;
    }
    if(investmentImportPending) {
      showTab('investment');document.querySelector('#form-error').textContent='กรุณารอให้นำเข้า Excel เสร็จก่อนบันทึก';return false;
    }
    updateTimeline();
    const startYear=form.elements.timelineStartYear.value, endYear=form.elements.timelineEndYear.value;
    if(Boolean(startYear)!==Boolean(endYear)) {
      showTab('info');document.querySelector('#form-error').textContent='กรุณากรอกปีเริ่มต้นและปีสิ้นสุดให้ครบ';
      form.elements[startYear?'timelineEndYear':'timelineStartYear'].focus();return false;
    }
    if(!form.checkValidity()) {
      const invalid=form.querySelector(':invalid');const section=invalid?.closest('[role="tabpanel"]');
      if(section)showTab(section.id.replace('profile-section-',''));
      form.reportValidity();return false;
    }
    for(const key of dateFields) {
      const raw=form.elements[key].value.trim();
      if(raw && !thaiDateToIso(raw)) {
        const label=form.elements[key].closest('label')?.textContent.trim() || 'วันที่';
        const section=form.elements[key].closest('[role="tabpanel"]');
        if(section)showTab(section.id.replace('profile-section-',''));
        document.querySelector('#form-error').textContent=`${label}: กรุณากรอกวันที่รูปแบบ วว/ดด/พ.ศ. เช่น 22/08/2569`;
        form.elements[key].focus();
        return false;
      }
    }
    for(const key of [...financialFields,...approvedFields,'land',...splitFields,...cumulativeFields]) {
      const amount=moneyNumber(form.elements[key].value);
      if(!Number.isFinite(amount) || amount < 0) {
        showTab('budget');
        document.querySelector('#form-error').textContent=`${form.elements[key].closest('label')?.textContent.trim() || key}: จำนวนเงินไม่ถูกต้อง`;
        form.elements[['loanSpent','revenueSpent'].includes(key)?(key==='loanSpent'?'loan':'revenue'):key].focus();
        return false;
      }
      if(Math.round(amount*100) !== amount*100) {
        showTab('budget');
        document.querySelector('#form-error').textContent=`${form.elements[key].closest('label')?.textContent.trim() || key}: กรอกทศนิยมได้ไม่เกิน 2 ตำแหน่ง`;
        form.elements[['loanSpent','revenueSpent'].includes(key)?(key==='loanSpent'?'loan':'revenue'):key].focus();
        return false;
      }
    }
    const amount=key=>moneyNumber(form.elements[key].value);
    if(amount('land')+amount('oh')+amount('idc') > amount('revenue')) {
      showTab('budget');
      document.querySelector('#form-error').textContent='ที่ดิน + OH + IDC ต้องไม่เกินเงินรายได้';
      form.elements.oh.focus();
      return false;
    }
    if(amount('loanSpent') > amount('loan')) {
      showTab('budget');
      document.querySelector('#form-error').textContent='ยอดเบิกจ่ายจากเงินกู้ต้องไม่เกินวงเงินเงินกู้';
      form.elements.domesticLoan.focus();
      return false;
    }
    if(amount('revenueSpent') > amount('revenue')) {
      showTab('budget');
      document.querySelector('#form-error').textContent='ยอดเบิกจ่ายจากเงินรายได้ต้องไม่เกินวงเงินเงินรายได้';
      form.elements.revenue.focus();
      return false;
    }
    return true;
  }
  function payload(form) {
    const value=key=>form.elements[key].value;
    const details=Object.fromEntries([...textFields,...numberFields,...cumulativeFields,'projectType','fundingSources'].map(key=>[key,value(key)]));
    for(const key of cumulativeFields) {
      const raw=value(key).trim();
      details[key]=raw===''?null:moneyNumber(raw);
    }
    details.investmentPlan=JSON.parse(value('investmentPlan') || 'null');
    details.monthlyDisbursement=JSON.parse(value('monthlyDisbursement') || 'null');
    for(const key of ['foreignLoan','approvedForeignLoan'])details[key]=moneyNumber(value(key))/1_000_000;
    for(const key of [...approvedFields,'land'])details[key]=moneyNumber(value(key))/1_000_000;
    for(const key of dateFields)details[key]=thaiDateToIso(value(key)) || '';
    const finances=Object.fromEntries(financialFields.map(key=>[key,moneyNumber(value(key))/1_000_000]));
    return {name:value('name'),progress:Number(value('progress')),statusId:value('statusId'),finances,details};
  }
  function snapshot(p) {
    const d=p.details || {},f=p.finances;
    const text=value=>value===null || value===undefined || value===''?'—':value;
    const projectType=masterName('project-types',d.projectType);
    const pairs=[['ชื่อย่อ',d.shortName],['แผนพัฒนาเศรษฐกิจและสังคมแห่งชาติ',d.nationalDevelopmentPlan],['ผู้อำนวยการโครงการ',d.director],['หน่วยงานที่รับผิดชอบ',d.department],['สายงาน',d.division],['วัตถุประสงค์ / รายละเอียดงาน',d.objectives],['พื้นที่ดำเนินการ',d.area],['ระยะเวลาดำเนินการ',d.timeline ?? [d.startDate,d.endDate].filter(Boolean).map(isoToThaiDate).join(' – ')],['ประเภทโครงการ',projectType],['มติ ครม.',isoToThaiDate(d.cabinetDate)],['รายละเอียดสถานะ',d.statusNotes],['Payback Period (ปี)',d.paybackYears],['NPV (ล้านบาท)',d.npv],['FIRR (%)',d.firr],['EIRR (%)',d.eirr],['วันที่ผลศึกษา',d.studyDate?date(d.studyDate):null],['ที่มาผลศึกษา',d.studySource]];
    if(f)pairs.splice(5,0,...[['เงินกู้ในประเทศ',f.loan-(d.foreignLoan || 0)],['เงินกู้ต่างประเทศ',d.foreignLoan || 0],['เงินรายได้ (รวมที่ดิน/OH/IDC)',f.revenue],['ที่ดิน (ภายในเงินรายได้)',d.land || 0],['OH (ภายในเงินรายได้)',f.oh],['IDC (ภายในเงินรายได้)',f.idc]].map(([k,v])=>[k,format(v)+' ล้านบาท']));
    return `<div class="profile-snapshot">${pairs.map(([label,value])=>`<div><small>${escapeHtml(label)}</small><p>${escapeHtml(text(value))}</p></div>`).join('')}</div>`;
  }
  return {setup,open,payload,validate,snapshot,isDirty,discardChanges,markSaved};
})();
