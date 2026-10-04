import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Modal,
  Pressable,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  usePlaylandStore,
  PlaylandRide,
  RideCategory,
  PlaylandTicket,
} from '../../store/playlandStore';
import { useAuthStore } from '../../store/authStore';
import IslamicBackground from '../../components/IslamicBackground';
import SultanLogo from '../../components/SultanLogo';

const CATEGORIES: { label: string; value: RideCategory | 'all'; icon: keyof typeof Ionicons.glyphMap }[] = [
  { label: 'All Rides', value: 'all', icon: 'apps-outline' },
  { label: 'Jhoolay & Rides', value: 'jhoola', icon: 'color-palette-outline' },
  { label: 'Soft Play Zone', value: 'softplay', icon: 'happy-outline' },
  { label: '9D VR Gaming', value: 'vr', icon: 'glasses-outline' },
  { label: 'Arcade Zone', value: 'arcade', icon: 'game-controller-outline' },
  { label: 'Super Passes', value: 'pass', icon: 'ribbon-outline' },
];

const WRISTBAND_COLORS = [
  { name: 'Gold', hex: '#D5A943' },
  { name: 'Neon Green', hex: '#4ECCA3' },
  { name: 'Cyan Blue', hex: '#00ADB5' },
  { name: 'Royal Purple', hex: '#9B51E0' },
  { name: 'Coral Red', hex: '#FF6B6B' },
];

