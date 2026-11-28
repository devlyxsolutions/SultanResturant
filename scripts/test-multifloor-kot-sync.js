/**
 * Automated End-to-End Multi-Floor Sync, Offline Recovery & KOT/SOT Sequence Test Suite.
 * Spins up an isolated copy of server.js on an ephemeral port using a temp data directory
 * (zero impact on live C:\SultanRestaurant\server-data.json).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const assert = require('assert');

const ROOT_DIR = path.resolve(__dirname, '..');
const TEST_PORT = 15099;

function buildIsolatedServerDir() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sultan-test-'));
  let src = fs.readFileSync(path.join(ROOT_DIR, 'server.js'), 'utf8');

  // Isolate ports, disable cloud Firestore sync, disable peer UDP mesh & cross-directory writes
  src = src
    .replace('const PORT = process.env.PORT || 5050;', `const PORT = ${TEST_PORT};`)
    .replace('const PEER_UDP_PORT = 5052;', 'const PEER_UDP_PORT = 15052;')
    .replace("const IS_DEV_WORKSTATION = process.env.SULTAN_DISABLE_CLOUD_SYNC === '1';", 'const IS_DEV_WORKSTATION = true;')
    .replace('function pushToFirestoreCloud(forceImmediate = false) {', 'function pushToFirestoreCloud() { return; } function _disabledPush() {')
    .replace('function initLanPeerMesh() {', 'function initLanPeerMesh() { return; } function _disabledMesh() {')
    .replace(/const VAULT_DIR = .*?;/, `const VAULT_DIR = ${JSON.stringify(path.join(tmpDir, 'vault'))};`)
    .replace(/'C:\\\\SultanRestaurant\\\\server-data\.json',/g, '')
    .replace(/'C:\\\\Users\\\\Nizaam Digital Sol\\\\Desktop\\\\SultanResturant\\\\server-data\.json',/g, '')
    .replace(/'C:\\\\Users\\\\Nizaam Digital Sol\\\\Desktop\\\\SultanRestaurant-App\\\\server-data\.json',/g, '')
    .replace('listenDualStack(\n  server5000,', 'if (false) listenDualStack(\n  server5000,')
    .replace('if (server80) {', 'if (false && server80) {');

  // Seed 2 real tables so test exercises full table/ticket reconciliation
  const seedState = {
    tables: [
      { id: 't-ground-5', name: 'G-05', floor: 'Ground Floor', zone: 'Ground Floor', seats: 4, status: 'available', orders: [], billTotal: 0 },
      { id: 't-roof-2', name: 'R-02', floor: 'Rooftop', zone: 'Rooftop', seats: 4, status: 'available', orders: [], billTotal: 0 },
    ],
    tickets: [],
    menuItems: [
      { id: 'dish-karahi', name: 'Chicken Karahi', price: 1800, category: 'Pakistani - Karahi', station: 'main' },
      { id: 'drink-mint', name: 'Mint Margarita', price: 399, category: 'Mocktail', station: 'juice' },
    ],
    shifts: [],
    activeShiftId: null,
  };
  fs.writeFileSync(path.join(tmpDir, 'server-data.json'), JSON.stringify(seedState, null, 2));
  fs.copyFileSync(path.join(ROOT_DIR, 'printerHelper.js'), path.join(tmpDir, 'printerHelper.js'));
  fs.writeFileSync(path.join(tmpDir, 'server.js'), src, 'utf8');
  return tmpDir;
}

async function waitForHealth(baseUrl) {
  for (let i = 0; i < 30; i++) {
    try {
      const r = await fetch(`${baseUrl}/health`);
      if (r.ok) return await r.json();
    } catch (_) { }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('Test server failed to start');
}

async function runTests() {
  const tmpDir = buildIsolatedServerDir();
  const baseUrl = `http://127.0.0.1:${TEST_PORT}`;
  const wsUrl = `ws://127.0.0.1:${TEST_PORT}`;
  const srvProc = spawn(process.execPath, [path.join(tmpDir, 'server.js')], {
    cwd: tmpDir,
    env: {
      ...process.env,
      PORT: String(TEST_PORT),
      SULTAN_DISABLE_CLOUD_SYNC: '1',
      NODE_PATH: path.join(ROOT_DIR, 'node_modules'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let srvErr = '';
  srvProc.stderr.on('data', (d) => { srvErr += d.toString(); });

  let wsKds = null;
  const wsEvents = [];

  try {
    const h = await waitForHealth(baseUrl).catch((e) => {
      throw new Error(`${e.message} (stderr: ${srvErr.slice(0, 600)})`);
    });
    assert.strictEqual(h.status, 'online', 'Health must be online');
    assert.ok(typeof h.timestamp === 'number', 'Health timestamp present');

    // Connect WebSocket listener (simulates Kitchen / Juice KDS)
    wsKds = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
      wsKds.once('open', resolve);
      wsKds.once('error', reject);
    });
    wsKds.on('message', (buf) => {
      try {
        wsEvents.push(JSON.parse(buf.toString()));
      } catch (_) { }
    });

    // Test WS PING -> PONG with serverTime
    wsKds.send(JSON.stringify({ type: 'PING' }));
    await new Promise((r) => setTimeout(r, 200));
    const pongMsg = wsEvents.find((e) => e.type === 'PONG');
    assert.ok(pongMsg && typeof pongMsg.serverTime === 'number', 'WS PONG must return serverTime');

    // 1. Open new Shift -> verify Kitchen KOT #1 & Juice SOT #1 reset
    const shiftId = 'SH-20261128-01';
    const now = Date.now();
    await fetch(`${baseUrl}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        senderId: 'CASHIER_GROUND',
        packetId: 'pkt_shift_1',
        state: {
          shifts: [{ id: shiftId, shiftType: 'Morning', registerId: 'C1', cashierId: 'c1', cashierName: 'Cashier', openedAt: now, openedBy: 'Cashier', openingFloat: 5000, status: 'open' }],
          activeShiftId: shiftId,
        },
      }),
    });

    let seqMain = await (await fetch(`${baseUrl}/api/kot/sequence-status?station=main`)).json();
    let seqJuice = await (await fetch(`${baseUrl}/api/kot/sequence-status?station=juice`)).json();
    assert.strictEqual(seqMain.shiftId, shiftId, 'Kitchen shiftId updated');
    assert.strictEqual(seqMain.kitchenSeq, 0, 'Kitchen seq starts at 0 before first order');
    assert.strictEqual(seqJuice.juiceSeq, 0, 'Juice seq starts at 0 before first order');

    // 2. Order Taker (APK) sends mixed order (Kitchen + Juice) -> Kitchen KOT #1 AND Juice SOT #1
    const kot1 = {
      id: 'KOT-1001',
      tableId: 't-ground-5',
      tableName: 'G-05',
      server: 'Zulfiqar',
      timePlaced: now + 100,
      status: 'pending',
      items: [
        { id: 'dish-karahi', name: 'Chicken Karahi', price: 1800, qty: 1, station: 'main', completed: false, itemStatus: 'pending' },
        { id: 'drink-mint', name: 'Mint Margarita', price: 399, qty: 2, station: 'juice', completed: false, itemStatus: 'pending' },
      ],
    };
    await fetch(`${baseUrl}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        senderId: 'ORDER_TAKER_APK',
        packetId: 'pkt_kot_1001',
        state: {
          tickets: [kot1],
          tables: [{ id: 't-ground-5', name: 'G-05', floor: 'Ground Floor', zone: 'Ground Floor', seats: 4, status: 'occupied', occupiedSince: now + 100, billTotal: 2598, server: 'Zulfiqar' }],
        },
      }),
    });

    // 3. Re-post same KOT-1001 via /api/print/kot -> MUST be idempotent (must NOT increment to #2!)
    const printRes1 = await (await fetch(`${baseUrl}/api/print/kot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket: kot1, station: 'all' }),
    })).json();
    assert.strictEqual(printRes1.kitchenKotSeq, 1, 'Kitchen KOT must remain #1');
    assert.strictEqual(printRes1.juiceKotSeq, 1, 'Juice SOT must remain #1');

    // 4. Order Taker tablet offline for 12 minutes due to router drop -> reconnects with 12-min-old pending KOT-1002 (Kitchen only)
    wsEvents.length = 0;
    const twelveMinAgo = Date.now() - 12 * 60 * 1000;
    const kot2Offline = {
      id: 'KOT-1002',
      tableId: 't-roof-2',
      tableName: 'R-02',
      server: 'Qasim',
      timePlaced: twelveMinAgo,
      status: 'pending',
      items: [
        { id: 'dish-karahi', name: 'Chicken Karahi', price: 1800, qty: 2, station: 'main', completed: false, itemStatus: 'pending' },
      ],
    };
    await fetch(`${baseUrl}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        senderId: 'ORDER_TAKER_OFFLINE_APK',
        packetId: 'pkt_kot_1002',
        state: {
          tickets: [kot2Offline],
          tables: [{ id: 't-roof-2', name: 'R-02', floor: 'Rooftop', zone: 'Rooftop', seats: 4, status: 'occupied', occupiedSince: twelveMinAgo, billTotal: 3600, server: 'Qasim' }],
        },
      }),
    });
    await new Promise((r) => setTimeout(r, 200));

    seqMain = await (await fetch(`${baseUrl}/api/kot/sequence-status?station=main`)).json();
    seqJuice = await (await fetch(`${baseUrl}/api/kot/sequence-status?station=juice`)).json();
    assert.strictEqual(seqMain.kitchenSeq, 2, '12-min offline Kitchen order got KOT #2');
    assert.strictEqual(seqJuice.juiceSeq, 1, 'Juice SOT stayed at #1 (no juice items on KOT-1002)');
    const alertForKot2 = wsEvents.find((e) => e.type === 'NEW_ORDER_ALERT' && e.ticket && e.ticket.id === 'KOT-1002');
    assert.ok(alertForKot2, '12-min offline KOT-1002 still emitted NEW_ORDER_ALERT to KDS');

    // 5. Cashier places Juice-only order KOT-1003 via WS -> verifies SYNC_ACK + Juice SOT #2 (Kitchen stays #2)
    wsEvents.length = 0;
    const kot3Juice = {
      id: 'KOT-1003',
      tableId: 'takeaway',
      tableName: 'Takeaway',
      server: 'Tanveer (POS)',
      timePlaced: Date.now(),
      status: 'pending',
      items: [{ id: 'drink-mint', name: 'Mint Margarita', price: 399, qty: 1, station: 'juice', completed: false, itemStatus: 'pending' }],
    };
    wsKds.send(JSON.stringify({
      type: 'CLIENT_UPDATE',
      senderId: 'CASHIER_WS',
      packetId: 'pkt_ws_1003',
      state: { tickets: [kot3Juice] },
    }));
    await new Promise((r) => setTimeout(r, 250));
    assert.ok(wsEvents.some((e) => e.type === 'SYNC_ACK' && e.packetId === 'pkt_ws_1003'), 'Server sent WS SYNC_ACK');
    seqMain = await (await fetch(`${baseUrl}/api/kot/sequence-status?station=main`)).json();
    seqJuice = await (await fetch(`${baseUrl}/api/kot/sequence-status?station=juice`)).json();
    assert.strictEqual(seqMain.kitchenSeq, 2, 'Kitchen KOT stayed at #2 on Juice-only order');
    assert.strictEqual(seqJuice.juiceSeq, 2, 'Juice SOT incremented to #2');

    // 6. Test Recovery endpoint when Kitchen asks for missing KOT #1
    const recResp = await (await fetch(`${baseUrl}/api/kot/recover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ station: 'main', missingSeqs: [1, 99] }),
    })).json();
    assert.strictEqual(recResp.recovered[0].found, true, 'Missing KOT #1 recovered from server');
    assert.strictEqual(recResp.recovered[0].ticket.id, 'KOT-1001', 'Recovered ticket matches KOT-1001');
    assert.strictEqual(recResp.recovered[1].found, false, 'Unknown #99 reports diagnostic cleanly');

    // 7. Ground Cashier settles G-05 -> Rooftop PC sends STALE snapshot trying to re-occupy G-05 & resurrect KOT-1001
    const settleTs = Date.now() + 500;
    await fetch(`${baseUrl}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        senderId: 'GROUND_CASHIER',
        packetId: 'pkt_settle_g05',
        state: {
          tickets: [{ ...kot1, status: 'served', isSettled: true, settledAt: settleTs, settledTableId: 't-ground-5', tableId: 'SETTLED-HISTORY' }],
          tables: [{ id: 't-ground-5', name: 'G-05', floor: 'Ground Floor', zone: 'Ground Floor', seats: 4, status: 'available', billTotal: 0, orders: [], lastSettledAt: settleTs }],
        },
      }),
    });

    // Rooftop PC (with OLD cache, missing occupiedSince & active stale KOT-1001) syncs AFTER settlement
    await fetch(`${baseUrl}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        senderId: 'ROOFTOP_STALE_PC',
        packetId: 'pkt_rooftop_stale_1',
        state: {
          tickets: [{ ...kot1, isSettled: false, status: 'pending' }],
          tables: [
            { id: 't-ground-5', name: 'G-05', floor: 'Ground Floor', zone: 'Ground Floor', seats: 4, status: 'occupied', billTotal: 2598, server: 'Zulfiqar' }, // missing occupiedSince!
            { id: 't-roof-2', name: 'R-02', floor: 'Rooftop', zone: 'Rooftop', seats: 4, status: 'available', lastSettledAt: 0 }, // unhydrated client trying to clear active R-02!
          ],
        },
      }),
    });

    const afterState = await (await fetch(`${baseUrl}/api/sync`)).json();
    const g05 = afterState.tables.find((t) => t.id === 't-ground-5');
    const r02 = afterState.tables.find((t) => t.id === 't-roof-2');
    const kot1After = afterState.tickets.find((t) => t.id === 'KOT-1001');

    assert.strictEqual(g05.status, 'available', 'CRITICAL: Stale Rooftop PC must NOT re-occupy settled G-05!');
    assert.strictEqual(g05.billTotal, 0, 'G-05 billTotal must remain 0');
    assert.strictEqual(kot1After.isSettled, true, 'Settled KOT-1001 must NOT be reverted to active!');
    assert.strictEqual(r02.status, 'occupied', 'Unhydrated client with lastSettledAt=0 must NOT erase active R-02!');
    assert.ok(Array.isArray(afterState.settledTicketIds) && afterState.settledTicketIds.includes('KOT-1001'), 'KOT-1001 tracked in settledTicketIds');

    // 8. Simulate KOT-1001 aged out of tickets list, stale client sends KOT-1001 again -> must NEVER resurrect!
    await fetch(`${baseUrl}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        senderId: 'ROOFTOP_STALE_PC_2',
        packetId: 'pkt_rooftop_stale_2',
        state: {
          tickets: [{ id: 'KOT-1001', tableId: 't-ground-5', tableName: 'G-05', server: 'Zulfiqar', timePlaced: now + 100, status: 'pending', isSettled: false, items: kot1.items }],
        },
      }),
    });
    const afterResurrectTry = await (await fetch(`${baseUrl}/api/sync`)).json();
    const activeForG05 = afterResurrectTry.tickets.filter((t) => t.tableId === 't-ground-5' && !t.isSettled);
    assert.strictEqual(activeForG05.length, 0, 'No stale pre-settlement KOT can resurrect on settled G-05!');

    console.log('ALL 8 MULTI-FLOOR SYNC, KOT/SOT SEQUENCE & STALE-DATA PROTECTION TESTS PASSED!');
  } finally {
    try { if (wsKds) wsKds.close(); } catch (_) { }
    try { srvProc.kill('SIGKILL'); } catch (_) { }
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) { }
  }
}

runTests().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
