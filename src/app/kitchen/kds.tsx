import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ScrollView,
  Platform,
  Modal
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useRestaurantStore, Ticket } from '../../store/restaurantStore';
import SyncStatusBadge from '../../components/SyncStatusBadge';
import OrderSlip, { printOrderSlip } from '../../components/OrderSlip';

// Dual-Tone Audio Chime using Web Audio API
function playKitchenChime(isAddOn: boolean = false) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        if (ctx.state === 'suspended') {
          ctx.resume();
        }
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        if (isAddOn) {
          // Energetic 3-tone rapid ascending alert for Add-on order
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(587.33, now); // D5
          osc.frequency.setValueAtTime(880, now + 0.12); // A5
          osc.frequency.setValueAtTime(1174.66, now + 0.24); // D6
          gain.gain.setValueAtTime(0.35, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
          osc.start(now);
          osc.stop(now + 0.65);
        } else {
          // Warm 2-tone restaurant chime for new regular order
          osc.type = 'sine';
          osc.frequency.setValueAtTime(523.25, now); // C5
          osc.frequency.setValueAtTime(659.25, now + 0.15); // E5
          gain.gain.setValueAtTime(0.3, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
          osc.start(now);
          osc.stop(now + 0.55);
        }
      }
    } catch (e) {
      // AudioContext could require initial user gesture
    }
  }
}

