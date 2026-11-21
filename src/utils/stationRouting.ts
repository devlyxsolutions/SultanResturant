export type StationType = 'main' | 'juice';

/**
 * Canonical Juice Bar / Beverage categories.
 * Any menu item in these categories (or with region 'Beverages' / explicit station 'juice')
 * routes strictly to the Juice Bar KDS & Juice Bar Thermal Printer — NEVER the Kitchen Printer.
 */
export const JUICE_BAR_CATEGORIES = new Set<string>([
  'hot coffee & tea',
  'ice coffee',
  'mocktail',
  'mocktails',
  'ice cream',
  'cold drinks & water',
  'cold drinks',
  'drinks',
  'beverages',
  'juice',
  'juices',
  'juice bar',
  'shakes',
  'milkshakes',
  'smoothies',
  'tea & coffee',
  'coffee',
  'tea',
]);

export function resolveItemStation(
  item: {
    id?: string;
    name?: string;
    station?: string;
    category?: string;
    region?: string;
  } | null | undefined,
  autoRouteBeverages: boolean = true
): StationType {
  if (!autoRouteBeverages) return 'main';
  if (!item) return 'main';

  if (item.station === 'juice') return 'juice';
  if (item.station === 'main') return 'main';

  const cat = String(item.category || '').trim().toLowerCase();
  if (cat && JUICE_BAR_CATEGORIES.has(cat)) {
    return 'juice';
  }

  const reg = String(item.region || '').trim().toLowerCase();
  if (reg === 'beverages' || reg === 'juice bar' || reg === 'drinks') {
    return 'juice';
  }

  return 'main';
}

export function resolveMenuCatalogStation(
  ticketItem: { id?: string; name?: string; station?: string; category?: string; region?: string },
  menuItems?: { id?: string; name?: string; station?: string; category?: string; region?: string }[],
  autoRouteBeverages: boolean = true
): StationType {
  if (!autoRouteBeverages) return 'main';
  if (!ticketItem) return 'main';

  if (ticketItem.station === 'juice') return 'juice';

  // Check menu catalog match (handles variant suffixes like "Ice Cream Shake (Mango)" or id "slt-crm-shake-Mango")
  if (Array.isArray(menuItems) && menuItems.length > 0) {
    const rawId = String(ticketItem.id || '').trim();
    const rawName = String(ticketItem.name || '').trim().toLowerCase();
    const baseName = rawName.includes('(') ? rawName.split('(')[0].trim() : rawName;

    const matched = menuItems.find((m) => {
      if (!m) return false;
      if (rawId && m.id && (m.id === rawId || rawId.startsWith(`${m.id}-`))) return true;
      const mName = String(m.name || '').trim().toLowerCase();
      if (mName && (mName === rawName || mName === baseName)) return true;
      return false;
    });

    if (matched) {
      return resolveItemStation(matched, autoRouteBeverages);
    }
  }

  return resolveItemStation(ticketItem, autoRouteBeverages);
}
