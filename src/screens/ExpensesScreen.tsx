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
  Modal,
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
  const expenseCategories = useOpsStore((s) => (s.expenseCategories && s.expenseCategories.length > 0 ? s.expenseCategories : [...EXPENSE_CATEGORIES]));
  const addExpense = useOpsStore((s) => s.addExpense);
  const updateExpense = useOpsStore((s) => s.updateExpense);
  const deleteExpense = useOpsStore((s) => s.deleteExpense);
  const addExpenseCategory = useOpsStore((s) => s.addExpenseCategory);
  const renameExpenseCategory = useOpsStore((s) => s.renameExpenseCategory);
  const deleteExpenseCategory = useOpsStore((s) => s.deleteExpenseCategory);

  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [category, setCategory] = useState<string>(expenseCategories[0] || EXPENSE_CATEGORIES[0]);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [method, setMethod] = useState<ExpenseMethod>('cash');
  const [formHeadType, setFormHeadType] = useState<'opex' | 'capex'>('opex');
  const [filterPeriod, setFilterPeriod] = useState<'today' | 'all'>('today');
  const [filterHeadType, setFilterHeadType] = useState<'all' | 'opex' | 'capex'>('all');
  const [todayStart] = useState(() => startOfDay(Date.now()));

  // Manage Account Heads Modal
  const [isManageHeadsOpen, setIsManageHeadsOpen] = useState(false);
  const [newHeadInput, setNewHeadInput] = useState('');
  const [editingHeadOld, setEditingHeadOld] = useState<string | null>(null);
  const [editingHeadNew, setEditingHeadNew] = useState('');

  const {
    filteredExpenses,
    todayInvoices,
    todayRevenue,
    totalExpenseAmount,
    opexTotal,
    capexTotal,
    netProfitToday,
  } = useMemo(() => {
    const invList = invoices || [];
    const expList = expenses || [];
    let periodExpenses = filterPeriod === 'today'
      ? expList.filter((e) => e.at >= todayStart)
      : expList;

    let filtered = periodExpenses;
    if (filterHeadType === 'opex') {
      filtered = periodExpenses.filter((e) => !e.isCapEx && e.headType !== 'capex');
    } else if (filterHeadType === 'capex') {
      filtered = periodExpenses.filter((e) => e.isCapEx || e.headType === 'capex');
    }

    const invs = invList.filter((inv) => inv.status !== 'voided' && (inv.timeSettled || inv.timePlaced) >= todayStart);
    const rev = invs.reduce((sum, inv) => sum + (inv.total || 0), 0);
    const expTotal = periodExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    const opex = periodExpenses.filter((e) => !e.isCapEx && e.headType !== 'capex').reduce((sum, e) => sum + (e.amount || 0), 0);
    const capex = periodExpenses.filter((e) => e.isCapEx || e.headType === 'capex').reduce((sum, e) => sum + (e.amount || 0), 0);
    const profit = rev - opex; // Operating cash profit after daily OpEx

    return {
      filteredExpenses: filtered,
      todayInvoices: invs,
      todayRevenue: rev,
      totalExpenseAmount: expTotal,
      opexTotal: opex,
      capexTotal: capex,
      netProfitToday: profit,
    };
  }, [filterPeriod, filterHeadType, expenses, invoices, todayStart]);

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
    setFormHeadType(exp.isCapEx || exp.headType === 'capex' ? 'capex' : 'opex');
  };

  const handleCancelEdit = () => {
    setEditingExpenseId(null);
    setCategory(expenseCategories[0] || EXPENSE_CATEGORIES[0]);
    setAmount('');
    setNote('');
    setMethod('cash');
    setFormHeadType('opex');
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

    const isCapExSelected = formHeadType === 'capex';

    if (editingExpenseId) {
      updateExpense(editingExpenseId, {
        category,
        amount: num,
        note: note.trim() || undefined,
        method,
        isCapEx: isCapExSelected,
        headType: formHeadType,
      });
      handleCancelEdit();
      const msg = `Expense updated to Rs. ${num.toLocaleString()} (${category}) [${isCapExSelected ? 'CapEx' : 'OpEx'}].`;
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
      isCapEx: isCapExSelected,
      headType: formHeadType,
    });

    setAmount('');
    setNote('');
    const msg = `Expense of Rs. ${num.toLocaleString()} recorded under ${category} [${isCapExSelected ? 'CapEx' : 'OpEx'}].`;
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
            Kitchen Groceries, Utilities, Staff Advances, CapEx & P&L
          </Text>
        </View>
        <TouchableOpacity
          style={styles.manageHeadsBtn}
          onPress={() => setIsManageHeadsOpen(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="folder-open-outline" size={16} color={BRAND.burgundy} />
          <Text style={styles.manageHeadsBtnText}>Account Heads ({expenseCategories.length})</Text>
        </TouchableOpacity>
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
              <Text style={[styles.pnlLabel, { color: '#059669' }]}>{"Today's Sales Inflow"}</Text>
              <View style={[styles.pnlIconOrb, { backgroundColor: '#D1FAE5' }]}>
                <Ionicons name="trending-up" size={16} color="#059669" />
              </View>
            </View>
            <Text style={[styles.pnlVal, { color: '#047857' }]}>
              {canViewRevenue ? money(todayRevenue) : '••••••••'}
            </Text>
            <Text style={[styles.pnlMeta, { color: '#065F46' }]}>{todayInvoices.length} Bills Settled</Text>
          </View>

          {/* Operating Outflow (OpEx) Box */}
          <View
            {...(Platform.OS === 'web' ? ({ className: 'interactive-card' } as any) : {})}
            style={[styles.pnlBox, styles.pnlBoxRose]}
          >
            <View style={styles.pnlBoxHeader}>
              <Text style={[styles.pnlLabel, { color: '#DC2626' }]}>Daily OpEx (Kitchen/Bills)</Text>
              <View style={[styles.pnlIconOrb, { backgroundColor: '#FEE2E2' }]}>
                <Ionicons name="flash-outline" size={16} color="#DC2626" />
              </View>
            </View>
            <Text style={[styles.pnlVal, { color: '#B91C1C' }]}>{money(opexTotal)}</Text>
            <Text style={[styles.pnlMeta, { color: '#991B1B' }]}>Direct Daily Running Costs</Text>
          </View>

          {/* Capital Outlay (CapEx) Box */}
          <View
            {...(Platform.OS === 'web' ? ({ className: 'interactive-card' } as any) : {})}
            style={[styles.pnlBox, { borderColor: '#FDE047', backgroundColor: '#FEFCE8' }]}
          >
            <View style={styles.pnlBoxHeader}>
              <Text style={[styles.pnlLabel, { color: '#854D0E' }]}>Capital CapEx Outlay</Text>
              <View style={[styles.pnlIconOrb, { backgroundColor: '#FEF9C3' }]}>
                <Ionicons name="diamond-outline" size={16} color="#854D0E" />
              </View>
            </View>
            <Text style={[styles.pnlVal, { color: '#713F12' }]}>{money(capexTotal)}</Text>
            <Text style={[styles.pnlMeta, { color: '#854D0E' }]}>Balance Sheet Equipment</Text>
          </View>

          {/* Net Operating Profit Box */}
          <View
            {...(Platform.OS === 'web' ? ({ className: 'interactive-card' } as any) : {})}
            style={[
              styles.pnlBox,
              netProfitToday >= 0 ? styles.pnlBoxGold : styles.pnlBoxRose,
            ]}
          >
            <View style={styles.pnlBoxHeader}>
              <Text style={[styles.pnlLabel, { color: netProfitToday >= 0 ? '#B45309' : '#DC2626' }]}>
                Net Operating Cash
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
              Sales - Daily OpEx
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

          {/* OpEx vs CapEx Segmented Selector */}
          <View style={styles.headTypeToggleContainer}>
            <TouchableOpacity
              style={[styles.headTypeBtn, formHeadType === 'opex' && styles.headTypeBtnActive]}
              onPress={() => setFormHeadType('opex')}
              activeOpacity={0.8}
            >
              <Ionicons
                name="flash"
                size={14}
                color={formHeadType === 'opex' ? '#FFFFFF' : '#475569'}
              />
              <Text
                style={[
                  styles.headTypeBtnText,
                  formHeadType === 'opex' && styles.headTypeBtnTextActive,
                ]}
              >
                ⚡ Operating Expense (OpEx)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.headTypeBtn, formHeadType === 'capex' && styles.headTypeBtnCapExActive]}
              onPress={() => setFormHeadType('capex')}
              activeOpacity={0.8}
            >
              <Ionicons
                name="diamond"
                size={14}
                color={formHeadType === 'capex' ? '#FFFFFF' : '#475569'}
              />
              <Text
                style={[
                  styles.headTypeBtnText,
                  formHeadType === 'capex' && styles.headTypeBtnTextActive,
                ]}
              >
                💎 Capital Investment (CapEx)
              </Text>
            </TouchableOpacity>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 14 }}>
            <View style={{ flex: 1 }}>
              <RoyalDropdown
                label="Account Head / Category"
                placeholder="Select account head..."
                options={expenseCategories.map((c) => ({ label: c, value: c }))}
                value={category}
                onSelect={(cat) => setCategory(cat)}
                icon="wallet-outline"
                searchable
              />
            </View>
            <TouchableOpacity
              style={styles.inlineManageBtn}
              onPress={() => setIsManageHeadsOpen(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="folder-open-outline" size={18} color={BRAND.burgundy} />
            </TouchableOpacity>
          </View>

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
              {editingExpenseId
                ? 'Save Expense Changes'
                : `Record ${formHeadType === 'capex' ? 'CapEx Investment' : 'OpEx Expense'}`}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Expense History Header */}
      <View style={styles.historyHeader}>
        <Text style={styles.cardTitle}>Expense History ({filteredExpenses.length})</Text>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Period Filter */}
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

          {/* OpEx vs CapEx Filter */}
          <View style={styles.filterPills}>
            <TouchableOpacity
              style={[styles.filterPill, filterHeadType === 'all' && styles.filterPillActive]}
              onPress={() => setFilterHeadType('all')}
            >
              <Text style={[styles.filterPillText, filterHeadType === 'all' && styles.filterPillTextActive]}>
                All Heads
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.filterPill, filterHeadType === 'opex' && styles.filterPillActive]}
              onPress={() => setFilterHeadType('opex')}
            >
              <Text style={[styles.filterPillText, filterHeadType === 'opex' && styles.filterPillTextActive]}>
                ⚡ OpEx
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.filterPill, filterHeadType === 'capex' && styles.filterPillActive]}
              onPress={() => setFilterHeadType('capex')}
            >
              <Text style={[styles.filterPillText, filterHeadType === 'capex' && styles.filterPillTextActive]}>
                💎 CapEx
              </Text>
            </TouchableOpacity>
          </View>
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
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1 }}>
                    <Text style={styles.itemCategory}>{exp.category}</Text>
                    {exp.isCapEx || exp.headType === 'capex' ? (
                      <View style={styles.capexBadge}>
                        <Ionicons name="diamond" size={10} color="#854D0E" />
                        <Text style={styles.capexBadgeText}>CapEx</Text>
                      </View>
                    ) : (
                      <View style={styles.opexBadge}>
                        <Ionicons name="flash" size={10} color="#0369A1" />
                        <Text style={styles.opexBadgeText}>OpEx</Text>
                      </View>
                    )}
                    {exp.sourcePOId ? (
                      <View style={styles.poBadge}>
                        <Ionicons name="cart" size={10} color="#0D9488" />
                        <Text style={styles.poBadgeText}>Supplier PO</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text
                    style={[
                      styles.itemAmount,
                      (exp.isCapEx || exp.headType === 'capex') && { color: '#B45309' },
                    ]}
                  >
                    - {money(exp.amount)}
                  </Text>
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

      {/* -------------------- MANAGE ACCOUNT HEADS MODAL -------------------- */}
      <Modal visible={isManageHeadsOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, isMobile && { width: '95%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name="folder-open" size={20} color={BRAND.burgundy} />
                <Text style={styles.modalTitle}>Manage Account Heads (Expense Categories)</Text>
              </View>
              <TouchableOpacity onPress={() => setIsManageHeadsOpen(false)}>
                <Ionicons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            <View style={{ padding: 16 }}>
              {/* Add New Head */}
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                <TextInput
                  style={[styles.modalInput, { flex: 1 }]}
                  placeholder="New Head Name (e.g. Generator Fuel, Staff Tea)..."
                  placeholderTextColor="#94A3B8"
                  value={newHeadInput}
                  onChangeText={setNewHeadInput}
                />
                <TouchableOpacity
                  style={styles.modalAddBtn}
                  onPress={() => {
                    if (!newHeadInput.trim()) return;
                    addExpenseCategory(newHeadInput.trim());
                    setNewHeadInput('');
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="add" size={18} color="#FFFFFF" />
                  <Text style={styles.modalAddBtnText}>Add Head</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
                {expenseCategories.map((head) => {
                  const count = (expenses || []).filter((e) => e.category === head).length;
                  const isEditing = editingHeadOld === head;
                  return (
                    <View key={head} style={styles.headRowItem}>
                      {isEditing ? (
                        <View style={{ flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                          <TextInput
                            style={[styles.modalInput, { flex: 1, height: 36, paddingVertical: 4 }]}
                            value={editingHeadNew}
                            onChangeText={setEditingHeadNew}
                            autoFocus
                          />
                          <TouchableOpacity
                            onPress={() => {
                              if (editingHeadNew.trim() && editingHeadNew.trim() !== head) {
                                renameExpenseCategory(head, editingHeadNew.trim());
                              }
                              setEditingHeadOld(null);
                              setEditingHeadNew('');
                            }}
                            style={{ padding: 6 }}
                          >
                            <Ionicons name="checkmark-circle" size={22} color="#059669" />
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => {
                              setEditingHeadOld(null);
                              setEditingHeadNew('');
                            }}
                            style={{ padding: 6 }}
                          >
                            <Ionicons name="close-circle" size={22} color="#DC2626" />
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.headRowTitle}>{head}</Text>
                            <Text style={styles.headRowCount}>{count} {count === 1 ? 'voucher recorded' : 'vouchers recorded'}</Text>
                          </View>
                          <View style={{ flexDirection: 'row', gap: 4 }}>
                            <TouchableOpacity
                              onPress={() => {
                                setEditingHeadOld(head);
                                setEditingHeadNew(head);
                              }}
                              style={{ padding: 6 }}
                            >
                              <Ionicons name="pencil-outline" size={17} color="#475569" />
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => {
                                if (count > 0) {
                                  const warn = `Cannot delete "${head}" because ${count} expense voucher(s) are recorded under it.`;
                                  if (Platform.OS === 'web') window.alert(warn);
                                  else Alert.alert('Head in Use', warn);
                                  return;
                                }
                                deleteExpenseCategory(head);
                              }}
                              style={{ padding: 6 }}
                            >
                              <Ionicons name="trash-outline" size={17} color="#DC2626" />
                            </TouchableOpacity>
                          </View>
                        </>
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            </View>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalDoneBtn}
                onPress={() => setIsManageHeadsOpen(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.modalDoneBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  manageHeadsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: BRAND.burgundySoft,
    borderWidth: 1,
    borderColor: 'rgba(82, 23, 27, 0.2)',
  },
  manageHeadsBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: BRAND.burgundy,
  },
  headTypeToggleContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
    flexWrap: 'wrap',
  },
  headTypeBtn: {
    flex: 1,
    minWidth: 180,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
  },
  headTypeBtnActive: {
    backgroundColor: '#0284C7',
    borderColor: '#0284C7',
  },
  headTypeBtnCapExActive: {
    backgroundColor: '#B45309',
    borderColor: '#B45309',
  },
  headTypeBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  headTypeBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  inlineManageBtn: {
    height: 48,
    width: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BRAND.border,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  capexBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FEF9C3',
    borderWidth: 1,
    borderColor: '#FDE047',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  capexBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#854D0E',
  },
  opexBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#E0F2FE',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  opexBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#0369A1',
  },
  poBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#99F6E4',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  poBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#0D9488',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  modalTitle: {
    fontSize: 15.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13.5,
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
  },
  modalAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: BRAND.burgundy,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  modalAddBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  headRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    marginBottom: 6,
    gap: 8,
  },
  headRowTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#1E293B',
  },
  headRowCount: {
    fontSize: 11.5,
    color: '#64748B',
  },
  modalFooter: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    alignItems: 'flex-end',
  },
  modalDoneBtn: {
    backgroundColor: BRAND.burgundy,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
  },
  modalDoneBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13.5,
  },
});
