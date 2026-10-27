#!/usr/bin/env node
/* 渲染预演视频
   node render.js shot.json -o out.mp4 [--sheet sheet.png] [--w 1920 --h 1080 --fps 30]
   node render.js --preset Y15 -o orbit.mp4
   node render.js --json '{"shots":[{"preset":"F02","dur":2},{"preset":"Y04"}]}' -o seq.mp4
   node render.js --list                 列出全部预设
   node render.js --show Y15             打印某个预设的参数 */
'use strict';
const fs = require('fs'), path = require('path'), { spawn, spawnSync } = require('child_process');
const { frame } = require('./lib/engine'), { render } = require('./lib/raster');
const PRESETS = require('./presets.json'), byId = Object.fromEntries(PRESETS.map(p => [p.id, p]));

const argv = process.argv.slice(2), opt = { _: [] };
for (let i = 0; i < argv.length; i++) { const a = argv[i]; if (a.startsWith('-')) { const k = a.replace(/^-+/, ''); opt[k] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true; } else opt._.push(a); }
if (opt.list) { PRESETS.forEach(p => console.log(`${p.id}\t${p.cat}·${p.grp}\t${p.zh}\t${p.en}`)); process.exit(0); }
if (opt.show) { console.log(JSON.stringify(byId[opt.show] || 'not found', null, 1)); process.exit(0); }

let job = opt.preset ? { shots: [{ preset: opt.preset }] } : opt.json ? JSON.parse(opt.json) : opt._[0] ? JSON.parse(fs.readFileSync(opt._[0], 'utf8')) : null;
if (!job) { console.error('用法见文件开头注释'); process.exit(1); }
if (!job.shots) job = { shots: [job] };
const W = +(opt.w || job.w || 1920), H = +(opt.h || job.h || 1080), FPS = +(opt.fps || job.fps || 30), out = opt.o || opt.out || 'previs.mp4';

// 展开预设：{preset:'Y04', ...覆盖字段}
const shots = job.shots.map(s => {
  const { preset, ...rest } = s; if (preset && !byId[preset]) throw new Error('没有这个预设：' + preset);
  return Object.assign({ dur: 6 }, preset ? JSON.parse(JSON.stringify(byId[preset].spec)) : {}, rest);
});
const total = shots.reduce((a, s) => a + s.dur, 0), N = Math.round(total * FPS);

const ext = path.extname(out).toLowerCase();
const enc = ext === '.gif' ? ['-vf', `fps=${Math.min(FPS, 15)},scale=${Math.min(W, 640)}:-1:flags=neighbor,split[a][b];[a]palettegen=max_colors=48[p];[b][p]paletteuse=dither=none`]
  : ext === '.webm' ? ['-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '24'] : ['-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'];
const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-r', String(FPS), '-i', '-', ...enc, out], { stdio: ['pipe', 'inherit', 'inherit'] });

(async () => {
  let t0 = 0, si = 0;
  for (let n = 0; n < N; n++) {
    const u = n / FPS; while (si < shots.length - 1 && u >= t0 + shots[si].dur) t0 += shots[si++].dur;
    const buf = Buffer.from(render(frame(shots[si], u - t0, W, H), W, H).buffer);
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  ff.on('close', code => {
    if (code) { console.error('ffmpeg 失败'); process.exit(code); }
    if (opt.sheet) spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', out, '-vf', `fps=${8 / total},scale=480:-1,tile=4x2:padding=4:color=white`, '-frames:v', '1', opt.sheet === true ? out.replace(/\.\w+$/, '_sheet.png') : opt.sheet]);
    console.log(JSON.stringify({ out, seconds: total, frames: N, size: `${W}x${H}`, shots: job.shots.map(s => s.preset || 'custom') }));
  });
})();
