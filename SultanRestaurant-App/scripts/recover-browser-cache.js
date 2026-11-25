// Sultan Restaurant - Forensic Recovery of lost Inventory Categories & Items
// Scans the Sultan EXE app profile (%LOCALAPPDATA%\SultanRestaurant\SultanAppProfile), Chrome, Edge & Brave
// LevelDB Local Storage (with Snappy decompression) plus all backups/*.json folders on this PC.
const fs = require('fs');
const path = require('path');

const DEFAULT_CATS = new Set(['meat', 'produce', 'grains', 'dairy', 'pantry', 'beverages', 'fuel', 'packaging', 'supplies']);

function isLegacyDummyInventoryId(id) {
  const s = String(id || '').trim();
  return /^inv\d+$/.test(s) || s.startsWith('invmuzolyg') || s.startsWith('inv-slt-');
}

function readVarint(buf, pos) {
  let result = 0;
  let shift = 0;
  let b;
  do {
    if (pos >= buf.length) throw new Error('varint overflow');
    b = buf[pos++];
    result += (b & 0x7f) * Math.pow(2, shift);
    shift += 7;
  } while (b & 0x80);
  return [result, pos];
}

function snappyDecompress(src) {
  let [len, pos] = readVarint(src, 0);
  const out = Buffer.alloc(len);
  let op = 0;
  while (pos < src.length) {
    const tag = src[pos++];
    const t = tag & 3;
    if (t === 0) {
      let l = tag >> 2;
      if (l >= 60) {
        const nb = l - 59;
        l = 0;
        for (let i = 0; i < nb; i++) l |= src[pos + i] << (8 * i);
        pos += nb;
      }
      l += 1;
      src.copy(out, op, pos, pos + l);
      pos += l;
      op += l;
    } else {
      let l;
      let off;
      if (t === 1) {
        l = ((tag >> 2) & 7) + 4;
        off = ((tag >> 5) << 8) | src[pos++];
      } else if (t === 2) {
        l = (tag >> 2) + 1;
        off = src[pos] | (src[pos + 1] << 8);
        pos += 2;
      } else {
        l = (tag >> 2) + 1;
        off = src.readUInt32LE(pos);
        pos += 4;
      }
      for (let i = 0; i < l; i++) {
        out[op] = out[op - off];
        op++;
      }
    }
  }
  return out;
}

function readBlock(buf, offset, size) {
  const data = buf.subarray(offset, offset + size);
  if (buf[offset + size] === 1) {
    try {
      return snappyDecompress(data);
    } catch (_) {
      return data;
    }
  }
  return data;
}

function blockEntries(block) {
  const parts = [];
  if (block.length < 4) return parts;
  const numRestarts = block.readUInt32LE(block.length - 4);
  const limit = block.length - 4 - numRestarts * 4;
  let pos = 0;
  let lastKey = Buffer.alloc(0);
  while (pos < limit && pos >= 0) {
    let shared;
    let nonShared;
    let valLen;
    try {
      [shared, pos] = readVarint(block, pos);
      [nonShared, pos] = readVarint(block, pos);
      [valLen, pos] = readVarint(block, pos);
    } catch (_) {
      break;
    }
    const key = Buffer.concat([lastKey.subarray(0, shared), block.subarray(pos, pos + nonShared)]);
    pos += nonShared;
    const val = block.subarray(pos, pos + valLen);
    pos += valLen;
    lastKey = key;
    parts.push({ key, val });
  }
  return parts;
}

function sstValues(file) {
  const buf = fs.readFileSync(file);
  const out = [];
  if (buf.length < 48) return out;
  const footer = buf.subarray(buf.length - 48);
  let p = 0;
  let io;
  let is;
  [, p] = readVarint(footer, p);
  [, p] = readVarint(footer, p);
  [io, p] = readVarint(footer, p);
  [is, p] = readVarint(footer, p);
  const index = readBlock(buf, io, is);
  for (const { val } of blockEntries(index)) {
    let q = 0;
    let bo;
    let bs;
    try {
      [bo, q] = readVarint(val, q);
      [bs, q] = readVarint(val, q);
    } catch (_) {
      continue;
    }
    if (bo + bs > buf.length) continue;
    for (const e of blockEntries(readBlock(buf, bo, bs))) out.push(e);
  }
  return out;
}

function decodeChromeValue(val) {
  if (!val || val.length === 0) return '';
  if (val[0] === 0) return val.subarray(1).toString('utf16le');
  if (val[0] === 1) return val.subarray(1).toString('latin1');
  return `${val.toString('latin1')}\n${val.toString('utf16le')}`;
}

