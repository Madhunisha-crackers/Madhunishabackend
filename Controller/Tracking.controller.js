const { Pool } = require('pg');
const axios = require('axios');

const pool = new Pool({
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  host: process.env.PGHOST,
  port: process.env.PGPORT,
  database: process.env.PGDATABASE,
});

const ACCESS_TOKEN = 'EAAKZAUdN55kEBPLcupTZAXpIZCAszZBupSiKxRCWe5zYiZB0LZCuUFl3vTLjWDBuAgU1u6f29S8e2XkdzgrSfn8PpiT0jLSZCAOU9aGhDoOlTL9MrxZBgG0vZBCDt3dHLFlM2GHOrwvJP2WjZB2yQix9FOh6Wduq1LhXgJQpHYTYoBGbiTc8ek9LAZBXeXjPQJa8QaPAvvbcGwPIAw63P1dOAX4qfqC8AS7fJDKZAZBLbLmXEM8Hv';
const PHONE_NUMBER_ID = '660922473779560';

const createTransportTable = `
  CREATE TABLE IF NOT EXISTS transport_details (
    id SERIAL PRIMARY KEY,
    order_id VARCHAR(50),
    transport_name VARCHAR(100) NOT NULL,
    lr_number VARCHAR(50) NOT NULL,
    transport_contact VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`;

const alterBookingsTable = `
  ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20),
  ADD COLUMN IF NOT EXISTS transaction_id VARCHAR(100)
`;

pool.query(createTransportTable)
  .then(() => console.log('Transport table created or already exists'))
  .catch((err) => console.error('Error creating transport table:', err.message, err.stack));

pool.query(alterBookingsTable)
  .then(() => console.log('Bookings table altered successfully'))
  .catch((err) => console.error('Error altering bookings table:', err.message, err.stack));

async function sendStatusUpdate(mobileNumber, status, transportDetails = null) {
  if (!mobileNumber) {
    console.warn('Mobile number is missing; skipping WhatsApp notification');
    return;
  }

  let recipientNumber = mobileNumber.replace(/\D/g, '');
  if (recipientNumber.length === 10) {
    recipientNumber = `+91${recipientNumber}`;
  } else if (recipientNumber.length === 12 && recipientNumber.startsWith('91')) {
    recipientNumber = `+${recipientNumber}`;
  } else {
    console.warn(`Invalid mobile number format: ${mobileNumber}; skipping WhatsApp notification`);
    return;
  }

  const payload = {
    messaging_product: 'whatsapp',
    to: recipientNumber,
    type: 'template',
    template: {
      name: 'hello_world', // Replace with your actual WhatsApp template name
      language: { code: 'en_US' },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: status },
            ...(status === 'dispatched' && transportDetails
              ? [
                  { type: 'text', text: transportDetails.transport_name || 'N/A' },
                  { type: 'text', text: transportDetails.lr_number || 'N/A' },
                  { type: 'text', text: transportDetails.transport_contact || 'N/A' },
                ]
              : [
                  { type: 'text', text: 'N/A' },
                  { type: 'text', text: 'N/A' },
                  { type: 'text', text: 'N/A' },
                ]),
          ],
        },
      ],
    },
  };

  try {
    const res = await axios.post(
      `https://graph.facebook.com/v23.0/${PHONE_NUMBER_ID}/messages`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );
    console.log(`✅ Status update sent to ${recipientNumber} for status: ${status}`);
    console.log(JSON.stringify(res.data, null, 2));
  } catch (err) {
    console.error('Error sending WhatsApp status update:', err.response ? JSON.stringify(err.response.data, null, 2) : err.message);
  }
}

exports.getAllBookings = async (req, res) => {
  try {
    const { status, customerType } = req.query;
    let query = `
      SELECT id, order_id, customer_name, district, state, status, customer_type, total, payment_method, transaction_id
      FROM public.bookings
    `;
    const conditions = [];
    const params = [];

    if (status) {
      conditions.push(`status = $${params.length + 1}`);
      params.push(status);
    }

    if (customerType) {
      conditions.push(`customer_type = $${params.length + 1}`);
      params.push(customerType);
    }

    if (conditions.length > 0) {
      query += ` WHERE ` + conditions.join(' AND ');
    }

    query += ` ORDER BY id DESC`;

    const result = await pool.query(query, params);
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Error fetching bookings:', err.message, err.stack);
    res.status(500).json({ message: 'Failed to fetch bookings' });
  }
};

