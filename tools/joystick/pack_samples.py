"""Package reviewed offline_generation.py output folders as static replay assets."""
import argparse
import hashlib
import json
from pathlib import Path
import numpy as np
from scipy.spatial.transform import Rotation


def pack(source, destination):
    destination.mkdir(parents=True, exist_ok=True)
    manifest = {"format": "int16le-world-xyz-mm", "fps": 25, "samples": [],
                "robot": "G1", "sourceCommit": "ee28815", "seed": 7,
                "initialSource": "230313/idle_loop_001__A267.bvh", "physics": False}
    for label in ("diagonal", "idle", "forward", "left", "backward"):
        path = source / label / "custom_single.npz"
        report = json.loads((path.parent / "report.json").read_text())
        with np.load(path, allow_pickle=False) as f:
            pos = f["joints"]
            names = f["names"].tolist()
            parents = f["parents"].tolist()
            if manifest["samples"]:
                assert names == manifest["jointNames"] and parents == manifest["parents"]
            assert pos.shape == (60, len(names), 3) and int(f["fps"]) == 25
            mm = np.rint(pos * 1000)
            assert np.isfinite(pos).all() and np.max(np.abs(mm)) < 32768
            manifest.update(jointNames=names, parents=parents,
                            xmlSha256=report["xml_sha256"],
                            checkpoints={key: entry["sha256"] for key, entry in report["checkpoints"].items()})
            (destination / (label + ".bin")).write_bytes(mm.astype("<i2").tobytes())
            quaternions = Rotation.from_matrix(f["world_body_rotations"].reshape(-1,3,3)).as_quat()
            (destination / (label + ".quat")).write_bytes(np.rint(quaternions * 32767).astype("<i2").tobytes())
            manifest["rotationFormat"] = "int16le-world-xyzw-snorm"
            manifest["samples"].append({"id": label, "frames": len(pos),
                                        "velocity": f["command"].tolist(),
                                        "meanVelocity": report["cases"][0]["mean_vxy"],
                                        "endpointError": report["cases"][0]["endpoint_error_m"],
                                        "sourceSha256": hashlib.sha256(path.read_bytes()).hexdigest()})
    (destination / "samples.json").write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    pack(args.source, args.destination)
