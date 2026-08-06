/*************************************************
 * 회원 리포트 데이터 헬퍼
 * 회원DB 시트(CONFIG.MEMBER_SPREADSHEET_ID)를 직접 조회함.
 * 이 시트는 별도의 "Members" Apps Script 프로젝트가 CSV를 반영해 갱신함
 * (트랙B 자동화 완료 전까지는 수동 실행 기준 — 최신 가입일시를 "데이터 기준일"로 표시함)
 *
 * 시트 컬럼 구조 (2026-08-06 확인):
 *   K(11열): 가입완료 일시
 *   AP(42열): 성별
 *   AQ(43열): 생년월일
 *   AU(47열): 가입경로
 *************************************************/

const MEMBER_COL = {
  SIGNUP_DATE: 11,
  GENDER: 42,
  BIRTHDATE: 43,
  SIGNUP_CHANNEL: 47,
};

// 회원DB 원본 데이터 캐시 설정 (약 2.6만행 시트를 매 요청마다 다시 읽지 않기 위함)
// 회원DB는 별도 프로젝트가 배치로 갱신하므로, 몇 분 정도의 지연은 허용 가능함
const MEMBER_ROWS_CACHE_PREFIX = 'memberRowsChunk_';
const MEMBER_ROWS_CACHE_META_KEY = 'memberRowsChunkCount';
const MEMBER_ROWS_CACHE_TTL_SECONDS = 300; // 5분
const MEMBER_ROWS_CACHE_CHUNK_SIZE = 30000; // CacheService 100KB/키 제한 대비 안전 마진(한글 등 멀티바이트 문자 고려)

function getMemberSheet_() {
  if (!CONFIG.MEMBER_SPREADSHEET_ID || CONFIG.MEMBER_SPREADSHEET_ID.indexOf('TODO') === 0) {
    throw new Error('MEMBER_SPREADSHEET_ID가 설정되지 않았습니다. Config.gs를 확인하세요.');
  }
  const ss = SpreadsheetApp.openById(CONFIG.MEMBER_SPREADSHEET_ID);
  const sheet = ss.getSheetByName(CONFIG.MEMBER_SHEET_NAME);
  if (!sheet) {
    throw new Error(`'${CONFIG.MEMBER_SHEET_NAME}' 시트를 찾을 수 없습니다.`);
  }
  return sheet;
}

// 회원DB 시트에서 필요한 4개 컬럼을 한 번에 읽어옴 (여러 함수가 공유해서 씀)
// 반복 호출 시 시트를 다시 읽지 않도록 짧게 캐싱함 (개요 탭에서 기간 변경/날짜 클릭마다 매번
// 2.6만행을 다시 스캔하면 체감 속도가 크게 느려지는 문제가 있었음)
function readMemberRows_() {
  const cached = readMemberRowsFromCache_();
  if (cached) return cached;

  const sheet = getMemberSheet_();
  const lastRow = sheet.getLastRow();
  const totalMembers = Math.max(0, lastRow - 1); // 헤더 행 제외

  let result;
  if (totalMembers === 0) {
    result = { totalMembers: 0, signupDates: [], genders: [], birthdates: [], signupChannels: [] };
  } else {
    const signupDates = sheet.getRange(2, MEMBER_COL.SIGNUP_DATE, totalMembers, 1).getValues();
    const genders = sheet.getRange(2, MEMBER_COL.GENDER, totalMembers, 1).getValues();
    const birthdates = sheet.getRange(2, MEMBER_COL.BIRTHDATE, totalMembers, 1).getValues();
    const signupChannels = sheet.getRange(2, MEMBER_COL.SIGNUP_CHANNEL, totalMembers, 1).getValues();
    result = { totalMembers, signupDates, genders, birthdates, signupChannels };
  }

  writeMemberRowsToCache_(result);
  return result;
}

// readMemberRows_() 결과를 CacheService에 저장 (100KB/키 제한 때문에 청크로 나눠 저장)
// 캐시 저장에 실패해도 치명적이지 않으므로 조용히 무시함 (다음 요청에서 시트를 다시 읽으면 됨)
function writeMemberRowsToCache_(result) {
  try {
    const flat = {
      totalMembers: result.totalMembers,
      signupDates: result.signupDates.map(function (r) { return r[0]; }),
      genders: result.genders.map(function (r) { return r[0]; }),
      birthdates: result.birthdates.map(function (r) { return r[0]; }),
      signupChannels: result.signupChannels.map(function (r) { return r[0]; }),
    };
    const json = JSON.stringify(flat);
    const cache = CacheService.getScriptCache();
    const chunkCount = Math.max(1, Math.ceil(json.length / MEMBER_ROWS_CACHE_CHUNK_SIZE));
    const payload = {};
    for (let i = 0; i < chunkCount; i++) {
      payload[MEMBER_ROWS_CACHE_PREFIX + i] = json.slice(
        i * MEMBER_ROWS_CACHE_CHUNK_SIZE,
        (i + 1) * MEMBER_ROWS_CACHE_CHUNK_SIZE
      );
    }
    payload[MEMBER_ROWS_CACHE_META_KEY] = String(chunkCount);
    cache.putAll(payload, MEMBER_ROWS_CACHE_TTL_SECONDS);
  } catch (err) {
    // 캐시 저장 실패는 무시 - 다음 요청에서 시트를 다시 읽으면 됨
  }
}

