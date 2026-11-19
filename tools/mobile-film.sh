#!/bin/sh
# Export a phone-sized copy of each native HD RGB recording from the site root.
set -eu
for film in public/joystick/*.mp4 public/joystick/a3/*.mp4 public/phrases/*/*.mp4 public/tracking/*.mp4 public/previews/*.mp4 public/inspection/*-eye.mp4 public/inspection/*-chase.mp4; do
  case "$film" in *-720.mp4) continue;; esac
  ffmpeg -v error -y -i "$film" -vf scale=1280:720 -c:v libx264 -preset fast -crf 22 -movflags +faststart "${film%.mp4}-720.mp4"
done
