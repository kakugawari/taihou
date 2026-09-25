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
 * その面で、それぞれの敵に「当てられる撃ち方」があるかを総当たりで探す。
 * 直撃するか、爆風が届く所に落ちれば当てられたとみなす。
 * @returns {boolean[]} 敵ごとに当てられるか
 */
function reachable(i, view) {
  const lv = Core.LEVELS[i];
  const foes = Core.makeFoes(i, () => 0);
  const hit = foes.map(() => false);
  for (const kind of Core.kindsIn(i)) {
    const blast = Core.AMMO[kind].blast;
    for (let deg = -150; deg <= -1 && hit.includes(false); deg += 1) {
      for (let p = Core.MIN_POWER; p <= 1.0001; p += 0.02) {
        const aim = aimAt(deg, Math.min(1, p), view);
        const r = Core.simulateShot(lv.terrain, kind, aim, view, foes, 60);
        if (r.type === 'direct') hit[r.target] = true;
        if (r.type === 'ground') {
          foes.forEach((f, k) => { if (Core.inBlast(f, r.x, r.y, blast, view)) hit[k] = true; });
        }
      }
    }
  }
  return hit;
}

test('どの面のどの敵にも、当てられる撃ち方がある (iPhone 16 Plus の画面で)', () => {
  const bad = [];
  for (let i = 0; i < Core.LEVELS.length; i++) {
    reachable(i, VIEW).forEach((ok, k) => { if (!ok) bad.push(`${i + 1}面の${k + 1}体目`); });
  }
  assert.deepStrictEqual(bad, [], '当てられない敵: ' + bad.join(', '));
});

test('面の数と景色: 6 面ごとに景色が変わり、景色の数ぶんある', () => {
  assert.strictEqual(Core.LEVELS.length, Core.SKIES.length * Core.PER_CHAPTER);
  assert.strictEqual(Core.skyOf(0).name, 'ゆうぐれ');
  assert.strictEqual(Core.skyOf(6).name, 'よる');
  assert.strictEqual(Core.skyOf(29).name, 'おしろ');
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
