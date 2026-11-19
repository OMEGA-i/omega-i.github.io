"""Render five command diagrams using only the public browser bundle gait."""
import json,sys
from pathlib import Path
import mujoco as mj
import numpy as np
out=Path("public/joystick")
meta=json.loads((out/"samples.json").read_text())
samples=[{k:s[k] for k in ("id","frames","velocity")} for s in meta["samples"]]
for body in ("g1","a3"):
    d=Path(sys.argv[1])/body
    cfg=json.loads((d/"patrol.json").read_text())
    gait=np.fromfile(d/"gait.f32",dtype="<f4").reshape(-1,cfg["dim"])
    m=mj.MjModel.from_xml_path(str((d/"warehouse.xml").resolve()))
    data=mj.MjData(m)
    names=meta["jointNames"] if body=="g1" else json.loads((out/"a3/rig.json").read_text())["jointNames"]
    ids=[m.body(n).id for n in names]
    for s in samples:
        xyz=[];rot=[]
        v=np.array(s["velocity"])
        angle=np.arctan2(v[1],v[0])
        for i in range(s["frames"]):
            row=gait[2+(i*2)%40] if v.any() else gait[0]
            data.qpos[:3]=[*(v*i/25),row[2]]
            data.qpos[3:7]=[np.cos(angle/2),0,0,np.sin(angle/2)]
            data.qpos[cfg["qids"]]=row[13:13+len(cfg["qids"])]
            mj.mj_forward(m,data)
            xyz.append(data.xpos[ids].copy());rot.append(data.xquat[ids][:,[1,2,3,0]])
        if body=="g1":
            np.rint(np.array(xyz)*1000).astype('<i2').tofile(out/(s["id"]+".bin"))
            np.rint(np.array(rot)*32767).astype('<i2').tofile(out/(s["id"]+".quat"))
        else:np.concatenate([xyz,rot],axis=2).astype('<f4').tofile(out/"a3"/(s["id"]+".f32"))
meta={k:meta[k] for k in ["fps","robot","format","jointNames","parents","xmlSha256","rotationFormat"]}
meta.update(samples=samples,source="Public Unitree walking cycle and command visualization")
(out/"samples.json").write_text(json.dumps(meta,indent=2)+"\n")
