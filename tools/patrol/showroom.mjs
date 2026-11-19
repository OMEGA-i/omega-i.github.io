// Export the original scene graph into the coordinate system of the patrol.
import { chromium } from '@playwright/test';
import {writeFile, mkdir} from 'node:fs/promises';
const browser=await chromium.launch({channel:'chrome'});
try{
 const page=await browser.newPage();
 await page.goto(new URL('/inspection/warehouse-layout.json',process.argv[2]).href);
 const {objects,racks}=await page.evaluate(async()=>{
   const T=await import('/node_modules/.vite/deps/three.js');
   const {showroom}=await import('/src/showroom/scene.js');
   const scene=new T.Scene(),group=showroom(scene,true);
   group.updateMatrixWorld(true);
   const objects=[],racks=[];
   for(const [i,child] of group.children.entries()){
     if(child.isGroup&&child.children.length){
       const box=new T.Box3().setFromObject(child);
       const c=box.getCenter(new T.Vector3()),h=box.getSize(new T.Vector3()).multiplyScalar(.5);
       if(h.x>.1&&h.y>.1)racks.push(['zone'+i,c.x,c.y,h.x,h.y,h.z,c.z]);
     }
   }
   group.traverse(m=>{
     if(!m.isMesh)return;
     const pos=new T.Vector3(),q=new T.Quaternion(),scale=new T.Vector3();
     m.matrixWorld.decompose(pos,q,scale);
     const p=m.geometry.parameters;
     objects.push({type:m.geometry.type,params:p,pos:pos.toArray(),quat:[q.w,q.x,q.y,q.z],
       scale:scale.toArray(),color:m.material.color.getHexString(),texture:m.material.map?.image?.toDataURL?.()});
   });
   return {objects,racks};
 });
 const dest='public/showroom';await mkdir(dest,{recursive:true});
 await writeFile(dest+'/geometry.json',JSON.stringify(objects));
 const {readFile}=await import('node:fs/promises');
 const file='public/inspection/warehouse-layout.json';
 const layout=JSON.parse(await readFile(file,'utf8'));layout.heights=Object.fromEntries(racks.map(([id,,,,,hz,z])=>[id,[hz,z]]));layout.racks=racks.map(row=>row.slice(0,5));
 await writeFile(file,JSON.stringify(layout,null,2)+'\n');
 console.log(objects.length,racks.length);
}finally{await browser.close()}
