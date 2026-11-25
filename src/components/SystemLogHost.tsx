import { useEffect, useRef } from 'react';
import { usePathname } from 'expo-router';
import { installAuditInterceptors } from '../services/auditInterceptor';
import { recordSystemLog, setCurrentAuditPage } from '../services/auditLogService';
import { useAuthStore } from '../store/authStore';

const PAGE_LABELS: Record<string, string> = {
  '/': 'Welcome / Login Portal',
  '/login': 'Staff Login Portal',
  '/menu': 'Customer Digital Menu',
  '/admin/dashboard': 'Admin Dashboard',
  '/admin/pos': 'Admin POS Terminal',
  '/admin/invoices': 'Admin Invoices & Orders',
  '/admin/returns': 'Admin Sales Returns & Refunds',
  '/admin/discounts': 'Admin Events & Discounts',
  '/admin/menu': 'Admin Menu Catalog',
  '/admin/staff': 'Admin Staff & Roles',
  '/admin/reports': 'Admin Financial Reports',
  '/admin/inventory': 'Admin Inventory & Stock',
  '/admin/suppliers': 'Admin Suppliers & Vendors',
  '/admin/supplier-ledger': 'Admin Supplier Ledger',
  '/admin/tables': 'Admin Table Blueprint',
  '/admin/customers': 'Admin Customer CRM',
  '/admin/floors': 'Admin Floor Command',
  '/admin/insights': 'Admin Business Insights',
  '/admin/expenses': 'Admin Live Expenses',
  '/admin/assets': 'Admin Assets & Capex',
  '/admin/damages': 'Admin Damage Control',
  '/admin/kitchen-handover': 'Admin Kitchen Handover',
  '/admin/recipes': 'Admin Recipe BOM',
  '/admin/kitchen-returns': 'Admin Kitchen Returns',
  '/admin/costing': 'Admin Dish Costing',
  '/admin/playland': 'Admin Playland Hub',
  '/admin/app-orders': 'Admin App & Delivery Orders',
  '/admin/call-log': 'Admin Call Center Log',
  '/admin/settings': 'Admin System Settings',
  '/admin/system-logs': 'Admin System Logs & Audit',
  '/manager/dashboard': 'Manager / Cashier Dashboard',
  '/manager/pos': 'Cashier POS Terminal',
  '/manager/floor-plan': 'Manager Floor Plan',
  '/manager/shift': 'Cashier Live Shift & Cash',
  '/manager/invoices': 'Cashier Invoices & Orders',
  '/manager/returns': 'Cashier Returns & Refunds',
  '/manager/app-orders': 'Manager App & Delivery Orders',
  '/waiter': 'Order Taker Floor Screen',
  '/floor-manager': 'Floor Manager Command',
  '/kitchen/kds': 'Main Kitchen KDS',
  '/juicebar/kds': 'Juice Bar KDS',
  '/playland': 'Playland POS Terminal',
};

function describeRoute(path: string): string {
  if (PAGE_LABELS[path]) return PAGE_LABELS[path];
  if (path.startsWith('/waiter/order/')) {
    const id = path.replace('/waiter/order/', '');
    return id === 'takeaway' ? 'Order Taker — Takeaway Order' : `Order Taker — Table Order (${id})`;
  }
  return path || '/';
}

/**
 * Invisible global host mounted in RootLayout:
 * 1. Installs zero-blind-spot interceptors on all 10 Zustand stores on boot.
 * 2. Tracks active route path for every transaction log and records page visits across all roles.
 */
export default function SystemLogHost() {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const lastLoggedRef = useRef<{ path: string; at: number; userId: string }>({
    path: '',
    at: 0,
    userId: '',
  });

  // Install interceptors once immediately on mount
  useEffect(() => {
    installAuditInterceptors();
  }, []);

  // Track every route navigation across all portals
  useEffect(() => {
    const cleanPath = pathname || '/';
    setCurrentAuditPage(cleanPath);

    const now = Date.now();
    const uid = user?.staffId || user?.id || 'anon';
    const prev = lastLoggedRef.current;

    // Avoid duplicate re-render log for exact same route + user within 2s
    if (prev.path === cleanPath && prev.userId === uid && now - prev.at < 2000) {
      return;
    }
    lastLoggedRef.current = { path: cleanPath, at: now, userId: uid };

    // Avoid noise on splash/root unauthenticated landing, log all real authenticated & customer portal navigations
    if (!user && (cleanPath === '/' || cleanPath === '/login')) return;

    const friendly = describeRoute(cleanPath);
    recordSystemLog({
      module: 'NAVIGATION',
      action: 'PAGE_OPENED',
      actionType: 'NAVIGATION',
      severity: 'info',
      page: cleanPath,
      entityType: 'Screen',
      entityName: friendly,
      summary: `Opened ${friendly}`,
      details: { route: cleanPath },
    });
  }, [pathname, user?.staffId, user?.id]);

  return null;
}
