require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');

const app = express();
const port = process.env.PORT || 3000;

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'hotel_reservations',
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true
});

app.use(cors());
app.use(express.json());

const frontendDir = process.env.FRONTEND_DIR || path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendDir));

const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

const normalizeRole = (role) => (role === 'administrador' ? 'admin' : role);
const dbRole = (role) => (role === 'admin' ? 'administrador' : role);

app.get('/api/health', asyncHandler(async (req, res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true, database: process.env.DB_NAME || 'hotel_reservations' });
}));

app.post('/api/auth/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email y password son obligatorios.' });
  }

  const [users] = await pool.execute(
    `SELECT id, nombre, email, password_hash, rol
     FROM usuarios
     WHERE email = :email
     LIMIT 1`,
    { email }
  );

  const user = users[0];
  if (!user || user.password_hash !== password) {
    return res.status(401).json({ message: 'Credenciales invalidas.' });
  }

  res.json({
    user: {
      id: user.id,
      name: user.nombre,
      email: user.email,
      role: normalizeRole(user.rol)
    }
  });
}));

app.post('/api/auth/register', asyncHandler(async (req, res) => {
  const { nombre, email, password, role } = req.body;

  if (!nombre || !email || !password || !role) {
    return res.status(400).json({ message: 'Nombre, email, password y rol son obligatorios.' });
  }

  const validRoles = ['admin', 'administrador', 'gerente', 'recepcion'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ message: 'Rol invalido.' });
  }

  const [existing] = await pool.execute(
    `SELECT id FROM usuarios WHERE email = :email LIMIT 1`,
    { email }
  );

  if (existing.length) {
    return res.status(409).json({ message: 'Ya existe una cuenta con ese email.' });
  }

  const [result] = await pool.execute(
    `INSERT INTO usuarios (nombre, email, password_hash, rol)
     VALUES (:nombre, :email, :password_hash, :rol)`,
    {
      nombre,
      email,
      password_hash: password,
      rol: dbRole(role)
    }
  );

  res.status(201).json({
    user: {
      id: result.insertId,
      name: nombre,
      email,
      role: normalizeRole(dbRole(role))
    }
  });
}));

app.get('/api/dashboard', asyncHandler(async (req, res) => {
  const [[rooms]] = await pool.query(`
    SELECT
      SUM(estado = 'libre') AS libres,
      COUNT(*) AS total,
      SUM(estado = 'ocupada') AS ocupadas
    FROM habitaciones
  `);

  const [[arrivals]] = await pool.query(`
    SELECT COUNT(*) AS llegadas
    FROM reservas
    WHERE fecha_entrada = CURDATE()
      AND estado IN ('pendiente', 'check_in')
  `);

  const [nextArrivals] = await pool.query(`
    SELECT
      r.id,
      CONCAT(c.nombre, ' ', c.apellidos) AS cliente,
      e.nombre AS empresa,
      r.fecha_entrada,
      r.fecha_salida,
      r.tipo_pension,
      r.estado,
      h.numero AS habitacion,
      h.tipo AS tipo_habitacion
    FROM reservas r
    JOIN clientes c ON c.id = r.cliente_id
    LEFT JOIN empresas e ON e.id = c.empresa_id
    LEFT JOIN habitaciones h ON h.id = r.habitacion_id
    WHERE r.estado IN ('pendiente', 'check_in')
    ORDER BY r.fecha_entrada ASC
    LIMIT 10
  `);

  const total = Number(rooms.total || 0);
  const ocupadas = Number(rooms.ocupadas || 0);

  res.json({
    stats: {
      habitacionesLibres: Number(rooms.libres || 0),
      llegadasHoy: Number(arrivals.llegadas || 0),
      ocupacion: total ? Math.round((ocupadas / total) * 100) : 0
    },
    nextArrivals
  });
}));

app.get('/api/empresas', asyncHandler(async (req, res) => {
  const [companies] = await pool.query(`
    SELECT
      e.id,
      e.nombre,
      e.rfc,
      e.telefono,
      e.email_contacto,
      e.descuento_porcentaje,
      e.cuenta_abierta,
      COALESCE(SUM(CASE WHEN f.estado_pago = 'pendiente' THEN f.total ELSE 0 END), 0) AS facturacion_pendiente
    FROM empresas e
    LEFT JOIN facturas f ON f.empresa_id = e.id
    GROUP BY e.id
    ORDER BY e.nombre
  `);

  res.json(companies);
}));

