import React, { useState } from 'react';
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
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  useRestaurantStore,
  StaffMember,
  StaffRole,
  StaffShift,
  StaffStatus,
} from '../../store/restaurantStore';

const ROLES: StaffRole[] = ['Admin', 'Manager', 'Waiter', 'Kitchen', 'JuiceBar'];
const SHIFTS: StaffShift[] = ['Morning', 'Evening', 'Night'];
const STATUSES: StaffStatus[] = ['Active', 'On Leave', 'Inactive'];

export default function StaffManagementScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const staff = useRestaurantStore((state) => state.staff) || [];
  const addStaff = useRestaurantStore((state) => state.addStaff);
  const updateStaff = useRestaurantStore((state) => state.updateStaff);
  const deleteStaff = useRestaurantStore((state) => state.deleteStaff);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeRoleFilter, setActiveRoleFilter] = useState<string>('All');
  const [revealedPins, setRevealedPins] = useState<Record<string, boolean>>({});

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);

  // Form Fields
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formRole, setFormRole] = useState<StaffRole>('Waiter');
  const [formShift, setFormShift] = useState<StaffShift>('Morning');
  const [formStatus, setFormStatus] = useState<StaffStatus>('Active');
  const [formPin, setFormPin] = useState('');
  const [formError, setFormError] = useState('');

  // Stats
  const totalStaff = staff.length;
  const activeCount = staff.filter((s) => s.status === 'Active').length;
  const onLeaveCount = staff.filter((s) => s.status === 'On Leave').length;
  const waiterCount = staff.filter((s) => s.role === 'Waiter').length;
  const kitchenCount = staff.filter((s) => s.role === 'Kitchen').length;
  const juiceBarCount = staff.filter((s) => s.role === 'JuiceBar').length;

  // Filtered List
  const filteredStaff = staff.filter((s) => {
    const matchesRole = activeRoleFilter === 'All' || s.role === activeRoleFilter;
    const query = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !query ||
      s.name.toLowerCase().includes(query) ||
      (s.phone && s.phone.toLowerCase().includes(query)) ||
      s.role.toLowerCase().includes(query) ||
      s.shift.toLowerCase().includes(query);
    return matchesRole && matchesSearch;
  });

  const getRoleColor = (role: StaffRole) => {
    switch (role) {
      case 'Manager':
        return '#5856D6';
      case 'Waiter':
        return '#007AFF';
      case 'Kitchen':
        return '#FF9500';
      case 'Admin':
        return '#4a121a'; // Sultan Burgundy
      default:
        return '#8E8E93';
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

  const openAddModal = () => {
    setEditingStaff(null);
    setFormName('');
    setFormPhone('');
    setFormRole('Waiter');
    setFormShift('Morning');
    setFormStatus('Active');
    setFormPin(Math.floor(1000 + Math.random() * 9000).toString());
    setFormError('');
    setModalVisible(true);
  };

  const openEditModal = (member: StaffMember) => {
    setEditingStaff(member);
    setFormName(member.name);
    setFormPhone(member.phone || '');
    setFormRole(member.role);
    setFormShift(member.shift);
    setFormStatus(member.status);
    setFormPin(member.pin);
    setFormError('');
    setModalVisible(true);
  };

  const handleSave = () => {
    if (!formName.trim()) {
      setFormError('Please enter an employee name');
      return;
    }
    if (!formPin.trim() || formPin.trim().length < 4) {
      setFormError('PIN must be at least 4 digits');
      return;
    }

    if (editingStaff) {
      updateStaff(editingStaff.id, {
        name: formName.trim(),
        phone: formPhone.trim(),
        role: formRole,
        shift: formShift,
        status: formStatus,
        pin: formPin.trim(),
      });
    } else {
      addStaff({
        name: formName.trim(),
        phone: formPhone.trim(),
        role: formRole,
        shift: formShift,
        status: formStatus,
        pin: formPin.trim(),
        joinedDate: new Date().toISOString().split('T')[0],
      });
    }

    setModalVisible(false);
  };

  const handleDelete = (member: StaffMember) => {
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
            <Text style={[styles.headerTitle, isMobile && { fontSize: 20 }]}>Staff & Roles</Text>
            {!isMobile && (
              <Text style={styles.headerSubtitle}>Manage staff accounts, credentials & shifts</Text>
            )}
          </View>
        </View>

        <TouchableOpacity style={styles.addButton} onPress={openAddModal}>
          <Ionicons name="person-add" size={17} color="#fff" />
          <Text style={styles.addButtonText}>{isMobile ? 'Add' : 'Add Employee'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={[styles.content, isMobile && { padding: 14 }]} showsVerticalScrollIndicator={false}>
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

          <View style={[styles.kpiCard, isMobile && styles.kpiCardMobile]}>
            <View style={[styles.kpiIconWrapper, { backgroundColor: '#F4EFFE' }]}>
              <Ionicons name="restaurant" size={20} color="#5856D6" />
            </View>
            <View>
              <Text style={styles.kpiValue}>{waiterCount}W / {kitchenCount}K / {juiceBarCount}J</Text>
              <Text style={styles.kpiLabel}>Floor/Kitchen/Juice</Text>
            </View>
          </View>
        </View>

        {/* Search & Filters */}
        <View style={styles.filterSection}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color="#8E8E93" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search employee, role, phone..."
              placeholderTextColor="#8E8E93"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={18} color="#8E8E93" />
              </TouchableOpacity>
            )}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.roleTabs}>
            {['All', ...ROLES].map((role) => (
              <TouchableOpacity
                key={role}
                style={[styles.roleTab, activeRoleFilter === role && styles.roleTabActive]}
                onPress={() => setActiveRoleFilter(role)}
              >
                <Text
                  style={[styles.roleTabText, activeRoleFilter === role && styles.roleTabTextActive]}
                >
                  {role} {role === 'All' ? `(${totalStaff})` : `(${staff.filter((s) => s.role === role).length})`}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Staff Presentation: Mobile Cards vs Desktop Table */}
        {isMobile ? (
          /* Mobile Card View */
          <View style={styles.mobileListContainer}>
            {filteredStaff.map((member) => {
              const isPinRevealed = !!revealedPins[member.id];
              return (
                <View key={member.id} style={styles.mobileCard}>
                  {/* Top: Avatar, Name, Role */}
                  <View style={styles.mobileCardHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                      <View
                        style={[
                          styles.avatarBox,
                          { backgroundColor: getRoleColor(member.role) + '18' },
                        ]}
                      >
                        <Text style={[styles.avatarText, { color: getRoleColor(member.role) }]}>
                          {member.name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.staffName}>{member.name}</Text>
                        <Text style={styles.staffPhone}>{member.phone || 'No phone added'}</Text>
                      </View>
                    </View>
                    <View
                      style={[
                        styles.roleBadge,
                        { backgroundColor: getRoleColor(member.role) + '15' },
                      ]}
                    >
                      <Text style={[styles.roleBadgeText, { color: getRoleColor(member.role) }]}>
                        {member.role}
                      </Text>
                    </View>
                  </View>

                  {/* Middle: Shift, Status & PIN */}
                  <View style={styles.mobileCardMetaRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name={getShiftIcon(member.shift)} size={15} color="#666" />
                      <Text style={styles.shiftText}>{member.shift}</Text>
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View
                        style={[
                          styles.statusDot,
                          {
                            backgroundColor:
                              member.status === 'Active'
                                ? '#34C759'
                                : member.status === 'On Leave'
                                ? '#FF9500'
                                : '#8E8E93',
                          },
                        ]}
                      />
                      <Text style={styles.statusText}>{member.status}</Text>
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.pinCodeText}>
                        PIN: {isPinRevealed ? member.pin : '••••'}
                      </Text>
                      <TouchableOpacity
                        style={styles.pinToggleBtn}
                        onPress={() => togglePinReveal(member.id)}
                      >
                        <Ionicons
                          name={isPinRevealed ? 'eye-off-outline' : 'eye-outline'}
                          size={15}
                          color="#007AFF"
                        />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Bottom: Action Buttons */}
                  <View style={styles.mobileCardActions}>
                    <TouchableOpacity
                      style={styles.mobileEditBtn}
                      onPress={() => openEditModal(member)}
                    >
                      <Ionicons name="create-outline" size={16} color="#007AFF" />
                      <Text style={styles.mobileEditBtnText}>Edit</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.mobileDeleteBtn}
                      onPress={() => handleDelete(member)}
                    >
                      <Ionicons name="trash-outline" size={16} color="#FF3B30" />
                      <Text style={styles.mobileDeleteBtnText}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}

            {filteredStaff.length === 0 && (
              <View style={styles.emptyContainer}>
                <Ionicons name="search-outline" size={38} color="#C7C7CC" />
                <Text style={styles.emptyTitle}>No staff members found</Text>
                <Text style={styles.emptySubtitle}>Try adjusting your search query.</Text>
              </View>
            )}
          </View>
        ) : (
          /* Desktop Table View */
          <View style={styles.tableCard}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableColHeader, { flex: 2.5 }]}>Employee</Text>
              <Text style={[styles.tableColHeader, { flex: 1.2 }]}>Role</Text>
              <Text style={[styles.tableColHeader, { flex: 1.2 }]}>Shift</Text>
              <Text style={[styles.tableColHeader, { flex: 1.2 }]}>Status</Text>
              <Text style={[styles.tableColHeader, { flex: 1.4 }]}>Security PIN</Text>
              <Text style={[styles.tableColHeader, { flex: 1, textAlign: 'right' }]}>Actions</Text>
            </View>

            {filteredStaff.map((member) => {
              const isPinRevealed = !!revealedPins[member.id];
              return (
                <View key={member.id} style={styles.tableRow}>
                  {/* Employee Name + Phone */}
                  <View style={[styles.tableCell, { flex: 2.5, flexDirection: 'row', alignItems: 'center' }]}>
                    <View
                      style={[
                        styles.avatarBox,
                        { backgroundColor: getRoleColor(member.role) + '18' },
                      ]}
                    >
                      <Text style={[styles.avatarText, { color: getRoleColor(member.role) }]}>
                        {member.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.staffName} numberOfLines={1}>
                        {member.name}
                      </Text>
                      <Text style={styles.staffPhone}>
                        {member.phone || 'No phone added'}
                      </Text>
                    </View>
                  </View>

                  {/* Role Badge */}
                  <View style={[styles.tableCell, { flex: 1.2, justifyContent: 'center' }]}>
                    <View
                      style={[
                        styles.roleBadge,
                        { backgroundColor: getRoleColor(member.role) + '15' },
                      ]}
                    >
                      <Text style={[styles.roleBadgeText, { color: getRoleColor(member.role) }]}>
                        {member.role}
                      </Text>
                    </View>
                  </View>

                  {/* Shift */}
                  <View style={[styles.tableCell, { flex: 1.2, flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
                    <Ionicons name={getShiftIcon(member.shift)} size={16} color="#666" />
                    <Text style={styles.shiftText}>{member.shift}</Text>
                  </View>

                  {/* Status */}
                  <View style={[styles.tableCell, { flex: 1.2, flexDirection: 'row', alignItems: 'center' }]}>
                    <View
                      style={[
                        styles.statusDot,
                        {
                          backgroundColor:
                            member.status === 'Active'
                              ? '#34C759'
                              : member.status === 'On Leave'
                              ? '#FF9500'
                              : '#8E8E93',
                        },
                      ]}
                    />
                    <Text style={styles.statusText}>{member.status}</Text>
                  </View>

                  {/* PIN with Show/Hide toggle */}
                  <View style={[styles.tableCell, { flex: 1.4, flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
                    <Text style={styles.pinCodeText}>
                      {isPinRevealed ? member.pin : '••••'}
                    </Text>
                    <TouchableOpacity
                      style={styles.pinToggleBtn}
                      onPress={() => togglePinReveal(member.id)}
                    >
                      <Ionicons
                        name={isPinRevealed ? 'eye-off-outline' : 'eye-outline'}
                        size={17}
                        color="#007AFF"
                      />
                    </TouchableOpacity>
                  </View>

                  {/* Actions */}
                  <View
                    style={[
                      styles.tableCell,
                      { flex: 1, flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
                    ]}
                  >
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => openEditModal(member)}
                    >
                      <Ionicons name="create-outline" size={19} color="#007AFF" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => handleDelete(member)}
                    >
                      <Ionicons name="trash-outline" size={19} color="#FF3B30" />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}

            {filteredStaff.length === 0 && (
              <View style={styles.emptyContainer}>
                <Ionicons name="search-outline" size={42} color="#C7C7CC" />
                <Text style={styles.emptyTitle}>No staff members found</Text>
                <Text style={styles.emptySubtitle}>Try adjusting your search query or role filter.</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Add / Edit Employee Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, isMobile && { padding: 18, maxHeight: '92%' }]}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={styles.modalIconBox}>
                  <Ionicons
                    name={editingStaff ? 'create' : 'person-add'}
                    size={20}
                    color="#4a121a"
                  />
                </View>
                <Text style={styles.modalTitle}>
                  {editingStaff ? 'Edit Staff' : 'Add New Staff'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color="#8E8E93" />
              </TouchableOpacity>
            </View>

            {formError.length > 0 && (
              <View style={styles.errorAlert}>
                <Ionicons name="alert-circle" size={18} color="#FF3B30" />
                <Text style={styles.errorAlertText}>{formError}</Text>
              </View>
            )}

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 460 }}>
              {/* Name */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Full Name *</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="e.g. Tariq Mehmood"
                  placeholderTextColor="#A0A0A5"
                  value={formName}
                  onChangeText={(val) => {
                    setFormName(val);
                    if (formError) setFormError('');
                  }}
                />
              </View>

              {/* Phone */}
              <View style={styles.formGroup}>
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

              {/* Role Selection */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Assigned Role *</Text>
                <View style={styles.pillsRow}>
                  {ROLES.map((r) => (
                    <TouchableOpacity
                      key={r}
                      style={[
                        styles.formPill,
                        formRole === r && {
                          backgroundColor: getRoleColor(r),
                          borderColor: getRoleColor(r),
                        },
                      ]}
                      onPress={() => setFormRole(r)}
                    >
                      <Text
                        style={[
                          styles.formPillText,
                          formRole === r && styles.formPillTextActive,
                        ]}
                      >
                        {r}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Shift Selection */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Work Shift *</Text>
                <View style={styles.pillsRow}>
                  {SHIFTS.map((s) => (
                    <TouchableOpacity
                      key={s}
                      style={[styles.formPill, formShift === s && styles.formPillActiveBurgundy]}
                      onPress={() => setFormShift(s)}
                    >
                      <Ionicons
                        name={getShiftIcon(s)}
                        size={15}
                        color={formShift === s ? '#fff' : '#666'}
                      />
                      <Text
                        style={[
                          styles.formPillText,
                          formShift === s && styles.formPillTextActive,
                        ]}
                      >
                        {s}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Status Selection */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Current Status *</Text>
                <View style={styles.pillsRow}>
                  {STATUSES.map((st) => (
                    <TouchableOpacity
                      key={st}
                      style={[
                        styles.formPill,
                        formStatus === st && {
                          backgroundColor:
                            st === 'Active' ? '#34C759' : st === 'On Leave' ? '#FF9500' : '#8E8E93',
                          borderColor: 'transparent',
                        },
                      ]}
                      onPress={() => setFormStatus(st)}
                    >
                      <Text
                        style={[
                          styles.formPillText,
                          formStatus === st && styles.formPillTextActive,
                        ]}
                      >
                        {st}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* 4-Digit Security PIN */}
              <View style={styles.formGroup}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={styles.formLabel}>Login PIN (4 Digits) *</Text>
                  <TouchableOpacity
                    onPress={() =>
                      setFormPin(Math.floor(1000 + Math.random() * 9000).toString())
                    }
                  >
                    <Text style={styles.generatePinLink}>Auto Generate</Text>
                  </TouchableOpacity>
                </View>
                <TextInput
                  style={[styles.formInput, { letterSpacing: 4, fontWeight: '700' }]}
                  placeholder="e.g. 1234"
                  placeholderTextColor="#A0A0A5"
                  value={formPin}
                  onChangeText={(val) => {
                    setFormPin(val.replace(/[^0-9]/g, '').slice(0, 6));
                    if (formError) setFormError('');
                  }}
                  keyboardType="numeric"
                  maxLength={6}
                />
                <Text style={styles.formHelperText}>Used by employee to log in to Waiter, Kitchen, or Manager apps.</Text>
              </View>
            </ScrollView>

            {/* Modal Actions */}
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                <Ionicons name="checkmark-sharp" size={18} color="#fff" />
                <Text style={styles.saveBtnText}>
                  {editingStaff ? 'Save Changes' : 'Create Staff'}
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
    backgroundColor: '#F8F9FA',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 24,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4 },
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
    gap: 12,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#F2F2F7',
    alignItems: 'center',
    justifyContent: 'center',
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
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4a121a', // Sultan Burgundy
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 10,
    gap: 6,
  },
  addButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  content: {
    flex: 1,
    padding: 24,
  },
  // KPI Cards
  kpiContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  kpiCard: {
    flex: 1,
    minWidth: 140,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#EFEFF4',
  },
  kpiCardMobile: {
    minWidth: '47%',
  },
  kpiIconWrapper: {
    width: 42,
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  kpiLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#8E8E93',
    marginTop: 1,
  },
  // Search & Filters
  filterSection: {
    marginBottom: 18,
    gap: 12,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 14,
    color: '#1C1C1E',
  },
  roleTabs: {
    flexDirection: 'row',
  },
  roleTab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E5EA',
    marginRight: 8,
  },
  roleTabActive: {
    backgroundColor: '#4a121a',
    borderColor: '#4a121a',
  },
  roleTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  roleTabTextActive: {
    color: '#fff',
  },
  // Mobile Card List
  mobileListContainer: {
    gap: 12,
    marginBottom: 40,
  },
  mobileCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#EFEFF4',
    gap: 12,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 3 },
      android: { elevation: 2 },
      web: { boxShadow: '0 2px 8px rgba(0,0,0,0.03)' },
    }),
  },
  mobileCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  mobileCardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#F2F2F7',
  },
  mobileCardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  mobileEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#EBF3FF',
  },
  mobileEditBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#007AFF',
  },
  mobileDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#FFF2F2',
  },
  mobileDeleteBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FF3B30',
  },
  // Table
  tableCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    marginBottom: 40,
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#EBEBEF',
    paddingBottom: 14,
    marginBottom: 8,
  },
  tableColHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
  },
  tableCell: {
    justifyContent: 'center',
  },
  avatarBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  avatarText: {
    fontSize: 15,
    fontWeight: '800',
  },
  staffName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  staffPhone: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 1,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  shiftText: {
    fontSize: 13,
    color: '#3A3A3C',
    fontWeight: '500',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3A3A3C',
  },
  pinCodeText: {
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: '700',
    color: '#1C1C1E',
  },
  pinToggleBtn: {
    padding: 3,
    borderRadius: 4,
    backgroundColor: '#F2F2F7',
  },
  actionBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#F9F9FB',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#3A3A3C',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#8E8E93',
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 24,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.15, shadowRadius: 10 },
      android: { elevation: 6 },
      web: { boxShadow: '0 8px 30px rgba(0,0,0,0.15)' },
    }),
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  modalIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F7EDEE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  errorAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF2F2',
    borderWidth: 1,
    borderColor: '#FFD4D4',
    padding: 10,
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
  },
  errorAlertText: {
    color: '#FF3B30',
    fontSize: 13,
    fontWeight: '600',
  },
  formGroup: {
    marginBottom: 16,
  },
  formLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#3A3A3C',
    marginBottom: 8,
  },
  formInput: {
    backgroundColor: '#F9F9FB',
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    color: '#1C1C1E',
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  formPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    backgroundColor: '#F9F9FB',
  },
  formPillActiveBurgundy: {
    backgroundColor: '#4a121a',
    borderColor: '#4a121a',
  },
  formPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  formPillTextActive: {
    color: '#fff',
  },
  generatePinLink: {
    fontSize: 12,
    fontWeight: '700',
    color: '#007AFF',
  },
  formHelperText: {
    fontSize: 11,
    color: '#8E8E93',
    marginTop: 5,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#EFEFF4',
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#F2F2F7',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#4a121a',
  },
  saveBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
});
