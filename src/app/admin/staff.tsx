import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import PermissionDeniedScreen from '../../components/PermissionDeniedScreen';
import SultanLogo from '../../components/SultanLogo';
import AttendanceTab from '../../components/staff/AttendanceTab';
import PayrollTab from '../../components/staff/PayrollTab';
import { getTableFloor, sortFloors } from '../../constants/floors';
import { broadcastImmediately } from '../../services/syncService';
import {
  INITIAL_STAFF,
  isLegacyDummyStaff,
  StaffMember,
  StaffRole,
  StaffShift,
  StaffStatus,
  useRestaurantStore,
} from '../../store/restaurantStore';
import {
  useRolePermissions,
  useRoleStore,
} from '../../store/roleStore';
import { useSettingsStore } from '../../store/settingsStore';

const SHIFTS: StaffShift[] = ['Morning', 'Evening', 'Night'];
const STATUSES: StaffStatus[] = ['Active', 'On Leave', 'Inactive'];

export const formatRoleName = (role: StaffRole | string) => {
  if (role === 'Waiter') return 'Order Taker';
  return role;
};

const BRAND = {
  burgundy: '#52171B',
  burgundyLight: '#6B1F24',
  gold: '#B48214',
  goldLight: '#FEF3C7',
  ink: '#1A1A1A',
  muted: '#64748B',
  border: '#E2E8F0',
  surface: '#F8FAFC',
  cardBg: '#FFFFFF',
  success: '#10B981',
  successLight: '#ECFDF5',
  danger: '#EF4444',
  dangerLight: '#FEE2E2',
  info: '#3B82F6',
  infoLight: '#EFF6FF',
};

