"""Prepare A3 visual transforms for the recorded G1 reference and tracking clips."""

import argparse
import base64
import hashlib
import json
from pathlib import Path

import mujoco as mj
import numpy as np
from scipy.spatial.transform import Rotation


def pack(source_xml, target_xml, public):
    g = mj.MjModel.from_xml_path(str(source_xml))
    a = mj.MjModel.from_xml_path(str(target_xml))
    gd = mj.MjData(g)
    ad = mj.MjData(a)
    mj.mj_kinematics(g, gd)
    manifest = json.loads((public / "joystick/samples.json").read_text())
    ids = [g.body(n).id for n in manifest["jointNames"]]
    target_ids = list(range(1, a.nbody))
    dest = public / "joystick/a3"
    names = [a.body(i).name for i in target_ids]
    (dest / "rig.json").write_text(
        json.dumps(
            dict(
                jointNames=names,
                xmlSha256=hashlib.sha256(target_xml.read_bytes()).hexdigest(),
            )
        )
    )

    def rot(q):
        return Rotation.from_quat(q[..., [1, 2, 3, 0]])

    hinges = []
    for index, idx in enumerate(ids[1:], 1):
        j = g.body_jntadr[idx]
        ancestor = g.body_parentid[idx]
        while ancestor not in ids:
            ancestor = g.body_parentid[ancestor]
        rest = rot(gd.xquat[ancestor]).inv() * rot(gd.xquat[idx])
        hinges.append(
            (
                index,
                ids.index(ancestor),
                rest,
                g.jnt_axis[j],
                a.joint(g.joint(j).name).id,
            )
        )

    def write(key, positions, quats):
        frames = len(quats)
        qpos = np.zeros((frames, a.nq))
        qpos[:, :3] = positions[:, 0]
        qpos[:, 3:7] = quats[:, 0, [3, 0, 1, 2]]
        for child, parent, rest, axis, j in hinges:
            rel = (
                rest.inv()
                * Rotation.from_quat(quats[:, parent]).inv()
                * Rotation.from_quat(quats[:, child])
            )
            qpos[:, a.jnt_qposadr[j]] = np.clip(rel.as_rotvec() @ axis, *a.jnt_range[j])
        packed = []
        for pose in qpos:
            ad.qpos[:] = pose
            mj.mj_kinematics(a, ad)
            ad.qpos[2] -= min(ad.site(n).xpos[2] for n in ("left_foot", "right_foot"))
            mj.mj_kinematics(a, ad)
            packed.append(
                np.c_[ad.xpos[target_ids], ad.xquat[target_ids][:, [1, 2, 3, 0]]]
            )
        np.array(packed, dtype="<f4").tofile(dest / (key + ".f32"))

    for sample in manifest["samples"]:
        key = sample["id"]
        pos = (
            np.fromfile(public / "joystick" / (key + ".bin"), dtype="<i2").reshape(
                -1, len(ids), 3
            )
            / 1000
        )
        quat = (
            np.fromfile(public / "joystick" / (key + ".quat"), dtype="<i2").reshape(
                -1, len(ids), 4
            )
            / 32767
        )
        write(key, pos, quat)
    pair = json.loads((public / "studio/paired-g1.json").read_text())
    assert pair["names"] == manifest["jointNames"]
    for key in ("reference", "actual"):
        state = np.frombuffer(base64.b64decode(pair[key]), dtype="<f4").reshape(
            -1, len(ids), 7
        )
        write("tracker-" + key, state[:, :, :3], state[:, :, 3:])


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    for name in ("source_xml", "target_xml", "public"):
        parser.add_argument(name, type=Path)
    args = parser.parse_args()
    pack(args.source_xml, args.target_xml, args.public)
