/**
 * Kitchen Operations domain types (recipes, handover sessions, consumption, cash).
 * Kept separate from stores so utils and screens can import them without cycles.
 */

export type RecipeUnit = 'g' | 'kg' | 'ml' | 'L' | 'pcs';

export type RecipeIngredient = {
  inventoryItemId: string;
  name: string;
  /** Quantity for the whole recipe batch (see yieldPortions), in `unit`. */
  qty: number;
  unit: RecipeUnit;
  /** Trim / cooking loss on top of the quantity, 0-100. */
  wastagePct: number;
  /** Taste tuning: +10 = 10% more (e.g. spicier), -10 = 10% less. */
  tasteAdjustPct: number;
  role?: 'main' | 'masala' | 'oil' | 'garnish' | 'base';
};

export type Recipe = {
  id: string;
  menuItemId: string;
  menuItemName: string;
  /** Matches MenuVariant.name when the recipe is for a specific size. */
  variantName?: string;
  /** How many portions this ingredient list makes (1 = per plate). */
  yieldPortions: number;
  ingredients: RecipeIngredient[];
  /** Fixed extra cost per portion (box, foil, sauce sachet...). */
  packagingCost: number;
  prepNotes?: string;
  version: number;
  updatedAt: number;
};

export type SessionStatus = 'draft' | 'issued' | 'pending_approval' | 'closed' | 'cancelled';

export type SessionLine = {
  itemId: string;
  itemName: string;
  unit: string;
  category: string;
  /** Snapshot of store stock when the requisition was prepared ("inventory kitna hai"). */
  storeStockAtRequest: number;
  par: number;
  suggested: number;
  requested: number;
  issued: number;
  /** Extra issued during the day when the chef runs short. */
  topUp: number;
  /** Bought locally by the chef with the handed cash. */
  localPurchased: number;
  costPerUnit: number;
  /** Physical count at end of day (entered by chef). */
  returned?: number;
  /** Expected on hand frozen when the chef submitted the closing count. */
  expectedAtClose?: number;
  variance?: number;
};

export type KitchenSession = {
  id: string;
  dayLabel: string;
  status: SessionStatus;
  headChef: string;
  createdAt: number;
  createdBy: string;
  notes?: string;
  lines: SessionLine[];

  issuedAt?: number;
  issuedBy?: string;
  acknowledgedAt?: number;
  acknowledgedBy?: string;

  cashHandedOver: number;
  cashReturned?: number;
  cashVariance?: number;

  closingSubmittedAt?: number;
  closingSubmittedBy?: string;
  closingNotes?: string;

  approvedAt?: number;
  approvedBy?: string;
  approvalNote?: string;
  rejectionNote?: string;

  summary?: SessionSummary;
};

export type SessionSummary = {
  dishesSold: number;
  theoreticalCost: number;
  issuedValue: number;
  returnedValue: number;
  varianceValue: number;
  usedValue: number;
  cashSpent: number;
  cashVariance: number;
};

export type ConsumptionEntry = {
  id: string;
  sessionId: string;
  ticketId: string;
  menuItemId: string;
  menuItemName: string;
  variantName?: string;
  qty: number;
  at: number;
  revenue: number;
  cost: number;
  /** Ingredient usage in INVENTORY units (already multiplied by qty). */
  usage: { itemId: string; qty: number }[];
  missingRecipe?: boolean;
};

export type ManualUsageReason =
  | 'taste_up'
  | 'taste_down'
  | 'extra_masala'
  | 'spoilage'
  | 'spill'
  | 'staff_meal'
  | 'recook'
  | 'other';

export type ManualUsage = {
  id: string;
  sessionId: string;
  itemId: string;
  itemName: string;
  /** Signed, inventory units. Positive = used MORE than recipe, negative = used LESS. */
  delta: number;
  reason: ManualUsageReason;
  dish?: string;
  note?: string;
  by: string;
  at: number;
};

export type CashEntry = {
  id: string;
  sessionId: string;
  amount: number;
  note: string;
  itemId?: string;
  itemName?: string;
  qty?: number;
  by: string;
  at: number;
};

export type KitchenSettings = {
  /** Gas, labour, electricity as % of ingredient cost. */
  overheadPct: number;
  targetMarginPct: number;
  /** Round suggested prices up to this step (Rs). */
  priceRounding: number;
  /** Per inventory item daily kitchen par level. */
  par: Record<string, number>;
  /** Variance within this % of issued value is treated as normal. */
  varianceTolerancePct: number;
};

export type KitchenData = {
  recipes: Recipe[];
  kitchenSessions: KitchenSession[];
  kitchenConsumption: ConsumptionEntry[];
  kitchenManualUsage: ManualUsage[];
  kitchenCash: CashEntry[];
  kitchenSettings: KitchenSettings;
};

export const MANUAL_REASON_META: Record<
  ManualUsageReason,
  { label: string; icon: string; color: string; hint: string; signed: 'plus' | 'minus' | 'plus' }
> = {
  taste_up: { label: 'Taste Up (masala/oil +)', icon: 'trending-up-outline', color: '#C62828', hint: 'Recipe se zyada dala', signed: 'plus' },
  taste_down: { label: 'Taste Down (kam dala)', icon: 'trending-down-outline', color: '#2E7D32', hint: 'Recipe se kam dala - bacha', signed: 'minus' },
  extra_masala: { label: 'Extra Masala / Tarka', icon: 'flame-outline', color: '#E65100', hint: 'Batch ko theek karne ke liye', signed: 'plus' },
  spoilage: { label: 'Spoilage / Kharab', icon: 'trash-outline', color: '#6A1B9A', hint: 'Kharab ho gaya', signed: 'plus' },
  spill: { label: 'Spill / Girna', icon: 'water-outline', color: '#0277BD', hint: 'Ghir gaya / zaya', signed: 'plus' },
  staff_meal: { label: 'Staff Meal', icon: 'people-outline', color: '#4E342E', hint: 'Staff khana', signed: 'plus' },
  recook: { label: 'Re-cook / Remake', icon: 'refresh-outline', color: '#00695C', hint: 'Dish dobara bani', signed: 'plus' },
  other: { label: 'Other', icon: 'ellipsis-horizontal-circle-outline', color: '#546E7A', hint: 'Dusri wajah', signed: 'plus' },
};
