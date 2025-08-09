const { Pool } = require("pg");
const cloudinary = require("cloudinary").v2;

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const pool = new Pool({
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  host: process.env.PGHOST,
  port: process.env.PGPORT,
  database: process.env.PGDATABASE,
  max: 30,
});

let productTypeCache = {
  data: null,
  timestamp: 0,
};

async function getCachedProductTypes() {
  const now = Date.now();
  if (!productTypeCache.data || now - productTypeCache.timestamp > 300000) {
    const client = await pool.connect();
    try {
      const result = await client.query("SELECT product_type FROM public.products");
      productTypeCache = {
        data: result.rows.map((r) => r.product_type),
        timestamp: now,
      };
    } finally {
      client.release();
    }
  }
  return productTypeCache.data;
}

exports.addProduct = async (req, res) => {
  const client = await pool.connect();
  try {
    const { serial_number, productname, price, per, discount, product_type, description = ""} = req.body;
    const existingImages = req.body.existingImages ? JSON.parse(req.body.existingImages) : [];
    const files = req.files || [];

    if (!serial_number || !productname || !price || !per || !discount || !product_type) {
      return res.status(400).json({ message: "All required fields must be provided" });
    }

    if (!["pieces", "box", "pkt"].includes(per)) {
      return res.status(400).json({ message: "Valid per value (pieces, box, or pkt) is required" });
    }

    const priceNum = Number.parseFloat(price);
    const discountNum = Number.parseFloat(discount);
    if (isNaN(priceNum) || priceNum < 0) {
      return res.status(400).json({ message: "Price must be a valid positive number" });
    }
    if (isNaN(discountNum) || discountNum < 0 || discountNum > 100) {
      return res.status(400).json({ message: "Discount must be between 0 and 100%" });
    }

    // Get Cloudinary URLs from uploaded files
    const finalImages = [
      ...existingImages,
      ...files.map((file) => file.path), // `file.path` is the Cloudinary URL
    ];

    const tableName = product_type.toLowerCase().replace(/\s+/g, "_");
    const cachedTypes = await getCachedProductTypes();

    if (!cachedTypes.includes(product_type)) {
      await client.query("INSERT INTO public.products (product_type) VALUES ($1)", [product_type]);
      await client.query(`
        CREATE TABLE IF NOT EXISTS public.${tableName} (
          id SERIAL PRIMARY KEY,
          serial_number VARCHAR(50) NOT NULL,
          productname VARCHAR(100) NOT NULL,
          price NUMERIC(10,2) NOT NULL,
          per VARCHAR(10) NOT NULL CHECK (per IN ('pieces', 'box', 'pkt')),
          discount NUMERIC(5,2) NOT NULL,
          image TEXT,
          description TEXT,
          status VARCHAR(10) NOT NULL DEFAULT 'off' CHECK (status IN ('on', 'off')),
          fast_running BOOLEAN DEFAULT false,
        )
      `);
      await client.query(
        `CREATE INDEX IF NOT EXISTS idx_serial_number_${tableName} ON public.${tableName}(serial_number) CONCURRENTLY`
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS idx_productname_${tableName} ON public.${tableName}(productname) CONCURRENTLY`
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS idx_id_${tableName} ON public.${tableName}(id) CONCURRENTLY`
      );

      productTypeCache.data = [...(productTypeCache.data || []), product_type];
      productTypeCache.timestamp = Date.now();
    }

    const duplicateCheck = await client.query(
      `SELECT id FROM public.${tableName} WHERE serial_number = $1 OR productname = $2`,
      [serial_number, productname]
    );

    if (duplicateCheck.rows.length > 0) {
      return res.status(400).json({ message: "Product already exists" });
    }

    const insertQuery = `
      INSERT INTO public.${tableName}
      (serial_number, productname, price, per, discount, image, status, description)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `;

    const values = [
      serial_number,
      productname,
      priceNum,
      per,
      discountNum,
      finalImages.length > 0 ? JSON.stringify(finalImages) : null,
      "off",
      description,
    ];

    const result = await client.query(insertQuery, values);
    res.status(201).json({ message: "Product saved successfully", id: result.rows[0].id });
  } catch (err) {
    console.error("Error in addProduct:", err);
    res.status(500).json({ message: "Failed to save product", error: err.message });
  } finally {
    client.release();
  }
};

