const express = require('express')
const nodemailer = require('nodemailer')
const router = express.Router()

// POST /api/send-wholesale-enquiry
router.post('/', async (req, res) => {
  const { name, email, mobile, message } = req.body

  if (!name || !email || !mobile || !message) {
    return res.status(400).json({ error: 'All fields are required' })
  }

  try {
    // Create transporter (use your email credentials here)
    const transporter = nodemailer.createTransport({
      service: 'Gmail',
      auth: {
        user: 'madhunishapyrotechsivakasi@gmail.com',
        pass: 'bhgf kqog gmfz oqfl'
      },
    })

    const mailOptions = {
      from: `"Madhu Nisha Crackers Enquiry" <${process.env.EMAIL_USER}>`,
      to: 'madhunishacrackers@gmail.com',
      subject: 'New Wholesale Enquiry from Website',
      html: `
        <h3>New Wholesale Enquiry</h3>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Mobile:</strong> ${mobile}</p>
        <p><strong>Message:</strong><br>${message}</p>
      `,
    }

    await transporter.sendMail(mailOptions)

    res.status(200).json({ message: 'Enquiry sent successfully' })
  } catch (error) {
    console.error('Email sending error:', error)
    res.status(500).json({ error: 'Failed to send enquiry' })
  }
})

module.exports = router
