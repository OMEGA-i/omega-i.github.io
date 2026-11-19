# G1 browser demo

The local Astro dev server automatically finds the validated model in the directory specified by `JOYSTICK_MODEL_DIR`. Open either language's Joystick project page, set the command and click **Generate motion**. The model loads on the first click. GitHub Pages serves five recorded commands and stages the verified G1 graph from the Joystick release for on-device generation.

## Reproduce the reference

Use the Joystick checkout at commit `ee28815ed2d0a9580f60c4e382f2559f9786602b` with its pinned Torch environment. Set `BASE` to a directory containing `datasets/bones-seed-25fps/g1` and `runs/g1/fsq100k_25fps`, `XML` to the matching G1 XML and `OUTPUT` to a fresh output directory. The input paths may be read-only links.

From the Joystick checkout, run each of the five commands below with its own output directory. Keep the same initial source and seed for all five. Use `--device cpu` for export parity. The public recordings used the same entry point on L20 CUDA.

```sh
python tools/offline_generation.py --robot g1 --base "$BASE" --xml "$XML" \
  --output "$OUTPUT/diagonal" --device cpu --condition-mode sonic --single-only \
  --export-tracker-reference --initial-source-id '230313/idle_loop_001__A267.bvh' \
  --category walk_forward_left_medium --command 0.8 0.25
```

| Sample | Category | Forward (m/s) | Left (m/s) |
| --- | --- | ---: | ---: |
| diagonal | walk_forward_left_medium | 0.80 | 0.25 |
| idle | idle | 0 | 0 |
| forward | walk_forward_medium | 0.80 | 0 |
| left | walk_left_medium | 0 | 0.35 |
| backward | walk_backward_slow | -0.30 | 0 |

`pack_samples.py SOURCE DESTINATION` reads these five directories. The browser reads signed 16-bit little-endian positions in millimetres, with 60 frames, 30 joints and XYZ in world coordinates. Each .quat file stores four signed int16 world-orientation components per body in xyzw order, divided by 32767 on read. The replays represent finite kinematic windows. Every input used for the samples has an output hash in `public/joystick/samples.json`.

## Export and check

Use an isolated environment based on the original Joystick checkout and add `onnx==1.23.2` and `onnxruntime==1.32.0`. Set `SITE_TOOLS` to this directory. From the pinned checkout, run

```sh
python "$SITE_TOOLS/export_onnx.py" . "$OUTPUT/model" -- \
  --base "$BASE" --robot g1 --xml "$XML" --device cpu \
  --initial-source-id '230313/idle_loop_001__A267.bvh' --condition-mode sonic \
  --category walk_forward_left_medium --command 0.8 0.25 --single-only \
  --export-tracker-reference --output "$OUTPUT/export-work"
python "$SITE_TOOLS/verify_onnx.py" "$OUTPUT/model" "$OUTPUT"
```

The exported graph takes float32 `velocity[2]` and int64 `category[1]` and returns float32 `positions[60,30,3]` and `world_rotations[60,30,3,3]`. It includes category-conditioned primitives, motion normalization, root generation, four argmax token refinement rounds, decoding and fixed G1 forward kinematics. With the 30-joint topology fixed, unrolling the FK tree and lowering three fixed-shape indexed assignments avoids unsupported legacy exporter paths. `validation.json` records the exact model hash, size, browser and per-command comparisons.

The browser uses the WebGPU execution provider, with auxiliary CPU operations assigned by ONNX Runtime. All five reference cases were checked against original CPU predictions. A custom command outside the five presets was also generated through the Astro page. Replay output and the command arrow use the displayed world-frame axes. Camera orbit changes the viewpoint only.

## Local model and public delivery

Keep `signature.json` and `joystick.onnx` together in the directory specified by `JOYSTICK_MODEL_DIR`. The original FP32 graph is 736,337,531 bytes. Pages uses the mixed INT8/FP16 weight export. The workflow verifies the compressed graph and signature, then runs `tools/joystick/stage.py` to split the compressed stream into 16 MiB same-origin fragments. The client downloads about 224 MiB on its first generation, inflates the fragments in order and reuses the compiled session. Five recorded samples remain available on devices without WebGPU or enough memory.

## G1 visual assets

The browser draws the original G1 XML visual mesh set. Every generated or recorded body rotation drives its corresponding named rigid body in the GLB. Fixed hand, head and torso attachments preserve their local transforms. The five fallback clips were rendered from this same asset, camera and motion data. A device without a WebGL context plays these videos with timeline scrubbing.

To reproduce the geometry, run Blender with `-b -P export_g1.py -- robot.xml samples.json raw.glb`. Use `gltfpack -i raw.glb -o g1.glb -cc -kn -km -vp 15 -vn 10` for the web asset. Input OBJ identities and the final GLB hash are in `public/joystick/g1.source.json`. Materials and lights are set up for the studio. Mesh topology is preserved without polygon decimation.

## Reproduce the compact-model comparison

Use the original FP32 graph and signature from g1-webgpu-v1. Run the following from the site root with NumPy and ONNX installed, and start the Astro development server on localhost:4321.

```sh
for mode in fp16 int8 mixed; do
  mkdir -p "$OUTPUT/$mode"
  cp "$FP32/signature.json" "$OUTPUT/$mode/"
  python tools/joystick/compact.py "$FP32/joystick.onnx" "$OUTPUT/$mode/joystick.onnx" "$mode"
done
node tools/joystick/precision-check.mjs http://localhost:4321 "$OUTPUT/quality.json" \
  baseline="$FP32" fp16="$OUTPUT/fp16" int8="$OUTPUT/int8" mixed="$OUTPUT/mixed"
node tools/joystick/cold-start.mjs https://omega-i.github.io "$OUTPUT/cold-start.json"
```

All ten commands share the FP32 baseline's initial context and category mapping. Errors use world-space Euclidean link displacement and relative rotation angles over the entire 2.4-second window. Each model uses FP32 activations. The mixed variant stores the main transformer weights as symmetric INT8 with one scale per 32 weights and other large initializers as FP16. Motion quality is evaluated on generated references, before the physics tracker.
