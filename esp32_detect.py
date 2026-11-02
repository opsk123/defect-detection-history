"""
ESP32S3 카메라 영상 -> 결함 검출(YOLO26n) Gradio 앱 -> 결과 실시간 표시

  먼저 결함 검출 앱(http://127.0.0.1:7860)을 실행해 둔 상태에서 실행하세요.
  'Defect Detection' 창에서  Q 또는 ESC : 종료
"""
import os
import subprocess
import sys
import tempfile
import threading
import time

# 필요한 라이브러리가 없으면 자동 설치
for pkg, mod in (("opencv-python", "cv2"), ("gradio_client", "gradio_client")):
    try:
        __import__(mod)
    except ImportError:
        print(f"[설치] {pkg} 설치 중...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", pkg])

import cv2
from gradio_client import Client, handle_file

# ===== 설정 =====
CAMERA_URL = "http://172.26.180.36:81/stream"  # ESP32S3 카메라 주소
APP_URL = "http://127.0.0.1:7860"               # 결함 검출 앱 주소
MODEL = "best"                                  # "best" 또는 "last"
CONF = 0.25                                     # 신뢰도 임계값 (0.01 ~ 0.95)

latest_frame = None
running = True


def camera_loop():
    """카메라 영상을 계속 받아서 가장 최근 화면을 latest_frame 에 저장한다."""
    global latest_frame
    while running:
        cap = cv2.VideoCapture(CAMERA_URL)
        if not cap.isOpened():
            print(f"[카메라] {CAMERA_URL} 연결 실패, 3초 후 다시 시도")
            time.sleep(3)
            continue
        print("[카메라] 연결됨")
        while running:
            ok, frame = cap.read()
            if not ok:
                print("[카메라] 영상 끊김, 다시 연결합니다")
                break
            latest_frame = frame
        cap.release()


def detect(client, frame, tmp_path):
    """한 장면을 앱에 보내고 (결과 이미지, 검출 목록)을 돌려준다."""
    cv2.imwrite(tmp_path, frame)
    image_path, table, _ = client.predict(
        model_name=MODEL,
        image_path=handle_file(tmp_path),
        conf=CONF,
        api_name="/predict",
    )
    result = cv2.imread(image_path) if image_path else None
    rows = table.get("data", []) if isinstance(table, dict) else []
    return result, rows


def main():
    global running
    print(__doc__)
    try:
        client = Client(APP_URL, verbose=False)
    except Exception as e:
        print(f"[오류] 결함 검출 앱({APP_URL})에 연결할 수 없습니다: {e}")
        print("  - 앱을 먼저 실행했는지 확인하세요.")
        sys.exit(1)

    threading.Thread(target=camera_loop, daemon=True).start()
    tmp_path = os.path.join(tempfile.gettempdir(), "esp32_frame.jpg")
    last_count = None

    try:
        while running:
            if latest_frame is None:
                time.sleep(0.1)
                continue
            result, rows = detect(client, latest_frame.copy(), tmp_path)
            if result is not None:
                cv2.imshow("Defect Detection", result)
            if len(rows) != last_count:
                print(f"검출 {len(rows)}개: " + ", ".join(f"{r[0]}({r[1]})" for r in rows))
                last_count = len(rows)
            key = cv2.waitKey(1) & 0xFF
            if key in (ord("q"), 27):
                break
    except KeyboardInterrupt:
        pass
    finally:
        running = False
        cv2.destroyAllWindows()
        print("종료합니다.")


if __name__ == "__main__":
    main()
