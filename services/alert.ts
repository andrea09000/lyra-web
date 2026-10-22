import { Alert, Platform } from 'react-native';

export type AlertButton = {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
};

/** Cross-platform alert — RN Alert is a no-op on web. */
export function showAlert(title: string, message?: string, buttons?: AlertButton[]) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const btns = buttons?.length ? buttons : [{ text: 'OK' }];
    const cancel = btns.find((b) => b.style === 'cancel');
    const actions = btns.filter((b) => b.style !== 'cancel');
    const body = message ? `${title}\n\n${message}` : title;

    if (actions.length <= 1) {
      const ok = window.confirm(body);
      if (ok) actions[0]?.onPress?.();
      else cancel?.onPress?.();
      return;
    }

    const lines = actions.map((b, i) => `${i + 1}) ${b.text}`).join('\n');
    const raw = window.prompt(`${body}\n\n${lines}\n\nNumero (vuoto = annulla):`, '1');
    if (raw == null || raw.trim() === '') {
      cancel?.onPress?.();
      return;
    }
    const n = Number(raw.trim());
    if (Number.isFinite(n) && n >= 1 && n <= actions.length) {
      actions[n - 1]?.onPress?.();
    } else {
      cancel?.onPress?.();
    }
    return;
  }

  Alert.alert(title, message, buttons);
}
