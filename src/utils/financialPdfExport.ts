import { Platform } from 'react-native';
import { getActiveServerHttpUrl } from '../services/syncService';
import { money, formatDay } from './format';

export interface PdfExportOptions {
  presetName?: string;
  includeCharts: boolean;
  includePnL: boolean;
  includeChannelsAndCash: boolean;
  includeTaxAndDiscounts: boolean;
  includeTopDishes: boolean;
  includeKitchenAudit: boolean;
  includeOpsAudit?: boolean;
  includeInvoiceLedger: boolean;
  includeSignatures: boolean;
}

export const DEFAULT_PDF_OPTIONS: PdfExportOptions = {
  presetName: 'Full Executive Financial Audit Pack',
  includeCharts: true,
  includePnL: true,
  includeChannelsAndCash: true,
  includeTaxAndDiscounts: true,
  includeTopDishes: true,
  includeKitchenAudit: true,
  includeOpsAudit: true,
  includeInvoiceLedger: true,
  includeSignatures: true,
};

export interface FinancialReportPdfPayload {
  restaurantName: string;
  tagline?: string;
  address?: string;
  phone?: string;
  ntnOrTaxId?: string;
  preparedBy: string;
  preparedRole: string;
  periodKey: string;
  periodLabel: string;
  periodStart: number;
  periodEnd: number;
  summary: {
    totalInvoicesCount: number;
    voidedInvoicesCount: number;
    totalOrders: number;
    grossFoodSales: number;
    totalDiscountGiven: number;
    totalTaxCollected: number;
    netRestaurantRevenue: number;
    playlandRevenue: number;
    playlandTicketsCount: number;
    totalGrossRevenue: number;
    estimatedCOGS: number;
    isEstimatedCOGS: boolean;
    grossOperatingProfit: number;
    grossMarginPercent: number;
    totalOpex: number;
    cashOpex: number;
    onlineOpex: number;
    expenseCatMap: Record<string, number>;
    netBreakageLoss: number;
    totalBreakageLoss: number;
    totalDamageRecovered: number;
    assetMaintenanceCosts: number;
    netOperatingProfit: number;
    netProfitMargin: number;
    cashTotal: number;
    cardTotal: number;
    onlineTotal: number;
    restaurantCash: number;
    playlandCash: number;
    cashSupplierPayments: number;
    dineInSales: number;
    dineInOrders: number;
    takeawaySales: number;
    takeawayOrders: number;
    deliverySales: number;
    deliveryOrders: number;
    totalCashInflow: number;
    totalCashOutflow: number;
    netCashFloat: number;
    averageTicket: number;
    topDishes: { name: string; qty: number; revenue: number }[];
    rawReconciliationList: {
      itemName: string;
      unit: string;
      category: string;
      issued: number;
      cooked: number;
      returned: number;
      variance: number;
      wastageCost: number;
      status: string;
    }[];
    totalStoreIssuedValue: number;
    totalCookedRawValue: number;
    totalReturnedToStoreValue: number;
    totalKitchenWastageCost: number;
    averageYieldRate: number;
    totalPortionsCooked: number;
    validInvoices: {
      id: string;
      timeSettled?: number;
      timePlaced: number;
      orderType?: string;
      tableName?: string;
      server?: string;
      subTotal?: number;
      discount?: number;
      tax?: number;
      total: number;
      payments?: { type: string; amount: number }[];
    }[];
    tableMoveLogs?: {
      id: string;
      fromTableName: string;
      fromFloor?: string;
      toTableName: string;
      toFloor?: string;
      note: string;
      movedBy: string;
      movedByRole?: string;
      activeTicketsCount: number;
      itemsCount: number;
      billTotal: number;
      timestamp: number;
    }[];
    cancelledOrderLogs?: {
      id: string;
      ticketId: string;
      tableName: string;
      floor?: string;
      orderType?: string;
      server: string;
      cancelledBy: string;
      cancelledByRole?: string;
      reason: string;
      source: string;
      items: { name: string; qty: number; price: number; lineTotal: number; notes?: string }[];
      totalQty: number;
      totalAmount: number;
      timePlaced: number;
      cancelledAt: number;
    }[];
  };
}

function esc(str: any): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pctOf(part: number, whole: number): string {
  if (!whole || !Number.isFinite(whole)) return '0.0%';
  return `${((part / whole) * 100).toFixed(1)}%`;
}

function buildDonutSvgMarkup(
  slices: { label: string; value: number; color: string }[],
  total: number
): string {
  const size = 148;
  const thickness = 22;
  const r = (size - thickness) / 2;
  const circ = 2 * Math.PI * r;
  const cx = size / 2;
  let acc = 0;

  const circles =
    total <= 0
      ? `<circle cx="${cx}" cy="${cx}" r="${r}" stroke="#E2E8F0" stroke-width="${thickness}" fill="none" />`
      : slices
          .filter((s) => s.value > 0)
          .map((s) => {
            const p = s.value / total;
            const len = Math.max(0, p * circ - 2);
            const offset = -(acc * circ);
            acc += p;
            return `<circle cx="${cx}" cy="${cx}" r="${r}" stroke="${s.color}" stroke-width="${thickness}" stroke-dasharray="${len.toFixed(2)} ${circ.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}" fill="none" />`;
          })
          .join('');

  const legend = slices
    .map((s) => {
      const share = total > 0 ? ((s.value / total) * 100).toFixed(1) : '0.0';
      return `
        <div class="svg-leg-row">
          <span class="svg-dot" style="background:${s.color}"></span>
          <span class="svg-leg-name">${esc(s.label)}</span>
          <span class="svg-leg-val">${esc(money(s.value))}</span>
          <span class="svg-leg-pct">${share}%</span>
        </div>`;
    })
    .join('');

  return `
    <div class="chart-box">
      <div class="chart-title">Payment Tender Split</div>
      <div class="chart-sub">Cash vs Card / POS vs Online Transfer</div>
      <div class="donut-flex">
        <div style="position:relative;width:${size}px;height:${size}px;flex-shrink:0;">
          <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
            <circle cx="${cx}" cy="${cx}" r="${r}" stroke="#F1F5F9" stroke-width="${thickness}" fill="none" />
            <g transform="rotate(-90 ${cx} ${cx})">${circles}</g>
          </svg>
          <div class="donut-center">
            <div class="donut-c-sub">SETTLED</div>
            <div class="donut-c-val">${esc(money(total))}</div>
          </div>
        </div>
        <div class="svg-leg-col">${legend}</div>
      </div>
    </div>`;
}

