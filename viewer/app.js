import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const FLOOR_H = 6;
const KIND = {
  room: 0x3b5568, corridor: 0x2a3a46, hub: 0x5a7a8c, service: 0x6b5d8a,
  elevator: 0xb8c4cc, stairwell: 0x8a7a64,
};
const LAMP = 0xffb54a, OK = 0x4fd1a1, BAD = 0xff6b6b;
const $ = (id) => document.getElementById(id);

// ---------- scene ----------
const canvas = $("scene");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setClearColor(0x0b1116);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0b1116, 70, 160);
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.49;
scene.add(new THREE.HemisphereLight(0xbfd4e4, 0x0b1116, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(-20, 40, 25);
scene.add(sun);

const hotel = { nodes: {}, pos: {}, meshes: {}, floorGroups: {}, special: null };
const robot = new THREE.Group();
let robotMat, ring;
const flashes = [];

function labelSprite(text, size = 1) {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 64;
  const g = c.getContext("2d");
  g.font = "600 34px 'Avenir Next', 'Segoe UI', sans-serif";
  g.textAlign = "center"; g.textBaseline = "middle";
  g.strokeStyle = "rgba(11,17,22,.9)"; g.lineWidth = 8;
  g.strokeText(text, 128, 32);
  g.fillStyle = "#dbe4ea"; g.fillText(text, 128, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set(4 * size, 1 * size, 1);
  return s;
}

function buildHotel(data) {
  hotel.nodes = data.nodes;
  hotel.special = data.special;
  const xs = Object.values(data.nodes).map((n) => n.x), zs = Object.values(data.nodes).map((n) => n.z);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  const w = Math.max(...xs) - Math.min(...xs) + 8, d = Math.max(...zs) - Math.min(...zs) + 8;
  const floors = [...new Set(Object.values(data.nodes).map((n) => n.floor))].sort();
  for (const f of floors) {
    const g = new THREE.Group();
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w, 0.25, d),
      new THREE.MeshStandardMaterial({ color: 0x1a2a36, transparent: true, opacity: 0.28, roughness: 1 }));
    slab.position.set(cx, (f - 1) * FLOOR_H - 0.2, cz);
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(slab.geometry),
      new THREE.LineBasicMaterial({ color: 0x3a5668 }));
    edge.position.copy(slab.position);
    g.add(slab, edge);
    const tag = labelSprite("Floor " + f, 1.4);
    tag.position.set(cx - w / 2 + 3, (f - 1) * FLOOR_H + 0.8, cz + d / 2 - 0.5);
    g.add(tag);
    scene.add(g);
    hotel.floorGroups[f] = g;
  }
  for (const [name, n] of Object.entries(data.nodes)) {
    const y = (n.floor - 1) * FLOOR_H;
    hotel.pos[name] = new THREE.Vector3(n.x, y, n.z);
    const dims = {
      room: [2.4, 1.1, 2.4], corridor: [1.6, 0.12, 1.6], hub: [3.2, 0.9, 3.2],
      service: [2.6, 1.0, 2.6], elevator: [1.6, 1.2, 1.6], stairwell: [1.6, 1.0, 1.6],
    }[n.kind] || [2, 1, 2];
    const mat = new THREE.MeshStandardMaterial({ color: KIND[n.kind] ?? 0x3b5568, roughness: 0.7, emissive: 0x000000 });
    const m = new THREE.Mesh(new THREE.BoxGeometry(...dims), mat);
    m.position.set(n.x, y + dims[1] / 2, n.z);
    hotel.meshes[name] = m;
    hotel.floorGroups[n.floor].add(m);
    if (n.kind !== "corridor") {
      const label = n.kind === "room" ? name.replace(/^room-/, "") : name;
      const s = labelSprite(label, n.kind === "room" ? 0.62 : 0.8);
      s.position.set(n.x, y + dims[1] + 0.7, n.z);
      hotel.floorGroups[n.floor].add(s);
    }
  }
  const pts = [], stairPts = [];
  for (const e of data.edges) {
    const a = hotel.pos[e.a], b = hotel.pos[e.b];
    if (!a || !b) continue;
    (e.stairs ? stairPts : pts).push(a.x, a.y + 0.15, a.z, b.x, b.y + 0.15, b.z);
  }
  const line = (arr, color, opacity) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(arr, 3));
    return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
  };
  scene.add(line(pts, 0x8fb0c4, 0.7), line(stairPts, 0x8a7a64, 0.4));
  const el = Object.entries(data.nodes).filter(([, n]) => n.kind === "elevator").map(([k]) => hotel.pos[k]);
  if (el.length > 1) {
    const lo = Math.min(...el.map((p) => p.y)), hi = Math.max(...el.map((p) => p.y)) + 1.4;
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(1.9, hi - lo, 1.9),
      new THREE.MeshStandardMaterial({ color: 0xb8c4cc, transparent: true, opacity: 0.12, depthWrite: false }));
    shaft.position.set(el[0].x, (lo + hi) / 2, el[0].z);
    const shaftEdges = new THREE.LineSegments(new THREE.EdgesGeometry(shaft.geometry),
      new THREE.LineBasicMaterial({ color: 0xb8c4cc, transparent: true, opacity: 0.5 }));
    shaftEdges.position.copy(shaft.position);
    scene.add(shaft, shaftEdges);
  }
  robotMat = new THREE.MeshStandardMaterial({ color: LAMP, emissive: LAMP, emissiveIntensity: 1.4 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 0.9, 20), robotMat);
  body.position.y = 0.45;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.38, 16, 12), robotMat);
  head.position.y = 1.15;
  ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.05, 40),
    new THREE.MeshBasicMaterial({ color: LAMP, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05;
  const glow = new THREE.PointLight(LAMP, 14, 12, 1.6);
  glow.position.y = 1.6;
  robot.add(body, head, ring, glow);
  robot.scale.setScalar(1.7);
  scene.add(robot);
  robot.position.copy(hotel.pos[data.special?.dock] || new THREE.Vector3());
  frame(cx, cz, w, d, floors.length);
}

function frame(cx, cz, w, d, nf) {
  const mid = ((nf - 1) * FLOOR_H) / 2;
  controls.target.set(cx, mid, cz);
  const span = Math.max(w, d, nf * FLOOR_H);
  camera.position.set(cx - span * 0.6, mid + span * 1.0, cz + span * 1.2);
  controls.update();
}

function flash(name, color) {
  const p = hotel.pos[name];
  if (!hotel.meshes[name] || !p) return;
  const ringM = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.8, 40),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
  ringM.rotation.x = -Math.PI / 2;
  ringM.position.set(p.x, p.y + 0.1, p.z);
  scene.add(ringM);
  flashes.push({ name, color: new THREE.Color(color), ring: ringM, t: 0 });
}

