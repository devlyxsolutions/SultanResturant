import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  Easing,
  Platform,
  ViewStyle,
  TextStyle,
  useWindowDimensions,
} from 'react-native';
import Svg, {
  Rect,
  Circle,
  Line,
  Text as SvgText,
  G,
  Path,
  Defs,
  LinearGradient,
  Stop,
  ClipPath,
} from 'react-native-svg';
import { money } from '../../utils/format';

export interface DonutItem {
  label: string;
  value: number;
  color: string;
  count?: number;
}

export interface BarItem {
  label: string;
  value: number;
  color?: string;
  sublabel?: string;
  badge?: string;
}

export interface DailyTrendPoint {
  dateKey: string;
  label: string;
  revenue: number;
  opex: number;
  netProfit: number;
  orders: number;
}

/**
 * Reusable smooth progress hook (0 -> 1 easeOutCubic via requestAnimationFrame).
 * Works identically on Web, iOS, and Android with 60fps smoothness.
 */
function useEaseProgress(triggerKey: string, duration = 680, delay = 0): number {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let rafId = 0;
    let startTs: number | null = null;
    let cancelled = false;

    const timer = setTimeout(() => {
      const tick = (now: number) => {
        if (cancelled) return;
        if (startTs === null) startTs = now;
        const elapsed = now - startTs;
        const t = Math.min(1, elapsed / Math.max(120, duration));
        const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
        setProgress(eased);
        if (t < 1) {
          rafId = requestAnimationFrame(tick);
        }
      };
      rafId = requestAnimationFrame(tick);
    }, delay);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [triggerKey, duration, delay]);

  return progress;
}

// -------------------------------------------------------------
// 0A. AnimatedReveal: Smooth entrance animation for cards & tabs
// -------------------------------------------------------------
export function AnimatedReveal({
  children,
  delay = 0,
  animKey = 'default',
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  animKey?: string | number;
  style?: ViewStyle | ViewStyle[];
}) {
  const [opacity] = useState(() => new Animated.Value(0));
  const [translateY] = useState(() => new Animated.Value(16));

  useEffect(() => {
    opacity.setValue(0);
    translateY.setValue(16);

    const anim = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 420,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: Platform.OS !== 'web',
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 460,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: Platform.OS !== 'web',
      }),
    ]);

    anim.start();
    return () => anim.stop();
  }, [animKey, delay, opacity, translateY]);

  return (
    <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}

// -------------------------------------------------------------
// 0B. AnimatedCounter: Smooth 60fps count-up currency/number display
// -------------------------------------------------------------
export function AnimatedCounter({
  value,
  formatter = money,
  duration = 620,
  style,
  numberOfLines = 1,
}: {
  value: number;
  formatter?: (n: number) => string;
  duration?: number;
  style?: TextStyle | TextStyle[];
  numberOfLines?: number;
}) {
  const [displayValue, setDisplayValue] = useState(value);
  const prevRef = useRef(0);

  useEffect(() => {
    const from = prevRef.current;
    const to = Number.isFinite(value) ? value : 0;
    if (from === to) {
      setDisplayValue(to);
      return;
    }

    let rafId = 0;
    let startTs: number | null = null;
    let cancelled = false;

    const tick = (now: number) => {
      if (cancelled) return;
      if (startTs === null) startTs = now;
      const t = Math.min(1, (now - startTs) / Math.max(160, duration));
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayValue(from + (to - from) * eased);
      if (t < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        prevRef.current = to;
        setDisplayValue(to);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      prevRef.current = to;
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [value, duration]);

  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {formatter(displayValue)}
    </Text>
  );
}

// -------------------------------------------------------------
// 0C. MetricGaugeRing: Executive animated circular KPI ring gauge
// -------------------------------------------------------------
export function MetricGaugeRing({
  percent,
  label,
  sublabel,
  color = '#059669',
  size = 94,
  thickness = 10,
}: {
  percent: number;
  label: string;
  sublabel?: string;
  color?: string;
  size?: number;
  thickness?: number;
}) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
  const progress = useEaseProgress(`gauge-${Math.round(clamped * 10)}-${color}`, 720);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;
  const dash = (clamped / 100) * circumference * progress;

  return (
    <View style={styles.gaugeWrap}>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={size} height={size}>
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke="#E2E8F0"
            strokeWidth={thickness}
            fill="transparent"
          />
          <G transform={`rotate(-90 ${center} ${center})`}>
            <Circle
              cx={center}
              cy={center}
              r={radius}
              stroke={color}
              strokeWidth={thickness}
              strokeDasharray={`${dash} ${circumference}`}
              strokeLinecap="round"
              fill="transparent"
            />
          </G>
        </Svg>
        <View style={styles.gaugeCenter}>
          <Text style={[styles.gaugePct, { color }]}>{(clamped * progress).toFixed(1)}%</Text>
        </View>
      </View>
      <Text style={styles.gaugeLabel} numberOfLines={1}>
        {label}
      </Text>
      {sublabel ? (
        <Text style={styles.gaugeSub} numberOfLines={1}>
          {sublabel}
        </Text>
      ) : null}
    </View>
  );
}

// -------------------------------------------------------------
// Helper: Smooth clamped cubic Bezier path for line/area charts
// -------------------------------------------------------------
function buildSmoothSplinePath(
  points: { x: number; y: number }[],
  minY: number,
  maxY: number
): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  const clampY = (y: number) => Math.max(minY, Math.min(maxY, y));
  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = clampY(p1.y + (p2.y - p0.y) / 6);
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = clampY(p2.y - (p3.y - p1.y) / 6);

    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

function formatCompactMoney(val: number): string {
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 100_000) return `${sign}${Math.round(abs / 1000)}k`;
  if (abs >= 1_000) return `${sign}${(abs / 1000).toFixed(1)}k`;
  return `${sign}${Math.round(abs)}`;
}

