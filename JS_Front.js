let currentData = { periods: [], studentsByPeriod: {}, logs: {}, confirmMap: {} };
let activePeriodIndex = 0;
let studentStatuses = {};
let currentUserRole = 'guest';

// 🎯 GCP Client ID 與部署後的 GAS Web App URL
const GOOGLE_CLIENT_ID = "41397361871-ieh71tib6jg1a8g6tnpn2fdbh1ncdkt6.apps.googleusercontent.com";
const GAS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbzgoGZu-h7h5_y5etCcgqZF9N8r2q_Vl1LR0--i76KviaIcm0QJqXKRagVFtFLei1U0/exec";

// 快取登入取得的 ID Token (供後續 API 操作帶入驗證)
let currentIdToken = localStorage.getItem('google_id_token') || '';

window.onload = function() 
{
  applySchoolBranding();
  const today = new Date().toISOString().split('T')[0];
  const attDateElem = document.getElementById('attDate');
  const adminQueryDateElem = document.getElementById('adminQueryDate');
  
  if(attDateElem) attDateElem.value = today;
  if(adminQueryDateElem) adminQueryDateElem.value = today;
  
  initGoogleLogin();
}

// 🎯 透過網址或環境自動判斷目前是哪一間學校
function getCurrentSchoolKey() 
{
// 1. 先檢查網址有沒有帶查詢參數
  const urlParams = new URLSearchParams(window.location.search);
  const schoolKeyParam = urlParams.get('schoolKey');
  
  if (schoolKeyParam) 
  {
    return schoolKeyParam.toLowerCase().trim();
  }

  // 2. 如果沒有帶參數，再檢查網址的路徑檔名 (例如 lssh.html 或 cshs.html)
  const path = window.location.pathname;
  if (path.includes('cshs')) 
  {
    return 'cshs';
  }
  if (path.includes('lssh')) 
  {
    return 'lssh';
  }
}

// 定義各個學校對應的名稱與圖示
const SCHOOL_CONFIGS = 
{
  'lssh': {name: '🏫 麗山高中自主學習點名系統',  icon: 'lssh.png'},
  'cshs': {name: '🏫 清水高中選修課程點名系統',  icon: 'cshs.png'}
};

function applySchoolBranding() 
{
  const currentKey = getCurrentSchoolKey();
  const config = SCHOOL_CONFIGS[currentKey] || SCHOOL_CONFIGS['lssh'];

  // 設定瀏覽器分頁標題 <title>
  const titleTag = document.getElementById('page-title');
  if (titleTag) 
  {
    titleTag.innerText = config.name;
  }
  document.title = config.name;

  // 設定導覽列上的 <span> 文字
  const titleSpan = document.getElementById('system-title');
  if (titleSpan) 
  {
    titleSpan.innerText = config.name;
  }

  // 批次替換所有分頁與捷徑圖示 (class="school-icon")
  const iconLinks = document.querySelectorAll('.school-icon');
  iconLinks.forEach(link => {
    link.href = config.icon;
  });
}

// 🎯 核心 API 呼叫函式：自動帶入 ID Token 發送 POST 請求
function callGasApi(action, payload = {}) 
{
  payload.action = action;
  payload.idToken = currentIdToken;
  payload.schoolKey = getCurrentSchoolKey(); // 自動帶入學校

  return fetch(GAS_WEB_APP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(payload)
  })
  .then(res => res.json());
}

// 🎯 1. 初始化 Google Identity Services (GIS)
function initGoogleLogin() 
{
  if(typeof google !== 'undefined' && google.accounts) 
  {
    google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleCredentialResponse,
      auto_select: false // 設為 false，才允許使用者在多個帳號之間自主選擇
    });

    // 渲染官方登入按鈕到您的容器中
    const container = document.getElementById("g_id_signin_container");
    if(container) 
    {
      container.className = "d-flex justify-content-end ms-auto";
      
      google.accounts.id.renderButton(
        container,
        { 
          theme: "outline",     // 樣式：outline (白底黑框)
          size: "large",        // 大小：large
          text: "signin_with",  // 按鈕文字
          shape: "rectangular"  // 形狀：矩形
        }
      );
    }

    // 若本地已有 Token 嘗試自動初始化，否則彈出 Google 官方的原生帳號選擇框
    if(currentIdToken) 
    {
      verifyAndLogin(currentIdToken);
    } 
    else 
    {
      google.accounts.id.prompt((notification) => {
        // 如果使用者關閉了彈出提示框，畫面上右側的官方登入按鈕依然可以點擊
      });
    }
  }
}

