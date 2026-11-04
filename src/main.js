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
    showFps:previous.showFps===true,
    autoAttack:previous.autoAttack===true
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
// Regeneration is a gameplay timer, not saved: loading a save never grants offline healing.
const REGEN_DELAY=5,REGEN_INTERVAL=.75,REGEN_DANGER_RADIUS=4.5;
let secondsSinceHit=0,regenAccumulator=0,regenVisible=false;
function persist(){try{localStorage.setItem(STORAGE,JSON.stringify({stage:state.stage,hp:state.hp,coins:state.coins,potions:state.potions,collected:state.collected,kills:state.kills,x:Math.round(state.x*100)/100,z:Math.round(state.z*100)/100}))}catch(_){}}
let notificationTimer=0;
function toast(message){const t=$('toast');t.textContent=message;t.classList.add('show');clearTimeout(notificationTimer);notificationTimer=setTimeout(()=>t.classList.remove('show'),2800)}
const countGems=()=>state.collected.filter(Boolean).length;
function refreshHUD(){ $('hpValue').textContent=`${Math.ceil(state.hp)} / 100`;$('hpBar').style.width=`${state.hp}%`;$('coinValue').textContent=state.coins;$('gemValue').textContent=`${countGems()} / 3`;$('potionValue').textContent=state.potions;
 const stages=[['Поговори з Мірою','Біля маленького села на тебе чекає мудра хранителька лісу.','ЗНАЙТИ ХРАНИТЕЛЬКУ'],['Знайди зоряні кристали','Відшукай три кристали у віддалених куточках лісу. Бережися тіньових духів!','КРИСТАЛИ · '+countGems()+'/3'],['Поверни світло','Усі три кристали знайдено! Віднеси їх до зоряного вівтаря на півдні.','ДО ЗОРЯНОГО ВІВТАРЯ'],['Зоряний ліс врятовано!','Ти повернула магію лісу. Можна ще досліджувати цей дивовижний світ.','РОЗДІЛ ЗАВЕРШЕНО']];
 const q=stages[state.stage];$('questTitle').textContent=q[0];$('questDesc').textContent=q[1];$('questProgress').textContent=q[2];[...$('questDots').children].forEach((el,i)=>el.classList.toggle('on',state.collected[i]));
 $('inventoryContents').textContent=`💎 ${countGems()}/3 кристалів · 🪙 ${state.coins} монет · ⚔️ ${state.kills} перемог`;
}
refreshHUD();

// Inventory is derived from the existing save schema, so old saves and quest items remain compatible.
// Future loot can occupy any of the unused slots without changing the UI.
const INVENTORY_SIZE=20;
const itemDescriptions={
 potion:{name:'Зілля здоров’я',category:'ВИТРАТНИЙ ПРЕДМЕТ',icon:'🧪',description:'Миттєво відновлює 40 HP. Корисне в бою, коли повільне природне відновлення недоступне.'},
 coin:{name:'Золоті монети',category:'ВАЛЮТА',icon:'🪙',description:'Нагорода за перемогу над тіньовими духами. Поки що їх можна збирати для майбутніх пригод.'},
 gem0:{name:'Кристал світанку',category:'КВЕСТОВИЙ ПРЕДМЕТ',icon:'🌅',description:'Зоряний кристал ранкового світла. Потрібен для відновлення зоряного вівтаря.'},
 gem1:{name:'Кристал сутінків',category:'КВЕСТОВИЙ ПРЕДМЕТ',icon:'🌌',description:'Кристал вечірнього неба. Збережи його для завершення головного завдання.'},
 gem2:{name:'Кристал надії',category:'КВЕСТОВИЙ ПРЕДМЕТ',icon:'💠',description:'Магічний кристал надії. Разом з іншими повертає світло лісу.'}
};
let selectedInventorySlot=0;
function inventorySlots(){
 const slots=Array(INVENTORY_SIZE).fill(null);
 if(state.potions>0)slots[0]={id:'potion',amount:state.potions};
 state.collected.forEach((found,i)=>{if(found)slots[1+i]={id:'gem'+i,amount:1}});
 if(state.coins>0)slots[4]={id:'coin',amount:state.coins};
 return slots;
}
function inventorySelection(){return inventorySlots()[selectedInventorySlot]||null}
function updateInventoryDetails(){
 const item=inventorySelection(),data=item&&itemDescriptions[item.id];
 $('inventoryItemArt').textContent=data?.icon||'✧';
 $('inventoryItemType').textContent=data?.category||'ПОРОЖНЯ КОМІРКА';
 $('inventoryItemName').textContent=data?.name||'Вільне місце';
 $('inventoryItemDescription').textContent=data?.description||'Тут згодом з’явиться новий предмет із пригод Емілі.';
 const use=$('inventoryUseBtn');
 use.hidden=item?.id!=='potion';
 use.disabled=!item||item.id!=='potion'||state.hp>=100;
 use.textContent=state.hp>=100?'Здоров’я повне':'Випити зілля · +40 HP';
 for(const button of $('inventoryGrid').children){
  const on=Number(button.dataset.slot)===selectedInventorySlot;
  button.classList.toggle('selected',on);button.setAttribute('aria-pressed',String(on));
 }
}
function renderInventory(){
 const slots=inventorySlots();
 const grid=$('inventoryGrid');
 const fragment=document.createDocumentFragment();
 for(let i=0;i<INVENTORY_SIZE;i++){
  const item=slots[i],data=item&&itemDescriptions[item.id];
  const button=document.createElement('button');
  button.type='button';button.className='inventorySlot';button.dataset.slot=String(i);
  button.setAttribute('aria-label',data?`${data.name}, ${item.amount} шт., слот ${i+1}`:`Порожня комірка ${i+1}`);
  button.setAttribute('aria-pressed',String(i===selectedInventorySlot));
  if(!item)button.classList.add('empty');
  else{
   const art=document.createElement('span');art.className='inventorySlotIcon';art.textContent=data.icon;button.appendChild(art);
   if(item.amount>1){const amount=document.createElement('span');amount.className='inventoryAmount';amount.textContent=String(item.amount);button.appendChild(amount)}
   const label=document.createElement('span');label.className='inventorySlotLabel';label.textContent=data.name;button.appendChild(label);
  }
  button.addEventListener('click',()=>{selectedInventorySlot=i;updateInventoryDetails()});
  fragment.appendChild(button);
 }
 grid.replaceChildren(fragment);
 updateInventoryDetails();
}

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
// v1.8 · Pixel-world. All world textures are original 32px tiles in assets/world/.
// Keep Three.js geometry and gameplay collision, but replace smooth primitives with
// crisp, stepped voxels. The forest is INSTANCED to avoid hundreds of draw calls.
const mat=(color,other={})=>new THREE.MeshStandardMaterial({color,roughness:1,metalness:0,flatShading:true,...other});
const loader=new THREE.TextureLoader();
function pixelTex(filename,rx=1,ry=1){
 const tex=loader.load('assets/world/'+filename);
 tex.colorSpace=THREE.SRGBColorSpace;tex.magFilter=THREE.NearestFilter;tex.minFilter=THREE.NearestMipmapNearestFilter;
 tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.repeat.set(rx,ry);tex.anisotropy=1;
 return tex;
}
const grass=mat(0xffffff,{map:pixelTex('grass.png',26,26)}),
 darkGrass=mat(0x5f9472),lightGrass=mat(0x8bbf92),
 pathMat=mat(0xffffff,{map:pixelTex('path.png',2,9)}),
 trunkMat=mat(0xffffff,{map:pixelTex('wood.png')}),
 leafTex=pixelTex('leaves.png'),
 leafA=mat(0xa9e3d5,{map:leafTex}),leafB=mat(0xe3f4d9,{map:leafTex}),leafC=mat(0xd5eec0,{map:leafTex}),
 leafHighlight=mat(0xa4d39d),leafShade=mat(0x467965),
 rockMat=mat(0x9caeaa),stoneLight=mat(0xc3c9b0),
 flowerYellow=mat(0xffd891,{emissive:0x5f3918,emissiveIntensity:.1}),flowerPink=mat(0xf8a5be),
 blue=mat(0xa2f7f4,{emissive:0x358b93,emissiveIntensity:.45});
