import { FastifyRequest, FastifyReply } from 'fastify';
import { UserRole } from '@cph/shared';

type Resource =
  | 'suppliers'
  | 'products'
  | 'orders'
  | 'receivings'
  | 'invoices'
  | 'analytics'
  | 'notifications'
  | 'users'
  | 'settings';

type Action = 'read' | 'create' | 'update' | 'delete';

const permissionMatrix: Record<string, Record<Resource, Action[]>> = {
  [UserRole.Owner]: {
    suppliers: ['read', 'create', 'update', 'delete'],
    products: ['read', 'create', 'update', 'delete'],
    orders: ['read', 'create', 'update', 'delete'],
    receivings: ['read', 'create', 'update', 'delete'],
    invoices: ['read', 'create', 'update', 'delete'],
    analytics: ['read'],
    notifications: ['read', 'update'],
    users: ['read', 'create', 'update', 'delete'],
    settings: ['read', 'update'],
  },
  [UserRole.PurchaseManager]: {
    suppliers: ['read', 'create', 'update', 'delete'],
    products: ['read', 'create', 'update', 'delete'],
    orders: ['read', 'create', 'update', 'delete'],
    receivings: ['read', 'create', 'update'],
    invoices: ['read', 'create', 'update'],
    analytics: ['read'],
    notifications: ['read', 'update'],
    users: ['read'],
    settings: ['read'],
  },
  [UserRole.Chef]: {
    suppliers: ['read'],
    products: ['read'],
    orders: ['read', 'create'],
    receivings: ['read', 'create', 'update'],
    invoices: [],
    analytics: ['read'],
    notifications: ['read', 'update'],
    users: [],
    settings: [],
  },
  [UserRole.Receiver]: {
    suppliers: ['read'],
    products: ['read'],
    orders: ['read'],
    receivings: ['read', 'create', 'update'],
    invoices: [],
    analytics: [],
    notifications: ['read', 'update'],
    users: [],
    settings: [],
  },
  [UserRole.Accountant]: {
    suppliers: ['read'],
    products: ['read'],
    orders: ['read'],
    receivings: ['read'],
    invoices: ['read', 'create', 'update', 'delete'],
    analytics: ['read'],
    notifications: ['read', 'update'],
    users: [],
    settings: [],
  },
  [UserRole.Viewer]: {
    suppliers: ['read'],
    products: ['read'],
    orders: ['read'],
    receivings: ['read'],
    invoices: ['read'],
    analytics: ['read'],
    notifications: ['read'],
    users: [],
    settings: [],
  },
};

export function requireRole(...roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const userRole = request.user?.role;
    if (!userRole || !roles.includes(userRole)) {
      reply.status(403).send({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Non hai i permessi per questa operazione',
        },
      });
    }
  };
}

export function requirePermission(resource: Resource, action: Action) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const userRole = request.user?.role;
    if (!userRole) {
      return reply.status(403).send({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Ruolo utente non trovato',
        },
      });
    }
    const permissions = permissionMatrix[userRole];
    if (!permissions || !permissions[resource]?.includes(action)) {
      return reply.status(403).send({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Non hai i permessi per questa operazione',
        },
      });
    }
  };
}
