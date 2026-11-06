import { useHeaderHeight } from 'expo-router/react-navigation';

/** `keyboardVerticalOffset` for a KeyboardAvoidingView that fills a Stack screen below its header.
 *  The keyboard is measured from the top of the screen and the view from below the header, so
 *  without this the keyboard covers the bottom of the screen by the header's height: the "Make
 *  cards" button on small screens like the folded iPhone Duo, and on Android too (the card
 *  editor's Save on a tablet held sideways). Not for iPhone and iPad sheets, which start lower:
 *  see CardEditorScreen. */
export function useKeyboardOffset(): number {
  return useHeaderHeight();
}
