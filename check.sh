#!/usr/bin/env bash
# Проверка твоего продукта.
#
#     ./check.sh
#
# Она отвечает одним из двух: ЗЕЛЁНОЕ или КРАСНОЕ. Без мнений, без «почти».
#
# Сначала идут простые проверки файлов (страница есть, не пустая, заголовок свой).
# Потом, в пункте 10, невидимый браузер проходит по предикатам ВСЕХ сайтов
# (папка proverka/): история кино, расписание, аккаунт и живой запрос к Wikidata.
# Каждый запуск проверяет всё заново. Что скрипт проверить не может (красота,
# «читается»), он помечает ГЛАЗАМИ: это проверяешь ты сам.
#
# Зелёное значит «все проверки, которые мы написали, прошли». Не больше.
# Если ты добавил предикат, а проверки для него нет, зелёное про него молчит.

set -uo pipefail

PAGE=index.html
FAIL=0

g() { printf '\033[32m%s\033[0m' "$1"; }
r() { printf '\033[31m%s\033[0m' "$1"; }

ok()  { printf '  [ %s ] %s\n' "$(g 'ДА ')" "$1"; }
bad() { printf '  [ %s ] %s\n' "$(r 'НЕТ')" "$1"; FAIL=$((FAIL+1))
        printf '        -> %s\n' "$2"; }

echo
echo "  Проверка продукта"
echo "  ----------------------------------------------"

# 1. Страница есть
if [ -f "$PAGE" ]; then
  ok "страница $PAGE на месте"
else
  bad "страницы $PAGE нет" "попроси ИИ сделать $PAGE в корне проекта"
fi

# 2. Она не пустая
if [ -s "$PAGE" ]; then
  ok "страница не пустая"
else
  bad "страница пустая" "в ней должно быть хоть что-то"
fi

# 3. У неё есть заголовок
# ДВА СПОСОБА ВЫТАЩИТЬ ЗАГОЛОВОК, И ЭТО НЕ ПЕРЕСТРАХОВКА. Если на машине не
# окажется grep с поддержкой -P, первый способ вернёт пусто - и проверка
# соврёт, что заголовка нет, вместо того чтобы сказать правду. Поэтому есть
# второй. Проверка, которая врёт про причину, хуже отсутствующей.
TITLE=$(grep -oiP '(?<=<title>).*(?=</title>)' "$PAGE" 2>/dev/null | head -1 || true)
if [ -z "$TITLE" ]; then
  TITLE=$(sed -n 's/.*<title>\(.*\)<\/title>.*/\1/Ip' "$PAGE" 2>/dev/null | head -1 || true)
fi
if [ -n "$TITLE" ]; then
  ok "заголовок есть: $TITLE"
else
  bad "у страницы нет заголовка" "нужен тег <title> внутри <head>"
fi

# 4. Заголовок уже твой, а не из шаблона.
#    ЭТА СТРОКА КРАСНАЯ В ПЕРВУЮ МИНУТУ, И ЭТО ЕДИНСТВЕННОЕ, ЧТО ТУТ ВАЖНО.
#    Проверка, которая ни разу не была красной, ничего не доказывает: может,
#    она вообще ничего не проверяет. Эта - была.
if [ "$TITLE" = "Замени этот заголовок" ]; then
  bad "заголовок всё ещё из шаблона" "поменяй <title> на свой - это твой продукт, не наш"
else
  [ -n "$TITLE" ] && ok "заголовок свой, не из шаблона"
fi

# 5. Сайт истории кино: все 7 страниц на месте и не пустые
MISSING=""
for f in istoriya.html era-1.html era-2.html era-3.html era-4.html era-5.html era-6.html; do
  [ -s "$f" ] || MISSING="$MISSING $f"
done
if [ -z "$MISSING" ]; then
  ok "все 7 страниц сайта истории кино на месте"
else
  bad "нет страниц или они пустые:$MISSING" "проверь имена файлов: istoriya.html и era-1.html ... era-6.html"
fi

# 6. На каждой странице эры по 10 фильмов (10 пунктов <li>)
for n in 1 2 3 4 5 6; do
  f="era-$n.html"
  [ -s "$f" ] || continue
  COUNT=$(grep -o '<li' "$f" | wc -l)
  if [ "$COUNT" -eq 10 ]; then
    ok "$f: 10 фильмов"
  else
    bad "$f: фильмов $COUNT, а нужно 10" "открой $f и посчитай пункты списка"
  fi
