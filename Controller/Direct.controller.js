const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const PDFDocument = require('pdfkit');
const XLSX = require('xlsx');

const pool = new Pool({
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  host: process.env.PGHOST,
  port: process.env.PGPORT,
  database: process.env.PGDATABASE,
});


const generatePDF = (type, data, customerDetails, products, dbValues) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 0, size: 'A4', autoFirstPage: true });

      const customerName = customerDetails.customer_name || 'unknown_customer';
      const safeCustomerName = customerName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
      const id = data.order_id || data.quotation_id || `temp-${Date.now()}`;

      const pdfDir = path.resolve(__dirname, '../pdf_data');
      if (!fs.existsSync(pdfDir)) {
        fs.mkdirSync(pdfDir, { recursive: true });
        fs.chmodSync(pdfDir, 0o770);
      }
      const pdfPath = path.join(pdfDir, `${safeCustomerName}-${id}-${type}.pdf`);
      const stream = fs.createWriteStream(pdfPath, { flags: 'w', mode: 0o660 });
      doc.pipe(stream);

      // ── Colour palette (print-friendly — mostly black/grey, no fills) ──
      const C = {
        black:       '#000000',
        dark:        '#1C1917',
        mid:         '#44403C',
        light:       '#78716C',
        faint:       '#D6D3D1',
        green:       '#15803D',
        white:       '#FFFFFF',
        accent:      '#EA580C',  // used ONLY for company name text + footer underline
      };

      const pageW    = doc.page.width;
      const pageH    = doc.page.height;
      const marginL  = 45;
      const marginR  = 45;
      const contentW = pageW - marginL - marginR;
      const footerH  = 28;
      const usableH  = pageH - footerH - 10;

      // ── Footer — plain text + one thin underline accent ─────────────
      const drawPageFooter = (pNum) => {
        const fY = pageH - footerH;
        // Single thin orange underline at top of footer area
        doc.strokeColor(C.accent).lineWidth(1)
          .moveTo(marginL, fY).lineTo(marginL + contentW, fY).stroke();
        doc.fillColor(C.mid).font('Helvetica').fontSize(7.5)
          .text('Thank you for your business with Madhu Nisha Crackers, Sivakasi',
            marginL, fY + 8, { width: contentW - 40, align: 'left' });
        doc.fillColor(C.light).font('Helvetica-Bold').fontSize(8)
          .text(`Page ${pNum}`, marginL, fY + 8, { width: contentW, align: 'right' });
      };

      // ── Header — text only, no background fill ──────────────────────
      const drawPageHeader = () => {
        // Thick bottom border under header area
        doc.strokeColor(C.faint).lineWidth(1)
          .moveTo(marginL, 68).lineTo(marginL + contentW, 68).stroke();
        doc.fillColor(C.accent).font('Helvetica-Bold').fontSize(22)
          .text('MADHU NISHA CRACKERS', marginL, 14, { width: contentW, align: 'center' });
        doc.fillColor(C.mid).font('Times-Italic').fontSize(8.5)
          .text("SIVAKASI'S FINEST FIREWORKS", marginL, 40, { width: contentW, align: 'center' });
        doc.fillColor(C.light).fontSize(7.5)
          .text('www.madhunishacrackers.com   |   +91 94875 24689   |   madhunishacrackers@gmail.com',
            marginL, 52, { width: contentW, align: 'center' });
      };

      // ── Table columns ───────────────────────────────────────────────
      // colW sums: 25+150+55+65+68+38+104 = 505 = contentW (595-45-45) ✓
      const colX    = [marginL, marginL+25, marginL+175, marginL+230, marginL+295, marginL+363, marginL+401];
      const colW    = [25, 150, 55, 65, 68, 38, 104];
      const headers = ['Sl.N', 'Product Name', 'Qty', 'Rate (Rs.)', 'Disc. Rate', 'Per', 'Total'];
      const rowH    = 20;

      const drawTableHeader = (y) => {
        // Bottom border under header row instead of filled background
        doc.strokeColor(C.dark).lineWidth(0.8)
          .moveTo(marginL, y).lineTo(marginL + contentW, y).stroke()
          .moveTo(marginL, y + 18).lineTo(marginL + contentW, y + 18).stroke();
        headers.forEach((h, i) => {
          doc.fillColor(C.dark).font('Helvetica-Bold').fontSize(8)
            .text(h, colX[i] + 3, y + 5, {
              width: colW[i] - 6,
              align: i === 0 || i === 2 || i === 5 ? 'center' : i >= 3 ? 'right' : 'left',
            });
        });
        // Vertical dividers in header
        colX.forEach((x, i) => {
          if (i > 0) {
            doc.strokeColor(C.faint).lineWidth(0.4)
              .moveTo(x, y).lineTo(x, y + 18).stroke();
          }
        });
        return y + 18;
      };

      const drawSectionLabel = (y, label) => {
        // Just bold underlined text — no background
        doc.fillColor(C.dark).font('Helvetica-Bold').fontSize(8.5)
          .text(label, marginL, y + 3, { width: contentW });
        doc.strokeColor(C.faint).lineWidth(0.5)
          .moveTo(marginL, y + 15).lineTo(marginL + contentW, y + 15).stroke();
        return y + 16;
      };

      const drawRowLines = (rowY) => {
        doc.strokeColor(C.faint).lineWidth(0.3)
          .moveTo(marginL, rowY + rowH - 1).lineTo(marginL + contentW, rowY + rowH - 1).stroke();
        colX.forEach((x, i) => {
          if (i > 0) doc.moveTo(x, rowY).lineTo(x, rowY + rowH).stroke();
        });
      };

      // ── State ───────────────────────────────────────────────────────
      let pageNum  = 1;
      let curY     = 0;
      let rowIndex = 0;

      const ensureSpace = (needed) => {
        if (curY + needed > usableH) {
          drawPageFooter(pageNum);
          doc.addPage();
          pageNum++;
          drawPageHeader();
          curY     = 76;
          curY     = drawTableHeader(curY);
          rowIndex = 0;
        }
      };

      // ────────────────────────────────────────────────────────────────
      // PAGE 1 CONTENT
      // ────────────────────────────────────────────────────────────────
      drawPageHeader();

      // Bill type label — bold text + underline, no background
      const isQuotation = type === 'quotation';
      doc.fillColor(C.dark).font('Helvetica-Bold').fontSize(11)
        .text(isQuotation ? 'QUOTATION' : 'ESTIMATE', marginL, 78, { width: contentW });
      doc.strokeColor(C.faint).lineWidth(0.5)
        .moveTo(marginL, 91).lineTo(marginL + contentW, 91).stroke();

      // Date
      let formattedDate = 'N/A';
      if (customerDetails.created_at) {
        try {
          const d = customerDetails.created_at instanceof Date
            ? customerDetails.created_at : new Date(customerDetails.created_at);
          if (!isNaN(d.getTime()))
            formattedDate = d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
        } catch (e) { /* ignore */ }
      }

      // ── FROM / BILL TO — two columns, bordered boxes, no fill ───────
      const infoY     = 97;
      const infoH     = 88;
      const colMid    = pageW / 2 + 5;
      const rightBoxX = colMid;
      const rightBoxW = pageW - marginR - colMid;

      // FROM box — border only
      doc.rect(marginL, infoY, contentW / 2 - 8, infoH)
        .strokeColor(C.faint).lineWidth(0.6).stroke();
      doc.fillColor(C.light).font('Helvetica-Bold').fontSize(7.5)
        .text('FROM', marginL + 10, infoY + 8);
      doc.fillColor(C.dark).font('Helvetica-Bold').fontSize(9.5)
        .text('Madhu Nisha Crackers', marginL + 10, infoY + 20);
      doc.fillColor(C.mid).font('Helvetica').fontSize(8)
        .text('Sivakasi, Tamil Nadu',         marginL + 10, infoY + 34)
        .text('+91 94875 24689',              marginL + 10, infoY + 46)
        .text('madhunishacrackers@gmail.com', marginL + 10, infoY + 58)
        .text('www.madhunishacrackers.com',   marginL + 10, infoY + 70);

      // BILL TO box — border only
      doc.rect(rightBoxX, infoY, rightBoxW, infoH)
        .strokeColor(C.faint).lineWidth(0.6).stroke();
      doc.fillColor(C.light).font('Helvetica-Bold').fontSize(7.5)
        .text('BILL TO', rightBoxX + 10, infoY + 8);
      doc.fillColor(C.dark).font('Helvetica-Bold').fontSize(9.5)
        .text(customerDetails.customer_name || 'N/A', rightBoxX + 10, infoY + 20, { width: rightBoxW - 20 });

      let addressText = customerDetails.address || 'N/A';
      if (addressText.length > 38) addressText = addressText.substring(0, 35) + '…';
      const distState = [customerDetails.district, customerDetails.state].filter(Boolean).join(', ');
      doc.fillColor(C.mid).font('Helvetica').fontSize(8)
        .text(addressText, rightBoxX + 10, infoY + 34, { width: rightBoxW - 20 })
        .text(distState,   rightBoxX + 10, infoY + 46, { width: rightBoxW - 20 })
        .text(`Mobile: ${customerDetails.mobile_number || 'N/A'}`, rightBoxX + 10, infoY + 58);
      if (data.agent_name) {
        doc.text(`Agent: ${data.agent_name}`, rightBoxX + 10, infoY + 70, { width: rightBoxW - 20 });
      }

      // ── Customer Type — plain label row ────────────────────────────
      const custTypeY = infoY + infoH + 8;
      doc.fillColor(C.light).font('Helvetica').fontSize(8)
        .text('Customer Type:', marginL, custTypeY);
      doc.fillColor(C.dark).font('Helvetica-Bold').fontSize(8)
        .text(data.customer_type || 'User', marginL + 78, custTypeY);
      doc.strokeColor(C.faint).lineWidth(0.4)
        .moveTo(marginL, custTypeY + 12).lineTo(marginL + contentW, custTypeY + 12).stroke();

      // ── Order ID / Date — plain label row ───────────────────────────
      const stripY = custTypeY + 18;
      doc.fillColor(C.light).font('Helvetica').fontSize(8)
        .text(`${isQuotation ? 'Quotation ID' : 'Order ID'}:`, marginL, stripY);
      doc.fillColor(C.dark).font('Helvetica-Bold').fontSize(8)
        .text(id, marginL + (isQuotation ? 76 : 54), stripY);
      doc.fillColor(C.light).font('Helvetica').fontSize(8)
        .text(`Date: ${formattedDate}`, marginL, stripY, { width: contentW, align: 'right' });
      doc.strokeColor(C.dark).lineWidth(0.6)
        .moveTo(marginL, stripY + 13).lineTo(marginL + contentW, stripY + 13).stroke();

      // ── Table ───────────────────────────────────────────────────────
      curY = stripY + 20;
      curY = drawTableHeader(curY);

      const discountedProducts = products.filter(p => parseFloat(p.discount || 0) > 0);
      const netRateProducts    = products.filter(p => !p.discount || parseFloat(p.discount) === 0);

      // Discounted products
      if (discountedProducts.length > 0) {
        ensureSpace(16 + rowH);
        curY = drawSectionLabel(curY, 'DISCOUNTED PRODUCTS');

        discountedProducts.forEach((product, idx) => {
          ensureSpace(rowH);
          const price     = parseFloat(product.price) || 0;
          const discount  = parseFloat(product.discount || 0);
          const discRate  = price - price * discount / 100;
          const lineTotal = discRate * (product.quantity || 1);
          const name      = (product.productname || 'N/A').length > 38
            ? product.productname.substring(0, 35) + '…'
            : (product.productname || 'N/A');

          // No alternating fill — just white rows
          doc.fillColor(C.mid).font('Helvetica').fontSize(8.5)
            .text(idx + 1,               colX[0] + 3, curY + 6, { width: colW[0] - 6, align: 'center' })
            .text(name,                  colX[1] + 3, curY + 6, { width: colW[1] - 6, align: 'left' })
            .text(product.quantity || 1, colX[2] + 3, curY + 6, { width: colW[2] - 6, align: 'center' });

          // Strikethrough original rate
          const rateStr = `Rs.${price.toFixed(2)}`;
          const rateTW  = doc.widthOfString(rateStr, { fontSize: 8.5 });
          const rateX   = colX[3] + colW[3] - 6 - rateTW;
          doc.fillColor(C.light).font('Helvetica').fontSize(8.5)
            .text(rateStr, colX[3] + 3, curY + 6, { width: colW[3] - 6, align: 'right' });
          doc.strokeColor(C.light).lineWidth(0.7)
            .moveTo(rateX, curY + 9).lineTo(rateX + rateTW, curY + 9).stroke();

          doc.fillColor(C.green).font('Helvetica-Bold').fontSize(8.5)
            .text(`Rs.${discRate.toFixed(2)}`,  colX[4] + 3, curY + 6, { width: colW[4] - 6, align: 'right' });
          doc.fillColor(C.mid).font('Helvetica').fontSize(8.5)
            .text(product.per || 'N/A',          colX[5] + 3, curY + 6, { width: colW[5] - 6, align: 'center' });
          doc.fillColor(C.dark).font('Helvetica-Bold').fontSize(8.5)
            .text(`Rs.${lineTotal.toFixed(2)}`,  colX[6] + 3, curY + 6, { width: colW[6] - 6, align: 'right' });

          drawRowLines(curY);
          curY += rowH;
          rowIndex++;
        });
      }

      // Net rate products
      if (netRateProducts.length > 0) {
        ensureSpace(24 + rowH);
        curY += 6;
        curY = drawSectionLabel(curY, 'NET RATE PRODUCTS');
        rowIndex = 0;

        netRateProducts.forEach((product, idx) => {
          ensureSpace(rowH);
          const price     = parseFloat(product.price) || 0;
          const discount  = parseFloat(product.discount || 0);
          const discRate  = price - price * discount / 100;
          const lineTotal = discRate * (product.quantity || 1);
          const name      = (product.productname || 'N/A').length > 38
            ? product.productname.substring(0, 35) + '…'
            : (product.productname || 'N/A');

          doc.fillColor(C.mid).font('Helvetica').fontSize(8.5)
            .text(idx + 1,               colX[0] + 3, curY + 6, { width: colW[0] - 6, align: 'center' })
            .text(name,                  colX[1] + 3, curY + 6, { width: colW[1] - 6, align: 'left' })
            .text(product.quantity || 1, colX[2] + 3, curY + 6, { width: colW[2] - 6, align: 'center' })
            .text(`Rs.${price.toFixed(2)}`,    colX[3] + 3, curY + 6, { width: colW[3] - 6, align: 'right' })
            .text(`Rs.${discRate.toFixed(2)}`, colX[4] + 3, curY + 6, { width: colW[4] - 6, align: 'right' })
            .text(product.per || 'N/A',        colX[5] + 3, curY + 6, { width: colW[5] - 6, align: 'center' });
          doc.fillColor(C.dark).font('Helvetica-Bold').fontSize(8.5)
            .text(`Rs.${lineTotal.toFixed(2)}`, colX[6] + 3, curY + 6, { width: colW[6] - 6, align: 'right' });

          drawRowLines(curY);
          curY += rowH;
          rowIndex++;
        });
      }

      // ── Summary totals ──────────────────────────────────────────────
      const netRate            = parseFloat(dbValues.net_rate) || 0;
      const youSave            = parseFloat(dbValues.you_save) || 0;
      const additionalDiscount = parseFloat(dbValues.additional_discount) || 0;
      const subtotal           = netRate - youSave;
      const additionalDiscAmt  = subtotal * (additionalDiscount / 100);
      const discountedSubtotal = subtotal - additionalDiscAmt;
      const processingFee      = parseFloat(dbValues.processing_fee) || discountedSubtotal * 0.01;
      const total              = parseFloat(dbValues.total) || discountedSubtotal + processingFee;

      const summaryRowCount = 3 + (additionalDiscount > 0 ? 1 : 0);
      const totalsH         = 16 + summaryRowCount * 20 + 28 + 10;

      ensureSpace(totalsH + 16);
      curY += 14;

      const totBoxW = 215;
      const totBoxX = pageW - marginR - totBoxW;
      const tncBoxW = contentW - totBoxW - 14;

      // T&C — border box, no fill
      doc.rect(marginL, curY, tncBoxW, totalsH)
        .strokeColor(C.faint).lineWidth(0.6).stroke();
      doc.fillColor(C.dark).font('Helvetica-Bold').fontSize(8)
        .text('TERMS & CONDITIONS', marginL + 10, curY + 8, { width: tncBoxW - 20 });
      doc.strokeColor(C.faint).lineWidth(0.3)
        .moveTo(marginL + 10, curY + 18).lineTo(marginL + tncBoxW - 10, curY + 18).stroke();
      doc.fillColor(C.mid).font('Helvetica').fontSize(7.5)
        .text('1. Product images are for reference only; actual items may vary.',           marginL + 10, curY + 24, { width: tncBoxW - 20 })
        .text('2. Delivery charges are payable by customer to the transport provider.',     marginL + 10, curY + 38, { width: tncBoxW - 20 })
        .text("3. Pickup from Sivakasi warehouse is at the buyer's own cost.",              marginL + 10, curY + 52, { width: tncBoxW - 20 })
        .text('4. Prices are valid at the time of quotation and subject to change.',        marginL + 10, curY + 66, { width: tncBoxW - 20 });

      // Totals — border box, no fill
      doc.rect(totBoxX, curY, totBoxW, totalsH)
        .strokeColor(C.faint).lineWidth(0.6).stroke();

      // "ORDER SUMMARY" header — just bold text + underline
      doc.fillColor(C.dark).font('Helvetica-Bold').fontSize(8.5)
        .text('ORDER SUMMARY', totBoxX + 10, curY + 6, { width: totBoxW - 20, align: 'center' });
      doc.strokeColor(C.faint).lineWidth(0.4)
        .moveTo(totBoxX + 8, curY + 17).lineTo(totBoxX + totBoxW - 8, curY + 17).stroke();

      let tY = curY + 20;

      const totRow = (label, value, bold = false, highlight = false) => {
        if (highlight) {
          // Total row — double line above + bold large text
          doc.strokeColor(C.dark).lineWidth(0.6)
            .moveTo(totBoxX + 8, tY - 3).lineTo(totBoxX + totBoxW - 8, tY - 3).stroke();
          doc.fillColor(C.dark).font('Helvetica-Bold').fontSize(10)
            .text(label, totBoxX + 10, tY + 3, { width: totBoxW * 0.55 - 10 })
            .text(value, totBoxX + 10, tY + 3, { width: totBoxW - 20, align: 'right' });
        } else {
          doc.fillColor(bold ? C.dark : C.mid)
            .font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5)
            .text(label, totBoxX + 10, tY, { width: totBoxW * 0.55 - 10 })
            .text(value, totBoxX + 10, tY, { width: totBoxW - 20, align: 'right' });
        }
        tY += 20;
      };

      const promoDiscount = parseFloat(dbValues.promo_discount) || 0;

      totRow('Net Rate (MRP)',      `Rs.${netRate.toFixed(2)}`);
      totRow('Product Discount',    `- Rs.${youSave.toFixed(2)}`, true);
      if (additionalDiscount > 0)
        totRow(`Extra Discount (${additionalDiscount}%)`, `- Rs.${additionalDiscAmt.toFixed(2)}`, true);
      if (promoDiscount > 0)
        totRow('Promo Discount',    `- Rs.${promoDiscount.toFixed(2)}`, true);
      totRow('Processing Fee (1%)', `Rs.${processingFee.toFixed(2)}`);
      totRow('TOTAL PAYABLE',       `Rs.${total.toFixed(2)}`, true, true);

      // ── Footer (thin orange underline only) ─────────────────────────
      drawPageFooter(pageNum);

      doc.end();

      stream.on('finish', () => {
        if (!fs.existsSync(pdfPath)) {
          reject(new Error(`PDF file not found at ${pdfPath} for ${type}_id ${id}`));
          return;
        }
        console.log(`PDF generated at: ${pdfPath} for ${type}_id: ${id}`);
        resolve({ pdfPath });
      });
      stream.on('error', (err) => {
        reject(new Error(`Stream error: ${err.message}`));
      });
    } catch (err) {
      console.error(`PDF generation failed: ${err.message}`);
      reject(new Error(`PDF generation failed: ${err.message}`));
    }
  });
};

