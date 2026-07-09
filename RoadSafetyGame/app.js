(function(){

  // build marker - check the browser console (F12) to confirm you're running
  // this version and that the real car sounds loaded
  console.log('%cNavigator build: real-car-sounds v3', 'color:#4c8c3c;font-weight:bold');
  console.log('Sounds file loaded:', !!window.GAME_SOUNDS,
              window.GAME_SOUNDS ? '(' + Object.keys(window.GAME_SOUNDS).join(', ') + ')' : '- sounds.js NOT found, check the <script src="sounds.js"> tag and that the file is in the folder');

  // ---------- basic setup ----------
  const holder = document.getElementById('canvasHolder');
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fd6ea);
  scene.fog = new THREE.Fog(0x9fd6ea, 28, 54);

  const TILE = 1;

  /* ============================================================
     AI QUIZ QUESTIONS
     ------------------------------------------------------------
     Questions are generated server-side by the "Quiz Question Generator"
     n8n workflow (Webhook -> Basic LLM Chain -> OpenRouter Chat Model ->
     Parse Quiz JSON -> Respond to Webhook). No OpenRouter key lives in
     this file anymore - it's attached to the OpenRouter Chat Model node's
     credential inside n8n instead.
     Set AI_QUESTIONS to false to disable the AI quiz entirely (it has no
     built-in question bank fallback - if generation fails, the quiz is
     just skipped for that round).
     ============================================================ */
  const AI_QUESTIONS         = true;            // false = quiz is never shown
  const N8N_QUIZ_WEBHOOK_URL = 'https://n8ngc.codeblazar.org/webhook/quiz-question'; // Quiz Question Generator workflow
  console.log('[AI quiz] enabled:', AI_QUESTIONS, '| via n8n webhook:', N8N_QUIZ_WEBHOOK_URL);

  /* ---- n8n webhooks (paste the URL n8n gives each workflow; blank = feature off) ---- */
  const N8N_CERT_WEBHOOK_URL = 'https://n8ngc.codeblazar.org/webhook/game-complete';   // certificate email workflow (Get Certificate button)
  const CERT_MIN_SCORE       = 50;  // points needed before the Get Certificate button appears
  const CERT_ISSUER          = 'Navigator+ Vitality';  // "Issued By" line on the certificate
  const CERT_CHALLENGE       = 'Road Safety';          // challenge name printed on the certificate
  const N8N_CERT_SECRET      = 'mySecret123';          // MUST match the secret check in your n8n 'If' node


  const CAM_FOV = 12;
  const CAM_DIST = 34;
  const CAM_DIR = new THREE.Vector3(-1, 1.2, -1).normalize();
  let aspect = window.innerWidth / window.innerHeight;
  const camera = new THREE.PerspectiveCamera(CAM_FOV, aspect, 0.1, 200);

  const renderer = new THREE.WebGLRenderer({ antialias:true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  holder.appendChild(renderer.domElement);

  function updateCameraAspect(){
    aspect = window.innerWidth / window.innerHeight;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
  }
  updateCameraAspect();

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    updateCameraAspect();
  });

  // ---------- lights ----------
  const hemi = new THREE.HemisphereLight(0xffffff, 0x8d9d6a, 0.85);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff3d6, 1.05);
  sun.position.set(-20, 30, -10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -20;
  sun.shadow.camera.right = 20;
  sun.shadow.camera.top = 20;
  sun.shadow.camera.bottom = -20;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 60;
  scene.add(sun);
  scene.add(sun.target);

  // ---------- helpers ----------
  function box(w,h,d,color, mat){
    const geo = new THREE.BoxGeometry(w,h,d);
    const material = mat || new THREE.MeshLambertMaterial({ color });
    const m = new THREE.Mesh(geo, material);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }
  function rand(a,b){ return a + Math.random()*(b-a); }
  function randInt(a,b){ return Math.floor(rand(a,b+1)); }
  function choice(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
  function clamp(v,a,b){ return Math.max(a, Math.min(b,v)); }

  // ---------- 3D model kit (Kenney Car Kit, CC0) ----------
  const MODEL_FILES = {
    // everyday traffic
    sedan:'models/sedan.glb', taxi:'models/taxi.glb',
    suv:'models/suv.glb', truck:'models/truck.glb', delivery:'models/delivery.glb',
    hatchback:'models/hatchback-sports.glb', sportsedan:'models/sedan-sports.glb',
    // emergency vehicles
    ambulance:'models/ambulance.glb', police:'models/police.glb', firetruck:'models/firetruck.glb',
    // obstacles
    cone:'models/cone.glb', box:'models/box.glb'
  };
  const TRAFFIC_MODELS = ['sedan','taxi','suv','truck','delivery','hatchback','sportsedan'];
  const modelCache = {};     // name -> prepared THREE.Object3D template (to clone)
  let modelsReady = false;

  const CAR_MODEL_SCALE = 0.42;

  function prepareModelTemplate(gltf){
    const root = gltf.scene || gltf.scenes[0];
    root.traverse(o=>{
      if (o.isMesh){
        o.castShadow = true; o.receiveShadow = true;
        if (o.material){
          o.material = o.material.clone();
          o.material.transparent = true;
        }
      }
    });
    return root;
  }

  function loadAllModels(onDone){
    if (typeof THREE.GLTFLoader === 'undefined'){
      console.error('[models] THREE.GLTFLoader is undefined - the GLTFLoader.js script did not load. Cars will be boxes. Make sure GLTFLoader.js sits next to index.html.');
      if (onDone) onDone();
      return;
    }
    const loader = new THREE.GLTFLoader();
    const names = Object.keys(MODEL_FILES);
    let remaining = names.length;
    let loaded = 0, failed = 0;
    if (!remaining){ if (onDone) onDone(); return; }
    console.log('[models] loading', remaining, 'car models...');
    names.forEach(name=>{
      loader.load(
        MODEL_FILES[name],
        gltf => {
          modelCache[name] = prepareModelTemplate(gltf);
          loaded++;
          if (--remaining === 0){ modelsReady = true; console.log('[models] done -', loaded, 'loaded,', failed, 'failed'); if (onDone) onDone(); }
        },
        undefined,
        err => {
          failed++;
          console.error('[models] FAILED to load', MODEL_FILES[name], '- is the file in the models/ folder and are you running through a local server (not file://)?', err);
          if (--remaining === 0){ modelsReady = true; console.log('[models] done -', loaded, 'loaded,', failed, 'failed'); if (onDone) onDone(); }
        }
      );
    });
  }

  function modelVehicle(name, fallbackColor){
    const wrap = new THREE.Group();
    const tmpl = modelCache[name];
    if (tmpl){
      const inst = tmpl.clone(true);
      inst.scale.setScalar(CAR_MODEL_SCALE);
      inst.rotation.y = Math.PI/2; // models natively face +Z; rotate so front points +X (travel direction)
      wrap.add(inst);
    } else {
      const body = box(1.0,0.35,0.62, fallbackColor || choice(CAR_COLORS));
      body.position.y = 0.28;
      const cabin = box(0.55,0.3,0.55,0xdfeff5);
      cabin.position.set(0.05,0.58,0);
      wrap.add(body, cabin);
    }
    wrap.traverse(o=>{
      if(o.isMesh){
        o.castShadow=true; o.receiveShadow=true;
        if (o.material && !o.material.transparent){ o.material = o.material.clone(); o.material.transparent = true; }
      }
    });
    return wrap;
  }

  // ---------- audio (synthesized via Web Audio, no files needed) ----------
  const Sound = (function(){
    let ctx = null;
    let master = null;
    let muted = false;

    function ensure(){
      if (!ctx){
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.5;
        master.connect(ctx.destination);
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }

    const buffers = {};   // name -> decoded AudioBuffer
    const loading = {};   // name -> Promise, so we only decode once

    function dataUriToArrayBuffer(dataUri){
      const comma = dataUri.indexOf(',');
      const b64 = comma >= 0 ? dataUri.slice(comma + 1) : dataUri;
      const binary = atob(b64);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
      return bytes.buffer;
    }

    function loadSample(name, dataUri){
      if (buffers[name]) return Promise.resolve(buffers[name]);
      if (loading[name]) return loading[name];
      const c = ensure(); if (!c) return Promise.resolve(null);
      loading[name] = new Promise((resolve) => {
        let ab;
        try { ab = dataUriToArrayBuffer(dataUri); }
        catch (e){ console.warn('Sound: bad audio data for', name, e); resolve(null); return; }
        c.decodeAudioData(
          ab,
          buf => { buffers[name] = buf; resolve(buf); },
          err => { console.warn('Sound: could not decode', name, err); resolve(null); }
        );
      });
      return loading[name];
    }

    function preloadSamples(){
      const src = window.GAME_SOUNDS || {};
      Object.keys(src).forEach(name => loadSample(name, src[name]));
    }

    function playSample(name, { gain=1, rate=1 } = {}){
      if (muted) return;
      const c = ensure(); if (!c) return;
      const buf = buffers[name];
      if (!buf){
        const src = window.GAME_SOUNDS || {};
        if (src[name]){
          loadSample(name, src[name]);        
          playViaAudioElement(name, gain);    
        }
        return;
      }
      const source = c.createBufferSource();
      source.buffer = buf;
      source.playbackRate.value = rate;
      const g = c.createGain();
      g.gain.value = gain;
      source.connect(g); g.connect(master);
      source.start();
    }

    const audioElPool = {};
    function playViaAudioElement(name, gain){
      const src = window.GAME_SOUNDS || {};
      if (!src[name]) return;
      try {
        let el = audioElPool[name];
        if (!el){
          el = new Audio(src[name]);
          el.preload = 'auto';
          audioElPool[name] = el;
        }
        el.volume = Math.max(0, Math.min(1, gain));
        el.currentTime = 0;
        const p = el.play();
        if (p && p.catch) p.catch(()=>{});
      } catch(e){ /* no-op */ }
    }

    function tone({ freq=440, type='sine', dur=0.15, gain=0.3, attack=0.008, decay=null, slideTo=null, delay=0 }){
      if (muted) return;
      const c = ensure(); if (!c) return;
      const t0 = c.currentTime + delay;
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo){ osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur); }
      const peak = gain;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
      const end = t0 + (decay || dur);
      g.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(g); g.connect(master);
      osc.start(t0);
      osc.stop(end + 0.02);
    }

    function noise({ dur=0.2, gain=0.3, type='lowpass', freq=800, delay=0 }){
      if (muted) return;
      const c = ensure(); if (!c) return;
      const t0 = c.currentTime + delay;
      const frames = Math.floor(c.sampleRate * dur);
      const buffer = c.createBuffer(1, frames, c.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i=0;i<frames;i++) data[i] = (Math.random()*2 - 1) * (1 - i/frames);
      const src = c.createBufferSource(); src.buffer = buffer;
      const filter = c.createBiquadFilter(); filter.type = type; filter.frequency.value = freq;
      const g = c.createGain();
      g.gain.setValueAtTime(gain, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(filter); filter.connect(g); g.connect(master);
      src.start(t0);
      src.stop(t0 + dur + 0.02);
    }

    const fx = {
      hop(){ tone({ freq:520, type:'square', dur:0.09, gain:0.14, slideTo:660 }); },
      safe(){ 
        tone({ freq:660, type:'triangle', dur:0.12, gain:0.2 });
        tone({ freq:880, type:'triangle', dur:0.16, gain:0.2, delay:0.1 });
      },
      point(){ tone({ freq:990, type:'triangle', dur:0.1, gain:0.16 }); },
      correct(){
        tone({ freq:660, type:'triangle', dur:0.1, gain:0.22 });
        tone({ freq:990, type:'triangle', dur:0.14, gain:0.22, delay:0.09 });
      },
      wrong(){ tone({ freq:300, type:'sawtooth', dur:0.22, gain:0.16, slideTo:180 }); },
      quizOpen(){ tone({ freq:520, type:'sine', dur:0.14, gain:0.16, slideTo:700 }); },
      green(){ 
        tone({ freq:587, type:'triangle', dur:0.12, gain:0.18 });
        tone({ freq:784, type:'triangle', dur:0.18, gain:0.18, delay:0.11 });
      },
      jaywalk(){ 
        tone({ freq:220, type:'sawtooth', dur:0.28, gain:0.2, slideTo:150 });
        noise({ dur:0.18, gain:0.1, freq:1200, delay:0.02 });
      },
      splat(){ 
        noise({ dur:0.28, gain:0.35, type:'lowpass', freq:500 });
        tone({ freq:200, type:'sawtooth', dur:0.3, gain:0.2, slideTo:70 });
      },
      siren(){
        const hi = 740, lo = 560;
        const step = 0.42;
        for (let i=0;i<4;i++){
          tone({ freq:hi, type:'square', dur:step*0.95, gain:0.12, delay:i*step*2 });
          tone({ freq:lo, type:'square', dur:step*0.95, gain:0.12, delay:i*step*2 + step });
        }
      },
      start(){
        tone({ freq:523, type:'triangle', dur:0.1, gain:0.2 });
        tone({ freq:659, type:'triangle', dur:0.1, gain:0.2, delay:0.09 });
        tone({ freq:784, type:'triangle', dur:0.18, gain:0.2, delay:0.18 });
      },
      honk(){ playSample('horn', { gain:0.7 }); }
    };

    let engineNodes = null;
    let engineTargetGain = 0;

    function startEngineHum(){
      const c = ensure(); if (!c) return;
      if (engineNodes) return;
      const oscA = c.createOscillator();
      const oscB = c.createOscillator();
      oscA.type = 'sawtooth'; oscB.type = 'sawtooth';
      oscA.frequency.value = 70; oscB.frequency.value = 104; 
      const frames = Math.floor(c.sampleRate * 1.5);
      const nb = c.createBuffer(1, frames, c.sampleRate);
      const nd = nb.getChannelData(0);
      for (let i=0;i<frames;i++) nd[i] = (Math.random()*2-1) * 0.5;
      const noiseSrc = c.createBufferSource();
      noiseSrc.buffer = nb; noiseSrc.loop = true;
      const noiseGain = c.createGain(); noiseGain.gain.value = 0.25;
      const filter = c.createBiquadFilter();
      filter.type = 'lowpass'; filter.frequency.value = 260; filter.Q.value = 0.8;
      const g = c.createGain(); g.gain.value = 0; 
      oscA.connect(filter); oscB.connect(filter);
      noiseSrc.connect(noiseGain); noiseGain.connect(filter);
      filter.connect(g); g.connect(master);
      oscA.start(); oscB.start(); noiseSrc.start();
      engineNodes = { oscA, oscB, noiseSrc, filter, gain: g };
    }

    function setEngineLevel(level){
      engineTargetGain = muted ? 0 : Math.min(0.22, level * 0.22);
      if (engineNodes){
        const now = ctx.currentTime;
        engineNodes.gain.gain.setTargetAtTime(engineTargetGain, now, 0.08);
        engineNodes.filter.frequency.setTargetAtTime(220 + level*220, now, 0.1);
      }
    }

    function stopEngineHum(){
      if (!engineNodes) return;
      const now = ctx.currentTime;
      engineNodes.gain.gain.setTargetAtTime(0, now, 0.1);
      const n = engineNodes;
      setTimeout(()=>{ try { n.oscA.stop(); n.oscB.stop(); n.noiseSrc.stop(); } catch(e){} }, 300);
      engineNodes = null;
    }

    return {
      play(name){ if (fx[name]) fx[name](); },
      resume(){
        ensure();
        if (!window.GAME_SOUNDS){
          console.warn('Sound: window.GAME_SOUNDS is missing - is sounds.js loaded before app.js?');
        }
        preloadSamples();
      },
      preloadSamples,
      startEngineHum, setEngineLevel, stopEngineHum,
      toggleMute(){
        muted = !muted;
        if (engineNodes) engineNodes.gain.gain.value = muted ? 0 : engineTargetGain;
        return muted;
      },
      isMuted(){ return muted; }
    };
  })();

  // ---------- world config ----------
  const COL_MIN = -5, COL_MAX = 5; 

  const GROUND_PAD = 40;
  const GROUND_W = (COL_MAX - COL_MIN) + GROUND_PAD;

  const CAR_COLORS = [0xe74c3c, 0xf1c40f, 0x3498db, 0xe67e22, 0x9b59b6, 0x1abc9c, 0xecf0f1];

  const BIOME_LENGTH = 16;
  const BIOME_ORDER = ['park', 'town', 'school'];
  const BIOME_DATA = {
    park:   { grassColors: [0x7bc464, 0x86cf6d], roadTint: 0x555a5f },
    town:   { grassColors: [0x8fae7e, 0x9ab98a], roadTint: 0x4b4f54 },
    school: { grassColors: [0x82c46b, 0x8fce76], roadTint: 0x555a5f }
  };
  function biomeForRow(rowIndex){
    const i = Math.floor(Math.max(0, rowIndex) / BIOME_LENGTH) % BIOME_ORDER.length;
    return BIOME_ORDER[i];
  }

  const DIFFICULTY_CAP_ROW = 150;
  function difficultyFactor(rowIndex){
    return 1 + Math.min(Math.max(rowIndex, 0), DIFFICULTY_CAP_ROW) / DIFFICULTY_CAP_ROW;
  }
  function scaleRange(range, factor){
    return [range[0] * factor, range[1] * factor];
  }

  const EMERGENCY_EVENT_CHANCE = 0.12;
  let emergencyVehicles = [];

  let rows = {};
  let rowGroupParent = new THREE.Group();
  scene.add(rowGroupParent);

  let maxGeneratedRow = -1;
  let lastLaneCol = 0;

  function makeTreeObstacle(){
    const tree = new THREE.Group();
    const trunk = box(0.28,0.5,0.28,0x8a5a34);
    trunk.position.y = 0.25;
    const foliageColor = choice([0x3f8f3f, 0x4aa14a, 0x357a35]);
    const foliage = box(0.85,0.85,0.85, foliageColor);
    foliage.position.y = 0.85;
    foliage.rotation.y = rand(0,1);
    tree.add(trunk, foliage);
    return tree;
  }

  function makeFlowerPatch(){
    const g = new THREE.Group();
    const petalColors = [0xff6b81, 0xffd93d, 0xff9f43, 0xc56cf0, 0xf7f1e3, 0xff8fa3];
    const count = Math.floor(rand(3, 6));
    const stemMat = new THREE.MeshLambertMaterial({ color: 0x3f8f3f });
    for (let i = 0; i < count; i++){
      const angle = rand(0, Math.PI*2);
      const r = rand(0, 0.26);
      const fx = Math.cos(angle) * r;
      const fz = Math.sin(angle) * r;
      const stem = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.03), stemMat);
      stem.position.set(fx, 0.06, fz);
      g.add(stem);
      const bloomColor = choice(petalColors);
      const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), new THREE.MeshLambertMaterial({ color: bloomColor }));
      bloom.position.set(fx, 0.13, fz);
      g.add(bloom);
    }
    g.traverse(o=>{ if(o.isMesh){ o.castShadow=false; } });
    return g;
  }

  function makeConeObstacle(){
    return modelProp('cone', 0.9, buildBoxCone);
  }
  function buildBoxCone(){
    const g = new THREE.Group();
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.22, 0.42, 10),
      new THREE.MeshLambertMaterial({ color: 0xe8641c })
    );
    cone.position.y = 0.21;
    g.add(cone);
    const stripe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.18, 0.08, 10),
      new THREE.MeshLambertMaterial({ color: 0xffffff })
    );
    stripe.position.y = 0.22;
    g.add(stripe);
    const base = box(0.32, 0.05, 0.32, 0x3a3a3a);
    base.position.y = 0.025;
    g.add(base);
    g.traverse(o=>{ if(o.isMesh){ o.castShadow=true; } });
    return g;
  }

  function clearApproachPath(crossingStartRow, laneMin, laneMax){
    let r = crossingStartRow - 1;
    while (rows[r] && rows[r].type === 'grass'){
      const rd = rows[r];
      for (let c = laneMin; c <= laneMax; c++){
        if (rd.blocked.has(c)){
          rd.blocked.delete(c);
          const mesh = rd.trees && rd.trees.get(c);
          if (mesh){
            rd.group.remove(mesh);
            rd.trees.delete(c);
          }
        }
      }
      r--;
    }
  }

  function makeLampPost(){
    const g = new THREE.Group();
    const pole = box(0.09, 1.6, 0.09, 0x3a3a3a);
    pole.position.y = 0.8;
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 10, 10),
      new THREE.MeshStandardMaterial({ color:0xfff2c0, emissive:0xffdd66, emissiveIntensity:0.5 })
    );
    head.position.y = 1.62;
    g.add(pole, head);
    g.traverse(o=>{ if(o.isMesh){ o.castShadow=true; } });
    return g;
  }

  function makeHouse(){
    const g = new THREE.Group();
    const bodyColor = choice([0xe8d3b0, 0xd9c4e0, 0xc9dcef, 0xf3d9c4]);
    const body = box(1.3, 1.0, 1.1, bodyColor);
    body.position.y = 0.5;
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(0.95, 0.65, 4),
      new THREE.MeshLambertMaterial({ color: 0x8a4b3a })
    );
    roof.rotation.y = Math.PI/4;
    roof.position.y = 1.32;
    g.add(body, roof);
    g.traverse(o=>{ if(o.isMesh){ o.castShadow=true; o.receiveShadow=true; } });
    return g;
  }

  function makeFenceSeg(){
    const g = box(0.9, 0.35, 0.06, 0xd8c9a8);
    g.position.y = 0.2;
    return g;
  }

  function makeSchoolBush(){
    const g = box(0.5, 0.35, 0.5, 0x4aa14a);
    g.position.y = 0.15;
    return g;
  }

  function makeSchoolFlag(){
    const g = new THREE.Group();
    const pole = box(0.08, 1.7, 0.08, 0xf5c542);
    pole.position.y = 0.85;
    const sign = box(0.55, 0.45, 0.04, 0xf5c542);
    sign.position.set(0, 1.55, 0.05);
    g.add(pole, sign);
    g.traverse(o=>{ if(o.isMesh){ o.castShadow=true; } });
    return g;
  }

  function addBackgroundScenery(g, rowIndex, biome){
    // Inner lane holds the primary prop (tree/house/flag). Secondary props (lamp/fence)
    // go in an outer lane so they never clip into the inner prop on the same side.
    const leftInner  = COL_MIN - rand(1.6, 2.6);
    const rightInner = COL_MAX + rand(1.6, 2.6);
    const leftOuter  = leftInner  - rand(1.1, 1.8);
    const rightOuter = rightInner + rand(1.1, 1.8);
    const jz = () => rand(-0.18, 0.18); // tighter z jitter to avoid clipping across adjacent rows
    if (biome === 'town'){
      if (Math.random() < 0.6){ const h = makeHouse(); h.position.set(leftInner, 0, jz()); g.add(h); }
      if (Math.random() < 0.6){ const h = makeHouse(); h.position.set(rightInner, 0, jz()); g.add(h); }
      if (Math.random() < 0.4){ const l = makeLampPost(); l.position.set(leftOuter, 0, jz()); g.add(l); }
    } else if (biome === 'school'){
      if (Math.random() < 0.35){ const f = makeSchoolFlag(); f.position.set(leftInner, 0, jz()); g.add(f); }
      if (Math.random() < 0.7){ const b = makeSchoolBush(); b.position.set(rightInner, 0, jz()); g.add(b); }
      if (Math.random() < 0.5){ const fence = makeFenceSeg(); fence.position.set(leftOuter, 0, jz()); g.add(fence); }
    } else { 
      if (Math.random() < 0.5){ const t = makeTreeObstacle(); t.position.set(leftInner, 0, jz()); g.add(t); }
      if (Math.random() < 0.5){ const t = makeTreeObstacle(); t.position.set(rightInner, 0, jz()); g.add(t); }
      if (Math.random() < 0.3){ const l = makeLampPost(); l.position.set(rightOuter, 0, jz()); g.add(l); }
    }
  }

  function makeGrassRow(rowIndex){
    const g = new THREE.Group();
    const biome = biomeForRow(rowIndex);
    const colors = BIOME_DATA[biome].grassColors;
    const colorBase = colors[Math.abs(rowIndex) % 2];
    const ground = box(GROUND_W, 1, TILE, colorBase);
    ground.position.set((COL_MIN+COL_MAX)/2, -0.5, 0);
    ground.receiveShadow = true;
    g.add(ground);

    const treeCols = new Set();
    const treeMeshes = new Map();
    const obstacleCount = Math.random() < 0.55 ? Math.floor(rand(0,3)) : 0;
    for(let i=0;i<obstacleCount;i++){
      const c = Math.floor(rand(COL_MIN, COL_MAX+1));
      if (c === 0 && rowIndex < 2) continue; 
      treeCols.add(c);
    }
    treeCols.forEach(c=>{
      const obstacle = Math.random() < 0.25 ? makeConeObstacle() : makeTreeObstacle();
      obstacle.position.set(c, 0, 0);
      g.add(obstacle);
      treeMeshes.set(c, obstacle);
    });

    const flowerCount = Math.random() < 0.8 ? Math.floor(rand(2,6)) : 0;
    for (let i = 0; i < flowerCount; i++){
      const c = Math.floor(rand(COL_MIN, COL_MAX+1));
      if (treeCols.has(c)) continue;
      const patch = makeFlowerPatch();
      patch.position.set(c + rand(-0.25,0.25), 0, rand(-0.3,0.3));
      g.add(patch);
    }

    addBackgroundScenery(g, rowIndex, biome);

    rowGroupParent.add(g);
    rows[rowIndex] = { type:'grass', group:g, blocked: treeCols, trees: treeMeshes };
  }

  function modelProp(name, scale, fallbackFn){
    const wrap = new THREE.Group();
    const tmpl = modelCache[name];
    if (tmpl){
      const inst = tmpl.clone(true);
      inst.scale.setScalar(scale);
      wrap.add(inst);
      wrap.traverse(o=>{ if(o.isMesh){ o.castShadow=true; o.receiveShadow=true; } });
      return wrap;
    }
    return fallbackFn ? fallbackFn() : wrap;
  }

  function makeCar(){
    const car = modelVehicle(choice(TRAFFIC_MODELS));
    return car;
  }

  const EMERGENCY_MODELS = ['ambulance','police','firetruck'];
  function makeAmbulance(){
    const car = modelVehicle(choice(EMERGENCY_MODELS));
    const beacon = new THREE.Mesh(
      new THREE.BoxGeometry(0.24,0.1,0.24),
      new THREE.MeshStandardMaterial({ color:0xff3b3b, emissive:0xff2222, emissiveIntensity:0.6 })
    );
    beacon.position.set(0, 1.05, 0);
    car.add(beacon);
    car.userData.beaconMat = beacon.material;
    return car;
  }

  const CAR_FADE_ZONE = 1.8;
  function setCarOpacity(car, opacity){
    car.visible = opacity > 0.02; // fully hide (and stop casting a shadow) once essentially invisible
    car.traverse(o=>{
      if (o.isMesh && o.material){
        o.material.opacity = opacity;
        o.castShadow = opacity > 0.6; // fade the shadow out with the car so no orphan shadow lingers on the road
      }
    });
  }
  function carEdgeOpacity(x){
    const farLimit = COL_MAX + 4;
    const nearLimit = COL_MIN - 4;
    const fadeFar = clamp((farLimit - x) / CAR_FADE_ZONE, 0, 1);
    const fadeNear = clamp((x - nearLimit) / CAR_FADE_ZONE, 0, 1);
    return Math.min(fadeFar, fadeNear);
  }

  function recycleCars(rd){
    const limit = COL_MAX + 4;
    rd.cars.forEach(car=>{
      const wrapped = rd.dir > 0 ? car.position.x > limit : car.position.x < -limit;
      if (wrapped){
        const fixedSpawn = rd.dir > 0 ? (COL_MIN - 4 - rand(0,3.5)) : (COL_MAX + 4 + rand(0,3.5));
        let rearMost = null;
        rd.cars.forEach(c=>{
          if (c === car) return;
          if (rearMost === null) rearMost = c.position.x;
          else if (rd.dir > 0 ? c.position.x < rearMost : c.position.x > rearMost) rearMost = c.position.x;
        });
        if (rearMost === null){
          car.position.x = fixedSpawn;
        } else {
          const behindRear = rd.dir > 0 ? (rearMost - rd.gap) : (rearMost + rd.gap);
          car.position.x = rd.dir > 0 ? Math.min(fixedSpawn, behindRear) : Math.max(fixedSpawn, behindRear);
        }
        car.userData.speed = car.userData.cruiseSpeed;
      }
      setCarOpacity(car, carEdgeOpacity(car.position.x));
    });
  }

  function makeLaneMarkings(g, excludeMin, excludeMax){
    for(let c=COL_MIN-1;c<=COL_MAX+1;c+=2){
      if (excludeMin !== undefined && c > excludeMin - 0.3 && c < excludeMax + 0.3) continue;
      const dash = box(0.5,0.02,0.08,0xf5f0e6);
      dash.position.set(c, 0.005, 0);
      dash.castShadow = false;
      g.add(dash);
    }
  }

  const LANE_HALF_WIDTH = 1;

  function makeLaneSegment(g, laneCol){
    const edgeOffset = LANE_HALF_WIDTH + 0.5;
    const dashZs = [-0.36, -0.12, 0.12, 0.36];
    [laneCol - edgeOffset, laneCol + edgeOffset].forEach(edgeX=>{
      dashZs.forEach(z=>{
        const dot = box(0.09, 0.02, 0.14, 0xffffff);
        dot.position.set(edgeX, 0.01, z);
        dot.castShadow = false;
        g.add(dot);
      });
    });
  }

  function makeCarsForRow(dir, speedRange, gapRange, count){
    const speed = rand(speedRange[0], speedRange[1]);
    const gap = rand(gapRange[0], gapRange[1]);
    const carGroup = new THREE.Group();
    const cars = [];
    for(let i=0;i<count;i++){
      const vehicle = makeCar();
      if (dir < 0) vehicle.rotation.y += Math.PI;
      vehicle.position.set(COL_MIN + i*gap*dir*-1 + rand(-1,1), 0, 0);
      vehicle.userData.speed = speed; 
      vehicle.userData.cruiseSpeed = speed; 
      carGroup.add(vehicle);
      cars.push(vehicle);
    }
    return { carGroup, cars, speed, gap };
  }

  function makeCrosswalkStripes(g, laneCol){
    const stripeCount = 5;
    const laneWidth = LANE_HALF_WIDTH * 2 + 1;
    const stripeSpacing = laneWidth / stripeCount;
    const laneStart = laneCol - LANE_HALF_WIDTH - 0.5;
    for (let i = 0; i < stripeCount; i++){
      const x = laneStart + (i + 0.5) * stripeSpacing;
      const stripe = box(stripeSpacing * 0.6, 0.02, 0.82, 0xffffff);
      stripe.position.set(x, 0.01, 0);
      stripe.castShadow = false;
      g.add(stripe);
    }
  }

  function makeBelishaBeacon(){
    const g = new THREE.Group();
    const stripeCount = 6;
    const poleHeight = 1.6;
    const segHeight = poleHeight / stripeCount;
    for (let i = 0; i < stripeCount; i++){
      const color = i % 2 === 0 ? 0x1a1a1a : 0xf2f2f2;
      const seg = box(0.11, segHeight, 0.11, color);
      seg.position.y = segHeight * i + segHeight / 2;
      seg.castShadow = true;
      g.add(seg);
    }
    const globeMat = new THREE.MeshStandardMaterial({ color: 0xffa726, emissive: 0xffa726, emissiveIntensity: 0.3 });
    const globe = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 14), globeMat);
    globe.position.y = poleHeight + 0.19;
    globe.castShadow = true;
    g.add(globe);
    g.userData = { globeMat };
    return g;
  }

  function makeZebraCrossing(rowIndex){
    const g = new THREE.Group();
    const biome = biomeForRow(rowIndex);
    const ground = box(GROUND_W, 1, TILE, BIOME_DATA[biome].roadTint);
    ground.position.set((COL_MIN+COL_MAX)/2, -0.5, 0);
    ground.receiveShadow = true;
    g.add(ground);

    const laneCol = randInt(COL_MIN + 1 + LANE_HALF_WIDTH, COL_MAX - 1 - LANE_HALF_WIDTH);
    makeCrosswalkStripes(g, laneCol);

    const zebraClearMin = Math.min(lastLaneCol, laneCol) - LANE_HALF_WIDTH;
    const zebraClearMax = Math.max(lastLaneCol, laneCol) + LANE_HALF_WIDTH;
    clearApproachPath(rowIndex, zebraClearMin, zebraClearMax);
    lastLaneCol = laneCol;
    const approachRow = rows[rowIndex - 1];

    const beaconMats = [];
    if (approachRow && approachRow.type === 'grass'){
      const beaconSide = laneCol < (COL_MIN + COL_MAX) / 2 ? -1 : 1;
      const beacon = makeBelishaBeacon();
      beacon.position.set(laneCol + beaconSide * (LANE_HALF_WIDTH + 0.4), 0, 0.42);
      approachRow.group.add(beacon);
      beaconMats.push(beacon.userData.globeMat);
    }

    const dir = Math.random() < 0.5 ? 1 : -1;
    const diff = difficultyFactor(rowIndex);
    const { carGroup, cars, speed, gap } = makeCarsForRow(dir, scaleRange([2.6,4.8], diff), [3.4,4.8], 4);
    g.add(carGroup);

    rowGroupParent.add(g);
    rows[rowIndex] = { type:'zebra', group:g, dir, speed, gap, cars, blocked:new Set(), laneCol, laneHalfWidth: LANE_HALF_WIDTH, beaconMats };
  }

  function makeTrafficLightPole(){
    const g = new THREE.Group();
    const pole = box(0.12,1.9,0.12,0x3a3a3a);
    pole.position.y = 0.95;
    const housing = box(0.3,0.68,0.22,0x232323);
    housing.position.y = 1.95;

    const lightGeo = new THREE.SphereGeometry(0.085, 10, 10);
    const redMat = new THREE.MeshStandardMaterial({ color:0x551111, emissive:0x000000, emissiveIntensity:1 });
    const yellowMat = new THREE.MeshStandardMaterial({ color:0x554411, emissive:0x000000, emissiveIntensity:1 });
    const greenMat = new THREE.MeshStandardMaterial({ color:0x115511, emissive:0x000000, emissiveIntensity:1 });

    const redLight = new THREE.Mesh(lightGeo, redMat); redLight.position.set(0, 2.16, -0.12);
    const yellowLight = new THREE.Mesh(lightGeo, yellowMat); yellowLight.position.set(0, 1.95, -0.12);
    const greenLight = new THREE.Mesh(lightGeo, greenMat); greenLight.position.set(0, 1.74, -0.12);

    g.add(pole, housing, redLight, yellowLight, greenLight);

    const button = box(0.16, 0.16, 0.08, 0xf5c542);
    button.position.set(0, 1.05, -0.1);
    g.add(button);

    g.traverse(o=>{ if(o.isMesh){ o.castShadow=true; } });
    g.userData = { redLight, yellowLight, greenLight };
    return g;
  }

  function updatePoleVisual(ctrl){
    if (ctrl.poleMesh){
      const { redLight, yellowLight, greenLight } = ctrl.poleMesh.userData;
      redLight.material.emissive.setHex(ctrl.state==='red' ? 0xff2222 : 0x000000);
      redLight.material.color.setHex(ctrl.state==='red' ? 0xff4444 : 0x551111);
      yellowLight.material.emissive.setHex(ctrl.state==='yellow' ? 0xffcc00 : 0x000000);
      yellowLight.material.color.setHex(ctrl.state==='yellow' ? 0xffdd55 : 0x554411);
      greenLight.material.emissive.setHex(ctrl.state==='green' ? 0x22ff22 : 0x000000);
      greenLight.material.color.setHex(ctrl.state==='green' ? 0x44ff44 : 0x115511);
    }
  }

  function updateLightController(ctrl, dt){
    if (ctrl.state === 'red'){
      if (ctrl.requested){
        ctrl.requested = false;
        ctrl.state = 'yellow';
        ctrl.phase = 'toGreen';
        ctrl.timer = 0.9;
        updatePoleVisual(ctrl);
      }
      return; 
    }
    ctrl.timer -= dt;
    if (ctrl.timer <= 0){
      if (ctrl.state === 'yellow' && ctrl.phase === 'toGreen'){
        ctrl.state = 'green'; ctrl.timer = 4.5;
        Sound.play('green');
      } else if (ctrl.state === 'green'){
        ctrl.state = 'yellow'; ctrl.phase = 'toRed'; ctrl.timer = 1.0;
      } else if (ctrl.state === 'yellow' && ctrl.phase === 'toRed'){
        ctrl.state = 'red'; ctrl.requested = false;
      }
      updatePoleVisual(ctrl);
    }
  }

  function makeJunction(startRow, width){
    const laneCol = randInt(COL_MIN + 1 + LANE_HALF_WIDTH, COL_MAX - 1 - LANE_HALF_WIDTH);
    const controller = {
      state: 'red',      
      phase: null,
      timer: 0,
      requested: false,
      laneCol,
      laneHalfWidth: LANE_HALF_WIDTH,
      startRow,
      endRow: startRow + width - 1
    };
    const poleOffsetDir = laneCol < (COL_MIN + COL_MAX) / 2 ? -1 : 1;
    const poleX = laneCol + poleOffsetDir * (LANE_HALF_WIDTH + 0.25);
    const poleRow = startRow; 

    const junctionClearMin = Math.min(lastLaneCol, laneCol) - LANE_HALF_WIDTH;
    const junctionClearMax = Math.max(lastLaneCol, laneCol) + LANE_HALF_WIDTH;
    clearApproachPath(startRow, junctionClearMin, junctionClearMax);
    lastLaneCol = laneCol;

    for(let i=0;i<width;i++){
      const rowIndex = startRow + i;
      const biome = biomeForRow(rowIndex);
      const g = new THREE.Group();
      const ground = box(GROUND_W, 1, TILE, BIOME_DATA[biome].roadTint);
      ground.position.set((COL_MIN+COL_MAX)/2, -0.5, 0);
      ground.receiveShadow = true;
      g.add(ground);
      const laneEdgeOffset = LANE_HALF_WIDTH + 0.5;
      makeLaneMarkings(g, laneCol - laneEdgeOffset, laneCol + laneEdgeOffset);
      makeLaneSegment(g, laneCol);

      const dir = Math.random() < 0.5 ? 1 : -1;
      const diff = difficultyFactor(rowIndex);
      const { carGroup, cars, speed, gap } = makeCarsForRow(dir, scaleRange([1.1,2.0], diff), [4.2,6.0], 3);
      g.add(carGroup);

      if (rowIndex === poleRow){
        const pole = makeTrafficLightPole();
        pole.position.set(poleX, 0, -0.5);
        g.add(pole);
        controller.poleMesh = pole;
      }

      rowGroupParent.add(g);
      g.position.z = rowIndex;
      rows[rowIndex] = { type:'junction', group:g, dir, speed, gap, cars, blocked:new Set(), light: controller };

      if (Math.random() < EMERGENCY_EVENT_CHANCE){
        spawnEmergencyVehicle(rowIndex, dir);
      }
    }
    updatePoleVisual(controller);
  }

  function spawnEmergencyVehicle(rowIndex, dir){
    const rd = rows[rowIndex];
    if (!rd) return;
    const amb = makeAmbulance();
    if (dir < 0) amb.rotation.y += Math.PI;
    const startX = dir > 0 ? (COL_MIN - rand(3, 6)) : (COL_MAX + rand(3, 6));
    amb.position.set(startX, 0, 0);
    rd.group.add(amb);
    emergencyVehicles.push({ mesh: amb, row: rowIndex, dir, speed: rand(4.5, 6) });
  }

  function decideRowType(prevType, prevType2){
    let weights = { grass:0.5, junction:0.32, zebra:0.18 };
    if (prevType !== 'grass') weights.grass += 0.28;
    if (prevType === 'junction' || prevType === 'zebra'){ weights.junction = 0; weights.zebra = 0; }
    if (prevType2 === 'junction' || prevType2 === 'zebra'){ weights.junction *= 0.3; weights.zebra *= 0.3; }

    const total = Object.values(weights).reduce((a,b)=>a+b,0);
    let r = Math.random()*total;
    for (const k of Object.keys(weights)){
      if (r < weights[k]) return k;
      r -= weights[k];
    }
    return 'grass';
  }

  function generateNext(){
    const rowIndex = maxGeneratedRow + 1;
    if (rowIndex <= 1){
      makeGrassRow(rowIndex);
      rows[rowIndex].group.position.z = rowIndex;
      maxGeneratedRow = rowIndex;
      return;
    }

    const prevType = rows[rowIndex-1] ? rows[rowIndex-1].type : 'grass';
    const prevType2 = rows[rowIndex-2] ? rows[rowIndex-2].type : 'grass';
    const type = decideRowType(prevType, prevType2);

    if (type === 'grass'){
      makeGrassRow(rowIndex);
      rows[rowIndex].group.position.z = rowIndex;
      maxGeneratedRow = rowIndex;
    } else if (type === 'zebra'){
      makeZebraCrossing(rowIndex);
      rows[rowIndex].group.position.z = rowIndex;
      maxGeneratedRow = rowIndex;
    } else if (type === 'junction'){
      const width = randInt(2, 4); 
      makeJunction(rowIndex, width);
      maxGeneratedRow = rowIndex + width - 1;
    }
  }

  function ensureRowsUpTo(rowIndex){
    let guard = 0;
    while (maxGeneratedRow < rowIndex && guard < 1000){
      generateNext();
      guard++;
    }
  }

  function fillStartPlatform(depth){
    for (let r = -1; r >= -depth; r--){
      if (rows[r]) continue;
      makeGrassRow(r);
      rows[r].group.position.z = r;
    }
  }

  function cleanupOldRows(currentRow){
    const minKeep = currentRow - 6;
    Object.keys(rows).forEach(k=>{
      const idx = parseInt(k);
      if (idx < minKeep){
        rowGroupParent.remove(rows[idx].group);
        delete rows[idx];
      }
    });
  }

  // ---------- player ----------
  const player = new THREE.Group();
  function buildCat(){
    const g = new THREE.Group();
    const furColor = 0xf2a154;
    const bodyMat = new THREE.MeshLambertMaterial({color:furColor});
    const body = box(0.42,0.34,0.5, furColor, bodyMat);
    body.position.y = 0.28;

    const head = box(0.34,0.3,0.3, furColor, bodyMat);
    head.position.set(0,0.58,0.2);

    const earGeo = new THREE.ConeGeometry(0.09,0.16,4);
    const earL = new THREE.Mesh(earGeo, bodyMat);
    earL.position.set(0.12,0.8,0.16); earL.rotation.y = Math.PI/4;
    const earR = new THREE.Mesh(earGeo, bodyMat);
    earR.position.set(-0.12,0.8,0.16); earR.rotation.y = Math.PI/4;

    const innerEarMat = new THREE.MeshLambertMaterial({color:0xffc9d6});
    const innerGeo = new THREE.ConeGeometry(0.05,0.09,4);
    const innerL = new THREE.Mesh(innerGeo, innerEarMat); innerL.position.set(0.12,0.77,0.19); innerL.rotation.y = Math.PI/4;
    const innerR = new THREE.Mesh(innerGeo, innerEarMat); innerR.position.set(-0.12,0.77,0.19); innerR.rotation.y = Math.PI/4;

    const muzzle = box(0.16,0.1,0.1, 0xffffff);
    muzzle.position.set(0,0.52,0.36);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.045,0.045,0.045), new THREE.MeshLambertMaterial({color:0xff8fa3}));
    nose.position.set(0,0.57,0.38);

    const eyeMat = new THREE.MeshLambertMaterial({color:0x1c1c1c});
    const eyeGeo = new THREE.BoxGeometry(0.05,0.06,0.05);
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat); eyeL.position.set(0.1,0.64,0.34);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat); eyeR.position.set(-0.1,0.64,0.34);

    const tail = box(0.09,0.09,0.4, furColor, bodyMat);
    tail.position.set(0,0.4,-0.36);
    tail.rotation.x = 0.55;

    const legMat = new THREE.MeshLambertMaterial({color:furColor});
    const legGeo = new THREE.BoxGeometry(0.1,0.18,0.1);
    const legFL = new THREE.Mesh(legGeo, legMat); legFL.position.set(0.14,0.09,0.16);
    const legFR = new THREE.Mesh(legGeo, legMat); legFR.position.set(-0.14,0.09,0.16);
    const legBL = new THREE.Mesh(legGeo, legMat); legBL.position.set(0.14,0.09,-0.16);
    const legBR = new THREE.Mesh(legGeo, legMat); legBR.position.set(-0.14,0.09,-0.16);

    const belly = box(0.2,0.16,0.3, 0xffffff);
    belly.position.set(0,0.2,0.05);

    g.add(body, head, earL, earR, innerL, innerR, muzzle, nose, eyeL, eyeR, tail, legFL, legFR, legBL, legBR, belly);
    g.traverse(o=>{ if(o.isMesh){ o.castShadow=true; o.receiveShadow=true; } });
    return g;
  }
  const chickenMesh = buildCat();
  player.add(chickenMesh);
  scene.add(player);

  const shadowGeo = new THREE.CircleGeometry(0.32, 16);
  const shadowMat = new THREE.MeshBasicMaterial({color:0x000000, transparent:true, opacity:0.25});
  const playerShadow = new THREE.Mesh(shadowGeo, shadowMat);
  playerShadow.rotation.x = -Math.PI/2;
  playerShadow.position.y = 0.02;
  scene.add(playerShadow);

  const BUDDY_NAME = "Ranger Zeb";

  const buddyAgentEl = document.getElementById('buddyAgent');
  const buddyAgentTextEl = document.getElementById('buddyAgentText');
  let buddyMsgTimer = null;
  let buddyIdleTimer = null;

  const SG_FACTS = [
    "In Singapore, cars drive on the left - so look RIGHT first when you cross.",
    "The flashing green man means finish crossing - don't start if you're still on the kerb.",
    "Jaywalking within 50m of a crossing is an offence in Singapore, and can be fined.",
    "Green Man+ lets seniors and those with disabilities tap a card for extra crossing time.",
    "Always cross at a zebra crossing, traffic light, or overhead bridge where you can.",
    "Never dash across the road - drivers need time to see you and stop.",
    "At a Green Man, still glance both ways - turning vehicles may cross your path.",
    "Silver Zones near HDB estates have lower speed limits to protect elderly pedestrians.",
    "Wait on the kerb, not on the road, until it's fully safe to cross.",
    "Take off your earphones and look up from your phone before you cross."
  ];
  let factIdx = Math.floor(Math.random() * SG_FACTS.length);

  function setBuddyMood(mood){
    buddyAgentEl.classList.remove('alert','tip');
    if (mood === 'alert') buddyAgentEl.classList.add('alert');
    else if (mood === 'tip') buddyAgentEl.classList.add('tip');
  }

  function buddySay(text, mood, hold){
    if (!buddyAgentTextEl) return;
    buddyAgentTextEl.textContent = text;
    setBuddyMood(mood || 'tip');
    if (buddyMsgTimer) clearTimeout(buddyMsgTimer);
    if (buddyIdleTimer) clearTimeout(buddyIdleTimer);
    buddyMsgTimer = setTimeout(()=>{ scheduleIdleFact(600); }, hold || 2600);
  }

  function showNextFact(){
    if (!buddyAgentTextEl) return;
    if (gameState !== 'playing') return;
    buddyAgentTextEl.textContent = SG_FACTS[factIdx];
    factIdx = (factIdx + 1) % SG_FACTS.length;
    setBuddyMood('tip');
    scheduleIdleFact(7000); 
  }

  function scheduleIdleFact(delay){
    if (buddyIdleTimer) clearTimeout(buddyIdleTimer);
    buddyIdleTimer = setTimeout(showNextFact, delay);
  }

  function resetBuddyAgent(){
    if (buddyMsgTimer) clearTimeout(buddyMsgTimer);
    if (buddyIdleTimer) clearTimeout(buddyIdleTimer);
    factIdx = Math.floor(Math.random() * SG_FACTS.length);
    if (buddyAgentTextEl) buddyAgentTextEl.textContent = "Look both ways and cross safely!";
    setBuddyMood('tip');
    scheduleIdleFact(4500);
  }

  // Preset question banks removed - questions are now generated by AI (OpenRouter).

  let quizActive = false;
  const QUIZ_CHANCE = 0.75;
  let lastDeathType = null;
  let pendingFocus = null; // death type used to focus the next AI question
  let pendingRequestCtrls = [];  

  const quizOverlayEl = document.getElementById('quizOverlay');
  const quizQuestionEl = document.getElementById('quizQuestion');
  const quizOptionsEl = document.getElementById('quizOptions');
  const quizFeedbackEl = document.getElementById('quizFeedback');
  const quizContextTagEl = document.getElementById('quizContextTag');

  // ---- AI question generation (OpenRouter) + no-repeat-this-session ----
  const askedThisSession = new Set();
  function normQ(q){ return String(q||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(); }

  const FOCUS_HINT = { car:'stepping onto the road while a car was still moving', offLane:'crossing outside the marked crossing lane', notGreen:'crossing before the green man appeared', edge:'wandering off the pavement', ambulance:'an emergency vehicle crossing against the light' };

  async function fetchAIQuestion(category, focus){
    if (!AI_QUESTIONS || !N8N_QUIZ_WEBHOOK_URL){ if (AI_QUESTIONS && !N8N_QUIZ_WEBHOOK_URL) console.warn('[AI quiz] No n8n webhook URL set - safety-check quiz will be skipped.'); return null; }
    const avoid = Array.from(askedThisSession).slice(-14);
    const focusHint = (focus && FOCUS_HINT[focus]) ? FOCUS_HINT[focus] : '';

    const controller = new AbortController();
    const timeout = setTimeout(()=>controller.abort(), 9000);
    try {
      const res = await fetch(N8N_QUIZ_WEBHOOK_URL, {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ category: category, avoid: avoid, focusHint: focusHint }),
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (!res.ok){
        let body = ''; try { body = await res.text(); } catch(e){}
        console.warn('[AI quiz] n8n webhook failed:', res.status, res.statusText, '-', body.slice(0, 220));
        return null;
      }
      const obj = await res.json();
      if (!obj || obj.error || typeof obj.q !== 'string' || !Array.isArray(obj.options) || obj.options.length !== 3){
        console.warn('[AI quiz] n8n webhook returned an invalid question:', obj && obj.message);
        return null;
      }
      const ci = Number(obj.correct);
      if (!(ci >= 0 && ci <= 2)){ console.warn('[AI quiz] n8n webhook returned a bad correct-index.'); return null; }
      const item = { cat:category, q:obj.q.trim(), options:obj.options.map(o=>String(o)), correct:ci, explain:String(obj.explain||'') };
      if (askedThisSession.has(normQ(item.q))){ console.warn('[AI quiz] n8n gave a repeat question - skipping this round.'); return null; }
      console.log('[AI quiz] question generated via n8n ->', item.q);
      item.__ai = true;
      return item;
    } catch(e){
      clearTimeout(timeout);
      console.warn('[AI quiz] n8n webhook error (offline, CORS, or opened as a file:// instead of a server?):', e && e.message);
      return null;
    }
  }

  async function askQuiz(ctrl, category){
    if (quizActive || ctrl.quizAsked) return;
    ctrl.quizAsked = true;
    quizActive = true;

    const focus = pendingFocus; pendingFocus = null;

    // Show the overlay immediately with a loading state while the AI generates a question.
    quizContextTagEl.textContent = 'SAFETY CHECK';
    quizQuestionEl.textContent = 'Thinking of a question\u2026';
    quizFeedbackEl.textContent = '';
    quizOptionsEl.innerHTML = '';
    quizOverlayEl.style.display = 'flex';
    Sound.play('quizOpen');

    const item = await fetchAIQuestion(category, focus);

    // AI-only: if no question could be generated (offline / no key / rate-limited),
    // close the popup and let the player continue instead of showing a preset.
    if (!item){
      quizOverlayEl.style.display = 'none';
      quizActive = false;
      if (pendingRequestCtrls.length){ pendingRequestCtrls.forEach(c => { c.requested = true; }); pendingRequestCtrls = []; }
      return;
    }

    // If the run ended or the overlay was closed while waiting, abort quietly.
    if (!quizActive || quizOverlayEl.style.display === 'none') return;

    askedThisSession.add(normQ(item.q));
    quizContextTagEl.textContent = 'SAFETY CHECK';
    quizQuestionEl.textContent = item.q;
    quizOptionsEl.innerHTML = '';
    item.options.forEach((opt, idx) => {
      const btn = document.createElement('button');
      btn.className = 'quizOptionBtn';
      btn.textContent = opt;
      btn.addEventListener('click', () => answerQuiz(idx, item));
      quizOptionsEl.appendChild(btn);
    });
  }

  function answerQuiz(chosenIdx, item){
    const buttons = quizOptionsEl.querySelectorAll('.quizOptionBtn');
    buttons.forEach(b => b.disabled = true);
    const correct = chosenIdx === item.correct;

    buttons[item.correct].classList.add('correct');
    if (!correct) buttons[chosenIdx].classList.add('wrong');

    if (correct){
      scoreAdjust += 3;
      recomputeScore();
      quizFeedbackEl.textContent = 'Correct! +3 points - ' + item.explain;
      Sound.play('correct');
    } else {
      quizFeedbackEl.textContent = item.explain;
      Sound.play('wrong');
    }

    // Explanations from the AI are now prompted to stay short (one brief
    // clause), so a tighter, mostly-fixed read time works - still scales a
    // little for the rare longer message.
    const readMs = Math.min(3200, Math.max(1800, 1100 + quizFeedbackEl.textContent.length * 22));
    setTimeout(() => {
      quizOverlayEl.style.display = 'none';
      quizActive = false;
      if (pendingRequestCtrls.length){
        pendingRequestCtrls.forEach(ctrl => { ctrl.requested = true; });
        pendingRequestCtrls = [];
      }
    }, readMs);
  }

  // ---------- game state ----------
  let gameState = 'menu'; 
  let col = 0, row = 0;
  let posX = 0, posZ = 0; 
  let facing = 0; 
  let hop = null; 
  let score = 0;
  let furthestRow = 0;  
  let scoreAdjust = 0;  
  let best = 0;
  let deathTimer = 0;
  let deathType = null;
  let ambientHornTimer = rand(5, 10); 

  function resetGame(){
    rows = {};
    rowGroupParent.clear();
    maxGeneratedRow = -1;
    lastLaneCol = 0;
    emergencyVehicles = [];
    col = 0; row = 0;
    posX = 0; posZ = 0;
    facing = 0;
    hop = null;
    score = 0;
    furthestRow = 0;
    scoreAdjust = 0;
    deathTimer = 0; deathType = null;
    ambientHornTimer = rand(5, 10);
    quizActive = false;
    askedThisSession.clear();
    pendingFocus = null;
    { const a=document.getElementById('certBtn'); if(a) a.style.display='none'; const b=document.getElementById('certBtnOver'); if(b) b.style.display='none'; }
    pendingRequestCtrls = [];
    quizOverlayEl.style.display = 'none';
    ensureRowsUpTo(12);
    fillStartPlatform(6);
    player.position.set(0,0,0);
    player.rotation.y = 0;
    updateScoreHUD();
    document.getElementById('crossHint').classList.remove('show');
    resetBuddyAgent();
  }

  function recomputeScore(){
    if (furthestRow + scoreAdjust < 0) scoreAdjust = -furthestRow;
    score = Math.max(0, furthestRow + scoreAdjust);
    updateScoreHUD();
  }

  function updateScoreHUD(){
    document.getElementById('score').textContent = score;
    document.getElementById('best').textContent = 'BEST ' + best;
    const cb = document.getElementById('certBtn');
    if (cb) cb.style.display = (score >= CERT_MIN_SCORE) ? 'block' : 'none';
  }

  const ROAD_LIKE = new Set(['junction', 'zebra']);

  function isBlocked(c, r){
    const rd = rows[r];
    if (!rd) return true; 
    if (c < COL_MIN || c > COL_MAX) return true;
    if (rd.type === 'grass' && rd.blocked.has(c)) return true;
    return false;
  }

  function tryMove(dc, dr){
    if (gameState !== 'playing') return;
    if (hop) return; 
    if (quizActive) return; 
    const nc = col + dc;
    const nr = row + dr;
    if (isBlocked(nc, nr)) return;
    ensureRowsUpTo(nr + 8);

    if (dr === 1 && rows[nr] && rows[nr].type === 'zebra' && !rows[nr].quizChecked){
      rows[nr].quizChecked = true;
      if (Math.random() < QUIZ_CHANCE){
        askQuiz(rows[nr], 'zebra');
        return;
      }
    }

    const targetFacing = dc === 1 ? Math.PI/2 : dc === -1 ? -Math.PI/2 : dr === 1 ? 0 : Math.PI;
    hop = {
      fromX: posX, fromZ: posZ,
      toX: nc, toZ: nr,
      t: 0, dur: 0.14,
      fromFacing: facing, toFacing: targetFacing
    };
    let diff = hop.toFacing - hop.fromFacing;
    while (diff > Math.PI) diff -= Math.PI*2;
    while (diff < -Math.PI) diff += Math.PI*2;
    hop.toFacing = hop.fromFacing + diff;
    Sound.play('hop');

    col = nc; row = nr;

    if (dr === 1 && rows[nr] && rows[nr].type === 'zebra'){
      const allStopped = rows[nr].cars.every(car => car.userData.speed < 0.05);
      scoreAdjust += allStopped ? 5 : 1;
      if (!rows[nr].crossLogged){
        rows[nr].crossLogged = true;
        if (allStopped){
          buddySay("Nice - you waited for the cars to fully stop. That's the way!", 'tip', 2600);
          Sound.play('safe');
        }
      }
    }
    if (dr === 1 && rows[nr] && rows[nr].type === 'junction'){
      const rd = rows[nr];
      if (!rd.crossLogged){
        rd.crossLogged = true;
        if (rd.light && rd.light.state === 'green'){
          buddySay("Green man's on and you're in the lane - perfect crossing!", 'tip', 2600);
          Sound.play('safe');
        }
      }
    }

    if (row > furthestRow) furthestRow = row;
    recomputeScore();
    cleanupOldRows(row);
  }

  function findAdjacentJunctionControllers(){
    const seen = new Set();
    let forwardMatch = null, backwardMatch = null;
    Object.keys(rows).forEach(k=>{
      const rd = rows[k];
      if (rd.type !== 'junction' || seen.has(rd.light)) return;
      seen.add(rd.light);
      const ctrl = rd.light;
      if (row === ctrl.startRow - 1) forwardMatch = ctrl;   
      if (row === ctrl.endRow + 1) backwardMatch = ctrl;    
    });
    return { forwardMatch, backwardMatch };
  }

  function junctionIsRequestable(ctrl){
    if (!ctrl) return false;
    const inFrontOfLane = Math.abs(col - ctrl.laneCol) <= ctrl.laneHalfWidth;
    return inFrontOfLane && ctrl.state === 'red' && !ctrl.requested;
  }

  function findNearestJunctionController(){
    const { forwardMatch, backwardMatch } = findAdjacentJunctionControllers();
    const fwdReady = junctionIsRequestable(forwardMatch);
    const backReady = junctionIsRequestable(backwardMatch);
    const best = fwdReady ? forwardMatch : backReady ? backwardMatch : (forwardMatch || backwardMatch);
    return { ctrl: best, atLight: fwdReady || backReady };
  }

  function requestCrossing(){
    if (gameState !== 'playing' || hop) return;
    if (quizActive) return;
    const { forwardMatch, backwardMatch } = findAdjacentJunctionControllers();
    const toQueue = [];
    if (junctionIsRequestable(forwardMatch)) toQueue.push(forwardMatch);
    if (junctionIsRequestable(backwardMatch)) toQueue.push(backwardMatch);
    if (!toQueue.length) return;

    const askThisTime = toQueue.some(c => !c.quizChecked);
    toQueue.forEach(c => { c.quizChecked = true; });
    if (askThisTime && Math.random() < QUIZ_CHANCE){
      pendingRequestCtrls.push(...toQueue);
      askQuiz(toQueue[0], 'junction');
    } else {
      toQueue.forEach(c => { c.requested = true; });
    }
  }

  window.addEventListener('keydown', (e)=>{
    if (gameState !== 'playing') return;
    switch(e.key){
      case 'ArrowUp': case 'w': case 'W': tryMove(0,1); break;
      case 'ArrowDown': case 's': case 'S': tryMove(0,-1); break;
      case 'ArrowLeft': case 'a': case 'A': tryMove(1,0); break;
      case 'ArrowRight': case 'd': case 'D': tryMove(-1,0); break;
      case 'e': case 'E': requestCrossing(); break;
    }
  });

  document.getElementById('btnUp').addEventListener('touchstart', e=>{e.preventDefault(); tryMove(0,1);});
  document.getElementById('btnDown').addEventListener('touchstart', e=>{e.preventDefault(); tryMove(0,-1);});
  document.getElementById('btnLeft').addEventListener('touchstart', e=>{e.preventDefault(); tryMove(1,0);});
  document.getElementById('btnRight').addEventListener('touchstart', e=>{e.preventDefault(); tryMove(-1,0);});
  document.getElementById('btnUp').addEventListener('click', ()=> tryMove(0,1));
  document.getElementById('btnDown').addEventListener('click', ()=> tryMove(0,-1));
  document.getElementById('btnLeft').addEventListener('click', ()=> tryMove(1,0));
  document.getElementById('btnRight').addEventListener('click', ()=> tryMove(-1,0));

  let touchStart = null;
  window.addEventListener('touchstart', (e)=>{
    if (e.target.closest('#touchControls')) return;
    const t = e.changedTouches[0];
    touchStart = {x:t.clientX, y:t.clientY};
  }, {passive:true});
  window.addEventListener('touchend', (e)=>{
    if (!touchStart) return;
    if (e.target.closest('#touchControls')) { touchStart = null; return; }
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    touchStart = null;
    if (Math.max(Math.abs(dx),Math.abs(dy)) < 24) return;
    if (Math.abs(dx) > Math.abs(dy)){
      tryMove(dx > 0 ? -1 : 1, 0);
    } else {
      tryMove(0, dy < 0 ? 1 : -1);
    }
  }, {passive:true});

  function isMobile(){
    return /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  }
  if (isMobile()){
    document.getElementById('touchControls').classList.add('show');
    document.getElementById('btnCross').classList.add('show');
  }
  const crossBtnEl = document.getElementById('btnCross');
  const crossHintEl = document.getElementById('crossHint');
  crossBtnEl.addEventListener('touchstart', e=>{ e.preventDefault(); requestCrossing(); });
  crossBtnEl.addEventListener('click', ()=> requestCrossing());

  const CONFIG = { N8N_CERT_WEBHOOK_URL: N8N_CERT_WEBHOOK_URL };

  const JAYWALK_PENALTY = 10;
  function penaliseJaywalk(rd, kind){
    if (rd.jaywalkPenalised) return;
    rd.jaywalkPenalised = true;

    scoreAdjust -= JAYWALK_PENALTY;
    recomputeScore();
    rd.crossLogged = true;

    const msg = kind === 'notGreen'
      ? `Jaywalking! Wait for the green man before you step out. -${JAYWALK_PENALTY} pts`
      : `Jaywalking! In Singapore you must cross within the marked lane. -${JAYWALK_PENALTY} pts`;
    buddySay(msg, 'alert', 3200);
    Sound.play('jaywalk');
    Sound.play('honk');
  }

  function triggerGameOver(type){
    if (gameState !== 'playing') return;
    gameState = 'gameover';
    deathType = type;
    deathTimer = 0;
    crossHintEl.classList.remove('show');
    if (buddyMsgTimer) clearTimeout(buddyMsgTimer);
    if (buddyIdleTimer) clearTimeout(buddyIdleTimer);
    Sound.stopEngineHum();
    if (type === 'ambulance') Sound.play('siren');
    Sound.play('splat');
    if (score > best) best = score;
    updateScoreHUD();

    lastDeathType = type;
    pendingFocus = type;

    setTimeout(()=>{
      document.getElementById('finalScore').textContent = score;

      const certOver = document.getElementById('certBtnOver');
      if (certOver) certOver.style.display = (score >= CERT_MIN_SCORE) ? 'block' : 'none';

      document.getElementById('gameOverScreen').style.display = 'flex';
    }, 550);
  }

  let lastTime = performance.now();
  let elapsedTime = 0;

  function animate(){
    requestAnimationFrame(animate);
    const now = performance.now();
    let dt = (now - lastTime) / 1000;
    dt = Math.min(dt, 0.05);
    lastTime = now;
    elapsedTime += dt;

    const updatedControllers = new Set();
    const BRAKING_ZONE = 3.6;   
    const MAX_ACCEL = 6.5;      
    const CAR_GAP = 1.5;        
    const beaconPulse = 0.25 + 0.75 * Math.abs(Math.sin(elapsedTime * Math.PI / 1.3)); 

    if (gameState === 'playing'){
      let movingNearby = 0;
      let nearestProximity = 0; 
      for (let dr = -2; dr <= 2; dr++){
        const rd = rows[row + dr];
        if (!rd || !ROAD_LIKE.has(rd.type) || !rd.cars) continue;
        const rowFalloff = 1 - Math.abs(dr) * 0.35; 
        rd.cars.forEach(c => {
          if (Math.abs(c.userData.speed) > 0.4) movingNearby++;
          const dx = Math.abs(c.position.x - posX);
          if (dx < 4.5){
            const prox = (1 - dx / 4.5) * rowFalloff;
            if (prox > nearestProximity) nearestProximity = prox;
          }
        });
      }
      Sound.setEngineLevel(nearestProximity);

      ambientHornTimer -= dt;
      if (ambientHornTimer <= 0){
        if (movingNearby > 0) Sound.play('honk');
        ambientHornTimer = rand(5, 10);
      }
    } else {
      Sound.setEngineLevel(0);
    }
    Object.keys(rows).forEach(k=>{
      const rd = rows[k];
      if (rd.type === 'junction'){
        if (!updatedControllers.has(rd.light)){
          updateLightController(rd.light, dt);
          updatedControllers.add(rd.light);
        }
        const mustStop = rd.light.state !== 'red';
        const { laneCol, laneHalfWidth } = rd.light;
        const STOP_MARGIN = 0.7; 
        const stopLine = rd.dir > 0 ? (laneCol - laneHalfWidth - 0.5 - STOP_MARGIN) : (laneCol + laneHalfWidth + 0.5 + STOP_MARGIN);

        const ordered = rd.cars.slice().sort((a,b)=>
          rd.dir > 0 ? (b.position.x - a.position.x) : (a.position.x - b.position.x)
        );

        ordered.forEach((car, idx)=>{
          const distToLine = rd.dir > 0 ? (stopLine - car.position.x) : (car.position.x - stopLine);
          const passedLine = distToLine < 0;

          let targetSpeed = car.userData.cruiseSpeed;
          if (mustStop && !passedLine && distToLine < BRAKING_ZONE){
            targetSpeed = rd.speed * Math.max(0, distToLine / BRAKING_ZONE);
          }

          if (idx > 0){
            const ahead = ordered[idx-1];
            const gap = rd.dir > 0 ? (ahead.position.x - car.position.x) : (car.position.x - ahead.position.x);
            const freeGap = Math.max(0, gap - CAR_GAP);
            const maxSafeSpeed = ahead.userData.speed + Math.sqrt(2 * MAX_ACCEL * freeGap);
            targetSpeed = Math.min(targetSpeed, maxSafeSpeed);
          }

          const speedDiff = targetSpeed - car.userData.speed;
          const maxDelta = MAX_ACCEL * dt;
          car.userData.speed += Math.max(-maxDelta, Math.min(maxDelta, speedDiff));
          if (car.userData.speed < 0.01 && targetSpeed === 0) car.userData.speed = 0;

          car.position.x += rd.dir * car.userData.speed * dt;

          if (mustStop && !passedLine){
            const newDist = rd.dir > 0 ? (stopLine - car.position.x) : (car.position.x - stopLine);
            if (newDist < 0){ car.position.x = stopLine; car.userData.speed = 0; }
          }
          if (idx > 0){
            const ahead = ordered[idx-1];
            if (rd.dir > 0 && car.position.x > ahead.position.x - CAR_GAP){ car.position.x = ahead.position.x - CAR_GAP; if (car.userData.speed > ahead.userData.speed) car.userData.speed = ahead.userData.speed; }
            if (rd.dir < 0 && car.position.x < ahead.position.x + CAR_GAP){ car.position.x = ahead.position.x + CAR_GAP; if (car.userData.speed > ahead.userData.speed) car.userData.speed = ahead.userData.speed; }
          }
        });

        recycleCars(rd);
      } else if (rd.type === 'zebra'){
        if (rd.beaconMats){
          rd.beaconMats.forEach(mat=>{ mat.emissiveIntensity = beaconPulse; });
        }
        const zebraRow = parseInt(k);
        const { laneCol, laneHalfWidth } = rd;
        const inLane = Math.abs(col - laneCol) <= laneHalfWidth;
        const mustStop = gameState === 'playing' && inLane && (row === zebraRow - 1 || row === zebraRow || row === zebraRow + 1);
        const ZEBRA_STOP_MARGIN = 0.5; 
        const stopLine = rd.dir > 0 ? (laneCol - laneHalfWidth - 0.5 - ZEBRA_STOP_MARGIN) : (laneCol + laneHalfWidth + 0.5 + ZEBRA_STOP_MARGIN);

        const zebraOrdered = rd.cars.slice().sort((a,b)=>
          rd.dir > 0 ? (b.position.x - a.position.x) : (a.position.x - b.position.x)
        );

        zebraOrdered.forEach((car, idx)=>{
          const distToLine = rd.dir > 0 ? (stopLine - car.position.x) : (car.position.x - stopLine);
          const passedLine = distToLine < 0;

          if (!mustStop || passedLine){
            car.userData.zebraCommitted = undefined; 
          } else if (car.userData.zebraCommitted === undefined){
            const requiredStopDist = 0.6 + car.userData.speed * 0.25;
            car.userData.zebraCommitted = distToLine >= requiredStopDist;
          }
          const willStop = mustStop && !passedLine && car.userData.zebraCommitted;

          let targetSpeed = car.userData.cruiseSpeed;
          if (willStop && distToLine < BRAKING_ZONE){
            targetSpeed = rd.speed * Math.max(0, distToLine / BRAKING_ZONE);
          }

          if (idx > 0){
            const ahead = zebraOrdered[idx-1];
            const gap = rd.dir > 0 ? (ahead.position.x - car.position.x) : (car.position.x - ahead.position.x);
            const freeGap = Math.max(0, gap - CAR_GAP);
            const maxSafeSpeed = ahead.userData.speed + Math.sqrt(2 * MAX_ACCEL * freeGap);
            targetSpeed = Math.min(targetSpeed, maxSafeSpeed);
          }

          const speedDiff = targetSpeed - car.userData.speed;
          const maxDelta = MAX_ACCEL * dt;
          car.userData.speed += Math.max(-maxDelta, Math.min(maxDelta, speedDiff));
          if (car.userData.speed < 0.01 && targetSpeed === 0) car.userData.speed = 0;

          car.position.x += rd.dir * car.userData.speed * dt;

          if (willStop){
            const newDist = rd.dir > 0 ? (stopLine - car.position.x) : (car.position.x - stopLine);
            if (newDist < 0){ car.position.x = stopLine; car.userData.speed = 0; }
          }
          if (idx > 0){
            const ahead = zebraOrdered[idx-1];
            if (rd.dir > 0 && car.position.x > ahead.position.x - CAR_GAP){ car.position.x = ahead.position.x - CAR_GAP; if (car.userData.speed > ahead.userData.speed) car.userData.speed = ahead.userData.speed; }
            if (rd.dir < 0 && car.position.x < ahead.position.x + CAR_GAP){ car.position.x = ahead.position.x + CAR_GAP; if (car.userData.speed > ahead.userData.speed) car.userData.speed = ahead.userData.speed; }
          }
        });

        recycleCars(rd);
      }
    });

    emergencyVehicles = emergencyVehicles.filter(ev => {
      if (!rows[ev.row]){
        return false; 
      }
      ev.mesh.position.x += ev.dir * ev.speed * dt;
      if (ev.mesh.userData.beaconMat){
        ev.mesh.userData.beaconMat.emissiveIntensity = 0.35 + 0.65 * Math.abs(Math.sin(elapsedTime * 10));
      }
      if (!ev.sirened && gameState === 'playing'
          && ev.mesh.position.x > COL_MIN - 2 && ev.mesh.position.x < COL_MAX + 2
          && Math.abs(ev.row - row) <= 3){
        ev.sirened = true;
        Sound.play('siren');
      }
      if (ev.mesh.position.x > COL_MAX + 6 || ev.mesh.position.x < COL_MIN - 6){
        rows[ev.row].group.remove(ev.mesh);
        return false;
      }
      return true;
    });

    if (gameState === 'playing'){
      if (hop){
        hop.t += dt / hop.dur;
        const t = Math.min(hop.t, 1);
        posX = hop.fromX + (hop.toX - hop.fromX) * t;
        posZ = hop.fromZ + (hop.toZ - hop.fromZ) * t;
        facing = hop.fromFacing + (hop.toFacing - hop.fromFacing) * t;
        const arc = Math.sin(Math.PI * t) * 0.45;
        chickenMesh.position.y = arc;
        const squash = 1 - Math.sin(Math.PI*t)*0.15;
        chickenMesh.scale.set(1/squash, squash, 1/squash);
        if (t >= 1){
          hop = null;
          chickenMesh.position.y = 0;
          chickenMesh.scale.set(1,1,1);
        }
      }

      player.position.set(posX, 0, posZ);
      player.rotation.y = facing;
      playerShadow.position.set(posX, 0.02, posZ);

      const rd = rows[row];
      if (rd && ROAD_LIKE.has(rd.type) && !hop){
        for (const car of rd.cars){
          if (Math.abs(car.position.x - posX) < 0.62 && Math.abs(car.position.z) < 0.5){
            triggerGameOver('car');
            break;
          }
        }
        if (rd.type === 'junction'){
          const offLane = Math.abs(col - rd.light.laneCol) > rd.light.laneHalfWidth;
          const beforeGreen = rd.light.state !== 'green';
          if (gameState === 'playing' && (offLane || beforeGreen)){
            penaliseJaywalk(rd, offLane ? 'offLane' : 'notGreen');
          }
        }
        if (rd.type === 'zebra'){
          const offLane = Math.abs(col - rd.laneCol) > rd.laneHalfWidth;
          if (gameState === 'playing' && offLane){
            penaliseJaywalk(rd, 'offLane');
          }
        }
      }
      if (!hop && gameState === 'playing'){
        for (const ev of emergencyVehicles){
          if (ev.row === row && Math.abs(ev.mesh.position.x - posX) < 0.62){
            triggerGameOver('ambulance');
            break;
          }
        }
      }
      if (posX < COL_MIN - 0.5 || posX > COL_MAX + 0.5){
        triggerGameOver('edge');
      }

      const camTarget = new THREE.Vector3(posX*0.62, 0.6, posZ + 0.6);
      camera.position.copy(camTarget).addScaledVector(CAM_DIR, CAM_DIST);
      camera.lookAt(camTarget);
      sun.position.set(posX - 20, 30, posZ - 10); // keep the sun a fixed offset from the player so the shadow frustum always covers them
      sun.target.position.set(posX, 0, posZ);

      const near = findNearestJunctionController();
      const showHint = near.atLight && near.ctrl.state === 'red' && !near.ctrl.requested;
      crossHintEl.classList.toggle('show', !!showHint);
    } else if (gameState === 'gameover'){
      deathTimer += dt;
      chickenMesh.scale.y = Math.max(0.15, chickenMesh.scale.y - dt*3);
      chickenMesh.scale.x = chickenMesh.scale.z = 1 + (1-chickenMesh.scale.y)*0.6;
    }

    renderer.render(scene, camera);
  }

  // ---------- UI wiring ----------
  document.getElementById('startBtn').addEventListener('click', ()=>{
    document.getElementById('startScreen').style.display = 'none';
    Sound.resume(); 
    Sound.play('start');
    Sound.startEngineHum();
    resetGame();
    gameState = 'playing';
  });
  document.getElementById('retryBtn').addEventListener('click', ()=>{
    document.getElementById('gameOverScreen').style.display = 'none';
    chickenMesh.scale.set(1,1,1);
    chickenMesh.position.y = 0;
    Sound.resume();
    Sound.play('start');
    Sound.startEngineHum();
    resetGame();
    gameState = 'playing';
  });

  // ---------- certificate of completion ----------
  const certOverlayEl = document.getElementById('certOverlay');
  const certNameEl    = document.getElementById('certName');
  const certEmailEl   = document.getElementById('certEmail');
  const certStatusEl  = document.getElementById('certStatus');
  function openCertModal(){
    if (!certOverlayEl) return;
    certStatusEl.textContent = '';
    certOverlayEl.style.display = 'flex';
    setTimeout(()=>{ if (certNameEl) certNameEl.focus(); else if (certEmailEl) certEmailEl.focus(); }, 50);
  }
  function closeCertModal(){ if (certOverlayEl) certOverlayEl.style.display = 'none'; }
  async function submitCertificate(){
    const name  = ((certNameEl && certNameEl.value) || '').trim();
    const email = ((certEmailEl && certEmailEl.value) || '').trim();
    if (name.length < 2){ certStatusEl.textContent = 'Please enter your name.'; return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ certStatusEl.textContent = 'Please enter a valid email address.'; return; }
    if (!CONFIG.N8N_CERT_WEBHOOK_URL){ certStatusEl.textContent = 'Certificate service is not set up yet (no n8n URL in the code).'; return; }
    const now = new Date();
    const payload = {
      // Fields the n8n workflow reads (secret gate + congratulation + Gmail):
      secret: N8N_CERT_SECRET,
      name: name,
      email: email,
      score: score,
      // Fields for filling the certificate template:
      participantName: name,
      challengeName: CERT_CHALLENGE,
      issuerName: CERT_ISSUER,
      date: now.toLocaleDateString('en-GB', { day:'2-digit', month:'long', year:'numeric' }),
      certId: 'NV-' + now.getFullYear() + '-' + Date.now().toString(36).toUpperCase().slice(-6) + '-' + Math.floor(1000 + Math.random()*9000),
      requestedAt: now.toISOString()
    };
    certStatusEl.textContent = 'Sending\u2026';
    try {
      const res = await fetch(CONFIG.N8N_CERT_WEBHOOK_URL, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(payload) });
      if (res.ok) certStatusEl.textContent = 'Sent! Check your inbox (and spam) for your certificate.';
      else certStatusEl.textContent = 'Could not send (error ' + res.status + '). Please try again.';
    } catch(e){ certStatusEl.textContent = 'Could not reach the certificate service. Check the n8n URL / CORS / your connection.'; }
  }
  ['certBtn','certBtnOver'].forEach(id => { const b = document.getElementById(id); if (b) b.addEventListener('click', openCertModal); });
  { const sBtn = document.getElementById('certSend');  if (sBtn) sBtn.addEventListener('click', submitCertificate); }
  { const cBtn = document.getElementById('certClose'); if (cBtn) cBtn.addEventListener('click', closeCertModal); }

  const muteBtn = document.getElementById('muteBtn');
  if (muteBtn){
    muteBtn.addEventListener('click', ()=>{
      const nowMuted = Sound.toggleMute();
      muteBtn.textContent = nowMuted ? '🔇' : '🔊';
      muteBtn.classList.toggle('muted', nowMuted);
    });
  }

  // --- THIS IS THE CRITICAL FIX AT THE VERY BOTTOM ---
  gameState = 'menu';
  const menuTarget = new THREE.Vector3(0, 0.6, 0.6);
  camera.position.copy(menuTarget).addScaledVector(CAM_DIR, CAM_DIST);
  camera.lookAt(menuTarget);

  loadAllModels(()=>{
    console.log('Car models loaded successfully! Building map now...');
    resetGame(); 
    gameState = 'menu';
    console.log('Car models ready:', Object.keys(modelCache).join(', '));
  });

  animate();
})();                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        