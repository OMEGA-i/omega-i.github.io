"""Select a closer front portrait for each homepage card. Playback retains the full frame."""
from io import BytesIO
from pathlib import Path
import subprocess
from PIL import Image

public = Path(__file__).resolve().parents[2] / 'public'
for project, movie, time in [
    ('joystick', 'joystick/diagonal.mp4', .6),
    ('playground', 'previews/playground.mp4', .12),
    ('semoco', 'previews/semoco.mp4', .48),
]:
    frame = subprocess.check_output([
        'ffmpeg','-v','error','-ss',str(time),'-i',str(public/movie),
        '-frames:v','1','-f','image2pipe','-vcodec','png','-',
    ])
    image = Image.open(BytesIO(frame))
    w,h = image.size
    image.crop((round(.25*w),round(.105*h),round(.75*w),round(.605*h))).save(
        public/'previews'/f'{project}-front.webp', quality=95)
