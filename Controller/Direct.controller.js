const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const PDFDocument = require('pdfkit');
const nodemailer = require('nodemailer');

const pool = new Pool({
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  host: process.env.PGHOST,
  port: process.env.PGPORT,
  database: process.env.PGDATABASE,
});

const ACCESS_TOKEN = 'EAAKZAUdN55kEBPCVvsNNZBMg38VsJsBcpEIYNnYqTitiZAUOBu0DHZC326LV4QslYX00y1oOnCMF0V1JzJLeJRIlKBbGpZA994coQ1ALIJq0DC4Xugmo8r0GhRvdsxJgHmduoG4fYcmidjBb55TQR50ncqktQMM7Ked1g4vOa2Dj9d5HGgXFEVMQYZA6ieDkBGPZCLW3lhFSvjDCL1eR9BRvz3UJJkYnggAGuT47ZB2AzRAZD';
const PHONE_NUMBER_ID = '660922473779560';

const generatePDF = (type, data, customerDetails, products, dbValues) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const safeCustomerName = (customerDetails.customer_name || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
      const pdfDir = path.join(__dirname, '../pdf_data');
      if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true });
      const pdfPath = path.join(pdfDir, `${safeCustomerName}-${data.order_id || data.quotation_id}-${type}.pdf`);
      const stream = fs.createWriteStream(pdfPath);
      doc.pipe(stream);

      // Header
      doc.fontSize(20).font('Helvetica-Bold').text(type === 'quotation' ? 'Quotation' : 'Estimate Bill', 50, 50, { align: 'center' });
      doc.fontSize(12).font('Helvetica')
        .text('Madhu Nisha Crackers', 50, 80)
        .text('Sivakasi', 50, 95)
        .text('Mobile: +91 94875 24689', 50, 110)
        .text('Email: madhunishacrackers@gmail.com', 50, 125);

      // Customer Details
      const customerType = data.customer_type === 'Customer of Selected Agent' ? 'Customer - Agent' : data.customer_type || 'User';
      let addressLine1 = customerDetails.address || 'N/A';
      let addressLine2 = '';
      if (addressLine1.length > 30) {
        const splitIndex = addressLine1.lastIndexOf(' ', 30);
        addressLine2 = addressLine1.slice(splitIndex + 1);
        addressLine1 = addressLine1.slice(0, splitIndex);
      }

      let y = 80; // Starting Y-coordinate for customer details
      const lineHeight = 15; // Standard line height for consistent spacing

      doc.fontSize(12).font('Helvetica')
        .text(`${type === 'quotation' ? 'Quotation ID' : 'Order ID'}: ${data.quotation_id || data.order_id}`, 280, y, { align: 'right' });
      y += lineHeight;
      doc.text(`Date: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}`, 280, y, { align: 'right' });
      y += lineHeight;
      doc.text(`Customer: ${customerDetails.customer_name || 'N/A'}`, 280, y, { align: 'right' });
      y += lineHeight;
      doc.text(`Contact: ${customerDetails.mobile_number || 'N/A'}`, 280, y, { align: 'right' });
      y += lineHeight;
      doc.text(`Address: ${addressLine1}`, 280, y, { align: 'right' });
      if (addressLine2) {
        y += lineHeight;
        doc.text(addressLine2, 280, y, { align: 'right' });
      }
      y += lineHeight;
      doc.text(`District: ${customerDetails.district || 'N/A'}`, 280, y, { align: 'right' });
      y += lineHeight;
      doc.text(`State: ${customerDetails.state || 'N/A'}`, 280, y, { align: 'right' });
      y += lineHeight;
      doc.text(`Customer Type: ${customerType}`, 280, y, { align: 'right' });
      if (data.agent_name) {
        y += lineHeight;
        doc.text(`Agent: ${data.agent_name}`, 280, y, { align: 'right' });
      }

      // Table Setup
      const tableY = y + 30; // Adjust table start based on dynamic y
      const tableWidth = 500;
      const colWidths = [50, 150, 100, 100, 100];
      const colX = [50, 100, 250, 350, 450];
      const rowHeight = 25;
      const pageHeight = doc.page.height - doc.page.margins.bottom;

      // Table Header
      doc.moveTo(50, tableY - 5).lineTo(50 + tableWidth, tableY - 5).stroke();
      doc.fontSize(10).font('Helvetica-Bold')
        .text('Sl.No', colX[0] + 5, tableY, { width: colWidths[0] - 10, align: 'center' })
        .text('Product', colX[1] + 5, tableY, { width: colWidths[1] - 10, align: 'left' })
        .text('Quantity', colX[2] + 5, tableY, { width: colWidths[2] - 10, align: 'center' })
        .text('Price', colX[3] + 5, tableY, { width: colWidths[3] - 10, align: 'right' })
        .text('Total', colX[4] + 5, tableY, { width: colWidths[4] - 10, align: 'right' });
      doc.moveTo(50, tableY + 15).lineTo(50 + tableWidth, tableY + 15).stroke();
      colX.forEach((x, i) => {
        doc.moveTo(x, tableY - 5).lineTo(x, tableY + 15).stroke();
        if (i === colX.length - 1) {
          doc.moveTo(x + colWidths[i], tableY - 5).lineTo(x + colWidths[i], tableY + 15).stroke();
        }
      });

      // Table Rows
      let tableRowY = tableY + rowHeight;
      products.forEach((product, index) => {
        if (tableRowY + rowHeight > pageHeight - 50) {
          doc.addPage();
          tableRowY = doc.page.margins.top + 20;
          doc.moveTo(50, tableRowY - 5).lineTo(50 + tableWidth, tableRowY - 5).stroke();
          doc.fontSize(10).font('Helvetica-Bold')
            .text('Sl.No', colX[0] + 5, tableRowY, { width: colWidths[0] - 10, align: 'center' })
            .text('Product', colX[1] + 5, tableRowY, { width: colWidths[1] - 10, align: 'left' })
            .text('Quantity', colX[2] + 5, tableRowY, { width: colWidths[2] - 10, align: 'center' })
            .text('Price', colX[3] + 5, tableRowY, { width: colWidths[3] - 10, align: 'right' })
            .text('Total', colX[4] + 5, tableRowY, { width: colWidths[4] - 10, align: 'right' });
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
        const productTotal = (price - (price * discount / 100)) * (product.quantity || 1);

        let productName = product.productname || 'N/A';
        if (productName.length > 30) {
          productName = productName.substring(0, 27) + '...';
        }

        doc.font('Helvetica')
          .text(index + 1, colX[0] + 5, tableRowY, { width: colWidths[0] - 10, align: 'center' })
          .text(productName, colX[1] + 5, tableRowY, { width: colWidths[1] - 10, align: 'left' })
          .text(product.quantity || 1, colX[2] + 5, tableRowY, { width: colWidths[2] - 10, align: 'center' })
          .text(`Rs.${price.toFixed(2)}`, colX[3] + 5, tableRowY, { width: colWidths[3] - 10, align: 'right' })
          .text(`Rs.${productTotal.toFixed(2)}`, colX[4] + 5, tableRowY, { width: colWidths[4] - 10, align: 'right' });

        doc.moveTo(50, tableRowY + 15).lineTo(50 + tableWidth, tableRowY + 15).stroke();
        colX.forEach((x, i) => {
          doc.moveTo(x, tableRowY - 5).lineTo(x, tableRowY + 15).stroke();
          if (i === colX.length - 1) {
            doc.moveTo(x + colWidths[i], tableRowY - 5).lineTo(x + colWidths[i], tableRowY + 15).stroke();
          }
        });

        tableRowY += rowHeight;
      });

      // Totals Section
      tableRowY += 10;
      if (tableRowY + 110 > pageHeight - 50) {
        doc.addPage();
        tableRowY = doc.page.margins.top + 20;
      }

      const netRate = parseFloat(dbValues.net_rate) || 0;
      const youSave = parseFloat(dbValues.you_save) || 0;
      const processingFee = parseFloat(dbValues.processing_fee) || ((netRate - youSave) * 0.03);
      const total = parseFloat(dbValues.total) || 0;

      doc.fontSize(10).font('Helvetica-Bold')
        .text(`Net Rate: Rs.${netRate.toFixed(2)}`, 400, tableRowY, { width: 150, align: 'right' });
      tableRowY += 20;
      doc.text(`Discount: Rs.${youSave.toFixed(2)}`, 400, tableRowY, { width: 150, align: 'right' });
      tableRowY += 20;
      doc.text(`Processing Fee: Rs.${processingFee.toFixed(2)}`, 400, tableRowY, { width: 150, align: 'right' });
      tableRowY += 20;
      doc.text(`Total: Rs.${total.toFixed(2)}`, 400, tableRowY, { width: 150, align: 'right' });

      // Footer
      tableRowY += 30;
      if (tableRowY + 50 > pageHeight - 50) {
        doc.addPage();
        tableRowY = doc.page.margins.top + 20;
      }
      doc.fontSize(10).font('Helvetica')
        .text('Thank you for your business!', 50, tableRowY, { align: 'center' })
        .text('For any queries, contact us at +91 94875 94689', 50, tableRowY + 15, { align: 'center' });

      doc.end();
      stream.on('finish', () => {
        console.log(`PDF generated successfully: ${pdfPath}`);
        resolve({ pdfPath, calculatedTotal: total });
      });
      stream.on('error', (err) => {
        console.error(`PDF generation failed for ${pdfPath}:`, err.message);
        reject(err);
      });
    } catch (err) {
      console.error(`Error in generatePDF for ${type} ${data.quotation_id || data.order_id}:`, err.message);
      reject(err);
    }
  });
};

