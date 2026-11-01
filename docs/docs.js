const demos = [
  { id: 'single', title: 'Один слайд', description: 'Базовый пример со стрелками и пагинацией. В конце списка можно вернуться к началу.', options: { rewind: true } },
  { id: 'multiple', title: 'Несколько слайдов', description: 'Три карточки в ряд, шаг в одну карточку и бесконечная прокрутка.', options: { type: 'loop', perPage: 3, perMove: 1, gap: 16 } },
  { id: 'responsive', title: 'Адаптивность', description: 'Три слайда на широком экране, два до 900 px и один до 600 px. Измените ширину окна.', options: { perPage: 3, perMove: 1, gap: 16, breakpoints: { 900: { perPage: 2 }, 600: { perPage: 1 } } } },
  { id: 'center', title: 'Центрирование', description: 'Активный слайд в центре, соседние карточки видны по краям.', options: { type: 'loop', perPage: 3, focus: 'center', gap: 16, padding: 24, breakpoints: { 600: { perPage: 1, padding: 40 } } } },
  { id: 'variable', title: 'Разная ширина', description: 'Ширину карточек задаёт ваш CSS. autoWidth сохраняет их размеры.', options: { autoWidth: true, focus: 0, gap: 16 }, variable: true },
  { id: 'autoplay', title: 'Автопрокрутка', description: 'Следующий слайд каждые 2,5 секунды. Наведение мыши или фокус внутри слайдера приостанавливает прокрутку.', options: { type: 'loop', perPage: 2, perMove: 1, gap: 16, autoplay: true, interval: 2500 }, autoplay: true },
  { id: 'dynamic', title: 'Добавление и удаление', description: 'Измените содержимое списка и вызовите refresh(), чтобы обновить раскладку и управление.', options: { perPage: 3, perMove: 1, gap: 16 }, dynamic: true },
  { id: 'lifecycle', title: 'Destroy и mount', description: 'Уничтожение восстанавливает исходную разметку. Тот же экземпляр можно запустить снова.', options: { perPage: 3, perMove: 1, gap: 16 }, lifecycle: true },
];

const options = [
  ['type', "'slide'", "'slide' или 'loop'. Задаётся до mount; для смены режима сначала вызовите destroy()."],
  ['perPage', '1', 'Целое положительное количество слайдов в видимой области. Для частично видимой карточки используйте padding или autoWidth.'],
  ['perMove', 'не задано', 'Шаг навигации. Без значения используется размер страницы, а при focus — один слайд.'],
  ['gap', 'не задано', 'Расстояние между слайдами. Число в px или CSS-значение, например 1rem.'],
  ['padding', 'не задано', 'Отступы трека. Число, CSS-значение или объект { left, right }.'],
  ['autoWidth', 'не задано', 'При true ширина слайда определяется содержимым и CSS. Режим задаётся до mount и не меняется через брейкпоинты.'],
  ['focus', 'не задано', "Позиция активного слайда. 'center' или индекс позиции, например 0."],
  ['trimSpace', 'true', 'Ограничивает свободное пространство по краям в режиме slide.'],
  ['start', '0', 'Индекс первого активного слайда. Отсчёт с нуля.'],
  ['rewind', 'не задано', 'При true навигация после конца возвращается к началу.'],
  ['drag', 'true', 'Разрешает перетаскивание мышью и пальцем.'],
  ['dragMinThreshold', '10', 'Порог начала жеста в px. Число задаёт порог касания; объект { mouse: 0, touch: 10 } настраивает оба устройства.'],
  ['flickPower', '600', 'Множитель скорости для расчёта инерции после быстрого свайпа, как в Splide.'],
  ['flickMaxPages', '1', 'Максимальная добавочная дистанция инерции в ширинах видимой области. Длинный drag может пройти дальше.'],
  ['noDrag', 'не задано', "CSS-селектор элементов, с которых нельзя начинать свайп. Для всей поверхности с потомками используйте '.zoomix-touch, .zoomix-touch *'."],
  ['speed', '400', 'Продолжительность перехода в миллисекундах. 0 — мгновенный переход.'],
  ['easing', "'cubic-bezier(0.25, 1, 0.5, 1)'", 'CSS-функция плавности перехода.'],
  ['waitForTransition', 'true', 'Игнорирует новые команды навигации во время перехода.'],
  ['arrows', 'true', 'Показывает стрелки. Существующие .splide__arrow переиспользуются.'],
  ['pagination', 'true', 'Создаёт кнопки пагинации.'],
  ['autoplay', 'не задано', 'true включает автоматическую прокрутку.'],
  ['interval', '5000', 'Интервал автоматической прокрутки в миллисекундах.'],
  ['pauseOnHover', 'true', 'Приостанавливает autoplay при наведении на корневой элемент.'],
  ['pauseOnFocus', 'true', 'Приостанавливает autoplay при фокусе внутри корневого элемента.'],
  ['keyboard', 'true', "Управление стрелками клавиатуры. 'focused' — только при фокусе внутри слайдера. false отключает."],
  ['breakpoints', 'не задано', 'Объект настроек по ширине окна. Ключи — значения в px.'],
  ['mediaQuery', "'max' (поведение)", "'max' применяет брейкпоинты до указанной ширины. 'min' — начиная с неё."],
  ['destroy', 'не задано', "В брейкпоинте true временно отключает слайдер с восстановлением. 'completely' отключает и отслеживание окна."],
  ['cloneStatus', 'true', 'Применяет активное состояние к копиям активного слайда в loop.'],
  ['slideFocus', 'true', 'Добавляет tabindex видимым слайдам.'],
];

