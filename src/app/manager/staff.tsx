import React from 'react';
import StaffManagementScreen from '../admin/staff';

export default function ManagerStaff() {
  return (
    <StaffManagementScreen
      backRoute="/manager/dashboard"
      role="manager"
    />
  );
}
