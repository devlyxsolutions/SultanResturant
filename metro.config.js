const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Block runtime database JSON file and Android build outputs from triggering Metro recompilation & file watcher thrashing
const blockPatterns = [
  /[/\\]server-data\.json$/,
  /[/\\]android[/\\]app[/\\]build[/\\].*$/,
  /[/\\]android[/\\]build[/\\].*$/,
  /[/\\]\.gradle[/\\].*$/,
];

const existingBlockList = Array.isArray(config.resolver.blockList)
  ? config.resolver.blockList
  : config.resolver.blockList instanceof RegExp
    ? [config.resolver.blockList]
    : [];

config.resolver.blockList = [...existingBlockList, ...blockPatterns];

module.exports = config;
