import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal } from 'react-native';
import { useRestaurantStore, Invoice } from '../../store/restaurantStore';
import InvoiceComponent from '../../components/Invoice';

export default function AdminOrders() {
  const invoices = useRestaurantStore(state => state.invoices);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Order Management & Invoices</Text>
      
      <ScrollView style={styles.listContainer}>
        {invoices.length === 0 ? (
          <Text style={styles.emptyText}>No orders completed yet.</Text>
        ) : (
          invoices.map((inv) => (
            <TouchableOpacity 
              key={inv.id} 
              style={styles.orderCard}
              onPress={() => setSelectedInvoice(inv)}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.orderId}>{inv.id}</Text>
                <Text style={styles.orderTotal}>Rs. {inv.total.toFixed(0)}</Text>
              </View>
              <View style={styles.cardMeta}>
                <Text style={styles.metaText}>{new Date(inv.timeSettled).toLocaleString()}</Text>
                <Text style={styles.metaText}>{inv.orderType.toUpperCase()}</Text>
              </View>
              <Text style={styles.metaText}>Server: {inv.server} {inv.tableName ? `• Table: ${inv.tableName}` : ''}</Text>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {/* Invoice Modal */}
      <Modal visible={!!selectedInvoice} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setSelectedInvoice(null)}>
              <Text style={styles.closeBtnText}>Close</Text>
            </TouchableOpacity>
            
            {selectedInvoice && (
              <InvoiceComponent invoice={selectedInvoice} />
            )}
            
            <TouchableOpacity style={styles.printBtn} onPress={() => {
                if (typeof window !== 'undefined') window.print();
            }}>
              <Text style={styles.printBtnText}>Print Invoice</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#4a121a',
    marginBottom: 24,
  },
  listContainer: {
    flex: 1,
  },
  emptyText: {
    textAlign: 'center',
    color: '#888',
    marginTop: 40,
    fontSize: 16,
  },
  orderCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#eee',
    borderLeftWidth: 4,
    borderLeftColor: '#D5A943',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  orderId: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  orderTotal: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#4a121a',
  },
  cardMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  metaText: {
    fontSize: 14,
    color: '#666',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  modalContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  closeBtn: {
    alignSelf: 'flex-end',
    backgroundColor: '#fff',
    padding: 8,
    borderRadius: 4,
    marginBottom: 16,
  },
  closeBtnText: {
    color: '#e74c3c',
    fontWeight: 'bold',
  },
  printBtn: {
    backgroundColor: '#4a121a',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 24,
  },
  printBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
});
