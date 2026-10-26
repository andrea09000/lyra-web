/**
 * Copy pwa-add-to-homescreen dist assets into /public for Expo web static serving.
 * Run after npm install / package upgrades: node scripts/sync-add-to-homescreen.mjs
 */
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'node_modules/pwa-add-to-homescreen/dist');
const out = join(root, 'public/add-to-homescreen');

if (!existsSync(dist)) {
  console.warn('pwa-add-to-homescreen not installed — skip sync');
  process.exit(0);
}

mkdirSync(join(out, 'assets'), { recursive: true });
cpSync(join(dist, 'assets/img'), join(out, 'assets/img'), { recursive: true });
cpSync(join(dist, 'add-to-homescreen.min.css'), join(out, 'add-to-homescreen.min.css'));
cpSync(join(dist, 'add-to-homescreen_it.min.js'), join(out, 'add-to-homescreen_it.min.js'));
console.log('Synced add-to-homescreen → public/add-to-homescreen');