// 🎯 2. Google 登入完成回傳憑證處理
function handleCredentialResponse(response) 
{
  currentIdToken = response.credential;
  localStorage.setItem('google_id_token', currentIdToken);
  verifyAndLogin(currentIdToken);
}

// 🎯 3. 傳送 ID Token 向 GAS 後端驗證並獲取初始化資料
function verifyAndLogin(idToken) 
{
  currentIdToken = idToken;
  showMessage("身分驗證中...", true);

  callGasApi('verifyUser')
    .then(res => {
      if(res.success) 
      {
        const userNameSpan = document.getElementById('userNameSpan');
        const roleBadge = document.getElementById('roleBadge');
        if(userNameSpan) userNameSpan.textContent = res.name || res.email;
        if(roleBadge) roleBadge.textContent = res.role || 'user';
        
        const container = document.getElementById("g_id_signin_container");
        if(container) container.style.display = 'none';
        
        const switchBtn = document.getElementById("switchBtn");
        if(switchBtn) switchBtn.style.display = 'inline-block';
        
        showMessage("登入成功！歡迎 " + res.email, true);

        res.idToken = currentIdToken;
        fetchInitData(res);
      } 
      else 
      {
        localStorage.removeItem('google_id_token');
        currentIdToken = '';
        const container = document.getElementById("g_id_signin_container");
        if(container) container.style.display = 'inline-block';
        
        showMessage("驗證失敗：" + (res.message || '請重新登入'), false);
        fetchInitData(res);
      }
    })
    .catch(err => {
      showMessage("驗證通訊失敗: " + err.message, false);
    });
}

function switchAccount() 
{
  localStorage.removeItem('google_id_token');
  currentIdToken = '';
  
  if(typeof google !== 'undefined' && google.accounts) 
  {
    google.accounts.id.disableAutoSelect();
    const container = document.getElementById("g_id_signin_container");
    if(container) container.style.display = 'inline-block';
    const switchBtn = document.getElementById("switchBtn");
    if(switchBtn) switchBtn.style.display = 'none';
    
    initGoogleLogin();
    showMessage("請重新選擇 Google 帳號登入", true);
  }
}

function switchToAdminPage() 
{
  const frontView = document.getElementById('frontView');
  const adminView = document.getElementById('adminView');
  const adminBtn = document.getElementById('adminBtn');
  const frontBtn = document.getElementById('frontBtn');

  if(frontView) frontView.style.display = 'none';
  if(adminView) adminView.style.display = 'block';
  if(adminBtn) adminBtn.style.display = 'none';
  if(frontBtn) frontBtn.style.display = 'inline-block';
  if(typeof loadAdminSummary === 'function') loadAdminSummary();
}

function switchToFrontPage() 
{
  const frontView = document.getElementById('frontView');
  const adminView = document.getElementById('adminView');
  const adminBtn = document.getElementById('adminBtn');
  const frontBtn = document.getElementById('frontBtn');

  if(adminView) adminView.style.display = 'none';
  if(frontView) frontView.style.display = 'block';
  if(adminBtn) adminBtn.style.display = 'inline-block';
  if(frontBtn) frontBtn.style.display = 'none';
}

