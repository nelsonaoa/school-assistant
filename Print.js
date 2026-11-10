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
