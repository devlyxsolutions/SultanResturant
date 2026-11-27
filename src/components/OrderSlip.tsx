import { Image, Platform, StyleSheet, Text, View } from 'react-native';
import { SULTAN_LOGO_BASE64 } from '../constants/logoBase64';
import { Ticket } from '../store/restaurantStore';
import SultanLogo from './SultanLogo';

type OrderSlipProps = {
  ticket: Ticket;
};

export type PrintOrderSlipOptions = {
  stationLabel?: string;
  onAfterPrint?: () => void;
};

/**
 * Universal print helper for Kitchen / JuiceBar 80mm Thermal KOT Slips.
 * Supports silent kiosk printing and sequential queue callbacks via `onAfterPrint`.
 */
export function printOrderSlip(ticket: Ticket, options?: PrintOrderSlipOptions) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    options?.onAfterPrint?.();
    return;
  }
  if (!ticket) {
    options?.onAfterPrint?.();
    return;
  }

  const stationTitle = options?.stationLabel || 'KITCHEN KOT';
  const rawKotId = String(ticket.id || 'N/A').toUpperCase();
  const kotDisplay = rawKotId.startsWith('KOT') ? `KOT #${rawKotId.replace(/^KOT-?/i, '')}` : `KOT #${rawKotId}`;
  const date = new Date(ticket.timePlaced || Date.now()).toLocaleString('en-PK', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    day: '2-digit',
    month: 'short',
  });
  const items = Array.isArray(ticket.items) ? ticket.items : [];
  const totalQty = items.reduce((sum, item) => sum + (item?.qty || 1), 0);
  const itemsHtml = items.map(item => `
    <tr>
      <td style="width: 22%; font-size: 22px; font-weight: 900; vertical-align: top; padding: 6px 2px; border-bottom: 1px dashed #777; color: #000;">${item?.qty || 1}x</td>
      <td style="width: 78%; font-size: 17px; vertical-align: top; padding: 6px 2px; border-bottom: 1px dashed #777;">
        <div style="font-weight: 900; color: #000; line-height: 1.25; font-size: 17px;">${item?.name || ''}</div>
        ${item?.notes ? `<div style="font-size: 12px; font-weight: 800; color: #000; background: #f0f0f0; border-left: 3px solid #000; padding: 2px 6px; margin-top: 3px; border-radius: 2px;">* ${item.notes}</div>` : ''}
      </td>
    </tr>
  `).join('');

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${stationTitle} #${ticket.id} - Sultan Restaurant</title>
      <style>
        @page {
          size: 72mm auto;
          margin: 0mm !important;
        }
        @media print {
          html, body {
            width: 66mm !important;
            max-width: 66mm !important;
            margin: 0 !important;
            padding: 1.5mm 1.5mm 4mm 1mm !important;
            background: #fff !important;
            color: #000 !important;
          }
        }
        * {
          box-sizing: border-box;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        body {
          margin: 0 !important;
          padding: 1.5mm 1.5mm 4mm 1mm !important;
          width: 66mm !important;
          max-width: 66mm !important;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          color: #000;
          background: #fff;
          font-size: 12.5px;
        }
        .header {
          text-align: center;
          margin-bottom: 4px;
        }
        .logo-img {
          width: 128px;
          height: 118px;
          object-fit: contain;
          margin: 0 auto 3px auto;
          display: block;
        }
        .logo-title {
          font-size: 20px;
          font-weight: 900;
          letter-spacing: 1.2px;
          margin: 0;
          color: #000;
        }
        .logo-sub {
          display: inline-block;
          font-size: 12px;
          font-weight: 900;
          color: #000;
          border: 2px solid #000;
          padding: 2px 10px;
          letter-spacing: 1px;
          margin-top: 3px;
          border-radius: 3px;
        }
        .kot-banner {
          text-align: center;
          font-size: 25px;
          font-weight: 900;
          padding: 6px 4px;
          background: #000;
          color: #fff;
          border-radius: 4px;
          margin: 6px 0 4px 0;
          letter-spacing: 1.5px;
        }
        .table-banner {
          text-align: center;
          font-size: 22px;
          font-weight: 900;
          padding: 5px 4px;
          background: #fff;
          color: #000;
          border: 2.5px solid #000;
          border-radius: 4px;
          margin: 0 0 6px 0;
          letter-spacing: 1.2px;
        }
        .divider {
          border-top: 2px solid #000;
          margin: 6px 0;
        }
        .divider-dashed {
          border-top: 1px dashed #000;
          margin: 6px 0;
        }
        .meta-row {
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          font-weight: 700;
          margin: 2px 0;
          font-family: "Courier New", Courier, monospace;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin: 6px 0;
          font-family: "Courier New", Courier, monospace;
        }
        th {
          font-size: 11px;
          font-weight: 900;
          text-transform: uppercase;
          border-bottom: 2px solid #000;
          padding: 4px 0;
        }
        .footer {
          text-align: center;
          font-size: 11px;
          font-weight: 700;
          margin-top: 6px;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <img src="${SULTAN_LOGO_BASE64}" alt="Sultan Logo" class="logo-img" />
        <h2 class="logo-title">${stationTitle}</h2>
        <div class="logo-sub">${ticket.isAddOn ? `ADD-ON ROUND #${ticket.roundNumber || 2}` : 'NEW ORDER'}</div>
      </div>
      <div class="kot-banner">${kotDisplay}</div>
      <div class="table-banner">TABLE: ${ticket.tableName || 'Counter'}</div>
      <div class="meta-row">
        <span>Time: ${date}</span>
        <span>Total Qty: ${totalQty}</span>
      </div>
      <div class="meta-row">
        <span>Server: ${ticket.server || 'Staff'}</span>
      </div>
      ${ticket.notes ? `<div style="border: 2px solid #000; background: #f3f3f3; padding: 5px 7px; margin: 6px 0; border-radius: 3px;"><div style="font-size: 10px; font-weight: 900; letter-spacing: 0.6px;">ORDER NOTE / INSTRUCTIONS:</div><div style="font-size: 13px; font-weight: 900; margin-top: 2px;">${ticket.notes}</div></div>` : ''}
      <table>
        <thead>
          <tr>
            <th style="width: 18%; text-align: left;">Qty</th>
            <th style="width: 82%; text-align: left;">Item</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>
      <div class="divider"></div>
      <div class="footer">Powered & Designed by Nizaam Digital Solution</div>
    </body>
    </html>
  `;

  let iframe = document.getElementById('slip-print-frame') as HTMLIFrameElement | null;
  if (!iframe) {
    iframe = document.createElement('iframe');
    iframe.id = 'slip-print-frame';
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

  let finished = false;
  const finishOnce = () => {
    if (finished) return;
    finished = true;
    options?.onAfterPrint?.();
  };

  const doc = iframe.contentWindow?.document;
  if (doc) {
    doc.open();
    doc.write(htmlContent);
    doc.close();
    setTimeout(() => {
      try {
        const win = iframe?.contentWindow;
        if (!win) {
          finishOnce();
          return;
        }
        const fallbackTimer = setTimeout(finishOnce, 1800);
        win.onafterprint = () => {
          clearTimeout(fallbackTimer);
          finishOnce();
        };
        win.focus();
        win.print();
      } catch {
        finishOnce();
      }
    }, 220);
  } else {
    finishOnce();
  }
}

export default function OrderSlip({ ticket }: OrderSlipProps) {
  if (!ticket) return null;
  const items = Array.isArray(ticket.items) ? ticket.items : [];
  const date = ticket.timePlaced ? new Date(ticket.timePlaced).toLocaleString() : '';

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
                position: fixed !important;
                left: 0 !important;
                transform: none !important;
                top: 0 !important;
                width: 66mm !important;
                max-width: 66mm !important;
                margin: 0 !important;
                padding: 1.5mm 1.5mm 4mm 1mm !important;
                background: #fff !important;
              }
            }
          `}
        </style>
      )}
      {/* Header */}
      <View style={styles.header}>
        <Image
          source={{ uri: SULTAN_LOGO_BASE64 }}
          style={{ width: 128, height: 118, alignSelf: 'center', marginBottom: 4 }}
          resizeMode="contain"
        />
        <Text style={styles.logoText}>KITCHEN SLIP</Text>
        <Text style={styles.logoSubText}>{ticket.isAddOn ? 'ADD-ON ORDER' : 'NEW ORDER'}</Text>
      </View>

      {/* Prominent KOT # on Top & Table # Below */}
      <View style={{ backgroundColor: '#000', paddingVertical: 7, paddingHorizontal: 8, borderRadius: 6, marginTop: 4, alignItems: 'center' }}>
        <Text style={{ color: '#fff', fontSize: 22, fontWeight: '900', letterSpacing: 1.2 }}>
          {String(ticket.id || '').toUpperCase().startsWith('KOT')
            ? `KOT #${String(ticket.id).replace(/^KOT-?/i, '')}`
            : `KOT #${ticket.id}`}
        </Text>
      </View>
      <View style={{ borderWidth: 2, borderColor: '#000', backgroundColor: '#fff', paddingVertical: 6, paddingHorizontal: 8, borderRadius: 6, marginTop: 5, marginBottom: 6, alignItems: 'center' }}>
        <Text style={{ color: '#000', fontSize: 19, fontWeight: '900', letterSpacing: 1 }}>
          TABLE: {ticket.tableName || 'N/A'}
        </Text>
      </View>

      <View style={styles.divider} />

      {/* Meta */}
      <View style={styles.metaRow}>
        <Text style={styles.metaText}>{date}</Text>
        <Text style={styles.metaText}>Server: {ticket.server || 'Staff'}</Text>
      </View>
      {ticket.isAddOn && (
        <View style={styles.metaRow}>
          <Text style={styles.metaText}>Round #: {ticket.roundNumber || 2}</Text>
        </View>
      )}
      {ticket.notes ? (
        <View style={{ borderWidth: 1.5, borderColor: '#000', backgroundColor: '#F3F4F6', padding: 6, marginVertical: 6, borderRadius: 4 }}>
          <Text style={{ fontSize: 10, fontWeight: '900', color: '#000' }}>ORDER NOTE / INSTRUCTIONS:</Text>
          <Text style={{ fontSize: 12.5, fontWeight: '800', color: '#000', marginTop: 2 }}>{ticket.notes}</Text>
        </View>
      ) : null}

      <View style={styles.dividerDashed} />

      {/* Items */}
      <View style={styles.tableHeader}>
        <Text style={[styles.tableText, styles.qtyCol]}>Qty</Text>
        <Text style={[styles.tableText, styles.itemCol]}>Item</Text>
      </View>

      {items.map((item, idx) => (
        <View key={idx} style={styles.tableRow}>
          <Text style={[styles.itemText, styles.qtyCol, { fontWeight: 'bold' }]}>{item?.qty ?? 1}</Text>
          <View style={styles.itemCol}>
            <Text style={styles.itemText}>{item?.name ?? ''}</Text>
            {item?.notes ? (
              <Text style={styles.notesText}>Note: {item.notes}</Text>
            ) : null}
          </View>
        </View>
      ))}

      <View style={styles.divider} />
      <Text style={{ textAlign: 'center', fontSize: 10, fontWeight: '700', color: '#000', marginTop: 4 }}>
        Powered & Designed by Nizaam Digital Solution
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    padding: 16,
    width: '100%',
    maxWidth: 340,
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 8,
  },
  header: {
    alignItems: 'center',
    marginBottom: 8,
  },
  logoText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
    letterSpacing: 2,
  },
  logoSubText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#666',
    letterSpacing: 1,
    marginTop: 2,
  },
  divider: {
    height: 2,
    backgroundColor: '#000',
    marginVertical: 8,
  },
  dividerDashed: {
    height: 1,
    borderWidth: 1,
    borderColor: '#666',
    borderStyle: 'dashed',
    marginVertical: 8,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  metaText: {
    fontSize: 11,
    color: '#333',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  metaTextBold: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#000',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
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
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  itemText: {
    fontSize: 12,
    color: '#000',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  notesText: {
    fontSize: 10,
    color: '#e67e22',
    fontStyle: 'italic',
    marginTop: 2,
  },
  qtyCol: {
    width: '18%',
  },
  itemCol: {
    width: '82%',
  },
});
