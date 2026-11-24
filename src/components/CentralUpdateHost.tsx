import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Linking,
  StatusBar,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { usePathname } from 'expo-router';
import { getActiveServerHttpUrl } from '../services/syncService';
import { isCustomerPortalRoute } from '../services/cloudMenuBridge';

export const INSTALLED_APK_VERSION = 24;
export const APP_VERSION_LABEL = `v${INSTALLED_APK_VERSION}`;
const APK_HASH_STORAGE_KEY = `@sultan_installed_apk_hash_v${INSTALLED_APK_VERSION}`;

export default function CentralUpdateHost() {
  const pathname = usePathname();
  const isPublicGuestPortal =
    isCustomerPortalRoute() ||
    Boolean(pathname && (pathname === '/menu' || pathname.startsWith('/menu/') || pathname === '/feedback' || pathname.startsWith('/feedback/')));
  const initialWebHashRef = useRef<string | null>(null);
  const initialApkHashRef = useRef<string | null>(null);
  const [apkUpdateAvailable, setApkUpdateAvailable] = useState(false);
  const [pendingApkHash, setPendingApkHash] = useState<string | null>(null);
  const [apkDownloadUrl, setApkDownloadUrl] = useState<string>('');
  const [serverVersion, setServerVersion] = useState<number>(INSTALLED_APK_VERSION);
  const [isServerConnected, setIsServerConnected] = useState<boolean>(false);

  useEffect(() => {
    if (isPublicGuestPortal) return;
    let mounted = true;

    const checkCentralServerUpdate = async () => {
      try {
        const base = getActiveServerHttpUrl().replace(/\/+$/, '');
        if (!base) return;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);
        const res = await fetch(
          `${base}/api/app-update/info?apkVer=${INSTALLED_APK_VERSION}&t=${Date.now()}`,
          {
            signal: controller.signal,
            headers: { 'Cache-Control': 'no-cache' },
          }
        );
        clearTimeout(timeoutId);

        if (!res.ok) return;
        const data = await res.json();
        if (!mounted || !data?.success) return;

              setIsServerConnected(true);
              const remoteVer = Number(data.apkVersion || INSTALLED_APK_VERSION);
              if (remoteVer > 0) {
                setServerVersion(remoteVer);
              }

              // 1. Web / Windows Desktop PCs: Auto-reload UI immediately when Master Server dist/ or version changes
              if (Platform.OS === 'web') {
                if (remoteVer > INSTALLED_APK_VERSION && typeof window !== 'undefined') {
                  try {
                    const reloadKey = `sultan_reloaded_for_v${remoteVer}`;
                    if (!window.sessionStorage?.getItem(reloadKey)) {
                      window.sessionStorage?.setItem(reloadKey, '1');
                      window.location.reload();
                      return;
                    }
                  } catch { }
                }
                if (data.webBundleHash) {
                  if (!initialWebHashRef.current) {
                    initialWebHashRef.current = data.webBundleHash;
                  } else if (initialWebHashRef.current !== data.webBundleHash) {
                    initialWebHashRef.current = data.webBundleHash;
                    if (typeof window !== 'undefined' && window.location) {
                      window.location.reload();
                    }
                  }
                }
              }

              // 2. Android Tablets: Compare installed APK version & hash with Master Server
              if (Platform.OS === 'android' && data.apkHash) {
                if (data.apkVersion && Number(data.apkVersion) > INSTALLED_APK_VERSION) {
                  setPendingApkHash(data.apkHash);
                  setApkDownloadUrl(`${base}${data.apkDownloadUrl || '/api/tablet-update/Sultan-POS-Tablet.apk'}`);
                  setApkUpdateAvailable(true);
                  return;
                }

                if (!initialApkHashRef.current) {
                  const savedHash = await AsyncStorage.getItem(APK_HASH_STORAGE_KEY);
                  if (!savedHash) {
                    await AsyncStorage.setItem(APK_HASH_STORAGE_KEY, data.apkHash);
                    initialApkHashRef.current = data.apkHash;
                  } else {
                    initialApkHashRef.current = savedHash;
                  }
                }

                if (initialApkHashRef.current && initialApkHashRef.current !== data.apkHash) {
                  setPendingApkHash(data.apkHash);
                  setApkDownloadUrl(`${base}${data.apkDownloadUrl || '/api/tablet-update/Sultan-POS-Tablet.apk'}`);
                  setApkUpdateAvailable(true);
                }
              }
            } catch {
              // Ignore transient network poll errors
            }
          };

          const initialTimer = setTimeout(checkCentralServerUpdate, 1500);
          const interval = setInterval(checkCentralServerUpdate, 12000);

          return () => {
            mounted = false;
            clearTimeout(initialTimer);
            clearInterval(interval);
          };
        }, []);

  const handleInstallTabletUpdate = async () => {
    try {
      if (pendingApkHash) {
        await AsyncStorage.setItem(APK_HASH_STORAGE_KEY, pendingApkHash);
        initialApkHashRef.current = pendingApkHash;
      }
      setApkUpdateAvailable(false);
      if (apkDownloadUrl) {
        await Linking.openURL(apkDownloadUrl);
      }
    } catch { }
  };

  if (isPublicGuestPortal) return null;

  const hasNewerServerVersion = serverVersion > INSTALLED_APK_VERSION;
  const canTapBadgeToUpdate = Platform.OS === 'android' && (apkUpdateAvailable || hasNewerServerVersion);

  return (
          <>
            {/* Global Top-Corner Version Badge — Visible on EVERY Page (PC Web/EXE & Android Tablet) */}
            <View
              nativeID="sultan-global-version-badge"
              pointerEvents="box-none"
              style={styles.versionBadgeHost}
            >
              {canTapBadgeToUpdate ? (
                <TouchableOpacity
                  style={[styles.versionPill, styles.versionPillUpdate]}
                  onPress={handleInstallTabletUpdate}
                  activeOpacity={0.85}
                >
                  <View style={[styles.versionDot, { backgroundColor: '#F59E0B' }]} />
                  <Text style={[styles.versionText, { color: '#FEF3C7' }]}>
                    {APP_VERSION_LABEL} → v{serverVersion} UPDATE
                  </Text>
                </TouchableOpacity>
              ) : (
                <View pointerEvents="none" style={styles.versionPill}>
                  <View
                    style={[
                      styles.versionDot,
                      { backgroundColor: isServerConnected ? '#22C55E' : '#D4AF37' },
                    ]}
                  />
                  <Text style={styles.versionText}>
                    {APP_VERSION_LABEL}
                  </Text>
                </View>
              )}
            </View>

            {/* Android Tablet Central Update Banner */}
            {apkUpdateAvailable && Platform.OS === 'android' && (
        <View style={styles.bannerContainer}>
          <View style={styles.bannerCard}>
            <View style={styles.iconCircle}>
              <Ionicons name="cloud-download" size={22} color="#1A0306" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.bannerTitle}>
                New Sultan POS Update (v{Math.max(serverVersion, INSTALLED_APK_VERSION + 1)}) Ready
              </Text>
              <Text style={styles.bannerSubtitle}>
                A new update is available on the Master Server (Current: {APP_VERSION_LABEL}). Tap Update Now to install.
              </Text>
            </View>
            <TouchableOpacity
              style={styles.updateBtn}
              onPress={handleInstallTabletUpdate}
              activeOpacity={0.85}
            >
              <Text style={styles.updateBtnText}>Update Now</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => setApkUpdateAvailable(false)}
            >
              <Ionicons name="close" size={18} color="#D4AF37" />
            </TouchableOpacity>
          </View>
        </View>
      )}
      </>
      );
}

      const styles = StyleSheet.create({
        versionBadgeHost: {
        position: 'absolute',
      top: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 2 : 3,
      right: 8,
      zIndex: 99990,
      elevation: 20,
  },
      versionPill: {
        flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: 'rgba(36, 5, 9, 0.9)',
      borderWidth: 1,
      borderColor: 'rgba(212, 175, 55, 0.72)',
      borderRadius: 999,
      paddingHorizontal: 7,
      paddingVertical: 2,
  },
      versionPillUpdate: {
        backgroundColor: '#7C2D12',
      borderColor: '#F59E0B',
  },
      versionDot: {
        width: 6,
      height: 6,
      borderRadius: 3,
  },
      versionText: {
        color: '#F3E5AB',
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.4,
  },
      bannerContainer: {
        position: 'absolute',
      top: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 28 : 28,
      left: 16,
      right: 16,
      zIndex: 99999,
      alignItems: 'center',
  },
      bannerCard: {
        flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#240509',
      borderWidth: 1.5,
      borderColor: '#D4AF37',
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 10,
      maxWidth: 620,
      width: '100%',
      gap: 12,
      elevation: 10,
  },
      iconCircle: {
        width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: '#D4AF37',
      justifyContent: 'center',
      alignItems: 'center',
  },
      bannerTitle: {
        color: '#D4AF37',
      fontSize: 14,
      fontWeight: '800',
  },
      bannerSubtitle: {
        color: '#F3E5AB',
      fontSize: 12,
      marginTop: 2,
  },
      updateBtn: {
        backgroundColor: '#2ecc71',
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 10,
  },
      updateBtnText: {
        color: '#082614',
      fontWeight: '800',
      fontSize: 13,
  },
      closeBtn: {
        padding: 4,
  },
});
