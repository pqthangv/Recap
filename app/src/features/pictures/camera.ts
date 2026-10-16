// Asking for the camera, for a card's photo and for "Take a photo" under Create with AI's notes.
// (Choosing a photo or a PDF uses the system pickers, which need no permission.)
// - iPhone: its own prompt shows Recap's reason (cameraPermission in app.json, translated in
//   languages/vi.json), so Recap asks directly.
// - Android: its prompt can't hold any text ("Allow Recap to take pictures…?"), so Recap says why
//   first.
// Once the camera was refused for good (once on iPhone, twice on Android), no prompt can appear
// again: Recap offers the phone's Settings instead of failing silently.
import * as ImagePicker from 'expo-image-picker';
import { Linking, Platform } from 'react-native';

import { t } from '@/lib/i18n';
import { showAlert } from '@/lib/alert';

export type CameraUse = 'card' | 'notes';

/** An alert with Cancel and one other button; true if that button was tapped. */
function confirm(title: string, message: string, ok: string): Promise<boolean> {
  return new Promise((resolve) =>
    showAlert(
      title,
      message,
      [
        { text: t('common.cancel'), style: 'cancel', onPress: () => resolve(false) },
        { text: ok, onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    ),
  );
}

/** True once Recap may use the camera. False if not: the person has been told why, or said no. */
export async function allowCamera(use: CameraUse): Promise<boolean> {
  const current = await ImagePicker.getCameraPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) {
    if (await confirm(t('camera.offTitle'), t('camera.offBody'), t('camera.openSettings'))) {
      await Linking.openSettings();
    }
    return false;
  }
  if (Platform.OS === 'android') {
    const why = t(use === 'card' ? 'camera.whyCard' : 'camera.whyNotes');
    if (!(await confirm(t('camera.whyTitle'), why, t('camera.continue')))) return false;
  }
  return (await ImagePicker.requestCameraPermissionsAsync()).granted;
}
