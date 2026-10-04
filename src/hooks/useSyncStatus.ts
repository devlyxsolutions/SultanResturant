import { useEffect, useState } from 'react';
import { 
  subscribeToSyncStatus, 
  initSyncService, 
  forceSyncNow, 
  setCustomServerIp,
  SyncInfo 
} from '../services/syncService';

export function useSyncStatus() {
  const [syncInfo, setSyncInfo] = useState<SyncInfo>({
    status: 'connecting',
    serverIp: '192.168.1.16',
    serverPort: 5050,
    lastSyncedAt: null,
    totalSyncedEvents: 0,
    deviceId: '',
  });

  useEffect(() => {
    initSyncService();
    const unsubscribe = subscribeToSyncStatus(setSyncInfo);
    return () => unsubscribe();
  }, []);

  return {
    ...syncInfo,
    isConnected: syncInfo.status === 'connected',
    isConnecting: syncInfo.status === 'connecting',
    isOffline: syncInfo.status === 'offline',
    forceSyncNow,
    setCustomServerIp,
  };
}
