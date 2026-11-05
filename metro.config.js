const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Block runtime database JSON file, build outputs, and root prebuilt dist from triggering Metro recompilation & file watcher thrashing
const path = require('path');
const rootDistRegex = new RegExp(`^${path.resolve(__dirname, 'dist').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[/\\\\].*`);

const blockPatterns = [
  /[/\\]server-data\.json$/,
  rootDistRegex,
  /[/\\]\.expo[/\\].*$/,
  /[/\\]\.idea[/\\].*$/,
  /[/\\]\.vscode[/\\].*$/,
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
