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
import { DEVICE_ID, getActiveServerHttpUrl } from '../services/syncService';

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
  const silentLogout = useAuthStore((s) => s.silentLogout);

  const revokedSessions = useRestaurantStore((s) => s.revokedSessions);
  const revokedDeviceIds = useRestaurantStore((s) => s.revokedDeviceIds);
  const activeStaffSessions = useRestaurantStore((s) => s.activeStaffSessions);
  const forceLogoutAll = useRestaurantStore((s) => s.forceLogoutAll);

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

  const triggerForcedLogout = (staffName: string, reason: string, timestamp?: number) => {
    if (hasHandledKickRef.current) return;
    hasHandledKickRef.current = true;
    setKickDetails({
      staffName,
      reason: reason || 'Doosri device par login kiya gaya hai',
      time: new Date(timestamp || Date.now()).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
    });
    setKickModalVisible(true);
    silentLogout();
  };

  // 1. STRICT Session-Scoped Revocation Check (NEVER kicks a different user or different sessionId!)
  useEffect(() => {
    if (!isAuthenticated || !user) {
      hasHandledKickRef.current = false;
      return;
    }

    const now = Date.now();
    const mySessionId = user.sessionId || '';
    const myStaffId = (user.staffId || user.id || '').toLowerCase().trim();

    // 1.0 Global Master Admin "Logout All Users" sweep (applies to every logged-in device except the admin who triggered it)
    if (
      forceLogoutAll &&
      forceLogoutAll.timestamp &&
      now - forceLogoutAll.timestamp < 24 * 60 * 60 * 1000
    ) {
      const isExempt = Boolean(
        (forceLogoutAll.exceptSessionId && mySessionId && forceLogoutAll.exceptSessionId === mySessionId) ||
        (!mySessionId && forceLogoutAll.exceptDeviceId && forceLogoutAll.exceptDeviceId === DEVICE_ID)
      );
      const loggedInBeforeSweep = !user.loginTime || user.loginTime <= forceLogoutAll.timestamp;
      if (!isExempt && loggedInBeforeSweep) {
        triggerForcedLogout(
          user.name,
          forceLogoutAll.reason || 'Master Admin نے تمام صارفین کو لاگ آؤٹ کر دیا ہے',
          forceLogoutAll.timestamp
        );
        return;
      }
    }

    if (!mySessionId) return;

    // 1a. Primary exact check: was THIS exact sessionId revoked for THIS exact account?
    if (revokedSessions && revokedSessions[mySessionId]) {
      const rev = revokedSessions[mySessionId];
      const revStaffId = (rev.staffId || '').toLowerCase().trim();
      const sameAccount = !revStaffId || !myStaffId || revStaffId === myStaffId;
      if (sameAccount && now - (rev.timestamp || 0) < 60 * 60 * 1000) {
        triggerForcedLogout(rev.staffName || user.name, rev.reason, rev.timestamp);
        return;
      }
    }

    // 1b. Device revocation check — STRICTLY require exact sessionId match (never kick on legacy session-less entries!)
    if (revokedDeviceIds && revokedDeviceIds[DEVICE_ID]) {
      const rev = revokedDeviceIds[DEVICE_ID];
      const revStaffId = (rev.staffId || '').toLowerCase().trim();
      const matchesExactSession = Boolean(
        rev.sessionId &&
          rev.sessionId === mySessionId &&
          (!revStaffId || !myStaffId || revStaffId === myStaffId)
      );

      if (matchesExactSession) {
        triggerForcedLogout(rev.staffName || user.name, rev.reason, rev.timestamp);
        useRestaurantStore.setState((state) => {
          const next = { ...(state.revokedDeviceIds || {}) };
          delete next[DEVICE_ID];
          return { revokedDeviceIds: next };
        });
      }
    }
  }, [revokedSessions, revokedDeviceIds, forceLogoutAll, isAuthenticated, user, silentLogout]);

  // 2. Active-Sessions Eviction Check (STRICTLY scoped to exact same staffId + newer login — NEVER cross-account!)
  useEffect(() => {
    if (!isAuthenticated || !user || !user.sessionId) return;
    if (!activeStaffSessions || activeStaffSessions.length === 0) return;

    // Brief 2.5s grace window right after login so a stale pre-login sync packet can never kick a fresh login
    if (user.loginTime && Date.now() - user.loginTime < 2500) return;

    const normStaffId = (user.staffId || user.id || '').toLowerCase().trim();
    if (!normStaffId) return;

    const mySessionStillActive = activeStaffSessions.some(
      (s) => s.sessionId === user.sessionId
    );

    // Must be a NEWER login on a DIFFERENT device for the EXACT SAME staffId
    const myLoginTs = user.loginTime || 0;
    const otherSessForExactSameAccount = activeStaffSessions.find(
      (s) =>
        s.sessionId !== user.sessionId &&
        s.deviceId !== DEVICE_ID &&
        s.staffId &&
        s.staffId.toLowerCase().trim() === normStaffId &&
        (s.loginTime || 0) >= myLoginTs
    );

    if (!mySessionStillActive && otherSessForExactSameAccount && !hasHandledKickRef.current) {
      triggerForcedLogout(
        user.name,
        `New login on ${otherSessForExactSameAccount.deviceName || 'another device'}`,
        otherSessForExactSameAccount.loginTime
      );
    }
  }, [activeStaffSessions, isAuthenticated, user, silentLogout]);

  // 3. Authoritative Server Heartbeat Verification (Safety net if WebSocket briefly drops)
  useEffect(() => {
    if (!isAuthenticated || !user || !user.sessionId) return;
    let cancelled = false;

    const verifyWithServer = async () => {
      if (cancelled || hasHandledKickRef.current) return;
      if (user.loginTime && Date.now() - user.loginTime < 2500) return;
      try {
        const baseUrl = getActiveServerHttpUrl();
        if (!baseUrl) return;
        const myStaffId = (user.staffId || user.id || '').toLowerCase().trim();
        const staffId = encodeURIComponent(user.staffId || user.id || '');
        const sessionId = encodeURIComponent(user.sessionId || '');
        const deviceId = encodeURIComponent(DEVICE_ID);
        const loginTime = encodeURIComponent(String(user.loginTime || 0));
        const res = await fetch(
          `${baseUrl}/api/auth/staff-session/verify?sessionId=${sessionId}&staffId=${staffId}&deviceId=${deviceId}&loginTime=${loginTime}`
        );
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const respStaffId = (data?.staffId || '').toLowerCase().trim();
        const sameAccount = !respStaffId || !myStaffId || respStaffId === myStaffId;
        if (data && data.valid === false && data.revoked && sameAccount) {
          triggerForcedLogout(
            data.staffName || user.name,
            data.reason || 'Doosri device par login kiya gaya hai',
            data.timestamp
          );
        }
      } catch {
        // Offline / LAN unreachable — stay logged in safely
      }
    };

    const interval = setInterval(verifyWithServer, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isAuthenticated, user?.sessionId, user?.staffId, user?.id, user?.name, user?.loginTime]);

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
          <Text style={styles.englishTitle}>
            {/admin|لاگ آؤٹ|کک|logout all/i.test(kickDetails.reason || '')
              ? 'Logged Out By Master Admin'
              : 'Account Logged In On Another Device'}
          </Text>

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
