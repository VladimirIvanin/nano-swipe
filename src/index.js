import { prepareClone, syncForms } from './clones.js';

const defaults = {
  type: 'slide', speed: 400, waitForTransition: true, perPage: 1, cloneStatus: true,
  arrows: true, pagination: true, interval: 5000, pauseOnHover: true, pauseOnFocus: true,
  resetProgress: true, keyboard: true, easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
  drag: true, dragMinThreshold: 10, flickPower: 600, flickMaxPages: 1,
  direction: 'ltr', slideFocus: true, trimSpace: true,
  focusableNodes: 'a, button, textarea, input, select, iframe',
};
const merge = (target, source) => {
  for (const key in source) {
    const value = source[key];
    target[key] = value && Object.getPrototypeOf(value) === Object.prototype
      ? merge({ ...target[key] }, value) : value;
  }
  return target;
};
const unit = value => typeof value === 'number' ? `${value}px` : value || '0px';
const clamp = (value, max) => Math.max(0, Math.min(value, max));
const states = { CREATED: 1, MOUNTED: 2, IDLE: 3, MOVING: 4, DESTROYED: 5 };
let serial = 0;

export default class Splide {
  static defaults = {};
  static STATES = states;

  constructor(target, options = {}) {
    this.root = typeof target === 'string' ? document.querySelector(target) : target;
    if (!this.root) throw new Error('[splide] Invalid root.');
    this._base = merge(merge(merge({}, defaults), Splide.defaults), options);
    merge(this._base, JSON.parse(this.root.getAttribute('data-splide') || '{}'));
    this._options = {};
    this._events = [];
    this._bindings = [];
    this._saved = new Map();
    this.Components = {};
    this._index = this._base.start || 0;
    this._status = states.CREATED;
    this.state = { is: value => (Array.isArray(value) ? value : [value]).includes(this._status), set: value => { this._status = value; } };
    this._resolve();
  }

  get index() { return this._index; }
  get length() { return this.Components.Elements?.slides.length || 0; }
  get options() { return this._options; }
  set options(value) {
    const previous = this._base;
    this._base = merge(merge({}, previous), value);
    try { this._resolve(); } catch (error) { this._base = previous; throw error; }
    if (this._mounted) {
      if (this.is('loop') && ('perPage' in value || 'drag' in value || 'clones' in value || 'flickMaxPages' in value)) this._collect();
      this._layout();
      this._controls();
      this._update();
      this.emit('updated', this.options);
      this._autoplay();
    }
  }

  _resolve() {
    const resolved = merge({}, this._base);
    const min = resolved.mediaQuery === 'min';
    for (const point of Object.keys(resolved.breakpoints || {}).map(Number).sort((a, b) => min ? a - b : b - a)) {
      if (matchMedia(`(${min ? 'min' : 'max'}-width: ${point}px)`).matches) merge(resolved, this._base.breakpoints[point]);
    }
    const perPage = Number(resolved.perPage);
    if (perPage > 0 && !Number.isInteger(perPage)) throw new Error('[nano-swipe] perPage must be a positive integer.');
    resolved.perPage = perPage > 0 ? perPage : 1;
    if (resolved.clones != null && (!Number.isInteger(Number(resolved.clones)) || resolved.clones < 0)) throw new Error('[nano-swipe] clones must be a non-negative integer.');
    if (resolved.clones != null) resolved.clones = Number(resolved.clones);
    if (!Number.isFinite(Number(resolved.flickMaxPages)) || resolved.flickMaxPages < 0) throw new Error('[nano-swipe] flickMaxPages must be finite and non-negative.');
    for (const key of ['type', 'autoWidth']) {
      const normalized = value => key === 'autoWidth' ? !!value : value;
      if (this._mounted && normalized(resolved[key]) !== normalized(this.options[key])) throw new Error(`[nano-swipe] ${key} cannot change after mount; destroy first.`);
      for (const point of Object.values(this._base.breakpoints || {})) {
        if (key in point && normalized(point[key]) !== normalized(this._base[key])) throw new Error(`[nano-swipe] ${key} cannot change at a breakpoint.`);
      }
    }
    for (const key of Object.keys(this._options)) delete this._options[key];
    merge(this._options, resolved);
  }

