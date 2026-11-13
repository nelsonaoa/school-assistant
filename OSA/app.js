// ==========================================
// 1. 全域狀態變數與必填欄位定義
// ==========================================
let currentData = [];       // 存放所有資料（含原始匯入列與手動新增列）
let originalFileName = '';  // 記錄原始檔名

const PERIOD_NAMES = ['午休', '早休', '第1節', '第2節', '第3節', '第4節', '第5節', '第6節', '第7節', '第8節', '第9節', '第10節'];

// 檢查必填的 4 個欄位（studentCode 為 5 碼班級座號）
const REQUIRED_FIELDS = [
  { key: 'studentCode', label: '班級座號（5碼）' },
  { key: 'year', label: '年' },
  { key: 'month', label: '月' },
  { key: 'day', label: '日' }
];

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

    currentData.forEach(row => {
      row.periods[pIdx] = '0';
    });

    renderTable();
    showAlert(`已將「${PERIOD_NAMES[pIdx]}」整欄全部設為 0`, 'info');
  });

  // 2. 監聽表格內所有輸入框的即時修改
  tableBody.addEventListener('input', (e) => {
    const target = e.target;
    const idx = parseInt(target.dataset.index, 10);
    if (isNaN(idx) || !currentData[idx]) return;

    // 若該列先前被標記為重複錯誤底色，使用者一修改就先移除重複警示樣式
    const parentTr = target.closest('tr');
    if (parentTr && parentTr.classList.contains('table-danger')) {
      parentTr.classList.remove('table-danger');
      if (currentData[idx].isNew) {
        parentTr.classList.add('table-primary', 'bg-opacity-10');
      }
    }

    // A. 新增列的基本欄位修改（5碼班級座號、年、月、日）
    if (target.dataset.field) {
      const fieldName = target.dataset.field;
      currentData[idx][fieldName] = target.value;

      // 5碼班級座號必須滿5碼，其餘欄位不可為空，否則顯示紅底
      const valTrim = target.value.trim();
      const isInvalid = fieldName === 'studentCode' ? valTrim.length !== 5 : valTrim === '';

      if (isInvalid) {
        target.classList.add('input-empty-error');
      } else {
        target.classList.remove('input-empty-error');
      }
    }

    // B. 12 個節次輸入框修改
    if (target.classList.contains('period-input')) {
      const pIdx = parseInt(target.dataset.pindex, 10);
      const val = target.value.slice(0, 1);
      target.value = val;
      currentData[idx].periods[pIdx] = val;

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

  // 3. 監聽每一列最後一格的操作按鈕
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

  addRowBtn.addEventListener('click', handleAddRow);
  resetBtn.addEventListener('click', handleReset);
  downloadBtn.addEventListener('click', handleDownload);
}

// ==========================================
// 3. 字串切割核心邏輯（合併年級+班級+座號為 5 碼 studentCode）
// ==========================================
function parseLineToRecord(line) {
  const match = line.match(/^(\S+)(\s+)(\S+)$/);
  if (!match) return null;

  const col1 = match[1];
  const spaces = match[2];
  const col2 = match[3];

  if (col1.length < 5 || col2.length < 23) return null;

  const grade = col1.substring(0, 1);
  const classCode = col2.substring(0, 2);
  const seatNo = col2.substring(2, 4);

  return {
    isNew: false,
    studentCode: `${grade}${classCode}${seatNo}`, // 合成 5 碼數字 (如 "10129")
    academicYear: col1.substring(1, 4),
    semester: col1.substring(4, 5),
    spaces: spaces,
    year: col2.substring(4, 7),
    month: col2.substring(7, 9),
    day: col2.substring(9, 11),
    periods: col2.substring(11, 23).split('')
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
    const lines = rawText.split(/
?
/).filter(line => line.trim() !== '');
    
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
// 4. 新增一列（5 碼班級座號預設為空，沿用檔案學年度/學期/日期預設值）
// ==========================================
function handleAddRow() {
  const ref = currentData.length > 0 ? currentData[0] : null;

  const newRecord = {
    isNew: true,
    studentCode: '',                           // 5碼班級座號預設為空
    academicYear: ref ? ref.academicYear : '115',
    semester: ref ? ref.semester : '1',
    spaces: ref ? ref.spaces : '  ',
    year: ref ? ref.year : '115',
    month: ref ? ref.month : '01',
    day: ref ? ref.day : '01',
    periods: Array(12).fill('0')
  };

  currentData.push(newRecord);
  renderTable();

  // 自動聚焦到新增列的「班級座號」輸入框
  const newIndex = currentData.length - 1;
  const firstInput = tableBody.querySelector(`input[data-index="${newIndex}"][data-field="studentCode"]`);
  if (firstInput) {
    firstInput.focus();
  }
}

// ==========================================
// 5. 渲染表格（共 16 欄）
// ==========================================
function renderTable() {
  tableBody.innerHTML = '';

  if (currentData.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="16" class="text-center text-muted py-5">目前沒有資料，請點擊下方「新增一筆資料」</td>
      </tr>`;
  } else {
    currentData.forEach((row, index) => {
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
      tr.dataset.rowIndex = index;

      if (row.isNew) {
        const errCode  = String(row.studentCode).trim().length !== 5 ? 'input-empty-error' : '';
        const errYear  = String(row.year).trim() === '' ? 'input-empty-error' : '';
        const errMonth = String(row.month).trim() === '' ? 'input-empty-error' : '';
        const errDay   = String(row.day).trim() === '' ? 'input-empty-error' : '';

        tr.classList.add('table-primary', 'bg-opacity-10');
        tr.innerHTML = `
          <td class="text-primary fw-bold">${index + 1}</td>
          <td>
            <input type="text" maxlength="5" class="form-control form-control-sm new-input-5 ${errCode}" 
                   data-index="${index}" data-field="studentCode" value="${escapeHtml(row.studentCode)}" placeholder="班級座號">
          </td>
          <td>
            <div class="date-group">
              <input type="text" maxlength="3" class="form-control form-control-sm date-input-y ${errYear}" 
                     data-index="${index}" data-field="year" value="${escapeHtml(row.year)}" placeholder="年">
              <span class="text-muted">/</span>
              <input type="text" maxlength="2" class="form-control form-control-sm date-input-md ${errMonth}" 
                     data-index="${index}" data-field="month" value="${escapeHtml(row.month)}" placeholder="月">
              <span class="text-muted">/</span>
              <input type="text" maxlength="2" class="form-control form-control-sm date-input-md ${errDay}" 
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
        const dateStr = `${row.year}/${row.month}/${row.day}`;

        tr.innerHTML = `
          <td class="text-muted">${index + 1}</td>
          <td class="fw-medium">${escapeHtml(row.studentCode)}</td>
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
// 6. 檢查空值、長度與重複資料，並打包下載新版 TXT
// ==========================================
function handleDownload() {
  if (currentData.length === 0) {
    showAlert('目前沒有可匯出的資料！', 'warning');
    return;
  }

  // 清除先前的重複列警示底色
  tableBody.querySelectorAll('tr.table-danger').forEach(tr => {
    tr.classList.remove('table-danger');
    const idx = parseInt(tr.dataset.rowIndex, 10);
    if (!isNaN(idx) && currentData[idx] && currentData[idx].isNew) {
      tr.classList.add('table-primary', 'bg-opacity-10');
    }
  });

  // 步驟 A：檢查「班級座號(必須為5碼)、年、月、日」是否填寫完整
  for (let i = 0; i < currentData.length; i++) {
    const row = currentData[i];
    for (const field of REQUIRED_FIELDS) {
      const val = String(row[field.key]).trim();
      const isInvalid = field.key === 'studentCode' ? val.length !== 5 : val === '';

      if (isInvalid) {
        const msg = field.key === 'studentCode'
          ? `第 ${i + 1} 筆資料的「班級座號」必須為 5 碼數字（例如 10309）！`
          : `第 ${i + 1} 筆資料的「${field.label}」尚未填寫！`;

        showAlert(msg, 'danger');
        
        const targetInput = tableBody.querySelector(`input[data-index="${i}"][data-field="${field.key}"]`);
        if (targetInput) {
          targetInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
          targetInput.focus();
        }
        return; // 中斷下載
      }
    }
  }

  // 步驟 B：檢查是否有相同的「5碼班級座號 + 日期」重複資料
  const seenMap = new Map();
  for (let i = 0; i < currentData.length; i++) {
    const row = currentData[i];
    const code5 = String(row.studentCode).trim();
    const y     = String(row.year).trim().padStart(3, '0').slice(-3);
    const m     = String(row.month).trim().padStart(2, '0').slice(-2);
    const d     = String(row.day).trim().padStart(2, '0').slice(-2);

    const uniqueKey = `${code5}-${y}-${m}-${d}`;

    if (seenMap.has(uniqueKey)) {
      const firstIdx = seenMap.get(uniqueKey);

      showAlert(
        `第 ${i + 1} 筆資料與第 ${firstIdx + 1} 筆資料重複（${code5} - ${y}/${m}/${d}），請檢查！`,
        'danger'
      );

      const dupTr = tableBody.querySelector(`tr[data-row-index="${i}"]`);
      if (dupTr) {
        dupTr.classList.remove('table-primary', 'bg-opacity-10');
        dupTr.classList.add('table-danger');
        dupTr.scrollIntoView({ behavior: 'smooth', block: 'center' });

        const focusInput = dupTr.querySelector('input');
        if (focusInput) focusInput.focus();
      }
      return; // 中斷下載
    }

    seenMap.set(uniqueKey, i);
  }

  // 步驟 C：拆回固定長度字串格式並下載
  const outputLines = currentData.map(row => {
    const code5 = String(row.studentCode).trim();
    const grade = code5.substring(0, 1);     // 第1碼放回第一欄開頭
    const classSeat = code5.substring(1, 5); // 後4碼(班級2碼+座號2碼)放回第二欄開頭

    const col1 = `${grade}${row.academicYear}${row.semester}`;

    const y = String(row.year).trim().padStart(3, '0').slice(-3);
    const m = String(row.month).trim().padStart(2, '0').slice(-2);
    const d = String(row.day).trim().padStart(2, '0').slice(-2);
    const pStr = row.periods.map(p => (p && p.trim() !== '' ? p.trim().slice(0, 1) : '0')).join('');

    const col2 = `${classSeat}${y}${m}${d}${pStr}`;

    return `${col1}${row.spaces}${col2}`;
  });

  const outputText = outputLines.join('
');

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
  }, 4000);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
