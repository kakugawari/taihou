const test = require('node:test');
const assert = require('node:assert');
const Core = require('./core.js');

// 対象の端末 (iPhone 16 Plus) の画面
const VIEW = { W: 430, H: 932 };

/** 指を置く場所を、向き (度) と強さから作る。 */
function aimAt(deg, power, view) {
  const m = Core.muzzle(view);
  const r = (deg * Math.PI) / 180;
  const d = power * view.H * Core.MAXDRAG;
  return Core.aimVec(m.x + Math.cos(r) * d, m.y + Math.sin(r) * d, view);
}

/**
 * その面で、それぞれの敵に「当てられる撃ち方」が何通りあるかを総当たりで数える。
 * 直撃するか、爆風が届く所に落ちれば当てられたとみなす。かぜとゲートも効かせる。
 * @param {object} [env] 省くと、その面のかぜとゲート
 * @returns {number[]} 敵ごとの、当たる撃ち方の数
 */
// 「ぎりぎり当たる」だけの敵がいないこと。元の 30 面は、敵ごとに最低 22 通り (新しい面も 21 以上)。
// 数は MIN_WAYS で頭打ちになる (それ以上は数えない)。0 は本当に 0。
const MIN_WAYS = 10;
const reachCache = new Map();   // 同じ面・同じ条件の総当たりは 1 回だけ (遅いので)
function reachable(i, view, env) {
  const key = i + ':' + (env ? JSON.stringify(env) : 'own');
  if (!reachCache.has(key)) reachCache.set(key, reachableUncached(i, view, env));
  return reachCache.get(key);
}
function reachableUncached(i, view, env) {
  const lv = Core.LEVELS[i];
  const foes = Core.makeFoes(i, () => 0);
  const hit = foes.map(() => 0);
  const enough = () => hit.every((n) => n >= MIN_WAYS);   // 全員が十分なら、数えるのをやめる (速くするため)
  search:
  for (const kind of Core.kindsIn(i)) {
    const blast = Core.AMMO[kind].blast;
    for (let deg = -150; deg <= -1; deg += 1) {
      for (let p = Core.MIN_POWER; p <= 1.0001; p += 0.02) {
        const aim = aimAt(deg, Math.min(1, p), view);
        const r = Core.simulateShot(lv.terrain, kind, aim, view, foes, 60, env || Core.envOf(i));
        if (r.type === 'direct') hit[r.target]++;
        if (r.type === 'ground') {
          foes.forEach((f, k) => { if (Core.inBlast(f, r.x, r.y, blast, view)) hit[k]++; });
        }
        if (r.type !== 'out' && enough()) break search;
      }
    }
  }
  return hit;
}


test('どの面のどの敵にも、当てられる撃ち方が十分ある (iPhone 16 Plus の画面で)', () => {
  const bad = [];
  for (let i = 0; i < Core.LEVELS.length; i++) {
    reachable(i, VIEW).forEach((n, k) => { if (n < MIN_WAYS) bad.push(`${i + 1}面の${k + 1}体目 (${n} 通り)`); });
  }
  assert.deepStrictEqual(bad, [], '当てにくい敵: ' + bad.join(', '));
});

test('面の数と景色: 6 面ごとに景色が変わり、景色の数ぶんある', () => {
  assert.strictEqual(Core.LEVELS.length, Core.SKIES.length * Core.PER_CHAPTER);
  assert.strictEqual(Core.skyOf(0).name, 'ゆうぐれ');
  assert.strictEqual(Core.skyOf(6).name, 'よる');
  assert.strictEqual(Core.skyOf(29).name, 'おしろ');
  assert.strictEqual(Core.skyOf(30).name, 'かぜ');
  assert.strictEqual(Core.skyOf(41).name, 'ほし');
});

test('どの面も、敵が地形の中に埋まっていない', () => {
  for (let i = 0; i < Core.LEVELS.length; i++) {
    const foes = Core.makeFoes(i, () => 0);
    foes.forEach((f, k) => {
      const inside = Core.solid(Core.LEVELS[i].terrain, f.x * VIEW.W, f.y * VIEW.H, VIEW);
      assert.ok(!inside, `${i + 1}面の${k + 1}体目が地形に埋まっている`);
    });
  }
});

test('ライフルはどの面にもあり、先の面ほど増える', () => {
  assert.strictEqual(Core.startingAmmo(0).r, 2);
  assert.strictEqual(Core.startingAmmo(10).r, 3);
  for (let i = 0; i < Core.LEVELS.length; i++) assert.ok(Core.kindsIn(i).includes('r'));
});

