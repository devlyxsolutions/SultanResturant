import React from 'react';
import { Stack } from 'expo-router';
import { ActivityIndicator, Platform, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import SultanLogo from '../../components/SultanLogo';
import { useRoleGuard } from '../../hooks/useRoleGuard';

export default function FloorManagerLayout() {
  const { ready } = useRoleGuard(['floor_manager', 'Floor Manager', 'manager', 'admin']);

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: '#1A1817', alignItems: 'center', justifyContent: 'center' }}>
        <StatusBar barStyle="light-content" />
        <SultanLogo size="md" width={68} height={68} />
        <ActivityIndicator size="small" color="#0D9488" style={{ marginTop: 18 }} />
        <Text style={{ color: '#0D9488', marginTop: 12, fontSize: 12, fontWeight: '700', letterSpacing: 0.8 }}>
          LOADING FLOOR MANAGER CONSOLE...
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" />
      <View style={styles.content}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: '#121110' },
          }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121110',
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
    backgroundColor: '#121110',
    overflow: 'hidden',
  },
});
