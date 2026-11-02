"""YOLO26n 결함 검출 웹앱 (best / last 모델 선택, 신뢰도 임계값 조절).

실행: .venv\\Scripts\\python.exe app.py  ->  http://127.0.0.1:7860
ESP32S3 카메라 스트림(CAMERA_URL)을 입력으로 쓰는 '카메라로 검출' / '실시간 검출' 지원.
"""
import json
import os
import threading
import time
from datetime import datetime
import cv2
import numpy as np
import gradio as gr
import torch
from PIL import Image, ImageDraw, ImageFont
from ultralytics import YOLO

ROOT = os.path.dirname(os.path.abspath(__file__))
MODEL_PATHS = {
    "best": os.path.join(ROOT, "models", "yolo26n_defect_e50_best.pt"),
    "last": os.path.join(ROOT, "models", "yolo26n_defect_e50_last.pt"),
}
COLORS = {"sawing": (255, 140, 0), "fracture": (230, 40, 40), "splitting": (30, 144, 255)}
DEVICE = 0 if torch.cuda.is_available() else "cpu"
MODELS = {k: YOLO(p) for k, p in MODEL_PATHS.items()}
HIST_JSON = os.path.join(ROOT, "docs", "data", "history.json")
HIST_IMG = os.path.join(ROOT, "docs", "data", "img")
HIST_LOCK = threading.Lock()
MAX_HISTORY = 100
LOG_HISTORY = os.environ.get("LOG_HISTORY", "1") != "0"  # 실시간 검출 시 끄려면 LOG_HISTORY=0
CAMERA_URL ="http://172.26.180.36:81/stream"  # ESP32S3 카메라 (Serial Monitor 에 나온 IP)


class CameraStream:
    """ESP32 카메라 MJPEG 스트림을 백그라운드에서 계속 읽어 가장 최근 프레임만 보관한다."""

    def __init__(self):
        self.url = None
        self.frame = None
        self.lock = threading.Lock()
        self.thread = None

    def start(self, url):
        if url == self.url and self.thread and self.thread.is_alive():
            return
        with self.lock:
            self.url = url
            self.frame = None
        self.thread = threading.Thread(target=self._loop, args=(url,), daemon=True)
        self.thread.start()

    def _loop(self, url):
        while self.url == url:
            cap = cv2.VideoCapture(url)
            if not cap.isOpened():
                time.sleep(2)
                continue
            while self.url == url:
                ok, f = cap.read()
                if not ok:
                    break
                with self.lock:
                    if self.url == url:  # 주소가 바뀐 뒤 이전 스트림의 프레임은 버림
                        self.frame = f
            cap.release()

    def get(self, url, timeout=5):
        self.start(url)
        end = time.time() + timeout
        while time.time() < end:
            with self.lock:
                if self.frame is not None:
                    return self.frame.copy()
            time.sleep(0.05)
        return None


camera = CameraStream()


def load_image(path):
    return normalize(np.asarray(Image.open(path)).astype(np.float64))


def normalize(a):
    """학습 데이터와 동일하게 이미지별 min-max 정규화 후 8비트 흑백으로 변환한다 (16비트 원본 지원)."""
    if a.ndim == 3:
        a = a[..., :3].mean(axis=2)
    lo, hi = a.min(), a.max()
    a = (a - lo) / (hi - lo) * 255 if hi > lo else np.zeros_like(a)
    return Image.fromarray(np.round(a).astype(np.uint8), mode="L")


def draw(img, dets, scale):
    canvas = img.convert("RGB")
    canvas = canvas.resize((canvas.width * scale, canvas.height * scale), Image.NEAREST)
    d = ImageDraw.Draw(canvas)
    font = ImageFont.load_default(size=14)
    for name, conf, (x0, y0, x1, y1) in dets:
        c = COLORS.get(name, (0, 255, 0))
        box = [x0 * scale, y0 * scale, x1 * scale, y1 * scale]
        d.rectangle(box, outline=c, width=3)
        label = f"{name} {conf:.2f}"
        tb = d.textbbox((box[0], box[1]), label, font=font)
        ty = box[1] - (tb[3] - tb[1]) - 4 if box[1] > 20 else box[1]
        d.rectangle([box[0], ty, box[0] + tb[2] - tb[0] + 6, ty + tb[3] - tb[1] + 4], fill=c)
        d.text((box[0] + 3, ty), label, fill="white", font=font)
    return canvas


def predict(model_name, image_path, conf):
    if not image_path:
        return None, [], "이미지를 업로드하세요."
    return detect(model_name, load_image(image_path), conf)


def camera_predict(model_name, url, conf):
    frame = camera.get(url.strip())
    if frame is None:
        return None, [], f"카메라({url})에서 영상을 받지 못했습니다. IP 주소와 Wi-Fi 를 확인하세요."
    return detect(model_name, normalize(frame.astype(np.float64)), conf, " · ESP32 카메라")


