import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { initSyncService } from '../services/syncService';
import { initCallListener } from '../services/headlessCallService';
import StockAlarmHost from '../components/StockAlarmHost';
import IncomingCallHost from '../components/IncomingCallHost';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  useEffect(() => {
    // Initialize real-time cross-device sync hub
    initSyncService();

    // Initialize native Android incoming call detection listener
    const cleanupCallListener = initCallListener();

    // Hide splash screen after a short delay to ensure fonts/assets are loaded
    setTimeout(() => {
      SplashScreen.hideAsync();
    }, 500);

    return () => {
      cleanupCallListener();
    };
  }, []);

  return (
    <>
      <Stack screenOptions={{ headerShown: false }} />
      {/* Live stock / kitchen handover alarms for admin, manager and kitchen roles */}
      <StockAlarmHost />
      {/* Live incoming caller ID popup & quick order routing */}
      <IncomingCallHost />
    </>
  );
}
