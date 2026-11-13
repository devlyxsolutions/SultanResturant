import React, { useState, useMemo, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  TextInput, 
  Modal, 
  Alert, 
  Platform,
  Image,
  useWindowDimensions,
  Switch,
  ActivityIndicator
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useRestaurantStore, MenuItem, ComboItem } from '../../store/restaurantStore';
import { BRAND } from '../../constants/brand';
import { FOOD_PRESETS, POPULAR_BADGES } from '../../constants/foodPresets';
import { money } from '../../utils/format';
import { broadcastImmediately, getActiveServerHttpUrl } from '../../services/syncService';
import PaginationControl from '../../components/PaginationControl';
import { usePagination } from '../../hooks/usePagination';

export default function MenuManagement() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const menuItems = useRestaurantStore(state => state.menuItems) || [];
  const addMenuItem = useRestaurantStore(state => state.addMenuItem);
  const updateMenuItem = useRestaurantStore(state => state.updateMenuItem);
  const deleteMenuItem = useRestaurantStore(state => state.deleteMenuItem);
  const adjustMenuItemStock = useRestaurantStore(state => state.adjustMenuItemStock);
  const categories = useRestaurantStore(state => state.categories) || [];
  const addCategory = useRestaurantStore(state => state.addCategory);
  const deleteCategory = useRestaurantStore(state => state.deleteCategory);
  const regions = useRestaurantStore(state => state.regions) || [];
  const addRegion = useRestaurantStore(state => state.addRegion);
  const updateRegion = useRestaurantStore(state => state.updateRegion);
  const deleteRegion = useRestaurantStore(state => state.deleteRegion);
  const restoreDefaultRestaurantMenu = useRestaurantStore(state => state.restoreDefaultRestaurantMenu);
  const [isSyncingMenu, setIsSyncingMenu] = useState(false);
  
  // Tabs: 'items' | 'deals' | 'stock' | 'categories' | 'regions'
  const [activeTab, setActiveTab] = useState<'items' | 'deals' | 'stock' | 'categories' | 'regions'>('items');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('All');
  const [selectedRegionFilter, setSelectedRegionFilter] = useState('All');
  
  // Main Catalog Filter Dropdown States
  const [isFilterCatOpen, setIsFilterCatOpen] = useState(false);
  const [isFilterRegionOpen, setIsFilterRegionOpen] = useState(false);
  const [isFilterSortOpen, setIsFilterSortOpen] = useState(false);
  const [sortBy, setSortBy] = useState<'default' | 'price-asc' | 'price-desc' | 'name-asc' | 'margin-desc' | 'stock-asc'>('default');

  const sortOptions = [
    { id: 'default', label: 'Default Order', icon: 'reorder-four-outline' },
    { id: 'price-asc', label: 'Price: Low to High', icon: 'trending-up-outline' },
    { id: 'price-desc', label: 'Price: High to Low', icon: 'trending-down-outline' },
    { id: 'name-asc', label: 'Dish Name: A to Z', icon: 'text-outline' },
    { id: 'margin-desc', label: 'Margin: High to Low', icon: 'cash-outline' },
    { id: 'stock-asc', label: 'Stock: Low to High', icon: 'cube-outline' },
  ];
  
  // Success Feedback Message
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  const getMenuHost = () => {
    if (typeof window !== 'undefined' && window.location?.hostname) {
      return window.location.hostname === '127.0.0.1' ? 'localhost' : window.location.hostname;
    }
    try {
      const base = getActiveServerHttpUrl();
      const clean = base.replace(/^https?:\/\//i, '').replace(/:\d+.*$/, '').replace(/\/.*$/, '');
      if (clean) return clean;
    } catch (_) {}
    return '192.168.100.3';
  };

  // Sync with live central backend on mount
  useEffect(() => {
    const fetchLiveCatalog = async () => {
      const ports = [5050, 5000, 80];
      const host = getMenuHost();
      
      for (const p of ports) {
        try {
          const url = p === 80 ? `http://${host}/api/public/menu` : `http://${host}:${p}/api/public/menu`;
          const res = await fetch(url);
          const json = await res.json();
          if (json.success && Array.isArray(json.data) && json.data.length > 0) {
            const current = useRestaurantStore.getState().menuItems || [];
            const remoteMap = new Map(json.data.map((m: any) => [m.id, m]));
            const localOnly = current.filter(m => !remoteMap.has(m.id));
            useRestaurantStore.setState({ menuItems: [...localOnly, ...json.data] });
            break;
          }
        } catch (e) {}
      }

      for (const p of ports) {
        try {
          const url = p === 80 ? `http://${host}/api/public/categories` : `http://${host}:${p}/api/public/categories`;
          const res = await fetch(url);
          const json = await res.json();
          if (json.success && Array.isArray(json.data) && json.data.length > 0) {
            const fetched = json.data.filter((c: string) => typeof c === 'string' && c.toLowerCase() !== 'all');
            const current = useRestaurantStore.getState().categories || [];
            const seen = new Set<string>();
            const merged: string[] = [];
            for (const c of [...current, ...fetched]) {
              const norm = typeof c === 'string' ? c.trim() : '';
              if (norm && !seen.has(norm.toLowerCase())) {
                seen.add(norm.toLowerCase());
                merged.push(norm);
              }
            }
            useRestaurantStore.setState({ categories: merged });
            break;
          }
        } catch (e) {}
      }
    };

    fetchLiveCatalog();
  }, []);

  // Item Modal state (Add / Edit)
  const [isItemModalVisible, setItemModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [modalTab, setModalTab] = useState<'basic' | 'image' | 'pricing_stock' | 'combo'>('basic');

  // Form Fields
  const [itemName, setItemName] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [itemCostPrice, setItemCostPrice] = useState('');
  const [itemCategory, setItemCategory] = useState(categories[0] || 'Mains');
  const [itemRegion, setItemRegion] = useState('');
  const [itemDescription, setItemDescription] = useState('');
  const [itemBadge, setItemBadge] = useState('');
  const [itemImageUri, setItemImageUri] = useState('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [itemStation, setItemStation] = useState<'main' | 'juice'>('main');
  const [itemPrepTime, setItemPrepTime] = useState('15');
  const [itemVariants, setItemVariants] = useState<{ name: string; price: string }[]>([]);
  
  // Stock Tracking Form Fields (Option 4)
  const [itemTrackStock, setItemTrackStock] = useState(false);
  const [itemStockQty, setItemStockQty] = useState('20');
  const [itemLowStockThreshold, setItemLowStockThreshold] = useState('5');

  // Deals / Combo Form Fields (Option 5)
  const [itemIsDeal, setItemIsDeal] = useState(false);
  const [itemDealItems, setItemDealItems] = useState<ComboItem[]>([]);
  const [itemDealOriginalPrice, setItemDealOriginalPrice] = useState('');
  
  // Quick Stock Adjustment Modal
  const [stockAdjustItem, setStockAdjustItem] = useState<MenuItem | null>(null);
  const [stockDeltaInput, setStockDeltaInput] = useState('');
  const [stockMode, setStockMode] = useState<'add' | 'set'>('add');

  // Dropdown states
  const [isCategoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const [isRegionDropdownOpen, setRegionDropdownOpen] = useState(false);
  const [isBadgeDropdownOpen, setBadgeDropdownOpen] = useState(false);

  // Category Modal state
  const [isCatModalVisible, setCatModalVisible] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [showInlineAddCategory, setShowInlineAddCategory] = useState(false);
  const [inlineCatInput, setInlineCatInput] = useState('');

  // Region Modal state
  const [isRegionModalVisible, setRegionModalVisible] = useState(false);
  const [editingRegion, setEditingRegion] = useState<string | null>(null);
  const [regionNameInput, setRegionNameInput] = useState('');

  // -------------------------------------------------------------
  // KPI Calculations
  // -------------------------------------------------------------
  const kpiStats = useMemo(() => {
    const totalItems = menuItems.length;
    const dealsCount = menuItems.filter(i => i.isDeal || i.category === 'Deals').length;
    const lowStockItems = menuItems.filter(i => 
      i.trackStock && typeof i.stockQty === 'number' && i.stockQty <= (i.lowStockThreshold || 5)
    );
    const outOfStockItems = menuItems.filter(i => 
      i.trackStock && typeof i.stockQty === 'number' && i.stockQty <= 0
    );

    // Average Margin Calculation across items that have both Price and CostPrice
    const itemsWithCost = menuItems.filter(i => i.price > 0 && typeof i.costPrice === 'number' && i.costPrice > 0);
    const avgMargin = itemsWithCost.length > 0 
      ? Math.round(
          itemsWithCost.reduce((sum, i) => sum + (((i.price - (i.costPrice || 0)) / i.price) * 100), 0) / itemsWithCost.length
        ) 
      : 0;

    return {
      totalItems,
      dealsCount,
      lowStockCount: lowStockItems.length,
      outOfStockCount: outOfStockItems.length,
      avgMargin
    };
  }, [menuItems]);

  // -------------------------------------------------------------
  // Category & Region Item Counts
  // -------------------------------------------------------------
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { All: menuItems.length };
    for (const cat of categories) {
      counts[cat] = menuItems.filter(i => i.category === cat).length;
    }
    return counts;
  }, [categories, menuItems]);

  const regionCounts = useMemo(() => {
    const counts: Record<string, number> = { All: menuItems.length };
    for (const reg of regions) {
      counts[reg] = menuItems.filter(i => i.region === reg).length;
    }
    return counts;
  }, [regions, menuItems]);

  // -------------------------------------------------------------
  // Filtered Items based on Active Tab, Search, Filters & Sorting
  // -------------------------------------------------------------
  const filteredItems = useMemo(() => {
    let result = menuItems.filter(item => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q || 
        item.name.toLowerCase().includes(q) || 
        item.category.toLowerCase().includes(q) ||
        (item.region && item.region.toLowerCase().includes(q)) ||
        (item.badge && item.badge.toLowerCase().includes(q)) ||
        (item.description && item.description.toLowerCase().includes(q));

      if (!matchesSearch) return false;

      if (activeTab === 'deals') {
        const matchesCat = selectedCategoryFilter === 'All' || item.category === selectedCategoryFilter;
        const matchesRegion = selectedRegionFilter === 'All' || item.region === selectedRegionFilter;
        return (item.isDeal || item.category === 'Deals') && matchesCat && matchesRegion;
      }

      if (activeTab === 'stock') {
        const matchesCat = selectedCategoryFilter === 'All' || item.category === selectedCategoryFilter;
        const matchesRegion = selectedRegionFilter === 'All' || item.region === selectedRegionFilter;
        return item.trackStock && matchesCat && matchesRegion;
      }

      if (activeTab === 'items') {
        const matchesCat = selectedCategoryFilter === 'All' || item.category === selectedCategoryFilter;
        const matchesRegion = selectedRegionFilter === 'All' || item.region === selectedRegionFilter;
        return matchesCat && matchesRegion;
      }

      return true;
    });

    if (sortBy === 'price-asc') {
      result = [...result].sort((a, b) => a.price - b.price);
    } else if (sortBy === 'price-desc') {
      result = [...result].sort((a, b) => b.price - a.price);
    } else if (sortBy === 'name-asc') {
      result = [...result].sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'margin-desc') {
      result = [...result].sort((a, b) => {
        const mA = a.price && a.costPrice ? (a.price - a.costPrice) / a.price : 0;
        const mB = b.price && b.costPrice ? (b.price - b.costPrice) / b.price : 0;
        return mB - mA;
      });
    } else if (sortBy === 'stock-asc') {
      result = [...result].sort((a, b) => (a.stockQty ?? 999) - (b.stockQty ?? 999));
    }

    return result;
  }, [menuItems, activeTab, searchQuery, selectedCategoryFilter, selectedRegionFilter, sortBy]);

  // -------------------------------------------------------------
  // Pagination for Dishes, Deals & Stock Items
  // -------------------------------------------------------------
  const itemsPagination = usePagination({
    data: filteredItems,
    initialPageSize: 10,
  });

  // Derived Categories Data
  const categoriesData = useMemo(() => {
    return categories.map(cat => ({
      id: cat,
      name: cat,
      itemsCount: menuItems.filter(i => i.category === cat).length
    }));
  }, [categories, menuItems]);

  const filteredCategories = useMemo(() => {
    return categoriesData.filter(cat => 
      cat.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [categoriesData, searchQuery]);

  // Derived Regions Data
  const regionsData = useMemo(() => {
    return regions.map(reg => ({
      id: reg,
      name: reg,
      itemsCount: menuItems.filter(i => i.region === reg).length
    }));
  }, [regions, menuItems]);

  const filteredRegions = useMemo(() => {
    return regionsData.filter(reg => 
      reg.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [regionsData, searchQuery]);

  // -------------------------------------------------------------
  // Modal Open Handlers
  // -------------------------------------------------------------
  const openAddItemModal = (isForDeal = false) => {
    setEditingItem(null);
    setModalTab('basic');
    setItemName('');
    setItemPrice('');
    setItemCostPrice('');
    setItemCategory(isForDeal ? 'Deals' : (categories[0] || 'Mains'));
    setItemRegion(selectedRegionFilter !== 'All' ? selectedRegionFilter : '');
    setItemDescription('');
    setItemBadge(isForDeal ? 'Family Deal' : '');
    setItemImageUri('');
    setItemStation('main');
    setItemPrepTime(isForDeal ? '25' : '15');
    setItemVariants([]);
    setItemTrackStock(true);
    setItemStockQty('25');
    setItemLowStockThreshold('5');
    setItemIsDeal(isForDeal);
    setItemDealItems([]);
    setItemDealOriginalPrice('');
    setCategoryDropdownOpen(false);
    setRegionDropdownOpen(false);
    setBadgeDropdownOpen(false);
    setItemModalVisible(true);
  };

  const openEditItemModal = (item: MenuItem) => {
    setEditingItem(item);
    setModalTab('basic');
    setItemName(item.name);
    setItemPrice(item.price ? item.price.toString() : '');
    setItemCostPrice(item.costPrice ? item.costPrice.toString() : '');
    setItemCategory(item.category || (categories[0] || 'Mains'));
    setItemRegion(item.region || '');
    setItemDescription(item.description || '');
    setItemBadge(item.badge || '');
    setItemImageUri(item.imageUri || '');
    setItemStation((item.station as 'main'|'juice') || 'main');
    setItemPrepTime(item.prepTimeMin ? item.prepTimeMin.toString() : (item.station === 'juice' ? '5' : '15'));
    setItemVariants(item.variants ? item.variants.map(v => ({ name: v.name, price: v.price.toString() })) : []);
    setItemTrackStock(Boolean(item.trackStock));
    setItemStockQty(typeof item.stockQty === 'number' ? item.stockQty.toString() : '20');
    setItemLowStockThreshold(typeof item.lowStockThreshold === 'number' ? item.lowStockThreshold.toString() : '5');
    setItemIsDeal(Boolean(item.isDeal || item.category === 'Deals'));
    setItemDealItems(item.dealItems || []);
    setItemDealOriginalPrice(item.dealOriginalPrice ? item.dealOriginalPrice.toString() : '');
    setCategoryDropdownOpen(false);
    setRegionDropdownOpen(false);
    setBadgeDropdownOpen(false);
    setItemModalVisible(true);
  };

  // -------------------------------------------------------------
  // Image Upload / Camera Handlers (with Web Canvas Downscaling)
  // -------------------------------------------------------------
  const compressImageFileOnWeb = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new (window as any).Image();
        img.onload = () => {
          const MAX_DIM = 600;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_DIM) {
              height = Math.round((height * MAX_DIM) / width);
              width = MAX_DIM;
            }
          } else {
            if (height > MAX_DIM) {
              width = Math.round((width * MAX_DIM) / height);
              height = MAX_DIM;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            // Ultra-compact JPEG ~25KB-45KB: easily stored, synced and loaded
            const compressed = canvas.toDataURL('image/jpeg', 0.78);
            resolve(compressed);
          } else {
            resolve(e.target?.result as string);
          }
        };
        img.onerror = () => reject(new Error('Failed to decode image'));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error('Failed to read image file'));
      reader.readAsDataURL(file);
    });
  };

  const pickImageFromDevice = async () => {
    try {
      setIsUploadingImage(true);

      // On Web: Native HTML file input with automatic canvas downscaler
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/jpeg,image/png,image/webp,image/jpg';
        input.onchange = async () => {
          const file = input.files?.[0];
          if (!file) {
            setIsUploadingImage(false);
            return;
          }
          try {
            const compressedUri = await compressImageFileOnWeb(file);
            setItemImageUri(compressedUri);
          } catch (err: any) {
            window.alert('Failed to process image: ' + (err.message || ''));
          } finally {
            setIsUploadingImage(false);
          }
        };
        input.click();
        return;
      }

      // On Native Mobile (iOS / Android)
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission Required', 'Permission to access photos is required to upload dish images!');
        setIsUploadingImage(false);
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.6,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const asset = result.assets[0];
        if (asset.base64) {
          const mime = asset.mimeType || 'image/jpeg';
          setItemImageUri(`data:${mime};base64,${asset.base64}`);
        } else {
          setItemImageUri(asset.uri);
        }
      }
    } catch (err: any) {
      console.error('Image picker error:', err);
      const msg = 'Failed to pick image: ' + (err.message || '');
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Error', msg);
    } finally {
      setIsUploadingImage(false);
    }
  };

  const takePhotoWithCamera = async () => {
    try {
      setIsUploadingImage(true);

      // On Web: file input with camera capture
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.setAttribute('capture', 'environment');
        input.onchange = async () => {
          const file = input.files?.[0];
          if (!file) {
            setIsUploadingImage(false);
            return;
          }
          try {
            const compressedUri = await compressImageFileOnWeb(file);
            setItemImageUri(compressedUri);
          } catch (err: any) {
            window.alert('Failed to process camera photo: ' + (err.message || ''));
          } finally {
            setIsUploadingImage(false);
          }
        };
        input.click();
        return;
      }

      // On Native Mobile
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission Required', 'Camera permission is required to capture dish photos!');
        setIsUploadingImage(false);
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.6,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const asset = result.assets[0];
        if (asset.base64) {
          const mime = asset.mimeType || 'image/jpeg';
          setItemImageUri(`data:${mime};base64,${asset.base64}`);
        } else {
          setItemImageUri(asset.uri);
        }
      }
    } catch (err: any) {
      console.error('Camera capture error:', err);
      const msg = 'Failed to capture photo: ' + (err.message || '');
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Error', msg);
    } finally {
      setIsUploadingImage(false);
    }
  };

  // -------------------------------------------------------------
  // Preset Selection Helper
  // -------------------------------------------------------------
  // Only applies the image to avoid wiping the user's custom dish name & price
  const handleSelectPresetImageOnly = (imageUri: string) => {
    setItemImageUri(imageUri);
  };

  // Full autofill if user explicitly wants to clone the preset
  const handleSelectPresetFull = (preset: typeof FOOD_PRESETS[0]) => {
    setItemName(preset.name);
    if (!itemPrice) setItemPrice(preset.defaultPrice.toString());
    if (!itemCostPrice) setItemCostPrice(preset.defaultCost.toString());
    if (preset.imageUri) setItemImageUri(preset.imageUri);
    if (preset.description) setItemDescription(preset.description);
    if (preset.badge) setItemBadge(preset.badge);
    if (preset.category && categories.includes(preset.category)) {
      setItemCategory(preset.category);
    }
  };

  // -------------------------------------------------------------
  // Combo Builder Helper (Option 5)
  // -------------------------------------------------------------
  const addDishToDeal = (menuItem: MenuItem) => {
    const existingIndex = itemDealItems.findIndex(d => d.menuItemId === menuItem.id);
    let updated: ComboItem[];
    if (existingIndex >= 0) {
      updated = [...itemDealItems];
      updated[existingIndex].qty += 1;
    } else {
      updated = [
        ...itemDealItems, 
        { menuItemId: menuItem.id, name: menuItem.name, qty: 1, price: menuItem.price }
      ];
    }
    setItemDealItems(updated);

    // Recalculate original total value
    const sumOriginal = updated.reduce((s, it) => s + ((it.price || 0) * it.qty), 0);
    setItemDealOriginalPrice(sumOriginal.toString());
  };

  const removeDishFromDeal = (index: number) => {
    const updated = [...itemDealItems];
    updated.splice(index, 1);
    setItemDealItems(updated);
    const sumOriginal = updated.reduce((s, it) => s + ((it.price || 0) * it.qty), 0);
    setItemDealOriginalPrice(sumOriginal.toString());
  };

  const updateDishDealQty = (index: number, newQty: number) => {
    if (newQty <= 0) {
      removeDishFromDeal(index);
      return;
    }
    const updated = [...itemDealItems];
    updated[index].qty = newQty;
    setItemDealItems(updated);
    const sumOriginal = updated.reduce((s, it) => s + ((it.price || 0) * it.qty), 0);
    setItemDealOriginalPrice(sumOriginal.toString());
  };

  // -------------------------------------------------------------
  // Save Item Handler (With Auto-Sync to Backend & Mobile App)
  // -------------------------------------------------------------
  const handleSaveItem = async () => {
    const parsedVariants = itemVariants
      .filter(v => v.name.trim() !== '' && !isNaN(parseFloat(v.price)))
      .map(v => ({ name: v.name.trim(), price: parseFloat(v.price) }));

    const hasVariants = parsedVariants.length > 0;

    if (!itemName.trim()) {
      const msg = 'Please enter a name for the dish.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Missing Name', msg);
      return;
    }

    const finalCategory = itemCategory || (categories[0] || 'Mains');
    
    let priceNum = parseFloat(itemPrice);
    if (!hasVariants && (isNaN(priceNum) || priceNum <= 0)) {
      const msg = 'Please enter a valid selling price in Rs. (e.g. 1200)';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Missing Price', msg);
      return;
    }

    if (hasVariants && isNaN(priceNum)) {
      priceNum = 0;
    }

    const costNum = parseFloat(itemCostPrice);
    const parsedCost = !isNaN(costNum) && costNum >= 0 ? costNum : undefined;

    const stockNum = parseInt(itemStockQty, 10);
    const lowThreshNum = parseInt(itemLowStockThreshold, 10);

    const dealOrigPriceNum = parseFloat(itemDealOriginalPrice);
    const prepTimeNum = parseFloat(itemPrepTime);
    const parsedPrepTime = !isNaN(prepTimeNum) && prepTimeNum > 0 ? prepTimeNum : (itemStation === 'juice' ? 5 : 15);

    const itemPayload: Omit<MenuItem, 'id'> = {
      name: itemName.trim(),
      price: priceNum,
      costPrice: parsedCost,
      category: finalCategory || itemCategory,
      region: itemRegion.trim() ? itemRegion.trim() : undefined,
      station: itemStation,
      prepTimeMin: parsedPrepTime,
      description: itemDescription.trim() || undefined,
      badge: itemBadge.trim() || undefined,
      imageUri: itemImageUri.trim() || undefined,
      variants: parsedVariants.length > 0 ? parsedVariants : undefined,
      trackStock: itemTrackStock,
      stockQty: itemTrackStock && !isNaN(stockNum) ? stockNum : undefined,
      lowStockThreshold: itemTrackStock && !isNaN(lowThreshNum) ? lowThreshNum : undefined,
      isDeal: itemIsDeal,
      dealItems: itemIsDeal && itemDealItems.length > 0 ? itemDealItems : undefined,
      dealOriginalPrice: itemIsDeal && !isNaN(dealOrigPriceNum) ? dealOrigPriceNum : undefined
    };

    if (editingItem) {
      updateMenuItem(editingItem.id, itemPayload);
    } else {
      addMenuItem(itemPayload);
    }
    broadcastImmediately();
    setItemModalVisible(false);

    // Sync directly to Sultan Backend Hub (instantly reflected on Mobile App)
    try {
      const ports = [5050, 5000, 80];
      const host = getMenuHost();
      for (const p of ports) {
        try {
          const url = p === 80 ? `http://${host}/api/admin/menu-items` : `http://${host}:${p}/api/admin/menu-items`;
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: itemPayload.name,
              price: itemPayload.price,
              category: itemPayload.category,
              description: itemPayload.description,
              imageUrl: itemPayload.imageUri,
              imageUri: itemPayload.imageUri,
              badge: itemPayload.badge,
              variants: itemPayload.variants,
            }),
          });
          if (res.ok) {
            console.log(`[Menu] Dish synced successfully to ${url}`);
            break;
          }
        } catch (e) {}
      }
    } catch (e) {}

    setSaveSuccessMsg(`✨ Dish "${itemPayload.name}" saved & synced to Mobile App!`);
    setTimeout(() => setSaveSuccessMsg(null), 5000);
  };

  const handleDeleteItem = async (item: MenuItem) => {
    const confirmDelete = async () => {
      deleteMenuItem(item.id);
      broadcastImmediately();

      // Sync deletion to Backend
      try {
        const ports = [5050, 5000, 80];
        const host = getMenuHost();
        for (const p of ports) {
          try {
            const url = p === 80 ? `http://${host}/api/admin/menu-items/${item.id}` : `http://${host}:${p}/api/admin/menu-items/${item.id}`;
            const res = await fetch(url, { method: 'DELETE' });
            if (res.ok) break;
          } catch (e) {}
        }
      } catch (e) {}

      setSaveSuccessMsg(`Dish "${item.name}" removed from menu.`);
      setTimeout(() => setSaveSuccessMsg(null), 4000);
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Are you sure you want to delete "${item.name}"?`)) {
        confirmDelete();
      }
    } else {
      Alert.alert(
        'Delete Item',
        `Are you sure you want to remove "${item.name}" from the menu?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: confirmDelete }
        ]
      );
    }
  };

  // -------------------------------------------------------------
  // Quick Stock Adjustment Handler
  // -------------------------------------------------------------
  const handleApplyStockAdjust = () => {
    if (!stockAdjustItem) return;
    const val = parseInt(stockDeltaInput, 10);
    if (isNaN(val)) {
      if (Platform.OS === 'web') window.alert('Please enter a valid numeric value');
      else Alert.alert('Invalid Number', 'Please enter a valid numeric quantity.');
      return;
    }

    adjustMenuItemStock(stockAdjustItem.id, val, stockMode);
    broadcastImmediately();
    setStockAdjustItem(null);
    setStockDeltaInput('');
  };

  // -------------------------------------------------------------
  // Category Management Handlers
  // -------------------------------------------------------------
  const handleSaveInlineCategory = async () => {
    const cat = inlineCatInput.trim();
    if (!cat) {
      if (Platform.OS === 'web') window.alert('Please enter a category name');
      else Alert.alert('Missing Name', 'Please enter a category name');
      return;
    }

    addCategory(cat);
    setItemCategory(cat);
    setShowInlineAddCategory(false);
    setInlineCatInput('');
    setCategoryDropdownOpen(false);
    broadcastImmediately();

    // Sync category to backend
    try {
      const ports = [5050, 5000, 80];
      const host = getMenuHost();
      for (const p of ports) {
        try {
          const url = p === 80 ? `http://${host}/api/admin/categories` : `http://${host}:${p}/api/admin/categories`;
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category: cat }),
          });
          if (res.ok) break;
        } catch (e) {}
      }
    } catch (e) {}

    setSaveSuccessMsg(`Category "${cat}" created & selected!`);
    setTimeout(() => setSaveSuccessMsg(null), 3500);
  };

  const handleAddCategory = async () => {
    const catName = newCatName.trim();
    if (!catName) {
      const msg = 'Please enter a category name';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Error', msg);
      return;
    }
    
    if (categories.some(c => c.trim().toLowerCase() === catName.toLowerCase())) {
      const msg = 'This category already exists.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Duplicate', msg);
      return;
    }

    addCategory(catName);
    setItemCategory(catName);
    broadcastImmediately();
    setCatModalVisible(false);
    setNewCatName('');

    // Sync category to backend
    try {
      const ports = [5050, 5000, 80];
      const host = getMenuHost();
      for (const p of ports) {
        try {
          const url = p === 80 ? `http://${host}/api/admin/categories` : `http://${host}:${p}/api/admin/categories`;
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category: catName }),
          });
          if (res.ok) break;
        } catch (e) {}
      }
    } catch (e) {}

    setSaveSuccessMsg(`Category "${catName}" added & synced to Mobile App!`);
    setTimeout(() => setSaveSuccessMsg(null), 4000);
  };

  const handleDeleteCategory = (catName: string) => {
    const count = menuItems.filter(i => i.category === catName).length;
    const confirmDelete = () => {
      deleteCategory(catName);
      broadcastImmediately();
    };

    const warning = count > 0 
      ? `This category contains ${count} item(s). Deleting it will remove the category classification.` 
      : `Are you sure you want to delete "${catName}"?`;

    if (Platform.OS === 'web') {
      if (window.confirm(warning)) confirmDelete();
    } else {
      Alert.alert('Delete Category', warning, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: confirmDelete }
      ]);
    }
  };

  // -------------------------------------------------------------
  // Region Management Handlers (Add, Edit, Delete with Cascading updates)
  // -------------------------------------------------------------
  const openAddRegionModal = () => {
    setEditingRegion(null);
    setRegionNameInput('');
    setRegionModalVisible(true);
  };

  const openEditRegionModal = (regionName: string) => {
    setEditingRegion(regionName);
    setRegionNameInput(regionName);
    setRegionModalVisible(true);
  };

  const handleSaveRegion = () => {
    const trimmed = regionNameInput.trim();
    if (!trimmed) {
      const msg = 'Please enter a region or cuisine name (e.g. Chinese, Continental, etc.).';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Invalid Name', msg);
      return;
    }

    if (editingRegion) {
      if (editingRegion.toLowerCase() !== trimmed.toLowerCase() && regions.some(r => r.toLowerCase() === trimmed.toLowerCase())) {
        const msg = 'A region with this name already exists.';
        if (Platform.OS === 'web') window.alert(msg);
        else Alert.alert('Duplicate Region', msg);
        return;
      }
      updateRegion(editingRegion, trimmed);
    } else {
      if (regions.some(r => r.toLowerCase() === trimmed.toLowerCase())) {
        const msg = 'This region already exists.';
        if (Platform.OS === 'web') window.alert(msg);
        else Alert.alert('Duplicate Region', msg);
        return;
      }
      addRegion(trimmed);
    }
    broadcastImmediately();
    setRegionModalVisible(false);
    setRegionNameInput('');
    setEditingRegion(null);
  };

  const handleDeleteRegion = (regionName: string) => {
    const assignedCount = menuItems.filter(i => i.region === regionName).length;
    const confirmDelete = () => {
      deleteRegion(regionName);
      broadcastImmediately();
    };

    const warning = assignedCount > 0
      ? `This region is currently assigned to ${assignedCount} dish(es). Deleting it will remove the region classification from those dishes.\n\nAre you sure you want to delete "${regionName}"?`
      : `Are you sure you want to delete region "${regionName}"?`;

    if (Platform.OS === 'web') {
      if (window.confirm(warning)) confirmDelete();
    } else {
      Alert.alert('Delete Region', warning, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: confirmDelete }
      ]);
    }
  };

  // Margin Calculation Helper
  const calculateMargin = (price: number, cost?: number) => {
    if (!cost || price <= 0) return null;
    const grossProfit = price - cost;
    const marginPct = Math.round((grossProfit / price) * 100);
    return { grossProfit, marginPct };
  };

  const handleFetchRestaurantMenu = async () => {
    const doRestore = async () => {
      try {
        setIsSyncingMenu(true);
        restoreDefaultRestaurantMenu();
        broadcastImmediately();
        const msg = 'Sultan Restaurant menu and categories successfully synced and broadcast to all devices!';
        if (Platform.OS === 'web') {
          window.alert(msg);
        } else {
          Alert.alert('Menu Synced', msg);
        }
      } catch (err: any) {
        const errMsg = 'Failed to sync menu: ' + (err.message || '');
        if (Platform.OS === 'web') window.alert(errMsg);
        else Alert.alert('Error', errMsg);
      } finally {
        setIsSyncingMenu(false);
      }
    };

    const confirmMsg = 'Do you want to reset & sync the authentic Sultan Restaurant menu (Kebabs, Karahi, Ribs, Biryani, Kunafa, Deals, etc.) across all devices and Cloud DB?';
    if (Platform.OS === 'web') {
      if (window.confirm(confirmMsg)) {
        await doRestore();
      }
    } else {
      Alert.alert(
        'Sync Sultan Restaurant Menu',
        confirmMsg,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Sync Menu', onPress: doRestore }
        ]
      );
    }
  };

  return (
    <View style={[styles.container, isMobile && styles.containerMobile]}>
      <ScrollView style={styles.listContainer} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={[styles.header, isMobile && styles.headerMobile]}>
        <View style={styles.titleWrap}>
          <Text style={[styles.pageTitle, isMobile && styles.pageTitleMobile]}>Menu & Items Master</Text>
          <Text style={styles.pageSubtitle}>
            Full Menu Catalog, Pricing, Images, Inventory & Combo Deals
          </Text>
        </View>

        <View style={styles.headerButtons}>
          <TouchableOpacity 
            style={[styles.addButton, { backgroundColor: '#065F46' }]} 
            onPress={() => router.push('/menu' as any)}
            activeOpacity={0.8}
          >
            <Ionicons name="qr-code-outline" size={17} color="#34D399" style={{ marginRight: 6 }} />
            <Text style={[styles.addButtonText, { color: '#FFFFFF' }]}>
              Digital Menu (Guest)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.addButton, { backgroundColor: '#1E3A8A' }]} 
            onPress={handleFetchRestaurantMenu}
            disabled={isSyncingMenu}
            activeOpacity={0.8}
          >
            {isSyncingMenu ? (
              <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 6 }} />
            ) : (
              <Ionicons name="sync-outline" size={17} color="#FFFFFF" style={{ marginRight: 6 }} />
            )}
            <Text style={[styles.addButtonText, { color: '#FFFFFF' }]}>
              {isSyncingMenu ? 'Syncing...' : 'Fetch Sultan Menu'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.addButton, { backgroundColor: BRAND.burgundy }]} 
            onPress={() => openAddItemModal(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="gift-outline" size={17} color={BRAND.gold} style={{ marginRight: 6 }} />
            <Text style={[styles.addButtonText, { color: BRAND.gold }]}>New Deal / Combo</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.addButton} 
            onPress={() => {
              if (activeTab === 'categories') {
                setCatModalVisible(true);
              } else if (activeTab === 'regions') {
                openAddRegionModal();
              } else {
                openAddItemModal(false);
              }
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="add" size={18} color="#4a121a" style={{ marginRight: 4 }} />
            <Text style={styles.addButtonText}>
              {activeTab === 'categories' ? 'New Category' : (activeTab === 'regions' ? 'New Region' : 'New Dish')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Sync Success Notification Toast */}
      {saveSuccessMsg && (
        <View style={{
          backgroundColor: '#064e3b',
          borderColor: '#10b981',
          borderWidth: 1.5,
          borderRadius: 12,
          paddingHorizontal: 16,
          paddingVertical: 12,
          marginBottom: 16,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        }}>
          <Ionicons name="checkmark-circle" size={24} color="#34d399" />
          <Text style={{ color: '#ecfdf5', fontSize: 14, fontWeight: '700', flex: 1 }}>
            {saveSuccessMsg}
          </Text>
        </View>
      )}

      {/* KPI Overview Banner */}
      <View style={styles.kpiContainer}>
        <View style={styles.kpiCard}>
          <View style={[styles.kpiIconWrap, { backgroundColor: BRAND.goldSoft }]}>
            <Ionicons name="restaurant-outline" size={20} color={BRAND.gold} />
          </View>
          <View>
            <Text style={styles.kpiVal}>{kpiStats.totalItems}</Text>
            <Text style={styles.kpiLabel}>Total Dishes</Text>
          </View>
        </View>

        <View style={styles.kpiCard}>
          <View style={[styles.kpiIconWrap, { backgroundColor: BRAND.purpleSoft }]}>
            <Ionicons name="gift-outline" size={20} color={BRAND.purple} />
          </View>
          <View>
            <Text style={[styles.kpiVal, { color: BRAND.purple }]}>{kpiStats.dealsCount}</Text>
            <Text style={styles.kpiLabel}>Active Deals</Text>
          </View>
        </View>

        <View style={styles.kpiCard}>
          <View style={[styles.kpiIconWrap, { backgroundColor: BRAND.successSoft }]}>
            <Ionicons name="trending-up-outline" size={20} color={BRAND.success} />
          </View>
          <View>
            <Text style={[styles.kpiVal, { color: BRAND.success }]}>{kpiStats.avgMargin}%</Text>
            <Text style={styles.kpiLabel}>Avg Profit Margin</Text>
          </View>
        </View>

        <View style={styles.kpiCard}>
          <View style={[styles.kpiIconWrap, { backgroundColor: kpiStats.lowStockCount > 0 ? BRAND.dangerSoft : BRAND.infoSoft }]}>
            <Ionicons 
              name={kpiStats.lowStockCount > 0 ? "alert-circle" : "cube-outline"} 
              size={20} 
              color={kpiStats.lowStockCount > 0 ? BRAND.danger : BRAND.info} 
            />
          </View>
          <View>
            <Text style={[styles.kpiVal, { color: kpiStats.lowStockCount > 0 ? BRAND.danger : BRAND.ink }]}>
              {kpiStats.lowStockCount}
            </Text>
            <Text style={styles.kpiLabel}>Low / Out of Stock</Text>
          </View>
        </View>
      </View>

      {/* Main Tabs */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'items' && styles.tabActive]}
          onPress={() => setActiveTab('items')}
          activeOpacity={0.7}
        >
          <Ionicons 
            name="restaurant" 
            size={16} 
            color={activeTab === 'items' ? BRAND.burgundy : BRAND.muted} 
            style={{ marginRight: 6 }} 
          />
          <Text style={[styles.tabText, activeTab === 'items' && styles.tabTextActive]}>
            Dishes & Items ({menuItems.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.tab, activeTab === 'deals' && styles.tabActive]}
          onPress={() => setActiveTab('deals')}
          activeOpacity={0.7}
        >
          <Ionicons 
            name="gift" 
            size={16} 
            color={activeTab === 'deals' ? BRAND.burgundy : BRAND.muted} 
            style={{ marginRight: 6 }} 
          />
          <Text style={[styles.tabText, activeTab === 'deals' && styles.tabTextActive]}>
            Deals & Combos ({kpiStats.dealsCount})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.tab, activeTab === 'stock' && styles.tabActive]}
          onPress={() => setActiveTab('stock')}
          activeOpacity={0.7}
        >
          <Ionicons 
            name="cube" 
            size={16} 
            color={activeTab === 'stock' ? BRAND.burgundy : BRAND.muted} 
            style={{ marginRight: 6 }} 
          />
          <Text style={[styles.tabText, activeTab === 'stock' && styles.tabTextActive]}>
            Stock & Inventory ({menuItems.filter(i => i.trackStock).length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.tab, activeTab === 'categories' && styles.tabActive]}
          onPress={() => setActiveTab('categories')}
          activeOpacity={0.7}
        >
          <Ionicons 
            name="grid" 
            size={16} 
            color={activeTab === 'categories' ? BRAND.burgundy : BRAND.muted} 
            style={{ marginRight: 6 }} 
          />
          <Text style={[styles.tabText, activeTab === 'categories' && styles.tabTextActive]}>
            Categories ({categories.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.tab, activeTab === 'regions' && styles.tabActive]}
          onPress={() => setActiveTab('regions')}
          activeOpacity={0.7}
        >
          <Ionicons 
            name="globe-outline" 
            size={16} 
            color={activeTab === 'regions' ? BRAND.burgundy : BRAND.muted} 
            style={{ marginRight: 6 }} 
          />
          <Text style={[styles.tabText, activeTab === 'regions' && styles.tabTextActive]}>
            Regions & Cuisines ({regions.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Search & Executive Filter Toolbar with Dropdowns */}
      <View style={[styles.filterSection, { zIndex: 1000 }]}>
        {/* Backdrop for closing dropdowns when clicking outside */}
        {(isFilterCatOpen || isFilterRegionOpen || isFilterSortOpen) && (
          <TouchableOpacity
            style={styles.dropdownBackdrop}
            activeOpacity={1}
            onPress={() => {
              setIsFilterCatOpen(false);
              setIsFilterRegionOpen(false);
              setIsFilterSortOpen(false);
            }}
          />
        )}

        <View style={[styles.filterBarRow, isMobile && styles.filterBarRowMobile]}>
          {/* Search Box */}
          <View style={[styles.searchBox, { flexGrow: isMobile ? 0 : 1.3, width: isMobile ? '100%' : undefined, minWidth: isMobile ? '100%' : 260 }]}>
            <View style={styles.searchIconOrb}>
              <Ionicons name="search" size={16} color={BRAND.burgundy} />
            </View>
            <TextInput 
              style={styles.searchInput}
              placeholder="Search dishes, combos, cuisines, badges..."
              placeholderTextColor="#8A7A70"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery ? (
              <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={styles.searchClearBtn}>
                <Ionicons name="close-circle" size={18} color={BRAND.gold} />
              </TouchableOpacity>
            ) : (
              <View style={styles.searchShortcutBadge}>
                <Ionicons name="sparkles" size={11} color="#B45309" style={{ marginRight: 3 }} />
                <Text style={styles.searchShortcutText}>MENU</Text>
              </View>
            )}
          </View>

          {/* Filter Dropdowns (for items, stock, and deals tabs) */}
          {(activeTab === 'items' || activeTab === 'stock' || activeTab === 'deals') && (
            <View style={[styles.dropdownsRow, isMobile && styles.dropdownsRowMobile]}>
              {/* Category Dropdown */}
              <View style={styles.dropdownAnchor}>
                <TouchableOpacity
                  style={[
                    styles.filterDropdownTrigger,
                    selectedCategoryFilter !== 'All' && styles.filterDropdownTriggerActive,
                    isFilterCatOpen && styles.filterDropdownTriggerOpen,
                    isMobile && { flex: 1, minWidth: 140 },
                  ]}
                  onPress={() => {
                    setIsFilterRegionOpen(false);
                    setIsFilterSortOpen(false);
                    setIsFilterCatOpen(prev => !prev);
                  }}
                  activeOpacity={0.8}
                >
                  <View style={styles.filterTriggerLeft}>
                    <View style={[
                      styles.filterIconCircle, 
                      selectedCategoryFilter !== 'All' ? { backgroundColor: BRAND.burgundy } : { backgroundColor: '#F3F4F6' }
                    ]}>
                      <Ionicons 
                        name="grid" 
                        size={13} 
                        color={selectedCategoryFilter !== 'All' ? BRAND.gold : '#4B5563'} 
                      />
                    </View>
                    <View style={{ gap: 1 }}>
                      <Text style={styles.filterDropdownLabel}>Category</Text>
                      <Text style={[styles.filterDropdownValue, selectedCategoryFilter !== 'All' && styles.filterDropdownValueActive]} numberOfLines={1}>
                        {selectedCategoryFilter === 'All' ? 'All Categories' : selectedCategoryFilter}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.filterTriggerRight}>
                    <View style={[styles.filterCountBadge, selectedCategoryFilter !== 'All' && styles.filterCountBadgeActive]}>
                      <Text style={[styles.filterCountText, selectedCategoryFilter !== 'All' && styles.filterCountTextActive]}>
                        {categoryCounts[selectedCategoryFilter] ?? menuItems.length}
                      </Text>
                    </View>
                    <Ionicons 
                      name={isFilterCatOpen ? "chevron-up" : "chevron-down"} 
                      size={15} 
                      color={selectedCategoryFilter !== 'All' ? BRAND.burgundy : '#6B7280'} 
                    />
                  </View>
                </TouchableOpacity>

                {/* Category Menu Popover */}
                {isFilterCatOpen && (
                  <View style={styles.dropdownMenuCard}>
                    <View style={styles.dropdownMenuHeader}>
                      <Text style={styles.dropdownMenuTitle}>Filter Category</Text>
                      <Text style={styles.dropdownMenuSubtitle}>{categories.length + 1} options</Text>
                    </View>
                    <ScrollView style={{ maxHeight: 280 }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                      {['All', ...categories].map((cat, idx) => {
                        const isSelected = selectedCategoryFilter === cat;
                        const count = categoryCounts[cat] ?? 0;
                        return (
                          <TouchableOpacity
                            key={`${cat}-${idx}`}
                            style={[styles.dropdownMenuItem, isSelected && styles.dropdownMenuItemActive]}
                            onPress={() => {
                              setSelectedCategoryFilter(cat);
                              setIsFilterCatOpen(false);
                            }}
                            activeOpacity={0.7}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                              <View style={[
                                styles.dropdownItemIndicator,
                                isSelected && { backgroundColor: BRAND.burgundy, borderColor: BRAND.gold }
                              ]}>
                                {isSelected && <Ionicons name="checkmark" size={12} color={BRAND.gold} />}
                              </View>
                              <Text style={[styles.dropdownMenuItemText, isSelected && styles.dropdownMenuItemTextActive]}>
                                {cat === 'All' ? 'All Categories' : cat}
                              </Text>
                            </View>
                            <View style={[styles.menuItemCountPill, isSelected && styles.menuItemCountPillActive]}>
                              <Text style={[styles.menuItemCountText, isSelected && styles.menuItemCountTextActive]}>
                                {count}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}
              </View>

              {/* Cuisine / Region Dropdown */}
              <View style={styles.dropdownAnchor}>
                <TouchableOpacity
                  style={[
                    styles.filterDropdownTrigger,
                    selectedRegionFilter !== 'All' && styles.filterDropdownTriggerActive,
                    isFilterRegionOpen && styles.filterDropdownTriggerOpen,
                    isMobile && { flex: 1, minWidth: 140 },
                  ]}
                  onPress={() => {
                    setIsFilterCatOpen(false);
                    setIsFilterSortOpen(false);
                    setIsFilterRegionOpen(prev => !prev);
                  }}
                  activeOpacity={0.8}
                >
                  <View style={styles.filterTriggerLeft}>
                    <View style={[
                      styles.filterIconCircle, 
                      selectedRegionFilter !== 'All' ? { backgroundColor: '#1E3A8A' } : { backgroundColor: '#F3F4F6' }
                    ]}>
                      <Ionicons 
                        name="earth" 
                        size={13} 
                        color={selectedRegionFilter !== 'All' ? '#93C5FD' : '#4B5563'} 
                      />
                    </View>
                    <View style={{ gap: 1 }}>
                      <Text style={styles.filterDropdownLabel}>Cuisine</Text>
                      <Text style={[styles.filterDropdownValue, selectedRegionFilter !== 'All' && styles.filterDropdownValueActive]} numberOfLines={1}>
                        {selectedRegionFilter === 'All' ? 'All Cuisines' : selectedRegionFilter}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.filterTriggerRight}>
                    <View style={[styles.filterCountBadge, selectedRegionFilter !== 'All' && styles.filterCountBadgeActive]}>
                      <Text style={[styles.filterCountText, selectedRegionFilter !== 'All' && styles.filterCountTextActive]}>
                        {regionCounts[selectedRegionFilter] ?? menuItems.length}
                      </Text>
                    </View>
                    <Ionicons 
                      name={isFilterRegionOpen ? "chevron-up" : "chevron-down"} 
                      size={15} 
                      color={selectedRegionFilter !== 'All' ? '#1E3A8A' : '#6B7280'} 
                    />
                  </View>
                </TouchableOpacity>

                {/* Cuisine Menu Popover */}
                {isFilterRegionOpen && (
                  <View style={[styles.dropdownMenuCard, isMobile && { right: 0, left: undefined }]}>
                    <View style={styles.dropdownMenuHeader}>
                      <Text style={styles.dropdownMenuTitle}>Filter Cuisine</Text>
                      <Text style={styles.dropdownMenuSubtitle}>{regions.length + 1} cuisines</Text>
                    </View>
                    <ScrollView style={{ maxHeight: 280 }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                      {['All', ...regions].map((reg, idx) => {
                        const isSelected = selectedRegionFilter === reg;
                        const count = regionCounts[reg] ?? 0;
                        return (
                          <TouchableOpacity
                            key={`${reg}-${idx}`}
                            style={[styles.dropdownMenuItem, isSelected && styles.dropdownMenuItemActive]}
                            onPress={() => {
                              setSelectedRegionFilter(reg);
                              setIsFilterRegionOpen(false);
                            }}
                            activeOpacity={0.7}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                              <View style={[
                                styles.dropdownItemIndicator,
                                isSelected && { backgroundColor: '#1E3A8A', borderColor: '#93C5FD' }
                              ]}>
                                {isSelected && <Ionicons name="checkmark" size={12} color="#FFFFFF" />}
                              </View>
                              <Text style={[styles.dropdownMenuItemText, isSelected && styles.dropdownMenuItemTextActive]}>
                                {reg === 'All' ? 'All Cuisines' : reg}
                              </Text>
                            </View>
                            <View style={[styles.menuItemCountPill, isSelected && styles.menuItemCountPillActive]}>
                              <Text style={[styles.menuItemCountText, isSelected && styles.menuItemCountTextActive]}>
                                {count}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}
              </View>

              {/* Sort By Dropdown */}
              <View style={styles.dropdownAnchor}>
                <TouchableOpacity
                  style={[
                    styles.filterDropdownTrigger,
                    sortBy !== 'default' && styles.filterDropdownTriggerActive,
                    isFilterSortOpen && styles.filterDropdownTriggerOpen,
                    isMobile && { flex: 1, minWidth: 140 },
                  ]}
                  onPress={() => {
                    setIsFilterCatOpen(false);
                    setIsFilterRegionOpen(false);
                    setIsFilterSortOpen(prev => !prev);
                  }}
                  activeOpacity={0.8}
                >
                  <View style={styles.filterTriggerLeft}>
                    <View style={[
                      styles.filterIconCircle, 
                      sortBy !== 'default' ? { backgroundColor: '#92400E' } : { backgroundColor: '#F3F4F6' }
                    ]}>
                      <Ionicons 
                        name="swap-vertical" 
                        size={13} 
                        color={sortBy !== 'default' ? '#FDE68A' : '#4B5563'} 
                      />
                    </View>
                    <View style={{ gap: 1 }}>
                      <Text style={styles.filterDropdownLabel}>Sort By</Text>
                      <Text style={[styles.filterDropdownValue, sortBy !== 'default' && styles.filterDropdownValueActive]} numberOfLines={1}>
                        {sortOptions.find(o => o.id === sortBy)?.label || 'Default'}
                      </Text>
                    </View>
                  </View>
                  <Ionicons 
                    name={isFilterSortOpen ? "chevron-up" : "chevron-down"} 
                    size={15} 
                    color={sortBy !== 'default' ? '#92400E' : '#6B7280'} 
                  />
                </TouchableOpacity>

                {/* Sort Menu Popover */}
                {isFilterSortOpen && (
                  <View style={[styles.dropdownMenuCard, { minWidth: 210, right: 0, left: undefined }]}>
                    <View style={styles.dropdownMenuHeader}>
                      <Text style={styles.dropdownMenuTitle}>Sort Items</Text>
                    </View>
                    <ScrollView style={{ maxHeight: 260 }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                      {sortOptions.map(opt => {
                        const isSelected = sortBy === opt.id;
                        return (
                          <TouchableOpacity
                            key={opt.id}
                            style={[styles.dropdownMenuItem, isSelected && styles.dropdownMenuItemActive]}
                            onPress={() => {
                              setSortBy(opt.id as any);
                              setIsFilterSortOpen(false);
                            }}
                            activeOpacity={0.7}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                              <Ionicons name={opt.icon as any} size={15} color={isSelected ? BRAND.burgundy : '#6B7280'} />
                              <Text style={[styles.dropdownMenuItemText, isSelected && styles.dropdownMenuItemTextActive]}>
                                {opt.label}
                              </Text>
                            </View>
                            {isSelected && <Ionicons name="checkmark" size={14} color={BRAND.burgundy} />}
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}
              </View>

              {/* Clear Filters Button (When filters active) */}
              {(selectedCategoryFilter !== 'All' || selectedRegionFilter !== 'All' || sortBy !== 'default' || searchQuery.trim() !== '') && (
                <TouchableOpacity
                  style={styles.clearFiltersBtn}
                  onPress={() => {
                    setSelectedCategoryFilter('All');
                    setSelectedRegionFilter('All');
                    setSortBy('default');
                    setSearchQuery('');
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="refresh-outline" size={15} color="#B91C1C" />
                  <Text style={styles.clearFiltersText}>Reset</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* Active Filter Chips & Counter Strip */}
        <View style={styles.activeFiltersStrip}>
          <View style={styles.resultCountWrap}>
            <Ionicons name="restaurant-outline" size={13} color={BRAND.gold} />
            <Text style={styles.resultCountText}>
              Showing <Text style={{ fontWeight: '800', color: BRAND.ink }}>{filteredItems.length}</Text> of {menuItems.length} dishes
            </Text>
          </View>

          <View style={styles.activeChipsList}>
            {selectedCategoryFilter !== 'All' && (
              <View style={styles.activeFilterChip}>
                <Ionicons name="grid" size={11} color={BRAND.burgundy} />
                <Text style={styles.activeFilterChipText}>{selectedCategoryFilter}</Text>
                <TouchableOpacity onPress={() => setSelectedCategoryFilter('All')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close" size={13} color={BRAND.burgundy} />
                </TouchableOpacity>
              </View>
            )}

            {selectedRegionFilter !== 'All' && (
              <View style={[styles.activeFilterChip, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
                <Ionicons name="earth" size={11} color="#1E40AF" />
                <Text style={[styles.activeFilterChipText, { color: '#1E40AF' }]}>{selectedRegionFilter}</Text>
                <TouchableOpacity onPress={() => setSelectedRegionFilter('All')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close" size={13} color="#1E40AF" />
                </TouchableOpacity>
              </View>
            )}

            {searchQuery.trim() !== '' && (
              <View style={[styles.activeFilterChip, { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }]}>
                <Ionicons name="search" size={11} color="#92400E" />
                <Text style={[styles.activeFilterChipText, { color: '#92400E' }]}>"{searchQuery.trim()}"</Text>
                <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close" size={13} color="#92400E" />
                </TouchableOpacity>
              </View>
            )}

            {sortBy !== 'default' && (
              <View style={[styles.activeFilterChip, { backgroundColor: '#F3F4F6', borderColor: '#E5E7EB' }]}>
                <Ionicons name="swap-vertical" size={11} color="#374151" />
                <Text style={[styles.activeFilterChipText, { color: '#374151' }]}>{sortOptions.find(o => o.id === sortBy)?.label}</Text>
                <TouchableOpacity onPress={() => setSortBy('default')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close" size={13} color="#374151" />
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* Main Content Area */}
      <View style={[styles.content, isMobile && styles.contentMobile]}>
          {activeTab !== 'categories' && activeTab !== 'regions' ? (
            // ================= MENU ITEMS / DEALS / STOCK LIST =================
            filteredItems.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Ionicons name="restaurant-outline" size={48} color="#ccc" />
                <Text style={styles.emptyTitle}>No items or deals found</Text>
                <Text style={styles.emptySubtitle}>Try changing your search query or category filter</Text>
              </View>
            ) : (
              <>
                {isMobile ? (
                  // MOBILE VIEW: RICH CARDS
                  <View style={styles.mobileCardsList}>
                    {itemsPagination.paginatedData.map(item => {
                  const marginInfo = calculateMargin(item.price, item.costPrice);
                  const isLow = item.trackStock && typeof item.stockQty === 'number' && item.stockQty <= (item.lowStockThreshold || 5);
                  const isOut = item.trackStock && typeof item.stockQty === 'number' && item.stockQty <= 0;

                  return (
                    <View key={item.id} style={styles.itemCard}>
                      <View style={styles.itemCardMain}>
                        {/* Option 3: Image Thumbnail */}
                        {item.imageUri ? (
                          <Image source={{ uri: item.imageUri }} style={styles.itemThumbImage} />
                        ) : (
                          <View style={styles.itemIconBadge}>
                            <Ionicons name={item.isDeal ? "gift" : "fast-food-outline"} size={24} color={BRAND.gold} />
                          </View>
                        )}
                        
                        <View style={styles.itemInfo}>
                          <View style={styles.itemHeaderRow}>
                            <Text style={styles.itemCardName} numberOfLines={1}>{item.name}</Text>
                            {item.badge ? (
                              <View style={[styles.badgeTag, item.isDeal ? styles.dealBadgeTag : null]}>
                                <Text style={[styles.badgeTagText, item.isDeal ? styles.dealBadgeTagText : null]}>
                                  {item.badge}
                                </Text>
                              </View>
                            ) : null}
                          </View>

                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginVertical: 3, flexWrap: 'wrap' }}>
                            <View style={styles.catBadge}>
                              <Text style={styles.catBadgeText}>{item.category}</Text>
                            </View>
                            {item.region ? (
                              <View style={styles.regionBadge}>
                                <Ionicons name="earth" size={10} color="#1E40AF" style={{ marginRight: 3 }} />
                                <Text style={styles.regionBadgeText}>{item.region}</Text>
                              </View>
                            ) : null}
                            <Text style={styles.stationText}>
                              {item.station === 'juice' ? '🍹 Juice Bar' : '🍳 Main Kitchen'}
                            </Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#FFF8E7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: '#FDE68A' }}>
                              <Ionicons name="timer-outline" size={11} color="#B45309" />
                              <Text style={{ fontSize: 11, fontWeight: '700', color: '#B45309' }}>
                                {item.prepTimeMin || (item.station === 'juice' ? 5 : 15)}m
                              </Text>
                            </View>
                          </View>

                          {/* Deal Combo Contents preview */}
                          {item.isDeal && item.dealItems && item.dealItems.length > 0 ? (
                            <View style={styles.comboPreviewWrap}>
                              <Text style={styles.comboPreviewTitle}>Includes:</Text>
                              <Text style={styles.comboPreviewText} numberOfLines={2}>
                                {item.dealItems.map(d => `${d.qty}x ${d.name}`).join(' • ')}
                              </Text>
                            </View>
                          ) : null}

                          {/* Pricing & Margin info */}
                          <View style={styles.itemPriceRow}>
                            <View>
                              <Text style={styles.itemCardPrice}>
                                {item.price > 0 ? money(item.price) : 'Variant based'}
                              </Text>
                              {item.dealOriginalPrice && item.dealOriginalPrice > item.price ? (
                                <Text style={styles.originalPriceText}>
                                  Save {money(item.dealOriginalPrice - item.price)}
                                </Text>
                              ) : null}
                            </View>

                            {/* Option 4: Margin Badge */}
                            {marginInfo && (
                              <View style={styles.marginPill}>
                                <Text style={styles.marginPillText}>
                                  {marginInfo.marginPct}% Margin
                                </Text>
                              </View>
                            )}
                          </View>

                          {/* Option 4: Stock Pill */}
                          {item.trackStock ? (
                            <TouchableOpacity 
                              style={[
                                styles.stockPill, 
                                isOut ? styles.stockPillOut : (isLow ? styles.stockPillLow : styles.stockPillIn)
                              ]}
                              onPress={() => {
                                setStockAdjustItem(item);
                                setStockDeltaInput(item.stockQty?.toString() || '0');
                                setStockMode('set');
                              }}
                            >
                              <Ionicons 
                                name={isOut ? "alert-circle" : (isLow ? "warning-outline" : "checkmark-circle")} 
                                size={12} 
                                color={isOut ? BRAND.danger : (isLow ? BRAND.warn : BRAND.success)} 
                              />
                              <Text style={[
                                styles.stockPillText,
                                isOut ? styles.stockTextOut : (isLow ? styles.stockTextLow : styles.stockTextIn)
                              ]}>
                                {isOut ? 'Sold Out' : `Stock: ${item.stockQty} portions`}
                              </Text>
                              <Ionicons name="create-outline" size={12} color={BRAND.muted} style={{ marginLeft: 4 }} />
                            </TouchableOpacity>
                          ) : (
                            <Text style={styles.untrackedStockText}>Stock Tracking: Off</Text>
                          )}
                        </View>
                      </View>

                      {/* Action buttons */}
                      <View style={styles.itemCardActions}>
                        <TouchableOpacity 
                          style={styles.editBtn} 
                          onPress={() => openEditItemModal(item)}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="pencil" size={14} color={BRAND.burgundy} style={{ marginRight: 4 }} />
                          <Text style={styles.editBtnText}>Edit</Text>
                        </TouchableOpacity>

                        {item.trackStock && (
                          <TouchableOpacity 
                            style={styles.restockQuickBtn}
                            onPress={() => adjustMenuItemStock(item.id, 10, 'add')}
                            activeOpacity={0.7}
                          >
                            <Ionicons name="add-circle-outline" size={14} color={BRAND.success} style={{ marginRight: 4 }} />
                            <Text style={styles.restockQuickBtnText}>+10 Stock</Text>
                          </TouchableOpacity>
                        )}

                        <TouchableOpacity 
                          style={styles.deleteBtn} 
                          onPress={() => handleDeleteItem(item)}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="trash-outline" size={14} color={BRAND.danger} style={{ marginRight: 4 }} />
                          <Text style={styles.deleteBtnText}>Delete</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : (
              // DESKTOP VIEW: RICH TABLE
              <View style={styles.table}>
                <View style={styles.tableHeader}>
                  <Text style={[styles.tableCell, styles.tableHeaderCell, { flex: 2.2 }]}>Dish / Combo</Text>
                  <Text style={[styles.tableCell, styles.tableHeaderCell, { flex: 1.2 }]}>Category & Region</Text>
                  <Text style={[styles.tableCell, styles.tableHeaderCell, { flex: 1.1 }]}>Price / Cost</Text>
                  <Text style={[styles.tableCell, styles.tableHeaderCell, { flex: 1 }]}>Profit Margin</Text>
                  <Text style={[styles.tableCell, styles.tableHeaderCell, { flex: 1.2 }]}>Inventory Stock</Text>
                  <Text style={[styles.tableCell, styles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Actions</Text>
                </View>
                
                {itemsPagination.paginatedData.map(item => {
                  const marginInfo = calculateMargin(item.price, item.costPrice);
                  const isLow = item.trackStock && typeof item.stockQty === 'number' && item.stockQty <= (item.lowStockThreshold || 5);
                  const isOut = item.trackStock && typeof item.stockQty === 'number' && item.stockQty <= 0;

                  return (
                    <View key={item.id} style={styles.tableRow}>
                      {/* Name & Image */}
                      <View style={[styles.tableCell, { flex: 2.2, flexDirection: 'row', alignItems: 'center' }]}>
                        {item.imageUri ? (
                          <Image source={{ uri: item.imageUri }} style={styles.tableThumbImage} />
                        ) : (
                          <View style={styles.tableThumbPlaceholder}>
                            <Ionicons name={item.isDeal ? "gift" : "restaurant-outline"} size={18} color={BRAND.gold} />
                          </View>
                        )}
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <Text style={styles.tableItemName}>{item.name}</Text>
                            {item.badge ? (
                              <View style={[styles.badgeTagSmall, item.isDeal ? styles.dealBadgeTag : null]}>
                                <Text style={[styles.badgeTagSmallText, item.isDeal ? styles.dealBadgeTagText : null]}>
                                  {item.badge}
                                </Text>
                              </View>
                            ) : null}
                          </View>
                          {item.isDeal && item.dealItems && item.dealItems.length > 0 ? (
                            <Text style={styles.comboIncludedMini} numberOfLines={1}>
                              {item.dealItems.map(d => `${d.qty}x ${d.name}`).join(', ')}
                            </Text>
                          ) : null}
                        </View>
                      </View>

                      {/* Category & Region & Station & Prep Time */}
                      <View style={[styles.tableCell, { flex: 1.2 }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                          <View style={styles.catBadge}>
                            <Text style={styles.catBadgeText}>{item.category}</Text>
                          </View>
                          {item.region ? (
                            <View style={styles.regionBadge}>
                              <Ionicons name="earth" size={10} color="#1E40AF" style={{ marginRight: 2 }} />
                              <Text style={styles.regionBadgeText}>{item.region}</Text>
                            </View>
                          ) : null}
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
                          <Text style={styles.stationTextSmall}>
                            {item.station === 'juice' ? '🍹 Juice' : '🍳 Kitchen'}
                          </Text>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: '#B45309' }}>
                            ⏱️ {item.prepTimeMin || (item.station === 'juice' ? 5 : 15)}m
                          </Text>
                        </View>
                      </View>

                      {/* Price & Cost */}
                      <View style={[styles.tableCell, { flex: 1.2 }]}>
                        <Text style={styles.tablePriceText}>
                          {item.price > 0 ? money(item.price) : 'Variants'}
                        </Text>
                        {item.costPrice ? (
                          <Text style={styles.tableCostText}>Cost: {money(item.costPrice)}</Text>
                        ) : (
                          <Text style={styles.tableCostTextNone}>Cost: —</Text>
                        )}
                      </View>

                      {/* Margin */}
                      <View style={[styles.tableCell, { flex: 1 }]}>
                        {marginInfo ? (
                          <View>
                            <View style={[
                              styles.marginBadge, 
                              marginInfo.marginPct >= 50 ? styles.marginHigh : (marginInfo.marginPct >= 30 ? styles.marginMid : styles.marginLow)
                            ]}>
                              <Text style={[
                                styles.marginBadgeText,
                                marginInfo.marginPct >= 50 ? styles.marginHighText : (marginInfo.marginPct >= 30 ? styles.marginMidText : styles.marginLowText)
                              ]}>
                                {marginInfo.marginPct}%
                              </Text>
                            </View>
                            <Text style={styles.marginProfitSub}>+{money(marginInfo.grossProfit)}</Text>
                          </View>
                        ) : (
                          <Text style={{ color: BRAND.muted, fontSize: 12 }}>—</Text>
                        )}
                      </View>

                      {/* Stock Inventory */}
                      <View style={[styles.tableCell, { flex: 1.2 }]}>
                        {item.trackStock ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <TouchableOpacity 
                              style={[
                                styles.stockPill, 
                                isOut ? styles.stockPillOut : (isLow ? styles.stockPillLow : styles.stockPillIn)
                              ]}
                              onPress={() => {
                                setStockAdjustItem(item);
                                setStockDeltaInput(item.stockQty?.toString() || '0');
                                setStockMode('set');
                              }}
                            >
                              <Text style={[
                                styles.stockPillText,
                                isOut ? styles.stockTextOut : (isLow ? styles.stockTextLow : styles.stockTextIn)
                              ]}>
                                {isOut ? 'Sold Out (0)' : `${item.stockQty} pcs`}
                              </Text>
                              <Ionicons name="create-outline" size={12} color={BRAND.muted} />
                            </TouchableOpacity>

                            <TouchableOpacity 
                              style={styles.quickAddStockMini}
                              onPress={() => adjustMenuItemStock(item.id, 10, 'add')}
                            >
                              <Text style={styles.quickAddStockMiniText}>+10</Text>
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <Text style={{ color: BRAND.muted, fontSize: 12 }}>Untracked</Text>
                        )}
                      </View>

                      {/* Actions */}
                      <View style={[styles.tableCell, { flex: 1, flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }]}>
                        <TouchableOpacity 
                          style={styles.desktopActionBtn} 
                          onPress={() => openEditItemModal(item)}
                        >
                          <Ionicons name="pencil" size={16} color={BRAND.burgundy} />
                        </TouchableOpacity>
                        <TouchableOpacity 
                          style={[styles.desktopActionBtn, { backgroundColor: BRAND.dangerSoft }]} 
                          onPress={() => handleDeleteItem(item)}
                        >
                          <Ionicons name="trash-outline" size={16} color={BRAND.danger} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            <PaginationControl
              currentPage={itemsPagination.currentPage}
              totalPages={itemsPagination.totalPages}
              totalItems={itemsPagination.totalItems}
              pageSize={itemsPagination.pageSize}
              pageSizeOptions={[10, 20, 50, 100]}
              onPageChange={itemsPagination.goToPage}
              onPageSizeChange={itemsPagination.setPageSize}
              itemName={activeTab === 'deals' ? 'deals' : 'dishes'}
            />
          </>
        )) : activeTab === 'categories' ? (
            // ================= CATEGORIES LIST =================
            filteredCategories.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Ionicons name="grid-outline" size={48} color="#ccc" />
                <Text style={styles.emptyTitle}>No categories found</Text>
              </View>
            ) : isMobile ? (
              // MOBILE VIEW: CATEGORY CARDS
              <View style={styles.mobileCardsList}>
                {filteredCategories.map(cat => (
                  <View key={cat.id} style={styles.categoryCard}>
                    <View style={styles.categoryCardLeft}>
                      <View style={styles.categoryIconBadge}>
                        <Ionicons name="folder-outline" size={22} color={BRAND.burgundy} />
                      </View>
                      <View>
                        <Text style={styles.categoryCardTitle}>{cat.name}</Text>
                        <Text style={styles.categoryCardCount}>{cat.itemsCount} Dishes listed</Text>
                      </View>
                    </View>
                    <TouchableOpacity 
                      style={styles.deleteCategoryBtn}
                      onPress={() => handleDeleteCategory(cat.name)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="trash-outline" size={18} color={BRAND.danger} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ) : (
              // DESKTOP VIEW: CATEGORIES TABLE
              <View style={styles.table}>
                <View style={styles.tableHeader}>
                  <Text style={[styles.tableCell, styles.tableHeaderCell, { flex: 2 }]}>Category Name</Text>
                  <Text style={[styles.tableCell, styles.tableHeaderCell]}>Assigned Items</Text>
                  <Text style={[styles.tableCell, styles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Actions</Text>
                </View>
                
                {filteredCategories.map(cat => (
                  <View key={cat.id} style={styles.tableRow}>
                    <Text style={[styles.tableCell, { flex: 2, fontWeight: '700', fontSize: 16, color: BRAND.ink }]}>
                      {cat.name}
                    </Text>
                    <Text style={styles.tableCell}>{cat.itemsCount} Items</Text>
                    <View style={[styles.tableCell, { flex: 1, flexDirection: 'row', justifyContent: 'flex-end' }]}>
                      <TouchableOpacity 
                        style={[styles.desktopActionBtn, { backgroundColor: BRAND.dangerSoft }]} 
                        onPress={() => handleDeleteCategory(cat.name)}
                      >
                        <Ionicons name="trash-outline" size={16} color={BRAND.danger} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )
          ) : (
            // ================= REGIONS & CUISINES LIST =================
            filteredRegions.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Ionicons name="globe-outline" size={48} color="#ccc" />
                <Text style={styles.emptyTitle}>No regions or cuisines found</Text>
                <Text style={styles.emptySubtitle}>Click "New Region" above to add culinary regions like Pakistani, Chinese, Continental, etc.</Text>
              </View>
            ) : isMobile ? (
              // MOBILE VIEW: REGION CARDS
              <View style={styles.mobileCardsList}>
                {filteredRegions.map(reg => (
                  <View key={reg.id} style={styles.categoryCard}>
                    <View style={styles.categoryCardLeft}>
                      <View style={[styles.categoryIconBadge, { backgroundColor: '#EFF6FF' }]}>
                        <Ionicons name="earth" size={22} color="#1D4ED8" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.categoryCardTitle}>{reg.name}</Text>
                        <Text style={styles.categoryCardCount}>{reg.itemsCount} Dishes assigned</Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <TouchableOpacity 
                        style={[styles.editBtn, { backgroundColor: '#EFF6FF' }]}
                        onPress={() => {
                          setSelectedRegionFilter(reg.name);
                          setActiveTab('items');
                        }}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="restaurant-outline" size={13} color="#1D4ED8" style={{ marginRight: 3 }} />
                        <Text style={[styles.editBtnText, { color: '#1D4ED8' }]}>Dishes</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={styles.editBtn}
                        onPress={() => openEditRegionModal(reg.name)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="pencil" size={13} color={BRAND.burgundy} style={{ marginRight: 3 }} />
                        <Text style={styles.editBtnText}>Edit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={styles.deleteCategoryBtn}
                        onPress={() => handleDeleteRegion(reg.name)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="trash-outline" size={16} color={BRAND.danger} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              // DESKTOP VIEW: REGIONS TABLE
              <View style={styles.table}>
                <View style={styles.tableHeader}>
                  <Text style={[styles.tableCell, styles.tableHeaderCell, { flex: 2 }]}>Region / Cuisine</Text>
                  <Text style={[styles.tableCell, styles.tableHeaderCell, { flex: 1.2 }]}>Assigned Dishes</Text>
                  <Text style={[styles.tableCell, styles.tableHeaderCell, { flex: 1.2 }]}>Filter Dishes</Text>
                  <Text style={[styles.tableCell, styles.tableHeaderCell, { flex: 1.2, textAlign: 'right' }]}>Actions</Text>
                </View>
                
                {filteredRegions.map(reg => (
                  <View key={reg.id} style={styles.tableRow}>
                    <View style={[styles.tableCell, { flex: 2, flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
                      <View style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="earth" size={18} color="#1D4ED8" />
                      </View>
                      <View>
                        <Text style={{ fontWeight: '800', fontSize: 15, color: BRAND.ink }}>
                          {reg.name}
                        </Text>
                        <Text style={{ fontSize: 11, color: BRAND.muted, marginTop: 1 }}>
                          Cuisine Classification
                        </Text>
                      </View>
                    </View>
                    <View style={[styles.tableCell, { flex: 1.2 }]}>
                      <View style={{ backgroundColor: '#F1F5F9', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, alignSelf: 'flex-start' }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#334155' }}>
                          {reg.itemsCount} Dishes
                        </Text>
                      </View>
                    </View>
                    <View style={[styles.tableCell, { flex: 1.2 }]}>
                      <TouchableOpacity
                        style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#EFF6FF', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, alignSelf: 'flex-start' }}
                        onPress={() => {
                          setSelectedRegionFilter(reg.name);
                          setActiveTab('items');
                        }}
                      >
                        <Ionicons name="filter-outline" size={13} color="#1D4ED8" style={{ marginRight: 4 }} />
                        <Text style={{ fontSize: 11.5, fontWeight: '700', color: '#1D4ED8' }}>View Dishes</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={[styles.tableCell, { flex: 1.2, flexDirection: 'row', justifyContent: 'flex-end', gap: 6 }]}>
                      <TouchableOpacity 
                        style={[styles.desktopActionBtn, { backgroundColor: BRAND.burgundySoft }]} 
                        onPress={() => openEditRegionModal(reg.name)}
                      >
                        <Ionicons name="pencil" size={15} color={BRAND.burgundy} />
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={[styles.desktopActionBtn, { backgroundColor: BRAND.dangerSoft }]} 
                        onPress={() => handleDeleteRegion(reg.name)}
                      >
                        <Ionicons name="trash-outline" size={15} color={BRAND.danger} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )
          )}
      </View>
      </ScrollView>

      {/* ============================================================== */}
      {/* ADD / EDIT ITEM MODAL (With Tabbed Upgrades for 3, 4, and 5)   */}
      {/* ============================================================== */}
      <Modal visible={isItemModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, isMobile && styles.modalContentMobile]}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>
                  {editingItem ? (itemIsDeal ? 'Edit Deal / Combo Pack' : 'Edit Menu Dish') : (itemIsDeal ? 'Create New Deal / Combo Pack' : 'Add New Menu Dish')}
                </Text>
                <Text style={styles.modalSub}>
                  {itemIsDeal ? 'Configure bundled dishes, special pricing & badges' : 'Configure dish details, image, cost margin & stock'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setItemModalVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={24} color={BRAND.muted} />
              </TouchableOpacity>
            </View>

            {/* Modal Sub-Tabs */}
            <View style={styles.modalTabsBar}>
              <TouchableOpacity 
                style={[styles.modalSubTab, modalTab === 'basic' && styles.modalSubTabActive]}
                onPress={() => setModalTab('basic')}
              >
                <Ionicons name="information-circle-outline" size={15} color={modalTab === 'basic' ? BRAND.burgundy : BRAND.muted} />
                <Text style={[styles.modalSubTabText, modalTab === 'basic' && styles.modalSubTabTextActive]}>
                  1. Basic Details
                </Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.modalSubTab, modalTab === 'image' && styles.modalSubTabActive]}
                onPress={() => setModalTab('image')}
              >
                <Ionicons name="image-outline" size={15} color={modalTab === 'image' ? BRAND.burgundy : BRAND.muted} />
                <Text style={[styles.modalSubTabText, modalTab === 'image' && styles.modalSubTabTextActive]}>
                  2. Image & Presets
                </Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.modalSubTab, modalTab === 'pricing_stock' && styles.modalSubTabActive]}
                onPress={() => setModalTab('pricing_stock')}
              >
                <Ionicons name="cash-outline" size={15} color={modalTab === 'pricing_stock' ? BRAND.burgundy : BRAND.muted} />
                <Text style={[styles.modalSubTabText, modalTab === 'pricing_stock' && styles.modalSubTabTextActive]}>
                  3. Pricing & Stock
                </Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.modalSubTab, modalTab === 'combo' && styles.modalSubTabActive]}
                onPress={() => setModalTab('combo')}
              >
                <Ionicons name="gift-outline" size={15} color={modalTab === 'combo' ? BRAND.burgundy : BRAND.muted} />
                <Text style={[styles.modalSubTabText, modalTab === 'combo' && styles.modalSubTabTextActive]}>
                  4. Combo / Deal {itemIsDeal && '✨'}
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBodyScroll} showsVerticalScrollIndicator={false}>
              {/* TAB 1: BASIC DETAILS */}
              {modalTab === 'basic' && (
                <View style={styles.modalTabPane}>
                  {/* Photo Quick Status & Switch */}
                  <TouchableOpacity 
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12,
                      backgroundColor: itemImageUri ? '#FDFBF7' : '#F8F9FA',
                      borderWidth: 1.5,
                      borderColor: itemImageUri ? '#D4AF37' : '#E2E8F0',
                      borderRadius: 12,
                      padding: 10,
                      marginBottom: 16
                    }}
                    onPress={() => setModalTab('image')}
                    activeOpacity={0.8}
                  >
                    {itemImageUri ? (
                      <Image source={{ uri: itemImageUri }} style={{ width: 44, height: 44, borderRadius: 8 }} />
                    ) : (
                      <View style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: '#52141C15', alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="camera-outline" size={22} color="#52141C" />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: '#1E293B' }}>
                        {itemImageUri ? 'Dish Photo Attached' : 'Add Dish Photo (Recommended)'}
                      </Text>
                      <Text style={{ fontSize: 11, color: '#64748B' }}>
                        {itemImageUri ? 'Tap to change photo or pick curated preset' : 'Tap to upload from device, snap photo or choose preset'}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#D4AF37" />
                  </TouchableOpacity>

                  <Text style={styles.inputLabel}>Dish / Deal Name *</Text>
                  <TextInput 
                    style={styles.modalInput} 
                    placeholder="e.g. Royal Sultan Special Kebab" 
                    placeholderTextColor="#8E8E93"
                    value={itemName} 
                    onChangeText={setItemName} 
                  />

                  {/* Category Selection with Instant Add */}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, marginBottom: 6 }}>
                    <Text style={[styles.inputLabel, { marginTop: 0, marginBottom: 0 }]}>Category *</Text>
                    <TouchableOpacity 
                      style={styles.quickAddCatBtn}
                      onPress={() => setShowInlineAddCategory(!showInlineAddCategory)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name={showInlineAddCategory ? "close-circle" : "add-circle"} size={15} color={BRAND.burgundy} />
                      <Text style={styles.quickAddCatBtnText}>
                        {showInlineAddCategory ? 'Cancel' : '+ New Category'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Inline Category Creation Input */}
                  {showInlineAddCategory && (
                    <View style={styles.inlineAddCatBox}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <TextInput 
                          style={styles.inlineAddCatInput} 
                          placeholder="e.g. Beverages, Cold Drinks, Soups..." 
                          placeholderTextColor="#8E8E93"
                          value={inlineCatInput} 
                          onChangeText={setInlineCatInput} 
                          autoFocus
                          onSubmitEditing={handleSaveInlineCategory}
                        />
                        <TouchableOpacity 
                          style={styles.inlineAddCatSaveBtn}
                          onPress={handleSaveInlineCategory}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                          <Text style={styles.inlineAddCatSaveBtnText}>Add</Text>
                        </TouchableOpacity>
                      </View>
                      <Text style={styles.inlineAddCatHint}>
                        ✨ Adds category instantly and auto-selects it for this dish without page reload!
                      </Text>
                    </View>
                  )}

                  <TouchableOpacity 
                    style={styles.dropdownBtn}
                    activeOpacity={0.8}
                    onPress={() => setCategoryDropdownOpen(!isCategoryDropdownOpen)}
                  >
                    <Text style={styles.dropdownBtnText}>{itemCategory}</Text>
                    <Ionicons name={isCategoryDropdownOpen ? "chevron-up" : "chevron-down"} size={20} color="#8E8E93" />
                  </TouchableOpacity>
                  
                  {isCategoryDropdownOpen && (
                    <View style={styles.dropdownList}>
                      <ScrollView style={{ maxHeight: 180 }} nestedScrollEnabled>
                        {categories.map(cat => (
                          <TouchableOpacity 
                            key={cat}
                            style={[styles.dropdownItem, itemCategory === cat && styles.dropdownItemActive]}
                            onPress={() => {
                              setItemCategory(cat);
                              setCategoryDropdownOpen(false);
                            }}
                          >
                            <Text style={[styles.dropdownItemText, itemCategory === cat && styles.dropdownItemTextActive]}>
                              {cat}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                      <TouchableOpacity 
                        style={styles.dropdownAddNewCatBtn}
                        onPress={() => {
                          setCategoryDropdownOpen(false);
                          setShowInlineAddCategory(true);
                        }}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="add-circle-outline" size={16} color={BRAND.burgundy} style={{ marginRight: 6 }} />
                        <Text style={styles.dropdownAddNewCatBtnText}>+ Create New Category</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Selling Price & Cost Price */}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                    <View style={{ flex: 1, minWidth: 140 }}>
                      <Text style={styles.inputLabel}>Selling Price (Rs.) *</Text>
                      <TextInput 
                        style={styles.modalInput} 
                        placeholder="e.g. 1200" 
                        placeholderTextColor="#8E8E93"
                        keyboardType="numeric" 
                        value={itemPrice} 
                        onChangeText={setItemPrice} 
                      />
                    </View>
                    <View style={{ flex: 1, minWidth: 140 }}>
                      <Text style={styles.inputLabel}>Cost Price (Rs.) (Optional)</Text>
                      <TextInput 
                        style={styles.modalInput} 
                        placeholder="e.g. 600" 
                        placeholderTextColor="#8E8E93"
                        keyboardType="numeric" 
                        value={itemCostPrice} 
                        onChangeText={setItemCostPrice} 
                      />
                    </View>
                  </View>

                  {/* Photo / Image Selection */}
                  <Text style={[styles.inputLabel, { marginTop: 4 }]}>Dish Photo / Image (Syncs to Mobile App & Web)</Text>
                  
                  {itemImageUri ? (
                    <View style={styles.imagePreviewContainer}>
                      <Image source={{ uri: itemImageUri }} style={styles.imagePreview} resizeMode="cover" />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: '700', fontSize: 13, color: BRAND.ink }}>Photo Attached</Text>
                        <Text style={{ fontSize: 11, color: BRAND.muted, marginVertical: 4 }} numberOfLines={1}>
                          {itemImageUri.startsWith('data:') ? 'Custom Uploaded Photo' : itemImageUri}
                        </Text>
                        <TouchableOpacity 
                          style={styles.clearImageBtn}
                          onPress={() => setItemImageUri('')}
                        >
                          <Ionicons name="trash-outline" size={14} color={BRAND.danger} style={{ marginRight: 4 }} />
                          <Text style={{ color: BRAND.danger, fontSize: 12, fontWeight: '700' }}>Remove Photo</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : null}

                  {/* Image URL input & Upload button */}
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                    <TextInput 
                      style={[styles.modalInput, { flex: 1, marginBottom: 0 }]} 
                      placeholder="Paste Image URL or pick preset below..." 
                      placeholderTextColor="#8E8E93"
                      value={itemImageUri} 
                      onChangeText={setItemImageUri} 
                    />
                    <TouchableOpacity 
                      style={{
                        backgroundColor: BRAND.burgundySoft,
                        borderColor: BRAND.gold,
                        borderWidth: 1,
                        borderRadius: 10,
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 4
                      }}
                      onPress={pickImageFromDevice}
                      disabled={isUploadingImage}
                    >
                      <Ionicons name="cloud-upload-outline" size={16} color={BRAND.burgundy} />
                      <Text style={{ fontSize: 12, fontWeight: '700', color: BRAND.burgundy }}>
                        {isUploadingImage ? 'Uploading...' : 'Upload'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* 1-Tap Quick Food Image Presets */}
                  <Text style={{ fontSize: 11, fontWeight: '700', color: BRAND.muted, marginBottom: 6 }}>
                    Quick 1-Tap Food Photos:
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {FOOD_PRESETS.slice(0, 10).map(p => (
                        <TouchableOpacity
                          key={p.id}
                          style={{
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                            borderRadius: 8,
                            backgroundColor: itemImageUri === p.imageUri ? BRAND.burgundy : '#F3F4F6',
                            borderWidth: 1,
                            borderColor: itemImageUri === p.imageUri ? BRAND.burgundy : '#E5E7EB',
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 5
                          }}
                          onPress={() => {
                            setItemImageUri(p.imageUri);
                            if (!itemName) setItemName(p.name);
                            if (!itemPrice) setItemPrice(p.defaultPrice.toString());
                            if (!itemCostPrice && p.defaultCost) setItemCostPrice(p.defaultCost.toString());
                            if (!itemDescription && p.description) setItemDescription(p.description);
                            if (!itemBadge && p.badge) setItemBadge(p.badge);
                          }}
                        >
                          <Ionicons 
                            name={p.icon as any || 'restaurant-outline'} 
                            size={14} 
                            color={itemImageUri === p.imageUri ? '#fff' : BRAND.ink} 
                          />
                          <Text style={{
                            fontSize: 12,
                            fontWeight: '600',
                            color: itemImageUri === p.imageUri ? '#fff' : BRAND.ink
                          }}>
                            {p.name.replace('Sultan ', '').replace('Royal ', '')}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>

                  {/* Region / Cuisine Dropdown */}
                  <Text style={[styles.inputLabel, { marginTop: 14 }]}>Region / Cuisine</Text>
                  <TouchableOpacity 
                    style={styles.dropdownBtn}
                    activeOpacity={0.8}
                    onPress={() => setRegionDropdownOpen(!isRegionDropdownOpen)}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="globe-outline" size={16} color="#1E40AF" />
                      <Text style={[styles.dropdownBtnText, !itemRegion && { color: '#8E8E93' }]}>
                        {itemRegion || 'Select Region / Cuisine (Optional)'}
                      </Text>
                    </View>
                    <Ionicons name={isRegionDropdownOpen ? "chevron-up" : "chevron-down"} size={20} color="#8E8E93" />
                  </TouchableOpacity>
                  
                  {isRegionDropdownOpen && (
                    <View style={styles.dropdownList}>
                      <ScrollView style={{ maxHeight: 160 }} nestedScrollEnabled>
                        <TouchableOpacity 
                          style={[styles.dropdownItem, !itemRegion && styles.dropdownItemActive]}
                          onPress={() => {
                            setItemRegion('');
                            setRegionDropdownOpen(false);
                          }}
                        >
                          <Text style={[styles.dropdownItemText, !itemRegion && styles.dropdownItemTextActive]}>
                            — None / Not Specified —
                          </Text>
                        </TouchableOpacity>
                        {regions.map(reg => (
                          <TouchableOpacity 
                            key={reg}
                            style={[styles.dropdownItem, itemRegion === reg && styles.dropdownItemActive]}
                            onPress={() => {
                              setItemRegion(reg);
                              setRegionDropdownOpen(false);
                            }}
                          >
                            <Text style={[styles.dropdownItemText, itemRegion === reg && styles.dropdownItemTextActive]}>
                              🌍 {reg}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}

                  {/* Station / Preparation Area */}
                  <Text style={[styles.inputLabel, { marginTop: 14 }]}>Kitchen Routing / Station</Text>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity 
                      style={[
                        styles.stationSelectBtn, 
                        itemStation === 'main' && styles.stationSelectBtnActive
                      ]}
                      onPress={() => setItemStation('main')}
                    >
                      <Ionicons name="restaurant" size={18} color={itemStation === 'main' ? BRAND.burgundy : BRAND.muted} style={{ marginRight: 6 }} />
                      <Text style={[styles.stationSelectText, itemStation === 'main' && styles.stationSelectTextActive]}>
                        Main Kitchen
                      </Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity 
                      style={[
                        styles.stationSelectBtn, 
                        itemStation === 'juice' && styles.stationSelectBtnActive
                      ]}
                      onPress={() => {
                        setItemStation('juice');
                        if (itemPrepTime === '15') setItemPrepTime('5');
                      }}
                    >
                      <Ionicons name="wine" size={18} color={itemStation === 'juice' ? BRAND.burgundy : BRAND.muted} style={{ marginRight: 6 }} />
                      <Text style={[styles.stationSelectText, itemStation === 'juice' && styles.stationSelectTextActive]}>
                        Juice & Drinks Bar
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Cooking / Preparation Time (Minutes) */}
                  <Text style={[styles.inputLabel, { marginTop: 14 }]}>
                    Cooking / Preparation Time (Minutes)
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={[styles.modalInput, { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10 }]}>
                      <Ionicons name="timer-outline" size={18} color="#8E8E93" style={{ marginRight: 8 }} />
                      <TextInput 
                        style={{ flex: 1, fontSize: 14, color: '#1C1C1E', height: '100%' }}
                        placeholder="e.g. 15" 
                        placeholderTextColor="#8E8E93"
                        keyboardType="numeric"
                        value={itemPrepTime} 
                        onChangeText={setItemPrepTime} 
                      />
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#8E8E93' }}>Minutes</Text>
                    </View>
                  </View>

                  {/* Quick Preset Buttons */}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    {['5', '10', '15', '20', '25', '35'].map((mins) => (
                      <TouchableOpacity
                        key={mins}
                        style={[
                          styles.badgeOptionPill,
                          itemPrepTime === mins && styles.badgeOptionPillActive,
                          { paddingHorizontal: 10, paddingVertical: 4 }
                        ]}
                        onPress={() => setItemPrepTime(mins)}
                      >
                        <Text style={[
                          styles.badgeOptionPillText,
                          itemPrepTime === mins && styles.badgeOptionPillTextActive,
                          { fontSize: 11 }
                        ]}>
                          ⏱️ {mins} min
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Badge Selection */}
                  <Text style={[styles.inputLabel, { marginTop: 14 }]}>Special Badge (Optional)</Text>
                  <View style={styles.badgePillsRow}>
                    {POPULAR_BADGES.map(b => (
                      <TouchableOpacity
                        key={b}
                        style={[styles.badgeOptionPill, itemBadge === b && styles.badgeOptionPillActive]}
                        onPress={() => setItemBadge(itemBadge === b ? '' : b)}
                      >
                        <Text style={[styles.badgeOptionPillText, itemBadge === b && styles.badgeOptionPillTextActive]}>
                          {b}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={[styles.inputLabel, { marginTop: 14 }]}>Description / Ingredients</Text>
                  <TextInput 
                    style={[styles.modalInput, { height: 70, textAlignVertical: 'top' }]} 
                    placeholder="Short appetising description for digital menu and waiters..." 
                    placeholderTextColor="#8E8E93"
                    multiline
                    value={itemDescription} 
                    onChangeText={setItemDescription} 
                  />
                </View>
              )}

              {/* TAB 2: IMAGE & PRESETS (OPTION 3) */}
              {modalTab === 'image' && (
                <View style={styles.modalTabPane}>
                  <Text style={styles.sectionHeading}>Dish Image & Visual Presets</Text>
                  <Text style={styles.sectionDesc}>
                    Upload high-res photos from your device, take a live kitchen photo, paste an image URL, or choose a 1-tap preset.
                  </Text>

                  {/* Upload Action Buttons */}
                  <View style={styles.uploadActionsRow}>
                    <TouchableOpacity 
                      style={[styles.uploadButton, isUploadingImage && styles.uploadButtonDisabled]}
                      onPress={pickImageFromDevice}
                      disabled={isUploadingImage}
                      activeOpacity={0.8}
                    >
                      <View style={styles.uploadIconWrap}>
                        <Ionicons name="cloud-upload-outline" size={22} color={BRAND.burgundy} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.uploadButtonTitle}>Upload from Device / Gallery</Text>
                        <Text style={styles.uploadButtonSub}>Select JPG, PNG or WebP from PC or Phone</Text>
                      </View>
                      {isUploadingImage && <ActivityIndicator size="small" color={BRAND.burgundy} />}
                    </TouchableOpacity>

                    <TouchableOpacity 
                      style={[styles.cameraButton, isUploadingImage && styles.uploadButtonDisabled]}
                      onPress={takePhotoWithCamera}
                      disabled={isUploadingImage}
                      activeOpacity={0.8}
                    >
                      <View style={[styles.uploadIconWrap, { backgroundColor: BRAND.goldSoft }]}>
                        <Ionicons name="camera-outline" size={22} color="#8c6b1b" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.uploadButtonTitle}>Take Photo with Camera</Text>
                        <Text style={styles.uploadButtonSub}>Snap fresh dish in kitchen or table</Text>
                      </View>
                    </TouchableOpacity>
                  </View>

                  {/* Image Preview */}
                  <View style={styles.imagePreviewContainer}>
                    {itemImageUri ? (
                      <View style={styles.previewImageWrap}>
                        <Image source={{ uri: itemImageUri }} style={styles.imagePreview} />
                        <View style={styles.previewActiveBadge}>
                          <Ionicons name="checkmark-circle" size={12} color="#fff" />
                          <Text style={styles.previewActiveBadgeText}>Active Image</Text>
                        </View>
                      </View>
                    ) : (
                      <View style={styles.imagePlaceholder}>
                        <Ionicons name="image-outline" size={40} color={BRAND.muted} />
                        <Text style={{ color: BRAND.muted, fontSize: 13, marginTop: 4 }}>No Image Selected</Text>
                      </View>
                    )}

                    <View style={{ flex: 1 }}>
                      <Text style={styles.inputLabel}>Or Enter Image URL:</Text>
                      <TextInput 
                        style={styles.modalInput} 
                        placeholder="https://images.unsplash.com/..." 
                        placeholderTextColor="#8E8E93"
                        value={itemImageUri} 
                        onChangeText={setItemImageUri} 
                      />
                      {itemImageUri ? (
                        <TouchableOpacity 
                          style={styles.clearImageBtn}
                          onPress={() => setItemImageUri('')}
                        >
                          <Ionicons name="trash-outline" size={14} color={BRAND.danger} style={{ marginRight: 4 }} />
                          <Text style={{ color: BRAND.danger, fontSize: 12, fontWeight: '700' }}>Remove Image</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>

                  {/* 1-Tap Curated Food Presets */}
                  <Text style={[styles.inputLabel, { marginTop: 16 }]}>Or Choose 1-Tap Curated Preset (Click to apply image)</Text>
                  <View style={styles.presetGrid}>
                    {FOOD_PRESETS.map(preset => {
                      const isSelected = itemImageUri === preset.imageUri;
                      return (
                        <TouchableOpacity 
                          key={preset.id}
                          style={[styles.presetCard, isSelected && styles.presetCardActive]}
                          onPress={() => handleSelectPresetImageOnly(preset.imageUri)}
                          activeOpacity={0.8}
                        >
                          <Image source={{ uri: preset.imageUri }} style={styles.presetImage} />
                          <View style={styles.presetOverlay}>
                            <Text style={styles.presetName} numberOfLines={1}>{preset.name}</Text>
                            <Text style={styles.presetPrice}>{money(preset.defaultPrice)}</Text>
                          </View>
                          {isSelected && (
                            <View style={styles.presetSelectedBadge}>
                              <Ionicons name="checkmark-circle" size={16} color="#059669" />
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* TAB 3: PRICING, COST & STOCK (OPTION 4) */}
              {modalTab === 'pricing_stock' && (
                <View style={styles.modalTabPane}>
                  <Text style={styles.sectionHeading}>Pricing & Profit Margin Analysis</Text>

                  {/* Price & Cost Inputs */}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
                    <View style={{ flex: 1, minWidth: 140 }}>
                      <Text style={styles.inputLabel}>Selling Price (Rs.) *</Text>
                      <TextInput 
                        style={styles.modalInput} 
                        placeholder="e.g. 1450" 
                        placeholderTextColor="#8E8E93"
                        keyboardType="numeric" 
                        value={itemPrice} 
                        onChangeText={setItemPrice} 
                      />
                    </View>

                    <View style={{ flex: 1, minWidth: 140 }}>
                      <Text style={styles.inputLabel}>Cost of Goods (Rs.)</Text>
                      <TextInput 
                        style={styles.modalInput} 
                        placeholder="e.g. 650" 
                        placeholderTextColor="#8E8E93"
                        keyboardType="numeric" 
                        value={itemCostPrice} 
                        onChangeText={setItemCostPrice} 
                      />
                    </View>
                  </View>

                  {/* Live Profit Margin Calculator */}
                  {(() => {
                    const p = parseFloat(itemPrice) || 0;
                    const c = parseFloat(itemCostPrice) || 0;
                    if (p > 0 && c > 0) {
                      const profit = p - c;
                      const margin = Math.round((profit / p) * 100);
                      const isHigh = margin >= 50;
                      const isMid = margin >= 30 && margin < 50;

                      return (
                        <View style={[
                          styles.marginAnalysisBanner, 
                          isHigh ? styles.marginAnalysisBannerGreen : (isMid ? styles.marginAnalysisBannerYellow : styles.marginAnalysisBannerRed)
                        ]}>
                          <Ionicons 
                            name={isHigh ? "trending-up-outline" : (isMid ? "stats-chart-outline" : "alert-circle-outline")} 
                            size={24} 
                            color={isHigh ? BRAND.success : (isMid ? BRAND.warn : BRAND.danger)} 
                          />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.marginAnalysisTitle}>
                              Gross Profit: {money(profit)} ({margin}% Margin)
                            </Text>
                            <Text style={styles.marginAnalysisDesc}>
                              {isHigh 
                                ? '✨ Healthy margin! High profitability per portion sold.' 
                                : (isMid ? '👍 Balanced margin covering standard restaurant overhead.' : '⚠️ Low profit margin. Consider adjusting cost or price.')}
                            </Text>
                          </View>
                        </View>
                      );
                    }
                    return null;
                  })()}

                  {/* Stock Inventory Tracking (Option 4) */}
                  <View style={styles.stockTrackingSection}>
                    <View style={styles.stockToggleRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.stockToggleTitle}>Track Stock Inventory</Text>
                        <Text style={styles.stockToggleSubtitle}>
                          Auto-decrements stock when orders are placed and alerts kitchen when low
                        </Text>
                      </View>
                      <Switch
                        value={itemTrackStock}
                        onValueChange={setItemTrackStock}
                        trackColor={{ false: '#ccc', true: BRAND.gold }}
                        thumbColor={itemTrackStock ? BRAND.burgundy : '#f4f3f4'}
                      />
                    </View>

                    {itemTrackStock && (
                      <View style={{ marginTop: 14 }}>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
                          <View style={{ flex: 1, minWidth: 140 }}>
                            <Text style={styles.inputLabel}>Current In-Stock (Portions)</Text>
                            <TextInput 
                              style={styles.modalInput} 
                              placeholder="e.g. 25" 
                              placeholderTextColor="#8E8E93"
                              keyboardType="numeric" 
                              value={itemStockQty} 
                              onChangeText={setItemStockQty} 
                            />
                            {/* Quick +10, +25, +50 pills */}
                            <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                              {[10, 25, 50].map(addVal => (
                                <TouchableOpacity 
                                  key={addVal}
                                  style={styles.quickAddStockPill}
                                  onPress={() => {
                                    const current = parseInt(itemStockQty, 10) || 0;
                                    setItemStockQty((current + addVal).toString());
                                  }}
                                >
                                  <Text style={styles.quickAddStockPillText}>+{addVal}</Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                          </View>

                          <View style={{ flex: 1, minWidth: 140 }}>
                            <Text style={styles.inputLabel}>Low Stock Alert Threshold</Text>
                            <TextInput 
                              style={styles.modalInput} 
                              placeholder="e.g. 5" 
                              placeholderTextColor="#8E8E93"
                              keyboardType="numeric" 
                              value={itemLowStockThreshold} 
                              onChangeText={setItemLowStockThreshold} 
                            />
                          </View>
                        </View>
                      </View>
                    )}
                  </View>

                  {/* Multi-variants */}
                  <View style={{ marginTop: 24 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <Text style={styles.inputLabel}>Portion Variants (e.g. Small / Large / 1 KG)</Text>
                      <TouchableOpacity 
                        style={styles.addOptionBtn}
                        onPress={() => setItemVariants([...itemVariants, { name: '', price: '' }])}
                      >
                        <Text style={styles.addOptionBtnText}>+ Add Variant</Text>
                      </TouchableOpacity>
                    </View>
                    
                    {itemVariants.map((variant, idx) => (
                      <View key={idx} style={{ flexDirection: 'row', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                        <TextInput
                          style={[styles.modalInput, { flex: 2, marginBottom: 0 }]}
                          placeholder="Variant (e.g. Small / 10 inch)"
                          placeholderTextColor="#8E8E93"
                          value={variant.name}
                          onChangeText={(val) => {
                            const newVars = [...itemVariants];
                            newVars[idx].name = val;
                            setItemVariants(newVars);
                          }}
                        />
                        <TextInput
                          style={[styles.modalInput, { flex: 1, marginBottom: 0 }]}
                          placeholder="Price"
                          placeholderTextColor="#8E8E93"
                          keyboardType="numeric"
                          value={variant.price}
                          onChangeText={(val) => {
                            const newVars = [...itemVariants];
                            newVars[idx].price = val;
                            setItemVariants(newVars);
                          }}
                        />
                        <TouchableOpacity 
                          style={{ padding: 8 }}
                          onPress={() => {
                            const newVars = [...itemVariants];
                            newVars.splice(idx, 1);
                            setItemVariants(newVars);
                          }}
                        >
                          <Ionicons name="trash" size={20} color={BRAND.danger} />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* TAB 4: COMBO & DEAL BUILDER (OPTION 5) */}
              {modalTab === 'combo' && (
                <View style={styles.modalTabPane}>
                  <View style={styles.dealToggleRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.dealToggleTitle}>This is a Combo / Deal Package</Text>
                      <Text style={styles.dealToggleSubtitle}>
                        Bundle multiple menu dishes together into a discounted package
                      </Text>
                    </View>
                    <Switch
                      value={itemIsDeal}
                      onValueChange={(val) => {
                        setItemIsDeal(val);
                        if (val && itemCategory !== 'Deals') {
                          setItemCategory('Deals');
                          if (!itemBadge) setItemBadge('Family Deal');
                        }
                      }}
                      trackColor={{ false: '#ccc', true: BRAND.purple }}
                      thumbColor={itemIsDeal ? BRAND.gold : '#f4f3f4'}
                    />
                  </View>

                  {itemIsDeal ? (
                    <View style={{ marginTop: 16 }}>
                      {/* Included Items Summary */}
                      <Text style={styles.sectionHeading}>Items Included in this Deal</Text>
                      {itemDealItems.length === 0 ? (
                        <View style={styles.emptyComboWrap}>
                          <Ionicons name="gift-outline" size={32} color={BRAND.muted} />
                          <Text style={{ color: BRAND.muted, fontSize: 13, marginTop: 4 }}>
                            No dishes added yet. Pick from the menu below!
                          </Text>
                        </View>
                      ) : (
                        <View style={styles.comboItemsList}>
                          {itemDealItems.map((dItem, idx) => (
                            <View key={idx} style={styles.comboItemRow}>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.comboItemName}>{dItem.name}</Text>
                                <Text style={styles.comboItemPrice}>
                                  {money(dItem.price || 0)} each • Total: {money((dItem.price || 0) * dItem.qty)}
                                </Text>
                              </View>
                              
                              <View style={styles.qtyControlRow}>
                                <TouchableOpacity 
                                  style={styles.qtyBtn}
                                  onPress={() => updateDishDealQty(idx, dItem.qty - 1)}
                                >
                                  <Ionicons name="remove" size={14} color={BRAND.ink} />
                                </TouchableOpacity>
                                <Text style={styles.qtyText}>{dItem.qty}</Text>
                                <TouchableOpacity 
                                  style={styles.qtyBtn}
                                  onPress={() => updateDishDealQty(idx, dItem.qty + 1)}
                                >
                                  <Ionicons name="add" size={14} color={BRAND.ink} />
                                </TouchableOpacity>
                              </View>

                              <TouchableOpacity 
                                style={{ padding: 6, marginLeft: 6 }}
                                onPress={() => removeDishFromDeal(idx)}
                              >
                                <Ionicons name="trash-outline" size={18} color={BRAND.danger} />
                              </TouchableOpacity>
                            </View>
                          ))}
                        </View>
                      )}

                      {/* Original Value & Discount calculation */}
                      {Boolean(itemDealOriginalPrice && parseFloat(itemDealOriginalPrice) > 0) ? (
                        <View style={styles.dealCalculationCard}>
                          <View style={styles.dealCalculationRow}>
                            <Text style={styles.dealCalcLabel}>Sum of Individual Dishes:</Text>
                            <Text style={styles.dealCalcValueStrike}>{money(parseFloat(itemDealOriginalPrice))}</Text>
                          </View>
                          <View style={styles.dealCalculationRow}>
                            <Text style={styles.dealCalcLabel}>Special Combo Deal Price:</Text>
                            <Text style={styles.dealCalcValueHighlight}>
                              {itemPrice ? money(parseFloat(itemPrice)) : 'Set in Step 3'}
                            </Text>
                          </View>
                          {Boolean(itemPrice && parseFloat(itemPrice) < parseFloat(itemDealOriginalPrice)) ? (
                            <View style={styles.dealSavingsBanner}>
                              <Ionicons name="sparkles" size={16} color={BRAND.purple} />
                              <Text style={styles.dealSavingsText}>
                                Customer Saves {money(parseFloat(itemDealOriginalPrice) - parseFloat(itemPrice))} ({Math.round(((parseFloat(itemDealOriginalPrice) - parseFloat(itemPrice)) / parseFloat(itemDealOriginalPrice)) * 100)}% Discount)
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      ) : null}

                      {/* Pick Dish to Add */}
                      <Text style={[styles.inputLabel, { marginTop: 20 }]}>+ Tap Any Menu Dish to Add into Deal:</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.menuPickerScroll}>
                        {menuItems.filter(m => !m.isDeal).map(menuIt => (
                          <TouchableOpacity 
                            key={menuIt.id}
                            style={styles.menuPickCard}
                            onPress={() => addDishToDeal(menuIt)}
                          >
                            <Text style={styles.menuPickName} numberOfLines={1}>{menuIt.name}</Text>
                            <Text style={styles.menuPickPrice}>{money(menuIt.price)}</Text>
                            <Text style={styles.menuPickAdd}>+ Add</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  ) : (
                    <View style={{ padding: 20, alignItems: 'center' }}>
                      <Text style={{ color: BRAND.muted, textAlign: 'center', lineHeight: 20 }}>
                        Enable the switch above if this item represents a Combo Deal or Family Feast package.
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </ScrollView>
            
            {/* Modal Actions */}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setItemModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveItem}>
                <Ionicons name="checkmark-circle-outline" size={18} color="#4a121a" style={{ marginRight: 6 }} />
                <Text style={styles.saveBtnText}>{editingItem ? 'Update Dish' : 'Save Dish'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ============================================================== */}
      {/* QUICK STOCK ADJUSTMENT MODAL (OPTION 4)                         */}
      {/* ============================================================== */}
      <Modal visible={Boolean(stockAdjustItem)} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxWidth: 450 }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Quick Restock / Stock Adjustment</Text>
                <Text style={styles.modalSub}>{stockAdjustItem?.name}</Text>
              </View>
              <TouchableOpacity onPress={() => setStockAdjustItem(null)}>
                <Ionicons name="close" size={24} color={BRAND.muted} />
              </TouchableOpacity>
            </View>

            <View style={{ marginVertical: 16 }}>
              <Text style={styles.inputLabel}>Current Stock: {stockAdjustItem?.stockQty || 0} portions</Text>
              
              <View style={{ flexDirection: 'row', gap: 10, marginVertical: 10 }}>
                <TouchableOpacity 
                  style={[styles.stockModeBtn, stockMode === 'add' && styles.stockModeBtnActive]}
                  onPress={() => setStockMode('add')}
                >
                  <Text style={[styles.stockModeBtnText, stockMode === 'add' && styles.stockModeBtnTextActive]}>
                    + Add to Stock
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[styles.stockModeBtn, stockMode === 'set' && styles.stockModeBtnActive]}
                  onPress={() => setStockMode('set')}
                >
                  <Text style={[styles.stockModeBtnText, stockMode === 'set' && styles.stockModeBtnTextActive]}>
                    Set Exact Quantity
                  </Text>
                </TouchableOpacity>
              </View>

              <TextInput 
                style={styles.modalInput} 
                placeholder={stockMode === 'add' ? 'e.g. 20 (to add 20 portions)' : 'e.g. 50'} 
                placeholderTextColor="#8E8E93"
                keyboardType="numeric" 
                value={stockDeltaInput} 
                onChangeText={setStockDeltaInput} 
                autoFocus
              />

              {stockMode === 'add' && (
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                  {[5, 10, 20, 50].map(num => (
                    <TouchableOpacity 
                      key={num}
                      style={styles.quickAddStockPill}
                      onPress={() => setStockDeltaInput(num.toString())}
                    >
                      <Text style={styles.quickAddStockPillText}>+{num}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setStockAdjustItem(null)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleApplyStockAdjust}>
                <Text style={styles.saveBtnText}>Apply Stock</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Category Modal */}
      <Modal visible={isCatModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, isMobile && styles.modalContentMobile, { maxWidth: 450 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add New Category</Text>
              <TouchableOpacity onPress={() => setCatModalVisible(false)}>
                <Ionicons name="close" size={24} color="#8E8E93" />
              </TouchableOpacity>
            </View>
            
            <Text style={styles.inputLabel}>Category Name</Text>
            <TextInput 
              style={styles.modalInput} 
              placeholder="e.g. Seafood, Platters, Soups, Platters" 
              placeholderTextColor="#8E8E93"
              value={newCatName} 
              onChangeText={setNewCatName} 
            />
            
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setCatModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleAddCategory}>
                <Text style={styles.saveBtnText}>Save Category</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add / Edit Region Modal */}
      <Modal visible={isRegionModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, isMobile && styles.modalContentMobile, { maxWidth: 500 }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>
                  {editingRegion ? 'Edit Region / Cuisine' : 'Add New Region / Cuisine'}
                </Text>
                <Text style={styles.modalSub}>
                  {editingRegion 
                    ? `Updating "${editingRegion}" will automatically update all dishes assigned to it.` 
                    : 'Add culinary regions like Pakistani, Chinese, Continental, Arabic, etc.'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setRegionModalVisible(false)}>
                <Ionicons name="close" size={24} color="#8E8E93" />
              </TouchableOpacity>
            </View>
            
            <Text style={styles.inputLabel}>Region / Cuisine Name *</Text>
            <TextInput 
              style={styles.modalInput} 
              placeholder="e.g. Chinese, Continental, Turkish, Arabic, Pakistani..." 
              placeholderTextColor="#8E8E93"
              value={regionNameInput} 
              onChangeText={setRegionNameInput} 
              autoFocus
            />

            {/* Quick Presets / Suggestions */}
            <Text style={[styles.inputLabel, { marginTop: 12, marginBottom: 6 }]}>
              Popular Regional Cuisines:
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
              {['Pakistani', 'Chinese', 'Continental', 'Arabic', 'Turkish', 'Italian', 'Fast Food', 'Mexican', 'Thai'].map(preset => (
                <TouchableOpacity
                  key={preset}
                  style={{
                    backgroundColor: regionNameInput === preset ? '#EFF6FF' : '#F1F5F9',
                    borderWidth: 1,
                    borderColor: regionNameInput === preset ? '#3B82F6' : '#CBD5E1',
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderRadius: 8,
                  }}
                  onPress={() => setRegionNameInput(preset)}
                >
                  <Text style={{
                    fontSize: 12,
                    fontWeight: '700',
                    color: regionNameInput === preset ? '#1D4ED8' : '#334155',
                  }}>
                    {preset}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setRegionModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveRegion}>
                <Text style={styles.saveBtnText}>
                  {editingRegion ? 'Update Region' : 'Save Region'}
                </Text>
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
    padding: 24,
    backgroundColor: '#F8F9FA',
  },
  containerMobile: {
    padding: 14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 12,
  },
  titleWrap: {
    flexShrink: 1,
  },
  pageTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: BRAND.ink,
    letterSpacing: -0.5,
  },
  pageTitleMobile: {
    fontSize: 20,
  },
  pageSubtitle: {
    fontSize: 13,
    color: BRAND.muted,
    marginTop: 2,
    fontWeight: '500',
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
  },
  addButton: {
    backgroundColor: BRAND.gold,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    shadowColor: BRAND.gold,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  addButtonText: {
    color: '#4a121a',
    fontWeight: '800',
    fontSize: 13,
  },
  kpiContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 18,
    flexWrap: 'wrap',
  },
  kpiCard: {
    width: '23%',
    flexGrow: 1,
    minWidth: 150,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#EFEFEF',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3 },
      android: { elevation: 1 },
      web: { boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }
    })
  },
  kpiIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiVal: {
    fontSize: 18,
    fontWeight: '800',
    color: BRAND.ink,
  },
  kpiLabel: {
    fontSize: 11,
    color: BRAND.muted,
    fontWeight: '600',
    marginTop: 1,
  },
  tabsContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: BRAND.burgundy,
  },
  tabText: {
    fontSize: 14,
    color: BRAND.muted,
    fontWeight: '600',
  },
  tabTextActive: {
    color: BRAND.burgundy,
    fontWeight: '800',
  },
  filterSection: {
    marginBottom: 16,
    gap: 10,
    zIndex: 1000,
    position: 'relative',
  },
  dropdownBackdrop: {
    position: 'absolute',
    top: -1000,
    left: -1000,
    right: -1000,
    bottom: -5000,
    zIndex: 990,
    backgroundColor: 'transparent',
    ...Platform.select({
      web: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 990,
      } as any,
    }),
  },
  filterBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
    zIndex: 995,
  },
  filterBarRowMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 10,
  },
  dropdownsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    zIndex: 995,
  },
  dropdownsRowMobile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    flexWrap: 'wrap',
  },
  dropdownAnchor: {
    position: 'relative',
    zIndex: 998,
  },
  filterDropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 7,
    minHeight: 46,
    minWidth: 165,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    gap: 10,
    ...Platform.select({
      web: {
        cursor: 'pointer',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
        transition: 'all 0.18s ease',
      } as any,
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  filterDropdownTriggerActive: {
    borderColor: 'rgba(212, 175, 55, 0.7)',
    backgroundColor: '#FFFDF7',
    ...Platform.select({
      web: {
        boxShadow: '0 4px 14px rgba(212, 175, 55, 0.18)',
      } as any,
    }),
  },
  filterDropdownTriggerOpen: {
    borderColor: BRAND.burgundy,
  },
  filterTriggerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  filterIconCircle: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterDropdownLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  filterDropdownValue: {
    fontSize: 12.5,
    fontWeight: '700',
    color: BRAND.ink,
    maxWidth: 110,
  },
  filterDropdownValueActive: {
    color: BRAND.burgundy,
  },
  filterTriggerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  filterCountBadge: {
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  filterCountBadgeActive: {
    backgroundColor: 'rgba(82, 20, 28, 0.08)',
  },
  filterCountText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#6B7280',
  },
  filterCountTextActive: {
    color: BRAND.burgundy,
  },
  dropdownMenuCard: {
    position: 'absolute',
    top: 52,
    left: 0,
    minWidth: 230,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(212, 175, 55, 0.35)',
    paddingVertical: 6,
    zIndex: 9999,
    ...Platform.select({
      web: {
        boxShadow: '0 12px 32px rgba(82, 20, 28, 0.14), 0 4px 12px rgba(0, 0, 0, 0.08)',
      } as any,
      ios: {
        shadowColor: '#52141C',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.16,
        shadowRadius: 16,
      },
      android: {
        elevation: 16,
      },
    }),
  },
  dropdownMenuHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    marginBottom: 4,
  },
  dropdownMenuTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  dropdownMenuSubtitle: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  dropdownMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 9,
    gap: 8,
    ...Platform.select({
      web: {
        cursor: 'pointer',
        transition: 'background-color 0.12s ease',
      } as any,
    }),
  },
  dropdownMenuItemActive: {
    backgroundColor: 'rgba(82, 20, 28, 0.06)',
  },
  dropdownItemIndicator: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  dropdownMenuItemText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  dropdownMenuItemTextActive: {
    color: BRAND.burgundy,
    fontWeight: '800',
  },
  menuItemCountPill: {
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  menuItemCountPillActive: {
    backgroundColor: 'rgba(82, 20, 28, 0.12)',
  },
  menuItemCountText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
  },
  menuItemCountTextActive: {
    color: BRAND.burgundy,
  },
  clearFiltersBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 5,
    height: 46,
    ...Platform.select({
      web: {
        cursor: 'pointer',
      } as any,
    }),
  },
  clearFiltersText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#B91C1C',
  },
  activeFiltersStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingTop: 4,
    flexWrap: 'wrap',
    gap: 8,
  },
  resultCountWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  resultCountText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#6B7280',
  },
  activeChipsList: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  activeFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FDF2F4',
    borderWidth: 1,
    borderColor: 'rgba(82, 20, 28, 0.2)',
    borderRadius: 16,
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    gap: 5,
  },
  activeFilterChipText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: BRAND.burgundy,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: 8,
    paddingRight: 10,
    height: 46,
    borderWidth: 1.5,
    borderColor: 'rgba(212, 175, 55, 0.45)',
    gap: 8,
    ...Platform.select({
      web: {
        boxShadow: '0 4px 18px rgba(82, 20, 28, 0.06), 0 2px 6px rgba(212, 175, 55, 0.12), inset 0 1px 0 #FFFFFF',
        transition: 'all 0.2s ease',
      } as any,
      ios: {
        shadowColor: '#52141C',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  searchIconOrb: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(82, 20, 28, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchInput: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: '600',
    color: BRAND.ink,
    ...Platform.select({
      web: {
        outlineStyle: 'none',
        outlineWidth: 0,
      } as any,
    }),
  },
  searchClearBtn: {
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchShortcutBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(254, 243, 199, 0.85)',
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.4)',
  },
  searchShortcutText: {
    color: '#92400E',
    fontSize: 9.5,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  categoryPillsScroll: {
    gap: 8,
    paddingVertical: 2,
  },
  categoryPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  categoryPillActive: {
    backgroundColor: BRAND.burgundy,
    borderColor: BRAND.burgundy,
  },
  categoryPillText: {
    fontSize: 13,
    color: BRAND.muted,
    fontWeight: '600',
  },
  categoryPillTextActive: {
    color: BRAND.gold,
    fontWeight: '700',
  },
  content: {
    flex: 1,
  },
  contentMobile: {
    paddingBottom: 20,
  },
  listContainer: {
    flex: 1,
  },
  emptyWrap: {
    padding: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: BRAND.ink,
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 13,
    color: BRAND.muted,
    marginTop: 4,
  },
  mobileCardsList: {
    gap: 12,
  },
  itemCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#EFEFEF',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 5 },
      android: { elevation: 2 },
      web: { boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }
    })
  },
  itemCardMain: {
    flexDirection: 'row',
    gap: 12,
  },
  itemThumbImage: {
    width: 68,
    height: 68,
    borderRadius: 10,
  },
  itemIconBadge: {
    width: 68,
    height: 68,
    borderRadius: 10,
    backgroundColor: '#FFF9F0',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#F3E5C8',
  },
  itemInfo: {
    flex: 1,
  },
  itemHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  itemCardName: {
    fontSize: 16,
    fontWeight: '700',
    color: BRAND.ink,
    flex: 1,
  },
  badgeTag: {
    backgroundColor: BRAND.goldSoft,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  dealBadgeTag: {
    backgroundColor: BRAND.purpleSoft,
  },
  badgeTagText: {
    color: '#8c6b1b',
    fontSize: 11,
    fontWeight: '700',
  },
  dealBadgeTagText: {
    color: BRAND.purple,
  },
  badgeTagSmall: {
    backgroundColor: BRAND.goldSoft,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeTagSmallText: {
    color: '#8c6b1b',
    fontSize: 10,
    fontWeight: '700',
  },
  catBadge: {
    backgroundColor: '#F2F2F7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  catBadgeText: {
    fontSize: 11,
    color: BRAND.ink,
    fontWeight: '600',
  },
  regionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  regionBadgeText: {
    fontSize: 10.5,
    color: '#1E40AF',
    fontWeight: '700',
  },
  regionFilterLeadBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 16,
    marginRight: 4,
  },
  regionFilterLeadText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1E40AF',
  },
  regionPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  regionPillActive: {
    backgroundColor: '#1E40AF',
    borderColor: '#1E40AF',
  },
  regionPillText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },
  regionPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  stationText: {
    fontSize: 11,
    color: BRAND.muted,
  },
  stationTextSmall: {
    fontSize: 11,
    color: BRAND.muted,
    marginTop: 2,
  },
  comboPreviewWrap: {
    backgroundColor: '#FAF5FF',
    padding: 6,
    borderRadius: 6,
    marginVertical: 4,
  },
  comboPreviewTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: BRAND.purple,
    textTransform: 'uppercase',
  },
  comboPreviewText: {
    fontSize: 11,
    color: '#553C9A',
    marginTop: 1,
  },
  itemPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  itemCardPrice: {
    fontSize: 16,
    fontWeight: '800',
    color: BRAND.burgundy,
  },
  originalPriceText: {
    fontSize: 11,
    color: BRAND.purple,
    fontWeight: '700',
  },
  marginPill: {
    backgroundColor: BRAND.successSoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  marginPillText: {
    color: BRAND.success,
    fontSize: 11,
    fontWeight: '700',
  },
  stockPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 4,
    gap: 4,
  },
  stockPillIn: {
    backgroundColor: BRAND.successSoft,
  },
  stockPillLow: {
    backgroundColor: BRAND.warnSoft,
  },
  stockPillOut: {
    backgroundColor: BRAND.dangerSoft,
  },
  stockPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  stockTextIn: { color: BRAND.success },
  stockTextLow: { color: BRAND.warn },
  stockTextOut: { color: BRAND.danger },
  untrackedStockText: {
    fontSize: 11,
    color: BRAND.muted,
    marginTop: 4,
  },
  itemCardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F2F2F7',
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: BRAND.burgundySoft,
  },
  editBtnText: {
    color: BRAND.burgundy,
    fontSize: 13,
    fontWeight: '700',
  },
  restockQuickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: BRAND.successSoft,
  },
  restockQuickBtnText: {
    color: BRAND.success,
    fontSize: 12,
    fontWeight: '700',
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: BRAND.dangerSoft,
  },
  deleteBtnText: {
    color: BRAND.danger,
    fontSize: 13,
    fontWeight: '700',
  },
  table: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#EFEFEF',
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#F8F9FA',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  tableHeaderCell: {
    fontWeight: '700',
    color: BRAND.muted,
    fontSize: 12,
    textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  tableCell: {
    flex: 1,
  },
  tableThumbImage: {
    width: 44,
    height: 44,
    borderRadius: 8,
    marginRight: 10,
  },
  tableThumbPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#FFF9F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#F3E5C8',
  },
  tableItemName: {
    fontWeight: '700',
    fontSize: 15,
    color: BRAND.ink,
  },
  comboIncludedMini: {
    fontSize: 11,
    color: BRAND.purple,
    marginTop: 2,
    fontWeight: '500',
  },
  tablePriceText: {
    fontWeight: '800',
    color: BRAND.burgundy,
    fontSize: 14,
  },
  tableCostText: {
    fontSize: 11,
    color: BRAND.muted,
    marginTop: 2,
  },
  tableCostTextNone: {
    fontSize: 11,
    color: '#ccc',
    marginTop: 2,
  },
  marginBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  marginHigh: { backgroundColor: BRAND.successSoft },
  marginMid: { backgroundColor: BRAND.warnSoft },
  marginLow: { backgroundColor: BRAND.dangerSoft },
  marginBadgeText: { fontSize: 11, fontWeight: '800' },
  marginHighText: { color: BRAND.success },
  marginMidText: { color: BRAND.warn },
  marginLowText: { color: BRAND.danger },
  marginProfitSub: {
    fontSize: 10,
    color: BRAND.muted,
    marginTop: 2,
  },
  quickAddStockMini: {
    backgroundColor: '#F2F2F7',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  quickAddStockMiniText: {
    fontSize: 11,
    fontWeight: '700',
    color: BRAND.ink,
  },
  desktopActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: BRAND.burgundySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#EFEFEF',
  },
  categoryCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  categoryIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: BRAND.burgundySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: BRAND.ink,
  },
  categoryCardCount: {
    fontSize: 12,
    color: BRAND.muted,
    marginTop: 2,
  },
  deleteCategoryBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: BRAND.dangerSoft,
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    width: '100%',
    maxWidth: 680,
    maxHeight: '90%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 10 },
      android: { elevation: 5 },
      web: { boxShadow: '0 8px 30px rgba(0,0,0,0.15)' }
    })
  },
  modalContentMobile: {
    padding: 16,
    maxHeight: '95%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: BRAND.ink,
  },
  modalSub: {
    fontSize: 12,
    color: BRAND.muted,
    marginTop: 2,
  },
  modalTabsBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    marginBottom: 16,
    gap: 6,
    flexWrap: 'wrap',
  },
  modalSubTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    gap: 4,
  },
  modalSubTabActive: {
    backgroundColor: BRAND.burgundySoft,
  },
  modalSubTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: BRAND.muted,
  },
  modalSubTabTextActive: {
    color: BRAND.burgundy,
    fontWeight: '800',
  },
  modalBodyScroll: {
    maxHeight: 440,
  },
  modalTabPane: {
    paddingBottom: 10,
  },
  sectionHeading: {
    fontSize: 15,
    fontWeight: '800',
    color: BRAND.ink,
    marginBottom: 4,
  },
  sectionDesc: {
    fontSize: 12,
    color: BRAND.muted,
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: BRAND.ink,
    marginBottom: 6,
  },
  modalInput: {
    backgroundColor: '#FAFAFA',
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: BRAND.ink,
    marginBottom: 12,
  },
  dropdownBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FAFAFA',
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 12,
  },
  dropdownBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: BRAND.ink,
  },
  dropdownList: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 10,
    marginTop: -8,
    marginBottom: 12,
    overflow: 'hidden',
  },
  dropdownItem: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
  },
  dropdownItemActive: {
    backgroundColor: BRAND.goldSoft,
  },
  dropdownItemText: {
    fontSize: 14,
    color: BRAND.ink,
  },
  dropdownItemTextActive: {
    fontWeight: '700',
    color: '#8c6b1b',
  },
  quickAddCatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(212, 175, 55, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.35)',
  },
  quickAddCatBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: BRAND.burgundy,
  },
  dropdownAddNewCatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    backgroundColor: '#FAF5EA',
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
  },
  dropdownAddNewCatBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: BRAND.burgundy,
  },
  inlineAddCatBox: {
    backgroundColor: '#FFFBF2',
    borderWidth: 1.5,
    borderColor: BRAND.gold,
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  inlineAddCatInput: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D4AF37',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: BRAND.ink,
  },
  inlineAddCatSaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: BRAND.burgundy,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
  },
  inlineAddCatSaveBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  inlineAddCatHint: {
    fontSize: 11,
    color: '#854D0E',
    marginTop: 6,
    fontWeight: '600',
  },
  stationSelectBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 10,
    backgroundColor: '#FAFAFA',
  },
  stationSelectBtnActive: {
    borderColor: BRAND.burgundy,
    backgroundColor: BRAND.burgundySoft,
  },
  stationSelectText: {
    fontSize: 13,
    fontWeight: '600',
    color: BRAND.muted,
  },
  stationSelectTextActive: {
    color: BRAND.burgundy,
    fontWeight: '800',
  },
  badgePillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  badgeOptionPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: '#FAFAFA',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  badgeOptionPillActive: {
    backgroundColor: BRAND.goldSoft,
    borderColor: BRAND.gold,
  },
  badgeOptionPillText: {
    fontSize: 12,
    color: BRAND.muted,
    fontWeight: '600',
  },
  badgeOptionPillTextActive: {
    color: '#8c6b1b',
    fontWeight: '800',
  },
  uploadActionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  uploadButton: {
    flex: 1,
    minWidth: 200,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BRAND.burgundySoft,
    borderWidth: 1.5,
    borderColor: '#D4AF37',
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  cameraButton: {
    flex: 1,
    minWidth: 200,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFDF9',
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  uploadButtonDisabled: {
    opacity: 0.6,
  },
  uploadIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 },
      android: { elevation: 1 },
      web: { boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }
    })
  },
  uploadButtonTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: BRAND.ink,
  },
  uploadButtonSub: {
    fontSize: 11,
    color: BRAND.muted,
    marginTop: 1,
  },
  previewImageWrap: {
    position: 'relative',
  },
  previewActiveBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    right: 4,
    backgroundColor: 'rgba(46, 125, 50, 0.85)',
    borderRadius: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
    gap: 2,
  },
  previewActiveBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
  },
  imagePreviewContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    padding: 12,
    borderRadius: 12,
    marginBottom: 14,
  },
  imagePreview: {
    width: 90,
    height: 90,
    borderRadius: 12,
  },
  imagePlaceholder: {
    width: 90,
    height: 90,
    borderRadius: 12,
    backgroundColor: '#EFEFEF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearImageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  presetCard: {
    width: '31%',
    minWidth: 100,
    flexGrow: 1,
    height: 80,
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  presetCardActive: {
    borderColor: BRAND.gold,
  },
  presetImage: {
    width: '100%',
    height: '100%',
  },
  presetOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 4,
  },
  presetName: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  presetPrice: {
    color: BRAND.gold,
    fontSize: 9,
    fontWeight: '800',
  },
  presetSelectedBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 2,
    zIndex: 4,
  },
  marginAnalysisBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  marginAnalysisBannerGreen: {
    backgroundColor: BRAND.successSoft,
  },
  marginAnalysisBannerYellow: {
    backgroundColor: BRAND.warnSoft,
  },
  marginAnalysisBannerRed: {
    backgroundColor: BRAND.dangerSoft,
  },
  marginAnalysisTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: BRAND.ink,
  },
  marginAnalysisDesc: {
    fontSize: 12,
    color: BRAND.text,
    marginTop: 2,
  },
  stockTrackingSection: {
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    marginTop: 8,
  },
  stockToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stockToggleTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: BRAND.ink,
  },
  stockToggleSubtitle: {
    fontSize: 11,
    color: BRAND.muted,
    marginTop: 2,
  },
  quickAddStockPill: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E5EA',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  quickAddStockPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: BRAND.ink,
  },
  addOptionBtn: {
    backgroundColor: BRAND.goldSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  addOptionBtnText: {
    color: '#8c6b1b',
    fontWeight: '700',
    fontSize: 12,
  },
  dealToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FAF5FF',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E9D8FD',
  },
  dealToggleTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: BRAND.purple,
  },
  dealToggleSubtitle: {
    fontSize: 11,
    color: '#6B46C1',
    marginTop: 2,
  },
  emptyComboWrap: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FAFAFA',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  comboItemsList: {
    gap: 8,
    marginVertical: 10,
  },
  comboItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 10,
    padding: 10,
  },
  comboItemName: {
    fontSize: 14,
    fontWeight: '700',
    color: BRAND.ink,
  },
  comboItemPrice: {
    fontSize: 12,
    color: BRAND.muted,
    marginTop: 2,
  },
  qtyControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
    borderRadius: 6,
    padding: 2,
  },
  qtyBtn: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyText: {
    paddingHorizontal: 8,
    fontWeight: '800',
    fontSize: 13,
    color: BRAND.ink,
  },
  dealCalculationCard: {
    backgroundColor: '#FAF5FF',
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#E9D8FD',
  },
  dealCalculationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 2,
  },
  dealCalcLabel: {
    fontSize: 13,
    color: '#6B46C1',
    fontWeight: '600',
  },
  dealCalcValueStrike: {
    fontSize: 13,
    color: BRAND.muted,
    textDecorationLine: 'line-through',
  },
  dealCalcValueHighlight: {
    fontSize: 15,
    fontWeight: '800',
    color: BRAND.purple,
  },
  dealSavingsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EDE9FE',
    padding: 8,
    borderRadius: 6,
    marginTop: 8,
  },
  dealSavingsText: {
    fontSize: 12,
    fontWeight: '800',
    color: BRAND.purple,
  },
  menuPickerScroll: {
    paddingVertical: 8,
    gap: 8,
  },
  menuPickCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 8,
    padding: 10,
    minWidth: 120,
  },
  menuPickName: {
    fontSize: 12,
    fontWeight: '700',
    color: BRAND.ink,
  },
  menuPickPrice: {
    fontSize: 12,
    fontWeight: '800',
    color: BRAND.burgundy,
    marginTop: 2,
  },
  menuPickAdd: {
    fontSize: 11,
    fontWeight: '800',
    color: BRAND.purple,
    marginTop: 4,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#F2F2F7',
  },
  cancelBtnText: {
    fontWeight: '700',
    color: BRAND.muted,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: BRAND.gold,
  },
  saveBtnText: {
    fontWeight: '800',
    color: '#4a121a',
  },
  stockModeBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#F2F2F7',
  },
  stockModeBtnActive: {
    backgroundColor: BRAND.burgundy,
  },
  stockModeBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: BRAND.muted,
  },
  stockModeBtnTextActive: {
    color: '#fff',
  },
});
