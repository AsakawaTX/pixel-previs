/* 像素预演引擎：镜头描述（JSON）→ 每一帧要画什么。纯计算，不依赖浏览器。
   画面里的东西是固定的像素小图，只画一次；镜头只移动、缩放、旋转它们。
   单位：距离米，角度度，焦距 mm（35mm 等效）。坐标：x 向右，y 向上，z 向前（默认镜头朝 +z）。 */
'use strict';
const PEOPLE = { 1: { R: '#3e6db5', B: '#33394a' }, 2: { R: '#b0613f', B: '#4a3b33' }, 3: { R: '#5f8a5a', B: '#3a3f35' }, 4: { R: '#8a5f9e', B: '#35323f' } };
const D2R = Math.PI / 180, L = (a, b, k) => a + (b - a) * k, CL = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const EASE = { io: k => k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2, lin: k => k, out: k => 1 - Math.pow(1 - k, 3), in: k => k * k * k };
const HS = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

/* ---------- 像素小图（见 sprites.js） ---------- */
const { PAL, POSES, PROPS, HELD, MISC, person, UNIT } = require('./sprites');

/* ---------- 默认场景 ---------- */
const WORLD = [];
for (let i = 0; i < 72; i++) { const x = L(-16, 16, HS(i * 3.1 + 1)), z = L(-22, 42, HS(i * 5.7 + 2)); if (!(Math.abs(x) < 2.4 && z < 13)) WORLD.push({ s: 'box', x, z, h: L(0.5, 1.3, HS(i * 9.3)) }); }
[[-9, 30], [11, 36], [-17, 46], [5, 52]].forEach(([x, z], i) => WORLD.push({ s: 'pillar', x, z, h: 4 + i }));
for (let i = 0; i < 100; i++) WORLD.push({ s: 'mark', x: L(-16, 16, HS(i * 7.7 + 9)), z: L(-20, 40, HS(i * 2.9 + 4)), h: 0.06 });

/* ---------- 关键帧插值 ---------- */
// list：关键帧数组，每个可带 t（秒）；没写 t 的平均分布在 win 时间段内。缺的字段沿用上一帧。
function keys(list, u, win, ez) {
  if (!Array.isArray(list)) list = [list || {}];
  const n = list.length, ts = list.map((k, i) => k.t != null ? k.t : n === 1 ? 0 : L(win[0], win[1], i / (n - 1)));
  const full = []; let prev = {};
  list.forEach(k => { prev = Object.assign({}, prev, k); full.push(prev); });
  if (n === 1 || u <= ts[0]) return full[0];
  if (u >= ts[n - 1]) return full[n - 1];
  let i = 0; while (u > ts[i + 1]) i++;
  const k = (EASE[full[i + 1].e] || ez)((u - ts[i]) / (ts[i + 1] - ts[i] || 1)), a = full[i], b = full[i + 1], out = {};
  for (const key of new Set(Object.keys(a).concat(Object.keys(b)))) {
    const va = key in a ? a[key] : b[key], vb = key in b ? b[key] : va;
    out[key] = typeof va === 'number' ? L(va, vb, k) : Array.isArray(va) ? va.map((v, j) => L(v, vb[j], k)) : vb;
  }
  return out;
}

