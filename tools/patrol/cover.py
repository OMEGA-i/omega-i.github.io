"""Compose covers using the two frames recorded at the inbound inspection event."""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
import json
site=Path(__file__).resolve().parents[2]/"public"
folder=site/"inspection"
pair=Image.open(folder/"observation.webp").convert("RGB")
run=json.loads((folder/"record.json").read_text())
w,h=pair.size
stamp=run["events"][0][1]
external=pair.crop((0,0,w//2,h));ego=pair.crop((w//2,0,w,h))
bg="#292b2d"
for mobile in (False,True):
    width,height=(640,784) if mobile else (1280,444)
    plate=Image.new("RGB",(width,height),bg)
    draw=ImageDraw.Draw(plate)
    for i,(view,label) in enumerate([(external,"G1   /   THIRD PERSON"),(ego,"G1   /   EGO RGB")]):
        x=0 if mobile else i*640;y=i*392 if mobile else 0
        plate.paste(view,(x,y))
        draw.text((x+20,y+363),label,font=ImageFont.load_default(size=19),fill="white")
        draw.text((x+562,y+363),f"{stamp:.2f} s",font=ImageFont.load_default(size=18),fill="#c3c9cf")
    if not mobile:
        start,end=20,width-20
        draw.line((start,416,end,416),fill="#7f878e",width=2)
        for _,sec in run["events"]:
            x=start+(end-start)*sec/run["duration"]
            draw.ellipse((x-4,412,x+4,420),fill="#c0d0e5")
        x=start+(end-start)*stamp/run["duration"]
        draw.ellipse((x-6,410,x+6,422),fill="#ff9988")
    plate.save(site/("research/simulation-mobile.webp" if mobile else "research/simulation-cover.webp"),quality=93)
# Keep the robot readable at project-card size.
Image.open(folder/"start.webp").crop((0,0,640,352)).save(folder/"cover.webp",quality=93)
# The home card plays only the external camera during the outbound detour.
import subprocess
subprocess.run(["ffmpeg","-loglevel","error","-y","-ss","0","-i",str(folder/"episode.mp4"),
                "-t","10","-vf","crop=iw/2:ih/2:0:0","-an","-pix_fmt","yuv420p",
                "-movflags","+faststart",str(site/"previews/playground.mp4")],check=True)
