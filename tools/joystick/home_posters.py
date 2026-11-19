"""Render uncropped homepage stills from the three demos' recorded poses."""
import argparse
import json
import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory

import mujoco as mj
import numpy as np

parser = argparse.ArgumentParser()
for arg in ("origin", "episode", "robot_xml", "dance_track"):
    parser.add_argument(arg, type=str if arg == "origin" else Path)
args = parser.parse_args()
public = Path("public")
motion = public / "joystick"
names = json.loads((motion/"samples.json").read_text())["jointNames"]
positions = np.fromfile(motion/"diagonal.bin", "<i2").reshape(-1,len(names),3)/1000
rot = np.fromfile(motion/"diagonal.quat", "<i2").reshape(-1,len(names),4)/32767
joystick = dict(names=names, frames=[np.column_stack([positions[15],rot[15][:,[3,0,1,2]]]).tolist()],
                path=positions[:,0,:2].tolist(),velocity=[.8,.25])
trial = json.loads((args.episode/"trial.json").read_text())
model = mj.MjModel.from_xml_path(str(args.robot_xml.resolve()))
data = mj.MjData(model)
with np.load(args.episode/"states.npz") as track:
    state = track["states"][6]
data.qpos[:7] = state[:7]
for joint,angle in zip(trial["joints"], state[13:], strict=True):
    data.qpos[model.jnt_qposadr[model.joint(joint).id]] = angle
mj.mj_forward(model,data)
patrol = dict(names=[model.body(i).name for i in range(model.nbody)],
              frames=[np.column_stack([data.xpos,data.xquat]).tolist()])
dance = json.loads(args.dance_track.read_text())
dance["frames"] = [dance["frames"][12]]
with TemporaryDirectory() as tmp:
    for project, pose in [("joystick",joystick), ("playground",patrol), ("semoco",dance)]:
        source = Path(tmp)/"pose.json"
        source.write_text(json.dumps(pose))
        subprocess.run(["node","tools/semoco/film.mjs",args.origin,"g1",source,
                        public/"previews"/f"{project}-front.webp","poster"],check=True)
