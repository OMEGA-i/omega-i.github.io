"""Build a course bundle using released tracker weights and a simulated Unitree walking cycle."""
import argparse, json, hashlib, math, re, sys
from pathlib import Path
import xml.etree.ElementTree as ET
import mujoco as mj
import numpy as np
import torch
from scipy.spatial.transform import Rotation
from scipy.spatial import ConvexHull

def digest(p): return hashlib.sha256(p.read_bytes()).hexdigest()

def walking_source(source):
    hashes={"motion.pt":"cf668f75b90d1abf73d2b87612a6e76bccc61ff7e083b63582d3f6aaa3c1759d","g1_12dof.xml":"747ede40aa726b7352bae8353e95d0d0f908cec2257a27cbd78bc6e5a2d5a314"}
    for name,h in hashes.items():
        if digest(source/name)!=h:raise ValueError(name)
    root=ET.parse(source/"g1_12dof.xml").getroot()
    # Only the original foot spheres and limb primitives contact the ground in this gait.
    for parent in root.iter():
        for geom in list(parent.findall("geom[@type='mesh']")):parent.remove(geom)
    root.remove(root.find("asset"))
    ET.SubElement(root.find("worldbody"),"geom",type="plane",size="0 0 .1")
    model=mj.MjModel.from_xml_string(ET.tostring(root,encoding="unicode"))
    model.opt.timestep=.002
    data=mj.MjData(model)
    pose=np.array([-.1,0,0,.3,-.2,0]*2)
    kp=np.array([100,100,100,150,40,40]*2)
    kd=np.array([2,2,2,4,2,2]*2)
    policy=torch.jit.load(str(source/"motion.pt")).eval()
    target=pose.copy();act=np.zeros(12);frames=[]
    with torch.inference_mode():
        for step in range(4800):
            data.ctrl[:]=(target-data.qpos[7:])*kp-data.qvel[6:]*kd
            mj.mj_step(model,data)
            if (step+1)%10:continue
            q=data.qpos[3:7]
            gravity=Rotation.from_quat(q[[1,2,3,0]]).inv().apply([0,0,-1])
            phase=2*math.pi*((step+1)%400)/400
            obs=np.r_[data.qvel[3:6]*.25,gravity,[1,0,0],data.qpos[7:]-pose,data.qvel[6:]*.05,act,np.sin(phase),np.cos(phase)]
            act=policy(torch.tensor(obs,dtype=torch.float32)[None]).numpy()[0]
            target=pose+.25*act
            frames.append(data.qpos.copy())
    states=np.array(frames[-42:])
    if states[:,2].min()<.55 or states[-1,0]-states[0,0]<.15:raise ValueError("Unstable source gait")
    return states,[model.joint(i).name for i in range(1,model.njnt)]

def compile_scene(xml, cfg, names, layout):
    root=ET.parse(xml).getroot();assets=root.find("asset");world=root.find("worldbody")
    root.find("compiler").set("usethread","false")
    for p in root.iter():
        for g in list(p.findall("geom")):
            if g.get("group")=="1" or g.get("class")=="visual" or g.get("type")=="plane":p.remove(g)
    used={g.get("mesh") for g in root.iter("geom")}
    for mesh in list(assets.findall("mesh")):
        if mesh.get("name") not in used:assets.remove(mesh);continue
        path=xml.parent/mesh.attrib.pop("file")
        if path.suffix.lower()==".obj":
            pts=np.array([[float(v) for v in l.split()[1:4]] for l in path.read_text().splitlines() if l.startswith("v ")])
        else:
            buf=path.read_bytes();pts=np.ndarray((int.from_bytes(buf[80:84],"little"),9),dtype="<f4",buffer=buf,offset=96,strides=(50,4)).reshape(-1,3)
        pts=np.unique(pts,axis=0);pts=pts[ConvexHull(pts).vertices]
        mesh.set("vertex"," ".join(format(float(x),".9g") for x in pts.flat));mesh.attrib.pop("content_type",None)
    ET.SubElement(world,"geom",type="plane",name="floor",size="0 0 .1",contype="1",conaffinity="1")
    for name,x,y,hx,hy in layout["racks"]:
        ET.SubElement(world,"geom",name=name,type="box",size=f"{hx} {hy} {layout['heights'][name][0]}",pos=f"{x} {y} {layout['heights'][name][1]}",contype="1",conaffinity="1")
    for old in root.findall("actuator"):root.remove(old)
    acts=ET.SubElement(root,"actuator");scale=[]
    for name in names:
        a,=[v for v in cfg["actuators"] if re.fullmatch(v["pattern"],name)]
        kp=a.get("stiffness",a["armature"]*(20*math.pi)**2);kd=a.get("damping",4*a["armature"]*20*math.pi)
        joint=world.find(f".//joint[@name='{name}']")
        joint.attrib.update(armature=str(a["armature"]),stiffness="0",damping="0")
        ET.SubElement(acts,"general",name="sm_"+name,joint=name,biastype="affine",gainprm=str(kp),biasprm=f"0 {-kp} {-kd}",forcelimited="true",forcerange=f"{-a['effort']} {a['effort']}",ctrllimited="false")
        scale.append(.25*a["effort"]/kp)
    opt=root.find("option")
    if opt is None:opt=ET.SubElement(root,"option")
    opt.attrib.update(timestep=".005",integrator="implicitfast",solver=cfg.get("mujoco_solver","Newton").title())
    flags=opt.find("flag")
    if flags is None:flags=ET.SubElement(opt,"flag")
    flags.set("sensor","disable")
    if not cfg.get("mujoco_multiccd",True):flags.set("multiccd","disable")
    return ET.tostring(root,encoding="unicode"),scale

