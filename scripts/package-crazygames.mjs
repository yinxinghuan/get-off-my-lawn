// Copy the Crazy Games Vite output into artifacts/ and zip it with index.html
// at the archive root (Crazy Games upload layout).
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist-crazygames');
const staticDir = path.join(root, 'artifacts', 'crazygames');
const zipPath = path.join(root, 'artifacts', 'get-off-my-lawn-crazygames.zip');

if (!existsSync(path.join(dist, 'index.html'))) {
  console.error('dist-crazygames/index.html is missing. Run vite build --mode crazygames first.');
  process.exit(1);
}

const banned = [
  'guest-shell.js',
  'apps.apple.com',
  'Get AlterU on the App Store',
  '下载 AlterU',
  'Open in AlterU',
  '在 AlterU 中打开',
  'Get Off My Lawn',
];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const file = path.join(dir, name);
    if (statSync(file).isDirectory()) out.push(...walk(file));
    else out.push(file);
  }
  return out;
}

const indexHtml = readFileSync(path.join(dist, 'index.html'), 'utf8');
const title = indexHtml.match(/<title>([^<]*)<\/title>/i);
if (!title || title[1].trim() !== 'Get Off My Grave') {
  console.error(`Crazy Games <title> must be "Get Off My Grave", got ${JSON.stringify(title && title[1])}`);
  process.exit(1);
}
for (const name of ['application-name', 'apple-mobile-web-app-title']) {
  const meta = indexHtml.match(new RegExp(`<meta\\s+name=["']${name}["']\\s+content=["']([^"']*)["']`, 'i'));
  if (!meta || meta[1] !== 'Get Off My Grave') {
    console.error(`Crazy Games meta ${name} must be "Get Off My Grave"`);
    process.exit(1);
  }
}

for (const file of walk(dist)) {
  if (!/\.(html|js|css)$/.test(file)) continue;
  const text = readFileSync(file, 'utf8');
  for (const needle of banned) {
    if (text.includes(needle)) {
      console.error(`${path.relative(root, file)} still contains ${JSON.stringify(needle)}`);
      process.exit(1);
    }
  }
}

rmSync(staticDir, { recursive: true, force: true });
mkdirSync(staticDir, { recursive: true });
cpSync(dist, staticDir, { recursive: true });

rmSync(zipPath, { force: true });
execFileSync('zip', ['-r', '-X', zipPath, '.'], { cwd: dist, stdio: 'inherit' });

const listing = execFileSync('unzip', ['-l', zipPath], { encoding: 'utf8' });
if (!listing.split('\n').some((line) => /\sindex\.html$/.test(line) && !line.includes('/'))) {
  console.error('zip is missing index.html at the archive root');
  process.exit(1);
}

console.log(`static: ${staticDir}`);
console.log(`zip: ${zipPath}`);
