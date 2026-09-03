(function(){
"use strict";

/* =========================================================================
   ANTI-DRONE SYSTEM — Scenario Simulation Console
   Built for SIH 2026 problem statement: High Altitude Performance
   Optimization and Robust Design of Anti-Drone System.

   This file is self-contained (Three.js r128 via CDN + vanilla JS/CSS).
   Drop straight into the "simulation" folder of the project repo.

   Keyboard shortcuts:
     1-9, 0   -> select drone scenario
     R        -> random scenario auto-shuffle mode
     H        -> toggle signal source HARDWARE / SIMULATION
     N        -> engage / neutralize locked target
     Space    -> pause / resume
     C        -> reset session
   ========================================================================= */

/* ---------------- CONFIG ---------------- */
const CFG = {
  radarRange: 290,
  eoRange: 165,
  mastHeight: 2.3,
  slewNominal: 90,      // deg/s
  lockAngleAcquireTime: 1.0,
  heaterOn: 5, heaterOff: 15,
  fanOn: 45, fanOff: 38,
  heaterRate: 0.9, selfHeatRate: 0.35, fanRate: 1.4, thermalSpeedup: 6,
};

const SCENARIOS = {
  '1':{name:'STRAIGHT APPROACH', short:'Straight Approach'},
  '2':{name:'LEFT → RIGHT', short:'Left → Right'},
  '3':{name:'RIGHT → LEFT', short:'Right → Left'},
  '4':{name:'CLIMBING', short:'Climbing'},
  '5':{name:'MANEUVER', short:'Evasive Maneuver'},
  '6':{name:'DIVING ATTACK', short:'Diving Attack'},
  '7':{name:'HOVER / ISR', short:'Hover / Loiter'},
  '8':{name:'CIRCULAR ORBIT', short:'Orbit / Racetrack'},
  '9':{name:'ERRATIC / JAM-EVADE', short:'Erratic / Jam-Evade'},
  '0':{name:'SWARM INCURSION ×3', short:'Swarm ×3'},
};
const SCEN_ORDER = ['1','2','3','4','5','6','7','8','9','0'];

/* ---------------- helpers ---------------- */
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const rand=(a,b)=>a+Math.random()*(b-a);
const deg=THREE.MathUtils.radToDeg, rad=THREE.MathUtils.degToRad;
function polar(rangeM,bearingDeg){const r=rad(bearingDeg);return {x:rangeM*Math.sin(r), z:rangeM*Math.cos(r)};}
function combineAxis(rangeM,lateralM,bearingDeg){
  const r=rad(bearingDeg);
  const fx=Math.sin(r), fz=Math.cos(r);
  const px=Math.cos(r), pz=-Math.sin(r);
  return {x:rangeM*fx+lateralM*px, z:rangeM*fz+lateralM*pz};
}

/* ---------------- global state ---------------- */
const state = {
  simTime:0, paused:false, dataSource:'SIM', randomMode:false, randomNextAt:0,
  currentScenario:'1', scenarioStartTime:0, respawnAt:null,
  lockState:'SEARCHING', acquireTimer:0, lostTimer:0, lostUntil:0,
  lossCheckAcc:0, neutralizeTimer:0,
  primary:null, activeDrones:[],
  telemetryAcc:0,
};

const env = {
  altitude:4500, ambientTemp:-14.3, pressureKPa:57.7, densityRatio:0.63,
  compTemp:-14.3, heaterOn:false, fanOn:false, forceLoad:false,
  windSpeed:6, dustActive:false, dustLevel:5,
  history:[], histAcc:0,
};

/* ---------------- DOM refs ---------------- */
const $=id=>document.getElementById(id);
// Event log panel was intentionally removed from the tracking view to reduce
// clutter. log() is kept as a no-op sink (rather than deleting every call
// site) so future contributors can re-attach a panel by adding a #logList
// element back into the DOM.
const logList=$('logList');
function log(text, level){
  if(!logList) return;
  level=level||'info';
  const row=document.createElement('div');
  row.className='log-item '+level;
  const tt = state.simTime;
  const mm=String(Math.floor(tt/60)).padStart(2,'0'), ss=String(Math.floor(tt%60)).padStart(2,'0');
  row.innerHTML = '<span class="lt">T+'+mm+':'+ss+'</span>'+text;
  logList.appendChild(row);
  while(logList.children.length>50) logList.removeChild(logList.firstChild);
  logList.scrollTop=logList.scrollHeight;
}
function toast(msg){
  const t=$('toast'); t.textContent=msg; t.classList.add('show');
  clearTimeout(toast._h); toast._h=setTimeout(()=>t.classList.remove('show'),1800);
}

/* =========================================================================
   THREE.js SCENE — main tracking viewport
   ========================================================================= */
const canvas = $('mainCanvas');
const renderer = new THREE.WebGLRenderer({canvas, antialias:true});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a1119);
scene.fog = new THREE.Fog(0x0a1119, 160, 460);

const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 2000);
const camState = {theta:0.75, phi:1.05, radius:100, target:new THREE.Vector3(0,14,0)};
function updateCamera(){
  const {theta,phi,radius,target}=camState;
  camera.position.set(
    target.x + radius*Math.sin(phi)*Math.sin(theta),
    target.y + radius*Math.cos(phi),
    target.z + radius*Math.sin(phi)*Math.cos(theta)
  );
  camera.lookAt(target);
}
updateCamera();

// lights
scene.add(new THREE.AmbientLight(0x3c4f60, 1.0));
const sun = new THREE.DirectionalLight(0xcfe4ff, 0.85);
sun.position.set(120,180,60);
scene.add(sun);

// ground
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(1400,1400),
  new THREE.MeshStandardMaterial({color:0x0c1620, roughness:1})
);
ground.rotation.x=-Math.PI/2;
scene.add(ground);
const grid = new THREE.GridHelper(400,40,0x223342,0x152030);
grid.position.y=0.03;
scene.add(grid);

// range rings
function makeRing(radius,color,opacity,dashed){
  const pts=[]; const N=96;
  for(let i=0;i<=N;i++){const a=(i/N)*Math.PI*2; pts.push(new THREE.Vector3(radius*Math.sin(a),0.05,radius*Math.cos(a)));}
  const g=new THREE.BufferGeometry().setFromPoints(pts);
  const m = dashed ? new THREE.LineDashedMaterial({color,opacity,transparent:true,dashSize:4,gapSize:3})
                    : new THREE.LineBasicMaterial({color,opacity,transparent:true});
  const line=new THREE.Line(g,m);
  if(dashed) line.computeLineDistances();
  scene.add(line);
  return line;
}
makeRing(CFG.radarRange, 0x2fe6c4, 0.28, false);
makeRing(CFG.eoRange, 0xffb020, 0.35, true);

