import { Request, Response, NextFunction } from 'express';

// Recursively remove keys that could inject MongoDB query operators
// (keys starting with "$") or reach into nested document paths (keys with ".").
// This neutralises NoSQL operator-injection payloads such as
// `?fileType[$ne]=x` or `{ "email": { "$gt": "" } }` before they reach a query.
const scrub = (value: unknown): void => {
  if (!value || typeof value !== 'object') return;
  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (key.startsWith('$') || key.includes('.')) {
      delete (value as Record<string, unknown>)[key];
      continue;
    }
    scrub((value as Record<string, unknown>)[key]);
  }
};

export const sanitizeMongo = (req: Request, _res: Response, next: NextFunction): void => {
  // req.body is a plain writable property — mutating it in place persists.
  scrub(req.body);

  // req.query in Express 4 is a getter that re-parses the querystring on each
  // access, so in-place mutation wouldn't stick. Snapshot it, scrub it, and pin
  // the sanitised object as an own property that shadows the getter.
  const query = req.query;
  scrub(query);
  Object.defineProperty(req, 'query', {
    value: query,
    writable: true,
    configurable: true,
    enumerable: true,
  });

  next();
};
