import {adaptiveRender} from "../showroom/resolution";
import * as THREE from "three";

// The recorded and live views use the same warehouse fixtures and 48° lens.
import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";
import {MeshoptDecoder} from "three/addons/libs/meshopt_decoder.module.js";
import {prepareStage, portraitFov, portraitOffset} from "../showroom/lighting.js";
export async function makeEye(canvas, signal, cfg, tracking = false) {
  signal.throwIfAborted();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const renderView=adaptiveRender(renderer);
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera(48, 1, 0.03, 55);
  camera.up.set(0, 0, 1);
  const disposeStage = prepareStage(scene, renderer);
  const targetHeight = cfg.body === "g1" ? .78 : 1.02;
  const vertical = new THREE.Vector3(0,0,1);
  const initialOffset = portraitOffset(targetHeight);
  const model=(await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(cfg.body==="a3"?"/joystick/a3/robot.glb":"/joystick/g1.glb")).scene;
  const links=cfg.bodyNames.flatMap((name,i)=>{
    const node=model.getObjectByName(name);return node?[[node,i]]:[];
  });
  if(links.length<cfg.qids.length)throw Error("Missing robot visual frames");
  const meshBasis=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),Math.PI/2);
  model.traverse(node=>{if(node.isMesh)node.castShadow=node.receiveShadow=true;});
  scene.add(model);
  const ghost = tracking ? model.clone(true) : null;
  const ghostMaterial = ghost && new THREE.MeshBasicMaterial({color:0x467dff,transparent:true,opacity:.29,depthWrite:false});
  const ghostLinks = ghost ? links.map(([node,i])=>[ghost.getObjectByName(node.name),i]) : [];
  if(ghost) {
    ghost.traverse(node=>{if(node.isMesh){node.material=ghostMaterial;node.castShadow=false;node.receiveShadow=false;}});
    scene.add(ghost);
  }
  const target=new THREE.Vector3(),offset=new THREE.Vector3(),ray=new THREE.Ray();
  const racks=cfg.racks.map(([,x,y,hx,hy])=>new THREE.Box3(new THREE.Vector3(x-hx-.12,y-hy-.12,0),new THREE.Vector3(x+hx+.12,y+hy+.12,1.92)));
  let width = 0,
    height = 0;
  function draw(s,angle,overlay=true) {
    const w = canvas.clientWidth,
      h = canvas.clientHeight;
    if (!w || !h) return;
    if (w !== width || h !== height) {
      width = w;
      height = h;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    model.visible=angle!=="eye";
    const fov = model.visible ? portraitFov : 48;
    if (camera.fov !== fov) { camera.fov=fov; camera.updateProjectionMatrix(); }
    if(model.visible){
      for(const [node,i] of links){
        node.position.fromArray(s.linkPositions,3*i);
        const q=s.linkRotations,index=4*i;
        node.quaternion.set(q[index+1],q[index+2],q[index+3],q[index]).multiply(meshBasis);
      }
      if(ghost) {
        ghost.visible=overlay && Boolean(s.referencePositions);
        if(ghost.visible) for(const [node,i] of ghostLinks){
          node.position.fromArray(s.referencePositions,3*i);
          const q=s.referenceRotations,k=4*i;
          node.quaternion.set(q[k+1],q[k+2],q[k+3],q[k]).multiply(meshBasis);
        }
      }
      target.set(s.xy[0],s.xy[1],targetHeight);
      offset.copy(initialOffset).applyAxisAngle(vertical,s.yaw);
      for(let lift=0;lift<14;lift++){
        ray.set(target,offset.clone().normalize());
        if(!racks.some(box=>{const hit=ray.intersectBox(box,new THREE.Vector3());return hit&&hit.distanceTo(target)<offset.length();}))break;
        offset.z+=.32;
      }
      camera.position.copy(target).add(offset);camera.lookAt(target);
    }else{
    camera.position.fromArray(s.eye);
    camera.lookAt(
      s.eye[0] + Math.cos(s.eyeYaw),
      s.eye[1] + Math.sin(s.eyeYaw),
      s.eye[2] - Math.tan((11 * Math.PI) / 180),
    );
    }
    renderView(scene, camera);
  }
  return {
    draw,
    dispose() {
      disposeStage();

      scene.traverse((o) => {
        if (o.isInstancedMesh) o.dispose();
        o.geometry?.dispose();
        o.material?.dispose();
      });
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
