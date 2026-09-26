/*
 * アプリのアイコンを作る: node make-icon.js
 *
 * ブラウザの canvas で 1024px に描き、縮めて PNG で書き出す。
 * iOS のホーム画面は SVG を使えない (CLAUDE.md の落とし穴) ので PNG にする。
 * 角の丸めは iOS が自分でかける。こちらは四角いまま、透明を作らない (透明は黒で埋められる)。
 */
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const SIZES = { 'icon-180.png': 180, 'icon-192.png': 192, 'icon-512.png': 512 };

function draw(sizes) {
  const S = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');

  // 空 (ゆうぐれ。ゲームの 1 章と同じ色)
  const sky = g.createLinearGradient(0, 0, 0, S);
  [['#241041', 0], ['#4B2159', .30], ['#9A3F52', .56], ['#DE7239', .76], ['#F7B95F', .92]]
    .forEach(([col, t]) => sky.addColorStop(t, col));
  g.fillStyle = sky; g.fillRect(0, 0, S, S);

  // 夕日
  const sx = 840, sy = 215, sr = 96;
  const glow = g.createRadialGradient(sx, sy, sr * .3, sx, sy, sr * 3.4);
  glow.addColorStop(0, 'rgba(255,170,80,.85)'); glow.addColorStop(.25, 'rgba(255,170,80,.35)');
  glow.addColorStop(1, 'rgba(255,170,80,0)');
  g.fillStyle = glow; g.beginPath(); g.arc(sx, sy, sr * 3.4, 0, 7); g.fill();
  g.fillStyle = '#FFE9B0'; g.beginPath(); g.arc(sx, sy, sr, 0, 7); g.fill();

  // 遠くの山
  g.fillStyle = 'rgba(78,38,84,.6)';
  g.beginPath(); g.moveTo(0, S);
  [[0, 640], [150, 560], [300, 620], [470, 540], [620, 610], [800, 530], [1024, 600]].forEach(([x, y]) => g.lineTo(x, y));
  g.lineTo(S, S); g.closePath(); g.fill();

  // 地面と、右の丘 (敵が乗る)
  const land = '#1B0E2C', edge = 'rgba(255,178,77,.85)';
  const groundY = 860, hillTop = 610, hx1 = 610, hx2 = 1024;
  g.fillStyle = land;
  g.beginPath(); g.moveTo(0, groundY); g.lineTo(hx1 - 70, groundY);
  g.quadraticCurveTo(hx1 - 10, hillTop + 10, hx1 + 60, hillTop); g.lineTo(hx2, hillTop);
  g.lineTo(S, S); g.lineTo(0, S); g.closePath(); g.fill();
  g.strokeStyle = edge; g.lineWidth = 8; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(0, groundY); g.lineTo(hx1 - 70, groundY);
  g.quadraticCurveTo(hx1 - 10, hillTop + 10, hx1 + 60, hillTop); g.lineTo(hx2, hillTop); g.stroke();

  // 大砲 (左下。右上を向く)
  const cx = 215, cy = groundY - 62, ang = -0.82;
  g.fillStyle = land;
  g.beginPath(); g.moveTo(cx - 105, groundY + 4); g.lineTo(cx + 105, groundY + 4);
  g.lineTo(cx + 68, cy + 6); g.lineTo(cx - 68, cy + 6); g.closePath(); g.fill();
  g.save(); g.translate(cx, cy); g.rotate(ang);
  const bw = 230, bh = 74;
  g.fillStyle = '#33193F'; g.strokeStyle = edge; g.lineWidth = 8;
  g.beginPath(); g.roundRect(-30, -bh / 2, bw, bh, 28); g.fill(); g.stroke();
  g.fillStyle = '#FFF6D8'; g.beginPath(); g.arc(bw - 52, 0, 14, 0, 7); g.fill();
  g.restore();
  g.fillStyle = '#2A1440'; g.strokeStyle = edge; g.lineWidth = 8;
  g.beginPath(); g.arc(cx, cy, 50, 0, 7); g.fill(); g.stroke();

  // 山なりの弾道 (点線) と、飛んでいる弾
  const p0 = { x: cx + Math.cos(ang) * 200, y: cy + Math.sin(ang) * 200 };
  const p2 = { x: 812, y: hillTop - 100 };
  const p1 = { x: 470, y: 40 };
  const at = (t) => ({
    x: (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * p1.x + t * t * p2.x,
    y: (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * p1.y + t * t * p2.y
  });
  for (let i = 1; i < 12; i++) {
    const t = i / 13, q = at(t);
    if (t > 0.5 && t < 0.62) continue;       // 弾のまわりはあける
    g.fillStyle = 'rgba(255,240,214,' + (0.35 + 0.5 * t) + ')';
    g.beginPath(); g.arc(q.x, q.y, 11 + 6 * t, 0, 7); g.fill();
  }
  const b = at(0.56);
  g.shadowColor = '#FFB24D'; g.shadowBlur = 60;
  g.fillStyle = '#FFF6D8'; g.beginPath(); g.arc(b.x, b.y, 40, 0, 7); g.fill();
  g.shadowBlur = 0;

  // 丘の上の敵
  const ex = 812, r = 92, ey = hillTop - r * .78;
  g.fillStyle = 'rgba(0,0,0,.3)';
  g.beginPath(); g.ellipse(ex, hillTop + 6, r * .85, r * .18, 0, 0, 7); g.fill();
  g.fillStyle = '#FFD98A';
  g.beginPath(); g.moveTo(ex - r * .42, ey - r * .72); g.lineTo(ex - r * .20, ey - r * 1.32); g.lineTo(ex - r * .02, ey - r * .80); g.fill();
  g.fillStyle = '#FFF0D6';
  g.beginPath(); g.arc(ex, ey, r, Math.PI, Math.PI * 2);
  g.lineTo(ex + r, ey + r * .78); g.lineTo(ex - r, ey + r * .78); g.closePath(); g.fill();
  g.fillStyle = '#2A1440';
  g.beginPath(); g.ellipse(ex - r * .32, ey - r * .04, r * .15, r * .21, 0, 0, 7); g.fill();
  g.beginPath(); g.ellipse(ex + r * .32, ey - r * .04, r * .15, r * .21, 0, 0, 7); g.fill();
  g.fillStyle = 'rgba(255,120,90,.45)';
  g.beginPath(); g.arc(ex - r * .6, ey + r * .28, r * .17, 0, 7); g.fill();
  g.beginPath(); g.arc(ex + r * .6, ey + r * .28, r * .17, 0, 7); g.fill();

  // 縮めて書き出す
  const out = {};
  for (const [name, n] of Object.entries(sizes)) {
    const d = document.createElement('canvas');
    d.width = d.height = n;
    const dg = d.getContext('2d');
    dg.imageSmoothingQuality = 'high';
    dg.drawImage(c, 0, 0, n, n);
    out[name] = d.toDataURL('image/png').split(',')[1];
  }
  return out;
}

(async () => {
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await browser.newPage();
  const files = await page.evaluate(draw, SIZES);
  await browser.close();
  for (const [name, b64] of Object.entries(files)) {
    fs.writeFileSync(path.join(__dirname, name), Buffer.from(b64, 'base64'));
    console.log(name);
  }
})();