// mountains backdrop
const mountainGroup = new THREE.Group();
for(let i=0;i<16;i++){
  const a = (i/16)*Math.PI*2 + rand(-0.15,0.15);
  const r = rand(340,430);
  const h = rand(50,120);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(rand(60,110),h,4), new THREE.MeshStandardMaterial({color:0x18232e,flatShading:true,roughness:1}));
  cone.position.set(r*Math.sin(a), h/2, r*Math.cos(a));
  cone.rotation.y=rand(0,Math.PI);
  mountainGroup.add(cone);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(rand(60,110)*0.4,h*0.35,4), new THREE.MeshStandardMaterial({color:0xaebccb,flatShading:true,roughness:1}));
  cap.position.set(cone.position.x, h*0.86, cone.position.z);
  cap.rotation.y=cone.rotation.y;
  mountainGroup.add(cap);
}
scene.add(mountainGroup);

/* ---------------- station / gimbal model ---------------- */
const stationGroup = new THREE.Group();
scene.add(stationGroup);

const base = new THREE.Mesh(new THREE.CylinderGeometry(1.5,1.7,0.35,16), new THREE.MeshStandardMaterial({color:0x1f5f7a,metalness:.4,roughness:.5}));
base.position.y=0.18;
stationGroup.add(base);

const mast = new THREE.Mesh(new THREE.BoxGeometry(0.22,CFG.mastHeight,0.22), new THREE.MeshStandardMaterial({color:0x2d7a99,metalness:.4,roughness:.45}));
mast.position.y = CFG.mastHeight/2 + 0.35;
stationGroup.add(mast);

// radar panel (search sweep)
const radarGroup = new THREE.Group();
radarGroup.position.set(0.55, 1.15, 0);
stationGroup.add(radarGroup);
const radarPanel = new THREE.Mesh(new THREE.BoxGeometry(0.75,0.75,0.08), new THREE.MeshStandardMaterial({color:0x1c2a36,emissive:0x0f3a34,emissiveIntensity:0.4,metalness:.4,roughness:.4}));
radarGroup.add(radarPanel);

// radar sweep wedge on ground
const sweepGeo = new THREE.RingGeometry(2, CFG.radarRange, 48, 1, 0, Math.PI/7);
const sweepMat = new THREE.MeshBasicMaterial({color:0x2fe6c4, transparent:true, opacity:0.10, side:THREE.DoubleSide});
const sweepMesh = new THREE.Mesh(sweepGeo, sweepMat);
sweepMesh.rotation.x=-Math.PI/2;
sweepMesh.position.y=0.06;
scene.add(sweepMesh);

// gimbal head: mastTop -> yaw -> pitch -> dome
const mastTop = new THREE.Group();
mastTop.position.y = CFG.mastHeight + 0.35;
stationGroup.add(mastTop);
const yawGroup = new THREE.Group();
mastTop.add(yawGroup);
const pitchGroup = new THREE.Group();
yawGroup.add(pitchGroup);

const yawHousing = new THREE.Mesh(new THREE.CylinderGeometry(0.26,0.28,0.22,16), new THREE.MeshStandardMaterial({color:0x1f5f7a,metalness:.45,roughness:.45}));
pitchGroup.add(yawHousing);
const dome = new THREE.Mesh(new THREE.SphereGeometry(0.19,20,16), new THREE.MeshStandardMaterial({color:0x0e1a22,emissive:0x2fe6c4,emissiveIntensity:0.25,metalness:.2,roughness:.15}));
dome.position.set(0,0,0.22);
pitchGroup.add(dome);
const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,0.12,10), new THREE.MeshBasicMaterial({color:0x000000}));
lens.rotation.x=Math.PI/2;
lens.position.set(0,0,0.38);
pitchGroup.add(lens);

// lock beam line (station lens -> target)
const beamGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]);
const beamMat = new THREE.LineBasicMaterial({color:0x2fe6c4, transparent:true, opacity:0.0});
const beamLine = new THREE.Line(beamGeo, beamMat);
scene.add(beamLine);

/* ---------------- drone factory ---------------- */
const DRONE_BODY_COLOR = 0xff5a36; // bold ember-orange, distinct from the steel-blue station
function makeDrone(navColor){
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(1.05,0), new THREE.MeshStandardMaterial({color:DRONE_BODY_COLOR, roughness:.55, metalness:.15}));
  g.add(body);
  const nav = new THREE.Mesh(new THREE.SphereGeometry(0.16,8,8), new THREE.MeshBasicMaterial({color:navColor}));
  nav.position.set(0,0.36,0);
  g.add(nav); g.userData.nav=nav;
  const arms=[]; const rotors=[];
  for(let i=0;i<4;i++){
    const ang = Math.PI/4 + i*Math.PI/2;
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.08,0.08,2.4,6), new THREE.MeshStandardMaterial({color:0x33393f}));
    arm.rotation.z=Math.PI/2; arm.rotation.y=ang;
    g.add(arm);
    const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.58,0.58,0.045,10), new THREE.MeshStandardMaterial({color:0x1b1f24,transparent:true,opacity:.75}));
    rotor.position.set(Math.cos(ang)*1.2, 0.14, Math.sin(ang)*1.2);
    g.add(rotor); rotors.push(rotor);
  }
  g.userData.rotors=rotors;
  // trail
  const maxPts=60;
  const trailGeo=new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(maxPts*3),3));
  trailGeo.setDrawRange(0,0);
  const trailMat=new THREE.LineBasicMaterial({color:navColor, transparent:true, opacity:0.5});
  const trailLine=new THREE.Line(trailGeo,trailMat);
  scene.add(trailLine);
  return {group:g, trailLine, trailGeo, pts:[], maxPts, userData:{}};
}
function clearDrones(){
  state.activeDrones.forEach(d=>{
    scene.remove(d.group); scene.remove(d.trailLine);
  });
  state.activeDrones=[];
}
function ensureDroneCount(n, colorFn){
  while(state.activeDrones.length<n){
    const d=makeDrone(colorFn(state.activeDrones.length));
    scene.add(d.group);
    state.activeDrones.push(d);
  }
  while(state.activeDrones.length>n){
    const d=state.activeDrones.pop();
    scene.remove(d.group); scene.remove(d.trailLine);
  }
}
function setDronePos(d,x,y,z){
  d.group.position.set(x,y,z);
  d.pts.push(new THREE.Vector3(x,y,z));
  if(d.pts.length>d.maxPts) d.pts.shift();
  const arr=new Float32Array(d.pts.length*3);
  for(let i=0;i<d.pts.length;i++){arr[i*3]=d.pts[i].x;arr[i*3+1]=d.pts[i].y;arr[i*3+2]=d.pts[i].z;}
  d.trailGeo.setAttribute('position', new THREE.BufferAttribute(arr,3));
  d.trailGeo.setDrawRange(0,d.pts.length);
  d.trailGeo.attributes.position.needsUpdate=true;
}

