import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useRestaurantStore } from '../../store/restaurantStore';

export default function ReportsScreen() {
  const router = useRouter();
  const [timeRange, setTimeRange] = useState('Today');

  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const invoices = useRestaurantStore((state) => state.invoices);
  const tables = useRestaurantStore((state) => state.tables);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Time filtering
  const validInvoices = (invoices || []).filter((inv) => inv.status !== 'voided');
  let filteredInvoices = validInvoices;
  if (timeRange === 'Today') {
    filteredInvoices = validInvoices.filter((inv) => (inv.timeSettled || inv.timePlaced) >= today.getTime());
  } else if (timeRange === 'This Week') {
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    filteredInvoices = validInvoices.filter((inv) => (inv.timeSettled || inv.timePlaced) >= weekAgo.getTime());
  } else if (timeRange === 'This Month') {
    const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    filteredInvoices = validInvoices.filter((inv) => (inv.timeSettled || inv.timePlaced) >= monthAgo.getTime());
  }

  const totalRevenue = filteredInvoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
  const totalOrders = filteredInvoices.length;
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const activeTables = tables.filter((t) => t.status !== 'available').length;

  const SUMMARY_CARDS = [
    {
      title: 'Total Revenue',
      value: `Rs. ${totalRevenue.toFixed(0)}`,
      trend: `${filteredInvoices.length} invoices`,
      icon: 'cash-outline',
      color: '#34C759',
    },
    {
      title: 'Total Orders',
      value: totalOrders.toString(),
      trend: `${timeRange} completed`,
      icon: 'receipt-outline',
      color: '#007AFF',
    },
    {
      title: 'Avg Order Value',
      value: `Rs. ${avgOrderValue.toFixed(0)}`,
      trend: 'Per customer',
      icon: 'analytics-outline',
      color: '#FF9500',
    },
    {
      title: 'Active Tables',
      value: `${activeTables}/${tables.length}`,
      trend: 'Right now',
      icon: 'grid-outline',
      color: '#5856D6',
    },
  ];

  // Calculate top items
  const itemMap: Record<string, { name: string; sold: number; revenue: number }> = {};
  filteredInvoices.forEach((inv) => {
    inv.items.forEach((item) => {
      if (!itemMap[item.id]) {
        itemMap[item.id] = { name: item.name, sold: 0, revenue: 0 };
      }
      itemMap[item.id].sold += item.qty;
      itemMap[item.id].revenue += item.qty * item.price;
    });
  });

  const topItems = Object.values(itemMap)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  const handlePrint = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.print();
    } else {
      Alert.alert(
        'Report Ready',
        `Summary for ${timeRange}:\nTotal Sales: Rs. ${totalRevenue.toFixed(0)}\nOrders: ${totalOrders}`
      );
    }
  };

  const handleExportCSV = () => {
    if (filteredInvoices.length === 0) {
      if (Platform.OS === 'web') window.alert('No invoices found for this range to export.');
      else Alert.alert('Export', 'No invoices found for this range.');
      return;
    }

    const headers = 'Invoice ID,Type,Table,Server,Time,Total,Payment\n';
    const rows = filteredInvoices
      .map(
        (inv) =>
          `"${inv.id}","${inv.orderType}","${inv.tableName || 'N/A'}","${inv.server}","${new Date(
            inv.timeSettled
          ).toLocaleString()}","${inv.total}","${inv.payments.map((p) => p.type).join('+')}"`
      )
      .join('\n');

    const csvContent = headers + rows;

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `Sultan_Sales_Report_${timeRange.replace(/\s+/g, '_')}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      Alert.alert('CSV Exported', `Generated CSV with ${filteredInvoices.length} transactions.`);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, isMobile && styles.headerMobile]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/admin/dashboard'))}
          >
            <Ionicons name="chevron-back" size={24} color="#1C1C1E" />
          </TouchableOpacity>
          <View>
            <Text style={[styles.headerTitle, isMobile && { fontSize: 20 }]}>Analytics & Reports</Text>
            {!isMobile && (
              <Text style={styles.headerSubtitle}>Sales breakdown, top items & settled invoices</Text>
            )}
          </View>
        </View>

        <View style={styles.headerActions}>
          {/* Time Filters */}
          <View style={styles.timeFilters}>
            {['Today', 'This Week', 'This Month'].map((range) => (
              <TouchableOpacity
                key={range}
                style={[styles.filterBtn, timeRange === range && styles.filterBtnActive]}
                onPress={() => setTimeRange(range)}
              >
                <Text
                  style={[styles.filterText, timeRange === range && styles.filterTextActive]}
                >
                  {range}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Export Actions */}
          <View style={styles.exportButtonsRow}>
            <TouchableOpacity style={styles.actionBtn} onPress={handlePrint}>
              <Ionicons name="print-outline" size={16} color="#4a121a" />
              <Text style={styles.actionBtnText}>Print</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.exportBtn} onPress={handleExportCSV}>
              <Ionicons name="download-outline" size={16} color="#fff" />
              <Text style={styles.exportBtnText}>CSV</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <ScrollView style={[styles.content, isMobile && { padding: 14 }]} showsVerticalScrollIndicator={false}>
        {/* KPI Cards */}
        <View style={styles.kpiGrid}>
          {SUMMARY_CARDS.map((card, idx) => (
            <View key={idx} style={[styles.kpiCard, isMobile ? styles.kpiCardMobile : styles.kpiCardDesktop]}>
              <View style={styles.kpiHeader}>
                <View style={[styles.iconBox, { backgroundColor: card.color + '15' }]}>
                  <Ionicons name={card.icon as any} size={22} color={card.color} />
                </View>
                <View style={styles.kpiTrendBadge}>
                  <Text style={[styles.kpiTrendText, { color: card.color }]}>{card.trend}</Text>
                </View>
              </View>
              <Text style={styles.kpiValue}>{card.value}</Text>
              <Text style={styles.kpiTitle}>{card.title}</Text>
            </View>
          ))}
        </View>

        {/* Top Selling Items */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>Top Selling Items</Text>
          <View style={styles.tableCard}>
            <View style={styles.tableHeader}>
              <Text style={[styles.th, { flex: 2.5 }]}>Item Name</Text>
              <Text style={[styles.th, { flex: 1 }]}>Sold</Text>
              <Text style={[styles.th, { flex: 1.5, textAlign: 'right' }]}>Total</Text>
            </View>
            {topItems.length === 0 ? (
              <View style={styles.emptyRow}>
                <Ionicons name="receipt-outline" size={24} color="#8E8E93" />
                <Text style={styles.emptyText}>No sales recorded for this period yet.</Text>
              </View>
            ) : (
              topItems.map((item, idx) => (
                <View key={idx} style={styles.tableRow}>
                  <View style={{ flex: 2.5, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={styles.rankBadge}>
                      <Text style={styles.rankText}>#{idx + 1}</Text>
                    </View>
                    <Text style={[styles.td, { fontWeight: '700' }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                  </View>
                  <Text style={[styles.td, { flex: 1 }]}>{item.sold}</Text>
                  <Text
                    style={[
                      styles.td,
                      { flex: 1.5, textAlign: 'right', color: '#34C759', fontWeight: '800' },
                    ]}
                  >
                    Rs. {item.revenue.toFixed(0)}
                  </Text>
                </View>
              ))
            )}
          </View>
        </View>

        {/* Settled Invoices List: Mobile Card View vs Desktop Table */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>Settled Transactions ({filteredInvoices.length})</Text>

          {isMobile ? (
            /* Mobile Cards */
            <View style={{ gap: 10 }}>
              {filteredInvoices.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Ionicons name="file-tray-outline" size={32} color="#8E8E93" />
                  <Text style={styles.emptyText}>No settled invoices in this time range.</Text>
                </View>
              ) : (
                filteredInvoices.slice(0, 15).map((inv) => (
                  <View key={inv.id} style={styles.mobileTxCard}>
                    <View style={styles.mobileTxTop}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.mobileTxId}>{inv.id}</Text>
                        <View
                          style={[
                            styles.orderTypeBadge,
                            {
                              backgroundColor:
                                inv.orderType === 'dine-in'
                                  ? '#EBF3FF'
                                  : inv.orderType === 'takeaway'
                                  ? '#FFF4E5'
                                  : '#E8F9EE',
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.orderTypeText,
                              {
                                color:
                                  inv.orderType === 'dine-in'
                                    ? '#007AFF'
                                    : inv.orderType === 'takeaway'
                                    ? '#FF9500'
                                    : '#34C759',
                              },
                            ]}
                          >
                            {inv.orderType.toUpperCase()}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.mobileTxAmount}>Rs. {inv.total.toFixed(0)}</Text>
                    </View>

                    <View style={styles.mobileTxBottom}>
                      <Text style={styles.mobileTxMeta}>
                        {inv.tableName ? `Table: ${inv.tableName}` : 'Counter'} • {inv.server || 'Staff'}
                      </Text>
                      <Text style={styles.mobileTxTime}>
                        {new Date(inv.timeSettled).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          ) : (
            /* Desktop Table */
            <View style={styles.tableCard}>
              <View style={styles.tableHeader}>
                <Text style={[styles.th, { flex: 1.5 }]}>Invoice ID</Text>
                <Text style={[styles.th, { flex: 1.5 }]}>Order Type</Text>
                <Text style={[styles.th, { flex: 1.5 }]}>Server / Table</Text>
                <Text style={[styles.th, { flex: 1.5 }]}>Time Settled</Text>
                <Text style={[styles.th, { flex: 1.2, textAlign: 'right' }]}>Amount</Text>
              </View>
              {filteredInvoices.length === 0 ? (
                <View style={styles.emptyRow}>
                  <Ionicons name="file-tray-outline" size={24} color="#8E8E93" />
                  <Text style={styles.emptyText}>No settled invoices in this time range.</Text>
                </View>
              ) : (
                filteredInvoices.slice(0, 15).map((inv) => (
                  <View key={inv.id} style={styles.tableRow}>
                    <Text style={[styles.td, { flex: 1.5, fontWeight: '700' }]}>{inv.id}</Text>
                    <View style={{ flex: 1.5, flexDirection: 'row' }}>
                      <View
                        style={[
                          styles.orderTypeBadge,
                          {
                            backgroundColor:
                              inv.orderType === 'dine-in'
                                ? '#EBF3FF'
                                : inv.orderType === 'takeaway'
                                ? '#FFF4E5'
                                : '#E8F9EE',
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.orderTypeText,
                            {
                              color:
                                inv.orderType === 'dine-in'
                                  ? '#007AFF'
                                  : inv.orderType === 'takeaway'
                                  ? '#FF9500'
                                  : '#34C759',
                            },
                          ]}
                        >
                          {inv.orderType.toUpperCase()}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.td, { flex: 1.5 }]}>
                      {inv.tableName || 'Direct'} • {inv.server || 'Staff'}
                    </Text>
                    <Text style={[styles.td, { flex: 1.5, color: '#666', fontSize: 13 }]}>
                      {new Date(inv.timeSettled).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                    <Text
                      style={[
                        styles.td,
                        { flex: 1.2, textAlign: 'right', fontWeight: '800', color: '#1C1C1E' },
                      ]}
                    >
                      Rs. {inv.total.toFixed(0)}
                    </Text>
                  </View>
                ))
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    backgroundColor: '#fff',
    paddingTop: Platform.OS === 'ios' ? 50 : 18,
    paddingBottom: 16,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 3 },
      android: { elevation: 2 },
      web: { boxShadow: '0 2px 10px rgba(0,0,0,0.03)' },
    }),
  },
  headerMobile: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#F2F2F7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
  },
  timeFilters: {
    flexDirection: 'row',
    backgroundColor: '#F2F2F7',
    padding: 3,
    borderRadius: 8,
  },
  filterBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  filterBtnActive: {
    backgroundColor: '#fff',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2 },
      android: { elevation: 2 },
      web: { boxShadow: '0 1px 4px rgba(0,0,0,0.08)' },
    }),
  },
  filterText: {
    fontSize: 12,
    color: '#8E8E93',
    fontWeight: '600',
  },
  filterTextActive: {
    color: '#1C1C1E',
    fontWeight: '700',
  },
  exportButtonsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFF2F3',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F2D3D6',
  },
  actionBtnText: {
    color: '#4a121a',
    fontSize: 12,
    fontWeight: '700',
  },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#4a121a',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  exportBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  content: {
    flex: 1,
    padding: 24,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  kpiCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#EFEFF4',
  },
  kpiCardMobile: {
    width: '48%',
  },
  kpiCardDesktop: {
    flex: 1,
    minWidth: 180,
  },
  kpiHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  kpiTrendBadge: {
    backgroundColor: '#F8F9FA',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  kpiTrendText: {
    fontSize: 10,
    fontWeight: '700',
  },
  kpiValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1C1C1E',
    marginBottom: 2,
  },
  kpiTitle: {
    fontSize: 12,
    color: '#8E8E93',
    fontWeight: '600',
  },
  sectionContainer: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1C1C1E',
    marginBottom: 12,
  },
  tableCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#EFEFF4',
  },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#EBEBEF',
    paddingBottom: 10,
    marginBottom: 6,
  },
  th: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
  },
  td: {
    fontSize: 14,
    color: '#1C1C1E',
  },
  rankBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#F2F2F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#4a121a',
  },
  orderTypeBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
  },
  orderTypeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  emptyCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#EFEFF4',
    gap: 8,
  },
  emptyText: {
    color: '#8E8E93',
    fontSize: 13,
    fontWeight: '500',
  },
  // Mobile Transactions Cards
  mobileTxCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#EFEFF4',
    gap: 8,
  },
  mobileTxTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  mobileTxId: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  mobileTxAmount: {
    fontSize: 15,
    fontWeight: '800',
    color: '#34C759',
  },
  mobileTxBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  mobileTxMeta: {
    fontSize: 12,
    color: '#666',
  },
  mobileTxTime: {
    fontSize: 11,
    color: '#8E8E93',
  },
});
