from pathlib import Path
import numpy as np, mujoco as mj
from PIL import Image
import xml.etree.ElementTree as E
import argparse

parser = argparse.ArgumentParser(
    description="Render the three time samples used in the homepage G1 motion study."
)
parser.add_argument("--xml", required=True, type=Path)
parser.add_argument("--motion", required=True, type=Path)
parser.add_argument("--output", required=True, type=Path)
args = parser.parse_args()
src = args.xml.resolve().parent
args.output.mkdir(parents=True, exist_ok=True)
root = E.parse(args.xml).getroot()
root.find("compiler").set("meshdir", str(src))
world = root.find("worldbody")
for g in list(world.findall("geom")) + list(world.findall("light")):
    world.remove(g)
for body in world.iter("body"):
    for geom in list(body.findall("geom")):
        if geom.get("group") != "1":
            body.remove(geom)
vis = root.find("visual")
vis.find("global").attrib.update(offwidth="1040", offheight="1100", fovy="28")
vis.find("headlight").attrib.update(
    ambient=".32 .34 .38", diffuse=".42 .44 .5", specular=".29 .3 .34"
)
for p, d, col in [
    ("3 -5 6", "-.45 .55 -.8", ".76 .77 .76"),
    ("0 4 4", "0 -.65 -.7", ".31 .48 .73"),
    ("-3 -1 4", ".55 .2 -.7", ".49 .6 .65"),
]:
    E.SubElement(
        world,
        "light",
        pos=p,
        dir=d,
        directional="true",
        diffuse=col,
        castshadow="false",
    )
m = mj.MjModel.from_xml_string(E.tostring(root, encoding="unicode"))
d = mj.MjData(m)
mj.mj_forward(m, d)
s = np.load(args.motion, allow_pickle=False)
import hashlib

if (
    int(s["fps"]) != 25
    or s["xml_sha256"].item() != hashlib.sha256(args.xml.read_bytes()).hexdigest()
):
    raise ValueError("The 25 Hz G1 reference and XML must match")
names = s["names"].tolist()


def matrix(q):
    a = np.zeros(9)
    mj.mju_quat2Mat(a, q)
    return a.reshape(3, 3)


cam = mj.MjvCamera()
cam.type = mj.mjtCamera.mjCAMERA_FREE
cam.distance = 3.38
cam.azimuth = 122
cam.elevation = -8
with mj.Renderer(m, height=1100, width=1040) as ren:
    for f in [5, 25, 48]:
        for k in range(1, m.nbody):
            name = m.body(k).name
            parent = m.body_parentid[k]
            if name in names:
                j = names.index(name)
                d.xpos[k] = s["joints"][f, j]
                d.xmat[k] = s["world_body_rotations"][f, j].ravel()
            else:
                R = d.xmat[parent].reshape(3, 3)
                d.xpos[k] = d.xpos[parent] + R @ m.body_pos[k]
                d.xmat[k] = (R @ matrix(m.body_quat[k])).ravel()
        for g in range(m.ngeom):
            k = m.geom_bodyid[g]
            R = d.xmat[k].reshape(3, 3)
            d.geom_xpos[g] = d.xpos[k] + R @ m.geom_pos[g]
            d.geom_xmat[g] = (R @ matrix(m.geom_quat[g])).ravel()
        cam.lookat[:] = [*s["joints"][f, 0, :2], 0.67]
        ren.update_scene(d, camera=cam)
        rgb = ren.render().copy()
        ren.enable_segmentation_rendering()
        mask = ren.render()[:, :, 0] >= 0
        ren.disable_segmentation_rendering()
        im = Image.fromarray(rgb).convert("RGBA")
        im.putalpha(Image.fromarray(mask.astype("uint8") * 255))
        im = im.crop(im.getbbox())
        im.thumbnail((640, 910), Image.Resampling.LANCZOS)
        im.save(args.output / f"g1-{f}.webp", quality=92)
