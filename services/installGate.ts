/** Native: always allowed (no browser install gate). */
export function isStandalonePwa(): boolean {
  return true;
}

export function isMobileWebBrowser(): boolean {
  return false;
}

/** True when the user must install the PWA before using the app. */
export function mustInstallBeforeUse(): boolean {
  return false;
}

export function showInstallTutorial(): void {
  // no-op on native
}
