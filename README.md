# SGPM - Sistema de Gestion de Pagos y Matriculas

Colegio Cristiano Maranatha

## Requisitos

- Node.js 22+
- npm 10+
- PostgreSQL 16+

## Instalacion

### 1. Clonar el repositorio

```bash
git clone <repo-url>
cd sgpm
```

### 2. Backend

```bash
cd backend
cp .env.example .env
# Editar .env con tus credenciales de PostgreSQL
npm install
npm run dev
```

El servidor Express arranca en http://localhost:3000

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

La aplicacion React arranca en http://localhost:5173

### 4. Base de datos

Crear la base de datos y usuario:

```sql
CREATE ROLE sgpm_user WITH LOGIN PASSWORD 'sgpm_dev_password';
CREATE DATABASE sgpm_dev OWNER sgpm_user;
```

### 5. Verificacion

```bash
# Backend
cd backend && npm test

# Frontend
cd frontend && npm test
```

## Endpoints de diagnostico

- `GET /api/health` - Estado del servidor y conexion a BD
- `GET /api/ready` - Readiness probe

## Estructura del proyecto

```
sgpm/
├── frontend/          # React 19 + Vite + TypeScript
├── backend/           # Node.js 22 + Express 5 + TypeScript
├── database/          # Migraciones, seeds, scripts
├── docs/              # Documentacion del proyecto
├── deployment/        # Configuracion de despliegue
├── scripts/           # Scripts de utilidad
└── README.md
```

## Stack tecnologico

- **Frontend:** React 19, Vite, TypeScript, React Router 7, Axios
- **Backend:** Node.js 22, Express 5, TypeScript, Zod, Helmet, CORS
- **Base de datos:** PostgreSQL 16, driver pg
- **Testing:** Vitest, Supertest, Testing Library
- **Linting:** ESLint, TypeScript ESLint
