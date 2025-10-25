// Updated Directcust.controller.js
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  host: process.env.PGHOST,
  port: process.env.PGPORT,
  database: process.env.PGDATABASE,
});

exports.addCustomer = async (req, res) => {
  const {
    customer_name,
    state,
    district,
    mobile_number,
    email,
    address,
    customer_type,
    agent_id,
    agent_name,
    agent_contact,
    agent_email,
    agent_state,
    agent_district,
    cust_agent_name,
    cust_agent_contact,
    cust_agent_email,
    cust_agent_address,
    cust_agent_district,
    cust_agent_state,
  } = req.body;

  try {
    // Helper function to fetch district name by ID and state
    const getDistrictName = async (districtId, stateName) => {
      if (!districtId) return null;
      const tableName = `districts_${stateName.toLowerCase().replace(/\s+/g, '_')}`;
      const result = await pool.query(
        `SELECT name FROM ${tableName} WHERE id = $1`,
        [districtId]
      );
      if (result.rows.length === 0) {
        throw new Error(`District with ID ${districtId} not found for state ${stateName}`);
      }
      return result.rows[0].name;
    };

    let finalAgentId = agent_id;

    if (customer_type === 'Agent') {
      const agentDistrictName = await getDistrictName(agent_district, agent_state);
      const agentResult = await pool.query(
        `INSERT INTO public.customers (customer_name, state, district, mobile_number, email, address, customer_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [
          agent_name || null,
          agent_state || null,
          agentDistrictName,
          agent_contact || null,
          agent_email || null,
          address || null,
          'Agent',
        ]
      );
      finalAgentId = agentResult.rows[0].id;
      return res.status(201).json({ id: finalAgentId, message: 'Agent created successfully' });
    }

    if (customer_type === 'Customer of Selected Agent' && !agent_id) {
      return res.status(400).json({ error: 'Agent ID is required for Customer of Selected Agent.' });
    }

    let insertName, insertState, insertDistrict, insertMobile, insertEmail, insertAddress;

    if (customer_type === 'Customer of Selected Agent') {
      const custAgentDistrictName = await getDistrictName(cust_agent_district, cust_agent_state);
      insertName = cust_agent_name || null;
      insertState = cust_agent_state || null;
      insertDistrict = custAgentDistrictName;
      insertMobile = cust_agent_contact || null;
      insertEmail = cust_agent_email || null;
      insertAddress = cust_agent_address || null;
    } else {
      const districtName = await getDistrictName(district, state);
      insertName = customer_name || null;
      insertState = state || null;
      insertDistrict = districtName;
      insertMobile = mobile_number || null;
      insertEmail = email || null;
      insertAddress = address || null;
    }

    const result = await pool.query(
      `INSERT INTO public.customers (customer_name, state, district, mobile_number, email, address, customer_type, agent_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        insertName,
        insertState,
        insertDistrict,
        insertMobile,
        insertEmail,
        insertAddress,
        customer_type || 'Customer',
        finalAgentId || null,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error adding customer:', error.stack);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

exports.updateCustomer = async (req, res) => {
  const { id } = req.params;
  const {
    customer_name,
    state,
    district,
    mobile_number,
    email,
    address,
    customer_type,
    agent_id,
    agent_name,
    agent_contact,
    agent_email,
    agent_state,
    agent_district,
    cust_agent_name,
    cust_agent_contact,
    cust_agent_email,
    cust_agent_address,
    cust_agent_district,
    cust_agent_state,
  } = req.body;

  try {
    // Same helper as add
    const getDistrictName = async (districtId, stateName) => {
      if (!districtId) return null;
      const tableName = `districts_${stateName.toLowerCase().replace(/\s+/g, '_')}`;
      const result = await pool.query(
        `SELECT name FROM ${tableName} WHERE id = $1`,
        [districtId]
      );
      if (result.rows.length === 0) {
        throw new Error(`District with ID ${districtId} not found for state ${stateName}`);
      }
      return result.rows[0].name;
    };

    let finalAgentId = agent_id;

    if (customer_type === 'Agent') {
      const agentDistrictName = await getDistrictName(agent_district, agent_state);
      const result = await pool.query(
        `UPDATE public.customers SET customer_name = $1, state = $2, district = $3, mobile_number = $4, email = $5, address = $6, customer_type = $7, agent_id = NULL
         WHERE id = $8 RETURNING *`,
        [
          agent_name || null,
          agent_state || null,
          agentDistrictName,
          agent_contact || null,
          agent_email || null,
          address || null,
          'Agent',
          id,
        ]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Customer not found' });
      }
      return res.json(result.rows[0]);
    }

    if (customer_type === 'Customer of Selected Agent' && !agent_id) {
      return res.status(400).json({ error: 'Agent ID is required for Customer of Selected Agent.' });
    }

    let updateName, updateState, updateDistrict, updateMobile, updateEmail, updateAddress;

    if (customer_type === 'Customer of Selected Agent') {
      const custAgentDistrictName = await getDistrictName(cust_agent_district, cust_agent_state);
      updateName = cust_agent_name || null;
      updateState = cust_agent_state || null;
      updateDistrict = custAgentDistrictName;
      updateMobile = cust_agent_contact || null;
      updateEmail = cust_agent_email || null;
      updateAddress = cust_agent_address || null;
    } else {
      const districtName = await getDistrictName(district, state);
      updateName = customer_name || null;
      updateState = state || null;
      updateDistrict = districtName;
      updateMobile = mobile_number || null;
      updateEmail = email || null;
      updateAddress = address || null;
    }

    const result = await pool.query(
      `UPDATE public.customers SET customer_name = $1, state = $2, district = $3, mobile_number = $4, email = $5, address = $6, customer_type = $7, agent_id = $8
       WHERE id = $9 RETURNING *`,
      [
        updateName,
        updateState,
        updateDistrict,
        updateMobile,
        updateEmail,
        updateAddress,
        customer_type || 'Customer',
        finalAgentId || null,
        id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating customer:', error.stack);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

exports.deleteCustomer = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM public.customers WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    res.json({ message: 'Customer deleted successfully' });
  } catch (error) {
    console.error('Error deleting customer:', error.stack);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

exports.getAgents = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, customer_name FROM public.customers WHERE customer_type = $1",
      ['Agent']
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching agents:', error.stack);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

exports.getCustomers = async (req, res) => {
  const { type } = req.query;
  try {
    let query = 'SELECT * FROM public.customers';
    const params = [];
    if (type) {
      query += ' WHERE customer_type = $1';
      params.push(type);
    }
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching customers:', error.stack);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};