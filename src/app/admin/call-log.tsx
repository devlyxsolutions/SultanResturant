import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  TextInput,
  Alert,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallStore, CallRecord, CallStatus } from '../../store/callStore';
import {
  checkPermissions,
  requestBatteryOptimizationExemption,
  simulateIncomingCall,
  simulateCallAnswered,
  simulateCallEnded,
  PermissionStatusResult,
} from 'call-detector';
import { getCustomerByPhone, createCustomer } from '../../services/customerService';
import { formatPakistaniDisplayPhone } from '../../utils/phoneNormalization';

const BRAND = {
  burgundy: '#52171B',
  burgundyDark: '#3A0F12',
  gold: '#D5A943',
  goldLight: '#FDF6E2',
  ink: '#1A1A1A',
  muted: '#6B7280',
  border: '#E8E1D5',
  cardBg: '#FFFFFF',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  info: '#3B82F6',
};

export default function CallLogScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const isDetectionEnabled = useCallStore((state) => state.isDetectionEnabled);
  const setDetectionEnabled = useCallStore((state) => state.setDetectionEnabled);
  const isServiceRunning = useCallStore((state) => state.isServiceRunning);
  const syncServiceStatus = useCallStore((state) => state.syncServiceStatus);
  const callLog = useCallStore((state) => state.callLog);
  const removeCallFromLog = useCallStore((state) => state.removeCallFromLog);
  const clearCallLog = useCallStore((state) => state.clearCallLog);

  // Permissions state
  const [permStatus, setPermStatus] = useState<PermissionStatusResult | null>(null);
  const [checkingPerms, setCheckingPerms] = useState(false);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | CallStatus>('all');

  // Simulator Input
  const [customSimNumber, setCustomSimNumber] = useState('0300-9876543');
  const [simActive, setSimActive] = useState(false);

  const refreshPermissions = async () => {
    setCheckingPerms(true);
    try {
      const res = await checkPermissions();
      setPermStatus(res);
    } catch {}
    setCheckingPerms(false);
  };

  useEffect(() => {
    syncServiceStatus();
    refreshPermissions();
  }, []);

  const handleToggleDetection = async (value: boolean) => {
    await setDetectionEnabled(value);
  };

  const handleExemptBattery = async () => {
    const ok = await requestBatteryOptimizationExemption();
    if (ok) {
      if (Platform.OS === 'web') {
        window.alert('Battery optimization settings intent dispatched.');
      } else {
        Alert.alert(
          'Battery Settings',
          'Please ensure Sultan POS is set to "Unrestricted" / "Don\'t optimize" so background calls ring reliably.'
        );
      }
      setTimeout(refreshPermissions, 1500);
    }
  };

  const handleSimulateCall = async (number: string) => {
    setSimActive(true);
    await simulateIncomingCall(number);
  };

  const handleSimulateAnswer = async () => {
    await simulateCallAnswered();
  };

  const handleSimulateEnd = async () => {
    await simulateCallEnded();
    setSimActive(false);
  };

  const handleTakeOrder = (call: CallRecord) => {
    const cust = getCustomerByPhone(call.normalizedPhone);
    router.push({
      pathname: '/admin/pos',
      params: {
        prefillCustomerId: cust?.id || '',
        prefillCustomerPhone: call.normalizedPhone,
        prefillCustomerName: cust?.name || '',
        prefillCustomerAddress: cust?.address || '',
        orderType: 'delivery',
      },
    });
  };

  const handleQuickSaveCustomer = (call: CallRecord) => {
    const defaultName = `Customer ${call.displayPhone.slice(-4)}`;
    const cust = createCustomer({
      name: defaultName,
      phone: call.normalizedPhone,
      address: '',
      notes: 'Added from Call Log',
    });
    const msg = `Customer "${cust.name}" saved to CRM!`;
    if (Platform.OS === 'web') window.alert(msg);
    else Alert.alert('Saved', msg);
  };

  const filteredLogs = useMemo(() => {
    return callLog.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) {
        return false;
      }
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      const numMatch = (item.phoneNumber || '').toLowerCase().includes(q) ||
                       (item.normalizedPhone || '').toLowerCase().includes(q) ||
                       (item.displayPhone || '').toLowerCase().includes(q);
      const nameMatch = (item.customerName || '').toLowerCase().includes(q);
      return numMatch || nameMatch;
    });
  }, [callLog, statusFilter, searchQuery]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent}>
      {/* Screen Header */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.push('/admin/dashboard')}
          >
            <Ionicons name="arrow-back" size={20} color={BRAND.burgundy} />
          </TouchableOpacity>
          <View>
            <Text style={styles.screenTitle}>Caller ID & Call Logs</Text>
            <Text style={styles.screenSubtitle}>
              Android native call detection, customer match & POS order routing
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.refreshBtn}
          onPress={() => {
            syncServiceStatus();
            refreshPermissions();
          }}
        >
          <Ionicons name="refresh" size={16} color={BRAND.burgundy} />
          <Text style={styles.refreshBtnText}>Refresh Status</Text>
        </TouchableOpacity>
      </View>

      {/* Control Cards Grid */}
      <View style={[styles.grid, isMobile && styles.gridMobile]}>
        {/* Card 1: Master Detection Toggle */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderLeft}>
              <View style={[styles.iconBox, { backgroundColor: '#FDF2F2' }]}>
                <Ionicons name="call" size={20} color={BRAND.burgundy} />
              </View>
              <View>
                <Text style={styles.cardTitle}>Call Listener</Text>
                <Text style={styles.cardSubtitle}>Foreground service status</Text>
              </View>
            </View>
            <Switch
              value={isDetectionEnabled}
              onValueChange={handleToggleDetection}
              trackColor={{ false: '#D1D5DB', true: BRAND.burgundy }}
              thumbColor="#FFFFFF"
            />
          </View>

          <View style={styles.cardBody}>
            <View style={styles.statusPillRow}>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: isServiceRunning ? BRAND.success : BRAND.danger },
                ]}
              />
              <Text style={styles.statusText}>
                {isServiceRunning
                  ? 'Foreground Service Active ("POS call listener active")'
                  : isDetectionEnabled
                  ? 'Service Standby / Waiting'
                  : 'Call Detection Disabled in Settings'}
              </Text>
            </View>
            <Text style={styles.explainerText}>
              When enabled, a persistent Android notification keeps the listener alive in the
              background so incoming calls trigger caller ID popups even if the screen is off or app is minimized.
            </Text>
          </View>
        </View>

        {/* Card 2: Battery Optimization Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderLeft}>
              <View style={[styles.iconBox, { backgroundColor: '#FEF3C7' }]}>
                <Ionicons name="battery-charging" size={20} color="#D97706" />
              </View>
              <View>
                <Text style={styles.cardTitle}>Battery Optimization</Text>
                <Text style={styles.cardSubtitle}>Prevent Android killing service</Text>
              </View>
            </View>
            <View
              style={[
                styles.badge,
                {
                  backgroundColor: permStatus?.isBatteryOptimizationIgnored
                    ? '#DEF7EC'
                    : '#FEF08A',
                },
              ]}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '700',
                  color: permStatus?.isBatteryOptimizationIgnored ? '#03543F' : '#854D0E',
                }}
              >
                {permStatus?.isBatteryOptimizationIgnored ? 'Exempted' : 'Action Needed'}
              </Text>
            </View>
          </View>

          <View style={styles.cardBody}>
            <Text style={styles.explainerText}>
              Android aggressively shuts down background processes to save battery. Exempting Sultan
              POS ensures zero missed orders when customer phone calls arrive.
            </Text>
            <TouchableOpacity
              style={styles.batteryBtn}
              onPress={handleExemptBattery}
            >
              <Ionicons name="settings-outline" size={16} color="#FFFFFF" />
              <Text style={styles.batteryBtnText}>Exempt Battery Optimization</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Permissions & Hardware Status */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <View style={[styles.iconBox, { backgroundColor: '#EFF6FF' }]}>
              <Ionicons name="shield-checkmark" size={20} color={BRAND.info} />
            </View>
            <View>
              <Text style={styles.cardTitle}>Required Android Permissions</Text>
              <Text style={styles.cardSubtitle}>
                READ_PHONE_STATE, READ_CALL_LOG, FOREGROUND_SERVICE, POST_NOTIFICATIONS
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.permsRow}>
          <View style={styles.permItem}>
            <Ionicons
              name={permStatus?.hasPhoneState ? 'checkmark-circle' : 'alert-circle'}
              size={18}
              color={permStatus?.hasPhoneState ? BRAND.success : BRAND.danger}
            />
            <Text style={styles.permLabel}>Phone State (Telephony)</Text>
          </View>
          <View style={styles.permItem}>
            <Ionicons
              name={permStatus?.hasCallLog ? 'checkmark-circle' : 'alert-circle'}
              size={18}
              color={permStatus?.hasCallLog ? BRAND.success : BRAND.danger}
            />
            <Text style={styles.permLabel}>Call Log (Caller Number)</Text>
          </View>
          <View style={styles.permItem}>
            <Ionicons
              name={permStatus?.hasPostNotifications ? 'checkmark-circle' : 'alert-circle'}
              size={18}
              color={permStatus?.hasPostNotifications ? BRAND.success : BRAND.danger}
            />
            <Text style={styles.permLabel}>Notifications (Foreground)</Text>
          </View>
        </View>
      </View>

      {/* Test Call Simulator (Debug Mode) */}
      <View style={[styles.card, styles.simCard]}>
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <View style={[styles.iconBox, { backgroundColor: '#FEF3C7' }]}>
              <Ionicons name="flask" size={20} color="#B45309" />
            </View>
            <View>
              <Text style={styles.cardTitle}>Test Call Simulator (Debug Mode)</Text>
              <Text style={styles.cardSubtitle}>
                Test real-time Caller ID popups & POS order flow without a live SIM call
              </Text>
            </View>
          </View>
          <View style={styles.simBadge}>
            <Text style={styles.simBadgeText}>TESTING TOOL</Text>
          </View>
        </View>

        <View style={styles.cardBody}>
          <Text style={styles.explainerText}>
            Tap any preset or enter a Pakistani phone number to trigger the exact native incoming
            call event, customer lookup, and POS quick order popup:
          </Text>

          {/* Quick preset buttons */}
          <View style={styles.presetRow}>
            <TouchableOpacity
              style={styles.presetBtn}
              onPress={() => handleSimulateCall('0300-9876543')}
            >
              <Ionicons name="star" size={14} color={BRAND.gold} />
              <Text style={styles.presetBtnText}>VIP: Zubair (0300-9876543)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.presetBtn}
              onPress={() => handleSimulateCall('0321-4567890')}
            >
              <Ionicons name="ribbon" size={14} color="#D97706" />
              <Text style={styles.presetBtnText}>Gold: Fatima (0321-4567890)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.presetBtn}
              onPress={() => handleSimulateCall('0312-7788990')}
            >
              <Ionicons name="person-add" size={14} color={BRAND.burgundy} />
              <Text style={styles.presetBtnText}>New Number (0312-7788990)</Text>
            </TouchableOpacity>
          </View>

          {/* Custom Number Input */}
          <View style={styles.customSimRow}>
            <TextInput
              style={styles.simInput}
              placeholder="Enter Pakistani number (e.g. 03001234567)..."
              placeholderTextColor="#999999"
              value={customSimNumber}
              onChangeText={setCustomSimNumber}
              keyboardType="phone-pad"
            />
            <TouchableOpacity
              style={styles.simTriggerBtn}
              onPress={() => handleSimulateCall(customSimNumber)}
            >
              <Ionicons name="call" size={16} color="#FFFFFF" />
              <Text style={styles.simTriggerBtnText}>Simulate Call</Text>
            </TouchableOpacity>
          </View>

          {/* Step simulator controls */}
          <View style={styles.stepControlsRow}>
            <TouchableOpacity
              style={[styles.stepBtn, { backgroundColor: '#DEF7EC' }]}
              onPress={handleSimulateAnswer}
            >
              <Ionicons name="call-outline" size={14} color="#03543F" />
              <Text style={[styles.stepBtnText, { color: '#03543F' }]}>Simulate Answered</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.stepBtn, { backgroundColor: '#FEE2E2' }]}
              onPress={handleSimulateEnd}
            >
              <Ionicons name="call" size={14} color="#991B1B" />
              <Text style={[styles.stepBtnText, { color: '#991B1B' }]}>Simulate End Call</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Recent Call Log Section */}
      <View style={styles.card}>
        <View style={styles.logHeaderRow}>
          <View>
            <Text style={styles.cardTitle}>Recent Incoming Call Log</Text>
            <Text style={styles.cardSubtitle}>
              {filteredLogs.length} calls recorded ({callLog.length} total)
            </Text>
          </View>

          {callLog.length > 0 ? (
            <TouchableOpacity
              style={styles.clearBtn}
              onPress={() => {
                const confirmMsg = 'Are you sure you want to clear all call logs?';
                if (Platform.OS === 'web') {
                  if (window.confirm(confirmMsg)) clearCallLog();
                } else {
                  Alert.alert('Clear History', confirmMsg, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Clear', style: 'destructive', onPress: clearCallLog },
                  ]);
                }
              }}
            >
              <Ionicons name="trash-outline" size={14} color={BRAND.danger} />
              <Text style={styles.clearBtnText}>Clear Log</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Filter & Search Bar */}
        <View style={styles.filterBar}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={16} color="#888888" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by phone number or customer name..."
              placeholderTextColor="#999999"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery ? (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={16} color="#888888" />
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Status Filter Tabs */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll}>
            {(['all', 'incoming', 'answered', 'missed', 'ended'] as const).map((tab) => (
              <TouchableOpacity
                key={tab}
                style={[
                  styles.filterTab,
                  statusFilter === tab && styles.filterTabActive,
                ]}
                onPress={() => setStatusFilter(tab)}
              >
                <Text
                  style={[
                    styles.filterTabText,
                    statusFilter === tab && styles.filterTabTextActive,
                  ]}
                >
                  {tab.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Call Log List */}
        {filteredLogs.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="call-outline" size={48} color="#D1D5DB" />
            <Text style={styles.emptyTitle}>No Calls Recorded</Text>
            <Text style={styles.emptySubtitle}>
              {callLog.length === 0
                ? 'Incoming phone calls received on this device will automatically show up here.'
                : 'No calls match the current filter or search criteria.'}
            </Text>
          </View>
        ) : (
          <View style={styles.logList}>
            {filteredLogs.map((item) => {
              const cust = getCustomerByPhone(item.normalizedPhone);
              const isKnown = Boolean(cust || item.isKnownCustomer);
              const formattedTime = new Date(item.timestamp).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              });
              const formattedDate = new Date(item.timestamp).toLocaleDateString([], {
                month: 'short',
                day: 'numeric',
              });

              return (
                <View key={item.id} style={styles.logItem}>
                  {/* Status Icon */}
                  <View
                    style={[
                      styles.logStatusIconBox,
                      item.status === 'missed'
                        ? { backgroundColor: '#FEE2E2' }
                        : item.status === 'answered'
                        ? { backgroundColor: '#DEF7EC' }
                        : item.status === 'incoming'
                        ? { backgroundColor: '#FEF3C7' }
                        : { backgroundColor: '#F3F4F6' },
                    ]}
                  >
                    <Ionicons
                      name={
                        item.status === 'missed'
                          ? 'call'
                          : item.status === 'answered'
                          ? 'call'
                          : item.status === 'incoming'
                          ? 'notifications'
                          : 'call-outline'
                      }
                      size={18}
                      color={
                        item.status === 'missed'
                          ? BRAND.danger
                          : item.status === 'answered'
                          ? BRAND.success
                          : item.status === 'incoming'
                          ? '#D97706'
                          : '#6B7280'
                      }
                    />
                  </View>

                  {/* Caller Details */}
                  <View style={styles.logDetails}>
                    <View style={styles.logTopRow}>
                      <Text style={styles.logNumber}>
                        {formatPakistaniDisplayPhone(item.normalizedPhone, 'local') ||
                          item.phoneNumber}
                      </Text>
                      <View
                        style={[
                          styles.statusBadge,
                          item.status === 'missed'
                            ? { backgroundColor: '#FEE2E2' }
                            : item.status === 'answered'
                            ? { backgroundColor: '#DEF7EC' }
                            : item.status === 'incoming'
                            ? { backgroundColor: '#FEF3C7' }
                            : { backgroundColor: '#F3F4F6' },
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusBadgeText,
                            item.status === 'missed'
                              ? { color: BRAND.danger }
                              : item.status === 'answered'
                              ? { color: BRAND.success }
                              : item.status === 'incoming'
                              ? { color: '#B45309' }
                              : { color: '#4B5563' },
                          ]}
                        >
                          {item.status.toUpperCase()}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.logMetaRow}>
                      {isKnown && (cust?.name || item.customerName) ? (
                        <View style={styles.knownCustPill}>
                          <Ionicons name="person" size={12} color={BRAND.burgundy} />
                          <Text style={styles.knownCustName}>
                            {cust?.name || item.customerName}
                          </Text>
                          {cust?.tier ? (
                            <Text style={styles.knownCustTier}>• {cust.tier}</Text>
                          ) : null}
                        </View>
                      ) : (
                        <Text style={styles.unknownCustText}>Unsaved Caller</Text>
                      )}

                      <Text style={styles.logTime}>
                        {formattedDate}, {formattedTime}
                        {item.durationSeconds ? ` (${item.durationSeconds}s)` : ''}
                      </Text>
                    </View>
                  </View>

                  {/* Quick Action Buttons */}
                  <View style={styles.logActions}>
                    <TouchableOpacity
                      style={styles.orderActionBtn}
                      onPress={() => handleTakeOrder(item)}
                    >
                      <Ionicons name="cart" size={14} color="#FFFFFF" />
                      <Text style={styles.orderActionBtnText}>Order</Text>
                    </TouchableOpacity>

                    {!isKnown ? (
                      <TouchableOpacity
                        style={styles.saveActionBtn}
                        onPress={() => handleQuickSaveCustomer(item)}
                      >
                        <Ionicons name="person-add" size={14} color={BRAND.burgundy} />
                      </TouchableOpacity>
                    ) : null}

                    <TouchableOpacity
                      style={styles.delActionBtn}
                      onPress={() => removeCallFromLog(item.id)}
                    >
                      <Ionicons name="close" size={16} color="#9CA3AF" />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F7F5F0',
  },
  screenContent: {
    padding: 20,
    gap: 16,
    paddingBottom: 40,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: BRAND.border,
  },
  screenTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: BRAND.burgundy,
  },
  screenSubtitle: {
    fontSize: 13,
    color: BRAND.muted,
    marginTop: 2,
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BRAND.border,
  },
  refreshBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: BRAND.burgundy,
  },
  grid: {
    flexDirection: 'row',
    gap: 16,
  },
  gridMobile: {
    flexDirection: 'column',
  },
  card: {
    flex: 1,
    backgroundColor: BRAND.cardBg,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: BRAND.border,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  simCard: {
    borderWidth: 1.5,
    borderColor: '#FDE68A',
    backgroundColor: '#FFFCF5',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: BRAND.ink,
  },
  cardSubtitle: {
    fontSize: 12,
    color: BRAND.muted,
  },
  cardBody: {
    gap: 12,
  },
  statusPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '700',
    color: BRAND.ink,
  },
  explainerText: {
    fontSize: 12,
    color: BRAND.muted,
    lineHeight: 18,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  batteryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#D97706',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginTop: 4,
  },
  batteryBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  permsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginTop: 4,
  },
  permItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  permLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: BRAND.ink,
  },
  simBadge: {
    backgroundColor: '#FDE68A',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  simBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#B45309',
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BRAND.border,
  },
  presetBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: BRAND.burgundy,
  },
  customSimRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  simInput: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: BRAND.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
    fontSize: 13,
    color: BRAND.ink,
  },
  simTriggerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: BRAND.burgundy,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
  },
  simTriggerBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  stepControlsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  stepBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  stepBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  logHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
  },
  clearBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: BRAND.danger,
  },
  filterBar: {
    gap: 12,
    marginBottom: 14,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: BRAND.ink,
  },
  tabsScroll: {
    flexDirection: 'row',
  },
  filterTab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 8,
    backgroundColor: '#F3F4F6',
  },
  filterTabActive: {
    backgroundColor: BRAND.burgundy,
  },
  filterTabText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
  },
  filterTabTextActive: {
    color: '#FFFFFF',
  },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4B5563',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
    maxWidth: 360,
  },
  logList: {
    gap: 10,
  },
  logItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FDFBF8',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#F0ECE4',
    gap: 12,
  },
  logStatusIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logDetails: {
    flex: 1,
    gap: 4,
  },
  logTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logNumber: {
    fontSize: 15,
    fontWeight: '800',
    color: BRAND.ink,
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  logMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  knownCustPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FCE7E9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  knownCustName: {
    fontSize: 12,
    fontWeight: '700',
    color: BRAND.burgundy,
  },
  knownCustTier: {
    fontSize: 11,
    color: '#991B1B',
  },
  unknownCustText: {
    fontSize: 12,
    color: '#9CA3AF',
    fontStyle: 'italic',
  },
  logTime: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  logActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  orderActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: BRAND.burgundy,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  orderActionBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  saveActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#FAF5EE',
    borderWidth: 1,
    borderColor: BRAND.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  delActionBtn: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
