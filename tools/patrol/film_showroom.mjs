import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {readFile} from 'node:fs/promises';

const [origin,body,target,telemetry]=process.argv.slice(2);
const record=JSON.parse(await readFile(telemetry || (body==='g1'?'public/inspection/record.json':'public/inspection/a3-record.json'),'utf8'));
const browser=await chromium.launch({channel:'chrome'});
try {
  const page=await browser.newPage();
  await page.routeWebSocket("**/*",socket=>socket.close());
  await page.goto(new URL('/inspection/warehouse-layout.json',origin).href);
  await page.evaluate(async ({body,record})=>{
    const {makeEye}=await import('/src/patrol/eye.js');
    const {loadCourse,startRun}=await import('/src/patrol/physics.js');
    const sig=new AbortController().signal;
    const course=await loadCourse('/__patrol/'+body+'/patrol.json',sig);
    const run=startRun(course,course.cfg.route);
    const camera=document.createElement('canvas');
    camera.style.cssText='width:1920px;height:1080px';
    document.body.replaceChildren(camera);
    const view=await makeEye(camera,sig,course.cfg);
    const combined=document.createElement('canvas');
    combined.width=3840;combined.height=1080;
    const ctx=combined.getContext('2d');
    window.frame=async i=>{
      let state;
      if(i===0)state=run.state();
      else {await run.step();state=await run.step();}
      if(Math.hypot(...state.xy.map((v,k)=>v-record.xy[i][k]))>.003)throw Error('Replay diverged at '+i);
      for(const [j,angle] of ['chase','eye'].entries()){
        view.draw(state,angle);ctx.drawImage(camera,j*1920,0,1920,1080);
      }
      return combined.toDataURL('image/jpeg',.91).split(',')[1];
    };
  },{body,record});
  const ff=spawn('ffmpeg',['-v','error','-y','-f','image2pipe','-r','25','-i','-','-filter_complex','split=2[c][e];[c]crop=1920:1080:0:0[chase];[e]crop=1920:1080:1920:0[eye]',...['chase','eye'].flatMap(angle=>['-map','['+angle+']','-c:v','libx264','-preset','veryfast','-crf','21','-pix_fmt','yuv420p','-movflags','+faststart',target+'-'+angle+'.mp4'])],{stdio:['pipe','inherit','inherit']});
  const finished=once(ff,'close');
  for(let i=0;i<record.xy.length;i++){
    const jpg=await page.evaluate(i=>window.frame(i),i);
    if(!ff.stdin.write(Buffer.from(jpg,'base64')))await once(ff.stdin,'drain');
  }
  ff.stdin.end();
  if((await finished)[0])throw Error('Encoding failed');
}finally{await browser.close();}