function resize() {
  const r = canvas.getBoundingClientRect();
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / Math.max(r.height, 1);
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);

// ---------- run model ----------
const fresh = () => ({
  mode: "", seed: null, clock: 0, score: 0, battery: null, hands: [], cart: [], at: null,
  task: null, open: [], feed: [], ended: false, waypoints: [],
});
let model = fresh();

const short = (v) => (typeof v === "string" ? v : JSON.stringify(v));
function text(d) {
  if (d == null) return "";
  if (typeof d === "string") return d;
  const key = ["task", "summary", "text", "answer", "question", "reason", "message"].find((k) => d[k]);
  const first = key ? short(d[key]) : short(d);
  return first + (key === "task" && d.reason ? " (" + d.reason + ")" : "");
}
function pushFeed(kind, title, detail) {
  model.feed.unshift({ kind, title, detail });
  model.feed.length = Math.min(model.feed.length, 15);
}
function goTo(name, animate) {
  if (!name || !hotel.pos[name]) return;
  if (animate) model.waypoints.push(name);
  model.at = name;
}
function apply(line, animate) {
  switch (line.type) {
    case "start":
      model.mode = line.mode; model.seed = line.seed;
      pushFeed("", "Shift started", `${line.mode}, seed ${line.seed}`);
      break;
    case "call": {
      model.clock = line.clock ?? model.clock;
      const r = line.result || {};
      if (line.cmd === "navigate" && Array.isArray(r.path)) {
        const start = model.at;
        r.path.forEach((n, i) => { if (!(i === 0 && n === start)) goTo(n, animate); });
      } else if (r.at) goTo(r.at, animate);
      const args = Object.values(line.args || {}).map(short).join(" ");
      pushFeed(line.ok === false ? "bad" : "", line.cmd, args + (r.metres ? ` (${r.metres} m)` : ""));
      for (const ev of line.events || []) pushFeed("", "event", text(ev));
      break;
    }
    case "decision": {
      const d = line.data || {};
      const k = line.kind;
      if (k === "task_start") { model.task = text(d); model.open.push(text(d)); }
      if (k === "task_done" || k === "task_failed") {
        const t = d.task || model.task;
        model.open = model.open.filter((x) => x !== t);
        model.task = model.open[model.open.length - 1] || null;
        if (animate) flash(model.at, k === "task_done" ? OK : BAD);
      }
      const cls = k === "task_done" ? "ok" : k === "task_failed" ? "bad" : k === "brain" ? "win" : "";
      pushFeed(cls, k.replace("_", " "), text(d));
      break;
    }
    case "state": {
      const up = line.score > model.score;
      model.clock = line.clock ?? model.clock;
      model.battery = line.battery ?? model.battery;
      model.hands = line.hands || []; model.cart = line.cart || [];
      if (line.location && line.location !== model.at && !model.waypoints.length) goTo(line.location, animate);
      if (up) {
        if (animate) { flash(model.at, OK); bump(); }
        pushFeed("win", `Score +${line.score - model.score}`, `now ${line.score}`);
      }
      model.score = line.score ?? model.score;
      break;
    }
    case "end":
      model.ended = true; model.score = line.score ?? model.score;
      pushFeed("", "Shift over", `${line.score} points, ${line.requests_served ?? 0} served, ${line.reason ?? ""}`);
      break;
  }
}
function bump() {
  const el = document.querySelector(".score");
  el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump");
}

