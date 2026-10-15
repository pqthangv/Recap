// Alert.alert does nothing in a browser (react-native-web), so a confirmation such as "Delete
// deck?" would silently never appear. On the web this uses the browser's own boxes instead: a
// message with OK, or OK / Cancel when there's a choice. Recap's dialogs are one of those two.
import { Alert, Platform, type AlertButton, type AlertOptions } from 'react-native';

export function showAlert(
  title: string,
  message?: string,
  buttons?: AlertButton[],
  options?: AlertOptions,
): void {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons, options);
    return;
  }
  const text = message ? `${title}\n\n${message}` : title;
  const cancel = buttons?.find((b) => b.style === 'cancel');
  const action = buttons?.find((b) => b !== cancel);
  if (!cancel || !action) {
    window.alert(text);
    (action ?? cancel)?.onPress?.();
    return;
  }
  (window.confirm(text) ? action : cancel).onPress?.();
}
