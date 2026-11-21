import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { appStorage } from './storage';
import { 
  EventDiscount, 
  CampaignFormData, 
  CampaignRedemption, 
  TopDishPerformance 
} from '../types/discount';
export * from '../types/discount';

const LEGACY_DUMMY_CAMPAIGN_IDS = new Set([
  'EVENT-BBQ-2026',
  'EVENT-DESSERT-OCT',
  'EVENT-EID-FEAST',
  'EVENT-LUNCH-SEP',
]);

const SEED_CAMPAIGNS: EventDiscount[] = [];

export interface DiscountState {
  campaigns: EventDiscount[];
  dummyPurgeVersion?: number;
  
  // Actions
  addCampaign: (data: CampaignFormData) => string;
  updateCampaign: (id: string, updates: Partial<CampaignFormData>) => void;
  toggleCampaignStatus: (id: string, newStatus?: 'active' | 'paused' | 'expired') => void;
  deleteCampaign: (id: string) => void;
  recordRedemption: (params: {
    campaignId: string;
    invoiceId: string;
    orderType: 'dine-in' | 'takeaway' | 'delivery';
    tableName?: string;
    customerName?: string;
    customerPhone?: string;
    grossSales: number;
    discountApplied: number;
    items: { id: string; name: string; price: number; qty: number; category?: string }[];
  }) => void;
  resetToDefaultCampaigns: () => void;
}

export const useDiscountStore = create<DiscountState>()(
  persist(
    (set, get) => ({
      campaigns: SEED_CAMPAIGNS,

      addCampaign: (data) => {
        const id = `EVENT-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 899 + 100)}`;
        const now = Date.now();
        const newCampaign: EventDiscount = {
          ...data,
          id,
          createdAt: now,
          updatedAt: now,
          redemptionsCount: 0,
          totalGrossSales: 0,
          totalDiscountGiven: 0,
          netRevenue: 0,
          topDishes: [],
          recentRedemptions: []
        };

        set(state => ({
          campaigns: [newCampaign, ...state.campaigns]
        }));

        return id;
      },

      updateCampaign: (id, updates) => {
        set(state => ({
          campaigns: state.campaigns.map(camp => 
            camp.id === id 
              ? { ...camp, ...updates, updatedAt: Date.now() }
              : camp
          )
        }));
      },

      toggleCampaignStatus: (id, newStatus) => {
        set(state => ({
          campaigns: state.campaigns.map(camp => {
            if (camp.id !== id) return camp;
            const targetStatus = newStatus || (camp.status === 'active' ? 'paused' : 'active');
            return {
              ...camp,
              status: targetStatus,
              updatedAt: Date.now()
            };
          })
        }));
      },

      deleteCampaign: (id) => {
        set(state => ({
          campaigns: state.campaigns.filter(c => c.id !== id)
        }));
      },

      recordRedemption: ({
        campaignId,
        invoiceId,
        orderType,
        tableName,
        customerName,
        customerPhone,
        grossSales,
        discountApplied,
        items
      }) => {
        set(state => {
          const campaign = state.campaigns.find(c => c.id === campaignId);
          if (!campaign) return state;

          const redemptionItem: CampaignRedemption = {
            id: `RED-${Date.now().toString(36).toUpperCase()}`,
            invoiceId,
            timestamp: Date.now(),
            orderType,
            tableName,
            customerName: customerName || 'Walk-in Guest',
            customerPhone,
            grossSales,
            discountApplied,
            netPaid: Math.max(0, grossSales - discountApplied),
            itemsCount: items.reduce((s, it) => s + it.qty, 0),
            itemsSummary: items.map(it => `${it.qty}x ${it.name}`).slice(0, 3).join(', ')
          };

          // Update dish breakdown
          const dishMap = new Map<string, TopDishPerformance>();
          campaign.topDishes.forEach(td => dishMap.set(td.itemId, { ...td }));

          items.forEach(it => {
            const baseId = it.id.split('-')[0];
            const isTarget = campaign.scope === 'order' || 
              (campaign.scope === 'item' && (campaign.targetItemIds.includes(it.id) || campaign.targetItemIds.includes(baseId))) ||
              (campaign.scope === 'category' && it.category && campaign.targetCategories.includes(it.category));

            if (isTarget) {
              const existing = dishMap.get(baseId) || {
                itemId: baseId,
                itemName: it.name,
                category: it.category || 'Mains',
                qtySold: 0,
                grossSales: 0,
                discountAmount: 0
              };
              existing.qtySold += it.qty;
              existing.grossSales += it.price * it.qty;
              const dishDiscountRatio = grossSales > 0 ? (it.price * it.qty) / grossSales : 0;
              existing.discountAmount += Math.round(discountApplied * dishDiscountRatio);
              dishMap.set(baseId, existing);
            }
          });

          const updatedTopDishes = Array.from(dishMap.values())
            .sort((a, b) => b.qtySold - a.qtySold);

          const updatedCampaign: EventDiscount = {
            ...campaign,
            redemptionsCount: campaign.redemptionsCount + 1,
            totalGrossSales: campaign.totalGrossSales + grossSales,
            totalDiscountGiven: campaign.totalDiscountGiven + discountApplied,
            netRevenue: campaign.netRevenue + (grossSales - discountApplied),
            topDishes: updatedTopDishes,
            recentRedemptions: [redemptionItem, ...(campaign.recentRedemptions || [])].slice(0, 20),
            updatedAt: Date.now()
          };

          return {
            campaigns: state.campaigns.map(c => c.id === campaignId ? updatedCampaign : c)
          };
        });
      },

      resetToDefaultCampaigns: () => {
        set({ campaigns: SEED_CAMPAIGNS, dummyPurgeVersion: 1 });
      }
    }),
    {
      name: 'sultan-events-discount-store',
      storage: appStorage,
      onRehydrateStorage: () => (state) => {
        if (state && (state.dummyPurgeVersion || 0) < 1) {
          state.campaigns = (state.campaigns || []).filter(
            (c) => c && !LEGACY_DUMMY_CAMPAIGN_IDS.has(c.id)
          );
          state.dummyPurgeVersion = 1;
        }
      },
    }
  )
);
