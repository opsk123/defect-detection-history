# 결함 탐지 (YOLO26n) + 탐지 이력 사이트

## GitHub 기반 누적 결과 웹 (2026-11-10)

- 운영 주소: https://opsk123.github.io/defect-detection-history/
- 배포 원본: 이 저장소의 `main` 브랜치, `/docs` 폴더. 커밋을 푸시하면 GitHub Pages가 반영합니다.
- 데이터: PC 검사 프로그램이 Supabase에 누적한 `accc_dashboard` 관측 기록을 조회합니다. 노트북의 임시 터널이나 ChatGPT Sites에 의존하지 않습니다.
- 접속: 기존 Streamlit 조회 비밀번호를 사용합니다. 비밀번호는 브라우저 메모리에만 유지하고 로그아웃 시 결과와 함께 지웁니다.
- 기능: 기간·라인·판정 필터, 모의/미실행 구분, 판정/결함 집계, 상세 결과, CSV 다운로드, 선택적 30초 갱신. 기간당 최대 20,000건이며 초과 시 기간을 좁힙니다.
- 기존 정적 이력은 `docs/legacy-history.html`에 보존했습니다. 기존 이미지와 JSON 데이터는 이동·삭제하지 않았습니다.

`docs/config.js`에는 공개 가능한 Supabase publishable 키만 들어 있습니다. 데이터 조회는 비밀번호를 검증하는 제한된 읽기 전용 RPC를 통합니다. 원본 테이블과 비밀번호 해시 테이블은 익명 사용자의 직접 접근을 차단합니다. 서버/서비스 역할 키와 실제 조회 비밀번호는 저장소에 넣지 않습니다. `supabase/003_pages_dashboard.sql`은 서버 관리자용 설정 템플릿이며 비밀번호 원문을 받지 않습니다.

이 배포는 누적 결과 조회 웹의 이전입니다. 기존 ChatGPT Sites의 사용자별 역할·검토 수정·D1/R2 공유 이미지 저장소와 브라우저 모델 추론은 이 조회 화면에 이식되지 않았으며 기존 사이트에 남아 있습니다. 기존 Sites 데이터 자체를 Supabase로 복제한 것은 아닙니다. PC에서 이미 Supabase로 전송한 결과를 표시합니다. Python Streamlit 앱은 별도로 유지합니다. GitHub Pages는 Python 서버를 실행하지 않으므로 새 화면은 HTML/JavaScript로 구현했습니다.

검증: `node tests/dashboard.test.mjs`. GitHub Pages 배포 후 비밀번호 로그인, CSV 다운로드, 결과 상세, 모의 데이터 필터와 로그아웃을 확인합니다.

## 기존 로컬 검출 앱과 파일 이력

sawing / fracture / splitting 결함을 YOLO26n 으로 검출하는 Gradio 앱과, 검출 이력을 보여 주는 GitHub Pages 사이트.

## 앱 실행
```
pip install ultralytics gradio opencv-python pillow torch
python app.py        # http://127.0.0.1:7860
```
검출할 때마다 `docs/data/history.json` 과 썸네일(`docs/data/img/`)에 이력이 최대 100건 저장됩니다.
실시간 검출(0.5초 주기)로 이력이 넘치는 것을 막으려면 `LOG_HISTORY=0` 환경변수로 끌 수 있습니다.

## 이력 사이트
`docs/index.html` 은 정적 페이지입니다(클래스 필터, 통계, 이미지 확대, 모델 성능표).
`publish_history.bat`(또는 `git add docs && git commit && git push`)로 이력을 올리면 Pages 가 갱신됩니다.

> 주의: 저장소가 공개이므로 이력 이미지도 공개됩니다. 올리면 안 되는 이미지는 `docs/data/img/` 에서 지운 뒤 푸시하세요.
