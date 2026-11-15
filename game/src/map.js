// map.js — "Night Harbor": an original 72 x 56 m container port at night.
// Salvagers (teal) spawn west and attack; Harbour Watch (orange) spawn east
// and defend. Site A is a warehouse interior north-east; Site B is the crane
// dock south-east; a customs house splits the mid lane. Every wall, crate and
// container is both a mesh and an axis-aligned collider used by movement,
// bullets and line-of-sight checks. Colliders carry a `mat` tag so the scene
// builder picks the right material for each one.
import * as THREE from 'three';
import {
  groundTexture, wallTexture, containerTexture, crateTexture, metalTexture,
  hazardTexture, siteTexture, neonTexture, waterTexture,
} from './textures.js';

export const MAP = { minX: -36, maxX: 36, minZ: -28, maxZ: 28 };
export const SITE_A = { x: 23, z: -17, r: 5.5 };
export const SITE_B = { x: 23, z: 17, r: 5.5 };
export const SPAWNS = {
  salvage: [
    [-32, -8], [-32, -2], [-32, 4], [-32, 10], [-30, 0],
  ],
  harbour: [
    [32, -18], [32, -10], [32, 10], [32, 18], [29, 0],
  ],
};

// Collider: {x, z, hx, hz, h, mat} — centre, half extents, height, material.
// mat: 'wall' | 'container' | 'crate' | 'metal' | 'hazard'. h=0: no block.
export const COLLIDERS = [];
function box(x, z, hx, hz, h = 3.2, mat = 'wall') {
  COLLIDERS.push({ x, z, hx, hz, h, mat });
  return { x, z, hx, hz, h, mat };
}

export function buildColliders() {
  COLLIDERS.length = 0;
  // Perimeter walls.
  box(0, -28.6, 37, 0.6, 5); box(0, 28.6, 37, 0.6, 5);
  box(-36.6, 0, 0.6, 29, 5); box(36.6, 0, 0.6, 29, 5);
  // Site A — warehouse interior, x 16..30, z -24..-10. Doors west (z -17..-13)
  // and south (x 20..24).
  box(23, -24, 7, 0.6, 4.5); // north wall
  box(30, -17, 0.6, 7, 4.5); // east wall
  box(18, -10, 2, 0.6, 4.5); // south wall, west of the door
  box(27, -10, 3, 0.6, 4.5); // south wall, east of the door
  box(16, -20.5, 0.6, 3.5, 4.5); // west wall, north of the door
  box(16, -11.5, 0.6, 1.5, 4.5); // west wall, south of the door
  // Warehouse interior props: pallet stacks and a shelving run.
  box(25, -21, 2, 1, 1.4, 'crate'); box(19, -13, 1, 2, 1.2, 'crate');
  box(28, -15, 0.8, 2.5, 2.4, 'metal');
  // Site B — crane dock. Gantry crane legs + container stacks around it.
  box(17, 11, 0.8, 0.8, 9, 'hazard'); box(17, 23, 0.8, 0.8, 9, 'hazard');
  box(26, 22, 2.5, 1.2, 2.6, 'container'); box(28, 12, 1.2, 2.5, 2.6, 'container');
  box(20, 24, 2, 1, 1.3, 'crate'); box(24, 10, 1.6, 1.6, 1.3, 'crate');
  // Customs house, mid: x -2..6, z -7..7, doors west and east at z -2..2.
  box(2, -7, 4, 0.6, 4); box(2, 7, 4, 0.6, 4);
  box(-2, -4.5, 0.6, 2.5, 4); box(-2, 4.5, 0.6, 2.5, 4);
  box(6, -4.5, 0.6, 2.5, 4); box(6, 4.5, 0.6, 2.5, 4);
  // Container stacks in the mid yard (double stacks read as cover + height).
  box(-10, -2, 2.4, 1.2, 5.2, 'container'); box(-8, 4, 1.2, 2.4, 2.6, 'container');
  box(10, -4, 1.2, 1.2, 2.6, 'container'); box(12, 5, 2.4, 1.2, 5.2, 'container');
  // North lane (A approach) cover.
  box(-24, -20, 2.2, 1.2, 2.6, 'container'); box(-12, -22, 1.2, 1.2, 1.4, 'crate');
  box(8, -20, 2, 1, 1.3, 'crate'); box(-2, -18, 1, 1, 3.4, 'metal');
  box(-20, -14, 1.4, 1.4, 1.2, 'crate');
  // South lane (B approach) cover.
  box(-24, 20, 2.2, 1.2, 2.6, 'container'); box(-12, 22, 1.2, 1.2, 1.4, 'crate');
  box(8, 20, 2, 1, 1.3, 'crate'); box(-2, 18, 1, 1, 3.4, 'metal');
  box(-20, 14, 1.4, 1.4, 1.2, 'crate');
  // Mid-lane pillars and a forklift row.
  box(14, -8, 1.2, 1.2, 1.3, 'crate'); box(14, 8, 1.2, 1.2, 1.3, 'crate');
  box(-16, -6, 1.6, 1, 1.5, 'metal'); box(-16, 6, 1.6, 1, 1.5, 'metal');
  // Spawn cover.
  box(-28, -8, 1.5, 1, 1.3, 'crate'); box(-28, 8, 1.5, 1, 1.3, 'crate');
  box(28, -8, 1, 1.5, 1.3, 'crate'); box(28, 8, 1, 1.5, 1.3, 'crate');
  return COLLIDERS;
}