exports.updateProduct = async (req, res) => {
  const client = await pool.connect();
  try {
    const { tableName, id } = req.params;
    const { serial_number, productname, price, per, discount, status, description = "", existingImages } = req.body;
    const files = req.files || [];

    if (!serial_number || !productname || !price || !per || !discount) {
      return res.status(400).json({ message: "All required fields must be provided" });
    }

    if (!["pieces", "box", "pkt"].includes(per)) {
      return res.status(400).json({ message: "Valid per value (pieces, box, or pkt) is required" });
    }

    const priceNum = Number.parseFloat(price);
    const discountNum = Number.parseFloat(discount);
    if (isNaN(priceNum) || priceNum < 0) {
      return res.status(400).json({ message: "Price must be a valid positive number" });
    }
    if (isNaN(discountNum) || discountNum < 0 || discountNum > 100) {
      return res.status(400).json({ message: "Discount must be between 0 and 100%" });
    }

    let finalImages = [];
    if (existingImages) {
      try {
        finalImages = typeof existingImages === "string" ? JSON.parse(existingImages) : existingImages;
      } catch (e) {
        console.error("Error parsing existing images:", e);
        finalImages = [];
      }
    }

    // Add new Cloudinary URLs from uploaded files
    if (files.length > 0) {
      finalImages = [...finalImages, ...files.map((file) => file.path)];
    }

    // Delete removed images from Cloudinary
    const currentProduct = await client.query(`SELECT image FROM public.${tableName} WHERE id = $1`, [id]);
    if (currentProduct.rows.length > 0 && currentProduct.rows[0].image) {
      const currentImages = JSON.parse(currentProduct.rows[0].image) || [];
      const imagesToDelete = currentImages.filter((url) => !finalImages.includes(url));
      for (const url of imagesToDelete) {
        const publicId = url.match(/\/mnc_products\/(.+?)\./)?.[1];
        if (publicId) {
          await cloudinary.uploader.destroy(`mnc_products/${publicId}`, {
            resource_type: url.includes("/video/") ? "video" : "image",
          });
        }
      }
    }

    let query = `
      UPDATE public.${tableName}
      SET serial_number = $1, productname = $2, price = $3, per = $4, discount = $5
    `;

    const values = [serial_number, productname, priceNum, per, discountNum];

    let paramIndex = 6;

    query += `, image = $${paramIndex}`;
    values.push(finalImages.length > 0 ? JSON.stringify(finalImages) : null);
    paramIndex++;

    query += `, description = $${paramIndex}`;
    values.push(description);
    paramIndex++;

    if (status && ["on", "off"].includes(status)) {
      query += `, status = $${paramIndex}`;
      values.push(status);
      paramIndex++;
    }

    query += ` WHERE id = $${paramIndex} RETURNING id`;
    values.push(id);

    const result = await client.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Product not found" });
    }

    res.status(200).json({ message: "Product updated successfully" });
  } catch (err) {
    console.error("Error in updateProduct:", err);
    res.status(500).json({ message: "Failed to update product", error: err.message });
  } finally {
    client.release();
  }
};

exports.getProducts = async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    const productTypes = await getCachedProductTypes();

    const productQueries = productTypes.map(async (productType) => {
      const tableName = productType.toLowerCase().replace(/\s+/g, "_");
      const client = await pool.connect();
      try {
        const result = await client.query(
          `
          SELECT id, serial_number, productname, price, per, discount, status, fast_running, description, image
          FROM public.${tableName}
          ORDER BY id
          LIMIT $1 OFFSET $2
        `,
          [limit, offset]
        );

        return result.rows.map((row) => ({
          id: row.id,
          product_type: productType,
          serial_number: row.serial_number,
          productname: row.productname,
          price: row.price,
          per: row.per,
          discount: row.discount,
          image: row.image,
          status: row.status,
          fast_running: row.fast_running,
          description: row.description || "",
        }));
      } finally {
        client.release();
      }
    });

    const allProducts = (await Promise.all(productQueries)).flat();
    res.status(200).json({
      data: allProducts,
      page: Number.parseInt(page),
      limit: Number.parseInt(limit),
      total: allProducts.length,
    });
  } catch (err) {
    console.error("Error in getProducts:", err);
    res.status(500).json({ message: "Failed to fetch products", error: err.message });
  }
};

