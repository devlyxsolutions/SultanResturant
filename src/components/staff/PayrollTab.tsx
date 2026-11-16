import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Modal,
  Platform,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  useRestaurantStore,
  StaffMember,
  SalaryPayment,
} from '../../store/restaurantStore';
import { useSettingsStore } from '../../store/settingsStore';
import { broadcastImmediately } from '../../services/syncService';
import SalaryVoucherModal from './SalaryVoucherModal';

interface PayrollTabProps {
  canViewSalaries?: boolean;
}

export default function PayrollTab({ canViewSalaries = true }: PayrollTabProps) {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const systemSettings = useSettingsStore((state) => state.settings);
  const staff = useRestaurantStore((state) => state.staff) || [];
  const attendance = useRestaurantStore((state) => state.attendance) || [];
  const salaryPayments = useRestaurantStore((state) => state.salaryPayments) || [];
  const recordSalaryPayment = useRestaurantStore((state) => state.recordSalaryPayment);
  const deleteSalaryPayment = useRestaurantStore((state) => state.deleteSalaryPayment);

  // Month state in YYYY-MM format
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  // Modal States
  const [payModalVisible, setPayModalVisible] = useState(false);
  const [targetStaff, setTargetStaff] = useState<StaffMember | null>(null);

  // Pay Form State
  const [payBase, setPayBase] = useState('0');
  const [payBonus, setPayBonus] = useState('0');
  const [payOvertime, setPayOvertime] = useState('0');
  const [payDeductions, setPayDeductions] = useState('0');
  const [payAdvance, setPayAdvance] = useState('0');
  const [payMethod, setPayMethod] = useState<'cash' | 'bank' | 'online'>('cash');
  const [payDate, setPayDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [payNotes, setPayNotes] = useState('');
  const [formError, setFormError] = useState('');

  // Voucher Viewer State
  const [activeVoucher, setActiveVoucher] = useState<SalaryPayment | null>(null);
  const [voucherModalVisible, setVoucherModalVisible] = useState(false);

  // Change Month
  const changeMonth = (delta: number) => {
    const [yearStr, monthStr] = selectedMonth.split('-');
    let year = parseInt(yearStr, 10);
    let month = parseInt(monthStr, 10) + delta;
    if (month > 12) {
      month = 1;
      year++;
    } else if (month < 1) {
      month = 12;
      year--;
    }
    setSelectedMonth(`${year}-${String(month).padStart(2, '0')}`);
  };

  const formattedMonthTitle = useMemo(() => {
    try {
      const [y, m] = selectedMonth.split('-');
      const d = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
      return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    } catch {
      return selectedMonth;
    }
  }, [selectedMonth]);

  // Aggregate monthly payroll stats per staff member
  const staffPayrollRows = useMemo(() => {
    const stdHours = systemSettings.standardShiftHours || 8;
    return staff.map((member) => {
      const baseSalary = member.monthlySalary || 30000;
      const hourlyRate = member.hourlyRate || Math.round(baseSalary / (30 * stdHours));

      // Attendance records for this member in selectedMonth
      const monthAttendance = attendance.filter((a) => {
        return a.staffId === member.id && a.date.startsWith(selectedMonth);
      });

      let presentDays = 0;
      let absentDays = 0;
      let lateDays = 0;
      let leaveDays = 0;
      let totalOvertimeHours = 0;

      monthAttendance.forEach((rec) => {
        if (rec.status === 'Present') presentDays++;
        else if (rec.status === 'Late') {
          presentDays++;
          lateDays++;
        } else if (rec.status === 'Half Day') {
          presentDays += 0.5;
          absentDays += 0.5;
        } else if (rec.status === 'Absent') absentDays++;
        else if (rec.status === 'On Leave') leaveDays++;

        if (rec.overtimeHours) {
          totalOvertimeHours += rec.overtimeHours;
        }
      });

      // Auto deductions & overtime calculation
      const absentDeduction = Math.round((baseSalary / 30) * absentDays);
      const overtimeAmount = Math.round(totalOvertimeHours * hourlyRate);
      const estimatedNet = Math.max(0, baseSalary + overtimeAmount - absentDeduction);

      // Check if already paid for this month
      const existingPayment = salaryPayments.find(
        (p) => p.staffId === member.id && p.month === selectedMonth
      );

      return {
        member,
        baseSalary,
        hourlyRate,
        presentDays,
        absentDays,
        lateDays,
        leaveDays,
        totalOvertimeHours,
        absentDeduction,
        overtimeAmount,
        estimatedNet,
        existingPayment,
        isPaid: !!existingPayment,
      };
    });
  }, [staff, attendance, salaryPayments, selectedMonth]);

  // KPI Totals
  const payrollKPIs = useMemo(() => {
    let totalBudget = 0;
    let totalDisbursed = 0;
    let paidCount = 0;

    staffPayrollRows.forEach((row) => {
      totalBudget += row.baseSalary;
      if (row.existingPayment) {
        totalDisbursed += row.existingPayment.netPaid || 0;
        paidCount++;
      }
    });

    const totalPending = Math.max(0, totalBudget - totalDisbursed);
    return {
      totalBudget,
      totalDisbursed,
      totalPending,
      paidCount,
      totalStaff: staff.length,
    };
  }, [staffPayrollRows, staff.length]);

  // Open Pay Modal
  const openPaySalaryModal = (row: (typeof staffPayrollRows)[0]) => {
    setTargetStaff(row.member);
    setPayBase(row.baseSalary.toString());
    setPayBonus('0');
    setPayOvertime(row.overtimeAmount.toString());
    setPayDeductions(row.absentDeduction.toString());
    setPayAdvance('0');
    setPayMethod('cash');
    setPayDate(new Date().toISOString().split('T')[0]);
    setPayNotes(`Monthly salary for ${formattedMonthTitle}`);
    setFormError('');
    setPayModalVisible(true);
  };

  // Live Reactive Net Total in Modal
  const modalNetTotal = useMemo(() => {
    const b = parseFloat(payBase) || 0;
    const bon = parseFloat(payBonus) || 0;
    const ot = parseFloat(payOvertime) || 0;
    const ded = parseFloat(payDeductions) || 0;
    const adv = parseFloat(payAdvance) || 0;
    return Math.max(0, b + bon + ot - ded - adv);
  }, [payBase, payBonus, payOvertime, payDeductions, payAdvance]);

  // Record Salary Payment
  const handleConfirmPayment = () => {
    if (!targetStaff) return;
    const baseNum = parseFloat(payBase) || 0;
    if (baseNum <= 0) {
      setFormError('Please enter a valid base salary');
      return;
    }

    const newPayment = recordSalaryPayment({
      staffId: targetStaff.id,
      staffName: targetStaff.name,
      month: selectedMonth,
      paymentDate: payDate,
      baseSalary: baseNum,
      bonusAmount: parseFloat(payBonus) || 0,
      overtimeAmount: parseFloat(payOvertime) || 0,
      deductionAmount: parseFloat(payDeductions) || 0,
      advanceDeduction: parseFloat(payAdvance) || 0,
      netPaid: modalNetTotal,
      paymentMethod: payMethod,
      status: 'Paid',
      notes: payNotes.trim(),
    });

    broadcastImmediately();
    setPayModalVisible(false);

    // Open Royal Voucher view automatically
    setActiveVoucher(newPayment);
    setVoucherModalVisible(true);
  };

  // Open Voucher Viewer
  const openVoucher = (payment: SalaryPayment, member?: StaffMember) => {
    setActiveVoucher(payment);
    setTargetStaff(member || staff.find((s) => s.id === payment.staffId) || null);
    setVoucherModalVisible(true);
  };

  // Delete Voucher
  const handleDeleteVoucher = (pId: string, empName: string) => {
    const msg = `Are you sure you want to delete and void salary voucher for ${empName}?`;
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(msg)) {
        deleteSalaryPayment(pId);
        broadcastImmediately();
      }
    } else {
      Alert.alert('Void Voucher', msg, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteSalaryPayment(pId);
            broadcastImmediately();
          },
        },
      ]);
    }
  };

  return (
    <View style={styles.container}>
      {/* Month Control Bar */}
      <View style={styles.monthBar}>
        <View style={styles.monthNavGroup}>
          <TouchableOpacity
            style={styles.monthArrowBtn}
            onPress={() => changeMonth(-1)}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={18} color="#52171B" />
          </TouchableOpacity>

          <View style={styles.monthTitleBox}>
            <Ionicons name="calendar-outline" size={18} color="#52171B" />
            <Text style={styles.monthTitleText}>{formattedMonthTitle}</Text>
          </View>

          <TouchableOpacity
            style={styles.monthArrowBtn}
            onPress={() => changeMonth(1)}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-forward" size={18} color="#52171B" />
          </TouchableOpacity>
        </View>

        <View style={styles.monthRightBadge}>
          <Text style={styles.monthBadgeText}>
            PAID: {payrollKPIs.paidCount} / {payrollKPIs.totalStaff} EMPLOYEES
          </Text>
        </View>
      </View>

      {/* KPI Cards Row */}
      <View style={styles.kpiRow}>
        <View style={[styles.kpiCard, { backgroundColor: '#F8FAFC', borderColor: '#E2E8F0' }]}>
          <View style={[styles.kpiIconOrb, { backgroundColor: '#E2E8F0' }]}>
            <Ionicons name="briefcase-outline" size={20} color="#334155" />
          </View>
          <View>
            <Text style={[styles.kpiValue, { color: '#0F172A' }]}>
              {canViewSalaries ? `Rs. ${payrollKPIs.totalBudget.toLocaleString()}` : '••••••'}
            </Text>
            <Text style={styles.kpiLabel}>Total Monthly Payroll</Text>
          </View>
        </View>

        <View style={[styles.kpiCard, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
          <View style={[styles.kpiIconOrb, { backgroundColor: '#D1FAE5' }]}>
            <Ionicons name="checkmark-done-circle" size={20} color="#059669" />
          </View>
          <View>
            <Text style={[styles.kpiValue, { color: '#065F46' }]}>
              {canViewSalaries ? `Rs. ${payrollKPIs.totalDisbursed.toLocaleString()}` : '••••••'}
            </Text>
            <Text style={styles.kpiLabel}>Disbursed / Paid (ادا شدہ)</Text>
          </View>
        </View>

        <View style={[styles.kpiCard, { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }]}>
          <View style={[styles.kpiIconOrb, { backgroundColor: '#FDE68A' }]}>
            <Ionicons name="hourglass-outline" size={20} color="#D97706" />
          </View>
          <View>
            <Text style={[styles.kpiValue, { color: '#92400E' }]}>
              {canViewSalaries ? `Rs. ${payrollKPIs.totalPending.toLocaleString()}` : '••••••'}
            </Text>
            <Text style={styles.kpiLabel}>Pending Balance (بقایا)</Text>
          </View>
        </View>

        <View style={[styles.kpiCard, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
          <View style={[styles.kpiIconOrb, { backgroundColor: '#FEE2E2' }]}>
            <Ionicons name="people-outline" size={20} color="#DC2626" />
          </View>
          <View>
            <Text style={[styles.kpiValue, { color: '#991B1B' }]}>
              {payrollKPIs.totalStaff - payrollKPIs.paidCount} Staff
            </Text>
            <Text style={styles.kpiLabel}>Unpaid This Month</Text>
          </View>
        </View>
      </View>

      {/* Employee Payroll Table (Desktop) / Cards (Mobile) */}
      <View style={styles.payrollCard}>
        <View style={styles.payrollHeaderRow}>
          <Text style={styles.payrollTableTitle}>
            Monthly Payroll & Attendance Sheet ({formattedMonthTitle})
          </Text>
          <Text style={styles.payrollTableSub}>
            Auto-calculates absent deductions and overtime based on attendance records
          </Text>
        </View>

        {isMobile ? (
          <View style={{ padding: 12, gap: 12 }}>
            {staffPayrollRows.map((row) => (
              <View key={row.member.id} style={styles.mobileRowCard}>
                <View style={styles.mobileRowTop}>
                  <View>
                    <Text style={styles.staffName}>{row.member.name}</Text>
                    <Text style={styles.staffRole}>
                      {row.member.designation || row.member.role} • {row.member.cnic || 'No CNIC'}
                    </Text>
                  </View>

                  {row.isPaid ? (
                    <View style={styles.paidBadge}>
                      <Ionicons name="checkmark-circle" size={13} color="#059669" />
                      <Text style={styles.paidBadgeText}>PAID</Text>
                    </View>
                  ) : (
                    <View style={styles.pendingBadge}>
                      <Ionicons name="time" size={13} color="#D97706" />
                      <Text style={styles.pendingBadgeText}>PENDING</Text>
                    </View>
                  )}
                </View>

                {/* Financial Summary Grid */}
                <View style={styles.mobileFinGrid}>
                  <View style={styles.finCol}>
                    <Text style={styles.finLabel}>Base Salary:</Text>
                    <Text style={styles.finVal}>
                      {canViewSalaries ? `Rs. ${row.baseSalary.toLocaleString()}` : '••••••'}
                    </Text>
                  </View>
                  <View style={styles.finCol}>
                    <Text style={styles.finLabel}>Attendance:</Text>
                    <Text style={styles.finVal}>
                      {row.presentDays}P • {row.absentDays}A • {row.totalOvertimeHours}h OT
                    </Text>
                  </View>
                  <View style={styles.finCol}>
                    <Text style={styles.finLabel}>Net Amount:</Text>
                    <Text style={[styles.finVal, { color: '#52171B', fontWeight: '900' }]}>
                      {canViewSalaries
                        ? `Rs. ${(row.existingPayment ? row.existingPayment.netPaid : row.estimatedNet).toLocaleString()}`
                        : '••••••'}
                    </Text>
                  </View>
                </View>

                {/* Card Action */}
                <View style={styles.mobileActionBox}>
                  {row.isPaid ? (
                    <TouchableOpacity
                      style={styles.viewVoucherBtn}
                      onPress={() => openVoucher(row.existingPayment!, row.member)}
                    >
                      <Ionicons name="receipt-outline" size={14} color="#52171B" />
                      <Text style={styles.viewVoucherText}>
                        View Voucher ({row.existingPayment?.voucherNumber})
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={styles.paySalaryBtn}
                      onPress={() => openPaySalaryModal(row)}
                    >
                      <Ionicons name="cash-outline" size={15} color="#FFFFFF" />
                      <Text style={styles.paySalaryText}>Pay Salary / سلپ بنائیں</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))}
          </View>
        ) : (
          /* Desktop Table View */
          <View style={styles.table}>
            <View style={styles.thRow}>
              <Text style={[styles.th, { flex: 2 }]}>EMPLOYEE & CNIC</Text>
              <Text style={[styles.th, { flex: 1.4 }]}>BASE SALARY</Text>
              <Text style={[styles.th, { flex: 1.8 }]}>ATTENDANCE (P/A/OT)</Text>
              <Text style={[styles.th, { flex: 1.4 }]}>ABSENT DEDUCTION</Text>
              <Text style={[styles.th, { flex: 1.4 }]}>OVERTIME PAY</Text>
              <Text style={[styles.th, { flex: 1.6 }]}>NET PAYABLE</Text>
              <Text style={[styles.th, { flex: 1.4 }]}>STATUS</Text>
              <Text style={[styles.th, { flex: 1.8, textAlign: 'right' }]}>ACTION</Text>
            </View>

            {staffPayrollRows.map((row) => (
              <View key={row.member.id} style={styles.tr}>
                {/* Employee */}
                <View style={[styles.td, { flex: 2 }]}>
                  <Text style={styles.staffName}>{row.member.name}</Text>
                  <Text style={styles.staffRole}>
                    {row.member.designation || row.member.role} • {row.member.cnic || 'No CNIC'}
                  </Text>
                </View>

                {/* Base Salary */}
                <View style={[styles.td, { flex: 1.4 }]}>
                  <Text style={styles.tdBold}>
                    {canViewSalaries ? `Rs. ${row.baseSalary.toLocaleString()}` : '••••••'}
                  </Text>
                </View>

                {/* Attendance */}
                <View style={[styles.td, { flex: 1.8 }]}>
                  <Text style={styles.tdText}>
                    <Text style={{ color: '#059669', fontWeight: '800' }}>{row.presentDays} Present</Text>
                    {row.absentDays > 0 ? (
                      <Text style={{ color: '#DC2626', fontWeight: '800' }}> • {row.absentDays} Absent</Text>
                    ) : null}
                  </Text>
                  {row.totalOvertimeHours > 0 ? (
                    <Text style={{ fontSize: 11, color: '#D97706', fontWeight: '700', marginTop: 2 }}>
                      +{row.totalOvertimeHours} hrs Overtime
                    </Text>
                  ) : null}
                </View>

                {/* Absent Deduction */}
                <View style={[styles.td, { flex: 1.4 }]}>
                  <Text style={[styles.tdText, row.absentDeduction > 0 && { color: '#DC2626', fontWeight: '800' }]}>
                    {canViewSalaries
                      ? row.absentDeduction > 0
                        ? `- Rs. ${row.absentDeduction.toLocaleString()}`
                        : 'Rs. 0'
                      : '••••••'}
                  </Text>
                </View>

                {/* Overtime Pay */}
                <View style={[styles.td, { flex: 1.4 }]}>
                  <Text style={[styles.tdText, row.overtimeAmount > 0 && { color: '#059669', fontWeight: '800' }]}>
                    {canViewSalaries
                      ? row.overtimeAmount > 0
                        ? `+ Rs. ${row.overtimeAmount.toLocaleString()}`
                        : 'Rs. 0'
                      : '••••••'}
                  </Text>
                </View>

                {/* Net Payable */}
                <View style={[styles.td, { flex: 1.6 }]}>
                  <Text style={[styles.tdBold, { color: '#52171B', fontSize: 14 }]}>
                    {canViewSalaries
                      ? `Rs. ${(row.existingPayment ? row.existingPayment.netPaid : row.estimatedNet).toLocaleString()}`
                      : '••••••'}
                  </Text>
                </View>

                {/* Status */}
                <View style={[styles.td, { flex: 1.4 }]}>
                  {row.isPaid ? (
                    <View style={styles.paidBadge}>
                      <Ionicons name="checkmark-circle" size={13} color="#059669" />
                      <Text style={styles.paidBadgeText}>PAID</Text>
                    </View>
                  ) : (
                    <View style={styles.pendingBadge}>
                      <Ionicons name="time" size={13} color="#D97706" />
                      <Text style={styles.pendingBadgeText}>PENDING</Text>
                    </View>
                  )}
                </View>

                {/* Action */}
                <View style={[styles.td, { flex: 1.8, alignItems: 'flex-end' }]}>
                  {row.isPaid ? (
                    <TouchableOpacity
                      style={styles.viewVoucherBtn}
                      onPress={() => openVoucher(row.existingPayment!, row.member)}
                    >
                      <Ionicons name="receipt-outline" size={14} color="#52171B" />
                      <Text style={styles.viewVoucherText}>View Slip</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={styles.paySalaryBtn}
                      onPress={() => openPaySalaryModal(row)}
                    >
                      <Ionicons name="cash-outline" size={14} color="#FFFFFF" />
                      <Text style={styles.paySalaryText}>Pay Salary</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Disbursed History Log */}
      <View style={[styles.payrollCard, { marginTop: 20 }]}>
        <View style={styles.payrollHeaderRow}>
          <Text style={styles.payrollTableTitle}>Disbursed Salary History & Receipts</Text>
          <Text style={styles.payrollTableSub}>
            Historical salary payment vouchers recorded in Sultan Restaurant system
          </Text>
        </View>

        {salaryPayments.length === 0 ? (
          <View style={{ padding: 24, alignItems: 'center' }}>
            <Ionicons name="receipt-outline" size={36} color="#CBD5E1" />
            <Text style={{ marginTop: 8, fontSize: 13, color: '#94A3B8' }}>
              No salary payments recorded yet.
            </Text>
          </View>
        ) : (
          <View style={{ padding: 12 }}>
            {salaryPayments.map((p) => (
              <View key={p.id} style={styles.historyRow}>
                <View style={{ flex: 1.8, minWidth: 120 }}>
                  <Text style={styles.histVoucher}>{p.voucherNumber || p.id}</Text>
                  <Text style={styles.histStaff}>{p.staffName}</Text>
                </View>

                <View style={{ flex: 1.2, minWidth: 100 }}>
                  <Text style={styles.histDate}>{p.paymentDate}</Text>
                  <Text style={styles.histMonth}>Month: {p.month}</Text>
                </View>

                <View style={{ flex: 1.4, minWidth: 100 }}>
                  <Text style={styles.histAmount}>
                    {canViewSalaries ? `Rs. ${p.netPaid.toLocaleString()}` : '••••••'}
                  </Text>
                  <Text style={styles.histMethod}>Via {p.paymentMethod?.toUpperCase()}</Text>
                </View>

                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <TouchableOpacity
                    style={styles.viewVoucherSmall}
                    onPress={() => openVoucher(p)}
                  >
                    <Ionicons name="document-text-outline" size={15} color="#52171B" />
                    <Text style={styles.viewVoucherSmallText}>Slip</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.delVoucherSmall}
                    onPress={() => handleDeleteVoucher(p.id, p.staffName)}
                  >
                    <Ionicons name="trash-outline" size={15} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* ========================================================================= */}
      {/* MODAL: PAY SALARY / GENERATE VOUCHER */}
      {/* ========================================================================= */}
      <Modal visible={payModalVisible} transparent animationType="fade" onRequestClose={() => setPayModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, isMobile && { width: '95%', maxHeight: '92%', padding: 16 }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={styles.modalIconBox}>
                  <Ionicons name="cash" size={20} color="#52171B" />
                </View>
                <View>
                  <Text style={styles.modalTitle}>Disburse Salary</Text>
                  <Text style={styles.modalSub}>
                    {targetStaff?.name} ({targetStaff?.designation || targetStaff?.role}) • {formattedMonthTitle}
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setPayModalVisible(false)}>
                <Ionicons name="close" size={24} color="#8E8E93" />
              </TouchableOpacity>
            </View>

            {formError ? (
              <View style={styles.errorAlert}>
                <Ionicons name="alert-circle" size={18} color="#FF3B30" />
                <Text style={styles.errorAlertText}>{formError}</Text>
              </View>
            ) : null}

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 460 }}>
              {/* Grand Total Display */}
              <View style={styles.netCalculationCard}>
                <View>
                  <Text style={styles.netCalcLabel}>NET DISBURSED AMOUNT</Text>
                  <Text style={styles.netCalcUrdu}>خالص ادا شدہ رقم</Text>
                </View>
                <Text style={styles.netCalcValue}>Rs. {modalNetTotal.toLocaleString()}</Text>
              </View>

              {/* Base Salary Input */}
              <View style={styles.formRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Basic Monthly Salary *</Text>
                  <TextInput
                    style={styles.fieldInput}
                    keyboardType="numeric"
                    value={payBase}
                    onChangeText={setPayBase}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Payment Date *</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={payDate}
                    placeholder="YYYY-MM-DD"
                    onChangeText={setPayDate}
                  />
                </View>
              </View>

              {/* Overtime & Bonus */}
              <View style={styles.formRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Overtime Pay (+)</Text>
                  <TextInput
                    style={[styles.fieldInput, { color: '#059669', fontWeight: '800' }]}
                    keyboardType="numeric"
                    value={payOvertime}
                    onChangeText={setPayOvertime}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Bonus / Allowance (+)</Text>
                  <TextInput
                    style={[styles.fieldInput, { color: '#059669', fontWeight: '800' }]}
                    keyboardType="numeric"
                    value={payBonus}
                    onChangeText={setPayBonus}
                  />
                </View>
              </View>

              {/* Absent & Advance Deductions */}
              <View style={styles.formRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Absent Deductions (-)</Text>
                  <TextInput
                    style={[styles.fieldInput, { color: '#DC2626', fontWeight: '800' }]}
                    keyboardType="numeric"
                    value={payDeductions}
                    onChangeText={setPayDeductions}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Advance / Loan Recovery (-)</Text>
                  <TextInput
                    style={[styles.fieldInput, { color: '#DC2626', fontWeight: '800' }]}
                    keyboardType="numeric"
                    value={payAdvance}
                    onChangeText={setPayAdvance}
                  />
                </View>
              </View>

              {/* Payment Method */}
              <View style={{ marginBottom: 12 }}>
                <Text style={styles.fieldLabel}>Payment Mode</Text>
                <View style={styles.payMethodsRow}>
                  {[
                    { key: 'cash', label: 'Cash In Hand' },
                    { key: 'bank', label: 'Bank Transfer' },
                    { key: 'online', label: 'JazzCash / EasyPaisa' },
                  ].map((m) => {
                    const isSelected = payMethod === m.key;
                    return (
                      <TouchableOpacity
                        key={m.key}
                        style={[styles.payMethodPill, isSelected && styles.payMethodPillActive]}
                        onPress={() => setPayMethod(m.key as any)}
                      >
                        <Text style={[styles.payMethodText, isSelected && styles.payMethodTextActive]}>
                          {m.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Remarks */}
              <View style={{ marginBottom: 16 }}>
                <Text style={styles.fieldLabel}>Notes / Remarks (Optional)</Text>
                <TextInput
                  style={styles.fieldInput}
                  placeholder="e.g. October 2026 salary with Eid bonus..."
                  value={payNotes}
                  onChangeText={setPayNotes}
                />
              </View>
            </ScrollView>

            {/* Modal Actions */}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setPayModalVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.confirmBtn}
                onPress={handleConfirmPayment}
              >
                <Ionicons name="checkmark-circle" size={17} color="#FFFFFF" />
                <Text style={styles.confirmBtnText}>Confirm & Print Voucher</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* ROYAL SALARY VOUCHER MODAL */}
      {/* ========================================================================= */}
      <SalaryVoucherModal
        visible={voucherModalVisible}
        onClose={() => setVoucherModalVisible(false)}
        payment={activeVoucher}
        staffMember={targetStaff}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 40,
  },
  monthBar: {
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
  monthNavGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  monthArrowBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthTitleBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF9F5',
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  monthTitleText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#52171B',
  },
  monthRightBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  monthBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
  },
  kpiRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  kpiCard: {
    flex: 1,
    minWidth: 150,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
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
    marginTop: 2,
  },
  payrollCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  payrollHeaderRow: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FAFAFC',
  },
  payrollTableTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#1E293B',
  },
  payrollTableSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  table: {
    width: '100%',
  },
  thRow: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  th: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  tr: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  td: {
    paddingHorizontal: 4,
  },
  tdBold: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E293B',
  },
  tdText: {
    fontSize: 12,
    color: '#334155',
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
  paidBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  paidBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#059669',
  },
  pendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  pendingBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#D97706',
  },
  paySalaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#52171B',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6,
  },
  paySalaryText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  viewVoucherBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6,
  },
  viewVoucherText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#52171B',
  },
  mobileRowCard: {
    backgroundColor: '#FAFAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    gap: 8,
  },
  mobileRowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  mobileFinGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  finCol: {
    alignItems: 'center',
  },
  finLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748B',
  },
  finVal: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1E293B',
    marginTop: 2,
  },
  mobileActionBox: {
    alignItems: 'flex-end',
    marginTop: 4,
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  histVoucher: {
    fontSize: 12,
    fontWeight: '800',
    color: '#52171B',
  },
  histStaff: {
    fontSize: 11,
    color: '#64748B',
  },
  histDate: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1E293B',
  },
  histMonth: {
    fontSize: 10,
    color: '#94A3B8',
  },
  histAmount: {
    fontSize: 13,
    fontWeight: '800',
    color: '#059669',
  },
  histMethod: {
    fontSize: 10,
    color: '#64748B',
  },
  viewVoucherSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  viewVoucherSmallText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#52171B',
  },
  delVoucherSmall: {
    padding: 5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    width: 550,
    maxHeight: '90%',
    padding: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  modalIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#52171B',
  },
  modalSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  errorAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEE2E2',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  errorAlertText: {
    fontSize: 12,
    color: '#DC2626',
    fontWeight: '700',
  },
  netCalculationCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    backgroundColor: '#52171B',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  netCalcLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: '#FDE68A',
    letterSpacing: 0.5,
  },
  netCalcUrdu: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 2,
  },
  netCalcValue: {
    fontSize: 22,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  formRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#334155',
    marginBottom: 4,
  },
  fieldInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: '#0F172A',
  },
  payMethodsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  payMethodPill: {
    flex: 1,
    minWidth: 110,
    backgroundColor: '#F1F5F9',
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  payMethodPillActive: {
    backgroundColor: '#FEF3C7',
    borderColor: '#B48214',
  },
  payMethodText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  payMethodTextActive: {
    color: '#52171B',
    fontWeight: '800',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#059669',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
  confirmBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
