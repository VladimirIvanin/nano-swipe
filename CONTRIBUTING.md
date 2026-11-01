# Выпуски Nano Swipe

Используйте Node.js 24 и npm 11.5.1 или новее для публикации через GitHub Actions. Обычная разработка и сборка поддерживают Node.js 22 и новее.

Сначала выполните локальные проверки.

```sh
npm ci
npx playwright install chromium firefox webkit
npm test
npm run test:package
npm run test:docs
npm run check:release
```

`test:package` создаёт npm-архив, устанавливает его во временный проект и проверяет ESM, CommonJS, CSS, браузерную сборку и gzip. `check:release` запускает эту же проверку готовности пакета. В CI внешние сценарии виджетов пропускаются, если отсутствует `WIDGET_ROOT`. Их приёмка проверяется отдельно командой `check:widgets` и ведётся независимо от публикации npm.

Однократная настройка GitHub Pages

В репозитории `VladimirIvanin/nano-swipe` откройте Settings → Pages → Build and deployment и выберите Source → GitHub Actions. Workflow `deploy-docs.yml` проверяет и публикует документацию при обновлении `main`, публикации GitHub Release или ручном запуске. Адрес документации будет `https://vladimirivanin.github.io/nano-swipe/`.

Первая публикация npm-пакета

Имя пакета задаётся в `package.json`. После проверки пакета выполните первую публикацию из аккаунта владельца. npm может запросить подтверждение входа или 2FA.

```sh
npm run check:release
npm run test:package
npm pack --ignore-scripts
npm publish ./nano-swipe-0.1.0.tgz --access public
```

Команда приведена для текущей версии 0.1.0. Для предварительной версии используйте соответствующее имя архива и добавьте `--tag next`.

После появления пакета откройте его Settings → Trusted Publisher на npmjs.com и выберите GitHub Actions. Укажите пользователя `VladimirIvanin`, репозиторий `nano-swipe`, workflow `publish.yml`. Поле Environment оставьте пустым. Разрешите действие `npm publish`. Workflow получает временную авторизацию через OIDC. Настройку создавайте перед ближайшим выпуском, поскольку npm ограничивает срок её первичного подтверждения. [Настройка Trusted Publisher](https://docs.npmjs.com/trusted-publishers/)

Следующие выпуски

1. Обновите версию в `package.json` и `package-lock.json`, проверьте изменения и отправьте коммит в GitHub.
2. Создайте GitHub Release с тегом `v<версия>` на этом коммите. Для версии с суффиксом, например `0.2.0-beta.1`, отметьте Set as a pre-release.
3. Опубликуйте Release и дождитесь завершения workflow Publish to npm. Обычный выпуск получает npm-тег `latest`, предварительный — `next`.

Версия тега должна совпадать с версией пакета. Workflow заново собирает библиотеку, проверяет размер, поведение, документацию и npm-архив. Один архив используется для публикации в npm и прикрепляется к GitHub Release. Из него же извлекаются `nano-swipe.min.js`, `nano-swipe.css` и `nano-swipe.min.js.gz`.

После первой публикации файлы доступны через jsDelivr и UNPKG. Всегда указывайте одинаковую версию для JS и CSS.

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/nano-swipe@0.1.0/browser-build/nano-swipe.css">
<script defer src="https://cdn.jsdelivr.net/npm/nano-swipe@0.1.0/browser-build/nano-swipe.min.js"></script>
```

Эквивалентный путь UNPKG — `https://unpkg.com/nano-swipe@0.1.0/browser-build/nano-swipe.min.js`.
