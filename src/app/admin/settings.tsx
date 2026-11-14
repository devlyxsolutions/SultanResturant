import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Switch,
  StyleSheet,
  Platform,
  Alert,
  Modal,
  Share,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSettingsStore } from '../../store/settingsStore';
import { useRestaurantStore, StaffMember, StaffRole, StaffShift } from '../../store/restaurantStore';
import { useRoleStore } from '../../store/roleStore';
import { useAuthStore } from '../../store/authStore';
import {
  subscribeToSyncStatus,
  setCustomServerIp,
  forceSyncNow,
  broadcastImmediately,
  reconnect,
  SyncInfo,
} from '../../services/syncService';
import {
  buildSystemBackupPayload,
  restoreSystemBackupPayload,
  clearAllActiveTicketsAndReleaseTables,
  clearSalesAndInvoices,
  clearCustomerCrm,
  resetMenuToFactoryDefaults,
  resetAllOperationalData,
} from '../../utils/systemDataControl';

type SettingsTab = 'general' | 'billing' | 'modules' | 'users' | 'sync' | 'data';

const TABS: { id: SettingsTab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'general', label: 'Branding', icon: 'storefront-outline' },
  { id: 'billing', label: 'Billing & Tax', icon: 'cash-outline' },
  { id: 'modules', label: 'Modules', icon: 'apps-outline' },
  { id: 'users', label: 'Users & Roles', icon: 'people-outline' },
  { id: 'sync', label: 'Sync & Server', icon: 'cloud-done-outline' },
  { id: 'data', label: 'Data & Backup', icon: 'server-outline' },
];

