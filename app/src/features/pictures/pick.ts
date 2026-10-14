// Taking or choosing a photo for a card. Unlike the "Photo" tab in Create with AI, the photo is
// kept: checked, shrunk and saved by storePicture.
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

import { PICTURE_MAX_BYTES } from '@/lib/pictures';

import { allowCamera } from './camera';
import { PictureError, storePicture } from './files';

/**
 * Takes or chooses a photo and stores it. Its reference, or null if the user cancelled (or
 * didn't allow the camera: allowCamera has said what to do).
 */
export async function pickPicture(from: 'camera' | 'library'): Promise<string | null> {
  if (from === 'camera' && !(await allowCamera('card'))) return null;
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    // Android: the file as it is, without the picker decoding it first; Recap checks its size
    // and shrinks it itself.
    quality: 1,
    // iPhone: a JPEG rather than HEIC.
    preferredAssetRepresentationMode:
      ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
  };
  const result =
    from === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets?.length) return null;

  const asset = result.assets[0];
  const file = new File(asset.uri);
  try {
    if (file.size > PICTURE_MAX_BYTES) throw new PictureError('tooBig');
    // The picker reads the size from the file's header too, which covers formats Recap's own
    // header reader doesn't know (HEIC photos on some Android phones).
    const known = asset.width > 0 && asset.height > 0 ? asset : null;
    return await storePicture(await file.bytes(), asset.fileName ?? file.name, known);
  } finally {
    try {
      file.delete(); // the picker's copy in the cache
    } catch {
      // Already gone.
    }
  }
}
