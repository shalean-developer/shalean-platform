module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
    // Must be listed last — required for gesture-handler / bottom tabs in release builds.
    plugins: ["react-native-reanimated/plugin"],
  };
};
