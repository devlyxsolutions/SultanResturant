import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { appStorage } from './storage';

export type ShiftType = 'Morning' | 'Evening' | 'Night';
export type ShiftStatus = 'open' | 'closed' | 'audited';

export interface CashDenominations {
  d5000: number;
  d1000: number;
  d500: number;
  d100: number;
  d50: number;
  d20: number;
  d10: number;
  coins: number;
}

export interface ShiftRecord {
  id: string;
  shiftType: ShiftType;
  registerId: string;
  cashierId: string;
  cashierName: string;
  openedAt: number;
  openedBy: string;
  openingFloat: number;
  openingNotes?: string;
  status: ShiftStatus;

  // Blind Cashier Closing Fields (Only entered by Cashier without seeing system totals)
  closedAt?: number;
  closedBy?: string;
  closedRole?: string;
  actualCountedCash?: number;
  denominations?: CashDenominations;
  cardSlipsCount?: number;
  cardSlipsTotal?: number;
  cashierNotes?: string;

  // System Recorded Totals (Hidden from Cashier during Shift Close; visible to Manager/Admin)
  systemCashSales?: number;
  systemCardSales?: number;
  systemOnlineSales?: number;
  systemTotalSales?: number;
  settledOrdersCount?: number;
  cashPayouts?: number;
  expectedCashInDrawer?: number; // openingFloat + systemCashSales - cashPayouts
  cashVariance?: number; // actualCountedCash - expectedCashInDrawer
  varianceType?: 'balanced' | 'shortage' | 'overage';

  // Manager Audit & Approval
  auditedBy?: string;
  auditedAt?: number;
  auditNotes?: string;
  isApproved?: boolean;
}

export const INITIAL_DENOMINATIONS: CashDenominations = {
  d5000: 0,
  d1000: 0,
  d500: 0,
  d100: 0,
  d50: 0,
  d20: 0,
  d10: 0,
  coins: 0,
};

export function calculateDenominationTotal(denoms: CashDenominations): number {
  return (
    (denoms.d5000 || 0) * 5000 +
    (denoms.d1000 || 0) * 1000 +
    (denoms.d500 || 0) * 500 +
    (denoms.d100 || 0) * 100 +
    (denoms.d50 || 0) * 50 +
    (denoms.d20 || 0) * 20 +
    (denoms.d10 || 0) * 10 +
    (denoms.coins || 0)
  );
}

export const INITIAL_SHIFTS: ShiftRecord[] = [];

const isLegacyDummyShift = (s: ShiftRecord | null | undefined): boolean => {
  if (!s) return true;
  const note = (s.openingNotes || '').trim();
  if (
    note === 'Morning float issued: Rs. 5,000 in petty change.' ||
    note === 'Dinner rush shift. Rs. 8,000 float given to drawer.'
  ) {
    return true;
  }
  if (s.cashierName === 'Sara Ahmed' && s.systemTotalSales === 66250 && s.settledOrdersCount === 22) {
    return true;
  }
  return false;
};

interface ShiftState {
  shifts: ShiftRecord[];
  activeShiftId: string | null;
  dummyPurgeVersion?: number;

  // Actions
  openShift: (params: {
    shiftType: ShiftType;
    registerId: string;
    cashierId: string;
    cashierName: string;
    openedBy: string;
    openingFloat: number;
    openingNotes?: string;
  }) => ShiftRecord;

  closeShiftBlind: (
    shiftId: string,
    params: {
      countedCash: number;
      denominations?: CashDenominations;
      cardSlipsCount?: number;
      cardSlipsTotal?: number;
      cashierNotes?: string;
      closedBy: string;
      closedRole?: string;
      systemCashSales: number;
      systemCardSales: number;
      systemOnlineSales: number;
      settledOrdersCount: number;
      cashPayouts: number;
    }
  ) => ShiftRecord | null;

  auditShift: (
    shiftId: string,
    params: {
      auditedBy: string;
      auditNotes: string;
      isApproved: boolean;
    }
  ) => void;

  reopenShift: (shiftId: string, reopenedBy: string) => void;
  setActiveShiftId: (shiftId: string | null) => void;
  getActiveShift: () => ShiftRecord | null;
  syncFromServer: (remote: { shifts?: ShiftRecord[]; activeShiftId?: string | null }) => void;
}

