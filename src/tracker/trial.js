import { startRun } from "../patrol/physics";
export const routes = {
  turn: [["approach",.95,0,0],["turn",1,1.35,.4]],
  walk: [["walk",2,0,.6]],
};
export async function trial(course,action,signal,report) {
  const sim=startRun(course,routes[action],null,true);
  const frames=[];
  function record(s){
    const row={xy:s.xy,yaw:s.yaw,time:s.time};
    for(const key of ["linkPositions","linkRotations","referencePositions","referenceRotations"])
      row[key]=Array.from(s[key],v=>Number(v.toFixed(5)));
    frames.push(row);
  }
  try {
    record(sim.state());
    for(let i=1;i<=400;i++){
      signal.throwIfAborted();
      const s=await sim.step();
      if(i%2===0 || s.end)record(s);
      if(i%20===0)report(s.time);
      if(s.end)return {frames,end:s.end};
    }
    return {frames,end:"time-limit"};
  } finally {sim.dispose();}
}
