// Measure the visitor flow with a fresh Chrome profile and no intercepted requests.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
const [origin,output,delivery]=process.argv.slice(2);
const browser=await chromium.launch({channel:'chrome'});
try {
  const page=await browser.newPage({viewport:{width:1280,height:800}});
  await page.goto(new URL('/en/projects/joystick/'+(delivery?'?delivery='+delivery:''),origin).href);
  const studio=page.locator('[data-joystick]');
  const manifest=await studio.getAttribute('data-model');
  assert.match(manifest,/joystick-mixed-v1/);
  await page.waitForFunction(()=>document.querySelector('[data-status]').textContent.includes('0.8 / 0.25'));
  await studio.locator('[data-vx]').fill('.67');
  await studio.locator('[data-vy]').fill('-.23');
  await page.evaluate(()=>{
    const root=document.querySelector('[data-joystick]');
    const status=root.querySelector('[data-status]');
    window.times={};
    root.querySelector('[data-run]').addEventListener('click',()=>window.times.click=performance.now(),{capture:true,once:true});
    new MutationObserver(()=>{
      if(status.textContent.includes('Compiling'))window.times.compiling=performance.now();
      if(status.textContent.includes('Generating motion'))window.times.inferring=performance.now();
    }).observe(status,{childList:true,subtree:true});
    root.addEventListener('omega:reference',e=>{
      if(e.detail.origin==='live')
        window.times.completed=performance.now();
    });
  });
  const start=performance.now();
  await studio.locator('[data-run]').click();
  const wait=()=>page.waitForFunction(()=>/Generated motion reference|unavailable/i.test(document.querySelector('[data-joystick] [data-status]').textContent),null,{timeout:1800000});
  await wait();
  const coldSeconds=(performance.now()-start)/1000;
  const status=await studio.locator('[data-status]').innerText();
  assert.match(status,/Generated motion reference/);
  const timings=await page.evaluate(()=>window.times);
  const assets=await page.evaluate(()=>performance.getEntriesByType('resource').filter(e=>e.name.includes('/graph-')).map(e=>({url:e.name,bytes:e.encodedBodySize,ms:e.duration})));
  assert(assets.length>0);
  await studio.locator('[data-vx]').fill('.8');await studio.locator('[data-vy]').fill('.25');
  const warm=performance.now();await studio.locator('[data-run]').click();
  await page.waitForFunction(()=>document.querySelector('[data-joystick] [data-status]').textContent.includes('Generated motion reference · 0.8 / 0.25'));
  const phases=await page.evaluate(()=>window.__joystickTimings);
  const result={origin,status,phases,browser:browser.version(),coldSeconds,warmSeconds:(performance.now()-warm)/1000,timings,assets};
  writeFileSync(output,JSON.stringify(result,null,2));console.log(status,result.coldSeconds,result.warmSeconds);
} finally {await browser.close();}
