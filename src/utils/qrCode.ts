import QRCode from 'qrcode';
import { Platform } from 'react-native';
import { useRestaurantStore } from '../store/restaurantStore';

/**
 * Local Wi-Fi IPv4 address of the host machine.
 * Accessible by any mobile device on the same restaurant Wi-Fi router / mobile hotspot.
 */
export const DEFAULT_LAN_IP = '192.168.1.14';
export const DEFAULT_PORT = '8081';
export const DEFAULT_STABLE_URL = `http://${DEFAULT_LAN_IP}:${DEFAULT_PORT}`;

/**
 * Validates that a feedback URL is reachable and not a dead placeholder, dropped tunnel, or localhost.
 */
function isValidFeedbackUrl(url?: string): boolean {
  if (!url || !url.trim()) return false;
  const clean = url.trim().toLowerCase();
  if (clean.includes('localhost') || clean.includes('127.0.0.1')) return false;
  // Discard dropped/dead ephemeral tunnels, dead IP, and 404 placeholders
  if (clean.includes('192.168.1.17') || clean.includes('sultan-resturant.web.app') || clean.includes('.lhr.life')) return false;
  return true;
}

/**
 * Resolves the online or local network base address for customer-facing portals
 * (QR Codes, WhatsApp Links, Invoices).
 *
 * CRITICAL: Never generates 'localhost', dropped tunnels, or dead undeployed domains!
 */
export function getBaseFeedbackUrl(customOverride?: string): string {
  // 1. Explicit override passed as argument
  if (customOverride && isValidFeedbackUrl(customOverride)) {
    return customOverride.trim().replace(/\/+$/, '');
  }

  // 2. Check environment variable (.env)
  if (process.env.EXPO_PUBLIC_FEEDBACK_ONLINE_URL && isValidFeedbackUrl(process.env.EXPO_PUBLIC_FEEDBACK_ONLINE_URL)) {
    return process.env.EXPO_PUBLIC_FEEDBACK_ONLINE_URL.trim().replace(/\/+$/, '');
  }

  // 3. Check user-configured URL stored in Zustand Store (persisted)
  try {
    const storeUrl = useRestaurantStore.getState().onlineFeedbackUrl;
    if (storeUrl && isValidFeedbackUrl(storeUrl)) {
      return storeUrl.trim().replace(/\/+$/, '');
    }
  } catch {
    // Zustand store may not be ready during early init
  }

  // 4. In Web Browser: Check localStorage
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      const stored = window.localStorage.getItem('sultan_feedback_online_url');
      if (stored && isValidFeedbackUrl(stored)) {
        return stored.trim().replace(/\/+$/, '');
      } else if (stored && (stored.includes('192.168.1.17') || stored.includes('sultan-resturant.web.app') || stored.includes('.lhr.life'))) {
        window.localStorage.removeItem('sultan_feedback_online_url');
      }
    } catch {
      // Ignore
    }

    // If page is accessed via an external public domain (e.g. *.ngrok*, *.exp.direct)
    // or via a LAN IP (e.g. 192.168.x.x), use that exact origin!
    if (window.location && window.location.hostname) {
      const host = window.location.hostname;
      if (
        host !== 'localhost' &&
        host !== '127.0.0.1' &&
        host !== '0.0.0.0' &&
        !host.includes('sultan-resturant.web.app') &&
        !host.includes('.lhr.life')
      ) {
        return window.location.origin.replace(/\/+$/, '');
      } else if (host === 'localhost' || host === '127.0.0.1') {
        const port = window.location.port || '8081';
        return `http://${DEFAULT_LAN_IP}:${port}`;
      }
    }
  }

  // 5. Default Fallback: Host Machine Network IP (accessible to all phones on Wi-Fi router)
  return DEFAULT_STABLE_URL;
}

/**
 * Builds the direct URL to the item-wise feedback page for a specific invoice.
 */
