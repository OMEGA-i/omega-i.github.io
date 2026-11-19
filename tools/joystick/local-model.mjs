import { createReadStream, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";

export function localJoystickModel() {
  return localModel(
    "Joystick",
    "/__joystick_model/",
    "__JOYSTICK_DEV_MODEL__",
    "signature.json",
    ["joystick.onnx"],
  );
}
export function localPatrolModel(body) {
  return localModel(
    "patrol-rc/"+body,
    "/__patrol/"+body+"/",
    "__"+body.toUpperCase()+"_PATROL_DEV__",
    "patrol.json",
    ["actor.onnx", "warehouse.xml", "gait.f32"],
  );
}
function localModel(folder, prefix, constant, manifestFile, assets) {
  const root = folder.startsWith("patrol-rc/") ? process.env.PATROL_BUNDLE_DIR : process.env.JOYSTICK_MODEL_DIR;
  const directory = root && resolve(root, folder.startsWith("patrol-rc/") ? folder.split("/")[1] : ".");
  const files = new Set([manifestFile,...assets]);
  const available = directory && [...files].every(name => existsSync(join(directory,name)));
  return {
    name: "local-model-" + folder,
    config(_config, { command }) {
      const manifest =
        command === "serve" && available ? prefix + manifestFile : "";
      return { define: { [constant]: JSON.stringify(manifest) } };
    },
    configureServer(server) {
      if (!available) return;
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url || "/", "http://localhost");
        if (!url.pathname.startsWith(prefix)) return next();
        const file = url.pathname.slice(prefix.length);
        if (!files.has(file) || !["GET", "HEAD"].includes(req.method)) {
          res.writeHead(404);
          res.end();
          return;
        }
        const path = join(directory, file);
        res.writeHead(200, {
          "Content-Type": file.endsWith(".json")
            ? "application/json"
            : "application/octet-stream",
          "Content-Length": statSync(path).size,
          "Cache-Control": "private, no-store",
        });
        if (req.method === "HEAD") {
          res.end();
          return;
        }
        const stream = createReadStream(path);
        stream.on("error", (error) => res.destroy(error));
        res.on("close", () => stream.destroy());
        stream.pipe(res);
      });
    },
  };
}