// 캐시에서 readMemberRows_() 결과를 복원. 캐시가 없거나 일부 청크가 만료됐으면 null 반환
function readMemberRowsFromCache_() {
  try {
    const cache = CacheService.getScriptCache();
    const countStr = cache.get(MEMBER_ROWS_CACHE_META_KEY);
    if (!countStr) return null;
    const count = Number(countStr);
    if (!count) return null;

    const keys = [];
    for (let i = 0; i < count; i++) keys.push(MEMBER_ROWS_CACHE_PREFIX + i);
    const chunks = cache.getAll(keys);

    let json = '';
    for (let i = 0; i < count; i++) {
      const chunk = chunks[MEMBER_ROWS_CACHE_PREFIX + i];
      if (chunk === undefined) return null; // 일부 청크가 만료되었으면 캐시 무효 처리
      json += chunk;
    }

    const flat = JSON.parse(json);
    return {
      totalMembers: flat.totalMembers,
      signupDates: flat.signupDates.map(function (v) { return [v]; }),
      genders: flat.genders.map(function (v) { return [v]; }),
      birthdates: flat.birthdates.map(function (v) { return [v]; }),
      signupChannels: flat.signupChannels.map(function (v) { return [v]; }),
    };
  } catch (err) {
    return null;
  }
}

