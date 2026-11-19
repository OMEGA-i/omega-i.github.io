"""Build deterministic release attachments, or stage the pinned attachments for Pages."""
import argparse
import hashlib
import json
import zipfile
from pathlib import Path

FILES = ("actor.onnx", "gait.f32", "warehouse.xml", "patrol.json", "NOTICE", "UNITREE-LICENSE", "ROBOT-LICENSE")
LOCK = Path(__file__).with_name("release-lock.json")
def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()
def package(inputs, destination, license_file):
    destination.mkdir(parents=True,exist_ok=True)
    assets = {}
    for body in ("g1","a3"):
        source = inputs/body
        manifest = json.loads((source/"patrol.json").read_text())
        expected = {"g1":(45000,"2d5f9c24a3fd8aed43be1b7f6413bc93d64cb07e9ab2db2f9e5b19e6b0708210"),"a3":(15000,"46f1ba0fe477beeaad70e0c37e98fe7428c449374da0ec9fdd352697d121c6db")}
        if (manifest["iteration"],manifest["checkpoint"]) != expected[body]:
            raise ValueError(f"Unexpected LAFAN course A source for {body}")
        name = f"patrol-{body}-lafan-v1.zip"
        attribution = (f"OMEGA SuperMimicKit courses-20261107, LAFAN course A, {body}, "
                       f"iteration {manifest['iteration']}. Source checkpoint SHA-256 {manifest['checkpoint']}.\n"
                       "Stride derived from Unitree unitree_rl_gym (BSD-3-Clause), revision "
                       "276801e46c5d433564f24658bac64f254b7d2d4b. Collision model from "
                       "OMEGA-i/SuperMimicKit 85339ce9c081a49e174ff8fc027a506e505dbd87.\n")
        with zipfile.ZipFile(destination/name,"w") as z:
            notices = {
                "NOTICE": attribution.encode(),
                "UNITREE-LICENSE": license_file.read_bytes(),
                "ROBOT-LICENSE": (LOCK.parents[2]/"public"/"joystick"/(body+"-LICENSE")).read_bytes(),
            }
            if body == "a3":
                notices["NOTICE"] += (LOCK.parents[2]/"public/media/a3/source_NOTICE").read_bytes()
            for member in FILES:
                data = notices[member] if member in notices else (source/member).read_bytes()
                z.writestr(zipfile.ZipInfo(member),data,compress_type=zipfile.ZIP_DEFLATED)
        assets[body] = dict(file=name,sha256=digest(destination/name),bytes=(destination/name).stat().st_size,checkpoint=manifest["checkpoint"])
    LOCK.write_text(json.dumps(dict(repo="OMEGA-i/PlayGround",tag="web-patrol-lafan-v1",assets=assets),indent=2)+"\n")
def stage(inputs, destination):
    manifest=json.loads(LOCK.read_text())
    for body, asset in manifest["assets"].items():
        path=inputs/asset["file"]
        if digest(path)!=asset["sha256"]:raise ValueError(f"Invalid {body} bundle hash")
        with zipfile.ZipFile(path) as z:
            if sorted(z.namelist())!=sorted(FILES):raise ValueError("Unexpected archive members")
            z.extractall(destination/"models"/body)
    if sum(p.stat().st_size for p in destination.rglob("*") if p.is_file())>=1_000_000_000:
        raise ValueError("Pages artifact exceeds site size limit")
if __name__=="__main__":
    p=argparse.ArgumentParser();sub=p.add_subparsers(dest="action",required=True)
    for name in ("package","stage"):
        s=sub.add_parser(name);s.add_argument("inputs",type=Path);s.add_argument("destination",type=Path)
        if name=="package":s.add_argument("license",type=Path)
    a=p.parse_args()
    if a.action=="package":package(a.inputs,a.destination,a.license)
    else:stage(a.inputs,a.destination)
