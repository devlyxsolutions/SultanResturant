import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  useWindowDimensions,
  StyleProp,
  ViewStyle,
  Image,
  Animated,
  Easing,
  Platform,
} from 'react-native';
import Svg, { Path, G, Polygon } from 'react-native-svg';

interface IslamicBackgroundProps {
  theme?: 'burgundy' | 'light' | 'dark';
  children?: React.ReactNode;
  showCorners?: boolean;
  showCenterLattice?: boolean;
  animated?: boolean;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
}

/**
 * Islamic Star Polygon (8-point Rub el Hizb / Khatim star)
 */
function EightPointStar({
  cx,
  cy,
  outerRadius,
  innerRadius,
  strokeColor,
  strokeWidth = 1.5,
  fill = 'none',
}: {
  cx: number;
  cy: number;
  outerRadius: number;
  innerRadius: number;
  strokeColor: string;
  strokeWidth?: number;
  fill?: string;
}) {
  const points: string[] = [];
  const totalPoints = 16;
  for (let i = 0; i < totalPoints; i++) {
    const angle = (i * Math.PI) / 8 - Math.PI / 2;
    const r = i % 2 === 0 ? outerRadius : innerRadius;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    points.push(`${x},${y}`);
  }
  return (
    <Polygon
      points={points.join(' ')}
      fill={fill}
      stroke={strokeColor}
      strokeWidth={strokeWidth}
      strokeLinejoin="miter"
      strokeMiterlimit={4}
    />
  );
}

/**
 * Subtle, refined Islamic Arabesque Corner Motif
 */
function CornerGeometricMotif({
  size = 160,
  color = '#D5A943',
  opacity = 0.55,
}: {
  size?: number;
  color?: string;
  opacity?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 180 180" style={{ opacity }}>
      <G stroke={color} fill="none">
        <Path
          d="M 0,0 L 180,0 L 180,24 L 24,24 L 24,180 L 0,180 Z"
          strokeWidth={1.4}
          fill="none"
        />
        <Path
          d="M 12,12 L 175,12 M 12,12 L 12,175"
          strokeWidth={0.9}
          strokeDasharray="4 2"
        />
        <Path
          d="M 32,32 L 165,32 L 165,42 L 42,42 L 42,165 L 32,165 Z"
          strokeWidth={1.1}
        />
        <Path
          d="M 160,0 L 160,18 L 140,18 L 140,36 L 120,36 L 120,54 L 100,54 L 100,72 L 72,72 L 72,100 L 54,100 L 54,120 L 36,120 L 36,140 L 18,140 L 18,160 M 0,160 L 18,160"
          strokeWidth={1.2}
        />
        <EightPointStar
          cx={96}
          cy={96}
          outerRadius={36}
          innerRadius={24}
          strokeColor={color}
          strokeWidth={1.4}
        />
        <EightPointStar
          cx={96}
          cy={96}
          outerRadius={22}
          innerRadius={14}
          strokeColor={color}
          strokeWidth={1.1}
        />
        <EightPointStar
          cx={96}
          cy={96}
          outerRadius={10}
          innerRadius={6}
          strokeColor={color}
          strokeWidth={0.9}
        />
        <Path
          d="M 96,56 L 96,136 M 56,96 L 136,96"
          strokeWidth={0.9}
          strokeDasharray="2 3"
        />
        <EightPointStar
          cx={32}
          cy={96}
          outerRadius={14}
          innerRadius={9}
          strokeColor={color}
          strokeWidth={1}
        />
        <EightPointStar
          cx={96}
          cy={32}
          outerRadius={14}
          innerRadius={9}
          strokeColor={color}
          strokeWidth={1}
        />
      </G>
    </Svg>
  );
}

/**
 * Floating Golden Star Dust / Ambient Sparkle Particle
 */
