/*
 * 面の調整用: 敵ごとに「当たる撃ち方が何通りあるか」を数える。  node level-check.js [はじめの面 [おわりの面 [min]]]
 *
 * 面の番号は 1 から。min を付けると、面ごとの最小だけを 1 行で出す。
 * 直撃か、爆風が届く所に落ちれば数える。かぜとゲートも効かせる (ゲートの面は「ゲートなし」も並べる)。
 * 目安: 元の 30 面は敵ごとに最低 22 通り。10 通りを切る敵がいたら、かぜや置き場所を見直す。
 */
const C = require('./core.js');
const V = { W: 430, H: 932 };
function aimAt(deg, p) { const m = C.muzzle(V), r = deg * Math.PI / 180, d = p * V.H * C.MAXDRAG; return C.aimVec(m.x + Math.cos(r) * d, m.y + Math.sin(r) * d, V); }
function reach(i, env) {
  const lv = C.LEVELS[i], foes = C.makeFoes(i, () => 0), hit = foes.map(() => 0);
  for (const kind of C.kindsIn(i)) {
    const blast = C.AMMO[kind].blast;
    for (let deg = -150; deg <= -1; deg++) for (let p = C.MIN_POWER; p <= 1.0001; p += 0.02) {
      const r = C.simulateShot(lv.terrain, kind, aimAt(deg, Math.min(1, p)), V, foes, 60, env);
      if (r.type === 'direct') hit[r.target]++;
      if (r.type === 'ground') foes.forEach((f, k) => { if (C.inBlast(f, r.x, r.y, blast, V)) hit[k]++; });
    }
  }
  return hit;
}
const from = (+process.argv[2] || 1) - 1, to = (+process.argv[3] || C.LEVELS.length) - 1, quiet = process.argv[4] === 'min';
const mins = [];
for (let i = from; i <= to; i++) {
  const env = C.envOf(i);
  const a = reach(i, env);
  mins.push((i + 1) + ':' + Math.min(...a));
  if (!quiet) {
    let line = `${i + 1}面 (${env.portals.length ? 'ゲート' : 'かぜ ' + env.wind}) 当てる撃ち方の数: ${a.join(', ')}`;
    if (env.portals.length) line += `   ゲートなし: ${reach(i, { wind: 0, portals: [] }).join(', ')}`;
    console.log(line);
  }
}
if (quiet) console.log(mins.join('  '));
