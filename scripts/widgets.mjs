import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'acorn';

export const widgetRoot = process.env.WIDGET_ROOT || 'D:/widget_types';
export function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (node.type) visit(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(item => walk(item, visit));
    else if (value && typeof value === 'object') walk(value, visit);
  }
}
export async function auditWidgets() {
  const rows = [];
  let verification;
  try { verification = JSON.parse(await readFile('reports/tests.json', 'utf8')); } catch { /* No browser report yet. */ }
  for (const dir of await readdir(widgetRoot, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const folder = join(widgetRoot, dir.name);
    let source;
    try { source = await readFile(join(folder, 'snippet.js'), 'utf8'); } catch { continue; }
    if (!/new\s+Splide\s*\(/.test(source)) continue;
    const ast = parse(source.replace(/^\uFEFF/, ''), { ecmaVersion: 'latest', allowReturnOutsideFunction: true });
    const constructors = [], events = new Set(), methods = new Set(), options = new Set();
    walk(ast, node => {
      if (node.type === 'NewExpression' && node.callee.name === 'Splide') {
        constructors.push(source.slice(node.start, node.end));
        for (const prop of node.arguments[1]?.properties || []) options.add(prop.key.name || prop.key.value);
      }
      if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression') {
        const property = node.callee.property.name;
        if (['go', 'mount', 'refresh', 'destroy', 'sync'].includes(property)) methods.add(property);
        if (property === 'on' && typeof node.arguments[0]?.value === 'string') {
          node.arguments[0].value.split(' ').forEach(name => events.add(name));
        }
      }
    });
    const excluded = [];
    if (/\.sync\(/.test(source)) excluded.push('sync');
    if (/["']ttb["']/.test(source)) excluded.push('ttb');
    if (/\bgrid\s*:|\.Extensions/.test(source)) excluded.push('extensions/grid');
    if (/\bvideo\s*:/.test(source)) excluded.push('video');
    // These product widgets also contain dynamic modal galleries. Keep the whole widget on Splide.
    if (/^system_widget_v4_product_/.test(dir.name) && source.includes('Components.Elements')) excluded.push('product modal gallery');
    const info = JSON.parse(await readFile(join(folder, 'info.json'), 'utf8'));
    const fixtureName = dir.name.match(/^system_widget_v4_promo_slider_(\d+)$/)?.[1];
    const specs = verification?.suites.flatMap(suite => suite.specs || []).filter(spec => spec.title.startsWith(`unchanged promo_slider_${fixtureName} JS,`)) || [];
    const browsers = specs.flatMap(spec => spec.tests.filter(result => result.status === 'expected').map(result => result.projectName));
    rows.push({ widget: dir.name, libraries: info.libraries?.filter(name => name.startsWith('splide')) || [],
      constructors, options: [...options].sort(), events: [...events].filter(name => /mount|update|move|active|pagination/.test(name)).sort(),
      methods: [...methods].sort(), excluded, status: excluded.length ? 'requires-splide' : 'candidate-unverified',
      scenarios: browsers.length ? [{ name: 'Unmodified widget JS on synthetic markup, pagination, movement and editor reinitialization', browsers }] : [],
      result: 'Full widget JS + Liquid + SCSS integration has not been certified.' });
  }
  return rows;
}
if (process.argv[1]?.endsWith('widgets.mjs')) {
  const widgets = await auditWidgets();
  await mkdir('reports', { recursive: true });
  await writeFile('reports/widgets.json', JSON.stringify({ root: widgetRoot, widgets }, null, 2) + '\n');
  console.log(`${widgets.length} widgets, ${widgets.reduce((n, row) => n + row.constructors.length, 0)} constructors, ${widgets.filter(row => !row.excluded.length).length} candidates, 0 certified full widgets`);
}
