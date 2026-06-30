import { ScrollViewStyleReset } from "expo-router/html";
import { type PropsWithChildren } from "react";

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover, interactive-widget=overlays-content"
        />
        <meta name="theme-color" content="#7CFF3A" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="MYLIT" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta
          name="description"
          content="A sleep, energy, and quest-based productivity app for honest daily progress."
        />
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/favicon.png" type="image/png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <style
          dangerouslySetInnerHTML={{
            __html: `
              html, body, #root {
                height: 100%;
                width: 100%;
                min-height: 100svh;
                margin: 0;
                padding: 0;
                background: #02040A;
                overflow: hidden;
              }
              body {
                overscroll-behavior: none;
                -webkit-text-size-adjust: 100%;
                position: fixed;
                inset: 0;
              }
              #root {
                display: flex;
                flex-direction: column;
                flex: 1;
                min-height: 0;
                height: 100%;
              }
              input, textarea, select {
                font-size: 16px;
              }
              textarea:focus, input:focus {
                scroll-margin-bottom: calc(96px + env(safe-area-inset-bottom, 0px));
              }
              [role="tablist"] {
                display: none !important;
              }
            `,
          }}
        />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