exports.getCustomers = async (req, res) => {
  try {
    const query = `
      SELECT c.id, c.customer_name AS name, c.address, c.mobile_number, c.email, c.customer_type, c.district, c.state, c.agent_id,
             a.customer_name AS agent_name
      FROM public.customers c
      LEFT JOIN public.customers a ON c.agent_id::bigint = a.id AND c.customer_type = 'Customer of Selected Agent'
    `;
    const result = await pool.query(query);
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Failed to fetch customers:', err.stack);
    res.status(500).json({ error: 'Failed to fetch customers', details: err.message });
  }
};

exports.getProductTypes = async (req, res) => {
  try {
    const result = await pool.query('SELECT DISTINCT product_type FROM public.products');
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Failed to fetch product types:', err.message);
    res.status(500).json({ message: 'Failed to fetch product types', error: err.message });
  }
};

exports.getProductsByType = async (req, res) => {
  try {
    const productTypesResult = await pool.query('SELECT DISTINCT product_type FROM public.products');
    const productTypes = productTypesResult.rows.map(row => row.product_type);
    let allProducts = [];
    for (const productType of productTypes) {
      const tableName = productType.toLowerCase().replace(/\s+/g, '_');
      const query = `
        SELECT id, serial_number, productname, price, per, discount, image, status, $1 AS product_type
        FROM public.${tableName}
        WHERE status = 'on'
      `;
      const result = await pool.query(query, [productType]);
      allProducts = allProducts.concat(result.rows);
    }
    const products = allProducts.map(row => ({
      id: row.id,
      product_type: row.product_type,
      serial_number: row.serial_number,
      productname: row.productname,
      price: parseFloat(row.price || 0),
      per: row.per,
      discount: parseFloat(row.discount || 0),
      image: row.image,
      status: row.status
    }));
    res.status(200).json(products);
  } catch (err) {
    console.error('Failed to fetch products:', err.message);
    res.status(500).json({ message: 'Failed to fetch products', error: err.message });
  }
};

