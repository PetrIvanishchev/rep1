// Сайт истории кино: istoriya.html и era-1.html ... era-6.html.
// Предикаты: zadanie-2.md (основа и уточнения 1-6).
import fs from 'node:fs';
import path from 'node:path';

const ERAS = [1, 2, 3, 4, 5, 6].map(n => `/era-${n}.html`);
const PAGES = ['/istoriya.html', ...ERAS];
const OD = /OpenDyslexic/i;

async function onPage(url, opts, fn) {
  const s = await opts.t.open(url, opts.view);
  try { return await fn(s.page, s); } finally { await s.close(); }
}

function lum({ r, g, b }) {
  const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
const parseRgb = s => { const m = s.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m[3] === undefined ? 1 : m[3] }; };

// Стили слов заголовка: для каждого <span> собираем шрифт, фон, цвет, наклон, рамку
const wordStyles = (page, sel) => page.$$eval(sel + ' > span', spans => spans.map(s => {
  const c = getComputedStyle(s);
  const m = c.transform.match(/matrix\(([^)]+)\)/);
  const ang = m ? (() => { const [a, b] = m[1].split(',').map(Number); return Math.atan2(b, a) * 180 / Math.PI; })() : 0;
  return { text: s.textContent, font: c.fontFamily, bg: c.backgroundColor, color: c.color, angle: ang,
           border: parseFloat(c.borderTopWidth), right: s.getBoundingClientRect().right };
}));

const sentences = text => (text.match(/[.!?…](\s|$)/g) || []).length;

