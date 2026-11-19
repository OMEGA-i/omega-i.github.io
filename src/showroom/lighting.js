import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { showroom } from './scene.js';

// The patrol, motion reference and dance all begin at the central cross aisle.
export const portraitFov = 35;
export function portraitOffset(height, yaw = 0) {
  return new THREE.Vector3(3.15, -.68, .56).applyAxisAngle(new THREE.Vector3(0,0,1), yaw).multiplyScalar(height / .78);
}

export function prepareStage(scene, renderer, yUp = false) {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const stage = new THREE.Scene();
  showroom(stage, true);
  scene.background = stage.background;
  scene.fog = stage.fog;
  const sky = stage.children.find(o => o.isHemisphereLight);
  sky.position.set(0, 0, 1);
  const sun = stage.children.find(o => o.isDirectionalLight);
  sun.target.position.set(2, 1, 0);
  sun.position.copy(sun.target.position).add(new THREE.Vector3(-3, 4, 8));
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, {left:-9, right:9, top:9, bottom:-9, near:.1, far:28});
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.normalBias = .014;
  const group = new THREE.Group();
  group.add(...stage.children.slice());
  if (yUp) group.rotation.x = -Math.PI / 2;
  scene.add(group);

  const room = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const reflections = pmrem.fromScene(room, .025);
  scene.environment = reflections.texture;
  scene.environmentIntensity = .55;
  if (!yUp) scene.environmentRotation.x = Math.PI / 2;
  room.dispose();
  pmrem.dispose();
  return () => {sun.shadow.dispose(); reflections.dispose();};
}
