import path from 'path';
import type { NextConfig } from 'next';

// Projet en Turbopack (dev + build) : l'alias est géré par `turbopack.resolveAlias`.
// L'ancien bloc `webpack()` (et l'import des types webpack) était du code mort —
// webpack n'est pas installé sous Turbopack, ce qui cassait `next build`.
const nextConfig: NextConfig = {
  output: 'standalone',
  turbopack: {
    resolveAlias: {
      '@nestjs/swagger': path.resolve(process.cwd(), './lib/nestjs-swagger-stub.js'),
    },
  },
};

export default nextConfig;
