import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, usePathname } from 'expo-router';
import { useAuthStore } from '../store/authStore';
import { useRestaurantStore } from '../store/restaurantStore';
import { DEVICE_ID, getDeviceFriendlyName } from '../services/syncService';

const BRAND = {
  burgundy: '#52171B',
  burgundyDark: '#2A060C',
  gold: '#D5A943',
  goldLight: '#F3D179',
  cardBg: '#FFFFFF',
  textDark: '#1E293B',
  textMuted: '#64748B',
  danger: '#DC2626',
  dangerLight: '#FEF2F2',
  dangerBorder: '#FECACA',
};

export default function SessionSecurityHost() {
  const router = useRouter();
  const pathname = usePathname();
  const { width } = useWindowDimensions();

  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const logout = useAuthStore((s) => s.logout);

  const revokedDeviceIds = useRestaurantStore((s) => s.revokedDeviceIds);
  const activeStaffSessions = useRestaurantStore((s) => s.activeStaffSessions);

  const [kickModalVisible, setKickModalVisible] = useState(false);
  const [kickDetails, setKickDetails] = useState<{
    staffName: string;
    reason: string;
    time: string;
  }>({
    staffName: '',
    reason: '',
    time: '',
  });

  const hasHandledKickRef = useRef(false);

  // 1. Check for explicit revocation targeted at this device
  useEffect(() => {
    if (!isAuthenticated || !user) {
      hasHandledKickRef.current = false;
      return;
    }

    if (revokedDeviceIds && revokedDeviceIds[DEVICE_ID]) {
      const rev = revokedDeviceIds[DEVICE_ID];
      const now = Date.now();
      // If revoked in the last 15 minutes
      if (now - rev.timestamp < 15 * 60 * 1000 && !hasHandledKickRef.current) {
        hasHandledKickRef.current = true;
        setKickDetails({
          staffName: rev.staffName || user.name,
          reason: rev.reason || 'Doosri device par login kiya gaya hai',
          time: new Date(rev.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        });
        setKickModalVisible(true);
        logout();

        // Clear local entry so it does not loop
        useRestaurantStore.setState((state) => {
          const next = { ...(state.revokedDeviceIds || {}) };
          delete next[DEVICE_ID];
          return { revokedDeviceIds: next };
        });
      }
    }
  }, [revokedDeviceIds, isAuthenticated, user, logout]);

  // 2. Heartbeat check: If user is logged in, ensure their session still exists in activeStaffSessions
  useEffect(() => {
    if (!isAuthenticated || !user || !user.sessionId) return;
    if (!activeStaffSessions || activeStaffSessions.length === 0) return;

    // Check if another device has logged in with the exact same staffId or name, and our session is gone
    const normStaffId = (user.staffId || user.id || '').toLowerCase().trim();
    const normName = (user.name || '').toLowerCase().trim();

    const mySessionStillActive = activeStaffSessions.some(
      (s) => s.sessionId === user.sessionId && s.deviceId === DEVICE_ID
    );

    const hasOtherSessionsForThisStaff = activeStaffSessions.some(
      (s) =>
        s.deviceId !== DEVICE_ID &&
        ((s.staffId && s.staffId.toLowerCase().trim() === normStaffId) ||
          (s.staffName && s.staffName.toLowerCase().trim() === normName))
    );

    // If our session was evicted and replaced by another device session
    if (!mySessionStillActive && hasOtherSessionsForThisStaff && !hasHandledKickRef.current) {
      hasHandledKickRef.current = true;
      const otherSess = activeStaffSessions.find(
        (s) =>
          s.deviceId !== DEVICE_ID &&
          ((s.staffId && s.staffId.toLowerCase().trim() === normStaffId) ||
            (s.staffName && s.staffName.toLowerCase().trim() === normName))
      );

      setKickDetails({
        staffName: user.name,
        reason: `New login on ${otherSess?.deviceName || 'another device'}`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      });
      setKickModalVisible(true);
      logout();
    }
  }, [activeStaffSessions, isAuthenticated, user, logout]);

  const handleDismiss = () => {
    setKickModalVisible(false);
    hasHandledKickRef.current = false;
    router.replace('/' as any);
  };

  if (!kickModalVisible) return null;

  return (
    <Modal
      visible={kickModalVisible}
      transparent
      animationType="fade"
      onRequestClose={handleDismiss}
    >
      <View style={styles.backdrop}>
        <View style={[styles.card, { maxWidth: Math.min(width - 32, 460) }]}>
          {/* Header Icon */}
          <View style={styles.iconCircle}>
            <Ionicons name="phone-portrait-outline" size={28} color="#DC2626" />
            <View style={styles.subBadge}>
              <Ionicons name="close" size={13} color="#FFFFFF" />
            </View>
          </View>

          <Text style={styles.urduTitle}>سیشن ختم ہو گیا • Session Terminated</Text>
          <Text style={styles.englishTitle}>Account Logged In On Another Device</Text>

          <View style={styles.infoBox}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>User Account:</Text>
              <Text style={styles.infoValue}>{kickDetails.staffName || 'Staff Member'}</Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Security Policy:</Text>
              <Text style={styles.infoValue}>Single Device Active Limit</Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Reason:</Text>
              <Text style={[styles.infoValue, { color: '#DC2626' }]}>
                {kickDetails.reason || 'New login detected on another terminal'}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Time:</Text>
              <Text style={styles.infoValue}>{kickDetails.time}</Text>
            </View>
          </View>

          <Text style={styles.noticeText}>
            آپ کا اکاؤنٹ کسی دوسری ڈیوائس پر لاگ ان ہوا ہے۔ سسٹم سیکیورٹی اور بلائنڈ آڈٹ پالیسی کے تحت اس ڈیوائس کو محفوظ طریقے سے لاگ آؤٹ کر دیا گیا ہے۔
          </Text>

          <TouchableOpacity
            style={styles.actionBtn}
            onPress={handleDismiss}
            activeOpacity={0.85}
          >
            <Ionicons name="log-in-outline" size={18} color="#FFFFFF" />
            <Text style={styles.actionBtnText}>ٹھیک ہے • Go to Login</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(20, 3, 6, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    zIndex: 99999,
  },
  card: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 20,
    borderWidth: 1.5,
    borderColor: '#FECACA',
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    position: 'relative',
  },
  subBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#DC2626',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  urduTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#1E293B',
    textAlign: 'center',
    marginBottom: 4,
  },
  englishTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#DC2626',
    textAlign: 'center',
    marginBottom: 16,
  },
  infoBox: {
    width: '100%',
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
    gap: 8,
    marginBottom: 14,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  infoValue: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1E293B',
  },
  noticeText: {
    fontSize: 12,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  actionBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#52171B',
    paddingVertical: 13,
    borderRadius: 12,
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
