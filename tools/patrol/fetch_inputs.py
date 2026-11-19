"""Fetch and verify all public inputs for the two course exports."""
import argparse
import hashlib
import json
import subprocess
import zipfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

KIT = "85339ce9c081a49e174ff8fc027a506e505dbd87"
UNITREE = "276801e46c5d433564f24658bac64f254b7d2d4b"
RELEASE = "https://github.com/OMEGA-i/SuperMimicKit/releases/download/courses-20261107/"
ARCHIVES = {
    "inference-runtime.zip": "da10b4fa0d590a2637ec546aa66da5585f1b36bc48873f065be2b12dd4ea7b22",
    "g1-a_lafan_50k.zip": "2b4887ccd4e05a0677181b14e1e49d54adb702c53bd45278ea7d575186d6b4cc",
    "a3-a_lafan_50k.zip": "31cfc62eba124930631f19a863d2a22b51cd41657e28d54da2191c1b3d39701e",
}
def fetch(url, path, digest=None):
    path.parent.mkdir(parents=True, exist_ok=True)
    if digest and path.is_file() and hashlib.sha256(path.read_bytes()).hexdigest() == digest:
        return
    tmp = path.with_suffix(path.suffix + ".part")
    subprocess.run(["curl","-fsSL","--retry","3","--connect-timeout","15","-o",str(tmp),url],check=True)
    if digest and hashlib.sha256(tmp.read_bytes()).hexdigest() != digest:
        raise ValueError(f"Hash mismatch for {path.name}")
    tmp.replace(path)

def inputs(root):
    for name, digest in ARCHIVES.items():
        target=root/"release"/name
        fetch(RELEASE+name,target,digest)
        with zipfile.ZipFile(target) as z:z.extractall(target.parent)
    unitree=f"https://raw.githubusercontent.com/unitreerobotics/unitree_rl_gym/{UNITREE}/"
    for name,src in [("motion.pt","deploy/pre_train/g1/motion.pt"),("g1_12dof.xml","resources/robots/g1_description/g1_12dof.xml"),("LICENSE","LICENSE")]:
        fetch(unitree+src,root/"unitree"/name)
    for body in ["g1","a3"]:
        prefix=f"OMEGA-i/SuperMimicKit/{KIT}/assets/robots/{body}/"
        base="https://raw.githubusercontent.com/"+prefix
        dest=root/body
        fetch(base+"provenance.json",dest/"provenance.json")
        meta=json.loads((dest/"provenance.json").read_text())
        fetch(base+"robot.xml",dest/"robot.xml",meta["xml_sha256"])
        def mesh(entry):
            name=entry["file"]
            fetch("https://media.githubusercontent.com/media/"+prefix+name,dest/name,entry["sha256"])
        with ThreadPoolExecutor(max_workers=6) as pool:list(pool.map(mesh,meta["assets"]))

if __name__=="__main__":
    p=argparse.ArgumentParser();p.add_argument("dest",type=Path)
    inputs(p.parse_args().dest)