const methods = [
  ['mount()', 'Запускает слайдер. После destroy() тот же экземпляр можно запустить повторно.'],
  ['go(index)', 'Переходит к слайду по индексу с нуля.'],
  ["go('+') · go('-')", "Шаг вперёд или назад на один слайд. '+2' и '-2' изменяют шаг."],
  ["go('>') · go('<')", "Следующая или предыдущая страница с учётом perMove. '>2' — страница с индексом 2."],
  ['on(events, callback)', 'Регистрирует обработчик одного или нескольких событий.'],
  ['off(events)', 'Удаляет обработчики указанного имени события и namespace.'],
  ['emit(name, ...args)', 'Вызывает обработчики события с переданными аргументами.'],
  ['refresh()', 'Перечитывает список слайдов, обновляет геометрию и управление. Восстанавливает исходные inline-стили слайдов.'],
  ['destroy(completely = true)', 'Удаляет управление, клоны и обработчики, восстанавливает разметку. false сохраняет отслеживание брейкпоинтов.'],
  ['is(type)', "Проверяет режим, например slider.is('loop')."],
];

const events = [
  ['mounted', '—', 'Компоненты смонтированы. Подписывайтесь до вызова mount().'],
  ['ready', '—', 'Экземпляр готов к работе.'],
  ['move · moved', 'newIndex, oldIndex, destIndex', 'Перед переходом и после его завершения. destIndex может указывать на клон.'],
  ['updated', 'options', 'Применены новые настройки.'],
  ['refresh', '—', 'Обновлён список и раскладка.'],
  ['active · inactive', 'slide', 'Изменилось активное состояние. Доступны slide.index, slide.slide и slide.isClone.'],
  ['visible · hidden', 'slide', 'Изменилась полная видимость слайда внутри трека.'],
  ['click', 'slide, event', 'Клик по слайду.'],
  ['drag · dragging · dragged', '—', 'Начало, движение и завершение перетаскивания.'],
  ['arrows:mounted', 'prev, next', 'Созданы или найдены стрелки.'],
  ['arrows:updated', 'prev, next, prevIndex, nextIndex', 'Обновлены disabled-состояния и подписи стрелок.'],
  ['pagination:mounted', 'data, item', 'Создана пагинация. data.list — список, data.items — элементы { li, button, page }.'],
  ['resize · resized', '—', 'Обработка изменения ширины окна.'],
  ['destroy', '—', 'Экземпляр уничтожен. Подписки удаляются.'],
];

const examples = {
  noDrag: { JavaScript: "const slider = new Splide('#gallery', {\n  type: 'loop',\n  noDrag: '.zoomix-touch, .zoomix-touch *'\n});\n\nslider.on('move', () => {\n  // Закройте зум через API вашей галереи.\n});\n\nslider.mount();\n\n// Настройку можно изменить без пересоздания экземпляра.\n// slider.options = { noDrag: '.zoomix-touch, .zoomix-touch *' };" },
  install: { HTML: '<link rel="stylesheet" href="./nano-swipe.css">\n<script defer src="./nano-swipe.js"></script>\n<script defer src="./app.js"></script>' },
  markup: { HTML: '<div class="splide" id="my-slider">\n  <div class="splide__track">\n    <div class="splide__list">\n      <div class="splide__slide">Первый слайд</div>\n      <div class="splide__slide">Второй слайд</div>\n      <div class="splide__slide">Третий слайд</div>\n    </div>\n  </div>\n</div>' },
  init: { JavaScript: "// app.js\nconst slider = new Splide('#my-slider', {\n  perPage: 1,\n  gap: 16,\n  rewind: true\n});\n\nslider.on('mounted', () => {\n  console.log('Слайдер готов', slider.length);\n});\n\nslider.mount();" },
  esm: { JavaScript: "import Splide from './nano-swipe.mjs';\n\nconst slider = new Splide('#my-slider', {\n  perPage: 3,\n  gap: 16\n}).mount();" },
  defaults: { JavaScript: 'Splide.defaults = { gap: 16, perMove: 1 };\nnew Splide(\'#my-slider\').mount();', HTML: '<div class="splide" id="my-slider"\n     data-splide=\'{"perPage": 3, "gap": "1rem"}\'>\n  <!-- .splide__track > .splide__list > .splide__slide -->\n</div>' },
  events: { JavaScript: "const slider = new Splide('#my-slider');\n\nslider.on('mounted', () => {\n  console.log(slider.length);\n});\nslider.on('moved.counter', (newIndex, oldIndex) => {\n  console.log(oldIndex, '→', newIndex);\n});\n\nslider.mount();\n\n// Позже, для удаления этого обработчика\n// slider.off('moved.counter');" },
};