exports.addProductType = async (req, res) => {
  try {
    const { product_type } = req.body;
    if (!product_type) {
      return res.status(400).json({ message: "Product type is required" });
    }

    const formattedProductType = product_type.toLowerCase().replace(/\s+/g, "_");
    const typeCheck = await pool.query("SELECT product_type FROM public.products WHERE product_type = $1", [
      formattedProductType,
    ]);

    if (typeCheck.rows.length > 0) {
      return res.status(400).json({ message: "Product type already exists" });
    }

    await pool.query("INSERT INTO public.products (product_type) VALUES ($1)", [formattedProductType]);

    const tableName = formattedProductType;
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.${tableName} (
        id SERIAL PRIMARY KEY,
        serial_number VARCHAR(50) NOT NULL,
        productname VARCHAR(100) NOT NULL,
        price NUMERIC(10,2) NOT NULL,
        per VARCHAR(10) NOT NULL CHECK (per IN ('pieces', 'box', 'pkt')),
        discount NUMERIC(5,2) NOT NULL,
        image TEXT,
        description TEXT,
        status VARCHAR(10) NOT NULL DEFAULT 'off' CHECK (status IN ('on', 'off')),
        fast_running BOOLEAN DEFAULT false,
      )
    `);

    productTypeCache.data = [...(productTypeCache.data || []), formattedProductType];
    productTypeCache.timestamp = Date.now();

    res.status(201).json({ message: "Product type created successfully" });
  } catch (err) {
    console.error("Error in addProductType:", err);
    res.status(500).json({ message: "Failed to create product type", error: err.message });
  }
};

exports.getProductTypes = async (req, res) => {
  try {
    const result = await pool.query("SELECT product_type FROM public.products");
    res.status(200).json(result.rows);
  } catch (err) {
    console.error("Error in getProductTypes:", err);
    res.status(500).json({ message: "Failed to fetch product types", error: err.message });
  }
};

exports.deleteProduct = async (req, res) => {
  try {
    const { tableName, id } = req.params;
    const result = await pool.query(`SELECT image FROM public.${tableName} WHERE id = $1`, [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Delete images from Cloudinary
    if (result.rows[0].image) {
      const images = JSON.parse(result.rows[0].image) || [];
      for (const url of images) {
        const publicId = url.match(/\/mnc_products\/(.+?)\./)?.[1];
        if (publicId) {
          await cloudinary.uploader.destroy(`mnc_products/${publicId}`, {
            resource_type: url.includes("/video/") ? "video" : "image",
          });
        }
      }
    }

    const query = `DELETE FROM public.${tableName} WHERE id = $1 RETURNING id`;
    const deleteResult = await pool.query(query, [id]);

    if (deleteResult.rows.length === 0) {
      return res.status(404).json({ message: "Product not found" });
    }

    res.status(200).json({ message: "Product deleted successfully" });
  } catch (err) {
    console.error("Error in deleteProduct:", err);
    res.status(500).json({ message: "Failed to delete product", error: err.message });
  }
};

exports.deleteProductType = async (req, res) => {
  const client = await pool.connect();
  try {
    const { productType } = req.params;
    const formattedProductType = productType.toLowerCase().replace(/\s+/g, "_");

    const typeCheck = await client.query("SELECT product_type FROM public.products WHERE product_type = $1", [
      formattedProductType,
    ]);

    if (typeCheck.rows.length === 0) {
      return res.status(404).json({ message: "Product type not found" });
    }

    await client.query("BEGIN");

    const tableName = formattedProductType;
    // Delete all images associated with products in this table
    const products = await client.query(`SELECT image FROM public.${tableName}`);
    for (const product of products.rows) {
      if (product.image) {
        const images = JSON.parse(product.image) || [];
        for (const url of images) {
          const publicId = url.match(/\/mnc_products\/(.+?)\./)?.[1];
          if (publicId) {
            await cloudinary.uploader.destroy(`mnc_products/${publicId}`, {
              resource_type: url.includes("/video/") ? "video" : "image",
            });
          }
        }
      }
    }

    await client.query(`DELETE FROM public.${tableName}`);
    await client.query(`DROP TABLE IF EXISTS public.${tableName}`);
    await client.query("DELETE FROM public.products WHERE product_type = $1", [formattedProductType]);

    productTypeCache.data = (productTypeCache.data || []).filter((type) => type !== formattedProductType);
    productTypeCache.timestamp = Date.now();

    await client.query("COMMIT");
    res.status(200).json({ message: "Product type deleted successfully" });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error in deleteProductType:", err);
    res.status(500).json({ message: "Failed to delete product type", error: err.message });
  } finally {
    client.release();
  }
};

exports.toggleFastRunning = async (req, res) => {
  try {
    const { tableName, id } = req.params;
    const result = await pool.query(`SELECT fast_running FROM public.${tableName} WHERE id = $1`, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Product not found" });
    }

    const current = result.rows[0].fast_running;
    const updated = !current;

    await pool.query(`UPDATE public.${tableName} SET fast_running = $1 WHERE id = $2`, [updated, id]);

    res.status(200).json({ message: "Fast running status updated", fast_running: updated });
  } catch (err) {
    console.error("Error in toggleFastRunning:", err);
    res.status(500).json({ message: "Failed to update fast running status", error: err.message });
  }
};

exports.toggleProductStatus = async (req, res) => {
  try {
    const { tableName, id } = req.params;
    const currentStatusQuery = `SELECT status FROM public.${tableName} WHERE id = $1`;
    const currentStatusResult = await pool.query(currentStatusQuery, [id]);

    if (currentStatusResult.rows.length === 0) {
      return res.status(404).json({ message: "Product not found" });
    }

    const currentStatus = currentStatusResult.rows[0].status;
    const newStatus = currentStatus === "on" ? "off" : "on";

    const updateQuery = `UPDATE public.${tableName} SET status = $1 WHERE id = $2 RETURNING id, status`;
    const updateResult = await pool.query(updateQuery, [newStatus, id]);

    if (updateResult.rows.length === 0) {
      return res.status(404).json({ message: "Product not found" });
    }

    res.status(200).json({ message: "Status toggled successfully", status: newStatus });
  } catch (err) {
    console.error("Error in toggleProductStatus:", err);
    res.status(500).json({ message: "Failed to toggle status", error: err.message });
  }
};