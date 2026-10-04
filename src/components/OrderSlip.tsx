import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Ticket } from '../store/restaurantStore';

type OrderSlipProps = {
  ticket: Ticket;
};

export default function OrderSlip({ ticket }: OrderSlipProps) {
  const date = new Date(ticket.timePlaced).toLocaleString();

  return (
    <View style={styles.container} nativeID="order-slip-container">
      {Platform.OS === 'web' && (
        <style type="text/css">
          {`
            @media print {
              body * {
                visibility: hidden;
              }
              #order-slip-container, #order-slip-container * {
                visibility: visible;
              }
              #order-slip-container {
                position: absolute;
                left: 0;
                top: 0;
                width: 100%;
                margin: 0;
                padding: 0;
              }
            }
          `}
        </style>
      )}
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.logoText}>KITCHEN SLIP</Text>
        <Text style={styles.logoSubText}>{ticket.isAddOn ? 'ADD-ON ORDER' : 'NEW ORDER'}</Text>
      </View>

      <View style={styles.divider} />

      {/* Meta */}
      <View style={styles.metaRow}>
        <Text style={styles.metaText}>Ticket #: {ticket.id}</Text>
        <Text style={styles.metaText}>{date}</Text>
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.metaTextBold}>Table: {ticket.tableName}</Text>
        <Text style={styles.metaText}>Server: {ticket.server}</Text>
      </View>
      {ticket.isAddOn && (
        <View style={styles.metaRow}>
          <Text style={styles.metaText}>Round #: {ticket.roundNumber}</Text>
        </View>
      )}

      <View style={styles.dividerDashed} />

      {/* Items */}
      <View style={styles.tableHeader}>
        <Text style={[styles.tableText, styles.qtyCol]}>Qty</Text>
        <Text style={[styles.tableText, styles.itemCol]}>Item</Text>
      </View>

      {ticket.items.map((item, idx) => (
        <View key={idx} style={styles.tableRow}>
          <Text style={[styles.itemText, styles.qtyCol, { fontWeight: 'bold' }]}>{item.qty}</Text>
          <View style={styles.itemCol}>
            <Text style={styles.itemText}>{item.name}</Text>
            {item.notes && <Text style={styles.notesText}>* {item.notes}</Text>}
          </View>
        </View>
      ))}

      <View style={styles.dividerDashed} />

      <View style={styles.footer}>
        <Text style={styles.footerText}>-- END OF SLIP --</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    padding: 16,
    width: '100%',
    maxWidth: 320,
    alignSelf: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 8,
  },
  logoText: {
    fontSize: 22,
    fontWeight: '900',
    color: '#000',
    letterSpacing: 1,
  },
  logoSubText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#333',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  divider: {
    height: 2,
    backgroundColor: '#000',
    marginVertical: 10,
  },
  dividerDashed: {
    height: 1,
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    borderStyle: 'dashed',
    marginVertical: 10,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  metaText: {
    fontSize: 12,
    color: '#000',
    fontFamily: 'monospace',
  },
  metaTextBold: {
    fontSize: 12,
    color: '#000',
    fontFamily: 'monospace',
    fontWeight: 'bold',
  },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    paddingBottom: 4,
    marginBottom: 6,
  },
  tableRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  tableText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#000',
  },
  itemText: {
    fontSize: 12,
    color: '#000',
    fontFamily: 'monospace',
  },
  notesText: {
    fontSize: 11,
    color: '#555',
    fontStyle: 'italic',
    marginTop: 2,
  },
  qtyCol: {
    width: 35,
    textAlign: 'center',
  },
  itemCol: {
    flex: 1,
    paddingLeft: 8,
  },
  footer: {
    alignItems: 'center',
    marginTop: 8,
  },
  footerText: {
    fontSize: 11,
    color: '#000',
    fontStyle: 'italic',
  },
});
