import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  useWindowDimensions,
  Platform,
  ScrollView,
  Animated,
  Easing,
  TextInput,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, type Href } from 'expo-router';
import {
  useAuthStore,
  getRoleHome,
  useRestaurantStore,
  StaffMember,
  INITIAL_STAFF,
  Role,
} from '../store';
import { useRoleStore } from '../store/roleStore';
import IslamicBackground from '../components/IslamicBackground';
import SultanLogo from '../components/SultanLogo';
import FullscreenButton from '../components/FullscreenButton';
import SyncStatusBadge from '../components/SyncStatusBadge';
import { Ionicons } from '@expo/vector-icons';
import { useSettingsStore } from '../store/settingsStore';
import {
  getStableDeviceId,
  getDeviceFriendlyName,
  getActiveServerHttpUrl,
  broadcastImmediately,
  markApplyingRemoteUpdate,
} from '../services/syncService';

// Session-wide splash skip flag for instant navigation after initial launch
let hasSeenSplashSession = false;

const ROLE_ALIASES: Record<string, Role> = {
  admin: 'admin',
  administrator: 'admin',
  cashier: 'manager',
  pos: 'manager',
  manager: 'manager',
  waiter: 'waiter',
  ordertaker: 'waiter',
  'order taker': 'waiter',
  server: 'waiter',
  kitchen: 'kitchen',
  kds: 'kitchen',
  chef: 'kitchen',
  cook: 'kitchen',
  juicebar: 'juicebar',
  'juice bar': 'juicebar',
  juice: 'juicebar',
  barista: 'juicebar',
  playland: 'playland',
  rides: 'playland',
  floor: 'floor_manager',
  floormanager: 'floor_manager',
  'floor manager': 'floor_manager',
  'floor_manager': 'floor_manager',
};

