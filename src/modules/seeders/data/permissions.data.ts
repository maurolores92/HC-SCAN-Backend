import { CategoriaPermiso } from '../../permissions/permission.model';

/**
 * Permisos de plataforma antiguos que NO deben existir como permisos asignables.
 * Compañías, Planes, Catálogo de Permisos y Administración de Notificaciones
 * están reservados exclusivamente al rol `superadmin`.
 */
export const DEPRECATED_PLATFORM_PERMISSIONS = [
  'VIEW_COMPANIES',
  'CREATE_COMPANY',
  'UPDATE_COMPANY',
  'DELETE_COMPANY',
  'VIEW_PLANS',
  'CREATE_PLAN',
  'UPDATE_PLAN',
  'DELETE_PLAN',
  'VIEW_PERMISSIONS',
  'ASSIGN_PERMISSIONS',
  'VIEW_NOTIFICATIONS',
  'MANAGE_NOTIFICATIONS',
];

export const permissionsData = [
  // ==========================================
  // CORE / DASHBOARD
  // ==========================================
  {
    name: 'VIEW_DASHBOARD',
    displayName: 'Ver Dashboard',
    description: 'Permite visualizar el panel de control y resumen operativo de la compañía',
    categoria: CategoriaPermiso.CORE,
  },

  // ==========================================
  // USUARIOS
  // ==========================================
  {
    name: 'VIEW_USERS',
    displayName: 'Ver Usuarios',
    description: 'Permite visualizar el listado de usuarios y cupo de usuarios de la compañía',
    categoria: CategoriaPermiso.USERS,
  },
  {
    name: 'CREATE_USER',
    displayName: 'Crear Usuarios',
    description: 'Otorga la capacidad de registrar nuevos usuarios dentro de la compañía',
    categoria: CategoriaPermiso.USERS,
  },
  {
    name: 'UPDATE_USER',
    displayName: 'Editar Usuarios',
    description: 'Permite modificar datos, estado y excepciones de acceso de usuarios de la compañía',
    categoria: CategoriaPermiso.USERS,
  },
  {
    name: 'DELETE_USER',
    displayName: 'Eliminar Usuarios',
    description: 'Permite desactivar usuarios de la compañía',
    categoria: CategoriaPermiso.USERS,
  },

  // ==========================================
  // ROLES
  // ==========================================
  {
    name: 'VIEW_ROLES',
    displayName: 'Ver Roles',
    description: 'Permite visualizar los roles configurados en la compañía',
    categoria: CategoriaPermiso.ROLES,
  },
  {
    name: 'CREATE_ROLE',
    displayName: 'Crear Roles',
    description: 'Habilita la creación de nuevos roles personalizados para la compañía',
    categoria: CategoriaPermiso.ROLES,
  },
  {
    name: 'UPDATE_ROLE',
    displayName: 'Editar Roles',
    description: 'Permite modificar nombres y accesos de los roles de la compañía',
    categoria: CategoriaPermiso.ROLES,
  },
  {
    name: 'DELETE_ROLE',
    displayName: 'Eliminar Roles',
    description: 'Habilita la eliminación de roles personalizados de la compañía',
    categoria: CategoriaPermiso.ROLES,
  },

  // ==========================================
  // DOCUMENTOS & PROCESAMIENTO IA (HC-SCAN)
  // ==========================================
  {
    name: 'VIEW_DOCUMENTS',
    displayName: 'Ver Documentos',
    description: 'Permite visualizar los archivos PDF y el uso de almacenamiento del plan',
    categoria: CategoriaPermiso.DOCUMENTS,
  },
  {
    name: 'UPLOAD_DOCUMENT',
    displayName: 'Subir Documentos',
    description: 'Permite cargar nuevos archivos PDF para su procesamiento con IA',
    categoria: CategoriaPermiso.DOCUMENTS,
  },
  {
    name: 'DELETE_DOCUMENT',
    displayName: 'Eliminar Documentos',
    description: 'Permite eliminar archivos PDF y liberar espacio de almacenamiento',
    categoria: CategoriaPermiso.DOCUMENTS,
  },
  {
    name: 'QUERY_AI_DOCUMENTS',
    displayName: 'Consultar Documentos con IA',
    description: 'Habilita el motor de consultas inteligentes y visibilidad del cupo mensual de IA',
    categoria: CategoriaPermiso.DOCUMENTS,
  },

  // ==========================================
  // AUDITORÍA
  // ==========================================
  {
    name: 'VIEW_AUDITS',
    displayName: 'Ver Auditoría',
    description: 'Permite auditar el historial de operaciones de la compañía',
    categoria: CategoriaPermiso.AUDIT,
  },
];