function extractJsonObject(text, start) {
  let depth = 0;
  let inStr = false;
  let esc = false;
  const max = Math.min(text.length, start + 8 * 1024 * 1024);
  for (let i = start; i < max; i++) {
    const ch = text[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function harvestText(text, src, snapshots) {
  let idx = 0;
  while ((idx = text.indexOf('"inventoryCategories":', idx)) !== -1) {
    const start = text.lastIndexOf('{"state":', idx);
    let pushed = false;
    if (start !== -1) {
      const raw = extractJsonObject(text, start);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          const st = parsed.state || {};
          snapshots.push({
            src,
            cats: Array.isArray(st.inventoryCategories) ? st.inventoryCategories : [],
            inv: Array.isArray(st.inventory) ? st.inventory : [],
            state: st,
          });
          pushed = true;
        } catch (_) {}
      }
    }
    if (!pushed) {
      const m = text.slice(idx, idx + 8000).match(/"inventoryCategories":(\[[^\]]*\])/);
      if (m) {
        try {
          snapshots.push({ src, cats: JSON.parse(m[1]), inv: [], state: null });
        } catch (_) {}
      }
    }
    idx += 20;
  }
}

function findLevelDbDirs() {
  const L = process.env.LOCALAPPDATA || '';
  const A = process.env.APPDATA || '';
  const roots = [
    path.join(L, 'SultanRestaurant', 'SultanAppProfile'),
    path.join(L, 'Google', 'Chrome', 'User Data'),
    path.join(L, 'Microsoft', 'Edge', 'User Data'),
    path.join(L, 'BraveSoftware', 'Brave-Browser', 'User Data'),
    path.join(A, 'Opera Software', 'Opera Stable'),
  ];
  const dirs = [];
  const skip = /^(Cache|Code Cache|GPUCache|Service Worker|ShaderCache|GrShaderCache|Crashpad|component_crx_cache|extensions_crx_cache|Extensions)$/i;
  const walk = (d, depth) => {
    if (depth > 5) return;
    let ents = [];
    try {
      ents = fs.readdirSync(d, { withFileTypes: true });
    } catch (_) {
      return;
    }
    for (const e of ents) {
      if (!e.isDirectory() || skip.test(e.name)) continue;
      const p = path.join(d, e.name);
      if (e.name === 'leveldb' || e.name.endsWith('.leveldb')) dirs.push(p);
      walk(p, depth + 1);
    }
  };
  roots.forEach((r) => fs.existsSync(r) && walk(r, 0));
  return dirs;
}

function findBackupJsonFiles(extraDirs = []) {
  const candidates = [
    ...extraDirs,
    path.join(__dirname, '..', 'backups'),
    path.join(__dirname, '..'),
    'C:\\SultanRestaurant',
    'C:\\SultanRestaurant\\backups',
    'D:\\SultanRestaurant',
    'D:\\SultanRestaurant\\backups',
    path.join(process.env.USERPROFILE || '', 'Desktop', 'SultanResturant'),
    path.join(process.env.USERPROFILE || '', 'Desktop', 'SultanResturant', 'backups'),
    path.join(process.env.USERPROFILE || '', 'Desktop', 'SultanRestaurant-App'),
    path.join(process.env.USERPROFILE || '', 'Desktop', 'SultanRestaurant-App', 'backups'),
  ];
  const files = [];
  for (const d of Array.from(new Set(candidates))) {
    try {
      if (!d || !fs.existsSync(d)) continue;
      for (const f of fs.readdirSync(d)) {
        if (f.endsWith('.json') && (f.startsWith('server-data') || d.toLowerCase().endsWith('backups'))) {
          files.push(path.join(d, f));
        }
      }
    } catch (_) {}
  }
  return files;
}

/** Returns every snapshot of {cats, inv, state} found on this PC. */
function scanAllSnapshots(extraBackupDirs = []) {
  const snapshots = [];
  for (const d of findLevelDbDirs()) {
    let files = [];
    try {
      files = fs.readdirSync(d);
    } catch (_) {
      continue;
    }
    for (const f of files) {
      const full = path.join(d, f);
      try {
        if (f.endsWith('.ldb') || f.endsWith('.sst')) {
          for (const { key, val } of sstValues(full)) {
            const k = key.toString('latin1');
            const txt = decodeChromeValue(val);
            if (k.includes('ops-storage') || txt.includes('inventoryCategories')) harvestText(txt, full, snapshots);
          }
        } else if (f.endsWith('.log')) {
          const buf = fs.readFileSync(full);
          harvestText(buf.toString('latin1'), full, snapshots);
          harvestText(buf.toString('utf16le'), full, snapshots);
          harvestText(buf.subarray(1).toString('utf16le'), full, snapshots);
        }
      } catch (_) {}
    }
  }
  for (const f of findBackupJsonFiles(extraBackupDirs)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(f, 'utf8'));
      const st = parsed.state && parsed.state.inventory ? parsed.state : parsed;
      snapshots.push({
        src: f,
        cats: Array.isArray(st.inventoryCategories) ? st.inventoryCategories : [],
        inv: Array.isArray(st.inventory) ? st.inventory : [],
        state: st,
      });
    } catch (_) {}
  }
  return snapshots;
}