/* ---------------- scenario position functions ---------------- */
function pattern1(t,bearing){
  const period=20, tt=((t%period)+period)%period;
  let range,alt;
  if(tt<16){const f=tt/16; range=275-242*f; alt=50-27*f;} else {range=33; alt=22;}
  const p=polar(range,bearing); return {x:p.x,y:alt,z:p.z};
}
function pattern2(t){
  const period=18, tt=((t%period)+period)%period;
  const x=-192+385*(tt/period);
  const z=143-22*Math.sin(Math.PI*tt/period);
  const y=38+4*Math.sin(tt*1.3);
  return {x,y,z};
}
function pattern3(t){
  const period=18, tt=((t%period)+period)%period;
  const x=192-385*(tt/period);
  const z=143-22*Math.sin(Math.PI*tt/period);
  const y=38+4*Math.sin(tt*1.3);
  return {x,y,z};
}
function pattern4(t,bearing){
  const period=20, tt=((t%period)+period)%period;
  const f=tt/period;
  const range=264-209*f, alt=14+165*f;
  const p=polar(range,bearing); return {x:p.x,y:alt,z:p.z};
}
function pattern5(t,bearing){
  const period=22, tt=((t%period)+period)%period;
  const f=tt/period;
  const baseRange=220-165*f;
  const lateral=72*Math.sin(tt*0.9);
  const p=combineAxis(baseRange,lateral,bearing);
  const y=33+19*Math.sin(tt*1.6+1);
  return {x:p.x,y,z:p.z};
}
function pattern6(t,bearing){
  const period=14, tt=((t%period)+period)%period;
  const f=tt/period, f2=Math.pow(f,1.4);
  const range=220-209*f2, alt=Math.max(143-132*f2,5);
  const p=polar(range,bearing); return {x:p.x,y:alt,z:p.z};
}
function patternHover(t){
  const spawn=polar(275,60), hover=polar(121,60);
  const blend=Math.min(t/6,1);
  const s=blend*blend*(3-2*blend); // smoothstep
  const x=lerp(spawn.x,hover.x,s), z=lerp(spawn.z,hover.z,s);
  const y=lerp(77,50,s);
  const jx=3*Math.sin(t*0.7)+2*Math.sin(t*1.9);
  const jz=3*Math.cos(t*0.65)+2*Math.cos(t*2.3);
  const jy=2*Math.sin(t*1.2);
  return {x:x+jx*s, y:y+jy*s, z:z+jz*s};
}
function pattern8(t){
  const period=30;
  const a=(t/period)*Math.PI*2;
  const radius=143;
  return {x:radius*Math.sin(a), y:77+6*Math.sin(t*0.5), z:radius*Math.cos(a)};
}
function updateErratic(d, dt, simTime){
  const ud=d.userData;
  if(ud.pos===undefined){
    const sp=polar(248,80);
    ud.pos=new THREE.Vector3(sp.x,50,sp.z);
    ud.nextChange=0;
  }
  if(simTime>ud.nextChange){
    ud.waypoint={x:rand(-155,155), y:rand(25,105), z:rand(66,231)};
    ud.nextChange=simTime+rand(1.4,2.8);
  }
  const speed=26;
  const dx=ud.waypoint.x-ud.pos.x, dy=ud.waypoint.y-ud.pos.y, dz=ud.waypoint.z-ud.pos.z;
  const dist=Math.sqrt(dx*dx+dy*dy+dz*dz);
  if(dist>0.01){
    const step=Math.min(dist,speed*dt)/dist;
    ud.pos.x+=dx*step; ud.pos.y+=dy*step; ud.pos.z+=dz*step;
  }
  return {x:ud.pos.x,y:ud.pos.y,z:ud.pos.z};
}

/* ---------------- gimbal tracking ---------------- */
let gimbalYaw=0, gimbalPitch=0.15;
let prevRange=null;
let neutralizeDrone=null;

function operationalLoadFactor(){
  if(env.forceLoad) return 1.4;
  if(state.lockState==='LOCKED'||state.lockState==='ACQUIRING'||state.lockState==='NEUTRALIZING') return 1.0;
  return 0.4;
}

function lockLossChancePerSec(){
  const wind=env.windSpeed;
  const dustF=env.dustActive?1.6:1.0;
  return 0.0012*(1+wind/8)*dustF;
}

function pointingErrorMicrorad(){
  const base=8 + env.windSpeed*1.4 + (env.dustActive?3:0) + Math.max(0,(-20-env.ambientTemp))*0.5;
  return base + rand(-2,2);
}

function currentSlewRate(){
  const t=env.ambientTemp;
  return CFG.slewNominal - clamp((-10-t),0,40)*0.6;
}

/* ---------------- scenario switching ---------------- */
function colorForScenario(){
  if(state.currentScenario==='6'||state.currentScenario==='0') return 0xff6b52;
  if(state.currentScenario==='5'||state.currentScenario==='9') return 0xffb020;
  if(state.currentScenario==='7'||state.currentScenario==='8') return 0x7fd8ff;
  return 0x2fe6c4;
}
function setScenario(id, silent){
  state.currentScenario=id;
  state.scenarioStartTime=state.simTime;
  state.respawnAt=null;
  clearDrones();
  const n = id==='0' ? 3 : 1;
  const col=colorForScenario();
  ensureDroneCount(n, i=>[0x2fe6c4,0xffb020,0xff6b52][i%3]);
  state.activeDrones.forEach(d=>{d.userData={}; d.pts=[];});
  state.lockState='SEARCHING';
  state.acquireTimer=0;
  document.querySelectorAll('.scen-btn').forEach(b=>b.classList.toggle('active', b.dataset.k===id));
  $('hudScenario').textContent = id + ' · ' + SCENARIOS[id].name;
  if(!silent) log('SCENARIO CHANGE → <b>'+SCENARIOS[id].short+'</b>', 'info');
}

