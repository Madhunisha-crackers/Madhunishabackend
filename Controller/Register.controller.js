const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  host: process.env.PGHOST,
  port: process.env.PGPORT,
  database: process.env.PGDATABASE,
});

exports.registerUser = async (req, res) => {
  try {
    const { username, password, companyname, licencenumber, address, state, district, mobile_number, email } = req.body;
    
    // Validate required fields
    if (!username || !password || !companyname || !address || !state || !district || !mobile_number || !email) {
      return res.status(400).json({ message: 'Please provide all required fields' });
    }

    // Check if username already exists
    const userExists = await pool.query('SELECT * FROM public.users WHERE username = $1', [username]);
    if (userExists.rows.length > 0) {
      return res.status(400).json({ message: 'Username already exists' });
    }

    // Check if mobile number already exists
    const mobileExists = await pool.query('SELECT * FROM public.users WHERE mobile_number = $1', [mobile_number]);
    if (mobileExists.rows.length > 0) {
      return res.status(400).json({ message: 'Mobile number already registered' });
    }

    // Check if email already exists
    const emailExists = await pool.query('SELECT * FROM public.users WHERE email = $1', [email]);
    if (emailExists.rows.length > 0) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Insert new user
    const newUser = await pool.query(
      'INSERT INTO public.users (username, password, companyname, licencenumber, address, state, district, mobile_number, email) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id, username, companyname, mobile_number, email',
      [username, hashedPassword, companyname, licencenumber || null, address, state, district, mobile_number, email]
    );

    res.status(201).json({
      message: 'User registered successfully',
      user: newUser.rows[0]
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
};

exports.loginUser = async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validate input
    if (!username || !password) {
      return res.status(400).json({ message: 'Please provide username and password' });
    }

    // Check if user exists
    const user = await pool.query('SELECT * FROM public.users WHERE username = $1', [username]);
    if (user.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.rows[0].password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    res.json({
      message: 'Login successful',
      user: {
        id: user.rows[0].id,
        username: user.rows[0].username,
        companyname: user.rows[0].companyname,
        mobile_number: user.rows[0].mobile_number
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
};

exports.getUserDetails = async (req, res) => {
  try {
    const { username } = req.params;
    const user = await pool.query(
      'SELECT username, companyname, licencenumber, address, state, district, mobile_number, email FROM public.users WHERE username = $1',
      [username]
    );
    if (user.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user.rows[0]);
  } catch (error) {
    console.error('Error fetching user details:', error);
    res.status(500).json({ message: 'Server error fetching user details' });
  }
};

exports.updateUserDetails = async (req, res) => {
  try {
    const { username } = req.params;
    const { companyname, licencenumber, address, state, district, mobile_number } = req.body;

    if (!companyname || !address || !state || !district || !mobile_number) {
      return res.status(400).json({ message: 'Please provide all required fields' });
    }

    const mobileExists = await pool.query(
      'SELECT * FROM public.users WHERE mobile_number = $1 AND username != $2',
      [mobile_number, username]
    );
    if (mobileExists.rows.length > 0) {
      return res.status(400).json({ message: 'Mobile number already registered' });
    }

    const updatedUser = await pool.query(
      'UPDATE public.users SET companyname = $1, licencenumber = $2, address = $3, state = $4, district = $5, mobile_number = $6 WHERE username = $7 RETURNING username, companyname, licencenumber, address, state, district, mobile_number',
      [companyname, licencenumber || null, address, state, district, mobile_number, username]
    );

    if (updatedUser.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      message: 'User details updated successfully',
      user: updatedUser.rows[0]
    });
  } catch (error) {
    console.error('Error updating user details:', error);
    res.status(500).json({ message: 'Server error updating user details' });
  }
};