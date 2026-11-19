# OMEGA research group

Bilingual Astro site for Joystick, PlayGround and SeMoCo. Use Node 24, install with `npm ci`, then run `npm run dev`. Open `/en/` or `/zh/`. The theme selector and language switch work on project and article pages.

## Preview the release

Use the two attachments named in [the release lock](tools/patrol/release-lock.json). For a local rehearsal put them in the directory named by PATROL_ARCHIVES.

```sh
PUBLIC_G1_PATROL_MANIFEST=/models/g1/patrol.json PUBLIC_A3_PATROL_MANIFEST=/models/a3/patrol.json npm run build
python3 tools/patrol/release.py stage "$PATROL_ARCHIVES" dist
npm run preview
```

The manual Pages workflow performs the same build, downloads the pinned attachments and verifies their hashes. Use the organization repository omega-i.github.io and GitHub Actions as the Pages source. For browser tests run `npx playwright install chromium` and `npm test` after building.

## Projects and media

- PlayGround runs a body-specific tracker in the browser on WebGPU with MuJoCo physics. The route and both cameras use the same warehouse. Prerecorded runs are available on phones. [Build and record the patrol](tools/patrol/README.md).
- Joystick offers five labeled motion references in static builds. A separately licensed browser model can be enabled through PUBLIC_JOYSTICK_MODEL_MANIFEST. The page loads model weights only when a visitor requests generation.
- SeMoCo links the unified repository from a stable project URL. The two dances are newly sampled legacy-model outputs, retargeted to G1 and A3 and filmed in the original Joystick showroom. [Replay production](tools/semoco/README.md).

## Attribution

Apache-2.0 covers team-authored source. Third-party dependencies, robot geometry, model weights, fonts and motion media retain their separate terms. Unitree and AGIBOT asset provenance accompanies the GLB files in public/joystick. The AGIBOT notice and license are in public/media/a3. Inter is distributed under the SIL Open Font License in public/fonts/OFL.txt.
