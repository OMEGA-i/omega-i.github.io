export function mount(root) {
  const get = selector => root.querySelector(selector);
  const video = get("video"), body = get("omega-model-switch");
  const ghost = get("[data-ghost]"), run = get("[data-run]"), inspect = get("[data-inspect]");
  const push = get("[data-push]"), play = get("[data-play]"), range = get("[data-timeline]");
  const transport = get(".transport"), status = get("[role=status]");
  const t = (en,zh) => root.dataset.en === "true" ? en : zh;
  let canvas = get("canvas"), session, view, sim, frames = [], index = 0, raf = 0;
  let livePaused = false, drag = null, motion = "turn";
  const policy=get("[data-policy]"),friction=get("[data-friction]"),pull=get("[data-pull]");
  const phase=(mode,text)=>{root.dataset.mode=mode;get("[data-phase]").textContent=text;};
  const scenarios=root.querySelectorAll("[data-experiment]");
  let experiment=null;
  function environment(){
    scenarios.forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.experiment===experiment)));
    sim?.enablePolicy(policy.checked);
    sim?.setSurface(Number(friction.value));
    get("[data-mu]").textContent=Number(friction.value).toFixed(2)+"×";
  }
  policy.onchange=friction.oninput=()=>{experiment=null;environment();};

  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
    play.textContent = t("Play","播放");
  }
  function draw(i) {
    index = i;
    range.value = i;
    view.draw(frames[i],"chase",ghost.checked);
    get("[data-clock]").textContent=get("[data-time]").textContent=frames[i].time.toFixed(2)+" s";
  }
  function toggle() {
    if (sim) {
      livePaused = !livePaused;
      play.textContent = livePaused ? t("Continue","继续") : t("Pause","暂停");
      return;
    }
    if (!frames.length) return;
    if (raf) { stop(); return; }
    if (index === frames.length - 1) index = 0;
    const start = performance.now() - index * 40;
    function animate(now) {
      draw(Math.max(0,Math.min(frames.length-1,Math.floor((now-start)/40))));
      if (index === frames.length - 1) stop();
      else raf = requestAnimationFrame(animate);
    }
    play.textContent = t("Pause","暂停");
    raf = requestAnimationFrame(animate);
  }
  function reset() {
    session?.abort(); stop(); sim = null; drag = null;
    view?.dispose(); view = null; frames = []; index = 0;
    transport.hidden = canvas.hidden = push.hidden = true;
    video.hidden = false; range.disabled = false; livePaused = false;
    video.src = '/tracking/'+body.value+'-'+motion+(matchMedia('(max-width:720px)').matches?'-720':'')+'.mp4';
    get("[data-force]").textContent=""; pull.hidden=true; phase("recorded",t("Motion replay","动作回放"));
    run.disabled = !navigator.gpu || !root.dataset[body.value];
    scenarios.forEach(b=>b.disabled=run.disabled);
    inspect.disabled = false;
    status.textContent = t("Recorded physics","预录物理执行")+" · LAFAN "+(body.value==="g1"?"G1 a45k":"A3 a15k");
  }
  function bindCanvas() {
    canvas.onpointerdown = e => {
      canvas.setPointerCapture(e.pointerId);
      drag = {x:e.clientX,y:e.clientY,link:sim ? view.pickLink(e.clientX,e.clientY) : null};
    };
    canvas.onpointermove = e => {
      if (!drag) return;
      if(drag.link !== null){
        const box=canvas.getBoundingClientRect(),dx=e.clientX-drag.x,dy=e.clientY-drag.y;
        pull.hidden=false;pull.style.left=(drag.x-box.left)+"px";pull.style.top=(drag.y-box.top)+"px";
        pull.style.width=Math.hypot(dx,dy)+"px";pull.style.transform="rotate("+Math.atan2(dy,dx)+"rad)";
        return;
      }
      view.orbit((drag.x-e.clientX)*.009,(e.clientY-drag.y)*.01);
      drag.x=e.clientX;drag.y=e.clientY;
      draw(index);
    };
    canvas.onpointerup = e => {
      if (drag?.link != null && sim) {
        const force = view.horizontalForce(e.clientX-drag.x,e.clientY-drag.y);
        sim.pushLink(drag.link,force);
        get("[data-force]").textContent = Math.round(Math.hypot(...force))+" N";
      }
      drag=null;pull.hidden=true;
    };
    canvas.onpointercancel = () => { drag=null;pull.hidden=true; };
    canvas.onwheel = e=>{e.preventDefault();view.zoomBy(Math.exp(Math.sign(e.deltaY)*.10));draw(index);};
  }
  async function open(live) {
    session?.abort(); const controller = session = new AbortController(), {signal} = controller;
    const id=body.value, name=motion, videoTime=video.currentTime;
    run.disabled=inspect.disabled=true;
    stop(); video.pause();
    status.textContent=t("Loading…","正在载入…");
    let course, trial;
    try {
      const {makeEye}=await import('../patrol/eye');
      let cfg, result;
      if (live) {
        const [{loadCourse,startRun},{routes}]=await Promise.all([import('../patrol/physics'),import('./trial')]);
        course=await loadCourse(root.dataset[id],signal);
        cfg=course.cfg; trial=startRun(course,routes[name],null,true);
      } else {
        [cfg,result]=await Promise.all([id,id+'-'+name].map(async file=>{
          const response=await fetch('/tracking/'+file+'.json',{signal});
          if (!response.ok) throw Error(response.status);
          return response.json();
        }));
      }
      signal.throwIfAborted();
      view?.dispose(); view=null;
      const fresh=canvas.cloneNode(false); canvas.replaceWith(fresh); canvas=fresh;
      const next=await makeEye(canvas,signal,cfg,true);
      if (signal.aborted) { next.dispose(); return; }
      phase(live?"live":"inspect",live?t("Live physics","实时仿真"):t("Motion replay","动作回放"));
      view=next; sim=trial; livePaused=false; bindCanvas();environment();
      transport.hidden=canvas.hidden=false; video.hidden=true;
      if (!live) {
        get("[data-force]").textContent="";
        frames=result.frames; range.max=frames.length-1;
        draw(Math.min(frames.length-1,Math.round(videoTime*25)));
        status.textContent=t("Recorded physics","预录物理执行")+" · "+id.toUpperCase();
        if(!matchMedia("(prefers-reduced-motion: reduce)").matches)toggle();
        return;
      }
      frames=[sim.state()]; range.disabled=true; range.max=0; draw(0);
      push.hidden=false; get("[data-force]").textContent="";
      play.textContent=t("Pause","暂停");
      status.textContent=t("Live physics · Drag the robot to perturb it","现场物理执行 · 拖动机器人施加外力");
      push.onclick=()=>{
        const link=cfg.bodyNames.indexOf(id==="g1"?"pelvis":"pelvis_link");
        sim.pushLink(link,[0,80,0]);
        get("[data-force]").textContent="80 N";
      };
      let end="time-limit", deadline=performance.now();
      for (let tick=1;tick<=400;) {
        signal.throwIfAborted();
        if(livePaused){await new Promise(resolve=>setTimeout(resolve,30));deadline=performance.now();continue;}
        if(tick===50 && experiment==="balance")push.onclick();
        const state=await sim.step();
        signal.throwIfAborted();
        if(tick%2===0 || state.end){
          frames.push(state);range.max=frames.length-1;draw(frames.length-1);
        }
        if(state.end){end=state.end;break;}
        tick++;
        deadline=Math.max(performance.now()-20,deadline+20);
        await new Promise(resolve=>setTimeout(resolve,Math.max(0,deadline-performance.now())));
      }
      phase("inspect",t("Run replay","本次试跑回放"));
      sim=null;push.hidden=true;range.disabled=false;stop();
      status.textContent=t("On-device physics","设备现场物理执行")+" · "+id.toUpperCase()+" · "+
        (end==="returned"?t("Completed","动作完成"):end==="fall"?t("Lost balance","失去平衡"):end);
    } catch(error) {
      if(!signal.aborted){console.warn("Tracker unavailable",error);reset();status.textContent=t("Recorded physics playback","预录物理回放");}
    } finally {
      trial?.dispose();await course?.dispose();
      if(!signal.aborted){run.disabled=!navigator.gpu||!root.dataset[id];inspect.disabled=false;}
    }
  }
  get("[data-reset]").onclick=()=>{const live=Boolean(sim)||Boolean(experiment);reset();void open(live);};
  scenarios.forEach(button=>button.onclick=()=>{
    experiment=button.dataset.experiment;
    policy.checked=experiment!=="passive"; friction.value=experiment==="ice"?".15":"1";
    environment();
    reset(); void open(true);
  });
  get("[data-full]").onclick=async()=>{
    if(document.fullscreenElement) await document.exitFullscreen();
    else await root.requestFullscreen?.();
  };
  function changeSelection(){
    const live=Boolean(sim);
    reset(); void open(live);
  }
  body.onchange=changeSelection;
  root.querySelectorAll("[data-motion]").forEach(button=>button.onclick=()=>{
    if(motion===button.dataset.motion)return;
    motion=button.dataset.motion;
    root.querySelectorAll("[data-motion]").forEach(b=>b.setAttribute("aria-pressed",String(b===button)));
    changeSelection();
  });
  run.onclick=()=>open(true); inspect.onclick=()=>open(false);
  ghost.onchange=()=>view?draw(index):open(false);
  range.oninput=()=>{stop();draw(+range.value);};play.onclick=toggle;
  root.onkeydown=e=>{
    if(e.code==="Space" && e.target===canvas){e.preventDefault();toggle();}
  };
  window.addEventListener('pagehide',()=>{session?.abort();stop();view?.dispose();},{once:true});
  reset();
  const visible = new IntersectionObserver(entries=>{
    if(entries.some(e=>e.isIntersecting)){
      visible.disconnect();
      if(!session && !matchMedia("(prefers-reduced-motion: reduce)").matches)void open(false);
    }
  });
  visible.observe(root);
}