function buildWaterfallSvgMarkup(s: FinancialReportPdfPayload['summary']): string {
  const gross = Math.max(s.totalGrossRevenue, 1);
  const rows = [
    { label: 'Gross Revenue', val: s.totalGrossRevenue, color: '#059669', prefix: '' },
    { label: 'COGS (Direct)', val: s.estimatedCOGS, color: '#D97706', prefix: '- ' },
    { label: 'Operating OPEX', val: s.totalOpex, color: '#E11D48', prefix: '- ' },
    { label: 'Breakage / Loss', val: s.netBreakageLoss, color: '#9333EA', prefix: '- ' },
    {
      label: 'Net Profit (EBITDA)',
      val: s.netOperatingProfit,
      color: s.netOperatingProfit >= 0 ? '#059669' : '#BE123C',
      prefix: '',
      bold: true,
    },
  ];

  const itemsHtml = rows
    .map((r) => {
      const w = Math.min(100, Math.max(r.val !== 0 ? 3 : 0, (Math.abs(r.val) / gross) * 100));
      const share = ((Math.abs(r.val) / gross) * 100).toFixed(1);
      return `
        <div class="wf-row ${r.bold ? 'wf-row-net' : ''}">
          <div class="wf-head">
            <span class="wf-lbl"><span class="svg-dot" style="background:${r.color}"></span>${esc(r.label)}</span>
            <span class="wf-val" style="color:${r.color}">${r.prefix}${esc(money(r.val))} <small>(${share}%)</small></span>
          </div>
          <div class="wf-track"><div class="wf-fill" style="width:${w.toFixed(1)}%;background:${r.color}"></div></div>
        </div>`;
    })
    .join('');

  return `
    <div class="chart-box">
      <div class="chart-title">P&amp;L Capital Flow Waterfall</div>
      <div class="chart-sub">Topline revenue conversion to bottom-line EBITDA</div>
      <div class="wf-wrap">${itemsHtml}</div>
    </div>`;
}

function buildChannelsBarSvgMarkup(s: FinancialReportPdfPayload['summary']): string {
  const channels = [
    { label: 'Dine-In', val: s.dineInSales, orders: s.dineInOrders, color: '#B48214' },
    { label: 'Takeaway', val: s.takeawaySales, orders: s.takeawayOrders, color: '#2563EB' },
    { label: 'Delivery', val: s.deliverySales, orders: s.deliveryOrders, color: '#059669' },
    { label: 'Playland', val: s.playlandRevenue, orders: s.playlandTicketsCount, color: '#7C3AED' },
  ];
  const max = Math.max(...channels.map((c) => c.val), 1);
  const total = channels.reduce((sum, c) => sum + c.val, 0);

  const rows = channels
    .map((c) => {
      const w = Math.min(100, Math.max(c.val > 0 ? 3 : 0, (c.val / max) * 100));
      const share = total > 0 ? ((c.val / total) * 100).toFixed(1) : '0.0';
      return `
        <div class="wf-row">
          <div class="wf-head">
            <span class="wf-lbl"><span class="svg-dot" style="background:${c.color}"></span>${esc(c.label)} <small>(${c.orders} orders)</small></span>
            <span class="wf-val">${esc(money(c.val))} <small>(${share}%)</small></span>
          </div>
          <div class="wf-track"><div class="wf-fill" style="width:${w.toFixed(1)}%;background:${c.color}"></div></div>
        </div>`;
    })
    .join('');

  return `
    <div class="chart-box">
      <div class="chart-title">Fulfillment Channels Revenue Share</div>
      <div class="chart-sub">Revenue distribution across all service touchpoints</div>
      <div class="wf-wrap">${rows}</div>
    </div>`;
}