  on(events, callback) {
    for (const name of [events].flat().join(' ').split(' ')) this._events.push({ name, callback });
    return this;
  }
  off(events) {
    const names = [events].flat().join(' ').split(' ');
    this._events = this._events.filter(event => !names.includes(event.name));
    return this;
  }
  emit(name, ...args) {
    for (const event of this._events.slice()) if (event.name.split('.')[0] === name) event.callback(...args);
    return this;
  }
  is(type) { return this.options.type === type; }

  _save(element) {
    if (!this._saved.has(element)) this._saved.set(element, new Map([...element.attributes].map(a => [a.name, a.value])));
  }
  _bind(element, event, callback, options) {
    element.addEventListener(event, callback, options);
    this._bindings.push(() => element.removeEventListener(event, callback, options));
  }
  _own(selector) {
    return [...this.root.querySelectorAll(selector)].find(el => el.closest('.splide') === this.root);
  }

  mount(extensions = {}, transition) {
    if (transition || Object.keys(extensions).length || this.options.direction !== 'ltr' || !['slide', 'loop'].includes(this.options.type) || this.options.grid || this.options.video) {
      throw new Error('[nano-swipe] This configuration requires Splide 3.');
    }
    if (this._mounted) throw new Error('[splide] Already mounted!');
    this._resolve();
    if (!this._watching) {
      this._viewportWidth = innerWidth;
      this._resize = () => {
        const widthChanged = this._viewportWidth !== innerWidth;
        this._viewportWidth = innerWidth;
        const previous = JSON.stringify(this.options);
        this._resolve();
        if (this.options.destroy) {
          if (this._mounted) this.destroy(this.options.destroy === 'completely');
          return;
        }
        if (!this._mounted) { this.mount(); return; }
        this.emit('resize');
        if (previous !== JSON.stringify(this.options)) {
          if (this.is('loop')) this._collect();
          this._layout(); this._controls(); this._update(); this.emit('updated', this.options); this._autoplay();
        } else if (widthChanged) this._layout();
        this._update(); this.emit('resized');
      };
      window.addEventListener('resize', this._resize);
      this._watching = true;
    }
    if (this.options.destroy) return this.destroy(this.options.destroy === 'completely');
    const track = this._own('.splide__track');
    const list = track?.querySelector('.splide__list');
    if (!track || !list) throw new Error('[splide] A track/list element is missing.');
    this._save(this.root); this._save(track); this._save(list);
    this.root.id ||= `splide${String(++serial).padStart(2, '0')}`;
    track.id ||= `${this.root.id}-track`;
    list.id ||= `${this.root.id}-list`;
    this.Components.Elements = { root: this.root, track, list, slides: [] };
    this._mounted = true;
    this._status = states.MOUNTED;
    this.root.classList.add('splide--slide', 'splide--ltr', 'splide--draggable');
    this.root.classList.toggle('splide--slide', !this.is('loop'));
    this.root.classList.toggle('splide--loop', this.is('loop'));
    this._collect();
    this._index = clamp(this.index, this.is('loop') ? this.length - 1 : this._end());
    this._layout();
    this._controls();
    this._bind(list, 'click', event => {
      if (this._suppressClick) { event.preventDefault(); event.stopImmediatePropagation(); return; }
      const item = this._slides.find(item => item.slide.contains(event.target));
      if (item) this.emit('click', item, event);
    }, true);
    const forms = event => {
      if (event.target.closest('.splide') === this.root) syncForms(this._slides, this.Components.Elements.slides, event);
    };
    this._bind(list, 'input', forms);
    this._bind(list, 'change', forms);
    this._bind(document, 'reset', event => {
      if (event.target.contains(this.root) || this.root.contains(event.target)) queueMicrotask(() => { if (this._mounted) syncForms(this._slides, this.Components.Elements.slides, event); });
    });
    this._drag();
    this._bind(this.root, 'mouseenter', () => { this._hover = true; this._autoplay(); });
    this._bind(this.root, 'mouseleave', () => { this._hover = false; this._autoplay(); });
    this._bind(this.root, 'focusin', () => { this._focused = true; this._autoplay(); });
    this._bind(this.root, 'focusout', () => { this._focused = false; this._autoplay(); });
    this._bind(document, 'visibilitychange', () => this._autoplay());
    this._bind(window, 'keydown', event => {
      if (this.options.keyboard && !/INPUT|TEXTAREA|SELECT/.test(event.target.tagName) && (this.options.keyboard !== 'focused' || this.root.contains(document.activeElement))) {
        if (event.key === 'ArrowLeft') this.go('<');
        if (event.key === 'ArrowRight') this.go('>');
      }
    });
    this._update();
    this.emit('mounted');
    this.root.classList.add('is-initialized', 'is-active');
    this._status = states.IDLE;
    this.emit('ready');
    this._autoplay();
    let observedWidth = track.clientWidth;
    this._observer = new ResizeObserver(() => {
      if (this._mounted && !this._layoutBusy && observedWidth !== track.clientWidth) {
        observedWidth = track.clientWidth; this._layout(); this._update();
      }
    });
    this._observer.observe(track);
    return this;
  }

