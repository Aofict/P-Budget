/* Read the nine-column workbook without changing the original file. */
function parseNineBoxExcel(workbook, masters = []) {
  const sheets = [], warnings = [];
  const sources = ['เงินกู้ในประเทศ', 'เงินรายได้ กฟภ.', 'ที่ดิน', 'OH', 'IDC'];
  function value(cell) {
    const v = cell.value;
    if (v && typeof v === 'object') {
      if (v.error) throw new Error(`${cell.address}: ${v.error}`);
      if ('formula' in v || 'sharedFormula' in v) return v.result ?? 0;
      if (v.richText) return v.richText.map(t => t.text).join('');
      return v.text || '';
    }
    return v ?? '';
  }
  function money(cell) {
    let v = String(value(cell)).trim().replace(/,/g, '').replace(/−/g, '-');
    if (!v || /^[-–—]$/.test(v)) return 0;
    v = v.replace(/^\((.*)\)$/, '-$1');
    const n = Number(v);
    if (!Number.isFinite(n)) throw new Error(`${cell.address}: จำนวนเงินไม่ถูกต้อง`);
    return Math.round(n * 1000) / 1000;
  }
  for (const sheet of workbook.worksheets) {
    const match = sheet.name.match(/^ปี\s*(\d{2,4})/);
    if (!match) continue;
    const year = String(Number(match[1]) + (match[1].length === 2 ? 2500 : 0));
    if (Number(year) < 2500 || Number(year) > 2700) continue;
    const projects = [], errors = [], seen = new Set();
    let project = null, seenSources = new Set();
    try {
      if (!String(value(sheet.getCell('F3'))).includes('วงเงิน')) throw new Error('รูปแบบหัวตารางไม่ตรงกับไฟล์ 9 ช่อง');
      for (let r = 6; r <= sheet.rowCount; r++) {
        const code = String(value(sheet.getCell(r, 1))).trim();
        const label = String(value(sheet.getCell(r, 5))).trim();
        if (/^PRJ-/i.test(code)) {
          if (seen.has(code)) throw new Error(`แถว ${r}: รหัสโครงการซ้ำ ${code}`);
          seen.add(code);
          const master = masters.find(p => p.code === code);
          project = {id: master ? `ninebox_${master.id}` : `excel_${code}`, masterCode: code,
            code: String(value(sheet.getCell(r, 3))).trim(), name: label,
            sortOrder: projects.length + 1, items: sources.map(source => ({source,bComm:0,bInv:0,tComm:0,tInv:0,bCommManual:true}))};
          if (master) project.masterProjectId = String(master.id);
          else warnings.push(`${sheet.name}: ${code} ไม่พบในฐานข้อมูลหลัก นำเข้าเป็นรายการ 9 ช่องเท่านั้น`);
          if (!label) throw new Error(`แถว ${r}: ไม่มีชื่อโครงการ`);
          projects.push(project); seenSources = new Set();
          continue;
        }
        if (!project) continue;
        const clean = label.replace(/^[\s-]+/, '');
        const source = /เงินกู้/.test(clean) ? sources[0] : /เงินรายได้/.test(clean) ? sources[1]
          : /ที่ดิน/.test(clean) ? sources[2] : /^OH\b/i.test(clean) ? 'OH' : /^IDC\b/i.test(clean) ? 'IDC' : null;
        if (source) {
          if (seenSources.has(source)) throw new Error(`แถว ${r}: แหล่งเงินซ้ำ ${source}`);
          seenSources.add(source);
          const item = project.items.find(i => i.source === source);
          ['bComm','bInv','tComm','tInv'].forEach((key,i) => item[key] = money(sheet.getCell(r,[6,7,9,10][i])));
        } else if (clean === 'รวม') {
          if (!seenSources.size) throw new Error(`แถว ${r}: ไม่พบแหล่งเงินของโครงการ`);
          for (const [key,col] of [['bComm',6],['bInv',7],['tComm',9],['tInv',10]]) {
            const sum = project.items.slice(0,2).reduce((n,item) => n+item[key],0);
            if (Math.abs(sum-money(sheet.getCell(r,col))) > 0.002) warnings.push(`${sheet.name} แถว ${r}: ยอดรวม ${key} ใน Excel ${money(sheet.getCell(r,col))} ต่างจากเงินกู้ + เงินรายได้ ${sum.toFixed(3)} — ระบบใช้ผลรวมรายแหล่งเงิน`);
          }
          project = null;
        }
      }
      if (!projects.length) throw new Error('ไม่พบโครงการที่มีรหัส PRJ-');
    } catch (e) { errors.push(e.message); }
    sheets.push({name:sheet.name,year,projects,errors});
  }
  return {sheets,warnings};
}

