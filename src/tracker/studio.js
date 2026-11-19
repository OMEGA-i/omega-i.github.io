export function mount(root){
  const get=q=>root.querySelector(q),video=get('video'),body=get('omega-model-switch'),action=get('select'),ghost=get('[data-ghost]'),run=get('[data-run]'),play=get('[data-play]'),range=get('[type=range]'),transport=get('.transport'),status=get('[role=status]');
  const en=root.dataset.en==="true",t=(a,b)=>en?a:b;
  let canvas=get("canvas"),session,view,frames=[],raf,started,index=0;
  function stop(){cancelAnimationFrame(raf);raf=0;play.textContent=t("Play","播放");}
  function draw(i){index=i;range.value=i;view.draw(frames[i],"chase",ghost.checked);get('output').textContent=frames[i].time.toFixed(2)+" s";}
  function animate(now){
    draw(Math.max(0,Math.min(frames.length-1,Math.floor((now-started)/40))));
    if(index===frames.length-1)stop();else raf=requestAnimationFrame(animate);
  }
  function toggle(){if(raf){stop();return;}if(index===frames.length-1)index=0;started=performance.now()-index*40;play.textContent=t("Pause","暂停");raf=requestAnimationFrame(animate);}
  function reset(){
    session?.abort();stop();view?.dispose();view=null;frames=[];index=0;transport.hidden=canvas.hidden=true;video.hidden=false;
    video.src='/tracking/'+body.value+'-'+action.value+(matchMedia('(max-width:720px)').matches?'-720':'')+'.mp4';
    run.disabled=!navigator.gpu || !root.dataset[body.value];ghost.checked=true;
    status.textContent=t("Recorded physics","预录物理执行")+" · LAFAN "+(body.value==="g1"?"G1 a45k":"A3 a15k");
  }
  async function open(live){
    session?.abort();const controller=session=new AbortController(),{signal}=controller;
    const id=body.value,name=action.value;
    run.disabled=true;stop();video.pause();
    status.textContent=t("Loading…","正在载入…");
    let course;
    try{
      const {makeEye}=await import('../patrol/eye');
      let cfg,result;
      if(live){
        const [{loadCourse},{trial}]=await Promise.all([import('../patrol/physics'),import('./trial')]);
        course=await loadCourse(root.dataset[id],signal);cfg=course.cfg;
        result=await trial(course,name,signal,sec=>status.textContent=t("Simulating","物理试跑中")+" · "+sec.toFixed(1)+" s");
      }else{
        [cfg,result]=await Promise.all([id,id+'-'+name].map(async file=>{const r=await fetch('/tracking/'+file+'.json',{signal});if(!r.ok)throw Error(r.status);return r.json();}));
      }
      signal.throwIfAborted();view?.dispose();view=null;
      const fresh=canvas.cloneNode(false);canvas.replaceWith(fresh);canvas=fresh;
      const next=await makeEye(canvas,signal,cfg,true);
      if(signal.aborted){next.dispose();return;}
      view=next;frames=result.frames;range.max=frames.length-1;
      transport.hidden=canvas.hidden=false;video.hidden=true;
      draw(live?0:Math.min(frames.length-1,Math.round(video.currentTime*25)));
      status.textContent=(live?t("On-device physics","设备现场物理执行"):t("Recorded physics","预录物理执行"))+" · "+id.toUpperCase()+" · "+(result.end==="returned"?t("Completed","动作完成"):result.end);
      if(live)toggle();
    }catch(e){if(!signal.aborted){console.warn("Tracker trial unavailable",e);reset();status.textContent=t("Showing the recorded physics run","当前显示预录物理执行");}}
    finally{await course?.dispose();if(!signal.aborted)run.disabled=!navigator.gpu||!root.dataset[id];}
  }
  action.onchange=body.onchange=reset;run.onclick=()=>open(true);ghost.onchange=()=>view?draw(index):open(false);
  range.oninput=()=>{stop();draw(+range.value);};play.onclick=toggle;
  window.addEventListener('pagehide',()=>{session?.abort();stop();view?.dispose();},{once:true});reset();
}
