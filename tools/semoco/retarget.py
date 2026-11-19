"""Fit a newly generated Y-up SOMA sequence to the robot's joints for kinematic replay."""
import argparse
import json
from pathlib import Path

import mujoco as mj
import numpy as np

parser = argparse.ArgumentParser()
for arg in ["motion", "robot", "output"]:
    parser.add_argument(arg, type=Path)
args = parser.parse_args()
clip = np.load(args.motion)
names = clip["names"].tolist()
model = mj.MjModel.from_xml_path(str(args.robot.resolve()))
data = mj.MjData(model)
pairs = [(s + joint, s.lower() + "_" + link) for s in ("Left", "Right")
         for joint, link in (("ForeArm", "elbow"), ("Hand", "wrist_yaw"),
                             ("Shin", "knee"), ("Foot", "ankle_roll"))]
body_names = [model.body(i).name for i in range(model.nbody)]
ids = [next(i for i, n in enumerate(body_names) if n.lower() == link + "_link") for _, link in pairs]
indices = [names.index(j) for j, _ in pairs]
left, right = [names.index(s + "Leg") for s in ("Left", "Right")]
points = clip["joints"][..., [0, 2, 1]] * [1, -1, 1]
lateral = points[0,left,:2] - points[0,right,:2]
lateral /= np.linalg.norm(lateral)
points[:,:,:2] = (points[:,:,:2] - points[0,0,:2]) @ [[lateral[1], lateral[0]], [-lateral[0], lateral[1]]]
mj.mj_forward(model, data)
length = np.linalg.norm(data.xpos[ids[2]]-data.xpos[ids[3]]) * 2
scale = length / np.median(np.linalg.norm(points[:,left]-points[:,indices[2]],axis=1)
                          +np.linalg.norm(points[:,indices[2]]-points[:,indices[3]],axis=1))
points *= scale
points[:,:,2] -= points[:,:,2].min()
frames = []
for frame in points[::2]:
    side = frame[left] - frame[right]
    yaw = np.arctan2(-side[0], side[1])
    data.qpos[:3] = frame[0]
    data.qpos[3:7] = [np.cos(yaw/2),0,0,np.sin(yaw/2)]
    for _ in range(10):
        mj.mj_forward(model,data)
        jac = np.zeros((len(ids)*3,model.nv))
        for i,body in enumerate(ids):
            mj.mj_jacBody(model,data,jac[3*i:3*i+3],None,body)
        j = jac[:,6:]
        error = (frame[indices]-data.xpos[ids]).ravel()
        dq = np.linalg.solve(j.T@j+.008*np.eye(model.nv-6),j.T@error-.001*data.qpos[7:])
        data.qpos[7:] = np.clip(data.qpos[7:]+np.clip(dq,-.18,.18),*model.jnt_range[1:].T)
    mj.mj_forward(model,data)
    frames.append(np.column_stack([data.xpos,data.xquat]).round(5).tolist())
args.output.write_text(json.dumps(dict(names=body_names,frames=frames,fps=float(clip["fps"])/2,
                                       prompt=str(clip["prompt"]),seed=int(clip["seed"])),separators=(",",":")))
