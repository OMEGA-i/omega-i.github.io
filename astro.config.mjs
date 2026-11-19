import { defineConfig } from "astro/config";
import { localJoystickModel, localPatrolModel } from "./tools/joystick/local-model.mjs";
export default defineConfig({
  vite: {
    plugins: [localJoystickModel(), localPatrolModel("g1"),localPatrolModel("a3")],
    optimizeDeps: {
      include: [
        "onnxruntime-web/webgpu",
        "three",
        "three/addons/controls/OrbitControls.js",
      ],
    },
  },
  devToolbar: { enabled: false },
  site: "https://omega-i.github.io",
  output: "static",
  trailingSlash: "always",
});
