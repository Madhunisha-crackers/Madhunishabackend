const express = require('express');
const router = express.Router();
const directController = require('../Controller/Direct.controller');

router.get('/customers', directController.getCustomers);
router.get('/products/types', directController.getProductTypes);
router.get('/products', directController.getProductsByType);
router.get('/aproducts', directController.getAproductsByType);
router.post('/bookings', directController.createBooking);
router.post('/quotations', directController.createQuotation);
router.get('/quotations', directController.getAllQuotations);
router.put('/quotations/:quotation_id', directController.updateQuotation);
router.put('/quotations/cancel/:quotation_id', directController.deleteQuotation);
router.get('/quotation/:quotation_id', directController.getQuotation);
router.get('/invoice/:order_id', directController.getInvoice);
router.post("/bookings/search", directController.searchBookings);
router.post("/quotations/search", directController.searchQuotations);

module.exports = router;