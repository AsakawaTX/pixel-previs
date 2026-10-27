/* 固定像素小图：人物（各种姿势）、道具、手持物。全部预先画好，镜头只移动缩放它们。
   每个字符是一种颜色（见 PAL），'.' 透明。 */
'use strict';
const PAL = { sky: '#e8e4dc', ground: '#d6d0c5', g: '#bab2a5', k: '#2b2723', H: '#2e2925', S: '#e2b996', R: '#3e6db5', B: '#33394a', T: '#c4bdb1', F: '#aaa397', D: '#928b80', m: '#c3bcb0', s: '#c6bfb3',
  W: '#a88a6a', w: '#7e6650', G: '#8ea37f', E: '#71876a', C: '#8d98a3', c: '#6f7882', Q: '#cdd5d6', M: '#9a9da0', Y: '#d8c48e', P: '#4a4d55', X: '#b9b2a6' };
const rep = (s, n) => Array(n).fill(s);

/* ---------- 人物 ---------- */
// 原始人物 12 列 × 26 行（头 8、身体 10、腿 8）。生成时左右各补 2 列、上面补 4 行，留给举起或伸出的手臂。
const HD = { f: ['....kkkk....', '...kHHHHk...', '..kHHHHHHk..', '..kHSSSSHk..', '..kSkSSkSk..', '..kSSSSSSk..', '...kSSSSk...', '....kSSk....'] };
HD.b = HD.f.slice(0, 3).concat(rep('..kHHHHHHk..', 3), ['...kHHHHk...', '....kSSk....']);
HD.s = HD.f.slice(0, 3).concat(['..kHHHSSSk..', '..kHHSSkSk..', '..kHSSSSSSk.'], HD.f.slice(6));
const BD = ['..kkRRRRkk..', '.kRRRRRRRRk.', 'kRRRRRRRRRRk'].concat(rep('kRkRRRRRRkRk', 5), ['kSkBBBBBBkSk', '.kkBBBBBBkk.']);
const BDS = rep('...kRRRRk...', 3).concat(rep('...kRkRRk...', 4), ['...kSkRRk...'], rep('...kBBBBk...', 2));
const LG = '..kBBkkBBk..';
const LEG = {
  f: rep(LG, 7).concat(['.kkkk..kkkk.']), fW: rep(LG, 4).concat(['..kkkkkBBk..', '......kBBk..', '......kBBk..', '......kkkk..']),
  s: rep('....kBBk....', 7).concat(['....kkkkk...']), sW: ['...kBBBBk...', '..kBBkkBBk..', '..kBk..kBk..'].concat(rep('.kBk....kBk.', 4), ['kkkk....kkkk']),
  fSit: ['.kBBBBBBBBk.', '.kBBBkkBBBk.', '..kBBkkBBk..', '..kBBkkBBk..', '.kkkk..kkkk.'],
  sSit: ['...kBBBBBBBk', '...kBBBBBBBk', '........kBBk', '........kBBk', '........kBBk', '........kkkkk'.slice(0, 12)],
  fCr: ['.kBBBBBBBBk.', 'kBBBk..kBBBk', 'kkkk....kkkk'], sCr: ['...kBBBBBBk.', '....kkkBBBk.', '...kkkkkkkk.']
};
const PAD = 2, TOP = 4, UNIT = 26; // 人物身高对应 26 行
function grid(rows) { const g = rep('.'.repeat(12 + PAD * 2), TOP).concat(rows.map(r => '.'.repeat(PAD) + r + '.'.repeat(PAD))).map(r => r.split('')); return g; }
const at = (g, r, c) => g[r + TOP] && g[r + TOP][c + PAD];
const set = (g, r, c, ch, onlyEmpty) => { const row = g[r + TOP]; if (row && c + PAD >= 0 && c + PAD < row.length && (!onlyEmpty || row[c + PAD] === '.')) row[c + PAD] = ch; };
const mirror = g => g.map(r => r.slice().reverse());
// 正面 / 背面：画面右侧手臂的几种动作
function armUp(g) { // 举起
  set(g, -3, 10, 'k'); set(g, -3, 11, 'k');
  for (let r = -2; r <= 10; r++) { set(g, r, 9, 'k', true); set(g, r, 10, r < 0 ? 'S' : 'R'); set(g, r, 11, r < 0 ? 'S' : 'R'); set(g, r, 12, 'k'); }
  for (let r = 11; r <= 17; r++) { set(g, r, 10, '.'); set(g, r, 11, '.'); if (r < 17) set(g, r, 9, 'k'); }
}
function armOut(g) { // 向侧面平伸
  for (let c = 10; c <= 13; c++) { set(g, 9, c, 'k'); set(g, 12, c, 'k'); }
  for (const r of [10, 11]) { set(g, r, 10, 'R'); set(g, r, 11, 'R'); set(g, r, 12, 'S'); set(g, r, 13, 'k'); }
  for (let r = 13; r <= 17; r++) { set(g, r, 10, '.'); set(g, r, 11, '.'); if (r < 17) set(g, r, 9, 'k'); }
}
// 侧面（脸朝画面右）：手臂向前伸、向上举
function sideArmTuck(g) { for (let r = 11; r <= 15; r++) { set(g, r, 4, 'R'); set(g, r, 5, 'R'); } }
function sideFwd(g) { sideArmTuck(g); for (let c = 9; c <= 13; c++) { set(g, 9, c, 'k'); set(g, 12, c, 'k'); } for (const r of [10, 11]) { set(g, r, 9, 'R'); set(g, r, 10, 'R'); set(g, r, 11, 'R'); set(g, r, 12, 'S'); set(g, r, 13, 'k'); } }
function sideUp(g) { sideArmTuck(g); set(g, -3, 10, 'k'); set(g, -3, 11, 'k'); for (let r = -2; r <= 10; r++) { set(g, r, 9, r >= 8 ? 'R' : 'k', r < 8); set(g, r, 10, r < 0 ? 'S' : 'R'); set(g, r, 11, r < 0 ? 'S' : 'R'); set(g, r, 12, 'k'); } }