function computeDronesData(t,dt){
  const id=state.currentScenario;
  if(id==='0'){
    const p1=pattern1(t,35), p2=pattern1(t-7,-60), p3=pattern6(Math.max(t-3,0),160);
    return [ {...p1,tid:'TGT-11'}, {...p2,tid:'TGT-12'}, {...p3,tid:'TGT-13'} ];
  }
  if(id==='7') return [{...patternHover(t), tid:'TGT-07'}];
  if(id==='9') return [{...updateErratic(state.activeDrones[0]||{userData:{}},dt,state.simTime), tid:'TGT-09'}];
  const map={
    '1':()=>pattern1(t,35), '2':()=>pattern2(t), '3':()=>pattern3(t),
    '4':()=>pattern4(t,200), '5':()=>pattern5(t,110), '6':()=>pattern6(t,310),
    '8':()=>pattern8(t),
  };
  const fn=map[id]||map['1'];
  return [{...fn(), tid:'TGT-0'+id}];
}

/* ---------------- lock state machine + neutralize ---------------- */
function tryEngage(){
  if(state.lockState!=='LOCKED'){ toast('Cannot engage — no valid target lock.'); return; }
  state.lockState='NEUTRALIZING';
  state.neutralizeTimer=0;
  neutralizeDrone=state.primary;
  log('ENGAGE COMMAND — RF soft-kill jammer activated on <b>'+(neutralizeDrone?neutralizeDrone.tid:'target')+'</b>','crit');
}

/* =========================================================================
   CV inset (second camera / renderer)
   ========================================================================= */
const cvCanvas=$('cvCanvas'), cvOverlay=$('cvOverlay');
const cvRenderer=new THREE.WebGLRenderer({canvas:cvCanvas, antialias:true});
cvRenderer.setPixelRatio(1);
cvRenderer.setSize(320,192,false);
const cvCamera=new THREE.PerspectiveCamera(24, 320/192, 0.1, 1500);
pitchGroup.add(cvCamera);
cvCamera.position.set(0,0,0.32);
cvCamera.rotation.set(0,Math.PI,0);
const cvCtx=cvOverlay.getContext('2d');

function drawCvOverlay(){
  const w=cvOverlay.width,h=cvOverlay.height;
  cvCtx.clearRect(0,0,w,h);
  cvCtx.strokeStyle='rgba(47,230,196,0.3)';
  cvCtx.lineWidth=1;
  const cx=w/2, cy=h/2, tick=12;
  cvCtx.beginPath();
  cvCtx.moveTo(cx-tick,cy); cvCtx.lineTo(cx-4,cy);
  cvCtx.moveTo(cx+4,cy); cvCtx.lineTo(cx+tick,cy);
  cvCtx.moveTo(cx,cy-tick); cvCtx.lineTo(cx,cy-4);
  cvCtx.moveTo(cx,cy+4); cvCtx.lineTo(cx,cy+tick);
  cvCtx.stroke();

  cvCtx.font='11px "IBM Plex Mono", monospace';
  cvCtx.fillStyle='rgba(47,230,196,0.9)';
  cvCtx.fillText(state.dataSource==='SIM' ? 'MODE: OPENCV-SIM' : 'MODE: HARDWARE', 8, 14);
  const mm=String(Math.floor(state.simTime/60)).padStart(2,'0'), ss=String(Math.floor(state.simTime%60)).padStart(2,'0');
  cvCtx.fillText('T+'+mm+':'+ss, w-70, 14);

  if(state.dataSource!=='SIM'){
    cvCtx.fillStyle='rgba(255,255,255,0.5)';
    cvCtx.font='12px "IBM Plex Mono", monospace';
    cvCtx.fillText('NO SIGNAL — AWAITING GigE CAMERA', 40, h/2-6);
    cvCtx.fillText('(connect on-site to replace feed)', 46, h/2+10);
    return;
  }

  if(!state.primary || state.lockState==='SEARCHING'){
    cvCtx.fillStyle='rgba(255,77,77,0.8)';
    cvCtx.fillText('NO TARGET IN FOV — SEARCHING', 46, h/2);
    return;
  }
  const p=state.primary;
  const wp=new THREE.Vector3(p.x,p.y,p.z);
  const ndc=wp.clone().project(cvCamera);
  if(ndc.z>1 || ndc.z<-1 || Math.abs(ndc.x)>1.15 || Math.abs(ndc.y)>1.15){
    cvCtx.fillStyle='rgba(255,176,32,0.85)';
    cvCtx.fillText('TARGET OUTSIDE CAMERA FOV', 50, h/2);
    return;
  }
  const sx=(ndc.x*0.5+0.5)*w, sy=(1-(ndc.y*0.5+0.5))*h;
  const dist=Math.max(p.range||40,10);
  const box=clamp(5200/dist,30,140);
  // Green while the target is merely detected/acquiring, turns red once a firm lock is established.
  const col = (state.lockState==='LOCKED' || state.lockState==='NEUTRALIZING') ? '#ff3b30' : '#3ddc84';
  cvCtx.strokeStyle=col; cvCtx.lineWidth=1.8;
  cvCtx.strokeRect(sx-box/2, sy-box/2, box, box);
  cvCtx.beginPath(); cvCtx.moveTo(sx-box/2-6,sy); cvCtx.lineTo(sx-box/2,sy); cvCtx.stroke();
  cvCtx.beginPath(); cvCtx.moveTo(sx+box/2,sy); cvCtx.lineTo(sx+box/2+6,sy); cvCtx.stroke();
  cvCtx.fillStyle=col; cvCtx.font='11px "IBM Plex Mono", monospace';
  const conf = (0.99-Math.min(dist/600,0.4)-(env.dustActive?0.18:0)).toFixed(2);
  cvCtx.fillText(p.tid+' '+conf, sx-box/2, sy-box/2-5);
  $('cvConf').textContent=(conf*100).toFixed(0)+'%';
}

/* =========================================================================
   Custom orbit-drag camera controls
   ========================================================================= */
let dragging=false, lastX=0,lastY=0;
canvas.addEventListener('mousedown', e=>{dragging=true; lastX=e.clientX; lastY=e.clientY;});
window.addEventListener('mouseup', ()=>dragging=false);
window.addEventListener('mousemove', e=>{
  if(!dragging) return;
  const dx=e.clientX-lastX, dy=e.clientY-lastY;
  lastX=e.clientX; lastY=e.clientY;
  camState.theta -= dx*0.006;
  camState.phi = clamp(camState.phi - dy*0.006, 0.2, 1.45);
  updateCamera();
});
canvas.addEventListener('wheel', e=>{
  e.preventDefault();
  camState.radius = clamp(camState.radius*(1+e.deltaY*0.001), 30, 220);
  updateCamera();
}, {passive:false});
let touchLast=null;
canvas.addEventListener('touchstart', e=>{if(e.touches.length===1) touchLast={x:e.touches[0].clientX,y:e.touches[0].clientY};});
canvas.addEventListener('touchmove', e=>{
  if(e.touches.length===1 && touchLast){
    const dx=e.touches[0].clientX-touchLast.x, dy=e.touches[0].clientY-touchLast.y;
    touchLast={x:e.touches[0].clientX,y:e.touches[0].clientY};
    camState.theta -= dx*0.006;
    camState.phi=clamp(camState.phi-dy*0.006,0.2,1.45);
    updateCamera();
  }
}, {passive:true});

