import React from 'react';
import POSTerminalScreen from '../../screens/POSTerminalScreen';

export default function FloorManagerPOS() {
  return (
    <POSTerminalScreen
      role="floor_manager"
      backRoute="/floor-manager"
      shiftRoute="/floor-manager"
    />
  );
}

