import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Linking,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { getActiveServerHttpUrl } from '../services/syncService';

export const INSTALLED_APK_VERSION = 13;
const APK_HASH_STORAGE_KEY = `@sultan_installed_apk_hash_v${INSTALLED_APK_VERSION}`;

export default function CentralUpdateHost() {
  const initialWebHashRef = useRef<string | null>(null);
  const initialApkHashRef = useRef<string | null>(null);
  const [apkUpdateAvailable, setApkUpdateAvailable] = useState(false);
  const [pendingApkHash, setPendingApkHash] = useState<string | null>(null);
  const [apkDownloadUrl, setApkDownloadUrl] = useState<string>('');

  useEffect(() => {
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

        // 1. Web / Windows Desktop PCs: Auto-reload UI immediately when Master Server dist/ changes
        if (Platform.OS === 'web' && data.webBundleHash) {
          if (!initialWebHashRef.current) {
            initialWebHashRef.current = data.webBundleHash;
          } else if (initialWebHashRef.current !== data.webBundleHash) {
            initialWebHashRef.current = data.webBundleHash;
            if (typeof window !== 'undefined' && window.location) {
              window.location.reload();
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

    const initialTimer = setTimeout(checkCentralServerUpdate, 2000);
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
    } catch {}
  };

  if (!apkUpdateAvailable || Platform.OS !== 'android') {
    return null;
  }

  return (
    <View style={styles.bannerContainer}>
      <View style={styles.bannerCard}>
        <View style={styles.iconCircle}>
          <Ionicons name="cloud-download" size={22} color="#1A0306" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.bannerTitle}>New Sultan App Update Ready</Text>
          <Text style={styles.bannerSubtitle}>
            Master Server (192.168.1.10) par Sultan Gold Logo wala naya version available hai.
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
  );
}

const styles = StyleSheet.create({
  bannerContainer: {
    position: 'absolute',
    top: 12,
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
