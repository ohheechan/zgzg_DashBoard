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

// 최근 N일간 채널그룹별 세션수 (내림차순)
function getChannelBreakdown_(days) {
  const request = {
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
    dimensions: [{ name: 'sessionDefaultChannelGroup' }],
    metrics: [{ name: 'sessions' }],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
  };
  const response = AnalyticsData.Properties.runReport(request, `properties/${CONFIG.GA4_PROPERTY_ID}`);
  if (!response.rows) return [];
  return response.rows.map((row) => ({
    channel: row.dimensionValues[0].value,
    sessions: Number(row.metricValues[0].value),
  }));
}

// 최근 N일간 디바이스 카테고리별 세션수 (내림차순)
function getDeviceBreakdown_(days) {
  const request = {
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
    dimensions: [{ name: 'deviceCategory' }],
    metrics: [{ name: 'sessions' }],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
  };
  const response = AnalyticsData.Properties.runReport(request, `properties/${CONFIG.GA4_PROPERTY_ID}`);
  if (!response.rows) return [];
  return response.rows.map((row) => ({
    device: row.dimensionValues[0].value,
    sessions: Number(row.metricValues[0].value),
  }));
}

// 최근 N일간 인기 페이지 TOP limit (조회수 기준)
function getTopPages_(days, limit) {
  const request = {
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
    dimensions: [{ name: 'pagePath' }],
    metrics: [{ name: 'screenPageViews' }],
    orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
    limit: limit,
  };
  const response = AnalyticsData.Properties.runReport(request, `properties/${CONFIG.GA4_PROPERTY_ID}`);
  if (!response.rows) return [];
  return response.rows.map((row) => ({
    path: row.dimensionValues[0].value,
    views: Number(row.metricValues[0].value),
  }));
}

// 트래픽 리포트 페이지에서 클라이언트가 호출하는 진입점
function fetchTrafficData() {
  try {
    return {
      ok: true,
      channels: getChannelBreakdown_(14),
      devices: getDeviceBreakdown_(14),
      topPages: getTopPages_(14, 10),
    };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// 입력값이 전체 URL(https://...)이면 경로만 남기고, 아니면 그대로 사용
function normalizeUrlPath_(input) {
  let path = String(input || '').trim();
  if (/^https?:\/\//i.test(path)) {
    const withoutProtocol = path.replace(/^https?:\/\//i, '');
    const firstSlash = withoutProtocol.indexOf('/');
    path = firstSlash === -1 ? '/' : withoutProtocol.slice(firstSlash);
  }
  if (!path.startsWith('/')) path = '/' + path;
  return path;
}

// 특정 landingPage(유입 경로) 기준 요약 지표 (세션수/신규사용자수/조회수)
function getUrlFilterSummary_(path, days) {
  const request = {
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
    dimensions: [{ name: 'landingPage' }],
    metrics: [{ name: 'sessions' }, { name: 'newUsers' }, { name: 'screenPageViews' }],
    dimensionFilter: {
      filter: {
        fieldName: 'landingPage',
        stringFilter: { matchType: 'EXACT', value: path },
      },
    },
  };
  const response = AnalyticsData.Properties.runReport(request, `properties/${CONFIG.GA4_PROPERTY_ID}`);
  if (!response.rows || !response.rows.length) {
    return { sessions: 0, newUsers: 0, views: 0 };
  }
  const row = response.rows[0];
  return {
    sessions: Number(row.metricValues[0].value),
    newUsers: Number(row.metricValues[1].value),
    views: Number(row.metricValues[2].value),
  };
}

// 특정 landingPage(유입 경로) 기준 유입 채널 분석
function getUrlFilterChannels_(path, days) {
  const request = {
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
    dimensions: [{ name: 'sessionDefaultChannelGroup' }],
    metrics: [{ name: 'sessions' }],
    dimensionFilter: {
      filter: {
        fieldName: 'landingPage',
        stringFilter: { matchType: 'EXACT', value: path },
      },
    },
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
  };
  const response = AnalyticsData.Properties.runReport(request, `properties/${CONFIG.GA4_PROPERTY_ID}`);
  if (!response.rows) return [];
  return response.rows.map((row) => ({
    channel: row.dimensionValues[0].value,
    sessions: Number(row.metricValues[0].value),
  }));
}

// URL 필터 페이지에서 클라이언트가 호출하는 진입점
function fetchUrlFilterData(urlInput, days) {
  try {
    const path = normalizeUrlPath_(urlInput);
    return {
      ok: true,
      path: path,
      summary: getUrlFilterSummary_(path, days || 14),
      channels: getUrlFilterChannels_(path, days || 14),
    };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
