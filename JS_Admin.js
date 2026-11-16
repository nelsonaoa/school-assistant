let currentAdminAbsentList = [];
let currentAdminQueryDate = '';

function switchAdminSubTab(tabName) 
{
  document.getElementById('tab-courses').classList.toggle('active', tabName === 'courses');
  document.getElementById('tab-absent').classList.toggle('active', tabName === 'absent');

  document.getElementById('adminSubTabCourses').style.display = (tabName === 'courses') ? 'block' : 'none';
  document.getElementById('adminSubTabAbsent').style.display = (tabName === 'absent') ? 'block' : 'none';
}

function loadAdminSummary() 
{
  const qDate = document.getElementById('adminQueryDate').value;
  if(!qDate) return;

  showMessage('⏳ 正在載入點名概況與缺曠名單...', true);

  callGasApi('getAdminSummary', { targetDate: qDate })
    .then(res => {
      if(!res || !res.success) 
      {
        showMessage(res ? res.message : '載入管理員資料失敗', false);
        return;
      }

      const queryDate = document.getElementById('adminQueryDate').value;
      const reportDateSpan = document.getElementById('absentReportDate');
      if(reportDateSpan) 
      {
        reportDateSpan.innerText = queryDate ? `(${queryDate})` : '';
      }

      const courseMap = {};
      if(res.schedules && res.schedules.length > 0) 
      {
        res.schedules.forEach(s => {
          if(!courseMap[s.courseCode]) 
          {
            courseMap[s.courseCode] = {
              courseCode: s.courseCode,
              courseName: s.courseName,
              teacher: s.teacher,
              periods: []
            };
          }
          courseMap[s.courseCode].periods.push(s);
        });
      }

      const cBody = document.getElementById('adminCourseTableBody');
      cBody.innerHTML = '';
      
      const courseList = Object.values(courseMap);
      if(courseList.length === 0) 
      {
        cBody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">該日期無任何開課排程</td></tr>';
      } 
      else 
      {
        courseList.forEach(c => {
          c.periods.sort((a, b) => parseInt(a.period, 10) - parseInt(b.period, 10));

          let statusHtml = '<div class="d-flex flex-column gap-2">';
          
          c.periods.forEach(p => {
            const isConfirmed = res.confirmMap && res.confirmMap[p.scheduleId];
            const confirmInfo = isConfirmed ? res.confirmMap[p.scheduleId] : null;

            let formattedTime = '';
            if(confirmInfo && confirmInfo.time) 
            {
              const d = new Date(confirmInfo.time);
              if(!isNaN(d.getTime())) 
              {
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                const hours = String(d.getHours()).padStart(2, '0');
                const minutes = String(d.getMinutes()).padStart(2, '0');
                formattedTime = `${month}-${day} ${hours}:${minutes}`;
              } 
              else 
              {
                formattedTime = confirmInfo.time.substring(5, 16);
              }
            }

            statusHtml += `
              <div class="py-1 border-bottom border-light">
                <div class="d-flex align-items-center gap-2 mb-1">
                  <span class="badge bg-secondary" style="min-width: 55px;">第 ${p.period} 節</span>
                  ${isConfirmed 
                    ? `<span class="badge bg-success">🟢 已點名</span>` 
                    : `<span class="badge bg-danger">🔴 未點名</span>`}
                </div>
                
                ${isConfirmed 
                  ? `<div class="small text-muted ps-1">` +
                      `<span class="fw-bold text-dark me-2">${confirmInfo.teacher || '點名人員'}</span>` +
                      `<span>${formattedTime}</span>` +
                    `</div>`
                  : ''}
              </div>
            `;
          });
          statusHtml += '</div>';

          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>
              <strong class="text-primary">${c.courseCode}</strong><br>
              <span class="fw-bold">${c.courseName}</span>
            </td>
            <td class="fw-bold">${c.teacher}</td>
            <td>${statusHtml}</td>
            <td class="align-middle">
              <button class="btn btn-outline-primary btn-sm fw-bold" onclick="inspectCourseFromAdmin('${c.courseCode}', '${qDate}')">
                🔎 點名單
              </button>
            </td>
          `;
          cBody.appendChild(tr);
        });
      }

      // 4. 渲染全校缺席總表 (🎯 核心優化：畫面與列印同步過濾已註銷項目，確保排版完美、不留空行)
      const aBody = document.getElementById('adminAbsentTableBody');
      aBody.innerHTML = '';
      currentAdminAbsentList = [];
      currentAdminQueryDate = queryDate;
      
      if(!res.absentList || res.absentList.length === 0) 
      {
        aBody.innerHTML = '<tr><td colspan="6" class="text-center text-success fw-bold py-3">🎉 目前尚無缺席、遲到紀錄！</td></tr>';
      } 
      else 
      {
        const studentMap = {};

        res.absentList.forEach(a => {
          const key = (a.studentId && a.studentId !== '-') 
            ? a.studentId 
            : `${a.className}_${a.seatNum}_${a.studentName}`;

          if(!studentMap[key]) 
          {
            studentMap[key] = {
              studentId: a.studentId || '',
              className: (a.className && a.className !== '-') ? a.className : '',
              seatNum: (a.seatNum && a.seatNum !== '-') ? a.seatNum : '',
              studentName: (a.studentName && a.studentName !== '未知學生') ? a.studentName : '',
              records: []
            };
          }
          else
          {
            if(!studentMap[key].className && a.className && a.className !== '-') studentMap[key].className = a.className;
            if(!studentMap[key].seatNum && a.seatNum && a.seatNum !== '-') studentMap[key].seatNum = a.seatNum;
            if((!studentMap[key].studentName || studentMap[key].studentName === '未知學生') && a.studentName && a.studentName !== '未知學生') studentMap[key].studentName = a.studentName;
          }

          studentMap[key].records.push({
            recordId: a.recordId || `${a.date}_${a.period}_${a.courseCode}`,
            period: a.period,
            courseName: a.courseName,
            teacher: a.teacher,
            status: a.status,
            cancelUser: a.cancelUser || ''
          });
        });

        const groupedList = Object.values(studentMap);
        groupedList.sort((x, y) => {
          const classCompare = String(x.className || '-').localeCompare(String(y.className || '-'), 'zh-Hant', { numeric: true });
          if(classCompare !== 0) return classCompare;

          const seatX = parseInt(x.seatNum, 10) || 0;
          const seatY = parseInt(y.seatNum, 10) || 0;
          return seatX - seatY;
        });

        currentAdminAbsentList = groupedList;

        groupedList.forEach(student => {
          student.records.sort((r1, r2) => (parseInt(r1.period, 10) || 0) - (parseInt(r2.period, 10) || 0));

          // 🎯 只保留「未被註銷」的紀錄來渲染畫面與列印（被註銷的直接不佔排版空間）
          const activeRecords = student.records.filter(r => !r.cancelUser);
          if (activeRecords.length === 0) return; 

          let periodsHtml = '<div class="d-flex flex-column h-100">';
          let coursesHtml = '<div class="d-flex flex-column h-100">';
          let actionsHtml = '<div class="d-flex flex-column h-100">';

          activeRecords.forEach((r, idx) => {
            const isLast = idx === activeRecords.length - 1;
            const borderClass = isLast ? '' : 'border-bottom';
            const statusTextColor = (r.status === '缺席' ? 'text-danger' : 'text-warning-emphasis');

            // 1. 節次與狀態欄
            periodsHtml += `
              <div class="py-2 px-1 text-center ${borderClass} flex-fill d-flex align-items-center justify-content-center gap-2">
                <span>第 ${r.period} 節</span>
                <strong class="${statusTextColor}">${r.status}</strong>
              </div>`;

            // 2. 課程名稱欄
            coursesHtml += `
              <div class="py-2 px-2 text-start ${borderClass} flex-fill d-flex align-items-center">
                <span>${r.courseName} <span class="text-muted small">(${r.teacher})</span></span>
              </div>`;

            // 3. 獨立的操作按鈕欄（提供「註銷」按鈕）
            actionsHtml += `
              <div class="py-2 px-2 text-center ${borderClass} flex-fill d-flex align-items-center justify-content-center d-print-none">
                <button class="btn btn-sm btn-outline-danger py-0 px-3 fw-bold" 
                        onclick="toggleCancelRecord('${r.recordId}')">
                  註銷
                </button>
              </div>`;
          });

          // 💡 為了讓後台管理員也能看到「已被註銷」的紀錄並隨時按「取消」把它們救回來，
          // 我們可以在下方額外列出該學生「已被註銷」的項目（或是透過一個收合區塊顯示）。
          // 這裡我們把已註銷的項目以灰階、帶「取消」按鈕的形式接在下方，或者教務人員通常會希望在後台看見：
          const cancelledRecords = student.records.filter(r => r.cancelUser);
          cancelledRecords.forEach(r => {
            periodsHtml += `
              <div class="py-2 px-1 text-center border-top flex-fill d-flex align-items-center justify-content-center gap-2 bg-light text-muted">
                <span>第 ${r.period} 節</span>
                <strong class="text-decoration-line-through">${r.status}</strong>
                <span class="badge bg-secondary">已註銷</span>
              </div>`;

            coursesHtml += `
              <div class="py-2 px-2 text-start border-top flex-fill d-flex align-items-center bg-light text-muted">
                <span class="text-decoration-line-through">${r.courseName} <small>(${r.teacher})</small></span>
              </div>`;

            actionsHtml += `
              <div class="py-2 px-2 text-center border-top flex-fill d-flex align-items-center justify-content-center bg-light d-print-none">
                <button class="btn btn-sm btn-outline-secondary py-0 px-3 fw-bold" 
                        onclick="toggleCancelRecord('${r.recordId}')">
                  取消
                </button>
              </div>`;
          });

          periodsHtml += '</div>';
          coursesHtml += '</div>';
          actionsHtml += '</div>';

          const displayName = student.studentName || (student.studentId ? `學號 ${student.studentId}` : '未知學生');
          const displayClass = student.className || '-';
          const displaySeat = student.seatNum || '-';

          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td class="align-middle text-center">${displayClass}</td>
            <td class="align-middle text-center">${displaySeat}</td>
            <td class="align-middle text-center">${displayName}</td>
            <td class="p-0 align-middle">${periodsHtml}</td>
            <td class="p-0 align-middle">${coursesHtml}</td>
            <td class="p-0 align-middle d-print-none">${actionsHtml}</td>
          `;
          aBody.appendChild(tr);
        });
      }

      showMessage('✅ 全校概況與缺席名單載入完畢！', true);
    })
    .catch(err => {
      showMessage('載入後台失敗: ' + err.message, false);
    });
}

/**
 * 觸發後端切換註銷狀態
 */
function toggleCancelRecord(recordId) 
{
  callGasApi('toggleCancelAttendance', { recordId: recordId })
    .then(res => {
      if (res.success) 
      {
        showMessage(res.message, true);
        loadAdminSummary(); 
      } 
      else 
      {
        showMessage(res.message || '操作失敗', false);
      }
    })
    .catch(err => {
      showMessage('通訊失敗: ' + err.message, false);
    });
}

function inspectCourseFromAdmin(courseCode, dateStr) 
{
  document.getElementById('attDate').value = dateStr;
  document.getElementById('courseSelect').value = courseCode;
  switchToFrontPage();
  loadAttendanceRoster();
}
