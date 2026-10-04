import { Stack } from 'expo-router';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet, 
  StatusBar,
  useWindowDimensions 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRoleGuard } from '../../hooks/useRoleGuard';
import SyncStatusBadge from '../../components/SyncStatusBadge';

export default function WaiterLayout() {
  const { ready, user, logout } = useRoleGuard(['waiter']);
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  if (!ready) return null;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor="#4a121a" />
      {/* App-like Header */}
      <View style={[styles.header, isMobile && styles.headerMobile]}>
        <View style={styles.headerLeft}>
          <Text style={[styles.headerTitle, isMobile && styles.headerTitleMobile]}>
            {isMobile ? 'Waiter' : 'Sultan Waiter'}
          </Text>
          <View style={styles.staffTag}>
            <Text style={styles.staffTagText}>{user?.name || 'Staff'}</Text>
          </View>
        </View>
        
        <View style={styles.headerRight}>
          <SyncStatusBadge compact={isMobile} />
          <TouchableOpacity 
            style={[styles.logoutButton, isMobile && styles.logoutButtonMobile]}
            onPress={logout}
            activeOpacity={0.7}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="log-out-outline" size={17} color="#D5A943" style={!isMobile ? { marginRight: 6 } : undefined} />
            {!isMobile && <Text style={styles.logoutText}>Logout</Text>}
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.content}>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#f2f2f6' } }} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#4a121a', // Sultan Burgundy for status bar area
  },
  header: {
    backgroundColor: '#4a121a',
    paddingHorizontal: 20,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(213, 169, 67, 0.2)',
  },
  headerMobile: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    color: '#D5A943', // Sultan Gold
    fontSize: 20,
    fontWeight: '800',
  },
  headerTitleMobile: {
    fontSize: 18,
  },
  staffTag: {
    backgroundColor: 'rgba(213, 169, 67, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(213, 169, 67, 0.3)',
  },
  staffTagText: {
    color: '#D5A943',
    fontSize: 11,
    fontWeight: '700',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D5A943',
  },
  logoutButtonMobile: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 36,
    minWidth: 36,
    justifyContent: 'center',
  },
  logoutText: {
    color: '#D5A943',
    fontWeight: '700',
    fontSize: 12,
  },
  content: {
    flex: 1,
  }
});
