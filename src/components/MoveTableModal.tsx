import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Table } from '../store/restaurantStore';
import { getTableFloor, getTableSeatingType } from '../constants/floors';
import SeatingTypeIcon from './SeatingTypeIcon';

const MOVE_REASON_PRESETS = [
  'Guest Request',
  'Bigger Group / More Seats',
  'AC / Fan Issue',
  'Family Majlis Shift',
  'Window / Quiet Spot',
  'Joined Party',
];

interface MoveTableModalProps {
  visible: boolean;
  sourceTable: Table | null;
  availableTables: Table[];
  onClose: () => void;
  onConfirmMove: (targetTable: Table, note: string) => void;
}

export default function MoveTableModal({
  visible,
  sourceTable,
  availableTables,
  onClose,
  onConfirmMove,
}: MoveTableModalProps) {
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [moveNote, setMoveNote] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (visible) {
      setSelectedTargetId(null);
      setMoveNote('');
      setSearchQuery('');
      setErrorMsg('');
    }
  }, [visible, sourceTable?.id]);

  const filteredTables = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return availableTables.filter((t) => {
      if (!q) return true;
      const floor = getTableFloor(t).toLowerCase();
      return t.name.toLowerCase().includes(q) || floor.includes(q);
    });
  }, [availableTables, searchQuery]);

  const selectedTarget = useMemo(
    () => availableTables.find((t) => t.id === selectedTargetId) || null,
    [availableTables, selectedTargetId]
  );

  const togglePreset = (preset: string) => {
    setErrorMsg('');
    setMoveNote((prev) => {
      const tokens = prev
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const exists = tokens.some((t) => t.toLowerCase() === preset.toLowerCase());
      if (exists) {
        return tokens.filter((t) => t.toLowerCase() !== preset.toLowerCase()).join(', ');
      }
      return [...tokens, preset].join(', ');
    });
  };

  const hasPreset = (preset: string) =>
    moveNote
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .includes(preset.toLowerCase());

  const handleConfirm = () => {
    if (!selectedTarget) {
      setErrorMsg('Pehle destination (khali) table select karein.');
      return;
    }
    const cleanNote = moveNote.trim();
    if (!cleanNote) {
      setErrorMsg('Table move karne ki wajah / note likhein (ya upar quick reason select karein) taake System Log mein record ho.');
      return;
    }
    onConfirmMove(selectedTarget, cleanNote);
  };

  if (!sourceTable) return null;

  const sourceFloor = getTableFloor(sourceTable);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.headerIconOrb}>
                <Ionicons name="swap-horizontal" size={20} color="#D4AF37" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>Move / Transfer Table</Text>
                <Text style={styles.subtitle}>
                  From: {sourceTable.name} ({sourceFloor} • {sourceTable.seats} Seats)
                </Text>
              </View>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Ionicons name="close" size={20} color="#475569" />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 520 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Step 1: Select Destination Available Table */}
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionLabel}>1. SELECT AVAILABLE DESTINATION TABLE ({filteredTables.length})</Text>
            </View>

            <View style={styles.searchBox}>
              <Ionicons name="search" size={14} color="#64748B" />
              <TextInput
                style={[styles.searchInput, Platform.OS === 'web' && ({ outlineStyle: 'none' } as any)]}
                placeholder="Search table or floor (e.g. T-08, Majlis, Rooftop)..."
                placeholderTextColor="#94A3B8"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={15} color="#94A3B8" />
                </TouchableOpacity>
              )}
            </View>

            {filteredTables.length === 0 ? (
              <View style={styles.emptyBox}>
                <Ionicons name="business-outline" size={28} color="#CBD5E1" />
                <Text style={styles.emptyText}>No available tables match your search.</Text>
              </View>
            ) : (
              <View style={styles.tableGrid}>
                {filteredTables.map((t) => {
                  const isSelected = t.id === selectedTargetId;
                  const sType = getTableSeatingType(t);
                  const fName = getTableFloor(t);
                  return (
                    <TouchableOpacity
                      key={t.id}
                      style={[styles.tableTile, isSelected && styles.tableTileSelected]}
                      onPress={() => {
                        setSelectedTargetId(t.id);
                        setErrorMsg('');
                      }}
                      activeOpacity={0.8}
                    >
                      <View style={styles.tableTileTop}>
                        <SeatingTypeIcon
                          type={sType}
                          size={15}
                          color={isSelected ? '#F3D179' : '#52141C'}
                        />
                        {isSelected && <Ionicons name="checkmark-circle" size={16} color="#F3D179" />}
                      </View>
                      <Text
                        style={[styles.tableTileName, isSelected && styles.tableTileNameSelected]}
                        numberOfLines={1}
                      >
                        {t.name}
                      </Text>
                      <Text
                        style={[styles.tableTileMeta, isSelected && styles.tableTileMetaSelected]}
                        numberOfLines={1}
                      >
                        {fName} • {t.seats}G
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Step 2: Move Note / Reason (Logged to System Logs & KDS) */}
            <View style={[styles.sectionHeaderRow, { marginTop: 14 }]}>
              <Text style={styles.sectionLabel}>2. MOVE NOTE / REASON (RECORDED IN SYSTEM LOGS)</Text>
              <Text style={styles.requiredBadge}>REQUIRED</Text>
            </View>

            <View style={styles.presetsWrap}>
              {MOVE_REASON_PRESETS.map((preset) => {
                const active = hasPreset(preset);
                return (
                  <TouchableOpacity
                    key={preset}
                    style={[styles.presetChip, active && styles.presetChipActive]}
                    onPress={() => togglePreset(preset)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.presetChipText, active && styles.presetChipTextActive]}>
                      {preset}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TextInput
              style={[styles.noteInput, Platform.OS === 'web' && ({ outlineStyle: 'none' } as any)]}
              placeholder="Write custom move note (e.g. Guest asked for AC table, family expanded to 8 persons)..."
              placeholderTextColor="#94A3B8"
              value={moveNote}
              onChangeText={(txt) => {
                setMoveNote(txt);
                if (errorMsg) setErrorMsg('');
              }}
              multiline
              numberOfLines={2}
            />

            {errorMsg ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={15} color="#DC2626" />
                <Text style={styles.errorText}>{errorMsg}</Text>
              </View>
            ) : null}

            {/* Move Preview Summary */}
            {selectedTarget && (
              <View style={styles.previewBanner}>
                <Ionicons name="shield-checkmark" size={16} color="#047857" />
                <Text style={styles.previewText}>
                  Moving <Text style={{ fontWeight: '900' }}>{sourceTable.name}</Text> ➔{' '}
                  <Text style={{ fontWeight: '900' }}>{selectedTarget.name}</Text> (all active KOTs & order items move automatically + System Log created)
                </Text>
              </View>
            )}
          </ScrollView>

          {/* Footer Buttons */}
          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.confirmBtn,
                (!selectedTarget || !moveNote.trim()) && styles.confirmBtnDisabled,
              ]}
              onPress={handleConfirm}
              activeOpacity={0.85}
            >
              <Ionicons name="swap-horizontal" size={16} color="#FFFFFF" />
              <Text style={styles.confirmBtnText}>
                {selectedTarget ? `Move to ${selectedTarget.name}` : 'Confirm Move Table'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.68)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 580,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(212, 175, 55, 0.4)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  headerIconOrb: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: '#24050A',
    borderWidth: 1,
    borderColor: '#D4AF37',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    marginTop: 1,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: '#52141C',
    letterSpacing: 0.5,
  },
  requiredBadge: {
    fontSize: 9.5,
    fontWeight: '900',
    color: '#B45309',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 38,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  tableGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tableTile: {
    width: '31.5%',
    minWidth: 112,
    flexGrow: 1,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 11,
    padding: 10,
    gap: 3,
  },
  tableTileSelected: {
    backgroundColor: '#52141C',
    borderColor: '#D4AF37',
  },
  tableTileTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  tableTileName: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#0F172A',
  },
  tableTileNameSelected: {
    color: '#FFFFFF',
  },
  tableTileMeta: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  tableTileMetaSelected: {
    color: '#F3D179',
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 22,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyText: {
    fontSize: 12.5,
    color: '#64748B',
    marginTop: 6,
    fontWeight: '600',
  },
  presetsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  presetChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  presetChipActive: {
    backgroundColor: '#52141C',
    borderColor: '#D4AF37',
  },
  presetChipText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#334155',
  },
  presetChipTextActive: {
    color: '#F3D179',
    fontWeight: '800',
  },
  noteInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
    minHeight: 62,
    textAlignVertical: 'top',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
  },
  previewBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  previewText: {
    flex: 1,
    fontSize: 12,
    color: '#065F46',
    lineHeight: 17,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#475569',
  },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#52141C',
    borderWidth: 1,
    borderColor: '#D4AF37',
  },
  confirmBtnDisabled: {
    opacity: 0.55,
  },
  confirmBtnText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#FFFFFF',
  },
});