def build(args):
    sys.path.insert(0,str(args.release.resolve()))
    from runtime.load import load
    from runtime.kinematics import Kinematics
    body=args.body;bundle=args.release/(body+"-a_lafan_50k")
    actor,_,meta=load(bundle,args.xml)
    expected={"g1":(45000,"2d5f9c24a3fd8aed43be1b7f6413bc93d64cb07e9ab2db2f9e5b19e6b0708210"),"a3":(15000,"46f1ba0fe477beeaad70e0c37e98fe7428c449374da0ec9fdd352697d121c6db")}
    assert (meta["iteration"],meta["checkpoint_sha256"])==expected[body]
    cfg=json.loads((bundle/"robot_config.json").read_text());names=meta["joint_names"]
    layout=json.loads(args.layout.read_text())
    scene,scale=compile_scene(args.xml,cfg,names,layout)
    out=args.output;out.mkdir(exist_ok=True,parents=True);(out/"warehouse.xml").write_text(scene)
    m=mj.MjModel.from_xml_string(scene);data=mj.MjData(m)
    ids=[m.joint(n).id for n in names];qids=m.jnt_qposadr[ids];vids=m.jnt_dofadr[ids]
    default=np.array([next((v for p,v in cfg["default_pose"].items() if re.fullmatch(p,n)),0.) for n in names])
    src,snames=walking_source(args.source)
    q=np.tile(default,(len(src),1))
    for j,n in enumerate(names):
        if n in snames:q[:,j]=src[:,7+snames.index(n)]
        if "elbow_joint" in n:q[:,j]=.6
    root=np.zeros((len(src),13));root[:,3]=1;root[:,0]=np.arange(len(src))*.01;root[:,7]=.5
    for i,row in enumerate(q):
        data.qpos[:3]=0;data.qpos[3:7]=[1,0,0,0];data.qpos[qids]=row;mj.mj_forward(m,data)
        feet=[data.site(n).xpos[2] for n in ("left_foot","right_foot")] if body=="a3" else [data.geom_xpos[k,2]-m.geom_size[k,0] for k in range(m.ngeom) if m.geom_type[k]==mj.mjtGeom.mjGEOM_SPHERE and "ankle" in (m.geom(k).name or "")]
        root[i,2]=-min(feet)
    root[:,9]=np.gradient(root[:,2],.02)
    fk=Kinematics(m,names,meta["body_names"]);dim=actor.layout.dim
    def pack(r,q,v):
        with torch.inference_mode():
            ts=[torch.tensor(x,dtype=torch.float32) for x in (r,q,v)]
            return torch.cat([*ts,fk(*ts).flatten(1)],1).numpy()
    gait=pack(root,q,np.gradient(q,.02,axis=0))[1:41]
    stillroot=root[:1].copy();stillroot[:,7:]=0
    still=pack(stillroot,q.mean(0)[None],np.zeros_like(q[:1]))
    np.vstack((still,still,gait)).astype("<f4").tofile(out/"gait.f32")
    settings=dict(body=body,actor="actor.onnx",gait="gait.f32",physics="warehouse.xml",origin=[0,0],basis=[[1,0],[0,1]],route=layout["route"],racks=layout["racks"],qids=qids.tolist(),vids=vids.tolist(),default=default.tolist(),scale=scale,dim=dim,head=m.body("torso_link" if body=="g1" else "head_pitch_Link").id,eyeOffset=[.13,0,.43] if body=="g1" else [.16,0,.07],bodyNames=[m.body(i).name for i in range(m.nbody)],checkpoint=meta["checkpoint_sha256"],iteration=meta["iteration"])
    (out/"patrol.json").write_text(json.dumps(settings))
    rng=torch.Generator().manual_seed(7);h=torch.randn(1,10,actor.layout.obs_dim,generator=rng)*.15;g=torch.randn(1,11,dim,generator=rng)*.1;g[:,:,3:7]=torch.nn.functional.normalize(g[:,:,3:7],dim=-1)
    with torch.inference_mode():
        act=actor(h,g);torch.onnx.export(actor,(h,g),str(out/"actor.onnx"),input_names=["history","goals"],output_names=["action"],opset_version=17,dynamo=False)
    for name,v in (("history",h),("goals",g),("action",act)):v.numpy().astype("<f4").tofile(out/(name+".f32"))
    (out/"shapes.json").write_text(json.dumps(dict(history=list(h.shape),goals=list(g.shape),action=list(act.shape))))
if __name__=="__main__":
    p=argparse.ArgumentParser();p.add_argument("body",choices=["g1","a3"])
    for name in ("release","xml","source","layout","output"):p.add_argument(name,type=Path)
    build(p.parse_args())
