// ==========================================
// 1. 全域狀態變數
// ==========================================
let currentData = [];       // 存放所有資料（含原始匯入列與手動新增列）
let originalFileName = '';  // 記錄原始檔名

const PERIOD_NAMES = ['午休', '早自習', '第1節', '第2節', '第3節', '第4節', '第5節', '第6節', '第7節', '第8節', '第9節', '第10節'];

// DOM 元素快取
let dropZone, fileInput, selectFileBtn, uploadCard, editorCard;
let tableHead, tableBody, rowCount, fileNameBadge, addRowBtn, resetBtn, downloadBtn, msgAlert;

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
  tableHead = document.getElementById('tableHead');
  tableBody = document.getElementById('tableBody');
  rowCount = document.getElementById('rowCount');
  fileNameBadge = document.getElementById('fileNameBadge');
  addRowBtn = document.getElementById('addRowBtn');
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

  // 1. 表頭最上方「整欄清除」按鈕：將指定節次整欄（包含新增列）全部設為 0
  tableHead.addEventListener('click', (e) => {
    const clearColBtn = e.target.closest('.clear-col-btn');
    if (!clearColBtn) return;

    const pIdx = parseInt(clearColBtn.dataset.pindex, 10);
    if (isNaN(pIdx) || currentData.length === 0) return;

    // 遍歷 currentData 中的每一筆（包含原本匯入列與手動新增列）
    currentData.forEach(row => {
      row.periods[pIdx] = '0';
    });

    renderTable();
    showAlert(`已將「${PERIOD_NAMES[pIdx]}」整欄全部設為 0`, 'info');
  });

  // 2. 監聽表格內所有輸入框的即時修改（包含新增列的基本欄位 & 所有列的12節次）
  tableBody.addEventListener('input', (e) => {
    const target = e.target;
    const idx = parseInt(target.dataset.index, 10);
    if (isNaN(idx) || !currentData[idx]) return;

    // A. 新增列的基本欄位修改（年級、班級、座號、年、月、日）
    if (target.dataset.field) {
      const fieldName = target.dataset.field;
      currentData[idx][fieldName] = target.value;
    }

    // B. 12 個節次輸入框修改
    if (target.classList.contains('period-input')) {
      const pIdx = parseInt(target.dataset.pindex, 10);
      const val = target.value.slice(0, 1); // 限制單一字元
      target.value = val;
      currentData[idx].periods[pIdx] = val;

      // 即時標紅提醒非 0 狀態
      if (val !== '0' && val !== '') {
        target.classList.add('is-absent');
      } else {
        target.classList.remove('is-absent');
      }

      // 輸入滿 1 碼自動跳到右邊下一節課輸入框
      if (val.length === 1 && pIdx < 11) {
        const nextInput = tableBody.querySelector(`.period-input[data-index="${idx}"][data-pindex="${pIdx + 1}"]`);
        if (nextInput) {
          nextInput.focus();
          nextInput.select();
        }
      }
    }
  });

  // 點擊輸入框自動全選，方便直接修改
  tableBody.addEventListener('focusin', (e) => {
    if (e.target.tagName === 'INPUT') {
      e.target.select();
    }
  });

  // 3. 監聽每一列最後一格的操作按鈕（原始列：橡皮擦歸零 / 新增列：刪除整列）
  tableBody.addEventListener('click', (e) => {
    // 原始匯入列 -> 橡皮擦按鈕（將該列 12 節次設為 0）
    const clearRowBtn = e.target.closest('.clear-periods-btn');
    if (clearRowBtn) {
      const idx = parseInt(clearRowBtn.dataset.index, 10);
      if (!isNaN(idx) && currentData[idx]) {
        currentData[idx].periods = Array(12).fill('0');
        renderTable();
        showAlert(`已將第 ${idx + 1} 筆資料的所有節次重設為 0`, 'info');
      }
      return;
    }

    // 手動新增列 -> 刪除按鈕（移除整列）
    const deleteRowBtn = e.target.closest('.delete-row-btn');
    if (deleteRowBtn) {
      const idx = parseInt(deleteRowBtn.dataset.index, 10);
      if (!isNaN(idx) && currentData[idx] && currentData[idx].isNew) {
        currentData.splice(idx, 1);
        renderTable();
        showAlert('已刪除該新增列', 'warning');
      }
    }
  });

  // 4. "+" 按鈕：新增一列全輸入框資料
  addRowBtn.addEventListener('click', handleAddRow);
  resetBtn.addEventListener('click', handleReset);
  downloadBtn.addEventListener('click', handleDownload);
}

