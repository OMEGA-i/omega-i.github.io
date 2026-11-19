import { chromium } from "@playwright/test";
import fs from "node:fs";
import { spawn, execFileSync } from "node:child_process";
import { join } from "node:path";
import { once } from "node:events";
const [origin, out, avatar="g1", stage="joystick"] = process.argv.slice(2);
if (!origin || !out)
  throw new Error(
    "Usage: node render_previews.mjs DEV_SERVER_URL OUTPUT_DIRECTORY",
  );
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
  headless: true,
});
const page = await browser.newPage({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
});
try {
  await page.route("**/__capture", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: "<!doctype html><html><head><meta charset=utf-8></head><body></body></html>",
    }),
  );
  await page.goto(new URL("/__capture", origin).href);
  await page.evaluate(async ({avatar,stage}) => {
    const { createScene } = await import("/src/joystick/scene.js");
    document.documentElement.removeAttribute("class");
    document.documentElement.style.cssText = "margin:0;";
    document.body.replaceChildren();
    document.body.style.cssText = "margin:0;width:100vw;height:100vh;";
    const el = document.createElement("div");
    el.style.cssText = "position:fixed;inset:0;margin:0;";
    document.body.append(el);
    const manifest = await (await fetch("/joystick/samples.json")).json();
    const scene = await createScene(el, manifest.jointNames);
    window.scene = scene;
    window.el = el;
    window.load = async (s) => {
      const get = async (end, scale) =>
        Float32Array.from(
          new Int16Array(
            await (await fetch("/joystick/" + s.id + end)).arrayBuffer(),
          ),
          (x) => x / scale,
        );
      const q = await get(".quat", 32767);
      const p = await get(".bin", 1000);
      scene.setMotion({ positions: p, quaternions: q }, s.frames, s.velocity);
    };
    if(stage==="tracker"){
      const pair=await (await fetch("/studio/paired-g1.json")).json();
      window.samples=["reference","actual"].map(key=>({id:"tracker-"+avatar+"-"+key,key,frames:pair.frames,fps:pair.fps}));
      window.load=async s=>{
        const packed=new Float32Array(Uint8Array.from(atob(pair[s.key]),x=>x.charCodeAt(0)).buffer);
        const positions=[],quaternions=[];
        for(let j=0;j<packed.length;j+=7){
          positions.push(...packed.subarray(j,j+3));quaternions.push(...packed.subarray(j+3,j+7));
        }
        scene.setMotion({positions,quaternions},pair.frames,pair.velocity,undefined,pair.fps);
        if(avatar==="a3")await scene.setAvatar("tracker-"+s.key);
      };
    }else{
      window.samples=manifest.samples;
      const load=window.load;
      window.load=async s=>{await load(s);if(avatar==="a3")await scene.setAvatar(s.id);};
    }
  },{avatar,stage});
  const samples = await page.evaluate(() => window.samples);
  for (const sample of samples) {
    await page.evaluate((s) => window.load(s), sample);
    const f = spawn("ffmpeg", [
      "-y",
      "-v",
      "error",
      "-f",
      "image2pipe",
      "-vcodec",
      "mjpeg",
      "-framerate",
      String(sample.fps??25),
      "-i",
      "-",
      "-c:v",
      "libx264",
      "-vf",
      "scale=960:600",
      "-pix_fmt",
      "yuv420p",
      "-crf",
      "18",
      "-movflags",
      "+faststart",
      out + "/" + sample.id + ".mp4",
    ]);
    for (let n = 0; n < sample.frames; n++) {
      const result = await page.evaluate((n) => {
        window.scene.draw(n);
        return window.el
          .querySelector("canvas")
          .toDataURL("image/jpeg", 0.975)
          .split(",")[1];
      }, n);
      const b = Buffer.from(result, "base64");
      if (avatar==="g1" && sample.id === "diagonal" && n === 37) {
        execFileSync(
          "cwebp",
          ["-quiet", "-q", "92", "-o", join(out, "cover.webp"), "--", "-"],
          { input: b },
        );
      }
      if (!f.stdin.write(b)) await once(f.stdin, "drain");
    }
    f.stdin.end();
    const [code] = await once(f, "exit");
    if (code !== 0) throw Error("ffmpeg " + code);
    console.log(sample.id);
  }
} finally {
  await browser.close();
}
