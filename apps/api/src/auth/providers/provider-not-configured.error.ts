/**
 * Thrown by a provider adapter when it's called but its credentials were
 * never configured. Controllers translate this into a 501 response — the
 * endpoint exists and the code path is real, it just has nothing to talk
 * to yet. Never caught and turned into a fake success.
 */
export class ProviderNotConfiguredError extends Error {
  constructor(providerName: string) {
    super(`${providerName} is not configured on this deployment`);
    this.name = 'ProviderNotConfiguredError';
  }
}
