-- Script de base de datos para el Sistema de Gestión de Reservas de Hotel
-- Motor recomendado: InnoDB para soportar claves foráneas

CREATE DATABASE IF NOT EXISTS hotel_reservations CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE hotel_reservations;

-- 1. Tabla de Usuarios (Sistema)
CREATE TABLE usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    rol ENUM('administrador', 'gerente', 'recepcion') NOT NULL,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tabla de Empresas (Cuentas Corporativas)
CREATE TABLE empresas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    rfc VARCHAR(20) NULL,
    direccion TEXT,
    telefono VARCHAR(20),
    email_contacto VARCHAR(100),
    descuento_porcentaje DECIMAL(5,2) DEFAULT 0.00,
    cuenta_abierta BOOLEAN DEFAULT TRUE,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Tabla de Clientes
CREATE TABLE clientes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    apellidos VARCHAR(100) NOT NULL,
    tipo ENUM('individual', 'empresa') NOT NULL,
    empresa_id INT NULL,
    telefono VARCHAR(20),
    email VARCHAR(100),
    tarjeta_credito VARCHAR(20) NULL, -- Guardar solo últimos 4 dígitos o usar tokenización en prod
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE SET NULL
);

-- 4. Tabla de Habitaciones
CREATE TABLE habitaciones (
    id INT AUTO_INCREMENT PRIMARY KEY,
    numero VARCHAR(10) NOT NULL UNIQUE,
    tipo VARCHAR(50) DEFAULT 'Estándar',
    permite_fumadores BOOLEAN DEFAULT FALSE,
    estado ENUM('libre', 'ocupada', 'mantenimiento') DEFAULT 'libre',
    precio_noche DECIMAL(10,2) NOT NULL
);

-- 5. Tabla de Reservas
CREATE TABLE reservas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cliente_id INT NOT NULL,
    habitacion_id INT NULL, -- Puede ser null si aún no se asigna la habitación específica (solo se cuenta el cupo)
    fecha_reserva TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_entrada DATE NOT NULL,
    fecha_salida DATE NOT NULL,
    tipo_reserva ENUM('telefonica', 'mostrador', 'online') NOT NULL,
    tipo_pension ENUM('solo_dormir', 'media_pension', 'pension_completa') NOT NULL DEFAULT 'solo_dormir',
    estado ENUM('pendiente', 'check_in', 'check_out', 'no_show', 'cancelada') DEFAULT 'pendiente',
    notas TEXT,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE,
    FOREIGN KEY (habitacion_id) REFERENCES habitaciones(id) ON DELETE SET NULL
);

-- 6. Tabla de Cargos Extras (Llamadas, bar, etc)
CREATE TABLE cargos_extra (
    id INT AUTO_INCREMENT PRIMARY KEY,
    reserva_id INT NOT NULL,
    concepto VARCHAR(100) NOT NULL,
    monto DECIMAL(10,2) NOT NULL,
    fecha_cargo TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (reserva_id) REFERENCES reservas(id) ON DELETE CASCADE
);

-- 7. Tabla de Facturas
CREATE TABLE facturas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cliente_id INT NULL,
    empresa_id INT NULL,
    reserva_id INT NULL,
    fecha_emision TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    subtotal DECIMAL(10,2) NOT NULL,
    total DECIMAL(10,2) NOT NULL,
    tipo_factura ENUM('estancia', 'no_show', 'mensual_empresa') NOT NULL,
    estado_pago ENUM('pendiente', 'pagada') DEFAULT 'pendiente',
    FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL,
    FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE SET NULL,
    FOREIGN KEY (reserva_id) REFERENCES reservas(id) ON DELETE SET NULL
);

-- DATOS DE PRUEBA (Muestra)

-- Usuarios
INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES 
('Admin Sistema', 'admin@hotel.com', 'hashed_pass_123', 'administrador'),
('Gerente Hotel', 'gerente@hotel.com', 'hashed_pass_123', 'gerente'),
('Recepcionista 1', 'recepcion1@hotel.com', 'hashed_pass_123', 'recepcion');

-- Empresas
INSERT INTO empresas (nombre, descuento_porcentaje, cuenta_abierta) VALUES 
('TechCorp Solutions', 15.00, TRUE),
('Global Marketing', 10.00, TRUE);

-- Habitaciones
INSERT INTO habitaciones (numero, tipo, permite_fumadores, estado, precio_noche) VALUES 
('101', 'Estándar', FALSE, 'libre', 100.00),
('102', 'Estándar', FALSE, 'libre', 100.00),
('103', 'Estándar', TRUE, 'libre', 100.00),
('201', 'Suite', FALSE, 'libre', 250.00),
('202', 'Suite', FALSE, 'ocupada', 250.00);

-- Clientes
INSERT INTO clientes (nombre, apellidos, tipo, empresa_id, tarjeta_credito) VALUES 
('Juan', 'Pérez', 'individual', NULL, '****-****-****-1234'),
('María', 'Gómez', 'empresa', 1, NULL),
('Carlos', 'López', 'individual', NULL, '****-****-****-5678');

-- Reservas (Muestra)
INSERT INTO reservas (cliente_id, habitacion_id, fecha_entrada, fecha_salida, tipo_reserva, tipo_pension, estado) VALUES 
(1, 1, '2026-04-25', '2026-04-28', 'telefonica', 'media_pension', 'pendiente'),
(2, 5, '2026-04-20', '2026-04-24', 'mostrador', 'pension_completa', 'check_in');

-- Cargos (Para la reserva activa de María Gómez)
INSERT INTO cargos_extra (reserva_id, concepto, monto) VALUES 
(2, 'Servicio a la habitación - Cena', 45.50),
(2, 'Minibar', 12.00);
