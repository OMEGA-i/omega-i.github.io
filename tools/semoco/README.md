# Dance playback

The clips were sampled from the team's legacy Flan-T5 150M generator on the text2motion branch (438e41b0). Seeds 44 and 32 generated 176 and 480 SOMA frames respectively at 50 Hz. The player shows the prompts. Each pair of robot movies shares the same decoded human motion and frame clock.

For a generated NPZ containing joints, names, fps, prompt and seed, render each body from the site root with the development server running.

    python tools/semoco/retarget.py motion.npz robot.xml poses.json
    node tools/semoco/film.mjs http://localhost:4321 g1 poses.json dance.mp4

The Three.js film uses the same Joystick showroom furnishings as the interactive viewers. The robots replay fitted poses without a physics controller. The blog's numerical results come from the public SeMoCo paper, Table 5, independently of these clips.
