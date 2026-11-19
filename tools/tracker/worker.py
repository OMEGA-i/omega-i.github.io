"""Run the native G1 tracker on the exact world transforms supplied by the browser."""

import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

import mujoco
import numpy as np
from scipy.spatial.transform import Rotation


def encoded(array):
    return base64.b64encode(np.ascontiguousarray(array, dtype="<f4")).decode("ascii")


def decode(value, shape):
    result = np.frombuffer(base64.b64decode(value, validate=True), dtype="<f4").reshape(
        shape
    )
    if not np.isfinite(result).all():
        raise ValueError("Non-finite pose")
    return result


def package(folder, model, names, command):
    ids = [model.body(name).id for name in names]
    with np.load(folder / "body_states.npz") as measured:
        order = measured["body_names"].tolist()
        actual = measured["body_q"][:, [order.index(name) for name in names]]
    with np.load(folder / "reference50.npz") as ref:
        target = ref["qpos"]
    receipt = json.loads((folder / "result.json").read_text())
    count = len(actual)
    reference = np.empty((count, len(ids), 7))
    data = mujoco.MjData(model)
    for i, qpos in enumerate(target[:count]):
        data.qpos[:] = qpos
        mujoco.mj_kinematics(model, data)
        reference[i, :, :3] = data.xpos[ids]
        reference[i, :, 3:] = data.xquat[ids][:, [1, 2, 3, 0]]
    delta = np.linalg.norm(reference[:, 0, :2] - actual[:, 0, :2], axis=1)
    return {
        "fps": 50,
        "frames": count,
        "names": names,
        "velocity": command,
        "failed": bool(receipt["failed"]),
        "steps": receipt["steps"],
        "checkpoint": receipt["checkpoint_sha256"],
        "rmse": float(np.sqrt(np.mean(delta**2))),
        "endError": float(delta[-1]),
        "reference": encoded(reference),
        "actual": encoded(actual),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("config", type=Path)
    parser.add_argument("--existing", type=Path)
    args = parser.parse_args()
    cfg = json.loads(args.config.read_text())
    xml = Path(cfg["xml"])
    model = mujoco.MjModel.from_xml_path(str(xml))
    names = [model.body(i).name for i in sorted(set(map(int, model.jnt_bodyid)))]
    if args.existing:
        return package(args.existing, model, names, [0.8, 0.25])
    payload = json.load(sys.stdin)
    xml_hash = hashlib.sha256(xml.read_bytes()).hexdigest()
    if (
        payload["xmlSha256"] != xml_hash
        or payload["names"] != names
        or payload["fps"] != 25
    ):
        raise ValueError("Incompatible skeleton")
    command = np.asarray(payload["velocity"], dtype=float)
    if (
        command.shape != (2,)
        or not np.isfinite(command).all()
        or np.any(abs(command) > 2)
    ):
        raise ValueError("Invalid command")
    pos = decode(payload["positions"], (60, len(names), 3))
    if np.max(abs(pos)) > 20:
        raise ValueError("Position outside demo bounds")
    if payload["rotationFormat"] == "xyzw":
        quat = decode(payload["rotations"], (60 * len(names), 4))
        if np.max(abs(np.linalg.norm(quat, axis=1) - 1)) > 0.02:
            raise ValueError("Invalid quaternion")
        rot = Rotation.from_quat(quat).as_matrix().reshape(60, len(names), 3, 3)
    elif payload["rotationFormat"] == "matrix3":
        rot = decode(payload["rotations"], (60, len(names), 3, 3))
        if (
            np.max(abs(np.linalg.det(rot) - 1)) > 0.02
            or np.max(abs(rot @ rot.swapaxes(-1, -2) - np.eye(3))) > 0.02
        ):
            raise ValueError("Invalid rotation")
    else:
        raise ValueError("Unknown orientation convention")
    pg = Path(cfg["playground"])
    with tempfile.TemporaryDirectory(prefix="omega-studio-g1-") as work:
        path = Path(work)
        ref = path / "browser.npz"
        out = path / "run"
        np.savez(
            ref,
            joints=pos,
            world_body_rotations=rot,
            names=names,
            embodiment="g1",
            fps=25,
            xml_sha256=xml_hash,
            timestamps=np.arange(60) * 0.04,
        )
        env = dict(
            os.environ,
            PYTHONPATH=os.pathsep.join(
                [str(pg / "src"), str(Path(cfg["joystick"]) / "src")]
            ),
            PYTHONDONTWRITEBYTECODE="1",
        )
        subprocess.run(
            [
                sys.executable,
                str(pg / "examples/g1-diagonal/replay.py"),
                "--reference",
                str(ref),
                "--xml",
                str(xml),
                "--checkpoint",
                cfg["checkpoint"],
                "--tracker-python",
                cfg["trackerPython"],
                "--tracker-repo",
                cfg["trackerRepo"],
                "--output",
                str(out),
            ],
            env=env,
            stdout=sys.stderr,
            check=True,
            timeout=110,
        )
        return package(out, model, names, command.tolist())


if __name__ == "__main__":
    json.dump(main(), sys.stdout, separators=(",", ":"), allow_nan=False)
