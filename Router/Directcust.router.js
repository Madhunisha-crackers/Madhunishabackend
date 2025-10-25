// Updated router.js
const express = require('express');
const router = express.Router();
const directCustController = require('../Controller/Directcust.controller');

router.post('/customers', directCustController.addCustomer);
router.get('/customers', directCustController.getCustomers);
router.put('/customers/:id', directCustController.updateCustomer);
router.delete('/customers/:id', directCustController.deleteCustomer);
router.get('/agents', directCustController.getAgents);

module.exports = router;