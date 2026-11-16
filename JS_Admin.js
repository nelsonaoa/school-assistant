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

      // 4. 渲染全校缺席總表 (網頁上保留刪除線與取消按鈕；列印時自動完全過濾已註銷項目避免表格崩塌)
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

          // 🎯 建立「螢幕顯示用」的完整記錄陣列（包含已註銷的項目，帶刪除線與取消按鈕）
          // 🎯 建立「列印專用」的過濾陣列（完全剔除已註銷的項目，確保列印表格絕對不壞掉）
          const screenRecords = student.records;
          const printRecords = student.records.filter(r => !r.cancelUser);

          // 如果該學生所有紀錄都被註銷且為列印模式，則直接跳過
          if (printRecords.length === 0) return; 

          // 產生畫面 HTML 的內部輔助函式
          const buildRecordsHtml = (recordsToRender, isPrintMode) => {
            let pHtml = '<div class="d-flex flex-column h-100">';
            let cHtml = '<div class="d-flex flex-column h-100">';
            let aHtml = '<div class="d-flex flex-column h-100">';

            recordsToRender.forEach((r, idx) => {
              const isLast = idx === recordsToRender.length - 1;
              const borderClass = isLast ? '' : 'border-bottom';
              
              const isCancelled = (r.cancelUser !== '');
              const statusDisplay = r.status; 
              
              const rowBgClass = (isCancelled && !isPrintMode) ? 'bg-light' : '';
              const statusTextColor = isCancelled ? 'text-muted text-decoration-line-through' : (r.status === '缺席' ? 'text-danger' : 'text-warning-emphasis');

              pHtml += `
                <div class="py-2 px-1 text-center ${borderClass} flex-fill d-flex align-items-center justify-content-center gap-2 ${rowBgClass}">
                  <span>第 ${r.period} 節</span>
                  <strong class="${statusTextColor}">${statusDisplay}</strong>
                </div>`;

              cHtml += `
                <div class="py-2 px-2 text-start ${borderClass} flex-fill d-flex align-items-center ${rowBgClass}">
                  <span>${r.courseName} <span class="text-muted small">(${r.teacher})</span></span>
                </div>`;

              if (!isPrintMode) {
                aHtml += `
                  <div class="py-2 px-2 text-center ${borderClass} flex-fill d-flex align-items-center justify-content-center ${rowBgClass}">
                    <button class="btn btn-sm ${isCancelled ? 'btn-outline-secondary' : 'btn-outline-danger'} py-0 px-3 fw-bold" 
                            onclick="toggleCancelRecord('${r.recordId}')">
                      ${isCancelled ? '取消' : '註銷'}
                    </button>
                  </div>`;
              }
            });

            pHtml += '</div>';
            cHtml += '</div>';
            aHtml += '</div>';
            return { pHtml, cHtml, aHtml };
          };

          // 螢幕上顯示的 HTML（包含已註銷項目並有取消按鈕）
          const screenHtml = buildRecordsHtml(screenRecords, false);

          const displayName = student.studentName || (student.studentId ? `學號 ${student.studentId}` : '未知學生');
          const displayClass = student.className || '-';
          const displaySeat = student.seatNum || '-';

          const tr = document.createElement('tr');
          // 🎯 透過 d-print-none 讓畫面版面顯示完整，而在 CSS print 時我們讓這行自動切換為乾淨的排版
          tr.innerHTML = `
            <td class="align-middle text-center">${displayClass}</td>
            <td class="align-middle text-center">${displaySeat}</td>
            <td class="align-middle text-center">${displayName}</td>
            <td class="p-0 align-middle">${screenHtml.pHtml}</td>
            <td class="p-0 align-middle">${screenHtml.cHtml}</td>
            <td class="p-0 align-middle d-print-none">${screenHtml.aHtml}</td>
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
