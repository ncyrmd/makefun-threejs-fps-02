// map.js — "Dusk Outpost": an original 64 x 48 m desert outpost at sunset.
// Attackers (Wardens) spawn west, defenders (Emberjacks) east. Site A north-east,
// Site B south-east, a mid lane between them. Every wall/crate is both a mesh and
// an axis-aligned collider used by movement, bullets and line-of-sight checks.
import * as THREE from 'three';
import { groundTexture, wallTexture, crateTexture, metalTexture, siteTexture } from './textures.js';

export const MAP = { minX: -32, maxX: 32, minZ: -24, maxZ: 24 };
export const SITE_A = { x: 21, z: -15, r: 5.5 };
export const SITE_B = { x: 21, z: 15, r: 5.5 };
export const SPAWNS = {
  attack: [
    [-28, -8], [-28, -2], [-28, 4], [-28, 10], [-26, 0],
  ],
  defend: [
    [27, -18], [27, -10], [27, 10], [27, 18], [24, 0],
  ],
};

// Collider: {x, z, hx, hz, h} — centre, half extents, height. h=0 means no vertical block.
export const COLLIDERS = [];
function box(x, z, hx, hz, h = 3.2) { COLLIDERS.push({ x, z, hx, hz, h }); return { x, z, hx, hz, h }; }

export function buildColliders() {
  COLLIDERS.length = 0;
  // Perimeter walls (with two gate gaps: west spawn and mid-east).
  box(0, -24.6, 33, 0.6, 5); box(0, 24.6, 33, 0.6, 5);
  box(-32.6, 0, 0.6, 25, 5); box(32.6, 0, 0.6, 25, 5);
  // Mid divider wall with a door gap at z in [-2, 2] and a window gap at z in [10, 14].
  box(2, -14, 1, 10, 4.2); box(2, 6, 1, 4, 4.2); box(2, 18, 1, 6, 4.2);
  // A-site structure: L-shaped walls around the north-east plant zone.
  box(16, -20, 6, 1, 3.6); box(26, -12, 1, 8, 3.6); box(14, -8, 1, 4, 3.6);
  // B-site structure: mirrored south-east.
  box(16, 20, 6, 1, 3.6); box(26, 12, 1, 8, 3.6); box(14, 8, 1, 4, 3.6);
  // Mid cover: crates and a container forming the mid lane.
  box(-6, -2, 2.2, 1.2, 1.4); box(-6, 4, 1.2, 1.2, 2.4); box(6, -4, 1.2, 1.2, 1.4);
  box(8, 8, 2.4, 1.2, 1.2); box(-12, 12, 2, 1, 1.4); box(-12, -12, 2, 1, 1.4);
  box(-18, 0, 1.2, 1.2, 2.6); box(12, -14, 1.6, 1.6, 1.3); box(12, 14, 1.6, 1.6, 1.3);
  // Long-lane pillars on the A and B approaches.
  box(-2, -18, 1, 1, 3.4); box(-2, 18, 1, 1, 3.4); box(-20, -18, 1.4, 1.4, 1.2);
  box(-20, 18, 1.4, 1.4, 1.2); box(20, -2, 1.2, 1.2, 1.2); box(20, 2, 1.2, 1.2, 1.2);
  // Spawn cover.
  box(-24, -14, 1.5, 1, 1.3); box(-24, 14, 1.5, 1, 1.3); box(24, -6, 1, 1.5, 1.3); box(24, 6, 1, 1.5, 1.3);
  return COLLIDERS;
}