  _collect() {
    const { list } = this.Components.Elements;
    list.querySelectorAll(':scope > .splide__slide--clone').forEach(el => el.remove());
    for (const element of this._saved.keys()) if (!this.root.contains(element)) this._saved.delete(element);
    const slides = [...list.children].filter(el => el.classList.contains('splide__slide'));
    this.Components.Elements.slides = slides;
    this._slides = slides.map((slide, index) => {
      this._save(slide);
      slide.id ||= `${this.root.id}-slide${String(index + 1).padStart(2, '0')}`;
      return { slide, index, slideIndex: -1, isClone: false };
    });
    this._cloneCount = 0;
    if (this.is('loop') && slides.length) {
      this._cloneCount = this.options.clones || Math.ceil((this.options.autoWidth ? slides.length : this.options.perPage) * (this.options.drag ? (this.options.flickMaxPages || 1) + 1 : 2));
      const clone = (index, before) => {
        const source = ((index % slides.length) + slides.length) % slides.length;
        const slide = slides[source].cloneNode(true);
        slide.classList.add('splide__slide--clone');
        slide.id = `${this.root.id}-clone${String(index + this._cloneCount + 1).padStart(2, '0')}`;
        prepareClone(slides[source], slide);
        list.insertBefore(slide, before);
        this._slides.push({ slide, index, slideIndex: source, isClone: true });
      };
      for (let i = -this._cloneCount; i < 0; i++) clone(i, slides[0]);
      for (let i = slides.length; i < slides.length + this._cloneCount; i++) clone(i, null);
      this._slides.sort((a, b) => a.index - b.index);
    }
  }

  _end() { return Math.max(0, this.length - (this.options.focus !== undefined || this.is('loop') && this.options.perMove ? 1 : this.options.perPage)); }
  _scale() {
    const { list } = this.Components.Elements;
    return list.getBoundingClientRect().width / parseFloat(getComputedStyle(list).width) || 1;
  }
  _measure() {
    const { list, track } = this.Components.Elements;
    // Layout widths retain fractional precision without including visual transforms
    // on active cards. offsetLeft rounds; DOMRect includes scale/translate effects.
    // Reuse one geometry snapshot throughout a drag instead of rescanning every
    // card for both limits on each move and for every candidate on release.
    this._geometry = new Map();
    let total = 0, gap = 0;
    for (const child of list.children) {
      const style = getComputedStyle(child);
      if (style.display === 'none') continue;
      const size = parseFloat(style.width) || 0;
      this._geometry.set(child, [total, size]);
      gap = parseFloat(style.marginRight) || 0;
      total += size + gap;
    }
    this._size = total - gap;
    this._width = track.clientWidth;
  }

  _position(index) {
    if (!this.length) return 0;
    const item = this._slides.find(item => item.index === index) || this._slides.find(item => item.index === this.index);
    let [offset, width] = this._geometry.get(item.slide) || [0, 0];
    if (this.options.focus === 'center') offset -= (this._width - this._padLeft - this._padRight - width) / 2;
    else offset -= (Number(this.options.focus) || 0) * (width + this._gap);
    if (!this.is('loop') && this.options.trimSpace) {
      offset = clamp(offset, Math.max(0, this._size - this._width + this._padLeft + this._padRight));
    }
    return -offset;
  }

