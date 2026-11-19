"""Compare the G1 browser export with all five original full-precision outputs."""
import argparse
import json
from pathlib import Path
import time
import numpy as np
import onnxruntime as ort


def compare(model_dir, references):
    signature = json.loads((model_dir / "signature.json").read_text())
    opt = ort.SessionOptions()
    opt.intra_op_num_threads = 4
    opt.inter_op_num_threads = 1
    session = ort.InferenceSession(str(model_dir / "joystick.onnx"), opt, providers=["CPUExecutionProvider"])
    cases = {}
    for name, category in [("idle","idle"),("forward","walk_forward_medium"),("left","walk_left_medium"),
                           ("backward","walk_backward_slow"),("diagonal","walk_forward_left_medium")]:
        f = np.load(references / name / "custom_single.npz")
        assert f["names"].tolist() == signature["jointNames"]
        inputs = {"velocity": f["command"].astype(np.float32),
                  "category": np.array([signature["categories"].index(category)], dtype=np.int64)}
        start = time.monotonic()
        actual, world_rotations = session.run(["positions", "world_rotations"], inputs)
        assert actual.shape == f["joints"].shape and np.isfinite(actual).all()
        expected_rotations = f["world_body_rotations"]
        assert world_rotations.shape == expected_rotations.shape and np.isfinite(world_rotations).all()
        matrix_errors = np.linalg.norm(world_rotations-expected_rotations, axis=(-2,-1))
        angle_errors = np.rad2deg(2*np.arcsin(np.minimum(matrix_errors/np.sqrt(8),1)))
        errors = np.linalg.norm(actual - f["joints"], axis=-1)
        cases[name] = {"maxJointM": float(errors.max()), "maxRootM": float(errors[:,0].max()),
                       "maxRotationDegrees": float(angle_errors.max()), "meanJointM": float(errors.mean()), "seconds": time.monotonic()-start}
    print(json.dumps(cases, indent=2))
    return cases


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("model_dir", type=Path)
    p.add_argument("references", type=Path)
    a = p.parse_args()
    result = compare(a.model_dir, a.references)
    if any(x["maxJointM"] > .01 or x["maxRootM"] > .005 or x["maxRotationDegrees"] > .05 for x in result.values()):
        raise SystemExit(1)
