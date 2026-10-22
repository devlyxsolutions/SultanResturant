import { requireNativeModule, EventEmitter, type EventSubscription } from 'expo-modules-core';
import { Platform } from 'react-native';

export type CallEventType = 'INCOMING_CALL' | 'CALL_ANSWERED' | 'CALL_ENDED' | 'MISSED_CALL';

export interface CallEventPayload {
  phoneNumber: string;
  duration?: number;
  timestamp: number;
}

export interface PermissionStatusResult {
  hasPhoneState: boolean;
  hasCallLog: boolean;
  hasPostNotifications: boolean;
  isBatteryOptimizationIgnored: boolean;
  allGranted: boolean;
}

// Fallback EventEmitter for web / dev-mock environments
class MockCallDetector {
  private listeners: Record<string, Set<(data: any) => void>> = {};

  async startService(): Promise<boolean> {
    return true;
  }
  async stopService(): Promise<boolean> {
    return true;
  }
  async isServiceRunning(): Promise<boolean> {
    return false;
  }
  async checkPermissions(): Promise<PermissionStatusResult> {
    return {
      hasPhoneState: true,
      hasCallLog: true,
      hasPostNotifications: true,
      isBatteryOptimizationIgnored: true,
      allGranted: true,
    };
  }
  async requestBatteryOptimizationExemption(): Promise<boolean> {
    return true;
  }
  async simulateIncomingCall(phoneNumber: string): Promise<boolean> {
    this.emit('INCOMING_CALL', { phoneNumber, duration: 0, timestamp: Date.now() });
    return true;
  }
  async simulateCallAnswered(): Promise<boolean> {
    this.emit('CALL_ANSWERED', { phoneNumber: '', duration: 0, timestamp: Date.now() });
    return true;
  }
  async simulateCallEnded(): Promise<boolean> {
    this.emit('CALL_ENDED', { phoneNumber: '', duration: 15, timestamp: Date.now() });
    return true;
  }

  emit(event: string, payload: any) {
    (this.listeners[event] || new Set()).forEach(fn => fn(payload));
  }

  addListener(event: string, fn: (data: any) => void) {
    if (!this.listeners[event]) this.listeners[event] = new Set();
    this.listeners[event].add(fn);
    return {
      remove: () => {
        this.listeners[event]?.delete(fn);
      },
    };
  }
}

let nativeModule: any = null;
let eventEmitter: any = null;
const mockModule = new MockCallDetector();

if (Platform.OS === 'android') {
  try {
    nativeModule = requireNativeModule('CallDetector');
    eventEmitter = new (EventEmitter as any)(nativeModule);
  } catch (err) {
    // Falls back to mock module in Expo Go or non-native builds
    nativeModule = mockModule;
  }
} else {
  nativeModule = mockModule;
}

/**
 * Starts the native foreground service and call listener.
 */
export async function startService(): Promise<boolean> {
  try {
    return await nativeModule.startService();
  } catch {
    return false;
  }
}

/**
 * Stops the native foreground service and call listener.
 */
export async function stopService(): Promise<boolean> {
  try {
    return await nativeModule.stopService();
  } catch {
    return false;
  }
}

/**
 * Checks if the call listener service is actively running.
 */
export async function isServiceRunning(): Promise<boolean> {
  try {
    return await nativeModule.isServiceRunning();
  } catch {
    return false;
  }
}

/**
 * Checks Android telephony, notification, and battery optimization permissions.
 */
export async function checkPermissions(): Promise<PermissionStatusResult> {
  try {
    return await nativeModule.checkPermissions();
  } catch {
    return {
      hasPhoneState: false,
      hasCallLog: false,
      hasPostNotifications: false,
      isBatteryOptimizationIgnored: false,
      allGranted: false,
    };
  }
}

/**
 * Launches the native system intent requesting battery optimization exemption.
 */
export async function requestBatteryOptimizationExemption(): Promise<boolean> {
  try {
    return await nativeModule.requestBatteryOptimizationExemption();
  } catch {
    return false;
  }
}

/**
 * Debug helper to simulate an incoming call with a given phone number.
 */
export async function simulateIncomingCall(phoneNumber: string): Promise<boolean> {
  try {
    if (nativeModule && nativeModule !== mockModule) {
      await nativeModule.simulateIncomingCall(phoneNumber);
      return true;
    }
  } catch {}
  mockModule.simulateIncomingCall(phoneNumber);
  return true;
}

/**
 * Debug helper to simulate call answered.
 */
export async function simulateCallAnswered(): Promise<boolean> {
  try {
    if (nativeModule && nativeModule !== mockModule) {
      return await nativeModule.simulateCallAnswered();
    }
  } catch {}
  return await mockModule.simulateCallAnswered();
}

/**
 * Debug helper to simulate call ended.
 */
export async function simulateCallEnded(): Promise<boolean> {
  try {
    if (nativeModule && nativeModule !== mockModule) {
      return await nativeModule.simulateCallEnded();
    }
  } catch {}
  return await mockModule.simulateCallEnded();
}

/**
 * Subscribes to native call events (INCOMING_CALL, CALL_ANSWERED, CALL_ENDED, MISSED_CALL).
 */
export function addCallListener(
  eventType: CallEventType,
  listener: (event: CallEventPayload) => void
): EventSubscription {
  if (eventEmitter) {
    try {
      return eventEmitter.addListener(eventType, listener);
    } catch {
      return mockModule.addListener(eventType, listener);
    }
  }
  return mockModule.addListener(eventType, listener);
}

export default {
  startService,
  stopService,
  isServiceRunning,
  checkPermissions,
  requestBatteryOptimizationExemption,
  simulateIncomingCall,
  simulateCallAnswered,
  simulateCallEnded,
  addCallListener,
};
