(()=>{
'use strict';

/* ---------- Canvas & HUD ---------- */
let WIDTH=1280, HEIGHT=720;
const canvas=document.getElementById('c'); const ctx=canvas.getContext('2d');
const elTime=document.getElementById('time'); const elLv=document.getElementById('lv'); const elExp=document.getElementById('exp'); const elGold=document.getElementById('gold');
const elHPFill=document.getElementById('hpfill');
const ST = {
  HP: document.getElementById('statHP'), SPD: document.getElementById('statSPD'), DMG: document.getElementById('statDMG'),
  AS: document.getElementById('statAS'), RNG: document.getElementById('statRNG'), CC: document.getElementById('statCC'), CM: document.getElementById('statCM')
};
const elShop=document.getElementById('shop'); const elShopGold=document.getElementById('shopGold'); const elShopList=document.getElementById('shopList');
const btnShopClose=document.getElementById('btnShopClose'); const elUpgrade=document.getElementById('upgrade'); const elChoices=document.getElementById('choices');
const btnUpClose=document.getElementById('btnUpClose'); const elPause=document.getElementById('pauseOverlay'); const btnPause=document.getElementById('btnPause'); const btnShop=document.getElementById('btnShop');
const dbg=document.getElementById('dbg');

function fitCanvas(){
  const dpr=window.devicePixelRatio||1;
  WIDTH=window.innerWidth; HEIGHT=window.innerHeight-64;
  if(HEIGHT<300) HEIGHT=window.innerHeight;
  canvas.style.width=WIDTH+'px'; canvas.style.height=HEIGHT+'px';
  canvas.width=Math.floor(WIDTH*dpr); canvas.height=Math.floor(HEIGHT*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
}
window.addEventListener('resize', fitCanvas, {passive:true}); fitCanvas();

/* ---------- Utils ---------- */
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
class V{constructor(x=0,y=0){this.x=x;this.y=y;} add(v){this.x+=v.x;this.y+=v.y;return this;} sub(v){this.x-=v.x;this.y-=v.y;return this;} mul(s){this.x*=s;this.y*=s;return this;} len(){return Math.hypot(this.x,this.y);} norm(){const l=this.len()||1;this.x/=l;this.y/=l;return this;} clone(){return new V(this.x,this.y);}}
function rand(a,b){return a+Math.random()*(b-a);}

/* ---------- Input: invisible touch joystick on canvas ---------- */
const keys=new Set(); window.addEventListener('keydown', e=>{
  const code=e.code; const k=e.key.toLowerCase(); keys.add(k);
  if(code==='Escape'){ togglePause(); e.preventDefault(); }
  if(code==='Tab'){ toggleShop(); e.preventDefault(); }
  if(G.over && k==='r'){ resetGame(); e.preventDefault(); }
}); window.addEventListener('keyup', e=>keys.delete(e.key.toLowerCase()));

let joyActive=false, anchor=null, joyVec={x:0,y:0};
function startTouch(e){ if(G.paused||G.shop||G.showUp||G.over) return; const t=e.changedTouches?e.changedTouches[0]:e; anchor={x:t.clientX,y:t.clientY}; joyActive=true; joyVec.x=joyVec.y=0; e.preventDefault(); }
function moveTouch(e){ if(!joyActive) return; const t=e.changedTouches?e.changedTouches[0]:e; const dx=t.clientX-anchor.x, dy=t.clientY-anchor.y; const R=60; const L=Math.hypot(dx,dy); const k=L>R?R/L:1; joyVec.x=(dx*k)/R; joyVec.y=(dy*k)/R; e.preventDefault(); }
function endTouch(e){ joyActive=false; joyVec.x=joyVec.y=0; e.preventDefault(); }
['pointerdown','pointermove','pointerup','pointercancel'].forEach((ev,i)=>canvas.addEventListener(ev,[startTouch,moveTouch,endTouch,endTouch][i], {passive:false}));
canvas.addEventListener('touchstart', (e)=>{ if(e.target===canvas) startTouch(e); }, {passive:false});
canvas.addEventListener('touchmove',  (e)=>{ if(e.target===canvas) moveTouch(e); },  {passive:false});
window.addEventListener('touchend',   (e)=>{ if(joyActive) endTouch(e); /* DO NOT preventDefault here */ }, {passive:true});
window.addEventListener('touchcancel',(e)=>{ if(joyActive) endTouch(e); /* DO NOT preventDefault here */ }, {passive:true});

btnPause.addEventListener('click', ()=>{ togglePause(); });
btnPause.addEventListener('touchstart', ()=>{ togglePause(); }, {passive:true});
btnShop.addEventListener('click', ()=>{ toggleShop(); });
btnShop.addEventListener('touchstart', ()=>{ toggleShop(); }, {passive:true});
btnShopClose.addEventListener('click', ()=>{ closeShop(); });
btnShopClose.addEventListener('touchstart', ()=>{ closeShop(); }, {passive:true});
btnUpClose.addEventListener('click', ()=>{ closeUpgrade(); });
btnUpClose.addEventListener('touchstart', ()=>{ closeUpgrade(); }, {passive:true});
elPause.addEventListener('click', ()=>{ if(!G.shop && !G.showUp && !G.over){ togglePause(); } });
elPause.addEventListener('touchstart', ()=>{ if(!G.shop && !G.showUp && !G.over){ togglePause(); } }, {passive:true});

/* ---------- Entities ---------- */
class Ent{constructor(x,y,r,c){this.p=new V(x,y);this.v=new V();this.r=r;this.c=c;this.hp=1;this.dead=false;} u(dt){this.p.add(this.v.clone().mul(dt));} d(off){ctx.beginPath();ctx.arc(this.p.x+off.x,this.p.y+off.y,this.r,0,Math.PI*2);ctx.fillStyle=this.c;ctx.fill();}}
class Player extends Ent{
  constructor(){
    super(0,0,14,'#4ec9b0');
    this.baseSpd=240; this.hp=6; this.gold=0; this.inv=0; this.shootTimer=0;
    this.stats={hpLv:0, spdLv:0, dmgLv:0, asLv:0, rngLv:0, ccLv:0, cmLv:0};
    this.lv=1; this.exp=0; this.next=6;
    this.maxhp=this.maxHP();
  }
  spd(){ return this.baseSpd * (1+0.18*this.stats.spdLv); }
  dmg(){ return 16 * (1+0.20*this.stats.dmgLv); }
  rate(){ const base=1.6; const v = base * (1+0.16*this.stats.asLv); return Math.min(5.0, v); }
  critChance(){ return Math.min(0.65, 0.22 + 0.06*this.stats.ccLv); }
  critMult(){ return 1.7 + 0.30*this.stats.cmLv; }
  maxHP(){ return 6 + this.stats.hpLv*2; }
  pick(){ return 150*(1+0.06*this.stats.spdLv); }
  maxRange(){ return Math.min(WIDTH, HEIGHT)*0.95; }
  range(){ return Math.min(150 * (1+0.30*this.stats.rngLv), this.maxRange()); }
  u(dt){
    let dx=joyVec.x, dy=joyVec.y;
    if(keys.has('w')||keys.has('arrowup'))dy-=1;
    if(keys.has('s')||keys.has('arrowdown'))dy+=1;
    if(keys.has('a')||keys.has('arrowleft'))dx-=1;
    if(keys.has('d')||keys.has('arrowright'))dx+=1;
    const m=new V(dx,dy); if(m.len()>0)m.norm().mul(this.spd()); this.v=m; super.u(dt); this.inv=Math.max(0,this.inv-dt);
    this.shootTimer -= dt;
    if(this.shootTimer<=0){
      const t=nearEnemyWithinRangeAndScreen(this.range());
      if(t){
        this.shootTimer = 1/this.rate();
        const dir=t.p.clone().sub(this.p).norm();
        bullets.push(new Bullet(this.p.x,this.p.y,dir,820,this.dmg(),this.critChance(),this.critMult(), this.range()));
      }
    }
  }
}
function levelHpScale(lv){ return 1 + 0.05 * Math.max(0, lv-1); } // gentler than player
class Enemy extends Ent{
  constructor(x,y,t){
    const map={bat:[10,'#dcdcaa', 15,56,2,false],ghost:[12,'#c586c0',30,48,3,false],elite:[16,'#ce9178',120,56,8,true]}[t];
    super(x,y,map[0],map[1]);
    this.baseHp=map[2]; this.baseSpd=map[3]; this.exp=map[4]; this.elite=map[5]; this.spd=this.baseSpd;
    this.maxHp=this.baseHp * levelHpScale(G.p.lv); this.hp=this.maxHp;
    this.spawnAt = G.time;
  }
  ensureAppear3s(){
    if(G.time - this.spawnAt < 3) return;
    if(!isOnScreen(this.p)){
      const offX = WIDTH/2 - G.p.p.x, offY = HEIGHT/2 - G.p.p.y;
      const side = Math.floor(Math.random()*4);
      const pad = 20;
      let sx, sy;
      if(side===0){ sx = pad; sy = Math.random()*HEIGHT; }
      else if(side===1){ sx = WIDTH-pad; sy = Math.random()*HEIGHT; }
      else if(side===2){ sx = Math.random()*WIDTH; sy = pad; }
      else { sx = Math.random()*WIDTH; sy = HEIGHT-pad; }
      this.p.x = sx - offX; this.p.y = sy - offY;
      this.spawnAt = G.time;
    }
  }
  u(dt,p){
    const targetMax = this.baseHp * levelHpScale(G.p.lv);
    if(targetMax > this.maxHp){
      const ratio = targetMax / this.maxHp;
      this.maxHp = targetMax;
      this.hp = Math.ceil(this.hp * ratio);
    }
    const d=p.p.clone().sub(this.p);
    if(d.len()>1){ d.norm(); this.v=d.mul(this.spd); this.v.x += (Math.random()-0.5)*10; this.v.y += (Math.random()-0.5)*10; } else this.v=new V();
    super.u(dt);
    this.ensureAppear3s();
  }
}
class XPOrb extends Ent{constructor(x,y,val=1){super(x,y,4,'#53d1ff');this.val=val;} u(dt,p){const d=p.p.clone().sub(this.p);const L=d.len();if(L<p.pick()*1.8){d.norm();this.v=d.mul(320*(1.2-L/(p.pick()*1.8)));}else this.v=new V();super.u(dt);}}
class Coin extends Ent{constructor(x,y,val=3){super(x,y,4,'#ffd700');this.val=val;} u(dt,p){const d=p.p.clone().sub(this.p);const L=d.len();if(L<p.pick()*1.5){d.norm();this.v=d.mul(340*(1.2-L/(p.pick()*1.5)));}else this.v=new V();super.u(dt);}}
class Medkit extends Ent{constructor(x,y,heal=2){super(x,y,6,'#00d084');this.heal=heal;} d(off){const x=this.p.x+off.x,y=this.p.y+off.y;const r=7;ctx.fillStyle='#00d084';ctx.beginPath();ctx.moveTo(x, y-r);ctx.lineTo(x+r, y);ctx.lineTo(x, y+r);ctx.lineTo(x-r, y);ctx.closePath();ctx.fill();}}
function hit(a,b){const dx=a.p.x-b.p.x,dy=a.p.y-b.p.y,rr=a.r+b.r;return dx*dx+dy*dy<=rr*rr;}

/* ---------- Damage numbers & bullets ---------- */
const floatNums=[]; function addNum(x,y,txt,color){ floatNums.push({x,y,txt,color,t:1.0}); }
class Bullet extends Ent{
  constructor(x,y,dir,spd,dmg,cc,cm,range){ super(x,y,4,'#9cdcfe'); this.v=dir.clone().mul(spd); this.base=dmg; this.cc=cc; this.cm=cm; this.lifeDist=range; }
  u(dt){ const step = this.v.clone().mul(dt); this.p.add(step); this.lifeDist -= step.len(); if(this.lifeDist<=0) this.dead=true; }
}
let bullets=[];

/* ---------- Game state ---------- */
const G={p:new Player(),en:[],xp:[],coins:[],kits:[],time:0,over:false,showUp:false,paused:false,shop:false};
const EXP=[6,10,16,24,34,46,60,76,94,114,136,160,186,214,244];

/* ---------- Spawn & difficulty ---------- */
function isOnScreen(worldPos){ const offX = WIDTH/2 - G.p.p.x; const offY = HEIGHT/2 - G.p.p.y; const sx = worldPos.x + offX; const sy = worldPos.y + offY; return sx>=0 && sx<=WIDTH && sy>=0 && sy<=HEIGHT; }
function nearEnemyWithinRangeAndScreen(r){ let best=null,bd=1e9; for(const e of G.en){ if(e.dead) continue; const d=e.p.clone().sub(G.p.p).len(); if(d<bd && d<=r && isOnScreen(e.p)) { bd=d; best=e; } } return best; }

let spawnAcc=0, medkitAcc=0;
function perSecDynamic(){
  const t=G.time, lv=G.p.lv;
  let base;
  if(t<60){ base=0.9 + (t/60)*0.3; }           // gentle first minute
  else if(t<120){ base=1.4; }
  else if(t<180){ base=2.0; }
  else if(t<240){ base=2.6; }
  else if(t<320){ base=3.2; }
  else { base=3.8; }
  const levelBoost = t<60 ? 0 : 0.10 * Math.max(0, lv-1); // slower than player growth
  return base + levelBoost;
}
function maxActiveEnemies(){
  const t=G.time, lv=G.p.lv;
  if(t<60) return 40;
  const baseCap = 60 + Math.floor((t-60)/60)*40;
  const levelCap = 12 * Math.max(0, lv-1);
  return Math.min(480, baseCap + levelCap);
}
function eliteChance(){ const t=G.time; return t<90? 0.03 : (t<180? 0.06 : 0.10); }
function spawnLoop(dt){
  spawnAcc += dt; const per=perSecDynamic(); const every = 1/Math.max(0.1,per);
  while(spawnAcc >= every){
    spawnAcc -= every;
    if(G.en.length >= maxActiveEnemies()) break;
    spawnAtEdge(Math.random()<0.22 ? 'ghost' : 'bat');
    if(Math.random() < eliteChance()) spawnAtEdge('elite');
  }
}
function spawnAtEdge(type){
  const offX = WIDTH/2 - G.p.p.x, offY = HEIGHT/2 - G.p.p.y;
  const side = Math.floor(Math.random()*4); const padOut = 10;
  let sx, sy;
  if(side===0){ sx = -padOut; sy = Math.random()*HEIGHT; }
  else if(side===1){ sx = WIDTH+padOut; sy = Math.random()*HEIGHT; }
  else if(side===2){ sx = Math.random()*WIDTH; sy = -padOut; }
  else { sx = Math.random()*WIDTH; sy = HEIGHT+padOut; }
  const worldX = sx - offX, worldY = sy - offY;
  G.en.push(new Enemy(worldX, worldY, type));
}
function spawnMedkitNear(){
  const offX = WIDTH/2 - G.p.p.x, offY = HEIGHT/2 - G.p.p.y;
  const sx = Math.random()*WIDTH*0.8 + WIDTH*0.1; const sy = Math.random()*HEIGHT*0.8 + HEIGHT*0.1;
  const worldX = sx - offX, worldY = sy - offY; G.kits.push(new Medkit(worldX, worldY, 2));
}

/* ---------- Panels & toggles ---------- */
function togglePause(){ if(G.over) return; G.paused=!G.paused; elPause.style.display=G.paused?'flex':'none'; if(G.paused){ elShop.style.display='none'; G.shop=false; } btnPause.textContent=G.paused?'继续':'暂停'; }
function toggleShop(){ if(G.over) return; if(G.shop){ closeShop(); } else { G.shop=true; G.paused=true; elPause.style.display='flex'; buildShop(); elShop.style.display='block'; btnPause.textContent='继续'; } }
function closeShop(){ G.shop=false; elShop.style.display='none'; G.paused=false; elPause.style.display='none'; btnPause.textContent='暂停'; }
function closeUpgrade(){ elUpgrade.style.display='none'; G.showUp=false; }

/* ---------- Shop / Upgrades ---------- */
const STAT_KEYS=[
  {k:'hpLv', name:'生命',    desc:'+2 上限并回满', base:15, apply:()=>{ G.p.stats.hpLv++; G.p.maxhp=G.p.maxHP(); G.p.hp=G.p.maxhp; }},
  {k:'spdLv',name:'移速',    desc:'+18% 移动速度', base:15, apply:()=>{ G.p.stats.spdLv++; }},
  {k:'dmgLv',name:'伤害',    desc:'+20% 伤害',     base:15, apply:()=>{ G.p.stats.dmgLv++; }},
  {k:'asLv', name:'攻速',    desc:'+16% 攻速（有上限）', base:15, apply:()=>{ G.p.stats.asLv++; }},
  {k:'rngLv', name:'射程',   desc:'+30% 射程（不会超过屏幕）', base:15, apply:()=>{ G.p.stats.rngLv++; }},
  {k:'ccLv', name:'暴击率',  desc:'+6% 暴击率（上限 65%）', base:20, apply:()=>{ G.p.stats.ccLv++; }},
  {k:'cmLv', name:'暴击伤',  desc:'+0.30× 暴击伤害',       base:20, apply:()=>{ G.p.stats.cmLv++; }},
];
function buildShop(){
  // allow touchstart to trigger clicks on iOS
  document.addEventListener('touchstart', function(e){ const el=e.target; if(el && (el.classList?.contains('buy') || el.classList?.contains('choice') || el.classList?.contains('tbtn'))){ /* let click synthesize */ } }, {passive:true});

  elShopGold.textContent=G.p.gold; elShopList.innerHTML='';
  for(const it of STAT_KEYS){
    const lv=G.p.stats[it.k]||0; const price = it.base * Math.pow(2, lv);
    const row=document.createElement('div'); row.className='item';
    const name=document.createElement('div'); name.className='name'; name.textContent=`${it.name} → Lv.${lv+1}`;
    const cost=document.createElement('div'); cost.innerHTML=`<span class="cost">¥${price}</span>`;
    const buy=document.createElement('button'); buy.className='buy'; buy.textContent='购买'; buy.disabled=G.p.gold<price;
    buy.onclick=()=>{ if(G.p.gold<price) return; G.p.gold-=price; it.apply(); refreshStats(); elGold.textContent=G.p.gold; elShopGold.textContent=G.p.gold; buildShop(); };
    elShopList.appendChild(row); elShopList.appendChild(name); elShopList.appendChild(cost); elShopList.appendChild(buy);
  }
}
function openUp(){
  G.showUp=true; elChoices.innerHTML='';
  const pool=STAT_KEYS.slice(); for(let i=0;i<3;i++){ const idx=Math.floor(Math.random()*pool.length); const it=pool.splice(idx,1)[0]; const lv=G.p.stats[it.k]||0;
    const div=document.createElement('div'); div.className='choice'; div.innerHTML=`<div class="title">${it.name} → Lv.${lv+1}</div><div class="desc">${it.desc}</div>`;
    div.onclick=()=>{ it.apply(); refreshStats(); elUpgrade.style.display='none'; G.showUp=false; };
    elChoices.appendChild(div);
  }
  elUpgrade.style.display='block';
}
function levelUp(){ G.p.lv++; G.p.exp=0; G.p.next = EXP[Math.min(G.p.lv-1, EXP.length-1)] || (G.p.next+14); elLv.textContent=G.p.lv; openUp(); }

/* ---------- Stats & pickups ---------- */
function refreshStats(){
  G.p.maxhp=G.p.maxHP(); elHPFill.style.width = `${(G.p.hp/G.p.maxhp)*100}%`;
  ST.HP.textContent = `生命 ${G.p.hp}/${G.p.maxhp}`;
  ST.SPD.textContent= `移速 Lv.${G.p.stats.spdLv}`;
  ST.DMG.textContent= `伤害 Lv.${G.p.stats.dmgLv}`;
  ST.AS.textContent = `攻速 Lv.${G.p.stats.asLv}`;
  ST.RNG.textContent= `射程 Lv.${G.p.stats.rngLv}`;
  ST.CC.textContent = `暴击率 Lv.${G.p.stats.ccLv}`;
  ST.CM.textContent = `暴击伤 Lv.${G.p.stats.cmLv}`;
  document.getElementById('sHP').textContent=`生命 Lv.${G.p.stats.hpLv}`;
  document.getElementById('sSPD').textContent=`移速 Lv.${G.p.stats.spdLv}`;
  document.getElementById('sDMG').textContent=`伤害 Lv.${G.p.stats.dmgLv}`;
  document.getElementById('sAS').textContent=`攻速 Lv.${G.p.stats.asLv}`;
  document.getElementById('sRNG').textContent=`射程 Lv.${G.p.stats.rngLv}`;
  document.getElementById('sCC').textContent=`暴击率 Lv.${G.p.stats.ccLv}`;
  document.getElementById('sCM').textContent=`暴击伤 Lv.${G.p.stats.cmLv}`;
}

/* ---------- Combat & collisions ---------- */
function bulletHits(){
  for(const b of bullets){
    if(b.dead) continue;
    for(const e of G.en){
      if(e.dead) continue;
      if(hit(b,e)){
        if(!isOnScreen(e.p)) { continue; }
        let dmg = b.base; const isCrit = Math.random() < b.cc; if(isCrit) dmg = Math.round(dmg * b.cm);
        e.hp -= Math.round(dmg);
        addNum(e.p.x, e.p.y-8, isCrit? `${dmg}!` : `${dmg}`, isCrit? '#ffd04d' : '#e0e0e0');
        b.dead = true;
        if(e.hp<=0){ e.dead = true;
          if(G.time < 40 || Math.random() < (e.elite? 0.65 : 0.55)){ G.xp.push(new XPOrb(e.p.x, e.p.y, e.exp)); }
          else { const val = e.elite ? 12 : (3 + Math.floor(Math.random()*3)); G.coins.push(new Coin(e.p.x, e.p.y, val)); }
        }
        break;
      }
    }
  }
}
function playerHits(){ if(G.p.inv>0) return; for(const e of G.en){ if(!e.dead && hit(e,G.p)){ G.p.hp-=1; G.p.inv=1; if(G.p.hp<=0) G.over=true; refreshStats(); break; } } }
function pickupXP(){ for(const x of G.xp){ if(!x.dead && hit(x,G.p)){ x.dead=true; G.p.exp += x.val||1; if(G.p.exp>=G.p.next) levelUp(); } } }
function pickupCoins(){ for(const c of G.coins){ if(!c.dead && hit(c,G.p)){ c.dead=true; G.p.gold += c.val||1; elGold.textContent = G.p.gold; } } }
function pickupKits(){ for(const k of G.kits){ if(!k.dead && hit(k,G.p)){ k.dead=true; G.p.hp = Math.min(G.p.maxHP(), G.p.hp + (k.heal||2)); refreshStats(); } } }

/* ---------- Update / Draw ---------- */
let last=performance.now();
function update(dt){
  if(G.over) return;
  if(G.paused || G.shop || G.showUp) return;
  G.time+=dt; spawnLoop(dt); medkitAcc+=dt; if(medkitAcc>=12){ medkitAcc=0; if(G.kits.length<3){ spawnMedkitNear(); } } G.p.u(dt);
  for(const e of G.en) e.u(dt,G.p); for(const b of bullets) b.u(dt); for(const x of G.xp) x.u(dt,G.p); for(const c of G.coins) c.u(dt,G.p);
  bulletHits(); playerHits(); pickupXP(); pickupCoins(); pickupKits();
  G.en=G.en.filter(e=>!e.dead); bullets=bullets.filter(b=>!b.dead); G.xp=G.xp.filter(x=>!x.dead); G.coins=G.coins.filter(c=>!c.dead); G.kits=G.kits.filter(k=>!k.dead);
  const m=Math.floor(G.time/60), s=Math.floor(G.time%60); elTime.textContent = `${m}:${s.toString().padStart(2,'0')}`; elHPFill.style.width = `${(G.p.hp/G.p.maxhp)*100}%`; elGold.textContent=G.p.gold; elExp.style.width = `${(G.p.exp/G.p.next)*100}%`;
}
function draw(){
  const g = ctx.createRadialGradient(WIDTH/2, HEIGHT/2, 0, WIDTH/2, HEIGHT/2, Math.max(WIDTH, HEIGHT)*0.7);
  g.addColorStop(0, '#141416'); g.addColorStop(1, '#0f0f11');
  ctx.fillStyle = g; ctx.fillRect(0,0,WIDTH,HEIGHT);
  ctx.globalAlpha = 0.08; for(let y=0; y<HEIGHT; y+=28){ for(let x=(y%56===0?0:14); x<WIDTH; x+=28){ ctx.fillStyle='#ffffff'; ctx.fillRect(x,y,2,2);} } ctx.globalAlpha = 1;
  const offX = WIDTH/2 - G.p.p.x, offY = HEIGHT/2 - G.p.p.y;
  drawDecor({x:offX,y:offY});
  for(const x of G.xp) x.d({x:offX,y:offY});
  for(const c of G.coins) c.d({x:offX,y:offY});
  for(const k of G.kits) k.d({x:offX,y:offY});
  for(const e of G.en) e.d({x:offX,y:offY});
  for(const b of bullets) b.d({x:offX,y:offY});
  G.p.d({x:offX,y:offY});
  for(let i=floatNums.length-1;i>=0;i--){
    const n=floatNums[i]; n.t -= 0.02; if(n.t<=0){ floatNums.splice(i,1); continue; }
    ctx.globalAlpha = Math.max(0, n.t); ctx.fillStyle=n.color; ctx.font='16px sans-serif'; ctx.textAlign='center';
    ctx.fillText(n.txt, n.x+offX, n.y+offY - (1-n.t)*24);
    ctx.textAlign='left'; ctx.globalAlpha=1;
  }
  if(G.over){ ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.fillRect(0,0,WIDTH,HEIGHT); ctx.fillStyle='#fff'; ctx.font='32px sans-serif'; ctx.textAlign='center'; ctx.fillText('你已死亡 · 点击重开', WIDTH/2, HEIGHT/2); ctx.textAlign='left'; }
}
function drawDecor(off){
  const cell=160;
  const minX=Math.floor((G.p.p.x - WIDTH/2 - 200)/cell);
  const maxX=Math.floor((G.p.p.x + WIDTH/2 + 200)/cell);
  const minY=Math.floor((G.p.p.y - HEIGHT/2 - 200)/cell);
  const maxY=Math.floor((G.p.p.y + HEIGHT/2 + 200)/cell);
  ctx.globalAlpha=0.25;
  for(let gx=minX; gx<=maxX; gx++){
    for(let gy=minY; gy<=maxY; gy++){
      const h=((gx*374761393 + gy*668265263)>>>0);
      const rocks = 1 + (h % 3);
      for(let i=0;i<rocks;i++){
        const hx = ((h >> (i*6)) & 63)/63;
        const hy = ((h >> (i*6+6)) & 63)/63;
        const x = gx*cell + hx*cell + off.x;
        const y = gy*cell + hy*cell + off.y;
        ctx.beginPath(); ctx.arc(x,y,2 + ((h>>i)&1),0,Math.PI*2); ctx.fillStyle='#2a2a2a'; ctx.fill();
      }
    }
  }
  ctx.globalAlpha=1;
}
function loop(ts){ const now=ts||performance.now(); const dt=Math.min(0.033,(now-last)/1000); last=now;
  try{ if(!G.paused && !G.shop && !G.showUp) update(dt); draw(); } catch(err){ console.error(err); dbg.textContent=String(err.stack||err); }
  requestAnimationFrame(loop);
}
canvas.addEventListener('click', ()=>{ if(G.over){ resetGame(); } });

/* ---------- Reset & Init ---------- */
function resetGame(){
  G.en=[]; G.xp=[]; G.coins=[]; G.kits=[]; G.showUp=false; elUpgrade.style.display='none'; G.paused=false; elPause.style.display='none'; G.shop=false; elShop.style.display='none'; btnPause.textContent='暂停';
  G.p=new Player(); bullets=[]; G.time=0; G.over=false; refreshStats();
}
function init(){ refreshStats(); }
init(); requestAnimationFrame(loop);
})();