test('かぶとの敵: 爆風では 2 回、直撃なら 1 回で倒れる', () => {
  const f = { t: 'a', hp: 2, dead: false, ph: 0 };
  assert.strictEqual(Core.applyHit(f, 1, false), 'armor');
  assert.strictEqual(Core.applyHit(f, 1, false), 'killed');
  const g = { t: 'a', hp: 2, dead: false, ph: 0 };
  assert.strictEqual(Core.applyHit(g, 2, true), 'killed');
});

test('バリアの敵: 閉じている間は効かず、開いた瞬間だけ倒せる', () => {
  const closed = { t: 'sh', hp: 1, dead: false, ph: Core.SHIELD_OPEN + 0.1 };
  assert.strictEqual(Core.applyHit(closed, 2, true), 'blocked');
  assert.strictEqual(closed.dead, false);
  const open = { t: 'sh', hp: 1, dead: false, ph: Core.SHIELD_P * 3 + 0.1 };
  assert.strictEqual(Core.applyHit(open, 1, false), 'killed');
});

test('倒れた敵には、もう当たらない', () => {
  const f = { t: 'n', hp: 1, dead: false, ph: 0 };
  Core.applyHit(f, 1, false);
  assert.strictEqual(Core.applyHit(f, 1, false), 'none');
});

test('あるく敵は、決まった範囲の外へ出ない', () => {
  const f = Core.makeFoes(13, () => 0).find((e) => e.t === 'w');
  for (let n = 0; n < 2000; n++) {
    Core.moveFoe(f, 0.05);
    assert.ok(f.x >= f.x1 - 1e-9 && f.x <= f.x2 + 1e-9, `範囲の外: ${f.x}`);
  }
});

test('星: 残った弾 (ライフル以外) +1、最大 3。負けは 0', () => {
  assert.strictEqual(Core.starsFor(true, { n: 0, r: 5 }), 1);
  assert.strictEqual(Core.starsFor(true, { n: 1, b: 0, s: 0 }), 2);
  assert.strictEqual(Core.starsFor(true, { n: 3, b: 2 }), 3);
  assert.strictEqual(Core.starsFor(false, { n: 3 }), 0);
});

test('面は、ひとつ前をクリアすると開く', () => {
  const save = {};
  assert.ok(Core.isOpen(save, 0));
  assert.ok(!Core.isOpen(save, 1));
  assert.ok(Core.recordStars(save, 0, 1));
  assert.ok(Core.isOpen(save, 1));
});

test('星は良い方だけ残る', () => {
  const save = {};
  Core.recordStars(save, 0, 3);
  assert.strictEqual(Core.recordStars(save, 0, 1), false);
  assert.strictEqual(save[0], 3);
});

test('コマの間隔は負にならず、長すぎもしない', () => {
  assert.strictEqual(Core.frameDt(1000, 5000), 0);   // 1 コマ目で last が先に進んでいる
  assert.strictEqual(Core.frameDt(1000, 1000), 0);
  assert.strictEqual(Core.frameDt(2000, 1000), 0.05);
  assert.ok(Math.abs(Core.frameDt(1016, 1000) - 0.016) < 1e-9);
});

test('強さは引いた長さで決まり、下限と上限がある', () => {
  const m = Core.muzzle(VIEW);
  assert.strictEqual(Core.aimVec(m.x + 1, m.y, VIEW).power, Core.MIN_POWER);
  assert.strictEqual(Core.aimVec(m.x + 2000, m.y, VIEW).power, 1);
});

/** 前の点線の数え方 (1/50 秒きざみで 36 歩、4 歩ごとに 1 つ)。比べるためだけに残す。 */
function oldDotCount(terrain, kind, aim, view) {
  const v = Core.launchVelocity(kind, aim, view), m = Core.muzzle(view);
  const g = Core.AMMO[kind].gmul || 1, h = 1 / 50;
  let x = m.x, y = m.y, vx = v.vx, vy = v.vy, n = 0;
  for (let i = 0; i < 36; i++) {
    vy += Core.GRAV * g * view.H * h; x += vx * h; y += vy * h;
    if (Core.solid(terrain, x, y, view) || y > view.H * 1.1 || x > view.W * 1.15) break;
    if (i % 4 === 0 && i > 0) n++;
  }
  return n;
}

