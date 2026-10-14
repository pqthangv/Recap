// Lets phones and tablets without a camera install Recap. expo-image-picker asks for the CAMERA
// permission (card photos, the AI "Photo" tab), and Google Play reads that permission as "needs a
// back camera with autofocus", hiding the app from devices that don't have one. Declaring both
// features as not required keeps the permission but stops the filtering; without a camera, only
// "Take photo" can't be used (choosing a photo still works).
// https://developer.android.com/guide/topics/manifest/uses-feature-element#permissions
const { withAndroidManifest } = require('expo/config-plugins');

const FEATURES = ['android.hardware.camera', 'android.hardware.camera.autofocus'];

module.exports = function withOptionalCamera(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    const features = (manifest['uses-feature'] ??= []);
    for (const name of FEATURES) {
      const existing = features.find((f) => f.$['android:name'] === name);
      if (existing) existing.$['android:required'] = 'false';
      else features.push({ $: { 'android:name': name, 'android:required': 'false' } });
    }
    return config;
  });
};
