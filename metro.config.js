// Standard Expo Metro config. Kept explicit so the transformer/resolver defaults are
// pinned to Expo's (avoids surprises if a tool expects the file to exist).
const { getDefaultConfig } = require('expo/metro-config');

module.exports = getDefaultConfig(__dirname);
