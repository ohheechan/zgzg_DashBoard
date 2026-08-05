/*************************************************
 * 설정값 (팀 공용)
 * - GA4_PROPERTY_ID: GA4 관리자 > 속성 설정 > 속성 ID (숫자만, "properties/" 접두사 제외)
 *   현재 TODO 상태 — 실제 숫자 값 확인 후 채워야 트래픽/개요 페이지가 정상 동작함
 * - MEMBER_SPREADSHEET_ID: 회원 정보가 담긴 Google Sheet ID
 *   트랙B(회원DB 자동화) 완료 전까지는 최근 수동 업로드된 CSV 스냅샷 시트를 가리키도록 임시 설정
 *************************************************/
const CONFIG = {
  GA4_PROPERTY_ID: 'TODO_숫자_속성ID_입력', // 예: '123456789' (GA4 관리자 화면에서 확인)
  MEMBER_SPREADSHEET_ID: 'TODO_회원_시트_ID_입력',
  SITE_NAME: '지글지글클럽 대시보드',
  TIMEZONE: 'Asia/Seoul',
};