// -------------------------------------------------------------
// 1. SvgDonutChart: Animated executive circular donut chart
// -------------------------------------------------------------
export function SvgDonutChart({
  data,
  size = 200,
  thickness = 26,
  centerTitle,
  centerSubtitle,
  plain = false,
  compactLegend = false,
}: {
  data: DonutItem[];
  size?: number;
  thickness?: number;
  centerTitle?: string;
  centerSubtitle?: string;
  plain?: boolean;
  compactLegend?: boolean;
}) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const total = data.reduce((acc, item) => acc + (item.value > 0 ? item.value : 0), 0);

  const dataKey = useMemo(
    () => data.map((d) => `${d.label}:${Math.round(d.value)}`).join('|'),
    [data]
  );
  const sweep = useEaseProgress(`donut-${dataKey}`, 780);

  const radius = (size - thickness - 10) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;
  const activeSegments = data.filter((d) => d.value > 0).length;
  const gapLen = activeSegments > 1 ? 3 : 0;

  const donutSegments = useMemo(() => {
    if (total <= 0) return [];
    let running = 0;
    return data.reduce<
      { item: DonutItem; idx: number; percent: number; startPercent: number }[]
    >((acc, item, idx) => {
      if (item.value <= 0) return acc;
      const percent = item.value / total;
      acc.push({ item, idx, percent, startPercent: running });
      running += percent;
      return acc;
    }, []);
  }, [data, total]);

  return (
    <View style={[styles.donutContainer, plain && styles.plainContainer]}>
      <View
        style={{
          width: size,
          height: size,
          position: 'relative',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Svg width={size} height={size}>
          {/* Subtle outer halo track */}
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke="#F1F5F9"
            strokeWidth={thickness}
            fill="transparent"
          />
          <Circle
            cx={center}
            cy={center}
            r={radius - thickness / 2 - 4}
            stroke="#F8FAFC"
            strokeWidth={2}
            fill="#FFFFFF"
          />

          {total > 0 && (
            <G transform={`rotate(-90 ${center} ${center})`}>
              {donutSegments.map(({ item, idx, percent, startPercent }) => {
                const segLen = Math.max(0, percent * circumference * sweep - gapLen);
                const strokeDasharray = `${segLen} ${circumference}`;
                const strokeDashoffset = -(startPercent * circumference * sweep);
                const isSelected = selectedIdx === idx;

                return (
                  <Circle
                    key={idx}
                    cx={center}
                    cy={center}
                    r={radius}
                    stroke={item.color}
                    strokeWidth={isSelected ? thickness + 6 : thickness}
                    strokeDasharray={strokeDasharray}
                    strokeDashoffset={strokeDashoffset}
                    fill="transparent"
                    strokeLinecap="butt"
                    opacity={selectedIdx !== null && !isSelected ? 0.35 : 1}
                    onPress={() => setSelectedIdx(isSelected ? null : idx)}
                  />
                );
              })}
            </G>
          )}
        </Svg>

        {/* Center Text Overlay */}
        <View style={[styles.donutCenterContent, { maxWidth: size - thickness * 2 - 20 }]}>
          <Text style={styles.donutCenterSub} numberOfLines={1}>
            {selectedIdx !== null ? data[selectedIdx]?.label : centerSubtitle || 'TOTAL'}
          </Text>
          <Text
            style={[
              styles.donutCenterTitle,
              selectedIdx !== null && { color: data[selectedIdx]?.color || '#0F172A' },
            ]}
            numberOfLines={1}
          >
            {selectedIdx !== null ? money(data[selectedIdx]?.value || 0) : centerTitle || money(total)}
          </Text>
          {selectedIdx !== null && total > 0 ? (
            <View
              style={[
                styles.donutCenterBadge,
                { backgroundColor: `${data[selectedIdx].color}18` },
              ]}
            >
              <Text style={[styles.donutCenterPercent, { color: data[selectedIdx].color }]}>
                {((data[selectedIdx].value / total) * 100).toFixed(1)}%
              </Text>
            </View>
          ) : (
            <Text style={styles.donutCenterHint}>Tap slice to inspect</Text>
          )}
        </View>
      </View>

      {/* Interactive Legend List with inline share bars */}
      <View style={[styles.legendContainer, compactLegend && styles.legendCompactGrid]}>
        {data.map((item, idx) => {
          const pctNum = total > 0 ? (item.value / total) * 100 : 0;
          const pct = pctNum.toFixed(1);
          const isSelected = selectedIdx === idx;
          return (
            <TouchableOpacity
              key={idx}
              style={[
                styles.legendItem,
                compactLegend && styles.legendItemCompact,
                isSelected && {
                  backgroundColor: `${item.color}10`,
                  borderColor: item.color,
                },
              ]}
              onPress={() => setSelectedIdx(isSelected ? null : idx)}
              activeOpacity={0.75}
            >
              <View style={[styles.legendDot, { backgroundColor: item.color }]} />
              <View style={styles.legendTextCol}>
                <View style={styles.legendHeaderRow}>
                  <Text
                    style={[styles.legendLabel, compactLegend && styles.legendLabelCompact]}
                    numberOfLines={1}
                  >
                    {item.label}
                  </Text>
                  <Text
                    style={[
                      styles.legendPct,
                      compactLegend && styles.legendPctCompact,
                      isSelected && { color: item.color },
                    ]}
                  >
                    {pct}%
                  </Text>
                </View>
                <View style={styles.legendSubRow}>
                  <Text style={[styles.legendValue, compactLegend && styles.legendValueCompact]}>
                    {money(item.value)}
                  </Text>
                  {item.count !== undefined && (
                    <Text style={[styles.legendCount, compactLegend && styles.legendCountCompact]}>
                      • {item.count} orders
                    </Text>
                  )}
                </View>
                <View style={styles.legendMiniTrack}>
                  <View
                    style={[
                      styles.legendMiniFill,
                      {
                        width: `${Math.min(100, Math.max(pctNum > 0 ? 3 : 0, pctNum * sweep))}%`,
                        backgroundColor: item.color,
                      },
                    ]}
                  />
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// -------------------------------------------------------------
// 2. SvgVerticalBarChart: Gradient SVG bars + staggered animation
// -------------------------------------------------------------
export function SvgVerticalBarChart({
  data,
  height = 215,
  barWidth = 42,
  valuePrefix = 'Rs. ',
  showPercentages = true,
  plain = false,
  fitContainer = false,
}: {
  data: BarItem[];
  height?: number;
  barWidth?: number;
  valuePrefix?: string;
  showPercentages?: boolean;
  plain?: boolean;
  fitContainer?: boolean;
}) {
  const { width } = useWindowDimensions();
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const dataKey = useMemo(
    () => data.map((d) => `${d.label}:${Math.round(d.value)}`).join('|'),
    [data]
  );
  const animProgress = useEaseProgress(`vbar-${dataKey}`, 760);

  const maxValue = Math.max(...data.map((d) => Math.abs(d.value)), 1);
  const chartHeight = height - 56;
  const totalPositive = data.reduce((sum, d) => sum + (d.value > 0 ? d.value : 0), 0);
  const calculatedMinWidth = fitContainer
    ? '100%'
    : Math.max(data.length * (barWidth + 28) + 46, Math.min(width - 80, 500));

  return (
    <View style={[styles.barChartContainer, plain && styles.plainContainer]}>
      <ScrollView
        horizontal={!fitContainer}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.barChartScroll, fitContainer && { width: '100%' }]}
      >
        <View
          style={{
            height: height + 10,
            width: fitContainer ? '100%' : undefined,
            minWidth: calculatedMinWidth,
            paddingLeft: 44,
          }}
        >
          {/* Reference Gridlines + Y-axis labels */}
          <Svg width="100%" height={chartHeight + 24} style={StyleSheet.absoluteFill}>
            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
              const y = chartHeight * (1 - ratio) + 22;
              return (
                <G key={ratio}>
                  <Line
                    x1="42"
                    y1={y}
                    x2="100%"
                    y2={y}
                    stroke={ratio === 0 ? '#CBD5E1' : '#E2E8F0'}
                    strokeWidth={ratio === 0 ? '1.5' : '1'}
                    strokeDasharray={ratio === 0 ? undefined : '4 4'}
                  />
                  <SvgText
                    x="37"
                    y={y + 3}
                    fontSize="9"
                    fontWeight="600"
                    fill="#94A3B8"
                    textAnchor="end"
                  >
                    {formatCompactMoney(maxValue * ratio)}
                  </SvgText>
                </G>
              );
            })}
          </Svg>

          {/* Animated Gradient Bars Row */}
          <View style={[styles.barsRow, { height: chartHeight + 22, paddingTop: 12 }]}>
            {data.map((item, idx) => {
              // Staggered progress per column for attractive wave grow-up effect
              const staggerOffset = Math.min(0.35, idx * 0.06);
              const localProgress = Math.max(
                0,
                Math.min(1, (animProgress - staggerOffset) / (1 - staggerOffset))
              );
              const targetH = Math.max((Math.abs(item.value) / maxValue) * (chartHeight - 30), 6);
              const barH = Math.max(3, targetH * localProgress);
              const color = item.color || '#2563EB';
              const isSelected = selectedIdx === idx;
              const pct =
                totalPositive > 0 && item.value > 0
                  ? ((item.value / totalPositive) * 100).toFixed(0)
                  : null;
              const gradId = `barGrad_${idx}_${color.replace('#', '')}`;

              return (
                <TouchableOpacity
                  key={idx}
                  style={[styles.barCol, { width: barWidth + 24 }]}
                  onPress={() => setSelectedIdx(isSelected ? null : idx)}
                  activeOpacity={0.82}
                >
                  {/* Value Pill Above Bar */}
                  <View
                    style={[
                      styles.barTopBadge,
                      isSelected && {
                        backgroundColor: `${color}15`,
                        borderRadius: 6,
                        paddingHorizontal: 5,
                        paddingVertical: 1,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.barTopValue,
                        isSelected && { color, fontWeight: '900' },
                      ]}
                      numberOfLines={1}
                    >
                      {formatCompactMoney(item.value)}
                    </Text>
                    {showPercentages && pct && <Text style={styles.barTopPct}>{pct}%</Text>}
                  </View>

                  {/* Gradient SVG Rounded Column */}
                  <View style={[styles.barTrack, { height: chartHeight - 24 }]}>
                    <Svg width={barWidth + 4} height={barH + 2}>
                      <Defs>
                        <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                          <Stop offset="0%" stopColor={color} stopOpacity="1" />
                          <Stop offset="100%" stopColor={color} stopOpacity="0.68" />
                        </LinearGradient>
                      </Defs>
                      <Rect
                        x={2}
                        y={1}
                        width={barWidth}
                        height={barH}
                        rx={8}
                        ry={8}
                        fill={`url(#${gradId})`}
                        stroke={isSelected ? '#0F172A' : 'transparent'}
                        strokeWidth={isSelected ? 2 : 0}
                        opacity={selectedIdx !== null && !isSelected ? 0.35 : 1}
                      />
                      {/* Glossy top sheen */}
                      {barH > 12 && (
                        <Rect
                          x={6}
                          y={4}
                          width={Math.max(4, barWidth - 8)}
                          height={3}
                          rx={1.5}
                          fill="#FFFFFF"
                          opacity={0.38}
                        />
                      )}
                    </Svg>
                  </View>

                  {/* X-Axis Label Below Bar */}
                  <Text
                    style={[styles.barLabel, isSelected && { color: '#0F172A', fontWeight: '800' }]}
                    numberOfLines={2}
                  >
                    {item.label}
                  </Text>
                  {item.sublabel && (
                    <Text style={styles.barSublabel} numberOfLines={1}>
                      {item.sublabel}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </ScrollView>

      {/* Selected Indicator Detail Pill */}
      {selectedIdx !== null && data[selectedIdx] && (
        <View
          style={[
            styles.barDetailPill,
            { borderColor: `${data[selectedIdx].color || '#2563EB'}55` },
          ]}
        >
          <View
            style={[styles.legendDot, { backgroundColor: data[selectedIdx].color || '#2563EB' }]}
          />
          <Text style={styles.barDetailTitle}>{data[selectedIdx].label}:</Text>
          <Text
            style={[styles.barDetailValue, { color: data[selectedIdx].color || '#059669' }]}
          >
            {valuePrefix === 'Rs. ' ? money(data[selectedIdx].value) : `${valuePrefix}${data[selectedIdx].value}`}
          </Text>
          {data[selectedIdx].sublabel && (
            <Text style={styles.barDetailSub}>• {data[selectedIdx].sublabel}</Text>
          )}
        </View>
      )}
    </View>
  );
}

// -------------------------------------------------------------
// 3. SvgHourlyVelocityChart: Smooth Bezier 24-hr curve + reveal
// -------------------------------------------------------------
export function SvgHourlyVelocityChart({
  hourlyData,
  height = 205,
  accentColor = '#52171B',
}: {
  hourlyData: Record<number, { count: number; revenue: number }>;
  height?: number;
  accentColor?: string;
}) {
  const [selectedHour, setSelectedHour] = useState<number | null>(null);

  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);
  const maxRevenue = Math.max(...hours.map((h) => hourlyData[h]?.revenue || 0), 100);
  const totalRevenue = hours.reduce((acc, h) => acc + (hourlyData[h]?.revenue || 0), 0);
  const totalOrders = hours.reduce((acc, h) => acc + (hourlyData[h]?.count || 0), 0);

  const dataKey = `${Math.round(totalRevenue)}-${totalOrders}`;
  const reveal = useEaseProgress(`hourly-${dataKey}`, 850);

  let peakHour = 0;
  let peakRev = 0;
  hours.forEach((h) => {
    if ((hourlyData[h]?.revenue || 0) > peakRev) {
      peakRev = hourlyData[h]?.revenue || 0;
      peakHour = h;
    }
  });

  const chartWidth = 600;
  const paddingLeft = 48;
  const paddingRight = 22;
  const paddingTop = 26;
  const paddingBottom = 30;
  const innerW = chartWidth - paddingLeft - paddingRight;
  const innerH = height - paddingTop - paddingBottom;

  const points = hours.map((h) => {
    const x = paddingLeft + (h / 23) * innerW;
    const rev = hourlyData[h]?.revenue || 0;
    const y = paddingTop + innerH - (rev / maxRevenue) * innerH;
    return { x, y, hour: h, revenue: rev, count: hourlyData[h]?.count || 0 };
  });

  const linePath = buildSmoothSplinePath(points, paddingTop, paddingTop + innerH);
  const areaPath = `${linePath} L ${(paddingLeft + innerW).toFixed(1)} ${(paddingTop + innerH).toFixed(1)} L ${paddingLeft} ${(paddingTop + innerH).toFixed(1)} Z`;

  const formatHr = (h: number) =>
    h === 0 ? '12 AM' : h === 12 ? '12 PM' : h > 12 ? `${h - 12} PM` : `${h} AM`;

  const inspectedHour = selectedHour !== null ? selectedHour : peakRev > 0 ? peakHour : null;
  const inspectedStats = inspectedHour !== null ? hourlyData[inspectedHour] : null;

  return (
    <View style={styles.hourlyContainer}>
      <View style={styles.hourlyHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.hourlyTitle}>24-Hour Revenue & Rush Curve</Text>
          <Text style={styles.hourlySubtitle}>
            Smooth velocity curve • Total: {money(totalRevenue)} ({totalOrders} bills)
          </Text>
        </View>
        {peakRev > 0 && (
          <View style={styles.peakBadge}>
            <Text style={styles.peakBadgeLabel}>PEAK RUSH: </Text>
            <Text style={styles.peakBadgeVal}>
              {formatHr(peakHour)} ({money(peakRev)})
            </Text>
          </View>
        )}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ width: chartWidth, height }}>
          <Svg width={chartWidth} height={height}>
            <Defs>
              <LinearGradient id="velocityGradV2" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%" stopColor={accentColor} stopOpacity="0.34" />
                <Stop offset="65%" stopColor="#D4AF37" stopOpacity="0.12" />
                <Stop offset="100%" stopColor={accentColor} stopOpacity="0.01" />
              </LinearGradient>
              <ClipPath id="velocityRevealClip">
                <Rect
                  x={paddingLeft - 6}
                  y={0}
                  width={(innerW + 14) * reveal}
                  height={height}
                />
              </ClipPath>
            </Defs>

            {/* Horizontal Gridlines & Y-Axis Scale */}
            {[0, 0.5, 1].map((r) => {
              const y = paddingTop + innerH * (1 - r);
              return (
                <G key={r}>
                  <Line
                    x1={paddingLeft}
                    y1={y}
                    x2={chartWidth - paddingRight}
                    y2={y}
                    stroke={r === 0 ? '#CBD5E1' : '#E2E8F0'}
                    strokeWidth={r === 0 ? '1.3' : '1'}
                    strokeDasharray={r === 0 ? undefined : '4 4'}
                  />
                  <SvgText
                    x={paddingLeft - 8}
                    y={y + 3.5}
                    fontSize="9"
                    fontWeight="600"
                    fill="#94A3B8"
                    textAnchor="end"
                  >
                    {formatCompactMoney(maxRevenue * r)}
                  </SvgText>
                </G>
              );
            })}

            {/* Animated Smooth Spline Curve + Gradient Area */}
            <G clipPath="url(#velocityRevealClip)">
              <Path d={areaPath} fill="url(#velocityGradV2)" />
              <Path
                d={linePath}
                fill="none"
                stroke={accentColor}
                strokeWidth="3"
                strokeLinecap="round"
              />
            </G>

            {/* Vertical Selection Crosshair */}
            {inspectedHour !== null && points[inspectedHour] && (
              <Line
                x1={points[inspectedHour].x}
                y1={paddingTop}
                x2={points[inspectedHour].x}
                y2={paddingTop + innerH}
                stroke="#B48214"
                strokeWidth="1.2"
                strokeDasharray="3 3"
                opacity={0.75}
              />
            )}

            {/* Interactive Dots */}
            {points.map((pt) => {
              const isPeak = pt.hour === peakHour && peakRev > 0;
              const isSelected = selectedHour === pt.hour;
              if (pt.revenue === 0 && !isSelected) return null;

              return (
                <G key={pt.hour}>
                  {(isPeak || isSelected) && (
                    <Circle
                      cx={pt.x}
                      cy={pt.y}
                      r={isSelected ? 10 : 9}
                      fill={isSelected ? accentColor : '#D4AF37'}
                      opacity={0.22 * reveal}
                    />
                  )}
                  <Circle
                    cx={pt.x}
                    cy={pt.y}
                    r={isSelected ? 5.5 : isPeak ? 5 : 3.5}
                    fill={isSelected ? accentColor : isPeak ? '#B48214' : '#FFFFFF'}
                    stroke={isSelected ? '#FFFFFF' : accentColor}
                    strokeWidth="2.2"
                    onPress={() => setSelectedHour(isSelected ? null : pt.hour)}
                  />
                </G>
              );
            })}

            {/* X-Axis Hour Labels */}
            {[0, 3, 6, 9, 12, 15, 18, 21, 23].map((h) => {
              const x = paddingLeft + (h / 23) * innerW;
              return (
                <SvgText
                  key={h}
                  x={x}
                  y={height - 8}
                  fontSize="9.5"
                  fill="#64748B"
                  textAnchor="middle"
                  fontWeight="700"
                >
                  {formatHr(h)}
                </SvgText>
              );
            })}
          </Svg>
        </View>
      </ScrollView>

      {/* Active Hour Inspector Pill */}
      {inspectedHour !== null && inspectedStats && (
        <View style={styles.inspectorStrip}>
          <View style={[styles.legendDot, { backgroundColor: '#B48214' }]} />
          <Text style={styles.inspectorTitle}>
            {selectedHour !== null ? 'Selected Hour' : 'Peak Hour'} ({formatHr(inspectedHour)}):
          </Text>
          <Text style={styles.inspectorVal}>{money(inspectedStats.revenue)}</Text>
          <Text style={styles.inspectorSub}>
            • {inspectedStats.count} bills • Avg{' '}
            {money(inspectedStats.count > 0 ? inspectedStats.revenue / inspectedStats.count : 0)}
          </Text>
        </View>
      )}

      {/* Hourly Quick Selector Chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hourChipScroll}>
        {hours
          .filter((h) => (hourlyData[h]?.count || 0) > 0)
          .map((h) => {
            const isSelected = selectedHour === h;
            const isPeak = h === peakHour && peakRev > 0;
            return (
              <TouchableOpacity
                key={h}
                style={[
                  styles.hourChip,
                  isSelected && styles.hourChipSelected,
                  isPeak && !isSelected && styles.hourChipPeak,
                ]}
                onPress={() => setSelectedHour(isSelected ? null : h)}
              >
                <Text
                  style={[
                    styles.hourChipTime,
                    (isSelected || isPeak) && { color: isSelected ? '#FFFFFF' : '#78350F', fontWeight: '800' },
                  ]}
                >
                  {formatHr(h)}
                </Text>
                <Text style={[styles.hourChipRev, isSelected && { color: '#FDE68A' }]}>
                  {money(hourlyData[h]?.revenue || 0)}
                </Text>
              </TouchableOpacity>
            );
          })}
      </ScrollView>
    </View>
  );
}

// -------------------------------------------------------------
// 3B. SvgRevenueTrendChart: Multi-day Revenue vs Opex smooth spline
// -------------------------------------------------------------
export function SvgRevenueTrendChart({
  series,
  height = 215,
  title = 'Daily Revenue vs Operating Costs Trend',
  subtitle = 'Multi-day topline performance & expense trajectory',
}: {
  series: DailyTrendPoint[];
  height?: number;
  title?: string;
  subtitle?: string;
}) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const dataKey = useMemo(
    () => series.map((d) => `${d.dateKey}:${Math.round(d.revenue)}:${Math.round(d.opex)}`).join('|'),
    [series]
  );
  const reveal = useEaseProgress(`trend-${dataKey}`, 850);

  if (series.length === 0) {
    return (
      <View style={styles.hourlyContainer}>
        <Text style={styles.hourlyTitle}>{title}</Text>
        <Text style={styles.emptyText}>No multi-day trend points recorded in this range.</Text>
      </View>
    );
  }

  const maxVal = Math.max(...series.map((d) => Math.max(d.revenue, d.opex)), 100);
  const chartWidth = Math.max(560, series.length * 54);
  const paddingLeft = 50;
  const paddingRight = 24;
  const paddingTop = 26;
  const paddingBottom = 32;
  const innerW = chartWidth - paddingLeft - paddingRight;
  const innerH = height - paddingTop - paddingBottom;

  const revPoints = series.map((d, i) => {
    const x = series.length === 1 ? paddingLeft + innerW / 2 : paddingLeft + (i / (series.length - 1)) * innerW;
    const y = paddingTop + innerH - (d.revenue / maxVal) * innerH;
    return { x, y, ...d };
  });

  const opexPoints = series.map((d, i) => {
    const x = series.length === 1 ? paddingLeft + innerW / 2 : paddingLeft + (i / (series.length - 1)) * innerW;
    const y = paddingTop + innerH - (d.opex / maxVal) * innerH;
    return { x, y };
  });

  const revLine = buildSmoothSplinePath(revPoints, paddingTop, paddingTop + innerH);
  const revArea = `${revLine} L ${revPoints[revPoints.length - 1].x.toFixed(1)} ${(paddingTop + innerH).toFixed(1)} L ${revPoints[0].x.toFixed(1)} ${(paddingTop + innerH).toFixed(1)} Z`;
  const opexLine = buildSmoothSplinePath(opexPoints, paddingTop, paddingTop + innerH);

  let peakIdx = 0;
  series.forEach((d, i) => {
    if (d.revenue > (series[peakIdx]?.revenue || 0)) peakIdx = i;
  });
  const activeIdx = selectedIdx !== null && series[selectedIdx] ? selectedIdx : peakIdx;
  const activePoint = series[activeIdx];

  return (
    <View style={styles.hourlyContainer}>
      <View style={styles.hourlyHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.hourlyTitle}>{title}</Text>
          <Text style={styles.hourlySubtitle}>{subtitle}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={styles.trendLegendPill}>
            <View style={[styles.legendDotSmall, { backgroundColor: '#059669' }]} />
            <Text style={styles.trendLegendText}>Revenue</Text>
          </View>
          <View style={styles.trendLegendPill}>
            <View style={[styles.legendDotSmall, { backgroundColor: '#E11D48' }]} />
            <Text style={styles.trendLegendText}>OPEX</Text>
          </View>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ width: chartWidth, height }}>
          <Svg width={chartWidth} height={height}>
            <Defs>
              <LinearGradient id="trendRevGrad" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%" stopColor="#059669" stopOpacity="0.28" />
                <Stop offset="100%" stopColor="#059669" stopOpacity="0.01" />
              </LinearGradient>
              <ClipPath id="trendRevealClip">
                <Rect x={paddingLeft - 8} y={0} width={(innerW + 18) * reveal} height={height} />
              </ClipPath>
            </Defs>

            {[0, 0.5, 1].map((r) => {
              const y = paddingTop + innerH * (1 - r);
              return (
                <G key={r}>
                  <Line
                    x1={paddingLeft}
                    y1={y}
                    x2={chartWidth - paddingRight}
                    y2={y}
                    stroke={r === 0 ? '#CBD5E1' : '#E2E8F0'}
                    strokeWidth={r === 0 ? '1.3' : '1'}
                    strokeDasharray={r === 0 ? undefined : '4 4'}
                  />
                  <SvgText
                    x={paddingLeft - 8}
                    y={y + 3.5}
                    fontSize="9"
                    fontWeight="600"
                    fill="#94A3B8"
                    textAnchor="end"
                  >
                    {formatCompactMoney(maxVal * r)}
                  </SvgText>
                </G>
              );
            })}

            <G clipPath="url(#trendRevealClip)">
              {revPoints.length > 1 && <Path d={revArea} fill="url(#trendRevGrad)" />}
              {revPoints.length > 1 && (
                <Path d={revLine} fill="none" stroke="#059669" strokeWidth="3" strokeLinecap="round" />
              )}
              {opexPoints.length > 1 && (
                <Path
                  d={opexLine}
                  fill="none"
                  stroke="#E11D48"
                  strokeWidth="2"
                  strokeDasharray="5 4"
                  strokeLinecap="round"
                />
              )}
            </G>

            {revPoints.map((pt, idx) => {
              const isSelected = activeIdx === idx;
              const showLabel = series.length <= 10 || idx % Math.ceil(series.length / 8) === 0 || idx === series.length - 1;
              return (
                <G key={pt.dateKey}>
                  {isSelected && (
                    <>
                      <Line
                        x1={pt.x}
                        y1={paddingTop}
                        x2={pt.x}
                        y2={paddingTop + innerH}
                        stroke="#B48214"
                        strokeWidth="1.2"
                        strokeDasharray="3 3"
                      />
                      <Circle cx={pt.x} cy={pt.y} r={9} fill="#059669" opacity={0.2 * reveal} />
                    </>
                  )}
                  <Circle
                    cx={pt.x}
                    cy={pt.y}
                    r={isSelected ? 5.5 : 3.5}
                    fill={isSelected ? '#059669' : '#FFFFFF'}
                    stroke={isSelected ? '#FFFFFF' : '#059669'}
                    strokeWidth="2.2"
                    onPress={() => setSelectedIdx(idx)}
                  />
                  {showLabel && (
                    <SvgText
                      x={pt.x}
                      y={height - 8}
                      fontSize="9.5"
                      fill={isSelected ? '#52171B' : '#64748B'}
                      fontWeight={isSelected ? '800' : '600'}
                      textAnchor="middle"
                    >
                      {pt.label}
                    </SvgText>
                  )}
                </G>
              );
            })}
          </Svg>
        </View>
      </ScrollView>

      {activePoint && (
        <View style={styles.inspectorStrip}>
          <View style={[styles.legendDot, { backgroundColor: '#059669' }]} />
          <Text style={styles.inspectorTitle}>
            {selectedIdx !== null ? activePoint.label : `Best Day (${activePoint.label})`}:
          </Text>
          <Text style={styles.inspectorVal}>{money(activePoint.revenue)}</Text>
          <Text style={styles.inspectorSub}>
            • {activePoint.orders} orders • OPEX {money(activePoint.opex)} • Net{' '}
            {money(activePoint.netProfit)}
          </Text>
        </View>
      )}
    </View>
  );
}

// -------------------------------------------------------------
// 4. HorizontalRankedBars: Sleek animated ranked bars + medals
// -------------------------------------------------------------
export function HorizontalRankedBars({
  items,
  title,
  subtitle,
  valuePrefix = 'Rs. ',
  plain = false,
}: {
  items: { label: string; value: number; color?: string; count?: number; secondary?: string }[];
  title?: string;
  subtitle?: string;
  valuePrefix?: string;
  plain?: boolean;
}) {
  const maxValue = Math.max(...items.map((it) => it.value), 1);
  const totalValue = items.reduce((sum, it) => sum + it.value, 0);

  const dataKey = useMemo(
    () => items.map((it) => `${it.label}:${Math.round(it.value)}`).join('|'),
    [items]
  );
  const progress = useEaseProgress(`ranked-${dataKey}`, 740);

  return (
    <View style={[styles.rankedCard, plain && styles.plainContainer]}>
      {title && (
        <View style={styles.rankedHeader}>
          <Text style={styles.rankedTitle}>{title}</Text>
          {subtitle && <Text style={styles.rankedSub}>{subtitle}</Text>}
        </View>
      )}

      {items.length === 0 ? (
        <Text style={styles.emptyText}>No data recorded for this period.</Text>
      ) : (
        items.map((it, idx) => {
          const pct = totalValue > 0 ? ((it.value / totalValue) * 100).toFixed(1) : '0';
          const stagger = Math.min(0.35, idx * 0.06);
          const localP = Math.max(0, Math.min(1, (progress - stagger) / (1 - stagger)));
          const barW = Math.max((it.value / maxValue) * 100 * localP, it.value > 0 ? 2 : 0);
          const color =
            it.color || (idx === 0 ? '#B48214' : idx === 1 ? '#52171B' : idx === 2 ? '#059669' : '#2563EB');

          const medalBg =
            idx === 0 ? '#FEF3C7' : idx === 1 ? '#F1F5F9' : idx === 2 ? '#FFEDD5' : `${color}15`;
          const medalColor =
            idx === 0 ? '#B45309' : idx === 1 ? '#475569' : idx === 2 ? '#C2410C' : color;

          return (
            <View key={idx} style={styles.rankedRow}>
              <View style={styles.rankedLabelCol}>
                <View style={styles.rankedNameRow}>
                  <View style={[styles.rankBadge, { backgroundColor: medalBg }]}>
                    <Text style={[styles.rankBadgeText, { color: medalColor }]}>#{idx + 1}</Text>
                  </View>
                  <Text style={styles.rankedName} numberOfLines={1}>
                    {it.label}
                  </Text>
                </View>
                <View style={styles.rankedValRow}>
                  <Text style={styles.rankedValText}>
                    {valuePrefix === 'Rs. ' ? money(it.value) : `${valuePrefix}${it.value}`}
                  </Text>
                  <View style={[styles.rankedPctPill, { backgroundColor: `${color}14` }]}>
                    <Text style={[styles.rankedPctText, { color }]}>{pct}%</Text>
                  </View>
                  {it.count !== undefined && (
                    <Text style={styles.rankedCountText}>• {it.count} units</Text>
                  )}
                </View>
              </View>

              {/* Animated Bar Fill */}
              <View style={styles.rankedBarTrack}>
                <View style={[styles.rankedBarFill, { width: `${barW}%`, backgroundColor: color }]} />
              </View>
            </View>
          );
        })
      )}
    </View>
  );
}

// -------------------------------------------------------------
// 5. PnLFlowWaterfallChart: Animated CFO Capital Flow Waterfall
// -------------------------------------------------------------
export function PnLFlowWaterfallChart({
  grossRevenue,
  cogs,
  opex,
  damageLoss,
  netProfit,
}: {
  grossRevenue: number;
  cogs: number;
  opex: number;
  damageLoss: number;
  netProfit: number;
}) {
  const dataKey = `${Math.round(grossRevenue)}-${Math.round(cogs)}-${Math.round(opex)}-${Math.round(damageLoss)}`;
  const progress = useEaseProgress(`waterfall-${dataKey}`, 800);

  const steps = [
    { label: 'Gross Revenue', value: grossRevenue, color: '#059669', type: 'inflow', tag: '+ INFLOW', sub: 'Total Combined Topline' },
    { label: 'Cost of Goods (COGS)', value: cogs, color: '#D97706', type: 'outflow', tag: '- DIRECT', sub: 'Raw Kitchen Provisions / POs' },
    { label: 'Operating Opex', value: opex, color: '#E11D48', type: 'outflow', tag: '- OPEX', sub: 'Salaries, Utilities, Supplies' },
    { label: 'Breakage & Losses', value: damageLoss, color: '#9333EA', type: 'outflow', tag: '- LOSS', sub: 'Crockery & Shrinkage Write-Off' },
    {
      label: 'Net EBITDA Profit',
      value: netProfit,
      color: netProfit >= 0 ? '#059669' : '#BE123C',
      type: 'result',
      tag: netProfit >= 0 ? '= PROFIT' : '= DEFICIT',
      sub: netProfit >= 0 ? 'Healthy Operating Margin' : 'Operating Deficit — Review Costs',
    },
  ];

  return (
    <View style={styles.waterfallCard}>
      <View style={styles.waterfallHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.waterfallTitle}>P&L Capital Flow Breakdown</Text>
            <Text style={styles.waterfallSub}>How topline revenue converts into bottom-line profit</Text>
          </View>
          <View
            style={[
              styles.waterfallMarginChip,
              {
                backgroundColor: netProfit >= 0 ? '#ECFDF5' : '#FFF1F2',
                borderColor: netProfit >= 0 ? '#A7F3D0' : '#FECDD3',
              },
            ]}
          >
            <Text
              style={[
                styles.waterfallMarginText,
                { color: netProfit >= 0 ? '#047857' : '#BE123C' },
              ]}
            >
              {grossRevenue > 0 ? `${((netProfit / grossRevenue) * 100).toFixed(1)}% NET` : '0.0% NET'}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.waterfallSteps}>
        {steps.map((st, i) => {
          const isResult = st.type === 'result';
          const isOutflow = st.type === 'outflow';
          const pctOfGross = grossRevenue > 0 ? ((Math.abs(st.value) / grossRevenue) * 100).toFixed(1) : '0.0';
          const stagger = Math.min(0.4, i * 0.08);
          const localP = Math.max(0, Math.min(1, (progress - stagger) / (1 - stagger)));
          const barPct = Math.min(Math.max((Math.abs(st.value) / (grossRevenue || 1)) * 100, st.value !== 0 ? 3 : 0), 100) * localP;

          return (
            <View
              key={i}
              style={[
                styles.waterfallStep,
                isResult &&
                  (netProfit >= 0
                    ? styles.waterfallStepResult
                    : { backgroundColor: '#FFF1F2', borderColor: '#FECDD3' }),
              ]}
            >
              <View style={styles.waterfallTopRow}>
                <View style={styles.waterfallTitleCol}>
                  <View style={[styles.waterfallIndicator, { backgroundColor: st.color }]} />
                  <Text
                    style={[
                      styles.waterfallLabel,
                      isResult && {
                        fontSize: 13.5,
                        fontWeight: '900',
                        color: netProfit >= 0 ? '#065F46' : '#9F1239',
                      },
                    ]}
                  >
                    {st.label}
                  </Text>
                  <View style={[styles.waterfallTag, { backgroundColor: `${st.color}16` }]}>
                    <Text style={[styles.waterfallTagText, { color: st.color }]}>{st.tag}</Text>
                  </View>
                </View>
                <View style={styles.waterfallAmountCol}>
                  <Text
                    style={[
                      styles.waterfallAmount,
                      { color: isOutflow ? '#BE123C' : st.color },
                      isResult && styles.waterfallAmountResult,
                    ]}
                  >
                    {isOutflow ? `- ${money(st.value)}` : money(st.value)}
                  </Text>
                  <Text style={styles.waterfallPct}>
                    {isResult
                      ? `${((netProfit / (grossRevenue || 1)) * 100).toFixed(1)}% margin`
                      : `${pctOfGross}% of sales`}
                  </Text>
                </View>
              </View>

              <View style={styles.waterfallTrack}>
                <View
                  style={[
                    styles.waterfallFill,
                    {
                      width: `${barPct}%`,
                      backgroundColor: st.color,
                    },
                  ]}
                />
              </View>
              <Text style={styles.waterfallSubtext}>{st.sub}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  plainContainer: {
    backgroundColor: 'transparent',
    borderRadius: 0,
    borderWidth: 0,
    borderColor: 'transparent',
    padding: 0,
    gap: 12,
  },
  // Gauge Ring
  gaugeWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  gaugeCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gaugePct: {
    fontSize: 15,
    fontWeight: '900',
  },
  gaugeLabel: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 6,
  },
  gaugeSub: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 1,
  },
  // Donut
  donutContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    alignItems: 'center',
    gap: 16,
  },
  donutCenterContent: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutCenterSub: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  donutCenterTitle: {
    fontSize: 15.5,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 2,
  },
  donutCenterBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    marginTop: 3,
  },
  donutCenterPercent: {
    fontSize: 11,
    fontWeight: '800',
    color: '#059669',
  },
  donutCenterHint: {
    fontSize: 9.5,
    color: '#94A3B8',
    marginTop: 3,
  },
  legendContainer: {
    width: '100%',
    gap: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 11,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  legendCompactGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  legendItemCompact: {
    flex: 1,
    minWidth: 135,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    gap: 6,
  },
  legendLabelCompact: {
    fontSize: 11,
    fontWeight: '700',
  },
  legendPctCompact: {
    fontSize: 10.5,
  },
  legendValueCompact: {
    fontSize: 10.5,
  },
  legendCountCompact: {
    fontSize: 9.5,
  },
  legendDot: {
    width: 11,
    height: 11,
    borderRadius: 6,
  },
  legendDotSmall: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendTextCol: {
    flex: 1,
  },
  legendHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  legendLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
    flex: 1,
  },
  legendPct: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
    marginLeft: 6,
  },
  legendSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  legendValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  legendCount: {
    fontSize: 11,
    color: '#94A3B8',
  },
  legendMiniTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E2E8F0',
    overflow: 'hidden',
    marginTop: 5,
  },
  legendMiniFill: {
    height: '100%',
    borderRadius: 2,
  },

  // Bar Chart
  barChartContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    gap: 10,
  },
  barChartScroll: {
    paddingVertical: 4,
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
  },
  barCol: {
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  barTopBadge: {
    alignItems: 'center',
    marginBottom: 5,
  },
  barTopValue: {
    fontSize: 11,
    fontWeight: '800',
    color: '#334155',
  },
  barTopPct: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#94A3B8',
  },
  barTrack: {
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  barLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    textAlign: 'center',
    marginTop: 7,
  },
  barSublabel: {
    fontSize: 9.5,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 2,
  },
  barDetailPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  barDetailTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  barDetailValue: {
    fontSize: 13,
    fontWeight: '900',
    color: '#059669',
  },
  barDetailSub: {
    fontSize: 11.5,
    color: '#64748B',
  },

  // Hourly / Trend Chart
  hourlyContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    gap: 12,
  },
  hourlyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 8,
  },
  hourlyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  hourlySubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  peakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  peakBadgeLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#92400E',
  },
  peakBadgeVal: {
    fontSize: 11,
    fontWeight: '900',
    color: '#78350F',
  },
  trendLegendPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  trendLegendText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#475569',
  },
  inspectorStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FAF6EE',
    borderWidth: 1,
    borderColor: '#E7E0D3',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  inspectorTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#52171B',
  },
  inspectorVal: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0F172A',
  },
  inspectorSub: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '600',
  },
  hourChipScroll: {
    gap: 6,
    paddingTop: 2,
  },
  hourChip: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 6,
    paddingHorizontal: 11,
    borderRadius: 9,
    alignItems: 'center',
  },
  hourChipSelected: {
    backgroundColor: '#52171B',
    borderColor: '#52171B',
  },
  hourChipPeak: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  hourChipTime: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#475569',
  },
  hourChipRev: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#059669',
    marginTop: 1,
  },

  // Ranked Bars
  rankedCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    gap: 13,
  },
  rankedHeader: {
    marginBottom: 2,
  },
  rankedTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  rankedSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  rankedRow: {
    gap: 6,
  },
  rankedLabelCol: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
  },
  rankedNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flex: 1,
    minWidth: 140,
  },
  rankBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    minWidth: 28,
    alignItems: 'center',
  },
  rankBadgeText: {
    fontSize: 10.5,
    fontWeight: '900',
  },
  rankedName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
    flex: 1,
  },
  rankedValRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rankedValText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  rankedPctPill: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 5,
  },
  rankedPctText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  rankedCountText: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
  },
  rankedBarTrack: {
    height: 9,
    backgroundColor: '#F1F5F9',
    borderRadius: 5,
    overflow: 'hidden',
  },
  rankedBarFill: {
    height: '100%',
    borderRadius: 5,
  },
  emptyText: {
    fontSize: 13,
    color: '#94A3B8',
    fontStyle: 'italic',
    paddingVertical: 10,
  },

  // Waterfall
  waterfallCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    gap: 14,
  },
  waterfallHeader: {
    marginBottom: 2,
  },
  waterfallTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  waterfallSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  waterfallMarginChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  waterfallMarginText: {
    fontSize: 11,
    fontWeight: '900',
  },
  waterfallSteps: {
    gap: 10,
  },
  waterfallStep: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 11,
    padding: 12,
    gap: 7,
  },
  waterfallStepResult: {
    backgroundColor: '#F0FDF4',
    borderColor: '#A7F3D0',
    borderWidth: 1.5,
  },
  waterfallTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  waterfallTitleCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flex: 1,
    flexWrap: 'wrap',
  },
  waterfallIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  waterfallLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  waterfallTag: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 5,
  },
  waterfallTagText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  waterfallAmountCol: {
    alignItems: 'flex-end',
  },
  waterfallAmount: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  waterfallAmountResult: {
    fontSize: 16,
    fontWeight: '900',
  },
  waterfallPct: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 1,
  },
  waterfallTrack: {
    height: 7,
    backgroundColor: '#E2E8F0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  waterfallFill: {
    height: '100%',
    borderRadius: 4,
  },
  waterfallSubtext: {
    fontSize: 11,
    color: '#64748B',
  },
});
