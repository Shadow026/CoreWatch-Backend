const pool = require('./database');

// ===== RESUMEN GENERAL =====
async function getResumen(req, res) {
  try {
    const query = `
      SELECT 
        COUNT(DISTINCT e.id) as total_equipos,
        SUM(CASE WHEN e.activo = true THEN 1 ELSE 0 END) as equipos_activos,
        SUM(CASE WHEN e.activo = false THEN 1 ELSE 0 END) as equipos_inactivos,
        ROUND(AVG(m.cpu_pct)::numeric, 2) as cpu_promedio,
        ROUND(AVG(m.ram_pct)::numeric, 2) as ram_pct_promedio,
        ROUND(AVG(m.temp_cpu)::numeric, 2) as temperatura_promedio,
        COUNT(CASE WHEN a.resuelta = false THEN 1 END) as alertas_activas
      FROM equipos e
      LEFT JOIN metricas m ON e.equipo_id = m.equipo_id
      LEFT JOIN alertas a ON e.equipo_id = a.equipo_id;
    `;
    
    const result = await pool.query(query);
    const data = result.rows[0] || {};
    
    res.json({
      total_equipos: parseInt(data.total_equipos) || 0,
      equipos_activos: parseInt(data.equipos_activos) || 0,
      equipos_inactivos: parseInt(data.equipos_inactivos) || 0,
      cpu_promedio: parseFloat(data.cpu_promedio) || 0,
      ram_pct_promedio: parseFloat(data.ram_pct_promedio) || 0,
      temperatura_promedio: parseFloat(data.temperatura_promedio) || 0,
      alertas_activas: parseInt(data.alertas_activas) || 0
    });
  } catch (error) {
    console.error('Error en getResumen:', error);
    res.status(500).json({ error: error.message });
  }
}

// ===== ESTADO ACTUAL DE TODOS LOS EQUIPOS =====
async function getEstado(req, res) {
  try {
    const query = `
      SELECT 
        e.id,
        e.equipo_id,
        e.nombre,
        e.ip,
        e.activo,
        e.ultimo_visto,
        m.cpu_pct,
        m.cpu_freq_mhz,
        m.ram_usada_mb,
        m.ram_total_mb,
        m.ram_pct,
        m.disco_usado_gb,
        m.disco_total_gb,
        m.disco_pct,
        m.temp_cpu,
        m.uptime_horas,
        m.total_procesos,
        m.timestamp
      FROM equipos e
      LEFT JOIN (
        SELECT DISTINCT ON (equipo_id) 
          equipo_id, cpu_pct, cpu_freq_mhz, ram_usada_mb, ram_total_mb, ram_pct,
          disco_usado_gb, disco_total_gb, disco_pct, temp_cpu, uptime_horas, 
          total_procesos, timestamp
        FROM metricas 
        ORDER BY equipo_id, timestamp DESC
      ) m ON e.equipo_id = m.equipo_id
      ORDER BY e.nombre;
    `;
    
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Error en getEstado:', error);
    res.status(500).json({ error: error.message });
  }
}

// ===== LISTAR TODOS LOS EQUIPOS =====
async function getEquipos(req, res) {
  try {
    const query = `
      SELECT id, equipo_id, nombre, os, ip, activo, ultimo_visto
      FROM equipos
      ORDER BY nombre;
    `;
    
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Error en getEquipos:', error);
    res.status(500).json({ error: error.message });
  }
}

// ===== OBTENER EQUIPO POR ID =====
async function getEquipoById(req, res) {
  try {
    const { id } = req.params;
    const query = 'SELECT * FROM equipos WHERE equipo_id = $1 OR id = $1;';
    
    const result = await pool.query(query, [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Equipo no encontrado' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error en getEquipoById:', error);
    res.status(500).json({ error: error.message });
  }
}

// ===== OBTENER MÉTRICAS DE UN EQUIPO =====
async function getMetricasByEquipo(req, res) {
  try {
    const { equipoId } = req.params;
    const query = `
      SELECT 
        id, equipo_id, timestamp, cpu_pct, cpu_freq_mhz, ram_usada_mb, ram_total_mb,
        ram_pct, disco_usado_gb, disco_total_gb, disco_pct, temp_cpu, uptime_horas,
        total_procesos
      FROM metricas
      WHERE equipo_id = $1
      ORDER BY timestamp DESC
      LIMIT 100;
    `;
    
    const result = await pool.query(query, [equipoId]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error en getMetricasByEquipo:', error);
    res.status(500).json({ error: error.message });
  }
}

// ===== OBTENER ALERTAS =====
async function getAlertas(req, res) {
  try {
    const query = `
      SELECT 
        id, equipo_id, tipo, severidad, descripcion, valor_actual, valor_umbral,
        resuelta, timestamp
      FROM alertas
      ORDER BY timestamp DESC
      LIMIT 100;
    `;
    
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Error en getAlertas:', error);
    res.status(500).json({ error: error.message });
  }
}

// ===== HEALTH CHECK =====
async function getHealth(req, res) {
  try {
    await pool.query('SELECT NOW();');
    res.json({ 
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: 'connected'
    });
  } catch (error) {
    console.error('Error en health check:', error);
    res.status(503).json({ 
      status: 'error',
      database: 'disconnected',
      error: error.message
    });
  }
}

module.exports = {
  getResumen,
  getEstado,
  getEquipos,
  getEquipoById,
  getMetricasByEquipo,
  getAlertas,
  getHealth
};
