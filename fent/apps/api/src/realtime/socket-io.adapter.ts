import { IoAdapter } from '@nestjs/platform-socket.io';
import type { INestApplicationContext } from '@nestjs/common';
import type { ServerOptions } from 'socket.io';

import { AppConfigService } from '../config/app-config.service';

/**
 * Applies the same CORS origin allowlist HTTP routes already use
 * (`AppConfigService.corsAllowedOrigins`) to every Socket.IO namespace —
 * Socket.IO's CORS is independent of `app.enableCors(...)` (that only
 * covers Express routes), so without this a WS gateway would fall back to
 * Socket.IO's own defaults instead of matching the platform's actual
 * allowed-origins policy.
 */
export class AppIoAdapter extends IoAdapter {
  constructor(private readonly appContext: INestApplicationContext) {
    super(appContext);
  }

  override createIOServer(port: number, options?: Partial<ServerOptions>): unknown {
    const config = this.appContext.get(AppConfigService);
    const mergedOptions: Partial<ServerOptions> = {
      ...options,
      cors: { origin: config.corsAllowedOrigins, credentials: true },
    };
    return super.createIOServer(port, mergedOptions);
  }
}
