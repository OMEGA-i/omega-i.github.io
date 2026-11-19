// Record the project viewer itself, including its command line and root trajectory.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
const browser=await chromium.launch({channel:'chrome'});
try {
  const page=await browser.newPage({viewport:{width:960,height:540}});
  await page.goto(new URL('/joystick/samples.json',process.argv[2]).href);
  const samples=await page.evaluate(async()=>{
    const {createScene}=await import('/src/joystick/scene.js');
    document.body.innerHTML='<main style="width:960px;height:540px"></main>';
    const manifest=await (await fetch('/joystick/samples.json')).json();
    const scene=await createScene(document.querySelector('main'),manifest.jointNames);
    window.loadClip=async(id,body)=>{
      const sample=manifest.samples.find(s=>s.id===id);
      const load=async(ext,scale)=>Float32Array.from(new Int16Array(await (await fetch('/joystick/'+id+ext)).arrayBuffer()),n=>n/scale);
      scene.setMotion({positions:await load('.bin',1000),quaternions:await load('.quat',32767)},sample.frames,sample.velocity,id);
      await scene.setAvatar(body==='a3'?id:null);
    };
    window.renderFrame=i=>{scene.draw(i);return document.querySelector('canvas').toDataURL('image/jpeg',.94).split(',')[1];};
    return manifest.samples;
  });
  for(const body of ['g1','a3'])for(const sample of samples){
    await page.evaluate(([id,body])=>window.loadClip(id,body),[sample.id,body]);
    const target='public/joystick/'+(body==='a3'?'a3/':'')+sample.id+'.mp4';
    const encoder=spawn('ffmpeg',['-v','error','-y','-f','image2pipe','-r','25','-i','-','-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',target],{stdio:['pipe','inherit','inherit']});
    const done=once(encoder,'close');
    for(let i=0;i<sample.frames;i++){
      const jpg=await page.evaluate(i=>window.renderFrame(i),i);
      if(!encoder.stdin.write(Buffer.from(jpg,'base64')))await once(encoder.stdin,'drain');
    }
    encoder.stdin.end();
    if((await done)[0])throw Error(target);
  }
}finally{await browser.close();}