  _layout() {
    this._layoutBusy = true;
    const { track, list } = this.Components.Elements;
    const options = this.options;
    if (!options.drag) this._cancelDrag?.();
    const padding = options.padding;
    track.style.paddingLeft = unit(typeof padding === 'object' ? padding.left : padding);
    track.style.paddingRight = unit(typeof padding === 'object' ? padding.right : padding);
    const computed = getComputedStyle(track);
    this._padLeft = parseFloat(computed.paddingLeft) || 0;
    this._padRight = parseFloat(computed.paddingRight) || 0;
    this._slides.forEach(({ slide }) => {
      slide.style.marginRight = unit(options.gap);
      if (!options.autoWidth) slide.style.width = `calc((100% + ${unit(options.gap)}) / ${options.perPage} - ${unit(options.gap)})`;
    });
    this._gap = this._slides.length ? parseFloat(getComputedStyle(this._slides[0].slide).marginRight) || 0 : 0;
    this._measure();
    this._index = clamp(this.index, this.is('loop') ? this.length - 1 : this._end());
    list.style.transition = '';
    list.style.transform = `translateX(${this._position(this.index)}px)`;
    this._layoutBusy = false;
  }

  _adjacent(back) {
    const step = this.options.perMove || (this.options.focus !== undefined ? 1 : this.options.perPage);
    let next = this.index + (back ? -step : step);
    if (!this.options.perMove && this.options.focus === undefined && next >= 0 && next <= this._end()) next = (this._page(this.index) + (back ? -1 : 1)) * this.options.perPage;
    if (!this.is('loop')) {
      if (next < 0) next = this.options.rewind ? this._end() : this.index ? 0 : -1;
      if (next > this._end()) next = this.options.rewind && this.index === this._end() ? 0 : this.index === this._end() ? -1 : this._end();
    }
    return next;
  }

  go(control, allowSameIndex = false) {
    if (!this._mounted || !this.length || (this._status === states.MOVING && this.options.waitForTransition)) return this;
    syncForms(this._slides, this.Components.Elements.slides);
    let dest = this.index;
    if (typeof control === 'number') dest = control;
    else {
      const [, command, amount] = String(control).match(/([+\-<>])(\d+)?/) || [];
      if (command === '+' || command === '-') {
        dest += (command === '+' ? 1 : -1) * (Number(amount) || 1);
        if (!this.is('loop') && this.options.rewind && (dest < 0 && this.index === 0 || dest > this._end() && this.index === this._end())) dest = dest < 0 ? this._end() : 0;
      }
      if (command === '>') dest = amount ? Number(amount) * (this.options.focus !== undefined ? 1 : this.options.perPage) : this._adjacent(false);
      if (command === '<') dest = this._adjacent(true);
      if (dest === -1 && (command === '>' || command === '<') && !this.is('loop')) return this;
    }
    if (!this.is('loop')) dest = clamp(dest, this._end());
    const next = this.is('loop') ? ((dest % this.length) + this.length) % this.length : dest;
    if (next === this.index && !allowSameIndex) return this;
    clearTimeout(this._transitionTimer);
    const { list } = this.Components.Elements;
    if (this.is('loop')) {
      this._measure();
      // As in Splide's Move.move(), shift equivalent copies before animating
      // toward the original. Animating to an outer clone can expose empty space.
      const shift = this._position(next) - this._position(dest);
      if (shift) {
        const position = new DOMMatrix(getComputedStyle(list).transform).m41;
        list.style.transition = 'none';
        list.style.transform = `translateX(${position + shift}px)`;
        list.getBoundingClientRect();
      }
    }
    const old = this.index;
    this._index = next;
    this._status = states.MOVING;
    this.emit('move', next, old, dest);
    this._measure();
    list.style.transition = `transform ${this.options.speed}ms ${this.options.easing}`;
    list.style.transform = `translateX(${this._position(next)}px)`;
    const complete = () => {
      this._completeMove = null;
      if (!this._mounted) return;
      this._measure();
      // Clearing the duration leaves a running transform transition alive when
      // its target is unchanged. Cancel it before measuring final visibility.
      list.style.transition = 'none';
      list.style.transform = `translateX(${this._position(next)}px)`;
      this._status = states.IDLE;
      this._update();
      this.emit('moved', next, old, dest);
    };
    this._completeMove = complete;
    if (this.options.speed) this._transitionTimer = setTimeout(complete, this.options.speed);
    else complete();
    this._autoplay();
    return this;
  }

