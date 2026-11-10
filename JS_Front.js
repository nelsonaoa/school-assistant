let currentData = { periods: [], studentsByPeriod: {}, logs: {}, confirmMap: {} };
let activePeriodIndex = 0;
let studentStatuses = {};
let currentUserRole = 'guest';

// 🎯 請填入您的 GCP OAuth Client ID 與 GAS 部署 Web App 網址
const GOOGLE_CLIENT_ID = "41397361871-ieh71tib6jg1a8g6tnpn2fdbh1ncdkt6.apps.googleusercontent.com";
const GAS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwVMzyr0KHNHG3VvHsaTIFWRqZKpkPYDH3WPXwS9X8/exec";

window.onload = function() 
{
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('attDate').value = today;
  document.getElementById('adminQueryDate').value = today;
  
  initGoogleLogin();
}

// 🎯 核心封裝：統一使用 fetch 向 GAS 後端發送 API 請求
function callGasApi(action, payload = {}) 
{
  payload.action = action;
  
  return fetch(GAS_WEB_APP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(payload)
  })
  .then(res => res.json());
}

// 🎯 1. Google 官方一鍵登入初始化
function initGoogleLogin() 
{
  if(typeof google !== 'undefined' && google.accounts) 
  {
    google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleCredentialResponse,
      auto_select: false
    });

    const container = document.getElementById("g_id_signin_container");
    if(container) 
    {
      google.accounts.id.renderButton(
        container,
        { theme: "outline", size: "small", text: "signin_with", shape: "rectangular" }
      );
    }

    // 嘗試觸發頂部或右側 One Tap 快捷登入框
    google.accounts.id.prompt();
  }
}

// 🎯 2. 接收登入成功的 ID Token 並送到 GAS 後端驗證 Email
function handleCredentialResponse(response) 
{
  showMessage("身分驗證中...", true);
  
  callGasApi('verifyUser', { idToken: response.credential })
    .then(res => {
      if(res.success) 
      {
        document.getElementById('userNameSpan').textContent = res.name || res.email;
        document.getElementById('roleBadge').textContent = res.role || 'user';
        
        const container = document.getElementById("g_id_signin_container");
        if(container) container.style.display = 'none';
        
        const switchBtn = document.getElementById("switchBtn");
        if(switchBtn) switchBtn.style.display = 'inline-block';
        
        showMessage("登入成功！歡迎 " + res.email, true);
        fetchInitData(res);
      } 
      else 
      {
        showMessage("登入驗證失敗：" + (res.message || res.error), false);
      }
    })
    .catch(err => {
      showMessage("驗證通訊失敗: " + err.message, false);
    });
}

function switchAccount() 
{
  // 清除目前頁面狀態並重新提示選擇 Google 帳號
  if(typeof google !== 'undefined' && google.accounts) 
  {
    google.accounts.id.disableAutoSelect();
    initGoogleLogin();
    showMessage("請從 Google 彈窗中點選欲切換的帳號", true);
  }
}

function switchToAdminPage() 
{
  document.getElementById('frontView').style.display = 'none';
  document.getElementById('adminView').style.display = 'block';
  document.getElementById('adminBtn').style.display = 'none';
  document.getElementById('frontBtn').style.display = 'inline-block';
  if(typeof loadAdminSummary === 'function') loadAdminSummary();
}

function switchToFrontPage() 
{
  document.getElementById('adminView').style.display = 'none';
  document.getElementById('frontView').style.display = 'block';
  document.getElementById('adminBtn').style.display = 'inline-block';
  document.getElementById('frontBtn').style.display = 'none';
}

