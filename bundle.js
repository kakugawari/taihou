/* 全ファイルを 1 枚の HTML にまとめる (テストプレイ用): node bundle.js [出力先] */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const out = process.argv[2] || path.join(ROOT, 'dist', 'index.html');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

let html = read('index.html');
html = html.replace('<link rel="stylesheet" href="./styles.css">', () => '<style>\n' + read('styles.css') + '</style>');
html = html.replace(/<script src="\.\/([\w.-]+)"><\/script>/g, (_, f) => '<script>\n' + read(f) + '</script>');

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(out + ' (' + Math.round(html.length / 1024) + 'KB)');
