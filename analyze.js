#!/usr/bin/env node
/* 分析一段视频的分镜和运镜（模式二：拉片复刻）
   node analyze.js input.mp4 [--out 输出目录] [--fov 60]
   输出：
   - analysis.json：切出来的每个镜头（起止时间、时长）和镜头运动测量（横摇、纵摇、缩放、旋转、视差）以及每 0.5 秒的运动曲线
   - keyframes.png：每个镜头的开头 / 中间 / 结尾三帧，一行一个镜头，用来判断景别、角度、人物位置
   只依赖 ffmpeg。运动是从画面整体位移估算的，数值是近似值。 */
'use strict';
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const argv = process.argv.slice(2), opt = { _: [] };
for (let i = 0; i < argv.length; i++) { const a = argv[i]; if (a.startsWith('--')) opt[a.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true; else opt._.push(a); }
const input = opt._[0]; if (!input) { console.error('用法：node analyze.js input.mp4 [--out dir]'); process.exit(1); }
const outDir = opt.out || path.join(path.dirname(input), path.basename(input, path.extname(input)) + '_analysis'); fs.mkdirSync(outDir, { recursive: true });
const FPS = 20, W = 192, H = 108, FOV = +(opt.fov || 60), FPX = W / 2 / Math.tan(FOV / 2 * Math.PI / 180);

// 1. 解码成小尺寸灰度帧
const raw = spawnSync('ffmpeg', ['-loglevel', 'error', '-i', input, '-vf', `fps=${FPS},scale=${W}:${H},format=gray`, '-f', 'rawvideo', '-'], { maxBuffer: 1 << 30 }).stdout;
const N = Math.floor(raw.length / (W * H)); if (N < 2) { console.error('读不到视频帧'); process.exit(1); }
const F = Array.from({ length: N }, (_, i) => raw.subarray(i * W * H, (i + 1) * W * H));

// 2. 相邻帧差异（找硬切用）
const diff = []; for (let i = 1; i < N; i++) { let s = 0; for (let k = 0; k < W * H; k += 3) s += Math.abs(F[i][k] - F[i - 1][k]); diff.push(s / (W * H / 3)); }

// 3. 每两帧之间的整体运动：分块匹配，再拟合 平移 + 缩放 + 旋转
function motion(a, b) {
  const sad = (x0, y0, dx, dy, bs) => { let s = 0; for (let y = 0; y < bs; y += 1) for (let x = 0; x < bs; x += 1) { const xa = x0 + x, ya = y0 + y, xb = xa + dx, yb = ya + dy; if (xb < 0 || yb < 0 || xb >= W || yb >= H) return 1e9; s += Math.abs(a[ya * W + xa] - b[yb * W + xb]); } return s; };
  // 先粗找整体平移（大块，步长 2）
  let best = [0, 0, 1e18];
  for (let dy = -16; dy <= 16; dy += 2) for (let dx = -24; dx <= 24; dx += 2) { let s = 0, n = 0; for (let y = 20; y < H - 20; y += 6) for (let x = 28; x < W - 28; x += 6) { const xb = x + dx, yb = y + dy; if (xb < 0 || yb < 0 || xb >= W || yb >= H) continue; s += Math.abs(a[y * W + x] - b[yb * W + xb]); n++; } if (n && s / n < best[2]) best = [dx, dy, s / n]; }
  const vec = [], bs = 12;
  for (let y0 = 6; y0 + bs < H - 6; y0 += 14) for (let x0 = 6; x0 + bs < W - 6; x0 += 14) {
    let mean = 0, v = 0; for (let y = 0; y < bs; y++) for (let x = 0; x < bs; x++) mean += a[(y0 + y) * W + x0 + x]; mean /= bs * bs;
    for (let y = 0; y < bs; y++) for (let x = 0; x < bs; x++) v += (a[(y0 + y) * W + x0 + x] - mean) ** 2; if (v / (bs * bs) < 30) continue; // 没纹理的块不可信
    let m = [0, 0, 1e18]; for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) { const s = sad(x0, y0, best[0] + dx, best[1] + dy, bs); if (s < m[2]) m = [best[0] + dx, best[1] + dy, s]; }
    // 排除"只有一个方向有纹理"的块（比如一根竖线，上下怎么挪都一样）
    const amb = [[2, 0], [-2, 0], [0, 2], [0, -2]].some(([ex, ey]) => sad(x0, y0, m[0] + ex, m[1] + ey, bs) < m[2] * 1.25 + bs * bs * 1.5);
    if (!amb && m[2] < 1e9 && m[2] / (bs * bs) < 25) vec.push({ x: x0 + bs / 2 - W / 2, y: y0 + bs / 2 - H / 2, dx: m[0], dy: m[1] });
  }
  if (vec.length < 6) return null;
  let use = vec, fit;
  for (let it = 0; it < 3; it++) {
    const n = use.length, mx = use.reduce((s, v) => s + v.x, 0) / n, my = use.reduce((s, v) => s + v.y, 0) / n, tx0 = use.reduce((s, v) => s + v.dx, 0) / n, ty0 = use.reduce((s, v) => s + v.dy, 0) / n;
    let num1 = 0, num2 = 0, den = 0; use.forEach(v => { const x = v.x - mx, y = v.y - my, dx = v.dx - tx0, dy = v.dy - ty0; num1 += x * dx + y * dy; num2 += x * dy - y * dx; den += x * x + y * y; });
    const s = num1 / den, r = num2 / den, tx = tx0 - s * mx + r * my, ty = ty0 - r * mx - s * my;
    const res = vec.map(v => Math.hypot(v.dx - (tx + s * v.x - r * v.y), v.dy - (ty + r * v.x + s * v.y)));
    const med = res.slice().sort((p, q) => p - q)[res.length >> 1];
    // 中心区域和外圈各自的缩放：推镜头时离得近的主体比背景放大得快
    const sc = sel => { let nu = 0, de = 0; vec.filter(sel).forEach(v => { const x = v.x, y = v.y, dx = v.dx - tx, dy = v.dy - ty; nu += x * dx + y * dy; de += x * x + y * y; }); return de ? nu / de : 0; };
    fit = { tx, ty, s, r, res: med, out: res.filter(v => v > 2).length / res.length, sIn: sc(v => Math.abs(v.x) < W * 0.22 && Math.abs(v.y) < H * 0.3), sOut: sc(v => Math.abs(v.x) >= W * 0.22 || Math.abs(v.y) >= H * 0.3) }; use = vec.filter((_, i) => res[i] <= Math.max(1.2, med * 2)); if (use.length < 6) break;
  }
  return fit;
}
// 硬切：帧差相对前后突然变大，并且用整体运动也解释不了
const cuts = [0];
for (let i = 1; i < N; i++) {
  const win = diff.slice(Math.max(0, i - 6), i - 1).concat(diff.slice(i, i + 5)), med = win.sort((p, q) => p - q)[win.length >> 1] || 0;
  if (diff[i - 1] > Math.max(8, med * 3.5) && i - cuts[cuts.length - 1] >= 4) { const m = motion(F[i - 1], F[i]); if (!m || m.res > 1.5 || diff[i - 1] > Math.max(10, med * 6)) cuts.push(i); }
}
cuts.push(N);
const STILL = { tx: 0, ty: 0, s: 0, r: 0, res: 0, out: 0 };
const M = [null]; for (let i = 1; i < N; i++) M.push(cuts.includes(i) ? null : diff[i - 1] < 0.3 ? STILL : motion(F[i - 1], F[i]));

