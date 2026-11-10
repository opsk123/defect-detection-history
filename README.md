# ACCC 2단계 · 누적 검사 결과 웹앱

최종 운영 주소: https://opsk123.github.io/defect-detection-history/

기존 저장소 `opsk123/defect-detection-history`의 main 브랜치 `/docs`를 GitHub Pages로 배포합니다. 최종 2단계는 이 웹앱 하나이며 로컬 Streamlit과 이전 ChatGPT Sites는 최종 운영 대상이 아닙니다.

## 확정 구성

- 1단계 로컬 검사 프로그램 → Supabase 누적 이벤트 저장 → 2단계 웹 조회.
- Supabase 프로젝트: `ygnynrpcismszflhysqr` (analog-flow-guard).
- Google OAuth / PKCE 로그인. 비로그인 사용자는 누적 기록을 조회할 수 없습니다.
- Google 로그인 사용자는 조회 전용입니다. 저장소 소유자 opsk123가 확인한 Google 계정 하나만 서버 UUID로 관리자 지정합니다. 첫 가입자에게 권한을 자동 부여하지 않습니다.
- 관리자는 검토 메모를 수정하며 감사 이력을 남깁니다. 모델 원본 판정은 변경하지 않습니다.
- 기간·라인·판정 필터, 세션 집계, 상세, CSV, 자동 새로고침을 제공합니다. 최신 30일이 기본 조회 기간이며 이전 누적 데이터는 시작일을 변경해서 확인합니다. 조회 제한 20,000건은 화면의 일회 조회 한도이며 저장 보존 한도가 아닙니다.
- `검사 세션`과 `검사 기록`은 동일한 run_id 단위로 집계합니다. 가상 시연 데이터는 fixture로 구분하며 실제 검사와 구별합니다.
- 원본 이미지는 1단계 PC에 보관합니다. Supabase에는 판정·점수·좌표·메타데이터가 누적됩니다. 이미지 파일을 클라우드에 업로드하는 기능은 포함하지 않습니다.

## 배포 및 보안

Google 제공자 활성화와 데이터베이스 005 마이그레이션을 사용합니다. 운영 전환 후 006으로 기존 공용 비밀번호 RPC를 차단합니다. 관리자 지정과 구체적인 설정은 [GOOGLE_LOGIN_SETUP.md](GOOGLE_LOGIN_SETUP.md)를 참조하세요.

`docs/config.js`의 publishable 키는 공개용입니다. Google Client Secret, service_role 키, 관리자 자격 증명은 Git에 저장하지 않습니다. 역할 검사는 서버 RPC에서 수행합니다. 기존 정적 legacy 파일은 보존되어 있으므로 이미 공개된 과거 이미지/JSON에는 이 로그인 정책이 소급 적용되지 않습니다. 최종 화면에서는 legacy 링크를 제거했습니다.

## 검증

`node tests/dashboard.test.mjs` — 세션 집계·CSV.

`node tests/auth-permissions.cjs` — @electric-sql/pglite 설치 후 SQL 권한 검증.

Google 실제 사용자 로그인의 최종 성공 여부와 관리자 매핑 상태는 최종 운영 정리 파일을 확인하세요.
