// The browser version of picked.ts. The document picker gives a browser File; exports are offered
// as a download.
import type { DocumentPickerAsset } from 'expo-document-picker';

import type { UploadFile } from '@/lib/ai';

function browserFile(asset: DocumentPickerAsset): File {
  if (!asset.file) throw new Error('The picked file has no contents');
  return asset.file;
}

export function readPickedText(asset: DocumentPickerAsset): Promise<string> {
  return browserFile(asset).text();
}

export function pickedUpload(asset: DocumentPickerAsset): UploadFile {
  return browserFile(asset);
}

/** Nothing to clean up: the browser keeps the picked file in memory only. */
export function discardPicked(_asset: DocumentPickerAsset): void {}

/** Downloads a text file (the browser saves it to the Downloads folder or asks where). */
export async function shareTextFile(
  name: string,
  text: string,
  options: { mimeType: string; UTI: string; dialogTitle: string },
): Promise<void> {
  const url = URL.createObjectURL(new Blob([text], { type: options.mimeType }));
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    // Give the download a moment to start before the data goes away.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}
