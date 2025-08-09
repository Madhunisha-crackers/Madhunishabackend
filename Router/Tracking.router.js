const express = require('express');
const router = express.Router();
const trackingController = require('../Controller/Tracking.controller');

router.get('/bookings', trackingController.getAllBookings);
router.put('/bookings/:id/status', trackingController.updateBookingStatus);
router.get('/filtered-bookings', trackingController.getFilteredBookings);
router.put('/fbookings/:id/status', trackingController.updateFilterBookingStatus);

module.exports = router;