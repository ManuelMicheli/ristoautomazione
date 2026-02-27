import { FastifyRequest, FastifyReply } from 'fastify';

export interface JwtPayload {
  id: string;
  tenantId: string;
  role: string;
  email: string;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    await request.jwtVerify();
  } catch (err) {
    reply.status(401).send({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Token non valido o scaduto',
      },
    });
  }
}
