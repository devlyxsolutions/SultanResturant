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

interface Props {
  compact?: boolean;
}

export default function SyncStatusBadge({ compact = false }: Props) {
  const { 
    status, 
    serverIp, 
    serverPort, 
    lastSyncedAt, 
    totalSyncedEvents, 
    forceSyncNow, 
    setCustomServerIp 
  } = useSyncStatus();

  const [modalVisible, setModalVisible] = useState(false);
  const [ipInput, setIpInput] = useState(serverIp);
  const [syncingNow, setSyncingNow] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState('');

  const isConnected = status === 'connected';
  const isConnecting = status === 'connecting';

  const handleOpenModal = () => {
    setIpInput(serverIp);
    setFeedbackMsg('');
    setModalVisible(true);
  };

  const handleSaveIp = async () => {
    if (!ipInput.trim()) return;
    setFeedbackMsg('Reconnecting to ' + ipInput.trim() + '...');
    await setCustomServerIp(ipInput.trim());
    setTimeout(() => {
      setFeedbackMsg('Server IP updated.');
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
      setFeedbackMsg('Could not reach server at ' + serverIp + ':' + serverPort);
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
                    {isConnected ? 'ONLINE & SYNCED' : (isConnecting ? 'CONNECTING...' : 'OFFLINE / LOCAL STORAGE')}
                  </Text>
                </View>
              </View>
              <View style={styles.statusRow}>
                <Text style={styles.statusLabel}>Master Hub Address:</Text>
                <Text style={styles.statusValueBold}>ws://{serverIp}:{serverPort}</Text>
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

            {/* Server IP Config */}
            <Text style={styles.sectionLabel}>Master Server IP (Host Computer):</Text>
            <View style={styles.inputRow}>
              <TextInput 
                style={styles.ipInput}
                value={ipInput}
                onChangeText={setIpInput}
                placeholder="e.g. 192.168.1.16"
                placeholderTextColor="#8E8E93"
                keyboardType="numbers-and-punctuation"
              />
              <TouchableOpacity style={styles.saveIpBtn} onPress={handleSaveIp}>
                <Text style={styles.saveIpBtnText}>Connect</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.quickPresetsRow}>
              <TouchableOpacity style={styles.presetChip} onPress={() => setIpInput('192.168.1.16')}>
                <Text style={styles.presetChipText}>Use PC Wi-Fi IP (192.168.1.16)</Text>
              </TouchableOpacity>
              {Platform.OS === 'web' && (
                <TouchableOpacity style={styles.presetChip} onPress={() => setIpInput('localhost')}>
                  <Text style={styles.presetChipText}>Use localhost</Text>
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
