import { View, Text, StyleSheet, StatusBar, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { useRoleGuard } from '../../hooks/useRoleGuard';
import UniversalPortalNav from '../../components/UniversalPortalNav';
import BottomNav from '../../components/BottomNav';
import WaiterNotificationHost from '../../components/WaiterNotificationHost';
import SultanLogo from '../../components/SultanLogo';

export default function WaiterLayout() {
  const { ready, logout } = useRoleGuard(['waiter', 'manager', 'admin']);

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: '#4a121a', alignItems: 'center', justifyContent: 'center' }}>
        <StatusBar barStyle="light-content" backgroundColor="#4a121a" />
        <SultanLogo size="md" width={68} height={68} />
        <ActivityIndicator size="small" color="#D4AF37" style={{ marginTop: 18 }} />
        <Text style={{ color: '#D4AF37', marginTop: 12, fontSize: 12, fontWeight: '700', letterSpacing: 0.8 }}>
          LOADING ORDER TAKER...
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor="#4a121a" />

      {/* Universal Top Navigation Bar */}
      <UniversalPortalNav
        portalName="Sultan Order Taker"
        portalRole="waiter"
        showTabs={false}
      />

      <View style={styles.content}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: '#F8F9FA' },
          }}
        />
      </View>
      <BottomNav role="waiter" onLogout={logout} />

      {/* Live Order Taker Food & Bill Audio/Visual Notification Host */}
      <WaiterNotificationHost />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#4a121a', // Sultan Burgundy for status bar area
    ...Platform.select({
      web: {
        height: '100vh' as any,
        maxHeight: '100vh' as any,
        overflow: 'hidden',
      },
    }),
  },
  content: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    overflow: 'hidden',
  },
});