/* =========================================================================
   Environmental / thermal model
   ========================================================================= */
function recomputeAtmosphere(){
  const h=env.altitude;
  env.ambientTemp = 15 - 6.5*(h/1000);
  env.pressureKPa = 101.325*Math.pow(1-h/44330,5.255);
  const TK=273.15+env.ambientTemp;
  env.densityRatio = (env.pressureKPa/101.325)*(288.15/TK);
  $('roAlt').textContent = h+' m';
  $('roTemp').textContent = env.ambientTemp.toFixed(1)+'°C';
  $('roPress').textContent = env.pressureKPa.toFixed(1)+' kPa';
  $('roDensity').textContent = Math.round(env.densityRatio*100)+'%';
  $('hudAlt').textContent = h;
}
function updateThermal(dt){
  let d = (env.ambientTemp-env.compTemp)*0.05;
  if(env.compTemp<CFG.heaterOn) env.heaterOn=true;
  if(env.compTemp>CFG.heaterOff) env.heaterOn=false;
  if(env.heaterOn) d += CFG.heaterRate;
  const load=operationalLoadFactor();
  d += load*CFG.selfHeatRate;
  if(env.compTemp>CFG.fanOn) env.fanOn=true;
  if(env.compTemp<CFG.fanOff) env.fanOn=false;
  if(env.fanOn) d -= CFG.fanRate*Math.max(env.densityRatio,0.35);

  const prevHeater=env._prevHeater, prevFan=env._prevFan;
  env.compTemp = clamp(env.compTemp + d*dt*CFG.thermalSpeedup, -60, 95);
  if(prevHeater!==undefined && prevHeater!==env.heaterOn){
    log(env.heaterOn ? 'NTC: component temp '+env.compTemp.toFixed(1)+'°C dropped to ~'+CFG.heaterOn+'°C → <b>HEATER ON</b>'
                      : 'NTC: component temp '+env.compTemp.toFixed(1)+'°C rose to ~'+CFG.heaterOff+'°C → HEATER OFF', env.heaterOn?'warn':'good');
  }
  if(prevFan!==undefined && prevFan!==env.fanOn){
    log(env.fanOn ? 'NTC: component temp '+env.compTemp.toFixed(1)+'°C above 45°C → <b>COOLING FAN ON</b>'
                  : 'NTC: component temp '+env.compTemp.toFixed(1)+'°C below 38°C → COOLING FAN OFF', env.fanOn?'warn':'good');
  }
  env._prevHeater=env.heaterOn; env._prevFan=env.fanOn;

  // dust ramp
  const target = env.dustActive?850:5;
  env.dustLevel = lerp(env.dustLevel, target, Math.min(dt*1.2,1));

  // history sample
  env.histAcc+=dt;
  if(env.histAcc>0.3){
    env.histAcc=0;
    env.history.push({amb:env.ambientTemp, comp:env.compTemp});
    if(env.history.length>110) env.history.shift();
  }
}

function tempToColor(v){
  if(v<CFG.heaterOn) return '#7fd8ff';
  if(v<CFG.fanOn) return '#2fe6c4';
  if(v<CFG.fanOn+12) return '#ffb020';
  return '#ff4d4d';
}

function drawTempChart(){
  const c=$('tempChart'); const ctx=c.getContext('2d');
  const w=c.width, hgt=c.height;
  ctx.clearRect(0,0,w,hgt);
  const minT=-50,maxT=95;
  const yFor=v=>hgt-((v-minT)/(maxT-minT))*hgt;
  // grid
  ctx.strokeStyle='rgba(255,255,255,0.08)'; ctx.lineWidth=1; ctx.font='10px "IBM Plex Mono",monospace'; ctx.fillStyle='#8caabb';
  [-40,-20,0,20,40,60,80].forEach(v=>{
    const y=yFor(v);
    ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke();
    ctx.fillText(v+'°',4,y-2);
  });
  // thresholds
  function thresh(v,color,label){
    const y=yFor(v);
    ctx.setLineDash([4,3]); ctx.strokeStyle=color; ctx.globalAlpha=0.55;
    ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke();
    ctx.globalAlpha=1; ctx.setLineDash([]);
    ctx.fillStyle=color; ctx.fillText(label,w-58,y-2);
  }
  thresh(CFG.heaterOn,'#7fd8ff','HTR ON');
  thresh(CFG.heaterOff,'#7fd8ff','HTR OFF');
  thresh(CFG.fanOn,'#ff9d4d','FAN ON');
  thresh(CFG.fanOff,'#ff9d4d','FAN OFF');

  const hist=env.history;
  if(hist.length>1){
    // ambient dashed
    ctx.setLineDash([3,3]); ctx.strokeStyle='#5b8aa8'; ctx.lineWidth=1.4; ctx.beginPath();
    hist.forEach((s,i)=>{const x=(i/(hist.length-1))*w, y=yFor(s.amb); i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);});
    ctx.stroke(); ctx.setLineDash([]);
    // component solid
    ctx.strokeStyle=tempToColor(env.compTemp); ctx.lineWidth=2; ctx.beginPath();
    hist.forEach((s,i)=>{const x=(i/(hist.length-1))*w, y=yFor(s.comp); i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);});
    ctx.stroke();
    const lastX=w, lastY=yFor(hist[hist.length-1].comp);
    ctx.fillStyle=tempToColor(env.compTemp);
    ctx.beginPath(); ctx.arc(lastX-3,lastY,3.5,0,Math.PI*2); ctx.fill();
  }
}

