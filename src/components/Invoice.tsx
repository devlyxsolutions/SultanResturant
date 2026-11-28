import React from 'react';
import { View, Text, StyleSheet, Platform, useWindowDimensions, TouchableOpacity, Share, Alert, Image, Modal, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Invoice, useRestaurantStore } from '../store/restaurantStore';
import { useSettingsStore } from '../store/settingsStore';
import SultanLogo from './SultanLogo';
import { SULTAN_LOGO_BASE64 } from '../constants/logoBase64';
import {
  generateInvoiceQrCode,
  getBaseFeedbackUrl,
  getInvoiceFeedbackUrl,
  isValidFeedbackUrl,
  PUBLIC_ONLINE_URL,
} from '../utils/qrCode';
import { getActiveServerHttpUrl } from '../services/syncService';

type InvoiceProps = {
  invoice: Invoice;
  onClose?: () => void;
};

/**
 * Resolves the exact staff role/designation from the live staff directory
 * so receipts always show the person's real role (e.g. "Sharjeel (Cashier)",
 * "Tanveer (Cashier)", "Bilal (Order Taker)", "Nadeem (Floor Manager)")
 * instead of the generic route role "(Manager)".
 */
const KNOWN_STAFF_EXACT_ROLES: Record<string, string> = {
  sharjeel: 'Cashier',
  tanveer: 'Cashier',
  shakeel: 'G. Manager',
  nadeem: 'Floor Manager',
  'adil shah': 'Floor Manager',
  adil: 'Floor Manager',
  zulfiqar: 'Order Taker',
  bilal: 'Order Taker',
  madhia: 'Order Taker',
  tehreem: 'Order Taker',
  tahir: 'Order Taker',
  sheroz: 'Juice Bar',
  zahid: 'Store Keeper',
  'master admin': 'Admin',
  master: 'Admin',
};

export function formatStaffWithExactRole(
  rawNameOrLabel: string | undefined | null,
  fallbackRoleLabel: string = 'Cashier'
): string {
  const raw = String(rawNameOrLabel || '').trim();
  if (!raw) return fallbackRoleLabel;

  // Strip trailing parenthetical role or "• Customer" suffix to match staff directory
  const withoutCustomer = raw.includes('•') ? raw.split('•')[0].trim() : raw;
  const parenMatch = withoutCustomer.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  const baseName = (parenMatch ? parenMatch[1] : withoutCustomer).trim();
  const existingParenRole = parenMatch ? parenMatch[2].trim() : '';

  if (!baseName) return raw;
  const lowerBase = baseName.toLowerCase();

  try {
    const staffList = useRestaurantStore.getState().staff || [];
    const matched = staffList.find(
      (s) =>
        s &&
        (String(s.name || '').trim().toLowerCase() === lowerBase ||
          String(s.username || '').trim().toLowerCase() === lowerBase ||
          String(s.id || '').trim().toLowerCase() === lowerBase)
    );

    if (matched) {
      const cRole = String(matched.customRoleId || '').toLowerCase();
      const sRole = String(matched.role || '').trim();
      const sRoleLower = sRole.toLowerCase();
      const desig = String(matched.designation || '').trim();
      const desigLower = desig.toLowerCase();

      let exactRole = '';
      if (
        cRole === 'role-cashier' ||
        sRoleLower === 'cashier' ||
        desigLower === 'cashier' ||
        KNOWN_STAFF_EXACT_ROLES[lowerBase] === 'Cashier'
      ) {
        exactRole = 'Cashier';
      } else if (
        cRole === 'role-floor-manager' ||
        sRoleLower === 'floor manager' ||
        sRoleLower === 'floor_manager' ||
        desigLower.includes('f. manager') ||
        desigLower.includes('floor manager')
      ) {
        exactRole = 'Floor Manager';
      } else if (
        cRole === 'role-waiter' ||
        cRole === 'role-order-taker' ||
        sRoleLower === 'waiter' ||
        sRoleLower === 'order taker' ||
        desigLower === 'order taker'
      ) {
        exactRole = 'Order Taker';
      } else if (cRole === 'role-admin' || sRoleLower === 'admin' || matched.id === 'st-master') {
        exactRole = 'Admin';
      } else if (cRole === 'role-juicebar' || sRoleLower === 'juicebar' || sRoleLower === 'juice bar') {
        exactRole = desig || 'Juice Bar';
      } else if (cRole === 'role-kitchen' || sRoleLower === 'kitchen') {
        exactRole = 'Kitchen';
      } else if (desig) {
        exactRole = desig;
      } else if (KNOWN_STAFF_EXACT_ROLES[lowerBase]) {
        exactRole = KNOWN_STAFF_EXACT_ROLES[lowerBase];
      } else if (sRole) {
        exactRole = sRole;
      } else {
        exactRole = fallbackRoleLabel;
      }

      return `${matched.name} (${exactRole})`;
    }
  } catch {}

  if (KNOWN_STAFF_EXACT_ROLES[lowerBase]) {
    return `${baseName} (${KNOWN_STAFF_EXACT_ROLES[lowerBase]})`;
  }

  if (existingParenRole && existingParenRole.toLowerCase() !== 'pos') {
    return `${baseName} (${existingParenRole})`;
  }
  return `${baseName} (${fallbackRoleLabel})`;
}

/**
 * Universal responsive print engine for Sultan Restaurant receipt slip.
 * Responsive for any printer:
 * - On 80mm / 58mm Thermal Printers: Fits 100% of the roll width with compact thermal typography.
 * - On A4 / Letter Printers (EPSON L300, HP, Save as PDF): Automatically expands to fill the A4 page width
 *   with high-impact 130px logo, spacious 14.5px typography, and clean wide itemized rows!
 * - Includes scannable QR Code linking to customer item-wise feedback portal.
 */
