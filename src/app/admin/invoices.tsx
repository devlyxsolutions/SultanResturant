import React from 'react';
import InvoicesScreen from '../../screens/InvoicesScreen';

export default function AdminInvoicesRoute() {
  return <InvoicesScreen userRole="admin" backRoute="/admin/dashboard" />;
}