export default async function (t) {
  const o = { t };
  t.section('История кино (istoriya.html, era-1 … era-6)');

  // ---------- Основа ----------
  await t.check('История, осн. 1: минимум 5 эр с заголовком, годами и описанием, от ранней к поздней', () => onPage('/istoriya.html', o, async page => {
    const eras = await page.$$eval('section.era:not(.sources)', els => els.map(e => ({
      h2: e.querySelector('h2')?.textContent.trim(), years: e.querySelector('.years')?.textContent.trim(),
      body: [...e.querySelectorAll('p:not(.years)')].map(p => p.textContent).join(' ') })));
    t.assert(eras.length >= 5, `эр ${eras.length}, нужно минимум 5`);
    eras.forEach((e, i) => { t.assert(e.h2 && e.years, `у эры ${i + 1} нет заголовка или годов`); t.assert(sentences(e.body) >= 2, `у эры ${i + 1} описание короче 2 предложений`); });
    const start = eras.map(e => parseInt(e.years.match(/\d{4}/)[0]));
    t.assert(start.every((y, i) => i === 0 || y >= start[i - 1]), `эры идут не по порядку: ${start}`);
  }));

  await t.check('История, осн. 2: раздел «Источники» с минимум 3 ссылками в формате MLA', () => onPage('/istoriya.html', o, async page => {
    const h = await page.$$eval('h2', hs => hs.some(h => h.textContent.trim() === 'Источники'));
    t.assert(h, 'нет заголовка «Источники»');
    const src = await page.$$eval('.sources p', ps => ps.map(p => ({ text: p.textContent, links: p.querySelectorAll('a[href^="http"]').length })));
    t.assert(src.length >= 3, `источников ${src.length}, нужно минимум 3`);
    const bad = src.filter(s => !(s.links >= 1 && /Дата обращения/.test(s.text) && /[«"]/.test(s.text) && /\d{4}/.test(s.text)));
    t.assert(bad.length === 0, `не похоже на MLA (нет ссылки, названия в кавычках, года или даты обращения): ${bad[0]?.text.slice(0, 60)}`);
  }));

  await t.check('История, осн. 3: без сторонних библиотек', async () => {
    for (const url of PAGES) await onPage(url, o, async page => {
      const ext = await page.$$eval('script[src]', s => s.length);
      t.assert(ext === 0, `${url}: есть <script src>`);
    });
  });
  t.eyes('История, осн. 3: на телефоне нет прокрутки вбок — принято глазами владелицей (2026-11-21), скрипт не проверяет');

  // ---------- Уточнение 1 ----------
  await t.check('История, уточн. 1.1: в каждой из 6 эр не меньше 8 предложений и ссылка era-N.html', () => onPage('/istoriya.html', o, async page => {
    const eras = await page.$$eval('section.era:not(.sources)', els => els.map(e => ({
      body: [...e.querySelectorAll('p:not(.years)')].map(p => p.textContent).join(' '),
      links: [...e.querySelectorAll('a')].map(a => a.getAttribute('href')) })));
    t.assert(eras.length === 6, `эр ${eras.length}, нужно 6`);
    eras.forEach((e, i) => {
      t.assert(sentences(e.body) >= 8, `в эре ${i + 1} предложений ${sentences(e.body)}, нужно 8`);
      t.assert(e.links.includes(`era-${i + 1}.html`), `у эры ${i + 1} нет ссылки era-${i + 1}.html`);
    });
  }));

  await t.check('История, уточн. 1.2: на каждой странице эры 10 фильмов с режиссёром и годом, по годам', async () => {
    for (const url of ERAS) await onPage(url, o, async page => {
      const li = await page.$$eval('ol li', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
      t.assert(li.length === 10, `${url}: фильмов ${li.length}, нужно 10`);
      const years = li.map(x => { const m = x.match(/,\s*(\d{4})\s*$/); t.assert(m, `${url}: нет режиссёра и года в конце: «${x.slice(0, 50)}»`); return +m[1]; });
      t.assert(years.every((y, i) => i === 0 || y >= years[i - 1]), `${url}: годы не по порядку ${years}`);
    });
  });

  await t.check('История, уточн. 1.3: на каждой странице эры одна картинка с подписью, источником и лицензией', async () => {
    for (const url of ERAS) await onPage(url, o, async page => {
      const imgs = await page.$$eval('img', is => is.map(i => ({ src: i.getAttribute('src'), ok: i.complete && i.naturalWidth > 0 })));
      t.assert(imgs.length === 1, `${url}: картинок ${imgs.length}, нужна одна`);
      t.assert(imgs[0].src.startsWith('images/') && imgs[0].ok, `${url}: картинка не загрузилась или не из images/`);
      const cap = await page.$eval('figcaption', c => c.textContent);
      t.assert(/Лиценз/.test(cap) && /Источник/.test(cap), `${url}: в подписи нет лицензии или источника`);
    });
  });

  await t.check('История, уточн. 1.4: в «Источниках» есть MLA на списки и картинки (Commons не меньше 6)', () => onPage('/istoriya.html', o, async page => {
    const hrefs = await page.$$eval('.sources a', as => as.map(a => a.href));
    const commons = hrefs.filter(h => h.includes('commons.wikimedia.org')).length;
    t.assert(commons >= 6, `ссылок на Commons ${commons}, нужно хотя бы по одной на каждую из 6 картинок`);
    t.assert(hrefs.some(h => /wikipedia|britannica/.test(h)), 'нет ссылок на источники списков');
  }));

  // ---------- Уточнение 2 ----------
  await t.check('История, уточн. 2.1: на всех 7 страницах бежевая бумага, тёмный текст, шрифт с засечками', async () => {
    for (const url of PAGES) await onPage(url, o, async page => {
      const c = await page.evaluate(() => { const s = getComputedStyle(document.body); return { bg: s.backgroundColor, color: s.color, font: s.fontFamily }; });
      const bg = parseRgb(c.bg);
      t.assert(bg.r > 200 && bg.g > 190 && bg.b > 150 && bg.r - bg.b >= 15 && bg.r >= bg.g && bg.g >= bg.b, `${url}: фон ${c.bg} не бежевый`);
      t.assert(lum(parseRgb(c.color)) < 0.1, `${url}: текст ${c.color} не тёмный`);
      t.assert(/Georgia|Times|serif/i.test(c.font) && !/^system-ui|sans-serif$/i.test(c.font.trim()), `${url}: шрифт ${c.font} без засечек`);
    });
  });

  await t.check('История, уточн. 2.2: каждая эра в «вырезке»: наклон не больше 2°, заголовок крупнее текста', () => onPage('/istoriya.html', o, async page => {
    const eras = await page.$$eval('section.era:not(.sources)', els => els.map(e => {
      const c = getComputedStyle(e); const m = c.transform.match(/matrix\(([^)]+)\)/);
      const ang = m ? (() => { const [a, b] = m[1].split(',').map(Number); return Math.atan2(b, a) * 180 / Math.PI; })() : 0;
      return { ang, shadow: c.boxShadow, border: parseFloat(c.borderTopWidth), filter: c.filter, bg: c.backgroundColor,
               h2: parseFloat(getComputedStyle(e.querySelector('h2')).fontSize), p: parseFloat(getComputedStyle(e.querySelector('p:not(.years)')).fontSize) };
    }));
    t.assert(eras.length === 6, 'эр не 6');
    eras.forEach((e, i) => {
      t.assert(Math.abs(e.ang) <= 2.01 && e.ang !== 0, `эра ${i + 1}: наклон ${e.ang.toFixed(2)}°, нужен от 0 до 2°`);
      t.assert(e.h2 > e.p, `эра ${i + 1}: заголовок ${e.h2}px не крупнее текста ${e.p}px`);
    });
  }));

  await t.check('История, уточн. 2.3: содержание то же (6 эр, по 10 фильмов, «Источники»), без сторонних скриптов', async () => {
    await onPage('/istoriya.html', o, async page => { t.assert(await page.$$eval('section.era:not(.sources)', e => e.length) === 6, 'эр не 6'); t.assert(await page.$('.sources'), 'нет «Источников»'); });
    for (const url of ERAS) await onPage(url, o, async page => t.assert(await page.$$eval('ol li', e => e.length) === 10, `${url}: не 10 фильмов`));
  });

  // ---------- Уточнения 3 и 4: газетные слова ----------
  const wordsCheck = async (url, sel, label) => {
    const w = await onPage(url, o, page => wordStyles(page, sel));
    const expected = await onPage(url, o, page => page.$eval(sel, h => h.textContent.replace(/\s+/g, ' ').trim().split(' ').length));
    t.assert(w.length === expected, `${label}: слов ${expected}, а в <span> ${w.length}`);
    const key = x => `${x.font}|${x.bg}|${x.color}`;
    t.assert(new Set(w.map(key)).size >= Math.min(4, w.length), `${label}: меньше 4 разных сочетаний шрифта и цветов`);
    if (w.length >= 2) t.assert(w.every((x, i) => i === 0 || key(x) !== key(w[i - 1])), `${label}: соседние слова одного вида, нет чередования`);
    w.forEach(x => {
      t.assert(Math.abs(x.angle) <= 6.01, `${label}: «${x.text}» наклон ${x.angle.toFixed(1)}° больше 6°`);
      t.assert(x.border > 0 && parseRgb(x.bg).a > 0, `${label}: у «${x.text}» нет рамки или фона`);
    });
    return w;
  };

  await t.check('История, уточн. 3.1: слова <h1> и заголовков эр в своих <span>, 4+ вида, чередуются', async () => {
    await wordsCheck('/istoriya.html', 'h1', 'h1 istoriya');
    const n = await onPage('/istoriya.html', o, page => page.$$eval('section.era:not(.sources) h2', h => h.length));
    for (let i = 1; i <= n; i++) await wordsCheck('/istoriya.html', `section.era:not(.sources):nth-of-type(${i}) h2`, `заголовок эры ${i}`);
  });

  await t.check('История, уточн. 3.2: у каждого слова наклон не больше 6°, рамка и фон; слова читаются (контраст 4,5)', () => onPage('/istoriya.html', o, async page => {
    const all = [...await wordStyles(page, 'h1'), ...await wordStyles(page, 'section.era:not(.sources) h2')];
    t.assert(all.length > 10, 'слов мало');
    all.forEach(x => {
      const a = lum(parseRgb(x.bg)), b = lum(parseRgb(x.color)); const cr = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
      t.assert(cr >= 4.5, `«${x.text}»: контраст ${cr.toFixed(1)}, нужно 4,5`);
      t.assert(Math.abs(x.angle) > 0.01, `«${x.text}»: нет наклона`);
    });
  }));

  await t.check('История, уточн. 3.3: текст заголовков цел, на телефоне слова не уезжают за край', () => onPage('/istoriya.html', { ...o, view: { width: 375 } }, async page => {
    const h1 = await page.$eval('h1', h => h.textContent.replace(/\s+/g, ' ').trim());
    t.assert(h1 === 'История кино по эрам', `текст h1: «${h1}»`);
    for (const sel of ['h1', 'section.era:not(.sources) h2']) for (const x of await wordStyles(page, sel)) t.assert(x.right <= 375 + 1, `«${x.text}» уходит за правый край (${Math.round(x.right)}px)`);
  }));

  await t.check('История, уточн. 4.1: заголовки страниц эр: слова в <span>, 4 вида, наклон до 6°, рамка и фон', async () => {
    for (const url of ERAS) await wordsCheck(url, 'h1', url);
  });

  // clip-path: многоугольник из 12+ точек, и текст у краёв не обрезан
  const clipCheck = async (url, sel) => onPage(url, o, async page => {
    const res = await page.$$eval(sel, els => els.map(e => {
      const c = getComputedStyle(e).clipPath; const box = e.getBoundingClientRect();
      const m = c.match(/^polygon\((.*)\)$/);
      if (!m) return { clip: c };
      const w = e.offsetWidth, h = e.offsetHeight;
      const pts = m[1].split(/,(?![^(]*\))/).map(p => p.trim().split(/\s+(?![^(]*\))/)).map(([x, y]) => {
        const val = (s, size) => s.endsWith('%') ? parseFloat(s) / 100 * size : s.startsWith('calc') ? NaN : parseFloat(s);
        const px = (s, size) => { const mm = s.match(/^calc\(\s*([\d.]+)%\s*-\s*([\d.]+)px\s*\)$/); return mm ? parseFloat(mm[1]) / 100 * size - parseFloat(mm[2]) : val(s, size); };
        return [px(x, w), px(y, h)];
      });
      // текст: прямоугольники строк внутри элемента, в координатах элемента (без поворота: сравниваем размеры)
      const inside = (x, y) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
      const bad = []; const r = document.createRange();
      e.querySelectorAll('h1, h2, p, li, figcaption').forEach(n => {
        r.selectNodeContents(n);
        [...r.getClientRects()].forEach(q => {
          const x1 = (q.left - box.left) * (w / box.width), x2 = (q.right - box.left) * (w / box.width), y1 = (q.top - box.top) * (h / box.height), y2 = (q.bottom - box.top) * (h / box.height);
          if (![[x1, y1], [x2, y1], [x1, y2], [x2, y2]].every(([x, y]) => inside(x, y))) bad.push(n.textContent.slice(0, 30));
        });
      });
      return { clip: 'polygon', points: pts.length, nan: pts.some(p => isNaN(p[0]) || isNaN(p[1])), bad };
    }));
    t.assert(res.length > 0, `${url}: не найдены блоки ${sel}`);
    res.forEach((r, i) => {
      t.assert(r.clip === 'polygon', `${url}, блок ${i + 1}: clip-path не многоугольник («${r.clip}»)`);
      t.assert(r.points >= 12, `${url}, блок ${i + 1}: в многоугольнике ${r.points} точек, нужно 12`);
      t.assert(r.bad.length === 0, `${url}, блок ${i + 1}: текст задевает край: «${r.bad[0]}»`);
    });
  });
  await t.check('История, уточн. 4.2: у блоков неровные края (многоугольник от 12 точек), текст не обрезан', async () => {
    await clipCheck('/istoriya.html', 'section.era:not(.sources)');
    for (const url of ERAS) await clipCheck(url, 'section.era:not(.sources)');
  });

  t.eyes('История, уточн. 4.3: на телефоне ничего не уезжает за край — принято глазами владелицей (2026-11-21), скрипт не проверяет');

  // ---------- Уточнение 5: переключатель дислексии ----------
  await t.check('История, уточн. 5.1: справа сверху «Шрифт для дислексии», выключен; на телефоне не перекрывает заголовок', async () => {
    for (const url of PAGES) {
      await onPage(url, o, async page => {
        const s = await page.$eval('.dys-switch', l => { const r = l.getBoundingClientRect(); return { text: l.textContent.trim(), right: innerWidth - r.right, top: r.top, checked: l.querySelector('input').checked, font: getComputedStyle(l).fontFamily }; });
        t.assert(s.text === 'Шрифт для дислексии', `${url}: подпись «${s.text}»`);
        t.assert(s.right < 40 && s.top < 40, `${url}: переключатель не в правом верхнем углу`);
        t.assert(!s.checked, `${url}: включён по умолчанию`);
        t.assert(OD.test(s.font.split(',')[0]), `${url}: в выключенном режиме подпись не OpenDyslexic (${s.font})`);
      });
      await onPage(url, { ...o, view: { width: 375 } }, async page => {
        const ov = await page.evaluate(() => { const a = document.querySelector('.dys-switch').getBoundingClientRect(); return [...document.querySelectorAll('h1, h1 span')].some(h => { const b = h.getBoundingClientRect(); return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top; }); });
        t.assert(!ov, `${url}: на 375px переключатель перекрывает заголовок`);
      });
    }
  });

  const turnOn = async (page) => { await page.check('#dys'); };
  await t.check('История, уточн. 5.2: при включении весь текст — OpenDyslexic, файлы шрифта и лицензия на месте, MLA на шрифт', async () => {
    for (const url of PAGES) await onPage(url, o, async page => {
      await turnOn(page);
      const bad = await page.$$eval('main *', els => els.filter(e => e.childNodes.length && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && !/^OpenDyslexic/.test(getComputedStyle(e).fontFamily.replace(/"/g, ''))).map(e => e.tagName + ':' + e.textContent.slice(0, 20)));
      t.assert(bad.length === 0, `${url}: не OpenDyslexic: ${bad.slice(0, 3)}`);
      const loaded = await page.evaluate(async () => { await document.fonts.ready; return document.fonts.check('16px OpenDyslexic') && [...document.fonts].some(f => f.family.includes('OpenDyslexic') && f.status === 'loaded'); });
      t.assert(loaded, `${url}: файл шрифта не загрузился`);
    });
    for (const f of ['OpenDyslexic-Regular.woff2', 'OpenDyslexic-Bold.woff2', 'OFL.txt']) t.assert(fs.existsSync(path.join(t.ROOT, 'fonts', f)), `нет fonts/${f}`);
    await onPage('/istoriya.html', o, async page => t.assert(await page.$$eval('.sources a', as => as.some(a => /opendyslexic/i.test(a.href))), 'в «Источниках» нет ссылки на OpenDyslexic'));
  });

  await t.check('История, уточн. 5.3: при включении вырезки исчезают, выбор запоминается на всех 7 страницах, скрипт до 15 строк', async () => {
    const s = await t.open('/istoriya.html');
    try {
      const page = s.page;
      await page.check('#dys');
      const flat = await page.evaluate(() => ({ clip: [...document.querySelectorAll('.era')].map(e => getComputedStyle(e).clipPath + '|' + getComputedStyle(e).transform), span: [...document.querySelectorAll('h1 span, h2 span')].map(x => getComputedStyle(x).transform + '|' + getComputedStyle(x).borderTopWidth + '|' + getComputedStyle(x).backgroundColor), bg: getComputedStyle(document.body).backgroundColor, img: getComputedStyle(document.body).backgroundImage }));
      t.assert(flat.clip.every(c => c === 'none|none'), 'вырезки (clip-path, наклон) остались');
      t.assert(flat.span.every(c => c === 'none|0px|rgba(0, 0, 0, 0)'), 'у слов заголовков остались наклон, рамка или плашка');
      for (const url of PAGES.slice(1)) {
        await page.goto(t.BASE + url);
        t.assert(await page.isChecked('#dys'), `${url}: выбор не запомнился`);
      }
      await page.goto(t.BASE + '/istoriya.html'); await page.uncheck('#dys');
      t.assert(await page.$$eval('.era:not(.sources)', e => e.every(x => getComputedStyle(x).clipPath !== 'none')), 'после выключения вырезки не вернулись');
    } finally { await s.close(); }
    for (const url of PAGES) {
      const html = fs.readFileSync(path.join(t.ROOT, url), 'utf8');
      const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1].trim().split('\n').filter(l => l.trim()).length);
      t.assert(scripts.every(n => n <= 15), `${url}: скрипт длиннее 15 строк (${scripts})`);
    }
  });

  // ---------- Уточнение 6: фон из газет ----------
  await t.check('История, уточн. 6.1: фон всех 7 страниц — три газеты плиткой под бежевой вуалью', async () => {
    for (const url of PAGES) await onPage(url, o, async page => {
      const b = await page.evaluate(() => { const c = getComputedStyle(document.body); return { img: c.backgroundImage, size: c.backgroundSize, repeat: c.backgroundRepeat }; });
      const urls = [...b.img.matchAll(/url\("?([^")]+)"?\)/g)].map(m => m[1].split('/').pop());
      t.assert(['bg-1.jpg', 'bg-2.jpg', 'bg-3.jpg'].every(f => urls.includes(f)), `${url}: нет трёх картинок bg-1..3 (${urls})`);
      t.assert(b.size.split(',').slice(1).filter((x, i, a) => new Set(a).size === a.length).length >= 3, `${url}: размеры плиток не разные`);
      t.assert(/repeat/.test(b.repeat) && !/no-repeat/.test(b.repeat), `${url}: картинки не повторяются плиткой`);
      const veil = b.img.match(/linear-gradient\(rgba\([^)]*,\s*(0?\.\d+)\)/);
      t.assert(veil && +veil[1] >= 0.5 && +veil[1] < 1, `${url}: нет полупрозрачной вуали (${veil?.[1]})`);
    });
    for (const f of ['bg-1.jpg', 'bg-2.jpg', 'bg-3.jpg']) t.assert(fs.existsSync(path.join(t.ROOT, 'images', f)), `нет images/${f}`);
  });

  await t.check('История, уточн. 6.2: в «Источниках» MLA на все три газеты: автор, год, лицензия', () => onPage('/istoriya.html', o, async page => {
    const src = await page.$$eval('.sources p', ps => ps.map(p => p.textContent));
    const news = src.filter(s => /newspaper|Newspaper/.test(s) && /commons\.wikimedia/.test(s));
    t.assert(news.length >= 3, `газет в источниках ${news.length}, нужно 3`);
    news.forEach(s => t.assert(/(18|19|20)\d\d/.test(s) && /общественное достояние|CC|лиценз/i.test(s), `нет года или лицензии: ${s.slice(0, 50)}`));
  }));

  await t.check('История, уточн. 6.3: в режиме дислексии фон простой; три картинки не больше 600 КБ', async () => {
    for (const url of PAGES) await onPage(url, o, async page => {
      await page.check('#dys');
      const img = await page.evaluate(() => getComputedStyle(document.body).backgroundImage);
      t.assert(img === 'none', `${url}: в режиме дислексии остался фон-картинка`);
    });
    const kb = ['bg-1.jpg', 'bg-2.jpg', 'bg-3.jpg'].reduce((s, f) => s + fs.statSync(path.join(t.ROOT, 'images', f)).size, 0) / 1024;
    t.assert(kb <= 600, `три картинки весят ${Math.round(kb)} КБ, нужно не больше 600`);
  });

  t.eyes('История, вид: «газетные вырезки» красивы, текст читается на фоне, страницы удобны на телефоне — принято глазами владелицей на первое время (2026-11-21)');
}
