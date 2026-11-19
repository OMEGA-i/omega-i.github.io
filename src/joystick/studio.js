import { createScene, createVideoScene } from "./scene";

export async function mountJoystick(host) {
  const get = (key) => host.querySelector("[data-" + key + "]");
  const zh = host.dataset.lang === "zh";
  const t = (en, cn) => (zh ? cn : en);
  const status = get("status"),
    vx = get("vx"),
    vy = get("vy"),
    pad = get("pad"),
    preset = get("preset");
  const play = get("play"),
    slider = get("frame"),
    clock = get("time"),
    run = get("run"),
    mode = get("mode");
  let live = host.dataset.model;
  let manifest,
    scene,
    generate,
    currentFrame = 36,
    playing = false,
    timer = 0,
    generation = 0;
  const showStatus = (message) => {
    status.textContent = message;
  };
  const body=get("body"), second=get("a3");
  let recordedId="", activeAvatar, failedClip;
  function syncBody(){
    const a3=body.value==="a3" && Boolean(recordedId);
    host.dataset.bodyActive=a3?"a3":"g1";
    const clip=a3?recordedId:null;
    if(scene?.setAvatar && clip!==activeAvatar){
      activeAvatar=clip;failedClip=null;
      scene.setAvatar(clip).catch(()=>{if(activeAvatar===clip){failedClip=clip;syncBody();}});
    }
    const useVideo=a3&&(!scene?.interactive||failedClip===clip);
    second.hidden=!useVideo;
    get("retarget").hidden=!a3;
    get("body-name").textContent=a3?"AGIBOT A3":"Unitree G1";
    if(!useVideo)return;
    if(second.dataset.clip!==recordedId){
      second.dataset.clip=recordedId;
      second.src="/joystick/a3/"+recordedId+".mp4";
    }else if(second.readyState>=1 && Math.abs(second.currentTime-currentFrame/25)>.01){
      second.currentTime=currentFrame/25;
    }
  }
  second.onloadedmetadata=syncBody;
  body.onchange=syncBody;
  const setFrame = (frame) => {
    currentFrame = frame;
    slider.value = String(frame);
    clock.textContent = (frame / 25).toFixed(2) + " s";
    scene?.draw(frame);
    syncBody();
  };
  const stop = () => {
    playing = false;
    cancelAnimationFrame(timer);
    play.textContent = t("Play", "播放");
    play.setAttribute("aria-pressed", "false");
  };
  function start() {
    if (playing) {
      stop();
      return;
    }
    if (currentFrame === 59) setFrame(0);
    playing = true;
    play.textContent = t("Pause", "暂停");
    play.setAttribute("aria-pressed", "true");
    const start = performance.now() - currentFrame * 40;
    const tick = (now) => {
      const next = Math.min(59, Math.floor((now - start) / 40));
      if (next !== currentFrame) setFrame(next);
      if (next === 59) stop();
      else timer = requestAnimationFrame(tick);
    };
    timer = requestAnimationFrame(tick);
  }
  function syncPad() {
    const x = Number(vx.value) || 0,
      y = Number(vy.value) || 0;
    pad.firstElementChild.style.left = 50 - 21 * y + "%";
    pad.firstElementChild.style.top = 50 - 21 * x + "%";
    const match = manifest?.samples.find(
      (s) => s.velocity[0] === x && s.velocity[1] === y,
    );
    preset.value = match?.id || "";
  }
  function point(event) {
    const r = pad.getBoundingClientRect();
    const x = (0.5 - (event.clientY - r.top) / r.height) * 4,
      y = (0.5 - (event.clientX - r.left) / r.width) * 4;
    const factor = Math.max(1, Math.hypot(x, y) / 2);
    vx.value = (x / factor).toFixed(2);
    vy.value = (y / factor).toFixed(2);
    syncPad();
  }
  pad.onpointerdown = (e) => {
    pad.setPointerCapture(e.pointerId);
    point(e);
  };
  pad.onpointermove = (e) => {
    if (pad.hasPointerCapture(e.pointerId)) point(e);
  };
  vx.oninput = vy.oninput = syncPad;
  function controls(ready) {
    run.disabled = !ready;
    play.disabled = !ready;
    slider.disabled = !ready;
  }
  function publishReference(motion, velocity, origin) {
    host.dispatchEvent(
      new CustomEvent("omega:reference", {
        bubbles: true,
        detail: {
          positions: motion.positions,
          rotations: motion.quaternions || motion.matrices,
          rotationFormat: motion.quaternions ? "xyzw" : "matrix3",
          names: manifest.jointNames,
          velocity,
          fps: 25,
          xmlSha256: manifest.xmlSha256,
          origin,
        },
      }),
    );
  }
  async function replay(sample, initial = false) {
    const request = ++generation;
    stop();
    controls(false);
    try {
      const count = sample.frames * manifest.jointNames.length;
      async function read(suffix, components, scale) {
        const response = await fetch("/joystick/" + sample.id + suffix);
        if (!response.ok) throw new Error("REPLAY");
        const buffer = await response.arrayBuffer();
        if (buffer.byteLength !== count * components * 2)
          throw new Error("LENGTH");
        const view = new DataView(buffer);
        return Float32Array.from(
          { length: count * components },
          (_, i) => view.getInt16(2 * i, true) / scale,
        );
      }
      const [positions, quaternions] = await Promise.all([
        read(".bin", 3, 1000),
        read(".quat", 4, 32767),
      ]);
      if (request !== generation) return;
      scene.setMotion(
        { positions, quaternions },
        sample.frames,
        sample.velocity,
        sample.id,
      );
      activeAvatar=undefined;recordedId=sample.id;body.options[1].disabled=false;
      setFrame(initial ? 36 : 0);
      publishReference({ positions, quaternions }, sample.velocity, "replay");
      mode.textContent = scene.interactive
        ? t("Walking reference preview", "步态参考示意")
        : t("G1 video replay · 3D unavailable", "G1 视频回放 · 3D 不可用");
      const command = sample.velocity.join(" / ") + " m/s";
      showStatus(t("Recorded command · ", "预录指令 · ") + command +
        (live && !generate ? t(" · First download ≈ 703 MiB", " · 首次生成需下载约 703 MiB") : ""));
    } finally {
      if (request === generation) controls(true);
    }
  }
  const replayError = () =>
    showStatus(
      t(
        "The sample could not be loaded. Select it to retry.",
        "样例加载失败。请重新选择以重试。",
      ),
    );
  preset.onchange = () => {
    const s = manifest?.samples.find((s) => s.id === preset.value);
    if (!s) return;
    [vx.value, vy.value] = s.velocity.map(String);
    syncPad();
    replay(s).catch(replayError);
  };
  slider.oninput = () => {
    stop();
    setFrame(Number(slider.value));
  };
  play.onclick = start;
  get("follow").onclick = () => {
    const enabled = get("follow").getAttribute("aria-pressed") !== "true";
    scene?.setFollowing?.(enabled);
    get("follow").setAttribute("aria-pressed",String(enabled));
  };
  get("reset-camera").onclick = () => scene?.reset();
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
  });
  run.onclick = async () => {
    if (!vx.reportValidity() || !vy.reportValidity() || !vx.value || !vy.value)
      return;
    const x = Number(vx.value),
      y = Number(vy.value);
    const sample = manifest.samples.find(
      (s) => s.velocity[0] === x && s.velocity[1] === y,
    );
    if (!live) {
      if (sample) {
        await replay(sample).catch(replayError);
        return;
      }
      showStatus(
        t(
          "This command needs the on-device model. Choose one of the five recorded commands to inspect it.",
          "此指令需要端侧模型。请选择五组已记录指令之一查看回放。",
        ),
      );
      return;
    }
    const request = ++generation;
    stop();
    controls(false);
    preset.disabled = true;
    showStatus(t("Preparing WebGPU…", "正在准备 WebGPU…"));
    try {
      if (!generate) {
        const { createGenerator } = await import("./infer");
        generate = await createGenerator(
          live,
          manifest.jointNames,
          (stage, bytes, total) => {
            showStatus(
              stage === "download"
                ? t("Loading model ", "载入模型 ") +
                    Math.round((100 * bytes) / total) +
                    "%"
                : t("Compiling model…", "正在编译模型…"),
            );
          },
        );
      }
      showStatus(t("Generating motion on this device…", "正在此设备生成动作…"));
      const motion = await generate(x, y);
      if (request !== generation) return;
      recordedId="";body.value="g1";body.options[1].disabled=true;
      scene.setMotion(motion, 60, [x, y]);
      publishReference(motion, [x, y], "live");
      setFrame(0);
      mode.textContent = t("On-device generation", "设备现场生成");
      showStatus(
        t("Generated motion reference", "已生成运动参考") +
          " · " +
          x +
          " / " +
          y +
          " m/s",
      );
      start();
    } catch {
      generate = null;
      await replay(sample || manifest.samples[0]);
      showStatus(
        t(
          "On-device generation unavailable. Showing a recorded sample for ",
          "设备现场生成不可用。当前显示预生成指令 ",
        ) +
          (sample || manifest.samples[0]).velocity.join(" / ") +
          " m/s.",
      );
    } finally {
      controls(true);
      preset.disabled = false;
    }
  };
  controls(false);
  try {
    const r = await fetch("/joystick/samples.json");
    if (!r.ok) throw new Error("MANIFEST");
    manifest = await r.json();
    try {
      scene = await createScene(get("view"), manifest.jointNames);
    } catch {
      scene = createVideoScene(get("view"));
      get("reset-camera").hidden = true;
      get("follow").hidden = true;
      live = "";
      run.textContent = t("Load command replay", "载入此指令的回放");
      get("view").setAttribute(
        "aria-label",
        t("G1 reference video replay", "G1 运动参考视频回放"),
      );
    }
    syncPad();
    await replay(manifest.samples[0], true);
  } catch {
    replayError();
    controls(false);
  }
}