test('ねらいの点線: ふつうの弾は、前の倍くらいの点が出る', () => {
  const terrain = Core.LEVELS[0].terrain;
  for (const kind of ['n', 'b', 's']) {
    for (const [deg, p] of [[-60, 1], [-45, 0.7], [-75, 0.5], [-30, 0.9]]) {
      const aim = aimAt(deg, p, VIEW);
      const before = oldDotCount(terrain, kind, aim, VIEW);
      const now = Core.aimDots(terrain, kind, aim, VIEW).length;
      assert.ok(now >= before * 1.8 && now <= before * 2.3,
        `${kind} ${deg}° 強さ${p}: 前 ${before} → 今 ${now} (倍くらいのはず)`);
    }
  }
});

test('ねらいの点線: ライフルは点の間が 9px ほどで、ほぼ線に見える', () => {
  const terrain = Core.LEVELS[0].terrain;
  for (const [deg, p] of [[-10, 1], [-30, 0.6], [-5, 0.3]]) {
    const aim = aimAt(deg, p, VIEW);
    const dots = Core.aimDots(terrain, 'r', aim, VIEW);
    const before = oldDotCount(terrain, 'r', aim, VIEW);
    assert.ok(dots.length >= before * 4, `${deg}° 強さ${p}: 前 ${before} → 今 ${dots.length} (うんと増えるはず)`);
    let worst = 0;
    for (let i = 1; i < dots.length; i++) {
      worst = Math.max(worst, Math.hypot(dots[i].x - dots[i - 1].x, dots[i].y - dots[i - 1].y));
    }
    assert.ok(worst <= Core.AIM_DOT_PX + 3, `${deg}° 強さ${p}: いちばん広い間 ${worst.toFixed(1)}px`);
  }
});

test('ねらいの点線は、地形の中に点を打たない', () => {
  for (let i = 0; i < Core.LEVELS.length; i++) {
    const t = Core.LEVELS[i].terrain;
    for (const kind of ['n', 'r']) {
      for (const deg of [-80, -50, -20, -5]) {
        Core.aimDots(t, kind, aimAt(deg, 1, VIEW), VIEW, Core.envOf(i)).forEach((d) =>
          assert.ok(!Core.solid(t, d.x, d.y, VIEW), `${i + 1}面 ${kind} ${deg}°: 地形の中に点`));
      }
    }
  }
});

/* ========== かぜ・ゲート・タイトル ========== */
const WIND_LEVELS = [30, 31, 32, 33, 34, 35];
const GATE_LEVELS = [36, 37, 38, 39, 40, 41];

test('かぜ: 弾を横におし流す。向きは符号どおりで、かぜが無ければ流れない', () => {
  const run = (wx) => {
    const b = { x: 100, y: 100, vx: 0, vy: 0, gmul: 1, wx };
    for (let n = 0; n < 60; n++) Core.advance(b, 1 / 60, VIEW);
    return b;
  };
  assert.strictEqual(run(0).x, 100);
  assert.ok(run(0.4).x > 100 + 100, `右へ流れる: ${run(0.4).x}`);
  assert.ok(run(-0.4).x < 100 - 100, `左へ流れる: ${run(-0.4).x}`);
  assert.ok(Math.abs(run(0.4).y - run(0).y) < 1e-9, 'かぜは縦には効かない');
});

test('かぜの面は、かぜが 0 ではなく、点線もかぜで曲がる', () => {
  for (const i of WIND_LEVELS) {
    const w = Core.envOf(i).wind;
    assert.ok(Math.abs(w) >= 0.2 && Math.abs(w) <= 0.5, `${i + 1}面のかぜ: ${w}`);
    const t = Core.LEVELS[i].terrain;
    let aim = null;   // 近くのかべにぶつからず、点が十分出る撃ち方を探す
    for (let deg = -89; deg <= -40 && !aim; deg += 1) {
      const a = aimAt(deg, 1, VIEW);
      if (Core.aimDots(t, 'n', a, VIEW, { wind: 0, portals: [] }).length >= 12) aim = a;
    }
    assert.ok(aim, `${i + 1}面: 点線を比べられる撃ち方が無い`);
    const plain = Core.aimDots(t, 'n', aim, VIEW, { wind: 0, portals: [] });
    const windy = Core.aimDots(t, 'n', aim, VIEW, Core.envOf(i));
    const n = Math.min(plain.length, windy.length) - 1;   // 同じ番号の点どうしで比べる (終わる所は違いうる)
    assert.ok(n >= 8, `${i + 1}面: 点が少なくて比べられない (${n})`);
    assert.ok(Math.sign(windy[n].x - plain[n].x) === Math.sign(w), `${i + 1}面: 点線がかぜの向きに曲がる`);
  }
  assert.strictEqual(Core.envOf(0).wind, 0, 'ふつうの面にかぜは無い');
});

