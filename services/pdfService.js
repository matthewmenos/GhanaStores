import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { PassThrough } from 'stream';

const BRAND = {
  primary: '#2563EB',
  slateDark: '#0F172A',
  slateLight: '#F8FAFC',
  success: '#059669',
};

/**
 * Streams a branded PDF receipt for a completed order, including a QR
 * code encoding a verification URL. Returns a Buffer so the caller can
 * either stream it directly to the client or attach it to a WhatsApp /
 * SMS follow-up.
 *
 * @param {object} order - { id, storeName, items, subtotal, loyaltyDiscount, total, createdAt, customerName, paymentMethod }
 */
export async function generateReceiptPdf(order) {
  const qrDataUrl = await QRCode.toDataURL(
    `https://verify.ghanastores.com/receipts/${order.id}`,
    { margin: 1, color: { dark: BRAND.slateDark, light: '#FFFFFF' } }
  );

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A5', margin: 36 });
    const stream = new PassThrough();
    const chunks = [];

    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
    doc.pipe(stream);

    // Header
    doc.rect(0, 0, doc.page.width, 70).fill(BRAND.primary);
    doc.fillColor('#FFFFFF').fontSize(18).font('Helvetica-Bold')
      .text(order.storeName, 36, 24);
    doc.fontSize(9).font('Helvetica').fillColor('#DBEAFE')
      .text('Powered by Ghana Stores', 36, 48);

    doc.moveDown(3);
    doc.fillColor(BRAND.slateDark).fontSize(12).font('Helvetica-Bold')
      .text('Order Receipt', 36, 90);
    doc.fontSize(9).font('Helvetica').fillColor('#475569')
      .text(`Order #${order.id.slice(0, 8).toUpperCase()}`, { continued: false })
      .text(`Date: ${new Date(order.createdAt).toLocaleString('en-GB')}`)
      .text(`Customer: ${order.customerName || 'Walk-in customer'}`)
      .text(`Payment: ${order.paymentMethod}`);

    doc.moveDown(1);
    doc.moveTo(36, doc.y).lineTo(doc.page.width - 36, doc.y).strokeColor('#E2E8F0').stroke();
    doc.moveDown(0.5);

    // Line items
    doc.font('Helvetica-Bold').fontSize(9);
    doc.text('Item', 36, doc.y, { continued: true, width: 220 });
    doc.text('Qty', 260, doc.y, { continued: true, width: 40 });
    doc.text('Amount (GHS)', 320, doc.y);
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(9);

    for (const item of order.items) {
      const rowY = doc.y;
      doc.text(item.name, 36, rowY, { width: 220 });
      doc.text(String(item.quantity), 260, rowY, { width: 40 });
      doc.text((item.unitPrice * item.quantity).toFixed(2), 320, rowY);
      doc.moveDown(0.4);
    }

    doc.moveDown(0.5);
    doc.moveTo(36, doc.y).lineTo(doc.page.width - 36, doc.y).strokeColor('#E2E8F0').stroke();
    doc.moveDown(0.5);

    doc.font('Helvetica').fontSize(9).fillColor(BRAND.slateDark);
    doc.text(`Subtotal: GHS ${order.subtotal.toFixed(2)}`, { align: 'right' });
    if (order.loyaltyDiscount > 0) {
      doc.fillColor(BRAND.success).text(`Loyalty discount: -GHS ${order.loyaltyDiscount.toFixed(2)}`, { align: 'right' });
    }
    doc.font('Helvetica-Bold').fontSize(12).fillColor(BRAND.slateDark)
      .text(`Total: GHS ${order.total.toFixed(2)}`, { align: 'right' });

    // QR code footer
    const qrImage = qrDataUrl.split(',')[1];
    doc.image(Buffer.from(qrImage, 'base64'), doc.page.width - 100, doc.page.height - 130, { width: 64 });
    doc.fontSize(7).fillColor('#94A3B8')
      .text('Scan to verify this receipt', doc.page.width - 110, doc.page.height - 62, { width: 84, align: 'center' });

    doc.end();
  });
}

export default { generateReceiptPdf };
