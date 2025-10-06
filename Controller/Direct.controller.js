const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const PDFDocument = require('pdfkit');

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
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      
      // Ensure customer_name and ID are valid
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

      // Header
      doc.fontSize(20).font('Helvetica-Bold').text(type === 'quotation' ? 'Quotation' : 'Estimate Bill', 50, 50, { align: 'center' });
      doc.fontSize(12).font('Helvetica')
        .text('Madhu Nisha Crackers', 50, 80)
        .text('Sivakasi', 50, 95)
        .text('Mobile: +91 94875 24689', 50, 110)
        .text('Email: madhunishacrackers@gmail.com', 50, 125);

      // Customer Details
      const customerType = data.customer_type || 'User';
      let addressLine1 = customerDetails.address || 'N/A';
      let addressLine2 = '';
      if (addressLine1.length > 30) {
        const splitIndex = addressLine1.lastIndexOf(' ', 30);
        addressLine2 = addressLine1.slice(splitIndex + 1);
        addressLine1 = addressLine1.slice(0, splitIndex);
      }

      let y = 80;
      const lineHeight = 15;
      let formattedDate = 'N/A';
      if (customerDetails.created_at) {
        try {
          const date = customerDetails.created_at instanceof Date 
            ? customerDetails.created_at 
            : new Date(customerDetails.created_at);
          if (!isNaN(date.getTime())) {
            formattedDate = date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
          } else {
            console.warn(`generatePDF: Invalid date format for created_at: ${customerDetails.created_at}`);
          }
        } catch (err) {
          console.error(`generatePDF: Error parsing created_at: ${err.message}`);
        }
      } else {
        console.warn('generatePDF: created_at is undefined or null');
      }

      doc.fontSize(12).font('Helvetica')
        .text(`${type === 'quotation' ? 'Quotation ID' : 'Order ID'}: ${id}`, 280, y, { align: 'right' })
        .text(`Date: ${formattedDate}`, 280, y + lineHeight, { align: 'right' })
        .text(`Customer: ${customerDetails.customer_name || 'N/A'}`, 280, y + 2 * lineHeight, { align: 'right' })
        .text(`Contact: ${customerDetails.mobile_number || 'N/A'}`, 280, y + 3 * lineHeight, { align: 'right' })
        .text(`Address: ${addressLine1}`, 280, y + 4 * lineHeight, { align: 'right' });
      y += 4 * lineHeight;
      if (addressLine2) {
        doc.text(addressLine2, 280, y + lineHeight, { align: 'right' });
        y += lineHeight;
      }
      doc.text(`District: ${customerDetails.district || 'N/A'}`, 280, y + lineHeight, { align: 'right' });
      y += lineHeight;
      doc.text(`State: ${customerDetails.state || 'N/A'}`, 280, y + lineHeight, { align: 'right' });
      y += lineHeight;
      doc.text(`Customer Type: ${customerType}`, 280, y + lineHeight, { align: 'right' });
      y += lineHeight;
      if (data.agent_name) {
        doc.text(`Agent: ${data.agent_name}`, 280, y + lineHeight, { align: 'right' });
        y += lineHeight;
      }

      // Calculate table starting position
      const companyDetailsBottom = 125;
      const customerDetailsBottom = y + lineHeight;
      const tableY = Math.max(companyDetailsBottom, customerDetailsBottom) + 40;
      const tableWidth = 500;
      const colWidths = [30, 150, 50, 70, 70, 50, 100];
      const colX = [50, 80, 210, 250, 320, 400, 450];
      const rowHeight = 25;
      const pageHeight = doc.page.height - doc.page.margins.bottom;

      let tableRowY = tableY;

      // Check if table header fits on the current page
      if (tableRowY + 50 > pageHeight - 50) {
        doc.addPage();
        tableRowY = doc.page.margins.top;
      }

      const discountedProducts = products.filter(p => parseFloat(p.discount || 0) > 0);
      const netRateProducts = products.filter(p => !p.discount || parseFloat(p.discount) === 0);

      // Primary Table (Discounted Products)
      if (discountedProducts.length > 0) {
        doc.fontSize(12).font('Helvetica-Bold').text('DISCOUNTED PRODUCTS', 50, tableRowY);
        tableRowY += 20;
        doc.moveTo(50, tableRowY - 5).lineTo(50 + tableWidth, tableRowY - 5).stroke();
        doc.fontSize(10).font('Helvetica-Bold')
          .text('Sl.N', colX[0] + 5, tableRowY, { width: colWidths[0] - 10, align: 'center' })
          .text('Product', colX[1] + 5, tableRowY, { width: colWidths[1] - 10, align: 'left' })
          .text('Qty', colX[2] + 5, tableRowY, { width: colWidths[2] - 10, align: 'center' })
          .text('Rate', colX[3] + 5, tableRowY, { width: colWidths[3] - 10, align: 'left' })
          .text('Disc Rate', colX[4] + 5, tableRowY, { width: colWidths[4] - 10, align: 'left' })
          .text('Per', colX[5] + 5, tableRowY, { width: colWidths[5] - 10, align: 'center' })
          .text('Total', colX[6] + 5, tableRowY, { width: colWidths[6] - 10, align: 'left' });
        doc.moveTo(50, tableRowY + 15).lineTo(50 + tableWidth, tableRowY + 15).stroke();
        colX.forEach((x, i) => {
          doc.moveTo(x, tableRowY - 5).lineTo(x, tableRowY + 15).stroke();
          if (i === colX.length - 1) {
            doc.moveTo(x + colWidths[i], tableRowY - 5).lineTo(x + colWidths[i], tableRowY + 15).stroke();
          }
        });

        tableRowY += rowHeight;
        discountedProducts.forEach((product, index) => {
          if (tableRowY + rowHeight > pageHeight - 50) {
            doc.addPage();
            tableRowY = doc.page.margins.top;
            doc.fontSize(12).font('Helvetica-Bold').text('DISCOUNTED PRODUCTS (Continued)', 50, tableRowY);
            tableRowY += 20;
            doc.moveTo(50, tableRowY - 5).lineTo(50 + tableWidth, tableRowY - 5).stroke();
            doc.fontSize(10).font('Helvetica-Bold')
              .text('Sl.N', colX[0] + 5, tableRowY, { width: colWidths[0] - 10, align: 'center' })
              .text('Product', colX[1] + 5, tableRowY, { width: colWidths[1] - 10, align: 'left' })
              .text('Qty', colX[2] + 5, tableRowY, { width: colWidths[2] - 10, align: 'center' })
              .text('Rate', colX[3] + 5, tableRowY, { width: colWidths[3] - 10, align: 'left' })
              .text('Disc Rate', colX[4] + 5, tableRowY, { width: colWidths[4] - 10, align: 'left' })
              .text('Per', colX[5] + 5, tableRowY, { width: colWidths[5] - 10, align: 'center' })
              .text('Total', colX[6] + 5, tableRowY, { width: colWidths[6] - 10, align: 'left' });
            doc.moveTo(50, tableRowY + 15).lineTo(50 + tableWidth, tableRowY + 15).stroke();
            colX.forEach((x, i) => {
              doc.moveTo(x, tableRowY - 5).lineTo(x, tableRowY + 15).stroke();
              if (i === colX.length - 1) {
                doc.moveTo(x + colWidths[i], tableRowY - 5).lineTo(x + colWidths[i], tableRowY + 15).stroke();
              }
            });
            tableRowY += rowHeight;
          }

          const price = parseFloat(product.price) || 0;
          const discount = parseFloat(product.discount || 0) || 0;
          const discRate = price - (price * discount / 100);
          const productTotal = discRate * (product.quantity || 1);

          let productName = product.productname || 'N/A';
          if (productName.length > 30) {
            productName = productName.substring(0, 27) + '...';
          }

          doc.font('Helvetica')
            .text(index + 1, colX[0] + 5, tableRowY, { width: colWidths[0] - 10, align: 'center' })
            .text(productName, colX[1] + 5, tableRowY, { width: colWidths[1] - 10, align: 'left' })
            .text(product.quantity || 1, colX[2] + 5, tableRowY, { width: colWidths[2] - 10, align: 'center' })
            .text(`Rs.${price.toFixed(2)}`, colX[3] + 5, tableRowY, { width: colWidths[3] - 10, align: 'left' })
            .text(`Rs.${discRate.toFixed(2)}`, colX[4] + 5, tableRowY, { width: colWidths[4] - 10, align: 'left' })
            .text(product.per || 'N/A', colX[5] + 5, tableRowY, { width: colWidths[5] - 10, align: 'center' })
            .text(`Rs.${productTotal.toFixed(2)}`, colX[6] + 5, tableRowY, { width: colWidths[6] - 10, align: 'left' });

          doc.moveTo(50, tableRowY + 15).lineTo(50 + tableWidth, tableRowY + 15).stroke();
          colX.forEach((x, i) => {
            doc.moveTo(x, tableRowY - 5).lineTo(x, tableRowY + 15).stroke();
            if (i === colX.length - 1) {
              doc.moveTo(x + colWidths[i], tableRowY - 5).lineTo(x + colWidths[i], tableRowY + 15).stroke();
            }
          });

          tableRowY += rowHeight;
        });
      }

      // Secondary Table (Net Rate Products)
      if (netRateProducts.length > 0) {
        tableRowY += 30;
        if (tableRowY + 50 > pageHeight - 50) {
          doc.addPage();
          tableRowY = doc.page.margins.top;
        }

        doc.fontSize(12).font('Helvetica-Bold').text('NET RATE PRODUCTS', 50, tableRowY);
        tableRowY += 20;
        doc.moveTo(50, tableRowY - 5).lineTo(50 + tableWidth, tableRowY - 5).stroke();
        doc.fontSize(10).font('Helvetica-Bold')
          .text('Sl.N', colX[0] + 5, tableRowY, { width: colWidths[0] - 10, align: 'center' })
          .text('Product', colX[1] + 5, tableRowY, { width: colWidths[1] - 10, align: 'left' })
          .text('Qty', colX[2] + 5, tableRowY, { width: colWidths[2] - 10, align: 'center' })
          .text('Rate', colX[3] + 5, tableRowY, { width: colWidths[3] - 10, align: 'left' })
          .text('Disc Rate', colX[4] + 5, tableRowY, { width: colWidths[4] - 10, align: 'left' })
          .text('Per', colX[5] + 5, tableRowY, { width: colWidths[5] - 10, align: 'center' })
          .text('Total', colX[6] + 5, tableRowY, { width: colWidths[6] - 10, align: 'left' });
        doc.moveTo(50, tableRowY + 15).lineTo(50 + tableWidth, tableRowY + 15).stroke();
        colX.forEach((x, i) => {
          doc.moveTo(x, tableRowY - 5).lineTo(x, tableRowY + 15).stroke();
          if (i === colX.length - 1) {
            doc.moveTo(x + colWidths[i], tableRowY - 5).lineTo(x + colWidths[i], tableRowY + 15).stroke();
          }
        });

        tableRowY += rowHeight;
        netRateProducts.forEach((product, index) => {
          if (tableRowY + rowHeight > pageHeight - 50) {
            doc.addPage();
            tableRowY = doc.page.margins.top;
            doc.fontSize(12).font('Helvetica-Bold').text('NET RATE PRODUCTS (Continued)', 50, tableRowY);
            tableRowY += 20;
            doc.moveTo(50, tableRowY - 5).lineTo(50 + tableWidth, tableRowY - 5).stroke();
            doc.fontSize(10).font('Helvetica-Bold')
              .text('Sl.N', colX[0] + 5, tableRowY, { width: colWidths[0] - 10, align: 'center' })
              .text('Product', colX[1] + 5, tableRowY, { width: colWidths[1] - 10, align: 'left' })
              .text('Qty', colX[2] + 5, tableRowY, { width: colWidths[2] - 10, align: 'center' })
              .text('Rate', colX[3] + 5, tableRowY, { width: colWidths[3] - 10, align: 'left' })
              .text('Disc Rate', colX[4] + 5, tableRowY, { width: colWidths[4] - 10, align: 'left' })
              .text('Per', colX[5] + 5, tableRowY, { width: colWidths[5] - 10, align: 'center' })
              .text('Total', colX[6] + 5, tableRowY, { width: colWidths[6] - 10, align: 'left' });
            doc.moveTo(50, tableRowY + 15).lineTo(50 + tableWidth, tableRowY + 15).stroke();
            colX.forEach((x, i) => {
              doc.moveTo(x, tableRowY - 5).lineTo(x, tableRowY + 15).stroke();
              if (i === colX.length - 1) {
                doc.moveTo(x + colWidths[i], tableRowY - 5).lineTo(x + colWidths[i], tableRowY + 15).stroke();
              }
            });
            tableRowY += rowHeight;
          }

          const price = parseFloat(product.price) || 0;
          const discount = parseFloat(product.discount || 0) || 0;
          const discRate = price - (price * discount / 100);
          const productTotal = discRate * (product.quantity || 1);

          let productName = product.productname || 'N/A';
          if (productName.length > 30) {
            productName = productName.substring(0, 27) + '...';
          }

          doc.font('Helvetica')
            .text(index + 1, colX[0] + 5, tableRowY, { width: colWidths[0] - 10, align: 'center' })
            .text(productName, colX[1] + 5, tableRowY, { width: colWidths[1] - 10, align: 'left' })
            .text(product.quantity || 1, colX[2] + 5, tableRowY, { width: colWidths[2] - 10, align: 'center' })
            .text(`Rs.${price.toFixed(2)}`, colX[3] + 5, tableRowY, { width: colWidths[3] - 10, align: 'left' })
            .text(`Rs.${discRate.toFixed(2)}`, colX[4] + 5, tableRowY, { width: colWidths[4] - 10, align: 'left' })
            .text(product.per || 'N/A', colX[5] + 5, tableRowY, { width: colWidths[5] - 10, align: 'center' })
            .text(`Rs.${productTotal.toFixed(2)}`, colX[6] + 5, tableRowY, { width: colWidths[6] - 10, align: 'left' });

          doc.moveTo(50, tableRowY + 15).lineTo(50 + tableWidth, tableRowY + 15).stroke();
          colX.forEach((x, i) => {
            doc.moveTo(x, tableRowY - 5).lineTo(x, tableRowY + 15).stroke();
            if (i === colX.length - 1) {
              doc.moveTo(x + colWidths[i], tableRowY - 5).lineTo(x + colWidths[i], tableRowY + 15).stroke();
            }
          });

          tableRowY += rowHeight;
        });
      }

      // Totals Section
      tableRowY += 30;
      if (tableRowY + 120 > pageHeight - 50) {
        doc.addPage();
        tableRowY = doc.page.margins.top;
      }

      const netRate = parseFloat(dbValues.net_rate) || 0;
      const youSave = parseFloat(dbValues.you_save) || 0;
      const additionalDiscount = parseFloat(dbValues.additional_discount) || 0;
      const subtotal = netRate - youSave;
      const additionalDiscountAmount = subtotal * (additionalDiscount / 100);
      const discountedSubtotal = subtotal - additionalDiscountAmount;
      const processingFee = parseFloat(dbValues.processing_fee) || (discountedSubtotal * 0.03);
      const total = parseFloat(dbValues.total) || (discountedSubtotal + processingFee);

      doc.fontSize(10).font('Helvetica-Bold')
        .text(`Net Rate: Rs.${netRate.toFixed(2)}`, 350, tableRowY, { width: 150, align: 'right' });
      tableRowY += 20;
      doc.text(`Discount: Rs.${youSave.toFixed(2)}`, 350, tableRowY, { width: 150, align: 'right' });
      if (additionalDiscount > 0) {
        tableRowY += 20;
        doc.text(`Extra Discount: Rs.${additionalDiscountAmount.toFixed(2)}`, 350, tableRowY, { width: 150, align: 'right' });
      }
      tableRowY += 20;
      doc.text(`Processing Fee: Rs.${processingFee.toFixed(2)}`, 350, tableRowY, { width: 150, align: 'right' });
      tableRowY += 20;
      doc.text(`Total: Rs.${total.toFixed(2)}`, 350, tableRowY, { width: 150, align: 'right' });

      // Footer
      if (tableRowY + 50 > pageHeight - 50) {
        doc.addPage();
        tableRowY = doc.page.margins.top;
      }
      doc.fontSize(10).font('Helvetica')
        .text('Thank you for your business!', 50, tableRowY + 30, { align: 'center' })
        .text('Madhu Nisha Crackers, Sivakasi', 50, tableRowY + 45, { align: 'center' });

      doc.end();

      stream.on('finish', () => {
        if (!fs.existsSync(pdfPath)) {
          console.error(`PDF file not found at ${pdfPath} for ${type}_id ${id}`);
          reject(new Error(`PDF file not found at ${pdfPath} for ${type}_id ${id}`));
          return;
        }
        console.log(`PDF generated at: ${pdfPath} for ${type}_id: ${id}`);
        resolve({ pdfPath }); // Ensure consistent return format
      });

      stream.on('error', (err) => {
        console.error(`Stream error for ${type}_id ${id}: ${err.message}`);
        reject(new Error(`Stream error: ${err.message}`));
      });
    } catch (err) {
      console.error(`PDF generation failed for ${type}_id ${data.order_id || data.quotation_id}: ${err.message}`);
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