export function buildExecutiveFinancialReportHtml(
  payload: FinancialReportPdfPayload,
  options: PdfExportOptions = DEFAULT_PDF_OPTIONS
): string {
  const s = payload.summary;
  const now = new Date();
  const auditRef = `AUD-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getTime()).slice(-4)}`;
  const generatedStr = now.toLocaleString('en-PK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const periodRange = `${formatDay(payload.periodStart)} — ${formatDay(payload.periodEnd)}`;

  const opexRowsHtml =
    Object.keys(s.expenseCatMap).length === 0
      ? `<tr><td class="indent muted">No operating expenses recorded in period</td><td class="num">Rs. 0</td><td class="num muted">0.0%</td></tr>`
      : Object.entries(s.expenseCatMap)
          .sort((a, b) => b[1] - a[1])
          .map(
            ([cat, amt]) =>
              `<tr><td class="indent">${esc(cat)}</td><td class="num">${esc(money(amt))}</td><td class="num muted">${pctOf(amt, s.totalGrossRevenue)}</td></tr>`
          )
          .join('');

  const chartsSection = options.includeCharts
    ? `
      <div class="section-block avoid-break">
        <div class="sec-head"><span class="sec-num">01</span>EXECUTIVE VISUAL ANALYTICS</div>
        <div class="charts-two-col">
          ${buildWaterfallSvgMarkup(s)}
          ${buildDonutSvgMarkup(
            [
              { label: 'Cash Payments', value: s.cashTotal, color: '#059669' },
              { label: 'Card / POS', value: s.cardTotal, color: '#2563EB' },
              { label: 'Online / IBFT', value: s.onlineTotal, color: '#7C3AED' },
            ],
            s.totalGrossRevenue
          )}
        </div>
        <div style="margin-top:10px;">${buildChannelsBarSvgMarkup(s)}</div>
      </div>`
    : '';

  const pnlSection = options.includePnL
    ? `
      <div class="section-block avoid-break">
        <div class="sec-head"><span class="sec-num">02</span>AUDITED PROFIT &amp; LOSS STATEMENT (INCOME STATEMENT)</div>
        <table class="fin-table">
          <thead>
            <tr>
              <th style="width:58%;">Account Head / Line Item</th>
              <th class="num" style="width:24%;">Amount (PKR)</th>
              <th class="num" style="width:18%;">% of Revenue</th>
            </tr>
          </thead>
          <tbody>
            <tr class="cat-row"><td colspan="3">A. OPERATING REVENUES (TOPLINE)</td></tr>
            <tr><td class="indent">Dine-In Restaurant Sales (${s.dineInOrders} bills)</td><td class="num">${esc(money(s.dineInSales))}</td><td class="num muted">${pctOf(s.dineInSales, s.totalGrossRevenue)}</td></tr>
            <tr><td class="indent">Takeaway Counter Orders (${s.takeawayOrders} bills)</td><td class="num">${esc(money(s.takeawaySales))}</td><td class="num muted">${pctOf(s.takeawaySales, s.totalGrossRevenue)}</td></tr>
            <tr><td class="indent">Delivery Orders (${s.deliveryOrders} bills)</td><td class="num">${esc(money(s.deliverySales))}</td><td class="num muted">${pctOf(s.deliverySales, s.totalGrossRevenue)}</td></tr>
            <tr><td class="indent">Basement Playland &amp; Rides (${s.playlandTicketsCount} tickets)</td><td class="num">${esc(money(s.playlandRevenue))}</td><td class="num muted">${pctOf(s.playlandRevenue, s.totalGrossRevenue)}</td></tr>
            <tr class="sub-row"><td>TOTAL GROSS REVENUE (A)</td><td class="num gold">${esc(money(s.totalGrossRevenue))}</td><td class="num">100.0%</td></tr>

            <tr class="cat-row"><td colspan="3">B. COST OF GOODS SOLD (DIRECT KITCHEN / PROCUREMENT)</td></tr>
            <tr><td class="indent">Raw Kitchen Provisions &amp; Supplier POs ${s.isEstimatedCOGS ? '(Est. 35% Food Cost)' : '(Actual POs)'}</td><td class="num amber">(${esc(money(s.estimatedCOGS))})</td><td class="num muted">${pctOf(s.estimatedCOGS, s.totalGrossRevenue)}</td></tr>
            <tr class="sub-row blue-bg"><td>GROSS OPERATING PROFIT (A − B)</td><td class="num blue">${esc(money(s.grossOperatingProfit))}</td><td class="num blue">${s.grossMarginPercent.toFixed(1)}%</td></tr>

            <tr class="cat-row"><td colspan="3">C. OPERATING EXPENSES (OPEX)</td></tr>
            ${opexRowsHtml}
            <tr class="sub-row"><td>TOTAL OPERATING EXPENSES (C)</td><td class="num rose">(${esc(money(s.totalOpex))})</td><td class="num rose">${pctOf(s.totalOpex, s.totalGrossRevenue)}</td></tr>

            <tr class="cat-row"><td colspan="3">D. BREAKAGE, SHRINKAGE &amp; WRITE-OFFS</td></tr>
            <tr><td class="indent">Net Crockery, Glassware &amp; Equipment Write-Off (Recovered: ${esc(money(s.totalDamageRecovered))})</td><td class="num rose">(${esc(money(s.netBreakageLoss))})</td><td class="num muted">${pctOf(s.netBreakageLoss, s.totalGrossRevenue)}</td></tr>
            ${s.assetMaintenanceCosts > 0 ? `<tr><td class="indent">Asset &amp; Equipment Maintenance Cost (Memo)</td><td class="num muted">${esc(money(s.assetMaintenanceCosts))}</td><td class="num muted">${pctOf(s.assetMaintenanceCosts, s.totalGrossRevenue)}</td></tr>` : ''}

            <tr class="net-row ${s.netOperatingProfit >= 0 ? 'net-pos' : 'net-neg'}">
              <td>NET OPERATING PROFIT / (LOSS) — EBITDA</td>
              <td class="num">${esc(money(s.netOperatingProfit))}</td>
              <td class="num">${s.netProfitMargin.toFixed(1)}%</td>
            </tr>
          </tbody>
        </table>
      </div>`
    : '';

  const channelsAndCashSection = options.includeChannelsAndCash
    ? `
      <div class="section-block avoid-break">
        <div class="sec-head"><span class="sec-num">03</span>CASH REGISTER RECONCILIATION &amp; CHANNEL PERFORMANCE</div>
        <div class="two-col-tables">
          <table class="fin-table">
            <thead>
              <tr><th>Cash Register Drawer Audit</th><th class="num">Amount (PKR)</th></tr>
            </thead>
            <tbody>
              <tr><td>Restaurant Cash Collections</td><td class="num emerald">+ ${esc(money(s.restaurantCash))}</td></tr>
              <tr><td>Playland Cash Collections</td><td class="num emerald">+ ${esc(money(s.playlandCash))}</td></tr>
              <tr class="sub-row"><td>Total Cash Inflow</td><td class="num emerald">${esc(money(s.totalCashInflow))}</td></tr>
              <tr><td>Daily Cash OPEX Paid</td><td class="num rose">- ${esc(money(s.cashOpex))}</td></tr>
              <tr><td>Supplier Cash Payments</td><td class="num rose">- ${esc(money(s.cashSupplierPayments))}</td></tr>
              <tr class="sub-row"><td>Total Cash Outflow</td><td class="num rose">(${esc(money(s.totalCashOutflow))})</td></tr>
              <tr class="net-row net-gold"><td>EXPECTED CASH IN DRAWER</td><td class="num">${esc(money(s.netCashFloat))}</td></tr>
            </tbody>
          </table>

          <table class="fin-table">
            <thead>
              <tr><th>Channel</th><th class="num">Orders</th><th class="num">Avg Bill</th><th class="num">Sales</th></tr>
            </thead>
            <tbody>
              <tr><td>Dine-In</td><td class="num">${s.dineInOrders}</td><td class="num">${esc(money(s.dineInOrders > 0 ? s.dineInSales / s.dineInOrders : 0))}</td><td class="num bold">${esc(money(s.dineInSales))}</td></tr>
              <tr><td>Takeaway</td><td class="num">${s.takeawayOrders}</td><td class="num">${esc(money(s.takeawayOrders > 0 ? s.takeawaySales / s.takeawayOrders : 0))}</td><td class="num bold">${esc(money(s.takeawaySales))}</td></tr>
              <tr><td>Delivery</td><td class="num">${s.deliveryOrders}</td><td class="num">${esc(money(s.deliveryOrders > 0 ? s.deliverySales / s.deliveryOrders : 0))}</td><td class="num bold">${esc(money(s.deliverySales))}</td></tr>
              <tr><td>Playland</td><td class="num">${s.playlandTicketsCount}</td><td class="num">${esc(money(s.playlandTicketsCount > 0 ? s.playlandRevenue / s.playlandTicketsCount : 0))}</td><td class="num bold">${esc(money(s.playlandRevenue))}</td></tr>
              <tr class="sub-row"><td>COMBINED</td><td class="num">${s.totalOrders}</td><td class="num">${esc(money(s.averageTicket))}</td><td class="num gold">${esc(money(s.totalGrossRevenue))}</td></tr>
            </tbody>
          </table>
        </div>
      </div>`
    : '';

  const taxSection = options.includeTaxAndDiscounts
    ? `
      <div class="section-block avoid-break">
        <div class="sec-head"><span class="sec-num">04</span>GOVERNMENT SALES TAX (GST / PRA) &amp; DISCOUNT COMPLIANCE</div>
        <div class="mini-kpi-grid">
          <div class="mini-kpi"><span>Gross Pre-Tax Sales</span><strong>${esc(money(s.grossFoodSales))}</strong></div>
          <div class="mini-kpi"><span>Promotional Discounts</span><strong class="rose">${esc(money(s.totalDiscountGiven))} (${pctOf(s.totalDiscountGiven, s.grossFoodSales)})</strong></div>
          <div class="mini-kpi"><span>GST Tax Collected</span><strong class="emerald">${esc(money(s.totalTaxCollected))}</strong></div>
          <div class="mini-kpi"><span>Voided Invoices</span><strong class="amber">${s.voidedInvoicesCount} voided</strong></div>
        </div>
      </div>`
    : '';

  const dishesSection = options.includeTopDishes
    ? `
      <div class="section-block avoid-break">
        <div class="sec-head"><span class="sec-num">05</span>TOP 10 HIGH-REVENUE MENU DISHES</div>
        <table class="fin-table">
          <thead>
            <tr><th style="width:8%;">Rank</th><th style="width:46%;">Dish Name</th><th class="num" style="width:14%;">Qty Sold</th><th class="num" style="width:18%;">Revenue</th><th class="num" style="width:14%;">Share</th></tr>
          </thead>
          <tbody>
            ${
              s.topDishes.length === 0
                ? `<tr><td colspan="5" class="muted" style="text-align:center;padding:12px;">No dish sales recorded in this period.</td></tr>`
                : s.topDishes
                    .slice(0, 10)
                    .map(
                      (d, idx) => `
                  <tr>
                    <td class="bold">#${idx + 1}</td>
                    <td class="bold">${esc(d.name)}</td>
                    <td class="num">${d.qty}</td>
                    <td class="num gold bold">${esc(money(d.revenue))}</td>
                    <td class="num muted">${pctOf(d.revenue, s.netRestaurantRevenue)}</td>
                  </tr>`
                    )
                    .join('')
            }
          </tbody>
        </table>
      </div>`
    : '';

  const kitchenSection = options.includeKitchenAudit
    ? `
      <div class="section-block avoid-break">
        <div class="sec-head"><span class="sec-num">06</span>KITCHEN PRODUCTION, YIELD &amp; WASTAGE RECONCILIATION</div>
        <div class="mini-kpi-grid">
          <div class="mini-kpi"><span>Dishes Cooked</span><strong>${s.totalPortionsCooked} portions</strong></div>
          <div class="mini-kpi"><span>Store Raw Issued</span><strong class="gold">${esc(money(s.totalStoreIssuedValue))}</strong></div>
          <div class="mini-kpi"><span>Returned to Store</span><strong class="blue">${esc(money(s.totalReturnedToStoreValue))}</strong></div>
          <div class="mini-kpi"><span>Wastage / Yield</span><strong class="${s.totalKitchenWastageCost > 0 ? 'rose' : 'emerald'}">${esc(money(s.totalKitchenWastageCost))} (${s.averageYieldRate.toFixed(1)}%)</strong></div>
        </div>
        ${
          s.rawReconciliationList.length > 0
            ? `<table class="fin-table" style="margin-top:8px;">
                <thead>
                  <tr><th>Raw Material</th><th class="num">Issued</th><th class="num">Cooked</th><th class="num">Returned</th><th class="num">Variance</th><th class="num">Loss (PKR)</th></tr>
                </thead>
                <tbody>
                  ${s.rawReconciliationList
                    .slice(0, 12)
                    .map(
                      (it) => `
                    <tr>
                      <td class="bold">${esc(it.itemName)} <span class="muted">(${esc(it.unit)})</span></td>
                      <td class="num">${it.issued}</td>
                      <td class="num emerald">${it.cooked}</td>
                      <td class="num blue">${it.returned}</td>
                      <td class="num ${it.variance > 0 ? 'rose bold' : 'emerald'}">${it.variance > 0 ? `+${it.variance}` : '0'}</td>
                      <td class="num ${it.wastageCost > 0 ? 'rose bold' : 'muted'}">${esc(money(it.wastageCost))}</td>
                    </tr>`
                    )
                    .join('')}
                </tbody>
              </table>`
            : ''
        }
      </div>`
    : '';

  const moveLogs = Array.isArray(s.tableMoveLogs) ? s.tableMoveLogs : [];
  const cancelLogs = Array.isArray(s.cancelledOrderLogs) ? s.cancelledOrderLogs : [];
  const totalCancelledQty = cancelLogs.reduce((acc, c) => acc + Number(c.totalQty || 0), 0);
  const totalCancelledVal = cancelLogs.reduce((acc, c) => acc + Number(c.totalAmount || 0), 0);

  const opsAuditSection =
    options.includeOpsAudit !== false
      ? `
      <div class="section-block avoid-break">
        <div class="sec-head"><span class="sec-num">07</span>TABLE MOVES &amp; CANCELLED PUNCHED ORDERS AUDIT</div>
        <div class="mini-kpi-grid" style="margin-bottom:9px;">
          <div class="mini-kpi"><span>Table Moves</span><strong class="amber">${moveLogs.length} move(s)</strong></div>
          <div class="mini-kpi"><span>Cancelled Orders</span><strong class="rose">${cancelLogs.length} order(s)</strong></div>
          <div class="mini-kpi"><span>Cancelled Dishes</span><strong class="rose">${totalCancelledQty} qty</strong></div>
          <div class="mini-kpi"><span>Cancelled Value</span><strong class="rose">${esc(money(totalCancelledVal))}</strong></div>
        </div>

        <div style="font-size:9.5px;font-weight:800;color:#52171B;margin:6px 0 4px;">A. TABLE MOVE LOG (WITH NOTES)</div>
        <table class="fin-table compact" style="margin-bottom:10px;">
          <thead>
            <tr>
              <th style="width:14%;">Time</th>
              <th style="width:22%;">From &rarr; To Table</th>
              <th style="width:16%;">Moved By</th>
              <th style="width:28%;">Move Note</th>
              <th class="num" style="width:8%;">KOTs</th>
              <th class="num" style="width:12%;">Running Bill</th>
            </tr>
          </thead>
          <tbody>
            ${
              moveLogs.length === 0
                ? `<tr><td colspan="6" class="muted" style="text-align:center;padding:8px;">No table moves recorded in this period.</td></tr>`
                : moveLogs
                    .slice(0, 60)
                    .map((mv) => {
                      const dt = new Date(mv.timestamp).toLocaleString('en-PK', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      });
                      return `
                        <tr>
                          <td>${esc(dt)}</td>
                          <td class="bold">${esc(mv.fromTableName)} &rarr; ${esc(mv.toTableName)}${mv.toFloor ? ` <span class="muted">(${esc(mv.toFloor)})</span>` : ''}</td>
                          <td>${esc(mv.movedBy)}${mv.movedByRole ? ` <span class="muted">(${esc(mv.movedByRole)})</span>` : ''}</td>
                          <td><strong>${esc(mv.note || 'Table shifted')}</strong></td>
                          <td class="num">${mv.activeTicketsCount || 0}</td>
                          <td class="num gold bold">${esc(money(mv.billTotal || 0))}</td>
                        </tr>`;
                    })
                    .join('')
            }
          </tbody>
        </table>

        <div style="font-size:9.5px;font-weight:800;color:#9F1239;margin:6px 0 4px;">B. CANCELLED PUNCHED ORDERS (FULL DISH DETAILS)</div>
        <table class="fin-table compact">
          <thead>
            <tr>
              <th style="width:13%;">Time</th>
              <th style="width:15%;">KOT # &amp; Table</th>
              <th style="width:13%;">Cancelled By</th>
              <th style="width:18%;">Cancel Reason</th>
              <th style="width:29%;">Cancelled Dishes Breakdown</th>
              <th class="num" style="width:12%;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${
              cancelLogs.length === 0
                ? `<tr><td colspan="6" class="muted" style="text-align:center;padding:8px;">No punched orders were cancelled in this period.</td></tr>`
                : cancelLogs
                    .slice(0, 80)
                    .map((cn) => {
                      const dt = new Date(cn.cancelledAt).toLocaleString('en-PK', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      });
                      const dishLines = (cn.items || [])
                        .map(
                          (it) =>
                            `${it.qty}x ${esc(it.name)} (${esc(money(it.lineTotal))})${it.notes ? ` [${esc(it.notes)}]` : ''}`
                        )
                        .join('<br/>');
                      return `
                        <tr>
                          <td>${esc(dt)}</td>
                          <td class="bold">${esc(cn.ticketId)}<br/><span class="muted">${esc(cn.tableName)}${cn.floor ? ` • ${esc(cn.floor)}` : ''}</span></td>
                          <td>${esc(cn.cancelledBy)}${cn.cancelledByRole ? `<br/><span class="muted">${esc(cn.cancelledByRole)}</span>` : ''}<br/><span class="muted">Srv: ${esc(cn.server)}</span></td>
                          <td class="rose bold">${esc(cn.reason || 'Cancelled')}</td>
                          <td>${dishLines || '<span class="muted">No items</span>'}</td>
                          <td class="num rose bold">${esc(money(cn.totalAmount || 0))}<br/><span class="muted">${cn.totalQty || 0} qty</span></td>
                        </tr>`;
                    })
                    .join('')
            }
          </tbody>
        </table>
      </div>`
      : '';

  const ledgerSection =
    options.includeInvoiceLedger && s.validInvoices.length > 0
      ? `
      <div class="section-block page-break-before">
        <div class="sec-head"><span class="sec-num">08</span>SETTLED INVOICES AUDIT LEDGER (${s.validInvoices.length} TRANSACTIONS)</div>
        <table class="fin-table compact">
          <thead>
            <tr>
              <th>Invoice #</th>
              <th>Date &amp; Time</th>
              <th>Type / Table</th>
              <th>Server</th>
              <th class="num">SubTotal</th>
              <th class="num">Disc</th>
              <th class="num">GST</th>
              <th class="num">Total</th>
            </tr>
          </thead>
          <tbody>
            ${s.validInvoices
              .slice(0, 150)
              .map((inv) => {
                const dt = new Date(inv.timeSettled || inv.timePlaced).toLocaleString('en-PK', {
                  day: '2-digit',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                });
                return `
                  <tr>
                    <td class="bold">${esc(inv.id)}</td>
                    <td>${esc(dt)}</td>
                    <td>${esc((inv.orderType || 'dine-in').toUpperCase())} ${inv.tableName ? `• ${esc(inv.tableName)}` : ''}</td>
                    <td>${esc(inv.server || 'Staff')}</td>
                    <td class="num">${esc(money(inv.subTotal || inv.total))}</td>
                    <td class="num rose">${inv.discount ? esc(money(inv.discount)) : '—'}</td>
                    <td class="num">${inv.tax ? esc(money(inv.tax)) : '—'}</td>
                    <td class="num bold">${esc(money(inv.total))}</td>
                  </tr>`;
              })
              .join('')}
            ${
              s.validInvoices.length > 150
                ? `<tr><td colspan="8" class="muted" style="text-align:center;padding:8px;">Showing latest 150 of ${s.validInvoices.length} settled invoices. Use CSV Export for full raw spreadsheet dump.</td></tr>`
                : ''
            }
          </tbody>
        </table>
      </div>`
      : '';

  const signaturesSection = options.includeSignatures
    ? `
      <div class="sign-block avoid-break">
        <div class="sign-col">
          <div class="sign-line"></div>
          <div class="sign-role">Prepared By (Accountant / Auditor)</div>
          <div class="sign-sub">${esc(payload.preparedBy)} (${esc(payload.preparedRole)})</div>
        </div>
        <div class="sign-col">
          <div class="sign-line"></div>
          <div class="sign-role">Reviewed By (General Manager)</div>
          <div class="sign-sub">Date &amp; Signature</div>
        </div>
        <div class="sign-col">
          <div class="sign-line"></div>
          <div class="sign-role">Approved By (Managing Director)</div>
          <div class="sign-sub">Official Stamp &amp; Approval</div>
        </div>
      </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${esc(payload.restaurantName)} - Financial Audit Report (${esc(payload.periodLabel)})</title>
<style>
  @page { size: A4 portrait; margin: 10mm 11mm 12mm 11mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  body {
    margin: 0;
    padding: 0;
    font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif;
    color: #0F172A;
    background: #FFFFFF;
    font-size: 11px;
    line-height: 1.4;
  }
  .top-stripe {
    height: 7px;
    background: linear-gradient(90deg, #52171B 0%, #52171B 68%, #D4AF37 68%, #D4AF37 100%);
    border-radius: 3px;
    margin-bottom: 12px;
  }
  .letterhead {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 14px;
    padding-bottom: 11px;
    border-bottom: 2px solid #52171B;
    margin-bottom: 12px;
  }
  .brand-name {
    font-size: 20px;
    font-weight: 900;
    color: #52171B;
    letter-spacing: 0.6px;
    margin: 0;
  }
  .brand-tag {
    font-size: 10.5px;
    font-weight: 700;
    color: #B48214;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-top: 2px;
  }
  .brand-contact {
    font-size: 9.5px;
    color: #475569;
    margin-top: 4px;
  }
  .meta-box {
    background: #FAF6EE;
    border: 1px solid #E7E0D3;
    border-left: 3px solid #D4AF37;
    border-radius: 6px;
    padding: 7px 11px;
    min-width: 235px;
    font-size: 9.5px;
  }
  .meta-title {
    font-size: 11px;
    font-weight: 900;
    color: #52171B;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
  }
  .meta-row { display: flex; justify-content: space-between; gap: 10px; margin-top: 2px; }
  .meta-k { color: #64748B; font-weight: 600; }
  .meta-v { color: #0F172A; font-weight: 800; text-align: right; }

  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 9px;
    margin-bottom: 14px;
  }
  .kpi-card {
    border: 1px solid #E2E8F0;
    border-top: 3px solid #52171B;
    border-radius: 8px;
    padding: 9px 10px;
    background: #FFFFFF;
  }
  .kpi-card.gold { border-top-color: #B48214; background: #FFFDF7; }
  .kpi-card.blue { border-top-color: #2563EB; }
  .kpi-card.rose { border-top-color: #E11D48; }
  .kpi-card.emerald { border-top-color: #059669; background: #F0FDF4; }
  .kpi-lbl { font-size: 8.5px; font-weight: 800; color: #64748B; letter-spacing: 0.5px; text-transform: uppercase; }
  .kpi-val { font-size: 16px; font-weight: 900; color: #0F172A; margin-top: 3px; }
  .kpi-sub { font-size: 8.8px; color: #475569; margin-top: 2px; }

  .section-block { margin-bottom: 14px; }
  .avoid-break { break-inside: avoid; page-break-inside: avoid; }
  .page-break-before { page-break-before: always; break-before: page; }

  .sec-head {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 11px;
    font-weight: 900;
    color: #52171B;
    letter-spacing: 0.5px;
    padding-bottom: 5px;
    border-bottom: 1.5px solid #E7E0D3;
    margin-bottom: 8px;
  }
  .sec-num {
    display: inline-block;
    background: #52171B;
    color: #D4AF37;
    font-size: 9px;
    font-weight: 900;
    padding: 2px 6px;
    border-radius: 4px;
  }

  .charts-two-col {
    display: grid;
    grid-template-columns: 1.15fr 1fr;
    gap: 10px;
  }
  .chart-box {
    border: 1px solid #E2E8F0;
    border-radius: 8px;
    padding: 10px 12px;
    background: #FAFAF9;
  }
  .chart-title { font-size: 11px; font-weight: 800; color: #0F172A; }
  .chart-sub { font-size: 9px; color: #64748B; margin-bottom: 8px; }
  .donut-flex { display: flex; align-items: center; gap: 12px; }
  .donut-center {
    position: absolute; inset: 0; display: flex; flex-direction: column;
    align-items: center; justify-content: center; text-align: center; padding: 14px;
  }
  .donut-c-sub { font-size: 7.5px; font-weight: 800; color: #64748B; letter-spacing: 0.6px; }
  .donut-c-val { font-size: 11.5px; font-weight: 900; color: #0F172A; margin-top: 1px; }
  .svg-leg-col { flex: 1; display: flex; flex-direction: column; gap: 6px; }
  .svg-leg-row {
    display: flex; align-items: center; gap: 6px;
    background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 6px; padding: 5px 7px; font-size: 9.5px;
  }
  .svg-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .svg-leg-name { flex: 1; font-weight: 700; color: #1E293B; }
  .svg-leg-val { font-weight: 800; color: #0F172A; }
  .svg-leg-pct { font-weight: 800; color: #64748B; min-width: 34px; text-align: right; }

  .wf-wrap { display: flex; flex-direction: column; gap: 6px; }
  .wf-row { background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 6px; padding: 5px 8px; }
  .wf-row-net { background: #F0FDF4; border-color: #A7F3D0; }
  .wf-head { display: flex; justify-content: space-between; align-items: center; font-size: 9.5px; margin-bottom: 4px; }
  .wf-lbl { display: flex; align-items: center; gap: 5px; font-weight: 700; color: #1E293B; }
  .wf-val { font-weight: 800; }
  .wf-val small, .wf-lbl small { font-weight: 600; color: #64748B; }
  .wf-track { height: 5px; background: #E2E8F0; border-radius: 3px; overflow: hidden; }
  .wf-fill { height: 100%; border-radius: 3px; }

  .two-col-tables { display: grid; grid-template-columns: 1fr 1.15fr; gap: 10px; }
  .fin-table { width: 100%; border-collapse: collapse; font-size: 10px; border: 1px solid #E2E8F0; }
  .fin-table.compact { font-size: 9px; }
  .fin-table thead { display: table-header-group; }
  .fin-table tr { break-inside: avoid; page-break-inside: avoid; }
  .fin-table th {
    background: #52171B; color: #FFFFFF; font-weight: 800; text-align: left;
    padding: 6px 8px; font-size: 9px; letter-spacing: 0.3px; text-transform: uppercase;
  }
  .fin-table td { padding: 5.5px 8px; border-bottom: 1px solid #F1F5F9; color: #1E293B; }
  .fin-table tr.cat-row td {
    background: #F8FAFC; font-weight: 800; color: #52171B; font-size: 9.3px;
    border-top: 1px solid #E2E8F0; border-bottom: 1px solid #E2E8F0; padding-top: 6px; padding-bottom: 6px;
  }
  .fin-table tr.sub-row td {
    background: #FAF6EE; font-weight: 800; color: #0F172A; border-top: 1px solid #E7E0D3; border-bottom: 1px solid #E7E0D3;
  }
  .fin-table tr.blue-bg td { background: #EFF6FF; }
  .fin-table tr.net-row td { font-size: 11px; font-weight: 900; padding: 8px; border-top: 2px solid #059669; }
  .fin-table tr.net-pos td { background: #ECFDF5; color: #065F46; border-top-color: #059669; }
  .fin-table tr.net-neg td { background: #FFF1F2; color: #9F1239; border-top-color: #E11D48; }
  .fin-table tr.net-gold td { background: #FEF3C7; color: #92400E; border-top-color: #B48214; }
  .indent { padding-left: 18px !important; }
  .num { text-align: right !important; white-space: nowrap; }
  .bold { font-weight: 800; }
  .muted { color: #64748B; }
  .gold { color: #B48214; }
  .blue { color: #1D4ED8; }
  .emerald { color: #047857; }
  .rose { color: #BE123C; }
  .amber { color: #B45309; }

  .mini-kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .mini-kpi {
    border: 1px solid #E2E8F0; border-radius: 7px; padding: 7px 9px; background: #F8FAFC;
    display: flex; flex-direction: column; gap: 2px;
  }
  .mini-kpi span { font-size: 8.5px; font-weight: 700; color: #64748B; text-transform: uppercase; }
  .mini-kpi strong { font-size: 12px; font-weight: 900; color: #0F172A; }

  .sign-block {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;
    margin-top: 22px;
    padding-top: 14px;
    border-top: 1px dashed #CBD5E1;
  }
  .sign-col { text-align: center; }
  .sign-line { height: 28px; border-bottom: 1.2px solid #475569; margin-bottom: 5px; }
  .sign-role { font-size: 9.5px; font-weight: 800; color: #0F172A; }
  .sign-sub { font-size: 8.5px; color: #64748B; margin-top: 1px; }

  .doc-footer {
    margin-top: 16px;
    padding-top: 8px;
    border-top: 1px solid #E2E8F0;
    display: flex;
    justify-content: space-between;
    font-size: 8.5px;
    color: #64748B;
  }
</style>
</head>
<body>
  <div class="top-stripe"></div>

  <div class="letterhead">
    <div>
      <h1 class="brand-name">${esc(payload.restaurantName || 'SULTAN RESTAURANT')}</h1>
      <div class="brand-tag">${esc(payload.tagline || 'Executive Financial Intelligence & Audit Report')}</div>
      <div class="brand-contact">
        ${[payload.address, payload.phone ? `Tel: ${payload.phone}` : '', payload.ntnOrTaxId ? `NTN / Tax ID: ${payload.ntnOrTaxId}` : ''].filter(Boolean).join('  •  ') || 'Sultan Restaurant Central POS & Financial Audit System'}
      </div>
    </div>
    <div class="meta-box">
      <div class="meta-title">${esc(options.presetName || 'EXECUTIVE FINANCIAL AUDIT')}</div>
      <div class="meta-row"><span class="meta-k">Document Ref:</span><span class="meta-v">${auditRef}</span></div>
      <div class="meta-row"><span class="meta-k">Audit Period:</span><span class="meta-v">${esc(payload.periodLabel)}</span></div>
      <div class="meta-row"><span class="meta-k">Date Window:</span><span class="meta-v">${esc(periodRange)}</span></div>
      <div class="meta-row"><span class="meta-k">Generated:</span><span class="meta-v">${esc(generatedStr)}</span></div>
      <div class="meta-row"><span class="meta-k">Prepared By:</span><span class="meta-v">${esc(payload.preparedBy)}</span></div>
    </div>
  </div>

  <div class="kpi-grid avoid-break">
    <div class="kpi-card gold">
      <div class="kpi-lbl">Gross Topline Revenue</div>
      <div class="kpi-val gold">${esc(money(s.totalGrossRevenue))}</div>
      <div class="kpi-sub">${s.totalOrders} transactions • Avg ${esc(money(s.averageTicket))}</div>
    </div>
    <div class="kpi-card blue">
      <div class="kpi-lbl">Gross Operating Profit</div>
      <div class="kpi-val blue">${esc(money(s.grossOperatingProfit))}</div>
      <div class="kpi-sub">Gross Margin: ${s.grossMarginPercent.toFixed(1)}%</div>
    </div>
    <div class="kpi-card rose">
      <div class="kpi-lbl">Total OPEX &amp; Losses</div>
      <div class="kpi-val rose">${esc(money(s.totalOpex + s.netBreakageLoss))}</div>
      <div class="kpi-sub">OPEX ${esc(money(s.totalOpex))} + Loss ${esc(money(s.netBreakageLoss))}</div>
    </div>
    <div class="kpi-card ${s.netOperatingProfit >= 0 ? 'emerald' : 'rose'}">
      <div class="kpi-lbl">Net Profit (EBITDA)</div>
      <div class="kpi-val ${s.netOperatingProfit >= 0 ? 'emerald' : 'rose'}">${esc(money(s.netOperatingProfit))}</div>
      <div class="kpi-sub">Net Margin: ${s.netProfitMargin.toFixed(1)}% of revenue</div>
    </div>
  </div>

  ${chartsSection}
  ${pnlSection}
  ${channelsAndCashSection}
  ${taxSection}
  ${dishesSection}
  ${kitchenSection}
  ${opsAuditSection}
  ${ledgerSection}
  ${signaturesSection}

  <div class="doc-footer">
    <span>${esc(payload.restaurantName || 'SULTAN RESTAURANT')} • Confidential Executive Financial Audit (${auditRef})</span>
    <span>Generated via Sultan Central POS Hub • ${esc(generatedStr)}</span>
  </div>
</body>
</html>`;
}

export function openPrintableExecutivePdf(
  payload: FinancialReportPdfPayload,
  options: PdfExportOptions = DEFAULT_PDF_OPTIONS
): { ok: boolean; mode: 'window' | 'iframe' | 'unsupported'; message: string } {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || typeof document === 'undefined') {
    return {
      ok: false,
      mode: 'unsupported',
      message: 'Direct browser print preview is available on Web terminals. Use Download PDF on mobile.',
    };
  }

  const html = buildExecutiveFinancialReportHtml(payload, options);
  const dateStamp = new Date().toISOString().slice(0, 10);
  const docTitle = `Sultan_Financial_Report_${payload.periodKey}_${dateStamp}`;

  // Try hidden iframe print first (never blocked by browser popup blockers!)
  try {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const frameDoc = iframe.contentWindow?.document;
    if (frameDoc && iframe.contentWindow) {
      const prevTitle = document.title;
      document.title = docTitle;
      frameDoc.open();
      frameDoc.write(html);
      frameDoc.close();

      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } finally {
          setTimeout(() => {
            document.title = prevTitle;
            try {
              document.body.removeChild(iframe);
            } catch {}
          }, 1200);
        }
      }, 300);

      return { ok: true, mode: 'iframe', message: 'Executive A4 print / Save-as-PDF preview opened.' };
    }
    try {
      document.body.removeChild(iframe);
    } catch {}
  } catch {}

  // Fallback to new tab
  const win = window.open('', '_blank', 'width=960,height=1100');
  if (win) {
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.document.title = docTitle;
    setTimeout(() => {
      try {
        win.focus();
        win.print();
      } catch {}
    }, 350);
    return { ok: true, mode: 'window', message: 'Opened Executive A4 PDF Preview window.' };
  }

  return { ok: false, mode: 'unsupported', message: 'Please allow popups or use Download PDF.' };
}

