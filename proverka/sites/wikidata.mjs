// Главная (index.html): таблица 30 фильмов из Wikidata. Предикаты: zadanie-1.md.
// Запрос к Wikidata настоящий, нужна сеть. Нет сети: честное НЕТ с причиной.

async function loaded(t, opts = {}) {
  const s = await t.open('/index.html', { wait: 'domcontentloaded', ...opts });
  try {
    await s.page.waitForFunction(() => document.querySelectorAll('#movies tr').length > 0 || /Не удалось/.test(document.getElementById('status').textContent), null, { timeout: 45000 });
  } catch { await s.close(); throw new Error('за 45 секунд таблица не появилась и ошибки нет (нет сети или Wikidata не отвечает)'); }
  return s;
}
const rows = page => page.$$eval('#movies tr', trs => trs.map(tr => [...tr.children].map(td => td.textContent.trim())));

export default async function (t) {
  t.section('Главная и запрос к Wikidata (index.html)');
  const s = await loaded(t);
  const status = await s.page.$eval('#status', e => e.textContent);
  const data = await rows(s.page);
  const netErr = /Не удалось/.test(status) ? `Wikidata не ответила: ${status}` : null;

  await t.check('Задание 1.1: в таблице 30 строк, в каждой название, год, режиссёр и оценка', async () => {
    t.assert(!netErr, netErr);
    t.assert(data.length === 30, `строк ${data.length}, нужно 30`);
    data.forEach((r, i) => { t.assert(r.length === 5 && r.every(c => c !== ''), `строка ${i + 1} неполная: ${r}`); t.assert(/^\d{4}$/.test(r[2]), `строка ${i + 1}: год «${r[2]}»`); });
  });
  await t.check('Задание 1.2: оценки идут по убыванию', async () => {
    t.assert(!netErr, netErr);
    const r = data.map(x => parseFloat(x[4]));
    t.assert(r.every(x => x >= 0 && x <= 10), `есть оценка вне 0–10: ${r}`);
    t.assert(r.every((x, i) => i === 0 || x <= r[i - 1]), `оценки не по убыванию: ${r}`);
  });
  await t.check('Задание 1.4: ни один фильм не повторяется', async () => {
    t.assert(!netErr, netErr);
    const names = data.map(x => x[1].toLowerCase());
    const dup = names.filter((n, i) => names.indexOf(n) !== i);
    t.assert(dup.length === 0, `повторы: ${dup}`);
  });
  await t.check('Задание 1.3 (часть 1): при ошибке сети на странице видно сообщение, а не пустое место', async () => {
    // чистый запуск с блокировкой запроса: маршрут задаём до перехода
    const { chromium } = await import('playwright');
    const br = await chromium.launch(); const c = await br.newContext(); const p = await c.newPage();
    await p.route('**/query.wikidata.org/**', r => r.abort());
    await p.goto(t.BASE + '/index.html');
    await p.waitForFunction(() => /Не удалось/.test(document.getElementById('status').textContent), null, { timeout: 10000 }).catch(() => {});
    const msg = await p.$eval('#status', e => e.textContent);
    await br.close();
    t.assert(/Не удалось/.test(msg), `при обрыве сети в строке состояния «${msg}»`);
  });
  await t.check('Задание 1.3 (часть 2): страница читается на телефоне (375px, нет прокрутки вбок у страницы)', async () => {
    const m = await t.open('/index.html', { width: 375, wait: 'domcontentloaded' });
    try {
      await m.page.waitForTimeout(1500);
      const wide = await m.page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      t.assert(wide <= 1, `страница шире экрана на ${wide}px`);
    } finally { await m.close(); }
  });
  await t.check('Главная: заголовок и ссылка на «Историю кино» ведут на живую страницу', async () => {
    const title = await s.page.title();
    t.assert(title && title !== 'Замени этот заголовок', `title «${title}»`);
    const href = await s.page.$eval('a[href="istoriya.html"]', a => a.href);
    const r = await s.page.request.get(href);
    t.assert(r.status() === 200, `istoriya.html отвечает ${r.status()}`);
  });
  await s.close();
}
