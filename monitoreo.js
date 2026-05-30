const express = require('express');
const router = express.Router();
const pool = require('./database');


// ======================================================
// HEALTH CHECK API
// ======================================================

router.get('/ping', async (req, res) => {
  res.json({
    success: true,
    message: 'API funcionando correctamente'
  });
});


// ======================================================
// OBTENER RESUMEN GENERAL
// ======================================================

router.get('/resumen', async (req, res) => {
  try {
    const equipos = await pool.query(`
      SELECT COUNT(*) AS total
      FROM equipos
    `);

    const activos = await pool.query(`
      SELECT COUNT(*) AS activos
      FROM equipos
      WHERE activo = true
    `);

    const metricas = await pool.query(`
      SELECT
        AVG(cpu_pct) AS cpu_promedio,
        AVG(ram_pct) AS ram_pct_promedio,
        AVG(temp_cpu) AS temperatura_promedio
      FROM metricas
    `);

    const alertas = await pool.query(`
      SELECT COUNT(*) AS alertas
      FROM alertas
      WHERE resuelta = false
    `);

    res.json({
      total_equipos: parseInt(equipos.rows[0].total) || 0,
      equipos_activos: parseInt(activos.rows[0].activos) || 0,
      equipos_inactivos:
        (parseInt(equipos.rows[0].total) || 0) -
        (parseInt(activos.rows[0].activos) || 0),
      cpu_promedio: parseFloat(metricas.rows[0].cpu_promedio || 0),
      ram_pct_promedio: parseFloat(metricas.rows[0].ram_pct_promedio || 0),
      temperatura_promedio: parseFloat(metricas.rows[0].temperatura_promedio || 0),
      alertas_activas: parseInt(alertas.rows[0].alertas) || 0
    });

  } catch (error) {
    console.error('Error resumen:', error);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});


// ======================================================
// OBTENER ESTADO DE COMPUTADORAS
// ======================================================

router.get('/estado', async (req, res) => {
  try {
    const query = `
      SELECT
        e.equipo_id,
        e.nombre,
        e.ip,
        e.activo,
        e.ultimo_visto,

        m.cpu_pct,
        m.ram_pct,
        m.disco_pct,
        m.temp_cpu,
        m.timestamp,

        m.ram_usada_mb,
        m.ram_total_mb,
        m.disco_usado_gb,
        m.disco_total_gb

      FROM equipos e

      LEFT JOIN LATERAL (
        SELECT *
        FROM metricas
        WHERE TRIM(LOWER(metricas.equipo_id)) =
              TRIM(LOWER(e.equipo_id))
        ORDER BY timestamp DESC
        LIMIT 1
      ) m ON true

      ORDER BY e.nombre ASC;
    `;

    const result = await pool.query(query);

    res.json(result.rows);

  } catch (error) {
    console.error('❌ Error /estado:', error);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});


// ======================================================
// ALIAS /equipos
// ======================================================

router.get('/equipos', async (req, res) => {
  try {
    const query = `
      SELECT
        e.equipo_id,
        e.nombre,
        e.ip,
        e.activo,
        e.os,
        e.os_version,
        e.ultimo_visto,

        m.cpu_pct,
        m.ram_pct,
        m.ram_usada_mb,
        m.ram_total_mb,
        m.disco_pct,
        m.disco_usado_gb,
        m.disco_total_gb,
        m.temp_cpu,
        m.timestamp

      FROM equipos e

      LEFT JOIN LATERAL (
        SELECT *
        FROM metricas
        WHERE TRIM(LOWER(metricas.equipo_id)) =
              TRIM(LOWER(e.equipo_id))
        ORDER BY timestamp DESC
        LIMIT 1
      ) m ON true

      ORDER BY e.nombre ASC;
    `;

    const result = await pool.query(query);

    res.json(result.rows);

  } catch (error) {
    console.error('Error equipos:', error);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});


// ======================================================
// ALERTAS CON NOMBRE DE EQUIPO
// ======================================================

router.get('/alertas', async (req, res) => {
  try {
    const query = `
      SELECT
        a.id,
        a.equipo_id,
        COALESCE(e.nombre, a.equipo_id) AS equipo_nombre,
        a.timestamp,
        a.tipo,
        a.severidad,
        a.descripcion,
        a.valor_actual,
        a.valor_umbral,
        a.resuelta,
        a.recibido_en
      FROM alertas a
      LEFT JOIN equipos e
        ON TRIM(LOWER(a.equipo_id)) =
           TRIM(LOWER(e.equipo_id))
      ORDER BY a.timestamp DESC;
    `;

    const result = await pool.query(query);

    res.json(result.rows);

  } catch (error) {
    console.error('Error alertas:', error);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});


// ======================================================
// HISTORIAL CPU
// ======================================================

router.get('/cpu/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT
        timestamp,
        cpu_pct
      FROM metricas
      WHERE TRIM(LOWER(equipo_id)) =
            TRIM(LOWER($1))
      ORDER BY timestamp ASC
      LIMIT 20;
    `;

    const result = await pool.query(query, [id]);

    res.json(result.rows);

  } catch (error) {
    console.error('Error CPU:', error);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});


// ======================================================
// HISTORIAL RAM
// ======================================================

router.get('/ram/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT
        timestamp,
        ram_usada_mb,
        ram_total_mb
      FROM metricas
      WHERE TRIM(LOWER(equipo_id)) =
            TRIM(LOWER($1))
      ORDER BY timestamp ASC
      LIMIT 20;
    `;

    const result = await pool.query(query, [id]);

    res.json(result.rows);

  } catch (error) {
    console.error('Error RAM:', error);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});


// ======================================================
// DETALLE DE EQUIPO
// ======================================================

router.get('/equipos/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT *
      FROM equipos
      WHERE TRIM(LOWER(equipo_id)) =
            TRIM(LOWER($1))
      LIMIT 1;
    `;

    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Equipo no encontrado'
      });
    }

    res.json(result.rows[0]);

  } catch (error) {
    console.error('Error detalle equipo:', error);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ======================================================
// REPORTE: SALUD GENERAL DEL SISTEMA
// ======================================================

router.get('/reportes/salud', async (req, res) => {
  try {
    const resumenQuery = `
      SELECT
        COUNT(*) AS total_equipos,
        COUNT(*) FILTER (WHERE activo = true) AS equipos_activos,
        COUNT(*) FILTER (WHERE activo = false) AS equipos_inactivos
      FROM equipos;
    `;

    const equiposQuery = `
      SELECT
        e.equipo_id,
        e.nombre,
        e.ip,
        e.activo,
        e.ultimo_visto,

        m.cpu_pct,
        m.ram_pct,
        m.disco_pct,
        m.temp_cpu,
        m.timestamp

      FROM equipos e

      LEFT JOIN LATERAL (
        SELECT *
        FROM metricas
        WHERE TRIM(LOWER(metricas.equipo_id)) =
              TRIM(LOWER(e.equipo_id))
        ORDER BY timestamp DESC
        LIMIT 1
      ) m ON true

      ORDER BY e.nombre ASC;
    `;

    const resumen = await pool.query(resumenQuery);
    const equipos = await pool.query(equiposQuery);

    const listaEquipos = equipos.rows;

    const saludables = listaEquipos.filter(e =>
      e.activo &&
      Number(e.cpu_pct || 0) < 80 &&
      Number(e.ram_pct || 0) < 85 &&
      Number(e.disco_pct || 0) < 90 &&
      Number(e.temp_cpu || 0) < 75
    ).length;

    const advertencia = listaEquipos.filter(e =>
      e.activo &&
      (
        Number(e.cpu_pct || 0) >= 80 ||
        Number(e.ram_pct || 0) >= 85 ||
        Number(e.disco_pct || 0) >= 90 ||
        Number(e.temp_cpu || 0) >= 75
      )
    ).length;

    res.json({
      resumen: {
        total_equipos: parseInt(resumen.rows[0].total_equipos) || 0,
        equipos_activos: parseInt(resumen.rows[0].equipos_activos) || 0,
        equipos_inactivos: parseInt(resumen.rows[0].equipos_inactivos) || 0,
        saludables,
        advertencia
      },
      equipos: listaEquipos
    });

  } catch (error) {
    console.error('Error reporte salud:', error);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});


// ======================================================
// REPORTE: HISTÓRICO DE RENDIMIENTO
// ======================================================

router.get('/reportes/rendimiento', async (req, res) => {
  try {
    const query = `
      SELECT
        equipo_id,
        ROUND(AVG(cpu_pct)::numeric, 2) AS cpu_promedio,
        ROUND(AVG(ram_pct)::numeric, 2) AS ram_promedio,
        ROUND(AVG(disco_pct)::numeric, 2) AS disco_promedio,
        ROUND(AVG(temp_cpu)::numeric, 2) AS temp_promedio,
        COUNT(*) AS muestras,
        MIN(timestamp) AS desde,
        MAX(timestamp) AS hasta
      FROM metricas
      GROUP BY equipo_id
      ORDER BY cpu_promedio DESC;
    `;

    const result = await pool.query(query);

    res.json(result.rows);

  } catch (error) {
    console.error('Error reporte rendimiento:', error);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});


// ======================================================
// REPORTE: ALERTAS Y EVENTOS
// ======================================================

router.get('/reportes/alertas', async (req, res) => {
  try {
    const resumenQuery = `
      SELECT
        COUNT(*) AS total_alertas,
        COUNT(*) FILTER (WHERE severidad = 'critical') AS criticas,
        COUNT(*) FILTER (WHERE severidad = 'warning') AS warnings,
        COUNT(*) FILTER (WHERE severidad = 'info') AS infos,
        COUNT(*) FILTER (WHERE resuelta = false) AS activas
      FROM alertas;
    `;

    const alertasQuery = `
      SELECT
        a.id,
        a.equipo_id,
        COALESCE(e.nombre, a.equipo_id) AS equipo_nombre,
        a.timestamp,
        a.tipo,
        a.severidad,
        a.descripcion,
        a.valor_actual,
        a.valor_umbral,
        a.resuelta
      FROM alertas a
      LEFT JOIN equipos e
        ON TRIM(LOWER(a.equipo_id)) =
           TRIM(LOWER(e.equipo_id))
      ORDER BY a.timestamp DESC
      LIMIT 50;
    `;

    const resumen = await pool.query(resumenQuery);
    const alertas = await pool.query(alertasQuery);

    res.json({
      resumen: {
        total_alertas: parseInt(resumen.rows[0].total_alertas) || 0,
        criticas: parseInt(resumen.rows[0].criticas) || 0,
        warnings: parseInt(resumen.rows[0].warnings) || 0,
        infos: parseInt(resumen.rows[0].infos) || 0,
        activas: parseInt(resumen.rows[0].activas) || 0
      },
      alertas: alertas.rows
    });

  } catch (error) {
    console.error('Error reporte alertas:', error);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});


// ======================================================
// REPORTE: DIAGNÓSTICO DE HARDWARE
// ======================================================

router.get('/reportes/hardware', async (req, res) => {
  try {
    const query = `
      SELECT
        e.equipo_id,
        e.nombre,
        e.ip,
        e.activo,

        ROUND(AVG(m.cpu_pct)::numeric, 2) AS cpu_promedio,
        ROUND(AVG(m.ram_pct)::numeric, 2) AS ram_promedio,
        ROUND(AVG(m.disco_pct)::numeric, 2) AS disco_promedio,
        ROUND(AVG(m.temp_cpu)::numeric, 2) AS temp_promedio,

        COUNT(a.id) AS total_alertas

      FROM equipos e

      LEFT JOIN metricas m
        ON TRIM(LOWER(m.equipo_id)) =
           TRIM(LOWER(e.equipo_id))

      LEFT JOIN alertas a
        ON TRIM(LOWER(a.equipo_id)) =
           TRIM(LOWER(e.equipo_id))

      GROUP BY
        e.equipo_id,
        e.nombre,
        e.ip,
        e.activo

      ORDER BY
        total_alertas DESC,
        temp_promedio DESC,
        cpu_promedio DESC;
    `;

    const result = await pool.query(query);

    const equipos = result.rows.map(equipo => {
      const cpu = Number(equipo.cpu_promedio || 0);
      const ram = Number(equipo.ram_promedio || 0);
      const disco = Number(equipo.disco_promedio || 0);
      const temp = Number(equipo.temp_promedio || 0);
      const alertas = Number(equipo.total_alertas || 0);

      let diagnostico = 'Saludable';

      if (
        cpu >= 90 ||
        ram >= 90 ||
        disco >= 95 ||
        temp >= 85 ||
        alertas >= 5
      ) {
        diagnostico = 'Crítico';
      } else if (
        cpu >= 75 ||
        ram >= 80 ||
        disco >= 85 ||
        temp >= 75 ||
        alertas >= 2
      ) {
        diagnostico = 'Advertencia';
      }

      return {
        ...equipo,
        diagnostico
      };
    });

    res.json(equipos);

  } catch (error) {
    console.error('Error reporte hardware:', error);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ======================================================
// HISTORIAL GLOBAL PROMEDIO
// ======================================================

router.get('/global/historial', async (req, res) => {
  try {
    const query = `
      SELECT
        date_trunc('minute', timestamp) AS timestamp,
        ROUND(AVG(cpu_pct)::numeric, 2) AS cpu_pct,
        ROUND(AVG(ram_pct)::numeric, 2) AS ram_pct
      FROM metricas
      GROUP BY date_trunc('minute', timestamp)
      ORDER BY timestamp ASC
      LIMIT 20;
    `;

    const result = await pool.query(query);

    res.json(result.rows);

  } catch (error) {
    console.error('Error historial global:', error);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ======================================================
// LOGIN DE USUARIOS
// ======================================================

router.post('/login', async (req, res) => {
  try {
    const { usuario, password } = req.body;

    if (!usuario || !password) {
      return res.status(400).json({
        success: false,
        error: 'Usuario y contraseña son obligatorios'
      });
    }

    const query = `
      SELECT
        id,
        usuario,
        rol,
        activo
      FROM usuarios
      WHERE LOWER(usuario) = LOWER($1)
        AND password_hash = $2
        AND activo = true
      LIMIT 1;
    `;

    const result = await pool.query(query, [
      usuario,
      password
    ]);

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Credenciales incorrectas'
      });
    }

    const user = result.rows[0];

    res.json({
      success: true,
      user: {
        id: user.id,
        usuario: user.usuario,
        rol: user.rol
      }
    });

  } catch (error) {
    console.error('Error login:', error);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;