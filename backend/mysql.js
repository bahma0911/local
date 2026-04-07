import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const dbConfig = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'negadras_user',
  password: process.env.DB_PASS || 'StrongPassword123',
  database: process.env.DB_NAME || 'negadras_dev',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

const pool = mysql.createPool(dbConfig);

export const connectMySQL = async () => {
  try {
    const connection = await pool.getConnection();
    console.log('Connected to MySQL database');
    connection.release();
  } catch (err) {
    console.error('Failed to connect to MySQL:', err.message);
    if (process.env.NODE_ENV === 'production') process.exit(1);
  }
};

export default pool;