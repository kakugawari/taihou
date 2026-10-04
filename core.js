/*!
 * core.js — やまなりショットのロジック。DOM を触らないので node でテストできる。
 *
 * ブラウザでは <script> で読み込むと window.Core になり、node からは require() できる。
 *
 * 座標のきまり: 地形・敵の位置は 0〜1 の割合 (x は画面の幅、y は画面の高さに対して)。
 * 弾は px で動く。速さと重力は画面の高さ H を単位にする。
 * だから同じ面でも画面の縦横比で届き方が変わる。対象は iPhone 16 Plus (430 x 932) だけ。
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = factory();
  } else {
    root.Core = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ========== 地形・敵のヘルパー ========== */
  const G_Y = 0.885;
  const ground = (x1, x2, y = G_Y) => [[x1, y], [x2, y], [x2, 1.08], [x1, 1.08]];
  const slab = (x1, x2, y, t = 0.035) => [[x1, y], [x2, y], [x2, y + t], [x1, y + t]];
  const ramp = (x1, y1, x2, y2, t = 0.05) => [[x1, y1], [x2, y2], [x2, y2 + t], [x1, y1 + t]];
  const wall = (x, w, yTop, yBot = G_Y + 0.02) => [[x, yTop], [x + w, yTop], [x + w, yBot], [x, yBot]];

  /**
   * ほら穴: 天井と左右のかべで囲んだ空どう。床 (yFloor) より下は地面までうめる。
   * 敵がこもる。爆風はかべを通りぬけるので、かべの外面から約 105px (0.245 x 幅) は離すこと。
   * そうすると、外からは当てられず、ゲートで中に入れるしかなくなる。
   */
  const vault = (x1, x2, yFloor, yCeil, wt = 0.12, t = 0.12) => {
    const polys = [
      [[x1, yCeil - t], [x2, yCeil - t], [x2, yCeil], [x1, yCeil]],
      [[x1, yCeil - t], [x1 + wt, yCeil - t], [x1 + wt, yFloor + 0.02], [x1, yFloor + 0.02]],
      [[x2 - wt, yCeil - t], [x2, yCeil - t], [x2, yFloor + 0.02], [x2 - wt, yFloor + 0.02]]
    ];
    if (yFloor < G_Y - 0.001) polys.push([[x1, yFloor], [x2, yFloor], [x2, G_Y + 0.02], [x1, G_Y + 0.02]]);
    return polys;
  };

  const E = (x, y = G_Y) => ({ x, y, t: 'n' });                   // ふつう
  const EA = (x, y = G_Y) => ({ x, y, t: 'a' });                  // かぶと (直撃でないと倒せない)
  const EF = (x, y, amp = 0.06) => ({ x, y, t: 'f', amp });       // とぶ
  const EW = (x, y, x1, x2) => ({ x, y, t: 'w', x1, x2 });        // あるく
  const ES = (x, y = G_Y) => ({ x, y, t: 'sh' });                 // バリア (すきができた瞬間だけ倒せる)

  /* ========== ステージ ========== */
  const LEVELS = [
    { ammo: { n: 3 }, terrain: [ground(-0.1, 1.1)], enemies: [E(0.72)] },
    { ammo: { n: 3 }, terrain: [ground(-0.1, 1.1), slab(0.58, 0.88, 0.745)], enemies: [E(0.73, 0.745)] },
    { ammo: { n: 4 }, terrain: [ground(-0.1, 1.1), wall(0.42, 0.07, 0.705)], enemies: [E(0.66), E(0.90)] },
    { ammo: { n: 4 }, terrain: [ground(-0.1, 0.42), ramp(0.42, G_Y, 0.96, 0.68, 0.34)],
      enemies: [E(0.60, 0.816), E(0.88, 0.710)] },
    { ammo: { n: 2, b: 2 }, terrain: [ground(-0.1, 1.1), slab(0.34, 0.78, 0.585, 0.05), slab(0.62, 1.05, 0.785)],
      enemies: [E(0.86, 0.785), E(0.50)] },
    { ammo: { n: 3 }, terrain: [ground(-0.1, 1.1), wall(0.40, 0.08, 0.655), slab(0.62, 0.97, 0.725)],
      enemies: [E(0.82, 0.725)] },

    { ammo: { n: 4 }, terrain: [ground(-0.1, 1.1), slab(0.50, 0.78, 0.765), slab(0.68, 0.98, 0.635)],
      enemies: [E(0.58, 0.765), EA(0.88, 0.635), E(0.30)] },
    { ammo: { n: 4 }, terrain: [ground(-0.1, 1.1), slab(0.34, 0.56, 0.805), slab(0.56, 0.78, 0.725), slab(0.78, 1.0, 0.645)],
      enemies: [E(0.45, 0.805), E(0.67, 0.725), E(0.90, 0.645)] },
    { ammo: { n: 2, s: 2 }, terrain: [ground(-0.1, 1.1), wall(0.44, 0.06, 0.675), wall(0.78, 0.06, 0.675)],
      enemies: [E(0.58), E(0.68)] },
    { ammo: { n: 3 }, terrain: [ground(-0.1, 0.34), ramp(0.34, G_Y, 0.60, 0.70, 0.34), slab(0.60, 1.08, 0.70, 0.34)],
      enemies: [E(0.70, 0.70), E(0.80, 0.70), E(0.90, 0.70)] },
    { ammo: { n: 4 }, terrain: [ground(-0.1, 1.1), wall(0.34, 0.07, 0.695), slab(0.52, 0.74, 0.745), slab(0.82, 1.04, 0.645)],
      enemies: [E(0.63, 0.745), EA(0.93, 0.645), E(0.46)] },
    { ammo: { n: 5 }, terrain: [ground(-0.1, 1.1), wall(0.36, 0.06, 0.625), slab(0.48, 0.70, 0.785), slab(0.62, 0.86, 0.695), slab(0.82, 1.04, 0.595)],
      enemies: [E(0.55, 0.785), E(0.75, 0.695), E(0.93, 0.595), E(0.44), E(0.26)] },

    { ammo: { n: 3, b: 1 }, terrain: [ground(-0.1, 1.1)], enemies: [EF(0.70, 0.62, 0.07), E(0.88)] },
    { ammo: { n: 4 }, terrain: [ground(-0.1, 1.1), slab(0.45, 0.98, 0.70)],
      enemies: [EW(0.70, 0.70, 0.48, 0.95), E(0.30)] },
    { ammo: { n: 2, s: 2 }, terrain: [ground(-0.1, 1.1), wall(0.45, 0.07, 0.665)],
      enemies: [E(0.62), E(0.72), E(0.82)] },
    { ammo: { n: 3, b: 2 }, terrain: [ground(-0.1, 1.1), slab(0.30, 0.92, 0.60, 0.05), wall(0.88, 0.08, 0.60)],
      enemies: [E(0.68), EA(0.79)] },
    { ammo: { n: 4 }, terrain: [ground(-0.1, 1.1), wall(0.35, 0.06, 0.715), wall(0.56, 0.06, 0.645), wall(0.77, 0.06, 0.575)],
      enemies: [E(0.38, 0.715), E(0.59, 0.645), E(0.80, 0.575)] },
    { ammo: { n: 5 }, terrain: [ground(-0.1, 1.1), slab(0.50, 0.75, 0.745), slab(0.80, 1.04, 0.605)],
      enemies: [EA(0.62, 0.745), EF(0.88, 0.48, 0.06), E(0.35), E(0.96, 0.605)] },

    { ammo: { n: 3, s: 2 }, terrain: [ground(-0.1, 1.1), slab(0.25, 0.70, 0.555, 0.05), slab(0.72, 1.08, 0.72, 0.34)],
      enemies: [E(0.50), EA(0.62), E(0.86, 0.72)] },
    { ammo: { n: 4, b: 2 }, terrain: [ground(-0.1, 1.1), slab(0.30, 0.50, 0.625), slab(0.52, 0.74, 0.705), slab(0.76, 1.04, 0.785)],
      enemies: [E(0.40, 0.625), EW(0.62, 0.705, 0.55, 0.72), E(0.90, 0.785)] },
    { ammo: { n: 5 }, terrain: [ground(-0.1, 1.1), slab(0.40, 0.62, 0.705), slab(0.70, 0.96, 0.555)],
      enemies: [EF(0.55, 0.44, 0.07), E(0.50, 0.705), EA(0.83, 0.555), E(0.26)] },
    { ammo: { n: 4, s: 2 }, terrain: [ground(-0.1, 1.1), wall(0.40, 0.06, 0.615), wall(0.80, 0.06, 0.545)],
      enemies: [E(0.52), E(0.62), E(0.72), E(0.92)] },
    { ammo: { n: 5, b: 2 }, terrain: [ground(-0.1, 0.30), ramp(0.30, G_Y, 0.55, 0.66, 0.40), slab(0.55, 1.08, 0.66, 0.40)],
      enemies: [EW(0.75, 0.66, 0.58, 1.0), EA(0.92, 0.66), E(0.62, 0.66), EF(0.44, 0.50, 0.05)] },
    { ammo: { n: 4, s: 2, b: 2 }, terrain: [ground(-0.1, 1.1), wall(0.34, 0.06, 0.615), slab(0.46, 0.68, 0.775), slab(0.62, 0.86, 0.685), slab(0.82, 1.04, 0.575)],
      enemies: [E(0.54, 0.775), EA(0.74, 0.685), EW(0.92, 0.575, 0.84, 1.0), EF(0.58, 0.42, 0.06), E(0.42), E(0.28)] },

    { ammo: { n: 3 }, terrain: [ground(-0.1, 1.1), wall(0.42, 0.10, 0.665)],
      enemies: [ES(0.50, 0.665), E(0.82)] },
    { ammo: { n: 4 }, terrain: [ground(-0.1, 1.1), wall(0.34, 0.09, 0.705), wall(0.62, 0.09, 0.585)],
      enemies: [ES(0.385, 0.705), E(0.665, 0.585), EF(0.85, 0.46, 0.06)] },
    { ammo: { n: 4 }, terrain: [ground(-0.1, 1.1), slab(0.40, 0.90, 0.635)],
      enemies: [ES(0.52, 0.635), EA(0.70, 0.635), E(0.86, 0.635)] },
    { ammo: { n: 3, b: 2 }, terrain: [ground(-0.1, 1.1), wall(0.30, 0.08, 0.615), slab(0.46, 0.94, 0.705)],
      enemies: [ES(0.60, 0.705), EW(0.80, 0.705, 0.70, 0.90), E(0.26)] },
    { ammo: { n: 4, s: 2 }, terrain: [ground(-0.1, 1.1), slab(0.34, 0.58, 0.745), slab(0.62, 0.86, 0.605)],
      enemies: [ES(0.44, 0.745), ES(0.72, 0.605), E(0.90, 0.605), E(0.27)] },
    { ammo: { n: 5, b: 1, s: 1 }, terrain: [ground(-0.1, 1.1), wall(0.30, 0.08, 0.555), slab(0.42, 0.62, 0.705), slab(0.66, 0.90, 0.635), wall(0.90, 0.08, 0.585)],
      enemies: [ES(0.335, 0.555), EA(0.50, 0.705), EF(0.75, 0.50, 0.07), ES(0.94, 0.585), E(0.26)] },

    /* ---- ゲート (入った弾は、もうひとつのゲートから出る) ---- */
    { ammo: { n: 3 }, terrain: [ground(-0.1, 1.1), ...vault(0.50, 1.04, G_Y, 0.62)],
      portals: [{ a: [0.36, 0.64], b: [0.73, 0.73] }],
      enemies: [E(0.77), E(0.34)] },
    { ammo: { n: 4 }, terrain: [ground(-0.1, 1.1), ...vault(0.54, 1.06, 0.74, 0.56)],
      portals: [{ a: [0.40, 0.64], b: [0.80, 0.67] }],
      enemies: [E(0.80, 0.74), E(0.38)] },
    { ammo: { n: 4, b: 1 }, terrain: [ground(-0.1, 1.1), ...vault(0.42, 1.10, G_Y, 0.60)],
      portals: [{ a: [0.32, 0.64], b: [0.68, 0.71] }],
      enemies: [E(0.76), EA(0.30)] },
    { ammo: { n: 4, s: 1 }, terrain: [ground(-0.1, 1.1), ...vault(0.52, 1.08, 0.70, 0.52)],
      portals: [{ a: [0.40, 0.64], b: [0.76, 0.63] }],
      enemies: [E(0.80, 0.70), EA(0.36)] },
    { ammo: { n: 4, b: 2 }, terrain: [ground(-0.1, 1.1), ...vault(0.46, 1.08, G_Y, 0.58)],
      portals: [{ a: [0.36, 0.64], b: [0.69, 0.69] }],
      enemies: [E(0.77), ES(0.32), EF(0.62, 0.40, 0.06)] },
    { ammo: { n: 4, b: 1, s: 1 }, terrain: [ground(-0.1, 1.1), ...vault(0.48, 1.10, G_Y, 0.58)],
      portals: [{ a: [0.36, 0.64], b: [0.71, 0.69] }, { a: [0.55, 0.30], b: [0.18, 0.50] }],
      enemies: [E(0.79), EA(0.40), EW(0.20, G_Y, 0.16, 0.30)] },

    /* ---- そら: ゲートの出口をいろいろな所へ (ゆかに近い出口・高い塔・かぶと・バリア・あるく・とぶ) ---- */
    { ammo: { n: 3 }, terrain: [ground(-0.1, 1.1), ...vault(0.50, 1.04, G_Y, 0.62)],
      portals: [{ a: [0.40, 0.64], b: [0.74, 0.81] }],
      enemies: [E(0.78), E(0.30)] },
    { ammo: { n: 4 }, terrain: [ground(-0.1, 1.1), ...vault(0.50, 1.06, 0.72, 0.52)],
      portals: [{ a: [0.40, 0.64], b: [0.74, 0.63] }],
      enemies: [E(0.76, 0.72), E(0.80, 0.72), E(0.34)] },
    { ammo: { n: 4, b: 1 }, terrain: [ground(-0.1, 1.1), ...vault(0.46, 1.08, G_Y, 0.58)],
      portals: [{ a: [0.32, 0.64], b: [0.69, 0.69] }],
      enemies: [EA(0.77), E(0.34)] },
    { ammo: { n: 4, s: 1 }, terrain: [ground(-0.1, 1.1), ...vault(0.50, 1.04, G_Y, 0.62)],
      portals: [{ a: [0.32, 0.64], b: [0.73, 0.73] }],
      enemies: [ES(0.77), E(0.32)] },
    { ammo: { n: 4, b: 1 }, terrain: [ground(-0.1, 1.1), ...vault(0.50, 1.04, G_Y, 0.62)],
      portals: [{ a: [0.36, 0.64], b: [0.72, 0.73] }],
      enemies: [EW(0.80, G_Y, 0.76, 0.84), E(0.30)] },
    { ammo: { n: 4, b: 2 }, terrain: [ground(-0.1, 1.1), ...vault(0.46, 1.08, G_Y, 0.52)],
      portals: [{ a: [0.36, 0.64], b: [0.74, 0.63] }],
      enemies: [EF(0.78, 0.68, 0.05), E(0.34)] },

    /* ---- ぎんが: ゲートが 2 組の面 (ほら穴と、天井の上) と、ほら穴に 2 体 ---- */
    { ammo: { n: 4, b: 1, s: 1 }, terrain: [ground(-0.1, 1.1), ...vault(0.46, 1.08, G_Y, 0.60)],
      portals: [{ a: [0.32, 0.64], b: [0.69, 0.71] },
        { a: [0.24, 0.44], b: [0.64, 0.30] }],
      enemies: [E(0.77), E(0.80, 0.48), E(0.30)] },
    { ammo: { n: 4, b: 1, s: 1 }, terrain: [ground(-0.1, 1.1), ...vault(0.50, 1.06, 0.66, 0.46)],
      portals: [{ a: [0.40, 0.64], b: [0.74, 0.57] }],
      enemies: [E(0.78, 0.66), EA(0.36), ES(0.22)] },
    { ammo: { n: 5, b: 1, s: 1 }, terrain: [ground(-0.1, 1.1), ...vault(0.44, 1.10, G_Y, 0.58)],
      portals: [{ a: [0.32, 0.64], b: [0.67, 0.66] }],
      enemies: [EA(0.74), ES(0.84), E(0.30)] },
    { ammo: { n: 5, b: 1, s: 1 }, terrain: [ground(-0.1, 1.1), ...vault(0.44, 1.10, G_Y, 0.50)],
      portals: [{ a: [0.28, 0.64], b: [0.67, 0.61] }],
      enemies: [EW(0.80, G_Y, 0.74, 0.84), EF(0.78, 0.62, 0.05), E(0.30)] },
    { ammo: { n: 5, b: 1, s: 1 }, terrain: [ground(-0.1, 1.1), ...vault(0.46, 1.08, G_Y, 0.60)],
      portals: [{ a: [0.32, 0.64], b: [0.69, 0.71] },
        { a: [0.24, 0.44], b: [0.64, 0.30] }],
      enemies: [E(0.77), EA(0.80, 0.48), EW(0.24, G_Y, 0.18, 0.34)] },
    { ammo: { n: 5, b: 2, s: 2 }, terrain: [ground(-0.1, 1.1), ...vault(0.44, 1.10, G_Y, 0.60)],
      portals: [{ a: [0.32, 0.64], b: [0.68, 0.71] },
        { a: [0.24, 0.44], b: [0.66, 0.30] }],
      enemies: [E(0.76), EA(0.84), ES(0.82, 0.48), EA(0.38), EW(0.22, G_Y, 0.16, 0.34)] },

    /* ---- かぜ (かぜが弾を横におし流す。+ は右向き) ---- */
    { wind: 0.30, ammo: { n: 3 }, terrain: [ground(-0.1, 1.1), wall(0.46, 0.07, 0.70)],
      enemies: [E(0.70), E(0.90)] },
    { wind: -0.35, ammo: { n: 4 }, terrain: [ground(-0.1, 1.1), slab(0.55, 0.95, 0.72)],
      enemies: [E(0.62, 0.72), E(0.84, 0.72), E(0.40)] },
    { wind: 0.45, ammo: { n: 3, b: 2 }, terrain: [ground(-0.1, 1.1), wall(0.30, 0.08, 0.60), wall(0.62, 0.07, 0.66)],
      enemies: [E(0.45), E(0.78), EA(0.90)] },
    { wind: -0.50, ammo: { n: 4, s: 2 }, terrain: [ground(-0.1, 1.1), slab(0.40, 0.70, 0.70), slab(0.72, 1.04, 0.60)],
      enemies: [E(0.52, 0.70), ES(0.86, 0.60), EF(0.62, 0.45, 0.06)] },
    { wind: 0.35, ammo: { n: 4 }, terrain: [ground(-0.1, 1.1), wall(0.50, 0.08, 0.58)],
      enemies: [EF(0.72, 0.40, 0.07), EW(0.80, G_Y, 0.62, 0.95), E(0.30)] },
    { wind: -0.20, ammo: { n: 4, b: 2, s: 2 }, terrain: [ground(-0.1, 1.1), wall(0.34, 0.06, 0.62), slab(0.50, 0.74, 0.76), slab(0.80, 1.04, 0.60)],
      enemies: [E(0.60, 0.76), EA(0.88, 0.60), ES(0.37, 0.62), EF(0.70, 0.44, 0.06)] }
  ];
  const PER_CHAPTER = 6;

  /** タイトル画面に飾る景色。ゲームの中身をそのまま並べる (敵は全部の種類)。 */
  const TITLE = {
    terrain: [ground(-0.1, 1.1), slab(0.40, 0.62, 0.80, 0.12), slab(0.66, 1.08, 0.72, 0.34)],
    enemies: [E(0.27), E(0.46, 0.80), EA(0.57, 0.80), ES(0.74, 0.72), EW(0.87, 0.72, 0.80, 0.94), EF(0.90, 0.54, 0.05)]
  };

  /* ========== 空の景色 (6 面ごとに変わる) ========== */
  const SKIES = [
    { name: 'ゆうぐれ', sky: ['#241041', '#4B2159', '#9A3F52', '#DE7239', '#F7B95F'],
      mts: ['rgba(78,38,84,.55)', 'rgba(54,26,68,.72)', 'rgba(36,18,52,.92)'],
      land: '#1B0E2C', edge: 'rgba(255,178,77,.6)', orb: { x: .74, y: .40, c: '#FFE9B0', g: '255,170,80' }, stars: 0 },
    { name: 'よる', sky: ['#070A22', '#121942', '#26265C', '#48295F', '#78395F'],
      mts: ['rgba(40,48,96,.5)', 'rgba(26,30,68,.72)', 'rgba(12,14,40,.94)'],
      land: '#0A0A1E', edge: 'rgba(160,200,255,.5)', orb: { x: .74, y: .26, c: '#EAF2FF', g: '150,190,255' }, stars: 70 },
    { name: 'あさ', sky: ['#16305E', '#3B68A6', '#8AACD8', '#F0C3AE', '#FFE3BA'],
      mts: ['rgba(110,140,190,.5)', 'rgba(62,86,134,.7)', 'rgba(26,38,72,.92)'],
      land: '#16223C', edge: 'rgba(255,245,225,.6)', orb: { x: .70, y: .45, c: '#FFF8E4', g: '255,230,190' }, stars: 0, clouds: 1 },
    { name: 'あらし', sky: ['#12111C', '#221D33', '#392A45', '#563849', '#7C5354'],
      mts: ['rgba(92,80,110,.45)', 'rgba(58,48,72,.7)', 'rgba(24,20,34,.94)'],
      land: '#12101C', edge: 'rgba(206,196,255,.5)', orb: null, stars: 0, rain: 1 },
    { name: 'おしろ', sky: ['#121634', '#232C62', '#434A8A', '#8A6C9C', '#E6B49C'],
      mts: ['rgba(88,96,150,.45)', 'rgba(56,62,110,.7)', 'rgba(30,34,66,.95)'],
      land: '#262B42', edge: 'rgba(236,226,206,.6)', orb: { x: .84, y: .17, c: '#F4F1E6', g: '200,210,255' }, stars: 40, castle: 1 },
    { name: 'ほし', sky: ['#05030F', '#150B33', '#2C1459', '#5A2A7A', '#B04A82'],
      mts: ['rgba(110,60,150,.4)', 'rgba(70,36,110,.65)', 'rgba(30,14,56,.94)'],
      land: '#0D0620', edge: 'rgba(180,255,244,.65)', orb: { x: .26, y: .22, c: '#FFD9F2', g: '255,150,230' }, stars: 120 },
        { name: 'そら', sky: ['#0E2A4A', '#1F5A82', '#58A6B8', '#B9DCC0', '#F4EBC0'],
      mts: ['rgba(70,140,160,.5)', 'rgba(40,96,122,.7)', 'rgba(16,52,72,.92)'],
      land: '#0F2A38', edge: 'rgba(255,248,214,.65)', orb: { x: .72, y: .30, c: '#FFFBE6', g: '255,244,200' }, stars: 0, clouds: 1 },
    { name: 'ぎんが', sky: ['#030A1A', '#0B2450', '#1B4F86', '#2C8FA0', '#9BE5C0'],
      mts: ['rgba(40,110,150,.4)', 'rgba(22,70,110,.65)', 'rgba(8,28,56,.94)'],
      land: '#07142A', edge: 'rgba(150,255,230,.65)', orb: { x: .30, y: .24, c: '#D6F8FF', g: '120,230,255' }, stars: 140 },
    { name: 'かぜ', sky: ['#22334A', '#3C6B6F', '#7FAF8F', '#D8D6A0', '#F7E7B0'],
      mts: ['rgba(90,140,110,.5)', 'rgba(50,100,80,.7)', 'rgba(20,50,40,.92)'],
      land: '#17301F', edge: 'rgba(255,250,200,.65)', orb: { x: .68, y: .34, c: '#FFF3C4', g: '255,226,150' }, stars: 0, clouds: 1 }
  ];
  const skyOf = (i) => SKIES[Math.min(SKIES.length - 1, Math.floor(i / PER_CHAPTER))];

  /* ========== 弾の種類 ========== */
  const AMMO = {
    n: { nm: '大砲', c: '#FFF6D8', glow: '#FFB24D', blast: 0.084 },
    b: { nm: 'はねる', c: '#9EF3D0', glow: '#3FD6A0', blast: 0.076 },
    s: { nm: 'さくれつ', c: '#FFC46B', glow: '#FF8A4C', blast: 0.058 },
    r: { nm: 'ライフル', c: '#BFE8FF', glow: '#4FB3FF', blast: 0.048,
      vmul: 1.55, gmul: 0.58, maxAir: 3, barrelLen: 1.55, barrelWidth: 0.55 }
  };
  const ORDER = ['n', 'b', 's', 'r'];
  const CORE_KINDS = ['n', 'b', 's'];            // 星の数に数える弾 (ライフルは数えない)
  const rifleFor = (i) => 2 + Math.floor(i / 10); // どの面でも使える連射武器

  /* ========== 物理 ========== */
  const GUN = { x: 0.115, y: G_Y };
  const GRAV = 2.10;    // H/秒²
  const VMAX = 1.45;    // H/秒
  const MAXDRAG = 0.30; // この長さ (H に対する割合) 引くと最大の強さ
  const MIN_POWER = 0.26;
  const ER = 0.026;     // 敵の半径 (H に対する割合)
  const DIRECT_R = ER + 0.012;  // 弾がここまで近づいたら直撃
  const SUBSTEPS = 7;

  function muzzle(view) {
    return { x: view.W * GUN.x, y: view.H * GUN.y - view.H * 0.030 };
  }

  /** 指の位置から、撃つ向きと強さを出す。 */
  function aimVec(aimX, aimY, view) {
    const m = muzzle(view);
    const dx = aimX - m.x;
    const dy = aimY - m.y;
    const d = Math.hypot(dx, dy) || 1;
    return {
      ux: dx / d, uy: dy / d,
      power: Math.min(1, Math.max(MIN_POWER, d / (view.H * MAXDRAG))),
      ang: Math.atan2(dy, dx)
    };
  }

  /** 撃ち出す速さ (px/秒)。 */
  function launchVelocity(kind, aim, view) {
    const vmul = AMMO[kind].vmul || 1;
    const s = aim.power * VMAX * vmul * view.H;
    return { vx: aim.ux * s, vy: aim.uy * s };
  }

  /**
   * 弾を h 秒ぶん進める (重力つき)。
   * b.wx があれば、かぜ (横向きの加速。H/秒²。+ は右) でおし流される。
   */
  function advance(b, h, view) {
    b.vy += GRAV * (b.gmul || 1) * view.H * h;
    if (b.wx) b.vx += b.wx * view.H * h;
    b.x += b.vx * h;
    b.y += b.vy * h;
    b.life = (b.life || 0) + h;
  }

  function inPoly(px, py, poly, view) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0] * view.W, yi = poly[i][1] * view.H;
      const xj = poly[j][0] * view.W, yj = poly[j][1] * view.H;
      if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) c = !c;
    }
    return c;
  }
  const solid = (terrain, px, py, view) => terrain.some((p) => inPoly(px, py, p, view));

  /*
   * ゲート: 2 つで 1 組。入った弾は、もう一方から同じ速さのまま出る (どちら向きにも使える)。
   * 出た直後にまた吸われないよう、b.gate に出口を覚えて、出口の輪を出るまで無視する。
   * @returns {boolean} 飛ばしたら true
   */
  const PORTAL_R = 0.045;   // 輪の半径 (H に対する割合)
  function usePortals(b, portals, view) {
    if (!portals || !portals.length) return false;
    const r = view.H * PORTAL_R;
    if (b.gate) {
      if (Math.hypot(b.x - b.gate.x, b.y - b.gate.y) > r * 1.1) b.gate = null;
      else return false;
    }
    for (const p of portals) {
      for (const [from, to] of [[p.a, p.b], [p.b, p.a]]) {
        if (Math.hypot(from[0] * view.W - b.x, from[1] * view.H - b.y) < r) {
          b.x = to[0] * view.W; b.y = to[1] * view.H;
          b.gate = { x: b.x, y: b.y };
          return true;
        }
      }
    }
    return false;
  }

  const outOfBounds = (b, view) =>
    b.x < -view.W * 0.25 || b.x > view.W * 1.25 || b.y > view.H * 1.25 || b.life > 9;

  /**
   * 1 発を最後まで飛ばして、どこで止まるかを返す (はね返り・割れ・他の敵は考えない)。
   * targets を渡すと、直撃したときにその番号も返す。
   * @returns {{type:'direct'|'ground'|'out', x:number, y:number, target?:number, path:number[][]}}
   */
  function simulateShot(terrain, kind, aim, view, targets, fps, env) {
    const v = launchVelocity(kind, aim, view);
    const m = muzzle(view);
    const e = env || {};
    const b = { x: m.x, y: m.y, vx: v.vx, vy: v.vy, gmul: AMMO[kind].gmul || 1, life: 0, wx: e.wind || 0 };
    const h = 1 / (fps || 60) / SUBSTEPS;
    const path = [];
    const list = targets || [];
    for (let n = 0; n < 60 * SUBSTEPS * 10; n++) {
      advance(b, h, view);
      if (usePortals(b, e.portals, view)) path.push(null);   // null は飛んだ印 (線をつながない)
      if (n % SUBSTEPS === 0) path.push([b.x, b.y]);
      for (let t = 0; t < list.length; t++) {
        if (Math.hypot(list[t].x * view.W - b.x, list[t].y * view.H - b.y) < view.H * DIRECT_R) {
          return { type: 'direct', x: b.x, y: b.y, target: t, path };
        }
      }
      if (solid(terrain, b.x, b.y, view)) return { type: 'ground', x: b.x, y: b.y, path };
      if (outOfBounds(b, view)) return { type: 'out', x: b.x, y: b.y, path };
    }
    return { type: 'out', x: b.x, y: b.y, path };
  }

  /*
   * ねらうときに出す点線。
   *  - ふつうの弾: 飛ぶ時間 AIM_DOT_T 秒ごとに 1 つ
   *  - ライフル: 速いので時間で打つと間が空きすぎる。道のり AIM_DOT_PX ごとに 1 つ (ほぼ線に見える)
   * どちらも AIM_TIME 秒ぶん先まで。地形に当たるか画面の外へ出たらやめる。
   * k は先へ行くほど 0 に近づく (薄く・小さく描くため)。
   */
  const AIM_TIME = 0.72, AIM_DOT_T = 0.04, AIM_DOT_PX = 9;
  function aimDots(terrain, kind, aim, view, env) {
    const v = launchVelocity(kind, aim, view);
    const m = muzzle(view);
    const e = env || {};
    const b = { x: m.x, y: m.y, vx: v.vx, vy: v.vy, gmul: AMMO[kind].gmul || 1, life: 0, wx: e.wind || 0 };
    const byDistance = kind === 'r';
    const h = 1 / 400;
    const dots = [];
    let run = 0, nextT = AIM_DOT_T;
    for (let t = 0; t < AIM_TIME; t += h) {
      const px = b.x, py = b.y;
      advance(b, h, view);
      if (usePortals(b, e.portals, view)) run = 0;
      else run += Math.hypot(b.x - px, b.y - py);
      if (solid(terrain, b.x, b.y, view) || b.y > view.H * 1.1 || b.x > view.W * 1.15) break;
      const due = byDistance ? run >= AIM_DOT_PX : b.life >= nextT - 1e-9;
      if (due) {
        dots.push({ x: b.x, y: b.y, k: 1 - b.life / AIM_TIME });
        run = 0;
        nextT += AIM_DOT_T;
      }
    }
    return dots;
  }

  /* ========== 敵 ========== */
  const SHIELD_P = 2.4, SHIELD_OPEN = 0.75, SHIELD_WARN = 0.4;   // 周期・開いている時間・予告時間
  const shieldOpen = (ph) => (ph % SHIELD_P) < SHIELD_OPEN;

  /** 面の敵を、動かせる形にして返す。y は足もとではなく体の中心。 */
  const makeFoes = (i, rnd) => foesFrom(LEVELS[i].enemies, rnd);
  function foesFrom(enemies, rnd) {
    const random = rnd || Math.random;
    return enemies.map((e) => ({
      bx: e.x, by: e.y - ER, x: e.x, y: e.y - ER, t: e.t, hp: e.t === 'a' ? 2 : 1, dead: false,
      amp: e.amp || 0, x1: e.x1, x2: e.x2, dir: 1, ph: random() * 6, flashT: 0
    }));
  }

  /** 敵を dt 秒ぶん動かす。 */
  function moveFoe(f, dt) {
    f.ph += dt;
    if (f.flashT > 0) f.flashT -= dt;
    if (f.t === 'f') f.y = f.by + Math.sin(f.ph * 1.5) * f.amp;
    if (f.t === 'w') {
      f.x += f.dir * dt * 0.07;
      if (f.x > f.x2) { f.x = f.x2; f.dir = -1; }
      if (f.x < f.x1) { f.x = f.x1; f.dir = 1; }
    }
  }

  /**
   * 敵に当たったときの決まり。
   *  - バリア: 閉じている間は効かない
   *  - かぶと: 爆風 (直撃でない) はかぶとを割るだけ。2 回目で倒れる
   * @returns {'blocked'|'armor'|'hurt'|'killed'|'none'}
   */
  function applyHit(f, amt, direct) {
    if (f.dead) return 'none';
    if (f.t === 'sh' && !shieldOpen(f.ph)) { f.flashT = 0.22; return 'blocked'; }
    if (f.t === 'a' && !direct && amt < 2) {
      f.hp -= 1;
      f.flashT = 0.3;
      if (f.hp > 0) return 'armor';
    } else {
      f.hp -= amt;
    }
    if (f.hp <= 0) { f.dead = true; return 'killed'; }
    return 'hurt';
  }

  /** 爆風が届くか (敵の中心から、爆風の半径 + 体の半分)。 */
  const inBlast = (f, px, py, blast, view) =>
    Math.hypot(f.x * view.W - px, f.y * view.H - py) < view.H * blast + view.H * ER * 0.5;

  /* ========== 弾の数と星 ========== */
  function startingAmmo(i) {
    const a = Object.assign({}, LEVELS[i].ammo);
    a.r = rifleFor(i);
    return a;
  }
  const envOf = (i) => ({ wind: LEVELS[i].wind || 0, portals: LEVELS[i].portals || [] });
  const kindsIn = (i) => ORDER.filter((k) => LEVELS[i].ammo[k] || k === 'r');
  const coreLeft = (ammo) => CORE_KINDS.reduce((a, k) => a + (ammo[k] || 0), 0);
  const totalLeft = (ammo) => ORDER.reduce((a, k) => a + (ammo[k] || 0), 0);
  /** 勝ったときの星: 残った弾 (ライフル以外) +1、最大 3。 */
  const starsFor = (win, ammo) => (win ? Math.min(3, coreLeft(ammo) + 1) : 0);

  /** その面を選べるか: 1 面目か、ひとつ前をクリアしていれば開く。 */
  const isOpen = (save, i) => i === 0 || (save[i - 1] || 0) > 0;

  /** 星は良い方だけ残す。変わったときだけ true。 */
  function recordStars(save, i, stars) {
    if ((save[i] || 0) >= stars) return false;
    save[i] = stars;
    return true;
  }

  /**
   * コマの間隔 (秒)。上も下も止める。
   * 1 コマ目は負になることがある。負を通すと全部が逆に動き、画面の外へ飛ぶ。
   */
  function frameDt(now, last, max) {
    const d = (now - last) / 1000;
    if (!(d > 0)) return 0;
    return Math.min(max || 0.05, d);
  }

  return {
    G_Y, LEVELS, PER_CHAPTER, TITLE, vault, SKIES, skyOf, AMMO, ORDER, CORE_KINDS, rifleFor,
    GUN, GRAV, VMAX, MAXDRAG, MIN_POWER, ER, DIRECT_R, SUBSTEPS,
    muzzle, aimVec, launchVelocity, advance, inPoly, solid, outOfBounds, simulateShot,
    AIM_TIME, AIM_DOT_T, AIM_DOT_PX, aimDots, PORTAL_R, usePortals, envOf, foesFrom,
    SHIELD_P, SHIELD_OPEN, SHIELD_WARN, shieldOpen, makeFoes, moveFoe, applyHit, inBlast,
    startingAmmo, kindsIn, coreLeft, totalLeft, starsFor, isOpen, recordStars, frameDt
  };
});