// 4. 每个镜头汇总成摄影机运动（正值：右摇 / 上仰 / 推近或放大 / 画面顺时针转）
const PARX = 0.1, JIT = 0.5, deg = px => Math.atan(px / FPX) * 180 / Math.PI, r1 = v => Math.round(v * 10) / 10;
const shots = [];
for (let c = 0; c < cuts.length - 1; c++) {
  const a = cuts[c], b = cuts[c + 1], ms = M.slice(a + 1, b), ok = ms.filter(Boolean);
  let pan = 0, tilt = 0, zoom = 1, roll = 0, par = 0; const curve = [];
  let acc = { pan: 0, tilt: 0, zoom: 1, roll: 0 }, n = 0, lost = ms.length - ok.length;
  ms.forEach((m, k) => {
    if (m) { pan -= deg(m.tx); tilt += deg(m.ty); zoom *= 1 + m.s; roll += m.r * 180 / Math.PI; par += m.out; acc.pan -= deg(m.tx); acc.tilt += deg(m.ty); acc.zoom *= 1 + m.s; acc.roll += m.r * 180 / Math.PI; }
    if (++n === FPS / 2 || k === ms.length - 1) { curve.push({ t: r1((a + k + 1) / FPS), pan: r1(acc.pan), tilt: r1(acc.tilt), zoom: Math.round(acc.zoom * 1000) / 1000, roll: r1(acc.roll) }); acc = { pan: 0, tilt: 0, zoom: 1, roll: 0 }; n = 0; }
  });
  // 视差用隔 4 帧（0.2 秒）的两帧来量，差别更明显
  const pm = [], sI = [], sO = []; for (let k = a + 4; k < b; k += 4) if (diff.slice(k - 4, k).some(d => d >= 0.3)) { const m = motion(F[k - 4], F[k]); if (m) { pm.push(m.out); sI.push(m.sIn); sO.push(m.sOut); } }
  par = pm.length ? pm.reduce((s, v) => s + v, 0) / pm.length : 0;
  const sum = arr => arr.reduce((s, v) => s + v, 0), depth = Math.abs(sum(sO)) > 0.01 ? sum(sI) / sum(sO) : 0;
  const hint = [];
  if (Math.abs(pan) > 4) hint.push(par > PARX ? `横向移动（有视差，像横移或跟拍）${pan > 0 ? '向右' : '向左'}` : `${pan > 0 ? '右' : '左'}摇约 ${Math.abs(r1(pan))}°`);
  if (Math.abs(tilt) > 3) hint.push(par > PARX ? `竖直移动（有视差，像升降）${tilt > 0 ? '向上' : '向下'}` : `${tilt > 0 ? '上仰' : '下俯'}约 ${Math.abs(r1(tilt))}°`);
  if (Math.abs(zoom - 1) > 0.08) hint.push(`${zoom > 1 ? '画面放大' : '画面缩小'} ${Math.round(Math.abs(zoom - 1) * 100)}%（${par > PARX || depth > 1.6 ? '中心主体比背景变化快，更像推拉镜头' : '视差不明显：可能是变焦，也可能是推拉，请看关键帧里背景透视有没有变化'}）`);
  if (Math.abs(roll) > 4) hint.push(`画面${roll > 0 ? '顺' : '逆'}时针旋转约 ${Math.abs(r1(roll))}°`);
  if (lost > ms.length * 0.3) hint.push('有一段运动太快或太模糊测不准（可能是甩镜、急推或剧烈晃动）');
  // 抖动：运动曲线里去掉平滑部分后剩下的高频起伏
  let jit = 0; if (ok.length > 6) { for (let i = 2; i < ok.length - 2; i++) for (const key of ['tx', 'ty']) { const avg = (ok[i - 2][key] + ok[i - 1][key] + ok[i + 1][key] + ok[i + 2][key]) / 4; jit += Math.abs(ok[i][key] - avg); } jit /= ok.length - 4; }
  if (jit > JIT) hint.push('有不规则抖动（手持或震动）');
  if (!hint.length) hint.push('基本没有镜头运动（固定镜头，或运动很小）');
  shots.push({ shot: c + 1, start: r1(a / FPS), end: r1(b / FPS), dur: r1((b - a) / FPS), camera: { depth: r1(depth), pan: r1(pan), tilt: r1(tilt), zoom: Math.round(zoom * 1000) / 1000, roll: r1(roll), parallax: Math.round(par * 100) / 100, shake: r1(jit) }, hint: hint.join('；'), curve });
}