function updateThermalUI(){
  $('thermoVal').textContent=env.compTemp.toFixed(1)+'°C';
  const pct=clamp((env.compTemp+50)/(95+50),0,1);
  const fill=$('thermoFill');
  fill.style.height=(pct*100)+'%';
  fill.style.background=tempToColor(env.compTemp);
  $('indHeater').classList.toggle('active', env.heaterOn);
  $('indFan').classList.toggle('active', env.fanOn);
  $('heaterState').textContent = env.heaterOn?'ON — warming enclosure':'OFF';
  $('fanState').textContent = env.fanOn?'ON — forced-air cooling':'OFF';

  let note;
  if(env.history.length>4){
    const a=env.history[env.history.length-5].comp, b=env.compTemp;
    const slope=(b-a)/ (5*0.3);
    if(env.heaterOn && slope>0.01){ const s=(CFG.heaterOff-b)/slope; note='Predicted heater cutoff in ~'+Math.max(s,0).toFixed(0)+'s'; }
    else if(env.fanOn && slope<-0.01){ const s=(CFG.fanOff-b)/slope; note='Predicted fan cutoff in ~'+Math.max(s,0).toFixed(0)+'s'; }
    else if(!env.heaterOn && !env.fanOn && slope<-0.01){ const s=(CFG.heaterOn-b)/slope; note='Trending toward heater threshold in ~'+Math.max(s,0).toFixed(0)+'s'; }
    else if(!env.heaterOn && !env.fanOn && slope>0.01){ const s=(CFG.fanOn-b)/slope; note='Trending toward fan threshold in ~'+Math.max(s,0).toFixed(0)+'s'; }
    else note='Component temperature stable.';
  } else note='Gathering thermal trend…';
  $('predictNote').textContent=note;
}

function updatePressureDustWindUI(){
  $('pdwPress').textContent='ΔP ≈ 0 kPa';
  $('pressStatus').textContent = 'HARDWARE HOLDING SEAL — Gore vent equalized · '+env.pressureKPa.toFixed(1)+' kPa ('+Math.round((env.pressureKPa/101.325)*100)+'% sea level)';
  const densityPct = Math.round(env.densityRatio*100);
  $('pressNote').textContent = 'Air density '+densityPct+'% of sea level — the vent lets internal/external pressure equalize passively (no seal stress, no fogging), while the fan controller runs a longer duty cycle to make up for thinner cooling air.'
    + (env.ambientTemp<-20 ? ' Battery heater pad drawing standby current to preserve cold-weather capacity.' : '');

  $('dustReadout').textContent=Math.round(env.dustLevel)+' µg/m³';
  $('dustBar').style.width=clamp(env.dustLevel/900*100,1,100)+'%';
  $('dustBtn').classList.toggle('on', env.dustActive);
  $('dustStatus').textContent = env.dustActive
    ? 'HARDWARE RESPONDING — purge fan pressurizing enclosure, lens wiper active, 0 ingress'
    : 'HARDWARE HOLDING SEAL — IP6X enclosure closed, 0 ingress detected';
  $('dustNote').textContent = env.dustActive
    ? 'The sealed shell keeps particulate out of the electronics bay; the auto-wiper clears the lens cover but EO confidence still dips ~15–20% in blowing dust, so the fusion tracker leans on the RADAR channel (unaffected by dust) to keep the lock.'
    : 'No particulate ingress — enclosure gasket and lens cover are doing their job with no active intervention needed right now.';

  $('windReadout').textContent=env.windSpeed+' m/s';
  const comp=(env.windSpeed*2.3).toFixed(1);
  $('windComp').textContent=comp+' N·m';
  const perr=pointingErrorMicrorad();
  const errEl=$('windErr');
  errEl.textContent=perr.toFixed(0)+' µrad (spec <50)';
  errEl.style.color = perr>50 ? 'var(--red)' : perr>35 ? 'var(--amber)' : 'var(--teal)';
  const slew=currentSlewRate().toFixed(0);
  $('windStatus').textContent = perr>50
    ? 'HARDWARE STRAINING — direct-drive motors at higher counter-torque, gain increasing'
    : 'HARDWARE COMPENSATING — direct-drive motors counter-torquing wind in real time';
  $('windNote').textContent = perr>50
    ? 'The pan/tilt motors and encoder feedback loop are actively pushing back against wind loading, but at '+env.windSpeed+' m/s the residual error has crept above the 50 µrad spec — this is the physical limit the mechanical design is pushing against, not a software gap.'
    : 'Encoder feedback lets the '+slew+'°/s-rated motors correct for wind-induced vibration many times a second, keeping the residual pointing error comfortably inside the 50 µrad spec.';
}

/* =========================================================================
   Telemetry (tracking tab) DOM update
   ========================================================================= */
function updateTelemetryDOM(){
  const p=state.primary;
  const badge=$('lockBadge');
  badge.className='lock-badge '+state.lockState.toLowerCase();
  badge.textContent = state.lockState;

  if(!p){
    $('targetIdTag').textContent='NO TRACK';
    $('tClass').textContent='—'; $('tRange').textContent='— m'; $('tAzEl').textContent='—';
    $('tAlt').textContent='— m'; $('tSpd').textContent='— m/s'; $('tRcs').textContent='— dBsm';
    $('tThreat').textContent='—'; $('tThreat').className='threat-badge threat-LOW';
    $('engageBtn').disabled=true;
    $('rMode').textContent='SEARCH';
    return;
  }
  $('targetIdTag').textContent=p.tid;
  $('tClass').textContent='Quadcopter · Class I (<2kg)';
  $('tRange').textContent=p.range.toFixed(0)+' m';
  $('tAzEl').textContent=p.az.toFixed(1)+'° / '+p.el.toFixed(1)+'°';
  $('tAlt').textContent=p.y.toFixed(0)+' m AGL';
  $('tSpd').textContent=(p.closing>=0?'−':'+')+Math.abs(p.closing).toFixed(1)+' m/s';
  $('tRcs').textContent='-'+(8+Math.round(p.range/33))+' dBsm';
  let lvl='LOW';
  if(p.range<66) lvl='CRITICAL'; else if(p.range<137) lvl='HIGH'; else if(p.range<275) lvl='MEDIUM';
  $('tThreat').textContent=lvl; $('tThreat').className='threat-badge threat-'+lvl;
  $('engageBtn').disabled = state.lockState!=='LOCKED';
  $('rMode').textContent = (state.lockState==='LOCKED'||state.lockState==='NEUTRALIZING') ? 'TRACK':'SEARCH';

  $('gPan').textContent=deg(gimbalYaw).toFixed(1)+'°';
  $('gTilt').textContent=deg(gimbalPitch).toFixed(1)+'°';
  $('gSlew').textContent=currentSlewRate().toFixed(0)+'°/s';
  $('gErr').textContent=pointingErrorMicrorad().toFixed(0)+' µrad';
}

/* =========================================================================
   Main animation loop
   ========================================================================= */
const clock=new THREE.Clock();
let lossTimerCheck=0;

