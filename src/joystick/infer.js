// This module is loaded only when a browser is asked to run a verified model.
import * as ort from "onnxruntime-web/webgpu";
import runtimeWasm from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url";

export function category(vx, vy) {
  if (Math.max(Math.abs(vx), Math.abs(vy)) < 0.025) return "idle";
  if (Math.abs(vy) > Math.abs(vx))
    return vy > 0 ? "walk_left_medium" : "walk_right_medium";
  if (vx < 0) return vx > -0.5 ? "walk_backward_slow" : "walk_backward_medium";
  if (vx > 1.4) return "jog_forward_medium";
  if (Math.abs(vy) > 0.2)
    return vy > 0 ? "walk_forward_left_medium" : "walk_forward_right_medium";
  return vx < 0.5 ? "walk_forward_slow" : "walk_forward_medium";
}
export async function createGenerator(manifestUrl, jointNames, progress) {
  if (!navigator.gpu || !(await navigator.gpu.requestAdapter()))
    throw new Error("WEBGPU");
  const absolute = new URL(manifestUrl, location.href);
  const response = await fetch(absolute);
  if (!response.ok) throw new Error("MANIFEST");
  const spec = await response.json();
  if (
    spec.fps !== 25 ||
    spec.frames !== 60 ||
    JSON.stringify(spec.jointNames) !== JSON.stringify(jointNames)
  )
    throw new Error("SIGNATURE");
  let data;
  if (spec.parts) {
    let part = 0, received = 0;
    const compressed = new ReadableStream({
      async pull(controller) {
        if (part === spec.parts.length) { controller.close(); return; }
        const response = await fetch(new URL(spec.parts[part++], absolute));
        if (!response.ok) throw new Error("MODEL");
        const bytes = new Uint8Array(await response.arrayBuffer());
        received += bytes.length;
        progress("download", received, spec.transferBytes);
        controller.enqueue(bytes);
      },
    });
    const reader = compressed.pipeThrough(new DecompressionStream("gzip")).getReader();
    data = new Uint8Array(spec.modelBytes);
    let offset = 0;
    while (true) {
      const {done,value} = await reader.read();
      if (done) break;
      data.set(value,offset);
      offset += value.length;
    }
    if (offset !== data.length || received !== spec.transferBytes) throw new Error("MODEL_LENGTH");
  } else {
    const response = await fetch(new URL(spec.model || "joystick.onnx", absolute));
    if (!response.ok) throw new Error("MODEL");
    data = new Uint8Array(await response.arrayBuffer());
  }
  progress("compile", data.byteLength, data.byteLength);
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmPaths = { wasm: new URL(runtimeWasm, location.href).href };
  const session = await ort.InferenceSession.create(data, {
    executionProviders: ["webgpu"],
    graphOptimizationLevel: "all",
  });
  return async (vx, vy) => {
    const idx = spec.categories.indexOf(category(vx, vy));
    if (idx < 0) throw new Error("CATEGORY");
    const inputs = {
      velocity: new ort.Tensor("float32", Float32Array.of(vx, vy), [2]),
      category: new ort.Tensor("int64", BigInt64Array.of(BigInt(idx)), [1]),
    };
    let result;
    try {
      result = await session.run(inputs);
      const output = result.positions;
      if (String(output.dims) !== String([60, jointNames.length, 3]))
        throw new Error("SHAPE");
      const positions = Float32Array.from(await output.getData());
      if (!positions.every(Number.isFinite)) throw new Error("NAN");
      const rotations = result.world_rotations;
      if (
        !rotations ||
        String(rotations.dims) !== String([60, jointNames.length, 3, 3])
      )
        throw new Error("ROTATION_SHAPE");
      const matrices = Float32Array.from(await rotations.getData());
      if (!matrices.every(Number.isFinite)) throw new Error("ROTATION_NAN");
      return { positions, matrices };
    } finally {
      Object.values(inputs).forEach((x) => x.dispose());
      Object.values(result || {}).forEach((x) => x.dispose());
    }
  };
}
