"""defect_dataset으로 YOLO26n 학습 (CUDA, 50 epoch, 그 외 Ultralytics 기본값).

학습 후 best.pt / last.pt 를 models/ 폴더에 이름을 붙여 복사하고,
두 모델을 test 세트로 평가해 models/results_summary.csv 에 저장한다.
"""
import csv, os, shutil
import torch
from ultralytics import YOLO

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ROOT, "defect_dataset", "defect_dataset.yaml")
RUN_NAME = "yolo26n_defect_e50"
MODELS = os.path.join(ROOT, "models")


def main():
    assert torch.cuda.is_available(), "CUDA를 사용할 수 없습니다."
    print("GPU:", torch.cuda.get_device_name(0))

    model = YOLO("yolo26n.pt")
    model.train(
        data=DATA,
        epochs=50,
        device=0,
        project=os.path.join(ROOT, "runs"),
        name=RUN_NAME,
        exist_ok=True,
    )

    weights = os.path.join(ROOT, "runs", RUN_NAME, "weights")
    os.makedirs(MODELS, exist_ok=True)
    rows = []
    for kind in ("best", "last"):
        dst = os.path.join(MODELS, f"{RUN_NAME}_{kind}.pt")
        shutil.copy2(os.path.join(weights, f"{kind}.pt"), dst)
        for split in ("val", "test"):
            m = YOLO(dst).val(data=DATA, split=split, device=0, plots=False,
                              project=os.path.join(ROOT, "runs"), name=f"{RUN_NAME}_{kind}_{split}", exist_ok=True)
            rows.append({"model": kind, "split": split,
                         "precision": m.box.mp, "recall": m.box.mr, "mAP50": m.box.map50, "mAP50-95": m.box.map,
                         **{f"mAP50-95_{n}": m.box.maps[i] for i, n in m.names.items()}})

    out = os.path.join(MODELS, "results_summary.csv")
    with open(out, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        for r in rows:
            w.writerow({k: (round(v, 4) if isinstance(v, float) else v) for k, v in r.items()})
    print("saved:", out)


if __name__ == "__main__":
    main()
