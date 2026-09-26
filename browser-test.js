/*
 * ブラウザで実際に動かして確かめるテスト。
 *
 *   npm i -D playwright && npm run test:ui
 *
 * 画面まわりの不具合は node のテストでは捕まらない。ここでは本物の
 * ブラウザを立ち上げ、指の操作 (押して・引いて・はなす) をそのまま再現して確かめる。
 * 直した不具合には、かならず見張り役をここに置く。
 */
const { spawn } = require('node:child_process');
const path = require('node:path');
const http = require('node:http');

const PORT = Number(process.env.PORT || 8123);
const URL = `http://localhost:${PORT}/`;
const ROOT = __dirname;
const CHROMIUM = process.env.CHROMIUM_PATH;   // 手元の Chromium を使いたいとき

// 対象は iPhone 16 Plus だけ。playwright がその名前を知らなくても動くよう、同じ大きさの控えを持つ
const IPHONE_16_PLUS = {
  viewport: { width: 430, height: 932 },
  screen: { width: 430, height: 932 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
};

let passed = 0;
let failed = 0;

function ok(condition, message) {
  if (condition) {
    passed++;
    console.log('  \x1b[32m✓\x1b[0m ' + message);
  } else {
    failed++;
    console.log('  \x1b[31m✗ FAIL\x1b[0m ' + message);
  }
}

function section(name) {
  console.log('\n' + name);
}

function waitForServer() {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      http.get(URL, (res) => { res.resume(); resolve(); })
        .on('error', () => {
          if (Date.now() - started > 10000) reject(new Error('サーバーが起動しない'));
          else setTimeout(tick, 100);
        });
    };
    tick();
  });
}

/**
 * いま生きている敵のどれかに直撃する指の位置を、ロジックの弾道計算で探す。
 * kind の弾で、指を置く場所 (画面の px) を返す。見つからなければ null。
 */
function findAim(page, kind) {
  return page.evaluate((kind) => {
    const C = window.Core, app = window.__app, view = app.view;
    const lv = C.LEVELS[app.state().lv];
    const foes = app.state().foes.filter((f) => !f.dead);
    const m = C.muzzle(view);
    for (let deg = -80; deg <= -5; deg += 1) {
      for (let p = 0.4; p <= 1.0001; p += 0.02) {
        const r = (deg * Math.PI) / 180, d = Math.min(1, p) * view.H * C.MAXDRAG;
        const x = m.x + Math.cos(r) * d, y = m.y + Math.sin(r) * d;
        const shot = C.simulateShot(lv.terrain, kind, C.aimVec(x, y, view), view, foes, 60);
        if (shot.type === 'direct') return { x, y };
      }
    }
    return null;
  }, kind);
}

/** 画面を押して、指を動かして、はなす。 */
async function drag(page, from, to) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(from.x + (to.x - from.x) * i / 6, from.y + (to.y - from.y) * i / 6);
  }
  await page.mouse.up();
}

