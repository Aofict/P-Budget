/* Offline patch UI. All uploaded manifest text is rendered as text, never HTML. */
window.mountPatchSettings = async function () {
  const panel = document.getElementById('patch-settings');
  if (!panel) return;
  panel.innerHTML = `<h3>อัปเดตโปรแกรม</h3>
    <p>ติดตั้งแพตช์จากไฟล์ ZIP ได้โดยไม่ต้องเชื่อมต่ออินเทอร์เน็ต</p>
    <p id="patch-version">กำลังตรวจสอบเวอร์ชัน…</p>
    <p class="settings-note">เลือกเฉพาะแพตช์จากผู้ดูแลโปรแกรมที่คุณเชื่อถือ ระบบตรวจสอบความครบถ้วนของไฟล์ แต่ไม่ได้ยืนยันผู้เผยแพร่ด้วยลายเซ็นดิจิทัล</p>
    <div class="settings-actions"><label class="secondary patch-file-label">เลือกไฟล์แพตช์ (.zip)
      <input id="patch-file" type="file" accept=".zip,application/zip" disabled>
    </label></div>
    <p id="patch-message" role="status" aria-live="polite"></p>
    <div id="patch-preview" hidden>
      <p id="patch-summary"></p><pre id="patch-notes"></pre>
      <p>บันทึกงานที่เปิดค้างไว้ก่อนติดตั้ง ระบบจะปิดโปรแกรมชั่วคราว เขียนไฟล์โปรแกรมทับตำแหน่งเดิม และคงฐานข้อมูลในโฟลเดอร์ data ไว้</p>
      <div class="settings-actions"><button id="patch-install" class="primary">ติดตั้งแพตช์</button>
      <button id="patch-cancel" class="secondary">ยกเลิก</button></div>
    </div>`;
  const q = (s) => panel.querySelector(s);
  const message = q('#patch-message'), input = q('#patch-file'), preview = q('#patch-preview');
  let token, staged;
  async function call(url, options = {}) {
    const response = await fetch(url, {cache:'no-store', ...options});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'ดำเนินการไม่สำเร็จ กรุณาลองใหม่');
    return data;
  }
  try {
    const info = await call('/api/updates');
    if (!panel.isConnected) return;
    token = info.token;
    q('#patch-version').textContent = `เวอร์ชันปัจจุบัน ${info.version}`;
    input.disabled = !info.supported || info.busy;
    message.textContent = info.busy ? 'กำลังติดตั้งแพตช์ กรุณารอโปรแกรมเปิดใหม่' :
      !info.supported ? 'ติดตั้งแพตช์ได้เมื่อเปิดผ่านชุด EXE ที่ใช้ฐานข้อมูลในโฟลเดอร์ data ของโปรแกรม' :
      info.last?.message || 'เลือกไฟล์เพื่อตรวจสอบก่อนติดตั้ง (ขนาดสูงสุด 512 MB)';
    if (info.last?.status === 'success' && info.last.applicationFolder) {
      const location = document.createElement('p');
      location.className = 'settings-note';
      location.textContent = 'อัปเดตแล้วในโฟลเดอร์เดิม: ' + info.last.applicationFolder + '\\PBudgetManager.exe';
      panel.append(location);
    }
  } catch (err) { message.textContent = err.message; }
  input.addEventListener('change', async () => {
    staged = null; preview.hidden = true;
    const file = input.files[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.zip') || file.size > 512*1024*1024) {
      message.textContent = 'กรุณาเลือกไฟล์ ZIP ขนาดไม่เกิน 512 MB'; input.value = ''; return;
    }
    input.disabled = true; message.textContent = 'กำลังอัปโหลดและตรวจสอบไฟล์แพตช์…';
    try {
      const body = new FormData(); body.append('patch', file);
      staged = await call('/api/updates/stage', {method:'POST', headers:{'X-PBudget-Update':token}, body});
      q('#patch-summary').textContent = `พร้อมติดตั้งเวอร์ชัน ${staged.version} • ตรวจสอบแล้ว ${staged.files} ไฟล์`;
      q('#patch-notes').textContent = staged.notes || 'ไม่มีรายละเอียดเพิ่มเติม';
      preview.hidden = false; message.textContent = 'ตรวจสอบไฟล์ครบแล้ว ยังไม่ได้ติดตั้ง';
    } catch (err) { message.textContent = err.message; }
    finally { input.disabled = false; }
  });
  q('#patch-cancel').addEventListener('click', () => {
    staged = null; input.value = ''; preview.hidden = true; message.textContent = 'ยกเลิกแล้ว ไม่มีการเปลี่ยนแปลงโปรแกรม';
  });
  q('#patch-install').addEventListener('click', async () => {
    if (!staged) return;
    input.disabled = true; q('#patch-install').disabled = true; q('#patch-cancel').disabled = true;
    message.textContent = 'กำลังเตรียมติดตั้ง กรุณาอย่าปิดเครื่อง…';
    try {
      await call('/api/updates/install', {method:'POST', headers:{'Content-Type':'application/json','X-PBudget-Update':token}, body:JSON.stringify({id:staged.id})});
      message.textContent = 'กำลังอัปเดตไฟล์โปรแกรมและเปิดโปรแกรมจากตำแหน่งเดิม กรุณารอสักครู่…';
      const deadline = Date.now() + 120000;
      // Also refresh this tab after handoff; a failed update reports its result from the old app.
      async function poll() {
        if (!panel.isConnected) return;
        try {
          const status = await call('/api/updates');
          if (!status.busy && status.last && status.last.status !== 'installing') {
            location.reload(); return;
          }
        } catch (_) {}
        if (Date.now() < deadline) setTimeout(poll, 1500);
        else message.textContent = 'ยังเชื่อมต่อไม่ได้ กรุณาเปิด EXE ชุดเดิมเพื่อตรวจสอบผลในหน้าตั้งค่า ข้อมูลเดิมยังอยู่ในโฟลเดอร์เดิม';
      }
      setTimeout(poll, 2500);
    } catch (err) {
      message.textContent = err.message;
      input.disabled = false; q('#patch-install').disabled = false; q('#patch-cancel').disabled = false;
    }
  });
};
