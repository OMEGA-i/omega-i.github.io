import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
const origin=process.argv[2];
const browser=await chromium.launch({channel:'chrome'});
try {
for(const body of ['g1','a3']){
  const page=await browser.newPage({viewport:{width:1920,height:1080}});
  await page.goto(new URL('/inspection/warehouse-layout.json',origin).href);
  const cfg=await page.evaluate(async body=>{
    const {loadCourse}=await import('/src/patrol/physics.js');
    const {trial}=await import('/src/tracker/trial.js');
    const {makeEye}=await import('/src/patrol/eye.js');
    const signal=new AbortController().signal,course=await loadCourse('/__patrol/'+body+'/patrol.json',signal);
    document.body.innerHTML='<canvas style="width:1920px;height:1080px"></canvas>';
    const canvas=document.querySelector('canvas'),view=await makeEye(canvas,signal,course.cfg,true);
    window.capture=async action=>(window.result=await trial(course,action,signal,()=>{}));
    window.draw=i=>{view.draw(window.result.frames[i],'chase');return canvas.toDataURL('image/jpeg',.95).split(',')[1];};
    const {body:robot,bodyNames,qids,racks}=course.cfg;
    return {body:robot,bodyNames,qids,racks};
  },body);
  await writeFile('public/tracking/'+body+'.json',JSON.stringify(cfg));
  for(const action of ['turn','walk']){
    const result=await page.evaluate(action=>window.capture(action),action);
    const base='public/tracking/'+body+'-'+action;
    await writeFile(base+'.json',JSON.stringify(result));
    const ff=spawn('ffmpeg',['-loglevel','error','-y','-f','image2pipe','-r','25','-i','-','-c:v','libx264','-pix_fmt','yuv420p','-crf','20','-movflags','+faststart',base+'.mp4']);
    const finish=once(ff,'close');
    for(let i=0;i<result.frames.length;i++){
      const jpg=await page.evaluate(i=>window.draw(i),i);
      if(!ff.stdin.write(Buffer.from(jpg,'base64')))await once(ff.stdin,'drain');
    }
    ff.stdin.end();if((await finish)[0])throw Error(base);
    console.log(base,result.end,result.frames.length);
  }
  await page.close();
}
}finally{await browser.close();}
