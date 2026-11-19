"""Audit saved browser controller states in MuJoCo and prepare synchronized video rendering."""
import argparse,hashlib,json
from pathlib import Path
import numpy as np
import mujoco as mj
from clearance import measure
p=argparse.ArgumentParser()
for key in ("episode","bundle"):p.add_argument(key,type=Path)
a=p.parse_args()
trial=json.loads((a.episode/"capture.json").read_text());cfg=json.loads((a.bundle/"patrol.json").read_text())
scene=a.bundle/"warehouse.xml";model=mj.MjModel.from_xml_path(str(scene))
names=[model.joint(int(np.where(model.jnt_qposadr==i)[0][0])).name for i in cfg["qids"]]
states=np.array(trial.pop("states"));actions=np.array(trial.pop("actions"))
trial.update(joints=names,scene_sha256=hashlib.sha256(scene.read_bytes()).hexdigest(),clearance=measure(model,names,states,trial["racks"]))
np.savez_compressed(a.episode/"states.npz",states=states,actions=actions)
(a.episode/"trial.json").write_text(json.dumps(trial))
