const fs = require('fs');
const path = require('path');

const SERVER_URL = process.env.SULTAN_SERVER_URL || 'http://127.0.0.1:5050';
const DEFAULT_CAT_SET = new Set(['meat', 'produce', 'grains', 'dairy', 'pantry', 'beverages', 'fuel', 'packaging', 'supplies']);

function isLegacyDummyInventoryId(id) {
  const s = String(id || '').trim();
  return /^inv\d+$/.test(s) || s.startsWith('invmuzolyg') || s.startsWith('inv-slt-');
}

function extractBalancedJsonArray(str, startIdx) {
  let depth = 0;
  let inStr = false;
  let esc = false;
  const maxEnd = Math.min(str.length, startIdx + 500000);
  for (let i = startIdx; i < maxEnd; i++) {
    const ch = str[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) return str.slice(startIdx, i + 1);
    }
  }
  return null;
}

async function main() {
  console.log('==============================================================');
  console.log('  SULTAN RESTAURANT - FORENSIC BROWSER CACHE RECOVERY TOOL');
  console.log('==============================================================');
  const localAppData = process.env.LOCALAPPDATA || '';
  const browserRoots = [
    path.join(localAppData, 'Google', 'Chrome', 'User Data'),
    path.join(localAppData, 'Microsoft', 'Edge', 'User Data'),
    path.join(localAppData, 'BraveSoftware', 'Brave-Browser', 'User Data'),
    path.join(process.env.APPDATA || '', 'Opera Software', 'Opera Stable'),
  ];

  const scanDirs = [];
  for (const root of browserRoots) {
    try {
      if (!root || !fs.existsSync(root)) continue;
      const entries = fs.readdirSync(root, { withFileTypes: true });
      for (const ent of entries) {
        if (ent.isDirectory() && (ent.name === 'Default' || ent.name.startsWith('Profile '))) {
          const ldb = path.join(root, ent.name, 'Local Storage', 'leveldb');
          if (fs.existsSync(ldb)) scanDirs.push({ label: `${path.basename(path.dirname(root))}/${ent.name}`, dir: ldb });
        }
      }
      const directLdb = path.join(root, 'Local Storage', 'leveldb');
      if (fs.existsSync(directLdb)) scanDirs.push({ label: path.basename(root), dir: directLdb });
    } catch (_) {}
  }

  const foundCats = new Set();
  const foundItemsMap = new Map();

  for (const entry of scanDirs) {
    console.log('Scanning:', entry.label, '->', entry.dir);
    try {
      const files = fs.readdirSync(entry.dir);
      for (const f of files) {
        if (f === 'LOCK' || (!f.endsWith('.ldb') && !f.endsWith('.log'))) continue;
        try {
          const buf = fs.readFileSync(path.join(entry.dir, f));
          for (const txt of [buf.toString('utf8'), buf.toString('utf16le')]) {
            let p1 = 0;
            while (true) {
              const idx = txt.indexOf('"inventoryCategories":[', p1);
              if (idx === -1) break;
              const raw = extractBalancedJsonArray(txt, idx + '"inventoryCategories":'.length);
              if (raw) {
                try {
                  const arr = JSON.parse(raw);
                  if (Array.isArray(arr)) {
                    for (const c of arr) {
                      const clean = String(c || '').trim();
                      if (clean && (!DEFAULT_CAT_SET.has(clean.toLowerCase()) || arr.length > 9)) {
                        foundCats.add(clean);
                      }
                    }
                  }
                } catch (_) {}
              }
              p1 = idx + 23;
            }
            let p2 = 0;
            while (true) {
              const idx = txt.indexOf('"inventory":[', p2);
              if (idx === -1) break;
              const raw = extractBalancedJsonArray(txt, idx + '"inventory":'.length);
              if (raw) {
                try {
                  const arr = JSON.parse(raw);
                  if (Array.isArray(arr)) {
                    for (const it of arr) {
                      if (it && it.id && it.name && !isLegacyDummyInventoryId(it.id)) {
                        foundItemsMap.set(it.id, it);
                        if (it.category) foundCats.add(String(it.category).trim());
                      }
                    }
                  }
                } catch (_) {}
              }
              p2 = idx + 13;
            }
          }
        } catch (_) {}
      }
    } catch (_) {}
  }

  console.log(`\nScan Result -> Custom/Recovered Categories: ${foundCats.size} | Real Inventory Items: ${foundItemsMap.size}`);
  if (foundCats.size === 0 && foundItemsMap.size === 0) {
    console.log('No cached categories or items were found in browser LevelDB on this PC.');
    return;
  }

  const outFile = path.join(__dirname, '..', 'backups', `pc-browser-recovered-${Date.now()}.json`);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const payload = {
    inventoryCategories: Array.from(foundCats),
    inventory: Array.from(foundItemsMap.values()),
  };
  fs.writeFileSync(outFile, JSON.stringify(payload, null, 2));
  console.log('Saved recovered file to:', outFile);

  try {
    const res = await fetch(`${SERVER_URL}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'CLIENT_UPDATE',
        senderId: 'PC_CACHE_RECOVER',
        timestamp: Date.now(),
        state: payload,
      }),
    });
    if (res.ok) {
      console.log('SUCCESS: Uploaded recovered categories & items to Sultan Server Hub!');
    }
  } catch (e) {
    console.log('Note: Could not reach server at', SERVER_URL, '- copy', outFile, 'into the server backups/ folder.');
  }
}

main();
