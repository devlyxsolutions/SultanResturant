import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Platform,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  useOpsStore,
  EXPENSE_CATEGORIES,
  ExpenseMethod,
  useRestaurantStore,
  useAuthStore,
} from '../store';
import { BRAND } from '../constants/brand';
import { money, formatTime, startOfDay } from '../utils/format';
import { useRolePermissions } from '../store/roleStore';
import PermissionDeniedScreen from '../components/PermissionDeniedScreen';
import RoyalDropdown from '../components/RoyalDropdown';
import PaginationControl from '../components/PaginationControl';
import { usePagination } from '../hooks/usePagination';

export default function ExpensesScreen({ backRoute = '/manager/dashboard' }: { backRoute?: string }) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const user = useAuthStore((s) => s.user);
  const {
    can,
    canViewRevenue,
    canAddExpenses,
    canEditExpenses,
    canDeleteExpenses,
  } = useRolePermissions();

  const invoices = useRestaurantStore((s) => s.invoices);
  const expenses = useOpsStore((s) => s.expenses);
  const addExpense = useOpsStore((s) => s.addExpense);
  const updateExpense = useOpsStore((s) => s.updateExpense);
  const deleteExpense = useOpsStore((s) => s.deleteExpense);

  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [method, setMethod] = useState<ExpenseMethod>('cash');
  const [filterPeriod, setFilterPeriod] = useState<'today' | 'all'>('today');
  const [todayStart] = useState(() => startOfDay(Date.now()));

  const { filteredExpenses, todayInvoices, todayRevenue, totalExpenseAmount, netProfitToday } = useMemo(() => {
    const invList = invoices || [];
    const expList = expenses || [];
    const filtered = filterPeriod === 'today'
      ? expList.filter((e) => e.at >= todayStart)
      : expList;
    const invs = invList.filter((inv) => inv.status !== 'voided' && (inv.timeSettled || inv.timePlaced) >= todayStart);
    const rev = invs.reduce((sum, inv) => sum + (inv.total || 0), 0);
    const expTotal = filtered.reduce((sum, e) => sum + (e.amount || 0), 0);
    const profit = rev - expTotal;
    return {
      filteredExpenses: filtered,
      todayInvoices: invs,
      todayRevenue: rev,
      totalExpenseAmount: expTotal,
      netProfitToday: profit,
    };
  }, [filterPeriod, expenses, invoices, todayStart]);

  // Pagination for Expenses List
  const expensePagination = usePagination({
    data: filteredExpenses,
    initialPageSize: 10,
  });

  const handleStartEdit = (exp: (typeof expenses)[number]) => {
    if (!canEditExpenses) {
      const err = 'You do not have permission to edit expenses.';
      if (Platform.OS === 'web') window.alert(err);
      else Alert.alert('Permission Denied', err);
      return;
    }
    setEditingExpenseId(exp.id);
    setCategory(exp.category);
    setAmount(String(exp.amount));
    setNote(exp.note || '');
    setMethod(exp.method);
  };

  const handleCancelEdit = () => {
    setEditingExpenseId(null);
    setCategory(EXPENSE_CATEGORIES[0]);
    setAmount('');
    setNote('');
    setMethod('cash');
  };

  const handleAdd = () => {
    if (editingExpenseId ? !canEditExpenses : !canAddExpenses) {
      const err = editingExpenseId
        ? 'You do not have permission to edit expenses.'
        : 'You do not have permission to add expenses.';
      if (Platform.OS === 'web') window.alert(err);
      else Alert.alert('Permission Denied', err);
      return;
    }
    const num = parseFloat(amount);
    if (!Number.isFinite(num) || num <= 0) {
      const err = 'Please enter a valid expense amount.';
      if (Platform.OS === 'web') window.alert(err);
      else Alert.alert('Invalid Amount', err);
      return;
    }

    if (editingExpenseId) {
      updateExpense(editingExpenseId, {
        category,
        amount: num,
        note: note.trim() || undefined,
        method,
      });
      handleCancelEdit();
      const msg = `Expense updated to Rs. ${num.toLocaleString()} (${category}).`;
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Updated', msg);
      return;
    }

    addExpense({
      category,
      amount: num,
      note: note.trim() || undefined,
      method,
      paidBy: user?.name || 'Manager',
    });

    setAmount('');
    setNote('');
    const msg = `Expense of Rs. ${num.toLocaleString()} recorded under ${category}.`;
    if (Platform.OS === 'web') window.alert(msg);
    else Alert.alert('Recorded', msg);
  };

  const handleDelete = (id: string) => {
    if (!canDeleteExpenses) {
      const err = 'You do not have permission to delete expenses.';
      if (Platform.OS === 'web') window.alert(err);
      else Alert.alert('Permission Denied', err);
      return;
    }
    const performDelete = () => {
      deleteExpense(id);
      if (editingExpenseId === id) handleCancelEdit();
    };
    const confirm = 'Delete this expense entry?';
    if (Platform.OS === 'web') {
      if (window.confirm(confirm)) performDelete();
    } else {
      Alert.alert('Delete Expense', confirm, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: performDelete },
      ]);
    }
  };

  if (user?.role !== 'admin' && !can('canAccessExpenses')) {
    return (
      <PermissionDeniedScreen
        moduleName="Expenses & Cash Outflow"
        urduModuleName="اخراجات اور کیش آؤٹ فلو"
        requiredPermission="canAccessExpenses"
        backRoute={backRoute}
      />
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, isMobile && { padding: 12 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          {...(Platform.OS === 'web' ? ({ className: 'interactive-btn' } as any) : {})}
          onPress={() => (router.canGoBack() ? router.back() : router.replace(backRoute as any))}
        >
          <Ionicons name="arrow-back" size={20} color={BRAND.ink} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Daily Expenses & Ledger</Text>
          <Text style={styles.headerSubtitle}>
            Kitchen Groceries, Utilities, Staff Advances & P&L
          </Text>
        </View>
      </View>

      {/* P&L Financial Summary Bar */}
      <View style={styles.pnlContainer}>
        <View style={styles.pnlHeaderRow}>
          <Text style={styles.pnlTitle}>{"Today's Financial Balance (P&L)"}</Text>
          <Text style={styles.pnlDate}>
            {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </Text>
        </View>
        <View style={styles.pnlBoxesGrid}>
          {/* Inflow Box */}
          <View
            {...(Platform.OS === 'web' ? ({ className: 'interactive-card' } as any) : {})}
            style={[styles.pnlBox, styles.pnlBoxEmerald]}
          >
            <View style={styles.pnlBoxHeader}>
              <Text style={[styles.pnlLabel, { color: '#059669' }]}>{"Today's Inflow (Sales)"}</Text>
              <View style={[styles.pnlIconOrb, { backgroundColor: '#D1FAE5' }]}>
                <Ionicons name="trending-up" size={16} color="#059669" />
              </View>
            </View>
            <Text style={[styles.pnlVal, { color: '#047857' }]}>
              {canViewRevenue ? money(todayRevenue) : '••••••••'}
            </Text>
            <Text style={[styles.pnlMeta, { color: '#065F46' }]}>{todayInvoices.length} Bills Settled</Text>
          </View>

          {/* Outflow Box */}
          <View
            {...(Platform.OS === 'web' ? ({ className: 'interactive-card' } as any) : {})}
            style={[styles.pnlBox, styles.pnlBoxRose]}
          >
            <View style={styles.pnlBoxHeader}>
              <Text style={[styles.pnlLabel, { color: '#DC2626' }]}>Outflow (Expenses)</Text>
              <View style={[styles.pnlIconOrb, { backgroundColor: '#FEE2E2' }]}>
                <Ionicons name="trending-down" size={16} color="#DC2626" />
              </View>
            </View>
            <Text style={[styles.pnlVal, { color: '#B91C1C' }]}>{money(totalExpenseAmount)}</Text>
            <Text style={[styles.pnlMeta, { color: '#991B1B' }]}>{filteredExpenses.length} Expense Slips</Text>
          </View>

          {/* Net Profit Box */}
          <View
            {...(Platform.OS === 'web' ? ({ className: 'interactive-card' } as any) : {})}
            style={[
              styles.pnlBox,
              netProfitToday >= 0 ? styles.pnlBoxGold : styles.pnlBoxRose,
            ]}
          >
            <View style={styles.pnlBoxHeader}>
              <Text style={[styles.pnlLabel, { color: netProfitToday >= 0 ? '#B45309' : '#DC2626' }]}>
                Net Cash Profit
              </Text>
              <View
                style={[
                  styles.pnlIconOrb,
                  { backgroundColor: netProfitToday >= 0 ? '#FDE68A' : '#FEE2E2' },
                ]}
              >
                <Ionicons
                  name={netProfitToday >= 0 ? 'wallet-outline' : 'alert-circle-outline'}
                  size={16}
                  color={netProfitToday >= 0 ? '#B45309' : '#DC2626'}
                />
              </View>
            </View>
            <Text
              style={[
                styles.pnlVal,
                { color: netProfitToday >= 0 ? '#92400E' : '#B91C1C' },
              ]}
            >
              {canViewRevenue ? money(netProfitToday) : '••••••••'}
            </Text>
            <Text
              style={[
                styles.pnlMeta,
                { color: netProfitToday >= 0 ? '#78350F' : '#991B1B' },
              ]}
            >
              In Drawer Cash
            </Text>
          </View>
        </View>
      </View>

      {/* Record / Edit Expense Card */}
      {(canAddExpenses || (editingExpenseId !== null && canEditExpenses)) ? (
        <View
          {...(Platform.OS === 'web' ? ({ className: 'interactive-card' } as any) : {})}
          style={styles.entryCard}
        >
          <View style={styles.entryHeaderRow}>
            <Text style={styles.cardTitle}>
              {editingExpenseId ? 'Edit Recorded Expense' : 'Record Cash / Online Expense'}
            </Text>
            {editingExpenseId !== null && (
              <TouchableOpacity style={styles.cancelEditBtn} onPress={handleCancelEdit}>
                <Ionicons name="close-circle-outline" size={15} color={BRAND.burgundy} />
                <Text style={styles.cancelEditBtnText}>Cancel Edit</Text>
              </TouchableOpacity>
            )}
          </View>

          <RoyalDropdown
            label="Expense Category"
            placeholder="Select expense category..."
            options={EXPENSE_CATEGORIES}
            value={category}
            onSelect={(cat) => setCategory(cat)}
            icon="wallet-outline"
            searchable
            style={{ marginBottom: 14 }}
          />

          <View style={styles.amountRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.inputLabel}>Amount (PKR)</Text>
              <TextInput
                style={styles.amountInput}
                placeholder="e.g. 3500"
                placeholderTextColor={BRAND.muted}
                keyboardType="numeric"
                value={amount}
                onChangeText={setAmount}
              />
            </View>

            <View style={{ width: 140 }}>
              <Text style={styles.inputLabel}>Payment Method</Text>
              <View style={styles.methodToggle}>
                <TouchableOpacity
                  {...(Platform.OS === 'web' ? ({ className: 'interactive-btn' } as any) : {})}
                  style={[styles.methodBtn, method === 'cash' && styles.methodBtnActive]}
                  onPress={() => setMethod('cash')}
                >
                  <Text style={[styles.methodBtnText, method === 'cash' && styles.methodBtnTextActive]}>
                    Cash
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  {...(Platform.OS === 'web' ? ({ className: 'interactive-btn' } as any) : {})}
                  style={[styles.methodBtn, method === 'online' && styles.methodBtnActive]}
                  onPress={() => setMethod('online')}
                >
                  <Text style={[styles.methodBtnText, method === 'online' && styles.methodBtnTextActive]}>
                    Online
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <Text style={styles.inputLabel}>Description / Supplier / Voucher Note</Text>
          <TextInput
            style={styles.noteInput}
            placeholder="e.g. 5kg Boneless Chicken from wholesale meat supplier..."
            placeholderTextColor={BRAND.muted}
            value={note}
            onChangeText={setNote}
          />

          <TouchableOpacity
            style={styles.submitBtn}
            {...(Platform.OS === 'web' ? ({ className: 'interactive-btn' } as any) : {})}
            onPress={handleAdd}
          >
            <Ionicons
              name={editingExpenseId ? 'checkmark-circle-outline' : 'add-circle-outline'}
              size={18}
              color="#fff"
              style={{ marginRight: 6 }}
            />
            <Text style={styles.submitBtnText}>
              {editingExpenseId ? 'Save Expense Changes' : 'Add Expense to Shift Ledger'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Expense History Header */}
      <View style={styles.historyHeader}>
        <Text style={styles.cardTitle}>Expense History ({filteredExpenses.length})</Text>
        <View style={styles.filterPills}>
          <TouchableOpacity
            {...(Platform.OS === 'web' ? ({ className: 'interactive-btn' } as any) : {})}
            style={[styles.filterPill, filterPeriod === 'today' && styles.filterPillActive]}
            onPress={() => setFilterPeriod('today')}
          >
            <Text style={[styles.filterPillText, filterPeriod === 'today' && styles.filterPillTextActive]}>
              Today
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            {...(Platform.OS === 'web' ? ({ className: 'interactive-btn' } as any) : {})}
            style={[styles.filterPill, filterPeriod === 'all' && styles.filterPillActive]}
            onPress={() => setFilterPeriod('all')}
          >
            <Text style={[styles.filterPillText, filterPeriod === 'all' && styles.filterPillTextActive]}>
              All Time
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Expenses List */}
      {filteredExpenses.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="wallet-outline" size={42} color={BRAND.muted} />
          <Text style={styles.emptyTitle}>No Expenses Recorded</Text>
          <Text style={styles.emptyDesc}>Expenses recorded here deduct from shift net cash automatically.</Text>
        </View>
      ) : (
        <>
          {expensePagination.paginatedData.map((exp) => (
            <View
              key={exp.id}
              {...(Platform.OS === 'web' ? ({ className: 'interactive-card' } as any) : {})}
              style={styles.expenseItem}
            >
              <View style={styles.expenseIcon}>
                <Ionicons
                  name={exp.method === 'cash' ? 'cash-outline' : 'card-outline'}
                  size={22}
                  color={BRAND.burgundy}
                />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.itemTopRow}>
                  <Text style={styles.itemCategory}>{exp.category}</Text>
                  <Text style={styles.itemAmount}>- {money(exp.amount)}</Text>
                </View>
                {exp.note && <Text style={styles.itemNote}>{`"${exp.note}"`}</Text>}
                <Text style={styles.itemMeta}>
                  Paid via {exp.method.toUpperCase()} • Recorded by {exp.paidBy || 'Staff'} at {formatTime(exp.at)}
                </Text>
              </View>
              {(canEditExpenses || canDeleteExpenses) && (
                <View style={styles.rowActions}>
                  {canEditExpenses && (
                    <TouchableOpacity style={styles.editBtn} onPress={() => handleStartEdit(exp)}>
                      <Ionicons name="pencil-outline" size={16} color={BRAND.burgundy} />
                    </TouchableOpacity>
                  )}
                  {canDeleteExpenses && (
                    <TouchableOpacity style={styles.delBtn} onPress={() => handleDelete(exp.id)}>
                      <Ionicons name="trash-outline" size={16} color="#D32F2F" />
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          ))}

          <PaginationControl
            currentPage={expensePagination.currentPage}
            totalPages={expensePagination.totalPages}
            totalItems={expensePagination.totalItems}
            pageSize={expensePagination.pageSize}
            pageSizeOptions={[10, 20, 50, 100]}
            onPageChange={expensePagination.goToPage}
            onPageSizeChange={expensePagination.setPageSize}
            itemName="expenses"
          />
        </>
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
    marginBottom: 20,
    gap: 12,
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: BRAND.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: BRAND.ink,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#475569',
    fontWeight: '500',
    marginTop: 2,
  },
  pnlCard: {
    backgroundColor: '#fff',
    padding: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BRAND.border,
    marginBottom: 24,
  },
  pnlContainer: {
    marginBottom: 24,
  },
  pnlHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    flexWrap: 'wrap',
    gap: 6,
  },
  pnlTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: BRAND.ink,
    letterSpacing: -0.2,
  },
  pnlDate: {
    fontSize: 13.5,
    color: '#475569',
    fontWeight: '700',
  },
  pnlBoxesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  pnlBox: {
    flex: 1,
    minWidth: 140,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  pnlBoxEmerald: {
    backgroundColor: 'rgba(236, 253, 245, 0.95)',
    borderColor: 'rgba(16, 185, 129, 0.4)',
  },
  pnlBoxRose: {
    backgroundColor: 'rgba(254, 242, 242, 0.95)',
    borderColor: 'rgba(239, 68, 68, 0.4)',
  },
  pnlBoxGold: {
    backgroundColor: 'rgba(254, 243, 199, 0.95)',
    borderColor: 'rgba(212, 175, 55, 0.5)',
  },
  pnlBoxHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  pnlIconOrb: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pnlLabel: {
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  pnlVal: {
    fontSize: 26,
    fontWeight: '900',
    marginBottom: 4,
  },
  pnlMeta: {
    fontSize: 13,
    fontWeight: '700',
  },
  entryCard: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BRAND.border,
    marginBottom: 24,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: BRAND.ink,
  },
  inputLabel: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#1E293B',
    marginTop: 14,
    marginBottom: 6,
  },
  catScroll: {
    marginBottom: 6,
  },
  catPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    marginRight: 8,
  },
  catPillActive: {
    backgroundColor: BRAND.burgundy,
  },
  catPillText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  catPillTextActive: {
    color: '#fff',
  },
  amountRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  amountInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BRAND.border,
    padding: 12,
    fontSize: 17,
    fontWeight: '700',
    color: BRAND.ink,
  },
  methodToggle: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    padding: 3,
    height: 48,
  },
  methodBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  methodBtnActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  methodBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  methodBtnTextActive: {
    color: BRAND.ink,
    fontWeight: '800',
  },
  noteInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BRAND.border,
    padding: 12,
    fontSize: 14.5,
    color: BRAND.ink,
    marginBottom: 18,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BRAND.burgundy,
    paddingVertical: 14,
    borderRadius: 10,
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 15.5,
    fontWeight: '800',
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    flexWrap: 'wrap',
    gap: 8,
  },
  filterPills: {
    flexDirection: 'row',
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#E2E8F0',
  },
  filterPillActive: {
    backgroundColor: BRAND.burgundy,
  },
  filterPillText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  filterPillTextActive: {
    color: '#fff',
  },
  expenseItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BRAND.border,
    marginBottom: 12,
    gap: 14,
    flexWrap: 'wrap',
  },
  expenseIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: BRAND.burgundySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  itemCategory: {
    fontSize: 16,
    fontWeight: '800',
    color: BRAND.ink,
  },
  itemAmount: {
    fontSize: 17,
    fontWeight: '800',
    color: '#DC2626',
  },
  itemNote: {
    fontSize: 14,
    color: '#334155',
    fontWeight: '500',
    marginTop: 3,
  },
  itemMeta: {
    fontSize: 12.5,
    color: '#475569',
    fontWeight: '600',
    marginTop: 4,
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  editBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: BRAND.burgundySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  delBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  entryHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  cancelEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: BRAND.burgundySoft,
    marginBottom: 10,
  },
  cancelEditBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: BRAND.burgundy,
  },
  emptyCard: {
    padding: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BRAND.border,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: BRAND.ink,
    marginTop: 10,
  },
  emptyDesc: {
    fontSize: 14,
    color: '#475569',
    marginTop: 4,
    textAlign: 'center',
  },
});
