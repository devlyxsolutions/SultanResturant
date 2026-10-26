import React from 'react';
import { View, StyleSheet, useWindowDimensions, StyleProp, ViewStyle, Platform } from 'react-native';
import Svg, {
  Path,
  G,
  Polygon,
  Rect,
  Defs,
  LinearGradient,
  RadialGradient,
  Stop,
  Pattern,
  Circle,
} from 'react-native-svg';

interface IslamicHeroBackgroundProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}

/**
 * 8-Pointed Star (Rub el Hizb)
 */
function RubElHizbStar({
  cx,
  cy,
  outerRadius,
  innerRadius,
  strokeColor,
  strokeWidth = 1.2,
  fill = 'none',
  opacity = 1,
}: {
  cx: number;
  cy: number;
  outerRadius: number;
  innerRadius: number;
  strokeColor: string;
  strokeWidth?: number;
  fill?: string;
  opacity?: number;
}) {
  const points: string[] = [];
  for (let i = 0; i < 16; i++) {
    const angle = (i * Math.PI) / 8 - Math.PI / 2;
    const r = i % 2 === 0 ? outerRadius : innerRadius;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return (
    <Polygon
      points={points.join(' ')}
      fill={fill}
      stroke={strokeColor}
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
      opacity={opacity}
    />
  );
}

/**
 * Ornate Islamic Arabesque Corner
 */
function HeroCornerFiligree({
  size = 130,
  color = '#D5A943',
  opacity = 0.55,
}: {
  size?: number;
  color?: string;
  opacity?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 130 130" style={{ opacity }}>
      <G stroke={color} fill="none">
        {/* Stepped Islamic Arch Border */}
        <Path
          d="M 0,0 L 130,0 L 130,16 L 16,16 L 16,130 L 0,130 Z"
          strokeWidth={1.5}
        />
        <Path
          d="M 8,8 L 125,8 M 8,8 L 8,125"
          strokeWidth={0.8}
          strokeDasharray="3 3"
        />
        <Path
          d="M 115,0 L 115,14 L 95,14 L 95,30 L 75,30 L 75,46 L 55,46 L 55,62 L 39,62 L 39,82 L 23,82 L 23,102 L 10,102 L 10,115"
          strokeWidth={1.2}
          opacity={0.7}
        />
        {/* Corner 8-Point Rosette */}
        <RubElHizbStar
          cx={68}
          cy={68}
          outerRadius={24}
          innerRadius={16}
          strokeColor={color}
          strokeWidth={1.4}
        />
        <RubElHizbStar
          cx={68}
          cy={68}
          outerRadius={12}
          innerRadius={8}
          strokeColor={color}
          strokeWidth={1}
        />
        {/* Diamond accents */}
        <Path
          d="M 68,40 L 68,96 M 40,68 L 96,68"
          strokeWidth={0.8}
          strokeDasharray="2 3"
        />
      </G>
    </Svg>
  );
}

export default function IslamicHeroBackground({
  children,
  style,
  contentStyle,
}: IslamicHeroBackgroundProps) {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const cornerSize = isMobile ? 55 : 120;

  return (
    <View style={[styles.container, style]}>
      {/* 1. Underlying Rich Burgundy & Deep Royal Gradient */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id="heroBurgundyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor="#190306" />
              <Stop offset="35%" stopColor="#2A060C" />
              <Stop offset="70%" stopColor="#3B0B12" />
              <Stop offset="100%" stopColor="#1B0307" />
            </LinearGradient>

            <RadialGradient id="heroCentralGlow" cx="50%" cy="45%" r="55%">
              <Stop offset="0%" stopColor="#D5A943" stopOpacity={0.16} />
              <Stop offset="45%" stopColor="#D5A943" stopOpacity={0.06} />
              <Stop offset="100%" stopColor="#24050A" stopOpacity={0.0} />
            </RadialGradient>

            {/* Repeating Islamic Khatim Grid Pattern */}
            <Pattern
              id="khatimLattice"
              width="64"
              height="64"
              patternUnits="userSpaceOnUse"
            >
              <G stroke="#D5A943" strokeWidth="0.85" fill="none" opacity={0.14}>
                {/* 8-Point Star at Center (32, 32) */}
                <Polygon
                  points="32,20 35,26 41,23 41,29 47,32 41,35 41,41 35,38 32,44 29,38 23,41 23,35 17,32 23,29 23,23 29,26"
                  strokeWidth="0.8"
                />
                {/* Interlocking Diagonal Lattice Lines */}
                <Path d="M 32,0 L 64,32 L 32,64 L 0,32 Z" />
                <Path d="M 0,0 L 32,32 L 0,64 M 64,0 L 32,32 L 64,64" strokeDasharray="3 3" />
                {/* Corner Mini Stars */}
                <Polygon points="0,0 3,4 7,1 5,6 8,8 4,8 3,12 1,8 0,8" />
                <Polygon points="64,0 61,4 57,1 59,6 56,8 60,8 61,12 63,8 64,8" />
                <Polygon points="0,64 3,60 7,63 5,58 8,56 4,56 3,52 1,56 0,56" />
                <Polygon points="64,64 61,60 57,63 59,58 56,56 60,56 61,52 63,56 64,56" />
              </G>
            </Pattern>
          </Defs>

          {/* Base Color Fill */}
          <Rect width="100%" height="100%" fill="url(#heroBurgundyGrad)" />

          {/* Subtle Radial Halo Under Branding */}
          <Rect width="100%" height="100%" fill="url(#heroCentralGlow)" />

          {/* Islamic Geometric Lattice Layer */}
          <Rect width="100%" height="100%" fill="url(#khatimLattice)" />
        </Svg>
      </View>

      {/* 2. Top-Left Arabesque Corner */}
      <View pointerEvents="none" style={styles.cornerTL}>
        <HeroCornerFiligree size={cornerSize} color="#D5A943" opacity={isMobile ? 0.22 : 0.55} />
      </View>

      {/* 3. Top-Right Arabesque Corner */}
      <View pointerEvents="none" style={styles.cornerTR}>
        <HeroCornerFiligree size={cornerSize} color="#D5A943" opacity={isMobile ? 0.22 : 0.55} />
      </View>

      {/* 4. Bottom Regal Gold Scallop Trim Border */}
      <View pointerEvents="none" style={styles.bottomBorderTrim}>
        <View style={styles.goldLineTop} />
        <View style={styles.goldLineAccent} />
      </View>

      {/* 5. Foreground Content */}
      <View style={[styles.contentWrapper, contentStyle]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#1C0408',
  },
  contentWrapper: {
    zIndex: 2,
    position: 'relative',
  },
  cornerTL: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 1,
  },
  cornerTR: {
    position: 'absolute',
    top: 0,
    right: 0,
    transform: [{ scaleX: -1 }],
    zIndex: 1,
  },
  bottomBorderTrim: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 1,
  },
  goldLineTop: {
    height: 1,
    backgroundColor: 'rgba(213, 169, 67, 0.45)',
    width: '100%',
  },
  goldLineAccent: {
    height: 2,
    backgroundColor: '#D5A943',
    width: '100%',
    opacity: 0.85,
  },
});
