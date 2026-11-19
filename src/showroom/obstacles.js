import * as THREE from 'three';

// Display scenery only: these furnishings do not add planner collision constraints.
export function addObstacles(scene) {
 const group=new THREE.Group();scene.add(group);
 const material=(color,roughness=.85)=>new THREE.MeshStandardMaterial({color,roughness});
 const oak=material(0xc6a77c), cream=material(0xe9e4da), blue=material(0x365b83), yellow=material(0xe8bd48), charcoal=material(0x424b52), sage=material(0x92a28e), fabric=material(0xa5b5ba), terracotta=material(0xbd826a);
 function box(parent,size,pos,mat){const m=new THREE.Mesh(new THREE.BoxGeometry(...size),mat);m.position.set(...pos);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m}
 function zone(x,y){const g=new THREE.Group();g.position.set(x,y,0);group.add(g);return g}
 function rug(g,w,d,mat){box(g,[w,d,.025],[0,0,.016],mat)}
 function table(g,x,y,w,d,h){box(g,[w,d,.09],[x,y,h],oak);for(const a of [-1,1])for(const b of [-1,1])box(g,[.08,.08,h],[x+a*(w/2-.12),y+b*(d/2-.12),h/2],charcoal)}
 function chair(g,x,y,rot=0){const c=zone(0,0);group.remove(c);g.add(c);c.position.set(x,y,0);c.rotation.z=rot;box(c,[.5,.5,.1],[0,0,.47],sage);box(c,[.5,.08,.48],[0,.22,.73],sage);for(const a of [-.19,.19])for(const b of [-.19,.19])box(c,[.045,.045,.43],[a,b,.215],oak)}
 function sofa(g,x,y,color){box(g,[2.5,.95,.28],[x,y,.35],color);box(g,[2.5,.18,.65],[x,y+.4,.7],color);for(const a of [-1.16,1.16])box(g,[.18,.95,.48],[x+a,y,.55],color);for(const a of [-.7,0,.7])box(g,[.65,.72,.12],[x+a,y-.05,.54],color)}
 function sign(x,y,text){const g=zone(x,y);for(const a of [-1.35,1.35])box(g,[.06,.06,2.75],[a,0,1.375],charcoal);box(g,[3,.1,.52],[0,0,2.65],blue);const canvas=document.createElement('canvas');canvas.width=768;canvas.height=128;const ctx=canvas.getContext('2d');ctx.fillStyle='#f7d45b';ctx.font='bold 48px sans-serif';ctx.textAlign='center';ctx.fillText(text,384,83);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;const label=new THREE.Mesh(new THREE.PlaneGeometry(2.8,.46),new THREE.MeshBasicMaterial({map:texture,transparent:true,side:THREE.DoubleSide}));label.rotation.x=Math.PI/2;label.position.set(0,-.061,2.65);g.add(label)}
 const ground=new THREE.Mesh(new THREE.PlaneGeometry(40,40),material(0xe3e0da));ground.position.z=-.018;ground.receiveShadow=true;group.add(ground);
 // Four showroom islands leave a 4 m central cross aisle and perimeter circulation.
 const living=zone(-5,5);rug(living,5.4,5.4,cream);sofa(living,0,1.4,fabric);table(living,0,-.1,1.5,.75,.42);chair(living,-1.7,-1.4,Math.PI/3);box(living,[2.4,.5,.55],[0,-2.2,.275],oak);sign(-5,8.2,'01  LIVING');
 const dining=zone(5,5);rug(dining,5.4,5.4,material(0xd7cfbf));table(dining,0,0,2.1,1.05,.76);for(const x of [-.65,.65]){chair(dining,x,1.05,0);chair(dining,x,-1.05,Math.PI)}box(dining,[2.8,.55,.88],[0,2.2,.44],cream);sign(5,8.2,'02  DINING');
 const bedroom=zone(-5,-5);rug(bedroom,5.4,5.4,material(0xcbd3ca));box(bedroom,[2.1,2.5,.32],[0,0,.25],oak);box(bedroom,[1.95,2.35,.22],[0,0,.52],cream);box(bedroom,[2.15,.12,1.1],[0,1.25,.55],oak);box(bedroom,[1.96,1.3,.045],[0,-.5,.65],terracotta);for(const x of [-.52,.52])box(bedroom,[.75,.45,.14],[x,.78,.7],cream);for(const x of [-1.55,1.55])table(bedroom,x,.7,.55,.55,.53);sign(-5,-8.2,'03  BEDROOM');
 const office=zone(5,-5);rug(office,5.4,5.4,material(0xd3d9dd));table(office,0,1,2.2,.85,.76);chair(office,0,0,Math.PI);box(office,[.85,.07,.5],[0,1.15,1.1],charcoal);box(office,[.07,.18,.2],[0,1.15,.86],charcoal);sofa(office,0,-1.8,sage);sign(5,-8.2,'04  WORKSPACE');
 // Low showroom backdrops frame each room without closing the central aisles.
 const white=material(0xf5f1e8), leaf=material(0x54745a), pot=material(0xd3b399);
 function cylinder(g,r1,r2,h,x,y,z,mat){const m=new THREE.Mesh(new THREE.CylinderGeometry(r1,r2,h,16),mat);m.rotation.x=Math.PI/2;m.position.set(x,y,z);m.castShadow=true;g.add(m);return m}
 function plant(g,x,y){cylinder(g,.22,.16,.38,x,y,.19,pot);for(let i=0;i<7;i++){const a=i*2.4;const m=new THREE.Mesh(new THREE.SphereGeometry(.22,10,8),leaf);m.scale.set(.65,1,1.7);m.position.set(x+Math.cos(a)*.16,y+Math.sin(a)*.16,.55+i*.065);g.add(m)}}
 function lamp(g,x,y){cylinder(g,.19,.19,.04,x,y,.02,charcoal);cylinder(g,.025,.025,1.55,x,y,.8,charcoal);cylinder(g,.2,.34,.36,x,y,1.55,cream)}
 function price(g,x,y,title,price){const canvas=document.createElement('canvas');canvas.width=256;canvas.height=320;const ctx=canvas.getContext('2d');ctx.fillStyle='#faf8ef';ctx.fillRect(0,0,256,320);ctx.fillStyle='#184c81';ctx.fillRect(0,0,256,48);ctx.fillStyle='#222';ctx.font='bold 23px sans-serif';ctx.fillText(title,18,95);ctx.font='18px sans-serif';ctx.fillText('Everyday design',18,130);ctx.font='bold 54px sans-serif';ctx.fillText(price,18,215);ctx.fillStyle='#e9c545';ctx.fillRect(18,251,220,36);const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;const card=new THREE.Mesh(new THREE.PlaneGeometry(.32,.4),new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide}));card.rotation.x=Math.PI/2;card.position.set(x,y,.92);g.add(card);box(g,[.025,.025,.72],[x,y,.36],charcoal);box(g,[.22,.16,.025],[x,y,.0125],charcoal)}
 for(const [g,color] of [[living,material(0xd2d9d4)],[dining,material(0xe0d5c2)],[bedroom,material(0xd5c6bd)],[office,material(0xc9d3dc)]]){
  box(g,[5.4,.1,1.75],[0,2.65,.875],color);
  box(g,[.1,1.3,1.75],[-2.65,2.05,.875],color);
  // Framed wall art, shelf objects and warm timber floor insets.
  box(g,[.85,.04,.65],[0,2.58,1.25],oak);box(g,[.74,.015,.54],[0,2.55,1.25],white);
  box(g,[.23,.01,.34],[-.15,2.535,1.25],terracotta);box(g,[.22,.01,.21],[.15,2.535,1.18],sage);
  plant(g,2.15,1.85);
 }
 for(const x of [-.7,.65]){const cushion=box(living,[.48,.18,.43],[x,1.64,.83],x<0?terracotta:yellow);cushion.rotation.y=x*.15}
 lamp(living,-2.1,1.5);lamp(bedroom,2.1,-1.65);lamp(office,2.1,-1.8);
 price(living,1.9,-1.6,'SOFA','299');price(dining,1.9,-1.6,'DINING','179');price(bedroom,1.9,-1.7,'BEDROOM','349');price(office,1.9,-1,'WORKSPACE','129');
 for(const x of [-.65,.65])for(const y of [-.25,.25])cylinder(dining,.15,.15,.016,x,y,.82,white);
 cylinder(dining,.11,.08,.27,0,0,.94,terracotta);
 for(let i=0;i<4;i++)box(office,[.3,.24,.035],[.7,1,.83+i*.037],i%2?blue:yellow);
 // A blue/yellow welcome desk and visible department directory anchor the entrance.
 const welcome=zone(0,-11);box(welcome,[3.4,.8,.95],[0,0,.475],blue);box(welcome,[3.55,.95,.09],[0,0,1],oak);box(welcome,[3.4,.025,.15],[0,-.413,.78],yellow);sign(0,-12,'SHOWROOM  /  WELCOME');
 // Stock shelving is grouped along the outer edges instead of scattered in aisles.
 for(const x of [-10,10])for(const y of [-4,3]){const rack=zone(x,y);for(const a of [-.5,.5])for(const b of [-2.3,0,2.3])box(rack,[.07,.07,2.5],[a,b,1.25],blue);for(const z of [.15,1.05,1.95]){box(rack,[1.15,4.8,.08],[0,0,z],oak);for(let j=0;j<4;j++){box(rack,[.8,.85,.52],[0,-1.8+j*1.2,z+.3],j%2?cream:oak);box(rack,[.015,.3,.12],[x<0?.411:-.411,-1.8+j*1.2,z+.32],yellow)}}}
 return group;
}