app.post('/api/empresas', asyncHandler(async (req, res) => {
  const { nombre, rfc, direccion, telefono, email_contacto, descuento_porcentaje } = req.body;

  if (!nombre) {
    return res.status(400).json({ message: 'El nombre de la empresa es obligatorio.' });
  }

  const [result] = await pool.execute(
    `INSERT INTO empresas (nombre, rfc, direccion, telefono, email_contacto, descuento_porcentaje)
     VALUES (:nombre, :rfc, :direccion, :telefono, :email_contacto, :descuento_porcentaje)`,
    {
      nombre,
      rfc: rfc || null,
      direccion: direccion || null,
      telefono: telefono || null,
      email_contacto: email_contacto || null,
      descuento_porcentaje: Number(descuento_porcentaje || 0)
    }
  );

  res.status(201).json({ id: result.insertId });
}));

app.patch('/api/empresas/:empresaId', asyncHandler(async (req, res) => {
  const { empresaId } = req.params;
  const {
    nombre,
    rfc,
    direccion,
    telefono,
    email_contacto,
    descuento_porcentaje,
    cuenta_abierta
  } = req.body;

  if (!nombre) {
    return res.status(400).json({ message: 'El nombre de la empresa es obligatorio.' });
  }

  await pool.execute(
    `UPDATE empresas
     SET nombre = :nombre,
         rfc = :rfc,
         direccion = :direccion,
         telefono = :telefono,
         email_contacto = :email_contacto,
         descuento_porcentaje = :descuento_porcentaje,
         cuenta_abierta = :cuenta_abierta
     WHERE id = :empresaId`,
    {
      empresaId,
      nombre,
      rfc: rfc || null,
      direccion: direccion || null,
      telefono: telefono || null,
      email_contacto: email_contacto || null,
      descuento_porcentaje: Number(descuento_porcentaje || 0),
      cuenta_abierta: cuenta_abierta === undefined ? true : Boolean(cuenta_abierta)
    }
  );

  res.json({ ok: true });
}));

app.patch('/api/empresas/:empresaId/cuenta', asyncHandler(async (req, res) => {
  const { empresaId } = req.params;
  const { cuenta_abierta } = req.body;

  await pool.execute(
    `UPDATE empresas SET cuenta_abierta = :cuenta_abierta WHERE id = :empresaId`,
    { empresaId, cuenta_abierta: Boolean(cuenta_abierta) }
  );

  res.json({ ok: true });
}));

app.post('/api/empresas/:empresaId/factura-mensual', asyncHandler(async (req, res) => {
  const { empresaId } = req.params;
  const [[summary]] = await pool.execute(
    `SELECT COALESCE(SUM(total), 0) AS total
     FROM facturas
     WHERE empresa_id = :empresaId
       AND estado_pago = 'pendiente'`,
    { empresaId }
  );

  const total = Number(summary.total || 0);

  if (total <= 0) {
    return res.status(409).json({ message: 'La empresa no tiene facturacion pendiente.' });
  }

  await pool.execute(
    `UPDATE facturas
     SET estado_pago = 'pagada'
     WHERE empresa_id = :empresaId
       AND estado_pago = 'pendiente'`,
    { empresaId }
  );

  res.json({ total });
}));

app.get('/api/habitaciones/disponibles', asyncHandler(async (req, res) => {
  const { noFumador, tipo, fechaEntrada, fechaSalida } = req.query;
  const params = {
    noFumador: noFumador === 'true',
    tipo: tipo || null,
    fechaEntrada: fechaEntrada || null,
    fechaSalida: fechaSalida || null
  };
  let sql = `
    SELECT id, numero, tipo, permite_fumadores, precio_noche
    FROM habitaciones
    WHERE estado <> 'mantenimiento'
      AND (:tipo IS NULL OR tipo = :tipo)
      AND (:noFumador = FALSE OR permite_fumadores = FALSE)
  `;

  if (fechaEntrada && fechaSalida) {
    sql += `
      AND NOT EXISTS (
        SELECT 1
        FROM reservas r
        WHERE r.habitacion_id = habitaciones.id
          AND r.estado IN ('pendiente', 'check_in')
          AND :fechaEntrada < r.fecha_salida
          AND :fechaSalida > r.fecha_entrada
      )
    `;
  }

  sql += ' ORDER BY precio_noche ASC, numero ASC';

  const [rooms] = await pool.execute(sql, params);
  res.json(rooms);
}));

