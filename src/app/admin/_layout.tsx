import { Stack } from 'expo-router';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet, 
  StatusBar, 
  useWindowDimensions, 
  Platform 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRoleGuard } from '../../hooks/useRoleGuard';
import SyncStatusBadge from '../../components/SyncStatusBadge';

export default function AdminLayout() {
  const { ready, user, logout } = useRoleGuard(['admin']);
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  if (!ready) return null;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor="#4a121a" />

      {/* Top Navigation Bar */}
      <View style={[styles.header, isMobile && styles.headerMobile]}>
        <View style={styles.headerLeft}>
          <Text style={[styles.headerTitle, isMobile && styles.headerTitleMobile]}>
            {isMobile ? 'Sultan' : 'Sultan Admin'}
          </Text>
          <View style={styles.roleTag}>
            <Text style={styles.roleTagText}>ADMIN</Text>
          </View>
        </View>

        <View style={[styles.headerRight, isMobile && styles.headerRightMobile]}>
          <SyncStatusBadge compact={isMobile} />
          
          {!isMobile && (
            <Text style={styles.userName} numberOfLines={1}>Hello, {user?.name}</Text>
          )}

          <TouchableOpacity 
            style={[styles.logoutButton, isMobile && styles.logoutButtonMobile]}
            onPress={logout}
            activeOpacity={0.7}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons 
              name="log-out-outline" 
              size={18} 
              color="#D5A943" 
              style={!isMobile ? { marginRight: 6 } : undefined} 
            />
            {!isMobile && <Text style={styles.logoutText}>Logout</Text>}
          </TouchableOpacity>
        </View>
      </View>
      
      {/* Main Content Area */}
      <View style={styles.content}>
        <Stack 
          screenOptions={{ 
            headerShown: false,
            contentStyle: { backgroundColor: '#F8F9FA' }
          }} 
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#4a121a', // Sultan Burgundy covers safe area
  },
  header: {
    backgroundColor: '#4a121a',
    paddingHorizontal: 24,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(213, 169, 67, 0.2)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 10,
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
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  headerTitleMobile: {
    fontSize: 18,
  },
  roleTag: {
    backgroundColor: 'rgba(213, 169, 67, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(213, 169, 67, 0.4)',
  },
  roleTagText: {
    color: '#D5A943',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerRightMobile: {
    gap: 8,
  },
  userName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
    maxWidth: 160,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 14,
    paddingVertical: 8,
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
    fontSize: 13,
  },
  content: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  }
});