export default function PlaylandScreen() {
  const { width } = useWindowDimensions();
  const isTablet = width >= 800;

  const user = useAuthStore((state) => state.user);

  // Store state
  const rides = usePlaylandStore((state) => state.rides);
  const cart = usePlaylandStore((state) => state.cart);
  const tickets = usePlaylandStore((state) => state.tickets);
  const activeFilter = usePlaylandStore((state) => state.activeFilter);
  const searchQuery = usePlaylandStore((state) => state.searchQuery);

  const setFilter = usePlaylandStore((state) => state.setFilter);
  const setSearchQuery = usePlaylandStore((state) => state.setSearchQuery);
  const addToCart = usePlaylandStore((state) => state.addToCart);
  const updateQty = usePlaylandStore((state) => state.updateQty);
  const removeFromCart = usePlaylandStore((state) => state.removeFromCart);
  const clearCart = usePlaylandStore((state) => state.clearCart);
  const issueTicket = usePlaylandStore((state) => state.issueTicket);
  const redeemTicket = usePlaylandStore((state) => state.redeemTicket);

  // Local state
  const [activeTab, setActiveTab] = useState<'pos' | 'validator' | 'history'>('pos');
  const [childName, setChildName] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'online'>('cash');
  const [wristbandColor, setWristbandColor] = useState('Gold');
  const [issuedTicketModal, setIssuedTicketModal] = useState<PlaylandTicket | null>(null);

  // Validator state
  const [validateCode, setValidateCode] = useState('');
  const [validateResult, setValidateResult] = useState<{ success: boolean; message: string } | null>(null);

  // Filtered rides
  const filteredRides = useMemo(() => {
    return rides.filter((ride) => {
      const matchCat = activeFilter === 'all' || ride.category === activeFilter;
      const matchSearch =
        !searchQuery.trim() ||
        ride.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ride.category.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchSearch && ride.isActive;
    });
  }, [rides, activeFilter, searchQuery]);

  // Cart totals
  const totalAmount = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  }, [cart]);

  const totalItemsCount = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.qty, 0);
  }, [cart]);

  // Summary metrics
  const todayTickets = useMemo(() => {
    const today = new Date().setHours(0, 0, 0, 0);
    return tickets.filter((t) => t.issuedAt >= today);
  }, [tickets]);

  const todaySales = useMemo(() => {
    return todayTickets.reduce((sum, t) => sum + t.totalAmount, 0);
  }, [todayTickets]);

  const todayRidersCount = useMemo(() => {
    return todayTickets.reduce(
      (sum, t) => sum + t.items.reduce((iSum, i) => iSum + i.qty, 0),
      0
    );
  }, [todayTickets]);

  // Checkout handler
  const handleCheckout = () => {
    if (cart.length === 0) return;

    const ticket = issueTicket({
      childName: childName.trim() || 'Young Sultan Guest',
      parentPhone: parentPhone.trim() || 'N/A',
      paymentMethod,
      issuedBy: user?.name || 'Playland Cashier',
      wristbandColor,
    });

    setIssuedTicketModal(ticket);
    setChildName('');
    setParentPhone('');
  };

  // Redeem handler
  const handleRedeem = (codeToRedeem?: string) => {
    const target = codeToRedeem || validateCode;
    if (!target.trim()) return;
    const result = redeemTicket(target);
    setValidateResult(result);
    if (!codeToRedeem) setValidateCode('');
  };

  return (
    <IslamicBackground theme="burgundy" showCorners={false} showCenterLattice={false}>
      <View style={styles.container}>
        {/* Top Operational Bar */}
        <View style={styles.topTabBar}>
          <View style={styles.tabButtonsRow}>
            <TouchableOpacity
              style={[styles.navTab, activeTab === 'pos' && styles.navTabActive]}
              onPress={() => setActiveTab('pos')}
              activeOpacity={0.8}
            >
              <Ionicons
                name="ticket-outline"
                size={18}
                color={activeTab === 'pos' ? '#451014' : '#D5A943'}
              />
              <Text
                style={[styles.navTabText, activeTab === 'pos' && styles.navTabTextActive]}
              >
                Ticket POS & Rides
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.navTab, activeTab === 'validator' && styles.navTabActive]}
              onPress={() => setActiveTab('validator')}
              activeOpacity={0.8}
            >
              <Ionicons
                name="scan-outline"
                size={18}
                color={activeTab === 'validator' ? '#451014' : '#D5A943'}
              />
              <Text
                style={[styles.navTabText, activeTab === 'validator' && styles.navTabTextActive]}
              >
                Ride Entry Punch
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.navTab, activeTab === 'history' && styles.navTabActive]}
              onPress={() => setActiveTab('history')}
              activeOpacity={0.8}
            >
              <Ionicons
                name="receipt-outline"
                size={18}
                color={activeTab === 'history' ? '#451014' : '#D5A943'}
              />
              <Text
                style={[styles.navTabText, activeTab === 'history' && styles.navTabTextActive]}
              >
                Sales & Log ({todayTickets.length})
              </Text>
            </TouchableOpacity>
          </View>

          {/* Quick Metrics */}
          <View style={styles.topStatsRow}>
            <View style={styles.statPill}>
              <Text style={styles.statLabel}>Today's Sales:</Text>
              <Text style={styles.statValue}>PKR {todaySales.toLocaleString()}</Text>
            </View>
            <View style={styles.statPill}>
              <Text style={styles.statLabel}>Total Riders:</Text>
              <Text style={styles.statValue}>{todayRidersCount} Kids</Text>
            </View>
          </View>
        </View>

        {/* TAB 1: POS SCREEN */}
        {activeTab === 'pos' && (
          <View style={[styles.posLayout, isTablet ? styles.posLayoutRow : styles.posLayoutCol]}>
            {/* Left/Main: Ride Catalog */}
            <View style={styles.catalogSection}>
              {/* Category & Search Controls */}
              <View style={styles.filterBar}>
                {/* Search */}
                <View style={styles.searchBox}>
                  <Ionicons name="search" size={17} color="#D5A943" style={{ marginRight: 6 }} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search rides, passes, softplay..."
                    placeholderTextColor="rgba(255,255,255,0.4)"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                  />
                  {searchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setSearchQuery('')}>
                      <Ionicons name="close-circle" size={16} color="rgba(255,255,255,0.5)" />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Categories */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.categoryScroll}
                >
                  {CATEGORIES.map((cat) => {
                    const isSelected = activeFilter === cat.value;
                    return (
                      <TouchableOpacity
                        key={cat.value}
                        style={[styles.categoryBtn, isSelected && styles.categoryBtnActive]}
                        onPress={() => setFilter(cat.value)}
                        activeOpacity={0.8}
                      >
                        <Ionicons
                          name={cat.icon}
                          size={15}
                          color={isSelected ? '#451014' : '#D5A943'}
                          style={{ marginRight: 5 }}
                        />
                        <Text
                          style={[
                            styles.categoryBtnText,
                            isSelected && styles.categoryBtnTextActive,
                          ]}
                        >
                          {cat.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Rides Grid */}
              <ScrollView
                style={styles.ridesScroll}
                contentContainerStyle={styles.ridesGrid}
                showsVerticalScrollIndicator={false}
              >
                {filteredRides.map((ride) => {
                  const inCartItem = cart.find((c) => c.rideId === ride.id);
                  return (
                    <View key={ride.id} style={styles.rideCard}>
                      <View style={styles.rideCardTop}>
                        <View
                          style={[
                            styles.rideIconCircle,
                            { backgroundColor: `${ride.color || '#D5A943'}25` },
                          ]}
                        >
                          <Ionicons
                            name={(ride.icon as any) || 'color-palette-outline'}
                            size={24}
                            color={ride.color || '#D5A943'}
                          />
                        </View>
                        <View style={styles.badgeRow}>
                          {ride.minAge && (
                            <View style={styles.miniBadge}>
                              <Text style={styles.miniBadgeText}>{ride.minAge}</Text>
                            </View>
                          )}
                          {ride.duration && (
                            <View style={[styles.miniBadge, styles.miniBadgeGold]}>
                              <Text style={styles.miniBadgeGoldText}>{ride.duration}</Text>
                            </View>
                          )}
                        </View>
                      </View>

                      <Text style={styles.rideName} numberOfLines={2}>
                        {ride.name}
                      </Text>

                      <View style={styles.rideCardBottom}>
                        <View>
                          <Text style={styles.pricePrefix}>TICKET</Text>
                          <Text style={styles.priceText}>PKR {ride.price}</Text>
                        </View>

                        {inCartItem ? (
                          <View style={styles.qtyControls}>
                            <TouchableOpacity
                              style={styles.qtyBtn}
                              onPress={() => updateQty(ride.id, -1)}
                            >
                              <Ionicons name="remove" size={14} color="#D5A943" />
                            </TouchableOpacity>
                            <Text style={styles.qtyText}>{inCartItem.qty}</Text>
                            <TouchableOpacity
                              style={styles.qtyBtn}
                              onPress={() => updateQty(ride.id, 1)}
                            >
                              <Ionicons name="add" size={14} color="#D5A943" />
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <TouchableOpacity
                            style={styles.addRideBtn}
                            onPress={() => addToCart(ride)}
                            activeOpacity={0.8}
                          >
                            <Ionicons name="add" size={16} color="#451014" />
                            <Text style={styles.addRideBtnText}>Add</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            </View>

            {/* Right/Cart Panel */}
            <View style={[styles.cartSection, !isTablet && styles.cartSectionMobile]}>
              <View style={styles.cartHeader}>
                <View style={styles.cartTitleRow}>
                  <Ionicons name="cart-outline" size={20} color="#D5A943" />
                  <Text style={styles.cartTitle}>Ticket Order Slip</Text>
                </View>
                {cart.length > 0 && (
                  <TouchableOpacity onPress={clearCart}>
                    <Text style={styles.clearCartText}>Clear</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Guest Details */}
              <View style={styles.guestInputsCard}>
                <View style={styles.guestInputWrapper}>
                  <Ionicons name="happy-outline" size={16} color="#D5A943" style={{ marginRight: 6 }} />
                  <TextInput
                    style={styles.guestInput}
                    placeholder="Child Name (e.g. Zain / Ayan)"
                    placeholderTextColor="rgba(255,255,255,0.4)"
                    value={childName}
                    onChangeText={setChildName}
                  />
                </View>

                <View style={styles.guestInputWrapper}>
                  <Ionicons name="call-outline" size={16} color="#D5A943" style={{ marginRight: 6 }} />
                  <TextInput
                    style={styles.guestInput}
                    placeholder="Parent Phone # (Optional)"
                    placeholderTextColor="rgba(255,255,255,0.4)"
                    value={parentPhone}
                    keyboardType="phone-pad"
                    onChangeText={setParentPhone}
                  />
                </View>

                {/* Wristband Color */}
                <View style={styles.wristbandRow}>
                  <Text style={styles.wristbandLabel}>Wristband Band:</Text>
                  <View style={styles.wristbandColors}>
                    {WRISTBAND_COLORS.map((w) => (
                      <TouchableOpacity
                        key={w.name}
                        style={[
                          styles.wristbandDot,
                          { backgroundColor: w.hex },
                          wristbandColor === w.name && styles.wristbandDotActive,
                        ]}
                        onPress={() => setWristbandColor(w.name)}
                      />
                    ))}
                  </View>
                </View>
              </View>

              {/* Cart Items List */}
              <ScrollView style={styles.cartItemsScroll} showsVerticalScrollIndicator={false}>
                {cart.length === 0 ? (
                  <View style={styles.emptyCartBox}>
                    <Ionicons name="ticket-outline" size={38} color="rgba(213, 169, 67, 0.4)" />
                    <Text style={styles.emptyCartText}>No Rides Selected</Text>
                    <Text style={styles.emptyCartSub}>
                      Select Jhoolay, VR or Passes to generate wristbands & tickets
                    </Text>
                  </View>
                ) : (
                  cart.map((item) => (
                    <View key={item.rideId} style={styles.cartItemRow}>
                      <View style={styles.cartItemLeft}>
                        <Text style={styles.cartItemName}>{item.name}</Text>
                        <Text style={styles.cartItemSub}>
                          PKR {item.price} × {item.qty} = PKR {item.price * item.qty}
                        </Text>
                      </View>

                      <View style={styles.cartItemActions}>
                        <TouchableOpacity
                          style={styles.cartQtyBtn}
                          onPress={() => updateQty(item.rideId, -1)}
                        >
                          <Ionicons name="remove" size={12} color="#D5A943" />
                        </TouchableOpacity>
                        <Text style={styles.cartQtyText}>{item.qty}</Text>
                        <TouchableOpacity
                          style={styles.cartQtyBtn}
                          onPress={() => updateQty(item.rideId, 1)}
                        >
                          <Ionicons name="add" size={12} color="#D5A943" />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.cartRemoveBtn}
                          onPress={() => removeFromCart(item.rideId)}
                        >
                          <Ionicons name="trash-outline" size={14} color="#FF6B6B" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))
                )}
              </ScrollView>

              {/* Checkout Footer */}
              <View style={styles.cartFooter}>
                {/* Payment method */}
                <View style={styles.paymentMethodRow}>
                  {(['cash', 'card', 'online'] as const).map((method) => (
                    <TouchableOpacity
                      key={method}
                      style={[
                        styles.paymentMethodBtn,
                        paymentMethod === method && styles.paymentMethodBtnActive,
                      ]}
                      onPress={() => setPaymentMethod(method)}
                    >
                      <Text
                        style={[
                          styles.paymentMethodText,
                          paymentMethod === method && styles.paymentMethodTextActive,
                        ]}
                      >
                        {method.toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Total */}
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Grand Total ({totalItemsCount} Tickets):</Text>
                  <Text style={styles.totalValue}>PKR {totalAmount.toLocaleString()}</Text>
                </View>

                {/* Issue Button */}
                <TouchableOpacity
                  style={[styles.checkoutBtn, cart.length === 0 && styles.checkoutBtnDisabled]}
                  disabled={cart.length === 0}
                  onPress={handleCheckout}
                  activeOpacity={0.88}
                >
                  <Ionicons name="print-outline" size={20} color="#451014" />
                  <Text style={styles.checkoutBtnText}>
                    Issue Ticket & Wristband (PKR {totalAmount})
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* TAB 2: TICKET VALIDATOR / PUNCH */}
        {activeTab === 'validator' && (
          <ScrollView contentContainerStyle={styles.validatorContainer}>
            <View style={styles.validatorCard}>
              <View style={styles.validatorHeader}>
                <Ionicons name="scan-circle-outline" size={48} color="#D5A943" />
                <Text style={styles.validatorTitle}>Ride Entry Gate Puncher</Text>
                <Text style={styles.validatorSubtitle}>
                  Enter or scan Ticket ID / Wristband Code to verify and allow entry
                </Text>
              </View>

              <View style={styles.validatorInputRow}>
                <TextInput
                  style={styles.validatorInput}
                  placeholder="Enter Ticket Code (e.g. SLT-PL-8742 or PL-1234)"
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  value={validateCode}
                  onChangeText={setValidateCode}
                  autoCapitalize="characters"
                />
                <TouchableOpacity
                  style={styles.validatorSubmitBtn}
                  onPress={() => handleRedeem()}
                  activeOpacity={0.85}
                >
                  <Ionicons name="checkmark-circle-outline" size={20} color="#451014" />
                  <Text style={styles.validatorSubmitText}>Punch Entry</Text>
                </TouchableOpacity>
              </View>

              {validateResult && (
                <View
                  style={[
                    styles.resultBanner,
                    validateResult.success ? styles.resultBannerSuccess : styles.resultBannerError,
                  ]}
                >
                  <Ionicons
                    name={validateResult.success ? 'checkmark-circle' : 'alert-circle'}
                    size={24}
                    color={validateResult.success ? '#4ECCA3' : '#FF6B6B'}
                  />
                  <Text
                    style={[
                      styles.resultText,
                      validateResult.success ? styles.resultTextSuccess : styles.resultTextError,
                    ]}
                  >
                    {validateResult.message}
                  </Text>
                </View>
              )}

              {/* Recent Active Tickets Quick Punch list */}
              <Text style={styles.recentTitle}>Active Tickets at Playland:</Text>
              <View style={styles.activeTicketsList}>
                {tickets
                  .filter((t) => t.status === 'active')
                  .slice(0, 8)
                  .map((t) => {
                    const totalRides = t.items.reduce((s, i) => s + i.qty, 0);
                    return (
                      <View key={t.id} style={styles.activeTicketCard}>
                        <View style={styles.activeTicketInfo}>
                          <View style={styles.activeTicketHeaderRow}>
                            <Text style={styles.activeTicketCode}>{t.ticketCode}</Text>
                            <View
                              style={[
                                styles.wristbandBadge,
                                {
                                  backgroundColor:
                                    WRISTBAND_COLORS.find((c) => c.name === t.wristbandColor)?.hex ||
                                    '#D5A943',
                                },
                              ]}
                            >
                              <Text style={styles.wristbandBadgeText}>{t.wristbandColor}</Text>
                            </View>
                          </View>
                          <Text style={styles.activeTicketChild}>👦 {t.childName}</Text>
                          <Text style={styles.activeTicketRides}>
                            {t.items.map((i) => `${i.name} (x${i.qty})`).join(', ')}
                          </Text>
                          <Text style={styles.activeTicketProgress}>
                            Rides Punched: {t.redeemedRidesCount || 0} / {totalRides}
                          </Text>
                        </View>

                        <TouchableOpacity
                          style={styles.quickPunchBtn}
                          onPress={() => handleRedeem(t.ticketCode)}
                        >
                          <Ionicons name="sparkles" size={16} color="#451014" />
                          <Text style={styles.quickPunchBtnText}>Punch</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
              </View>
            </View>
          </ScrollView>
        )}

        {/* TAB 3: SALES & HISTORY LOG */}
        {activeTab === 'history' && (
          <ScrollView contentContainerStyle={styles.historyContainer}>
            <View style={styles.historyCard}>
              <View style={styles.historyHeader}>
                <Text style={styles.historyTitle}>Playland Issued Tickets Log</Text>
                <Text style={styles.historySubtitle}>All tickets generated for Sultan Playland</Text>
              </View>

              {tickets.length === 0 ? (
                <View style={styles.emptyHistory}>
                  <Ionicons name="receipt-outline" size={40} color="rgba(213, 169, 67, 0.4)" />
                  <Text style={styles.emptyHistoryText}>No tickets issued yet</Text>
                </View>
              ) : (
                <View style={styles.ticketsTable}>
                  {tickets.map((t) => (
                    <TouchableOpacity
                      key={t.id}
                      style={styles.ticketTableRow}
                      onPress={() => setIssuedTicketModal(t)}
                      activeOpacity={0.8}
                    >
                      <View style={styles.tableLeft}>
                        <View style={styles.tableCodeRow}>
                          <Text style={styles.tableTicketCode}>{t.ticketCode}</Text>
                          <View
                            style={[
                              styles.statusBadge,
                              t.status === 'active'
                                ? styles.statusBadgeActive
                                : styles.statusBadgeUsed,
                            ]}
                          >
                            <Text style={styles.statusBadgeText}>{t.status.toUpperCase()}</Text>
                          </View>
                        </View>
                        <Text style={styles.tableChildName}>
                          {t.childName} • {t.parentPhone}
                        </Text>
                        <Text style={styles.tableItemsText}>
                          {t.items.map((i) => `${i.name} (x${i.qty})`).join(', ')}
                        </Text>
                      </View>

                      <View style={styles.tableRight}>
                        <Text style={styles.tablePrice}>PKR {t.totalAmount}</Text>
                        <Text style={styles.tablePayMethod}>{t.paymentMethod.toUpperCase()}</Text>
                        <Text style={styles.tableTime}>
                          {new Date(t.issuedAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          </ScrollView>
        )}

        {/* PRINTABLE TICKET / WRISTBAND MODAL */}
        <Modal
          visible={!!issuedTicketModal}
          transparent
          animationType="fade"
          onRequestClose={() => setIssuedTicketModal(null)}
        >
          <Pressable style={styles.modalOverlay} onPress={() => setIssuedTicketModal(null)}>
            <Pressable style={styles.receiptCard} onPress={(e) => e.stopPropagation()}>
              <View style={styles.receiptHeader}>
                <SultanLogo size="sm" />
                <Text style={styles.receiptBrand}>SULTAN BASEMENT PLAYLAND</Text>
                <Text style={styles.receiptSub}>Official Guest Admission & Ride Ticket</Text>
              </View>

              <View style={styles.receiptDivider} />

              <View style={styles.ticketCodeBanner}>
                <Text style={styles.ticketCodeLabel}>WRISTBAND & TICKET CODE</Text>
                <Text style={styles.ticketCodeValue}>{issuedTicketModal?.ticketCode}</Text>
                <View style={styles.barcodeLines}>
                  <Text style={styles.barcodeVisual}>||| | |||| | | ||| |||| | || | |||</Text>
                </View>
              </View>

              <View style={styles.receiptDetailsRow}>
                <Text style={styles.receiptDetailLabel}>Child Name:</Text>
                <Text style={styles.receiptDetailVal}>{issuedTicketModal?.childName}</Text>
              </View>
              <View style={styles.receiptDetailsRow}>
                <Text style={styles.receiptDetailLabel}>Band Color:</Text>
                <Text style={styles.receiptDetailVal}>{issuedTicketModal?.wristbandColor}</Text>
              </View>
              <View style={styles.receiptDetailsRow}>
                <Text style={styles.receiptDetailLabel}>Issued At:</Text>
                <Text style={styles.receiptDetailVal}>
                  {issuedTicketModal && new Date(issuedTicketModal.issuedAt).toLocaleString()}
                </Text>
              </View>
              <View style={styles.receiptDetailsRow}>
                <Text style={styles.receiptDetailLabel}>Cashier / Staff:</Text>
                <Text style={styles.receiptDetailVal}>{issuedTicketModal?.issuedBy}</Text>
              </View>

              <View style={styles.receiptDivider} />

              {/* Items */}
              <Text style={styles.receiptItemsTitle}>INCLUDED RIDES & PASSES:</Text>
              {issuedTicketModal?.items.map((item, idx) => (
                <View key={idx} style={styles.receiptItemLine}>
                  <Text style={styles.receiptItemName}>
                    • {item.name} × {item.qty}
                  </Text>
                  <Text style={styles.receiptItemPrice}>PKR {item.price * item.qty}</Text>
                </View>
              ))}

              <View style={styles.receiptDivider} />

              <View style={styles.receiptTotalRow}>
                <Text style={styles.receiptTotalLabel}>Total Paid ({issuedTicketModal?.paymentMethod.toUpperCase()}):</Text>
                <Text style={styles.receiptTotalVal}>PKR {issuedTicketModal?.totalAmount}</Text>
              </View>

              <Text style={styles.receiptPolicy}>
                ⚠️ Please wear wristband at all times. Valid for today only at Sultan Basement Playland.
              </Text>

              <View style={styles.receiptModalActions}>
                <TouchableOpacity
                  style={styles.printReceiptBtn}
                  onPress={() => setIssuedTicketModal(null)}
                >
                  <Ionicons name="checkmark-done" size={18} color="#451014" />
                  <Text style={styles.printReceiptBtnText}>Done & Handover Wristband</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      </View>
    </IslamicBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topTabBar: {
    backgroundColor: 'rgba(30, 7, 9, 0.95)',
    borderBottomWidth: 1.5,
    borderBottomColor: 'rgba(213, 169, 67, 0.35)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
  },
  tabButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  navTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(213, 169, 67, 0.25)',
  },
  navTabActive: {
    backgroundColor: '#D5A943',
    borderColor: '#D5A943',
  },
  navTabText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#D5A943',
  },
  navTabTextActive: {
    color: '#451014',
  },
  topStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(213, 169, 67, 0.2)',
  },
  statLabel: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  statValue: {
    fontSize: 12,
    fontWeight: '800',
    color: '#D5A943',
  },

  /* POS Layout */
  posLayout: {
    flex: 1,
  },
  posLayoutRow: {
    flexDirection: 'row',
  },
  posLayoutCol: {
    flexDirection: 'column',
  },
  catalogSection: {
    flex: 1.5,
    padding: 12,
  },
  filterBar: {
    marginBottom: 12,
    gap: 8,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderWidth: 1.2,
    borderColor: 'rgba(213, 169, 67, 0.3)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 13,
  },
  categoryScroll: {
    flexDirection: 'row',
    gap: 6,
  },
  categoryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(213, 169, 67, 0.2)',
  },
  categoryBtnActive: {
    backgroundColor: '#D5A943',
    borderColor: '#D5A943',
  },
  categoryBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#E5E5EA',
  },
  categoryBtnTextActive: {
    color: '#451014',
    fontWeight: '700',
  },
  ridesScroll: {
    flex: 1,
  },
  ridesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingBottom: 20,
  },
  rideCard: {
    width: '48%',
    minWidth: 160,
    backgroundColor: 'rgba(35, 8, 11, 0.85)',
    borderRadius: 14,
    borderWidth: 1.2,
    borderColor: 'rgba(213, 169, 67, 0.3)',
    padding: 12,
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  rideCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  rideIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeRow: {
    gap: 4,
    alignItems: 'flex-end',
  },
  miniBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  miniBadgeText: {
    fontSize: 9,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  miniBadgeGold: {
    backgroundColor: 'rgba(213, 169, 67, 0.2)',
    borderWidth: 0.8,
    borderColor: 'rgba(213, 169, 67, 0.4)',
  },
  miniBadgeGoldText: {
    fontSize: 9,
    color: '#D5A943',
    fontWeight: '700',
  },
  rideName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 10,
  },
  rideCardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pricePrefix: {
    fontSize: 9,
    color: 'rgba(213, 169, 67, 0.8)',
    fontWeight: '700',
  },
  priceText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#D5A943',
  },
  addRideBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#D5A943',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  addRideBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#451014',
  },
  qtyControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderRadius: 8,
    padding: 3,
    borderWidth: 1,
    borderColor: 'rgba(213, 169, 67, 0.3)',
  },
  qtyBtn: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: 'rgba(213, 169, 67, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
    paddingHorizontal: 2,
  },

  /* Cart Section */
  cartSection: {
    flex: 1,
    maxWidth: 420,
    backgroundColor: '#250609',
    borderLeftWidth: 1.5,
    borderLeftColor: 'rgba(213, 169, 67, 0.35)',
    padding: 14,
    justifyContent: 'space-between',
  },
  cartSectionMobile: {
    maxWidth: '100%',
    borderLeftWidth: 0,
    borderTopWidth: 1.5,
    borderTopColor: 'rgba(213, 169, 67, 0.35)',
    maxHeight: 380,
  },
  cartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cartTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cartTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  clearCartText: {
    fontSize: 12,
    color: '#FF6B6B',
    fontWeight: '600',
  },
  guestInputsCard: {
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    borderRadius: 10,
    padding: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(213, 169, 67, 0.2)',
    marginBottom: 10,
  },
  guestInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(213, 169, 67, 0.2)',
  },
  guestInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 12,
    paddingVertical: 4,
  },
  wristbandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  wristbandLabel: {
    fontSize: 11,
    color: '#D5A943',
    fontWeight: '700',
  },
  wristbandColors: {
    flexDirection: 'row',
    gap: 6,
  },
  wristbandDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  wristbandDotActive: {
    borderColor: '#FFFFFF',
    transform: [{ scale: 1.15 }],
  },
  cartItemsScroll: {
    flex: 1,
    marginBottom: 10,
  },
  emptyCartBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 30,
    gap: 6,
  },
  emptyCartText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  emptyCartSub: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
    maxWidth: 240,
  },
  cartItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
    padding: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: 'rgba(213, 169, 67, 0.15)',
  },
  cartItemLeft: {
    flex: 1,
  },
  cartItemName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  cartItemSub: {
    fontSize: 11,
    color: '#D5A943',
    marginTop: 2,
  },
  cartItemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  cartQtyBtn: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: 'rgba(213, 169, 67, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartQtyText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
    minWidth: 14,
    textAlign: 'center',
  },
  cartRemoveBtn: {
    padding: 4,
    marginLeft: 4,
  },
  cartFooter: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(213, 169, 67, 0.25)',
    paddingTop: 10,
    gap: 8,
  },
  paymentMethodRow: {
    flexDirection: 'row',
    gap: 6,
  },
  paymentMethodBtn: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(213, 169, 67, 0.2)',
    alignItems: 'center',
  },
  paymentMethodBtnActive: {
    backgroundColor: 'rgba(213, 169, 67, 0.25)',
    borderColor: '#D5A943',
  },
  paymentMethodText: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.8)',
  },
  paymentMethodTextActive: {
    color: '#D5A943',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
    fontWeight: '600',
  },
  totalValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#D5A943',
  },
  checkoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#D5A943',
    paddingVertical: 12,
    borderRadius: 10,
    shadowColor: '#D5A943',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 4,
  },
  checkoutBtnDisabled: {
    backgroundColor: '#5C4A28',
  },
  checkoutBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#451014',
  },

  /* Validator Tab */
  validatorContainer: {
    padding: 16,
    alignItems: 'center',
  },
  validatorCard: {
    width: '100%',
    maxWidth: 650,
    backgroundColor: 'rgba(35, 8, 11, 0.9)',
    borderRadius: 18,
    padding: 20,
    borderWidth: 1.5,
    borderColor: '#D5A943',
    gap: 14,
  },
  validatorHeader: {
    alignItems: 'center',
    gap: 4,
  },
  validatorTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  validatorSubtitle: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
  },
  validatorInputRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  validatorInput: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderWidth: 1.2,
    borderColor: 'rgba(213, 169, 67, 0.35)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  validatorSubmitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#D5A943',
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  validatorSubmitText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#451014',
  },
  resultBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  resultBannerSuccess: {
    backgroundColor: 'rgba(78, 204, 163, 0.15)',
    borderColor: 'rgba(78, 204, 163, 0.4)',
  },
  resultBannerError: {
    backgroundColor: 'rgba(255, 107, 107, 0.15)',
    borderColor: 'rgba(255, 107, 107, 0.4)',
  },
  resultText: {
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  resultTextSuccess: {
    color: '#4ECCA3',
  },
  resultTextError: {
    color: '#FF6B6B',
  },
  recentTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#D5A943',
    marginTop: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  activeTicketsList: {
    gap: 8,
  },
  activeTicketCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(213, 169, 67, 0.2)',
  },
  activeTicketInfo: {
    flex: 1,
    gap: 3,
  },
  activeTicketHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  activeTicketCode: {
    fontSize: 14,
    fontWeight: '800',
    color: '#D5A943',
  },
  wristbandBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  wristbandBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#1C0507',
  },
  activeTicketChild: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  activeTicketRides: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  activeTicketProgress: {
    fontSize: 10,
    color: '#4ECCA3',
    fontWeight: '600',
  },
  quickPunchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#D5A943',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  quickPunchBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#451014',
  },

  /* History Tab */
  historyContainer: {
    padding: 16,
    alignItems: 'center',
  },
  historyCard: {
    width: '100%',
    maxWidth: 750,
    backgroundColor: 'rgba(35, 8, 11, 0.9)',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1.5,
    borderColor: '#D5A943',
  },
  historyHeader: {
    marginBottom: 12,
  },
  historyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  historySubtitle: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.65)',
  },
  emptyHistory: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  emptyHistoryText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  ticketsTable: {
    gap: 8,
  },
  ticketTableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(213, 169, 67, 0.2)',
  },
  tableLeft: {
    flex: 1,
    gap: 2,
  },
  tableCodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tableTicketCode: {
    fontSize: 13,
    fontWeight: '800',
    color: '#D5A943',
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusBadgeActive: {
    backgroundColor: 'rgba(78, 204, 163, 0.2)',
  },
  statusBadgeUsed: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  tableChildName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  tableItemsText: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.65)',
  },
  tableRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  tablePrice: {
    fontSize: 14,
    fontWeight: '800',
    color: '#D5A943',
  },
  tablePayMethod: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.7)',
  },
  tableTime: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.5)',
  },

  /* Receipt Modal */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(10, 2, 3, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  receiptCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFDF9',
    borderRadius: 16,
    padding: 20,
    borderWidth: 2,
    borderColor: '#D5A943',
    gap: 8,
  },
  receiptHeader: {
    alignItems: 'center',
    gap: 4,
  },
  receiptBrand: {
    fontSize: 16,
    fontWeight: '900',
    color: '#451014',
    letterSpacing: 0.5,
  },
  receiptSub: {
    fontSize: 11,
    color: '#666',
    fontWeight: '600',
  },
  receiptDivider: {
    height: 1,
    backgroundColor: '#DDD',
    marginVertical: 4,
  },
  ticketCodeBanner: {
    backgroundColor: '#451014',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
    gap: 2,
  },
  ticketCodeLabel: {
    fontSize: 9,
    color: '#D5A943',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  ticketCodeValue: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  barcodeLines: {
    marginTop: 2,
  },
  barcodeVisual: {
    fontSize: 14,
    color: '#D5A943',
    letterSpacing: 2,
    fontWeight: '700',
  },
  receiptDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  receiptDetailLabel: {
    fontSize: 12,
    color: '#555',
    fontWeight: '600',
  },
  receiptDetailVal: {
    fontSize: 12,
    color: '#111',
    fontWeight: '700',
  },
  receiptItemsTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#451014',
    marginTop: 2,
  },
  receiptItemLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  receiptItemName: {
    fontSize: 12,
    color: '#222',
    fontWeight: '600',
  },
  receiptItemPrice: {
    fontSize: 12,
    color: '#111',
    fontWeight: '700',
  },
  receiptTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  receiptTotalLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#451014',
  },
  receiptTotalVal: {
    fontSize: 16,
    fontWeight: '900',
    color: '#451014',
  },
  receiptPolicy: {
    fontSize: 10,
    color: '#777',
    textAlign: 'center',
    marginVertical: 4,
  },
  receiptModalActions: {
    marginTop: 6,
  },
  printReceiptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#D5A943',
    paddingVertical: 12,
    borderRadius: 10,
  },
  printReceiptBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#451014',
  },
});
