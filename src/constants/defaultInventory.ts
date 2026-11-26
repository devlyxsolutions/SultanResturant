import type { InventoryItem } from '../store/opsStore';

/**
 * Official Sultan Restaurant Inventory Categories (19 Categories)
 * Source: Sultan Restaurant Master Categories & Inventory Sheet
 */
export const SULTAN_INVENTORY_CATEGORIES = [
  'Spices',
  'Baking',
  'Dairy',
  'Sauces',
  'Beverage',
  'Packaging',
  'Dry Fruits & Nuts',
  'Snacks & Biscuits',
  'Vegetable',
  'Grocery',
  'Pulses & Lentils',
  'Meat & Poultry',
  'Sea Food',
  'Canned & Preserved',
  'Pasta',
  'Stationary',
  'Housekeeping',
  'Ghee & Oil',
  'Flour & Grains',
] as const;

type RawSheetItem = {
  sr: number;
  category: (typeof SULTAN_INVENTORY_CATEGORIES)[number];
  name: string;
  packSize?: string;
  stock: number;
  unit: string;
  costPerUnit?: number;
  sheetPriceNote?: string;
};

const CATEGORY_SKU_PREFIX: Record<string, string> = {
  Spices: 'SP',
  Baking: 'BK',
  Dairy: 'DA',
  Sauces: 'SA',
  Beverage: 'BV',
  Packaging: 'PK',
  'Dry Fruits & Nuts': 'DF',
  'Snacks & Biscuits': 'SB',
  Vegetable: 'VG',
  Grocery: 'GR',
  'Pulses & Lentils': 'PL',
  'Meat & Poultry': 'MP',
  'Sea Food': 'SF',
  'Canned & Preserved': 'CP',
  Pasta: 'PA',
  Stationary: 'ST',
  Housekeeping: 'HK',
  'Ghee & Oil': 'GO',
  'Flour & Grains': 'FG',
};

const CATEGORY_DEFAULT_LOCATION: Record<string, string> = {
  Spices: 'Spice & Masala Rack',
  Baking: 'Dry Ration Store - Shelf B',
  Dairy: 'Walk-in Chiller',
  Sauces: 'Dry Ration Store - Shelf B',
  Beverage: 'Beverage Cold Room',
  Packaging: 'Packaging Store',
  'Dry Fruits & Nuts': 'Dry Ration Store - Shelf A',
  'Snacks & Biscuits': 'Dry Ration Store - Shelf B',
  Vegetable: 'Walk-in Chiller',
  Grocery: 'Dry Ration Store - Shelf A',
  'Pulses & Lentils': 'Dry Ration Store - Shelf A',
  'Meat & Poultry': 'Deep Freezer #1 (Meat)',
  'Sea Food': 'Deep Freezer #2 (Poultry)',
  'Canned & Preserved': 'Dry Ration Store - Shelf B',
  Pasta: 'Dry Ration Store - Shelf B',
  Stationary: 'Main Central Store',
  Housekeeping: 'Main Central Store',
  'Ghee & Oil': 'Dry Ration Store - Shelf A',
  'Flour & Grains': 'Dry Ration Store - Shelf A',
};

