import { AsyncLocalStorage } from 'node:async_hooks';

interface SupabaseRequestContext {
  accessToken?: string;
}

const requestContext = new AsyncLocalStorage<SupabaseRequestContext>();

function bearerTokenFromHeader(authorizationHeader?: string) {
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader?.trim() ?? '');
  return match?.[1];
}

export function runWithSupabaseRequestContext<T>(
  authorizationHeader: string | undefined,
  callback: () => T,
) {
  return runWithSupabaseAccessToken(bearerTokenFromHeader(authorizationHeader), callback);
}

export function runWithSupabaseAccessToken<T>(accessToken: string | undefined, callback: () => T) {
  return requestContext.run({ accessToken }, callback);
}

export function getSupabaseRequestAccessToken() {
  return requestContext.getStore()?.accessToken;
}
