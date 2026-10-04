import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  useWindowDimensions,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useOpsStore, ServiceRequest, ServiceRequestType, SERVICE_REQUEST_META } from '../store/opsStore';
import { useRestaurantStore } from '../store/restaurantStore';
import { useAuthStore } from '../store/authStore';
import { BRAND } from '../constants/brand';
import { elapsed, formatTime } from '../utils/format';

export default function ServiceRequestsScreen({ backRoute = '/manager/dashboard' }: { backRoute?: string }) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const user = useAuthStore((s) => s.user);
  const tables = useRestaurantStore((s) => s.tables) || [];
  const requests = useOpsStore((s) => s.serviceRequests) || [];
  const addRequest = useOpsStore((s) => s.addServiceRequest);
  const acknowledge = useOpsStore((s) => s.acknowledgeRequest);
  const resolve = useOpsStore((s) => s.resolveRequest);
  const clearResolved = useOpsStore((s) => s.clearResolvedRequests);

  const [filter, setFilter] = useState<'active' | 'resolved' | 'all'>('active');
  const [now] = useState(() => Date.now());

  // Quick Dispatch modal state for staff
  const [selectedTableId, setSelectedTableId] = useState<string>(tables[0]?.id || '1');
  const [selectedType, setSelectedType] = useState<ServiceRequestType>('call_waiter');
  const [note, setNote] = useState('');

  const activeCount = requests.filter((r) => r.status !== 'resolved').length;
  const pendingCount = requests.filter((r) => r.status === 'pending').length;

  const filteredRequests = requests.filter((r) => {
    if (filter === 'active') return r.status !== 'resolved';
    if (filter === 'resolved') return r.status === 'resolved';
    return true;
  });

  const handleSendManual = () => {
    const table = tables.find((t) => t.id === selectedTableId);
    if (!table) return;

    const ok = addRequest({
      tableId: table.id,
      tableName: table.name,
      zone: table.zone || 'Ground Floor',
      type: selectedType,
      note: note.trim() || undefined,
      source: 'staff',
    });

    if (ok) {
      setNote('');
      const msg = `Service request sent for ${table.name}!`;
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Request Sent', msg);
    } else {
      const msg = `An active ${SERVICE_REQUEST_META[selectedType].label} request already exists for ${table.name}.`;
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Duplicate', msg);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => (router.canGoBack() ? router.back() : router.replace(backRoute as any))}
        >
          <Ionicons name="arrow-back" size={20} color={BRAND.ink} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Guest Service Calls</Text>
          <Text style={styles.headerSubtitle}>
            Live Waiter Bells, Water Refills & Table Requests
          </Text>
        </View>
        {requests.some((r) => r.status === 'resolved') && (
          <TouchableOpacity style={styles.clearBtn} onPress={clearResolved}>
            <Text style={styles.clearBtnText}>Clear History</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Alert KPI Card */}
      <View style={styles.statusBanner}>
        <View style={[styles.statusIconCircle, { backgroundColor: pendingCount > 0 ? '#D32F2F' : BRAND.success }]}>
          <Ionicons name={pendingCount > 0 ? 'notifications' : 'checkmark-done'} size={24} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.statusTitle}>
            {pendingCount > 0 ? `${pendingCount} Urgent Calls Awaiting Staff` : 'All Tables Attended'}
          </Text>
          <Text style={styles.statusDesc}>
            {activeCount} total active service requests across all 5 floors
          </Text>
        </View>
      </View>

      {/* Manual Dispatcher (Staff can trigger bell for any table) */}
      <View style={styles.dispatchCard}>
        <Text style={styles.dispatchTitle}>Dispatch Table Request / Bell</Text>
        <Text style={styles.dispatchDesc}>
          Select table and request type to notify servers on duty:
        </Text>

        <Text style={styles.inputLabel}>1. Select Table</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillsScroll}>
          {tables.map((t) => {
            const isSel = t.id === selectedTableId;
            return (
              <TouchableOpacity
                key={t.id}
                style={[styles.tablePill, isSel && styles.tablePillActive]}
                onPress={() => setSelectedTableId(t.id)}
              >
                <Text style={[styles.tablePillText, isSel && styles.tablePillTextActive]}>
                  {t.name} ({t.zone || 'GF'})
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <Text style={styles.inputLabel}>2. Request Type</Text>
        <View style={styles.typeGrid}>
          {(Object.keys(SERVICE_REQUEST_META) as ServiceRequestType[]).map((type) => {
            const meta = SERVICE_REQUEST_META[type];
            const isSel = selectedType === type;
            return (
              <TouchableOpacity
                key={type}
                style={[
                  styles.typeBtn,
                  isSel && { borderColor: meta.color, backgroundColor: meta.color + '15' },
                ]}
                onPress={() => setSelectedType(type)}
              >
                <Ionicons name={meta.icon as any} size={18} color={meta.color} />
                <Text style={[styles.typeBtnText, isSel && { color: meta.color, fontWeight: '800' }]}>
                  {meta.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TextInput
          style={styles.noteInput}
          placeholder="Optional note (e.g. extra lemons, high chair needed)..."
          placeholderTextColor={BRAND.muted}
          value={note}
          onChangeText={setNote}
        />

        <TouchableOpacity style={styles.sendBtn} onPress={handleSendManual}>
          <Ionicons name="send" size={16} color="#fff" style={{ marginRight: 6 }} />
          <Text style={styles.sendBtnText}>Dispatch Bell to Waiter App</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, filter === 'active' && styles.tabActive]}
          onPress={() => setFilter('active')}
        >
          <Text style={[styles.tabText, filter === 'active' && styles.tabTextActive]}>
            Active Calls ({activeCount})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, filter === 'resolved' && styles.tabActive]}
          onPress={() => setFilter('resolved')}
        >
          <Text style={[styles.tabText, filter === 'resolved' && styles.tabTextActive]}>
            Resolved
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, filter === 'all' && styles.tabActive]}
          onPress={() => setFilter('all')}
        >
          <Text style={[styles.tabText, filter === 'all' && styles.tabTextActive]}>
            All Logs ({requests.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Requests List */}
      {filteredRequests.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="checkmark-circle-outline" size={48} color={BRAND.success} />
          <Text style={styles.emptyTitle}>No Requests</Text>
          <Text style={styles.emptySubtitle}>All guest requests on the floors are resolved.</Text>
        </View>
      ) : (
        filteredRequests.map((req) => {
          const meta = SERVICE_REQUEST_META[req.type] || SERVICE_REQUEST_META.other;
          const isPending = req.status === 'pending';
          const isAck = req.status === 'acknowledged';

          return (
            <View
              key={req.id}
              style={[
                styles.requestCard,
                isPending && { borderLeftColor: '#D32F2F', borderLeftWidth: 5 },
                isAck && { borderLeftColor: '#FF9800', borderLeftWidth: 5 },
              ]}
            >
              <View style={styles.cardHeader}>
                <View style={[styles.typeIconBox, { backgroundColor: meta.color + '15' }]}>
                  <Ionicons name={meta.icon as any} size={22} color={meta.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={styles.reqTableName}>{req.tableName}</Text>
                    <View style={styles.zoneTag}>
                      <Text style={styles.zoneTagText}>{req.zone}</Text>
                    </View>
                  </View>
                  <Text style={[styles.reqTypeLabel, { color: meta.color }]}>{meta.label}</Text>
                </View>

                <View style={styles.cardRight}>
                  <Text style={styles.elapsedText}>{elapsed(req.createdAt, now)}</Text>
                  <View
                    style={[
                      styles.statusPill,
                      isPending && { backgroundColor: '#FFEBEE' },
                      isAck && { backgroundColor: '#FFF3E0' },
                      req.status === 'resolved' && { backgroundColor: '#E8F5E9' },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusPillText,
                        isPending && { color: '#D32F2F' },
                        isAck && { color: '#EF6C00' },
                        req.status === 'resolved' && { color: '#2E7D32' },
                      ]}
                    >
                      {req.status.toUpperCase()}
                    </Text>
                  </View>
                </View>
              </View>

              {req.note && <Text style={styles.reqNote}>"{req.note}"</Text>}

              <View style={styles.cardFooter}>
                <Text style={styles.timePlaced}>
                  Placed at {formatTime(req.createdAt)} • Source: {req.source}
                </Text>
                {req.acknowledgedBy && (
                  <Text style={styles.ackBy}>Attended by {req.acknowledgedBy}</Text>
                )}
              </View>

              {/* Action Buttons */}
              {req.status !== 'resolved' && (
                <View style={styles.actionRow}>
                  {isPending && (
                    <TouchableOpacity
                      style={styles.ackBtn}
                      onPress={() => acknowledge(req.id, user?.name || 'Staff')}
                    >
                      <Ionicons name="hand-right-outline" size={16} color="#EF6C00" style={{ marginRight: 6 }} />
                      <Text style={styles.ackBtnText}>I'm on it (Acknowledge)</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={styles.resolveBtn}
                    onPress={() => resolve(req.id)}
                  >
                    <Ionicons name="checkmark" size={16} color="#fff" style={{ marginRight: 6 }} />
                    <Text style={styles.resolveBtnText}>Mark Resolved</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: BRAND.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: BRAND.ink,
  },
  headerSubtitle: {
    fontSize: 13,
    color: BRAND.muted,
  },
  clearBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: BRAND.border,
  },
  clearBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: BRAND.muted,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BRAND.border,
    marginBottom: 20,
    gap: 14,
  },
  statusIconCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: BRAND.ink,
  },
  statusDesc: {
    fontSize: 12,
    color: BRAND.muted,
    marginTop: 2,
  },
  dispatchCard: {
    backgroundColor: '#fff',
    padding: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BRAND.border,
    marginBottom: 24,
  },
  dispatchTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: BRAND.ink,
  },
  dispatchDesc: {
    fontSize: 12,
    color: BRAND.muted,
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: BRAND.ink,
    marginTop: 8,
    marginBottom: 6,
  },
  pillsScroll: {
    marginBottom: 10,
  },
  tablePill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#F5F5F7',
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tablePillActive: {
    backgroundColor: BRAND.burgundy,
  },
  tablePillText: {
    fontSize: 12,
    fontWeight: '600',
    color: BRAND.ink,
  },
  tablePillTextActive: {
    color: '#fff',
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  typeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F5F5F7',
    borderWidth: 1,
    borderColor: 'transparent',
    gap: 6,
  },
  typeBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: BRAND.ink,
  },
  noteInput: {
    backgroundColor: '#F9F9FB',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BRAND.border,
    padding: 10,
    fontSize: 13,
    color: BRAND.ink,
    marginBottom: 12,
  },
  sendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BRAND.burgundy,
    paddingVertical: 12,
    borderRadius: 10,
  },
  sendBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: BRAND.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: BRAND.burgundy,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: BRAND.muted,
  },
  tabTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  requestCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BRAND.border,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  typeIconBox: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reqTableName: {
    fontSize: 17,
    fontWeight: '800',
    color: BRAND.ink,
  },
  zoneTag: {
    backgroundColor: '#F0F0F3',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  zoneTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: BRAND.muted,
  },
  reqTypeLabel: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  cardRight: {
    alignItems: 'flex-end',
  },
  elapsedText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#D32F2F',
    marginBottom: 4,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '800',
  },
  reqNote: {
    fontSize: 13,
    fontStyle: 'italic',
    color: BRAND.text,
    backgroundColor: '#F9F9FB',
    padding: 8,
    borderRadius: 6,
    marginTop: 10,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F5F5F7',
  },
  timePlaced: {
    fontSize: 11,
    color: BRAND.muted,
  },
  ackBy: {
    fontSize: 11,
    color: '#EF6C00',
    fontWeight: '700',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  ackBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF3E0',
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FFE082',
  },
  ackBtnText: {
    color: '#EF6C00',
    fontSize: 12,
    fontWeight: '700',
  },
  resolveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BRAND.success,
    paddingVertical: 10,
    borderRadius: 8,
  },
  resolveBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: BRAND.ink,
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 13,
    color: BRAND.muted,
    marginTop: 4,
  },
});