function parseDate_(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate_(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function ageGroupOf_(birthDate, today) {
  let age = today.getFullYear() - birthDate.getFullYear();
  const hadBirthdayThisYear =
    today.getMonth() > birthDate.getMonth() ||
    (today.getMonth() === birthDate.getMonth() && today.getDate() >= birthDate.getDate());
  if (!hadBirthdayThisYear) age -= 1;
  if (age < 0 || age > 110) return '미상';
  if (age < 20) return '10대 이하';
  if (age < 30) return '20대';
  if (age < 40) return '30대';
  if (age < 50) return '40대';
  return '50대 이상';
}

// 성별/연령대/가입경로 카운트를 보기 좋은 정렬된 리스트로 변환하는 공용 헬퍼
function summarizeCounts_(genderCount, ageGroupCount, channelCount) {
  const genderList = Object.keys(genderCount)
    .map((k) => ({ label: k, count: genderCount[k] }))
    .sort((a, b) => b.count - a.count);

  const AGE_ORDER = ['10대 이하', '20대', '30대', '40대', '50대 이상', '미상'];
  const ageGroupList = AGE_ORDER.filter((k) => ageGroupCount[k]).map((k) => ({
    label: k,
    count: ageGroupCount[k],
  }));

  const channelList = Object.keys(channelCount)
    .map((k) => ({ label: k, count: channelCount[k] }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return { genderList, ageGroupList, channelList };
}

// 회원 리포트 페이지에서 클라이언트가 호출하는 진입점
function fetchMembersData() {
  try {
    const rows = readMemberRows_();
    const totalMembers = rows.totalMembers;

    if (totalMembers === 0) {
      return {
        ok: true,
        totalMembers: 0,
        lastSignupAt: null,
        signupTrend: [],
        genders: [],
        ageGroups: [],
        signupChannels: [],
      };
    }

    const { signupDates, genders, birthdates, signupChannels } = rows;

    // 최근 30일 가입 추이 집계용 맵 초기화
    const today = new Date();
    const trendMap = {};
    const cursor = new Date(today);
    cursor.setDate(cursor.getDate() - 29);
    for (let i = 0; i < 30; i++) {
      trendMap[formatDate_(cursor)] = 0;
      cursor.setDate(cursor.getDate() + 1);
    }

    let lastSignupAt = null;
    const genderCount = {};
    const ageGroupCount = {};
    const channelCount = {};

    for (let i = 0; i < totalMembers; i++) {
      const signupDate = parseDate_(signupDates[i][0]);
      if (signupDate) {
        if (!lastSignupAt || signupDate > lastSignupAt) lastSignupAt = signupDate;
        const key = formatDate_(signupDate);
        if (key in trendMap) trendMap[key] += 1;
      }

      const gender = String(genders[i][0] || '').trim();
      if (gender) genderCount[gender] = (genderCount[gender] || 0) + 1;

      const birthDate = parseDate_(birthdates[i][0]);
      if (birthDate) {
        const ageGroup = ageGroupOf_(birthDate, today);
        ageGroupCount[ageGroup] = (ageGroupCount[ageGroup] || 0) + 1;
      }

      const channel = String(signupChannels[i][0] || '').trim() || '기타';
      channelCount[channel] = (channelCount[channel] || 0) + 1;
    }

    const signupTrend = Object.keys(trendMap)
      .sort()
      .map((date) => ({ date: date, count: trendMap[date] }));

    const summary = summarizeCounts_(genderCount, ageGroupCount, channelCount);

    return {
      ok: true,
      totalMembers: totalMembers,
      lastSignupAt: lastSignupAt ? formatDate_(lastSignupAt) : null,
      signupTrend: signupTrend,
      genders: summary.genderList,
      ageGroups: summary.ageGroupList,
      signupChannels: summary.channelList,
    };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// 최근 N일간 날짜별 실제 가입자 수 맵 반환 ({ 'YYYY-MM-DD': count, ... })
// 개요 탭에서 GA4의 "새 사용자"(방문자 기준) 대신 실제 회원DB 가입 건수를 보여주기 위해 사용
function getSignupCountsByDate_(days) {
  const rows = readMemberRows_();
  const trendMap = {};
  const today = new Date();
  const cursor = new Date(today);
  const totalDays = days + 2; // GA4 쪽 날짜 범위(NdaysAgo~today, N+1일)를 넉넉히 덮도록 여유분 확보
  cursor.setDate(cursor.getDate() - (totalDays - 1));
  for (let i = 0; i < totalDays; i++) {
    trendMap[formatDate_(cursor)] = 0;
    cursor.setDate(cursor.getDate() + 1);
  }

  for (let i = 0; i < rows.totalMembers; i++) {
    const signupDate = parseDate_(rows.signupDates[i][0]);
    if (!signupDate) continue;
    const key = formatDate_(signupDate);
    if (key in trendMap) trendMap[key] += 1;
  }

  return trendMap;
}

// 특정 날짜(YYYY-MM-DD)에 가입한 회원들의 성별/연령대/가입경로 분석
function getMemberBreakdownForDate_(dateStr) {
  const rows = readMemberRows_();
  const genderCount = {};
  const ageGroupCount = {};
  const channelCount = {};
  let count = 0;
  const today = new Date();

  for (let i = 0; i < rows.totalMembers; i++) {
    const signupDate = parseDate_(rows.signupDates[i][0]);
    if (!signupDate || formatDate_(signupDate) !== dateStr) continue;
    count++;

    const gender = String(rows.genders[i][0] || '').trim();
    if (gender) genderCount[gender] = (genderCount[gender] || 0) + 1;

    const birthDate = parseDate_(rows.birthdates[i][0]);
    if (birthDate) {
      const ageGroup = ageGroupOf_(birthDate, today);
      ageGroupCount[ageGroup] = (ageGroupCount[ageGroup] || 0) + 1;
    }

    const channel = String(rows.signupChannels[i][0] || '').trim() || '기타';
    channelCount[channel] = (channelCount[channel] || 0) + 1;
  }

  const summary = summarizeCounts_(genderCount, ageGroupCount, channelCount);

  return {
    ok: true,
    date: dateStr,
    count: count,
    genders: summary.genderList,
    ageGroups: summary.ageGroupList,
    channels: summary.channelList,
  };
}

// 개요 탭에서 특정 날짜 클릭 시 클라이언트가 호출하는 진입점
function fetchMemberBreakdownForDate(dateStr) {
  try {
    return getMemberBreakdownForDate_(dateStr);
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// 최근 N일(오늘 포함, GA4의 "NdaysAgo~today"와 동일한 N+1일 범위) 동안 가입한 회원 전체의
// 성별/연령대/가입경로 분석 - 개요 탭에서 특정 날짜를 클릭하기 전, 기본으로 보여주는 기간 전체 요약용
function getMemberBreakdownForRange_(days) {
  const rows = readMemberRows_();
  const genderCount = {};
  const ageGroupCount = {};
  const channelCount = {};
  let count = 0;
  const today = new Date();

  const cutoff = new Date(today);
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - days);

  for (let i = 0; i < rows.totalMembers; i++) {
    const signupDate = parseDate_(rows.signupDates[i][0]);
    if (!signupDate || signupDate < cutoff) continue;
    count++;

    const gender = String(rows.genders[i][0] || '').trim();
    if (gender) genderCount[gender] = (genderCount[gender] || 0) + 1;

    const birthDate = parseDate_(rows.birthdates[i][0]);
    if (birthDate) {
      const ageGroup = ageGroupOf_(birthDate, today);
      ageGroupCount[ageGroup] = (ageGroupCount[ageGroup] || 0) + 1;
    }

    const channel = String(rows.signupChannels[i][0] || '').trim() || '기타';
    channelCount[channel] = (channelCount[channel] || 0) + 1;
  }

  const summary = summarizeCounts_(genderCount, ageGroupCount, channelCount);

  return {
    ok: true,
    days: days,
    count: count,
    genders: summary.genderList,
    ageGroups: summary.ageGroupList,
    channels: summary.channelList,
  };
}

// 개요 탭 진입/기간 변경 시 클라이언트가 호출하는 진입점 (기간 전체 가입 회원 요약)
function fetchMemberBreakdownForRange(days) {
  try {
    return getMemberBreakdownForRange_(days || 14);
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
