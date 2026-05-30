const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,

  ssl: {
    rejectUnauthorized: false
  },

  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

// Test conexión inicial
pool.connect()
  .then(client => {
    console.log('✅ PostgreSQL conectado correctamente');

    client.query('SELECT NOW()')
      .then(res => {
        console.log('🕒 Hora servidor PostgreSQL:', res.rows[0].now);
        client.release();
      })
      .catch(err => {
        console.error('❌ Error query test:', err);
        client.release();
      });

  })
  .catch(err => {
    console.error('❌ Error conectando PostgreSQL:', err);
  });

// Manejo de errores del pool
pool.on('error', (err) => {
  console.error('❌ Error inesperado PostgreSQL:', err);
});

module.exports = pool;