const RAW_SULTAN_INVENTORY_SHEET: RawSheetItem[] = [
  // 1 - 18: Spices
  { sr: 1, category: 'Spices', name: 'Salt', stock: 20, unit: 'kg', costPerUnit: 52.5, sheetPriceNote: 'Sheet Total: Rs. 1,050' },
  { sr: 2, category: 'Spices', name: 'White Zeera', stock: 10, unit: 'kg' },
  { sr: 3, category: 'Spices', name: 'Sund', stock: 2, unit: 'kg' },
  { sr: 4, category: 'Spices', name: 'Kasoori Methi', stock: 3, unit: 'kg' },
  { sr: 5, category: 'Spices', name: 'Moti Elachi (Black Cardamom)', stock: 5, unit: 'kg' },
  { sr: 6, category: 'Spices', name: 'Coriander (Dhania)', stock: 7, unit: 'kg' },
  { sr: 7, category: 'Spices', name: 'Turmeric Powder', stock: 5, unit: 'kg' },
  { sr: 8, category: 'Spices', name: 'Badyan', stock: 5, unit: 'kg' },
  { sr: 9, category: 'Spices', name: 'Mug', stock: 2, unit: 'kg' },
  { sr: 10, category: 'Spices', name: 'Black Kiran', stock: 3, unit: 'kg' },
  { sr: 11, category: 'Spices', name: 'Bay Leave', stock: 2, unit: 'kg' },
  { sr: 12, category: 'Spices', name: 'Jaifal (Nutmeg)', stock: 3, unit: 'kg' },
  { sr: 13, category: 'Spices', name: 'Kalvanji (Black Seed)', stock: 5, unit: 'kg' },
  { sr: 14, category: 'Spices', name: 'Kachri Powder', stock: 10, unit: 'kg' },
  { sr: 15, category: 'Spices', name: 'Ajwain', stock: 1, unit: 'kg', costPerUnit: 400, sheetPriceNote: 'Sheet: Rs. 400' },
  { sr: 16, category: 'Spices', name: 'Black Salt', stock: 10, unit: 'kg', costPerUnit: 55, sheetPriceNote: 'Sheet Total: Rs. 550' },
  { sr: 17, category: 'Spices', name: 'Imli', stock: 5, unit: 'kg', costPerUnit: 380, sheetPriceNote: 'Sheet Total: Rs. 1,900' },
  { sr: 18, category: 'Spices', name: 'Oregano', packSize: '500 gram', stock: 2, unit: 'pcs' },

  // 19 - 24: Canned & Preserved (Sheet: Canned Goods)
  { sr: 19, category: 'Canned & Preserved', name: 'Kolly Fruit Cocktail', packSize: '1 kg', stock: 18, unit: 'kg' },
  { sr: 20, category: 'Canned & Preserved', name: 'Dechoice Jalapeno', packSize: '2.250 kg', stock: 18, unit: 'pcs' },
  { sr: 21, category: 'Canned & Preserved', name: 'Kolly Mushroom', packSize: '2600 gram', stock: 18, unit: 'pcs' },
  { sr: 22, category: 'Canned & Preserved', name: 'Arizona Slice Green Olive', packSize: '3 kg', stock: 12, unit: 'pcs' },
  { sr: 23, category: 'Canned & Preserved', name: 'Dechoice Black Slice Olive', packSize: '3 kg', stock: 18, unit: 'pcs' },
  { sr: 24, category: 'Canned & Preserved', name: 'Sweet Corn', packSize: '2100 gram', stock: 6, unit: 'pcs' },

  // 25 - 42: Spices
  { sr: 25, category: 'Spices', name: 'Paprika', packSize: '1 kg', stock: 1, unit: 'kg', costPerUnit: 1850, sheetPriceNote: 'Sheet: Rs. 1,850' },
  { sr: 26, category: 'Spices', name: 'Shan Chicken Broast Masala', stock: 5, unit: 'kg', costPerUnit: 1520, sheetPriceNote: 'Sheet Total: Rs. 7,600' },
  { sr: 27, category: 'Spices', name: 'Chicken Tikka Masala', stock: 10, unit: 'kg' },
  { sr: 28, category: 'Spices', name: 'Shan Korma Masala', stock: 3, unit: 'kg' },
  { sr: 29, category: 'Spices', name: 'Shan Tandoori Masala', stock: 10, unit: 'kg' },
  { sr: 30, category: 'Spices', name: 'National Biryani Mix', stock: 5, unit: 'kg' },
  { sr: 31, category: 'Spices', name: 'Jalwatri', stock: 3, unit: 'kg' },
  { sr: 32, category: 'Spices', name: 'Meetha Soda', stock: 2, unit: 'kg' },
  { sr: 33, category: 'Spices', name: 'Crushed Chilli', stock: 5, unit: 'kg' },
  { sr: 34, category: 'Spices', name: 'China Salt', stock: 5, unit: 'kg' },
  { sr: 35, category: 'Spices', name: 'Cinnamon Stick', stock: 5, unit: 'kg' },
  { sr: 36, category: 'Spices', name: 'Clove', stock: 5, unit: 'kg' },
  { sr: 37, category: 'Spices', name: 'Sonf', stock: 5, unit: 'kg' },
  { sr: 38, category: 'Spices', name: 'Black Pepper', stock: 4, unit: 'kg' },
  { sr: 39, category: 'Spices', name: 'Meethi Daana', stock: 2, unit: 'kg' },
  { sr: 40, category: 'Spices', name: 'Red Chilli', stock: 8, unit: 'kg' },
  { sr: 41, category: 'Spices', name: 'White Pepper', stock: 5, unit: 'kg' },
  { sr: 42, category: 'Spices', name: 'Red Chilli Whole', stock: 5, unit: 'kg' },

  // 43 - 56: Sauces
  { sr: 43, category: 'Sauces', name: 'Trandoz Chilli Sauce', stock: 24, unit: 'pcs' },
  { sr: 44, category: 'Sauces', name: 'Key Pepper Sauce', packSize: '800 g', stock: 12, unit: 'pcs' },
  { sr: 45, category: 'Sauces', name: 'Shezan Tomato Ketchup', packSize: '5 kg', stock: 7, unit: 'pcs' },
  { sr: 46, category: 'Sauces', name: 'Tomato Paste', stock: 12, unit: 'pcs' },
  { sr: 47, category: 'Sauces', name: 'Yeos Sambal', packSize: '250 ml', stock: 24, unit: 'pcs' },
  { sr: 48, category: 'Sauces', name: "Young's Mayo Dressing", packSize: '2 Liter', stock: 32, unit: 'pcs' },
  { sr: 49, category: 'Sauces', name: 'Shangrila Soya Sauce', packSize: '500 ml', stock: 6, unit: 'pcs' },
  { sr: 50, category: 'Sauces', name: 'Ahmed Mayonnaise', packSize: '4 Liter', stock: 16, unit: 'pcs' },
  { sr: 51, category: 'Sauces', name: 'Shangrila Chilli Sauce', packSize: '4 kg', stock: 4, unit: 'pcs' },
  { sr: 52, category: 'Sauces', name: 'Shangrila Garlic Chilli Sauce', packSize: '4 kg', stock: 8, unit: 'pcs' },
  { sr: 53, category: 'Sauces', name: 'Trandoz Hot Sauce', packSize: '275 gram', stock: 12, unit: 'pcs' },
  { sr: 54, category: 'Sauces', name: 'Key Soya Sauce', packSize: '450 ml', stock: 12, unit: 'pcs' },
  { sr: 55, category: 'Sauces', name: 'Oyster Sauce', packSize: '4.2 kg', stock: 3, unit: 'pcs' },
  { sr: 56, category: 'Sauces', name: 'Knorr BBQ Sauce', packSize: '800 gram', stock: 4, unit: 'pcs' },

  // 57 - 76: Grocery
  { sr: 57, category: 'Grocery', name: 'Knorr Chicken Cube', stock: 12, unit: 'box', costPerUnit: 168, sheetPriceNote: 'Sheet Total: Rs. 2,016' },
  { sr: 58, category: 'Grocery', name: 'Soji (Semolina)', stock: 10, unit: 'kg', costPerUnit: 195, sheetPriceNote: 'Sheet Total: Rs. 1,950' },
  { sr: 59, category: 'Grocery', name: 'Besan', stock: 5, unit: 'kg', costPerUnit: 305, sheetPriceNote: 'Sheet Total: Rs. 1,525' },
  { sr: 60, category: 'Grocery', name: 'Marhaba Honey', packSize: '3 kg', stock: 3, unit: 'pcs' },
  { sr: 61, category: 'Grocery', name: 'Mother Choice Icing Sugar', packSize: '250 gram', stock: 36, unit: 'pcs' },
  { sr: 62, category: 'Grocery', name: 'French Yellow Mustard', packSize: '2.97 kg', stock: 4, unit: 'pcs' },
  { sr: 63, category: 'Grocery', name: 'Knorr Chicken Stock Powder', packSize: '1 kg', stock: 6, unit: 'pcs' },
  { sr: 64, category: 'Grocery', name: 'Knorr Lime Seasoning', packSize: '400 gram', stock: 48, unit: 'pcs' },
  { sr: 65, category: 'Grocery', name: 'Al-Ameera Tahina', packSize: '600 gram', stock: 12, unit: 'pcs' },
  { sr: 66, category: 'Grocery', name: 'Knorr Chicken Soup Stock', packSize: '1 kg', stock: 3, unit: 'pcs' },
  { sr: 67, category: 'Grocery', name: 'Knorr Demi Glace', packSize: '1 kg', stock: 6, unit: 'pcs' },
  { sr: 68, category: 'Grocery', name: 'Dry Mushroom', stock: 5, unit: 'kg' },
  { sr: 69, category: 'Grocery', name: 'Rosemore Mustard Powder', packSize: '1 kg', stock: 4, unit: 'pcs' },
  { sr: 70, category: 'Grocery', name: 'Vanilla Flavouring', packSize: '450 ml', stock: 2, unit: 'pcs' },
  { sr: 71, category: 'Grocery', name: 'Lemon Oil', stock: 1, unit: 'pcs' },
  { sr: 72, category: 'Grocery', name: 'Sugar', stock: 5, unit: 'kg', costPerUnit: 1310, sheetPriceNote: 'Sheet Total: Rs. 6,550' },
  { sr: 73, category: 'Grocery', name: 'Pure Lemon', packSize: '450 ml', stock: 12, unit: 'pcs', costPerUnit: 425, sheetPriceNote: 'Sheet Total: Rs. 5,100' },
  { sr: 74, category: 'Grocery', name: 'Islamabad Tea', packSize: '900 gram', stock: 1, unit: 'pcs', costPerUnit: 1700, sheetPriceNote: 'Sheet: Rs. 1,700' },
  { sr: 75, category: 'Grocery', name: 'Crispy Fried Onion', packSize: '500 gram', stock: 5, unit: 'kg', costPerUnit: 540, sheetPriceNote: 'Sheet Total: Rs. 2,700' },
  { sr: 76, category: 'Grocery', name: 'Italian Parmesan Cheese Powder', stock: 6, unit: 'pcs' },

  // 77 - 84: Dairy
  { sr: 77, category: 'Dairy', name: 'Pola Condensed Milk', packSize: '1 kg', stock: 72, unit: 'pcs' },
  { sr: 78, category: 'Dairy', name: 'Evaporated Milk', packSize: '368 ml', stock: 72, unit: 'pcs' },
  { sr: 79, category: 'Dairy', name: 'Milk Pak Dairy Cream', packSize: '200 ml', stock: 120, unit: 'pcs' },
  { sr: 80, category: 'Dairy', name: 'Puck Cheese', packSize: '500 g', stock: 24, unit: 'pcs' },
  { sr: 81, category: 'Dairy', name: 'Grace Choice Bless Milky', packSize: '2 kg', stock: 0, unit: 'pcs' },
  { sr: 82, category: 'Dairy', name: 'Nestle Everyday Milk', packSize: '250 g', stock: 12, unit: 'pcs' },
  { sr: 83, category: 'Dairy', name: 'Delesol Coconut Milk Powder', packSize: '30 g', stock: 24, unit: 'box', costPerUnit: 525, sheetPriceNote: 'Sheet Total: Rs. 12,600' },
  { sr: 84, category: 'Dairy', name: "Young's Peanut Butter Creamy", packSize: '450 g', stock: 24, unit: 'bottle', costPerUnit: 950, sheetPriceNote: 'Sheet Total: Rs. 22,800' },

  // 85: Packaging (Sheet: Packing)
  { sr: 85, category: 'Packaging', name: 'Cling Film', stock: 12, unit: 'pcs', costPerUnit: 550, sheetPriceNote: 'Sheet Total: Rs. 6,600' },

  // 86 - 88: Baking (Sheet: Bakery)
  { sr: 86, category: 'Baking', name: 'Classic Cocoa Powder', packSize: '25 kg Bag', stock: 1, unit: 'bag' },
  { sr: 87, category: 'Baking', name: 'Dry Yeast', packSize: '500 gr', stock: 20, unit: 'pcs' },
  { sr: 88, category: 'Baking', name: 'Holiday Baking Powder', stock: 2, unit: 'tin' },

  // 89 - 92: Snacks & Biscuits (Sheet: Snack and Biscuits)
  { sr: 89, category: 'Snacks & Biscuits', name: 'White Cracker', stock: 40, unit: 'kg' },
  { sr: 90, category: 'Snacks & Biscuits', name: 'Lotus Biscoff Creamy', packSize: '3 kg', stock: 4, unit: 'pcs' },
  { sr: 91, category: 'Snacks & Biscuits', name: 'Lotus Biscoff', packSize: '250 grm', stock: 2, unit: 'box' },
  { sr: 92, category: 'Snacks & Biscuits', name: 'Peek Freans Marie Biscuits', stock: 12, unit: 'box', costPerUnit: 50, sheetPriceNote: 'Sheet: Rs. 50' },

  // 93 - 94: Pasta
  { sr: 93, category: 'Pasta', name: 'Pasta Reggia', packSize: '500 grm', stock: 24, unit: 'pcs' },
  { sr: 94, category: 'Pasta', name: 'Pasta Penne', packSize: '500 g', stock: 24, unit: 'pcs' },

  // 95: Ghee & Oil (Sheet: Ghee and Oil)
  { sr: 95, category: 'Ghee & Oil', name: 'Fragata Olive Oil', packSize: '4 Liter', stock: 2, unit: 'pcs' },

  // 96 - 103: Dry Fruits & Nuts (Sheet: Dry Fruits and Nuts)
  { sr: 96, category: 'Dry Fruits & Nuts', name: 'Almond', stock: 5, unit: 'kg' },
  { sr: 97, category: 'Dry Fruits & Nuts', name: 'Walnut', stock: 5, unit: 'kg' },
  { sr: 98, category: 'Dry Fruits & Nuts', name: 'White Till', stock: 6, unit: 'kg', costPerUnit: 620, sheetPriceNote: 'Rs. 620 / kg' },
  { sr: 99, category: 'Dry Fruits & Nuts', name: 'Cashewnut', stock: 5, unit: 'kg' },
  { sr: 100, category: 'Dry Fruits & Nuts', name: 'Green Cardamom', stock: 5, unit: 'kg' },
  { sr: 101, category: 'Dry Fruits & Nuts', name: 'Crush Coconut', stock: 5, unit: 'kg' },
  { sr: 102, category: 'Dry Fruits & Nuts', name: 'Kishmish Checha', stock: 5, unit: 'kg', costPerUnit: 1100, sheetPriceNote: 'Sheet Total: Rs. 5,500' },
  { sr: 103, category: 'Dry Fruits & Nuts', name: 'Charmaghz', stock: 5, unit: 'kg' },

  // 104 - 107: Pulses & Lentils
  { sr: 104, category: 'Pulses & Lentils', name: 'White Chana', stock: 5, unit: 'kg', costPerUnit: 295, sheetPriceNote: 'Sheet Total: Rs. 1,475' },
  { sr: 105, category: 'Pulses & Lentils', name: 'Dal Mash', stock: 5, unit: 'kg', costPerUnit: 450, sheetPriceNote: 'Sheet Total: Rs. 2,250' },
  { sr: 106, category: 'Pulses & Lentils', name: 'Dal Moung', stock: 5, unit: 'kg', costPerUnit: 285, sheetPriceNote: 'Sheet Total: Rs. 1,425' },
  { sr: 107, category: 'Pulses & Lentils', name: 'Dal Masur', stock: 5, unit: 'kg', costPerUnit: 230, sheetPriceNote: 'Sheet Total: Rs. 1,150' },

  // 108 - 112: Housekeeping
  { sr: 108, category: 'Housekeeping', name: 'Tooth Picks & Spoons', stock: 10, unit: 'pcs' },
  { sr: 109, category: 'Housekeeping', name: 'Vinyl Gloves', stock: 13, unit: 'box', costPerUnit: 77, sheetPriceNote: 'Sheet Total: Rs. 1,000' },
  { sr: 110, category: 'Housekeeping', name: 'Face Mask', stock: 10, unit: 'box', costPerUnit: 120, sheetPriceNote: 'Sheet Total: Rs. 1,200' },
  { sr: 111, category: 'Housekeeping', name: 'Garbage Bag', stock: 50, unit: 'roll', costPerUnit: 160, sheetPriceNote: 'Sheet Total: Rs. 8,000' },
  { sr: 112, category: 'Housekeeping', name: 'Tissues', stock: 92, unit: 'box', costPerUnit: 125, sheetPriceNote: 'Rs. 125 / box' },

  // 113 - 124: Packaging (Sheet: Packing)
  { sr: 113, category: 'Packaging', name: 'Container with Lid (1500)', stock: 42, unit: 'pkt', costPerUnit: 743, sheetPriceNote: 'Sheet Total: Rs. 31,200' },
  { sr: 114, category: 'Packaging', name: 'Container with Lid (1000)', stock: 20, unit: 'pkt', costPerUnit: 1010, sheetPriceNote: 'Sheet Total: Rs. 20,200' },
  { sr: 115, category: 'Packaging', name: 'F-2 Aluminum Rice Container', stock: 8, unit: 'pkt' },
  { sr: 116, category: 'Packaging', name: 'Scotch Tape', stock: 24, unit: 'pcs', costPerUnit: 100, sheetPriceNote: 'Sheet Total: Rs. 2,400' },
  { sr: 117, category: 'Packaging', name: 'F-4 Aluminum Rice Container', stock: 0, unit: 'pkt' },
  { sr: 118, category: 'Packaging', name: 'Diamond Aluminum Foil', stock: 12, unit: 'pcs', costPerUnit: 1400, sheetPriceNote: 'Sheet Total: Rs. 16,800' },
  { sr: 119, category: 'Packaging', name: 'Disposable Plates', stock: 3, unit: 'pkt', costPerUnit: 933, sheetPriceNote: 'Sheet Total: Rs. 2,800' },
  { sr: 120, category: 'Packaging', name: 'Head Cap', stock: 10, unit: 'pkt', costPerUnit: 160, sheetPriceNote: 'Sheet Total: Rs. 1,600' },
  { sr: 121, category: 'Packaging', name: 'Mint Glass', stock: 30, unit: 'pkt', costPerUnit: 870, sheetPriceNote: 'Rs. 870 / pkt' },
  { sr: 122, category: 'Packaging', name: 'Coffee Glass', stock: 25, unit: 'pkt', costPerUnit: 550, sheetPriceNote: 'Rs. 550 / pkt' },
  { sr: 123, category: 'Packaging', name: 'Disposable Sauce Cup', stock: 58, unit: 'pkt' },
  { sr: 124, category: 'Packaging', name: 'Tape Dispenser', stock: 2, unit: 'pcs', costPerUnit: 350, sheetPriceNote: 'Sheet Total: Rs. 700' },
];

const SEED_TIMESTAMP = 1795600000000;

export const SULTAN_DEFAULT_INVENTORY: InventoryItem[] = RAW_SULTAN_INVENTORY_SHEET.map((row) => {
  const pref = CATEGORY_SKU_PREFIX[row.category] || 'RM';
  const srPad = String(row.sr).padStart(3, '0');
  const threshold = row.stock > 0 ? Math.max(1, Math.min(10, Math.floor(row.stock * 0.2))) : 2;
  const noteParts: string[] = [];
  if (row.packSize) noteParts.push(`Pack: ${row.packSize}`);
  if (row.sheetPriceNote) noteParts.push(row.sheetPriceNote);
  else noteParts.push('Price Pending');

  return {
    id: `inv-cat-${srPad}`,
    itemCode: `SKU-${pref}-${srPad}`,
    name: row.packSize ? `${row.name} (${row.packSize})` : row.name,
    category: row.category,
    unit: row.unit,
    stock: row.stock,
    threshold,
    costPerUnit: row.costPerUnit,
    location: CATEGORY_DEFAULT_LOCATION[row.category] || 'Main Central Store',
    notes: noteParts.join(' • '),
    beverageStorageMode: 'standard',
    updatedAt: SEED_TIMESTAMP,
  };
});
