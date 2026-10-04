/*
 * ゲートの置き場所を探す: node gate-search.js 面の番号(0 始まり) ほら穴の中の敵の番号(カンマ区切り) 天井の下面のy
 *
 * 入口 A を格子で動かし、出口 B を天井の下で動かして、大砲 (n) でほら穴の中の敵に当たる撃ち方の
 * 「通りの数」と「角度の種類」を数え、よい順に 4 つ出す。大砲でほぼ真上にしか当たらない置き場所は選ばない。
 * 面のデータ (LEVELS) の terrain と enemies は、先に書いておくこと。
 */
const C = require('./core.js');
const V = { W: 430, H: 932 };
const i = +process.argv[2], inside = process.argv[3].split(',').map(Number);
const lv = C.LEVELS[i];
const foes = C.makeFoes(i, () => 0);
const ceilY = +process.argv[4];           // 天井の下面 (B はその下)
const ex = inside.map((k) => lv.enemies[k].x);
function aimAt(deg, p) { const m = C.muzzle(V), r = deg * Math.PI / 180, d = p * V.H * C.MAXDRAG; return C.aimVec(m.x + Math.cos(r) * d, m.y + Math.sin(r) * d, V); }
function ringFree(q) { const r = V.H * C.PORTAL_R; for (let k = 0; k < 24; k++) { const a = k / 24 * 6.2832; if (C.solid(lv.terrain, q[0] * V.W + Math.cos(a) * r, q[1] * V.H + Math.sin(a) * r, V)) return false; } return true; }
function evalGate(A, B) {
  const env = { wind: 0, portals: [{ a: A, b: B }] };
  const per = inside.map(() => ({ n: 0, degs: new Set() }));
  for (let deg = -88; deg <= -20; deg += 1) for (let p = 0.3; p <= 1.0001; p += 0.02) {
    const s = C.simulateShot(lv.terrain, 'n', aimAt(deg, Math.min(1, p)), V, foes, 60, env);
    inside.forEach((k, j) => {
      const f = foes[k];
      if ((s.type === 'direct' && s.target === k) || (s.type === 'ground' && C.inBlast(f, s.x, s.y, C.AMMO.n.blast, V))) { per[j].n++; per[j].degs.add(deg); }
    });
  }
  return per;
}
const results = [];
const bxs = []; const mid = ex.reduce((a, b) => a + b, 0) / ex.length;
for (let dx = -0.16; dx <= 0.0001; dx += 0.04) bxs.push(+(mid + dx).toFixed(2));
for (const bx of bxs) for (const by of [ceilY + 0.08, ceilY + 0.11]) {
  const B = [bx, +by.toFixed(2)];
  if (!ringFree(B)) continue;
  for (let ax = 0.24; ax <= 0.62; ax += 0.04) for (let ay = 0.40; ay <= 0.68; ay += 0.04) {
    const A = [+ax.toFixed(2), +ay.toFixed(2)];
    if (!ringFree(A)) continue;
    const per = evalGate(A, B);
    const score = Math.min(...per.map((x) => x.degs.size)) * 1000 + Math.min(...per.map((x) => x.n));
    results.push({ A, B, per: per.map((x) => [x.n, x.degs.size]), score });
  }
}
results.sort((a, b) => b.score - a.score);
console.log('面' + (i + 1), results.slice(0, 4).map((r) => `A${JSON.stringify(r.A)} B${JSON.stringify(r.B)} [通り,角度の種類]=${JSON.stringify(r.per)}`).join('\n   '));
