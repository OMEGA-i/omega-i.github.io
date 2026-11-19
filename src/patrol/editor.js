import { allowed, plan } from "./route.js";
const SVG = "http://www.w3.org/2000/svg";
const point = (x, y) => [54 + x * 42, 194 - y * 42];
export function mountLive(root) {
  const episode = root.closest("[data-episode]"),
    body = episode.querySelector("omega-model-switch");
  const get = (name) => root.querySelector("[data-" + name + "]");
  const en = root.dataset.lang === "en",
    t = (a, b) => (en ? a : b);
  const layout = JSON.parse(root.dataset.layout),
    names = JSON.parse(root.dataset.names),
    stops = [];
  const dock = layout.route.find((n) => n[0] === "dock");
  const svg = get("floor"),
    start = get("start-live"),
    stop = get("stop-live"),
    undo = get("undo");
  let active,
    course,
    open = false;
  let openFromLink =
    new URLSearchParams(location.search).get("mode") === "live";
  const name = (id) => names[id] || t("Point ", "点位 ") + id.split("-")[1];
  const status = (s) => (get("status-live").textContent = s);
  function availability() {
    if (!navigator.gpu)
      return t(
        "This device cannot run WebGPU. Switch to the recorded patrol.",
        "此设备无法使用 WebGPU，可切换到巡检回放。",
      );
    if (!root.dataset.manifest)
      return t(
        "Live weights are unavailable here. Recorded patrols are available.",
        "此版本未配置现场策略权重，可查看巡检回放。",
      );
    return "";
  }
  function resetView() {
    get("measured").setAttribute("points", "");
    get("robot-marker").setAttribute("transform", "translate(54 194)");
    get("sim-time").textContent = "0.00 s";
    get("poster").hidden = false;
  }
  function paintPlan() {
    const route = plan(stops, layout);
    const points = [dock, ...(route || [])].map((n) =>
      point(n[1], n[2]).join(","),
    );
    get("planned").setAttribute("points", points.join(" "));
    get("order").textContent = stops.length
      ? [name("dock"), ...stops.map((n) => name(n[0])), name("dock")].join(
          " → ",
        )
      : t("Choose your inspection stops", "选择巡检点");
    for (const pin of svg.querySelectorAll('[role="button"]')) {
      const order = stops.findIndex((n) => n[0] === pin.dataset.stationId);
      pin.setAttribute("aria-pressed", String(order >= 0));
      pin.querySelector(".ordinal").textContent =
        order >= 0 ? String(order + 1) : "";
    }
    get("custom").replaceChildren(
      ...stops
        .filter((n) => !names[n[0]])
        .map(([id, x, y]) => {
          const g = document.createElementNS(SVG, "g"),
            c = document.createElementNS(SVG, "circle"),
            label = document.createElementNS(SVG, "text");
          g.setAttribute("transform", "translate(" + point(x, y) + ")");
          g.setAttribute("class", "free-pin");
          c.setAttribute("r", "7");
          c.setAttribute("fill", "#335fb6");
          c.setAttribute("stroke", "white");
          label.setAttribute("y", "20");
          label.textContent = name(id);
          g.append(c, label);
          return g;
        }),
    );
    undo.disabled = !stops.length || !!active;
    start.disabled =
      !stops.length ||
      !!active ||
      !route ||
      !root.dataset.manifest ||
      !navigator.gpu;
    stop.hidden = !active;
  }
  function edit(node) {
    if (active) return;
    const i = stops.findIndex((n) => n[0] === node[0]);
    if (i >= 0) stops.splice(i, 1);
    else {
      if (!allowed(node, layout.racks) || !plan([...stops, node], layout)) {
        status(
          t(
            "Choose a clear spot inside the patrol aisle.",
            "请选择巡检通道中的空地。",
          ),
        );
        return;
      }
      stops.push(node);
    }
    resetView();
    paintPlan();
    status(
      availability() ||
        t(
          "The robot will visit these stops in order, then return to dock.",
          "机器人将按此顺序停靠，再返回充电区。",
        ),
    );
  }
  svg.onclick = (e) => {
    if (active) return;
    const pin = e.target.closest("[data-station-id]");
    if (pin) {
      if (pin.dataset.stationId !== "dock")
        edit(layout.route.find((n) => n[0] === pin.dataset.stationId));
      return;
    }
    const pos = new DOMPoint(e.clientX, e.clientY).matrixTransform(
      svg.getScreenCTM().inverse(),
    );
    edit([
      "p-" +
        (1 +
          Math.max(
            0,
            ...stops
              .filter((n) => !names[n[0]])
              .map((n) => Number(n[0].slice(2))),
          )),
      Math.round(((pos.x - 54) / 42) * 10) / 10,
      Math.round(((194 - pos.y) / 42) * 10) / 10,
      2,
    ]);
  };
  svg.onkeydown = (e) => {
    if (e.target.matches('[role="button"]') && ["Enter", " "].includes(e.key)) {
      e.preventDefault();
      edit(layout.route.find((n) => n[0] === e.target.dataset.stationId));
    }
  };
  undo.onclick = () => {
    if (!active && stops.length) edit(stops.at(-1));
  };
  function changeMode(value) {
    open = value;
    if (!value) {
      active?.abort();
      resetView();
    } else {
      episode.querySelector("video").pause();
      status(
        availability() ||
          t(
            "Select stations or clear floor, in visit order.",
            "按顺序点选站点或通道空地。",
          ),
      );
    }
    episode.toggleAttribute("data-live-open", open);
    get("editor").hidden = !open;
    for (const [button, on] of [
      [get("design"), open],
      [get("recorded"), !open],
    ]) {
      button.setAttribute("aria-pressed", String(on));
      button.classList.toggle("selected", on);
    }
    paintPlan();
  }
  function syncBody() {
    active?.abort();
    root.dataset.manifest=root.dataset[body.value] || "";
    resetView();
    get("poster").src=body.value==="a3"?"/inspection/a3-start.webp":"/inspection/start.webp";
    get("poster").style.left=get("live-angle").value==="eye"?"-100%":"0";
    if(open)status(availability()||t("Route ready at dock.","路线已保留，从充电区出发。"));
    paintPlan();
    if (openFromLink) {
      openFromLink = false;
      changeMode(true);
    }
  }
  get("live-angle").onchange=()=>get("poster").style.left=get("live-angle").value==="eye"?"-100%":"0";
  body.addEventListener("change", syncBody);
  customElements.whenDefined("omega-model-switch").then(syncBody);
  // Initial body selection from a direct URL can be applied by the replay module.
  queueMicrotask(() => {
    if (customElements.get("omega-model-switch")) syncBody();
  });
  get("design").onclick = () => changeMode(true);
  get("recorded").onclick = () => changeMode(false);
  stop.onclick = () => active?.abort();
  const panel = episode.closest('[role="tabpanel"]');
  if (panel)
    new MutationObserver(() => {
      if (panel.hidden && open) changeMode(false);
    }).observe(panel, { attributes: true, attributeFilter: ["hidden"] });
  async function releaseCourse() {
    const old = course;
    course = null;
    if (old) await old.dispose();
  }
  window.addEventListener("pagehide", () => {
    active?.abort();
    if (!active) void releaseCourse();
  });
  start.onclick = async () => {
    if (active || !stops.length) return;
    const controller = new AbortController(),
      { signal } = controller;
    active = controller;
    const route = plan(stops, layout),
      trail = [],
      editorCanvas = get("eye");
    let sim,
      eye,
      releaseAfterRun = false;
    resetView();
    paintPlan();
    status(t("Loading robot policy and warehouse…", "正在加载机器人策略与仓库…"));
    try {
      const [{ loadCourse, startRun }, { makeEye }] = await Promise.all([
        import("./physics.js"),
        import("./eye.js"),
      ]);
      signal.throwIfAborted();
      if(course && course.cfg.body!==body.value)await releaseCourse();
      if (!course) course = await loadCourse(root.dataset.manifest, signal);
      signal.throwIfAborted();
      // A WebGL context is released after each patrol. Give the next run a fresh canvas.
      const canvas = editorCanvas.cloneNode(false);
      editorCanvas.replaceWith(canvas);
      eye = await makeEye(canvas, signal,course.cfg);
      signal.throwIfAborted();
      sim = startRun(course, route);
      let s = sim.state(),
        lastNotice = "";
      while (true) {
        signal.throwIfAborted();
        eye.draw(s,get("live-angle").value);
        get("poster").hidden = true;
        const xy = point(...s.xy);
        trail.push(xy.map((n) => n.toFixed(2)).join(","));
        get("measured").setAttribute("points", trail.join(" "));
        get("robot-marker").setAttribute(
          "transform",
          "translate(" + xy + ") rotate(" + (-s.yaw * 180) / Math.PI + ")",
        );
        get("sim-time").textContent = s.time.toFixed(2) + " s";
        if (s.end) {
          status(
            s.end === "returned"
              ? t("Patrol complete · back at dock", "巡检完成 · 已返回充电区")
              : s.end === "fall"
                ? t(
                    "Tracking ended before the next stop.",
                    "跟踪提前结束，未到达下一站。",
                  )
                : s.end === "offroute"
                  ? t("Patrol ended off route.", "机器人偏离路线，巡检结束。")
                  : t("Patrol timed out.", "巡检超时。"),
          );
          break;
        }
        const notice = s.completed.length + "/" + s.holding;
        if (notice !== lastNotice) {
          lastNotice = notice;
          const count = s.completed.length;
          status(
            (s.holding
              ? t("Stopping at ", "正在停靠")
              : t("En route to ", "正在前往")) +
              name(stops[count]?.[0] || "dock") +
              t(" · stops visited ", " · 已巡检 ") +
              count +
              "/" +
              stops.length,
          );
        }
        // Never skip physics control ticks. Display at most every 2 ticks.
        const wall = performance.now();
        for (let i = 0; i < 2 && !s.end; i++) {
          signal.throwIfAborted();
          s = await sim.step();
        }
        await new Promise((resolve) =>
          setTimeout(resolve, Math.max(0, 40 - (performance.now() - wall))),
        );
      }
    } catch (error) {
      if (signal.aborted) status(t("Patrol stopped.", "巡检已停止。"));
      else {
        console.warn("Live patrol", error);
        status(
          t(
            "Could not run the robot policy on this device. Retry or switch to the recording.",
            "此设备未能运行机器人策略，可重试或切换到巡检回放。",
          ),
        );
        releaseAfterRun = true;
      }
    } finally {
      // Preserve the final camera frame after releasing its renderer.
      if (eye && open && get("poster").hidden) {
        const canvas = get("eye"),
          still = document.createElement("canvas");
        still.width = canvas.width;
        still.height = canvas.height;
        if (sim) {
          eye.draw(sim.state(),get("live-angle").value);
          still.getContext("2d")?.drawImage(canvas, 0, 0);
          still.setAttribute("data-eye", "");
          still.setAttribute("aria-label", canvas.getAttribute("aria-label"));
          canvas.replaceWith(still);
        }
      }
      sim?.dispose();
      eye?.dispose();
      if (releaseAfterRun || !open) await releaseCourse();
      active = null;
      paintPlan();
    }
  };
}