exports.updateBookingStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, payment_method, transaction_id, transportDetails } = req.body;
    const validStatuses = ['booked', 'paid', 'packed', 'dispatched', 'delivered'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status value' });
    }

    if (status === 'paid' && payment_method === 'bank' && !transaction_id) {
      return res.status(400).json({ message: 'Transaction ID is required for bank payments' });
    }

    if (status === 'dispatched' && (!transportDetails || !transportDetails.transportName || !transportDetails.lrNumber)) {
      return res.status(400).json({ message: 'Transport name and LR number are required for dispatched status' });
    }

    await pool.query('BEGIN');

    let query = `
      UPDATE public.bookings
      SET status = $1, payment_method = $3, transaction_id = $4
      WHERE id = $2
      RETURNING id, order_id, status, mobile_number, payment_method, transaction_id
    `;
    const params = [status, id, payment_method || null, transaction_id || null];

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      await pool.query('ROLLBACK');
      return res.status(404).json({ message: 'Booking not found' });
    }

    let transportData = null;
    if (status === 'dispatched' && transportDetails) {
      const transportQuery = `
        INSERT INTO transport_details (order_id, transport_name, lr_number, transport_contact)
        VALUES ($1, $2, $3, $4)
        RETURNING transport_name, lr_number, transport_contact
      `;
      const transportResult = await pool.query(transportQuery, [
        result.rows[0].order_id,
        transportDetails.transportName,
        transportDetails.lrNumber,
        transportDetails.transportContact || null,
      ]);
      transportData = transportResult.rows[0];
    }

    await pool.query('COMMIT');

    await sendStatusUpdate(result.rows[0].mobile_number, status, transportData);

    res.status(200).json({
      message: 'Status updated successfully',
      data: {
        ...result.rows[0],
        transport_name: transportData?.transport_name || null,
        lr_number: transportData?.lr_number || null,
        transport_contact: transportData?.transport_contact || null,
      },
    });
  } catch (err) {
    await pool.query('ROLLBACK');
    console.error('Error updating booking status:', err.message, err.stack);
    res.status(500).json({ message: 'Failed to update booking status', error: err.message });
  }
};

exports.getFilteredBookings = async (req, res) => {
  try {
    const { status } = req.query;
    const allowedStatuses = ['paid', 'packed', 'dispatched', 'delivered'];
    let query = `
      SELECT b.id, b.order_id, b.customer_name, b.district, b.state, b.status, b.products, b.address, b.created_at, b.mobile_number, b.payment_method, b.transaction_id, t.transport_name, t.lr_number, t.transport_contact
      FROM public.bookings b
      LEFT JOIN (
        SELECT order_id, transport_name, lr_number, transport_contact
        FROM transport_details
        WHERE created_at = (
          SELECT MAX(created_at)
          FROM transport_details
          WHERE order_id = transport_details.order_id
        )
      ) t ON b.order_id = t.order_id
      WHERE b.status = ANY($1)
    `;
    const params = [allowedStatuses];
    if (status && allowedStatuses.includes(status)) {
      query += ` AND b.status = $2`;
      params.push(status);
    }
    const result = await pool.query(query, params);
    const bookingsWithTotal = result.rows.map((booking) => ({
      ...booking,
      total: booking.products && Array.isArray(booking.products)
        ? booking.products.reduce((sum, product) => sum + (parseFloat(product.price) || 0) * (product.quantity || 0), 0)
        : 0,
    }));
    res.status(200).json(bookingsWithTotal);
  } catch (err) {
    console.error('Error fetching filtered bookings:', err.message, err.stack);
    res.status(500).json({ message: 'Failed to fetch filtered bookings' });
  }
};

exports.updateFilterBookingStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, payment_method, transaction_id, transportDetails } = req.body;
    const validStatuses = ['booked', 'paid', 'packed', 'dispatched', 'delivered'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status value' });
    }

    if (status === 'paid' && payment_method === 'bank' && !transaction_id) {
      return res.status(400).json({ message: 'Transaction ID is required for bank payments' });
    }

    if (status === 'dispatched' && (!transportDetails || !transportDetails.transportName || !transportDetails.lrNumber)) {
      return res.status(400).json({ message: 'Transport name and LR number are required for dispatched status' });
    }

    await pool.query('BEGIN');

    let query = `
      UPDATE public.bookings
      SET status = $1, payment_method = $3, transaction_id = $4
      WHERE id = $2
      RETURNING id, order_id, status, mobile_number, payment_method, transaction_id
    `;
    const params = [status, id, payment_method || null, transaction_id || null];

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      await pool.query('ROLLBACK');
      return res.status(404).json({ message: 'Booking not found' });
    }

    let transportData = null;
    if (status === 'dispatched' && transportDetails) {
      const transportQuery = `
        INSERT INTO transport_details (order_id, transport_name, lr_number, transport_contact)
        VALUES ($1, $2, $3, $4)
        RETURNING transport_name, lr_number, transport_contact
      `;
      const transportResult = await pool.query(transportQuery, [
        result.rows[0].order_id,
        transportDetails.transportName,
        transportDetails.lrNumber,
        transportDetails.transportContact || null,
      ]);
      transportData = transportResult.rows[0];
    }

    await pool.query('COMMIT');
    await sendStatusUpdate(result.rows[0].mobile_number, status, transportData);

    res.status(200).json({
      message: 'Status updated successfully',
      data: {
        ...result.rows[0],
        transport_name: transportData?.transport_name || null,
        lr_number: transportData?.lr_number || null,
        transport_contact: transportData?.transport_contact || null,
      },
    });
  } catch (err) {
    await pool.query('ROLLBACK');
    console.error('Error updating booking status:', err.message, err.stack);
    res.status(500).json({ message: 'Failed to update booking status', error: err.message });
  }
};

module.exports;