function FloatingParticle({
  leftPercent,
  size,
  duration,
  delay,
  startBottom,
}: {
  leftPercent: number;
  size: number;
  duration: number;
  delay: number;
  startBottom: number;
}) {
  const [anim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    let isMounted = true;
    const runAnimation = () => {
      anim.setValue(0);
      Animated.timing(anim, {
        toValue: 1,
        duration,
        delay,
        easing: Easing.linear,
        useNativeDriver: true,
      }).start(() => {
        if (isMounted) {
          runAnimation();
        }
      });
    };

    runAnimation();
    return () => {
      isMounted = false;
    };
  }, [anim, duration, delay]);

  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -320],
  });

  const opacity = anim.interpolate({
    inputRange: [0, 0.2, 0.7, 1],
    outputRange: [0, 0.75, 0.45, 0],
  });

  const scale = anim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.6, 1.25, 0.5],
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.particle,
        {
          left: `${leftPercent}%`,
          bottom: startBottom,
          width: size,
          height: size,
          borderRadius: size / 2,
          opacity,
          transform: [{ translateY }, { scale }],
        },
      ]}
    />
  );
}

function IslamicBackgroundComponent({
  theme = 'burgundy',
  children,
  showCorners = true,
  showCenterLattice = true,
  animated = true,
  style,
  contentContainerStyle,
}: IslamicBackgroundProps) {
  const { width } = useWindowDimensions();
  const cornerSize = width < 420 ? 80 : width < 768 ? 115 : 160;

  const isBurgundy = theme === 'burgundy';
  const isLight = theme === 'light';

  // Deep royal-tech velvet obsidian base
  const bgColor = isBurgundy ? '#160205' : isLight ? '#FAF7F2' : '#0E0103';
  const goldStroke = isLight ? '#9E721D' : '#D5A943';
  const cornerOpacity = isBurgundy ? 0.52 : isLight ? 0.35 : 0.48;

  // -------------------------------------------------------------
  // Ambient Breathing Glow Animations (60 FPS Native Driver)
  // -------------------------------------------------------------
  const [glowPulse1] = useState(() => new Animated.Value(0));
  const [glowPulse2] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!animated) return;

    const anim1 = Animated.loop(
      Animated.sequence([
        Animated.timing(glowPulse1, {
          toValue: 1,
          duration: 7000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(glowPulse1, {
          toValue: 0,
          duration: 7000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    const anim2 = Animated.loop(
      Animated.sequence([
        Animated.timing(glowPulse2, {
          toValue: 1,
          duration: 9000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(glowPulse2, {
          toValue: 0,
          duration: 9000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    anim1.start();
    anim2.start();

    return () => {
      anim1.stop();
      anim2.stop();
    };
  }, [animated, glowPulse1, glowPulse2]);

  const glow1Scale = glowPulse1.interpolate({
    inputRange: [0, 1],
    outputRange: [0.92, 1.15],
  });

  const glow1Opacity = glowPulse1.interpolate({
    inputRange: [0, 1],
    outputRange: [0.08, 0.16],
  });

  const glow2Scale = glowPulse2.interpolate({
    inputRange: [0, 1],
    outputRange: [1.12, 0.9],
  });

  const glow2Opacity = glowPulse2.interpolate({
    inputRange: [0, 1],
    outputRange: [0.07, 0.14],
  });

  return (
    <View style={[styles.container, { backgroundColor: bgColor }, style]}>
      {/* ============================================================
          AMBIENT ROYAL-TECH LIGHT AURORAS (BREATHING DEPTH)
          ============================================================ */}
      {animated && (
        <>
          {/* Top-Left Champagne Gold Ambient Light Pool */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.goldLightOrb,
              {
                opacity: glow1Opacity,
                transform: [{ scale: glow1Scale }],
              },
            ]}
          />

          {/* Bottom-Right Deep Imperial Crimson Light Pool */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.crimsonLightOrb,
              {
                opacity: glow2Opacity,
                transform: [{ scale: glow2Scale }],
              },
            ]}
          />

          {/* Floating Subtle Golden Star Dust Particles */}
          <FloatingParticle leftPercent={12} size={3.5} duration={7200} delay={0} startBottom={60} />
          <FloatingParticle leftPercent={28} size={4.5} duration={8500} delay={1800} startBottom={110} />
          <FloatingParticle leftPercent={52} size={3} duration={6800} delay={900} startBottom={40} />
          <FloatingParticle leftPercent={74} size={5} duration={9200} delay={2500} startBottom={90} />
          <FloatingParticle leftPercent={88} size={3.5} duration={7900} delay={1200} startBottom={50} />
          <FloatingParticle leftPercent={42} size={4} duration={8100} delay={3200} startBottom={130} />
        </>
      )}

      {/* Clean Subtle Islamic Geometric Pattern Watermark */}
      {showCenterLattice && (
        <Image
          source={require('../../assets/images/islamic-lattice-gold.png')}
          style={[
            styles.latticeOverlay,
            {
              opacity: isBurgundy ? 0.16 : isLight ? 0.05 : 0.12,
            },
          ]}
          resizeMode="repeat"
        />
      )}

      {/* Subtle Corner Accents */}
      {showCorners && (
        <>
          <View pointerEvents="none" style={styles.cornerTopLeft}>
            <CornerGeometricMotif size={cornerSize} color={goldStroke} opacity={cornerOpacity} />
          </View>
          <View pointerEvents="none" style={styles.cornerTopRight}>
            <CornerGeometricMotif size={cornerSize} color={goldStroke} opacity={cornerOpacity} />
          </View>
          <View pointerEvents="none" style={styles.cornerBottomLeft}>
            <CornerGeometricMotif size={cornerSize} color={goldStroke} opacity={cornerOpacity} />
          </View>
          <View pointerEvents="none" style={styles.cornerBottomRight}>
            <CornerGeometricMotif size={cornerSize} color={goldStroke} opacity={cornerOpacity} />
          </View>
        </>
      )}

      {/* Foreground Content */}
      <View style={[styles.contentContainer, contentContainerStyle]}>{children}</View>
    </View>
  );
}

const IslamicBackground = React.memo(IslamicBackgroundComponent);
export default IslamicBackground;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  contentContainer: {
    flex: 1,
    zIndex: 2,
  },
  latticeOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    zIndex: 0,
  },
  goldLightOrb: {
    position: 'absolute',
    top: '-10%',
    left: '-8%',
    width: 480,
    height: 480,
    borderRadius: 240,
    backgroundColor: '#D5A943',
    zIndex: 0,
    ...Platform.select({
      web: {
        filter: 'blur(95px)',
      } as any,
    }),
  },
  crimsonLightOrb: {
    position: 'absolute',
    bottom: '-12%',
    right: '-10%',
    width: 520,
    height: 520,
    borderRadius: 260,
    backgroundColor: '#8B0A1A',
    zIndex: 0,
    ...Platform.select({
      web: {
        filter: 'blur(105px)',
      } as any,
    }),
  },
  particle: {
    position: 'absolute',
    backgroundColor: '#F3D179',
    zIndex: 1,
    ...Platform.select({
      web: {
        boxShadow: '0 0 8px #D5A943',
      } as any,
      default: {
        shadowColor: '#D5A943',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 4,
        elevation: 3,
      },
    }),
  },
  cornerTopLeft: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 1,
  },
  cornerTopRight: {
    position: 'absolute',
    top: 0,
    right: 0,
    transform: [{ scaleX: -1 }],
    zIndex: 1,
  },
  cornerBottomLeft: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    transform: [{ scaleY: -1 }],
    zIndex: 1,
  },
  cornerBottomRight: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    transform: [{ scaleX: -1 }, { scaleY: -1 }],
    zIndex: 1,
  },
});