// ---------- panel ----------
const fmtClock = (s) => {
  s = Math.floor(s || 0);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(x).padStart(2, "0");
};
const items = (a) => (a.length ? a.map((x) => (typeof x === "string" ? x : x.item || x.name || short(x))).join(", ") : "empty");
function render() {
  $("score").textContent = model.score;
  $("clock").textContent = fmtClock(model.clock);
  const b = model.battery;
  $("bat").textContent = b == null ? "-" : Math.round(b) + "%";
  $("batfill").style.width = (b ?? 0) + "%";
  $("batfill").classList.toggle("low", b != null && b < 20);
  $("hands").textContent = items(model.hands);
  $("cart").textContent = items(model.cart);
  $("where").textContent = model.at || "-";
  $("task").textContent = model.task || (model.ended ? "Shift over" : "Waiting for the next task");
  $("queue").replaceChildren(...model.open.slice(0, -1).map((t) => Object.assign(document.createElement("li"), { textContent: t })));
  $("log").replaceChildren(...model.feed.map((f) => {
    const li = document.createElement("li");
    li.className = f.kind;
    const div = document.createElement("div");
    const t = document.createElement("b"); t.textContent = f.title;
    const sp = document.createElement("span"); sp.textContent = f.detail ? "  " + f.detail : "";
    div.append(t, sp); li.append(div);
    return li;
  }));
  $("pos").textContent = `${cursor}/${lines.length}`;
  $("scrub").max = lines.length; $("scrub").value = cursor;
  const live = runInfo?.live && !model.ended;
  const badge = $("badge");
  badge.textContent = live ? "live" : runInfo ? "replay" : "idle";
  badge.className = "badge" + (live ? " live" : "");
  $("liveBtn").classList.toggle("on", following);
  $("play").textContent = playing ? "Pause" : "Play";
}

// ---------- playback ----------
let lines = [], cursor = 0, playing = true, following = true, runInfo = null, shift = null, next = 0;
let dwell = 0, speed = 1;

function rebuild(n) {
  model = fresh();
  for (let i = 0; i < n; i++) apply(lines[i], false);
  cursor = n;
  const p = hotel.pos[model.at] || hotel.pos[hotel.special?.dock];
  if (p) robot.position.copy(p);
}

