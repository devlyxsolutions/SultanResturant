import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  Animated,
  Easing,
  Platform,
  Vibration,
  useWindowDimensions,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import { useAuthStore } from '../store/authStore';
import { useCallStore, CallRecord } from '../store/callStore';
import { useSettingsStore } from '../store/settingsStore';
import { isOrderTakerUser } from '../utils/orderTakerScope';
import {
  getCustomerByPhone,
  createCustomer,
  getLastOrderSummary,
} from '../services/customerService';
import { formatPakistaniDisplayPhone } from '../utils/phoneNormalization';

const BRAND = {
  burgundy: '#52171B',
  burgundyDark: '#3A0F12',
  gold: '#D5A943',
  goldLight: '#FBE8B3',
  ink: '#1A1A1A',
  textSecondary: '#666666',
  cardBg: '#FFFFFF',
  border: '#E8E1D5',
  success: '#10B981',
  danger: '#EF4444',
};

export default function IncomingCallHost() {
  const router = useRouter();
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const user = useAuthStore((state) => state.user);
  const isOrderTaker = isOrderTakerUser(user) || Boolean(pathname && pathname.startsWith('/waiter'));
  const enableCallDetector = useSettingsStore((state) => state.settings.enableCallDetector);
  const activeIncomingCall = useCallStore((state) => state.activeIncomingCall);
  const dismissActiveCall = useCallStore((state) => state.dismissActiveCall);

  // New customer quick input fields
  const [quickName, setQuickName] = useState('');
  const [quickAddress, setQuickAddress] = useState('');

  // Pulse animation for incoming call ring
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(-120)).current;

  // Resolved customer (if known)
  const customer = useMemo(() => {
    if (!activeIncomingCall) return undefined;
    return getCustomerByPhone(activeIncomingCall.normalizedPhone);
  }, [activeIncomingCall]);

  // Last order summary for known customer
  const lastOrder = useMemo(() => {
    if (!customer?.id) return null;
    return getLastOrderSummary(customer.id);
  }, [customer]);

  useEffect(() => {
    if (isOrderTaker || enableCallDetector === false) return;
    if (activeIncomingCall) {
      setQuickName('');
      setQuickAddress('');

      // Slide in animation
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        friction: 7,
        tension: 40,
      }).start();

      // Continuous pulse animation while call is incoming
      const pulseLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      pulseLoop.start();

      // Haptic/vibration ring
      try {
        if (Platform.OS !== 'web') {
          Vibration.vibrate([0, 400, 400, 400]);
        }
      } catch {}

      return () => {
        pulseLoop.stop();
      };
    } else {
      slideAnim.setValue(-120);
    }
  }, [activeIncomingCall, enableCallDetector]);

  if (isOrderTaker || enableCallDetector === false || !activeIncomingCall) {
    return null;
  }

  const isKnown = Boolean(customer);
  const displayPhone =
    formatPakistaniDisplayPhone(activeIncomingCall.normalizedPhone, 'local') ||
    activeIncomingCall.phoneNumber;

  const handleCreateOrderForKnownCustomer = () => {
    if (!customer) return;
    dismissActiveCall();
    router.push({
      pathname: '/admin/pos',
      params: {
        prefillCustomerId: customer.id,
        prefillCustomerPhone: customer.phone,
        prefillCustomerName: customer.name,
        prefillCustomerAddress: customer.address || '',
        orderType: 'delivery',
      },
    });
  };

  const handleSaveAndCreateOrderForNewCustomer = () => {
    const finalName = quickName.trim() || `Customer ${displayPhone.slice(-4)}`;
    const newCust = createCustomer({
      name: finalName,
      phone: activeIncomingCall.normalizedPhone,
      address: quickAddress.trim(),
      notes: 'Added via Incoming Call Caller ID',
    });

    dismissActiveCall();
    router.push({
      pathname: '/admin/pos',
      params: {
        prefillCustomerId: newCust.id,
        prefillCustomerPhone: newCust.phone,
        prefillCustomerName: newCust.name,
        prefillCustomerAddress: newCust.address || '',
        orderType: 'delivery',
      },
    });
  };

  const handleSaveOnly = () => {
    const finalName = quickName.trim() || `Customer ${displayPhone.slice(-4)}`;
    createCustomer({
      name: finalName,
      phone: activeIncomingCall.normalizedPhone,
      address: quickAddress.trim(),
      notes: 'Saved via Caller ID Popup',
    });
    dismissActiveCall();
  };

  const handleViewHistory = () => {
    dismissActiveCall();
    router.push('/admin/customers');
  };

  return (
    <Modal
      transparent
      animationType="fade"
      visible={Boolean(activeIncomingCall)}
      onRequestClose={dismissActiveCall}
    >
      <View style={styles.overlay}>
        <Animated.View
          style={[
            styles.container,
            {
              width: isMobile ? '94%' : 540,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          {/* Header Banner */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Animated.View
                style={[
                  styles.phoneIconCircle,
                  { transform: [{ scale: pulseAnim }] },
                ]}
              >
                <Ionicons name="call" size={22} color="#FFFFFF" />
              </Animated.View>
              <View>
                <View style={styles.liveBadgeRow}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>INCOMING CALL</Text>
                  {isKnown ? (
                    <View style={styles.knownBadge}>
                      <Text style={styles.knownBadgeText}>SAVED CUSTOMER</Text>
                    </View>
                  ) : (
                    <View style={styles.unknownBadge}>
                      <Text style={styles.unknownBadgeText}>NEW NUMBER</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.phoneTitle}>{displayPhone}</Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={dismissActiveCall}
              style={styles.closeButton}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close" size={22} color={BRAND.burgundy} />
            </TouchableOpacity>
          </View>

          {/* Body Content */}
          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
          >
            {isKnown && customer ? (
              // KNOWN CUSTOMER VIEW
              <View style={styles.knownSection}>
                <View style={styles.customerCard}>
                  <View style={styles.customerHeader}>
                    <View style={styles.avatarCircle}>
                      <Text style={styles.avatarLetter}>
                        {customer.name ? customer.name[0].toUpperCase() : 'C'}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.customerName}>{customer.name}</Text>
                      {customer.address ? (
                        <View style={styles.infoRow}>
                          <Ionicons
                            name="location"
                            size={14}
                            color={BRAND.burgundy}
                          />
                          <Text style={styles.addressText} numberOfLines={2}>
                            {customer.address}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    {customer.tier ? (
                      <View style={styles.tierPill}>
                        <Text style={styles.tierText}>{customer.tier}</Text>
                      </View>
                    ) : null}
                  </View>

                  {/* Customer stats */}
                  <View style={styles.statsRow}>
                    <View style={styles.statBox}>
                      <Text style={styles.statValue}>
                        {customer.totalOrders || 0}
                      </Text>
                      <Text style={styles.statLabel}>Orders</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statBox}>
                      <Text style={styles.statValue}>
                        Rs. {(customer.totalSpent || 0).toLocaleString()}
                      </Text>
                      <Text style={styles.statLabel}>Total Spent</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statBox}>
                      <Text style={styles.statValue}>
                        {customer.loyaltyPoints || 0} pts
                      </Text>
                      <Text style={styles.statLabel}>Loyalty</Text>
                    </View>
                  </View>

                  {/* Last Order Summary */}
                  {lastOrder ? (
                    <View style={styles.lastOrderBox}>
                      <View style={styles.lastOrderHeader}>
                        <Text style={styles.lastOrderTitle}>
                          Last Order #{lastOrder.invoiceId}
                        </Text>
                        <Text style={styles.lastOrderAmount}>
                          Rs. {lastOrder.total.toLocaleString()}
                        </Text>
                      </View>
                      <Text style={styles.lastOrderItems} numberOfLines={2}>
                        {lastOrder.itemSummary}
                      </Text>
                    </View>
                  ) : (
                    <Text style={styles.noOrderText}>
                      No previous orders recorded yet.
                    </Text>
                  )}
                </View>

                {/* Actions */}
                <View style={styles.actionButtonsRow}>
                  <TouchableOpacity
                    style={[styles.btn, styles.btnPrimary]}
                    onPress={handleCreateOrderForKnownCustomer}
                  >
                    <Ionicons name="cart" size={18} color="#FFFFFF" />
                    <Text style={styles.btnPrimaryText}>Create Order</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.btn, styles.btnSecondary]}
                    onPress={handleViewHistory}
                  >
                    <Ionicons name="time" size={18} color={BRAND.burgundy} />
                    <Text style={styles.btnSecondaryText}>View History</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.btn, styles.btnDismiss]}
                    onPress={dismissActiveCall}
                  >
                    <Text style={styles.btnDismissText}>Dismiss</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              // UNKNOWN NUMBER VIEW
              <View style={styles.unknownSection}>
                <Text style={styles.unknownNotice}>
                  New caller detected! Enter customer details below for quick
                  CRM saving and one-tap order creation.
                </Text>

                <View style={styles.formGroup}>
                  <Text style={styles.inputLabel}>Customer Name *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. Tariq Mehmood"
                    placeholderTextColor="#999999"
                    value={quickName}
                    onChangeText={setQuickName}
                    autoCapitalize="words"
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.inputLabel}>Delivery Address (Optional)</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    placeholder="e.g. House 42, St 7, Sector F-7/2, Islamabad"
                    placeholderTextColor="#999999"
                    value={quickAddress}
                    onChangeText={setQuickAddress}
                    multiline
                    numberOfLines={2}
                  />
                </View>

                {/* Actions */}
                <View style={styles.actionButtonsRow}>
                  <TouchableOpacity
                    style={[styles.btn, styles.btnPrimary]}
                    onPress={handleSaveAndCreateOrderForNewCustomer}
                  >
                    <Ionicons name="cart" size={18} color="#FFFFFF" />
                    <Text style={styles.btnPrimaryText}>
                      Save & Create Order
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.btn, styles.btnSecondary]}
                    onPress={handleSaveOnly}
                  >
                    <Ionicons
                      name="person-add"
                      size={18}
                      color={BRAND.burgundy}
                    />
                    <Text style={styles.btnSecondaryText}>Save Only</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.btn, styles.btnDismiss]}
                    onPress={dismissActiveCall}
                  >
                    <Text style={styles.btnDismissText}>Dismiss</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  container: {
    backgroundColor: BRAND.cardBg,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 20,
    borderWidth: 1.5,
    borderColor: BRAND.border,
    maxHeight: '90%',
  },
  header: {
    backgroundColor: '#FAF7F2',
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: BRAND.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
  },
  phoneIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: BRAND.burgundy,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: BRAND.burgundy,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  liveBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: BRAND.success,
  },
  liveText: {
    fontSize: 11,
    fontWeight: '800',
    color: BRAND.success,
    letterSpacing: 0.8,
  },
  knownBadge: {
    backgroundColor: '#DEF7EC',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  knownBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#03543F',
  },
  unknownBadge: {
    backgroundColor: '#FEF08A',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  unknownBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#854D0E',
  },
  phoneTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: BRAND.ink,
    letterSpacing: 0.5,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3ECE2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  body: {
    maxHeight: 460,
  },
  bodyContent: {
    padding: 20,
  },
  knownSection: {
    gap: 16,
  },
  customerCard: {
    backgroundColor: '#FBF9F5',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BRAND.border,
    padding: 16,
    gap: 14,
  },
  customerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: BRAND.burgundy,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarLetter: {
    color: BRAND.gold,
    fontSize: 20,
    fontWeight: '800',
  },
  customerName: {
    fontSize: 18,
    fontWeight: '800',
    color: BRAND.ink,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  addressText: {
    fontSize: 13,
    color: BRAND.textSecondary,
    flex: 1,
  },
  tierPill: {
    backgroundColor: BRAND.goldLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BRAND.gold,
  },
  tierText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#7A5B0B',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#EFECE6',
  },
  statBox: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '800',
    color: BRAND.burgundy,
  },
  statLabel: {
    fontSize: 11,
    color: '#888888',
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#EFECE6',
  },
  lastOrderBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: BRAND.gold,
    borderWidth: 1,
    borderColor: '#EFECE6',
  },
  lastOrderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  lastOrderTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: BRAND.ink,
  },
  lastOrderAmount: {
    fontSize: 14,
    fontWeight: '800',
    color: BRAND.burgundy,
  },
  lastOrderItems: {
    fontSize: 12,
    color: BRAND.textSecondary,
    lineHeight: 16,
  },
  noOrderText: {
    fontSize: 13,
    color: '#888888',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 6,
  },
  unknownSection: {
    gap: 14,
  },
  unknownNotice: {
    fontSize: 13,
    color: BRAND.textSecondary,
    lineHeight: 19,
    backgroundColor: '#FFFBEB',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  formGroup: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: BRAND.ink,
  },
  input: {
    backgroundColor: '#FBF9F5',
    borderWidth: 1,
    borderColor: BRAND.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: BRAND.ink,
  },
  textArea: {
    minHeight: 56,
    textAlignVertical: 'top',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 6,
    flexWrap: 'wrap',
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    flex: 1,
    minWidth: 130,
  },
  btnPrimary: {
    backgroundColor: BRAND.burgundy,
  },
  btnPrimaryText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  btnSecondary: {
    backgroundColor: '#FAF5EE',
    borderWidth: 1,
    borderColor: BRAND.border,
  },
  btnSecondaryText: {
    color: BRAND.burgundy,
    fontSize: 14,
    fontWeight: '700',
  },
  btnDismiss: {
    backgroundColor: '#F3F4F6',
    flex: 0.6,
    minWidth: 90,
  },
  btnDismissText: {
    color: '#6B7280',
    fontSize: 14,
    fontWeight: '600',
  },
});
