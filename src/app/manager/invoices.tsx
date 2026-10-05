import React from 'react';
import InvoicesScreen from '../../screens/InvoicesScreen';

export default function ManagerInvoicesRoute() {
  return <InvoicesScreen userRole="manager" backRoute="/manager/dashboard" />;
}
