import { useHeaderHeight } from 'expo-router/react-navigation';
import { Platform } from 'react-native';

/** `keyboardVerticalOffset` for a KeyboardAvoidingView that fills a Stack screen below its header.
 *  iPhone: the keyboard is measured from the top of the screen and the view from below the header,
 *  so without this the keyboard covers the bottom of the screen by the header's height (the
 *  "Make cards" button on small screens like the folded iPhone Duo). Android stays as it was. */
export function useKeyboardOffset(): number {
  const headerHeight = useHeaderHeight();
  return Platform.OS === 'ios' ? headerHeight : 0;
}
