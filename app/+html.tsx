import { ScrollViewStyleReset } from 'expo-router/html';
import type { ReactNode } from 'react';

/** Used on `expo export` / static builds. Dev Metro uses runtime injection (pwaMeta.web.ts). */
export default function Root({ children }: { children: ReactNode }) {
  return (
    <html lang="it">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no, viewport-fit=cover"
        />
        <meta name="theme-color" content="#0A0A0A" />
        <meta name="description" content="Lyra — ascolta. Tieni il filo." />

        {/* Mirror https://www.rika-firenet.com/web/ */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Lyra" />
        <meta name="application-name" content="Lyra" />
        <meta name="format-detection" content="telephone=no" />

        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icon-180.png" />
        <link rel="apple-touch-icon" href="/icon-180.png" />

        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: css }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

const css = `
html, body, #root {
  height: 100%;
  width: 100%;
  margin: 0;
  padding: 0;
  background-color: #0A0A0A;
}
html, body {
  background-color: #0A0A0A;
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
/* Never center #root children — that collapses RN Web to height:0 */
#root > * {
  flex: 1 1 auto;
  width: 100%;
  height: 100%;
  min-height: 100%;
  min-height: 100dvh;
  align-self: stretch;
}
/* Legacy overlay must never cover titles again */
#lyra-status-fill {
  display: none !important;
}
`;
