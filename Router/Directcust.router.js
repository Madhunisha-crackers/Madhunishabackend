const express = require('express');
const router = express.Router();
const directCustController = require('../Controller/Directcust.controller');

router.post('/customers', directCustController.addCustomer);
router.get('/agents', directCustController.getAgents);

module.exports = router;