app.get('/api/habitaciones/tipos', asyncHandler(async (req, res) => {
  const [types] = await pool.query(`
    SELECT tipo, COUNT(*) AS total
    FROM habitaciones
    WHERE estado <> 'mantenimiento'
    GROUP BY tipo
    ORDER BY tipo
  `);

  res.json(types);
}));

app.post('/api/reservas', asyncHandler(async (req, res) => {
  const {
    tipo_cliente,
    nombre,
    apellidos,
    empresa_id,
    tarjeta_credito,
    tipo_reserva,
    tipo_pension,
    tipo_habitacion,
    habitacion_id,
    fecha_entrada,
    fecha_salida,
    no_fumador
  } = req.body;

  if (!nombre || !apellidos || !tipo_cliente || !tipo_reserva || !tipo_pension || !tipo_habitacion || !fecha_entrada || !fecha_salida) {
    return res.status(400).json({ message: 'Faltan datos obligatorios para crear la reserva.' });
  }

  if (new Date(fecha_entrada) >= new Date(fecha_salida)) {
    return res.status(400).json({ message: 'La fecha de salida debe ser posterior a la fecha de entrada.' });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [rooms] = await connection.execute(
      `SELECT id, numero, tipo
       FROM habitaciones
       WHERE estado <> 'mantenimiento'
         AND tipo = :tipo_habitacion
         AND (:habitacion_id IS NULL OR id = :habitacion_id)
         AND (:no_fumador = FALSE OR permite_fumadores = FALSE)
         AND NOT EXISTS (
           SELECT 1
           FROM reservas r
           WHERE r.habitacion_id = habitaciones.id
             AND r.estado IN ('pendiente', 'check_in')
             AND :fecha_entrada < r.fecha_salida
             AND :fecha_salida > r.fecha_entrada
         )
       ORDER BY precio_noche ASC, numero ASC
       LIMIT 1`,
      {
        no_fumador: Boolean(no_fumador),
        tipo_habitacion,
        habitacion_id: habitacion_id ? Number(habitacion_id) : null,
        fecha_entrada,
        fecha_salida
      }
    );

    if (!rooms.length) {
      await connection.rollback();
      return res.status(409).json({ message: 'No hay habitaciones disponibles de ese tipo para las fechas seleccionadas.' });
    }

    const selectedRoom = rooms[0];
    const habitacionId = selectedRoom.id;
    const lastFour = tarjeta_credito ? String(tarjeta_credito).replace(/\D/g, '').slice(-4) : null;

    const [clientResult] = await connection.execute(
      `INSERT INTO clientes (nombre, apellidos, tipo, empresa_id, tarjeta_credito)
       VALUES (:nombre, :apellidos, :tipo, :empresa_id, :tarjeta_credito)`,
      {
        nombre,
        apellidos,
        tipo: tipo_cliente,
        empresa_id: tipo_cliente === 'empresa' ? Number(empresa_id) || null : null,
        tarjeta_credito: lastFour ? `****-****-****-${lastFour}` : null
      }
    );

    const [reservationResult] = await connection.execute(
      `INSERT INTO reservas
        (cliente_id, habitacion_id, fecha_entrada, fecha_salida, tipo_reserva, tipo_pension, estado)
       VALUES
        (:cliente_id, :habitacion_id, :fecha_entrada, :fecha_salida, :tipo_reserva, :tipo_pension, 'pendiente')`,
      {
        cliente_id: clientResult.insertId,
        habitacion_id: habitacionId,
        fecha_entrada,
        fecha_salida,
        tipo_reserva,
        tipo_pension
      }
    );

    await connection.commit();
    res.status(201).json({
      id: reservationResult.insertId,
      habitacion_id: habitacionId,
      habitacion: selectedRoom.numero,
      tipo_habitacion: selectedRoom.tipo
    });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

app.patch('/api/reservas/:reservaId/checkin', asyncHandler(async (req, res) => {
  const { reservaId } = req.params;

  const [rows] = await pool.execute(
    `SELECT id, habitacion_id, estado
     FROM reservas
     WHERE id = :reservaId
     LIMIT 1`,
    { reservaId }
  );

  const reservation = rows[0];
  if (!reservation) {
    return res.status(404).json({ message: 'Reserva no encontrada.' });
  }

  if (reservation.estado !== 'pendiente') {
    return res.status(409).json({ message: 'Solo se puede hacer check-in a reservas pendientes.' });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    await connection.execute(
      `UPDATE reservas SET estado = 'check_in' WHERE id = :reservaId`,
      { reservaId }
    );

    if (reservation.habitacion_id) {
      await connection.execute(
        `UPDATE habitaciones SET estado = 'ocupada' WHERE id = :habitacionId`,
        { habitacionId: reservation.habitacion_id }
      );
    }

    await connection.commit();
    res.json({ ok: true });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

app.get('/api/admin/resumen', asyncHandler(async (req, res) => {
  const [[users]] = await pool.query('SELECT COUNT(*) AS total FROM usuarios');
  const [[rooms]] = await pool.query('SELECT COUNT(*) AS total FROM habitaciones');
  res.json({
    usuarios: Number(users.total || 0),
    habitaciones: Number(rooms.total || 0)
  });
}));

app.get('/api/admin/habitaciones', asyncHandler(async (req, res) => {
  const [rooms] = await pool.query(`
    SELECT id, numero, tipo, permite_fumadores, estado, precio_noche
    FROM habitaciones
    ORDER BY numero
  `);

  res.json(rooms);
}));

app.post('/api/admin/habitaciones', asyncHandler(async (req, res) => {
  const { numero, tipo, permite_fumadores, estado, precio_noche } = req.body;

  if (!numero || !precio_noche) {
    return res.status(400).json({ message: 'Numero y precio por noche son obligatorios.' });
  }

  const normalizedType = tipo === 'Estandar' ? 'Estándar' : (tipo || 'Estándar');
  const allowedTypes = ['Estándar', 'Suite'];

  if (!allowedTypes.includes(normalizedType)) {
    return res.status(400).json({ message: 'Tipo de habitacion invalido. Usa Estándar o Suite.' });
  }

  const [result] = await pool.execute(
    `INSERT INTO habitaciones (numero, tipo, permite_fumadores, estado, precio_noche)
     VALUES (:numero, :tipo, :permite_fumadores, :estado, :precio_noche)`,
    {
      numero,
      tipo: normalizedType,
      permite_fumadores: Boolean(permite_fumadores),
      estado: estado || 'libre',
      precio_noche: Number(precio_noche)
    }
  );

  res.status(201).json({ id: result.insertId });
}));

app.patch('/api/admin/habitaciones/:habitacionId', asyncHandler(async (req, res) => {
  const { habitacionId } = req.params;
  const { estado } = req.body;
  const allowed = ['libre', 'ocupada', 'mantenimiento'];

  if (!allowed.includes(estado)) {
    return res.status(400).json({ message: 'Estado de habitacion invalido.' });
  }

  await pool.execute(
    `UPDATE habitaciones SET estado = :estado WHERE id = :habitacionId`,
    { habitacionId, estado }
  );

  res.json({ ok: true });
}));

app.get('/api/admin/usuarios', asyncHandler(async (req, res) => {
  const [users] = await pool.query(`
    SELECT id, nombre, email, rol, creado_en
    FROM usuarios
    ORDER BY nombre
  `);

  res.json(users.map((user) => ({ ...user, rol: normalizeRole(user.rol) })));
}));

app.get('/api/checkout', asyncHandler(async (req, res) => {
  const [rows] = await pool.query(`
    SELECT
      r.id AS reserva_id,
      CONCAT(c.nombre, ' ', c.apellidos) AS cliente,
      c.tipo AS tipo_cliente,
      e.id AS empresa_id,
      e.nombre AS empresa,
      e.descuento_porcentaje,
      h.id AS habitacion_id,
      h.numero AS habitacion,
      h.tipo AS tipo_habitacion,
      h.precio_noche,
      r.fecha_entrada,
      r.fecha_salida,
      DATEDIFF(r.fecha_salida, r.fecha_entrada) AS noches,
      COALESCE(SUM(ce.monto), 0) AS extras
    FROM reservas r
    JOIN clientes c ON c.id = r.cliente_id
    LEFT JOIN empresas e ON e.id = c.empresa_id
    LEFT JOIN habitaciones h ON h.id = r.habitacion_id
    LEFT JOIN cargos_extra ce ON ce.reserva_id = r.id
    WHERE r.estado = 'check_in'
    GROUP BY r.id
    ORDER BY r.fecha_salida ASC
  `);

  res.json(rows.map((row) => {
    const noches = Number(row.noches || 1);
    const estancia = noches * Number(row.precio_noche || 0);
    const extras = Number(row.extras || 0);
    const descuento = row.tipo_cliente === 'empresa'
      ? estancia * (Number(row.descuento_porcentaje || 0) / 100)
      : 0;
    const total = estancia + extras - descuento;

    return { ...row, noches, estancia, extras, descuento, total };
  }));
}));

app.post('/api/checkout/:reservaId', asyncHandler(async (req, res) => {
  const { reservaId } = req.params;
  const [rows] = await pool.execute(`
    SELECT
      r.id AS reserva_id,
      r.cliente_id,
      r.habitacion_id,
      c.empresa_id,
      c.tipo AS tipo_cliente,
      e.descuento_porcentaje,
      h.precio_noche,
      DATEDIFF(r.fecha_salida, r.fecha_entrada) AS noches,
      COALESCE(SUM(ce.monto), 0) AS extras
    FROM reservas r
    JOIN clientes c ON c.id = r.cliente_id
    LEFT JOIN empresas e ON e.id = c.empresa_id
    LEFT JOIN habitaciones h ON h.id = r.habitacion_id
    LEFT JOIN cargos_extra ce ON ce.reserva_id = r.id
    WHERE r.id = :reservaId
    GROUP BY r.id
  `, { reservaId });

  const reservation = rows[0];
  if (!reservation) {
    return res.status(404).json({ message: 'Reserva no encontrada.' });
  }

  const noches = Number(reservation.noches || 1);
  const subtotal = noches * Number(reservation.precio_noche || 0) + Number(reservation.extras || 0);
  const descuento = reservation.tipo_cliente === 'empresa'
    ? (noches * Number(reservation.precio_noche || 0)) * (Number(reservation.descuento_porcentaje || 0) / 100)
    : 0;
  const total = subtotal - descuento;

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const [invoice] = await connection.execute(
      `INSERT INTO facturas (cliente_id, empresa_id, reserva_id, subtotal, total, tipo_factura)
       VALUES (:cliente_id, :empresa_id, :reserva_id, :subtotal, :total, :tipo_factura)`,
      {
        cliente_id: reservation.cliente_id,
        empresa_id: reservation.empresa_id,
        reserva_id: reservation.reserva_id,
        subtotal,
        total,
        tipo_factura: reservation.tipo_cliente === 'empresa' ? 'mensual_empresa' : 'estancia'
      }
    );

    await connection.execute(
      `UPDATE reservas SET estado = 'check_out' WHERE id = :reserva_id`,
      { reserva_id: reservation.reserva_id }
    );

    if (reservation.habitacion_id) {
      await connection.execute(
        `UPDATE habitaciones SET estado = 'libre' WHERE id = :habitacion_id`,
        { habitacion_id: reservation.habitacion_id }
      );
    }

    await connection.commit();
    res.json({ factura_id: invoice.insertId, total });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

app.get('*', (req, res) => {
  res.sendFile(path.join(frontendDir, 'index.html'));
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ message: 'Error interno del servidor.' });
});

app.listen(port, () => {
  console.log(`Servidor disponible en http://localhost:${port}`);
});
