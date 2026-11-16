function printAdmin() 
{
  // 1. 抓取前台與後台主區塊
  const frontView = document.getElementById('frontView');
  const adminView = document.getElementById('adminView');
  const coursesSubTab = document.getElementById('adminSubTabCourses');
  const absentSubTab = document.getElementById('adminSubTabAbsent');

  // 2. 暫存原有的 display 狀態
  const oldFrontDisp = frontView ? frontView.style.display : '';
  const oldAdminDisp = adminView ? adminView.style.display : '';
  const oldCoursesDisp = coursesSubTab ? coursesSubTab.style.display : '';
  const oldAbsentDisp = absentSubTab ? absentSubTab.style.display : '';

  // 3. 強制隱藏前台與點名概況，只強行開啟缺曠報表
  if(frontView) frontView.style.display = 'none';
  if(adminView) adminView.style.display = 'block';
  if(coursesSubTab) coursesSubTab.style.display = 'none';
  if(absentSubTab) absentSubTab.style.display = 'block';

  // 4. 呼叫瀏覽器列印
  window.print();

  // 5. 列印視窗關閉後，立刻還原原本的顯示狀態
  setTimeout(() => 
  {
    if(frontView) frontView.style.display = oldFrontDisp;
    if(adminView) adminView.style.display = oldAdminDisp;
    if(coursesSubTab) coursesSubTab.style.display = oldCoursesDisp;
    if(absentSubTab) absentSubTab.style.display = oldAbsentDisp;
  }, 500);
}

function printFront() 
{
  const frontView = document.getElementById('frontView');
  const adminView = document.getElementById('adminView');

  const oldFrontDisp = frontView ? frontView.style.display : '';
  const oldAdminDisp = adminView ? adminView.style.display : '';

  if(frontView) frontView.style.display = 'block';
  if(adminView) adminView.style.display = 'none';

  window.print();

  setTimeout(() => 
  {
    if(frontView) frontView.style.display = oldFrontDisp;
    if(adminView) adminView.style.display = oldAdminDisp;
  }, 500);
}

function downloadAbsenceTxt() 
{
  if(!currentAdminAbsentList || currentAdminAbsentList.length === 0) 
  {
    showMessage('⚠️ 目前沒有可匯出的缺曠名單資料！', false);
    return;
  }

  const dateStr = currentAdminQueryDate || document.getElementById('adminQueryDate').value;
  if(!dateStr) 
  {
    showMessage('⚠️ 無法取得查詢日期！', false);
    return;
  }

  const dateParts = dateStr.split('-');
  if(dateParts.length !== 3) 
  {
    showMessage('⚠️ 日期格式錯誤，無法匯出 TXT！', false);
    return;
  }

  const adYear = parseInt(dateParts[0], 10);
  const monthNum = parseInt(dateParts[1], 10);
  const dayNum = parseInt(dateParts[2], 10);

  const rocYear = String(adYear - 1911).padStart(3, '0').slice(-3);
  const monthStr = String(monthNum).padStart(2, '0');
  const dayStr = String(dayNum).padStart(2, '0');

  const academicYearNum = (monthNum >= 8) ? (adYear - 1911) : (adYear - 1912);
  const academicYear = String(academicYearNum).padStart(3, '0').slice(-3);
  const semester = (monthNum >= 8 || monthNum === 1) ? '1' : '2';

  const statusCodeMap = {
    '出席': '0',
    '遲到': '1',
    '缺席': '2'
  };

  const outputLines = [];
  let skippedCount = 0;

  currentAdminAbsentList.forEach(student => {
    // 🎯 關鍵：只抓取未被註銷的紀錄來產生 TXT
    const activeRecords = student.records.filter(r => !r.cancelUser); 
    if (activeRecords.length === 0) return; // 如果該學生的紀錄全部被註銷，則略過

    const classDigits = String(student.className || '').replace(/\D/g, '');
    const seatDigits = String(student.seatNum || '').replace(/\D/g, '');

    if(classDigits.length < 3 || !seatDigits) 
    {
      skippedCount++;
      return;
    }

    const grade = classDigits.substring(0, 1);
    const classCode = classDigits.substring(1, 3);
    const seatNo = seatDigits.padStart(2, '0').slice(-2);

    // 13個節次預設皆為 '0' (出席)
    const periods = Array(13).fill('0');

    // 🎯 僅針對未註銷的紀錄填入狀態代碼（被註銷的會自動留在 '0'）
    activeRecords.forEach(r => {
      const pNum = parseInt(r.period, 10);
      const code = statusCodeMap[r.status] || '0';
      if(!isNaN(pNum) && pNum >= 1 && pNum <= 11) 
      {
        periods[pNum + 1] = code;
      }
      else if(String(r.period).includes('午休')) 
      {
        periods[0] = code;
      }
      else if(String(r.period).includes('早休') || String(r.period).includes('早自習')) 
      {
        periods[1] = code;
      }
    });

    const col1 = `${grade}${academicYear}${semester}`;
    const col2 = `${classCode}${seatNo}${rocYear}${monthStr}${dayStr}${periods.join('')}`;
    outputLines.push(`${col1}  ${col2}`);
  });

  if(outputLines.length === 0) 
  {
    showMessage('⚠️ 沒有符合格式（需含3碼班級與座號）的資料可匯出！', false);
    return;
  }

  const outputText = outputLines.join('\r\n');
  const blob = new Blob([outputText], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const schoolKey = (typeof getCurrentSchoolKey === 'function' && getCurrentSchoolKey()) ? getCurrentSchoolKey() : 'school';
  const a = document.createElement('a');
  a.href = url;
  a.download = `${schoolKey}_缺曠名單_${rocYear}${monthStr}${dayStr}.txt`;
  document.body.appendChild(a);
  a.click();

  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  if(skippedCount > 0) 
  {
    showMessage(`✅ 已下載 TXT（共 ${outputLines.length} 筆，略過 ${skippedCount} 筆班座格式不符資料）`, true);
  } 
  else 
  {
    showMessage(`✅ 缺曠名單 TXT 已下載（共 ${outputLines.length} 筆）！`, true);
  }
}
