# Grand Luxe Hotel

Sistema web de gestion de reservas conectado a MySQL con un backend Express.

## Requisitos

- Node.js 18 o superior
- MySQL con la base `hotel_reservations`

## Configuracion

1. Importa la base de datos:

```bash
mysql -u root -p < hotel_db.sql
```

2. Instala dependencias:

```bash
npm install
```

3. Copia `.env.example` como `.env` y ajusta tus credenciales de MySQL:

```bash
cp .env.example .env
```

4. Inicia el servidor:

```bash
npm run dev
```

La aplicacion queda disponible en `http://localhost:3000`.

## Usuarios de prueba

El script SQL trae passwords de demostracion sin hash real. Para probar login usa:

- `admin@hotel.com` / `hashed_pass_123` / Administrador
- `gerente@hotel.com` / `hashed_pass_123` / Gerente
- `recepcion1@hotel.com` / `hashed_pass_123` / Recepcion

Para produccion se debe reemplazar esto por hashes reales con bcrypt.
