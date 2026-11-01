const defaults = {
  type: 'slide', speed: 400, waitForTransition: true, perPage: 1, cloneStatus: true,
  arrows: true, pagination: true, interval: 5000, pauseOnHover: true, pauseOnFocus: true,
  resetProgress: true, keyboard: true, easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
  drag: true, direction: 'ltr', slideFocus: true, trimSpace: true,
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
    merge(this._base, value);
    this._resolve();
    if (this._mounted) {
      if (this.is('loop') && ('perPage' in value || 'drag' in value || 'autoWidth' in value)) this._collect();
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
    if (!(Number(resolved.perPage) > 0)) resolved.perPage = 1;
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
      this._resize = () => {
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
        } else this._layout();
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
      this._cloneCount = this.options.clones || (this.options.autoWidth ? slides.length : this.options.perPage) * (this.options.drag ? (this.options.flickMaxPages || 1) + 1 : 2);
      const clone = (index, before) => {
        const source = ((index % slides.length) + slides.length) % slides.length;
        const slide = slides[source].cloneNode(true);
        slide.classList.add('splide__slide--clone');
        slide.id = `${this.root.id}-clone${String(index + this._cloneCount + 1).padStart(2, '0')}`;
        list.insertBefore(slide, before);
        this._slides.push({ slide, index, slideIndex: source, isClone: true });
      };
      for (let i = -this._cloneCount; i < 0; i++) clone(i, slides[0]);
      for (let i = slides.length; i < slides.length + this._cloneCount; i++) clone(i, null);
      this._slides.sort((a, b) => a.index - b.index);
    }
  }

  _end() { return Math.max(0, this.length - (this.options.focus !== undefined || this.is('loop') && this.options.perMove ? 1 : this.options.perPage)); }
  _position(index) {
    const { list, track, slides } = this.Components.Elements;
    if (!slides.length) return 0;
    const item = this._slides.find(item => item.index === index) || this._slides.find(item => item.index === this.index);
    const first = list.firstElementChild;
    // DOMRect preserves fractional widths. offsetLeft rounds and accumulates drift in product rows.
    let offset = item.slide.getBoundingClientRect().left - first.getBoundingClientRect().left;
    if (this.options.focus === 'center') offset -= (track.clientWidth - this._padLeft - this._padRight - item.slide.getBoundingClientRect().width) / 2;
    else offset -= (Number(this.options.focus) || 0) * (item.slide.getBoundingClientRect().width + this._gap);
    if (!this.is('loop') && this.options.trimSpace) {
      const last = slides.at(-1);
      offset = clamp(offset, Math.max(0, last.getBoundingClientRect().right - first.getBoundingClientRect().left - track.clientWidth + this._padLeft + this._padRight));
    }
    return -offset;
  }

  _layout() {
    this._layoutBusy = true;
    const { track, list } = this.Components.Elements;
    const options = this.options;
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

  go(control) {
    if (!this._mounted || !this.length || (this._status === states.MOVING && this.options.waitForTransition)) return this;
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
    if (next === this.index) return this;
    clearTimeout(this._transitionTimer);
    const { list } = this.Components.Elements;
    if (this.is('loop') && this._status === states.MOVING) {
      const shift = this._position(this.index) - this._position(this._dest);
      if (shift) {
        const position = new DOMMatrix(getComputedStyle(list).transform).m41;
        list.style.transition = 'none';
        list.style.transform = `translateX(${position + shift}px)`;
        list.getBoundingClientRect();
      }
    }
    const old = this.index;
    this._dest = dest;
    this._index = next;
    this._status = states.MOVING;
    this.emit('move', next, old, dest);
    list.style.transition = `transform ${this.options.speed}ms ${this.options.easing}`;
    list.style.transform = `translateX(${this._position(dest)}px)`;
    const complete = () => {
      if (!this._mounted) return;
      list.style.transition = '';
      list.style.transform = `translateX(${this._position(next)}px)`;
      this._status = states.IDLE;
      this._update();
      this.emit('moved', next, old, dest);
    };
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
      prev.disabled = p === -1 && !this.is('loop'); next.disabled = n === -1 && !this.is('loop');
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
    if (this._mounted && this.options.autoplay && !document.hidden && !(this._hover && this.options.pauseOnHover) && !(this._focused && this.options.pauseOnFocus)) {
      this._interval = setInterval(() => this.go('>'), this.options.interval);
    }
  }

  _drag() {
    const { track, list } = this.Components.Elements;
    this._bind(track, 'pointerdown', event => {
      if (!this.options.drag || this._pointer || event.target.closest('.splide') !== this.root || event.button || this._status === states.MOVING || event.target.isContentEditable || event.target.closest('input,textarea,select,button') || this.options.noDrag && event.target.matches(this.options.noDrag)) return;
      this._pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, delta: 0 };
      this._suppressClick = false;
    });
    this._bind(window, 'pointermove', event => {
      const pointer = this._pointer;
      if (!pointer || pointer.id !== event.pointerId) return;
      const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
      if (!pointer.active && Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 5) { this._pointer = null; return; }
      if (!pointer.active && Math.abs(dx) > 5) {
        pointer.active = true; this._suppressClick = true; track.setPointerCapture(event.pointerId);
        clearInterval(this._interval); this.emit('drag');
      }
      if (pointer.active) {
        event.preventDefault(); pointer.delta = dx;
        list.style.transition = ''; list.style.transform = `translateX(${this._position(this.index) + dx}px)`;
        this.emit('dragging');
      }
    }, { passive: false });
    const finish = event => {
      const pointer = this._pointer;
      if (!pointer || pointer.id !== event.pointerId) return;
      this._pointer = null;
      if (pointer.active) {
        this.emit('dragged');
        const old = this.index;
        if (event.type !== 'pointercancel' && Math.abs(pointer.delta) > 20) {
          const target = this._position(old) + pointer.delta;
          let nearest = old, distance = Infinity;
          for (const item of this._slides) {
            const delta = Math.abs(this._position(item.index) - target);
            if (delta < distance) { distance = delta; nearest = item.index; }
          }
          this.go(nearest === old ? (pointer.delta < 0 ? '>' : '<') : nearest);
        }
        if (old === this.index) this._layout();
        setTimeout(() => { this._suppressClick = false; }, 0);
        this._autoplay();
      }
    };
    this._bind(window, 'pointerup', finish);
    this._bind(window, 'pointercancel', finish);
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
    this._arrowButtons = null; this._arrowsMounted = false; this._pointer = null;
    if (completely) { window.removeEventListener('resize', this._resize); this._watching = false; }
    this.emit('destroy'); this._events = [];
    return this;
  }
}

export { Splide };
