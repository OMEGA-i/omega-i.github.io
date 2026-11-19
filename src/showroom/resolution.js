// Measure the render call only. Changing drawing-buffer density leaves physics and playback clocks intact.
export function adaptiveRender(renderer) {
  const ceiling=Math.min(devicePixelRatio,2);
  const adaptive=matchMedia("(pointer:coarse)").matches && ceiling>1;
  let sum=0,count=0;
  return (scene,camera)=>{
    if(!adaptive){renderer.render(scene,camera);return;}
    const start=performance.now();
    renderer.render(scene,camera);
    sum+=performance.now()-start;
    if(++count<40)return;
    const average=sum/count, ratio=renderer.getPixelRatio();
    const next=average>22 ? Math.max(1,ratio-.25) : average<7 ? Math.min(ceiling,ratio+.25) : ratio;
    if(next!==ratio)renderer.setPixelRatio(next);
    sum=0;count=0;
  };
}