  _controls() {
    const { track } = this.Components.Elements;
    let arrows = this._own('.splide__arrows');
    if (!arrows && this.options.arrows) {
      arrows = document.createElement('div');
      arrows.className = 'splide__arrows';
      arrows.innerHTML = '<button class="splide__arrow splide__arrow--prev" type="button"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="40" height="40"><path d="m15.5 0.9-4.3 4.4 14.8 14.7-14.8 14.7 4.3 4.4 19.1-19.1z"/></svg></button><button class="splide__arrow splide__arrow--next" type="button"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="40" height="40"><path d="m15.5 0.9-4.3 4.4 14.8 14.7-14.8 14.7 4.3 4.4 19.1-19.1z"/></svg></button>';
      this.root.insertBefore(arrows, this.root.firstChild);
      this._generatedArrows = arrows;
    }
    if (arrows) {
      this._save(arrows);
      arrows.style.display = this.options.arrows ? '' : 'none';
      for (const [direction, control] of [['prev', '<'], ['next', '>']]) {
        const button = arrows.querySelector(`.splide__arrow--${direction}`);
        if (button && !this._arrowButtons?.includes(button)) {
          this._save(button);
          this._bind(button, 'click', () => this.go(control));
          button.setAttribute('aria-controls', track.id);
        }
      }
      this._arrowButtons = ['prev', 'next'].map(dir => arrows.querySelector(`.splide__arrow--${dir}`));
      if (!this._arrowsMounted) { this.emit('arrows:mounted', ...this._arrowButtons); this._arrowsMounted = true; }
    }
    this._pagination?.remove();
    this._pages = [];
    if (this.options.pagination) {
      const list = document.createElement('ul');
      list.className = 'splide__pagination';
      const count = this.options.focus !== undefined ? this.length : Math.ceil(this.length / this.options.perPage);
      for (let page = 0; page < count; page++) {
        const li = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'splide__pagination__page';
        button.setAttribute('aria-controls', track.id);
        button.setAttribute('aria-label', `Go to ${this.options.perPage > 1 ? 'page' : 'slide'} ${page + 1}`);
        button.addEventListener('click', () => this.go(`>${page}`));
        li.append(button); list.append(li);
        this._pages.push({ li, button, page });
      }
      this.root.append(list);
      this._pagination = list;
      this.emit('pagination:mounted', { list, items: this._pages }, this._pages[0]);
    }
  }

  _update() {
    if (!this._mounted) return;
    const { track } = this.Components.Elements;
    const box = track.getBoundingClientRect();
    for (const item of this._slides) {
      const { slide, index, slideIndex, isClone } = item;
      const active = index === this.index || (isClone && this.options.cloneStatus && slideIndex === this.index);
      const bounds = slide.getBoundingClientRect();
      const visible = bounds.left >= box.left - 1 && bounds.right <= box.right + 1;
      if (slide.classList.contains('is-active') !== active) {
        slide.classList.toggle('is-active', active);
        this.emit(active ? 'active' : 'inactive', item);
      }
      slide.classList.toggle('is-prev', index === this.index - 1);
      slide.classList.toggle('is-next', index === this.index + 1);
      const hidden = !visible && (!active || isClone);
      if (hidden && slide.contains(document.activeElement)) {
        document.activeElement.blur();
        if (this.options.slideFocus) {
          const active = this.Components.Elements.slides[this.index];
          active.tabIndex = 0; active.focus({ preventScroll: true });
        }
      }
      if (hidden) slide.setAttribute('aria-hidden', 'true'); else slide.removeAttribute('aria-hidden');
      if (!hidden && this.options.slideFocus) slide.setAttribute('tabindex', '0'); else slide.removeAttribute('tabindex');
      slide.querySelectorAll(this.options.focusableNodes).forEach(node => {
        this._save(node);
        if (hidden || node.closest('.splide__slide[aria-hidden="true"]')) node.setAttribute('tabindex', '-1'); else node.removeAttribute('tabindex');
      });
      if (slide.classList.contains('is-visible') !== visible) {
        slide.classList.toggle('is-visible', visible);
        this.emit(visible ? 'visible' : 'hidden', item);
      }
    }
    const [prev, next] = this._arrowButtons || [];
    if (prev && next && this.options.arrows) {
      const p = this._adjacent(true), n = this._adjacent(false);
      const focused = document.activeElement;
      prev.disabled = p === -1 && !this.is('loop'); next.disabled = n === -1 && !this.is('loop');
      if (focused === prev && prev.disabled && !next.disabled) next.focus({ preventScroll: true });
      if (focused === next && next.disabled && !prev.disabled) prev.focus({ preventScroll: true });
      prev.setAttribute('aria-label', this.is('loop') && this.index === 0 || p > this.index ? 'Go to last slide' : 'Previous slide');
      next.setAttribute('aria-label', this.is('loop') && this.index === this.length - 1 || n !== -1 && n < this.index ? 'Go to first slide' : 'Next slide');
      const normalize = value => this.is('loop') ? (value + this.length) % this.length : value;
      this.emit('arrows:updated', prev, next, normalize(p), normalize(n));
    }
    const page = this._page(this.index);
    const current = this._pages?.[this.index === this._end() && !this.is('loop') ? this._pages.length - 1 : page];
    this._pages?.forEach(item => {
      item.button.classList.toggle('is-active', item === current);
      if (item === current) item.button.setAttribute('aria-current', 'true'); else item.button.removeAttribute('aria-current');
    });
  }

