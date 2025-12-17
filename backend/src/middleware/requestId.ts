import { NextFunction, Response } from 'express';
import { randomUUID } from 'crypto';
import { AuthRequest } from './auth';

const REQUEST_HEADER = 'x-request-id';

export function requestIdMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const incomingId = req.headers[REQUEST_HEADER] as string | undefined;
  const requestId = incomingId || randomUUID();

  req.requestId = requestId;
  res.setHeader(REQUEST_HEADER, requestId);

  next();
}

declare module './auth' {
  interface AuthRequest {
    requestId?: string;
  }
}
