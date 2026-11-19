"""Stage the verified Joystick graph under the Pages size budget."""
import gzip
import json
import shutil
import tempfile
import sys
from pathlib import Path

directory = Path(sys.argv[1])
path = directory / "joystick.onnx"
signature = directory / "signature.json"
spec = json.loads(signature.read_text())
spec.update(encoding="gzip", modelBytes=path.stat().st_size, parts=[])
with tempfile.TemporaryFile() as compressed:
    with path.open("rb") as source, gzip.GzipFile(fileobj=compressed, mode="wb", mtime=0) as output:
        shutil.copyfileobj(source, output)
    spec["transferBytes"] = compressed.tell()
    compressed.seek(0)
    while block := compressed.read(16 * 1024**2):
        name = f"graph-{len(spec['parts']):03}.bin"
        (directory / name).write_bytes(block)
        spec["parts"].append(name)
path.unlink()
# Build inputs can be hard links to the signed source manifest.
signature.unlink()
signature.write_text(json.dumps(spec))
