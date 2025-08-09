const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  host: process.env.PGHOST,
  port: process.env.PGPORT,
  database: process.env.PGDATABASE,
});

exports.getStates = async (req, res) => {
  try {
    const result = await pool.query('SELECT name, min_rate FROM states');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching states:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.addState = async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'State name is required' });

  try {
    const checkResult = await pool.query('SELECT name FROM states WHERE name = $1', [name]);
    if (checkResult.rows.length > 0) {
      return res.status(400).json({ error: 'State already exists' });
    }

    await pool.query('INSERT INTO states (name) VALUES ($1)', [name]);

    const tableName = `districts_${name.toLowerCase().replace(/\s+/g, '_')}`;
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${tableName} (
        id BIGSERIAL PRIMARY KEY,
        name TEXT NOT NULL
      )
    `);

    res.status(201).json({ message: 'State added successfully' });
  } catch (error) {
    console.error('Error adding state:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.deleteState = async (req, res) => {
  const { stateName } = req.params;

  try {
    const tableName = `districts_${stateName.toLowerCase().replace(/\s+/g, '_')}`;
    await pool.query(`DROP TABLE IF EXISTS ${tableName}`);

    await pool.query('DELETE FROM states WHERE name = $1', [stateName]);

    res.json({ message: 'State deleted successfully' });
  } catch (error) {
    console.error('Error deleting state:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.getDistricts = async (req, res) => {
  const { stateName } = req.params;
  const tableName = `districts_${stateName.toLowerCase().replace(/\s+/g, '_')}`;

  try {
    const tableExists = await pool.query(
      `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1)`,
      [tableName]
    );
    if (!tableExists.rows[0].exists) {
      return res.status(404).json({ error: 'State not found' });
    }

    const result = await pool.query(`SELECT id, name FROM ${tableName}`);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching districts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.addDistrict = async (req, res) => {
  const { stateName } = req.params;
  const { name } = req.body;
  const tableName = `districts_${stateName.toLowerCase().replace(/\s+/g, '_')}`;

  if (!name) return res.status(400).json({ error: 'District name is required' });

  try {
    // Check if table exists
    const tableExists = await pool.query(
      `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1)`,
      [tableName]
    );
    if (!tableExists.rows[0].exists) {
      return res.status(404).json({ error: 'State not found' });
    }

    // Add district
    await pool.query(`INSERT INTO ${tableName} (name) VALUES ($1)`, [name]);
    res.status(201).json({ message: 'District added successfully' });
  } catch (error) {
    console.error('Error adding district:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.deleteDistrict = async (req, res) => {
  const { stateName, districtId } = req.params;
  const tableName = `districts_${stateName.toLowerCase().replace(/\s+/g, '_')}`;

  try {
    // Check if table exists
    const tableExists = await pool.query(
      `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1)`,
      [tableName]
    );
    if (!tableExists.rows[0].exists) {
      return res.status(404).json({ error: 'State not found' });
    }

    // Delete district
    await pool.query(`DELETE FROM ${tableName} WHERE id = $1`, [districtId]);
    res.json({ message: 'District deleted successfully' });
  } catch (error) {
    console.error('Error deleting district:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.updateRate = async (req, res) => {
  const { stateName } = req.params;
  const { rate } = req.body;

  if (rate == null || isNaN(rate)) {
    return res.status(400).json({ error: 'Valid rate is required' });
  }

  try {
    const result = await pool.query(
      'UPDATE states SET min_rate = $1 WHERE name = $2 RETURNING min_rate',
      [rate, stateName]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'State not found' });
    }
    res.json({ message: 'Rate updated successfully', min_rate: result.rows[0].min_rate });
  } catch (error) {
    console.error('Error updating rate:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};