import { Request, Response, NextFunction } from 'express';
import { nanoid } from 'nanoid';
import { logger } from '../logger';

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const requestId = (req.headers['x-request-id'] as string) || nanoid(12);
  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);

  const start = Date.now();
  res.on('finish', () => {
    logger.info({
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      ms: Date.now() - start,
      requestId,
    });
  });
  next();
}
