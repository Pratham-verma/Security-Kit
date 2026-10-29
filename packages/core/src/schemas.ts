import type { Validator } from './types.js';

export function formatErrors(errors: Validator['errors'], prefix = ''): string[] {
  return (errors ?? []).map((e) => `${prefix}${e.instancePath || '/'} ${e.message ?? 'is invalid'}`);
}
