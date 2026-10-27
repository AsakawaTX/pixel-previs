/* 软件光栅化：把 engine.frame() 的结果画成 RGB 像素（不需要浏览器和 Canvas）。 */
'use strict';
const { PAL, MISC } = require('./sprites');
const RGB = {}; const rgb = h => RGB[h] || (RGB[h] = [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16)));

function render(fr, W, H) {
  const px = new Uint8Array(W * H * 3), cx = W / 2, cy = H / 2, co = Math.cos(fr.roll), si = Math.sin(fr.roll);
  const rot = (x, y) => { const dx = x - cx, dy = y - cy; return [cx + co * dx - si * dy, cy + si * dx + co * dy]; };
  // 天空和地面：把像素转回未旋转坐标，比较地平线
  const sky = rgb(PAL.sky), gr = rgb(PAL.ground);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = (-si * (x - cx) + co * (y - cy) + cy) < fr.horizon ? sky : gr, i = (y * W + x) * 3; px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; }
  // 地面网格
  const gc = rgb(PAL.g), lw = Math.max(1, Math.round(W / 640));
  fr.grid.forEach(l => {
    let [x0, y0] = rot(l[0], l[1]), [x1, y1] = rot(l[2], l[3]);
    let t0 = 0, t1 = 1; const dx = x1 - x0, dy = y1 - y0;
    for (const [p, q] of [[-dx, x0 + 2], [dx, W + 2 - x0], [-dy, y0 + 2], [dy, H + 2 - y0]]) { if (p === 0) { if (q < 0) return; } else { const r = q / p; if (p < 0) t0 = Math.max(t0, r); else t1 = Math.min(t1, r); } }
    if (t0 > t1) return;
    const ax = x0 + dx * t0, ay = y0 + dy * t0, n = Math.ceil(Math.hypot(dx, dy) * (t1 - t0));
    for (let k = 0; k <= n; k++) { const X = Math.round(ax + dx * (t1 - t0) * k / (n || 1)), Y = Math.round(ay + dy * (t1 - t0) * k / (n || 1)); for (let a = 0; a < lw; a++) for (let b = 0; b < lw; b++) { const xx = X + a, yy = Y + b; if (xx >= 0 && yy >= 0 && xx < W && yy < H) { const i = (yy * W + xx) * 3; px[i] = gc[0]; px[i + 1] = gc[1]; px[i + 2] = gc[2]; } } }
  });
  // 像素小图：最近邻反向映射，可旋转、翻转；需要虚化时先画到小图层再模糊
  const blit = (it, rolled) => {
    const rows = it.rows || MISC[it.s], sw = rows[0].length, sh = rows.length, pal = Object.assign({}, PAL, it.pal || {});
    let [mx, my] = rolled ? rot(it.x + it.w / 2, it.y + it.h / 2) : [it.x + it.w / 2, it.y + it.h / 2];
    const a = (it.rot || 0) + (rolled ? fr.roll : 0), c = Math.cos(-a), s = Math.sin(-a), r = Math.hypot(it.w, it.h) / 2 + 1;
    const b = it.blur > 0.6 ? Math.round(it.blur) : 0, x0 = Math.max(0, Math.floor(mx - r - b * 2)), x1 = Math.min(W, Math.ceil(mx + r + b * 2)), y0 = Math.max(0, Math.floor(my - r - b * 2)), y1 = Math.min(H, Math.ceil(my + r + b * 2));
    if (x0 >= x1 || y0 >= y1) return;
    const lw2 = x1 - x0, lh = y1 - y0, layer = new Float32Array(lw2 * lh * 4);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const dx = x + 0.5 - mx, dy = y + 0.5 - my, lx = c * dx - s * dy, ly = s * dx + c * dy;
      let u = Math.floor((lx / it.w + 0.5) * sw); const v = Math.floor((ly / it.h + 0.5) * sh);
      if (u < 0 || v < 0 || u >= sw || v >= sh) continue; if (it.flip) u = sw - 1 - u;
      const ch = rows[v][u]; if (ch === '.') continue; const col = rgb(pal[ch]), j = ((y - y0) * lw2 + x - x0) * 4;
      layer[j] = col[0]; layer[j + 1] = col[1]; layer[j + 2] = col[2]; layer[j + 3] = 1;
    }
    if (b) for (let pass = 0; pass < 2; pass++) { boxBlur(layer, lw2, lh, 4, b, true); boxBlur(layer, lw2, lh, 4, b, false); }
    for (let y = 0; y < lh; y++) for (let x = 0; x < lw2; x++) {
      const j = (y * lw2 + x) * 4, al = layer[j + 3]; if (al <= 0.003) continue;
      const i = ((y + y0) * W + x + x0) * 3, pre = b ? 1 / al : 1, A = Math.min(1, al);
      for (let k = 0; k < 3; k++) px[i + k] = px[i + k] * (1 - A) + layer[j + k] * pre * A;
    }
  };
  fr.items.forEach(it => {
    if (it.shadow) { const sw = it.w * 0.9, sh = sw * 0.18; blit({ rows: MISC.shadow, x: it.x + it.w * 0.05, y: it.y + it.h - sh / 2, w: sw, h: sh, blur: it.blur }, true); }
    blit(it, true);
  });
  fr.over.forEach(it => blit(it, false));
  if (fr.mb[0] > 0.6 || fr.mb[1] > 0.6) {
    const f = Float32Array.from(px);
    if (fr.mb[0] > 0.6) boxBlur(f, W, H, 3, Math.round(fr.mb[0]), true);
    if (fr.mb[1] > 0.6) boxBlur(f, W, H, 3, Math.round(fr.mb[1]), false);
    for (let i = 0; i < px.length; i++) px[i] = f[i];
  }
  return px;
}
// 一维滑动平均（horizontal=true 横向，否则纵向），ch 个通道
function boxBlur(a, w, h, ch, r, horizontal) {
  const len = horizontal ? w : h, lines = horizontal ? h : w, tmp = new Float32Array(len * ch);
  for (let l = 0; l < lines; l++) {
    const idx = k => (horizontal ? l * w + k : k * w + l) * ch;
    for (let k = 0; k < len; k++) for (let c = 0; c < ch; c++) tmp[k * ch + c] = a[idx(k) + c];
    for (let c = 0; c < ch; c++) {
      let sum = 0; for (let k = -r; k <= r; k++) sum += tmp[CLi(k, len) * ch + c];
      for (let k = 0; k < len; k++) { a[idx(k) + c] = sum / (2 * r + 1); sum += tmp[CLi(k + r + 1, len) * ch + c] - tmp[CLi(k - r, len) * ch + c]; }
    }
  }
}
const CLi = (k, n) => k < 0 ? 0 : k >= n ? n - 1 : k;

module.exports = { render };
