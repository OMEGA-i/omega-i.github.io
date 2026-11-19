// The furnishing module is the original Joystick web/obstacles.js at 4664a0d.
import * as THREE from 'three';
import { addObstacles } from './obstacles.js';
export const dockWorld = [0, 0];
export function showroom(scene, patrol = false) {
  scene.background = new THREE.Color('#f5f5f7');
  scene.fog = new THREE.Fog('#f5f5f7',15,40);
  scene.add(new THREE.HemisphereLight(0xffffff,0x94949b,2.4));
  const light = new THREE.DirectionalLight(0xffffff,3);
  light.position.set(3,-4,8);
  scene.add(light);
  const group=addObstacles(scene);
  const grid=new THREE.GridHelper(40,80,0xc0c3c8,0xe0e2e6);
  grid.rotation.x=Math.PI/2;
  group.add(grid);
  if(patrol){
    group.rotation.z=Math.PI;
    group.position.set(...dockWorld,0);
    light.position.set(dockWorld[0]-3,dockWorld[1]+4,8);
    light.target.position.set(...dockWorld,0);
    scene.add(light.target);
  }
  return group;
}