exports.getAproductsByType = async (req, res) => {
  try {
    const productTypesResult = await pool.query('SELECT DISTINCT product_type FROM public.products');
    const productTypes = productTypesResult.rows.map(row => row.product_type);
    let allProducts = [];
    for (const productType of productTypes) {
      const tableName = productType.toLowerCase().replace(/\s+/g, '_');
      const query = `
        SELECT id, serial_number, productname, price, per, discount, image, status, $1 AS product_type
        FROM public.${tableName}
      `;
      const result = await pool.query(query, [productType]);
      allProducts = allProducts.concat(result.rows);
    }
    const products = allProducts.map(row => ({
      id: row.id,
      product_type: row.product_type,
      serial_number: row.serial_number,
      productname: row.productname,
      price: parseFloat(row.price || 0),
      per: row.per,
      discount: parseFloat(row.discount || 0),
      image: row.image,
      status: row.status
    }));
    res.status(200).json(products);
  } catch (err) {
    console.error('Failed to fetch products:', err.message);
    res.status(500).json({ message: 'Failed to fetch products', error: err.message });
  }
};

exports.getAllQuotations = async (req, res) => {
  try {
    const query = `
      SELECT id, customer_id, quotation_id, products, net_rate, you_save, total, promo_discount, additional_discount,
             customer_name, address, mobile_number, email, district, state, customer_type, 
             status, created_at, updated_at, pdf
      FROM public.quotations
      ORDER BY created_at DESC
    `;
    const result = await pool.query(query);
    res.status(200).json(result.rows);
  } catch (err) {
    console.error(`Failed to fetch quotations: ${err.message}`);
    res.status(500).json({ message: 'Failed to fetch quotations', error: err.message });
  }
};

