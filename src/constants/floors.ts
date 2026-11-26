import type { Ionicons } from '@expo/vector-icons';

type IconName = keyof typeof Ionicons.glyphMap;

export type SeatingZoneType = 'tables' | 'couches' | 'majlis';

export interface SeatingZoneMeta {
  type: SeatingZoneType;
  label: string; // "Tables", "Sofas", "Majlis Sitting"
  unitLabel: string; // "Table", "Sofa", "Cabin"
  pluralUnitLabel: string; // "Tables", "Sofas", "Cabins"
  prefix: string; // "T", "S", "Cabin"
  defaultSeats: number;
  color: string;
  description: string;
}

export const SEATING_ZONES: Record<SeatingZoneType, SeatingZoneMeta> = {
  tables: {
    type: 'tables',
    label: 'Tables',
    unitLabel: 'Table',
    pluralUnitLabel: 'Tables',
    prefix: 'T',
    defaultSeats: 4,
    color: '#1976D2',
    description: 'Standard dining tables with chairs',
  },
  couches: {
    type: 'couches',
    label: 'Sofas',
    unitLabel: 'Sofa',
    pluralUnitLabel: 'Sofas',
    prefix: 'S',
    defaultSeats: 6,
    color: '#E65100',
    description: 'Comfortable sofa & lounge seating',
  },
  majlis: {
    type: 'majlis',
    label: 'Majlis Sitting',
    unitLabel: 'Cabin',
    pluralUnitLabel: 'Cabins',
    prefix: 'Cabin',
    defaultSeats: 8,
    color: '#4a121a', // Sultan Burgundy
    description: 'Traditional Arabian floor-seating private cabins',
  },
};

export const SEATING_ZONE_TYPES: SeatingZoneType[] = ['tables', 'couches', 'majlis'];

export type FloorTemplate = {
  /** Zone/Floor name */
  zone: string;
  /** Short badge text, e.g. "GF". */
  short: string;
  /** Prefix used for generated table names, e.g. "F1" -> F1-01. */
  prefix: string;
  icon: IconName;
  color: string;
  blurb: string;
  /** One entry per table = number of seats. */
  seats: number[];
  /** Default zone distribution for template */
  zones?: {
    tables?: number[];
    couches?: number[];
    majlis?: number[]; // list of cabin capacities
  };
};