export default function KitchenDisplayScreen() {
  const router = useRouter();
  const tickets = useRestaurantStore((state) => state.tickets);
  const toggleItem = useRestaurantStore((state) => state.toggleTicketItem);
  const bumpTicket = useRestaurantStore((state) => state.bumpTicket);
  const updateTicketStatus = useRestaurantStore((state) => state.updateTicketStatus);
  const [activeFilter, setActiveFilter] = useState<'all' | 'cooking' | 'ready' | 'addons' | 'served'>('all');
  const [stationFilter] = useState<'all' | 'main' | 'juice'>('main');
  const [now, setNow] = useState(() => Date.now());
  const [latestAlert, setLatestAlert] = useState<{
    id: string;
    tableName: string;
    isAddOn: boolean;
    roundNumber?: number;
    itemCount: number;
    server: string;
  } | null>(null);

  const [printingTicket, setPrintingTicket] = useState<Ticket | null>(null);

  // Track seen tickets to trigger notification on newly incoming tickets
  const seenTicketIdsRef = useRef<Set<string>>(new Set(tickets.map((t) => t.id)));
  const isInitialMount = useRef(true);

  // Ticking clock so elapsed-time colors refresh automatically every 15s
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(id);
  }, []);

  // Watch for new tickets arriving (from waiter device / server sync)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    const newlyAdded = tickets.filter((t) => !seenTicketIdsRef.current.has(t.id) && t.status === 'cooking');
    tickets.forEach((t) => seenTicketIdsRef.current.add(t.id));

    if (newlyAdded.length > 0) {
      const newest = newlyAdded[newlyAdded.length - 1];
      const isAddOn = !!newest.isAddOn;

      playKitchenChime(isAddOn);

      setLatestAlert({
        id: newest.id,
        tableName: newest.tableName,
        isAddOn,
        roundNumber: newest.roundNumber,
        itemCount: newest.items.reduce((sum, it) => sum + it.qty, 0),
        server: newest.server,
      });

      const timer = setTimeout(() => {
        setLatestAlert(null);
      }, 8000);

      return () => clearTimeout(timer);
    }
  }, [tickets]);

  const activeTickets = tickets.filter((t) => t.status === 'cooking' || t.status === 'ready');
  const cookingCount = tickets.filter((t) => t.status === 'cooking').length;
  const readyCount = tickets.filter((t) => t.status === 'ready').length;
  const servedCount = tickets.filter((t) => t.status === 'served').length;
  const addOnsCount = tickets.filter((t) => t.isAddOn && t.status === 'cooking').length;

  const filteredTickets = tickets
    .map(t => {
      // Filter the items within the ticket by station
      const matchingItems = stationFilter === 'all' 
        ? t.items 
        : t.items.filter(i => (i.station || 'main') === stationFilter);
        
      return { ...t, items: matchingItems };
    })
    .filter((t) => {
      // Don't show tickets that have no items for this station
      if (t.items.length === 0) return false;
      
      if (activeFilter === 'cooking') return t.status === 'cooking';
      if (activeFilter === 'ready') return t.status === 'ready';
      if (activeFilter === 'served') return t.status === 'served';
      if (activeFilter === 'addons') return t.isAddOn && t.status === 'cooking';
      return t.status === 'cooking' || t.status === 'ready';
    });

  const handleTicketAction = (ticket: Ticket) => {
    if (ticket.status === 'cooking') {
      updateTicketStatus(ticket.id, 'ready');
    } else if (ticket.status === 'ready') {
      // If already ready, bumping marks it dispatched / served
      bumpTicket(ticket.id);
    } else {
      // If served, clicking recalls it back to ready
      updateTicketStatus(ticket.id, 'ready');
    }
  };

  const renderTicket = ({ item }: { item: Ticket }) => {
    const timeElapsedMinutes = Math.floor((now - item.timePlaced) / 60000);
    const isReady = item.status === 'ready';
    const isServed = item.status === 'served';
    const isAddOn = !!item.isAddOn;

    let headerColor = isAddOn ? '#D5A943' : '#34C759'; // Gold for Add-on, Green (< 10 mins)
    if (isServed) {
      headerColor = '#48484A'; // Neutral slate for served
    } else if (isReady) {
      headerColor = '#007AFF'; // Blue for ready to pick up
    } else if (timeElapsedMinutes >= 20) {
      headerColor = '#FF3B30'; // Red (> 20 mins)
    } else if (timeElapsedMinutes >= 10) {
      headerColor = '#FF9500'; // Amber (10-20 mins)
    }

    const allItemsCompleted = item.items.length > 0 && item.items.every((i) => i.completed);

    return (
      <View
        style={[
          styles.ticketCard,
          isReady && styles.ticketCardReady,
          isAddOn && !isReady && !isServed && styles.ticketCardAddOn,
          isServed && { opacity: 0.85, borderColor: '#48484A' },
        ]}
      >
        {/* Ticket Header */}
        <View style={[styles.ticketHeader, { backgroundColor: headerColor }]}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Text style={styles.ticketId}>{item.id}</Text>
              {isAddOn && (
                <View style={styles.addOnTag}>
                  <Ionicons name="flash" size={11} color="#000" />
                  <Text style={styles.addOnTagText}>ROUND #{item.roundNumber || 2}</Text>
                </View>
              )}
              {isReady && (
                <View style={styles.readyTag}>
                  <Text style={styles.readyTagText}>READY</Text>
                </View>
              )}
              {isServed && (
                <View style={[styles.readyTag, { backgroundColor: '#3A3A3C' }]}>
                  <Text style={[styles.readyTagText, { color: '#bbb' }]}>SERVED</Text>
                </View>
              )}
            </View>
            <Text style={styles.ticketTable} numberOfLines={1}>
              {item.tableName} • {item.server}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 6 }}>
            <View style={styles.timeBadge}>
              <Ionicons name="time-outline" size={14} color="#fff" />
              <Text style={styles.timeText}>{timeElapsedMinutes}m</Text>
            </View>
            <TouchableOpacity 
              style={{ backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, flexDirection: 'row', alignItems: 'center', gap: 4 }}
              onPress={() => setPrintingTicket(item)}
            >
              <Ionicons name="print-outline" size={12} color="#fff" />
              <Text style={{ fontSize: 10, color: '#fff', fontWeight: 'bold' }}>PRINT</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Add-On Notice Ribbon if this is extra items for table */}
        {isAddOn && !isServed && (
          <View style={styles.addOnRibbon}>
            <Ionicons name="add-circle" size={13} color="#D5A943" style={{ marginRight: 4 }} />
            <Text style={styles.addOnRibbonText}>
              ADD-ON ITEMS • EXPEDITE FOR RUNNING TABLE
            </Text>
          </View>
        )}

        {/* Ticket Items */}
        <ScrollView style={styles.ticketBody} showsVerticalScrollIndicator={false}>
          {item.items.map((food) => (
            <TouchableOpacity
              key={food.id}
              style={[styles.foodRow, (food.completed || isServed) && styles.foodRowCompleted]}
              onPress={() => !isServed && toggleItem(item.id, food.id)}
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.qtyBox,
                  (food.completed || isServed) && { backgroundColor: '#1E3A24' },
                ]}
              >
                {(food.completed || isServed) ? (
                  <Ionicons name="checkmark" size={18} color="#34C759" />
                ) : (
                  <Text style={styles.qtyText}>{food.qty}</Text>
                )}
              </View>
              <View style={styles.foodDetails}>
                <Text
                  style={[
                    styles.foodName,
                    (food.completed || isServed) && styles.textCompleted,
                  ]}
                >
                  {food.name}
                </Text>
                {food.notes ? (
                  <View style={styles.notesContainer}>
                    <Ionicons name="pencil" size={12} color="#D5A943" />
                    <Text style={styles.foodNotes}>{food.notes}</Text>
                  </View>
                ) : null}
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Ticket Footer / Action */}
        <TouchableOpacity
          style={[
            styles.bumpButton,
            isServed
              ? { backgroundColor: '#2C2C2E', borderColor: '#48484A' }
              : (isReady ? styles.bumpButtonDispatched : (allItemsCompleted ? styles.bumpButtonReady : null)),
          ]}
          onPress={() => handleTicketAction(item)}
          activeOpacity={0.8}
        >
          <Ionicons
            name={isServed ? 'arrow-undo' : (isReady ? 'checkmark-done-circle' : (allItemsCompleted ? 'notifications' : 'chevron-forward-circle'))}
            size={18}
            color={isServed ? '#bbb' : (isReady ? '#fff' : (allItemsCompleted ? '#000' : '#888'))}
          />
          <Text
            style={[
              styles.bumpButtonText,
              isServed ? { color: '#bbb' } : (isReady ? styles.bumpTextWhite : (allItemsCompleted ? styles.bumpTextReady : null)),
            ]}
          >
            {isServed ? 'DISPATCHED (TAP TO RECALL)' : (isReady ? 'MARK DISPATCHED' : (allItemsCompleted ? 'NOTIFY SERVER (READY)' : 'MARK READY'))}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Top KDS Navbar */}
      <View style={styles.navbar}>
        <View style={styles.navLeft}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          >
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View>
            <Text style={styles.navTitle}>Sultan Kitchen Display</Text>
            <Text style={styles.navSubtitle}>Live KOT & Order Expediting</Text>
          </View>
        </View>

        {/* Status Filter Badges, Audio Test & Sync Hub Badge */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          
          <View style={styles.filterPills}>
            <TouchableOpacity
              style={[styles.filterPill, activeFilter === 'all' && styles.filterPillActive]}
              onPress={() => setActiveFilter('all')}
            >
              <Text style={[styles.filterPillText, activeFilter === 'all' && styles.filterPillTextActive]}>
                Active ({activeTickets.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.filterPill, activeFilter === 'cooking' && styles.filterPillActiveCooking]}
              onPress={() => setActiveFilter('cooking')}
            >
              <View style={[styles.dot, { backgroundColor: '#FF9500' }]} />
              <Text style={[styles.filterPillText, activeFilter === 'cooking' && styles.filterPillTextActive]}>
                Cooking ({cookingCount})
              </Text>
            </TouchableOpacity>

            {addOnsCount > 0 && (
              <TouchableOpacity
                style={[styles.filterPill, activeFilter === 'addons' && styles.filterPillActiveAddons]}
                onPress={() => setActiveFilter('addons')}
              >
                <Ionicons name="flash" size={12} color={activeFilter === 'addons' ? '#000' : '#D5A943'} />
                <Text style={[styles.filterPillText, activeFilter === 'addons' && styles.filterPillTextActiveAddons]}>
                  Add-ons ({addOnsCount})
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.filterPill, activeFilter === 'ready' && styles.filterPillActiveReady]}
              onPress={() => setActiveFilter('ready')}
            >
              <View style={[styles.dot, { backgroundColor: '#007AFF' }]} />
              <Text style={[styles.filterPillText, activeFilter === 'ready' && styles.filterPillTextActive]}>
                Ready ({readyCount})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.filterPill, activeFilter === 'served' && { backgroundColor: '#48484A', borderColor: '#636366' }]}
              onPress={() => setActiveFilter('served')}
            >
              <Ionicons name="checkmark-done" size={12} color={activeFilter === 'served' ? '#fff' : '#8E8E93'} />
              <Text style={[styles.filterPillText, activeFilter === 'served' && { color: '#fff' }]}>
                Served ({servedCount})
              </Text>
            </TouchableOpacity>
          </View>

          {/* Sound Alert Test Button */}
          <TouchableOpacity
            style={styles.soundButton}
            onPress={() => playKitchenChime(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="volume-high" size={15} color="#D5A943" />
            <Text style={styles.soundButtonText}>Chime</Text>
          </TouchableOpacity>

          <SyncStatusBadge />
        </View>
      </View>

      {/* Real-time Incoming Order Alert Banner */}
      {latestAlert && (
        <View style={[styles.alertBanner, latestAlert.isAddOn ? styles.alertBannerAddOn : styles.alertBannerNew]}>
          <View style={styles.alertIconBox}>
            <Ionicons
              name={latestAlert.isAddOn ? 'flash' : 'notifications'}
              size={22}
              color="#fff"
            />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={styles.alertHeading}>
                {latestAlert.isAddOn ? '⚡ ADD-ON ORDER RECEIVED!' : '🔔 NEW KOT TICKET!'}
              </Text>
              {latestAlert.isAddOn && (
                <View style={styles.alertRoundPill}>
                  <Text style={styles.alertRoundText}>ROUND #{latestAlert.roundNumber || 2}</Text>
                </View>
              )}
            </View>
            <Text style={styles.alertDetail}>
              {latestAlert.tableName} • {latestAlert.itemCount} items ordered by {latestAlert.server} ({latestAlert.id})
            </Text>
          </View>
          <TouchableOpacity
            style={styles.alertDismissBtn}
            onPress={() => setLatestAlert(null)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      )}

      {/* Main Ticket Area */}
      <View style={styles.body}>
        {filteredTickets.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconBox}>
              <Ionicons name="restaurant-outline" size={48} color="#444" />
            </View>
            <Text style={styles.emptyText}>Kitchen is Clear!</Text>
            <Text style={styles.emptySubText}>
              {activeFilter === 'ready'
                ? 'No tickets currently waiting for pickup.'
                : activeFilter === 'cooking'
                ? 'No items currently in the cooking queue.'
                : activeFilter === 'addons'
                ? 'No add-on orders currently pending.'
                : 'All kitchen tickets have been prepared and served.'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={filteredTickets}
            keyExtractor={(t) => t.id}
            renderItem={renderTicket}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
          />
        )}
      </View>

      {/* Print Preview Modal */}
      <Modal visible={!!printingTicket} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={styles.printPreviewContent}>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setPrintingTicket(null)}>
              <Text style={styles.closeBtnText}>Close</Text>
            </TouchableOpacity>
            
            {printingTicket && <OrderSlip ticket={printingTicket} />}
            
            <TouchableOpacity style={styles.printBtnAction} onPress={() => {
                if (printingTicket) {
                  printOrderSlip(printingTicket);
                } else if (typeof window !== 'undefined') {
                  window.print();
                }
            }}>
              <Text style={styles.printBtnText}>Print Slip</Text>
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
    backgroundColor: '#0F0F12',
  },
  navbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#18181D',
    borderBottomWidth: 1,
    borderBottomColor: '#282830',
  },
  navLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#26262E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
  },
  navSubtitle: {
    fontSize: 12,
    color: '#8E8E93',
  },
  filterPills: {
    flexDirection: 'row',
    gap: 8,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#24242C',
  },
  filterPillActive: {
    backgroundColor: '#3A3A48',
  },
  filterPillActiveCooking: {
    backgroundColor: '#4A3319',
  },
  filterPillActiveReady: {
    backgroundColor: '#19334D',
  },
  filterPillText: {
    color: '#999',
    fontSize: 13,
    fontWeight: '600',
  },
  filterPillTextActive: {
    color: '#fff',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  body: {
    flex: 1,
    paddingVertical: 16,
  },
  listContent: {
    paddingHorizontal: 16,
    gap: 16,
  },
  ticketCard: {
    width: 330,
    backgroundColor: '#1C1C22',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2C2C36',
    marginRight: 16,
    display: 'flex',
    flexDirection: 'column',
  },
  ticketCardReady: {
    borderColor: '#007AFF',
  },
  ticketHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  ticketId: {
    fontSize: 20,
    fontWeight: '900',
    color: '#000',
  },
  readyTag: {
    backgroundColor: '#fff',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  readyTagText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#007AFF',
  },
  ticketTable: {
    fontSize: 14,
    fontWeight: '700',
    color: 'rgba(0,0,0,0.75)',
    marginTop: 2,
  },
  timeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#000',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  timeText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff',
  },
  ticketBody: {
    flex: 1,
    padding: 12,
  },
  foodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    backgroundColor: '#262630',
    padding: 10,
    borderRadius: 10,
  },
  foodRowCompleted: {
    backgroundColor: '#1A1A22',
    opacity: 0.65,
  },
  qtyBox: {
    width: 34,
    height: 34,
    backgroundColor: '#343442',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  qtyText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  foodDetails: {
    flex: 1,
    justifyContent: 'center',
  },
  foodName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  notesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  foodNotes: {
    color: '#D5A943',
    fontSize: 12,
    fontWeight: '600',
  },
  textCompleted: {
    textDecorationLine: 'line-through',
    color: '#777',
  },
  bumpButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#262630',
    paddingVertical: 15,
    borderTopWidth: 1,
    borderTopColor: '#2C2C38',
  },
  bumpButtonReady: {
    backgroundColor: '#D5A943', // Gold highlight
  },
  bumpButtonDispatched: {
    backgroundColor: '#007AFF', // Blue served
  },
  bumpButtonText: {
    color: '#8E8E93',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  bumpTextReady: {
    color: '#000',
  },
  bumpTextWhite: {
    color: '#fff',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
  },
  emptyIconBox: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#1E1E26',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 6,
  },
  emptySubText: {
    color: '#8E8E93',
    fontSize: 15,
    textAlign: 'center',
    maxWidth: 360,
  },
  ticketCardAddOn: {
    borderColor: '#D5A943',
    borderWidth: 1.5,
  },
  addOnTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#000',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  addOnTagText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#D5A943',
  },
  addOnRibbon: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(213, 169, 67, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(213, 169, 67, 0.3)',
  },
  addOnRibbonText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#D5A943',
    letterSpacing: 0.5,
  },
  filterPillActiveAddons: {
    backgroundColor: '#D5A943',
  },
  filterPillTextActiveAddons: {
    color: '#000',
    fontWeight: '800',
  },
  soundButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#262630',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#3A3A48',
  },
  soundButtonText: {
    color: '#D5A943',
    fontSize: 12,
    fontWeight: '700',
  },
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12,
    gap: 12,
  },
  alertBannerAddOn: {
    backgroundColor: '#8B4500',
    borderBottomWidth: 2,
    borderBottomColor: '#FF9500',
  },
  alertBannerNew: {
    backgroundColor: '#1E4620',
    borderBottomWidth: 2,
    borderBottomColor: '#34C759',
  },
  alertIconBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertHeading: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  alertRoundPill: {
    backgroundColor: '#fff',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  alertRoundText: {
    color: '#8B4500',
    fontSize: 10,
    fontWeight: '900',
  },
  alertDetail: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  alertDismissBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  printPreviewContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    marginVertical: 40,
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    alignItems: 'center',
  },
  closeBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 10,
    backgroundColor: '#f1f2f6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  closeBtnText: {
    color: '#333',
    fontWeight: 'bold',
    fontSize: 12,
  },
  printBtnAction: {
    backgroundColor: '#D5A943',
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 12,
    marginTop: 20,
    width: '100%',
    alignItems: 'center',
  },
  printBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
});