/** Union of real (non-dummy) categories & items across all snapshots. */
function buildRecoveredState(snapshots) {
  const cats = new Map();
  const items = new Map();
  const zones = new Map();
  const suppliers = new Map();
  let bestSrc = '';
  let bestScore = -1;
  for (const s of snapshots) {
    const realInv = (s.inv || []).filter((i) => i && i.id && i.name && !isLegacyDummyInventoryId(i.id));
    const customCats = (s.cats || []).filter((c) => c && !DEFAULT_CATS.has(String(c).trim().toLowerCase()));
    const score = customCats.length * 50 + realInv.length * 100;
    if (score > bestScore && score > 0) {
      bestScore = score;
      bestSrc = s.src;
    }
    if (customCats.length > 0 || realInv.length > 0) {
      for (const c of s.cats || []) {
        const clean = String(c || '').trim();
        if (clean) cats.set(clean.toLowerCase(), clean);
      }
    }
    for (const it of realInv) {
      const prev = items.get(it.id);
      if (!prev || (Number(it.updatedAt) || 0) >= (Number(prev.updatedAt) || 0)) items.set(it.id, it);
      if (it.category) cats.set(String(it.category).trim().toLowerCase(), String(it.category).trim());
    }
    const st = s.state || {};
    for (const z of Array.isArray(st.storageZones) ? st.storageZones : []) {
      if (z && z.id && z.name) zones.set(z.id, z);
    }
    for (const sp of Array.isArray(st.suppliers) ? st.suppliers : []) {
      if (sp && sp.id && sp.name && !/^sup-\d+$/.test(String(sp.id))) suppliers.set(sp.id, sp);
    }
  }
  return {
    source: bestSrc,
    inventoryCategories: Array.from(cats.values()),
    inventory: Array.from(items.values()),
    storageZones: Array.from(zones.values()),
    suppliers: Array.from(suppliers.values()),
  };
}

module.exports = { scanAllSnapshots, buildRecoveredState, isLegacyDummyInventoryId };

async function main() {
  const SERVER_URL = process.env.SULTAN_SERVER_URL || 'http://127.0.0.1:5050';
  console.log('==============================================================');
  console.log('  SULTAN RESTAURANT - LOST INVENTORY RECOVERY (EXE + BROWSERS)');
  console.log('==============================================================');
  const snaps = scanAllSnapshots();
  const rec = buildRecoveredState(snaps);
  const customCats = rec.inventoryCategories.filter((c) => !DEFAULT_CATS.has(c.toLowerCase()));
  console.log(`Snapshots scanned: ${snaps.length}`);
  console.log(`Recovered Categories (${rec.inventoryCategories.length}): ${rec.inventoryCategories.join(', ')}`);
  console.log(`Custom Categories: ${customCats.length} | Real Inventory Items: ${rec.inventory.length}`);
  rec.inventory.slice(0, 80).forEach((i) => console.log(`   - ${i.name} [${i.category}] stock=${i.stock} ${i.unit || ''}`));
  if (customCats.length === 0 && rec.inventory.length === 0) {
    console.log('\nNo lost categories/items were found on THIS PC. Run this tool on the PC where the EXE app was used to enter data.');
    return;
  }
  const outDir = path.join(__dirname, '..', 'backups');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `recovered-pc-cache-${Date.now()}.json`);
  fs.writeFileSync(outFile, JSON.stringify(rec, null, 2));
  console.log('\nSaved recovery file ->', outFile);

  try {
    let epoch = 0;
    try {
      const cur = await (await fetch(`${SERVER_URL}/api/sync`)).json();
      epoch = Number((cur && (cur.state || cur).inventoryResetEpoch) || 0);
    } catch (_) {}
    const res = await fetch(`${SERVER_URL}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'CLIENT_UPDATE',
        senderId: 'PC_CACHE_RECOVER',
        timestamp: Date.now(),
        state: {
          inventoryResetEpoch: epoch,
          inventoryCategories: rec.inventoryCategories,
          inventory: rec.inventory,
          ...(rec.storageZones.length ? { storageZones: rec.storageZones } : {}),
          ...(rec.suppliers.length ? { suppliers: rec.suppliers } : {}),
        },
      }),
    });
    console.log(res.ok ? 'SUCCESS: Recovered data uploaded & merged into Sultan Server Hub!' : `Server responded ${res.status}`);
  } catch (_) {
    console.log(`Server ${SERVER_URL} not reachable. Start the Sultan app/server, then run this tool again.`);
  }
}

if (require.main === module) {
  main();
}
