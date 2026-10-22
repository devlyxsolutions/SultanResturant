import { useRestaurantStore, Customer, Invoice } from '../store/restaurantStore';
import { normalizePakistaniPhone, arePhonesEqual } from '../utils/phoneNormalization';
import { broadcastImmediately } from './syncService';

/**
 * Customer entity input for creating a new customer record.
 */
export interface CreateCustomerInput {
  name: string;
  phone: string;
  address?: string;
  notes?: string;
  email?: string;
  tier?: Customer['tier'];
  tags?: string[];
}

/**
 * Finds a customer by their phone number (normalizes input and existing customer numbers
 * for standard Pakistani phone matching).
 */
export function getCustomerByPhone(phone: string): Customer | undefined {
  if (!phone) return undefined;
  const normalizedInput = normalizePakistaniPhone(phone);
  if (!normalizedInput) return undefined;

  const customers = useRestaurantStore.getState().customers || [];
  return customers.find(c => arePhonesEqual(c.phone, normalizedInput));
}

/**
 * Creates and stores a new customer with normalized phone number.
 * Ensures unique phone number. If customer already exists, returns existing customer
 * or updates their details.
 */
export function createCustomer(data: CreateCustomerInput): Customer {
  const store = useRestaurantStore.getState();
  const normalizedPhone = normalizePakistaniPhone(data.phone) || data.phone.trim();
  const now = Date.now();

  // Check if customer with this normalized phone already exists
  const existing = store.customers.find(c => arePhonesEqual(c.phone, normalizedPhone));
  if (existing) {
    const updated = {
      ...existing,
      name: data.name.trim() || existing.name,
      address: data.address?.trim() !== undefined ? data.address.trim() : existing.address,
      notes: data.notes?.trim() !== undefined ? data.notes.trim() : existing.notes,
      updatedAt: now,
    };
    store.updateCustomer(existing.id, updated);
    broadcastImmediately();
    return updated;
  }

  const newId = `c_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const newCustomer: Customer = {
    id: newId,
    name: data.name.trim(),
    phone: normalizedPhone,
    address: data.address?.trim() || '',
    notes: data.notes?.trim() || '',
    email: data.email?.trim() || '',
    tier: data.tier || 'Regular',
    tags: data.tags || ['Phone Order'],
    totalOrders: 0,
    totalSpent: 0,
    loyaltyPoints: 0,
    firstVisit: now,
    lastVisit: now,
    createdAt: now,
    updatedAt: now,
  };

  store.addCustomer(newCustomer);
  broadcastImmediately();
  return newCustomer;
}

/**
 * Updates an existing customer record by ID.
 */
export function updateCustomer(id: string, updates: Partial<Customer>): Customer | undefined {
  const store = useRestaurantStore.getState();
  const existing = store.customers.find(c => c.id === id);
  if (!existing) return undefined;

  const payload: Partial<Customer> = {
    ...updates,
    updatedAt: Date.now(),
  };

  if (updates.phone) {
    payload.phone = normalizePakistaniPhone(updates.phone) || updates.phone;
  }

  store.updateCustomer(id, payload);
  broadcastImmediately();
  return { ...existing, ...payload };
}

/**
 * Searches customers by phone number (normalized or raw), name, address, or notes.
 */
export function searchCustomers(query: string): Customer[] {
  const q = (query || '').toLowerCase().trim();
  if (!q) return useRestaurantStore.getState().customers || [];

  const normalizedQuery = normalizePakistaniPhone(q);
  const customers = useRestaurantStore.getState().customers || [];

  return customers.filter(c => {
    // Phone match
    if (normalizedQuery && arePhonesEqual(c.phone, normalizedQuery)) {
      return true;
    }
    const cleanPhone = (c.phone || '').replace(/\D/g, '');
    const cleanQ = q.replace(/\D/g, '');
    if (cleanQ.length >= 3 && cleanPhone.includes(cleanQ)) {
      return true;
    }

    // Name match
    if (c.name && c.name.toLowerCase().includes(q)) {
      return true;
    }

    // Address match
    if (c.address && c.address.toLowerCase().includes(q)) {
      return true;
    }

    // Notes match
    if (c.notes && c.notes.toLowerCase().includes(q)) {
      return true;
    }

    return false;
  });
}

/**
 * Retrieves past invoices/orders for a given customer ID or phone number.
 */
export function getCustomerOrders(customerIdOrPhone: string): Invoice[] {
  if (!customerIdOrPhone) return [];
  const invoices = useRestaurantStore.getState().invoices || [];

  return invoices.filter(inv => {
    if (inv.customer?.id && inv.customer.id === customerIdOrPhone) {
      return true;
    }
    if (inv.customer?.phone && arePhonesEqual(inv.customer.phone, customerIdOrPhone)) {
      return true;
    }
    return false;
  }).sort((a, b) => (b.timePlaced || 0) - (a.timePlaced || 0));
}

/**
 * Retrieves a summary of the customer's last order.
 */
export function getLastOrderSummary(customerIdOrPhone: string): {
  invoiceId: string;
  timePlaced: number;
  total: number;
  orderType: string;
  itemSummary: string;
} | null {
  const orders = getCustomerOrders(customerIdOrPhone);
  if (!orders || orders.length === 0) return null;

  const lastOrder = orders[0];
  const itemsText = (lastOrder.items || [])
    .map(i => `${i.qty}x ${i.name}`)
    .slice(0, 3)
    .join(', ');
  const remainingCount = (lastOrder.items || []).length - 3;
  const itemSummary = remainingCount > 0 ? `${itemsText} +${remainingCount} more` : itemsText;

  return {
    invoiceId: lastOrder.id,
    timePlaced: lastOrder.timePlaced || Date.now(),
    total: lastOrder.total || 0,
    orderType: lastOrder.orderType || 'dine-in',
    itemSummary: itemSummary || 'Order Items',
  };
}