export default function StaffManagementScreen({
  backRoute = '/admin/dashboard',
  role = 'admin',
}: {
  backRoute?: string;
  role?: 'admin' | 'manager';
} = {}) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const { can, canAddStaff, canEditStaff, canDeleteStaff } = useRolePermissions();
  const canViewSensitiveSalaries = role === 'admin' || can('canViewRevenue');

  const rawStaff = useRestaurantStore((state) => state.staff) || [];
  const staff = rawStaff.filter((s) => !isLegacyDummyStaff(s));
  const tables = useRestaurantStore((state) => state.tables) || [];
  const zones = useRestaurantStore((state) => state.zones) || [];
  const addStaff = useRestaurantStore((state) => state.addStaff);
  const updateStaff = useRestaurantStore((state) => state.updateStaff);
  const deleteStaff = useRestaurantStore((state) => state.deleteStaff);

  // Auto-purge any lingering legacy dummy staff from localStorage / state on mount & seed all real staff + logins
  useEffect(() => {
    const hasDummy = rawStaff.some((s) => isLegacyDummyStaff(s));
    const missingInitialOrLogins = INITIAL_STAFF.some((initS) => {
      const found = rawStaff.find((s) => s.id === initS.id);
      if (!found) return true;
      if (initS.hasSystemAccess && (!found.pin || found.hasSystemAccess === false || !found.username)) return true;
      return false;
    });
    if (hasDummy || missingInitialOrLogins) {
      const sMap = new Map<string, StaffMember>();
      for (const initS of INITIAL_STAFF) {
        sMap.set(initS.id, { ...initS });
      }
      for (const existing of rawStaff) {
        if (existing && existing.id && !isLegacyDummyStaff(existing)) {
          const base = sMap.get(existing.id);
          const merged: StaffMember = { ...(base || {}), ...existing };
          if (base?.hasSystemAccess && (!existing.pin || existing.hasSystemAccess === false || !existing.username)) {
            merged.hasSystemAccess = true;
            merged.username = existing.username || base.username;
            merged.pin = existing.pin || base.pin;
          }
          sMap.set(existing.id, merged);
        }
      }
      useRestaurantStore.setState({ staff: Array.from(sMap.values()), staffSeedVersion: 4 });
      broadcastImmediately();
    }
  }, [rawStaff]);

  const { roles } = useRoleStore();
  const systemSettings = useSettingsStore((s) => s.settings);

  const [activeTab, setActiveTab] = useState<'staff' | 'attendance' | 'payroll'>('staff');

  const dynamicFloors = useRestaurantStore((state) => state.floors) || [];
  const availableFloors = sortFloors(
    Array.from(
      new Set([
        ...(dynamicFloors.length > 0 ? dynamicFloors.map((f) => f.name) : zones),
        ...tables.map((t) => getTableFloor(t)),
      ].filter(Boolean))
    )
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [activeRoleFilter, setActiveRoleFilter] = useState<string>('All');
  const [activeAccessFilter, setActiveAccessFilter] = useState<'all' | 'has_access' | 'no_access'>('all');
  const [revealedPins, setRevealedPins] = useState<Record<string, boolean>>({});

  // Staff Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);

  // Staff Form Fields (Detailed Employee Profile)
  const [formHasSystemAccess, setFormHasSystemAccess] = useState<boolean>(false);
  const [formUsername, setFormUsername] = useState('');
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formRole, setFormRole] = useState<string>('Order Taker');
  const [formCustomRoleId, setFormCustomRoleId] = useState<string>('role-waiter');
  const [formShift, setFormShift] = useState<StaffShift>('Morning');
  const [formStatus, setFormStatus] = useState<StaffStatus>('Active');
  const [formPin, setFormPin] = useState('');
  const [formMaxDevices, setFormMaxDevices] = useState<number>(0); // 0 = follow Global Settings default
  const [formAssignedZones, setFormAssignedZones] = useState<string[]>(['Ground Floor']);
  const [formCnic, setFormCnic] = useState('');
  const [formDesignation, setFormDesignation] = useState('');
  const [formJoinedDate, setFormJoinedDate] = useState('');
  const [formMonthlySalary, setFormMonthlySalary] = useState('');
  const [formHourlyRate, setFormHourlyRate] = useState('');
  const [formEmergencyContact, setFormEmergencyContact] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formBankDetails, setFormBankDetails] = useState('');
  const [formError, setFormError] = useState('');

  // Stats
  const totalStaff = staff.length;
  const activeCount = staff.filter((s) => s.status === 'Active').length;
  const onLeaveCount = staff.filter((s) => s.status === 'On Leave').length;
  const waiterCount = staff.filter((s) => s.role === 'Waiter' || s.role === 'Order Taker').length;
  const kitchenCount = staff.filter((s) => s.role === 'Kitchen').length;
  const juiceBarCount = staff.filter((s) => s.role === 'JuiceBar').length;

  const staffHasAccess = (s: StaffMember): boolean => {
    if (s.hasSystemAccess === false) return false;
    return Boolean(s.pin && s.pin.trim().length > 0);
  };

  const withAccessCount = staff.filter(staffHasAccess).length;
  const withoutAccessCount = staff.filter((s) => !staffHasAccess(s)).length;

  // Role list for filters & selection
  const allRoleNames = Array.from(new Set(['All', ...roles.map((r) => r.name).filter(Boolean)]));

  const getStaffCountByRole = (rName: string) => {
    if (rName === 'All') return totalStaff;
    return staff.filter((s) => {
      if (rName.toLowerCase() === 'order taker' || rName.toLowerCase() === 'waiter') {
        return (s.role || '').toLowerCase() === 'waiter' || (s.role || '').toLowerCase() === 'order taker';
      }
      return (s.role || '').toLowerCase() === rName.toLowerCase();
    }).length;
  };

  // Filtered Staff List
  const filteredStaff = staff.filter((s) => {
    const matchesRole =
      activeRoleFilter === 'All' ||
      s.role.toLowerCase() === activeRoleFilter.toLowerCase() ||
      (activeRoleFilter.toLowerCase() === 'order taker' &&
        (s.role.toLowerCase() === 'waiter' || s.role.toLowerCase() === 'order taker'));

    const hasAccess = staffHasAccess(s);
    const matchesAccess =
      activeAccessFilter === 'all' ||
      (activeAccessFilter === 'has_access' && hasAccess) ||
      (activeAccessFilter === 'no_access' && !hasAccess);

    const query = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !query ||
      s.name.toLowerCase().includes(query) ||
      (s.phone && s.phone.toLowerCase().includes(query)) ||
      (s.username && s.username.toLowerCase().includes(query)) ||
      s.role.toLowerCase().includes(query) ||
      (s.role.toLowerCase() === 'waiter' && 'order taker'.includes(query)) ||
      s.shift.toLowerCase().includes(query) ||
      (s.assignedZone && s.assignedZone.toLowerCase().includes(query)) ||
      (s.assignedZones && s.assignedZones.some((z) => z.toLowerCase().includes(query)));

    return matchesRole && matchesAccess && matchesSearch;
  });

  const getRoleColor = (roleStr: string) => {
    const matched = roles.find(
      (r) =>
        r.name.toLowerCase() === (roleStr || '').toLowerCase() ||
        r.id === roleStr ||
        (roleStr === 'Waiter' && r.name === 'Order Taker')
    );
    if (matched && matched.badgeColor) return matched.badgeColor;
    switch (roleStr) {
      case 'Manager':
        return '#B48214';
      case 'Waiter':
      case 'Order Taker':
        return '#2563EB';
      case 'Kitchen':
        return '#DC2626';
      case 'JuiceBar':
        return '#059669';
      case 'Admin':
        return '#52171B';
      default:
        return '#64748B';
    }
  };

  const getShiftIcon = (shift: StaffShift) => {
    switch (shift) {
      case 'Morning':
        return 'sunny-outline';
      case 'Evening':
        return 'partly-sunny-outline';
      case 'Night':
        return 'moon-outline';
      default:
        return 'time-outline';
    }
  };

  const togglePinReveal = (id: string) => {
    setRevealedPins((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Staff Modal Actions
  const openAddModal = () => {
    if (!canAddStaff) {
      Alert.alert('Access Denied', 'You do not have permission to add staff members.');
      return;
    }
    setEditingStaff(null);
    setFormHasSystemAccess(false);
    setFormUsername('');
    setFormName('');
    setFormPhone('');
    const defaultR = roles.find((r) => r.name === 'Order Taker') || roles[0];
    setFormRole(defaultR.name);
    setFormCustomRoleId(defaultR.id);
    setFormShift('Morning');
    setFormStatus('Active');
    setFormPin(Math.floor(1000 + Math.random() * 9000).toString());
    setFormMaxDevices(0);
    setFormAssignedZones(['Ground Floor']);
    setFormCnic('');
    setFormDesignation('');
    setFormJoinedDate(new Date().toISOString().split('T')[0]);
    setFormMonthlySalary('30000');
    setFormHourlyRate('150');
    setFormEmergencyContact('');
    setFormAddress('');
    setFormBankDetails('');
    setFormError('');
    setModalVisible(true);
  };

  const openEditModal = (member: StaffMember) => {
    if (!canEditStaff) {
      Alert.alert('Access Denied', 'You do not have permission to edit staff members.');
      return;
    }
    setEditingStaff(member);
    const hasAccess =
      member.hasSystemAccess !== undefined
        ? member.hasSystemAccess
        : Boolean(member.pin && member.pin.trim().length > 0);
    setFormHasSystemAccess(hasAccess);
    setFormUsername(member.username || '');
    setFormName(member.name);
    setFormPhone(member.phone || '');
    setFormRole(member.role);
    const matchedR = roles.find(
      (r) =>
        r.id === member.customRoleId ||
        r.name.toLowerCase() === member.role.toLowerCase() ||
        (member.role === 'Waiter' && r.name === 'Order Taker')
    );
    setFormCustomRoleId(matchedR ? matchedR.id : member.customRoleId || 'role-waiter');
    setFormShift(member.shift);
    setFormStatus(member.status);
    setFormPin(member.pin && member.pin.trim().length > 0 ? member.pin : Math.floor(1000 + Math.random() * 9000).toString());
    setFormMaxDevices(member.maxConcurrentDevices && member.maxConcurrentDevices > 0 ? member.maxConcurrentDevices : 0);
    const initialZones =
      member.assignedZones && member.assignedZones.length > 0
        ? member.assignedZones
        : member.assignedZone
          ? [member.assignedZone]
          : ['All Floors'];
    setFormAssignedZones(initialZones);
    setFormCnic(member.cnic || '');
    setFormDesignation(member.designation || '');
    setFormJoinedDate(member.joinedDate || '');
    setFormMonthlySalary(member.monthlySalary ? member.monthlySalary.toString() : '');
    setFormHourlyRate(member.hourlyRate ? member.hourlyRate.toString() : '');
    setFormEmergencyContact(member.emergencyContact || '');
    setFormAddress(member.address || '');
    setFormBankDetails(member.bankAccountDetails || '');
    setFormError('');
    setModalVisible(true);
  };

  const handleSaveStaff = () => {
    if (editingStaff ? !canEditStaff : !canAddStaff) {
      Alert.alert(
        'Access Denied',
        editingStaff
          ? 'You do not have permission to edit staff members.'
          : 'You do not have permission to add staff members.'
      );
      return;
    }
    if (!formName.trim()) {
      setFormError('Please enter an employee name');
      return;
    }

    const cleanUsername = formUsername.trim().toLowerCase().replace(/\s+/g, '');
    if (formHasSystemAccess) {
      if (!cleanUsername) {
        setFormError('Please enter a Login ID / Username for system access');
        return;
      }
      const duplicate = (staff || []).find(
        (s) => s.id !== editingStaff?.id && (s.username || '').trim().toLowerCase() === cleanUsername
      );
      if (duplicate) {
        setFormError(`Login ID "${cleanUsername}" is already used by ${duplicate.name}.`);
        return;
      }
      if (!formPin.trim() || formPin.trim().length < 4) {
        setFormError('Password / PIN must be at least 4 digits');
        return;
      }
    }

    const primaryZone = formAssignedZones.includes('All Floors')
      ? 'All Floors'
      : formAssignedZones[0] || 'All Floors';

    const isFloorRole =
      formRole === 'Waiter' || formRole === 'Order Taker' || formRole === 'Floor Manager';

    const staffPayload = {
      hasSystemAccess: formHasSystemAccess,
      username: formHasSystemAccess ? (cleanUsername || undefined) : undefined,
      name: formName.trim(),
      phone: formPhone.trim(),
      role: formRole,
      customRoleId: formCustomRoleId,
      shift: formShift,
      status: formStatus,
      pin: formHasSystemAccess ? formPin.trim() : '',
      assignedZone: isFloorRole ? primaryZone : undefined,
      assignedZones: isFloorRole ? formAssignedZones : undefined,
      cnic: formCnic.trim() || undefined,
      designation: formDesignation.trim() || undefined,
      joinedDate: formJoinedDate.trim() || new Date().toISOString().split('T')[0],
      monthlySalary: parseFloat(formMonthlySalary) || undefined,
      hourlyRate: parseFloat(formHourlyRate) || undefined,
      emergencyContact: formEmergencyContact.trim() || undefined,
      address: formAddress.trim() || undefined,
      bankAccountDetails: formBankDetails.trim() || undefined,
      maxConcurrentDevices: formHasSystemAccess && formMaxDevices > 0 ? formMaxDevices : undefined,
    };

    if (editingStaff) {
      updateStaff(editingStaff.id, staffPayload);
    } else {
      addStaff({
        ...staffPayload,
        joinedDate: formJoinedDate.trim() || new Date().toISOString().split('T')[0],
      });
    }

    broadcastImmediately();
    setModalVisible(false);
  };

  const handleDeleteStaff = (member: StaffMember) => {
    if (!canDeleteStaff) {
      Alert.alert('Access Denied', 'You do not have permission to delete staff members.');
      return;
    }
    const confirmMessage = `Are you sure you want to remove "${member.name}" (${member.role})?`;
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(confirmMessage)) {
        deleteStaff(member.id);
      }
    } else {
      Alert.alert('Remove Employee', confirmMessage, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteStaff(member.id) },
      ]);
    }
  };

  if (role !== 'admin' && !can('canAccessStaff')) {
    return (
      <PermissionDeniedScreen
        moduleName="Staff & HR Management"
        urduModuleName="Staff & HR Management"
        requiredPermission="canAccessStaff"
        backRoute={backRoute}
      />
    );
  }

  return (
    <View style={styles.container}>
      {/* 1. Executive Command Header Card */}
      <View style={[styles.headerCard, isMobile && styles.headerCardMobile]}>
        <View style={styles.headerLeft}>
          <View style={styles.headerLogoCapsule}>
            <SultanLogo size="xs" variant="circle" />
          </View>
          <View style={{ flexShrink: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Text style={[styles.headerTitle, isMobile && { fontSize: 17 }]}>
                Staff & HR Management
              </Text>
              <View style={styles.statusBadge}>
                <View style={styles.headerStatusDot} />
                <Text style={styles.statusBadgeText}>
                  {activeCount} ACTIVE / {totalStaff} TOTAL
                </Text>
              </View>
            </View>
            {Boolean(!isMobile) && (
              <Text style={styles.headerSubtitle}>
                Manage employee directory, floor assignments, daily attendance & monthly payroll
              </Text>
            )}
          </View>
        </View>

        <View style={styles.headerRight}>
          {canAddStaff && (
            <TouchableOpacity style={styles.addButton} onPress={openAddModal} activeOpacity={0.8}>
              <Ionicons name="person-add" size={16} color="#FFFFFF" />
              <Text style={styles.addButtonText}>{isMobile ? 'Add' : 'Add Employee'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* 2. Top Segmented Sub-Tab Switcher */}
      <View style={styles.viewTabContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.viewTabScrollContent}
        >
          <TouchableOpacity
            style={[styles.viewTabBtn, activeTab === 'staff' && styles.viewTabBtnActive]}
            onPress={() => setActiveTab('staff')}
            activeOpacity={0.75}
          >
            <Ionicons
              name="people"
              size={16}
              color={activeTab === 'staff' ? '#140306' : BRAND.burgundy}
            />
            <Text style={[styles.viewTabText, activeTab === 'staff' && styles.viewTabTextActive]}>
              Staff Directory ({totalStaff})
            </Text>
          </TouchableOpacity>

          {systemSettings.enableAttendanceTracking !== false && (
            <TouchableOpacity
              style={[styles.viewTabBtn, activeTab === 'attendance' && styles.viewTabBtnActive]}
              onPress={() => setActiveTab('attendance')}
              activeOpacity={0.75}
            >
              <Ionicons
                name="calendar"
                size={16}
                color={activeTab === 'attendance' ? '#140306' : BRAND.burgundy}
              />
              <Text style={[styles.viewTabText, activeTab === 'attendance' && styles.viewTabTextActive]}>
                Daily Attendance
              </Text>
            </TouchableOpacity>
          )}

          {systemSettings.enablePayrollModule !== false && (
            <TouchableOpacity
              style={[styles.viewTabBtn, activeTab === 'payroll' && styles.viewTabBtnActive]}
              onPress={() => setActiveTab('payroll')}
              activeOpacity={0.75}
            >
              <Ionicons
                name="cash"
                size={16}
                color={activeTab === 'payroll' ? '#140306' : BRAND.burgundy}
              />
              <Text style={[styles.viewTabText, activeTab === 'payroll' && styles.viewTabTextActive]}>
                Salary & Payroll
              </Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>

      <ScrollView style={[styles.content, isMobile && { padding: 14 }]} showsVerticalScrollIndicator={false}>
        {/* ========================================================================= */}
        {/* TAB 1: STAFF DIRECTORY */}
        {/* ========================================================================= */}
        {activeTab === 'staff' && (
          <>
            {/* KPI Summary Cards */}
            <View style={styles.kpiContainer}>
              <View style={[styles.kpiCard, isMobile && styles.kpiCardMobile]}>
                <View style={[styles.kpiIconWrapper, { backgroundColor: '#EBF3FF' }]}>
                  <Ionicons name="people" size={20} color="#007AFF" />
                </View>
                <View>
                  <Text style={styles.kpiValue}>{totalStaff}</Text>
                  <Text style={styles.kpiLabel}>Total Staff</Text>
                </View>
              </View>

              <View style={[styles.kpiCard, isMobile && styles.kpiCardMobile]}>
                <View style={[styles.kpiIconWrapper, { backgroundColor: '#E8F9EE' }]}>
                  <Ionicons name="checkmark-circle" size={20} color="#34C759" />
                </View>
                <View>
                  <Text style={styles.kpiValue}>{activeCount}</Text>
                  <Text style={styles.kpiLabel}>Active Duty</Text>
                </View>
              </View>

              <View style={[styles.kpiCard, isMobile && styles.kpiCardMobile]}>
                <View style={[styles.kpiIconWrapper, { backgroundColor: '#FFF4E5' }]}>
                  <Ionicons name="time" size={20} color="#FF9500" />
                </View>
                <View>
                  <Text style={styles.kpiValue}>{onLeaveCount}</Text>
                  <Text style={styles.kpiLabel}>On Leave</Text>
                </View>
              </View>

              <TouchableOpacity
                style={[
                  styles.kpiCard,
                  isMobile && styles.kpiCardMobile,
                  activeAccessFilter === 'has_access' && { borderColor: '#10B981', backgroundColor: '#ECFDF5' },
                ]}
                onPress={() =>
                  setActiveAccessFilter((prev) => (prev === 'has_access' ? 'all' : 'has_access'))
                }
              >
                <View style={[styles.kpiIconWrapper, { backgroundColor: '#ECFDF5' }]}>
                  <Ionicons name="key" size={20} color="#10B981" />
                </View>
                <View>
                  <Text style={styles.kpiValue}>{withAccessCount}</Text>
                  <Text style={styles.kpiLabel}>With System Access</Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* Search & Filters */}
            <View style={styles.filterSection}>
              <View style={styles.searchBar}>
                <View style={styles.searchIconOrb}>
                  <Ionicons name="search" size={15} color={BRAND.burgundy} />
                </View>
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search employee name, role, floor, phone..."
                  placeholderTextColor="#8A7A70"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
                {Boolean(searchQuery.length > 0) ? (
                  <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.searchClearBtn}>
                    <Ionicons name="close-circle" size={18} color={BRAND.gold} />
                  </TouchableOpacity>
                ) : (
                  <View style={styles.searchShortcutBadge}>
                    <Ionicons name="sparkles" size={10} color="#B45309" style={{ marginRight: 3 }} />
                    <Text style={styles.searchShortcutText}>STAFF</Text>
                  </View>
                )}
              </View>

              {/* System Access Filter Bar */}
              <View style={styles.accessFilterRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="shield-checkmark-outline" size={15} color={BRAND.burgundy} />
                  <Text style={styles.accessFilterLabel}>SYSTEM ACCESS:</Text>
                </View>

                <View style={styles.accessPillsGroup}>
                  <TouchableOpacity
                    style={[
                      styles.accessPill,
                      activeAccessFilter === 'all' && styles.accessPillActive,
                    ]}
                    onPress={() => setActiveAccessFilter('all')}
                  >
                    <Text
                      style={[
                        styles.accessPillText,
                        activeAccessFilter === 'all' && styles.accessPillTextActive,
                      ]}
                    >
                      All ({totalStaff})
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.accessPill,
                      styles.accessPillWithAccess,
                      activeAccessFilter === 'has_access' && styles.accessPillWithAccessActive,
                    ]}
                    onPress={() => setActiveAccessFilter('has_access')}
                  >
                    <Ionicons
                      name="key"
                      size={13}
                      color={activeAccessFilter === 'has_access' ? '#FFFFFF' : '#15803D'}
                    />
                    <Text
                      style={[
                        styles.accessPillText,
                        {
                          color: activeAccessFilter === 'has_access' ? '#FFFFFF' : '#15803D',
                          fontWeight: activeAccessFilter === 'has_access' ? '800' : '700',
                        },
                      ]}
                    >
                      Has Access ({withAccessCount})
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.accessPill,
                      styles.accessPillNoAccess,
                      activeAccessFilter === 'no_access' && styles.accessPillNoAccessActive,
                    ]}
                    onPress={() => setActiveAccessFilter('no_access')}
                  >
                    <Ionicons
                      name="lock-closed"
                      size={13}
                      color={activeAccessFilter === 'no_access' ? '#FFFFFF' : '#64748B'}
                    />
                    <Text
                      style={[
                        styles.accessPillText,
                        {
                          color: activeAccessFilter === 'no_access' ? '#FFFFFF' : '#64748B',
                          fontWeight: activeAccessFilter === 'no_access' ? '800' : '700',
                        },
                      ]}
                    >
                      No Access ({withoutAccessCount})
                    </Text>
                  </TouchableOpacity>
                </View>

                {activeAccessFilter !== 'all' && (
                  <TouchableOpacity
                    style={styles.clearFilterBtn}
                    onPress={() => setActiveAccessFilter('all')}
                  >
                    <Ionicons name="close-circle" size={14} color="#DC2626" />
                    <Text style={styles.clearFilterText}>Reset Access</Text>
                  </TouchableOpacity>
                )}
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.roleTabs}>
                {allRoleNames.filter(Boolean).map((rName) => (
                  <TouchableOpacity
                    key={rName}
                    style={[styles.roleTab, activeRoleFilter === rName && styles.roleTabActive]}
                    onPress={() => setActiveRoleFilter(rName)}
                  >
                    <Text
                      style={[
                        styles.roleTabText,
                        activeRoleFilter === rName && styles.roleTabTextActive,
                      ]}
                    >
                      {formatRoleName(rName)} ({getStaffCountByRole(rName)})
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Staff Presentation: Mobile Cards vs Desktop Table */}
            {isMobile ? (
              <View style={styles.mobileListContainer}>
                {filteredStaff.map((member) => {
                  const isPinRevealed = !!revealedPins[member.id];
                  const color = getRoleColor(member.role);
                  return (
                    <View key={member.id} style={styles.mobileCard}>
                      <View style={styles.mobileCardHeader}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                          <View style={[styles.avatarBox, { backgroundColor: color + '18' }]}>
                            <Text style={[styles.avatarText, { color: color }]}>
                              {member.name ? member.name.charAt(0).toUpperCase() : '?'}
                            </Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.staffName}>{member.name || 'Staff'}</Text>
                            <Text style={styles.staffPhone}>
                              {member.designation ? `${member.designation} • ` : ''}{member.phone || 'No phone'}
                            </Text>
                          </View>
                        </View>
                        <View style={[styles.roleBadge, { backgroundColor: color + '15' }]}>
                          <Text style={[styles.roleBadgeText, { color: color }]}>
                            {formatRoleName(member.role)}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.mobileCardDetails}>
                        {Boolean(member.cnic) && (
                          <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>CNIC ID:</Text>
                            <Text style={styles.detailValue}>{member.cnic}</Text>
                          </View>
                        )}
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Monthly Salary:</Text>
                          <Text style={[styles.detailValue, { fontWeight: '700', color: BRAND.burgundy }]}>
                            {canViewSensitiveSalaries
                              ? (typeof member.monthlySalary === 'number' ? `Rs. ${member.monthlySalary.toLocaleString()}` : 'Rs. 0')
                              : '••••••'}
                          </Text>
                        </View>
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Assigned Floor:</Text>
                          <Text style={styles.detailValue}>
                            {member.assignedZones && member.assignedZones.length > 0
                              ? member.assignedZones.join(', ')
                              : member.assignedZone || 'All Floors'}
                          </Text>
                        </View>
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Shift:</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Ionicons name={getShiftIcon(member.shift)} size={14} color="#666" />
                            <Text style={styles.detailValue}>{member.shift}</Text>
                          </View>
                        </View>
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Status:</Text>
                          <Text
                            style={[
                              styles.detailValue,
                              { color: member.status === 'Active' ? '#34C759' : '#FF9500' },
                            ]}
                          >
                            {member.status}
                          </Text>
                        </View>
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>System Access:</Text>
                          {member.hasSystemAccess === false || !member.pin ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F1F5F9', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                              <Ionicons name="lock-closed-outline" size={12} color="#64748B" />
                              <Text style={{ fontSize: 11, fontWeight: '700', color: '#64748B' }}>No System Access</Text>
                            </View>
                          ) : (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              {Boolean(member.username) && (
                                <Text style={{ fontSize: 11, fontWeight: '700', color: BRAND.burgundy }}>
                                  ID: {member.username} •
                                </Text>
                              )}
                              <Text style={styles.pinCodeText}>
                                {isPinRevealed ? member.pin : '••••'}
                              </Text>
                              <TouchableOpacity onPress={() => togglePinReveal(member.id)}>
                                <Ionicons
                                  name={isPinRevealed ? 'eye-off-outline' : 'eye-outline'}
                                  size={16}
                                  color="#007AFF"
                                />
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>
                      </View>

                      <View style={styles.mobileCardActions}>
                        {systemSettings.enablePayrollModule !== false && (
                          <TouchableOpacity
                            style={[styles.mobileActionBtn, { backgroundColor: '#F3E8FF' }]}
                            onPress={() => setActiveTab('payroll')}
                          >
                            <Ionicons name="card-outline" size={17} color="#7C3AED" />
                            <Text style={[styles.mobileActionText, { color: '#7C3AED' }]}>Payroll</Text>
                          </TouchableOpacity>
                        )}
                        {canEditStaff && (
                          <TouchableOpacity
                            style={styles.mobileActionBtn}
                            onPress={() => openEditModal(member)}
                          >
                            <Ionicons name="create-outline" size={17} color="#007AFF" />
                            <Text style={[styles.mobileActionText, { color: '#007AFF' }]}>Edit</Text>
                          </TouchableOpacity>
                        )}
                        {canDeleteStaff && (
                          <TouchableOpacity
                            style={styles.mobileActionBtn}
                            onPress={() => handleDeleteStaff(member)}
                          >
                            <Ionicons name="trash-outline" size={17} color="#FF3B30" />
                            <Text style={[styles.mobileActionText, { color: '#FF3B30' }]}>Remove</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : (
              /* Desktop Table View */
              <View style={styles.tableContainer}>
                <View style={styles.tableHeader}>
                  <Text style={[styles.thText, { flex: 2.2 }]}>EMPLOYEE & DESIGNATION</Text>
                  <Text style={[styles.thText, { flex: 1.4 }]}>ROLE</Text>
                  <Text style={[styles.thText, { flex: 1.8 }]}>FLOOR / SHIFT</Text>
                  <Text style={[styles.thText, { flex: 1.5 }]}>BASE SALARY</Text>
                  <Text style={[styles.thText, { flex: 1.1 }]}>STATUS</Text>
                  <Text style={[styles.thText, { flex: 1.4 }]}>SYSTEM ACCESS / PIN</Text>
                  <Text style={[styles.thText, { flex: 1.4, textAlign: 'right' }]}>ACTIONS</Text>
                </View>

                {filteredStaff.map((member) => {
                  const isPinRevealed = !!revealedPins[member.id];
                  const color = getRoleColor(member.role);
                  return (
                    <View key={member.id} style={styles.tableRow}>
                      <View style={[styles.tableCell, { flex: 2.2, flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
                        <View style={[styles.avatarBox, { backgroundColor: color + '18' }]}>
                          <Text style={[styles.avatarText, { color: color }]}>
                            {member.name ? member.name.charAt(0).toUpperCase() : '?'}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.staffName}>{member.name || 'Staff'}</Text>
                          <Text style={styles.staffPhone}>
                            {member.designation ? `${member.designation} • ` : ''}{member.phone || 'No phone'}
                          </Text>
                          {Boolean(member.cnic) && (
                            <Text style={{ fontSize: 11, color: '#8E8E93', marginTop: 1 }}>
                              CNIC: {member.cnic}
                            </Text>
                          )}
                        </View>
                      </View>

                      <View style={[styles.tableCell, { flex: 1.4 }]}>
                        <View style={[styles.roleBadge, { backgroundColor: color + '15' }]}>
                          <Text style={[styles.roleBadgeText, { color: color }]}>
                            {formatRoleName(member.role)}
                          </Text>
                        </View>
                      </View>

                      <View style={[styles.tableCell, { flex: 1.8 }]}>
                        <Text style={styles.zoneText} numberOfLines={1}>
                          {member.assignedZones && member.assignedZones.length > 0
                            ? member.assignedZones.join(', ')
                            : member.assignedZone || 'All Floors'}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                          <Ionicons name={getShiftIcon(member.shift)} size={13} color="#666" />
                          <Text style={{ fontSize: 12, color: '#666' }}>{member.shift}</Text>
                        </View>
                      </View>

                      <View style={[styles.tableCell, { flex: 1.5 }]}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: BRAND.burgundy }}>
                          {canViewSensitiveSalaries
                            ? (typeof member.monthlySalary === 'number' ? `Rs. ${member.monthlySalary.toLocaleString()}` : 'Rs. 0')
                            : '••••••'}
                        </Text>
                        {canViewSensitiveSalaries && Boolean(member.hourlyRate) && (
                          <Text style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
                            OT: Rs. {member.hourlyRate}/hr
                          </Text>
                        )}
                      </View>

                      <View style={[styles.tableCell, { flex: 1.1, flexDirection: 'row', alignItems: 'center' }]}>
                        <View
                          style={[
                            styles.statusDot,
                            { backgroundColor: member.status === 'Active' ? '#34C759' : '#FF9500' },
                          ]}
                        />
                        <Text style={styles.statusText}>{member.status}</Text>
                      </View>

                      <View style={[styles.tableCell, { flex: 1.4 }]}>
                        {member.hasSystemAccess === false || !member.pin ? (
                          <View
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              alignSelf: 'flex-start',
                              gap: 4,
                              backgroundColor: '#F1F5F9',
                              paddingHorizontal: 8,
                              paddingVertical: 4,
                              borderRadius: 6,
                              borderWidth: 1,
                              borderColor: '#E2E8F0',
                            }}
                          >
                            <Ionicons name="lock-closed-outline" size={12} color="#64748B" />
                            <Text style={{ fontSize: 11, fontWeight: '700', color: '#64748B' }}>
                              No Access
                            </Text>
                          </View>
                        ) : (
                          <View>
                            {Boolean(member.username) && (
                              <Text style={{ fontSize: 10.5, fontWeight: '700', color: BRAND.burgundy, marginBottom: 2 }}>
                                ID: {member.username}
                              </Text>
                            )}
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <Text style={styles.pinCodeText}>{isPinRevealed ? member.pin : '••••'}</Text>
                              <TouchableOpacity onPress={() => togglePinReveal(member.id)}>
                                <Ionicons
                                  name={isPinRevealed ? 'eye-off-outline' : 'eye-outline'}
                                  size={17}
                                  color="#007AFF"
                                />
                              </TouchableOpacity>
                            </View>
                          </View>
                        )}
                      </View>

                      <View style={[styles.tableCell, { flex: 1.4, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8 }]}>
                        {systemSettings.enablePayrollModule !== false && (
                          <TouchableOpacity
                            style={[styles.actionBtn, { backgroundColor: '#F3E8FF' }]}
                            onPress={() => setActiveTab('payroll')}
                          >
                            <Ionicons name="card-outline" size={17} color="#7C3AED" />
                          </TouchableOpacity>
                        )}
                        {canEditStaff && (
                          <TouchableOpacity style={styles.actionBtn} onPress={() => openEditModal(member)}>
                            <Ionicons name="create-outline" size={19} color="#007AFF" />
                          </TouchableOpacity>
                        )}
                        {canDeleteStaff && (
                          <TouchableOpacity style={styles.actionBtn} onPress={() => handleDeleteStaff(member)}>
                            <Ionicons name="trash-outline" size={19} color="#FF3B30" />
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  );
                })}

                {Boolean(filteredStaff.length === 0) && (
                  <View style={styles.emptyContainer}>
                    <Ionicons name="search-outline" size={42} color="#C7C7CC" />
                    <Text style={styles.emptyTitle}>No staff members found</Text>
                    <Text style={styles.emptySubtitle}>Try adjusting your search query or role filter.</Text>
                  </View>
                )}
              </View>
            )}
          </>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: DAILY ATTENDANCE REGISTER */}
        {/* ========================================================================= */}
        {activeTab === 'attendance' && systemSettings.enableAttendanceTracking !== false && (
          <AttendanceTab />
        )}

        {/* ========================================================================= */}
        {/* TAB 3: SALARY & PAYROLL REGISTER */}
        {/* ========================================================================= */}
        {activeTab === 'payroll' && systemSettings.enablePayrollModule !== false && (
          <PayrollTab canViewSalaries={canViewSensitiveSalaries} />
        )}

        <View style={{ height: 60 }} />
      </ScrollView>

      {/* ========================================================================= */}
      {/* MODAL 1: ADD / EDIT EMPLOYEE */}
      {/* ========================================================================= */}
      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, isMobile && { padding: 18, maxHeight: '92%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={styles.modalIconBox}>
                  <Ionicons name={editingStaff ? 'create' : 'person-add'} size={20} color={BRAND.burgundy} />
                </View>
                <Text style={styles.modalTitle}>{editingStaff ? 'Edit Staff Member' : 'Add New Employee'}</Text>
              </View>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color="#8E8E93" />
              </TouchableOpacity>
            </View>

            {Boolean(formError.trim().length > 0) && (
              <View style={styles.errorAlert}>
                <Ionicons name="alert-circle" size={18} color="#FF3B30" />
                <Text style={styles.errorAlertText}>{formError}</Text>
              </View>
            )}

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 460 }}>
              {/* Full Name */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Full Name *</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="e.g. Fateh Sher / Zulfiqar / Sweeper"
                  placeholderTextColor="#A0A0A5"
                  value={formName}
                  onChangeText={(val) => {
                    setFormName(val);
                    if (formError) setFormError('');
                  }}
                />
              </View>

              {/* Job Title / Designation & Phone */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                <View style={[styles.formGroup, { flex: 1, minWidth: 150 }]}>
                  <Text style={styles.formLabel}>Job Title / Designation</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="e.g. Head Chef / Waiter / Sweeper"
                    placeholderTextColor="#A0A0A5"
                    value={formDesignation}
                    onChangeText={setFormDesignation}
                  />
                </View>
                <View style={[styles.formGroup, { flex: 1, minWidth: 150 }]}>
                  <Text style={styles.formLabel}>Phone Number</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="e.g. +92 300 1234567"
                    placeholderTextColor="#A0A0A5"
                    value={formPhone}
                    onChangeText={setFormPhone}
                    keyboardType="phone-pad"
                  />
                </View>
              </View>

              {/* System Login Access Toggle (Yes / No) */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>
                  System Access (Allow this employee to log in to the system?) *
                </Text>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                  <TouchableOpacity
                    style={[
                      styles.formPill,
                      {
                        flex: 1,
                        paddingVertical: 11,
                        justifyContent: 'center',
                        borderWidth: 1.5,
                      },
                      formHasSystemAccess
                        ? { backgroundColor: '#10B981', borderColor: '#059669' }
                        : { backgroundColor: '#F8FAFC', borderColor: '#CBD5E1' },
                    ]}
                    onPress={() => {
                      setFormHasSystemAccess(true);
                      if (!formPin || formPin.trim().length < 4) {
                        setFormPin(Math.floor(1000 + Math.random() * 9000).toString());
                      }
                      if (formError) setFormError('');
                    }}
                  >
                    <Ionicons
                      name={formHasSystemAccess ? 'checkmark-circle' : 'key-outline'}
                      size={16}
                      color={formHasSystemAccess ? '#FFFFFF' : '#475569'}
                      style={{ marginRight: 6 }}
                    />
                    <Text
                      style={[
                        styles.formPillText,
                        { fontWeight: '800' },
                        formHasSystemAccess ? { color: '#FFFFFF' } : { color: '#475569' },
                      ]}
                    >
                      Yes (Grant System Access)
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.formPill,
                      {
                        flex: 1,
                        paddingVertical: 11,
                        justifyContent: 'center',
                        borderWidth: 1.5,
                      },
                      !formHasSystemAccess
                        ? { backgroundColor: BRAND.burgundy, borderColor: BRAND.burgundy }
                        : { backgroundColor: '#F8FAFC', borderColor: '#CBD5E1' },
                    ]}
                    onPress={() => {
                      setFormHasSystemAccess(false);
                      if (formError) setFormError('');
                    }}
                  >
                    <Ionicons
                      name={!formHasSystemAccess ? 'lock-closed' : 'lock-closed-outline'}
                      size={16}
                      color={!formHasSystemAccess ? '#FFFFFF' : '#475569'}
                      style={{ marginRight: 6 }}
                    />
                    <Text
                      style={[
                        styles.formPillText,
                        { fontWeight: '800' },
                        !formHasSystemAccess ? { color: '#FFFFFF' } : { color: '#475569' },
                      ]}
                    >
                      No (Staff Record Only)
                    </Text>
                  </TouchableOpacity>
                </View>
                {!formHasSystemAccess && (
                  <Text style={{ fontSize: 11.5, color: '#64748B', marginTop: 6 }}>
                    This employee will not be able to log in to the system (e.g. Sweeper, Dishwasher, Helper) — included only in staff directory, attendance, and payroll records.
                  </Text>
                )}
              </View>

              {/* System Login Credentials (Shown ONLY when System Access = Yes) */}
              {formHasSystemAccess && (
                <View
                  style={{
                    backgroundColor: '#F0FDF4',
                    borderWidth: 1.5,
                    borderColor: '#86EFAC',
                    borderRadius: 12,
                    padding: 12,
                    marginBottom: 14,
                  }}
                >
                  {/* Unique Login ID / Username */}
                  <View style={styles.formGroup}>
                    <Text style={[styles.formLabel, { color: '#065F46' }]}>
                      Login ID / Username (Unique Login ID) *
                    </Text>
                    <TextInput
                      style={[styles.formInput, { backgroundColor: '#FFFFFF', borderColor: '#6EE7B7' }]}
                      placeholder="e.g. ordertaker1, cashier1, shakeel, master"
                      placeholderTextColor="#A0A0A5"
                      autoCapitalize="none"
                      autoCorrect={false}
                      value={formUsername}
                      onChangeText={(val) => {
                        setFormUsername(val);
                        if (formError) setFormError('');
                      }}
                    />
                  </View>

                  {/* 4-Digit Secret PIN / Password */}
                  <View style={[styles.formGroup, { marginBottom: 4 }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <Text style={[styles.formLabel, { color: '#065F46', marginBottom: 0 }]}>
                        Password / 4-Digit Login PIN *
                      </Text>
                      <TouchableOpacity
                        onPress={() => setFormPin(Math.floor(1000 + Math.random() * 9000).toString())}
                      >
                        <Text style={{ fontSize: 11, color: '#059669', fontWeight: '800' }}>
                          Auto Generate
                        </Text>
                      </TouchableOpacity>
                    </View>
                    <TextInput
                      style={[
                        styles.formInput,
                        {
                          backgroundColor: '#FFFFFF',
                          borderColor: '#6EE7B7',
                          letterSpacing: 3,
                          fontWeight: '800',
                          fontSize: 16,
                        },
                      ]}
                      placeholder="e.g. 1234"
                      placeholderTextColor="#A0A0A5"
                      value={formPin}
                      onChangeText={(val) => {
                        setFormPin(val);
                        if (formError) setFormError('');
                      }}
                      keyboardType="numeric"
                      maxLength={6}
                    />
                  </View>
                </View>
              )}

              {/* Dynamic Role / Department Selection (Built-in + Custom Roles) */}
              <View style={styles.formGroup}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <Text style={styles.formLabel}>
                    {formHasSystemAccess ? 'Assigned System Role *' : 'Department / Role Category'}
                  </Text>
                  {role === 'admin' && (
                    <TouchableOpacity
                      onPress={() => {
                        setModalVisible(false);
                        router.push('/admin/settings' as any);
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '700', color: BRAND.burgundy }}>
                        Manage Roles in Settings
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                <View style={styles.pillsRow}>
                  {roles.map((r) => {
                    const isSelected = formCustomRoleId === r.id || formRole.toLowerCase() === r.name.toLowerCase();
                    return (
                      <TouchableOpacity
                        key={r.id}
                        style={[
                          styles.formPill,
                          isSelected && {
                            backgroundColor: r.badgeColor,
                            borderColor: r.badgeColor,
                          },
                        ]}
                        onPress={() => {
                          setFormRole(r.name);
                          setFormCustomRoleId(r.id);
                        }}
                      >
                        <Text style={[styles.formPillText, isSelected && styles.formPillTextActive]}>
                          {formatRoleName(r.name)}
                          {!r.permissions?.canViewRevenue ? ' (Restricted)' : ''}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Concurrent Device Limit (Shown ONLY when System Access = Yes) */}
              {formHasSystemAccess && (
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Max Concurrent Devices (Session limit for this account)</Text>
                  <Text style={{ fontSize: 11, color: '#64748B', marginBottom: 6 }}>
                    This limit applies only to this staff account — other accounts and master admin remain independent.
                  </Text>
                  <View style={styles.pillsRow}>
                    {[
                      { val: 0, label: 'Global Default' },
                      { val: 1, label: '1 Device' },
                      { val: 2, label: '2 Devices' },
                      { val: 3, label: '3 Devices' },
                      { val: 5, label: '5 Devices' },
                      { val: 999, label: 'Unlimited Devices' },
                    ].map((opt) => {
                      const isSelected = formMaxDevices === opt.val;
                      return (
                        <TouchableOpacity
                          key={opt.val}
                          style={[
                            styles.formPill,
                            isSelected && {
                              backgroundColor: BRAND.burgundy,
                              borderColor: BRAND.burgundy,
                            },
                          ]}
                          onPress={() => setFormMaxDevices(opt.val)}
                        >
                          <Text style={[styles.formPillText, isSelected && styles.formPillTextActive]}>
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* Floor / Zone Assignment for Order Takers */}
              {Boolean(formRole === 'Waiter' || formRole === 'Order Taker') && (
                <View style={[styles.formGroup, styles.floorAssignmentBox]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="business" size={16} color="#007AFF" />
                      <Text style={styles.formLabelHighlighted}>Assigned Floor / Zone *</Text>
                    </View>
                    <View style={styles.floorAccessBadge}>
                      <Text style={styles.floorAccessBadgeText}>Order Taker Access</Text>
                    </View>
                  </View>
                  <Text style={styles.formSubLabel}>
                    This employee will ONLY see and take orders for dining tables belonging to their assigned floor.
                  </Text>

                  <View style={styles.floorChipsWrap}>
                    <TouchableOpacity
                      style={[
                        styles.floorChip,
                        formAssignedZones.includes('All Floors') && styles.floorChipActiveAll,
                      ]}
                      onPress={() => setFormAssignedZones(['All Floors'])}
                    >
                      <Ionicons
                        name="grid-outline"
                        size={14}
                        color={formAssignedZones.includes('All Floors') ? '#fff' : '#4a121a'}
                      />
                      <Text
                        style={[
                          styles.floorChipText,
                          formAssignedZones.includes('All Floors') && styles.floorChipTextActive,
                        ]}
                      >
                        All Floors (Full Access)
                      </Text>
                    </TouchableOpacity>

                    {availableFloors.map((fl) => {
                      const isChecked = formAssignedZones.includes(fl);
                      return (
                        <TouchableOpacity
                          key={fl}
                          style={[styles.floorChip, isChecked && styles.floorChipActive]}
                          onPress={() => {
                            if (formAssignedZones.includes('All Floors')) {
                              setFormAssignedZones([fl]);
                            } else if (isChecked) {
                              const remaining = formAssignedZones.filter((z) => z !== fl);
                              setFormAssignedZones(remaining.length > 0 ? remaining : ['Ground Floor']);
                            } else {
                              setFormAssignedZones([...formAssignedZones, fl]);
                            }
                          }}
                        >
                          <Ionicons
                            name={isChecked ? 'checkmark-circle' : 'business-outline'}
                            size={14}
                            color={isChecked ? '#fff' : '#666'}
                          />
                          <Text style={[styles.floorChipText, isChecked && styles.floorChipTextActive]}>
                            {fl}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* Shift Selection */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Work Shift</Text>
                <View style={styles.pillsRow}>
                  {SHIFTS.map((s) => (
                    <TouchableOpacity
                      key={s}
                      style={[styles.formPill, formShift === s && styles.formPillActive]}
                      onPress={() => setFormShift(s)}
                    >
                      <Ionicons
                        name={getShiftIcon(s)}
                        size={14}
                        color={formShift === s ? '#fff' : '#666'}
                        style={{ marginRight: 4 }}
                      />
                      <Text style={[styles.formPillText, formShift === s && styles.formPillTextActive]}>
                        {s}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Employment Status */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Status</Text>
                <View style={styles.pillsRow}>
                  {STATUSES.map((st) => (
                    <TouchableOpacity
                      key={st}
                      style={[styles.formPill, formStatus === st && styles.formPillActive]}
                      onPress={() => setFormStatus(st)}
                    >
                      <Text style={[styles.formPillText, formStatus === st && styles.formPillTextActive]}>
                        {st}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* CNIC */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>CNIC / National ID</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="e.g. 35201-1234567-1"
                  placeholderTextColor="#A0A0A5"
                  value={formCnic}
                  onChangeText={setFormCnic}
                />
              </View>

              {/* Salary & Overtime Rate */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                <View style={[styles.formGroup, { flex: 1, minWidth: 150 }]}>
                  <Text style={styles.formLabel}>Monthly Base Salary (PKR) *</Text>
                  <TextInput
                    style={[styles.formInput, { color: '#059669', fontWeight: '800' }]}
                    placeholder="e.g. 35000"
                    placeholderTextColor="#A0A0A5"
                    keyboardType="numeric"
                    value={formMonthlySalary}
                    onChangeText={setFormMonthlySalary}
                  />
                </View>
                <View style={[styles.formGroup, { flex: 1, minWidth: 150 }]}>
                  <Text style={styles.formLabel}>Overtime Hourly Rate (PKR)</Text>
                  <TextInput
                    style={[styles.formInput, { color: '#B48214', fontWeight: '800' }]}
                    placeholder="e.g. 200"
                    placeholderTextColor="#A0A0A5"
                    keyboardType="numeric"
                    value={formHourlyRate}
                    onChangeText={setFormHourlyRate}
                  />
                </View>
              </View>

              {/* Joining Date & Emergency Contact */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                <View style={[styles.formGroup, { flex: 1, minWidth: 150 }]}>
                  <Text style={styles.formLabel}>Joining Date</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#A0A0A5"
                    value={formJoinedDate}
                    onChangeText={setFormJoinedDate}
                  />
                </View>
                <View style={[styles.formGroup, { flex: 1, minWidth: 150 }]}>
                  <Text style={styles.formLabel}>Emergency Contact</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="+92 300 0000000"
                    placeholderTextColor="#A0A0A5"
                    value={formEmergencyContact}
                    onChangeText={setFormEmergencyContact}
                  />
                </View>
              </View>

              {/* Bank & Payment Details */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Bank Account / JazzCash / EasyPaisa Details</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="e.g. Meezan Bank PK36MEZN... or JazzCash 0300..."
                  placeholderTextColor="#A0A0A5"
                  value={formBankDetails}
                  onChangeText={setFormBankDetails}
                />
              </View>

              {/* Address */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Home Address</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="e.g. House 12, Street 4, Gulberg, Lahore"
                  placeholderTextColor="#A0A0A5"
                  value={formAddress}
                  onChangeText={setFormAddress}
                />
              </View>
            </ScrollView>

            {/* Modal Actions */}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={handleSaveStaff}>
                <Text style={styles.modalSaveText}>{editingStaff ? 'Save Changes' : 'Add Employee'}</Text>
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
    backgroundColor: '#FAF6EE',
  },
  headerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 10,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(212, 175, 55, 0.32)',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
    alignItems: 'center',
    ...Platform.select({
      web: {
        boxShadow: '0 8px 24px rgba(82, 20, 28, 0.06)',
      } as any,
    }),
    elevation: 2,
  },
  headerCardMobile: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginHorizontal: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 220,
  },
  headerLogoCapsule: {
    padding: 5,
    borderRadius: 10,
    backgroundColor: 'rgba(82, 20, 28, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.30)',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#1C1917',
    letterSpacing: -0.2,
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#78716C',
    marginTop: 3,
    fontWeight: '500',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  headerStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
    color: '#065F46',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: BRAND.burgundy,
    paddingHorizontal: 15,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.45)',
    shadowColor: BRAND.burgundy,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '800',
  },
  viewTabContainer: {
    marginHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E7E0D3',
  },
  viewTabScrollContent: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    alignItems: 'center',
  },
  viewTabBtn: {
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
  viewTabBtnActive: {
    backgroundColor: '#D4AF37',
    borderColor: '#B48214',
  },
  viewTabText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: BRAND.burgundy,
  },
  viewTabTextActive: {
    color: '#140306',
    fontWeight: '800',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  kpiContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  kpiCard: {
    flex: 1,
    minWidth: 160,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  kpiCardMobile: {
    minWidth: '47%',
  },
  kpiIconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiValue: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
  },
  kpiLabel: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  filterSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 20,
    gap: 12,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(212, 175, 55, 0.45)',
    paddingHorizontal: 8,
    paddingRight: 10,
    height: 46,
    gap: 8,
    ...Platform.select({
      web: {
        boxShadow: '0 4px 18px rgba(82, 20, 28, 0.06), 0 2px 6px rgba(212, 175, 55, 0.12), inset 0 1px 0 #FFFFFF',
        transition: 'all 0.2s ease',
      } as any,
    }),
  },
  searchIconOrb: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(82, 20, 28, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchInput: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: '600',
    color: '#0F172A',
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
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.4)',
  },
  searchShortcutText: {
    color: '#92400E',
    fontSize: 9.5,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  accessFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 10,
  },
  accessFilterLabel: {
    fontSize: 11.5,
    fontWeight: '900',
    color: BRAND.burgundy,
    letterSpacing: 0.6,
  },
  accessPillsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  accessPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  accessPillActive: {
    backgroundColor: BRAND.burgundy,
    borderColor: BRAND.burgundy,
  },
  accessPillWithAccess: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  accessPillWithAccessActive: {
    backgroundColor: '#16A34A',
    borderColor: '#15803D',
  },
  accessPillNoAccess: {
    backgroundColor: '#F8FAFC',
    borderColor: '#CBD5E1',
  },
  accessPillNoAccessActive: {
    backgroundColor: '#475569',
    borderColor: '#334155',
  },
  accessPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  accessPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  clearFilterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#FEF2F2',
  },
  clearFilterText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#DC2626',
  },
  roleTabs: {
    flexDirection: 'row',
  },
  roleTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    marginRight: 8,
  },
  roleTabActive: {
    backgroundColor: BRAND.burgundy,
  },
  roleTabText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  roleTabTextActive: {
    color: '#FFFFFF',
  },
  tableContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  thText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  tableCell: {
    justifyContent: 'center',
  },
  avatarBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 15,
    fontWeight: '900',
  },
  staffName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  staffPhone: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  zoneText: {
    fontSize: 12,
    color: '#334155',
  },
  shiftText: {
    fontSize: 12,
    color: '#334155',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontSize: 12,
    color: '#334155',
  },
  pinCodeText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 2,
    color: '#0F172A',
  },
  actionBtn: {
    padding: 6,
  },
  mobileListContainer: {
    gap: 12,
  },
  mobileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  mobileCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  mobileCardDetails: {
    gap: 6,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#F1F5F9',
    marginBottom: 10,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 11,
    color: '#64748B',
  },
  detailValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  mobileCardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  mobileActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  mobileActionText: {
    fontSize: 12,
    fontWeight: '700',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 10,
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 520,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalIconBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#FDF2F4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
  },
  errorAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFF0F0',
    borderRadius: 8,
    padding: 10,
    marginBottom: 14,
  },
  errorAlertText: {
    fontSize: 12,
    color: '#FF3B30',
    fontWeight: '600',
  },
  formGroup: {
    marginBottom: 14,
  },
  formLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
  },
  formInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: '#0F172A',
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  formPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
  },
  formPillActive: {
    backgroundColor: BRAND.burgundy,
    borderColor: BRAND.burgundy,
  },
  formPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  formPillTextActive: {
    color: '#FFFFFF',
  },
  floorAssignmentBox: {
    backgroundColor: '#F0F7FF',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#CCE4FF',
  },
  formLabelHighlighted: {
    fontSize: 12,
    fontWeight: '800',
    color: '#007AFF',
  },
  floorAccessBadge: {
    backgroundColor: '#CCE4FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  floorAccessBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#007AFF',
  },
  formSubLabel: {
    fontSize: 11,
    color: '#666',
    marginBottom: 10,
    lineHeight: 15,
  },
  floorChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  floorChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#B8DAFF',
  },
  floorChipActiveAll: {
    backgroundColor: '#4a121a',
    borderColor: '#4a121a',
  },
  floorChipActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  floorChipText: {
    fontSize: 11,
    color: '#4a121a',
    fontWeight: '700',
  },
  floorChipTextActive: {
    color: '#FFFFFF',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  modalCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  modalCancelText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  modalSaveBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: BRAND.burgundy,
  },
  modalSaveText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