// ==========================================
// 3. 字串切割核心邏輯（讀取 TXT 並拆解為欄位物件）
// ==========================================
function parseLineToRecord(line) {
  const match = line.match(/^(\S+)(\s+)(\S+)$/);
  if (!match) return null;

  const col1 = match[1];   // 範例: "11151" (5碼)
  const spaces = match[2]; // 範例: "  " (保留原始空格)
  const col2 = match[3];   // 範例: "012911510270222222220000" (23碼)

  if (col1.length < 5 || col2.length < 23) return null;

  return {
    isNew: false,                         // 標記為原始 TXT 資料（只能清除，不能刪除）
    grade: col1.substring(0, 1),          // 第 1 碼：年級 ("1")
    academicYear: col1.substring(1, 4),   // 第 2~4 碼：學年度 ("115") -> 隱藏保留
    semester: col1.substring(4, 5),       // 第 5 碼：學期 ("1") -> 隱藏保留
    spaces: spaces,                       // 中間空白
    classCode: col2.substring(0, 2),      // 第 1~2 碼：班級 ("01")
    seatNo: col2.substring(2, 4),         // 第 3~4 碼：座號 ("29")
    year: col2.substring(4, 7),           // 第 5~7 碼：民國年 ("115")
    month: col2.substring(7, 9),          // 第 8~9 碼：月 ("10")
    day: col2.substring(9, 11),           // 第 10~11 碼：日 ("27")
    periods: col2.substring(11, 23).split('') // 第 12~23 碼：12 個節次陣列
  };
}

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
      const record = parseLineToRecord(line);
      if (record) {
        currentData.push(record);
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
// 4. 新增一列（全輸入欄位，沿用檔案學年度/學期/日期預設值）
// ==========================================
function handleAddRow() {
  // 參考第一筆資料的學年度、學期、空白與日期作為預設值（方便連續建檔，亦可自由修改）
  const ref = currentData.length > 0 ? currentData[0] : null;

  const newRecord = {
    isNew: true, // 標記為手動新增列（全欄位可編輯，最後一格為刪除按鈕）
    grade: ref ? ref.grade : '1',
    academicYear: ref ? ref.academicYear : '115',
    semester: ref ? ref.semester : '1',
    spaces: ref ? ref.spaces : '  ',
    classCode: '',
    seatNo: '',
    year: ref ? ref.year : '115',
    month: ref ? ref.month : '01',
    day: ref ? ref.day : '01',
    periods: Array(12).fill('0')
  };

  currentData.push(newRecord);
  renderTable();

  // 自動聚焦到新增列的「班級」輸入框
  const newIndex = currentData.length - 1;
  const firstInput = tableBody.querySelector(`input[data-index="${newIndex}"][data-field="classCode"]`);
  if (firstInput) {
    firstInput.focus();
  }
}

// ==========================================
// 5. 渲染表格（區分原始匯入列 vs 手動新增列）
// ==========================================
function renderTable() {
  tableBody.innerHTML = '';

  if (currentData.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="18" class="text-center text-muted py-5">目前沒有資料，請點擊下方「新增一筆資料」</td>
      </tr>`;
  } else {
    currentData.forEach((row, index) => {
      // 產生 12 個獨立節次儲存格與各自文字輸入框（原始列與新增列皆適用）
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

      if (row.isNew) {
        // 【手動新增列】：年級、班級、座號、日期、12節次全部都是文字輸入框，最後一格為刪除按鈕
        tr.classList.add('table-primary', 'bg-opacity-10'); // 淡淡底色區分新增列
        tr.innerHTML = `
          <td class="text-primary fw-bold">${index + 1}</td>
          <td>
            <input type="text" maxlength="1" class="form-control form-control-sm new-input-1" 
                   data-index="${index}" data-field="grade" value="${escapeHtml(row.grade)}" placeholder="年級">
          </td>
          <td>
            <input type="text" maxlength="2" class="form-control form-control-sm new-input-2" 
                   data-index="${index}" data-field="classCode" value="${escapeHtml(row.classCode)}" placeholder="班">
          </td>
          <td>
            <input type="text" maxlength="2" class="form-control form-control-sm new-input-2" 
                   data-index="${index}" data-field="seatNo" value="${escapeHtml(row.seatNo)}" placeholder="號">
          </td>
          <td>
            <div class="date-group">
              <input type="text" maxlength="3" class="form-control form-control-sm date-input-y" 
                     data-index="${index}" data-field="year" value="${escapeHtml(row.year)}" placeholder="年">
              <span class="text-muted">/</span>
              <input type="text" maxlength="2" class="form-control form-control-sm date-input-md" 
                     data-index="${index}" data-field="month" value="${escapeHtml(row.month)}" placeholder="月">
              <span class="text-muted">/</span>
              <input type="text" maxlength="2" class="form-control form-control-sm date-input-md" 
                     data-index="${index}" data-field="day" value="${escapeHtml(row.day)}" placeholder="日">
            </div>
          </td>
          ${periodCellsHtml}
          <td>
            <button type="button" class="btn btn-outline-danger btn-sm delete-row-btn" 
                    data-index="${index}" title="刪除此新增列">
              <i class="bi bi-trash"></i>
            </button>
          </td>
        `;
      } else {
        // 【原始 TXT 列】：年級/班級/座號/日期為靜態文字，12節次為輸入框，最後一格為橡皮擦歸零
        const gradeNum = parseInt(row.grade, 10) || row.grade;
        const classNum = parseInt(row.classCode, 10) || row.classCode;
        const seatNum = parseInt(row.seatNo, 10) || row.seatNo;
        const dateStr = `${row.year}/${row.month}/${row.day}`;

        tr.innerHTML = `
          <td class="text-muted">${index + 1}</td>
          <td>${escapeHtml(String(gradeNum))}</td>
          <td>${escapeHtml(String(classNum))}</td>
          <td>${escapeHtml(String(seatNum))}</td>
          <td>${escapeHtml(dateStr)}</td>
          ${periodCellsHtml}
          <td>
            <button type="button" class="btn btn-outline-secondary btn-sm clear-periods-btn" 
                    data-index="${index}" title="將此列所有節次歸零">
              <i class="bi bi-eraser"></i>
            </button>
          </td>
        `;
      }

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
// 6. 重新組裝固定長度字串並下載新版 TXT（自動補零防呆）
// ==========================================
function handleDownload() {
  if (currentData.length === 0) {
    showAlert('目前沒有可匯出的資料！', 'warning');
    return;
  }

  // 檢查新增列是否有填寫班級與座號
  const invalidIdx = currentData.findIndex(r => String(r.classCode).trim() === '' || String(r.seatNo).trim() === '');
  if (invalidIdx !== -1) {
    showAlert(`第 ${invalidIdx + 1} 筆資料的「班級」或「座號」尚未填寫！`, 'danger');
    return;
  }

  const outputLines = currentData.map(row => {
    const g = String(row.grade).trim().slice(0, 1) || '1';
    const col1 = `${g}${row.academicYear}${row.semester}`;

    // 自動補零確保固定長度：班級(2碼)、座號(2碼)、年(3碼)、月(2碼)、日(2碼)
    const cls = String(row.classCode).trim().padStart(2, '0').slice(-2);
    const seat = String(row.seatNo).trim().padStart(2, '0').slice(-2);
    const y = String(row.year).trim().padStart(3, '0').slice(-3);
    const m = String(row.month).trim().padStart(2, '0').slice(-2);
    const d = String(row.day).trim().padStart(2, '0').slice(-2);
    const pStr = row.periods.map(p => (p && p.trim() !== '' ? p.trim().slice(0, 1) : '0')).join('');

    const col2 = `${cls}${seat}${y}${m}${d}${pStr}`;

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
// 7. 輔助工具函式
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