const wallMat=mat(0xffffff,{map:pixelTex('wall.png')}),roofMat=mat(0xffffff,{map:pixelTex('roof.png')}),doorMat=mat(0xffffff,{map:pixelTex('wood.png')});
const add=(mesh,x,y,z,cast=false)=>{mesh.position.set(x,y,z);mesh.castShadow=cast;mesh.receiveShadow=true;scene.add(mesh);return mesh};
const voxelGeometry=new THREE.BoxGeometry(1,1,1);
function cube(x,y,z,w,h,d,material,cast=false){return add(new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material),x,y,z,cast)}
function groupCube(group,x,y,z,w,h,d,material){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;group.add(m);return m}
const ground=add(new THREE.Mesh(new THREE.PlaneGeometry(52,52),grass),0,-.08,0);ground.rotation.x=-Math.PI/2;
let seed=3391;const rand=()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296),between=(a,b)=>a+(b-a)*rand();
function disk(x,z,r,color,y=.001,segments=20){const o=new THREE.Mesh(new THREE.CircleGeometry(r,segments),color);o.rotation.x=-Math.PI/2;o.position.set(x,y,z);scene.add(o);return o}
// Square palette patches, batched for minimal GPU overhead. Random calls match v1.7
// to preserve the placement of trees around existing saved character positions.
const groundDetails=[],patchBatches=[[],[]];
for(let i=0;i<94;i++){
 const x=between(-23,23),z=between(-23,23),size=between(.35,1.85),t=rand()>.5?1:0;
 patchBatches[t].push({x,z,size});
}
for(let i=0;i<2;i++){
 const spots=patchBatches[i],geometry=new THREE.PlaneGeometry(1,1);
 const mesh=new THREE.InstancedMesh(geometry,i?lightGrass:darkGrass,spots.length),dummy=new THREE.Object3D();
 spots.forEach((p,k)=>{dummy.position.set(p.x,-.075,p.z);dummy.rotation.set(-Math.PI/2,0,0);dummy.scale.set(p.size*1.55,p.size*.9,1);dummy.updateMatrix();mesh.setMatrixAt(k,dummy.matrix)});
 mesh.instanceMatrix.needsUpdate=true;scene.add(mesh);groundDetails.push(mesh);
}
function path(a,b,width=.92){
 const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);
 const m=new THREE.Mesh(new THREE.PlaneGeometry(width,len),mat(0xffffff,{map:pixelTex('path.png',width/.85,len/1.15)}));
 m.rotation.set(-Math.PI/2,0,Math.atan2(dx,dz));m.position.set((a.x+b.x)/2,-.053,(a.z+b.z)/2);scene.add(m);
 // Consume the legacy stepping-stone random draws to preserve tree positions.
 for(let i=0;i<Math.ceil(len/1.15);i++){between(-.12,.12);between(-.12,.12);between(.07,.16)}
}
path({x:-7,z:-4},{x:1,z:-1},1.35);path({x:1,z:-1},{x:2,z:-12.5},1.1);
path({x:1,z:-1},{x:12,z:-7},.9);path({x:1,z:-1},{x:-13,z:9},.7);
// The pond has a transparent, jagged 8-bit silhouette and pixel highlights.
const pond=add(new THREE.Mesh(new THREE.PlaneGeometry(7.3,7.3),new THREE.MeshBasicMaterial({map:pixelTex('pond.png'),transparent:true,depthWrite:false,side:THREE.DoubleSide})), -11,-.036,-9);
pond.rotation.x=-Math.PI/2;pond.scale.set(1.23,.7,1);
for(let i=0;i<10;i++){
 const angle=rand()*Math.PI*2,r=rand()*2.4,rad=between(.1,.21);
 cube(-11+Math.cos(angle)*r,-.022,-9+Math.sin(angle)*r,rad*1.8,.016,rad*1.8,leafShade);
}
const solids=[];function solid(x,z,r){solids.push({x,z,r})}
// Forest is batched by material. A leaf block costs only an instance, not a draw call.
const forestBatches=new Map();
function forestVoxel(material,x,y,z,w,h,d){
 if(!forestBatches.has(material))forestBatches.set(material,[]);
 forestBatches.get(material).push({x,y,z,w,h,d});
}
function tree(x,z,scale=1,colorIndex=0){
 const crown=[leafA,leafB,leafC][colorIndex%3];
 forestVoxel(trunkMat,x,.63*scale,z,.36*scale,1.26*scale,.36*scale);
 const conifer=rand()<.52;
 if(conifer){rand(); // Same random consumption as the old cone rotation.
  forestVoxel(crown,x,1.40*scale,z,1.52*scale,.72*scale,1.52*scale);
  forestVoxel(crown,x,1.95*scale,z,1.17*scale,.72*scale,1.17*scale);
  forestVoxel(crown,x,2.47*scale,z,.75*scale,.68*scale,.75*scale);
  forestVoxel(leafShade,x-.52*scale,1.26*scale,z+.58*scale,.23*scale,.21*scale,.25*scale);
 }else{
  forestVoxel(crown,x,1.55*scale,z,1.67*scale,.84*scale,1.55*scale);
  forestVoxel(crown,x+.24*scale,2.07*scale,z-.16*scale,1.23*scale,.66*scale,1.23*scale);
  forestVoxel(leafHighlight,x-.58*scale,1.94*scale,z+.34*scale,.4*scale,.36*scale,.46*scale);
  forestVoxel(leafShade,x+.55*scale,1.35*scale,z+.4*scale,.36*scale,.3*scale,.37*scale);
 }
 solid(x,z,.38*scale);
}
const clearings=[{x:0,z:-1,r:4.7},{x:-7,z:-4,r:4.0},{x:sageAt.x,z:sageAt.z,r:2.8},{x:shrineAt.x,z:shrineAt.z,r:3.25},...crystalsAt.map(c=>({...c,r:3.4})),{x:-11,z:-9,r:4.1}];
function allowedTree(x,z){return clearings.every(p=>Math.hypot(x-p.x,z-p.z)>p.r)}
for(let i=0,tries=0;i<135&&tries<1000;tries++){
 const x=between(-23,23),z=between(-23,23);
 if(!allowedTree(x,z)||Math.hypot(x,z)>29)continue;
 tree(x,z,between(.72,1.34),Math.floor(rand()*3));i++;
}
const forestMeshes=[];const forestDummy=new THREE.Object3D();
for(const [material,spots] of forestBatches){
 const mesh=new THREE.InstancedMesh(voxelGeometry,material,spots.length);
 for(let i=0;i<spots.length;i++){
  const p=spots[i];forestDummy.position.set(p.x,p.y,p.z);forestDummy.rotation.set(0,0,0);
  forestDummy.scale.set(p.w,p.h,p.d);forestDummy.updateMatrix();mesh.setMatrixAt(i,forestDummy.matrix);
 }
 mesh.instanceMatrix.needsUpdate=true;mesh.castShadow=true;mesh.receiveShadow=true;mesh.computeBoundingSphere();scene.add(mesh);forestMeshes.push(mesh);
}
// Three instanced groups for tiny pixel flowers.
const flowerSpots=[];
for(let i=0;i<185;i++){let x=between(-21,21),z=between(-21,21);if(Math.hypot(x+11,z+9)<3.6)continue;flowerSpots.push({x,z,pink:rand()>.49})}
function placeInstances(mesh,spots,y,scale){const dummy=new THREE.Object3D();spots.forEach((p,i)=>{dummy.position.set(p.x,y,p.z);dummy.rotation.set(0,0,0);dummy.scale.set(...scale);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix)});mesh.instanceMatrix.needsUpdate=true;mesh.receiveShadow=true;scene.add(mesh)}
const flowerDetails=[];
const flowerStem=new THREE.InstancedMesh(new THREE.BoxGeometry(.032,.17,.032),leafB,flowerSpots.length);
placeInstances(flowerStem,flowerSpots,.052,[1,1,1]);flowerDetails.push(flowerStem);
for(const [pink,color] of [[true,flowerPink],[false,flowerYellow]]){
 const spots=flowerSpots.filter(p=>p.pink===pink);if(!spots.length)continue;
 const heads=new THREE.InstancedMesh(new THREE.BoxGeometry(.12,.11,.12),color,spots.length);
 placeInstances(heads,spots,.14,[1,1,1]);flowerDetails.push(heads);
}
const rockInstances=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),rockMat,68),rockDummy=new THREE.Object3D();let rockCount=0;
for(let i=0;i<68;i++){
 let x=between(-22,22),z=between(-22,22);if(clearings.some(p=>Math.hypot(x-p.x,z-p.z)<p.r*.6))continue;
 const r=between(.1,.37);rockDummy.position.set(x,.065,z);rockDummy.rotation.set(0,Math.round(rand()*3)*Math.PI/2,0);
 rockDummy.scale.set(r*1.25,r*.6,r*.85);rockDummy.updateMatrix();rockInstances.setMatrixAt(rockCount++,rockDummy.matrix);
}
rockInstances.count=rockCount;rockInstances.instanceMatrix.needsUpdate=true;rockInstances.receiveShadow=true;scene.add(rockInstances);
function setDecorations(level){
 const all=level==='high',medium=level==='medium';
 flowerDetails.forEach(o=>{o.visible=all||medium});
 rockInstances.visible=all;
 groundDetails.forEach((o,i)=>{o.visible=all||(medium&&i===0)});
}
// Stepped 8-bit cottage: brick wall tiles, timber door and chunky roof shingles.
function house(x,z){
 cube(x,.17,z,3.25,.34,2.88,rockMat,true);
 cube(x,1.18,z,3.10,2.1,2.72,wallMat,true);
 cube(x-1.43,1.16,z,.25,2.14,2.88,stoneLight,true);
 cube(x+1.43,1.16,z,.25,2.14,2.88,stoneLight,true);
 cube(x,.67,z+1.4,.86,1.35,.10,doorMat);
 cube(x+.26,.74,z+1.49,.10,.10,.055,flowerYellow);
 for(const xx of [-1.03,1.03]){
  cube(x+xx,1.55,z+1.43,.61,.62,.09,doorMat);
  cube(x+xx,1.55,z+1.51,.46,.48,.085,blue);
  cube(x+xx,1.55,z+1.56,.08,.5,.04,wallMat);
  cube(x+xx,1.55,z+1.57,.49,.07,.04,wallMat);
 }
 [[3.66,3.2,2.46],[3.28,2.90,2.73],[2.63,2.39,3.02],[1.75,1.68,3.28]].forEach(([w,d,y])=>cube(x,y,z,w,.30,d,roofMat,true));
 cube(x+.94,3.58,z-.54,.48,.83,.50,wallMat,true);
 cube(x+.94,3.98,z-.54,.62,.16,.64,rockMat,true);
 solid(x,z,2.0);
}
house(-7,-4);
// Square fountain with a pixel water surface and a blocky spring.
const fountainAt={x:3,z:1};
for(const [px,pz,w,d] of [[3,-.22,2.75,.36],[3,2.22,2.75,.36],[1.78,1,.36,2.75],[4.22,1,.36,2.75]])cube(px,.23,pz,w,.46,d,rockMat,true);
cube(3,.12,1,2.2,.20,2.2,mat(0x6ab6b9));
cube(3,.26,1,2.12,.04,2.12,mat(0x9fe0da,{emissive:0x235c69,emissiveIntensity:.15}));
cube(3,.57,1,.45,.73,.45,stoneLight,true);
cube(3,1.04,1,.32,.31,.32,blue);solid(3,1,1.36);
function signLabel(text,x,y,z,w=2.85){
 const c=document.createElement('canvas');c.width=512;c.height=112;const g=c.getContext('2d');
 g.fillStyle='#153a47da';g.beginPath();g.roundRect(4,5,504,102,20);g.fill();g.strokeStyle='#c6f6d355';g.lineWidth=4;g.stroke();
 g.fillStyle='#f6fff8';g.font='bold 41px Manrope,system-ui,sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(text,256,57);
 const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;
 const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthWrite:false}));sprite.position.set(x,y,z);sprite.scale.set(w,w*112/512,1);scene.add(sprite);return sprite;
}
// Míra is also a tiny voxel creature. Keep the same scene position and dialogue.
const sage=new THREE.Group();sage.position.set(sageAt.x,0,sageAt.z);scene.add(sage);
const owlCream=mat(0xf3e3b8),owlTan=mat(0xcab17d),owlEyes=mat(0x384c5c),owlHighlight=mat(0xffffff),owlBeak=mat(0xe9a16a);
groupCube(sage,0,.75,0,.76,.97,.70,owlTan);
groupCube(sage,0,1.40,0,.89,.74,.72,owlCream);
for(const x of [-.32,.32])groupCube(sage,x,1.83,0,.24,.26,.25,owlTan);
for(const x of [-.20,.20]){
 groupCube(sage,x,1.46,.39,.22,.23,.08,owlEyes);
 groupCube(sage,x-.044,1.50,.44,.077,.075,.03,owlHighlight);
}
groupCube(sage,0,1.19,.47,.14,.16,.12,owlBeak);
for(const x of [-.39,.39])groupCube(sage,x,.76,0,.15,.42,.49,owlCream);
const sageLabel=signLabel('✦  Міра · хранителька',sageAt.x,2.5,sageAt.z,3.2);
// Pixel shrine and rotating magic prism, while retaining the quest destination.
cube(shrineAt.x,.14,shrineAt.z,3.64,.36,3.64,rockMat,true);
cube(shrineAt.x,.43,shrineAt.z,2.90,.25,2.90,stoneLight,true);
for(const x of [-1.15,1.15])for(const z of [-1.15,1.15]){
 cube(shrineAt.x+x,.86,shrineAt.z+z,.34,.96,.34,stoneLight,true);
 cube(shrineAt.x+x,1.42,shrineAt.z+z,.47,.15,.47,rockMat,true);
}
const altarCrystal=new THREE.Group();altarCrystal.position.set(shrineAt.x,1.42,shrineAt.z);scene.add(altarCrystal);
const prismMat=mat(0xb7f6f2,{emissive:0x4fa9ab,emissiveIntensity:.40}),prismLight=mat(0xd2ffff,{emissive:0x79eded,emissiveIntensity:.5});
groupCube(altarCrystal,0,0,0,.62,.65,.62,prismMat);
groupCube(altarCrystal,0,.43,0,.36,.27,.36,prismLight);
groupCube(altarCrystal,0,-.42,0,.32,.28,.32,prismMat);
altarCrystal.rotation.z=.15;
signLabel('✧  Зоряний вівтар',shrineAt.x,3.06,shrineAt.z,3.05);
// Square crystal sprites built from light-catching voxels. Gameplay objects unchanged.
const collectibles=crystalsAt.map((p,i)=>{
 const group=new THREE.Group();group.position.set(p.x,0,p.z);scene.add(group);
 const c=new THREE.Group();c.position.y=1.03;group.add(c);
 const color=mat([0xffd59a,0xa5ceff,0xffb5e1][i],{emissive:[0xee8752,0x567fc2,0xcd5db7][i],emissiveIntensity:.52});
 const accent=mat([0xffedb7,0xd7e5ff,0xffe0f1][i],{emissive:[0xffc074,0xa5cbff,0xffa9e9][i],emissiveIntensity:.4});
 groupCube(c,0,0,0,.51,.61,.51,color);
 groupCube(c,0,.41,0,.30,.25,.30,accent);
 groupCube(c,0,-.41,0,.28,.23,.28,color);
 const ring=new THREE.Mesh(new THREE.TorusGeometry(.60,.048,4,4),mat(0xd6fff9,{emissive:0x6eaea7,emissiveIntensity:.65}));
 ring.rotation.x=Math.PI/2;ring.rotation.z=Math.PI/4;ring.position.y=.13;group.add(ring);
 const light=new THREE.PointLight([0xffd79f,0x8fb8ff,0xf4a3d9][i],1.0,4);light.position.y=1;group.add(light);
 const label=signLabel('◆  '+p.name,p.x,2.17,p.z,3.1);
 group.visible=!state.collected[i];label.visible=!state.collected[i];return {group,c,ring,label,...p};
});
// Original 16-frame pixel sprite remains untouched.
const atlasTex=new THREE.TextureLoader().load(atlasURL);atlasTex.colorSpace=THREE.SRGBColorSpace;
atlasTex.minFilter=THREE.NearestFilter;atlasTex.magFilter=THREE.NearestFilter;atlasTex.generateMipmaps=false;atlasTex.repeat.set(.25,.25);
const heroMaterial=new THREE.SpriteMaterial({map:atlasTex,transparent:true,alphaTest:.035,depthWrite:false,opacity:1});
const hero=new THREE.Sprite(heroMaterial);hero.scale.set(1.64,1.91,1);hero.position.set(state.x,1.03,state.z);scene.add(hero);
const heroShadow=disk(state.x,state.z,.62,mat(0x436e64,{transparent:true,opacity:.25}),-.007,12);heroShadow.scale.set(1,.56,1);
const directionRows={down:0,left:1,right:2,up:3};let facing='down',frame=0,walkClock=0,shownFrame='';
function setHeroFrame(dir,index){const key=dir+index;if(key===shownFrame)return;shownFrame=key;atlasTex.offset.set(index*.25,(3-directionRows[dir])*.25)}
setHeroFrame('down',0);
// Block-shaped shadow spirits, same combat HP and AI as before.
const enemies=[{x:6.6,z:8},{x:-9.8,z:3},{x:14.6,z:5},{x:-10.7,z:-13}].map((p,index)=>{
 const group=new THREE.Group();group.position.set(p.x,0,p.z);scene.add(group);
 const body=new THREE.Mesh(new THREE.BoxGeometry(.78,.84,.75),mat(0x635a86,{emissive:0x282347,emissiveIntensity:.35}));body.position.y=.75;group.add(body);
 groupCube(group,0,1.28,0,.6,.36,.62,mat(0x766895));
 for(const x of [-.2,.2]){
  groupCube(group,x,.92,.41,.11,.14,.07,mat(0xffb8dd,{emissive:0xea73b0,emissiveIntensity:.7}));
  groupCube(group,x*1.55,1.51,0,.16,.28,.22,mat(0x5b567a));
 }
 const shadow=disk(p.x,p.z,.53,mat(0x364d60,{transparent:true,opacity:.34}),-.008,10);
 const halo=new THREE.Mesh(new THREE.TorusGeometry(.60,.03,4,4),mat(0xd1a7f4,{emissive:0x704bb0,emissiveIntensity:.7}));halo.rotation.x=Math.PI/2;halo.position.y=.06;group.add(halo);
 return {group,body,shadow,x:p.x,z:p.z,spawn:{...p},hp:2,alive:true,attackTimer:0,phase:index*2.1};
});

