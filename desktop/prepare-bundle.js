const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const srcDist = path.join(rootDir, 'dist');
const dstDist = path.join(__dirname, 'app-dist');

if (!fs.existsSync(srcDist)) {
  throw new Error('Root dist/ folder not found. Run "npx expo export -p web" in project root first.');
}

fs.rmSync(dstDist, { recursive: true, force: true });
fs.cpSync(srcDist, dstDist, { recursive: true });
fs.copyFileSync(path.join(rootDir, 'server.js'), path.join(__dirname, 'server.js'));

const srcDb = path.join(rootDir, 'server-data.json');
if (fs.existsSync(srcDb)) {
  fs.copyFileSync(srcDb, path.join(__dirname, 'server-data.seed.json'));
} else {
  fs.writeFileSync(path.join(__dirname, 'server-data.seed.json'), '{}');
}

console.log('[desktop] Prepared app-dist, server.js, and seed DB cleanly.');

