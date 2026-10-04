import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Slot, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/authStore';
import SultanLogo from '../../components/SultanLogo';

export default function PlaylandLayout() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  const handleLogout = () => {
    logout();
    router.replace('/login');
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Top Header */}
      <View style={styles.header}>
        {/* Left: Logo & Portal Title */}
        <View style={styles.headerLeft}>
          <SultanLogo size="xs" />
          <View>
            <View style={styles.titleRow}>
              <Text style={styles.portalTitle}>SULTAN PLAYLAND</Text>
              <View style={styles.basementBadge}>
                <Text style={styles.basementText}>BASEMENT</Text>
              </View>
            </View>
            <Text style={styles.portalSubtitle}>Rides, Jhoolay & Ticketing Hub</Text>
          </View>
        </View>

        {/* Right: Cashier Info & Logout */}
        <View style={styles.headerRight}>
          <View style={styles.cashierPill}>
            <Ionicons name="person-circle" size={18} color="#D5A943" />
            <Text style={styles.cashierName}>{user?.name || 'Playland Cashier'}</Text>
          </View>

          <TouchableOpacity
            style={styles.switchRoleBtn}
            onPress={() => router.replace('/login')}
            activeOpacity={0.75}
          >
            <Ionicons name="swap-horizontal" size={16} color="#D5A943" />
            <Text style={styles.switchRoleText}>Switch</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.logoutBtn}
            onPress={handleLogout}
            activeOpacity={0.75}
          >
            <Ionicons name="log-out-outline" size={18} color="#FF6B6B" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Screen Slot */}
      <View style={styles.body}>
        <Slot />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#380B0F',
  },
  header: {
    height: 60,
    backgroundColor: '#451014',
    borderBottomWidth: 1.5,
    borderBottomColor: 'rgba(213, 169, 67, 0.4)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  portalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  basementBadge: {
    backgroundColor: '#D5A943',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  basementText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#451014',
  },
  portalSubtitle: {
    fontSize: 11,
    color: 'rgba(213, 169, 67, 0.85)',
    fontWeight: '500',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cashierPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(213, 169, 67, 0.25)',
  },
  cashierName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  switchRoleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: 'rgba(213, 169, 67, 0.15)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(213, 169, 67, 0.35)',
  },
  switchRoleText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#D5A943',
  },
  logoutBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 59, 48, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    backgroundColor: '#1C0507',
  },
});
