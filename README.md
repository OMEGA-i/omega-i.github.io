# OMEGA research group

Bilingual Astro site for Joystick, SeMoCo, SuperMimicKit and PlayGround. Use Node 24, install with `npm ci`, then run `npm run dev`. Open `/en/` or `/zh/`. The theme selector and language switch work on project and article pages.

## Preview the release

Use the two attachments named in [the release lock](tools/patrol/release-lock.json). For a local rehearsal put them in the directory named by PATROL_ARCHIVES.

```sh
PUBLIC_JOYSTICK_MODEL_MANIFEST=/models/joystick-mixed-v1/signature.json PUBLIC_G1_PATROL_MANIFEST=/models/g1/patrol.json PUBLIC_A3_PATROL_MANIFEST=/models/a3/patrol.json npm run build
gh release download g1-webgpu-mixed-v1 -R OMEGA-i/Joystick -p signature.json -p joystick.onnx.gz -D dist/models/joystick-mixed-v1
(cd dist/models/joystick-mixed-v1 && shasum -a 256 -c ../../../tools/joystick/browser.sha256)
python3 tools/joystick/stage.py dist/models/joystick-mixed-v1
python3 tools/patrol/release.py stage "$PATROL_ARCHIVES" dist
npm run preview
```

The manual Pages workflow performs the same build, downloads the pinned attachments and verifies their hashes. Use the organization repository omega-i.github.io and GitHub Actions as the Pages source. For browser tests run `npx playwright install chromium` and `npm test` after building.

## Projects and media

- PlayGround runs a body-specific tracker in the browser on WebGPU with MuJoCo physics. The route and both cameras use the same warehouse. Prerecorded runs are available on phones. [Build and record the patrol](tools/patrol/README.md).
- Joystick offers five labeled motion references in static builds. The published BONES-SEED G1 model accepts custom velocity commands. The page loads model weights only when a visitor requests generation.
- SuperMimicKit overlays target and measured link poses for two maneuvers, runs either course A tracker locally on WebGPU and supports synchronized frame inspection.
- SeMoCo links the unified repository from a stable project URL. The two dances are newly sampled legacy-model outputs, retargeted to G1 and A3 and filmed in the original Joystick showroom. [Replay production](tools/semoco/README.md).

## Attribution

Apache-2.0 covers team-authored source. Third-party dependencies, robot geometry, model weights, fonts and motion media retain their separate terms. Unitree and AGIBOT asset provenance accompanies the GLB files in public/joystick. The AGIBOT notice and license are in public/media/a3. Inter is distributed under the SIL Open Font License in public/fonts/OFL.txt.
