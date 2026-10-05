import React from 'react';
import { View, Text, StyleSheet, Platform, useWindowDimensions, TouchableOpacity, Share, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Invoice } from '../store/restaurantStore';
import SultanLogo from './SultanLogo';
import { SULTAN_LOGO_BASE64 } from '../constants/logoBase64';

type InvoiceProps = {
  invoice: Invoice;
  onClose?: () => void;
};

/**
 * Universal print helper for Sultan Restaurant receipt slip.
 * Responsive for any printer:
 * - On 80mm thermal roll: Fits 100% width edge-to-edge.
 * - On 58mm thermal roll: Fits 100% width edge-to-edge.
 * - On A4 / Letter printer or Save as PDF: Centers neatly at standard receipt width (~80mm) without squishing or broken words.
 */
export function printInvoiceReceipt(invoice: Invoice) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    const dateStr = new Date(invoice.timeSettled || invoice.timePlaced).toLocaleString();
    const orderCreator = invoice.orderTakenBy || (invoice.server && !invoice.server.toLowerCase().includes('pos') ? invoice.server : 'Staff');
    const cashierName = invoice.cashier || (invoice.server?.toLowerCase().includes('pos') ? invoice.server : 'Manager');
    
    let text = `================================\n`;
    text += `       SULTAN RESTAURANT       \n`;
    text += `    LUXURY DINING & BANQUET    \n`;
    text += `Food Street, Culinary District, Lahore\n`;
    text += ` Tel: 0300-1234567 • NTN: 8943120-4\n`;
    text += `--------------------------------\n`;
    text += `INV #: ${invoice.id}\n`;
    text += `Date: ${dateStr}\n`;
    text += `Type: ${invoice.orderType.toUpperCase()}${invoice.tableName ? ` • Table: ${invoice.tableName}` : ''}\n`;
    text += `Order Taken By: ${orderCreator}\n`;
    text += `Billed By (Cashier): ${cashierName}\n`;
    text += `--------------------------------\n`;
    text += `Qty  Item               Amount\n`;
    text += `--------------------------------\n`;
    invoice.items.forEach(i => {
      text += `${i.qty}x  ${i.name.padEnd(18).substring(0, 18)} Rs. ${(i.price * i.qty).toLocaleString()}\n`;
    });
    text += `--------------------------------\n`;
    text += `Sub Total: Rs. ${(invoice.subTotal || 0).toLocaleString()}\n`;
    if ((invoice.discount || 0) > 0) {
      text += `Discount: - Rs. ${(invoice.discount || 0).toLocaleString()}\n`;
    }
    text += `GST Tax (16%): Rs. ${(invoice.tax || 0).toLocaleString()}\n`;
    text += `================================\n`;
    text += `NET PAYABLE: Rs. ${(invoice.total || 0).toLocaleString()}\n`;
    text += `================================\n`;
    if (invoice.payments && invoice.payments.length > 0) {
      invoice.payments.forEach(p => {
        text += `Paid via ${p.type.toUpperCase()}: Rs. ${(p.amount || 0).toLocaleString()}\n`;
      });
    }
    text += `\nThank you for dining with Sultan!\n`;

    try {
      Share.share({ message: text, title: `Invoice #${invoice.id}` });
    } catch {
      Alert.alert('Invoice', text);
    }
    return;
  }

  // Web Printing Implementation via Isolated IFrame
  const dateStr = new Date(invoice.timeSettled || invoice.timePlaced).toLocaleDateString();
  const timeStr = new Date(invoice.timeSettled || invoice.timePlaced).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const orderCreator = invoice.orderTakenBy || (invoice.server && !invoice.server.toLowerCase().includes('pos') ? invoice.server : 'Staff');
  const cashierName = invoice.cashier || (invoice.server?.toLowerCase().includes('pos') ? invoice.server : 'Manager');
  const isSameStaff = orderCreator === cashierName;

  const itemsHtml = invoice.items.map(item => `
    <tr>
      <td style="width: 14%; vertical-align: top; padding: 4px 0; font-size: 12px; font-weight: bold;">${item.qty}x</td>
      <td style="width: 54%; vertical-align: top; padding: 4px 0; font-size: 12px; word-break: break-word;">${item.name}</td>
      <td style="width: 32%; vertical-align: top; padding: 4px 0; font-size: 12px; text-align: right; font-weight: bold;">${(item.price * item.qty).toLocaleString()}</td>
    </tr>
  `).join('');

  const paymentsHtml = (invoice.payments && invoice.payments.length > 0)
    ? invoice.payments.map(p => `
      <div style="display: flex; justify-content: space-between; font-size: 11.5px; margin: 3px 0;">
        <span>Paid via ${p.type.toUpperCase()}:</span>
        <span style="font-weight: bold;">Rs. ${(p.amount || 0).toLocaleString()}</span>
      </div>
    `).join('')
    : '';

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Receipt #${invoice.id} - Sultan Restaurant</title>
      <style>
        @page {
          size: auto;
          margin: 4mm auto;
        }

        * {
          box-sizing: border-box;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }

        body {
          margin: 0 auto;
          padding: 6mm 4mm;
          width: 100%;
          max-width: 80mm;
          min-width: 60mm;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Courier New", Courier, monospace;
          color: #111;
          background: #ffffff;
          font-size: 11.5px;
          line-height: 1.35;
        }

        .header {
          text-align: center;
          margin-bottom: 6px;
        }

        .logo-img {
          width: 86px;
          height: 80px;
          object-fit: contain;
          margin: 0 auto 6px auto;
          display: block;
        }

        .brand-title {
          font-size: 19px;
          font-weight: 900;
          letter-spacing: 2px;
          color: #1C1C1E;
          margin: 0;
        }

        .brand-sub {
          font-size: 9.5px;
          font-weight: 700;
          letter-spacing: 1.5px;
          color: #666;
          margin-top: 2px;
        }

        .contact {
          font-size: 9.5px;
          color: #555;
          margin-top: 2px;
        }

        .dashed-line {
          border-top: 1px dashed #777;
          margin: 6px 0;
        }

        .double-line {
          border-top: 2px solid #222;
          margin: 6px 0;
        }

        .meta-row {
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          margin: 2.5px 0;
          font-family: "Courier New", Courier, monospace;
        }

        .meta-bold {
          font-weight: bold;
          color: #000;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          margin: 5px 0;
          font-family: "Courier New", Courier, monospace;
        }

        th {
          font-size: 11.5px;
          text-transform: uppercase;
          border-bottom: 1px solid #aaa;
          padding: 4px 0;
        }

        td {
          padding: 3px 0;
        }

        .summary-row {
          display: flex;
          justify-content: space-between;
          font-size: 11.5px;
          margin: 2.5px 0;
          font-family: "Courier New", Courier, monospace;
        }

        .grand-row {
          display: flex;
          justify-content: space-between;
          font-size: 15px;
          font-weight: 900;
          margin: 4px 0;
          font-family: "Courier New", Courier, monospace;
        }

        .footer {
          text-align: center;
          margin-top: 12px;
          padding-top: 8px;
          border-top: 1px solid #eee;
          font-size: 10px;
          color: #444;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <img src="${SULTAN_LOGO_BASE64}" alt="Sultan Logo" class="logo-img" />
        <h1 class="brand-title">SULTAN RESTAURANT</h1>
        <div class="brand-sub">LUXURY DINING & BANQUET</div>
        <div class="contact">Food Street, Culinary District, Lahore</div>
        <div class="contact">Tel: 0300-1234567 • NTN: 8943120-4</div>
      </div>

      <div class="dashed-line"></div>

      <div class="meta-row">
        <span>INV: #${invoice.id}</span>
        <span>${timeStr}</span>
      </div>
      <div class="meta-row">
        <span>Type: ${invoice.orderType.toUpperCase()}</span>
        <span>Date: ${dateStr}</span>
      </div>
      ${invoice.tableName ? `<div class="meta-row"><span>Table: ${invoice.tableName}</span></div>` : ''}

      ${isSameStaff ? `
        <div class="meta-row"><span>Staff / Cashier: ${cashierName}</span></div>
      ` : `
        <div class="meta-row">
          <span>Order Taken By:</span>
          <span class="meta-bold">${orderCreator}</span>
        </div>
        <div class="meta-row">
          <span>Billed By (Cashier):</span>
          <span class="meta-bold">${cashierName}</span>
        </div>
      `}

      ${invoice.customer ? `
        <div class="meta-row"><span>Guest: ${invoice.customer.name}</span></div>
        <div class="meta-row"><span>Phone: ${invoice.customer.phone}</span></div>
        ${invoice.customer.address ? `<div class="meta-row"><span>Address: ${invoice.customer.address}</span></div>` : ''}
      ` : ''}

      ${invoice.status === 'voided' ? `
        <div style="text-align: center; color: #c62828; font-weight: bold; font-size: 11px; margin: 6px 0;">
          *** BILL VOIDED / CANCELLED ***
        </div>
      ` : ''}

      <div class="dashed-line"></div>

      <table>
        <thead>
          <tr>
            <th style="width: 14%; text-align: left;">Qty</th>
            <th style="width: 54%; text-align: left;">Item</th>
            <th style="width: 32%; text-align: right;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

      <div class="dashed-line"></div>

      <div class="summary-row">
        <span>Sub Total:</span>
        <span style="font-weight: bold;">Rs. ${(invoice.subTotal || 0).toLocaleString()}</span>
      </div>
      ${(invoice.discount || 0) > 0 ? `
        <div class="summary-row">
          <span>Discount:</span>
          <span style="font-weight: bold;">- Rs. ${(invoice.discount || 0).toLocaleString()}</span>
        </div>
      ` : ''}
      <div class="summary-row">
        <span>GST Tax (16%):</span>
        <span style="font-weight: bold;">Rs. ${(invoice.tax || 0).toLocaleString()}</span>
      </div>

      <div class="double-line"></div>

      <div class="grand-row">
        <span>NET PAYABLE:</span>
        <span>Rs. ${(invoice.total || 0).toLocaleString()}</span>
      </div>

      <div class="double-line"></div>

      ${paymentsHtml}

      <div class="footer">
        <div style="font-weight: bold; margin-bottom: 2px;">Thank you for dining with Sultan!</div>
        <div style="font-size: 9px; color: #666;">We look forward to serving you again.</div>
        <div style="font-size: 8px; color: #888; margin-top: 3px;">Software by Sultan POS System</div>
      </div>
    </body>
    </html>
  `;

  let iframe = document.getElementById('receipt-print-frame') as HTMLIFrameElement | null;
  if (!iframe) {
    iframe = document.createElement('iframe');
    iframe.id = 'receipt-print-frame';
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.opacity = '0';
    iframe.style.pointerEvents = 'none';
    document.body.appendChild(iframe);
  }

  const doc = iframe.contentWindow?.document;
  if (doc) {
    doc.open();
    doc.write(htmlContent);
    doc.close();
    setTimeout(() => {
      iframe?.contentWindow?.focus();
      iframe?.contentWindow?.print();
    }, 250);
  }
}

export default function InvoiceComponent({ invoice }: InvoiceProps) {
  const { width } = useWindowDimensions();
  const isSmall = width < 380;

  const dateStr = new Date(invoice.timeSettled || invoice.timePlaced).toLocaleDateString();
  const timeStr = new Date(invoice.timeSettled || invoice.timePlaced).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const orderCreator = invoice.orderTakenBy || (invoice.server && !invoice.server.toLowerCase().includes('pos') ? invoice.server : 'Staff');
  const cashierName = invoice.cashier || (invoice.server?.toLowerCase().includes('pos') ? invoice.server : 'Manager');
  const isSameStaff = orderCreator === cashierName;

  return (
    <View style={styles.outerWrapper}>
      {/* 80MM / RESPONSIVE RESTAURANT RECEIPT SLIP */}
      <View nativeID="standard-invoice-receipt" style={styles.container}>
        {Platform.OS === 'web' && (
          <style dangerouslySetInnerHTML={{ __html: `
            @media print {
              @page {
                size: auto;
                margin: 4mm auto;
              }
              html, body {
                margin: 0 !important;
                padding: 0 !important;
                background: #ffffff !important;
              }
              body * {
                visibility: hidden !important;
              }
              #standard-invoice-receipt, #standard-invoice-receipt * {
                visibility: visible !important;
              }
              #standard-invoice-receipt {
                position: absolute !important;
                left: 50% !important;
                transform: translateX(-50%) !important;
                top: 0 !important;
                margin: 0 auto !important;
                width: 80mm !important;
                min-width: 60mm !important;
                max-width: 80mm !important;
                box-sizing: border-box !important;
                padding: 6mm 4mm !important;
                border: none !important;
                box-shadow: none !important;
                background: #ffffff !important;
              }
            }
          `}} />
        )}

        {/* Header with Big Logo */}
        <View style={styles.header}>
          <SultanLogo size="md" variant="bare" width={86} height={80} style={{ alignSelf: 'center', marginBottom: 6 }} />
          <Text style={[styles.brandTitle, isSmall && { fontSize: 17 }]}>SULTAN RESTAURANT</Text>
          <Text style={styles.brandSub}>LUXURY DINING & BANQUET</Text>
          <Text style={styles.contactText}>Food Street, Culinary District, Lahore</Text>
          <Text style={styles.contactText}>Tel: 0300-1234567 • NTN: 8943120-4</Text>
        </View>

        <Text style={styles.dashedLine}>- - - - - - - - - - - - - - - - - - - - - -</Text>

        {/* Meta Info */}
        <View style={styles.metaRow}>
          <Text style={styles.metaText}>INV: #{invoice.id}</Text>
          <Text style={styles.metaText}>{timeStr}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaText}>Type: {invoice.orderType.toUpperCase()}</Text>
          <Text style={styles.metaText}>Date: {dateStr}</Text>
        </View>
        {invoice.tableName ? (
          <View style={styles.metaRow}>
            <Text style={styles.metaText}>Table: {invoice.tableName}</Text>
          </View>
        ) : null}

        {/* Order Creator & Cashier Details */}
        {isSameStaff ? (
          <View style={styles.metaRow}>
            <Text style={styles.metaText}>Staff / Cashier: {cashierName}</Text>
          </View>
        ) : (
          <>
            <View style={styles.metaRow}>
              <Text style={styles.metaText}>Order Taken By:</Text>
              <Text style={[styles.metaText, styles.boldText]}>{orderCreator}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaText}>Billed By (Cashier):</Text>
              <Text style={[styles.metaText, styles.boldText]}>{cashierName}</Text>
            </View>
          </>
        )}

        {invoice.customer && (
          <View style={{ marginTop: 2 }}>
            <Text style={styles.metaText}>Guest: {invoice.customer.name}</Text>
            <Text style={styles.metaText}>Phone: {invoice.customer.phone}</Text>
            {invoice.customer.address ? (
              <Text style={styles.metaText}>Address: {invoice.customer.address}</Text>
            ) : null}
          </View>
        )}

        {invoice.status === 'voided' && (
          <View style={{ marginVertical: 6, alignItems: 'center' }}>
            <Text style={styles.voidNotice}>*** BILL VOIDED / CANCELLED ***</Text>
          </View>
        )}

        <Text style={styles.dashedLine}>- - - - - - - - - - - - - - - - - - - - - -</Text>

        {/* Items Header */}
        <View style={styles.itemHeader}>
          <Text style={[styles.colText, { width: '15%', fontWeight: 'bold' }]}>Qty</Text>
          <Text style={[styles.colText, { width: '53%', fontWeight: 'bold' }]}>Item</Text>
          <Text style={[styles.colText, { width: '32%', textAlign: 'right', fontWeight: 'bold' }]}>Amount</Text>
        </View>

        {invoice.items.map((item, idx) => (
          <View key={idx} style={styles.itemRow}>
            <Text style={[styles.colText, { width: '15%', fontWeight: 'bold' }]}>{item.qty}x</Text>
            <Text style={[styles.colText, { width: '53%' }]}>{item.name}</Text>
            <Text style={[styles.colText, { width: '32%', textAlign: 'right', fontWeight: 'bold' }]}>
              {(item.price * item.qty).toLocaleString()}
            </Text>
          </View>
        ))}

        <Text style={styles.dashedLine}>- - - - - - - - - - - - - - - - - - - - - -</Text>

        {/* Totals */}
        <View style={styles.summaryRow}>
          <Text style={styles.summaryKey}>Sub Total:</Text>
          <Text style={styles.summaryVal}>Rs. {(invoice.subTotal || 0).toLocaleString()}</Text>
        </View>
        {(invoice.discount || 0) > 0 && (
          <View style={styles.summaryRow}>
            <Text style={styles.summaryKey}>Discount:</Text>
            <Text style={styles.summaryVal}>- Rs. {(invoice.discount || 0).toLocaleString()}</Text>
          </View>
        )}
        <View style={styles.summaryRow}>
          <Text style={styles.summaryKey}>GST Tax (16%):</Text>
          <Text style={styles.summaryVal}>Rs. {(invoice.tax || 0).toLocaleString()}</Text>
        </View>

        <Text style={styles.dashedLine}>================================</Text>

        <View style={styles.grandRow}>
          <Text style={styles.grandKey}>NET PAYABLE:</Text>
          <Text style={styles.grandVal}>Rs. {(invoice.total || 0).toLocaleString()}</Text>
        </View>

        <Text style={styles.dashedLine}>================================</Text>

        {invoice.payments && invoice.payments.length > 0 && (
          invoice.payments.map((p, idx) => (
            <View key={idx} style={styles.summaryRow}>
              <Text style={styles.summaryKey}>Paid via {p.type.toUpperCase()}:</Text>
              <Text style={styles.summaryVal}>Rs. {(p.amount || 0).toLocaleString()}</Text>
            </View>
          ))
        )}

        <View style={styles.footer}>
          <Text style={styles.footerText}>Thank you for dining with Sultan!</Text>
          <Text style={styles.footerSub}>We look forward to serving you again.</Text>
          <Text style={styles.footerSub}>Software by Sultan POS System</Text>
        </View>
      </View>

      {/* Direct Clean Print Button */}
      <TouchableOpacity
        style={styles.printActionBtn}
        onPress={() => printInvoiceReceipt(invoice)}
        activeOpacity={0.8}
      >
        <Ionicons name="print" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
        <Text style={styles.printActionText}>Print Receipt</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  outerWrapper: {
    alignItems: 'center',
    width: '100%',
  },
  container: {
    backgroundColor: '#FFFFFF',
    width: '100%',
    maxWidth: 380,
    minWidth: 300,
    padding: 18,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  header: {
    alignItems: 'center',
    marginBottom: 6,
  },
  brandTitle: {
    fontSize: 19,
    fontWeight: '900',
    color: '#1C1C1E',
    letterSpacing: 2,
    textAlign: 'center',
  },
  brandSub: {
    fontSize: 10,
    fontWeight: '700',
    color: '#8E8E93',
    letterSpacing: 1.5,
    marginTop: 2,
  },
  contactText: {
    fontSize: 10,
    color: '#636366',
    textAlign: 'center',
    marginTop: 2,
  },
  dashedLine: {
    fontSize: 11,
    color: '#8E8E93',
    textAlign: 'center',
    marginVertical: 4,
    letterSpacing: 1,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 2,
  },
  metaText: {
    fontSize: 11,
    color: '#333333',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  boldText: {
    fontWeight: 'bold',
  },
  voidNotice: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#C62828',
    letterSpacing: 1,
  },
  itemHeader: {
    flexDirection: 'row',
    marginVertical: 4,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  itemRow: {
    flexDirection: 'row',
    marginVertical: 2,
  },
  colText: {
    fontSize: 11,
    color: '#222222',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 2,
  },
  summaryKey: {
    fontSize: 11,
    color: '#444444',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  summaryVal: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#222222',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  grandRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 4,
  },
  grandKey: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#111111',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  grandVal: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#111111',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  footer: {
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#EEE',
  },
  footerText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#333333',
    textAlign: 'center',
  },
  footerSub: {
    fontSize: 9,
    color: '#8E8E93',
    textAlign: 'center',
    marginTop: 3,
  },
  printActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4a121a',
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 8,
    marginTop: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  printActionText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 15,
  },
});