export async function printInvoiceReceipt(invoice: Invoice, precomputedQrCode?: string) {
  const sysSettings = useSettingsStore.getState().settings;
  const brandName = (sysSettings.restaurantName || 'SULTAN RESTAURANT').trim();
  const brandTagline = (sysSettings.tagline || 'LUXURY DINING & BANQUET').trim();
  const brandAddress = (sysSettings.address || 'Food Street, Culinary District, Lahore').trim();
  const brandPhone = (sysSettings.phone || '0300-1234567').trim();
  const rawNtn = (sysSettings.ntnOrTaxId || '').trim();
  const brandNtn = rawNtn === '8943120-4' ? '' : rawNtn;
  const brandFooter = (sysSettings.footerMessage || 'Thank you for dining with Sultan!').trim();
  const taxLabel = sysSettings.taxLabel || 'GST Tax';
  const taxRate = sysSettings.taxEnabled ? sysSettings.taxRatePercent : 0;
  const currency = sysSettings.currencySymbol || 'Rs.';
  const showFeedbackQr =
    sysSettings.showQrOnReceipt !== false &&
    sysSettings.enableCustomerFeedbackQr !== false;

  const qrCodeDataUrl = showFeedbackQr
    ? (precomputedQrCode || await generateInvoiceQrCode(invoice.id))
    : '';
  const feedbackUrl = getInvoiceFeedbackUrl(invoice.id);

  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    try {
      const base = getActiveServerHttpUrl().replace(/\/+$/, '');
      if (base) {
        const res = await fetch(`${base}/api/print/bill`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ invoice }),
        });
        if (res.ok) {
          Alert.alert('Printed', 'Receipt sent to POS Thermal Printer.');
          return;
        }
      }
    } catch {}
    const dateStr = new Date(invoice.timeSettled || invoice.timePlaced).toLocaleString();
    const rawCreator = invoice.orderTakenBy || (invoice.server && !invoice.server.toLowerCase().includes('pos') ? invoice.server : '');
    const rawCashier = invoice.cashier || invoice.server || 'Cashier';
    const cashierName = formatStaffWithExactRole(rawCashier, 'Cashier');
    const orderCreator = rawCreator ? formatStaffWithExactRole(rawCreator, 'Order Taker') : cashierName;
    
    const isUnpaidBill = invoice.isUnpaidBill || invoice.status === 'unpaid';
    
    let text = `================================\n`;
    text += `       ${brandName}       \n`;
    text += `    ${brandTagline}    \n`;
    if (brandAddress) text += `${brandAddress}\n`;
    text += ` Tel: ${brandPhone}${brandNtn ? ` • NTN: ${brandNtn}` : ''}\n`;
    text += `--------------------------------\n`;
    if (isUnpaidBill) {
      text += `*** TEMPORARY / PENDING BILL ***\n`;
      text += `*** (عارضی بل / ادائیگی باقی ہے) ***\n`;
      text += `--------------------------------\n`;
    }
    text += `INV #: ${invoice.dailyInvoiceNumber || invoice.id}\n`;
    text += `Date: ${dateStr}\n`;
    text += `Type: ${invoice.orderType.toUpperCase()}${invoice.tableName ? ` • Table: ${invoice.tableName}` : ''}\n`;
    if (orderCreator && orderCreator !== cashierName) {
      text += `Order Taken By: ${orderCreator}\n`;
    }
    text += `Billed By: ${cashierName}\n`;
    text += `--------------------------------\n`;
    text += `Item             Qty  Price   Total\n`;
    text += `--------------------------------\n`;
    invoice.items.forEach(i => {
      text += `${i.name.padEnd(16).substring(0, 16)} ${String(i.qty + 'x').padEnd(4)} ${String((i.price || 0).toLocaleString()).padStart(5)} ${String(((i.price || 0) * i.qty).toLocaleString()).padStart(7)}\n`;
    });
    text += `--------------------------------\n`;
    text += `Sub Total: Rs. ${(invoice.subTotal || 0).toLocaleString()}\n`;
    if ((invoice.discount || 0) > 0) {
      text += `Discount: - Rs. ${(invoice.discount || 0).toLocaleString()}\n`;
    }
    if ((invoice.extraCharge || 0) > 0) {
      const reasonTxt = invoice.extraChargeReason ? ` (${invoice.extraChargeReason})` : '';
      text += `Extra${reasonTxt}: + ${currency} ${(invoice.extraCharge || 0).toLocaleString()}\n`;
    }
    if (sysSettings.taxEnabled && (invoice.tax || 0) > 0) {
      text += `${taxLabel} (${taxRate}%): ${currency} ${(invoice.tax || 0).toLocaleString()}\n`;
    }
    if ((invoice.serviceCharge || 0) > 0) {
      text += `Service Charge: ${currency} ${(invoice.serviceCharge || 0).toLocaleString()}\n`;
    }
    if (invoice.notes || invoice.packagingNotes) {
      text += `Notes: ${[invoice.notes, invoice.packagingNotes].filter(Boolean).join(' | ')}\n`;
    }
    text += `================================\n`;
    if (isUnpaidBill) {
      text += `*** TOTAL UNPAID DUE: ${currency} ${(invoice.total || 0).toLocaleString()} ***\n`;
      text += `*** PAYMENT PENDING AT CASHIER ***\n`;
      text += `*** براۓ مہربانی کیش کاؤنٹر پر ادائیگی فرمائیں ***\n`;
    } else {
      text += `NET PAYABLE: ${currency} ${(invoice.total || 0).toLocaleString()}\n`;
      text += `================================\n`;
      if (invoice.payments && invoice.payments.length > 0) {
        invoice.payments.forEach(p => {
          text += `Paid via ${p.type.toUpperCase()}: ${currency} ${(p.amount || 0).toLocaleString()}\n`;
        });
      }
    }
    if (showFeedbackQr) {
      text += `\nRate Each Dish & Give Feedback:\n${feedbackUrl}\n`;
    }
    text += `\n${brandFooter}\n`;

    try {
      Share.share({ message: text, title: `Invoice #${invoice.id}` });
    } catch {
      Alert.alert('Invoice', text);
    }
    return;
  }

  // Web Printing Implementation via Isolated IFrame
  const isUnpaidBill = invoice.isUnpaidBill || invoice.status === 'unpaid';
  const dateStr = new Date(invoice.timeSettled || invoice.timePlaced).toLocaleDateString();
  const timeStr = new Date(invoice.timeSettled || invoice.timePlaced).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const rawCreator = invoice.orderTakenBy || (invoice.server && !invoice.server.toLowerCase().includes('pos') ? invoice.server : '');
  const rawCashier = invoice.cashier || invoice.server || 'Cashier';
  const cashierName = formatStaffWithExactRole(rawCashier, 'Cashier');
  const orderCreator = rawCreator ? formatStaffWithExactRole(rawCreator, 'Order Taker') : cashierName;
  const isSameStaff = orderCreator === cashierName;

  const itemsHtml = invoice.items.map(item => `
    <tr>
      <td class="col-item">
        <div style="font-weight: 700;">${item.name}</div>
        ${(item as any).selectedVariant ? `<div style="font-size: 9.5px; font-weight: normal; color: #222;">Option: ${(item as any).selectedVariant}</div>` : ''}
        ${item.notes ? `<div style="font-size: 9px; font-style: italic; color: #333;">* ${item.notes}</div>` : ''}
      </td>
      <td class="col-qty">${item.qty}x</td>
      <td class="col-rate">${(item.price || 0).toLocaleString()}</td>
      <td class="col-amount">${((item.price || 0) * item.qty).toLocaleString()}</td>
    </tr>
  `).join('');

  const paymentsHtml = isUnpaidBill ? `
    <div style="border: 2px dashed #b91c1c; background-color: #fef2f2; padding: 7px; margin: 8px 0; text-align: center;">
      <div style="font-size: 13.5px; font-weight: 900; color: #b91c1c; letter-spacing: 0.5px;">
        *** TEMPORARY / PENDING BILL (ادائیگی باقی ہے) ***
      </div>
      <div style="font-size: 12px; font-weight: 800; color: #1e293b; margin-top: 3px;">
        TOTAL UNPAID DUE: Rs. ${(invoice.total || 0).toLocaleString()}
      </div>
      <div style="font-size: 10px; font-weight: bold; color: #4b5563; margin-top: 3px;">
        براۓ مہربانی کیش کاؤنٹر پر بل ادا فرمائیں
      </div>
    </div>
  ` : (invoice.payments && invoice.payments.length > 0)
    ? invoice.payments.map(p => `
      <div class="summary-row">
        <span>Paid via ${p.type.toUpperCase()}:</span>
        <span style="font-weight: bold;">Rs. ${(p.amount || 0).toLocaleString()}</span>
      </div>
      ${p.tendered && p.tendered > p.amount ? `
        <div class="summary-row" style="color: #444; font-size: 90%;">
          <span>Cash Tendered (وصول):</span>
          <span>Rs. ${(p.tendered || 0).toLocaleString()}</span>
        </div>
        <div class="summary-row" style="color: #059669; font-weight: bold;">
          <span>Change Returned (واپس رقم):</span>
          <span>Rs. ${(p.change || (p.tendered - p.amount) || 0).toLocaleString()}</span>
        </div>
      ` : ''}
    `).join('')
    : (invoice.tenderedAmount && invoice.changeReturned) ? `
      <div class="summary-row">
        <span>Cash Tendered (وصول):</span>
        <span>Rs. ${(invoice.tenderedAmount || 0).toLocaleString()}</span>
      </div>
      <div class="summary-row" style="color: #059669; font-weight: bold;">
        <span>Change Returned (واپس رقم):</span>
        <span>Rs. ${(invoice.changeReturned || 0).toLocaleString()}</span>
      </div>
    ` : '';

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Receipt #${invoice.id} - Sultan Restaurant</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@700&display=swap" rel="stylesheet">
      <style>
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }

        @page {
          size: 72mm auto;
          margin: 0mm !important;
        }

        html, body {
          margin: 0 !important;
          padding: 0 !important;
          background: #ffffff !important;
          color: #000000 !important;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
          width: 66mm !important;
          max-width: 66mm !important;
          text-rendering: optimizeLegibility !important;
          -webkit-font-smoothing: antialiased !important;
        }

        .receipt-container {
          width: 66mm !important;
          max-width: 66mm !important;
          margin: 0 !important;
          padding: 1.5mm 1.5mm 4mm 1mm !important;
          box-sizing: border-box;
          background: #ffffff;
        }

        .header {
          text-align: center;
          margin-bottom: 4px;
        }

        .logo-img {
          width: 145px;
          height: 135px;
          object-fit: contain;
          display: block;
          margin: 0 auto 4px auto;
        }

        .brand-title {
          font-size: 19px;
          font-weight: 900;
          color: #000000;
          margin: 1px 0 2px 0;
          letter-spacing: 0.5px;
          text-align: center;
          line-height: 1.2;
        }

        .urdu-slogan {
          font-family: 'Noto Nastaliq Urdu', 'Urdu Typesetting', 'Jameel Noori Nastaleeq', 'Amiri', 'Segoe UI', Tahoma, sans-serif !important;
          direction: rtl;
          unicode-bidi: isolate;
          font-size: 14.5px;
          font-weight: 700;
          color: #000000;
          line-height: 1.5;
          margin: 2px 0;
          text-align: center;
          letter-spacing: 0;
        }

        .brand-sub {
          font-size: 10.5px;
          font-weight: 800;
          color: #000000;
          text-align: center;
          margin-top: 1px;
          letter-spacing: 0.5px;
        }

        .contact {
          font-size: 10px;
          font-weight: 600;
          color: #000000;
          text-align: center;
          margin-top: 1px;
          line-height: 1.3;
        }

        .dashed-line {
          border-top: 1.5px dashed #000000 !important;
          margin: 4px 0 !important;
          width: 100%;
        }

        .double-line {
          border-top: 2px solid #000000 !important;
          margin: 5px 0 !important;
          width: 100%;
        }

        .meta-row {
          display: flex;
          justify-content: space-between;
          font-size: 10.5px;
          font-weight: 600;
          line-height: 1.4;
          margin: 1.5px 0;
          color: #000000;
        }

        .meta-bold {
          font-weight: 800;
          color: #000000;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
          margin: 3px 0;
        }

        table th {
          font-size: 11px;
          font-weight: 900;
          text-transform: uppercase;
          border-bottom: 1.5px solid #000000;
          padding: 3px 0;
          color: #000000;
        }

        table td {
          font-size: 11px;
          font-weight: 600;
          padding: 2.5px 0;
          color: #000000;
          vertical-align: top;
        }

        .col-item {
          width: 43%;
          word-break: break-word;
          font-weight: 700 !important;
          padding-right: 3px;
        }

        .col-qty {
          width: 13%;
          text-align: center;
          font-weight: 800 !important;
        }

        .col-rate {
          width: 21%;
          text-align: right;
          font-weight: 700 !important;
          padding-right: 2px;
        }

        .col-amount {
          width: 23%;
          text-align: right;
          font-weight: 800 !important;
        }

        .summary-row {
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          font-weight: 600;
          margin: 2px 0;
          color: #000000;
        }

        .grand-row {
          display: flex;
          justify-content: space-between;
          font-size: 16px;
          font-weight: 900;
          margin: 4px 0;
          color: #000000;
        }

        .footer {
          text-align: center;
          margin-top: 6px;
          padding-top: 5px;
          border-top: 1.5px dashed #000000;
          font-size: 10px;
          font-weight: 600;
          color: #000000;
        }

        .qr-section {
          text-align: center;
          margin: 5px 0;
          padding: 3px 0;
        }

        .qr-section-title {
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.5px;
          color: #000000;
          margin-bottom: 3px;
        }

        .qr-code-img {
          width: 80px;
          height: 80px;
          display: block;
          margin: 0 auto;
          image-rendering: pixelated;
        }

        .qr-hint {
          font-size: 9px;
          font-weight: 600;
          color: #000000;
          margin-top: 2px;
        }
      </style>
    </head>
    <body>
      <div class="receipt-container">
        <div class="header">
          ${sysSettings.showLogoOnReceipt !== false ? `<img src="${SULTAN_LOGO_BASE64}" alt="Logo" class="logo-img" />` : ''}
          <div class="urdu-slogan">جہاں ہر مہمان ہے سلطان</div>
          ${brandTagline ? `<div class="brand-sub">${brandTagline}</div>` : ''}
          ${brandAddress ? `<div class="contact">${brandAddress}</div>` : ''}
          ${(brandPhone || brandNtn) ? `<div class="contact">${brandPhone ? `Tel: ${brandPhone}` : ''}${brandPhone && brandNtn ? ' • ' : ''}${brandNtn ? `NTN: ${brandNtn}` : ''}</div>` : ''}
        </div>

        <div class="dashed-line"></div>

        <div class="meta-row">
          <span>INV: #${invoice.dailyInvoiceNumber || invoice.id}</span>
          <span>${timeStr}</span>
        </div>
        <div class="meta-row">
          <span>Type: ${invoice.orderType.toUpperCase()}</span>
          <span>Date: ${dateStr}</span>
        </div>
        ${invoice.tableName ? `<div class="meta-row"><span>Table: ${invoice.tableName}</span></div>` : ''}

        ${isSameStaff ? `
          <div class="meta-row">
            <span>Billed By:</span>
            <span class="meta-bold">${cashierName}</span>
          </div>
        ` : `
          <div class="meta-row">
            <span>Order Taken:</span>
            <span class="meta-bold">${orderCreator}</span>
          </div>
          <div class="meta-row">
            <span>Billed By:</span>
            <span class="meta-bold">${cashierName}</span>
          </div>
        `}

        ${invoice.customer ? `
          <div class="meta-row"><span>Guest: ${invoice.customer.name}</span></div>
          <div class="meta-row"><span>Phone: ${invoice.customer.phone}</span></div>
          ${invoice.customer.address ? `<div class="meta-row"><span>Address: ${invoice.customer.address}</span></div>` : ''}
        ` : ''}

        ${isUnpaidBill ? `
          <div style="border: 1.5px dashed #000; padding: 4px; margin: 4px 0; text-align: center;">
            <div style="font-size: 13px; font-weight: 900; color: #000;">
              *** UNPAID BILL (کچا بل) ***
            </div>
            <div style="font-size: 9.5px; font-weight: 800; color: #000; margin-top: 2px;">
              PROVISIONAL ESTIMATE • PAYMENT PENDING
            </div>
          </div>
        ` : ''}

        ${invoice.status === 'voided' ? `
          <div style="text-align: center; color: #000; font-weight: bold; font-size: 11px; margin: 6px 0;">
            *** BILL VOIDED / CANCELLED ***
          </div>
        ` : ''}

        <div class="dashed-line"></div>

        <table>
          <colgroup>
            <col style="width: 43%;" />
            <col style="width: 13%;" />
            <col style="width: 21%;" />
            <col style="width: 23%;" />
          </colgroup>
          <thead>
            <tr>
              <th style="text-align: left;">Item</th>
              <th style="text-align: center;">Qty</th>
              <th style="text-align: right;">Price</th>
              <th style="text-align: right;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <div class="dashed-line"></div>

        <div class="summary-row">
          <span>Sub Total:</span>
          <span style="font-weight: 800;">Rs. ${(invoice.subTotal || 0).toLocaleString()}</span>
        </div>
        ${(invoice.discount || 0) > 0 ? `
          <div class="summary-row">
            <span>Discount:</span>
            <span style="font-weight: 800;">- Rs. ${(invoice.discount || 0).toLocaleString()}</span>
          </div>
        ` : ''}
        ${(invoice.extraCharge || 0) > 0 ? `
          <div class="summary-row">
            <span>Extra${invoice.extraChargeReason ? ` (${invoice.extraChargeReason})` : ''}:</span>
            <span style="font-weight: 800;">+ ${currency} ${(invoice.extraCharge || 0).toLocaleString()}</span>
          </div>
        ` : ''}
        ${sysSettings.taxEnabled && (invoice.tax || 0) > 0 ? `
          <div class="summary-row">
            <span>${taxLabel} (${taxRate}%):</span>
            <span style="font-weight: 800;">${currency} ${(invoice.tax || 0).toLocaleString()}</span>
          </div>
        ` : ''}
        ${(invoice.serviceCharge || 0) > 0 ? `
          <div class="summary-row">
            <span>Service Charge:</span>
            <span style="font-weight: 800;">${currency} ${(invoice.serviceCharge || 0).toLocaleString()}</span>
          </div>
        ` : ''}
        ${(invoice.notes || invoice.packagingNotes) ? `
          <div class="summary-row" style="font-size: 9.5px; color: #000; margin-top: 3px;">
            <span>Notes:</span>
            <span style="font-style: italic;">${[invoice.notes, invoice.packagingNotes].filter(Boolean).join(' | ')}</span>
          </div>
        ` : ''}

        <div class="double-line"></div>

        <div class="grand-row">
          <span>NET PAYABLE:</span>
          <span>Rs. ${(invoice.total || 0).toLocaleString()}</span>
        </div>

        <div class="double-line"></div>

        ${paymentsHtml}

        <div class="dashed-line"></div>

        ${showFeedbackQr ? `
        <div class="qr-section">
          <div class="qr-section-title">SCAN FOR ITEM-WISE FEEDBACK</div>
          ${qrCodeDataUrl ? `<img src="${qrCodeDataUrl}" alt="Dish Review QR Code" class="qr-code-img" />` : ''}
          <div class="qr-hint">Rate each dish & earn Sultan Loyalty Points!</div>
        </div>
        ` : ''}

        <div class="footer">
          <div style="font-weight: 800; margin-bottom: 2px;">${brandFooter}</div>
          <div style="color: #000000; font-size: 9.5px; font-weight: 700; margin-top: 3px;">Powered & Designed by Nizaam Digital Solution</div>
        </div>
      </div>
    </body>
    </html>
  `;

  // Remove existing print iframe to prevent stale cache or frozen dialogs
  const oldFrame = document.getElementById('receipt-print-frame');
  if (oldFrame) {
    try {
      oldFrame.remove();
    } catch {}
  }

  const iframe = document.createElement('iframe');
  iframe.id = 'receipt-print-frame';
  // Position offscreen with realistic thermal width (72mm) so Chromium computes page layout accurately
  iframe.style.position = 'fixed';
  iframe.style.top = '-9999px';
  iframe.style.left = '-9999px';
  iframe.style.width = '72mm';
  iframe.style.height = '1200px';
  iframe.style.border = 'none';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (doc) {
    doc.open();
    doc.write(htmlContent);
    doc.close();

    let isPrinted = false;
    const triggerPrint = () => {
      if (isPrinted) return;
      isPrinted = true;
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (err) {
        console.warn('Iframe print failed, falling back to popup window', err);
        const win = window.open('', '_blank', 'width=420,height=750');
        if (win) {
          win.document.write(htmlContent);
          win.document.close();
          win.focus();
          win.print();
        }
      }
    };

    if (iframe.contentWindow) {
      if (iframe.contentWindow.document && (iframe.contentWindow.document as any).fonts) {
        (iframe.contentWindow.document as any).fonts.ready.then(() => {
          setTimeout(triggerPrint, 120);
        }).catch(() => {
          setTimeout(triggerPrint, 250);
        });
      } else {
        iframe.contentWindow.onload = () => {
          setTimeout(triggerPrint, 180);
        };
      }
    }
    // Safety fallback
    setTimeout(triggerPrint, 450);
  }
}

export default function InvoiceComponent({ invoice, onClose }: InvoiceProps) {
  const { width } = useWindowDimensions();
  const isSmall = width < 420;
  const isUnpaidBill = invoice.isUnpaidBill || invoice.status === 'unpaid';

  const sysSettings = useSettingsStore((state) => state.settings);
  const showFeedbackQr =
    sysSettings.showQrOnReceipt !== false &&
    sysSettings.enableCustomerFeedbackQr !== false;
  const showLogo = sysSettings.showLogoOnReceipt !== false;
  const brandName = (sysSettings.restaurantName || 'SULTAN RESTAURANT').trim();
  const brandTagline = (sysSettings.tagline || 'LUXURY DINING & BANQUET').trim();
  const brandAddress = (sysSettings.address || 'Food Street, Culinary District, Lahore').trim();
  const brandPhone = (sysSettings.phone || '0300-1234567').trim();
  const rawNtn = (sysSettings.ntnOrTaxId || '').trim();
  const brandNtn = rawNtn === '8943120-4' ? '' : rawNtn;
  const brandFooter = (sysSettings.footerMessage || 'Thank you for dining with Sultan!').trim();
  const taxLabel = sysSettings.taxLabel || 'GST Tax';
  const taxRate = sysSettings.taxEnabled ? sysSettings.taxRatePercent : 0;
  const currency = sysSettings.currencySymbol || 'Rs.';

  const onlineFeedbackUrl = useRestaurantStore((state) => state.onlineFeedbackUrl);
  const setOnlineFeedbackUrl = useRestaurantStore((state) => state.setOnlineFeedbackUrl);

  // Automatically resolve a verified Sultan Restaurant public HTTPS URL (purges foreign/LAN/dead URLs)
  const effectiveOnlineUrl = getBaseFeedbackUrl(onlineFeedbackUrl);

  const [qrCodeDataUrl, setQrCodeDataUrl] = React.useState<string>('');
  const [activeFeedbackUrl, setActiveFeedbackUrl] = React.useState<string>('');
  const [domainModalVisible, setDomainModalVisible] = React.useState<boolean>(false);
  const [customDomainInput, setCustomDomainInput] = React.useState<string>(effectiveOnlineUrl);

  React.useEffect(() => {
    if (onlineFeedbackUrl !== effectiveOnlineUrl) {
      setOnlineFeedbackUrl(effectiveOnlineUrl);
      setCustomDomainInput(effectiveOnlineUrl);
    }
  }, [onlineFeedbackUrl, effectiveOnlineUrl, setOnlineFeedbackUrl]);

  React.useEffect(() => {
    if (!showFeedbackQr) {
      setQrCodeDataUrl('');
      setActiveFeedbackUrl('');
      return;
    }
    let isMounted = true;
    const resolvedUrl = getInvoiceFeedbackUrl(invoice.id, effectiveOnlineUrl);
    setActiveFeedbackUrl(resolvedUrl);

    generateInvoiceQrCode(invoice.id, effectiveOnlineUrl).then(url => {
      if (isMounted) setQrCodeDataUrl(url);
    });
    return () => {
      isMounted = false;
    };
  }, [invoice.id, effectiveOnlineUrl, showFeedbackQr]);

  const dateStr = new Date(invoice.timeSettled || invoice.timePlaced).toLocaleDateString();
  const timeStr = new Date(invoice.timeSettled || invoice.timePlaced).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const rawCreator = invoice.orderTakenBy || (invoice.server && !invoice.server.toLowerCase().includes('pos') ? invoice.server : '');
  const rawCashier = invoice.cashier || invoice.server || 'Cashier';
  const cashierName = formatStaffWithExactRole(rawCashier, 'Cashier');
  const orderCreator = rawCreator ? formatStaffWithExactRole(rawCreator, 'Order Taker') : cashierName;
  const isSameStaff = orderCreator === cashierName;

  const handleSaveDomain = () => {
    if (customDomainInput.trim()) {
      const clean = customDomainInput.trim().replace(/\/+$/, '');
      const verified = isValidFeedbackUrl(clean) ? clean : PUBLIC_ONLINE_URL;
      setOnlineFeedbackUrl(verified);
      setCustomDomainInput(verified);
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        try {
          window.localStorage.setItem('sultan_feedback_online_url', verified);
        } catch {
          // Ignore
        }
      }
    }
    setDomainModalVisible(false);
  };

  return (
    <View style={styles.outerWrapper}>
      {/* RESTAURANT RECEIPT SLIP */}
      <View nativeID="standard-invoice-receipt" style={styles.container}>
        {/* Header with Big Logo */}
        <View style={styles.header}>
          {showLogo && (
            <Image
              source={{ uri: SULTAN_LOGO_BASE64 }}
              style={{ width: 145, height: 135, alignSelf: 'center', marginBottom: 4 }}
              resizeMode="contain"
            />
          )}
          <Text style={styles.brandUrduSlogan}>جہاں ہر مہمان ہے سلطان</Text>
          {Boolean(brandTagline) && <Text style={styles.brandSub}>{brandTagline}</Text>}
          {Boolean(brandAddress) && <Text style={styles.contactText}>{brandAddress}</Text>}
          {(Boolean(brandPhone) || Boolean(brandNtn)) && (
            <Text style={styles.contactText}>
              {brandPhone ? `Tel: ${brandPhone}` : ''}{brandPhone && brandNtn ? ' • ' : ''}{brandNtn ? `NTN: ${brandNtn}` : ''}
            </Text>
          )}
        </View>

        <Text style={styles.dashedLine}>- - - - - - - - - - - - - - - - - - - - - -</Text>

        {/* Meta Info */}
        <View style={styles.metaRow}>
          <Text style={styles.metaText}>INV: #{invoice.dailyInvoiceNumber || invoice.id}</Text>
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
            <Text style={styles.metaText}>Billed By:</Text>
            <Text style={[styles.metaText, styles.boldText]}>{cashierName}</Text>
          </View>
        ) : (
          <>
            <View style={styles.metaRow}>
              <Text style={styles.metaText}>Order Taken By:</Text>
              <Text style={[styles.metaText, styles.boldText]}>{orderCreator}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaText}>Billed By:</Text>
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

        {isUnpaidBill && (
          <View style={{ marginVertical: 8, padding: 8, backgroundColor: 'rgba(239, 68, 68, 0.08)', borderWidth: 1.5, borderColor: '#EF4444', borderStyle: 'dashed', borderRadius: 8, alignItems: 'center' }}>
            <Text style={{ color: '#EF4444', fontWeight: '900', fontSize: 13, letterSpacing: 0.8 }}>
              *** UNPAID BILL (غیر ادا شدہ بل) ***
            </Text>
            <Text style={{ color: '#1F2937', fontWeight: '700', fontSize: 11, marginTop: 2 }}>
              PROVISIONAL CHECK / ESTIMATE
            </Text>
            <Text style={{ color: '#6B7280', fontSize: 10, marginTop: 1 }}>
              Payment Pending at Cashier • براۓ مہربانی کیش کاؤنٹر پر ادائیگی فرمائیں
            </Text>
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
          <Text style={[styles.colText, { width: '43%', fontWeight: 'bold' }]}>Item</Text>
          <Text style={[styles.colText, { width: '13%', textAlign: 'center', fontWeight: 'bold' }]}>Qty</Text>
          <Text style={[styles.colText, { width: '21%', textAlign: 'right', fontWeight: 'bold' }]}>Price</Text>
          <Text style={[styles.colText, { width: '23%', textAlign: 'right', fontWeight: 'bold' }]}>Total</Text>
        </View>

        {invoice.items.map((item, idx) => (
          <View key={idx} style={styles.itemRow}>
            <Text style={[styles.colText, { width: '43%' }]}>{item.name}</Text>
            <Text style={[styles.colText, { width: '13%', textAlign: 'center', fontWeight: 'bold' }]}>{item.qty}x</Text>
            <Text style={[styles.colText, { width: '21%', textAlign: 'right' }]}>
              {(item.price || 0).toLocaleString()}
            </Text>
            <Text style={[styles.colText, { width: '23%', textAlign: 'right', fontWeight: 'bold' }]}>
              {((item.price || 0) * item.qty).toLocaleString()}
            </Text>
          </View>
        ))}

        <Text style={styles.dashedLine}>- - - - - - - - - - - - - - - - - - - - - -</Text>

        {/* Totals */}
        <View style={styles.summaryRow}>
          <Text style={styles.summaryKey}>Sub Total:</Text>
          <Text style={styles.summaryVal}>{currency} {(invoice.subTotal || 0).toLocaleString()}</Text>
        </View>
        {(invoice.discount || 0) > 0 && (
          <View style={styles.summaryRow}>
            <Text style={styles.summaryKey}>Discount:</Text>
            <Text style={styles.summaryVal}>- {currency} {(invoice.discount || 0).toLocaleString()}</Text>
          </View>
        )}
        {(invoice.extraCharge || 0) > 0 && (
          <View style={styles.summaryRow}>
            <Text style={styles.summaryKey}>
              Extra{invoice.extraChargeReason ? ` (${invoice.extraChargeReason})` : ''}:
            </Text>
            <Text style={styles.summaryVal}>+ {currency} {(invoice.extraCharge || 0).toLocaleString()}</Text>
          </View>
        )}
        {sysSettings.taxEnabled && (invoice.tax || 0) > 0 && (
          <View style={styles.summaryRow}>
            <Text style={styles.summaryKey}>{taxLabel} ({taxRate}%):</Text>
            <Text style={styles.summaryVal}>{currency} {(invoice.tax || 0).toLocaleString()}</Text>
          </View>
        )}
        {(invoice.serviceCharge || 0) > 0 && (
          <View style={styles.summaryRow}>
            <Text style={styles.summaryKey}>Service Charge:</Text>
            <Text style={styles.summaryVal}>{currency} {(invoice.serviceCharge || 0).toLocaleString()}</Text>
          </View>
        )}
        {(invoice.notes || invoice.packagingNotes) && (
          <View style={[styles.summaryRow, { marginTop: 4 }]}>
            <Text style={[styles.summaryKey, { fontSize: 11, color: '#666' }]}>Instructions:</Text>
            <Text style={[styles.summaryVal, { fontSize: 11, color: '#666', fontStyle: 'italic' }]}>
              {[invoice.notes, invoice.packagingNotes].filter(Boolean).join(' | ')}
            </Text>
          </View>
        )}

        <Text style={styles.dashedLine}>================================</Text>

        <View style={styles.grandRow}>
          <Text style={styles.grandKey}>NET PAYABLE:</Text>
          <Text style={styles.grandVal}>{currency} {(invoice.total || 0).toLocaleString()}</Text>
        </View>

        <Text style={styles.dashedLine}>================================</Text>

        {isUnpaidBill ? (
          <View style={{ marginVertical: 6, paddingVertical: 8, paddingHorizontal: 10, backgroundColor: 'rgba(239, 68, 68, 0.08)', borderWidth: 1, borderColor: '#EF4444', borderRadius: 8, alignItems: 'center' }}>
            <Text style={{ color: '#EF4444', fontWeight: '900', fontSize: 13, letterSpacing: 0.5 }}>
              TOTAL UNPAID DUE: {currency} {(invoice.total || 0).toLocaleString()}
            </Text>
            <Text style={{ color: '#4B5563', fontSize: 10.5, fontWeight: '700', marginTop: 3 }}>
              براۓ مہربانی کیش کاؤنٹر پر ادائیگی فرمائیں
            </Text>
          </View>
        ) : invoice.payments && invoice.payments.length > 0 ? (
          invoice.payments.map((p, idx) => (
            <React.Fragment key={idx}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryKey}>Paid via {p.type.toUpperCase()}:</Text>
                <Text style={styles.summaryVal}>{currency} {(p.amount || 0).toLocaleString()}</Text>
              </View>
              {p.tendered && p.tendered > p.amount ? (
                <>
                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryKey, { color: '#64748B' }]}>Cash Tendered (وصول):</Text>
                    <Text style={[styles.summaryVal, { color: '#475569' }]}>{currency} {(p.tendered || 0).toLocaleString()}</Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryKey, { color: '#059669', fontWeight: 'bold' }]}>Change Returned (واپس):</Text>
                    <Text style={[styles.summaryVal, { color: '#059669', fontWeight: 'bold' }]}>{currency} {(p.change || (p.tendered - p.amount) || 0).toLocaleString()}</Text>
                  </View>
                </>
              ) : null}
            </React.Fragment>
          ))
        ) : (invoice.tenderedAmount && invoice.changeReturned) ? (
          <>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryKey, { color: '#64748B' }]}>Cash Tendered (وصول):</Text>
              <Text style={[styles.summaryVal, { color: '#475569' }]}>{currency} {(invoice.tenderedAmount || 0).toLocaleString()}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryKey, { color: '#059669', fontWeight: 'bold' }]}>Change Returned (واپس):</Text>
              <Text style={[styles.summaryVal, { color: '#059669', fontWeight: 'bold' }]}>{currency} {(invoice.changeReturned || 0).toLocaleString()}</Text>
            </View>
          </>
        ) : null}

        {showFeedbackQr && (
          <>
            <Text style={styles.dashedLine}>- - - - - - - - - - - - - - - - - - - - - -</Text>

            {/* QR Code Section on Receipt */}
            <View style={styles.qrContainer}>
              <View style={styles.qrHeader}>
                <Ionicons name="qr-code" size={16} color="#D5A943" style={{ marginRight: 6 }} />
                <Text style={styles.qrHeaderText}>SCAN FOR ITEM-WISE FEEDBACK</Text>
              </View>
              {qrCodeDataUrl ? (
                <Image
                  source={{ uri: qrCodeDataUrl }}
                  style={styles.qrImage}
                  resizeMode="contain"
                />
              ) : (
                <View style={styles.qrPlaceholder}>
                  <Ionicons name="qr-code-outline" size={48} color="#D5A943" />
                </View>
              )}

              <Text style={styles.qrSubText}>
                Scan with your mobile camera to rate each dish & earn +50 Loyalty Points!
              </Text>

              {/* Scannable URL Pill */}
              <View style={styles.qrUrlPill}>
                <Ionicons name="globe-outline" size={12} color="#15803D" style={{ marginRight: 4 }} />
                <Text style={styles.qrUrlPillText} numberOfLines={1}>
                  {activeFeedbackUrl}
                </Text>
              </View>

              {/* Quick Domain Settings Button */}
              <TouchableOpacity
                style={styles.qrConfigBtn}
                onPress={() => {
                  setCustomDomainInput(effectiveOnlineUrl);
                  setDomainModalVisible(true);
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="settings-outline" size={12} color="#475569" style={{ marginRight: 4 }} />
                <Text style={styles.qrConfigBtnText}>Configure Online QR Link</Text>
              </TouchableOpacity>

              {invoice.feedbackSubmitted || invoice.feedback ? (
                <View style={styles.feedbackBadge}>
                  <Ionicons name="checkmark-circle" size={14} color="#2E7D32" style={{ marginRight: 4 }} />
                  <Text style={styles.feedbackBadgeText}>
                    Feedback Submitted ({invoice.feedback?.overallRating || 5}/5)
                  </Text>
                </View>
              ) : null}

              {/* Direct Interactive Feedback Link */}
              <TouchableOpacity
                style={styles.rateDishesBtn}
                onPress={() => router.push(`/feedback?invoiceId=${encodeURIComponent(invoice.id)}` as any)}
                activeOpacity={0.8}
              >
                <Ionicons name="star" size={14} color="#4a121a" style={{ marginRight: 6 }} />
                <Text style={styles.rateDishesBtnText}>Rate Dishes & Leave Feedback</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        <View style={styles.footer}>
          <Text style={styles.footerText}>{brandFooter}</Text>
          <Text style={styles.footerSub}>We look forward to serving you again.</Text>
          <Text style={[styles.footerSub, { fontWeight: '700', color: '#111827', marginTop: 2 }]}>Powered & Designed by Nizaam Digital Solution</Text>
        </View>
      </View>

      {/* Action Buttons Row */}
      <View style={styles.actionButtonsContainer}>
        <TouchableOpacity
          style={styles.printActionBtn}
          onPress={() => {
            printInvoiceReceipt(invoice, qrCodeDataUrl);
            if (onClose) onClose();
          }}
          activeOpacity={0.8}
        >
          <Ionicons name="print" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
          <Text style={styles.printActionText}>
            {showFeedbackQr ? 'Print Receipt (with QR)' : 'Print Receipt'}
          </Text>
        </TouchableOpacity>

        {showFeedbackQr && (
          <TouchableOpacity
            style={styles.feedbackDirectBtn}
            onPress={() => router.push(`/feedback?invoiceId=${encodeURIComponent(invoice.id)}` as any)}
            activeOpacity={0.8}
          >
            <Ionicons name="chatbubble-ellipses" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
            <Text style={styles.printActionText}>Feedback Form</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Domain / Link Configuration Modal */}
      <Modal visible={domainModalVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.domainModalCard}>
            <View style={styles.domainModalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="globe" size={20} color="#D5A943" />
                <Text style={styles.domainModalTitle}>Online QR Code & Link Settings</Text>
              </View>
              <TouchableOpacity onPress={() => setDomainModalVisible(false)}>
                <Ionicons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            <Text style={styles.domainModalDesc}>
              Select or type the web address embedded into invoice QR codes so customers can scan it from their mobile cameras:
            </Text>

            <Text style={styles.domainFieldLabel}>Quick One-Tap Presets:</Text>
            <View style={styles.presetOptionsRow}>
              <TouchableOpacity
                style={[
                  styles.presetPill,
                  customDomainInput.includes('sultanrestaurant092.netlify.app') && styles.presetPillActive,
                ]}
                onPress={() => setCustomDomainInput(PUBLIC_ONLINE_URL)}
                activeOpacity={0.7}
              >
                <Ionicons name="globe" size={16} color="#0284C7" style={{ marginRight: 8 }} />
                <View>
                  <Text style={styles.presetPillTitle}>Sultan Live Cloud (4G / 5G & Wi-Fi)</Text>
                  <Text style={styles.presetPillSub}>{PUBLIC_ONLINE_URL}</Text>
                </View>
              </TouchableOpacity>
            </View>

            <Text style={styles.domainFieldLabel}>Custom Sultan Domain (HTTPS):</Text>
            <TextInput
              style={styles.domainTextInput}
              value={customDomainInput}
              onChangeText={setCustomDomainInput}
              placeholder="e.g. https://sultanrestaurant.com.pk"
              placeholderTextColor="#94A3B8"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <View style={styles.domainModalFooter}>
              <TouchableOpacity
                style={styles.domainCancelBtn}
                onPress={() => setDomainModalVisible(false)}
              >
                <Text style={styles.domainCancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.domainSaveBtn}
                onPress={handleSaveDomain}
                activeOpacity={0.8}
              >
                <Ionicons name="checkmark-circle" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.domainSaveBtnText}>Save & Update QR</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    maxWidth: 420,
    minWidth: 300,
    padding: 20,
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
    fontSize: 20,
    fontWeight: '900',
    color: '#1C1C1E',
    letterSpacing: 1,
    textAlign: 'center',
  },
  brandUrduSlogan: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1C1C1E',
    textAlign: 'center',
    marginVertical: 2,
    fontFamily: Platform.select({
      web: "'Noto Nastaliq Urdu', 'Urdu Typesetting', 'Jameel Noori Nastaleeq', 'Amiri', 'Segoe UI', Tahoma, sans-serif",
      default: undefined,
    }),
  },
  brandSub: {
    fontSize: 10,
    fontWeight: '700',
    color: '#8E8E93',
    letterSpacing: 1,
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
    marginVertical: 2.5,
  },
  metaText: {
    fontSize: 11.5,
    color: '#1C1C1E',
    fontWeight: '600',
  },
  boldText: {
    fontWeight: '800',
    color: '#000000',
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
    marginVertical: 2.5,
  },
  colText: {
    fontSize: 11.5,
    color: '#1C1C1E',
    fontWeight: '600',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 2.5,
  },
  summaryKey: {
    fontSize: 11.5,
    color: '#3A3A3C',
    fontWeight: '600',
  },
  summaryVal: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  grandRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 4,
  },
  grandKey: {
    fontSize: 14.5,
    fontWeight: '900',
    color: '#000000',
  },
  grandVal: {
    fontSize: 16,
    fontWeight: '900',
    color: '#000000',
  },
  qrContainer: {
    alignItems: 'center',
    marginVertical: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#FAFAF9',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#EFEAE2',
  },
  qrHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  qrHeaderText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#140306',
    letterSpacing: 1,
  },
  qrImage: {
    width: 120,
    height: 120,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
  qrPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 4,
    backgroundColor: '#F3E8D0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrSubText: {
    fontSize: 10,
    color: '#555555',
    textAlign: 'center',
    marginTop: 6,
    fontWeight: '500',
  },
  feedbackBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    marginTop: 6,
  },
  feedbackBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2E7D32',
  },
  rateDishesBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5E6BE',
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 6,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#D5A943',
  },
  rateDishesBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4a121a',
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
  actionButtonsContainer: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  printActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4a121a',
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  feedbackDirectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2E7D32',
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  printActionText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  qrUrlPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    marginTop: 6,
    maxWidth: '100%',
  },
  qrUrlPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#15803D',
  },
  qrConfigBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  qrConfigBtnText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#475569',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  domainModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 22,
    width: '100%',
    maxWidth: 520,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 6,
  },
  domainModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  domainModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  domainModalDesc: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
    marginBottom: 14,
  },
  domainFieldLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
  },
  presetOptionsRow: {
    flexDirection: 'column',
    gap: 8,
    marginBottom: 14,
  },
  presetPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 10,
  },
  presetPillActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#0284C7',
  },
  presetPillTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  presetPillSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  domainTextInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: '#0F172A',
    marginBottom: 18,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  domainModalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  domainCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  domainCancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  domainSaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#140306',
    borderWidth: 1,
    borderColor: '#D5A943',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
  domainSaveBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