// Waypoint graph for bot navigation. Nodes are open ground; edges link
// neighbours with a clear straight line (checked against colliders at build).
export const WAYPOINTS = [
  [-32, 0], [-26, -8], [-26, 8], [-26, 0], // 0-3 attack spawn
  [-18, -20], [-10, -21], [-2, -20], [8, -19], [14, -17], // 4-8 north lane
  [-18, 20], [-10, 21], [-2, 20], [8, 19], [14, 17], // 9-13 south lane
  [-12, 0], [-6, -3], [-6, 4], [2, 0], [10, -3], [10, 4], [14, 0], // 14-20 mid
  [18, -16], [23, -17], [27, -14], [20, -21], [26, -20], // 21-25 site A
  [18, 16], [23, 17], [27, 14], [20, 21], [26, 20], // 26-30 site B
  [32, 0], [28, -8], [28, 8], // 31-33 defend spawn
  [-16, -10], [-16, 10], [16, -8], [16, 8], // 34-37 cross links
  [-4, -12], [-4, 12], [12, -12], [12, 12], // 38-41 lane connectors
];
export const EDGES = [];
function link(a, b) { EDGES.push([a, b]); }
export function buildGraph() {
  EDGES.length = 0;
  const pairs = [
    [0, 1], [0, 2], [0, 3], [1, 4], [2, 9], [3, 14], [3, 34], [3, 35],
    [4, 5], [5, 6], [6, 7], [7, 8], [8, 21], [8, 38], [5, 38], [6, 38],
    [9, 10], [10, 11], [11, 12], [12, 13], [13, 26], [13, 39], [10, 39], [11, 39],
    [14, 15], [14, 16], [15, 17], [16, 17], [17, 18], [17, 19], [18, 20], [19, 20],
    [14, 34], [14, 35], [20, 36], [20, 37], [20, 31], [36, 31], [37, 31],
    [21, 22], [22, 23], [22, 24], [22, 25], [21, 24], [23, 25],
    [26, 27], [27, 28], [27, 29], [27, 30], [26, 29], [28, 30],
    [31, 32], [31, 33], [32, 36], [33, 37], [36, 23], [37, 28],
    [34, 38], [35, 39], [38, 40], [39, 41], [40, 17], [41, 17],
    [40, 7], [41, 12], [38, 6], [39, 11], [34, 15], [35, 16],
    [8, 36], [13, 37], [21, 36], [26, 37],
  ];
  for (const [a, b] of pairs) {
    if (!segmentBlocked(WAYPOINTS[a][0], WAYPOINTS[a][1], WAYPOINTS[b][0], WAYPOINTS[b][1])) link(a, b);
  }
  return EDGES;
}
export function nearestWaypoint(x, z) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < WAYPOINTS.length; i++) {
    const dx = WAYPOINTS[i][0] - x, dz = WAYPOINTS[i][1] - z;
    const d = dx * dx + dz * dz;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
// Breadth-first shortest path over the graph. Returns node indices incl. start+goal.
export function findPath(from, to) {
  if (from === to) return [from];
  const prev = new Array(WAYPOINTS.length).fill(-1);
  const queue = [from]; prev[from] = from;
  while (queue.length) {
    const cur = queue.shift();
    for (const [a, b] of EDGES) {
      const nxt = a === cur ? b : b === cur ? a : -1;
      if (nxt >= 0 && prev[nxt] === -1) {
        prev[nxt] = cur;
        if (nxt === to) {
          const path = [to]; let n = to;
          while (n !== from) { n = prev[n]; path.unshift(n); }
          return path;
        }
        queue.push(nxt);
      }
    }
  }
  return [from, to];
}

// --- collision + line of sight (pure math, no three.js objects) ---
export function pointBlocked(x, z, radius, height) {
  for (const c of COLLIDERS) {
    if (height > c.h) continue;
    if (Math.abs(x - c.x) < c.hx + radius && Math.abs(z - c.z) < c.hz + radius) return c;
  }
  return null;
}
// Move a circle (radius r) from (x,z) by (dx,dz), sliding along colliders.
export function moveCircle(x, z, dx, dz, r, height) {
  let nx = x + dx;
  if (!pointBlocked(nx, z, r, height)) x = nx;
  else {
    const c = pointBlocked(nx, z, r, height);
    if (c) x = c.x + (nx > c.x ? c.hx + r : -(c.hx + r));
    if (pointBlocked(x, z, r, height)) x -= dx;
  }
  let nz = z + dz;
  if (!pointBlocked(x, nz, r, height)) z = nz;
  else {
    const c = pointBlocked(x, nz, r, height);
    if (c) z = c.z + (nz > c.z ? c.hz + r : -(c.hz + r));
    if (pointBlocked(x, z, r, height)) z -= dz;
  }
  x = Math.max(MAP.minX + r, Math.min(MAP.maxX - r, x));
  z = Math.max(MAP.minZ + r, Math.min(MAP.maxZ - r, z));
  return [x, z];
}

function segmentHitsBox(x0, z0, x1, z1, c) {
  const dx = x1 - x0, dz = z1 - z0;
  let tmin = 0, tmax = 1;
  for (const [o, d, lo, hi] of [[x0, dx, c.x - c.hx, c.x + c.hx], [z0, dz, c.z - c.hz, c.z + c.hz]]) {
    if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return false; }
    else {
      let t1 = (lo - o) / d, t2 = (hi - o) / d;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) return false;
    }
  }
  return true;
}
export function segmentBlocked(x0, z0, x1, z1, eyeY = 1.5) {
  for (const c of COLLIDERS) {
    if (eyeY > c.h) continue;
    if (segmentHitsBox(x0, z0, x1, z1, c)) return true;
  }
  return false;
}
// 3D line of sight between two eye points. Smoke spheres block sight too.
export function hasLineOfSight(a, b, smokes = []) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.01) return true;
  const steps = Math.ceil(dist);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = a.x + dx * t, z = a.z + dz * t;
    const y = a.y + (b.y - a.y) * t;
    for (const c of COLLIDERS) {
      if (y > c.h) continue;
      if (Math.abs(x - c.x) < c.hx && Math.abs(z - c.z) < c.hz) return false;
    }
  }
  for (const s of smokes) {
    const cx = s.x - a.x, cy = s.y - a.y, cz = s.z - a.z;
    const len2 = dx * dx + (b.y - a.y) * (b.y - a.y) + dz * dz;
    let t = (cx * dx + cy * (b.y - a.y) + cz * dz) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = a.x + dx * t - s.x, py = a.y + (b.y - a.y) * t - s.y, pz = a.z + dz * t - s.z;
    if (px * px + py * py + pz * pz < s.r * s.r) return false;
  }
  return true;
}

