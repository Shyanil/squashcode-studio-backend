import type { CorsOptions } from 'cors';

const configuredOrigins = (process.env.CORS_ORIGIN ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const defaultAllowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
];

const allowedOrigins = new Set([...defaultAllowedOrigins, ...configuredOrigins]);

function isAllowedDevOrigin(origin: string) {
  try {
    const url = new URL(origin);
    const isLocalHost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    return url.protocol === 'http:' && isLocalHost && Number(url.port) >= 5173 && Number(url.port) <= 5199;
  } catch {
    return false;
  }
}

export const corsOptions: CorsOptions = {
  credentials: true,
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin) || isAllowedDevOrigin(origin)) {
      callback(null, true);
      return;
    }

    callback(null, false);
  },
};
