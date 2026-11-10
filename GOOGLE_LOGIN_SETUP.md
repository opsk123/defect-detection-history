# Google 로그인 전환 준비

2026-11-10 확인: Google provider 활성화, Supabase 수집 연결 정상, 005 마이그레이션 운영 적용 완료. 최종 운영 주소는 GitHub Pages로 통일한다. 관리자는 소유자의 Google 이메일 확인 후 지정한다. 실제 사용자의 Google 로그인 완료 및 관리자 계정 지정은 별도 확인이 필요하다. 기존 공용 비밀번호 RPC는 전환 후 006으로 차단한다.

## 권한

- Google 로그인 사용자: 누적 기록, 상세, CSV, 검토 메모 조회.
- GitHub 저장소 소유자 opsk123에게 확인받은 Google 계정 한 개: 검토 메모 작성·수정.
- 모델 원본 판정·원본 이벤트는 이 웹에서 수정하지 않는다. 메모 변경 이력은 서버 감사 테이블에 보존한다.
- 관리자 판정은 서버의 보호된 UUID 매핑으로 수행한다. 브라우저 값, 이메일 입력, 사용자 수정 가능한 메타데이터, 첫 로그인 순서로 관리자 권한을 부여하지 않는다.
- Google 연결 계정의 GitHub 소유권을 자동 추정하지 않는다. 관리자가 확인한 계정만 SQL Editor에서 명시적으로 연결한다.

## 운영 전환 순서

1. GitHub 소유자에게 관리자 Google 이메일을 확인한다. Google Client Secret은 채팅이나 Git에 저장하지 않는다.
2. Google Cloud Console에서 웹 OAuth 클라이언트를 만들고 아래 설정을 적용한다.
   - JavaScript origin: `https://opsk123.github.io`
   - Redirect URI: `https://ygnynrpcismszflhysqr.supabase.co/auth/v1/callback`
   - Google 동의 화면을 외부 사용자에게 공개하려면 프로덕션 상태로 게시한다. 테스트 상태에서는 등록된 테스트 사용자만 로그인할 수 있다.
3. Supabase Authentication → Sign In / Providers → Google에 Client ID와 Secret을 저장하고 활성화한다.
4. Supabase URL Configuration의 Site URL과 허용 Redirect URL에 `https://opsk123.github.io/defect-detection-history/`를 추가한다. 기존 필요한 URL은 유지한다.
5. SQL Editor에서 `supabase/005_google_auth.sql`을 실행한다. 기존 003/004가 적용된 프로젝트가 전제다.
6. 새 페이지를 비운영 미리보기로 검증한다. 미리보기 URL도 Supabase Redirect URL에 정확하게 등록한다.
7. 소유자 Google 계정으로 한 번 로그인한다. `supabase/assign_google_owner.sql`의 이메일 자리를 확인된 소유자 이메일로 바꾸어 SQL Editor에서 실행한다. UUID 매핑은 서버에만 저장된다.
8. 소유자 메모 수정 성공, 일반 Google 사용자 조회 성공·수정 거부, 로그아웃 뒤 조회 거부, 토큰 갱신과 재로그인을 실제 계정으로 확인한다.
9. 검증된 브랜치를 main에 반영하여 GitHub Pages를 배포한다. 배포 확인 직후 `supabase/006_disable_password_login.sql`로 기존 비밀번호 RPC의 공개 실행 권한을 철회한다.

현재 공개 저장소에 이미 포함된 legacy-history 및 과거 정적 이미지/JSON의 공개 여부는 Google 로그인으로 변경되지 않는다. 새 인증은 Supabase 누적 검사 기록과 검토 메모에 적용된다.

## 검증

- `node tests/dashboard.test.mjs`: 세션 집계와 CSV 처리.
- `npm install --no-save @electric-sql/pglite` 후 `node tests/auth-permissions.cjs`: 로컬 PostgreSQL 엔진에서 SQL 적용, 비로그인 거부, Google 조회, 일반 사용자 수정 거부, 메타데이터 관리자 사칭 거부, 소유자 수정과 감사 기록, 비Google 세션 거부.
- 브라우저 검증: Google OAuth 호출, Bearer 토큰 조회, 관리자/조회 전용 UI, 메모 저장, 로그아웃 데이터 제거. 실제 Google 계정 연동 성공은 운영 설정 후 별도 검증해야 한다.

Supabase JS SDK 2.119.0은 npm 배포본의 UMD 빌드를 `docs/vendor/`에 고정해 포함했다. 라이선스도 함께 보관한다. 로그인은 PKCE이며 서버 서비스 역할 키는 클라이언트에 포함하지 않는다.

공식 설정 문서: https://supabase.com/docs/guides/auth/social-login/auth-google
