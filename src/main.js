/* Emily's Adventures · 3D scene, controls and quest logic. */
(async function bootEmily() {
'use strict';
try {
const THREE = await import('https://cdn.jsdelivr.net/npm/three@0.163.0/build/three.module.js');
const GRAPHICS_STORAGE = 'emilys-adventures-graphics-v2';
const presets = {
  low:      {renderScale:70, shadows:'off',  fps:30, decorations:'low',    reducedEffects:true},
  balanced: {renderScale:100,shadows:'512',fps:60, decorations:'medium', reducedEffects:false},
  high:     {renderScale:125,shadows:'1024',fps:60, decorations:'high',   reducedEffects:false}
};
const clampValue=(v,a,b)=>Math.max(a,Math.min(b,v));
function readGraphics() {
  const touch=matchMedia('(pointer:coarse)').matches;
  const defaultPreset=touch ? 'low' : 'balanced';
  let previous={};try{previous=JSON.parse(localStorage.getItem(GRAPHICS_STORAGE)||'{}')||{}}catch(_){previous={}}
  const preset=Object.hasOwn(presets,previous.preset) ? previous.preset : previous.preset==='custom' ? 'custom' : defaultPreset;
  const fallback=presets[defaultPreset];
  const base=preset==='custom'?fallback:presets[preset];
  return {
    preset,
    renderScale:clampValue(Number(previous.renderScale) || base.renderScale,60,150),
    shadows:['off','512','1024','2048'].includes(previous.shadows)?previous.shadows:base.shadows,
    fps:[0,30,45,60].includes(Number(previous.fps))?Number(previous.fps):base.fps,
    decorations:['low','medium','high'].includes(previous.decorations)?previous.decorations:base.decorations,
    reducedEffects:typeof previous.reducedEffects==='boolean'?previous.reducedEffects:base.reducedEffects,
    showFps:previous.showFps===true
  };
}
let graphics=readGraphics();
function storeGraphics(){try{localStorage.setItem(GRAPHICS_STORAGE,JSON.stringify(graphics))}catch(_){}}


const $ = id=>document.getElementById(id);
const canvas=$('gameCanvas');
const atlasURL='assets/hero/emily-atlas.png';
const SCENE_RADIUS=21;
const crystalsAt=[{x:12,z:-7,name:'Кристал світанку'},{x:-13,z:9,name:'Кристал сутінків'},{x:8,z:13,name:'Кристал надії'}];
const playerStart={x:0,z:-1};
const sageAt={x:-3.4,z:-3.3};
const shrineAt={x:2,z:-12.5};
const STORAGE='emilys-adventures-chapter1-v1';
let saved=null;try{saved=JSON.parse(localStorage.getItem(STORAGE)||'null')}catch(_){saved=null}
const state={started:false,paused:false,inDialogue:false,bagOpen:false,stage:Math.max(0,Math.min(3,saved?.stage||0)),hp:Math.max(1,Math.min(100,saved?.hp??100)),coins:saved?.coins||0,potions:Math.max(0,saved?.potions??2),collected:[0,1,2].map(i=>!!saved?.collected?.[i]),kills:saved?.kills||0,attackCD:0,hitCD:0,x:saved?.x??playerStart.x,z:saved?.z??playerStart.z};
function persist(){try{localStorage.setItem(STORAGE,JSON.stringify({stage:state.stage,hp:state.hp,coins:state.coins,potions:state.potions,collected:state.collected,kills:state.kills,x:Math.round(state.x*100)/100,z:Math.round(state.z*100)/100}))}catch(_){}}
let notificationTimer=0;
function toast(message){const t=$('toast');t.textContent=message;t.classList.add('show');clearTimeout(notificationTimer);notificationTimer=setTimeout(()=>t.classList.remove('show'),2800)}
const countGems=()=>state.collected.filter(Boolean).length;
function refreshHUD(){ $('hpValue').textContent=`${Math.ceil(state.hp)} / 100`;$('hpBar').style.width=`${state.hp}%`;$('coinValue').textContent=state.coins;$('gemValue').textContent=`${countGems()} / 3`;$('potionValue').textContent=state.potions;
 const stages=[['Поговори з Мірою','Біля маленького села на тебе чекає мудра хранителька лісу.','ЗНАЙТИ ХРАНИТЕЛЬКУ'],['Знайди зоряні кристали','Відшукай три кристали у віддалених куточках лісу. Бережися тіньових духів!','КРИСТАЛИ · '+countGems()+'/3'],['Поверни світло','Усі три кристали знайдено! Віднеси їх до зоряного вівтаря на півдні.','ДО ЗОРЯНОГО ВІВТАРЯ'],['Зоряний ліс врятовано!','Ти повернула магію лісу. Можна ще досліджувати цей дивовижний світ.','РОЗДІЛ ЗАВЕРШЕНО']];
 const q=stages[state.stage];$('questTitle').textContent=q[0];$('questDesc').textContent=q[1];$('questProgress').textContent=q[2];[...$('questDots').children].forEach((el,i)=>el.classList.toggle('on',state.collected[i]));
 $('inventoryContents').innerHTML=`💎 Зоряні кристали: <b>${countGems()}/3</b><br>🪙 Монети: <b>${state.coins}</b><br>🧪 Зілля: <b>${state.potions}</b><br>⚔️ Переможені духи: <b>${state.kills}</b><br><br><span style="color:#a9ddc8">Натисни Q, щоб випити зілля і відновити 40 здоров'я.</span>`;
}
refreshHUD();

// Rendering and camera
const renderer=new THREE.WebGLRenderer({canvas,antialias:false,alpha:false,powerPreference:'high-performance'});
renderer.shadowMap.enabled=graphics.shadows!=='off';renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.17;
const scene=new THREE.Scene();scene.background=new THREE.Color(0xb8e4e0);scene.fog=new THREE.FogExp2(0xb8e4e0,.020);
const camera=new THREE.OrthographicCamera();const cameraFollow=new THREE.Vector3(state.x,0,state.z);
function resize(){
 const w=Math.max(1,canvas.clientWidth),h=Math.max(1,canvas.clientHeight),asp=w/h;
 const portrait=h>w;
 const vertical=portrait?18.5:(h<480?15.7:15.5);
 camera.left=-vertical*asp/2;camera.right=vertical*asp/2;camera.top=vertical/2;camera.bottom=-vertical/2;
 camera.near=.1;camera.far=150;camera.updateProjectionMatrix();
 // Scale is expressed relative to CSS pixels, independently of hardware DPR.
 renderer.setPixelRatio(graphics.renderScale/100);
 renderer.setSize(w,h,false);
}
window.addEventListener('resize',resize);
window.visualViewport?.addEventListener('resize',resize);
resize();
scene.add(new THREE.HemisphereLight(0xcdf8ef,0x83a67d,2.3));
const sun=new THREE.DirectionalLight(0xffebc5,2.65);sun.position.set(-10,23,12);sun.castShadow=true;sun.shadow.mapSize.set(graphics.shadows==='off'?512:Number(graphics.shadows),graphics.shadows==='off'?512:Number(graphics.shadows));sun.shadow.camera.left=-25;sun.shadow.camera.right=25;sun.shadow.camera.top=25;sun.shadow.camera.bottom=-25;sun.shadow.camera.near=.5;sun.shadow.camera.far=70;sun.shadow.bias=-.0003;scene.add(sun);
const mat=(color,other={})=>new THREE.MeshStandardMaterial({color,roughness:.96,...other});
const grass=mat(0x8fbe8b),darkGrass=mat(0x6aa47b),lightGrass=mat(0xa1cda0),pathMat=mat(0xd8c8a4),trunkMat=mat(0x846f62),leafA=mat(0x4c917f),leafB=mat(0x70af83),leafC=mat(0x80bd8a),rockMat=mat(0xa0b0a1),flowerYellow=mat(0xffdeb0,{emissive:0x5f3918,emissiveIntensity:.1}),flowerPink=mat(0xf8aeb4),blue=mat(0x8fe8f2,{emissive:0x3ab7c1,emissiveIntensity:.7});
const add=(mesh,x,y,z,cast=false)=>{mesh.position.set(x,y,z);mesh.castShadow=cast;mesh.receiveShadow=true;scene.add(mesh);return mesh};
const ground=add(new THREE.Mesh(new THREE.PlaneGeometry(52,52),grass),0,-.08,0);ground.rotation.x=-Math.PI/2;
let seed=3391;const rand=()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296),between=(a,b)=>a+(b-a)*rand();
function disk(x,z,r,color,y=.001,segments=20){const o=new THREE.Mesh(new THREE.CircleGeometry(r,segments),color);o.rotation.x=-Math.PI/2;o.position.set(x,y,z);scene.add(o);return o}
// Ground patterns and stepping-stone paths
const groundDetails=[];
for(let i=0;i<94;i++){const x=between(-23,23),z=between(-23,23);groundDetails.push(disk(x,z,between(.35,1.85),rand()>.5?lightGrass:darkGrass,-.075,9))}
function path(a,b,width=.92){const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);const m=new THREE.Mesh(new THREE.PlaneGeometry(width,len),pathMat);m.rotation.set(-Math.PI/2,0,Math.atan2(dx,dz));m.position.set((a.x+b.x)/2,-.053,(a.z+b.z)/2);scene.add(m);for(let i=0;i<Math.ceil(len/1.15);i++){const k=(i+.5)/Math.ceil(len/1.15);disk(a.x+dx*k+between(-.12,.12),a.z+dz*k+between(-.12,.12),between(.07,.16),mat(0xf0ddbb),-.045,6)}}
path({x:-7,z:-4},{x:1,z:-1},1.35);path({x:1,z:-1},{x:2,z:-12.5},1.1);path({x:1,z:-1},{x:12,z:-7},.9);path({x:1,z:-1},{x:-13,z:9},.7);
// A tiny pond and lilies
const pond=disk(-11,-9,3.2,mat(0x67b5af,{metalness:.05,roughness:.3}),-.036,40);pond.scale.set(1.23,.7,1);
for(let i=0;i<10;i++){let a=rand()*Math.PI*2,r=rand()*2.4;disk(-11+Math.cos(a)*r,-9+Math.sin(a)*r,between(.1,.21),mat(0x4c907d),-.024,9)}
// Collision volumes are separated from decorative geometry.
const solids=[];function solid(x,z,r){solids.push({x,z,r})}
function tree(x,z,scale=1,colorIndex=0){const crown=[leafA,leafB,leafC][colorIndex%3];let trunk=add(new THREE.Mesh(new THREE.CylinderGeometry(.13*scale,.23*scale,1.05*scale,6),trunkMat),x,.45*scale,z,true);
 if(rand()<.52){const a=add(new THREE.Mesh(new THREE.ConeGeometry(.82*scale,2.0*scale,7),crown),x,1.75*scale,z,true);a.rotation.y=rand()*Math.PI;add(new THREE.Mesh(new THREE.ConeGeometry(.7*scale,1.45*scale,7),crown),x,2.4*scale,z,true)}
 else{const leaf=add(new THREE.Mesh(new THREE.IcosahedronGeometry(.92*scale,0),crown),x,1.55*scale,z,true);leaf.scale.y=1.15;add(new THREE.Mesh(new THREE.IcosahedronGeometry(.65*scale,0),crown),x+.34*scale,1.95*scale,z-.16*scale,true)}
 solid(x,z,.38*scale);
}
const clearings=[{x:0,z:-1,r:4.7},{x:-7,z:-4,r:4.0},{x:sageAt.x,z:sageAt.z,r:2.8},{x:shrineAt.x,z:shrineAt.z,r:3.25},...crystalsAt.map(c=>({...c,r:3.4})),{x:-11,z:-9,r:4.1}];
function allowedTree(x,z){return clearings.every(p=>Math.hypot(x-p.x,z-p.z)>p.r)}
for(let i=0,tries=0;i<135&&tries<1000;tries++){const x=between(-23,23),z=between(-23,23);if(!allowedTree(x,z)||Math.hypot(x,z)>29)continue;tree(x,z,between(.72,1.34),Math.floor(rand()*3));i++}
// Batch tiny flowers into three instanced draw calls, rather than hundreds of meshes.
const flowerSpots=[];
for(let i=0;i<185;i++){let x=between(-21,21),z=between(-21,21);if(Math.hypot(x+11,z+9)<3.6)continue;flowerSpots.push({x,z,pink:rand()>.49})}
function placeInstances(mesh,spots,y,scale){const dummy=new THREE.Object3D();spots.forEach((p,i)=>{dummy.position.set(p.x,y,p.z);dummy.rotation.set(0,0,0);dummy.scale.set(...scale);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix)});mesh.instanceMatrix.needsUpdate=true;mesh.receiveShadow=true;scene.add(mesh)}
const flowerDetails=[];
const flowerStem=new THREE.InstancedMesh(new THREE.CylinderGeometry(.018,.018,.17,4),leafB,flowerSpots.length);
placeInstances(flowerStem,flowerSpots,.052,[1,1,1]);flowerDetails.push(flowerStem);
const flowerHeadGeometry=new THREE.SphereGeometry(.075,6,5);
for(const [pink,color] of [[true,flowerPink],[false,flowerYellow]]){const spots=flowerSpots.filter(p=>p.pink===pink);if(!spots.length)continue;const heads=new THREE.InstancedMesh(flowerHeadGeometry,color,spots.length);placeInstances(heads,spots,.13,[1,.8,1]);flowerDetails.push(heads)}
const rockInstances=new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1,0),rockMat,68),rockDummy=new THREE.Object3D();let rockCount=0;
for(let i=0;i<68;i++){let x=between(-22,22),z=between(-22,22);if(clearings.some(p=>Math.hypot(x-p.x,z-p.z)<p.r*.6))continue;const r=between(.1,.37);rockDummy.position.set(x,.065,z);rockDummy.rotation.set(0,rand()*5,0);rockDummy.scale.set(r,r*.58,r*.78);rockDummy.updateMatrix();rockInstances.setMatrixAt(rockCount++,rockDummy.matrix)}
rockInstances.count=rockCount;rockInstances.instanceMatrix.needsUpdate=true;rockInstances.receiveShadow=true;scene.add(rockInstances);
function setDecorations(level){
 const all=level==='high',medium=level==='medium';
 flowerDetails.forEach(o=>{o.visible=all||medium});
 rockInstances.visible=all;
 groundDetails.forEach((o,i)=>{o.visible=all||(medium&&i%2===0)});
}
// House and village landmarks
function house(x,z){const walls=add(new THREE.Mesh(new THREE.BoxGeometry(3.1,2.25,2.7),mat(0xe5cca6)),x,1.05,z,true);
 const roof=add(new THREE.Mesh(new THREE.ConeGeometry(2.55,1.55,4),mat(0x9a7667)),x,2.85,z,true);roof.rotation.y=Math.PI/4;
 const door=add(new THREE.Mesh(new THREE.BoxGeometry(.85,1.28,.04),mat(0x6d6257)),x,0.6,z+1.37);const doorKnob=add(new THREE.Mesh(new THREE.SphereGeometry(.06,8,8),flowerYellow),x+.28,.66,z+1.44);
 for(let xx of [-1.07,1.07]){const window=add(new THREE.Mesh(new THREE.BoxGeometry(.56,.52,.055),mat(0xc9f5db,{emissive:0x7ab5a3,emissiveIntensity:.3})),x+xx,1.45,z+1.39)}
 const chimney=add(new THREE.Mesh(new THREE.BoxGeometry(.4,.8,.4),mat(0xa5766b)),x+.85,3.0,z-.4,true);solid(x,z,2.0)}
