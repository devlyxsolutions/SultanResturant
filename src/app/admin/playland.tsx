import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Switch,
  Alert,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  usePlaylandStore,
  PlaylandRide,
  PlaylandRideVariant,
  RideCategory,
  PlaylandTicket,
} from '../../store/playlandStore';
import SultanLogo from '../../components/SultanLogo';

const CATEGORIES: { label: string; value: RideCategory; icon: keyof typeof Ionicons.glyphMap }[] = [
  { label: 'Jhoolay & Rides', value: 'jhoola', icon: 'color-palette-outline' },
  { label: 'Soft Play Zone', value: 'softplay', icon: 'happy-outline' },
  { label: '9D VR Gaming', value: 'vr', icon: 'glasses-outline' },
  { label: 'Arcade Zone', value: 'arcade', icon: 'game-controller-outline' },
  { label: 'Super Passes', value: 'pass', icon: 'ribbon-outline' },
  { label: 'Special Service', value: 'service', icon: 'sparkles-outline' },
];

const AVAILABLE_ICONS: (keyof typeof Ionicons.glyphMap)[] = [
  'color-palette-outline',
  'rocket-outline',
  'car-sport-outline',
  'train-outline',
  'planet-outline',
  'happy-outline',
  'glasses-outline',
  'game-controller-outline',
  'ribbon-outline',
  'gift-outline',
  'sparkles-outline',
  'bicycle-outline',
  'boat-outline',
  'trophy-outline',
];

const THEME_COLORS = ['#D5A943', '#FF6B6B', '#4D96FF', '#6BCB77', '#FFD93D', '#FF9F45', '#9B51E0', '#00C9A7'];

