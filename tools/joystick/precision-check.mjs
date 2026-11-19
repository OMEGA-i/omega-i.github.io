// Usage: node precision-check.mjs DEV_ORIGIN OUTPUT.json baseline=DIR fp16=DIR int8=DIR
import {chromium} from '@playwright/test';
import {createServer} from 'node:http';
import {createReadStream,statSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {once} from 'node:events';

const [origin, output, ...entries] = process.argv.slice(2);
const models = Object.fromEntries(entries.map(value=>value.split('=')));
const commands = [[0,0],[.8,0],[0,.35],[-.3,0],[.8,.25],[.67,-.23],[0,-.35],[1.55,0],[-.65,.15],[.35,.2]];
const server = createServer((req,res)=>{
  const [,model,file]=new URL(req.url,'http://localhost').pathname.split('/');
  if(!Object.hasOwn(models,model)||!['joystick.onnx','signature.json'].includes(file)){
    res.writeHead(404).end();return;
  }
  const path=join(models[model],file);
  res.writeHead(200,{'Access-Control-Allow-Origin':origin,'Content-Length':statSync(path).size});
  createReadStream(path).pipe(res);
});
server.listen(0,'127.0.0.1'); await once(server,'listening');
const endpoint='http://127.0.0.1:'+server.address().port;
const baseline=[],results={commands,models:{}};
try{
  for(const model of Object.keys(models)){
    const browser=await chromium.launch({channel:'chrome'});
    try{
      const page=await browser.newPage();
      await page.goto(origin+'/joystick/samples.json');
      await page.evaluate(async url=>{
        const {createGenerator}=await import('/src/joystick/infer.js');
        window.names=(await fetch('/joystick/samples.json').then(r=>r.json())).jointNames;
        window.generate=await createGenerator(url,window.names,()=>{});
      },endpoint+'/'+model+'/signature.json');
      const rows=[];
      for(const [i,cmd] of commands.entries()){
        const motion=await page.evaluate(async cmd=>{
          const {positions,matrices}=await window.generate(...cmd);
          return {p:Array.from(positions),r:Array.from(matrices)};
        },cmd);
        if(model==='baseline'){baseline.push(motion);continue;}
        const ref=baseline[i], distances=[],angles=[],roots=[];
        for(let j=0;j<motion.p.length/3;j++){
          let sum=0,rotation=0;
          for(let k=j*3;k<j*3+3;k++)sum+=(motion.p[k]-ref.p[k])**2;
          for(let k=j*9;k<j*9+9;k++)rotation+=(motion.r[k]-ref.r[k])**2;
          distances.push(1000*Math.sqrt(sum));
          angles.push(360/Math.PI*Math.asin(Math.min(1,Math.sqrt(rotation/8))));
          if(j%30===0)roots.push(distances.at(-1));
        }
        const avg=a=>a.reduce((x,y)=>x+y,0)/a.length;
        rows.push({cmd,meanJointMM:avg(distances),maxJointMM:Math.max(...distances),maxRootMM:Math.max(...roots),endRootMM:roots.at(-1),maxRotationDeg:Math.max(...angles)});
      }
      results.models[model]=rows;
      results.browser=browser.version();
      writeFileSync(output,JSON.stringify(results,null,2));
      console.log(model,rows.map(row=>row.maxJointMM.toFixed(2)));
    }finally{await browser.close();}
  }
}finally{server.close();}
