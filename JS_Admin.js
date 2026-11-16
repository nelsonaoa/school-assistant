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

  showMessage('⏳ 正在載入點名單...', true);

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

      // 4. 渲染全校缺席總表
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

          let periodsHtml = '<div class="d-flex flex-column h-100">';
          let coursesHtml = '<div class="d-flex flex-column h-100">';
          let actionsHtml = '<div class="d-flex flex-column h-100">';

          student.records.forEach((r, idx) => {
            const isLast = idx === student.records.length - 1;
            const borderClass = isLast ? '' : 'border-bottom';
            
            const isCancelled = (r.cancelUser !== '');
            const statusDisplay = r.status; 
            
            // 已註銷項目加上淺灰色背景，並在列印時隱藏 (d-print-none)
            const rowPrintClass = isCancelled ? 'd-print-none bg-light' : '';
            const statusTextColor = isCancelled ? 'text-muted text-decoration-line-through' : (r.status === '缺席' ? 'text-danger' : 'text-warning-emphasis');
            const courseTextClass = isCancelled ? 'text-muted text-decoration-line-through' : '';

            // 1. 節次與狀態欄 (不帶任何灰色已註銷標籤文字)
            periodsHtml += `
              <div class="py-2 px-1 text-center ${borderClass} flex-fill d-flex align-items-center justify-content-center gap-2 ${rowPrintClass}">
                <span>第 ${r.period} 節</span>
                <strong class="${statusTextColor}">${statusDisplay}</strong>
              </div>`;

            // 2. 課程名稱欄
            coursesHtml += `
              <div class="py-2 px-2 text-start ${borderClass} flex-fill d-flex align-items-center ${rowPrintClass}">
                <span class="${courseTextClass}">${r.courseName} <span class="small">(${r.teacher})</span></span>
              </div>`;

            // 3. 獨立的操作按鈕欄
            actionsHtml += `
              <div class="py-2 px-2 text-center ${borderClass} flex-fill d-flex align-items-center justify-content-center d-print-none ${rowPrintClass}">
                <button class="btn btn-sm ${isCancelled ? 'btn-outline-secondary' : 'btn-outline-danger'} py-0 px-3 fw-bold" 
                        onclick="toggleCancelRecord('${r.recordId}')">
                  ${isCancelled ? '取消' : '註銷'}
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
  showMessage('⏳ 正在更新註銷狀態...', true);
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
