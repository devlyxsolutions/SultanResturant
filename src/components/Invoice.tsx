import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Invoice } from '../store/restaurantStore';

type InvoiceProps = {
  invoice: Invoice;
};

export default function InvoiceComponent({ invoice }: InvoiceProps) {
  const date = new Date(invoice.timeSettled || invoice.timePlaced).toLocaleString();

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.logoPlaceholder}>
          <Text style={styles.logoText}>SULTAN</Text>
          <Text style={styles.logoSubText}>RESTAURANT</Text>
        </View>
        <Text style={styles.addressText}>123 Food Street, Culinary District</Text>
        <Text style={styles.addressText}>Phone: +92 123 4567890</Text>
      </View>

      <View style={styles.divider} />

      {/* Meta */}
      <View style={styles.metaRow}>
        <Text style={styles.metaText}>Inv #: {invoice.id}</Text>
        <Text style={styles.metaText}>{date}</Text>
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.metaText}>Type: {invoice.orderType.toUpperCase()}</Text>
        <Text style={styles.metaText}>Server: {invoice.server}</Text>
      </View>
      {invoice.tableName && (
        <View style={styles.metaRow}>
          <Text style={styles.metaText}>Table: {invoice.tableName}</Text>
        </View>
      )}
      {invoice.customer && (
        <View style={styles.customerBox}>
          <Text style={styles.metaTextBold}>Customer: {invoice.customer.name}</Text>
          <Text style={styles.metaText}>{invoice.customer.phone}</Text>
          {invoice.customer.address && <Text style={styles.metaText}>{invoice.customer.address}</Text>}
        </View>
      )}

      <View style={styles.dividerDashed} />

      {/* Items */}
      <View style={styles.tableHeader}>
        <Text style={[styles.tableText, styles.qtyCol]}>Qty</Text>
        <Text style={[styles.tableText, styles.itemCol]}>Item</Text>
        <Text style={[styles.tableText, styles.priceCol]}>Price</Text>
        <Text style={[styles.tableText, styles.amountCol]}>Amount</Text>
      </View>

      {invoice.items.map((item, idx) => (
        <View key={idx} style={styles.tableRow}>
          <Text style={[styles.tableText, styles.qtyCol]}>{item.qty}</Text>
          <Text style={[styles.tableText, styles.itemCol]}>{item.name}</Text>
          <Text style={[styles.tableText, styles.priceCol]}>{item.price.toFixed(0)}</Text>
          <Text style={[styles.tableText, styles.amountCol]}>{(item.price * item.qty).toFixed(0)}</Text>
        </View>
      ))}

      <View style={styles.dividerDashed} />

      {/* Totals */}
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Subtotal:</Text>
        <Text style={styles.totalValue}>Rs. {invoice.subTotal.toFixed(0)}</Text>
      </View>
      {(invoice.discount || 0) > 0 && (
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Discount:</Text>
          <Text style={styles.totalValue}>- Rs. {invoice.discount?.toFixed(0)}</Text>
        </View>
      )}
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Tax (GST 16%):</Text>
        <Text style={styles.totalValue}>Rs. {invoice.tax.toFixed(0)}</Text>
      </View>
      <View style={[styles.totalRow, styles.grandTotalRow]}>
        <Text style={styles.grandTotalLabel}>TOTAL:</Text>
        <Text style={styles.grandTotalValue}>Rs. {invoice.total.toFixed(0)}</Text>
      </View>

      {invoice.payments && invoice.payments.length > 0 && (
        <View style={styles.paymentsBox}>
          <Text style={styles.paymentsTitle}>Payment Received:</Text>
          {invoice.payments.map((p, idx) => (
            <View key={idx} style={styles.paymentRow}>
              <Text style={styles.metaText}>{p.type.toUpperCase()}</Text>
              <Text style={styles.metaText}>Rs. {p.amount.toFixed(0)}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.footer}>
        <Text style={styles.footerText}>Thank you for dining with Sultan!</Text>
        <Text style={styles.footerText}>Please come again.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    padding: 24,
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 8,
    // Paper shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
  },
  header: {
    alignItems: 'center',
    marginBottom: 16,
  },
  logoPlaceholder: {
    alignItems: 'center',
    marginBottom: 8,
  },
  logoText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#4a121a', // Sultan Burgundy
    letterSpacing: 2,
  },
  logoSubText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#D5A943', // Sultan Gold
    letterSpacing: 4,
  },
  addressText: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  divider: {
    height: 2,
    backgroundColor: '#333',
    marginVertical: 12,
  },
  dividerDashed: {
    height: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderStyle: 'dashed',
    marginVertical: 12,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  metaText: {
    fontSize: 12,
    color: '#333',
  },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
    paddingBottom: 8,
    marginBottom: 8,
  },
  tableRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  tableText: {
    fontSize: 12,
    color: '#333',
  },
  qtyCol: { width: '15%' },
  itemCol: { width: '45%' },
  priceCol: { width: '20%', textAlign: 'right' },
  amountCol: { width: '20%', textAlign: 'right' },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 4,
  },
  totalLabel: {
    width: 120,
    fontSize: 14,
    color: '#666',
    textAlign: 'right',
    paddingRight: 16,
  },
  totalValue: {
    width: 80,
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'right',
  },
  grandTotalRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 2,
    borderTopColor: '#333',
  },
  grandTotalLabel: {
    width: 120,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4a121a',
    textAlign: 'right',
    paddingRight: 16,
  },
  grandTotalValue: {
    width: 100,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4a121a',
    textAlign: 'right',
  },
  customerBox: {
    marginTop: 8,
    padding: 8,
    backgroundColor: '#f9f9f9',
    borderRadius: 4,
    borderLeftWidth: 2,
    borderLeftColor: '#D5A943',
  },
  metaTextBold: {
    fontSize: 12,
    color: '#333',
    fontWeight: 'bold',
  },
  paymentsBox: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  paymentsTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#666',
    marginBottom: 4,
  },
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingLeft: 8,
  },
  footer: {
    marginTop: 32,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
  }
});
