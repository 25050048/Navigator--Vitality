(function(){

  // ---------- basic setup ----------
  const holder = document.getElementById('canvasHolder');
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fd6ea);
  scene.fog = new THREE.Fog(0x9fd6ea, 28, 54);

  const TILE = 1;

  // Crossy Road style camera: a real PerspectiveCamera with a very narrow FOV,
  // parked far back along the isometric direction. At that distance, near and
  // far objects read at almost the same size (like an orthographic camera
  // would), but there's still a touch of real depth/parallax - which is what
  // gives Crossy Road its distinctive "flat but not quite" look.
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

  // ---------- world config ----------
  const COL_MIN = -5, COL_MAX = 5; // playable column range (narrowed for a tighter, more compact feel)

  // decorative ground extends way past the playable columns on both sides, so
  // at the tighter camera zoom you never see the strip end mid-air - it's
  // purely visual, isBlocked() below still only cares about COL_MIN/COL_MAX
  const GROUND_PAD = 40;
  const GROUND_W = (COL_MAX - COL_MIN) + GROUND_PAD;

  const CAR_COLORS = [0xe74c3c, 0xf1c40f, 0x3498db, 0xe67e22, 0x9b59b6, 0x1abc9c, 0xecf0f1];

  // ---------- biomes (purely cosmetic reskins, no gameplay change) ----------
  // the world cycles through these every BIOME_LENGTH rows so the run doesn't
  // look like the same grass/road forever - background scenery + tint change,
  // obstacles/lanes/collision are identical across biomes
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

  // ---------- difficulty progression ----------
  // traffic gradually gets faster/denser as the run goes on, capping out
  // around row 150 so it never becomes unfair - purely a speed/density curve,
  // no rule changes
  const DIFFICULTY_CAP_ROW = 150;
  function difficultyFactor(rowIndex){
    return 1 + Math.min(Math.max(rowIndex, 0), DIFFICULTY_CAP_ROW) / DIFFICULTY_CAP_ROW;
  }
  function scaleRange(range, factor){
    return [range[0] * factor, range[1] * factor];
  }

  // ---------- rare special events ----------
  // an emergency vehicle occasionally barrels through a junction regardless of
  // the light - teaches that a green light isn't a guarantee, always look
  const EMERGENCY_EVENT_CHANCE = 0.12;
  let emergencyVehicles = [];

  // rows storage: rows[rowIndex] = { type, group(THREE.Group), ... }
  let rows = {};
  let rowGroupParent = new THREE.Group();
  scene.add(rowGroupParent);

  let maxGeneratedRow = -1;

  // tracks the lane column of the most recently generated crossing (starts at
  // the player's spawn column) - used so the connecting grass between two
  // crossings always has a guaranteed clear lateral path from one lane to the
  // next, not just a clear path straight into the upcoming crossing
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

  // decorative-only flower patch - never blocks movement, just fills in empty grass
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

  // small traffic cone - a lighter obstacle, blocks just its own tile like a tree
  function makeConeObstacle(){
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

  // walk backward through every consecutive grass row leading up to a crossing
  // and clear any tree/cone sitting in the lane's approach columns, so there's
  // always a guaranteed straight path into the lane no matter how long the
  // preceding grass patch is
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

  // ---------- background scenery (decorative only, sits beyond the playable
  // columns so it never affects collision, just fills in the biome flavor) ----------
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

  // adds biome-flavored background scenery just outside the playable columns
  // on both sides - never touches treeCols/blocked, so it can never affect movement
  function addBackgroundScenery(g, rowIndex, biome){
    const leftX = COL_MIN - rand(1.6, 2.6);
    const rightX = COL_MAX + rand(1.6, 2.6);
    if (biome === 'town'){
      if (Math.random() < 0.6){ const h = makeHouse(); h.position.set(leftX, 0, rand(-0.3,0.3)); g.add(h); }
      if (Math.random() < 0.6){ const h = makeHouse(); h.position.set(rightX, 0, rand(-0.3,0.3)); g.add(h); }
      if (Math.random() < 0.4){ const l = makeLampPost(); l.position.set(leftX + rand(-0.4,0.4), 0, rand(-0.3,0.3)); g.add(l); }
    } else if (biome === 'school'){
      if (Math.random() < 0.35){ const f = makeSchoolFlag(); f.position.set(leftX, 0, 0); g.add(f); }
      if (Math.random() < 0.7){ const b = makeSchoolBush(); b.position.set(rightX, 0, rand(-0.3,0.3)); g.add(b); }
      if (Math.random() < 0.5){ const fence = makeFenceSeg(); fence.position.set(leftX + rand(-0.3,0.3), 0, rand(-0.3,0.3)); g.add(fence); }
    } else { // park
      if (Math.random() < 0.5){ const t = makeTreeObstacle(); t.position.set(leftX, 0, rand(-0.3,0.3)); g.add(t); }
      if (Math.random() < 0.5){ const t = makeTreeObstacle(); t.position.set(rightX, 0, rand(-0.3,0.3)); g.add(t); }
      if (Math.random() < 0.3){ const l = makeLampPost(); l.position.set(rightX + rand(-0.4,0.4), 0, rand(-0.3,0.3)); g.add(l); }
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
      if (c === 0 && rowIndex < 2) continue; // keep spawn clear
      treeCols.add(c);
    }
    treeCols.forEach(c=>{
      const obstacle = Math.random() < 0.25 ? makeConeObstacle() : makeTreeObstacle();
      obstacle.position.set(c, 0, 0);
      g.add(obstacle);
      treeMeshes.set(c, obstacle);
    });

    // scatter decorative flower patches - purely visual, never blocks movement
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

  function makeCar(){
    const car = new THREE.Group();
    const color = choice(CAR_COLORS);
    const body = box(1.0,0.35,0.62,color);
    body.position.y = 0.28;
    const cabin = box(0.55,0.3,0.55,0xdfeff5);
    cabin.position.set(0.05,0.58,0);
    const wheelMat = new THREE.MeshLambertMaterial({color:0x222222});
    const wheelGeo = new THREE.BoxGeometry(0.22,0.22,0.7);
    const w1 = new THREE.Mesh(wheelGeo, wheelMat); w1.position.set(0.32,0.1,0);
    const w2 = new THREE.Mesh(wheelGeo, wheelMat); w2.position.set(-0.32,0.1,0);
    car.add(body, cabin, w1, w2);
    car.traverse(o=>{
      if(o.isMesh){
        o.castShadow=true; o.receiveShadow=true;
        o.material = o.material.clone(); // own material instance so opacity fades don't leak between cars
        o.material.transparent = true;
      }
    });
    return car;
  }

  // rare special-event vehicle: an ambulance that ignores the stop line
  // entirely, regardless of the light - it's the "even a green light isn't a
  // guarantee, always check" moment
  function makeAmbulance(){
    const car = new THREE.Group();
    const body = box(1.05,0.4,0.62,0xf2f2f2);
    body.position.y = 0.3;
    const stripe = box(1.07,0.14,0.64,0xe74c3c);
    stripe.position.y = 0.3;
    const cabin = box(0.5,0.28,0.55,0xdfeff5);
    cabin.position.set(0.3,0.62,0);
    const beacon = box(0.24,0.1,0.24,0xff3b3b);
    beacon.material = new THREE.MeshStandardMaterial({ color:0xff3b3b, emissive:0xff2222, emissiveIntensity:0.6 });
    beacon.position.set(0,0.78,0);
    const wheelMat = new THREE.MeshLambertMaterial({color:0x222222});
    const wheelGeo = new THREE.BoxGeometry(0.22,0.22,0.7);
    const w1 = new THREE.Mesh(wheelGeo, wheelMat); w1.position.set(0.34,0.1,0);
    const w2 = new THREE.Mesh(wheelGeo, wheelMat); w2.position.set(-0.34,0.1,0);
    car.add(body, stripe, cabin, beacon, w1, w2);
    car.traverse(o=>{ if(o.isMesh){ o.castShadow=true; o.receiveShadow=true; } });
    car.userData.beaconMat = beacon.material;
    return car;
  }

  // fade a car in/out as it nears the off-screen spawn/despawn edges, instead of
  // popping abruptly into or out of existence
  const CAR_FADE_ZONE = 1.8;
  function setCarOpacity(car, opacity){
    car.traverse(o=>{ if (o.isMesh && o.material) o.material.opacity = opacity; });
  }
  function carEdgeOpacity(x){
    const farLimit = COL_MAX + 4;
    const nearLimit = COL_MIN - 4;
    const fadeFar = clamp((farLimit - x) / CAR_FADE_ZONE, 0, 1);
    const fadeNear = clamp((x - nearLimit) / CAR_FADE_ZONE, 0, 1);
    return Math.min(fadeFar, fadeNear);
  }

  // wrap a lane's cars around once they're far off-screen. Rather than dropping
  // each one back at a fixed spot (which can land it right on top of another car
  // that just wrapped, so two pop into view together), the new spawn point is
  // tucked at least one lane-gap behind whichever car is currently the most
  // rearward - so cars always re-enter the screen one at a time, in a queue.
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

  // wide crossing lane: interior stays completely plain (same as the road, no
  // markings at all), only the two edges get a dotted white highlight line
  const LANE_HALF_WIDTH = 1; // lane spans laneCol-1 .. laneCol+1 (3 tiles wide)

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
      vehicle.position.set(COL_MIN + i*gap*dir*-1 + rand(-1,1), 0, 0);
      vehicle.userData.speed = speed; // current eased speed, used for smooth braking
      vehicle.userData.cruiseSpeed = speed; // this vehicle's own top speed when not braking
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

  // classic Belisha beacon - black/white striped pole topped with an orange globe
  // that flashes slowly. Purely aesthetic, marks the zebra crossing like in real life.
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

  // single-lane road with no traffic light - a plain zebra crossing, sized to match
  // the light-controlled crossings. Cars yield (brake to a full stop) whenever the
  // player is waiting to cross or already on it, otherwise they drive through freely.
  function makeZebraCrossing(rowIndex){
    const g = new THREE.Group();
    const biome = biomeForRow(rowIndex);
    const ground = box(GROUND_W, 1, TILE, BIOME_DATA[biome].roadTint);
    ground.position.set((COL_MIN+COL_MAX)/2, -0.5, 0);
    ground.receiveShadow = true;
    g.add(ground);

    const laneCol = randInt(COL_MIN + 1 + LANE_HALF_WIDTH, COL_MAX - 1 - LANE_HALF_WIDTH);
    makeCrosswalkStripes(g, laneCol);

    // guarantee a clear path into the lane, all the way back through the
    // entire grass patch leading up to this crossing (not just the last row).
    // Also span all the way back to the PREVIOUS crossing's lane column, so if
    // the two lanes sit at different columns, the lateral shimmy between them
    // can't get walled off by a stray obstacle in a narrow connecting strip.
    const zebraClearMin = Math.min(lastLaneCol, laneCol) - LANE_HALF_WIDTH;
    const zebraClearMax = Math.max(lastLaneCol, laneCol) + LANE_HALF_WIDTH;
    clearApproachPath(rowIndex, zebraClearMin, zebraClearMax);
    lastLaneCol = laneCol;
    const approachRow = rows[rowIndex - 1];

    // one Belisha beacon, planted on the grass curb right before the crossing -
    // off the road entirely, standing right where a pedestrian would wait
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
      // pedestrian side: red = don't walk (cars flowing), green = walk (cars stopped)
      redLight.material.emissive.setHex(ctrl.state==='red' ? 0xff2222 : 0x000000);
      redLight.material.color.setHex(ctrl.state==='red' ? 0xff4444 : 0x551111);
      yellowLight.material.emissive.setHex(ctrl.state==='yellow' ? 0xffcc00 : 0x000000);
      yellowLight.material.color.setHex(ctrl.state==='yellow' ? 0xffdd55 : 0x554411);
      greenLight.material.emissive.setHex(ctrl.state==='green' ? 0x22ff22 : 0x000000);
      greenLight.material.color.setHex(ctrl.state==='green' ? 0x44ff44 : 0x115511);
    }
  }

  // Pedestrian-controlled light. Default is RED (cars flow freely).
  // Player presses E right at the junction to request a crossing:
  // red -> yellow (cars slow) -> green (cars stop, safe to cross) -> yellow (warning) -> red
  function updateLightController(ctrl, dt){
    if (ctrl.state === 'red'){
      if (ctrl.requested){
        ctrl.requested = false;
        ctrl.state = 'yellow';
        ctrl.phase = 'toGreen';
        ctrl.timer = 0.9;
        updatePoleVisual(ctrl);
      }
      return; // stays red (cars keep flowing) until requested
    }
    ctrl.timer -= dt;
    if (ctrl.timer <= 0){
      if (ctrl.state === 'yellow' && ctrl.phase === 'toGreen'){
        ctrl.state = 'green'; ctrl.timer = 4.5;
      } else if (ctrl.state === 'green'){
        ctrl.state = 'yellow'; ctrl.phase = 'toRed'; ctrl.timer = 1.0;
      } else if (ctrl.state === 'yellow' && ctrl.phase === 'toRed'){
        ctrl.state = 'red'; ctrl.requested = false;
      }
      updatePoleVisual(ctrl);
    }
  }

  // Every road is a light-controlled crossing (1-4 lanes wide), with one shared
  // traffic light and a single vertical "safe lane" the player must stay inside
  // while crossing (stepping outside it anywhere in the block is fatal).
  function makeJunction(startRow, width){
    const laneCol = randInt(COL_MIN + 1 + LANE_HALF_WIDTH, COL_MAX - 1 - LANE_HALF_WIDTH);
    const controller = {
      state: 'red',      // red = cars flow, yellow = transition, green = cars stopped for pedestrian
      phase: null,
      timer: 0,
      requested: false,
      laneCol,
      laneHalfWidth: LANE_HALF_WIDTH,
      startRow,
      endRow: startRow + width - 1
    };
    // stand the pedestrian light right beside the lane, facing the side the player approaches from
    const poleOffsetDir = laneCol < (COL_MIN + COL_MAX) / 2 ? -1 : 1;
    const poleX = laneCol + poleOffsetDir * (LANE_HALF_WIDTH + 0.25);
    const poleRow = startRow; // pedestrian pole stands right where the crossing begins

    // guarantee a clear path into the lane, all the way back through the
    // entire grass patch leading up to this crossing (not just the last row).
    // Also span back to the PREVIOUS crossing's lane column so the lateral
    // shimmy connecting the two lanes can never get walled off.
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

      // rare special event: an ambulance that ignores the stop line completely,
      // regardless of the light state - only ever one attempt per junction row
      if (Math.random() < EMERGENCY_EVENT_CHANCE){
        spawnEmergencyVehicle(rowIndex, dir);
      }
    }
    updatePoleVisual(controller);
  }

  // spawns a one-off ambulance on the given row that drives straight through
  // ignoring the pedestrian light entirely - added to a separate list so it
  // never gets tangled up with the normal car-following/braking logic
  function spawnEmergencyVehicle(rowIndex, dir){
    const rd = rows[rowIndex];
    if (!rd) return;
    const amb = makeAmbulance();
    const startX = dir > 0 ? (COL_MIN - rand(3, 6)) : (COL_MAX + rand(3, 6));
    amb.position.set(startX, 0, 0);
    rd.group.add(amb);
    emergencyVehicles.push({ mesh: amb, row: rowIndex, dir, speed: rand(4.5, 6) });
  }

  function decideRowType(prevType, prevType2){
    let weights = { grass:0.5, junction:0.32, zebra:0.18 };
    if (prevType !== 'grass') weights.grass += 0.28;
    // always leave a grass gap between any two crossings
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
      // single-lane crossing - no traffic light needed, just a classic zebra crossing
      makeZebraCrossing(rowIndex);
      rows[rowIndex].group.position.z = rowIndex;
      maxGeneratedRow = rowIndex;
    } else if (type === 'junction'){
      const width = randInt(2, 4); // wider roads still get a light-controlled crossing
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

  // fill in a few plain grass rows BEHIND the spawn point (negative row
  // indices) so that at the start of a run the camera sees a complete grassy
  // platform underneath and behind the player, instead of the ground appearing
  // to end right at their feet. These are purely cosmetic - the player never
  // needs to walk back onto them, and cleanupOldRows sweeps them once passed.
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
    const furColor = 0xf2a154; // orange tabby
    const bodyMat = new THREE.MeshLambertMaterial({color:furColor});
    const body = box(0.42,0.34,0.5, furColor, bodyMat);
    body.position.y = 0.28;

    const head = box(0.34,0.3,0.3, furColor, bodyMat);
    head.position.set(0,0.58,0.2);

    // pointy ears
    const earGeo = new THREE.ConeGeometry(0.09,0.16,4);
    const earL = new THREE.Mesh(earGeo, bodyMat);
    earL.position.set(0.12,0.8,0.16); earL.rotation.y = Math.PI/4;
    const earR = new THREE.Mesh(earGeo, bodyMat);
    earR.position.set(-0.12,0.8,0.16); earR.rotation.y = Math.PI/4;

    // inner ear
    const innerEarMat = new THREE.MeshLambertMaterial({color:0xffc9d6});
    const innerGeo = new THREE.ConeGeometry(0.05,0.09,4);
    const innerL = new THREE.Mesh(innerGeo, innerEarMat); innerL.position.set(0.12,0.77,0.19); innerL.rotation.y = Math.PI/4;
    const innerR = new THREE.Mesh(innerGeo, innerEarMat); innerR.position.set(-0.12,0.77,0.19); innerR.rotation.y = Math.PI/4;

    // muzzle + nose
    const muzzle = box(0.16,0.1,0.1, 0xffffff);
    muzzle.position.set(0,0.52,0.36);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.045,0.045,0.045), new THREE.MeshLambertMaterial({color:0xff8fa3}));
    nose.position.set(0,0.57,0.38);

    // eyes
    const eyeMat = new THREE.MeshLambertMaterial({color:0x1c1c1c});
    const eyeGeo = new THREE.BoxGeometry(0.05,0.06,0.05);
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat); eyeL.position.set(0.1,0.64,0.34);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat); eyeR.position.set(-0.1,0.64,0.34);

    // tail, curved back and up
    const tail = box(0.09,0.09,0.4, furColor, bodyMat);
    tail.position.set(0,0.4,-0.36);
    tail.rotation.x = 0.55;

    // legs / paws
    const legMat = new THREE.MeshLambertMaterial({color:furColor});
    const legGeo = new THREE.BoxGeometry(0.1,0.18,0.1);
    const legFL = new THREE.Mesh(legGeo, legMat); legFL.position.set(0.14,0.09,0.16);
    const legFR = new THREE.Mesh(legGeo, legMat); legFR.position.set(-0.14,0.09,0.16);
    const legBL = new THREE.Mesh(legGeo, legMat); legBL.position.set(0.14,0.09,-0.16);
    const legBR = new THREE.Mesh(legGeo, legMat); legBR.position.set(-0.14,0.09,-0.16);

    // white belly patch
    const belly = box(0.2,0.16,0.3, 0xffffff);
    belly.position.set(0,0.2,0.05);

    g.add(body, head, earL, earR, innerL, innerR, muzzle, nose, eyeL, eyeR, tail, legFL, legFR, legBL, legBR, belly);
    g.traverse(o=>{ if(o.isMesh){ o.castShadow=true; o.receiveShadow=true; } });
    return g;
  }
  const chickenMesh = buildCat();
  player.add(chickenMesh);
  scene.add(player);

  // shadow blob under player
  const shadowGeo = new THREE.CircleGeometry(0.32, 16);
  const shadowMat = new THREE.MeshBasicMaterial({color:0x000000, transparent:true, opacity:0.25});
  const playerShadow = new THREE.Mesh(shadowGeo, shadowMat);
  playerShadow.rotation.x = -Math.PI/2;
  playerShadow.position.y = 0.02;
  scene.add(playerShadow);

  // ---------- safety quiz (Ranger Zeb, the safety buddy) ----------
  // Local content for the prototype. Swap `pickQuizItem`'s question-picking for
  // an LLM call later - scoring, UI, and flow control all stay the same either way.
  const BUDDY_NAME = "Ranger Zeb";

  // ---------- bottom-left buddy agent ----------
  // Ranger Zeb hangs out in the corner and reacts to what the player does
  // (praise for safe crossings, callouts for jaywalking) and otherwise cycles
  // through Singapore road-safety facts so there's always something to learn.
  const buddyAgentEl = document.getElementById('buddyAgent');
  const buddyAgentTextEl = document.getElementById('buddyAgentText');
  let buddyMsgTimer = null;
  let buddyIdleTimer = null;

  // Singapore-specific road-safety facts shown during calm moments
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

  // show a message for `hold` ms, then resume the idle fact rotation
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
    scheduleIdleFact(7000); // next fact after a while
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

  // Category-tagged question bank: 'junction' asked at traffic-light crossings,
  // 'zebra' asked at zebra crossings, 'sg' is general Singapore road-rule trivia
  // mixed in occasionally so both crossing types can surface it.
  const QUIZ_BANK = [
    { cat:'junction', q:"At a Singapore pedestrian crossing, the green man just appeared. What should you do?", options:["Cross - but still glance both ways for turning vehicles","Sprint across without looking","Wait for it to flash first"], correct:0, explain:"A steady green man means you can cross, but always check for vehicles turning into your path." },
    { cat:'junction', q:"The pedestrian light shows a flashing green man. You haven't started yet. What now?", options:["Start crossing quickly to make it","Wait for the next steady green man","Cross diagonally to save time"], correct:1, explain:"Flashing green means there isn't enough time to start - wait for the next steady green man." },
    { cat:'junction', q:"You press the crossing button but the red man is still showing. What should you do?", options:["Cross once the road looks clear","Wait for the green man - the button only makes a request","Press it repeatedly to speed it up"], correct:1, explain:"The button just registers your request; you must still wait for the green man before crossing." },
    { cat:'junction', q:"What does the 'Green Man+' feature at some Singapore crossings do?", options:["Gives cyclists priority","Adds extra crossing time when you tap a concession card","Turns the light green instantly"], correct:1, explain:"Green Man+ gives seniors and persons with disabilities extra green-man time when they tap their card." },
    { cat:'junction', q:"You're already crossing when the green man starts flashing. What should you do?", options:["Stop and wait in the middle","Keep moving and finish crossing promptly","Turn back to the kerb"], correct:1, explain:"If you've already started, keep going and finish - don't stop in the middle of the road." },
    { cat:'zebra', q:"At a zebra crossing in Singapore, a car is slowing but hasn't stopped. What do you do?", options:["Step out, it's slowing anyway","Wait until it has fully stopped","Wave for it to hurry up"], correct:1, explain:"Even at a zebra crossing, wait until the vehicle has completely stopped before you step out." },
    { cat:'zebra', q:"A driver waves you across before their car has fully stopped. What should you do?", options:["Cross quickly since they waved","Wait until the car is completely still","Cross behind the car instead"], correct:1, explain:"Never rely on a wave - wait until the vehicle has actually stopped moving." },
    { cat:'zebra', q:"Where is the safest place to wait before stepping onto a zebra crossing?", options:["On the road edge, ready to go","A step back from the kerb","Between parked cars"], correct:1, explain:"Wait a step back from the kerb so you're clear of passing and turning traffic." },
    { cat:'sg', q:"In Singapore, cars drive on the left. Which way should you look first?", options:["Left first","Right first","Straight ahead only"], correct:1, explain:"With left-hand traffic, the nearest cars come from your right - so look right first, then left, then right again." },
    { cat:'sg', q:"Is it an offence to cross within 50 metres of a proper crossing without using it?", options:["No, it's fine if it's quiet","Yes - that's jaywalking and can be fined","Only during rush hour"], correct:1, explain:"Crossing within 50m of a pedestrian crossing without using it is jaywalking, an offence in Singapore." },
    { cat:'sg', q:"You need to cross a busy expressway-like road. What's the safest option in Singapore?", options:["Dash across when there's a gap","Use an overhead bridge or underpass","Climb over the centre railing"], correct:1, explain:"Where there's an overhead bridge or underpass, use it - never cross fast roads or climb barriers." },
    { cat:'sg', q:"What is a 'Silver Zone' in a Singapore neighbourhood?", options:["A car-free shopping street","An area with lower speed limits to protect elderly pedestrians","A special bus-only lane"], correct:1, explain:"Silver Zones near estates with many elderly residents use lower speed limits and calmer road designs for safety." },
    { cat:'sg', q:"Before crossing, you're wearing earphones and looking at your phone. What should you do?", options:["Cross carefully while listening","Remove earphones and look up before crossing","Only pause the music"], correct:1, explain:"Distractions like phones and earphones stop you noticing traffic - put them away before you cross." },
    { cat:'sg', q:"At a signalised junction with a green man, a car is turning left across your path. What do you do?", options:["Assume it must stop for you and keep walking","Make eye contact and let it pass if it hasn't seen you","Speed up to beat it"], correct:1, explain:"Turning vehicles may not have seen you - stay alert and don't assume they'll stop, even on a green man." }
  ];

  // Targeted follow-up questions, keyed by exactly how the player died last time.
  // Shown as the very first quiz of the next run so the lesson lands right away.
  const CONTEXT_QUESTIONS = {
    car: { q:"Last time a car caught you. In Singapore, before stepping onto any road you should:", options:["Just go, cars will brake","Check the green man or that cars have fully stopped","Cross wherever there's a gap"], correct:1, explain:"Always confirm it's safe - a green man, or vehicles fully stopped - before you step out." },
    offLane: { q:"Last time you strayed outside the marked crossing. What's the rule in Singapore?", options:["Any part of the road is fine","Stay within the marked crossing the whole way","Only the middle matters"], correct:1, explain:"Cross within the painted crossing lines - it's where drivers expect and look for pedestrians." },
    notGreen: { q:"Last time you crossed before the green man. What should you wait for?", options:["A gap in traffic is enough","The steady green man to appear","The red man to flash"], correct:1, explain:"Wait for the steady green man - it means the traffic has been signalled to stop for you." },
    edge: { q:"Last time you wandered off the path. Where should you stick to?", options:["Anywhere that's quiet","Pavements, and proper crossings when crossing","The road shoulder"], correct:1, explain:"Stay on the pavement and only cross at proper crossings - it keeps you where drivers expect you." },
    ambulance: { q:"Last time an ambulance caught you on a green man. What's the lesson?", options:["Green man guarantees total safety","Emergency vehicles may cross even a red light - always look","Ambulances always stop for you"], correct:1, explain:"Emergency vehicles can proceed against the lights - a green man is your signal, not a guarantee, so keep looking." }
  };

  // Tips shown directly on the game-over screen (no question - just Ranger Zeb's take).
  const DEATH_TIPS = {
    car: "You stepped into the road while a car was still moving. Always double-check it's actually your turn before you go.",
    offLane: "You strayed outside the marked crossing lane. Cars expect pedestrians to stay inside the lines the whole way across.",
    notGreen: "You crossed before the green man appeared. Waiting for green means the cars have actually stopped for you.",
    edge: "You wandered off the path. Sticking to the road and marked crossings keeps you where drivers expect you to be.",
    ambulance: "An ambulance came through and didn't stop for the light. Emergency vehicles can override normal traffic rules - always take a quick look, even when it's supposed to be your turn."
  };

  let quizActive = false;
  // how often a crossing actually pops a safety question (rather than every
  // single one) - keeps the run feeling less repetitive
  const QUIZ_CHANCE = 0.45;
  let quizCategoryQueues = { junction:[], zebra:[], sg:[] };
  // full run tracker feeding the end-of-run Safety Report Card. Beyond quiz
  // accuracy, we log the actual crossing behaviors that matter for road safety:
  // did the player wait for a full green / full stop, did they stay in the lane,
  // did they ever step out on a warning phase, etc.
  let safetyStats = {
    quizCorrect: 0,
    quizWrong: 0,
    crossings: 0,        // total crossings completed (junction + zebra)
    safeCrossings: 0,    // crossings where they waited properly (green / fully-stopped car)
    rushedCrossings: 0,  // crossings taken while it wasn't fully safe yet
    junctionsCrossed: 0,
    zebrasCrossed: 0,
    jaywalks: 0          // times caught jaywalking (off-lane or before green)
  };
  let lastDeathType = null;      // carried across runs, used for context-aware follow-up
  let pendingContextQuiz = null; // set right after a death, consumed by the next quiz
  let pendingRequestCtrls = [];  // junction controllers waiting to actually be "requested"
                                  // (i.e. start red->yellow->green) until the quiz is answered

  const quizOverlayEl = document.getElementById('quizOverlay');
  const quizQuestionEl = document.getElementById('quizQuestion');
  const quizOptionsEl = document.getElementById('quizOptions');
  const quizFeedbackEl = document.getElementById('quizFeedback');
  const quizContextTagEl = document.getElementById('quizContextTag');

  function refillCategoryQueue(cat){
    const indices = QUIZ_BANK.map((item, i) => item.cat === cat ? i : -1).filter(i => i >= 0);
    for (let i = indices.length - 1; i > 0; i--){
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    quizCategoryQueues[cat] = indices;
  }

  function pickQuizItem(category){
    if (pendingContextQuiz){
      const item = pendingContextQuiz;
      pendingContextQuiz = null;
      return { item, isContext:true };
    }
    if (quizCategoryQueues[category].length === 0) refillCategoryQueue(category);
    const qi = quizCategoryQueues[category].pop();
    return { item: QUIZ_BANK[qi], isContext:false };
  }

  function askQuiz(ctrl, category){
    if (quizActive || ctrl.quizAsked) return;
    ctrl.quizAsked = true;
    const { item, isContext } = pickQuizItem(category);

    quizActive = true;
    quizContextTagEl.textContent = isContext ? "Let's revisit that..." : "SAFETY CHECK";
    quizQuestionEl.textContent = item.q;
    quizFeedbackEl.textContent = '';
    quizOptionsEl.innerHTML = '';

    item.options.forEach((opt, idx) => {
      const btn = document.createElement('button');
      btn.className = 'quizOptionBtn';
      btn.textContent = opt;
      btn.addEventListener('click', () => answerQuiz(idx, item));
      quizOptionsEl.appendChild(btn);
    });

    quizOverlayEl.style.display = 'flex';
  }

  function answerQuiz(chosenIdx, item){
    const buttons = quizOptionsEl.querySelectorAll('.quizOptionBtn');
    buttons.forEach(b => b.disabled = true);
    const correct = chosenIdx === item.correct;

    buttons[item.correct].classList.add('correct');
    if (!correct) buttons[chosenIdx].classList.add('wrong');

    if (correct){
      score += 3;
      safetyStats.quizCorrect++;
      updateScoreHUD();
      quizFeedbackEl.textContent = 'Correct! +3 points - ' + item.explain;
    } else {
      safetyStats.quizWrong++;
      quizFeedbackEl.textContent = item.explain;
    }

    setTimeout(() => {
      quizOverlayEl.style.display = 'none';
      quizActive = false;
      // only now does the light actually get "requested" - so red->yellow->green
      // never starts until the player has answered the safety question
      if (pendingRequestCtrls.length){
        pendingRequestCtrls.forEach(ctrl => { ctrl.requested = true; });
        pendingRequestCtrls = [];
      }
    }, 1900);
  }

  // ---------- game state ----------
  let gameState = 'menu'; // menu | playing | gameover
  let col = 0, row = 0;
  let posX = 0, posZ = 0; // world position
  let facing = 0; // rotation Y
  let hop = null; // {fromX,fromZ,toX,toZ,t,dur,fromFacing,toFacing}
  let score = 0;
  let best = 0;
  let deathTimer = 0;
  let deathType = null;

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
    deathTimer = 0; deathType = null;
    quizActive = false;
    safetyStats = { quizCorrect:0, quizWrong:0, crossings:0, safeCrossings:0, rushedCrossings:0, junctionsCrossed:0, zebrasCrossed:0, jaywalks:0 };
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

  function updateScoreHUD(){
    document.getElementById('score').textContent = score;
    document.getElementById('best').textContent = 'BEST ' + best;
  }

  const ROAD_LIKE = new Set(['junction', 'zebra']);

  function isBlocked(c, r){
    const rd = rows[r];
    if (!rd) return true; // no ground there (either before the start or already cleaned up behind us) - can't go there
    if (c < COL_MIN || c > COL_MAX) return true;
    if (rd.type === 'grass' && rd.blocked.has(c)) return true;
    return false;
  }

  function tryMove(dc, dr){
    if (gameState !== 'playing') return;
    if (hop) return; // already hopping
    if (quizActive) return; // quiz has the floor
    const nc = col + dc;
    const nr = row + dr;
    if (isBlocked(nc, nr)) return;
    ensureRowsUpTo(nr + 8);

    // first approach to a zebra crossing: Ranger Zeb sometimes asks a quick
    // question before you step out (not every time, so it feels less repetitive)
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

    col = nc; row = nr;

    // zebra crossing bonus: reward waiting for the car to fully stop before stepping out
    if (dr === 1 && rows[nr] && rows[nr].type === 'zebra'){
      const allStopped = rows[nr].cars.every(car => car.userData.speed < 0.05);
      score += allStopped ? 5 : 1;
      // log this crossing behavior once, the first time onto this zebra row
      if (!rows[nr].crossLogged){
        rows[nr].crossLogged = true;
        safetyStats.crossings++;
        safetyStats.zebrasCrossed++;
        if (allStopped){
          safetyStats.safeCrossings++; rows[nr].wasSafeCrossing = true;
          buddySay("Nice - you waited for the cars to fully stop. That's the way!", 'tip', 2600);
        } else {
          safetyStats.rushedCrossings++;
        }
      }
    }
    // junction crossing: safe if the light was fully green when we stepped onto it
    if (dr === 1 && rows[nr] && rows[nr].type === 'junction'){
      const rd = rows[nr];
      if (!rd.crossLogged){
        rd.crossLogged = true;
        safetyStats.crossings++;
        safetyStats.junctionsCrossed++;
        if (rd.light && rd.light.state === 'green'){
          safetyStats.safeCrossings++; rd.wasSafeCrossing = true;
          buddySay("Green man's on and you're in the lane - perfect crossing!", 'tip', 2600);
        } else {
          safetyStats.rushedCrossings++;
        }
      }
    }

    if (row > score) score = row;
    updateScoreHUD();
    cleanupOldRows(row);
  }

  // ---------- pedestrian crossing request ----------
  function findAdjacentJunctionControllers(){
    const seen = new Set();
    let forwardMatch = null, backwardMatch = null;
    Object.keys(rows).forEach(k=>{
      const rd = rows[k];
      if (rd.type !== 'junction' || seen.has(rd.light)) return;
      seen.add(rd.light);
      const ctrl = rd.light;
      if (row === ctrl.startRow - 1) forwardMatch = ctrl;   // crossing ahead of us
      if (row === ctrl.endRow + 1) backwardMatch = ctrl;    // crossing behind us
    });
    return { forwardMatch, backwardMatch };
  }

  function junctionIsRequestable(ctrl){
    if (!ctrl) return false;
    const inFrontOfLane = Math.abs(col - ctrl.laneCol) <= ctrl.laneHalfWidth;
    return inFrontOfLane && ctrl.state === 'red' && !ctrl.requested;
  }

  // used for the on-screen hint - true if pressing E would do something right now
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
    // queue whichever side(s) are actually waiting on red - covers the case of
    // standing on a single grass tile sandwiched between two crossings.
    const toQueue = [];
    if (junctionIsRequestable(forwardMatch)) toQueue.push(forwardMatch);
    if (junctionIsRequestable(backwardMatch)) toQueue.push(backwardMatch);
    if (!toQueue.length) return;

    // only sometimes ask a safety question (less repetitive). When we do ask,
    // the light stays red until the quiz is answered. When we don't, request
    // the light immediately so pressing E still starts the crossing right away.
    const askThisTime = toQueue.some(c => !c.quizChecked);
    toQueue.forEach(c => { c.quizChecked = true; });
    if (askThisTime && Math.random() < QUIZ_CHANCE){
      pendingRequestCtrls.push(...toQueue);
      askQuiz(toQueue[0], 'junction');
    } else {
      toQueue.forEach(c => { c.requested = true; });
    }
  }

  // ---------- input ----------
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

  // swipe
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

  // ---------- safety report card ----------
  // turns the run's tracked behaviors into a letter grade + a breakdown. The
  // grade weights actual crossing behavior more heavily than quiz answers,
  // since doing the right thing matters more than knowing the right answer.
  function computeReportCard(){
    const s = safetyStats;
    const totalQuiz = s.quizCorrect + s.quizWrong;
    const quizPct = totalQuiz > 0 ? s.quizCorrect / totalQuiz : null;
    const crossPct = s.crossings > 0 ? s.safeCrossings / s.crossings : null;

    // blended safety score 0..1: crossing behavior is 70%, quiz knowledge 30%.
    // if one side has no data, the other carries full weight.
    let scorePct;
    if (crossPct !== null && quizPct !== null) scorePct = crossPct * 0.7 + quizPct * 0.3;
    else if (crossPct !== null) scorePct = crossPct;
    else if (quizPct !== null) scorePct = quizPct;
    else scorePct = null; // no crossings, no quizzes - graded on survival only

    let grade, gradeClass, headline;
    if (scorePct === null){ grade = '-'; gradeClass='gradeMid'; headline = "Not much crossing this run - give it another go!"; }
    else if (scorePct >= 0.9){ grade = 'A'; gradeClass='gradeGood'; headline = "Excellent road sense! You crossed like a pro."; }
    else if (scorePct >= 0.75){ grade = 'B'; gradeClass='gradeGood'; headline = "Solid and safe. A few rushed moments to smooth out."; }
    else if (scorePct >= 0.55){ grade = 'C'; gradeClass='gradeMid'; headline = "Getting there - remember to wait for it to be fully safe."; }
    else if (scorePct >= 0.35){ grade = 'D'; gradeClass='gradeLow'; headline = "Slow down and wait for the full signal before crossing."; }
    else { grade = 'F'; gradeClass='gradeLow'; headline = "Lots of rushing out there. Patience keeps you safe!"; }

    return { s, totalQuiz, quizPct, crossPct, scorePct, grade, gradeClass, headline };
  }

  // returns a compact object suitable for sending to the n8n / email pipeline
  function buildReportPayload(card, type){
    return {
      finalScore: score,
      best,
      deathCause: type,
      grade: card.grade,
      safetyScorePct: card.scorePct === null ? null : Math.round(card.scorePct * 100),
      crossings: card.s.crossings,
      safeCrossings: card.s.safeCrossings,
      rushedCrossings: card.s.rushedCrossings,
      junctionsCrossed: card.s.junctionsCrossed,
      zebrasCrossed: card.s.zebrasCrossed,
      jaywalks: card.s.jaywalks || 0,
      quizCorrect: card.s.quizCorrect,
      quizTotal: card.totalQuiz,
      timestamp: new Date().toISOString()
    };
  }

  // Optional: POST each end-of-run report to an n8n webhook (Webhook -> Code ->
  // If -> Email). Leave the URL blank to disable - the game works fine without
  // it. Paste your n8n Production webhook URL here and attach SMTP creds in n8n.
  const CONFIG = { N8N_WEBHOOK_URL: '' };
  function sendSessionReport(payload){
    if (!CONFIG.N8N_WEBHOOK_URL) return; // disabled until a URL is set
    try {
      fetch(CONFIG.N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true // let it complete even as the page/tab settles
      }).catch(()=>{}); // network hiccups shouldn't ever interrupt gameplay
    } catch(e){ /* no-op */ }
  }

  // ---------- jaywalk penalty ----------
  const JAYWALK_PENALTY = 20; // points removed per jaywalking crossing
  function penaliseJaywalk(rd, kind){
    if (rd.jaywalkPenalised) return; // only once per crossing, not every frame
    rd.jaywalkPenalised = true;

    score = Math.max(0, score - JAYWALK_PENALTY);
    updateScoreHUD();

    // this counts as an unsafe crossing for the safety score. If it wasn't
    // already logged as a completed crossing, log it here as a rushed one.
    if (!rd.crossLogged){
      rd.crossLogged = true;
      safetyStats.crossings++;
      if (rd.type === 'junction') safetyStats.junctionsCrossed++;
      else if (rd.type === 'zebra') safetyStats.zebrasCrossed++;
    } else if (rd.wasSafeCrossing){
      // it had been logged as safe - downgrade it now that we've caught a jaywalk
      safetyStats.safeCrossings = Math.max(0, safetyStats.safeCrossings - 1);
      rd.wasSafeCrossing = false;
    }
    safetyStats.rushedCrossings++;
    safetyStats.jaywalks = (safetyStats.jaywalks || 0) + 1;

    // buddy agent calls out exactly what went wrong, with the SG-specific rule
    const msg = kind === 'notGreen'
      ? `Jaywalking! Wait for the green man before you step out. -${JAYWALK_PENALTY} pts`
      : `Jaywalking! In Singapore you must cross within the marked lane. -${JAYWALK_PENALTY} pts`;
    buddySay(msg, 'alert', 3200);
  }

  // ---------- game over ----------
  function triggerGameOver(type){
    if (gameState !== 'playing') return;
    gameState = 'gameover';
    deathType = type;
    deathTimer = 0;
    crossHintEl.classList.remove('show');
    if (buddyMsgTimer) clearTimeout(buddyMsgTimer);
    if (buddyIdleTimer) clearTimeout(buddyIdleTimer);
    if (score > best) best = score;
    updateScoreHUD();

    lastDeathType = type;
    pendingContextQuiz = CONTEXT_QUESTIONS[type] || null;

    setTimeout(()=>{
      const card = computeReportCard();
      document.getElementById('finalScore').textContent = score;

      const buddyTipEl = document.getElementById('buddyTip');
      buddyTipEl.textContent = DEATH_TIPS[type] || "Stay alert out there - every crossing deserves a careful look.";

      // safety stats still computed and sent to the n8n webhook / email pipeline
      // (CONFIG.N8N_WEBHOOK_URL) even though the on-screen report card is hidden
      const payload = buildReportPayload(card, type);
      if (typeof sendSessionReport === 'function') sendSessionReport(payload);

      document.getElementById('gameOverScreen').style.display = 'flex';
    }, 550);
  }

  // ---------- main loop ----------
  let lastTime = performance.now();
  let elapsedTime = 0;

  function animate(){
    requestAnimationFrame(animate);
    const now = performance.now();
    let dt = (now - lastTime) / 1000;
    dt = Math.min(dt, 0.05);
    lastTime = now;
    elapsedTime += dt;

    // update rows (cars + traffic lights)
    const updatedControllers = new Set();
    const BRAKING_ZONE = 3.6;   // distance before the line where cars start slowing
    const MAX_ACCEL = 6.5;      // units/sec^2 for smooth speed changes
    const CAR_GAP = 1.5;        // minimum nose-to-tail spacing so queued cars don't overlap
    const beaconPulse = 0.25 + 0.75 * Math.abs(Math.sin(elapsedTime * Math.PI / 1.3)); // slow flash
    Object.keys(rows).forEach(k=>{
      const rd = rows[k];
      if (rd.type === 'junction'){
        if (!updatedControllers.has(rd.light)){
          updateLightController(rd.light, dt);
          updatedControllers.add(rd.light);
        }
        // red = cars flow freely, yellow/green = must stop right at the edge of the pedestrian lane
        const mustStop = rd.light.state !== 'red';
        const { laneCol, laneHalfWidth } = rd.light;
        const STOP_MARGIN = 0.7; // extra buffer so cars halt short of the edge line, not right on it
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

          // physically-correct safe-following speed: the fastest this car can go
          // and still be able to brake down to the car ahead's speed before
          // closing the gap - this prevents overlap by construction, no position
          // snapping needed, so it always looks like natural, gradual braking
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

          // never let a braking car creep past the lane edge
          if (mustStop && !passedLine){
            const newDist = rd.dir > 0 ? (stopLine - car.position.x) : (car.position.x - stopLine);
            if (newDist < 0){ car.position.x = stopLine; car.userData.speed = 0; }
          }
          // hard floor against any residual numerical creep - the speed formula above
          // should already prevent this in practice, this just guarantees it exactly
          if (idx > 0){
            const ahead = ordered[idx-1];
            if (rd.dir > 0 && car.position.x > ahead.position.x - CAR_GAP){ car.position.x = ahead.position.x - CAR_GAP; if (car.userData.speed > ahead.userData.speed) car.userData.speed = ahead.userData.speed; }
            if (rd.dir < 0 && car.position.x < ahead.position.x + CAR_GAP){ car.position.x = ahead.position.x + CAR_GAP; if (car.userData.speed > ahead.userData.speed) car.userData.speed = ahead.userData.speed; }
          }
        });

        // wrap cars around once they're far off-screen, staggered so they enter
        // the screen one at a time instead of clumping together at the edge
        recycleCars(rd);
      } else if (rd.type === 'zebra'){
        // slow flashing Belisha beacon (aesthetic only, doesn't affect car behavior)
        if (rd.beaconMats){
          rd.beaconMats.forEach(mat=>{ mat.emissiveIntensity = beaconPulse; });
        }
        // no traffic light here - cars yield (brake to a full stop) only while the
        // player is actually lined up with the crossing lane (same rule as the
        // E-button proximity check), waiting right before it or already on it
        const zebraRow = parseInt(k);
        const { laneCol, laneHalfWidth } = rd;
        const inLane = Math.abs(col - laneCol) <= laneHalfWidth;
        const mustStop = gameState === 'playing' && inLane && (row === zebraRow - 1 || row === zebraRow || row === zebraRow + 1);
        const ZEBRA_STOP_MARGIN = 0.5; // stop a bit short of the lane edge, not right on it
        const stopLine = rd.dir > 0 ? (laneCol - laneHalfWidth - 0.5 - ZEBRA_STOP_MARGIN) : (laneCol + laneHalfWidth + 0.5 + ZEBRA_STOP_MARGIN);

        const zebraOrdered = rd.cars.slice().sort((a,b)=>
          rd.dir > 0 ? (b.position.x - a.position.x) : (a.position.x - b.position.x)
        );

        zebraOrdered.forEach((car, idx)=>{
          const distToLine = rd.dir > 0 ? (stopLine - car.position.x) : (car.position.x - stopLine);
          const passedLine = distToLine < 0;

          if (!mustStop || passedLine){
            car.userData.zebraCommitted = undefined; // reset once there's nothing to react to
          } else if (car.userData.zebraCommitted === undefined){
            // decide ONCE, the first moment a stop is required: does this car have
            // enough room left to brake safely at its current speed? If not, it just
            // can't stop in time and will barrel through - same as a real driver
            // caught off guard. Re-checking every frame as distance shrinks would
            // wrongly flip a car that's already braking properly into "too late".
            const requiredStopDist = 0.6 + car.userData.speed * 0.25;
            car.userData.zebraCommitted = distToLine >= requiredStopDist;
          }
          const willStop = mustStop && !passedLine && car.userData.zebraCommitted;

          let targetSpeed = car.userData.cruiseSpeed;
          if (willStop && distToLine < BRAKING_ZONE){
            targetSpeed = rd.speed * Math.max(0, distToLine / BRAKING_ZONE);
          }

          // physically-correct safe-following speed - prevents overlap by
          // construction instead of snapping position, so braking always looks natural
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
          // hard floor against any residual numerical creep - the speed formula above
          // should already prevent this in practice, this just guarantees it exactly
          if (idx > 0){
            const ahead = zebraOrdered[idx-1];
            if (rd.dir > 0 && car.position.x > ahead.position.x - CAR_GAP){ car.position.x = ahead.position.x - CAR_GAP; if (car.userData.speed > ahead.userData.speed) car.userData.speed = ahead.userData.speed; }
            if (rd.dir < 0 && car.position.x < ahead.position.x + CAR_GAP){ car.position.x = ahead.position.x + CAR_GAP; if (car.userData.speed > ahead.userData.speed) car.userData.speed = ahead.userData.speed; }
          }
        });

        // wrap cars around once they're far off-screen, staggered so they enter
        // the screen one at a time instead of clumping together at the edge
        recycleCars(rd);
      }
    });

    // rare special event: ambulances ignore the light entirely and just drive
    // straight through at a fixed speed - updated separately from normal
    // per-row traffic since they don't follow/brake like regular cars
    emergencyVehicles = emergencyVehicles.filter(ev => {
      if (!rows[ev.row]){
        return false; // its row was cleaned up behind the player, drop it
      }
      ev.mesh.position.x += ev.dir * ev.speed * dt;
      if (ev.mesh.userData.beaconMat){
        ev.mesh.userData.beaconMat.emissiveIntensity = 0.35 + 0.65 * Math.abs(Math.sin(elapsedTime * 10));
      }
      if (ev.mesh.position.x > COL_MAX + 6 || ev.mesh.position.x < COL_MIN - 6){
        rows[ev.row].group.remove(ev.mesh);
        return false;
      }
      return true;
    });

    if (gameState === 'playing'){
      // hop animation
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

      // collision checks
      const rd = rows[row];
      if (rd && ROAD_LIKE.has(rd.type) && !hop){
        for (const car of rd.cars){
          if (Math.abs(car.position.x - posX) < 0.62 && Math.abs(car.position.z) < 0.5){
            triggerGameOver('car');
            break;
          }
        }
        // jaywalking (crossing outside the marked lane, or before the light is
        // green) no longer kills - instead it's penalised once per crossing:
        // points come off and the safety score takes a hit. The real risk is
        // that cars are still live while you jaywalk, so it stays dangerous.
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
      // ambulances ignore the light/lane rules entirely - checked separately
      // since they aren't part of any row's normal car list
      if (!hop && gameState === 'playing'){
        for (const ev of emergencyVehicles){
          if (ev.row === row && Math.abs(ev.mesh.position.x - posX) < 0.62){
            triggerGameOver('ambulance');
            break;
          }
        }
      }
      // side bounds fail-safe - stepping fully off the edge of the world still ends the run
      if (posX < COL_MIN - 0.5 || posX > COL_MAX + 0.5){
        triggerGameOver('edge');
      }

      // camera follow - telephoto style: track a target point, hold the
      // camera at a fixed distance/direction from it, and look straight at it
      const camTarget = new THREE.Vector3(posX*0.62, 0.6, posZ + 0.6);
      camera.position.copy(camTarget).addScaledVector(CAM_DIR, CAM_DIST);
      camera.lookAt(camTarget);
      sun.target.position.set(posX, 0, posZ);

      // crossing hint visibility - only once the player has actually reached the light
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
    resetGame();
    gameState = 'playing';
  });
  document.getElementById('retryBtn').addEventListener('click', ()=>{
    document.getElementById('gameOverScreen').style.display = 'none';
    chickenMesh.scale.set(1,1,1);
    chickenMesh.position.y = 0;
    resetGame();
    gameState = 'playing';
  });

  // pre-generate a few rows for the menu background
  resetGame();
  gameState = 'menu';
  const menuTarget = new THREE.Vector3(0, 0.6, 0.6);
  camera.position.copy(menuTarget).addScaledVector(CAM_DIR, CAM_DIST);
  camera.lookAt(menuTarget);

  animate();
})();