export function getInvoiceFeedbackUrl(invoiceId: string, customBaseUrl?: string): string {
  const base = getBaseFeedbackUrl(customBaseUrl);
  return `${base}/feedback?invoiceId=${encodeURIComponent(invoiceId)}`;
}

/**
 * Generates a Base64 PNG Data URL for a scannable QR Code that links directly
 * to the invoice item-wise feedback & review portal.
 */
export async function generateInvoiceQrCode(
  invoiceId: string,
  customBaseUrl?: string
): Promise<string> {
  const targetUrl = getInvoiceFeedbackUrl(invoiceId, customBaseUrl);
  try {
    const dataUrl = await QRCode.toDataURL(targetUrl, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 280,
      color: {
        dark: '#140306', // Royal deep burgundy/black for luxury contrast
        light: '#FFFFFF',
      },
    });
    return dataUrl;
  } catch (err) {
    console.warn('Failed to generate QR Code:', err);
    return '';
  }
}

/**
 * Builds the direct URL to the Digital Menu for a specific table or cabin.
 */
export function getTableMenuUrl(
  tableId: string,
  floor?: string,
  tableName?: string,
  customBaseUrl?: string
): string {
  const base = getBaseFeedbackUrl(customBaseUrl);
  const params = new URLSearchParams();
  if (tableId) params.set('tableId', tableId);
  if (floor) params.set('floor', floor);
  if (tableName) params.set('tableName', tableName);
  return `${base}/menu?${params.toString()}`;
}

/**
 * Generates a Base64 PNG Data URL for a table's contactless digital menu QR Code.
 */
export async function generateTableQrCode(
  tableId: string,
  floor?: string,
  tableName?: string,
  customBaseUrl?: string
): Promise<string> {
  const targetUrl = getTableMenuUrl(tableId, floor, tableName, customBaseUrl);
  try {
    const dataUrl = await QRCode.toDataURL(targetUrl, {
      errorCorrectionLevel: 'H',
      margin: 1,
      width: 320,
      color: {
        dark: '#3A0F12', // Sultan Executive Royal Burgundy
        light: '#FFFFFF',
      },
    });
    return dataUrl;
  } catch (err) {
    console.warn('Failed to generate Table QR Code:', err);
    return '';
  }
}

/**
 * Triggers printing of a luxury acrylic Table Tent Card / Standee.
 */
