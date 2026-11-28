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

    // 9. Regression test for invoiceSequenceState TDZ crash in /api/sync
    const dayStartNow = Date.now() - 3600 * 1000;
    const seqSyncRes = await fetch(`${baseUrl}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        senderId: 'CASHIER_SHARJEEL',
        packetId: 'pkt_seq_sync_test',
        state: {
          operationalDayStartAt: dayStartNow,
          invoiceSequenceState: { dayStartAt: dayStartNow, lastSeq: 4, pendingByTableId: {} },
        },
      }),
    });
    assert.strictEqual(seqSyncRes.status, 200, 'POST /api/sync with invoiceSequenceState must succeed (no TDZ error)');

    // 10. Atomic /api/pos/mark-billed keeps table BILLED even if stale client sends 'occupied'
    const markRes = await fetch(`${baseUrl}/api/pos/mark-billed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tableId: 't-roof-2',
        invoiceId: 'TMP-5',
        dailyInvoiceNumber: 'TMP-5',
        seq: 5,
        orders: [{ id: 'm1', name: 'Karahi', price: 1899, qty: 1 }],
        billTotal: 1899,
      }),
    });
    assert.strictEqual(markRes.status, 200, '/api/pos/mark-billed succeeds');

    await fetch(`${baseUrl}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        senderId: 'TABLET_OLD_ECHO',
        packetId: 'pkt_tablet_old_echo',
        state: {
          tables: [
            { id: 't-roof-2', name: 'R-02', floor: 'Rooftop', zone: 'Rooftop', seats: 4, status: 'occupied', ordersUpdatedAt: now - 5000, billTotal: 1899 },
          ],
        },
      }),
    });
    const billedState = await (await fetch(`${baseUrl}/api/sync`)).json();
    const r02Billed = billedState.tables.find((t) => t.id === 't-roof-2');
    assert.strictEqual(r02Billed.status, 'billed', 'Stale occupied echo must NOT un-bill a Pending Bill table');
    assert.strictEqual(r02Billed.lastInvoiceId, 'TMP-5', 'TMP-5 preserved on billed table');

    // 11. Atomic /api/pos/settle-bill saves invoice, settles KOT-1002, and releases R-02
    const inv5 = {
      id: 'INV-5',
      invoiceSeq: 5,
      dailyInvoiceNumber: 'INV-5',
      orderType: 'dine-in',
      tableId: 't-roof-2',
      tableName: 'R-02',
      timePlaced: now,
      timeSettled: Date.now(),
      items: [{ id: 'm1', name: 'Karahi', price: 1899, qty: 1, completed: true }],
      subTotal: 1899,
      discount: 0,
      tax: 0,
      total: 1899,
      payments: [{ type: 'cash', amount: 1899 }],
      status: 'paid',
    };
    const settleRes = await fetch(`${baseUrl}/api/pos/settle-bill`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        invoice: inv5,
        tableId: 't-roof-2',
        settleBeforeMs: Date.now(),
      }),
    });
    assert.strictEqual(settleRes.status, 200, '/api/pos/settle-bill returns 200');
    const afterSettle = await (await fetch(`${baseUrl}/api/sync`)).json();
    const r02After = afterSettle.tables.find((t) => t.id === 't-roof-2');
    const kot2After = afterSettle.tickets.find((t) => t.id === 'KOT-1002');
    const inv5Saved = afterSettle.invoices.find((i) => i.id === 'INV-5');
    assert.ok(inv5Saved, 'INV-5 saved atomically on server');
    assert.strictEqual(r02After.status, 'available', 'R-02 released cleanly to available');
    assert.strictEqual(kot2After.isSettled, true, 'KOT-1002 marked settled atomically');
    assert.strictEqual(afterSettle.invoiceSequenceState.lastSeq, 5, 'invoiceSequenceState updated to 5');
    assert.strictEqual(afterSettle.invoiceSequenceState.pendingByTableId['t-roof-2'], undefined, 'pendingByTableId cleared on settlement');

    // 12. Untouched client sending stale 'available' table (e.g. from morning or KDS) must NOT wipe active/billed tables or active KOTs
    // (Also verifies tablet with slightly slower timePlaced clock succeeds when occupiedSince > settleTs!)
    const orderNow = settleTs + 1000;
    await fetch(`${baseUrl}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        senderId: 'WAITER_TABLET_G05',
        packetId: 'pkt_occupy_g05_again',
        state: {
          tickets: [{
            id: 'KOT-2005',
            tableId: 't-ground-5',
            tableName: 'G-05',
            server: 'Asim',
            timePlaced: settleTs - 100,
            status: 'pending',
            items: [{ id: 'm1', name: 'Karahi', price: 1899, qty: 1, station: 'main', completed: false }],
          }],
          tables: [{
            id: 't-ground-5',
            name: 'G-05',
            floor: 'Ground Floor',
            zone: 'Ground Floor',
            seats: 4,
            status: 'occupied',
            occupiedSince: orderNow,
            ordersUpdatedAt: orderNow,
            billTotal: 1899,
            orders: [{ id: 'm1', name: 'Karahi', price: 1899, qty: 1 }],
          }],
        },
      }),
    });
    // Juice Bar KDS or Admin PC sends an unrelated update carrying G-05 as 'available' with morning's old lastSettledAt
    await fetch(`${baseUrl}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        senderId: 'KDS_JUICE_UNTOUCHED',
        packetId: 'pkt_kds_stale_table_echo',
        state: {
          tables: [{
            id: 't-ground-5',
            name: 'G-05',
            floor: 'Ground Floor',
            zone: 'Ground Floor',
            seats: 4,
            status: 'available',
            lastSettledAt: settleTs, // old pre-order release timestamp!
          }],
        },
      }),
    });
    const afterStaleEcho = await (await fetch(`${baseUrl}/api/sync`)).json();
    const g05Protected = afterStaleEcho.tables.find((t) => t.id === 't-ground-5');
    const kot2005Protected = afterStaleEcho.tickets.find((t) => t.id === 'KOT-2005');
    assert.strictEqual(g05Protected.status, 'occupied', 'Stale KDS echo with old lastSettledAt must NOT flip occupied G-05 to available');
    assert.strictEqual(Boolean(kot2005Protected.isSettled), false, 'Stale KDS echo must NOT retire active KOT-2005');

    // 13. +13h future skewed clock timestamp on a client must be clamped to server time and cannot poison table
    const futureSkewTs = Date.now() + 13 * 3600 * 1000;
    await fetch(`${baseUrl}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        senderId: 'ADMIN_SKEWED_CLOCK',
        packetId: 'pkt_future_clock_skew',
        state: {
          tables: [{
            id: 't-ground-5',
            name: 'G-05',
            floor: 'Ground Floor',
            zone: 'Ground Floor',
            seats: 4,
            status: 'occupied',
            occupiedSince: futureSkewTs,
            lastSettledAt: futureSkewTs,
          }],
        },
      }),
    });
    const afterSkew = await (await fetch(`${baseUrl}/api/sync`)).json();
    const g05Skew = afterSkew.tables.find((t) => t.id === 't-ground-5');
    assert.ok(Number(g05Skew.lastSettledAt || 0) <= Date.now() + 20000, 'Future +13h skewed lastSettledAt must be clamped to server clock');

    // 14. /api/pos/mark-billed rejects unknown/deleted tableId cleanly without polluting pendingByTableId
    const ghostRes = await fetch(`${baseUrl}/api/pos/mark-billed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tableId: 'tGF04',
        invoiceId: 'TMP-99',
        seq: 99,
        orders: [{ id: 'm1', name: 'Test', price: 100, qty: 1 }],
        billTotal: 100,
      }),
    });
    assert.strictEqual(ghostRes.status, 404, 'Deleted/ghost tableId must return 404 on /api/pos/mark-billed');
    const afterGhost = await (await fetch(`${baseUrl}/api/sync`)).json();
    assert.strictEqual(afterGhost.invoiceSequenceState?.pendingByTableId?.tGF04, undefined, 'Ghost table must NOT be saved into pendingByTableId');

    // 15. Stale client sending old INV-* IDs in deletedRecordIds must NEVER wipe live invoices
    await fetch(`${baseUrl}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        senderId: 'STALE_OPS_CLIENT',
        packetId: 'pkt_stale_deleted_inv_test',
        state: {
          deletedRecordIds: ['INV-5', 'INV-6', 'INV-7'],
        },
      }),
    });
    const afterDeletedTry = await (await fetch(`${baseUrl}/api/sync`)).json();
    assert.ok(afterDeletedTry.invoices.some((i) => i.id === 'INV-5'), 'Live INV-5 must survive stale client deletedRecordIds');
    assert.ok(!afterDeletedTry.deletedRecordIds.includes('INV-5'), 'INV-5 must never enter deletedRecordIds');

    // 16. Slow-clock v45 APK Order Taker tablet that knows curr.lastSettledAt places new KOT -> must stay occupied (not snap to available!)
    await fetch(`${baseUrl}/api/pos/settle-bill`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tableId: 't-ground-5',
        settleBeforeMs: Date.now() + 5000,
      }),
    });
    const afterG05Settle = await (await fetch(`${baseUrl}/api/sync`)).json();
    const g05ReleaseTs = afterG05Settle.tables.find((t) => t.id === 't-ground-5').lastSettledAt;
    const slowTabletClock = g05ReleaseTs - 90000; // Tablet clock 90s slower than Master!
    await fetch(`${baseUrl}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        senderId: 'V45_SLOW_TABLET',
        packetId: 'pkt_v45_slow_tablet_kot',
        state: {
          tickets: [{
            id: 'KOT-3001',
            tableId: 't-ground-5',
            tableName: 'G-05',
            server: 'Asim',
            timePlaced: slowTabletClock,
            status: 'pending',
            items: [{ id: 'm1', name: 'Karahi', price: 1899, qty: 1, station: 'main', completed: false }],
          }],
          tables: [{
            id: 't-ground-5',
            name: 'G-05',
            floor: 'Ground Floor',
            zone: 'Ground Floor',
            seats: 4,
            status: 'occupied',
            occupiedSince: slowTabletClock, // simulates v45 waiter/order/[tableId].tsx overwriting with Date.now()
            lastSettledAt: g05ReleaseTs,
            billTotal: 1899,
            orders: [{ id: 'm1', name: 'Karahi', price: 1899, qty: 1 }],
          }],
        },
      }),
    });
    const afterSlowTablet = await (await fetch(`${baseUrl}/api/sync`)).json();
    const g05SlowAfter = afterSlowTablet.tables.find((t) => t.id === 't-ground-5');
    const kot3001 = afterSlowTablet.tickets.find((t) => t.id === 'KOT-3001');
    assert.ok(kot3001 && !kot3001.isSettled, 'Brand-new KOT-3001 from slow-clock v45 tablet must be accepted');
    assert.strictEqual(g05SlowAfter.status, 'occupied', 'Slow-clock v45 tablet new order must stay occupied (not snap to available)');

    // 17. Direct /api/print/kot for a dine-in table marks table occupied immediately on Master
    await fetch(`${baseUrl}/api/print/kot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        station: 'all',
        ticket: {
          id: 'KOT-3002',
          tableId: 't-roof-2',
          tableName: 'R-02',
          server: 'Sharjeel (POS)',
          timePlaced: Date.now(),
          status: 'pending',
          items: [{ id: 'm2', name: 'Mint Margarita', price: 390, qty: 2, station: 'juice', completed: false }],
        },
      }),
    });
    const afterPrintKot = await (await fetch(`${baseUrl}/api/sync`)).json();
    const r02DirectKot = afterPrintKot.tables.find((t) => t.id === 't-roof-2');
    assert.strictEqual(r02DirectKot.status, 'occupied', 'POST /api/print/kot must immediately mark R-02 occupied');

    // 18. Manual Extra Charge + Reason persists through mark-billed, settle-bill & /api/sync
    await fetch(`${baseUrl}/api/pos/mark-billed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tableId: 't-roof-2',
        invoiceId: 'TMP-99',
        seq: 99,
        orders: [{ id: 'm-rice', name: 'Special Pulao', price: 3000, qty: 1 }],
        billTotal: 3350,
        extraCharge: 350,
        extraChargeReason: 'Extra Rice Portion',
      }),
    });
    const afterMarkExtra = await (await fetch(`${baseUrl}/api/sync`)).json();
    const r02BilledExtra = afterMarkExtra.tables.find((t) => t.id === 't-roof-2');
    assert.strictEqual(r02BilledExtra.status, 'billed', 'R-02 must be billed with extra charge');
    assert.strictEqual(r02BilledExtra.extraCharge, 350, 'Billed table must preserve extraCharge=350');
    assert.strictEqual(r02BilledExtra.extraChargeReason, 'Extra Rice Portion', 'Billed table must preserve extraChargeReason');

    await fetch(`${baseUrl}/api/pos/settle-bill`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tableId: 't-roof-2',
        invoice: {
          id: 'INV-99',
          invoiceSeq: 99,
          dailyInvoiceNumber: 'INV-99',
          orderType: 'dine-in',
          tableId: 't-roof-2',
          tableName: 'R-02',
          server: 'Sharjeel',
          cashier: 'Sharjeel (Cashier)',
          timePlaced: Date.now(),
          timeSettled: Date.now(),
          items: [{ id: 'm-rice', name: 'Special Pulao', price: 3000, qty: 1 }],
          subTotal: 3000,
          discount: 0,
          extraCharge: 350,
          extraChargeReason: 'Extra Rice Portion',
          tax: 0,
          total: 3350,
          payments: [{ type: 'cash', amount: 3350 }],
          status: 'settled',
        },
        settleBeforeMs: Date.now(),
      }),
    });
    const afterSettleExtra = await (await fetch(`${baseUrl}/api/sync`)).json();
    const inv99 = (afterSettleExtra.invoices || []).find((i) => i.id === 'INV-99');
    const r02Released = afterSettleExtra.tables.find((t) => t.id === 't-roof-2');
    assert.ok(inv99, 'Settled INV-99 with manual extraCharge must exist');
    assert.strictEqual(inv99.extraCharge, 350, 'INV-99 must retain extraCharge=350');
    assert.strictEqual(inv99.extraChargeReason, 'Extra Rice Portion', 'INV-99 must retain extraChargeReason');
    assert.strictEqual(inv99.total, 3350, 'INV-99 total must equal subtotal + extraCharge');
    assert.strictEqual(r02Released.status, 'available', 'R-02 must release back to available after settle');
    assert.strictEqual(r02Released.extraCharge, undefined, 'Released table must clear extraCharge');

    // 19. Takeaway Pending (named) persists across KOT + Temp Bill, rejects empty name, settles atomically & blocks stale resurrection
    const badTwRes = await fetch(`${baseUrl}/api/pos/pending-takeaway`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'upsert', entry: { id: 'TW-BAD-1', customerName: '   ', items: [] } }),
    });
    assert.strictEqual(badTwRes.status, 400, 'Takeaway pending without customerName must be rejected with 400');

    const twId1 = 'TW-TEST-BILAL';
    await fetch(`${baseUrl}/api/pos/pending-takeaway`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'upsert',
        entry: {
          id: twId1,
          customerName: 'Bilal',
          items: [{ id: 'm-rice', name: 'Chicken Pulao', price: 1500, qty: 2 }],
          subTotal: 3000,
          discount: 0,
          extraCharge: 300,
          extraChargeReason: 'Extra Rice',
          tax: 0,
          total: 3300,
          status: 'billed',
          hasKotSent: true,
          isBillPrinted: true,
          pendingBillId: 'TMP-101',
          pendingSeq: 101,
          ticketIds: ['KOT-TW-1'],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      }),
    });
    const afterTwCreate = await (await fetch(`${baseUrl}/api/sync`)).json();
    const bilalTw = (afterTwCreate.pendingTakeaways || []).find((p) => p.id === twId1);
    assert.ok(bilalTw, 'Pending Takeaway for Bilal must be stored on Master');
    assert.strictEqual(bilalTw.customerName, 'Bilal', 'Customer name must match');
    assert.strictEqual(bilalTw.status, 'billed', 'Status must be billed');
    assert.strictEqual(bilalTw.pendingBillId, 'TMP-101', 'Pending bill ID must be saved');
    assert.strictEqual(bilalTw.total, 3300, 'Total including extraCharge must be preserved');

    await fetch(`${baseUrl}/api/pos/settle-bill`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pendingTakeawayId: twId1,
        invoice: {
          id: 'INV-100',
          invoiceSeq: 100,
          dailyInvoiceNumber: 'INV-100',
          orderType: 'takeaway',
          tableName: 'Takeaway • Bilal',
          customer: { id: twId1, name: 'Bilal', phone: '', totalOrders: 0, totalSpent: 0 },
          server: 'Sharjeel (Cashier)',
          cashier: 'Sharjeel (Cashier)',
          timePlaced: Date.now(),
          timeSettled: Date.now(),
          items: [{ id: 'm-rice', name: 'Chicken Pulao', price: 1500, qty: 2 }],
          subTotal: 3000,
          discount: 0,
          extraCharge: 300,
          extraChargeReason: 'Extra Rice',
          tax: 0,
          total: 3300,
          payments: [{ type: 'cash', amount: 3300 }],
          status: 'settled',
        },
        settleBeforeMs: Date.now(),
      }),
    });
    // Stale peer tries to resurrect settled takeaway pending
    await fetch(`${baseUrl}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        senderId: 'STALE_PEER',
        packetId: 'pkt_stale_tw_resurrect',
        state: {
          pendingTakeaways: [{ ...bilalTw, status: 'billed', updatedAt: Date.now() + 5000 }],
        },
      }),
    });
    const afterTwSettle = await (await fetch(`${baseUrl}/api/sync`)).json();
    const bilalAfterSettle = (afterTwSettle.pendingTakeaways || []).find((p) => p.id === twId1);
    assert.strictEqual(bilalAfterSettle.status, 'settled', 'Settled Takeaway Pending must stay settled (never resurrected by stale peer)');
    assert.strictEqual(bilalAfterSettle.settledInvoiceId, 'INV-100', 'Settled Takeaway Pending must link INV-100');

    console.log('ALL 19 MULTI-FLOOR SYNC, KOT/SOT, TABLE STABILITY, EXTRA CHARGE, TAKEAWAY PENDING & CLOCK-SKEW TESTS PASSED!');
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
