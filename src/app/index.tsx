import React, { useEffect, useMemo, useRef, useState } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link, useRouter } from 'expo-router';
import { useAuthStore, ROLE_HOME, getRoleHome } from '../store';
import IslamicBackground from '../components/IslamicBackground';
import SultanLogo from '../components/SultanLogo';
import { Ionicons } from '@expo/vector-icons';

// Session-wide splash skip flag for instant navigation
let hasSeenSplashSession = false;

export default function WelcomeScreen() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const { width, height } = useWindowDimensions();

  // Screen classification for responsiveness
  const isCompactMobile = width < 420;
  const isMobile = width < 860;
  const isShortScreen = height < 720;

  // -------------------------------------------------------------
  // Splash & Transition States (Instant if already visited in session)
  // -------------------------------------------------------------
  const [showSplash, setShowSplash] = useState(() => !hasSeenSplashSession);
  const [splashStatusIndex, setSplashStatusIndex] = useState(3);

  const splashMessages = [
    'Initializing Royal Dining Suite...',
    'Connecting Realtime Multi-Floor Hub...',
    'Loading Sultan POS & Kitchen KDS...',
    'Welcome to Sultan Restaurant ✨',
  ];

  // Animation values
  const splashFadeAnim = useRef(new Animated.Value(hasSeenSplashSession ? 0 : 1)).current;
  const splashScaleAnim = useRef(new Animated.Value(1)).current;
  const splashPulseAnim = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(new Animated.Value(hasSeenSplashSession ? 1 : 0)).current;
  const welcomeFadeAnim = useRef(new Animated.Value(hasSeenSplashSession ? 1 : 0)).current;
  const welcomeSlideAnim = useRef(new Animated.Value(hasSeenSplashSession ? 0 : 12)).current;

  // -------------------------------------------------------------
  // Splash Lifecycle & Lightning Fast Animation Sequence
  // -------------------------------------------------------------
  useEffect(() => {
    if (hasSeenSplashSession) {
      setShowSplash(false);
      return;
    }

    // Fast linear progress bar (350ms)
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: 350,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      useNativeDriver: false,
    }).start();

    // Fast status stepper
    const t1 = setTimeout(() => setSplashStatusIndex(2), 120);
    const t2 = setTimeout(() => setSplashStatusIndex(3), 240);

    // Fast transition from Splash to Welcome Screen
    const tFinish = setTimeout(() => {
      finishSplash();
    }, 400);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(tFinish);
    };
  }, []);

  const finishSplash = () => {
    hasSeenSplashSession = true;
    Animated.timing(splashFadeAnim, {
      toValue: 0,
      duration: 180,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start(() => {
      setShowSplash(false);
      Animated.parallel([
        Animated.timing(welcomeFadeAnim, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.spring(welcomeSlideAnim, {
          toValue: 0,
          friction: 8,
          tension: 50,
          useNativeDriver: true,
        }),
      ]).start();
    });
  };

  // Dynamically compute dimensions based on screen resolution
  const dynamicMetrics = useMemo(() => {
    let logoWidth = 320;
    let logoHeight = 270;
    let logoSize: 'sm' | 'md' | 'lg' | 'xl' | 'hero' = 'hero';

    if (isCompactMobile) {
      logoWidth = 200;
      logoHeight = 165;
      logoSize = 'lg';
    } else if (isMobile) {
      logoWidth = 250;
      logoHeight = 210;
      logoSize = 'xl';
    } else {
      logoWidth = 340;
      logoHeight = 285;
      logoSize = 'hero';
    }

    const titleFontSize = isCompactMobile ? 22 : isMobile ? 26 : 30;
    const subtitleFontSize = isCompactMobile ? 12 : isMobile ? 13 : 14;

    return {
      logoWidth,
      logoHeight,
      logoSize,
      titleFontSize,
      subtitleFontSize,
    };
  }, [isCompactMobile, isMobile]);

  return (
    <IslamicBackground theme="burgundy" showCorners={true} showCenterLattice={true}>
      <StatusBar barStyle="light-content" backgroundColor="#2A060B" />

      {/* ============================================================
          PHASE 1: SULTAN ROYAL ANIMATED SPLASH SCREEN
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
          {/* Skip Button */}
          <TouchableOpacity
            style={styles.splashSkipBtn}
            onPress={finishSplash}
            activeOpacity={0.75}
          >
            <Text style={styles.splashSkipText}>Skip ➔</Text>
          </TouchableOpacity>

          <Animated.View
            style={[
              styles.splashContent,
              {
                transform: [
                  { scale: splashScaleAnim },
                  { scale: splashPulseAnim },
                ],
              },
            ]}
          >
            {/* Clean Logo Badge */}
            <View style={styles.splashLogoAura}>
              <SultanLogo
                size="hero"
                width={dynamicMetrics.logoWidth}
                height={dynamicMetrics.logoHeight}
                style={styles.logoDropShadow}
              />
            </View>

            {/* Urdu & English Royal Typography */}
            <View style={styles.splashTitleBox}>
              <Text style={styles.splashUrduCalligraphy}>سلطان ریسٹورنٹ</Text>
              <Text style={styles.splashEnglishTitle}>SULTAN RESTAURANT</Text>
              <Text style={styles.splashTagline}>Fine Dining • Royal Banquets • Smart POS</Text>
            </View>

            {/* Gold Shimmer Loading Bar */}
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
              <Text style={styles.splashStatusText}>
                {splashMessages[splashStatusIndex]}
              </Text>
            </View>
          </Animated.View>
        </Animated.View>
      )}

      {/* ============================================================
          PHASE 2: GRAND SULTAN WELCOME SCREEN (SPLIT 2-COLUMN LAYOUT)
          [LEFT COLUMN: Grand Logo & Aura] [RIGHT COLUMN: Info & Actions]
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
          <ScrollView
            contentContainerStyle={[
              styles.scrollContent,
              {
                paddingVertical: isShortScreen ? 14 : 28,
                paddingHorizontal: isCompactMobile ? 12 : 24,
              },
            ]}
            showsVerticalScrollIndicator={false}
            bounces={true}
            keyboardShouldPersistTaps="handled"
          >
            <View style={[styles.splitMainCard, isMobile && styles.splitMainCardMobile]}>
              
              {/* ----------------------------------------------------
                  LEFT SIDE: GRAND SULTAN LOGO & ROYAL AURA
                  ---------------------------------------------------- */}
              <View style={[styles.leftColumnLogoBox, isMobile && styles.leftColumnLogoBoxMobile]}>
                <View style={styles.logoCardWrapper}>
                  {/* Clean Logo without background box */}
                  <View style={styles.logoAuraRing}>
                    <SultanLogo
                      size={dynamicMetrics.logoSize}
                      width={isMobile ? dynamicMetrics.logoWidth : 330}
                      height={isMobile ? dynamicMetrics.logoHeight : 280}
                      style={styles.logoDropShadow}
                    />
                  </View>

                  {/* Urdu Calligraphy */}
                  <Text style={styles.leftUrduCalligraphy}>سلطان ریسٹورنٹ</Text>

                  <View style={styles.leftRoyalDivider}>
                    <View style={styles.leftDividerLine} />
                    <Ionicons name="sparkles" size={13} color="#D5A943" style={{ marginHorizontal: 8 }} />
                    <View style={styles.leftDividerLine} />
                  </View>

                  <Text style={styles.leftSubBadgeText}>
                    FINE DINING & SMART HOSPITALITY
                  </Text>
                </View>
              </View>

              {/* ----------------------------------------------------
                  RIGHT SIDE: STREAMLINED ROYAL GATEWAY
                  ---------------------------------------------------- */}
              <View style={[styles.rightColumnContent, isMobile && styles.rightColumnContentMobile]}>
                
                {/* Header Welcome Badges */}
                <View style={[styles.welcomeHeaderBox, isMobile && { alignItems: 'center' }]}>
                  <View style={styles.welcomeUrduBadge}>
                    <Ionicons name="sparkles" size={13} color="#D5A943" style={{ marginRight: 6 }} />
                    <Text style={styles.welcomeUrduText}>خوش آمدید  •  WELCOME</Text>
                  </View>

                  <Text style={[styles.welcomeTitle, { fontSize: dynamicMetrics.titleFontSize + 2 }, isMobile && { textAlign: 'center' }]}>
                    SULTAN RESTAURANT
                  </Text>
                  
                  <Text style={[styles.welcomeSubtitle, { fontSize: dynamicMetrics.subtitleFontSize }, isMobile && { textAlign: 'center' }]}>
                    Smart Multi-Floor POS, Kitchen KDS & Dining Suite
                  </Text>
                </View>

                {/* Intelligent Active Session OR Main Login Gateway */}
                {hasHydrated && user?.role ? (
                  <View style={styles.sessionCard}>
                    <View style={styles.sessionUserRow}>
                      <View style={styles.sessionAvatar}>
                        <Ionicons name="person" size={20} color="#D5A943" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.sessionGreeting}>ACTIVE SESSION DETECTED</Text>
                        <Text style={styles.sessionUserName}>{user.name || 'Staff'}</Text>
                      </View>
                      <View style={styles.sessionRolePill}>
                        <Text style={styles.sessionRoleText}>{user.role.toUpperCase()}</Text>
                      </View>
                    </View>

                    <TouchableOpacity
                      style={styles.primaryLoginBtn}
                      onPress={() => {
                        const target = getRoleHome(user.role, user.customRoleId);
                        router.replace(target as any);
                      }}
                      activeOpacity={0.88}
                    >
                      <Text style={styles.primaryLoginBtnText}>CONTINUE TO DASHBOARD</Text>
                      <Ionicons name="arrow-forward" size={18} color="#451014" />
                    </TouchableOpacity>

                    <View style={styles.sessionActionsRow}>
                      <TouchableOpacity
                        style={styles.textActionBtn}
                        onPress={() => router.push('/login?all=true' as any)}
                      >
                        <Ionicons name="swap-horizontal-outline" size={15} color="#D5A943" />
                        <Text style={styles.textActionLabel}>Switch Account / Login</Text>
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
                  /* Not Logged In Gateway */
                  <View style={styles.buttonContainer}>
                    <TouchableOpacity
                      style={styles.primaryLoginBtn}
                      onPress={() => router.push('/login?all=true' as any)}
                      activeOpacity={0.88}
                    >
                      <View style={styles.btnIconPod}>
                        <Ionicons name="log-in" size={18} color="#451014" />
                      </View>
                      <Text style={styles.primaryLoginBtnText}>STAFF LOGIN  •  لاگ ان</Text>
                      <Ionicons name="arrow-forward" size={18} color="#451014" />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.secondaryMenuBtn}
                      onPress={() => router.push('/menu' as any)}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="book-outline" size={17} color="#D5A943" style={{ marginRight: 8 }} />
                      <Text style={styles.secondaryMenuBtnText}>EXPLORE GUEST DIGITAL MENU</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Clean Direct Role Terminals */}
                <View style={styles.quickTerminalsSection}>
                  <Text style={styles.quickPortalsHeading}>QUICK ACCESS TERMINALS</Text>
                  
                  <View style={styles.quickTerminalsGrid}>
                    <Link href="/login?role=admin&all=true" asChild>
                      <TouchableOpacity style={styles.terminalCard} activeOpacity={0.8}>
                        <View style={[styles.terminalIconBox, { backgroundColor: 'rgba(213, 169, 67, 0.18)' }]}>
                          <Ionicons name="shield-checkmark" size={16} color="#D5A943" />
                        </View>
                        <Text style={styles.terminalTitle}>Cashier / Admin</Text>
                      </TouchableOpacity>
                    </Link>

                    <Link href="/login?role=waiter" asChild>
                      <TouchableOpacity style={styles.terminalCard} activeOpacity={0.8}>
                        <View style={[styles.terminalIconBox, { backgroundColor: 'rgba(56, 189, 248, 0.18)' }]}>
                          <Ionicons name="phone-portrait-outline" size={16} color="#38BDF8" />
                        </View>
                        <Text style={styles.terminalTitle}>Order Taker</Text>
                      </TouchableOpacity>
                    </Link>

                    <Link href="/kitchen/kds" asChild>
                      <TouchableOpacity style={styles.terminalCard} activeOpacity={0.8}>
                        <View style={[styles.terminalIconBox, { backgroundColor: 'rgba(251, 113, 133, 0.18)' }]}>
                          <Ionicons name="flame" size={16} color="#FB7185" />
                        </View>
                        <Text style={styles.terminalTitle}>Kitchen KDS</Text>
                      </TouchableOpacity>
                    </Link>

                    <Link href="/juicebar/kds" asChild>
                      <TouchableOpacity style={styles.terminalCard} activeOpacity={0.8}>
                        <View style={[styles.terminalIconBox, { backgroundColor: 'rgba(251, 191, 36, 0.18)' }]}>
                          <Ionicons name="cafe" size={16} color="#FBBF24" />
                        </View>
                        <Text style={styles.terminalTitle}>Juice Bar</Text>
                      </TouchableOpacity>
                    </Link>
                  </View>
                </View>

              </View>
            </View>
          </ScrollView>
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
     SPLASH OVERLAY STYLES
     ------------------------------------------------------------ */
  splashOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#2A060B', // Deep Royal Obsidian Burgundy
    zIndex: 9999,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  splashSkipBtn: {
    position: 'absolute',
    top: 40,
    right: 24,
    backgroundColor: 'rgba(213, 169, 67, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(213, 169, 67, 0.45)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    zIndex: 10000,
  },
  splashSkipText: {
    color: '#D5A943',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  splashContent: {
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: 480,
    width: '100%',
  },
  splashLogoAura: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  splashTitleBox: {
    alignItems: 'center',
    marginVertical: 10,
  },
  splashUrduCalligraphy: {
    fontSize: 32,
    fontWeight: '900',
    color: '#D5A943',
    textAlign: 'center',
    letterSpacing: 1,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
    marginBottom: 4,
  },
  splashEnglishTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 3,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  splashTagline: {
    fontSize: 12.5,
    color: 'rgba(255, 255, 255, 0.75)',
    letterSpacing: 0.8,
    marginTop: 6,
    textAlign: 'center',
    fontWeight: '600',
  },
  splashProgressWrapper: {
    width: '82%',
    maxWidth: 320,
    marginTop: 30,
    alignItems: 'center',
  },
  splashProgressTrack: {
    width: '100%',
    height: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 4,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: 'rgba(213, 169, 67, 0.3)',
  },
  splashProgressBar: {
    height: '100%',
    backgroundColor: '#D5A943',
    borderRadius: 4,
  },
  splashStatusText: {
    color: 'rgba(213, 169, 67, 0.9)',
    fontSize: 11.5,
    fontWeight: '700',
    marginTop: 12,
    letterSpacing: 0.4,
  },

  /* ------------------------------------------------------------
     WELCOME SCREEN 2-COLUMN SPLIT STYLES
     ------------------------------------------------------------ */
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  splitMainCard: {
    width: '100%',
    maxWidth: 960,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(32, 6, 10, 0.88)',
    borderWidth: 1.5,
    borderColor: 'rgba(213, 169, 67, 0.38)',
    borderRadius: 24,
    padding: 32,
    gap: 36,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        boxShadow: '0 24px 64px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.12)',
      } as any,
    }),
  },
  splitMainCardMobile: {
    flexDirection: 'column',
    padding: 20,
    gap: 20,
    borderRadius: 20,
  },

  /* LEFT COLUMN: LOGO & BRANDING */
  leftColumnLogoBox: {
    width: '40%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  leftColumnLogoBoxMobile: {
    width: '100%',
  },
  logoCardWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingVertical: 8,
  },
  logoAuraRing: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  logoDropShadow: {
    ...Platform.select({
      web: {
        filter: 'drop-shadow(0px 10px 28px rgba(213, 169, 67, 0.45))',
      } as any,
    }),
  },
  leftUrduCalligraphy: {
    fontSize: 28,
    fontWeight: '900',
    color: '#D5A943',
    textAlign: 'center',
    letterSpacing: 1,
    marginTop: 4,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  leftRoyalDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 160,
    marginVertical: 10,
  },
  leftDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(213, 169, 67, 0.4)',
  },
  leftSubBadgeText: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 1.5,
    textAlign: 'center',
  },

  /* RIGHT COLUMN: WELCOME, SESSION & ACTIONS */
  rightColumnContent: {
    flex: 1,
    width: '100%',
  },
  rightColumnContentMobile: {
    width: '100%',
  },
  welcomeHeaderBox: {
    marginBottom: 20,
  },
  welcomeUrduBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(213, 169, 67, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(213, 169, 67, 0.45)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    marginBottom: 10,
  },
  welcomeUrduText: {
    color: '#F6E095',
    fontSize: 12.5,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  welcomeTitle: {
    fontWeight: '900',
    color: '#FFFFFF',
    marginBottom: 6,
    letterSpacing: 0.8,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  welcomeSubtitle: {
    color: 'rgba(255, 255, 255, 0.78)',
    lineHeight: 20,
    fontWeight: '500',
  },

  /* ACTIVE SESSION CARD */
  sessionCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1.5,
    borderColor: 'rgba(16, 185, 129, 0.35)',
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
      } as any,
    }),
  },
  sessionUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  sessionAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(213, 169, 67, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(213, 169, 67, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sessionGreeting: {
    fontSize: 10.5,
    color: 'rgba(255, 255, 255, 0.6)',
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  sessionUserName: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
    marginTop: 1,
  },
  sessionRolePill: {
    backgroundColor: 'rgba(16, 185, 129, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.45)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  sessionRoleText: {
    color: '#34D399',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  sessionActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginTop: 12,
  },
  textActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 3,
  },
  textActionLabel: {
    fontSize: 12.5,
    color: '#F6E095',
    fontWeight: '700',
  },
  sessionActionDivider: {
    color: 'rgba(255, 255, 255, 0.3)',
    fontSize: 12,
  },

  /* ACTION BUTTONS CONTAINER (When not logged in) */
  buttonContainer: {
    width: '100%',
    gap: 12,
    marginBottom: 6,
  },
  primaryLoginBtn: {
    flexDirection: 'row',
    backgroundColor: '#D5A943',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderColor: '#F6E095',
    ...Platform.select({
      web: {
        boxShadow: '0 6px 24px rgba(213, 169, 67, 0.38)',
        cursor: 'pointer',
        transition: 'transform 0.15s ease',
      } as any,
      ios: {
        shadowColor: '#D5A943',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  btnIconPod: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(69, 16, 20, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryLoginBtnText: {
    color: '#451014',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  secondaryMenuBtn: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1.5,
    borderColor: 'rgba(213, 169, 67, 0.65)',
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      web: {
        boxShadow: '0 4px 14px rgba(0, 0, 0, 0.25)',
        cursor: 'pointer',
      } as any,
    }),
  },
  secondaryMenuBtnText: {
    color: '#F6E095',
    fontSize: 13.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  /* QUICK TERMINALS SECTION */
  quickTerminalsSection: {
    marginTop: 18,
    borderTopWidth: 1,
    borderTopColor: 'rgba(213, 169, 67, 0.18)',
    paddingTop: 16,
  },
  quickPortalsHeading: {
    color: 'rgba(255, 255, 255, 0.55)',
    fontSize: 10.5,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 1,
    marginBottom: 10,
  },
  quickTerminalsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
  },
  terminalCard: {
    width: '48.5%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(213, 169, 67, 0.25)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 8,
    ...Platform.select({
      web: {
        cursor: 'pointer',
        transition: 'all 0.15s ease',
      } as any,
    }),
  },
  terminalIconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  terminalTitle: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
});
