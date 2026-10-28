// クラスターラッシュ 抽選ロジック(サーバー専用)
// ファイル名の先頭が _ なので、Vercelでは公開APIにならない(api/cluster.js から import されるだけ)
import crypto from 'node:crypto';

export const CFG = {
  cols: 7, rows: 7,
  tries: 5,             // 1回の購入で最初に遊べるスピン数
  price: 1000,          // 購入価格(コイン)
  betRate: 4.88,        // 購入価格 ÷ これ = 基準ベット
  payScale: 1,          // 配当スケール(還元率の微調整用)
  targetRTP: 0.92, 
  pMult: 0.2,           // 各図柄が倍率(×2/×4)を持つ確率
  p4x: 0.25,            // 倍率が出た時に×4になる割合
  pScatter: 0.02,       // 最初の配置で各マスがスキャッターになる確率
  maxSpins: 40,
  maxWin: 20,           // 1セットの最大獲得(購入価格の何倍まで)
  minCluster: 5,
};
export const SYMS = [9, 10, 11, 12, 13, 14, 15];   // 図柄7種の出やすさ(絵はクライアント側)
// つながった個数 5,6,7,8,9,10,11,12,13,14,15以上 → ベットの何倍
export const PAYTABLE = [
  [1, 1.5, 1.75, 2, 2.5, 5, 7.5, 15, 35, 70, 150],
  [0.75, 1, 1.25, 1.5, 2, 4, 6, 12.5, 30, 60, 100],
  [0.5, 0.75, 1, 1.25, 1.5, 3, 4.5, 10, 25, 50, 90],
  [0.4, 0.5, 0.75, 1, 1.25, 2, 3, 5, 20, 40, 80],
  [0.3, 0.4, 0.5, 0.75, 1, 1.5, 2.5, 3.5, 15, 30, 60],
  [0.25, 0.3, 0.4, 0.5, 0.75, 1.25, 2, 3, 10, 20, 40],
  [0.2, 0.25, 0.3, 0.4, 0.5, 1, 1.5, 2.5, 5, 10, 20],
];
const sizeIdx = n => Math.min(n, 15) - 5;
const MULT_CAP = 256;
const RETRIGGER = { 3: 3, 4: 3, 5: 3 };   // スキャッター3個以上で+3スピン

// 管理画面の設定をCFGに反映(範囲外の値は無視して安全な範囲に丸める)
export const DEFAULTS = { price: CFG.price, betRate: CFG.betRate, pMult: CFG.pMult, pScatter: CFG.pScatter, maxWin: CFG.maxWin };
export const PRICES = [1000, 2000, 3000];   // 購入できるコイン額
const LIMITS = { betRate: [3, 100], pMult: [0, 0.6], pScatter: [0, 0.06], maxWin: [5, 500] };
export function applySettings(s = {}) {
  for (const k of Object.keys(LIMITS)) {
    const v = Number(s[k]); if (!Number.isFinite(v)) { CFG[k] = DEFAULTS[k]; continue; }
    CFG[k] = Math.min(LIMITS[k][1], Math.max(LIMITS[k][0], v));
  }
}
export const settingKeys = Object.keys(LIMITS);
// 購入額の選択肢(最大40個)。不正な値は捨てて、空ならデフォルト
export function sanitizePrices(arr) {
  const out = [];
  for (const v of Array.isArray(arr) ? arr : []) {
    const n = Math.round(Number(v));
    if (Number.isFinite(n) && n >= 100 && n <= 1000000 && !out.includes(n)) out.push(n);
    if (out.length >= 40) break;
  }
  return out.length ? out.sort((a, b) => a - b) : PRICES.slice();
}

// 暗号品質の乱数 [0,1)
export const secureRng = () => crypto.randomBytes(6).readUIntBE(0, 6) / 2 ** 48;

const SYM_TOTAL = SYMS.reduce((a, b) => a + b, 0);
function pickSym(rng) {
  let r = rng() * SYM_TOTAL;
  for (let i = 0; i < SYMS.length; i++) { r -= SYMS[i]; if (r < 0) return i; }
  return SYMS.length - 1;
}

