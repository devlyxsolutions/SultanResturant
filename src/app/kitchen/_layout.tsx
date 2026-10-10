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
import SultanLogo from '../../components/SultanLogo';

export default function KitchenLayout() {
  const { ready, user, logout } = useRoleGuard(['kitchen', 'manager', 'admin']);
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const router = useRouter();
  const pathname = usePathname();
  const unavailableCount = useOpsStore(s => s.unavailableItemIds?.length || 0);
  const isAvailabilityScreen = pathname?.includes('availability');
  const isDayScreen = pathname?.includes('day');

  if (!ready) return null;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a1a" />
      
      {/* High-Contrast Kitchen Header */}
      <View style={[styles.header, isMobile && styles.headerMobile]}>
        <View style={styles.headerLeft}>
          <SultanLogo size="sm" width={26} height={26} style={{ marginRight: 8 }} />
          <Text style={[styles.headerTitle, isMobile && styles.headerTitleMobile]}>
            {isMobile ? 'KDS' : 'KITCHEN DISPLAY'}
          </Text>
          <View style={styles.liveTag}>
            <View style={styles.liveDot} />
            <Text style={styles.liveTagText}>LIVE</Text>
          </View>
        </View>
        
        <View style={styles.headerRight}>
          <SyncStatusBadge compact={isMobile} />

          <TouchableOpacity
            style={[
              styles.actionHeaderBtn,
              { backgroundColor: isDayScreen ? '#D5A943' : '#333' }
            ]}
            onPress={() => isDayScreen ? router.push('/kitchen/kds' as any) : router.push('/kitchen/day' as any)}
            activeOpacity={0.8}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons 
              name={isDayScreen ? "restaurant-outline" : "flame-outline"} 
              size={16} 
              color={isDayScreen ? '#1A1A1A' : '#fff'} 
              style={!isMobile ? { marginRight: 6 } : undefined} 
            />
            {!isMobile && (
              <Text style={[styles.actionHeaderBtnText, isDayScreen && { color: '#1A1A1A', fontWeight: '800' }]}>
                {isDayScreen ? 'Orders KDS' : 'Chef Day Ops'}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.actionHeaderBtn,
              { backgroundColor: isAvailabilityScreen ? '#333' : '#D84315' }
            ]}
            onPress={() => isAvailabilityScreen ? router.push('/kitchen/kds') : router.push('/kitchen/availability')}
            activeOpacity={0.8}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons 
              name={isAvailabilityScreen ? "restaurant-outline" : "close-circle-outline"} 
              size={16} 
              color="#fff" 
              style={!isMobile ? { marginRight: 6 } : undefined} 
            />
            {!isMobile && (
              <Text style={styles.actionHeaderBtnText}>
                {isAvailabilityScreen ? 'Orders KDS' : `Sold Out (86)${unavailableCount > 0 ? ` [${unavailableCount}]` : ''}`}
              </Text>
            )}
          </TouchableOpacity>
          
          {!isMobile && (
            <Text style={styles.stationName}>Chef: {user?.name}</Text>
          )}

          <TouchableOpacity 
            style={[styles.logoutButton, isMobile && styles.logoutButtonMobile]}
            onPress={logout}
            activeOpacity={0.7}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="log-out-outline" size={17} color="#fff" style={!isMobile ? { marginRight: 6 } : undefined} />
            {!isMobile && <Text style={styles.logoutText}>Logout</Text>}
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.content}>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#121212' } }} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a', 
  },
  header: {
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 20,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
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
    color: '#FF3B30', // Urgent red/orange for kitchen visibility
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  headerTitleMobile: {
    fontSize: 18,
    letterSpacing: 1,
  },
  liveTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 59, 48, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.4)',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FF3B30',
    marginRight: 4,
  },
  liveTagText: {
    color: '#FF3B30',
    fontSize: 10,
    fontWeight: '800',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stationName: {
    color: '#aaa',
    fontSize: 13,
    fontWeight: '600',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2A2A2E',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3E3E44',
  },
  logoutButtonMobile: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 36,
    minWidth: 36,
    justifyContent: 'center',
  },
  logoutText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  actionHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  actionHeaderBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  content: {
    flex: 1,
    backgroundColor: '#121212', // Dark mode for kitchen screens
  }
});
