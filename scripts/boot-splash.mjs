/** Shared HTML/CSS for the Vybe vinyl boot splash (SPA index.html + docs). */

export const BOOT_BG = '#070806';

export const bootSplashCss = `
#vybe-boot {
  position: fixed;
  inset: 0;
  z-index: 99999;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 36px;
  background:
    radial-gradient(ellipse 70% 55% at 50% 42%, rgba(72, 210, 180, 0.14) 0%, transparent 55%),
    radial-gradient(ellipse 55% 45% at 58% 48%, rgba(64, 150, 255, 0.10) 0%, transparent 50%),
    ${BOOT_BG};
  transition: opacity 0.45s ease, visibility 0.45s ease, transform 0.45s ease;
}
.vybe-boot-stage {
  position: relative;
  width: 260px;
  height: 260px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.vybe-boot-glow {
  position: absolute;
  inset: -18%;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(120, 235, 200, 0.28) 0%, rgba(70, 160, 255, 0.12) 42%, transparent 70%);
  animation: vybe-glow 2.4s ease-in-out infinite;
  pointer-events: none;
}
.vybe-boot-disc {
  position: relative;
  width: 196px;
  height: 196px;
  border-radius: 50%;
  animation: vybe-spin 3.6s linear infinite;
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.06),
    0 22px 52px rgba(0, 0, 0, 0.45),
    0 0 64px rgba(90, 220, 190, 0.2);
  will-change: transform;
}
#vybe-boot img,
.vybe-boot-logo {
  width: 196px;
  height: 196px;
  border-radius: 50%;
  display: block;
  object-fit: cover;
}
.vybe-boot-notes {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: visible;
}
.vybe-note {
  position: absolute;
  left: 50%;
  top: 50%;
  font-size: 36px;
  line-height: 1;
  color: #9AF5D8;
  text-shadow: 0 0 18px rgba(120, 235, 200, 0.6);
  opacity: 0;
  animation: vybe-note 2.8s ease-out infinite;
  will-change: transform, opacity;
}
.vybe-note.n1 { --dx: -82px; --dy: -118px; --rot: -18deg; animation-delay: 0.15s; font-size: 40px; color: #8EF0D0; }
.vybe-note.n2 { --dx: 94px; --dy: -110px; --rot: 16deg; animation-delay: 0.55s; font-size: 34px; color: #7EC8FF; }
.vybe-note.n3 { --dx: -110px; --dy: -42px; --rot: -28deg; animation-delay: 0.95s; font-size: 32px; color: #A8F6E0; }
.vybe-note.n4 { --dx: 112px; --dy: -34px; --rot: 22deg; animation-delay: 1.25s; font-size: 36px; color: #6EB8FF; }
.vybe-note.n5 { --dx: -62px; --dy: -148px; --rot: 8deg; animation-delay: 1.6s; font-size: 28px; color: #B5FFE8; }
.vybe-note.n6 { --dx: 72px; --dy: -140px; --rot: -12deg; animation-delay: 2.0s; font-size: 32px; color: #8AD0FF; }
.vybe-boot-word {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-weight: 700;
  font-size: 36px;
  letter-spacing: -0.7px;
  color: #F4F7F2;
  opacity: 0;
  transform: translateY(8px);
  animation: vybe-word 0.7s ease 0.35s forwards;
}
#vybe-boot.hide {
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transform: scale(1.03);
}
@keyframes vybe-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
@keyframes vybe-glow {
  0%, 100% { opacity: 0.7; transform: scale(0.96); }
  50% { opacity: 1; transform: scale(1.04); }
}
@keyframes vybe-note {
  0% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.55) rotate(0deg);
  }
  18% { opacity: 0.95; }
  100% {
    opacity: 0;
    transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(1.05) rotate(var(--rot));
  }
}
@keyframes vybe-word {
  to { opacity: 1; transform: translateY(0); }
}
@media (prefers-reduced-motion: reduce) {
  .vybe-boot-disc,
  .vybe-boot-glow,
  .vybe-note { animation: none !important; }
  .vybe-boot-notes { display: none; }
  .vybe-boot-glow { opacity: 0.85; }
  .vybe-boot-word { opacity: 1; transform: none; animation: none; }
}
`;

export const bootSplashMarkup = `
<div id="vybe-boot" aria-hidden="true">
  <div class="vybe-boot-stage">
    <div class="vybe-boot-glow"></div>
    <div class="vybe-boot-notes">
      <span class="vybe-note n1">♪</span>
      <span class="vybe-note n2">♫</span>
      <span class="vybe-note n3">♩</span>
      <span class="vybe-note n4">♬</span>
      <span class="vybe-note n5">♪</span>
      <span class="vybe-note n6">♫</span>
    </div>
    <div class="vybe-boot-disc">
      <img src="/logo.png" alt="" width="196" height="196" class="vybe-boot-logo" decoding="async" />
    </div>
  </div>
  <div class="vybe-boot-word">Vybe</div>
</div>
<script>window.__vybeBootAt=Date.now();</script>
`;

export function buildBootHeadPatch() {
  return `<style id="vybe-boot-css">
html, body, #root {
  background-color: ${BOOT_BG} !important;
  background: ${BOOT_BG} !important;
}
html, body {
  color-scheme: dark;
  margin: 0;
  min-height: 100%;
  min-height: 100dvh;
}
${bootSplashCss}
</style>`;
}