async function uploadPDF(pdfPath) {
  try {
    if (!fs.existsSync(pdfPath)) {
      console.error(`PDF file does not exist: ${pdfPath}`);
      throw new Error('PDF file does not exist');
    }
    const form = new FormData();
    form.append('file', fs.createReadStream(pdfPath));
    form.append('type', 'application/pdf');
    form.append('messaging_product', 'whatsapp');
    const res = await axios.post(
      `https://graph.facebook.com/v17.0/${PHONE_NUMBER_ID}/media`,
      form,
      { headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, ...form.getHeaders() } }
    );
    console.log(`PDF uploaded successfully, media ID: ${res.data.id}`);
    return res.data.id;
  } catch (err) {
    console.error('Failed to upload PDF:', err.message);
    throw err;
  }
}

async function sendTemplateWithPDF(mediaId, total, customerDetails, type) {
  try {
    let recipientNumber = customerDetails.mobile_number || '';
    recipientNumber = recipientNumber.replace(/\D/g, '');
    if (!recipientNumber.startsWith('+')) {
      if (recipientNumber.length === 10) {
        recipientNumber = `+91${recipientNumber}`;
      } else if (recipientNumber.length === 12 && recipientNumber.startsWith('91')) {
        recipientNumber = `+${recipientNumber}`;
      } else {
        throw new Error('Invalid mobile number format');
      }
    }
    const payload = {
      messaging_product: 'whatsapp',
      to: recipientNumber,
      type: 'template',
      template: {
        name: type === 'quotation' ? 'quotation_receipt_1' : 'purchase_receipt_1',
        language: { code: 'en_US' },
        components: [
          {
            type: 'header',
            parameters: [{ type: 'document', document: { id: mediaId, filename: `${type}.pdf` } }],
          },
          {
            type: 'body',
            parameters: [
              { type: 'text', text: `Rs.${parseFloat(total || 0).toFixed(2)}` },
              { type: 'text', text: 'Phoenix Crackers, Anil Kumar Eye Hospital Opp, Sattur Road, Sivakasi' },
              { type: 'text', text: type },
            ],
          },
        ],
      },
    };
    await axios.post(
      `https://graph.facebook.com/v17.0/${PHONE_NUMBER_ID}/messages`,
      payload,
      { headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' } }
    );
    console.log(`WhatsApp template sent successfully to ${recipientNumber}`);
  } catch (err) {
    console.error('Failed to send WhatsApp template:', err.message);
    throw err;
  }
}

async function sendBookingEmail(toEmail, bookingData, customerDetails, pdfPath, products, type) {
  try {
    if (!fs.existsSync(pdfPath)) {
      console.error(`PDF file does not exist for email: ${pdfPath}`);
      throw new Error('PDF file does not exist for email');
    }
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: 'madhunishapyrotechsivakasi@gmail.com',
        pass: 'bhgf kqog gmfz oqfl'
      }
    });

    const productList = products.map(p =>
      `- ${p.productname || 'N/A'}: ${p.quantity || 1} x Rs.${parseFloat(p.price || 0).toFixed(2)}`
    ).join('\n');

    const mailOptions = {
      from: '"Madhu Nisha Crackers" <madhunishapyrotechsivakasi@gmail.com>',
      to: toEmail,
      subject: `New ${type === 'quotation' ? 'Quotation' : 'Booking'}: ${bookingData.quotation_id || bookingData.order_id}`,
      text: `
A new ${type} has been made.

Customer Name: ${customerDetails.customer_name || 'N/A'}
Mobile: ${customerDetails.mobile_number || 'N/A'}
Email: ${customerDetails.email || 'N/A'}
District: ${customerDetails.district || 'N/A'}
State: ${customerDetails.state || 'N/A'}
${type === 'quotation' ? 'Quotation ID' : 'Order ID'}: ${bookingData.quotation_id || bookingData.order_id}
Customer Type: ${bookingData.customer_type || 'User'}
Net Rate: Rs.${parseFloat(bookingData.net_rate || 0).toFixed(2)}
You Save: Rs.${parseFloat(bookingData.you_save || 0).toFixed(2)}
Total: Rs.${parseFloat(bookingData.total || 0).toFixed(2)}

Products:
${productList}
    `,
      attachments: [
        {
          filename: path.basename(pdfPath),
          path: pdfPath,
          contentType: 'application/pdf',
        }
      ]
    };

    await transporter.sendMail(mailOptions);
    console.log(`Email sent successfully to ${toEmail}`);
  } catch (err) {
    console.error('Failed to send email:', err.message);
    throw err;
  }
}