exports.createQuotation = async (req, res) => {
  let client;
  try {
    const {
      customer_id, quotation_id, products, net_rate, you_save, total, promo_discount, additional_discount,
      customer_type, customer_name, address, mobile_number, email, district, state
    } = req.body;

    console.log(`Received createQuotation request with quotation_id: ${quotation_id}`);

    if (!quotation_id || !/^[a-zA-Z0-9-_]+$/.test(quotation_id)) 
      return res.status(400).json({ message: 'Invalid or missing Quotation ID', quotation_id });
    if (!Array.isArray(products) || products.length === 0) 
      return res.status(400).json({ message: 'Products array is required and must not be empty', quotation_id });
    if (!total || isNaN(parseFloat(total)) || parseFloat(total) <= 0) 
      return res.status(400).json({ message: 'Total must be a positive number', quotation_id });

    const parsedNetRate = parseFloat(net_rate) || 0;
    const parsedYouSave = parseFloat(you_save) || 0;
    const parsedPromoDiscount = parseFloat(promo_discount) || 0;
    const parsedAdditionalDiscount = parseFloat(additional_discount) || 0;
    const parsedTotal = parseFloat(total);

    if ([parsedNetRate, parsedYouSave, parsedPromoDiscount, parsedAdditionalDiscount, parsedTotal].some(v => isNaN(v)))
      return res.status(400).json({ message: 'net_rate, you_save, promo_discount, additional_discount, and total must be valid numbers', quotation_id });

    let finalCustomerType = customer_type || 'User';
    let customerDetails = { customer_name, address, mobile_number, email, district, state };
    let agent_name = null;

    if (customer_id) {
      const customerCheck = await pool.query(
        'SELECT id, customer_name, address, mobile_number, email, district, state, customer_type, agent_id FROM public.customers WHERE id = $1',
        [customer_id]
      );
      if (customerCheck.rows.length === 0) 
        return res.status(404).json({ message: 'Customer not found', quotation_id });

      const customerRow = customerCheck.rows[0];
      finalCustomerType = customer_type || customerRow.customer_type || 'User';
      customerDetails = {
        customer_name: customerRow.customer_name,
        address: customerRow.address,
        mobile_number: customerRow.mobile_number,
        email: customerRow.email,
        district: customerRow.district,
        state: customerRow.state
      };

      if (finalCustomerType === 'Customer of Selected Agent' && customerRow.agent_id) {
        const agentCheck = await pool.query('SELECT customer_name FROM public.customers WHERE id = $1', [customerRow.agent_id]);
        if (agentCheck.rows.length > 0) agent_name = agentCheck.rows[0].customer_name;
      }
    } else {
      if (finalCustomerType !== 'User') 
        return res.status(400).json({ message: 'Customer type must be "User" for quotations without customer ID', quotation_id });
      if (!customer_name || !address || !district || !state || !mobile_number)
        return res.status(400).json({ message: 'All customer details must be provided', quotation_id });
    }

    const enhancedProducts = [];
    for (const product of products) {
      const { id, product_type, quantity, price, discount, productname, per } = product;
      if (!id || !product_type || !productname || quantity < 1 || isNaN(parseFloat(price)) || isNaN(parseFloat(discount)))
        return res.status(400).json({ message: 'Invalid product entry (id, product_type, productname, quantity, price, discount required)', quotation_id });

      let productPer = per || 'Unit';
      if (product_type.toLowerCase() !== 'custom') {
        const tableName = product_type.toLowerCase().replace(/\s+/g, '_');
        const productCheck = await pool.query(`SELECT per FROM public.${tableName} WHERE id = $1`, [id]);
        if (productCheck.rows.length === 0)
          return res.status(404).json({ message: `Product ${id} of type ${product_type} not found or unavailable`, quotation_id });
        productPer = productCheck.rows[0].per || productPer;
      }
      enhancedProducts.push({ ...product, per: productPer });
    }

    let pdfPath;
    try {
      const pdfResult = await generatePDF(
        'quotation',
        { quotation_id, customer_type: finalCustomerType, total: parsedTotal, agent_name },
        customerDetails,
        enhancedProducts,
        { net_rate: parsedNetRate, you_save: parsedYouSave, total: parsedTotal, promo_discount: parsedPromoDiscount, additional_discount: parsedAdditionalDiscount }
      );
      pdfPath = pdfResult.pdfPath;
      console.log(`PDF generated`);
    } catch (pdfError) {
      console.error(`Failed: PDF generation failed for quotation_id ${quotation_id}: ${pdfError.message}`);
      return res.status(500).json({ message: 'Failed to generate PDF', error: pdfError.message, quotation_id });
    }

    client = await pool.connect();
    try {
      await client.query('BEGIN');

      const existingQuotation = await client.query('SELECT id FROM public.quotations WHERE quotation_id = $1', [quotation_id]);
      if (existingQuotation.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Quotation ID already exists', quotation_id });
      }

      const result = await client.query(`
        INSERT INTO public.quotations 
        (customer_id, quotation_id, products, net_rate, you_save, total, promo_discount, additional_discount, address, mobile_number, customer_name, email, district, state, customer_type, status, created_at, pdf)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW(),$17)
        RETURNING id, created_at, customer_type, pdf, quotation_id
      `, [
        customer_id || null,
        quotation_id,
        JSON.stringify(enhancedProducts),
        parsedNetRate,
        parsedYouSave,
        parsedTotal,
        parsedPromoDiscount,
        parsedAdditionalDiscount,
        customerDetails.address || null,
        customerDetails.mobile_number || null,
        customerDetails.customer_name || null,
        customerDetails.email || null,
        customerDetails.district || null,
        customerDetails.state || null,
        finalCustomerType,
        'pending',
        pdfPath
      ]);

      console.log(`Quotation created`);

      await client.query('COMMIT');

      res.status(200).json({
        message: 'Quotation created successfully',
        quotation_id: result.rows[0].quotation_id,
        pdf_path: pdfPath
      });
    } catch (dbError) {
      await client.query('ROLLBACK');
      throw dbError;
    } finally {
      if (client) client.release();
    }
  } catch (err) {
    if (client) {
      await client.query('ROLLBACK');
      client.release();
    }
    console.error(`Failed: Failed to create quotation for quotation_id ${req.body.quotation_id}: ${err.message}`);
    res.status(500).json({ message: 'Failed to create quotation', error: err.message, quotation_id: req.body.quotation_id });
  }
};

exports.updateQuotation = async (req, res) => {
  const { quotation_id } = req.params;
  const {
    customer_id, products, net_rate, you_save, processing_fee, total, promo_discount, additional_discount, status
  } = req.body;

  try {
    // Validate inputs
    if (!quotation_id || !customer_id || !products || !Array.isArray(products)) {
      return res.status(400).json({ message: 'Invalid quotation data' });
    }

    // Fetch customer details
    const customerQuery = await pool.query('SELECT * FROM customers WHERE id = $1', [customer_id]);
    if (customerQuery.rows.length === 0) {
      return res.status(404).json({ message: 'Customer not found' });
    }
    const customerDetails = customerQuery.rows[0];

    // Generate PDF
    const pdfPath = await generatePDF(
      'quotation',
      { quotation_id, customer_type: customerDetails.customer_type },
      customerDetails,
      products,
      {
        net_rate,
        you_save,
        processing_fee,
        total,
        additional_discount,
      }
    ).pdfPath;

    // Update quotation in database, including customer details and PDF path
    const query = `
      UPDATE quotations
      SET customer_id = $1, products = $2, net_rate = $3, you_save = $4, processing_fee = $5, total = $6,
          promo_discount = $7, additional_discount = $8, status = $9,
          customer_name = $10, address = $11, mobile_number = $12, email = $13,
          district = $14, state = $15, customer_type = $16, pdf = $17,
          updated_at = NOW()
      WHERE quotation_id = $18
      RETURNING *;
    `;
    const values = [
      customer_id,
      JSON.stringify(products),
      net_rate,
      you_save,
      processing_fee,
      total,
      promo_discount || 0,
      additional_discount || 0,
      status || 'pending',
      customerDetails.customer_name || null,
      customerDetails.address || null,
      customerDetails.mobile_number || null,
      customerDetails.email || null,
      customerDetails.district || null,
      customerDetails.state || null,
      customerDetails.customer_type || 'User',
      pdfPath,
      quotation_id,
    ];
    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Quotation not found' });
    }

    // Send JSON response
    res.json({
      quotation_id,
      message: 'Quotation updated successfully',
    });
  } catch (err) {
    console.error(`Error updating quotation ${quotation_id}: ${err.message}`);
    res.status(500).json({ message: `Failed to update quotation: ${err.message}` });
  }
};

exports.deleteQuotation = async (req, res) => {
  try {
    const { quotation_id } = req.params;
    if (!quotation_id || !/^[a-zA-Z0-9-_]+$/.test(quotation_id)) 
      return res.status(400).json({ message: 'Invalid or missing Quotation ID', quotation_id });

    const quotationCheck = await pool.query(
      'SELECT * FROM public.quotations WHERE quotation_id = $1 AND status = $2',
      [quotation_id, 'pending']
    );
    if (quotationCheck.rows.length === 0) 
      return res.status(404).json({ message: 'Quotation not found or not in pending status', quotation_id });

    await pool.query(
      'UPDATE public.quotations SET status = $1, updated_at = NOW() WHERE quotation_id = $2',
      ['canceled', quotation_id]
    );

    res.status(200).json({ message: 'Quotation canceled successfully', quotation_id });
  } catch (err) {
    console.error(`Failed: Failed to cancel quotation for quotation_id ${req.params.quotation_id}: ${err.message}`);
    res.status(500).json({ message: 'Failed to cancel quotation', error: err.message, quotation_id: req.params.quotation_id });
  }
};