def log_history(model_name, conf, source, dets, canvas, ms):
    """탐지 결과를 docs/data/history.json + 썸네일로 저장한다 (GitHub Pages 사이트가 읽는다)."""
    with HIST_LOCK:
        try:
            os.makedirs(HIST_IMG, exist_ok=True)
            try:
                with open(HIST_JSON, encoding="utf-8") as f:
                    hist = json.load(f)
            except (FileNotFoundError, ValueError):
                hist = []
            now = datetime.now()
            name = now.strftime("%Y%m%d_%H%M%S_%f") + ".jpg"
            thumb = canvas.copy()
            thumb.thumbnail((480, 480))
            thumb.save(os.path.join(HIST_IMG, name), quality=80)
            hist.insert(0, {
                "time": now.isoformat(timespec="seconds"),
                "model": model_name, "conf": round(conf, 2),
                "source": source.strip(" ·") or "업로드",
                "inference_ms": round(ms, 1), "image": f"data/img/{name}",
                "detections": [{"class": n, "conf": round(c, 3),
                                "box": [round(v, 1) for v in b]} for n, c, b in dets],
            })
            for old in hist[MAX_HISTORY:]:
                try:
                    os.remove(os.path.join(ROOT, "docs", old["image"]))
                except OSError:
                    pass
            with open(HIST_JSON, "w", encoding="utf-8") as f:
                json.dump(hist[:MAX_HISTORY], f, ensure_ascii=False, indent=1)
        except Exception as e:  # 이력 저장 실패가 검출 자체를 막지 않도록
            print("history 저장 실패:", e)


def detect(model_name, img, conf, source=""):
    r = MODELS[model_name].predict(img, conf=conf, device=DEVICE, verbose=False)[0]
    dets = []
    for b in r.boxes:
        x0, y0, x1, y1 = b.xyxy[0].tolist()
        dets.append((r.names[int(b.cls)], float(b.conf), (x0, y0, x1, y1)))
    dets.sort(key=lambda t: -t[1])
    scale = max(1, 1024 // img.width)
    rows = [[n, round(c, 3), round(x0, 1), round(y0, 1), round(x1 - x0, 1), round(y1 - y0, 1)]
            for n, c, (x0, y0, x1, y1) in dets]
    summary = f"모델: {model_name} · 임계값: {conf:.2f} · 검출 {len(dets)}개 · 추론 {r.speed['inference']:.1f} ms ({'GPU' if DEVICE == 0 else 'CPU'}){source}"
    canvas = draw(img, dets, scale)
    if LOG_HISTORY:
        log_history(model_name, conf, source, dets, canvas, r.speed["inference"])
    return canvas, rows, summary


with gr.Blocks(title="결함 검출 (YOLO26n)") as demo:
    gr.Markdown("## 결함 검출 · YOLO26n\nsawing / fracture / splitting — 모델을 고르고 사진을 넣으면 바운딩 박스를 그립니다.")
    with gr.Row():
        with gr.Column(scale=1):
            model_in = gr.Radio(["best", "last"], value="best", label="모델")
            image_in = gr.Image(type="filepath", label="입력 이미지 (8/16비트 PNG 등)", image_mode=None)
            conf_in = gr.Slider(0.01, 0.95, value=0.25, step=0.01, label="신뢰도 임계값 (confidence)")
            btn = gr.Button("검출", variant="primary")
            with gr.Accordion("ESP32 카메라", open=True):
                cam_url = gr.Textbox(CAMERA_URL, label="카메라 스트림 주소")
                cam_btn = gr.Button("카메라로 검출")
                cam_live = gr.Checkbox(False, label="실시간 검출 (0.5초마다)")
            cam_timer = gr.Timer(0.5, active=False)
        with gr.Column(scale=2):
            image_out = gr.Image(type="pil", label="검출 결과")
            info_out = gr.Markdown()
            table_out = gr.Dataframe(headers=["class", "conf", "x", "y", "width", "height"],
                                     label="검출 목록 (픽셀 좌표, 좌상단 기준)", interactive=False)
    inputs = [model_in, image_in, conf_in]
    outputs = [image_out, table_out, info_out]
    btn.click(predict, inputs, outputs)
    for comp in (model_in, image_in):
        comp.change(predict, inputs, outputs)
    conf_in.release(predict, inputs, outputs)

    cam_inputs = [model_in, cam_url, conf_in]
    cam_btn.click(camera_predict, cam_inputs, outputs)
    cam_live.change(lambda on: gr.Timer(active=on), cam_live, cam_timer)
    cam_timer.tick(camera_predict, cam_inputs, outputs, show_progress="hidden",
                   trigger_mode="always_last")

if __name__ == "__main__":
    demo.launch(server_name="127.0.0.1", server_port=7860, inbrowser=True)
