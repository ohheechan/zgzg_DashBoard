# 지글지글클럽 대시보드 (트랙A)

Google Data Studio를 대체하는 자체 웹앱 대시보드입니다. Google Apps Script Web App으로 동작하며,
이 저장소가 코드의 원본(source of truth)입니다. `main` 브랜치에 push되면 GitHub Actions가
자동으로 Apps Script 프로젝트에 반영합니다 (`clasp push` + `clasp deploy`).

## 폴더 구조
저장소 루트가 곧 Apps Script 프로젝트 루트입니다 (`.clasp.json`의 `rootDir`가 `"."`).
- `Code.gs` — 메인 라우터 (`doGet`)
- `Config.gs` — GA4 속성 ID, 회원 시트 ID 등 설정값
- `Analytics.gs` — GA4 Analytics Data API 조회 로직
- `Layout.html`, `Nav.html` — 공통 레이아웃/네비게이션
- `Overview.html` — 개요 페이지 (구현 완료)
- `ComingSoon.html` — 트래픽/회원/URL필터 페이지 (준비 중 placeholder)
- `.github/workflows/deploy.yml` — push 시 자동 배포용 GitHub Actions

## v1 페이지 구성
1. **개요** — 방문자 수 / 신규 가입자 수 추이 (구현 완료, GA4 연동 필요)
2. **트래픽 리포트** — 유입 채널, 인기 페이지, 디바이스/지역 분포 (준비 중)
3. **회원 리포트** — 가입 추이, 성별·연령대 (준비 중, 트랙B 완료 전까지 CSV 스냅샷 기준)
4. **URL 필터** — 특정 페이지 URL의 유입 수/유입 경로 (준비 중)

## 처음 세팅 시 해야 할 일 (체크리스트)
- [ ] `Config.gs`의 `GA4_PROPERTY_ID`를 실제 숫자 속성 ID로 교체 (GA4 관리자 > 속성 설정에서 확인)
- [ ] Apps Script 프로젝트 생성 후 `.clasp.json`의 `scriptId`를 실제 값으로 교체
- [ ] Apps Script 프로젝트에서 Web App으로 배포 (실행 계정: 나, 액세스: 모든 사용자)
- [ ] GitHub 저장소 Secrets에 `CLASP_CREDENTIALS` 등록 (로컬에서 `clasp login` 후 생성되는 `~/.clasprc.json` 내용) → 이후 push 시 자동 배포

## 접근 제어
로그인/비밀번호 없이 배포 링크만 아는 사람이 접근 가능합니다. 회원 개인정보가 포함되므로
**대시보드 링크를 외부에 공유하지 마세요.**
