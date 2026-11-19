// Run against a staged build or a public Pages origin, using Chrome with WebGPU.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const origin=process.argv[2];
const browser=await chromium.launch({channel:'chrome'});
try{
  const page=await browser.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  const absolute=path=>new URL(path,origin).href;
  await page.goto(absolute('/zh/'));
  assert.deepEqual(await page.locator('.project h3').allTextContents(),['Joystick','SeMoCo','SuperMimicKit','PlayGround']);
  await page.goto(absolute('/en/projects/joystick/'));
  await page.locator('[data-vx]').fill('.67');await page.locator('[data-vy]').fill('-.23');
  const started=Date.now();
  await page.locator('[data-run]').click();
  await page.waitForFunction(()=>/Generated motion reference|unavailable/i.test(document.querySelector('[data-joystick] [data-status]').textContent),null,{timeout:1800000});
  const generated=await page.locator('[data-joystick] [data-status]').textContent();
  assert.match(generated,/Generated motion reference/);console.log(generated,Math.round((Date.now()-started)/1000)+" s including cold load");
  await page.goto(absolute('/en/projects/supermimickit/'));
  const studio=page.locator('[data-tracker]');
  for(const body of ['G1','A3']){
    await studio.getByRole('radio',{name:body}).check();
    await studio.getByRole('button',{name:'Run tracker'}).click();
    await page.waitForFunction(()=>/On-device physics|Showing the recorded/.test(document.querySelector('[data-tracker] [role=status]').textContent),null,{timeout:120000});
    const status=await studio.locator('p[role=status]').innerText();console.log(status);assert.match(status,/Completed/);
    await studio.locator('[type=range]').fill('35');await studio.locator('[data-ghost]').uncheck();
    assert.equal(await studio.locator('output').textContent(),'1.40 s');
  }
  const mobile=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  await mobile.addInitScript(()=>Object.defineProperty(navigator,'gpu',{value:undefined}));
  for(const lang of ['zh','en']){
    await mobile.goto(absolute('/'+lang+'/'));await mobile.locator('.project').last().waitFor();
    assert.equal(await mobile.locator('.imagebox img').evaluateAll(imgs=>imgs.every(i=>i.naturalWidth>0)),true);
  }
  await mobile.goto(absolute('/zh/projects/playground/'));
  const episode=mobile.locator('[data-episode]'),video=episode.locator('video');
  await episode.locator('[data-event]').first().click();
  await mobile.waitForFunction(()=>document.querySelector('[data-episode] video').currentTime>1);
  const before=await video.evaluate(v=>v.currentTime);await episode.locator('select[data-angle]').selectOption('1');
  await mobile.waitForFunction(t=>{const v=document.querySelector('[data-episode] video');return v.videoWidth===1280 && Math.abs(v.currentTime-t)<.06;},before);
  console.log('Mobile 720p · synchronized seek',before);
  await mobile.goto(absolute('/zh/projects/semoco/'));await mobile.waitForFunction(()=>document.querySelector('.semstage video').videoWidth===1280);
  assert.deepEqual(errors,[]);
}finally{await browser.close();}
