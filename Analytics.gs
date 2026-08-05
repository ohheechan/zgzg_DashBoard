/*************************************************
 * GA4 Analytics Data API 헬퍼
 * Apps Script 고급 서비스 "AnalyticsData"를 사용 (appsscript.json에 등록됨)
 * https://developers.google.com/apps-script/advanced/analyticsdata
 *************************************************/

// 최근 N일간 일자별 방문자수/신규가입자수(=신규 사용자수)를 배열로 반환
// 반환 형식: [{date:'2026-07-30', activeUsers: 123, newUsers: 45}, ...]
function getDailyOverviewMetrics_(days) {
  if (!CONFIG.GA4_PROPERTY_ID || CONFIG.GA4_PROPERTY_ID.indexOf('TODO') === 0) {
    throw new Error('GA4_PROPERTY_ID가 설정되지 않았습니다. Config.gs를 확인하세요.');
  }

  const request = {
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
    dimensions: [{ name: 'date' }],
    metrics: [{ name: 'activeUsers' }, { name: 'newUsers' }],
    orderBys: [{ dimension: { dimensionName: 'date' } }],
  };

  const response = AnalyticsData.Properties.runReport(
    request,
    `properties/${CONFIG.GA4_PROPERTY_ID}`
  );

  if (!response.rows) return [];

  return response.rows.map((row) => {
    const rawDate = row.dimensionValues[0].value; // YYYYMMDD
    const formatted = `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`;
    return {
      date: formatted,
      activeUsers: Number(row.metricValues[0].value),
      newUsers: Number(row.metricValues[1].value),
    };
  });
}

// 개요 페이지에서 클라이언트가 호출하는 진입점 (google.script.run으로 호출됨)
function fetchOverviewData() {
  try {
    const daily = getDailyOverviewMetrics_(14);
    return { ok: true, daily: daily };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