function findClusters(grid) {
  const seen = new Set(), out = [];
  for (let c = 0; c < CFG.cols; c++) for (let r = 0; r < CFG.rows; r++) {
    const s = grid[c][r];
    if (s.t !== 's' || seen.has(s.id)) continue;
    const q = [[c, r]], pos = [], ids = []; seen.add(s.id);
    while (q.length) {
      const [x, y] = q.pop(); pos.push([x, y]); ids.push(grid[x][y].id);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= CFG.cols || ny >= CFG.rows) continue;
        const n = grid[nx][ny];
        if (n.t === 's' && n.v === s.v && !seen.has(n.id)) { seen.add(n.id); q.push([nx, ny]); }
      }
    }
    if (pos.length >= CFG.minCluster) out.push({ sym: s.v, size: pos.length, pos, ids });
  }
  return out;
}
const snap = grid => {
  const a = [];
  for (let c = 0; c < CFG.cols; c++) for (let r = 0; r < CFG.rows; r++) { const x = grid[c][r]; a.push({ id: x.id, t: x.t, v: x.v, m: x.m, c, r }); }
  return a;
};

function genSetOnce(rng) {
  let nid = 1; const bet = CFG.price / CFG.betRate;
  const newCell = allowScatter => {
    if (allowScatter && rng() < CFG.pScatter) return { id: nid++, t: 'g', v: -1, m: 0 };
    const m = rng() < CFG.pMult ? (rng() < CFG.p4x ? 4 : 2) : 0;
    return { id: nid++, t: 's', v: pickSym(rng), m };
  };
  const spins = []; let total = 0, left = CFG.tries;
  for (let n = 0; n < left; n++) {
    const grid = Array.from({ length: CFG.cols }, () => Array.from({ length: CFG.rows }, () => newCell(true)));
    const deal = snap(grid), steps = []; let win = 0, extra = 0;
    let sc = 0; for (const col of grid) for (const x of col) if (x.t === 'g') sc++;
    if (sc >= 3 && left < CFG.maxSpins) { extra = RETRIGGER[Math.min(sc, 5)]; left = Math.min(left + extra, CFG.maxSpins); }
    for (let guard = 0; guard < 60; guard++) {
      const cls = findClusters(grid); if (!cls.length) break;
      const rem = new Set();
      for (const cl of cls) {
        const cells = cl.pos.map(([c, r]) => grid[c][r]);
        let mult = 1; for (const x of cells) if (x.m) mult *= x.m;
        mult = Math.min(mult, MULT_CAP);
        cl.mult = mult;
        cl.pay = Math.round(bet * PAYTABLE[cl.sym][sizeIdx(cl.size)] * CFG.payScale * mult);
        win += cl.pay; cl.ids.forEach(id => rem.add(id));
      }
      for (let c = 0; c < CFG.cols; c++) {
        const keep = grid[c].filter(x => !rem.has(x.id));
        const fresh = Array.from({ length: CFG.rows - keep.length }, () => newCell(false));
        grid[c] = fresh.concat(keep);
      }
      steps.push({ clusters: cls.map(({ sym, size, pos, pay, mult }) => ({ sym, size, pos, pay, mult })), after: snap(grid) });
    }
    total += win;
    spins.push({ deal, steps, win, extra, scatters: sc });
  }
  return { spins, total };
}

// 1セット分の結果を作る。上限(maxWin×価格)を超えた抽選はやり直し
export function genSet(rng = secureRng) {
  const cap = CFG.maxWin * CFG.price;
  for (let i = 0; i < 200; i++) { const s = genSetOnce(rng); if (s.total <= cap) return s; }
  return { spins: [], total: 0, failed: true };   // 通常ここには来ない
}

export function simulate(n, rng = Math.random) {
  let sum = 0, max = 0, hit = 0, ge = 0;
  for (let i = 0; i < n; i++) {
    const s = genSet(rng); sum += s.total; if (s.total > max) max = s.total;
    if (s.total > 0) hit++; if (s.total >= CFG.price) ge++;
  }
  return { rtp: sum / (n * CFG.price), avg: sum / n, max, hit: hit / n, ge: ge / n };
}