/**
 * Generates a real vector A4 PDF via the Sultan Central Hub (/api/reports/export-pdf)
 * and downloads it directly into the user's Downloads folder.
 * Automatically falls back to crisp A4 Browser Print-to-PDF if the server endpoint is unreachable.
 */
export async function downloadExecutivePdf(
  payload: FinancialReportPdfPayload,
  options: PdfExportOptions = DEFAULT_PDF_OPTIONS
): Promise<{ ok: boolean; method: 'server-pdf' | 'browser-print'; filename: string; message: string }> {
  const dateStamp = new Date().toISOString().slice(0, 10);
  const cleanPeriod = (payload.periodKey || 'audit').replace(/[^a-z0-9_-]/gi, '');
  const filename = `Sultan_Financial_Report_${cleanPeriod}_${dateStamp}.pdf`;
  const html = buildExecutiveFinancialReportHtml(payload, options);

  try {
    const base =
      Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : getActiveServerHttpUrl();

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 20000) : null;

    const res = await fetch(`${base}/api/reports/export-pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html, filename }),
      ...(controller ? { signal: controller.signal } : {}),
    });
    if (timer) clearTimeout(timer);

    if (res.ok && Platform.OS === 'web' && typeof window !== 'undefined' && typeof document !== 'undefined') {
      const blob = await res.blob();
      if (blob.size > 500) {
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          try {
            document.body.removeChild(a);
            URL.revokeObjectURL(blobUrl);
          } catch {}
        }, 2500);
        return {
          ok: true,
          method: 'server-pdf',
          filename,
          message: `Downloaded professional vector PDF: ${filename}`,
        };
      }
    }
  } catch {
    // Graceful fallback below
  }

  // Fallback to native A4 print-to-PDF engine
  const fallback = openPrintableExecutivePdf(payload, options);
  return {
    ok: fallback.ok,
    method: 'browser-print',
    filename,
    message: fallback.ok
      ? 'Choose "Save as PDF" in the A4 Print Dialog to save your Executive PDF.'
      : fallback.message,
  };
}
