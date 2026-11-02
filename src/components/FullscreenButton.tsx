import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  View,
  Platform,
  ViewStyle,
  StyleProp,
  TextStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFullscreenStore } from '../store/fullscreenStore';

export interface FullscreenButtonProps {
  /** Display variant: 'pill' shows text label, 'icon' shows circular/rounded button, 'compact' is extra small */
  variant?: 'pill' | 'icon' | 'compact';
  /** Show custom text or auto label */
  showLabel?: boolean;
  /** Label text override */
  label?: string;
  /** Additional container style */
  style?: StyleProp<ViewStyle>;
  /** Custom icon color */
  iconColor?: string;
  /** Custom icon size */
  iconSize?: number;
  /** Text style */
  textStyle?: StyleProp<TextStyle>;
  /** Light mode or dark mode theme */
  theme?: 'gold' | 'dark' | 'glass';
}

export default function FullscreenButton({
  variant = 'pill',
  showLabel,
  label,
  style,
  iconColor,
  iconSize,
  textStyle,
  theme = 'gold',
}: FullscreenButtonProps) {
  const isFullscreen = useFullscreenStore((state) => state.isFullscreen);
  const toggle = useFullscreenStore((state) => state.toggle);

  const shouldShowLabel = showLabel ?? variant === 'pill';
  const defaultSize = variant === 'compact' ? 14 : variant === 'icon' ? 17 : 14;
  const currentIconSize = iconSize ?? defaultSize;
  const currentIconColor = iconColor ?? (isFullscreen ? '#10B981' : '#D4AF37');

  const tooltip = isFullscreen ? 'Exit Full Screen (Esc)' : 'Enter Full Screen (F11)';

  return (
    <TouchableOpacity
      style={[
        styles.base,
        variant === 'pill' && styles.pill,
        variant === 'icon' && styles.iconOnly,
        variant === 'compact' && styles.compact,
        theme === 'dark' && styles.themeDark,
        theme === 'glass' && styles.themeGlass,
        isFullscreen && styles.activePill,
        style,
      ]}
      onPress={toggle}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={tooltip}
      {...(Platform.OS === 'web'
        ? ({
            title: tooltip,
          } as any)
        : {})}
    >
      <Ionicons
        name={isFullscreen ? 'contract-outline' : 'expand-outline'}
        size={currentIconSize}
        color={currentIconColor}
      />
      {shouldShowLabel && (
        <Text
          style={[
            styles.labelText,
            theme === 'dark' && styles.labelTextDark,
            isFullscreen && styles.labelTextActive,
            textStyle,
          ]}
          numberOfLines={1}
        >
          {label ?? (isFullscreen ? 'Exit Full' : 'Full Screen')}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(213, 169, 67, 0.35)',
    backgroundColor: 'rgba(36, 5, 10, 0.65)',
    ...Platform.select({
      web: {
        cursor: 'pointer',
        userSelect: 'none',
        transition: 'all 0.18s ease-in-out',
      } as any,
    }),
  },
  pill: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    gap: 6,
  },
  iconOnly: {
    width: 32,
    height: 32,
    padding: 0,
    borderRadius: 8,
  },
  compact: {
    width: 28,
    height: 28,
    padding: 0,
    borderRadius: 6,
  },
  themeDark: {
    backgroundColor: 'rgba(20, 20, 22, 0.75)',
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  themeGlass: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  activePill: {
    borderColor: 'rgba(16, 185, 129, 0.45)',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
  },
  labelText: {
    color: '#F3D179',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  labelTextDark: {
    color: '#E4E4E7',
  },
  labelTextActive: {
    color: '#34D399',
  },
});