async function openExcelImport() {
  if (!planReady || importInProgress) return;
  const input = document.createElement('input'); input.type='file'; input.accept='.xlsx';
  input.onchange=async()=>{
    const file=input.files[0]; if(!file)return;
    try {
      if(file.size>20*1024*1024)throw new Error('ไฟล์ต้องไม่เกิน 20 MB');
      const workbook=new ExcelJS.Workbook(); await workbook.xlsx.load(await file.arrayBuffer());
      const parsed=parseNineBoxExcel(workbook,masterProjects);
      if(!parsed.sheets.length)throw new Error('ไม่พบชีตปีงบประมาณ');
      const dialog=document.createElement('dialog');
      dialog.style.cssText='width:min(850px,90vw);max-height:85vh;overflow:auto;border:1px solid #bccddd;border-radius:14px;padding:24px';
      const title=document.createElement('h2');title.textContent='Import Excel — เลือกปี';dialog.append(title);
      const note=document.createElement('p');note.textContent='แทนที่ข้อมูลเฉพาะปีที่เลือก ปีอื่นคงเดิม • ใช้ค่าที่บันทึกใน Excel กรุณาคำนวณสูตรและบันทึกไฟล์ก่อนนำเข้า • ที่ดิน/OH/IDC ไม่บวกซ้ำในยอดรวม';dialog.append(note);
      const choices=[];
      for(const sheet of parsed.sheets){
        const label=document.createElement('label');label.style.cssText='display:block;padding:8px;border-bottom:1px solid #ddd';
        const check=document.createElement('input');check.type='checkbox';check.disabled=!!sheet.errors.length;check.checked=!check.disabled&&!sheet.name.includes('จ่ายจริง');
        const total=sheet.projects.reduce((n,p)=>n+p.items.slice(0,2).reduce((s,i)=>s+i.bComm+i.bInv,0),0);
        label.append(check,document.createTextNode(` ${sheet.name} → ${sheet.year} | ${sheet.projects.length} โครงการ | วงเงิน ${total.toLocaleString('en-US',{minimumFractionDigits:3,maximumFractionDigits:3})}${sheet.errors.length?' | '+sheet.errors.join('; '):''}`));
        dialog.append(label);choices.push({sheet,check});
      }
      if(parsed.warnings.length){const details=document.createElement('details'),summary=document.createElement('summary'),pre=document.createElement('pre');details.open=true;summary.textContent=`ข้อสังเกตก่อนนำเข้า (${parsed.warnings.length})`;pre.textContent=parsed.warnings.join('\n');pre.style.cssText='white-space:pre-wrap;max-height:180px;overflow:auto';details.append(summary,pre);dialog.append(details);}
      const cancel=document.createElement('button');cancel.textContent='ยกเลิก';cancel.onclick=()=>dialog.close();
      const submit=document.createElement('button');submit.textContent='ตรวจสอบและนำเข้า';
      submit.onclick=async()=>{
        const selected=choices.filter(c=>c.check.checked&&!c.check.disabled);
        if(!selected.length)return nineBoxAlert('เลือกอย่างน้อยหนึ่งปี');
        if(new Set(selected.map(c=>c.sheet.year)).size!==selected.length)return nineBoxAlert('เลือกชีตซ้ำปี กรุณาเลือกเพียงชีตเดียวต่อปี');
        const merged=JSON.parse(JSON.stringify(snapshotPlan().yearsData));
        selected.forEach(({sheet})=>merged[sheet.year]=sheet.projects);
        dialog.close();await importPlan(merged,selected[0].sheet.year);
      };
      dialog.append(cancel,submit);dialog.addEventListener('close',()=>dialog.remove());document.body.append(dialog);dialog.showModal();
    }catch(e){nineBoxAlert('อ่าน Excel ไม่สำเร็จ: '+e.message);}
  };input.click();
}
if(typeof module!=='undefined')module.exports={parseNineBoxExcel};
