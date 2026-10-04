import { Stack, useRouter, usePathname } from 'expo-router';
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
import { useOpsStore } from '../../store/opsStore';
import SyncStatusBadge from '../../components/SyncStatusBadge';

export default function WaiterLayout() {
  const { ready, user, logout } = useRoleGuard(['waiter']);
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const router = useRouter();
  const pathname = usePathname();
  const requests = useOpsStore((s) => s.serviceRequests) || [];
  const pendingCount = requests.filter((r) => r.status === 'pending').length;
  const isRequestsRoute = pathname?.includes('requests');

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
            style={[
              styles.bellButton, 
              pendingCount > 0 ? styles.bellButtonAlert : styles.bellButtonNormal
            ]}
            onPress={() => isRequestsRoute ? router.push('/waiter') : router.push('/waiter/requests')}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons 
              name={isRequestsRoute ? "grid-outline" : "notifications"} 
              size={17} 
              color="#fff" 
              style={!isMobile ? { marginRight: 5 } : undefined} 
            />
            {!isRequestsRoute && pendingCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{pendingCount > 9 ? '9+' : pendingCount}</Text>
              </View>
            )}
            {!isMobile && (
              <Text style={styles.bellButtonText}>
                {isRequestsRoute ? 'Tables' : `Bells${pendingCount > 0 ? ` (${pendingCount})` : ''}`}
              </Text>
            )}
          </TouchableOpacity>

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
  bellButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    position: 'relative',
  },
  bellButtonNormal: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  bellButtonAlert: {
    backgroundColor: '#C62828',
  },
  bellButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#FFD700',
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: '#000',
    fontSize: 10,
    fontWeight: '900',
  },
  content: {
    flex: 1,
  }
});
