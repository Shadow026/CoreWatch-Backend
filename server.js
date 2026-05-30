const express = require('express');
const cors = require('cors');
require('dotenv').config();

const monitoreoRoutes = require('./monitoreo');
const pool = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT NOW();');
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: 'connected',
      port: PORT
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({
      status: 'error',
      database: 'disconnected',
      error: error.message
    });
  }
});

// API routes
app.use('/api', monitoreoRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔════════════════════════════════════════╗
║      CoreWatch Backend Iniciado       ║
╠════════════════════════════════════════╣
║ 🚀 Puerto: ${PORT}
║ 🔗 URL: http://localhost:${PORT}
║ 📊 API: http://localhost:${PORT}/api
║ 💚 Health: http://localhost:${PORT}/api/health
║ 🗄️ BD: PostgreSQL Railway
╚════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM recibido. Cerrando servidor...');
  server.close(() => {
    console.log('Servidor cerrado');
    pool.end();
    process.exit(0);
  });
});

module.exports = app;
