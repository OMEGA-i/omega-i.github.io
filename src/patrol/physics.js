// A3 uses a 50 Hz control loop and four 5 ms MuJoCo steps per action.
import mjModule from "@mujoco/mujoco?url";
import mjWasm from "@mujoco/mujoco/mujoco.wasm?url";
import * as ort from "onnxruntime-web/webgpu";
import ortWasm from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url";

const DT = .02;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const yaw = (q) =>
  Math.atan2(2 * (q[0] * q[3] + q[1] * q[2]), 1 - 2 * (q[2] ** 2 + q[3] ** 2));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
function rotateXY(array, start, angle, gain) {
  const x = array[start],
    y = array[start + 1],
    c = Math.cos(angle),
    s = Math.sin(angle);
  array[start] = gain * (x * c - y * s);
  array[start + 1] = gain * (x * s + y * c);
  array[start + 2] *= gain;
}
async function fetchAsset(url, signal) {
  const r = await fetch(url, { signal });
  if (!r.ok) throw Error("Asset " + r.status);
  return r;
}
export async function loadCourse(manifest, signal) {
  if (!navigator.gpu || !(await navigator.gpu.requestAdapter()))
    throw Error("WebGPU");
  const base = new URL(manifest, location.href);
  const cfg = await (await fetchAsset(base, signal)).json();
  const asset = (name) => fetchAsset(new URL(cfg[name], base), signal);
  const { default: loadMuJoCo } = await import(/* @vite-ignore */ mjModule);
  const [mj, xml, gait, actor] = await Promise.all([
    loadMuJoCo({ locateFile: () => mjWasm }),
    asset("physics").then((r) => r.text()),
    asset("gait").then((r) => r.arrayBuffer()),
    asset("actor").then((r) => r.arrayBuffer()),
  ]);
  signal.throwIfAborted();
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmPaths = { wasm: new URL(ortWasm, location.href).href };
  const model = mj.MjModel.from_xml_string(xml);
  try {
    const net = await ort.InferenceSession.create(actor, {
      executionProviders: ["webgpu"],
    });
    return {
      cfg,
      mj,
      model,
      net,
      gait: new Float32Array(gait),
      async dispose() {
        model.delete();
        await net.release();
      },
    };
  } catch (error) {
    model.delete();
    throw error;
  }
}

