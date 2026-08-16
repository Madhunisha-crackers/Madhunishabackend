const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

const pool = new Pool({
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  host: process.env.PGHOST,
  port: process.env.PGPORT,
  database: process.env.PGDATABASE,
});

// ── Ensure reviews table exists on startup ───────────────────────────────────
const ensureReviewsTable = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.reviews (
        id            SERIAL PRIMARY KEY,
        quotation_id  VARCHAR(30),
        customer_name VARCHAR(150),
        rating        INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
        comment       TEXT,
        gift_product  VARCHAR(150),
        gift_product_type VARCHAR(100),
        created_at    TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  } catch (err) {
    console.error('Failed to create reviews table:', err.message);
  }
};
ensureReviewsTable();

// ── POST /api/reviews ────────────────────────────────────────────────────────
// Creates a review and awards the gift product to the quotation
exports.createReview = async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      quotation_id,
      customer_name,
      rating,
      comment,
      gift_product_id,
      gift_product_type,
      gift_product_name,
      gift_product_price,
      gift_product_per,
    } = req.body;

    if (!rating || isNaN(parseInt(rating)) || parseInt(rating) < 1 || parseInt(rating) > 5) {
      return res.status(400).json({ message: 'Rating must be between 1 and 5' });
    }

    await client.query('BEGIN');

    // 1. Insert review
    await client.query(
      `INSERT INTO public.reviews (quotation_id, customer_name, rating, comment, gift_product, gift_product_type, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [
        quotation_id || null,
        customer_name || 'Guest',
        parseInt(rating),
        comment || '',
        gift_product_name || null,
        gift_product_type || null,
      ]
    );

    // 2. If a gift product was awarded and we have a quotation_id, append to quotation
    if (quotation_id && gift_product_id && gift_product_type && gift_product_name) {
      const quotResult = await client.query(
        `SELECT products, pdf FROM public.quotations WHERE quotation_id = $1`,
        [quotation_id]
      );

      if (quotResult.rows.length > 0) {
        const existingProducts = JSON.parse(quotResult.rows[0].products || '[]');

        // Check if the gift is already in the products list
        const alreadyGifted = existingProducts.some(p => p.is_gift === true && p.id == gift_product_id && p.product_type === gift_product_type);

        if (!alreadyGifted) {
          const giftItem = {
            id: gift_product_id,
            product_type: gift_product_type,
            productname: gift_product_name,
            price: 0,
            discount: 0,
            per: gift_product_per || 'pcs',
            quantity: 1,
            is_gift: true,
          };

          const updatedProducts = [...existingProducts, giftItem];

          await client.query(
            `UPDATE public.quotations SET products = $1, updated_at = NOW() WHERE quotation_id = $2`,
            [JSON.stringify(updatedProducts), quotation_id]
          );
        }
      }
    }

    await client.query('COMMIT');

    res.status(201).json({ message: 'Review submitted successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error in createReview:', err);
    res.status(500).json({ message: 'Failed to submit review', error: err.message });
  } finally {
    client.release();
  }
};

// ── GET /api/reviews ─────────────────────────────────────────────────────────
exports.getReviews = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, quotation_id, customer_name, rating, comment, gift_product, gift_product_type, created_at
       FROM public.reviews
       ORDER BY created_at DESC`
    );
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Error in getReviews:', err);
    res.status(500).json({ message: 'Failed to fetch reviews', error: err.message });
  }
};

// ── GET /api/reviews/summary ─────────────────────────────────────────────────
exports.getReviewSummary = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT COUNT(*) AS total, ROUND(AVG(rating)::numeric, 2) AS avg_rating,
              SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END) AS five_star,
              SUM(CASE WHEN rating = 4 THEN 1 ELSE 0 END) AS four_star,
              SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END) AS three_star,
              SUM(CASE WHEN rating = 2 THEN 1 ELSE 0 END) AS two_star,
              SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) AS one_star
       FROM public.reviews`
    );
    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error('Error in getReviewSummary:', err);
    res.status(500).json({ message: 'Failed to fetch review summary', error: err.message });
  }
};
