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
function readMemberRows_() {
  const sheet = getMemberSheet_();
  const lastRow = sheet.getLastRow();
  const totalMembers = Math.max(0, lastRow - 1); // 헤더 행 제외

  if (totalMembers === 0) {
    return { totalMembers: 0, signupDates: [], genders: [], birthdates: [], signupChannels: [] };
  }

  const signupDates = sheet.getRange(2, MEMBER_COL.SIGNUP_DATE, totalMembers, 1).getValues();
  const genders = sheet.getRange(2, MEMBER_COL.GENDER, totalMembers, 1).getValues();
  const birthdates = sheet.getRange(2, MEMBER_COL.BIRTHDATE, totalMembers, 1).getValues();
  const signupChannels = sheet.getRange(2, MEMBER_COL.SIGNUP_CHANNEL, totalMembers, 1).getValues();

  return { totalMembers, signupDates, genders, birthdates, signupChannels };
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
