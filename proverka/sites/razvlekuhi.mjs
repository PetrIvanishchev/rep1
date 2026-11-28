// Сайт «Расписание на неделю»: razvlekuhi/index.html.
// Предикаты: zadanie-6.md (счётчик событий). Остальные предикаты расписания
// (razvlekuhi/zadanie.md) пока смотрит человек.

const URL = '/razvlekuhi/index.html';
const LINE = /^Событий за неделю: (\d+), выполнено: (\d+)$/;

// Прочитать счётчик: [N, M] или ошибка с понятной причиной
async function count(page) {
  const el = page.locator('#schet');
  if (await el.count() === 0) throw new Error('нет строки счётчика (элемент с id="schet")');
  const text = (await el.textContent()).trim();
  const m = text.match(LINE);
  if (!m) throw new Error(`строка счётчика «${text}», а нужно «Событий за неделю: N, выполнено: M»`);
  return [Number(m[1]), Number(m[2])];
}

// Добавить событие в день n (0 — понедельник) через кнопку «+» и форму
async function add(page, n, title) {
  await page.click(`.track[data-day="${n}"] .add`);
  await page.fill('#form input[name="title"]', title);
  await page.click('#form button[type="submit"]');
}

// Нажать кнопку на событии понедельника, как человек: кнопки видны
// только при наведении мыши, поэтому сначала наводим, потом жмём
async function press(page, label) {
  const ev = page.locator('.track[data-day="0"] .event').first();
  await ev.hover();
  await ev.locator(`button[aria-label="${label}"]`).click();
}

const same = (got, want, what) => {
  if (got[0] !== want[0] || got[1] !== want[1])
    throw new Error(`${what}: счётчик ${got[0]}, ${got[1]}, а нужно ${want[0]}, ${want[1]}`);
  return true;
};

export default async function (t) {
  t.section('Расписание на неделю (razvlekuhi/index.html)');
  const s = await t.open(URL);
  const { page } = s;
  try {
    await t.check('6.3: счётчик стоит сразу под заголовком «Расписание на неделю»', async () => {
      const ok = await page.evaluate(() => {
        const h = document.querySelector('h1');
        return !!h && h.nextElementSibling && h.nextElementSibling.id === 'schet';
      });
      return t.assert(ok, 'сразу после <h1> нет элемента с id="schet"');
    });
    await t.check('6.3: на пустой неделе «Событий за неделю: 0, выполнено: 0»', async () =>
      same(await count(page), [0, 0], 'пустая неделя'));
    await t.check('6.3: добавил событие — N выросло на 1 (без перезагрузки)', async () => {
      await add(page, 0, 'Проверка 1');
      same(await count(page), [1, 0], 'после первого события');
      await add(page, 2, 'Проверка 2');
      return same(await count(page), [2, 0], 'после второго события в другой день');
    });
    await t.check('6.3: нажал ✓ — M выросло на 1, снял ✓ — M вернулось', async () => {
      await press(page, 'Отметить выполненным');
      same(await count(page), [2, 1], 'после ✓');
      await press(page, 'Вернуть событие');
      same(await count(page), [2, 0], 'после снятия ✓');
      await press(page, 'Отметить выполненным');
      return same(await count(page), [2, 1], 'после повторного ✓');
    });
    await t.check('6.3: удалил событие — N уменьшилось на 1', async () => {
      await press(page, 'Удалить событие');
      await page.click('#askYes');
      return same(await count(page), [1, 0], 'после удаления выполненного события');
    });
    await t.check('6.3: после перезагрузки счётчик считает сохранённые события', async () => {
      await s.reload();
      return same(await count(page), [1, 0], 'после перезагрузки');
    });
    await t.check('6.3: на странице нет ошибок скрипта', async () =>
      t.assert(s.errors.length === 0, s.errors[0] || ''));
  } finally { await s.close(); }
  t.eyes('6.3: строку счётчика видно и её удобно читать (обычный шрифт и шрифт для дислексии)');
}