/** Sultan Restaurant active floors. Order here = default display order everywhere. */
export const FLOOR_TEMPLATE: FloorTemplate[] = [
  {
    zone: 'Ground Floor',
    short: 'GF',
    prefix: 'G',
    icon: 'restaurant-outline',
    color: '#2E7D32',
    blurb: 'Family dining hall, VIP Sofas & Majlis Cabins',
    seats: [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 6, 6, 6, 6, 6, 6],
    zones: {
      couches: [4, 4, 4, 4, 4],
      tables: [4, 4, 4, 4, 4],
      majlis: [6, 6, 6, 6, 6, 6],
    },
  },
  {
    zone: 'Rooftop',
    short: 'RT',
    prefix: 'R',
    icon: 'moon-outline',
    color: '#E65100',
    blurb: 'Open-air BBQ, Dining Tables & Sky Majlis',
    seats: [6, 6, 6, 6, 6, 10, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
    zones: {
      majlis: [6, 6, 6, 6, 6, 10],
      tables: [4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
    },
  },
  {
    zone: 'Family Floor',
    short: 'FA',
    prefix: 'F',
    icon: 'people-outline',
    color: '#1976D2',
    blurb: 'Family hall, Sofas, 2-Seater Tables & Traditional Majlis',
    seats: [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 2, 2, 2, 2, 2, 2, 2, 6, 6, 6, 6, 6, 6, 6, 6],
    zones: {
      couches: [4, 4, 4, 4, 4],
      tables: [4, 4, 4, 4, 4, 2, 2, 2, 2, 2, 2, 2],
      majlis: [6, 6, 6, 6, 6, 6, 6, 6],
    },
  },
  {
    zone: 'Party Hall',
    short: 'PA',
    prefix: 'P',
    icon: 'sparkles-outline',
    color: '#6A1B9A',
    blurb: 'Banquet & Party Hall dining tables',
    seats: [4, 4, 4, 4, 4, 4],
    zones: {
      tables: [4, 4, 4, 4, 4, 4],
    },
  },
];

export const FLOOR_ORDER: string[] = FLOOR_TEMPLATE.map((f) => f.zone);

const FALLBACK_META = {
  short: '--',
  icon: 'business-outline' as IconName,
  color: '#546E7A',
  blurb: 'Custom floor',
};

export function getFloorMeta(
  zone: string,
  dynamicFloors?: { name: string; shortCode?: string; color?: string; icon?: string; description?: string; prefix?: string }[]
) {
  if (dynamicFloors && dynamicFloors.length > 0) {
    const foundDyn = dynamicFloors.find((f) => f.name.toLowerCase() === (zone || '').toLowerCase());
    if (foundDyn) {
      return {
        zone: foundDyn.name,
        short: foundDyn.shortCode || foundDyn.name.slice(0, 2).toUpperCase(),
        prefix: foundDyn.prefix || foundDyn.shortCode || foundDyn.name.slice(0, 2).toUpperCase(),
        icon: (foundDyn.icon || 'business-outline') as IconName,
        color: foundDyn.color || '#546E7A',
        blurb: foundDyn.description || 'Configured floor',
      };
    }
  }
  const found = FLOOR_TEMPLATE.find((f) => f.zone.toLowerCase() === (zone || '').toLowerCase());
  if (found) return found;
  return { ...FALLBACK_META, zone, short: (zone || '').slice(0, 2).toUpperCase() };
}

/** Known floors first, then any custom zones alphabetically. */
export function sortFloors(names: string[], knownOrder?: string[]): string[] {
  const unique = Array.from(new Set(names.filter(Boolean)));
  const order = knownOrder && knownOrder.length > 0 ? knownOrder : FLOOR_ORDER;
  const known = order.filter((n) => unique.some((u) => u.toLowerCase() === n.toLowerCase()));
  const rest = unique.filter((n) => !order.some((o) => o.toLowerCase() === n.toLowerCase())).sort((a, b) => a.localeCompare(b));
  return [...known, ...rest];
}

export const TEMPLATE_TABLE_COUNT = FLOOR_TEMPLATE.reduce((sum, f) => sum + f.seats.length, 0);

/**
 * Extracts or infers floor for a table.
 */
export function getTableFloor(t: { floor?: string; zone?: string; name?: string }): string {
  if (t.floor) return t.floor;
  const z = (t.zone || '').trim();
  const directMatch = FLOOR_ORDER.find((f) => f.toLowerCase() === z.toLowerCase());
  if (directMatch) return directMatch;
  if (z.toLowerCase().includes('ground')) return 'Ground Floor';
  if (z.toLowerCase().includes('family') || z.toLowerCase().includes('1st') || z.toLowerCase().includes('first')) return 'Family Floor';
  if (z.toLowerCase().includes('party') || z.toLowerCase().includes('banquet') || z.toLowerCase().includes('2nd')) return 'Party Hall';
  if (z.toLowerCase().includes('rooftop')) return 'Rooftop';

  const name = (t.name || '').trim().toUpperCase();
  if (name.startsWith('G-') || name.startsWith('GM-') || name.startsWith('G0') || name.startsWith('G1')) return 'Ground Floor';
  if (name.startsWith('F-') || name.startsWith('FM-') || name.startsWith('FC-') || name.startsWith('F1') || name.startsWith('FA')) return 'Family Floor';
  if (name.startsWith('P-') || name.startsWith('PA')) return 'Party Hall';
  if (name.startsWith('R-') || name.startsWith('RM-') || name.startsWith('RT') || /^R\d/.test(name)) return 'Rooftop';
  if (z) return z;
  return 'Ground Floor';
}

/**
 * Extracts or infers seating zone type for a table:
 * 'tables' | 'couches' | 'majlis'
 */
export function getTableSeatingType(t: { seatingType?: SeatingZoneType; name?: string; zone?: string }): SeatingZoneType {
  if (t.seatingType && (t.seatingType === 'tables' || t.seatingType === 'couches' || t.seatingType === 'majlis')) {
    return t.seatingType;
  }
  const name = (t.name || '').toLowerCase();
  const zone = (t.zone || '').toLowerCase();
  if (
    name.includes('cabin') ||
    name.startsWith('mc') ||
    name.startsWith('m-') ||
    zone.includes('majlis') ||
    zone.includes('cabin')
  ) {
    return 'majlis';
  }
  if (
    name.includes('couch') ||
    name.includes('sofa') ||
    name.startsWith('c-') ||
    zone.includes('couch') ||
    zone.includes('sofa')
  ) {
    return 'couches';
  }
  return 'tables';
}