// 🎯 3. 根據登入資料初始化頁面與權限
function fetchInitData(initRes) 
{
  if(!initRes || !initRes.userInfo) return;

  currentUserRole = initRes.userInfo.role ? initRes.userInfo.role.toLowerCase() : 'guest';
  const userEmail = initRes.userInfo.email || '';
  
  document.getElementById('userNameSpan').textContent = initRes.userInfo.name || '使用者';
  document.getElementById('roleBadge').textContent = currentUserRole;

  if(currentUserRole === 'guest' || initRes.success === false) 
  {
    const frontView = document.getElementById('frontView');
    if(frontView) 
    {
      const detectedEmailText = userEmail 
        ? `目前登入的帳號為：<strong>${userEmail}</strong>（未在教師授權名單中）`
        : `系統無法取得您的 Google Email，請點擊右上方完成 Google 登入。`;

      frontView.innerHTML = `
        <div class="card shadow-sm text-center p-5 mt-4 border-danger">
          <div class="card-body">
            <h3 class="text-danger fw-bold mb-3">🚫 權限不足（無權限）</h3>
            <p class="text-secondary mb-3">
              您的 Google 帳號未被授權使用點名系統。
            </p>
            <div class="alert alert-light border small text-dark mb-4">
              ${detectedEmailText}
            </div>
            <button class="btn btn-outline-primary px-4 fw-bold" onclick="switchAccount()">
              🔄 切換其他帳號登入
            </button>
          </div>
        </div>
      `;
    }
    const adminBtn = document.getElementById('adminBtn');
    if(adminBtn) adminBtn.style.display = 'none';
    return;
  }

  if(currentUserRole === 'admin' || currentUserRole === 'supervisor') 
  {
    document.getElementById('adminBtn').style.display = 'inline-block';
  } 
  else 
  {
    document.getElementById('adminBtn').style.display = 'none';
  }

  const importTabLi = document.getElementById('importTabLi');
  if(importTabLi) 
  {
    importTabLi.style.display = (currentUserRole === 'admin') ? 'block' : 'none';
  }

  updatePermissionUI();

  const select = document.getElementById('courseSelect');
  if(select) 
  {
    select.innerHTML = '';
    if(!initRes.courses || initRes.courses.length === 0) 
    {
      select.innerHTML = '<option value="">(無您的授課課程)</option>';
    } 
    else 
    {
      initRes.courses.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.code;
        opt.textContent = `${c.code} ${c.name} (${c.teacher || '未指派'})`;
        select.appendChild(opt);
      });
    }
  }
}

function isDateExpired(targetDateStr) 
{
  if(currentUserRole === 'admin') return false;
  if(!targetDateStr) return false;
  
  const targetDate = new Date(targetDateStr);
  const today = new Date();
  
  targetDate.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  
  const diffTime = today - targetDate;
  const diffDays = diffTime / (1000 * 60 * 60 * 24);
  
  return diffDays > 1;
}

function updatePermissionUI() 
{
  const targetDate = document.getElementById('attDate').value;
  const isExpired = isDateExpired(targetDate);
  
  const saveBtn = document.getElementById('saveBtn');
  const readOnlyNotice = document.getElementById('readOnlyNotice');

  if(['supervisor', 'student', 'guest'].includes(currentUserRole) || isExpired) 
  {
    if(saveBtn) saveBtn.style.display = 'none';
    if(readOnlyNotice) 
    {
      if(isExpired && currentUserRole === 'teacher') 
      {
        readOnlyNotice.innerHTML = '👁️ 唯讀模式：點名時間已超過期限，無法修改或儲存點名資料。';
      } 
      else 
      {
        readOnlyNotice.innerHTML = '👁️ 唯讀模式：無法修改或儲存點名資料。';
      }
      readOnlyNotice.style.display = 'block';
    }
  } 
  else 
  {
    if(saveBtn) saveBtn.style.display = 'inline-block';
    if(readOnlyNotice) readOnlyNotice.style.display = 'none';
  }
}

// 🎯 4. 透過 fetch 讀取點名名單
function loadAttendanceRoster() 
{
  const targetDate = document.getElementById('attDate').value;
  const courseCode = document.getElementById('courseSelect').value;

  if(!targetDate || !courseCode) 
  {
    showMessage('請選擇點名日期與課程！', false);
    return;
  }

  updatePermissionUI();

  document.getElementById('attendanceBlock').style.display = 'none';
  showMessage('⏳ 正在載入點名名單...', true);

  callGasApi('getAttendance', { targetDate: targetDate, courseCode: courseCode })
    .then(res => {
      if(!res || !res.success) 
      {
        showMessage(res ? res.message : '載入失敗，該時段可能無學生名單', false);
        return;
      }

      currentData = res;
      activePeriodIndex = 0;
      studentStatuses = {};

      currentData.periods.forEach(p => {
        const schId = p.scheduleId;
        const periodStudents = currentData.studentsByPeriod[schId] || [];

        periodStudents.forEach(s => {
          const key = schId + '_' + s.studentId;
          studentStatuses[key] = (currentData.logs && currentData.logs[key]) ? currentData.logs[key] : '出席';
        });
      });

      renderTabs();
      renderStudentList();
      document.getElementById('attendanceBlock').style.display = 'block';
    })
    .catch(err => {
      showMessage('讀取名單失敗: ' + err.message, false);
    });
}

