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
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('attDate').value = today;
  document.getElementById('adminQueryDate').value = today;
  
  initGoogleLogin();
}

// 🎯 核心 API 呼叫函式：自動帶入 ID Token 發送 POST 請求
function callGasApi(action, payload = {}) 
{
  payload.action = action;
  payload.idToken = currentIdToken;

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

    // 若本地已有 Token 嘗試自動初始化，否則跳出 One Tap 提示
    if(currentIdToken) 
    {
      verifyAndLogin(currentIdToken);
    } 
    else 
    {
      google.accounts.id.prompt();
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
        document.getElementById('userNameSpan').textContent = res.name || res.email;
        document.getElementById('roleBadge').textContent = res.role || 'user';
        
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
    google.accounts
