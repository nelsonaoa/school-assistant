// ==========================================
// 1. 全域狀態變數與對照表
// ==========================================
let currentData = [];       // 存放解析後的結構化物件陣列
let originalFileName = '';  // 記錄原始檔名

const GRADE_MAP = {
  '1': '高一',
  '2': '高二',
  '3': '高三'
};

// DOM 元素快取
let dropZone, fileInput, selectFileBtn, uploadCard, editorCard;
let tableBody, rowCount, fileNameBadge, resetBtn, downloadBtn, msgAlert;

// ==========================================
// 2. 初始化與事件綁定
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
  resetBtn = document.getElementById('resetBtn');
  downloadBtn = document.getElementById('downloadBtn');
  msgAlert = document.getElementById('msgAlert');
}

function bindEvents() {
  selectFileBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.click();
  });
  dropZone.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) handleFile(e.target.files[0]);
  });

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
    if (files.length > 0) handleFile(files[0]);
  });

  // 監聽表單內的即時輸入修改（日期三格 & 12個獨立節次欄）
  tableBody.addEventListener('input', (e) => {
    const target = e.target;
    const idx = parseInt(target.dataset.index, 10);
    if (isNaN(idx) || !currentData[idx]) return;

    // 1. 修改日期（年、月、日）
    if (target.classList.contains('date-part')) {
      const part = target.dataset.part; // 'year' | 'month' | 'day'
      currentData[idx][part] = target.value;
    }

    // 2. 修改 12 節次代碼
    if (target.classList.contains('period-input')) {
      const pIdx = parseInt(target.dataset.pindex, 10);
      const val = target.value.slice(0, 1); // 限制最多1碼
      target.value = val;
      currentData[idx].periods[pIdx] = val;

      // 即時切換異常高亮顏色（非 0 且非空值時標紅）
      if (val !== '0' && val !== '') {
        target.classList.add('is-absent');
      } else {
        target.classList.remove('is-absent');
      }

      // 輸入滿 1 碼後自動跳到右邊下一節課的儲存格
      if (val.length === 1 && pIdx < 11) {
        const nextInput = tableBody.querySelector(`.period-input[data-index="${idx}"][data-pindex="${pIdx + 1}"]`);
        if (nextInput) {
          nextInput.focus();
          nextInput.select();
        }
      }
    }
  });

  // 點擊或 Tab 切換到輸入框時自動全選文字，方便直接覆蓋修改
  tableBody.addEventListener('focusin', (e) => {
    if (e.target.tagName === 'INPUT') {
      e.target.select();
    }
  });

  // 監聽刪除按鈕
  tableBody.addEventListener('click', (e) => {
    const deleteBtn = e.target.closest('.delete-btn');
    if (deleteBtn) {
      const idx = parseInt(deleteBtn.dataset.index, 10);
      currentData.splice(idx, 1);
      renderTable();
      showAlert('已刪除該筆資料', 'warning');
    }
  });

  resetBtn.addEventListener('click', handleReset);
  downloadBtn.addEventListener('click', handleDownload);
}

// ==========================================
// 3. 讀取與解析固定長度 TXT 檔案
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
    const lines = rawText.split(/\r?\n/).filter(line => line.trim() !== '');
    
    currentData = [];
    let errorCount = 0;

    lines.forEach((line) => {
      // 匹配「第一欄(5碼) + 空白(1至多個空格) + 第二欄(23碼)」
      const match = line.match(/^(\S+)(\s+)(\S+)$/);
      if (match && match[1].length >= 5 && match[3].length >= 23) {
        const col1 = match[1];
        const spaces = match[2]; // 保留原始空格數量
        const col2 = match[3];

        currentData.push({
          grade: col1.substring(0, 1),          // 第 1 碼：年級
          academicYear: col1.substring(1, 4),   // 第 2~4 碼：學年度（隱藏保留）
          semester: col1.substring(4, 5),       // 第 5 碼：學期（隱藏保留）
          spaces: spaces,                       // 中間空白
          classCode: col2.substring(0, 2),      // 第 1~2 碼：班級
          seatNo: col2.substring(2, 4),         // 第 3~4 碼：座號
          year: col2.substring(4, 7),           // 第 5~7 碼：民國年
          month: col2.substring(7, 9),          // 第 8~9 碼：月
          day: col2.substring(9, 11),           // 第 10~11 碼：日
          periods: col2.substring(11, 23).split('') // 第 12~23 碼：12個節次陣列
        });
      } else {
        errorCount++;
      }
    });

    renderTable();
    uploadCard.classList.add('d-none');
    editorCard.classList.remove('d-none');

    if (errorCount > 0) {
      showAlert(`載入 ${currentData.length} 筆資料（略過 ${errorCount} 筆格式不符的行）`, 'warning');
    } else {
      showAlert(`成功載入「${file.name}」，共 ${currentData.length} 筆資料`);
    }
  };
  reader.readAsText(file, 'UTF-8');
}

