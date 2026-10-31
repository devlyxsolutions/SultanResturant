import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Modal,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  usePlaylandStore,
  PlaylandRide,
  PlaylandRideVariant,
  PlaylandTicket,
  PlaylandCustomer,
  useAuthStore,
} from '../../store';

const WRISTBAND_COLORS = [
  { name: 'Gold', hex: '#D5A943' },
  { name: 'Sky Blue', hex: '#3B82F6' },
  { name: 'Pink', hex: '#EC4899' },
  { name: 'Green', hex: '#10B981' },
  { name: 'Purple', hex: '#8B5CF6' },
];

export default function PlaylandCounterScreen() {
  const { width } = useWindowDimensions();
  const isTablet = width >= 900;

  const user = useAuthStore((state) => state.user);

  // Playland Store
  const rides = usePlaylandStore((state) => state.rides);
  const cart = usePlaylandStore((state) => state.cart);
  const tickets = usePlaylandStore((state) => state.tickets);
  const customers = usePlaylandStore((state) => state.customers);
  const addToCart = usePlaylandStore((state) => state.addToCart);
  const updateQty = usePlaylandStore((state) => state.updateQty);
  const removeFromCart = usePlaylandStore((state) => state.removeFromCart);
  const clearCart = usePlaylandStore((state) => state.clearCart);
  const issueTicket = usePlaylandStore((state) => state.issueTicket);

  // Customer Form State
  const [childName, setChildName] = useState('');
  const [parentName, setParentName] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [childAge, setChildAge] = useState('');
  const [wristbandColor, setWristbandColor] = useState('Gold');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'online'>('cash');
  const [notes, setNotes] = useState('');

  // Auto-complete suggestions for customer
  const [showCustSuggestions, setShowCustSuggestions] = useState(false);

  // Modals
  const [completedTicket, setCompletedTicket] = useState<PlaylandTicket | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showCustomersModal, setShowCustomersModal] = useState(false);

  // Active Rides Only (3-6 friendly rides)
  const activeRides = useMemo(() => {
    return rides.filter((r) => r.isActive);
  }, [rides]);

  // Cart Totals
  const cartTotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  }, [cart]);

  const cartTotalItems = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.qty, 0);
  }, [cart]);

  // Today metrics
  const todayMetrics = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStart = today.getTime();

    const todayTickets = tickets.filter((t) => t.issuedAt >= todayStart && t.status !== 'refunded');
    const sales = todayTickets.reduce((sum, t) => sum + t.totalAmount, 0);
    return {
      todaySales: sales,
      todayCount: todayTickets.length,
    };
  }, [tickets]);

  // Matching customer suggestions
  const customerSuggestions = useMemo(() => {
    if (!parentPhone.trim() && !childName.trim()) return [];
    const qPhone = parentPhone.toLowerCase().trim();
    const qName = childName.toLowerCase().trim();
    return customers.filter((c) => {
      if (qPhone && c.parentPhone.toLowerCase().includes(qPhone)) return true;
      if (qName && c.childName.toLowerCase().includes(qName)) return true;
      return false;
    }).slice(0, 3);
  }, [customers, parentPhone, childName]);

  // Select customer from suggestions
  const handleSelectCustomer = (cust: PlaylandCustomer) => {
    setChildName(cust.childName);
    setParentName(cust.parentName || '');
    setParentPhone(cust.parentPhone);
    setShowCustSuggestions(false);
  };

  // Quick select variant directly on card
  const handleSelectVariant = (ride: PlaylandRide, variant: PlaylandRideVariant) => {
    addToCart(ride, variant, 1);
  };

  // Issue Ticket
  const handleIssueTicket = () => {
    if (cart.length === 0) return;

    const newTicket = issueTicket({
      childName: childName.trim() || 'Young Sultan Guest',
      parentName: parentName.trim() || undefined,
      parentPhone: parentPhone.trim() || undefined,
      childAge: childAge.trim() || undefined,
      wristbandColor,
      notes: notes.trim() || undefined,
      paymentMethod,
      issuedBy: user?.name || 'Playland Cashier',
    });

    setCompletedTicket(newTicket);
    // Reset customer fields
    setChildName('');
    setParentName('');
    setParentPhone('');
    setChildAge('');
    setNotes('');
  };

  // Print function
  const handlePrint = () => {
    if (Platform.OS === 'web') {
      window.print();
    }
  };

  return (
    <View style={styles.container}>
      {/* Top Banner / Stats Bar (Light & Clean) */}
      <View style={styles.topBanner}>
        <View style={styles.bannerLeft}>
          <Text style={styles.bannerTitle}>🎪 Ticketing Counter</Text>
          <Text style={styles.bannerSub}>Fast & easy customer billing for Sultan Playland</Text>
        </View>

        <View style={styles.bannerRight}>
          <View style={styles.todayPill}>
            <Ionicons name="sparkles" size={15} color="#D5A943" />
            <Text style={styles.todayPillText}>
              {"Today's Sales: "}<Text style={{ color: '#4a121a', fontWeight: '800' }}>PKR {todayMetrics.todaySales.toLocaleString()}</Text> ({todayMetrics.todayCount} Tickets)
            </Text>
          </View>

          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => setShowHistoryModal(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="receipt-outline" size={16} color="#4a121a" style={{ marginRight: 4 }} />
            <Text style={styles.actionBtnText}>Recent Tickets ({tickets.length})</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnSecondary]}
            onPress={() => setShowCustomersModal(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="people-outline" size={16} color="#4a121a" style={{ marginRight: 4 }} />
            <Text style={styles.actionBtnText}>Customers ({customers.length})</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Main 2-Column Layout */}
      <ScrollView
        style={styles.layoutScroll}
        contentContainerStyle={[styles.layout, !isTablet && styles.layoutMobile]}
        scrollEnabled={!isTablet}
        showsVerticalScrollIndicator={false}
      >
        {/* Left: Clean White Service & Jhoolay Cards */}
        <ScrollView
          style={[styles.leftColumn, !isTablet && styles.leftColumnMobile]}
          scrollEnabled={isTablet}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.sectionHeadingBox}>
            <Text style={styles.sectionHeading}>🎡 Services & Jhooley</Text>
            <Text style={styles.sectionSub}>Click any duration to add directly to the ticket bill</Text>
          </View>

          {/* Cards Grid */}
          <View style={styles.servicesGrid}>
            {activeRides.map((ride) => {
              const variants = ride.variants && ride.variants.length > 0
                ? ride.variants
                : [{ id: `v-${ride.id}`, name: ride.duration || 'Standard', price: ride.price }];

              return (
                <View key={ride.id} style={styles.serviceCard}>
                  {/* Service Top Info */}
                  <View style={styles.cardTopRow}>
                    <View style={[styles.serviceIconCircle, { backgroundColor: ride.color || '#4a121a' }]}>
                      <Ionicons name={(ride.icon as any) || 'color-palette-outline'} size={24} color="#ffffff" />
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={styles.serviceCardTitle}>{ride.name}</Text>
                      <View style={styles.serviceMetaRow}>
                        <View style={styles.categoryBadge}>
                          <Text style={styles.categoryBadgeText}>{ride.category.toUpperCase()}</Text>
                        </View>
                        {ride.minAge && (
                          <Text style={styles.ageText}>
                            <Ionicons name="happy-outline" size={12} color="#6B7280" /> Age: {ride.minAge}
                          </Text>
                        )}
                      </View>
                    </View>
                  </View>

                  {/* Duration Variants Stepper Buttons */}
                  <Text style={styles.variantSectionLabel}>Select Duration & Price:</Text>
                  <View style={styles.variantsRow}>
                    {variants.map((v) => {
                      const cartItemId = `${ride.id}_${v.id}`;
                      const inCart = cart.find((c) => c.cartItemId === cartItemId);

                      return (
                        <TouchableOpacity
                          key={v.id}
                          style={[
                            styles.variantButton,
                            inCart && styles.variantButtonSelected,
                          ]}
                          onPress={() => handleSelectVariant(ride, v)}
                          activeOpacity={0.8}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.vName, inCart && styles.vNameSelected]}>{v.name}</Text>
                            <Text style={[styles.vPrice, inCart && styles.vPriceSelected]}>PKR {v.price}</Text>
                          </View>

                          {inCart ? (
                            <View style={styles.vBadgeCount}>
                              <Text style={styles.vBadgeCountText}>{inCart.qty}</Text>
                            </View>
                          ) : (
                            <View style={styles.vAddCircle}>
                              <Ionicons name="add" size={14} color="#4a121a" />
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              );
            })}
          </View>
        </ScrollView>

        {/* Right: Clean White Customer & Order Bill Panel */}
        <View style={[styles.rightColumn, !isTablet && styles.rightColumnMobile]}>
          {/* 1. Customer & Family Information Card */}
          <View style={styles.whitePanel}>
            <View style={styles.panelHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="person-add" size={18} color="#4a121a" />
                <Text style={styles.panelTitle}>Customer / Family Details</Text>
              </View>
              <Text style={styles.panelOptional}>Quick Input</Text>
            </View>

            {/* Inputs */}
            <View style={styles.inputRow}>
              <View style={{ flex: 1.2 }}>
                <TextInput
                  style={styles.cleanInput}
                  placeholder="👶 Child Name (e.g. Ayan / Zain)"
                  value={childName}
                  onChangeText={(t) => {
                    setChildName(t);
                    setShowCustSuggestions(true);
                  }}
                  placeholderTextColor="#9CA3AF"
                />
              </View>
              <View style={{ width: 90 }}>
                <TextInput
                  style={styles.cleanInput}
                  placeholder="🎂 Age (5)"
                  value={childAge}
                  onChangeText={setChildAge}
                  placeholderTextColor="#9CA3AF"
                />
              </View>
            </View>

            <View style={[styles.inputRow, { marginTop: 8 }]}>
              <View style={{ flex: 1.2 }}>
                <TextInput
                  style={styles.cleanInput}
                  placeholder="📱 Parent Phone (0300-1234567)"
                  keyboardType="phone-pad"
                  value={parentPhone}
                  onChangeText={(t) => {
                    setParentPhone(t);
                    setShowCustSuggestions(true);
                  }}
                  placeholderTextColor="#9CA3AF"
                />
              </View>
              <View style={{ flex: 1 }}>
                <TextInput
                  style={styles.cleanInput}
                  placeholder="Parent Name (Optional)"
                  value={parentName}
                  onChangeText={setParentName}
                  placeholderTextColor="#9CA3AF"
                />
              </View>
            </View>

            {/* Customer Suggestions Dropdown */}
            {showCustSuggestions && customerSuggestions.length > 0 && (
              <View style={styles.suggestionsCard}>
                <Text style={styles.suggestionsHeading}>Returning Customer Found:</Text>
                {customerSuggestions.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    style={styles.suggestionRow}
                    onPress={() => handleSelectCustomer(c)}
                  >
                    <Ionicons name="person-circle" size={18} color="#4a121a" />
                    <Text style={styles.suggestionMainText}>{c.childName} ({c.parentPhone})</Text>
                    <Text style={styles.suggestionVisitsText}>{c.totalVisits} Visits</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Wristband Color Selector */}
            <View style={styles.wristbandSelectorRow}>
              <Text style={styles.wristbandLabel}>Wristband Color:</Text>
              <View style={styles.colorDotsWrap}>
                {WRISTBAND_COLORS.map((clr) => (
                  <TouchableOpacity
                    key={clr.name}
                    style={[
                      styles.colorCircle,
                      { backgroundColor: clr.hex },
                      wristbandColor === clr.name && styles.colorCircleActive,
                    ]}
                    onPress={() => setWristbandColor(clr.name)}
                  />
                ))}
              </View>
            </View>
          </View>

          {/* 2. Order Ticket Bill Card */}
          <View style={[styles.whitePanel, isTablet && { flex: 1 }]}>
            <View style={styles.panelHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="receipt-outline" size={18} color="#4a121a" />
                <Text style={styles.panelTitle}>
                  Ticket Bill {cartTotalItems > 0 ? `(${cartTotalItems} Tickets)` : ''}
                </Text>
              </View>
              {cart.length > 0 && (
                <TouchableOpacity onPress={clearCart}>
                  <Text style={styles.clearBtnText}>Clear Bill</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Cart Items */}
            {cart.length === 0 ? (
              <View style={styles.emptyBillBox}>
                <Ionicons name="ticket-outline" size={40} color="#D1D5DB" />
                <Text style={styles.emptyBillHeader}>No Rides Selected</Text>
                <Text style={styles.emptyBillText}>Click any service duration on the left to add tickets</Text>
              </View>
            ) : (
              <ScrollView
                style={[styles.cartItemsScrollView, !isTablet && { maxHeight: 260 }]}
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
              >
                {cart.map((item) => (
                  <View key={item.cartItemId} style={styles.billItemCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.billItemTitle}>{item.name}</Text>
                      <Text style={styles.billItemSub}>
                        {item.variantName ? `${item.variantName} • ` : ''}PKR {item.price} each
                      </Text>
                    </View>

                    {/* Stepper Buttons */}
                    <View style={styles.stepperWrap}>
                      <TouchableOpacity
                        style={styles.stepperBtn}
                        onPress={() => updateQty(item.cartItemId, -1)}
                      >
                        <Ionicons name="remove" size={14} color="#111827" />
                      </TouchableOpacity>
                      <Text style={styles.stepperValue}>{item.qty}</Text>
                      <TouchableOpacity
                        style={styles.stepperBtn}
                        onPress={() => updateQty(item.cartItemId, 1)}
                      >
                        <Ionicons name="add" size={14} color="#111827" />
                      </TouchableOpacity>
                    </View>

                    <Text style={styles.billItemTotal}>PKR {item.price * item.qty}</Text>

                    <TouchableOpacity
                      style={styles.removeBtn}
                      onPress={() => removeFromCart(item.cartItemId)}
                    >
                      <Ionicons name="close-circle" size={18} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}

            {/* Payment Mode Selector & Checkout */}
            <View style={styles.checkoutFooter}>
              <Text style={styles.payOptionLabel}>Payment Method:</Text>
              <View style={styles.paymentButtonGroup}>
                {(['cash', 'card', 'online'] as const).map((mode) => (
                  <TouchableOpacity
                    key={mode}
                    style={[styles.payMethodBtn, paymentMethod === mode && styles.payMethodBtnActive]}
                    onPress={() => setPaymentMethod(mode)}
                  >
                    <Text style={[styles.payMethodText, paymentMethod === mode && styles.payMethodTextActive]}>
                      {mode === 'cash' ? '💵 Cash' : mode === 'card' ? '💳 Card' : '📲 Online'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Grand Total */}
              <View style={styles.grandTotalRow}>
                <Text style={styles.grandTotalLabel}>Total Payable:</Text>
                <Text style={styles.grandTotalAmount}>PKR {cartTotal.toLocaleString()}</Text>
              </View>

              {/* Big Gold Issue Ticket Button */}
              <TouchableOpacity
                style={[styles.issueTicketBtn, cart.length === 0 && styles.issueTicketBtnDisabled]}
                onPress={handleIssueTicket}
                disabled={cart.length === 0}
                activeOpacity={0.88}
              >
                <Ionicons name="print" size={20} color="#4a121a" style={{ marginRight: 8 }} />
                <Text style={styles.issueTicketBtnText}>
                  {cart.length === 0
                    ? 'Select Services to Issue Ticket'
                    : `Issue Ticket & Invoice (PKR ${cartTotal.toLocaleString()})`}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Modal: Instant Printed Ticket Receipt */}
      {completedTicket && (
        <Modal visible={!!completedTicket} transparent animationType="fade">
          <View style={styles.modalBackdrop}>
            <View style={styles.receiptCardModal}>
              <View style={styles.receiptModalHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="checkmark-circle" size={24} color="#10B981" />
                  <Text style={styles.receiptModalTitle}>Ticket Issued Successfully!</Text>
                </View>
                <TouchableOpacity onPress={() => setCompletedTicket(null)}>
                  <Ionicons name="close" size={24} color="#6B7280" />
                </TouchableOpacity>
              </View>

              {/* Clean White Thermal Slip */}
              <View style={styles.thermalPaper}>
                <Text style={styles.thermalBrandName}>SULTAN BASEMENT PLAYLAND</Text>
                <Text style={styles.thermalBrandSub}>Official Kids & Rides Invoice</Text>
                <View style={styles.thermalDivider} />

                <View style={styles.thermalLine}>
                  <Text style={styles.thermalLabelText}>TICKET #:</Text>
                  <Text style={styles.thermalValueBold}>{completedTicket.ticketCode}</Text>
                </View>
                <View style={styles.thermalLine}>
                  <Text style={styles.thermalLabelText}>DATE & TIME:</Text>
                  <Text style={styles.thermalValueText}>{new Date(completedTicket.issuedAt).toLocaleString('en-US')}</Text>
                </View>
                <View style={styles.thermalLine}>
                  <Text style={styles.thermalLabelText}>CHILD / GUEST:</Text>
                  <Text style={styles.thermalValueBold}>{completedTicket.childName} {completedTicket.childAge ? `(${completedTicket.childAge})` : ''}</Text>
                </View>
                {completedTicket.parentPhone && completedTicket.parentPhone !== 'N/A' && (
                  <View style={styles.thermalLine}>
                    <Text style={styles.thermalLabelText}>PARENT PHONE:</Text>
                    <Text style={styles.thermalValueText}>{completedTicket.parentPhone}</Text>
                  </View>
                )}
                <View style={styles.thermalLine}>
                  <Text style={styles.thermalLabelText}>WRISTBAND:</Text>
                  <Text style={styles.thermalValueText}>{completedTicket.wristbandColor || 'Gold'}</Text>
                </View>
                <View style={styles.thermalLine}>
                  <Text style={styles.thermalLabelText}>CASHIER:</Text>
                  <Text style={styles.thermalValueText}>{completedTicket.issuedBy}</Text>
                </View>

                <View style={styles.thermalDivider} />
                <Text style={styles.thermalSectionTitle}>PURCHASED RIDES & SERVICES:</Text>

                {completedTicket.items.map((it, idx) => (
                  <View key={idx} style={styles.thermalLine}>
                    <Text style={styles.thermalValueText}>
                      {it.name} {it.variantName ? `(${it.variantName})` : ''} x{it.qty}
                    </Text>
                    <Text style={styles.thermalValueBold}>PKR {it.price * it.qty}</Text>
                  </View>
                ))}

                <View style={styles.thermalDivider} />
                <View style={styles.thermalLine}>
                  <Text style={styles.thermalTotalTitle}>TOTAL PAID:</Text>
                  <Text style={styles.thermalTotalTitle}>PKR {completedTicket.totalAmount}</Text>
                </View>
                <View style={styles.thermalLine}>
                  <Text style={styles.thermalLabelText}>PAYMENT METHOD:</Text>
                  <Text style={styles.thermalValueBold}>{completedTicket.paymentMethod.toUpperCase()}</Text>
                </View>

                <View style={styles.thermalDivider} />
                <Text style={styles.thermalFooterNote}>
                  ⚠️ Please wear wristband at all times. Valid for today only at Sultan Basement Playland.
                </Text>
              </View>

              {/* Receipt Modal Actions */}
              <View style={styles.receiptModalActions}>
                <TouchableOpacity style={styles.printReceiptBtn} onPress={handlePrint}>
                  <Ionicons name="print" size={18} color="#4a121a" style={{ marginRight: 6 }} />
                  <Text style={styles.printReceiptBtnText}>Print Thermal Slip</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.nextCustomerBtn}
                  onPress={() => setCompletedTicket(null)}
                >
                  <Text style={styles.nextCustomerBtnText}>Next Family</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Modal: Recent Invoices */}
      {showHistoryModal && (
        <Modal visible={showHistoryModal} transparent animationType="fade">
          <View style={styles.modalBackdrop}>
            <View style={styles.whitePopupCard}>
              <View style={styles.popupHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="receipt" size={20} color="#4a121a" />
                  <Text style={styles.popupTitle}>Recent Playland Invoices</Text>
                </View>
                <TouchableOpacity onPress={() => setShowHistoryModal(false)}>
                  <Ionicons name="close" size={24} color="#6B7280" />
                </TouchableOpacity>
              </View>

              <ScrollView style={{ maxHeight: 450 }}>
                {tickets.map((t) => (
                  <View key={t.id} style={styles.historyCardItem}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={styles.hCode}>{t.ticketCode}</Text>
                        <Text style={styles.hTime}>{new Date(t.issuedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                      </View>
                      <Text style={styles.hChild}>{t.childName} ({t.parentPhone || 'No Phone'})</Text>
                      <Text style={styles.hItems}>
                        {t.items.map((it) => `${it.name} (${it.variantName || 'Std'}) x${it.qty}`).join(', ')}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <Text style={styles.hAmount}>PKR {t.totalAmount}</Text>
                      <TouchableOpacity
                        style={styles.reprintPill}
                        onPress={() => {
                          setShowHistoryModal(false);
                          setCompletedTicket(t);
                        }}
                      >
                        <Ionicons name="print-outline" size={13} color="#4a121a" />
                        <Text style={styles.reprintPillText}>Reprint</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}

      {/* Modal: Customers CRM */}
      {showCustomersModal && (
        <Modal visible={showCustomersModal} transparent animationType="fade">
          <View style={styles.modalBackdrop}>
            <View style={styles.whitePopupCard}>
              <View style={styles.popupHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="people" size={20} color="#4a121a" />
                  <Text style={styles.popupTitle}>Registered Playland Families ({customers.length})</Text>
                </View>
                <TouchableOpacity onPress={() => setShowCustomersModal(false)}>
                  <Ionicons name="close" size={24} color="#6B7280" />
                </TouchableOpacity>
              </View>

              <ScrollView style={{ maxHeight: 450 }}>
                {customers.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    style={styles.customerRowItem}
                    onPress={() => {
                      handleSelectCustomer(c);
                      setShowCustomersModal(false);
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cName}>{c.childName}</Text>
                      <Text style={styles.cPhone}>Parent: {c.parentName ? `${c.parentName} • ` : ''}{c.parentPhone}</Text>
                    </View>
                    <View style={styles.cVisitsBadge}>
                      <Text style={styles.cVisitsText}>{c.totalVisits} Visits</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6', // Clean light background
  },
  topBanner: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#CBD5E1',
    flexWrap: 'wrap',
    gap: 12,
  },
  bannerLeft: {},
  bannerTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#111827',
  },
  bannerSub: {
    fontSize: 13.5,
    color: '#475569',
    marginTop: 2,
    fontWeight: '500',
  },
  bannerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  todayPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  todayPillText: {
    color: '#92400E',
    fontSize: 13.5,
    fontWeight: '700',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D5A943',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
  },
  actionBtnSecondary: {
    backgroundColor: 'rgba(213, 169, 67, 0.2)',
    borderWidth: 1,
    borderColor: '#D5A943',
  },
  actionBtnText: {
    color: '#4a121a',
    fontSize: 13.5,
    fontWeight: '800',
  },
  layoutScroll: {
    flex: 1,
  },
  layout: {
    flexGrow: 1,
    flexDirection: 'row',
  },
  layoutMobile: {
    flexDirection: 'column',
    paddingBottom: 24,
  },
  leftColumn: {
    flex: 1.3,
    padding: 18,
  },
  leftColumnMobile: {
    flex: 0,
    padding: 12,
    paddingBottom: 0,
  },
  sectionHeadingBox: {
    marginBottom: 16,
  },
  sectionHeading: {
    fontSize: 19,
    fontWeight: '800',
    color: '#111827',
  },
  sectionSub: {
    fontSize: 13.5,
    color: '#475569',
    marginTop: 2,
  },
  servicesGrid: {
    gap: 14,
    paddingBottom: 30,
  },
  serviceCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 14,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 2,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  serviceIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceCardTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  serviceMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  categoryBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  categoryBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#4a121a',
  },
  ageText: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '600',
  },
  variantSectionLabel: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#475569',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  variantsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  variantButton: {
    flex: 1,
    minWidth: 140,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  variantButtonSelected: {
    backgroundColor: '#FFFBEB',
    borderColor: '#D5A943',
  },
  vName: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#1E293B',
  },
  vNameSelected: {
    color: '#4a121a',
    fontWeight: '800',
  },
  vPrice: {
    fontSize: 15.5,
    fontWeight: '800',
    color: '#4a121a',
    marginTop: 2,
  },
  vPriceSelected: {
    color: '#B45309',
  },
  vAddCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#D5A943',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  vBadgeCount: {
    backgroundColor: '#4a121a',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    marginLeft: 8,
  },
  vBadgeCountText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '900',
  },
  rightColumn: {
    flex: 1,
    padding: 18,
    gap: 16,
  },
  rightColumnMobile: {
    flex: 0,
    padding: 12,
  },
  whitePanel: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 14,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 2,
    display: 'flex',
    flexDirection: 'column',
  },
  panelHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  panelTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111827',
  },
  panelOptional: {
    fontSize: 12.5,
    color: '#64748B',
    fontWeight: '600',
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  cleanInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14.5,
    color: '#111827',
  },
  suggestionsCard: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#D5A943',
    borderRadius: 8,
    padding: 10,
    marginTop: 6,
  },
  suggestionsHeading: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#92400E',
    marginBottom: 6,
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    gap: 8,
  },
  suggestionMainText: {
    fontSize: 13.5,
    color: '#111827',
    fontWeight: '700',
    flex: 1,
  },
  suggestionVisitsText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#4a121a',
  },
  wristbandSelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    flexWrap: 'wrap',
    gap: 8,
  },
  wristbandLabel: {
    fontSize: 13.5,
    color: '#334155',
    fontWeight: '700',
  },
  colorDotsWrap: {
    flexDirection: 'row',
    gap: 10,
  },
  colorCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
  },
  colorCircleActive: {
    borderWidth: 3.5,
    borderColor: '#111827',
  },
  clearBtnText: {
    color: '#DC2626',
    fontSize: 13.5,
    fontWeight: '700',
  },
  emptyBillBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  emptyBillHeader: {
    fontSize: 16,
    fontWeight: '800',
    color: '#334155',
    marginTop: 8,
  },
  emptyBillText: {
    fontSize: 13.5,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 3,
    maxWidth: 240,
  },
  cartItemsScrollView: {
    flex: 1,
    marginVertical: 8,
  },
  billItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    gap: 10,
    flexWrap: 'wrap',
  },
  billItemTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
  },
  billItemSub: {
    fontSize: 12.5,
    color: '#475569',
    marginTop: 2,
    fontWeight: '500',
  },
  stepperWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E2E8F0',
    borderRadius: 6,
  },
  stepperBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  stepperValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
    paddingHorizontal: 6,
  },
  billItemTotal: {
    fontSize: 16,
    fontWeight: '800',
    color: '#4a121a',
  },
  removeBtn: {
    padding: 4,
  },
  checkoutFooter: {
    borderTopWidth: 1,
    borderTopColor: '#CBD5E1',
    paddingTop: 14,
  },
  payOptionLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 8,
  },
  paymentButtonGroup: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
    flexWrap: 'wrap',
  },
  payMethodBtn: {
    flex: 1,
    minWidth: 85,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  payMethodBtnActive: {
    backgroundColor: '#4a121a',
    borderColor: '#4a121a',
  },
  payMethodText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#374151',
  },
  payMethodTextActive: {
    color: '#D5A943',
  },
  grandTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  grandTotalLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  grandTotalAmount: {
    fontSize: 24,
    fontWeight: '900',
    color: '#4a121a',
  },
  issueTicketBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D5A943',
    paddingVertical: 15,
    borderRadius: 10,
    shadowColor: '#D5A943',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  issueTicketBtnDisabled: {
    opacity: 0.4,
  },
  issueTicketBtnText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#4a121a',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  receiptCardModal: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  receiptModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  receiptModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  thermalPaper: {
    backgroundColor: '#FAFAFA',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    padding: 18,
  },
  thermalBrandName: {
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
    color: '#4a121a',
  },
  thermalBrandSub: {
    fontSize: 12.5,
    color: '#475569',
    textAlign: 'center',
    marginTop: 2,
    fontWeight: '600',
  },
  thermalDivider: {
    height: 1,
    backgroundColor: '#CBD5E1',
    marginVertical: 10,
    borderStyle: 'dashed',
  },
  thermalLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  thermalLabelText: {
    fontSize: 12.5,
    color: '#475569',
    fontWeight: '500',
  },
  thermalValueText: {
    fontSize: 13,
    color: '#111827',
  },
  thermalValueBold: {
    fontSize: 13,
    fontWeight: '800',
    color: '#111827',
  },
  thermalSectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#4a121a',
    marginBottom: 6,
  },
  thermalTotalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#4a121a',
  },
  thermalFooterNote: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 6,
  },
  receiptModalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  printReceiptBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D5A943',
    paddingVertical: 13,
    borderRadius: 8,
  },
  printReceiptBtnText: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#4a121a',
  },
  nextCustomerBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E2E8F0',
    paddingVertical: 13,
    borderRadius: 8,
  },
  nextCustomerBtnText: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#1E293B',
  },
  whitePopupCard: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 6,
  },
  popupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#CBD5E1',
    paddingBottom: 10,
  },
  popupTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  historyCardItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
  },
  hCode: {
    fontSize: 15,
    fontWeight: '800',
    color: '#4a121a',
  },
  hTime: {
    fontSize: 12.5,
    color: '#475569',
  },
  hChild: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    marginTop: 2,
  },
  hItems: {
    fontSize: 12.5,
    color: '#334155',
    marginTop: 2,
  },
  hAmount: {
    fontSize: 16,
    fontWeight: '800',
    color: '#4a121a',
  },
  reprintPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D5A943',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 5,
    gap: 4,
  },
  reprintPillText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#4a121a',
  },
  customerRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
  },
  cName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  cPhone: {
    fontSize: 12.5,
    color: '#475569',
    marginTop: 2,
  },
  cVisitsBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  cVisitsText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#92400E',
  },
});
