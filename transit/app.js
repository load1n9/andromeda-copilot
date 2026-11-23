"use strict";
// Geometry: equirectangular projection around NJ, good to well under 1% here.
const KX = Math.cos(40.5 * Math.PI / 180) * 111320, KY = 110540;
const toXY = (lat, lon) => [lon * KX, lat * KY];

const MAX_OFF_TRACK = 900;   // m: straight station-to-station segments approximate curved track
const AMBIGUOUS_GAP = 250;   // m: lines this close to the best match are listed as alternatives
const MIN_MOVE = 40;         // m of along-track movement needed to infer direction
const $ = (id) => document.getElementById(id);

// ---- Build line geometry -------------------------------------------------
const LINES = window.LINES.map((l) => {
  const pts = l.stations.map((id) => toXY(window.STATIONS[id][1], window.STATIONS[id][2]));
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { ...l, pts, cum, names: l.stations.map((id) => window.STATIONS[id][0]) };
});
const lineById = (id) => LINES.find((l) => l.id === id);

// Project point p=[x,y] onto a line's polyline: distance off-track and distance along it.
function project(line, p) {
  let best = { d: Infinity, s: 0 };
  for (let i = 0; i < line.pts.length - 1; i++) {
    const [ax, ay] = line.pts[i], [bx, by] = line.pts[i + 1];
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    const t = Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / len2));
    const d = Math.hypot(p[0] - (ax + t * dx), p[1] - (ay + t * dy));
    if (d < best.d) best = { d, s: line.cum[i] + t * Math.sqrt(len2) };
  }
  return best;
}

// ---- State -----------------------------------------------------------------
const store = {
  get() { try { return JSON.parse(localStorage.getItem("nextstop") || "{}"); } catch { return {}; } },
  set(v) { try { localStorage.setItem("nextstop", JSON.stringify(v)); } catch { /* private mode */ } },
};
const saved = store.get();
const S = {
  fix: null,                 // latest {lat, lon, acc, speed, t}
  hist: [],                  // recent fixes
  source: "off",             // off | live | demo
  watchId: null,
  demoTimer: null,
  manualLine: saved.line || null,   // user override
  manualDir: saved.dir || 0,        // +1 outbound, -1 inbound, 0 = infer
  manualNext: Number.isInteger(saved.next) ? saved.next : null, // station index, used when no fix
  lastDir: 0,
  autoLine: null,
};
const persist = () => store.set({ line: S.manualLine, dir: S.manualDir, next: S.manualNext });

// ---- Core inference --------------------------------------------------------
function analyse() {
  const out = { line: null, candidates: [], dir: 0, nextIdx: null, dist: null, speed: null, s: null, off: null, nearest: null };
  const fix = S.fix;
  const pos = fix ? toXY(fix.lat, fix.lon) : null;
  const tol = fix ? Math.max(MAX_OFF_TRACK, (fix.acc || 0) * 1.5) : 0;

  // Which lines are we near?
  let proj = {};
  if (pos) {
    const ranked = LINES.map((l) => ({ l, ...project(l, pos) })).sort((a, b) => a.d - b.d);
    out.nearest = ranked[0];
    const near = ranked.filter((r) => r.d <= tol);
    if (near.length) {
      const bestD = near[0].d;
      out.candidates = near.filter((r) => r.d - bestD <= AMBIGUOUS_GAP).map((r) => r.l);
      // Hysteresis: keep the previous auto-line while it is still a plausible match.
      const keep = near.find((r) => r.l.id === S.autoLine && r.d - bestD <= AMBIGUOUS_GAP);
      S.autoLine = (keep || near[0]).l.id;
    } else {
      S.autoLine = null;
    }
    ranked.forEach((r) => (proj[r.l.id] = r));
  }

  const line = S.manualLine ? lineById(S.manualLine) : S.autoLine ? lineById(S.autoLine) : null;
  out.line = line;
  if (!line) return out;

  let manualOnly = !pos;
  if (pos) {
    const here = proj[line.id];
    out.s = here.s; out.off = here.d;

    // Speed: device-reported if available, else from recent history.
    let v = fix.speed;
    const old = S.hist.find((h) => fix.t - h.t >= 6000 && fix.t - h.t <= 40000);
    if (old) {
      const [ox, oy] = toXY(old.lat, old.lon);
      const moved = Math.hypot(pos[0] - ox, pos[1] - oy);
      if (v == null || Number.isNaN(v)) v = moved / ((fix.t - old.t) / 1000);
      const ds = here.s - project(line, [ox, oy]).s;
      if (Math.abs(ds) >= MIN_MOVE && moved >= MIN_MOVE) S.lastDir = ds > 0 ? 1 : -1;
    }
    out.speed = v;
  }
  out.dir = S.manualDir || S.lastDir;

  // Next stop.
  const EPS = 40;
  if (!manualOnly && out.dir) {
    const n = line.stations.length;
    if (out.dir > 0) { let i = line.cum.findIndex((c) => c > out.s + EPS); out.nextIdx = i < 0 ? n - 1 : i; }
    else { let i = -1; for (let k = n - 1; k >= 0; k--) if (line.cum[k] < out.s - EPS) { i = k; break; } out.nextIdx = i < 0 ? 0 : i; }
    out.dist = Math.abs(line.cum[out.nextIdx] - out.s);
  } else if (manualOnly && S.manualNext != null) {
    out.nextIdx = Math.min(S.manualNext, line.stations.length - 1);
  }
  return out;
}

