import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Platform,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  useRestaurantStore,
  StaffMember,
  StaffAttendanceStatus,
  AttendanceRecord,
} from '../../store/restaurantStore';
import { broadcastImmediately } from '../../services/syncService';

const STATUS_CONFIG: Record<
  StaffAttendanceStatus,
  { label: string; urdu: string; color: string; bg: string; icon: any }
> = {
  Present: { label: 'Present', urdu: 'حاضر', color: '#059669', bg: '#ECFDF5', icon: 'checkmark-circle' },
  Late: { label: 'Late', urdu: 'لیٹ', color: '#D97706', bg: '#FEF3C7', icon: 'time' },
  Absent: { label: 'Absent', urdu: 'غیر حاضر', color: '#DC2626', bg: '#FEE2E2', icon: 'close-circle' },
  'Half Day': { label: 'Half Day', urdu: 'نصف دن', color: '#2563EB', bg: '#EFF6FF', icon: 'contrast' },
  'On Leave': { label: 'On Leave', urdu: 'چھٹی', color: '#7C3AED', bg: '#F5F3FF', icon: 'calendar' },
};

export default function AttendanceTab() {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const staff = useRestaurantStore((state) => state.staff) || [];
  const attendance = useRestaurantStore((state) => state.attendance) || [];
  const markAttendance = useRestaurantStore((state) => state.markAttendance);

  // Selected Date (defaults to today in YYYY-MM-DD format)
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Draft attendance state keyed by staffId
  const [draftState, setDraftState] = useState<
    Record<
      string,
      {
        status: StaffAttendanceStatus;
        checkIn: string;
        checkOut: string;
        overtimeHours: string;
        lateMinutes: string;
        notes: string;
      }
    >
  >({});

  // When selectedDate or attendance changes, populate draftState for active staff
  useEffect(() => {
    const newDraft: typeof draftState = {};
    staff.forEach((member) => {
      const existing = attendance.find(
        (a) => a.staffId === member.id && a.date === selectedDate
      );
      if (existing) {
        newDraft[member.id] = {
          status: existing.status,
          checkIn: existing.checkIn || '',
          checkOut: existing.checkOut || '',
          overtimeHours: existing.overtimeHours ? existing.overtimeHours.toString() : '0',
          lateMinutes: existing.lateMinutes ? existing.lateMinutes.toString() : '0',
          notes: existing.notes || '',
        };
      } else {
        // Defaults if no attendance recorded yet for this date
        const isDefaultOnLeave = member.status === 'On Leave';
        const defaultCheckIn = member.shift === 'Morning' ? '09:00 AM' : member.shift === 'Evening' ? '04:00 PM' : '10:00 PM';
        const defaultCheckOut = member.shift === 'Morning' ? '05:00 PM' : member.shift === 'Evening' ? '12:00 AM' : '06:00 AM';

        newDraft[member.id] = {
          status: isDefaultOnLeave ? 'On Leave' : 'Present',
          checkIn: isDefaultOnLeave ? '' : defaultCheckIn,
          checkOut: isDefaultOnLeave ? '' : defaultCheckOut,
          overtimeHours: '0',
          lateMinutes: '0',
          notes: isDefaultOnLeave ? 'Approved leave' : '',
        };
      }
    });
    setDraftState(newDraft);
  }, [selectedDate, staff, attendance]);

  // Date Navigation
  const changeDateByDays = (delta: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + delta);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const jumpToToday = () => {
    setSelectedDate(new Date().toISOString().split('T')[0]);
  };

  const formattedDateTitle = useMemo(() => {
    try {
      const d = new Date(selectedDate + 'T00:00:00');
      const todayStr = new Date().toISOString().split('T')[0];
      const prefix = selectedDate === todayStr ? 'Today - ' : '';
      return prefix + d.toLocaleDateString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return selectedDate;
    }
  }, [selectedDate]);

  // KPIs for the selected date
  const kpiStats = useMemo(() => {
    let present = 0;
    let late = 0;
    let absent = 0;
    let halfDay = 0;
    let leave = 0;

    Object.values(draftState).forEach((item) => {
      if (item.status === 'Present') present++;
      else if (item.status === 'Late') late++;
      else if (item.status === 'Absent') absent++;
      else if (item.status === 'Half Day') halfDay++;
      else if (item.status === 'On Leave') leave++;
    });

    const activeCount = staff.filter((s) => s.status !== 'Inactive').length;
    const rate = activeCount > 0 ? Math.round(((present + late + halfDay * 0.5) / activeCount) * 100) : 0;

    return { present, late, absent, halfDay, leave, rate, total: staff.length };
  }, [draftState, staff]);

  // Update a single field in draft
  const updateDraft = (
    staffId: string,
    field: 'status' | 'checkIn' | 'checkOut' | 'overtimeHours' | 'lateMinutes' | 'notes',
    value: string
  ) => {
    setDraftState((prev) => ({
      ...prev,
      [staffId]: {
        ...(prev[staffId] || {
          status: 'Present',
          checkIn: '09:00 AM',
          checkOut: '06:00 PM',
          overtimeHours: '0',
          lateMinutes: '0',
          notes: '',
        }),
        [field]: value,
      },
    }));
  };

  // Stamp current time
  const stampCurrentTime = (staffId: string, field: 'checkIn' | 'checkOut') => {
    const now = new Date();
    let hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    const timeStr = `${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
    updateDraft(staffId, field, timeStr);
  };

  // Mark All Present Shortcut
  const handleMarkAllPresent = () => {
    setDraftState((prev) => {
      const next = { ...prev };
      staff.forEach((m) => {
        if (m.status !== 'Inactive') {
          next[m.id] = {
            ...(next[m.id] || {}),
            status: 'Present',
            checkIn: next[m.id]?.checkIn || '09:00 AM',
            checkOut: next[m.id]?.checkOut || '06:00 PM',
            overtimeHours: '0',
            lateMinutes: '0',
            notes: '',
          };
        }
      });
      return next;
    });

    const msg = 'All active staff marked as Present in register!';
    if (Platform.OS === 'web') {
      setSaveSuccessMsg(msg);
      setTimeout(() => setSaveSuccessMsg(null), 3000);
    }
  };

  // Save Attendance to Store & Sync
  const handleSaveAttendance = () => {
    const recordsToSave: Omit<AttendanceRecord, 'id' | 'recordedAt'>[] = [];

    staff.forEach((m) => {
      const item = draftState[m.id];
      if (item) {
        recordsToSave.push({
          staffId: m.id,
          staffName: m.name,
          date: selectedDate,
          checkIn: item.checkIn.trim() || undefined,
          checkOut: item.checkOut.trim() || undefined,
          status: item.status,
          overtimeHours: parseFloat(item.overtimeHours) || 0,
          lateMinutes: parseInt(item.lateMinutes, 10) || 0,
          notes: item.notes.trim() || undefined,
        });
      }
    });

    markAttendance(recordsToSave);
    broadcastImmediately();

    setSaveSuccessMsg(`Attendance saved & synced for ${formattedDateTitle}!`);
    setTimeout(() => setSaveSuccessMsg(null), 4000);
  };

  return (
    <View style={styles.container}>
      {/* Date Control Bar */}
      <View style={styles.dateBar}>
        <View style={styles.dateNavGroup}>
          <TouchableOpacity
            style={styles.dateArrowBtn}
            onPress={() => changeDateByDays(-1)}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={18} color="#52171B" />
          </TouchableOpacity>

          <View style={styles.dateTitleBox}>
            <Ionicons name="calendar" size={18} color="#52171B" />
            <Text style={styles.dateTitleText}>{formattedDateTitle}</Text>
          </View>

          <TouchableOpacity
            style={styles.dateArrowBtn}
            onPress={() => changeDateByDays(1)}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-forward" size={18} color="#52171B" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.todayBtn} onPress={jumpToToday}>
            <Text style={styles.todayBtnText}>Today</Text>
          </TouchableOpacity>
        </View>

        {/* Action Buttons */}
        <View style={styles.topActionsGroup}>
          <TouchableOpacity
            style={styles.allPresentBtn}
            onPress={handleMarkAllPresent}
            activeOpacity={0.7}
          >
            <Ionicons name="flash" size={15} color="#059669" />
            <Text style={styles.allPresentBtnText}>Mark All Present</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.saveBtn}
            onPress={handleSaveAttendance}
            activeOpacity={0.7}
          >
            <Ionicons name="save-outline" size={16} color="#FFFFFF" />
            <Text style={styles.saveBtnText}>Save Attendance</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Success Notification Alert */}
      {saveSuccessMsg ? (
        <View style={styles.successBanner}>
          <Ionicons name="checkmark-circle" size={18} color="#059669" />
          <Text style={styles.successBannerText}>{saveSuccessMsg}</Text>
        </View>
      ) : null}

      {/* Daily Attendance KPIs */}
      <View style={styles.kpiRow}>
        <View style={[styles.kpiCard, { borderColor: '#A7F3D0', backgroundColor: '#ECFDF5' }]}>
          <View style={[styles.kpiIconOrb, { backgroundColor: '#D1FAE5' }]}>
            <Ionicons name="checkmark-circle" size={20} color="#059669" />
          </View>
          <View>
            <Text style={[styles.kpiValue, { color: '#065F46' }]}>{kpiStats.present}</Text>
            <Text style={styles.kpiLabel}>Present (حاضر)</Text>
          </View>
        </View>

        <View style={[styles.kpiCard, { borderColor: '#FDE68A', backgroundColor: '#FEF3C7' }]}>
          <View style={[styles.kpiIconOrb, { backgroundColor: '#FDE68A' }]}>
            <Ionicons name="time" size={20} color="#D97706" />
          </View>
          <View>
            <Text style={[styles.kpiValue, { color: '#92400E' }]}>{kpiStats.late}</Text>
            <Text style={styles.kpiLabel}>Late (لیٹ)</Text>
          </View>
        </View>

        <View style={[styles.kpiCard, { borderColor: '#FECACA', backgroundColor: '#FEE2E2' }]}>
          <View style={[styles.kpiIconOrb, { backgroundColor: '#FEE2E2' }]}>
            <Ionicons name="close-circle" size={20} color="#DC2626" />
          </View>
          <View>
            <Text style={[styles.kpiValue, { color: '#991B1B' }]}>{kpiStats.absent}</Text>
            <Text style={styles.kpiLabel}>Absent (غیر حاضر)</Text>
          </View>
        </View>

        <View style={[styles.kpiCard, { borderColor: '#DDD6FE', backgroundColor: '#F5F3FF' }]}>
          <View style={[styles.kpiIconOrb, { backgroundColor: '#EDE9FE' }]}>
            <Ionicons name="calendar-outline" size={20} color="#7C3AED" />
          </View>
          <View>
            <Text style={[styles.kpiValue, { color: '#5B21B6' }]}>{kpiStats.leave}</Text>
            <Text style={styles.kpiLabel}>On Leave (چھٹی)</Text>
          </View>
        </View>

        <View style={[styles.kpiCard, { borderColor: '#FED7AA', backgroundColor: '#FFF7ED' }]}>
          <View style={[styles.kpiIconOrb, { backgroundColor: '#FFEDD5' }]}>
            <Ionicons name="stats-chart" size={20} color="#EA580C" />
          </View>
          <View>
            <Text style={[styles.kpiValue, { color: '#9A3412' }]}>{kpiStats.rate}%</Text>
            <Text style={styles.kpiLabel}>Attendance Rate</Text>
          </View>
        </View>
      </View>

      {/* Attendance Register (Table for Desktop / Cards for Mobile) */}
      {isMobile ? (
        <View style={styles.mobileList}>
          {staff.map((member) => {
            const draft = draftState[member.id] || {
              status: 'Present',
              checkIn: '09:00 AM',
              checkOut: '06:00 PM',
              overtimeHours: '0',
              lateMinutes: '0',
              notes: '',
            };
            const statusConfig = STATUS_CONFIG[draft.status];

            return (
              <View key={member.id} style={styles.mobileCard}>
                <View style={styles.mobileCardHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={styles.avatarBox}>
                      <Text style={styles.avatarText}>
                        {member.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View>
                      <Text style={styles.staffName}>{member.name}</Text>
                      <Text style={styles.staffRole}>{member.role} • {member.shift}</Text>
                    </View>
                  </View>

                  <View style={[styles.statusBadge, { backgroundColor: statusConfig.bg }]}>
                    <Ionicons name={statusConfig.icon} size={13} color={statusConfig.color} />
                    <Text style={[styles.statusBadgeText, { color: statusConfig.color }]}>
                      {statusConfig.label} ({statusConfig.urdu})
                    </Text>
                  </View>
                </View>

                {/* Status Selector Pills */}
                <View style={styles.statusPillsRow}>
                  {(Object.keys(STATUS_CONFIG) as StaffAttendanceStatus[]).map((st) => {
                    const cfg = STATUS_CONFIG[st];
                    const isSelected = draft.status === st;
                    return (
                      <TouchableOpacity
                        key={st}
                        style={[
                          styles.statusPill,
                          isSelected && { backgroundColor: cfg.color, borderColor: cfg.color },
                        ]}
                        onPress={() => updateDraft(member.id, 'status', st)}
                      >
                        <Text style={[styles.statusPillText, isSelected && { color: '#FFFFFF' }]}>
                          {cfg.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Check In / Out Inputs */}
                <View style={styles.timeInputsRow}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.timeLabelRow}>
                      <Text style={styles.inputMiniLabel}>Check In</Text>
                      <TouchableOpacity onPress={() => stampCurrentTime(member.id, 'checkIn')}>
                        <Text style={styles.stampNowText}>Now</Text>
                      </TouchableOpacity>
                    </View>
                    <TextInput
                      style={styles.timeInput}
                      value={draft.checkIn}
                      placeholder="09:00 AM"
                      onChangeText={(val) => updateDraft(member.id, 'checkIn', val)}
                    />
                  </View>

                  <View style={{ flex: 1 }}>
                    <View style={styles.timeLabelRow}>
                      <Text style={styles.inputMiniLabel}>Check Out</Text>
                      <TouchableOpacity onPress={() => stampCurrentTime(member.id, 'checkOut')}>
                        <Text style={styles.stampNowText}>Now</Text>
                      </TouchableOpacity>
                    </View>
                    <TextInput
                      style={styles.timeInput}
                      value={draft.checkOut}
                      placeholder="06:00 PM"
                      onChangeText={(val) => updateDraft(member.id, 'checkOut', val)}
                    />
                  </View>

                  <View style={{ width: 70 }}>
                    <Text style={styles.inputMiniLabel}>OT (Hrs)</Text>
                    <TextInput
                      style={styles.timeInput}
                      keyboardType="numeric"
                      value={draft.overtimeHours}
                      placeholder="0"
                      onChangeText={(val) => updateDraft(member.id, 'overtimeHours', val)}
                    />
                  </View>
                </View>

                {/* Notes Input */}
                <TextInput
                  style={styles.notesInput}
                  placeholder="Notes / Reason (e.g. Traffic delay, Permission)..."
                  value={draft.notes}
                  onChangeText={(val) => updateDraft(member.id, 'notes', val)}
                />
              </View>
            );
          })}
        </View>
      ) : (
        /* Desktop Table View */
        <View style={styles.tableCard}>
          <View style={styles.tableHeader}>
            <Text style={[styles.thText, { flex: 2 }]}>EMPLOYEE & ROLE</Text>
            <Text style={[styles.thText, { flex: 2.8 }]}>ATTENDANCE STATUS</Text>
            <Text style={[styles.thText, { flex: 1.5 }]}>CHECK-IN</Text>
            <Text style={[styles.thText, { flex: 1.5 }]}>CHECK-OUT</Text>
            <Text style={[styles.thText, { flex: 1 }]}>OT (HRS)</Text>
            <Text style={[styles.thText, { flex: 2.2 }]}>REMARKS / NOTES</Text>
          </View>

          {staff.map((member) => {
            const draft = draftState[member.id] || {
              status: 'Present',
              checkIn: '09:00 AM',
              checkOut: '06:00 PM',
              overtimeHours: '0',
              lateMinutes: '0',
              notes: '',
            };

            return (
              <View key={member.id} style={styles.tableRow}>
                {/* Employee Info */}
                <View style={[styles.cell, { flex: 2, flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
                  <View style={styles.avatarBox}>
                    <Text style={styles.avatarText}>
                      {member.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View>
                    <Text style={styles.staffName}>{member.name}</Text>
                    <Text style={styles.staffRole}>
                      {member.designation || member.role} • {member.shift}
                    </Text>
                  </View>
                </View>

                {/* Status Selector */}
                <View style={[styles.cell, { flex: 2.8 }]}>
                  <View style={styles.statusPillsRow}>
                    {(Object.keys(STATUS_CONFIG) as StaffAttendanceStatus[]).map((st) => {
                      const cfg = STATUS_CONFIG[st];
                      const isSelected = draft.status === st;
                      return (
                        <TouchableOpacity
                          key={st}
                          style={[
                            styles.statusPill,
                            isSelected && { backgroundColor: cfg.color, borderColor: cfg.color },
                          ]}
                          onPress={() => updateDraft(member.id, 'status', st)}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.statusPillText, isSelected && { color: '#FFFFFF' }]}>
                            {cfg.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* Check In */}
                <View style={[styles.cell, { flex: 1.5 }]}>
                  <View style={styles.timeInputContainer}>
                    <TextInput
                      style={styles.tableInput}
                      value={draft.checkIn}
                      placeholder="09:00 AM"
                      onChangeText={(val) => updateDraft(member.id, 'checkIn', val)}
                    />
                    <TouchableOpacity
                      style={styles.stampBtn}
                      onPress={() => stampCurrentTime(member.id, 'checkIn')}
                    >
                      <Ionicons name="time-outline" size={14} color="#52171B" />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Check Out */}
                <View style={[styles.cell, { flex: 1.5 }]}>
                  <View style={styles.timeInputContainer}>
                    <TextInput
                      style={styles.tableInput}
                      value={draft.checkOut}
                      placeholder="06:00 PM"
                      onChangeText={(val) => updateDraft(member.id, 'checkOut', val)}
                    />
                    <TouchableOpacity
                      style={styles.stampBtn}
                      onPress={() => stampCurrentTime(member.id, 'checkOut')}
                    >
                      <Ionicons name="time-outline" size={14} color="#52171B" />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Overtime */}
                <View style={[styles.cell, { flex: 1 }]}>
                  <TextInput
                    style={[styles.tableInput, { textAlign: 'center' }]}
                    keyboardType="numeric"
                    value={draft.overtimeHours}
                    placeholder="0"
                    onChangeText={(val) => updateDraft(member.id, 'overtimeHours', val)}
                  />
                </View>

                {/* Notes */}
                <View style={[styles.cell, { flex: 2.2 }]}>
                  <TextInput
                    style={styles.tableInput}
                    placeholder="Optional remarks..."
                    value={draft.notes}
                    onChangeText={(val) => updateDraft(member.id, 'notes', val)}
                  />
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Floating Save Footer */}
      <View style={styles.footerBar}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="cloud-upload-outline" size={18} color="#64748B" />
          <Text style={styles.footerHint}>
            Changes will be saved to attendance register and reflected in monthly payroll.
          </Text>
        </View>
        <TouchableOpacity style={styles.footerSaveBtn} onPress={handleSaveAttendance}>
          <Ionicons name="checkmark-done" size={18} color="#FFFFFF" />
          <Text style={styles.footerSaveText}>Save Attendance Register</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 40,
  },
  dateBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  dateNavGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  dateArrowBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateTitleBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF9F5',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  dateTitleText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#52171B',
  },
  todayBtn: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  todayBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  topActionsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
  },
  allPresentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  allPresentBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#059669',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#52171B',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  saveBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    borderWidth: 1,
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  successBannerText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#065F46',
  },
  kpiRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  kpiCard: {
    flex: 1,
    minWidth: 140,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  kpiIconOrb: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiValue: {
    fontSize: 18,
    fontWeight: '900',
  },
  kpiLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    marginTop: 1,
  },
  tableCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    marginBottom: 16,
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  thText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  cell: {
    paddingHorizontal: 4,
  },
  avatarBox: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#B48214',
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#52171B',
  },
  staffName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E293B',
  },
  staffRole: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  statusPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
  timeInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 6,
    paddingHorizontal: 6,
  },
  tableInput: {
    flex: 1,
    fontSize: 12,
    color: '#1E293B',
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  stampBtn: {
    padding: 4,
  },
  mobileList: {
    gap: 12,
    marginBottom: 16,
  },
  mobileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    gap: 10,
  },
  mobileCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  timeInputsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  timeLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  inputMiniLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
  },
  stampNowText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#007AFF',
  },
  timeInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    fontSize: 12,
    color: '#1E293B',
  },
  notesInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12,
    color: '#1E293B',
  },
  footerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  footerHint: {
    fontSize: 12,
    color: '#64748B',
  },
  footerSaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#059669',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  footerSaveText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