function fetchInitData(res) 
{
  if(!res || !res.userInfo) return;

  currentUserRole = res.userInfo.role ? res.userInfo.role.toLowerCase() : 'guest';
  const userEmail = res.userInfo.email || '';
  
  const userNameSpan = document.getElementById('userNameSpan');
  const roleBadge = document.getElementById('roleBadge');
  if(userNameSpan) userNameSpan.textContent = res.userInfo.name || '使用者';
  if(roleBadge) roleBadge.textContent = currentUserRole;

  if(currentUserRole === 'guest' || res.success === false) 
  {
    const frontView = document.getElementById('frontView');
    if(frontView) 
    {
      const detectedEmailText = userEmail 
        ? `目前登入的帳號為：<strong>${userEmail}</strong>（未在教師授權名單中）`
        : `系統無法辨識您的 Google 帳號，請確認是否點擊登入按鈕。`;

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
            <!--
            <button class="btn btn-outline-primary px-4 fw-bold" onclick="switchAccount()">
              🔄 切換其他帳號登入
            </button>
            -->
          </div>
        </div>
      `;
    }
    const adminBtn = document.getElementById('adminBtn');
    if(adminBtn) adminBtn.style.display = 'none';
    return;
  }

  const adminBtn = document.getElementById('adminBtn');
  if(adminBtn) 
  {
    if(currentUserRole === 'admin' || currentUserRole === 'supervisor') 
    {
      adminBtn.style.display = 'inline-block';
    } 
    else 
    {
      adminBtn.style.display = 'none';
    }
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
    if(!res.courses || res.courses.length === 0) 
    {
      select.innerHTML = '<option value="">(無您的授課課程)</option>';
    } 
    else 
    {
      res.courses.forEach(c => {
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
  const attDateElem = document.getElementById('attDate');
  if(!attDateElem) return;

  const targetDate = attDateElem.value;
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

function loadAttendanceRoster() 
{
  const attDateElem = document.getElementById('attDate');
  const courseSelectElem = document.getElementById('courseSelect');
  if(!attDateElem || !courseSelectElem) return;

  const targetDate = attDateElem.value;
  const courseCode = courseSelectElem.value;

  if(!targetDate || !courseCode) 
  {
    showMessage('請選擇點名日期與課程！', false);
    return;
  }

  updatePermissionUI();

  const attendanceBlock = document.getElementById('attendanceBlock');
  if(attendanceBlock) attendanceBlock.style.display = 'none';
  showMessage('⏳ 正在載入點名單...', true);

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
      if(attendanceBlock) attendanceBlock.style.display = 'block';
    })
    .catch(err => {
      showMessage('讀取名單失敗: ' + err.message, false);
    });
}

function renderTabs() 
{
  const tabsContainer = document.getElementById('periodTabs');
  if(!tabsContainer) return;
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
  if(!badge) return;

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
    const confirmTeacher = document.getElementById('confirmTeacher');
    const confirmTime = document.getElementById('confirmTime');
    if(confirmTeacher) confirmTeacher.textContent = confirmInfo.teacher;
    if(confirmTime) confirmTime.textContent = confirmInfo.time;
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
  if(!container) return;
  container.innerHTML = '';

  if(!currentData.periods[activePeriodIndex]) return;

  const currentScheduleId = currentData.periods[activePeriodIndex].scheduleId;
  const students = currentData.studentsByPeriod[currentScheduleId] || [];

  if(students.length === 0) 
  {
    container.innerHTML = '<div class="text-center text-muted my-3">本節次無學生名單</div>';
    return;
  }

  // 🎯 計算應到人數（自動排除跨課到其他班級的學生）
  const expectedStudents = students.filter(s => s.isCurrentCourse !== false);
  const expectedCount = expectedStudents.length;

  const targetDate = document.getElementById('attDate').value;
  const courseSelectElem = document.getElementById('courseSelect');
  const courseNameText = courseSelectElem.options[courseSelectElem.selectedIndex] ? courseSelectElem.options[courseSelectElem.selectedIndex].text : '';
  const currentPeriodObj = currentData.periods[activePeriodIndex];

  const printHeaderDiv = document.createElement('div');
  printHeaderDiv.className = 'mb-3';
  printHeaderDiv.innerHTML = `
    <div class="d-none d-print-block text-center mb-2">
      <h4 class="fw-bold mb-1">麗山高中自主學習點名單</h4>
      <p class="text-secondary mb-0">課程：${courseNameText} <br> 上課日期：${targetDate}  第 ${currentPeriodObj.period} 節</p>
      <hr class="my-2">
    </div>
    <div class="d-flex justify-content-between align-items-center bg-white p-2 rounded border mb-2 d-print-none">
      <span class="fw-bold text-dark">📋 課程點名單</span>
      <span class="badge bg-primary fs-6">應到人數：${expectedCount} 人</span>
    </div>
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
  const attDateElem = document.getElementById('attDate');
  const targetDate = attDateElem ? attDateElem.value : '';
  if(['supervisor', 'guest'].includes(currentUserRole) || isDateExpired(targetDate)) return;
  studentStatuses[key] = status;
  renderStudentList();
}

function submitAttendance() 
{
  const attDateElem = document.getElementById('attDate');
  const targetDate = attDateElem ? attDateElem.value : '';
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
  const courseCodeElem = document.getElementById('courseSelect');
  const courseCode = courseCodeElem ? courseCodeElem.value : '';

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
  if(!alertBox || !content) return;
  
  content.textContent = msg;
  alertBox.className = 'alert alert-dismissible fade show ' + (isSuccess ? 'alert-success' : 'alert-danger');
  alertBox.style.display = 'block';
  setTimeout(() => { alertBox.style.display = 'none'; }, 6000);
}
