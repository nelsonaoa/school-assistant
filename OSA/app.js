// ==========================================
// 1. 全域狀態變數與必填欄位定義
// ==========================================
let currentData = [];       // 存放所有資料（主檔 A 及其整合修改後的內容）
let originalFileName = '';  // 記錄主檔 A 的原始檔名
let weekDates = [];         // 存放 7 天的日期結構
let availableGrades = [];   // 存放資料中出現的年級（如 ['1', '2', '3']）
let activeGrade = '';       // 目前選中的年級（如 '1'）
let activeDateStr = '';     // 目前選中的分頁日期（如 '115/10/27'）

const PERIOD_COUNT = 13;
const PERIOD_NAMES = ['午休', '早休', '第1節', '第2節', '第3節', '第4節', '第5節', '第6節', '第7節', '第8節', '第9節', '第10節', '第11節'];
const WEEKDAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'];
const GRADE_LABELS = { '1': '一年級', '2': '二年級', '3': '三年級' };

// 檢查必填的 4 個欄位（studentCode 為 5 碼班級座號）
const REQUIRED_FIELDS = [
  { key: 'studentCode', label: '班級座號（5碼）' },
  { key: 'year', label: '年' },
  { key: 'month', label: '月' },
  { key: 'day', label: '日' }
];

// DOM 元素快取
let dropZone, fileInput, selectFileBtn, uploadCard, editorCard;
let mergeFileBtn, mergeFileInput;
let gradeTabs, dayTabs, tableHead, tableBody, rowCount, tabRowCount, fileNameBadge, addRowBtn, resetBtn, downloadBtn, msgAlert;

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
  mergeFileBtn = document.getElementById('mergeFileBtn');
  mergeFileInput = document.getElementById('mergeFileInput');
  gradeTabs = document.getElementById('gradeTabs');
  dayTabs = document.getElementById('dayTabs');
  tableHead = document.getElementById('tableHead');
  tableBody = document.getElementById('tableBody');
  rowCount = document.getElementById('rowCount');
  tabRowCount = document.getElementById('tabRowCount');
  fileNameBadge = document.getElementById('fileNameBadge');
  addRowBtn = document.getElementById('addRowBtn');
  resetBtn = document.getElementById('resetBtn');
  downloadBtn = document.getElementById('downloadBtn');
  msgAlert = document.getElementById('msgAlert');
}

