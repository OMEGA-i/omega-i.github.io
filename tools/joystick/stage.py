"""Split the checksum-verified, single-member gzip attachment for same-origin streaming."""
import json
import hashlib
import sys
from pathlib import Path

directory = Path(sys.argv[1])
archive = directory / "joystick.onnx.gz"
signature = directory / "signature.json"
spec = json.loads(signature.read_text())
with archive.open("rb") as compressed:
    # The fixed G1 ONNX graph is below 4 GiB, so gzip ISIZE is its exact length.
    compressed.seek(-4, 2)
    spec.update(encoding="gzip", modelBytes=int.from_bytes(compressed.read(4), "little"),
                transferBytes=archive.stat().st_size, parts=[], hashes=[])
    compressed.seek(0)
    while block := compressed.read(16 * 1024**2):
        name = f"graph-{len(spec['parts']):03}.bin"
        (directory / name).write_bytes(block)
        spec["parts"].append(name)
        spec["hashes"].append(hashlib.sha256(block).hexdigest())
mirror=json.loads(Path(__file__).with_name("mirror-lock.json").read_text())
spec["mirror"] = {
    "base": "https://raw.githubusercontent.com/OMEGA-i/omega-i.github.io/1d0a23a128bd3f64f91a7fa745a97dd8351339b1/",
    "parts": [item[0] for item in mirror], "hashes": [item[1] for item in mirror],
}
archive.unlink()
signature.unlink()
signature.write_text(json.dumps(spec))