test('ゲート: 入口に入った弾は出口から出る。どちら向きでも使え、出た直後にまた吸われない', () => {
  const portals = [{ a: [0.3, 0.4], b: [0.8, 0.7] }];
  const b = { x: 0.3 * VIEW.W + 5, y: 0.4 * VIEW.H, vx: 100, vy: 0 };
  assert.ok(Core.usePortals(b, portals, VIEW), '入口で飛ぶ');
  assert.strictEqual(Math.round(b.x), Math.round(0.8 * VIEW.W));
  assert.strictEqual(Math.round(b.y), Math.round(0.7 * VIEW.H));
  assert.strictEqual(b.vx, 100, '速さはそのまま');
  assert.ok(!Core.usePortals(b, portals, VIEW), '出口にいる間は、また吸われない');
  b.x += VIEW.H * Core.PORTAL_R * 1.5;                       // 出口の輪から出る
  assert.ok(!Core.usePortals(b, portals, VIEW));
  assert.strictEqual(b.gate, null, '輪を出たら覚えを忘れる');
  const back = { x: 0.8 * VIEW.W, y: 0.7 * VIEW.H + 10, vx: 0, vy: 50 };
  assert.ok(Core.usePortals(back, portals, VIEW), '出口側から入っても、入口へ出る');
  assert.strictEqual(Math.round(back.x), Math.round(0.3 * VIEW.W));
  const far = { x: 10, y: 10, vx: 0, vy: 0 };
  assert.ok(!Core.usePortals(far, portals, VIEW), '離れていれば何も起きない');
});

test('ゲートの輪は、地形に重ならず、画面の中にある', () => {
  for (const i of GATE_LEVELS) {
    const t = Core.LEVELS[i].terrain, r = VIEW.H * Core.PORTAL_R;
    assert.ok(Core.LEVELS[i].portals.length >= 1, `${i + 1}面にゲートが無い`);
    for (const p of Core.LEVELS[i].portals) {
      for (const q of [p.a, p.b]) {
        assert.ok(q[0] > 0.05 && q[0] < 0.95 && q[1] > 0.1 && q[1] < 0.85, `${i + 1}面: 輪が画面のふちに近い (${q})`);
        for (let k = 0; k < 24; k++) {
          const a = k / 24 * Math.PI * 2;
          assert.ok(!Core.solid(t, q[0] * VIEW.W + Math.cos(a) * r, q[1] * VIEW.H + Math.sin(a) * r, VIEW),
            `${i + 1}面: ゲートの輪が地形に重なる (${q})`);
        }
      }
    }
  }
});

test('ゲートの面は、ゲートを使わないと当てられない敵がいる (ゲートが効いている)', () => {
  for (const i of GATE_LEVELS) {
    const without = reachable(i, VIEW, { wind: 0, portals: [] });
    assert.ok(without.some((n) => n === 0), `${i + 1}面: ゲートなしでも全員に当たってしまう (${without.join(',')})`);
  }
});

test('ゲートがあると、ゲートなしでは当たらない敵に当たる', () => {
  for (const i of GATE_LEVELS) {
    const without = reachable(i, VIEW, { wind: 0, portals: [] });
    const withGate = reachable(i, VIEW);
    without.forEach((n, k) => {
      if (n === 0) assert.ok(withGate[k] >= MIN_WAYS, `${i + 1}面の${k + 1}体目: ゲートを通して ${withGate[k]} 通りしか当たらない`);
    });
  }
});

test('タイトルの飾り: 敵は全部の種類が並び、地形に埋まらず、画面の中にある', () => {
  const foes = Core.foesFrom(Core.TITLE.enemies, () => 0);
  assert.deepStrictEqual([...new Set(foes.map((f) => f.t))].sort(), ['a', 'f', 'n', 'sh', 'w']);
  foes.forEach((f) => {
    assert.ok(!Core.solid(Core.TITLE.terrain, f.x * VIEW.W, f.y * VIEW.H, VIEW), `敵が地形に埋まる: ${f.t}`);
    assert.ok(f.x > 0.1 && f.x < 0.98 && f.y > 0.3, `画面の外: ${f.t} (${f.x}, ${f.y})`);
  });
});