export const useShiftStore = create<ShiftState>()(
  persist(
    (set, get) => ({
      shifts: [],
      activeShiftId: null,
      dummyPurgeVersion: 1,

      openShift: (params) => {
        const id = `SH-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(
          get().shifts.length + 1
        ).padStart(2, '0')}`;

        const newShift: ShiftRecord = {
          id,
          shiftType: params.shiftType,
          registerId: params.registerId,
          cashierId: params.cashierId,
          cashierName: params.cashierName,
          openedAt: Date.now(),
          openedBy: params.openedBy,
          openingFloat: params.openingFloat,
          openingNotes: params.openingNotes,
          status: 'open',
        };

        set((state) => ({
          shifts: [
            newShift,
            ...state.shifts.map((s) =>
              s.status === 'open' ? { ...s, status: 'closed' as const, closedAt: Date.now() } : s
            ),
          ],
          activeShiftId: newShift.id,
        }));

        return newShift;
      },

      closeShiftBlind: (shiftId, params) => {
        const state = get();
        const target = state.shifts.find((s) => s.id === shiftId);
        if (!target) return null;

        const expectedCash = target.openingFloat + params.systemCashSales - params.cashPayouts;
        const variance = params.countedCash - expectedCash;
        const varianceType: 'balanced' | 'shortage' | 'overage' =
          variance === 0 ? 'balanced' : variance > 0 ? 'overage' : 'shortage';

        const updatedShift: ShiftRecord = {
          ...target,
          status: 'closed',
          closedAt: Date.now(),
          closedBy: params.closedBy,
          closedRole: params.closedRole || 'Cashier',
          actualCountedCash: params.countedCash,
          denominations: params.denominations,
          cardSlipsCount: params.cardSlipsCount || 0,
          cardSlipsTotal: params.cardSlipsTotal || 0,
          cashierNotes: params.cashierNotes,

          // System recorded financials calculated confidentially
          systemCashSales: params.systemCashSales,
          systemCardSales: params.systemCardSales,
          systemOnlineSales: params.systemOnlineSales,
          systemTotalSales: params.systemCashSales + params.systemCardSales + params.systemOnlineSales,
          settledOrdersCount: params.settledOrdersCount,
          cashPayouts: params.cashPayouts,
          expectedCashInDrawer: expectedCash,
          cashVariance: variance,
          varianceType,
        };

        set((s) => ({
          shifts: s.shifts.map((item) => {
            if (item.id === shiftId) return updatedShift;
            if (item.status === 'open') return { ...item, status: 'closed' as const, closedAt: Date.now() };
            return item;
          }),
          activeShiftId: null,
        }));

        return updatedShift;
      },

      auditShift: (shiftId, params) => {
        set((state) => ({
          shifts: state.shifts.map((s) =>
            s.id === shiftId
              ? {
                  ...s,
                  status: 'audited',
                  auditedBy: params.auditedBy,
                  auditedAt: Date.now(),
                  auditNotes: params.auditNotes,
                  isApproved: params.isApproved,
                }
              : s
          ),
        }));
      },

      reopenShift: (shiftId, _reopenedBy) => {
        set((state) => ({
          shifts: state.shifts.map((s) =>
            s.id === shiftId
              ? {
                  ...s,
                  status: 'open',
                  closedAt: undefined,
                  actualCountedCash: undefined,
                  cashVariance: undefined,
                  varianceType: undefined,
                }
              : s
          ),
          activeShiftId: shiftId,
        }));
      },

      setActiveShiftId: (shiftId) => set({ activeShiftId: shiftId }),

      getActiveShift: () => {
        const state = get();
        if (state.activeShiftId) {
          return state.shifts.find((s) => s.id === state.activeShiftId && s.status === 'open') || null;
        }
        return state.shifts.find((s) => s.status === 'open') || null;
      },

      syncFromServer: (remote) => {
        if (!remote || typeof remote !== 'object') return;
        set((state) => {
          let updatedShifts = state.shifts;
          let updatedActiveId = state.activeShiftId;

          if (Array.isArray(remote.shifts)) {
            updatedShifts = remote.shifts
              .filter((r) => !isLegacyDummyShift(r))
              .sort((a, b) => (b.openedAt || 0) - (a.openedAt || 0));
          }

          if (remote.activeShiftId !== undefined) {
            updatedActiveId =
              remote.activeShiftId && updatedShifts.some((s) => s.id === remote.activeShiftId && s.status === 'open')
                ? remote.activeShiftId
                : null;
          } else {
            const currentOpen = updatedShifts.find((s) => s.status === 'open');
            updatedActiveId = currentOpen ? currentOpen.id : null;
          }

          return {
            shifts: updatedShifts,
            activeShiftId: updatedActiveId,
            dummyPurgeVersion: 1,
          };
        });
      },
    }),
    {
      name: 'sultan-shift-store-v1',
      storage: appStorage,
      merge: (persistedState: any, currentState) => {
        const p = persistedState as Partial<ShiftState> | undefined;
        const alreadyPurged = (p?.dummyPurgeVersion || 0) >= 1;
        const cleanedShifts = alreadyPurged
          ? (Array.isArray(p?.shifts) ? p.shifts : []).filter((s) => !isLegacyDummyShift(s))
          : [];
        const activeId =
          alreadyPurged && p?.activeShiftId && cleanedShifts.some((s) => s.id === p.activeShiftId && s.status === 'open')
            ? p.activeShiftId
            : null;
        return {
          ...currentState,
          ...p,
          shifts: cleanedShifts,
          activeShiftId: activeId,
          dummyPurgeVersion: 1,
        };
      },
    }
  )
);
