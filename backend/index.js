require('dotenv').config();
const multer = require('multer');
const fs = require('fs');
const uploadDir = '/app/uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9.]/g, '_'))
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend/public')));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const JWT_SECRET = process.env.JWT_SECRET || 'fatiga_petshop_secret_2025';

const PRODUCTOS_SEED = require('./productos_seed');

async function initDB() {
  // Solo crea las tablas si no existen. NUNCA borra ni modifica datos existentes.
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id SERIAL PRIMARY KEY, nombre VARCHAR(100) NOT NULL,
        username VARCHAR(50) UNIQUE NOT NULL, password_hash VARCHAR(255) NOT NULL,
        rol VARCHAR(20) DEFAULT 'empleado', activo BOOLEAN DEFAULT true, created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS categorias (
        id SERIAL PRIMARY KEY, nombre VARCHAR(100) NOT NULL, icono VARCHAR(10)
      );
      CREATE TABLE IF NOT EXISTS proveedores (
        id SERIAL PRIMARY KEY, nombre VARCHAR(150) NOT NULL,
        contacto VARCHAR(100), telefono VARCHAR(50), activo BOOLEAN DEFAULT true
      );
      CREATE TABLE IF NOT EXISTS productos (
        id SERIAL PRIMARY KEY, codigo VARCHAR(20) UNIQUE, nombre VARCHAR(200) NOT NULL,
        categoria_id INTEGER REFERENCES categorias(id), precio_lista NUMERIC(12,2) NOT NULL DEFAULT 0,
        precio_por_kg NUMERIC(12,2), precio_costo NUMERIC(12,2), vende_por_kg BOOLEAN DEFAULT false,
        stock_actual NUMERIC(10,2) DEFAULT 0, stock_minimo NUMERIC(10,2) DEFAULT 0,
        unidad VARCHAR(10) DEFAULT 'ud', activo BOOLEAN DEFAULT true, created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS clientes (
        id SERIAL PRIMARY KEY, nombre VARCHAR(150) NOT NULL, apellido VARCHAR(100),
        telefono VARCHAR(50), direccion VARCHAR(200), tipo_mascota VARCHAR(50),
        alimento_preferido VARCHAR(200), notas TEXT, created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS ventas (
        id SERIAL PRIMARY KEY, usuario_id INTEGER REFERENCES usuarios(id),
        cliente_id INTEGER REFERENCES clientes(id), fecha TIMESTAMP DEFAULT NOW(),
        subtotal NUMERIC(12,2) NOT NULL, descuento NUMERIC(12,2) DEFAULT 0,
        total NUMERIC(12,2) NOT NULL, medio_pago VARCHAR(30) NOT NULL, observaciones TEXT
      );
      CREATE TABLE IF NOT EXISTS venta_items (
        id SERIAL PRIMARY KEY, venta_id INTEGER REFERENCES ventas(id) ON DELETE CASCADE,
        producto_id INTEGER REFERENCES productos(id), cantidad NUMERIC(10,2) NOT NULL,
        precio_unitario NUMERIC(12,2) NOT NULL, subtotal NUMERIC(12,2) NOT NULL, modo VARCHAR(10) DEFAULT 'ud'
      );
      CREATE TABLE IF NOT EXISTS ingresos_mercaderia (
        id SERIAL PRIMARY KEY, usuario_id INTEGER REFERENCES usuarios(id),
        proveedor_id INTEGER REFERENCES proveedores(id), fecha TIMESTAMP DEFAULT NOW(),
        total NUMERIC(12,2), medio_pago VARCHAR(30), estado VARCHAR(30) DEFAULT 'pagado', observaciones TEXT
      );
      CREATE TABLE IF NOT EXISTS ingreso_items (
        id SERIAL PRIMARY KEY, ingreso_id INTEGER REFERENCES ingresos_mercaderia(id) ON DELETE CASCADE,
        producto_id INTEGER REFERENCES productos(id), cantidad NUMERIC(10,2) NOT NULL,
        precio_unitario NUMERIC(12,2), subtotal NUMERIC(12,2)
      );
      CREATE TABLE IF NOT EXISTS gastos (
        id SERIAL PRIMARY KEY, usuario_id INTEGER REFERENCES usuarios(id),
        fecha TIMESTAMP DEFAULT NOW(), descripcion VARCHAR(200) NOT NULL,
        monto NUMERIC(12,2) NOT NULL, categoria VARCHAR(100), medio_pago VARCHAR(30)
      );
    `);
    console.log('Tablas verificadas OK - datos existentes intactos');
  } catch (e) {
    console.error('Error en initDB:', e.message);
  }
}

function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No autorizado' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
}

// ── AUTH ──────────────────────────────────────────
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const r = await pool.query('SELECT * FROM usuarios WHERE username=$1 AND activo=true', [username]);
    if (!r.rows.length) return res.status(401).json({ error: 'Usuario no encontrado' });
    const user = r.rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Contraseña incorrecta' });
    const token = jwt.sign({ id: user.id, nombre: user.nombre, rol: user.rol }, JWT_SECRET, { expiresIn: '12h' });
    res.json({ token, nombre: user.nombre, rol: user.rol });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── PRODUCTOS ──────────────────────────────────────
app.get('/api/productos', auth, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT p.*, c.nombre as categoria_nombre
      FROM productos p
      LEFT JOIN categorias c ON p.categoria_id = c.id
      WHERE p.activo = true
      ORDER BY c.nombre, p.nombre
    `);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/productos/stock-bajo', auth, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT p.*, c.nombre as categoria_nombre
      FROM productos p
      LEFT JOIN categorias c ON p.categoria_id = c.id
      WHERE p.activo = true AND p.stock_actual <= p.stock_minimo
      ORDER BY p.stock_actual ASC
    `);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/productos/:id', auth, async (req, res) => {
  const { precio_lista, precio_por_kg, stock_actual, stock_minimo } = req.body;
  try {
    const r = await pool.query(
      'UPDATE productos SET precio_lista=$1, precio_por_kg=$2, stock_actual=$3, stock_minimo=$4 WHERE id=$5 RETURNING *',
      [precio_lista, precio_por_kg, stock_actual, stock_minimo, req.params.id]
    );
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── CATEGORÍAS ─────────────────────────────────────
app.get('/api/categorias', auth, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM categorias ORDER BY nombre');
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── VENTAS ─────────────────────────────────────────
app.post('/api/ventas', auth, async (req, res) => {
  const { cliente_id, items, subtotal, descuento, total, medio_pago, observaciones } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const vr = await client.query(
      'INSERT INTO ventas (usuario_id, cliente_id, subtotal, descuento, total, medio_pago, observaciones) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
      [req.user.id, cliente_id || null, subtotal, descuento || 0, total, medio_pago, observaciones || null]
    );
    const ventaId = vr.rows[0].id;
    for (const item of items) {
      await client.query(
        'INSERT INTO venta_items (venta_id, producto_id, cantidad, precio_unitario, subtotal, modo) VALUES ($1,$2,$3,$4,$5,$6)',
        [ventaId, item.producto_id, item.cantidad, item.precio_unitario, item.subtotal, item.modo]
      );
      if (item.modo === 'kg') {
        await client.query('UPDATE productos SET stock_actual = stock_actual - $1 WHERE id = $2', [item.cantidad, item.producto_id]);
      } else {
        await client.query('UPDATE productos SET stock_actual = stock_actual - $1 WHERE id = $2', [item.cantidad, item.producto_id]);
      }
    }
    await client.query('COMMIT');
    res.json({ id: ventaId, ok: true });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

app.get('/api/ventas', auth, async (req, res) => {
  const { desde, hasta } = req.query;
  try {
    const r = await pool.query(`
      SELECT v.*, u.nombre as empleado,
        COALESCE(c.nombre || ' ' || COALESCE(c.apellido,''), 'Mostrador') as cliente_nombre
      FROM ventas v
      LEFT JOIN usuarios u ON v.usuario_id = u.id
      LEFT JOIN clientes c ON v.cliente_id = c.id
      WHERE v.fecha >= COALESCE($1::date, NOW()::date)
        AND v.fecha < COALESCE($2::date, NOW()::date) + INTERVAL '1 day'
      ORDER BY v.fecha DESC
    `, [desde || null, hasta || null]);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/ventas/:id/items', auth, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT vi.*, p.nombre as producto_nombre
      FROM venta_items vi
      JOIN productos p ON vi.producto_id = p.id
      WHERE vi.venta_id = $1
    `, [req.params.id]);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── RANKING Y PROYECCIÓN ──────────────────────────
app.get('/api/ranking', auth, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT 
        p.id,
        p.nombre,
        p.vende_por_kg,
        p.precio_por_kg,
        p.precio_lista,
        p.stock_actual,
        COALESCE(SUM(vi.cantidad), 0) as total_vendido,
        COALESCE(SUM(vi.subtotal), 0) as total_facturado,
        COUNT(DISTINCT vi.venta_id) as veces_vendido
      FROM productos p
      LEFT JOIN venta_items vi ON p.id = vi.producto_id
        AND vi.venta_id IN (
          SELECT id FROM ventas WHERE fecha >= NOW() - INTERVAL '30 days'
        )
      WHERE p.activo = true
      GROUP BY p.id, p.nombre, p.vende_por_kg, p.precio_por_kg, p.precio_lista, p.stock_actual
      HAVING COALESCE(SUM(vi.cantidad), 0) > 0
      ORDER BY total_vendido DESC
      LIMIT 20
    `);

    // Calculate projection: days left in month
    const hoy = new Date();
    const diasEnMes = new Date(hoy.getFullYear(), hoy.getMonth()+1, 0).getDate();
    const diaActual = hoy.getDate();
    const diasRestantes = diasEnMes - diaActual;

    const ranking = r.rows.map(p => {
      const vendidoPorDia = parseFloat(p.total_vendido) / 30;
      const necesitaMes = vendidoPorDia * diasRestantes;
      const stockActual = parseFloat(p.stock_actual);
      const necesitaComprar = Math.max(0, necesitaMes - stockActual);
      return {
        ...p,
        total_vendido: parseFloat(p.total_vendido),
        total_facturado: parseFloat(p.total_facturado),
        veces_vendido: parseInt(p.veces_vendido),
        stock_actual: stockActual,
        venta_diaria_promedio: parseFloat(vendidoPorDia.toFixed(2)),
        necesita_mes: parseFloat(necesitaMes.toFixed(2)),
        necesita_comprar: parseFloat(necesitaComprar.toFixed(2)),
        dias_restantes: diasRestantes
      };
    });

    res.json(ranking);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── INGRESO MERCADERÍA ─────────────────────────────
app.post('/api/ingresos', auth, async (req, res) => {
  const { proveedor_id, items, total, medio_pago, estado, observaciones } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ir = await client.query(
      'INSERT INTO ingresos_mercaderia (usuario_id, proveedor_id, total, medio_pago, estado, observaciones, factura_url) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
      [req.user.id, proveedor_id || null, total || 0, medio_pago || 'efectivo', estado || 'pagado', observaciones || null, req.body.factura_url || null]
    );
    const ingresoId = ir.rows[0].id;
    for (const item of items) {
      await client.query(
        'INSERT INTO ingreso_items (ingreso_id, producto_id, cantidad, precio_unitario, subtotal) VALUES ($1,$2,$3,$4,$5)',
        [ingresoId, item.producto_id, item.cantidad, item.precio_unitario || 0, item.subtotal || 0]
      );
      await client.query('UPDATE productos SET stock_actual = stock_actual + $1 WHERE id = $2', [item.cantidad, item.producto_id]);
    }
    await client.query('COMMIT');
    res.json({ id: ingresoId, ok: true });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// Upload factura image
app.post('/api/facturas/upload', auth, upload.single('factura'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se subió ningún archivo' });
  const url = '/api/facturas/file/' + req.file.filename;
  res.json({ url, filename: req.file.filename });
});

// Serve uploaded files
app.get('/api/facturas/file/:filename', (req, res) => {
  const filepath = uploadDir + '/' + req.params.filename;
  if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'Archivo no encontrado' });
  res.sendFile(filepath);
});

// Get facturas by proveedor
app.get('/api/facturas', auth, async (req, res) => {
  const { proveedor_id } = req.query;
  try {
    const r = await pool.query(`
      SELECT i.id, i.fecha, i.total, i.medio_pago, i.estado, i.observaciones, i.factura_url,
        p.nombre as proveedor, u.nombre as empleado
      FROM ingresos_mercaderia i
      LEFT JOIN proveedores p ON i.proveedor_id = p.id
      LEFT JOIN usuarios u ON i.usuario_id = u.id
      WHERE ($1::integer IS NULL OR i.proveedor_id = $1)
        AND i.factura_url IS NOT NULL
      ORDER BY i.fecha DESC
    `, [proveedor_id || null]);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/ingresos', auth, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT i.*, u.nombre as empleado, pr.nombre as proveedor_nombre
      FROM ingresos_mercaderia i
      LEFT JOIN usuarios u ON i.usuario_id = u.id
      LEFT JOIN proveedores pr ON i.proveedor_id = pr.id
      ORDER BY i.fecha DESC LIMIT 100
    `);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GASTOS ─────────────────────────────────────────
app.post('/api/gastos', auth, async (req, res) => {
  const { descripcion, monto, categoria, medio_pago } = req.body;
  try {
    const r = await pool.query(
      'INSERT INTO gastos (usuario_id, descripcion, monto, categoria, medio_pago) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [req.user.id, descripcion, monto, categoria || null, medio_pago || 'efectivo']
    );
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── CLIENTES ───────────────────────────────────────
app.get('/api/clientes', auth, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM clientes ORDER BY nombre');
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/clientes', auth, async (req, res) => {
  const { nombre, apellido, telefono, direccion, tipo_mascota, alimento_preferido, notas } = req.body;
  try {
    const r = await pool.query(
      'INSERT INTO clientes (nombre, apellido, telefono, direccion, tipo_mascota, alimento_preferido, notas) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [nombre, apellido, telefono, direccion, tipo_mascota, alimento_preferido, notas]
    );
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── PROVEEDORES ────────────────────────────────────
app.get('/api/proveedores', auth, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM proveedores WHERE activo=true ORDER BY nombre');
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── DASHBOARD ──────────────────────────────────────
function getBagWeight(nombre) {
  const match = (nombre || '').match(/(\d+(?:[,\.]\d+)?)\s*KG/i);
  if (match) return parseFloat(match[1].replace(',', '.'));
  return null;
}

function getStockPriority(p) {
  const stock = parseFloat(p.stock_actual);
  if (p.vende_por_kg) {
    const bolsa = getBagWeight(p.nombre);
    if (!bolsa || bolsa <= 0) return 'ok';
    if (stock <= 0) return 'critico';
    if (stock < bolsa) return 'critico';  // se abrió la última bolsa
    return 'ok';
  } else {
    if (stock <= 1) return 'critico';  // queda 1 o menos = última unidad
    return 'ok';
  }
}

app.get('/api/financiero', auth, async (req, res) => {
  const { fecha } = req.query;
  const dia = fecha || new Date().toISOString().split('T')[0];
  try {
    const [ventas, compras, gastos] = await Promise.all([
      pool.query(`
        SELECT v.id, v.total, v.medio_pago, v.descuento, v.fecha,
          u.nombre as empleado,
          COALESCE(c.nombre || ' ' || COALESCE(c.apellido,''), 'Mostrador') as cliente
        FROM ventas v
        LEFT JOIN usuarios u ON v.usuario_id = u.id
        LEFT JOIN clientes c ON v.cliente_id = c.id
        WHERE v.fecha::date = $1
        ORDER BY v.fecha
      `, [dia]),
      pool.query(`
        SELECT i.id, i.total, i.medio_pago, i.estado, i.fecha, i.observaciones,
          p.nombre as proveedor, u.nombre as empleado
        FROM ingresos_mercaderia i
        LEFT JOIN proveedores p ON i.proveedor_id = p.id
        LEFT JOIN usuarios u ON i.usuario_id = u.id
        WHERE i.fecha::date = $1
        ORDER BY i.fecha
      `, [dia]),
      pool.query(`
        SELECT g.id, g.monto, g.descripcion, g.categoria, g.medio_pago, g.fecha,
          u.nombre as empleado
        FROM gastos g
        LEFT JOIN usuarios u ON g.usuario_id = u.id
        WHERE g.fecha::date = $1
        ORDER BY g.fecha
      `, [dia])
    ]);
    const totalIngresos = ventas.rows.reduce((s,v) => s + parseFloat(v.total), 0);
    const totalGastos = compras.rows.reduce((s,c) => s + parseFloat(c.total || 0), 0)
                      + gastos.rows.reduce((s,g) => s + parseFloat(g.monto), 0);
    res.json({
      fecha: dia,
      total_ingresos: totalIngresos,
      total_gastos: totalGastos,
      saldo: totalIngresos - totalGastos,
      ventas: ventas.rows,
      compras: compras.rows,
      gastos: gastos.rows
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/estadisticas', auth, async (req, res) => {
  try {
    const [porDia, porHora] = await Promise.all([
      pool.query(`
        SELECT EXTRACT(DOW FROM fecha) as dia, 
               COUNT(*) as cantidad,
               COALESCE(SUM(total),0) as total
        FROM ventas 
        WHERE fecha >= NOW() - INTERVAL '90 days'
        GROUP BY dia ORDER BY dia
      `),
      pool.query(`
        SELECT EXTRACT(HOUR FROM fecha) as hora,
               COUNT(*) as cantidad,
               COALESCE(SUM(total),0) as total
        FROM ventas 
        WHERE fecha >= NOW() - INTERVAL '90 days'
        GROUP BY hora ORDER BY hora
      `)
    ]);
    const dias = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
    const diasData = Array(7).fill(0);
    const diasTotal = Array(7).fill(0);
    porDia.rows.forEach(r => { diasData[parseInt(r.dia)] = parseInt(r.cantidad); diasTotal[parseInt(r.dia)] = parseFloat(r.total); });
    const horasData = Array(24).fill(0);
    porHora.rows.forEach(r => { horasData[parseInt(r.hora)] = parseInt(r.cantidad); });
    res.json({ dias: { labels: dias, cantidad: diasData, total: diasTotal }, horas: { labels: Array.from({length:24}, (_,i) => i+'hs'), cantidad: horasData } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


app.get('/api/stock/alertas', auth, async (req, res) => {
  try {
    const r = await pool.query(`SELECT * FROM productos WHERE activo=true ORDER BY nombre`);
    const alertas = { critico: [], alto: [], medio: [] };
    for (const p of r.rows) {
      const prioridad = getStockPriority(p);
      if (prioridad !== 'ok') alertas[prioridad].push({ id: p.id, nombre: p.nombre, stock: p.stock_actual, unidad: p.vende_por_kg ? 'kg' : 'ud' });
    }
    res.json(alertas);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/dashboard', auth, async (req, res) => {
  try {
    const hoy = new Date().toISOString().split('T')[0];
    const [ventasHoy, totalMes, ingresosMes, todosProds] = await Promise.all([
      pool.query(`SELECT COALESCE(SUM(total),0) as total, COUNT(*) as cantidad FROM ventas WHERE fecha::date = $1`, [hoy]),
      pool.query(`SELECT COALESCE(SUM(total),0) as total FROM ventas WHERE DATE_TRUNC('month', fecha) = DATE_TRUNC('month', NOW())`),
      pool.query(`SELECT COALESCE(SUM(total),0) as total FROM ingresos_mercaderia WHERE DATE_TRUNC('month', fecha) = DATE_TRUNC('month', NOW())`),
      pool.query(`SELECT * FROM productos WHERE activo=true`),
    ]);
    const alertasCritico = [];
    for (const p of todosProds.rows) {
      if (getStockPriority(p) === 'critico') alertasCritico.push({ nombre: p.nombre, stock: parseFloat(p.stock_actual), unidad: p.vende_por_kg ? 'kg' : 'ud' });
    }
    const ultimasVentas = await pool.query(`
      SELECT v.id, v.total, v.medio_pago, v.fecha,
        u.nombre as empleado,
        COALESCE(c.nombre || ' ' || COALESCE(c.apellido,''), 'Mostrador') as cliente
      FROM ventas v
      LEFT JOIN usuarios u ON v.usuario_id = u.id
      LEFT JOIN clientes c ON v.cliente_id = c.id
      ORDER BY v.fecha DESC LIMIT 8
    `);
    res.json({
      ventas_hoy: { total: parseFloat(ventasHoy.rows[0].total), cantidad: parseInt(ventasHoy.rows[0].cantidad) },
      stock_critico: alertasCritico.length,
      alertas_critico: alertasCritico,
      total_mes: parseFloat(totalMes.rows[0].total),
      gastos_mes: parseFloat(ingresosMes.rows[0].total),
      ultimas_ventas: ultimasVentas.rows
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/public/index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  await initDB();
  console.log(`Fatiga Pet Shop corriendo en puerto ${PORT}`);
});