// ==========================================
// 4. 渲染獨立欄位大表格
// ==========================================
function renderTable() {
  tableBody.innerHTML = '';

  if (currentData.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="18" class="text-center text-muted py-5">目前沒有可顯示的資料</td>
      </tr>`;
  } else {
    currentData.forEach((row, index) => {
      const gradeText = GRADE_MAP[row.grade] || `${row.grade}年級`;
      const classNum = parseInt(row.classCode, 10) || row.classCode;
      const seatNum = parseInt(row.seatNo, 10) || row.seatNo;

      // 產生 12 個獨立的 <td> 儲存格（午休、早自習、1~8節、9~10節）
      const periodCellsHtml = row.periods.map((code, pIdx) => {
        const isAbsent = code !== '0' && code !== '';
        return `
          <td>
            <input type="text" maxlength="1" 
                   class="form-control form-control-sm period-input ${isAbsent ? 'is-absent' : ''}" 
                   data-index="${index}" data-pindex="${pIdx}" 
                   value="${escapeHtml(code)}">
          </td>
        `;
      }).join('');

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <!-- 1. 序號（靜態文字） -->
        <td class="text-muted">${index + 1}</td>
        
        <!-- 2. 年級（靜態文字） -->
        <td class="fw-medium">${escapeHtml(gradeText)}</td>

        <!-- 3. 班級（靜態文字） -->
        <td>${escapeHtml(String(classNum))}班</td>

        <!-- 4. 座號（靜態文字） -->
        <td>${escapeHtml(String(seatNum))}號</td>

        <!-- 5. 日期（同一欄內連續三格文字輸入框：年 / 月 / 日） -->
        <td>
          <div class="date-group">
            <input type="text" maxlength="3" class="form-control form-control-sm date-part date-input-y" 
                   data-index="${index}" data-part="year" value="${escapeHtml(row.year)}" title="民國年">
            <span class="text-muted">/</span>
            <input type="text" maxlength="2" class="form-control form-control-sm date-part date-input-md" 
                   data-index="${index}" data-part="month" value="${escapeHtml(row.month)}" title="月">
            <span class="text-muted">/</span>
            <input type="text" maxlength="2" class="form-control form-control-sm date-part date-input-md" 
                   data-index="${index}" data-part="day" value="${escapeHtml(row.day)}" title="日">
          </div>
        </td>

        <!-- 6~17. 每一節課各自為獨立儲存格 -->
        ${periodCellsHtml}

        <!-- 18. 刪除操作欄 -->
        <td class="no-print">
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

function handleReset() {
  currentData = [];
  fileInput.value = '';
  editorCard.classList.add('d-none');
  uploadCard.classList.remove('d-none');
}

// ==========================================
// 5. 打包並下載新版 TXT（自動補零維持固定長度）
// ==========================================
function handleDownload() {
  if (currentData.length === 0) {
    showAlert('目前沒有可匯出的資料！', 'warning');
    return;
  }

  const outputLines = currentData.map(row => {
    const col1 = `${row.grade}${row.academicYear}${row.semester}`;

    const y = String(row.year).trim().padStart(3, '0').slice(-3);
    const m = String(row.month).trim().padStart(2, '0').slice(-2);
    const d = String(row.day).trim().padStart(2, '0').slice(-2);

    const pStr = row.periods.map(p => (p && p.trim() !== '' ? p.trim().slice(0, 1) : '0')).join('');
    const col2 = `${row.classCode}${row.seatNo}${y}${m}${d}${pStr}`;

    return `${col1}${row.spaces}${col2}`;
  });

  const outputText = outputLines.join('\r\n');

  const blob = new Blob([outputText], { type: 'text/plain;charset=utf-8' });
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
