import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const [origin,body,out]=process.argv.slice(2);
const browser=await chromium.launch({channel:'chrome'});
try{
const page=await browser.newPage();
await page.goto(new URL('/inspection/warehouse-layout.json',origin).href);
const trial=await page.evaluate(async body=>{
 const {loadCourse,startRun}=await import('/src/patrol/physics.js');
 const course=await loadCourse('/__patrol/'+body+'/patrol.json',new AbortController().signal);
 const samples={states:[],actions:[],commands:[],events:[]};
 const run=startRun(course,course.cfg.route,row=>{
  for(const [k,v] of Object.entries(row))samples[k==='state'?'states':k+'s'].push(v);
 });
 let s;do{s=await run.step();}while(!s.end);
 const {cfg}=course;run.dispose();await course.dispose();
 if(s.end!=='returned')throw Error(body+' '+s.end+' at '+s.time+' '+s.xy);
 return {...samples,robot:body,reason:s.end,actor:cfg.checkpoint,route:cfg.route,racks:cfg.racks,basis:cfg.basis,origin:cfg.origin};
},body);
await mkdir(out,{recursive:true});await writeFile(out+'/capture.json',JSON.stringify(trial));
console.log(body,trial.events);
}finally{await browser.close();}