// ---- Rendering ---------------------------------------------------------------
const fmtDist = (m) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1609.34).toFixed(1)} mi`);
const fmtSpeed = (v) => (v == null || Number.isNaN(v) ? "—" : `${Math.round(v * 2.23694)} mph`);
function fmtEta(dist, v) {
  if (dist == null || v == null || v < 2) return "—";
  const min = Math.round(dist / v / 60);
  return min < 1 ? "< 1 min" : `${min} min`;
}

function setGps(kind, text) {
  $("gps-dot").className = "dot " + kind;
  $("gps-text").textContent = text;
}

function render() {
  const a = analyse();
  const { line } = a;
  document.documentElement.style.setProperty("--line", line ? line.color : "var(--border)");
  const hero = $("hero");
  hero.style.setProperty("--line", line ? line.color : "var(--border)");
  $("badge").textContent = line ? line.name : "No line";
  $("badge").style.setProperty("--line", line ? line.color : "var(--surface-active)");

  const msg = $("msg"); msg.className = "msg"; msg.textContent = "";
  const dirLabel = a.dir && line ? "toward " + line.names[a.dir > 0 ? line.names.length - 1 : 0] : "";
  $("dir").textContent = dirLabel;
  $("speed").textContent = fmtSpeed(a.speed);
  $("dist").textContent = a.dist != null ? fmtDist(a.dist) : "—";
  $("eta").textContent = fmtEta(a.dist, a.speed);

  if (!line) {
    $("next-label").textContent = "Next stop";
    if (S.fix && a.nearest) {
      $("next").textContent = "Not on a rail line";
      msg.className = "msg warn";
      msg.textContent = `Nearest line: ${a.nearest.l.name}, ${fmtDist(a.nearest.d)} away. Pick a line below to set it manually.`;
    } else {
      $("next").textContent = S.source === "off" ? "Tap “Use my location”" : "Finding you…";
      msg.textContent = "Or choose your line, direction and next stop under Configure.";
    }
  } else if (a.nextIdx == null) {
    $("next-label").textContent = "Next stop";
    $("next").textContent = "Which way are you heading?";
    msg.textContent = S.fix ? "Keep moving for a few seconds, or pick a direction under Configure." : "Pick a direction and next stop under Configure.";
  } else {
    const terminus = (a.dir > 0 && a.nextIdx === line.names.length - 1) || (a.dir < 0 && a.nextIdx === 0);
    $("next-label").textContent = terminus ? "Final stop" : "Next stop";
    $("next").textContent = line.names[a.nextIdx];
    if (S.manualLine || S.manualDir) msg.textContent = "Manual settings active.";
    if (a.off > 500) { msg.className = "msg warn"; msg.textContent = `You're ${fmtDist(a.off)} from this line's track.`; }
  }

  // Alternatives when several lines share the track you're on.
  const chips = $("chips"); chips.textContent = "";
  if (a.candidates.length > 1 && !S.manualLine) {
    const hint = document.createElement("span"); hint.className = "msg"; hint.style.margin = "0"; hint.textContent = "Shared track — which train?";
    chips.append(hint);
    a.candidates.forEach((l) => {
      const b = document.createElement("button"); b.className = "chip"; b.textContent = l.name;
      b.setAttribute("aria-pressed", String(l.id === (line && line.id)));
      b.style.setProperty("--line", l.color);
      b.onclick = () => { S.manualLine = l.id; S.manualDir = 0; persist(); render(); };
      chips.append(b);
    });
  }

  renderControls(line, a);
  renderStops(line, a);
  renderMap(line, a);
}

function renderControls(line, a) {
  const ls = $("line-sel");
  if (!ls.options.length) {
    ls.append(new Option("Auto-detect", ""));
    LINES.forEach((l) => ls.append(new Option(l.name, l.id)));
    ls.onchange = () => { S.manualLine = ls.value || null; S.manualDir = 0; S.manualNext = null; persist(); render(); };
  }
  ls.value = S.manualLine || "";

  const db = $("dir-btns"); db.textContent = "";
  if (line) {
    [[-1, `→ ${line.names[0]}`], [1, `→ ${line.names[line.names.length - 1]}`]].forEach(([d, label]) => {
      const b = document.createElement("button"); b.textContent = label;
      b.className = a.dir === d ? "on" : ""; b.style.setProperty("--line", line.color);
      b.onclick = () => { S.manualDir = S.manualDir === d ? 0 : d; persist(); render(); };
      db.append(b);
    });
  } else db.textContent = "Select a line first";

  const ns = $("next-sel"); ns.textContent = "";
  if (line) {
    line.names.forEach((n, i) => ns.append(new Option(n, i)));
    ns.value = a.nextIdx != null ? a.nextIdx : 0;
    ns.disabled = false;
    ns.onchange = () => { S.manualNext = +ns.value; if (!S.manualDir) S.manualDir = 1; persist(); render(); };
  } else { ns.append(new Option("—", "")); ns.disabled = true; }
  $("advance").disabled = !line;
}

function renderStops(line, a) {
  const ol = $("stops"); ol.textContent = "";
  $("stops-title").textContent = line ? `Stops · ${line.name}` : "Stops";
  if (!line) return;
  ol.style.setProperty("--line", line.color);
  // Show in direction of travel (outbound by default).
  const order = line.names.map((_, i) => i);
  if (a.dir < 0) order.reverse();
  order.forEach((i) => {
    const li = document.createElement("li");
    li.textContent = line.names[i];
    const passed = a.nextIdx != null && (a.dir >= 0 ? i < a.nextIdx : i > a.nextIdx);
    if (passed) li.className = "past";
    if (i === a.nextIdx) {
      li.className = "next-stop";
      if (a.dist != null) { const sm = document.createElement("small"); sm.textContent = fmtDist(a.dist); li.append(sm); }
    }
    li.onclick = () => { S.manualNext = i; if (!S.manualDir) S.manualDir = a.dir || 1; persist(); render(); };
    ol.append(li);
  });
  const nx = ol.querySelector(".next-stop"); // keep upcoming stop in view inside the list
  if (nx && ol.children.length > 8) nx.scrollIntoView({ block: "nearest" });
}

function renderMap(line, a) {
  const svg = $("map"); svg.textContent = "";
  const NS = "http://www.w3.org/2000/svg";
  if (!line) { $("map-card").classList.add("hidden"); return; }
  $("map-card").classList.remove("hidden");
  const pts = line.pts.slice(), me = S.fix ? toXY(S.fix.lat, S.fix.lon) : null;
  const all = me ? pts.concat([me]) : pts;
  const xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const W = 600, H = 200, pad = 16;
  const sc = Math.min((W - 2 * pad) / Math.max(x1 - x0, 1), (H - 2 * pad) / Math.max(y1 - y0, 1));
  const ox = (W - sc * (x1 - x0)) / 2, oy = (H - sc * (y1 - y0)) / 2;
  const P = ([x, y]) => [ox + (x - x0) * sc, H - (oy + (y - y0) * sc)];
  const col = getComputedStyle(document.documentElement).getPropertyValue(line.color.slice(4, -1)).trim();
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const el = (n, attrs) => { const e = document.createElementNS(NS, n); for (const k in attrs) e.setAttribute(k, attrs[k]); svg.append(e); return e; };
  el("polyline", { points: pts.map((p) => P(p).join(",")).join(" "), fill: "none", stroke: col, "stroke-width": 3, "stroke-linejoin": "round" });
  pts.forEach((p, i) => {
    const [x, y] = P(p);
    el("circle", { cx: x, cy: y, r: i === a.nextIdx ? 6 : 3, fill: i === a.nextIdx ? "#e6e6e6" : "#040505", stroke: col, "stroke-width": 2 });
  });
  if (me) {
    const [x, y] = P(me);
    el("circle", { cx: x, cy: y, r: 12, fill: "#4aa5f0", opacity: .25 });
    el("circle", { cx: x, cy: y, r: 5, fill: "#4aa5f0", stroke: "#e6e6e6", "stroke-width": 2 });
  }
}

// ---- Location sources ---------------------------------------------------------
function onFix(f) {
  S.fix = f;
  S.hist.push(f);
  S.hist = S.hist.filter((h) => f.t - h.t < 60000);
  render();
}

function stopSources() {
  if (S.watchId != null) navigator.geolocation.clearWatch(S.watchId);
  if (S.demoTimer) clearInterval(S.demoTimer);
  S.watchId = S.demoTimer = null;
}

function startLive() {
  stopSources();
  S.hist = []; S.fix = null; S.lastDir = 0;
  if (!navigator.geolocation) { setGps("bad", "No geolocation"); S.source = "off"; render(); return; }
  S.source = "live"; setGps("", "Locating…"); render();
  S.watchId = navigator.geolocation.watchPosition(
    (p) => {
      setGps("live", `GPS ±${Math.round(p.coords.accuracy)} m`);
      onFix({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy, speed: p.coords.speed, t: p.timestamp || Date.now() });
    },
    (e) => {
      S.source = "off";
      setGps("bad", e.code === 1 ? "Location denied" : "Location unavailable");
      $("next").textContent = e.code === 1 ? "Location permission denied" : "Can't get a location fix";
      $("msg").textContent = "Pick your line, direction and next stop under Configure instead.";
    },
    { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 },
  );
}

// Demo: glide along the selected line (default: Northeast Corridor) at ~60 mph, speeded up.
function startDemo() {
  stopSources();
  S.hist = []; S.fix = null; S.lastDir = 0; S.source = "demo";
  const line = (S.manualLine && lineById(S.manualLine)) || LINES[0];
  const dir = S.manualDir || 1;
  const total = line.cum[line.cum.length - 1];
  let s = dir > 0 ? 0 : total, t = Date.now();
  const speed = 27; // m/s
  const SIM = 8;    // simulation speed-up
  setGps("demo", "Demo ride");
  S.demoTimer = setInterval(() => {
    t += 1000 * SIM; s += dir * speed * SIM;
    if (s < 0 || s > total) { stopSources(); S.source = "off"; setGps("", "Demo finished"); return; }
    let i = line.cum.findIndex((c) => c >= s); if (i <= 0) i = 1;
    const f = (s - line.cum[i - 1]) / (line.cum[i] - line.cum[i - 1]);
    const x = line.pts[i - 1][0] + f * (line.pts[i][0] - line.pts[i - 1][0]);
    const y = line.pts[i - 1][1] + f * (line.pts[i][1] - line.pts[i - 1][1]);
    // add a little GPS jitter (~20 m) so the demo exercises the real logic
    onFix({ lat: (y + (Math.random() - .5) * 40) / KY, lon: (x + (Math.random() - .5) * 40) / KX, acc: 15, speed: null, t });
  }, 1000);
}

// ---- Wire up -------------------------------------------------------------------
$("locate").onclick = startLive;
$("demo").onclick = startDemo;
$("auto").onclick = () => { S.manualLine = null; S.manualDir = 0; S.manualNext = null; persist(); render(); };
$("advance").onclick = () => {
  const a = analyse(); if (!a.line) return;
  const dir = a.dir || 1, n = a.line.names.length;
  S.manualDir = dir;
  S.manualNext = Math.max(0, Math.min(n - 1, (a.nextIdx == null ? (dir > 0 ? -1 : n) : a.nextIdx) + dir));
  persist(); render();
};

render();
// Offer one-tap location if permission was already granted.
if (navigator.permissions) navigator.permissions.query({ name: "geolocation" }).then((r) => { if (r.state === "granted") startLive(); }).catch(() => {});