export function printTableStandeeHtml(
  table: { id: string; name: string; floor?: string; seats?: number; zone?: string; seatingType?: string },
  qrDataUrl: string
) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;

  const floorName = table.floor || 'Ground Floor';
  const unitType = table.seatingType === 'majlis' ? 'Arabian Majlis Cabin' : table.seatingType === 'couches' ? 'VIP Couch' : 'Dining Table';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <title>Sultan Table Standee - ${table.name}</title>
      <style>
        @page {
          size: 4in 6in;
          margin: 0;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          background: #FFF;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 18px;
          height: 100vh;
        }
        .standee-card {
          width: 100%;
          max-width: 340px;
          height: 100%;
          max-height: 520px;
          border: 3px solid #D5A943;
          border-radius: 18px;
          padding: 20px 16px;
          text-align: center;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          background: #FAF8F5;
          position: relative;
          box-shadow: 0 4px 15px rgba(0,0,0,0.08);
        }
        .inner-border {
          position: absolute;
          top: 6px; left: 6px; right: 6px; bottom: 6px;
          border: 1px solid rgba(213, 169, 67, 0.4);
          border-radius: 12px;
          pointer-events: none;
        }
        .header-title {
          font-size: 20px;
          font-weight: 900;
          color: #3A0F12;
          letter-spacing: 1.5px;
          text-transform: uppercase;
        }
        .header-urdu {
          font-size: 15px;
          color: #D5A943;
          font-weight: bold;
          margin-top: 2px;
        }
        .table-badge-wrap {
          margin: 12px auto 6px auto;
          background: #3A0F12;
          color: #D5A943;
          padding: 8px 18px;
          border-radius: 25px;
          display: inline-block;
          border: 1.5px solid #D5A943;
        }
        .table-badge-title {
          font-size: 20px;
          font-weight: 900;
          letter-spacing: 1px;
        }
        .table-meta-sub {
          font-size: 11px;
          color: #666;
          margin-top: 3px;
          font-weight: 600;
        }
        .qr-wrap {
          margin: 10px auto;
          padding: 10px;
          background: #FFF;
          border-radius: 14px;
          display: inline-block;
          border: 2px solid #E6D5B8;
          box-shadow: 0 3px 8px rgba(0,0,0,0.06);
        }
        .qr-img {
          width: 175px;
          height: 175px;
          display: block;
        }
        .instructions-title {
          font-size: 12px;
          font-weight: 800;
          color: #3A0F12;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .instructions-urdu {
          font-size: 12px;
          color: #8C6B1B;
          font-weight: bold;
          margin-top: 2px;
        }
        .steps-row {
          font-size: 10px;
          color: #555;
          margin-top: 6px;
          line-height: 1.35;
        }
        .wifi-pill {
          margin-top: 8px;
          background: #ECEFF1;
          border-radius: 6px;
          padding: 4px 8px;
          font-size: 9.5px;
          color: #37474F;
          font-weight: 600;
        }
      </style>
    </head>
    <body>
      <div class="standee-card">
        <div class="inner-border"></div>
        <div>
          <div class="header-title">SULTAN RESTAURANT</div>
          <div class="header-urdu">سلطان ریستوراں • شاہی ذائقے</div>
          <div class="table-badge-wrap">
            <div class="table-badge-title">${table.name}</div>
          </div>
          <div class="table-meta-sub">${floorName} • ${unitType} (${table.seats || 4} Seats)</div>
        </div>

        <div class="qr-wrap">
          <img src="${qrDataUrl}" alt="Table QR Code" class="qr-img" />
        </div>

        <div>
          <div class="instructions-title">Scan Camera to View Menu & Order</div>
          <div class="instructions-urdu">آرڈر کے لیے اپنے کیمرے سے اسکین کریں</div>
          <div class="steps-row">
            1. Open Mobile Camera / QR Scanner • 2. Tap Menu Link<br/>
            3. Choose Dishes • 4. Direct Sent to Kitchen!
          </div>
          <div class="wifi-pill">Guest Wi-Fi: <b>Sultan-Guest</b> | Key: <b>sultan123</b></div>
        </div>
      </div>
    </body>
    </html>
  `;

  let iframe = document.getElementById('table-qr-print-frame') as HTMLIFrameElement | null;
  if (!iframe) {
    iframe = document.createElement('iframe');
    iframe.id = 'table-qr-print-frame';
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
    doc.write(html);
    doc.close();
    setTimeout(() => {
      iframe?.contentWindow?.focus();
      iframe?.contentWindow?.print();
    }, 250);
  }
}

/**
 * Batch Prints multiple table standees with automatic page breaks.
 */
export function printAllTablesStandeesHtml(
  tablesList: { id: string; name: string; floor?: string; seats?: number; zone?: string; seatingType?: string }[],
  qrMap: Record<string, string>
) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;

  const cardsHtml = tablesList.map(table => {
    const qrDataUrl = qrMap[table.id] || '';
    const floorName = table.floor || 'Ground Floor';
    const unitType = table.seatingType === 'majlis' ? 'Arabian Majlis Cabin' : table.seatingType === 'couches' ? 'VIP Couch' : 'Dining Table';

    return `
      <div class="page-break">
        <div class="standee-card">
          <div class="inner-border"></div>
          <div>
            <div class="header-title">SULTAN RESTAURANT</div>
            <div class="header-urdu">سلطان ریستوراں • شاہی ذائقے</div>
            <div class="table-badge-wrap">
              <div class="table-badge-title">${table.name}</div>
            </div>
            <div class="table-meta-sub">${floorName} • ${unitType} (${table.seats || 4} Seats)</div>
          </div>

          <div class="qr-wrap">
            ${qrDataUrl ? `<img src="${qrDataUrl}" alt="Table QR Code" class="qr-img" />` : '<div style="padding: 40px;">Generating...</div>'}
          </div>

          <div>
            <div class="instructions-title">Scan Camera to View Menu & Order</div>
            <div class="instructions-urdu">آرڈر کے لیے اپنے کیمرے سے اسکین کریں</div>
            <div class="steps-row">
              1. Open Mobile Camera / QR Scanner • 2. Tap Menu Link<br/>
              3. Choose Dishes • 4. Direct Sent to Kitchen!
            </div>
            <div class="wifi-pill">Guest Wi-Fi: <b>Sultan-Guest</b> | Key: <b>sultan123</b></div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <title>Sultan All Tables QR Standees</title>
      <style>
        @page {
          size: 4in 6in;
          margin: 0;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          background: #FFF;
        }
        .page-break {
          page-break-after: always;
          height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
        }
        .standee-card {
          width: 100%;
          max-width: 340px;
          height: 100%;
          max-height: 520px;
          border: 3px solid #D5A943;
          border-radius: 18px;
          padding: 20px 16px;
          text-align: center;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          background: #FAF8F5;
          position: relative;
        }
        .inner-border {
          position: absolute;
          top: 6px; left: 6px; right: 6px; bottom: 6px;
          border: 1px solid rgba(213, 169, 67, 0.4);
          border-radius: 12px;
          pointer-events: none;
        }
        .header-title {
          font-size: 20px;
          font-weight: 900;
          color: #3A0F12;
          letter-spacing: 1.5px;
          text-transform: uppercase;
        }
        .header-urdu {
          font-size: 15px;
          color: #D5A943;
          font-weight: bold;
          margin-top: 2px;
        }
        .table-badge-wrap {
          margin: 12px auto 6px auto;
          background: #3A0F12;
          color: #D5A943;
          padding: 8px 18px;
          border-radius: 25px;
          display: inline-block;
          border: 1.5px solid #D5A943;
        }
        .table-badge-title {
          font-size: 20px;
          font-weight: 900;
          letter-spacing: 1px;
        }
        .table-meta-sub {
          font-size: 11px;
          color: #666;
          margin-top: 3px;
          font-weight: 600;
        }
        .qr-wrap {
          margin: 10px auto;
          padding: 10px;
          background: #FFF;
          border-radius: 14px;
          display: inline-block;
          border: 2px solid #E6D5B8;
        }
        .qr-img {
          width: 175px;
          height: 175px;
          display: block;
        }
        .instructions-title {
          font-size: 12px;
          font-weight: 800;
          color: #3A0F12;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .instructions-urdu {
          font-size: 12px;
          color: #8C6B1B;
          font-weight: bold;
          margin-top: 2px;
        }
        .steps-row {
          font-size: 10px;
          color: #555;
          margin-top: 6px;
          line-height: 1.35;
        }
        .wifi-pill {
          margin-top: 8px;
          background: #ECEFF1;
          border-radius: 6px;
          padding: 4px 8px;
          font-size: 9.5px;
          color: #37474F;
          font-weight: 600;
        }
      </style>
    </head>
    <body>
      ${cardsHtml}
    </body>
    </html>
  `;

  let iframe = document.getElementById('table-qr-print-frame') as HTMLIFrameElement | null;
  if (!iframe) {
    iframe = document.createElement('iframe');
    iframe.id = 'table-qr-print-frame';
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
    doc.write(html);
    doc.close();
    setTimeout(() => {
      iframe?.contentWindow?.focus();
      iframe?.contentWindow?.print();
    }, 350);
  }
}

