import { AppRegistry, Platform } from 'react-native';
import { useCallStore } from '../store/callStore';
import { addCallListener, isServiceRunning, startService } from 'call-detector';

const HEADLESS_TASK_NAME = 'IncomingCallHeadlessTask';

/**
 * Register Headless JS background task for Android.
 * This runs when the app is backgrounded or minimized and the native
 * ForegroundService / Receiver triggers an incoming call event.
 */
if (Platform.OS === 'android') {
  AppRegistry.registerHeadlessTask(HEADLESS_TASK_NAME, () => async (taskData: any) => {
    try {
      const { eventType, phoneNumber, duration, timestamp } = taskData || {};
      const store = useCallStore.getState();

      if (!store.isDetectionEnabled) {
        return;
      }

      switch (eventType) {
        case 'INCOMING_CALL':
          store.handleIncomingCall(phoneNumber, timestamp);
          break;
        case 'CALL_ANSWERED':
          store.handleCallAnswered(phoneNumber, timestamp);
          break;
        case 'CALL_ENDED':
          store.handleCallEnded(phoneNumber, duration, timestamp);
          break;
        case 'MISSED_CALL':
          store.handleMissedCall(phoneNumber, timestamp);
          break;
      }
    } catch {
      // Background task caught
    }
  });
}

/**
 * Initializes call detection runtime listeners when the app UI is active.
 * Connects native EventEmitter to Zustand callStore and auto-starts the service
 * if enabled in settings.
 */
export function initCallListener(): () => void {
  const store = useCallStore.getState();

  // If enabled, ensure the native service is running
  if (store.isDetectionEnabled && Platform.OS === 'android') {
    isServiceRunning()
      .then((running: boolean) => {
        store.setServiceRunning(running);
        if (!running) {
          return startService().then((ok: boolean) => {
            if (ok) store.setServiceRunning(true);
          });
        }
      })
      .catch(() => {});
  }

  // Subscribe to foreground events emitted by CallDetectorModule
  const subIncoming = addCallListener('INCOMING_CALL', (event: any) => {
    useCallStore.getState().handleIncomingCall(event.phoneNumber, event.timestamp);
  });

  const subAnswered = addCallListener('CALL_ANSWERED', (event: any) => {
    useCallStore.getState().handleCallAnswered(event.phoneNumber, event.timestamp);
  });

  const subEnded = addCallListener('CALL_ENDED', (event: any) => {
    useCallStore.getState().handleCallEnded(event.phoneNumber, event.duration, event.timestamp);
  });

  const subMissed = addCallListener('MISSED_CALL', (event: any) => {
    useCallStore.getState().handleMissedCall(event.phoneNumber, event.timestamp);
  });

  return () => {
    subIncoming.remove();
    subAnswered.remove();
    subEnded.remove();
    subMissed.remove();
  };
}
