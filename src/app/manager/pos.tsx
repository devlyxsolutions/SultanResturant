import React from 'react';
import AdminPOS from '../admin/pos';

export default function ManagerPOS() {
  return (
    <AdminPOS
      backRoute="/manager/dashboard"
      shiftRoute="/manager/shift"
    />
  );
}