exports.getQuotation = async (req, res) => {
  try {
    let { quotation_id } = req.params;
    console.log(`getQuotation called with quotation_id: ${quotation_id}`);

    if (!quotation_id || quotation_id === 'undefined' || !/^[a-zA-Z0-9-_]+$/.test(quotation_id)) {
      console.error(`Failed: Invalid or undefined quotation_id received: ${quotation_id}`);
      return res.status(400).json({ message: 'Invalid or missing quotation_id', received_quotation_id: quotation_id });
    }

    if (quotation_id.endsWith('.pdf')) quotation_id = quotation_id.replace(/\.pdf$/, '');

    let quotationQuery = await pool.query(
      'SELECT products, net_rate, you_save, total, promo_discount, additional_discount, customer_name, address, mobile_number, email, district, state, customer_type, pdf, customer_id, status FROM public.quotations WHERE quotation_id = $1',
      [quotation_id]
    );

    if (quotationQuery.rows.length === 0) {
      const parts = quotation_id.split('-');
      if (parts.length > 1) {
        const possibleQuotationId = parts.slice(1).join('-');
        quotationQuery = await pool.query(
          'SELECT products, net_rate, you_save, total, promo_discount, additional_discount, customer_name, address, mobile_number, email, district, state, customer_type, pdf, customer_id, status FROM public.quotations WHERE quotation_id = $1',
          [possibleQuotationId]
        );
        if (quotationQuery.rows.length > 0) quotation_id = possibleQuotationId;
      }
    }

    if (quotationQuery.rows.length === 0) {
      console.error(`Failed: No quotation found for quotation_id: ${quotation_id}`);
      return res.status(404).json({ message: 'Quotation not found', quotation_id });
    }

    const { products, net_rate, you_save, total, promo_discount, additional_discount, customer_name, address, mobile_number, email, district, state, customer_type, pdf, customer_id, status } = quotationQuery.rows[0];
    let agent_name = null;
    if (customer_type === 'Customer of Selected Agent' && customer_id) {
      const customerCheck = await pool.query('SELECT agent_id FROM public.customers WHERE id = $1', [customer_id]);
      if (customerCheck.rows.length > 0 && customerCheck.rows[0].agent_id) {
        const agentCheck = await pool.query('SELECT customer_name FROM public.customers WHERE id = $1', [customerCheck.rows[0].agent_id]);
        if (agentCheck.rows.length > 0) agent_name = agentCheck.rows[0].customer_name;
      }
    }

    let pdfPath = pdf;
    if (!fs.existsSync(pdf)) {
      console.log(`PDF not found at ${pdf}, regenerating for quotation_id: ${quotation_id}`);
      let parsedProducts = typeof products === 'string' ? JSON.parse(products) : products;
      let enhancedProducts = [];
      for (const p of parsedProducts) {
        if (!p.per) {
          const tableName = p.product_type.toLowerCase().replace(/\s+/g, '_');
          const productCheck = await pool.query(`SELECT per FROM public.${tableName} WHERE id = $1`, [p.id]);
          const per = productCheck.rows[0]?.per || '';
          enhancedProducts.push({ ...p, per });
        } else {
          enhancedProducts.push(p);
        }
      }
      const pdfResult = await generatePDF(
        'quotation',
        { quotation_id, customer_type, total: parseFloat(total || 0), agent_name },
        { customer_name, address, mobile_number, email, district, state },
        enhancedProducts,
        { 
          net_rate: parseFloat(net_rate || 0), 
          you_save: parseFloat(you_save || 0), 
          total: parseFloat(total || 0), 
          promo_discount: parseFloat(promo_discount || 0),
          additional_discount: parseFloat(additional_discount || 0)
        }
      );
      pdfPath = pdfResult.pdfPath;
      console.log(`PDF regenerated at: ${pdfPath} for quotation_id: ${quotation_id}`);

      await pool.query(
        'UPDATE public.quotations SET pdf = $1 WHERE quotation_id = $2',
        [pdfPath, quotation_id]
      );
    }

    if (!fs.existsSync(pdfPath)) {
      console.error(`Failed: PDF file not found at ${pdfPath} for quotation_id: ${quotation_id}`);
      return res.status(404).json({ message: 'PDF file not found after generation', error: 'File system error', quotation_id });
    }

    fs.access(pdfPath, fs.constants.R_OK, (err) => {
      if (err) {
        console.error(`Failed: Cannot read PDF file at ${pdfPath} for quotation_id ${quotation_id}: ${err.message}`);
        return res.status(500).json({ message: `Cannot read PDF file at ${pdfPath}`, error: err.message, quotation_id });
      }
      const safeCustomerName = (customer_name || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=${safeCustomerName}-${quotation_id}-quotation.pdf`);
      const readStream = fs.createReadStream(pdfPath);
      readStream.on('error', (streamErr) => {
        console.error(`Failed: Failed to stream PDF for quotation_id ${quotation_id}: ${streamErr.message}`);
        if (!res.headersSent) {
          res.status(500).json({ message: 'Failed to stream PDF', error: streamErr.message, quotation_id });
        }
      });
      readStream.pipe(res);
      console.log(`PDF streaming initiated for quotation_id: ${quotation_id}`);
    });
  } catch (err) {
    console.error(`Failed: Failed to fetch quotation for quotation_id ${req.params.quotation_id}: ${err.message}`);
    res.status(500).json({ message: 'Failed to fetch quotation', error: err.message, quotation_id: req.params.quotation_id });
  }
};

exports.createBooking = async (req, res) => {
  let client;
  try {
    const {
      customer_id, order_id, quotation_id, products, net_rate, you_save, total, promo_discount, additional_discount,
      customer_type, customer_name, address, mobile_number, email, district, state
    } = req.body;

    console.log(`Received createBooking request with order_id: ${order_id}`);

    if (!order_id || !/^[a-zA-Z0-9-_]+$/.test(order_id)) 
      return res.status(400).json({ message: 'Invalid or missing Order ID', order_id });

    if (!Array.isArray(products) || products.length === 0) 
      return res.status(400).json({ message: 'Products array is required and must not be empty', order_id });

    if (!total || isNaN(parseFloat(total)) || parseFloat(total) <= 0) 
      return res.status(400).json({ message: 'Total must be a positive number', order_id });

    const parsedNetRate = parseFloat(net_rate) || 0;
    const parsedYouSave = parseFloat(you_save) || 0;
    const parsedPromoDiscount = parseFloat(promo_discount) || 0;
    const parsedAdditionalDiscount = parseFloat(additional_discount) || 0;
    const parsedTotal = parseFloat(total);

    if ([parsedNetRate, parsedYouSave, parsedPromoDiscount, parsedAdditionalDiscount, parsedTotal].some(v => isNaN(v)))
      return res.status(400).json({ message: 'net_rate, you_save, promo_discount, additional_discount, and total must be valid numbers', order_id });

    let finalCustomerType = customer_type || 'User';
    let customerDetails = { customer_name, address, mobile_number, email, district, state };
    let agent_name = null;

    if (customer_id) {
      const customerCheck = await pool.query(
        'SELECT id, customer_name, address, mobile_number, email, district, state, customer_type, agent_id FROM public.customers WHERE id = $1',
        [customer_id]
      );
      if (customerCheck.rows.length === 0) 
        return res.status(404).json({ message: 'Customer not found', order_id });

      const customerRow = customerCheck.rows[0];
      finalCustomerType = customer_type || customerRow.customer_type || 'User';
      customerDetails = {
        customer_name: customerRow.customer_name,
        address: customerRow.address,
        mobile_number: customerRow.mobile_number,
        email: customerRow.email,
        district: customerRow.district,
        state: customerRow.state
      };

      if (finalCustomerType === 'Customer of Selected Agent' && customerRow.agent_id) {
        const agentCheck = await pool.query('SELECT customer_name FROM public.customers WHERE id = $1', [customerRow.agent_id]);
        if (agentCheck.rows.length > 0) agent_name = agentCheck.rows[0].customer_name;
      }
    } else {
      if (finalCustomerType !== 'User') 
        return res.status(400).json({ message: 'Customer type must be "User" for bookings without customer ID', order_id });
      if (!customer_name || !address || !district || !state || !mobile_number)
        return res.status(400).json({ message: 'All customer details must be provided', order_id });
    }

    const enhancedProducts = [];
    for (const product of products) {
      const { id, product_type, quantity, price, discount, productname, per } = product;
      if (!id || !product_type || !productname || quantity < 1 || isNaN(parseFloat(price)) || isNaN(parseFloat(discount)))
        return res.status(400).json({ message: 'Invalid product entry (id, product_type, productname, quantity, price, discount required)', order_id });

      let productPer = per || 'Unit';
      if (product_type.toLowerCase() !== 'custom') {
        const tableName = product_type.toLowerCase().replace(/\s+/g, '_');
        const productCheck = await pool.query(`SELECT per FROM public.${tableName} WHERE id = $1`, [id]);
        if (productCheck.rows.length === 0)
          return res.status(404).json({ message: `Product ${id} of type ${product_type} not found or unavailable`, order_id });
        productPer = productCheck.rows[0].per || productPer;
      }
      enhancedProducts.push({ ...product, per: productPer });
    }

    let pdfPath;
    try {
      const pdfResult = await generatePDF(
        'invoice',
        { order_id, customer_type: finalCustomerType, total: parsedTotal, agent_name },
        customerDetails,
        enhancedProducts,
        { net_rate: parsedNetRate, you_save: parsedYouSave, total: parsedTotal, promo_discount: parsedPromoDiscount, additional_discount: parsedAdditionalDiscount }
      );
      pdfPath = pdfResult.pdfPath;
      console.log(`PDF generated`);
    } catch (pdfError) {
      console.error(`Failed: PDF generation failed for order_id ${order_id}: ${pdfError.message}`);
      return res.status(500).json({ message: 'Failed to generate PDF', error: pdfError.message, order_id });
    }

    client = await pool.connect();
    try {
      await client.query('BEGIN');

      const existingBooking = await client.query('SELECT id FROM public.bookings WHERE order_id = $1', [order_id]);
      if (existingBooking.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Order ID already exists', order_id });
      }

      const result = await client.query(`
        INSERT INTO public.bookings 
        (customer_id, order_id, quotation_id, products, net_rate, you_save, total, promo_discount, additional_discount, address, mobile_number, customer_name, email, district, state, customer_type, status, created_at, pdf)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,NOW(),$18)
        RETURNING id, created_at, customer_type, pdf, order_id
      `, [
        customer_id || null,
        order_id,
        quotation_id || null,
        JSON.stringify(enhancedProducts),
        parsedNetRate,
        parsedYouSave,
        parsedTotal,
        parsedPromoDiscount,
        parsedAdditionalDiscount,
        customerDetails.address || null,
        customerDetails.mobile_number || null,
        customerDetails.customer_name || null,
        customerDetails.email || null,
        customerDetails.district || null,
        customerDetails.state || null,
        finalCustomerType,
        'booked',
        pdfPath
      ]);

      console.log(`Booking created`);

      if (quotation_id) {
        const quotationCheck = await client.query(
          'SELECT id FROM public.quotations WHERE quotation_id = $1 AND status = $2',
          [quotation_id, 'pending']
        );
        if (quotationCheck.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ message: 'Quotation not found or not in pending status', order_id });
        }

        await client.query(
          'UPDATE public.quotations SET status = $1, updated_at = NOW() WHERE quotation_id = $2',
          ['booked', quotation_id]
        );
      }

      await client.query('COMMIT');
      res.status(200).json({
        message: 'Booking created successfully',
        order_id: result.rows[0].order_id,
        pdf_path: pdfPath
      });
    } catch (dbError) {
      await client.query('ROLLBACK');
      throw dbError;
    } finally {
      if (client) client.release();
    }
  } catch (err) {
    if (client) {
      await client.query('ROLLBACK');
      client.release();
    }
    console.error(`Failed: Failed to create booking for order_id ${req.body.order_id}: ${err.message}`);
    res.status(500).json({ message: 'Failed to create booking', error: err.message, order_id: req.body.order_id });
  }
};

exports.updateBooking = async (req, res) => {
  try {
    const { order_id } = req.params;
    const { products, net_rate, you_save, total, promo_discount, additional_discount, status, transport_details } = req.body;

    if (!order_id || !/^[a-zA-Z0-9-_]+$/.test(order_id)) 
      return res.status(400).json({ message: 'Invalid or missing Order ID', order_id });
    if (products && (!Array.isArray(products) || products.length === 0)) 
      return res.status(400).json({ message: 'Products array is required and must not be empty', order_id });
    if (total && (isNaN(parseFloat(total)) || parseFloat(total) <= 0)) 
      return res.status(400).json({ message: 'Total must be a positive number', order_id });
    if (status && !['booked', 'paid', 'dispatched', 'canceled'].includes(status)) 
      return res.status(400).json({ message: 'Invalid status', order_id });
    if (status === 'dispatched' && !transport_details) 
      return res.status(400).json({ message: 'Transport details required for dispatched status', order_id });

    const parsedNetRate = net_rate !== undefined ? parseFloat(net_rate) : undefined;
    const parsedYouSave = you_save !== undefined ? parseFloat(you_save) : undefined;
    const parsedPromoDiscount = promo_discount !== undefined ? parseFloat(promo_discount) : undefined;
    const parsedAdditionalDiscount = additional_discount !== undefined ? parseFloat(additional_discount) : undefined;
    const parsedTotal = total !== undefined ? parseFloat(total) : undefined;

    if ([parsedNetRate, parsedYouSave, parsedPromoDiscount, parsedAdditionalDiscount, parsedTotal].some(v => v !== undefined && isNaN(v)))
      return res.status(400).json({ message: 'net_rate, you_save, total, promo_discount, and additional_discount must be valid numbers', order_id });

    const bookingCheck = await pool.query(
      'SELECT * FROM public.bookings WHERE order_id = $1',
      [order_id]
    );
    if (bookingCheck.rows.length === 0) 
      return res.status(404).json({ message: 'Booking not found', order_id });

    const booking = bookingCheck.rows[0];
    let customerDetails = {
      customer_name: booking.customer_name,
      address: booking.address,
      mobile_number: booking.mobile_number,
      email: booking.email,
      district: booking.district,
      state: booking.state
    };
    let agent_name = null;

    if (booking.customer_id) {
      const customerCheck = await pool.query(
        'SELECT customer_name, address, mobile_number, email, district, state, customer_type, agent_id FROM public.customers WHERE id = $1',
        [booking.customer_id]
      );
      if (customerCheck.rows.length > 0) {
        customerDetails = customerCheck.rows[0];
        if (customerDetails.customer_type === 'Customer of Selected Agent' && customerDetails.agent_id) {
          const agentCheck = await pool.query('SELECT customer_name FROM public.customers WHERE id = $1', [customerDetails.agent_id]);
          if (agentCheck.rows.length > 0) agent_name = agentCheck.rows[0].customer_name;
        }
      }
    }

    let enhancedProducts = booking.products;
    if (products) {
      enhancedProducts = [];
      for (const product of products) {
        const { id, product_type, quantity, price, discount } = product;
        if (!id || !product_type || quantity < 1 || isNaN(parseFloat(price)) || isNaN(parseFloat(discount)))
          return res.status(400).json({ message: 'Invalid product entry', order_id });

        const tableName = product_type.toLowerCase().replace(/\s+/g, '_');
        const productCheck = await pool.query(`SELECT per FROM public.${tableName} WHERE id = $1`, [id]);
        if (productCheck.rows.length === 0)
          return res.status(404).json({ message: `Product ${id} of type ${product_type} not found or unavailable`, order_id });
        const per = productCheck.rows[0].per || '';
        enhancedProducts.push({ ...product, per });
      }
    }

    let pdfPath = booking.pdf;
    if (products || parsedTotal !== undefined) {
      const pdfResult = await generatePDF(
        'invoice',
        { order_id, customer_type: booking.customer_type, total: parsedTotal || parseFloat(booking.total || 0), agent_name },
        customerDetails,
        enhancedProducts,
        {
          net_rate: parsedNetRate !== undefined ? parsedNetRate : parseFloat(booking.net_rate || 0),
          you_save: parsedYouSave !== undefined ? parsedYouSave : parseFloat(booking.you_save || 0),
          total: parsedTotal !== undefined ? parsedTotal : parseFloat(booking.total || 0),
          promo_discount: parsedPromoDiscount !== undefined ? parsedPromoDiscount : parseFloat(booking.promo_discount || 0),
          additional_discount: parsedAdditionalDiscount !== undefined ? parsedAdditionalDiscount : parseFloat(booking.additional_discount || 0)
        }
      );
      pdfPath = pdfResult.pdfPath;
      console.log(`PDF regenerated at: ${pdfPath} for order_id: ${order_id}`);
    }

    const updateFields = [];
    const updateValues = [];
    let paramIndex = 1;

    if (products) {
      updateFields.push(`products = $${paramIndex++}`);
      updateValues.push(JSON.stringify(enhancedProducts));
    }
    if (parsedNetRate !== undefined) {
      updateFields.push(`net_rate = $${paramIndex++}`);
      updateValues.push(parsedNetRate);
    }
    if (parsedYouSave !== undefined) {
      updateFields.push(`you_save = $${paramIndex++}`);
      updateValues.push(parsedYouSave);
    }
    if (parsedTotal !== undefined) {
      updateFields.push(`total = $${paramIndex++}`);
      updateValues.push(parsedTotal);
    }
    if (parsedPromoDiscount !== undefined) {
      updateFields.push(`promo_discount = $${paramIndex++}`);
      updateValues.push(parsedPromoDiscount);
    }
    if (parsedAdditionalDiscount !== undefined) {
      updateFields.push(`additional_discount = $${paramIndex++}`);
      updateValues.push(parsedAdditionalDiscount);
    }
    if (pdfPath) {
      updateFields.push(`pdf = $${paramIndex++}`);
      updateValues.push(pdfPath);
    }
    if (status) {
      updateFields.push(`status = $${paramIndex++}`);
      updateValues.push(status);
    }
    if (transport_details) {
      updateFields.push(`transport_details = $${paramIndex++}`);
      updateValues.push(JSON.stringify(transport_details));
    }
    updateFields.push(`updated_at = NOW()`);

    if (updateFields.length === 1) {
      return res.status(400).json({ message: 'No fields to update', order_id });
    }

    const query = `
      UPDATE public.bookings 
      SET ${updateFields.join(', ')}
      WHERE order_id = $${paramIndex}
      RETURNING id, order_id, status
    `;
    updateValues.push(order_id);

    const result = await pool.query(query, updateValues);

    if (!fs.existsSync(pdfPath)) {
      console.error(`Failed: PDF file not found at ${pdfPath} for order_id ${order_id}`);
      return res.status(500).json({ message: 'PDF file not found after update', error: 'File system error', order_id });
    }
    fs.access(pdfPath, fs.constants.R_OK, (err) => {
      if (err) {
        console.error(`Failed: Cannot read PDF file at ${pdfPath} for order_id ${order_id}: ${err.message}`);
        return res.status(500).json({ message: `Cannot read PDF file at ${pdfPath}`, error: err.message, order_id });
      }
      const safeCustomerName = (customerDetails.customer_name || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=${safeCustomerName}-${order_id}-invoice.pdf`);
      const readStream = fs.createReadStream(pdfPath);
      readStream.on('error', (streamErr) => {
        console.error(`Failed: Failed to stream PDF for order_id ${order_id}: ${streamErr.message}`);
        if (!res.headersSent) {
          res.status(500).json({ message: 'Failed to stream PDF', error: streamErr.message, order_id });
        }
      });
      readStream.pipe(res);
      console.log(`PDF streaming initiated for order_id: ${order_id}`);
    });
  } catch (err) {
    console.error(`Failed: Failed to update booking for order_id ${req.params.order_id}: ${err.message}`);
    res.status(500).json({ message: 'Failed to update booking', error: err.message, order_id: req.params.order_id });
  }
};

