const app = require('./app');
const pool = require('./config/database');

const port = Number(process.env.PORT || 3001);

async function start() {
  try {
    await pool.query('SELECT 1');
    app.listen(port, () => console.log(`API server listening on port ${port}`));
  } catch (error) {
    console.error('Unable to connect to MySQL:', error.message);
    process.exitCode = 1;
  }
}

start();
