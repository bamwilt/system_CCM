# Guía de instalación (servidor local)

1. Instalar PostgreSQL 16 y Node.js LTS.
2. Crear BD sgpm_prod y usuario sgpm_app.
3. Aplicar migraciones 001..010.
4. Copiar .env.example a .env y ajustar.
5. npm ci && npm run build.
6. Instalar servicio systemd (deployment/sgpm.service).
7. Configurar nginx + HTTPS local.
