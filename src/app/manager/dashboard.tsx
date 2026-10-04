import React from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  useWindowDimensions 
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useRestaurantStore } from '../../store/restaurantStore';

export default function ManagerDashboard() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isMobile = width < 600;

  const staff = useRestaurantStore((state) => state.staff) || [];
  const activeWaiters = staff.filter((s) => s.role === 'Waiter' && s.status === 'Active').length;
  const activeKitchen = staff.filter((s) => s.role === 'Kitchen' && s.status === 'Active').length;
  const tables = useRestaurantStore((state) => state.tables) || [];
  const occupiedCount = tables.filter(t => t.status === 'occupied').length;

  return (
    <ScrollView style={[styles.container, isMobile && styles.containerMobile]} showsVerticalScrollIndicator={false}>
      <View style={styles.content}>
        
        {/* Header */}
        <View style={styles.headerSection}>
          <Text style={[styles.pageTitle, isMobile && styles.pageTitleMobile]}>Manager Duty</Text>
          <Text style={styles.dateText}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </Text>
        </View>

        {/* Quick Shift Summary Bar */}
        <View style={styles.kpiRow}>
          <View style={styles.kpiPill}>
            <Ionicons name="grid" size={16} color="#1976D2" style={{ marginRight: 6 }} />
            <Text style={styles.kpiText}>{occupiedCount}/{tables.length} Tables Busy</Text>
          </View>
          <View style={styles.kpiPill}>
            <Ionicons name="people" size={16} color="#7B1FA2" style={{ marginRight: 6 }} />
            <Text style={styles.kpiText}>{activeWaiters} Waiters • {activeKitchen} Kitchen</Text>
          </View>
        </View>
        
        {/* Urgent Alerts Section */}
        <View style={[styles.alertCard, isMobile && styles.alertCardMobile]}>
          <View style={styles.alertHeader}>
            <Ionicons name="warning" size={22} color="#e74c3c" />
            <Text style={styles.alertTitle}>Stock & Inventory Notice</Text>
          </View>
          <Text style={styles.alertDesc}>Chicken Karahi, Mint Leaves, and Pepsi are below reorder threshold.</Text>
          <TouchableOpacity 
            style={styles.alertButton} 
            onPress={() => router.push('/manager/inventory')}
            activeOpacity={0.8}
          >
            <Text style={styles.alertButtonText}>Manage Stock Levels</Text>
          </TouchableOpacity>
        </View>

        {/* Manager Actions */}
        <Text style={styles.sectionTitle}>Shift Operations</Text>
        <View style={styles.grid}>
          
          <TouchableOpacity 
            style={[styles.card, isMobile && styles.cardMobile]}
            onPress={() => router.push('/manager/floor-plan')}
            activeOpacity={0.7}
          >
            <View style={[styles.iconBox, { backgroundColor: '#E3F2FD' }]}>
              <Ionicons name="grid" size={24} color="#1976D2" />
            </View>
            <View style={styles.cardInfo}>
              <Text style={styles.cardTitle}>Floor Plan & Blueprint</Text>
              <Text style={styles.cardDesc}>View live table layout, bills & assign guest tables.</Text>
            </View>
            {isMobile && (
              <Ionicons name="chevron-forward" size={18} color="#C7C7CC" />
            )}
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.card, isMobile && styles.cardMobile]}
            onPress={() => router.push('/manager/pos')}
            activeOpacity={0.7}
          >
            <View style={[styles.iconBox, { backgroundColor: '#FFF3E0' }]}>
              <Ionicons name="calculator" size={24} color="#F57C00" />
            </View>
            <View style={styles.cardInfo}>
              <Text style={styles.cardTitle}>POS Cashier Terminal</Text>
              <Text style={styles.cardDesc}>Fast order punching, takeaway, card & cash billing.</Text>
            </View>
            {isMobile && (
              <Ionicons name="chevron-forward" size={18} color="#C7C7CC" />
            )}
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.card, isMobile && styles.cardMobile]}
            onPress={() => router.push('/manager/shift')}
            activeOpacity={0.7}
          >
            <View style={[styles.iconBox, { backgroundColor: '#E8F5E9' }]}>
              <Ionicons name="cash" size={24} color="#2E7D32" />
            </View>
            <View style={styles.cardInfo}>
              <Text style={styles.cardTitle}>Shift & Cash Drawer</Text>
              <Text style={styles.cardDesc}>Count cash, reconcile variance & print X/Z reports.</Text>
            </View>
            {isMobile && (
              <Ionicons name="chevron-forward" size={18} color="#C7C7CC" />
            )}
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.card, isMobile && styles.cardMobile]}
            onPress={() => router.push('/admin/staff')}
            activeOpacity={0.7}
          >
            <View style={[styles.iconBox, { backgroundColor: '#F3E5F5' }]}>
              <Ionicons name="people" size={24} color="#7B1FA2" />
            </View>
            <View style={styles.cardInfo}>
              <Text style={styles.cardTitle}>Staff Attendance & PINs</Text>
              <Text style={styles.cardDesc}>
                {activeWaiters + activeKitchen} Active staff on current shift roster.
              </Text>
            </View>
            {isMobile && (
              <Ionicons name="chevron-forward" size={18} color="#C7C7CC" />
            )}
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.card, isMobile && styles.cardMobile]}
            onPress={() => router.push('/kitchen/kds')}
            activeOpacity={0.7}
          >
            <View style={[styles.iconBox, { backgroundColor: '#FBE9E7' }]}>
              <Ionicons name="flame" size={24} color="#D84315" />
            </View>
            <View style={styles.cardInfo}>
              <Text style={styles.cardTitle}>Kitchen Display (KDS)</Text>
              <Text style={styles.cardDesc}>Monitor live cooking tickets and kitchen bumps.</Text>
            </View>
            {isMobile && (
              <Ionicons name="chevron-forward" size={18} color="#C7C7CC" />
            )}
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.card, isMobile && styles.cardMobile]}
            onPress={() => router.push('/waiter')}
            activeOpacity={0.7}
          >
            <View style={[styles.iconBox, { backgroundColor: '#F6F3EC' }]}>
              <Ionicons name="fast-food" size={24} color="#4a121a" />
            </View>
            <View style={styles.cardInfo}>
              <Text style={styles.cardTitle}>Waiter Table Handheld</Text>
              <Text style={styles.cardDesc}>Mobile table ordering for serving staff.</Text>
            </View>
            {isMobile && (
              <Ionicons name="chevron-forward" size={18} color="#C7C7CC" />
            )}
          </TouchableOpacity>
          
        </View>

      </View>
    </ScrollView>
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
  content: {
    maxWidth: 1000,
    width: '100%',
    alignSelf: 'center',
    paddingBottom: 40,
  },
  headerSection: {
    marginBottom: 16,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1C1C1E',
    marginBottom: 4,
  },
  pageTitleMobile: {
    fontSize: 22,
  },
  dateText: {
    fontSize: 14,
    color: '#8E8E93',
    fontWeight: '500',
  },
  kpiRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  kpiPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  kpiText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  alertCard: {
    backgroundColor: '#FDF2F0',
    borderWidth: 1,
    borderColor: '#FADCD8',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  alertCardMobile: {
    padding: 16,
  },
  alertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  alertTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#e74c3c',
    marginLeft: 8,
  },
  alertDesc: {
    fontSize: 14,
    color: '#636366',
    lineHeight: 20,
    marginBottom: 14,
  },
  alertButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#e74c3c',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  alertButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1C1C1E',
    marginBottom: 14,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 20,
    width: '48%',
    borderWidth: 1,
    borderColor: '#EFEFF4',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 2,
  },
  cardMobile: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  cardInfo: {
    flex: 1,
    marginHorizontal: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 3,
  },
  cardDesc: {
    fontSize: 13,
    color: '#8E8E93',
    lineHeight: 18,
  },
});
