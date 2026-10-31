import { Stack } from 'expo-router';
import { ActivityIndicator, Platform, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BottomNav from '../../components/BottomNav';
import SultanLogo from '../../components/SultanLogo';
import WaiterNotificationHost from '../../components/WaiterNotificationHost';
import { useRoleGuard } from '../../hooks/useRoleGuard';

export default function WaiterLayout() {
  const { ready, logout } = useRoleGuard(['waiter', 'manager', 'admin']);

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: '#4a121a', alignItems: 'center', justifyContent: 'center' }}>
        <StatusBar barStyle="light-content" />
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
      <StatusBar barStyle="dark-content" />

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
    backgroundColor: '#F8F9FA',
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
