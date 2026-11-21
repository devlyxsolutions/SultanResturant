import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  Modal, 
  TextInput, 
  Platform 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSyncStatus } from '../hooks/useSyncStatus';
import { useRestaurantStore, INITIAL_STAFF } from '../store';

// ─── Admin PIN Guard ────────────────────────────────────────────────
// Returns true if the entered PIN matches any Admin-role staff member
function checkAdminPin(enteredPin: string): boolean {
  if (!enteredPin || enteredPin.trim().length < 4) return false;
  const liveStaff = useRestaurantStore.getState().staff ?? [];
  const allStaff = [...liveStaff];
  for (const s of INITIAL_STAFF) {
    if (!allStaff.some((x) => x.id === s.id)) allStaff.push(s);
  }
  return allStaff.some(
    (s) =>
      s.role.toLowerCase() === 'admin' &&
      s.status !== 'Inactive' &&
      s.pin === enteredPin.trim()
  );
}

interface Props {
  compact?: boolean;
}

export default function SyncStatusBadge({ compact = false }: Props) {
  const { 
    status, 
    serverIp, 
    serverPort, 
    serverUrl,
    isCloudDb,
    lastSyncedAt, 
    totalSyncedEvents, 
    forceSyncNow, 
    setCustomServerIp 
  } = useSyncStatus();

  // ── PIN gate state ──
  const [pinGateVisible, setPinGateVisible] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');

  const [modalVisible, setModalVisible] = useState(false);
  const [ipInput, setIpInput] = useState(serverIp);
  const [syncingNow, setSyncingNow] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState('');

  const isConnected = status === 'connected';
  const isConnecting = status === 'connecting';

  // Opens PIN gate first; Sync Hub opens only after correct admin PIN
  const handleOpenModal = () => {
    setPinInput('');
    setPinError('');
    setPinGateVisible(true);
  };

  const handlePinSubmit = () => {
    if (checkAdminPin(pinInput)) {
      setPinGateVisible(false);
      setPinInput('');
      setPinError('');
      setIpInput(serverIp);
      setFeedbackMsg('');
      setModalVisible(true);
    } else {
      setPinError('Galat PIN — Sirf Admin access kar sakta hai!');
      setPinInput('');
    }
  };

  const handleSaveIp = async () => {
    if (!ipInput.trim()) return;
    setFeedbackMsg('Reconnecting to ' + ipInput.trim() + '...');
    await setCustomServerIp(ipInput.trim());
    setTimeout(() => {
      setFeedbackMsg('Server address updated.');
    }, 1500);
  };

  const handleSyncNow = async () => {
    setSyncingNow(true);
    setFeedbackMsg('Syncing with Master Server...');
    const ok = await forceSyncNow();
    setSyncingNow(false);
    if (ok) {
      setFeedbackMsg('Synchronized successfully!');
    } else {
      setFeedbackMsg('Could not reach server at ' + (serverUrl || serverIp || 'address'));
    }
  };

  const getStatusText = () => {
    if (isConnected) return compact ? 'Live' : 'Live Sync';
    if (isConnecting) return 'Connecting...';
    return compact ? 'Offline' : 'Offline Mode';
  };

  const getDotColor = () => {
    if (isConnected) return '#2ecc71';
    if (isConnecting) return '#f1c40f';
    return '#e74c3c';
  };

  return (
    <>
      <TouchableOpacity 
        style={[
          styles.badge, 
          isConnected ? styles.badgeConnected : (isConnecting ? styles.badgeConnecting : styles.badgeOffline)
        ]}
        onPress={handleOpenModal}
        activeOpacity={0.7}
      >
        <View style={[styles.dot, { backgroundColor: getDotColor() }]} />
        <Text style={[
          styles.badgeText, 
          isConnected ? styles.textConnected : (isConnecting ? styles.textConnecting : styles.textOffline)
        ]}>
          {getStatusText()}
        </Text>
      </TouchableOpacity>

      {/* ══════════════════════════════════════════
          ADMIN PIN GATE MODAL
          ══════════════════════════════════════════ */}
      <Modal visible={pinGateVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxWidth: 340 }]}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <View style={styles.headerLeft}>
                <Ionicons name="shield-checkmark" size={22} color="#D4AF37" style={{ marginRight: 8 }} />
                <Text style={styles.modalTitle}>Admin Access Only</Text>
              </View>
              <TouchableOpacity
                onPress={() => { setPinGateVisible(false); setPinInput(''); setPinError(''); }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={22} color="#8E8E93" />
              </TouchableOpacity>
            </View>

            {/* Lock icon */}
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <View style={styles.lockIconCircle}>
                <Ionicons name="lock-closed" size={32} color="#D4AF37" />
              </View>
              <Text style={styles.pinGateTitle}>Sync Hub — Admin PIN</Text>
              <Text style={styles.pinGateSubtitle}>
                Yeh section sirf Admin ke liye hai.{'\n'}Apna Admin PIN enter karein.
              </Text>
            </View>

            {/* PIN Input */}
            <TextInput
              style={[styles.ipInput, { textAlign: 'center', letterSpacing: 8, fontSize: 22, fontWeight: '800', marginBottom: 8 }]}
              value={pinInput}
              onChangeText={(t) => { setPinInput(t.replace(/[^0-9]/g, '').slice(0, 8)); setPinError(''); }}
              placeholder="● ● ● ●"
              placeholderTextColor="#C0C0C0"
              keyboardType="numeric"
              secureTextEntry={true}
              maxLength={8}
              autoFocus={true}
              onSubmitEditing={handlePinSubmit}
            />

            {/* Touch keypad */}
            <View style={styles.keypadGrid}>
              {['1','2','3','4','5','6','7','8','9','CLR','0','⌫'].map((k) => (
                <TouchableOpacity
                  key={k}
                  style={[styles.keypadKey, (k === 'CLR' || k === '⌫') && styles.keypadKeyAlt]}
                  onPress={() => {
                    if (k === 'CLR') { setPinInput(''); setPinError(''); }
                    else if (k === '⌫') { setPinInput((p) => p.slice(0, -1)); setPinError(''); }
                    else if (pinInput.length < 8) setPinInput((p) => p + k);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.keypadKeyText, (k === 'CLR' || k === '⌫') && styles.keypadKeyTextAlt]}>{k}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Error */}
            {pinError ? (
              <View style={[styles.feedbackBox, { backgroundColor: 'rgba(231,76,60,0.1)', borderColor: '#e74c3c', marginBottom: 10 }]}>
                <Text style={[styles.feedbackText, { color: '#c0392b' }]}>{pinError}</Text>
              </View>
            ) : null}

            {/* Submit */}
            <TouchableOpacity
              style={[styles.syncNowBtn, { justifyContent: 'center', marginTop: 4 }]}
              onPress={handlePinSubmit}
              activeOpacity={0.85}
            >
              <Ionicons name="checkmark-circle" size={18} color="#4a121a" style={{ marginRight: 6 }} />
              <Text style={styles.syncNowBtnText}>Confirm PIN</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Sync Management Modal */}
      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={styles.headerLeft}>
                <Ionicons 
                  name={isConnected ? "wifi" : (isConnecting ? "sync-outline" : "wifi-outline")} 
                  size={24} 
                  color={isConnected ? "#2ecc71" : "#e74c3c"} 
                  style={{ marginRight: 8 }}
                />
                <Text style={styles.modalTitle}>Cross-Device Sync Hub</Text>
              </View>
              <TouchableOpacity onPress={() => setModalVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={24} color="#8E8E93" />
              </TouchableOpacity>
            </View>

            <View style={[styles.statusBox, isConnected ? styles.boxConnected : styles.boxOffline]}>
              <View style={styles.statusRow}>
                <Text style={styles.statusLabel}>Connection Status:</Text>
                <View style={styles.statusIndicator}>
                  <View style={[styles.dotLarge, { backgroundColor: getDotColor() }]} />
                  <Text style={[styles.statusValue, { color: getDotColor() }]}>
                    {isConnected 
                      ? (isCloudDb ? 'ONLINE & CLOUD SYNCED (FIREBASE)' : 'ONLINE & SYNCED') 
                      : (isConnecting ? 'CONNECTING...' : 'OFFLINE / LOCAL STORAGE')}
                  </Text>
                </View>
              </View>
              <View style={styles.statusRow}>
                <Text style={styles.statusLabel}>Master Hub Address:</Text>
                <Text style={styles.statusValueBold} numberOfLines={1}>
                  {serverUrl || (serverIp ? `ws://${serverIp}:${serverPort}` : 'Not Configured')}
                </Text>
              </View>
              {lastSyncedAt ? (
                <View style={styles.statusRow}>
                  <Text style={styles.statusLabel}>Last Synced:</Text>
                  <Text style={styles.statusValue}>{new Date(lastSyncedAt).toLocaleTimeString()}</Text>
                </View>
              ) : null}
              <View style={styles.statusRow}>
                <Text style={styles.statusLabel}>Synced Events:</Text>
                <Text style={styles.statusValue}>{totalSyncedEvents} updates</Text>
              </View>
            </View>

            {isCloudDb && (
              <View style={{ backgroundColor: 'rgba(46, 204, 113, 0.12)', borderColor: '#2ecc71', borderWidth: 1, padding: 10, borderRadius: 8, marginBottom: 14, flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="cloud-done" size={20} color="#2ecc71" style={{ marginRight: 8 }} />
                <Text style={{ color: '#2ecc71', fontSize: 12, flex: 1, fontWeight: '500' }}>
                  Firebase Realtime Database is live! All devices (Waiters, Kitchen, POS) sync across the internet automatically.
                </Text>
              </View>
            )}

            {/* Server IP / Cloud URL Config */}
            <Text style={styles.sectionLabel}>Server Address (Cloud URL or Local IP):</Text>
            <View style={styles.inputRow}>
              <TextInput 
                style={styles.ipInput}
                value={ipInput}
                onChangeText={setIpInput}
                placeholder="e.g. sultan-hub.onrender.com or 192.168.1.14"
                placeholderTextColor="#8E8E93"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity style={styles.saveIpBtn} onPress={handleSaveIp}>
                <Text style={styles.saveIpBtnText}>Connect</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.quickPresetsRow}>
              <TouchableOpacity style={styles.presetChip} onPress={() => setIpInput('192.168.100.3')}>
                <Text style={styles.presetChipText}>Server (192.168.100.3)</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.presetChip} onPress={() => setIpInput('192.168.100.155')}>
                <Text style={styles.presetChipText}>Server (192.168.100.155)</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.presetChip} onPress={() => setIpInput('192.168.0.148')}>
                <Text style={styles.presetChipText}>TP-Link (192.168.0.148)</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.presetChip} onPress={() => setIpInput('192.168.0.100')}>
                <Text style={styles.presetChipText}>TP-Link (192.168.0.100)</Text>
              </TouchableOpacity>
              {Platform.OS === 'web' && (
                <TouchableOpacity style={styles.presetChip} onPress={() => setIpInput('localhost')}>
                  <Text style={styles.presetChipText}>localhost</Text>
                </TouchableOpacity>
              )}
            </View>

            {feedbackMsg ? (
              <View style={styles.feedbackBox}>
                <Text style={styles.feedbackText}>{feedbackMsg}</Text>
              </View>
            ) : null}

            <View style={styles.modalActions}>
              <TouchableOpacity 
                style={styles.syncNowBtn} 
                onPress={handleSyncNow}
                disabled={syncingNow}
              >
                <Ionicons name="refresh" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.syncNowBtnText}>{syncingNow ? 'Syncing...' : 'Force Sync Now'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.doneBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.doneBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  badgeConnected: {
    backgroundColor: 'rgba(46, 204, 113, 0.12)',
    borderColor: '#2ecc71',
  },
  badgeConnecting: {
    backgroundColor: 'rgba(241, 196, 15, 0.12)',
    borderColor: '#f1c40f',
  },
  badgeOffline: {
    backgroundColor: 'rgba(231, 76, 60, 0.12)',
    borderColor: '#e74c3c',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginRight: 6,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  textConnected: {
    color: '#27ae60',
  },
  textConnecting: {
    color: '#d4ac0d',
  },
  textOffline: {
    color: '#c0392b',
  },
  // ── PIN Gate ──────────────────────────────────
  lockIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(212,175,55,0.12)',
    borderWidth: 2,
    borderColor: '#D4AF37',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  pinGateTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1C1C1E',
    marginBottom: 6,
    textAlign: 'center',
  },
  pinGateSubtitle: {
    fontSize: 12,
    color: '#636366',
    textAlign: 'center',
    lineHeight: 18,
  },
  keypadGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  keypadKey: {
    width: 68,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#F2F2F7',
    borderWidth: 1,
    borderColor: '#E5E5EA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  keypadKeyAlt: {
    backgroundColor: 'rgba(74,18,26,0.08)',
    borderColor: '#4a121a',
  },
  keypadKeyText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  keypadKeyTextAlt: {
    fontSize: 14,
    color: '#4a121a',
  },
  // ── Modal ──────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  statusBox: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
  },
  boxConnected: {
    backgroundColor: '#E8F8F5',
    borderColor: '#A3E4D7',
  },
  boxOffline: {
    backgroundColor: '#FDF2F0',
    borderColor: '#FADCD8',
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  statusLabel: {
    fontSize: 13,
    color: '#636366',
    fontWeight: '500',
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dotLarge: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusValue: {
    fontSize: 12,
    fontWeight: '700',
  },
  statusValueBold: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  ipInput: {
    flex: 1,
    backgroundColor: '#F2F2F7',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  saveIpBtn: {
    backgroundColor: '#4a121a',
    paddingHorizontal: 16,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveIpBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  quickPresetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  presetChip: {
    backgroundColor: '#F2F2F7',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  presetChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4a121a',
  },
  feedbackBox: {
    backgroundColor: '#F6F3EC',
    borderWidth: 1,
    borderColor: '#E8DFC9',
    padding: 10,
    borderRadius: 8,
    marginBottom: 14,
  },
  feedbackText: {
    fontSize: 13,
    color: '#4a121a',
    fontWeight: '600',
    textAlign: 'center',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 6,
  },
  syncNowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D5A943',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  syncNowBtnText: {
    color: '#4a121a',
    fontWeight: '800',
    fontSize: 13,
  },
  doneBtn: {
    backgroundColor: '#F2F2F7',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  doneBtnText: {
    color: '#1C1C1E',
    fontWeight: '700',
    fontSize: 13,
  },
});
