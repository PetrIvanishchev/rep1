// Браузерная проверка предикатов всех сайтов. Запускается из check.sh:
//     node proverka/run.mjs            все сайты
//     node proverka/run.mjs razvlekuhi  только один сайт
// Каждая проверка отвечает ДА или НЕТ. Если проверить глазами нельзя,
// она честно помечена как «ГЛАЗАМИ», и в КРАСНОЕ это не засчитывается.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.woff': 'font/woff', '.ttf': 'font/ttf', '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain' };

// Маленький сервер: отдаёт файлы проекта на http://127.0.0.1:порт
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('нет такого файла'); return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
let failed = 0, passed = 0, manual = 0;
const g = s => `\x1b[32m${s}\x1b[0m`, r = s => `\x1b[31m${s}\x1b[0m`, y = s => `\x1b[33m${s}\x1b[0m`;

// t передаётся в каждый файл сайта
const t = {
  BASE, ROOT,
  // Новая страница с ЧИСТЫМ хранилищем браузера (у каждой проверки своё).
  // opts: width, height. Возвращает { page, context, reopen() }
  async open(url, opts = {}) {
    const context = await browser.newContext({ viewport: { width: opts.width || 1280, height: opts.height || 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(BASE + url, { waitUntil: opts.wait || 'load' });
    return { page, context, errors,
      async reload() { await page.reload({ waitUntil: opts.wait || 'load' }); },
      async close() { await context.close(); } };
  },
  section(title) { console.log(`\n  ${title}`); console.log('  ' + '-'.repeat(46)); },
  // fn возвращает true или бросает ошибку с понятным объяснением
  async check(name, fn) {
    try {
      const res = await fn();
      if (res === false) throw new Error('условие не выполнено');
      passed++; console.log(`  [ ${g('ДА ')} ] ${name}`);
    } catch (e) {
      failed++; console.log(`  [ ${r('НЕТ')} ] ${name}\n        -> ${String(e.message || e).split('\n')[0].slice(0, 220)}`);
    }
  },
  // То, что скрипт проверить не может. В КРАСНОЕ не идёт, но напоминает про глаза.
  eyes(name) { manual++; console.log(`  [ ${y('ГЛАЗАМИ')} ] ${name}`); },
  assert(cond, msg) { if (!cond) throw new Error(msg); return true; },
};

const only = process.argv[2];
// Сайты, у которых проверки уже написаны. Добавил sites/<имя>.mjs: впиши имя сюда.
const sites = ['istoriya', 'akkaunt', 'razvlekuhi', 'wikidata'].filter(s => !only || s === only);
// Сайты без проверок. Это не ДА и не НЕТ: честное «не проверяется».
const NOT_CHECKED = [];
if (!only) for (const n of NOT_CHECKED) console.log(`\n  [ ${y('НЕ ПРОВЕРЯЕТСЯ')} ] ${n}: проверок пока нет, предикаты смотри глазами`);
for (const s of sites) {
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), 'sites', `${s}.mjs`);
  if (!fs.existsSync(file)) { failed++; console.log(`  [ ${r('НЕТ')} ] нет файла проверок sites/${s}.mjs`); continue; }
  try { await (await import(file)).default(t); }
  catch (e) { failed++; console.log(`  [ ${r('НЕТ')} ] проверка сайта «${s}» упала: ${String(e.message).split('\n')[0]}`); }
}

await browser.close(); server.close();
console.log(`\n  браузер: ДА ${passed}, НЕТ ${failed}, глазами ${manual}`);
process.exit(failed === 0 ? 0 : 1);
