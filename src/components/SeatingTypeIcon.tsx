import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SeatingZoneType } from '../constants/floors';

interface SeatingTypeIconProps {
  type: SeatingZoneType | string;
  size?: number;
  color?: string;
  focused?: boolean;
}

/**
 * Islamic Arch SVG Icon — Custom Arabian Royal Arch for Majlis Sitting
 */
export function IslamicArchIcon({ size = 20, color = '#4a121a', focused = false }: { size?: number; color?: string; focused?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Outer pointed Moorish arch */}
      <Path
        d="M12 2.5C9.2 5.5 4 9 4 14.5V21.5H20V14.5C20 9 14.8 5.5 12 2.5Z"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={focused ? `${color}20` : 'none'}
      />
      {/* Inner doorway arch */}
      <Path
        d="M8 21.5V15.5C8 13.3 9.8 11.5 12 11.5C14.2 11.5 16 13.3 16 15.5V21.5"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Star/Dome finial */}
      <Path
        d="M12 1.5V3.5"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </Svg>
  );
}

/**
 * Sofa / Couch Icon — for Lounge Couches
 */
export function CouchIcon({ size = 20, color = '#4a121a' }: { size?: number; color?: string }) {
  return <MaterialCommunityIcons name="sofa-outline" size={size} color={color} />;
}

/**
 * Dining Table Icon — for Standard Tables
 */
export function DiningTableIcon({ size = 20, color = '#4a121a' }: { size?: number; color?: string }) {
  return <MaterialCommunityIcons name="table-chair" size={size} color={color} />;
}

/**
 * Unified Seating Type Icon Dispatcher
 */
export default function SeatingTypeIcon({ type, size = 20, color = '#4a121a', focused = false }: SeatingTypeIconProps) {
  const normalized = (type || '').toLowerCase();

  if (normalized.includes('majlis') || normalized === 'majlis' || normalized.includes('cabin')) {
    return <IslamicArchIcon size={size} color={color} focused={focused} />;
  }

  if (normalized.includes('couch') || normalized === 'couches' || normalized.includes('sofa')) {
    return <CouchIcon size={size} color={color} />;
  }

  return <DiningTableIcon size={size} color={color} />;
}
