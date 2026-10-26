#!/usr/bin/env node
/**
 * Expo web `output: "single"` ignores app/+html.tsx.
 * Patch dist/index.html so the vinyl splash paints before JS loads.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { bootSplashMarkup, buildBootHeadPatch } from './boot-splash.mjs';

const distIndex = join(process.cwd(), 'dist', 'index.html');

if (!existsSync(distIndex)) {
  console.error('[inject-boot-splash] missing dist/index.html — run expo export first');
  process.exit(1);
}

let html = readFileSync(distIndex, 'utf8');

if (html.includes('id="vybe-boot"')) {
  console.log('[inject-boot-splash] already present, skip');
  process.exit(0);
}

const headPatch = buildBootHeadPatch();
if (html.includes('</head>')) {
  html = html.replace('</head>', `${headPatch}</head>`);
} else {
  html = headPatch + html;
}

if (html.includes('<body>')) {
  html = html.replace('<body>', `<body>${bootSplashMarkup}`);
} else if (html.includes('<body ')) {
  html = html.replace(/<body([^>]*)>/, `<body$1>${bootSplashMarkup}`);
} else {
  console.error('[inject-boot-splash] no <body> found');
  process.exit(1);
}

writeFileSync(distIndex, html);
console.log('[inject-boot-splash] injected vinyl splash into dist/index.html');
