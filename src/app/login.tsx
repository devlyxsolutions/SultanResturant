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

const roles: { label: string; value: Role; icon: keyof typeof Ionicons.glyphMap }[] = [
  { label: 'Admin', value: 'admin', icon: 'shield-checkmark-outline' },
  { label: 'Manager', value: 'manager', icon: 'business-outline' },
  { label: 'Waiter', value: 'waiter', icon: 'walk-outline' },
  { label: 'Kitchen', value: 'kitchen', icon: 'restaurant-outline' },
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

  // Already signed in (e.g. after a page refresh)? Go straight to the role's home.
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
      setErrorMessage('Please select a role and enter a name.');
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
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          {/* Logo / Header */}
          <View style={styles.header}>
            <View style={styles.brandIconBox}>
              <Ionicons name="restaurant" size={32} color="#D5A943" />
            </View>
            <Text style={styles.title}>Sultan Restaurant</Text>
            <Text style={styles.subtitle}>Select your staff role & enter PIN to access</Text>
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
                >
                  <Ionicons
                    name={r.icon}
                    size={28}
                    color={isSelected ? '#4a121a' : '#666'}
                    style={{ marginBottom: 6 }}
                  />
                  <Text style={[styles.roleText, isSelected && styles.roleTextActive]}>
                    {r.label}
                  </Text>
                  <Text style={styles.staffCountBadge}>{count} Staff</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {selectedRole && (
            <View style={styles.formContainer}>
              {/* Quick Pick Staff Pills if available */}
              {roleStaff.length > 0 && (
                <View style={styles.quickPickContainer}>
                  <Text style={styles.quickPickLabel}>Select {selectedRole.toUpperCase()} Profile:</Text>
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
                          {member.name} ({member.shift})
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {/* Error Box */}
              {errorMessage.length > 0 && (
                <View style={styles.errorBanner}>
                  <Ionicons name="alert-circle" size={18} color="#FF3B30" />
                  <Text style={styles.errorText}>{errorMessage}</Text>
                </View>
              )}

              {/* Name Input */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Staff Name</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="person-outline" size={18} color="#8E8E93" style={styles.fieldIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Enter your name"
                    placeholderTextColor="#999"
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
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={styles.inputLabel}>Security PIN</Text>
                  <TouchableOpacity onPress={() => setShowPin(!showPin)}>
                    <Text style={styles.showPinText}>{showPin ? 'Hide PIN' : 'Show PIN'}</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.inputWrapper}>
                  <Ionicons name="key-outline" size={18} color="#8E8E93" style={styles.fieldIcon} />
                  <TextInput
                    style={[styles.input, { letterSpacing: 4, fontWeight: '700' }]}
                    placeholder="Enter PIN (e.g. 1234)"
                    placeholderTextColor="#999"
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
              >
                <Ionicons name="log-in-outline" size={20} color="#fff" />
                <Text style={styles.loginButtonText}>Access System</Text>
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity
            style={styles.backButton}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          >
            <Text style={styles.backButtonText}>← Back to Home</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF9F6',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 32,
  },
  content: {
    padding: 24,
    maxWidth: 540,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 28,
  },
  brandIconBox: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#4a121a',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#4a121a', // Sultan Burgundy
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  rolesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
    marginBottom: 24,
  },
  roleCard: {
    width: '47%',
    backgroundColor: '#fff',
    paddingVertical: 18,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#EFEFEF',
    alignItems: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 3 },
      android: { elevation: 2 },
      web: { boxShadow: '0 2px 8px rgba(0,0,0,0.04)' },
    }),
  },
  roleCardActive: {
    borderColor: '#4a121a',
    backgroundColor: '#FFF9FA',
  },
  roleText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
  },
  roleTextActive: {
    color: '#4a121a',
  },
  staffCountBadge: {
    fontSize: 11,
    color: '#8E8E93',
    marginTop: 4,
    fontWeight: '500',
  },
  formContainer: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#EFEFEF',
    gap: 14,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.05, shadowRadius: 6 },
      android: { elevation: 3 },
      web: { boxShadow: '0 4px 16px rgba(0,0,0,0.05)' },
    }),
  },
  quickPickContainer: {
    marginBottom: 6,
  },
  quickPickLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8E8E93',
    textTransform: 'uppercase',
    marginBottom: 8,
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
    backgroundColor: '#F2F2F7',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  staffPillActive: {
    backgroundColor: '#4a121a',
    borderColor: '#4a121a',
  },
  staffPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3A3A3C',
  },
  staffPillTextActive: {
    color: '#fff',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF2F2',
    borderWidth: 1,
    borderColor: '#FFD4D4',
    padding: 10,
    borderRadius: 8,
    gap: 8,
  },
  errorText: {
    color: '#FF3B30',
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
    color: '#3A3A3C',
  },
  showPinText: {
    fontSize: 12,
    color: '#007AFF',
    fontWeight: '600',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9F9FB',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    paddingHorizontal: 12,
  },
  fieldIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1C1C1E',
  },
  loginButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4a121a',
    paddingVertical: 14,
    borderRadius: 10,
    gap: 8,
    marginTop: 6,
  },
  loginButtonDisabled: {
    backgroundColor: '#C7C7CC',
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  backButton: {
    marginTop: 20,
    padding: 12,
    alignItems: 'center',
  },
  backButtonText: {
    color: '#666',
    fontSize: 14,
    fontWeight: '600',
  },
});