house(-7,-4);
// fountain in the center of the village
const fountainAt={x:3,z:1};const rim=add(new THREE.Mesh(new THREE.CylinderGeometry(1.24,1.34,.38,24),mat(0xc7d6c1)),3,.12,1,true);const water=add(new THREE.Mesh(new THREE.CylinderGeometry(1.07,1.07,.04,24),mat(0x7dc7cb,{emissive:0x235c69,emissiveIntensity:.25,roughness:.33})),3,.34,1);add(new THREE.Mesh(new THREE.CylinderGeometry(.18,.25,.85,10),mat(0xd9e1d0)),3,.55,1);add(new THREE.Mesh(new THREE.SphereGeometry(.17,12,8),blue),3,1.04,1);solid(3,1,1.36);
function signLabel(text,x,y,z,w=2.85){const c=document.createElement('canvas');c.width=512;c.height=112;const g=c.getContext('2d');g.fillStyle='#153a47da';g.beginPath();g.roundRect(4,5,504,102,33);g.fill();g.strokeStyle='#c6f6d355';g.lineWidth=4;g.stroke();g.fillStyle='#f6fff8';g.font='bold 41px Manrope,system-ui,sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(text,256,57);const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthWrite:false}));sprite.position.set(x,y,z);sprite.scale.set(w,w*112/512,1);scene.add(sprite);return sprite}
// Guardian Míra
const sage=new THREE.Group();sage.position.set(sageAt.x,0,sageAt.z);scene.add(sage);
const owlBody=new THREE.Mesh(new THREE.SphereGeometry(.47,10,10),mat(0xe7cf9a));owlBody.scale.set(.87,1.2,.82);owlBody.position.y=.68;sage.add(owlBody);
const owlHead=new THREE.Mesh(new THREE.SphereGeometry(.39,12,10),mat(0xf3e2bb));owlHead.position.y=1.31;sage.add(owlHead);
for(let ex of [-.16,.16]){let eye=new THREE.Mesh(new THREE.SphereGeometry(.105,10,7),mat(0x304951));eye.position.set(ex,1.37,.33);sage.add(eye);let shine=new THREE.Mesh(new THREE.SphereGeometry(.027,8,8),mat(0xffffff));shine.position.set(ex-.03,1.40,.416);sage.add(shine)}
const beak=new THREE.Mesh(new THREE.ConeGeometry(.09,.18,4),mat(0xebad73));beak.rotation.x=Math.PI/2;beak.position.set(0,1.20,.42);sage.add(beak);
for(let ex of [-.32,.32]){let ear=new THREE.Mesh(new THREE.ConeGeometry(.18,.39,5),mat(0xe7cf9a));ear.position.set(ex,1.63,0);sage.add(ear)}
const sageLabel=signLabel('✦  Міра · хранителька',sageAt.x,2.5,sageAt.z,3.2);
// Ancient shrine
const altar=add(new THREE.Mesh(new THREE.CylinderGeometry(1.72,1.9,.52,8),mat(0x9aabb0)),shrineAt.x,.21,shrineAt.z,true);
const altarInner=add(new THREE.Mesh(new THREE.CylinderGeometry(1.18,1.32,.12,8),mat(0xc8d8c8)),shrineAt.x,.55,shrineAt.z);
const altarCrystal=add(new THREE.Mesh(new THREE.OctahedronGeometry(.56),mat(0xc6f2fa,{emissive:0x67c4d5,emissiveIntensity:.6,metalness:.15,roughness:.28})),shrineAt.x,1.42,shrineAt.z);altarCrystal.rotation.z=.15;
for(let k=0;k<6;k++){let a=k/6*Math.PI*2;add(new THREE.Mesh(new THREE.CylinderGeometry(.13,.18,1,6),mat(0xa6b9ac)),shrineAt.x+Math.cos(a)*1.2,.88,shrineAt.z+Math.sin(a)*1.2,true)}
signLabel('✧  Зоряний вівтар',shrineAt.x,3.06,shrineAt.z,3.05);
// Collectible crystals and gentle glow
const collectibles=crystalsAt.map((p,i)=>{const group=new THREE.Group();group.position.set(p.x,0,p.z);scene.add(group);
 const c=new THREE.Mesh(new THREE.OctahedronGeometry(.48),mat([0xffd59a,0x9bc5ff,0xf3abdf][i],{emissive:[0xff9b54,0x568be8,0xcd5db7][i],emissiveIntensity:.55,roughness:.25}));c.scale.y=1.35;c.position.y=1.02;group.add(c);
 const ring=new THREE.Mesh(new THREE.TorusGeometry(.65,.04,6,30),mat(0xe7ffef,{emissive:0x8ad5db,emissiveIntensity:.7}));ring.rotation.x=Math.PI/2;ring.position.y=.13;group.add(ring);
 const light=new THREE.PointLight([0xffd79f,0x8fb8ff,0xf4a3d9][i],1.6,5);light.position.y=1;group.add(light);
 const label=signLabel('◆  '+p.name,p.x,2.17,p.z,3.1);
 group.visible=!state.collected[i];label.visible=!state.collected[i];return {group,c,ring,label,...p}});
const atlasTex=new THREE.TextureLoader().load(atlasURL);atlasTex.colorSpace=THREE.SRGBColorSpace;atlasTex.minFilter=THREE.NearestFilter;atlasTex.magFilter=THREE.NearestFilter;atlasTex.generateMipmaps=false;atlasTex.repeat.set(.25,.25);
const heroMaterial=new THREE.SpriteMaterial({map:atlasTex,transparent:true,alphaTest:.035,depthWrite:false,opacity:1});
const hero=new THREE.Sprite(heroMaterial);hero.scale.set(1.64,1.91,1);hero.position.set(state.x,1.03,state.z);scene.add(hero);
const heroShadow=disk(state.x,state.z,.62,mat(0x436e64,{transparent:true,opacity:.25}),-.007,24);heroShadow.scale.set(1,.56,1);
const directionRows={down:0,left:1,right:2,up:3};let facing='down',frame=0,walkClock=0,shownFrame='';
function setHeroFrame(dir,index){const key=dir+index;if(key===shownFrame)return;shownFrame=key;atlasTex.offset.set(index*.25,(3-directionRows[dir])*.25)}
setHeroFrame('down',0);
// Small shadow spirits
const enemies=[{x:6.6,z:8},{x:-9.8,z:3},{x:14.6,z:5},{x:-10.7,z:-13}].map((p,index)=>{
 const group=new THREE.Group();group.position.set(p.x,0,p.z);scene.add(group);
 const body=new THREE.Mesh(new THREE.IcosahedronGeometry(.55,1),mat(0x615d82,{emissive:0x282347,emissiveIntensity:.34}));body.scale.set(1,1.15,.9);body.position.y=.63;group.add(body);
 for(let e of [-.18,.18]){const eye=new THREE.Mesh(new THREE.SphereGeometry(.075,7,6),mat(0xffb8d7,{emissive:0xea73b0,emissiveIntensity:.8}));eye.position.set(e,.72,.47);group.add(eye)}
 for(let e of [-.32,.32]){const horn=new THREE.Mesh(new THREE.ConeGeometry(.16,.37,5),mat(0x655e87));horn.position.set(e,1.28,0);group.add(horn)}
 const shadow=disk(p.x,p.z,.53,mat(0x364d60,{transparent:true,opacity:.34}),-.008);
 const halo=new THREE.Mesh(new THREE.TorusGeometry(.62,.027,5,25),mat(0xd1a7f4,{emissive:0x704bb0,emissiveIntensity:.7}));halo.rotation.x=Math.PI/2;halo.position.y=.06;group.add(halo);
 return {group,body,shadow,x:p.x,z:p.z,spawn:{...p},hp:2,alive:true,attackTimer:0,phase:index*2.1}
});
const effects=[];
function pulse(x,z,color=0xffe0a0){const mesh=new THREE.Mesh(new THREE.RingGeometry(.3,.4,32),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.85,side:THREE.DoubleSide,depthWrite:false}));mesh.rotation.x=-Math.PI/2;mesh.position.set(x,.13,z);scene.add(mesh);effects.push({mesh,life:.56,age:0});}
function collect(i){if(state.collected[i]||state.stage===0)return;state.collected[i]=true;collectibles[i].group.visible=false;collectibles[i].label.visible=false;pulse(crystalsAt[i].x,crystalsAt[i].z,0xeaffd2);toast('💎 Знайдено: '+crystalsAt[i].name+'!');if(countGems()===3){state.stage=2;toast('✨ Усі кристали зібрано! Прямуй до вівтаря на півдні.')}refreshHUD();persist()}
function heal(){if(!state.started||state.paused||state.inDialogue||state.bagOpen||settingsOpen)return;if(state.potions<=0){toast('🧪 Зілля закінчилися');return}if(state.hp>=100){toast('❤️ Здоров’я вже повне');return}state.potions--;state.hp=Math.min(100,state.hp+40);pulse(state.x,state.z,0x83eec2);toast('❤️ Відновлено 40 здоров’я');refreshHUD();persist()}
function attack(){if(!state.started||state.paused||state.inDialogue||state.bagOpen||settingsOpen||state.attackCD>0)return;state.attackCD=.48;pulse(state.x,state.z,0xfbd69e);let hit=0;for(const e of enemies){if(!e.alive||Math.hypot(e.x-state.x,e.z-state.z)>2.35)continue;e.hp--;hit++;e.body.material.emissive=new THREE.Color(0xbb8899);if(e.hp<=0){e.alive=false;e.group.visible=false;e.shadow.visible=false;state.coins+=5;state.kills++;pulse(e.x,e.z,0xe7b8ff);toast('⚔️ Дух переможений! +5 монет');refreshHUD();persist()}}
 if(!hit)toast('⚔️ Замах! Духи надто далеко.')}
