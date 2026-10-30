# 🚀 HC-SCAN API Backend

Backend modular y multitenant para la plataforma **HC-SCAN (Helpcopies Scan)**, desarrollado con **NestJS 11**, **Sequelize** y **PostgreSQL**.

---

## 📋 Módulos Implementados

1. **`CompaniesModule` (`/api/companies`)**:
   - Gestión integral de tenants: alta, listado paginado, búsqueda por nombre/slug/taxId, actualización y cambio de estado.
   - Auditoría y notificaciones automáticas ante eventos de ciclo de vida.

2. **`UsersModule` (`/api/users`)**:
   - Administración de usuarios asignados a compañías (`company_id`).
   - Hash seguro de contraseñas con Bcrypt.
   - Perfil de usuario, roles personalizados y excepciones de permisos directos.

3. **`RoleModule` (`/api/role`)**:
   - Roles globales de plataforma (`superadmin`) y roles por compañía (`company_admin`, `user`).
   - Asignación atómica de permisos en tabla intermedia `RolePermission`.

4. **`PermissionsModule` (`/api/permissions`)**:
   - Catálogo canónico de permisos clasificado por módulos (`CORE`, `COMPANIES`, `USERS`, `ROLES`, `DOCUMENTS`, `AUDIT`, `NOTIFICATIONS`).

5. **`AuthModule` (`/api/auth`)**:
   - Autenticación Passport JWT (`/api/auth/signin`).
   - Registro de usuarios administradores de compañía (`/api/auth/signup`).
   - Validación de estado activo tanto del usuario como de su compañía.
   - Endpoint de identidad y permisos unificados (`/api/auth/me`).

6. **`AuditModule` (`/api/audit`)**:
   - Trazabilidad y registro inmutable de acciones (`AuditLog`) con `company_id`.
   - Sanitización automática de payloads sensibles (tokens, contraseñas).
   - Filtros por entidad, acción, usuario, compañía y búsqueda de texto.

7. **`NotificationsModule` (`/api/notifications`)**:
   - WebSocket Gateway con Socket.io en el namespace `/notifications`.
   - Rooms dedicadas por usuario (`user-<id>`) y por tenant (`company-<id>`).
   - Soporte para Web Push Notifications y preferencias por usuario.

8. **`DocumentsModule` (`/api/documents`)**:
   - Subida y almacenamiento de archivos PDF en `storage/tenancy/<company_id>/`.
   - Soporte dual de ingesta: vía **Aplicación Web** (`POST /api/documents/upload`) y vía **Servidor FTP** (`POST /api/documents/sync-ftp`).
   - Metadatos de documento: tamaño, mimeType, hash SHA256, origen (`APP_UPLOAD` / `FTP`) y estado (`PENDING`, `PROCESSING`, `PROCESSED`, `ERROR`).
   - Visualización y streaming de PDFs (`GET /api/documents/:id/file`).
   - Bloqueo por `TenantModuleGuard` si la empresa no tiene contratado el módulo `documents`.

9. **`UploadsModule` (`/api/uploads`)**:
   - Almacenamiento seguro en disco con validación de tipo MIME y tamaño:
     - Documentos PDF (`/uploads/documents` hasta 25MB).
     - Avatares y Logos (`/uploads/users`, `/uploads/companies`).

---

## 📂 Arquitectura de Almacenamiento (`storage/tenancy/<company_id>`)

Los archivos PDF de cada empresa se almacenan de forma estrictamente aislada por ID de compañía:

```text
storage/
└── tenancy/
    ├── 1/                    <-- Cliente ID 1 (ej: Helpcopies Matriz)
    │   ├── factura_001.pdf   <-- Subido vía FTP
    │   └── remito_app_1.pdf  <-- Subido desde la Web App
    ├── 2/                    <-- Cliente ID 2
    └── ...
```

- **Ruta Física**: Configurable por `STORAGE_ROOT_PATH` (por defecto `storage/tenancy`).
- **Compatibilidad FTP**: Los servidores FTP (vsftpd, proftpd, FileZilla) pueden montar directamente la carpeta `storage/tenancy/<company_id>` como la raíz `home` de cada usuario FTP.
- **Detección Automática**: El endpoint `POST /api/documents/sync-ftp` (o un cron de fondo) detecta archivos depositados por FTP, calcula su hash y los registra como `PENDING` para su posterior procesamiento con IA.

---

## 🛠️ Comandos de Desarrollo

```bash
# Instalar dependencias
npm install

# Compilación TypeScript
npm run build

# Ejecución en desarrollo con recarga en caliente
npm run start:dev

# Inicialización forzada de esquemas y tablas
npm run start (con DB_FORCE_SYNC=true en .env)
# o mediante el script dedicado:
npx ts-node scripts/init-postgres-schema.ts

# Linter y formato
npm run lint
npm run format
```
