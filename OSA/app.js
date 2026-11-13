// ==========================================
// 1. 全域狀態變數與必填欄位定義
// ==========================================
let currentData = [];       // 存放所有資料（含原始匯入列與手動新增列）
let originalFileName = '';  // 記錄原始檔名

const PERIOD_NAMES = ['午休', '早休', '第1節', '第2節', '第3節', '第4節', '第5節', '第6節', '第7節', '第8節', '第9節', '第10節'];

// 檢查空值紅底的 6 個必填欄位
const REQUIRED_FIELDS = [
  { key: 'grade', label: '年級' },
  { key: 'classCode', label: '班級' },
  { key: 'seatNo', label: '座號' },
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

    // A. 新增列的 6 個基本欄位修改（年級、班級、座號、年、月、日）
    if (target.dataset.field) {
      const fieldName = target.dataset.field;
      currentData[idx][fieldName] = target.value;

      // 即時切換空值紅底狀態
      if (target.value.trim() === '') {
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
// 3. 字串切割核心邏輯（讀取 TXT 並拆解為欄位物件）
// ==========================================
function parseLineToRecord(line) {
  const match = line.match(/^(\S+)(\s+)(\S+)$/);
  if (!match) return null;

  const col1 = match[1];
  const spaces = match[2];
  const col2 = match[3];

  if (col1.length < 5 || col2.length < 23) return null;

  return {
    isNew: false,
    grade: col1.substring(0, 1),
    academicYear: col1.substring(1, 4),
    semester: col1.substring(4, 5),
    spaces: spaces,
    classCode: col2.substring(0, 2),
    seatNo: col2.substring(2, 4),
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
// 4. 新增一列（年級預設為空，沿用檔案學年度/學期/日期預設值）
// ==========================================
function handleAddRow() {
  const ref = currentData.length > 0 ? currentData[0] : null;

  const newRecord = {
    isNew: true,
    grade: '',                                 // 年級預設為空
    academicYear: ref ? ref.academicYear : '115',
    semester: ref ? ref.semester : '1',
    spaces: ref ? ref.spaces : '  ',
    classCode: '',                             // 班級預設為空
    seatNo: '',                                // 座號預設為空
    year: ref ? ref.year : '115',
    month: ref ? ref.month : '01',
    day: ref ? ref.day : '01',
    periods: Array(12).fill('0')
  };

  currentData.push(newRecord);
  renderTable();

  // 自動聚焦到新增列的「年級」輸入框
  const newIndex = currentData.length - 1;
  const firstInput = tableBody.querySelector(`input[data-index="${newIndex}"][data-field="grade"]`);
  if (firstInput) {
    firstInput.focus();
  }
}

// ==========================================
// 5. 渲染表格（空值套用 input-empty-error 紅底樣式）
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
        // 檢查 6 個必填欄位是否為空，若為空則加上紅色底色 class
        const errGrade = String(row.grade).trim() === '' ? 'input-empty-error' : '';
        const errClass = String(row.classCode).trim() === '' ? 'input-empty-error' : '';
        const errSeat  = String(row.seatNo).trim() === '' ? 'input-empty-error' : '';
        const errYear  = String(row.year).trim() === '' ? 'input-empty-error' : '';
        const errMonth = String(row.month).trim() === '' ? 'input-empty-error' : '';
        const errDay   = String(row.day).trim() === '' ? 'input-empty-error' : '';

        tr.classList.add('table-primary', 'bg-opacity-10');
        tr.innerHTML = `
          <td class="text-primary fw-bold">${index + 1}</td>
          <td>
            <input type="text" maxlength="1" class="form-control form-control-sm new-input-1 ${errGrade}" 
                   data-index="${index}" data-field="grade" value="${escapeHtml(row.grade)}" placeholder="年級">
          </td>
          <td>
            <input type="text" maxlength="2" class="form-control form-control-sm new-input-2 ${errClass}" 
                   data-index="${index}" data-field="classCode" value="${escapeHtml(row.classCode)}" placeholder="班">
          </td>
          <td>
            <input type="text" maxlength="2" class="form-control form-control-sm new-input-2 ${errSeat}" 
                   data-index="${index}" data-field="seatNo" value="${escapeHtml(row.seatNo)}" placeholder="號">
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
// 6. 檢查空值並打包下載新版 TXT
// ==========================================
function handleDownload() {
  if (currentData.length === 0) {
    showAlert('目前沒有可匯出的資料！', 'warning');
    return;
  }

  // 依序檢查所有資料的「年級、班級、座號、年、月、日」是否為空
  for (let i = 0; i < currentData.length; i++) {
    const row = currentData[i];
    for (const field of REQUIRED_FIELDS) {
      if (String(row[field.key]).trim() === '') {
        showAlert(`第 ${i + 1} 筆資料的「${field.label}」尚未填寫！`, 'danger');
        
        // 找到對應的輸入框並聚焦（focus）
        const targetInput = tableBody.querySelector(`input[data-index="${i}"][data-field="${field.key}"]`);
        if (targetInput) {
          targetInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
          targetInput.focus();
        }
        return; // 中斷下載
      }
    }
  }

  const outputLines = currentData.map(row => {
    const g = String(row.grade).trim().slice(0, 1);
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
