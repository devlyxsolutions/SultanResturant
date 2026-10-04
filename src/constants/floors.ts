import type { Ionicons } from '@expo/vector-icons';

type IconName = keyof typeof Ionicons.glyphMap;

export type FloorTemplate = {
  /** Zone name stored on every Table (`table.zone`). */
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
};

/** Sultan Restaurant runs 5 floors. Order here = display order everywhere. */
export const FLOOR_TEMPLATE: FloorTemplate[] = [
  {
    zone: 'Ground Floor',
    short: 'GF',
    prefix: 'G',
    icon: 'restaurant-outline',
    color: '#2E7D32',
    blurb: 'Family dining hall & takeaway counter',
    seats: [4, 4, 4, 4, 6, 6, 2, 2, 8, 4],
  },
  {
    zone: '1st Floor',
    short: '1F',
    prefix: 'F1',
    icon: 'people-outline',
    color: '#1976D2',
    blurb: 'Family hall',
    seats: [4, 4, 4, 4, 6, 6, 6, 8, 2, 2],
  },
  {
    zone: '2nd Floor',
    short: '2F',
    prefix: 'F2',
    icon: 'sparkles-outline',
    color: '#6A1B9A',
    blurb: 'Banquet & events hall',
    seats: [10, 10, 12, 12, 8, 8, 6, 6],
  },
  {
    zone: '3rd Floor',
    short: '3F',
    prefix: 'F3',
    icon: 'diamond-outline',
    color: '#B8860B',
    blurb: 'VIP lounges & private rooms',
    seats: [6, 8, 8, 10, 12, 6],
  },
  {
    zone: 'Rooftop',
    short: 'RT',
    prefix: 'R',
    icon: 'moon-outline',
    color: '#E65100',
    blurb: 'Open-air BBQ & night seating',
    seats: [4, 4, 4, 6, 6, 2, 2, 8, 4, 4],
  },
];

export const FLOOR_ORDER: string[] = FLOOR_TEMPLATE.map((f) => f.zone);

const FALLBACK_META = {
  short: '--',
  icon: 'business-outline' as IconName,
  color: '#546E7A',
  blurb: 'Custom zone',
};

export function getFloorMeta(zone: string) {
  const found = FLOOR_TEMPLATE.find((f) => f.zone === zone);
  if (found) return found;
  return { ...FALLBACK_META, zone, short: zone.slice(0, 2).toUpperCase() };
}

/** Known floors first (Ground -> Rooftop), then any custom zones alphabetically. */
export function sortFloors(names: string[]): string[] {
  const unique = Array.from(new Set(names.filter(Boolean)));
  const known = FLOOR_ORDER.filter((n) => unique.includes(n));
  const rest = unique.filter((n) => !FLOOR_ORDER.includes(n)).sort((a, b) => a.localeCompare(b));
  return [...known, ...rest];
}

export const TEMPLATE_TABLE_COUNT = FLOOR_TEMPLATE.reduce((sum, f) => sum + f.seats.length, 0);
