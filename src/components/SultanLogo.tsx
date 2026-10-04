import React from 'react';
import { View, Image, ImageStyle, ViewStyle, StyleProp, StyleSheet } from 'react-native';

export type SultanLogoSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'hero';
export type SultanLogoVariant = 'bare' | 'badge' | 'circle';

interface SultanLogoProps {
  size?: SultanLogoSize;
  variant?: SultanLogoVariant;
  width?: number;
  height?: number;
  style?: StyleProp<ImageStyle>;
  containerStyle?: StyleProp<ViewStyle>;
}

const SIZE_MAP: Record<SultanLogoSize, { imgW: number; imgH: number; box: number; radius: number }> = {
  xs: { imgW: 24, imgH: 24, box: 30, radius: 8 },
  sm: { imgW: 32, imgH: 32, box: 40, radius: 10 },
  md: { imgW: 48, imgH: 48, box: 60, radius: 16 },
  lg: { imgW: 76, imgH: 76, box: 96, radius: 24 },
  xl: { imgW: 130, imgH: 120, box: 150, radius: 32 },
  hero: { imgW: 300, imgH: 260, box: 320, radius: 40 },
};

export default function SultanLogo({
  size = 'md',
  variant = 'bare',
  width,
  height,
  style,
  containerStyle,
}: SultanLogoProps) {
  const meta = SIZE_MAP[size] || SIZE_MAP.md;
  const finalWidth = width ?? meta.imgW;
  const finalHeight = height ?? meta.imgH;

  const imageElem = (
    <Image
      source={require('../../assets/images/sultan-logo.png')}
      style={[
        {
          width: finalWidth,
          height: finalHeight,
        },
        style,
      ]}
      resizeMode="contain"
    />
  );

  if (variant === 'bare') {
    return imageElem;
  }

  const isCircle = variant === 'circle';
  const boxDim = Math.max(meta.box, finalWidth + 16, finalHeight + 16);
  const borderRadius = isCircle ? boxDim / 2 : meta.radius;

  return (
    <View
      style={[
        styles.badgeContainer,
        {
          width: boxDim,
          height: boxDim,
          borderRadius,
        },
        containerStyle,
      ]}
    >
      {imageElem}
    </View>
  );
}

const styles = StyleSheet.create({
  badgeContainer: {
    backgroundColor: '#52171B', // Sultan Royal Burgundy
    borderWidth: 1.5,
    borderColor: 'rgba(213, 169, 67, 0.45)', // Royal Gold Border
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#52171B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
});