async function run() {
  let chromium;
  let devices;
  try {
    ({ chromium, devices } = require('playwright'));
  } catch (e) {
    console.error('playwright が必要です:  npm i -D playwright');
    process.exit(1);
  }

  const server = spawn(process.execPath, [path.join(ROOT, 'serve.js'), String(PORT)], { stdio: 'ignore' });
  await waitForServer();

  const browser = await chromium.launch(CHROMIUM ? { executablePath: CHROMIUM } : {});
  const errors = [];

  try {
    // ------------------------------------------------ 開く
    section('iPhone 16 Plus で開く');
    const device = devices['iPhone 16 Plus'] || IPHONE_16_PLUS;
    console.log('  (端末: ' + (devices['iPhone 16 Plus'] ? 'iPhone 16 Plus' : '控えの 430x932') + ')');
    const context = await browser.newContext({ ...device });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(URL);
    await page.waitForFunction(() => window.__app);
    ok(true, 'ページが開いて、画面のしくみが立ち上がる');

    const first = await page.evaluate(() => ({
      wide: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      title: document.querySelector('h1').textContent.trim(),
      ver: document.getElementById('ver').textContent,
      canvas: [document.getElementById('c').clientWidth, document.getElementById('c').clientHeight]
    }));
    ok(first.wide <= 1, '横スクロールが出ない');
    ok(first.title === 'やまなりショット', `題字が出ている (${first.title})`);
    ok(/^v\d+/.test(first.ver), `版の番号が出ている (${first.ver})`);
    // canvas の font に 'inherit' を渡すと黙って 10px にされる
    const font = await page.evaluate(() => window.__app.canvasFont());
    ok(/^600 30px /.test(font), `キャンバスの字が指定の大きさで書かれる (${font})`);
    ok(first.canvas[0] === 430 && first.canvas[1] === 932, `キャンバスが画面いっぱい (${first.canvas.join('x')})`);

    // 画面が動いているか (1 コマ目の dt が負だと、全部が逆に動いて止まって見える)
    const moving = await page.evaluate(async () => {
      const a = window.__app.state().foes[0].ph;
      await new Promise((r) => setTimeout(r, 300));
      return window.__app.state().foes[0].ph - a;
    });
    ok(moving > 0.1, `時間が前に進んでいる (0.3 秒で ${moving.toFixed(2)} 秒ぶん)`);

    // ------------------------------------------------ 面をえらぶ
    section('面をえらぶ');
    await page.locator('#btnStart').tap();
    const sel = await page.evaluate(() => ({
      cells: document.querySelectorAll('.cell').length,
      open1: !document.querySelector('.cell[data-level="0"]').classList.contains('locked'),
      lock2: document.querySelector('.cell[data-level="1"]').classList.contains('locked'),
      scene: window.__app.state().scene
    }));
    ok(sel.scene === 'select' && sel.cells === 30, `30 面が並ぶ (${sel.cells})`);
    ok(sel.open1 && sel.lock2, '1 面目だけ開いていて、2 面目は閉じている');

    // 実機の安全域 (上 59・下 34) を差し込んでも、面えらびの画面が 932 に収まる
    const fitSafe = await page.evaluate(() => {
      const p = document.getElementById('pSelect');
      const before = p.style.cssText;
      p.style.paddingTop = (26 + 59) + 'px'; p.style.paddingBottom = (26 + 34) + 'px';
      const r = { scroll: p.scrollHeight, client: p.clientHeight };
      p.style.cssText = before;
      return r;
    });
    ok(fitSafe.scroll <= 932, `安全域を入れても面えらびが収まる (${fitSafe.scroll} <= 932)`);

    await page.locator('.cell[data-level="0"]').tap();
    const st = await page.evaluate(() => ({
      scene: window.__app.state().scene,
      slots: [...document.querySelectorAll('.slot')].map((s) => s.dataset.kind).join(','),
      hint: document.getElementById('hint').textContent
    }));
    ok(st.scene === 'play', '1 面目が始まる');
    ok(st.slots === 'n,r', `弾は 大砲 と ライフル (${st.slots})`);
    ok(st.hint.length > 0, `はじめの面には手引きが出る (${st.hint})`);

    // ------------------------------------------------ 撃つ
    section('押して引いて、はなすと撃つ');
    const aim = await findAim(page, 'n');
    ok(!!aim, '当たる向きが見つかる');
    const m = await page.evaluate(() => window.__app.muzzle());

    // ねらいの点線: 大砲は前の倍くらい、ライフルはほぼ線
    const dotsN = await page.evaluate(({ x, y }) => window.__app.aimDots(x, y).length, { x: m.x + 110, y: m.y - 170 });
    await page.locator('.slot[data-kind="r"]').tap();
    const dotsR = await page.evaluate(({ x, y }) => window.__app.aimDots(x, y).length, { x: m.x + 110, y: m.y - 170 });
    await page.locator('.slot[data-kind="n"]').tap();
    ok(dotsN >= 14, `大砲のねらいの点が細かい (${dotsN} 点)`);
    ok(dotsR >= 40, `ライフルのねらいの点がほぼ線 (${dotsR} 点)`);
    await drag(page, { x: 215, y: 500 }, aim);
    const flying = await page.evaluate(() => window.__app.state());
    ok(flying.bullets === 1 && flying.ammo.n === 2, `弾がひとつ飛び、大砲が 1 つ減る (飛んでいる ${flying.bullets} / 残り ${flying.ammo.n})`);

    await page.waitForFunction(() => window.__app.state().scene === 'done', null, { timeout: 6000 }).catch(() => {});
    const done = await page.evaluate(() => ({
      s: window.__app.state(),
      title: document.getElementById('rTitle').textContent,
      stars: document.getElementById('rStars').textContent,
      shown: !document.getElementById('pResult').classList.contains('hide')
    }));
    ok(done.shown && done.title === 'たおした！', `当たると「たおした！」が出る (${done.title})`);
    ok(done.stars === '★★★', `弾が 2 つ残れば星 3 つ (${done.stars})`);
    ok(done.s.save[0] === 3, '星が保存される');

    await page.locator('#btnR3').tap();
    const opened = await page.evaluate(() =>
      !document.querySelector('.cell[data-level="1"]').classList.contains('locked'));
    ok(opened, 'クリアすると 2 面目が開く');

    // 読み込み直しても記録が残る
    await page.reload();
    await page.waitForFunction(() => window.__app);
    ok(await page.evaluate(() => window.__app.state().save[0] === 3), '開き直しても星が残る');

    // ------------------------------------------------ さくれつ弾
    section('さくれつ弾は、飛んでいる間にタップで 3 つに割れる');
    await page.evaluate(() => window.__app.play(8));
    await page.locator('.slot[data-kind="s"]').tap();
    ok(await page.evaluate(() => window.__app.state().sel === 's'), 'さくれつ弾をえらべる');
    await drag(page, { x: 215, y: 500 }, { x: m.x + 120, y: m.y - 220 });
    await page.waitForTimeout(150);
    await page.mouse.click(300, 300);
    const split = await page.evaluate(() => window.__app.state().bullets);
    ok(split === 3, `タップで 3 つに割れる (${split})`);

    // ------------------------------------------------ たまぎれ
    section('弾を撃ちつくすと、たまぎれ');
    await page.evaluate(() => window.__app.play(0));
    for (let i = 0; i < 5; i++) {
      // 左下へ弱く撃って、わざと外す
      await drag(page, { x: 215, y: 500 }, { x: m.x - 40, y: m.y - 20 });
      await page.waitForFunction(() => window.__app.state().bullets === 0, null, { timeout: 4000 }).catch(() => {});
    }
    await page.waitForFunction(() => window.__app.state().scene === 'done', null, { timeout: 4000 }).catch(() => {});
    const lose = await page.evaluate(() => ({
      r: window.__app.state().lastResult, title: document.getElementById('rTitle').textContent,
      next: getComputedStyle(document.getElementById('btnNext')).display
    }));
    ok(lose.r && lose.r.win === false && lose.title === 'たまぎれ', `「たまぎれ」が出る (${lose.title})`);
    ok(lose.next === 'none', '負けたら「つぎへ」は出ない');

    // ------------------------------------------------ アイコン
    section('ホーム画面のアイコン');
    const icon = await page.evaluate(async () => {
      const href = document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href') || '';
      const img = new Image();
      const loaded = await new Promise((r) => { img.onload = () => r(true); img.onerror = () => r(false); img.src = href; });
      if (!loaded) return { href, loaded };
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const n = img.width - 1;
      const corners = [[0, 0], [n, 0], [0, n], [n, n]].map(([x, y]) => g.getImageData(x, y, 1, 1).data[3]);
      return { href, loaded, w: img.width, h: img.height, minAlpha: Math.min(...corners) };
    });
    // iOS は SVG のアイコンを使えない。透明な所は黒で埋められる
    ok(icon.href.endsWith('.png'), `ホーム画面用アイコンが PNG (${icon.href})`);
    ok(icon.loaded && icon.w === 180 && icon.h === 180, `アイコンが読めて 180x180 (${icon.w}x${icon.h})`);
    ok(icon.minAlpha === 255, `アイコンの四隅が透けていない (いちばん薄い所 ${icon.minAlpha})`);

    section('エラー');
    ok(errors.length === 0, errors.length ? '画面のエラー: ' + errors.join(' / ') : 'JS エラーなし');
  } finally {
    await browser.close();
    server.kill();
  }

  console.log(`\n${passed} 件合格 / ${failed} 件失敗`);
  process.exit(failed ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
