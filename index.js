require('dotenv').config();
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

async function initDB() {
  const fs = require('fs');
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  try {
    await pool.query(schema);
    console.log('Base de datos inicializada');
  } catch (e) {
    console.error('Error inicializando DB:', e.message);
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

// ── INGRESO MERCADERÍA ─────────────────────────────
app.post('/api/ingresos', auth, async (req, res) => {
  const { proveedor_id, items, total, medio_pago, estado, observaciones } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ir = await client.query(
      'INSERT INTO ingresos_mercaderia (usuario_id, proveedor_id, total, medio_pago, estado, observaciones) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
      [req.user.id, proveedor_id || null, total || 0, medio_pago || 'efectivo', estado || 'pagado', observaciones || null]
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
    if (stock < bolsa) return 'critico';
    if (stock < bolsa * 2) return 'alto';
    if (stock < bolsa * 3) return 'medio';
    return 'ok';
  } else {
    if (stock <= 0) return 'critico';
    if (stock <= 1) return 'alto';
    if (stock <= 2) return 'medio';
    return 'ok';
  }
}

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
    const alertas = { critico: [], alto: [], medio: [] };
    for (const p of todosProds.rows) {
      const prioridad = getStockPriority(p);
      if (prioridad !== 'ok') alertas[prioridad].push({ nombre: p.nombre, stock: p.stock_actual, unidad: p.vende_por_kg ? 'kg' : 'ud' });
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
      stock_critico: alertas.critico.length,
      stock_alto: alertas.alto.length,
      stock_medio: alertas.medio.length,
      alertas,
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
