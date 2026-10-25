import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SalaryPayment, StaffMember } from '../../store/restaurantStore';

interface SalaryVoucherModalProps {
  visible: boolean;
  onClose: () => void;
  payment: SalaryPayment | null;
  staffMember?: StaffMember | null;
}

export default function SalaryVoucherModal({
  visible,
  onClose,
  payment,
  staffMember,
}: SalaryVoucherModalProps) {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  if (!payment) return null;

  const handlePrint = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.print();
    }
  };

  const grossEarnings =
    (payment.baseSalary || 0) +
    (payment.overtimeAmount || 0) +
    (payment.bonusAmount || 0);

  const totalDeductions =
    (payment.deductionAmount || 0) + (payment.advanceDeduction || 0);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.modalCard, isMobile && { width: '95%', maxHeight: '94%', padding: 16 }]}>
          {/* Header */}
          <View style={styles.topActions}>
            <TouchableOpacity style={styles.printBtn} onPress={handlePrint}>
              <Ionicons name="print-outline" size={16} color="#52171B" />
              <Text style={styles.printBtnText}>Print Voucher</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color="#64748B" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 600 }}>
            <View id="sultan-salary-voucher" style={styles.voucherContainer}>
              {/* Royal Crest Header */}
              <View style={styles.royalHeader}>
                <View style={styles.crownCircle}>
                  <Text style={{ fontSize: 24 }}>👑</Text>
                </View>
                <Text style={styles.restaurantName}>SULTAN RESTAURANT</Text>
                <Text style={styles.restaurantSub}>LUXURY DINING & BANQUET HALL</Text>
                <Text style={styles.urduTitle}>ملازمین تنخواہ واؤچر / پے سلپ</Text>
                <View style={styles.goldLine} />
              </View>

              {/* Voucher Meta Info */}
              <View style={styles.metaRow}>
                <View>
                  <Text style={styles.metaLabel}>VOUCHER NO.</Text>
                  <Text style={styles.metaValueHighlight}>
                    {payment.voucherNumber || `VCH-${payment.id.slice(-6).toUpperCase()}`}
                  </Text>
                </View>
                <View style={{ alignItems: 'center' }}>
                  <Text style={styles.metaLabel}>SALARY MONTH</Text>
                  <Text style={styles.metaValue}>{payment.month}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.metaLabel}>PAYMENT DATE</Text>
                  <Text style={styles.metaValue}>{payment.paymentDate}</Text>
                </View>
              </View>

              {/* Employee Information */}
              <View style={styles.staffInfoCard}>
                <View style={styles.infoCol}>
                  <Text style={styles.infoLabel}>EMPLOYEE NAME</Text>
                  <Text style={styles.infoName}>{payment.staffName}</Text>
                  {staffMember?.designation ? (
                    <Text style={styles.infoSub}>{staffMember.designation}</Text>
                  ) : null}
                </View>
                <View style={styles.infoColRight}>
                  <Text style={styles.infoLabel}>CNIC / NATIONAL ID</Text>
                  <Text style={styles.infoValue}>{staffMember?.cnic || 'Registered on file'}</Text>
                  <Text style={[styles.infoLabel, { marginTop: 4 }]}>PHONE</Text>
                  <Text style={styles.infoValue}>{staffMember?.phone || 'N/A'}</Text>
                </View>
              </View>

              {/* Financial Breakup Table */}
              <View style={styles.tableContainer}>
                {/* Earnings Section */}
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionHeaderText}>1. EARNINGS & ALLOWANCES (آمدنی)</Text>
                  <Text style={styles.sectionHeaderText}>AMOUNT (PKR)</Text>
                </View>

                <View style={styles.itemRow}>
                  <Text style={styles.itemLabel}>Basic Monthly Salary (بنیادی تنخواہ)</Text>
                  <Text style={styles.itemVal}>Rs. {(payment.baseSalary || 0).toLocaleString()}</Text>
                </View>

                {Boolean(payment.overtimeAmount > 0) && (
                  <View style={styles.itemRow}>
                    <Text style={styles.itemLabel}>Overtime Earnings (اوور ٹائم)</Text>
                    <Text style={[styles.itemVal, { color: '#10B981' }]}>
                      + Rs. {(payment.overtimeAmount || 0).toLocaleString()}
                    </Text>
                  </View>
                )}

                {Boolean(payment.bonusAmount > 0) && (
                  <View style={styles.itemRow}>
                    <Text style={styles.itemLabel}>Performance Bonus / Incentive (انعام / بونس)</Text>
                    <Text style={[styles.itemVal, { color: '#10B981' }]}>
                      + Rs. {(payment.bonusAmount || 0).toLocaleString()}
                    </Text>
                  </View>
                )}

                <View style={styles.subtotalRow}>
                  <Text style={styles.subtotalLabel}>Gross Earnings (کل واجبات):</Text>
                  <Text style={styles.subtotalVal}>Rs. {grossEarnings.toLocaleString()}</Text>
                </View>

                {/* Deductions Section */}
                <View style={[styles.sectionHeaderRow, { backgroundColor: '#FFF1F2', marginTop: 10 }]}>
                  <Text style={[styles.sectionHeaderText, { color: '#BE123C' }]}>
                    2. DEDUCTIONS & ADVANCES (کٹوتیاں)
                  </Text>
                  <Text style={[styles.sectionHeaderText, { color: '#BE123C' }]}>AMOUNT (PKR)</Text>
                </View>

                <View style={styles.itemRow}>
                  <Text style={styles.itemLabel}>Attendance & Absent Deductions (غیر حاضری کٹوتی)</Text>
                  <Text style={[styles.itemVal, { color: '#EF4444' }]}>
                    - Rs. {(payment.deductionAmount || 0).toLocaleString()}
                  </Text>
                </View>

                {Boolean(payment.advanceDeduction > 0) && (
                  <View style={styles.itemRow}>
                    <Text style={styles.itemLabel}>Advance Salary / Loan Recovery (ایڈوانس کٹوتی)</Text>
                    <Text style={[styles.itemVal, { color: '#EF4444' }]}>
                      - Rs. {(payment.advanceDeduction || 0).toLocaleString()}
                    </Text>
                  </View>
                )}

                <View style={styles.subtotalRow}>
                  <Text style={styles.subtotalLabel}>Total Deductions (کل کٹوتی):</Text>
                  <Text style={[styles.subtotalVal, { color: '#EF4444' }]}>
                    - Rs. {totalDeductions.toLocaleString()}
                  </Text>
                </View>
              </View>

              {/* Net Disbursed Grand Card */}
              <View style={styles.grandCard}>
                <View>
                  <Text style={styles.grandLabel}>NET DISBURSED AMOUNT</Text>
                  <Text style={styles.grandUrdu}>خالص ادا شدہ رقم</Text>
                </View>
                <Text style={styles.grandAmount}>
                  Rs. {(payment.netPaid || 0).toLocaleString()}
                </Text>
              </View>

              {/* Payment Details Pill */}
              <View style={styles.paymentMetaBox}>
                <View style={styles.payMetaItem}>
                  <Text style={styles.metaSubLabel}>Payment Mode:</Text>
                  <View style={styles.payModePill}>
                    <Text style={styles.payModeText}>{payment.paymentMethod?.toUpperCase()}</Text>
                  </View>
                </View>
                <View style={styles.payMetaItem}>
                  <Text style={styles.metaSubLabel}>Status:</Text>
                  <View style={[styles.payModePill, { backgroundColor: '#ECFDF5' }]}>
                    <Text style={[styles.payModeText, { color: '#059669' }]}>
                      ✓ {payment.status || 'PAID'}
                    </Text>
                  </View>
                </View>
              </View>

              {payment.notes ? (
                <View style={styles.notesBox}>
                  <Text style={styles.notesLabel}>Notes / Remarks:</Text>
                  <Text style={styles.notesText}>{payment.notes}</Text>
                </View>
              ) : null}

              {/* Signatures Row */}
              <View style={styles.signaturesRow}>
                <View style={styles.sigCol}>
                  <View style={styles.sigLine} />
                  <Text style={styles.sigTitle}>Employee Signature</Text>
                  <Text style={styles.sigSub}>دستخط وصول کنندہ ملازم</Text>
                </View>

                <View style={styles.sigCol}>
                  <View style={styles.sigLine} />
                  <Text style={styles.sigTitle}>Authorized Manager / Admin</Text>
                  <Text style={styles.sigSub}>دستخط منیجر / ایڈمن</Text>
                </View>
              </View>

              <Text style={styles.disclaimerText}>
                Computer-generated official payroll slip issued by Sultan Restaurant Management System.
              </Text>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    width: 620,
    maxHeight: '90%',
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 12,
  },
  topActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  printBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  printBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#52171B',
  },
  closeBtn: {
    padding: 4,
  },
  voucherContainer: {
    backgroundColor: '#FFFFFF',
    padding: 12,
  },
  royalHeader: {
    alignItems: 'center',
    marginBottom: 16,
  },
  crownCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#B48214',
    marginBottom: 6,
  },
  restaurantName: {
    fontSize: 20,
    fontWeight: '900',
    color: '#52171B',
    letterSpacing: 1.5,
  },
  restaurantSub: {
    fontSize: 10,
    fontWeight: '700',
    color: '#B48214',
    letterSpacing: 2,
    marginTop: 2,
  },
  urduTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2937',
    marginTop: 4,
  },
  goldLine: {
    width: 120,
    height: 2,
    backgroundColor: '#B48214',
    marginTop: 8,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
  },
  metaLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  metaValueHighlight: {
    fontSize: 13,
    fontWeight: '900',
    color: '#52171B',
    marginTop: 2,
  },
  metaValue: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1E293B',
    marginTop: 2,
  },
  staffInfoCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: '#FEF9F5',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FED7AA',
    marginBottom: 14,
  },
  infoCol: {
    flex: 1,
  },
  infoColRight: {
    alignItems: 'flex-end',
  },
  infoLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#9A3412',
  },
  infoName: {
    fontSize: 15,
    fontWeight: '900',
    color: '#52171B',
    marginTop: 2,
  },
  infoSub: {
    fontSize: 11,
    color: '#B48214',
    fontWeight: '700',
  },
  infoValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
    marginTop: 1,
  },
  tableContainer: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 14,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  sectionHeaderText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#334155',
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  itemLabel: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '600',
  },
  itemVal: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  subtotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  subtotalLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1E293B',
  },
  subtotalVal: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0F172A',
  },
  grandCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#52171B',
    padding: 16,
    borderRadius: 12,
    marginBottom: 14,
  },
  grandLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: '#FDE68A',
    letterSpacing: 1,
  },
  grandUrdu: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 2,
  },
  grandAmount: {
    fontSize: 24,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  paymentMetaBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  payMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metaSubLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  payModePill: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  payModeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#334155',
  },
  notesBox: {
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 8,
    marginBottom: 16,
  },
  notesLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    marginBottom: 2,
  },
  notesText: {
    fontSize: 12,
    color: '#334155',
  },
  signaturesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 24,
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  sigCol: {
    width: '42%',
    alignItems: 'center',
  },
  sigLine: {
    width: '100%',
    height: 1,
    backgroundColor: '#94A3B8',
    marginBottom: 6,
  },
  sigTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1E293B',
  },
  sigSub: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 2,
  },
  disclaimerText: {
    fontSize: 9,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 10,
  },
});
