const express = require('express');
const router = express.Router();
const multer = require('multer');
const { Pool } = require('pg');
const { v2: cloudinary } = require('cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
require('dotenv').config();

// PostgreSQL pool setup
const pool = new Pool({
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  host: process.env.PGHOST,
  port: process.env.PGPORT,
  database: process.env.PGDATABASE,
});

// Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Cloudinary storage setup
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'banners',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
  },
});

const upload = multer({ storage });

/**
 * POST /api/banners/upload
 * Upload images to Cloudinary and save metadata to PostgreSQL
 */
router.post('/banners/upload', upload.array('images', 10), async (req, res, next) => {
  try {
    const files = req.files;
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const results = [];

    for (const file of files) {
      const imageUrl = file.path;
      const insertQuery = `
        INSERT INTO banners (image_url, is_active)
        VALUES ($1, $2)
        RETURNING *;
      `;
      const { rows } = await pool.query(insertQuery, [imageUrl, false]);
      results.push(rows[0]);
    }

    res.status(201).json({
      success: true,
      uploaded: results.length,
      data: results,
    });
  } catch (err) {
    console.error('❌ Upload failed:', err);
    next(err);
  }
});

/**
 * GET /api/banners
 * Fetch all banners
 */
router.get('/banners', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM banners ORDER BY uploaded_at DESC');
    res.json(rows);
  } catch (err) {
    console.error('❌ Fetch failed:', err);
    res.status(500).json({ error: 'Failed to fetch banners' });
  }
});

/**
 * DELETE /api/banners/:id
 * Delete a banner and remove its image from Cloudinary
 */
router.delete('/banners/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const { rows } = await pool.query('SELECT image_url FROM banners WHERE id = $1', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Banner not found' });
    }

    const imageUrl = rows[0].image_url;
    const parts = imageUrl.split('/');
    const fileWithExtension = parts[parts.length - 1];
    const folderName = parts[parts.length - 2];
    const publicId = `${folderName}/${fileWithExtension.split('.')[0]}`;

    await cloudinary.uploader.destroy(publicId);
    await pool.query('DELETE FROM banners WHERE id = $1', [id]);

    res.json({ message: 'Banner deleted successfully' });
  } catch (err) {
    console.error('❌ Delete failed:', err);
    res.status(500).json({ error: 'Failed to delete banner' });
  }
});

/**
 * PATCH /api/banners/:id
 * Toggle is_active status of a banner
 */
router.patch('/banners/:id', async (req, res) => {
  const { id } = req.params;
  const { is_active } = req.body;

  try {
    const result = await pool.query(
      'UPDATE banners SET is_active = $1 WHERE id = $2 RETURNING *',
      [is_active, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Banner not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('❌ Update failed:', err);
    res.status(500).json({ error: 'Failed to update banner status' });
  }
});

module.exports = router;