export default function AdminSettingsScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isCompact = width < 768;

  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const resetSettingsToDefaults = useSettingsStore((s) => s.resetSettingsToDefaults);

  const staff = useRestaurantStore((s) => s.staff);
  const addStaff = useRestaurantStore((s) => s.addStaff);
  const updateStaff = useRestaurantStore((s) => s.updateStaff);
  const deleteStaff = useRestaurantStore((s) => s.deleteStaff);

  const tables = useRestaurantStore((s) => s.tables);
  const tickets = useRestaurantStore((s) => s.tickets);
  const invoices = useRestaurantStore((s) => s.invoices);
  const customers = useRestaurantStore((s) => s.customers);
  const menuItems = useRestaurantStore((s) => s.menuItems);
  const roles = useRoleStore((s) => s.roles);
  const resetToDefaultRoles = useRoleStore((s) => s.resetToDefaultRoles);
  const currentUser = useAuthStore((s) => s.user);

  const [syncInfo, setSyncInfo] = useState<SyncInfo | null>(null);
  const [serverIpInput, setServerIpInput] = useState('');

  // User modal state
  const [userModalVisible, setUserModalVisible] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [uName, setUName] = useState('');
  const [uPhone, setUPhone] = useState('');
  const [uPin, setUPin] = useState('');
  const [uRole, setURole] = useState<StaffRole>('waiter');
  const [uCustomRoleId, setUCustomRoleId] = useState<string>('role-waiter');
  const [uShift, setUShift] = useState<StaffShift>('Morning');
  const [userSearch, setUserSearch] = useState('');

  // Restore modal state
  const [restoreModalVisible, setRestoreModalVisible] = useState(false);
  const [restoreJsonText, setRestoreJsonText] = useState('');

  // Danger confirmation modal
  const [confirmModal, setConfirmModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ visible: false, title: '', message: '', onConfirm: () => {} });

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg((prev) => (prev === msg ? null : prev)), 3000);
  };

  useEffect(() => {
    const unsub = subscribeToSyncStatus((info) => {
      setSyncInfo(info);
      setServerIpInput((prev) => (prev ? prev : info.serverIp || ''));
    });
    return () => {
      unsub();
    };
  }, []);

  const filteredStaff = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return staff || [];
    return (staff || []).filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.role.toLowerCase().includes(q) ||
        (s.phone || '').toLowerCase().includes(q)
    );
  }, [staff, userSearch]);

  const openAddUserModal = () => {
    setEditingStaff(null);
    setUName('');
    setUPhone('');
    setUPin('');
    setURole('waiter');
    setUCustomRoleId(roles[0]?.id || 'role-waiter');
    setUShift('Morning');
    setUserModalVisible(true);
  };

  const openEditUserModal = (member: StaffMember) => {
    setEditingStaff(member);
    setUName(member.name);
    setUPhone(member.phone || '');
    setUPin(member.pin || '');
    setURole(member.role);
    setUCustomRoleId(member.customRoleId || '');
    setUShift(member.shift || 'Morning');
    setUserModalVisible(true);
  };

  const handleSaveUser = () => {
    if (!uName.trim()) {
      Alert.alert('Validation', 'Staff name is required.');
      return;
    }
    if (!uPin.trim() || uPin.trim().length < 4) {
      Alert.alert('Validation', 'PIN must be at least 4 digits.');
      return;
    }
    if (editingStaff) {
      updateStaff(editingStaff.id, {
        name: uName.trim(),
        phone: uPhone.trim(),
        pin: uPin.trim(),
        role: uRole,
        customRoleId: uCustomRoleId || undefined,
        shift: uShift,
      });
      showToast(`Updated user "${uName.trim()}"`);
    } else {
      addStaff({
        name: uName.trim(),
        phone: uPhone.trim() || '0300-0000000',
        pin: uPin.trim(),
        role: uRole,
        customRoleId: uCustomRoleId || undefined,
        status: 'Active',
        shift: uShift,
        joinedDate: new Date().toISOString().split('T')[0],
      });
      showToast(`Added user "${uName.trim()}"`);
    }
    broadcastImmediately();
    setUserModalVisible(false);
  };

  const handleExportBackup = async () => {
    const payload = buildSystemBackupPayload();
    const jsonStr = JSON.stringify(payload, null, 2);

    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sultan_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Full system backup JSON downloaded!');
    } else {
      try {
        await Share.share({
          message: jsonStr,
          title: `Sultan Backup ${new Date().toISOString().slice(0, 10)}`,
        });
      } catch {
        Alert.alert('Backup Ready', `Backup size: ${Math.round(jsonStr.length / 1024)} KB`);
      }
    }
  };

  const handleRestoreBackup = () => {
    if (!restoreJsonText.trim()) {
      Alert.alert('Empty Backup', 'Paste your backup JSON first.');
      return;
    }
    const res = restoreSystemBackupPayload(restoreJsonText);
    if (res.ok) {
      setRestoreModalVisible(false);
      setRestoreJsonText('');
      showToast(res.message);
    } else {
      Alert.alert('Restore Failed', res.message);
    }
  };

  const askConfirm = (title: string, message: string, onConfirm: () => void) => {
    setConfirmModal({ visible: true, title, message, onConfirm });
  };

  const renderToggleRow = (
    title: string,
    subtitle: string,
    value: boolean,
    onValueChange: (val: boolean) => void
  ) => (
    <View style={styles.toggleRow}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSub}>{subtitle}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={(v) => {
          onValueChange(v);
          showToast('Setting updated & synced');
        }}
        trackColor={{ false: '#D6D3D1', true: '#52171B' }}
        thumbColor={value ? '#D4AF37' : '#F5F5F4'}
      />
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>System Control & Settings</Text>
          <Text style={styles.headerSub}>
            Control branding, taxes, modules, users, sync server & full data backups
          </Text>
        </View>
        <TouchableOpacity
          style={styles.syncPill}
          onPress={async () => {
            broadcastImmediately();
            const ok = await forceSyncNow();
            showToast(ok ? 'All devices synced!' : 'Broadcast sent to local network');
          }}
        >
          <Ionicons name="sync-outline" size={16} color="#140306" />
          <Text style={styles.syncPillText}>Sync Now</Text>
        </TouchableOpacity>
      </View>

      {toastMsg && (
        <View style={styles.toast}>
          <Ionicons name="checkmark-circle" size={16} color="#D4AF37" />
          <Text style={styles.toastText}>{toastMsg}</Text>
        </View>
      )}

      {/* Horizontal Tab Bar */}
      <View style={styles.tabBarWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabBar}>
          {TABS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <TouchableOpacity
                key={tab.id}
                style={[styles.tabBtn, active && styles.tabBtnActive]}
                onPress={() => setActiveTab(tab.id)}
              >
                <Ionicons
                  name={tab.icon}
                  size={16}
                  color={active ? '#140306' : '#52171B'}
                />
                <Text style={[styles.tabBtnText, active && styles.tabBtnTextActive]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Tab Content */}
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* 1. GENERAL & BRANDING */}
        {activeTab === 'general' && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Restaurant Identity & Receipt Header</Text>

            <View style={[styles.grid, isCompact && styles.gridCol]}>
              <View style={styles.fieldBox}>
                <Text style={styles.label}>Restaurant Name</Text>
                <TextInput
                  style={styles.input}
                  value={settings.restaurantName}
                  onChangeText={(t) => updateSettings({ restaurantName: t })}
                  placeholder="SULTAN RESTAURANT"
                />
              </View>
              <View style={styles.fieldBox}>
                <Text style={styles.label}>Tagline / Subtitle</Text>
                <TextInput
                  style={styles.input}
                  value={settings.tagline}
                  onChangeText={(t) => updateSettings({ tagline: t })}
                  placeholder="Royal Mughlai & BBQ Dining"
                />
              </View>
            </View>

            <View style={[styles.grid, isCompact && styles.gridCol]}>
              <View style={styles.fieldBox}>
                <Text style={styles.label}>Contact Phone</Text>
                <TextInput
                  style={styles.input}
                  value={settings.phone}
                  onChangeText={(t) => updateSettings({ phone: t })}
                  placeholder="0300-1234567"
                />
              </View>
              <View style={styles.fieldBox}>
                <Text style={styles.label}>NTN / Tax Registration ID</Text>
                <TextInput
                  style={styles.input}
                  value={settings.ntnOrTaxId}
                  onChangeText={(t) => updateSettings({ ntnOrTaxId: t })}
                  placeholder="8943120-4"
                />
              </View>
            </View>

            <View style={styles.fieldBoxFull}>
              <Text style={styles.label}>Restaurant Address</Text>
              <TextInput
                style={styles.input}
                value={settings.address}
                onChangeText={(t) => updateSettings({ address: t })}
                placeholder="Food Street, Culinary District, Lahore"
              />
            </View>

            <View style={styles.fieldBoxFull}>
              <Text style={styles.label}>Receipt Footer Message</Text>
              <TextInput
                style={styles.input}
                value={settings.footerMessage}
                onChangeText={(t) => updateSettings({ footerMessage: t })}
                placeholder="Thank you for dining with Sultan!"
              />
            </View>

            <View style={styles.divider} />
            {renderToggleRow(
              'Show Logo on Printed Receipts',
              'Display Sultan crest at the top of thermal & A4 invoices',
              settings.showLogoOnReceipt,
              (v) => updateSettings({ showLogoOnReceipt: v })
            )}
            {renderToggleRow(
              'Show Feedback QR Code on Receipts',
              'Include scannable dish review & loyalty QR code at receipt bottom',
              settings.showQrOnReceipt,
              (v) => updateSettings({ showQrOnReceipt: v })
            )}
          </View>
        )}

        {/* 2. BILLING & TAX */}
        {activeTab === 'billing' && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Taxes, Charges & POS Checkout Rules</Text>

            <View style={[styles.grid, isCompact && styles.gridCol]}>
              <View style={styles.fieldBox}>
                <Text style={styles.label}>Currency Symbol</Text>
                <TextInput
                  style={styles.input}
                  value={settings.currencySymbol}
                  onChangeText={(t) => updateSettings({ currencySymbol: t })}
                  placeholder="Rs."
                />
              </View>
              <View style={styles.fieldBox}>
                <Text style={styles.label}>Tax Label (e.g. GST Tax, VAT)</Text>
                <TextInput
                  style={styles.input}
                  value={settings.taxLabel}
                  onChangeText={(t) => updateSettings({ taxLabel: t })}
                  placeholder="GST Tax"
                />
              </View>
            </View>

            <View style={[styles.grid, isCompact && styles.gridCol]}>
              <View style={styles.fieldBox}>
                <Text style={styles.label}>Tax Rate (%)</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={String(settings.taxRatePercent)}
                  onChangeText={(t) => updateSettings({ taxRatePercent: parseFloat(t) || 0 })}
                  placeholder="16"
                />
              </View>
              <View style={styles.fieldBox}>
                <Text style={styles.label}>Default Delivery Fee</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={String(settings.deliveryFeeDefault)}
                  onChangeText={(t) => updateSettings({ deliveryFeeDefault: parseFloat(t) || 0 })}
                  placeholder="150"
                />
              </View>
            </View>

            <View style={styles.divider} />
            {renderToggleRow(
              'Enable Sales Tax (GST)',
              'Automatically apply configured tax rate on POS & table bills',
              settings.taxEnabled,
              (v) => updateSettings({ taxEnabled: v })
            )}
            {renderToggleRow(
              'Round Bill Totals',
              'Round final payable amounts to nearest whole currency unit',
              settings.roundTotals,
              (v) => updateSettings({ roundTotals: v })
            )}
            {renderToggleRow(
              'Allow Custom Discounts on POS',
              'Permit cashiers/managers to apply ad-hoc bill discounts',
              settings.allowCustomDiscount,
              (v) => updateSettings({ allowCustomDiscount: v })
            )}
            {renderToggleRow(
              'Auto-Print Receipt on Payment',
              'Automatically trigger receipt print dialog when invoice is settled',
              settings.autoPrintReceiptOnPay,
              (v) => updateSettings({ autoPrintReceiptOnPay: v })
            )}
            {renderToggleRow(
              'Auto-Send Orders to KDS',
              'Dispatch kitchen/bar KOT immediately when order is placed',
              settings.autoSendKdsOnOrder,
              (v) => updateSettings({ autoSendKdsOnOrder: v })
            )}
          </View>
        )}

        {/* 3. MODULES & OPERATIONS */}
        {activeTab === 'modules' && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>System Modules & Operational Controls</Text>
            {renderToggleRow(
              'Dine-In Floor & Tables',
              'Enable table seating, waiter assignment, and floor management',
              settings.enableDineIn,
              (v) => updateSettings({ enableDineIn: v })
            )}
            {renderToggleRow(
              'Takeaway Counter Orders',
              'Enable quick takeaway tickets at POS',
              settings.enableTakeaway,
              (v) => updateSettings({ enableTakeaway: v })
            )}
            {renderToggleRow(
              'Delivery & Rider Dispatch',
              'Enable delivery address, phone lookup, and delivery fee calculation',
              settings.enableDelivery,
              (v) => updateSettings({ enableDelivery: v })
            )}
            {renderToggleRow(
              'Playland Hub Module',
              'Enable Playland ticketing, wristband tracking & arcade sessions',
              settings.enablePlayland,
              (v) => updateSettings({ enablePlayland: v })
            )}
            {renderToggleRow(
              'Online & QR App Orders',
              'Accept live incoming orders from customer digital menu',
              settings.enableOnlineOrders,
              (v) => updateSettings({ enableOnlineOrders: v })
            )}
            {renderToggleRow(
              'Incoming Call Detector (Android)',
              'Auto-detect caller phone numbers for instant delivery CRM lookup',
              settings.enableCallDetector,
              (v) => updateSettings({ enableCallDetector: v })
            )}
            {renderToggleRow(
              'KDS Audio Alerts',
              'Play notification chime on Kitchen & Juice Bar screens for new KOTs',
              settings.kdsSoundAlerts,
              (v) => updateSettings({ kdsSoundAlerts: v })
            )}

            <View style={[styles.fieldBoxFull, { marginTop: 12 }]}>
              <Text style={styles.label}>Low Stock Alert Threshold (Units)</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                value={String(settings.lowStockAlertThreshold)}
                onChangeText={(t) => updateSettings({ lowStockAlertThreshold: parseInt(t, 10) || 0 })}
              />
            </View>
          </View>
        )}

        {/* 4. USERS & ROLES */}
        {activeTab === 'users' && (
          <View style={styles.card}>
            <View style={styles.sectionHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>Users, Staff & Access Control</Text>
                <Text style={styles.rowSub}>
                  Logged in as: {currentUser?.name || 'Admin'} ({currentUser?.role || 'admin'})
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={() => router.push('/admin/staff' as any)}
                >
                  <Ionicons name="shield-checkmark-outline" size={15} color="#52171B" />
                  <Text style={styles.secondaryBtnText}>Role Matrix</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.primaryBtn} onPress={openAddUserModal}>
                  <Ionicons name="person-add-outline" size={15} color="#140306" />
                  <Text style={styles.primaryBtnText}>Add User</Text>
                </TouchableOpacity>
              </View>
            </View>

            <TextInput
              style={[styles.input, { marginBottom: 12 }]}
              placeholder="Search users by name, role or phone..."
              value={userSearch}
              onChangeText={setUserSearch}
            />

            {filteredStaff.map((member) => {
              const isActive = member.status === 'Active';
              return (
                <View key={member.id} style={styles.userRow}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={styles.rowTitle}>{member.name}</Text>
                      <View style={[styles.badge, isActive ? styles.badgeGreen : styles.badgeGray]}>
                        <Text style={styles.badgeText}>{isActive ? 'ACTIVE' : 'DISABLED'}</Text>
                      </View>
                    </View>
                    <Text style={styles.rowSub}>
                      Role: {member.role.toUpperCase()} • PIN: {member.pin} • Shift: {member.shift}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <TouchableOpacity
                      style={styles.iconBtn}
                      onPress={() => {
                        updateStaff(member.id, {
                          status: isActive ? 'Inactive' : 'Active',
                        });
                        broadcastImmediately();
                        showToast(`${member.name} ${isActive ? 'disabled' : 'activated'}`);
                      }}
                    >
                      <Ionicons
                        name={isActive ? 'pause-circle-outline' : 'play-circle-outline'}
                        size={18}
                        color="#52171B"
                      />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.iconBtn} onPress={() => openEditUserModal(member)}>
                      <Ionicons name="create-outline" size={18} color="#B48214" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.iconBtn}
                      onPress={() =>
                        askConfirm(
                          'Delete User',
                          `Remove "${member.name}" from staff?`,
                          () => {
                            deleteStaff(member.id);
                            broadcastImmediately();
                            showToast(`Removed ${member.name}`);
                          }
                        )
                      }
                    >
                      <Ionicons name="trash-outline" size={18} color="#DC2626" />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* 5. SYNC & SERVER */}
        {activeTab === 'sync' && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>LAN Hub & Cloud Synchronization</Text>

            <View style={styles.statGrid}>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Status</Text>
                <Text
                  style={[
                    styles.statValue,
                    { color: syncInfo?.status === 'connected' ? '#059669' : '#D97706' },
                  ]}
                >
                  {(syncInfo?.status || 'offline').toUpperCase()}
                </Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Device ID</Text>
                <Text style={styles.statValue} numberOfLines={1}>
                  {syncInfo?.deviceId || 'N/A'}
                </Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Synced Events</Text>
                <Text style={styles.statValue}>{syncInfo?.totalSyncedEvents ?? 0}</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Last Synced</Text>
                <Text style={styles.statValue}>
                  {syncInfo?.lastSyncedAt
                    ? new Date(syncInfo.lastSyncedAt).toLocaleTimeString()
                    : 'Never'}
                </Text>
              </View>
            </View>

            <View style={styles.fieldBoxFull}>
              <Text style={styles.label}>Central POS Server IP / URL</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={serverIpInput}
                  onChangeText={setServerIpInput}
                  placeholder="192.168.100.3 or https://..."
                />
                <TouchableOpacity
                  style={styles.primaryBtn}
                  onPress={async () => {
                    await setCustomServerIp(serverIpInput.trim());
                    reconnect();
                    showToast('Server IP updated & reconnecting...');
                  }}
                >
                  <Text style={styles.primaryBtnText}>Save & Connect</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.divider} />
            {renderToggleRow(
              'Auto-Sync Across Devices',
              'Automatically broadcast state changes to tablets & kitchen displays',
              settings.autoSyncEnabled,
              (v) => updateSettings({ autoSyncEnabled: v })
            )}
            {renderToggleRow(
              'Cloud Backup Sync',
              'Mirror live operational state to Firebase cloud backup when online',
              settings.cloudBackupEnabled,
              (v) => updateSettings({ cloudBackupEnabled: v })
            )}
          </View>
        )}

        {/* 6. DATA & BACKUP */}
        {activeTab === 'data' && (
          <View style={{ gap: 14 }}>
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Live System Database Overview</Text>
              <View style={styles.statGrid}>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>Menu Items</Text>
                  <Text style={styles.statValue}>{menuItems.length}</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>Tables</Text>
                  <Text style={styles.statValue}>{tables.length}</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>Active Tickets</Text>
                  <Text style={styles.statValue}>{tickets.length}</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>Invoices</Text>
                  <Text style={styles.statValue}>{invoices.length}</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>Customers</Text>
                  <Text style={styles.statValue}>{customers.length}</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>Staff / Roles</Text>
                  <Text style={styles.statValue}>
                    {staff.length} / {roles.length}
                  </Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
                <TouchableOpacity style={styles.primaryBtn} onPress={handleExportBackup}>
                  <Ionicons name="download-outline" size={16} color="#140306" />
                  <Text style={styles.primaryBtnText}>Export Full Backup (JSON)</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={() => setRestoreModalVisible(true)}
                >
                  <Ionicons name="cloud-upload-outline" size={16} color="#52171B" />
                  <Text style={styles.secondaryBtnText}>Restore from Backup</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={[styles.card, { borderColor: '#FCA5A5' }]}>
              <Text style={[styles.sectionTitle, { color: '#991B1B' }]}>
                System Maintenance & Data Reset Controls
              </Text>

              <View style={{ gap: 10 }}>
                <TouchableOpacity
                  style={styles.dangerRowBtn}
                  onPress={() =>
                    askConfirm(
                      'Clear Active Tickets & Release Tables',
                      'This will clear all open tickets and mark every table as Available across all devices.',
                      () => {
                        const count = clearAllActiveTicketsAndReleaseTables();
                        showToast(`Cleared ${count} tickets & released all tables`);
                      }
                    )
                  }
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dangerTitle}>Clear Active Tickets & Release All Tables</Text>
                    <Text style={styles.rowSub}>Fixes stuck occupied tables across POS & Tablets</Text>
                  </View>
                  <Ionicons name="refresh-circle-outline" size={22} color="#B45309" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.dangerRowBtn}
                  onPress={() =>
                    askConfirm(
                      'Clear Invoices & Sales History',
                      'Permanently delete all saved invoices and online order records?',
                      () => {
                        const count = clearSalesAndInvoices();
                        showToast(`Cleared ${count} invoices`);
                      }
                    )
                  }
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dangerTitle}>Clear Sales & Invoices History</Text>
                    <Text style={styles.rowSub}>Keeps menu, staff, tables and settings intact</Text>
                  </View>
                  <Ionicons name="receipt-outline" size={22} color="#DC2626" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.dangerRowBtn}
                  onPress={() =>
                    askConfirm(
                      'Clear Customer CRM',
                      'Delete all saved customer CRM profiles?',
                      () => {
                        const count = clearCustomerCrm();
                        showToast(`Cleared ${count} customers`);
                      }
                    )
                  }
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dangerTitle}>Clear Customer CRM Database</Text>
                    <Text style={styles.rowSub}>Removes all customer phone & loyalty records</Text>
                  </View>
                  <Ionicons name="person-remove-outline" size={22} color="#DC2626" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.dangerRowBtn}
                  onPress={() =>
                    askConfirm(
                      'Reset Menu to Factory Defaults',
                      'Restore default Sultan Restaurant menu items and categories?',
                      () => {
                        resetMenuToFactoryDefaults();
                        showToast('Menu reset to factory defaults');
                      }
                    )
                  }
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dangerTitle}>Reset Menu Catalog to Defaults</Text>
                    <Text style={styles.rowSub}>Restores original Sultan menu items & categories</Text>
                  </View>
                  <Ionicons name="restaurant-outline" size={22} color="#B45309" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.dangerRowBtn}
                  onPress={() =>
                    askConfirm(
                      'Reset Roles & System Settings',
                      'Restore default role permissions and default system settings?',
                      () => {
                        resetToDefaultRoles();
                        resetSettingsToDefaults();
                        broadcastImmediately();
                        showToast('Roles & settings reset to defaults');
                      }
                    )
                  }
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dangerTitle}>Reset Roles & Settings to Defaults</Text>
                    <Text style={styles.rowSub}>Restores default permissions, tax (16%) & branding</Text>
                  </View>
                  <Ionicons name="settings-outline" size={22} color="#B45309" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.dangerRowBtn, { backgroundColor: '#FEF2F2', borderColor: '#EF4444' }]}
                  onPress={() =>
                    askConfirm(
                      'FULL OPERATIONAL RESET',
                      'This clears all tickets, tables, invoices, shifts, and reservations across all devices. Staff, Menu, and Settings remain.',
                      () => {
                        resetAllOperationalData();
                        showToast('Full operational data reset complete');
                      }
                    )
                  }
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.dangerTitle, { color: '#991B1B' }]}>
                      Full Operational Data Reset
                    </Text>
                    <Text style={styles.rowSub}>
                      Clears all tickets, tables, invoices, shifts & reservations
                    </Text>
                  </View>
                  <Ionicons name="nuclear-outline" size={22} color="#991B1B" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Add/Edit User Modal */}
      <Modal visible={userModalVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.sectionTitle}>
              {editingStaff ? 'Edit Staff / User' : 'Add New Staff / User'}
            </Text>
            <Text style={styles.label}>Full Name</Text>
            <TextInput style={styles.input} value={uName} onChangeText={setUName} placeholder="Ali Raza" />
            <Text style={[styles.label, { marginTop: 10 }]}>Phone</Text>
            <TextInput style={styles.input} value={uPhone} onChangeText={setUPhone} placeholder="0300-1234567" />
            <Text style={[styles.label, { marginTop: 10 }]}>Login PIN (4+ digits)</Text>
            <TextInput
              style={styles.input}
              value={uPin}
              onChangeText={setUPin}
              keyboardType="numeric"
              placeholder="1234"
            />
            <Text style={[styles.label, { marginTop: 10 }]}>Role</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {(['admin', 'manager', 'floor_manager', 'waiter', 'kitchen', 'juicebar', 'playland'] as StaffRole[]).map(
                (r) => (
                  <TouchableOpacity
                    key={r}
                    style={[styles.chip, uRole === r && styles.chipActive]}
                    onPress={() => setURole(r)}
                  >
                    <Text style={[styles.chipText, uRole === r && styles.chipTextActive]}>
                      {r.replace('_', ' ').toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                )
              )}
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => setUserModalVisible(false)}
              >
                <Text style={styles.secondaryBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.primaryBtn} onPress={handleSaveUser}>
                <Text style={styles.primaryBtnText}>Save User</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Restore Backup Modal */}
      <Modal visible={restoreModalVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.sectionTitle}>Restore System from JSON Backup</Text>
            <Text style={styles.rowSub}>Paste exported JSON backup content below:</Text>
            <TextInput
              style={[styles.input, { height: 180, textAlignVertical: 'top', marginTop: 8 }]}
              multiline
              value={restoreJsonText}
              onChangeText={setRestoreJsonText}
              placeholder='{"version": 1, "data": { ... }}'
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => setRestoreModalVisible(false)}
              >
                <Text style={styles.secondaryBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.primaryBtn} onPress={handleRestoreBackup}>
                <Text style={styles.primaryBtnText}>Restore Now</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Confirm Danger Modal */}
      <Modal visible={confirmModal.visible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={[styles.sectionTitle, { color: '#991B1B' }]}>{confirmModal.title}</Text>
            <Text style={[styles.rowSub, { marginVertical: 8, fontSize: 13.5 }]}>
              {confirmModal.message}
            </Text>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => setConfirmModal((p) => ({ ...p, visible: false }))}
              >
                <Text style={styles.secondaryBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: '#DC2626' }]}
                onPress={() => {
                  const fn = confirmModal.onConfirm;
                  setConfirmModal((p) => ({ ...p, visible: false }));
                  fn();
                }}
              >
                <Text style={[styles.primaryBtnText, { color: '#FFFFFF' }]}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAF6EE' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: '#52171B',
    borderBottomWidth: 2,
    borderBottomColor: '#D4AF37',
    gap: 12,
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#D4AF37' },
  headerSub: { fontSize: 12, color: '#FDE68A', marginTop: 2 },
  syncPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#D4AF37',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  syncPillText: { fontSize: 12, fontWeight: '800', color: '#140306' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#140306',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  toastText: { color: '#FAF6EE', fontSize: 12.5, fontWeight: '600' },
  tabBarWrap: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E7E0D3',
  },
  tabBar: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  tabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#FAF6EE',
    borderWidth: 1,
    borderColor: '#E7E0D3',
  },
  tabBtnActive: { backgroundColor: '#D4AF37', borderColor: '#B48214' },
  tabBtnText: { fontSize: 12.5, fontWeight: '700', color: '#52171B' },
  tabBtnTextActive: { color: '#140306' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E7E0D3',
  },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#52171B', marginBottom: 12 },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
  },
  grid: { flexDirection: 'row', gap: 12, marginBottom: 10 },
  gridCol: { flexDirection: 'column', gap: 10 },
  fieldBox: { flex: 1 },
  fieldBoxFull: { marginBottom: 10 },
  label: { fontSize: 12, fontWeight: '700', color: '#44403C', marginBottom: 4 },
  input: {
    backgroundColor: '#FAF6EE',
    borderWidth: 1,
    borderColor: '#D6CFC2',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13.5,
    color: '#1C1917',
  },
  divider: { height: 1, backgroundColor: '#E7E0D3', marginVertical: 12 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F5EFE4',
  },
  rowTitle: { fontSize: 13.5, fontWeight: '700', color: '#1C1917' },
  rowSub: { fontSize: 11.5, color: '#78716C', marginTop: 2 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#D4AF37',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
  },
  primaryBtnText: { fontSize: 12.5, fontWeight: '800', color: '#140306' },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FAF6EE',
    borderWidth: 1,
    borderColor: '#52171B',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  secondaryBtnText: { fontSize: 12.5, fontWeight: '700', color: '#52171B' },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F5EFE4',
    gap: 10,
  },
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  badgeGreen: { backgroundColor: '#DCFCE7' },
  badgeGray: { backgroundColor: '#E7E5E4' },
  badgeText: { fontSize: 10, fontWeight: '800', color: '#1C1917' },
  iconBtn: {
    padding: 7,
    borderRadius: 8,
    backgroundColor: '#FAF6EE',
    borderWidth: 1,
    borderColor: '#E7E0D3',
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
  },
  statBox: {
    minWidth: 130,
    flex: 1,
    backgroundColor: '#FAF6EE',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E7E0D3',
  },
  statLabel: { fontSize: 11, fontWeight: '700', color: '#78716C' },
  statValue: { fontSize: 15, fontWeight: '800', color: '#52171B', marginTop: 3 },
  dangerRowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E7E0D3',
    backgroundColor: '#FAF6EE',
    gap: 10,
  },
  dangerTitle: { fontSize: 13.5, fontWeight: '800', color: '#991B1B' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(20, 3, 6, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#D4AF37',
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#FAF6EE',
    borderWidth: 1,
    borderColor: '#D6CFC2',
  },
  chipActive: { backgroundColor: '#52171B', borderColor: '#52171B' },
  chipText: { fontSize: 11, fontWeight: '700', color: '#52171B' },
  chipTextActive: { color: '#D4AF37' },
});