function bindEvents() {
  // 主檔 A 上傳
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

  // 第二個 TXT (B) 整合按鈕事件
  mergeFileBtn.addEventListener('click', () => {
    mergeFileInput.value = '';
    mergeFileInput.click();
  });

  mergeFileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) handleMergeFile(e.target.files[0]);
  });

  // 第一層：點擊年級分頁標籤切換年級
  gradeTabs.addEventListener('click', (e) => {
    const tabBtn = e.target.closest('.grade-tab-btn');
    if (!tabBtn) return;

    activeGrade = tabBtn.dataset.grade;

    // 切換年級時，若目前選中的日期在該年級沒有資料，則自動跳到該年級有資料的第一天
    const hasDataOnCurrentDay = currentData.some(
      r => getRowGrade(r) === activeGrade && getRowDateStr(r) === activeDateStr
    );
    if (!hasDataOnCurrentDay) {
      const firstDayWithData = weekDates.find(d =>
        currentData.some(r => getRowGrade(r) === activeGrade && getRowDateStr(r) === d.dateStr)
      );
      if (firstDayWithData) {
        activeDateStr = firstDayWithData.dateStr;
      }
    }

    renderGradeTabs();
    renderDayTabs();
    renderTable();
  });

  // 第二層：點擊七天分頁標籤切換日期
  dayTabs.addEventListener('click', (e) => {
    const tabBtn = e.target.closest('.day-tab-btn');
    if (!tabBtn) return;

    activeDateStr = tabBtn.dataset.dateStr;
    renderDayTabs();
    renderTable();
  });

  // 1. 表頭最上方「整欄清除」按鈕：僅將「目前年級 + 目前分頁當天」的指定節次設為 0
  tableHead.addEventListener('click', (e) => {
    const clearColBtn = e.target.closest('.clear-col-btn');
    if (!clearColBtn) return;

    const pIdx = parseInt(clearColBtn.dataset.pindex, 10);
    if (isNaN(pIdx) || currentData.length === 0) return;

    let affectedCount = 0;
    currentData.forEach(row => {
      if (getRowGrade(row) === activeGrade && getRowDateStr(row) === activeDateStr) {
        row.periods[pIdx] = '0';
        affectedCount++;
      }
    });

    if (affectedCount === 0) {
      showAlert(`${getGradeLabel(activeGrade)}在 ${activeDateStr} 沒有可清除的資料`, 'warning');
      return;
    }

    renderTable();
    showAlert(`已將【${getGradeLabel(activeGrade)}】${activeDateStr} 的「${PERIOD_NAMES[pIdx]}」整欄設為 0（共 ${affectedCount} 筆）`, 'info');
  });

  // 2. 監聽表格內所有輸入框的即時修改
  tableBody.addEventListener('input', (e) => {
    const target = e.target;
    const idx = parseInt(target.dataset.index, 10);
    if (isNaN(idx) || !currentData[idx]) return;

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

      const valTrim = target.value.trim();
      const isInvalid = fieldName === 'studentCode' ? valTrim.length !== 5 : valTrim === '';

      if (isInvalid) {
        target.classList.add('input-empty-error');
      } else {
        target.classList.remove('input-empty-error');
      }

      // 若修改了班級座號首碼（年級）或日期，即時同步更新上方兩層分頁標籤的筆數統計
      if (fieldName === 'studentCode') {
        if (valTrim.length >= 1) {
          currentData[idx].grade = valTrim.substring(0, 1);
        }
        updateAvailableGrades();
        renderGradeTabs();
        renderDayTabs();
      } else if (['year', 'month', 'day'].includes(fieldName)) {
        renderDayTabs();
      }
    }

    // B. 13 個節次輸入框修改
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
      if (val.length === 1 && pIdx < PERIOD_COUNT - 1) {
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
    // 原始匯入列 -> 橡皮擦按鈕（將該列 13 節次設為 0）
    const clearRowBtn = e.target.closest('.clear-periods-btn');
    if (clearRowBtn) {
      const idx = parseInt(clearRowBtn.dataset.index, 10);
      if (!isNaN(idx) && currentData[idx]) {
        currentData[idx].periods = Array(PERIOD_COUNT).fill('0');
        renderTable();
        showAlert('已將該筆資料的所有節次重設為 0', 'info');
      }
      return;
    }

    // 手動新增列 -> 刪除按鈕（移除整列）
    const deleteRowBtn = e.target.closest('.delete-row-btn');
    if (deleteRowBtn) {
      const idx = parseInt(deleteRowBtn.dataset.index, 10);
      if (!isNaN(idx) && currentData[idx] && currentData[idx].isNew) {
        currentData.splice(idx, 1);
        updateAvailableGrades();
        renderGradeTabs();
        renderDayTabs();
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
// 3. 年級、民國日期與雙層分頁產生邏輯
// ==========================================
function getRowGrade(row) {
  const code = String(row.studentCode || '').trim();
  if (code.length >= 1 && /^[0-9]$/.test(code[0])) {
    return code[0];
  }
  return String(row.grade || '1');
}

function getGradeLabel(gradeCode) {
  return GRADE_LABELS[gradeCode] || `${gradeCode}年級`;
}

function getRowDateStr(row) {
  const y = String(row.year).trim().padStart(3, '0').slice(-3);
  const m = String(row.month).trim().padStart(2, '0').slice(-2);
  const d = String(row.day).trim().padStart(2, '0').slice(-2);
  return `${y}/${m}/${d}`;
}

function updateAvailableGrades() {
  const gradeSet = new Set(['1', '2', '3']);
  currentData.forEach(row => {
    const g = getRowGrade(row);
    if (g) gradeSet.add(g);
  });
  availableGrades = Array.from(gradeSet).sort();
  if (!activeGrade || !availableGrades.includes(activeGrade)) {
    activeGrade = availableGrades[0] || '1';
  }
}

function buildWeekDatesFromData(dataList) {
  let baseDate = new Date();

  if (dataList.length > 0) {
    const sorted = [...dataList].sort((a, b) => getRowDateStr(a).localeCompare(getRowDateStr(b)));
    const first = sorted[0];
    const adYear = parseInt(first.year, 10) + 1911;
    const month = parseInt(first.month, 10) - 1;
    const day = parseInt(first.day, 10);
    const parsed = new Date(adYear, month, day);
    if (!isNaN(parsed.getTime())) {
      baseDate = parsed;
    }
  }

  const dayOfWeek = baseDate.getDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(baseDate);
  monday.setDate(baseDate.getDate() + diffToMonday);

  const days = [];
  for (let i = 0; i < 7; i++) {
    const cur = new Date(monday);
    cur.setDate(monday.getDate() + i);

    const rocYear = String(cur.getFullYear() - 1911).padStart(3, '0');
    const month = String(cur.getMonth() + 1).padStart(2, '0');
    const day = String(cur.getDate()).padStart(2, '0');
    const weekName = WEEKDAY_NAMES[cur.getDay()];
    const dateStr = `${rocYear}/${month}/${day}`;

    days.push({
      y: rocYear,
      m: month,
      d: day,
      dateStr: dateStr,
      shortDate: `${month}/${day}`,
      weekName: weekName
    });
  }
  return days;
}

// 渲染第一層：年級分頁
function renderGradeTabs() {
  gradeTabs.innerHTML = '';

  availableGrades.forEach(grade => {
    const count = currentData.filter(row => getRowGrade(row) === grade).length;
    const isActive = grade === activeGrade;

    const li = document.createElement('li');
    li.className = 'nav-item';
    li.innerHTML = `
      <button type="button" class="nav-link grade-tab-btn ${isActive ? 'active' : ''}" data-grade="${grade}">
        ${getGradeLabel(grade)}
        <span class="badge rounded-pill ${isActive ? 'bg-primary' : 'bg-secondary'} ms-1">${count}</span>
      </button>
    `;
    gradeTabs.appendChild(li);
  });
}

// 渲染第二層：七天分頁（統計目前選中 activeGrade 的每日筆數）
function renderDayTabs() {
  dayTabs.innerHTML = '';

  weekDates.forEach(dayObj => {
    const count = currentData.filter(
      row => getRowGrade(row) === activeGrade && getRowDateStr(row) === dayObj.dateStr
    ).length;
    const isActive = dayObj.dateStr === activeDateStr;

    const li = document.createElement('li');
    li.className = 'nav-item';
    li.innerHTML = `
      <button type="button" class="nav-link day-tab-btn ${isActive ? 'active' : ''}" data-date-str="${dayObj.dateStr}">
        ${dayObj.shortDate} (${dayObj.weekName})
        <span class="badge rounded-pill ${isActive ? 'bg-primary' : 'bg-secondary'} ms-1">${count}</span>
      </button>
    `;
    dayTabs.appendChild(li);
  });
}

// ==========================================
// 4. 字串切割與主檔(A)匯入邏輯 (col1 首位為年級, col2 共 24 碼)
// ==========================================
function parseLineToRecord(line) {
  const match = line.match(/^(\S+)(\s+)(\S+)$/);
  if (!match) return null;

  const col1 = match[1];
  const spaces = match[2];
  const col2 = match[3];

  if (col1.length < 5 || col2.length < 24) return null;

  const grade = col1.substring(0, 1);
  const classCode = col2.substring(0, 2);
  const seatNo = col2.substring(2, 4);

  return {
    isNew: false,
    grade: grade,
    studentCode: `${grade}${classCode}${seatNo}`, // 5 碼班級座號（如 "10129"）
    academicYear: col1.substring(1, 4),
    semester: col1.substring(4, 5),
    spaces: spaces,
    year: col2.substring(4, 7),
    month: col2.substring(7, 9),
    day: col2.substring(9, 11),
    periods: col2.substring(11, 24).split('') // 13 碼：午休、早休、第1~11節
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

    updateAvailableGrades();
    weekDates = buildWeekDatesFromData(currentData);

    // 預設選中第一個有資料的年級與日期
    const firstGradeWithData = availableGrades.find(g => currentData.some(r => getRowGrade(r) === g));
    if (firstGradeWithData) {
      activeGrade = firstGradeWithData;
    }
    const firstNonEmptyDay = weekDates.find(
      d => currentData.some(r => getRowGrade(r) === activeGrade && getRowDateStr(r) === d.dateStr)
    );
    activeDateStr = firstNonEmptyDay ? firstNonEmptyDay.dateStr : weekDates[0].dateStr;

    renderGradeTabs();
    renderDayTabs();
    renderTable();
    uploadCard.classList.add('d-none');
    editorCard.classList.remove('d-none');

    if (errorCount > 0) {
      showAlert(`載入 ${currentData.length} 筆資料（略過 ${errorCount} 筆格式不符的行）`, 'warning');
    } else {
      showAlert(`成功載入主檔「${file.name}」，共 ${currentData.length} 筆資料`);
    }
  };
  reader.readAsText(file, 'UTF-8');
}

// ==========================================
// 4-2. 第二個 TXT (B) 整合邏輯
// ==========================================
function handleMergeFile(file) {
  if (!file.name.toLowerCase().endsWith('.txt') && file.type !== 'text/plain') {
    showAlert('請上傳 .txt 格式的純文字檔案！', 'danger');
    return;
  }

  const reader = new FileReader();
  reader.onload = function(event) {
    const rawText = event.target.result;
    const lines = rawText.split(/\r?\n/).filter(line => line.trim() !== '');

    let mergedCount = 0;
    let appendedCount = 0;
    let errorCount = 0;

    const existingMap = new Map();
    currentData.forEach((row, index) => {
      const key = `${String(row.studentCode).trim()}-${getRowDateStr(row)}`;
      existingMap.set(key, index);
    });

    lines.forEach((line) => {
      const recordB = parseLineToRecord(line);
      if (!recordB) {
        errorCount++;
        return;
      }

      const keyB = `${String(recordB.studentCode).trim()}-${getRowDateStr(recordB)}`;

      if (existingMap.has(keyB)) {
        const targetIdx = existingMap.get(keyB);
        const recordA = currentData[targetIdx];
        let isModified = false;

        for (let p = 0; p < PERIOD_COUNT; p++) {
          const valB = recordB.periods[p];
          if (valB === '1' || valB === '2') {
            if (recordA.periods[p] !== valB) {
              recordA.periods[p] = valB;
              isModified = true;
            }
          }
        }
        if (isModified) {
          mergedCount++;
        }
      } else {
        if (currentData.length > 0) {
          recordB.spaces = currentData[0].spaces;
        }
        currentData.push(recordB);
        existingMap.set(keyB, currentData.length - 1);
        appendedCount++;
      }
    });

    updateAvailableGrades();
    if (weekDates.length === 0 && currentData.length > 0) {
      weekDates = buildWeekDatesFromData(currentData);
      activeDateStr = weekDates[0].dateStr;
    }

    renderGradeTabs();
    renderDayTabs();
    renderTable();

    let msg = `整合「${file.name}」完成：更新 ${mergedCount} 筆既有資料、新增 ${appendedCount} 筆資料`;
    if (errorCount > 0) {
      msg += `（略過 ${errorCount} 筆格式不符的行）`;
      showAlert(msg, 'warning');
    } else {
      showAlert(msg, 'success');
    }
  };
  reader.readAsText(file, 'UTF-8');
}

// ==========================================
// 5. 新增一列（自動帶入目前選中的年級與日期）
// ==========================================
function handleAddRow() {
  const ref = currentData.length > 0 ? currentData[0] : null;
  const activeDayObj = weekDates.find(d => d.dateStr === activeDateStr);

  const newRecord = {
    isNew: true,
    grade: activeGrade || '1',
    studentCode: activeGrade || '', // 預先帶入當前年級首碼（例如 '1'），方便直接接著打班級座號
    academicYear: ref ? ref.academicYear : '115',
    semester: ref ? ref.semester : '1',
    spaces: ref ? ref.spaces : '  ',
    year: activeDayObj ? activeDayObj.y : (ref ? ref.year : '115'),
    month: activeDayObj ? activeDayObj.m : (ref ? ref.month : '01'),
    day: activeDayObj ? activeDayObj.d : (ref ? ref.day : '01'),
    periods: Array(PERIOD_COUNT).fill('0')
  };

  currentData.push(newRecord);
  renderGradeTabs();
  renderDayTabs();
  renderTable();

  const newIndex = currentData.length - 1;
  const firstInput = tableBody.querySelector(`input[data-index="${newIndex}"][data-field="studentCode"]`);
  if (firstInput) {
    firstInput.focus();
    // 將游標移到年級首碼後方，方便直接輸入後4碼
    const len = firstInput.value.length;
    firstInput.setSelectionRange(len, len);
  }
}

// ==========================================
// 6. 渲染目前「年級 + 日期」的表格
// ==========================================
function renderTable() {
  tableBody.innerHTML = '';

  const filteredItems = currentData
    .map((row, originalIndex) => ({ row, originalIndex }))
    .filter(item => getRowGrade(item.row) === activeGrade && getRowDateStr(item.row) === activeDateStr);

  if (filteredItems.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="17" class="text-center text-muted py-5">
          <strong>${escapeHtml(getGradeLabel(activeGrade))}</strong> 在 <strong>${escapeHtml(activeDateStr)}</strong> 目前沒有出缺勤資料，可點擊下方「在本年級本日新增一筆資料」
        </td>
      </tr>`;
  } else {
    filteredItems.forEach((item, displayIdx) => {
      const row = item.row;
      const index = item.originalIndex;

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
          <td class="text-primary fw-bold">${displayIdx + 1}</td>
          <td>
            <input type="text" maxlength="5" class="form-control form-control-sm new-input-5 ${errCode}" 
                   data-index="${index}" data-field="studentCode" value="${escapeHtml(row.studentCode)}" placeholder="5碼班座">
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
          <td class="text-muted">${displayIdx + 1}</td>
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
  tabRowCount.textContent = filteredItems.length;
}

function handleReset() {
  currentData = [];
  weekDates = [];
  availableGrades = [];
  activeGrade = '';
  activeDateStr = '';
  fileInput.value = '';
  mergeFileInput.value = '';
  editorCard.classList.add('d-none');
  uploadCard.classList.remove('d-none');
}

// ==========================================
// 7. 檢查全週資料（自動切換年級與日期分頁定位錯誤）並打包下載新版 TXT
// ==========================================
function focusRecordRow(recordIndex, fieldKey = null) {
  const targetRow = currentData[recordIndex];
  if (!targetRow) return;

  const targetGrade = getRowGrade(targetRow);
  const targetDateStr = getRowDateStr(targetRow);
  let needRerender = false;

  if (availableGrades.includes(targetGrade) && activeGrade !== targetGrade) {
    activeGrade = targetGrade;
    needRerender = true;
  }
  if (weekDates.some(d => d.dateStr === targetDateStr) && activeDateStr !== targetDateStr) {
    activeDateStr = targetDateStr;
    needRerender = true;
  }

  if (needRerender) {
    renderGradeTabs();
    renderDayTabs();
    renderTable();
  }

  setTimeout(() => {
    const targetTr = tableBody.querySelector(`tr[data-row-index="${recordIndex}"]`);
    if (targetTr) {
      targetTr.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    const inputSelector = fieldKey
      ? `input[data-index="${recordIndex}"][data-field="${fieldKey}"]`
      : `tr[data-row-index="${recordIndex}"] input`;
    const targetInput = tableBody.querySelector(inputSelector);
    if (targetInput) {
      targetInput.focus();
    }
  }, 50);
}

function handleDownload() {
  if (currentData.length === 0) {
    showAlert('目前沒有可匯出的資料！', 'warning');
    return;
  }

  tableBody.querySelectorAll('tr.table-danger').forEach(tr => {
    tr.classList.remove('table-danger');
    const idx = parseInt(tr.dataset.rowIndex, 10);
    if (!isNaN(idx) && currentData[idx] && currentData[idx].isNew) {
      tr.classList.add('table-primary', 'bg-opacity-10');
    }
  });

  // 步驟 A：檢查全週所有資料的「班級座號(必須為5碼)、年、月、日」是否填寫完整
  for (let i = 0; i < currentData.length; i++) {
    const row = currentData[i];
    for (const field of REQUIRED_FIELDS) {
      const val = String(row[field.key]).trim();
      const isInvalid = field.key === 'studentCode' ? val.length !== 5 : val === '';

      if (isInvalid) {
        const gradeLabel = getGradeLabel(getRowGrade(row));
        const dateLabel = getRowDateStr(row);
        const msg = field.key === 'studentCode'
          ? `【${gradeLabel}】日期 ${dateLabel} 中有資料的「班級座號」必須為 5 碼數字！`
          : `【${gradeLabel}】日期 ${dateLabel} 中有資料的「${field.label}」尚未填寫！`;

        showAlert(msg, 'danger');
        focusRecordRow(i, field.key);
        return;
      }
    }
  }

  // 步驟 B：檢查全週是否有相同的「5碼班級座號 + 日期」重複資料
  const seenMap = new Map();
  for (let i = 0; i < currentData.length; i++) {
    const row = currentData[i];
    const code5 = String(row.studentCode).trim();
    const y     = String(row.year).trim().padStart(3, '0').slice(-3);
    const m     = String(row.month).trim().padStart(2, '0').slice(-2);
    const d     = String(row.day).trim().padStart(2, '0').slice(-2);

    const uniqueKey = `${code5}-${y}-${m}-${d}`;

    if (seenMap.has(uniqueKey)) {
      showAlert(
        `發現重複資料（班級座號 ${code5}，日期 ${y}/${m}/${d}），請檢查！`,
        'danger'
      );

      focusRecordRow(i);
      setTimeout(() => {
        const dupTr = tableBody.querySelector(`tr[data-row-index="${i}"]`);
        if (dupTr) {
          dupTr.classList.remove('table-primary', 'bg-opacity-10');
          dupTr.classList.add('table-danger');
        }
      }, 60);
      return;
    }

    seenMap.set(uniqueKey, i);
  }

  // 步驟 C：拆回固定長度字串格式並下載整週完整檔案（13 碼節次）
  const outputLines = currentData.map(row => {
    const code5 = String(row.studentCode).trim();
    const grade = code5.substring(0, 1);
    const classSeat = code5.substring(1, 5);

    const col1 = `${grade}${row.academicYear}${row.semester}`;

    const y = String(row.year).trim().padStart(3, '0').slice(-3);
    const m = String(row.month).trim().padStart(2, '0').slice(-2);
    const d = String(row.day).trim().padStart(2, '0').slice(-2);
    const pStr = row.periods.map(p => (p && p.trim() !== '' ? p.trim().slice(0, 1) : '0')).join('');

    const col2 = `${classSeat}${y}${m}${d}${pStr}`;

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
// 8. 輔助工具函式
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