done

# 7. Нет сторонних скриптов: ни у одной страницы нет <script src=
EXTERNAL=$(grep -l '<script[^>]*src=' index.html istoriya.html era-*.html 2>/dev/null | tr '\n' ' ')
if [ -z "$EXTERNAL" ]; then
  ok "нет сторонних скриптов (<script src=)"
else
  bad "сторонний скрипт в: $EXTERNAL" "в задании сказано: без библиотек"
fi

# 8. Все картинки из <img src="..."> лежат на диске
BROKEN=""
for f in istoriya.html era-*.html; do
  [ -s "$f" ] || continue
  for src in $(grep -o '<img[^>]*src="[^"]*"' "$f" | sed 's/.*src="//; s/"$//'); do
    case "$src" in http*) continue ;; esac
    [ -f "$src" ] || BROKEN="$BROKEN $f:$src"
  done
done
if [ -z "$BROKEN" ]; then
  ok "все картинки из страниц эр найдены"
else
  bad "нет файла картинки:$BROKEN" "проверь папку images/ и путь в src"
fi

# 9. Главная ведёт на istoriya.html
if grep -q 'href="istoriya.html"' "$PAGE" 2>/dev/null; then
  ok "с главной есть ссылка на istoriya.html"
else
  bad "на главной нет ссылки на istoriya.html" "добавь на $PAGE ссылку href=\"istoriya.html\""
fi

# 9б. Структура всех .html (doctype, lang, title, один h1, id, alt, битые ссылки)
if command -v node >/dev/null 2>&1; then
  HTML_BAD=$(node proverka/html.mjs 2>&1)
  if [ -z "$HTML_BAD" ]; then
    ok "структура всех .html: doctype, lang, title, один h1, id, alt, ссылки целы"
  else
    bad "в .html найдены проблемы" "$(printf '%s' "$HTML_BAD" | head -3 | tr '\n' ';')"
  fi
fi

# 10. Браузерная проверка ВСЕХ предикатов ВСЕХ сайтов (proverka/).
#     Невидимый браузер открывает страницы, нажимает кнопки, перезагружает,
#     наводит мышь и делает настоящий запрос к Wikidata (нужна сеть).
#     Каждый запуск ./check.sh проходит по всем сайтам заново.
#     Первый раз: bash proverka/ustanovka.sh
echo
echo "  Браузерная проверка (все сайты, живой запрос к Wikidata)"
if ! command -v node >/dev/null 2>&1; then
  bad "не найден node" "поставь Node.js, потом: bash proverka/ustanovka.sh"
elif [ ! -d proverka/node_modules/playwright ]; then
  bad "браузерная проверка не установлена" "выполни один раз: bash proverka/ustanovka.sh"
else
  [ -d proverka/libs/usr/lib/x86_64-linux-gnu ] && \
    export LD_LIBRARY_PATH="$PWD/proverka/libs/usr/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
  BROWSER_OUT=$(node proverka/run.mjs 2>&1)
  BROWSER_CODE=$?
  printf '%s\n' "$BROWSER_OUT"
  BROWSER_FAIL=$(printf '%s\n' "$BROWSER_OUT" | sed -n 's/.*браузер: ДА [0-9]*, НЕТ \([0-9]*\),.*/\1/p' | tail -1)
  if [ -z "$BROWSER_FAIL" ]; then
    # скрипт упал и даже не напечатал итог: это тоже НЕТ, причина выше
    bad "браузерная проверка не дошла до конца" "прочитай сообщение выше; код выхода $BROWSER_CODE"
  else
    FAIL=$((FAIL + BROWSER_FAIL))
  fi
fi

echo "  ----------------------------------------------"
if [ "$FAIL" -eq 0 ]; then
  printf '  %s\n\n' "$(g 'ЗЕЛЁНОЕ')"
else
  printf '  %s  - строк со словом НЕТ: %s\n\n' "$(r 'КРАСНОЕ')" "$FAIL"
fi

[ "$FAIL" -eq 0 ]
