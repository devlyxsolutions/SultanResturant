const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const WebSocket = require('ws');
const WebSocketServer = WebSocket.Server;

const PORT = process.env.PORT || 5050;
function getServerLanIp() {
  try {
    const ifaces = os.networkInterfaces();
    const candidates = [];
    for (const name of Object.keys(ifaces)) {
      for (const info of ifaces[name] || []) {
        if (!info || info.internal || info.family !== 'IPv4' || !info.address) continue;
        if (info.address.startsWith('169.254.')) continue; // skip APIPA link-local
        candidates.push(info.address);
      }
    }
    const lan192 = candidates.find((ip) => ip.startsWith('192.168.'));
    if (lan192) return lan192;
    const lan10 = candidates.find((ip) => ip.startsWith('10.'));
    if (lan10) return lan10;
    const lan172 = candidates.find((ip) => /^172\.(1[6-9]|2\d|3[01])\./.test(ip));
    if (lan172) return lan172;
    if (candidates.length > 0) return candidates[0];
  } catch (_) { }
  return '192.168.1.10';
}
const DATA_FILE = path.join(__dirname, 'server-data.json');
const SYSTEM_LOGS_FILE = path.join(__dirname, 'system-logs.ndjson');
const MAX_SYSTEM_LOGS_IN_MEMORY = 50000;
const MAX_SYSTEM_LOGS_FILE_BYTES = 50 * 1024 * 1024; // 50 MB auto-rotation

let systemLogsMemory = []; // chronological order (O(1) push; queried newest-first)
let systemLogSeqCounter = 0;
const seenSystemLogIds = new Set();
let pendingDiskLogLines = [];
let diskLogFlushTimer = null;
let isFlushingDiskLogs = false;

function loadSystemLogsFromDisk() {
  try {
    if (!fs.existsSync(SYSTEM_LOGS_FILE)) return;
    const raw = fs.readFileSync(SYSTEM_LOGS_FILE, 'utf8');
    if (!raw) return;
    const lines = raw.split('\n');
    const parsed = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      try {
        const obj = JSON.parse(line);
        if (obj && obj.id) {
          parsed.push(obj);
        }
      } catch (_) { }
    }
    systemLogsMemory = parsed.slice(-MAX_SYSTEM_LOGS_IN_MEMORY);
    for (let i = Math.max(0, systemLogsMemory.length - 4000); i < systemLogsMemory.length; i++) {
      seenSystemLogIds.add(systemLogsMemory[i].id);
    }
    systemLogSeqCounter = systemLogsMemory.reduce((max, l) => Math.max(max, Number(l.seq || 0)), 0);
    console.log(`[Sultan Hub Audit] Loaded ${systemLogsMemory.length} persistent system log(s) from system-logs.ndjson`);
  } catch (e) {
    console.warn('[Sultan Hub Audit] Failed loading system-logs.ndjson:', e.message);
  }
}

function flushSystemLogsToDisk() {
  if (isFlushingDiskLogs || pendingDiskLogLines.length === 0) return;
  isFlushingDiskLogs = true;
  const chunk = pendingDiskLogLines.splice(0, 2000).join('\n') + '\n';

  try {
    if (fs.existsSync(SYSTEM_LOGS_FILE)) {
      const st = fs.statSync(SYSTEM_LOGS_FILE);
      if (st.size > MAX_SYSTEM_LOGS_FILE_BYTES) {
        const archivePath = path.join(__dirname, `system-logs-archive-${Date.now()}.ndjson`);
        fs.renameSync(SYSTEM_LOGS_FILE, archivePath);
      }
    }
  } catch (_) { }

  fs.appendFile(SYSTEM_LOGS_FILE, chunk, 'utf8', (err) => {
    if (err) {
      console.warn('[Sultan Hub Audit] Disk append error:', err.message);
    }
    isFlushingDiskLogs = false;
    if (pendingDiskLogLines.length > 0) {
      setTimeout(flushSystemLogsToDisk, 40);
    }
  });
}

function scheduleDiskLogFlush(immediate = false) {
  if (immediate || pendingDiskLogLines.length >= 100) {
    if (diskLogFlushTimer) {
      clearTimeout(diskLogFlushTimer);
      diskLogFlushTimer = null;
    }
    flushSystemLogsToDisk();
    return;
  }
  if (!diskLogFlushTimer) {
    diskLogFlushTimer = setTimeout(() => {
      diskLogFlushTimer = null;
      flushSystemLogsToDisk();
    }, 150);
  }
}

function appendSystemLogs(entries, reqMeta = {}) {
  const list = Array.isArray(entries) ? entries : [entries];
  if (list.length === 0) return [];
  const accepted = [];
  const now = Date.now();

  for (let i = 0; i < list.length; i++) {
    const raw = list[i];
    if (!raw || typeof raw !== 'object') continue;
    const ts = typeof raw.timestamp === 'number' && raw.timestamp > 0 ? raw.timestamp : now;
    const seq = ++systemLogSeqCounter;
    const id = raw.id && typeof raw.id === 'string'
      ? raw.id
      : `slog_${ts.toString(36)}_${seq.toString(36)}_${Math.random().toString(36).substring(2, 6)}`;

    if (seenSystemLogIds.has(id)) continue;
    seenSystemLogIds.add(id);
    if (seenSystemLogIds.size > 6000) {
      const firstKey = seenSystemLogIds.values().next().value;
      if (firstKey) seenSystemLogIds.delete(firstKey);
    }

    const normalized = {
      id,
      seq,
      timestamp: ts,
      isoTime: raw.isoTime || new Date(ts).toISOString(),
      actorId: String(raw.actorId || 'system'),
      actorName: String(raw.actorName || 'System'),
      ...(raw.actorUsername ? { actorUsername: String(raw.actorUsername) } : {}),
      actorRole: String(raw.actorRole || 'System'),
      ...(raw.sessionId ? { sessionId: String(raw.sessionId) } : {}),
      deviceId: String(raw.deviceId || reqMeta.deviceId || 'SERVER_HUB'),
      deviceName: String(raw.deviceName || reqMeta.deviceName || 'Central POS Hub'),
      platform: String(raw.platform || 'server'),
      ip: String(raw.ip || reqMeta.ip || ''),
      page: String(raw.page || '/server'),
      module: String(raw.module || 'SYSTEM'),
      action: String(raw.action || 'EVENT'),
      actionType: String(raw.actionType || 'SYSTEM'),
      severity: String(raw.severity || 'info'),
      ...(raw.entityType ? { entityType: String(raw.entityType) } : {}),
      ...(raw.entityId ? { entityId: String(raw.entityId) } : {}),
      ...(raw.entityName ? { entityName: String(raw.entityName) } : {}),
      ...(typeof raw.amount === 'number' && !Number.isNaN(raw.amount) ? { amount: raw.amount } : {}),
      summary: String(raw.summary || raw.action || 'System event'),
      ...(raw.details && typeof raw.details === 'object' ? { details: raw.details } : {}),
      source: raw.source === 'client' ? 'client' : 'server',
    };

    systemLogsMemory.push(normalized);
    pendingDiskLogLines.push(JSON.stringify(normalized));
    accepted.push(normalized);
  }

  if (systemLogsMemory.length > MAX_SYSTEM_LOGS_IN_MEMORY) {
    systemLogsMemory.splice(0, systemLogsMemory.length - MAX_SYSTEM_LOGS_IN_MEMORY);
  }

  if (accepted.length > 0) {
    scheduleDiskLogFlush(accepted.length >= 50);
    try {
      if (typeof broadcastToClients === 'function') {
        broadcastToClients({
          type: 'SYSTEM_LOG_BATCH',
          logs: accepted,
          senderId: reqMeta.senderId || 'SERVER_AUDIT',
          timestamp: now,
        });
      }
    } catch (_) { }
  }

  return accepted;
}

function querySystemLogs(filters = {}) {
  const q = String(filters.q || '').trim().toLowerCase();
  const role = String(filters.role || '').trim().toLowerCase();
  const actor = String(filters.actor || '').trim().toLowerCase();
  const mod = String(filters.module || '').trim().toUpperCase();
  const actionType = String(filters.actionType || '').trim().toUpperCase();
  const severity = String(filters.severity || '').trim().toLowerCase();
  const pageFilter = String(filters.page || '').trim().toLowerCase();
  const dateFrom = Number(filters.dateFrom || 0);
  const dateTo = Number(filters.dateTo || 0);
  const limit = Math.min(1000, Math.max(1, Number(filters.limit || 200)));
  const offset = Math.max(0, Number(filters.offset || 0));

  const matched = [];
  for (let i = systemLogsMemory.length - 1; i >= 0; i--) {
    const l = systemLogsMemory[i];
    if (!l) continue;
    if (dateFrom > 0 && l.timestamp < dateFrom) continue;
    if (dateTo > 0 && l.timestamp > dateTo) continue;
    if (role && role !== 'all' && String(l.actorRole || '').toLowerCase() !== role) continue;
    if (actor && actor !== 'all') {
      const aName = String(l.actorName || '').toLowerCase();
      const aId = String(l.actorId || '').toLowerCase();
      const aUser = String(l.actorUsername || '').toLowerCase();
      if (aName !== actor && aId !== actor && aUser !== actor) continue;
    }
    if (mod && mod !== 'ALL' && String(l.module || '').toUpperCase() !== mod) continue;
    if (actionType && actionType !== 'ALL' && String(l.actionType || '').toUpperCase() !== actionType) continue;
    if (severity && severity !== 'all' && String(l.severity || '').toLowerCase() !== severity) continue;
    if (pageFilter && !String(l.page || '').toLowerCase().includes(pageFilter)) continue;
    if (q) {
      const hay = `${l.actorName} ${l.actorUsername || ''} ${l.actorRole} ${l.module} ${l.action} ${l.actionType} ${l.summary} ${l.entityName || ''} ${l.entityId || ''} ${l.page} ${l.deviceName} ${l.details ? JSON.stringify(l.details) : ''}`.toLowerCase();
      if (!hay.includes(q)) continue;
    }
    matched.push(l);
  }

  return {
    total: systemLogsMemory.length,
    filteredTotal: matched.length,
    logs: matched.slice(offset, offset + limit),
    allMatched: matched,
  };
}

function computeSystemLogAnalytics() {
  const now = Date.now();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayTs = startOfToday.getTime();
  const hourAgo = now - 60 * 60 * 1000;
  const minAgo = now - 60 * 1000;

  let todayCount = 0;
  let lastHourCount = 0;
  let lastMinuteCount = 0;
  let criticalCount = 0;
  let cancelVoidDeleteCount = 0;
  const byRole = {};
  const byModule = {};
  const byActionType = {};
  const bySeverity = { info: 0, success: 0, warning: 0, critical: 0 };
  const actorMap = new Map();

  for (let i = 0; i < systemLogsMemory.length; i++) {
    const l = systemLogsMemory[i];
    if (!l) continue;
    if (l.timestamp >= todayTs) todayCount++;
    if (l.timestamp >= hourAgo) lastHourCount++;
    if (l.timestamp >= minAgo) lastMinuteCount++;
    if (l.severity === 'critical') criticalCount++;
    if (l.actionType === 'CANCEL' || l.actionType === 'VOID' || l.actionType === 'DELETE' || l.actionType === 'REFUND') {
      cancelVoidDeleteCount++;
    }
    const r = l.actorRole || 'System';
    byRole[r] = (byRole[r] || 0) + 1;
    const m = l.module || 'SYSTEM';
    byModule[m] = (byModule[m] || 0) + 1;
    const at = l.actionType || 'SYSTEM';
    byActionType[at] = (byActionType[at] || 0) + 1;
    const sv = l.severity || 'info';
    bySeverity[sv] = (bySeverity[sv] || 0) + 1;

    const aKey = `${l.actorName || 'System'}::${r}`;
    const prevA = actorMap.get(aKey);
    if (prevA) {
      prevA.count++;
      if (l.timestamp > prevA.lastSeen) prevA.lastSeen = l.timestamp;
    } else {
      actorMap.set(aKey, { name: l.actorName || 'System', role: r, count: 1, lastSeen: l.timestamp });
    }
  }

  const topActors = Array.from(actorMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  return {
    totalStored: systemLogsMemory.length,
    todayCount,
    lastHourCount,
    lastMinuteCount,
    criticalCount,
    cancelVoidDeleteCount,
    uniqueActorsCount: actorMap.size,
    byRole,
    byModule,
    byActionType,
    bySeverity,
    topActors,
  };
}

loadSystemLogsFromDisk();
let printerHelper = null;
try {
  printerHelper = require('./printerHelper');
} catch (e) {
  console.warn('[Sultan Hub] printerHelper load error:', e.message);
}

// Preset visual fallbacks for rich mobile display
const PRESET_VISUALS = {
  'sultan kebab': {
    imageUri: 'https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?w=800&q=80',
    description: 'Tender minced mutton & beef grilled with royal Sultan spices on open charcoal.',
    badge: 'Chef Special',
    rating: 4.9,
    prepTime: 20,
    category: 'Mains'
  },
  'chicken karahi': {
    imageUri: 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=800&q=80',
    description: 'Fresh chicken cooked in pure desi ghee, fresh tomatoes, ginger and green chillies.',
    badge: 'Best Seller',
    rating: 4.8,
    prepTime: 25,
    category: 'Karahi & Handi'
  },
  'beef karahii': {
    imageUri: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=800&q=80',
    description: 'Tender beef shank cuts slow-cooked in rich spiced tomato & black pepper gravy.',
    badge: 'Signature',
    rating: 4.9,
    prepTime: 30,
    category: 'Karahi & Handi'
  },
  'chicken fajita': {
    imageUri: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=800&q=80',
    description: 'Crispy crust loaded with fajita chicken, bell peppers, olives and melted mozzarella.',
    badge: 'Hot',
    rating: 4.7,
    prepTime: 18,
    category: 'Fast Food'
  },
  'chicken cheese': {
    imageUri: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800&q=80',
    description: 'Double cheese layer topped with marinated grilled chicken breast chunks.',
    badge: 'Popular',
    rating: 4.8,
    prepTime: 18,
    category: 'Fast Food'
  },
  'mangoo shake': {
    imageUri: 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=800&q=80',
    description: 'Thick mango pulp blended with traditional kulfa ice cream and dry fruits.',
    badge: 'Chilled',
    rating: 4.9,
    prepTime: 10,
    category: 'Drinks'
  },
  'mint margarita': {
    imageUri: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=800&q=80',
    description: 'Blended fresh mint leaves, lemon juice, soda and crushed ice.',
    badge: 'Refreshing',
    rating: 4.8,
    prepTime: 8,
    category: 'Drinks'
  },
  'kunafa': {
    imageUri: 'https://images.unsplash.com/photo-1608836561226-d621b10a26e8?w=800&q=80',
    description: 'Crunchy golden pastry filled with sweet cheese, soaked in rose syrup & pistachios.',
    badge: 'Royal Sweet',
    rating: 4.9,
    prepTime: 15,
    category: 'Desserts'
  },
  'hummus & pita': {
    imageUri: 'https://images.unsplash.com/photo-1577906096429-f73c2c312435?w=800&q=80',
    description: 'Creamy chickpea dip with extra virgin olive oil and freshly baked pita bread.',
    badge: 'Healthy',
    rating: 4.6,
    prepTime: 10,
    category: 'Appetizers'
  }
};

// Default Playland attractions & rides catalog
const DEFAULT_PLAYLAND_RIDES = [
  {
    id: 'PL-R1',
    name: 'Sultan Royal Carousel',
    category: 'jhoola',
    price: 200,
    variants: [
      { id: 'v1-1', name: '5 Mins', durationMinutes: 5, price: 200 },
      { id: 'v1-2', name: '10 Mins', durationMinutes: 10, price: 350 },
      { id: 'v1-3', name: '15 Mins', durationMinutes: 15, price: 480 },
    ],
    icon: 'color-palette-outline',
    minAge: '2+ yrs',
    duration: '5 Mins',
    capacity: 16,
    isActive: true,
    color: '#D5A943',
  },
  {
    id: 'PL-R2',
    name: 'Mini Roller Coaster',
    category: 'jhoola',
    price: 300,
    variants: [
      { id: 'v2-1', name: '3 Mins (1 Round)', durationMinutes: 3, price: 300 },
      { id: 'v2-2', name: '6 Mins (2 Rounds)', durationMinutes: 6, price: 500 },
    ],
    icon: 'rocket-outline',
    minAge: '5+ yrs',
    duration: '3 Mins',
    capacity: 12,
    isActive: true,
    color: '#FF6B6B',
  },
  {
    id: 'PL-R3',
    name: 'Sultan Bumper Cars',
    category: 'jhoola',
    price: 250,
    variants: [
      { id: 'v3-1', name: '6 Mins', durationMinutes: 6, price: 250 },
      { id: 'v3-2', name: '12 Mins', durationMinutes: 12, price: 450 },
    ],
    icon: 'car-sport-outline',
    minAge: '4+ yrs',
    duration: '6 Mins',
    capacity: 10,
    isActive: true,
    color: '#4D96FF',
  },
  {
    id: 'PL-R4',
    name: 'Sultan Jungle Safari Train',
    category: 'jhoola',
    price: 180,
    variants: [
      { id: 'v4-1', name: '8 Mins', durationMinutes: 8, price: 180 },
      { id: 'v4-2', name: '15 Mins', durationMinutes: 15, price: 300 },
    ],
    icon: 'train-outline',
    minAge: 'All Ages',
    duration: '8 Mins',
    capacity: 20,
    isActive: true,
    color: '#6BCB77',
  },
  {
    id: 'PL-R5',
    name: 'Flying Chair Swings',
    category: 'jhoola',
    price: 220,
    variants: [
      { id: 'v5-1', name: '5 Mins', durationMinutes: 5, price: 220 },
      { id: 'v5-2', name: '10 Mins', durationMinutes: 10, price: 380 },
    ],
    icon: 'planet-outline',
    minAge: '6+ yrs',
    duration: '5 Mins',
    capacity: 14,
    isActive: true,
    color: '#FFD93D',
  },
  {
    id: 'PL-R6',
    name: 'Toddler Soft Play Kingdom',
    category: 'softplay',
    price: 350,
    variants: [
      { id: 'v6-1', name: '30 Mins', durationMinutes: 30, price: 350 },
      { id: 'v6-2', name: '60 Mins (1 Hour)', durationMinutes: 60, price: 600 },
      { id: 'v6-3', name: 'Unlimited Day', durationMinutes: 300, price: 1000 },
    ],
    icon: 'happy-outline',
    minAge: '1-6 yrs',
    duration: '30 Mins',
    capacity: 25,
    isActive: true,
    color: '#FF9F45',
  },
  {
    id: 'PL-R7',
    name: '9D Virtual Reality Cinema',
    category: 'vr',
    price: 350,
    variants: [
      { id: 'v7-1', name: '1 Ride (10 Mins)', durationMinutes: 10, price: 350 },
      { id: 'v7-2', name: '2 Rides (20 Mins)', durationMinutes: 20, price: 600 },
    ],
    icon: 'glasses-outline',
    minAge: '7+ yrs',
    duration: '10 Mins',
    capacity: 6,
    isActive: true,
    color: '#9C27B0',
  },
  {
    id: 'PL-R8',
    name: 'Arcade Master Card',
    category: 'arcade',
    price: 500,
    variants: [
      { id: 'v8-1', name: '500 Balance', durationMinutes: 0, price: 500 },
      { id: 'v8-2', name: '1000 Balance (+200 Bonus)', durationMinutes: 0, price: 1000 },
      { id: 'v8-3', name: '2000 Balance (+500 Bonus)', durationMinutes: 0, price: 2000 },
    ],
    icon: 'game-controller-outline',
    minAge: 'All Ages',
    duration: 'Tokens',
    capacity: 50,
    isActive: true,
    color: '#00BCD4',
  },
  {
    id: 'PL-R9',
    name: 'Sultan VIP Unlimited Mega Pass',
    category: 'pass',
    price: 1500,
    variants: [
      { id: 'v9-1', name: 'Single Child Full Pass (3 Hours)', durationMinutes: 180, price: 1500 },
      { id: 'v9-2', name: 'Family Pass (2 Kids, 3 Hours)', durationMinutes: 180, price: 2700 },
    ],
    icon: 'star-outline',
    minAge: 'All Ages',
    duration: '3 Hours',
    capacity: 100,
    isActive: true,
    color: '#D5A943',
  }
];

// Initial state template
const INITIAL_STATE = {
  tables: [
    // Ground Floor
    { id: '1', floor: 'Ground Floor', zone: 'Ground Floor', seatingType: 'tables', name: 'T-01', seats: 4, status: 'available' },
    { id: '2', floor: 'Ground Floor', zone: 'Ground Floor', seatingType: 'tables', name: 'T-02', seats: 4, status: 'available' },
    { id: '3', floor: 'Ground Floor', zone: 'Ground Floor', seatingType: 'couches', name: 'Couch 1', seats: 6, status: 'available' },
    { id: '4', floor: 'Ground Floor', zone: 'Ground Floor', seatingType: 'majlis', cabinNumber: 'Cabin 1', name: 'Cabin 1', seats: 8, status: 'available' },
    { id: '5', floor: 'Ground Floor', zone: 'Ground Floor', seatingType: 'majlis', cabinNumber: 'Cabin 2', name: 'Cabin 2', seats: 10, status: 'available' },

    // 1st Floor
    { id: 'f1-t1', floor: '1st Floor', zone: '1st Floor', seatingType: 'tables', name: 'F1-T01', seats: 4, status: 'available' },
    { id: 'f1-t2', floor: '1st Floor', zone: '1st Floor', seatingType: 'tables', name: 'F1-T02', seats: 6, status: 'available' },
    { id: 'f1-c1', floor: '1st Floor', zone: '1st Floor', seatingType: 'couches', name: 'Couch 1', seats: 6, status: 'available' },
    { id: 'f1-m1', floor: '1st Floor', zone: '1st Floor', seatingType: 'majlis', cabinNumber: 'Cabin 1', name: 'Cabin 1', seats: 8, status: 'available' },
    { id: 'f1-m2', floor: '1st Floor', zone: '1st Floor', seatingType: 'majlis', cabinNumber: 'Cabin 2', name: 'Cabin 2', seats: 10, status: 'available' },
    { id: 'f1-m3', floor: '1st Floor', zone: '1st Floor', seatingType: 'majlis', cabinNumber: 'Cabin 3', name: 'Cabin 3', seats: 12, status: 'available' },

    // 2nd Floor
    { id: 'f2-t1', floor: '2nd Floor', zone: '2nd Floor', seatingType: 'tables', name: 'F2-T01', seats: 4, status: 'available' },
    { id: 'f2-m1', floor: '2nd Floor', zone: '2nd Floor', seatingType: 'majlis', cabinNumber: 'Cabin 1', name: 'Cabin 1', seats: 10, status: 'available' },

    // 3rd Floor
    { id: 'f3-t1', floor: '3rd Floor', zone: '3rd Floor', seatingType: 'tables', name: 'F3-T01', seats: 6, status: 'available' },
    { id: 'f3-m1', floor: '3rd Floor', zone: '3rd Floor', seatingType: 'majlis', cabinNumber: 'Royal Cabin 1', name: 'Royal Cabin 1', seats: 14, status: 'available' },

    // Rooftop
    { id: 'rt-1', floor: 'Rooftop', zone: 'Rooftop', seatingType: 'tables', name: 'R-01', seats: 4, status: 'available' },
    { id: 'rt-2', floor: 'Rooftop', zone: 'Rooftop', seatingType: 'majlis', cabinNumber: 'Sky Cabin 1', name: 'Sky Cabin 1', seats: 8, status: 'available' },
    { id: 'rt-3', floor: 'Rooftop', zone: 'Rooftop', seatingType: 'majlis', cabinNumber: 'Sky Cabin 2', name: 'Sky Cabin 2', seats: 8, status: 'available' }
  ],
  tickets: [],
  onlineOrders: [],
  invoices: [],
  customers: [],
  serviceRequests: [],
  playlandTickets: [],
  playlandRides: DEFAULT_PLAYLAND_RIDES,
  appUsers: [],
  appUserLogs: [],
  menuItems: [
    {
      "id": "slt-sal-caesar",
      "name": "Caesar Salad",
      "price": 890,
      "category": "Salad",
      "region": "Continental",
      "station": "main",
      "prepTimeMin": 12,
      "imageUri": "https://images.unsplash.com/photo-1546793665-c74683f339c1?w=800&q=80",
      "description": "Fresh crunchy Iceberg, grilled chicken, sun-dried tomatoes, tossed in Chef's special sauce, topped with croutons & Black olives & boiled eggs"
    },
    {
      "id": "slt-sal-fruity-nutty",
      "name": "Fruity Nutty Salad",
      "price": 890,
      "category": "Salad",
      "region": "Continental",
      "station": "main",
      "prepTimeMin": 10,
      "imageUri": "https://images.unsplash.com/photo-1519996529931-28324d5a630e?w=800&q=80",
      "description": "Julienne cut apples, Papaya, carrots tossed in honey sauce, topped with dry nuts"
    },
    {
      "id": "slt-sal-russian",
      "name": "Russian Salad",
      "price": 650,
      "category": "Salad",
      "region": "Continental",
      "station": "main",
      "prepTimeMin": 10,
      "imageUri": "https://images.unsplash.com/photo-1540420773420-3366772f4999?w=800&q=80",
      "description": "Classic creamy Russian salad with fresh cube-cut Apple & Fruit Cocktail Topped with dry Nuts"
    },
    {
      "id": "slt-sal-green",
      "name": "Fresh Green Salad",
      "price": 250,
      "category": "Salad",
      "region": "Pakistani",
      "station": "main",
      "prepTimeMin": 8,
      "imageUri": "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800&q=80",
      "description": "Fresh garden vegetables with our signature dressing"
    },
    {
      "id": "slt-app-dynamite-prawns",
      "name": "Dynamite Prawns",
      "price": 1150,
      "category": "Appetizers",
      "region": "Continental",
      "station": "main",
      "prepTimeMin": 14,
      "badge": "Chef Special",
      "imageUri": "https://images.unsplash.com/photo-1565680018434-b513d5e5fd47?w=800&q=80",
      "description": "Crispy battered fried prawns tossed in Dynamite sauce, served with Iceberg"
    },
    {
      "id": "slt-app-loaded-hummus",
      "name": "Loaded Hummus",
      "price": 1150,
      "category": "Appetizers",
      "region": "Arabic",
      "station": "main",
      "prepTimeMin": 12,
      "imageUri": "https://images.unsplash.com/photo-1541518763669-27fef04b14ea?w=800&q=80",
      "description": "Creamy chickpea hummus topped with grilled chicken, tahini sauce & Extra Virgin olive oil, served with Pita Bread & Carrot sticks"
    },
    {
      "id": "slt-app-stuffed-peri-bite",
      "name": "Stuffed Peri Bite",
      "price": 999,
      "category": "Appetizers",
      "region": "Continental",
      "station": "main",
      "prepTimeMin": 15,
      "imageUri": "https://images.unsplash.com/photo-1562967914-608f82629710?w=800&q=80",
      "description": "Thin layered stuffed chicken, crunchy fried, served with Peri Peri sauce"
    },
    {
      "id": "slt-app-finger-fish",
      "name": "Finger Fish",
      "price": 999,
      "category": "Appetizers",
      "region": "Continental",
      "station": "main",
      "prepTimeMin": 15,
      "imageUri": "https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?w=800&q=80",
      "description": "Crispy fried boneless fish, served with Tartar sauce & fries"
    },
    {
      "id": "slt-app-chicken-dynamite",
      "name": "Chicken Dynamite",
      "price": 850,
      "category": "Appetizers",
      "region": "Continental",
      "station": "main",
      "prepTimeMin": 12,
      "imageUri": "https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?w=800&q=80",
      "description": "Crispy battered fried chicken tossed in Dynamite sauce, served with Iceberg"
    },
    {
      "id": "slt-app-loaded-fries",
      "name": "Loaded Fries",
      "price": 699,
      "category": "Appetizers",
      "region": "Fast Food",
      "station": "main",
      "prepTimeMin": 10,
      "imageUri": "https://images.unsplash.com/photo-1585109649139-366815a0d713?w=800&q=80",
      "description": "Crispy fries topped with cheese sauce, chicken & sauces"
    },
    {
      "id": "slt-app-honey-chilli-wings",
      "name": "Honey Chilli Wings",
      "price": 599,
      "category": "Appetizers",
      "region": "Chinese",
      "station": "main",
      "prepTimeMin": 14,
      "imageUri": "https://images.unsplash.com/photo-1527477378378-0c6f50529d33?w=800&q=80",
      "description": "Crispy chicken wings tossed in sweet honey-chilli glaze, served with Iceberg"
    },
    {
      "id": "slt-app-masala-fries",
      "name": "Masala Fries",
      "price": 399,
      "category": "Appetizers",
      "region": "Fast Food",
      "station": "main",
      "prepTimeMin": 8,
      "imageUri": "https://images.unsplash.com/photo-1576107232684-1279f3908594?w=800&q=80",
      "description": "Crispy fries tossed in spicy masala seasoning"
    },
    {
      "id": "slt-app-fish-cracker",
      "name": "Fish Cracker",
      "price": 399,
      "category": "Appetizers",
      "region": "Chinese",
      "station": "main",
      "prepTimeMin": 6,
      "imageUri": "https://images.unsplash.com/photo-1601050690597-df0568f70950?w=800&q=80",
      "description": "Crispy fried fish crackers served with a dip"
    },
    {
      "id": "slt-app-plain-fries",
      "name": "Plain Fries",
      "price": 350,
      "category": "Appetizers",
      "region": "Fast Food",
      "station": "main",
      "prepTimeMin": 8,
      "imageUri": "https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=800&q=80",
      "description": "Classic salted crispy french fries"
    },
    {
      "id": "slt-sop-sultan-special",
      "name": "Sultan Special Soup",
      "price": 1450,
      "category": "Soup",
      "region": "Chinese",
      "station": "main",
      "prepTimeMin": 15,
      "badge": "Chef Special",
      "imageUri": "https://images.unsplash.com/photo-1547592166-23ac45744acd?w=800&q=80",
      "description": "Signature special soup loaded with chicken, Black Mushrooms, Fish, Prawn, vegetables, Topped on Dry Nuts and secret spices"
    },
    {
      "id": "slt-sop-hot-sour",
      "name": "Hot & Sour Soup",
      "price": 1050,
      "category": "Soup",
      "region": "Chinese",
      "station": "main",
      "prepTimeMin": 12,
      "imageUri": "https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?w=800&q=80",
      "description": "Classic hot & sour soup with chicken & tangy spices"
    },
    {
      "id": "slt-sop-chicken-corn",
      "name": "Chicken Corn Soup",
      "price": 1050,
      "category": "Soup",
      "region": "Chinese",
      "station": "main",
      "prepTimeMin": 12,
      "imageUri": "https://images.unsplash.com/photo-1603105037880-880cd4edfb0d?w=800&q=80",
      "description": "Chicken corn soup with sweet corn & tender chicken pieces"
    },
    {
      "id": "slt-cnt-fish-steak",
      "name": "Fish Steak",
      "price": 1650,
      "category": "Continental",
      "region": "Continental",
      "station": "main",
      "prepTimeMin": 22,
      "imageUri": "https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=800&q=80",
      "description": "Perfectly grilled fish fillet topped with lemon butter, tartar sauce, served with crispy fries or mashed potatoes"
    },
    {
      "id": "slt-cnt-fish-chips",
      "name": "Fish & Chips",
      "price": 1590,
      "category": "Continental",
      "region": "Continental",
      "station": "main",
      "prepTimeMin": 18,
      "imageUri": "https://images.unsplash.com/photo-1579208030886-b937da0925dc?w=800&q=80",
      "description": "Crispy fried Fish, Coated in crumbs, Serve with Fries & Tartar Sauce"
    },
    {
      "id": "slt-cnt-tarragon-chicken",
      "name": "Tarragon Chicken",
      "price": 1590,
      "category": "Continental",
      "region": "Continental",
      "station": "main",
      "prepTimeMin": 20,
      "imageUri": "https://images.unsplash.com/photo-1544025162-d76694265947?w=800&q=80",
      "description": "Grilled chicken steak topped with creamy tarragon sauce, served with crispy fries or mashed potatoes"
    },
    {
      "id": "slt-cnt-pepper-chicken",
      "name": "Pepper Chicken",
      "price": 1590,
      "category": "Continental",
      "region": "Continental",
      "station": "main",
      "prepTimeMin": 20,
      "imageUri": "https://images.unsplash.com/photo-1532550907401-a500c9a57435?w=800&q=80",
      "description": "Juicy grilled chicken steak coated in cracked black pepper sauce with a rich creamy texture, served with crispy fries or mashed potatoes"
    },
    {
      "id": "slt-cnt-moroccan-chicken",
      "name": "Moroccan Chicken",
      "price": 1590,
      "category": "Continental",
      "region": "Continental",
      "station": "main",
      "prepTimeMin": 20,
      "imageUri": "https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?w=800&q=80",
      "description": "Tender grilled chicken infused with authentic Moroccan spices, topped with special Moroccan sauce, served with crispy fries or mashed potatoes"
    },
    {
      "id": "slt-cnt-mushroom-chicken",
      "name": "Mushroom Chicken",
      "price": 1590,
      "category": "Continental",
      "region": "Continental",
      "station": "main",
      "prepTimeMin": 20,
      "imageUri": "https://images.unsplash.com/photo-1588166524941-3bf61a9c41db?w=800&q=80",
      "description": "Classic grilled chicken steak topped with creamy white mushroom sauce, served with sautéed vegetables & fries or mashed potatoes"
    },
    {
      "id": "slt-cnt-fettuccine-alfredo",
      "name": "Fettuccine Alfredo",
      "price": 1590,
      "category": "Continental",
      "region": "Italian",
      "station": "main",
      "prepTimeMin": 16,
      "imageUri": "https://images.unsplash.com/photo-1645112411341-6c4fd023714a?w=800&q=80",
      "description": "Creamy fettuccine pasta tossed in rich Alfredo sauce with grilled chicken chunks, mushrooms & parmesan cheese"
    },
    {
      "id": "slt-cnt-stuffed-chicken",
      "name": "Sultan Special Stuffed Chicken",
      "price": 1450,
      "category": "Continental",
      "region": "Continental",
      "station": "main",
      "prepTimeMin": 22,
      "badge": "Chef Special",
      "imageUri": "https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=800&q=80",
      "description": "Signature stuffed chicken breast filled with cheese & herbs, topped with special creamy sauce, served with crispy fries or mashed potatoes"
    },
    {
      "id": "slt-cnt-arrabbiata-pasta",
      "name": "Arrabbiata Pasta",
      "price": 1350,
      "category": "Continental",
      "region": "Italian",
      "station": "main",
      "prepTimeMin": 16,
      "imageUri": "https://images.unsplash.com/photo-1621996346565-e3d5d6281292?w=800&q=80",
      "description": "Spicy penne pasta tossed in tangy tomato Arrabbiata sauce with herbs, garlic & a touch of chilli"
    },
    {
      "id": "slt-chn-cashew-nut",
      "name": "Chicken Cashew Nut",
      "price": 1499,
      "category": "Chinese",
      "region": "Chinese",
      "station": "main",
      "prepTimeMin": 18,
      "imageUri": "https://images.unsplash.com/photo-1525755662778-989d0524087e?w=800&q=80",
      "description": "Tender chicken cooked with roasted cashew nuts, Spring Onion, capsicum in a mild spicy gravy"
    },
    {
      "id": "slt-chn-manchurian",
      "name": "Chicken Manchurian",
      "price": 1299,
      "category": "Chinese",
      "region": "Chinese",
      "station": "main",
      "prepTimeMin": 16,
      "imageUri": "https://images.unsplash.com/photo-1585032226651-759b368d7246?w=800&q=80",
      "description": "Juicy chicken cooked in tangy & spicy Manchurian sauce with capsicum & onion"
    },
    {
      "id": "slt-chn-chilli-dry",
      "name": "Chicken Chilli Dry",
      "price": 1299,
      "category": "Chinese",
      "region": "Chinese",
      "station": "main",
      "prepTimeMin": 16,
      "badge": "Popular",
      "imageUri": "https://images.unsplash.com/photo-1563245372-f21724e3856d?w=800&q=80",
      "description": "Crispy fried chicken tossed in dry spicy chilli sauce with capsicum, onion, green chillies & fresh ginger"
    },
    {
      "id": "slt-chn-chowmein",
      "name": "Chicken Chowmein",
      "price": 1199,
      "category": "Chinese",
      "region": "Chinese",
      "station": "main",
      "prepTimeMin": 15,
      "imageUri": "https://images.unsplash.com/photo-1612927601601-6638404737ce?w=800&q=80",
      "description": "Stir-fried noodles with shredded chicken & vegetables"
    },
    {
      "id": "slt-chn-special-rice",
      "name": "Special Rice",
      "price": 1050,
      "category": "Chinese",
      "region": "Chinese",
      "station": "main",
      "prepTimeMin": 15,
      "badge": "Chef Special",
      "imageUri": "https://images.unsplash.com/photo-1512058564366-18510be2db19?w=800&q=80",
      "description": "Signature fried rice loaded with chicken, prawns, egg, fruits, nuts & fresh vegetables"
    },
    {
      "id": "slt-chn-masala-rice",
      "name": "Chicken Masala Rice",
      "price": 999,
      "category": "Chinese",
      "region": "Chinese",
      "station": "main",
      "prepTimeMin": 14,
      "imageUri": "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=800&q=80",
      "description": "Spicy masala rice tossed with tender chicken chunks & aromatic spices"
    },
    {
      "id": "slt-chn-fried-rice",
      "name": "Chicken Fried Rice",
      "price": 999,
      "category": "Chinese",
      "region": "Chinese",
      "station": "main",
      "prepTimeMin": 14,
      "imageUri": "https://images.unsplash.com/photo-1536304929831-ee1ca9d44906?w=800&q=80",
      "description": "Classic Chinese style fried rice with juicy chicken, egg & vegetables"
    },
    {
      "id": "slt-piz-train",
      "name": "Train Pizza",
      "price": 5999,
      "category": "Pizza",
      "region": "Italian",
      "station": "main",
      "prepTimeMin": 25,
      "badge": "Grand Feast",
      "imageUri": "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=800&q=80",
      "description": "Three Flavours of Your Choice: Veggie Pizza, Kabab Crust Pizza, Tikka Pizza",
      "variants": [
        {
          "name": "Family",
          "price": 5999
        }
      ]
    },
    {
      "id": "slt-piz-sultan-special",
      "name": "Sultan Special Pizza",
      "price": 1450,
      "category": "Pizza",
      "region": "Italian",
      "station": "main",
      "prepTimeMin": 20,
      "badge": "Chef Special",
      "imageUri": "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800&q=80",
      "description": "Chef's royal recipe with premium mozzarella, smoked chicken, pepperoni, veggies & secret sauce",
      "variants": [
        {
          "name": "Medium (M)",
          "price": 1450
        },
        {
          "name": "Large (L)",
          "price": 2050
        },
        {
          "name": "Family",
          "price": 2250
        }
      ]
    },
    {
      "id": "slt-piz-kabab-crust",
      "name": "Kabab Crust Pizza",
      "price": 1450,
      "category": "Pizza",
      "region": "Italian",
      "station": "main",
      "prepTimeMin": 22,
      "imageUri": "https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=800&q=80",
      "description": "Handcrafted golden crust stuffed with succulent minced seekh kababs and melted cheese",
      "variants": [
        {
          "name": "Medium (M)",
          "price": 1450
        },
        {
          "name": "Large (L)",
          "price": 2050
        },
        {
          "name": "Family",
          "price": 2250
        }
      ]
    },
    {
      "id": "slt-piz-crown-crust",
      "name": "Crown Crust Pizza",
      "price": 1450,
      "category": "Pizza",
      "region": "Italian",
      "station": "main",
      "prepTimeMin": 22,
      "badge": "Signature Crust",
      "imageUri": "https://images.unsplash.com/photo-1590947132387-155cc02f3212?w=800&q=80",
      "description": "Crown-shaped crust filled with creamy cheese & spicy chicken chunks with rich toppings",
      "variants": [
        {
          "name": "Medium (M)",
          "price": 1450
        },
        {
          "name": "Large (L)",
          "price": 2050
        },
        {
          "name": "Family",
          "price": 2250
        }
      ]
    },
    {
      "id": "slt-piz-tikka",
      "name": "Tikka Pizza",
      "price": 1350,
      "category": "Pizza",
      "region": "Italian",
      "station": "main",
      "prepTimeMin": 18,
      "imageUri": "https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?w=800&q=80",
      "description": "Traditional spicy chicken tikka chunks with onions, bell peppers & gooey melted cheese",
      "variants": [
        {
          "name": "Medium (M)",
          "price": 1350
        },
        {
          "name": "Large (L)",
          "price": 1950
        },
        {
          "name": "Family",
          "price": 2150
        }
      ]
    },
    {
      "id": "slt-piz-cheese-lover",
      "name": "Cheese Lover Pizza",
      "price": 1250,
      "category": "Pizza",
      "region": "Italian",
      "station": "main",
      "prepTimeMin": 16,
      "imageUri": "https://images.unsplash.com/photo-1571407970349-bc81e7e96d47?w=800&q=80",
      "description": "Loaded double blend of mozzarella and cheddar cheese over rich Italian tomato base",
      "variants": [
        {
          "name": "Medium (M)",
          "price": 1250
        },
        {
          "name": "Large (L)",
          "price": 1850
        },
        {
          "name": "Family",
          "price": 2050
        }
      ]
    },
    {
      "id": "slt-piz-turkish-fatayer",
      "name": "Turkish Fatayer Pizza",
      "price": 1450,
      "category": "Pizza",
      "region": "Turkish",
      "station": "main",
      "prepTimeMin": 18,
      "imageUri": "https://images.unsplash.com/photo-1585238342024-78d387f4a707?w=800&q=80",
      "description": "Authentic boat-shaped Turkish pastry pizza topped with spiced meats, cheese & herbs",
      "variants": [
        {
          "name": "Large (L) / Standard",
          "price": 1450
        }
      ]
    },
    {
      "id": "slt-fst-beef-smash",
      "name": "Beef Smash Burger",
      "price": 990,
      "category": "Fast Food",
      "region": "Fast Food",
      "station": "main",
      "prepTimeMin": 16,
      "badge": "Top Rated",
      "imageUri": "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800&q=80",
      "description": "Premium beef patty smashed on grill loaded with melted cheese, caramelized onions, lettuce, tomato & special sauce, served with fries & coleslaw"
    },
    {
      "id": "slt-fst-chicken-smash",
      "name": "Chicken Smash Burger",
      "price": 790,
      "category": "Fast Food",
      "region": "Fast Food",
      "station": "main",
      "prepTimeMin": 15,
      "imageUri": "https://images.unsplash.com/photo-1550547660-d9450f859349?w=800&q=80",
      "description": "Premium Chicken patty smashed on grill loaded with melted cheese, caramelized onions, lettuce, tomato & special sauce, served with fries & coleslaw"
    },
    {
      "id": "slt-fst-grilled-burger",
      "name": "Grilled Chicken Burger",
      "price": 790,
      "category": "Fast Food",
      "region": "Fast Food",
      "station": "main",
      "prepTimeMin": 15,
      "imageUri": "https://images.unsplash.com/photo-1521305916504-4a1121188589?w=800&q=80",
      "description": "Grilled chicken fillet marinated in herbs and spices, topped with fresh lettuce, creamy mayo, & cheese, served with crispy fries & coleslaw"
    },
    {
      "id": "slt-fst-zinger-burger",
      "name": "Zinger Chicken Burger",
      "price": 450,
      "category": "Fast Food",
      "region": "Fast Food",
      "station": "main",
      "prepTimeMin": 12,
      "badge": "Crispy Bestseller",
      "imageUri": "https://images.unsplash.com/photo-1625813506062-0aeb1d7a094b?w=800&q=80",
      "description": "Crispy, spicy Zinger with fresh lettuce & creamy mayo, served with crispy golden fries & coleslaw"
    },
    {
      "id": "slt-fst-sultan-panini",
      "name": "Sultan Special Panini",
      "price": 990,
      "category": "Fast Food",
      "region": "Fast Food",
      "station": "main",
      "prepTimeMin": 14,
      "badge": "Chef Special",
      "imageUri": "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=800&q=80",
      "description": "Double chicken, double cheese, Sun-dried Tomato, Pepperoni & Sultan special secret sauce, served with crispy fries & coleslaw"
    },
    {
      "id": "slt-fst-jalapeno-panini",
      "name": "Jalapeno Panini",
      "price": 790,
      "category": "Fast Food",
      "region": "Fast Food",
      "station": "main",
      "prepTimeMin": 14,
      "imageUri": "https://images.unsplash.com/photo-1509722747041-616f39b57569?w=800&q=80",
      "description": "Grilled Italian panini bread stuffed with chicken, cheese, jalapenos, olives & spicy jalapeno sauce, served with golden fries & coleslaw"
    },
    {
      "id": "slt-fst-grilled-panini",
      "name": "Grilled Chicken Panini",
      "price": 790,
      "category": "Fast Food",
      "region": "Fast Food",
      "station": "main",
      "prepTimeMin": 14,
      "imageUri": "https://images.unsplash.com/photo-1554433607-66b5efe9d304?w=800&q=80",
      "description": "Panini bread filled with grilled chicken chunks, mozzarella cheese, bell peppers & creamy sauce, served with crispy fries & coleslaw"
    },
    {
      "id": "slt-fst-club-sandwich",
      "name": "Classic Club Sandwich",
      "price": 790,
      "category": "Fast Food",
      "region": "Fast Food",
      "station": "main",
      "prepTimeMin": 14,
      "imageUri": "https://images.unsplash.com/photo-1567620832903-9fc6debc209f?w=800&q=80",
      "description": "Triple-layer classic club with grilled chicken, fried egg, cheese, lettuce & mayo, cut into 4 triangles & served with fries & coleslaw"
    },
    {
      "id": "slt-brs-chicken-broast",
      "name": "Chicken Broast",
      "price": 1350,
      "category": "Broast",
      "region": "Fast Food",
      "station": "main",
      "prepTimeMin": 20,
      "badge": "Golden Crispy",
      "imageUri": "https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?w=800&q=80",
      "description": "Crispy, juicy chicken broast with a delicious special flavor",
      "variants": [
        {
          "name": "Half",
          "price": 1350
        },
        {
          "name": "Full",
          "price": 2299
        }
      ]
    },
    {
      "id": "slt-tur-roghan-josh",
      "name": "Mutton Roghan Josh",
      "price": 4999,
      "category": "Turkish Cuisine",
      "region": "Turkish",
      "station": "main",
      "prepTimeMin": 30,
      "badge": "Royal Dish",
      "imageUri": "https://images.unsplash.com/photo-1545247181-516773cae754?w=800&q=80",
      "description": "Special Turkish mutton masala with mughlai spices, tender mutton pieces in aromatic gravy"
    },
    {
      "id": "slt-tur-pasha-gosht",
      "name": "Pasha Gosht",
      "price": 4299,
      "category": "Turkish Cuisine",
      "region": "Turkish",
      "station": "main",
      "prepTimeMin": 30,
      "badge": "Pasha Royal",
      "imageUri": "https://images.unsplash.com/photo-1589302168068-964664d93dc0?w=800&q=80",
      "description": "Royal Pasha style mutton curry, premium cut mutton in rich & flavorful Turkish gravy"
    },
    {
      "id": "slt-tur-mutton-larva",
      "name": "Mutton Larva",
      "price": 3999,
      "category": "Turkish Cuisine",
      "region": "Turkish",
      "station": "main",
      "prepTimeMin": 30,
      "imageUri": "https://images.unsplash.com/photo-1544025162-d76694265947?w=800&q=80",
      "description": "Traditional Turkish mutton larva, slow-cooked mutton in rich Turkish spices & yogurt"
    },
    {
      "id": "slt-bbq-mutton-champ",
      "name": "Mutton Champ",
      "price": 3300,
      "category": "BBQ",
      "region": "BBQ",
      "station": "main",
      "prepTimeMin": 25,
      "badge": "Chef Special",
      "imageUri": "https://images.unsplash.com/photo-1544025162-d76694265947?w=800&q=80",
      "description": "Tender prime mutton ribs grilled over charcoal with royal aromatic rub",
      "variants": [
        {
          "name": "06 PCS",
          "price": 3300
        }
      ]
    },
    {
      "id": "slt-bbq-mutton-kabab",
      "name": "Mutton Kabab",
      "price": 1799,
      "category": "BBQ",
      "region": "BBQ",
      "station": "main",
      "prepTimeMin": 20,
      "imageUri": "https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?w=800&q=80",
      "description": "Minced mutton seasoned with traditional herbs and skewered over embers",
      "variants": [
        {
          "name": "05 PCS",
          "price": 1799
        }
      ]
    },
    {
      "id": "slt-bbq-reshmi-kabab",
      "name": "Reshmi Kabab",
      "price": 1799,
      "category": "BBQ",
      "region": "BBQ",
      "station": "main",
      "prepTimeMin": 18,
      "imageUri": "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800&q=80",
      "description": "Silky tender chicken mince kababs infused with cream, cheese & green coriander",
      "variants": [
        {
          "name": "05 PCS",
          "price": 1799
        }
      ]
    },
    {
      "id": "slt-bbq-mint-cheese-kabab",
      "name": "Mint Cheese Kabab",
      "price": 1799,
      "category": "BBQ",
      "region": "BBQ",
      "station": "main",
      "prepTimeMin": 18,
      "badge": "Signature",
      "imageUri": "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=800&q=80",
      "description": "Grilled skewers with melted mozzarella cheese center and refreshing wild mint",
      "variants": [
        {
          "name": "05 PCS",
          "price": 1799
        }
      ]
    },
    {
      "id": "slt-bbq-chicken-kabab",
      "name": "Chicken Kabab",
      "price": 1499,
      "category": "BBQ",
      "region": "BBQ",
      "station": "main",
      "prepTimeMin": 16,
      "imageUri": "https://images.unsplash.com/photo-1529193591184-b1d58069ecdd?w=800&q=80",
      "description": "Spiced chicken mince seekh kababs barbecued on open wood embers",
      "variants": [
        {
          "name": "05 PCS",
          "price": 1499
        }
      ]
    },
    {
      "id": "slt-bbq-fish-tikka",
      "name": "Fish Tikka",
      "price": 2299,
      "category": "BBQ",
      "region": "BBQ",
      "station": "main",
      "prepTimeMin": 20,
      "imageUri": "https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=800&q=80",
      "description": "Boneless fish cubes marinated in lemon, carom seeds & royal tikka marinade",
      "variants": [
        {
          "name": "10 PCS",
          "price": 2299
        }
      ]
    },
    {
      "id": "slt-bbq-kastoori-boti",
      "name": "Chicken Kastoori Boti",
      "price": 1850,
      "category": "BBQ",
      "region": "BBQ",
      "station": "main",
      "prepTimeMin": 20,
      "imageUri": "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=800&q=80",
      "description": "Boneless chicken marinated with fenugreek leaves, saffron and royal creamy yogurt",
      "variants": [
        {
          "name": "10 PCS",
          "price": 1850
        }
      ]
    },
    {
      "id": "slt-bbq-qandhari-boti",
      "name": "Qandhari Boti",
      "price": 1850,
      "category": "BBQ",
      "region": "BBQ",
      "station": "main",
      "prepTimeMin": 20,
      "imageUri": "https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?w=800&q=80",
      "description": "Authentic Afghan style spicy tender marinated chicken boti grilled to perfection",
      "variants": [
        {
          "name": "10 PCS",
          "price": 1850
        }
      ]
    },
    {
      "id": "slt-bbq-haryali-boti",
      "name": "Haryali Boti",
      "price": 1850,
      "category": "BBQ",
      "region": "BBQ",
      "station": "main",
      "prepTimeMin": 18,
      "imageUri": "https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?w=800&q=80",
      "description": "Chicken cubes coated in aromatic green herb paste of mint, coriander and green chilies",
      "variants": [
        {
          "name": "10 PCS",
          "price": 1850
        }
      ]
    },
    {
      "id": "slt-bbq-malai-boti",
      "name": "Special Malai Boti",
      "price": 1499,
      "category": "BBQ",
      "region": "BBQ",
      "station": "main",
      "prepTimeMin": 18,
      "badge": "Most Popular",
      "imageUri": "https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=800&q=80",
      "description": "Mouth melting chicken chunks marinated with thick dairy cream, cheese and mild white pepper",
      "variants": [
        {
          "name": "10 PCS",
          "price": 1499
        }
      ]
    },
    {
      "id": "slt-bbq-tandoori-boti",
      "name": "Chicken Tandoori Boti with Bone",
      "price": 1499,
      "category": "BBQ",
      "region": "BBQ",
      "station": "main",
      "prepTimeMin": 22,
      "imageUri": "https://images.unsplash.com/photo-1527477378378-0c6f50529d33?w=800&q=80",
      "description": "Traditional bone-in chicken cuts marinated in vibrant red tandoori spices and charred on coals",
      "variants": [
        {
          "name": "10 PCS",
          "price": 1499
        }
      ]
    },
    {
      "id": "slt-bir-mutton-biryani",
      "name": "Sultan Special Mutton Biryani",
      "price": 1499,
      "category": "Biryani",
      "region": "Pakistani",
      "station": "main",
      "prepTimeMin": 15,
      "badge": "Chef Special",
      "imageUri": "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=800&q=80",
      "description": "Topped with Cashew Nuts & Brown Onion"
    },
    {
      "id": "slt-bir-chicken-biryani",
      "name": "Sultan Special Chicken Biryani",
      "price": 1199,
      "category": "Biryani",
      "region": "Pakistani",
      "station": "main",
      "prepTimeMin": 15,
      "badge": "Chef Special",
      "imageUri": "https://images.unsplash.com/photo-1589302168068-964664d93dc0?w=800&q=80",
      "description": "Topped with Cashew Nuts & Brown Onion"
    },
    {
      "id": "slt-dal-makhni",
      "name": "Shahi Daal Makhni",
      "price": 1499,
      "category": "Daal",
      "region": "Pakistani",
      "station": "main",
      "prepTimeMin": 15,
      "badge": "Royal Daal",
      "imageUri": "https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=800&q=80",
      "description": "Rich and creamy blend of lentils, slow-cooked with aromatic spices, butter, and fresh cream"
    },
    {
      "id": "slt-hnd-white-handi",
      "name": "Chicken Makhni Special White Handi",
      "price": 1399,
      "category": "Pakistani - Handi",
      "region": "Pakistani",
      "station": "main",
      "prepTimeMin": 22,
      "badge": "Chef Special",
      "imageUri": "https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=800&q=80",
      "description": "Velvety smooth boneless chicken cooked in pure dairy butter, cream, almonds and white pepper",
      "variants": [
        {
          "name": "Half",
          "price": 1399
        },
        {
          "name": "Full",
          "price": 2199
        }
      ]
    },
    {
      "id": "slt-hnd-shahjahani",
      "name": "Shahjahani Handi",
      "price": 1299,
      "category": "Pakistani - Handi",
      "region": "Pakistani",
      "station": "main",
      "prepTimeMin": 22,
      "imageUri": "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=800&q=80",
      "description": "Royal Mughal feast handi simmered with saffron, roasted nuts, yogurt and golden spices",
      "variants": [
        {
          "name": "Half",
          "price": 1299
        },
        {
          "name": "Full",
          "price": 2199
        }
      ]
    },
    {
      "id": "slt-hnd-patiala",
      "name": "Patiala Handi",
      "price": 1299,
      "category": "Pakistani - Handi",
      "region": "Pakistani",
      "station": "main",
      "prepTimeMin": 22,
      "imageUri": "https://images.unsplash.com/photo-1545247181-516773cae754?w=800&q=80",
      "description": "Punjabi Patiala style spiced chicken handi with rich onion-tomato masala and butter",
      "variants": [
        {
          "name": "Half",
          "price": 1299
        },
        {
          "name": "Full",
          "price": 2199
        }
      ]
    },
    {
      "id": "slt-hnd-ginger",
      "name": "Chicken Ginger Handi",
      "price": 1199,
      "category": "Pakistani - Handi",
      "region": "Pakistani",
      "station": "main",
      "prepTimeMin": 20,
      "imageUri": "https://images.unsplash.com/photo-1589302168068-964664d93dc0?w=800&q=80",
      "description": "Boneless chicken prepared with generous fresh ginger juliennes and aromatic crushed spices",
      "variants": [
        {
          "name": "Half",
          "price": 1199
        },
        {
          "name": "Full",
          "price": 2099
        }
      ]
    },
    {
      "id": "slt-hnd-jalfrezi",
      "name": "Jalfrezi Handi",
      "price": 1199,
      "category": "Pakistani - Handi",
      "region": "Pakistani",
      "station": "main",
      "prepTimeMin": 20,
      "imageUri": "https://images.unsplash.com/photo-1563245372-f21724e3856d?w=800&q=80",
      "description": "Stir-cooked chicken handi tossed with crunchy bell peppers, fresh tomatoes and sweet onions",
      "variants": [
        {
          "name": "Half",
          "price": 1199
        },
        {
          "name": "Full",
          "price": 2099
        }
      ]
    },
    {
      "id": "slt-hnd-lahori",
      "name": "Lahori Chicken Handi",
      "price": 1199,
      "category": "Pakistani - Handi",
      "region": "Pakistani",
      "station": "main",
      "prepTimeMin": 20,
      "imageUri": "https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=800&q=80",
      "description": "Classic Lahori food street recipe cooked with freshly ground garam masala in clay pot",
      "variants": [
        {
          "name": "Half",
          "price": 1199
        },
        {
          "name": "Full",
          "price": 2099
        }
      ]
    },
    {
      "id": "slt-krh-sultan-mutton-white",
      "name": "Sultan Special Mutton Makhni White Karahi",
      "price": 2399,
      "category": "Pakistani - Karahi",
      "region": "Pakistani",
      "station": "main",
      "prepTimeMin": 35,
      "badge": "Chef Special",
      "imageUri": "https://images.unsplash.com/photo-1545247181-516773cae754?w=800&q=80",
      "description": "Tender mountain mutton cooked in cast iron wok with fresh cream, butter, green chilies and white pepper",
      "variants": [
        {
          "name": "Half",
          "price": 2399
        },
        {
          "name": "Full",
          "price": 4499
        }
      ]
    },
    {
      "id": "slt-krh-mutton",
      "name": "Mutton Karahi",
      "price": 2299,
      "category": "Pakistani - Karahi",
      "region": "Pakistani",
      "station": "main",
      "prepTimeMin": 35,
      "imageUri": "https://images.unsplash.com/photo-1589302168068-964664d93dc0?w=800&q=80",
      "description": "Fresh tender mutton cuts braised in ripe red tomatoes, ginger slivers and desi ghee",
      "variants": [
        {
          "name": "Half",
          "price": 2299
        },
        {
          "name": "Full",
          "price": 4299
        }
      ]
    },
    {
      "id": "slt-krh-mutton-shanwari",
      "name": "Mutton Shanwari",
      "price": 2299,
      "category": "Pakistani - Karahi",
      "region": "Pakistani",
      "station": "main",
      "prepTimeMin": 35,
      "badge": "Shinwari Authentic",
      "imageUri": "https://images.unsplash.com/photo-1545247181-516773cae754?w=800&q=80",
      "description": "Traditional Khyber tribal recipe prepared only with fresh tomatoes, salt and animal fat",
      "variants": [
        {
          "name": "Half",
          "price": 2299
        },
        {
          "name": "Full",
          "price": 4299
        }
      ]
    },
    {
      "id": "slt-krh-dumba",
      "name": "Dumba Karahi",
      "price": 2399,
      "category": "Pakistani - Karahi",
      "region": "Pakistani",
      "station": "main",
      "prepTimeMin": 35,
      "imageUri": "https://images.unsplash.com/photo-1544025162-d76694265947?w=800&q=80",
      "description": "Succulent sheep tail fat lamb prepared in classic wok with pure salt and ripe tomatoes",
      "variants": [
        {
          "name": "Half",
          "price": 2399
        },
        {
          "name": "Full",
          "price": 4499
        }
      ]
    },
    {
      "id": "slt-krh-dumba-shanwari",
      "name": "Dumba Shanwari",
      "price": 2399,
      "category": "Pakistani - Karahi",
      "region": "Pakistani",
      "station": "main",
      "prepTimeMin": 35,
      "badge": "Tribal Classic",
      "imageUri": "https://images.unsplash.com/photo-1545247181-516773cae754?w=800&q=80",
      "description": "Authentic Shinwari style dumba lamb, slow seared with tomatoes and mild green peppers",
      "variants": [
        {
          "name": "Half",
          "price": 2399
        },
        {
          "name": "Full",
          "price": 4499
        }
      ]
    },
    {
      "id": "slt-krh-desi-murgh",
      "name": "Desi Murgh Karahi",
      "price": 1599,
      "category": "Pakistani - Karahi",
      "region": "Pakistani",
      "station": "main",
      "prepTimeMin": 30,
      "badge": "Organic Desi",
      "imageUri": "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=800&q=80",
      "description": "Country chicken slow-cooked in pure desi ghee with crushed coriander and farm tomatoes",
      "variants": [
        {
          "name": "Half",
          "price": 1599
        },
        {
          "name": "Full",
          "price": 2999
        }
      ]
    },
    {
      "id": "slt-krh-white-chicken",
      "name": "Special White Chicken Karahi",
      "price": 1399,
      "category": "Pakistani - Karahi",
      "region": "Pakistani",
      "station": "main",
      "prepTimeMin": 25,
      "imageUri": "https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=800&q=80",
      "description": "Chicken pieces cooked without red spices, bathed in cream, butter and cracked black pepper",
      "variants": [
        {
          "name": "Half",
          "price": 1399
        },
        {
          "name": "Full",
          "price": 2299
        }
      ]
    },
    {
      "id": "slt-krh-lahori-chicken",
      "name": "Lahori Chicken Karahi",
      "price": 1299,
      "category": "Pakistani - Karahi",
      "region": "Pakistani",
      "station": "main",
      "prepTimeMin": 25,
      "imageUri": "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=800&q=80",
      "description": "Food street favorite with punchy tomatoes, fresh garlic and aromatic ground spices",
      "variants": [
        {
          "name": "Half",
          "price": 1299
        },
        {
          "name": "Full",
          "price": 2099
        }
      ]
    },
    {
      "id": "slt-krh-special-chicken",
      "name": "Special Chicken Karahi",
      "price": 1199,
      "category": "Pakistani - Karahi",
      "region": "Pakistani",
      "station": "main",
      "prepTimeMin": 22,
      "imageUri": "https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=800&q=80",
      "description": "Chef's signature chicken karahi bursting with robust ginger and roasted cumin aroma",
      "variants": [
        {
          "name": "Half",
          "price": 1199
        },
        {
          "name": "Full",
          "price": 2099
        }
      ]
    },
    {
      "id": "slt-krh-addon-makhan",
      "name": "Extra Add-on: 200g Makhan",
      "price": 700,
      "category": "Pakistani - Karahi",
      "region": "Pakistani",
      "station": "main",
      "prepTimeMin": 2,
      "imageUri": "https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?w=800&q=80",
      "description": "200g pure desi makhan dollop for extra richness in your Karahi or Handi"
    },
    {
      "id": "slt-mnd-lahm",
      "name": "Lahm Mandi",
      "price": 5499,
      "category": "Mandi Platter",
      "region": "Arabic",
      "station": "main",
      "prepTimeMin": 25,
      "badge": "Royal Arabic",
      "imageUri": "https://images.unsplash.com/photo-1544025162-d76694265947?w=800&q=80",
      "description": "Juicy grilled mutton Turkish kabab, special Mandi rice, grilled vegetables, boiled eggs, Mandi & garlic sauces, dry nuts"
    },
    {
      "id": "slt-mnd-fish",
      "name": "Fish Mandi",
      "price": 3399,
      "category": "Mandi Platter",
      "region": "Arabic",
      "station": "main",
      "prepTimeMin": 22,
      "imageUri": "https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=800&q=80",
      "description": "Juicy grilled Fish Turkish kabab, special Mandi rice, grilled vegetables, boiled eggs, Mandi & garlic sauces, dry nuts"
    },
    {
      "id": "slt-mnd-dajaj",
      "name": "Dajaj Mandi",
      "price": 3199,
      "category": "Mandi Platter",
      "region": "Arabic",
      "station": "main",
      "prepTimeMin": 22,
      "imageUri": "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=800&q=80",
      "description": "Juicy grilled Chicken Turkish kabab, special Mandi rice, grilled vegetables, boiled eggs, Mandi & garlic sauces, dry nuts"
    },
    {
      "id": "slt-mnd-lahm-kuzzu",
      "name": "Lahm Kuzzu",
      "price": 2399,
      "category": "Mandi Platter",
      "region": "Arabic",
      "station": "main",
      "prepTimeMin": 20,
      "imageUri": "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=800&q=80",
      "description": "Signature Mandi Rice, Topped on Mutton, Brown Onion, Cashew Nuts, Served with Kuzzu Yakhni"
    },
    {
      "id": "slt-plt-chicken-bbq-mix",
      "name": "Chicken BBQ Mix Platter",
      "price": 2999,
      "category": "Special Platters",
      "region": "BBQ",
      "station": "main",
      "prepTimeMin": 25,
      "badge": "Serving 2-3",
      "isDeal": true,
      "imageUri": "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800&q=80",
      "description": "Serving: 02-03 Persons | Includes: Chicken Tandoori Boti 3 pcs, Fish Tikka 3 pcs, Chicken Malai Boti 3 pcs, Chicken Haryali Boti 3 pcs, Chicken Turkish Kabab 2 pcs, Sheeshtok 3 pcs, Grilled Vegetables, Special BBQ Sauce, Green Mint Sauce"
    },
    {
      "id": "slt-plt-king-sultan",
      "name": "King Sultan Platter",
      "price": 12999,
      "category": "Special Platters",
      "region": "Pakistani",
      "station": "main",
      "prepTimeMin": 35,
      "badge": "Serving 10-12",
      "isDeal": true,
      "imageUri": "https://images.unsplash.com/photo-1544025162-d76694265947?w=800&q=80",
      "description": "Serving: 10-12 Persons | Includes: Mix Mutton Turkish 750g, Chicken Turkish Kabab 2 pcs, Fish Tikka 10 pcs, Mutton Kabab 4 pcs, Kastoori Boti 10 pcs, Special Malai Boti 10 pcs, Tandoori Boti 10 pcs, Haryali Boti 10 pcs, Chicken Kabab 4 pcs, Mandi Rice, Boiled Eggs, Vegetables with Sweet Garnish, Zeera Raita, BBQ Sauce, Mint Sauce"
    },
    {
      "id": "slt-plt-grand-sultan",
      "name": "Grand Sultan Platter",
      "price": 59999,
      "category": "Special Platters",
      "region": "Pakistani",
      "station": "main",
      "prepTimeMin": 60,
      "badge": "Emperor Feast (22-25)",
      "isDeal": true,
      "imageUri": "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800&q=80",
      "description": "Serving: 22-25 Persons | Includes: Grilled Tender Juicy Full Goat, Mutton Kabab, Chicken Turkish Kabab, Dajaj Mandi, Pome Boti, Malai Boti, Haryali Boti, Cashew Nut, Almond, Black Raisins, Bread Crouton, Turkish Bread, Grilled Vegetables, Roasted Potatoes, Sweet Garnish, Fries, Mandi Rice, Hummus, Kachumbar Salad, Thoam Sauce, Mandi Sauce, Mint Sauce, BBQ Sauce, Boiled Eggs"
    },
    {
      "id": "slt-tan-mix-basket",
      "name": "Mix Basket",
      "price": 550,
      "category": "Tandoor",
      "region": "Pakistani",
      "station": "main",
      "prepTimeMin": 8,
      "imageUri": "https://images.unsplash.com/photo-1601050690597-df0568f70950?w=800&q=80",
      "description": "Assorted tandoor basket featuring Roghni, Garlic, Kalonji and Cheese naan"
    },
    {
      "id": "slt-tan-cheese-naan",
      "name": "Cheese Naan",
      "price": 490,
      "category": "Tandoor",
      "region": "Pakistani",
      "station": "main",
      "prepTimeMin": 8,
      "imageUri": "https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?w=800&q=80",
      "description": "Fresh clay oven baked naan oozing with melted mozzarella cheese"
    },
    {
      "id": "slt-tan-kalonji-naan",
      "name": "Kalonji Naan",
      "price": 170,
      "category": "Tandoor",
      "region": "Pakistani",
      "station": "main",
      "prepTimeMin": 6,
      "imageUri": "https://images.unsplash.com/photo-1601050690597-df0568f70950?w=800&q=80",
      "description": "Fluffy leavened flatbread sprinkled with nigella seeds (kalonji)"
    },
    {
      "id": "slt-tan-desi-ghee-paratha",
      "name": "Desi Ghee Paratha",
      "price": 160,
      "category": "Tandoor",
      "region": "Pakistani",
      "station": "main",
      "prepTimeMin": 8,
      "imageUri": "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=800&q=80",
      "description": "Flaky layered golden paratha griddled with pure fragrant desi ghee"
    },
    {
      "id": "slt-tan-garlic-naan",
      "name": "Garlic Naan",
      "price": 110,
      "category": "Tandoor",
      "region": "Pakistani",
      "station": "main",
      "prepTimeMin": 6,
      "imageUri": "https://images.unsplash.com/photo-1601050690597-df0568f70950?w=800&q=80",
      "description": "Tandoori naan topped with roasted garlic bits and fresh butter"
    },
    {
      "id": "slt-tan-roghni-naan",
      "name": "Roghni Naan",
      "price": 90,
      "category": "Tandoor",
      "region": "Pakistani",
      "station": "main",
      "prepTimeMin": 6,
      "imageUri": "https://images.unsplash.com/photo-1601050690597-df0568f70950?w=800&q=80",
      "description": "Traditional soft royal naan glazed with sesame seeds and milk wash"
    },
    {
      "id": "slt-tan-plain-roti",
      "name": "Plain Roti",
      "price": 60,
      "category": "Tandoor",
      "region": "Pakistani",
      "station": "main",
      "prepTimeMin": 5,
      "imageUri": "https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=800&q=80",
      "description": "Whole wheat freshly slapped tandoor roti (Per Head)"
    },
    {
      "id": "slt-sau-mint",
      "name": "Mint Sauce",
      "price": 150,
      "category": "Sauces",
      "region": "Pakistani",
      "station": "main",
      "prepTimeMin": 3,
      "imageUri": "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=800&q=80",
      "description": "Fresh crushed garden mint and green chili yogurt sauce"
    },
    {
      "id": "slt-sau-zeera-raita",
      "name": "Zeera Raita",
      "price": 150,
      "category": "Sauces",
      "region": "Pakistani",
      "station": "main",
      "prepTimeMin": 3,
      "imageUri": "https://images.unsplash.com/photo-1540420773420-3366772f4999?w=800&q=80",
      "description": "Creamy whipped yogurt seasoned with roasted cumin and rock salt"
    },
    {
      "id": "slt-sau-imli",
      "name": "Imli Sauce",
      "price": 150,
      "category": "Sauces",
      "region": "Pakistani",
      "station": "main",
      "prepTimeMin": 3,
      "imageUri": "https://images.unsplash.com/photo-1541518763669-27fef04b14ea?w=800&q=80",
      "description": "Sweet and tangy slow-simmered tamarind dip infused with spices"
    },
    {
      "id": "slt-des-choc-brownie",
      "name": "Chocolate Hot Brownie",
      "price": 899,
      "category": "Bakery & Desserts",
      "region": "Bakery & Desserts",
      "station": "main",
      "prepTimeMin": 8,
      "imageUri": "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=800&q=80",
      "description": "Served with ice cream"
    },
    {
      "id": "slt-des-lotus-cheesecake",
      "name": "Lotus Cheesecake",
      "price": 899,
      "category": "Bakery & Desserts",
      "region": "Bakery & Desserts",
      "station": "main",
      "prepTimeMin": 6,
      "badge": "Popular",
      "imageUri": "https://images.unsplash.com/photo-1533134242443-d4fd215305ad?w=800&q=80",
      "description": "New York baked cheesecake topped with Lotus spread & Lotus biscuit"
    },
    {
      "id": "slt-des-hot-skillet-brownie",
      "name": "Hot Skillet Brownie",
      "price": 899,
      "category": "Bakery & Desserts",
      "region": "Bakery & Desserts",
      "station": "main",
      "prepTimeMin": 10,
      "imageUri": "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=800&q=80",
      "description": "Hot skillet brownie with ice cream on top, served on hot chocolate sizzling"
    },
    {
      "id": "slt-des-melting-moment",
      "name": "Melting Moment",
      "price": 899,
      "category": "Bakery & Desserts",
      "region": "Bakery & Desserts",
      "station": "main",
      "prepTimeMin": 8,
      "imageUri": "https://images.unsplash.com/photo-1587314168485-3236d6710814?w=800&q=80",
      "description": "Rich melt-in-the-mouth buttery pastry layered with creamy goodness"
    },
    {
      "id": "slt-des-kunafa",
      "name": "Kunafa",
      "price": 899,
      "category": "Bakery & Desserts",
      "region": "Turkish",
      "station": "main",
      "prepTimeMin": 14,
      "badge": "Royal Dessert",
      "imageUri": "https://images.unsplash.com/photo-1579954115545-a95591f28bfc?w=800&q=80",
      "description": "Crunchy golden spun kataifi pastry filled with sweet cheese, orange blossom syrup & pistachios"
    },
    {
      "id": "slt-des-molten-lava",
      "name": "Molten Lava",
      "price": 799,
      "category": "Bakery & Desserts",
      "region": "Bakery & Desserts",
      "station": "main",
      "prepTimeMin": 10,
      "imageUri": "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=800&q=80",
      "description": "Moist chocolate hot sauce with vanilla ice cream"
    },
    {
      "id": "slt-des-three-milk-cake",
      "name": "Three Milk Cake",
      "price": 799,
      "category": "Bakery & Desserts",
      "region": "Bakery & Desserts",
      "station": "main",
      "prepTimeMin": 6,
      "imageUri": "https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=800&q=80",
      "description": "Vanilla sponge dipped in special milky sauce sprinkled with Lotus biscuit"
    },
    {
      "id": "slt-des-bread-pudding",
      "name": "Bread Pudding",
      "price": 699,
      "category": "Bakery & Desserts",
      "region": "Bakery & Desserts",
      "station": "main",
      "prepTimeMin": 8,
      "imageUri": "https://images.unsplash.com/photo-1587314168485-3236d6710814?w=800&q=80",
      "description": "Pleasantly milky baked bread with caramel sauce, served with ice cream topped on sugar crumb"
    },
    {
      "id": "slt-des-red-velvet",
      "name": "Red Velvet Cake/Slice",
      "price": 699,
      "category": "Bakery & Desserts",
      "region": "Bakery & Desserts",
      "station": "main",
      "prepTimeMin": 6,
      "imageUri": "https://images.unsplash.com/photo-1586985289688-ca3cf47d3e6e?w=800&q=80",
      "description": "Moist red cocoa sponge layered with smooth, tangy cream cheese frosting"
    },
    {
      "id": "slt-des-nutella-brownie",
      "name": "Nutella Brownie",
      "price": 699,
      "category": "Bakery & Desserts",
      "region": "Bakery & Desserts",
      "station": "main",
      "prepTimeMin": 6,
      "imageUri": "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=800&q=80",
      "description": "Rich, fudgy chocolate brownie swirled with creamy Nutella"
    },
    {
      "id": "slt-des-shahi-kheer",
      "name": "Shahi Kheer",
      "price": 499,
      "category": "Bakery & Desserts",
      "region": "Pakistani",
      "station": "main",
      "prepTimeMin": 5,
      "imageUri": "https://images.unsplash.com/photo-1541781774459-bb2af2f05b55?w=800&q=80",
      "description": "Slow-reduced aromatic basmati rice pudding topped with cardamom, kewra and slivered nuts"
    },
    {
      "id": "slt-des-gulab-jamun",
      "name": "Hot Gulab Jamun",
      "price": 299,
      "category": "Bakery & Desserts",
      "region": "Pakistani",
      "station": "main",
      "prepTimeMin": 5,
      "imageUri": "https://images.unsplash.com/photo-1541781774459-bb2af2f05b55?w=800&q=80",
      "description": "Soft khoya dumplings dipped in hot green cardamom and saffron rose syrup"
    },
    {
      "id": "slt-bev-cappuccino",
      "name": "Cappuccino",
      "price": 599,
      "category": "Hot Coffee & Tea",
      "region": "Beverages",
      "station": "juice",
      "prepTimeMin": 6,
      "imageUri": "https://images.unsplash.com/photo-1534778101976-62847782c213?w=800&q=80",
      "description": "Espresso shot topped with steamed milk and thick micro-foam dusted with cocoa"
    },
    {
      "id": "slt-bev-latte",
      "name": "Latte",
      "price": 599,
      "category": "Hot Coffee & Tea",
      "region": "Beverages",
      "station": "juice",
      "prepTimeMin": 6,
      "imageUri": "https://images.unsplash.com/photo-1570968915860-54d5c301fa9f?w=800&q=80",
      "description": "Smooth double shot of espresso balanced with silky steamed dairy milk"
    },
    {
      "id": "slt-bev-cafe-mocha",
      "name": "Cafe Mocha",
      "price": 599,
      "category": "Hot Coffee & Tea",
      "region": "Beverages",
      "station": "juice",
      "prepTimeMin": 6,
      "imageUri": "https://images.unsplash.com/photo-1578314675249-a6910f80cc4e?w=800&q=80",
      "description": "Rich espresso combined with Belgian dark chocolate and velvety steamed milk"
    },
    {
      "id": "slt-bev-caramel-latte",
      "name": "Caramel Latte",
      "price": 599,
      "category": "Hot Coffee & Tea",
      "region": "Beverages",
      "station": "juice",
      "prepTimeMin": 6,
      "imageUri": "https://images.unsplash.com/photo-1570968915860-54d5c301fa9f?w=800&q=80",
      "description": "Steamed latte infused with buttery sweet caramel syrup and drizzle"
    },
    {
      "id": "slt-bev-irish-latte",
      "name": "Irish Latte",
      "price": 599,
      "category": "Hot Coffee & Tea",
      "region": "Beverages",
      "station": "juice",
      "prepTimeMin": 6,
      "imageUri": "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=800&q=80",
      "description": "Warm espresso latte flavored with non-alcoholic aromatic Irish cream essence"
    },
    {
      "id": "slt-bev-french-vanilla-latte",
      "name": "French Vanilla Latte",
      "price": 599,
      "category": "Hot Coffee & Tea",
      "region": "Beverages",
      "station": "juice",
      "prepTimeMin": 6,
      "imageUri": "https://images.unsplash.com/photo-1570968915860-54d5c301fa9f?w=800&q=80",
      "description": "Classic latte infused with rich French vanilla bean syrup"
    },
    {
      "id": "slt-bev-hazelnut-latte",
      "name": "Hazelnut Latte",
      "price": 599,
      "category": "Hot Coffee & Tea",
      "region": "Beverages",
      "station": "juice",
      "prepTimeMin": 6,
      "imageUri": "https://images.unsplash.com/photo-1570968915860-54d5c301fa9f?w=800&q=80",
      "description": "Fragrant espresso latte blended with roasted nutty hazelnut syrup"
    },
    {
      "id": "slt-bev-hot-chocolate",
      "name": "Hot Chocolate",
      "price": 599,
      "category": "Hot Coffee & Tea",
      "region": "Beverages",
      "station": "juice",
      "prepTimeMin": 6,
      "imageUri": "https://images.unsplash.com/photo-1542990253-0d0f5be5f0ed?w=800&q=80",
      "description": "Indulgent melted cocoa and milk topped with whipped froth"
    },
    {
      "id": "slt-bev-americano",
      "name": "Americano",
      "price": 499,
      "category": "Hot Coffee & Tea",
      "region": "Beverages",
      "station": "juice",
      "prepTimeMin": 5,
      "imageUri": "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=800&q=80",
      "description": "Double espresso shots lengthened with pure piping hot water for a crisp finish"
    },
    {
      "id": "slt-bev-espresso",
      "name": "Espresso",
      "price": 350,
      "category": "Hot Coffee & Tea",
      "region": "Beverages",
      "station": "juice",
      "prepTimeMin": 4,
      "imageUri": "https://images.unsplash.com/photo-1510591509098-f4fdc6d0ff04?w=800&q=80",
      "description": "Intense, concentrated shot of pure dark roast coffee with golden crema"
    },
    {
      "id": "slt-bev-karak-tea",
      "name": "Karak Tea",
      "price": 199,
      "category": "Hot Coffee & Tea",
      "region": "Pakistani",
      "station": "juice",
      "prepTimeMin": 6,
      "badge": "Desi Favorite",
      "imageUri": "https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=800&q=80",
      "description": "Strong, slow-brewed tea simmered with milk, cardamom and caramelized sugar"
    },
    {
      "id": "slt-bev-green-tea",
      "name": "Green Tea",
      "price": 149,
      "category": "Hot Coffee & Tea",
      "region": "Beverages",
      "station": "juice",
      "prepTimeMin": 5,
      "imageUri": "https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=800&q=80",
      "description": "Soothing brewed green tea infused with whole cardamom and mint"
    },
    {
      "id": "slt-ice-caramel-frappe",
      "name": "Caramel Frappe",
      "price": 599,
      "category": "Ice Coffee",
      "region": "Beverages",
      "station": "juice",
      "prepTimeMin": 6,
      "imageUri": "https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=800&q=80",
      "description": "Chilled blended coffee frappe swirled with caramel and topped with whipped cream"
    },
    {
      "id": "slt-ice-mocha-frappe",
      "name": "Mocha Frappe",
      "price": 599,
      "category": "Ice Coffee",
      "region": "Beverages",
      "station": "juice",
      "prepTimeMin": 6,
      "imageUri": "https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=800&q=80",
      "description": "Blended iced espresso and chocolate topped with chocolate drizzle"
    },
    {
      "id": "slt-ice-spanish-latte",
      "name": "Spanish Latte",
      "price": 499,
      "category": "Ice Coffee",
      "region": "Beverages",
      "station": "juice",
      "prepTimeMin": 6,
      "badge": "Trending",
      "imageUri": "https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?w=800&q=80",
      "description": "Iced espresso poured over sweetened condensed milk and cold fresh milk"
    },
    {
      "id": "slt-ice-caramel-coffee",
      "name": "Caramel Ice Coffee",
      "price": 499,
      "category": "Ice Coffee",
      "region": "Beverages",
      "station": "juice",
      "prepTimeMin": 6,
      "imageUri": "https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?w=800&q=80",
      "description": "Cold brewed espresso served over crystal ice cubes with caramel syrup"
    },
    {
      "id": "slt-ice-irish-coffee",
      "name": "Irish Ice Coffee",
      "price": 499,
      "category": "Ice Coffee",
      "region": "Beverages",
      "station": "juice",
      "prepTimeMin": 6,
      "imageUri": "https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?w=800&q=80",
      "description": "Refreshing cold coffee with rich non-alcoholic Irish cream infusion"
    },
    {
      "id": "slt-ice-vanilla-coffee",
      "name": "French Vanilla Ice Coffee",
      "price": 499,
      "category": "Ice Coffee",
      "region": "Beverages",
      "station": "juice",
      "prepTimeMin": 6,
      "imageUri": "https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?w=800&q=80",
      "description": "Crisp iced coffee sweetened with fragrant French vanilla bean"
    },
    {
      "id": "slt-ice-hazelnut-coffee",
      "name": "Hazelnut Ice Coffee",
      "price": 499,
      "category": "Ice Coffee",
      "region": "Beverages",
      "station": "juice",
      "prepTimeMin": 6,
      "imageUri": "https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?w=800&q=80",
      "description": "Nutty roasted hazelnut cold coffee served chilled over ice"
    },
    {
      "id": "slt-mck-pina-colada",
      "name": "Pina Colada",
      "price": 599,
      "category": "Mocktail",
      "region": "Beverages",
      "station": "juice",
      "prepTimeMin": 6,
      "badge": "Popular",
      "imageUri": "https://images.unsplash.com/photo-1544145945-f90425340c7e?w=800&q=80",
      "description": "Tropical blend of fresh pineapple juice and rich coconut cream served over ice"
    },
    {
      "id": "slt-mck-strawberry-colada",
      "name": "Strawberry Colada",
      "price": 599,
      "category": "Mocktail",
      "region": "Beverages",
      "station": "juice",
      "prepTimeMin": 6,
      "imageUri": "https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=800&q=80",
      "description": "Sweet wild strawberries blended with coconut cream and pineapple juice"
    },
    {
      "id": "slt-mck-guava-mint",
      "name": "Guava Mint Chiller",
      "price": 499,
      "category": "Mocktail",
      "region": "Beverages",
      "station": "juice",
      "prepTimeMin": 6,
      "imageUri": "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=800&q=80",
      "description": "Pink guava juice paired with freshly crushed garden mint and lemon"
    },
    {
      "id": "slt-mck-mint-margarita",
      "name": "Mint Margarita",
      "price": 399,
      "category": "Mocktail",
      "region": "Beverages",
      "station": "juice",
      "prepTimeMin": 5,
      "badge": "Signature Cooler",
      "imageUri": "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=800&q=80",
      "description": "Ice-cold crushed mint leaves, fresh lime juice and sparkling soda"
    },
    {
      "id": "slt-mck-strawberry-margarita",
      "name": "Strawberry Margarita",
      "price": 399,
      "category": "Mocktail",
      "region": "Beverages",
      "station": "juice",
      "prepTimeMin": 5,
      "imageUri": "https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=800&q=80",
      "description": "Zesty crushed strawberries with Persian lime and sparkling soda"
    },
    {
      "id": "slt-mck-blueberry-lagoon",
      "name": "Blueberry Lagoon",
      "price": 399,
      "category": "Mocktail",
      "region": "Beverages",
      "station": "juice",
      "prepTimeMin": 5,
      "imageUri": "https://images.unsplash.com/photo-1544145945-f90425340c7e?w=800&q=80",
      "description": "Electric blue curacao flavor with wild blueberries, lime and soda"
    },
    {
      "id": "slt-mck-mint-mojito",
      "name": "Mint Mojito",
      "price": 399,
      "category": "Mocktail",
      "region": "Beverages",
      "station": "juice",
      "prepTimeMin": 5,
      "imageUri": "https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=800&q=80",
      "description": "Cuban style muddled fresh mint leaves, brown cane sugar, lime and club soda"
    },
    {
      "id": "slt-mck-strawberry-mojito",
      "name": "Strawberry Mojito",
      "price": 399,
      "category": "Mocktail",
      "region": "Beverages",
      "station": "juice",
      "prepTimeMin": 5,
      "imageUri": "https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=800&q=80",
      "description": "Muddled fresh strawberries with wild mint, lime wheels and sparkling fizz"
    },
    {
      "id": "slt-mck-fresh-lime",
      "name": "Fresh Lime",
      "price": 299,
      "category": "Mocktail",
      "region": "Beverages",
      "station": "juice",
      "prepTimeMin": 4,
      "imageUri": "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=800&q=80",
      "description": "Freshly squeezed Persian lime with salt or sweet syrup topped with sparkling soda"
    },
    {
      "id": "slt-crm-shake",
      "name": "Ice Cream Shake",
      "price": 499,
      "category": "Ice Cream",
      "region": "Beverages",
      "station": "juice",
      "prepTimeMin": 8,
      "imageUri": "https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=800&q=80",
      "description": "Thick creamy dairy milkshake prepared with your choice of premium ice cream flavor",
      "variants": [
        {
          "name": "Chocolate",
          "price": 499
        },
        {
          "name": "Mango",
          "price": 499
        },
        {
          "name": "Caramel",
          "price": 499
        },
        {
          "name": "Vanilla",
          "price": 499
        },
        {
          "name": "Strawberry",
          "price": 499
        },
        {
          "name": "Pistachio",
          "price": 499
        }
      ]
    },
    {
      "id": "slt-crm-scoop",
      "name": "Ice Cream Scoop",
      "price": 250,
      "category": "Ice Cream",
      "region": "Bakery & Desserts",
      "station": "juice",
      "prepTimeMin": 3,
      "imageUri": "https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=800&q=80",
      "description": "Single scoop of artisan ice cream served in cup or cone",
      "variants": [
        {
          "name": "Chocolate",
          "price": 250
        },
        {
          "name": "Mango",
          "price": 250
        },
        {
          "name": "Caramel",
          "price": 250
        },
        {
          "name": "Vanilla",
          "price": 250
        },
        {
          "name": "Strawberry",
          "price": 250
        },
        {
          "name": "Pistachio",
          "price": 250
        }
      ]
    },
    {
      "id": "slt-drk-soft-drink",
      "name": "Soft Drink",
      "price": 150,
      "category": "Cold Drinks & Water",
      "region": "Beverages",
      "station": "juice",
      "prepTimeMin": 2,
      "imageUri": "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=800&q=80",
      "description": "Chilled soft drink selection (Coke, Sprite, Fanta, Dew)",
      "variants": [
        {
          "name": "Tin",
          "price": 150
        },
        {
          "name": "1.5 Ltr",
          "price": 250
        }
      ]
    },
    {
      "id": "slt-drk-water",
      "name": "Water",
      "price": 70,
      "category": "Cold Drinks & Water",
      "region": "Beverages",
      "station": "juice",
      "prepTimeMin": 2,
      "imageUri": "https://images.unsplash.com/photo-1548839140-29a749e1bc4e?w=800&q=80",
      "description": "Pure mineral spring water bottle",
      "variants": [
        {
          "name": "Small",
          "price": 70
        },
        {
          "name": "Large",
          "price": 120
        }
      ]
    }
  ],
  categories: [
    "All",
    "Salad",
    "Appetizers",
    "Soup",
    "Continental",
    "Chinese",
    "Pizza",
    "Fast Food",
    "Broast",
    "Turkish Cuisine",
    "BBQ",
    "Biryani",
    "Daal",
    "Pakistani - Handi",
    "Pakistani - Karahi",
    "Mandi Platter",
    "Special Platters",
    "Tandoor",
    "Sauces",
    "Bakery & Desserts",
    "Hot Coffee & Tea",
    "Ice Coffee",
    "Mocktail",
    "Ice Cream",
    "Cold Drinks & Water"
  ],
  zones: ['Ground Floor', '1st Floor', '2nd Floor', '3rd Floor', 'Rooftop'],
  regions: ['Pakistani', 'Chinese', 'Continental', 'Arabic', 'Turkish', 'Fast Food', 'Italian'],
  staff: [
    { id: 'st-master', hasSystemAccess: true, username: 'master', name: 'Master Admin', phone: '+92 300 0000001', role: 'Admin', customRoleId: 'role-admin', pin: '0000', status: 'Active', shift: 'Morning', joinedDate: '2025-01-01', designation: 'Master System Owner (Independent)' },
    { id: 'st-kds', hasSystemAccess: true, username: 'kds', name: 'KDS', phone: '', role: 'Kitchen', customRoleId: 'role-kitchen', pin: '1113', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', designation: 'Kitchen Display System (KDS)' },
    // Kitchen & Production Staff (23 Employees)
    { id: 'st-emp-k01', hasSystemAccess: false, name: 'Fateh Sher', phone: '', role: 'Kitchen', customRoleId: 'role-kitchen', pin: '', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', designation: 'Head Chef' },
    { id: 'st-emp-k02', hasSystemAccess: false, name: 'Sajid', phone: '', role: 'Kitchen', customRoleId: 'role-kitchen', pin: '', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', designation: 'CDP' },
    { id: 'st-emp-k03', hasSystemAccess: false, name: 'Arslan', phone: '', role: 'Kitchen', customRoleId: 'role-kitchen', pin: '', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', designation: 'CDP' },
    { id: 'st-emp-k04', hasSystemAccess: false, name: 'Babar', phone: '', role: 'Kitchen', customRoleId: 'role-kitchen', pin: '', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', designation: 'CDP' },
    { id: 'st-emp-k05', hasSystemAccess: false, name: 'Majid', phone: '', role: 'Kitchen', customRoleId: 'role-kitchen', pin: '', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', designation: 'Bakery' },
    { id: 'st-emp-k06', hasSystemAccess: false, name: 'Shahzaib', phone: '', role: 'Kitchen', customRoleId: 'role-kitchen', pin: '', status: 'Active', shift: 'Evening', joinedDate: '2026-01-01', designation: 'BBQ' },
    { id: 'st-emp-k07', hasSystemAccess: false, name: 'Jafar', phone: '', role: 'Kitchen', customRoleId: 'role-kitchen', pin: '', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', designation: 'Pakistani Food' },
    { id: 'st-emp-k08', hasSystemAccess: false, name: 'Bilal', phone: '', role: 'Kitchen', customRoleId: 'role-kitchen', pin: '', status: 'Active', shift: 'Evening', joinedDate: '2026-01-01', designation: 'Pakistani Food' },
    { id: 'st-emp-k09', hasSystemAccess: false, name: 'Qasim', phone: '', role: 'Kitchen', customRoleId: 'role-kitchen', pin: '', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', designation: 'Fast Food' },
    { id: 'st-emp-k10', hasSystemAccess: false, name: 'Hammad', phone: '', role: 'Kitchen', customRoleId: 'role-kitchen', pin: '', status: 'Active', shift: 'Evening', joinedDate: '2026-01-01', designation: 'Fast Food' },
    { id: 'st-emp-k11', hasSystemAccess: false, name: 'Ahsan', phone: '', role: 'Kitchen', customRoleId: 'role-kitchen', pin: '', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', designation: 'Continental' },
    { id: 'st-emp-k12', hasSystemAccess: false, name: 'Saiful', phone: '', role: 'Kitchen', customRoleId: 'role-kitchen', pin: '', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', designation: 'Chinese' },
    { id: 'st-emp-k13', hasSystemAccess: false, name: 'Asad', phone: '', role: 'Kitchen', customRoleId: 'role-kitchen', pin: '', status: 'Active', shift: 'Evening', joinedDate: '2026-01-01', designation: 'Fast Food' },
    { id: 'st-emp-k14', hasSystemAccess: false, name: 'Muzamil', phone: '', role: 'Kitchen', customRoleId: 'role-kitchen', pin: '', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', designation: 'Kitchen Staff' },
    { id: 'st-emp-k15', hasSystemAccess: false, name: 'Talha', phone: '', role: 'Kitchen', customRoleId: 'role-kitchen', pin: '', status: 'Active', shift: 'Evening', joinedDate: '2026-01-01', designation: 'Chinese' },
    { id: 'st-emp-k16', hasSystemAccess: false, name: 'Huzaifa', phone: '', role: 'Kitchen', customRoleId: 'role-kitchen', pin: '', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', designation: 'Kitchen Staff' },
    { id: 'st-emp-k17', hasSystemAccess: false, name: 'Kamran', phone: '', role: 'Kitchen', customRoleId: 'role-kitchen', pin: '', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', designation: 'GK' },
    { id: 'st-emp-k18', hasSystemAccess: false, name: 'Sajid Dry Cleaner', phone: '', role: 'Kitchen', customRoleId: 'role-kitchen', pin: '', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', designation: 'Dish Washer' },
    { id: 'st-emp-k19', hasSystemAccess: false, name: 'Haider', phone: '', role: 'Kitchen', customRoleId: 'role-kitchen', pin: '', status: 'Active', shift: 'Evening', joinedDate: '2026-01-01', designation: 'BBQ' },
    { id: 'st-emp-k20', hasSystemAccess: false, name: 'Sarim', phone: '', role: 'Kitchen', customRoleId: 'role-kitchen', pin: '', status: 'Active', shift: 'Evening', joinedDate: '2026-01-01', designation: 'Chinese' },
    { id: 'st-emp-k21', hasSystemAccess: false, name: 'Darshan', phone: '', role: 'Kitchen', customRoleId: 'role-kitchen', pin: '', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', designation: 'Dish Washer' },
    { id: 'st-emp-k22', hasSystemAccess: false, name: 'Khan muhammad', phone: '', role: 'Kitchen', customRoleId: 'role-kitchen', pin: '', status: 'Active', shift: 'Evening', joinedDate: '2026-01-01', designation: 'Dish Washer' },
    { id: 'st-emp-k23', hasSystemAccess: false, name: 'Din Muhammad', phone: '', role: 'Kitchen', customRoleId: 'role-kitchen', pin: '', status: 'Active', shift: 'Evening', joinedDate: '2026-01-01', designation: 'Dish Washer' },
    // Management, Floor, Service & Bar Staff (30 Employees)
    { id: 'st-emp-f01', hasSystemAccess: true, username: 'shakeel', name: 'Shakeel', phone: '', role: 'Manager', customRoleId: 'role-manager', pin: '1101', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', designation: 'G. Manager' },
    { id: 'st-emp-f02', hasSystemAccess: true, username: 'nadeem', name: 'Nadeem', phone: '', role: 'Floor Manager', customRoleId: 'role-floor-manager', pin: '1102', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', assignedZone: 'Ground Floor', assignedZones: ['Ground Floor'], designation: 'F. Manager' },
    { id: 'st-emp-f03', hasSystemAccess: true, username: 'adil', name: 'Adil Shah', phone: '', role: 'Floor Manager', customRoleId: 'role-floor-manager', pin: '1103', status: 'Active', shift: 'Evening', joinedDate: '2026-01-01', assignedZone: '1st Floor', assignedZones: ['1st Floor'], designation: 'F. Manager' },
    { id: 'st-emp-f04', hasSystemAccess: true, username: 'zulfiqar', name: 'Zulfiqar', phone: '', role: 'Waiter', customRoleId: 'role-waiter', pin: '1104', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', assignedZone: 'All Floors', assignedZones: ['All Floors'], designation: 'Order Taker' },
    { id: 'st-emp-f05', hasSystemAccess: false, name: 'Mubashir', phone: '', role: 'Waiter', customRoleId: 'role-waiter', pin: '', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', assignedZone: 'All Floors', assignedZones: ['All Floors'], designation: 'Waiter' },
    { id: 'st-emp-f06', hasSystemAccess: false, name: 'Aetsham', phone: '', role: 'Waiter', customRoleId: 'role-waiter', pin: '', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', assignedZone: 'All Floors', assignedZones: ['All Floors'], designation: 'Waiter' },
    { id: 'st-emp-f07', hasSystemAccess: false, name: 'Usama', phone: '', role: 'Waiter', customRoleId: 'role-waiter', pin: '', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', assignedZone: 'All Floors', assignedZones: ['All Floors'], designation: 'Waiter' },
    { id: 'st-emp-f08', hasSystemAccess: false, name: 'Najeeb', phone: '', role: 'Waiter', customRoleId: 'role-waiter', pin: '', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', assignedZone: 'All Floors', assignedZones: ['All Floors'], designation: 'Waiter' },
    { id: 'st-emp-f09', hasSystemAccess: false, name: 'Ashir', phone: '', role: 'Waiter', customRoleId: 'role-waiter', pin: '', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', assignedZone: 'All Floors', assignedZones: ['All Floors'], designation: 'Waiter' },
    { id: 'st-emp-f10', hasSystemAccess: false, name: 'Tasleema', phone: '', role: 'Waiter', customRoleId: 'role-waiter', pin: '', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', assignedZone: 'All Floors', assignedZones: ['All Floors'], designation: 'Waiter (F)' },
    { id: 'st-emp-f11', hasSystemAccess: true, username: 'bilal', name: 'Bilal', phone: '', role: 'Waiter', customRoleId: 'role-waiter', pin: '1105', status: 'Active', shift: 'Evening', joinedDate: '2026-01-01', assignedZone: 'All Floors', assignedZones: ['All Floors'], designation: 'Order Taker' },
    { id: 'st-emp-f12', hasSystemAccess: false, name: 'Tayab', phone: '', role: 'Waiter', customRoleId: 'role-waiter', pin: '', status: 'Active', shift: 'Evening', joinedDate: '2026-01-01', assignedZone: 'All Floors', assignedZones: ['All Floors'], designation: 'Waiter' },
    { id: 'st-emp-f13', hasSystemAccess: false, name: 'Fahad', phone: '', role: 'Waiter', customRoleId: 'role-waiter', pin: '', status: 'Active', shift: 'Evening', joinedDate: '2026-01-01', assignedZone: 'All Floors', assignedZones: ['All Floors'], designation: 'Waiter' },
    { id: 'st-emp-f14', hasSystemAccess: false, name: 'Shafaqat', phone: '', role: 'Waiter', customRoleId: 'role-waiter', pin: '', status: 'Active', shift: 'Evening', joinedDate: '2026-01-01', assignedZone: 'All Floors', assignedZones: ['All Floors'], designation: 'Waiter' },
    { id: 'st-emp-f15', hasSystemAccess: false, name: 'Mohib', phone: '', role: 'JuiceBar', customRoleId: 'role-juicebar', pin: '', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', designation: 'Bar Helper' },
    { id: 'st-emp-f16', hasSystemAccess: true, username: 'sharjeel', name: 'Sharjeel', phone: '', role: 'Cashier', customRoleId: 'role-cashier', pin: '1106', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', designation: 'Cashier' },
    { id: 'st-emp-f17', hasSystemAccess: false, name: 'Misbah', phone: '', role: 'Waiter', customRoleId: 'role-waiter', pin: '', status: 'Active', shift: 'Evening', joinedDate: '2026-01-01', assignedZone: 'All Floors', assignedZones: ['All Floors'], designation: 'Waiter (F)' },
    { id: 'st-emp-f18', hasSystemAccess: false, name: 'Firyal', phone: '', role: 'Waiter', customRoleId: 'role-waiter', pin: '', status: 'Active', shift: 'Evening', joinedDate: '2026-01-01', assignedZone: 'All Floors', assignedZones: ['All Floors'], designation: 'Waiter (F)' },
    { id: 'st-emp-f19', hasSystemAccess: true, username: 'sheroz', name: 'Sheroz', phone: '', role: 'JuiceBar', customRoleId: 'role-juicebar', pin: '1107', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', designation: 'Barman' },
    { id: 'st-emp-f20', hasSystemAccess: false, name: 'Qasim', phone: '', role: 'Waiter', customRoleId: 'role-waiter', pin: '', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', assignedZone: 'All Floors', assignedZones: ['All Floors'], designation: 'Food Runner' },
    { id: 'st-emp-f21', hasSystemAccess: true, username: 'tehreem', name: 'Tehreem', phone: '', role: 'Waiter', customRoleId: 'role-waiter', pin: '1108', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', assignedZone: 'All Floors', assignedZones: ['All Floors'], designation: 'GRO - (F)' },
    { id: 'st-emp-f22', hasSystemAccess: true, username: 'madhia', name: 'Madhia', phone: '', role: 'Waiter', customRoleId: 'role-waiter', pin: '1109', status: 'Active', shift: 'Evening', joinedDate: '2026-01-01', assignedZone: 'All Floors', assignedZones: ['All Floors'], designation: 'GRO - (F)' },
    { id: 'st-emp-f23', hasSystemAccess: true, username: 'tahir', name: 'Tahir', phone: '', role: 'Waiter', customRoleId: 'role-waiter', pin: '1110', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', assignedZone: 'All Floors', assignedZones: ['All Floors'], designation: 'Houseman' },
    { id: 'st-emp-f24', hasSystemAccess: true, username: 'zahid', name: 'Zahid', phone: '', role: 'Manager', customRoleId: 'role-manager', pin: '1111', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', designation: 'Store Keeper' },
    { id: 'st-emp-f25', hasSystemAccess: true, username: 'tanveer', name: 'Tanveer', phone: '', role: 'Cashier', customRoleId: 'role-cashier', pin: '1112', status: 'Active', shift: 'Evening', joinedDate: '2026-01-01', designation: 'Cashier' },
    { id: 'st-emp-f26', hasSystemAccess: false, name: 'Shameer', phone: '', role: 'Waiter', customRoleId: 'role-waiter', pin: '', status: 'Active', shift: 'Evening', joinedDate: '2026-01-01', assignedZone: 'All Floors', assignedZones: ['All Floors'], designation: 'Waiter' },
    { id: 'st-emp-f27', hasSystemAccess: false, name: 'Bilal', phone: '', role: 'Waiter', customRoleId: 'role-waiter', pin: '', status: 'Active', shift: 'Evening', joinedDate: '2026-01-01', assignedZone: 'All Floors', assignedZones: ['All Floors'], designation: 'Waiter' },
    { id: 'st-emp-f28', hasSystemAccess: false, name: 'Mohson', phone: '', role: 'Waiter', customRoleId: 'role-waiter', pin: '', status: 'Active', shift: 'Evening', joinedDate: '2026-01-01', assignedZone: 'All Floors', assignedZones: ['All Floors'], designation: 'Waiter' },
    { id: 'st-emp-f29', hasSystemAccess: false, name: 'Ali Abid', phone: '', role: 'Waiter', customRoleId: 'role-waiter', pin: '', status: 'Active', shift: 'Evening', joinedDate: '2026-01-01', assignedZone: 'All Floors', assignedZones: ['All Floors'], designation: 'Food Helper' },
    { id: 'st-emp-f30', hasSystemAccess: false, name: 'Umar', phone: '', role: 'Waiter', customRoleId: 'role-waiter', pin: '', status: 'Active', shift: 'Evening', joinedDate: '2026-01-01', assignedZone: 'All Floors', assignedZones: ['All Floors'], designation: 'Waiter' },
  ],
  reservations: [],
  inventory: [],
  stockMovements: [],
  expenses: [],
  feedback: [],
  feedbacks: [],
  unavailableItemIds: [],
  suppliers: [],
  purchaseOrders: [],
  supplierPayments: [],
  recipes: [],
  kitchenSessions: [],
  kitchenConsumption: [],
  kitchenManualUsage: [],
  kitchenCash: [],
  shifts: [],
  activeShiftId: null,
  attendance: [],
  salaryPayments: [],
  salesReturns: [],
  assets: [],
  damageRecords: [],
  activeStaffSessions: [],
  revokedSessions: {},
  revokedDeviceIds: {},
  forceLogoutAll: null,
  chillerHandovers: []
};

const LEGACY_DUMMY_IDS = new Set([
  'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10',
  'm11', 'm12', 'm13', 'm14', 'm15', 'm16', 'm17', 'm18', 'm19',
  'deal1', 'deal2', 'm-zain', 'm-shahi-handi', 'm-beef-karahi', 'm-chicken-cheese'
]);
const LEGACY_DUMMY_NAMES = new Set([
  'sultan seekh kebab', 'desi murgh karahi', 'hummus with warm pita', 'royal turkish kunafa',
  'fresh mint margarita', 'fajita supreme pizza', 'smoked mutton ribs', 'sultan dum biryani',
  'grand sultan angus burger', 'cheesy truffle fries', 'choco molten lava cake', 'mango kulfa shake',
  'sultan special roghni naan', 'mutton shinwari karahi', 'chicken manchurian & egg fried rice',
  'chicken chowmein classic', 'hot & sour chicken soup', 'grilled chicken alfredo pasta',
  'crispy fish & chips', 'sultan family feast (4-5 persons)', 'royal couple platter (2 persons)',
  'zain dish', 'sultan shahi handi', 'beef karahii', 'chicken cheese'
]);
function isLegacyDummyDish(m) {
  if (!m) return true;
  if (m.id && LEGACY_DUMMY_IDS.has(m.id)) return true;
  return false;
}

// Backup directory & crash-safe live mirror + OS-level Master Database Vault outside Git (immune to git pull / reset / folder changes!)
const BACKUP_DIR = path.join(__dirname, 'backups');
const LIVE_MIRROR_FILE = path.join(BACKUP_DIR, 'latest-live-state.json');
const VAULT_DIR = path.join(process.env.LOCALAPPDATA || 'C:\\SultanRestaurantData', 'SultanRestaurant', 'DatabaseVault');
const VAULT_DATA_FILE = path.join(VAULT_DIR, 'server-data.json');
const VAULT_BACKUP_DIR = path.join(VAULT_DIR, 'backups');
const VAULT_LIVE_MIRROR_FILE = path.join(VAULT_BACKUP_DIR, 'latest-live-state.json');

function isLegacyDummyInventoryId(id) {
  const s = String(id || '').trim();
  return /^inv\d+$/.test(s) || s.startsWith('invmuzolyg') || s.startsWith('inv-slt-');
}

function countNonAutoBeverageInventory(invArr) {
  if (!Array.isArray(invArr)) return 0;
  return invArr.filter((i) => i && i.id && !String(i.id).startsWith('inv-slt-') && !isLegacyDummyInventoryId(i.id)).length;
}

function findBestBackupSnapshot() {
  try {
    const candidates = [];
    for (const f of [
      VAULT_DATA_FILE,
      VAULT_LIVE_MIRROR_FILE,
      LIVE_MIRROR_FILE,
      path.join(__dirname, 'SultanRestaurant-App', 'server-data.json'),
      'C:\\SultanRestaurant\\server-data.json',
    ]) {
      if (f && fs.existsSync(f)) candidates.push(f);
    }
    for (const dir of [VAULT_BACKUP_DIR, BACKUP_DIR, 'C:\\SultanRestaurant\\backups']) {
      if (!dir || !fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir)
        .filter((f) => f.endsWith('.json') && f !== 'latest-live-state.json')
        .sort()
        .reverse();
      for (const f of files) {
        candidates.push(path.join(dir, f));
      }
    }
    let best = null;
    let bestScore = -1;
    const currentEpoch = Number(serverState?.inventoryResetEpoch || 0);
    for (const p of candidates) {
      try {
        const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
        const bakEpoch = Number(parsed.inventoryResetEpoch || 0);
        if (currentEpoch > 0 && bakEpoch < currentEpoch) continue;
        const rawInv = countNonAutoBeverageInventory(parsed.inventory);
        const cats = Array.isArray(parsed.inventoryCategories) ? parsed.inventoryCategories.length : 0;
        const movs = Array.isArray(parsed.stockMovements)
          ? parsed.stockMovements.filter((m) => m && !isLegacyDummyInventoryId(m.itemId)).length
          : 0;
        const sups = Array.isArray(parsed.suppliers) ? parsed.suppliers.length : 0;
        const pos = Array.isArray(parsed.purchaseOrders) ? parsed.purchaseOrders.length : 0;
        const exps = Array.isArray(parsed.expenses) ? parsed.expenses.length : 0;
        const asts = Array.isArray(parsed.assets) ? parsed.assets.length : 0;
        const invs = Array.isArray(parsed.invoices) ? parsed.invoices.length : 0;
        const customCatsBonus = Math.max(0, cats - 9) * 2000;
        const score = customCatsBonus + rawInv * 1000 + sups * 200 + pos * 150 + exps * 80 + asts * 100 + movs * 10 + invs;
        if (score > bestScore && (cats > 9 || rawInv > 0 || sups > 0 || pos > 0 || exps > 0 || asts > 0 || movs > 0 || invs > 0)) {
          bestScore = score;
          best = { path: p, state: parsed, rawInv, movs, cats };
        }
      } catch (_) { }
    }
    return best;
  } catch (_) {
    return null;
  }
}

function mergeMissingOpsFromBackup(targetState, backupState) {
  if (!backupState || typeof backupState !== 'object') return false;
  let restored = false;
  const opsArrayKeys = [
    'inventoryCategories',
    'assetCategories',
    'expenseCategories',
    'inventory',
    'storageZones',
    'stockMovements',
    'chillerHandovers',
    'suppliers',
    'purchaseOrders',
    'supplierPayments',
    'expenses',
    'assets',
    'damageRecords',
    'recipes',
    'kitchenSessions',
    'kitchenConsumption',
    'kitchenManualUsage',
    'kitchenCash',
    'shifts',
    'serviceRequests',
    'invoices',
    'customers',
    'attendance',
    'salaryPayments',
  ];
  for (const k of opsArrayKeys) {
    const cur = Array.isArray(targetState[k]) ? targetState[k] : [];
    const rawBak = Array.isArray(backupState[k]) ? backupState[k] : [];
    if (k === 'inventoryCategories' || k === 'assetCategories' || k === 'expenseCategories') {
      if (rawBak.length > cur.length) {
        const delCats = new Set(k === 'inventoryCategories' ? (targetState.deletedInventoryCategories || []) : []);
        const mergedCats = Array.from(new Set([...cur, ...rawBak])).filter((c) => c && !delCats.has(c));
        if (mergedCats.length > cur.length) {
          targetState[k] = mergedCats;
          restored = true;
        }
      }
      continue;
    }
    const bak = rawBak.filter((x) => {
      if (!x) return false;
      if (isLegacyDummyInventoryId(x.id) || isLegacyDummyInventoryId(x.itemId)) return false;
      if (/^po-10\d$|^ast-\d+$|^sup-\d+$|^mv-0\d$/.test(String(x.id || ''))) return false;
      if (k === 'shifts' && (x.cashierName === 'Ali Khan' || x.cashierName === 'Sara Ahmed')) return false;
      return true;
    });
    if (bak.length === 0) continue;
    if (k === 'inventory') {
      const curRaw = countNonAutoBeverageInventory(cur);
      const bakRaw = countNonAutoBeverageInventory(bak);
      if (cur.length === 0 || (curRaw === 0 && bakRaw > 0)) {
        const deletedSet = new Set(targetState.deletedInventoryIds || []);
        const map = new Map();
        for (const item of bak) {
          if (item && item.id && !deletedSet.has(item.id)) map.set(item.id, item);
        }
        for (const item of cur) {
          if (item && item.id && !deletedSet.has(item.id)) map.set(item.id, item);
        }
        targetState.inventory = Array.from(map.values());
        restored = true;
      }
    } else if (cur.length === 0 && bak.length > 0) {
      targetState[k] = bak;
      restored = true;
    }
  }
  return restored;
}

// Load or create state (with automatic recovery from backups/ if git pull removed or wiped server-data.json!)
let serverState = { ...INITIAL_STATE };
try {
  if (fs.existsSync(DATA_FILE)) {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    serverState = { ...INITIAL_STATE, ...JSON.parse(raw) };
    // Purge legacy Nov-13 dummy seed inventory & movements on startup so dummy items never appear
    if (Array.isArray(serverState.inventory)) {
      serverState.inventory = serverState.inventory.filter((i) => i && !isLegacyDummyInventoryId(i.id));
    }
    if (Array.isArray(serverState.stockMovements)) {
      serverState.stockMovements = serverState.stockMovements.filter(
        (m) => m && !isLegacyDummyInventoryId(m.itemId) && !/^mv-0\d$/.test(String(m.id || ''))
      );
    }
    if (Array.isArray(serverState.shifts)) {
      serverState.shifts = serverState.shifts.filter(
        (s) => s && s.cashierName !== 'Ali Khan' && s.cashierName !== 'Sara Ahmed'
      );
    }

    const bestBak = findBestBackupSnapshot();
    if (bestBak && mergeMissingOpsFromBackup(serverState, bestBak.state)) {
      console.log(`[Sultan Hub Recovery] Restored missing inventory/categories from backup: ${path.basename(bestBak.path)}`);
    }
    if (!Array.isArray(serverState.menuItems) || serverState.menuItems.length === 0) {
      serverState.menuItems = INITIAL_STATE.menuItems;
    } else if (Array.isArray(serverState.menuItems)) {
      serverState.menuItems = serverState.menuItems.filter(m => !isLegacyDummyDish(m));
      if (serverState.menuItems.length === 0) {
        serverState.menuItems = INITIAL_STATE.menuItems;
      }
    }
    // Repair missing station tags and authentic local menu-images on menuItems
    if (Array.isArray(serverState.menuItems)) {
      let repairedMenuCount = 0;
      for (const m of serverState.menuItems) {
        if (!m) continue;
        if (printerHelper && typeof printerHelper.resolveItemStation === 'function' && m.station !== 'juice' && m.station !== 'main') {
          m.station = printerHelper.resolveItemStation(m, INITIAL_STATE.menuItems, true);
          repairedMenuCount++;
        }
        const curImg = (m.imageUri || m.imageUrl || '').trim();
        const isBuiltIn = typeof m.id === 'string' && m.id.startsWith('slt-');
        const isLegacyStock = !curImg || curImg.toLowerCase().includes('images.unsplash.com/photo-');
        if (isBuiltIn && isLegacyStock) {
          m.imageUri = `/menu-images/${m.id}.jpg`;
          m.imageUrl = m.imageUri;
          repairedMenuCount++;
        } else if (!m.imageUri && m.imageUrl) {
          m.imageUri = m.imageUrl;
          repairedMenuCount++;
        }
      }
      if (repairedMenuCount > 0) {
        console.log(`[Sultan Hub] Repaired station/image tags on ${repairedMenuCount} menu items.`);
        try {
          fs.writeFileSync(DATA_FILE, JSON.stringify(serverState, null, 2));
        } catch (_) { }
      }
    }

    // Clean empty categories on startup
    const usedCatsOnBoot = new Set((serverState.menuItems || []).map(m => m.category).filter(Boolean));
    serverState.categories = ['All', ...Array.from(usedCatsOnBoot)];

    if (Array.isArray(serverState.recipes)) {
      serverState.recipes = serverState.recipes.filter(r => r && !LEGACY_DUMMY_IDS.has(r.menuItemId));
    }
    if (!serverState.onlineOrders) serverState.onlineOrders = [];
    if (!serverState.appUsers) serverState.appUsers = INITIAL_STATE.appUsers;
    if (!serverState.appUserLogs) serverState.appUserLogs = INITIAL_STATE.appUserLogs;
    if (!Array.isArray(serverState.serviceRequests)) serverState.serviceRequests = [];
    if (!Array.isArray(serverState.reservations)) serverState.reservations = INITIAL_STATE.reservations || [];
    if (!Array.isArray(serverState.playlandTickets)) serverState.playlandTickets = [];
    if (!Array.isArray(serverState.activeStaffSessions)) serverState.activeStaffSessions = [];
    if (!serverState.revokedSessions || typeof serverState.revokedSessions !== 'object') serverState.revokedSessions = {};
    if (!serverState.revokedDeviceIds || typeof serverState.revokedDeviceIds !== 'object') serverState.revokedDeviceIds = {};
    if (!Array.isArray(serverState.playlandRides) || serverState.playlandRides.length === 0) {
      serverState.playlandRides = DEFAULT_PLAYLAND_RIDES;
    }
    if (!serverState.tables || serverState.tables.length < 10 || !serverState.tables.some(t => t.seatingType === 'majlis')) {
      serverState.tables = INITIAL_STATE.tables;
    }
    const LEGACY_DUMMY_STAFF_SET = new Set(['st1', 'st2', 'st3', 'st4', 'st5', 'st6', 'st7', 'st-ot1', 'st-ot2', 'st-ot3', 'st-ot4', 'st-fm1', 'st-fm2', 'st-c1', 'st-c2', 'st1794730033364']);
    const LEGACY_DUMMY_STAFF_NAMES = new Set(['junaid ahsan', 'ali khan', 'chef omar', 'order taker 1', 'order taker 2', 'order taker 3', 'order taker 4', 'sara ahmed', 'hamza malik', 'ali raza', 'tariq juice master', 'rashid mehmood', 'tariq javed', 'usman tariq', 'bilal hassan', 'rohan ali']);
    const isDummyStaffServer = (s) => {
      if (!s || !s.id) return true;
      if (s.id === 'st-master') return false;
      if (LEGACY_DUMMY_STAFF_SET.has(String(s.id).trim())) return true;
      const nm = String(s.name || '').trim().toLowerCase();
      if (nm && LEGACY_DUMMY_STAFF_NAMES.has(nm)) return true;
      return false;
    };
    if (!Array.isArray(serverState.staff) || serverState.staff.length === 0) {
      serverState.staff = INITIAL_STATE.staff;
    } else {
      serverState.staff = serverState.staff.filter(s => s && s.id && !LEGACY_DUMMY_STAFF_SET.has(s.id));
      serverState.staff = serverState.staff.filter(s => !isDummyStaffServer(s));
      for (const initSt of (INITIAL_STATE.staff || [])) {
        const existing = serverState.staff.find(s => s && s.id === initSt.id);
        if (!existing) {
          serverState.staff.push({ ...initSt });
        } else if (initSt.hasSystemAccess) {
          existing.hasSystemAccess = true;
          if (!existing.username) existing.username = initSt.username;
          if (!existing.pin) existing.pin = initSt.pin;
        }
      }
    }
    if (!Array.isArray(serverState.deletedTicketIds)) {
      serverState.deletedTicketIds = [];
    }
    if (Array.isArray(serverState.tickets)) {
      const delSet = new Set(serverState.deletedTicketIds);
      const seenOrderKeys = new Set();
      const deduplicatedStartupTickets = [];
      for (const t of serverState.tickets) {
        if (!t || !t.id || delSet.has(t.id)) continue;
        const orderKey = t.orderId ? `ord_${t.orderId}` : (t.orderNumber ? `num_${t.orderNumber}` : null);
        if (orderKey) {
          if (seenOrderKeys.has(orderKey)) {
            console.log(`[Sultan Hub Startup] Removed duplicate ticket ${t.id} for order ${orderKey}`);
            continue;
          }
          seenOrderKeys.add(orderKey);
        }
        if (t.status === 'served' && Array.isArray(t.items)) {
          deduplicatedStartupTickets.push({
            ...t,
            items: t.items.map(it => ({ ...it, completed: true, itemStatus: 'served' }))
          });
        } else {
          deduplicatedStartupTickets.push(t);
        }
      }
      serverState.tickets = deduplicatedStartupTickets;

      // Reconcile online orders against ticket status on startup
      if (Array.isArray(serverState.onlineOrders) && Array.isArray(serverState.tickets)) {
        for (const tk of serverState.tickets) {
          if (!tk || (!tk.orderId && !tk.orderNumber)) continue;
          const ord = serverState.onlineOrders.find(o =>
            (tk.orderId && o.id === tk.orderId) ||
            (tk.orderNumber && o.orderNumber === tk.orderNumber)
          );
          if (!ord) continue;

          const isTicketCooking = tk.status === 'cooking' ||
            (tk.stationStatuses && (tk.stationStatuses.main === 'cooking' || tk.stationStatuses.juice === 'cooking'));
          const isTicketReady = tk.status === 'ready' ||
            (tk.stationStatuses && tk.stationStatuses.main === 'ready' && tk.stationStatuses.juice === 'ready');
          const isTicketServed = tk.status === 'served' ||
            (tk.stationStatuses && tk.stationStatuses.main === 'served' && tk.stationStatuses.juice === 'served');

          if (isTicketServed && ord.status !== 'SERVED' && ord.status !== 'DELIVERED') {
            ord.status = 'SERVED';
          } else if (isTicketReady && ord.status !== 'READY' && ord.status !== 'SERVED' && ord.status !== 'DELIVERED') {
            ord.status = 'READY';
          } else if (isTicketCooking && ord.status === 'CONFIRMED') {
            ord.status = 'PREPARING';
          }
        }
      }
    }
    const activeTicketTableIds = new Set((serverState.tickets || []).map(tk => tk && tk.tableId).filter(Boolean));
    if (Array.isArray(serverState.tables)) {
      const nowInit = Date.now();
      serverState.tables = serverState.tables.map(t => {
        if (t.status === 'occupied' && !activeTicketTableIds.has(t.id) && !t.mergedInto) {
          return {
            ...t,
            status: 'available',
            billTotal: 0,
            orders: [],
            server: undefined,
            isPaid: false,
            lastInvoiceId: undefined,
            occupiedSince: undefined,
            lastSettledAt: t.lastSettledAt || nowInit,
          };
        }
        return t;
      });
    }
    serverState.lastUpdated = Date.now();
    fs.writeFileSync(DATA_FILE, JSON.stringify(serverState, null, 2));
    console.log('[Sultan Hub] Loaded saved database from server-data.json');
  } else {
    const bestBak = findBestBackupSnapshot();
    if (bestBak && bestBak.state) {
      serverState = { ...INITIAL_STATE, ...bestBak.state };
      console.log(`[Sultan Hub Recovery] Restored full database from ${path.basename(bestBak.path)} after git update.`);
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(serverState, null, 2));
    console.log('[Sultan Hub] Initialized server-data.json');
  }
} catch (err) {
  console.error('[Sultan Hub] Error loading server-data.json:', err.message);
}

// -------------------------------------------------------------
// CANONICAL ROLE PERMISSIONS NORMALIZER & SAFE MERGE
// Ensures legacy roles in server-data.json / older APKs always
// receive full POS + CRUD permission keys and never roll back newer edits.
// -------------------------------------------------------------
const SERVER_EMPTY_CRUD_PERMS = {
  canAddRecords: false, canEditRecords: false, canDeleteRecords: false,
  canAddInventory: false, canEditInventory: false, canDeleteInventory: false,
  canAddSuppliers: false, canEditSuppliers: false, canDeleteSuppliers: false,
  canAddTables: false, canEditTables: false, canDeleteTables: false,
  canAddRecipes: false, canEditRecipes: false, canDeleteRecipes: false,
  canAddDiscounts: false, canEditDiscounts: false, canDeleteDiscounts: false,
  canAddExpenses: false, canEditExpenses: false, canDeleteExpenses: false,
  canAddDamages: false, canEditDamages: false, canDeleteDamages: false,
  canAddAssets: false, canEditAssets: false, canDeleteAssets: false,
  canAddStaff: false, canEditStaff: false, canDeleteStaff: false,
  canAddMenu: false, canEditMenu: false, canDeleteMenu: false,
  canAddCustomers: false, canEditCustomers: false, canDeleteCustomers: false,
};

const SERVER_FULL_CRUD_PERMS = Object.keys(SERVER_EMPTY_CRUD_PERMS).reduce((acc, k) => {
  acc[k] = true;
  return acc;
}, {});

const SERVER_EMPTY_POS_PERMS = {
  posCanDineIn: false, posCanTakeaway: false, posCanDelivery: false,
  posCanSendKot: false, posCanSettleBill: false, posCanPrintUnpaidBill: false,
  posCanReleaseTable: false, posCanDismissTicket: false, posCanSplitPayment: false,
  posCanManageCustomers: false,
};

const SERVER_FULL_POS_PERMS = Object.keys(SERVER_EMPTY_POS_PERMS).reduce((acc, k) => {
  acc[k] = true;
  return acc;
}, {});

function getServerRoleDefaultPermissions(role) {
  const id = String(role?.id || '').toLowerCase();
  const base = String(role?.baseRole || '').toLowerCase();
  if (id === 'role-admin' || base === 'admin') {
    return {
      canViewRevenue: true, canViewCostPrice: true, canViewCustomerContacts: true, canExportReports: true,
      canAccessPOS: true, canAccessInvoices: true, canAccessReports: true, canAccessInventory: true,
      canAccessKitchenHandover: true, canAccessRecipes: true, canAccessDiscounts: true, canAccessStaff: true,
      canAccessExpenses: true, canAccessFloorPlan: true, canAccessDamages: true, canAccessAssets: true,
      canApplyCustomDiscount: true, canVoidInvoice: true, canProcessReturns: true, canStartCloseShift: true,
      canModifyMenuPrices: true,
      ...SERVER_FULL_POS_PERMS,
      ...SERVER_FULL_CRUD_PERMS,
    };
  }
  if (id === 'role-manager') {
    return {
      ...SERVER_FULL_POS_PERMS,
      ...SERVER_EMPTY_CRUD_PERMS,
      canAddRecords: true, canEditRecords: true, canDeleteRecords: true,
      canAddInventory: true, canEditInventory: true, canDeleteInventory: true,
      canAddSuppliers: true, canEditSuppliers: true, canDeleteSuppliers: true,
      canAddTables: true, canEditTables: true, canDeleteTables: true,
      canAddRecipes: true, canEditRecipes: true, canDeleteRecipes: true,
      canAddDiscounts: true, canEditDiscounts: true, canDeleteDiscounts: true,
      canAddExpenses: true, canEditExpenses: true, canDeleteExpenses: true,
      canAddDamages: true, canEditDamages: true, canDeleteDamages: true,
      canAddAssets: true, canEditAssets: true, canDeleteAssets: true,
      canAddCustomers: true, canEditCustomers: true, canDeleteCustomers: true,
    };
  }
  if (id === 'role-floor-manager' || base === 'floor_manager') {
    return {
      ...SERVER_EMPTY_POS_PERMS,
      posCanDineIn: true, posCanTakeaway: true, posCanSendKot: true,
      posCanPrintUnpaidBill: true, posCanReleaseTable: true, posCanManageCustomers: true,
      ...SERVER_EMPTY_CRUD_PERMS,
      canAddRecords: true, canEditRecords: true,
      canAddTables: true, canEditTables: true,
      canAddCustomers: true, canEditCustomers: true,
    };
  }
  if (id === 'role-cashier' || String(role?.name || '').toLowerCase() === 'cashier') {
    return {
      ...SERVER_FULL_POS_PERMS,
      posCanDismissTicket: false,
      ...SERVER_EMPTY_CRUD_PERMS,
      canAddRecords: true, canEditRecords: true,
      canAddCustomers: true, canEditCustomers: true,
    };
  }
  if (id === 'role-waiter' || base === 'waiter') {
    return {
      ...SERVER_EMPTY_POS_PERMS,
      posCanDineIn: true, posCanSendKot: true,
      ...SERVER_EMPTY_CRUD_PERMS,
    };
  }
  return {
    ...SERVER_EMPTY_POS_PERMS,
    ...SERVER_EMPTY_CRUD_PERMS,
  };
}

function normalizeServerRole(role) {
  if (!role || typeof role !== 'object') return role;
  const defaults = getServerRoleDefaultPermissions(role);
  const perms = {
    ...defaults,
    ...(role.permissions || {}),
  };
  if (role.id === 'role-admin') {
    perms.canAccessStaff = true;
  }
  return {
    ...role,
    ...(role.id === 'role-cashier' ? { isSystem: true } : {}),
    permissions: perms,
  };
}

function mergeServerRolesSafely(existingRoles, incomingRoles) {
  const extList = Array.isArray(existingRoles) ? existingRoles.map(normalizeServerRole) : [];
  const incList = Array.isArray(incomingRoles) ? incomingRoles.map(normalizeServerRole) : [];
  if (incList.length === 0) return extList;
  if (extList.length === 0) return incList;

  const extMaxTs = extList.reduce((m, r) => Math.max(m, Number(r?.updatedAt) || 0), 0);
  const incMaxTs = incList.reduce((m, r) => Math.max(m, Number(r?.updatedAt) || 0), 0);

  // If incoming payload is strictly older than our saved roles (e.g. stale mobile APK reconnecting), preserve existing
  if (extMaxTs > 0 && incMaxTs > 0 && incMaxTs < extMaxTs) {
    return extList;
  }

  const extMap = new Map(extList.filter(r => r && r.id).map(r => [r.id, r]));
  return incList.map((incRole) => {
    const extRole = extMap.get(incRole.id);
    if (!extRole) return incRole;
    const extTs = Number(extRole.updatedAt) || 0;
    const incTs = Number(incRole.updatedAt) || 0;
    if (extTs > incTs) {
      return extRole;
    }
    return incRole;
  });
}

// Normalize saved roles on startup so every role has complete POS + CRUD permission keys
if (Array.isArray(serverState.roles) && serverState.roles.length > 0) {
  serverState.roles = serverState.roles.map(normalizeServerRole);
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(serverState, null, 2));
  } catch (_) { }
}

// -------------------------------------------------------------
// CENTRAL DUAL-STATION THERMAL PRINT ENGINE + REMOTE PRINT AGENT HUB
// Strict Isolation:
//   - 'main'  -> Main Kitchen Thermal Printer ONLY (default: local POS-80)
//   - 'juice' -> Juice Bar Thermal Printer ONLY (default: Juice Bar PC Print Agent)
//   - Juice Bar slips NEVER leak onto the Kitchen printer!
// -------------------------------------------------------------
const serverAutoPrintedTicketIds = new Set(); // Stores station-scoped keys: "main:KOT-1234", "juice:KOT-1234"
if (Array.isArray(serverState.tickets)) {
  for (const t of serverState.tickets) {
    if (t && t.id) {
      const idStr = String(t.id);
      serverAutoPrintedTicketIds.add(`main:${idStr}`);
      serverAutoPrintedTicketIds.add(`juice:${idStr}`);
    }
  }
}

function isAutoRouteBeveragesEnabled() {
  return !(serverState.systemSettings && serverState.systemSettings.kdsAutoRouteBeverages === false);
}

function getStationPrinterConfig(station) {
  const s = serverState.systemSettings || {};
  if (station === 'juice') {
    return {
      station: 'juice',
      mode: s.juicePrinterMode || 'agent', // 'agent' (Juice Bar PC USB) | 'windows' | 'network' | 'disabled'
      printerName: s.juicePrinterName || 'AUTO',
      host: s.juicePrinterHost || '',
      port: Number(s.juicePrinterPort) || 9100,
    };
  }
  return {
    station: 'main',
    mode: s.kitchenPrinterMode || 'windows', // 'windows' (Server PC USB) | 'network' | 'agent' | 'disabled'
    printerName: s.kitchenPrinterName || 'POS-80',
    host: s.kitchenPrinterHost || '',
    port: Number(s.kitchenPrinterPort) || 9100,
  };
}

// Remote Print Agent Hub (for Juice Bar PC / Remote Station PCs running SultanPrintAgent.exe)
const connectedPrintAgents = { main: null, juice: null };
const remotePrintQueues = { main: [], juice: [] };
const longPollWaiters = { main: [], juice: [] };
const pendingAgentAcks = new Map(); // jobId -> { resolve, timer }
const REMOTE_JOB_TTL_MS = 10 * 60 * 1000; // 10 mins max queue retention
const AGENT_ONLINE_TIMEOUT_MS = 28 * 1000;

function isPrintAgentOnline(station) {
  const info = connectedPrintAgents[station];
  return !!(info && (Date.now() - info.lastSeen) < AGENT_ONLINE_TIMEOUT_MS);
}

function pruneExpiredRemoteJobs(station) {
  const q = remotePrintQueues[station];
  if (!Array.isArray(q) || q.length === 0) return;
  const now = Date.now();
  remotePrintQueues[station] = q.filter((j) => now - j.createdAt < REMOTE_JOB_TTL_MS).slice(-50);
}

function deliverNextRemoteJobToWaiter(station) {
  pruneExpiredRemoteJobs(station);
  const q = remotePrintQueues[station];
  const waiters = longPollWaiters[station];
  if (!q || q.length === 0 || !waiters || waiters.length === 0) return false;

  const job = q.shift();
  const waiter = waiters.shift();
  if (!waiter) {
    q.unshift(job);
    return false;
  }
  clearTimeout(waiter.timer);
  const cfg = getStationPrinterConfig(station);
  try {
    waiter.res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    waiter.res.end(JSON.stringify({
      ok: true,
      configuredPrinter: cfg.printerName || 'AUTO',
      jobId: job.jobId,
      ticketId: job.ticketId,
      tableName: job.tableName,
      station: job.station,
      printerName: job.printerName || cfg.printerName || 'AUTO',
      rawBase64: job.rawBase64,
      plainText: job.plainText || '',
    }));
    return true;
  } catch (_) {
    q.unshift(job);
    return false;
  }
}

function enqueueRemoteAgentPrintJob(station, ticket, buffer, overridePrinterName) {
  pruneExpiredRemoteJobs(station);
  const cfg = getStationPrinterConfig(station);
  const jobId = `job_${station}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const plainText = (printerHelper && typeof printerHelper.buildPlainTextKot === 'function')
    ? (printerHelper.buildPlainTextKot(ticket, station) || '')
    : '';
  const job = {
    jobId,
    ticketId: String(ticket.id || 'KOT'),
    tableName: String(ticket.tableName || ticket.tableId || 'Takeaway'),
    station,
    printerName: overridePrinterName || cfg.printerName || 'AUTO',
    rawBase64: buffer.toString('base64'),
    plainText,
    createdAt: Date.now(),
  };

  if (!remotePrintQueues[station]) remotePrintQueues[station] = [];
  remotePrintQueues[station].push(job);
  if (remotePrintQueues[station].length > 50) {
    remotePrintQueues[station].shift();
  }

  console.log(`[Sultan Hub Print-Agent] Queued ${station.toUpperCase()} KOT #${job.ticketId} (${job.tableName}) for remote Print Agent [${jobId}] (agent ${isPrintAgentOnline(station) ? 'ONLINE' : 'OFFLINE'})`);
  deliverNextRemoteJobToWaiter(station);
  return job;
}

function dispatchStationPrint(ticket, station, options = {}) {
  const targetStation = station === 'juice' ? 'juice' : 'main';
  if (!printerHelper || typeof printerHelper.buildEscPosKotBuffer !== 'function') {
    return Promise.resolve({ success: false, error: 'Printer helper not available', station: targetStation });
  }

  // Normalize stations first so beverage items NEVER stay on 'main'
  const ticketClone = {
    ...ticket,
    items: Array.isArray(ticket.items) ? ticket.items.map((it) => ({ ...it })) : [],
  };
  if (typeof printerHelper.normalizeTicketStations === 'function') {
    printerHelper.normalizeTicketStations(ticketClone, serverState.menuItems || [], isAutoRouteBeveragesEnabled());
  }

  const buffer = printerHelper.buildEscPosKotBuffer(ticketClone, targetStation);
  if (!buffer) {
    return Promise.resolve({
      success: true,
      skipped: true,
      reason: `No ${targetStation} items on ticket #${ticket.id}`,
      station: targetStation,
      ticketId: ticket.id,
    });
  }

  const cfg = getStationPrinterConfig(targetStation);
  if (cfg.mode === 'disabled') {
    return Promise.resolve({
      success: true,
      skipped: true,
      reason: `${targetStation} printer is disabled in settings`,
      station: targetStation,
      ticketId: ticket.id,
    });
  }

  // Mode 1: Remote Station Print Agent (Default for Juice Bar PC!)
  if (cfg.mode === 'agent') {
    const agentOnline = isPrintAgentOnline(targetStation);
    const job = enqueueRemoteAgentPrintJob(targetStation, ticketClone, buffer, options.printerName);

    if (!options.waitForAck) {
      return Promise.resolve({
        success: true,
        queued: true,
        agentOnline,
        jobId: job.jobId,
        station: targetStation,
        ticketId: ticketClone.id,
        printer: (connectedPrintAgents[targetStation] && connectedPrintAgents[targetStation].activePrinter) || cfg.printerName || 'Juice Bar Printer',
      });
    }

    if (!agentOnline) {
      return Promise.resolve({
        success: false,
        queued: true,
        agentOffline: true,
        jobId: job.jobId,
        station: targetStation,
        ticketId: ticketClone.id,
        error: targetStation === 'juice'
          ? 'Juice Bar PC Print Agent is offline. Please run Start-JuiceBar-Printer.bat on the Juice Bar PC.'
          : 'Kitchen PC Print Agent is offline.',
      });
    }

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pendingAgentAcks.delete(job.jobId);
        resolve({
          success: true,
          queued: true,
          agentOnline: true,
          jobId: job.jobId,
          station: targetStation,
          ticketId: ticketClone.id,
          printer: (connectedPrintAgents[targetStation] && connectedPrintAgents[targetStation].activePrinter) || 'Remote Printer',
        });
      }, 5000);
      pendingAgentAcks.set(job.jobId, { resolve, timer });
    });
  }

  // Mode 2: Network LAN/Wi-Fi Thermal Printer (Direct TCP Port 9100)
  if (cfg.mode === 'network') {
    if (!cfg.host) {
      return Promise.resolve({
        success: false,
        station: targetStation,
        ticketId: ticketClone.id,
        error: `${targetStation} network printer IP is not configured`,
      });
    }
    return printerHelper.printRawBufferToNetworkTcp(buffer, cfg.host, cfg.port, ticketClone.id)
      .then((res) => ({ ...res, station: targetStation }));
  }

  // Mode 3: Local / Shared Windows Printer on Server PC (Default for Kitchen POS-80)
  const targetWindowsPrinter = (options.printerName && options.printerName !== 'AUTO')
    ? options.printerName
    : (cfg.printerName && cfg.printerName !== 'AUTO' ? cfg.printerName : 'POS-80');

  return printerHelper.printRawBufferToWindows(buffer, targetWindowsPrinter, ticketClone.id)
    .then((res) => ({ ...res, station: targetStation }));
}

let isAutoPrintingTicket = false;
const serverPrintQueue = [];

function queueAutoPrintTicket(ticket, requestedStation = 'auto') {
  if (!ticket || !ticket.id) return;
  if (!printerHelper || typeof printerHelper.normalizeTicketStations !== 'function') return;

  const autoRouteBev = isAutoRouteBeveragesEnabled();
  const { hasMain, hasJuice } = printerHelper.normalizeTicketStations(
    ticket,
    serverState.menuItems || [],
    autoRouteBev
  );

  const stationsToPrint = [];
  if (requestedStation === 'auto' || requestedStation === 'all') {
    if (hasMain) stationsToPrint.push('main');
    if (hasJuice) stationsToPrint.push('juice');
  } else if (requestedStation === 'main' && hasMain) {
    stationsToPrint.push('main');
  } else if (requestedStation === 'juice' && hasJuice) {
    stationsToPrint.push('juice');
  }

  const tId = String(ticket.id);
  for (const st of stationsToPrint) {
    const dedupKey = `${st}:${tId}`;
    if (serverAutoPrintedTicketIds.has(dedupKey)) continue;
    serverAutoPrintedTicketIds.add(dedupKey);

    if (serverAutoPrintedTicketIds.size > 2000) {
      const firstKey = serverAutoPrintedTicketIds.values().next().value;
      serverAutoPrintedTicketIds.delete(firstKey);
    }

    serverPrintQueue.push({ ticket, station: st });
  }

  processServerPrintQueue();
}

function processServerPrintQueue() {
  if (isAutoPrintingTicket) return;
  const job = serverPrintQueue.shift();
  if (!job) return;

  isAutoPrintingTicket = true;
  const cfg = getStationPrinterConfig(job.station);
  console.log(`[Sultan Hub Auto-Print] Routing ${job.station.toUpperCase()} KOT #${job.ticket.id} (${job.ticket.tableName || 'Takeaway'}) via ${cfg.mode} (${cfg.mode === 'network' ? cfg.host : cfg.printerName})...`);

  dispatchStationPrint(job.ticket, job.station, { waitForAck: false })
    .then((result) => {
      if (result && result.skipped) {
        console.log(`[Sultan Hub Auto-Print] Skipped ${job.station.toUpperCase()} KOT #${job.ticket.id}: ${result.reason}`);
      } else if (result && result.success && !result.queued) {
        console.log(`[Sultan Hub Auto-Print] Direct ${job.station.toUpperCase()} KOT #${job.ticket.id} printed successfully to ${result.printer}.`);
        broadcastToClients({
          type: 'TICKET_AUTO_PRINTED',
          ticketId: job.ticket.id,
          station: job.station,
          printer: result.printer,
          timestamp: Date.now(),
        });
      }
    })
    .catch((err) => {
      console.warn(`[Sultan Hub Auto-Print] Print error for ${job.station.toUpperCase()} #${job.ticket.id}:`, err.message);
    })
    .finally(() => {
      setTimeout(() => {
        isAutoPrintingTicket = false;
        processServerPrintQueue();
      }, 220);
    });
}

// Crash-safe atomic debounced file save + live mirror + daily backup
let saveTimer = null;
let lastBackupDate = '';
function persistState() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const jsonStr = JSON.stringify(serverState, null, 2);
      const tmpFile = `${DATA_FILE}.tmp`;
      fs.writeFileSync(tmpFile, jsonStr);
      fs.renameSync(tmpFile, DATA_FILE);

      if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
      const mirrorTmp = `${LIVE_MIRROR_FILE}.tmp`;
      fs.writeFileSync(mirrorTmp, jsonStr);
      fs.renameSync(mirrorTmp, LIVE_MIRROR_FILE);

      const today = new Date().toISOString().split('T')[0];
      const dailyPath = path.join(BACKUP_DIR, `server-data-${today}.json`);
      // Only overwrite daily snapshot if new state has >= raw inventory items or daily file doesn't exist yet
      if (today !== lastBackupDate || !fs.existsSync(dailyPath)) {
        let allowDailyWrite = true;
        if (fs.existsSync(dailyPath)) {
          try {
            const existingDaily = JSON.parse(fs.readFileSync(dailyPath, 'utf8'));
            if (countNonAutoBeverageInventory(existingDaily.inventory) > countNonAutoBeverageInventory(serverState.inventory)) {
              allowDailyWrite = false;
            }
          } catch (_) { }
        }
        if (allowDailyWrite) {
          fs.writeFileSync(dailyPath, jsonStr);
        }
        lastBackupDate = today;
      }

      // High-water milestone snapshot + External Windows AppData Database Vault (100% immune to Git updates & folder changes!)
      try {
        if (!fs.existsSync(VAULT_DIR)) fs.mkdirSync(VAULT_DIR, { recursive: true });
        if (!fs.existsSync(VAULT_BACKUP_DIR)) fs.mkdirSync(VAULT_BACKUP_DIR, { recursive: true });
        const vaultTmp = `${VAULT_DATA_FILE}.tmp`;
        fs.writeFileSync(vaultTmp, jsonStr);
        fs.renameSync(vaultTmp, VAULT_DATA_FILE);
        const vaultMirrorTmp = `${VAULT_LIVE_MIRROR_FILE}.tmp`;
        fs.writeFileSync(vaultMirrorTmp, jsonStr);
        fs.renameSync(vaultMirrorTmp, VAULT_LIVE_MIRROR_FILE);
        const vaultDailyPath = path.join(VAULT_BACKUP_DIR, `server-data-${today}.json`);
        if (!fs.existsSync(vaultDailyPath)) {
          fs.writeFileSync(vaultDailyPath, jsonStr);
        }
      } catch (_) { }

      const curCatsCount = Array.isArray(serverState.inventoryCategories) ? serverState.inventoryCategories.length : 0;
      const curRawCount = countNonAutoBeverageInventory(serverState.inventory);
      const curSupsCount = Array.isArray(serverState.suppliers) ? serverState.suppliers.length : 0;
      const curPosCount = Array.isArray(serverState.purchaseOrders) ? serverState.purchaseOrders.length : 0;
      const curExpsCount = Array.isArray(serverState.expenses) ? serverState.expenses.length : 0;
      const curAstsCount = Array.isArray(serverState.assets) ? serverState.assets.length : 0;
      if (curCatsCount > 9 || curRawCount > 0 || curSupsCount > 0 || curPosCount > 0 || curExpsCount > 0 || curAstsCount > 0) {
        const curScore = curCatsCount * 50 + curRawCount * 100 + curSupsCount * 80 + curPosCount * 60 + curExpsCount * 40 + curAstsCount * 60;
        for (const mDir of [BACKUP_DIR, VAULT_BACKUP_DIR]) {
          try {
            if (!fs.existsSync(mDir)) fs.mkdirSync(mDir, { recursive: true });
            const milestonePath = path.join(mDir, 'milestone-highwater.json');
            let prevScore = -1;
            if (fs.existsSync(milestonePath)) {
              try {
                const prevM = JSON.parse(fs.readFileSync(milestonePath, 'utf8'));
                const pCats = Array.isArray(prevM.inventoryCategories) ? prevM.inventoryCategories.length : 0;
                const pRaw = countNonAutoBeverageInventory(prevM.inventory);
                const pSups = Array.isArray(prevM.suppliers) ? prevM.suppliers.length : 0;
                const pPos = Array.isArray(prevM.purchaseOrders) ? prevM.purchaseOrders.length : 0;
                const pExps = Array.isArray(prevM.expenses) ? prevM.expenses.length : 0;
                const pAsts = Array.isArray(prevM.assets) ? prevM.assets.length : 0;
                prevScore = pCats * 50 + pRaw * 100 + pSups * 80 + pPos * 60 + pExps * 40 + pAsts * 60;
              } catch (_) { }
            }
            if (curScore >= prevScore) {
              fs.writeFileSync(milestonePath, jsonStr);
            }
          } catch (_) { }
        }
      }
    } catch (e) {
      console.error('[Sultan Hub] Failed to save state to disk:', e.message);
    }
  }, 400);
}

// -------------------------------------------------------------
// CENTRAL AUTO-FLOW ENGINE FOR KDS ORDERS
// 1. Pending -> Cooking after 30 seconds
// 2. Cooking -> Ready when preparation timer expires
// 3. Ready -> Served (Dispatched) after 1.5 minutes (90 seconds)
// -------------------------------------------------------------
const autoStartedServerTicketIds = new Set();
const autoReadyServerTicketIds = new Set();
const autoDispatchedServerTicketIds = new Set();

setInterval(() => {
  if (!Array.isArray(serverState.tickets) || serverState.tickets.length === 0) return;
  const now = Date.now();
  let stateModified = false;

  for (const ticket of serverState.tickets) {
    if (!ticket || !ticket.id) continue;

    const hasMainIt = Array.isArray(ticket.items) && ticket.items.some(i => (i?.station || 'main') === 'main');
    const hasJuiceIt = Array.isArray(ticket.items) && ticket.items.some(i => i?.station === 'juice');
    if (!ticket.stationStatuses) ticket.stationStatuses = {};
    if (hasMainIt && !ticket.stationStatuses.main) ticket.stationStatuses.main = ticket.status || 'pending';
    if (hasJuiceIt && !ticket.stationStatuses.juice) ticket.stationStatuses.juice = ticket.status || 'pending';
    if (!hasMainIt) delete ticket.stationStatuses.main;
    if (!hasJuiceIt) delete ticket.stationStatuses.juice;

    // 1. Pending -> Cooking after 30s (checks overall OR per-station pending)
    const isAnyPending = ticket.status === 'pending' ||
      (hasMainIt && ticket.stationStatuses.main === 'pending') ||
      (hasJuiceIt && ticket.stationStatuses.juice === 'pending');

    if (isAnyPending) {
      const placedAt = ticket.timePlaced || now;
      const elapsedMs = now - placedAt;

      if (elapsedMs >= 30000 && !autoStartedServerTicketIds.has(ticket.id)) {
        autoStartedServerTicketIds.add(ticket.id);
        if (ticket.status === 'pending') ticket.status = 'cooking';
        if (!ticket.cookingStartedAt) ticket.cookingStartedAt = now;

        if (hasMainIt && (!ticket.stationStatuses.main || ticket.stationStatuses.main === 'pending')) {
          ticket.stationStatuses.main = 'cooking';
        }
        if (hasJuiceIt && (!ticket.stationStatuses.juice || ticket.stationStatuses.juice === 'pending')) {
          ticket.stationStatuses.juice = 'cooking';
        }

        if (Array.isArray(ticket.items)) {
          ticket.items = ticket.items.map(it => ({
            ...it,
            itemStatus: (it.itemStatus === 'ready' || it.itemStatus === 'served') ? it.itemStatus : 'cooking'
          }));
        }

        stateModified = true;
        console.log(`[Sultan Hub Auto-Cooking] Ticket #${ticket.id} (${ticket.tableName || 'Takeaway'}) auto-transitioned to COOKING after 30s.`);

        const stationLabel = 'Kitchen';
        const cookingAlert = {
          id: `cook_${ticket.id}_all_${now}`,
          ticketId: ticket.id,
          tableId: ticket.tableId,
          tableName: ticket.tableName,
          server: ticket.server,
          station: 'all',
          stationLabel,
          itemsSummary: 'Cooking started! (Timer: 15 mins)',
          type: 'cooking_started',
          estimatedMinutes: 15,
          time: now,
        };
        serverState.lastFoodReadyAlert = cookingAlert;

        // Auto-synchronize linked online order
        const targetOrdId = ticket.orderId || ticket.orderNumber;
        if (targetOrdId && Array.isArray(serverState.onlineOrders)) {
          const ord = serverState.onlineOrders.find(o => o.id === targetOrdId || o.orderNumber === targetOrdId);
          if (ord && (ord.status === 'CONFIRMED' || ord.status === 'PENDING')) {
            ord.status = 'PREPARING';
            ord.updatedAt = now;
            broadcastToClients({
              type: 'ORDER_STATUS_CHANGED',
              orderId: ord.id,
              orderNumber: ord.orderNumber,
              status: 'PREPARING',
              riderName: ord.riderName,
              riderPhone: ord.riderPhone,
              assignedWaiter: ord.assignedWaiter,
              timestamp: now,
            });
          }
        }

        broadcastToClients({
          type: 'COOKING_STARTED_ALERT',
          ticketId: ticket.id,
          ticket,
          lastFoodReadyAlert: cookingAlert,
          timestamp: now,
        });
      }
    }

    // 2. Cooking -> Ready when preparation timer expires
    else if (ticket.status === 'cooking') {
      const items = Array.isArray(ticket.items) ? ticket.items : [];
      const prepMins = items.length > 0
        ? Math.max(...items.map(i => i.prepTimeMin || 15))
        : (ticket.estimatedPrepTime || 15);
      const allowedMs = prepMins * 60 * 1000;
      const startTime = ticket.cookingStartedAt || ticket.timePlaced || now;
      const elapsedMs = now - startTime;

      if (elapsedMs >= allowedMs && !autoReadyServerTicketIds.has(ticket.id)) {
        autoReadyServerTicketIds.add(ticket.id);
        ticket.status = 'ready';
        ticket.readyAt = now;

        if (!ticket.stationStatuses) {
          ticket.stationStatuses = { main: 'ready', juice: 'ready' };
        } else {
          if (ticket.stationStatuses.main) ticket.stationStatuses.main = 'ready';
          if (ticket.stationStatuses.juice) ticket.stationStatuses.juice = 'ready';
        }

        if (Array.isArray(ticket.items)) {
          ticket.items = ticket.items.map(it => ({
            ...it,
            itemStatus: 'ready',
            completed: true,
            readyAt: it.readyAt || now,
          }));
        }

        stateModified = true;
        console.log(`[Sultan Hub Auto-Ready] Ticket #${ticket.id} (${ticket.tableName || 'Takeaway'}) prep timer (${prepMins}m) expired. Auto-transitioned to READY.`);

        const stationItems = (Array.isArray(ticket.items) ? ticket.items : []).map(i => `${i.qty || 1}x ${i.name}`).join(', ');
        const readyAlert = {
          id: `ready_${ticket.id}_all_${now}`,
          ticketId: ticket.id,
          tableId: ticket.tableId,
          tableName: ticket.tableName,
          server: ticket.server,
          station: 'all',
          stationLabel: 'Kitchen',
          itemsSummary: stationItems || 'Order Ready for Pickup',
          type: 'ready',
          time: now,
        };
        serverState.lastFoodReadyAlert = readyAlert;

        // Auto-synchronize linked online order
        const targetOrdId = ticket.orderId || ticket.orderNumber;
        if (targetOrdId && Array.isArray(serverState.onlineOrders)) {
          const ord = serverState.onlineOrders.find(o => o.id === targetOrdId || o.orderNumber === targetOrdId);
          if (ord && (ord.status === 'PREPARING' || ord.status === 'CONFIRMED')) {
            ord.status = 'READY';
            ord.updatedAt = now;
            broadcastToClients({
              type: 'ORDER_STATUS_CHANGED',
              orderId: ord.id,
              orderNumber: ord.orderNumber,
              status: 'READY',
              riderName: ord.riderName,
              riderPhone: ord.riderPhone,
              assignedWaiter: ord.assignedWaiter,
              timestamp: now,
            });
          }
        }

        broadcastToClients({
          type: 'FOOD_READY_ALERT',
          ticketId: ticket.id,
          ticket,
          lastFoodReadyAlert: readyAlert,
          timestamp: now,
        });
      }
    }

    // 3. Ready -> Served (Dispatched) after 1.5 minutes (90 seconds) — works both overall and per-station!
    else if (
      ticket.status === 'ready' ||
      (hasMainIt && ticket.stationStatuses.main === 'ready') ||
      (hasJuiceIt && ticket.stationStatuses.juice === 'ready')
    ) {
      const items = Array.isArray(ticket.items) ? ticket.items : [];
      const readyAt = ticket.readyAt || Math.max(0, ...items.map(i => i.readyAt || 0)) || ticket.timePlaced || now;
      const elapsedReadyMs = now - readyAt;

      if (elapsedReadyMs >= 90000 && !autoDispatchedServerTicketIds.has(ticket.id)) {
        autoDispatchedServerTicketIds.add(ticket.id);
        if (hasMainIt && ticket.stationStatuses.main === 'ready') {
          ticket.stationStatuses.main = 'served';
        }
        if (hasJuiceIt && ticket.stationStatuses.juice === 'ready') {
          ticket.stationStatuses.juice = 'served';
        }

        if (Array.isArray(ticket.items)) {
          ticket.items = ticket.items.map(it => {
            const st = it?.station === 'juice' ? 'juice' : 'main';
            if (ticket.stationStatuses[st] === 'served' || it.itemStatus === 'ready') {
              return {
                ...it,
                itemStatus: 'served',
                completed: true,
              };
            }
            return it;
          });
        }

        const activeStVals = Object.values(ticket.stationStatuses).filter(Boolean);
        if (activeStVals.length === 0 || activeStVals.every(s => s === 'served')) {
          ticket.status = 'served';
        } else if (activeStVals.every(s => s === 'ready' || s === 'served')) {
          ticket.status = 'ready';
        }

        if (serverState.lastFoodReadyAlert && serverState.lastFoodReadyAlert.ticketId === ticket.id) {
          serverState.lastFoodReadyAlert = null;
        }

        stateModified = true;
        console.log(`[Sultan Hub Auto-Dispatch] Ticket #${ticket.id} (${ticket.tableName || 'Takeaway'}) 1.5 mins elapsed since ready. Auto-dispatched (SERVED).`);

        // Auto-synchronize linked online order
        const targetOrdId = ticket.orderId || ticket.orderNumber;
        if (targetOrdId && Array.isArray(serverState.onlineOrders)) {
          const ord = serverState.onlineOrders.find(o => o.id === targetOrdId || o.orderNumber === targetOrdId);
          if (ord && ord.status === 'READY') {
            ord.status = 'SERVED';
            ord.updatedAt = now;
            broadcastToClients({
              type: 'ORDER_STATUS_CHANGED',
              orderId: ord.id,
              orderNumber: ord.orderNumber,
              status: 'SERVED',
              riderName: ord.riderName,
              riderPhone: ord.riderPhone,
              assignedWaiter: ord.assignedWaiter,
              timestamp: now,
            });
          }
        }

        broadcastToClients({
          type: 'TICKET_DISPATCHED',
          ticketId: ticket.id,
          ticket,
          timestamp: now,
        });
      }
    }
  }

  if (stateModified) {
    persistState();
    broadcastToClients({
      type: 'SERVER_BROADCAST',
      state: {
        tickets: serverState.tickets,
        lastFoodReadyAlert: serverState.lastFoodReadyAlert,
        onlineOrders: serverState.onlineOrders,
      },
      timestamp: now,
    });
  }
}, 3000);

// Simple in-memory rate limiter for public endpoints
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 200;
const rateLimitMap = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const record = rateLimitMap.get(ip) || { count: 0, resetTime: now + RATE_LIMIT_WINDOW_MS };

  if (now > record.resetTime) {
    record.count = 1;
    record.resetTime = now + RATE_LIMIT_WINDOW_MS;
    rateLimitMap.set(ip, record);
    return true;
  }

  record.count++;
  rateLimitMap.set(ip, record);
  return record.count <= MAX_REQUESTS_PER_WINDOW;
}

// Helper: Sanitize public menu item (Strip sensitive margin, cost, supplier notes)
function sanitizeMenuItem(item) {
  const lowerName = (item.name || '').toLowerCase().trim();
  const visual = PRESET_VISUALS[lowerName] || {};
  const rawImg = (item.imageUri || item.imageUrl || '').trim();
  const isBuiltIn = typeof item.id === 'string' && item.id.startsWith('slt-');
  const resolvedImg = (isBuiltIn && (!rawImg || rawImg.toLowerCase().includes('images.unsplash.com/photo-')))
    ? `/menu-images/${item.id}.jpg`
    : (rawImg || visual.imageUri || 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800&q=80');

  return {
    id: item.id || `m-${Date.now()}`,
    name: item.name,
    urduName: item.urduName || undefined,
    price: Number(item.price) || 0,
    category: item.category || visual.category || 'Mains',
    region: item.region || undefined,
    station: item.station || undefined,
    prepTimeMin: item.prepTimeMin || undefined,
    description: item.description || visual.description || `${item.name} prepared freshly with authentic royal spices.`,
    imageUri: resolvedImg,
    imageUrl: resolvedImg,
    badge: item.badge || visual.badge || undefined,
    isPopular: item.isPopular || item.badge === 'Chef Special' || item.badge === 'Best Seller',
    isAvailable: item.isAvailable !== false,
    rating: Number(item.rating || visual.rating || 4.8),
    preparationTimeMinutes: Number(item.preparationTimeMinutes || visual.prepTime || 20),
    variants: Array.isArray(item.variants) ? item.variants.map(v => ({ name: v.name, price: Number(v.price) })) : undefined,
    isDeal: Boolean(item.isDeal),
    dealOriginalPrice: item.dealOriginalPrice ? Number(item.dealOriginalPrice) : undefined,
    dealItems: item.dealItems || undefined
  };
}

// Helper: Read JSON request body
function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error('Invalid JSON format'));
      }
    });
    req.on('error', err => reject(err));
  });
}

// Central Request Handler
async function handleRequest(req, res) {
  const clientIp = req.socket.remoteAddress || 'unknown';

  // Security Headers & CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  // Rate Limiting Enforcement (never throttle local print agents, high-throughput system audit logs, or internal sync calls)
  if (!url.pathname.startsWith('/api/print') && !url.pathname.startsWith('/api/system-logs') && !checkRateLimit(clientIp)) {
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'Rate limit reached. Please wait a moment.' }));
    return;
  }

  // 1. Health / System Status (Pure API endpoints only, never intercept browser HTML paths)
  if (url.pathname === '/health' || url.pathname === '/api/status') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    });
    res.end(JSON.stringify({
      status: 'online',
      server: 'Sultan Central POS & Mobile Hub',
      clientsCount: wss ? wss.clients.size : 0,
      activeMenuCount: (serverState.menuItems || []).length,
      registeredAppUsers: (serverState.appUsers || []).length,
      timestamp: Date.now()
    }));
    return;
  }

  // -------------------------------------------------------------
  // CUSTOMER AUTHENTICATION ENDPOINTS (Sign Up & Login)
  // -------------------------------------------------------------

  // POST /api/auth/register
  if (url.pathname === '/api/auth/register' && req.method === 'POST') {
    try {
      const payload = await readRequestBody(req);
      const { name, phone, password, address, deviceInfo } = payload;

      if (!name || !phone || !password) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Name, phone number and password are required' }));
        return;
      }

      const cleanPhone = phone.trim().replace(/\D/g, '');
      const existingUser = (serverState.appUsers || []).find(u => u.phone.replace(/\D/g, '') === cleanPhone);

      if (existingUser) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'An account with this phone number already exists. Please log in.' }));
        return;
      }

      const newUser = {
        id: `usr-${Date.now()}`,
        name: name.trim(),
        phone: phone.trim(),
        password: password.trim(),
        address: address ? address.trim() : '',
        deviceInfo: deviceInfo || 'Mobile App',
        registeredAt: Date.now(),
        lastLoginAt: Date.now(),
        totalOrders: 0,
        totalSpent: 0,
        status: 'Active'
      };

      if (!serverState.appUsers) serverState.appUsers = [];
      serverState.appUsers.unshift(newUser);

      // Audit Log Entry
      const logEntry = {
        id: `log-${Date.now()}`,
        userId: newUser.id,
        name: newUser.name,
        phone: newUser.phone,
        action: 'SIGNUP',
        deviceInfo: newUser.deviceInfo,
        timestamp: Date.now(),
        details: 'User created a new account on mobile app'
      };
      if (!serverState.appUserLogs) serverState.appUserLogs = [];
      serverState.appUserLogs.unshift(logEntry);

      // Also ensure this user exists in Customer CRM
      if (!serverState.customers) serverState.customers = [];
      const crmCustomer = serverState.customers.find(c => c.phone.replace(/\D/g, '') === cleanPhone);
      if (!crmCustomer) {
        serverState.customers.unshift({
          id: `crm-${Date.now()}`,
          name: newUser.name,
          phone: newUser.phone,
          address: newUser.address,
          totalOrders: 0,
          totalSpent: 0,
          firstVisit: Date.now(),
          tags: ['Mobile App User']
        });
      }

      persistState();

      // Broadcast new registration to admin web app
      broadcastToClients({
        type: 'APP_USER_REGISTERED',
        user: { id: newUser.id, name: newUser.name, phone: newUser.phone, registeredAt: newUser.registeredAt },
        log: logEntry,
        timestamp: Date.now()
      });

      // Issue mock JWT token
      const token = `sultan_jwt_${newUser.id}_${Date.now()}`;

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        token,
        user: {
          id: newUser.id,
          name: newUser.name,
          phone: newUser.phone,
          address: newUser.address,
          role: 'customer'
        },
        message: 'Account created successfully! Welcome to Sultan Restaurant.'
      }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // POST /api/auth/login
  if (url.pathname === '/api/auth/login' && req.method === 'POST') {
    try {
      const payload = await readRequestBody(req);
      const { phone, password, deviceInfo } = payload;

      if (!phone || !password) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Phone number and password are required' }));
        return;
      }

      const cleanPhone = phone.trim().replace(/\D/g, '');
      const user = (serverState.appUsers || []).find(u => u.phone.replace(/\D/g, '') === cleanPhone);

      if (!user) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'No account found with this phone number. Please sign up.' }));
        return;
      }

      if (user.password !== password.trim()) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Invalid password. Please try again.' }));
        return;
      }

      user.lastLoginAt = Date.now();
      if (deviceInfo) user.deviceInfo = deviceInfo;

      // Audit Log Entry
      const logEntry = {
        id: `log-${Date.now()}`,
        userId: user.id,
        name: user.name,
        phone: user.phone,
        action: 'LOGIN',
        deviceInfo: user.deviceInfo,
        timestamp: Date.now(),
        details: 'Customer logged in to mobile app'
      };
      if (!serverState.appUserLogs) serverState.appUserLogs = [];
      serverState.appUserLogs.unshift(logEntry);

      persistState();

      // Broadcast login event to admin dashboard
      broadcastToClients({
        type: 'APP_USER_LOGIN',
        user: { id: user.id, name: user.name, phone: user.phone, lastLoginAt: user.lastLoginAt },
        log: logEntry,
        timestamp: Date.now()
      });

      const token = `sultan_jwt_${user.id}_${Date.now()}`;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        token,
        user: {
          id: user.id,
          name: user.name,
          phone: user.phone,
          address: user.address,
          role: 'customer'
        },
        message: `Welcome back, ${user.name}!`
      }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // ==============================================================
  // STAFF PER-ACCOUNT INDEPENDENT SESSION MANAGEMENT (Single/Multi-Device)
  // ==============================================================
  // POST /api/auth/staff-session/login
  if (url.pathname === '/api/auth/staff-session/login' && req.method === 'POST') {
    try {
      const payload = await readRequestBody(req);
      const {
        sessionId,
        staffId,
        username,
        staffName,
        role,
        deviceId,
        deviceName,
        platform,
        maxConcurrentDevices,
        autoKickPreviousDevice,
      } = payload || {};

      if (!sessionId || !staffId || !deviceId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'sessionId, staffId, and deviceId are required' }));
        return;
      }

      const now = Date.now();
      const normStaffId = String(staffId).toLowerCase().trim();
      const staffRecord = (serverState.staff || []).find(
        (s) => s && String(s.id || '').toLowerCase().trim() === normStaffId
      );

      const globalDefaultMax = Math.max(1, Number(serverState.systemSettings?.defaultMaxDevicesPerStaff || 1));
      const userOverrideMax =
        staffRecord && Number(staffRecord.maxConcurrentDevices) > 0
          ? Number(staffRecord.maxConcurrentDevices)
          : Number(maxConcurrentDevices) > 0
            ? Number(maxConcurrentDevices)
            : 0;
      const effectiveMaxDevices = Math.max(1, userOverrideMax || globalDefaultMax);
      const shouldAutoKick =
        typeof autoKickPreviousDevice === 'boolean'
          ? autoKickPreviousDevice
          : serverState.systemSettings?.autoKickPreviousDevice !== false;

      // Prune stale sessions (>24h) and expired revocations (>1h)
      const currentSessions = (serverState.activeStaffSessions || []).filter(
        (s) => s && now - (s.lastActiveTime || s.loginTime || 0) < 24 * 60 * 60 * 1000
      );
      if (!serverState.revokedSessions || typeof serverState.revokedSessions !== 'object') {
        serverState.revokedSessions = {};
      }
      if (!serverState.revokedDeviceIds || typeof serverState.revokedDeviceIds !== 'object') {
        serverState.revokedDeviceIds = {};
      }
      for (const k of Object.keys(serverState.revokedSessions)) {
        if (now - (serverState.revokedSessions[k]?.timestamp || 0) > 60 * 60 * 1000) {
          delete serverState.revokedSessions[k];
        }
      }
      for (const d of Object.keys(serverState.revokedDeviceIds)) {
        if (now - (serverState.revokedDeviceIds[d]?.timestamp || 0) > 60 * 60 * 1000) {
          delete serverState.revokedDeviceIds[d];
        }
      }

      // STRICT per-account isolation: ONLY inspect sessions belonging to THIS exact staffId!
      const isSameAccount = (s) => String(s.staffId || '').toLowerCase().trim() === normStaffId;
      const sameAccountOtherDevices = currentSessions.filter(
        (s) => isSameAccount(s) && s.deviceId !== deviceId
      );

      const excess = sameAccountOtherDevices.length + 1 - effectiveMaxDevices;
      if (excess > 0 && !shouldAutoKick) {
        const activeOn = sameAccountOtherDevices[0]?.deviceName || 'another device';
        res.writeHead(409, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            success: false,
            allowed: false,
            code: 'DEVICE_LIMIT_REACHED',
            error: `Account "${username || staffName || staffId}" is already logged in on ${activeOn} (Max ${effectiveMaxDevices} device). Log out there first or enable Auto-Logout in Settings.`,
            activeDevices: sameAccountOtherDevices,
          })
        );
        return;
      }

      // Clear any stale device-level revocation for the newly logging-in device
      if (serverState.revokedDeviceIds[deviceId]) {
        delete serverState.revokedDeviceIds[deviceId];
      }

      let remainingOtherDevices = [...sameAccountOtherDevices];
      const kickedSessions = [];
      const newlyRevokedSessions = {};
      const newlyRevokedDevices = {};

      if (excess > 0) {
        remainingOtherDevices.sort((a, b) => (a.loginTime || 0) - (b.loginTime || 0));
        const toKick = remainingOtherDevices.slice(0, excess);
        for (const kicked of toKick) {
          kickedSessions.push(kicked);
          const reasonText = `Doosri device (${deviceName || 'New Device'}) par login kiya gaya hai`;
          const rec = {
            sessionId: kicked.sessionId,
            deviceId: kicked.deviceId,
            staffId: kicked.staffId,
            staffName: kicked.staffName,
            timestamp: now,
            reason: reasonText,
          };
          serverState.revokedSessions[kicked.sessionId] = rec;
          serverState.revokedDeviceIds[kicked.deviceId] = rec;
          newlyRevokedSessions[kicked.sessionId] = rec;
          newlyRevokedDevices[kicked.deviceId] = rec;
        }
        remainingOtherDevices = remainingOtherDevices.slice(excess);
      }

      const newSession = {
        sessionId,
        staffId: String(staffId),
        username: username || staffRecord?.username || undefined,
        staffName: staffName || staffRecord?.name || String(staffId),
        role: String(role || staffRecord?.role || 'staff'),
        deviceId: String(deviceId),
        deviceName: deviceName || 'Terminal',
        platform: platform || 'web',
        loginTime: now,
        lastActiveTime: now,
      };

      // Preserve ALL other users' sessions 100% untouched (also clear any prior session on THIS device)
      const otherUsersSessions = currentSessions.filter(
        (s) => !isSameAccount(s) && s.deviceId !== deviceId
      );
      serverState.activeStaffSessions = [...otherUsersSessions, ...remainingOtherDevices, newSession];
      serverState.lastUpdated = now;
      lastStateFingerprint = computeStateFingerprint(serverState);
      persistState();

      if (kickedSessions.length > 0) {
        console.log(
          `[Sultan Hub Auth] Account "${newSession.username || newSession.staffName}" logged in on ${newSession.deviceName}; auto-logged out ${kickedSessions.length} earlier device(s).`
        );
        appendSystemLogs(
          {
            actorId: newSession.staffId,
            actorName: newSession.staffName,
            actorUsername: newSession.username,
            actorRole: newSession.role,
            sessionId: newSession.sessionId,
            deviceId: newSession.deviceId,
            deviceName: newSession.deviceName,
            platform: newSession.platform,
            page: '/login',
            module: 'AUTH',
            action: 'SESSION_AUTO_KICK_PREVIOUS',
            actionType: 'SECURITY',
            severity: 'warning',
            entityType: 'Session',
            entityId: kickedSessions[0]?.sessionId,
            entityName: newSession.staffName,
            summary: `${newSession.staffName} signed in on ${newSession.deviceName} — auto-logged out ${kickedSessions.length} earlier device(s)`,
            details: { kickedDevices: kickedSessions.map((k) => k.deviceName), newDevice: newSession.deviceName },
          },
          { ip: clientIp, deviceId: newSession.deviceId, deviceName: newSession.deviceName }
        );
        broadcastToClients({
          type: 'FORCE_LOGOUT_DEVICE',
          revokedSessions: newlyRevokedSessions,
          revokedDeviceIds: newlyRevokedDevices,
          activeStaffSessions: serverState.activeStaffSessions,
          timestamp: now,
        });
      }

      broadcastToClients({
        type: 'SERVER_BROADCAST',
        state: serverState,
        senderId: deviceId,
        timestamp: now,
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: true,
          allowed: true,
          session: newSession,
          kickedCount: kickedSessions.length,
          kickedSessions,
          activeStaffSessions: serverState.activeStaffSessions,
          revokedSessions: serverState.revokedSessions,
          revokedDeviceIds: serverState.revokedDeviceIds,
        })
      );
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // POST /api/auth/staff-session/logout (Clean self-logout — removes ONLY this user's session)
  if (url.pathname === '/api/auth/staff-session/logout' && req.method === 'POST') {
    try {
      const payload = await readRequestBody(req);
      const { sessionId, deviceId, staffId } = payload || {};
      const beforeCount = (serverState.activeStaffSessions || []).length;
      serverState.activeStaffSessions = (serverState.activeStaffSessions || []).filter((s) => {
        if (!s) return false;
        if (sessionId && s.sessionId === sessionId) return false;
        if (!sessionId && deviceId && staffId && s.deviceId === deviceId && String(s.staffId) === String(staffId)) {
          return false;
        }
        return true;
      });
      if (serverState.activeStaffSessions.length !== beforeCount) {
        serverState.lastUpdated = Date.now();
        lastStateFingerprint = computeStateFingerprint(serverState);
        persistState();
        broadcastToClients({
          type: 'SERVER_BROADCAST',
          state: serverState,
          senderId: deviceId || 'SERVER',
          timestamp: serverState.lastUpdated,
        });
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, activeStaffSessions: serverState.activeStaffSessions }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // POST /api/auth/staff-session/kick (Admin force-logout of a specific session)
  if (url.pathname === '/api/auth/staff-session/kick' && req.method === 'POST') {
    try {
      const payload = await readRequestBody(req);
      const { sessionId, reason } = payload || {};
      if (!sessionId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'sessionId is required' }));
        return;
      }
      const now = Date.now();
      const target = (serverState.activeStaffSessions || []).find((s) => s && s.sessionId === sessionId);
      if (!serverState.revokedSessions || typeof serverState.revokedSessions !== 'object') {
        serverState.revokedSessions = {};
      }
      if (!serverState.revokedDeviceIds || typeof serverState.revokedDeviceIds !== 'object') {
        serverState.revokedDeviceIds = {};
      }
      const rec = {
        sessionId,
        deviceId: target?.deviceId || '',
        staffId: target?.staffId || '',
        staffName: target?.staffName || 'Staff Member',
        timestamp: now,
        reason: reason || 'Admin ne session terminate kar diya hai',
      };
      serverState.revokedSessions[sessionId] = rec;
      if (target?.deviceId) {
        serverState.revokedDeviceIds[target.deviceId] = rec;
      }
      serverState.activeStaffSessions = (serverState.activeStaffSessions || []).filter(
        (s) => s && s.sessionId !== sessionId
      );
      serverState.lastUpdated = now;
      lastStateFingerprint = computeStateFingerprint(serverState);
      persistState();

      broadcastToClients({
        type: 'FORCE_LOGOUT_DEVICE',
        revokedSessions: { [sessionId]: rec },
        revokedDeviceIds: target?.deviceId ? { [target.deviceId]: rec } : {},
        activeStaffSessions: serverState.activeStaffSessions,
        timestamp: now,
      });
      broadcastToClients({
        type: 'SERVER_BROADCAST',
        state: serverState,
        senderId: 'ADMIN_KICK',
        timestamp: now,
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, activeStaffSessions: serverState.activeStaffSessions }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // POST /api/auth/staff-session/kick-all (Master Admin 1-Click Logout ALL logged-in devices except self)
  if (url.pathname === '/api/auth/staff-session/kick-all' && req.method === 'POST') {
    try {
      const payload = await readRequestBody(req);
      const { exceptSessionId, exceptDeviceId, reason } = payload || {};
      const now = Date.now();
      const reasonText = reason || 'Master Admin نے تمام صارفین کو لاگ آؤٹ کر دیا ہے';

      if (!serverState.revokedSessions || typeof serverState.revokedSessions !== 'object') {
        serverState.revokedSessions = {};
      }
      if (!serverState.revokedDeviceIds || typeof serverState.revokedDeviceIds !== 'object') {
        serverState.revokedDeviceIds = {};
      }

      const newlyRevokedSessions = {};
      const newlyRevokedDevices = {};
      const keptSessions = [];
      let kickedCount = 0;

      for (const s of (serverState.activeStaffSessions || [])) {
        if (!s) continue;
        const isExempt = Boolean(
          (exceptSessionId && s.sessionId === exceptSessionId) ||
          (!exceptSessionId && exceptDeviceId && s.deviceId === exceptDeviceId)
        );
        if (isExempt) {
          keptSessions.push(s);
          continue;
        }
        kickedCount++;
        const rec = {
          sessionId: s.sessionId,
          deviceId: s.deviceId || '',
          staffId: s.staffId || '',
          staffName: s.staffName || 'Staff Member',
          timestamp: now,
          reason: reasonText,
        };
        serverState.revokedSessions[s.sessionId] = rec;
        newlyRevokedSessions[s.sessionId] = rec;
        if (s.deviceId) {
          serverState.revokedDeviceIds[s.deviceId] = rec;
          newlyRevokedDevices[s.deviceId] = rec;
        }
      }

      serverState.activeStaffSessions = keptSessions;
      serverState.forceLogoutAll = {
        timestamp: now,
        exceptSessionId: exceptSessionId || undefined,
        exceptDeviceId: exceptDeviceId || undefined,
        reason: reasonText,
      };
      serverState.lastUpdated = now;
      lastStateFingerprint = computeStateFingerprint(serverState);
      persistState();

      broadcastToClients({
        type: 'FORCE_LOGOUT_DEVICE',
        revokedSessions: newlyRevokedSessions,
        revokedDeviceIds: newlyRevokedDevices,
        activeStaffSessions: serverState.activeStaffSessions,
        forceLogoutAll: serverState.forceLogoutAll,
        timestamp: now,
      });
      broadcastToClients({
        type: 'SERVER_BROADCAST',
        state: serverState,
        senderId: 'ADMIN_KICK_ALL',
        timestamp: now,
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: true,
          kickedCount,
          activeStaffSessions: serverState.activeStaffSessions,
          forceLogoutAll: serverState.forceLogoutAll,
        })
      );
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // GET /api/auth/staff-session/verify (Heartbeat check for exact sessionId validity)
  if (url.pathname === '/api/auth/staff-session/verify' && req.method === 'GET') {
    const qSessionId = (url.searchParams.get('sessionId') || '').trim();
    const qStaffId = (url.searchParams.get('staffId') || '').toLowerCase().trim();
    const qDeviceId = (url.searchParams.get('deviceId') || '').trim();
    const qLoginTime = Number(url.searchParams.get('loginTime') || '0');

    // Global Master Admin "Logout All" check
    const fla = serverState.forceLogoutAll;
    if (fla && fla.timestamp && Date.now() - fla.timestamp < 24 * 60 * 60 * 1000) {
      const isExempt = Boolean(
        (fla.exceptSessionId && qSessionId && fla.exceptSessionId === qSessionId) ||
        (!qSessionId && fla.exceptDeviceId && qDeviceId && fla.exceptDeviceId === qDeviceId)
      );
      if (!isExempt && (!qLoginTime || qLoginTime <= fla.timestamp)) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            valid: false,
            revoked: true,
            reason: fla.reason || 'Master Admin نے تمام صارفین کو لاگ آؤٹ کر دیا ہے',
            timestamp: fla.timestamp,
          })
        );
        return;
      }
    }

    if (!qSessionId) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ valid: true }));
      return;
    }

    const rev = serverState.revokedSessions && serverState.revokedSessions[qSessionId];
    if (rev) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          valid: false,
          revoked: true,
          reason: rev.reason,
          staffName: rev.staffName,
          timestamp: rev.timestamp,
        })
      );
      return;
    }

    const active = serverState.activeStaffSessions || [];
    const mine = active.find((s) => s && s.sessionId === qSessionId);
    if (mine) {
      mine.lastActiveTime = Date.now();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ valid: true }));
      return;
    }

    // If our exact sessionId is not in active list, check if another device replaced this EXACT staffId
    if (qStaffId) {
      const replacement = active.find(
        (s) =>
          s &&
          String(s.staffId || '').toLowerCase().trim() === qStaffId &&
          s.sessionId !== qSessionId &&
          (!qDeviceId || s.deviceId !== qDeviceId)
      );
      if (replacement) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            valid: false,
            revoked: true,
            reason: `Doosri device (${replacement.deviceName || 'New Device'}) par login kiya gaya hai`,
            staffName: replacement.staffName,
            timestamp: replacement.loginTime || Date.now(),
          })
        );
        return;
      }
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ valid: true }));
    return;
  }

  // POST /api/auth/google (Google One-Tap / Social Sign-In)
  if (url.pathname === '/api/auth/google' && req.method === 'POST') {
    try {
      const payload = await readRequestBody(req);
      const { email, name, googleId, photoUrl, deviceInfo } = payload;

      if (!email || !name) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Email and Name are required for Google Sign-In' }));
        return;
      }

      const cleanEmail = email.trim().toLowerCase();
      let user = (serverState.appUsers || []).find(u => (u.email && u.email.toLowerCase() === cleanEmail) || u.googleId === googleId);

      if (!user) {
        user = {
          id: `usr-g-${Date.now()}`,
          name: name.trim(),
          email: cleanEmail,
          googleId: googleId || `gid-${Date.now()}`,
          phone: payload.phone ? payload.phone.trim() : '',
          photoUrl: photoUrl || '',
          address: payload.address ? payload.address.trim() : '',
          deviceInfo: deviceInfo || 'Google Mobile App',
          registeredAt: Date.now(),
          lastLoginAt: Date.now(),
          totalOrders: 0,
          totalSpent: 0,
          status: 'Active',
          authProvider: 'google'
        };

        if (!serverState.appUsers) serverState.appUsers = [];
        serverState.appUsers.unshift(user);

        // CRM Entry
        if (!serverState.customers) serverState.customers = [];
        serverState.customers.unshift({
          id: `crm-g-${Date.now()}`,
          name: user.name,
          phone: user.phone || 'Google User',
          email: user.email,
          address: user.address,
          totalOrders: 0,
          totalSpent: 0,
          firstVisit: Date.now(),
          tags: ['Google Sign-In User']
        });
      } else {
        user.lastLoginAt = Date.now();
        if (photoUrl) user.photoUrl = photoUrl;
        if (deviceInfo) user.deviceInfo = deviceInfo;
      }

      // Audit Log
      const logEntry = {
        id: `log-${Date.now()}`,
        userId: user.id,
        name: user.name,
        phone: user.phone || user.email,
        action: 'GOOGLE_SIGNIN',
        deviceInfo: user.deviceInfo || 'Mobile App',
        timestamp: Date.now(),
        details: `Signed in with Google Account (${user.email})`
      };
      if (!serverState.appUserLogs) serverState.appUserLogs = [];
      serverState.appUserLogs.unshift(logEntry);

      persistState();

      broadcastToClients({
        type: 'APP_USER_LOGIN',
        user: { id: user.id, name: user.name, email: user.email, phone: user.phone, lastLoginAt: user.lastLoginAt },
        log: logEntry,
        timestamp: Date.now()
      });

      const token = `sultan_jwt_g_${user.id}_${Date.now()}`;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          address: user.address,
          photoUrl: user.photoUrl,
          role: 'customer'
        },
        message: `Welcome ${user.name}! Signed in via Google.`
      }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // -------------------------------------------------------------
  // ADMIN DASHBOARD VISIBILITY ENDPOINTS (App Installs, Users & Logs)
  // -------------------------------------------------------------

  // GET /api/admin/app-users
  if (url.pathname === '/api/admin/app-users' && req.method === 'GET') {
    const users = (serverState.appUsers || []).map(u => ({
      id: u.id,
      name: u.name,
      phone: u.phone,
      address: u.address,
      deviceInfo: u.deviceInfo || 'Mobile App',
      registeredAt: u.registeredAt,
      lastLoginAt: u.lastLoginAt,
      totalOrders: u.totalOrders || 0,
      totalSpent: u.totalSpent || 0,
      status: u.status || 'Active'
    }));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      totalUsers: users.length,
      users,
      timestamp: Date.now()
    }));
    return;
  }

  // -------------------------------------------------------------
  // HIGH-THROUGHPUT SYSTEM AUDIT & ACTIVITY LOGS API (100+ logs/sec)
  // -------------------------------------------------------------

  // POST /api/system-logs/batch (Ingest batch of client audit events -> NDJSON + live WS broadcast)
  if (url.pathname === '/api/system-logs/batch' && req.method === 'POST') {
    try {
      const payload = await readRequestBody(req);
      const rawLogs = Array.isArray(payload?.logs) ? payload.logs : (payload && payload.action ? [payload] : []);
      const accepted = appendSystemLogs(rawLogs, {
        ip: clientIp,
        senderId: rawLogs[0]?.deviceId || 'CLIENT_AUDIT',
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, ingested: accepted.length, totalStored: systemLogsMemory.length }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // GET /api/system-logs (Filter, search, paginate & real-time analytics across all roles & modules)
  if (url.pathname === '/api/system-logs' && req.method === 'GET') {
    const result = querySystemLogs({
      q: url.searchParams.get('q') || '',
      role: url.searchParams.get('role') || '',
      actor: url.searchParams.get('actor') || '',
      module: url.searchParams.get('module') || '',
      actionType: url.searchParams.get('actionType') || '',
      severity: url.searchParams.get('severity') || '',
      page: url.searchParams.get('page') || '',
      dateFrom: Number(url.searchParams.get('dateFrom') || 0),
      dateTo: Number(url.searchParams.get('dateTo') || 0),
      limit: Number(url.searchParams.get('limit') || 200),
      offset: Number(url.searchParams.get('offset') || 0),
    });
    const analytics = computeSystemLogAnalytics();
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(
      JSON.stringify({
        success: true,
        total: result.total,
        filteredTotal: result.filteredTotal,
        logs: result.logs,
        analytics,
        timestamp: Date.now(),
      })
    );
    return;
  }

  // GET /api/system-logs/export (Download filtered or full logs as CSV or JSON)
  if (url.pathname === '/api/system-logs/export' && req.method === 'GET') {
    const format = (url.searchParams.get('format') || 'csv').toLowerCase();
    const result = querySystemLogs({
      q: url.searchParams.get('q') || '',
      role: url.searchParams.get('role') || '',
      actor: url.searchParams.get('actor') || '',
      module: url.searchParams.get('module') || '',
      actionType: url.searchParams.get('actionType') || '',
      severity: url.searchParams.get('severity') || '',
      dateFrom: Number(url.searchParams.get('dateFrom') || 0),
      dateTo: Number(url.searchParams.get('dateTo') || 0),
      limit: 50000,
      offset: 0,
    });
    const dateStamp = new Date().toISOString().slice(0, 10);
    if (format === 'json') {
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="sultan-system-logs-${dateStamp}.json"`,
      });
      res.end(JSON.stringify({ exportedAt: new Date().toISOString(), count: result.allMatched.length, logs: result.allMatched }, null, 2));
      return;
    }
    const csvEscape = (v) => {
      const s = v === undefined || v === null ? '' : String(v);
      return `"${s.replace(/"/g, '""')}"`;
    };
    const header = ['Timestamp', 'ID', 'Seq', 'Actor', 'Username', 'Role', 'Module', 'ActionType', 'Action', 'Severity', 'Page', 'Device', 'IP', 'Entity', 'Amount_PKR', 'Summary', 'Details'].join(',');
    const rows = result.allMatched.map((l) =>
      [
        l.isoTime,
        l.id,
        l.seq,
        l.actorName,
        l.actorUsername || '',
        l.actorRole,
        l.module,
        l.actionType,
        l.action,
        l.severity,
        l.page,
        l.deviceName,
        l.ip || '',
        l.entityName || l.entityId || '',
        l.amount !== undefined ? l.amount : '',
        l.summary,
        l.details ? JSON.stringify(l.details) : '',
      ].map(csvEscape).join(',')
    );
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="sultan-system-logs-${dateStamp}.csv"`,
    });
    res.end([header, ...rows].join('\r\n'));
    return;
  }

  // POST /api/system-logs/archive (Safely archive current logs to disk before starting fresh log window)
  if (url.pathname === '/api/system-logs/archive' && req.method === 'POST') {
    try {
      const payload = await readRequestBody(req);
      const actorName = payload?.actorName || 'Master Admin';
      const actorRole = payload?.actorRole || 'Master Admin';
      const archivedCount = systemLogsMemory.length;
      if (pendingDiskLogLines.length > 0) {
        try {
          fs.appendFileSync(SYSTEM_LOGS_FILE, pendingDiskLogLines.splice(0).join('\n') + '\n', 'utf8');
        } catch (_) { }
      }
      let archiveName = '';
      if (fs.existsSync(SYSTEM_LOGS_FILE)) {
        archiveName = `system-logs-archive-${Date.now()}.ndjson`;
        fs.renameSync(SYSTEM_LOGS_FILE, path.join(__dirname, archiveName));
      }
      systemLogsMemory = [];
      seenSystemLogIds.clear();
      appendSystemLogs(
        {
          actorId: payload?.actorId || 'st-master',
          actorName,
          actorRole,
          page: '/admin/system-logs',
          module: 'ROLES_SECURITY',
          action: 'ARCHIVE_SYSTEM_LOGS',
          actionType: 'SECURITY',
          severity: 'warning',
          summary: `${actorName} archived ${archivedCount} previous system log(s)${archiveName ? ` into ${archiveName}` : ''}`,
          details: { archivedCount, archiveName },
        },
        { ip: clientIp }
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, archivedCount, archiveName }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // GET /api/admin/app-logs
  if (url.pathname === '/api/admin/app-logs' && req.method === 'GET') {
    const logs = serverState.appUserLogs || [];
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      count: logs.length,
      logs,
      timestamp: Date.now()
    }));
    return;
  }

  // GET /api/admin/online-orders
  if (url.pathname === '/api/admin/online-orders' && req.method === 'GET') {
    const orders = serverState.onlineOrders || [];
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      count: orders.length,
      orders,
      timestamp: Date.now()
    }));
    return;
  }

  // -------------------------------------------------------------
  // ADMIN MENU MANAGEMENT (Category-wise with Image Upload/URL)
  // -------------------------------------------------------------

  // POST /api/admin/menu-items (Add dish with category & picture)
  if (url.pathname === '/api/admin/menu-items' && req.method === 'POST') {
    try {
      const payload = await readRequestBody(req);
      const { name, price, category, description, imageUrl, imageUri, badge, preparationTimeMinutes, variants } = payload;

      if (!name || price === undefined || !category) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Name, price, and category are required' }));
        return;
      }

      const newItem = {
        id: `m-${Date.now()}`,
        name: name.trim(),
        price: Number(price),
        category: category.trim(),
        description: description ? description.trim() : `${name} prepared freshly at Sultan Restaurant.`,
        imageUri: imageUrl || imageUri || 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800&q=80',
        badge: badge ? badge.trim() : undefined,
        rating: 4.9,
        preparationTimeMinutes: preparationTimeMinutes ? Number(preparationTimeMinutes) : 20,
        isAvailable: true,
        variants: Array.isArray(variants) ? variants : undefined
      };

      if (!serverState.menuItems) serverState.menuItems = [];
      serverState.menuItems.unshift(newItem);

      // Auto-register category if not present
      if (!serverState.categories) serverState.categories = ['All'];
      if (!serverState.categories.includes(newItem.category)) {
        serverState.categories.push(newItem.category);
      }

      persistState();

      // Real-time broadcast to mobile app and web POS!
      broadcastToClients({
        type: 'MENU_ITEM_ADDED',
        item: sanitizeMenuItem(newItem),
        timestamp: Date.now()
      });

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        data: sanitizeMenuItem(newItem),
        message: `Dish "${newItem.name}" added successfully and synced to Mobile App!`
      }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // DELETE /api/admin/menu-items/:id
  if (url.pathname.startsWith('/api/admin/menu-items/') && req.method === 'DELETE') {
    const itemId = url.pathname.split('/').pop();
    if (!serverState.menuItems) serverState.menuItems = [];
    serverState.menuItems = serverState.menuItems.filter(m => m.id !== itemId);
    persistState();

    broadcastToClients({
      type: 'MENU_ITEM_DELETED',
      itemId,
      timestamp: Date.now()
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: 'Item deleted' }));
    return;
  }

  // POST /api/admin/categories
  if (url.pathname === '/api/admin/categories' && req.method === 'POST') {
    try {
      const payload = await readRequestBody(req);
      const { category } = payload;
      if (!category) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Category name is required' }));
        return;
      }

      if (!serverState.categories) serverState.categories = [];
      if (!serverState.categories.includes(category.trim())) {
        serverState.categories.push(category.trim());
      }
      persistState();

      broadcastToClients({
        type: 'CATEGORIES_UPDATED',
        categories: serverState.categories,
        timestamp: Date.now()
      });

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, categories: serverState.categories }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // -------------------------------------------------------------
  // DATABASE BACKUP SNAPSHOTS & 1-CLICK RECOVERY API
  // -------------------------------------------------------------
  if (url.pathname === '/api/admin/backups' && req.method === 'GET') {
    try {
      const list = [];
      const seenNames = new Set();
      for (const bDir of [BACKUP_DIR, VAULT_BACKUP_DIR]) {
        if (!bDir || !fs.existsSync(bDir)) continue;
        const files = fs.readdirSync(bDir).filter((f) => f.endsWith('.json')).sort().reverse();
        for (const f of files) {
          if (seenNames.has(f)) continue;
          try {
            const p = path.join(bDir, f);
            const st = fs.statSync(p);
            const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
            seenNames.add(f);
            list.push({
              filename: f,
              size: st.size,
              mtime: st.mtimeMs,
              lastUpdated: parsed.lastUpdated || st.mtimeMs,
              inventoryCount: Array.isArray(parsed.inventory) ? parsed.inventory.filter((i) => i && !isLegacyDummyInventoryId(i.id)).length : 0,
              rawInventoryCount: countNonAutoBeverageInventory(parsed.inventory),
              categoriesCount: Array.isArray(parsed.inventoryCategories) ? parsed.inventoryCategories.length : 0,
              storageZonesCount: Array.isArray(parsed.storageZones) ? parsed.storageZones.length : 0,
              movementsCount: Array.isArray(parsed.stockMovements) ? parsed.stockMovements.length : 0,
              suppliersCount: Array.isArray(parsed.suppliers) ? parsed.suppliers.length : 0,
              expensesCount: Array.isArray(parsed.expenses) ? parsed.expenses.length : 0,
              invoicesCount: Array.isArray(parsed.invoices) ? parsed.invoices.length : 0,
            });
          } catch (_) { }
        }
      }
      list.sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ success: true, vaultDir: VAULT_DIR, backups: list }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  if (url.pathname === '/api/admin/backups/create' && req.method === 'POST') {
    try {
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `manual-snapshot-${ts}.json`;
      const jsonStr = JSON.stringify(serverState, null, 2);
      if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
      fs.writeFileSync(path.join(BACKUP_DIR, filename), jsonStr);
      try {
        if (!fs.existsSync(VAULT_BACKUP_DIR)) fs.mkdirSync(VAULT_BACKUP_DIR, { recursive: true });
        fs.writeFileSync(path.join(VAULT_BACKUP_DIR, filename), jsonStr);
      } catch (_) { }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, filename, vaultPath: VAULT_BACKUP_DIR }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  if (url.pathname === '/api/admin/backups/export-json' && req.method === 'GET') {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const jsonStr = JSON.stringify(serverState, null, 2);
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="sultan-restaurant-backup-${today}.json"`,
        'Cache-Control': 'no-store',
      });
      res.end(jsonStr);
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  if (url.pathname === '/api/admin/backups/restore' && req.method === 'POST') {
    try {
      const payload = await readRequestBody(req);
      const filename = path.basename(String(payload?.filename || ''));
      const mode = payload?.mode === 'full' ? 'full' : 'merge';
      if (!filename || !filename.endsWith('.json')) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Valid backup filename is required' }));
        return;
      }
      const targetPath = [path.join(BACKUP_DIR, filename), path.join(VAULT_BACKUP_DIR, filename)].find((p) => fs.existsSync(p));
      if (!targetPath) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: `Backup file "${filename}" not found` }));
        return;
      }
      const backupState = JSON.parse(fs.readFileSync(targetPath, 'utf8'));

      // Save safety snapshot before restoring
      if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
      fs.writeFileSync(
        path.join(BACKUP_DIR, `pre-restore-${Date.now()}.json`),
        JSON.stringify(serverState, null, 2)
      );

      if (mode === 'full') {
        serverState = {
          ...INITIAL_STATE,
          ...backupState,
          tickets: serverState.tickets,
          activeStaffSessions: serverState.activeStaffSessions,
          lastUpdated: Date.now(),
        };
      } else {
        // Safe merge: brings back all inventory, zones, movements, suppliers, POs, expenses, assets, recipes without losing newer items or invoices
        const mergeById = (currArr, bakArr) => {
          const map = new Map();
          for (const b of (Array.isArray(bakArr) ? bakArr : [])) {
            if (b && b.id) map.set(b.id, b);
          }
          for (const c of (Array.isArray(currArr) ? currArr : [])) {
            if (c && c.id) {
              const prev = map.get(c.id);
              if (!prev || (Number(c.updatedAt || c.at || 0) >= Number(prev.updatedAt || prev.at || 0))) {
                map.set(c.id, c);
              }
            }
          }
          return Array.from(map.values());
        };
        serverState.inventory = mergeById(
          serverState.inventory,
          (backupState.inventory || []).filter((i) => i && !isLegacyDummyInventoryId(i.id))
        );
        if (Array.isArray(backupState.inventoryCategories) && backupState.inventoryCategories.length > 0) {
          serverState.inventoryCategories = Array.from(
            new Set([...(serverState.inventoryCategories || []), ...backupState.inventoryCategories])
          );
        }
        if (Array.isArray(backupState.assetCategories) && backupState.assetCategories.length > 0) {
          serverState.assetCategories = Array.from(
            new Set([...(serverState.assetCategories || []), ...backupState.assetCategories])
          );
        }
        if (Array.isArray(backupState.expenseCategories) && backupState.expenseCategories.length > 0) {
          serverState.expenseCategories = Array.from(
            new Set([...(serverState.expenseCategories || []), ...backupState.expenseCategories])
          );
        }
        serverState.storageZones = mergeById(serverState.storageZones, backupState.storageZones);
        serverState.stockMovements = mergeById(
          serverState.stockMovements,
          (backupState.stockMovements || []).filter((m) => m && !isLegacyDummyInventoryId(m.itemId))
        )
          .sort((a, b) => (b.at || 0) - (a.at || 0))
          .slice(0, 500);
        serverState.chillerHandovers = mergeById(serverState.chillerHandovers, backupState.chillerHandovers)
          .sort((a, b) => (b.at || 0) - (a.at || 0))
          .slice(0, 150);
        serverState.suppliers = mergeById(serverState.suppliers, backupState.suppliers);
        serverState.purchaseOrders = mergeById(serverState.purchaseOrders, backupState.purchaseOrders);
        serverState.supplierPayments = mergeById(serverState.supplierPayments, backupState.supplierPayments);
        serverState.expenses = mergeById(serverState.expenses, backupState.expenses);
        serverState.assets = mergeById(serverState.assets, backupState.assets);
        serverState.damageRecords = mergeById(serverState.damageRecords, backupState.damageRecords);
        serverState.recipes = mergeById(serverState.recipes, backupState.recipes);
        if ((!serverState.kitchenConsumption || serverState.kitchenConsumption.length === 0) && Array.isArray(backupState.kitchenConsumption)) {
          serverState.kitchenConsumption = backupState.kitchenConsumption;
        }
        if ((!serverState.shifts || serverState.shifts.length === 0) && Array.isArray(backupState.shifts)) {
          serverState.shifts = backupState.shifts;
        }
        serverState.deletedInventoryIds = [];
        serverState.lastUpdated = Date.now();
      }

      lastStateFingerprint = computeStateFingerprint(serverState);
      persistState();
      pushToFirestoreCloud();
      broadcastToClients({
        type: 'SERVER_BROADCAST',
        state: serverState,
        senderId: 'SERVER_RESTORE',
        timestamp: serverState.lastUpdated,
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        inventoryCount: (serverState.inventory || []).length,
        movementsCount: (serverState.stockMovements || []).length,
        suppliersCount: (serverState.suppliers || []).length,
        state: serverState,
      }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  if (url.pathname === '/api/admin/backups/deep-scan-recover' && req.method === 'POST') {
    try {
      const DEFAULT_CAT_SET = new Set(['meat', 'produce', 'grains', 'dairy', 'pantry', 'beverages', 'fuel', 'packaging', 'supplies']);
      const localAppData = process.env.LOCALAPPDATA || '';
      const scanDirs = [];
      const browserRoots = [
        path.join(localAppData, 'Google', 'Chrome', 'User Data'),
        path.join(localAppData, 'Microsoft', 'Edge', 'User Data'),
        path.join(localAppData, 'BraveSoftware', 'Brave-Browser', 'User Data'),
        path.join(process.env.APPDATA || '', 'Opera Software', 'Opera Stable'),
      ];
      for (const root of browserRoots) {
        try {
          if (!root || !fs.existsSync(root)) continue;
          const entries = fs.readdirSync(root, { withFileTypes: true });
          for (const ent of entries) {
            if (ent.isDirectory() && (ent.name === 'Default' || ent.name.startsWith('Profile '))) {
              const ldb = path.join(root, ent.name, 'Local Storage', 'leveldb');
              if (fs.existsSync(ldb)) scanDirs.push({ label: `${path.basename(path.dirname(root))}/${ent.name}`, dir: ldb, type: 'leveldb' });
            }
          }
          const directLdb = path.join(root, 'Local Storage', 'leveldb');
          if (fs.existsSync(directLdb)) scanDirs.push({ label: path.basename(root), dir: directLdb, type: 'leveldb' });
        } catch (_) { }
      }
      const extraBackupDirs = [
        BACKUP_DIR,
        'C:\\SultanRestaurant\\backups',
        'D:\\SultanRestaurant\\backups',
      ];
      for (const bd of extraBackupDirs) {
        if (bd && fs.existsSync(bd)) scanDirs.push({ label: bd, dir: bd, type: 'json' });
      }

      const foundCats = new Set();
      const foundItemsMap = new Map();
      const foundZonesMap = new Map();
      const foundSuppliersMap = new Map();
      let bestSource = '';

      const harvestFromParsedState = (st, srcLabel) => {
        if (!st || typeof st !== 'object') return;
        const inner = st.state && typeof st.state === 'object' ? st.state : st;
        let hit = false;
        if (Array.isArray(inner.inventoryCategories)) {
          for (const c of inner.inventoryCategories) {
            const clean = String(c || '').trim();
            if (clean && !DEFAULT_CAT_SET.has(clean.toLowerCase())) {
              foundCats.add(clean);
              hit = true;
            }
          }
          if (inner.inventoryCategories.length > 9) {
            for (const c of inner.inventoryCategories) {
              const clean = String(c || '').trim();
              if (clean) foundCats.add(clean);
            }
            hit = true;
          }
        }
        if (Array.isArray(inner.inventory)) {
          for (const it of inner.inventory) {
            if (it && it.id && it.name && !isLegacyDummyInventoryId(it.id)) {
              const prev = foundItemsMap.get(it.id);
              if (!prev || (Number(it.updatedAt) || 0) >= (Number(prev.updatedAt) || 0)) {
                foundItemsMap.set(it.id, it);
                if (it.category) foundCats.add(String(it.category).trim());
                hit = true;
              }
            }
          }
        }
        if (Array.isArray(inner.storageZones)) {
          for (const z of inner.storageZones) {
            if (z && z.id && z.name) foundZonesMap.set(z.id, z);
          }
        }
        if (Array.isArray(inner.suppliers)) {
          for (const s of inner.suppliers) {
            if (s && s.id && s.name && !/^sup-\d+$/.test(String(s.id))) foundSuppliersMap.set(s.id, s);
          }
        }
        if (hit && !bestSource) bestSource = srcLabel;
      };

      const extractBalancedJsonArray = (str, startIdx) => {
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
      };

      for (const entry of scanDirs) {
        try {
          const files = fs.readdirSync(entry.dir);
          for (const f of files) {
            if (f === 'LOCK') continue;
            const full = path.join(entry.dir, f);
            if (entry.type === 'json' && f.endsWith('.json')) {
              try {
                const parsed = JSON.parse(fs.readFileSync(full, 'utf8'));
                harvestFromParsedState(parsed, `${entry.label}/${f}`);
              } catch (_) { }
            } else if (entry.type === 'leveldb' && (f.endsWith('.ldb') || f.endsWith('.log'))) {
              try {
                const buf = fs.readFileSync(full);
                // Decode both UTF-8 and UTF-16LE since Chromium LevelDB stores large localStorage values in UTF-16LE or Latin-1!
                const candidatesText = [buf.toString('utf8'), buf.toString('utf16le')];
                for (const txt of candidatesText) {
                  let searchPos = 0;
                  while (true) {
                    const idx = txt.indexOf('"inventoryCategories":[', searchPos);
                    if (idx === -1) break;
                    const arrStart = idx + '"inventoryCategories":'.length;
                    const rawArr = extractBalancedJsonArray(txt, arrStart);
                    if (rawArr) {
                      try {
                        const arr = JSON.parse(rawArr);
                        harvestFromParsedState({ inventoryCategories: arr }, `${entry.label}/${f}`);
                      } catch (_) { }
                    }
                    searchPos = idx + 23;
                  }
                  let invPos = 0;
                  while (true) {
                    const idx = txt.indexOf('"inventory":[', invPos);
                    if (idx === -1) break;
                    const arrStart = idx + '"inventory":'.length;
                    const rawArr = extractBalancedJsonArray(txt, arrStart);
                    if (rawArr) {
                      try {
                        const arr = JSON.parse(rawArr);
                        harvestFromParsedState({ inventory: arr }, `${entry.label}/${f}`);
                      } catch (_) { }
                    }
                    invPos = idx + 13;
                  }
                }
              } catch (_) { }
            }
          }
        } catch (_) { }
      }

      // Snappy-aware LevelDB scanner (covers Sultan EXE profile %LOCALAPPDATA%\SultanRestaurant\SultanAppProfile + Chrome/Edge/Brave)
      try {
        const scannerPath = [
          path.join(__dirname, 'scripts', 'recover-browser-cache.js'),
          path.join(__dirname, '..', 'scripts', 'recover-browser-cache.js'),
        ].find((p) => fs.existsSync(p));
        if (scannerPath) {
          const scanner = require(scannerPath);
          const rec = scanner.buildRecoveredState(scanner.scanAllSnapshots([BACKUP_DIR]));
          harvestFromParsedState(
            {
              inventoryCategories: rec.inventoryCategories,
              inventory: rec.inventory,
              storageZones: rec.storageZones,
              suppliers: rec.suppliers,
            },
            rec.source || 'Sultan EXE / Browser LevelDB'
          );
        }
      } catch (_) { }

      if (foundCats.size === 0 && foundItemsMap.size === 0) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          found: false,
          message: 'No custom categories or non-dummy inventory items were found in browser caches or backup folders on this Server PC.',
        }));
        return;
      }

      const mergedCats = Array.from(new Set([...(serverState.inventoryCategories || []), ...Array.from(foundCats)]));
      const invMap = new Map();
      for (const c of (serverState.inventory || [])) {
        if (c && c.id && !isLegacyDummyInventoryId(c.id)) invMap.set(c.id, c);
      }
      for (const [id, it] of foundItemsMap.entries()) {
        const prev = invMap.get(id);
        if (!prev || (Number(it.updatedAt) || 0) >= (Number(prev.updatedAt) || 0)) {
          invMap.set(id, it);
        }
      }
      serverState.inventoryCategories = mergedCats;
      serverState.inventory = Array.from(invMap.values());
      if (foundZonesMap.size > 0) {
        const zMap = new Map((serverState.storageZones || []).map((z) => [z.id, z]));
        for (const [zid, z] of foundZonesMap.entries()) zMap.set(zid, z);
        serverState.storageZones = Array.from(zMap.values());
      }
      if (foundSuppliersMap.size > 0) {
        const sMap = new Map((serverState.suppliers || []).map((s) => [s.id, s]));
        for (const [sid, s] of foundSuppliersMap.entries()) sMap.set(sid, s);
        serverState.suppliers = Array.from(sMap.values());
      }
      serverState.deletedInventoryIds = [];
      serverState.deletedInventoryCategories = [];
      serverState.lastUpdated = Date.now();

      if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
      fs.writeFileSync(path.join(BACKUP_DIR, `recovered-cache-${Date.now()}.json`), JSON.stringify(serverState, null, 2));

      lastStateFingerprint = computeStateFingerprint(serverState);
      persistState();
      pushToFirestoreCloud(true);
      broadcastToClients({
        type: 'SERVER_BROADCAST',
        state: serverState,
        senderId: 'SERVER_DEEP_RECOVER',
        timestamp: serverState.lastUpdated,
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        found: true,
        source: bestSource || 'Browser LevelDB Cache',
        recoveredCategories: mergedCats.length,
        recoveredItems: serverState.inventory.length,
        state: serverState,
      }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  if (url.pathname === '/api/admin/inventory/clean-reset' && req.method === 'POST') {
    try {
      const payload = await readRequestBody(req);
      const clearCategories = Boolean(payload?.clearCategories);
      if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
      fs.writeFileSync(path.join(BACKUP_DIR, `pre-clean-reset-${Date.now()}.json`), JSON.stringify(serverState, null, 2));

      const epoch = Date.now();
      serverState.inventoryResetEpoch = epoch;
      serverState.inventory = [];
      serverState.stockMovements = [];
      serverState.chillerHandovers = [];
      serverState.deletedInventoryIds = [];
      if (clearCategories) {
        serverState.inventoryCategories = [];
        serverState.deletedInventoryCategories = ['Meat', 'Produce', 'Grains', 'Dairy', 'Pantry', 'Beverages', 'Fuel', 'Packaging', 'Supplies'];
      }
      serverState.lastUpdated = epoch;

      lastStateFingerprint = computeStateFingerprint(serverState);
      persistState();
      pushToFirestoreCloud(true);
      broadcastToClients({
        type: 'SERVER_BROADCAST',
        state: serverState,
        senderId: 'SERVER_CLEAN_RESET',
        timestamp: serverState.lastUpdated,
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        epoch,
        state: serverState,
      }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // -------------------------------------------------------------
  // CENTRAL 10-TABLET & 7-PC AUTO-UPDATER ENDPOINTS
  // -------------------------------------------------------------
  if (
    (url.pathname === '/api/app-update/info' ||
      url.pathname === '/api/desktop-update/info' ||
      url.pathname === '/api/desktop-update/SultanRestaurant.exe' ||
      url.pathname === '/api/tablet-update/Sultan-POS-Tablet.apk' ||
      url.pathname === '/apk' ||
      url.pathname === '/exe' ||
      url.pathname === '/setup') &&
    (req.method === 'GET' || req.method === 'HEAD')
  ) {
    const crypto = require('crypto');

    const findNewestFile = (candidates, minSize = 1000) => {
      let bestPath = null;
      let bestMtime = 0;
      for (const p of candidates) {
        try {
          if (fs.existsSync(p)) {
            const st = fs.statSync(p);
            if (st.size >= minSize && st.mtimeMs >= bestMtime) {
              bestMtime = st.mtimeMs;
              bestPath = p;
            }
          }
        } catch (err) { }
      }
      return bestPath ? { path: bestPath, mtime: Math.floor(bestMtime) } : null;
    };

    const exeInfo = findNewestFile([
      path.join(__dirname, 'Updates', 'SultanRestaurant.exe'),
      path.join(__dirname, 'SultanRestaurant.exe'),
      'C:\\SultanRestaurant\\Updates\\SultanRestaurant.exe',
      'C:\\SultanRestaurant\\SultanRestaurant.exe',
    ], 50000);

    const apkInfo = findNewestFile([
      path.join(__dirname, 'Updates', 'Sultan-POS-Tablet.apk'),
      path.join(__dirname, 'Sultan-POS-Tablet.apk'),
      path.join(__dirname, 'Sultan_POS_Release.apk'),
      'C:\\SultanRestaurant\\Updates\\Sultan-POS-Tablet.apk',
      'C:\\SultanRestaurant\\Sultan-POS-Tablet.apk',
    ], 1000000);

    if (url.pathname === '/api/app-update/info') {
      let webBundleHash = '';
      try {
        const idxPath = path.join(__dirname, 'dist', 'index.html');
        if (fs.existsSync(idxPath)) {
          const idxContent = fs.readFileSync(idxPath, 'utf8');
          const st = fs.statSync(idxPath);
          webBundleHash = crypto.createHash('sha256').update(idxContent + '|' + Math.floor(st.mtimeMs)).digest('hex').slice(0, 24);
        }
      } catch (e) { }

      let exeHash = '';
      if (exeInfo) {
        try {
          const st = fs.statSync(exeInfo.path);
          exeHash = `${st.size}_${Math.floor(st.mtimeMs)}`;
        } catch (e) { }
      }

      let apkHash = '';
      if (apkInfo) {
        try {
          const st = fs.statSync(apkInfo.path);
          const clientApkVer = Number(url.searchParams.get('apkVer') || '0');
          if (clientApkVer < 18) {
            apkHash = `force_upgrade_v18_${Math.floor(Date.now() / 6000)}`;
          } else {
            apkHash = `${st.size}_${Math.floor(st.mtimeMs)}`;
          }
        } catch (e) { }
      }

      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({
        success: true,
        webBundleHash,
        exeHash,
        apkHash,
        apkVersion: 33,
        apkDownloadUrl: '/api/tablet-update/Sultan-POS-Tablet.apk',
      }));
      return;
    }

    if (url.pathname === '/setup') {
      const setupInfo = findNewestFile([
        path.join(__dirname, 'Sultan-Restaurant-Setup.exe'),
        'C:\\Users\\Nizaam Digital Sol\\Desktop\\SultanRestaurant-App\\Sultan-Restaurant-Setup.exe',
        'C:\\Users\\Nizaam Digital Sol\\Desktop\\SultanResturant\\Sultan-Restaurant-Setup.exe',
      ], 1000000);
      if (!setupInfo) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Sultan-Restaurant-Setup.exe not found on server' }));
        return;
      }
      const st = fs.statSync(setupInfo.path);
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': st.size,
        'Content-Disposition': 'attachment; filename="Sultan-Restaurant-Setup.exe"',
        'Cache-Control': 'no-store',
      });
      fs.createReadStream(setupInfo.path).pipe(res);
      return;
    }

    if (url.pathname === '/api/tablet-update/Sultan-POS-Tablet.apk' || url.pathname === '/apk') {
      if (!apkInfo) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Sultan-POS-Tablet.apk not found on server' }));
        return;
      }
      try {
        const st = fs.statSync(apkInfo.path);
        res.writeHead(200, {
          'Content-Type': 'application/vnd.android.package-archive',
          'Content-Length': st.size,
          'Content-Disposition': 'attachment; filename="Sultan-POS-Tablet.apk"',
          'Cache-Control': 'no-store',
        });
        fs.createReadStream(apkInfo.path).pipe(res);
        return;
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
        return;
      }
    }

    if (!exeInfo) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'SultanRestaurant.exe not found on server' }));
      return;
    }

    try {
      const buf = fs.readFileSync(exeInfo.path);
      if (url.pathname === '/api/desktop-update/info') {
        const hash = crypto.createHash('sha256').update(buf).digest('hex').toLowerCase();
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({
          success: true,
          hash,
          size: buf.length,
          mtime: exeInfo.mtime,
        }));
        return;
      } else {
        res.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Length': buf.length,
          'Content-Disposition': 'attachment; filename="SultanRestaurant.exe"',
          'Cache-Control': 'no-store',
        });
        res.end(buf);
        return;
      }
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
      return;
    }
  }

  // -------------------------------------------------------------
  // PUBLIC MENU, DEALS & ORDERING ENDPOINTS
  // -------------------------------------------------------------

  // 2. Safe Public Menu Endpoint: GET /api/public/menu or /api/menu
  if ((url.pathname === '/api/public/menu' || url.pathname === '/api/menu') && req.method === 'GET') {
    const categoryFilter = url.searchParams.get('category');
    let items = (serverState.menuItems || []).map(sanitizeMenuItem);

    if (categoryFilter && categoryFilter.toLowerCase() !== 'all') {
      const catLower = categoryFilter.toLowerCase();
      items = items.filter(item =>
        (item.category || '').toLowerCase().includes(catLower) ||
        (item.name || '').toLowerCase().includes(catLower)
      );
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      data: items,
      count: items.length,
      timestamp: Date.now()
    }));
    return;
  }

  // 3. Safe Public Categories: GET /api/public/categories or /api/categories
  if ((url.pathname === '/api/public/categories' || url.pathname === '/api/categories') && req.method === 'GET') {
    const usedCats = new Set((serverState.menuItems || []).map(m => m.category).filter(Boolean));
    const uniqueCategories = ['All', ...Array.from(usedCats)];

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      data: uniqueCategories,
      timestamp: Date.now()
    }));
    return;
  }

  // 4. Safe Public Deals: GET /api/public/deals
  if (url.pathname === '/api/public/deals' && req.method === 'GET') {
    const deals = (serverState.menuItems || [])
      .filter(item => item.isDeal || (item.category && item.category.toLowerCase() === 'deals'))
      .map(sanitizeMenuItem);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      data: deals,
      timestamp: Date.now()
    }));
    return;
  }

  // 4b. Safe Public Tables & Floors: GET /api/public/tables
  if (url.pathname === '/api/public/tables' && req.method === 'GET') {
    const floorFilter = url.searchParams.get('floor');
    let tables = (serverState.tables || []).map(t => ({
      id: t.id,
      name: t.name,
      floor: t.floor || t.zone || 'Ground Floor',
      zone: t.zone || 'Ground Floor',
      seatingType: t.seatingType || (t.name.toLowerCase().includes('cabin') ? 'majlis' : (t.name.toLowerCase().includes('couch') ? 'couches' : 'tables')),
      cabinNumber: t.cabinNumber,
      seats: t.seats || 4,
      status: t.status || 'available'
    }));

    if (floorFilter && floorFilter !== 'All') {
      tables = tables.filter(t => (t.floor || '').toLowerCase() === floorFilter.toLowerCase());
    }

    const availableFloors = Array.from(new Set(tables.map(t => t.floor).filter(Boolean)));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      floors: availableFloors.length > 0 ? availableFloors : ['Ground Floor', '1st Floor', '2nd Floor', '3rd Floor', 'Rooftop'],
      data: tables,
      timestamp: Date.now()
    }));
    return;
  }

  // 5. Order Placement: POST /api/public/orders or /api/orders
  if ((url.pathname === '/api/public/orders' || url.pathname === '/api/orders') && req.method === 'POST') {
    try {
      const payload = await readRequestBody(req);

      if (!payload.items || !Array.isArray(payload.items) || payload.items.length === 0) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Order must contain at least one valid item' }));
        return;
      }

      // Mandatory User Verification for Order Placement
      const customerName = payload.customerName || payload.customer?.name;
      const customerPhone = payload.customerPhone || payload.customer?.phone;

      if (!customerName || !customerPhone) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Customer Name and Phone Number are required to place an order.' }));
        return;
      }

      const orderType = payload.orderType || (payload.tableInfo || payload.tableId ? 'dine_in' : (payload.takeaway ? 'takeaway' : 'delivery'));

      // Rapid de-duplication guard: if identical order arrived within last 6 seconds, return existing order
      const requestedTableId = payload.tableId || payload.tableInfo?.tableId || (orderType === 'dine_in' ? 'DINE-IN-APP' : undefined);
      const nowTs = Date.now();
      const recentDup = (serverState.onlineOrders || []).find(o =>
        o.customer?.phone === customerPhone &&
        (!requestedTableId || o.tableId === requestedTableId) &&
        (nowTs - (o.createdAt || 0)) < 6000
      );
      if (recentDup) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          data: recentDup,
          order: recentDup,
          ticket: (serverState.tickets || []).find(t => t.orderId === recentDup.id) || null,
          pendingConfirmation: recentDup.orderType === 'dine_in',
          message: 'Order already registered.'
        }));
        return;
      }

      // Authoritative server-side price calculation
      const dbItems = serverState.menuItems || [];
      let calculatedSubtotal = 0;
      const verifiedItems = [];

      for (const cartItem of payload.items) {
        const menuItemId = cartItem.menuItem ? cartItem.menuItem.id : cartItem.id;
        const qty = Math.max(1, parseInt(cartItem.quantity || cartItem.qty || 1, 10));

        const dbItem = dbItems.find(m => m.id === menuItemId);
        let unitPrice = dbItem ? Number(dbItem.price) : (Number(cartItem.price) || 0);

        if (cartItem.selectedVariant && dbItem && Array.isArray(dbItem.variants)) {
          const v = dbItem.variants.find(vr => vr.name === cartItem.selectedVariant);
          if (v) unitPrice = Number(v.price);
        }

        calculatedSubtotal += unitPrice * qty;
        const itemName = dbItem ? dbItem.name : (cartItem.menuItem?.name || cartItem.name || 'Food Item');
        const itemImage = dbItem?.imageUrl || cartItem.menuItem?.imageUrl || 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800&q=80';
        const itemStation = dbItem?.station || (['Drinks', 'Beverages', 'Desserts', 'Juices', 'Beverages & Desserts'].includes(dbItem?.category) ? 'juice' : 'main');

        verifiedItems.push({
          id: menuItemId,
          name: itemName,
          unitPrice,
          price: unitPrice,
          qty,
          quantity: qty,
          totalPrice: unitPrice * qty,
          selectedVariant: cartItem.selectedVariant || undefined,
          station: itemStation,
          notes: cartItem.specialInstructions || cartItem.notes || undefined,
          menuItem: {
            id: menuItemId,
            name: itemName,
            price: unitPrice,
            description: dbItem?.description || '',
            category: dbItem?.category || 'Mains',
            imageUrl: itemImage,
            isAvailable: true,
            station: itemStation,
          }
        });
      }

      // Recipe BOM auto-deduction from inventory if configured
      if (Array.isArray(serverState.recipes) && Array.isArray(serverState.inventory) && serverState.recipes.length > 0) {
        for (const it of verifiedItems) {
          const recipe = serverState.recipes.find(r => r.menuItemId === it.id);
          if (recipe && Array.isArray(recipe.ingredients)) {
            const portions = Number(recipe.yieldPortions) || 1;
            for (const ing of recipe.ingredients) {
              const invItem = serverState.inventory.find(inv => inv.id === ing.inventoryItemId);
              if (invItem) {
                const deductQty = (ing.qty / portions) * it.qty;
                invItem.currentStock = Math.max(0, (invItem.currentStock || 0) - deductQty);
                invItem.updatedAt = Date.now();
              }
            }
          }
        }
      }

      // For Dine-In or Express Takeaway, delivery fee is 0
      const deliveryFee = (orderType === 'dine_in' || orderType === 'takeaway') ? 0 : (calculatedSubtotal >= 2500 ? 0 : 150);
      const tax = Math.round(calculatedSubtotal * 0.05); // 5% GST
      const grandTotal = calculatedSubtotal + deliveryFee + tax;

      const orderId = `ORD-${Date.now().toString().slice(-6)}`;
      const orderNumber = `SLT-${Math.floor(1000 + Math.random() * 9000)}`;
      const roundNum = payload.roundNumber ? parseInt(payload.roundNumber, 10) : 1;
      const isAddOn = roundNum > 1 || payload.isAddOn || false;

      // Table details if Dine-in
      const tableInfo = payload.tableInfo || {};
      const targetTableId = payload.tableId || tableInfo.tableId || (orderType === 'dine_in' ? 'DINE-IN-APP' : (orderType === 'takeaway' ? 'EXPRESS-TAKEAWAY' : 'DELIVERY'));
      const targetTableName = payload.tableName || tableInfo.tableName || (
        orderType === 'dine_in'
          ? `${tableInfo.floor || 'Floor'} • ${tableInfo.seatingType || 'Table'} ${tableInfo.tableName || tableInfo.tableNumber || ''}`
          : (orderType === 'takeaway' ? `Express Takeaway: ${customerName}` : `Delivery: ${customerName}`)
      );

      // Determine floor and matching table
      let foundTable = null;
      if (targetTableId && targetTableId !== 'DINE-IN-APP') {
        foundTable = (serverState.tables || []).find(t => t.id === targetTableId || t.name.toLowerCase() === targetTableName.toLowerCase());
      }
      const orderFloor = tableInfo.floor || foundTable?.floor || foundTable?.zone || 'Ground Floor';

      const newOrder = {
        id: orderId,
        orderNumber,
        source: 'mobile_app',
        orderType: orderType, // 'dine_in' | 'takeaway' | 'delivery'
        floor: orderFloor,
        seatingType: tableInfo.seatingType || foundTable?.seatingType || undefined,
        tableId: targetTableId,
        tableName: targetTableName,
        cabinNumber: tableInfo.cabinNumber || foundTable?.cabinNumber || undefined,
        roundNumber: roundNum,
        isAddOn,
        customer: {
          id: payload.customerId || undefined,
          name: customerName,
          phone: customerPhone,
          address: payload.deliveryAddress ? `${payload.deliveryAddress.addressLine}, ${payload.deliveryAddress.area}` : (orderType === 'dine_in' ? `In-Restaurant: ${targetTableName}` : (orderType === 'takeaway' ? 'Sultan Express Takeaway Counter' : 'Lahore, Pakistan'))
        },
        items: verifiedItems,
        subtotal: calculatedSubtotal,
        deliveryFee,
        tax,
        total: grandTotal,
        paymentMethod: payload.paymentMethod || (orderType === 'dine_in' || orderType === 'takeaway' ? 'pay_at_counter' : 'cash_on_delivery'),
        isPaid: payload.paymentMethod === 'card' || payload.paymentMethod === 'easypaisa' || payload.paymentMethod === 'jazzcash',
        status: orderType === 'dine_in' ? 'PENDING' : 'CONFIRMED',
        createdAt: Date.now(),
        estimatedDeliveryMinutes: orderType === 'dine_in' ? 20 : (orderType === 'takeaway' ? 15 : 35)
      };

      // Persist to central state
      if (!serverState.onlineOrders) serverState.onlineOrders = [];
      serverState.onlineOrders.unshift(newOrder);

      // Dine-in orders require Floor Manager confirmation with continuous repeating notification
      if (orderType === 'dine_in') {
        const floorAlert = {
          id: `alert-${Date.now()}`,
          orderId: newOrder.id,
          orderNumber: newOrder.orderNumber,
          floor: orderFloor,
          tableId: targetTableId,
          tableName: targetTableName,
          customerName,
          customerPhone,
          total: grandTotal,
          itemsCount: verifiedItems.length,
          itemsSummary: verifiedItems.map(i => `${i.qty}x ${i.name}`).join(', '),
          time: Date.now()
        };
        serverState.pendingFloorOrderAlert = floorAlert;
      } else {
        // Takeaway / Delivery generates KOT immediately
        const kotTicket = {
          id: `KOT-${Math.floor(1000 + Math.random() * 9000)}`,
          orderId: newOrder.id,
          orderNumber: newOrder.orderNumber,
          tableId: targetTableId,
          tableName: targetTableName,
          server: orderType === 'takeaway' ? 'Mobile Express Takeaway' : 'Mobile App Delivery',
          timePlaced: Date.now(),
          status: 'cooking',
          roundNumber: roundNum,
          isAddOn,
          items: verifiedItems.map(it => ({
            id: it.id,
            name: it.name,
            price: it.unitPrice,
            qty: it.qty,
            notes: it.notes,
            station: it.station || 'main',
            completed: false
          }))
        };
        if (printerHelper && typeof printerHelper.normalizeTicketStations === 'function') {
          printerHelper.normalizeTicketStations(kotTicket, serverState.menuItems || [], isAutoRouteBeveragesEnabled());
        }
        if (!serverState.tickets) serverState.tickets = [];
        serverState.tickets.unshift(kotTicket);
        if (kotTicket) queueAutoPrintTicket(kotTicket, 'auto');
      }

      // Update customer total orders & spent in appUsers and customers
      if (serverState.appUsers) {
        const u = serverState.appUsers.find(au => au.phone.replace(/\D/g, '') === customerPhone.replace(/\D/g, ''));
        if (u) {
          u.totalOrders = (u.totalOrders || 0) + 1;
          u.totalSpent = (u.totalSpent || 0) + grandTotal;
        }
      }

      // Log Order Placed event
      if (!serverState.appUserLogs) serverState.appUserLogs = [];
      serverState.appUserLogs.unshift({
        id: `log-${Date.now()}`,
        name: customerName,
        phone: customerPhone,
        action: 'ORDER_PLACED',
        deviceInfo: 'Mobile App',
        timestamp: Date.now(),
        details: `Placed order #${newOrder.orderNumber} (Rs. ${grandTotal.toLocaleString()})`
      });
      appendSystemLogs(
        {
          actorId: newOrder.customer?.id || customerPhone || 'customer',
          actorName: customerName || 'Customer',
          actorRole: orderType === 'delivery' ? 'Delivery' : 'Customer',
          page: orderType === 'dine_in' ? '/menu' : '/api/public/orders',
          module: 'ONLINE_DELIVERY',
          action: 'PUBLIC_ORDER_PLACED',
          actionType: 'PLACE',
          severity: 'success',
          entityType: 'OnlineOrder',
          entityId: newOrder.id,
          entityName: newOrder.orderNumber,
          amount: Number(grandTotal || 0),
          summary: `${customerName || 'Guest'} placed ${orderType.toUpperCase()} order #${newOrder.orderNumber} (${(newOrder.items || []).length} items, Rs. ${Number(grandTotal || 0).toLocaleString()})`,
          details: { orderNumber: newOrder.orderNumber, orderType, tableName: newOrder.tableName, customerPhone, itemsCount: (newOrder.items || []).length, total: grandTotal },
        },
        { ip: clientIp }
      );

      persistState();

      // Broadcast Real-Time Alert to Web POS, Waiter & Kitchen Screens!
      broadcastToClients({
        type: 'SERVER_BROADCAST',
        state: serverState,
        senderId: 'APP_ORDER',
        timestamp: Date.now()
      });

      let activeTicket = typeof kotTicket !== 'undefined' ? kotTicket : null;

      broadcastToClients({
        type: orderType === 'dine_in' ? 'PENDING_FLOOR_ORDER_ALERT' : 'NEW_ORDER_ALERT',
        alert: serverState.pendingFloorOrderAlert,
        order: newOrder,
        ticket: activeTicket,
        soundAlert: true,
        timestamp: Date.now()
      });

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        data: newOrder,
        order: newOrder,
        ticket: activeTicket,
        pendingConfirmation: orderType === 'dine_in',
        message: orderType === 'dine_in'
          ? 'Order submitted and sent to Floor Manager for confirmation.'
          : 'Order created and dispatched to Sultan Kitchen successfully!'
      }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: `Invalid order data: ${err.message}` }));
    }
    return;
  }

  // 6a. Safe Public & Admin Orders List: GET /api/public/orders or /api/admin/online-orders
  if ((url.pathname === '/api/public/orders' || url.pathname === '/api/admin/online-orders' || url.pathname === '/api/orders') && req.method === 'GET') {
    const customerId = url.searchParams.get('customerId');
    const phone = url.searchParams.get('phone');

    // Auto-reconcile orders with live ticket progress
    const tickets = serverState.tickets || [];
    for (const ord of (serverState.onlineOrders || [])) {
      const tk = tickets.find(t => (t.orderId && t.orderId === ord.id) || (t.orderNumber && t.orderNumber === ord.orderNumber));
      if (!tk) continue;
      const isCooking = tk.status === 'cooking' ||
        (tk.stationStatuses && (tk.stationStatuses.main === 'cooking' || tk.stationStatuses.juice === 'cooking'));
      const isReady = tk.status === 'ready' ||
        (tk.stationStatuses && tk.stationStatuses.main === 'ready' && tk.stationStatuses.juice === 'ready');
      const isServed = tk.status === 'served' ||
        (tk.stationStatuses && tk.stationStatuses.main === 'served' && tk.stationStatuses.juice === 'served');

      if (isServed && ord.status !== 'SERVED' && ord.status !== 'DELIVERED') {
        ord.status = 'SERVED';
      } else if (isReady && ord.status !== 'READY' && ord.status !== 'SERVED' && ord.status !== 'DELIVERED') {
        ord.status = 'READY';
      } else if (isCooking && ord.status === 'CONFIRMED') {
        ord.status = 'PREPARING';
      }
    }

    let orders = serverState.onlineOrders || [];

    if (phone) {
      const cleanPhone = phone.replace(/\D/g, '');
      orders = orders.filter(o => o.customer?.phone?.replace(/\D/g, '').includes(cleanPhone));
    } else if (customerId) {
      orders = orders.filter(o => o.customer?.id === customerId);
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      data: orders,
      orders: orders,
      count: orders.length,
      timestamp: Date.now()
    }));
    return;
  }

  // 6b. Track Single Order: GET /api/public/orders/:id or /api/orders/:id
  if ((url.pathname.startsWith('/api/public/orders/') || url.pathname.startsWith('/api/orders/')) && req.method === 'GET') {
    const parts = url.pathname.split('/');
    const orderId = parts[parts.length - 1];
    const order = (serverState.onlineOrders || []).find(o => o.id === orderId || o.orderNumber === orderId);

    if (!order) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Order not found' }));
      return;
    }

    // Auto-reconcile single order with live ticket progress
    const matchingTicket = (serverState.tickets || []).find(tk =>
      (tk.orderId && tk.orderId === order.id) ||
      (tk.orderNumber && tk.orderNumber === order.orderNumber)
    );
    if (matchingTicket) {
      const isCooking = matchingTicket.status === 'cooking' ||
        (matchingTicket.stationStatuses && (matchingTicket.stationStatuses.main === 'cooking' || matchingTicket.stationStatuses.juice === 'cooking'));
      const isReady = matchingTicket.status === 'ready' ||
        (matchingTicket.stationStatuses && matchingTicket.stationStatuses.main === 'ready' && matchingTicket.stationStatuses.juice === 'ready');
      const isServed = matchingTicket.status === 'served' ||
        (matchingTicket.stationStatuses && matchingTicket.stationStatuses.main === 'served' && matchingTicket.stationStatuses.juice === 'served');

      if (isServed && order.status !== 'SERVED' && order.status !== 'DELIVERED') {
        order.status = 'SERVED';
      } else if (isReady && order.status !== 'READY' && order.status !== 'SERVED' && order.status !== 'DELIVERED') {
        order.status = 'READY';
      } else if (isCooking && order.status === 'CONFIRMED') {
        order.status = 'PREPARING';
      }
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, data: order, order: order }));
    return;
  }

  // 7. Rider / Kitchen Status Progression: PATCH /api/public/orders/:id/status
  if (url.pathname.startsWith('/api/public/orders/') && url.pathname.endsWith('/status') && req.method === 'PATCH') {
    const parts = url.pathname.split('/');
    const orderId = parts[parts.length - 2];

    try {
      const payload = await readRequestBody(req);
      const { status, riderName, riderPhone, assignedWaiter, managerNotes } = payload;
      const validStatuses = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'SERVED', 'CANCELLED'];

      if (!validStatuses.includes(status)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` }));
        return;
      }

      const order = (serverState.onlineOrders || []).find(o => o.id === orderId || o.orderNumber === orderId);
      if (!order) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Order not found' }));
        return;
      }

      order.status = status;
      if (riderName) order.riderName = riderName;
      if (riderPhone) order.riderPhone = riderPhone;
      if (assignedWaiter) order.assignedWaiter = assignedWaiter;
      if (managerNotes) order.managerNotes = managerNotes;
      order.updatedAt = Date.now();

      // Clear pending floor alert if this order was confirmed or cancelled
      if (serverState.pendingFloorOrderAlert &&
        (serverState.pendingFloorOrderAlert.orderId === order.id || serverState.pendingFloorOrderAlert.orderNumber === order.orderNumber)) {
        serverState.pendingFloorOrderAlert = null;
      }

      let ticket = (serverState.tickets || []).find(t => t.orderId === order.id || (order.orderNumber && t.orderNumber === order.orderNumber));
      if (status === 'CONFIRMED') {
        if (!ticket) {
          ticket = {
            id: `KOT-${(order.orderNumber || order.id).replace(/\D/g, '') || Math.floor(1000 + Math.random() * 9000)}`,
            orderId: order.id,
            orderNumber: order.orderNumber,
            tableId: order.tableId || 'DINE-IN-APP',
            tableName: order.tableName || 'Dine-In',
            server: assignedWaiter || order.assignedWaiter || 'Floor Manager Confirmed',
            timePlaced: Date.now(),
            status: 'pending',
            roundNumber: order.roundNumber || 1,
            isAddOn: order.isAddOn || false,
            stationStatuses: { main: 'pending', juice: 'pending' },
            items: (order.items || []).map(it => ({
              id: it.id,
              name: it.name,
              price: it.unitPrice || it.price,
              qty: it.qty || it.quantity,
              notes: it.notes,
              station: it.station || 'main',
              itemStatus: 'pending',
              completed: false
            }))
          };
          if (printerHelper && typeof printerHelper.normalizeTicketStations === 'function') {
            printerHelper.normalizeTicketStations(ticket, serverState.menuItems || [], isAutoRouteBeveragesEnabled());
          }
          if (!serverState.tickets) serverState.tickets = [];
          serverState.tickets.unshift(ticket);
          if (ticket) queueAutoPrintTicket(ticket, 'auto');
        } else {
          if (assignedWaiter) ticket.server = assignedWaiter;
        }

        // Occupy table
        if (order.tableId && order.tableId !== 'DINE-IN-APP') {
          const foundTable = (serverState.tables || []).find(t => t.id === order.tableId || t.name.toLowerCase() === (order.tableName || '').toLowerCase());
          if (foundTable) {
            foundTable.status = 'occupied';
            if (assignedWaiter || order.assignedWaiter) foundTable.server = assignedWaiter || order.assignedWaiter;
            if (!foundTable.orders) foundTable.orders = [];
            const alreadyHasOrder = foundTable.orders.some(o => o.orderId === order.id);
            if (!alreadyHasOrder) {
              foundTable.billTotal = (foundTable.billTotal || 0) + (order.total || 0);
              foundTable.orders.push(...(order.items || []).map(it => ({
                id: it.id,
                orderId: order.id,
                name: it.name,
                price: it.unitPrice || it.price,
                qty: it.qty || it.quantity,
                completed: false
              })));
            }
          }
        }
      } else if (ticket) {
        if (status === 'PREPARING') {
          ticket.status = 'cooking';
          if (!ticket.stationStatuses) ticket.stationStatuses = { main: 'cooking', juice: 'cooking' };
          else {
            if (ticket.stationStatuses.main) ticket.stationStatuses.main = 'cooking';
            if (ticket.stationStatuses.juice) ticket.stationStatuses.juice = 'cooking';
          }
        } else if (status === 'READY' || status === 'READY_FOR_PICKUP') {
          ticket.status = 'ready';
          if (!ticket.stationStatuses) ticket.stationStatuses = { main: 'ready', juice: 'ready' };
          else {
            if (ticket.stationStatuses.main) ticket.stationStatuses.main = 'ready';
            if (ticket.stationStatuses.juice) ticket.stationStatuses.juice = 'ready';
          }
          if (Array.isArray(ticket.items)) {
            ticket.items = ticket.items.map(it => ({ ...it, completed: true, itemStatus: 'ready' }));
          }
        } else if (status === 'DELIVERED' || status === 'SERVED') {
          ticket.status = 'served';
          if (!ticket.stationStatuses) ticket.stationStatuses = { main: 'served', juice: 'served' };
          else {
            if (ticket.stationStatuses.main) ticket.stationStatuses.main = 'served';
            if (ticket.stationStatuses.juice) ticket.stationStatuses.juice = 'served';
          }
          if (Array.isArray(ticket.items)) {
            ticket.items = ticket.items.map(it => ({ ...it, completed: true, itemStatus: 'served' }));
          }
        }
      }

      persistState();
      appendSystemLogs(
        {
          actorId: riderName || assignedWaiter || 'staff',
          actorName: riderName || assignedWaiter || 'Order / Delivery Operator',
          actorRole: riderName || status === 'OUT_FOR_DELIVERY' || status === 'DELIVERED' ? 'Delivery' : 'Manager',
          page: '/admin/app-orders',
          module: 'ONLINE_DELIVERY',
          action: `ONLINE_ORDER_${status}`,
          actionType: status === 'CANCELLED' ? 'CANCEL' : 'STATUS_CHANGE',
          severity: status === 'CANCELLED' ? 'critical' : (status === 'DELIVERED' || status === 'SERVED' ? 'success' : 'info'),
          entityType: 'OnlineOrder',
          entityId: order.id,
          entityName: order.orderNumber,
          amount: Number(order.total || 0),
          summary: `Order #${order.orderNumber} (${order.orderType}) marked ${status}${riderName ? ` • Rider: ${riderName}` : ''}${assignedWaiter ? ` • Server: ${assignedWaiter}` : ''}${managerNotes ? ` (${managerNotes})` : ''}`,
          details: { orderId: order.id, orderNumber: order.orderNumber, status, riderName, riderPhone, assignedWaiter, managerNotes },
        },
        { ip: clientIp }
      );

      broadcastToClients({
        type: 'ORDER_STATUS_CHANGED',
        orderId: order.id,
        orderNumber: order.orderNumber,
        status,
        riderName: order.riderName,
        riderPhone: order.riderPhone,
        assignedWaiter: order.assignedWaiter,
        timestamp: Date.now()
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: order, message: `Status updated to ${status}` }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // 7b. Service Requests: GET, POST & PATCH /api/public/service-requests
  if (url.pathname === '/api/public/service-requests' && req.method === 'GET') {
    const tableId = url.searchParams.get('tableId');
    let reqs = serverState.serviceRequests || [];
    if (tableId) {
      reqs = reqs.filter(r => r.tableId === tableId);
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, data: reqs }));
    return;
  }

  if (url.pathname === '/api/public/service-requests' && req.method === 'POST') {
    try {
      const payload = await readRequestBody(req);
      const { tableId, tableName, zone, type, note, source } = payload;
      if (!tableId || !type) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'tableId and type are required' }));
        return;
      }

      const newReq = {
        id: `sr-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        tableId,
        tableName: tableName || `Table ${tableId}`,
        zone: zone || 'Dining Hall',
        type, // 'call_waiter' | 'bill' | 'water' | 'cleaning' | 'complaint'
        note: note || '',
        status: 'pending',
        source: source || 'guest',
        createdAt: Date.now()
      };

      if (!serverState.serviceRequests) serverState.serviceRequests = [];
      serverState.serviceRequests.unshift(newReq);
      persistState();

      // Real-time Audio/Visual Alert to Waiter & Manager screens
      broadcastToClients({
        type: 'SERVICE_REQUEST_ALERT',
        request: newReq,
        soundAlert: true,
        timestamp: Date.now()
      });

      broadcastToClients({
        type: 'SERVER_BROADCAST',
        state: serverState,
        senderId: 'GUEST_SERVICE_REQUEST',
        timestamp: Date.now()
      });

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: newReq, message: 'Service request dispatched to floor staff' }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  if (url.pathname.startsWith('/api/public/service-requests/') && req.method === 'PATCH') {
    const parts = url.pathname.split('/');
    const reqId = parts[parts.length - 1];
    try {
      const payload = await readRequestBody(req);
      const targetReq = (serverState.serviceRequests || []).find(r => r.id === reqId);
      if (!targetReq) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Service request not found' }));
        return;
      }
      if (payload.status) targetReq.status = payload.status;
      if (payload.acknowledgedBy) {
        targetReq.acknowledgedBy = payload.acknowledgedBy;
        targetReq.acknowledgedAt = Date.now();
      }
      if (payload.status === 'resolved') targetReq.resolvedAt = Date.now();

      persistState();
      broadcastToClients({
        type: 'SERVER_BROADCAST',
        state: serverState,
        senderId: 'SERVICE_REQUEST_RESOLVED',
        timestamp: Date.now()
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: targetReq }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // 7c. Table Reservations: GET & POST /api/public/reservations
  if (url.pathname === '/api/public/reservations' && req.method === 'GET') {
    const phone = url.searchParams.get('phone');
    let resList = serverState.reservations || [];
    if (phone) {
      const cleanPhone = phone.replace(/\D/g, '');
      resList = resList.filter(r => (r.phone || '').replace(/\D/g, '') === cleanPhone);
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, data: resList }));
    return;
  }

  if (url.pathname === '/api/public/reservations' && req.method === 'POST') {
    try {
      const payload = await readRequestBody(req);
      const { customerName, phone, guestsCount, reservationDate, timeSlot, tableId, tableName, floor, seatingCategory, notes, preOrderItems, preOrderTotal } = payload;
      if (!customerName || !phone || !reservationDate || !timeSlot) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Customer name, phone, date, and time slot are required' }));
        return;
      }

      // Pick or find a table if not specified
      let assignedTableId = tableId;
      let assignedTableName = tableName;
      if (!assignedTableId) {
        const availableTable = (serverState.tables || []).find(t =>
          t.status === 'available' &&
          (!floor || t.floor === floor) &&
          (!seatingCategory || t.seatingType === seatingCategory)
        );
        if (availableTable) {
          assignedTableId = availableTable.id;
          assignedTableName = availableTable.name;
        } else {
          assignedTableId = 'RES-AUTO';
          assignedTableName = `Reserved (${guestsCount} guests)`;
        }
      }

      const newReservation = {
        id: `res-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        tableId: assignedTableId,
        tableName: assignedTableName,
        customerName,
        phone,
        guestsCount: Number(guestsCount) || 2,
        reservationDate,
        timeSlot,
        floor: floor || 'Ground Floor',
        seatingCategory: seatingCategory || 'tables',
        status: 'confirmed',
        notes: notes || '',
        preOrderItems: Array.isArray(preOrderItems) ? preOrderItems : [],
        preOrderTotal: Number(preOrderTotal) || 0,
        createdAt: Date.now()
      };

      if (!serverState.reservations) serverState.reservations = [];
      serverState.reservations.unshift(newReservation);

      // Lock table on SRE blueprint as 'reserved' (Purple)
      if (assignedTableId && assignedTableId !== 'RES-AUTO') {
        const tbl = (serverState.tables || []).find(t => t.id === assignedTableId);
        if (tbl) {
          tbl.status = 'reserved';
          tbl.reservationId = newReservation.id;
          tbl.server = `${customerName} (Reserved)`;
        }
      }

      persistState();

      broadcastToClients({
        type: 'RESERVATION_CONFIRMED',
        reservation: newReservation,
        timestamp: Date.now()
      });

      broadcastToClients({
        type: 'SERVER_BROADCAST',
        state: serverState,
        senderId: 'TABLE_RESERVATION',
        timestamp: Date.now()
      });

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: newReservation, message: 'Table reserved successfully' }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // 7d. Playland Rides: GET /api/public/playland/rides
  if (url.pathname === '/api/public/playland/rides' && req.method === 'GET') {
    const rides = (serverState.playlandRides && serverState.playlandRides.length > 0) ? serverState.playlandRides : DEFAULT_PLAYLAND_RIDES;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, data: rides }));
    return;
  }

  // 7e. Playland Tickets: GET & POST /api/public/playland/tickets
  if (url.pathname === '/api/public/playland/tickets' && req.method === 'GET') {
    const phone = url.searchParams.get('phone');
    let tickets = serverState.playlandTickets || [];
    if (phone) {
      const cleanPhone = phone.replace(/\D/g, '');
      tickets = tickets.filter(t => (t.parentPhone || '').replace(/\D/g, '') === cleanPhone);
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, data: tickets }));
    return;
  }

  if (url.pathname === '/api/public/playland/tickets' && req.method === 'POST') {
    try {
      const payload = await readRequestBody(req);
      const { childName, parentName, parentPhone, childAge, items, totalAmount, paymentMethod, wristbandColor, notes } = payload;
      if (!items || !Array.isArray(items) || items.length === 0) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'At least one ride item is required' }));
        return;
      }
      if (!parentPhone) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Parent phone number is required' }));
        return;
      }

      const ticketCode = `PL-${Math.floor(100000 + Math.random() * 900000)}`;
      const newTicket = {
        id: `pltk-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        ticketCode,
        childName: childName || 'Guest Child',
        parentName: parentName || 'Guest Parent',
        parentPhone,
        childAge: childAge || undefined,
        wristbandColor: wristbandColor || '#D5A943',
        notes: notes || undefined,
        items,
        totalAmount: Number(totalAmount) || items.reduce((acc, it) => acc + (it.price * (it.qty || 1)), 0),
        paymentMethod: paymentMethod || 'online',
        issuedAt: Date.now(),
        issuedBy: 'Customer Mobile App',
        status: 'active',
        redeemedRidesCount: 0
      };

      if (!serverState.playlandTickets) serverState.playlandTickets = [];
      serverState.playlandTickets.unshift(newTicket);
      persistState();

      broadcastToClients({
        type: 'NEW_PLAYLAND_TICKET',
        ticket: newTicket,
        timestamp: Date.now()
      });

      broadcastToClients({
        type: 'SERVER_BROADCAST',
        state: serverState,
        senderId: 'APP_PLAYLAND_TICKET',
        timestamp: Date.now()
      });

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: newTicket, message: 'Playland digital ticket issued' }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // 8. Legacy / Central Web POS Sync: GET & POST /api/sync
  if (url.pathname === '/api/pos/clear-all' && req.method === 'POST') {
    const now = Date.now();
    const removedIds = (serverState.tickets || []).map(t => t && t.id).filter(Boolean);
    serverState.deletedTicketIds = Array.from(
      new Set([...(serverState.deletedTicketIds || []), 'KOT-1042', ...removedIds])
    ).slice(-500);
    serverState.tickets = [];
    serverState.tables = (serverState.tables || []).map(t =>
      t.status === 'occupied' || t.status === 'billed'
        ? {
          ...t,
          status: 'available',
          billTotal: 0,
          orders: [],
          server: undefined,
          isPaid: false,
          lastInvoiceId: undefined,
          occupiedSince: undefined,
          lastSettledAt: now,
          mergedInto: undefined,
          reservationId: undefined,
        }
        : t
    );
    serverState.lastBillPaidAlert = null;
    serverState.lastFoodReadyAlert = null;
    serverState.lastUpdated = now;
    lastStateFingerprint = computeStateFingerprint(serverState);
    persistState();
    appendSystemLogs(
      {
        actorId: 'admin',
        actorName: 'POS Clear All',
        actorRole: 'Admin',
        page: '/admin/pos',
        module: 'POS_ORDERS',
        action: 'POS_CLEAR_ALL_TABLES_TICKETS',
        actionType: 'DELETE',
        severity: 'critical',
        entityType: 'POS',
        summary: `CRITICAL: Cleared ALL active POS tickets (${removedIds.length}) and reset occupied tables`,
        details: { clearedTicketCount: removedIds.length },
      },
      { ip: clientIp }
    );
    broadcastToClients({
      type: 'SERVER_BROADCAST',
      state: serverState,
      senderId: 'POS_CLEAR_ALL',
      timestamp: now,
    });
    pushToFirestoreCloud();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, timestamp: now, state: serverState }));
    return;
  }

  if (url.pathname === '/api/sync' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(serverState));
    return;
  }

  if (url.pathname === '/api/sync' && req.method === 'POST') {
    try {
      const data = await readRequestBody(req);
      const clientIp = req.socket?.remoteAddress || 'unknown';
      const ticketCount = Array.isArray(data?.state?.tickets) ? data.state.tickets.length : '?';
      console.log(`[Sultan Hub] HTTP POST /api/sync from ${data.senderId || clientIp} (${clientIp}) tickets=${ticketCount}`);
      if (data.state && !hasProcessedServerPacket(data.packetId)) {
        applyStateUpdate(data.state, data.senderId);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, timestamp: Date.now(), state: serverState }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 8.1 Direct Thermal Printer Raw ESC/POS KOT Dispatch (Strict Station Isolation: Main vs Juice Bar)
  if (url.pathname === '/api/print/kot' && req.method === 'POST') {
    try {
      const data = await readRequestBody(req);
      if (!data || !data.ticket) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing ticket payload' }));
        return;
      }
      const tId = String(data.ticket.id || (data.ticket.orderId ? `ord-${data.ticket.orderId}` : '') || '');
      const isForceReprint = !!data.forceReprint;
      const requestedStation = data.station === 'juice' ? 'juice' : (data.station === 'all' ? 'all' : 'main');

      const stations = requestedStation === 'all' ? ['main', 'juice'] : [requestedStation];
      const results = [];

      for (const st of stations) {
        const dedupKey = `${st}:${tId}`;
        if (!isForceReprint && tId && serverAutoPrintedTicketIds.has(dedupKey)) {
          console.log(`[Sultan Hub] Direct ${st.toUpperCase()} KOT print skipped for #${tId} (already printed/queued).`);
          results.push({ success: true, skipped: true, reason: 'Already printed', station: st, ticketId: tId });
          continue;
        }

        console.log(`[Sultan Hub] ${isForceReprint ? '[Manual Reprint]' : '[KDS Print]'} HTTP POST /api/print/kot for ticket #${tId} (station: ${st})`);
        if (tId) {
          serverAutoPrintedTicketIds.add(dedupKey);
        }

        const r = await dispatchStationPrint(data.ticket, st, {
          waitForAck: true,
          printerName: data.printerName,
        });
        results.push(r);
      }

      const primaryResult = results.length === 1
        ? results[0]
        : { success: results.some((r) => r.success), results };
      appendSystemLogs(
        {
          actorId: data.ticket?.server || 'kds',
          actorName: data.ticket?.server || 'KOT Printer',
          actorRole: requestedStation === 'juice' ? 'Juice Bar' : 'Kitchen',
          page: '/api/print/kot',
          module: 'PRINTING',
          action: isForceReprint ? 'REPRINT_KOT' : 'PRINT_KOT',
          actionType: 'PRINT',
          severity: 'info',
          entityType: 'Ticket',
          entityId: tId,
          entityName: data.ticket?.tableName || tId,
          summary: `${isForceReprint ? 'Reprinted' : 'Printed'} ${requestedStation.toUpperCase()} KOT #${tId} for ${data.ticket?.tableName || 'Table'}`,
          details: { ticketId: tId, station: requestedStation, forceReprint: isForceReprint, success: primaryResult?.success },
        },
        { ip: clientIp }
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(primaryResult));
    } catch (err) {
      console.warn('[Sultan Hub] /api/print/kot error:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 8.1b Direct Thermal Printer Customer Bill / Unpaid Bill Dispatch (For Android Tablets & POS)
  if (url.pathname === '/api/print/bill' && req.method === 'POST') {
    try {
      const data = await readRequestBody(req);
      if (!data || !data.invoice) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing invoice payload' }));
        return;
      }
      if (!printerHelper || typeof printerHelper.buildEscPosBillBuffer !== 'function') {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Printer helper bill builder not available' }));
        return;
      }
      const buffer = printerHelper.buildEscPosBillBuffer(data.invoice);
      const cfg = getStationPrinterConfig('main');
      const targetPrinter = data.printerName || (cfg && cfg.printerName && cfg.printerName !== 'AUTO' ? cfg.printerName : 'POS-80');
      const result = await printerHelper.printRawBufferToWindows(buffer, targetPrinter, data.invoice.id);
      appendSystemLogs(
        {
          actorId: data.invoice?.server || 'cashier',
          actorName: data.invoice?.server || 'Cashier POS',
          actorRole: 'Cashier',
          page: '/api/print/bill',
          module: 'PRINTING',
          action: 'PRINT_THERMAL_BILL',
          actionType: 'PRINT',
          severity: 'info',
          entityType: 'Invoice',
          entityId: data.invoice?.id,
          entityName: data.invoice?.tableName || data.invoice?.id,
          amount: Number(data.invoice?.total || 0),
          summary: `Printed thermal bill receipt ${data.invoice?.id || ''} (${data.invoice?.tableName || 'Counter'}) — Rs. ${Number(data.invoice?.total || 0).toLocaleString()}`,
          details: { invoiceId: data.invoice?.id, printer: targetPrinter, total: data.invoice?.total },
        },
        { ip: clientIp }
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, result }));
    } catch (err) {
      console.warn('[Sultan Hub] /api/print/bill error:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 8.2 Remote Print Agent Long-Poll Endpoint (Used by SultanPrintAgent.ps1 on Juice Bar PC)
  if (url.pathname === '/api/print-agent/poll' && req.method === 'GET') {
    const station = url.searchParams.get('station') === 'main' ? 'main' : 'juice';
    const pcName = url.searchParams.get('pc') || 'Station-PC';
    const activePrinter = url.searchParams.get('printer') || '';
    const printersRaw = url.searchParams.get('printers') || '';
    const printEngine = url.searchParams.get('engine') || '';
    const availablePrinters = printersRaw ? printersRaw.split('||').map((s) => s.trim()).filter(Boolean) : [];
    const prevAgent = connectedPrintAgents[station];
    const wasOnline = isPrintAgentOnline(station);
    const prevPrintersKey = prevAgent && Array.isArray(prevAgent.availablePrinters) ? prevAgent.availablePrinters.join('||') : '';
    const changed = !wasOnline
      || !prevAgent
      || prevAgent.activePrinter !== activePrinter
      || prevPrintersKey !== availablePrinters.join('||')
      || prevAgent.pcName !== pcName;

    connectedPrintAgents[station] = {
      station,
      pcName,
      activePrinter,
      availablePrinters,
      printEngine: printEngine || undefined,
      ip: clientIp,
      lastSeen: Date.now(),
    };

    if (changed) {
      console.log(`[Sultan Hub Print-Agent] ${station.toUpperCase()} Print Agent ONLINE from ${pcName} (${clientIp}) -> Active: ${activePrinter || 'NONE'} | Printers(${availablePrinters.length}): [${availablePrinters.join(', ')}]${printEngine ? ` | Engine: ${printEngine}` : ''}`);
      broadcastToClients({
        type: 'PRINT_AGENT_STATUS',
        station,
        online: true,
        pcName,
        activePrinter,
        availablePrinters,
        printEngine: printEngine || undefined,
        timestamp: Date.now(),
      });
    }

    const cfg = getStationPrinterConfig(station);
    pruneExpiredRemoteJobs(station);

    // Immediate delivery if job already queued
    if (remotePrintQueues[station] && remotePrintQueues[station].length > 0) {
      const job = remotePrintQueues[station].shift();
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({
        ok: true,
        configuredPrinter: cfg.printerName || 'AUTO',
        jobId: job.jobId,
        ticketId: job.ticketId,
        tableName: job.tableName,
        station: job.station,
        printerName: job.printerName || cfg.printerName || 'AUTO',
        rawBase64: job.rawBase64,
        plainText: job.plainText || '',
      }));
      return;
    }

    // Fast handshake response on initial connect / printer change so Desktop Agent turns GREEN instantly!
    if (url.searchParams.get('hello') === '1' || changed) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({
        ok: true,
        connected: true,
        configuredPrinter: cfg.printerName || 'AUTO',
        jobId: null,
      }));
      return;
    }

    // Hold long-poll open for up to 12 seconds for <10ms instant push when an order arrives
    const waiter = { res, timer: null };
    waiter.timer = setTimeout(() => {
      const list = longPollWaiters[station] || [];
      const idx = list.indexOf(waiter);
      if (idx !== -1) list.splice(idx, 1);
      try {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ ok: true, configuredPrinter: cfg.printerName || 'AUTO', jobId: null }));
      } catch (_) { }
    }, 12000);

    req.on('close', () => {
      clearTimeout(waiter.timer);
      const list = longPollWaiters[station] || [];
      const idx = list.indexOf(waiter);
      if (idx !== -1) list.splice(idx, 1);
    });

    if (!longPollWaiters[station]) longPollWaiters[station] = [];
    longPollWaiters[station].push(waiter);
    return;
  }

  // 8.3 Remote Print Agent Print Acknowledgment
  if (url.pathname === '/api/print-agent/ack' && req.method === 'POST') {
    try {
      const data = await readRequestBody(req);
      const station = data.station === 'main' ? 'main' : 'juice';
      const jobId = String(data.jobId || '');
      const ticketId = String(data.ticketId || '');
      const success = !!data.success;
      const printerName = data.printerName || 'Remote Printer';
      const pcName = data.pcName || 'Station-PC';

      if (success) {
        console.log(`[Sultan Hub Print-Agent] ${station.toUpperCase()} KOT #${ticketId} PRINTED OK on ${pcName} -> ${printerName}`);
        broadcastToClients({
          type: 'TICKET_AUTO_PRINTED',
          ticketId,
          station,
          printer: printerName,
          pcName,
          timestamp: Date.now(),
        });
      } else {
        console.warn(`[Sultan Hub Print-Agent] ${station.toUpperCase()} KOT #${ticketId} FAILED on ${pcName}: ${data.error || 'Unknown error'}`);
      }

      if (jobId && pendingAgentAcks.has(jobId)) {
        const pending = pendingAgentAcks.get(jobId);
        clearTimeout(pending.timer);
        pendingAgentAcks.delete(jobId);
        pending.resolve({
          success,
          station,
          ticketId,
          printer: printerName,
          pcName,
          error: data.error || undefined,
        });
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 8.4 Live Station Printer Status & Available Printers Discovery
  if (url.pathname === '/api/print/status' && req.method === 'GET') {
    try {
      const serverWindowsPrinters = (printerHelper && typeof printerHelper.getLocalWindowsPrinters === 'function')
        ? await printerHelper.getLocalWindowsPrinters()
        : ['POS-80'];

      const lanIp = getServerLanIp();
      const hostHeader = req.headers.host || `${lanIp}:${PORT}`;
      const formatAgent = (st) => {
        const a = connectedPrintAgents[st];
        const online = isPrintAgentOnline(st);
        return a ? { ...a, online } : { online: false, pcName: null, activePrinter: null, availablePrinters: [] };
      };

      pruneExpiredRemoteJobs('main');
      pruneExpiredRemoteJobs('juice');

      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({
        serverUrl: `http://${hostHeader}`,
        lanServerUrl: `http://${lanIp}:${PORT}`,
        serverWindowsPrinters,
        kitchen: {
          config: getStationPrinterConfig('main'),
          agent: formatAgent('main'),
          pendingJobs: (remotePrintQueues.main || []).length,
        },
        juice: {
          config: getStationPrinterConfig('juice'),
          agent: formatAgent('juice'),
          pendingJobs: (remotePrintQueues.juice || []).length,
        },
        timestamp: Date.now(),
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 8.5 Save Station Printer Routing Configuration
  if (url.pathname === '/api/print/config' && req.method === 'POST') {
    try {
      const data = await readRequestBody(req);
      if (!serverState.systemSettings || typeof serverState.systemSettings !== 'object') {
        serverState.systemSettings = {};
      }
      const allowedPrinterKeys = [
        'kitchenPrinterMode', 'kitchenPrinterName', 'kitchenPrinterHost', 'kitchenPrinterPort',
        'juicePrinterMode', 'juicePrinterName', 'juicePrinterHost', 'juicePrinterPort',
      ];
      for (const k of allowedPrinterKeys) {
        if (data[k] !== undefined) {
          serverState.systemSettings[k] = data[k];
        }
      }
      serverState.systemSettings.updatedAt = Date.now();
      persistState();
      broadcastToClients({
        type: 'STATE_UPDATE',
        state: { systemSettings: serverState.systemSettings },
        senderId: 'SERVER_PRINTER_CONFIG',
        timestamp: Date.now(),
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        kitchen: getStationPrinterConfig('main'),
        juice: getStationPrinterConfig('juice'),
      }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 8.6 One-Click Downloadable Dedicated Station Print Agent Setup Pack (.zip - Zero unsigned .exe, Windows 11 Smart App Control safe!)
  if (url.pathname === '/api/print-agent/download' && req.method === 'GET') {
    try {
      const station = url.searchParams.get('station') === 'main' ? 'main' : 'juice';
      const psScriptPath = path.join(__dirname, 'JuiceBar-Printer-Agent', 'SultanPrintAgent.ps1');
      if (!fs.existsSync(psScriptPath) || !printerHelper || typeof printerHelper.buildZipBuffer !== 'function') {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Print Agent script not available on server' }));
        return;
      }

      const lanIp = getServerLanIp();
      const hostRaw = String(req.headers.host || '').split(':')[0].trim().toLowerCase();
      const isLoopback = !hostRaw || hostRaw === 'localhost' || hostRaw === '127.0.0.1' || hostRaw === '::1' || hostRaw === '[::1]';
      const resolvedHost = isLoopback ? lanIp : hostRaw;
      const serverUrl = `http://${resolvedHost}:${PORT}`;
      const stationLabel = station === 'juice' ? 'JuiceBar' : 'Kitchen';
      const psScriptData = fs.readFileSync(psScriptPath);

      const agentConfig = [
        '# Sultan Restaurant Dedicated Station Thermal Print Agent Config (v3.1)',
        `SERVER=${serverUrl}`,
        `STATION=${station}`,
        'PRINTER=AUTO',
        'MODE=AUTO',
        'AUTOSTART=true',
        '',
      ].join('\r\n');

      const startBat = [
        '@echo off',
        `title Sultan ${stationLabel} Printer Agent`,
        'set "APPDIR=%~dp0"',
        'cd /d "%APPDIR%"',
        '',
        'if not exist "%APPDIR%SultanPrintAgent.ps1" (',
        '  echo.',
        '  echo ====================================================================',
        '  echo   ERROR: Please EXTRACT the ZIP file first!',
        '  echo   Right-click the downloaded ZIP -^> click "Extract All..."',
        `  echo   Then open the extracted folder and run Start-${stationLabel}-Printer.bat`,
        '  echo ====================================================================',
        '  echo.',
        '  pause',
        '  exit /b 1',
        ')',
        '',
        'powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -LiteralPath $env:APPDIR -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue" >nul 2>&1',
        'start "" powershell.exe -STA -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "%APPDIR%SultanPrintAgent.ps1"',
        'exit /b 0',
        '',
      ].join('\r\n');

      const testBat = [
        '@echo off',
        `title Test Sultan ${stationLabel} Printer`,
        'set "APPDIR=%~dp0"',
        'cd /d "%APPDIR%"',
        'if not exist "%APPDIR%SultanPrintAgent.ps1" (',
        '  echo ERROR: Please EXTRACT the ZIP file first!',
        '  pause',
        '  exit /b 1',
        ')',
        'powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -LiteralPath $env:APPDIR -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue" >nul 2>&1',
        'powershell.exe -STA -NoProfile -ExecutionPolicy Bypass -File "%APPDIR%SultanPrintAgent.ps1" -Test',
        'exit /b 0',
        '',
      ].join('\r\n');

      const diagnoseBat = [
        '@echo off',
        `title Diagnose Sultan ${stationLabel} Printer`,
        'set "APPDIR=%~dp0"',
        'cd /d "%APPDIR%"',
        'if not exist "%APPDIR%SultanPrintAgent.ps1" (',
        '  echo ERROR: Please EXTRACT the ZIP file first!',
        '  pause',
        '  exit /b 1',
        ')',
        'powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -LiteralPath $env:APPDIR -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue" >nul 2>&1',
        'powershell.exe -STA -NoProfile -ExecutionPolicy Bypass -File "%APPDIR%SultanPrintAgent.ps1" -Diagnose',
        'echo.',
        'pause',
        'exit /b 0',
        '',
      ].join('\r\n');

      const readmeTxt = [
        '================================================================',
        `  SULTAN RESTAURANT - ${stationLabel.toUpperCase()} DEDICATED PRINTER SETUP (v3.1)`,
        '================================================================',
        '',
        'STEP 1: RIGHT-CLICK this ZIP file and click "Extract All..." anywhere on this PC.',
        '        (IMPORTANT: Do NOT run .bat files directly inside the ZIP window!)',
        'STEP 2: Plug in the USB Thermal Printer and make sure its Windows driver is installed.',
        `STEP 3: Double-click "Start-${stationLabel}-Printer.bat" ONCE!`,
        '        - Opens the permanent Desktop Printer Agent window & auto-picks your USB printer.',
        '        - AUTOMATICALLY installs itself in AppData & enables Windows Boot Auto-Start!',
        '          (No separate Install-AutoStart file needed! Even if you delete the ZIP later, it keeps running.)',
        'STEP 4: Click "Print Test Slip" inside the window to confirm printing.',
        '',
        `TROUBLESHOOTING: Double-click "Diagnose-${stationLabel}-Printer.bat" to see all detected`,
        'printers, USB ports, and live connection check to the Sultan Hub.',
        '',
        'Windows 11 Safe: 100% pure Microsoft-signed PowerShell (zero unsigned .exe, zero Smart App Control block!).',
        `- Pre-configured Server Hub: ${serverUrl}`,
        '',
      ].join('\r\n');

      const zipBuf = printerHelper.buildZipBuffer([
        { name: 'SultanPrintAgent.ps1', data: psScriptData },
        { name: 'agent-config.txt', data: agentConfig },
        { name: `Start-${stationLabel}-Printer.bat`, data: startBat },
        { name: `Test-${stationLabel}-Printer.bat`, data: testBat },
        { name: `Diagnose-${stationLabel}-Printer.bat`, data: diagnoseBat },
        { name: `README-${stationLabel.toUpperCase()}-PRINTER.txt`, data: readmeTxt },
      ]);

      res.writeHead(200, {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="Sultan-${stationLabel}-Printer-Setup.zip"`,
        'Content-Length': zipBuf.length,
        'Cache-Control': 'no-store',
      });
      res.end(zipBuf);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 8.7 Executive A4 Vector Financial Report PDF Generator (Zero external npm deps — uses installed Chrome/Edge headless)
  if (url.pathname === '/api/reports/export-pdf' && req.method === 'POST') {
    try {
      const data = await readRequestBody(req);
      const html = typeof data?.html === 'string' ? data.html : '';
      const rawName = typeof data?.filename === 'string' ? data.filename : `Sultan_Financial_Report_${Date.now()}.pdf`;
      const safeFilename = rawName.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.pdf$/i, '') + '.pdf';

      if (!html || html.length < 40) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing report HTML payload' }));
        return;
      }

      const browserCandidates = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      ];
      const browserBin = browserCandidates.find((p) => {
        try { return fs.existsSync(p); } catch (_) { return false; }
      });

      if (!browserBin) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Headless PDF browser not installed on server' }));
        return;
      }

      const { execFile } = require('child_process');
      const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const htmlPath = path.join(os.tmpdir(), `sultan_report_${stamp}.html`);
      const pdfPath = path.join(os.tmpdir(), `sultan_report_${stamp}.pdf`);

      fs.writeFileSync(htmlPath, html, 'utf8');
      const fileUrl = 'file:///' + htmlPath.replace(/\\/g, '/');

      const pdfBuf = await new Promise((resolve, reject) => {
        execFile(
          browserBin,
          [
            '--headless=new',
            '--disable-gpu',
            '--no-sandbox',
            '--disable-extensions',
            '--no-pdf-header-footer',
            '--run-all-compositor-stages-before-draw',
            `--print-to-pdf=${pdfPath}`,
            fileUrl,
          ],
          { timeout: 18000, windowsHide: true },
          (err) => {
            try {
              if (fs.existsSync(pdfPath)) {
                const buf = fs.readFileSync(pdfPath);
                if (buf.length > 500) {
                  return resolve(buf);
                }
              }
              return reject(err || new Error('PDF output was empty'));
            } catch (readErr) {
              return reject(readErr);
            } finally {
              try { fs.unlinkSync(htmlPath); } catch (_) { }
              try { fs.unlinkSync(pdfPath); } catch (_) { }
            }
          }
        );
      });

      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${safeFilename}"`,
        'Content-Length': pdfBuf.length,
        'Cache-Control': 'no-store',
      });
      res.end(pdfBuf);
    } catch (err) {
      console.warn('[Sultan Hub] /api/reports/export-pdf error:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 8b. Serve Menu Dish Images directly from D:\SultanMenuImages or public/menu-images
  if ((req.method === 'GET' || req.method === 'HEAD') && url.pathname && url.pathname.startsWith('/menu-images/')) {
    const fileName = path.basename(decodeURIComponent(url.pathname));
    const candidates = [
      path.join('D:\\SultanMenuImages', fileName),
      path.join(__dirname, 'public', 'menu-images', fileName),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        const ext = path.extname(candidate).toLowerCase();
        const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
        res.writeHead(200, {
          'Content-Type': mime,
          'Cache-Control': 'public, max-age=604800',
          'Access-Control-Allow-Origin': '*',
        });
        if (req.method === 'HEAD') {
          res.end();
        } else {
          fs.createReadStream(candidate).pipe(res);
        }
        return;
      }
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Image not found');
    return;
  }

  // 9. High-Performance Static Web File Server (Serves pre-compiled production SPA from /dist with gzip acceleration)
  if (req.method === 'GET' || req.method === 'HEAD') {
    const DIST_DIR = process.env.SULTAN_DIST_DIR || path.join(__dirname, 'dist');
    if (fs.existsSync(DIST_DIR)) {
      let rawPath = (url.pathname || '/').split('?')[0];
      try {
        rawPath = decodeURIComponent(rawPath);
      } catch (_) { }

      let filePath = path.join(DIST_DIR, rawPath === '/' ? 'index.html' : rawPath);
      // Prevent directory traversal
      if (filePath.startsWith(DIST_DIR)) {
        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          // Fallback to index.html for client-side Expo router routes (e.g. /admin/dashboard, /pos, /floor-manager)
          filePath = path.join(DIST_DIR, 'index.html');
        }

        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          const ext = path.extname(filePath).toLowerCase();
          const mimeTypes = {
            '.html': 'text/html; charset=utf-8',
            '.js': 'application/javascript; charset=utf-8',
            '.css': 'text/css; charset=utf-8',
            '.json': 'application/json; charset=utf-8',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.svg': 'image/svg+xml',
            '.ico': 'image/x-icon',
            '.ttf': 'font/ttf',
            '.woff': 'font/woff',
            '.woff2': 'font/woff2',
            '.mp3': 'audio/mpeg',
            '.wav': 'audio/wav',
          };
          const contentType = mimeTypes[ext] || 'application/octet-stream';
          const isHashed = rawPath.includes('/_expo/') || rawPath.includes('/assets/') || rawPath.includes('/fonts/');
          const cacheControl = isHashed
            ? 'public, max-age=31536000, immutable'
            : 'no-cache, no-store, must-revalidate';

          const acceptEncoding = req.headers['accept-encoding'] || '';
          const canGzip = /\bgzip\b/.test(acceptEncoding) && ['.html', '.js', '.css', '.json', '.svg'].includes(ext);

          const headers = {
            'Content-Type': contentType,
            'Cache-Control': cacheControl,
            'Access-Control-Allow-Origin': '*',
          };

          const cachedAsset = getCachedStaticAsset(filePath, canGzip);
          if (cachedAsset) {
            if (canGzip && cachedAsset.gzipped) {
              headers['Content-Encoding'] = 'gzip';
              headers['Content-Length'] = cachedAsset.gzipped.length;
              res.writeHead(200, headers);
              if (req.method === 'HEAD') {
                res.end();
                return;
              }
              res.end(cachedAsset.gzipped);
              return;
            }

            headers['Content-Length'] = cachedAsset.raw.length;
            res.writeHead(200, headers);
            if (req.method === 'HEAD') {
              res.end();
              return;
            }
            res.end(cachedAsset.raw);
            return;
          }
        }
      }
    }

    // If static files are still compiling or being refreshed, show a polite instant loader rather than JSON
    if (req.method === 'GET' && !url.pathname.startsWith('/api/')) {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      });
      res.end(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="2">
  <title>Sultan Restaurant POS - Starting</title>
  <style>
    body { background: #1a0f0f; color: #d4af37; font-family: system-ui, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    h1 { margin-bottom: 8px; font-size: 26px; }
    p { color: #f5e6ca; font-size: 15px; opacity: 0.85; }
    .loader { width: 40px; height: 40px; border: 4px solid #331515; border-top: 4px solid #d4af37; border-radius: 50%; animation: spin 0.8s linear infinite; margin-bottom: 18px; }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="loader"></div>
  <h1>Sultan Restaurant POS</h1>
  <p>Loading application resources, please wait a moment...</p>
</body>
</html>`);
      return;
    }
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Endpoint not found', server: 'Sultan Restaurant Hub' }));
}

// In-memory RAM cache for static web assets (raw + gzipped) for <1ms instant page loads
const staticAssetCache = new Map();

function getCachedStaticAsset(filePath, canGzip) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return null;
    const cacheKey = filePath;
    const cached = staticAssetCache.get(cacheKey);
    if (cached && cached.mtimeMs === stat.mtimeMs) {
      if (canGzip && !cached.gzipped) {
        cached.gzipped = zlib.gzipSync(cached.raw, { level: 6 });
      }
      return cached;
    }
    const raw = fs.readFileSync(filePath);
    const entry = {
      mtimeMs: stat.mtimeMs,
      raw,
      gzipped: canGzip ? zlib.gzipSync(raw, { level: 6 }) : null,
    };
    staticAssetCache.set(cacheKey, entry);
    return entry;
  } catch (_) {
    return null;
  }
}
const server = http.createServer(handleRequest);
const server5000 = http.createServer(handleRequest);
let server80 = null;
try {
  server80 = http.createServer(handleRequest);
} catch (e) { }

const wss = new WebSocketServer({ noServer: true });

function bindUpgrade(srv) {
  if (!srv) return;
  srv.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });
}
bindUpgrade(server);
bindUpgrade(server5000);
if (server80) bindUpgrade(server80);

function broadcastToClients(msgObj, excludeWs = null) {
  const payload = JSON.stringify(msgObj);
  for (const client of wss.clients) {
    if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

const recentServerPacketIds = new Set();
function hasProcessedServerPacket(packetId) {
  if (!packetId || typeof packetId !== 'string') return false;
  if (recentServerPacketIds.has(packetId)) return true;
  recentServerPacketIds.add(packetId);
  if (recentServerPacketIds.size > 300) {
    const oldest = recentServerPacketIds.values().next().value;
    if (oldest) recentServerPacketIds.delete(oldest);
  }
  return false;
}

let lastStateFingerprint = '';
function computeStateFingerprint(st) {
  try {
    return JSON.stringify({
      tickets: st.tickets || [],
      deletedTicketIds: st.deletedTicketIds || [],
      deletedTableIds: st.deletedTableIds || [],
      deletedFloorIds: st.deletedFloorIds || [],
      floorsLen: Array.isArray(st.floors) ? st.floors.map(f => `${f.id}:${f.name}`).join(',') : '',
      tables: (st.tables || []).map(t => ({
        id: t.id,
        name: t.name,
        floor: t.floor,
        seatingType: t.seatingType,
        seats: t.seats,
        status: t.status,
        billTotal: t.billTotal,
        isPaid: t.isPaid,
        server: t.server,
        occupiedSince: t.occupiedSince,
        lastSettledAt: t.lastSettledAt,
        waiterPayId: t.waiterPaymentCollection?.id || '',
        ordersLen: Array.isArray(t.orders) ? t.orders.length : 0,
      })),
      onlineOrdersLen: Array.isArray(st.onlineOrders) ? st.onlineOrders.map(o => `${o.id}:${o.status}`).join(',') : '',
      invoicesLen: Array.isArray(st.invoices) ? st.invoices.length : 0,
      menuLen: Array.isArray(st.menuItems) ? st.menuItems.length : 0,
      categoriesLen: Array.isArray(st.categories) ? st.categories.length : 0,
      zonesLen: Array.isArray(st.zones) ? st.zones.length : 0,
      customersLen: Array.isArray(st.customers) ? st.customers.length : 0,
      inventoryResetEpoch: Number(st.inventoryResetEpoch || 0),
      inventoryState: Array.isArray(st.inventory)
        ? st.inventory.map(i => `${i?.id}:${i?.stock}:${i?.location || ''}:${i?.beverageStorageMode || ''}:${i?.updatedAt || 0}`).join('|')
        : '',
      storageZonesState: Array.isArray(st.storageZones)
        ? st.storageZones.map(z => `${z?.id}:${z?.name}:${z?.type}:${z?.isActive !== false}:${z?.updatedAt || 0}`).join('|')
        : '',
      movementsKey: Array.isArray(st.stockMovements)
        ? `${st.stockMovements.length}:${st.stockMovements[0]?.id || ''}`
        : '0',
      chillerHandoversKey: Array.isArray(st.chillerHandovers)
        ? `${st.chillerHandovers.length}:${st.chillerHandovers[0]?.id || ''}`
        : '0',
      purchaseOrdersKey: Array.isArray(st.purchaseOrders)
        ? `${st.purchaseOrders.length}:${st.purchaseOrders.map(p => `${p?.id}:${p?.status}:${p?.paidAmount || 0}`).join(',')}`
        : '0',
      inventoryCategoriesKey: Array.isArray(st.inventoryCategories) ? st.inventoryCategories.join('|') : '',
      assetCategoriesKey: Array.isArray(st.assetCategories) ? st.assetCategories.join('|') : '',
      expenseCategoriesKey: Array.isArray(st.expenseCategories) ? st.expenseCategories.join('|') : '',
      suppliersLen: Array.isArray(st.suppliers) ? st.suppliers.length : 0,
      recipesLen: Array.isArray(st.recipes) ? st.recipes.length : 0,
      expensesLen: Array.isArray(st.expenses) ? st.expenses.length : 0,
      assetsLen: Array.isArray(st.assets) ? st.assets.length : 0,
      damagesLen: Array.isArray(st.damageRecords) ? st.damageRecords.length : 0,
      rolesState: Array.isArray(st.roles)
        ? st.roles.map(r => ({
          id: r?.id || '',
          name: r?.name || '',
          baseRole: r?.baseRole || '',
          updatedAt: r?.updatedAt || 0,
          permissions: r?.permissions || {},
        }))
        : [],
      staffState: Array.isArray(st.staff)
        ? st.staff.map(s => ({
          id: s?.id || '',
          hasSystemAccess: s?.hasSystemAccess !== false,
          username: s?.username || '',
          name: s?.name || '',
          designation: s?.designation || '',
          role: s?.role || '',
          customRoleId: s?.customRoleId || '',
          status: s?.status || '',
          pin: s?.pin || '',
          maxDevices: s?.maxConcurrentDevices || 0,
          permissionOverrides: s?.permissionOverrides || null,
        }))
        : [],
      systemSettingsUpdatedAt: (st.systemSettings && st.systemSettings.updatedAt) || 0,
      lastBillPaidAlert: st.lastBillPaidAlert || null,
      lastFoodReadyAlert: st.lastFoodReadyAlert || null,
      pendingFloorOrderAlert: st.pendingFloorOrderAlert || null,
      activeStaffSessions: (st.activeStaffSessions || []).map(s => `${s.sessionId}:${s.deviceId}:${s.staffId}:${s.loginTime}`),
      revokedSessions: Object.keys(st.revokedSessions || {}).sort().join(','),
      revokedDeviceIds: Object.keys(st.revokedDeviceIds || {}).sort().join(','),
      shiftsCount: Array.isArray(st.shifts) ? st.shifts.length : 0,
      activeShiftId: st.activeShiftId || null,
    });
  } catch (_) {
    return String(Date.now());
  }
}

const LEGACY_DUMMY_SEED_IDS = {
  staff: new Set(['st1', 'st2', 'st3', 'st4', 'st5', 'st6', 'st7', 'st-ot1', 'st-ot2', 'st-ot3', 'st-ot4', 'st-fm1', 'st-fm2', 'st-c1', 'st-c2', 'st1794730033364']),
  inventory: new Set(Array.from({ length: 23 }, (_, i) => `inv${i + 1}`)),
  stockMovements: new Set(['mv-01', 'mv-02', 'mv-03', 'mv-04']),
  suppliers: new Set(['sup-1', 'sup-2', 'sup-3', 'sup-4', 'sup-5', 'sup-6', 'sup-7', 'sup-8', 'sup-9']),
  purchaseOrders: new Set(['po-101', 'po-102']),
  supplierPayments: new Set(['spay-1', 'spay-2']),
  assets: new Set(['ast-1', 'ast-2', 'ast-3', 'ast-4', 'ast-5', 'ast-6', 'ast-7', 'ast-8']),
  damageRecords: new Set(['dmg-1', 'dmg-2', 'dmg-3', 'dmg-4', 'dmg-5']),
  recipes: new Set(['rc-1', 'rc-2', 'rc-3', 'rc-4']),
  kitchenSessions: new Set(['ks-closed-today-morning', 'ks-active-evening']),
  kitchenManualUsage: new Set(['mu-1', 'mu-2', 'mu-3', 'mu-4']),
  customers: new Set(['c1', 'c2', 'c3', 'c4', 'c5']),
  feedbacks: new Set(['fb-1', 'fb-2']),
  reservations: new Set(['res-1']),
  attendance: new Set(Array.from({ length: 11 }, (_, i) => `att-${i + 1}`)),
  salaryPayments: new Set(['sal-101', 'sal-102', 'sal-103']),
  appUsers: new Set(['usr-1', 'usr-2']),
  appUserLogs: new Set(['log-1', 'log-2']),
};

function sanitizeIncomingSeedData(key, value) {
  if (!Array.isArray(value)) return value;
  const seedSet = LEGACY_DUMMY_SEED_IDS[key];
  if (key === 'staff') {
    const dummyNames = new Set(['junaid ahsan', 'ali khan', 'chef omar', 'order taker 1', 'order taker 2', 'order taker 3', 'order taker 4', 'sara ahmed', 'hamza malik', 'ali raza', 'tariq juice master', 'rashid mehmood', 'tariq javed', 'usman tariq', 'bilal hassan', 'rohan ali']);
    return value.filter((item) => {
      if (!item || !item.id) return false;
      if (item.id === 'st-master') return true;
      if (seedSet && seedSet.has(item.id)) return false;
      const nm = String(item.name || '').trim().toLowerCase();
      if (nm && dummyNames.has(nm)) return false;
      return true;
    });
  }
  if (key === 'inventory') {
    return value.filter((item) => item && item.id && !isLegacyDummyInventoryId(item.id));
  }
  if (key === 'stockMovements') {
    return value.filter(
      (item) => item && item.id && !seedSet?.has(item.id) && !isLegacyDummyInventoryId(item.itemId)
    );
  }
  if (seedSet) {
    return value.filter((item) => item && !seedSet.has(item.id));
  }
  if (key === 'shifts') {
    return value.filter((s) => {
      if (!s) return false;
      if (s.cashierName === 'Ali Khan' || s.cashierName === 'Sara Ahmed') return false;
      const note = (s.openingNotes || '').trim();
      if (
        note === 'Morning float issued: Rs. 5,000 in petty change.' ||
        note === 'Dinner rush shift. Rs. 8,000 float given to drawer.'
      ) {
        return false;
      }
      if (s.cashierName === 'Sara Ahmed' && s.systemTotalSales === 66250 && s.settledOrdersCount === 22) {
        return false;
      }
      return true;
    });
  }
  return value;
}

function applyStateUpdate(partialState, senderId, originWs = null) {
  if (!partialState || typeof partialState !== 'object') return;

  const prevFingerprint = lastStateFingerprint || computeStateFingerprint(serverState);

  // Merge state keys safely (deletedTicketIds, deletedTableIds, deletedFloorIds, tickets, and tables MUST be processed first in order)
  const allowedKeys = ['deletedTicketIds', 'deletedTableIds', 'deletedFloorIds', 'floors', 'inventoryResetEpoch', 'deletedInventoryIds', 'deletedStorageZoneIds', 'deletedInventoryCategories', 'deletedRecordIds', 'tickets', 'tables', 'onlineOrders', 'pendingFloorOrderAlert', 'appUsers', 'appUserLogs', 'invoices', 'menuItems', 'categories', 'regions', 'zones', 'staff', 'attendance', 'salaryPayments', 'feedbacks', 'salesReturns', 'customers', 'reservations', 'lastBillPaidAlert', 'lastFoodReadyAlert', 'tableMoveLogs', 'cancelledOrderLogs', 'lastTableMoveAlert', 'lastOrderCancelledAlert', 'serviceRequests', 'playlandTickets', 'playlandRides', 'inventory', 'storageZones', 'inventoryCategories', 'assetCategories', 'expenseCategories', 'stockMovements', 'chillerHandovers', 'expenses', 'feedback', 'unavailableItemIds', 'suppliers', 'purchaseOrders', 'supplierPayments', 'recipes', 'kitchenSessions', 'kitchenConsumption', 'kitchenManualUsage', 'kitchenCash', 'kitchenSettings', 'assets', 'damageRecords', 'shifts', 'activeShiftId', 'roles', 'systemSettings', 'activeStaffSessions', 'revokedDeviceIds'];
  let modified = false;

  if (!Array.isArray(serverState.deletedTableIds)) serverState.deletedTableIds = [];
  if (Array.isArray(partialState.deletedTableIds) && partialState.deletedTableIds.length > 0) {
    serverState.deletedTableIds = Array.from(new Set([...serverState.deletedTableIds, ...partialState.deletedTableIds])).slice(-500);
    modified = true;
  }
  const deletedTableSet = new Set(serverState.deletedTableIds);

  if (!Array.isArray(serverState.deletedFloorIds)) serverState.deletedFloorIds = [];
  if (Array.isArray(partialState.deletedFloorIds) && partialState.deletedFloorIds.length > 0) {
    serverState.deletedFloorIds = Array.from(new Set([...serverState.deletedFloorIds, ...partialState.deletedFloorIds])).slice(-200);
    modified = true;
  }
  const deletedFloorSet = new Set(serverState.deletedFloorIds);

  // Epoch barrier: if server executed a Clean Slate Reset, ignore pre-reset inventory/categories/movements from stale devices!
  const currInvEpoch = Number(serverState.inventoryResetEpoch || 0);
  const incInvEpoch = Number(partialState.inventoryResetEpoch || 0);
  const isStaleInventoryClient = currInvEpoch > 0 && incInvEpoch < currInvEpoch;
  if (incInvEpoch > currInvEpoch) {
    serverState.inventoryResetEpoch = incInvEpoch;
    serverState.inventory = Array.isArray(partialState.inventory)
      ? partialState.inventory.filter((i) => i && !isLegacyDummyInventoryId(i.id))
      : [];
    serverState.inventoryCategories = Array.isArray(partialState.inventoryCategories) ? partialState.inventoryCategories : [];
    serverState.stockMovements = [];
    serverState.chillerHandovers = [];
    modified = true;
  }

  // Track explicit deletions for inventory, storageZones, inventoryCategories & operational records so out-of-sync clients never wipe live entries
  if (!Array.isArray(serverState.deletedInventoryIds)) serverState.deletedInventoryIds = [];
  if (!Array.isArray(serverState.deletedStorageZoneIds)) serverState.deletedStorageZoneIds = [];
  if (!Array.isArray(serverState.deletedInventoryCategories)) serverState.deletedInventoryCategories = [];
  if (!Array.isArray(serverState.deletedRecordIds)) serverState.deletedRecordIds = [];
  if (Array.isArray(partialState.deletedRecordIds) && partialState.deletedRecordIds.length > 0) {
    serverState.deletedRecordIds = Array.from(new Set([...serverState.deletedRecordIds, ...partialState.deletedRecordIds])).slice(-800);
    modified = true;
  }
  const deletedRecSet = new Set(serverState.deletedRecordIds);
  if (!isStaleInventoryClient && Array.isArray(partialState.deletedInventoryCategories) && partialState.deletedInventoryCategories.length > 0) {
    serverState.deletedInventoryCategories = Array.from(new Set([...serverState.deletedInventoryCategories, ...partialState.deletedInventoryCategories])).slice(-300);
    modified = true;
  }
  const deletedInvCatSet = new Set((serverState.deletedInventoryCategories || []).map((c) => String(c).toLowerCase()));
  if (!isStaleInventoryClient && Array.isArray(partialState.deletedInventoryIds) && partialState.deletedInventoryIds.length > 0) {
    serverState.deletedInventoryIds = Array.from(new Set([...serverState.deletedInventoryIds, ...partialState.deletedInventoryIds])).slice(-500);
    modified = true;
  }
  if (Array.isArray(partialState.deletedStorageZoneIds) && partialState.deletedStorageZoneIds.length > 0) {
    serverState.deletedStorageZoneIds = Array.from(new Set([...serverState.deletedStorageZoneIds, ...partialState.deletedStorageZoneIds])).slice(-300);
    modified = true;
  }
  const deletedInvSet = new Set(serverState.deletedInventoryIds);
  const deletedZoneSet = new Set(serverState.deletedStorageZoneIds);

  // Pre-collect any ticket IDs explicitly deleted or belonging to tables being newly billed/settled in this update
  if (!Array.isArray(serverState.deletedTicketIds)) {
    serverState.deletedTicketIds = [];
  }
  const incomingDeleted = Array.isArray(partialState.deletedTicketIds) ? partialState.deletedTicketIds : [];
  const autoRetiredTicketIds = [];
  if (Array.isArray(partialState.tables) && Array.isArray(serverState.tables)) {
    const currTableMap = new Map(serverState.tables.map(t => [t.id, t]));
    for (const incT of partialState.tables) {
      if (!incT || !incT.id) continue;
      const currT = currTableMap.get(incT.id);
      if (!currT) continue;
      const newlyBilled = currT.status !== 'billed' && incT.status === 'billed' && incT.isPaid;
      const newlySettledFromBilled = currT.status === 'billed' && incT.status === 'available';
      const newlySettledByTimestamp =
        (currT.status === 'occupied' || currT.status === 'billed') &&
        incT.status === 'available' &&
        incT.lastSettledAt &&
        incT.lastSettledAt >= (currT.occupiedSince || 0);
      if (newlyBilled || newlySettledFromBilled || newlySettledByTimestamp) {
        const cutoff = incT.lastSettledAt || Date.now();
        for (const tk of (serverState.tickets || [])) {
          if (tk && tk.tableId === incT.id && (!tk.timePlaced || tk.timePlaced <= cutoff + 2000)) {
            autoRetiredTicketIds.push(tk.id);
          }
        }
      }
    }
  }
  if (incomingDeleted.length > 0 || autoRetiredTicketIds.length > 0) {
    serverState.deletedTicketIds = Array.from(
      new Set([...serverState.deletedTicketIds, ...incomingDeleted, ...autoRetiredTicketIds])
    ).slice(-400);
  }
  const deletedSet = new Set(serverState.deletedTicketIds);

  for (const key of allowedKeys) {
    if (partialState[key] !== undefined) {
      if (key === 'deletedTicketIds') {
        modified = true;
      } else if (key === 'tickets') {
        const incomingTickets = Array.isArray(partialState.tickets) ? partialState.tickets : [];
        const existingTickets = Array.isArray(serverState.tickets) ? serverState.tickets : [];

        // Status hierarchy: pending -> cooking -> ready -> served
        const STATUS_RANK = { pending: 0, cooking: 1, ready: 2, served: 3 };

        const existingMap = new Map(existingTickets.filter(t => t && t.id).map(t => [t.id, t]));
        const incomingMap = new Map(incomingTickets.filter(t => t && t.id).map(t => [t.id, t]));
        // Incoming keys first so newest KOTs appear at the top of KDS/POS
        const allTicketIds = new Set([...incomingMap.keys(), ...existingMap.keys()]);
        const mergedList = [];

        for (const tId of allTicketIds) {
          // Never resurrect a ticket that has been billed, settled, or dismissed
          if (deletedSet.has(tId)) continue;

          const inc = incomingMap.get(tId);
          const ext = existingMap.get(tId);

          if (inc && ext) {
            const extRank = STATUS_RANK[ext.status] ?? 0;
            const incRank = STATUS_RANK[inc.status] ?? 0;
            let chosen = extRank > incRank ? { ...ext } : { ...inc };

            // Merge item-level ready/served states
            if (Array.isArray(ext.items) && Array.isArray(inc.items)) {
              const extItemsMap = new Map(ext.items.map(it => [it.id, it]));
              chosen.items = inc.items.map(incIt => {
                const extIt = extItemsMap.get(incIt.id);
                if (!extIt) return incIt;
                const extItRank = extIt.itemStatus ? (STATUS_RANK[extIt.itemStatus] ?? 0) : (extIt.completed ? 2 : 0);
                const incItRank = incIt.itemStatus ? (STATUS_RANK[incIt.itemStatus] ?? 0) : (incIt.completed ? 2 : 0);
                if (extItRank > incItRank) {
                  return { ...incIt, itemStatus: extIt.itemStatus, completed: extIt.completed, readyAt: extIt.readyAt };
                }
                return incIt;
              });
            }

            // Merge station-level statuses station by station
            const mergedStationStatuses = {
              ...(ext.stationStatuses || {}),
              ...(inc.stationStatuses || {})
            };
            for (const st of ['main', 'juice']) {
              const extStRank = ext.stationStatuses && ext.stationStatuses[st] ? (STATUS_RANK[ext.stationStatuses[st]] ?? 0) : -1;
              const incStRank = inc.stationStatuses && inc.stationStatuses[st] ? (STATUS_RANK[inc.stationStatuses[st]] ?? 0) : -1;
              if (extStRank >= 0 || incStRank >= 0) {
                mergedStationStatuses[st] = extStRank >= incStRank ? ext.stationStatuses[st] : inc.stationStatuses[st];
              }
            }
            chosen.stationStatuses = mergedStationStatuses;

            // Propagate stationStatuses ('served' / 'ready') down to station items so items and stations never desync
            if (Array.isArray(chosen.items)) {
              chosen.items = chosen.items.map(it => {
                const st = it?.station === 'juice' ? 'juice' : 'main';
                const stStatus = mergedStationStatuses[st];
                if (stStatus === 'served') {
                  return { ...it, completed: true, itemStatus: 'served' };
                }
                if (stStatus === 'ready' && it.itemStatus !== 'served') {
                  return { ...it, completed: true, itemStatus: 'ready', readyAt: it.readyAt || chosen.readyAt || Date.now() };
                }
                return it;
              });
            }

            const activeStVals = Object.values(mergedStationStatuses).filter(Boolean);
            if (activeStVals.length > 0) {
              if (activeStVals.every(s => s === 'served')) {
                chosen.status = 'served';
              } else if (activeStVals.every(s => s === 'ready' || s === 'served')) {
                chosen.status = 'ready';
                if (!chosen.readyAt) chosen.readyAt = ext.readyAt || inc.readyAt || Date.now();
              } else if (activeStVals.some(s => s === 'cooking' || s === 'ready' || s === 'served')) {
                chosen.status = 'cooking';
              }
            }

            if (chosen.status === 'served' && Array.isArray(chosen.items)) {
              chosen.items = chosen.items.map(it => ({ ...it, completed: true, itemStatus: 'served' }));
            }
            mergedList.push(chosen);
          } else if (inc) {
            if (inc.status === 'served' && Array.isArray(inc.items)) {
              inc.items = inc.items.map(it => ({ ...it, completed: true, itemStatus: 'served' }));
            }
            mergedList.push(inc);
          } else if (ext) {
            // Preserve active server tickets when an out-of-sync client sends a partial/older ticket list
            mergedList.push(ext);
          }
        }

        // Deduplicate tickets by order key to prevent duplicate KOT cards across client-server sync
        const seenMergedOrders = new Set();
        const deduplicatedMerged = [];
        for (const t of mergedList) {
          const orderKey = t.orderId ? `ord_${t.orderId}` : (t.orderNumber ? `num_${t.orderNumber}` : null);
          if (orderKey) {
            if (seenMergedOrders.has(orderKey)) {
              continue;
            }
            seenMergedOrders.add(orderKey);
          }
          deduplicatedMerged.push(t);
        }

        // Normalize item stations across all synced tickets (protects against older waiter APKs missing beverage stations)
        if (printerHelper && typeof printerHelper.normalizeTicketStations === 'function') {
          const autoRouteBev = isAutoRouteBeveragesEnabled();
          for (const tk of deduplicatedMerged) {
            if (tk && Array.isArray(tk.items) && tk.items.length > 0) {
              printerHelper.normalizeTicketStations(tk, serverState.menuItems || [], autoRouteBev);
            }
          }
        }

        serverState.tickets = deduplicatedMerged;

        // Auto-print newly placed incoming tickets strictly split by station (main -> Kitchen ONLY, juice -> Juice Bar ONLY)
        for (const inc of incomingTickets) {
          if (!inc || !inc.id) continue;
          if (deletedSet.has(inc.id)) continue;
          const mergedTicket = deduplicatedMerged.find((t) => t && t.id === inc.id) || inc;
          if ((mergedTicket.status === 'pending' || mergedTicket.isAddOn) && Array.isArray(mergedTicket.items) && mergedTicket.items.length > 0) {
            queueAutoPrintTicket(mergedTicket, 'auto');
          }
        }

        // Auto-synchronize online orders status with ticket cooking/ready/served state
        if (Array.isArray(serverState.onlineOrders)) {
          for (const tk of deduplicatedMerged) {
            if (!tk || (!tk.orderId && !tk.orderNumber)) continue;
            const ord = serverState.onlineOrders.find(o =>
              (tk.orderId && o.id === tk.orderId) ||
              (tk.orderNumber && o.orderNumber === tk.orderNumber)
            );
            if (!ord) continue;

            const isTicketCooking = tk.status === 'cooking' ||
              (tk.stationStatuses && (tk.stationStatuses.main === 'cooking' || tk.stationStatuses.juice === 'cooking'));
            const isTicketReady = tk.status === 'ready' ||
              (tk.stationStatuses && tk.stationStatuses.main === 'ready' && tk.stationStatuses.juice === 'ready');
            const isTicketServed = tk.status === 'served' ||
              (tk.stationStatuses && tk.stationStatuses.main === 'served' && tk.stationStatuses.juice === 'served');

            let targetStatus = null;
            if (isTicketServed && ord.status !== 'SERVED' && ord.status !== 'DELIVERED') {
              targetStatus = 'SERVED';
            } else if (isTicketReady && ord.status !== 'READY' && ord.status !== 'SERVED' && ord.status !== 'DELIVERED') {
              targetStatus = 'READY';
            } else if (isTicketCooking && ord.status === 'CONFIRMED') {
              targetStatus = 'PREPARING';
            }

            if (targetStatus && ord.status !== targetStatus) {
              ord.status = targetStatus;
              ord.updatedAt = Date.now();
              console.log(`[Sultan Hub Auto-Sync] Updated order ${ord.orderNumber} status to ${targetStatus} based on ticket ${tk.id}`);
              broadcastToClients({
                type: 'ORDER_STATUS_CHANGED',
                orderId: ord.id,
                orderNumber: ord.orderNumber,
                status: targetStatus,
                riderName: ord.riderName,
                riderPhone: ord.riderPhone,
                assignedWaiter: ord.assignedWaiter,
                timestamp: Date.now()
              });
            }
          }
        }
        modified = true;
      } else if (key === 'tables') {
        const incomingTables = (Array.isArray(partialState.tables) ? partialState.tables : []).filter(
          t => t && t.id && !deletedTableSet.has(t.id)
        );
        if (incomingTables.length > 0 || (Array.isArray(partialState.tables) && partialState.tables.length === 0 && deletedTableSet.size > 0)) {
          const currentTables = (Array.isArray(serverState.tables) ? serverState.tables : []).filter(
            t => t && t.id && !deletedTableSet.has(t.id)
          );
          const incomingMap = new Map(incomingTables.map(t => [t.id, t]));
          const activeTickets = (Array.isArray(serverState.tickets) ? serverState.tickets : []).filter(
            tk => tk && !deletedSet.has(tk.id)
          );
          // Order Taker collection: an explicit null/value from the client wins; a collection older than
          // the latest settlement (lastSettledAt) is stale and must never resurrect the cashier alert.
          const resolveWaiterPay = (curr, inc) => {
            const col = Object.prototype.hasOwnProperty.call(inc, 'waiterPaymentCollection')
              ? inc.waiterPaymentCollection
              : curr.waiterPaymentCollection;
            if (!col || col.status !== 'pending_cashier') return null;
            const settledAt = Math.max(curr.lastSettledAt || 0, inc.lastSettledAt || 0);
            if (settledAt >= (col.collectedAt || 0)) return null;
            return col;
          };

          serverState.tables = currentTables.map(curr => {
            const inc = incomingMap.get(curr.id);
            if (!inc) return curr;

            const tableTickets = activeTickets.filter(tk => tk && tk.tableId === curr.id);

            // If table has active unbilled tickets on the server, never allow an out-of-sync client to revert it to 'available'
            if (tableTickets.length > 0 && inc.status !== 'billed') {
              const ticketTotal = tableTickets.reduce(
                (sum, tk) => sum + (tk.items || []).reduce((s, it) => s + ((it.price || 0) * (it.qty || 1)), 0),
                0
              );
              const ticketOrders = tableTickets.flatMap(tk => (tk.items || []).map(i => ({ ...i })));
              const base = (inc.status === 'occupied' && (inc.occupiedSince || 0) >= (curr.occupiedSince || 0))
                ? { ...curr, ...inc }
                : { ...inc, ...curr };
              const bestOrders =
                Array.isArray(base.orders) && base.orders.length >= ticketOrders.length && base.orders.length > 0
                  ? base.orders
                  : ticketOrders;
              return {
                ...base,
                status: 'occupied',
                isPaid: false,
                occupiedSince: Math.max(curr.occupiedSince || 0, inc.occupiedSince || 0) || Date.now(),
                billTotal: Math.max(curr.billTotal || 0, inc.billTotal || 0, ticketTotal),
                orders: bestOrders,
                server: inc.server || curr.server || tableTickets[0].server,
                waiterPaymentCollection: resolveWaiterPay(curr, inc),
              };
            }

            // If no active tickets remain for this table and it had an order or is being cleared/settled, release it to 'available'
            const hasPendingWaiterPay =
              !!resolveWaiterPay(curr, inc) &&
              inc.status !== 'available';
            if (
              tableTickets.length === 0 &&
              inc.status !== 'billed' &&
              !hasPendingWaiterPay &&
              (inc.status === 'available' ||
                (curr.status === 'occupied' && ((Array.isArray(curr.orders) && curr.orders.length > 0) || (curr.billTotal || 0) > 0)))
            ) {
              return {
                ...curr,
                ...inc,
                status: 'available',
                billTotal: 0,
                orders: [],
                isPaid: false,
                server: undefined,
                lastInvoiceId: undefined,
                occupiedSince: undefined,
                waiterPaymentCollection: null,
                lastSettledAt: inc.lastSettledAt || curr.lastSettledAt || Date.now(),
              };
            }

            return { ...curr, ...inc };
          });

          // Append any newly added tables (never resurrect deleted tables)
          const existingIds = new Set(serverState.tables.map(t => t.id));
          for (const inc of incomingTables) {
            if (!existingIds.has(inc.id) && !deletedTableSet.has(inc.id)) {
              serverState.tables.push(inc);
            }
          }
          serverState.tables = serverState.tables.filter(t => t && t.id && !deletedTableSet.has(t.id));
          modified = true;
        }
      } else if (key === 'floors') {
        if (Array.isArray(partialState.floors)) {
          serverState.floors = partialState.floors.filter(f => f && f.id && !deletedFloorSet.has(f.id));
          modified = true;
        }
      } else if (key === 'deletedTableIds' || key === 'deletedFloorIds') {
        if (Array.isArray(serverState.tables) && deletedTableSet.size > 0) {
          serverState.tables = serverState.tables.filter(t => t && t.id && !deletedTableSet.has(t.id));
        }
        if (Array.isArray(serverState.floors) && deletedFloorSet.size > 0) {
          serverState.floors = serverState.floors.filter(f => f && f.id && !deletedFloorSet.has(f.id));
        }
        modified = true;
      } else if (key === 'menuItems') {
        const incoming = Array.isArray(partialState.menuItems) ? partialState.menuItems.filter(m => !isLegacyDummyDish(m)) : [];
        if (incoming.length > 0) {
          for (const m of incoming) {
            if (!m) continue;
            if (printerHelper && typeof printerHelper.resolveItemStation === 'function' && m.station !== 'juice' && m.station !== 'main') {
              m.station = printerHelper.resolveItemStation(m, INITIAL_STATE.menuItems, true);
            }
            const curImg = (m.imageUri || m.imageUrl || '').trim();
            if (typeof m.id === 'string' && m.id.startsWith('slt-') && (!curImg || curImg.toLowerCase().includes('images.unsplash.com/photo-'))) {
              m.imageUri = `/menu-images/${m.id}.jpg`;
              m.imageUrl = m.imageUri;
            } else if (!m.imageUri && m.imageUrl) {
              m.imageUri = m.imageUrl;
            }
          }
          serverState.menuItems = incoming;
          modified = true;
        }
      } else if (key === 'categories') {
        const usedCats = new Set((serverState.menuItems || []).map(m => m.category).filter(Boolean));
        serverState.categories = ['All', ...Array.from(usedCats)];
        modified = true;
      } else if (key === 'regions') {
        const incomingRegs = Array.isArray(partialState.regions) ? partialState.regions : [];
        if (incomingRegs.length > 0) {
          serverState.regions = Array.from(new Set([...(serverState.regions || []), ...incomingRegs]));
          modified = true;
        }
      } else if (key === 'systemSettings') {
        const incSettings = partialState.systemSettings;
        if (incSettings && typeof incSettings === 'object') {
          const currUpdated = (serverState.systemSettings && serverState.systemSettings.updatedAt) || 0;
          const incUpdated = typeof incSettings.updatedAt === 'number' ? incSettings.updatedAt : 0;
          if (currUpdated === 0 || incUpdated >= currUpdated) {
            serverState.systemSettings = {
              ...(serverState.systemSettings || {}),
              ...incSettings,
            };
            modified = true;
          }
        }
      } else if (key === 'roles') {
        if (Array.isArray(partialState.roles) && partialState.roles.length > 0) {
          serverState.roles = mergeServerRolesSafely(serverState.roles, partialState.roles);
          modified = true;
        }
      } else if (key === 'forceLogoutAll') {
        if (partialState.forceLogoutAll && typeof partialState.forceLogoutAll === 'object') {
          const prevTs = serverState.forceLogoutAll?.timestamp || 0;
          const nextTs = partialState.forceLogoutAll.timestamp || 0;
          if (nextTs >= prevTs) {
            serverState.forceLogoutAll = partialState.forceLogoutAll;
            modified = true;
          }
        }
      } else if (key === 'revokedSessions') {
        if (partialState.revokedSessions && typeof partialState.revokedSessions === 'object') {
          const nowR = Date.now();
          const mergedRev = {
            ...(serverState.revokedSessions || {}),
            ...partialState.revokedSessions,
          };
          for (const k of Object.keys(mergedRev)) {
            if (nowR - (mergedRev[k]?.timestamp || 0) > 60 * 60 * 1000) {
              delete mergedRev[k];
            }
          }
          serverState.revokedSessions = mergedRev;
          // Also evict any newly revoked sessionIds from activeStaffSessions
          if (Array.isArray(serverState.activeStaffSessions)) {
            serverState.activeStaffSessions = serverState.activeStaffSessions.filter(
              (s) => s && !mergedRev[s.sessionId]
            );
          }
          modified = true;
        }
      } else if (key === 'revokedDeviceIds') {
        if (partialState.revokedDeviceIds && typeof partialState.revokedDeviceIds === 'object') {
          serverState.revokedDeviceIds = {
            ...(serverState.revokedDeviceIds || {}),
            ...partialState.revokedDeviceIds,
          };
          modified = true;
        }
      } else if (key === 'activeStaffSessions') {
        if (Array.isArray(partialState.activeStaffSessions)) {
          // Safely merge active sessions so a stale client never wipes another independent user's live session
          const nowS = Date.now();
          const revokedSet = serverState.revokedSessions || {};
          const incomingRevoked = partialState.revokedSessions || {};
          const mergedBySession = new Map();
          for (const s of (serverState.activeStaffSessions || [])) {
            if (!s || !s.sessionId) continue;
            if (revokedSet[s.sessionId] || incomingRevoked[s.sessionId]) continue;
            if (nowS - (s.lastActiveTime || s.loginTime || 0) >= 24 * 60 * 60 * 1000) continue;
            mergedBySession.set(s.sessionId, s);
          }
          for (const s of partialState.activeStaffSessions) {
            if (!s || !s.sessionId) continue;
            if (revokedSet[s.sessionId] || incomingRevoked[s.sessionId]) continue;
            if (nowS - (s.lastActiveTime || s.loginTime || 0) >= 24 * 60 * 60 * 1000) continue;
            mergedBySession.set(s.sessionId, s);
          }
          // Deduplicate per deviceId (keep newest session on a given device)
          const byDevice = new Map();
          for (const s of mergedBySession.values()) {
            const prev = byDevice.get(s.deviceId);
            if (!prev || (s.loginTime || 0) >= (prev.loginTime || 0)) {
              byDevice.set(s.deviceId, s);
            }
          }
          serverState.activeStaffSessions = Array.from(byDevice.values());
          modified = true;
        }
      } else {
        const sanitized = sanitizeIncomingSeedData(key, partialState[key]);
        if (key === 'activeShiftId') {
          const validShifts = Array.isArray(serverState.shifts) ? serverState.shifts : [];
          serverState.activeShiftId = sanitized && validShifts.some(s => s && s.id === sanitized && s.status === 'open')
            ? sanitized
            : null;
        } else if (key === 'staff') {
          const incStaff = Array.isArray(sanitized) ? sanitized : [];
          const masterOnly = INITIAL_STATE.staff[0];
          const sMap = new Map();
          for (const initSt of (INITIAL_STATE.staff || [])) {
            if (initSt && initSt.id) sMap.set(initSt.id, { ...initSt });
          }
          for (const curr of (serverState.staff || [])) {
            if (curr && curr.id && (!LEGACY_DUMMY_SEED_IDS.staff.has(curr.id))) {
              sMap.set(curr.id, { ...(sMap.get(curr.id) || {}), ...curr });
            }
          }
          if (incStaff.length > 1) {
            for (const inc of incStaff) {
              if (inc && inc.id && (!LEGACY_DUMMY_SEED_IDS.staff.has(inc.id))) {
                sMap.set(inc.id, { ...(sMap.get(inc.id) || {}), ...inc });
              }
            }
          }
          if (!sMap.has('st-master') && masterOnly) {
            sMap.set('st-master', { ...masterOnly });
          }
          serverState.staff = Array.from(sMap.values());
        } else if (key === 'inventoryResetEpoch' || key === 'deletedInventoryIds' || key === 'deletedStorageZoneIds' || key === 'deletedInventoryCategories' || key === 'deletedRecordIds') {
          // Already merged into serverState sets above
        } else if (isStaleInventoryClient && (key === 'inventory' || key === 'inventoryCategories' || key === 'stockMovements' || key === 'chillerHandovers')) {
          // Ignore stale pre-reset inventory/categories/movements from older devices!
        } else if (['suppliers', 'purchaseOrders', 'supplierPayments', 'expenses', 'assets', 'damageRecords', 'recipes', 'invoices', 'customers'].includes(key)) {
          const incArr = Array.isArray(sanitized) ? sanitized : [];
          const currArr = Array.isArray(serverState[key]) ? serverState[key] : [];
          if (incArr.length === 0 && currArr.length > 0 && !currArr.every((r) => r && deletedRecSet.has(r.id))) {
            // Never allow an empty array from an unhydrated client to wipe non-empty ledgers
          } else {
            const getRecTs = (r) => Number(r?.updatedAt || r?.resolvedAt || r?.paidAt || r?.deliveryDate || r?.orderDate || r?.at || r?.createdAt || r?.timestamp || 0);
            const rMap = new Map();
            for (const c of currArr) {
              if (c && c.id && !deletedRecSet.has(c.id)) rMap.set(c.id, c);
            }
            for (const inc of incArr) {
              if (!inc || !inc.id || deletedRecSet.has(inc.id)) continue;
              const prev = rMap.get(inc.id);
              if (!prev || getRecTs(inc) >= getRecTs(prev)) {
                rMap.set(inc.id, { ...(prev || {}), ...inc });
              }
            }
            serverState[key] = Array.from(rMap.values());
          }
        } else if (key === 'inventoryCategories' || key === 'assetCategories' || key === 'expenseCategories') {
          const incCats = Array.isArray(sanitized) ? sanitized.map((c) => String(c || '').trim()).filter(Boolean) : [];
          const currCats = Array.isArray(serverState[key]) ? serverState[key].map((c) => String(c || '').trim()).filter(Boolean) : [];
          // Additive union: a client with only 9 default categories can NEVER wipe 20+ custom categories!
          const seenLower = new Set();
          const mergedCats = [];
          for (const c of [...currCats, ...incCats]) {
            const lw = c.toLowerCase();
            if (key === 'inventoryCategories' && deletedInvCatSet.has(lw)) continue;
            if (!seenLower.has(lw)) {
              seenLower.add(lw);
              mergedCats.push(c);
            }
          }
          if (mergedCats.length > 0) {
            serverState[key] = mergedCats;
          }
        } else if (key === 'inventory') {
          const incInv = Array.isArray(sanitized) ? sanitized : [];
          const currInv = Array.isArray(serverState.inventory) ? serverState.inventory : [];
          // Guard: NEVER allow an unhydrated client or empty cloud sync to wipe existing inventory!
          if (incInv.length === 0 && currInv.length > 0 && !currInv.every((i) => i && deletedInvSet.has(i.id))) {
            // Ignore empty array wipe attempt
          } else {
            const invMap = new Map();
            for (const c of currInv) {
              if (c && c.id && !deletedInvSet.has(c.id)) invMap.set(c.id, c);
            }
            for (const inc of incInv) {
              if (!inc || !inc.id || deletedInvSet.has(inc.id)) continue;
              const prev = invMap.get(inc.id);
              if (!prev || (Number(inc.updatedAt) || 0) >= (Number(prev.updatedAt) || 0)) {
                invMap.set(inc.id, { ...(prev || {}), ...inc });
              }
            }
            const nextInv = Array.from(invMap.values());
            if (currInv.length - nextInv.length >= 3) {
              try {
                if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
                fs.writeFileSync(path.join(BACKUP_DIR, 'pre-inventory-change.json'), JSON.stringify(serverState, null, 2));
              } catch (_) { }
            }
            serverState.inventory = nextInv;
          }
        } else if (key === 'storageZones') {
          const incZones = Array.isArray(sanitized) ? sanitized : [];
          const currZones = Array.isArray(serverState.storageZones) ? serverState.storageZones : [];
          if (incZones.length === 0 && currZones.length > 0 && !currZones.every((z) => z && deletedZoneSet.has(z.id))) {
            // Ignore empty array wipe attempt
          } else {
            const zMap = new Map();
            for (const c of currZones) {
              if (c && c.id && !deletedZoneSet.has(c.id)) zMap.set(c.id, c);
            }
            for (const inc of incZones) {
              if (!inc || !inc.id || deletedZoneSet.has(inc.id)) continue;
              const prev = zMap.get(inc.id);
              if (!prev || (Number(inc.updatedAt) || 0) >= (Number(prev.updatedAt) || 0)) {
                zMap.set(inc.id, { ...(prev || {}), ...inc });
              }
            }
            serverState.storageZones = Array.from(zMap.values());
          }
        } else if (key === 'stockMovements' || key === 'chillerHandovers') {
          const incList = Array.isArray(sanitized) ? sanitized : [];
          const currList = Array.isArray(serverState[key]) ? serverState[key] : [];
          if (incList.length > 0 || currList.length === 0) {
            const mMap = new Map();
            for (const c of currList) { if (c && c.id) mMap.set(c.id, c); }
            for (const inc of incList) { if (inc && inc.id) mMap.set(inc.id, inc); }
            const limit = key === 'chillerHandovers' ? 150 : 500;
            serverState[key] = Array.from(mMap.values()).sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, limit);
          }
        } else if (key === 'tableMoveLogs' || key === 'cancelledOrderLogs') {
          const isBogusSettlementCancel = (c) => {
            if (!c || c.reason !== 'Table released without billing') return false;
            const cTime = c.cancelledAt || c.timestamp || 0;
            return (serverState.invoices || []).some(
              (inv) =>
                inv &&
                (inv.tableId === c.tableId || inv.tableName === c.tableName) &&
                Math.abs((inv.timeSettled || inv.timePlaced || 0) - cTime) <= 15000
            );
          };
          const incList = Array.isArray(sanitized) ? sanitized : [];
          const currList = Array.isArray(serverState[key]) ? serverState[key] : [];
          if (incList.length > 0 || currList.length === 0) {
            const logMap = new Map();
            for (const c of currList) {
              if (c && c.id && !(key === 'cancelledOrderLogs' && isBogusSettlementCancel(c))) logMap.set(c.id, c);
            }
            for (const inc of incList) {
              if (inc && inc.id && !(key === 'cancelledOrderLogs' && isBogusSettlementCancel(inc))) logMap.set(inc.id, inc);
            }
            serverState[key] = Array.from(logMap.values())
              .sort((a, b) => (b.timestamp || b.cancelledAt || 0) - (a.timestamp || a.cancelledAt || 0))
              .slice(0, 1500);
          }
        } else if (key === 'lastTableMoveAlert' || key === 'lastOrderCancelledAlert') {
          const incAlert = sanitized;
          const currAlert = serverState[key];
          const isBogusAlert =
            key === 'lastOrderCancelledAlert' &&
            incAlert &&
            incAlert.reason === 'Table released without billing' &&
            (serverState.invoices || []).some(
              (inv) =>
                inv &&
                (inv.tableId === incAlert.tableId || inv.tableName === incAlert.tableName) &&
                Math.abs((inv.timeSettled || inv.timePlaced || 0) - (incAlert.time || 0)) <= 15000
            );
          if (!incAlert || isBogusAlert) {
            if (isBogusAlert) {
              serverState[key] = null;
            } else if (currAlert && Date.now() - (currAlert.time || 0) > 60000) {
              // Keep live Cashier alerts broadcastable for 60s so concurrent updates from other terminals never swallow them
              serverState[key] = null;
            }
          } else if (!currAlert || (incAlert.time || 0) >= (currAlert.time || 0)) {
            serverState[key] = incAlert;
          }
        } else if (
          Array.isArray(sanitized) &&
          sanitized.length === 0 &&
          Array.isArray(serverState[key]) &&
          serverState[key].length > 0 &&
          ['suppliers', 'purchaseOrders', 'supplierPayments', 'expenses', 'assets', 'damageRecords', 'recipes', 'shifts', 'invoices', 'customers', 'kitchenSessions', 'kitchenConsumption', 'attendance', 'salaryPayments'].includes(key)
        ) {
          // Guard: NEVER allow an unhydrated client sending [] to wipe non-empty operational ledgers!
        } else {
          serverState[key] = sanitized;
        }
        modified = true;
      }
    }
  }

  if (modified) {
    // Reconcile tables with active tickets so any table whose tickets were all removed is released to 'available'
    const activeTicketByTable = new Set((serverState.tickets || []).map(tk => tk && tk.tableId).filter(Boolean));
    if (Array.isArray(serverState.tables)) {
      const nowRec = Date.now();
      // Waiter collections that the cashier has already turned into an invoice are finished — find their settle time
      const receivedWaiterPayAt = (t) => {
        const col = t.waiterPaymentCollection;
        if (!col || col.status !== 'pending_cashier') return 0;
        const inv = (serverState.invoices || []).find(i =>
          i && (
            (i.waiterPayId && i.waiterPayId === col.id) ||
            (!i.waiterPayId && i.tableId === t.id &&
              typeof i.notes === 'string' && i.notes.startsWith('Collected by Order Taker') &&
              (i.timeSettled || i.timePlaced || 0) >= (col.collectedAt || 0))
          )
        );
        return inv ? (inv.timeSettled || inv.timePlaced || nowRec) : 0;
      };
      serverState.tables = serverState.tables.map(t => {
        const receivedAt = receivedWaiterPayAt(t);
        if (receivedAt && !activeTicketByTable.has(t.id)) {
          return {
            ...t,
            status: 'available',
            billTotal: 0,
            orders: [],
            server: undefined,
            isPaid: false,
            lastInvoiceId: undefined,
            occupiedSince: undefined,
            waiterPaymentCollection: null,
            lastSettledAt: Math.max(t.lastSettledAt || 0, receivedAt),
          };
        }
        if (receivedAt) {
          return { ...t, waiterPaymentCollection: null, lastSettledAt: Math.max(t.lastSettledAt || 0, receivedAt) };
        }
        if (t.status === 'occupied' && !activeTicketByTable.has(t.id) && !t.mergedInto && !(t.waiterPaymentCollection?.status === 'pending_cashier' && (t.lastSettledAt || 0) < (t.waiterPaymentCollection.collectedAt || 0))) {
          return {
            ...t,
            status: 'available',
            billTotal: 0,
            orders: [],
            server: undefined,
            isPaid: false,
            lastInvoiceId: undefined,
            occupiedSince: undefined,
            waiterPaymentCollection: null,
            lastSettledAt: t.lastSettledAt || nowRec,
          };
        }
        return t;
      });
    }

    const nextFingerprint = computeStateFingerprint(serverState);
    if (nextFingerprint === prevFingerprint) {
      return;
    }
    lastStateFingerprint = nextFingerprint;
    serverState.lastUpdated = Date.now();
    persistState();
    console.log(`[Sultan Hub] Synced state update from ${senderId || 'CLIENT'} (tickets: ${(serverState.tickets || []).length}, active ws: ${wss.clients.size})`);
    if (
      (partialState.revokedSessions && Object.keys(partialState.revokedSessions).length > 0) ||
      (partialState.revokedDeviceIds && Object.keys(partialState.revokedDeviceIds).length > 0)
    ) {
      broadcastToClients({
        type: 'FORCE_LOGOUT_DEVICE',
        revokedSessions: serverState.revokedSessions || {},
        revokedDeviceIds: serverState.revokedDeviceIds || {},
        activeStaffSessions: serverState.activeStaffSessions || [],
        timestamp: Date.now()
      });
    }
    broadcastToClients({
      type: 'SERVER_BROADCAST',
      state: serverState,
      senderId: senderId || 'SERVER',
      timestamp: serverState.lastUpdated
    }, originWs);
    pushToFirestoreCloud();
  }
}

// ==============================================================
// BIDIRECTIONAL CLOUD FIRESTORE BRIDGE
// ==============================================================
// Never allow developer workstation ("Nizaam Digital Sol") to overwrite live Restaurant Cloud Firestore!
const IS_DEV_WORKSTATION = process.env.SULTAN_DISABLE_CLOUD_SYNC === '1';
const FIRESTORE_API_KEY = "AIzaSyAzsBG5kc0gFf83DJaluvF42sk_m-9JdAU";
const FIRESTORE_PROJECT_ID = "sultan-resturant";
const FIRESTORE_DOC_URL = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents/sultan_restaurant/live_state?key=${FIRESTORE_API_KEY}`;

let lastProcessedCloudTimestamp = 0;
let lastProcessedCloudUpdateTime = '';
let isPushingToFirestore = false;
let isApplyingCloudUpdate = false;
let firestorePushTimer = null;
let lastFirestorePushTime = 0;
const FIRESTORE_PUSH_INTERVAL = 90 * 1000; // 90 seconds (1.5 minutes) batch interval

function decodeFirestoreValue(val) {
  if (!val || typeof val !== 'object') return val;
  if ('stringValue' in val) return val.stringValue;
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('booleanValue' in val) return val.booleanValue;
  if ('nullValue' in val) return null;
  if ('mapValue' in val) {
    const fields = val.mapValue.fields || {};
    const res = {};
    for (const k in fields) res[k] = decodeFirestoreValue(fields[k]);
    return res;
  }
  if ('arrayValue' in val) {
    const values = val.arrayValue.values || [];
    return values.map(decodeFirestoreValue);
  }
  return val;
}

function encodeFirestoreValue(val) {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'string') return { stringValue: val };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    if (Number.isInteger(val)) return { integerValue: val.toString() };
    return { doubleValue: val };
  }
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map(encodeFirestoreValue) } };
  }
  if (typeof val === 'object') {
    const fields = {};
    for (const k in val) {
      if (val[k] !== undefined) fields[k] = encodeFirestoreValue(val[k]);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

function pushToFirestoreCloud(forceImmediate = false) {
  if (IS_DEV_WORKSTATION || isApplyingCloudUpdate) return;
  const now = Date.now();
  // If not forced and recently pushed within the interval, debounce to the next interval window
  if (!forceImmediate && now - lastFirestorePushTime < FIRESTORE_PUSH_INTERVAL) {
    if (!firestorePushTimer) {
      const delay = FIRESTORE_PUSH_INTERVAL - (now - lastFirestorePushTime);
      firestorePushTimer = setTimeout(() => {
        firestorePushTimer = null;
        pushToFirestoreCloud(true);
      }, delay);
    }
    return;
  }

  if (firestorePushTimer) {
    clearTimeout(firestorePushTimer);
    firestorePushTimer = null;
  }

  firestorePushTimer = setTimeout(async () => {
    if (isPushingToFirestore) return;
    isPushingToFirestore = true;
    lastFirestorePushTime = Date.now();
    try {
      const now = Date.now();
      lastProcessedCloudTimestamp = now;
      const payload = {
        type: 'SERVER_BROADCAST',
        senderId: 'SERVER_POS_HUB',
        timestamp: now,
        state: {
          tables: serverState.tables,
          deletedTableIds: serverState.deletedTableIds || [],
          deletedFloorIds: serverState.deletedFloorIds || [],
          floors: serverState.floors || [],
          tickets: serverState.tickets,
          deletedTicketIds: serverState.deletedTicketIds || [],
          invoices: serverState.invoices || [],
          customers: serverState.customers || [],
          reservations: serverState.reservations || [],
          attendance: serverState.attendance || [],
          salaryPayments: serverState.salaryPayments || [],
          feedbacks: serverState.feedbacks || [],
          salesReturns: serverState.salesReturns || [],
          serviceRequests: serverState.serviceRequests || [],
          inventory: serverState.inventory || [],
          storageZones: serverState.storageZones || [],
          inventoryResetEpoch: serverState.inventoryResetEpoch || 0,
          deletedInventoryIds: serverState.deletedInventoryIds || [],
          deletedStorageZoneIds: serverState.deletedStorageZoneIds || [],
          deletedInventoryCategories: serverState.deletedInventoryCategories || [],
          deletedRecordIds: serverState.deletedRecordIds || [],
          inventoryCategories: serverState.inventoryCategories || [],
          assetCategories: serverState.assetCategories || [],
          expenseCategories: serverState.expenseCategories || [],
          stockMovements: serverState.stockMovements || [],
          chillerHandovers: serverState.chillerHandovers || [],
          expenses: serverState.expenses || [],
          suppliers: serverState.suppliers || [],
          purchaseOrders: serverState.purchaseOrders || [],
          supplierPayments: serverState.supplierPayments || [],
          assets: serverState.assets || [],
          damageRecords: serverState.damageRecords || [],
          recipes: serverState.recipes || [],
          kitchenSessions: serverState.kitchenSessions || [],
          kitchenConsumption: serverState.kitchenConsumption || [],
          kitchenManualUsage: serverState.kitchenManualUsage || [],
          kitchenCash: serverState.kitchenCash || [],
          menuItems: serverState.menuItems,
          categories: serverState.categories,
          staff: serverState.staff,
          onlineOrders: serverState.onlineOrders,
          pendingFloorOrderAlert: serverState.pendingFloorOrderAlert,
          lastBillPaidAlert: serverState.lastBillPaidAlert,
          lastFoodReadyAlert: serverState.lastFoodReadyAlert,
          roles: serverState.roles,
          shifts: serverState.shifts,
          activeShiftId: serverState.activeShiftId,
          systemSettings: serverState.systemSettings,
        }
      };
      const fields = {};
      for (const k in payload) {
        fields[k] = encodeFirestoreValue(payload[k]);
      }
      await fetch(FIRESTORE_DOC_URL, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields })
      });
    } catch (_) {
      // Local LAN continues seamlessly if cloud is offline
    } finally {
      isPushingToFirestore = false;
    }
  }, 1500);
}

// Start Cloud Firestore bridge pulse with rate-limiting & exponential backoff on 429
let firestorePollInterval = 60000; // poll every 60s instead of 2.5s (reduces reads by 96%)
let firestoreBackoffUntil = 0;

let hasInitialFirestorePollCompleted = false;
async function pollFirestoreCloud() {
  if (IS_DEV_WORKSTATION || isPushingToFirestore) return;
  if (Date.now() < firestoreBackoffUntil) return;
  try {
    const res = await fetch(FIRESTORE_DOC_URL);
    if (res.status === 429) {
      // Quota exceeded: back off for 15 minutes before retrying
      firestoreBackoffUntil = Date.now() + 15 * 60 * 1000;
      return;
    }
    if (!res.ok) return;
    const doc = await res.json();
    if (doc.updateTime && doc.updateTime === lastProcessedCloudUpdateTime) return;
    const fields = doc.fields || {};
    const senderId = fields.senderId?.stringValue;
    if (hasInitialFirestorePollCompleted && senderId === 'SERVER_POS_HUB') return;
    const timestamp = Number(fields.timestamp?.integerValue || 0);
    if (timestamp && timestamp === lastProcessedCloudTimestamp) return;
    if (hasInitialFirestorePollCompleted && timestamp && serverState.lastUpdated && timestamp < serverState.lastUpdated) return;

    if (fields.state?.mapValue?.fields) {
      const decodedState = decodeFirestoreValue(fields.state);
      if (decodedState && typeof decodedState === 'object') {
        isApplyingCloudUpdate = true;
        lastProcessedCloudTimestamp = timestamp || Date.now();
        if (doc.updateTime) lastProcessedCloudUpdateTime = doc.updateTime;
        applyStateUpdate(decodedState, senderId);
        setTimeout(() => { isApplyingCloudUpdate = false; }, 300);
      }
    }
  } catch (_) {
    // Network retry next pulse
  } finally {
    hasInitialFirestorePollCompleted = true;
  }
}

// Poll Cloud Firestore FIRST before pushing so a newly started/dev server merges live categories & items instead of overwriting them!
pollFirestoreCloud().finally(() => {
  setTimeout(() => pushToFirestoreCloud(true), 500);
  setInterval(pollFirestoreCloud, firestorePollInterval);
});

wss.on('connection', (ws, req) => {
  const remoteIp = req.socket.remoteAddress;
  console.log(`[Sultan Hub] New device connected from ${remoteIp}. Total devices: ${wss.clients.size}`);

  ws.send(JSON.stringify({
    type: 'INIT_STATE',
    state: serverState,
    senderId: 'SERVER',
    timestamp: Date.now()
  }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      if (data.type === 'CLIENT_UPDATE' && data.state) {
        const ticketCount = Array.isArray(data.state.tickets) ? data.state.tickets.length : '?';
        console.log(`[Sultan Hub] WS CLIENT_UPDATE from ${data.senderId || 'CLIENT'} tickets=${ticketCount}`);
        if (!hasProcessedServerPacket(data.packetId)) {
          applyStateUpdate(data.state, data.senderId, ws);
        }
      } else if (data.type === 'PING') {
        ws.send(JSON.stringify({ type: 'PONG', timestamp: Date.now() }));
      }
    } catch (e) {
      console.error('[Sultan Hub] Bad WS message:', e.message);
    }
  });

  ws.on('close', () => {
    console.log(`[Sultan Hub] Device disconnected. Total active: ${wss.clients.size}`);
  });

  ws.on('error', (err) => {
    console.error('[Sultan Hub] WS socket error:', err.message);
  });
});

function listenDualStack(srv, port, onSuccess, onError) {
  if (!srv) return;
  srv.on('error', (err) => {
    if (onError) onError(err);
  });
  try {
    srv.listen({ port: Number(port), host: '::', ipv6Only: false }, onSuccess);
  } catch (_) {
    srv.listen(Number(port), '0.0.0.0', onSuccess);
  }
}

listenDualStack(
  server,
  PORT,
  () => {
    console.log(`=================================================`);
    console.log(`SULTAN RESTAURANT CENTRAL POS & API HUB ONLINE`);
    console.log(`Port: ${PORT} (Dual-Stack IPv4 0.0.0.0 + IPv6 ::)`);
    console.log(`Auth API: http://localhost:${PORT}/api/auth/login`);
    console.log(`Admin Users API: http://localhost:${PORT}/api/admin/app-users`);
    console.log(`Public Menu: http://localhost:${PORT}/api/public/menu`);
    console.log(`Online Orders: http://localhost:${PORT}/api/public/orders`);
    console.log(`WebSocket URL: ws://localhost:${PORT}`);
    console.log(`=================================================`);
  },
  (err) => {
    console.log(`[Sultan Hub] Port ${PORT} listener:`, err.message);
  }
);

listenDualStack(
  server5000,
  5000,
  () => {
    console.log(`Sultan POS Hub also active on Port 5000 (Firewall-Friendly LAN Range)`);
  },
  (err) => {
    console.log('[Sultan Hub] Port 5000 listener:', err.message);
  }
);

if (server80) {
  listenDualStack(
    server80,
    80,
    () => {
      console.log(`Sultan POS Hub also active on Port 80 (Standard WWW HTTP)`);
    },
    (err) => {
      console.log('[Sultan Hub] Port 80 listener:', err.message);
    }
  );
}
