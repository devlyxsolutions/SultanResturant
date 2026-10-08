import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  TextInput, 
  Modal,
  Platform,
  useWindowDimensions 
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useRestaurantStore } from '../../store/restaurantStore';

export default function ShiftManagement() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isMobile = width < 600;

  const invoices = useRestaurantStore(state => state.invoices);

  const [shiftStatus, setShiftStatus] = useState<'open' | 'closed'>('open');
  const [startingFloat, setStartingFloat] = useState('5000');
  const [actualCash, setActualCash] = useState('');
  const [showZReportModal, setShowZReportModal] = useState(false);
  const [reportType, setReportType] = useState<'X-Report' | 'Z-Report'>('Z-Report');

  // Calculate live shift statistics from settled invoices today
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const shiftInvoices = (invoices || []).filter(inv => inv.status !== 'voided' && (inv.timeSettled || inv.timePlaced) >= startOfDay.getTime());

  const totalCashSales = shiftInvoices.reduce((sum, inv) => {
    const cashAmt = inv.payments
      ?.filter(p => p.type === 'cash')
      .reduce((pSum, p) => pSum + p.amount, 0) || 0;
    return sum + cashAmt;
  }, 0);

  const totalDigitalSales = shiftInvoices.reduce((sum, inv) => {
    const digAmt = inv.payments
      ?.filter(p => p.type === 'card' || p.type === 'online')
      .reduce((pSum, p) => pSum + p.amount, 0) || 0;
    return sum + digAmt;
  }, 0);

  const totalSalesAll = totalCashSales + totalDigitalSales;
  const floatNum = parseFloat(startingFloat) || 0;
  const expectedCashInDrawer = floatNum + totalCashSales;

  const actualCashNum = actualCash ? parseFloat(actualCash) : 0;
  const variance = actualCash ? actualCashNum - expectedCashInDrawer : 0;

  const handleCloseShift = () => {
    setShiftStatus('closed');
    setReportType('Z-Report');
    setShowZReportModal(true);
  };

  const handleOpenXReport = () => {
    setReportType('X-Report');
    setShowZReportModal(true);
  };

  const handlePrint = () => {
    if (Platform.OS === 'web') {
      window.print();
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, isMobile && styles.headerMobile]}>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/manager/dashboard'))}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={24} color="#1C1C1E" />
          <Text style={[styles.headerTitle, isMobile && styles.headerTitleMobile]}>
            Shift & Cash Management
          </Text>
        </TouchableOpacity>
        
        <View style={[styles.statusBadge, shiftStatus === 'open' ? styles.statusOpen : styles.statusClosed]}>
          <View style={[styles.statusDot, { backgroundColor: shiftStatus === 'open' ? '#2E7D32' : '#8E8E93' }]} />
          <Text style={[styles.statusText, shiftStatus === 'open' ? styles.textOpen : styles.textClosed]}>
            {shiftStatus === 'open' ? 'REGISTER OPEN' : 'SHIFT CLOSED'}
          </Text>
        </View>
      </View>

      <ScrollView style={[styles.content, isMobile && styles.contentMobile]} showsVerticalScrollIndicator={false}>
        {/* Current Register Shift Summary */}
        <View style={[styles.card, isMobile && styles.cardMobile]}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Live Cash Drawer Summary</Text>
            <TouchableOpacity 
              style={styles.xReportBtn} 
              onPress={handleOpenXReport}
              activeOpacity={0.7}
            >
              <Ionicons name="document-text-outline" size={14} color="#4a121a" style={{ marginRight: 4 }} />
              <Text style={styles.xReportBtnText}>View X-Report</Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Opening Cash Float</Text>
            <Text style={styles.summaryValue}>Rs. {floatNum.toLocaleString()}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Cash Sales (Today)</Text>
            <Text style={[styles.summaryValue, { color: '#27ae60' }]}>+ Rs. {totalCashSales.toLocaleString()}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Card & Digital Sales</Text>
            <Text style={styles.summaryValue}>Rs. {totalDigitalSales.toLocaleString()}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Total Settled Orders</Text>
            <Text style={styles.summaryValue}>{shiftInvoices.length} Invoices</Text>
          </View>
          
          <View style={styles.divider} />
          
          <View style={styles.expectedRow}>
            <View>
              <Text style={styles.expectedCashLabel}>Expected Cash in Drawer</Text>
              <Text style={styles.expectedCashSubtext}>(Float + Cash Sales)</Text>
            </View>
            <Text style={styles.expectedCashValue}>Rs. {expectedCashInDrawer.toLocaleString()}</Text>
          </View>
        </View>

        {shiftStatus === 'open' && (
          <View style={[styles.card, isMobile && styles.cardMobile]}>
            <Text style={styles.cardTitle}>Reconcile & Close Shift (Z-Report)</Text>
            <Text style={styles.instructionText}>
              Count all physical cash and bills currently in the cash drawer and input the total counted amount below:
            </Text>
            
            <View style={styles.inputContainer}>
              <Text style={styles.currencySymbol}>Rs.</Text>
              <TextInput
                style={styles.cashInput}
                placeholder="0"
                placeholderTextColor="#8E8E93"
                keyboardType="numeric"
                value={actualCash}
                onChangeText={setActualCash}
              />
            </View>

            {actualCash !== '' && (
              <View style={[
                styles.varianceBox, 
                variance === 0 ? styles.varianceMatch : 
                (variance > 0 ? styles.varianceOverage : styles.varianceShortage)
              ]}>
                <Ionicons 
                  name={variance === 0 ? "checkmark-circle" : (variance > 0 ? "trending-up" : "alert-circle")} 
                  size={20} 
                  color={variance === 0 ? "#27ae60" : (variance > 0 ? "#2980b9" : "#c0392b")} 
                  style={{ marginRight: 8 }}
                />
                <Text style={[
                  styles.varianceText,
                  { color: variance === 0 ? "#27ae60" : (variance > 0 ? "#2980b9" : "#c0392b") }
                ]}>
                  {variance === 0 ? 'Exact Match (Drawer Balanced)' : 
                   (variance > 0 ? `Cash Overage: +Rs. ${variance.toLocaleString()}` : `Cash Shortage: -Rs. ${Math.abs(variance).toLocaleString()}`)}
                </Text>
              </View>
            )}

            <TouchableOpacity 
              style={[styles.closeButton, !actualCash && styles.closeButtonDisabled]}
              disabled={!actualCash}
              onPress={handleCloseShift}
              activeOpacity={0.8}
            >
              <Ionicons name="lock-closed" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.closeButtonText}>Confirm & Close Shift (Generate Z-Report)</Text>
            </TouchableOpacity>
          </View>
        )}

        {shiftStatus === 'closed' && (
          <View style={[styles.card, styles.successCard, isMobile && styles.cardMobile]}>
            <View style={styles.successIconBadge}>
              <Ionicons name="checkmark-done" size={40} color="#27ae60" />
            </View>
            <Text style={styles.successTitle}>Shift Successfully Closed</Text>
            <Text style={styles.successText}>
              The end-of-day Z-Report has been generated and archived for auditing.
            </Text>
            
            <View style={styles.closedActionsRow}>
              <TouchableOpacity 
                style={styles.printButton} 
                onPress={() => setShowZReportModal(true)}
                activeOpacity={0.8}
              >
                <Ionicons name="receipt-outline" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.printButtonText}>View Z-Report Receipt</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.reopenButton} 
                onPress={() => setShiftStatus('open')}
                activeOpacity={0.8}
              >
                <Ionicons name="refresh-outline" size={18} color="#4a121a" style={{ marginRight: 8 }} />
                <Text style={styles.reopenButtonText}>Reopen Register</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>

      {/* X/Z Report Receipt Modal */}
      <Modal visible={showZReportModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.receiptCard, isMobile && styles.receiptCardMobile]}>
            <View style={styles.receiptHeader}>
              <Text style={styles.receiptBrand}>SULTAN RESTAURANT</Text>
              <Text style={styles.receiptSub}>LUXURY DINING & BANQUET</Text>
              <View style={styles.reportTypeBadge}>
                <Text style={styles.reportTypeBadgeText}>{reportType}</Text>
              </View>
              <Text style={styles.receiptDate}>
                {new Date().toLocaleDateString()} • {new Date().toLocaleTimeString()}
              </Text>
            </View>

            <View style={styles.receiptDivider} />

            <View style={styles.receiptRow}>
              <Text style={styles.receiptLabel}>Opening Float:</Text>
              <Text style={styles.receiptValue}>Rs. {floatNum.toLocaleString()}</Text>
            </View>
            <View style={styles.receiptRow}>
              <Text style={styles.receiptLabel}>Total Cash Sales:</Text>
              <Text style={styles.receiptValue}>Rs. {totalCashSales.toLocaleString()}</Text>
            </View>
            <View style={styles.receiptRow}>
              <Text style={styles.receiptLabel}>Total Card/Online:</Text>
              <Text style={styles.receiptValue}>Rs. {totalDigitalSales.toLocaleString()}</Text>
            </View>
            <View style={styles.receiptRow}>
              <Text style={styles.receiptLabel}>Total Settled Orders:</Text>
              <Text style={styles.receiptValue}>{shiftInvoices.length}</Text>
            </View>

            <View style={styles.receiptDivider} />

            <View style={styles.receiptRow}>
              <Text style={[styles.receiptLabel, { fontWeight: '800' }]}>Gross Sales:</Text>
              <Text style={[styles.receiptValue, { fontWeight: '800' }]}>Rs. {totalSalesAll.toLocaleString()}</Text>
            </View>
            <View style={styles.receiptRow}>
              <Text style={styles.receiptLabel}>Expected Cash in Drawer:</Text>
              <Text style={styles.receiptValue}>Rs. {expectedCashInDrawer.toLocaleString()}</Text>
            </View>
            {actualCash !== '' && (
              <>
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>Actual Counted Cash:</Text>
                  <Text style={styles.receiptValue}>Rs. {actualCashNum.toLocaleString()}</Text>
                </View>
                <View style={styles.receiptRow}>
                  <Text style={[styles.receiptLabel, { fontWeight: '700' }]}>Drawer Variance:</Text>
                  <Text style={[
                    styles.receiptValue, 
                    { color: variance >= 0 ? '#27ae60' : '#e74c3c', fontWeight: '800' }
                  ]}>
                    {variance === 0 ? 'Balanced (Rs. 0)' : `${variance > 0 ? '+' : ''}Rs. ${variance.toLocaleString()}`}
                  </Text>
                </View>
              </>
            )}

            <View style={styles.receiptFooter}>
              <Text style={styles.receiptFooterText}>Shift Operator: Manager On Duty</Text>
              <Text style={styles.receiptFooterText}>System: Sultan Cloud POS Terminal #1</Text>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity 
                style={styles.modalCancelBtn} 
                onPress={() => setShowZReportModal(false)}
              >
                <Text style={styles.modalCancelBtnText}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.modalPrintBtn} 
                onPress={handlePrint}
              >
                <Ionicons name="print" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.modalPrintBtnText}>Print Slip</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  headerMobile: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginLeft: 8,
    color: '#1C1C1E',
  },
  headerTitleMobile: {
    fontSize: 16,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  statusOpen: {
    backgroundColor: '#E8F5E9',
    borderColor: '#C8E6C9',
  },
  statusClosed: {
    backgroundColor: '#F5F5F5',
    borderColor: '#E0E0E0',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  textOpen: {
    color: '#2E7D32',
  },
  textClosed: {
    color: '#757575',
  },
  content: {
    flex: 1,
    padding: 24,
  },
  contentMobile: {
    padding: 14,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 22,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    maxWidth: 720,
    alignSelf: 'center',
    width: '100%',
    borderWidth: 1,
    borderColor: '#EFEFF4',
  },
  cardMobile: {
    padding: 16,
    borderRadius: 14,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  cardTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  xReportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F6F3EC',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E8DFC9',
  },
  xReportBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4a121a',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#636366',
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  divider: {
    height: 1,
    backgroundColor: '#F2F2F7',
    marginVertical: 14,
  },
  expectedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  expectedCashLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  expectedCashSubtext: {
    fontSize: 11,
    color: '#8E8E93',
  },
  expectedCashValue: {
    fontSize: 22,
    fontWeight: '900',
    color: '#4a121a', // Sultan Burgundy
  },
  instructionText: {
    fontSize: 14,
    color: '#636366',
    lineHeight: 20,
    marginBottom: 16,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E5E5EA',
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
    backgroundColor: '#F8F9FA',
  },
  currencySymbol: {
    fontSize: 20,
    fontWeight: '800',
    color: '#8E8E93',
    marginRight: 8,
  },
  cashInput: {
    flex: 1,
    fontSize: 24,
    fontWeight: '800',
    color: '#1C1C1E',
    paddingVertical: 14,
  },
  varianceBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    marginBottom: 18,
    borderWidth: 1,
  },
  varianceMatch: {
    backgroundColor: '#E8F5E9',
    borderColor: '#C8E6C9',
  },
  varianceOverage: {
    backgroundColor: '#EBF5FB',
    borderColor: '#AED6F1',
  },
  varianceShortage: {
    backgroundColor: '#FDEDEC',
    borderColor: '#FADBD8',
  },
  varianceText: {
    fontSize: 13,
    fontWeight: '700',
  },
  closeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4a121a',
    paddingVertical: 14,
    borderRadius: 12,
  },
  closeButtonDisabled: {
    backgroundColor: '#A8A8A8',
  },
  closeButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
  successCard: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  successIconBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1C1C1E',
    marginBottom: 8,
  },
  successText: {
    fontSize: 14,
    color: '#636366',
    textAlign: 'center',
    maxWidth: 400,
    marginBottom: 20,
    lineHeight: 20,
  },
  closedActionsRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  printButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4a121a',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  printButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  reopenButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F6F3EC',
    borderWidth: 1,
    borderColor: '#E8DFC9',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  reopenButtonText: {
    color: '#4a121a',
    fontWeight: '700',
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  receiptCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  receiptCardMobile: {
    padding: 18,
  },
  receiptHeader: {
    alignItems: 'center',
    marginBottom: 12,
  },
  receiptBrand: {
    fontSize: 20,
    fontWeight: '900',
    color: '#4a121a',
    letterSpacing: 1.5,
  },
  receiptSub: {
    fontSize: 10,
    fontWeight: '700',
    color: '#D5A943',
    letterSpacing: 1,
    marginTop: 2,
  },
  reportTypeBadge: {
    backgroundColor: '#F2F2F7',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 8,
    marginBottom: 6,
  },
  reportTypeBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  receiptDate: {
    fontSize: 11,
    color: '#8E8E93',
  },
  receiptDivider: {
    height: 1,
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: '#C7C7CC',
    marginVertical: 12,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  receiptLabel: {
    fontSize: 13,
    color: '#3A3A3C',
  },
  receiptValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  receiptFooter: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F2F2F7',
    alignItems: 'center',
  },
  receiptFooterText: {
    fontSize: 11,
    color: '#8E8E93',
    marginVertical: 1,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 20,
    gap: 10,
  },
  modalCancelBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#F2F2F7',
  },
  modalCancelBtnText: {
    color: '#636366',
    fontWeight: '700',
    fontSize: 13,
  },
  modalPrintBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#4a121a',
  },
  modalPrintBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  }
});
