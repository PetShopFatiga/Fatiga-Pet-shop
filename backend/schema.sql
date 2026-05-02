-- =============================================
-- FATIGA PET SHOP - Base de datos completa
-- =============================================

CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  rol VARCHAR(20) DEFAULT 'empleado',
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categorias (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  icono VARCHAR(10)
);

CREATE TABLE IF NOT EXISTS proveedores (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL,
  contacto VARCHAR(100),
  telefono VARCHAR(50),
  activo BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS productos (
  id SERIAL PRIMARY KEY,
  codigo VARCHAR(20) UNIQUE,
  nombre VARCHAR(200) NOT NULL,
  categoria_id INTEGER REFERENCES categorias(id),
  precio_lista NUMERIC(12,2) NOT NULL DEFAULT 0,
  precio_por_kg NUMERIC(12,2),
  precio_costo NUMERIC(12,2),
  vende_por_kg BOOLEAN DEFAULT false,
  stock_actual NUMERIC(10,2) DEFAULT 0,
  stock_minimo NUMERIC(10,2) DEFAULT 0,
  unidad VARCHAR(10) DEFAULT 'ud',
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clientes (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL,
  apellido VARCHAR(100),
  telefono VARCHAR(50),
  direccion VARCHAR(200),
  tipo_mascota VARCHAR(50),
  alimento_preferido VARCHAR(200),
  notas TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ventas (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER REFERENCES usuarios(id),
  cliente_id INTEGER REFERENCES clientes(id),
  fecha TIMESTAMP DEFAULT NOW(),
  subtotal NUMERIC(12,2) NOT NULL,
  descuento NUMERIC(12,2) DEFAULT 0,
  total NUMERIC(12,2) NOT NULL,
  medio_pago VARCHAR(30) NOT NULL,
  observaciones TEXT
);

CREATE TABLE IF NOT EXISTS venta_items (
  id SERIAL PRIMARY KEY,
  venta_id INTEGER REFERENCES ventas(id) ON DELETE CASCADE,
  producto_id INTEGER REFERENCES productos(id),
  cantidad NUMERIC(10,2) NOT NULL,
  precio_unitario NUMERIC(12,2) NOT NULL,
  subtotal NUMERIC(12,2) NOT NULL,
  modo VARCHAR(10) DEFAULT 'ud'
);

CREATE TABLE IF NOT EXISTS ingresos_mercaderia (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER REFERENCES usuarios(id),
  proveedor_id INTEGER REFERENCES proveedores(id),
  fecha TIMESTAMP DEFAULT NOW(),
  total NUMERIC(12,2),
  medio_pago VARCHAR(30),
  estado VARCHAR(30) DEFAULT 'pagado',
  observaciones TEXT
);

CREATE TABLE IF NOT EXISTS ingreso_items (
  id SERIAL PRIMARY KEY,
  ingreso_id INTEGER REFERENCES ingresos_mercaderia(id) ON DELETE CASCADE,
  producto_id INTEGER REFERENCES productos(id),
  cantidad NUMERIC(10,2) NOT NULL,
  precio_unitario NUMERIC(12,2),
  subtotal NUMERIC(12,2)
);

CREATE TABLE IF NOT EXISTS gastos (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER REFERENCES usuarios(id),
  fecha TIMESTAMP DEFAULT NOW(),
  descripcion VARCHAR(200) NOT NULL,
  monto NUMERIC(12,2) NOT NULL,
  categoria VARCHAR(100),
  medio_pago VARCHAR(30)
);

-- =============================================
-- DATOS INICIALES
-- =============================================

INSERT INTO categorias (nombre, icono) VALUES
  ('Perro adulto', '🐕'),
  ('Cachorro', '🐶'),
  ('Gato adulto', '🐱'),
  ('Gatito', '😺'),
  ('Salud y prevención', '💊'),
  ('Higiene', '🛁'),
  ('Alimentos varios', '🌾'),
  ('Húmedos y snacks', '🥫'),
  ('Accesorios', '🦮'),
  ('Indumentaria', '👕'),
  ('Confort', '🛏️')
ON CONFLICT DO NOTHING;

INSERT INTO proveedores (nombre, contacto, telefono) VALUES
  ('Distribuidora EMVI', 'Jonathan', ''),
  ('Distripampa (Diego)', 'Diego', ''),
  ('La Forrajería (Javi)', 'Javi', '2392401160'),
  ('Daniel Lerman SRL', '', ''),
  ('Guapetones (Karen)', 'Karen', ''),
  ('Petzer', '', ''),
  ('Sr. González (Dani)', 'Dani', '2314616355'),
  ('Tayson (Juan)', 'Juan', '2392401522'),
  ('Purina (Afrodita)', 'Afrodita', '2392464922'),
  ('ModaPet', '', ''),
  ('Elecant (Sabrina)', 'Sabrina', '2233457601'),
  ('Biopet (El Punto) Rocio', 'Rocio', '2392517908')
ON CONFLICT DO NOTHING;

INSERT INTO usuarios (nombre, username, password_hash, rol) VALUES
  ('Jonathan', 'jonathan', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin'),
  ('Mili', 'mili', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'empleado')
ON CONFLICT DO NOTHING;

-- PRODUCTOS - Perro adulto (fraccionables)
INSERT INTO productos (codigo, nombre, categoria_id, precio_lista, precio_por_kg, precio_costo, vende_por_kg, stock_actual, stock_minimo, unidad) VALUES
  ('PA001', 'Voraz carne perro adulto 22kg', 1, 31450, 1950, 1200, true, 18.2, 10, 'kg'),
  ('PA002', 'Pacha carne perro adulto 22kg', 1, 32600, 2000, 1250, true, 139.1, 20, 'kg'),
  ('PA003', 'Vagoneta perro adulto gourmet 20kg', 1, 32150, 2150, 1300, true, 60.6, 10, 'kg'),
  ('PA004', 'Nutribon plus perro adulto 20kg', 1, 32700, 2200, 1350, true, 61, 10, 'kg'),
  ('PA005', 'Gran Campeón carne perro adulto 21kg', 1, 35900, 2300, 1450, true, 56.8, 10, 'kg'),
  ('PA006', 'Biopet perro adulto 20kg', 1, 34100, 2400, 1500, true, 115.1, 20, 'kg'),
  ('PA007', 'Sabrositos perro adulto 20kg', 1, 34950, 2600, 1600, true, 28.9, 10, 'kg'),
  ('PA008', 'Dog Sel. Criad. C&C perro adulto 21kg', 1, 51350, 2900, 1800, true, 98.38, 20, 'kg'),
  ('PA012', 'Pedigree adulto 8kg', 1, 29050, 0, 0, false, 1, 2, 'ud'),
  ('PA013', 'Vagoneta perro adulto C&C 20kg', 1, 32150, 2150, 1300, true, 3, 5, 'kg'),
  ('PA014', 'Estampa criadores adulto 20kg', 1, 41750, 0, 0, true, 3, 5, 'kg'),
  ('PA015', 'Estampa plus perro adulto 20kg', 1, 49550, 0, 0, true, 4, 5, 'kg'),
  ('PA017', 'Old Prince cordero y arroz adulto 15kg', 1, 83000, 77200, 0, true, 0, 3, 'kg'),
  ('PRP001', 'Biopet adulto R.P. 15kg', 1, 27600, 2500, 1550, true, 16.7, 10, 'kg'),
  ('PRP002', 'Sabrositos adulto R.P. 15kg', 1, 29050, 2700, 1650, true, 30.3, 10, 'kg'),
  ('PRP003', 'Dog Sel. Criad. C&C adulto R.P. 15kg', 1, 51350, 2900, 1800, true, 52.8, 10, 'kg'),
-- Cachorros
  ('CA001', 'Dog Sel. Criad. C&C cachorro 21kg', 2, 51350, 2900, 1800, true, 35.3, 10, 'kg'),
  ('CA002', 'Estampa cachorro 15kg', 2, 32503, 2400, 1500, true, 67.8, 10, 'kg'),
  ('CA003', 'Nutribon cachorro 15kg', 2, 24205, 2000, 1200, true, 47.2, 10, 'kg'),
  ('CA004', 'Dog Chow cachorro gran comienzo M/G 8kg', 2, 51478, 0, 0, false, 8.5, 3, 'ud'),
  ('CA005', 'Gran Campeón cachorro 10kg', 2, 26579, 0, 0, true, 0, 3, 'kg'),
-- Gato adulto
  ('GA001', 'Voraz gato 10kg', 3, 23950, 3150, 1900, true, 15.675, 5, 'kg'),
  ('GA002', 'Sabrositos mix gato 20kg', 3, 49250, 3200, 2000, true, 13.4, 5, 'kg'),
  ('GA004', 'Raza pescado gato 15kg', 3, 46400, 3700, 2200, true, 21, 5, 'kg'),
  ('GA007', 'Gati pollo/carne gato 15kg', 3, 58050, 5050, 3100, true, 17.8, 5, 'kg'),
  ('GA009', 'Whiskas carne gato 10kg', 3, 51600, 6150, 3800, true, 20.3, 5, 'kg'),
  ('GA010', 'Raza castrado 10kg', 3, 39050, 5100, 3100, true, 17.2, 5, 'kg'),
  ('GA011', 'Whiskas castrado gato 10kg', 3, 57100, 6800, 4100, true, 14.4, 5, 'kg'),
  ('GA013', 'Cat Chow carne gato 15kg', 3, 100400, 7950, 4900, true, 15.6, 5, 'kg'),
  ('GA006', 'Estampa plus gato 15kg', 3, 46850, 4050, 2500, true, 27.1, 5, 'kg'),
-- Gatito
  ('GK001', 'Voraz gatito 15kg', 4, 42150, 3350, 2000, true, 0, 3, 'kg'),
  ('GK005', 'Whiskas gatito 10kg', 4, 51600, 5750, 3500, true, 14.9, 3, 'kg'),
  ('GK007', 'Eukanuba gatito 7.5kg', 4, 62650, 6900, 4200, true, 32.4, 3, 'kg'),
  ('GK100', 'Cat Chow gatito 1kg', 4, 9800, 0, 0, false, 11, 5, 'ud'),
-- Salud
  ('SP020', 'Pipeta Osspret 0 a 4kg gato', 5, 4350, 0, 0, false, 14, 5, 'ud'),
  ('SP021', 'Pipeta Osspret 4 a 8kg gato', 5, 4700, 0, 0, false, 20, 5, 'ud'),
  ('SP022', 'Pipeta Osspret 11 a 20kg', 5, 4950, 0, 0, false, 18, 5, 'ud'),
  ('SP023', 'Pipeta Osspret 2 a 10kg', 5, 4550, 0, 0, false, 15, 5, 'ud'),
  ('SP024', 'Pipeta Osspret 21 a 40kg', 5, 6000, 0, 0, false, 19, 5, 'ud'),
  ('SP005', 'Comprimido Basken doble 20', 5, 4100, 0, 0, false, 2, 3, 'ud'),
  ('SP006', 'Comprimido Basken doble 40', 5, 6550, 0, 0, false, 7, 3, 'ud'),
  ('SP029', 'Raticida Ultra Plus', 5, 2100, 0, 0, false, 18, 5, 'ud'),
-- Higiene
  ('HIG001', 'Piedras sanitarias comunes', 6, 3500, 0, 0, false, 6, 5, 'ud'),
  ('HIG002', 'Piedras sanitarias perfumada lavanda', 6, 4200, 0, 0, false, 5, 5, 'ud'),
  ('HIG003', 'Piedras sanitarias aglutinante', 6, 4500, 0, 0, false, 11, 5, 'ud'),
  ('BSC', 'Bandeja sanitaria chica', 6, 3000, 0, 0, false, 1, 2, 'ud'),
-- Alimentos varios
  ('GS001', 'Alpiste 1kg', 7, 3400, 0, 1700, false, 6, 5, 'ud'),
  ('GS002', 'Arroz saborizado 1kg', 7, 1400, 0, 700, false, 5, 5, 'ud'),
  ('GS003', 'Balanceado conejo 1kg', 7, 1500, 0, 750, false, 8, 5, 'ud'),
  ('GS006', 'Girasol 0.5kg', 7, 1300, 0, 645, false, 2, 5, 'ud'),
  ('GS008', 'Mijo 1kg', 7, 1600, 0, 777, false, 4, 5, 'ud'),
-- Húmedos y snacks
  ('HU001', 'Pouch Pedigree adulto', 8, 1700, 0, 1015, false, 17, 10, 'ud'),
  ('HU002', 'Pouch Pedigree adulto R.P.', 8, 1700, 0, 1015, false, 12, 10, 'ud'),
  ('HU003', 'Pouch Pedigree cachorro', 8, 1700, 0, 1015, false, 19, 10, 'ud'),
  ('HU004', 'Pouch Whiskas carne', 8, 1700, 0, 1015, false, 14, 10, 'ud'),
  ('HU005', 'Pouch Whiskas gatito', 8, 1700, 0, 1015, false, 3, 10, 'ud'),
  ('SK001', 'Asaditos', 8, 2250, 0, 1333, false, 60, 20, 'ud'),
  ('SK002', 'Biscrok multi 50gr', 8, 850, 0, 493, false, 5, 10, 'ud'),
-- Accesorios
  ('ATL', 'Arnés en tela talle L', 9, 17250, 0, 0, false, 2, 1, 'ud'),
  ('ATM', 'Arnés en tela talle M', 9, 16750, 0, 0, false, 0, 1, 'ud'),
  ('ATS', 'Arnés en tela talle S', 9, 16350, 0, 0, false, 2, 1, 'ud'),
  ('COP2', 'Collar polipropileno N°2', 9, 2250, 0, 0, false, 6, 2, 'ud'),
  ('COP3', 'Collar polipropileno N°3', 9, 2350, 0, 0, false, 4, 2, 'ud'),
  ('COP4', 'Collar polipropileno N°4', 9, 2850, 0, 0, false, 2, 2, 'ud'),
  ('CDM', 'Cinturón de mascota', 9, 5150, 0, 0, false, 4, 1, 'ud'),
  ('CE3MP', 'Correa extensible 3mts Modapet', 9, 9150, 0, 0, false, 3, 1, 'ud'),
-- Indumentaria
  ('CALTN1', 'Capa lisa talle N°1', 10, 4200, 0, 0, false, 0, 1, 'ud'),
  ('CALTN2', 'Capa lisa talle N°2', 10, 4800, 0, 0, false, 1, 1, 'ud'),
  ('CALTN6', 'Capa lisa talle N°6', 10, 7200, 0, 0, false, 3, 1, 'ud'),
  ('CHLT1', 'Chaleco liso talle 1', 10, 4750, 0, 0, false, 1, 1, 'ud'),
  ('CHLT2', 'Chaleco liso talle 2', 10, 5450, 0, 0, false, 2, 1, 'ud'),
-- Confort
  ('CCC', 'Colchoneta chipre chica', 11, 17500, 0, 8732, false, 2, 1, 'ud'),
  ('MPN1', 'Manta polar', 11, 14400, 0, 7200, false, 16, 3, 'ud'),
  ('MOC', 'Moisés ovalado chico', 11, 16000, 0, 8000, false, 2, 1, 'ud')
ON CONFLICT (codigo) DO NOTHING;

-- Clientes de la hoja BDD
INSERT INTO clientes (nombre, apellido, telefono, direccion, tipo_mascota, alimento_preferido) VALUES
  ('Juan', 'Carlos', '2392517236', 'Vte. Lopez 702', 'Perro', 'Voraz Adulto 22kg'),
  ('Jose A.', 'Nicoliello', '2392484588', 'Alem 533', 'Perro', 'Biopet adulto 20kg'),
  ('Lorena', 'Castro', '1162209250', 'I. Suarez 1087', 'Perro', 'Biopet adulto 20kg'),
  ('María', 'Luján', '', 'Wilde 335', 'Perro', 'Old Prince cordero 15kg'),
  ('Ema', 'Otero', '', 'Mirabelli 1500', 'Perro', 'Nutribon plus adulto 20kg')
ON CONFLICT DO NOTHING;
