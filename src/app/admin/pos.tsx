import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, Alert, Platform, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRestaurantStore, MenuItem, OrderItem, Payment, Customer, Table } from '../../store/restaurantStore';
import InvoiceComponent from '../../components/Invoice';
import { useRouter, useLocalSearchParams } from 'expo-router';

export default function AdminPOS() {
  const router = useRouter();
  const { prefillTableId } = useLocalSearchParams();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const [mobileTab, setMobileTab] = useState<'menu' | 'cart'>('menu');
  
  const menuItems = useRestaurantStore(state => state.menuItems);
  const categories = useRestaurantStore(state => state.categories);
  const customers = useRestaurantStore(state => state.customers);
  const tables = useRestaurantStore(state => state.tables);
  const zones = useRestaurantStore(state => state.zones);
  const addCustomer = useRestaurantStore(state => state.addCustomer);
  const updateCustomer = useRestaurantStore(state => state.updateCustomer);
  const saveInvoice = useRestaurantStore(state => state.saveInvoice);
  const placeOrder = useRestaurantStore(state => state.placeOrder);
  const settleBill = useRestaurantStore(state => state.settleBill);
  const tickets = useRestaurantStore(state => state.tickets);

  // Menu State
  const [activeCategory, setActiveCategory] = useState<string>(categories[0] || '');
  const [searchQuery, setSearchQuery] = useState('');

  // Cart & Order State
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [loadedCart, setLoadedCart] = useState<OrderItem[]>([]);
  const [orderType, setOrderType] = useState<'dine-in' | 'takeaway' | 'delivery'>('dine-in');
  
  // Selection State
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [selectedTableId, setSelectedTableId] = useState<string>('');

  // Modals
  const [customerModalVisible, setCustomerModalVisible] = useState(false);
  const [tableModalVisible, setTableModalVisible] = useState(false);
  const [checkoutModalVisible, setCheckoutModalVisible] = useState(false);
  const [pendingOrdersModalVisible, setPendingOrdersModalVisible] = useState(false);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');

  // New Customer Form
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [isCreatingNewCustomer, setIsCreatingNewCustomer] = useState(false);

  // Payment State
  const [discountAmount, setDiscountAmount] = useState('0');
  const [payments, setPayments] = useState<Payment[]>([{ type: 'cash', amount: 0 }]);

  // Table Modal Filter
  const [tableModalZone, setTableModalZone] = useState('All');

  // Print Preview
  const [generatedInvoice, setGeneratedInvoice] = useState<any>(null);
  const prefilledRef = useRef<string | null>(null);

  const handleTableSelect = (tId: string) => {
    setSelectedTableId(tId);
    setOrderType('dine-in');
    setTableModalVisible(false);
    
    // Find all active tickets or saved table orders for this table to load running order
    const tableTickets = tickets.filter(t => t.tableId === tId);
    const targetTable = tables.find(t => t.id === tId);
    let combinedItems: OrderItem[] = [];

    if (tableTickets.length > 0) {
      tableTickets.forEach(ticket => {
        ticket.items.forEach(ti => {
          const existing = combinedItems.find(i => i.id === ti.id);
          if (existing) {
            existing.qty += ti.qty;
          } else {
            combinedItems.push({ ...ti });
          }
        });
      });
    } else if (targetTable && targetTable.orders && targetTable.orders.length > 0) {
      combinedItems = targetTable.orders.map(o => ({ ...o }));
    }

    if (combinedItems.length > 0) {
      setCart(combinedItems);
      setLoadedCart(JSON.parse(JSON.stringify(combinedItems)));
      if (isMobile) {
        setMobileTab('cart');
      }
    } else {
      setCart([]);
      setLoadedCart([]);
    }
  };

  const handleClearSelectedTable = () => {
    if (!selectedTableId) return;
    const targetTable = tables.find(t => t.id === selectedTableId);
    const confirmMsg = `Are you sure you want to release ${targetTable ? targetTable.name : 'this table'}? Active tickets and running bill will be cleared.`;
    if (Platform.OS === 'web') {
      if (window.confirm(confirmMsg)) {
        settleBill(selectedTableId);
        setCart([]);
        setLoadedCart([]);
        setSelectedTableId('');
      }
    } else {
      Alert.alert('Release Table', confirmMsg, [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Release', 
          style: 'destructive', 
          onPress: () => {
            settleBill(selectedTableId);
            setCart([]);
            setLoadedCart([]);
            setSelectedTableId('');
          } 
        }
      ]);
    }
  };

  useEffect(() => {
    if (prefillTableId && typeof prefillTableId === 'string' && prefilledRef.current !== prefillTableId) {
      prefilledRef.current = prefillTableId;
      setOrderType('dine-in');
      handleTableSelect(prefillTableId);
    }
  }, [prefillTableId]);

  // Computed Items
  const filteredItems = menuItems.filter(item => {
    const matchesCat = item.category === activeCategory || searchQuery.length > 0;
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const subTotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const discountVal = parseFloat(discountAmount) || 0;
  const afterDiscount = Math.max(0, subTotal - discountVal);
  const tax = afterDiscount * 0.16;
  const total = afterDiscount + tax;

  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const remaining = total - totalPaid;

  const selectedCustomerObj = customers.find(c => c.id === selectedCustomerId);
  const selectedTableObj = tables.find(t => t.id === selectedTableId);

  // Handlers
  const handleOrderTypeChange = (type: 'dine-in' | 'takeaway' | 'delivery') => {
    setOrderType(type);
    if (type === 'dine-in') {
      setSelectedCustomerId('');
      setTableModalVisible(true);
    } else {
      setSelectedTableId('');
      setCustomerSearchQuery('');
      setIsCreatingNewCustomer(false);
      setCustomerModalVisible(true);
    }
  };

  const addToCart = (item: MenuItem) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) {
        return prev.map(i => i.id === item.id ? { ...i, qty: i.qty + 1 } : i);
      }
      return [...prev, { id: item.id, name: item.name, price: item.price, qty: 1, completed: false }];
    });
  };

  const updateQty = (id: string, delta: number) => {
    setCart(prev => prev.map(i => {
      if (i.id === id) return { ...i, qty: Math.max(1, i.qty + delta) };
      return i;
    }));
  };

  const removeFromCart = (id: string) => setCart(prev => prev.filter(i => i.id !== id));

  const handleSaveNewCustomer = () => {
    if (!customerName || !customerPhone) {
      if (Platform.OS === 'web') window.alert("Name and Phone required");
      else Alert.alert("Error", "Name and Phone required");
      return;
    }
    const existing = customers.find(c => c.phone === customerPhone);
    if (existing) {
      updateCustomer(existing.id, { name: customerName, address: customerAddress });
      setSelectedCustomerId(existing.id);
    } else {
      // Create new customer logic (we just add it, and since we don't have direct access to generated ID easily, 
      // we can do a trick to find it by phone)
      addCustomer({ name: customerName, phone: customerPhone, address: customerAddress });
      // Wait for re-render to pick it up, for now we will just hide modal and let user select it from search
      if (Platform.OS === 'web') window.alert("Customer added! Please select them from the list.");
    }
    setIsCreatingNewCustomer(false);
  };

  const sendToKitchen = () => {
    if (cart.length === 0) return;
    if (orderType === 'dine-in' && !selectedTableId) {
      if (Platform.OS === 'web') window.alert("Please select a table first.");
      return;
    }
    
    const tId = orderType === 'dine-in' ? selectedTableId : orderType;
    
    // Map items for KOT (calculate delta from loadedCart)
    const kotItems: {item: MenuItem, qty: number}[] = [];
    cart.forEach(cartItem => {
      const loadedItem = loadedCart.find(i => i.id === cartItem.id);
      const loadedQty = loadedItem ? loadedItem.qty : 0;
      if (cartItem.qty > loadedQty) {
        kotItems.push({
          item: menuItems.find(m => m.id === cartItem.id) as MenuItem,
          qty: cartItem.qty - loadedQty
        });
      }
    });

    if (kotItems.length === 0) {
      if (Platform.OS === 'web') window.alert("No new items to send.");
      else Alert.alert("Info", "No new items to send.");
      return;
    }
    
    const isAddOn = loadedCart.length > 0;
    placeOrder(tId, 'Admin POS', kotItems, isAddOn);
    
    // Update loaded cart so subsequent clicks don't resend
    setLoadedCart(JSON.parse(JSON.stringify(cart)));
    
    const alertMsg = isAddOn 
      ? `Add-on items sent to Kitchen! (KOT Generated & Table Updated)` 
      : `Order sent to Kitchen! Table is now OCCUPIED.`;
    if (Platform.OS === 'web') window.alert(alertMsg);
    else Alert.alert("Kitchen Notified", alertMsg);
  };

  const openCheckout = () => {
    if (cart.length === 0) return;
    if (orderType === 'dine-in' && !selectedTableId) {
      if (Platform.OS === 'web') window.alert("Please select a table.");
      return;
    }
    if ((orderType === 'delivery' || orderType === 'takeaway') && !selectedCustomerId) {
      if (Platform.OS === 'web') window.alert("Please select a customer for this order type.");
      return;
    }
    setPayments([{ type: 'cash', amount: total }]);
    setCheckoutModalVisible(true);
  };


  const finalizeOrder = () => {
    if (remaining > 0.01) { // Floating point safety
      if (Platform.OS === 'web') window.alert("Please collect full payment before checking out.");
      else Alert.alert("Incomplete Payment", "Please collect full payment before checking out.");
      return;
    }

    const invoice = {
      id: `INV-${Math.floor(Math.random() * 90000) + 10000}`,
      orderType,
      server: 'Admin POS',
      timePlaced: Date.now(),
      timeSettled: Date.now(),
      customer: selectedCustomerObj,
      tableName: selectedTableObj?.name,
      tableId: selectedTableObj?.id,
      items: cart,
      subTotal,
      discount: discountVal,
      tax,
      total,
      payments: payments.filter(p => p.amount > 0)
    };

    saveInvoice(invoice);
    
    if (orderType === 'dine-in' && selectedTableId) {
      settleBill(selectedTableId);
    }
    
    if (selectedCustomerObj) {
      updateCustomer(selectedCustomerObj.id, {
        totalOrders: selectedCustomerObj.totalOrders + 1,
        totalSpent: selectedCustomerObj.totalSpent + total,
      });
    }

    setCart([]);
    setDiscountAmount('0');
    setCheckoutModalVisible(false);
    setSelectedCustomerId('');
    setSelectedTableId('');
    setGeneratedInvoice(invoice);
  };

  const addPaymentMethod = () => setPayments([...payments, { type: 'cash', amount: 0 }]);
  const updatePayment = (idx: number, field: 'type' | 'amount', value: string) => {
    const newP = [...payments];
    if (field === 'type') {
      newP[idx].type = value as any;
    } else {
      newP[idx].amount = parseFloat(value) || 0;
    }
    setPayments(newP);
  };
  const removePaymentMethod = (idx: number) => {
    if (payments.length > 1) {
      const newP = [...payments];
      newP.splice(idx, 1);
      setPayments(newP);
    }
  };

  return (
    <View style={[styles.container, isMobile && { flexDirection: 'column' }]}>
      {/* Mobile Tab Switcher */}
      {isMobile && (
        <View style={styles.mobileTabBar}>
          <TouchableOpacity
            style={[styles.mobileTabBtn, mobileTab === 'menu' && styles.mobileTabBtnActive]}
            onPress={() => setMobileTab('menu')}
          >
            <Ionicons name="fast-food-outline" size={17} color={mobileTab === 'menu' ? '#fff' : '#666'} />
            <Text style={[styles.mobileTabBtnText, mobileTab === 'menu' && styles.mobileTabBtnTextActive]}>
              Menu ({filteredItems.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.mobileTabBtn, mobileTab === 'cart' && styles.mobileTabBtnActive]}
            onPress={() => setMobileTab('cart')}
          >
            <Ionicons name="cart-outline" size={17} color={mobileTab === 'cart' ? '#fff' : '#666'} />
            <Text style={[styles.mobileTabBtnText, mobileTab === 'cart' && styles.mobileTabBtnTextActive]}>
              Cart ({cart.reduce((s, i) => s + i.qty, 0)})
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Menu Area */}
      {(!isMobile || mobileTab === 'menu') && (
        <View style={[styles.menuArea, isMobile && { flex: 1, padding: 14, paddingBottom: cart.length > 0 ? 80 : 14 }]}>
          <View style={[styles.headerRow, isMobile && { flexDirection: 'column', alignItems: 'stretch', gap: 10 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TouchableOpacity style={{marginRight: 10}} onPress={() => (router.canGoBack() ? router.back() : router.replace('/admin/dashboard'))}>
                  <Ionicons name="chevron-back" size={26} color="#1C1C1E" />
                </TouchableOpacity>
                <Text style={[styles.title, isMobile && { fontSize: 20 }]}>POS Terminal</Text>
              </View>

              <TouchableOpacity 
                style={{flexDirection: 'row', alignItems: 'center', backgroundColor: '#e8f5e9', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, gap: 4}} 
                onPress={() => setPendingOrdersModalVisible(true)}
              >
                <Ionicons name="list" size={18} color="#2e7d32" />
                <Text style={{color: '#2e7d32', fontWeight: 'bold', fontSize: 13}}>Pending ({tickets.length})</Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.searchBox, isMobile && { width: '100%' }]}>
              <Ionicons name="search" size={18} color="#888" />
              <TextInput 
                style={styles.searchInput} 
                placeholder="Search items..." 
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>
          </View>

          {!searchQuery && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll}>
              {categories.map(cat => (
                <TouchableOpacity 
                  key={cat}
                  style={[styles.catBtn, activeCategory === cat && styles.catBtnActive]}
                  onPress={() => setActiveCategory(cat)}
                >
                  <Text style={[styles.catText, activeCategory === cat && styles.catTextActive]}>{cat}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          <ScrollView style={styles.itemsScroll}>
            <View style={styles.itemsGrid}>
              {filteredItems.map(item => (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.itemCard, isMobile && { width: '47%', minWidth: 130 }]}
                  onPress={() => addToCart(item)}
                >
                  <Text style={styles.itemName}>{item.name}</Text>
                  <Text style={styles.itemPrice}>Rs. {item.price}</Text>
                </TouchableOpacity>
              ))}
              {filteredItems.length === 0 && <Text style={{margin: 20}}>No items found.</Text>}
            </View>
          </ScrollView>

          {/* Floating Cart Button on Mobile */}
          {isMobile && cart.length > 0 && (
            <TouchableOpacity style={styles.floatingCartBar} onPress={() => setMobileTab('cart')}>
              <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
                <View style={styles.floatingCartBadge}>
                  <Text style={styles.floatingCartBadgeText}>{cart.reduce((s, i) => s + i.qty, 0)}</Text>
                </View>
                <Text style={styles.floatingCartText}>View Order Cart</Text>
              </View>
              <Text style={styles.floatingCartPrice}>Rs. {total.toFixed(0)}  →</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Cart Area */}
      {(!isMobile || mobileTab === 'cart') && (
        <View style={[styles.cartArea, isMobile && { flex: 1, borderLeftWidth: 0, width: '100%' }]}>
          {isMobile && (
            <TouchableOpacity style={styles.backToMenuBtn} onPress={() => setMobileTab('menu')}>
              <Ionicons name="arrow-back" size={18} color="#4a121a" />
              <Text style={styles.backToMenuText}>Add More Items</Text>
            </TouchableOpacity>
          )}

          {/* Order Type & Meta */}
          <View style={styles.orderOptions}>
            <View style={styles.typeSelector}>
              {['dine-in', 'takeaway', 'delivery'].map(type => (
                <TouchableOpacity 
                  key={type}
                  style={[styles.typeBtn, orderType === type && styles.typeBtnActive]}
                  onPress={() => handleOrderTypeChange(type as any)}
                >
                  <Text style={[styles.typeBtnText, orderType === type && styles.typeBtnTextActive]}>
                    {type.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {orderType === 'dine-in' && (
              <View style={styles.metaSection}>
                {selectedTableObj ? (
                  <View style={styles.selectedMetaTableCard}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={styles.metaName}>Table: {selectedTableObj.name}</Text>
                        <View style={[
                          styles.tableStatusPill, 
                          selectedTableObj.status === 'available' ? styles.statusAvail : styles.statusOcc
                        ]}>
                          <Text style={styles.tableStatusPillText}>
                            {selectedTableObj.status.toUpperCase()}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.metaSub}>
                        {selectedTableObj.zone} • {selectedTableObj.seats} Seats 
                        {selectedTableObj.server ? ` • Server: ${selectedTableObj.server}` : ''}
                      </Text>
                      {(selectedTableObj.status === 'occupied' || selectedTableObj.status === 'billed') && (
                        <Text style={styles.metaRunningBill}>
                          Live Running Bill: Rs. {(selectedTableObj.billTotal || subTotal).toLocaleString()}
                        </Text>
                      )}
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <TouchableOpacity 
                        style={styles.changeTableBtn}
                        onPress={() => setTableModalVisible(true)}
                      >
                        <Ionicons name="swap-horizontal" size={16} color="#4a121a" style={{ marginRight: 4 }} />
                        <Text style={styles.changeTableBtnText}>Change</Text>
                      </TouchableOpacity>
                      {(selectedTableObj.status === 'occupied' || selectedTableObj.status === 'billed') && (
                        <TouchableOpacity 
                          style={styles.resetTableBtn}
                          onPress={handleClearSelectedTable}
                        >
                          <Ionicons name="refresh" size={14} color="#e74c3c" />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.selectMetaBtn} onPress={() => setTableModalVisible(true)}>
                    <Ionicons name="grid-outline" size={16} color="#4a121a" style={{ marginRight: 6 }} />
                    <Text style={styles.selectMetaBtnText}>Select Dining Table</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {(orderType === 'takeaway' || orderType === 'delivery') && (
              <View style={styles.metaSection}>
                {selectedCustomerObj ? (
                  <View style={styles.selectedMeta}>
                    <View>
                      <Text style={styles.metaName}>{selectedCustomerObj.name}</Text>
                      <Text style={styles.metaSub}>{selectedCustomerObj.phone}</Text>
                    </View>
                    <TouchableOpacity onPress={() => setCustomerModalVisible(true)}>
                      <Ionicons name="pencil" size={20} color="#4a121a" />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.selectMetaBtn} onPress={() => setCustomerModalVisible(true)}>
                    <Text style={styles.selectMetaBtnText}>Select Customer</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>

          {/* Cart List */}
          <ScrollView style={styles.cartScroll}>
            {cart.length === 0 ? (
              <Text style={{textAlign: 'center', color: '#888', marginTop: 20}}>Cart is empty</Text>
            ) : (
              cart.map(item => (
                <View key={item.id} style={styles.cartItem}>
                  <View style={styles.cartItemInfo}>
                    <Text style={styles.cartItemName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.cartItemPrice}>Rs. {item.price}</Text>
                  </View>
                  <View style={styles.qtyControls}>
                    <TouchableOpacity style={styles.qtyBtn} onPress={() => updateQty(item.id, -1)}><Text style={styles.qtyBtnText}>-</Text></TouchableOpacity>
                    <Text style={styles.qtyText}>{item.qty}</Text>
                    <TouchableOpacity style={styles.qtyBtn} onPress={() => updateQty(item.id, 1)}><Text style={styles.qtyBtnText}>+</Text></TouchableOpacity>
                    <TouchableOpacity style={styles.deleteBtn} onPress={() => removeFromCart(item.id)}>
                      <Ionicons name="trash-outline" size={16} color="#e74c3c" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </ScrollView>

          <View style={styles.cartFooter}>
            <View style={styles.kotRow}>
               <TouchableOpacity style={[styles.kotBtn, cart.length === 0 && {opacity: 0.5}]} onPress={sendToKitchen} disabled={cart.length===0}>
                 <Ionicons name="flame-outline" size={20} color="#e67e22" />
                 <Text style={styles.kotBtnText}>Hold Order & Send to Kitchen</Text>
               </TouchableOpacity>
            </View>
            
            <View style={styles.discountRow}>
              <Text style={styles.label}>Discount (Rs): </Text>
              <TextInput 
                style={styles.discountInput}
                keyboardType="numeric"
                value={discountAmount}
                onChangeText={setDiscountAmount}
              />
            </View>
            
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Subtotal</Text>
              <Text style={styles.totalsValue}>Rs. {subTotal.toFixed(0)}</Text>
            </View>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Discount</Text>
              <Text style={styles.totalsValue}>- Rs. {discountVal.toFixed(0)}</Text>
            </View>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Tax (16%)</Text>
              <Text style={styles.totalsValue}>Rs. {tax.toFixed(0)}</Text>
            </View>
            <View style={[styles.totalsRow, styles.grandTotalRow]}>
              <Text style={styles.grandTotalLabel}>Total</Text>
              <Text style={styles.grandTotalValue}>Rs. {total.toFixed(0)}</Text>
            </View>
            
            <TouchableOpacity style={[styles.checkoutBtn, cart.length === 0 && {opacity: 0.5}]} onPress={openCheckout} disabled={cart.length === 0}>
              <Text style={styles.checkoutBtnText}>Checkout & Payment</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Customer Modal (Search / Create) */}
      <Modal visible={customerModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
               <Text style={styles.modalTitle}>{isCreatingNewCustomer ? 'New Customer' : 'Select Customer'}</Text>
               <TouchableOpacity onPress={() => setCustomerModalVisible(false)}><Ionicons name="close" size={24}/></TouchableOpacity>
            </View>

            {isCreatingNewCustomer ? (
              <View>
                <TextInput style={styles.input} placeholder="Name" value={customerName} onChangeText={setCustomerName} />
                <TextInput style={styles.input} placeholder="Phone" value={customerPhone} onChangeText={setCustomerPhone} keyboardType="phone-pad" />
                <TextInput style={styles.input} placeholder="Address (Optional)" value={customerAddress} onChangeText={setCustomerAddress} />
                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => setIsCreatingNewCustomer(false)}><Text>Back to Search</Text></TouchableOpacity>
                  <TouchableOpacity style={styles.saveBtn} onPress={handleSaveNewCustomer}><Text style={{color:'#fff'}}>Save</Text></TouchableOpacity>
                </View>
              </View>
            ) : (
              <View>
                <View style={styles.searchBox}>
                  <Ionicons name="search" size={20} color="#888" />
                  <TextInput 
                    style={styles.searchInput} 
                    placeholder="Search phone or name..." 
                    value={customerSearchQuery}
                    onChangeText={setCustomerSearchQuery}
                  />
                </View>
                <ScrollView style={{maxHeight: 300, marginTop: 10}}>
                  {customers
                    .filter(c => c.name.toLowerCase().includes(customerSearchQuery.toLowerCase()) || c.phone.includes(customerSearchQuery))
                    .map(c => (
                    <TouchableOpacity 
                      key={c.id} 
                      style={styles.selectRow}
                      onPress={() => {
                        setSelectedCustomerId(c.id);
                        setCustomerModalVisible(false);
                      }}
                    >
                      <View>
                        <Text style={{fontWeight:'bold'}}>{c.name}</Text>
                        <Text style={{color:'#666'}}>{c.phone}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color="#ccc" />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <TouchableOpacity style={styles.createNewBtn} onPress={() => {
                  setCustomerName(''); setCustomerPhone(''); setCustomerAddress(''); setIsCreatingNewCustomer(true);
                }}>
                  <Text style={styles.createNewBtnText}>+ Create New Customer</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Table Modal */}
      <Modal visible={tableModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxWidth: 540, maxHeight: '85%' }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Select Dining Table</Text>
                <Text style={{ fontSize: 12, color: '#8E8E93', marginTop: 2 }}>
                  Live integration with Table Service & Kitchen Orders
                </Text>
              </View>
              <TouchableOpacity onPress={() => setTableModalVisible(false)}>
                <Ionicons name="close" size={24} color="#1C1C1E" />
              </TouchableOpacity>
            </View>

            {/* Zone Filter in Modal */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 10, flexGrow: 0 }}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {['All', ...zones].map(z => (
                  <TouchableOpacity
                    key={z}
                    style={[styles.modalFilterPill, tableModalZone === z && styles.modalFilterPillActive]}
                    onPress={() => setTableModalZone(z)}
                  >
                    <Text style={[styles.modalFilterText, tableModalZone === z && styles.modalFilterTextActive]}>
                      {z}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              <View style={{ gap: 10 }}>
                {tables
                  .filter(t => tableModalZone === 'All' || t.zone === tableModalZone)
                  .map(t => {
                    const isBusy = t.status === 'occupied' || t.status === 'billed';
                    const isSelected = selectedTableId === t.id;
                    const tableTickets = tickets.filter(tk => tk.tableId === t.id);
                    const statusColor = t.status === 'available' ? '#27ae60' : (t.status === 'occupied' ? '#e74c3c' : '#f39c12');

                    return (
                      <TouchableOpacity 
                        key={t.id} 
                        style={[
                          styles.tableSelectCard,
                          isSelected && styles.tableSelectCardActive,
                          isBusy && styles.tableSelectCardBusy,
                        ]}
                        onPress={() => handleTableSelect(t.id)}
                        activeOpacity={0.8}
                      >
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={styles.tableCardTitle}>{t.name}</Text>
                            <View style={[styles.tableCardStatusBadge, { backgroundColor: statusColor + '18', borderColor: statusColor }]}>
                              <View style={[styles.tableCardStatusDot, { backgroundColor: statusColor }]} />
                              <Text style={[styles.tableCardStatusText, { color: statusColor }]}>
                                {t.status.toUpperCase()}
                              </Text>
                            </View>
                          </View>
                          <Text style={styles.tableCardSubtitle}>
                            Zone: {t.zone} • {t.seats} Seats {t.server ? `• Served by ${t.server}` : ''}
                          </Text>

                          {isBusy ? (
                            <View style={styles.tableCardBillRow}>
                              <Text style={styles.tableCardBillAmount}>
                                Active Bill: Rs. {(t.billTotal || 0).toLocaleString()}
                              </Text>
                              <Text style={styles.tableCardTicketsHint}>
                                • {tableTickets.length} active KOT(s) (Tap to Load & Checkout)
                              </Text>
                            </View>
                          ) : (
                            <Text style={styles.tableCardAvailableHint}>
                              ✓ Ready for seating • Tap to start order
                            </Text>
                          )}
                        </View>
                        <Ionicons 
                          name={isSelected ? "checkmark-circle" : "chevron-forward-circle-outline"} 
                          size={24} 
                          color={isSelected ? "#27ae60" : (isBusy ? "#e74c3c" : "#8E8E93")} 
                        />
                      </TouchableOpacity>
                    );
                  })}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Pending Orders Modal */}
      <Modal visible={pendingOrdersModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
               <Text style={styles.modalTitle}>Pending Orders</Text>
               <TouchableOpacity onPress={() => setPendingOrdersModalVisible(false)}><Ionicons name="close" size={24}/></TouchableOpacity>
            </View>
            <ScrollView style={{maxHeight: 400}}>
              {tickets.length === 0 ? (
                <Text style={{padding: 20, textAlign: 'center', color: '#888'}}>No pending orders.</Text>
              ) : (
                Array.from(new Set(tickets.map(t => t.tableId))).map(tId => {
                  const tableT = tickets.filter(t => t.tableId === tId);
                  const itemsCount = tableT.reduce((sum, t) => sum + t.items.reduce((s, i) => s + i.qty, 0), 0);
                  const isTable = tId !== 'takeaway' && tId !== 'delivery';
                  const tObj = isTable ? tables.find(t => t.id === tId) : null;
                  return (
                    <TouchableOpacity 
                      key={tId} 
                      style={[styles.selectRow]}
                      onPress={() => {
                        setOrderType(isTable ? 'dine-in' : tId as 'takeaway' | 'delivery');
                        handleTableSelect(tId);
                        setPendingOrdersModalVisible(false);
                      }}
                    >
                      <View>
                        <Text style={{fontWeight:'bold'}}>{isTable ? `Table: ${tObj?.name || tId}` : tId.toUpperCase()}</Text>
                        <Text style={{color:'#666'}}>{itemsCount} items pending</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={24} color="#ccc" />
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Checkout / Split Payment Modal */}
      <Modal visible={checkoutModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentLarge}>
            <Text style={styles.modalTitle}>Payment & Checkout</Text>
            
            <View style={styles.summaryBox}>
              <Text style={styles.summaryText}>Total Due: Rs. {total.toFixed(0)}</Text>
              <Text style={[styles.summaryText, remaining > 0 ? {color:'#e74c3c'} : {color:'#2ecc71'}]}>Remaining: Rs. {remaining.toFixed(0)}</Text>
            </View>

            <ScrollView style={styles.paymentsList}>
              {payments.map((p, idx) => (
                <View key={idx} style={styles.paymentRow}>
                  <View style={styles.payTypeSelector}>
                    {['cash', 'card', 'online'].map(pt => (
                      <TouchableOpacity 
                        key={pt} 
                        style={[styles.payTypeBtn, p.type === pt && styles.payTypeBtnActive]}
                        onPress={() => updatePayment(idx, 'type', pt)}
                      >
                        <Text style={[styles.payTypeBtnText, p.type === pt && {color:'#fff'}]}>{pt.toUpperCase()}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <TextInput 
                    style={styles.payInput}
                    keyboardType="numeric"
                    value={p.amount.toString()}
                    onChangeText={(val) => updatePayment(idx, 'amount', val)}
                  />

                  <TouchableOpacity style={styles.payDelBtn} onPress={() => removePaymentMethod(idx)}>
                    <Ionicons name="trash" size={20} color="#e74c3c" />
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity style={styles.addPaymentBtn} onPress={addPaymentMethod}>
                <Text style={styles.addPaymentBtnText}>+ Add Split Payment</Text>
              </TouchableOpacity>
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setCheckoutModalVisible(false)}>
                <Text>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.saveBtn, remaining > 0 && {backgroundColor: '#ccc'}]} 
                onPress={finalizeOrder}
                disabled={remaining > 0.01}
              >
                <Text style={{color:'#fff', fontWeight: 'bold'}}>Confirm & Generate Invoice</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Print Preview Modal */}
      <Modal visible={!!generatedInvoice} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={styles.printPreviewContent}>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setGeneratedInvoice(null)}>
              <Text style={styles.closeBtnText}>Close</Text>
            </TouchableOpacity>
            
            {generatedInvoice && <InvoiceComponent invoice={generatedInvoice} />}
            
            <TouchableOpacity style={styles.printBtnAction} onPress={() => {
                if (typeof window !== 'undefined') window.print();
            }}>
              <Text style={styles.printBtnText}>Print</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#f5f5f5',
  },
  mobileTabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    padding: 8,
    gap: 8,
  },
  mobileTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#F2F2F7',
  },
  mobileTabBtnActive: {
    backgroundColor: '#4a121a',
  },
  mobileTabBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#666',
  },
  mobileTabBtnTextActive: {
    color: '#fff',
  },
  floatingCartBar: {
    position: 'absolute',
    bottom: 14,
    left: 14,
    right: 14,
    backgroundColor: '#4a121a',
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8 },
      android: { elevation: 6 },
      web: { boxShadow: '0 4px 16px rgba(0,0,0,0.2)' },
    }),
  },
  floatingCartBadge: {
    backgroundColor: '#D5A943',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  floatingCartBadgeText: {
    color: '#000',
    fontWeight: '900',
    fontSize: 12,
  },
  floatingCartText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  floatingCartPrice: {
    color: '#D5A943',
    fontWeight: '800',
    fontSize: 15,
  },
  backToMenuBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 12,
    backgroundColor: '#FFF2F3',
    borderBottomWidth: 1,
    borderBottomColor: '#F5D7DA',
  },
  backToMenuText: {
    color: '#4a121a',
    fontWeight: '700',
    fontSize: 14,
  },
  menuArea: {
    flex: 2,
    padding: 24,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#4a121a',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    width: 250,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 8,
    marginLeft: 8,
  },
  catScroll: {
    flexGrow: 0,
    marginBottom: 20,
  },
  catBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#eee',
    borderRadius: 20,
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  catBtnActive: {
    backgroundColor: '#4a121a',
    borderColor: '#4a121a',
  },
  catText: {
    color: '#333',
    fontWeight: '600',
  },
  catTextActive: {
    color: '#fff',
  },
  itemsScroll: {
    flex: 1,
  },
  itemsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  itemCard: {
    width: '30%',
    minWidth: 150,
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#eee',
    alignItems: 'center',
    elevation: 2,
  },
  itemName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 8,
  },
  itemPrice: {
    fontSize: 16,
    color: '#D5A943',
    fontWeight: 'bold',
  },
  cartArea: {
    flex: 1,
    backgroundColor: '#fff',
    borderLeftWidth: 1,
    borderLeftColor: '#eee',
    display: 'flex',
    flexDirection: 'column',
  },
  orderOptions: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    backgroundColor: '#fafafa',
  },
  typeSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  typeBtn: {
    flex: 1,
    padding: 10,
    alignItems: 'center',
    backgroundColor: '#eee',
    marginHorizontal: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  typeBtnActive: {
    backgroundColor: '#D5A943',
    borderColor: '#D5A943',
  },
  typeBtnText: {
    fontWeight: 'bold',
    color: '#666',
  },
  typeBtnTextActive: {
    color: '#fff',
  },
  metaSection: {
    marginTop: 8,
  },
  selectMetaBtn: {
    backgroundColor: '#4a121a',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  selectMetaBtnText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  selectedMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#e8f5e9',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#c8e6c9',
  },
  metaName: {
    fontWeight: 'bold',
    color: '#2e7d32',
    fontSize: 16,
  },
  metaSub: {
    color: '#388e3c',
    fontSize: 12,
  },
  cartScroll: {
    flex: 1,
    padding: 16,
  },
  cartItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  cartItemInfo: {
    flex: 1,
  },
  cartItemName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  cartItemPrice: {
    fontSize: 14,
    color: '#666',
  },
  qtyControls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  qtyBtn: {
    width: 28,
    height: 28,
    backgroundColor: '#eee',
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qtyBtnText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  qtyText: {
    marginHorizontal: 12,
    fontSize: 16,
    fontWeight: 'bold',
  },
  deleteBtn: {
    width: 32,
    height: 32,
    backgroundColor: '#ffebee',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  cartFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    backgroundColor: '#fff',
  },
  kotRow: {
    marginBottom: 16,
  },
  kotBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fdf3f2',
    borderWidth: 1,
    borderColor: '#e74c3c',
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  kotBtnText: {
    color: '#e74c3c',
    fontWeight: 'bold',
    fontSize: 16,
  },
  discountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginBottom: 12,
  },
  label: {
    fontWeight: 'bold',
    color: '#333',
    marginRight: 8,
  },
  discountInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 4,
    width: 80,
    textAlign: 'right',
    borderRadius: 4,
  },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  totalsLabel: {
    fontSize: 14,
    color: '#666',
  },
  totalsValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: '600',
  },
  grandTotalRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#ddd',
  },
  grandTotalLabel: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4a121a',
  },
  grandTotalValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4a121a',
  },
  checkoutBtn: {
    backgroundColor: '#D5A943',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  checkoutBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    padding: 24,
    borderRadius: 12,
    width: 450,
  },
  modalContentLarge: {
    backgroundColor: '#fff',
    padding: 24,
    borderRadius: 12,
    width: 600,
    maxHeight: '80%',
  },
  printPreviewContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#4a121a',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 16,
  },
  cancelBtn: {
    padding: 12,
  },
  saveBtn: {
    backgroundColor: '#D5A943',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  summaryBox: {
    backgroundColor: '#f5f5f5',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  paymentsList: {
    maxHeight: 300,
  },
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  payTypeSelector: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    overflow: 'hidden',
    flex: 1,
  },
  payTypeBtn: {
    flex: 1,
    padding: 10,
    alignItems: 'center',
    backgroundColor: '#eee',
    borderRightWidth: 1,
    borderRightColor: '#ddd',
  },
  payTypeBtnActive: {
    backgroundColor: '#4a121a',
  },
  payTypeBtnText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  payInput: {
    width: 100,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 10,
    marginHorizontal: 12,
    textAlign: 'right',
  },
  payDelBtn: {
    padding: 8,
  },
  addPaymentBtn: {
    padding: 12,
    borderWidth: 1,
    borderColor: '#D5A943',
    borderStyle: 'dashed',
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  addPaymentBtnText: {
    color: '#D5A943',
    fontWeight: 'bold',
  },
  selectRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  createNewBtn: {
    marginTop: 16,
    backgroundColor: '#4a121a',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  createNewBtnText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  closeBtn: {
    alignSelf: 'flex-end',
    backgroundColor: '#fff',
    padding: 8,
    borderRadius: 4,
    marginBottom: 16,
  },
  closeBtnText: {
    color: '#e74c3c',
    fontWeight: 'bold',
  },
  printBtnAction: {
    backgroundColor: '#4a121a',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 24,
  },
  printBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  selectedMetaTableCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8F9FA',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  tableStatusPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  statusAvail: {
    backgroundColor: 'rgba(39, 174, 96, 0.15)',
  },
  statusOcc: {
    backgroundColor: 'rgba(231, 76, 60, 0.15)',
  },
  tableStatusPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  metaRunningBill: {
    fontSize: 12,
    fontWeight: '800',
    color: '#4a121a',
    marginTop: 3,
  },
  changeTableBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  changeTableBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4a121a',
  },
  resetTableBtn: {
    backgroundColor: 'rgba(231, 76, 60, 0.1)',
    padding: 7,
    borderRadius: 6,
  },
  modalFilterPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F2F2F7',
  },
  modalFilterPillActive: {
    backgroundColor: '#4a121a',
  },
  modalFilterText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#636366',
  },
  modalFilterTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  tableSelectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FAFAFC',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#EFEFEF',
  },
  tableSelectCardActive: {
    borderColor: '#27ae60',
    borderWidth: 2,
    backgroundColor: '#F0FFF4',
  },
  tableSelectCardBusy: {
    borderColor: '#FFD7D3',
    backgroundColor: '#FFF8F7',
  },
  tableCardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  tableCardStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
  },
  tableCardStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },
  tableCardStatusText: {
    fontSize: 10,
    fontWeight: '800',
  },
  tableCardSubtitle: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },
  tableCardBillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 4,
  },
  tableCardBillAmount: {
    fontSize: 12,
    fontWeight: '800',
    color: '#4a121a',
  },
  tableCardTicketsHint: {
    fontSize: 11,
    color: '#D84315',
    fontWeight: '600',
    marginLeft: 4,
  },
  tableCardAvailableHint: {
    fontSize: 11,
    color: '#27ae60',
    fontWeight: '600',
    marginTop: 4,
  },
});
