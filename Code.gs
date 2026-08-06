/*************************************************
 * 메인 라우터
 * URL 예: https://script.google.com/macros/s/xxx/exec?page=overview
 * page 파라미터: overview(기본값) | traffic | members | urlfilter
 *************************************************/
function doGet(e) {
  const page = (e && e.parameter && e.parameter.page) || 'overview';
  const allowedPages = ['overview', 'traffic', 'members', 'urlfilter'];
  const safePage = allowedPages.includes(page) ? page : 'overview';

  const template = HtmlService.createTemplateFromFile('Layout');
  template.activePage = safePage;
  template.baseUrl = ScriptApp.getService().getUrl();
  template.bodyContent = renderPageContent_(safePage);

  return template
    .evaluate()
    .setTitle(CONFIG.SITE_NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// 각 페이지의 본문 HTML을 렌더링해서 문자열로 반환
function renderPageContent_(page) {
  switch (page) {
    case 'overview':
      return HtmlService.createTemplateFromFile('Overview').evaluate().getContent();
    case 'traffic':
      return HtmlService.createTemplateFromFile('ComingSoon').evaluate().getContent();
    case 'members':
      return HtmlService.createTemplateFromFile('ComingSoon').evaluate().getContent();
    case 'urlfilter':
      return HtmlService.createTemplateFromFile('ComingSoon').evaluate().getContent();
    default:
      return '<p>페이지를 찾을 수 없습니다.</p>';
  }
}

// HTML 파일 안에서 다른 HTML 파일을 include할 때 사용 (예: <?!= include('Nav', {activePage: activePage, baseUrl: baseUrl}); ?>)
// data로 넘긴 값들은 include되는 파일 안에서도 <?= ?> 스크립틀릿으로 그대로 쓸 수 있음
function include(filename, data) {
  const tmpl = HtmlService.createTemplateFromFile(filename);
  if (data) {
    Object.keys(data).forEach(function (key) {
      tmpl[key] = data[key];
    });
  }
  return tmpl.evaluate().getContent();
}
