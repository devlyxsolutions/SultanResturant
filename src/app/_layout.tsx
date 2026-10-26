import { Stack, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Platform, View } from 'react-native';
import * as Font from 'expo-font';
import { Ionicons } from '@expo/vector-icons';
import { initSyncService } from '../services/syncService';
import { initCallListener } from '../services/headlessCallService';
import StockAlarmHost from '../components/StockAlarmHost';
import IncomingCallHost from '../components/IncomingCallHost';

SplashScreen.preventAutoHideAsync().catch(() => {});

// Global Web Error Guard against external browser extension crashes & fontfaceobserver timeouts
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  window.addEventListener(
    'error',
    (event) => {
      const filename = String(event?.filename || '');
      const message = String(event?.message || '');
      const stack = String(event?.error?.stack || '');
      if (
        filename.includes('chrome-extension://') ||
        stack.includes('chrome-extension://') ||
        message.includes('M_ID')
      ) {
        event.preventDefault();
        event.stopImmediatePropagation?.();
        return true;
      }
    },
    true
  );

  window.addEventListener('unhandledrejection', (event) => {
    const reasonStr = String(event?.reason?.stack || event?.reason || '');
    if (
      reasonStr.includes('timeout exceeded') ||
      reasonStr.includes('fontfaceobserver') ||
      reasonStr.includes('chrome-extension://') ||
      reasonStr.includes('M_ID')
    ) {
      event.preventDefault();
    }
  });
}