exports.getInvoice = async (req, res) => {
  const { order_id } = req.params;
  console.log(`getInvoice called with order_id: ${order_id}`);

  if (!order_id || !/^[a-zA-Z0-9-_]+$/.test(order_id)) {
    console.error(`Failed: Invalid order_id received: ${order_id}`);
    return res.status(400).json({ message: 'Invalid or missing order_id', received_order_id: order_id });
  }

  let client;
  try {
    client = await pool.connect();
    const result = await client.query(
      'SELECT pdf, products, net_rate, you_save, total, promo_discount, additional_discount, customer_name, address, mobile_number, email, district, state, customer_type, customer_id, status, created_at FROM public.bookings WHERE order_id = $1',
      [order_id]
    );
    if (result.rows.length === 0) {
      console.error(`Failed: No booking found for order_id: ${order_id}`);
      return res.status(404).json({ message: 'Booking not found', order_id });
    }

    const { pdf, products, net_rate, you_save, total, promo_discount, additional_discount, customer_name, address, mobile_number, email, district, state, customer_type, customer_id, status, created_at } = result.rows[0];
    console.log(`getInvoice: Fetched created_at: ${created_at}`);

    let pdfPath = pdf;
    let agent_name = null;

    if (customer_type === 'Customer of Selected Agent' && customer_id) {
      const customerCheck = await client.query('SELECT agent_id FROM public.customers WHERE id = $1', [customer_id]);
      if (customerCheck.rows.length > 0 && customerCheck.rows[0].agent_id) {
        const agentCheck = await client.query('SELECT customer_name FROM public.customers WHERE id = $1', [customerCheck.rows[0].agent_id]);
        if (agentCheck.rows.length > 0) agent_name = agentCheck.rows[0].customer_name;
      }
    }

    // Validate products
    let parsedProducts;
    try {
      parsedProducts = typeof products === 'string' ? JSON.parse(products) : products;
      if (!Array.isArray(parsedProducts) || parsedProducts.length === 0) {
        throw new Error('Products is not a valid array');
      }
    } catch (err) {
      console.error(`Failed: Invalid products data for order_id ${order_id}: ${err.message}`);
      return res.status(500).json({ message: 'Invalid products data', error: err.message, order_id });
    }

    // Force PDF regeneration for testing
    console.log(`Forcing PDF regeneration for order_id: ${order_id}`);
    let enhancedProducts = [];
    for (const p of parsedProducts) {
      if (!p.per) {
        const tableName = p.product_type?.toLowerCase().replace(/\s+/g, '_');
        if (!tableName) {
          console.error(`Failed: Invalid product_type for product ${p.id} in order_id ${order_id}`);
          return res.status(500).json({ message: 'Invalid product_type in products', order_id });
        }
        const productCheck = await client.query(`SELECT per FROM public.${tableName} WHERE id = $1`, [p.id]);
        const per = productCheck.rows[0]?.per || 'Unit';
        enhancedProducts.push({ ...p, per });
      } else {
        enhancedProducts.push(p);
      }
    }

    let pdfResult;
    try {
      pdfResult = await generatePDF(
        'invoice',
        { order_id, customer_type, total: parseFloat(total || 0), agent_name },
        { customer_name, address, mobile_number, email, district, state, created_at: created_at instanceof Date ? created_at.toISOString() : created_at },
        enhancedProducts,
        { 
          net_rate: parseFloat(net_rate || 0), 
          you_save: parseFloat(you_save || 0), 
          total: parseFloat(total || 0), 
          promo_discount: parseFloat(promo_discount || 0),
          additional_discount: parseFloat(additional_discount || 0)
        }
      );
      pdfPath = pdfResult.pdfPath;
      console.log(`PDF regenerated at: ${pdfPath} for order_id: ${order_id}`);
    } catch (pdfError) {
      console.error(`Failed: PDF generation failed for order_id ${order_id}: ${pdfError.message}`);
      return res.status(500).json({ message: 'Failed to generate PDF', error: pdfError.message, order_id });
    }

    if (!pdfPath) {
      console.error(`Failed: pdfPath is undefined after generation for order_id ${order_id}`);
      return res.status(500).json({ message: 'PDF path is undefined after generation', order_id });
    }

    await client.query(
      'UPDATE public.bookings SET pdf = $1 WHERE order_id = $2',
      [pdfPath, order_id]
    );

    fs.access(pdfPath, fs.constants.R_OK, (err) => {
      if (err) {
        console.error(`Failed: Cannot read PDF file at ${pdfPath} for order_id ${order_id}: ${err.message}`);
        return res.status(500).json({ message: `Cannot read PDF file at ${pdfPath}`, error: err.message, order_id });
      }
      const safeCustomerName = (customer_name || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=${safeCustomerName}-${order_id}-invoice.pdf`);
      const readStream = fs.createReadStream(pdfPath);
      readStream.on('error', (streamErr) => {
        console.error(`Failed: Failed to stream PDF for order_id ${order_id}: ${streamErr.message}`);
        if (!res.headersSent) {
          res.status(500).json({ message: 'Failed to stream PDF', error: streamErr.message, order_id });
        }
      });
      readStream.pipe(res);
      console.log(`PDF streaming initiated for order_id: ${order_id}`);
    });
  } catch (err) {
    console.error(`Failed: Failed to fetch invoice for order_id ${order_id}: ${err.message}`);
    return res.status(500).json({ message: 'Failed to fetch invoice', error: err.message, order_id });
  } finally {
    if (client) client.release();
  }
};

exports.searchBookings = async (req, res) => {
  try {
    const { customer_name, mobile_number } = req.body;

    if (!customer_name || !mobile_number) {
      return res.status(400).json({ message: 'Customer name and mobile number are required' });
    }

    const query = `
      SELECT id, order_id, quotation_id, products, net_rate, you_save, total, 
             promo_discount, customer_name, address, mobile_number, email, district, state, 
             customer_type, status, created_at, pdf, transport_name, lr_number, transport_contact,
             processing_date, dispatch_date, delivery_date
      FROM public.bookings 
      WHERE LOWER(customer_name) LIKE LOWER($1) 
      AND mobile_number LIKE $2
      ORDER BY created_at DESC
    `;

    const result = await pool.query(query, [`%${customer_name}%`, `%${mobile_number}%`]);
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Failed to search bookings:', err.message);
    res.status(500).json({ message: 'Failed to search bookings', error: err.message });
  }
};

exports.searchQuotations = async (req, res) => {
  try {
    const { customer_name, mobile_number } = req.body;

    if (!customer_name || !mobile_number) {
      return res.status(400).json({ message: "Customer name and mobile number are required" });
    }

    const query = `
      SELECT id, quotation_id, products, net_rate, you_save, total, 
             promo_discount, additional_discount, customer_name, address, mobile_number, email, district, state, 
             customer_type, status, created_at, pdf
      FROM public.quotations
      WHERE LOWER(customer_name) LIKE LOWER($1) 
      AND mobile_number LIKE $2
      ORDER BY created_at DESC
    `;

    const result = await pool.query(query, [`%${customer_name}%`, `%${mobile_number}%`]);
    
    const quotations = result.rows.map(row => ({
      ...row,
      type: 'quotation',
      transport_name: null,
      lr_number: null,
      transport_contact: null,
      dispatch_date: null,
      delivery_date: null,
    }));

    res.status(200).json(quotations);
  } catch (err) {
    res.status(500).json({ message: "Failed to search quotations", error: err.message });
  }
};

exports.exportQuotationsToExcel = async (req, res) => {
  let client;
  try {
    client = await pool.connect();

    const result = await client.query(`
      SELECT
        quotation_id,
        customer_name,
        customer_type,
        customer_id,
        total,
        created_at
      FROM public.quotations
      ORDER BY created_at DESC
    `);

    const quotations = result.rows;

    // Group by customer_type
    const grouped = quotations.reduce((acc, q) => {
      let type = q.customer_type?.trim() || "User";
      if (type === "Customer of Selected Agent") type = "Customer of Selected Agent";
      if (!acc[type]) acc[type] = [];
      acc[type].push(q);
      return acc;
    }, {});

    const workbook = XLSX.utils.book_new();

    const sheetConfig = [
      { type: "User", name: "User_Quotations" },
      { type: "Customer", name: "Customer_Quotations" },
      { type: "Agent", name: "Agent_Quotations" },
      { type: "Customer of Selected Agent", name: "Cust_of_Agent" },
    ];

    for (const { type, name } of sheetConfig) {
      let data = grouped[type] || [];
      if (data.length === 0) continue;

      // Fetch Agent Name only for "Customer of Selected Agent"
      if (type === "Customer of Selected Agent") {
        for (let q of data) {
          if (q.customer_id) {
            try {
              const agentRes = await client.query(`
                SELECT c2.customer_name AS agent_name
                FROM public.customers c1
                INNER JOIN public.customers c2 ON c1.agent_id = c2.id
                WHERE c1.id = $1
              `, [q.customer_id]);
              q.agent_name = agentRes.rows[0]?.agent_name || "N/A";
            } catch (err) {
              q.agent_name = "Error";
            }
          } else {
            q.agent_name = "N/A";
          }
        }
      }

      const rows = data.map(q => ({
        "Quotation ID": q.quotation_id || "N/A",
        "Customer Name": q.customer_name || "N/A",
        "Customer Type": q.customer_type || "User",
        "Total Amount": q.total ? `₹${Math.round(Number(q.total))}` : "₹0",
        "Date": q.created_at ? new Date(q.created_at).toLocaleDateString('en-GB') : "N/A",
        ...(type === "Customer of Selected Agent" ? { "Agent Name": q.agent_name || "N/A" } : {})
      }));

      const worksheet = XLSX.utils.json_to_sheet(rows);
      const colWidths = rows.reduce((acc, row) => {
        Object.keys(row).forEach((key, i) => {
          const len = (row[key] || "").toString().length;
          acc[i] = Math.max(acc[i] || 10, len + 4);
        });
        return acc;
      }, []);
      worksheet["!cols"] = colWidths.map(w => ({ wch: w }));

      const safeName = name.replace(/[*?:/\\[\]]/g, "_").substring(0, 31);
      XLSX.utils.book_append_sheet(workbook, worksheet, safeName);
    }

    try {
      console.log("Generating Agent-wise Product Quotation Sheets...");

      // Fetch all quotations under "Customer of Selected Agent" with agent_name joined
      const agentQuotationsResult = await client.query(`
        SELECT q.products, q.customer_id, c2.customer_name AS agent_name
        FROM public.quotations q
        INNER JOIN public.customers c ON q.customer_id = c.id
        INNER JOIN public.customers c2 ON c.agent_id::bigint = c2.id
        WHERE c.customer_type = 'Customer of Selected Agent'
          AND c.agent_id IS NOT NULL
          AND q.products IS NOT NULL
      `);

      // Aggregate: Agent → Product → Total Quantity
      const agentProductTotals = {};

      for (const row of agentQuotationsResult.rows) {
        const agentName = row.agent_name || "Unknown Agent";
        if (!agentProductTotals[agentName]) agentProductTotals[agentName] = {};

        let products = [];
        try {
          products = typeof row.products === 'string' ? JSON.parse(row.products) : row.products;
        } catch (e) {
          continue;
        }

        products.forEach(p => {
          const name = (p.productname || "Unknown Product").trim();
          const qty = parseInt(p.quantity) || 0;
          agentProductTotals[agentName][name] = (agentProductTotals[agentName][name] || 0) + qty;
        });
      }

      // Create one sheet per agent
      for (const [agentName, productMap] of Object.entries(agentProductTotals)) {
        const rows = Object.entries(productMap)
          .map(([productName, totalQty]) => ({
            "Product Name": productName,
            "Total Quoted Quantity": totalQty
          }))
          .sort((a, b) => b["Total Quoted Quantity"] - a["Total Quoted Quantity"]);

        if (rows.length === 0) continue;

        const worksheet = XLSX.utils.json_to_sheet(rows);

        // Auto-size columns
        worksheet["!cols"] = [
          { wch: 45 },
          { wch: 20 }
        ];

        // Safe sheet name
        let baseName = agentName.replace(/[*?:/\\[\]]/g, "_").substring(0, 28);
        if (baseName.length < 3) baseName = "Agent";
        let sheetName = baseName;
        let counter = 1;
        while (workbook.SheetNames.includes(sheetName)) {
          sheetName = baseName.substring(0, 31 - `_${counter}`.length) + `_${counter}`;
          counter++;
        }

        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
      }

      // Optional: Add "All Agents Combined" Summary Sheet
      const allAgentProducts = {};
      for (const productMap of Object.values(agentProductTotals)) {
        for (const [name, qty] of Object.entries(productMap)) {
          allAgentProducts[name] = (allAgentProducts[name] || 0) + qty;
        }
      }

      if (Object.keys(allAgentProducts).length > 0) {
        const allRows = Object.entries(allAgentProducts)
          .map(([name, qty]) => ({
            "Product Name": name,
            "Total Quoted (All Agents)": qty
          }))
          .sort((a, b) => b["Total Quoted (All Agents)"] - a["Total Quoted (All Agents)"]);

        const allWs = XLSX.utils.json_to_sheet(allRows);
        allWs["!cols"] = [{ wch: 50 }, { wch: 25 }];
        XLSX.utils.book_append_sheet(workbook, allWs, "All_Agents_Products");
      }
    } catch (agentErr) {
      console.error("Agent product sheets failed (continuing export):", agentErr.message);
      // Non-critical error — continue
    }

    const fileName = `PhoenixCrackers_Export_${new Date().toISOString().slice(0,10)}.xlsx`;
    const filePath = path.join(__dirname, '../exports', fileName);

    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    XLSX.writeFile(workbook, filePath);

    res.download(filePath, fileName, (err) => {
      if (err) {
        console.error("Download failed:");
        if (!res.headersSent) res.status(500).send("Failed to download file");
      } else {
        console.log(`Exported successfully: ${fileName}`);
      }
    });

  } catch (err) {
    console.error("Export failed completely:");
    if (!res.headersSent) {
      res.status(500).json({
        message: "Export failed",
        error: err.message
      });
    }
  } finally {
    if (client) client.release();
  }
};