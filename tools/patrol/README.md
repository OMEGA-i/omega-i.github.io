# Reproduce the warehouse patrol

With Python 3.12, torch 2.15.0, numpy 2.5.5, scipy 1.18.1, onnx 1.23.2 and mujoco 4.0.1 installed, run from the site root. Choose writable directories for INPUTS and BUNDLES.

```sh
python tools/patrol/fetch_inputs.py "$INPUTS"
for body in g1 a3; do
  python tools/patrol/public_course.py "$body" "$INPUTS/release" "$INPUTS/$body/robot.xml" "$INPUTS/unitree" public/inspection/warehouse-layout.json "$BUNDLES/$body"
done
PATROL_BUNDLE_DIR="$BUNDLES" npm run dev
```

Each export checks the XML and actor identity, then runs the public Unitree policy to obtain a walking cycle. The joint names map that cycle onto each body before forward kinematics. G1 uses LAFAN course A at 45,000 updates, A3 uses its 15,000-update LAFAN course A checkpoint. At every 50 Hz control tick, the body’s own policy reads measured history and target frames, then supplies joint controls to four MuJoCo steps. Arrival requires staying within 0.55 m at a speed of at most 0.28 m/s for the station's dwell period.

For each body, with the development server running and Chrome installed, run the commands below. The rendered mosaic combines the third-person camera, head camera, depth and measured path from the same run. Python rendering also needs Pillow and ffmpeg.

```sh
node tools/tracker/verify_webgpu.mjs http://localhost:4321 "$BUNDLES/$body"
node tools/patrol/capture_course.mjs http://localhost:4321 "$body" "$CAPTURE/$body"
python tools/patrol/prepare_capture.py "$CAPTURE/$body" "$BUNDLES/$body"
python tools/patrol/render.py "$CAPTURE/$body" "$INPUTS/$body/robot.xml" "$RENDER/$body"
```

To produce new attachments and update the version lock, run `python tools/patrol/release.py package "$BUNDLES" "$ARCHIVES" "$INPUTS/unitree/LICENSE"`. Stage and preview as described in the site README.


## Showroom recordings

Run the dev server with the released central-showroom bundles. From the site root render the independent camera streams and the short tracking studies:

```sh
for body in g1 a3; do
  node tools/patrol/film_showroom.mjs http://localhost:4321 "$body" "public/inspection/$body"
done
node tools/tracker/film.mjs http://localhost:4321
sh tools/mobile-film.sh
```

The camera encoder verifies every pelvis XY sample against the recorded route. Tracking clips retain measured and reference link transforms for frame inspection. The two camera films share the 25 Hz record clock; mobile transcodes preserve frame count.
