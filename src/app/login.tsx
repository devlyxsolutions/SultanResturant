import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { useAuthStore, Role, ROLE_HOME } from '../store/authStore';
import { useRestaurantStore, StaffMember } from '../store/restaurantStore';
import SultanLogo from '../components/SultanLogo';
import IslamicBackground from '../components/IslamicBackground';

const roles: { label: string; value: Role; icon: keyof typeof Ionicons.glyphMap; desc: string }[] = [
  { label: 'Admin', value: 'admin', icon: 'shield-checkmark-outline', desc: 'Full System & POS' },
  { label: 'Manager', value: 'manager', icon: 'business-outline', desc: '5-Floor & Ledger' },
  { label: 'Waiter', value: 'waiter', icon: 'walk-outline', desc: 'Tables & KOT Punch' },
  { label: 'Kitchen', value: 'kitchen', icon: 'restaurant-outline', desc: 'Live KDS Display' },
];

export default function LoginScreen() {
  const router = useRouter();
  const login = useAuthStore((state) => state.login);
  const user = useAuthStore((state) => state.user);
  const hasHydrated = useAuthStore((state) => state.hasHydrated);

  const staff = useRestaurantStore((state) => state.staff) || [];

  const [selectedRole, setSelectedRole] = useState<Role>(null);
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [showPin, setShowPin] = useState(false);

  // Already signed in? Go straight to role's home.
  useEffect(() => {
    if (hasHydrated && user?.role) {
      router.replace(ROLE_HOME[user.role] as Href);
    }
  }, [hasHydrated, user, router]);

  // Filter staff matching selected role
  const roleStaff = staff.filter(
    (s) => selectedRole && s.role.toLowerCase() === selectedRole.toLowerCase() && s.status !== 'Inactive'
  );

  const handleRoleSelect = (roleValue: Role) => {
    setSelectedRole(roleValue);
    setErrorMessage('');
    const matching = staff.filter(
      (s) => s.role.toLowerCase() === roleValue?.toLowerCase() && s.status === 'Active'
    );
    if (matching.length > 0) {
      setName(matching[0].name);
      setPin(matching[0].pin);
    } else {
      setName(roleValue ? roleValue.charAt(0).toUpperCase() + roleValue.slice(1) + ' User' : '');
      setPin('1234');
    }
  };

  const selectStaffMember = (member: StaffMember) => {
    setName(member.name);
    setPin(member.pin);
    setErrorMessage('');
  };

  const handleLogin = () => {
    if (!selectedRole || !name.trim()) {
      setErrorMessage('Please select a staff role.');
      return;
    }

    if (!pin.trim()) {
      setErrorMessage('Please enter your 4-digit PIN.');
      return;
    }

    // Check against store staff if present
    const matchedMember = staff.find(
      (s) =>
        s.name.toLowerCase() === name.trim().toLowerCase() &&
        s.role.toLowerCase() === selectedRole.toLowerCase()
    );

    // If matched staff member exists, verify their PIN (or master PIN 1234)
    if (matchedMember && matchedMember.pin !== pin && pin !== '1234') {
      setErrorMessage(`Incorrect PIN for ${matchedMember.name}. Please enter correct PIN.`);
      return;
    }

    setErrorMessage('');
    login(name.trim(), selectedRole);
    router.replace(ROLE_HOME[selectedRole] as Href);
  };

  return (
    <IslamicBackground theme="burgundy" showCorners={true} showCenterLattice={true}>
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.content}>
            {/* Header with HD Logo */}
            <View style={styles.header}>
              <View style={styles.logoBadgeOuter}>
                <SultanLogo size="md" width={68} height={68} />
              </View>
              <Text style={styles.title}>Sultan Staff Portal</Text>
              <Text style={styles.subtitle}>Select your operational role & enter PIN</Text>
            </View>

            {/* Role Cards Grid */}
            <View style={styles.rolesGrid}>
              {roles.map((r) => {
                const count = staff.filter(
                  (s) => s.role.toLowerCase() === r.value?.toLowerCase()
                ).length;
                const isSelected = selectedRole === r.value;
                return (
                  <TouchableOpacity
                    key={r.value}
                    style={[styles.roleCard, isSelected && styles.roleCardActive]}
                    onPress={() => handleRoleSelect(r.value)}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.roleIconCircle, isSelected && styles.roleIconCircleActive]}>
                      <Ionicons
                        name={r.icon}
                        size={24}
                        color={isSelected ? '#451014' : '#D5A943'}
                      />
                    </View>
                    <Text style={[styles.roleText, isSelected && styles.roleTextActive]}>
                      {r.label}
                    </Text>
                    <Text style={[styles.roleDesc, isSelected && styles.roleDescActive]}>
                      {r.desc}
                    </Text>
                    <View style={[styles.staffCountBadge, isSelected && styles.staffCountBadgeActive]}>
                      <Text style={[styles.staffCountText, isSelected && styles.staffCountTextActive]}>
                        {count} Staff Active
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Form Container (When Role is selected) */}
            {selectedRole && (
              <View style={styles.formContainer}>
                <View style={styles.formHeader}>
                  <View style={styles.activeRolePill}>
                    <Ionicons name="shield-outline" size={15} color="#D5A943" />
                    <Text style={styles.activeRoleText}>
                      Signing in as {selectedRole.toUpperCase()}
                    </Text>
                  </View>
                </View>

                {/* Quick Pick Staff Pills */}
                {roleStaff.length > 0 && (
                  <View style={styles.quickPickContainer}>
                    <Text style={styles.quickPickLabel}>Quick Select Profile:</Text>
                    <View style={styles.quickPickPills}>
                      {roleStaff.map((member) => (
                        <TouchableOpacity
                          key={member.id}
                          style={[
                            styles.staffPill,
                            name.toLowerCase() === member.name.toLowerCase() && styles.staffPillActive,
                          ]}
                          onPress={() => selectStaffMember(member)}
                        >
                          <Text
                            style={[
                              styles.staffPillText,
                              name.toLowerCase() === member.name.toLowerCase() &&
                                styles.staffPillTextActive,
                            ]}
                          >
                            {member.name} • ({member.shift})
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}

                {/* Error Banner */}
                {errorMessage.length > 0 && (
                  <View style={styles.errorBanner}>
                    <Ionicons name="alert-circle" size={18} color="#FF6B6B" />
                    <Text style={styles.errorText}>{errorMessage}</Text>
                  </View>
                )}

                {/* Name Input */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Staff Name</Text>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="person-outline" size={18} color="#D5A943" style={styles.fieldIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder="Enter full name"
                      placeholderTextColor="rgba(255,255,255,0.4)"
                      value={name}
                      onChangeText={(val) => {
                        setName(val);
                        if (errorMessage) setErrorMessage('');
                      }}
                    />
                  </View>
                </View>

                {/* PIN Input */}
                <View style={styles.inputGroup}>
                  <View style={styles.pinLabelRow}>
                    <Text style={styles.inputLabel}>Security PIN</Text>
                    <TouchableOpacity onPress={() => setShowPin(!showPin)}>
                      <Text style={styles.showPinText}>{showPin ? 'Hide PIN' : 'Show PIN'}</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="key-outline" size={18} color="#D5A943" style={styles.fieldIcon} />
                    <TextInput
                      style={[styles.input, styles.pinInput]}
                      placeholder="••••"
                      placeholderTextColor="rgba(255,255,255,0.4)"
                      secureTextEntry={!showPin}
                      keyboardType="number-pad"
                      value={pin}
                      onChangeText={(val) => {
                        setPin(val);
                        if (errorMessage) setErrorMessage('');
                      }}
                    />
                  </View>
                </View>

                {/* Submit Button */}
                <TouchableOpacity
                  style={[styles.loginButton, (!name.trim() || !pin.trim()) && styles.loginButtonDisabled]}
                  onPress={handleLogin}
                  disabled={!name.trim() || !pin.trim()}
                  activeOpacity={0.88}
                >
                  <Ionicons name="log-in-outline" size={20} color="#451014" />
                  <Text style={styles.loginButtonText}>Enter Portal</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Back Button */}
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            >
              <Ionicons name="arrow-back" size={16} color="#D5A943" style={{ marginRight: 6 }} />
              <Text style={styles.backButtonText}>Back to Welcome Screen</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </IslamicBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 24,
  },
  content: {
    paddingHorizontal: 20,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logoBadgeOuter: {
    padding: 6,
    borderRadius: 24,
    backgroundColor: 'rgba(213, 169, 67, 0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(213, 169, 67, 0.35)',
    marginBottom: 12,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
  },
  rolesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
    marginBottom: 20,
  },
  roleCard: {
    width: '48%',
    backgroundColor: 'rgba(30, 7, 9, 0.75)',
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(213, 169, 67, 0.25)',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 4,
  },
  roleCardActive: {
    borderColor: '#D5A943',
    backgroundColor: 'rgba(213, 169, 67, 0.2)',
  },
  roleIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(213, 169, 67, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(213, 169, 67, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  roleIconCircleActive: {
    backgroundColor: '#D5A943',
    borderColor: '#FFF',
  },
  roleText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
  roleTextActive: {
    color: '#D5A943',
  },
  roleDesc: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 2,
    textAlign: 'center',
  },
  roleDescActive: {
    color: 'rgba(255,255,255,0.9)',
  },
  staffCountBadge: {
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  staffCountBadgeActive: {
    backgroundColor: 'rgba(213, 169, 67, 0.25)',
  },
  staffCountText: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.7)',
    fontWeight: '600',
  },
  staffCountTextActive: {
    color: '#D5A943',
  },
  formContainer: {
    width: '100%',
    backgroundColor: 'rgba(30, 7, 9, 0.85)',
    borderRadius: 18,
    padding: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(213, 169, 67, 0.35)',
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  formHeader: {
    alignItems: 'center',
    marginBottom: 4,
  },
  activeRolePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: 'rgba(213, 169, 67, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(213, 169, 67, 0.3)',
  },
  activeRoleText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#D5A943',
    letterSpacing: 0.5,
  },
  quickPickContainer: {
    marginBottom: 4,
  },
  quickPickLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#D5A943',
    textTransform: 'uppercase',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  quickPickPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  staffPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(213, 169, 67, 0.2)',
  },
  staffPillActive: {
    backgroundColor: '#D5A943',
    borderColor: '#D5A943',
  },
  staffPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#E5E5EA',
  },
  staffPillTextActive: {
    color: '#451014',
    fontWeight: '700',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 59, 48, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.4)',
    padding: 10,
    borderRadius: 8,
    gap: 8,
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#D5A943',
  },
  pinLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  showPinText: {
    fontSize: 12,
    color: '#D5A943',
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    borderRadius: 10,
    borderWidth: 1.2,
    borderColor: 'rgba(213, 169, 67, 0.3)',
    paddingHorizontal: 12,
  },
  fieldIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 15,
    color: '#FFFFFF',
  },
  pinInput: {
    letterSpacing: 5,
    fontWeight: '700',
  },
  loginButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D5A943',
    paddingVertical: 15,
    borderRadius: 12,
    gap: 8,
    marginTop: 6,
    borderWidth: 1.5,
    borderColor: '#E8C76D',
    shadowColor: '#D5A943',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  loginButtonDisabled: {
    backgroundColor: '#5C4A28',
    borderColor: '#4A3B20',
  },
  loginButtonText: {
    color: '#451014',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  backButton: {
    marginTop: 18,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonText: {
    color: '#D5A943',
    fontSize: 14,
    fontWeight: '700',
  },
});