function animate(){
  requestAnimationFrame(animate);
  let dt=Math.min(clock.getDelta(),0.08);
  if(state.paused) dt=0;
  state.simTime += dt;

  // random-mode auto shuffle
  if(state.randomMode && dt>0 && state.simTime>=state.randomNextAt){
    const pool=SCEN_ORDER.filter(s=>s!==state.currentScenario);
    const pick=pool[Math.floor(Math.random()*pool.length)];
    setScenario(pick, true);
    log('AUTO-SCENARIO (random mode) → <b>'+SCENARIOS[pick].short+'</b>','info');
    state.randomNextAt = state.simTime + rand(9,14);
  }

  // respawn after neutralize
  if(state.respawnAt!==null && state.simTime>=state.respawnAt){
    setScenario(state.currentScenario, true);
    log('Standing by — resuming scenario simulation.', 'info');
  }

  if(dt>0){
    const t=state.simTime-state.scenarioStartTime;
    const dronesData = (state.lockState==='NEUTRALIZING') ? null : computeDronesData(t,dt);

    if(state.lockState==='NEUTRALIZING'){
      state.neutralizeTimer+=dt;
      const nd=state.activeDrones[0];
      if(nd){
        const cur=nd.group.position;
        const fall=Math.min(state.neutralizeTimer/2.2,1);
        setDronePos(nd, cur.x + rand(-0.4,0.4), Math.max(cur.y-fall*22*dt*4,0.3), cur.z + rand(-0.4,0.4));
        nd.group.rotation.x += dt*6; nd.group.rotation.z += dt*4;
      }
      if(state.neutralizeTimer>2.2){
        log('TARGET NEUTRALIZED — soft-kill effective, threat mitigated.', 'crit');
        clearDrones();
        state.primary=null;
        state.lockState='SEARCHING';
        state.respawnAt = state.simTime+1.6;
      }
    } else if(dronesData){
      ensureDroneCount(dronesData.length, i=>[0x2fe6c4,0xffb020,0xff6b52][i%3]);
      dronesData.forEach((dd,i)=>{
        const d=state.activeDrones[i];
        d.tid=dd.tid;
        setDronePos(d, dd.x, dd.y, dd.z);
        const rn=d.userData.nav;
        if(rn) rn.material.opacity = 0.5+0.5*Math.sin(state.simTime*8+i);
        d.group.userData.rotors && d.group.userData.rotors.forEach(r=>r.rotation.y+=dt*40);
      });

      // compute ranges & pick primary
      let best=null;
      dronesData.forEach((dd,i)=>{
        const dx=dd.x, dz=dd.z, dy=dd.y-(CFG.mastHeight+0.35);
        const horiz=Math.sqrt(dx*dx+dz*dz);
        const range=Math.sqrt(horiz*horiz+dy*dy);
        const az=deg(Math.atan2(dx,dz));
        const el=deg(Math.atan2(dy,horiz));
        const rec={...dd, range, az, el, horiz, y:dd.y, closing:0};
        if(!best || range<best.range) best=rec;
      });
      if(prevRange!==null && best){ best.closing = (prevRange-best.range)/Math.max(dt,0.0001); }
      prevRange = best?best.range:null;
      state.primary=best;

      // lock state machine
      if(best && best.range<=CFG.radarRange){
        if(state.lockState==='SEARCHING'){
          state.lockState='ACQUIRING'; state.acquireTimer=0;
          log('RADAR CONTACT — '+best.tid+' at '+best.range.toFixed(0)+' m','info');
        } else if(state.lockState==='ACQUIRING'){
          state.acquireTimer+=dt;
          if(best.range<=CFG.eoRange && state.acquireTimer>CFG.lockAngleAcquireTime){
            state.lockState='LOCKED';
            log('TARGET LOCK ESTABLISHED — '+best.tid,'good');
          }
        } else if(state.lockState==='LOCKED'){
          lossTimerCheck+=dt;
          if(lossTimerCheck>=1){
            lossTimerCheck=0;
            if(Math.random()<lockLossChancePerSec()){
              state.lockState='LOST'; state.lostTimer=0; state.lostUntil=rand(1.5,3.0);
              log('TRACK LOST — environmental disturbance, reacquiring…','warn');
            }
          }
        } else if(state.lockState==='LOST'){
          state.lostTimer+=dt;
          if(state.lostTimer>=state.lostUntil){
            state.lockState='ACQUIRING'; state.acquireTimer=CFG.lockAngleAcquireTime; // fast reacquire
            log('REACQUIRED — resuming track on '+best.tid,'good');
          }
        }
      } else {
        state.lockState='SEARCHING'; state.primary=null;
      }

      // gimbal tracking angles
      if(best){
        const targetYaw=rad(best.az), targetPitch=rad(best.el);
        let dyaw=targetYaw-gimbalYaw;
        while(dyaw>Math.PI) dyaw-=Math.PI*2;
        while(dyaw<-Math.PI) dyaw+=Math.PI*2;
        const maxStep=rad(currentSlewRate())*dt;
        gimbalYaw += clamp(dyaw,-maxStep,maxStep);
        const dpitch=clamp(targetPitch,rad(-15),rad(80))-gimbalPitch;
        gimbalPitch += clamp(dpitch, -maxStep, maxStep);
      }
    }

    // radar visuals
    if(state.lockState==='LOCKED'||state.lockState==='NEUTRALIZING'){
      radarGroup.rotation.y = gimbalYaw;
      sweepMesh.visible=false;
    } else {
      radarGroup.rotation.y += dt*1.4;
      sweepMesh.rotation.y -= dt*1.4;
      sweepMesh.visible=true;
    }
    yawGroup.rotation.y = gimbalYaw;
    pitchGroup.rotation.x = -gimbalPitch;

    // beam line — stops just short of the drone so the drone stays clearly
    // visible as its own object instead of the line running into it
    if(state.primary && (state.lockState==='LOCKED'||state.lockState==='NEUTRALIZING')){
      const lensPos=new THREE.Vector3(); lens.getWorldPosition(lensPos);
      const tgtFull=new THREE.Vector3(state.primary.x, state.primary.y, state.primary.z);
      const dir=tgtFull.clone().sub(lensPos);
      const distLen=dir.length();
      const gap=Math.min(3.5, distLen*0.5);
      const tgt = distLen>0.01 ? lensPos.clone().addScaledVector(dir.normalize(), Math.max(distLen-gap,0)) : tgtFull;
      beamLine.geometry.setFromPoints([lensPos,tgt]);
      beamMat.opacity = state.lockState==='NEUTRALIZING' ? (0.5+0.5*Math.sin(state.simTime*30)) : 0.5;
      beamMat.color.set(state.lockState==='NEUTRALIZING' ? 0xff4d4d : 0x2fe6c4);
    } else {
      beamMat.opacity=0;
    }

    // thermal / env model always runs
    updateThermal(dt);

    // fog / dust visual coupling
    const dustT=clamp(env.dustLevel/850,0,1);
    scene.fog.color.set(new THREE.Color(0x0a1119).lerp(new THREE.Color(0x33291c), dustT));
    scene.fog.far = lerp(460,220,dustT);
    scene.background.set(scene.fog.color);
  }

  // render main
  const wrap=$('viewportWrap');
  const w=wrap.clientWidth, h=wrap.clientHeight;
  if(canvas.width!==w*renderer.getPixelRatio() || canvas.height!==h*renderer.getPixelRatio()){
    renderer.setSize(w,h,true);
    camera.aspect=w/h; camera.updateProjectionMatrix();
  }
  if(document.getElementById('view-tracking').classList.contains('active')){
    renderer.render(scene,camera);
    cvRenderer.render(scene,cvCamera);
    drawCvOverlay();
  }

  // throttled UI updates
  state.telemetryAcc+=dt;
  if(state.telemetryAcc>0.12){
    state.telemetryAcc=0;
    updateTelemetryDOM();
    if(document.getElementById('view-env').classList.contains('active')){
      updateThermalUI(); drawTempChart(); updatePressureDustWindUI();
    }
  }
  // clock
  const mm=String(Math.floor(state.simTime/60)).padStart(2,'0');
  const ss=String(Math.floor(state.simTime%60)).padStart(2,'0');
  const hh=String(Math.floor(state.simTime/3600)).padStart(2,'0');
  $('clockReadout').textContent='T+'+hh+':'+mm+':'+ss;

  // dust fx
  $('dustFx').classList.toggle('on', env.dustActive && document.getElementById('view-env').classList.contains('active'));
}