exports.getCustomers = async (req, res) => {
  try {
    const query = `
      SELECT id, customer_name AS name, address, mobile_number, email, customer_type, district, state, agent_id
      FROM public.customers
    `;
    const result = await pool.query(query);
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Failed to fetch customers:', err.message);
    res.status(500).json({ message: 'Failed to fetch customers', error: err.message });
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
      SELECT id, customer_id, quotation_id, products, net_rate, you_save, total, promo_discount, 
             customer_name, address, mobile_number, email, district, state, customer_type, 
             status, created_at, updated_at, pdf
      FROM public.quotations
      ORDER BY created_at DESC
    `;
    const result = await pool.query(query);
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Failed to fetch quotations:', err.message);
    res.status(500).json({ message: 'Failed to fetch quotations', error: err.message });
  }
};

exports.createQuotation = async (req, res) => {
  try {
    const {
      customer_id, quotation_id, products, net_rate, you_save, total, promo_discount,
      customer_type, customer_name, address, mobile_number, email, district, state
    } = req.body;

    if (!quotation_id || !/^[a-zA-Z0-9-_]+$/.test(quotation_id)) return res.status(400).json({ message: 'Invalid or missing Quotation ID' });
    if (!Array.isArray(products) || products.length === 0) return res.status(400).json({ message: 'Products array is required and must not be empty' });
    if (!total || isNaN(parseFloat(total)) || parseFloat(total) <= 0) return res.status(400).json({ message: 'Total must be a positive number' });

    const parsedNetRate = parseFloat(net_rate) || 0;
    const parsedYouSave = parseFloat(you_save) || 0;
    const parsedPromoDiscount = parseFloat(promo_discount) || 0;
    const parsedTotal = parseFloat(total);

    if ([parsedNetRate, parsedYouSave, parsedPromoDiscount, parsedTotal].some(v => isNaN(v)))
      return res.status(400).json({ message: 'net_rate, you_save, promo_discount, and total must be valid numbers' });

    let finalCustomerType = customer_type || 'User';
    let customerDetails = { customer_name, address, mobile_number, email, district, state };
    let agent_name = null;

    if (customer_id) {
      const customerCheck = await pool.query(
        'SELECT id, customer_name, address, mobile_number, email, district, state, customer_type, agent_id FROM public.customers WHERE id = $1',
        [customer_id]
      );
      if (customerCheck.rows.length === 0) return res.status(404).json({ message: 'Customer not found' });

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
      if (finalCustomerType !== 'User') return res.status(400).json({ message: 'Customer type must be "User" for quotations without customer ID' });
      if (!customer_name || !address || !district || !state || !mobile_number)
        return res.status(400).json({ message: 'All customer details must be provided' });
    }

    for (const product of products) {
      const { id, product_type, quantity, price, discount } = product;
      if (!id || !product_type || quantity < 1 || isNaN(parseFloat(price)) || isNaN(parseFloat(discount)))
        return res.status(400).json({ message: 'Invalid product entry' });

      const tableName = product_type.toLowerCase().replace(/\s+/g, '_');
      const productCheck = await pool.query(`SELECT id FROM public.${tableName} WHERE id = $1`, [id]);
      if (productCheck.rows.length === 0)
        return res.status(404).json({ message: `Product ${id} of type ${product_type} not found or unavailable` });
    }

    const { pdfPath } = await generatePDF(
      'quotation',
      { quotation_id, customer_type: finalCustomerType, total: parsedTotal, agent_name },
      customerDetails,
      products,
      { net_rate: parsedNetRate, you_save: parsedYouSave, total: parsedTotal, promo_discount: parsedPromoDiscount }
    );

    const result = await pool.query(`
      INSERT INTO public.quotations 
      (customer_id, quotation_id, products, net_rate, you_save, total, promo_discount, address, mobile_number, customer_name, email, district, state, customer_type, status, created_at, pdf)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW(),$16)
      RETURNING id, created_at, customer_type, pdf, quotation_id
    `, [
      customer_id || null,
      quotation_id,
      JSON.stringify(products),
      parsedNetRate,
      parsedYouSave,
      parsedTotal,
      parsedPromoDiscount,
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

    try {
      const mediaId = await uploadPDF(pdfPath);
      await sendTemplateWithPDF(mediaId, parsedTotal, customerDetails, 'quotation');
    } catch (err) {
      console.error('WhatsApp PDF sending failed:', err);
    }

    await sendBookingEmail(
      'madhunishacrackers@gmail.com',
      {
        quotation_id,
        customer_type: finalCustomerType,
        net_rate: parsedNetRate,
        you_save: parsedYouSave,
        total: parsedTotal
      },
      customerDetails,
      pdfPath,
      products,
      'quotation'
    );

    res.status(201).json({
      message: 'Quotation created successfully',
      id: result.rows[0].id,
      created_at: result.rows[0].created_at,
      customer_type: result.rows[0].customer_type,
      pdf_path: result.rows[0].pdf,
      quotation_id: result.rows[0].quotation_id
    });
  } catch (err) {
    console.error(`Failed to create quotation ${req.body.quotation_id}:`, err.message);
    res.status(500).json({ message: 'Failed to create quotation', error: err.message });
  }
};

exports.updateQuotation = async (req, res) => {
  try {
    const { quotation_id } = req.params;
    const { products, net_rate, you_save, total, promo_discount, status } = req.body;

    if (!quotation_id || !/^[a-zA-Z0-9-_]+$/.test(quotation_id)) return res.status(400).json({ message: 'Invalid or missing Quotation ID' });
    if (products && (!Array.isArray(products) || products.length === 0)) return res.status(400).json({ message: 'Products array is required and must not be empty' });
    if (total && (isNaN(parseFloat(total)) || parseFloat(total) <= 0)) return res.status(400).json({ message: 'Total must be a positive number' });
    if (status && !['pending', 'booked', 'canceled'].includes(status)) return res.status(400).json({ message: 'Invalid status' });

    const parsedNetRate = net_rate !== undefined ? parseFloat(net_rate) : undefined;
    const parsedYouSave = you_save !== undefined ? parseFloat(you_save) : undefined;
    const parsedPromoDiscount = promo_discount !== undefined ? parseFloat(promo_discount) : undefined;
    const parsedTotal = total !== undefined ? parseFloat(total) : undefined;

    if ([parsedNetRate, parsedYouSave, parsedPromoDiscount, parsedTotal].some(v => v !== undefined && isNaN(v)))
      return res.status(400).json({ message: 'net_rate, you_save, total, and promo_discount must be valid numbers' });

    const quotationCheck = await pool.query(
      'SELECT * FROM public.quotations WHERE quotation_id = $1',
      [quotation_id]
    );
    if (quotationCheck.rows.length === 0) return res.status(404).json({ message: 'Quotation not found' });

    const quotation = quotationCheck.rows[0];
    let customerDetails = {
      customer_name: quotation.customer_name,
      address: quotation.address,
      mobile_number: quotation.mobile_number,
      email: quotation.email,
      district: quotation.district,
      state: quotation.state
    };
    let agent_name = null;

    if (quotation.customer_id) {
      const customerCheck = await pool.query(
        'SELECT customer_name, address, mobile_number, email, district, state, customer_type, agent_id FROM public.customers WHERE id = $1',
        [quotation.customer_id]
      );
      if (customerCheck.rows.length > 0) {
        customerDetails = customerCheck.rows[0];
        if (customerDetails.customer_type === 'Customer of Selected Agent' && customerDetails.agent_id) {
          const agentCheck = await pool.query('SELECT customer_name FROM public.customers WHERE id = $1', [customerDetails.agent_id]);
          if (agentCheck.rows.length > 0) agent_name = agentCheck.rows[0].customer_name;
        }
      }
    }

    if (products) {
      for (const product of products) {
        const { id, product_type, quantity, price, discount } = product;
        if (!id || !product_type || quantity < 1 || isNaN(parseFloat(price)) || isNaN(parseFloat(discount)))
          return res.status(400).json({ message: 'Invalid product entry' });

        const tableName = product_type.toLowerCase().replace(/\s+/g, '_');
        const productCheck = await pool.query(`SELECT id FROM public.${tableName} WHERE id = $1`, [id]);
        if (productCheck.rows.length === 0)
          return res.status(404).json({ message: `Product ${id} of type ${product_type} not found or unavailable` });
      }
    }

    let pdfPath = quotation.pdf;
    if (products && parsedTotal !== undefined) {
      const pdfResult = await generatePDF(
        'quotation',
        { quotation_id, customer_type: quotation.customer_type, total: parsedTotal, agent_name },
        customerDetails,
        products,
        {
          net_rate: parsedNetRate !== undefined ? parsedNetRate : parseFloat(quotation.net_rate || 0),
          you_save: parsedYouSave !== undefined ? parsedYouSave : parseFloat(quotation.you_save || 0),
          total: parsedTotal !== undefined ? parsedTotal : parseFloat(quotation.total || 0),
          promo_discount: parsedPromoDiscount !== undefined ? parsedPromoDiscount : parseFloat(quotation.promo_discount || 0)
        }
      );
      pdfPath = pdfResult.pdfPath;

      try {
        const mediaId = await uploadPDF(pdfPath);
        await sendTemplateWithPDF(mediaId, parsedTotal !== undefined ? parsedTotal : parseFloat(quotation.total || 0), customerDetails, 'quotation');
      } catch (err) {
        console.error('WhatsApp PDF sending failed:', err);
      }

      await sendBookingEmail(
        'madhunishacrackers@gmail.com',
        {
          quotation_id,
          customer_type: quotation.customer_type,
          net_rate: parsedNetRate !== undefined ? parsedNetRate : parseFloat(quotation.net_rate || 0),
          you_save: parsedYouSave !== undefined ? parsedYouSave : parseFloat(quotation.you_save || 0),
          total: parsedTotal !== undefined ? parsedTotal : parseFloat(quotation.total || 0)
        },
        customerDetails,
        pdfPath,
        products,
        'quotation'
      );
    }

    const updateFields = [];
    const updateValues = [];
    let paramIndex = 1;

    if (products) {
      updateFields.push(`products = $${paramIndex++}`);
      updateValues.push(JSON.stringify(products));
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
    if (pdfPath) {
      updateFields.push(`pdf = $${paramIndex++}`);
      updateValues.push(pdfPath);
    }
    if (status) {
      updateFields.push(`status = $${paramIndex++}`);
      updateValues.push(status);
    }
    updateFields.push(`updated_at = NOW()`);

    if (updateFields.length === 1) {
      return res.status(400).json({ message: 'No fields to update' });
    }

    const query = `
      UPDATE public.quotations 
      SET ${updateFields.join(', ')}
      WHERE quotation_id = $${paramIndex}
      RETURNING id, quotation_id, status
    `;
    updateValues.push(quotation_id);

    const result = await pool.query(query, updateValues);

    res.status(200).json({
      message: 'Quotation updated successfully',
      id: result.rows[0].id,
      quotation_id: result.rows[0].quotation_id,
      status: result.rows[0].status
    });
  } catch (err) {
    console.error(`Failed to update quotation ${req.params.quotation_id}:`, err.message);
    res.status(500).json({ message: 'Failed to update quotation', error: err.message });
  }
};

exports.deleteQuotation = async (req, res) => {
  try {
    const { quotation_id } = req.params;
    if (!quotation_id || !/^[a-zA-Z0-9-_]+$/.test(quotation_id)) return res.status(400).json({ message: 'Invalid or missing Quotation ID' });

    const quotationCheck = await pool.query(
      'SELECT * FROM public.quotations WHERE quotation_id = $1 AND status = $2',
      [quotation_id, 'pending']
    );
    if (quotationCheck.rows.length === 0) return res.status(404).json({ message: 'Quotation not found or not in pending status' });

    await pool.query(
      'UPDATE public.quotations SET status = $1, updated_at = NOW() WHERE quotation_id = $2',
      ['canceled', quotation_id]
    );

    res.status(200).json({ message: 'Quotation canceled successfully', quotation_id });
  } catch (err) {
    console.error(`Failed to cancel quotation ${req.params.quotation_id}:`, err.message);
    res.status(500).json({ message: 'Failed to cancel quotation', error: err.message });
  }
};

exports.getQuotation = async (req, res) => {
  try {
    let { quotation_id } = req.params;
    if (quotation_id.endsWith('.pdf')) quotation_id = quotation_id.replace(/\.pdf$/, '');
    if (!/^[a-zA-Z0-9-_]+$/.test(quotation_id)) return res.status(400).json({ message: 'Invalid quotation_id format' });

    console.log(`Fetching quotation with ID: ${quotation_id}`);

    let quotationQuery = await pool.query(
      'SELECT products, net_rate, you_save, total, promo_discount, customer_name, address, mobile_number, email, district, state, customer_type, pdf, customer_id, status FROM public.quotations WHERE quotation_id = $1',
      [quotation_id]
    );

    if (quotationQuery.rows.length === 0) {
      console.log(`Quotation ${quotation_id} not found, trying alternative ID format`);
      const parts = quotation_id.split('-');
      if (parts.length > 1) {
        const possibleQuotationId = parts.slice(1).join('-');
        quotationQuery = await pool.query(
          'SELECT products, net_rate, you_save, total, promo_discount, customer_name, address, mobile_number, email, district, state, customer_type, pdf, customer_id, status FROM public.quotations WHERE quotation_id = $1',
          [possibleQuotationId]
        );
      }
    }

    if (quotationQuery.rows.length === 0) {
      console.error(`Quotation not found for ID: ${quotation_id}`);
      return res.status(404).json({ message: 'Quotation not found' });
    }

    const { products, net_rate, you_save, total, promo_discount, customer_name, address, mobile_number, email, district, state, customer_type, pdf, customer_id, status } = quotationQuery.rows[0];
    console.log(`Quotation found: ${quotation_id}, status: ${status}, pdf: ${pdf}`);

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
      console.log(`PDF not found at ${pdf}, regenerating for quotation ${quotation_id}`);
      const parsedProducts = typeof products === 'string' ? JSON.parse(products) : products;
      const pdfResult = await generatePDF(
        'quotation',
        { quotation_id, customer_type, total: parseFloat(total || 0), agent_name },
        { customer_name, address, mobile_number, email, district, state },
        parsedProducts,
        { 
          net_rate: parseFloat(net_rate || 0), 
          you_save: parseFloat(you_save || 0), 
          total: parseFloat(total || 0), 
          promo_discount: parseFloat(promo_discount || 0) 
        }
      );
      pdfPath = pdfResult.pdfPath;

      await pool.query(
        'UPDATE public.quotations SET pdf = $1 WHERE quotation_id = $2',
        [pdfPath, quotation_id]
      );

      await sendBookingEmail(
        'madhunishacrackers@gmail.com',
        {
          quotation_id,
          customer_type,
          net_rate: parseFloat(net_rate || 0),
          you_save: parseFloat(you_save || 0),
          total: parseFloat(total || 0)
        },
        { customer_name, address, mobile_number, email, district, state },
        pdfPath,
        parsedProducts,
        'quotation'
      );
    }

    if (!fs.existsSync(pdfPath)) {
      console.error(`PDF file not found after generation: ${pdfPath}`);
      return res.status(500).json({ message: 'PDF file not found after generation', error: 'File system error' });
    }

    const safeCustomerName = (customer_name || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${safeCustomerName}-${quotation_id}-quotation.pdf`);
    console.log(`Serving PDF: ${pdfPath}`);
    fs.createReadStream(pdfPath).pipe(res);
  } catch (err) {
    console.error(`Failed to fetch quotation ${req.params.quotation_id}:`, err.message);
    res.status(500).json({ message: 'Failed to fetch quotation', error: err.message });
  }
};