  _page(index) {
    return this.options.focus !== undefined ? index : Math.floor((index >= this.length - this.options.perPage ? this.length - 1 : index) / this.options.perPage);
  }

  _autoplay() {
    clearInterval(this._interval);
    if (this._mounted && this.options.autoplay && !this._pointer?.active && !document.hidden && !(this._hover && this.options.pauseOnHover) && !(this._focused && this.options.pauseOnFocus)) {
      this._interval = setInterval(() => this.go('>'), this.options.interval);
    }
  }

  _drag() {
    const { track, list } = this.Components.Elements;
    const start = event => {
      const touch = event.type === 'touchstart';
      // Use native touch events on phones, as Splide does. Safari can cancel the
      // pointer stream while the touch stream is still delivering the gesture.
      if (event.pointerType === 'touch') return;
      if (touch && event.touches.length !== 1) { finish({ type: 'touchcancel', changedTouches: event.touches }); return; }
      if (this._pointer || event.target.closest('.splide') !== this.root) return;
      this._suppressClick = false;
      if (!this.options.drag || event.isPrimary === false || event.button || event.target.isContentEditable || event.target.closest('input,textarea,select,button') || this.options.noDrag && event.target.matches(this.options.noDrag)) return;
      const point = touch ? event.changedTouches[0] : event;
      this._pointer = { id: touch ? point.identifier : event.pointerId, touch, x: point.clientX, y: point.clientY, base: { x: point.clientX, time: event.timeStamp } };
    };
    const pointOf = (event, pointer) => pointer.touch
      ? [...(event.changedTouches || [])].find(point => point.identifier === pointer.id)
      : event.pointerId === pointer.id ? event : null;
    const move = event => {
      const pointer = this._pointer;
      const point = pointer && pointOf(event, pointer);
      if (!point) return;
      const dx = point.clientX - pointer.x, dy = point.clientY - pointer.y;
      const thresholds = this.options.dragMinThreshold;
      const threshold = typeof thresholds === 'object' ? thresholds[pointer.touch ? 'touch' : 'mouse'] ?? (pointer.touch ? 10 : 0) : pointer.touch ? +thresholds || 10 : 0;
      if (!pointer.active && Math.max(Math.abs(dx), Math.abs(dy)) > threshold) {
        if (Math.abs(dy) > Math.abs(dx)) { this._pointer = null; return; }
        pointer.position = new DOMMatrix(getComputedStyle(list).transform).m41;
        if (this._status === states.MOVING) {
          clearTimeout(this._transitionTimer); this._completeMove?.();
        }
        this._measure();
        pointer.active = true; this._suppressClick = true;
        if (!pointer.touch) track.setPointerCapture(event.pointerId);
        clearInterval(this._interval); this.emit('drag');
      }
      if (pointer.active) {
        if (event.cancelable) event.preventDefault();
        let position = pointer.position + dx / this._scale();
        pointer.exceeded = false;
        if (!this.is('loop')) {
          const limit = Math.max(this._position(this._end()), Math.min(position, this._position(0)));
          pointer.exceeded = limit !== position;
          position = limit + (position - limit) / 5;
        }
        pointer.current = position;
        pointer.last = { x: point.clientX, time: event.timeStamp };
        if (event.timeStamp - pointer.base.time > 200) {
          pointer.previous = pointer.base; pointer.base = pointer.last;
        }
        list.style.transition = 'none'; list.style.transform = `translateX(${position}px)`;
        this.emit('dragging');
      }
    };
    const finish = event => {
      const pointer = this._pointer;
      if (!pointer || !pointOf(event, pointer)) return;
      this._pointer = null;
      if (!pointer.touch && track.hasPointerCapture(pointer.id)) track.releasePointerCapture(pointer.id);
      if (pointer.active) {
        this.emit('dragged');
        const old = this.index;
        if (!/cancel|lostpointercapture/.test(event.type)) {
          // Splide's 200 ms sampling window, flick projection and page cap.
          const base = pointer.base === pointer.last && pointer.previous || pointer.base;
          const elapsed = event.timeStamp - base.time;
          const velocity = !pointer.exceeded && elapsed > 0 && event.timeStamp - pointer.last.time < 200 ? (pointer.last.x - base.x) / elapsed / this._scale() : 0;
          const target = pointer.current + Math.sign(velocity) * Math.min(Math.abs(velocity) * this.options.flickPower, (track.clientWidth - this._padLeft - this._padRight) * this.options.flickMaxPages);
          this._measure();
          let nearest = old, distance = Infinity;
          for (const item of this._slides) {
            const delta = Math.abs(this._position(item.index) - target);
            if (delta < distance) { distance = delta; nearest = item.index; }
          }
          this.go(nearest, true);
        } else {
          this.go(old, true);
        }
        this._autoplay();
      }
    };
    this._cancelDrag = () => {
      const pointer = this._pointer;
      if (pointer) finish({ type: 'pointercancel', pointerId: pointer.id, changedTouches: [{ identifier: pointer.id }] });
    };
    this._bind(track, 'pointerdown', start);
    this._bind(track, 'touchstart', start, { passive: true });
    this._bind(window, 'pointermove', move, { passive: false });
    this._bind(track, 'touchmove', move, { passive: false });
    this._bind(window, 'pointerup', finish);
    this._bind(window, 'pointercancel', finish);
    this._bind(track, 'touchend', finish);
    this._bind(track, 'touchcancel', finish);
    this._bind(track, 'lostpointercapture', finish);
    this._bind(track, 'selectstart', event => { if (this._pointer) event.preventDefault(); });
    this._bind(track, 'dragstart', event => event.preventDefault());
  }

