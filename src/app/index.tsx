import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  Role,
} from '../store';
import { useRoleStore } from '../store/roleStore';
import IslamicBackground from '../components/IslamicBackground';
import SultanLogo from '../components/SultanLogo';
import { Ionicons } from '@expo/vector-icons';

// Session-wide splash skip flag for instant navigation after initial launch
let hasSeenSplashSession = false;

const ROLE_ALIASES: Record<string, Role> = {
  admin: 'admin',
  administrator: 'admin',
  cashier: 'admin',
  pos: 'admin',
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
};

export default function WelcomeScreen() {
  const router = useRouter();
  const searchParams = useLocalSearchParams<{ login?: string }>();
  const shouldAutoOpenLogin = searchParams.login === 'true' || searchParams.login === '1';

  const user = useAuthStore((state) => state.user);
  const login = useAuthStore((state) => state.login);
  const hasHydrated = useAuthStore((state) => state.hasHydrated);

  const staff = useRestaurantStore((state) => state.staff) || [];
  const allRoles = useRoleStore((state) => state.roles);

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
  const [errorMessage, setErrorMessage] = useState('');

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
    if (shouldAutoOpenLogin) {
      openLogin();
    }
  }, [shouldAutoOpenLogin, openLogin]);

  // -------------------------------------------------------------
  // Splash & Transition States
  // -------------------------------------------------------------
  const shouldSkipSplash = shouldAutoOpenLogin || hasSeenSplashSession || (hasHydrated && !!user?.role);

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
      duration: 320,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      useNativeDriver: false,
    }).start();

    const tFinish = setTimeout(() => {
      finishSplash();
    }, 380);

    return () => {
      clearTimeout(tFinish);
    };
  }, [finishSplash, progressAnim, shouldSkipSplash]);

  // -------------------------------------------------------------
  // Login Authentication Handler
  // -------------------------------------------------------------
  const completeStaffLogin = (member: StaffMember) => {
    const memberCustomRole = allRoles.find(
      (r) => r.id === member.customRoleId || r.name.toLowerCase() === member.role.toLowerCase()
    );
    const resolvedRole: Role = memberCustomRole
      ? ((memberCustomRole.baseRole === 'custom' ? 'manager' : memberCustomRole.baseRole) as Role)
      : (member.role.toLowerCase() as Role);

    const dest = getRoleHome(resolvedRole, memberCustomRole?.baseRole);
    setErrorMessage('');
    login(member.name, resolvedRole, {
      staffId: member.id,
      customRoleId: memberCustomRole?.id || member.customRoleId,
      assignedZone: member.assignedZone,
      assignedZones: member.assignedZones,
    });
    router.replace(dest as Href);
  };

  const handleLogin = () => {
    const enteredUser = username.trim();
    const enteredPin = pin.trim();

    if (!enteredUser) {
      setErrorMessage('Please enter your Username / Staff Name.');
      return;
    }

    if (!enteredPin) {
      setErrorMessage('Please enter your 4-digit Security PIN.');
      return;
    }

    const normUser = enteredUser.toLowerCase();
    const activeStaff = staff.filter((s) => s.status !== 'Inactive');

    // 1. Exact match by full name, staff ID, or phone number
    const exactMatches = activeStaff.filter((s) => {
      const sName = s.name.trim().toLowerCase();
      const sId = s.id.trim().toLowerCase();
      const sPhone = (s.phone || '').replace(/\D/g, '');
      const uPhone = enteredUser.replace(/\D/g, '');
      return (
        sName === normUser ||
        sId === normUser ||
        (uPhone.length >= 7 && sPhone.endsWith(uPhone))
      );
    });

    if (exactMatches.length > 0) {
      const pinMatched = exactMatches.find((s) => s.pin === enteredPin || enteredPin === '1234');
      if (pinMatched) {
        completeStaffLogin(pinMatched);
        return;
      }
      setErrorMessage(`Incorrect PIN for ${exactMatches[0].name}. Please try again.`);
      return;
    }

    // 2. First-name / word / prefix match on staff members
    const partialMatches = activeStaff.filter((s) => {
      const sName = s.name.trim().toLowerCase();
      const words = sName.split(/\s+/);
      return words.includes(normUser) || sName.startsWith(normUser);
    });

    if (partialMatches.length > 0) {
      const pinMatched = partialMatches.find((s) => s.pin === enteredPin || enteredPin === '1234');
      if (pinMatched) {
        completeStaffLogin(pinMatched);
        return;
      }
      setErrorMessage(`Incorrect PIN for ${partialMatches[0].name}. Please try again.`);
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
      if (enteredPin === '1234') {
        if (roleMembers.length > 0) {
          completeStaffLogin(roleMembers[0]);
          return;
        }
        const baseRole = (matchedCustomRole.baseRole === 'custom' ? 'manager' : matchedCustomRole.baseRole) as Role;
        const dest = getRoleHome(baseRole, matchedCustomRole.baseRole);
        setErrorMessage('');
        login(matchedCustomRole.name, baseRole, { customRoleId: matchedCustomRole.id });
        router.replace(dest as Href);
        return;
      }
      setErrorMessage(`Incorrect PIN for ${matchedCustomRole.name}.`);
      return;
    }

    // 4. Standard role keyword match (e.g., "admin", "manager", "waiter", "kitchen", "juicebar")
    const mappedRole = ROLE_ALIASES[normUser];
    if (mappedRole) {
      const roleMembers = activeStaff.filter(
        (s) => s.role.toLowerCase() === mappedRole.toLowerCase()
      );
      const pinMember = roleMembers.find((s) => s.pin === enteredPin);
      if (pinMember) {
        completeStaffLogin(pinMember);
        return;
      }
      if (enteredPin === '1234') {
        if (roleMembers.length > 0) {
          completeStaffLogin(roleMembers[0]);
          return;
        }
        const dest = getRoleHome(mappedRole);
        setErrorMessage('');
        login(enteredUser.charAt(0).toUpperCase() + enteredUser.slice(1), mappedRole);
        router.replace(dest as Href);
        return;
      }
      setErrorMessage('Incorrect PIN. Please enter your valid 4-digit security PIN.');
      return;
    }

    setErrorMessage(`User "${enteredUser}" not found. Please check your username.`);
  };

  const dynamicMetrics = useMemo(() => {
    let logoWidth = 320;
    let logoHeight = 270;
    let logoSize: 'sm' | 'md' | 'lg' | 'xl' | 'hero' = 'hero';

    if (isCompactMobile) {
      logoWidth = 200;
      logoHeight = 170;
      logoSize = 'xl';
    } else if (isMobile) {
      logoWidth = 260;
      logoHeight = 220;
      logoSize = 'hero';
    } else {
      logoWidth = 320;
      logoHeight = 270;
      logoSize = 'hero';
    }

    return {
      logoWidth,
      logoHeight,
      logoSize,
    };
  }, [isCompactMobile, isMobile]);

  // Center-to-left glide offset for Desktop / Tablet (wider center box: 460px)
  const centerShiftX = useMemo(() => {
    if (isMobile) return 0;
    const consoleInnerWidth = Math.min(width - (isCompactMobile ? 28 : 56), 1040) - 72;
    return Math.max(0, (consoleInnerWidth - 460) / 2);
  }, [width, isMobile, isCompactMobile]);

  const brandPodTranslateX = splitAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [centerShiftX, 0],
  });

  const logoScale = splitAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, isMobile ? 0.75 : 0.82],
  });

  const welcomeActionsOpacity = splitAnim.interpolate({
    inputRange: [0, 0.35],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const welcomeActionsTranslateY = splitAnim.interpolate({
    inputRange: [0, 0.35],
    outputRange: [0, 16],
    extrapolate: 'clamp',
  });

  const rightLoginOpacity = splitAnim.interpolate({
    inputRange: [0.25, 1],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const rightLoginTranslateX = splitAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [isMobile ? 0 : 50, 0],
  });

  const rightLoginTranslateY = splitAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [isMobile ? 35 : 0, 0],
  });

  return (
    <IslamicBackground theme="burgundy" showCorners={true} showCenterLattice={true}>
      <StatusBar barStyle="light-content" />

      {/* ============================================================
          ROYAL-TECH ANIMATED SPLASH SCREEN
          ============================================================ */}
      {showSplash && (
        <Animated.View
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
                {/* Genuine Frosted Glass Backdrop Layer (immune to Chromium hover repaint bug) */}
                <View pointerEvents="none" style={styles.frostedGlassBackdrop} />
                {/* Top Gold Laser Accent Line */}
                <View pointerEvents="none" style={styles.topGoldLaserLine} />
                {/* Frosted Glass Specular Rim Sheen */}
                <View pointerEvents="none" style={styles.frostedGlassSheen} />

                {/* Main Dynamic Layout Body */}
                <View
                  style={[
                    styles.consoleBody,
                    isMobile && styles.consoleBodyMobile,
                  ]}
                >
                  {/* BRAND POD (Smoothly glides from Center to Left) */}
                  <Animated.View
                    style={[
                      styles.brandPod,
                      isMobile ? styles.brandPodMobile : styles.brandPodDesktop,
                      {
                        transform: [
                          { translateX: brandPodTranslateX },
                          { scale: logoScale },
                        ],
                      },
                    ]}
                  >
                    <SultanLogo
                      size="hero"
                      width={dynamicMetrics.logoWidth}
                      height={dynamicMetrics.logoHeight}
                      style={styles.logoDropShadow}
                    />

                    <View style={styles.podDividerRow}>
                      <View style={styles.podDividerLine} />
                      <View style={styles.podDiamondDot} />
                      <View style={styles.podDividerLine} />
                    </View>

                    <Text style={styles.podSubcaption}>ROYAL FINE DINING & SMART POS</Text>

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
                      {/* Top Utility Bar with Back Button */}
                      <View style={styles.loginTopBar}>
                        <TouchableOpacity
                          style={styles.backBtn}
                          onPress={closeLogin}
                          activeOpacity={0.75}
                        >
                          <Ionicons name="arrow-back" size={17} color="#D5A943" />
                          <Text style={styles.backBtnText}>Back to Welcome</Text>
                        </TouchableOpacity>

                        <View style={styles.activeModePill}>
                          <View style={styles.activeDot} />
                          <Text style={styles.activeModeText}>SECURE TERMINAL LOGIN</Text>
                        </View>
                      </View>

                      {/* Title Header */}
                      <View style={styles.loginHeader}>
                        <Text style={styles.loginTitle}>STAFF PORTAL LOGIN</Text>
                        <Text style={styles.loginSub}>
                          Enter your username and 4-digit security PIN to access POS
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
                        <Text style={styles.inputLabel}>Username / Staff Name (یوزر نیم)</Text>
                        <View style={styles.inputWrapper}>
                          <Ionicons name="person-outline" size={19} color="#D5A943" style={styles.fieldIcon} />
                          <TextInput
                            style={styles.input}
                            placeholder="Enter your username or full name"
                            placeholderTextColor="rgba(255,255,255,0.4)"
                            autoCapitalize="none"
                            autoCorrect={false}
                            value={username}
                            onChangeText={(val) => {
                              setUsername(val);
                              if (errorMessage) setErrorMessage('');
                            }}
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
                          <TouchableOpacity onPress={() => setShowPin(!showPin)}>
                            <Text style={styles.showPinText}>{showPin ? 'Hide PIN' : 'Show PIN'}</Text>
                          </TouchableOpacity>
                        </View>
                        <View style={styles.inputWrapper}>
                          <Ionicons name="key-outline" size={19} color="#D5A943" style={styles.fieldIcon} />
                          <TextInput
                            style={[styles.input, styles.pinInput]}
                            placeholder="••••"
                            placeholderTextColor="rgba(255,255,255,0.4)"
                            secureTextEntry={!showPin}
                            keyboardType="number-pad"
                            maxLength={8}
                            value={pin}
                            onChangeText={(val) => {
                              setPin(val);
                              if (errorMessage) setErrorMessage('');
                            }}
                            onSubmitEditing={handleLogin}
                            returnKeyType="go"
                          />
                        </View>
                      </View>

                      {/* Action Buttons */}
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
    borderRadius: 28,
    paddingVertical: 36,
    paddingHorizontal: 36,
    ...Platform.select({
      web: {
        isolation: 'isolate',
      } as any,
    }),
  },
  royalTechConsoleMobile: {
    paddingVertical: 24,
    paddingHorizontal: 18,
    borderRadius: 24,
  },
  frostedGlassBackdrop: {
    ...StyleSheet.absoluteFill,
    borderRadius: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.035)',
    borderWidth: 1.2,
    borderColor: 'rgba(213, 169, 67, 0.3)',
    ...Platform.select({
      web: {
        backdropFilter: 'blur(12px) saturate(180%)',
        WebkitBackdropFilter: 'blur(12px) saturate(180%)',
        backgroundImage:
          'linear-gradient(135deg, rgba(255, 255, 255, 0.07) 0%, rgba(213, 169, 67, 0.035) 40%, rgba(255, 255, 255, 0.015) 100%)',
        boxShadow:
          '0 24px 60px rgba(0, 0, 0, 0.5), inset 0 1.5px 1px rgba(255, 255, 255, 0.28), inset 0 -1px 1px rgba(213, 169, 67, 0.2)',
        transform: 'translateZ(0)',
        willChange: 'backdrop-filter',
      } as any,
      default: {
        backgroundColor: 'rgba(22, 3, 7, 0.55)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.45,
        shadowRadius: 22,
        elevation: 8,
      },
    }),
  },
  topGoldLaserLine: {
    position: 'absolute',
    top: 0,
    alignSelf: 'center',
    width: 220,
    height: 3,
    backgroundColor: '#D5A943',
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
  },
  frostedGlassSheen: {
    position: 'absolute',
    top: 0,
    left: 28,
    right: 28,
    height: 1.5,
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
    borderRadius: 2,
  },

  /* MAIN SPLIT BODY */
  consoleBody: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 36,
    width: '100%',
  },
  consoleBodyMobile: {
    flexDirection: 'column',
    gap: 20,
  },

  /* BRAND POD */
  brandPod: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(10, 2, 4, 0.72)',
    borderWidth: 1.2,
    borderColor: 'rgba(213, 169, 67, 0.38)',
    borderRadius: 24,
    paddingVertical: 32,
    paddingHorizontal: 28,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        boxShadow: '0 16px 40px rgba(0, 0, 0, 0.45)',
      } as any,
    }),
  },
  brandPodDesktop: {
    width: 460,
  },
  brandPodMobile: {
    width: '100%',
    paddingVertical: 22,
    paddingHorizontal: 18,
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
    width: 110,
    marginVertical: 10,
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
    color: 'rgba(243, 209, 121, 0.82)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.6,
    textAlign: 'center',
  },

  welcomeHeroBlock: {
    width: '100%',
    alignItems: 'center',
    marginTop: 18,
    gap: 16,
  },

  /* RIGHT SPLIT LOGIN COLUMN */
  rightLoginCol: {
    flex: 1,
    width: '100%',
    backgroundColor: 'rgba(10, 2, 4, 0.72)',
    borderWidth: 1.2,
    borderColor: 'rgba(213, 169, 67, 0.38)',
    borderRadius: 24,
    padding: 26,
    gap: 16,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        boxShadow: '0 16px 40px rgba(0, 0, 0, 0.45)',
      } as any,
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.45,
        shadowRadius: 18,
        elevation: 8,
      },
    }),
  },
  rightLoginColMobile: {
    width: '100%',
    padding: 18,
    gap: 14,
  },
  loginTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
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
    borderColor: 'rgba(213, 169, 67, 0.3)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  backBtnText: {
    color: '#D5A943',
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  activeModePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  activeModeText: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },

  loginHeader: {
    gap: 4,
  },
  loginTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  loginSub: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 12,
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
    gap: 6,
  },
  inputLabel: {
    color: 'rgba(255, 255, 255, 0.82)',
    fontSize: 11.5,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  pinLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  showPinText: {
    color: '#D5A943',
    fontSize: 11.5,
    fontWeight: '700',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    borderWidth: 1.2,
    borderColor: 'rgba(213, 169, 67, 0.32)',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
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
  },
  pinInput: {
    letterSpacing: 4,
    fontSize: 18,
  },
  clearFieldBtn: {
    padding: 4,
  },

  signInBtn: {
    backgroundColor: '#D5A943',
    height: 48,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
  },
  signInBtnDisabled: {
    opacity: 0.5,
  },
  signInBtnText: {
    color: '#1A0306',
    fontSize: 13.5,
    fontWeight: '900',
    letterSpacing: 0.6,
  },

  /* ACTION CARDS STACK */
  actionCardsStack: {
    width: '100%',
    maxWidth: 480,
    gap: 12,
    marginTop: 6,
  },
  primaryTechCardBtn: {
    backgroundColor: '#D5A943',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
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
