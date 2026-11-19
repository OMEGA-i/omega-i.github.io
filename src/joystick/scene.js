import {prepareStage, portraitFov, portraitOffset} from "../showroom/lighting.js";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";


const xyz = (x, y, z) => new THREE.Vector3(x, z, -y);
const sceneFromWorld = new THREE.Quaternion().setFromAxisAngle(
  new THREE.Vector3(1, 0, 0),
  -Math.PI / 2,
);
const worldFromScene = sceneFromWorld.clone().invert();

const pathColor = 0x82adff;
const commandColor = 0xff8978;

function groundLine(points, color, width, dashed = false) {
  const mesh = new THREE.Group();
  // Real geometry gives the line a visible footprint at high device pixel ratios.
  const mat = new THREE.MeshBasicMaterial({ color, toneMapped: false });
  const up = new THREE.Vector3(0, 1, 0);
  function segment(a, b) {
    const delta = b.clone().sub(a);
    if (delta.length() < 0.0005) return;
    const tube = new THREE.Mesh(
      new THREE.CylinderGeometry(width, width, delta.length(), 8),
      mat,
    );
    tube.quaternion.setFromUnitVectors(up, delta.clone().normalize());
    tube.position.copy(a).lerp(b, 0.5);
    mesh.add(tube);
  }
  if (dashed) {
    const [start, end] = points;
    const delta = end.clone().sub(start),
      length = delta.length();
    if (length > 0.012) {
      const direction = delta.clone().normalize();
      for (let i = 0; i < length - 0.055; i += 0.135)
        segment(
          start.clone().addScaledVector(direction, i),
          start
            .clone()
            .addScaledVector(direction, Math.min(length - 0.055, i + 0.078)),
        );
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(width * 3.8, 0.115, 18),
        mat,
      );
      cone.position.copy(end).addScaledVector(direction, -0.055);
      cone.quaternion.setFromUnitVectors(up, direction);
      mesh.add(cone);
    }
  } else {
    for (let i = 1; i < points.length; i++) segment(points[i - 1], points[i]);
  }
  return mesh;
}

