import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Platform,
  StatusBar,
  Animated,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import IslamicBackground from '../components/IslamicBackground';
import {
  CustomerDisplayState,
  getSavedCustomerDisplayState,
  subscribeToCustomerDisplay,
  requestCustomerDisplayState,
  INITIAL_CFD_STATE,
} from '../services/customerDisplaySync';

export default function CustomerDisplayScreen() {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  // Responsive layout scaling across all screen sizes (small dual monitor, laptop, 1080p, 4K, tablet)
  const availHeight = Math.max(380, height);
  const availWidth = width;

  // Centerpiece Circle Diameter (dynamic clamping so it never crowds text or touches borders)
  const circleSize = Math.min(
    Math.max(180, Math.floor(availHeight * (isLandscape ? 0.38 : 0.30))),
    Math.floor(availWidth * (isLandscape ? 0.35 : 0.65)),
    340
  );
  const logoImageSize = Math.floor(circleSize * 0.63);
  const logoHolderSize = Math.floor(circleSize * 0.68);
  const rippleRingSize = Math.floor(circleSize * 0.90);

  // Dynamic Typography & Spacing for Idle Mode (Generous vertical separation so rows never merge):
  const urduFontSize = Math.min(Math.max(26, Math.floor(availHeight * (isLandscape ? 0.050 : 0.038))), 42);
  const urduLineHeight = Math.floor(urduFontSize * 1.85); // Nastaliq requires generous height for descenders
  const englishFontSize = Math.min(Math.max(13, Math.floor(availHeight * 0.024)), 18);
  const subtitleFontSize = Math.min(Math.max(10, Math.floor(availHeight * 0.017)), 13);
  const spacingBetween = Math.min(Math.max(10, Math.floor(availHeight * 0.020)), 22);
  const pillPaddingV = Math.min(Math.max(4, Math.floor(availHeight * 0.008)), 7);
  const pillPaddingH = Math.min(Math.max(14, Math.floor(availWidth * 0.016)), 20);

  // Responsive POS Cart (Active Mode):
  const grandTotalFontSize = Math.min(Math.max(32, Math.floor(availWidth * (isLandscape ? 0.038 : 0.065))), 52);
  const currencyFontSize = Math.min(Math.max(18, Math.floor(grandTotalFontSize * 0.5)), 26);

  const [state, setState] = useState<CustomerDisplayState>(() => getSavedCustomerDisplayState());
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [paidCountdown, setPaidCountdown] = useState(7);
  const scrollRef = useRef<any>(null);

  // Subtle pulsing animation for ambient luxury glow
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Live Clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Ambient gold breathing pulse
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 3000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 3000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [pulseAnim]);

  // Subscribe to real-time updates from Cashier POS
  useEffect(() => {
    requestCustomerDisplayState();

    const unsubscribe = subscribeToCustomerDisplay((newState) => {
      setState(newState);
      if (newState.status === 'paid') {
        setPaidCountdown(7);
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Handle Paid auto-dismiss back to idle after countdown
  useEffect(() => {
    if (state.status === 'paid') {
      if (paidCountdown > 0) {
        const timer = setTimeout(() => {
          setPaidCountdown((c) => c - 1);
        }, 1000);
        return () => clearTimeout(timer);
      } else {
        const cleanState: CustomerDisplayState = {
          ...INITIAL_CFD_STATE,
          isPosActive: state.isPosActive,
          status: 'idle',
          cashierName: state.cashierName,
          lastUpdated: Date.now(),
        };
        setState(cleanState);
        if (typeof window !== 'undefined' && window.localStorage) {
          try {
            window.localStorage.setItem('sultan_pos_cfd_state', JSON.stringify(cleanState));
          } catch {}
        }
      }
    }
  }, [state.status, paidCountdown]);

  // Auto-scroll to bottom of items list when new items are added
  useEffect(() => {
    if (state.cart && state.cart.length > 0) {
      setTimeout(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      }, 80);
    }
  }, [state.cart?.length]);

  const toggleFullscreen = () => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
      } else {
        document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
      }
    }
  };

  const isPaid = state.status === 'paid';
  // Mirror POS ONLY when cart has items and not in paid celebration!
  // When cart is empty or after payment, show the Sultan logo animation screen!
  const isShowingPos = state.cart && state.cart.length > 0 && !isPaid;

  const formattedDate = currentTime.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const formattedTime = currentTime.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  return (
    <IslamicBackground theme="burgundy" showCorners={true} showCenterLattice={true} style={styles.container}>
      <StatusBar hidden={true} />

      {/* Web Specific Animations & Urdu Typography Styles */}
      {Platform.OS === 'web' && (
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@500;700;800;900&family=Amiri:wght@700&family=Cinzel:wght@700;900&display=swap');

          @keyframes cfdLogoLevitate {
            0%, 100% {
              transform: translateY(0px) scale(1);
              filter: drop-shadow(0 0 25px rgba(212, 175, 55, 0.65));
            }
            50% {
              transform: translateY(-8px) scale(1.03);
              filter: drop-shadow(0 0 50px rgba(212, 175, 55, 0.95));
            }
          }

          @keyframes cfdTextSpinClockwise {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }

          @keyframes cfdPulseRipple {
            0% {
              transform: scale(0.92);
              opacity: 0.75;
            }
            50% {
              opacity: 0.35;
            }
            100% {
              transform: scale(1.22);
              opacity: 0;
            }
          }

          @keyframes cfdFadeInSlogan {
            0% { opacity: 0; transform: translateY(12px); }
            100% { opacity: 1; transform: translateY(0px); }
          }

          @keyframes cfdTotalBoxGlow {
            0%, 100% {
              box-shadow: 0 0 30px rgba(212, 175, 55, 0.35), 0 0 60px rgba(16, 185, 129, 0.3);
            }
            50% {
              box-shadow: 0 0 55px rgba(212, 175, 55, 0.8), 0 0 95px rgba(16, 185, 129, 0.6);
            }
          }

          .cfd-logo-levitate {
            animation: cfdLogoLevitate 4.5s ease-in-out infinite !important;
          }

          .cfd-text-spin {
            animation: cfdTextSpinClockwise 32s linear infinite !important;
            transform-origin: 240px 240px;
          }

          .cfd-ripple-effect {
            animation: cfdPulseRipple 4s cubic-bezier(0.2, 0.8, 0.2, 1) infinite !important;
          }

          .cfd-slogan-content {
            animation: cfdFadeInSlogan 1s cubic-bezier(0.16, 1, 0.3, 1) forwards !important;
          }

          .cfd-total-banner {
            animation: cfdTotalBoxGlow 3s ease-in-out infinite !important;
          }

          .cfd-urdu-slogan {
            font-family: 'Noto Nastaliq Urdu', 'Urdu Typesetting', 'Jameel Noori Nastaleeq', 'Amiri', 'Segoe UI', Tahoma, serif !important;
            direction: rtl;
            unicode-bidi: isolate;
            display: block;
            overflow: visible !important;
            line-height: 1.85 !important;
            padding-bottom: 8px !important;
          }
        `}</style>
      )}

      {/* ========================================================
          FLOATING TIME & FULLSCREEN PILL (TOP-RIGHT ONLY)
          ======================================================== */}
      <View style={styles.floatingTopBar}>
        <View style={styles.clockPill}>
          <Ionicons name="time-outline" size={15} color="#D4AF37" />
          <Text style={styles.clockTime}>{formattedTime}</Text>
          <Text style={styles.clockDate}>{formattedDate}</Text>
        </View>

        {Platform.OS === 'web' && (
          <TouchableOpacity
            style={styles.fullscreenToggleBtn}
            onPress={toggleFullscreen}
            activeOpacity={0.7}
            accessibilityLabel="Toggle Fullscreen Display"
            {...(Platform.OS === 'web' ? ({ title: 'Toggle Fullscreen Display' } as any) : {})}
          >
            <Ionicons
              name={isFullscreen ? 'contract-outline' : 'expand-outline'}
              size={18}
              color="#D4AF37"
            />
          </TouchableOpacity>
        )}
      </View>

      {/* ========================================================
          2. BODY: SPLASH ANIMATION IDLE VS ACTIVE POS CART
          ======================================================== */}
      {isPaid ? (
        /* --------------------------------------------------------
           STATE A: PAYMENT COMPLETED CELEBRATION (ENGLISH ONLY)
           -------------------------------------------------------- */
        <View style={styles.celebrationContainer}>
          <View style={styles.celebrationCard}>
            <View style={styles.successIconOrb}>
              <Ionicons name="checkmark-done" size={60} color="#10B981" />
            </View>

            <Text style={styles.celebrationEnglish}>THANK YOU FOR DINING WITH US!</Text>
            <Text style={styles.celebrationSubtitle}>
              Your bill has been settled successfully. Have a royal meal!
            </Text>

            <View style={styles.paidStatsRow}>
              <View style={styles.paidStatBox}>
                <Text style={styles.paidStatLabel}>TOTAL AMOUNT</Text>
                <Text style={styles.paidStatValue}>Rs. {state.total.toLocaleString()}</Text>
              </View>

              {state.tenderedAmount > 0 && (
                <View style={styles.paidStatBox}>
                  <Text style={styles.paidStatLabel}>TENDERED AMOUNT</Text>
                  <Text style={[styles.paidStatValue, { color: '#6EE7B7' }]}>
                    Rs. {state.tenderedAmount.toLocaleString()}
                  </Text>
                </View>
              )}

              {state.changeDue > 0 && (
                <View style={styles.paidStatBox}>
                  <Text style={styles.paidStatLabel}>CHANGE RETURNED</Text>
                  <Text style={[styles.paidStatValue, { color: '#FCD34D' }]}>
                    Rs. {state.changeDue.toLocaleString()}
                  </Text>
                </View>
              )}
            </View>

            <Text style={styles.celebrationNote}>
              Your receipt has been printed. We look forward to serving you again!
            </Text>

            {/* Auto countdown bar */}
            <View style={styles.countdownContainer}>
              <Text style={styles.countdownText}>
                Returning to home screen in {paidCountdown}s...
              </Text>
              <View style={styles.countdownTrack}>
                <View
                  style={[
                    styles.countdownFill,
                    { width: `${Math.max(5, (paidCountdown / 7) * 100)}%` },
                  ]}
                />
              </View>
            </View>
          </View>
        </View>
      ) : isShowingPos ? (
        /* --------------------------------------------------------
           STATE B: ACTIVE POS REAL-TIME MIRROR (WHEN CASHIER ON POS)
           -------------------------------------------------------- */
        <View
          style={[
            styles.activeWorkspace,
            {
              padding: Math.min(16, Math.max(8, Math.floor(width * 0.015))),
              paddingTop: Math.max(58, Math.floor(height * 0.08)),
              gap: Math.min(16, Math.max(8, Math.floor(width * 0.015))),
            },
            !isLandscape && { flexDirection: 'column' },
          ]}
        >
          {/* ========================================================
              LEFT COLUMN: LIVE ORDER DISHES LIST (62% width)
              ======================================================== */}
          <View style={[styles.orderListColumn, !isLandscape && { flex: 1 }]}>
            {/* Column Header */}
            <View style={styles.columnHeader}>
              <View style={styles.columnHeaderTitleGroup}>
                <Ionicons name="receipt-outline" size={20} color="#D4AF37" />
                <Text style={styles.columnHeaderTitle}>ORDER SUMMARY</Text>
                <Text style={styles.columnHeaderSubtitle}>LIVE POS ITEMS</Text>
              </View>
              <View style={styles.itemCountBadge}>
                <Text style={styles.itemCountText}>
                  {state.cart?.reduce((sum, item) => sum + item.qty, 0) || 0} Items
                </Text>
              </View>
            </View>

            {/* Items Table OR Empty Cart Live Prompt */}
            {state.cart && state.cart.length > 0 ? (
              <ScrollView
                ref={scrollRef}
                style={styles.itemsScrollView}
                contentContainerStyle={styles.itemsScrollContent}
                showsVerticalScrollIndicator={true}
              >
                {state.cart.map((item, idx) => (
                  <View key={`${item.id}-${idx}`} style={styles.orderItemCard}>
                    {/* Sequence Number */}
                    <View style={styles.itemNumberCircle}>
                      <Text style={styles.itemNumberText}>{idx + 1}</Text>
                    </View>

                    {/* Item Description */}
                    <View style={styles.itemInfo}>
                      <Text style={styles.itemNameText}>{item.name}</Text>
                      {item.notes ? (
                        <View style={styles.itemNotesBadge}>
                          <Ionicons name="chatbox-ellipses-outline" size={12} color="#F59E0B" />
                          <Text style={styles.itemNotesText}>{item.notes}</Text>
                        </View>
                      ) : null}
                      {item.selectedVariant ? (
                        <Text style={styles.itemVariantText}>Option: {item.selectedVariant}</Text>
                      ) : null}
                      <Text style={styles.itemUnitPriceText}>
                        Rs. {item.price.toLocaleString()} each
                      </Text>
                    </View>

                    {/* Quantity Badge */}
                    <View style={styles.itemQtyPill}>
                      <Text style={styles.itemQtyLabel}>QTY</Text>
                      <Text style={styles.itemQtyValue}>{item.qty}x</Text>
                    </View>

                    {/* Total Line Price */}
                    <View style={styles.itemSubtotalBox}>
                      <Text style={styles.itemSubtotalLabel}>TOTAL</Text>
                      <Text style={styles.itemSubtotalText}>
                        Rs. {(item.price * item.qty).toLocaleString()}
                      </Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
            ) : (
              <View style={styles.emptyCartBox}>
                <View style={styles.emptyCartIconOrb}>
                  <Ionicons name="cart-outline" size={40} color="#D4AF37" />
                </View>
                <Text style={styles.emptyCartTitle}>CART IS CURRENTLY EMPTY</Text>
                <Text style={styles.emptyCartSubtitle}>
                  Items selected by the cashier will appear here in real-time.
                </Text>
              </View>
            )}
          </View>

          {/* ========================================================
              RIGHT COLUMN: DETAILED BILL & GIANT PAYABLE TOTAL (38% width)
              ======================================================== */}
          <View style={styles.summaryColumn}>
            {/* Calculation Breakdown */}
            <View style={styles.breakdownCard}>
              <Text style={styles.breakdownTitle}>BILLING BREAKDOWN</Text>

              {/* Items Subtotal */}
              <View style={styles.calcRow}>
                <Text style={styles.calcLabel}>Items Subtotal</Text>
                <Text style={styles.calcValue}>Rs. {state.subTotal.toLocaleString()}</Text>
              </View>

              {/* Discount (if any) */}
              {state.discountVal > 0 && (
                <View style={styles.calcRow}>
                  <Text style={[styles.calcLabel, { color: '#10B981' }]}>Discount Applied</Text>
                  <Text style={[styles.calcValue, { color: '#10B981' }]}>
                    - Rs. {state.discountVal.toLocaleString()}
                  </Text>
                </View>
              )}

              {/* Tax / GST (if any) */}
              {state.tax > 0 && (
                <View style={styles.calcRow}>
                  <Text style={styles.calcLabel}>GST / Sales Tax</Text>
                  <Text style={styles.calcValue}>+ Rs. {state.tax.toLocaleString()}</Text>
                </View>
              )}

              {/* Service Charge (if any) */}
              {state.serviceCharge > 0 && (
                <View style={styles.calcRow}>
                  <Text style={styles.calcLabel}>Service Charge</Text>
                  <Text style={styles.calcValue}>+ Rs. {state.serviceCharge.toLocaleString()}</Text>
                </View>
              )}

              {/* Delivery Fee (if delivery) */}
              {state.deliveryCharges > 0 && (
                <View style={styles.calcRow}>
                  <Text style={styles.calcLabel}>Delivery Charges</Text>
                  <Text style={styles.calcValue}>+ Rs. {state.deliveryCharges.toLocaleString()}</Text>
                </View>
              )}
            </View>

            {/* ========================================================
                OVERSIZED GRAND TOTAL DISPLAY BOX
                User requirement: "total thora bara nazar ayee"
                ======================================================== */}
            <View
              style={styles.grandTotalContainer}
              {...(Platform.OS === 'web' ? ({ className: 'cfd-total-banner' } as any) : {})}
            >
              <View style={styles.grandTotalHeaderRow}>
                <View style={styles.totalIconOrb}>
                  <Ionicons name="wallet" size={24} color="#D4AF37" />
                </View>
                <View>
                  <Text style={styles.grandTotalEnglish}>NET AMOUNT PAYABLE</Text>
                  <Text style={styles.grandTotalLabel}>GRAND TOTAL</Text>
                </View>
              </View>

              <View style={styles.giantPriceRow}>
                <Text style={[styles.currencyPrefix, { fontSize: currencyFontSize, marginTop: Math.max(4, Math.floor(currencyFontSize * 0.25)) }]}>Rs.</Text>
                <Text style={[styles.giantAmountText, { fontSize: grandTotalFontSize }]}>
                  {state.total.toLocaleString()}
                </Text>
              </View>

              <View style={styles.grandTotalDivider} />

              <View style={styles.totalFooterRow}>
                <Text style={styles.inclusiveText}>شاہی ذائقہ اور مہمان نوازی</Text>
                <Text style={styles.thankYouEnglish}>جہاں ہر مہمان ہے سلطان</Text>
              </View>
            </View>

            {/* Live Payment Tendered / Change Section (if entered by cashier) */}
            {state.tenderedAmount > 0 && (
              <View style={styles.paymentStatusCard}>
                <View style={styles.calcRow}>
                  <Text style={styles.paymentStatusLabel}>Amount Tendered:</Text>
                  <Text style={styles.paymentStatusValue}>
                    Rs. {state.tenderedAmount.toLocaleString()}
                  </Text>
                </View>
                <View style={styles.calcRow}>
                  <Text style={[styles.paymentStatusLabel, { color: '#FCD34D' }]}>
                    Change Due:
                  </Text>
                  <Text style={[styles.paymentStatusValue, { color: '#FCD34D', fontSize: 20 }]}>
                    Rs. {state.changeDue.toLocaleString()}
                  </Text>
                </View>
              </View>
            )}
          </View>
        </View>
      ) : (
        /* --------------------------------------------------------
           STATE C: SPLASH SCREEN STYLE IDLE ANIMATION
           Display Sultan Logo + Official Slogan: "جہاں ہر مہمان ہے سلطان"
           -------------------------------------------------------- */
        <View
          style={[
            styles.idleContainer,
            {
              paddingHorizontal: Math.max(16, Math.floor(width * 0.04)),
              paddingVertical: Math.max(8, Math.floor(availHeight * 0.02)),
            },
          ]}
        >
          {/* Subtle Ambient Background Glow */}
          <View
            style={[
              styles.idleGlowBackdrop,
              {
                width: Math.floor(circleSize * 1.5),
                height: Math.floor(circleSize * 1.5),
                borderRadius: Math.floor(circleSize * 0.75),
              },
            ]}
            pointerEvents="none"
          />

          {/* Sultan Royal Logo Animation Centerpiece with Rotating Golden Circular Ribbon */}
          <View
            style={[
              styles.logoClipWrapper,
              {
                width: circleSize,
                height: circleSize,
                marginBottom: spacingBetween,
              },
            ]}
          >
            {/* Pulsing Golden Ripple Waves */}
            <View
              style={[
                styles.rippleWaveRing,
                {
                  width: rippleRingSize,
                  height: rippleRingSize,
                  borderRadius: Math.floor(rippleRingSize / 2),
                },
              ]}
              {...(Platform.OS === 'web' ? ({ className: 'cfd-ripple-effect' } as any) : {})}
            />

            {/* Rotating Circular Text Ribbon: Words never break apart */}
            {Platform.OS === 'web' && (
              <div
                style={{
                  position: 'absolute',
                  width: circleSize,
                  height: circleSize,
                  top: 0,
                  left: 0,
                  pointerEvents: 'none',
                }}
              >
                <svg
                  viewBox="0 0 480 480"
                  width={circleSize}
                  height={circleSize}
                  style={{ width: '100%', height: '100%' }}
                >
                  <defs>
                    <path
                      id="sultanCirclePath"
                      d="M 240, 240 m -196, 0 a 196,196 0 1,1 392,0 a 196,196 0 1,1 -392,0"
                    />
                    <linearGradient id="sultanGoldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#FFF9E0" />
                      <stop offset="25%" stopColor="#F5D77F" />
                      <stop offset="60%" stopColor="#D4AF37" />
                      <stop offset="100%" stopColor="#9E731B" />
                    </linearGradient>
                  </defs>
                  {/* Outer delicate dashed guide ring */}
                  <circle
                    cx="240"
                    cy="240"
                    r="218"
                    fill="none"
                    stroke="rgba(212, 175, 55, 0.32)"
                    strokeWidth="1.5"
                    strokeDasharray="5,7"
                  />
                  {/* Inner guide ring */}
                  <circle
                    cx="240"
                    cy="240"
                    r="174"
                    fill="none"
                    stroke="rgba(212, 175, 55, 0.25)"
                    strokeWidth="1"
                  />
                  {/* Rotating Circular Text: Solid intact words, no stretched letters */}
                  <g className="cfd-text-spin">
                    <text
                      fontFamily="'Cinzel', 'Playfair Display', 'Trajan Pro', 'Georgia', serif"
                      fontSize="13"
                      fontWeight="900"
                      letterSpacing="2.5"
                      fill="url(#sultanGoldGrad)"
                    >
                      <textPath href="#sultanCirclePath" startOffset="0%">
                        ★ SULTAN RESTAURANT ★ JAHAN HAR MEHMAN HAI SULTAN ★ SULTAN RESTAURANT ★ JAHAN HAR MEHMAN HAI SULTAN ★
                      </textPath>
                    </text>
                  </g>
                </svg>
              </div>
            )}

            {/* Centerpiece Genuine Transparent Logo (Enlarged) */}
            <View
              style={[
                styles.logoImageHolder,
                {
                  width: logoHolderSize,
                  height: logoHolderSize,
                },
              ]}
              {...(Platform.OS === 'web' ? ({ className: 'cfd-logo-levitate' } as any) : {})}
            >
              <Image
                source={require('../../assets/images/sultan-logo.png')}
                style={{
                  width: logoImageSize,
                  height: logoImageSize,
                }}
                resizeMode="contain"
              />
            </View>
          </View>

          {/* Sultan Restaurant Official Brand Identity & Slogan */}
          <View
            style={[
              styles.idleSlideBox,
              {
                maxWidth: Math.min(840, Math.floor(width * 0.92)),
              },
            ]}
            {...(Platform.OS === 'web' ? ({ className: 'cfd-slogan-content' } as any) : {})}
          >
            {/* Top Royal Pill */}
            <View
              style={[
                styles.slideTagPill,
                {
                  paddingVertical: pillPaddingV,
                  paddingHorizontal: pillPaddingH,
                  marginBottom: Math.max(12, Math.floor(spacingBetween * 0.9)),
                },
              ]}
            >
              <Ionicons
                name="sparkles"
                size={Math.min(14, Math.max(10, Math.floor(englishFontSize * 0.8)))}
                color="#D4AF37"
              />
              <Text
                style={[
                  styles.slideTagText,
                  {
                    fontSize: Math.min(12, Math.max(9, Math.floor(englishFontSize * 0.7))),
                  },
                ]}
              >
                SULTAN RESTAURANT • شاہی مہمان نوازی
              </Text>
            </View>

            {/* Official Urdu Slogan: جہاں ہر مہمان ہے سلطان */}
            <Text
              style={[
                styles.idleUrduTitle,
                {
                  fontSize: urduFontSize,
                  lineHeight: urduLineHeight,
                  paddingBottom: Math.max(8, Math.floor(urduFontSize * 0.22)),
                  marginBottom: Math.max(14, Math.floor(spacingBetween * 1.0)),
                },
              ]}
              {...(Platform.OS === 'web' ? ({ className: 'cfd-urdu-slogan' } as any) : {})}
            >
              جہاں ہر مہمان ہے سلطان
            </Text>

            {/* Romanized Slogan Line */}
            <Text
              style={[
                styles.idleEnglishTitle,
                {
                  fontSize: englishFontSize,
                  lineHeight: Math.floor(englishFontSize * 1.4),
                  marginBottom: Math.max(12, Math.floor(spacingBetween * 0.85)),
                },
              ]}
            >
              JAHAN HAR MEHMAN HAI SULTAN
            </Text>

            {/* Brand Sub-title */}
            <View
              style={[
                styles.brandSubtitleRow,
                {
                  marginTop: Math.max(6, Math.floor(spacingBetween * 0.4)),
                },
              ]}
            >
              <View
                style={[
                  styles.goldLineAccent,
                  {
                    width: Math.min(48, Math.max(20, Math.floor(circleSize * 0.13))),
                  },
                ]}
              />
              <Text
                style={[
                  styles.idleSubtitle,
                  {
                    fontSize: subtitleFontSize,
                  },
                ]}
              >
                سلطان ریسٹورنٹ
              </Text>
              <View style={styles.goldDiamondDot}>
                <Ionicons
                  name="diamond"
                  size={Math.min(10, Math.max(7, Math.floor(subtitleFontSize * 0.8)))}
                  color="#D4AF37"
                />
              </View>
              <Text
                style={[
                  styles.idleSubtitle,
                  {
                    fontSize: subtitleFontSize,
                  },
                ]}
              >
                ROYAL DINING &amp; BBQ
              </Text>
              <View
                style={[
                  styles.goldLineAccent,
                  {
                    width: Math.min(48, Math.max(20, Math.floor(circleSize * 0.13))),
                  },
                ]}
              />
            </View>
          </View>
        </View>
      )}
    </IslamicBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#160205', // Royal Burgundy Obsidian Theme
  },

  // 1. Floating Time (Top-Right Only)
  floatingTopBar: {
    position: 'absolute',
    top: 16,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    zIndex: 100,
  },
  topBar: {
    height: 74,
    backgroundColor: '#1F0408',
    borderBottomWidth: 1.5,
    borderBottomColor: '#3E0C13',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    zIndex: 10,
  },
  brandGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  topLogo: {
    width: 48,
    height: 48,
  },
  brandTitle: {
    color: '#D4AF37',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  brandSubtitle: {
    color: '#E5C158',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
    letterSpacing: 0.5,
  },

  orderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#2D070E',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#52141C',
  },
  orderBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  orderBadgeText: {
    color: '#FDE68A',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  customerNameText: {
    color: '#10B981',
    fontSize: 13,
    fontWeight: '700',
    maxWidth: 160,
  },
  cashierPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(212, 175, 55, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 0.8,
    borderColor: 'rgba(212, 175, 55, 0.35)',
  },
  cashierText: {
    color: '#E5C158',
    fontSize: 11,
    fontWeight: '700',
  },

  topRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  clockPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#2D070E',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#52141C',
  },
  clockTime: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  clockDate: {
    color: '#C7A263',
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 4,
  },
  fullscreenToggleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#2D070E',
    borderWidth: 1,
    borderColor: '#52141C',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // 2. Idle Mode
  idleContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  idleGlowBackdrop: {
    position: 'absolute',
    backgroundColor: 'rgba(212, 175, 55, 0.07)',
    filter: 'blur(100px)' as any,
  },
  logoClipWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rippleWaveRing: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: 'rgba(212, 175, 55, 0.4)',
  },
  logoImageHolder: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  idleLogoImage: {
    maxWidth: '100%',
    maxHeight: '100%',
  },
  idleSlideBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  slideTagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(212, 175, 55, 0.12)',
    borderWidth: 1.2,
    borderColor: 'rgba(212, 175, 55, 0.4)',
    borderRadius: 22,
  },
  slideTagText: {
    color: '#F5D77F',
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  idleUrduTitle: {
    color: '#D4AF37',
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 1,
    fontFamily: Platform.select({
      web: "'Noto Nastaliq Urdu', 'Urdu Typesetting', 'Jameel Noori Nastaleeq', 'Amiri', 'Segoe UI', Tahoma, serif",
      default: undefined,
    }),
    textShadowColor: 'rgba(212, 175, 55, 0.55)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 14,
  },
  idleEnglishTitle: {
    color: '#FFFFFF',
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 2.5,
    textShadowColor: 'rgba(212, 175, 55, 0.4)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
  brandSubtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  goldLineAccent: {
    width: 45,
    height: 1.5,
    backgroundColor: 'rgba(212, 175, 55, 0.5)',
  },
  goldDiamondDot: {
    marginHorizontal: 4,
  },
  idleSubtitle: {
    color: '#E5C158',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1.5,
  },

  // 3. Active Mode
  activeWorkspace: {
    flex: 1,
    flexDirection: 'row',
    padding: 16,
    gap: 16,
  },

  // 3a. Order Dishes List
  orderListColumn: {
    flex: 6.2,
    backgroundColor: 'rgba(31, 4, 8, 0.92)',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#3E0C13',
    overflow: 'hidden',
  },
  columnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#28070E',
    borderBottomWidth: 1.5,
    borderBottomColor: '#3E0C13',
  },
  columnHeaderTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  columnHeaderTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  columnHeaderSubtitle: {
    color: '#D4AF37',
    fontSize: 12,
    fontWeight: '800',
    marginLeft: 6,
    letterSpacing: 0.5,
  },
  itemCountBadge: {
    backgroundColor: '#3D0A11',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#5B121C',
  },
  itemCountText: {
    color: '#D4AF37',
    fontSize: 12,
    fontWeight: '800',
  },

  itemsScrollView: {
    flex: 1,
  },
  itemsScrollContent: {
    padding: 14,
    gap: 10,
  },
  orderItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#28070E',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#430D15',
    gap: 12,
  },
  itemNumberCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#3D0A11',
    borderWidth: 1,
    borderColor: '#5E131E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemNumberText: {
    color: '#D4AF37',
    fontSize: 12,
    fontWeight: '800',
  },
  itemInfo: {
    flex: 1,
  },
  itemNameText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  itemNotesBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  itemNotesText: {
    color: '#F59E0B',
    fontSize: 12,
    fontWeight: '600',
  },
  itemVariantText: {
    color: '#E2CEB5',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  itemUnitPriceText: {
    color: '#C7A263',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 3,
  },
  itemQtyPill: {
    backgroundColor: '#33080F',
    borderWidth: 1.5,
    borderColor: '#55111B',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'center',
  },
  itemQtyLabel: {
    color: '#C7A263',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  itemQtyValue: {
    color: '#D4AF37',
    fontSize: 18,
    fontWeight: '900',
  },
  itemSubtotalBox: {
    alignItems: 'flex-end',
    minWidth: 95,
  },
  itemSubtotalLabel: {
    color: '#C7A263',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  itemSubtotalText: {
    color: '#10B981',
    fontSize: 17,
    fontWeight: '900',
  },

  // Empty Cart Guide
  emptyCartBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyCartIconOrb: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(212, 175, 55, 0.12)',
    borderWidth: 1.5,
    borderColor: '#D4AF37',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyCartTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 8,
  },
  emptyCartSubtitle: {
    color: '#C7A263',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    maxWidth: 420,
    lineHeight: 22,
  },

  // 3b. Summary & Giant Total Column
  summaryColumn: {
    flex: 3.8,
    gap: 14,
    justifyContent: 'space-between',
  },
  breakdownCard: {
    backgroundColor: 'rgba(31, 4, 8, 0.92)',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#3E0C13',
    padding: 16,
    gap: 10,
  },
  breakdownTitle: {
    color: '#FDE68A',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.8,
    borderBottomWidth: 1,
    borderBottomColor: '#3E0C13',
    paddingBottom: 8,
    marginBottom: 2,
  },
  calcRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  calcLabel: {
    color: '#C7A263',
    fontSize: 14,
    fontWeight: '600',
  },
  calcValue: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },

  // OVERSIZED GRAND TOTAL CONTAINER
  grandTotalContainer: {
    backgroundColor: '#072417', // Rich Deep Emerald Backdrop
    borderRadius: 18,
    borderWidth: 2.5,
    borderColor: '#D4AF37', // Royal Gold Border
    padding: 22,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
  },
  grandTotalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  totalIconOrb: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(212, 175, 55, 0.15)',
    borderWidth: 1.5,
    borderColor: '#D4AF37',
    alignItems: 'center',
    justifyContent: 'center',
  },
  grandTotalEnglish: {
    color: '#A7F3D0',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  grandTotalLabel: {
    color: '#FCD34D',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  giantPriceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginVertical: 4,
  },
  currencyPrefix: {
    color: '#D4AF37',
    fontSize: 26,
    fontWeight: '800',
    marginTop: 8,
  },
  giantAmountText: {
    color: '#FFFFFF',
    fontSize: 54, // Oversized typography
    fontWeight: '900',
    letterSpacing: -0.5,
    textShadowColor: 'rgba(212, 175, 55, 0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
  grandTotalDivider: {
    height: 1,
    backgroundColor: 'rgba(212, 175, 55, 0.3)',
    marginVertical: 12,
  },
  totalFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  inclusiveText: {
    color: '#A7F3D0',
    fontSize: 13,
    fontWeight: '700',
    fontFamily: Platform.select({
      web: "'Noto Nastaliq Urdu', 'Urdu Typesetting', 'Segoe UI', Tahoma, serif",
      default: undefined,
    }),
  },
  thankYouEnglish: {
    color: '#FCD34D',
    fontSize: 13,
    fontWeight: '800',
    fontFamily: Platform.select({
      web: "'Noto Nastaliq Urdu', 'Urdu Typesetting', 'Segoe UI', Tahoma, serif",
      default: undefined,
    }),
  },

  paymentStatusCard: {
    backgroundColor: '#28070E',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#4A1018',
    padding: 14,
    gap: 8,
  },
  paymentStatusLabel: {
    color: '#FDE68A',
    fontSize: 13,
    fontWeight: '700',
  },
  paymentStatusValue: {
    color: '#10B981',
    fontSize: 16,
    fontWeight: '900',
  },

  // 4. Celebration Paid Screen
  celebrationContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  celebrationCard: {
    backgroundColor: '#1F0408',
    borderWidth: 2,
    borderColor: '#D4AF37',
    borderRadius: 24,
    padding: 36,
    alignItems: 'center',
    maxWidth: 620,
    width: '100%',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 25,
  },
  successIconOrb: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 2,
    borderColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  celebrationEnglish: {
    color: '#D4AF37',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 1,
    textAlign: 'center',
    marginBottom: 8,
  },
  celebrationSubtitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 24,
  },
  paidStatsRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    marginBottom: 20,
  },
  paidStatBox: {
    flex: 1,
    backgroundColor: '#2B060D',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#4E0E17',
    padding: 12,
    alignItems: 'center',
  },
  paidStatLabel: {
    color: '#C7A263',
    fontSize: 10,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 4,
  },
  paidStatValue: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
  },
  celebrationNote: {
    color: '#E2CEB5',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  countdownContainer: {
    width: '100%',
    alignItems: 'center',
    gap: 8,
  },
  countdownText: {
    color: '#C7A263',
    fontSize: 12,
    fontWeight: '700',
  },
  countdownTrack: {
    width: '100%',
    height: 6,
    backgroundColor: '#2E060D',
    borderRadius: 3,
    overflow: 'hidden',
  },
  countdownFill: {
    height: '100%',
    backgroundColor: '#D4AF37',
    borderRadius: 3,
  },
});
