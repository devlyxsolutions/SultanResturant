import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import PaginationControl from '../components/PaginationControl';
import RoyalDropdown from '../components/RoyalDropdown';
import { usePagination } from '../hooks/usePagination';
import {
  Asset,
  ASSET_CATEGORIES,
  AssetCategory,
  AssetCondition,
  AssetStatus,
  useAuthStore,
  useOpsStore,
} from '../store';
import { formatDay, money } from '../utils/format';
import { useRolePermissions } from '../store/roleStore';

const LIGHT = {
  bg: '#F8F9FA',
  surface: '#FFFFFF',
  cardBg: '#FFFFFF',
  cardBorder: '#E2E8F0',
  burgundy: '#52171B',
  burgundyDark: '#3A0F12',
  burgundySoft: 'rgba(82, 23, 27, 0.08)',
  gold: '#B48214',
  goldSoft: 'rgba(180, 130, 20, 0.12)',
  goldBorder: 'rgba(180, 130, 20, 0.35)',
  ink: '#0F172A',
  textSecondary: '#334155',
  textMuted: '#475569',
  textDim: '#64748B',
  inputBg: '#FFFFFF',
  inputBorder: '#CBD5E1',
  emerald: '#10B981',
  emeraldSoft: '#ECFDF5',
  emeraldBorder: '#A7F3D0',
  amber: '#D97706',
  amberSoft: '#FFFBEB',
  amberBorder: '#FDE68A',
  rose: '#E11D48',
  roseSoft: '#FFF1F2',
  roseBorder: '#FECDD3',
  blue: '#2563EB',
  blueSoft: '#EFF6FF',
  blueBorder: '#BFDBFE',
  purple: '#7C3AED',
  purpleSoft: '#F5F3FF',
  purpleBorder: '#DDD6FE',
};

const CONDITIONS: { key: AssetCondition; label: string; color: string; bg: string; border: string }[] = [
  { key: 'brand_new', label: 'Brand New', color: '#047857', bg: LIGHT.emeraldSoft, border: LIGHT.emeraldBorder },
  { key: 'good', label: 'Good Working', color: '#1D4ED8', bg: LIGHT.blueSoft, border: LIGHT.blueBorder },
  { key: 'fair', label: 'Fair / Aging', color: '#B45309', bg: LIGHT.amberSoft, border: LIGHT.amberBorder },
  { key: 'needs_maintenance', label: 'Needs Repair', color: '#BE123C', bg: LIGHT.roseSoft, border: LIGHT.roseBorder },
];

const STATUSES: { key: AssetStatus; label: string; color: string; bg: string; border: string }[] = [
  { key: 'active', label: 'Active in Service', color: '#047857', bg: LIGHT.emeraldSoft, border: LIGHT.emeraldBorder },
  { key: 'in_maintenance', label: 'In Maintenance', color: '#B45309', bg: LIGHT.amberSoft, border: LIGHT.amberBorder },
  { key: 'retired', label: 'Retired / Scrapped', color: '#64748B', bg: '#F1F5F9', border: '#CBD5E1' },
  { key: 'written_off', label: 'Written Off', color: '#BE123C', bg: LIGHT.roseSoft, border: LIGHT.roseBorder },
];

