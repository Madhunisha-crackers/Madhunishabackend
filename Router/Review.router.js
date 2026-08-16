const express = require('express');
const router = express.Router();
const { createReview, getReviews, getReviewSummary } = require('../Controller/Review.controller');

router.post('/', createReview);
router.get('/', getReviews);
router.get('/summary', getReviewSummary);

module.exports = router;
