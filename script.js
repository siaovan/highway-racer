(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const canvas = $('#gameCanvas');
  const ctx = canvas.getContext('2d');
  const garageCanvas = $('#garageCanvas');
  const gctx = garageCanvas.getContext('2d');

  const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
  const lerp = (a,b,t)=>a+(b-a)*t;
  const rand = (a,b)=>a+Math.random()*(b-a);
  const pick = arr=>arr[(Math.random()*arr.length)|0];
  const TAU = Math.PI*2;

  const PAINTS = ['#ef302f','#126cff','#f4f5f7','#ffd33d','#13161b','#35c98b','#8a54ff'];
  const TRAFFIC_COLORS = ['#e9ecef','#20262f','#d33b38','#2a67b8','#696f76','#c9a24b','#0e7682','#833b3b'];

  const CARS = [
    {brand:'LAMBORGHINI', model:'AVENTADOR SVJ', short:'SVJ', style:'aventador', speed:96, handling:82, stability:84, width:124, height:72, desc:'V12-inspired wedge-shaped supercar. Very fast, wide and stable at speed.'},
    {brand:'FERRARI', model:'SF90 STRADALE', short:'SF90', style:'sf90', speed:98, handling:90, stability:78, width:120, height:70, desc:'Hybrid hypercar-inspired shape with rapid steering response and huge top speed.'},
    {brand:'PORSCHE', model:'911 GT3 RS', short:'GT3 RS', style:'porsche', speed:91, handling:98, stability:90, width:116, height:74, desc:'Track-focused rear-engine coupe. The most precise car for threading tight traffic.'},
    {brand:'NISSAN', model:'GT-R R35', short:'GT-R', style:'gtr', speed:89, handling:84, stability:98, width:124, height:78, desc:'Heavy AWD-inspired grand tourer. Extremely planted and easy to control at high speed.'},
    {brand:'McLAREN', model:'720S', short:'720S', style:'mclaren', speed:97, handling:94, stability:80, width:118, height:70, desc:'Light, flowing supercar-inspired body with fast transitions and strong acceleration.'}
  ];

  const TRAFFIC_TYPES = {
    hatch:{w:60,h:44,hitW:.66,hitH:.60,yOff:-.24,speed:[.80,1.05]},
    sedan:{w:64,h:46,hitW:.66,hitH:.60,yOff:-.24,speed:[.78,1.02]},
    suv:{w:70,h:58,hitW:.67,hitH:.62,yOff:-.22,speed:[.70,.94]},
    pickup:{w:70,h:58,hitW:.67,hitH:.62,yOff:-.22,speed:[.70,.94]},
    van:{w:72,h:76,hitW:.66,hitH:.68,yOff:-.20,speed:[.66,.88]},
    truck:{w:80,h:112,hitW:.68,hitH:.74,yOff:-.16,speed:[.58,.78]},
    bus:{w:84,h:120,hitW:.69,hitH:.75,yOff:-.15,speed:[.55,.72]},
    sport:{w:68,h:44,hitW:.64,hitH:.58,yOff:-.25,speed:[.92,1.17]}
  };

  // Local SVG sprites: completely offline, loaded from the project folder.
  const carSprites = {};
  const trafficSprites = {};
  const tintedSpriteCache = new Map();
  for (const car of CARS) {
    const img = new Image();
    img.src = `assets/cars/${car.style}.svg`;
    carSprites[car.style] = img;
  }
  for (const type of Object.keys(TRAFFIC_TYPES)) {
    const img = new Image();
    img.src = `assets/traffic/${type}.svg`;
    trafficSprites[type] = img;
  }
  function tintedCarSprite(style, paint){
    const key = `${style}|${paint}`;
    if (tintedSpriteCache.has(key)) return tintedSpriteCache.get(key);
    const img = carSprites[style];
    if (!img || !img.complete || !img.naturalWidth) return null;
    const oc = document.createElement('canvas');
    oc.width = 640; oc.height = 360;
    const o = oc.getContext('2d');
    o.clearRect(0,0,640,360);
    o.drawImage(img,0,0,640,360);
    // source-atop keeps the SVG alpha. No colored rectangle can appear around the car.
    o.globalCompositeOperation='source-atop';
    o.globalAlpha=.64; o.fillStyle=paint; o.fillRect(0,0,640,360);
    o.globalCompositeOperation='source-over';
    o.globalAlpha=.58; o.drawImage(img,0,0,640,360);
    o.globalAlpha=1;
    tintedSpriteCache.set(key,oc);
    return oc;
  }


  const difficultyCfg = [
    {base:95,max:190,spawn:1.18,world:.84,laneChange:.02},
    {base:112,max:230,spawn:.95,world:.94,laneChange:.07},
    {base:132,max:272,spawn:.76,world:1.04,laneChange:.14},
    {base:152,max:315,spawn:.60,world:1.15,laneChange:.22}
  ];

  const settings = {
    audio: JSON.parse(localStorage.getItem('hr32_audio') ?? localStorage.getItem('hr3_audio') ?? 'true'),
    shake: JSON.parse(localStorage.getItem('hr32_shake') ?? localStorage.getItem('hr3_shake') ?? 'true'),
    motion: JSON.parse(localStorage.getItem('hr32_motion') ?? localStorage.getItem('hr3_motion') ?? 'true'),
    rain: JSON.parse(localStorage.getItem('hr32_rain') ?? localStorage.getItem('hr3_rain') ?? 'true'),
    assist: JSON.parse(localStorage.getItem('hr32_assist') ?? localStorage.getItem('hr3_assist') ?? 'true'),
    sensitivity: Number(localStorage.getItem('hr32_sens') ?? localStorage.getItem('hr3_sens') ?? 100),
    car: Number(localStorage.getItem('hr32_car') ?? localStorage.getItem('hr3_car') ?? 0),
    paint: Number(localStorage.getItem('hr32_paint') ?? 2)
  };

  const ui = {
    main:$('#mainMenu'), difficulty:$('#difficultyScreen'), garage:$('#garageScreen'), settings:$('#settingsScreen'), how:$('#howScreen'),
    pause:$('#pauseScreen'), over:$('#gameOverScreen'), hud:$('#hud'), mobile:$('#mobileControls'), feedback:$('#feedback'), milestone:$('#milestone')
  };

  const game = {
    state:'menu', difficulty:1, score:0, best:Number(localStorage.getItem('hr3_best') ?? 0), distance:0,
    speed:0,targetSpeed:0,combo:1,maxCombo:1,comboTimer:0,nearMisses:0,overtakes:0,nitro:72,nitroActive:false,
    time:0,roadOffset:0,playerX:0,steer:0,traffic:[],particles:[],spawnTimer:0,shake:0,lastMilestone:0,
    environment:'SUNSET',weather:'CLEAR',location:'MOUNTAIN PASS',lastT:performance.now(),demoT:0,garageT:0,paused:false,
    radarTick:0,debugHitboxes:false
  };

  function saveSettings(){
    localStorage.setItem('hr32_audio', JSON.stringify(settings.audio));
    localStorage.setItem('hr32_shake', JSON.stringify(settings.shake));
    localStorage.setItem('hr32_motion', JSON.stringify(settings.motion));
    localStorage.setItem('hr32_rain', JSON.stringify(settings.rain));
    localStorage.setItem('hr32_assist', JSON.stringify(settings.assist));
    localStorage.setItem('hr32_sens', String(settings.sensitivity));
    localStorage.setItem('hr32_car', String(settings.car));
    localStorage.setItem('hr32_paint', String(settings.paint));
  }

  function resize(){
    const dpr=Math.min(window.devicePixelRatio||1,2);
    canvas.width=Math.floor(innerWidth*dpr);canvas.height=Math.floor(innerHeight*dpr);
    canvas.style.width=innerWidth+'px';canvas.style.height=innerHeight+'px';
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  addEventListener('resize',resize);resize();

  function showScreen(el){$$('.screen').forEach(x=>x.classList.remove('active'));if(el)el.classList.add('active')}
  function goMenu(){
    stopEngine(); game.state='menu'; game.paused=false; showScreen(ui.main); ui.hud.classList.add('hidden');ui.mobile.classList.add('hidden');
    $('#menuBest').textContent=game.best.toLocaleString();
    $('#menuCar').textContent=`${CARS[settings.car].brand} ${CARS[settings.car].model}`;
    $('#heroCarName').textContent=CARS[settings.car].model;
  }

  $('#playBtn').onclick=()=>showScreen(ui.difficulty);
  $('#garageBtn').onclick=()=>{renderGarageUI();showScreen(ui.garage)};
  $('#settingsBtn').onclick=()=>showScreen(ui.settings);
  $('#howBtn').onclick=()=>showScreen(ui.how);
  $$('[data-back]').forEach(b=>b.onclick=goMenu);
  $$('[data-difficulty]').forEach(b=>b.onclick=()=>startGame(Number(b.dataset.difficulty)));

  const settingMap=[['audioToggle','audio'],['shakeToggle','shake'],['motionToggle','motion'],['rainToggle','rain'],['assistToggle','assist']];
  settingMap.forEach(([id,key])=>{const el=$('#'+id);el.checked=settings[key];el.onchange=e=>{settings[key]=e.target.checked;saveSettings();if(key==='audio'&&!settings.audio)stopEngine()}});
  $('#sensitivity').value=settings.sensitivity;$('#sensitivity').oninput=e=>{settings.sensitivity=Number(e.target.value);saveSettings()};

  function renderGarageUI(){
    $('#garageBest').textContent=game.best.toLocaleString();
    const wrap=$('#carOptions');wrap.innerHTML='';
    CARS.forEach((car,i)=>{
      const b=document.createElement('button');b.className='car-card'+(i===settings.car?' active':'');
      b.innerHTML=`<div class="mini-car"><img src="assets/cars/${car.style}.svg" alt="${car.model}"></div><small>${car.brand}</small><strong>${car.model}</strong>`;
      b.onclick=()=>{settings.car=i;saveSettings();renderGarageUI()};wrap.appendChild(b);
    });
    const paints=$('#paintOptions');paints.innerHTML='';PAINTS.forEach((c,i)=>{const b=document.createElement('button');b.style.background=c;b.className=i===settings.paint?'active':'';b.onclick=()=>{settings.paint=i;saveSettings();renderGarageUI()};paints.appendChild(b)});
    const car=CARS[settings.car];
    $('#selectedBrand').textContent=car.brand;$('#selectedModel').textContent=car.model;$('#carDescription').textContent=car.desc;
    [['statSpeed','statSpeedNum','speed'],['statHandling','statHandlingNum','handling'],['statStability','statStabilityNum','stability']].forEach(([bar,num,key])=>{$('#'+bar).style.width=car[key]+'%';$('#'+num).textContent=car[key]});
  }

  function startGame(diff){
    game.state='playing';game.difficulty=diff;game.score=0;game.distance=0;game.speed=difficultyCfg[diff].base*.63;game.targetSpeed=game.speed;
    game.combo=1;game.maxCombo=1;game.comboTimer=0;game.nearMisses=0;game.overtakes=0;game.nitro=70;game.nitroActive=false;
    game.time=0;game.roadOffset=0;game.playerX=0;game.steer=0;game.traffic=[];game.particles=[];game.spawnTimer=.2;game.shake=0;game.lastMilestone=0;game.radarTick=0;
    updateEnvironment();showScreen(null);ui.hud.classList.remove('hidden');ui.mobile.classList.remove('hidden');updateHUD();startEngine();
    for(let i=0;i<7+diff;i++)spawnTraffic(.05+i*.095);
    game.lastT=performance.now();
  }

  function pause(){if(game.state!=='playing')return;game.state='paused';showScreen(ui.pause);setEngineGain(.015)}
  function resume(){if(game.state!=='paused')return;game.state='playing';showScreen(null);game.lastT=performance.now();setEngineGain(settings.audio?.045:0)}
  $('#pauseBtn').onclick=pause;$('#resumeBtn').onclick=resume;$('#restartPauseBtn').onclick=()=>startGame(game.difficulty);$('#quitPauseBtn').onclick=goMenu;$('#retryBtn').onclick=()=>startGame(game.difficulty);$('#gameOverMenuBtn').onclick=goMenu;

  const keys={};
  addEventListener('keydown',e=>{
    const k=e.key.toLowerCase();keys[k]=true;
    if([' ','arrowleft','arrowright'].includes(k))e.preventDefault();
    if(k==='h')game.debugHitboxes=!game.debugHitboxes;
    if(e.key==='Escape'||k==='p'){if(game.state==='playing')pause();else if(game.state==='paused')resume()}
  },{passive:false});
  addEventListener('keyup',e=>keys[e.key.toLowerCase()]=false);

  let pointerActive=false,lastPointerX=0;
  canvas.addEventListener('pointerdown',e=>{pointerActive=true;lastPointerX=e.clientX;canvas.setPointerCapture?.(e.pointerId)});
  canvas.addEventListener('pointermove',e=>{if(!pointerActive||game.state!=='playing')return;const dx=e.clientX-lastPointerX;lastPointerX=e.clientX;game.playerX+=dx/Math.max(340,innerWidth*.48)});
  canvas.addEventListener('pointerup',()=>pointerActive=false);canvas.addEventListener('pointercancel',()=>pointerActive=false);
  let touchDir=0,touchNitro=false;
  function bindHold(el,dir){el.addEventListener('pointerdown',e=>{e.preventDefault();touchDir=dir;el.setPointerCapture?.(e.pointerId)});el.addEventListener('pointerup',()=>touchDir=0);el.addEventListener('pointercancel',()=>touchDir=0)}
  bindHold($('#leftTouch'),-1);bindHold($('#rightTouch'),1);
  $('#nitroTouch').addEventListener('pointerdown',e=>{e.preventDefault();touchNitro=true});$('#nitroTouch').addEventListener('pointerup',()=>touchNitro=false);$('#nitroTouch').addEventListener('pointercancel',()=>touchNitro=false);

  function chooseTrafficType(){
    const d=game.difficulty;
    const pool=d===0?['hatch','sedan','sedan','suv','pickup']:
      d===1?['hatch','sedan','sedan','suv','pickup','van','sport']:
      d===2?['sedan','suv','pickup','van','truck','sport','sport']:
      ['sedan','suv','van','truck','truck','bus','sport','sport'];
    return pick(pool);
  }

  function spawnTraffic(z=.02){
    const lanes=[-1.5,-.5,.5,1.5];
    let candidates=[...lanes];
    const close=game.traffic.filter(t=>Math.abs(t.z-z)<.14).map(t=>Math.round(t.targetLane*2)/2);
    candidates=candidates.filter(l=>!close.includes(l));if(!candidates.length)candidates=[...lanes];
    const lane=pick(candidates),type=chooseTrafficType(),m=TRAFFIC_TYPES[type];
    const [s0,s1]=m.speed;
    const canChange=Math.random()<difficultyCfg[game.difficulty].laneChange;
    game.traffic.push({lane,targetLane:lane,z,passed:false,near:false,type,color:(Math.random()*TRAFFIC_COLORS.length)|0,wobble:rand(0,TAU),speed:rand(s0,s1),canChange,changeTimer:rand(2.2,6.2),blinker:0,seed:Math.random()});
  }

  function updateEnvironment(){
    game.environment='SUNSET';
    game.location='COASTAL EXPRESSWAY';
    game.weather=(settings.rain && game.distance>7.5 && ((game.distance*1.31)%10)>8.7)?'RAIN':'CLEAR';
  }

  function playerCarScale(){return clamp(innerWidth/1030,1.28,1.72)}
  function roadGeometry(){const w=innerWidth,h=innerHeight,horizon=h*.315;return{w,h,horizon,cx:w/2,topL:w*.486,topR:w*.514,botL:-w*.035,botR:w*1.035,bottom:h*1.06}}
  function roadXAtY(y,side){const e=roadGeometry();const t=clamp((y-e.horizon)/(e.bottom-e.horizon),0,1);const p=Math.pow(t,.88);return side<0?lerp(e.topL,e.botL,p):lerp(e.topR,e.botR,p)}
  function laneToScreen(lane,z){
    const e=roadGeometry();const p=Math.pow(clamp(z,0,1.2),1.56);const y=e.horizon+p*(e.h-e.horizon+104);
    const left=roadXAtY(y,-1),right=roadXAtY(y,1),center=(left+right)/2,half=(right-left)/2;
    const x=center+(lane/1.98)*half;const scale=.11+p*1.62;return{x,y,scale,p,left,right};
  }
  function playerScreen(){const s=playerCarScale(),car=CARS[settings.car];return{x:innerWidth/2+game.playerX*innerWidth*.352,y:innerHeight*.865,scale:s,w:car.width*s,h:car.height*s}}

  function collisionRects(t){
    const pos=laneToScreen(t.lane,t.z),m=TRAFFIC_TYPES[t.type],pl=playerScreen();
    const tw=m.w*pos.scale, th=m.h*pos.scale;
    const assist=settings.assist;
    const pr={
      x:pl.x,
      y:pl.y-pl.h*.43,
      w:pl.w*(assist?.56:.66),
      h:pl.h*(assist?.50:.60)
    };
    const tr={
      x:pos.x,
      y:pos.y-th*.42+th*m.yOff,
      w:tw*(assist?m.hitW:m.hitW*1.12),
      h:th*(assist?m.hitH:m.hitH*1.10)
    };
    return {pr,tr,pos,tw,th};
  }
  function rectIntersection(a,b){
    const ax1=a.x-a.w/2, ax2=a.x+a.w/2, ay1=a.y-a.h/2, ay2=a.y+a.h/2;
    const bx1=b.x-b.w/2, bx2=b.x+b.w/2, by1=b.y-b.h/2, by2=b.y+b.h/2;
    return {x:Math.min(ax2,bx2)-Math.max(ax1,bx1),y:Math.min(ay2,by2)-Math.max(ay1,by1)};
  }
  function fairCollision(t){
    // Collision is screen-space based so it matches what the player actually sees.
    // A small depth overlap is required: touching corners no longer counts as a crash.
    if(t.z<.34||t.z>1.18)return {crash:false,near:false};
    const {pr,tr}=collisionRects(t),overlap=rectIntersection(pr,tr);
    const minW=Math.min(pr.w,tr.w),minH=Math.min(pr.h,tr.h);
    const crash=overlap.x>minW*.08&&overlap.y>minH*.10;
    const dx=Math.abs(pr.x-tr.x),dy=Math.abs(pr.y-tr.y);
    const nearW=(pr.w+tr.w)*.61, nearH=(pr.h+tr.h)*.64;
    const near=!crash&&dx<nearW&&dy<nearH;
    return {crash,near,dx,dy,pr,tr,overlap};
  }
  function drawCollisionDebug(){
    if(!game.debugHitboxes)return;
    ctx.save();ctx.lineWidth=2;
    const pl=playerScreen();const pr={x:pl.x,y:pl.y-pl.h*.43,w:pl.w*(settings.assist?.56:.66),h:pl.h*(settings.assist?.50:.60)};
    ctx.strokeStyle='#35ff79';ctx.strokeRect(pr.x-pr.w/2,pr.y-pr.h/2,pr.w,pr.h);
    for(const t of game.traffic){if(t.z<.34||t.z>1.18)continue;const {tr}=collisionRects(t);ctx.strokeStyle='#ff4545';ctx.strokeRect(tr.x-tr.w/2,tr.y-tr.h/2,tr.w,tr.h)}
    ctx.restore();
  }

  function update(dt){
    if(game.state!=='playing')return;
    const cfg=difficultyCfg[game.difficulty],car=CARS[settings.car];game.time+=dt;updateEnvironment();
    const nitroPressed=(keys[' ']||keys.shift||touchNitro)&&game.nitro>1;
    game.nitroActive=!!nitroPressed;
    if(game.nitroActive)game.nitro=Math.max(0,game.nitro-dt*30);else game.nitro=Math.min(100,game.nitro+dt*.8);
    const carTop=cfg.max*(.90+car.speed/1000);const baseTarget=Math.min(carTop,cfg.base+game.time*(1.75+game.difficulty*.58));
    game.targetSpeed=baseTarget+(game.nitroActive?62:0);game.speed+=(game.targetSpeed-game.speed)*Math.min(1,dt*(game.nitroActive?2.3:1.0));
    const handling=(car.handling/88)*(settings.sensitivity/100);let dir=0;if(keys.a||keys.arrowleft)dir--;if(keys.d||keys.arrowright)dir++;dir+=touchDir;
    game.steer+=(dir-game.steer)*Math.min(1,dt*8.5);game.playerX+=game.steer*dt*1.58*handling;game.playerX=clamp(game.playerX,-.92,.92);
    game.roadOffset=(game.roadOffset+dt*game.speed*(game.nitroActive?.016:.0125))%1;game.distance+=dt*game.speed/895;game.score+=dt*game.speed*.20*game.combo*(game.nitroActive?1.1:1);
    if(game.comboTimer>0){game.comboTimer-=dt;if(game.comboTimer<=0){game.combo=Math.max(1,game.combo-1);game.comboTimer=game.combo>1?1.4:0}}
    game.spawnTimer-=dt;if(game.spawnTimer<=0){spawnTraffic();game.spawnTimer=cfg.spawn/(1+game.time/130)*rand(.72,1.32)}
    const worldSpeed=dt*(.115+game.speed/505)*cfg.world*(game.nitroActive?1.10:1);

    for(const t of game.traffic){
      t.wobble+=dt;t.changeTimer-=dt;t.blinker=Math.max(0,t.blinker-dt);
      if(t.canChange&&t.changeTimer<=0&&t.z<.74){
        const lanes=[-1.5,-.5,.5,1.5],idx=lanes.indexOf(t.targetLane),opts=[];if(idx>0)opts.push(lanes[idx-1]);if(idx<lanes.length-1)opts.push(lanes[idx+1]);
        const desired=pick(opts);const occupied=game.traffic.some(o=>o!==t&&Math.abs(o.z-t.z)<.16&&Math.abs(o.targetLane-desired)<.1);
        if(!occupied){t.targetLane=desired;t.blinker=1.1}t.changeTimer=rand(3.0,7.0);
      }
      t.lane=lerp(t.lane,t.targetLane,Math.min(1,dt*(t.type==='sport'?1.6:1.05)));
      t.z+=worldSpeed*t.speed;
      const col=fairCollision(t);
      if(col.crash){crash(t);return}
      if(!t.near&&col.near&&t.z>.88){t.near=true;nearMiss()}
      if(!t.passed&&t.z>1.045){t.passed=true;overtake(t.near,t.type)}
    }
    game.traffic=game.traffic.filter(t=>t.z<1.22);
    game.shake=Math.max(0,game.shake-dt*2.7);
    const milestone=Math.floor(game.distance);if(milestone>0&&milestone>game.lastMilestone){game.lastMilestone=milestone;showMilestone(milestone)}
    updateParticles(dt);updateAudio();updateHUD(dt);
  }

  function nearMiss(){game.nearMisses++;game.combo=Math.min(9,game.combo+1);game.maxCombo=Math.max(game.maxCombo,game.combo);game.comboTimer=3.2;game.nitro=Math.min(100,game.nitro+16);game.score+=65*game.combo;game.shake=Math.max(game.shake,.14);showFeedback('NEAR MISS',`+${65*game.combo}`);playWhoosh()}
  function overtake(wasNear,type){game.overtakes++;const heavy=['truck','bus'].includes(type);const pts=(heavy?145:90)*game.combo;game.score+=pts;game.comboTimer=Math.max(game.comboTimer,2.2);game.nitro=Math.min(100,game.nitro+(wasNear?5:3));if(!wasNear&&game.overtakes%3===0)showFeedback('OVERTAKE',`+${pts}`)}
  function crash(t){
    if(game.state!=='playing')return;game.state='crashed';game.nitroActive=false;game.shake=1;spawnCrashParticles();playCrash();setEngineGain(0);$('#damageFlash').classList.remove('show');void $('#damageFlash').offsetWidth;$('#damageFlash').classList.add('show');
    const final=Math.floor(game.score);if(final>game.best){game.best=final;localStorage.setItem('hr3_best',String(game.best))}
    setTimeout(()=>{showScreen(ui.over);ui.hud.classList.add('hidden');ui.mobile.classList.add('hidden');$('#finalScore').textContent=final.toLocaleString();$('#finalBest').textContent=game.best.toLocaleString();$('#finalDistance').textContent=game.distance.toFixed(1)+' KM';$('#finalNear').textContent=game.nearMisses;$('#finalCombo').textContent='x'+game.maxCombo},430);
  }
  function showFeedback(text,points){ui.feedback.innerHTML=`${text}<b>${points}</b>`;ui.feedback.classList.remove('show');void ui.feedback.offsetWidth;ui.feedback.classList.add('show')}
  function showMilestone(km){ui.milestone.innerHTML=`${km} KM`;ui.milestone.classList.remove('show');void ui.milestone.offsetWidth;ui.milestone.classList.add('show')}
  function spawnCrashParticles(){const pl=playerScreen();for(let i=0;i<60;i++)game.particles.push({x:pl.x+rand(-22,22),y:pl.y+rand(-12,16),vx:rand(-260,260),vy:rand(-320,70),life:rand(.35,1),size:rand(2,7),hot:Math.random()>.3})}
  function updateParticles(dt){for(const p of game.particles){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=580*dt;p.vx*=.985}game.particles=game.particles.filter(p=>p.life>0)}

  function updateHUD(dt=0){
    const score=Math.floor(game.score);$('#scoreVal').textContent=score.toLocaleString();$('#bestVal').textContent=Math.max(game.best,score).toLocaleString();$('#nearVal').textContent=game.nearMisses;
    $('#distanceVal').textContent=game.distance.toFixed(1)+' KM';$('#comboVal').textContent='x'+game.combo;$('#locationVal').textContent=game.location;$('#weatherVal').textContent=`${game.environment} · ${game.weather}`;
    const shownSpeed=Math.round(game.speed);$('#speedVal').textContent=shownSpeed;$('#gearVal').textContent=clamp(Math.floor(shownSpeed/48)+1,1,7);$('#nitroVal').textContent=Math.round(game.nitro)+'%';$('#nitroBar').style.width=game.nitro+'%';
    $('#speedometer').style.setProperty('--pct',clamp(shownSpeed/330,0,1));$('#nitroGlow').classList.toggle('active',game.nitroActive);
    game.radarTick-=dt;if(game.radarTick<=0){game.radarTick=.12;updateRadar()}
  }
  function updateRadar(){const wrap=$('#radarDots');wrap.innerHTML='';for(const t of game.traffic.filter(t=>t.z<.86).slice(0,10)){const d=document.createElement('i');d.className='radar-dot';d.style.left=(50+(t.lane/1.8)*28)+'%';d.style.top=(78-t.z*68)+'%';wrap.appendChild(d)}}

  // ---------- OFFLINE AUDIO ----------
  let audioCtx=null,engineOsc=null,engineOsc2=null,engineGain=null,filter=null;
  function ensureAudio(){if(!settings.audio)return false;if(!audioCtx){audioCtx=new (window.AudioContext||window.webkitAudioContext)();engineGain=audioCtx.createGain();engineGain.gain.value=.0001;filter=audioCtx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=800;engineOsc=audioCtx.createOscillator();engineOsc.type='sawtooth';engineOsc2=audioCtx.createOscillator();engineOsc2.type='triangle';engineOsc.connect(filter);engineOsc2.connect(filter);filter.connect(engineGain);engineGain.connect(audioCtx.destination);engineOsc.start();engineOsc2.start()}audioCtx.resume?.();return true}
  function startEngine(){if(ensureAudio())setEngineGain(.04)}
  function stopEngine(){if(engineGain)setEngineGain(0)}
  function setEngineGain(v){if(engineGain&&audioCtx)engineGain.gain.setTargetAtTime(v,audioCtx.currentTime,.05)}
  function updateAudio(){if(!settings.audio||!audioCtx||!engineOsc)return;const f=42+game.speed*.72+(game.nitroActive?26:0);engineOsc.frequency.setTargetAtTime(f,audioCtx.currentTime,.03);engineOsc2.frequency.setTargetAtTime(f*.51,audioCtx.currentTime,.03);filter.frequency.setTargetAtTime(520+game.speed*5,audioCtx.currentTime,.05);setEngineGain(.028+game.speed/10000+(game.nitroActive?.012:0))}
  function playWhoosh(){if(!ensureAudio())return;const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type='sine';o.frequency.setValueAtTime(500,audioCtx.currentTime);o.frequency.exponentialRampToValueAtTime(90,audioCtx.currentTime+.18);g.gain.setValueAtTime(.035,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+.2);o.connect(g);g.connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+.21)}
  function playCrash(){if(!ensureAudio())return;const len=Math.floor(audioCtx.sampleRate*.36),buf=audioCtx.createBuffer(1,len,audioCtx.sampleRate),data=buf.getChannelData(0);for(let i=0;i<len;i++)data[i]=(Math.random()*2-1)*Math.pow(1-i/len,2);const src=audioCtx.createBufferSource(),g=audioCtx.createGain(),f=audioCtx.createBiquadFilter();f.type='lowpass';f.frequency.value=900;g.gain.value=.23;src.buffer=buf;src.connect(f);f.connect(g);g.connect(audioCtx.destination);src.start()}

  // ---------- WORLD DRAWING ----------
  function skyPalette(env){
    if(env==='NIGHT')return ['#081126','#142548','#3b4f73','#14241f'];
    return ['#2b2046','#7f3048','#ef6f43','#e7a15f'];
  }
  function drawBackground(w,h,time){
    const env='SUNSET',hz=h*.315;
    const sky=ctx.createLinearGradient(0,0,0,hz+90);
    sky.addColorStop(0,'#241c3f'); sky.addColorStop(.34,'#783348'); sky.addColorStop(.66,'#e85d3d'); sky.addColorStop(1,'#ffb35f');
    ctx.fillStyle=sky;ctx.fillRect(0,0,w,h);
    drawSunsetCloudBands(w,h,hz,time);
    drawSun(w,h,hz);
    drawMountainLayers(w,h,hz);
    drawCoastAndCity(w,h,hz);
    drawSideTerrain(w,h,hz);
    drawRoad(w,h,hz,env);
    drawRoadside(w,h,hz,env);
    drawSigns(w,h,hz,env);
    drawHorizonGlow(w,h,hz);
    if(game.weather==='RAIN')drawWetRoadGlow(w,h,hz);
  }
  function drawSunsetCloudBands(w,h,hz,time){
    ctx.save();
    const bands=[.07,.115,.155,.205];
    for(let b=0;b<bands.length;b++){
      const y=h*bands[b],amp=8+b*3,base=b%2?'rgba(247,115,92,.22)':'rgba(255,174,118,.18)';
      ctx.strokeStyle=base;ctx.lineWidth=10-b*1.4;ctx.lineCap='round';ctx.beginPath();
      for(let x=-60;x<=w+60;x+=70){const yy=y+Math.sin(x*.012+b*1.7+time*.00002)*amp+Math.sin(x*.031+b)*3;if(x===-60)ctx.moveTo(x,yy);else ctx.lineTo(x,yy)}
      ctx.stroke();
    }
    const haze=ctx.createLinearGradient(0,h*.18,0,hz);haze.addColorStop(0,'rgba(255,100,75,0)');haze.addColorStop(1,'rgba(255,178,92,.25)');ctx.fillStyle=haze;ctx.fillRect(0,h*.18,w,hz-h*.18);
    ctx.restore();
  }
  function drawSun(w,h,hz){
    const x=w*.50,y=h*.245;
    const g=ctx.createRadialGradient(x,y,6,x,y,108);g.addColorStop(0,'rgba(255,248,205,.98)');g.addColorStop(.15,'rgba(255,203,104,.76)');g.addColorStop(.48,'rgba(255,130,61,.22)');g.addColorStop(1,'rgba(255,110,40,0)');ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,108,0,TAU);ctx.fill();
    ctx.fillStyle='#fff0b4';ctx.shadowColor='rgba(255,190,92,.7)';ctx.shadowBlur=22;ctx.beginPath();ctx.arc(x,y,21,0,TAU);ctx.fill();ctx.shadowBlur=0;
  }
  function mountainPath(baseY,peaks,offset=0){ctx.beginPath();ctx.moveTo(0,baseY);for(let i=0;i<peaks.length;i++){const x=i/(peaks.length-1)*innerWidth;ctx.lineTo(x,baseY-peaks[i]-offset)}ctx.lineTo(innerWidth,baseY+160);ctx.lineTo(0,baseY+160);ctx.closePath()}
  function drawMountainLayers(w,h,hz){
    ctx.fillStyle='#493149';mountainPath(hz+24,[30,88,42,76,34,102,48,86,35,96,45,82,28],4);ctx.fill();
    ctx.fillStyle='#35283f';mountainPath(hz+38,[20,54,28,78,36,62,25,72,32,66,27,76,22],0);ctx.fill();
    const mist=ctx.createLinearGradient(0,hz-60,0,hz+80);mist.addColorStop(0,'rgba(255,170,115,0)');mist.addColorStop(1,'rgba(244,155,103,.17)');ctx.fillStyle=mist;ctx.fillRect(0,hz-70,w,160);
  }
  function drawCoastAndCity(w,h,hz){
    // Water occupies the left side, just like the reference illustration.
    const sea=ctx.createLinearGradient(0,hz,0,h);sea.addColorStop(0,'#31536c');sea.addColorStop(.52,'#18364d');sea.addColorStop(1,'#102a40');ctx.fillStyle=sea;ctx.fillRect(0,hz,w*.56,h-hz);
    // warm reflection path from the sun
    ctx.save();ctx.globalCompositeOperation='screen';
    for(let i=0;i<34;i++){const yy=hz+12+i*8.5,spread=16+i*4.1,alpha=.12*(1-i/38);ctx.strokeStyle=`rgba(255,176,83,${Math.max(.015,alpha)})`;ctx.lineWidth=2+(i/34)*6;ctx.beginPath();ctx.moveTo(w*.50-spread,yy);ctx.lineTo(w*.50+spread*.78,yy+Math.sin(i)*2);ctx.stroke()}
    ctx.restore();
    // city skyline on the coast
    const start=w*.11,end=w*.43,base=hz+15;
    for(let i=0;i<34;i++){const x=lerp(start,end,i/33),bw=5+(i%5)*2.5,bh=13+((i*19)%54);ctx.fillStyle=i%4===0?'#172737':'#203345';ctx.fillRect(x,base-bh,bw,bh);ctx.fillStyle='rgba(255,203,104,.84)';for(let yy=base-bh+5;yy<base-4;yy+=8){if((i+yy)%3!==0){ctx.fillRect(x+2,yy,1.2,1.2);if(bw>9)ctx.fillRect(x+bw-3,yy+2,1.1,1.1)}}}
    // shoreline light chain
    ctx.strokeStyle='rgba(255,191,92,.62)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,hz+24);ctx.bezierCurveTo(w*.18,hz+23,w*.32,hz+34,w*.49,hz+20);ctx.stroke();
  }
  function drawSideTerrain(w,h,hz){
    // right hillside
    const land=ctx.createLinearGradient(w*.55,hz,w,h);land.addColorStop(0,'#314339');land.addColorStop(1,'#17231d');ctx.fillStyle=land;ctx.beginPath();ctx.moveTo(w*.53,hz+5);ctx.lineTo(w,hz-8);ctx.lineTo(w,h);ctx.lineTo(w*.60,h);ctx.closePath();ctx.fill();
    // a slim left shoulder strip before the water
    ctx.fillStyle='#26382f';ctx.beginPath();ctx.moveTo(0,hz+16);ctx.lineTo(w*.48,hz+5);ctx.lineTo(w*.25,h);ctx.lineTo(0,h);ctx.closePath();ctx.fill();
  }
  function drawRoad(w,h,hz,env){
    const e=roadGeometry();
    // base asphalt
    const rg=ctx.createLinearGradient(0,hz,0,h);rg.addColorStop(0,'#46505b');rg.addColorStop(.35,'#363d47');rg.addColorStop(1,'#20242c');ctx.fillStyle=rg;ctx.beginPath();ctx.moveTo(e.topL,hz);ctx.lineTo(e.topR,hz);ctx.lineTo(e.botR,e.bottom);ctx.lineTo(e.botL,e.bottom);ctx.closePath();ctx.fill();
    // warm sunset sheen down the road centre
    const warm=ctx.createLinearGradient(w*.5,hz,w*.5,h);warm.addColorStop(0,'rgba(255,181,92,.18)');warm.addColorStop(.55,'rgba(255,155,79,.055)');warm.addColorStop(1,'rgba(255,120,70,0)');ctx.fillStyle=warm;ctx.beginPath();ctx.moveTo(e.topL,hz);ctx.lineTo(e.topR,hz);ctx.lineTo(e.botR,e.bottom);ctx.lineTo(e.botL,e.bottom);ctx.closePath();ctx.fill();
    // deterministic asphalt streaks (no flicker)
    ctx.save();ctx.globalAlpha=.12;for(let i=0;i<80;i++){const q=((i*0.071+game.roadOffset*.37)%1),p=Math.pow(q,1.7),y=hz+p*(e.bottom-hz),left=roadXAtY(y,-1),right=roadXAtY(y,1),x=lerp(left,right,((i*37)%101)/100),len=2+p*26;ctx.strokeStyle=i%3?'#d8d0c4':'#74808b';ctx.lineWidth=.5+p*1.1;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y+len);ctx.stroke()}ctx.restore();
    // road edges
    ctx.strokeStyle='rgba(8,12,18,.55)';ctx.lineWidth=12;ctx.beginPath();ctx.moveTo(e.topL,hz);ctx.lineTo(e.botL,e.bottom);ctx.moveTo(e.topR,hz);ctx.lineTo(e.botR,e.bottom);ctx.stroke();
    ctx.strokeStyle='#f5f3ed';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(e.topL,hz);ctx.lineTo(e.botL,e.bottom);ctx.moveTo(e.topR,hz);ctx.lineTo(e.botR,e.bottom);ctx.stroke();
    // lane markers
    for(let lane=-1;lane<=1;lane++)for(let i=0;i<24;i++){
      let p=(i/24+game.roadOffset)%1;p=Math.pow(p,1.72);const y=hz+p*(e.bottom-hz),y2=y+5+p*54;
      const frac=(lane+2)/4,cTop=lerp(e.topL,e.topR,frac),cBot=lerp(e.botL,e.botR,frac),t=Math.pow(clamp((y-hz)/(e.bottom-hz),0,1),.88),t2=Math.pow(clamp((y2-hz)/(e.bottom-hz),0,1),.88),x=lerp(cTop,cBot,t),x2=lerp(cTop,cBot,t2);
      ctx.strokeStyle='rgba(255,255,255,.92)';ctx.lineWidth=1+p*9;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x2,y2);ctx.stroke();
    }
  }
  function railPoint(side,p,extra=0){const e=roadGeometry(),y=e.horizon+Math.pow(p,1.66)*(e.bottom-e.horizon),x=roadXAtY(y,side)+side*(8+extra)*(0.18+p*1.2);return{x,y,p}}
  function drawRoadside(w,h,hz,env){
    drawGuardrail(-1);drawGuardrail(1);
    // reflectors and vegetation move with roadOffset
    for(let i=0;i<25;i++){
      let p=(i/25+game.roadOffset*.68)%1;p=Math.pow(p,1.58);const y=hz+p*(h-hz+92),s=.15+p*1.65;
      const lx=roadXAtY(y,-1)-28*s,rx=roadXAtY(y,1)+28*s;
      drawReflector(lx,y,s,'#ffd46a');drawReflector(rx,y,s,'#ffd46a');
      if(i%2===0){if(i%4===0)drawPine(lx-26*s,y-4*s,s*.70,'SUNSET');drawPine(rx+34*s,y-3*s,s*(.78+(i%3)*.08),'SUNSET')}
      if(i%5===0){drawShrub(rx+18*s,y,s*.7);}
    }
  }
  function drawGuardrail(side){
    const pts=[];for(let i=0;i<=28;i++)pts.push(railPoint(side,i/28,18));
    ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
    for(const offset of [0,9]){ctx.strokeStyle=offset?'#7e8a91':'#d9dde0';ctx.lineWidth=offset?2.2:3.2;ctx.beginPath();pts.forEach((p,i)=>{const x=p.x+side*offset*(.15+p.p);const y=p.y-offset*(.05+p.p*.06);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.stroke()}
    ctx.restore();
  }
  function drawReflector(x,y,s,color){ctx.save();ctx.strokeStyle='#c7cdd1';ctx.lineWidth=Math.max(1,1.6*s);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y-19*s);ctx.stroke();ctx.fillStyle=color;ctx.shadowColor=color;ctx.shadowBlur=7*s;ctx.fillRect(x-1.8*s,y-15*s,3.6*s,4.4*s);ctx.shadowBlur=0;ctx.restore()}
  function drawShrub(x,y,s){ctx.save();ctx.translate(x,y);ctx.fillStyle='#233b2c';for(let k=0;k<4;k++){ctx.beginPath();ctx.arc((k-1.5)*5*s,-6*s-Math.abs(k-1.5)*2*s,7*s,0,TAU);ctx.fill()}ctx.restore()}
  function drawPine(x,y,s,env){ctx.save();ctx.translate(x,y);ctx.fillStyle='#10251c';for(let k=0;k<4;k++){ctx.beginPath();ctx.moveTo(0,-46*s-k*8*s);ctx.lineTo(-13*s-k*1.4*s,-8*s+k*5*s);ctx.lineTo(13*s+k*1.4*s,-8*s+k*5*s);ctx.closePath();ctx.fill()}ctx.fillStyle='#33271c';ctx.fillRect(-2*s,-8*s,4*s,10*s);ctx.restore()}
  function drawSigns(w,h,hz,env){if(game.state!=='playing'&&game.state!=='crashed')return;const phase=(game.distance*.92)%5.2;if(phase<4.22)return;const p=(phase-4.22)/.98,y=hz+Math.pow(p,1.5)*(h*.36),s=.23+p*.78,x=roadXAtY(y,1)+82*s;ctx.save();ctx.translate(x,y);ctx.fillStyle='#245846';ctx.strokeStyle='#dbe5df';ctx.lineWidth=Math.max(1,1.7*s);roundRect(ctx,-72*s,-48*s,144*s,72*s,5*s);ctx.fill();ctx.stroke();ctx.fillStyle='#f2f5f3';ctx.font=`${Math.max(5,9*s)}px Arial`;ctx.fillText('COASTAL CITY   ↑  12 km',-60*s,-29*s);ctx.fillText('RIVERSIDE         24 km',-60*s,-12*s);ctx.fillText('MOUNTAIN PASS  68 km',-60*s,5*s);ctx.strokeStyle='#a8b7af';ctx.lineWidth=4*s;ctx.beginPath();ctx.moveTo(-45*s,23*s);ctx.lineTo(-45*s,60*s);ctx.moveTo(45*s,23*s);ctx.lineTo(45*s,60*s);ctx.stroke();ctx.restore()}
  function drawHorizonGlow(w,h,hz){const g=ctx.createLinearGradient(0,hz-20,0,hz+70);g.addColorStop(0,'rgba(255,204,136,.10)');g.addColorStop(1,'rgba(255,190,110,0)');ctx.fillStyle=g;ctx.fillRect(0,hz-20,w,90)}
  function drawWetRoadGlow(w,h,hz){const g=ctx.createLinearGradient(0,hz,0,h);g.addColorStop(0,'rgba(110,170,205,0)');g.addColorStop(1,'rgba(110,170,205,.09)');ctx.fillStyle=g;ctx.fillRect(0,hz,w,h-hz)}

  // ---------- CAR DRAWING ----------
  function drawPlayerCar(c,x,y,s,car,color,steer=0,reflection=false){
    c.save();c.translate(x,y);c.rotate(steer*.018);
    const w=car.width*s,h=car.height*s;
    drawCarShadow(c,w,h,s,reflection);
    const sprite=tintedCarSprite(car.style,color);
    if(sprite){
      c.imageSmoothingEnabled=true;
      // y is the tyre contact point. The sprite ends at the road instead of floating above it.
      c.drawImage(sprite,-w*.50,-h,w,h);
    }else{
      c.save();c.translate(0,-h*.46);switch(car.style){case'aventador':drawAventador(c,w,h,s,color);break;case'sf90':drawSF90(c,w,h,s,color);break;case'porsche':drawPorsche(c,w,h,s,color);break;case'gtr':drawGTR(c,w,h,s,color);break;case'mclaren':drawMcLaren(c,w,h,s,color);break}c.restore();
    }
    c.restore();
  }
  function drawCarShadow(c,w,h,s,reflection){
    c.save();
    const g=c.createRadialGradient(0,-h*.055,w*.08,0,-h*.055,w*.54);g.addColorStop(0,'rgba(0,0,0,.50)');g.addColorStop(.72,'rgba(0,0,0,.24)');g.addColorStop(1,'rgba(0,0,0,0)');c.fillStyle=g;c.beginPath();c.ellipse(0,-h*.045,w*.55,h*.12,0,0,TAU);c.fill();
    if(reflection){const r=c.createLinearGradient(0,-h*.02,0,h*.62);r.addColorStop(0,'rgba(255,90,70,.10)');r.addColorStop(1,'rgba(255,90,70,0)');c.fillStyle=r;c.fillRect(-w*.34,-h*.01,w*.68,h*.58)}
    c.restore();
  }
  function bodyGradient(c,paint,w,h){const g=c.createLinearGradient(-w*.5,-h*.6,w*.5,h*.5);g.addColorStop(0,lighten(paint,38));g.addColorStop(.35,paint);g.addColorStop(1,darken(paint,46));return g}
  function wheelPair(c,w,h,s,y=.08){c.fillStyle='#090b0e';c.fillRect(-w*.58,-h*y,w*.12,h*.36);c.fillRect(w*.46,-h*y,w*.12,h*.36);c.fillStyle='#252b31';c.fillRect(-w*.565,-h*(y-.05),w*.08,h*.22);c.fillRect(w*.485,-h*(y-.05),w*.08,h*.22)}
  function drawPlate(c,label,w,h,s){c.fillStyle='#0a0d11';c.fillRect(-w*.17,h*.19,w*.34,h*.14);c.strokeStyle='rgba(255,255,255,.22)';c.lineWidth=s;c.strokeRect(-w*.17,h*.19,w*.34,h*.14);c.fillStyle='#d9e1e7';c.textAlign='center';c.font=`bold ${Math.max(6,7*s)}px Arial`;c.fillText(label,0,h*.29);c.textAlign='left'}
  function tailGlow(c,x,y,w,h,s,color='#ff3636'){c.shadowColor=color;c.shadowBlur=9*s;c.fillStyle=color;roundRect(c,x,y,w,h,2*s);c.fill();c.shadowBlur=0}
  function drawAventador(c,w,h,s,p){wheelPair(c,w,h,s,.03);c.fillStyle=bodyGradient(c,p,w,h);c.beginPath();c.moveTo(-w*.50,h*.30);c.lineTo(-w*.56,h*.02);c.lineTo(-w*.42,-h*.37);c.lineTo(-w*.21,-h*.50);c.lineTo(w*.21,-h*.50);c.lineTo(w*.42,-h*.37);c.lineTo(w*.56,h*.02);c.lineTo(w*.50,h*.30);c.closePath();c.fill();c.fillStyle='#0b1117';c.beginPath();c.moveTo(-w*.30,-h*.38);c.lineTo(w*.30,-h*.38);c.lineTo(w*.24,-h*.09);c.lineTo(-w*.24,-h*.09);c.closePath();c.fill();c.fillStyle='#11161c';c.fillRect(-w*.49,h*.08,w*.98,h*.17);tailGlow(c,-w*.39,-h*.01,w*.20,h*.055,s);tailGlow(c,w*.19,-h*.01,w*.20,h*.055,s);c.strokeStyle='#ff4a43';c.lineWidth=3*s;c.beginPath();c.moveTo(-w*.37,-h*.02);c.lineTo(-w*.26,h*.05);c.lineTo(-w*.19,-h*.02);c.moveTo(w*.37,-h*.02);c.lineTo(w*.26,h*.05);c.lineTo(w*.19,-h*.02);c.stroke();c.fillStyle='#0b0d10';c.fillRect(-w*.45,h*.25,w*.9,h*.12);c.fillStyle='#16191c';c.fillRect(-w*.50,-h*.58,w,h*.055);c.fillRect(-w*.40,-h*.62,w*.06,h*.13);c.fillRect(w*.34,-h*.62,w*.06,h*.13);c.fillStyle='#16191c';c.beginPath();c.moveTo(-w*.14,h*.30);c.lineTo(-w*.04,h*.20);c.lineTo(w*.04,h*.20);c.lineTo(w*.14,h*.30);c.closePath();c.fill();drawPlate(c,'SVJ',w,h,s)}
  function drawSF90(c,w,h,s,p){wheelPair(c,w,h,s,.00);c.fillStyle=bodyGradient(c,p,w,h);c.beginPath();c.moveTo(-w*.48,h*.31);c.quadraticCurveTo(-w*.58,h*.05,-w*.43,-h*.31);c.quadraticCurveTo(-w*.25,-h*.51,0,-h*.52);c.quadraticCurveTo(w*.25,-h*.51,w*.43,-h*.31);c.quadraticCurveTo(w*.58,h*.05,w*.48,h*.31);c.closePath();c.fill();c.fillStyle='#0a0e13';c.beginPath();c.moveTo(-w*.31,-h*.40);c.lineTo(w*.31,-h*.40);c.lineTo(w*.24,-h*.11);c.lineTo(-w*.24,-h*.11);c.closePath();c.fill();c.fillStyle='#10161c';c.fillRect(-w*.43,-h*.02,w*.86,h*.23);tailGlow(c,-w*.37,h*.015,w*.25,h*.05,s);tailGlow(c,w*.12,h*.015,w*.25,h*.05,s);c.fillStyle='#090b0f';c.beginPath();c.moveTo(-w*.43,h*.20);c.lineTo(w*.43,h*.20);c.lineTo(w*.34,h*.37);c.lineTo(-w*.34,h*.37);c.closePath();c.fill();c.fillStyle='#1b1d20';c.beginPath();c.arc(-w*.11,h*.27,4*s,0,TAU);c.arc(w*.11,h*.27,4*s,0,TAU);c.fill();drawPlate(c,'SF90',w,h,s)}
  function drawPorsche(c,w,h,s,p){wheelPair(c,w,h,s,.00);c.fillStyle=bodyGradient(c,p,w,h);c.beginPath();c.moveTo(-w*.46,h*.31);c.quadraticCurveTo(-w*.53,h*.04,-w*.39,-h*.28);c.quadraticCurveTo(-w*.22,-h*.54,0,-h*.55);c.quadraticCurveTo(w*.22,-h*.54,w*.39,-h*.28);c.quadraticCurveTo(w*.53,h*.04,w*.46,h*.31);c.closePath();c.fill();c.fillStyle='#111820';c.beginPath();c.moveTo(-w*.29,-h*.42);c.lineTo(w*.29,-h*.42);c.lineTo(w*.24,-h*.12);c.lineTo(-w*.24,-h*.12);c.closePath();c.fill();c.fillStyle='#11151a';c.fillRect(-w*.47,-h*.58,w*.94,h*.052);c.fillRect(-w*.39,-h*.63,w*.055,h*.11);c.fillRect(w*.335,-h*.63,w*.055,h*.11);tailGlow(c,-w*.37,-h*.015,w*.74,h*.038,s);c.fillStyle='#090c10';c.beginPath();c.moveTo(-w*.41,h*.22);c.lineTo(w*.41,h*.22);c.lineTo(w*.32,h*.37);c.lineTo(-w*.32,h*.37);c.closePath();c.fill();c.fillStyle='#202326';c.beginPath();c.arc(-w*.26,h*.29,3.6*s,0,TAU);c.arc(w*.26,h*.29,3.6*s,0,TAU);c.fill();drawPlate(c,'GT3 RS',w,h,s)}
  function drawGTR(c,w,h,s,p){wheelPair(c,w,h,s,-.02);c.fillStyle=bodyGradient(c,p,w,h);roundRect(c,-w*.50,-h*.43,w,h*.76,8*s);c.fill();c.fillStyle='#0c1218';c.beginPath();c.moveTo(-w*.31,-h*.40);c.lineTo(w*.31,-h*.40);c.lineTo(w*.29,-h*.12);c.lineTo(-w*.29,-h*.12);c.closePath();c.fill();for(const sx of[-1,1]){tailGlow(c,sx*w*.24-w*.045,-h*.01,w*.09,w*.09,s);tailGlow(c,sx*w*.36-w*.035,-h*.005,w*.07,w*.07,s)}c.fillStyle='#0a0d10';c.fillRect(-w*.43,h*.17,w*.86,h*.18);c.fillStyle='#1f2225';for(const sx of[-1,1]){c.beginPath();c.arc(sx*w*.28,h*.29,3.4*s,0,TAU);c.arc(sx*w*.38,h*.29,3.4*s,0,TAU);c.fill()}drawPlate(c,'GT-R',w,h,s)}
  function drawMcLaren(c,w,h,s,p){wheelPair(c,w,h,s,.02);c.fillStyle=bodyGradient(c,p,w,h);c.beginPath();c.moveTo(-w*.46,h*.31);c.quadraticCurveTo(-w*.54,h*.08,-w*.36,-h*.31);c.quadraticCurveTo(-w*.20,-h*.52,0,-h*.53);c.quadraticCurveTo(w*.20,-h*.52,w*.36,-h*.31);c.quadraticCurveTo(w*.54,h*.08,w*.46,h*.31);c.quadraticCurveTo(w*.18,h*.23,0,h*.35);c.quadraticCurveTo(-w*.18,h*.23,-w*.46,h*.31);c.fill();c.fillStyle='#091017';c.beginPath();c.moveTo(-w*.28,-h*.42);c.lineTo(w*.28,-h*.42);c.lineTo(w*.20,-h*.12);c.lineTo(-w*.20,-h*.12);c.closePath();c.fill();c.strokeStyle='#ff3d37';c.lineWidth=4*s;c.shadowColor='#ff3d37';c.shadowBlur=8*s;c.beginPath();c.moveTo(-w*.37,-h*.01);c.quadraticCurveTo(-w*.28,h*.12,-w*.17,h*.11);c.moveTo(w*.37,-h*.01);c.quadraticCurveTo(w*.28,h*.12,w*.17,h*.11);c.stroke();c.shadowBlur=0;c.fillStyle='#0b0d10';c.fillRect(-w*.36,h*.20,w*.72,h*.14);drawPlate(c,'720S',w,h,s)}

  function drawTrafficVehicle(c,x,y,s,t){
    c.save();c.translate(x,y);const m=TRAFFIC_TYPES[t.type],w=m.w*s,h=m.h*s;drawCarShadow(c,w,h,s,game.weather==='RAIN');
    const img=trafficSprites[t.type];
    if(img&&img.complete&&img.naturalWidth){
      c.imageSmoothingEnabled=true;
      c.drawImage(img,-w*.50,-h*.66,w,h);
    }else{
      const p=TRAFFIC_COLORS[t.color%TRAFFIC_COLORS.length];
      switch(t.type){case'hatch':drawNpcHatch(c,w,h,s,p);break;case'sedan':drawNpcSedan(c,w,h,s,p);break;case'suv':drawNpcSUV(c,w,h,s,p);break;case'pickup':drawNpcPickup(c,w,h,s,p);break;case'van':drawNpcVan(c,w,h,s,p);break;case'truck':drawNpcTruck(c,w,h,s,p);break;case'bus':drawNpcBus(c,w,h,s,p);break;case'sport':drawNpcSport(c,w,h,s,p);break;}
    }
    if(t.blinker>0){c.fillStyle=Math.floor(t.blinker*8)%2?'#ffb323':'rgba(255,179,35,.2)';c.shadowColor='#ffb323';c.shadowBlur=8*s;c.fillRect(t.targetLane>t.lane?w*.31:-w*.36,h*.04,w*.055,h*.05);c.shadowBlur=0}
    c.restore();
  }
  function npcBody(c,w,h,s,p,round=5){c.fillStyle=bodyGradient(c,p,w,h);roundRect(c,-w*.48,-h*.45,w*.96,h*.78,round*s);c.fill();c.fillStyle='#0d151c';roundRect(c,-w*.30,-h*.36,w*.60,h*.24,3*s);c.fill();c.fillStyle='rgba(98,160,193,.18)';c.fillRect(-w*.27,-h*.33,w*.54,h*.08);c.fillStyle='#0a0c0f';c.fillRect(-w*.55,-h*.02,w*.10,h*.28);c.fillRect(w*.45,-h*.02,w*.10,h*.28);tailGlow(c,-w*.35,h*.13,w*.18,4*s,s);tailGlow(c,w*.17,h*.13,w*.18,4*s,s)}
  function drawNpcHatch(c,w,h,s,p){npcBody(c,w,h,s,p,7);c.fillStyle='#111820';c.fillRect(-w*.33,-h*.10,w*.66,h*.10);drawPlate(c,'HATCH',w,h,s)}
  function drawNpcSedan(c,w,h,s,p){npcBody(c,w,h,s,p,6);c.fillStyle='#13191e';c.fillRect(-w*.38,h*.24,w*.76,h*.07);drawPlate(c,'SEDAN',w,h,s)}
  function drawNpcSUV(c,w,h,s,p){c.fillStyle=bodyGradient(c,p,w,h);roundRect(c,-w*.48,-h*.50,w*.96,h*.84,5*s);c.fill();c.fillStyle='#0c151d';roundRect(c,-w*.34,-h*.39,w*.68,h*.30,3*s);c.fill();c.fillStyle='#080a0c';c.fillRect(-w*.56,-h*.02,w*.11,h*.31);c.fillRect(w*.45,-h*.02,w*.11,h*.31);tailGlow(c,-w*.37,h*.12,w*.18,5*s,s);tailGlow(c,w*.19,h*.12,w*.18,5*s,s);c.fillStyle='#20262c';c.fillRect(-w*.38,h*.27,w*.76,h*.06);drawPlate(c,'SUV',w,h,s)}
  function drawNpcPickup(c,w,h,s,p){npcBody(c,w,h,s,p,4);c.fillStyle=darken(p,26);c.fillRect(-w*.42,h*.02,w*.84,h*.20);c.strokeStyle='rgba(255,255,255,.12)';c.strokeRect(-w*.38,h*.04,w*.76,h*.14);drawPlate(c,'PICKUP',w,h,s)}
  function drawNpcVan(c,w,h,s,p){c.fillStyle=bodyGradient(c,p,w,h);roundRect(c,-w*.48,-h*.58,w*.96,h*.92,4*s);c.fill();c.fillStyle='#0a131a';roundRect(c,-w*.34,-h*.46,w*.68,h*.34,2*s);c.fill();c.fillStyle='#080a0c';c.fillRect(-w*.55,-h*.03,w*.1,h*.31);c.fillRect(w*.45,-h*.03,w*.1,h*.31);tailGlow(c,-w*.38,h*.11,w*.15,5*s,s);tailGlow(c,w*.23,h*.11,w*.15,5*s,s);drawPlate(c,'VAN',w,h,s)}
  function drawNpcTruck(c,w,h,s,p){c.fillStyle='#d4d8db';roundRect(c,-w*.46,-h*.70,w*.92,h*.60,3*s);c.fill();c.fillStyle='#9ea7ad';c.fillRect(-w*.40,-h*.65,w*.80,h*.06);c.fillStyle=bodyGradient(c,p,w,h);roundRect(c,-w*.40,-h*.08,w*.80,h*.42,4*s);c.fill();c.fillStyle='#0a131a';c.fillRect(-w*.27,-h*.01,w*.54,h*.14);c.fillStyle='#090b0d';c.fillRect(-w*.50,h*.04,w*.10,h*.30);c.fillRect(w*.40,h*.04,w*.10,h*.30);tailGlow(c,-w*.31,h*.20,w*.14,5*s,s);tailGlow(c,w*.17,h*.20,w*.14,5*s,s);drawPlate(c,'TRUCK',w,h,s)}
  function drawNpcBus(c,w,h,s,p){c.fillStyle=bodyGradient(c,p,w,h);roundRect(c,-w*.46,-h*.72,w*.92,h*1.06,5*s);c.fill();c.fillStyle='#071018';roundRect(c,-w*.34,-h*.59,w*.68,h*.43,3*s);c.fill();c.strokeStyle='rgba(255,255,255,.18)';c.lineWidth=s;for(let yy=-.48;yy<-.18;yy+=.10){c.beginPath();c.moveTo(-w*.31,h*yy);c.lineTo(w*.31,h*yy);c.stroke()}tailGlow(c,-w*.36,h*.16,w*.15,6*s,s);tailGlow(c,w*.21,h*.16,w*.15,6*s,s);drawPlate(c,'BUS',w,h,s)}
  function drawNpcSport(c,w,h,s,p){c.fillStyle=bodyGradient(c,p,w,h);c.beginPath();c.moveTo(-w*.50,h*.31);c.lineTo(-w*.44,-h*.28);c.quadraticCurveTo(0,-h*.54,w*.44,-h*.28);c.lineTo(w*.50,h*.31);c.closePath();c.fill();c.fillStyle='#091018';c.beginPath();c.moveTo(-w*.27,-h*.39);c.lineTo(w*.27,-h*.39);c.lineTo(w*.22,-h*.12);c.lineTo(-w*.22,-h*.12);c.closePath();c.fill();tailGlow(c,-w*.36,h*.08,w*.22,4*s,s);tailGlow(c,w*.14,h*.08,w*.22,4*s,s);c.fillStyle='#0b0d10';c.fillRect(-w*.4,h*.23,w*.8,h*.10);drawPlate(c,'SPORT',w,h,s)}

  function roundRect(c,x,y,w,h,r){r=Math.min(r,w/2,h/2);c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath()}
  function lighten(hex,n){const v=parseInt(hex.slice(1),16),r=Math.min(255,(v>>16)+n),g=Math.min(255,((v>>8)&255)+n),b=Math.min(255,(v&255)+n);return`rgb(${r},${g},${b})`}
  function darken(hex,n){const v=parseInt(hex.slice(1),16),r=Math.max(0,(v>>16)-n),g=Math.max(0,((v>>8)&255)-n),b=Math.max(0,(v&255)-n);return`rgb(${r},${g},${b})`}

  function drawSpeedLines(w,h){if(!settings.motion||game.state!=='playing'||game.speed<145)return;const a=Math.min(.24,(game.speed-145)/450);ctx.strokeStyle=`rgba(210,240,255,${a})`;ctx.lineWidth=1.2;for(let i=0;i<22;i++){const side=i%2?-1:1,x=side<0?rand(0,w*.22):rand(w*.78,w),y=rand(h*.35,h*.96),len=18+(game.speed/320)*38;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+side*len*.42,y+len);ctx.stroke()}}
  function drawRain(w,h){if(game.weather!=='RAIN'||!settings.rain)return;ctx.strokeStyle='rgba(197,227,249,.36)';ctx.lineWidth=1;for(let i=0;i<120;i++){const x=(i*91.7+game.time*520)%w,y=(i*57.3+game.time*790)%h;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-7,y+19);ctx.stroke()}}
  function drawTrafficReflections(){if(game.weather!=='RAIN'&&game.environment!=='NIGHT')return;for(const t of game.traffic){if(t.z<.55||t.z>1.05)continue;const p=laneToScreen(t.lane,t.z),m=TRAFFIC_TYPES[t.type],w=m.w*p.scale;const g=ctx.createLinearGradient(p.x,p.y,p.x,p.y+70*p.scale);g.addColorStop(0,'rgba(255,55,45,.17)');g.addColorStop(1,'rgba(255,55,45,0)');ctx.fillStyle=g;ctx.fillRect(p.x-w*.32,p.y+6*p.scale,w*.64,70*p.scale)}}

  function drawScene(time){
    const w=innerWidth,h=innerHeight;ctx.save();let sx=0,sy=0;if(settings.shake&&game.shake>0){sx=rand(-1,1)*game.shake*12;sy=rand(-1,1)*game.shake*7}ctx.translate(sx,sy);
    drawBackground(w,h,time);drawTrafficReflections();
    const sorted=[...game.traffic].sort((a,b)=>a.z-b.z);for(const t of sorted){const p=laneToScreen(t.lane,t.z);if(p.y>h*.27&&p.y<h+150)drawTrafficVehicle(ctx,p.x,p.y,p.scale,t)}
    const pl=playerScreen();drawPlayerCar(ctx,pl.x,pl.y,pl.scale,CARS[settings.car],PAINTS[settings.paint],game.steer,game.weather==='RAIN');
    drawCollisionDebug();
    if(game.nitroActive)drawNitroFlames(pl);drawSpeedLines(w,h);drawRain(w,h);
    for(const p of game.particles){ctx.globalAlpha=Math.max(0,p.life);ctx.fillStyle=p.hot?'#ffb24b':'#ff493e';ctx.fillRect(p.x,p.y,p.size,p.size)}ctx.globalAlpha=1;ctx.restore();
  }
  function drawNitroFlames(pl){ctx.save();ctx.translate(pl.x,pl.y);ctx.globalCompositeOperation='lighter';for(const sx of[-1,1]){const x=sx*pl.w*.14,y=-pl.h*.04;const g=ctx.createLinearGradient(x,y,x,y+48);g.addColorStop(0,'rgba(255,255,255,.96)');g.addColorStop(.20,'rgba(61,236,255,.98)');g.addColorStop(.55,'rgba(26,130,255,.70)');g.addColorStop(1,'rgba(30,105,255,0)');ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(x-4,y);ctx.lineTo(x+4,y);ctx.lineTo(x+rand(-3,3),y+rand(25,46));ctx.closePath();ctx.fill()}ctx.restore()}

  function drawGarage(time){
    if(!ui.garage.classList.contains('active'))return;const w=garageCanvas.width,h=garageCanvas.height;gctx.clearRect(0,0,w,h);const grad=gctx.createLinearGradient(0,0,0,h);grad.addColorStop(0,'#1b2530');grad.addColorStop(.52,'#0b1118');grad.addColorStop(1,'#05080d');gctx.fillStyle=grad;gctx.fillRect(0,0,w,h);
    gctx.fillStyle='rgba(255,255,255,.025)';for(let x=0;x<w;x+=90)gctx.fillRect(x,0,1,h);for(let y=0;y<h;y+=90)gctx.fillRect(0,y,w,1);
    const spot=gctx.createRadialGradient(w*.5,h*.47,5,w*.5,h*.47,260);spot.addColorStop(0,'rgba(90,220,255,.18)');spot.addColorStop(1,'rgba(0,0,0,0)');gctx.fillStyle=spot;gctx.fillRect(0,0,w,h);
    gctx.save();gctx.translate(w/2,h*.68);gctx.scale(1,-.30);gctx.globalAlpha=.20;drawPlayerCar(gctx,0,0,2.45,CARS[settings.car],PAINTS[settings.paint],0,false);gctx.restore();
    drawPlayerCar(gctx,w/2,h*.58,2.55,CARS[settings.car],PAINTS[settings.paint],Math.sin(time*.0007)*.04,false);
    gctx.fillStyle='rgba(255,255,255,.65)';gctx.font='11px Arial';gctx.textAlign='center';gctx.fillText('OFFLINE GARAGE · SELECTED VEHICLE',w/2,h-28);gctx.textAlign='left';
  }

  function animate(t){
    const dt=Math.min(.034,(t-game.lastT)/1000||0);game.lastT=t;
    if(game.state==='playing')update(dt);
    else if(game.state==='menu'){game.demoT+=dt;game.roadOffset=(game.roadOffset+dt*.18)%1;game.environment='SUNSET';game.weather='CLEAR';game.location='COASTAL EXPRESSWAY';game.playerX=Math.sin(game.demoT*.35)*.07;if(game.traffic.length<9)spawnTraffic(.04+game.traffic.length*.085);for(const tr of game.traffic)tr.z+=dt*.065*tr.speed;if(game.traffic.some(tr=>tr.z>1.2))game.traffic=game.traffic.filter(tr=>tr.z<=1.2)}
    else if(game.state==='crashed')updateParticles(dt);
    drawScene(t);drawGarage(t);requestAnimationFrame(animate);
  }

  renderGarageUI();goMenu();requestAnimationFrame(animate);
})();