export async function createScene(element, names) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  prepareStage(scene, renderer, true);
  const camera = new THREE.PerspectiveCamera(portraitFov, 1, 0.03, 60);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.maxPolarAngle = Math.PI * 0.485;
  controls.minDistance = 1.5;
  controls.maxDistance = 6;
  let following = true;
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  let model;
  try {
    model = (await loader.loadAsync("/joystick/g1.glb")).scene;
  } catch (error) {
    renderer.dispose();
    throw error;
  }
  const links = names.map((name) => {
    const link = model.getObjectByName(name);
    if (!link) throw new Error("Missing G1 visual link " + name);
    return link;
  });
  // The asset has one independent coordinate frame per generated G1 body.
  // Preserve its local mesh transforms and apply the decoder's absolute rotations.
  model.traverse((node) => {
    if (node.isMesh) {
      node.castShadow = true;
      node.receiveShadow = true;
    }
  });
  scene.add(model);
  element.replaceChildren(renderer.domElement);
  let motion,
    frames = 0,
    trajectory,
    current = 0;
  const anchor = new THREE.Vector3(),
    previousAnchor = new THREE.Vector3(),
    q = new THREE.Quaternion();
  const m = new THREE.Matrix4();
  let alternate, selectedClip, alternatePose;
  const clips=new Map();
  async function loadAlternate(){
    const [asset,rig]=await Promise.all([
      loader.loadAsync("/joystick/a3/robot.glb"),
      fetch("/joystick/a3/rig.json").then(r=>r.json())
    ]);
    asset.scene.visible=false;
    asset.scene.traverse(n=>{if(n.isMesh)n.castShadow=n.receiveShadow=true;});
    const joints=rig.jointNames.map(name=>asset.scene.getObjectByName(name));
    if(joints.some(n=>!n))throw Error("Incomplete A3 mesh");
    scene.add(asset.scene);
    return {model:asset.scene,joints};
  }
  let alternateAsset;
  async function setAvatar(clip){
    selectedClip=clip;
    if(!clip){
      model.visible=true;
      if(alternate)alternate.model.visible=false;
      alternatePose=null;
      element.dataset.avatar="g1";draw(current);return;
    }
    alternateAsset??=loadAlternate().catch(error=>{alternateAsset=null;throw error});
    if(!clips.has(clip))clips.set(clip,fetch("/joystick/a3/"+clip+".f32").then(async r=>{
      if(!r.ok)throw Error("Missing retarget");
      return new Float32Array(await r.arrayBuffer());
    }).catch(error=>{clips.delete(clip);throw error}));
    const [asset,pose]=await Promise.all([alternateAsset,clips.get(clip)]);
    if(selectedClip!==clip)return;
    if(pose.length!==frames*asset.joints.length*7)throw Error("A3 frame count");
    alternate=asset;alternatePose=pose;model.visible=false;asset.model.visible=true;
    element.dataset.avatar="a3";draw(current);
  }
  function rootAt(frame) {
    const i = frame * names.length * 3,
      p = motion.positions;
    return xyz(p[i], p[i + 1], 0);
  }
  function reset() {
    if (!motion) return;
    anchor.copy(rootAt(current));
    anchor.y = selectedClip ? 1.02 : .78;
    controls.target.copy(anchor);
    const headingIndex = current * names.length;
    const rot = motion.quaternions;
    let heading;
    if (rot) {
      const [x,y,z,w] = rot.subarray(headingIndex*4,headingIndex*4+4);
      heading = Math.atan2(2*(w*z+x*y),1-2*(y*y+z*z));
    } else {
      heading = Math.atan2(motion.matrices[headingIndex*9+3],motion.matrices[headingIndex*9]);
    }
    const offset = portraitOffset(anchor.y,heading);
    if (camera.aspect < .88) offset.multiplyScalar(1.15);
    camera.position.copy(anchor).add(xyz(offset.x, offset.y, offset.z));
    previousAnchor.copy(anchor);
    controls.update();
    render();
  }
  function setMotion(data, count, velocity, _sample, fps = 25) {
    if(selectedClip)void setAvatar(null);
    motion = data;
    frames = count;
    current = 0;
    if (trajectory) {
      scene.remove(trajectory);
      const materials = new Set();
      trajectory.traverse((o) => {
        if (o.isMesh) {
          o.geometry.dispose();
          materials.add(o.material);
        }
      });
      materials.forEach((material) => material.dispose());
    }
    trajectory = new THREE.Group();
    const roots = Array.from({ length: count }, (_, i) =>
      rootAt(i).setY(0.014),
    );
    trajectory.add(groundLine(roots, pathColor, 0.011));
    const start = roots[0].clone().add(new THREE.Vector3(0, 0.002, 0.145));
    const end = start
      .clone()
      .addScaledVector(xyz(...velocity, 0), (count - 1) / fps);
    trajectory.add(groundLine([start, end], commandColor, 0.009, true));
    scene.add(trajectory);
    reset();
    draw(0);
  }
  function draw(frame) {
    if (!motion) return;
    current = Math.max(0, Math.min(frames - 1, frame));
    const { positions, quaternions, matrices } = motion;
    for (let i = 0; i < links.length; i++) {
      const j = current * links.length + i,
        k = j * 3;
      links[i].position.set(positions[k], positions[k + 2], -positions[k + 1]);
      if (quaternions) q.fromArray(quaternions, j * 4).normalize();
      else {
        const a = j * 9,
          r = matrices;
        m.set(
          r[a],
          r[a + 1],
          r[a + 2],
          0,
          r[a + 3],
          r[a + 4],
          r[a + 5],
          0,
          r[a + 6],
          r[a + 7],
          r[a + 8],
          0,
          0,
          0,
          0,
          1,
        );
        q.setFromRotationMatrix(m).normalize();
      }
      links[i].quaternion
        .copy(sceneFromWorld)
        .multiply(q)
        .multiply(worldFromScene);
    }
    if(alternatePose){
      alternate.joints.forEach((link,i)=>{
        const j=(current*alternate.joints.length+i)*7,p=alternatePose;
        link.position.set(p[j],p[j+2],-p[j+1]);
        link.quaternion.copy(sceneFromWorld).multiply(q.fromArray(p,j+3).normalize()).multiply(worldFromScene);
      });
    }
    anchor.copy(rootAt(current));
    anchor.y = selectedClip ? 1.02 : .78;
    const move = anchor.clone().sub(previousAnchor);
    if (following) {
      camera.position.add(move);
      controls.target.add(move);
    }
    previousAnchor.copy(anchor);
    controls.update();
    render();
  }
  function render() {
    renderer.render(scene, camera);
  }
  controls.addEventListener("change", render);
  new ResizeObserver(() => {
    const width = element.clientWidth,
      height = element.clientHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
    render();
  }).observe(element);
  // Link the inspection cameras while retaining each robot's own tracking target.
  function onOrbit(callback) {
    let dragging = false;
    controls.addEventListener("start", () => {
      dragging = true;
    });
    controls.addEventListener("end", () => {
      dragging = false;
    });
    controls.addEventListener("change", () => {
      if (dragging) callback(camera.position.clone().sub(controls.target));
    });
  }
  function setOrbit(offset) {
    camera.position.copy(controls.target).add(offset);
    controls.update();
  }
  return { setAvatar, setMotion, draw, reset, onOrbit, setOrbit, setFollowing(value) { following=value; }, interactive: true };
}

export function createVideoScene(element) {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.poster = "/joystick/cover.webp";
  element.replaceChildren(video);
  let pendingFrame = 0;
  const seek = () => {
    if (video.readyState >= 1) video.currentTime = pendingFrame / 25;
  };
  video.onloadedmetadata = seek;
  return {
    interactive: false,
    setMotion(_motion, _frames, _velocity, sample) {
      pendingFrame = 0;
      video.src = "/joystick/" + sample + ".mp4";
    },
    draw(frame) {
      pendingFrame = frame;
      seek();
    },
    reset() {},
  };
}