let panelId = 0;
function codePanel(variants) {
  const panel = document.createElement('div');
  panel.className = 'code-panel';
  panel.innerHTML = '<div class="code-bar"><div class="code-tabs" role="tablist" aria-label="Код примера"></div><button class="code-copy" type="button">Копировать</button></div><pre role="tabpanel" tabindex="0"><code></code></pre>';
  const id = `code-${++panelId}`;
  const pre = panel.querySelector('pre');
  const code = panel.querySelector('code');
  pre.id = id;
  let selected = Object.keys(variants)[0];
  const buttons = Object.keys(variants).map((language, i) => {
    const button = document.createElement('button');
    button.type = 'button'; button.role = 'tab'; button.id = `${id}-tab-${i}`;
    button.textContent = language; button.setAttribute('aria-controls', id);
    button.addEventListener('click', () => select(language));
    panel.querySelector('.code-tabs').append(button);
    return button;
  });
  function select(language) {
    selected = language;
    code.textContent = variants[language];
    buttons.forEach(button => {
      const active = button.textContent === selected;
      button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1;
      if (active) pre.setAttribute('aria-labelledby', button.id);
    });
  }
  panel.querySelector('.code-tabs').addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    let index = buttons.findIndex(button => button.textContent === selected);
    if (event.key === 'Home') index = 0;
    else if (event.key === 'End') index = buttons.length - 1;
    else index = (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[index].click(); buttons[index].focus();
  });
  select(selected);
  const copy = panel.querySelector('.code-copy');
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(variants[selected]);
      copy.textContent = 'Скопировано';
      document.querySelector('#copy-status').textContent = 'Код скопирован';
    } catch {
      const range = document.createRange(); range.selectNodeContents(code);
      window.getSelection().removeAllRanges(); window.getSelection().addRange(range);
      copy.textContent = 'Нажмите Ctrl+C';
      document.querySelector('#copy-status').textContent = 'Код выделен для копирования';
    }
    setTimeout(() => { copy.textContent = 'Копировать'; }, 2000);
  });
  return panel;
}

function addTable(id, rows) {
  const body = document.querySelector(id);
  rows.forEach(values => {
    const row = document.createElement('tr');
    values.forEach(value => { const cell = document.createElement('td'); cell.textContent = value; row.append(cell); });
    body.append(row);
  });
}