function renderTabs() 
{
  const tabsContainer = document.getElementById('periodTabs');
  tabsContainer.innerHTML = '';

  currentData.periods.forEach((p, idx) => {
    let periodDisplay = p.period;

    const isConfirmed = (currentData.confirmMap && currentData.confirmMap[p.scheduleId]);
    const statusLabel = isConfirmed ? ' (已點名)' : ' (尚未點名)';

    const li = document.createElement('li');
    li.className = 'nav-item';

    const a = document.createElement('a');
    a.className = 'nav-link' + (idx === activePeriodIndex ? ' active fw-bold' : '');
    a.style.color = isConfirmed ? '#198754' : '#dc3545';
    a.href = '#';
    a.textContent = `第 ${periodDisplay} 節${statusLabel}`;
    a.onclick = function(e) 
    {
      e.preventDefault();
      activePeriodIndex = idx;
      renderTabs();
      renderStudentList();
    };

    li.appendChild(a);
    tabsContainer.appendChild(li);
  });

  updateConfirmBadge();
}

function updateConfirmBadge() 
{
  const badge = document.getElementById('confirmBadge');
  if(!currentData.periods || !currentData.periods[activePeriodIndex]) 
  {
    badge.style.setProperty('display', 'none', 'important');
    return;
  }

  const currentScheduleId = currentData.periods[activePeriodIndex].scheduleId;
  const confirmInfo = (currentData.confirmMap && currentData.confirmMap[currentScheduleId]) 
    ? currentData.confirmMap[currentScheduleId] 
    : null;

  if(confirmInfo && confirmInfo.teacher) 
  {
    document.getElementById('confirmTeacher').textContent = confirmInfo.teacher;
    document.getElementById('confirmTime').textContent = confirmInfo.time;
    badge.style.setProperty('display', 'flex', 'important');
  } 
  else 
  {
    badge.style.setProperty('display', 'none', 'important');
  }
}

function renderStudentList() 
{
  const container = document.getElementById('studentListContainer');
  container.innerHTML = '';

  if(!currentData.periods[activePeriodIndex]) return;

  const currentScheduleId = currentData.periods[activePeriodIndex].scheduleId;
  const students = currentData.studentsByPeriod[currentScheduleId] || [];

  if(students.length === 0) 
  {
    container.innerHTML = '<div class="text-center text-muted my-3">本節次無學生名單</div>';
    return;
  }

  const targetDate = document.getElementById('attDate').value;
  const courseSelectElem = document.getElementById('courseSelect');
  const courseNameText = courseSelectElem.options[courseSelectElem.selectedIndex] ? courseSelectElem.options[courseSelectElem.selectedIndex].text : '';
  const currentPeriodObj = currentData.periods[activePeriodIndex];

  const printHeaderDiv = document.createElement('div');
  printHeaderDiv.className = 'd-none d-print-block mb-3 text-center';
  printHeaderDiv.innerHTML = `
    <h4 class="fw-bold mb-1">麗山高中自主學習點名單</h4>
    <p class="text-secondary mb-0">課程：${courseNameText} </br> 上課日期：${targetDate}  第 ${currentPeriodObj.period} 節</p>
    <hr class="my-2">
  `;
  container.appendChild(printHeaderDiv);

  const headerRow = document.createElement('div');
  headerRow.className = 'row text-muted fw-bold pb-2 border-bottom mb-2 small align-items-center px-2';
  headerRow.innerHTML = `
    <div class="col-3">班級 / 座號</div>
    <div class="col-4">姓名</div>
    <div class="col-5 text-end">上課狀態</div>
  `;
  container.appendChild(headerRow);

  const isReadOnly = ['supervisor', 'student', 'guest'].includes(currentUserRole) || isDateExpired(targetDate);

  students.forEach(s => {
    const key = currentScheduleId + '_' + s.studentId;
    const currentStatus = studentStatuses[key] || '出席';

    const row = document.createElement('div');
    row.className = 'student-row row align-items-center py-2 border-bottom px-2';

    let statusHtml = '';
    if(s.isCurrentCourse === false) 
    {
      let badgeClass = 'bg-secondary text-white';
      if(s.crossStatusText === '出席') badgeClass = 'bg-success text-white';
      else if(s.crossStatusText === '遲到') badgeClass = 'bg-warning text-dark';
      else if(s.crossStatusText === '缺席') badgeClass = 'bg-danger text-white';
      else if(s.crossStatusText === '尚未點名') badgeClass = 'bg-light text-secondary border';

      statusHtml = `<span class="small text-secondary me-1">已至 ${s.actualCourseName} 上課</span> <span class="badge ${badgeClass}">${s.crossStatusText}</span>`;
    } 
    else 
    {
      statusHtml = `
        <div class="btn-group status-btn-group" role="group">
          <button type="button" class="btn btn-sm ${currentStatus === '出席' ? 'btn-success' : 'btn-outline-success'}" ${isReadOnly ? 'disabled' : ''} onclick="setStatus('${key}', '出席')">出席</button>
          <button type="button" class="btn btn-sm ${currentStatus === '遲到' ? 'btn-warning' : 'btn-outline-warning'}" ${isReadOnly ? 'disabled' : ''} onclick="setStatus('${key}', '遲到')">遲到</button>
          <button type="button" class="btn btn-sm ${currentStatus === '缺席' ? 'btn-danger' : 'btn-outline-danger'}" ${isReadOnly ? 'disabled' : ''} onclick="setStatus('${key}', '缺席')">缺席</button>
        </div>
      `;
    }

    row.innerHTML = `
      <div class="col-3">
        <span class="fw-bold small d-print-none">${s.className}</span>
        <br class="d-print-none">
        <span class="text-muted small d-print-none">${s.seatNum}號</span>
        <span class="fw-bold small d-none d-print-inline">${s.className} ${s.seatNum}號</span>
      </div>
      <div class="col-4 fw-bold text-truncate">${s.name}</div>
      <div class="col-5 text-end">
        ${statusHtml}
      </div>
    `;
    container.appendChild(row);
  });
}