// Waypoint graph for bot navigation. Nodes are open ground; edges link neighbours
// with a clear straight line (checked against colliders at build time).
export const WAYPOINTS = [
  [-28, 0], [-22, -6], [-22, 6], [-22, 0], [-16, -12], [-16, 12], [-16, 0],
  [-10, -16], [-10, 16], [-10, 0], [-4, -8], [-4, 8], [-4, 0],
  [2, -2], [2, 2], [2, -10], [2, 14], [6, -16], [6, 16], [6, 0],
  [10, -8], [10, 8], [12, 0], [16, -14], [16, 14], [16, -2], [16, 2],
  [21, -15], [21, 15], [24, -8], [24, 8], [27, 0], [28, -14], [28, 14],
];
export const EDGES = [];
function link(a, b) { EDGES.push([a, b]); }
export function buildGraph() {
  EDGES.length = 0;
  const pairs = [
    [0, 1], [0, 2], [0, 3], [1, 4], [2, 5], [3, 6], [4, 7], [5, 8], [6, 9], [6, 10],
    [7, 13], [8, 14], [9, 12], [10, 11], [11, 12], [12, 13], [12, 14], [13, 15], [14, 16],
    [15, 17], [16, 18], [17, 19], [18, 20], [19, 21], [20, 22], [21, 23], [22, 24],
    [23, 25], [24, 26], [25, 27], [26, 28], [27, 29], [28, 30], [29, 31], [30, 32],
    [17, 22], [18, 23], [15, 19], [16, 20], [13, 17], [14, 18], [10, 15], [11, 16],
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
// Move a circle (radius r) from (x,z) by (dx,dz), sliding along colliders. Returns new [x,z].
export function moveCircle(x, z, dx, dz, r, height) {
  let nx = x + dx;
  if (!pointBlocked(nx, z, r, height)) x = nx;
  else {
    // try sliding: nudge out along the axis of least penetration
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
  // 2D slab test on the expanded box.
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
  // Walk the segment in 1 m steps and test height against each collider.
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
    // segment-sphere test
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
export function buildScene(scene) {
  buildColliders();
  buildGraph();
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(70, 54),
    new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.95, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const wallMat = new THREE.MeshStandardMaterial({ map: wallTexture(), roughness: 0.9 });
  const crateMat = new THREE.MeshStandardMaterial({ map: crateTexture(), roughness: 0.85 });
  const metalMat = new THREE.MeshStandardMaterial({ map: metalTexture(), roughness: 0.55, metalness: 0.55 });
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  for (const c of COLLIDERS) {
    const h = c.h;
    const mat = h <= 1.4 ? crateMat : h <= 2.6 ? metalMat : wallMat;
    const mesh = new THREE.Mesh(boxGeo, mat);
    mesh.scale.set(c.hx * 2, h, c.hz * 2);
    mesh.position.set(c.x, h / 2, c.z);
    mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh);
    // flat cap so tall walls read as parapets from above
    if (h >= 3.2) {
      const cap = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0x3d342a, roughness: 1 }));
      cap.scale.set(c.hx * 2 + 0.15, 0.12, c.hz * 2 + 0.15);
      cap.position.set(c.x, h + 0.06, c.z);
      scene.add(cap);
    }
  }

  // Site markers: glowing A / B decals on the ground.
  for (const [site, letter, color] of [[SITE_A, 'A', '#ffb02a'], [SITE_B, 'B', '#ff5a2a']]) {
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

  // Watchtower + floodlight poles for silhouette interest.
  const towerMat = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.9 });
  const tower = new THREE.Mesh(new THREE.BoxGeometry(3, 7, 3), towerMat);
  tower.position.set(-30, 3.5, -22); tower.castShadow = true; scene.add(tower);
  const towerTop = new THREE.Mesh(new THREE.BoxGeometry(4, 0.6, 4), metalMat);
  towerTop.position.set(-30, 7.2, -22); scene.add(towerTop);

  // Distant dunes: big low boxes outside the walls so the horizon is not void.
  const duneMat = new THREE.MeshStandardMaterial({ color: 0x6b4e2e, roughness: 1 });
  const dunePositions = [[-46, -30, 26, 8, 14], [46, 28, 24, 10, 16], [0, -44, 30, 7, 12], [-10, 44, 34, 9, 12], [48, -34, 18, 6, 14]];
  for (const [x, z, w, h, d] of dunePositions) {
    const dune = new THREE.Mesh(boxGeo, duneMat);
    dune.scale.set(w, h, d); dune.position.set(x, h / 2 - 0.5, z);
    scene.add(dune);
  }
}
