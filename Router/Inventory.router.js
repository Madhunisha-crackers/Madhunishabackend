const express = require('express');
const router = express.Router();
const { addProduct, getProducts, addProductType, getProductTypes, updateProduct, deleteProduct, toggleProductStatus, toggleFastRunning, deleteProductType } = require('../Controller/Inventory.controller');
const multer = require('multer');
const { storage } = require('../Config/cloudinary');

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

router.post('/products', upload.array('images'), addProduct);
router.get('/products', getProducts);
router.post('/product-types', addProductType);
router.get('/product-types', getProductTypes);
router.delete('/product-types/:productType', deleteProductType);
router.put('/products/:tableName/:id', upload.array('images'), updateProduct);
router.delete('/products/:tableName/:id', deleteProduct);
router.patch('/products/:tableName/:id/toggle-status', toggleProductStatus);
router.patch('/products/:tableName/:id/toggle-fast-running', toggleFastRunning);

module.exports = router;