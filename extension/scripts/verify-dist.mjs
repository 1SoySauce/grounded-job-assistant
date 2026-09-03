import { access, readFile } from 'node:fs/promises';

const requiredFiles = [
  'dist/manifest.json',
  'dist/popup.html',
  'dist/options.html',
  'dist/background.js',
  'dist/content.js',
];

await Promise.all(requiredFiles.map((file) => access(file)));

const manifest = JSON.parse(await readFile('dist/manifest.json', 'utf8'));
const expectedPermissions = ['activeTab', 'scripting', 'storage'];

if (manifest.manifest_version !== 3) {
  throw new Error('Production manifest must use Manifest V3.');
}

if (
  JSON.stringify(manifest.permissions) !== JSON.stringify(expectedPermissions)
) {
  throw new Error(
    'Production manifest permissions differ from the reviewed least-privilege set.',
  );
}

if ('host_permissions' in manifest || 'content_scripts' in manifest) {
  throw new Error(
    'Production manifest unexpectedly grants persistent page access.',
  );
}

if (manifest.background?.service_worker !== 'background.js') {
  throw new Error(
    'Production manifest does not reference the built service worker.',
  );
}

console.log('Verified Manifest V3 output and least-privilege permission set.');
