// Frame the dining area from the same camera as the three other homepage posters.
import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({channel:'chrome'});
try{
  const page=await browser.newPage({viewport:{width:1920,height:1080}});
  await page.goto(new URL('/tracking/g1.json',process.argv[2]).href);
  const still=await page.evaluate(async()=>{
    const {makeEye}=await import('/src/patrol/eye.js');
    const [cfg,run]=await Promise.all(['/tracking/g1.json','/tracking/g1-turn.json'].map(async p=>(await fetch(p)).json()));
    document.body.innerHTML='<canvas style="width:1920px;height:1080px"></canvas>';
    const canvas=document.querySelector('canvas'),view=await makeEye(canvas,new AbortController().signal,cfg,true);
    view.draw(run.frames[18],'poster');
    return canvas.toDataURL('image/webp',.9).split(',')[1];
  });
  await writeFile('public/previews/supermimickit-front.webp',Buffer.from(still,'base64'));
}finally{await browser.close();}