function dialogue(name,face,lines,onClose){state.inDialogue=true;$('dialogueSpeaker').textContent=name;$('dialogueFace').textContent=face;const el=$('dialogue');el.classList.remove('hidden');let i=0;
 const draw=()=>{$('dialogueLine').textContent=lines[i];$('nextDialogue').textContent=i===lines.length-1?'Зрозуміло ✓':'Далі ›'};draw();
 $('nextDialogue').onclick=()=>{if(i<lines.length-1){i++;draw()}else{el.classList.add('hidden');state.inDialogue=false;onClose?.()}};
}
function nearObject(){const opts=[{type:'sage',x:sageAt.x,z:sageAt.z,r:2.35,label:'Поговорити з Мірою'},{type:'altar',x:shrineAt.x,z:shrineAt.z,r:2.5,label:'Доторкнутися до вівтаря'},...crystalsAt.map((p,i)=>({type:'crystal',i,x:p.x,z:p.z,r:1.7,label:'Взяти '+p.name.toLowerCase()})).filter(x=>!state.collected[x.i])];let found=null,dist=Infinity;for(let o of opts){let d=Math.hypot(o.x-state.x,o.z-state.z);if(d<o.r&&d<dist){dist=d;found=o}}return found}
function interact(){if(!state.started||state.paused||state.inDialogue||state.bagOpen||settingsOpen)return;const near=nearObject();if(!near){toast('✦ Підійди ближче до когось або чогось цікавого');return}
 if(near.type==='sage'){
  if(state.stage===0)dialogue('Міра · хранителька','🦉',['Вітаю, Емілі! Наш зоряний ліс поступово втрачає чарівне світло.','Три зоряні кристали розсіялися далеко серед дерев. Лише сміливе серце здатне повернути їх.','Знайди всі три кристали та віднеси їх до стародавнього вівтаря на півдні. Остерігайся тіньових духів!'],()=>{state.stage=1;refreshHUD();persist();toast('📜 Нове завдання: знайти 3 зоряні кристали')});
  else dialogue('Міра · хранителька','🦉',state.stage===3?['Ти зробила це, маленька героїне! Тепер зорі освітлюватимуть наш ліс.']:['Кристали відчувають твою доброту. Поглядай на мінімапу, щоб не загубитися.','Якщо духи тебе поранять, випий зілля здоров’я клавішею Q.']);
 }else if(near.type==='crystal'){if(state.stage===0)toast('Спочатку запитай у Міри, що сталося з лісом');else collect(near.i)}
 else if(near.type==='altar'){
  if(state.stage===2){state.stage=3;pulse(shrineAt.x,shrineAt.z,0xffeb9d);refreshHUD();persist();$('winOverlay').classList.remove('hidden');state.paused=true}
  else if(state.stage===3)dialogue('Зоряний вівтар','✨',['Кристали ніжно сяють. Зоряний ліс знову живе своїм казковим життям.']);
  else toast('✧ Вівтар чекає, доки знайдеш усі три кристали')
 }
}
function bag(){if(!state.started||state.inDialogue||state.paused||settingsOpen)return;state.bagOpen=true;refreshHUD();$('inventoryOverlay').classList.remove('hidden')}
function closeBag(){$('inventoryOverlay').classList.add('hidden');state.bagOpen=false}
function setPause(force){if(!state.started||state.inDialogue||state.bagOpen||settingsOpen)return;state.paused=typeof force==='boolean'?force:!state.paused;$('pauseOverlay').classList.toggle('hidden',!state.paused);persist()}
// Graphics settings can be changed live; gameplay progress is stored separately.
let settingsOpen=false;
const controls={preset:$('qualityPreset'),scale:$('renderScale'),shadows:$('shadowQuality'),fps:$('frameLimit'),decorations:$('decorationQuality'),effects:$('reduceEffects'),meter:$('showFps')};
function applyGraphics(){
 renderer.shadowMap.enabled=graphics.shadows!=='off';
 if(graphics.shadows!=='off'){
  const size=Number(graphics.shadows);
  if(sun.shadow.mapSize.x!==size){
   sun.shadow.mapSize.set(size,size);
   sun.shadow.map?.dispose();sun.shadow.map=null;
  }
 }
 sun.castShadow=graphics.shadows!=='off';
 renderer.shadowMap.needsUpdate=true;
 setDecorations(graphics.decorations);
 document.documentElement.classList.toggle('reduced-effects',graphics.reducedEffects);
 $('fpsCounter').classList.toggle('visible',graphics.showFps);
 resize();
}
function syncSettings(){
 controls.preset.value=graphics.preset;
 controls.scale.value=String(graphics.renderScale);
 $('renderScaleValue').textContent=graphics.renderScale+'%';
 controls.shadows.value=graphics.shadows;
 controls.fps.value=String(graphics.fps);
 controls.decorations.value=graphics.decorations;
 controls.effects.checked=graphics.reducedEffects;
 controls.meter.checked=graphics.showFps;
}
function setGraphics(next){graphics={...graphics,...next};storeGraphics();syncSettings();applyGraphics()}
controls.preset.addEventListener('change',()=>{
 const preset=controls.preset.value;
 if(!Object.hasOwn(presets,preset))return;
 setGraphics({...presets[preset],preset});
});
controls.scale.addEventListener('input',()=>setGraphics({preset:'custom',renderScale:Number(controls.scale.value)}));
controls.shadows.addEventListener('change',()=>setGraphics({preset:'custom',shadows:controls.shadows.value}));
controls.fps.addEventListener('change',()=>setGraphics({preset:'custom',fps:Number(controls.fps.value)}));
controls.decorations.addEventListener('change',()=>setGraphics({preset:'custom',decorations:controls.decorations.value}));
controls.effects.addEventListener('change',()=>setGraphics({preset:'custom',reducedEffects:controls.effects.checked}));
controls.meter.addEventListener('change',()=>setGraphics({showFps:controls.meter.checked}));
function openSettings(){
 if(settingsOpen||state.inDialogue)return;
 settingsOpen=true;
 $('settingsOverlay').classList.remove('hidden');syncSettings();
 $('closeSettingsBtn').focus();
}
function closeSettings(){settingsOpen=false;$('settingsOverlay').classList.add('hidden');$('settingsBtn').focus()}
$('settingsBtn').addEventListener('click',openSettings);
$('pauseSettingsBtn').addEventListener('click',openSettings);
$('closeSettingsBtn').addEventListener('click',closeSettings);
$('applySettingsBtn').addEventListener('click',closeSettings);
$('settingsOverlay').addEventListener('pointerdown',e=>{if(e.target===$('settingsOverlay'))closeSettings()});
applyGraphics();syncSettings();
// Mobile quest/map panels take turns occupying the same popover space.
function toggleMobilePanel(panel){
 const show= !document.body.classList.contains('show-'+panel);
 for(const section of ['quest','map'])document.body.classList.remove('show-'+section);
 if(show)document.body.classList.add('show-'+panel);
 $('questToggle').setAttribute('aria-expanded',String(show&&panel==='quest'));
 $('mapToggle').setAttribute('aria-expanded',String(show&&panel==='map'));
}
$('questToggle').onclick=()=>toggleMobilePanel('quest');
$('mapToggle').onclick=()=>toggleMobilePanel('map');
function collapsePanels(){document.body.classList.remove('show-quest','show-map');$('questToggle').setAttribute('aria-expanded','false');$('mapToggle').setAttribute('aria-expanded','false')}
function reset(){try{localStorage.removeItem(STORAGE)}catch(_){ }window.location.reload()}
$('startBtn').textContent=saved?'Продовжити пригоду ✨':'Розпочати пригоду ✨';$('startBtn').addEventListener('click',()=>{state.started=true;$('startOverlay').classList.add('hidden');toast(state.stage===0?'🌿 Знайди Міру біля села':'✨ З поверненням у Зоряний ліс!')});
$('interactBtn').onclick=interact;$('attackBtn').onclick=attack;$('healBtn').onclick=heal;$('inventoryBtn').onclick=bag;
// React on touch-down instead of waiting for click: reliable while a second finger holds the stick.
const mobileActionBindings=[['mInteract',interact],['mAttack',attack],['mHeal',heal],['mBag',bag]];
for(const [id,action] of mobileActionBindings){
 const btn=$(id);let lastTouch=-10000;
 btn.addEventListener('pointerdown',e=>{
  if(e.pointerType==='touch'||e.pointerType==='pen'){
   e.preventDefault();lastTouch=performance.now();action();
  }
 });
 btn.addEventListener('click',e=>{
  if(performance.now()-lastTouch<650){e.preventDefault();return}
  action();
 });
}
$('pauseBtn').onclick=()=>setPause();$('resumeBtn').onclick=()=>setPause(false);$('restartBtn').onclick=reset;$('closeBagBtn').onclick=closeBag;$('winRestart').onclick=reset;
$('winContinue').onclick=()=>{$('winOverlay').classList.add('hidden');state.paused=false};
// Mobile controls v1.4: live layouts, analog joystick and independent multitouch actions.
const CONTROL_STORAGE='emilys-adventures-controls-v1';
const CONTROL_MODES=['auto','center','split','floating'];
let controlPrefs={mode:'auto',dock:null};
try{
 const previous=JSON.parse(localStorage.getItem(CONTROL_STORAGE)||'{}');
 if(CONTROL_MODES.includes(previous?.mode))controlPrefs.mode=previous.mode;
 if(previous?.dock&&Number.isFinite(previous.dock.x)&&Number.isFinite(previous.dock.y)){
  controlPrefs.dock={x:clampValue(previous.dock.x,0,1),y:clampValue(previous.dock.y,0,1)};
 }
}catch(_){}
function saveControlPrefs(){try{localStorage.setItem(CONTROL_STORAGE,JSON.stringify(controlPrefs))}catch(_){}}
const pressed=new Set();const arrowKeys=new Set(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space']);
const joystick={active:false,pointerId:null,x:0,y:0,maxRadius:42};
let editControlsMode=false;
const joystickEl=$('mobileJoystick'),joystickKnob=$('joyKnob'),floatZone=$('floatingTouchZone'),actionDock=$('mobileActions');
function effectiveLayout(){return controlPrefs.mode==='auto'?(innerHeight>=innerWidth?'center':'split'):controlPrefs.mode}
function setJoystick(x,y){
 joystick.x=x;joystick.y=y;
 const tx=Math.round(x*joystick.maxRadius),ty=Math.round(y*joystick.maxRadius);
 joystickKnob.style.transform=`translate(${tx}px, ${ty}px)`;
 joystickEl.classList.toggle('active',joystick.active);
}
function endJoystick(e){
 if(e&&e.pointerId!==undefined&&e.pointerId!==joystick.pointerId)return;
 joystick.active=false;joystick.pointerId=null;setJoystick(0,0);
}
function dockAt(x,y){
 const w=actionDock.offsetWidth,h=actionDock.offsetHeight;
 const left=clampValue(x,6,Math.max(6,innerWidth-w-6));
 const top=clampValue(y,6,Math.max(6,innerHeight-h-6));
 actionDock.classList.add('custom-dock');
 actionDock.style.setProperty('--dock-left',`${left}px`);
 actionDock.style.setProperty('--dock-top',`${top}px`);
 return {x:left/Math.max(1,innerWidth),y:top/Math.max(1,innerHeight)};
}
function applyDock(){
 if(document.body.dataset.controlLayout==='floating'&&controlPrefs.dock){
  dockAt(controlPrefs.dock.x*innerWidth,controlPrefs.dock.y*innerHeight);
 }else{
  actionDock.classList.remove('custom-dock');
  actionDock.style.removeProperty('--dock-left');actionDock.style.removeProperty('--dock-top');
 }
}
function applyControlLayout(){
 const layout=effectiveLayout();
 if(document.body.dataset.controlLayout!==layout){
  endJoystick();
  joystickEl.style.removeProperty('left');joystickEl.style.removeProperty('top');
 }
 document.body.dataset.controlLayout=layout;
 $('controlLayout').value=controlPrefs.mode;
 $('editControlsRow').hidden=layout!=='floating';
 if(editControlsMode&&layout!=='floating')finishControlsEdit();
 applyDock();
}
$('controlLayout').addEventListener('change',e=>{
 controlPrefs.mode=CONTROL_MODES.includes(e.target.value)?e.target.value:'auto';
 saveControlPrefs();applyControlLayout();
});
// Rotating a phone changes auto mode immediately. Explicit choices remain unchanged.
window.addEventListener('resize',applyControlLayout);
window.visualViewport?.addEventListener('resize',applyControlLayout);
function setJoystickFromPointer(e){
 const rect=joystickEl.getBoundingClientRect(),cx=rect.left+rect.width/2,cy=rect.top+rect.height/2;
 joystick.maxRadius=Math.max(26,(rect.width-joystickKnob.offsetWidth)/2-5);
 let dx=e.clientX-cx,dy=e.clientY-cy;
 const len=Math.hypot(dx,dy);
 if(len>joystick.maxRadius){dx=dx/len*joystick.maxRadius;dy=dy/len*joystick.maxRadius}
 setJoystick(dx/joystick.maxRadius,dy/joystick.maxRadius);
}
function beginJoystick(e,floating){
 if(editControlsMode||joystick.active||!state.started||state.paused||state.inDialogue||state.bagOpen||settingsOpen)return;
 e.preventDefault();collapsePanels();walkTo=null;
 joystick.active=true;joystick.pointerId=e.pointerId;
 const owner=floating?floatZone:joystickEl;owner.setPointerCapture(e.pointerId);
 if(floating){
  const r=joystickEl.offsetWidth/2;
  const cx=clampValue(e.clientX,r+5,innerWidth-r-5),cy=clampValue(e.clientY,r+5,innerHeight-r-5);
  joystickEl.style.left=cx+'px';joystickEl.style.top=cy+'px';
 }
 setJoystickFromPointer(e);
}
joystickEl.addEventListener('pointerdown',e=>{if(effectiveLayout()!=='floating')beginJoystick(e,false)});
floatZone.addEventListener('pointerdown',e=>{if(effectiveLayout()==='floating')beginJoystick(e,true)});
for(const [element,floating] of [[joystickEl,false],[floatZone,true]]){
 element.addEventListener('pointermove',e=>{if(!joystick.active||e.pointerId!==joystick.pointerId||floating!==(effectiveLayout()==='floating'))return;e.preventDefault();setJoystickFromPointer(e)});
 for(const evt of ['pointerup','pointercancel','lostpointercapture'])element.addEventListener(evt,endJoystick);
}
function finishControlsEdit(){
 editControlsMode=false;document.body.classList.remove('editing-controls');$('editControlsBanner').hidden=true;
 saveControlPrefs();
}
function beginControlsEdit(){
 if(effectiveLayout()!=='floating')return;
 closeSettings();endJoystick();
 editControlsMode=true;document.body.classList.add('editing-controls');$('editControlsBanner').hidden=false;
}
$('editControlsBtn').addEventListener('click',beginControlsEdit);
$('finishControlsEdit').addEventListener('click',finishControlsEdit);
$('resetControlsBtn').addEventListener('click',()=>{controlPrefs.dock=null;saveControlPrefs();applyDock()});
let dockDrag=null;
actionDock.addEventListener('pointerdown',e=>{
 if(!editControlsMode)return;
 e.preventDefault();
 const rect=actionDock.getBoundingClientRect();
 dockDrag={id:e.pointerId,dx:e.clientX-rect.left,dy:e.clientY-rect.top};
 actionDock.setPointerCapture(e.pointerId);
});
actionDock.addEventListener('pointermove',e=>{
 if(!editControlsMode||!dockDrag||e.pointerId!==dockDrag.id)return;
 e.preventDefault();
 controlPrefs.dock=dockAt(e.clientX-dockDrag.dx,e.clientY-dockDrag.dy);
});
for(const evt of ['pointerup','pointercancel','lostpointercapture'])actionDock.addEventListener(evt,e=>{
 if(dockDrag?.id!==e.pointerId)return;
 dockDrag=null;saveControlPrefs();
});
window.addEventListener('keydown',e=>{
 if(editControlsMode){if(e.code==='Escape'){e.preventDefault();finishControlsEdit()}return}
 if(settingsOpen){if(e.code==='Escape'){e.preventDefault();closeSettings()}return}
 if(arrowKeys.has(e.code))e.preventDefault();pressed.add(e.code);
 if(e.repeat)return;
 if(e.code==='Escape'){if(state.bagOpen)closeBag();else if(state.inDialogue)$('nextDialogue').click();else setPause();}
 else if(e.code==='KeyE')interact();else if(e.code==='Space')attack();else if(e.code==='KeyQ')heal();
 else if(e.code==='KeyI'){if(state.bagOpen)closeBag();else bag()}
});
window.addEventListener('keyup',e=>pressed.delete(e.code));
window.addEventListener('blur',()=>{pressed.clear();endJoystick();last=performance.now()});
document.addEventListener('visibilitychange',()=>{if(document.hidden)endJoystick();else last=performance.now()});
applyControlLayout();
// Tapping the landscape establishes a walk destination (useful on phones).
const raycaster=new THREE.Raycaster(),ndc=new THREE.Vector2(),plane=new THREE.Plane(new THREE.Vector3(0,1,0),0);let walkTo=null;
canvas.addEventListener('pointerdown',e=>{if(!state.started||state.paused||state.inDialogue||state.bagOpen||settingsOpen)return;collapsePanels();const r=canvas.getBoundingClientRect();ndc.x=((e.clientX-r.left)/r.width)*2-1;ndc.y=-((e.clientY-r.top)/r.height)*2+1;raycaster.setFromCamera(ndc,camera);const point=new THREE.Vector3();if(raycaster.ray.intersectPlane(plane,point)){walkTo={x:THREE.MathUtils.clamp(point.x,-SCENE_RADIUS,SCENE_RADIUS),z:THREE.MathUtils.clamp(point.z,-SCENE_RADIUS,SCENE_RADIUS)}}});
let last=performance.now(),time=0,miniClock=0,saveClock=0,fpsClock=performance.now(),fpsFrames=0;const tmpCam=new THREE.Vector3();
function canStand(x,z){if(Math.abs(x)>SCENE_RADIUS||Math.abs(z)>SCENE_RADIUS)return false;return solids.every(o=>Math.hypot(o.x-x,o.z-z)>o.r+.26)}
function move(dx,dz){const nx=state.x+dx,nz=state.z+dz;if(canStand(nx,nz)){state.x=nx;state.z=nz;return}if(canStand(nx,state.z))state.x=nx;else if(canStand(state.x,nz))state.z=nz}
function update(dt){if(!state.started||state.paused||state.inDialogue||state.bagOpen||settingsOpen)return;
 state.attackCD=Math.max(0,state.attackCD-dt);state.hitCD=Math.max(0,state.hitCD-dt);
 let sx=(pressed.has('KeyD')||pressed.has('ArrowRight')?1:0)-(pressed.has('KeyA')||pressed.has('ArrowLeft')?1:0),sy=(pressed.has('KeyS')||pressed.has('ArrowDown')?1:0)-(pressed.has('KeyW')||pressed.has('ArrowUp')?1:0);
 if(!sx&&!sy&&Math.hypot(joystick.x,joystick.y)>.16){sx=joystick.x;sy=joystick.y}
 if(sx||sy)walkTo=null;
 if(!sx&&!sy&&walkTo){const dx=walkTo.x-state.x,dz=walkTo.z-state.z,dist=Math.hypot(dx,dz);if(dist<.27)walkTo=null;else{sx=(dx-dz)/Math.SQRT2;sy=(dx+dz)/Math.SQRT2}}
 let moving=false;
 if(sx||sy){const len=Math.hypot(sx,sy),analog=joystick.active&&!pressed.size&&!walkTo;const speed=analog?clampValue((len-.16)/.84,.20,1):1;sx/=len;sy/=len;const wx=(sx+sy)/Math.SQRT2,wz=(sy-sx)/Math.SQRT2;const oldX=state.x,oldZ=state.z;move(wx*3.75*speed*dt,wz*3.75*speed*dt);moving=Math.hypot(state.x-oldX,state.z-oldZ)>.0005;
  if(Math.abs(sx)>.25||Math.abs(sy)>.25)facing=Math.abs(sx)>Math.abs(sy)?(sx>0?'right':'left'):(sy>0?'down':'up');
 }
 if(moving){walkClock+=dt;frame=Math.floor(walkClock*7.6)%4}else{walkClock=0;frame=0}setHeroFrame(facing,frame);
 for(let i=0;i<collectibles.length;i++){const c=collectibles[i];if(!state.collected[i]){c.c.rotation.y+=dt*.9;c.c.position.y=1.03+Math.sin(time*2.5+i)*.12;c.ring.rotation.z+=dt*.25;if(state.stage>=1&&Math.hypot(state.x-c.x,state.z-c.z)<.9)collect(i)}}
 for(let e of enemies){if(!e.alive)continue;const d=Math.hypot(e.x-state.x,e.z-state.z);e.attackTimer=Math.max(0,e.attackTimer-dt);e.group.position.y=Math.sin(time*2.2+e.phase)*.095;e.group.rotation.y+=dt*.5;
 if(d<4.5&&d>1.1){const vx=(state.x-e.x)/d,vz=(state.z-e.z)/d;e.x+=vx*dt*.97;e.z+=vz*dt*.97;e.group.position.x=e.x;e.group.position.z=e.z;e.shadow.position.x=e.x;e.shadow.position.z=e.z}
 if(d<1.26&&e.attackTimer===0&&state.hitCD===0){state.hp=Math.max(0,state.hp-9);state.hitCD=.75;e.attackTimer=1.25;pulse(state.x,state.z,0xff8298);refreshHUD();if(state.hp<=0){state.hp=100;state.x=playerStart.x;state.z=playerStart.z;state.coins=Math.max(0,state.coins-5);walkTo=null;toast('💗 Міра повернула Емілі до села. Тримайся!');refreshHUD()}else toast('💔 Дух атакував! -9 здоров’я');persist()}
 }
 const nearest=nearObject();$('nearPrompt').classList.toggle('show',!!nearest);if(nearest)$('nearText').textContent=nearest.label;
 saveClock+=dt;if(saveClock>8){saveClock=0;persist()}
}
function updateMinimap(){const c=$('minimap'),g=c.getContext('2d'),w=c.width,h=c.height,gap=5,range=23;
 g.clearRect(0,0,w,h);g.fillStyle='#5c997f';g.fillRect(0,0,w,h);
 const xy=(x,z)=>[(x+range)/(range*2)*w,(z+range)/(range*2)*h];
 for(let i=0;i<solids.length;i++){let [x,y]=xy(solids[i].x,solids[i].z);g.fillStyle='#336c63';g.beginPath();g.arc(x,y,2.3,0,Math.PI*2);g.fill()}
 // Key locations
 let [vx,vy]=xy(sageAt.x,sageAt.z);g.fillStyle='#fff5be';g.beginPath();g.arc(vx,vy,4.6,0,Math.PI*2);g.fill();
 for(let i=0;i<3;i++){if(state.collected[i])continue;let [x,y]=xy(crystalsAt[i].x,crystalsAt[i].z);g.fillStyle=['#ffdc8d','#c5daff','#ffbedf'][i];g.beginPath();g.arc(x,y,4.7,0,Math.PI*2);g.fill()}
 let [ax,ay]=xy(shrineAt.x,shrineAt.z);g.strokeStyle='#e8fff6';g.lineWidth=3;g.strokeRect(ax-3.5,ay-3.5,7,7);
 let [px,py]=xy(state.x,state.z);g.fillStyle='#ffffff';g.beginPath();g.arc(px,py,6.1,0,Math.PI*2);g.fill();g.fillStyle='#e7a5a0';g.beginPath();g.arc(px,py,3.2,0,Math.PI*2);g.fill();
 g.strokeStyle='#eaf7dd5e';g.strokeRect(1,1,w-2,h-2)
}
function tick(now){
 requestAnimationFrame(tick);
 const elapsed=now-last, interval=graphics.fps?1000/graphics.fps:0;
 if(interval&&elapsed<interval-1)return;
 const dt=Math.min(elapsed/1000,.05);last=now;time+=dt;
 fpsFrames++;
 if(now-fpsClock>=700){$('fpsCounter').textContent=Math.round(fpsFrames*1000/(now-fpsClock))+' FPS';fpsClock=now;fpsFrames=0}

 update(dt);hero.position.set(state.x,1.02+Math.sin(time*2)*(state.started?.025:.035),state.z);heroShadow.position.set(state.x,-.007,state.z);
 sage.rotation.y=Math.sin(time*.6)*.09;altarCrystal.rotation.y+=dt*.38;altarCrystal.position.y=1.42+Math.sin(time*1.8)*.14;
 for(let i=effects.length-1;i>=0;i--){const e=effects[i];e.age+=dt;const k=e.age/e.life;e.mesh.scale.setScalar(1+k*3.4);e.mesh.material.opacity=Math.max(0,(1-k)*.8);if(k>=1){scene.remove(e.mesh);e.mesh.geometry.dispose();e.mesh.material.dispose();effects.splice(i,1)}}
 cameraFollow.lerp(tmpCam.set(state.x,0,state.z),1-Math.exp(-dt*4));camera.position.set(cameraFollow.x+13.7,19,cameraFollow.z+13.7);camera.lookAt(cameraFollow.x,.0,cameraFollow.z);
 renderer.render(scene,camera);miniClock+=dt;if(miniClock>.11){miniClock=0;updateMinimap()}
}
requestAnimationFrame(tick);updateMinimap();
} catch (error) {
  console.error('[Emily’s Adventures] Помилка запуску:', error);
  const fatal = document.getElementById('fatal');
  if (fatal) {
    fatal.style.display = 'block';
    fatal.textContent = 'Не вдалося запустити гру. Перевір з’єднання з інтернетом (Three.js завантажується з CDN) та файли у папках src і assets. Деталі є в консолі браузера.';
  }
}
})();
