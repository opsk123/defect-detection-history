"""원본 YAML 라벨 데이터를 Ultralytics YOLO 데이터셋 구조로 변환한다.

- 16비트 PNG -> 이미지별 min-max 정규화 후 8비트 흑백 PNG
- YAML(픽셀, 좌상단 기준) -> YOLO txt(정규화 cx cy w h)
- 클래스 재매핑: sawing 0, fracture 1, splitting 2
- fracture/_labels 와 중복된 이미지는 두 라벨을 합친다
- 라벨 없는 이미지와 macOS ._ 파일은 제외
- 클래스별 층화 70/20/10 (train/val/test) 분할
"""
import os, random, shutil, zipfile
import numpy as np
import yaml
from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
NAME = "defect_dataset"
OUT = os.path.join(ROOT, NAME)
SOURCES = [("sawing images", "sawing"), ("fracture", "fracture"), ("splitting images", "splitting")]
CLASSES = ["sawing", "fracture", "splitting"]
RATIOS = {"train": 0.7, "val": 0.2, "test": 0.1}
SEED = 42


def load_boxes(path):
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f).get("boxes") or []


def to_8bit(path):
    a = np.asarray(Image.open(path)).astype(np.float64)
    lo, hi = a.min(), a.max()
    a = (a - lo) / (hi - lo) * 255 if hi > lo else np.zeros_like(a)
    return Image.fromarray(np.round(a).astype(np.uint8), mode="L")


def collect():
    items = []  # (class_name, src_dir, stem, boxes)
    for d, cls in SOURCES:
        src = os.path.join(ROOT, d)
        for f in sorted(os.listdir(src)):
            if f.startswith("._") or not f.endswith(".yaml"):
                continue
            stem = f[:-5]
            if not os.path.exists(os.path.join(src, stem + ".png")):
                continue
            boxes = load_boxes(os.path.join(src, f))
            dup = os.path.join(src, "_labels", f)
            if os.path.exists(dup):
                boxes = boxes + load_boxes(dup)
            if boxes:
                items.append((cls, src, stem, boxes))
    return items


def yolo_lines(boxes, w, h):
    lines = []
    for b in boxes:
        x0, y0 = max(b["x"], 0), max(b["y"], 0)
        x1, y1 = min(b["x"] + b["width"], w), min(b["y"] + b["height"], h)
        if x1 <= x0 or y1 <= y0:
            continue
        cid = CLASSES.index(b["class"])
        lines.append(f"{cid} {(x0 + x1) / 2 / w:.6f} {(y0 + y1) / 2 / h:.6f} {(x1 - x0) / w:.6f} {(y1 - y0) / h:.6f}")
    return lines


def main():
    items = collect()
    rng = random.Random(SEED)
    split_of = {}
    for cls in CLASSES:
        group = [it for it in items if it[0] == cls]
        rng.shuffle(group)
        n_tr = round(len(group) * RATIOS["train"])
        n_va = round(len(group) * RATIOS["val"])
        for i, it in enumerate(group):
            split_of[(it[0], it[2])] = "train" if i < n_tr else "val" if i < n_tr + n_va else "test"

    if os.path.exists(OUT):
        for e in os.listdir(OUT):
            p = os.path.join(OUT, e)
            shutil.rmtree(p) if os.path.isdir(p) else os.remove(p)
    for s in RATIOS:
        os.makedirs(os.path.join(OUT, "images", s))
        os.makedirs(os.path.join(OUT, "labels", s))

    counts = {s: {c: 0 for c in CLASSES} for s in RATIOS}
    for cls, src, stem, boxes in items:
        split = split_of[(cls, stem)]
        out_stem = f"{cls}_{stem}"
        im = to_8bit(os.path.join(src, stem + ".png"))
        im.save(os.path.join(OUT, "images", split, out_stem + ".png"))
        with open(os.path.join(OUT, "labels", split, out_stem + ".txt"), "w") as f:
            f.write("\n".join(yolo_lines(boxes, im.width, im.height)) + "\n")
        counts[split][cls] += 1

    with open(os.path.join(OUT, NAME + ".yaml"), "w", encoding="utf-8") as f:
        f.write("train: images/train\nval: images/val\ntest: images/test\n\nnames:\n")
        for i, c in enumerate(CLASSES):
            f.write(f"  {i}: {c}\n")

    zpath = os.path.join(ROOT, NAME + ".zip")
    with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED) as z:
        for dp, _, fs in os.walk(OUT):
            for fn in fs:
                full = os.path.join(dp, fn)
                z.write(full, os.path.relpath(full, ROOT))

    for s in RATIOS:
        print(s, counts[s], sum(counts[s].values()))
    print("total", len(items), "->", zpath)


if __name__ == "__main__":
    main()