export default function AssetsScreen({
  backRoute = '/admin/dashboard',
  role = 'admin',
}: {
  backRoute?: string;
  role?: 'admin' | 'manager';
}) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const user = useAuthStore((s) => s.user);
  const { canAddAssets, canEditAssets, canDeleteAssets } = useRolePermissions();
  const assets = useOpsStore((s) => s.assets || []);
  const damageRecords = useOpsStore((s) => s.damageRecords || []);
  const addAsset = useOpsStore((s) => s.addAsset);
  const updateAsset = useOpsStore((s) => s.updateAsset);
  const deleteAsset = useOpsStore((s) => s.deleteAsset);
  const addAssetMaintenanceLog = useOpsStore((s) => s.addAssetMaintenanceLog);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [maintenanceAsset, setMaintenanceAsset] = useState<Asset | null>(null);
  const [viewAsset, setViewAsset] = useState<Asset | null>(null);

  // Form State
  const [formName, setFormName] = useState('');
  const [formUrduName, setFormUrduName] = useState('');
  const [formCategory, setFormCategory] = useState<AssetCategory>(ASSET_CATEGORIES[0]);
  const [formCost, setFormCost] = useState('');
  const [formQty, setFormQty] = useState('1');
  const [formVendor, setFormVendor] = useState('');
  const [formVendorPhone, setFormVendorPhone] = useState('');
  const [formInvoiceNo, setFormInvoiceNo] = useState('');
  const [formLocation, setFormLocation] = useState('Main Kitchen Line 1');
  const [formCondition, setFormCondition] = useState<AssetCondition>('good');
  const [formStatus, setFormStatus] = useState<AssetStatus>('active');
  const [formDepreciationRate, setFormDepreciationRate] = useState('10');
  const [formSerial, setFormSerial] = useState('');
  const [formNotes, setFormNotes] = useState('');

  // Maintenance Form State
  const [maintCost, setMaintCost] = useState('');
  const [maintDesc, setMaintDesc] = useState('');
  const [maintTech, setMaintTech] = useState('');
  const [maintAutoExpense, setMaintAutoExpense] = useState(true);

  // Financial Stats
  const stats = useMemo(() => {
    let totalInvested = 0;
    let activeValue = 0;
    let activeCount = 0;
    let maintCount = 0;
    let totalMaintSpent = 0;

    assets.forEach((a) => {
      totalInvested += a.totalCost || a.cost * a.quantity;
      if (a.status === 'active') {
        activeCount += a.quantity || 1;
        activeValue += a.currentValue || a.totalCost;
      } else if (a.status === 'in_maintenance') {
        maintCount += a.quantity || 1;
      }
      if (a.maintenanceLogs && a.maintenanceLogs.length > 0) {
        a.maintenanceLogs.forEach((log) => {
          totalMaintSpent += log.cost || 0;
        });
      }
    });

    return {
      totalInvested,
      activeValue,
      activeCount,
      maintCount,
      totalMaintSpent,
      totalAssetsCount: assets.length,
    };
  }, [assets]);

  // Filtered Assets
  const filteredAssets = useMemo(() => {
    return assets.filter((ast) => {
      if (selectedCategory !== 'All' && ast.category !== selectedCategory) return false;
      if (selectedStatus !== 'All' && ast.status !== selectedStatus) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        ast.name.toLowerCase().includes(q) ||
        (ast.urduName && ast.urduName.toLowerCase().includes(q)) ||
        ast.assetCode.toLowerCase().includes(q) ||
        ast.vendor.toLowerCase().includes(q) ||
        ast.location.toLowerCase().includes(q) ||
        (ast.serialNumber && ast.serialNumber.toLowerCase().includes(q))
      );
    });
  }, [assets, selectedCategory, selectedStatus, search]);

  const assetsPagination = usePagination({
    data: filteredAssets,
    initialPageSize: 10,
  });

  const openAddModal = () => {
    if (!canAddAssets) {
      alertMsg('Permission Denied', 'You do not have permission to add capital assets.');
      return;
    }
    setEditingAsset(null);
    setFormName('');
    setFormUrduName('');
    setFormCategory(ASSET_CATEGORIES[0]);
    setFormCost('');
    setFormQty('1');
    setFormVendor('');
    setFormVendorPhone('');
    setFormInvoiceNo('');
    setFormLocation('Main Kitchen Line 1');
    setFormCondition('good');
    setFormStatus('active');
    setFormDepreciationRate('10');
    setFormSerial('');
    setFormNotes('');
    setIsAddModalOpen(true);
  };

  const openEditModal = (ast: Asset) => {
    if (!canEditAssets) {
      alertMsg('Permission Denied', 'You do not have permission to edit capital assets.');
      return;
    }
    setEditingAsset(ast);
    setFormName(ast.name);
    setFormUrduName(ast.urduName || '');
    setFormCategory(ast.category);
    setFormCost(String(ast.cost));
    setFormQty(String(ast.quantity || 1));
    setFormVendor(ast.vendor);
    setFormVendorPhone(ast.vendorPhone || '');
    setFormInvoiceNo(ast.invoiceNo || '');
    setFormLocation(ast.location);
    setFormCondition(ast.condition);
    setFormStatus(ast.status);
    setFormDepreciationRate(String(ast.depreciationRateYearly || 10));
    setFormSerial(ast.serialNumber || '');
    setFormNotes(ast.notes || '');
    setIsAddModalOpen(true);
  };

  const handleSaveAsset = () => {
    if (editingAsset ? !canEditAssets : !canAddAssets) {
      alertMsg(
        'Permission Denied',
        editingAsset
          ? 'You do not have permission to edit capital assets.'
          : 'You do not have permission to add capital assets.'
      );
      return;
    }
    if (!formName.trim()) {
      alertMsg('Missing Information', 'Please enter the asset name.');
      return;
    }
    const cost = parseFloat(formCost);
    if (!Number.isFinite(cost) || cost <= 0) {
      alertMsg('Invalid Cost', 'Please enter a valid purchase cost.');
      return;
    }
    const qty = parseInt(formQty, 10);
    if (!Number.isFinite(qty) || qty <= 0) {
      alertMsg('Invalid Quantity', 'Please enter a valid quantity.');
      return;
    }
    const depRate = parseFloat(formDepreciationRate) || 10;
    const totalCost = cost * qty;

    if (editingAsset) {
      updateAsset(editingAsset.id, {
        name: formName.trim(),
        urduName: formUrduName.trim() || undefined,
        category: formCategory,
        cost,
        quantity: qty,
        totalCost,
        vendor: formVendor.trim() || 'General Vendor',
        vendorPhone: formVendorPhone.trim() || undefined,
        invoiceNo: formInvoiceNo.trim() || undefined,
        location: formLocation.trim() || 'Main Kitchen',
        condition: formCondition,
        status: formStatus,
        depreciationRateYearly: depRate,
        serialNumber: formSerial.trim() || undefined,
        notes: formNotes.trim() || undefined,
      });
      alertMsg('Asset Updated', `[${editingAsset.assetCode}] ${formName} was updated successfully.`);
    } else {
      addAsset({
        assetCode: `AST-${formCategory.slice(0, 3).toUpperCase()}-${Date.now().toString().slice(-4)}`,
        name: formName.trim(),
        urduName: formUrduName.trim() || undefined,
        category: formCategory,
        purchaseDate: Date.now(),
        cost,
        quantity: qty,
        totalCost,
        vendor: formVendor.trim() || 'General Vendor',
        vendorPhone: formVendorPhone.trim() || undefined,
        invoiceNo: formInvoiceNo.trim() || undefined,
        location: formLocation.trim() || 'Main Kitchen',
        condition: formCondition,
        status: formStatus,
        depreciationRateYearly: depRate,
        serialNumber: formSerial.trim() || undefined,
        notes: formNotes.trim() || undefined,
      });
      alertMsg('Capital Asset Added', `New capital investment ${formName} (${money(totalCost)}) recorded.`);
    }
    setIsAddModalOpen(false);
  };

  const handleDelete = (ast: Asset) => {
    if (!canDeleteAssets) {
      alertMsg('Permission Denied', 'You do not have permission to delete capital assets.');
      return;
    }
    const confirm = () => {
      deleteAsset(ast.id);
      alertMsg('Asset Removed', `[${ast.assetCode}] ${ast.name} has been removed.`);
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Are you sure you want to delete asset [${ast.assetCode}] ${ast.name}?`)) {
        confirm();
      }
    } else {
      Alert.alert('Confirm Delete', `Delete asset [${ast.assetCode}] ${ast.name}?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: confirm },
      ]);
    }
  };

  const handleSaveMaintenance = () => {
    if (!canEditAssets) {
      alertMsg('Permission Denied', 'You do not have permission to log asset service or maintenance.');
      return;
    }
    if (!maintenanceAsset) return;
    const cost = parseFloat(maintCost);
    if (!Number.isFinite(cost) || cost < 0) {
      alertMsg('Invalid Cost', 'Please enter a valid repair cost.');
      return;
    }
    if (!maintDesc.trim()) {
      alertMsg('Missing Description', 'Please describe the repair or service performed.');
      return;
    }

    addAssetMaintenanceLog(
      maintenanceAsset.id,
      {
        date: Date.now(),
        cost,
        description: maintDesc.trim(),
        performedBy: maintTech.trim() || user?.name || 'Technician',
      },
      {
        autoRecordExpense: maintAutoExpense && cost > 0,
        paidBy: user?.name || 'Manager',
      }
    );

    alertMsg(
      'Service Logged',
      `Maintenance of ${money(cost)} recorded for [${maintenanceAsset.assetCode}]. ${maintAutoExpense && cost > 0 ? 'Also booked into restaurant expenses.' : ''
      }`
    );
    setMaintenanceAsset(null);
    setMaintCost('');
    setMaintDesc('');
    setMaintTech('');
  };

  function alertMsg(title: string, msg: string) {
    if (Platform.OS === 'web') window.alert(`${title}\n${msg}`);
    else Alert.alert(title, msg);
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {/* Light Header Bar */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.push(backRoute as any)}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={20} color={LIGHT.burgundy} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <View style={[styles.titleRow, { flexWrap: 'wrap' }]}>
              <Ionicons name="diamond" size={20} color={LIGHT.burgundy} />
              <Text style={styles.headerTitle}>Assets & Capital Capex</Text>
              <View style={styles.roleBadge}>
                <Text style={styles.roleBadgeText}>INVESTMENT AUDIT</Text>
              </View>
            </View>
            <Text style={styles.headerSub}>
              Heavy machinery, furniture, interior, generators, and capital inventory ledger
            </Text>
          </View>
        </View>

        {canAddAssets && (
          <TouchableOpacity style={styles.addAssetBtn} onPress={openAddModal} activeOpacity={0.85}>
            <Ionicons name="add-circle" size={18} color="#FFFFFF" />
            <Text style={styles.addAssetBtnText}>+ Add Capital Asset</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        {/* Light KPI Deck */}
        <View style={styles.kpiGrid}>
          {/* Total Invested */}
          <View style={[styles.kpiCard, { borderColor: LIGHT.goldBorder }]}>
            <View style={styles.kpiHeader}>
              <Text style={styles.kpiLabel}>TOTAL CAPITAL INVESTED</Text>
              <View style={[styles.kpiIconBox, { backgroundColor: LIGHT.goldSoft }]}>
                <Ionicons name="wallet-outline" size={18} color={LIGHT.gold} />
              </View>
            </View>
            <Text style={[styles.kpiValue, { color: LIGHT.gold }]}>{money(stats.totalInvested)}</Text>
            <Text style={styles.kpiHint}>{stats.totalAssetsCount} primary equipment & asset lots</Text>
          </View>

          {/* Active Book Value */}
          <View style={[styles.kpiCard, { borderColor: LIGHT.emeraldBorder }]}>
            <View style={styles.kpiHeader}>
              <Text style={styles.kpiLabel}>ACTIVE BOOK VALUE</Text>
              <View style={[styles.kpiIconBox, { backgroundColor: LIGHT.emeraldSoft }]}>
                <Ionicons name="shield-checkmark-outline" size={18} color={LIGHT.emerald} />
              </View>
            </View>
            <Text style={[styles.kpiValue, { color: LIGHT.emerald }]}>{money(stats.activeValue)}</Text>
            <Text style={styles.kpiHint}>{stats.activeCount} live units in daily service</Text>
          </View>

          {/* In Maintenance */}
          <View style={[styles.kpiCard, { borderColor: LIGHT.amberBorder }]}>
            <View style={styles.kpiHeader}>
              <Text style={styles.kpiLabel}>IN MAINTENANCE</Text>
              <View style={[styles.kpiIconBox, { backgroundColor: LIGHT.amberSoft }]}>
                <Ionicons name="construct-outline" size={18} color={LIGHT.amber} />
              </View>
            </View>
            <Text style={[styles.kpiValue, { color: LIGHT.amber }]}>
              {stats.maintCount} <Text style={{ fontSize: 15, fontWeight: '400', color: LIGHT.textSecondary }}>Units</Text>
            </Text>
            <Text style={styles.kpiHint}>Under active service or inspection</Text>
          </View>

          {/* Maintenance Spend */}
          <View style={[styles.kpiCard, { borderColor: LIGHT.blueBorder }]}>
            <View style={styles.kpiHeader}>
              <Text style={styles.kpiLabel}>TOTAL REPAIR EXPENSES</Text>
              <View style={[styles.kpiIconBox, { backgroundColor: LIGHT.blueSoft }]}>
                <Ionicons name="repeat-outline" size={18} color={LIGHT.blue} />
              </View>
            </View>
            <Text style={[styles.kpiValue, { color: LIGHT.blue }]}>{money(stats.totalMaintSpent)}</Text>
            <Text style={styles.kpiHint}>Accumulated maintenance logs</Text>
          </View>
        </View>

        {/* Search and Category Filters */}
        <View style={styles.searchSection}>
          <View style={styles.searchBar}>
            <Ionicons name="search-outline" size={18} color={LIGHT.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by asset code, name, vendor, location, serial..."
              placeholderTextColor={LIGHT.textDim}
              value={search}
              onChangeText={setSearch}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={18} color={LIGHT.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {/* Category & Status Dropdown Filters */}
          <View style={[styles.filterDropdownRow, isMobile && { flexDirection: 'column' }]}>
            <RoyalDropdown
              style={{ flex: 1 }}
              label="Filter by Asset Category"
              icon="funnel-outline"
              placeholder="All Categories"
              options={[
                { label: `All Categories (${assets.length})`, value: 'All' },
                ...ASSET_CATEGORIES.map((cat) => ({
                  label: `${cat} (${assets.filter((a) => a.category === cat).length})`,
                  value: cat,
                })),
              ]}
              value={selectedCategory}
              onSelect={(val) => setSelectedCategory(val)}
              searchable
            />
            <RoyalDropdown
              style={{ flex: isMobile ? 1 : 0.6 }}
              label="Filter by Operational Status"
              icon="shield-checkmark-outline"
              placeholder="All Statuses"
              options={[
                { label: `All Statuses (${assets.length})`, value: 'All' },
                ...STATUSES.map((s) => ({
                  label: `${s.label} (${assets.filter((a) => a.status === s.key).length})`,
                  value: s.key,
                })),
              ]}
              value={selectedStatus}
              onSelect={(val) => setSelectedStatus(val)}
            />
          </View>
        </View>

        {/* Asset Cards List */}
        <View style={styles.assetList}>
          {filteredAssets.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="cube-outline" size={48} color={LIGHT.textDim} />
              <Text style={styles.emptyTitle}>No Capital Assets Found</Text>
              <Text style={styles.emptySub}>
                Try adjusting your search criteria or register a new capital asset above.
              </Text>
            </View>
          ) : (
            <>
              {/* Desktop Table Column Header (Same as Suppliers screen) */}
              {!isMobile && (
                <View style={styles.tableHeaderRow}>
                  <View style={[styles.thCol, { flex: 2.8, minWidth: 220 }]}>
                    <Text style={styles.thText}>ASSET CODE & NAME</Text>
                  </View>
                  <View style={[styles.thCol, { flex: 2.2, minWidth: 170 }]}>
                    <Text style={styles.thText}>CATEGORY & LOCATION</Text>
                  </View>
                  <View style={[styles.thCol, { flex: 1.8, minWidth: 140 }]}>
                    <Text style={styles.thText}>PURCHASE VALUE</Text>
                  </View>
                  <View style={[styles.thCol, { flex: 2.0, minWidth: 160 }]}>
                    <Text style={styles.thText}>BOOK VALUE & STATUS</Text>
                  </View>
                  <View style={[styles.thCol, { flex: 2.4, minWidth: 200, alignItems: 'flex-end' }]}>
                    <Text style={styles.thText}>ACTIONS</Text>
                  </View>
                </View>
              )}

              {assetsPagination.paginatedData.map((ast) => {
                const cond = CONDITIONS.find((c) => c.key === ast.condition) || CONDITIONS[1];
                const stat = STATUSES.find((s) => s.key === ast.status) || STATUSES[0];
                const maintTotal = (ast.maintenanceLogs || []).reduce((acc, l) => acc + (l.cost || 0), 0);
                const linkedDamages = damageRecords.filter(
                  (d) => d.assetId === ast.id || d.assetCode === ast.assetCode
                );
                const damageLoss = linkedDamages.reduce((sum, d) => sum + (d.totalLoss || 0), 0);
                const damageUnits = linkedDamages.reduce((sum, d) => sum + (d.quantity || 1), 0);

                if (isMobile) {
                  return (
                    <View
                      key={ast.id}
                      style={[
                        styles.mobileAssetCard,
                        { borderLeftColor: cond.color || '#10B981' },
                      ]}
                    >
                      {/* Top: Code + Name on left, Cost on right */}
                      <View style={styles.mobileCardTopRow}>
                        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <View style={styles.codeTagCompact}>
                            <Text style={styles.codeTagCompactText}>{ast.assetCode}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.rowAssetName} numberOfLines={1}>{ast.name}</Text>
                            {ast.urduName ? <Text style={styles.rowUrduName} numberOfLines={1}>{ast.urduName}</Text> : null}
                          </View>
                        </View>

                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={styles.rowCostGold}>{money(ast.totalCost)}</Text>
                          <Text style={styles.rowCostSub}>{ast.quantity}x @ {money(ast.cost)}</Text>
                        </View>
                      </View>

                      {/* Mid: Category, Location & Badges */}
                      <View style={styles.mobileCardMidRow}>
                        <View style={styles.categoryBadgeCompact}>
                          <Ionicons name="pricetag-outline" size={11} color={LIGHT.burgundy} />
                          <Text style={styles.categoryBadgeCompactText} numberOfLines={1}>{ast.category}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                          <Ionicons name="location-outline" size={11} color={LIGHT.burgundy} />
                          <Text style={styles.rowLocationText} numberOfLines={1}>{ast.location || 'Kitchen'}</Text>
                        </View>
                        <View style={[styles.pillBadgeCompact, { backgroundColor: cond.bg, borderColor: cond.border }]}>
                          <Text style={[styles.pillBadgeCompactText, { color: cond.color }]}>{cond.label}</Text>
                        </View>
                        <View style={[styles.pillBadgeCompact, { backgroundColor: stat.bg, borderColor: stat.border }]}>
                          <Text style={[styles.pillBadgeCompactText, { color: stat.color }]}>{stat.label}</Text>
                        </View>
                      </View>

                      {/* Maintenance / Damage Notes if any */}
                      {(maintTotal > 0 || linkedDamages.length > 0) && (
                        <View style={styles.mobileAlertRow}>
                          {maintTotal > 0 && (
                            <View style={styles.microBadgeAmber}>
                              <Ionicons name="construct" size={10} color={LIGHT.amber} />
                              <Text style={styles.microBadgeAmberText}>Service: {money(maintTotal)}</Text>
                            </View>
                          )}
                          {linkedDamages.length > 0 && (
                            <TouchableOpacity
                              onPress={() => router.push(role === 'admin' ? '/admin/damages' : '/manager/damages')}
                              style={styles.microBadgeRose}
                              activeOpacity={0.8}
                            >
                              <Ionicons name="alert-circle" size={10} color={LIGHT.rose} />
                              <Text style={styles.microBadgeRoseText}>{linkedDamages.length} Damaged ({money(damageLoss)})</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      )}

                      {/* Actions */}
                      <View style={styles.mobileCardActionRow}>
                        <TouchableOpacity
                          style={styles.actionBtnAudit}
                          onPress={() => setViewAsset(ast)}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="document-text-outline" size={13} color={LIGHT.burgundy} />
                          <Text style={styles.actionBtnAuditText}>Audit</Text>
                        </TouchableOpacity>

                        {canEditAssets && (
                          <TouchableOpacity
                            style={styles.actionBtnService}
                            onPress={() => setMaintenanceAsset(ast)}
                            activeOpacity={0.8}
                          >
                            <Ionicons name="build-outline" size={13} color={LIGHT.amber} />
                            <Text style={styles.actionBtnServiceText}>Service</Text>
                          </TouchableOpacity>
                        )}

                        {canEditAssets && (
                          <TouchableOpacity
                            style={styles.actionBtnEditCompact}
                            onPress={() => openEditModal(ast)}
                            activeOpacity={0.8}
                          >
                            <Ionicons name="create-outline" size={13} color="#475569" />
                          </TouchableOpacity>
                        )}

                        {canDeleteAssets && (
                          <TouchableOpacity
                            style={styles.actionBtnDeleteCompact}
                            onPress={() => handleDelete(ast)}
                            activeOpacity={0.8}
                          >
                            <Ionicons name="trash-outline" size={13} color={LIGHT.rose} />
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  );
                }

                // Desktop / Tablet Horizontal Compact Strip (Same as Suppliers screen)
                return (
                  <View
                    key={ast.id}
                    style={[
                      styles.astRowCard,
                      { borderLeftColor: cond.color || '#10B981' },
                    ]}
                    {...(Platform.OS === 'web' ? ({ className: 'interactive-table-row' } as any) : {})}
                  >
                    {/* 1. Asset Code & Name */}
                    <View style={[styles.rowCol, { flex: 2.8, minWidth: 220, flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
                      <View style={styles.codeTagCompact}>
                        <Text style={styles.codeTagCompactText}>{ast.assetCode}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowAssetName} numberOfLines={1}>{ast.name}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                          {ast.urduName ? (
                            <Text style={styles.rowUrduName} numberOfLines={1}>{ast.urduName}</Text>
                          ) : null}
                          <Text style={styles.rowQtyText}>• Qty: {ast.quantity || 1}</Text>
                        </View>
                      </View>
                    </View>

                    {/* 2. Category & Location */}
                    <View style={[styles.rowCol, { flex: 2.2, minWidth: 170, gap: 2 }]}>
                      <View style={styles.categoryBadgeCompact}>
                        <Ionicons name="pricetag-outline" size={10} color={LIGHT.burgundy} />
                        <Text style={styles.categoryBadgeCompactText} numberOfLines={1}>{ast.category}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                        <Ionicons name="location-outline" size={11} color={LIGHT.burgundy} />
                        <Text style={styles.rowLocationText} numberOfLines={1}>{ast.location || 'Kitchen'}</Text>
                        {ast.vendor ? (
                          <Text style={styles.rowVendorText} numberOfLines={1}>• {ast.vendor}</Text>
                        ) : null}
                      </View>
                    </View>

                    {/* 3. Purchase Value */}
                    <View style={[styles.rowCol, { flex: 1.8, minWidth: 140, gap: 2 }]}>
                      <Text style={styles.rowCostGold}>{money(ast.totalCost)}</Text>
                      <Text style={styles.rowCostSub}>
                        {ast.quantity}x @ {money(ast.cost)}
                      </Text>
                    </View>

                    {/* 4. Book Value & Status */}
                    <View style={[styles.rowCol, { flex: 2.0, minWidth: 160, gap: 2 }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.rowBookValue}>{money(ast.currentValue || ast.totalCost)}</Text>
                        <View style={[styles.pillBadgeCompact, { backgroundColor: cond.bg, borderColor: cond.border }]}>
                          <Text style={[styles.pillBadgeCompactText, { color: cond.color }]}>{cond.label}</Text>
                        </View>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2, flexWrap: 'wrap' }}>
                        <View style={[styles.pillBadgeCompact, { backgroundColor: stat.bg, borderColor: stat.border }]}>
                          <Text style={[styles.pillBadgeCompactText, { color: stat.color }]}>{stat.label}</Text>
                        </View>
                        {maintTotal > 0 && (
                          <TouchableOpacity
                            onPress={() => setMaintenanceAsset(ast)}
                            style={styles.microBadgeAmber}
                            activeOpacity={0.8}
                          >
                            <Ionicons name="construct" size={10} color={LIGHT.amber} />
                            <Text style={styles.microBadgeAmberText}>{money(maintTotal)}</Text>
                          </TouchableOpacity>
                        )}
                        {linkedDamages.length > 0 && (
                          <TouchableOpacity
                            onPress={() => router.push(role === 'admin' ? '/admin/damages' : '/manager/damages')}
                            style={styles.microBadgeRose}
                            activeOpacity={0.8}
                          >
                            <Ionicons name="alert-circle" size={10} color={LIGHT.rose} />
                            <Text style={styles.microBadgeRoseText}>{linkedDamages.length} dmg</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>

                    {/* 5. Actions */}
                    <View style={[styles.rowCol, { flex: 2.4, minWidth: 200, alignItems: 'flex-end' }]}>
                      <View style={styles.actionRowCompact}>
                        <TouchableOpacity
                          style={styles.actionBtnAudit}
                          onPress={() => setViewAsset(ast)}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="document-text-outline" size={13} color={LIGHT.burgundy} />
                          <Text style={styles.actionBtnAuditText}>Audit</Text>
                        </TouchableOpacity>

                        {canEditAssets && (
                          <TouchableOpacity
                            style={styles.actionBtnService}
                            onPress={() => setMaintenanceAsset(ast)}
                            activeOpacity={0.8}
                          >
                            <Ionicons name="build-outline" size={13} color={LIGHT.amber} />
                            <Text style={styles.actionBtnServiceText}>Service</Text>
                          </TouchableOpacity>
                        )}

                        {canEditAssets && (
                          <TouchableOpacity
                            style={styles.actionBtnEditCompact}
                            onPress={() => openEditModal(ast)}
                            activeOpacity={0.8}
                          >
                            <Ionicons name="create-outline" size={13} color="#475569" />
                          </TouchableOpacity>
                        )}

                        {canDeleteAssets && (
                          <TouchableOpacity
                            style={styles.actionBtnDeleteCompact}
                            onPress={() => handleDelete(ast)}
                            activeOpacity={0.8}
                          >
                            <Ionicons name="trash-outline" size={13} color={LIGHT.rose} />
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  </View>
                );
              })}
            </>
          )}

          {filteredAssets.length > 0 && (
            <PaginationControl
              currentPage={assetsPagination.currentPage}
              totalPages={assetsPagination.totalPages}
              pageSize={assetsPagination.pageSize}
              totalItems={assetsPagination.totalItems}
              onPageChange={assetsPagination.goToPage}
              onPageSizeChange={assetsPagination.setPageSize}
              itemName="assets"
            />
          )}
        </View>
      </ScrollView>

      {/* -------------------- ADD / EDIT MODAL -------------------- */}
      <Modal visible={isAddModalOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, isMobile && { width: '95%', maxHeight: '92%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name="cube" size={20} color={LIGHT.burgundy} />
                <Text style={styles.modalTitle}>
                  {editingAsset ? `Edit [${editingAsset.assetCode}]` : 'Register New Capital Asset'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setIsAddModalOpen(false)}>
                <Ionicons name="close" size={22} color={LIGHT.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              {/* Asset Name */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Asset Name / Description *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Commercial 4-Burner Range Cooker"
                  placeholderTextColor={LIGHT.textDim}
                  value={formName}
                  onChangeText={setFormName}
                />
              </View>

              {/* Urdu Name */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Urdu Name (Optional)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. کمرشل چولہا رینج"
                  placeholderTextColor={LIGHT.textDim}
                  value={formUrduName}
                  onChangeText={setFormUrduName}
                />
              </View>

              {/* Category Dropdown */}
              <RoyalDropdown
                label="Asset Category"
                required
                icon="pricetag-outline"
                placeholder="Select asset category..."
                options={ASSET_CATEGORIES}
                value={formCategory}
                onSelect={(cat) => setFormCategory(cat as AssetCategory)}
                searchable
              />

              {/* Cost & Qty */}
              <View style={styles.twoCol}>
                <View style={[styles.inputGroup, { flex: 1, minWidth: 160 }]}>
                  <Text style={styles.inputLabel}>Unit Purchase Cost (PKR) *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. 250000"
                    placeholderTextColor={LIGHT.textDim}
                    keyboardType="numeric"
                    value={formCost}
                    onChangeText={setFormCost}
                  />
                </View>

                <View style={[styles.inputGroup, { flex: 1, minWidth: 160 }]}>
                  <Text style={styles.inputLabel}>Quantity (Units) *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="1"
                    placeholderTextColor={LIGHT.textDim}
                    keyboardType="numeric"
                    value={formQty}
                    onChangeText={setFormQty}
                  />
                </View>
              </View>

              {/* Vendor & Phone */}
              <View style={styles.twoCol}>
                <View style={[styles.inputGroup, { flex: 1, minWidth: 160 }]}>
                  <Text style={styles.inputLabel}>Vendor / Supplier Name</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. Pak Kitchen Tech Ltd"
                    placeholderTextColor={LIGHT.textDim}
                    value={formVendor}
                    onChangeText={setFormVendor}
                  />
                </View>

                <View style={[styles.inputGroup, { flex: 1, minWidth: 160 }]}>
                  <Text style={styles.inputLabel}>Vendor Phone</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. 0300-1234567"
                    placeholderTextColor={LIGHT.textDim}
                    value={formVendorPhone}
                    onChangeText={setFormVendorPhone}
                  />
                </View>
              </View>

              {/* Location & Invoice */}
              <View style={styles.twoCol}>
                <View style={[styles.inputGroup, { flex: 1, minWidth: 160 }]}>
                  <Text style={styles.inputLabel}>Location / Floor Department</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. Ground Floor Dining Hall"
                    placeholderTextColor={LIGHT.textDim}
                    value={formLocation}
                    onChangeText={setFormLocation}
                  />
                </View>

                <View style={[styles.inputGroup, { flex: 1, minWidth: 160 }]}>
                  <Text style={styles.inputLabel}>Invoice / Bill No.</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. PKT-8821"
                    placeholderTextColor={LIGHT.textDim}
                    value={formInvoiceNo}
                    onChangeText={setFormInvoiceNo}
                  />
                </View>
              </View>

              {/* Condition & Status Dropdowns */}
              <View style={styles.twoCol}>
                <View style={[styles.inputGroup, { flex: 1, minWidth: 160 }]}>
                  <RoyalDropdown
                    label="Physical Condition"
                    required
                    icon="sparkles-outline"
                    options={CONDITIONS.map((c) => ({ label: c.label, value: c.key }))}
                    value={formCondition}
                    onSelect={(c) => setFormCondition(c as AssetCondition)}
                  />
                </View>

                <View style={[styles.inputGroup, { flex: 1, minWidth: 160 }]}>
                  <RoyalDropdown
                    label="Operational Status"
                    required
                    icon="shield-checkmark-outline"
                    options={STATUSES.map((s) => ({ label: s.label, value: s.key }))}
                    value={formStatus}
                    onSelect={(s) => setFormStatus(s as AssetStatus)}
                  />
                </View>
              </View>

              {/* Depreciation & Serial */}
              <View style={styles.twoCol}>
                <View style={[styles.inputGroup, { flex: 1, minWidth: 160 }]}>
                  <Text style={styles.inputLabel}>Depreciation Rate (%/Year)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="10"
                    placeholderTextColor={LIGHT.textDim}
                    keyboardType="numeric"
                    value={formDepreciationRate}
                    onChangeText={setFormDepreciationRate}
                  />
                </View>

                <View style={[styles.inputGroup, { flex: 1, minWidth: 160 }]}>
                  <Text style={styles.inputLabel}>Serial / Chassis No.</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. SN-981249"
                    placeholderTextColor={LIGHT.textDim}
                    value={formSerial}
                    onChangeText={setFormSerial}
                  />
                </View>
              </View>

              {/* Notes */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Technical Notes & Specifications</Text>
                <TextInput
                  style={[styles.input, { height: 70, textAlignVertical: 'top' }]}
                  placeholder="Warranty terms, power requirements (amps/phases), special maintenance notes..."
                  placeholderTextColor={LIGHT.textDim}
                  multiline
                  value={formNotes}
                  onChangeText={setFormNotes}
                />
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setIsAddModalOpen(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.modalSubmitBtn} onPress={handleSaveAsset}>
                <Ionicons name="checkmark-done" size={18} color="#FFFFFF" />
                <Text style={styles.modalSubmitText}>
                  {editingAsset ? 'Update Asset' : 'Save Capital Asset'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* -------------------- LOG MAINTENANCE MODAL -------------------- */}
      <Modal visible={!!maintenanceAsset} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxWidth: 540 }, isMobile && { width: '95%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name="construct" size={20} color={LIGHT.amber} />
                <Text style={styles.modalTitle}>
                  Log Maintenance: [{maintenanceAsset?.assetCode}]
                </Text>
              </View>
              <TouchableOpacity onPress={() => setMaintenanceAsset(null)}>
                <Ionicons name="close" size={22} color={LIGHT.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={{ color: LIGHT.textSecondary, fontSize: 13, marginBottom: 14 }}>
                Record servicing, component replacements, oil change, or technicians fees for{' '}
                <Text style={{ color: LIGHT.burgundy, fontWeight: '700' }}>
                  {maintenanceAsset?.name}
                </Text>
                .
              </Text>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Service / Repair Cost (PKR) *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 15000"
                  placeholderTextColor={LIGHT.textDim}
                  keyboardType="numeric"
                  value={maintCost}
                  onChangeText={setMaintCost}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Work Description *</Text>
                <TextInput
                  style={[styles.input, { height: 75, textAlignVertical: 'top' }]}
                  placeholder="Detail the repair work (e.g., replacement of heating element, descaling, gas refill)..."
                  placeholderTextColor={LIGHT.textDim}
                  multiline
                  value={maintDesc}
                  onChangeText={setMaintDesc}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Technician / Company Name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Engr. Asif or Pak Tech Services"
                  placeholderTextColor={LIGHT.textDim}
                  value={maintTech}
                  onChangeText={setMaintTech}
                />
              </View>

              <TouchableOpacity
                style={styles.checkboxRow}
                onPress={() => setMaintAutoExpense(!maintAutoExpense)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={maintAutoExpense ? 'checkbox' : 'square-outline'}
                  size={20}
                  color={LIGHT.burgundy}
                />
                <Text style={styles.checkboxText}>
                  Automatically book this cost as cash expense under "Maintenance & Repair"
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setMaintenanceAsset(null)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.modalSubmitBtn} onPress={handleSaveMaintenance}>
                <Ionicons name="build" size={17} color="#FFFFFF" />
                <Text style={styles.modalSubmitText}>Save Service Log</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* -------------------- AUDIT SLIP / VIEW MODAL -------------------- */}
      <Modal visible={!!viewAsset} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxWidth: 640 }, isMobile && { width: '95%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name="document-text" size={20} color={LIGHT.burgundy} />
                <Text style={styles.modalTitle}>Capital Asset Audit Record</Text>
              </View>
              <TouchableOpacity onPress={() => setViewAsset(null)}>
                <Ionicons name="close" size={22} color={LIGHT.textSecondary} />
              </TouchableOpacity>
            </View>

            {viewAsset && (
              <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
                {/* Print Sheet Simulation */}
                <View style={styles.sheetPaper}>
                  <View style={styles.sheetHeader}>
                    <Text style={styles.sheetRestName}>SULTAN RESTAURANT & RESORT</Text>
                    <Text style={styles.sheetDocTitle}>CAPITAL ASSET REGISTER & AUDIT CERTIFICATE</Text>
                    <Text style={styles.sheetCode}>TAG: {viewAsset.assetCode}</Text>
                  </View>

                  <View style={styles.sheetDivider} />

                  <View style={styles.sheetRow}>
                    <Text style={styles.sheetKey}>Asset Name:</Text>
                    <Text style={styles.sheetValBold}>{viewAsset.name}</Text>
                  </View>

                  {viewAsset.urduName ? (
                    <View style={styles.sheetRow}>
                      <Text style={styles.sheetKey}>Urdu Name:</Text>
                      <Text style={styles.sheetVal}>{viewAsset.urduName}</Text>
                    </View>
                  ) : null}

                  <View style={styles.sheetRow}>
                    <Text style={styles.sheetKey}>Category:</Text>
                    <Text style={styles.sheetVal}>{viewAsset.category}</Text>
                  </View>

                  <View style={styles.sheetRow}>
                    <Text style={styles.sheetKey}>Location:</Text>
                    <Text style={styles.sheetVal}>{viewAsset.location}</Text>
                  </View>

                  <View style={styles.sheetRow}>
                    <Text style={styles.sheetKey}>Supplier / Vendor:</Text>
                    <Text style={styles.sheetVal}>
                      {viewAsset.vendor} {viewAsset.vendorPhone ? `(${viewAsset.vendorPhone})` : ''}
                    </Text>
                  </View>

                  <View style={styles.sheetRow}>
                    <Text style={styles.sheetKey}>Purchase Date:</Text>
                    <Text style={styles.sheetVal}>{formatDay(viewAsset.purchaseDate)}</Text>
                  </View>

                  <View style={styles.sheetRow}>
                    <Text style={styles.sheetKey}>Unit Cost:</Text>
                    <Text style={styles.sheetVal}>{money(viewAsset.cost)}</Text>
                  </View>

                  <View style={styles.sheetRow}>
                    <Text style={styles.sheetKey}>Quantity:</Text>
                    <Text style={styles.sheetVal}>{viewAsset.quantity} Unit(s)</Text>
                  </View>

                  <View style={[styles.sheetRow, { backgroundColor: '#FEF3C7', padding: 6, borderRadius: 6 }]}>
                    <Text style={[styles.sheetKey, { color: '#92400E', fontWeight: '800' }]}>TOTAL CAPITAL INVESTED:</Text>
                    <Text style={[styles.sheetValBold, { color: '#92400E' }]}>{money(viewAsset.totalCost)}</Text>
                  </View>

                  <View style={styles.sheetRow}>
                    <Text style={styles.sheetKey}>Est. Net Book Value:</Text>
                    <Text style={styles.sheetVal}>{money(viewAsset.currentValue || viewAsset.totalCost)}</Text>
                  </View>

                  <View style={styles.sheetRow}>
                    <Text style={styles.sheetKey}>Condition / Status:</Text>
                    <Text style={styles.sheetVal}>
                      {viewAsset.condition.toUpperCase()} / {viewAsset.status.toUpperCase()}
                    </Text>
                  </View>

                  {viewAsset.serialNumber ? (
                    <View style={styles.sheetRow}>
                      <Text style={styles.sheetKey}>Serial No:</Text>
                      <Text style={styles.sheetVal}>{viewAsset.serialNumber}</Text>
                    </View>
                  ) : null}

                  {viewAsset.notes ? (
                    <View style={{ marginTop: 10 }}>
                      <Text style={styles.sheetKey}>Notes & Specs:</Text>
                      <Text style={[styles.sheetVal, { fontStyle: 'italic', marginTop: 4 }]}>{viewAsset.notes}</Text>
                    </View>
                  ) : null}

                  {/* Maintenance Log Section */}
                  <View style={{ marginTop: 16 }}>
                    <Text style={[styles.sheetDocTitle, { textAlign: 'left', marginBottom: 8 }]}>
                      SERVICE & REPAIR HISTORY ({viewAsset.maintenanceLogs?.length || 0})
                    </Text>
                    {(!viewAsset.maintenanceLogs || viewAsset.maintenanceLogs.length === 0) ? (
                      <Text style={{ fontSize: 12, color: '#666', fontStyle: 'italic' }}>
                        No repairs logged yet. Asset operating in nominal condition.
                      </Text>
                    ) : (
                      viewAsset.maintenanceLogs.map((log) => (
                        <View key={log.id} style={styles.sheetMaintItem}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                            <Text style={{ fontWeight: '700', fontSize: 13, color: '#111827' }}>
                              {formatDay(log.date)} • {log.performedBy || 'Technician'}
                            </Text>
                            <Text style={{ fontWeight: '700', fontSize: 13, color: '#B45309' }}>
                              {money(log.cost)}
                            </Text>
                          </View>
                          <Text style={{ fontSize: 12, color: '#4B5563', marginTop: 2 }}>{log.description}</Text>
                        </View>
                      ))
                    )}
                  </View>

                  {/* Breakage & Damage Incidents Section */}
                  <View style={{ marginTop: 16 }}>
                    <Text style={[styles.sheetDocTitle, { textAlign: 'left', marginBottom: 8, color: '#BE123C' }]}>
                      BREAKAGE & DAMAGE RECORD ({damageRecords.filter((d) => d.assetId === viewAsset.id || d.assetCode === viewAsset.assetCode).length})
                    </Text>
                    {damageRecords.filter((d) => d.assetId === viewAsset.id || d.assetCode === viewAsset.assetCode).length === 0 ? (
                      <Text style={{ fontSize: 12, color: '#666', fontStyle: 'italic' }}>
                        Zero breakage incidents logged for this asset.
                      </Text>
                    ) : (
                      damageRecords
                        .filter((d) => d.assetId === viewAsset.id || d.assetCode === viewAsset.assetCode)
                        .map((dmg) => (
                          <View key={dmg.id} style={[styles.sheetMaintItem, { borderColor: '#FECDD3', backgroundColor: '#FFF5F5' }]}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                              <Text style={{ fontWeight: '700', fontSize: 13, color: '#111827' }}>
                                {formatDay(dmg.incidentDate)} • {dmg.quantity}x broken ({dmg.reason})
                              </Text>
                              <Text style={{ fontWeight: '700', fontSize: 13, color: '#BE123C' }}>
                                -{money(dmg.totalLoss)}
                              </Text>
                            </View>
                            <Text style={{ fontSize: 12, color: '#4B5563', marginTop: 2 }}>
                              Settlement: {dmg.actionTaken} • Location: {dmg.location} • Status: {dmg.status.toUpperCase()}
                            </Text>
                          </View>
                        ))
                    )}
                  </View>
                </View>
              </ScrollView>
            )}

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setViewAsset(null)}
              >
                <Text style={styles.modalCancelText}>Close</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalSubmitBtn}
                onPress={() => {
                  alertMsg('Printing', 'Asset record sent to local thermal / document printer.');
                }}
              >
                <Ionicons name="print-outline" size={18} color="#FFFFFF" />
                <Text style={styles.modalSubmitText}>Print Audit Slip</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: LIGHT.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    flexWrap: 'wrap',
    gap: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 260,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: LIGHT.burgundySoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(82, 23, 27, 0.15)',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: LIGHT.ink,
    letterSpacing: 0.2,
  },
  headerSub: {
    fontSize: 13.5,
    color: LIGHT.textSecondary,
    marginTop: 2,
  },
  roleBadge: {
    backgroundColor: LIGHT.burgundySoft,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(82, 23, 27, 0.20)',
  },
  roleBadgeText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: LIGHT.burgundy,
    letterSpacing: 0.6,
  },
  addAssetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: LIGHT.burgundy,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    shadowColor: LIGHT.burgundy,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  addAssetBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
  container: {
    flex: 1,
    backgroundColor: LIGHT.bg,
  },
  scrollContent: {
    padding: 18,
    paddingBottom: 40,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    marginBottom: 20,
  },
  kpiCard: {
    flex: 1,
    minWidth: 200,
    backgroundColor: LIGHT.cardBg,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  kpiHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  kpiLabel: {
    fontSize: 12.5,
    fontWeight: '800',
    color: LIGHT.textMuted,
    letterSpacing: 0.5,
  },
  kpiIconBox: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiValue: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  kpiHint: {
    fontSize: 12,
    color: LIGHT.textDim,
    marginTop: 4,
  },
  searchSection: {
    marginBottom: 16,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 12 : 9,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
  },
  searchInput: {
    flex: 1,
    color: LIGHT.ink,
    fontSize: 14.5,
  },
  categoryScroll: {
    flexDirection: 'row',
  },
  filterDropdownRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
    marginBottom: 16,
  },
  assetList: {
    gap: 8,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  thCol: {
    justifyContent: 'center',
  },
  thText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  astRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderLeftWidth: 4,
    marginBottom: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  rowCol: {
    justifyContent: 'center',
  },
  codeTagCompact: {
    backgroundColor: LIGHT.burgundySoft,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(82, 23, 27, 0.18)',
  },
  codeTagCompactText: {
    fontSize: 11,
    fontWeight: '800',
    color: LIGHT.burgundy,
    letterSpacing: 0.4,
  },
  rowAssetName: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  rowUrduName: {
    fontSize: 11.5,
    color: LIGHT.gold,
    fontWeight: '700',
  },
  rowQtyText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  categoryBadgeCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    alignSelf: 'flex-start',
  },
  categoryBadgeCompactText: {
    fontSize: 11,
    color: '#334155',
    fontWeight: '700',
  },
  rowLocationText: {
    fontSize: 11.5,
    color: '#475569',
    fontWeight: '600',
  },
  rowVendorText: {
    fontSize: 11,
    color: '#64748B',
  },
  rowCostGold: {
    fontSize: 14.5,
    fontWeight: '900',
    color: LIGHT.gold,
  },
  rowCostSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  rowBookValue: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  pillBadgeCompact: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  pillBadgeCompactText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  microBadgeAmber: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: LIGHT.amberSoft,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: LIGHT.amberBorder,
  },
  microBadgeAmberText: {
    fontSize: 10,
    fontWeight: '800',
    color: LIGHT.amber,
  },
  microBadgeRose: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: LIGHT.roseSoft,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: LIGHT.roseBorder,
  },
  microBadgeRoseText: {
    fontSize: 10,
    fontWeight: '800',
    color: LIGHT.rose,
  },
  actionRowCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionBtnAudit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: LIGHT.burgundySoft,
    borderWidth: 1,
    borderColor: 'rgba(82, 23, 27, 0.2)',
  },
  actionBtnAuditText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: LIGHT.burgundy,
  },
  actionBtnService: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: LIGHT.amberSoft,
    borderWidth: 1,
    borderColor: LIGHT.amberBorder,
  },
  actionBtnServiceText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: LIGHT.amber,
  },
  actionBtnEditCompact: {
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  actionBtnDeleteCompact: {
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: LIGHT.roseSoft,
    borderWidth: 1,
    borderColor: LIGHT.roseBorder,
  },
  mobileAssetCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderLeftWidth: 4,
    marginBottom: 8,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  mobileCardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  mobileCardMidRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  mobileAlertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  mobileCardActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: LIGHT.ink,
    marginTop: 12,
  },
  emptySub: {
    fontSize: 13.5,
    color: LIGHT.textMuted,
    textAlign: 'center',
    maxWidth: 320,
    marginTop: 4,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    width: 680,
    maxHeight: '90%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#CBD5E1',
    backgroundColor: '#FAFAF9',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: LIGHT.ink,
  },
  modalBody: {
    padding: 20,
  },
  inputGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 13.5,
    fontWeight: '800',
    color: LIGHT.ink,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: LIGHT.inputBorder,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    color: LIGHT.ink,
    fontSize: 14.5,
  },
  twoCol: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  modalChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    marginRight: 6,
  },
  modalChipActive: {
    backgroundColor: LIGHT.burgundySoft,
    borderColor: LIGHT.burgundy,
  },
  modalChipText: {
    fontSize: 13,
    color: LIGHT.textSecondary,
    fontWeight: '700',
  },
  modalChipTextActive: {
    color: LIGHT.burgundy,
    fontWeight: '800',
  },
  smallChip: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  smallChipActive: {
    backgroundColor: LIGHT.burgundySoft,
    borderColor: LIGHT.burgundy,
  },
  smallChipText: {
    fontSize: 12,
    color: LIGHT.textSecondary,
    fontWeight: '700',
  },
  smallChipTextActive: {
    color: LIGHT.burgundy,
    fontWeight: '800',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  checkboxText: {
    fontSize: 13.5,
    color: LIGHT.textSecondary,
    flex: 1,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#CBD5E1',
    backgroundColor: '#FAFAF9',
    flexWrap: 'wrap',
  },
  modalCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
  },
  modalCancelText: {
    color: LIGHT.textSecondary,
    fontWeight: '700',
    fontSize: 14,
  },
  modalSubmitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: LIGHT.burgundy,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 8,
  },
  modalSubmitText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14.5,
  },
  // Audit Sheet Simulation
  sheetPaper: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  sheetHeader: {
    alignItems: 'center',
    marginBottom: 10,
  },
  sheetRestName: {
    fontSize: 18,
    fontWeight: '900',
    color: '#111827',
    letterSpacing: 1,
  },
  sheetDocTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: LIGHT.burgundy,
    letterSpacing: 0.5,
    marginTop: 2,
  },
  sheetCode: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#1E293B',
    marginTop: 4,
  },
  sheetDivider: {
    height: 1,
    backgroundColor: '#CBD5E1',
    marginVertical: 10,
  },
  sheetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    flexWrap: 'wrap',
    gap: 6,
  },
  sheetKey: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '700',
  },
  sheetVal: {
    fontSize: 13.5,
    color: '#0F172A',
    fontWeight: '700',
  },
  sheetValBold: {
    fontSize: 15,
    color: '#0F172A',
    fontWeight: '900',
  },
  sheetMaintItem: {
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 6,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  damageBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFF1F2',
    borderWidth: 1,
    borderColor: '#FECDD3',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 8,
    flexWrap: 'wrap',
    gap: 6,
  },
  damageBannerText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#BE123C',
  },
  damageBannerLink: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#BE123C',
  },
});
