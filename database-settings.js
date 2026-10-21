window.mountDatabaseSettings = async function () {
  const panel = document.getElementById('database-settings');
  if (!panel) return;
  panel.innerHTML = `<h3>นำเข้าฐานข้อมูล (.db)</h3>
    <p>รับข้อมูลจากเครื่องอื่น หรือกู้คืนไฟล์จากปุ่ม “สำรองข้อมูลทั้งหมด”</p>
    <p class="settings-note">การนำเข้าจะแทนที่ข้อมูลทั้งหมดในเครื่องนี้ รวมโครงการ รหัสโครงการ การประชุม และข้อมูล 9 ช่อง ข้อมูลเดิมจะถูกสำรองก่อนนำเข้า</p>
    <div class="settings-actions"><label class="secondary patch-file-label">เลือกฐานข้อมูล (.db)
      <input id="database-file" type="file" accept=".db,application/vnd.sqlite3" disabled>
    </label></div>
    <p id="database-message" role="status" aria-live="polite">กำลังตรวจสอบระบบ…</p>
    <div id="database-preview" hidden>
      <p id="database-counts"></p>
      <p>บันทึกงานหรือปิดหน้าที่กำลังแก้ไขก่อนนำเข้า ข้อมูลในไฟล์จะเข้ามาแทนข้อมูลปัจจุบันทั้งหมด ไม่ได้รวมข้อมูลเข้าด้วยกัน</p>
      <label class="database-confirm"><input id="database-confirm" type="checkbox"> ฉันต้องการแทนที่ข้อมูลทั้งหมดด้วยไฟล์นี้</label>
      <div class="settings-actions"><button id="database-restore" class="primary" disabled>สำรองและแทนที่ข้อมูลทั้งหมด</button>
      <button id="database-cancel" class="secondary">ยกเลิก</button></div>
    </div>`;
  const q = s => panel.querySelector(s), message = q('#database-message'), file = q('#database-file');
  let staged = null, working = false;
  async function call(url, options) {
    const response = await fetch(url, {cache:'no-store', ...options});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'ดำเนินการไม่สำเร็จ กรุณาลองใหม่');
    return data;
  }
  try {
    const status = await call('/api/database-transfer');
    if (!panel.isConnected) return;
    file.disabled = false;
    message.textContent = status.last?.status === 'success' ?
      `นำเข้าล่าสุด: ${new Date(status.last.restoredAt).toLocaleString('th-TH')} • ${status.last.projects} โครงการ` :
      'เลือกไฟล์เพื่อตรวจสอบก่อนนำเข้า (สูงสุด 256 MB)';
    if (status.last?.backupPath) {
      const detail = document.createElement('p'); detail.className = 'settings-note';
      detail.textContent = 'ข้อมูลเดิมก่อนนำเข้าถูกสำรองไว้ที่: ' + status.last.backupPath;
      panel.append(detail);
    }
  } catch (error) { message.textContent = error.message; }
  file.addEventListener('change', async () => {
    staged = null; q('#database-preview').hidden = true;
    q('#database-confirm').checked = false; q('#database-confirm').disabled = false; q('#database-restore').disabled = true;
    const selected = file.files[0]; if (!selected) return;
    if (!selected.name.toLowerCase().endsWith('.db') || selected.size > 256*1024*1024) {
      message.textContent = 'กรุณาเลือกไฟล์ .db ขนาดไม่เกิน 256 MB'; file.value = ''; return;
    }
    working = true; file.disabled = true; message.textContent = 'กำลังตรวจสอบฐานข้อมูล…';
    try {
      const body = new FormData(); body.append('database', selected);
      staged = await call('/api/database-transfer/preview', {method:'POST', body});
      q('#database-counts').textContent = `ข้อมูลในเครื่อง: ${staged.current.projects} โครงการ • ในไฟล์: ${staged.incoming.projects} โครงการ และ ${staged.incoming.meetings} รอบประชุม`;
      q('#database-preview').hidden = false;
      message.textContent = 'ไฟล์ถูกต้อง ยังไม่ได้เปลี่ยนข้อมูล กรุณาตรวจสอบและยืนยัน';
    } catch (error) { message.textContent = error.message; }
    finally { working = false; file.disabled = false; }
  });
  q('#database-confirm').addEventListener('change', () => {
    q('#database-restore').disabled = working || !staged || !q('#database-confirm').checked;
  });
  q('#database-cancel').addEventListener('click', async () => {
    if (working) return;
    try {
      await call('/api/database-transfer/cancel', {method:'POST'});
      staged = null; file.value = ''; q('#database-preview').hidden = true;
      message.textContent = 'ยกเลิกแล้ว ข้อมูลเดิมยังอยู่ครบ';
    } catch (error) { message.textContent = error.message; }
  });
  q('#database-restore').addEventListener('click', async () => {
    if (working || !staged || !q('#database-confirm').checked) return;
    working = true; file.disabled = true;
    q('#database-restore').disabled = true; q('#database-cancel').disabled = true; q('#database-confirm').disabled = true;
    message.textContent = 'กำลังสำรองข้อมูลเดิมและนำเข้าฐานข้อมูล กรุณารอ…';
    try {
      await call('/api/database-transfer/restore', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id:staged.id, replaceAll:true})});
      location.reload();
    } catch (error) {
      message.textContent = error.message + ' หากการเชื่อมต่อขาดหาย ให้โหลดหน้าใหม่เพื่อตรวจสอบผลก่อนลองอีกครั้ง';
      working = false; file.disabled = false;
      q('#database-cancel').disabled = false;
      // Force a fresh preview rather than retrying an ambiguous destructive request.
      staged = null; q('#database-preview').hidden = true;
    }
  });
};
