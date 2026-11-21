#!/usr/bin/env bash
# Одноразовая установка для браузерной проверки (запускать из корня проекта):
#     bash proverka/ustanovka.sh
# Ставит Playwright и невидимый Chromium. Если в системе нет трёх библиотек
# (libnss3, libnspr4, libasound2) и нет прав администратора, распаковывает их
# в proverka/libs. Тогда sudo не нужен.
set -euo pipefail
cd "$(dirname "$0")"

npm install --no-audit --no-fund
npx playwright install chromium

LIBS="$PWD/libs/usr/lib/x86_64-linux-gnu"
if [ ! -f "$LIBS/libnss3.so" ] && ! ldconfig -p | grep -q 'libnss3.so'; then
  echo "Не хватает системных библиотек, распаковываю локально в proverka/libs"
  mkdir -p debs libs
  (cd debs && apt-get download libnspr4 libasound2t64 2>/dev/null || apt-get download libnspr4 libasound2)
  NSS=$(curl -s http://archive.ubuntu.com/ubuntu/pool/main/n/nss/ | grep -o 'libnss3_[^"]*amd64.deb' | sort -uV | tail -1)
  (cd debs && curl -sO "http://archive.ubuntu.com/ubuntu/pool/main/n/nss/$NSS")
  for d in debs/*.deb; do dpkg -x "$d" libs; done
  rm -rf debs
fi
echo "Готово. Проверка: ./check.sh"
