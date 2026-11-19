"""Produce a synchronized RGB, depth and map contact sheet from one recorded trial."""
import argparse
import json
from pathlib import Path
import subprocess
import xml.etree.ElementTree as ET

from camera import VERTICAL_FOV, stabilize
import mujoco as mj
import numpy as np
from PIL import Image, ImageDraw

def render(episode, xml, out, sample_time=None):
    out.mkdir(parents=True,exist_ok=True)
    trial=json.loads((episode/"trial.json").read_text())
    with np.load(episode/"states.npz") as data:
        states=data["states"]
        actions=data["actions"]
    native_a3=trial["robot"]=="a3"
    origin=np.array(trial["origin"])
    basis=np.array(trial["basis"])
    path=(states[:,:2]-origin)@basis.T
    root=ET.parse(xml).getroot()
    root.find("compiler").set("meshdir",str(xml.resolve().parent))
    a3=root.get("model")=="A3T2.5"
    world=root.find("worldbody")
    for body in world.iter("body"):
        for geom in list(body.findall("geom")):
            if geom.get("group")!="1" and geom.get("class")!="visual":body.remove(geom)
    import base64
    from scipy.spatial.transform import Rotation
    objects=json.loads((Path(__file__).resolve().parents[2]/"public/showroom/geometry.json").read_text())
    rotation=Rotation.from_euler("z",np.arctan2(basis[0,1],basis[0,0]))
    def values(v):return " ".join(str(x) for x in v)
    for i,obj in enumerate(objects):
        p=obj["params"];kind=obj["type"];scale=np.array(obj["scale"])
        x,y,z=obj["pos"];xy=origin+np.array([x,y])@basis
        orient=rotation*Rotation.from_quat(obj["quat"],scalar_first=True)
        if kind=="BoxGeometry":shape="box";size=np.array([p["width"],p["height"],p["depth"]])*scale/2
        elif kind=="SphereGeometry":shape="ellipsoid";size=p["radius"]*scale
        elif kind=="CylinderGeometry":
            shape="cylinder";size=[(p["radiusTop"]+p["radiusBottom"])*scale[0]/2,p["height"]*scale[1]/2]
            orient=orient*Rotation.from_euler("x",-90,degrees=True)
        elif kind=="PlaneGeometry" and obj.get("texture"):
            shape="box";size=[p["width"]/2,p["height"]/2,.001]
        elif kind=="PlaneGeometry":continue
        else:raise ValueError(kind)
        color=tuple(bytes.fromhex(obj["color"]))
        props=dict(type=shape,pos=values([*xy,z]),size=values(size),quat=values(orient.as_quat(scalar_first=True)),rgba=values([*(c/255 for c in color),1]),contype="0",conaffinity="0")
        if obj.get("texture"):
            name=f"sign_{i}"
            texture_file=episode/(name+".png")
            texture_file.write_bytes(base64.b64decode(obj["texture"].split(",")[1]))
            ET.SubElement(root.find("asset"),"texture",name=name,type="2d",file=str(texture_file.resolve()))
            ET.SubElement(root.find("asset"),"material",name=name,texture=name)
            props["material"]=name
        ET.SubElement(world,"geom",**props)
    tex=root.find("asset/texture[@name='groundplane']" if a3 else "asset/texture[@name='texplane']")
    tex.attrib.update(builtin="flat",rgb1=".67 .69 .69",rgb2=".67 .69 .69",mark="edge",markrgb=".58 .60 .62")
    sky=root.find("asset/texture[@type='skybox']")
    if sky is not None:root.find("asset").remove(sky)
    ET.SubElement(root.find("asset"),"texture",type="skybox",builtin="gradient",rgb1=".9 .92 .94",rgb2=".74 .79 .85",width="64",height="384")
    root.find("asset/material[@name='groundplane']" if a3 else "asset/material[@name='MatPlane']").set("reflectance",".02")
    root.find("visual/headlight").attrib.update(ambient=".35 .37 .40",specular=".2 .2 .2")
    ET.SubElement(world.find(".//body[@name='head_pitch_Link']" if a3 else ".//body[@name='torso_link']"),"camera",name="eye",pos=".16 0 .07" if a3 else ".13 0 .43",xyaxes="0 -1 0 .259 0 .966",fovy=str(VERTICAL_FOV))
    W,H=640,352
    root.find("visual/global").attrib.update(offwidth=str(W),offheight=str(H))
    model=mj.MjModel.from_xml_string(ET.tostring(root,encoding="unicode"))
    d=mj.MjData(model); r=mj.Renderer(model,height=H,width=W)
    cam=mj.MjvCamera();cam.distance=2.85;cam.elevation=-28;cam.azimuth=float(np.degrees(np.arctan2(basis[0,1],basis[0,0])))+75
    fractions=np.linspace(.08,1,24)
    def clear_camera(xy):
        # Lift the camera above loaded shelves when they cross the sight line to the feet.
        az=np.radians(cam.azimuth)
        direction=np.array([np.cos(az),np.sin(az)])@basis.T
        for angle in range(28,79,2):
            tilt=np.radians(angle)
            ray=xy-fractions[:,None]*cam.distance*np.cos(tilt)*direction
            height=.10+fractions*(.59+cam.distance*np.sin(tilt))
            if all(not np.any((np.abs(ray[:,0]-x)<hx+.23)&(np.abs(ray[:,1]-y)<hy+.23)&(height<1.92))
                   for _,x,y,hx,hy in trial["racks"]):
                break
        cam.elevation=-max(angle,-cam.elevation-1.)
    addr=[model.jnt_qposadr[model.joint(n).id] for n in trial["joints"]]
    eye_id=model.camera("eye").id
    joint_limits=model.jnt_range[[model.joint(n).id for n in trial["joints"]]]
    def pose(s):
        d.qpos[:7]=s[:7]
        angles=s[13:13+len(addr)]
        d.qpos[addr]=np.clip(angles,*joint_limits.T) if a3 and not native_a3 else angles
        if a3 and not native_a3:
            mj.mj_kinematics(model,d)
            d.qpos[2]-=min(d.site(name).xpos[2] for name in ("left_foot","right_foot"))
        mj.mj_forward(model,d)
        stabilize(d,eye_id)
    if sample_time is not None:
        s=states[round(sample_time*50)]
        pose(s);r.update_scene(d,camera="eye")
        Image.fromarray(r.render()).save(out/"eye-sample.png");r.close();return
    stream=subprocess.Popen(["ffmpeg","-loglevel","error","-y","-f","rawvideo","-pix_fmt","rgb24","-s",f"{2*W}x{2*H}","-r","25","-i","-","-an","-c:v","libx264","-preset","veryfast","-crf","22","-pix_fmt","yuv420p","-movflags","+faststart",str(out/"episode.mp4")],stdin=subprocess.PIPE)
    def pixel(xy):
        return (int(73+xy[0]*76),int(252-xy[1]*68))
    base=Image.new("RGB",(W,H),"#edf1f4"); g=ImageDraw.Draw(base)
    for x in range(80,W,84):g.line((x,0,x,H),fill="#d6dfe5")
    for y in range(10,H,83):g.line((0,y,W,y),fill="#d6dfe5")
    for _,x,y,hx,hy in trial["racks"]:
        g.rectangle([pixel((x-hx,y+hy)),pixel((x+hx,y-hy))],fill="#a2a9ae")
    targets=[pixel((0,0))]+[pixel(node[1:3]) for node in trial["route"]]
    g.line(targets,fill="#bb6358",width=2)
    for j,(x,y) in enumerate(targets[1:]):
        g.ellipse((x-5,y-5,x+5,y+5),fill="#a8382e")
        g.text((x+8,y-15),trial["route"][j][0],fill="#172438")
    pts=[pixel(p) for p in path[::2]]
    w,qx,qy,qz=states[::2,3:7].T
    heading=np.unwrap(np.arctan2(2*(w*qz+qx*qy),1-2*(qy*qy+qz*qz)))
    heading=np.degrees(heading-heading[0])
    representative=round(trial["events"][0][1]*25) if trial["events"] else 0
    for n,s in enumerate(states[::2]):
        pose(s);cam.lookat[:]=[*s[:2],.69]
        clear_camera(path[2*n]);r.update_scene(d,camera=cam);chase=Image.fromarray(r.render())
        r.update_scene(d,camera="eye");ego=Image.fromarray(r.render())
        r.enable_depth_rendering();depth=np.clip(r.render(),0,8);r.disable_depth_rendering()
        depth=Image.fromarray(np.uint8(255*(1-depth/8))).convert("RGB")
        plan=base.copy();draw=ImageDraw.Draw(plan)
        if n:draw.line(pts[:n+1],fill="#2455ce",width=4)
        x,y=pts[n];draw.ellipse((x-6,y-6,x+6,y+6),fill="#153b9a")
        contact=Image.new("RGB",(2*W,2*H))
        for im,xy in [(chase,(0,0)),(ego,(W,0)),(depth,(0,H)),(plan,(W,H))]:contact.paste(im,xy)
        if n==0:contact.save(out/"start.webp",quality=90)
        if n==representative:
            cover=Image.new("RGB",(2*W,H));cover.paste(chase,(0,0));cover.paste(ego,(W,0));cover.save(out/"observation.webp",quality=94)
        stream.stdin.write(contact.tobytes())
    stream.stdin.close()
    if stream.wait():raise RuntimeError("episode encoding failed")
    r.close()
    if a3 and not native_a3:return  # Alternate rendering uses the G1 event clock and telemetry.
    # Keep public telemetry compact. Actions are native actor outputs, sampled at the video cadence.
    (out/"record.json").write_text(json.dumps(dict(robot=trial["robot"],events=trial["events"],end=trial["reason"],
        duration=(len(states)-1)/50,route=trial["route"],commands=trial["commands"],
        actionNorm=np.linalg.norm(actions[::2],axis=1).round(3).tolist(),xy=path[::2].round(3).tolist(),
        actor=trial["actor"],videoHz=25,racks=trial["racks"],heading=heading.astype(float).round(2).tolist(),sceneHash=trial["scene_sha256"],clearance=trial["clearance"]),separators=(",",":")))
if __name__=="__main__":
    p=argparse.ArgumentParser()
    for key in ["episode","xml","out"]:p.add_argument(key,type=Path)
    p.add_argument("--sample-time",type=float,help="Render one RGB frame for camera review")
    a=p.parse_args();render(a.episode,a.xml,a.out,a.sample_time)
