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
  xs: { imgW: 28, imgH: 28, box: 34, radius: 8 },
  sm: { imgW: 38, imgH: 38, box: 46, radius: 10 },
  md: { imgW: 56, imgH: 56, box: 68, radius: 16 },
  lg: { imgW: 90, imgH: 90, box: 110, radius: 24 },
  xl: { imgW: 160, imgH: 150, box: 180, radius: 32 },
  hero: { imgW: 320, imgH: 280, box: 340, radius: 40 },
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
      source={require('../../assets/images/sultan-logo-hd.png')}
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
    backgroundColor: '#451014', // Sultan Deep Royal Burgundy
    borderWidth: 2,
    borderColor: '#D5A943', // Royal Gold Border
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#D5A943',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
});