// 姿势 → 用哪种腿、哪种手臂；hand：手的位置（原始坐标 列,行），手持物画在这里
const POSES = {
  stand: { legs: 'stand' }, walk: { legs: 'walk' }, run: { legs: 'walk' },
  wave: { arm: ['up', 'out'] }, raise: { arm: 'up' }, cheer: { arm: 'both' }, point: { arm: 'fwd' }, punch: { arm: ['fwd', null] },
  sit: { legs: 'sit' }, crouch: { legs: 'crouch' }, jump: { legs: 'walk' }, lie: {}, fall: {}
};
const cache = {};
// face: front/back/side；arm: up/out/both/fwd/null；legs: stand/walk/sit/crouch
function person(face, arm, legs) {
  const key = face + arm + legs; if (cache[key]) return cache[key];
  const side = face === 'side', head = HD[face === 'front' ? 'f' : face === 'back' ? 'b' : 's'];
  const lg = side ? { stand: LEG.s, walk: LEG.sW, sit: LEG.sSit, crouch: LEG.sCr }[legs] : { stand: LEG.f, walk: LEG.fW, sit: LEG.fSit, crouch: LEG.fCr }[legs];
  let g = grid(head.concat(side ? BDS : BD, lg)), hand = side ? [4.5, 15.5] : [10.5, 16.5];
  if (side) {
    if (arm === 'fwd' || arm === 'out') { sideFwd(g); hand = [12.5, 10.5]; }
    else if (arm === 'up' || arm === 'both') { sideUp(g); hand = [10.5, -1.5]; }
  } else {
    if (arm === 'up') { armUp(g); hand = [10.5, -1.5]; }
    else if (arm === 'out' || arm === 'fwd') { armOut(g); hand = [12.5, 10.5]; }
    else if (arm === 'both') { armUp(g); g = mirror(g); armUp(g); g = mirror(g); hand = [10.5, -1.5]; }
  }
  return cache[key] = { rows: g.map(r => r.join('')), hand: [hand[0] + PAD, hand[1] + TOP] };
}

