import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePathname } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Linking,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { isCustomerPortalRoute } from '../services/cloudMenuBridge';
import { getActiveServerHttpUrl } from '../services/syncService';

export const INSTALLED_APK_VERSION = 45;
export const INSTALLED_WEB_VERSION = 54;
export const APP_VERSION_LABEL = Platform.OS === 'web' ? `v${INSTALLED_WEB_VERSION}` : `v${INSTALLED_APK_VERSION}`;
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
          `${base}/api/app-update/info?apkVer=${INSTALLED_APK_VERSION}&webVer=${INSTALLED_WEB_VERSION}&t=${Date.now()}`,
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
        const remoteWebVer = Number(data.webVersion || data.apkVersion || INSTALLED_WEB_VERSION);
        if (remoteVer > 0) {
          setServerVersion(remoteVer);
        }

        // 1. Web / Windows Desktop PCs: Auto-reload UI immediately when Master Server dist/ or webVersion changes
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          const clearCachesAndReload = async () => {
            try {
              if ('caches' in window && window.caches?.keys) {
                const keys = await window.caches.keys();
                await Promise.all(keys.map((k) => window.caches.delete(k)));
              }
            } catch { }
            try {
              window.location?.reload();
            } catch { }
          };

          // If running via localhost/127.0.0.1 fallback, check Master LAN hub (192.168.1.10:5050):
          // 1) If Master is online with a DIFFERENT instanceId (e.g. Rooftop PC fell back after power cut), auto-escape back to Master!
          // 2) If Master has a newer webVersion, switch to Master immediately.
          const host = window.location?.hostname || '';
          if (host === 'localhost' || host === '127.0.0.1') {
            try {
              const mCtrl = new AbortController();
              const mTimer = setTimeout(() => mCtrl.abort(), 1600);
              const [localHRes, masterHRes, mRes] = await Promise.all([
                fetch(`${base}/health`, { signal: mCtrl.signal, cache: 'no-store' }).catch(() => null),
                fetch('http://192.168.1.10:5050/health', { signal: mCtrl.signal, cache: 'no-store' }).catch(() => null),
                fetch(
                  `http://192.168.1.10:5050/api/app-update/info?apkVer=${INSTALLED_APK_VERSION}&webVer=${INSTALLED_WEB_VERSION}&t=${Date.now()}`,
                  { signal: mCtrl.signal, headers: { 'Cache-Control': 'no-cache' } }
                ).catch(() => null),
              ]);
              clearTimeout(mTimer);
              const localH = localHRes && localHRes.ok ? await localHRes.json() : null;
              const masterH = masterHRes && masterHRes.ok ? await masterHRes.json() : null;
              if (masterH?.status === 'online' && masterH?.instanceId && localH?.instanceId && masterH.instanceId !== localH.instanceId) {
                window.location.href = `http://192.168.1.10:5050${window.location.pathname}${window.location.search}`;
                return;
              }
              if (mRes && mRes.ok) {
                const masterData = await mRes.json();
                const masterWebVer = Number(masterData?.webVersion || 0);
                if (masterWebVer > Math.max(INSTALLED_WEB_VERSION, remoteWebVer)) {
                  window.location.href = `http://192.168.1.10:5050${window.location.pathname}${window.location.search}`;
                  return;
                }
              }
            } catch { }
          }

          if (remoteWebVer > INSTALLED_WEB_VERSION) {
            try {
              const reloadKey = `sultan_reloaded_web_v${remoteWebVer}`;
              if (!window.sessionStorage?.getItem(reloadKey)) {
                window.sessionStorage?.setItem(reloadKey, '1');
                void clearCachesAndReload();
                return;
              }
            } catch { }
          }
          if (data.webBundleHash) {
            if (!initialWebHashRef.current) {
              initialWebHashRef.current = data.webBundleHash;
            } else if (initialWebHashRef.current !== data.webBundleHash) {
              initialWebHashRef.current = data.webBundleHash;
              void clearCachesAndReload();
            }
          }
        }

        // 2. Android Tablets: Strictly compare installed APK version with Master Server apkVersion
        // (Prevents false update loops when file copy mtimeMs changes for the same version!)
        if (Platform.OS === 'android') {
          if (data.apkVersion && Number(data.apkVersion) > INSTALLED_APK_VERSION) {
            setPendingApkHash(data.apkHash || String(data.apkVersion));
            setApkDownloadUrl(`${base}${data.apkDownloadUrl || '/api/tablet-update/Sultan-POS-Tablet.apk'}`);
            setApkUpdateAvailable(true);
          } else {
            setApkUpdateAvailable(false);
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
      if (apkDownloadUrl) {
        const sep = apkDownloadUrl.includes('?') ? '&' : '?';
        const freshUrl = `${apkDownloadUrl}${sep}v=${serverVersion}&t=${Date.now()}`;
        await Linking.openURL(freshUrl);
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
