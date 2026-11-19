"""Select three frames of the generated dance for the editorial spread."""
from io import BytesIO
from pathlib import Path
import subprocess
from PIL import Image, ImageDraw, ImageFont
site = Path(__file__).resolve().parents[2] / "public"
def frame(t):
    data = subprocess.check_output(["ffmpeg","-loglevel","error","-ss",str(t),"-i",str(site/"phrases/g1/rhythm.mp4"),"-frames:v","1","-f","image2pipe","-vcodec","png","-"])
    return Image.open(BytesIO(data)).convert("RGB").crop((280,0,680,540))
for mobile in (False, True):
    times = [0.4, 1.7, 2.9] if not mobile else [1.7, 2.9]
    plate = Image.new("RGB", (400*len(times), 590), "#23262b")
    draw = ImageDraw.Draw(plate)
    for i,t in enumerate(times):
        plate.paste(frame(t), (400*i,0))
        draw.text((400*i+18,552), f"G1    /    {t:.2f} s", fill="white", font=ImageFont.load_default(size=18))
    plate.save(site/("research/codec-mobile.webp" if mobile else "research/codec-cover.webp"),quality=93)
    if not mobile:plate.crop((0,0,1200,540)).save(site/"research/phrase.webp",quality=93)
