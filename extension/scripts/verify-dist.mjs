import { access, readFile, readdir } from 'node:fs/promises';

const requiredFiles = [
  'dist/manifest.json',
  'dist/popup.html',
  'dist/options.html',
  'dist/background.js',
  'dist/content.js',
  'dist/pdf-assets/standard_fonts/LiberationSans-Regular.ttf',
  'dist/pdf-assets/cmaps/Adobe-Japan1-UCS2.bcmap',
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

const assets = await readdir('dist/assets');
for (const pattern of [/^pdf\.worker\.min-.*\.mjs$/, /^docx\.worker-.*\.js$/]) {
  if (!assets.some((file) => pattern.test(file)))
    throw new Error('A required local resume parser worker is missing.');
}
if (
  'externally_connectable' in manifest ||
  'web_accessible_resources' in manifest ||
  'optional_host_permissions' in manifest
) {
  throw new Error('Unexpected external access to extension resources.');
}

console.log('Verified Manifest V3 output and least-privilege permission set.');
