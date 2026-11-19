import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome'});
try {
  const page=await browser.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(new URL('/en/projects/supermimickit/',process.argv[2]).href);
  const root=page.locator('[data-tracker]');
  await root.locator('[data-inspect]').click();
  await root.locator('canvas').waitFor();
  const stage=await root.locator('canvas').boundingBox();
  await page.mouse.move(stage.x+30,stage.y+30);await page.mouse.down();await page.mouse.move(stage.x+130,stage.y+30);await page.mouse.up();
  for(const body of ['G1','A3']){
    await root.getByRole('radio',{name:body}).check();
    await root.locator('[data-run]').click();
    await root.locator('[data-push]').waitFor({timeout:180000});
    await root.locator('[data-play]').click();
    const time=root.locator('.transport output');
    await page.waitForTimeout(80);const frozen=await time.textContent();
    await page.waitForTimeout(160);assert.equal(await time.textContent(),frozen);
    await root.locator('[data-push]').click();
    assert.equal(await root.locator('[data-force]').textContent(),'80 N');
    await root.locator('[data-play]').click();
    await page.waitForFunction(()=>document.querySelector('[data-tracker]').dataset.mode==='inspect',null,{timeout:60000});
    console.log(body,await root.locator('[role=status]').textContent(),await time.textContent());
  }
  assert.deepEqual(errors,[]);
}finally{await browser.close();}
