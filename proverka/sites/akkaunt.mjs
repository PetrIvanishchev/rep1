// Сайт «Создай свой аккаунт»: akkaunt.html.
// Предикаты: zadanie-3.md. Здесь проверки А1 (1.1), А2 (1.2, 1.9) и А4 (1.3, 1.5).
// Остальное (иконки по центру, единорог, вид Windows 95, окна, дислексия) пока смотрит человек.
import fs from 'node:fs';
import path from 'node:path';

const URL = '/akkaunt.html';
const RGB = /^rgb\(\d+, \d+, \d+\)$/;
const nums = s => s.match(/[\d.]+/g).slice(0, 3).map(Number);
const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const hue = ([r, g, b]) => {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), d = mx - Math.min(r, g, b);
  if (!d) return 0;
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return h * 60;
};
const hueGap = (a, b) => { const d = Math.abs(hue(a) - hue(b)) % 360; return d > 180 ? 360 - d : d; };

async function withPage(t, fn) {
  const s = await t.open(URL, { width: 1280, height: 900 });
  try { return await fn(s.page, s); } finally { await s.close(); }
}

// Переключить датчик по подписи в нужное положение
const setSensor = (page, label, on) => page.evaluate(([l, want]) => {
  const row = [...document.querySelectorAll('#sensors .sensor')].find(r => r.firstChild.textContent === l);
  if (row.querySelector('input').checked !== want) row.querySelector('input').click();
}, [label, on]);

const SENSOR_LABELS = ['шрифт от руки', 'цветной текст', 'каждое слово на отдельном фоне', 'шрифт каллиграфический', 'шрифт широкий', 'шрифт официальный'];
const FONT_BITS = ['шрифт от руки', 'шрифт каллиграфический', 'шрифт широкий', 'шрифт официальный'];

