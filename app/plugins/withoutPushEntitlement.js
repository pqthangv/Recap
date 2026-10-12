// Recap's reminders are local notifications; it never uses push. expo-notifications still adds the
// iOS push entitlement (`aps-environment`), which would make App Store signing require the Push
// Notifications capability on the App ID. This plugin removes it again.
//
// It must be listed BEFORE "expo-notifications" in app.json: Expo runs the plugin listed last
// first, so the one listed earlier gets the last word.
const { withEntitlementsPlist } = require('expo/config-plugins');

module.exports = function withoutPushEntitlement(config) {
  return withEntitlementsPlist(config, (config) => {
    delete config.modResults['aps-environment'];
    return config;
  });
};