/* =========================================================================
   UI wiring
   ========================================================================= */
// scenario buttons
const scenGrid=$('scenarioGrid');
SCEN_ORDER.forEach(k=>{
  const b=document.createElement('div');
  b.className='scen-btn'; b.dataset.k=k;
  b.innerHTML='<span class="k">'+k+'</span><span class="l">'+SCENARIOS[k].short+'</span>';
  b.addEventListener('click', ()=>{ state.randomMode=false; $('chipR').classList.remove('on'); setScenario(k); });
  scenGrid.appendChild(b);
});

$('chipR').addEventListener('click', ()=>{
  state.randomMode=!state.randomMode;
  $('chipR').classList.toggle('on', state.randomMode);
  if(state.randomMode){ state.randomNextAt=state.simTime+1; log('RANDOM SCENARIO MODE enabled.','info'); }
  else log('Random scenario mode disabled.','info');
});
$('chipH').addEventListener('click', toggleSource);
$('chipSpace').addEventListener('click', togglePause);
$('chipC').addEventListener('click', resetSession);
$('engageBtn').addEventListener('click', tryEngage);

function toggleSource(){
  state.dataSource = state.dataSource==='SIM' ? 'HW' : 'SIM';
  const pill=$('sourcePill');
  pill.textContent = 'SRC: '+(state.dataSource==='SIM'?'SIMULATION':'HARDWARE');
  pill.className='pill '+(state.dataSource==='SIM'?'sim':'hw');
  $('cvSourceTag').textContent = state.dataSource==='SIM'?'SIM':'HW';
  $('cvCaption').textContent = state.dataSource==='SIM'
    ? 'Synthetic gimbal-camera render used as demo fallback per Scenario Simulation plan. Press H to preview the hardware-feed placeholder.'
    : 'Hardware feed placeholder — on-site this panel streams the live GigE/USB camera output instead of the simulated render.';
  log('Signal source switched to <b>'+(state.dataSource==='SIM'?'OPENCV SIMULATION':'HARDWARE FEED')+'</b>.','info');
}
function togglePause(){
  state.paused=!state.paused;
  $('chipSpace').classList.toggle('on', state.paused);
  $('chipSpace').textContent = state.paused ? '▶ RESUME' : '⎵ PAUSE';
  log(state.paused?'Simulation paused.':'Simulation resumed.', 'info');
}
function resetSession(){
  state.randomMode=false; $('chipR').classList.remove('on');
  state.paused=false; $('chipSpace').classList.remove('on'); $('chipSpace').textContent='⎵ PAUSE';
  if(logList) logList.innerHTML='';
  setScenario('1');
  log('Session reset.','info');
}

document.querySelectorAll('.tab-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    const tab=btn.dataset.tab;
    document.getElementById('view-tracking').classList.toggle('active', tab==='tracking');
    document.getElementById('view-env').classList.toggle('active', tab==='env');
  });
});

// keyboard
window.addEventListener('keydown', e=>{
  if(e.target && (e.target.tagName==='INPUT')) return;
  const k=e.key.toLowerCase();
  if(SCEN_ORDER.includes(e.key)){ state.randomMode=false; $('chipR').classList.remove('on'); setScenario(e.key); }
  else if(k==='r') $('chipR').click();
  else if(k==='h') toggleSource();
  else if(k==='n') tryEngage();
  else if(k===' '){ e.preventDefault(); togglePause(); }
  else if(k==='c') resetSession();
});

// altitude slider
const altSlider=$('altSlider');
altSlider.addEventListener('input', ()=>{ env.altitude=parseInt(altSlider.value,10); recomputeAtmosphere(); });
document.querySelectorAll('.preset-btn').forEach(b=>{
  b.addEventListener('click', ()=>{ altSlider.value=b.dataset.alt; env.altitude=parseInt(b.dataset.alt,10); recomputeAtmosphere(); log('Altitude preset applied: '+b.textContent+'.','info'); });
});
$('windSlider').addEventListener('input', e=>{ env.windSpeed=parseInt(e.target.value,10); });
$('dustBtn').addEventListener('click', ()=>{
  env.dustActive=!env.dustActive;
  log(env.dustActive?'DUST STORM simulation engaged.':'Dust storm cleared.', env.dustActive?'warn':'good');
});
$('loadSwitch').addEventListener('click', ()=>{
  env.forceLoad=!env.forceLoad;
  $('loadSwitch').classList.toggle('on', env.forceLoad);
  log(env.forceLoad?'Manual max-thermal-load stress test engaged.':'Thermal load returned to automatic (tied to lock state).','info');
});

/* ---------------- init ---------------- */
function init(){
  recomputeAtmosphere();
  env.compTemp=env.ambientTemp;
  setScenario('1', true);
  log('ANTI-DRONE SYSTEM console online. Standing by for scenario selection.','good');
  log('Signal source: SIMULATION (press H for hardware placeholder).','info');
  const ro=new ResizeObserver(()=>{});
  ro.observe($('viewportWrap'));
  animate();
}
window.addEventListener('load', init);

})();