export default async function (t) {
  t.section('Аккаунт (akkaunt.html)');

  // ---------- 1.1 Элементы настройки ----------
  await t.check('Аккаунт, 1.1: цвет фона и счётчик, иконка, поля, местоимения; всё запоминается', () => withPage(t, async (page, s) => {
    const codes = [];
    for (let i = 0; i < 3; i++) { await page.click('#bgBtn'); codes.push(await page.textContent('#bgCode')); }
    t.assert(codes.every(c => RGB.test(c)), `код цвета не rgb(r, g, b): ${codes}`);
    t.assert(new Set(codes).size === 3, `цвета повторились: ${codes}`);
    t.assert(await page.textContent('#bgCount') === '3', 'счётчик нажатий не равен 3');
    await page.click('#iconBtn');
    t.assert(await page.textContent('#bgCount') === '3', 'нажатие «Выбор иконки» изменило счётчик цвета');
    t.assert(await page.$('#iconView svg'), 'после «Выбор иконки» в кружке нет символа');
    t.assert(!/нажатий/.test(await page.$eval('#iconBtn', b => b.parentElement.textContent)), 'у иконки есть счётчик нажатий');
    t.assert(await page.getAttribute('#name', 'placeholder') === 'впиши имя' && await page.getAttribute('#user', 'placeholder') === 'впиши юзер', 'поля «впиши имя» и «впиши юзер» не найдены');
    const opts = id => page.$$eval(`#${id} option`, o => o.map(x => x.textContent).filter(x => x !== '—'));
    t.assert(JSON.stringify(await opts('pron1')) === '["он","она","они","оно"]', 'в первом списке не «он, она, они, оно»');
    t.assert(JSON.stringify(await opts('pron2')) === '["его","её","их"]', 'во втором списке не «его, её, их»');
    await page.fill('#name', 'Аня'); await page.fill('#user', 'anya');
    await page.selectOption('#pron1', 'он'); await page.selectOption('#pron2', 'его');
    await page.click('#resultBtn');
    t.assert(/он\/его/.test(await page.textContent('#cardBody .nick')), 'в плашке местоимения не «он/его»');
    const icon = await page.innerHTML('#iconView');
    await s.reload();
    t.assert(await page.textContent('#bgCount') === '3' && await page.textContent('#bgCode') === codes[2], 'цвет или счётчик не запомнились');
    t.assert(await page.innerHTML('#iconView') === icon, 'иконка не запомнилась');
    t.assert(await page.inputValue('#name') === 'Аня' && await page.inputValue('#user') === 'anya', 'имя или юзер не запомнились');
    t.assert(await page.inputValue('#pron1') === 'он' && await page.inputValue('#pron2') === 'его', 'местоимения не запомнились');
  }));

  // ---------- 1.2 и 1.9: датчики и шрифты ----------
  await t.check('Аккаунт, 1.2: шесть датчиков запоминаются, 16 сочетаний дают шрифты из fonts/pole, замены записаны в README', () => withPage(t, async (page, s) => {
    const labels = await page.$$eval('#sensors .sensor', r => r.map(x => x.firstChild.textContent));
    t.assert(JSON.stringify(labels) === JSON.stringify(SENSOR_LABELS), `датчики: ${labels}`);
    for (const l of SENSOR_LABELS) await setSensor(page, l, true);
    await s.reload();
    t.assert(await page.$$eval('#sensors input', i => i.every(x => x.checked)), 'включённые датчики не запомнились или не включились вместе');
    for (const l of SENSOR_LABELS) await setSensor(page, l, false);
    await page.click('#resultBtn');
    const used = [];
    for (let n = 0; n < 16; n++) {
      for (let b = 0; b < 4; b++) await setSensor(page, FONT_BITS[b], !!(n >> b & 1));
      used.push((await page.$eval('#cardBody', e => getComputedStyle(e).fontFamily)).split(',')[0].replace(/["']/g, '').trim());
    }
    const unique = [...new Set(used)];
    t.assert(unique.length === 12, `разных шрифтов ${unique.length}, ожидалось 12 (остальные 4 сочетания — «ближайший»): ${used}`);
    const dir = path.join(t.ROOT, 'fonts/pole'), files = fs.readdirSync(dir).filter(f => /\.ttf$/.test(f)).map(f => f.toLowerCase());
    for (const f of unique) {
      t.assert(files.some(x => x.includes(f.replace(/ /g, '').toLowerCase())), `нет файла шрифта «${f}» в fonts/pole`);
      t.assert((await page.evaluate(n => document.fonts.load(`16px "${n}"`).then(r => r.length), f)) > 0, `шрифт «${f}» не подключён через @font-face`);
    }
    const readme = fs.readFileSync(path.join(dir, 'README.md'), 'utf8');
    t.assert((readme.match(/ближайший/g) || []).length >= 16 - unique.length, 'в README не отмечены сочетания с ближайшим шрифтом');
  }));

  await t.check('Аккаунт, 1.9: основной шрифт Press Start 2P; 20 иконок аккаунта и 9 стикеров; пиксели без сглаживания', () => withPage(t, async page => {
    t.assert(/Press Start 2P/.test(await page.$eval('body', b => getComputedStyle(b).fontFamily)), 'текст страницы не Press Start 2P');
    t.assert(await page.evaluate(() => ICON_KEYS.length) === 20, 'иконок аккаунта не 20');
    t.assert(await page.evaluate(() => Object.keys(STICKERS).length) === 9, 'стикеров не 9');
    t.assert(await page.evaluate(() => Object.values(ICONS).concat(Object.values(STICKERS).map(x => x.svg)).every(x => /crispEdges/.test(x))), 'у какой-то иконки нет shape-rendering="crispEdges"');
    for (const f of ['icons/README.md', 'fonts/pole/OFL-pressstart2p.txt']) t.assert(fs.existsSync(path.join(t.ROOT, f)), `нет файла ${f}`);
  }));

  // ---------- 1.3 и 1.5: посты, палитра, контраст ----------
  await t.check('Аккаунт, 1.3 и 1.5: 7 оттенков следуют за фоном, пост хранит номер, контраст слов не меньше 4,5, слова в пределах 50°', () => withPage(t, async (page, s) => {
    await page.click('#bgBtn');
    await page.click('#postBtn');
    const list = () => page.$$eval('#postForm select[name=color] option', o => o.map(x => ({ code: x.textContent, bg: x.style.background, color: x.style.color })));
    const before = await list();
    t.assert(before.length === 7, `оттенков в форме ${before.length}, нужно 7`);
    before.forEach((o, i) => {
      t.assert(RGB.test(o.code), `оттенок ${i + 1}: подпись «${o.code}» не rgb(…)`);
      t.assert(contrast(nums(o.color), nums(o.bg)) >= 4.5, `оттенок ${i + 1}: контраст ${contrast(nums(o.color), nums(o.bg)).toFixed(2)} меньше 4,5`);
    });
    await page.click('#postX'); await page.click('#bgBtn'); await page.click('#postBtn');
    t.assert(JSON.stringify((await list()).map(o => o.code)) !== JSON.stringify(before.map(o => o.code)), 'список оттенков не изменился после смены фона');
    await page.fill('[name=title]', 'Заголовок'); await page.fill('[name=tags]', '#кино #друзья');
    await page.fill('[name=text]', 'Текст поста для проверки цвета'); await page.fill('[name=people]', 'Аня Боря');
    await page.selectOption('[name=color]', '3');
    await page.click('#postForm button[type=submit]');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('pole-state')).posts[0]);
    t.assert(saved.slot === 3 && !/rgb|#[0-9a-f]{6}/i.test(JSON.stringify(saved)), `в посте хранится не номер оттенка: ${JSON.stringify(saved)}`);
    await page.click('#resultBtn');
    await setSensor(page, 'цветной текст', true);
    let prev = null;
    for (let i = 0; i < 4; i++) {
      await page.$eval('#bgBtn', b => b.click());
      const d = await page.evaluate(() => {
        const w = document.getElementById('cardWin'), p = document.querySelector('.post');
        return { c: w.style.getPropertyValue('--c'), tc: w.style.getPropertyValue('--tc'), post: p.dataset.rgb.split(',').map(Number),
          words: [...p.querySelectorAll('.w')].map(x => getComputedStyle(x).color) };
      });
      t.assert(d.words.length > 5, 'в посте нет слов в <span> при «цветном тексте»');
      t.assert(new Set(d.words).size > 1, 'слова в посте одного цвета');
      d.words.forEach(w => {
        t.assert(contrast(nums(w), d.post) >= 4.5, `слово ${w} на фоне поста rgb(${d.post}): контраст ${contrast(nums(w), d.post).toFixed(2)} меньше 4,5`);
        t.assert(hueGap(nums(w), d.post) <= 51, `слово ${w}: оттенок дальше 50° от фона поста rgb(${d.post})`);
      });
      t.assert(!prev || prev !== d.post.join(), 'цвет поста не изменился вслед за фоном') ; prev = d.post.join();
    }
    await s.reload();
    t.assert(await page.$$eval('.post', p => p.length) === 1, 'пост не сохранился после перезагрузки');
  }));

  t.eyes('Аккаунт, 1.6–1.8, 1.2/1.3 (вид): иконки по центру кружков, единорог в профиль, стиль Windows 95, шрифты «подходят по духу» — принято глазами владелицей на первое время (2026-11-21)');
}