// 5. 关键帧拼图：每个镜头一行，开头 / 中间 / 结尾
const tmp = path.join(outDir, '_kf'); fs.mkdirSync(tmp, { recursive: true });
const tiles = [];
shots.forEach(s => [0.08, 0.5, 0.92].forEach((p, j) => { const f = path.join(tmp, `${s.shot}_${j}.png`); const grab = vf => spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', String(s.start + s.dur * p), '-i', input, '-frames:v', '1', '-vf', vf, f]); grab(`scale=480:-2,drawtext=text='${s.shot}-${'ABC'[j]}':x=8:y=8:fontsize=20:fontcolor=white:box=1:boxcolor=black@0.6`); if (!fs.existsSync(f)) grab('scale=480:-2'); tiles.push(f); /* 没有字体时不写编号 */ }));
const kf = path.join(outDir, 'keyframes.png');
const ok = tiles.filter(f => fs.existsSync(f));
if (ok.length) spawnSync('ffmpeg', ['-loglevel', 'error', '-y', ...ok.flatMap(f => ['-i', f]), '-filter_complex', ok.map((_, i) => `[${i}:v]scale=480:270:force_original_aspect_ratio=decrease,pad=480:270:(ow-iw)/2:(oh-ih)/2[v${i}]`).join(';') + ';' + ok.map((_, i) => `[v${i}]`).join('') + `xstack=inputs=${ok.length}:layout=${ok.map((_, i) => `${(i % 3) * 480}_${Math.floor(i / 3) * 270}`).join('|')}:fill=white`, '-frames:v', '1', kf]);
fs.rmSync(tmp, { recursive: true, force: true });
const result = { video: input, seconds: r1(N / FPS), fov_assumed: FOV, note: 'camera：pan 正=右摇，tilt 正=上仰，zoom >1=推近/放大，roll 正=画面顺时针转，parallax=和整体运动不一致的画面块比例，大于 0.12 说明有前后景视差、机位在移动（推拉、横移、跟拍、升降），小则是原地转或变焦，shake=抖动程度（大于 0.5 算明显），depth=中心区域缩放 ÷ 外圈缩放（大于 1.6 说明主体比背景放大快，是推拉不是变焦）。keyframes.png 每行一个镜头：A 开头 B 中间 C 结尾。', shots, keyframes: kf };
fs.writeFileSync(path.join(outDir, 'analysis.json'), JSON.stringify(result, null, 1));
console.log(JSON.stringify({ out: outDir, shots: shots.map(s => `${s.shot}: ${s.start}-${s.end}s ${s.hint}`) }, null, 1));
