# 결함 탐지 (YOLO26n) + 탐지 이력 사이트

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
