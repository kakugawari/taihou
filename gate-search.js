/*
 * ゲートの置き場所を探す。
 *   node gate-search.js 面の番号(0 始まり) 狙う敵の番号(カンマ区切り) 出口の高さの目安 [もう置いてあるゲートの JSON [出口の高さ(絶対。カンマ区切り)]]
 *
 * 入口 A を格子で動かし、出口 B を敵の左側で動かして、大砲 (n) で狙う敵に当たる撃ち方の
 * 「通りの数」と「角度の種類」を数え、よい順に 4 つ出す。大砲でほぼ真上にしか当たらない置き場所は選ばない。
 *  - 3 つ目: ほら穴の天井の下面の高さ。出口はその下 +0.08 と +0.11 に置く (4 つ目を足すと絶対の高さを使う)
 *  - 4 つ目: すでに置いたゲート (ゲートが 2 組ある面で、2 組目を探すとき)。重ならない所に置く
 *  - 5 つ目: 出口の高さを自分で決めたいとき (例: 天井の上の敵に落とすなら 0.34,0.38)
 * 面のデータ (LEVELS) の terrain と enemies は、先に書いておくこと。
 */
const C = require('./core.js');
const V = { W: 430, H: 932 };
const i = +process.argv[2], inside = process.argv[3].split(',').map(Number);
const lv = C.LEVELS[i];
const foes = C.makeFoes(i, () => 0);
const ceilY = +process.argv[4];
const fixed = process.argv[5] ? JSON.parse(process.argv[5]) : [];
const byAbs = process.argv[6] ? process.argv[6].split(',').map(Number) : null;
const ex = inside.map((k) => lv.enemies[k].x);
function aimAt(deg, p) { const m = C.muzzle(V), r = deg * Math.PI / 180, d = p * V.H * C.MAXDRAG; return C.aimVec(m.x + Math.cos(r) * d, m.y + Math.sin(r) * d, V); }
const R = V.H * C.PORTAL_R;
function ringFree(q) {
  for (let k = 0; k < 24; k++) { const a = k / 24 * 6.2832; if (C.solid(lv.terrain, q[0] * V.W + Math.cos(a) * R, q[1] * V.H + Math.sin(a) * R, V)) return false; }
  for (const p of fixed) for (const o of [p.a, p.b]) if (Math.hypot((o[0] - q[0]) * V.W, (o[1] - q[1]) * V.H) < R * 2.4) return false;   // 他のゲートと重ならない
  return true;
}
function evalGate(A, B) {
  const env = { portals: [...fixed, { a: A, b: B }] };
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
const bys = byAbs || [ceilY + 0.08, ceilY + 0.11];
for (const bx of bxs) for (const by of bys) {
  const B = [bx, +by.toFixed(2)];
  if (!ringFree(B)) continue;
  for (let ax = 0.24; ax <= 0.62; ax += 0.04) for (let ay = 0.40; ay <= 0.68; ay += 0.04) {
    const A = [+ax.toFixed(2), +ay.toFixed(2)];
    if (!ringFree(A) || Math.hypot((A[0] - B[0]) * V.W, (A[1] - B[1]) * V.H) < R * 2.4) continue;
    const per = evalGate(A, B);
    const score = Math.min(...per.map((x) => x.degs.size)) * 1000 + Math.min(...per.map((x) => x.n));
    results.push({ A, B, per: per.map((x) => [x.n, x.degs.size]), score });
  }
}
results.sort((a, b) => b.score - a.score);
console.log('面' + (i + 1), results.slice(0, 4).map((r) => `A${JSON.stringify(r.A)} B${JSON.stringify(r.B)} [通り,角度の種類]=${JSON.stringify(r.per)}`).join('\n   '));