/* ---------- 道具（侧视立面，h 是默认高度/米） ---------- */
const s = str => str.trim().split(/\s+/);
const PROPS = {
  box: { h: 0.9, rows: ['kkkkkkkkkk'].concat(rep('kTTTTTTTTk', 2), ['kkkkkkkkkk'], rep('kFFFFFFFDk', 4), ['kkkkkkkkkk']) },
  pillar: { h: 5, rows: ['kkkkkk'].concat(rep('kFFFDk', 38), ['kkkkkk']) },
  mark: { h: 0.06, rows: ['mmm'], wd: 0.3 },
  table: { h: 0.75, rows: ['kkkkkkkkkkkkkkkkkk', 'kWWWWWWWWWWWWWWWWk', 'kkkkkkkkkkkkkkkkkk'].concat(rep('.kwk..........kwk.', 4), ['.kkk..........kkk.']) },
  chair: { h: 0.9, rows: s('.kkkkkk. .kWWWWk. .kWWWWk. .kkkkkk. kWWWWWWk kkkkkkkk kwk..kwk kwk..kwk kkk..kkk') },
  bench: { h: 0.5, rows: ['kkkkkkkkkkkkkkkkkkkk', 'kWWWWWWWWWWWWWWWWWWk', 'kkkkkkkkkkkkkkkkkkkk', '.kMk............kMk.', '.kMk............kMk.', '.kkk............kkk.'] },
  tree: { h: 4, rows: s(`....kkkkkk.... ..kkGGGGGGkk.. .kGGGGGGGGGGk. kGGGGEGGGGGGGk kGGGGGGGGEGGGk kGGEGGGGGGGGGk kGGGGGGGGGGEGk .kGGGGGEGGGGk. ..kkGGGGGGkk.. ....kkwwkk....`).concat(rep('.....kwwk.....', 5), ['....kkkkkk....']) },
  lamp: { h: 3.5, rows: ['.kkkkk.', 'kMMMMMk', '.kYYYk.', '..kkk..'].concat(rep('...kMk.'.padEnd(7, '.'), 22), ['..kkkk.']) },
  door: { h: 2.4, rows: ['kkkkkkkkkk', 'kFFFFFFFFk', 'kFkkkkkkFk'].concat(rep('kFkWWWWkFk', 6), ['kFkWWWkkFk'.replace('kkFk', 'YkFk')], rep('kFkWWWWkFk', 5), ['kkkkkkkkkk']) },
  wall: { h: 2.5, tile: 1, rows: ['kkkkkkkkkkkkkkkk'].concat(rep('kFFFFFFFFFFFFFDk', 3), ['kDDDDDDDDDDDDDDk'], rep('kFFFFFFFFFFFFFDk', 3), ['kDDDDDDDDDDDDDDk'], rep('kFFFFFFFFFFFFFDk', 3), ['kkkkkkkkkkkkkkkk']) },
  screen: { h: 0.55, rows: ['kkkkkkkkkkkk', 'kPPPPPPPPPPk', 'kPQPPPPPPPPk', 'kPPPPPPPPPPk', 'kPPPPPPPPPPk', 'kkkkkkkkkkkk', '.....kk.....', '...kkkkkk...'] },
  bag: { h: 0.45, rows: s('...kkkk... ..k....k.. kkkkkkkkkk kwwwwwwwwk kwwwwwwwwk kwwwYwwwwk kwwwwwwwwk kkkkkkkkkk') },
  rock: { h: 0.6, rows: s('...kkkkk... .kkXXXXXkk. kXXXXXXXDXk kXXDXXXXXXk kXXXXXXXXXk kkkkkkkkkkk') },
  car: { h: 1.5, views: { side: 'carS', front: 'carF', back: 'carF' } },
  carS: { h: 1.5, rows: ['........kkkkkkkkkk..........', '.......kCQQQkQQQQQk.........', '......kCQQQQkQQQQQQk........', '.....kCCQQQQkQQQQQQQk.......', 'kkkkkCCCCCCCCCCCCCCCCkkkkkk.', 'kCCCCCCCCCCCCCCCCCCCCCCCCCYk', 'kCCCCCCCCCcCCCCCCCCCCCCCCCCk', 'kcccccccccccccccccccccccccck', 'kkkkkkkkkkkkkkkkkkkkkkkkkkkk', '...kkkkk...........kkkkk....', '....kkk.............kkk.....'] },
  carF: { h: 1.5, rows: s('...kkkkkkkk... ..kQQQQQQQQk.. .kQQQQQQQQQQk. kkkkkkkkkkkkkk kCCCCCCCCCCCCk kYYCCCCCCCCYYk kCCCCCCCCCCCCk kcccccccccccck kkkkkkkkkkkkkk kkk........kkk kkk........kkk') }
};
// 手持物：grip 是手握的位置（相对小图宽高的比例）
const HELD = {
  phone: { h: 0.2, grip: [0.5, 0.6], rows: s('kkkk kQQk kQQk kQQk kPPk kkkk') },
  cup: { h: 0.16, grip: [0.3, 0.5], rows: s('kkkkk. kWWWkk kWWWk.k kWWWkk. .kkk..').map(r => r.padEnd(6, '.').slice(0, 6)) },
  book: { h: 0.25, grip: [0.5, 0.7], rows: s('kkkkkk kWWWWk kWYYWk kWWWWk kWWWWk kkkkkk') },
  sword: { h: 1.0, grip: [0.5, 0.88], rows: ['.k.', 'kMk'].concat(rep('kMk', 12), ['kkk', 'kwk', 'kwk', 'kkk']) },
  stick: { h: 0.9, grip: [0.5, 0.8], rows: ['kk'].concat(rep('ww', 14), ['kk']) },
  umbrella: { h: 1.45, grip: [0.5, 0.97], rows: ['.....kkkk.....', '..kkkPPPPkkk..', '.kPPPPPPPPPPk.', 'kPPPPPPPPPPPPk', 'kkkkkkkkkkkkkk'].concat(rep('......kk......', 8), ['......kk.k....', '.......kkk....']) },
  flag: { h: 1.2, grip: [0.15, 0.85], rows: ['kkkkkkkk.', 'kYYYYYYYk', 'kYYYYYYYk', 'kYYYYYYYk', 'kkkkkkkk.'].concat(rep('kk.......', 10)) }
};
const MISC = {
  ptop: ['...kkkk...', 'kkkHHHHkkk', 'kRRHHHHRRk', 'kRRHHHHRRk', 'kkkHHHHkkk', '...kkkk...'],
  btop: ['kkkkkkkkkk'].concat(rep('kTTTTTTTTk', 8), ['kkkkkkkkkk']),
  shadow: ['.ssssss.', 'ssssssss', '.ssssss.'],
  hand: ['.kkkkkk.', 'kSkSkSSk', 'kSkSkSSk', 'kSSSSSSk', 'kSSSSSSk', '.kSSSSk.'].concat(rep('.kRRRRk.', 6))
};
module.exports = { PAL, POSES, PROPS, HELD, MISC, person, UNIT, TOP, PAD };
