import { CategoriaPermiso } from '../../permissions/permission.model';

export const permissionsData = [
  // ==========================================
  // CORE / DASHBOARD
  // ==========================================
  {
    name: 'VIEW_DASHBOARD',
    displayName: 'Ver Dashboard',
    description: 'Permite visualizar el panel de control y métricas del sistema',
    categoria: CategoriaPermiso.CORE,
  },

  // ==========================================
  // COMPAÑÍAS / TENANTS
  // ==========================================
  {
    name: 'VIEW_COMPANIES',
    displayName: 'Ver Compañías',
    description: 'Permite visualizar y listar las organizaciones/tenants registradas',
    categoria: CategoriaPermiso.COMPANIES,
  },
  {
    name: 'CREATE_COMPANY',
    displayName: 'Crear Compañías',
    description: 'Habilita la creación y registro de nuevas compañías en la plataforma',
    categoria: CategoriaPermiso.COMPANIES,
  },
  {
    name: 'UPDATE_COMPANY',
    displayName: 'Editar Compañías',
    description: 'Permite modificar datos corporativos, configuración y estado de compañías',
    categoria: CategoriaPermiso.COMPANIES,
  },
  {
    name: 'DELETE_COMPANY',
    displayName: 'Eliminar Compañías',
    description: 'Permite dar de baja o eliminar compañías de la plataforma',
    categoria: CategoriaPermiso.COMPANIES,
  },

  // ==========================================
  // USUARIOS
  // ==========================================
  {
    name: 'VIEW_USERS',
    displayName: 'Ver Usuarios',
    description: 'Permite visualizar el listado de usuarios de la compañía',
    categoria: CategoriaPermiso.USERS,
  },
  {
    name: 'CREATE_USER',
    displayName: 'Crear Usuarios',
    description: 'Otorga la capacidad de registrar nuevos usuarios en la plataforma',
    categoria: CategoriaPermiso.USERS,
  },
  {
    name: 'UPDATE_USER',
    displayName: 'Editar Usuarios',
    description: 'Permite modificar datos, perfil y estado de usuarios',
    categoria: CategoriaPermiso.USERS,
  },
  {
    name: 'DELETE_USER',
    displayName: 'Eliminar Usuarios',
    description: 'Permite desactivar o eliminar usuarios del sistema',
    categoria: CategoriaPermiso.USERS,
  },

  // ==========================================
  // ROLES
  // ==========================================
  {
    name: 'VIEW_ROLES',
    displayName: 'Ver Roles',
    description: 'Permite visualizar los roles configurados',
    categoria: CategoriaPermiso.ROLES,
  },
  {
    name: 'CREATE_ROLE',
    displayName: 'Crear Roles',
    description: 'Habilita la creación de nuevos roles para la compañía',
    categoria: CategoriaPermiso.ROLES,
  },
  {
    name: 'UPDATE_ROLE',
    displayName: 'Editar Roles',
    description: 'Permite modificar nombres, colores y características de roles',
    categoria: CategoriaPermiso.ROLES,
  },
  {
    name: 'DELETE_ROLE',
    displayName: 'Eliminar Roles',
    description: 'Habilita la eliminación de roles del sistema',
    categoria: CategoriaPermiso.ROLES,
  },

  // ==========================================
  // PERMISOS
  // ==========================================
  {
    name: 'VIEW_PERMISSIONS',
    displayName: 'Ver Permisos',
    description: 'Visualizar el catálogo completo de permisos del sistema',
    categoria: CategoriaPermiso.PERMISSIONS,
  },
  {
    name: 'ASSIGN_PERMISSIONS',
    displayName: 'Asignar Permisos',
    description: 'Permite asignar o revocar permisos directos y a roles',
    categoria: CategoriaPermiso.PERMISSIONS,
  },

  // ==========================================
  // DOCUMENTOS & PROCESAMIENTO IA (HC-SCAN)
  // ==========================================
  {
    name: 'VIEW_DOCUMENTS',
    displayName: 'Ver Documentos',
    description: 'Permite visualizar y listar los archivos PDF almacenados',
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
    description: 'Permite eliminar archivos PDF y su información indexada',
    categoria: CategoriaPermiso.DOCUMENTS,
  },
  {
    name: 'QUERY_AI_DOCUMENTS',
    displayName: 'Consultar Documentos con IA',
    description: 'Habilita el motor de consultas inteligentes y chat sobre documentos indexados',
    categoria: CategoriaPermiso.DOCUMENTS,
  },

  // ==========================================
  // AUDITORÍA
  // ==========================================
  {
    name: 'VIEW_AUDITS',
    displayName: 'Ver Auditoría',
    description: 'Permite auditar el historial de operaciones y cambios del sistema',
    categoria: CategoriaPermiso.AUDIT,
  },

  // ==========================================
  // NOTIFICACIONES
  // ==========================================
  {
    name: 'VIEW_NOTIFICATIONS',
    displayName: 'Ver Notificaciones',
    description: 'Permite ver la bandeja de notificaciones y alertas',
    categoria: CategoriaPermiso.NOTIFICATIONS,
  },
  {
    name: 'MANAGE_NOTIFICATIONS',
    displayName: 'Administrar Notificaciones',
    description: 'Permite configurar preferencias de alertas y despachar avisos masivos',
    categoria: CategoriaPermiso.NOTIFICATIONS,
  },
];
