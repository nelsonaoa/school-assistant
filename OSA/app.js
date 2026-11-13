// ==========================================
// 1. 全域狀態變數
// ==========================================
let currentData = [];       // 存放解析後的資料陣列
let originalFileName = '';  // 記錄原始檔名

// DOM 元素快取
let dropZone, fileInput, selectFileBtn, uploadCard, editorCard;
let tableBody, rowCount, fileNameBadge, addRowBtn, resetBtn, downloadBtn, msgAlert;

// ==========================================
// 2. 初始化：等待網頁結構載入後綁定事件
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  initDOM();
  bindEvents();
});

function initDOM() {
  dropZone = document.getElementById('dropZone');
  fileInput = document.getElementById('fileInput');
  selectFileBtn = document.getElementById('selectFileBtn');
  uploadCard = document.getElementById('uploadCard');
  editorCard = document.getElementById('editorCard');
  tableBody = document.getElementById('tableBody');
  rowCount = document.getElementById('rowCount');
  fileNameBadge = document.getElementById('fileNameBadge');
  addRowBtn = document.getElementById('addRowBtn');
  resetBtn = document.getElementById('resetBtn');
  downloadBtn = document.getElementById('downloadBtn');
  msgAlert = document.getElementById('msgAlert');
}

function bindEvents() {
  // 點擊按鈕與拖曳區觸發檔案選擇
  selectFileBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.click();
  });
  dropZone.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFile(e.target.files[0]);
    }
  });

  // 拖曳進入/離開視覺回饋
  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add('drag-over');
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('drag-over');
    });
  });

  dropZone.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFile(files[0]);
    }
  });

  // 表格內容即時修改監聽
  tableBody.addEventListener('input', (e) => {
    if (e.target.classList.contains('data-input')) {
      const idx = parseInt(e.target.dataset.index, 10);
      currentData[idx] = e.target.value;
    }
  });

  // 表格刪除按鈕監聽
  tableBody.addEventListener('click', (e) => {
    const deleteBtn = e.target.closest('.delete-btn');
    if (deleteBtn) {
      const idx = parseInt(deleteBtn.dataset.index, 10);
      currentData.splice(idx, 1);
      renderTable();
      showAlert('已刪除該筆資料', 'warning');
    }
  });

  // 新增、重置、下載按鈕
  addRowBtn.addEventListener('click', handleAddRow);
  resetBtn.addEventListener('click', handleReset);
  downloadBtn.addEventListener('click', handleDownload);
}

// ==========================================
// 3. 讀取與解析 TXT 檔案 (✨ 未來主要擴充區 A)
// ==========================================
function handleFile(file) {
  if (!file.name.toLowerCase().endsWith('.txt') && file.type !== 'text/plain') {
    showAlert('請上傳 .txt 格式的純文字檔案！', 'danger');
    return;
  }

  originalFileName = file.name.replace(/\.txt$/i, '');
  fileNameBadge.textContent = file.name;

  const reader = new FileReader();
  reader.onload = function(event) {
    const rawText = event.target.result;
    
    // 【預設解析邏輯】：以換行符號切割每一筆資料，過濾空行
    currentData = rawText
      .split(/\r?\n/)
      .filter(line => line.trim() !== '');

    renderTable();
    uploadCard.classList.add('d-none');
    editorCard.classList.remove('d-none');
    showAlert(`成功載入「${file.name}」，共 ${currentData.length} 筆資料`);
  };
  reader.readAsText(file, 'UTF-8');
}

// ==========================================
// 4. 渲染與操作網頁表單 (✨ 未來主要擴充區 B)
// ==========================================
function renderTable() {
  tableBody.innerHTML = '';

  if (currentData.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="3" class="text-center text-muted py-4">目前沒有資料，請點擊上方「新增一筆」</td>
      </tr>`;
  } else {
    currentData.forEach((item, index) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="text-center text-muted">${index + 1}</td>
        <td>
          <input type="text" class="form-control form-control-sm data-input" 
                 data-index="${index}" value="${escapeHtml(item)}">
        </td>
        <td class="text-center no-print">
          <button type="button" class="btn btn-outline-danger btn-sm delete-btn" 
                  data-index="${index}" title="刪除此筆">
            <i class="bi bi-trash"></i>
          </button>
        </td>
      `;
      tableBody.appendChild(tr);
    });
  }

  rowCount.textContent = currentData.length;
}

function handleAddRow() {
  currentData.push('');
  renderTable();
  const inputs = tableBody.querySelectorAll('.data-input');
  if (inputs.length > 0) inputs[inputs.length - 1].focus();
}

function handleReset() {
  currentData = [];
  fileInput.value = '';
  editorCard.classList.add('d-none');
  uploadCard.classList.remove('d-none');
}

// ==========================================
// 5. 打包並下載新版 TXT (✨ 未來主要擴充區 C)
// ==========================================
function handleDownload() {
  if (currentData.length === 0) {
    showAlert('目前沒有可匯出的資料！', 'warning');
    return;
  }

  // 【預設輸出邏輯】：將陣列重新用換行符號組合成文字
  const outputText = currentData.join('\r\n');

  // 加上 UTF-8 BOM (\uFEFF) 避免 Windows 記事本或 Excel 開啟亂碼
  const blob = new Blob(['\uFEFF' + outputText], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `${originalFileName}_已處理.txt`;
  document.body.appendChild(a);
  a.click();
  
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showAlert('新版 TXT 檔案已開始下載！', 'success');
}

// ==========================================
// 6. 輔助工具函式
// ==========================================
function showAlert(message, type = 'success') {
  msgAlert.className = `alert alert-${type} shadow`;
  msgAlert.textContent = message;
  msgAlert.style.display = 'block';
  setTimeout(() => {
    msgAlert.style.display = 'none';
  }, 3000);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
