const selector = 'input,textarea,select';
const controls = root => [...(root.matches(selector) ? [root] : []), ...root.querySelectorAll(selector)];

function copyControl(source, target) {
  if (!source || !target) return;
  if (source.type === 'file') target.files = source.files;
  else if (source.tagName === 'SELECT') {
    [...source.options].forEach((option, i) => { if (target.options[i]) target.options[i].selected = option.selected; });
    if (!source.multiple) target.selectedIndex = source.selectedIndex;
  } else {
    if (target.value !== source.value) target.value = source.value;
    if (source.tagName === 'INPUT') { target.checked = source.checked; target.indeterminate = source.indeterminate; }
  }
}

export function prepareClone(source, clone) {
  const nodes = [clone, ...clone.querySelectorAll('*')];
  const ids = new Map([[source.id, clone.id]]);
  let serial = 0;
  for (const node of nodes.slice(1)) {
    if (node.id) { const id = node.id; node.id = `${clone.id}-id${++serial}`; ids.set(id, node.id); }
  }
  for (const node of nodes) {
    for (const attribute of [...node.attributes]) {
      const { name, value } = attribute;
      if (/^(for|form|list|headers|aria-(labelledby|describedby|controls|owns|flowto|activedescendant|details|errormessage))$/.test(name)) {
        attribute.value = value.split(/\s+/).map(id => ids.get(id) || id).join(' ');
      } else if (/^(href|xlink:href)$/.test(name) && value[0] === '#' && ids.has(value.slice(1))) {
        attribute.value = `#${ids.get(value.slice(1))}`;
      } else if (value.includes('url(')) {
        attribute.value = value.replace(/url\((['"]?)#([^)'"\s]+)\1\)/g, (match, quote, id) => ids.has(id) ? `url(${quote}#${ids.get(id)}${quote})` : match);
      }
    }
  }
  const originals = controls(source);
  controls(clone).forEach((input, i) => {
    const ownForm = source.contains(originals[i].form);
    // Clones must not submit a second copy of the surrounding form's fields.
    if (originals[i].form && !ownForm) input.setAttribute('form', `${clone.id}-unowned`);
    if (input.type === 'radio' && input.name && !ownForm) input.name = `${clone.id}-${input.name}`;
    copyControl(originals[i], input);
  });
}

export function syncForms(slides, originals, event) {
  const clones = slides.filter(item => item.isClone);
  if (!clones.length) return;
  if (event) {
    const item = clones.find(item => item.slide.contains(event.target));
    if (item) {
      const index = controls(item.slide).indexOf(event.target);
      if (index >= 0) copyControl(event.target, controls(originals[item.slideIndex])[index]);
      else if (event.type === 'reset') controls(item.slide).forEach((source, i) => copyControl(source, controls(originals[item.slideIndex])[i]));
    }
  }
  for (const item of clones) {
    const source = controls(originals[item.slideIndex]);
    controls(item.slide).forEach((target, i) => copyControl(source[i], target));
  }
}
