// Owns menu icons, page labels, active menu state, and the theme button.
window.createPBudgetNavigation = function ({$, uiIcon}) {
const titles = {
  'reports-annual': ['รายงานแผนรายปี', 'ส่งออกแผนและผลการเบิกจ่ายเป็น Excel'],
  'reports-monthly': ['รายงานแผนรายเดือน', 'ส่งออกแผนและผลการเบิกจ่ายเป็น Excel แยกชีตแต่ละปี'],
  dashboard: ['ภาพรวมงบประมาณโครงการ', ''],
  'plan-results': ['แผนและผลการเบิกจ่าย', 'ติดตามเปรียบเทียบเป้าหมายและผลการเบิกจ่ายจริงของโครงการ · หน่วย: ล้านบาท'],

  projects: [
    'โครงการทั้งหมด',
    'จัดการข้อมูล ติดตามงบประมาณ และความคืบหน้าของโครงการ',
  ],

  'project-form': ['ข้อมูลโครงการ', 'เพิ่มหรือแก้ไขข้อมูลโครงการ'],


  'nine-box': ['9 ช่อง', 'จัดทำข้อมูลงบประมาณโครงการในรูปแบบ 9 ช่อง'],

  meetings: [
    'ประชุมงบประมาณโครงการ',
    'จัดการรอบประชุม แผนงบประมาณ และติดตามผลก่อน–หลังประชุม',
  ],

  master: [
    'ตั้งค่าข้อมูลหลัก',
    'จัดการแหล่งเงินและสถานะโครงการสำหรับใช้งานร่วมกัน',
  ],

  settings: ['ตั้งค่า', 'จัดการการแสดงผล สำรองฐานข้อมูล และนำเข้าข้อมูล'],

};

function initialize() {
document.querySelectorAll('.app-header button[data-page]').forEach(button => {
  const names={dashboard:'home',projects:'list','plan-results':'lineChart','nine-box':'grid',meetings:'meeting',master:'settings',settings:'gear','reports-annual':'chart','reports-monthly':'chart'};
  const label=button.querySelector('span');
  button.innerHTML=uiIcon(names[button.dataset.page]);button.append(label);
});
$('#report-nav summary').setAttribute('aria-label','Report');
$('#report-nav summary').setAttribute('title','Report');
$('#report-nav summary').firstChild.replaceWith(document.createRange().createContextualFragment(uiIcon('paper')));
document.querySelector('.search-wrap > span').innerHTML=uiIcon('search');
}
function syncThemeButton() {
  const button = document.querySelector('#theme');
  const light = document.body.classList.contains('light');
  button.innerHTML = uiIcon(light ? 'moon' : 'sun');
  const label = light ? 'เปลี่ยนเป็นโหมดมืด' : 'เปลี่ยนเป็นโหมดสว่าง';
  button.title = label;
  button.setAttribute('aria-label', label);
}


function updateHeader(page) {
  document
    .querySelectorAll('.app-header button[data-page]')
    .forEach((button) =>
      button.classList.toggle('active', button.dataset.page === page || (button.dataset.page === 'settings' && page === 'master')),
    );

  $('#page-title').textContent = titles[page === 'master' ? 'settings' : page][0];
  $('.welcome .eyebrow').textContent = page === 'projects'
    ? 'PROJECT INFORMATION'
    : page === 'plan-results' ? 'DISBURSEMENT PLAN & RESULTS' : 'PROJECT BUDGET OVERVIEW';
  const pageSubtitle = $('#page-subtitle');
  pageSubtitle.textContent = titles[page][1];
  pageSubtitle.hidden = !titles[page][1];
}
return {titles, initialize, updateHeader, syncThemeButton};
};
