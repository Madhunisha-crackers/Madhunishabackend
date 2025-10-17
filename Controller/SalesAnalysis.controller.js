const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  host: process.env.PGHOST,
  port: process.env.PGPORT,
  database: process.env.PGDATABASE,
});

exports.getSalesAnalysis = async (req, res) => {
  try {
    // Validate JSONB structure for products
    const validateProducts = await pool.query(`
      SELECT COUNT(*) AS invalid_count
      FROM public.bookings
      WHERE status IN ('booked', 'paid', 'dispatched', 'packed', 'delivered') AND (products::jsonb IS NULL OR jsonb_typeof(products::jsonb) != 'array')
      UNION ALL
      SELECT COUNT(*) AS invalid_count
      FROM public.quotations
      WHERE status IN ('booked', 'pending') AND (products::jsonb IS NULL OR jsonb_typeof(products::jsonb) != 'array')
    `);
    if (validateProducts.rows.some(row => row.invalid_count > 0)) {
      console.warn('Invalid products JSONB found:', validateProducts.rows);
    }

    // Fetch products (quantity only)
    const products = await pool.query(`
      SELECT 
        p.product->>'productname' AS productname,
        COALESCE((p.product->>'quantity')::integer, 0) AS quantity
      FROM public.bookings b
      CROSS JOIN LATERAL jsonb_array_elements(b.products::jsonb) AS p(product)
      WHERE LOWER(b.status) IN ('booked', 'paid', 'dispatched', 'packed', 'delivered')
    `);

    const productSummary = products.rows.reduce((acc, row) => {
      const { productname, quantity } = row;
      if (!productname) {
        console.log('Skipping row with missing productname:', row);
        return acc;
      }
      if (!acc[productname]) {
        acc[productname] = { quantity: 0 };
      }
      acc[productname].quantity += parseInt(quantity) || 0;
      return acc;
    }, {});

    const productData = Object.entries(productSummary)
      .map(([productname, data]) => ({
        productname,
        quantity: data.quantity
      }))
      .sort((a, b) => b.quantity - a.quantity); // Sort by quantity in descending order

    // Fetch regional demand (cities) using total column
    const cities = await pool.query(`
      SELECT 
        district, 
        COUNT(*) AS count, 
        SUM(COALESCE(total::numeric, 0)) AS total_amount
      FROM public.bookings
      WHERE LOWER(status) IN ('booked', 'paid', 'dispatched', 'packed', 'delivered')
      GROUP BY district
      UNION ALL
      SELECT 
        district, 
        COUNT(*) AS count, 
        SUM(COALESCE(total::numeric, 0)) AS total_amount
      FROM public.quotations
      WHERE LOWER(status) IN ('booked', 'pending')
      GROUP BY district
    `);

    const citySummary = cities.rows.reduce((acc, row) => {
      const district = row.district || 'Unknown';
      if (!acc[district]) {
        acc[district] = { count: 0, total_amount: 0 };
      }
      acc[district].count += parseInt(row.count) || 0;
      acc[district].total_amount += parseFloat(row.total_amount) || 0;
      return acc;
    }, {});

    const cityData = Object.entries(citySummary).map(([district, data]) => ({
      district,
      count: data.count,
      total_amount: data.total_amount
    }));

    // Fetch historical trends using total and amount_paid columns from bookings only
    const historical = await pool.query(`
      SELECT 
        TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month,
        COUNT(*) AS volume,
        SUM(COALESCE(total::numeric, 0)) AS total_amount,
        SUM(COALESCE(amount_paid::numeric, 0)) AS amount_paid
      FROM public.bookings
      WHERE LOWER(status) IN ('booked', 'paid', 'dispatched', 'packed', 'delivered')
      GROUP BY TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM')
      ORDER BY month
    `);

    const trendDataArray = historical.rows.map(row => ({
      month: row.month,
      volume: parseInt(row.volume) || 0,
      total_amount: parseFloat(row.total_amount) || 0,
      amount_paid: parseFloat(row.amount_paid) || 0,
      unpaid_amount: (parseFloat(row.total_amount) || 0) - (parseFloat(row.amount_paid) || 0)
    })).sort((a, b) => a.month.localeCompare(b.month));

    // Fetch profitability metrics using total and amount_paid columns from bookings only
    const profitability = await pool.query(`
      SELECT 
        SUM(COALESCE(total::numeric, 0)) AS total_amount,
        SUM(COALESCE(amount_paid::numeric, 0)) AS amount_paid
      FROM public.bookings
    `);

    const profitRow = profitability.rows[0] || { total_amount: 0, amount_paid: 0 };
    const profitData = {
      total_amount: profitRow.total_amount,
      amount_paid: profitRow.amount_paid,
      unpaid_amount: profitRow.total_amount - profitRow.amount_paid
    };

    // Fetch quotation conversion rates using total column
    const quotations = await pool.query(`
      SELECT 
        LOWER(status) AS status, 
        COUNT(*) AS count, 
        SUM(COALESCE(total::numeric, 0)) AS total_amount
      FROM public.quotations
      GROUP BY LOWER(status)
    `);

    const quotationSummary = quotations.rows.reduce((acc, row) => {
      acc[row.status] = { count: parseInt(row.count), total_amount: parseFloat(row.total_amount) || 0 };
      return acc;
    }, { pending: { count: 0, total_amount: 0 }, booked: { count: 0, total_amount: 0 }, canceled: { count: 0, total_amount: 0 } });

    // Fetch customer type analysis using total column
    const customerTypes = await pool.query(`
      SELECT 
        customer_type, 
        COUNT(*) AS count, 
        SUM(COALESCE(total::numeric, 0)) AS total_amount
      FROM public.bookings
      WHERE LOWER(status) IN ('booked', 'paid', 'dispatched', 'packed', 'delivered') AND customer_type IS NOT NULL
      GROUP BY customer_type
    `);

    const customerTypeData = customerTypes.rows.map(row => ({
      customer_type: row.customer_type || 'Unknown',
      count: parseInt(row.count),
      total_amount: parseFloat(row.total_amount) || 0
    }));

    // Fetch cancellations using total column
    const cancellations = await pool.query(`
      SELECT 
        'booking' AS type, 
        order_id, 
        COALESCE(total::numeric, 0) AS total, 
        created_at
      FROM public.bookings
      WHERE LOWER(status) = 'canceled'
      UNION ALL
      SELECT 
        'quotation' AS type, 
        quotation_id AS order_id, 
        COALESCE(total::numeric, 0) AS total, 
        created_at
      FROM public.quotations
      WHERE LOWER(status) = 'canceled'
    `);

    const cancellationData = cancellations.rows.map(row => ({
      type: row.type,
      order_id: row.order_id,
      total: parseFloat(row.total) || 0,
      created_at: row.created_at
    }));

    res.status(200).json({
      products: productData,
      cities: cityData,
      trends: trendDataArray,
      profitability: profitData,
      quotations: quotationSummary,
      customer_types: customerTypeData,
      cancellations: cancellationData
    });
  } catch (err) {
    console.error('Failed to fetch sales analysis:', {
      message: err.message,
      stack: err.stack,
      query: err.query || 'N/A'
    });
    res.status(500).json({ message: 'Failed to fetch sales analysis', error: err.message });
  }
};