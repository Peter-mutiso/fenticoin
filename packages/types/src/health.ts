/**
 * Shared contract for the API's liveness/readiness endpoints, consumed by
 * both the backend (response shape) and the frontend (client typing).
 */
export type HealthStatus = 'ok' | 'degraded' | 'error';

export interface LivenessResponse {
  status: Extract<HealthStatus, 'ok'>;
  uptimeSeconds: number;
  timestamp: string;
}

export interface ReadinessCheck {
  name: string;
  status: HealthStatus;
  message?: string;
}

export interface ReadinessResponse {
  status: HealthStatus;
  checks: ReadinessCheck[];
  timestamp: string;
}
