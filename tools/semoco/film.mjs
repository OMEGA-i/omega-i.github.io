// Run against the Astro dev server. Advance one decoded frame per image.
import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
const [origin, body, poses, movie, mode] = process.argv.slice(2);
const track = JSON.parse(await readFile(poses,'utf8'));
const browser = await chromium.launch({channel:'chrome'});
try {
  const page = await browser.newPage({viewport:{width:1920,height:1080}});
  await page.goto(new URL('/inspection/warehouse-layout.json',origin).href);
  await page.evaluate(async ({body,track,mode})=>{
    document.body.innerHTML='<canvas></canvas>';
    document.body.style.margin='0';
    const T=await import('/node_modules/.vite/deps/three.js');
    const {prepareStage,portraitFov,portraitOffset}=await import('/src/showroom/lighting.js');
    const {GLTFLoader}=await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
    const {MeshoptDecoder}=await import('/node_modules/three/examples/jsm/libs/meshopt_decoder.module.js');
    const scene=new T.Scene();

    const canvas=document.querySelector('canvas');
    const renderer=new T.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true});
    prepareStage(scene,renderer);
    renderer.setSize(1920,1080);
    const cam=new T.PerspectiveCamera(portraitFov,16/9,.03,60);
    cam.up.set(0,0,1);
    const robot=(await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(body==='g1'?'/joystick/g1.glb':'/joystick/a3/robot.glb')).scene;
    robot.traverse(o=>{if(o.isMesh)o.castShadow=true;});
    scene.add(robot);
    const basis=new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),Math.PI/2);
    const links=track.names.map(n=>n&&robot.getObjectByName(n));
    if(links.filter(Boolean).length<29) throw Error('Robot link mismatch');
    const root=track.names.indexOf(body==='g1'?'pelvis':'pelvis_Link');
    const pelvis=root>0?root:1;
    const h=body==='g1'?.78:1.02;

    const [x,y,,w,qx,qy,qz]=track.frames[0][pelvis];
    const yaw=Math.atan2(2*(w*qz+qx*qy),1-2*(qy*qy+qz*qz));
    // Homepage stills look across the central aisle toward the dining set.
    const offset=mode==="poster" ? new T.Vector3(3.1,1.75,.67) : portraitOffset(h,yaw);
    if (track.path) {
      const points=track.path.map(([x,y])=>new T.Vector3(x,y,.022));
      const geometry=new T.BufferGeometry().setFromPoints(points);
      scene.add(new T.Line(geometry,new T.LineBasicMaterial({color:0x2455ce})));
      const direction=new T.Vector3(...track.velocity,0);
      scene.add(new T.ArrowHelper(direction.clone().normalize(),new T.Vector3(0,.13,.027),direction.length()*2,0xc44335,.13,.1));
    }
    cam.position.set(x,y,h).add(offset);
    cam.lookAt(x,y,h);
    window.drawFrame=i=>{
      const frame=track.frames[i];
      links.forEach((node,k)=>{
        if(!node)return;
        const [x,y,z,w,qx,qy,qz]=frame[k];
        node.position.set(x,y,z);
        node.quaternion.set(qx,qy,qz,w).multiply(basis);
      });
      renderer.render(scene,cam);
      return canvas.toDataURL(mode==='poster'?'image/webp':'image/jpeg',.94).split(',')[1];
    };
  },{body,track,mode});
  if(mode==="poster"){
    const frame=await page.evaluate(()=>window.drawFrame(0));
    await writeFile(movie,Buffer.from(frame,"base64"));
  } else {
    const encoder=spawn('ffmpeg',['-loglevel','error','-y','-f','image2pipe','-r',String(track.fps),'-i','-','-c:v','libx264','-crf','19','-pix_fmt','yuv420p','-movflags','+faststart',movie],{stdio:['pipe','inherit','inherit']});
    const done=once(encoder,'close');
    for(let i=0;i<track.frames.length;i++){
      const frame=await page.evaluate(i=>window.drawFrame(i),i);
      if(!encoder.stdin.write(Buffer.from(frame,'base64')))await once(encoder.stdin,'drain');
    }
    encoder.stdin.end();
    if((await done)[0])throw Error('Movie encoding failed');
  }
} finally {await browser.close();}
