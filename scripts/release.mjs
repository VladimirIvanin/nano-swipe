import { readFile } from 'node:fs/promises';
const { widgets } = JSON.parse(await readFile('reports/widgets.json', 'utf8'));
const certified = widgets.filter(widget => widget.status === 'full-widget-certified');
if (certified.length < 81) throw new Error(`Release blocked: ${certified.length}/108 full widgets certified, at least 81 required. Constructor and synthetic fixture tests do not certify complete widgets.`);
console.log(`${certified.length}/108 widgets certified`);
