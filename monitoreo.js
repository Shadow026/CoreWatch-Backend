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
        CASE
          WHEN m.timestamp IS NULL THEN false
          WHEN m.timestamp < NOW() - INTERVAL '2 hours' THEN false
          ELSE true
        END AS activo,
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
        CASE
          WHEN m.timestamp IS NULL THEN false
          WHEN m.timestamp < NOW() - INTERVAL '2 hours' THEN false
          ELSE true
        END AS activo,
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
    const equiposQuery = `
      SELECT
        e.equipo_id,
        e.nombre,
        e.ip,

        CASE
          WHEN m.timestamp IS NULL THEN false
          WHEN m.timestamp < NOW() - INTERVAL '2 hours' THEN false
          ELSE true
        END AS activo,

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

    const equipos = await pool.query(equiposQuery);
    const listaEquipos = equipos.rows;

    const total = listaEquipos.length;

    const activos = listaEquipos.filter(e => e.activo).length;

    const inactivos = listaEquipos.filter(e => !e.activo).length;

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
        total_equipos: total,
        equipos_activos: activos,
        equipos_inactivos: inactivos,
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

// ======================================================
// MARCAR TODAS LAS ALERTAS COMO RESUELTAS
// ======================================================

router.put('/alertas/limpiar', async (req, res) => {
  try {
    const query = `
      UPDATE alertas
      SET resuelta = true
      WHERE resuelta = false
      RETURNING *;
    `;

    const result = await pool.query(query);

    res.json({
      success: true,
      mensaje: 'Alertas limpiadas correctamente',
      total_actualizadas: result.rowCount
    });

  } catch (error) {
    console.error('Error limpiando alertas:', error);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ======================================================
// IA LOCAL - DIAGNÓSTICO DE EQUIPO
// ======================================================

router.post('/ia/diagnostico/:equipoId', async (req, res) => {
  try {
    const { equipoId } = req.params;

    const equipoQuery = `
      SELECT
        e.equipo_id,
        e.nombre,
        e.ip,
        e.os,
        e.os_version,
        e.ultimo_visto,

        CASE
          WHEN m.timestamp IS NULL THEN false
          WHEN m.timestamp < NOW() - INTERVAL '2 hours' THEN false
          ELSE true
        END AS activo,

        m.timestamp AS ultima_metrica,
        m.cpu_pct,
        m.ram_pct,
        m.disco_pct,
        m.temp_cpu,
        m.ram_usada_mb,
        m.ram_total_mb,
        m.disco_usado_gb,
        m.disco_total_gb,
        m.uptime_horas,
        m.total_procesos

      FROM equipos e

      LEFT JOIN LATERAL (
        SELECT *
        FROM metricas
        WHERE TRIM(LOWER(metricas.equipo_id)) =
              TRIM(LOWER(e.equipo_id))
        ORDER BY timestamp DESC
        LIMIT 1
      ) m ON true

      WHERE TRIM(LOWER(e.equipo_id)) =
            TRIM(LOWER($1))

      LIMIT 1;
    `;

    const equipoResult = await pool.query(equipoQuery, [equipoId]);

    if (equipoResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Equipo no encontrado'
      });
    }

    const equipo = equipoResult.rows[0];

    const alertasQuery = `
      SELECT
        tipo,
        severidad,
        descripcion,
        valor_actual,
        valor_umbral,
        timestamp,
        resuelta
      FROM alertas
      WHERE TRIM(LOWER(equipo_id)) =
            TRIM(LOWER($1))
      ORDER BY timestamp DESC
      LIMIT 10;
    `;

    const alertasResult = await pool.query(alertasQuery, [equipoId]);

    let procesos = [];

    try {
      const procesosQuery = `
        SELECT
          nombre,
          pid,
          cpu_pct,
          ram_mb,
          es_sospechoso,
          timestamp
        FROM procesos
        WHERE TRIM(LOWER(equipo_id)) =
              TRIM(LOWER($1))
        ORDER BY timestamp DESC, cpu_pct DESC
        LIMIT 10;
      `;

      const procesosResult = await pool.query(procesosQuery, [equipoId]);
      procesos = procesosResult.rows;

    } catch (errorProcesos) {
      procesos = [];
    }

    const cpu = Number(equipo.cpu_pct || 0);
    const ram = Number(equipo.ram_pct || 0);
    const disco = Number(equipo.disco_pct || 0);
    const temp = Number(equipo.temp_cpu || 0);

    const diagnostico = [];
    const causas = [];
    const acciones = [];
    const componentes_riesgo = [];

    let puntajeRiesgo = 0;
    let estado = 'SALUDABLE';

    if (!equipo.activo) {
      estado = 'INACTIVO';
      puntajeRiesgo += 30;
      diagnostico.push('El equipo no ha enviado métricas recientes en las últimas 2 horas.');
      causas.push('El agente de monitoreo podría estar detenido, la computadora apagada o sin conexión.');
      acciones.push('Verificar si el equipo está encendido y conectado a la red.');
      acciones.push('Revisar que el script/agente de la Raspberry o del equipo siga enviando datos.');
      componentes_riesgo.push('Conectividad / agente de monitoreo');
    }

    if (cpu >= 90) {
      estado = 'CRITICO';
      puntajeRiesgo += 30;
      diagnostico.push(`CPU crítica: ${cpu.toFixed(1)}%.`);
      causas.push('Procesos con alto consumo, servicios bloqueados o carga excesiva.');
      acciones.push('Revisar procesos con mayor uso de CPU y cerrar o reiniciar los que estén saturando el sistema.');
      componentes_riesgo.push('Procesador');
    } else if (cpu >= 80) {
      if (estado !== 'CRITICO') estado = 'ADVERTENCIA';
      puntajeRiesgo += 15;
      diagnostico.push(`CPU elevada: ${cpu.toFixed(1)}%.`);
      causas.push('Carga alta temporal o procesos exigentes en ejecución.');
      acciones.push('Monitorear procesos activos y verificar si el consumo se mantiene elevado.');
      componentes_riesgo.push('Procesador');
    }

    if (ram >= 90) {
      estado = 'CRITICO';
      puntajeRiesgo += 25;
      diagnostico.push(`RAM crítica: ${ram.toFixed(1)}%.`);
      causas.push('Memoria casi agotada, demasiadas aplicaciones abiertas o fuga de memoria.');
      acciones.push('Cerrar procesos innecesarios o reiniciar servicios con alto consumo de memoria.');
      acciones.push('Evaluar ampliación de memoria RAM si el problema es frecuente.');
      componentes_riesgo.push('Memoria RAM');
    } else if (ram >= 85) {
      if (estado !== 'CRITICO') estado = 'ADVERTENCIA';
      puntajeRiesgo += 12;
      diagnostico.push(`RAM elevada: ${ram.toFixed(1)}%.`);
      causas.push('Uso alto de aplicaciones o servicios en segundo plano.');
      acciones.push('Revisar aplicaciones con mayor consumo de RAM.');
      componentes_riesgo.push('Memoria RAM');
    }

    if (disco >= 95) {
      estado = 'CRITICO';
      puntajeRiesgo += 25;
      diagnostico.push(`Disco crítico: ${disco.toFixed(1)}%.`);
      causas.push('Poco espacio libre en disco, acumulación de archivos temporales o logs.');
      acciones.push('Liberar espacio eliminando archivos temporales, descargas antiguas o logs innecesarios.');
      acciones.push('Mover respaldos o archivos pesados a otro almacenamiento.');
      componentes_riesgo.push('Almacenamiento');
    } else if (disco >= 90) {
      if (estado !== 'CRITICO') estado = 'ADVERTENCIA';
      puntajeRiesgo += 12;
      diagnostico.push(`Disco elevado: ${disco.toFixed(1)}%.`);
      causas.push('El almacenamiento está cerca de saturarse.');
      acciones.push('Programar limpieza de disco antes de que llegue a estado crítico.');
      componentes_riesgo.push('Almacenamiento');
    }

    if (temp >= 85) {
      estado = 'CRITICO';
      puntajeRiesgo += 30;
      diagnostico.push(`Temperatura crítica: ${temp.toFixed(1)}°C.`);
      causas.push('Posible mala ventilación, polvo, ventiladores fallando o pasta térmica deteriorada.');
      acciones.push('Revisar ventiladores, limpiar polvo y verificar flujo de aire.');
      acciones.push('Evitar cargas pesadas hasta reducir la temperatura.');
      componentes_riesgo.push('Sistema de refrigeración / CPU');
    } else if (temp >= 75) {
      if (estado !== 'CRITICO') estado = 'ADVERTENCIA';
      puntajeRiesgo += 15;
      diagnostico.push(`Temperatura elevada: ${temp.toFixed(1)}°C.`);
      causas.push('El equipo está trabajando con temperatura superior a lo recomendado.');
      acciones.push('Verificar ventilación y ubicación física del equipo.');
      componentes_riesgo.push('Sistema de refrigeración');
    }

    const alertasActivas = alertasResult.rows.filter(a => !a.resuelta);

    if (alertasActivas.length > 0) {
      puntajeRiesgo += Math.min(alertasActivas.length * 5, 20);
      diagnostico.push(`El equipo tiene ${alertasActivas.length} alerta(s) activa(s).`);
      causas.push('Existen eventos recientes no resueltos relacionados con el equipo.');
      acciones.push('Revisar el centro de alertas y atender primero las alertas críticas.');
    }

    const procesosSospechosos = procesos.filter(p => p.es_sospechoso);

    if (procesosSospechosos.length > 0) {
      puntajeRiesgo += 20;
      estado = 'CRITICO';
      diagnostico.push(`Se detectaron ${procesosSospechosos.length} proceso(s) sospechoso(s).`);
      causas.push('Puede existir software no autorizado o procesos anómalos ejecutándose.');
      acciones.push('Revisar procesos sospechosos y validar si pertenecen a software legítimo.');
      componentes_riesgo.push('Seguridad / procesos');
    }

    if (diagnostico.length === 0) {
      diagnostico.push('El equipo se encuentra dentro de parámetros normales.');
      causas.push('Las métricas actuales están por debajo de los umbrales de advertencia.');
      acciones.push('Mantener monitoreo normal y realizar mantenimiento preventivo periódico.');
    }

    let nivel_urgencia = 'BAJO';

    if (puntajeRiesgo >= 70) {
      nivel_urgencia = 'CRITICO';
    } else if (puntajeRiesgo >= 45) {
      nivel_urgencia = 'ALTO';
    } else if (puntajeRiesgo >= 20) {
      nivel_urgencia = 'MEDIO';
    }

    const componentesUnicos = [...new Set(componentes_riesgo)];

    res.json({
      success: true,
      equipo_id: equipo.equipo_id,
      equipo_nombre: equipo.nombre,
      estado,
      nivel_urgencia,
      puntaje_riesgo: Math.min(puntajeRiesgo, 100),
      resumen: `El equipo ${equipo.nombre} se encuentra en estado ${estado.toLowerCase()} con nivel de urgencia ${nivel_urgencia.toLowerCase()}.`,
      diagnostico,
      posibles_causas: [...new Set(causas)],
      acciones_recomendadas: [...new Set(acciones)],
      componentes_en_riesgo: componentesUnicos.length > 0 ? componentesUnicos : ['Ninguno detectado'],
      datos_analizados: {
        cpu_pct: cpu,
        ram_pct: ram,
        disco_pct: disco,
        temp_cpu: temp,
        activo: equipo.activo,
        ultima_metrica: equipo.ultima_metrica,
        alertas_activas: alertasActivas.length,
        procesos_sospechosos: procesosSospechosos.length
      }
    });

  } catch (error) {
    console.error('Error IA local:', error);

    res.status(500).json({
      success: false,
      error: 'No se pudo generar el diagnóstico local',
      detalle: error.message
    });
  }
}); 

module.exports = router;