// Turns on R8 for Android release builds: it removes unused Java/Kotlin code and resources, then
// optimizes and obfuscates the rest. Google Play warns about apps whose code isn't optimized
// ("DEX code optimization below our threshold"), and the app gets smaller.
//
// Expo's template reads two Gradle properties (both off by default) and uses
// proguard-android.txt, which tells R8 not to optimize; this switches to the optimizing rules.
// Libraries bring their own keep rules. If one ever needs more, add them with a plugin too:
// android/ is generated, so a hand edit of proguard-rules.pro would be lost. The mapping file that turns crash reports back into readable names is put in the .aab
// automatically, and Google Play uses it.
const { withAppBuildGradle, withGradleProperties } = require('expo/config-plugins');

const PROPERTIES = {
  'android.enableMinifyInReleaseBuilds': 'true',
  'android.enableShrinkResourcesInReleaseBuilds': 'true',
};

function setProperties(properties) {
  for (const [key, value] of Object.entries(PROPERTIES)) {
    const existing = properties.find((p) => p.type === 'property' && p.key === key);
    if (existing) existing.value = value;
    else properties.push({ type: 'property', key, value });
  }
  return properties;
}

function useOptimizingRules(buildGradle) {
  const plain = 'getDefaultProguardFile("proguard-android.txt")';
  const optimizing = 'getDefaultProguardFile("proguard-android-optimize.txt")';
  if (buildGradle.includes(optimizing)) return buildGradle;
  if (!buildGradle.includes(plain)) {
    throw new Error(
      'withAndroidCodeOptimization: proguardFiles line not found in app/build.gradle',
    );
  }
  return buildGradle.replace(plain, optimizing);
}

module.exports = function withAndroidCodeOptimization(config) {
  config = withGradleProperties(config, (c) => {
    c.modResults = setProperties(c.modResults);
    return c;
  });
  return withAppBuildGradle(config, (c) => {
    c.modResults.contents = useOptimizingRules(c.modResults.contents);
    return c;
  });
};

module.exports.setProperties = setProperties;
module.exports.useOptimizingRules = useOptimizingRules;