for (const [index, demo] of demos.entries()) {
  demo.options = { keyboard: 'focused', ...demo.options };
  const section = document.createElement('article');
  section.className = 'demo'; section.id = demo.id;
  section.innerHTML = `<div class="demo-heading"><span class="demo-number">${String(index + 1).padStart(2, '0')}</span><h3>${demo.title}</h3></div><p>${demo.description}</p>`;
  const rootId = `demo-${demo.id}`;
  const cards = Array.from({ length: 6 }, (_, i) => `<div class="splide__slide"${demo.variable ? ` style="width:${[140, 220, 180, 280, 160, 240][i]}px"` : ''}>${String(i + 1).padStart(2, '0')}</div>`).join('\n      ');
  const markup = `<div class="splide" id="${rootId}" aria-label="${demo.title}">\n  <div class="splide__track">\n    <div class="splide__list">\n      ${cards}\n    </div>\n  </div>\n</div>`;
  const stage = document.createElement('div'); stage.className = 'demo-stage'; stage.innerHTML = markup;
  section.append(stage);
  const tools = document.createElement('div'); tools.className = 'demo-tools';
  let actionCode = '';
  if (demo.dynamic) {
    tools.innerHTML = '<button class="button" id="add-slide" type="button">+ Добавить</button><button class="button" id="remove-slide" type="button">− Удалить</button>';
    actionCode = `\n\ndocument.querySelector('#add-slide').addEventListener('click', () => {\n  const list = slider.Components.Elements.list;\n  const slide = document.createElement('div');\n  slide.className = 'splide__slide';\n  slide.textContent = String(slider.length + 1).padStart(2, '0');\n  list.append(slide);\n  slider.refresh();\n});\n\ndocument.querySelector('#remove-slide').addEventListener('click', () => {\n  if (slider.length > 1) {\n    slider.Components.Elements.slides.at(-1).remove();\n    slider.refresh();\n  }\n});`;
  }
  if (demo.lifecycle) {
    tools.innerHTML = '<button class="button" id="destroy-slider" type="button">destroy()</button><button class="button" id="mount-slider" type="button">mount()</button>';
    actionCode = `\n\ndocument.querySelector('#destroy-slider').addEventListener('click', () => {\n  slider.destroy();\n});\n\ndocument.querySelector('#mount-slider').addEventListener('click', () => {\n  if (slider.state.is(Splide.STATES.DESTROYED)) {\n    slider.mount();\n  }\n});`;
  }
  if (demo.autoplay) {
    tools.innerHTML = '<button class="button" id="toggle-autoplay" type="button" aria-pressed="true">Автопрокрутка включена</button>';
    actionCode = `\n\ndocument.querySelector('#toggle-autoplay').addEventListener('click', event => {\n  const autoplay = !slider.options.autoplay;\n  slider.options = { autoplay };\n  event.currentTarget.setAttribute('aria-pressed', String(autoplay));\n  event.currentTarget.textContent = autoplay\n    ? 'Автопрокрутка включена'\n    : 'Автопрокрутка выключена';\n});`;
  }
  const output = document.createElement('span'); output.className = 'demo-output';
  tools.append(output); section.append(tools);
  const optionsText = JSON.stringify(demo.options, null, 2);
  const js = `const slider = new Splide('#${rootId}', ${optionsText}).mount();${actionCode}`;
  const css = '.splide__slide {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  height: 168px;\n  background: #e8f1e7;\n  color: #22674d;\n  font-size: 54px;\n}';
  const html = markup + (demo.dynamic || demo.lifecycle || demo.autoplay ? `\n\n${tools.innerHTML.split('<span')[0]}` : '');
  section.append(codePanel({ JavaScript: js, HTML: html, CSS: css }));
  document.querySelector('#demo-list').append(section);
  // Execute the exact JavaScript shown in the panel so examples cannot drift from their snippets.
  const slider = new Function(`${js}\nreturn slider;`)();
  slider.root.splide = slider;
  const update = () => {
    if (slider.state.is(Splide.STATES.DESTROYED)) output.textContent = 'Слайдер выключен';
    else output.textContent = `${slider.index + 1} / ${slider.length} · perPage ${slider.options.perPage}`;
    if (demo.dynamic) section.querySelector('#remove-slide').disabled = slider.length <= 1;
    if (demo.lifecycle) {
      const destroyed = slider.state.is(Splide.STATES.DESTROYED);
      section.querySelector('#destroy-slider').disabled = destroyed;
      section.querySelector('#mount-slider').disabled = !destroyed;
    }
  };
  // destroy removes subscriptions, so lifecycle controls update their UI after each operation.
  const bindStatus = () => {
    slider.off('moved.docs updated.docs refresh.docs');
    slider.on('moved.docs updated.docs refresh.docs', update);
    update();
  };
  tools.addEventListener('click', bindStatus);
  bindStatus();
  update();
}

document.querySelectorAll('[data-code]').forEach(node => node.append(codePanel(examples[node.dataset.code])));
addTable('#options-body', options); addTable('#methods-body', methods); addTable('#events-body', events);

const navLinks = [...document.querySelectorAll('.sidebar nav a')];
const observer = new IntersectionObserver(entries => {
  for (const entry of entries) if (entry.isIntersecting) {
    navLinks.forEach(link => {
      if (link.hash === `#${entry.target.id}`) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }
}, { rootMargin: '-100px 0px -65% 0px', threshold: 0 });
navLinks.forEach(link => observer.observe(document.querySelector(link.hash)));

fetch('./docs-meta.json').then(response => response.json()).then(meta => {
  document.querySelectorAll('[data-version]').forEach(node => { node.textContent = meta.version; });
  const format = bytes => `${(bytes / 1024).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} КиБ`;
  document.querySelector('[data-js-size]').textContent = format(meta.jsGzip);
  document.querySelector('[data-css-size]').textContent = format(meta.cssGzip);
}).catch(() => {
  document.querySelector('[data-js-size]').textContent = '≤ 7 КиБ';
  document.querySelector('[data-css-size]').textContent = 'см. сборку';
});