const DEF = { x: 0, y: 1.5, z: 0, yaw: 0, pitch: 0, roll: 0, mm: 24 };
function people(S, u, win, ez) {
  return (S.p || [{}]).map((q, idx) => {
    const pts = [[q.x || 0, q.z == null ? 9 : q.z]].concat(q.path || (q.to ? [q.to] : []));
    const tw = q.t || win, k = pts.length > 1 ? (EASE[q.e] || EASE.lin)(CL((u - tw[0]) / (tw[1] - tw[0]))) * (pts.length - 1) : 0;
    const i = Math.min(pts.length - 2, Math.floor(k)), f = k - Math.max(0, i), a = pts[Math.max(0, i)], b = pts[Math.max(0, i) + 1] || a;
    const moving = pts.length > 1 && u > tw[0] && u < tw[1];
    const h = q.h != null && pts.length < 2 ? q.h * D2R : pts.length > 1 ? Math.atan2(b[0] - a[0], -(b[1] - a[1])) : 0;
    const col = PEOPLE[q.v || 1] || PEOPLE[1];
    let act = moving ? (q.run ? 'run' : 'walk') : 'stand', ak = 0;
    // 动作：act 写一个名字＝整个镜头都做；写数组 [{a:'sit',t:[1,3]}] ＝按时间段做。倒地之后保持躺着。
    for (const A of typeof q.act === 'string' ? [{ a: q.act }] : q.act || []) {
      const tt = A.t || [A.a === 'fall' ? tw[0] : 0, 1e9];
      if (u < tt[0]) continue;
      if (u <= tt[1]) { act = A.a; ak = A.a === 'fall' ? CL((u - tt[0]) / 0.6) : A.a === 'jump' ? (A.t ? CL((u - tt[0]) / (tt[1] - tt[0])) : (u - tt[0]) % 1) : 0; }
      else if (A.a === 'fall' || A.a === 'lie') { act = 'lie'; }
    }
    return { x: L(a[0], b[0], f), z: L(a[1], b[1], f), h, walk: moving, run: !!q.run, act, ak, hold: q.hold, pal: { R: q.color || col.R, B: q.pants || col.B }, ht: q.height || 1.75 };
  });
}
function camera(S, u, win, ez) {
  let cam;
  if (S.path === 'fpv') {
    const p = ez(CL((u - win[0]) / (win[1] - win[0]))), z = -3 + 27 * p, r0 = CL((p - 0.62) / 0.38), r = r0 * r0 * (3 - 2 * r0), yaw = Math.atan(0.48 * Math.cos(z * 0.2)) * (1 - r);
    cam = { x: 2.4 * Math.sin(z * 0.2), y: 0.7 + r * 4.5, z, yaw: yaw / D2R, pitch: (-0.03 - r * 0.22) / D2R, roll: -yaw * 0.5 / D2R, mm: 21.6 };
  } else cam = Object.assign({}, DEF, keys(S.c, u, win, ez));
  let at = cam.at || S.at && (Array.isArray(S.at[0]) ? S.at[0].map((v, i) => L(v, S.at[1][i], ez(CL((u - win[0]) / (win[1] - win[0]))))) : S.at);
  if (S.follow) { // 跟随：相机 = 人物位置 + 偏移，并看向人物
    const fo = S.follow, P = people(S, u, win, ez)[fo.who || 0], k = ez(CL((u - win[0]) / (win[1] - win[0])));
    const off = Array.isArray(fo.off[0]) ? fo.off[0].map((v, i) => L(v, fo.off[1][i], k)) : fo.off;
    cam.x = P.x + off[0]; cam.y = off[1]; cam.z = P.z + off[2];
    if (fo.look !== false) { const lk = fo.look || [0, 1.2, 0]; at = [P.x + lk[0], lk[1], P.z + lk[2]]; }
  }
  if (S.o) { // 环绕 [起始半径, 结束半径, 起始角, 结束角]，绕第一个人
    const P0 = people(S, 0, win, ez)[0], p = ez(CL((u - win[0]) / (win[1] - win[0]))), r = L(S.o[0], S.o[1], p), a = L(S.o[2], S.o[3], p) * D2R;
    cam.x = P0.x - r * Math.sin(a); cam.z = P0.z - r * Math.cos(a); at = at || [P0.x, 1.2, P0.z];
  }
  const c = { x: cam.x, y: cam.y, z: cam.z, yaw: cam.yaw * D2R, pitch: cam.pitch * D2R, roll: cam.roll * D2R, f: cam.mm / 36 };
  if (at) { const dx = at[0] - c.x, dy = at[1] - c.y, dz = at[2] - c.z; c.yaw = Math.atan2(dx, dz); c.pitch = Math.atan2(dy, Math.hypot(dx, dz)); }
  const n = (a, b, d) => Math.sin(u * a) * 0.6 + Math.sin(u * b + 1.3) * 0.3 + Math.sin(u * d + 2.1) * 0.1;
  const fx = [].concat(S.fx || []);
  if (fx.includes('hand')) { const A = S.hand || 1; c.x += n(1.7, 4.3, 9.1) * 0.08 * A; c.y += Math.abs(Math.sin(u * 5)) * 0.04 * A; c.yaw += n(2.3, 5.1, 11.7) * 0.02 * A; c.pitch += n(1.9, 6.3, 13.1) * 0.015 * A; c.roll += n(1.3, 3.7, 8.9) * 0.02 * A; }
  if (fx.includes('shake')) { const t0 = S.shakeAt != null ? S.shakeAt : 1.8; if (u > t0) { const d = Math.exp(-(u - t0) * 3.5) * 0.06 * (S.shakeAmp || 1); c.yaw += Math.sin(u * 61) * d; c.pitch += Math.cos(u * 53) * d; c.roll += Math.sin(u * 47) * d * 0.5; } }
  if (fx.includes('pov')) { c.y += Math.abs(Math.sin(u * 4.2)) * 0.05; c.roll += Math.sin(u * 2.1) * 0.01; }
  return c;
}
// 自动清场：把挡在镜头和人物之间、或挡住镜头路线的默认方块移走
const keepCache = new WeakMap();
function keep(S, win, ez, dur) {
  if (keepCache.has(S)) return keepCache.get(S);
  const ts = Array.from({ length: 13 }, (_, i) => dur * i / 12), cams = ts.map(u => camera(S, u, win, ez)), ps = [].concat(...ts.filter((_, i) => i % 3 === 0).map(u => people(S, u, win, ez)));
  const dseg = (o, a, b) => { const vx = b.x - a.x, vz = b.z - a.z, l = vx * vx + vz * vz, t = l ? CL(((o.x - a.x) * vx + (o.z - a.z) * vz) / l) : 0; return Math.hypot(o.x - a.x - vx * t, o.z - a.z - vz * t); };
  const set = WORLD.filter(o => o.s === 'mark' || cams.every((c, i) => ps.every(q => dseg(o, c, q) > 1.3) && (!i || dseg(o, cams[i - 1], c) > 1.1)));
  keepCache.set(S, set); return set;
}

