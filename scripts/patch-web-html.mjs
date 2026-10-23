/**
 * Expo `web.output: "single"` ignores app/+html.tsx.
 * Patch dist/index.html so cold loads are dark + PWA-ready (no white/black void).
 *
 * Critical: do NOT put align-items/justify-content:center on #root — that collapses
 * the React Native Web tree to height 0 and leaves only the floating tab bar visible.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dist = join(process.cwd(), 'dist', 'index.html');
if (!existsSync(dist)) {
  console.error('[patch-web-html] dist/index.html missing — run expo export first');
  process.exit(1);
}

let html = readFileSync(dist, 'utf8');

const headInject = `
    <meta name="theme-color" content="#0A0A0A" />
    <meta name="description" content="Lyra — ascolta. Tieni il filo." />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="Lyra" />
    <meta name="application-name" content="Lyra" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="apple-touch-icon" sizes="180x180" href="/icon-180.png" />
    <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />
    <style id="lyra-boot">
      html, body, #root {
        height: 100%;
        width: 100%;
        margin: 0;
        padding: 0;
        background: #0A0A0A !important;
        color: #fff;
      }
      body {
        overflow: hidden;
        overscroll-behavior: none;
        -webkit-tap-highlight-color: transparent;
        min-height: 100%;
        min-height: 100dvh;
        min-height: -webkit-fill-available;
      }
      #root {
        display: flex;
        flex-direction: column;
        flex: 1;
        height: 100%;
        min-height: 100%;
        min-height: 100dvh;
        min-height: -webkit-fill-available;
        position: relative;
      }
      /* RN Web mounts a flex child — force it to fill the viewport */
      #root > * {
        flex: 1 1 auto;
        width: 100%;
        height: 100%;
        min-height: 100%;
        min-height: 100dvh;
        align-self: stretch;
      }
      #lyra-boot-mark {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        z-index: 0;
        pointer-events: none;
        font-family: system-ui, -apple-system, sans-serif;
        font-weight: 700;
        font-size: 28px;
        letter-spacing: -0.5px;
        color: #fff;
        opacity: 0.92;
      }
      #lyra-boot-mark::before {
        content: "";
        display: inline-block;
        width: 3px;
        height: 22px;
        margin-right: 10px;
        background: #3B82F6;
        border-radius: 1px;
        vertical-align: middle;
      }
      #lyra-status-fill {
        display: none !important;
      }
    </style>
`;

const bootStyle = headInject.match(/<style id="lyra-boot">[\s\S]*?<\/style>/)?.[0];
if (html.includes('id="lyra-boot"') && bootStyle) {
  // Replace a stale boot stylesheet (older builds centered #root and broke layout)
  html = html.replace(/<style id="lyra-boot">[\s\S]*?<\/style>/i, bootStyle);
} else if (!html.includes('id="lyra-boot"')) {
  html = html.replace(/<\/head>/i, `${headInject}</head>`);
}

if (!html.includes('id="lyra-boot-mark"')) {
  html = html.replace(
    /<div id="root"><\/div>/i,
    '<div id="root"><div id="lyra-boot-mark">Lyra</div></div>'
  );
}

// Prefer cover viewport for PWA notch
html = html.replace(
  /content="width=device-width, initial-scale=1, shrink-to-fit=no"/i,
  'content="width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no, viewport-fit=cover"'
);

writeFileSync(dist, html);
console.log('[patch-web-html] patched', dist);
