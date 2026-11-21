import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import POSTerminalScreen from '../screens/POSTerminalScreen';
import { useRoleGuard } from '../hooks/useRoleGuard';

export default function DirectPOSRoute() {
  const { ready, user } = useRoleGuard(['admin', 'manager', 'floor_manager']);

  if (!ready || !user) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0B0B0E', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#D4AF37" />
      </View>
    );
  }

  const role = user.role === 'admin' 
    ? 'admin' 
    : user.role === 'floor_manager' 
      ? 'floor_manager' 
      : 'manager';

  const backRoute = user.role === 'admin' ? '/admin/dashboard' : '/manager/dashboard';
  const shiftRoute = user.role === 'admin' ? '/admin/shift' : '/manager/shift';

  return (
    <POSTerminalScreen
      role={role}
      backRoute={backRoute}
      shiftRoute={shiftRoute}
    />
  );
}