export default function WelcomeScreen({ forceLogin = false }: { forceLogin?: boolean } = {}) {
  const router = useRouter();
  const searchParams = useLocalSearchParams<{ login?: string }>();
  const shouldAutoOpenLogin = forceLogin || searchParams.login === 'true' || searchParams.login === '1';

  const user = useAuthStore((state) => state.user);
  const login = useAuthStore((state) => state.login);
  const hasHydrated = useAuthStore((state) => state.hasHydrated);

  const staff = useRestaurantStore((state) => state.staff) || [];
  const allRoles = useRoleStore((state) => state.roles);
  const systemSettings = useSettingsStore((state) => state.settings);

  const { width, height } = useWindowDimensions();

  // Screen classification for responsiveness
  const isCompactMobile = width < 480;
  const isMobile = width < 860;
  const isShortScreen = height < 700;

  // -------------------------------------------------------------
  // Split Animation State (0 = Centered Welcome, 1 = Split Login)
  // -------------------------------------------------------------
  const [isLoginActive, setIsLoginActive] = useState(() => shouldAutoOpenLogin);
  const [showWelcomeActions, setShowWelcomeActions] = useState(() => !shouldAutoOpenLogin);
  const [splitAnim] = useState(() => new Animated.Value(shouldAutoOpenLogin ? 1 : 0));

  // Form Fields
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [showTouchKeypad, setShowTouchKeypad] = useState(false);
  const [focusedField, setFocusedField] = useState<'username' | 'pin' | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const pinInputRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const prevAutoOpenRef = useRef(shouldAutoOpenLogin);

  const handleKeypadKey = useCallback(
    (key: string) => {
      if (errorMessage) setErrorMessage('');
      if (key === 'CLR') {
        setPin('');
        return;
      }
      if (key === 'DEL') {
        setPin((prev) => prev.slice(0, -1));
        return;
      }
      setPin((prev) => (prev.length < 8 ? prev + key : prev));
    },
    [errorMessage]
  );

  const openLogin = useCallback(() => {
    setIsLoginActive(true);
    setErrorMessage('');
    Animated.timing(splitAnim, {
      toValue: 1,
      duration: 220,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
      useNativeDriver: Platform.OS !== 'web',
    }).start(() => {
      setShowWelcomeActions(false);
    });
  }, [splitAnim]);

  const closeLogin = useCallback(() => {
    setShowWelcomeActions(true);
    setShowTouchKeypad(false);
    Animated.timing(splitAnim, {
      toValue: 0,
      duration: 200,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
      useNativeDriver: Platform.OS !== 'web',
    }).start(() => {
      setIsLoginActive(false);
      setErrorMessage('');
    });
  }, [splitAnim]);

  // Open login if routed with ?login=true dynamically after mount
  useEffect(() => {
    if (shouldAutoOpenLogin && !prevAutoOpenRef.current) {
      prevAutoOpenRef.current = true;
      const t = setTimeout(() => openLogin(), 0);
      return () => clearTimeout(t);
    }
    prevAutoOpenRef.current = shouldAutoOpenLogin;
    return undefined;
  }, [shouldAutoOpenLogin, openLogin]);

  // -------------------------------------------------------------
  // Splash & Transition States
  // -------------------------------------------------------------
  const shouldSkipSplash = true;

  const [showSplash, setShowSplash] = useState(() => !shouldSkipSplash);
  const [splashFadeAnim] = useState(() => new Animated.Value(shouldSkipSplash ? 0 : 1));
  const [progressAnim] = useState(() => new Animated.Value(shouldSkipSplash ? 1 : 0));
  const [welcomeFadeAnim] = useState(() => new Animated.Value(shouldSkipSplash ? 1 : 0));
  const [welcomeSlideAnim] = useState(() => new Animated.Value(shouldSkipSplash ? 0 : 10));

  const finishSplash = useCallback(() => {
    hasSeenSplashSession = true;
    Animated.timing(splashFadeAnim, {
      toValue: 0,
      duration: 150,
      easing: Easing.out(Easing.ease),
      useNativeDriver: Platform.OS !== 'web',
    }).start(() => {
      setShowSplash(false);
      Animated.parallel([
        Animated.timing(welcomeFadeAnim, {
          toValue: 1,
          duration: 180,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.spring(welcomeSlideAnim, {
          toValue: 0,
          friction: 8,
          tension: 60,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]).start();
    });
  }, [splashFadeAnim, welcomeFadeAnim, welcomeSlideAnim]);

  useEffect(() => {
    if (shouldSkipSplash) {
      hasSeenSplashSession = true;
      return;
    }

    Animated.timing(progressAnim, {
      toValue: 1,
      duration: 900,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      useNativeDriver: false,
    }).start();

    const tFinish = setTimeout(() => {
      finishSplash();
    }, 980);

    return () => {
      clearTimeout(tFinish);
    };
  }, [finishSplash, progressAnim, shouldSkipSplash]);

  // -------------------------------------------------------------
  // Login Authentication Handler (Per-Account Independent Session Control)
  // -------------------------------------------------------------
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const establishAccountSession = async (opts: {
    staffId: string;
    username?: string;
    name: string;
    role: Role;
    customRoleId?: string;
    assignedZone?: string;
    assignedZones?: string[];
    dest: string;
    maxConcurrentDevices?: number;
  }) => {
    const sessionId = `sess_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
    const deviceId = getStableDeviceId();
    const deviceName = getDeviceFriendlyName();
    const globalDefaultMax = Math.max(1, systemSettings?.defaultMaxDevicesPerStaff ?? 1);
    const effectiveMaxDevices =
      opts.maxConcurrentDevices && opts.maxConcurrentDevices > 0
        ? opts.maxConcurrentDevices
        : globalDefaultMax;
    const autoKick = systemSettings?.autoKickPreviousDevice !== false;

    setIsAuthenticating(true);
    try {
      // 1. Authoritative server-side session registration (atomically kicks ONLY this user's earlier device)
      let handledByServer = false;
      const baseUrl = getActiveServerHttpUrl();
      if (baseUrl) {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), 2500) : null;
        try {
          const res = await fetch(`${baseUrl}/api/auth/staff-session/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId,
              staffId: opts.staffId,
              username: opts.username,
              staffName: opts.name,
              role: String(opts.role),
              deviceId,
              deviceName,
              platform: Platform.OS,
              maxConcurrentDevices: effectiveMaxDevices,
              autoKickPreviousDevice: autoKick,
            }),
            ...(controller ? { signal: controller.signal } : {}),
          });
          if (timer) clearTimeout(timer);
          const data = await res.json().catch(() => null);
          if (res.status === 409 || (data && data.allowed === false)) {
            setErrorMessage(
              data?.error ||
                `This account (${opts.username || opts.name}) is already logged in on another device (Limit: ${effectiveMaxDevices}). Log out from the other device first or enable Auto-Logout in Settings.`
            );
            return;
          }
          if (res.ok && data?.success) {
            handledByServer = true;
            markApplyingRemoteUpdate(350);
            useRestaurantStore.setState((s) => ({
              ...(Array.isArray(data.activeStaffSessions)
                ? { activeStaffSessions: data.activeStaffSessions }
                : {}),
              ...(data.revokedSessions
                ? {
                    revokedSessions: {
                      ...(s.revokedSessions || {}),
                      ...data.revokedSessions,
                    },
                  }
                : {}),
              ...(data.revokedDeviceIds
                ? {
                    revokedDeviceIds: {
                      ...(s.revokedDeviceIds || {}),
                      ...data.revokedDeviceIds,
                    },
                  }
                : {}),
            }));
          }
        } catch {
          if (timer) clearTimeout(timer);
        }
      }

      // 2. Offline / fallback local session registration + broadcast
      if (!handledByServer) {
        const result = useRestaurantStore.getState().registerStaffSession(
          {
            sessionId,
            staffId: opts.staffId,
            username: opts.username,
            staffName: opts.name,
            role: String(opts.role),
            deviceId,
            deviceName,
            platform: Platform.OS,
          },
          effectiveMaxDevices,
          autoKick
        );
        if (!result.allowed) {
          const activeLabel = result.activeDevices?.[0]?.deviceName || 'another device';
          setErrorMessage(
            `This account (${opts.username || opts.name}) is already active on ${activeLabel} (Limit: ${effectiveMaxDevices}). Log out there first or enable Auto-Logout in Settings.`
          );
          return;
        }
        broadcastImmediately();
      }

      setErrorMessage('');
      login(opts.name, opts.role, {
        staffId: opts.staffId,
        username: opts.username,
        customRoleId: opts.customRoleId,
        assignedZone: opts.assignedZone,
        assignedZones: opts.assignedZones,
        sessionId,
        loginTime: Date.now(),
      });
      router.replace(opts.dest as Href);
    } finally {
      setIsAuthenticating(false);
    }
  };

  const completeStaffLogin = (member: StaffMember) => {
    const memberCustomRole = allRoles.find(
      (r) => r.id === member.customRoleId || r.name.toLowerCase() === member.role.toLowerCase()
    );
    const resolvedRole: Role = memberCustomRole
      ? ((memberCustomRole.baseRole === 'custom' ? 'manager' : memberCustomRole.baseRole) as Role)
      : (member.role.toLowerCase() as Role);

    const dest = getRoleHome(resolvedRole, memberCustomRole?.baseRole);
    void establishAccountSession({
      staffId: member.id,
      username: member.username,
      name: member.name,
      role: resolvedRole,
      customRoleId: memberCustomRole?.id || member.customRoleId,
      assignedZone: member.assignedZone,
      assignedZones: member.assignedZones,
      dest,
      maxConcurrentDevices: member.maxConcurrentDevices,
    });
  };

  const handleLogin = () => {
    if (isAuthenticating) return;
    const enteredUser = username.trim();
    const enteredPin = pin.trim();

    if (!enteredUser) {
      setErrorMessage('Please enter your Login ID / Username.');
      return;
    }

    if (!enteredPin) {
      setErrorMessage('Please enter your Security PIN.');
      return;
    }

    const normUser = enteredUser.toLowerCase();
    const compactNorm = normUser.replace(/\s+/g, '');
    const baseStaff = [...(staff || [])];
    for (const initS of INITIAL_STAFF) {
      if (!baseStaff.some((s) => s.id === initS.id)) {
        baseStaff.push(initS);
      }
    }
    const activeStaff = baseStaff.filter(
      (s) =>
        s.status !== 'Inactive' &&
        s.hasSystemAccess !== false &&
        Boolean(s.pin && s.pin.trim().length > 0)
    );

    // Check if user entered the name of an HR-only employee who has System Access = No
    const hrOnlyMatch = baseStaff.find((s) => {
      if (s.hasSystemAccess !== false && Boolean(s.pin && s.pin.trim().length > 0)) return false;
      const sName = s.name.trim().toLowerCase();
      const sCompactName = sName.replace(/\s+/g, '');
      return sName === normUser || sCompactName === compactNorm;
    });

    // 1. Exact match by unique Login ID (username), Staff ID, Full Name, or Phone
    const exactMatches = activeStaff.filter((s) => {
      const sUsername = (s.username || '').trim().toLowerCase();
      const sName = s.name.trim().toLowerCase();
      const sCompactName = sName.replace(/\s+/g, '');
      const sId = s.id.trim().toLowerCase();
      const sPhone = (s.phone || '').replace(/\D/g, '');
      const uPhone = enteredUser.replace(/\D/g, '');
      return (
        (sUsername && (sUsername === normUser || sUsername === compactNorm)) ||
        sId === normUser ||
        sName === normUser ||
        sCompactName === compactNorm ||
        (uPhone.length >= 7 && sPhone.endsWith(uPhone))
      );
    });

    if (exactMatches.length > 0) {
      // Strict per-account PIN verification (each ID + PIN is completely independent)
      const pinMatched = exactMatches.find((s) => s.pin === enteredPin);
      if (pinMatched) {
        completeStaffLogin(pinMatched);
        return;
      }
      setErrorMessage(`Incorrect PIN for ${exactMatches[0].name} (${exactMatches[0].username || exactMatches[0].id}).`);
      return;
    }

    if (hrOnlyMatch) {
      setErrorMessage(
        `"${hrOnlyMatch.name}" does not have System Login Access enabled. Enable System Access in Admin -> Staff & HR first.`
      );
      return;
    }

    // 2. Partial name match — ONLY succeeds if PIN matches a specific staff member (never guesses wrong user!)
    const partialMatches = activeStaff.filter((s) => {
      const sName = s.name.trim().toLowerCase();
      const words = sName.split(/\s+/);
      return words.includes(normUser) || sName.startsWith(normUser);
    });

    if (partialMatches.length > 0) {
      const pinMatched = partialMatches.find((s) => s.pin === enteredPin);
      if (pinMatched) {
        completeStaffLogin(pinMatched);
        return;
      }
      if (partialMatches.length > 1) {
        setErrorMessage(
          `Multiple accounts match "${enteredUser}". Please sign in with your exact Login ID (e.g. ordertaker1, ordertaker2) and PIN.`
        );
      } else {
        setErrorMessage(`Incorrect PIN for ${partialMatches[0].name}. Please try again.`);
      }
      return;
    }

    // 3. Custom role name match
    const matchedCustomRole = allRoles.find(
      (r) => !r.isSystem && r.name.trim().toLowerCase() === normUser
    );
    if (matchedCustomRole) {
      const roleMembers = activeStaff.filter(
        (s) =>
          s.customRoleId === matchedCustomRole.id ||
          s.role.toLowerCase() === matchedCustomRole.name.toLowerCase()
      );
      const pinMember = roleMembers.find((s) => s.pin === enteredPin);
      if (pinMember) {
        completeStaffLogin(pinMember);
        return;
      }
      setErrorMessage(`No active account with that PIN for ${matchedCustomRole.name}.`);
      return;
    }

    // 4. Standard role keyword match (e.g. "admin", "manager", "cashier", "waiter", "kitchen", "juicebar")
    const mappedRole = ROLE_ALIASES[normUser];
    if (mappedRole) {
      const isCashierKeyword = normUser === 'cashier' || normUser === 'pos';
      const roleMembers = activeStaff.filter((s) =>
        isCashierKeyword
          ? s.role.toLowerCase() === 'cashier' || s.customRoleId === 'role-cashier'
          : s.role.toLowerCase() === mappedRole.toLowerCase()
      );
      // Match strictly by the entered PIN among members of this role who have system access
      const pinMember = roleMembers.find((s) => s.pin === enteredPin);
      if (pinMember) {
        completeStaffLogin(pinMember);
        return;
      }
      setErrorMessage('Incorrect PIN or no system access enabled for this role. Sign in with your Login ID and PIN.');
      return;
    }

    setErrorMessage(`Account "${enteredUser}" not found. Enter a valid Login ID (e.g. master, admin, ordertaker1).`);
  };

  const dynamicMetrics = useMemo(() => {
    let logoWidth = 290;
    let logoHeight = 240;
    let logoSize: 'sm' | 'md' | 'lg' | 'xl' | 'hero' = 'hero';

    if (isCompactMobile) {
      logoWidth = 185;
      logoHeight = 155;
      logoSize = 'xl';
    } else if (isMobile) {
      logoWidth = 230;
      logoHeight = 195;
      logoSize = 'hero';
    } else if (height < 720) {
      logoWidth = 240;
      logoHeight = 200;
      logoSize = 'hero';
    } else {
      logoWidth = 290;
      logoHeight = 240;
      logoSize = 'hero';
    }

    return {
      logoWidth,
      logoHeight,
      logoSize,
    };
  }, [isCompactMobile, isMobile, height]);

  // Center-to-left glide offset for Desktop / Tablet (brand card: 440px)
  const centerShiftX = useMemo(() => {
    if (isMobile) return 0;
    const consoleInnerWidth = Math.min(width - (isCompactMobile ? 28 : 56), 1040);
    return Math.max(0, (consoleInnerWidth - 440) / 2);
  }, [width, isMobile, isCompactMobile]);

  const brandPodTranslateX = splitAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [centerShiftX, 0],
  });

  const welcomeActionsOpacity = splitAnim.interpolate({
    inputRange: [0, 0.35],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const welcomeActionsTranslateY = splitAnim.interpolate({
    inputRange: [0, 0.35],
    outputRange: [0, 14],
    extrapolate: 'clamp',
  });

  const rightLoginOpacity = splitAnim.interpolate({
    inputRange: [0.2, 1],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const rightLoginTranslateX = splitAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [isMobile ? 0 : 40, 0],
  });

  const rightLoginTranslateY = splitAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [isMobile ? 28 : 0, 0],
  });

  return (
    <IslamicBackground theme="burgundy" showCorners={true} showCenterLattice={true}>
      <StatusBar barStyle="light-content" />

      {/* ============================================================
          ROYAL-TECH ANIMATED SPLASH SCREEN
          ============================================================ */}
      {showSplash && (
        <Animated.View
          onTouchStart={finishSplash}
          style={[
            styles.splashOverlay,
            {
              opacity: splashFadeAnim,
            },
          ]}
        >
          <View style={styles.splashContent}>
            <SultanLogo
              size="hero"
              width={dynamicMetrics.logoWidth}
              height={dynamicMetrics.logoHeight}
              style={styles.logoDropShadow}
            />

            <View style={styles.splashTitleBox}>
              <Text style={styles.splashUrduCalligraphy}>سلطان ریسٹورنٹ</Text>
              <Text style={styles.splashEnglishTitle}>SULTAN RESTAURANT</Text>
              <Text style={styles.splashTagline}>ROYAL DINING  •  SMART POS OS</Text>
            </View>

            <View style={styles.splashProgressWrapper}>
              <View style={styles.splashProgressTrack}>
                <Animated.View
                  style={[
                    styles.splashProgressBar,
                    {
                      width: progressAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0%', '100%'],
                      }),
                    },
                  ]}
                />
              </View>
            </View>
          </View>
        </Animated.View>
      )}

      {/* ============================================================
          ROYAL-TECH COMMAND PORTAL (SEAMLESS SPLIT LOGIN)
          ============================================================ */}
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        {/* Top Floating Fullscreen & Server IP Sync Utility */}
        <View style={{ position: 'absolute', top: Platform.OS === 'web' ? 18 : 10, right: 18, zIndex: 100, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <SyncStatusBadge compact />
          <FullscreenButton variant="pill" />
        </View>

        <Animated.View
          style={[
            styles.animatedWelcomeContainer,
            {
              opacity: welcomeFadeAnim,
              transform: [{ translateY: welcomeSlideAnim }],
            },
          ]}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ flex: 1 }}
          >
            <ScrollView
              contentContainerStyle={[
                styles.scrollContent,
                {
                  paddingVertical: isShortScreen ? 14 : 26,
                  paddingHorizontal: isCompactMobile ? 14 : 28,
                },
              ]}
              showsVerticalScrollIndicator={false}
              bounces={true}
              keyboardShouldPersistTaps="handled"
            >
              <View
                style={[
                  styles.royalTechConsole,
                  isMobile && styles.royalTechConsoleMobile,
                ]}
              >
                {/* Main Dynamic Layout Body */}
                <View
                  style={[
                    styles.consoleBody,
                    !isMobile && isLoginActive && styles.consoleBodySplitDesktop,
                    isMobile && styles.consoleBodyMobile,
                  ]}
                >
                  {/* BRAND POD (Smoothly glides from Center to Left) */}
                  <Animated.View
                    style={[
                      styles.brandPod,
                      isMobile ? styles.brandPodMobile : styles.brandPodDesktop,
                      isMobile && isLoginActive && styles.brandPodMobileCompact,
                      {
                        transform: [{ translateX: brandPodTranslateX }],
                      },
                    ]}
                  >
                    {/* Top Gold Crown Accent */}
                    <View pointerEvents="none" style={styles.cardGoldCrown} />

                    {/* Terminal Badge Strip */}
                    {(!isMobile || !isLoginActive) && (
                      <View style={styles.terminalTopPill}>
                        <View style={styles.terminalPulseDot} />
                        <Text style={styles.terminalTopPillText}>SULTAN ROYAL POS OS</Text>
                      </View>
                    )}

                    <SultanLogo
                      size="hero"
                      width={isMobile && isLoginActive ? 140 : dynamicMetrics.logoWidth}
                      height={isMobile && isLoginActive ? 115 : dynamicMetrics.logoHeight}
                      style={styles.logoDropShadow}
                    />

                    <View style={styles.podDividerRow}>
                      <View style={styles.podDividerLine} />
                      <View style={styles.podDiamondDot} />
                      <View style={styles.podDividerLine} />
                    </View>

                    <Text style={styles.podSubcaption}>ROYAL FINE DINING & SMART POS</Text>

                    {/* Split-Login Left Card Showcase (fills space symmetrically beside login form on Desktop) */}
                    {!showWelcomeActions && !isMobile && (
                      <View style={styles.brandCapabilitiesBox}>
                        <View style={styles.capabilityItem}>
                          <Ionicons name="desktop-outline" size={14} color="#D5A943" />
                          <Text style={styles.capabilityText}>Billing & Table Ops</Text>
                        </View>
                        <View style={styles.capabilityItem}>
                          <Ionicons name="flame-outline" size={14} color="#D5A943" />
                          <Text style={styles.capabilityText}>Live KDS Kitchen</Text>
                        </View>
                        <View style={styles.capabilityItem}>
                          <Ionicons name="qr-code-outline" size={14} color="#D5A943" />
                          <Text style={styles.capabilityText}>Contactless QR Sync</Text>
                        </View>
                      </View>
                    )}

                    {/* Centered Welcome Mode Action Buttons */}
                    {showWelcomeActions && (
                      <Animated.View
                        pointerEvents={isLoginActive ? 'none' : 'auto'}
                        style={[
                          styles.welcomeHeroBlock,
                          {
                            opacity: welcomeActionsOpacity,
                            transform: [{ translateY: welcomeActionsTranslateY }],
                          },
                        ]}
                      >
                        {/* Active Session OR Welcome Actions */}
                        {hasHydrated && user?.role ? (
                          <View style={styles.sessionCard}>
                            <View style={styles.sessionUserRow}>
                              <View style={styles.sessionAvatar}>
                                <Ionicons name="person" size={18} color="#D5A943" />
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.sessionGreeting}>ACTIVE TERMINAL SESSION</Text>
                                <Text style={styles.sessionUserName}>{user.name || 'Staff'}</Text>
                              </View>
                              <View style={styles.sessionRolePill}>
                                <Text style={styles.sessionRoleText}>{user.role.toUpperCase()}</Text>
                              </View>
                            </View>

                            <TouchableOpacity
                              style={styles.primaryTechCardBtn}
                              onPress={() => {
                                const target = getRoleHome(user.role, user.customRoleId);
                                router.replace(target as any);
                              }}
                              activeOpacity={0.88}
                            >
                              <View style={styles.primaryBtnIconPod}>
                                <Ionicons name="grid" size={18} color="#D5A943" />
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.primaryBtnTitle}>LAUNCH DASHBOARD  •  ڈیش بورڈ</Text>
                                <Text style={styles.primaryBtnSub}>Continue to your active workspace</Text>
                              </View>
                              <Ionicons name="arrow-forward" size={19} color="#1A0306" />
                            </TouchableOpacity>

                            <View style={styles.sessionActionsRow}>
                              <TouchableOpacity
                                style={styles.textActionBtn}
                                onPress={openLogin}
                              >
                                <Ionicons name="swap-horizontal-outline" size={15} color="#D5A943" />
                                <Text style={styles.textActionLabel}>Switch Account</Text>
                              </TouchableOpacity>

                              <Text style={styles.sessionActionDivider}>•</Text>

                              <TouchableOpacity
                                style={styles.textActionBtn}
                                onPress={() => router.push('/menu' as any)}
                              >
                                <Ionicons name="book-outline" size={15} color="#D5A943" />
                                <Text style={styles.textActionLabel}>Digital Menu</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        ) : (
                          <View style={styles.actionCardsStack}>
                            {/* Primary Royal-Tech CTA: Staff Login (Triggers Split Animation) */}
                            <TouchableOpacity
                              style={styles.primaryTechCardBtn}
                              onPress={openLogin}
                              activeOpacity={0.88}
                            >
                              <View style={styles.primaryBtnIconPod}>
                                <Ionicons name="key" size={18} color="#D5A943" />
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.primaryBtnTitle}>STAFF PORTAL LOGIN  •  سٹاف لاگ ان</Text>
                                <Text style={styles.primaryBtnSub}>
                                  Sign in with Username & Security PIN
                                </Text>
                              </View>
                              <View style={styles.primaryArrowCircle}>
                                <Ionicons name="arrow-forward" size={17} color="#D5A943" />
                              </View>
                            </TouchableOpacity>

                            {/* Secondary Royal-Tech CTA: Guest Digital Menu */}
                            <TouchableOpacity
                              style={styles.secondaryTechCardBtn}
                              onPress={() => router.push('/menu' as any)}
                              activeOpacity={0.85}
                            >
                              <View style={styles.secondaryBtnIconPod}>
                                <Ionicons name="restaurant-outline" size={18} color="#D5A943" />
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.secondaryBtnTitle}>
                                  EXPLORE DIGITAL MENU  •  ڈیجیٹل مینو
                                </Text>
                                <Text style={styles.secondaryBtnSub}>
                                  Browse signature dishes & live table ordering
                                </Text>
                              </View>
                              <Ionicons name="chevron-forward" size={18} color="#D5A943" />
                            </TouchableOpacity>
                          </View>
                        )}
                      </Animated.View>
                    )}

                    {/* Subtle Footer Security Strip */}
                    {(!isMobile || !isLoginActive) && (
                      <View style={styles.brandFooterStrip}>
                        <Ionicons name="shield-checkmark-outline" size={13} color="rgba(213, 169, 67, 0.72)" />
                        <Text style={styles.brandFooterText}>
                          Encrypted Staff PIN Access • Local & Cloud Sync
                        </Text>
                      </View>
                    )}
                  </Animated.View>

                  {/* RIGHT SIDE: LOGIN FORM (Appears with smooth slide & fade upon clicking Login) */}
                  {(!isMobile || isLoginActive) && (
                    <Animated.View
                      pointerEvents={isLoginActive ? 'auto' : 'none'}
                      style={[
                        styles.rightLoginCol,
                        isMobile && styles.rightLoginColMobile,
                        {
                          opacity: rightLoginOpacity,
                          transform: [
                            { translateX: rightLoginTranslateX },
                            { translateY: rightLoginTranslateY },
                          ],
                        },
                      ]}
                    >
                      {/* Top Gold Crown Accent */}
                      <View pointerEvents="none" style={styles.cardGoldCrown} />

                      {/* Top Utility Bar with Back Button */}
                      <View style={styles.loginTopBar}>
                        <TouchableOpacity
                          style={styles.backBtn}
                          onPress={closeLogin}
                          activeOpacity={0.75}
                        >
                          <Ionicons name="arrow-back" size={16} color="#D5A943" />
                          <Text style={styles.backBtnText}>Back to Home</Text>
                        </TouchableOpacity>

                        <View style={styles.activeModePill}>
                          <View style={styles.activeDot} />
                          <Text style={styles.activeModeText}>TERMINAL ONLINE</Text>
                        </View>
                      </View>

                      {/* Title Header with Sultan Brand Logo */}
                      <View style={styles.loginHeader}>
                        <View style={{ alignItems: 'center', marginBottom: 12 }}>
                          <SultanLogo size="md" width={78} height={78} />
                        </View>
                        <View style={styles.loginTitleRow}>
                          <Text style={styles.loginTitle}>STAFF PORTAL LOGIN</Text>
                          <View style={styles.loginUrduPill}>
                            <Text style={styles.loginUrduPillText}>سٹاف لاگ ان</Text>
                          </View>
                        </View>
                        <Text style={styles.loginSub}>
                          Sign in using Staff Name, ID, Phone, or Role + 4-digit PIN
                        </Text>
                      </View>

                      {/* Error Banner */}
                      {errorMessage.length > 0 && (
                        <View style={styles.errorBanner}>
                          <Ionicons name="alert-circle" size={18} color="#FF6B6B" />
                          <Text style={styles.errorText}>{errorMessage}</Text>
                        </View>
                      )}

                      {/* Username Input */}
                      <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>Username / Staff Name / Role (یوزر نیم)</Text>
                        <View
                          style={[
                            styles.inputWrapper,
                            focusedField === 'username' && styles.inputWrapperFocused,
                          ]}
                        >
                          <Ionicons
                            name="person-outline"
                            size={19}
                            color={focusedField === 'username' ? '#F3D179' : '#D5A943'}
                            style={styles.fieldIcon}
                          />
                          <TextInput
                            style={styles.input}
                            placeholder="e.g. master, admin, ordertaker1, ordertaker2, cashier1..."
                            placeholderTextColor="rgba(255,255,255,0.38)"
                            autoCapitalize="none"
                            autoCorrect={false}
                            value={username}
                            onFocus={() => setFocusedField('username')}
                            onBlur={() => setFocusedField((prev) => (prev === 'username' ? null : prev))}
                            onChangeText={(val) => {
                              setUsername(val);
                              if (errorMessage) setErrorMessage('');
                            }}
                            onSubmitEditing={() => pinInputRef.current?.focus()}
                            returnKeyType="next"
                          />
                          {username.length > 0 && (
                            <TouchableOpacity onPress={() => setUsername('')} style={styles.clearFieldBtn}>
                              <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.45)" />
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>

                      {/* PIN Input */}
                      <View style={styles.inputGroup}>
                        <View style={styles.pinLabelRow}>
                          <Text style={styles.inputLabel}>Security PIN (سیکیورٹی پن)</Text>
                          <View style={styles.pinToolsRow}>
                            <TouchableOpacity
                              style={[
                                styles.pinToolChip,
                                showTouchKeypad && styles.pinToolChipActive,
                              ]}
                              onPress={() => setShowTouchKeypad((v) => !v)}
                            >
                              <Ionicons
                                name="keypad-outline"
                                size={13}
                                color={showTouchKeypad ? '#1A0306' : '#D5A943'}
                              />
                              <Text
                                style={[
                                  styles.pinToolChipText,
                                  showTouchKeypad && styles.pinToolChipTextActive,
                                ]}
                              >
                                Keypad
                              </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={styles.pinToolChip}
                              onPress={() => setShowPin(!showPin)}
                            >
                              <Ionicons
                                name={showPin ? 'eye-off-outline' : 'eye-outline'}
                                size={13}
                                color="#D5A943"
                              />
                              <Text style={styles.pinToolChipText}>
                                {showPin ? 'Hide' : 'Show'}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        </View>

                        <View
                          style={[
                            styles.inputWrapper,
                            focusedField === 'pin' && styles.inputWrapperFocused,
                          ]}
                        >
                          <Ionicons
                            name="key-outline"
                            size={19}
                            color={focusedField === 'pin' ? '#F3D179' : '#D5A943'}
                            style={styles.fieldIcon}
                          />
                          <TextInput
                            ref={pinInputRef}
                            style={[styles.input, styles.pinInput]}
                            placeholder="••••"
                            placeholderTextColor="rgba(255,255,255,0.38)"
                            secureTextEntry={!showPin}
                            keyboardType="number-pad"
                            maxLength={8}
                            value={pin}
                            onFocus={() => setFocusedField('pin')}
                            onBlur={() => setFocusedField((prev) => (prev === 'pin' ? null : prev))}
                            onChangeText={(val) => {
                              setPin(val);
                              if (errorMessage) setErrorMessage('');
                            }}
                            onSubmitEditing={handleLogin}
                            returnKeyType="go"
                          />
                          {pin.length > 0 && (
                            <TouchableOpacity onPress={() => setPin('')} style={styles.clearFieldBtn}>
                              <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.45)" />
                            </TouchableOpacity>
                          )}
                        </View>

                        {/* Optional Touch Keypad for POS Touch Monitors & Tablets */}
                        {showTouchKeypad && (
                          <View style={styles.keypadGrid}>
                            {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'CLR', '0', 'DEL'].map((key) => {
                              const isAction = key === 'CLR' || key === 'DEL';
                              return (
                                <TouchableOpacity
                                  key={key}
                                  style={[styles.keypadKey, isAction && styles.keypadKeyAction]}
                                  onPress={() => handleKeypadKey(key)}
                                  activeOpacity={0.7}
                                >
                                  {key === 'DEL' ? (
                                    <Ionicons name="backspace-outline" size={18} color="#F3D179" />
                                  ) : (
                                    <Text style={[styles.keypadKeyText, isAction && styles.keypadKeyTextAction]}>
                                      {key}
                                    </Text>
                                  )}
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        )}
                      </View>

                      {/* Sign In Action Button */}
                      <TouchableOpacity
                        style={[
                          styles.signInBtn,
                          (!username.trim() || !pin.trim()) && styles.signInBtnDisabled,
                        ]}
                        onPress={handleLogin}
                        disabled={!username.trim() || !pin.trim()}
                        activeOpacity={0.88}
                      >
                        <Ionicons name="log-in-outline" size={20} color="#1A0306" />
                        <Text style={styles.signInBtnText}>SIGN IN  •  لاگ ان کریں</Text>
                      </TouchableOpacity>
                    </Animated.View>
                  )}
                </View>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </Animated.View>
      </SafeAreaView>
    </IslamicBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  animatedWelcomeContainer: {
    flex: 1,
  },

  /* ------------------------------------------------------------
     ROYAL-TECH SPLASH OVERLAY
     ------------------------------------------------------------ */
  splashOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(18, 3, 6, 0.97)',
    zIndex: 9999,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  splashContent: {
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: 420,
    width: '100%',
  },
  splashTitleBox: {
    alignItems: 'center',
    marginTop: 12,
  },
  splashUrduCalligraphy: {
    fontSize: 32,
    fontWeight: '900',
    color: '#D5A943',
    textAlign: 'center',
    letterSpacing: 1,
    marginBottom: 4,
  },
  splashEnglishTitle: {
    fontSize: 21,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 3,
    textAlign: 'center',
  },
  splashTagline: {
    fontSize: 11,
    color: 'rgba(213, 169, 67, 0.8)',
    letterSpacing: 2,
    marginTop: 6,
    textAlign: 'center',
    fontWeight: '800',
  },
  splashProgressWrapper: {
    width: 220,
    marginTop: 28,
    alignItems: 'center',
  },
  splashProgressTrack: {
    width: '100%',
    height: 3.5,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  splashProgressBar: {
    height: '100%',
    backgroundColor: '#D5A943',
    borderRadius: 4,
  },

  /* ------------------------------------------------------------
     ROYAL-TECH COMMAND CONSOLE
     ------------------------------------------------------------ */
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  royalTechConsole: {
    width: '100%',
    maxWidth: 1040,
    position: 'relative',
  },
  royalTechConsoleMobile: {
    width: '100%',
  },

  /* MAIN SPLIT BODY */
  consoleBody: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 28,
    width: '100%',
  },
  consoleBodySplitDesktop: {
    alignItems: 'stretch',
  },
  consoleBodyMobile: {
    flexDirection: 'column',
    gap: 16,
  },

  /* SHARED CARD CROWN ACCENT */
  cardGoldCrown: {
    position: 'absolute',
    top: 0,
    alignSelf: 'center',
    width: 140,
    height: 3,
    backgroundColor: '#D5A943',
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
  },

  /* BRAND POD */
  brandPod: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(12, 2, 5, 0.80)',
    borderWidth: 1.2,
    borderColor: 'rgba(213, 169, 67, 0.42)',
    borderRadius: 24,
    paddingVertical: 28,
    paddingHorizontal: 26,
    position: 'relative',
    overflow: 'hidden',
    ...Platform.select({
      web: {
        backdropFilter: 'blur(22px) saturate(160%)',
        WebkitBackdropFilter: 'blur(22px) saturate(160%)',
        boxShadow: '0 22px 54px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.12)',
      } as any,
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.45,
        shadowRadius: 20,
        elevation: 8,
      },
    }),
  },
  brandPodDesktop: {
    width: 440,
  },
  brandPodMobile: {
    width: '100%',
    paddingVertical: 22,
    paddingHorizontal: 18,
  },
  brandPodMobileCompact: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  terminalTopPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(213, 169, 67, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(213, 169, 67, 0.28)',
    paddingHorizontal: 11,
    paddingVertical: 4,
    borderRadius: 999,
    marginBottom: 8,
  },
  terminalPulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  terminalTopPillText: {
    color: '#F3D179',
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  logoDropShadow: {
    ...Platform.select({
      web: {
        filter: 'drop-shadow(0px 8px 22px rgba(213, 169, 67, 0.4))',
      } as any,
    }),
  },
  podDividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 120,
    marginVertical: 8,
    gap: 8,
  },
  podDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(213, 169, 67, 0.4)',
  },
  podDiamondDot: {
    width: 5,
    height: 5,
    backgroundColor: '#D5A943',
    transform: [{ rotate: '45deg' }],
  },
  podSubcaption: {
    color: 'rgba(243, 209, 121, 0.85)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.8,
    textAlign: 'center',
  },
  brandCapabilitiesBox: {
    width: '100%',
    marginTop: 22,
    gap: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(213, 169, 67, 0.2)',
    borderRadius: 14,
    padding: 12,
  },
  capabilityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  capabilityText: {
    color: 'rgba(255, 255, 255, 0.82)',
    fontSize: 12,
    fontWeight: '600',
  },
  brandFooterStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 18,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(213, 169, 67, 0.14)',
    width: '100%',
  },
  brandFooterText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 10.5,
    fontWeight: '600',
    letterSpacing: 0.3,
  },

  welcomeHeroBlock: {
    width: '100%',
    alignItems: 'center',
    marginTop: 16,
    gap: 14,
  },

  /* RIGHT SPLIT LOGIN COLUMN */
  rightLoginCol: {
    flex: 1,
    width: '100%',
    backgroundColor: 'rgba(12, 2, 5, 0.82)',
    borderWidth: 1.2,
    borderColor: 'rgba(213, 169, 67, 0.42)',
    borderRadius: 24,
    padding: 28,
    gap: 16,
    position: 'relative',
    overflow: 'hidden',
    justifyContent: 'center',
    ...Platform.select({
      web: {
        backdropFilter: 'blur(22px) saturate(160%)',
        WebkitBackdropFilter: 'blur(22px) saturate(160%)',
        boxShadow: '0 22px 54px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.12)',
      } as any,
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.45,
        shadowRadius: 20,
        elevation: 8,
      },
    }),
  },
  rightLoginColMobile: {
    width: '100%',
    padding: 18,
    gap: 14,
    borderRadius: 20,
  },
  loginTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(213, 169, 67, 0.16)',
    flexWrap: 'wrap',
    gap: 8,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(213, 169, 67, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(213, 169, 67, 0.32)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  backBtnText: {
    color: '#F3D179',
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  activeModePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  activeModeText: {
    color: '#6EE7B7',
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.8,
  },

  loginHeader: {
    gap: 5,
  },
  loginTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  loginTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  loginUrduPill: {
    backgroundColor: 'rgba(213, 169, 67, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(213, 169, 67, 0.35)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
  },
  loginUrduPillText: {
    color: '#F3D179',
    fontSize: 12,
    fontWeight: '800',
  },
  loginSub: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 12.5,
    fontWeight: '500',
  },

  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.4)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    gap: 8,
  },
  errorText: {
    color: '#FCA5A5',
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },

  inputGroup: {
    gap: 7,
  },
  inputLabel: {
    color: 'rgba(255, 255, 255, 0.86)',
    fontSize: 11.5,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  pinLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  pinToolsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pinToolChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: 'rgba(213, 169, 67, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(213, 169, 67, 0.28)',
  },
  pinToolChipActive: {
    backgroundColor: '#D5A943',
    borderColor: '#D5A943',
  },
  pinToolChipText: {
    color: '#D5A943',
    fontSize: 11,
    fontWeight: '700',
  },
  pinToolChipTextActive: {
    color: '#1A0306',
    fontWeight: '800',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.48)',
    borderWidth: 1.3,
    borderColor: 'rgba(213, 169, 67, 0.28)',
    borderRadius: 13,
    paddingHorizontal: 13,
    height: 50,
  },
  inputWrapperFocused: {
    borderColor: '#D5A943',
    backgroundColor: 'rgba(213, 169, 67, 0.08)',
  },
  fieldIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    height: '100%',
    ...Platform.select({
      web: {
        outlineStyle: 'none',
      } as any,
    }),
  },
  pinInput: {
    letterSpacing: 5,
    fontSize: 18,
  },
  clearFieldBtn: {
    padding: 4,
  },

  keypadGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    borderWidth: 1,
    borderColor: 'rgba(213, 169, 67, 0.22)',
    borderRadius: 14,
    padding: 10,
  },
  keypadKey: {
    width: '31.5%',
    flexGrow: 1,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(213, 169, 67, 0.24)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  keypadKeyAction: {
    backgroundColor: 'rgba(213, 169, 67, 0.14)',
    borderColor: 'rgba(213, 169, 67, 0.36)',
  },
  keypadKeyText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  keypadKeyTextAction: {
    color: '#F3D179',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.6,
  },

  signInBtn: {
    backgroundColor: '#D5A943',
    height: 50,
    borderRadius: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
    ...Platform.select({
      web: {
        boxShadow: '0 8px 22px rgba(213, 169, 67, 0.32)',
      } as any,
    }),
  },
  signInBtnDisabled: {
    opacity: 0.45,
    ...Platform.select({
      web: {
        boxShadow: 'none',
      } as any,
    }),
  },
  signInBtnText: {
    color: '#1A0306',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.7,
  },

  /* ACTION CARDS STACK */
  actionCardsStack: {
    width: '100%',
    maxWidth: 480,
    gap: 11,
    marginTop: 4,
  },
  primaryTechCardBtn: {
    backgroundColor: '#D5A943',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    ...Platform.select({
      web: {
        boxShadow: '0 10px 24px rgba(213, 169, 67, 0.25)',
      } as any,
    }),
  },
  primaryBtnIconPod: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#1E0407',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnTitle: {
    color: '#1A0306',
    fontSize: 13.5,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  primaryBtnSub: {
    color: 'rgba(26, 3, 6, 0.75)',
    fontSize: 11.5,
    fontWeight: '700',
    marginTop: 2,
  },
  primaryArrowCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1E0407',
    alignItems: 'center',
    justifyContent: 'center',
  },

  secondaryTechCardBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1.2,
    borderColor: 'rgba(213, 169, 67, 0.38)',
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  secondaryBtnIconPod: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: 'rgba(213, 169, 67, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(213, 169, 67, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnTitle: {
    color: '#F3D179',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  secondaryBtnSub: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 11.5,
    fontWeight: '500',
    marginTop: 2,
  },

  /* ACTIVE SESSION CARD */
  sessionCard: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(213, 169, 67, 0.35)',
    borderRadius: 16,
    padding: 16,
    gap: 14,
  },
  sessionUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sessionAvatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(213, 169, 67, 0.14)',
    borderWidth: 1,
    borderColor: '#D5A943',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sessionGreeting: {
    color: 'rgba(255, 255, 255, 0.55)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  sessionUserName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  sessionRolePill: {
    backgroundColor: 'rgba(213, 169, 67, 0.16)',
    borderWidth: 1,
    borderColor: '#D5A943',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  sessionRoleText: {
    color: '#F3D179',
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  sessionActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingTop: 2,
  },
  textActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 4,
  },
  textActionLabel: {
    color: '#F3D179',
    fontSize: 12,
    fontWeight: '700',
  },
  sessionActionDivider: {
    color: 'rgba(255, 255, 255, 0.3)',
  },
});