  refresh() {
    if (this._mounted) {
      clearTimeout(this._transitionTimer); this._status = states.IDLE;
      for (const slide of this.Components.Elements.slides) {
        const style = this._saved.get(slide)?.get('style');
        if (style === undefined) slide.removeAttribute('style'); else slide.setAttribute('style', style);
        slide.classList.remove('is-active', 'is-visible', 'is-prev', 'is-next');
      }
      this._collect(); this._layout(); this._controls(); this._update(); this.emit('refresh');
    }
    return this;
  }

  destroy(completely = true) {
    clearTimeout(this._transitionTimer); clearInterval(this._interval);
    this._observer?.disconnect();
    this._bindings.splice(0).forEach(unbind => unbind());
    this._slides?.filter(item => item.isClone).forEach(item => item.slide.remove());
    this._pagination?.remove(); this._generatedArrows?.remove();
    for (const [element, attributes] of this._saved) {
      for (const name of ['id', 'class', 'style', 'tabindex', 'aria-hidden', 'aria-controls', 'aria-label', 'aria-current', 'disabled']) {
        if (name === 'class') {
          for (const token of ['splide--slide', 'splide--loop', 'splide--ltr', 'splide--draggable', 'is-initialized', 'is-active', 'is-visible', 'is-prev', 'is-next']) {
            element.classList.toggle(token, (attributes.get(name) || '').split(' ').includes(token));
          }
          continue;
        }
        if (attributes.has(name)) element.setAttribute(name, attributes.get(name));
        else element.removeAttribute(name);
      }
    }
    this._saved.clear();
    this.root.classList.add('is-initialized');
    this._mounted = false; this._status = states.DESTROYED;
    this._arrowButtons = null; this._arrowsMounted = false; this._pointer = null; this._completeMove = null; this._cancelDrag = null;
    if (completely) { window.removeEventListener('resize', this._resize); this._watching = false; }
    this.emit('destroy'); this._events = [];
    return this;
  }
}

export { Splide };
