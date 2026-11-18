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

// Automatically ensure Sultan Central POS Hub (server.js on port 5050) is running when Metro starts
try {
  const net = require('net');
  const { spawn } = require('child_process');
  const probe = new net.Socket();
  probe.setTimeout(400);
  probe.once('error', () => {
    probe.destroy();
    try {
      const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
        detached: true,
        stdio: 'ignore',
        cwd: __dirname,
        env: { ...process.env, SKIP_8081: '1' },
      });
      child.unref();
    } catch (_) {}
  });
  probe.once('timeout', () => {
    probe.destroy();
  });
  probe.connect(5050, '127.0.0.1', () => {
    probe.end();
  });
} catch (_) {}

module.exports = config;