export default function AdminPlaylandManagement() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const rides = usePlaylandStore((state) => state.rides);
  const tickets = usePlaylandStore((state) => state.tickets);
  const toggleRideStatus = usePlaylandStore((state) => state.toggleRideStatus);
  const addNewRide = usePlaylandStore((state) => state.addNewRide);
  const updateRide = usePlaylandStore((state) => state.updateRide);
  const deleteRide = usePlaylandStore((state) => state.deleteRide);
  const refundTicket = usePlaylandStore((state) => state.refundTicket);

  // Tabs: 'invoices' | 'rides'
  const [activeTab, setActiveTab] = useState<'invoices' | 'rides'>('invoices');

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState<'today' | 'week' | 'all'>('today');
  const [categoryFilter, setCategoryFilter] = useState<RideCategory | 'all'>('all');

  // Modal States
  const [isRideModalOpen, setIsRideModalOpen] = useState(false);
  const [editingRideId, setEditingRideId] = useState<string | null>(null);
  const [selectedTicketForModal, setSelectedTicketForModal] = useState<PlaylandTicket | null>(null);

  // Form State for Adding / Editing Ride
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState<RideCategory>('jhoola');
  const [formIcon, setFormIcon] = useState<string>('color-palette-outline');
  const [formMinAge, setFormMinAge] = useState('3+ yrs');
  const [formColor, setFormColor] = useState('#D5A943');
  const [formVariants, setFormVariants] = useState<
    { id: string; name: string; durationMinutes?: number; price: number }[]
  >([
    { id: 'v1', name: '5 Mins', durationMinutes: 5, price: 200 },
    { id: 'v2', name: '10 Mins', durationMinutes: 10, price: 350 },
  ]);

  // Summary Metrics
  const metrics = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = today.getTime();

    const todayInvoices = tickets.filter((t) => t.issuedAt >= todayTimestamp);
    const todaySales = todayInvoices.reduce((sum, t) => sum + (t.status !== 'refunded' ? t.totalAmount : 0), 0);
    const totalSales = tickets.reduce((sum, t) => sum + (t.status !== 'refunded' ? t.totalAmount : 0), 0);
    const activeRidesCount = rides.filter((r) => r.isActive).length;

    return {
      todaySales,
      totalSales,
      todayTicketsCount: todayInvoices.length,
      totalTicketsCount: tickets.length,
      activeRidesCount,
      totalRidesCount: rides.length,
    };
  }, [tickets, rides]);

  // Filtered Invoices
  const filteredTickets = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStart = today.getTime();
    const weekStart = todayStart - 7 * 24 * 60 * 60 * 1000;

    return tickets.filter((t) => {
      // Date filter
      if (dateFilter === 'today' && t.issuedAt < todayStart) return false;
      if (dateFilter === 'week' && t.issuedAt < weekStart) return false;

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchCode = t.ticketCode.toLowerCase().includes(q);
        const matchName = (t.childName || '').toLowerCase().includes(q);
        const matchPhone = (t.parentPhone || '').toLowerCase().includes(q);
        const matchIssuer = (t.issuedBy || '').toLowerCase().includes(q);
        if (!matchCode && !matchName && !matchPhone && !matchIssuer) return false;
      }

      return true;
    });
  }, [tickets, dateFilter, searchQuery]);

  // Filtered Rides
  const filteredRides = useMemo(() => {
    return rides.filter((r) => {
      if (categoryFilter !== 'all' && r.category !== categoryFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return r.name.toLowerCase().includes(q) || r.category.toLowerCase().includes(q);
      }
      return true;
    });
  }, [rides, categoryFilter, searchQuery]);

  // Open Add Modal
  const handleOpenAddRide = () => {
    setEditingRideId(null);
    setFormName('');
    setFormCategory('jhoola');
    setFormIcon('color-palette-outline');
    setFormMinAge('3+ yrs');
    setFormColor('#D5A943');
    setFormVariants([
      { id: `v-${Date.now()}-1`, name: '5 Mins', durationMinutes: 5, price: 200 },
      { id: `v-${Date.now()}-2`, name: '10 Mins', durationMinutes: 10, price: 350 },
    ]);
    setIsRideModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEditRide = (ride: PlaylandRide) => {
    setEditingRideId(ride.id);
    setFormName(ride.name);
    setFormCategory(ride.category);
    setFormIcon(ride.icon || 'color-palette-outline');
    setFormMinAge(ride.minAge || '3+ yrs');
    setFormColor(ride.color || '#D5A943');
    setFormVariants(
      ride.variants && ride.variants.length > 0
        ? ride.variants.map((v) => ({ ...v }))
        : [{ id: `v-${ride.id}-1`, name: ride.duration || 'Standard', price: ride.price || 200 }]
    );
    setIsRideModalOpen(true);
  };

  // Add Variant Row to Form
  const handleAddVariantRow = () => {
    const newNum = formVariants.length + 1;
    setFormVariants([
      ...formVariants,
      {
        id: `v-custom-${Date.now()}-${newNum}`,
        name: `${newNum * 5} Mins`,
        durationMinutes: newNum * 5,
        price: 250,
      },
    ]);
  };

  // Update Variant Row
  const handleUpdateVariantRow = (index: number, key: 'name' | 'price' | 'durationMinutes', val: any) => {
    const updated = [...formVariants];
    updated[index] = { ...updated[index], [key]: val };
    setFormVariants(updated);
  };

  // Remove Variant Row
  const handleRemoveVariantRow = (index: number) => {
    if (formVariants.length <= 1) {
      if (Platform.OS === 'web') {
        window.alert('At least one pricing variant is required!');
      } else {
        Alert.alert('Required', 'At least one pricing variant is required!');
      }
      return;
    }
    setFormVariants(formVariants.filter((_, i) => i !== index));
  };

  // Save Ride (Add / Update)
  const handleSaveRide = () => {
    if (!formName.trim()) {
      if (Platform.OS === 'web') {
        window.alert('Please enter a service or ride name.');
      } else {
        Alert.alert('Required', 'Please enter a service or ride name.');
      }
      return;
    }

    if (formVariants.length === 0) {
      if (Platform.OS === 'web') {
        window.alert('Please specify at least one pricing variant.');
      } else {
        Alert.alert('Required', 'Please specify at least one pricing variant.');
      }
      return;
    }

    const cleanVariants: PlaylandRideVariant[] = formVariants.map((v, i) => ({
      id: v.id || `v-${Date.now()}-${i}`,
      name: v.name.trim() || `Option ${i + 1}`,
      durationMinutes: v.durationMinutes ? Number(v.durationMinutes) : undefined,
      price: Number(v.price) || 0,
    }));

    const basePrice = cleanVariants[0]?.price || 200;

    if (editingRideId) {
      updateRide(editingRideId, {
        name: formName.trim(),
        category: formCategory,
        icon: formIcon,
        minAge: formMinAge,
        color: formColor,
        price: basePrice,
        variants: cleanVariants,
        duration: cleanVariants[0]?.name || 'Standard',
      });
    } else {
      addNewRide({
        name: formName.trim(),
        category: formCategory,
        icon: formIcon,
        minAge: formMinAge,
        color: formColor,
        price: basePrice,
        variants: cleanVariants,
        duration: cleanVariants[0]?.name || 'Standard',
        isActive: true,
      });
    }

    setIsRideModalOpen(false);
  };

  // Delete Ride Confirmation
  const handleDeleteRideConfirm = (rideId: string, rideName: string) => {
    if (Platform.OS === 'web') {
      if (window.confirm(`Are you sure you want to delete "${rideName}"?`)) {
        deleteRide(rideId);
      }
    } else {
      Alert.alert('Delete Service', `Are you sure you want to delete "${rideName}"?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteRide(rideId) },
      ]);
    }
  };

  // Print invoice
  const handlePrint = () => {
    if (Platform.OS === 'web') {
      window.print();
    }
  };

  return (
    <ScrollView style={[styles.container, isMobile && styles.containerMobile]} showsVerticalScrollIndicator={false}>
      <View style={styles.content}>
        {/* Back Link & Header */}
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.push('/admin/dashboard')}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={20} color="#4a121a" />
            <Text style={styles.backBtnText}>Dashboard</Text>
          </TouchableOpacity>

          <View style={styles.headerTitleGroup}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <SultanLogo size="sm" width={28} height={28} />
              <Text style={styles.pageHeading}>Playland & Jhooley Hub</Text>
            </View>
            <Text style={styles.pageSubheading}>
              Manage ticket invoices, configure rides, and set time-based variant pricing
            </Text>
          </View>

          <TouchableOpacity
            style={styles.openPosBtn}
            onPress={() => router.push('/playland')}
            activeOpacity={0.85}
          >
            <Ionicons name="ticket-outline" size={18} color="#4a121a" style={{ marginRight: 6 }} />
            <Text style={styles.openPosBtnText}>Open Playland POS</Text>
          </TouchableOpacity>
        </View>

        {/* Top Analytics Metrics */}
        <View style={styles.metricsGrid}>
          <View style={[styles.metricCard, { borderLeftColor: '#D5A943' }]}>
            <View style={styles.metricHeader}>
              <Text style={styles.metricLabel}>{"Today's Playland Sales"}</Text>
              <Ionicons name="cash-outline" size={20} color="#D5A943" />
            </View>
            <Text style={styles.metricValue}>PKR {metrics.todaySales.toLocaleString()}</Text>
            <Text style={styles.metricSub}>All time: PKR {metrics.totalSales.toLocaleString()}</Text>
          </View>

          <View style={[styles.metricCard, { borderLeftColor: '#4D96FF' }]}>
            <View style={styles.metricHeader}>
              <Text style={styles.metricLabel}>Tickets Issued Today</Text>
              <Ionicons name="receipt-outline" size={20} color="#4D96FF" />
            </View>
            <Text style={styles.metricValue}>{metrics.todayTicketsCount}</Text>
            <Text style={styles.metricSub}>Total Invoices: {metrics.totalTicketsCount}</Text>
          </View>

          <View style={[styles.metricCard, { borderLeftColor: '#6BCB77' }]}>
            <View style={styles.metricHeader}>
              <Text style={styles.metricLabel}>Active Jhooley & Rides</Text>
              <Ionicons name="color-palette-outline" size={20} color="#6BCB77" />
            </View>
            <Text style={styles.metricValue}>{metrics.activeRidesCount} / {metrics.totalRidesCount}</Text>
            <Text style={styles.metricSub}>Configured with multi-pricing</Text>
          </View>
        </View>

        {/* Tab Switcher */}
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'invoices' && styles.tabItemActive]}
            onPress={() => setActiveTab('invoices')}
            activeOpacity={0.8}
          >
            <Ionicons
              name="receipt"
              size={18}
              color={activeTab === 'invoices' ? '#4a121a' : '#8E8E93'}
              style={{ marginRight: 8 }}
            />
            <Text style={[styles.tabItemText, activeTab === 'invoices' && styles.tabItemTextActive]}>
              Ticket Invoices & Sales History ({tickets.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'rides' && styles.tabItemActive]}
            onPress={() => setActiveTab('rides')}
            activeOpacity={0.8}
          >
            <Ionicons
              name="settings-outline"
              size={18}
              color={activeTab === 'rides' ? '#4a121a' : '#8E8E93'}
              style={{ marginRight: 8 }}
            />
            <Text style={[styles.tabItemText, activeTab === 'rides' && styles.tabItemTextActive]}>
              Services & Jhooley Manager ({rides.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Tab 1: Invoices & Sales History */}
        {activeTab === 'invoices' && (
          <View style={styles.sectionContainer}>
            {/* Search and Date Filter Bar */}
            <View style={styles.filterBar}>
              <View style={styles.searchBox}>
                <Ionicons name="search-outline" size={18} color="#8E8E93" style={{ marginRight: 8 }} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search by ticket #, child name, phone, or cashier..."
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholderTextColor="#8E8E93"
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery('')}>
                    <Ionicons name="close-circle" size={16} color="#8E8E93" />
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.dateFilterGroup}>
                <TouchableOpacity
                  style={[styles.dateFilterBtn, dateFilter === 'today' && styles.dateFilterBtnActive]}
                  onPress={() => setDateFilter('today')}
                >
                  <Text style={[styles.dateFilterText, dateFilter === 'today' && styles.dateFilterTextActive]}>
                    Today
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.dateFilterBtn, dateFilter === 'week' && styles.dateFilterBtnActive]}
                  onPress={() => setDateFilter('week')}
                >
                  <Text style={[styles.dateFilterText, dateFilter === 'week' && styles.dateFilterTextActive]}>
                    This Week
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.dateFilterBtn, dateFilter === 'all' && styles.dateFilterBtnActive]}
                  onPress={() => setDateFilter('all')}
                >
                  <Text style={[styles.dateFilterText, dateFilter === 'all' && styles.dateFilterTextActive]}>
                    All Invoices
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Invoices List / Table */}
            {filteredTickets.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="receipt-outline" size={48} color="#C7C7CC" />
                <Text style={styles.emptyTitle}>No Playland Invoices Found</Text>
                <Text style={styles.emptySubtitle}>
                  {searchQuery ? 'Try matching another search query' : 'Tickets issued at Playland POS will appear here.'}
                </Text>
              </View>
            ) : (
              <View style={styles.invoicesList}>
                {filteredTickets.map((ticket) => {
                  const dateStr = new Date(ticket.issuedAt).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  });
                  const isRefunded = ticket.status === 'refunded';

                  return (
                    <View key={ticket.id} style={[styles.invoiceCard, isRefunded && styles.invoiceCardRefunded]}>
                      <View style={styles.invoiceHeader}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                          <View style={styles.ticketBadge}>
                            <Ionicons name="ticket" size={16} color="#D5A943" />
                            <Text style={styles.ticketBadgeCode}>{ticket.ticketCode}</Text>
                          </View>
                          <Text style={styles.invoiceTime}>{dateStr}</Text>
                        </View>

                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <View
                            style={[
                              styles.statusPill,
                              isRefunded
                                ? styles.statusRefunded
                                : ticket.status === 'used'
                                ? styles.statusUsed
                                : styles.statusActive,
                            ]}
                          >
                            <Text
                              style={[
                                styles.statusPillText,
                                isRefunded
                                  ? styles.statusRefundedText
                                  : ticket.status === 'used'
                                  ? styles.statusUsedText
                                  : styles.statusActiveText,
                              ]}
                            >
                              {ticket.status.toUpperCase()}
                            </Text>
                          </View>

                          <View style={styles.payBadge}>
                            <Text style={styles.payBadgeText}>{ticket.paymentMethod.toUpperCase()}</Text>
                          </View>
                        </View>
                      </View>

                      {/* Customer Info */}
                      <View style={styles.customerRow}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Ionicons name="person" size={14} color="#4a121a" />
                          <Text style={styles.childName}>{ticket.childName || 'Young Sultan Guest'}</Text>
                        </View>
                        {ticket.parentPhone && ticket.parentPhone !== 'N/A' && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Ionicons name="call-outline" size={13} color="#8E8E93" />
                            <Text style={styles.phoneText}>{ticket.parentPhone}</Text>
                          </View>
                        )}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
                          <Ionicons name="person-circle-outline" size={14} color="#8E8E93" />
                          <Text style={styles.cashierText}>Cashier: {ticket.issuedBy}</Text>
                        </View>
                      </View>

                      {/* Items Breakdown */}
                      <View style={styles.itemsBreakdown}>
                        {ticket.items.map((item, idx) => (
                          <View key={idx} style={styles.itemRow}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                              <Text style={styles.itemQty}>{item.qty}x</Text>
                              <Text style={styles.itemName}>
                                {item.name}
                                {item.variantName ? ` (${item.variantName})` : ''}
                              </Text>
                            </View>
                            <Text style={styles.itemPrice}>PKR {(item.price * item.qty).toLocaleString()}</Text>
                          </View>
                        ))}
                      </View>

                      {/* Invoice Footer */}
                      <View style={styles.invoiceFooter}>
                        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                          <Text style={styles.totalLabel}>Total Bill:</Text>
                          <Text style={[styles.totalValue, isRefunded && { textDecorationLine: 'line-through' }]}>
                            PKR {ticket.totalAmount.toLocaleString()}
                          </Text>
                        </View>

                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          {!isRefunded && (
                            <TouchableOpacity
                              style={styles.actionBtnSmall}
                              onPress={() => refundTicket(ticket.id)}
                            >
                              <Ionicons name="arrow-undo-outline" size={14} color="#FF3B30" />
                              <Text style={[styles.actionBtnSmallText, { color: '#FF3B30' }]}>Refund</Text>
                            </TouchableOpacity>
                          )}

                          <TouchableOpacity
                            style={[styles.actionBtnSmall, styles.actionBtnView]}
                            onPress={() => setSelectedTicketForModal(ticket)}
                          >
                            <Ionicons name="receipt-outline" size={14} color="#4a121a" />
                            <Text style={styles.actionBtnSmallText}>View Receipt</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* Tab 2: Rides & Services Manager */}
        {activeTab === 'rides' && (
          <View style={styles.sectionContainer}>
            {/* Top Controls: Add Button & Filter */}
            <View style={styles.ridesControlRow}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
                <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 4 }}>
                  <TouchableOpacity
                    style={[styles.categoryPill, categoryFilter === 'all' && styles.categoryPillActive]}
                    onPress={() => setCategoryFilter('all')}
                  >
                    <Text style={[styles.categoryPillText, categoryFilter === 'all' && styles.categoryPillTextActive]}>
                      All ({rides.length})
                    </Text>
                  </TouchableOpacity>
                  {CATEGORIES.map((cat) => {
                    const count = rides.filter((r) => r.category === cat.value).length;
                    return (
                      <TouchableOpacity
                        key={cat.value}
                        style={[styles.categoryPill, categoryFilter === cat.value && styles.categoryPillActive]}
                        onPress={() => setCategoryFilter(cat.value)}
                      >
                        <Ionicons
                          name={cat.icon}
                          size={14}
                          color={categoryFilter === cat.value ? '#ffffff' : '#4a121a'}
                          style={{ marginRight: 4 }}
                        />
                        <Text
                          style={[
                            styles.categoryPillText,
                            categoryFilter === cat.value && styles.categoryPillTextActive,
                          ]}
                        >
                          {cat.label} ({count})
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>

              <TouchableOpacity style={styles.addNewRideBtn} onPress={handleOpenAddRide} activeOpacity={0.85}>
                <Ionicons name="add-circle" size={18} color="#4a121a" style={{ marginRight: 6 }} />
                <Text style={styles.addNewRideBtnText}>+ Add New Service / Jhoola</Text>
              </TouchableOpacity>
            </View>

            {/* Rides Grid */}
            <View style={styles.ridesGrid}>
              {filteredRides.map((ride) => {
                return (
                  <View
                    key={ride.id}
                    style={[
                      styles.rideCard,
                      !ride.isActive && styles.rideCardInactive,
                      isMobile && styles.rideCardMobile,
                    ]}
                  >
                    {/* Top Row: Icon & Status Toggle */}
                    <View style={styles.rideCardHeader}>
                      <View style={[styles.rideIconCircle, { backgroundColor: ride.color || '#D5A943' }]}>
                        <Ionicons name={(ride.icon as any) || 'color-palette-outline'} size={22} color="#ffffff" />
                      </View>

                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={[styles.statusText, { color: ride.isActive ? '#27ae60' : '#8E8E93' }]}>
                          {ride.isActive ? 'Active' : 'Disabled'}
                        </Text>
                        <Switch
                          value={ride.isActive}
                          onValueChange={() => toggleRideStatus(ride.id)}
                          trackColor={{ false: '#E5E5EA', true: '#D5A943' }}
                          thumbColor={ride.isActive ? '#4a121a' : '#f4f3f4'}
                        />
                      </View>
                    </View>

                    {/* Ride Details */}
                    <Text style={styles.rideCardTitle}>{ride.name}</Text>
                    <View style={styles.rideMetaRow}>
                      <View style={styles.categoryBadge}>
                        <Text style={styles.categoryBadgeText}>
                          {ride.category.toUpperCase()}
                        </Text>
                      </View>
                      {ride.minAge && (
                        <Text style={styles.rideAgeText}>
                          <Ionicons name="body-outline" size={12} color="#8E8E93" /> {ride.minAge}
                        </Text>
                      )}
                    </View>

                    {/* Time-Based Variants Display */}
                    <View style={styles.variantsBox}>
                      <Text style={styles.variantsTitle}>Time & Pricing Variants:</Text>
                      <View style={styles.variantsList}>
                        {(ride.variants || [{ id: '1', name: ride.duration || 'Standard', price: ride.price }]).map(
                          (v) => (
                            <View key={v.id} style={styles.variantBadge}>
                              <Ionicons name="time-outline" size={12} color="#4a121a" />
                              <Text style={styles.variantBadgeName}>{v.name}</Text>
                              <Text style={styles.variantBadgePrice}>PKR {v.price}</Text>
                            </View>
                          )
                        )}
                      </View>
                    </View>

                    {/* Card Actions */}
                    <View style={styles.rideCardFooter}>
                      <TouchableOpacity
                        style={styles.rideEditBtn}
                        onPress={() => handleOpenEditRide(ride)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="create-outline" size={16} color="#4a121a" />
                        <Text style={styles.rideEditBtnText}>Edit Service & Variants</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.rideDeleteBtn}
                        onPress={() => handleDeleteRideConfirm(ride.id, ride.name)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="trash-outline" size={16} color="#FF3B30" />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Modal: Add / Edit Ride & Multi-Variant Form */}
        <Modal visible={isRideModalOpen} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, isMobile && styles.modalCardMobile]}>
              <View style={styles.modalHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={styles.modalHeaderIcon}>
                    <Ionicons name="color-palette" size={20} color="#D5A943" />
                  </View>
                  <View>
                    <Text style={styles.modalTitle}>
                      {editingRideId ? 'Edit Service / Jhoola' : 'Add New Service / Jhoola'}
                    </Text>
                    <Text style={styles.modalSubtitle}>Configure name, category, and multi-variant time pricing</Text>
                  </View>
                </View>
                <TouchableOpacity onPress={() => setIsRideModalOpen(false)}>
                  <Ionicons name="close" size={24} color="#8E8E93" />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
                {/* Service Name */}
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Service / Ride Name *</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="e.g. Sultan Giant Wheel, 9D VR Cinema, Toddler Soft Play"
                    value={formName}
                    onChangeText={setFormName}
                    placeholderTextColor="#8E8E93"
                  />
                </View>

                {/* Category & Age */}
                <View style={styles.formRow}>
                  <View style={[styles.formGroup, { flex: 1 }]}>
                    <Text style={styles.formLabel}>Category</Text>
                    <View style={styles.categorySelectRow}>
                      {CATEGORIES.map((cat) => (
                        <TouchableOpacity
                          key={cat.value}
                          style={[
                            styles.categorySelectBtn,
                            formCategory === cat.value && styles.categorySelectBtnActive,
                          ]}
                          onPress={() => setFormCategory(cat.value)}
                        >
                          <Text
                            style={[
                              styles.categorySelectText,
                              formCategory === cat.value && styles.categorySelectTextActive,
                            ]}
                          >
                            {cat.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                </View>

                <View style={styles.formRow}>
                  <View style={[styles.formGroup, { flex: 1 }]}>
                    <Text style={styles.formLabel}>Age Limit / Suitable For</Text>
                    <TextInput
                      style={styles.formInput}
                      placeholder="e.g. 3+ yrs, 5-12 yrs, All Ages"
                      value={formMinAge}
                      onChangeText={setFormMinAge}
                      placeholderTextColor="#8E8E93"
                    />
                  </View>

                  <View style={[styles.formGroup, { flex: 1 }]}>
                    <Text style={styles.formLabel}>Theme Color</Text>
                    <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                      {THEME_COLORS.map((clr) => (
                        <TouchableOpacity
                          key={clr}
                          style={[
                            styles.colorOption,
                            { backgroundColor: clr },
                            formColor === clr && styles.colorOptionActive,
                          ]}
                          onPress={() => setFormColor(clr)}
                        />
                      ))}
                    </View>
                  </View>
                </View>

                {/* Icon Selection */}
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Select Icon</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingVertical: 4 }}>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      {AVAILABLE_ICONS.map((ic) => (
                        <TouchableOpacity
                          key={ic}
                          style={[
                            styles.iconSelectBtn,
                            formIcon === ic && styles.iconSelectBtnActive,
                          ]}
                          onPress={() => setFormIcon(ic)}
                        >
                          <Ionicons
                            name={ic}
                            size={20}
                            color={formIcon === ic ? '#ffffff' : '#4a121a'}
                          />
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                </View>

                {/* Multi-Variant Time-Based Pricing Section */}
                <View style={styles.variantsSection}>
                  <View style={styles.variantsSectionHeader}>
                    <View>
                      <Text style={styles.variantsSectionTitle}>Time-Based Pricing & Variants</Text>
                      <Text style={styles.variantsSectionSubtitle}>
                        Define multiple durations & prices (e.g. 5 Mins, 10 Mins, 1 Hour, etc.)
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.addVariantBtn}
                      onPress={handleAddVariantRow}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="add" size={16} color="#4a121a" />
                      <Text style={styles.addVariantBtnText}>+ Add Variant</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.variantRowsContainer}>
                    {formVariants.map((variant, idx) => (
                      <View key={variant.id || idx} style={styles.variantInputRow}>
                        <View style={{ flex: 2 }}>
                          <Text style={styles.miniLabel}>Duration / Variant Name</Text>
                          <TextInput
                            style={styles.formInputSmall}
                            placeholder="e.g. 5 Mins, 10 Mins, 1 Round"
                            value={variant.name}
                            onChangeText={(val) => handleUpdateVariantRow(idx, 'name', val)}
                            placeholderTextColor="#8E8E93"
                          />
                        </View>

                        <View style={{ flex: 1.2 }}>
                          <Text style={styles.miniLabel}>Price (PKR) *</Text>
                          <TextInput
                            style={styles.formInputSmall}
                            placeholder="200"
                            keyboardType="numeric"
                            value={variant.price ? variant.price.toString() : ''}
                            onChangeText={(val) => handleUpdateVariantRow(idx, 'price', val)}
                            placeholderTextColor="#8E8E93"
                          />
                        </View>

                        <TouchableOpacity
                          style={styles.removeVariantBtn}
                          onPress={() => handleRemoveVariantRow(idx)}
                        >
                          <Ionicons name="trash-outline" size={18} color="#FF3B30" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                </View>
              </ScrollView>

              {/* Modal Footer */}
              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={styles.modalCancelBtn}
                  onPress={() => setIsRideModalOpen(false)}
                >
                  <Text style={styles.modalCancelBtnText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.modalSaveBtn}
                  onPress={handleSaveRide}
                  activeOpacity={0.88}
                >
                  <Ionicons name="checkmark-circle" size={18} color="#4a121a" style={{ marginRight: 6 }} />
                  <Text style={styles.modalSaveBtnText}>
                    {editingRideId ? 'Update Service' : 'Save New Service'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Modal: Full Printable Ticket / Invoice Receipt */}
        {selectedTicketForModal && (
          <Modal visible={!!selectedTicketForModal} transparent animationType="fade">
            <View style={styles.modalOverlay}>
              <View style={[styles.receiptModalCard, isMobile && { width: '92%' }]}>
                <View style={styles.receiptModalHeader}>
                  <Text style={styles.receiptModalTitle}>Playland Ticket Receipt</Text>
                  <TouchableOpacity onPress={() => setSelectedTicketForModal(null)}>
                    <Ionicons name="close" size={24} color="#8E8E93" />
                  </TouchableOpacity>
                </View>

                {/* Printable Slip */}
                <View style={styles.thermalSlip}>
                  <Text style={styles.slipBrand}>SULTAN BASEMENT PLAYLAND</Text>
                  <Text style={styles.slipSub}>Rides, Jhooley & Kids Ticketing Hub</Text>
                  <View style={styles.slipDivider} />

                  <View style={styles.slipRow}>
                    <Text style={styles.slipLabel}>TICKET #:</Text>
                    <Text style={styles.slipValueBold}>{selectedTicketForModal.ticketCode}</Text>
                  </View>
                  <View style={styles.slipRow}>
                    <Text style={styles.slipLabel}>DATE & TIME:</Text>
                    <Text style={styles.slipValue}>
                      {new Date(selectedTicketForModal.issuedAt).toLocaleString('en-US')}
                    </Text>
                  </View>
                  <View style={styles.slipRow}>
                    <Text style={styles.slipLabel}>CHILD NAME:</Text>
                    <Text style={styles.slipValue}>{selectedTicketForModal.childName}</Text>
                  </View>
                  <View style={styles.slipRow}>
                    <Text style={styles.slipLabel}>CASHIER:</Text>
                    <Text style={styles.slipValue}>{selectedTicketForModal.issuedBy}</Text>
                  </View>

                  <View style={styles.slipDivider} />
                  <Text style={styles.slipSectionTitle}>PURCHASED RIDES / SERVICES:</Text>

                  {selectedTicketForModal.items.map((item, idx) => (
                    <View key={idx} style={styles.slipItemRow}>
                      <Text style={styles.slipItemName}>
                        {item.name} {item.variantName ? `(${item.variantName})` : ''} x{item.qty}
                      </Text>
                      <Text style={styles.slipItemPrice}>PKR {item.price * item.qty}</Text>
                    </View>
                  ))}

                  <View style={styles.slipDivider} />
                  <View style={styles.slipTotalRow}>
                    <Text style={styles.slipTotalText}>TOTAL AMOUNT:</Text>
                    <Text style={styles.slipTotalAmount}>PKR {selectedTicketForModal.totalAmount}</Text>
                  </View>
                  <View style={styles.slipRow}>
                    <Text style={styles.slipLabel}>PAYMENT METHOD:</Text>
                    <Text style={styles.slipValueBold}>{selectedTicketForModal.paymentMethod.toUpperCase()}</Text>
                  </View>

                  <View style={styles.slipDivider} />
                  <Text style={styles.slipFooterNotice}>
                    ⚠️ Please wear wristband at all times. Non-refundable. Valid on date of issue only.
                  </Text>
                </View>

                {/* Receipt Actions */}
                <View style={styles.receiptActions}>
                  <TouchableOpacity style={styles.printBtn} onPress={handlePrint}>
                    <Ionicons name="print" size={18} color="#4a121a" style={{ marginRight: 6 }} />
                    <Text style={styles.printBtnText}>Print Thermal Slip</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    padding: 24,
  },
  containerMobile: {
    padding: 12,
  },
  content: {
    maxWidth: 1200,
    width: '100%',
    alignSelf: 'center',
    paddingBottom: 40,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    flexWrap: 'wrap',
    gap: 12,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(74, 18, 26, 0.08)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  backBtnText: {
    color: '#4a121a',
    fontSize: 14,
    fontWeight: '700',
  },
  headerTitleGroup: {
    flex: 1,
    minWidth: 260,
  },
  pageHeading: {
    fontSize: 24,
    fontWeight: '900',
    color: '#1C1C1E',
  },
  pageSubheading: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
  },
  openPosBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D5A943',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    shadowColor: '#D5A943',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  openPosBtnText: {
    color: '#4a121a',
    fontWeight: '800',
    fontSize: 14,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    marginBottom: 24,
  },
  metricCard: {
    flex: 1,
    minWidth: 220,
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: '#EFEFF4',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  metricHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  metricLabel: {
    fontSize: 13,
    color: '#8E8E93',
    fontWeight: '600',
  },
  metricValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1C1C1E',
    marginBottom: 2,
  },
  metricSub: {
    fontSize: 12,
    color: '#8E8E93',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#EBEBEF',
    padding: 4,
    borderRadius: 12,
    marginBottom: 20,
    gap: 4,
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  tabItemActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  tabItemText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8E8E93',
  },
  tabItemTextActive: {
    color: '#4a121a',
    fontWeight: '800',
  },
  sectionContainer: {
    gap: 16,
  },
  filterBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EFEFF4',
  },
  searchBox: {
    flex: 1,
    minWidth: 260,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#1C1C1E',
    padding: 0,
  },
  dateFilterGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  dateFilterBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#F2F2F7',
  },
  dateFilterBtnActive: {
    backgroundColor: '#4a121a',
  },
  dateFilterText: {
    fontSize: 13,
    color: '#8E8E93',
    fontWeight: '600',
  },
  dateFilterTextActive: {
    color: '#D5A943',
    fontWeight: '700',
  },
  invoicesList: {
    gap: 12,
  },
  invoiceCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EFEFF4',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  invoiceCardRefunded: {
    opacity: 0.65,
    backgroundColor: '#FFF5F5',
  },
  invoiceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    flexWrap: 'wrap',
    gap: 8,
  },
  ticketBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF9E6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  ticketBadgeCode: {
    fontSize: 13,
    fontWeight: '800',
    color: '#4a121a',
  },
  invoiceTime: {
    fontSize: 12,
    color: '#8E8E93',
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  statusActive: {
    backgroundColor: '#E8F8F0',
  },
  statusActiveText: {
    color: '#27ae60',
    fontSize: 11,
    fontWeight: '800',
  },
  statusUsed: {
    backgroundColor: '#F2F2F7',
  },
  statusUsedText: {
    color: '#8E8E93',
    fontSize: 11,
    fontWeight: '700',
  },
  statusRefunded: {
    backgroundColor: '#FFE5E5',
  },
  statusRefundedText: {
    color: '#FF3B30',
    fontSize: 11,
    fontWeight: '800',
  },
  payBadge: {
    backgroundColor: '#F2F2F7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  payBadgeText: {
    fontSize: 11,
    color: '#1C1C1E',
    fontWeight: '700',
  },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 14,
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
  },
  childName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  phoneText: {
    fontSize: 13,
    color: '#8E8E93',
  },
  cashierText: {
    fontSize: 12,
    color: '#8E8E93',
  },
  itemsBreakdown: {
    gap: 6,
    marginBottom: 10,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemQty: {
    fontSize: 13,
    fontWeight: '800',
    color: '#D5A943',
    width: 26,
  },
  itemName: {
    fontSize: 13,
    color: '#1C1C1E',
    fontWeight: '500',
  },
  itemPrice: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  invoiceFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F2F2F7',
  },
  totalLabel: {
    fontSize: 13,
    color: '#8E8E93',
    fontWeight: '600',
  },
  totalValue: {
    fontSize: 16,
    fontWeight: '900',
    color: '#4a121a',
  },
  actionBtnSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#F2F2F7',
    gap: 4,
  },
  actionBtnView: {
    backgroundColor: 'rgba(213, 169, 67, 0.15)',
    borderWidth: 1,
    borderColor: '#D5A943',
  },
  actionBtnSmallText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4a121a',
  },
  ridesControlRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  categoryPillActive: {
    backgroundColor: '#4a121a',
    borderColor: '#4a121a',
  },
  categoryPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4a121a',
  },
  categoryPillTextActive: {
    color: '#D5A943',
    fontWeight: '700',
  },
  addNewRideBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D5A943',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  addNewRideBtnText: {
    color: '#4a121a',
    fontWeight: '800',
    fontSize: 14,
  },
  ridesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  rideCard: {
    width: '32%',
    minWidth: 280,
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#EFEFF4',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 2,
  },
  rideCardMobile: {
    width: '100%',
    minWidth: '100%',
  },
  rideCardInactive: {
    opacity: 0.6,
    backgroundColor: '#F9F9F9',
  },
  rideCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  rideIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  rideCardTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1C1C1E',
    marginBottom: 4,
  },
  rideMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  categoryBadge: {
    backgroundColor: 'rgba(74, 18, 26, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  categoryBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#4a121a',
  },
  rideAgeText: {
    fontSize: 12,
    color: '#8E8E93',
  },
  variantsBox: {
    backgroundColor: '#F8F9FA',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  variantsTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8E8E93',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  variantsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  variantBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    gap: 4,
  },
  variantBadgeName: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  variantBadgePrice: {
    fontSize: 11,
    fontWeight: '800',
    color: '#D5A943',
  },
  rideCardFooter: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F2F2F7',
  },
  rideEditBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(213, 169, 67, 0.15)',
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D5A943',
    gap: 4,
  },
  rideEditBtnText: {
    color: '#4a121a',
    fontWeight: '700',
    fontSize: 12,
  },
  rideDeleteBtn: {
    padding: 8,
    backgroundColor: '#FFE5E5',
    borderRadius: 8,
  },
  emptyState: {
    backgroundColor: '#FFFFFF',
    padding: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1C1C1E',
    marginTop: 10,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 4,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 620,
    maxHeight: '90%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
    overflow: 'hidden',
  },
  modalCardMobile: {
    maxWidth: '100%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
    backgroundColor: '#FAFAFA',
  },
  modalHeaderIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: 'rgba(74, 18, 26, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#8E8E93',
  },
  modalBody: {
    padding: 18,
  },
  formGroup: {
    marginBottom: 16,
  },
  formRow: {
    flexDirection: 'row',
    gap: 12,
  },
  formLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 6,
  },
  formInput: {
    backgroundColor: '#F2F2F7',
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1C1C1E',
  },
  categorySelectRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  categorySelectBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#F2F2F7',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  categorySelectBtnActive: {
    backgroundColor: '#4a121a',
    borderColor: '#4a121a',
  },
  categorySelectText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  categorySelectTextActive: {
    color: '#D5A943',
    fontWeight: '800',
  },
  colorOption: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  colorOptionActive: {
    borderWidth: 3,
    borderColor: '#1C1C1E',
  },
  iconSelectBtn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#F2F2F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconSelectBtnActive: {
    backgroundColor: '#4a121a',
  },
  variantsSection: {
    backgroundColor: '#F8F9FA',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    marginTop: 8,
  },
  variantsSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  variantsSectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  variantsSectionSubtitle: {
    fontSize: 11,
    color: '#8E8E93',
  },
  addVariantBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D5A943',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    gap: 4,
  },
  addVariantBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#4a121a',
  },
  variantRowsContainer: {
    gap: 8,
  },
  variantInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    backgroundColor: '#FFFFFF',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  miniLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#8E8E93',
    marginBottom: 4,
  },
  formInputSmall: {
    backgroundColor: '#F2F2F7',
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 13,
    color: '#1C1C1E',
  },
  removeVariantBtn: {
    padding: 8,
    marginBottom: 2,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#F2F2F7',
    backgroundColor: '#FAFAFA',
  },
  modalCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#E5E5EA',
  },
  modalCancelBtnText: {
    color: '#1C1C1E',
    fontWeight: '700',
    fontSize: 14,
  },
  modalSaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D5A943',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
  modalSaveBtnText: {
    color: '#4a121a',
    fontWeight: '800',
    fontSize: 14,
  },
  receiptModalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
  },
  receiptModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  receiptModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  thermalSlip: {
    backgroundColor: '#FAFAFA',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    padding: 16,
  },
  slipBrand: {
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'center',
    color: '#4a121a',
    letterSpacing: 0.5,
  },
  slipSub: {
    fontSize: 11,
    color: '#8E8E93',
    textAlign: 'center',
    marginTop: 2,
  },
  slipDivider: {
    height: 1,
    backgroundColor: '#E0E0E0',
    marginVertical: 10,
    borderStyle: 'dashed',
  },
  slipRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  slipLabel: {
    fontSize: 11,
    color: '#8E8E93',
    fontWeight: '600',
  },
  slipValue: {
    fontSize: 12,
    color: '#1C1C1E',
    fontWeight: '500',
  },
  slipValueBold: {
    fontSize: 12,
    fontWeight: '800',
    color: '#4a121a',
  },
  slipSectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#4a121a',
    marginBottom: 6,
  },
  slipItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  slipItemName: {
    fontSize: 12,
    color: '#1C1C1E',
  },
  slipItemPrice: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  slipTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 4,
  },
  slipTotalText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  slipTotalAmount: {
    fontSize: 16,
    fontWeight: '900',
    color: '#4a121a',
  },
  slipFooterNotice: {
    fontSize: 10,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 14,
  },
  receiptActions: {
    marginTop: 14,
  },
  printBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D5A943',
    paddingVertical: 12,
    borderRadius: 8,
  },
  printBtnText: {
    color: '#4a121a',
    fontWeight: '800',
    fontSize: 14,
  },
});
