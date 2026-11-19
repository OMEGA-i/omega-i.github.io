import { chromium } from "@playwright/test";
import { join,resolve } from "node:path";

const [origin, directory]=process.argv.slice(2);
const browser=await chromium.launch({channel:"chrome"});
try{
  const page=await browser.newPage();
  await page.route("**/__course_probe/*",route=>{
    const name=new URL(route.request().url()).pathname.split("/").at(-1);
    if(!["actor.onnx","shapes.json","history.f32","goals.f32","action.f32"].includes(name))return route.abort();
    return route.fulfill({path:join(resolve(directory),name)});
  });
  await page.goto(origin);
  const result=await page.evaluate(async()=>{
    const ort=await import("/node_modules/.vite/deps/onnxruntime-web_webgpu.js");
    ort.env.wasm.numThreads=1;
    ort.env.wasm.wasmPaths={wasm:location.origin+"/node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.wasm"};
    const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw Error("No WebGPU adapter");
    const session=await ort.InferenceSession.create("/__course_probe/actor.onnx",{executionProviders:["webgpu"]});
    const shape=await (await fetch("/__course_probe/shapes.json")).json();
    const values=async k=>new Float32Array(await (await fetch("/__course_probe/"+k+".f32")).arrayBuffer());
    const feeds={};
    for(const name of ["history","goals"])feeds[name]=new ort.Tensor("float32",await values(name),shape[name]);
    const {action}=await session.run(feeds);
    const expected=await values("action");
    if(action.data.length!==expected.length)throw Error("Wrong action dimension");
    const maxError=Math.max(...expected.map((x,i)=>Math.abs(x-action.data[i])));
    if(!(maxError<.001))throw Error("Action parity failed: "+maxError);
    return {actions:expected.length,maxError,adapter:adapter.info.architecture};
  });
  console.log(JSON.stringify(result));
}finally{await browser.close();}
