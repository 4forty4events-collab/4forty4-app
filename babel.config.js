module.exports = function (api) {
  api.cache(true);
  return {
    // babel-preset-expo (SDK 54) includes the react-native-worklets/reanimated
    // plugin automatically, so no manual plugin entry is needed for reanimated 4.
    presets: ['babel-preset-expo'],
  };
};