/* ---------- 一帧 ---------- */
// 返回：horizon（未旋转时地平线的 y）、roll、grid 线段、items（按远到近排好，带像素小图名和屏幕矩形）、over（屏幕叠加层）、mb（动态模糊 [x,y] 像素）
function frame(S0, u, W, H) {
  const dur0 = S0.dur || 6; let S = S0, lu = u;
  if (S0.cuts) { const n = S0.cuts.length, i = Math.min(n - 1, Math.floor(u / dur0 * n)); S0._sub = S0._sub || S0.cuts.map(c => Object.assign({}, S0, { cuts: null, dur: dur0 / n }, c)); S = S0._sub[i]; lu = u - i * dur0 / n; }
  const dur = S.dur || 6, win = S.t || (S0.cuts ? [0, dur] : [dur / 12, dur * 0.75]), ez = EASE[S.e || 'io'];
  const c = camera(S, lu, win, ez), f = c.f * W, cx = W / 2, cy = H / 2;
  const cyw = Math.cos(c.yaw), syw = Math.sin(c.yaw), cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
  const toC = (x, y, z) => { const dx = x - c.x, dz = z - c.z, xc = dx * cyw - dz * syw, z0 = dx * syw + dz * cyw, dy = y - c.y; return [xc, dy * cp - z0 * sp, dy * sp + z0 * cp]; };
  const scr = (x, y, z) => { const q = toC(x, y, z); return [cx + f * q[0] / q[2], cy - f * q[1] / q[2], q[2]]; };
  const objs = (S.w === 0 ? [] : keep(S, win, ez, dur)).concat(S.add || []);
  const top = S.top || c.pitch < -80 * D2R;
  people(S, lu, win, ez).forEach(q => {
    const F = [Math.sin(q.h), -Math.cos(q.h)], V = [c.x - q.x, c.z - q.z], rel = Math.atan2(F[0] * V[1] - F[1] * V[0], F[0] * V[0] + F[1] * V[1]);
    const face = Math.abs(rel) < Math.PI / 4 ? 'front' : Math.abs(rel) > Math.PI * 3 / 4 ? 'back' : 'side';
    objs.push({ s: 'person', face, act: q.act, ak: q.ak, hold: q.hold, x: q.x, z: q.z, h: q.ht, flip: F[0] * cyw - F[1] * syw < 0, hd: q.h, person: 1, pal: q.pal });
  });
  const fd = S.focus ? L(S.focus[0], S.focus[1], ez(CL((lu - win[0]) / (win[1] - win[0])))) : 0;
  const items = [];
  const blurAt = z => fd ? Math.min(W / 80, W * 0.016 * Math.abs(1 / z - 1 / fd)) : 0;
  objs.forEach(o => {
    let s = o.s || 'box'; const P = PROPS[s];
    if (P && P.views) { const hd = (o.h2 != null ? o.h2 : o.dir || 0) * D2R, F = [Math.sin(hd), -Math.cos(hd)], V = [c.x - o.x, c.z - o.z], rel = Math.abs(Math.atan2(F[0] * V[1] - F[1] * V[0], F[0] * V[0] + F[1] * V[1])); s = P.views[rel < Math.PI / 4 ? 'front' : rel > Math.PI * 3 / 4 ? 'back' : 'side']; o = Object.assign({}, o, { flip: rel >= Math.PI / 4 && rel <= Math.PI * 3 / 4 && F[0] * cyw - F[1] * syw < 0 }); }
    const def = o.person ? null : PROPS[s] || PROPS.box, h = o.h || (o.person ? 1.75 : def.h);
    if (top) {
      const rows0 = o.person ? MISC.ptop : def.rows, w = o.person ? 0.62 * h / 1.75 : o.wd || def.wd || rows0[0].length / rows0.length * h, a = scr(o.x, h, o.z); if (a[2] < 0.1) return;
      const sprite = o.person ? MISC.ptop : s === 'mark' ? def.rows : MISC.btop, hd = o.person ? o.hd || 0 : (o.dir || 0) * D2R + Math.PI / 2, b = scr(o.x + Math.cos(hd), h, o.z + Math.sin(hd)), sw = f * w / a[2], sh = o.person ? sw * 0.6 : f * (o.dp || Math.min(w, 1)) / a[2];
      items.push({ rows: sprite, x: a[0] - sw / 2, y: a[1] - sh / 2, w: sw, h: sh, z: a[2], rot: Math.atan2(b[1] - a[1], b[0] - a[0]), pal: o.pal });
      return;
    }
    if (o.person) { // 人物：按姿势取小图，可旋转（倒地、躺）、可跳起、可拿东西
      const pose = POSES[o.act] || POSES.stand, lyingish = o.act === 'lie' || o.act === 'fall', face = lyingish ? 'side' : o.face;
      let arm = pose.arm || null; if (Array.isArray(arm)) arm = arm[Math.floor(lu * (o.act === 'wave' ? 3 : 5)) % 2];
      let legs = pose.legs || 'stand'; if (legs === 'walk') legs = (o.act === 'jump' ? true : Math.floor(lu * (o.act === 'run' ? 8 : 4)) % 2) ? 'walk' : 'stand';
      const spr = person(face, arm, legs), jumpY = o.act === 'jump' ? 0.5 * Math.sin(Math.PI * o.ak) : 0;
      const q = toC(o.x, jumpY, o.z); if (q[2] < 0.1) return;
      const sc = f * h / q[2] / UNIT, rows = spr.rows, w = rows[0].length * sc, hh = rows.length * sc, fx = cx + f * q[0] / q[2], fy = cy - f * q[1] / q[2];
      const flip = face === 'side' && o.flip, ang = o.act === 'lie' ? 90 : o.act === 'fall' ? 90 * EASE.in(o.ak) : 0, th = (flip ? 1 : -1) * ang * D2R;
      const mx = fx + hh / 2 * Math.sin(th), my = fy - hh / 2 * Math.cos(th) - 3 * sc * Math.abs(Math.sin(th));
      if (mx + w < -W * 0.5 || mx - w > W * 1.5) return;
      const it = { rows, x: mx - w / 2, y: my - hh / 2, w, h: hh, z: q[2], flip, pal: o.pal, rot: th, blur: blurAt(q[2]), shadow: !ang };
      items.push(it);
      const Hd = HELD[o.hold];
      if (Hd) { // 手持物：手的位置随人物一起旋转
        let lx = (spr.hand[0] - rows[0].length / 2) * sc, ly = (spr.hand[1] - rows.length / 2) * sc; if (flip) lx = -lx;
        const hx = mx + lx * Math.cos(th) - ly * Math.sin(th), hy = my + lx * Math.sin(th) + ly * Math.cos(th), hs = f * Hd.h / q[2], hw = hs * Hd.rows[0].length / Hd.rows.length;
        const gx = (Hd.grip[0] - 0.5) * hw * (flip ? -1 : 1), gy = (Hd.grip[1] - 0.5) * hs;
        items.push({ rows: Hd.rows, x: hx - gx * Math.cos(th) + gy * Math.sin(th) - hw / 2, y: hy - gx * Math.sin(th) - gy * Math.cos(th) - hs / 2, w: hw, h: hs, z: q[2] + (o.face === 'back' ? 0.01 : -0.01), flip, rot: th, blur: it.blur });
      }
      return;
    }
    const q = toC(o.x, o.y || 0, o.z); if (q[2] < 0.1) return;
    let rows = def.rows;
    if (def.tile && o.wd) { const n = Math.max(1, Math.round(o.wd / (h * (rows[0].length - 2) / rows.length))); rows = rows.map(r => r[0] + r.slice(1, -1).repeat(n) + r.slice(-1)); } // 墙按宽度重复纹样，不拉伸描边
    const sc = f * h / q[2] / rows.length, w = o.wd ? f * o.wd / q[2] : (def.wd ? f * def.wd / q[2] : rows[0].length * sc), hh = rows.length * sc, bx = cx + f * q[0] / q[2], by = cy - f * q[1] / q[2];
    if (bx + w < -W * 0.5 || bx - w > W * 1.5) return;
    items.push({ rows, x: bx - w / 2, y: by - hh, w, h: hh, z: q[2], flip: o.flip, pal: o.pal, blur: blurAt(q[2]), shadow: !o.y && !['mark', 'pillar', 'wall', 'door', 'lamp'].includes(s) });
  });
  items.sort((a, b) => b.z - a.z);
  const grid = [], N = 0.15, seg = (x0, z0, x1, z1) => {
    let A = toC(x0, 0, z0), B = toC(x1, 0, z1); if (A[2] < N && B[2] < N) return;
    if (A[2] < N || B[2] < N) { const k = (N - A[2]) / (B[2] - A[2]), P = A.map((v, i) => v + (B[i] - v) * k); if (A[2] < N) A = P; else B = P; }
    grid.push([cx + f * A[0] / A[2], cy - f * A[1] / A[2], cx + f * B[0] / B[2], cy - f * B[1] / B[2]]);
  };
  if (S.grid !== 0) { const gx = Math.round(c.x / 2) * 2, gz = Math.round(c.z / 2) * 2, R = 30 + Math.abs(c.y) * 2; for (let x = gx - R; x <= gx + R; x += 2) seg(x, gz - R, x, gz + R + 16); for (let z = gz - R; z <= gz + R + 16; z += 2) seg(gx - R, z, gx + R, z); }
  const over = [];
  if ([].concat(S.fx || []).includes('pov')) { const w = W * 0.15, h = w * 1.5, bob = Math.sin(lu * 8.4) * H * 0.012; over.push({ rows: MISC.hand, x: W * 0.2, y: H - h * 0.62 + bob, w, h }, { rows: MISC.hand, x: W * 0.8 - w, y: H - h * 0.62 - bob, w, h, flip: true }); }
  let mb = [0, 0];
  if (S.mb) { const c2 = camera(S, lu + 1 / 30, win, ez), sx = Math.abs(c2.yaw - c.yaw) * f, sy = Math.abs(c2.pitch - c.pitch) * f, sz = Math.abs(c2.f - c.f) / c.f * W * 0.5; mb = [Math.min(W * 0.04, (sx + sz) * 0.35), Math.min(W * 0.04, (sy + sz) * 0.35)]; }
  return { horizon: cy + f * Math.tan(CL(c.pitch, -1.5707, 1.5707)), roll: c.roll, grid, items, over, mb, cam: c };
}

module.exports = { PAL, MISC, frame, EASE };
