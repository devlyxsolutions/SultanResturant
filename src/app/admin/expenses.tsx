import React from 'react';
import ExpensesScreen from '../../screens/ExpensesScreen';

export default function AdminExpensesRoute() {
  return <ExpensesScreen backRoute="/admin/dashboard" />;
}