const effects=[];
function pulse(x,z,color=0xffe0a0){const mesh=new THREE.Mesh(new THREE.RingGeometry(.3,.4,32),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.85,side:THREE.DoubleSide,depthWrite:false}));mesh.rotation.x=-Math.PI/2;mesh.position.set(x,.13,z);scene.add(mesh);effects.push({mesh,life:.56,age:0});}
// A single radial spell covers the same area for manual and automatic attacks.
// Reuse geometry and dispose only per-cast materials: no growing GPU buffer usage.
const MAGIC_RADIUS=2.35;
const MAGIC_DURATION=.42;
const magicCylGeometry=new THREE.CylinderGeometry(1,1,1,48,1,true);
const magicRimGeometry=new THREE.TorusGeometry(1,.033,6,48);
const magicWaves=[];
function castMagicWave(mode){
 const group=new THREE.Group();group.position.set(state.x,0,state.z);
 const side=new THREE.Mesh(magicCylGeometry,new THREE.MeshBasicMaterial({color:0x69edd9,transparent:true,opacity:.38,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}));
 side.position.y=.87;side.scale.y=1.42;group.add(side);
 const rings=[];
 for(const y of [.16,1.58]){
  const ring=new THREE.Mesh(magicRimGeometry,new THREE.MeshBasicMaterial({color:y>.8?0xc1ffff:0x53efc7,transparent:true,opacity:.82,depthWrite:false,blending:THREE.AdditiveBlending}));
  ring.rotation.x=Math.PI/2;ring.position.y=y;group.add(ring);rings.push(ring);
 }
 group.scale.set(.16,1,.16);scene.add(group);
 magicWaves.push({group,side,rings,x:state.x,z:state.z,mode,hit:new Set(),age:0,life:MAGIC_DURATION});
}
function applyMagicHit(enemy,wave,distance){
 wave.hit.add(enemy);
 // At very close range the automatic spell is stronger; the edge keeps normal damage.
 const damage=wave.mode==='auto'&&distance<=1.25?2:1;
 enemy.hp-=damage;
 enemy.body.material.emissive.setHex(0xbb8899);
 if(enemy.hp<=0){
  enemy.alive=false;enemy.group.visible=false;enemy.shadow.visible=false;
  state.coins+=5;state.kills++;pulse(enemy.x,enemy.z,0xe7b8ff);
  toast('⚔️ Дух переможений! +5 монет');refreshHUD();persist();
 }
}
function updateMagicWaves(dt){
 for(let i=magicWaves.length-1;i>=0;i--){
  const wave=magicWaves[i];wave.age+=dt;
  const t=Math.min(1,wave.age/wave.life),smooth=1-(1-t)*(1-t);
  const radius=.16+(MAGIC_RADIUS-.16)*smooth;
  wave.group.scale.set(radius,1,radius);
  wave.side.material.opacity=.38*(1-t);
  for(const ring of wave.rings)ring.material.opacity=.82*(1-t);
  for(const enemy of enemies){
   if(!enemy.alive||wave.hit.has(enemy))continue;
   const distance=Math.hypot(enemy.x-wave.x,enemy.z-wave.z);
   if(distance<=radius&&distance<=MAGIC_RADIUS)applyMagicHit(enemy,wave,distance);
  }
  if(t>=1){
   scene.remove(wave.group);
   wave.group.children.forEach(part=>part.material.dispose());
   magicWaves.splice(i,1);
  }
 }
}
function collect(i){if(state.collected[i]||state.stage===0)return;state.collected[i]=true;collectibles[i].group.visible=false;collectibles[i].label.visible=false;pulse(crystalsAt[i].x,crystalsAt[i].z,0xeaffd2);toast('💎 Знайдено: '+crystalsAt[i].name+'!');if(countGems()===3){state.stage=2;toast('✨ Усі кристали зібрано! Прямуй до вівтаря на півдні.')}refreshHUD();persist()}
function heal(fromInventory=false){if(!state.started||state.paused||state.inDialogue||(!fromInventory&&state.bagOpen)||settingsOpen)return;if(state.potions<=0){toast('🧪 Зілля закінчилися');return}if(state.hp>=100){toast('❤️ Здоров’я вже повне');return}state.potions--;state.hp=Math.min(100,state.hp+40);pulse(state.x,state.z,0x83eec2);toast('❤️ Відновлено здоров’я');refreshHUD();persist();if(state.bagOpen)renderInventory()}
function attack(mode='manual'){
 if(!state.started||state.paused||state.inDialogue||state.bagOpen||settingsOpen||state.attackCD>0)return;
 const automatic=mode==='auto';
 // Autoattack only fires when there is a living enemy inside the magic radius.
 const targetInRange=enemies.some(e=>e.alive&&Math.hypot(e.x-state.x,e.z-state.z)<=MAGIC_RADIUS);
 if(automatic&&!targetInRange)return;
 state.attackCD=automatic?.64:.48;
 castMagicWave(automatic?'auto':'manual');
 if(!targetInRange&&!automatic)toast('✨ Магічна хвиля! Поблизу немає духів.');
}
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
function bag(){if(!state.started||state.inDialogue||state.paused||settingsOpen)return;state.bagOpen=true;refreshHUD();renderInventory();$('inventoryOverlay').classList.remove('hidden');const slot=$('inventoryGrid').children[selectedInventorySlot];if(gamepadConnected&&slot)focusGamepadElement(slot)}
function closeBag(){$('inventoryOverlay').classList.add('hidden');state.bagOpen=false;gamepadFocus?.classList.remove('gamepad-focus');gamepadFocus=null}
function setPause(force){if(!state.started||state.inDialogue||state.bagOpen||settingsOpen)return;state.paused=typeof force==='boolean'?force:!state.paused;$('pauseOverlay').classList.toggle('hidden',!state.paused);persist()}
// Graphics settings can be changed live; gameplay progress is stored separately.
let settingsOpen=false,settingsReturnFocus=null;
const controls={preset:$('qualityPreset'),scale:$('renderScale'),shadows:$('shadowQuality'),fps:$('frameLimit'),decorations:$('decorationQuality'),effects:$('reduceEffects'),meter:$('showFps'),autoAttack:$('autoAttack')};
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
 controls.autoAttack.checked=graphics.autoAttack;
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
controls.autoAttack.addEventListener('change',()=>setGraphics({autoAttack:controls.autoAttack.checked}));
function openSettings(){
 if(settingsOpen||state.inDialogue)return;
 settingsReturnFocus=document.activeElement;
 settingsOpen=true;
 $('settingsOverlay').classList.remove('hidden');syncSettings();
 $('controlLayout').focus({preventScroll:true});
}
function closeSettings(){settingsOpen=false;$('settingsOverlay').classList.add('hidden');(settingsReturnFocus?.isConnected?settingsReturnFocus:$('settingsBtn')).focus({preventScroll:true})}
const fullscreenButton=$('fullscreenBtn');
function refreshFullscreenButton(){
 const active=document.fullscreenElement===$('game')||document.webkitFullscreenElement===$('game');
 fullscreenButton.textContent=active?'⤡':'⛶';
 fullscreenButton.title=active?'Вийти з повного екрана':'На весь екран';
 fullscreenButton.setAttribute('aria-label',fullscreenButton.title);
 fullscreenButton.setAttribute('aria-pressed',String(active));
 resize();
}
async function toggleFullscreen(){
 const game=$('game');
 try{
  if(document.fullscreenElement||document.webkitFullscreenElement){
   if(document.exitFullscreen)await document.exitFullscreen();
   else if(document.webkitExitFullscreen)await document.webkitExitFullscreen();
  }else if(game.requestFullscreen){await game.requestFullscreen();}
  else if(game.webkitRequestFullscreen){await game.webkitRequestFullscreen();}
  else toast('📱 Цей браузер не дозволяє переходити у повний екран зі сторінки');
 }catch(error){console.info('[Emily] Fullscreen unavailable:',error);toast('📱 Не вдалося відкрити повний екран. Спробуй режим застосунку в Chrome.');}
 refreshFullscreenButton();
}
fullscreenButton.addEventListener('click',toggleFullscreen);
for(const evt of ['fullscreenchange','webkitfullscreenchange'])document.addEventListener(evt,refreshFullscreenButton);
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
$('interactBtn').onclick=interact;$('attackBtn').onclick=attack;$('healBtn').onclick=()=>heal();$('inventoryBtn').onclick=bag;
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
$('pauseBtn').onclick=()=>setPause();$('resumeBtn').onclick=()=>setPause(false);$('restartBtn').onclick=reset;$('closeBagBtn').onclick=closeBag;$('closeBagTopBtn').onclick=closeBag;$('inventoryUseBtn').onclick=()=>heal(true);$('winRestart').onclick=reset;
$('winContinue').onclick=()=>{$('winOverlay').classList.add('hidden');state.paused=false};
// Mobile controls v1.4: live layouts, analog joystick and independent multitouch actions.
const CONTROL_STORAGE='emilys-adventures-controls-v1';
const GAME_VERSION='1.8.0';
document.documentElement.dataset.gameVersion=GAME_VERSION;
const CONTROL_MODES=['auto','center','split','floating'];
let gamepadConnected=false;
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
function effectiveLayout(){return gamepadConnected?'gamepad':(controlPrefs.mode==='auto'?(innerHeight>=innerWidth?'center':'split'):controlPrefs.mode)}
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
 const layoutTitles={center:'🎯 Центр + дуга',split:'👐 Два великі пальці',floating:'🕹️ Вільний джойстик',gamepad:'🎮 Автоматичний геймпад'};
 $('controlLayoutHint').textContent=`Зараз: ${layoutTitles[layout]}. ${gamepadConnected?'Сенсорний джойстик сховано, ромб приглушено.':controlPrefs.mode==='auto'?'Автоматичний вибір за орієнтацією екрана.':'Ручний вибір збережено.'}`;
 $('editControlsRow').hidden=layout!=='floating';
 if(editControlsMode&&layout!=='floating')finishControlsEdit();
 applyDock();
}
function onControlLayoutChange(e){
 const mode=CONTROL_MODES.includes(e.target.value)?e.target.value:'auto';
 if(controlPrefs.mode===mode){applyControlLayout();return}
 controlPrefs.mode=mode;
 saveControlPrefs();applyControlLayout();
}
$('controlLayout').addEventListener('change',onControlLayoutChange);
$('controlLayout').addEventListener('input',onControlLayoutChange);
// Rotating a phone changes auto mode immediately. Explicit choices remain unchanged.
window.addEventListener('resize',applyControlLayout);
window.visualViewport?.addEventListener('resize',applyControlLayout);
// Unified gamepad navigation: gameplay, all overlays, settings fields and HUD.
const gamepadButtons=new Map();
let gamepadMenuMode=false,gamepadFocus=null,gamepadDirection='',gamepadNextRepeat=0,gamepadLastPanel=null;
let gamepadDeviceId='';
const focusableSelector='button:not([disabled]), select:not([disabled]), input:not([disabled]):not([type="hidden"])';
function visibleElement(element){
 if(!element||!element.isConnected||element.closest('[hidden],.hidden'))return false;
 return element.getClientRects().length>0&&getComputedStyle(element).visibility!=='hidden';
}
function activeGamepadPanel(){
 if(settingsOpen)return $('settingsOverlay');
 if(state.inDialogue)return $('dialogue');
 if(visibleElement($('winOverlay')))return $('winOverlay');
 if(state.bagOpen)return $('inventoryOverlay');
 if(state.paused)return $('pauseOverlay');
 if(!state.started)return $('startOverlay');
 if(editControlsMode)return $('editControlsBanner');
 if(gamepadMenuMode)return $('game');
 return null;
}
function focusableGamepadItems(panel){
 const list=panel?.id==='game'?document.querySelectorAll('.topbarActions button,#bottomHUD button,.mobileTool')
                              :panel?.querySelectorAll(focusableSelector);
 return [...(list||[])].filter(visibleElement);
}
function focusGamepadElement(element){
 if(gamepadFocus&&gamepadFocus!==element)gamepadFocus.classList.remove('gamepad-focus');
 gamepadFocus=element||null;
 if(!element)return;
 element.classList.add('gamepad-focus');
 element.focus({preventScroll:true});
 element.scrollIntoView?.({block:'nearest',inline:'nearest',behavior:'auto'});
}
function refreshGamepadFocus(){
 const panel=activeGamepadPanel();
 if(!panel){focusGamepadElement(null);return []}
 const items=focusableGamepadItems(panel);
 if(items.length&&!items.includes(gamepadFocus)){
  const preferred=panel.id==='settingsOverlay'?$('controlLayout'):
    panel.id==='pauseOverlay'?$('resumeBtn'):
    panel.id==='inventoryOverlay'?$('inventoryGrid').children[selectedInventorySlot]:
    panel.id==='game'?$('settingsBtn'):items[0];
  focusGamepadElement(items.includes(preferred)?preferred:items[0]);
 }
 return items;
}
function changeGamepadValue(el,direction){
 if(el instanceof HTMLSelectElement){
  const enabled=[...el.options].filter(x=>!x.disabled);
  const current=enabled.findIndex(o=>o.value===el.value);
  const next=enabled[Math.max(0,Math.min(enabled.length-1,current+direction))];
  if(next&&el.value!==next.value){el.value=next.value;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}
  return true;
 }
 if(el instanceof HTMLInputElement&&el.type==='range'){
  if(direction>0)el.stepUp();else el.stepDown();
  el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));
  return true;
 }
 return false;
}
function navigateGamepadUI(direction){
 const items=refreshGamepadFocus();if(!items.length)return;
 if(state.bagOpen&&gamepadFocus?.classList.contains('inventorySlot')){
  const slot=Number(gamepadFocus.dataset.slot);
  const cols=getComputedStyle($('inventoryGrid')).gridTemplateColumns.split(' ').length||5;
  const col=slot%cols;
  let next=slot;
  if(direction==='left'&&col>0)next--;
  else if(direction==='right'&&col<cols-1&&next<INVENTORY_SIZE-1)next++;
  else if(direction==='up'&&slot>=cols)next-=cols;
  else if(direction==='down'&&slot+cols<INVENTORY_SIZE)next+=cols;
  else if(direction==='down'&&slot+cols>=INVENTORY_SIZE&&visibleElement($('inventoryUseBtn'))&&!$('inventoryUseBtn').disabled){focusGamepadElement($('inventoryUseBtn'));return}
  if(next!==slot){selectedInventorySlot=next;updateInventoryDetails();focusGamepadElement($('inventoryGrid').children[next])}
  return;
 }
 if(state.bagOpen&&gamepadFocus===$('inventoryUseBtn')&&direction==='up'){
  focusGamepadElement($('inventoryGrid').children[selectedInventorySlot]);return;
 }
 if((direction==='left'||direction==='right')&&changeGamepadValue(gamepadFocus,direction==='right'?1:-1))return;
 const index=items.indexOf(gamepadFocus),step=(direction==='up'||direction==='left')?-1:1;
 focusGamepadElement(items[Math.max(0,Math.min(items.length-1,index+step))]);
}
function activateGamepadUI(){
 const items=refreshGamepadFocus();if(!items.length)return;
 const el=gamepadFocus;
 if(el instanceof HTMLSelectElement||el instanceof HTMLInputElement&&el.type==='range'){
  changeGamepadValue(el,1);
 }else{el.click();refreshGamepadFocus();}
}
function closeGamepadUI(){
 if(editControlsMode){finishControlsEdit();return}
 if(settingsOpen){closeSettings();return}
 if(state.inDialogue){$('nextDialogue').click();return}
 if(state.bagOpen){closeBag();return}
 if(state.paused){setPause(false);return}
 if(visibleElement($('winOverlay'))){$('winContinue').click();return}
 if(gamepadMenuMode){gamepadMenuMode=false;focusGamepadElement(null);return}
}
function gamepadPressed(gp,index){return !!gp.buttons?.[index]?.pressed}
function readGamepad(){
 const pads=Array.from(navigator.getGamepads?.()||[]).filter(Boolean);
 const gp=pads.find(p=>p.connected&&p.mapping==='standard')||pads.find(p=>p.connected)||null;
 const connected=!!gp;
 if(connected!==gamepadConnected){
  gamepadConnected=connected;
  if(!connected){gamepadDeviceId='';gamepadButtons.clear();gamepadMenuMode=false;focusGamepadElement(null);}
  document.body.classList.toggle('gamepad-active',connected);
  applyControlLayout();
  if(connected)toast('🎮 Геймпад підключено: Select відкриває меню');
 }
 if(!gp)return {active:false,x:0,y:0,analog:false};
 const deviceId=`${gp.index}:${gp.id}`;
 if(deviceId!==gamepadDeviceId){gamepadDeviceId=deviceId;gamepadButtons.clear();gamepadDirection='';gamepadNextRepeat=0}
 const just=index=>gamepadPressed(gp,index)&&!gamepadButtons.get(index);
 const mark=()=>{for(const i of [0,1,2,3,8,9,12,13,14,15])gamepadButtons.set(i,gamepadPressed(gp,i))};
 const panel=activeGamepadPanel();
 const inUI=!!panel;
 if(just(8)&&state.started&&!state.paused&&!settingsOpen&&!state.inDialogue&&!state.bagOpen){
  gamepadMenuMode=!gamepadMenuMode;
  if(!gamepadMenuMode)focusGamepadElement(null);
  else refreshGamepadFocus();
 }
 if(just(9)){
  if(settingsOpen)closeSettings();
  else if(state.paused)setPause(false);
  else if(state.started&&!state.inDialogue&&!state.bagOpen)setPause(true);
  else if(!state.started)$('startBtn').click();
 }
 const currentPanel=activeGamepadPanel();
 if(currentPanel!==gamepadLastPanel){gamepadLastPanel=currentPanel;refreshGamepadFocus();}
 if(currentPanel){
  if(just(1)){closeGamepadUI();refreshGamepadFocus();}
  else if(state.bagOpen&&just(2))heal(true);
  else if(just(0))activateGamepadUI();
  const axes=gp.axes||[],x=axes[0]||0,y=axes[1]||0;
  const dx=gamepadPressed(gp,15)?1:gamepadPressed(gp,14)?-1:Math.abs(x)>.52?Math.sign(x):0;
  const dy=gamepadPressed(gp,13)?1:gamepadPressed(gp,12)?-1:Math.abs(y)>.52?Math.sign(y):0;
  const direction=dy?(dy>0?'down':'up'):dx?(dx>0?'right':'left'):'';
  const now=performance.now();
  if(direction&&(!gamepadDirection||direction!==gamepadDirection||now>=gamepadNextRepeat)){
   navigateGamepadUI(direction);
   gamepadNextRepeat=now+(direction!==gamepadDirection?370:155);
  }
  gamepadDirection=direction;
  mark();return {active:true,x:0,y:0,analog:false};
 }
 gamepadDirection='';
 if(just(0))interact();
 if(just(1))heal();
 if(just(2))attack();
 if(just(3))bag();
 let x=gp.axes?.[0]||0,y=gp.axes?.[1]||0;
 if(Math.abs(x)<.16)x=0;if(Math.abs(y)<.16)y=0;
 const analog=!!(x||y);
 if(!analog){x=(gamepadPressed(gp,15)?1:0)-(gamepadPressed(gp,14)?1:0);y=(gamepadPressed(gp,13)?1:0)-(gamepadPressed(gp,12)?1:0)}
 mark();return {active:true,x,y,analog};
}
window.addEventListener('gamepadconnected',()=>{gamepadNextRepeat=0});
window.addEventListener('gamepaddisconnected',()=>{gamepadNextRepeat=0});
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
 if(state.bagOpen&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)){
  e.preventDefault();const direction=e.code.slice(5).toLowerCase();
  const slot=$('inventoryGrid').children[selectedInventorySlot];
  if(slot)focusGamepadElement(slot);
  navigateGamepadUI(direction);return;
 }
 if(arrowKeys.has(e.code))e.preventDefault();pressed.add(e.code);
 if(e.repeat)return;
 if(e.code==='Escape'){if(state.bagOpen)closeBag();else if(state.inDialogue)$('nextDialogue').click();else setPause();}
 else if(e.code==='KeyE')interact();else if(e.code==='Space')attack();else if(e.code==='KeyQ')heal();
 else if(e.code==='KeyI'){if(state.bagOpen)closeBag();else bag()}
});
window.addEventListener('keyup',e=>pressed.delete(e.code));
window.addEventListener('blur',()=>{pressed.clear();gamepadDirection='';endJoystick();last=performance.now()});
document.addEventListener('visibilitychange',()=>{if(document.hidden)endJoystick();else last=performance.now()});
applyControlLayout();
// v1.5: tap-to-move removed completely to avoid accidental walks on touch devices.
let walkTo=null;
let last=performance.now(),time=0,miniClock=0,saveClock=0,fpsClock=performance.now(),fpsFrames=0;const tmpCam=new THREE.Vector3();
function canStand(x,z){if(Math.abs(x)>SCENE_RADIUS||Math.abs(z)>SCENE_RADIUS)return false;return solids.every(o=>Math.hypot(o.x-x,o.z-z)>o.r+.26)}
function move(dx,dz){const nx=state.x+dx,nz=state.z+dz;if(canStand(nx,nz)){state.x=nx;state.z=nz;return}if(canStand(nx,state.z))state.x=nx;else if(canStand(state.x,nz))state.z=nz}
function update(dt){const gamepad=readGamepad();if(!state.started||state.paused||state.inDialogue||state.bagOpen||settingsOpen)return;
 state.attackCD=Math.max(0,state.attackCD-dt);state.hitCD=Math.max(0,state.hitCD-dt);
 let sx=(pressed.has('KeyD')||pressed.has('ArrowRight')?1:0)-(pressed.has('KeyA')||pressed.has('ArrowLeft')?1:0),sy=(pressed.has('KeyS')||pressed.has('ArrowDown')?1:0)-(pressed.has('KeyW')||pressed.has('ArrowUp')?1:0);
 if(!sx&&!sy&&Math.hypot(joystick.x,joystick.y)>.16){sx=joystick.x;sy=joystick.y}
 if(!sx&&!sy&&Math.hypot(gamepad.x,gamepad.y)>.16){sx=gamepad.x;sy=gamepad.y}
 if(sx||sy)walkTo=null;
 if(!sx&&!sy&&walkTo){const dx=walkTo.x-state.x,dz=walkTo.z-state.z,dist=Math.hypot(dx,dz);if(dist<.27)walkTo=null;else{sx=(dx-dz)/Math.SQRT2;sy=(dx+dz)/Math.SQRT2}}
 if(graphics.autoAttack&&state.attackCD<=0)attack('auto');
 let moving=false;
 if(sx||sy){const len=Math.hypot(sx,sy),analog=(joystick.active&&!pressed.size&&!walkTo)||(gamepad.active&&gamepad.analog&&!pressed.size&&!walkTo&&!joystick.active);const speed=analog?clampValue((len-.16)/.84,.20,1):1;sx/=len;sy/=len;const wx=(sx+sy)/Math.SQRT2,wz=(sy-sx)/Math.SQRT2;const oldX=state.x,oldZ=state.z;move(wx*3.75*speed*dt,wz*3.75*speed*dt);moving=Math.hypot(state.x-oldX,state.z-oldZ)>.0005;
  if(Math.abs(sx)>.25||Math.abs(sy)>.25)facing=Math.abs(sx)>Math.abs(sy)?(sx>0?'right':'left'):(sy>0?'down':'up');
 }
 if(moving){walkClock+=dt;frame=Math.floor(walkClock*7.6)%4}else{walkClock=0;frame=0}setHeroFrame(facing,frame);
 for(let i=0;i<collectibles.length;i++){const c=collectibles[i];if(!state.collected[i]){c.c.rotation.y+=dt*.9;c.c.position.y=1.03+Math.sin(time*2.5+i)*.12;c.ring.rotation.z+=dt*.25;if(state.stage>=1&&Math.hypot(state.x-c.x,state.z-c.z)<.9)collect(i)}}
 for(let e of enemies){if(!e.alive)continue;const d=Math.hypot(e.x-state.x,e.z-state.z);e.attackTimer=Math.max(0,e.attackTimer-dt);e.group.position.y=Math.sin(time*2.2+e.phase)*.095;e.group.rotation.y+=dt*.5;
 if(d<4.5&&d>1.1){const vx=(state.x-e.x)/d,vz=(state.z-e.z)/d;e.x+=vx*dt*.97;e.z+=vz*dt*.97;e.group.position.x=e.x;e.group.position.z=e.z;e.shadow.position.x=e.x;e.shadow.position.z=e.z}
 if(d<1.26&&e.attackTimer===0&&state.hitCD===0){state.hp=Math.max(0,state.hp-9);secondsSinceHit=0;regenAccumulator=0;state.hitCD=.75;e.attackTimer=1.25;pulse(state.x,state.z,0xff8298);refreshHUD();if(state.hp<=0){state.hp=100;state.x=playerStart.x;state.z=playerStart.z;state.coins=Math.max(0,state.coins-5);walkTo=null;toast('💗 Міра повернула Емілі до села. Тримайся!');refreshHUD()}else toast('💔 Дух атакував! -9 здоров’я');persist()}
 }
 // Regen only while exploring safely; the update loop halts during all overlays and dialogues.
 secondsSinceHit+=dt;
 const danger=enemies.some(e=>e.alive&&Math.hypot(e.x-state.x,e.z-state.z)<REGEN_DANGER_RADIUS);
 const regenerating=state.hp<100&&secondsSinceHit>=REGEN_DELAY&&!danger;
 if(regenerating){
  regenAccumulator+=dt;
  if(regenAccumulator>=REGEN_INTERVAL){
   const points=Math.floor(regenAccumulator/REGEN_INTERVAL);
   regenAccumulator%=REGEN_INTERVAL;
   state.hp=Math.min(100,state.hp+points);refreshHUD();
  }
 }else regenAccumulator=0;
 if(regenVisible!==regenerating){regenVisible=regenerating;$('regenBadge').hidden=!regenerating}
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
 updateMagicWaves(dt);
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