// --- scene construction ---
const CONTAINER_COLORS = ['#8a3a28', '#2a6a7a', '#a87a1e', '#4a5a3a', '#7a2a4a'];
export function buildScene(scene) {
  buildColliders();
  buildGraph();
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(84, 66),
    new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.92, metalness: 0.08 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Water south of the dock, outside the walls.
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(90, 26),
    new THREE.MeshStandardMaterial({ map: waterTexture(), roughness: 0.25, metalness: 0.6 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -0.4, 42);
  scene.add(water);

  const wallMat = new THREE.MeshStandardMaterial({ map: wallTexture(), roughness: 0.85 });
  const crateMat = new THREE.MeshStandardMaterial({ map: crateTexture(), roughness: 0.85 });
  const metalMat = new THREE.MeshStandardMaterial({ map: metalTexture(), roughness: 0.5, metalness: 0.55 });
  const hazardMat = new THREE.MeshStandardMaterial({ map: hazardTexture(), roughness: 0.7 });
  const containerMats = CONTAINER_COLORS.map((col) => new THREE.MeshStandardMaterial({
    map: containerTexture(col), roughness: 0.8,
  }));
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  let ci = 0;
  for (const c of COLLIDERS) {
    let mat = wallMat;
    if (c.mat === 'crate') mat = crateMat;
    else if (c.mat === 'metal') mat = metalMat;
    else if (c.mat === 'hazard') mat = hazardMat;
    else if (c.mat === 'container') mat = containerMats[(ci++) % containerMats.length];
    const mesh = new THREE.Mesh(boxGeo, mat);
    mesh.scale.set(c.hx * 2, c.h, c.hz * 2);
    mesh.position.set(c.x, c.h / 2, c.z);
    mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh);
    if (c.h >= 4.5) {
      const cap = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0x232830, roughness: 1 }));
      cap.scale.set(c.hx * 2 + 0.15, 0.12, c.hz * 2 + 0.15);
      cap.position.set(c.x, c.h + 0.06, c.z);
      scene.add(cap);
    }
  }

  // Customs house roof slab (visual only; the walls are the colliders).
  const roof = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: 0.9 }));
  roof.scale.set(9.2, 0.25, 15.2);
  roof.position.set(2, 4.15, 0);
  roof.castShadow = true;
  scene.add(roof);

  // Gantry crane over Site B: beam + cab + hook (legs are colliders).
  const craneMat = new THREE.MeshStandardMaterial({ color: 0xb8860b, roughness: 0.6, metalness: 0.4 });
  const beam = new THREE.Mesh(boxGeo, craneMat);
  beam.scale.set(1.2, 1.2, 16);
  beam.position.set(17, 9.4, 17);
  beam.castShadow = true;
  scene.add(beam);
  const cab = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0x22262e, roughness: 0.5, metalness: 0.6 }));
  cab.scale.set(2.4, 1.8, 2.4);
  cab.position.set(17, 8.2, 17);
  scene.add(cab);
  const hook = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.6, 0.5), metalMat);
  hook.position.set(20, 7.2, 17);
  scene.add(hook);

  // Site markers: glowing A / B decals on the ground.
  for (const [site, letter, color] of [[SITE_A, 'A', '#2fd8c8'], [SITE_B, 'B', '#ff7a3d']]) {
    const decal = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 9),
      new THREE.MeshBasicMaterial({ map: siteTexture(letter, color), transparent: true, opacity: 0.85, depthWrite: false }),
    );
    decal.rotation.x = -Math.PI / 2;
    decal.position.set(site.x, 0.03, site.z);
    scene.add(decal);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(site.r - 0.25, site.r, 40),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.x, 0.04, site.z);
    scene.add(ring);
  }

  // Neon sign on the warehouse north wall.
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 2.5),
    new THREE.MeshBasicMaterial({ map: neonTexture('BLACKTIDE', '#2fd8c8'), transparent: true, depthWrite: false }),
  );
  sign.position.set(23, 3.4, -23.3);
  sign.rotation.y = 0;
  scene.add(sign);
  const signB = new THREE.Mesh(
    new THREE.PlaneGeometry(8, 2),
    new THREE.MeshBasicMaterial({ map: neonTexture('CRANE DOCK', '#ff7a3d'), transparent: true, depthWrite: false }),
  );
  signB.position.set(23, 3.2, 27.9);
  signB.rotation.y = Math.PI;
  scene.add(signB);

  // Control tower silhouette at the west corner + floodlight poles.
  const towerMat = new THREE.MeshStandardMaterial({ color: 0x3a3f4a, roughness: 0.9 });
  const tower = new THREE.Mesh(boxGeo, towerMat);
  tower.scale.set(4, 9, 4);
  tower.position.set(-33, 4.5, -25);
  tower.castShadow = true;
  scene.add(tower);
  const towerTop = new THREE.Mesh(boxGeo, metalMat);
  towerTop.scale.set(5, 0.8, 5);
  towerTop.position.set(-33, 9.2, -25);
  scene.add(towerTop);
  const towerGlass = new THREE.Mesh(
    boxGeo,
    new THREE.MeshStandardMaterial({ color: 0x9fd8ff, emissive: 0x2a6a8a, emissiveIntensity: 1.4, roughness: 0.2 }),
  );
  towerGlass.scale.set(4.2, 1.2, 4.2);
  towerGlass.position.set(-33, 8.2, -25);
  scene.add(towerGlass);

  // Distant stacks and a ship silhouette outside the walls, so the horizon
  // is a working port and not void.
  const duneMat = new THREE.MeshStandardMaterial({ color: 0x1c2733, roughness: 1 });
  const outside = [
    [-48, -32, 22, 8, 12], [48, 30, 20, 10, 14], [0, -46, 30, 7, 12],
    [-14, 46, 34, 9, 12], [50, -36, 16, 6, 12], [-50, 34, 18, 7, 10],
  ];
  for (const [x, z, w, h, d] of outside) {
    const m = new THREE.Mesh(boxGeo, duneMat);
    m.scale.set(w, h, d);
    m.position.set(x, h / 2 - 0.5, z);
    scene.add(m);
  }
  // A moored ship: hull + containers, far south-east beyond the water.
  const ship = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0x14202c, roughness: 0.9 }));
  ship.scale.set(34, 5, 8);
  ship.position.set(24, 2.1, 56);
  scene.add(ship);
  for (let i = 0; i < 5; i++) {
    const cont = new THREE.Mesh(boxGeo, containerMats[i % containerMats.length]);
    cont.scale.set(5, 2.4, 2.4);
    cont.position.set(12 + i * 6, 5.8, 56);
    scene.add(cont);
  }
}
