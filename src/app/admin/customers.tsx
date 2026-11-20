import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  Platform,
  Linking,
  Share,
  useWindowDimensions,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  useRestaurantStore,
  Customer,
  CustomerTier,
  Invoice,
} from '../../store/restaurantStore';
import { getBaseFeedbackUrl } from '../../utils/qrCode';
import { printInvoiceReceipt } from '../../components/Invoice';
import PaginationControl from '../../components/PaginationControl';
import { usePagination } from '../../hooks/usePagination';
import { useRolePermissions } from '../../store/roleStore';

/**
 * Normalizes phone numbers to standard international format (e.g. 03001234567 -> 923001234567)
 * for direct WhatsApp link resolution.
 */
function formatWhatsAppPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length === 11) {
    return `92${digits.slice(1)}`;
  }
  if (digits.startsWith('92') && digits.length === 12) {
    return digits;
  }
  return digits;
}

export default function AdminCustomers() {
  const { width } = useWindowDimensions();
  const isMobile = width < 850;
  const isSmallMobile = width < 480;

  const { canAddCustomers, canEditCustomers, canDeleteCustomers } = useRolePermissions();

  const customers = useRestaurantStore((state) => state.customers);
  const invoices = useRestaurantStore((state) => state.invoices);
  const feedbacks = useRestaurantStore((state) => state.feedbacks) || [];
  const onlineFeedbackUrl = useRestaurantStore((state) => state.onlineFeedbackUrl);

  const addCustomer = useRestaurantStore((state) => state.addCustomer);
  const updateCustomer = useRestaurantStore((state) => state.updateCustomer);
  const deleteCustomer = useRestaurantStore((state) => state.deleteCustomer);

  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [tierFilter, setTierFilter] = useState<'All' | CustomerTier>('All');
  const [sortBy, setSortBy] = useState<'spent' | 'orders' | 'points' | 'recent' | 'name'>('spent');

  // Customer 360 Dossier Modal
  const [dossierCustomer, setDossierCustomer] = useState<Customer | null>(null);
  const [dossierTab, setDossierTab] = useState<'orders' | 'feedback' | 'notes'>('orders');

  // WhatsApp Messaging Modal
  const [whatsappModalVisible, setWhatsappModalVisible] = useState(false);
  const [whatsappTargetCustomer, setWhatsappTargetCustomer] = useState<Customer | null>(null);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string>('loyalty');
  const [customMessage, setCustomMessage] = useState<string>('');

  // Add / Edit Modal
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formTier, setFormTier] = useState<CustomerTier>('Regular');
  const [formNotes, setFormNotes] = useState('');
  const [formTags, setFormTags] = useState('');

  // Financial KPIs
  const totalSpentAll = useMemo(
    () => customers.reduce((sum, c) => sum + (c.totalSpent || 0), 0),
    [customers]
  );
  const totalOrdersAll = useMemo(
    () => customers.reduce((sum, c) => sum + (c.totalOrders || 0), 0),
    [customers]
  );
  const vipCount = useMemo(
    () => customers.filter((c) => c.tier === 'VIP' || c.tier === 'Gold').length,
    [customers]
  );
  const avgRating = useMemo(() => {
    if (feedbacks.length === 0) return '4.9';
    const sum = feedbacks.reduce((acc, f) => acc + (f.overallRating || 5), 0);
    return (sum / feedbacks.length).toFixed(1);
  }, [feedbacks]);

  // Responsive KPI card width styling
  const kpiCardResponsiveStyle = useMemo<ViewStyle>(() => {
    if (width < 380) {
      return { width: '100%', minWidth: '100%' };
    }
    if (width < 768) {
      return { width: '47%', minWidth: 140 };
    }
    if (width < 1024) {
      return { width: '48%', minWidth: 180 };
    }
    return { flex: 1, minWidth: 200 };
  }, [width]);

  // Filtered & Sorted Customer List
  const filteredCustomers = useMemo(() => {
    let result = [...customers];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.phone.includes(q) ||
          (c.email && c.email.toLowerCase().includes(q)) ||
          (c.notes && c.notes.toLowerCase().includes(q)) ||
          (c.tags && c.tags.some((t) => t.toLowerCase().includes(q)))
      );
    }

    if (tierFilter !== 'All') {
      result = result.filter((c) => (c.tier || 'Regular') === tierFilter);
    }

    result.sort((a, b) => {
      if (sortBy === 'spent') return (b.totalSpent || 0) - (a.totalSpent || 0);
      if (sortBy === 'orders') return (b.totalOrders || 0) - (a.totalOrders || 0);
      if (sortBy === 'points') return (b.loyaltyPoints || 0) - (a.loyaltyPoints || 0);
      if (sortBy === 'recent') return (b.lastVisit || 0) - (a.lastVisit || 0);
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      return 0;
    });

    return result;
  }, [customers, searchQuery, tierFilter, sortBy]);

  // Pagination for Customer List
  const customerPagination = usePagination({
    data: filteredCustomers,
    initialPageSize: 10,
  });

  // Get Invoices for Dossier Customer
  const customerInvoices = useMemo(() => {
    if (!dossierCustomer) return [];
    const cleanPhone = dossierCustomer.phone.replace(/\D/g, '');
    return invoices.filter((inv) => {
      const isIdMatch = inv.customer?.id && inv.customer.id === dossierCustomer.id;
      const invCustPhone = (inv.customer?.phone || '').replace(/\D/g, '');
      const isPhoneMatch =
        cleanPhone &&
        invCustPhone &&
        (cleanPhone.endsWith(invCustPhone) || invCustPhone.endsWith(cleanPhone));
      return isIdMatch || isPhoneMatch;
    });
  }, [dossierCustomer, invoices]);

  // Get Feedbacks for Dossier Customer
  const customerFeedbacks = useMemo(() => {
    if (!dossierCustomer) return [];
    const cleanPhone = dossierCustomer.phone.replace(/\D/g, '');
    return feedbacks.filter((fb) => {
      const isIdMatch = fb.customerId && fb.customerId === dossierCustomer.id;
      const fbPhone = (fb.customerPhone || '').replace(/\D/g, '');
      const isPhoneMatch =
        cleanPhone && fbPhone && (cleanPhone.endsWith(fbPhone) || fbPhone.endsWith(cleanPhone));
      return isIdMatch || isPhoneMatch;
    });
  }, [dossierCustomer, feedbacks]);

  // Helper for Initials
  const getInitials = (name: string) => {
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  // Tier Badge Color Map
  const getTierBadgeStyle = (tier?: CustomerTier) => {
    switch (tier) {
      case 'VIP':
        return { bg: '#FEF3C7', border: '#F59E0B', text: '#92400E', icon: 'diamond', label: 'VIP' };
      case 'Gold':
        return { bg: '#FFFBEB', border: '#FBBF24', text: '#B45309', icon: 'trophy', label: 'Gold' };
      case 'Silver':
        return { bg: '#F1F5F9', border: '#94A3B8', text: '#334155', icon: 'shield-checkmark', label: 'Silver' };
      default:
        return { bg: '#EFF6FF', border: '#93C5FD', text: '#1E40AF', icon: 'person', label: 'Regular' };
    }
  };

  // Add / Edit Handlers
  const showPermAlert = (msg: string) => {
    if (Platform.OS === 'web') window.alert(msg);
    else Alert.alert('Permission Denied', msg);
  };

  const openAddModal = () => {
    if (!canAddCustomers) {
      showPermAlert('You do not have permission to add customers.');
      return;
    }
    setEditingCustomer(null);
    setFormName('');
    setFormPhone('');
    setFormEmail('');
    setFormAddress('');
    setFormTier('Regular');
    setFormNotes('');
    setFormTags('');
    setEditModalVisible(true);
  };

  const openEditModal = (cust: Customer) => {
    if (!canEditCustomers) {
      showPermAlert('You do not have permission to edit customers.');
      return;
    }
    setEditingCustomer(cust);
    setFormName(cust.name);
    setFormPhone(cust.phone);
    setFormEmail(cust.email || '');
    setFormAddress(cust.address || '');
    setFormTier(cust.tier || 'Regular');
    setFormNotes(cust.notes || '');
    setFormTags((cust.tags || []).join(', '));
    setEditModalVisible(true);
  };

  const handleSaveCustomer = () => {
    if (editingCustomer ? !canEditCustomers : !canAddCustomers) {
      showPermAlert(
        editingCustomer
          ? 'You do not have permission to edit customers.'
          : 'You do not have permission to add customers.'
      );
      return;
    }
    if (!formName.trim() || !formPhone.trim()) {
      const msg = 'Customer name and mobile number are required.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Validation Error', msg);
      return;
    }

    const tagsArray = formTags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    if (editingCustomer) {
      updateCustomer(editingCustomer.id, {
        name: formName.trim(),
        phone: formPhone.trim(),
        email: formEmail.trim() || undefined,
        address: formAddress.trim() || undefined,
        tier: formTier,
        notes: formNotes.trim() || undefined,
        tags: tagsArray.length > 0 ? tagsArray : undefined,
      });
      if (dossierCustomer?.id === editingCustomer.id) {
        setDossierCustomer({
          ...dossierCustomer,
          name: formName.trim(),
          phone: formPhone.trim(),
          email: formEmail.trim() || undefined,
          address: formAddress.trim() || undefined,
          tier: formTier,
          notes: formNotes.trim() || undefined,
          tags: tagsArray.length > 0 ? tagsArray : undefined,
        });
      }
    } else {
      addCustomer({
        name: formName.trim(),
        phone: formPhone.trim(),
        email: formEmail.trim() || undefined,
        address: formAddress.trim() || undefined,
        tier: formTier,
        notes: formNotes.trim() || undefined,
        tags: tagsArray.length > 0 ? tagsArray : undefined,
        loyaltyPoints: 50,
      });
    }
    setEditModalVisible(false);
  };

  const handleDelete = (cust: Customer) => {
    if (!canDeleteCustomers) {
      showPermAlert('You do not have permission to delete customers.');
      return;
    }
    const doDelete = () => {
      deleteCustomer(cust.id);
      if (dossierCustomer?.id === cust.id) {
        setDossierCustomer(null);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Are you sure you want to delete customer "${cust.name}"?`)) {
        doDelete();
      }
    } else {
      Alert.alert(
        'Delete Customer',
        `Are you sure you want to remove customer record for "${cust.name}"?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: doDelete },
        ]
      );
    }
  };

  // WhatsApp Messaging Logic
  const openWhatsAppModal = (cust: Customer) => {
    setWhatsappTargetCustomer(cust);
    setSelectedTemplateKey('loyalty');
    setCustomMessage(buildWhatsAppMessage(cust, 'loyalty'));
    setWhatsappModalVisible(true);
  };

  const buildWhatsAppMessage = (cust: Customer, templateKey: string): string => {
    const feedbackUrl = `${getBaseFeedbackUrl(onlineFeedbackUrl)}/feedback`;
    const tier = cust.tier || 'Regular';
    const points = cust.loyaltyPoints || 50;

    switch (templateKey) {
      case 'loyalty':
        return `Assalam-o-Alaikum ${cust.name}!\n\nThank you for dining with Sultan Restaurant. Your VIP status is *${tier}* with *${points} Sultan Loyalty Points*.\n\nWe hope you enjoyed our royal cuisine and look forward to welcoming you back soon!\n\n*Sultan Restaurant* - Luxury Dining & Banquet`;

      case 'voucher':
        return `Assalam-o-Alaikum ${cust.name}!\n\nAs a valued Sultan guest, we are thrilled to offer you an exclusive *10% Royal Discount* on your next visit!\n\nUse Voucher Code: *SULTAN-VIP10*\nShow this code when placing your dine-in or takeaway order. Valid this week.\n\n*Sultan Restaurant*`;

      case 'feedback':
        return `Assalam-o-Alaikum ${cust.name}!\n\nWe value your opinion! Please take a quick moment to rate each dish from your recent visit:\n${feedbackUrl}\n\nGiving feedback automatically credits *+50 Loyalty Points* to your account!\n\n*Sultan Restaurant*`;

      case 'missyou':
        return `Assalam-o-Alaikum ${cust.name}!\n\nWe haven't seen you at Sultan Restaurant recently and miss serving you! Your favorite dishes are waiting for you.\n\nVisit us this weekend and enjoy a complimentary dessert on bills over Rs. 3,000.\n\n*Sultan Restaurant* - Food Street, Lahore`;

      case 'custom':
      default:
        return `Assalam-o-Alaikum ${cust.name}!\n\n`;
    }
  };

  const handleTemplateSelect = (key: string) => {
    setSelectedTemplateKey(key);
    if (whatsappTargetCustomer) {
      setCustomMessage(buildWhatsAppMessage(whatsappTargetCustomer, key));
    }
  };

  const sendWhatsAppMessage = () => {
    if (!whatsappTargetCustomer) return;
    const phone = formatWhatsAppPhone(whatsappTargetCustomer.phone);
    if (!phone) {
      const msg = 'Customer does not have a valid mobile number.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Invalid Phone', msg);
      return;
    }

    const encodedText = encodeURIComponent(customMessage.trim());
    const waUrl = `https://wa.me/${phone}?text=${encodedText}`;

    if (Platform.OS === 'web') {
      window.open(waUrl, '_blank');
    } else {
      Linking.openURL(waUrl);
    }
    setWhatsappModalVisible(false);
  };

  // Export Filtered Customers to CSV
  const handleExportCSV = () => {
    if (filteredCustomers.length === 0) {
      const msg = 'No customers found matching current filter criteria.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Export Notice', msg);
      return;
    }

    const headers = 'ID,Name,Phone,Email,Tier,Loyalty Points,Total Visits,Lifetime Spent (Rs.),Address,Tags,Notes\n';
    const rows = filteredCustomers
      .map((c) => {
        const tagsStr = (c.tags || []).join('; ');
        const notesStr = (c.notes || '').replace(/"/g, '""');
        const addrStr = (c.address || '').replace(/"/g, '""');
        return `"${c.id}","${c.name}","${c.phone}","${c.email || ''}","${c.tier || 'Regular'}","${c.loyaltyPoints || 50}","${c.totalOrders || 0}","${c.totalSpent || 0}","${addrStr}","${tagsStr}","${notesStr}"`;
      })
      .join('\n');

    const csvContent = headers + rows;

    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `sultan_customers_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      Share.share({
        message: csvContent,
        title: `Sultan_Customers_Export_${Date.now()}.csv`,
      });
    }
  };

  return (
    <View style={[styles.container, isMobile && styles.containerMobile]}>
      {/* Top Header */}
      <View style={[styles.header, isMobile && styles.headerMobile]}>
        <View style={styles.headerLeft}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Ionicons name="people" size={24} color="#D5A943" />
            <Text style={[styles.title, isMobile && styles.titleMobile]}>
              Customer CRM & Loyalty Hub
            </Text>
            <View style={styles.roleBadge}>
              <Text style={styles.roleBadgeText}>ADMIN CRM</Text>
            </View>
          </View>
          <Text style={styles.subtitle}>
            Comprehensive 360° guest records, WhatsApp direct messaging, bills & ratings
          </Text>
        </View>

        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.exportBtn}
            onPress={handleExportCSV}
            activeOpacity={0.8}
            {...(Platform.OS === 'web' ? ({ className: 'interactive-btn', title: 'Export Customers List to CSV' } as any) : {})}
          >
            <Ionicons name="download-outline" size={16} color="#52141C" style={{ marginRight: 6 }} />
            <Text style={styles.exportBtnText}>{isSmallMobile ? 'Export' : 'Export CSV'}</Text>
          </TouchableOpacity>

          {canAddCustomers && (
            <TouchableOpacity
              style={[styles.addButton, isSmallMobile && { flex: 1 }]}
              onPress={openAddModal}
              activeOpacity={0.8}
              {...(Platform.OS === 'web' ? ({ className: 'interactive-btn', title: 'Register a New Customer Record' } as any) : {})}
            >
              <Ionicons name="person-add" size={16} color="#140306" style={{ marginRight: 6 }} />
              <Text style={styles.addButtonText}>{isSmallMobile ? 'New Customer' : 'Register New Customer'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView style={styles.contentScroll} showsVerticalScrollIndicator={false}>
        {/* 4 KPI Metrics Header (Liquid Glass Info Boxes) */}
        <View style={styles.kpiGrid}>
          <View
            style={[styles.kpiCard, styles.kpiCardSapphire, kpiCardResponsiveStyle]}
            {...(Platform.OS === 'web' ? ({ className: 'interactive-card' } as any) : {})}
          >
            <View style={[styles.kpiIconWrap, { backgroundColor: 'rgba(2, 132, 199, 0.18)' }]}>
              <Ionicons name="people" size={20} color="#0284C7" />
            </View>
            <View>
              <Text style={[styles.kpiLabel, { color: '#075985' }]}>Total Diners</Text>
              <Text style={[styles.kpiValue, { color: '#0369A1' }]}>{customers.length}</Text>
              <Text style={[styles.kpiSub, { color: '#075985' }]}>Active patrons in CRM</Text>
            </View>
          </View>

          <View
            style={[styles.kpiCard, styles.kpiCardAmber, kpiCardResponsiveStyle]}
            {...(Platform.OS === 'web' ? ({ className: 'interactive-card' } as any) : {})}
          >
            <View style={[styles.kpiIconWrap, { backgroundColor: 'rgba(245, 158, 11, 0.18)' }]}>
              <Ionicons name="diamond" size={20} color="#D97706" />
            </View>
            <View>
              <Text style={[styles.kpiLabel, { color: '#92400E' }]}>VIP & Gold Guests</Text>
              <Text style={[styles.kpiValue, { color: '#B45309' }]}>{vipCount}</Text>
              <Text style={[styles.kpiSub, { color: '#92400E' }]}>Top loyalty tier diners</Text>
            </View>
          </View>

          <View
            style={[styles.kpiCard, styles.kpiCardEmerald, kpiCardResponsiveStyle]}
            {...(Platform.OS === 'web' ? ({ className: 'interactive-card' } as any) : {})}
          >
            <View style={[styles.kpiIconWrap, { backgroundColor: 'rgba(16, 185, 129, 0.18)' }]}>
              <Ionicons name="wallet" size={20} color="#059669" />
            </View>
            <View>
              <Text style={[styles.kpiLabel, { color: '#065F46' }]}>Lifetime Revenue</Text>
              <Text style={[styles.kpiValue, { color: '#047857' }]}>
                Rs. {totalSpentAll.toLocaleString()}
              </Text>
              <Text style={[styles.kpiSub, { color: '#065F46' }]}>Across {totalOrdersAll} total visits</Text>
            </View>
          </View>

          <View
            style={[styles.kpiCard, styles.kpiCardRuby, kpiCardResponsiveStyle]}
            {...(Platform.OS === 'web' ? ({ className: 'interactive-card' } as any) : {})}
          >
            <View style={[styles.kpiIconWrap, { backgroundColor: 'rgba(239, 68, 68, 0.18)' }]}>
              <Ionicons name="star" size={20} color="#DC2626" />
            </View>
            <View>
              <Text style={[styles.kpiLabel, { color: '#991B1B' }]}>Guest Feedback</Text>
              <Text style={[styles.kpiValue, { color: '#DC2626' }]}>
                {avgRating}/5 ({feedbacks.length})
              </Text>
              <Text style={[styles.kpiSub, { color: '#991B1B' }]}>Item ratings & comments</Text>
            </View>
          </View>
        </View>

        {/* Search Bar & Tier Tabs */}
        <View style={styles.filterSection}>
          <View style={[styles.searchRow, isSmallMobile && { flexDirection: 'column', alignItems: 'stretch' }]}>
            <View style={styles.searchBox}>
              <View style={styles.searchIconOrb}>
                <Ionicons name="search" size={16} color="#52141C" />
              </View>
              <TextInput
                style={styles.searchInput}
                placeholder="Search by name, phone, email, notes, or tags..."
                placeholderTextColor="#8A7A70"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery ? (
                <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.searchClearBtn}>
                  <Ionicons name="close-circle" size={18} color="#D5A943" />
                </TouchableOpacity>
              ) : (
                <View style={styles.searchShortcutBadge}>
                  <Ionicons name="sparkles" size={11} color="#B45309" style={{ marginRight: 3 }} />
                  <Text style={styles.searchShortcutText}>CRM</Text>
                </View>
              )}
            </View>

            {/* Sort Selector */}
            <View style={[styles.sortContainer, isSmallMobile && { alignSelf: 'flex-start' }]}>
              <Ionicons name="swap-vertical" size={16} color="#52141C" style={{ marginRight: 4 }} />
              <TouchableOpacity
                onPress={() => {
                  if (sortBy === 'spent') setSortBy('orders');
                  else if (sortBy === 'orders') setSortBy('points');
                  else if (sortBy === 'points') setSortBy('recent');
                  else if (sortBy === 'recent') setSortBy('name');
                  else setSortBy('spent');
                }}
                style={styles.sortBtn}
              >
                <Text style={styles.sortBtnText}>
                  {sortBy === 'spent' && 'Highest Spend'}
                  {sortBy === 'orders' && 'Most Visits'}
                  {sortBy === 'points' && 'Loyalty Points'}
                  {sortBy === 'recent' && 'Recent Visit'}
                  {sortBy === 'name' && 'Name (A-Z)'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Tier Tabs Row */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tierTabsRow}
          >
            {(['All', 'VIP', 'Gold', 'Silver', 'Regular'] as const).map((tier) => {
              const count =
                tier === 'All'
                  ? customers.length
                  : customers.filter((c) => (c.tier || 'Regular') === tier).length;
              const isSelected = tierFilter === tier;

              return (
                <TouchableOpacity
                  key={tier}
                  style={[styles.tierTab, isSelected && styles.tierTabSelected]}
                  onPress={() => setTierFilter(tier)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[styles.tierTabText, isSelected && styles.tierTabTextSelected]}
                  >
                    {tier === 'VIP' ? 'VIP' : tier === 'Gold' ? 'Gold' : tier === 'Silver' ? 'Silver' : tier} ({count})
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Results Counter & Reset */}
        <View style={styles.resultsCounterRow}>
          <Text style={styles.resultsCountText}>
            Showing <Text style={{ fontWeight: '800', color: '#0F172A' }}>{filteredCustomers.length}</Text> customer(s)
          </Text>
          {(searchQuery || tierFilter !== 'All' || sortBy !== 'spent') && (
            <TouchableOpacity
              onPress={() => {
                setSearchQuery('');
                setTierFilter('All');
                setSortBy('spent');
              }}
              style={styles.clearFilterBtn}
            >
              <Ionicons name="refresh" size={13} color="#D84315" style={{ marginRight: 4 }} />
              <Text style={styles.clearFilterText}>Reset Filters</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Customer List Container */}
        {filteredCustomers.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={54} color="#CBD5E1" />
            <Text style={styles.emptyText}>No customers found</Text>
            <Text style={styles.emptySubtext}>
              No guests match your search criteria. Try a different query or register a new customer.
            </Text>
            {canAddCustomers && (
              <TouchableOpacity style={styles.emptyActionBtn} onPress={openAddModal}>
                <Ionicons name="person-add" size={15} color="#140306" style={{ marginRight: 6 }} />
                <Text style={styles.emptyActionBtnText}>Register Customer</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.customersList}>
            {/* Desktop Table Column Header */}
            {!isMobile && (
              <View style={styles.tableHeaderRow}>
                <View style={[styles.thCol, { flex: 2.5, minWidth: 200 }]}>
                  <Text style={styles.thText}>CUSTOMER & TIER</Text>
                </View>
                <View style={[styles.thCol, { flex: 2.2, minWidth: 180 }]}>
                  <Text style={styles.thText}>CONTACT & ADDRESS</Text>
                </View>
                <View style={[styles.thCol, { flex: 1.8, minWidth: 140 }]}>
                  <Text style={styles.thText}>SPEND & VISITS</Text>
                </View>
                <View style={[styles.thCol, { flex: 1.8, minWidth: 140 }]}>
                  <Text style={styles.thText}>LOYALTY & TAGS</Text>
                </View>
                <View style={[styles.thCol, { flex: 2.5, minWidth: 210, alignItems: 'flex-end' }]}>
                  <Text style={styles.thText}>ACTIONS</Text>
                </View>
              </View>
            )}

            {customerPagination.paginatedData.map((cust) => {
              const badge = getTierBadgeStyle(cust.tier);

              if (isMobile) {
                return (
                  <View
                    key={cust.id}
                    style={[
                      styles.mobileCustCard,
                      cust.tier === 'VIP' && styles.custRowVIP,
                      cust.tier === 'Gold' && styles.custRowGold,
                    ]}
                  >
                    {/* Top Row: Avatar + Name + Tier on left; Spend + Visits on right */}
                    <View style={styles.mobileCardTopRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                        <View style={[styles.avatarCompact, { backgroundColor: badge.bg, borderColor: badge.border }]}>
                          <Text style={[styles.avatarTextCompact, { color: badge.text }]}>
                            {getInitials(cust.name)}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.rowCustName} numberOfLines={1}>{cust.name}</Text>
                          <View style={[styles.tierBadgeCompact, { backgroundColor: badge.bg, borderColor: badge.border, alignSelf: 'flex-start', marginTop: 2 }]}>
                            <Ionicons name={badge.icon as any} size={10} color={badge.text} style={{ marginRight: 2 }} />
                            <Text style={[styles.tierBadgeCompactText, { color: badge.text }]}>
                              {cust.tier || 'Regular'}
                            </Text>
                          </View>
                        </View>
                      </View>

                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={styles.mobileSpendText}>
                          Rs. {(cust.totalSpent || 0).toLocaleString()}
                        </Text>
                        <Text style={styles.mobileVisitsText}>
                          {cust.totalOrders || 0} visits
                        </Text>
                      </View>
                    </View>

                    {/* Middle Row: Phone & Points & Location */}
                    <View style={styles.mobileCardMidRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name="call" size={12} color="#D5A943" />
                        <Text style={styles.mobilePhoneText}>{cust.phone}</Text>
                      </View>
                      <View style={styles.pointsPillCompact}>
                        <Ionicons name="sparkles" size={10} color="#D5A943" />
                        <Text style={styles.pointsPillCompactText}>{cust.loyaltyPoints || 50} Pts</Text>
                      </View>
                      {cust.address ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 }}>
                          <Ionicons name="location-outline" size={11} color="#94A3B8" />
                          <Text style={styles.mobileAddressText} numberOfLines={1}>{cust.address}</Text>
                        </View>
                      ) : null}
                    </View>

                    {/* Bottom Row: Actions */}
                    <View style={styles.mobileCardActionRow}>
                      <TouchableOpacity
                        style={styles.mobileActionBtnView}
                        onPress={() => {
                          setDossierCustomer(cust);
                          setDossierTab('orders');
                        }}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="eye" size={13} color="#52141C" />
                        <Text style={styles.actionBtnViewText}>View</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.mobileActionBtnWhatsApp}
                        onPress={() => openWhatsAppModal(cust)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="logo-whatsapp" size={13} color="#FFFFFF" />
                        <Text style={styles.actionBtnWhatsAppText}>WhatsApp</Text>
                      </TouchableOpacity>

                      {canEditCustomers && (
                        <TouchableOpacity
                          style={styles.actionBtnEdit}
                          onPress={() => openEditModal(cust)}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="pencil" size={13} color="#475569" />
                        </TouchableOpacity>
                      )}

                      {canDeleteCustomers && (
                        <TouchableOpacity
                          style={styles.actionBtnDelete}
                          onPress={() => handleDelete(cust)}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="trash-outline" size={13} color="#EF4444" />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              }

              // Desktop / Tablet Horizontal Data Strip
              return (
                <View
                  key={cust.id}
                  style={[
                    styles.custRowCard,
                    cust.tier === 'VIP' && styles.custRowVIP,
                    cust.tier === 'Gold' && styles.custRowGold,
                  ]}
                  {...(Platform.OS === 'web' ? ({ className: 'interactive-table-row' } as any) : {})}
                >
                  {/* 1. Customer & Tier */}
                  <View style={[styles.rowCol, { flex: 2.5, minWidth: 200, flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
                    <View style={[styles.avatarCompact, { backgroundColor: badge.bg, borderColor: badge.border }]}>
                      <Text style={[styles.avatarTextCompact, { color: badge.text }]}>
                        {getInitials(cust.name)}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowCustName} numberOfLines={1}>{cust.name}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        <View style={[styles.tierBadgeCompact, { backgroundColor: badge.bg, borderColor: badge.border }]}>
                          <Ionicons name={badge.icon as any} size={10} color={badge.text} style={{ marginRight: 2 }} />
                          <Text style={[styles.tierBadgeCompactText, { color: badge.text }]}>
                            {cust.tier || 'Regular'}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>

                  {/* 2. Contact & Location */}
                  <View style={[styles.rowCol, { flex: 2.2, minWidth: 180, gap: 2 }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="call" size={12} color="#D5A943" />
                      <Text style={styles.rowPhoneText}>{cust.phone}</Text>
                    </View>
                    {cust.address ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name="location-outline" size={11} color="#94A3B8" />
                        <Text style={styles.rowAddressText} numberOfLines={1}>{cust.address}</Text>
                      </View>
                    ) : cust.email ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name="mail-outline" size={11} color="#94A3B8" />
                        <Text style={styles.rowAddressText} numberOfLines={1}>{cust.email}</Text>
                      </View>
                    ) : null}
                  </View>

                  {/* 3. Spend & Visits */}
                  <View style={[styles.rowCol, { flex: 1.8, minWidth: 140, gap: 2 }]}>
                    <Text style={styles.rowSpendText}>
                      Rs. {(cust.totalSpent || 0).toLocaleString()}
                    </Text>
                    <Text style={styles.rowVisitsText}>
                      {cust.totalOrders || 0} {(cust.totalOrders || 0) === 1 ? 'Visit' : 'Visits'}
                    </Text>
                  </View>

                  {/* 4. Loyalty Points & Tags */}
                  <View style={[styles.rowCol, { flex: 1.8, minWidth: 140, gap: 3 }]}>
                    <View style={styles.pointsPillCompact}>
                      <Ionicons name="sparkles" size={11} color="#D5A943" />
                      <Text style={styles.pointsPillCompactText}>{cust.loyaltyPoints || 50} Pts</Text>
                    </View>
                    {cust.tags && cust.tags.length > 0 && (
                      <Text style={styles.rowTagSnippet} numberOfLines={1}>
                        {cust.tags.map((t) => `#${t}`).join(' ')}
                      </Text>
                    )}
                  </View>

                  {/* 5. Actions */}
                  <View style={[styles.rowCol, { flex: 2.5, minWidth: 210, flexDirection: 'row', justifyContent: 'flex-end', gap: 6, alignItems: 'center' }]}>
                    {/* View / 360 Dossier Button */}
                    <TouchableOpacity
                      style={styles.actionBtnView}
                      onPress={() => {
                        setDossierCustomer(cust);
                        setDossierTab('orders');
                      }}
                      activeOpacity={0.75}
                      {...(Platform.OS === 'web' ? ({ className: 'interactive-btn', title: 'View Customer 360 Dossier & History' } as any) : {})}
                    >
                      <Ionicons name="eye" size={14} color="#52141C" />
                      <Text style={styles.actionBtnViewText}>View</Text>
                    </TouchableOpacity>

                    {/* WhatsApp Button */}
                    <TouchableOpacity
                      style={styles.actionBtnWhatsApp}
                      onPress={() => openWhatsAppModal(cust)}
                      activeOpacity={0.75}
                      {...(Platform.OS === 'web' ? ({ className: 'interactive-btn', title: 'Send Direct WhatsApp Message' } as any) : {})}
                    >
                      <Ionicons name="logo-whatsapp" size={13} color="#FFFFFF" />
                      <Text style={styles.actionBtnWhatsAppText}>WhatsApp</Text>
                    </TouchableOpacity>

                    {/* Edit Button */}
                    {canEditCustomers && (
                      <TouchableOpacity
                        style={styles.actionBtnEdit}
                        onPress={() => openEditModal(cust)}
                        activeOpacity={0.75}
                        {...(Platform.OS === 'web' ? ({ className: 'interactive-btn', title: 'Edit Customer Profile' } as any) : {})}
                      >
                        <Ionicons name="pencil" size={13} color="#475569" />
                      </TouchableOpacity>
                    )}

                    {/* Delete Button */}
                    {canDeleteCustomers && (
                      <TouchableOpacity
                        style={styles.actionBtnDelete}
                        onPress={() => handleDelete(cust)}
                        activeOpacity={0.75}
                        {...(Platform.OS === 'web' ? ({ className: 'interactive-btn', title: 'Delete Customer' } as any) : {})}
                      >
                        <Ionicons name="trash-outline" size={13} color="#EF4444" />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })}

            {/* Pagination Controls */}
            <View style={{ marginTop: 12 }}>
              <PaginationControl
                currentPage={customerPagination.currentPage}
                totalPages={customerPagination.totalPages}
                totalItems={customerPagination.totalItems}
                pageSize={customerPagination.pageSize}
                pageSizeOptions={[10, 20, 50, 100]}
                onPageChange={customerPagination.goToPage}
                onPageSizeChange={customerPagination.setPageSize}
                itemName="guests"
              />
            </View>
          </View>
        )}
      </ScrollView>

      {/* ========================================================
          1. WHATSAPP MESSAGING MODAL
          ======================================================== */}
      <Modal visible={whatsappModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.whatsappModalCard, isMobile && styles.modalContentMobile]}>
            <View style={styles.whatsappModalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={styles.whatsappIconCircle}>
                  <Ionicons name="logo-whatsapp" size={24} color="#FFFFFF" />
                </View>
                <View>
                  <Text style={styles.modalHeaderTitle}>WhatsApp Direct Message</Text>
                  <Text style={styles.modalHeaderSub}>
                    To: {whatsappTargetCustomer?.name} ({whatsappTargetCustomer?.phone})
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setWhatsappModalVisible(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Quick Template Selector */}
            <Text style={styles.fieldSectionTitle}>Choose Message Template:</Text>
            <View style={styles.templateOptionsRow}>
              {[
                { key: 'loyalty', label: 'Loyalty Thanks' },
                { key: 'voucher', label: '10% VIP Voucher' },
                { key: 'feedback', label: 'Dish Feedback QR' },
                { key: 'missyou', label: 'We Miss You' },
                { key: 'custom', label: 'Custom' },
              ].map((tmpl) => (
                <TouchableOpacity
                  key={tmpl.key}
                  style={[
                    styles.templatePill,
                    selectedTemplateKey === tmpl.key && styles.templatePillActive,
                  ]}
                  onPress={() => handleTemplateSelect(tmpl.key)}
                >
                  <Text
                    style={[
                      styles.templatePillText,
                      selectedTemplateKey === tmpl.key && styles.templatePillTextActive,
                    ]}
                  >
                    {tmpl.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldSectionTitle}>Message Text (Live Preview):</Text>
            <TextInput
              style={styles.messageTextArea}
              multiline
              value={customMessage}
              onChangeText={setCustomMessage}
              placeholder="Type your WhatsApp message here..."
              placeholderTextColor="#94A3B8"
            />

            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setWhatsappModalVisible(false)}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalSendWhatsAppBtn}
                onPress={sendWhatsAppMessage}
                activeOpacity={0.8}
              >
                <Ionicons name="logo-whatsapp" size={17} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.modalSendWhatsAppBtnText}>Open in WhatsApp</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================
          2. CUSTOMER 360 DOSSIER MODAL (FULL RECORDS & HISTORY)
          ======================================================== */}
      <Modal visible={!!dossierCustomer} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.dossierModalCard, isMobile && styles.modalContentMobile]}>
            {dossierCustomer && (
              <>
                {/* Dossier Header */}
                <View style={styles.dossierHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={[styles.dossierAvatar, { backgroundColor: getTierBadgeStyle(dossierCustomer.tier).bg, borderColor: getTierBadgeStyle(dossierCustomer.tier).border }]}>
                      <Text style={[styles.dossierAvatarText, { color: getTierBadgeStyle(dossierCustomer.tier).text }]}>
                        {getInitials(dossierCustomer.name)}
                      </Text>
                    </View>
                    <View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <Text style={styles.dossierName}>{dossierCustomer.name}</Text>
                        <View style={[styles.tierBadgeCompact, { backgroundColor: getTierBadgeStyle(dossierCustomer.tier).bg, borderColor: getTierBadgeStyle(dossierCustomer.tier).border }]}>
                          <Ionicons name={getTierBadgeStyle(dossierCustomer.tier).icon as any} size={11} color={getTierBadgeStyle(dossierCustomer.tier).text} style={{ marginRight: 3 }} />
                          <Text style={[styles.tierBadgeCompactText, { color: getTierBadgeStyle(dossierCustomer.tier).text }]}>
                            {dossierCustomer.tier || 'Regular'}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.dossierPhone}>
                        {dossierCustomer.phone} {dossierCustomer.email ? `• ${dossierCustomer.email}` : ''}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => setDossierCustomer(null)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="close" size={24} color="#64748B" />
                  </TouchableOpacity>
                </View>

                {/* Lifetime KPI Summary */}
                <View style={styles.dossierKpiRow}>
                  <View style={styles.dossierKpiBox}>
                    <Text style={styles.dossierKpiLabel}>Tier Status</Text>
                    <Text style={styles.dossierKpiVal}>{dossierCustomer.tier || 'Regular'}</Text>
                  </View>
                  <View style={styles.dossierKpiBox}>
                    <Text style={styles.dossierKpiLabel}>Lifetime Spent</Text>
                    <Text style={[styles.dossierKpiVal, { color: '#15803D' }]}>
                      Rs. {(dossierCustomer.totalSpent || 0).toLocaleString()}
                    </Text>
                  </View>
                  <View style={styles.dossierKpiBox}>
                    <Text style={styles.dossierKpiLabel}>Total Visits</Text>
                    <Text style={styles.dossierKpiVal}>{dossierCustomer.totalOrders || 0}</Text>
                  </View>
                  <View style={styles.dossierKpiBox}>
                    <Text style={styles.dossierKpiLabel}>Average Bill</Text>
                    <Text style={styles.dossierKpiVal}>
                      Rs.{' '}
                      {dossierCustomer.totalOrders
                        ? Math.round(dossierCustomer.totalSpent / dossierCustomer.totalOrders).toLocaleString()
                        : '0'}
                    </Text>
                  </View>
                  <View style={styles.dossierKpiBox}>
                    <Text style={styles.dossierKpiLabel}>Loyalty Points</Text>
                    <Text style={[styles.dossierKpiVal, { color: '#B45309' }]}>
                      {dossierCustomer.loyaltyPoints || 50} pts
                    </Text>
                  </View>
                </View>

                {/* Sub-tabs */}
                <View style={styles.dossierTabsRow}>
                  <TouchableOpacity
                    style={[styles.dossierTab, dossierTab === 'orders' && styles.dossierTabActive]}
                    onPress={() => setDossierTab('orders')}
                  >
                    <Ionicons name="receipt-outline" size={15} color={dossierTab === 'orders' ? '#52141C' : '#64748B'} style={{ marginRight: 6 }} />
                    <Text style={[styles.dossierTabText, dossierTab === 'orders' && styles.dossierTabTextActive]}>
                      Invoices & Bills ({customerInvoices.length})
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.dossierTab, dossierTab === 'feedback' && styles.dossierTabActive]}
                    onPress={() => setDossierTab('feedback')}
                  >
                    <Ionicons name="star-outline" size={15} color={dossierTab === 'feedback' ? '#52141C' : '#64748B'} style={{ marginRight: 6 }} />
                    <Text style={[styles.dossierTabText, dossierTab === 'feedback' && styles.dossierTabTextActive]}>
                      Dish Reviews ({customerFeedbacks.length})
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.dossierTab, dossierTab === 'notes' && styles.dossierTabActive]}
                    onPress={() => setDossierTab('notes')}
                  >
                    <Ionicons name="document-text-outline" size={15} color={dossierTab === 'notes' ? '#52141C' : '#64748B'} style={{ marginRight: 6 }} />
                    <Text style={[styles.dossierTabText, dossierTab === 'notes' && styles.dossierTabTextActive]}>
                      Profile & Notes
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Tab Content */}
                <ScrollView style={styles.dossierScroll} showsVerticalScrollIndicator={false}>
                  {dossierTab === 'orders' && (
                    <View style={{ gap: 10 }}>
                      {customerInvoices.length === 0 ? (
                        <Text style={styles.tabEmptyText}>
                          No previous orders or bills found for this customer.
                        </Text>
                      ) : (
                        customerInvoices.map((inv: Invoice) => (
                          <View key={inv.id} style={styles.dossierOrderCard}>
                            <View style={styles.dossierOrderHeader}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <Text style={styles.dossierOrderId}>#{inv.id}</Text>
                                <View style={styles.dossierTypeBadge}>
                                  <Text style={styles.dossierTypeBadgeText}>
                                    {inv.orderType.toUpperCase()}
                                    {inv.tableName ? ` • ${inv.tableName}` : ''}
                                  </Text>
                                </View>
                              </View>
                              <Text style={styles.dossierOrderDate}>
                                {new Date(inv.timeSettled || inv.timePlaced).toLocaleDateString()}
                              </Text>
                            </View>

                            {/* Items list */}
                            <Text style={styles.dossierOrderItems} numberOfLines={2}>
                              {(inv.items || []).map((it) => `${it.qty}x ${it.name}`).join(', ')}
                            </Text>

                            <View style={styles.dossierOrderFooter}>
                              <Text style={styles.dossierOrderTotal}>
                                Total: Rs. {(inv.total || 0).toLocaleString()}
                              </Text>
                              <TouchableOpacity
                                style={styles.dossierPrintBtn}
                                onPress={() => printInvoiceReceipt(inv)}
                                activeOpacity={0.8}
                              >
                                <Ionicons name="print-outline" size={14} color="#140306" style={{ marginRight: 4 }} />
                                <Text style={styles.dossierPrintBtnText}>Print Bill</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        ))
                      )}
                    </View>
                  )}

                  {dossierTab === 'feedback' && (
                    <View style={{ gap: 12 }}>
                      {customerFeedbacks.length === 0 ? (
                        <Text style={styles.tabEmptyText}>
                          No item-wise feedback submitted by this customer yet.
                        </Text>
                      ) : (
                        customerFeedbacks.map((fb) => (
                          <View key={fb.id} style={styles.dossierFeedbackCard}>
                            <View style={styles.dossierFeedbackHeader}>
                              <Text style={styles.dossierFeedbackScore}>
                                {fb.overallRating}/5 Rating
                              </Text>
                              <Text style={styles.dossierOrderDate}>
                                Bill #{fb.invoiceId} • {new Date(fb.createdAt).toLocaleDateString()}
                              </Text>
                            </View>

                            {fb.generalComments && (
                              <Text style={styles.dossierFeedbackComment}>
                                {'“'}{fb.generalComments}{'”'}
                              </Text>
                            )}

                            {/* Item Ratings */}
                            {fb.items && fb.items.length > 0 && (
                              <View style={styles.dishFeedbackList}>
                                {fb.items.map((it, idx) => (
                                  <View key={idx} style={styles.dishFeedbackRow}>
                                    <Text style={styles.dishFeedbackName}>
                                      {it.itemName}: {it.rating}/5
                                    </Text>
                                    {it.tags && it.tags.length > 0 && (
                                      <Text style={styles.dishFeedbackTags}>
                                        {it.tags.join(', ')}
                                      </Text>
                                    )}
                                  </View>
                                ))}
                              </View>
                            )}
                          </View>
                        ))
                      )}
                    </View>
                  )}

                  {dossierTab === 'notes' && (
                    <View style={styles.dossierProfileSection}>
                      <Text style={styles.dossierSectionHeading}>Address & Location</Text>
                      <Text style={styles.dossierSectionBody}>
                        {dossierCustomer.address || 'No delivery/billing address saved.'}
                      </Text>

                      <Text style={[styles.dossierSectionHeading, { marginTop: 14 }]}>
                        Staff Notes & Dietary Preferences
                      </Text>
                      <Text style={styles.dossierSectionBody}>
                        {dossierCustomer.notes || 'No special notes recorded for this diner.'}
                      </Text>

                      <Text style={[styles.dossierSectionHeading, { marginTop: 14 }]}>
                        Customer Tags
                      </Text>
                      <View style={styles.tagsRow}>
                        {(dossierCustomer.tags || ['Regular Diner']).map((t, idx) => (
                          <View key={idx} style={styles.tagBadge}>
                            <Text style={styles.tagBadgeText}>#{t}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                </ScrollView>

                {/* Dossier Bottom Actions */}
                <View style={styles.dossierActionRow}>
                  <TouchableOpacity
                    style={styles.whatsappBtn}
                    onPress={() => {
                      setDossierCustomer(null);
                      openWhatsAppModal(dossierCustomer);
                    }}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="logo-whatsapp" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={styles.whatsappBtnText}>Send WhatsApp</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.callBtn}
                    onPress={() => Linking.openURL(`tel:${dossierCustomer.phone}`)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="call" size={15} color="#140306" style={{ marginRight: 6 }} />
                    <Text style={styles.callBtnText}>Call Customer</Text>
                  </TouchableOpacity>

                  {canEditCustomers && (
                    <TouchableOpacity
                      style={styles.editBtn}
                      onPress={() => {
                        setDossierCustomer(null);
                        openEditModal(dossierCustomer);
                      }}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="pencil" size={15} color="#475569" />
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* ========================================================
          3. ADD / EDIT CUSTOMER MODAL
          ======================================================== */}
      <Modal visible={editModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, isMobile && styles.modalContentMobile]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingCustomer ? 'Edit Customer Profile' : 'Register New Customer'}
              </Text>
              <TouchableOpacity
                onPress={() => setEditModalVisible(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={24} color="#8E8E93" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 480 }} showsVerticalScrollIndicator={false}>
              <Text style={styles.label}>Customer Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Zubair Tariq"
                placeholderTextColor="#94A3B8"
                value={formName}
                onChangeText={setFormName}
              />

              <Text style={styles.label}>Mobile Number *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 0300 1234567"
                placeholderTextColor="#94A3B8"
                value={formPhone}
                onChangeText={setFormPhone}
                keyboardType="phone-pad"
              />

              <Text style={styles.label}>Email Address (Optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. zubair@example.com"
                placeholderTextColor="#94A3B8"
                value={formEmail}
                onChangeText={setFormEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <Text style={styles.label}>Loyalty Tier</Text>
              <View style={styles.tierSelectRow}>
                {(['Regular', 'Silver', 'Gold', 'VIP'] as CustomerTier[]).map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.tierSelectPill, formTier === t && styles.tierSelectPillActive]}
                    onPress={() => setFormTier(t)}
                  >
                    <Text
                      style={[
                        styles.tierSelectPillText,
                        formTier === t && styles.tierSelectPillTextActive,
                      ]}
                    >
                      {t}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Delivery / Billing Address</Text>
              <TextInput
                style={[styles.input, { height: 60, textAlignVertical: 'top' }]}
                placeholder="e.g. House 45, Street 12, Phase 5, DHA..."
                placeholderTextColor="#94A3B8"
                value={formAddress}
                onChangeText={setFormAddress}
                multiline
              />

              <Text style={styles.label}>Tags (comma separated)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Spicy Food, Family Regular, VIP Majlis"
                placeholderTextColor="#94A3B8"
                value={formTags}
                onChangeText={setFormTags}
              />

              <Text style={styles.label}>Private Staff Notes / Dietary Restrictions</Text>
              <TextInput
                style={[styles.input, { height: 60, textAlignVertical: 'top' }]}
                placeholder="e.g. Prefers less oil, always sits on Table 4, allergic to peanuts..."
                placeholderTextColor="#94A3B8"
                value={formNotes}
                onChangeText={setFormNotes}
                multiline
              />
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setEditModalVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveCustomer}>
                <Text style={styles.saveBtnText}>
                  {editingCustomer ? 'Update Profile' : 'Save Customer'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: '#F8FAFC',
  },
  containerMobile: {
    padding: 14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    flexWrap: 'wrap',
    gap: 12,
  },
  headerMobile: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 12,
  },
  headerLeft: {
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 0.5,
  },
  titleMobile: {
    fontSize: 20,
  },
  roleBadge: {
    backgroundColor: 'rgba(213, 169, 67, 0.2)',
    borderWidth: 1,
    borderColor: '#D5A943',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  roleBadgeText: {
    color: '#8A5D00',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '500',
  },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 9,
  },
  exportBtnText: {
    color: '#52141C',
    fontWeight: '800',
    fontSize: 13,
  },
  addButton: {
    backgroundColor: '#D5A943',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 9,
    shadowColor: '#D5A943',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  addButtonText: {
    color: '#140306',
    fontWeight: '800',
    fontSize: 13.5,
  },
  contentScroll: {
    flex: 1,
  },
  kpiGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
    flexWrap: 'wrap',
  },
  kpiCard: {
    flex: 1,
    minWidth: 160,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 14,
    padding: 15,
    borderLeftWidth: 4.5,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        transition: 'all 0.2s ease',
      } as any,
    }),
  },
  kpiCardEmerald: {
    backgroundColor: 'rgba(236, 253, 245, 0.95)',
    borderColor: 'rgba(16, 185, 129, 0.35)',
    borderLeftColor: '#10B981',
  },
  kpiCardSapphire: {
    backgroundColor: 'rgba(240, 249, 255, 0.95)',
    borderColor: 'rgba(2, 132, 199, 0.35)',
    borderLeftColor: '#0284C7',
  },
  kpiCardAmber: {
    backgroundColor: 'rgba(254, 243, 199, 0.95)',
    borderColor: 'rgba(245, 158, 11, 0.35)',
    borderLeftColor: '#F59E0B',
  },
  kpiCardRuby: {
    backgroundColor: 'rgba(254, 226, 226, 0.95)',
    borderColor: 'rgba(239, 68, 68, 0.35)',
    borderLeftColor: '#EF4444',
  },
  kpiIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  kpiLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  kpiValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
  },
  kpiSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  filterSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  searchBox: {
    flex: 1,
    minWidth: 260,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 8,
    paddingRight: 10,
    height: 42,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: 'rgba(213, 169, 67, 0.45)',
    gap: 8,
  },
  searchIconOrb: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(82, 20, 28, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(213, 169, 67, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
    padding: 0,
    ...Platform.select({
      web: {
        outlineStyle: 'none',
        outlineWidth: 0,
      } as any,
    }),
  },
  searchClearBtn: {
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchShortcutBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(254, 243, 199, 0.85)',
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.4)',
  },
  searchShortcutText: {
    color: '#92400E',
    fontSize: 9.5,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  sortContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF7ED',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  sortBtn: {},
  sortBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#52141C',
  },
  tierTabsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
  },
  tierTab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  tierTabSelected: {
    backgroundColor: '#52141C',
    borderColor: '#D5A943',
  },
  tierTabText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#475569',
  },
  tierTabTextSelected: {
    color: '#FFFFFF',
  },
  resultsCounterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  resultsCountText: {
    fontSize: 12.5,
    color: '#64748B',
  },
  clearFilterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  clearFilterText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#D84315',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    padding: 40,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 10,
  },
  emptyText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1E293B',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    maxWidth: 340,
    marginTop: 4,
  },
  emptyActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D5A943',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
    marginTop: 16,
  },
  emptyActionBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#140306',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  thCol: {
    justifyContent: 'center',
  },
  thText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  customersList: {
    gap: 8,
  },
  custRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderLeftWidth: 4,
    borderLeftColor: '#3B82F6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
    ...Platform.select({
      web: {
        transition: 'all 0.15s ease',
      } as any,
    }),
  },
  custRowVIP: {
    borderLeftColor: '#D5A943',
    backgroundColor: '#FFFEF8',
  },
  custRowGold: {
    borderLeftColor: '#F59E0B',
    backgroundColor: '#FFFDF5',
  },
  rowCol: {
    justifyContent: 'center',
  },
  avatarCompact: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTextCompact: {
    fontSize: 13,
    fontWeight: '800',
  },
  rowCustName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  tierBadgeCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
  },
  tierBadgeCompactText: {
    fontSize: 10,
    fontWeight: '800',
  },
  rowPhoneText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  rowAddressText: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '500',
  },
  rowSpendText: {
    fontSize: 14.5,
    fontWeight: '900',
    color: '#047857',
  },
  rowVisitsText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#64748B',
  },
  pointsPillCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
    alignSelf: 'flex-start',
    gap: 3,
  },
  pointsPillCompactText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#92400E',
  },
  rowTagSnippet: {
    fontSize: 10.5,
    color: '#64748B',
    fontWeight: '600',
  },
  actionBtnView: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    paddingHorizontal: 9,
    paddingVertical: 5.5,
    borderRadius: 7,
    ...Platform.select({
      web: { cursor: 'pointer' } as any,
    }),
  },
  actionBtnViewText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#52141C',
  },
  actionBtnWhatsApp: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#25D366',
    paddingHorizontal: 9,
    paddingVertical: 5.5,
    borderRadius: 7,
    shadowColor: '#25D366',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    ...Platform.select({
      web: { cursor: 'pointer' } as any,
    }),
  },
  actionBtnWhatsAppText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  actionBtnEdit: {
    width: 30,
    height: 30,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    ...Platform.select({
      web: { cursor: 'pointer' } as any,
    }),
  },
  actionBtnDelete: {
    width: 30,
    height: 30,
    borderRadius: 6,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    ...Platform.select({
      web: { cursor: 'pointer' } as any,
    }),
  },
  mobileCustCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderLeftWidth: 4,
    borderLeftColor: '#3B82F6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 2,
    gap: 8,
  },
  mobileCardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  mobileSpendText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#047857',
  },
  mobileVisitsText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  mobileCardMidRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  mobilePhoneText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  mobileAddressText: {
    fontSize: 11,
    color: '#64748B',
  },
  mobileCardActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  mobileActionBtnView: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    paddingHorizontal: 10,
    paddingVertical: 5.5,
    borderRadius: 6,
  },
  mobileActionBtnWhatsApp: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#25D366',
    paddingHorizontal: 10,
    paddingVertical: 5.5,
    borderRadius: 6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContentMobile: {
    padding: 14,
    maxWidth: '100%',
  },
  whatsappModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 22,
    width: '100%',
    maxWidth: 580,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 14,
    elevation: 6,
  },
  whatsappModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 14,
  },
  whatsappIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#25D366',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalHeaderTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalHeaderSub: {
    fontSize: 12.5,
    color: '#64748B',
    marginTop: 2,
  },
  fieldSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 8,
  },
  templateOptionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  templatePill: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  templatePillActive: {
    backgroundColor: '#DCFCE7',
    borderColor: '#25D366',
  },
  templatePillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  templatePillTextActive: {
    color: '#15803D',
  },
  messageTextArea: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    padding: 12,
    fontSize: 13.5,
    color: '#0F172A',
    minHeight: 120,
    textAlignVertical: 'top',
    marginBottom: 18,
  },
  modalActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  modalCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  modalCancelBtnText: {
    color: '#475569',
    fontWeight: '700',
    fontSize: 13,
  },
  modalSendWhatsAppBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#25D366',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    shadowColor: '#25D366',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 2,
  },
  modalSendWhatsAppBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
  dossierModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 22,
    width: '100%',
    maxWidth: 720,
    maxHeight: '90%',
  },
  dossierHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 14,
  },
  dossierAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#140306',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#D5A943',
  },
  dossierAvatarText: {
    fontSize: 16,
    fontWeight: '900',
  },
  dossierName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  dossierPhone: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  dossierKpiRow: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  dossierKpiBox: {
    flex: 1,
    alignItems: 'center',
  },
  dossierKpiLabel: {
    fontSize: 10.5,
    color: '#64748B',
    fontWeight: '600',
  },
  dossierKpiVal: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
  },
  dossierTabsRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    marginBottom: 14,
  },
  dossierTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  dossierTabActive: {
    borderBottomColor: '#52141C',
  },
  dossierTabText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  dossierTabTextActive: {
    color: '#52141C',
  },
  dossierScroll: {
    maxHeight: 340,
    marginBottom: 16,
  },
  dossierOrderCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  dossierOrderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  dossierOrderId: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  dossierTypeBadge: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  dossierTypeBadgeText: {
    fontSize: 11,
    color: '#0369A1',
    fontWeight: '700',
  },
  dossierOrderDate: {
    fontSize: 11.5,
    color: '#64748B',
  },
  dossierOrderItems: {
    fontSize: 12.5,
    color: '#475569',
    marginBottom: 8,
  },
  dossierOrderFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  dossierOrderTotal: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#15803D',
  },
  dossierPrintBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  dossierPrintBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#140306',
  },
  dossierFeedbackCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  dossierFeedbackHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  dossierFeedbackScore: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#D97706',
  },
  dossierFeedbackComment: {
    fontSize: 13,
    color: '#334155',
    fontStyle: 'italic',
    marginBottom: 8,
  },
  dishFeedbackList: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 8,
    gap: 4,
  },
  dishFeedbackRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dishFeedbackName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
  },
  dishFeedbackTags: {
    fontSize: 11,
    color: '#64748B',
  },
  dossierProfileSection: {
    padding: 4,
  },
  dossierSectionHeading: {
    fontSize: 13,
    fontWeight: '800',
    color: '#334155',
    marginBottom: 4,
  },
  dossierSectionBody: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
  },
  tagsRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
    marginTop: 6,
  },
  tagBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  tagBadgeText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
  },
  dossierActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  whatsappBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#25D366',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    shadowColor: '#25D366',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  whatsappBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  callBtnText: {
    color: '#140306',
    fontWeight: '700',
    fontSize: 13,
  },
  editBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  tabEmptyText: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    paddingVertical: 30,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 520,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  label: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 4,
    marginTop: 10,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13.5,
    color: '#0F172A',
  },
  tierSelectRow: {
    flexDirection: 'row',
    gap: 8,
  },
  tierSelectPill: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
  },
  tierSelectPillActive: {
    backgroundColor: '#FEF3C7',
    borderColor: '#D5A943',
  },
  tierSelectPillText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#475569',
  },
  tierSelectPillTextActive: {
    color: '#92400E',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 18,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  cancelBtnText: {
    color: '#475569',
    fontWeight: '700',
    fontSize: 13,
  },
  saveBtn: {
    backgroundColor: '#140306',
    borderWidth: 1,
    borderColor: '#D5A943',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
});
