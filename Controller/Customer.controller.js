const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  host: process.env.PGHOST,
  port: process.env.PGPORT,
  database: process.env.PGDATABASE,
});

exports.getAgents = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, customer_name, customer_type, mobile_number, email, address, district, state FROM public.customers'
    );
    console.log('Customers fetched:', result.rows);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching customers:', error.stack);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};