const express = require('express');
const router = express.Router();
const salesAnalysisController = require('../Controller/SalesAnalysis.controller');

router.get('/sales-analysis/detailed', salesAnalysisController.getSalesAnalysis);

module.exports = router;