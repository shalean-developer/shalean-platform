const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

/**
 * Expo SDK 52+ (`expo/metro-config`) auto-detects npm/yarn/pnpm/bun workspaces and
 * configures watchFolders + nodeModulesPaths for monorepos.
 *
 * Do NOT set:
 * - watchFolders
 * - resolver.nodeModulesPaths
 * - resolver.disableHierarchicalLookup
 *
 * Those overrides trigger Expo Doctor mismatches and are unnecessary on SDK 53.
 * NativeWind remains the only custom Metro transform wrapper.
 *
 * @see https://docs.expo.dev/guides/monorepos/
 */
const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, { input: "./global.css" });
