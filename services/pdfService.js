/**
 * Ghana Stores - PDF Receipt Generator
 * PDFKit-based branded invoices with embedded QR verification codes.
 * (Puppeteer is intentionally avoided: PDFKit is far lighter and needs no
 * Chromium binary download, keeping deploys fast on small VPS instances.)
 */
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

const BRAND_BLUE = '#2563EB';
const EMERALD = '#059669';
const AMBER = '#F59E0B';
const SLATE_DARK = '#0F172A';
const CHARCOAL = '#18181B';
const LIGHT = '#F8FAFC';

const cedis = (v) =>
  `GHS ${Number(v ?? 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function safe(v) {
  return String(v ?? '').replace(/[\r\n]+/g, ' ').trim();
}

/**
 * Build a receipt PDF for an order.
 * @param {object} order - order row + store + items[] + verify_url
 * @returns {Promise<Buffer>}
 */
export function buildOrderReceiptPdf(order) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const items = Array.isArray(order.items) ? order.items : [];
      const store = order.store || {};
      const paid = ['PAID', 'FULFILLED', 'DELIVERED'].includes(order.status);

      drawHeader(doc, store);
      const yAfterMeta = drawTitleAndMeta(doc, order, paid);
      let y = drawItemsTable(doc, items, yAfterMeta);
      y = drawTotals(doc, order, y);

      /* ---- QR verification code ---- */
      const qrPayload = order.verify_url ||
        `${process.env.PLATFORM_URL || 'https://ghastores.com'}/verify/${order.id}`;
      try {
        const qrBuf = await QRCode.toBuffer(qrPayload, { margin: 1, width: 220 });
        const qrX = 56;
        const qrY = Math.max(y + 60, doc.page.height - 250);
        doc.image(qrBuf, qrX, qrY, { width: 108 });
        doc.font('Helvetica').fontSize(7.5).fillColor('#94A3B8')
          .text('Scan to verify this receipt', qrX - 6, qrY + 112, { width: 126, align: 'center' });
      } catch (qrErr) {
        console.error('[pdf] QR embed failed:', qrErr.message);
      }

      /* ---- Footer ---- */
      doc.font('Helvetica').fontSize(8).fillColor('#94A3B8')
        .text('This receipt was generated electronically by Ghana Stores and is valid without signature.',
          48, doc.page.height - 64, { align: 'center', width: doc.page.width - 96 });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/* ------------------------------ draw sections ------------------------------ */

function drawHeader(doc, store) {
  doc.rect(0, 0, doc.page.width, 118).fill(BRAND_BLUE);
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(22)
    .text(safe(store.name) || 'Ghana Stores Store', 48, 34);
  doc.font('Helvetica').fontSize(9.5).fillColor('#DBEAFE');
  const contact = [
    store.subdomain_slug ? `${store.subdomain_slug}.ghastores.com` : null,
    store.phone ? `Tel: ${safe(store.phone)}` : null,
    store.momo_number ? `MoMo: ${safe(store.momo_number)}` : null,
  ].filter(Boolean).join('   |   ');
  if (contact) doc.text(contact, 48, 66);
  doc.fontSize(8.5).text('Powered by Ghana Stores - Multi-tenant Commerce for West Africa', 48, contact ? 88 : 70);
}

function drawTitleAndMeta(doc, order, paid) {
  const titleY = 146;
  doc.fillColor(SLATE_DARK).font('Helvetica-Bold').fontSize(16)
    .text(`Receipt ${safe(order.order_number)}`, 48, titleY);
  const statusText = paid ? 'PAID' : safe(order.status);
  const pillColor = paid ? EMERALD : (order.status === 'CANCELLED' ? '#EF4444' : AMBER);
  const pillW = doc.widthOfString(statusText) + 24;
  doc.roundedRect(doc.page.width - 48 - pillW, titleY - 4, pillW, 24, 12).fill(pillColor);
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(10)
    .text(statusText, doc.page.width - 48 - pillW, titleY + 3, { width: pillW, align: 'center' });

  let y = titleY + 36;
  const dateStr = new Date(order.created_at || Date.now()).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  const meta = [
    ['Date', dateStr],
    ['Customer', safe(order.customer_name) || 'Walk-in customer'],
    ['Phone', safe(order.customer_phone) || '-'],
    ['Channel / Payment', `${safe(order.channel)} / ${safe(order.payment_method)}`],
  ];
  meta.forEach(([k, v], i) => {
    const x = 48 + (i % 2) * ((doc.page.width - 96) / 2);
    const yy = y + Math.floor(i / 2) * 30;
    doc.fillColor('#94A3B8').font('Helvetica').fontSize(8.5)
      .text(k.toUpperCase(), x, yy, { characterSpacing: 0.5 });
    doc.fillColor(CHARCOAL).font('Helvetica-Bold').fontSize(10).text(v, x, yy + 11);
  });
  return y + 78;
}

function drawItemsTable(doc, items, yStart) {
  let y = yStart;
  doc.rect(48, y, doc.page.width - 96, 26).fill(LIGHT);
  doc.fillColor(SLATE_DARK).font('Helvetica-Bold').fontSize(9);
  doc.text('ITEM', 58, y + 8);
  doc.text('UNIT', 330, y + 8, { width: 70, align: 'right' });
  doc.text('QTY', 410, y + 8, { width: 50, align: 'right' });
  doc.text('TOTAL', doc.page.width - 150, y + 8, { width: 92, align: 'right' });
  y += 32;

  if (items.length === 0) {
    doc.font('Helvetica-Oblique').fontSize(9.5).fillColor('#94A3B8')
      .text('No line items recorded.', 58, y);
    return y + 20;
  }

  items.forEach((it) => {
    const label = it.variant_label
      ? `${safe(it.product_name)} - ${safe(it.variant_label)}`
      : safe(it.product_name);
    doc.fillColor(CHARCOAL).font('Helvetica').fontSize(9.5)
      .text(label.slice(0, 64), 58, y, { width: 262 });
    doc.text(cedis(it.unit_price), 330, y, { width: 70, align: 'right' });
    doc.text(String(it.quantity), 410, y, { width: 50, align: 'right' });
    doc.font('Helvetica-Bold')
      .text(cedis(it.line_total), doc.page.width - 150, y, { width: 92, align: 'right' });
    y += 18;
    doc.moveTo(48, y - 4).lineTo(doc.page.width - 48, y - 4).lineWidth(0.5)
      .strokeColor('#E2E8F0').stroke();
  });
  return y;
}

function drawTotals(doc, order, yStart) {
  let y = yStart + 14;
  const totals = [
    ['Subtotal', cedis(order.subtotal)],
    ...(Number(order.delivery_fee) > 0 ? [['Delivery', cedis(order.delivery_fee)]] : []),
    ...(Number(order.discount_amount) > 0 ? [['Loyalty discount', `- ${cedis(order.discount_amount)}`]] : []),
    ...(Number(order.points_earned) > 0 ? [['Points earned', `${order.points_earned} pts`]] : []),
    ...(Number(order.points_redeemed) > 0 ? [['Points redeemed', `${order.points_redeemed} pts`]] : []),
  ];
  totals.forEach(([k, v]) => {
    doc.font('Helvetica').fontSize(9.5);
    doc.fillColor('#64748B').text(k, 320, y);
    doc.fillColor(k.includes('discount') ? EMERALD : CHARCOAL)
      .font(k.includes('discount') ? 'Helvetica-Bold' : 'Helvetica')
      .text(v, doc.page.width - 150, y, { width: 92, align: 'right' });
    y += 15;
  });
  doc.moveTo(300, y + 2).lineTo(doc.page.width - 48, y + 2).lineWidth(1)
    .strokeColor('#CBD5E1').stroke();
  doc.font('Helvetica-Bold').fontSize(13).fillColor(SLATE_DARK).text('TOTAL', 320, y + 12);
  doc.fillColor(BRAND_BLUE).fontSize(13).text(cedis(order.total), doc.page.width - 190, y + 12,
    { width: 132, align: 'right' });
  return y + 34;
}

export default { buildOrderReceiptPdf };