function setStatus(key, status) 
{
  const targetDate = document.getElementById('attDate').value;
  if(['supervisor', 'guest'].includes(currentUserRole) || isDateExpired(targetDate)) return;
  studentStatuses[key] = status;
  renderStudentList();
}

// 🎯 5. 透過 fetch 儲存點名紀錄
function submitAttendance() 
{
  const targetDate = document.getElementById('attDate').value;
  if(['supervisor', 'guest'].includes(currentUserRole) || isDateExpired(targetDate)) 
  {
    showMessage('❌ 權限不足或已超過期限，無法儲存！', false);
    return;
  }

  if(!currentData.periods[activePeriodIndex]) 
  {
    showMessage('無法取得當前節次資料', false);
    return;
  }

  const currentPeriodObj = currentData.periods[activePeriodIndex];
  const courseCode = document.getElementById('courseSelect').value;

  const periodInfo = {
    scheduleId: currentPeriodObj.scheduleId,
    date: targetDate,
    courseCode: courseCode,
    period: currentPeriodObj.period
  };

  const records = [];
  for(const key in studentStatuses) 
  {
    const lastUnderscoreIndex = key.lastIndexOf('_');
    if(lastUnderscoreIndex !== -1) 
    {
      records.push({
        scheduleId: key.substring(0, lastUnderscoreIndex),
        studentId: key.substring(lastUnderscoreIndex + 1),
        status: studentStatuses[key]
      });
    }
  }

  showMessage('⏳ 正在儲存點名紀錄與簽章...', true);

  callGasApi('saveAttendance', { records: records, periodInfo: periodInfo })
    .then(res => {
      showMessage(res.message, res.success);
      if(res.success && res.confirmedInfo) 
      {
        if(!currentData.confirmMap) currentData.confirmMap = {};
        currentData.confirmMap[currentPeriodObj.scheduleId] = res.confirmedInfo;
        renderTabs();
      }
    })
    .catch(err => {
      showMessage('儲存失敗: ' + err.message, false);
    });
}

function showMessage(msg, isSuccess) 
{
  const alertBox = document.getElementById('msgAlert');
  const content = document.getElementById('msgContent');
  content.textContent = msg;
  alertBox.className = 'alert alert-dismissible fade show ' + (isSuccess ? 'alert-success' : 'alert-danger');
  alertBox.style.display = 'block';
  setTimeout(() => { alertBox.style.display = 'none'; }, 6000);
}
