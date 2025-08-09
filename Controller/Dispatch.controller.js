const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  host: process.env.PGHOST,
  port: process.env.PGPORT,
  database: process.env.PGDATABASE,
});

exports.getFilteredBookings = async (req, res) => {
  try {
    const { status } = req.query;
    const allowedStatuses = ['paid', 'packed', 'dispatched', 'delivered'];
    let query = `
      SELECT id, order_id, customer_name, district, state, status, mobile_number
      FROM public.bookings
      WHERE status = ANY($1)
    `;
    const params = [allowedStatuses];
    if (status && allowedStatuses.includes(status)) {
      query += ` AND status = $2`;
      params.push(status);
    }
    const result = await pool.query(query, params);
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Error fetching filtered bookings:', err);
    res.status(500).json({ message: 'Failed to fetch filtered bookings' });
  }
};

exports.updateBookingStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const validStatuses = ['booked', 'paid', 'packed', 'dispatched', 'delivered'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status value' });
    }
    const query = `
      UPDATE public.bookings
      SET status = $1
      WHERE id = $2
      RETURNING id, status
    `;
    const result = await pool.query(query, [status, id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Booking not found' });
    }
    res.status(200).json({ message: 'Status updated successfully', data: result.rows[0] });
  } catch (err) {
    console.error('Error updating booking status:', err);
    res.status(500).json({ message: 'Failed to update booking status' });
  }
};