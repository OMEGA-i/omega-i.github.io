import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {readFile} from 'node:fs/promises';

const [origin,body,mosaic,target]=process.argv.slice(2);
const record=JSON.parse(await readFile(body==='g1'?'public/inspection/record.json':'public/inspection/a3-record.json','utf8'));
const browser=await chromium.launch({channel:'chrome'});
try {
  const page=await browser.newPage();
  await page.goto(new URL('/inspection/warehouse-layout.json',origin).href);
  await page.evaluate(async ({body,record})=>{
    const {makeEye}=await import('/src/patrol/eye.js');
    const {loadCourse,startRun}=await import('/src/patrol/physics.js');
    const sig=new AbortController().signal;
    const course=await loadCourse('/__patrol/'+body+'/patrol.json',sig);
    const run=startRun(course,course.cfg.route);
    const camera=document.createElement('canvas');
    camera.style.cssText='width:640px;height:352px';
    document.body.replaceChildren(camera);
    const view=await makeEye(camera,sig,course.cfg);
    const combined=document.createElement('canvas');
    combined.width=1280;combined.height=352;
    const ctx=combined.getContext('2d');
    window.frame=async i=>{
      let state;
      if(i===0)state=run.state();
      else {await run.step();state=await run.step();}
      if(Math.hypot(...state.xy.map((v,k)=>v-record.xy[i][k]))>.003)throw Error('Replay diverged at '+i);
      for(const [j,angle] of ['chase','eye'].entries()){
        view.draw(state,angle);ctx.drawImage(camera,j*640,0,640,352);
      }
      return combined.toDataURL('image/jpeg',.91).split(',')[1];
    };
  },{body,record});
  const ff=spawn('ffmpeg',['-v','error','-y','-f','image2pipe','-r','25','-i','-','-i',mosaic,'-filter_complex','[1:v]crop=iw:ih/2:0:ih/2[lower];[0:v][lower]vstack=inputs=2:shortest=1','-c:v','libx264','-preset','veryfast','-crf','21','-pix_fmt','yuv420p','-movflags','+faststart',target],{stdio:['pipe','inherit','inherit']});
  const finished=once(ff,'close');
  for(let i=0;i<record.xy.length;i++){
    const jpg=await page.evaluate(i=>window.frame(i),i);
    if(!ff.stdin.write(Buffer.from(jpg,'base64')))await once(ff.stdin,'drain');
  }
  ff.stdin.end();
  if((await finished)[0])throw Error('Encoding failed');
}finally{await browser.close();}