export default function RootLayout() {
  const pathname = usePathname();

  useEffect(() => {
    // Safely warm-up vector icons on web
    if (Platform.OS === 'web') {
      Font.loadAsync(Ionicons.font).catch(() => {});
    }

    // Initialize real-time cross-device sync hub
    initSyncService();

    // Initialize native Android incoming call detection listener
    const cleanupCallListener = initCallListener();

    // Hide splash screen immediately once layout mounts
    SplashScreen.hideAsync().catch(() => {});

    return () => {
      cleanupCallListener();
    };
  }, []);

  return (
    <>
      {Platform.OS === 'web' && (
        <style>{`
          /* ========================================================
             SULTAN RESTAURANT UNIVERSAL ANIMATION & HOVER ENGINE
             ======================================================== */

          /* 1. Page Landing Entrance Animation */
          @keyframes sultanPageLanding {
            0% {
              opacity: 0;
              transform: translateY(14px);
            }
            100% {
              opacity: 1;
              transform: translateY(0);
            }
          }

          @keyframes pulseBeacon {
            0%, 100% {
              transform: scale(1);
              opacity: 1;
              box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.6);
            }
            50% {
              transform: scale(1.15);
              opacity: 0.85;
              box-shadow: 0 0 0 6px rgba(16, 185, 129, 0);
            }
          }

          @keyframes pulseGlowGold {
            0%, 100% {
              box-shadow: 0 0 12px rgba(212, 175, 55, 0.28);
            }
            50% {
              box-shadow: 0 0 26px rgba(212, 175, 55, 0.65);
            }
          }

          @keyframes shieldGlow {
            0%, 100% {
              box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.4), 0 8px 24px rgba(220, 38, 38, 0.15);
              transform: scale(1);
            }
            50% {
              box-shadow: 0 0 0 12px rgba(220, 38, 38, 0), 0 14px 32px rgba(220, 38, 38, 0.28);
              transform: scale(1.04);
            }
          }

          /* Every screen entry / page landing */
          .sultan-page-enter,
          [data-page-enter="true"],
          [data-page-landing="true"],
          #sultan-screen-wrapper {
            animation: sultanPageLanding 0.35s cubic-bezier(0.16, 1, 0.3, 1) both !important;
          }

          /* 2. UNIVERSAL HOVER: Every Button, Card, Tile, Chip, Box, Row */
          [role="button"],
          button,
          a,
          [tabindex="0"],
          [data-card],
          [data-hover],
          [data-interactive],
          [data-tile],
          [data-box],
          [data-pill],
          [data-row],
          [data-stagger],
          .interactive-card,
          .kpi-jewel-card,
          .stat-card,
          .info-box {
            transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1),
                        box-shadow 0.22s cubic-bezier(0.16, 1, 0.3, 1),
                        filter 0.22s ease,
                        border-color 0.22s ease !important;
          }

          /* Smooth hover lift + shadow + gold accent rim */
          [role="button"]:hover,
          button:hover,
          a:hover,
          [tabindex="0"]:hover,
          [data-card]:hover,
          [data-hover]:hover,
          [data-interactive]:hover,
          [data-tile]:hover,
          [data-box]:hover,
          [data-pill]:hover,
          [data-row]:hover,
          [data-stagger]:hover,
          .interactive-card:hover,
          .kpi-jewel-card:hover,
          .stat-card:hover,
          .info-box:hover {
            transform: translateY(-3.5px) scale(1.008) !important;
            filter: brightness(1.04) !important;
            box-shadow: 0 14px 32px rgba(82, 20, 28, 0.14), 0 0 0 1.5px rgba(212, 175, 55, 0.5) !important;
            z-index: 5 !important;
          }

          /* Micro-scale feedback on click / tap */
          [role="button"]:active,
          button:active,
          a:active,
          [tabindex="0"]:active,
          [data-card]:active,
          [data-hover]:active,
          [data-interactive]:active,
          [data-tile]:active,
          [data-box]:active,
          [data-pill]:active,
          [data-row]:active,
          .interactive-card:active {
            transform: translateY(-0.5px) scale(0.975) !important;
            filter: brightness(0.98) !important;
          }

          /* Sidebar item slide effect */
          [data-nav="item"]:hover {
            transform: translateX(4px) scale(1.01) !important;
            background: rgba(212, 175, 55, 0.14) !important;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(212, 175, 55, 0.4) !important;
          }

          /* Clean Inputs: No default browser outlines or inner box-shadows */
          *:focus,
          input, textarea, select,
          input:focus, textarea:focus, select:focus {
            outline: none !important;
            box-shadow: none !important;
            -webkit-tap-highlight-color: transparent !important;
          }

          /* Search Bars Pop-Out Engine */
          .search-bar-pop,
          [data-search-box="true"],
          .search-pill-box,
          .modal-search-bar,
          .quick-find-box {
            transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1),
                        box-shadow 0.22s cubic-bezier(0.16, 1, 0.3, 1),
                        border-color 0.22s ease,
                        background-color 0.22s ease !important;
          }

          /* When any input inside is focused: whole search bar pops out with luxury gold halo */
          .search-bar-pop:focus-within,
          [data-search-box="true"]:focus-within,
          .search-pill-box:focus-within,
          .modal-search-bar:focus-within,
          .quick-find-box:focus-within {
            transform: scale(1.025) translateY(-2px) !important;
            border-color: #D4AF37 !important;
            background-color: #FFFFFF !important;
            box-shadow: 0 10px 28px rgba(212, 175, 55, 0.32), 0 0 0 2.5px rgba(212, 175, 55, 0.55) !important;
            z-index: 20 !important;
          }

          /* Ensure all search inputs have dark, crystal-clear readable font and high-contrast placeholder */
          .search-bar-pop input,
          [data-search-box="true"] input,
          .search-pill-box input,
          .modal-search-bar input,
          .quick-find-box input {
            color: #1E293B !important;
            font-size: 12.5px !important;
            font-weight: 600 !important;
          }
          .search-bar-pop input::placeholder,
          [data-search-box="true"] input::placeholder,
          .search-pill-box input::placeholder,
          .modal-search-bar input::placeholder,
          .quick-find-box input::placeholder {
            color: #64748B !important;
            opacity: 1 !important;
          }

          /* Beacons and shields */
          [data-pulse="beacon"],
          .pulse-beacon {
            animation: pulseBeacon 2s cubic-bezier(0.4, 0, 0.6, 1) infinite !important;
          }

          [data-shield-ring="true"],
          .animated-shield-ring {
            animation: shieldGlow 2.8s infinite ease-in-out !important;
          }
        `}</style>
      )}

      {/* Screen container */}
      <View
        id="sultan-screen-wrapper"
        style={{ flex: 1 }}
        {...(Platform.OS === 'web' ? ({ dataSet: { pageLanding: 'true', pageEnter: 'true' } } as any) : {})}
      >
        <Stack screenOptions={{ headerShown: false }} />
      </View>

      {/* Live stock / kitchen handover alarms for admin, manager and kitchen roles */}
      <StockAlarmHost />
      {/* Live incoming caller ID popup & quick order routing */}
      <IncomingCallHost />
    </>
  );
}
