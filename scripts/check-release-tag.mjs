import { readFile } from 'node:fs/promises';
const { version } = JSON.parse(await readFile('package.json', 'utf8'));
if (process.env.RELEASE_TAG !== `v${version}`) throw new Error(`Expected release tag v${version}`);
if (version.split('+')[0].includes('-') && process.env.PRERELEASE !== 'true') throw new Error('Mark a prerelease version as a GitHub pre-release');
console.log(`Release tag verified: v${version}`);