exports.createBooking = async (req, res) => {
  try {
    const {
      customer_id, order_id, quotation_id, products, net_rate, you_save, total, promo_discount,
      customer_type, customer_name, address, mobile_number, email, district, state
    } = req.body;

    if (!order_id || !/^[a-zA-Z0-9-_]+$/.test(order_id)) 
      return res.status(400).json({ message: 'Invalid or missing Order ID' });
    
    if (!Array.isArray(products) || products.length === 0) 
      return res.status(400).json({ message: 'Products array is required and must not be empty' });
    
    if (!total || isNaN(parseFloat(total)) || parseFloat(total) <= 0) 
      return res.status(400).json({ message: 'Total must be a positive number' });

    const parsedNetRate = parseFloat(net_rate) || 0;
    const parsedYouSave = parseFloat(you_save) || 0;
    const parsedPromoDiscount = parseFloat(promo_discount) || 0;
    const parsedTotal = parseFloat(total);

    if ([parsedNetRate, parsedYouSave, parsedPromoDiscount, parsedTotal].some(v => isNaN(v)))
      return res.status(400).json({ message: 'net_rate, you_save, promo_discount, and total must be valid numbers' });

    let finalCustomerType = customer_type || 'User';
    let customerDetails = { customer_name, address, mobile_number, email, district, state };
    let agent_name = null;

    if (customer_id) {
      const customerCheck = await pool.query(
        'SELECT id, customer_name, address, mobile_number, email, district, state, customer_type, agent_id FROM public.customers WHERE id = $1',
        [customer_id]
      );
      if (customerCheck.rows.length === 0) 
        return res.status(404).json({ message: 'Customer not found' });

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
        return res.status(400).json({ message: 'Customer type must be "User" for bookings without customer ID' });
      if (!customer_name || !address || !district || !state || !mobile_number)
        return res.status(400).json({ message: 'All customer details must be provided' });
    }

    for (const product of products) {
      const { id, product_type, quantity, price, discount } = product;
      if (!id || !product_type || quantity < 1 || isNaN(parseFloat(price)) || isNaN(parseFloat(discount)))
        return res.status(400).json({ message: 'Invalid product entry' });

      const tableName = product_type.toLowerCase().replace(/\s+/g, '_');
      const productCheck = await pool.query(`SELECT id FROM public.${tableName} WHERE id = $1`, [id]);
      if (productCheck.rows.length === 0)
        return res.status(404).json({ message: `Product ${id} of type ${product_type} not found or unavailable` });
    }

    const { pdfPath } = await generatePDF(
      'invoice',
      { order_id, customer_type: finalCustomerType, total: parsedTotal, agent_name },
      customerDetails,
      products,
      { net_rate: parsedNetRate, you_save: parsedYouSave, total: parsedTotal, promo_discount: parsedPromoDiscount }
    );

    await pool.query('BEGIN');

    // Insert the booking
    const bookingResult = await pool.query(`
      INSERT INTO public.bookings 
      (customer_id, order_id, quotation_id, products, net_rate, you_save, total, promo_discount, address, mobile_number, customer_name, email, district, state, customer_type, status, created_at, pdf)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW(), $17)
      RETURNING id, created_at, customer_type, pdf, order_id
    `, [
      customer_id || null,
      order_id,
      quotation_id || null, // Include quotation_id if provided
      JSON.stringify(products),
      parsedNetRate,
      parsedYouSave,
      parsedTotal,
      parsedPromoDiscount,
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

    // Update the quotation status to "booked" if quotation_id is provided
    if (quotation_id) {
      const quotationCheck = await pool.query(
        'SELECT id FROM public.quotations WHERE quotation_id = $1 AND status = $2',
        [quotation_id, 'pending']
      );
      if (quotationCheck.rows.length === 0) {
        await pool.query('ROLLBACK');
        return res.status(404).json({ message: 'Quotation not found or not in pending status' });
      }

      await pool.query(
        'UPDATE public.quotations SET status = $1, updated_at = NOW() WHERE quotation_id = $2',
        ['booked', quotation_id]
      );
    }

    try {
      const mediaId = await uploadPDF(pdfPath);
      await sendTemplateWithPDF(mediaId, parsedTotal, customerDetails, 'invoice');
    } catch (err) {
      console.error('WhatsApp PDF sending failed:', err);
    }

    // Send email to admin
    await sendBookingEmail(
      'madhunishacrackers@gmail.com',
      {
        order_id,
        customer_type: finalCustomerType,
        net_rate: parsedNetRate,
        you_save: parsedYouSave,
        total: parsedTotal
      },
      customerDetails,
      pdfPath,
      products,
      'invoice'
    );

    // Send email to customer if email exists
    if (customerDetails.email) {
      await sendBookingEmail(
        customerDetails.email,
        {
          order_id,
          customer_type: finalCustomerType,
          net_rate: parsedNetRate,
          you_save: parsedYouSave,
          total: parsedTotal
        },
        customerDetails,
        pdfPath,
        products,
        'invoice',
        'booked'
      );
    }

    await pool.query('COMMIT');

    console.log(`Booking created successfully for order_id: ${order_id}`);
    res.status(201).json({
      message: 'Booking created successfully',
      id: bookingResult.rows[0].id,
      created_at: bookingResult.rows[0].created_at,
      customer_type: bookingResult.rows[0].customer_type,
      pdf_path: bookingResult.rows[0].pdf,
      order_id: bookingResult.rows[0].order_id,
      quotation_id // Return quotation_id for frontend use
    });
  } catch (err) {
    await pool.query('ROLLBACK');
    console.error(`Failed to create booking for order_id ${req.body.order_id}:`, err.message);
    res.status(500).json({ message: 'Failed to create booking', error: err.message });
  }
};

exports.updateBooking = async (req, res) => {
  try {
    const { order_id } = req.params;
    const { products, net_rate, you_save, total, promo_discount, status, transport_details } = req.body;

    if (!order_id || !/^[a-zA-Z0-9-_]+$/.test(order_id)) return res.status(400).json({ message: 'Invalid or missing Order ID' });
    if (products && (!Array.isArray(products) || products.length === 0)) return res.status(400).json({ message: 'Products array is required and must not be empty' });
    if (total && (isNaN(parseFloat(total)) || parseFloat(total) <= 0)) return res.status(400).json({ message: 'Total must be a positive number' });
    if (status && !['booked', 'paid', 'dispatched', 'canceled'].includes(status)) return res.status(400).json({ message: 'Invalid status' });
    if (status === 'dispatched' && !transport_details) return res.status(400).json({ message: 'Transport details required for dispatched status' });

    const parsedNetRate = net_rate !== undefined ? parseFloat(net_rate) : undefined;
    const parsedYouSave = you_save !== undefined ? parseFloat(you_save) : undefined;
    const parsedPromoDiscount = promo_discount !== undefined ? parseFloat(promo_discount) : undefined;
    const parsedTotal = total !== undefined ? parseFloat(total) : undefined;

    if ([parsedNetRate, parsedYouSave, parsedPromoDiscount, parsedTotal].some(v => v !== undefined && isNaN(v)))
      return res.status(400).json({ message: 'net_rate, you_save, total, and promo_discount must be valid numbers' });

    const bookingCheck = await pool.query(
      'SELECT * FROM public.bookings WHERE order_id = $1',
      [order_id]
    );
    if (bookingCheck.rows.length === 0) return res.status(404).json({ message: 'Booking not found' });

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

    if (products) {
      for (const product of products) {
        const { id, product_type, quantity, price, discount } = product;
        if (!id || !product_type || quantity < 1 || isNaN(parseFloat(price)) || isNaN(parseFloat(discount)))
          return res.status(400).json({ message: 'Invalid product entry' });

        const tableName = product_type.toLowerCase().replace(/\s+/g, '_');
        const productCheck = await pool.query(`SELECT id FROM public.${tableName} WHERE id = $1`, [id]);
        if (productCheck.rows.length === 0)
          return res.status(404).json({ message: `Product ${id} of type ${product_type} not found or unavailable` });
      }
    }

    let pdfPath = booking.pdf;
    if (products && parsedTotal !== undefined) {
      const pdfResult = await generatePDF(
        'invoice',
        { order_id, customer_type: booking.customer_type, total: parsedTotal, agent_name },
        customerDetails,
        products,
        {
          net_rate: parsedNetRate !== undefined ? parsedNetRate : parseFloat(booking.net_rate || 0),
          you_save: parsedYouSave !== undefined ? parsedYouSave : parseFloat(booking.you_save || 0),
          total: parsedTotal !== undefined ? parsedTotal : parseFloat(booking.total || 0),
          promo_discount: parsedPromoDiscount !== undefined ? parsedPromoDiscount : parseFloat(booking.promo_discount || 0)
        }
      );
      pdfPath = pdfResult.pdfPath;

      try {
        const mediaId = await uploadPDF(pdfPath);
        await sendTemplateWithPDF(mediaId, parsedTotal !== undefined ? parsedTotal : parseFloat(booking.total || 0), customerDetails, 'invoice');
      } catch (err) {
        console.error('WhatsApp PDF sending failed:', err);
      }
    }

    const updateFields = [];
    const updateValues = [];
    let paramIndex = 1;

    if (products) {
      updateFields.push(`products = $${paramIndex++}`);
      updateValues.push(JSON.stringify(products));
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
      return res.status(400).json({ message: 'No fields to update' });
    }

    const query = `
      UPDATE public.bookings 
      SET ${updateFields.join(', ')}
      WHERE order_id = $${paramIndex}
      RETURNING id, order_id, status
    `;
    updateValues.push(order_id);

    const result = await pool.query(query, updateValues);

    // Send email to customer if email exists and status is updated
    if (customerDetails.email && status) {
      await sendBookingEmail(
        customerDetails.email,
        {
          order_id,
          customer_type: booking.customer_type,
          net_rate: parsedNetRate !== undefined ? parsedNetRate : parseFloat(booking.net_rate || 0),
          you_save: parsedYouSave !== undefined ? parsedYouSave : parseFloat(booking.you_save || 0),
          total: parsedTotal !== undefined ? parsedTotal : parseFloat(booking.total || 0)
        },
        customerDetails,
        pdfPath,
        products || JSON.parse(booking.products),
        'invoice',
        status,
        transport_details
      );
    }

    // Send email to admin
    await sendBookingEmail(
      'madhunishacrackers@gmail.com',
      {
        order_id,
        customer_type: booking.customer_type,
        net_rate: parsedNetRate !== undefined ? parsedNetRate : parseFloat(booking.net_rate || 0),
        you_save: parsedYouSave !== undefined ? parsedYouSave : parseFloat(booking.you_save || 0),
        total: parsedTotal !== undefined ? parsedTotal : parseFloat(booking.total || 0)
      },
      customerDetails,
      pdfPath,
      products || JSON.parse(booking.products),
      'invoice',
      status,
      transport_details
    );

    res.status(200).json({
      message: 'Booking updated successfully',
      id: result.rows[0].id,
      order_id: result.rows[0].order_id,
      status: result.rows[0].status
    });
  } catch (err) {
    console.error(`Failed to update booking ${req.params.order_id}:`, err.message);
    res.status(500).json({ message: 'Failed to update booking', error: err.message });
  }
};

exports.getInvoice = async (req, res) => {
  try {
    let { order_id } = req.params;
    if (order_id.endsWith('.pdf')) order_id = order_id.replace(/\.pdf$/, '');
    if (!/^[a-zA-Z0-9-_]+$/.test(order_id)) return res.status(400).json({ message: 'Invalid order_id format' });

    console.log(`Fetching invoice with ID: ${order_id}`);

    const bookingQuery = await pool.query(
      'SELECT products, net_rate, you_save, total, promo_discount, customer_name, address, mobile_number, email, district, state, customer_type, pdf, customer_id, status FROM public.bookings WHERE order_id = $1',
      [order_id]
    );

    if (bookingQuery.rows.length === 0) {
      console.error(`Booking not found for ID: ${order_id}`);
      return res.status(404).json({ message: 'Booking not found' });
    }

    const { products, net_rate, you_save, total, promo_discount, customer_name, address, mobile_number, email, district, state, customer_type, pdf, customer_id, status } = bookingQuery.rows[0];
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
      console.log(`PDF not found at ${pdf}, regenerating for order ${order_id}`);
      const parsedProducts = typeof products === 'string' ? JSON.parse(products) : products;
      const pdfResult = await generatePDF(
        'invoice',
        { order_id, customer_type, total: parseFloat(total || 0), agent_name },
        { customer_name, address, mobile_number, email, district, state },
        parsedProducts,
        { 
          net_rate: parseFloat(net_rate || 0), 
          you_save: parseFloat(you_save || 0), 
          total: parseFloat(total || 0), 
          promo_discount: parseFloat(promo_discount || 0) 
        }
      );
      pdfPath = pdfResult.pdfPath;

      await pool.query(
        'UPDATE public.bookings SET pdf = $1 WHERE order_id = $2',
        [pdfPath, order_id]
      );

      await sendBookingEmail(
        'madhunishacrackers@gmail.com',
        {
          order_id,
          customer_type,
          net_rate: parseFloat(net_rate || 0),
          you_save: parseFloat(you_save || 0),
          total: parseFloat(total || 0)
        },
        { customer_name, address, mobile_number, email, district, state },
        pdfPath,
        parsedProducts,
        'invoice'
      );
    }

    if (!fs.existsSync(pdfPath)) {
      console.error(`PDF file not found after generation: ${pdfPath}`);
      return res.status(500).json({ message: 'PDF file not found after generation', error: 'File system error' });
    }

    const safeCustomerName = (customer_name || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${safeCustomerName}-${order_id}-invoice.pdf`);
    console.log(`Serving PDF: ${pdfPath}`);
    fs.createReadStream(pdfPath).pipe(res);
  } catch (err) {
    console.error(`Failed to fetch invoice ${req.params.order_id}:`, err.message);
    res.status(500).json({ message: 'Failed to fetch invoice', error: err.message });
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
             promo_discount, customer_name, address, mobile_number, email, district, state, 
             customer_type, status, created_at, pdf
      FROM public.quotations
      WHERE LOWER(customer_name) LIKE LOWER($1) 
      AND mobile_number LIKE $2
      ORDER BY created_at DESC
    `;

    const result = await pool.query(query, [`%${customer_name}%`, `%${mobile_number}%`]);
    
    // Add empty transport details to maintain consistent response structure
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
    console.error("Failed to search quotations:", err.message);
    res.status(500).json({ message: "Failed to search quotations", error: err.message });
  }
};