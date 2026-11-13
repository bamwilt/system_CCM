# Despliegue local (servidor del colegio)

1. Instalar PostgreSQL 16, Node.js LTS.
2. Crear BD sgpm_prod y usuario sgpm_app.
3. Aplicar migraciones 001..010.
4. Configurar .env de producción (JWT_SECRET fuerte, CORS_ORIGIN del dominio local).
5. npm ci && npm run build (frontend), npm run start (backend) detrás de nginx con HTTPS (certificado local).
6. Configurar respaldo diario (pg_dump) y restauración probada.
