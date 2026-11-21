// Структура всех .html: doctype, lang, charset, viewport, title, один h1, id не повторяются,
// у картинок alt, локальные ссылки не битые. Печатает по строке на каждую проблему.
//     node proverka/html.mjs [папка]
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(process.argv[2] || '.');
const skip = new Set(['node_modules', '.git', 'libs']);
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e =>
  skip.has(e.name) ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.html') ? [path.join(d, e.name)] : []);
for (const f of walk(root)) {
  const src = fs.readFileSync(f, 'utf8'), name = path.relative(root, f), bad = [];
  const tags = [...src.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '').matchAll(/<(\w+)([^>]*)>/g)];
  if (!/^\s*<!doctype html/i.test(src)) bad.push('нет <!doctype html>');
  if (!/<html[^>]*\blang=/i.test(src)) bad.push('нет lang у <html>');
  if (!/<meta[^>]*charset/i.test(src)) bad.push('нет meta charset');
  if (!/<meta[^>]*name="viewport"/i.test(src)) bad.push('нет meta viewport');
  if (!/<title>\s*\S[\s\S]*?<\/title>/i.test(src)) bad.push('нет <title>');
  const h1 = tags.filter(t => t[1].toLowerCase() === 'h1').length;
  if (h1 !== 1) bad.push(`<h1> штук: ${h1}`);
  const ids = tags.map(t => (t[2].match(/\sid="([^"]*)"/) || [])[1]).filter(Boolean);
  const dup = [...new Set(ids.filter((x, i) => ids.indexOf(x) !== i))];
  if (dup.length) bad.push(`повторяются id: ${dup}`);
  const noAlt = tags.filter(t => t[1].toLowerCase() === 'img' && !/\salt="[^"]+"/.test(t[2])).length;
  if (noAlt) bad.push(`картинок без alt: ${noAlt}`);
  for (const t of tags) for (const k of ['href', 'src']) {
    const r = (t[2].match(new RegExp(`\\s${k}="([^"]*)"`)) || [])[1];
    if (!r || /^(https?:|mailto:|data:|#|javascript:)/.test(r)) continue;
    const p = r.split(/[#?]/)[0];
    if (p && !fs.existsSync(path.join(path.dirname(f), p))) bad.push(`битая ссылка: ${r}`);
  }
  for (const b of bad) console.log(`${name}: ${b}`);
}