function tick(dt) {
  const k = speed * (following && lines.length - cursor > 25 ? 8 : 1);
  if (model.waypoints.length) {
    const target = hotel.pos[model.waypoints[0]];
    const dist = robot.position.distanceTo(target);
    const step = 9 * k * dt;
    if (dist <= step) { robot.position.copy(target); model.waypoints.shift(); }
    else robot.position.lerp(target, step / dist);
  } else if (playing && cursor < lines.length) {
    dwell -= dt * k;
    if (dwell <= 0) { apply(lines[cursor++], true); dwell = 0.35; }
  }
  for (let i = flashes.length - 1; i >= 0; i--) {
    const f = flashes[i];
    f.t += dt;
    const u = f.t / 1.6;
    hotel.meshes[f.name].material.emissive.copy(f.color).multiplyScalar(Math.max(0, 1 - u) * 0.9);
    f.ring.scale.setScalar(1 + u * 4);
    f.ring.material.opacity = Math.max(0, 0.9 * (1 - u));
    if (u >= 1) { scene.remove(f.ring); flashes.splice(i, 1); }
  }
  if (ring) { const s = 1 + 0.15 * Math.sin(performance.now() / 300); ring.scale.set(s, s, s); }
}

let last = performance.now(), frameCount = 0;
function loop(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  tick(dt);
  if ((frameCount++ & 3) === 0) render();
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

// ---------- data ----------
async function getJSON(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(url + " " + r.status);
  return r.json();
}
let manualPick = false;
async function pollRuns() {
  try {
    const runs = await getJSON("/api/runs");
    $("empty").hidden = runs.length > 0;
    const sel = $("runs");
    const sig = JSON.stringify(runs.map((r) => [r.shift, r.live]));
    if (sel.dataset.sig !== sig) {
      sel.dataset.sig = sig;
      sel.replaceChildren(...runs.map((r) => Object.assign(document.createElement("option"), {
        value: r.shift,
        textContent: `${r.shift.slice(3, 11)} · seed ${r.seed} · ${r.mode}${r.live ? " · live" : ""}`,
      })));
      if (shift) sel.value = shift;
    }
    const liveRun = runs.find((r) => r.live);
    const want = !manualPick && liveRun ? liveRun.shift : shift || runs[0]?.shift;
    if (want && want !== shift) select(want, runs.find((r) => r.shift === want));
    runInfo = runs.find((r) => r.shift === shift) || runInfo;
  } catch (e) { console.warn(e); }
}
async function pollRun() {
  if (!shift) return;
  try {
    const d = await getJSON(`/api/run/${shift}?from=${next}`);
    if (d.lines.length) { lines.push(...d.lines); next = d.next; }
  } catch (e) { console.warn(e); }
}
function select(id, info) {
  shift = id; runInfo = info; lines = []; next = 0; cursor = 0; following = true; playing = true;
  model = fresh();
  $("runs").value = id;
  const home = hotel.pos[hotel.special?.dock];
  if (home) robot.position.copy(home);
  pollRun();
}

// ---------- controls ----------
$("runs").addEventListener("change", (e) => { manualPick = true; select(e.target.value, null); });
$("play").addEventListener("click", () => {
  playing = !playing;
  if (playing && cursor >= lines.length && model.ended) { rebuild(0); following = false; }
  render();
});
$("speed").addEventListener("change", (e) => { speed = Number(e.target.value); });
$("scrub").addEventListener("input", (e) => { following = false; playing = false; rebuild(Number(e.target.value)); render(); });
$("liveBtn").addEventListener("click", () => { following = true; playing = true; render(); });
document.querySelectorAll(".floors button").forEach((b) => b.addEventListener("click", () => {
  const f = Number(b.dataset.floor);
  document.querySelectorAll(".floors button").forEach((x) => x.classList.toggle("on", x === b));
  for (const [k, g] of Object.entries(hotel.floorGroups)) g.visible = f === 0 || Number(k) === f;
}));

(async function init() {
  resize();
  try { buildHotel(await getJSON("/api/hotel")); } catch (e) { console.error(e); }
  requestAnimationFrame(loop);
  await pollRuns();
  setInterval(pollRuns, 1000);
  setInterval(pollRun, 1000);
  window.__viewer = { get model() { return model; }, get cursor() { return cursor; }, get lines() { return lines; } };
})();
