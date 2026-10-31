const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Block runtime database JSON file from triggering Metro recompilation on live order updates
const runtimeDataPattern = /[/\\]server-data\.json$/;

if (Array.isArray(config.resolver.blockList)) {
  config.resolver.blockList.push(runtimeDataPattern);
} else if (config.resolver.blockList instanceof RegExp) {
  config.resolver.blockList = [config.resolver.blockList, runtimeDataPattern];
} else {
  config.resolver.blockList = [runtimeDataPattern];
}

module.exports = config;
