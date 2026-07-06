/* ============================================================
   CROSS SAFE — Road Safety Awareness Game
   Three.js endless crossing game that rewards safe behaviour.

   Behaviour events are collected in Session.events via logEvent()
   — this is the hook point for the future SQL backend
   (users / sessions / incidents / alerts tables).
   ============================================================ */

(function () {
  'use strict';

  // ---------------- Config ----------------
  const TILE = 2;                 // world units per grid tile
  const GRID_MIN_X = -4;          // playable columns
  const GRID_MAX_X = 4;
  const ROAD_SPAN = 7;            // cars travel across x = -SPAN..SPAN tiles
  const CAR_SPEED_MIN = 3.2;      // units/sec
  const CAR_SPEED_MAX = 6.5;
  const SIGNAL_WALK_TIME = 5.0;   // seconds
  const SIGNAL_DONTWALK_TIME = 6.0;
  const ROWS_AHEAD = 16;          // rows generated ahead of player
  const ROWS_BEHIND = 6;          // rows kept behind before cleanup

  const COLORS = {
    grass: 0x8fbf6a,
    grassDark: 0x7fae5c,
    road: 0x3a3d44,
    roadLine: 0xd8d6cf,
    zebra: 0xf3f2ee,
    player: 0x2f6fd6,
    playerAccent: 0xffc400, // hi-vis vest
    signalPole: 0x2a2c30,
    carBodies: [0xe23d2e, 0xf2a33c, 0x5a8fd6, 0x7a5fb5, 0x3fae7c, 0xd6d3cb],
  };

  const FACTS = [
    'Global road accident deaths rose 13% as vehicle volume doubled — even though the fatality rate per vehicle fell 8.3%.',
    'Low-income countries face a 3.5x higher road death rate than wealthy nations, despite having fewer cars.',
    'Road traffic injuries are a leading cause of death for young people worldwide.',
    'Crossing at a signalised crossing dramatically reduces pedestrian risk compared with crossing mid-block.',
    'A pedestrian hit at 50 km/h is far more likely to die than one hit at 30 km/h — speed matters.',
  ];

  const LESSONS = {
    jaywalk: [
      'Crossing mid-block gives drivers almost no time to react. Walk the extra few metres to a proper crossing — the time difference is usually under a minute.',
      'Drivers scan for pedestrians at crossings, not between parked cars. Be where they expect you to be.',
    ],
    red_light: [
      'A red pedestrian signal means traffic has right of way and is NOT expecting you. Wait for WALK — the cycle is shorter than it feels.',
      'Most signal cycles take under a minute. Rushing a red light to save seconds risks everything.',
    ],
  };

  // ---------------- Session / event log (future SQL hook) ----------------
  const Session = {
    startedAt: null,
    score: 0,
    safeCrossings: 0,
    jaywalks: 0,
    redLightCrossings: 0,
    events: [],
  };

  /**
   * Central behaviour logger. When the SQL backend exists, POST these
   * to an API endpoint (e.g. /api/events) instead of only storing locally.
   * Shape maps to a future `incidents` / `events` table:
   *   { type, row, at }
   */
  function logEvent(type, data) {
    const evt = { type, at: Date.now(), ...data };
    Session.events.push(evt);
    // Future: fetch('/api/events', { method: 'POST', body: JSON.stringify(evt) })
  }

  function resetSession() {
    Session.startedAt = Date.now();
    Session.score = 0;
    Session.safeCrossings = 0;
    Session.jaywalks = 0;
    Session.redLightCrossings = 0;
    Session.events = [];
    logEvent('session_start');
  }

  function safetyRating() {
    const bad = Session.jaywalks + Session.redLightCrossings * 2;
    const good = Session.safeCrossings;
    const s = good * 2 - bad * 3;
    if (bad === 0 && good >= 0) return 'A';
    if (s >= 4) return 'B';
    if (s >= 0) return 'C';
    if (s >= -6) return 'D';
    return 'F';
  }

  // ---------------- DOM ----------------
  const $ = (id) => document.getElementById(id);
  const hud = $('hud');
  const scoreEl = $('score');
  const ratingEl = $('rating');
  const signalIndicator = $('signal-indicator');
  const signalStateEl = $('signal-state');
  const toastEl = $('toast');
  const startScreen = $('start-screen');
  const gameoverScreen = $('gameover-screen');

  let toastTimer = null;
  function toast(msg, ms) {
    toastEl.textContent = msg;
    toastEl.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.add('hidden'), ms || 2600);
  }

  function updateHUD() {
    scoreEl.textContent = Session.score;
    const r = safetyRating();
    ratingEl.textContent = r;
    ratingEl.className = 'hud-value rating-' + r;
  }

  // ---------------- Three.js setup ----------------
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1c20);
  scene.fog = new THREE.Fog(0x1a1c20, 26, 46);

  const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  $('game-container').appendChild(renderer.domElement);

  const ambient = new THREE.AmbientLight(0xffffff, 0.55);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xfff4d6, 0.9);
  sun.position.set(-8, 14, -6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -20;
  sun.shadow.camera.right = 20;
  sun.shadow.camera.top = 20;
  sun.shadow.camera.bottom = -20;
  scene.add(sun);

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  // ---------------- Geometry helpers ----------------
  function box(w, h, d, color) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ color })
    );
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  function makePlayer() {
    const g = new THREE.Group();
    const body = box(0.7, 0.8, 0.5, COLORS.player);
    body.position.y = 0.55;
    const vest = box(0.74, 0.34, 0.54, COLORS.playerAccent); // hi-vis vest
    vest.position.y = 0.62;
    const head = box(0.44, 0.4, 0.42, 0xf0c49a);
    head.position.y = 1.18;
    g.add(body, vest, head);
    return g;
  }

  function makeCar(dir) {
    const g = new THREE.Group();
    const color = COLORS.carBodies[(Math.random() * COLORS.carBodies.length) | 0];
    const body = box(1.9, 0.5, 1.0, color);
    body.position.y = 0.45;
    const cabin = box(1.0, 0.42, 0.88, 0xd9e6f2);
    cabin.position.set(-0.15 * dir, 0.85, 0);
    g.add(body, cabin);
    for (const dx of [-0.6, 0.6]) {
      for (const dz of [-0.5, 0.5]) {
        const wheel = box(0.34, 0.34, 0.14, 0x17181b);
        wheel.position.set(dx, 0.2, dz);
        g.add(wheel);
      }
    }
    return g;
  }

  function makeSignal(side) {
    const g = new THREE.Group();
    const pole = box(0.12, 2.2, 0.12, COLORS.signalPole);
    pole.position.y = 1.1;
    const headBox = box(0.5, 0.9, 0.3, COLORS.signalPole);
    headBox.position.y = 2.5;
    const redLamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 12, 12),
      new THREE.MeshLambertMaterial({ color: 0x5a1a14, emissive: 0x000000 })
    );
    redLamp.position.set(0, 2.72, 0.18);
    const greenLamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 12, 12),
      new THREE.MeshLambertMaterial({ color: 0x0f3d1e, emissive: 0x000000 })
    );
    greenLamp.position.set(0, 2.32, 0.18);
    g.add(pole, headBox, redLamp, greenLamp);
    g.position.x = side * (GRID_MAX_X + 1.2) * TILE * 0.5;
    return { group: g, redLamp, greenLamp };
  }

  // ---------------- Rows ----------------
  /**
   * Row types:
   *  - grass:    safe
   *  - road:     cars never stop; stepping here = jaywalking
   *  - crossing: zebra + pedestrian signal; cars stop on WALK
   */
  const rows = new Map(); // rowIndex -> row object
  let nextRowIndex = 0;

  function rowZ(index) {
    return -index * TILE;
  }

  function pickRowType(index) {
    if (index < 2) return 'grass';
    const prev = rows.get(index - 1);
    const prev2 = rows.get(index - 2);
    // avoid > 2 consecutive traffic rows; guarantee breathing room
    const trafficStreak =
      (prev && prev.type !== 'grass' ? 1 : 0) +
      (prev2 && prev2.type !== 'grass' ? 1 : 0);
    if (trafficStreak >= 2) return 'grass';
    const r = Math.random();
    if (r < 0.38) return 'grass';
    if (r < 0.68) return 'road';
    return 'crossing';
  }

  function makeRow(index) {
    const type = pickRowType(index);
    const z = rowZ(index);
    const group = new THREE.Group();
    const width = (ROAD_SPAN * 2 + 1) * TILE;

    const groundColor =
      type === 'grass'
        ? (index % 2 ? COLORS.grass : COLORS.grassDark)
        : COLORS.road;
    const ground = new THREE.Mesh(
      new THREE.BoxGeometry(width, 0.3, TILE),
      new THREE.MeshLambertMaterial({ color: groundColor })
    );
    ground.receiveShadow = true;
    ground.position.set(0, -0.15, z);
    group.add(ground);

    const row = {
      index,
      type,
      z,
      group,
      cars: [],
      dir: Math.random() < 0.5 ? -1 : 1,
      speed: CAR_SPEED_MIN + Math.random() * (CAR_SPEED_MAX - CAR_SPEED_MIN),
      signal: null,
      signalState: null,
      signalTimer: 0,
      playerLogged: false, // one behaviour event per row entry
    };

    if (type === 'road') {
      // dashed centre guidance line
      for (let x = -ROAD_SPAN; x <= ROAD_SPAN; x += 2) {
        const dash = new THREE.Mesh(
          new THREE.BoxGeometry(0.9, 0.02, 0.1),
          new THREE.MeshBasicMaterial({ color: COLORS.roadLine })
        );
        dash.position.set(x * TILE, 0.02, z + TILE / 2);
        group.add(dash);
      }
    }

    if (type === 'crossing') {
      // zebra stripes across playable width
      for (let x = GRID_MIN_X; x <= GRID_MAX_X; x++) {
        const stripe = new THREE.Mesh(
          new THREE.BoxGeometry(TILE * 0.55, 0.02, TILE * 0.86),
          new THREE.MeshBasicMaterial({ color: COLORS.zebra })
        );
        stripe.position.set(x * TILE, 0.02, z);
        group.add(stripe);
      }
      const sig = makeSignal(1);
      sig.group.position.z = z + TILE * 0.5;
      group.add(sig.group);
      row.signal = sig;
      // stagger cycles so crossings aren't synchronised
      row.signalState = Math.random() < 0.5 ? 'walk' : 'dontwalk';
      row.signalTimer =
        Math.random() *
        (row.signalState === 'walk' ? SIGNAL_WALK_TIME : SIGNAL_DONTWALK_TIME);
      applySignalVisual(row);
    }

    if (type !== 'grass') {
      // seed cars with spacing
      let x = -ROAD_SPAN * TILE;
      while (x < ROAD_SPAN * TILE) {
        if (Math.random() < 0.55) {
          const car = makeCar(row.dir);
          car.position.set(x, 0, z);
          car.rotation.y = row.dir === 1 ? 0 : Math.PI;
          group.add(car);
          row.cars.push({ mesh: car, x });
        }
        x += TILE * (2.2 + Math.random() * 2.4);
      }
    } else {
      // occasional trees on non-playable edge tiles
      for (let i = 0; i < 3; i++) {
        if (Math.random() < 0.6) {
          const side = Math.random() < 0.5 ? -1 : 1;
          const tx = side * (GRID_MAX_X + 1 + ((Math.random() * 2) | 0)) * TILE;
          const trunk = box(0.24, 0.7, 0.24, 0x6b4a2d);
          trunk.position.set(tx, 0.35, z);
          const leaves = box(0.9, 0.9, 0.9, 0x3f7d4a);
          leaves.position.set(tx, 1.15, z);
          group.add(trunk, leaves);
        }
      }
    }

    scene.add(group);
    rows.set(index, row);
    return row;
  }

  function applySignalVisual(row) {
    const walk = row.signalState === 'walk';
    row.signal.greenLamp.material.emissive.setHex(walk ? 0x2ebd59 : 0x000000);
    row.signal.greenLamp.material.color.setHex(walk ? 0x2ebd59 : 0x0f3d1e);
    row.signal.redLamp.material.emissive.setHex(walk ? 0x000000 : 0xe23d2e);
    row.signal.redLamp.material.color.setHex(walk ? 0x5a1a14 : 0xe23d2e);
  }

  function ensureRows(playerRow) {
    while (nextRowIndex <= playerRow + ROWS_AHEAD) {
      makeRow(nextRowIndex++);
    }
    for (const [idx, row] of rows) {
      if (idx < playerRow - ROWS_BEHIND) {
        scene.remove(row.group);
        row.group.traverse((o) => {
          if (o.geometry) o.geometry.dispose();
          if (o.material) o.material.dispose();
        });
        rows.delete(idx);
      }
    }
  }

  // ---------------- Player ----------------
  const player = {
    mesh: makePlayer(),
    gridX: 0,
    row: 0,
    hopFrom: null,
    hopTo: null,
    hopT: 1,
    alive: true,
  };
  scene.add(player.mesh);

  function playerWorldPos() {
    return { x: player.gridX * TILE, z: rowZ(player.row) };
  }

  function placePlayer() {
    const p = playerWorldPos();
    player.mesh.position.set(p.x, 0, p.z);
  }

  function tryMove(dir) {
    if (!player.alive || player.hopT < 1) return;
    let nx = player.gridX;
    let nr = player.row;
    if (dir === 'forward') nr += 1;
    else if (dir === 'back') nr = Math.max(0, nr - 1);
    else if (dir === 'left') nx = Math.max(GRID_MIN_X, nx - 1);
    else if (dir === 'right') nx = Math.min(GRID_MAX_X, nx + 1);
    if (nx === player.gridX && nr === player.row) return;

    player.hopFrom = playerWorldPos();
    player.gridX = nx;
    const movedForward = nr > player.row;
    player.row = nr;
    player.hopTo = playerWorldPos();
    player.hopT = 0;

    if (movedForward) {
      Session.score = Math.max(Session.score, player.row);
      onEnterRow(rows.get(player.row));
      ensureRows(player.row);
    }
    updateHUD();
  }

  function onEnterRow(row) {
    if (!row || row.playerLogged) return;
    if (row.type === 'road') {
      row.playerLogged = true;
      Session.jaywalks++;
      logEvent('jaywalk', { row: row.index });
      toast('⚠ Jaywalking! No crossing here — drivers are not expecting you.');
    } else if (row.type === 'crossing') {
      row.playerLogged = true;
      if (row.signalState === 'walk') {
        Session.safeCrossings++;
        logEvent('safe_crossing', { row: row.index });
        toast('✔ Safe crossing on WALK — this is how it’s done.', 1800);
      } else {
        Session.redLightCrossings++;
        logEvent('red_light_crossing', { row: row.index });
        toast('⛔ Crossing on red! Traffic has right of way.');
      }
    }
  }

  // ---------------- Input ----------------
  const KEYMAP = {
    ArrowUp: 'forward', KeyW: 'forward',
    ArrowDown: 'back', KeyS: 'back',
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
  };
  addEventListener('keydown', (e) => {
    const dir = KEYMAP[e.code];
    if (dir) {
      e.preventDefault();
      tryMove(dir);
    }
  });

  document.querySelectorAll('#dpad button').forEach((btn) => {
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      tryMove(btn.dataset.dir);
    });
  });

  let touchStart = null;
  addEventListener('touchstart', (e) => {
    if (e.target.closest('button') || e.target.closest('.overlay')) return;
    touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: true });
  addEventListener('touchend', (e) => {
    if (!touchStart) return;
    const dx = e.changedTouches[0].clientX - touchStart.x;
    const dy = e.changedTouches[0].clientY - touchStart.y;
    touchStart = null;
    if (Math.abs(dx) < 24 && Math.abs(dy) < 24) { tryMove('forward'); return; }
    if (Math.abs(dx) > Math.abs(dy)) tryMove(dx > 0 ? 'right' : 'left');
    else tryMove(dy < 0 ? 'forward' : 'back');
  }, { passive: true });

  // ---------------- Death & restart ----------------
  function die(cause) {
    if (!player.alive) return;
    player.alive = false;
    logEvent('death', { cause, row: player.row });
    player.mesh.rotation.z = Math.PI / 2;
    player.mesh.position.y = 0.2;

    const isRed = cause === 'red_light';
    $('death-title').textContent = isRed ? 'Hit crossing on red' : 'Hit while jaywalking';
    $('death-cause').textContent = isRed
      ? 'You stepped onto the crossing while the pedestrian signal was red. Vehicles had right of way.'
      : 'You crossed mid-road, away from any crossing. The driver had no time to react.';
    const lessons = LESSONS[isRed ? 'red_light' : 'jaywalk'];
    $('death-lesson').textContent = lessons[(Math.random() * lessons.length) | 0];
    $('stat-distance').textContent = Session.score;
    $('stat-safe').textContent = Session.safeCrossings;
    $('stat-jaywalk').textContent = Session.jaywalks;
    $('stat-redlight').textContent = Session.redLightCrossings;
    const r = safetyRating();
    const fr = $('final-rating');
    fr.textContent = r;
    fr.className = 'rating-' + r;
    $('death-fact').textContent = FACTS[(Math.random() * FACTS.length) | 0];

    logEvent('session_end', {
      score: Session.score,
      rating: r,
      safeCrossings: Session.safeCrossings,
      jaywalks: Session.jaywalks,
      redLightCrossings: Session.redLightCrossings,
    });

    setTimeout(() => gameoverScreen.classList.remove('hidden'), 650);
  }

  function resetWorld() {
    for (const [, row] of rows) {
      scene.remove(row.group);
      row.group.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
    }
    rows.clear();
    nextRowIndex = 0;
    player.gridX = 0;
    player.row = 0;
    player.hopT = 1;
    player.alive = true;
    player.mesh.rotation.z = 0;
    ensureRows(0);
    placePlayer();
    resetSession();
    updateHUD();
  }

  // ---------------- Game loop ----------------
  const clock = new THREE.Clock();
  let running = false;

  function updateSignals(dt) {
    let nearest = null;
    for (const [, row] of rows) {
      if (row.type !== 'crossing') continue;
      row.signalTimer += dt;
      const limit = row.signalState === 'walk' ? SIGNAL_WALK_TIME : SIGNAL_DONTWALK_TIME;
      if (row.signalTimer >= limit) {
        row.signalTimer = 0;
        row.signalState = row.signalState === 'walk' ? 'dontwalk' : 'walk';
        applySignalVisual(row);
      }
      if (row.index > player.row && (!nearest || row.index < nearest.index)) {
        nearest = row;
      }
    }
    if (nearest) {
      signalIndicator.classList.remove('hidden');
      const walk = nearest.signalState === 'walk';
      signalStateEl.textContent = walk ? 'WALK' : 'WAIT';
      signalStateEl.className = 'hud-value ' + (walk ? 'walk' : 'dontwalk');
    } else {
      signalIndicator.classList.add('hidden');
    }
  }

  function updateCars(dt) {
    const span = ROAD_SPAN * TILE + 3;
    for (const [, row] of rows) {
      if (row.type === 'grass') continue;
      const stopped = row.type === 'crossing' && row.signalState === 'walk';
      for (const car of row.cars) {
        if (!stopped) {
          car.x += row.dir * row.speed * dt;
          if (car.x > span) car.x = -span;
          if (car.x < -span) car.x = span;
          car.mesh.position.x = car.x;
        }
      }
    }
  }

  function checkCollision() {
    if (!player.alive) return;
    const row = rows.get(player.row);
    if (!row || row.type === 'grass') return;
    if (row.type === 'crossing' && row.signalState === 'walk') return; // cars stopped, crossing safe
    const px = player.mesh.position.x;
    for (const car of row.cars) {
      if (Math.abs(car.x - px) < 1.25) {
        die(row.type === 'crossing' ? 'red_light' : 'jaywalk');
        return;
      }
    }
  }

  function updatePlayerHop(dt) {
    if (player.hopT >= 1) return;
    player.hopT = Math.min(1, player.hopT + dt * 6.5);
    const t = player.hopT;
    const x = player.hopFrom.x + (player.hopTo.x - player.hopFrom.x) * t;
    const z = player.hopFrom.z + (player.hopTo.z - player.hopFrom.z) * t;
    const y = Math.sin(t * Math.PI) * 0.45;
    player.mesh.position.set(x, y, z);
  }

  function updateCamera() {
    const targetZ = player.mesh.position.z;
    camera.position.lerp(
      new THREE.Vector3(player.mesh.position.x * 0.35 + 6, 11, targetZ + 10),
      0.06
    );
    camera.lookAt(player.mesh.position.x * 0.35, 0, targetZ - 2);
  }

  function loop() {
    requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05);
    if (running) {
      updateSignals(dt);
      updateCars(dt);
      updatePlayerHop(dt);
      checkCollision();
    }
    updateCamera();
    renderer.render(scene, camera);
  }

  // ---------------- Boot ----------------
  $('start-fact').textContent = FACTS[(Math.random() * FACTS.length) | 0];

  $('start-btn').addEventListener('click', () => {
    startScreen.classList.add('hidden');
    hud.classList.remove('hidden');
    if (matchMedia('(hover: none)').matches) $('dpad').classList.remove('hidden');
    resetWorld();
    running = true;
  });

  $('restart-btn').addEventListener('click', () => {
    gameoverScreen.classList.add('hidden');
    resetWorld();
  });

  ensureRows(0);
  placePlayer();
  camera.position.set(6, 11, 10);
  camera.lookAt(0, 0, -2);
  loop();
})();
