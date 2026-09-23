import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Pane } from 'tweakpane';
import { MODEL_CENTER, MODEL_LENGTH, TABLE_HEIGHT, optics, projectToWall } from './optics';
import { CONTACT_GAP, ModelSurface, approachZ } from './surface';
import { SkeletonProjection } from './skeleton-projection';
import { SkeletonReveal } from './reveal';
import { layoutDefaults, cleanParameters, projectionArea } from './layout';
import { ProjectorGuide } from './projector-guide';
import { PlanningPanel, downloadSnapshot, type Snapshot } from './planning-panel';
import './style.css';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
<header><div class="brand"><div class="brand-icon"></div><h1>Shadow<span> Lab</span></h1><div class="subtitle">光と影の実験室<br>Spatial interaction prototype</div></div><div class="header-right"><div class="badge">EXPERIMENT 02 / SKELETON</div><span id="status"><i class="status-dot"></i>準備中</span></div></header>
<main class="workspace"><section class="stage" aria-label="光源と模型と壁の3D実験空間"><canvas id="scene" tabindex="0" aria-label="3Dシーン。矢印キーでライトを移動"></canvas>
<div class="stage-top"><div class="stage-label">TRICERATOPS / GEN 04<br><strong>距離を変えて、配置を探る。</strong></div><div class="view-tabs"><button id="space-view" class="active">空間</button><button id="wall-view">壁面</button><button id="side-view">側面</button><button id="reset-view" title="視点を戻す">↺</button></div></div><div id="layout-hud"></div>
<div id="light-tag" class="stage-tag">LIGHT</div><div id="model-tag" class="stage-tag">MODEL · 100 mm</div>
<div class="stage-bottom"><div class="hint"><b>光源の矢印をドラッグ</b><br>背景ドラッグ：視点回転 · スクロール：拡大<br><span class="keyboard"><kbd>↑</kbd><kbd>↓</kbd> 前後 <kbd>←</kbd><kbd>→</kbd> 左右 <kbd>Q</kbd><kbd>E</kbd> 上下</span></div></div>
<div class="preview-card"><div class="preview-title">光源からの視点 <span>LIVE</span></div><div id="light-view"></div><div class="preview-note">模型の側面・画角を確認</div></div>
<div id="loading"><strong>Shadow Lab</strong><p>模型データを読み込んでいます…</p></div></section>
<aside><section class="section"><div class="section-title">LIGHT DISTANCE <span>01</span></div><div class="distance-row"><div class="distance-value"><span id="distance">30.0</span><small>cm</small></div><p>模型中心までの直線距離</p></div><input class="distance-input" id="distance-slider" aria-label="ライトの前後距離" type="range" min="0" max="0.45" step="0.0001" value="0.3"><div class="range-labels"><span>NEAR / 0 cm（侵入防止）</span><span>FAR / 45 cm</span></div><div class="presets"><button data-distance="0.15">15 cm</button><button data-distance="0.30" class="active">30 cm</button><button data-distance="0.45">45 cm</button></div>
<div class="skeleton-control"><label><input id="skeleton-enabled" type="checkbox" checked> 近づくと骨格を表示</label><div class="reveal-line"><span id="skeleton-status" role="status">骨格を読み込み中…</span><output id="skeleton-opacity">0%</output></div><progress id="reveal-progress" max="1" value="0" aria-label="骨格の表示率"></progress><p id="reveal-range">模型中心まで34 cm付近で出現、24 cm以下で明瞭に。</p><button id="retry-skeleton" hidden>骨格の読み込みを再試行</button></div>
<div class="near-field"><div class="section-title">SURFACE APPROACH <span>近接</span></div><div class="focus-buttons"><button id="focus-head" disabled>頭に寄る</button><button id="focus-body" disabled>胴体に寄る</button></div><p id="focus-label">狙う場所：模型中心</p><label for="surface-slider">表面からの前後距離 <output id="surface-gap">—</output></label><input class="distance-input" id="surface-slider" type="range" min="0" max="100" step="0.1" value="50" disabled><div class="range-labels"><span>0 mm / 接触の目安</span><span>100 mm</span></div><p class="near-note">模型をダブルクリックして狙う場所を変更。0 mm指定は計算上0.1 mmの隙間を残します。</p><div class="surface-readout">表面までの最短距離 <strong id="nearest-surface">—</strong></div></div>
<div class="measurements"><div><div class="metric-label">中心面の近似倍率</div><div class="metric-value" id="magnification">2.67<small>×</small></div></div><div><div class="metric-label">中心面の近似影幅</div><div class="metric-value" id="shadow-width">26.7<small>cm</small></div></div><div><div class="metric-label">中心面までの前後距離</div><div class="metric-value" id="axial">30.0<small>cm</small></div><div class="metric-hint">d_axial</div></div><div><div class="metric-label">メッシュ射影の幅</div><div class="metric-value" id="projected-width">—</div><div class="metric-hint">壁・照射範囲による欠けを除く</div></div></div><div id="warning" class="warning"></div></section>
<section class="section"><div class="section-title">SCENE PARAMETERS <span>02</span></div><div id="pane"></div><p class="note">点光源の透視投影・逆二乗減衰。ライトは選択部位を向きます。ぼかしは描画フィルターで、実際のLEDの発光面・半影は未再現です。</p><div class="actions"><button id="reset">配置をリセット</button><button id="export">設定を保存 ↓</button></div></section>
<section class="section"><div class="section-title">SPECIMEN <span>03</span></div><div class="model-row"><div class="model-mark">04</div><div><div class="model-name">トリケラトプス</div><div class="model-meta">100 mm · BODY + SKELETON</div></div></div><p class="note">gen04 肉付き・骨格の登録座標を共有。骨格は影と同じ光源視点で壁に投影し、影の内側だけに表示します。骨格の光は展示用の合成表現です。</p></section></aside></main>
<footer><span>SHADOW LAB · 光源視点共有 / 影内骨格投影</span><span id="performance">— FPS / — TRI</span></footer>`;

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id)! as T;
const defaults = {modelWall:0.5, wallWidth:1, lightX:0, lightY:MODEL_CENTER.y, lightZ:0.3, angle:48, blur:0, fov:40, guides:true, skeleton:true, revealDistance:.34, fadeWidth:.10, skeletonBrightness:1.4,...layoutDefaults};
const params = {...defaults};
type Parameters = typeof params;
type ViewMode='space'|'wall'|'side';
let loaded = false, dirty = true, mode:ViewMode = 'space', fps = 0, frameTriangles = 0;
let projected: {width:number|null,minX:number,maxX:number,minY:number,maxY:number,unbounded:boolean} = {width:0, minX:0, maxX:0, minY:0, maxY:0,unbounded:false};
let modelDimensions: number[] = [], modelVertices: THREE.Vector3[] = [];
let surface: ModelSurface | undefined, bodyModel: THREE.Object3D | undefined;
let surfaceDistance = Infinity, collisionLimited = false;
let frontSurface: THREE.Vector3 | null = null;
let focusName = '模型中心';
let skeletonProjection: SkeletonProjection | undefined;
let skeletonLoading = true, skeletonError = '';
const reveal = new SkeletonReveal();
const stage = document.querySelector<HTMLElement>('.stage')!;
const canvas = el<HTMLCanvasElement>('scene');
let renderer: THREE.WebGLRenderer;
try {renderer = new THREE.WebGLRenderer({canvas,antialias:true,alpha:false});}
catch(error){el('loading').innerHTML='<strong>3D表示を開始できませんでした</strong><p>WebGL2対応ブラウザで開き、ハードウェアアクセラレーションを確認してください。</p>';throw error;}
renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
renderer.info.autoReset = false;
const scene = new THREE.Scene();
const projectorGuide=new ProjectorGuide();scene.add(projectorGuide.group);
scene.background = new THREE.Color('#d7dfda');
scene.fog = new THREE.Fog('#d7dfda',3.2,7);
const center = new THREE.Vector3(MODEL_CENTER.x,MODEL_CENTER.y,MODEL_CENTER.z);
const focusPoint = center.clone();
const camera = new THREE.PerspectiveCamera(40,1,0.005,20);
const wallCamera = new THREE.PerspectiveCamera(42,1,0.005,20);
const sideCamera = new THREE.OrthographicCamera(-1,1,1,-1,.005,20);
const lightCamera = new THREE.PerspectiveCamera(params.fov,236/142,0.00002,5);
lightCamera.layers.set(1);
const controls = new OrbitControls(camera,canvas);
controls.enableDamping = true; controls.minDistance = 0.15; controls.maxDistance = 4;controls.maxPolarAngle = Math.PI*.49;
function resetView(){camera.position.set(.85,1.06,1.28);controls.target.set(0,.70,-.16);controls.update();}
resetView();
const hemi = new THREE.HemisphereLight('#ffffff','#748c8a',1.25);scene.add(hemi);hemi.layers.enable(1);
const fill = new THREE.DirectionalLight('#fff9e8',1.8);fill.position.set(-1,2,1);fill.layers.set(1);scene.add(fill);
const wall = new THREE.Mesh(new THREE.PlaneGeometry(1,0.68),new THREE.MeshStandardMaterial({color:'#eeeee5',roughness:1,metalness:0}));
wall.position.set(0,center.y,-params.modelWall);wall.receiveShadow = true;scene.add(wall);
// Frame remains outside the receiving plane and never casts a second silhouette.
const wallFrame = new THREE.Mesh(new THREE.BoxGeometry(1.024,.704,.015),new THREE.MeshStandardMaterial({color:'#71817d',roughness:1}));
wallFrame.position.copy(wall.position);wallFrame.position.z-=.012;scene.add(wallFrame);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(20,20),new THREE.MeshStandardMaterial({color:'#c4cfca',roughness:1}));
floor.rotation.x=-Math.PI/2;floor.position.y=-.002;scene.add(floor);
const grid = new THREE.GridHelper(3,30,'#a2b7ad','#b1c2b9');grid.position.y=.001;scene.add(grid);
const pedestal = new THREE.Mesh(new THREE.BoxGeometry(.17,TABLE_HEIGHT,.1),new THREE.MeshStandardMaterial({color:'#263d3d',roughness:.8}));
pedestal.position.y=TABLE_HEIGHT/2;scene.add(pedestal);
const top = new THREE.Mesh(new THREE.BoxGeometry(.18,.005,.115),new THREE.MeshStandardMaterial({color:'#667c70',roughness:.9}));
top.position.y=TABLE_HEIGHT-.0025;scene.add(top);
const light = new THREE.SpotLight('#fff4dd',2.56,0,THREE.MathUtils.degToRad(params.angle),.28,2);
light.castShadow=true;light.shadow.mapSize.set(2048,2048);light.shadow.camera.near=.01;light.shadow.camera.far=3.5;
light.shadow.bias=0;light.shadow.normalBias=0;light.shadow.radius=params.blur;
light.target.position.copy(center);scene.add(light,light.target);
const lamp = new THREE.Group();scene.add(lamp);
const focusMarker = new THREE.Mesh(new THREE.SphereGeometry(.0012,12,8),new THREE.MeshBasicMaterial({color:'#4be2b8',depthTest:false}));
focusMarker.renderOrder=5;scene.add(focusMarker);
const emitter = new THREE.Mesh(new THREE.SphereGeometry(.009,20,12),new THREE.MeshBasicMaterial({color:'#fff6c7'}));lamp.add(emitter);
const lampHousing = new THREE.Mesh(new THREE.CylinderGeometry(.014,.012,.043,24),new THREE.MeshStandardMaterial({color:'#264841',roughness:.6,metalness:.25}));
lampHousing.rotation.x=Math.PI/2;lampHousing.position.z=.031;lamp.add(lampHousing);
const transform = new TransformControls(camera,canvas);transform.setSize(.65);transform.attach(lamp);
const gizmo = transform.getHelper();scene.add(gizmo);
transform.addEventListener('dragging-changed',event=>{controls.enabled=!event.value && mode==='space';});
transform.addEventListener('objectChange',()=>{
  params.lightX=THREE.MathUtils.clamp(lamp.position.x,-.5,.5);
  params.lightY=THREE.MathUtils.clamp(lamp.position.y,.4,1.2);
  params.lightZ=THREE.MathUtils.clamp(lamp.position.z,0,1);
  apply();pane.refresh();
});
const guideGeometry = new THREE.BufferGeometry().setFromPoints([center,center]);
const guide = new THREE.Line(guideGeometry,new THREE.LineDashedMaterial({color:'#4a8875',dashSize:.008,gapSize:.006,transparent:true,opacity:.55}));scene.add(guide);

const aside=document.querySelector('aside')!;
const experimentPanel=document.createElement('div');experimentPanel.id='experiment-panel';
while(aside.firstChild)experimentPanel.append(aside.firstChild);
const planningRoot=document.createElement('div');planningRoot.id='planning-panel';
const tabNav=document.createElement('nav');tabNav.className='panel-tabs';tabNav.setAttribute('aria-label','設定パネル');
tabNav.innerHTML='<button id="planning-tab" class="active" aria-pressed="true">空間設計</button><button id="experiment-tab" aria-pressed="false">ライト・骨格</button>';
aside.append(tabNav,planningRoot,experimentPanel);experimentPanel.hidden=true;
const commonActions=experimentPanel.querySelector<HTMLElement>('.actions')!;commonActions.classList.add('common-actions');aside.append(commonActions);
function panelTab(planning:boolean){planningRoot.hidden=!planning;experimentPanel.hidden=planning;for(const [id,active]of [['planning-tab',planning],['experiment-tab',!planning]] as const){el(id).classList.toggle('active',active);el(id).setAttribute('aria-pressed',String(active));}}
el('planning-tab').onclick=()=>panelTab(true);el('experiment-tab').onclick=()=>panelTab(false);
const planning=new PlanningPanel(planningRoot,params,{defaults,patch:setParameters,condition:(wallDistance,lightDistance)=>{params.modelWall=wallDistance;preset(lightDistance);},snapshot,restore:restoreSnapshot});
el<HTMLInputElement>('distance-slider').max='1';
document.querySelector('.range-labels span:last-child')!.textContent='FAR / 100 cm';

const pane = new Pane({container:el('pane')});
const spaceFolder = pane.addFolder({title:'空間 / メートル'});
spaceFolder.addBinding(params,'modelWall',{label:'模型 → 壁',min:.1,max:1.5,step:.01});
spaceFolder.addBinding(params,'wallWidth',{label:'壁面の幅',min:.3,max:2.5,step:.01});
spaceFolder.addBinding(params,'wallHeight',{label:'壁面の高さ',min:.2,max:1.5,step:.01});
const lightFolder=pane.addFolder({title:'光源 / メートル'});
lightFolder.addBinding(params,'lightX',{label:'左右 X',min:-.5,max:.5,step:.001});
lightFolder.addBinding(params,'lightY',{label:'高さ Y',min:.4,max:1.2,step:.001});
lightFolder.addBinding(params,'lightZ',{label:'前後 Z',min:0,max:1,step:.0001});
lightFolder.addBinding(params,'angle',{label:'照射の半角 °',min:20,max:75,step:1});
lightFolder.addBinding(params,'blur',{label:'影のぼかし',min:0,max:5,step:.1});
const skeletonFolder=pane.addFolder({title:'骨格 / 距離は中心基準'});
skeletonFolder.addBinding(params,'revealDistance',{label:'出現距離 m',min:.15,max:.45,step:.01});
skeletonFolder.addBinding(params,'fadeWidth',{label:'フェード幅 m',min:.02,max:.14,step:.01});
skeletonFolder.addBinding(params,'skeletonBrightness',{label:'骨格の明るさ',min:.3,max:3,step:.1});
const cameraFolder=pane.addFolder({title:'ビュー'});
cameraFolder.addBinding(params,'fov',{label:'光源視点 FOV °',min:20,max:80,step:1});
cameraFolder.addBinding(params,'guides',{label:'ガイド表示'});
pane.on('change',()=>apply());

function apply(){
  frontSurface=surface?.frontAt(params.lightX,params.lightY)??null;
  const minimumZ=frontSurface ? Math.max(0,approachZ(frontSurface.z,0)) : 0;
  collisionLimited=params.lightZ<minimumZ;
  params.lightZ=Math.max(minimumZ,params.lightZ);
  lamp.position.set(params.lightX,params.lightY,params.lightZ);light.position.copy(lamp.position);
  surfaceDistance=surface?.distanceTo(lamp.position)??Infinity;
  // Near clipping follows the actual mesh clearance, not distance to its center.
  light.shadow.camera.near=Math.max(.000001,Math.min(.01,surfaceDistance*.2));
  light.shadow.camera.updateProjectionMatrix();
  lightCamera.near=light.shadow.camera.near;
  light.target.position.copy(focusPoint);
  // Avoid an undefined look direction when a freely moved source equals its target.
  if(light.position.distanceToSquared(light.target.position)<1e-12)light.target.position.z-=.001;
  lamp.lookAt(light.target.position);
  lampHousing.position.z=-.031;
  wall.position.z=-params.modelWall;wall.scale.set(params.wallWidth,params.wallHeight/.68,1);
  wallFrame.position.z=-params.modelWall-.012;wallFrame.scale.set((params.wallWidth+.024)/1.024,(params.wallHeight+.024)/.704,1);
  projectorGuide.update(params);
  const area=projectionArea(params);
  skeletonProjection?.setProjectionBounds(area.bounds,params.projectorClip);
  el('layout-hud').textContent=`模型–壁 ${(params.modelWall*100).toFixed(0)} cm · Z ${(params.lightZ*100).toFixed(1)} cm · 投影 ${(area.width*100).toFixed(0)} × ${(area.height*100).toFixed(0)} cm`;
  light.angle=THREE.MathUtils.degToRad(params.angle);light.shadow.radius=params.blur;
  lightCamera.position.copy(light.position);lightCamera.lookAt(light.target.position);lightCamera.fov=params.fov;lightCamera.updateProjectionMatrix();
  guide.geometry.setFromPoints([lamp.position,focusPoint]);guide.computeLineDistances();guide.visible=params.guides;
  focusMarker.position.copy(focusPoint);focusMarker.visible=params.guides&&mode==='space'&&focusName!=='模型中心';
  // The fixture is a locator, not a colliding solid; shrink it to keep contact visible.
  lamp.scale.setScalar(Math.min(1,Math.max(.08,surfaceDistance/.018)));
  grid.visible=params.guides;gizmo.visible=params.guides&&mode==='space';transform.enabled=params.guides&&mode==='space';
  skeletonProjection?.invalidate();
  el<HTMLInputElement>('skeleton-enabled').checked=params.skeleton;
  el('reveal-range').textContent=`模型中心まで${(params.revealDistance*100).toFixed(0)} cm付近で出現、${((params.revealDistance-params.fadeWidth)*100).toFixed(0)} cm以下で明瞭に。`;
  el<HTMLInputElement>('distance-slider').value=String(params.lightZ);
  document.querySelectorAll<HTMLButtonElement>('[data-distance]').forEach(b=>b.classList.toggle('active',Math.abs(params.lightZ-Number(b.dataset.distance))<.0001&&Math.abs(params.lightX)<.0001&&Math.abs(params.lightY-center.y)<.0001));
  dirty=true;updateMetrics();
}
function measureProjection(){
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  let frontZ=-Infinity,backZ=Infinity;
  for(const vertex of modelVertices){frontZ=Math.max(frontZ,vertex.z);backZ=Math.min(backZ,vertex.z);const p=projectToWall(vertex,light.position,params.modelWall);if(p){minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);}}
  // Triangles crossing the source's Z plane project through infinity. A finite
  // vertex-only bounding box is misleading there; wall rendering still works.
  const unbounded=light.position.z<=frontZ&&light.position.z>=backZ;
  projected={width:unbounded?null:maxX-minX,minX,maxX,minY,maxY,unbounded};
}
function updateMetrics(){
  const m=optics(light.position,params.modelWall);
  el('distance').textContent=(m.dTrue*100).toFixed(1);
  el('magnification').innerHTML=m.magnification===null?'—':`${m.magnification.toFixed(2)}<small>×</small>`;
  el('shadow-width').innerHTML=m.approximateWidth===null?'—':`${(m.approximateWidth*100).toFixed(1)}<small>cm</small>`;
  el('axial').innerHTML=`${(m.dAxial*100).toFixed(1)}<small>cm</small>`;
  if(loaded){measureProjection();el('projected-width').innerHTML=projected.width===null?'非有界':`${(projected.width*100).toFixed(1)}<small>cm</small>`;}
  const gap=frontSurface?params.lightZ-frontSurface.z:null;
  el('surface-gap').textContent=gap===null?'対象なし':`${(gap*1000).toFixed(1)} mm`;
  el('nearest-surface').textContent=Number.isFinite(surfaceDistance)?`${(surfaceDistance*1000).toFixed(2)} mm`:'—';
  el<HTMLInputElement>('surface-slider').disabled=gap===null;
  el<HTMLInputElement>('surface-slider').value=String(gap===null?0:gap<=CONTACT_GAP+1e-8?0:Math.min(100,gap*1000));
  el('focus-label').textContent=`狙う場所：${focusName}`;
  el('focus-head').classList.toggle('active',focusName==='頭');
  el('focus-body').classList.toggle('active',focusName==='胴体');
  const warnings=[];
  if(collisionLimited)warnings.push('模型への侵入を防ぐため、表面の手前で止めています。');
  if(surfaceDistance<.002)warnings.push('接触付近：理想点光源の影が壁の大部分を覆う場合があります。実際のLEDの半影とは異なります。');
  if(params.lightZ<.05)warnings.push('近接時は部位ごとの奥行き差が大きく効きます。中心面の近似値は影全体の倍率ではありません。');
  if(projected.unbounded)warnings.push('光源が模型の奥行き範囲に入り、無限平面上の影は有限幅で表せません。壁に収まる部分を表示しています。');
  if(loaded&&(projected.minX < -params.wallWidth/2 || projected.maxX>params.wallWidth/2 || projected.minY<center.y-params.wallHeight/2 || projected.maxY>center.y+params.wallHeight/2)) warnings.push('影の一部が壁面の範囲を超えています。');
  el('warning').textContent=warnings.join(' ');
  planning.refresh(projected,loaded);
}
function resetFocus(){focusPoint.copy(center);focusName='模型中心';}
function preset(distance:number){resetFocus();Object.assign(params,{lightX:0,lightY:center.y,lightZ:THREE.MathUtils.clamp(distance,0,1)});apply();pane.refresh();}
function focusAt(x:number,y:number,name:string){
  const point=surface?.frontAt(x,y);if(!point)return false;
  focusPoint.copy(point);focusName=name;
  Object.assign(params,{lightX:point.x,lightY:point.y,lightZ:approachZ(point.z,.05)});
  apply();pane.refresh();return true;
}
function focusPart(part:'head'|'body'){
  return part==='head'?focusAt(-.03,TABLE_HEIGHT+.032,'頭'):focusAt(.012,TABLE_HEIGHT+.028,'胴体');
}
function approachSurface(gap:number){
  if(!frontSurface||!Number.isFinite(gap))return;
  params.lightZ=Math.min(.45,approachZ(frontSurface.z,THREE.MathUtils.clamp(gap,0,.1)));
  apply();pane.refresh();
}
el('focus-head').onclick=()=>focusPart('head');el('focus-body').onclick=()=>focusPart('body');
el<HTMLInputElement>('surface-slider').addEventListener('input',event=>approachSurface(Number((event.target as HTMLInputElement).value)/1000));
canvas.addEventListener('dblclick',event=>{
  if(!bodyModel||mode!=='space'||transform.dragging||transform.axis)return;
  const rect=canvas.getBoundingClientRect();const ray=new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),camera);
  const hit=ray.intersectObject(bodyModel,true)[0];if(hit)focusAt(hit.point.x,hit.point.y,'選択した部位');
});
document.querySelectorAll<HTMLButtonElement>('[data-distance]').forEach(button=>button.onclick=()=>preset(Number(button.dataset.distance)));
el<HTMLInputElement>('distance-slider').addEventListener('input',event=>{params.lightZ=Number((event.target as HTMLInputElement).value);apply();pane.refresh();});
el<HTMLInputElement>('skeleton-enabled').onchange=event=>{params.skeleton=(event.target as HTMLInputElement).checked;apply();};
el('retry-skeleton').onclick=()=>void loadSkeleton();
el('reset').onclick=()=>reset();
function setMode(view:ViewMode){mode=view;projectorGuide.setWallView(view==='wall');controls.enabled=view==='space';transform.camera=view==='space'?camera:view==='wall'?wallCamera:sideCamera;transform.enabled=params.guides&&view==='space';gizmo.visible=transform.enabled;focusMarker.visible=params.guides&&view==='space'&&focusName!=='模型中心';for(const v of ['space','wall','side'])el(`${v}-view`).classList.toggle('active',view===v);}
el('space-view').onclick=()=>setMode('space');el('wall-view').onclick=()=>setMode('wall');el('reset-view').onclick=()=>{resetView();setMode('space');};
el('side-view').onclick=()=>setMode('side');
const keys=new Set<string>();
window.addEventListener('keydown',event=>{if(event.target instanceof HTMLElement && (event.target.matches('input,textarea,select')||event.target.isContentEditable))return;if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','q','e','Q','E'].includes(event.key)){event.preventDefault();keys.add(event.key.toLowerCase());}});
window.addEventListener('keyup',event=>keys.delete(event.key.toLowerCase()));window.addEventListener('blur',()=>keys.clear());document.addEventListener('visibilitychange',()=>keys.clear());
function keyboard(dt:number){if(!keys.size)return;const speed=.10*dt;
 params.lightX=THREE.MathUtils.clamp(params.lightX+(Number(keys.has('arrowright'))-Number(keys.has('arrowleft')))*speed,-.5,.5);
 params.lightZ=THREE.MathUtils.clamp(params.lightZ+(Number(keys.has('arrowdown'))-Number(keys.has('arrowup')))*speed,0,1);
 params.lightY=THREE.MathUtils.clamp(params.lightY+(Number(keys.has('e'))-Number(keys.has('q')))*speed,.4,1.2);apply();pane.refresh();}
let width=1,height=1;
function resize(){width=stage.clientWidth;height=stage.clientHeight;renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();wallCamera.aspect=width/height;wallCamera.updateProjectionMatrix();}
new ResizeObserver(resize).observe(stage);resize();
function tag(id:string,position:THREE.Vector3,cam:THREE.Camera){const p=position.clone().project(cam);const e=el(id);e.style.left=`${(p.x*.5+.5)*width}px`;e.style.top=`${(-p.y*.5+.5)*height-23}px`;e.style.display=mode==='space'&&params.guides&&Math.abs(p.x)<.95&&Math.abs(p.y)<.95&&p.z<1?'':'none';}
const previewBackground=new THREE.Color('#253e40');
let previous=performance.now(),frames=0,fpsStart=previous;
function animate(now:number){const dt=Math.min((now-previous)/1000,.05);previous=now;keyboard(dt);controls.update();
 const opacity=reveal.update(lamp.position.distanceTo(center),params.skeleton&&!!skeletonProjection,params.revealDistance,params.fadeWidth,dt);
 el('skeleton-opacity').textContent=`${Math.round(opacity*100)}%`;
 (el('reveal-progress') as HTMLProgressElement).value=opacity;
 el('skeleton-status').textContent=skeletonError?'骨格の読み込みに失敗':skeletonLoading?'骨格を読み込み中…':!params.skeleton?'骨格表示 OFF':opacity>.995?'骨格を投影中':opacity>.001?'骨格が浮かび上がります':'遠距離：影のみ';
 const aspect=width/height;
 const wallViewDistance=Math.max(params.wallHeight*.6/(Math.tan(THREE.MathUtils.degToRad(21))),params.wallWidth*.6/(aspect*Math.tan(THREE.MathUtils.degToRad(21))))+.1;
 wallCamera.position.set(0,center.y,-params.modelWall+wallViewDistance);wallCamera.lookAt(wall.position);
 // Clip foreground apparatus in the wall-only inspection view, retaining shadow casters.
 wallCamera.near=Math.max(.005,wallViewDistance-params.modelWall*.5);wallCamera.updateProjectionMatrix();
 const farZ=Math.max(params.lightZ,params.projectorRays?projectionArea(params).lens.z:0)+.2,minZ=-params.modelWall-.2;
 const sideZ=(farZ+minZ)/2,halfHeight=Math.max(.85,(farZ-minZ)/(2*aspect));
 sideCamera.position.set(3,center.y,sideZ);sideCamera.lookAt(0,center.y,sideZ);
 sideCamera.left=-halfHeight*aspect;sideCamera.right=halfHeight*aspect;sideCamera.top=halfHeight;sideCamera.bottom=-halfHeight;sideCamera.updateProjectionMatrix();
 const active=mode==='space'?camera:mode==='wall'?wallCamera:sideCamera;
 renderer.info.reset();
 skeletonProjection?.update(renderer,wall,opacity,params.skeletonBrightness);
 const roomFog=scene.fog;
 if(mode==='wall')scene.fog=null; // A wider wall needs a distant inspection camera, not extra haze.
 renderer.setScissorTest(false);renderer.setViewport(0,0,width,height);renderer.render(scene,active);
 scene.fog=roomFog;
 tag('light-tag',lamp.position,active);tag('model-tag',new THREE.Vector3(0,TABLE_HEIGHT+.08,0),active);
 const preview=el('light-view').getBoundingClientRect(),rect=stage.getBoundingClientRect();
 const x=preview.left-rect.left,y=height-(preview.bottom-rect.top),w=preview.width,h=preview.height;
 renderer.setScissorTest(true);renderer.setScissor(x,y,w,h);renderer.setViewport(x,y,w,h);
 const background=scene.background;scene.background=previewBackground;lightCamera.aspect=w/h;lightCamera.updateProjectionMatrix();
 renderer.render(scene,lightCamera);scene.background=background;renderer.setScissorTest(false);
 frameTriangles=renderer.info.render.triangles;frames++;
 if(now-fpsStart>600){fps=frames*1000/(now-fpsStart);frames=0;fpsStart=now;el('performance').textContent=`${fps.toFixed(0)} FPS / ${frameTriangles.toLocaleString()} TRI (描画)`;}
 dirty=false;requestAnimationFrame(animate);
}
apply();requestAnimationFrame(animate);
async function load(){try{
 const gltf=await new GLTFLoader().loadAsync('/models/body_td.glb');
 const body=gltf.scene;const rawBox=new THREE.Box3().setFromObject(body);const rawSize=rawBox.getSize(new THREE.Vector3());
 if(Math.abs(rawSize.z-.1)>.005 || rawSize.y>rawSize.z)throw new Error('模型の軸・寸法が想定と異なります。GLBを確認してください。');
 body.rotation.y=-Math.PI/2;body.position.y=TABLE_HEIGHT;
 body.traverse(object=>{if(object instanceof THREE.Mesh){object.castShadow=true;object.receiveShadow=false;object.material=new THREE.MeshStandardMaterial({color:'#dfe3cf',roughness:.82,metalness:.03,shadowSide:THREE.DoubleSide});object.layers.enable(1);}});
 scene.add(body);body.updateMatrixWorld(true);
 modelDimensions=new THREE.Box3().setFromObject(body).getSize(new THREE.Vector3()).toArray();
 body.traverse(object=>{if(object instanceof THREE.Mesh){const positions=object.geometry.attributes.position;for(let i=0;i<positions.count;i++)modelVertices.push(new THREE.Vector3().fromBufferAttribute(positions,i).applyMatrix4(object.matrixWorld));}});
 bodyModel=body;surface=new ModelSurface(body);loaded=true;apply();pane.refresh();el<HTMLButtonElement>('focus-head').disabled=false;el<HTMLButtonElement>('focus-body').disabled=false;el('loading').hidden=true;el('status').innerHTML='<i class="status-dot"></i>実験中';
 void loadSkeleton();
 }catch(error){el('loading').innerHTML=`<strong>模型を読み込めませんでした</strong><p></p><button id="retry">再読み込み</button>`;el('loading').querySelector('p')!.textContent=String(error);el('retry').onclick=()=>location.reload();el('status').textContent='読み込みエラー';console.error(error);}}
void load();
async function loadSkeleton(){
 if(skeletonProjection)return;
 skeletonLoading=true;skeletonError='';el('retry-skeleton').hidden=true;
 try{
   const gltf=await new GLTFLoader().loadAsync('/models/skeleton_td.glb');
   const skeleton=gltf.scene;
   skeleton.rotation.y=-Math.PI/2;skeleton.position.y=TABLE_HEIGHT;
   const size=new THREE.Box3().setFromObject(skeleton).getSize(new THREE.Vector3());
   if(Math.abs(size.x-MODEL_LENGTH)>.01||size.y>.07||size.z>.05)throw new Error('骨格の寸法・軸を確認してください。');
   skeletonProjection=new SkeletonProjection(skeleton,light);
   scene.add(skeletonProjection.overlay);apply();
 }catch(error){skeletonError=String(error);el('retry-skeleton').hidden=false;el('retry-skeleton').title=skeletonError;console.error(error);}
 finally{skeletonLoading=false;}
}
function reset(){resetFocus();Object.assign(params,defaults);apply();pane.refresh();resetView();setMode('space');}
function setParameters(patch:Partial<Parameters>){Object.assign(params,cleanParameters(params,patch));apply();pane.refresh();}
function snapshot():Snapshot{return {schemaVersion:4,units:'m',params:{...params},focus:{name:focusName,point:focusPoint.toArray()},surfaceDistance,contactGap:CONTACT_GAP,light:{intensityCd:light.intensity,decay:light.decay},model:{source:'body_td.glb',skeletonSource:'skeleton_td.glb',rotationY:-Math.PI/2,length:MODEL_LENGTH},reveal:{distanceBasis:'body-bounding-box-center',hysteresis:reveal.hysteresis},projection:projectionArea(params),optics:optics(light.position,params.modelWall),notes:'正対プロジェクターの投影範囲。斜め投射・遮光・機種固有の焦点範囲は未計算。'};}
function restoreSnapshot(saved:Snapshot){
 Object.assign(params,cleanParameters(defaults,saved.params));resetFocus();
 const point=saved.focus?.point;
 if(Array.isArray(point)&&point.length===3&&point.every(v=>typeof v==='number'&&Number.isFinite(v))&&Math.abs(point[0])<=.06&&point[1]>=TABLE_HEIGHT&&point[1]<=TABLE_HEIGHT+.06&&Math.abs(point[2])<=.03){focusPoint.fromArray(point);focusName=typeof saved.focus?.name==='string'?saved.focus.name.slice(0,60):'選択した部位';}
 apply();pane.refresh();
}
el('export').onclick=()=>downloadSnapshot(snapshot());
const api={getState:()=>({loaded,params:{...params},...optics(light.position,params.modelWall),aim:{target:light.target.position.toArray(),previewDirection:lightCamera.getWorldDirection(new THREE.Vector3()).toArray(),shadowDirection:light.shadow.camera.getWorldDirection(new THREE.Vector3()).toArray()},projection:projectionArea(params),projected:{...projected},surfaceDistance,surfaceGap:frontSurface?params.lightZ-frontSurface.z:null,focus:{name:focusName,point:focusPoint.toArray()},skeleton:{loaded:!!skeletonProjection,error:skeletonError,opacity:reveal.opacity,target:reveal.target,active:reveal.active,dimensions:skeletonProjection?.dimensions,projectionMatrix:light.shadow.matrix.toArray()},collisionLimited,shadowNear:light.shadow.camera.near,fps,triangles:frameTriangles,modelTriangles:80000,modelDimensions,view:mode,dirty}),setPreset:preset,setView:setMode,focusPart,approachSurface,setParameters,reset};
declare global {interface Window {__SHADOW_LAB__:typeof api}}
window.__SHADOW_LAB__=api;