export function startRun(course, route, capture, trackReference = false) {
  const { mj, model, cfg, net, gait } = course,
    data = new mj.MjData(model);
  const reference = trackReference ? new mj.MjData(model) : null;
  const NJ=cfg.qids.length, OBS=3*NJ+6, DIM=cfg.dim;
  const history = new Float32Array(10 * OBS),
    goals = new Float32Array(11 * DIM);
  const frame = (i) => gait.subarray(i * DIM, (i + 1) * DIM);
  const initial = frame(0),
    still = frame(1),
    period = gait.length / DIM - 2;
  let tick = 0,
    gain = 0,
    stage = 0,
    outsideTicks = 0,
    held = 0;
  const completed = [];
  data.qpos.set(initial.subarray(0, 7));
  data.qvel.set(initial.subarray(7, 10));
  // Convert world angular velocity to the local frame of the free joint.
  function inverseRotate(q, v) {
    const [w, x, y, z] = q,
      [a, b, c] = v;
    const u = 2 * (z * b - y * c),
      h = 2 * (x * c - z * a),
      k = 2 * (y * a - x * b);
    return [
      a + w * u + z * h - y * k,
      b + w * h + x * k - z * u,
      c + w * k + y * u - x * h,
    ];
  }
  data.qvel.set(
    inverseRotate(initial.subarray(3, 7), initial.subarray(10, 13)),
    3,
  );
  cfg.qids.forEach((id, j) => (data.qpos[id] = initial[13 + j]));
  cfg.vids.forEach((id, j) => (data.qvel[id] = initial[13 + NJ + j]));
  data.ctrl.set(cfg.default);
  mj.mj_forward(model, data);
  function alignReference(goal) {
    if (!reference) return;
    reference.qpos.set(goal.subarray(0, 7));
    // The tracker consumes root-relative XY. Overlay both bodies at the measured pelvis XY.
    reference.qpos.set(data.qpos.subarray(0, 2));
    cfg.qids.forEach((id,j) => reference.qpos[id] = goal[13+j]);
    mj.mj_forward(model,reference);
  }
  alignReference(initial);
  function observe(action) {
    history.copyWithin(0, OBS);
    const dest = history.subarray(9 * OBS);
    cfg.qids.forEach((id, j) => (dest[j] = data.qpos[id] - cfg.default[j]));
    cfg.vids.forEach((id, j) => (dest[NJ + j] = data.qvel[id]));
    dest.set(data.qvel.subarray(3, 6), 2 * NJ);
    dest.set(inverseRotate(data.qpos.subarray(3, 7), [0, 0, -1]), 2 * NJ + 3);
    dest.set(action, 2 * NJ + 6);
  }
  const snapshot=()=>[...data.qpos.slice(0,7),...data.qvel.slice(0,6),...cfg.qids.map(i=>data.qpos[i])];
  if(capture)capture({state:snapshot()});
  observe(new Float32Array(NJ));
  for (let i = 0; i < 9; i++) history.set(history.subarray(9 * OBS), i * OBS);
  function local(x, y) {
    return cfg.basis.map(
      ([a, b]) => (x - cfg.origin[0]) * a + (y - cfg.origin[1]) * b,
    );
  }
  const angle0 = Math.atan2(cfg.basis[0][1], cfg.basis[0][0]);
  function state() {
    const q = data.qpos,
      head = cfg.head;
    const headQ = data.xquat.subarray(4 * head, 4 * head + 4);
    const headPos = data.xpos.subarray(3 * head, 3 * head + 3);
    const offset = inverseRotate(
      [headQ[0], -headQ[1], -headQ[2], -headQ[3]],
      cfg.eyeOffset,
    );
    const forward = inverseRotate(
      [headQ[0], -headQ[1], -headQ[2], -headQ[3]],
      [Math.cos((11 * Math.PI) / 180), 0, -Math.sin((11 * Math.PI) / 180)],
    );
    return {
      ...(reference ? {referencePositions:reference.xpos.slice(),referenceRotations:reference.xquat.slice()} : {}),
      linkPositions:data.xpos.slice(),linkRotations:data.xquat.slice(),
      xy: local(q[0], q[1]),
      yaw: yaw(q.subarray(3, 7)) - angle0,
      eye: [
        ...local(headPos[0] + offset[0], headPos[1] + offset[1]),
        headPos[2] + offset[2],
      ],
      eyeYaw: Math.atan2(forward[1], forward[0]) - angle0,
      time: tick * DT,
      completed: [...completed],
      holding: held > 0 && route[stage]?.[3] > 0,
    };
  }
  let impulseTicks = 0;
  function pushLink(link, force) {
    data.xfrc_applied.fill(0);
    data.xfrc_applied.set(force, 6 * link);
    impulseTicks = 6;
  }
  async function step() {
    const [id, x, y, dwell] = route[stage];
    const q = data.qpos,
      rotation = yaw(q.subarray(3, 7)),
      [px, py] = local(q[0], q[1]);
    const distance = Math.hypot(x - px, y - py);
    const error =
      distance < 0.38
        ? 0
        : wrap(Math.atan2(y - py, x - px) + angle0 - rotation);
    const target = dwell && distance < (held ? .50 : .37)
      ? 0
      : clamp(distance / .72, .75, 1) * Math.max(.35, Math.cos(error));
    gain += clamp(target - gain, -0.055, 0.055);
    const omega = clamp(2.6 * error, -1.25, 1.25);
    let sumX = 0,
      sumY = 0;
    for (let k = 0; k < 11; k++) {
      const source = frame(2 + ((tick + k) % period));
      const row = goals.subarray(k * DIM, (k + 1) * DIM);
      row.set(source);
      const delta = rotation + omega * k * DT - yaw(source.subarray(3, 7));
      const c = Math.cos(delta / 2),
        s = Math.sin(delta / 2);
      const [qw, qx, qy, qz] = source.subarray(3, 7);
      row.set(
        [c * qw - s * qz, c * qx - s * qy, c * qy + s * qx, c * qz + s * qw],
        3,
      );
      row[7] *= 2.4;
      rotateXY(row, 7, delta, gain);
      rotateXY(row, 10, delta, gain);
      row[12] += omega;
      sumX += row[7] * DT;
      sumY += row[8] * DT;
      const first = frame(2 + (tick % period));
      row[0] = first[0] + sumX;
      row[1] = first[1] + sumY;
      for (let j = 0; j < NJ; j++) {
        row[13 + j] = still[13 + j] * (1 - gain) + row[13 + j] * gain;
        row[13 + NJ + j] *= gain;
      }
    }
    const feeds = {
      history: new ort.Tensor("float32", history, [1, 10, OBS]),
      goals: new ort.Tensor("float32", goals, [1, 11, DIM]),
    };
    const { action } = await net.run(feeds);
    try {
      const a = action.data;
      if (!a.every(Number.isFinite)) throw Error("Invalid action");
      for (let j = 0; j < NJ; j++)
        data.ctrl[j] = cfg.default[j] + cfg.scale[j] * a[j];
      for (let i = 0; i < 4; i++) mj.mj_step(model, data);
      mj.mj_forward(model, data);
      if (impulseTicks > 0 && --impulseTicks === 0) data.xfrc_applied.fill(0);
      alignReference(goals.subarray(DIM,2*DIM));
      observe(a);
      if(capture)capture({state:snapshot(),action:[...a],command:[tick,Math.hypot(goals[7],goals[8]),omega,stage]});
    } finally {
      action.dispose();
      feeds.history.dispose();
      feeds.goals.dispose();
    }
    tick++;
    const [nx, ny] = local(q[0], q[1]);
    const previous = route[stage - 1] || ["dock", 0, 0];
    const dx = x - previous[1], dy = y - previous[2];
    const along = clamp(((nx - previous[1]) * dx + (ny - previous[2]) * dy) / (dx * dx + dy * dy || 1), 0, 1);
    const deviation = Math.hypot(nx - previous[1] - along * dx, ny - previous[2] - along * dy);
    outsideTicks = deviation > 1.0 ? outsideTicks + 1 : 0;
    const speed = Math.hypot(nx - px, ny - py) / DT;
    held =
      Math.hypot(nx - x, ny - y) <= 0.55 && (!dwell || speed <= 0.28)
        ? held + 1
        : 0;
    if (held >= Math.max(1, dwell / DT)) {
      if(capture)capture({event:[id,tick*DT]});
      if (dwell) completed.push(id);
      stage++;
      held = 0;
    }
    const tilt = inverseRotate(q.subarray(3, 7), [0, 0, -1])[2];
    const refTilt = inverseRotate(
      goals.subarray(DIM + 3, DIM + 7),
      [0, 0, -1],
    )[2];
    const failed =
      !Number.isFinite(nx + ny + q[2]) ||
      Math.abs(q[2] - goals[DIM + 2]) > 0.25 ||
      Math.abs(tilt - refTilt) > 0.8;
    return {
      ...state(),
      end: failed
        ? "fall"
        : stage === route.length
          ? "returned"
          : outsideTicks >= 25
            ? "offroute"
            : tick >= 7500
            ? "timeout"
            : null,
    };
  }
  return { step, state, pushLink, dispose() { reference?.delete(); data.delete(); } };
}
