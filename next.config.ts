import path from 'path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      // NestJS decorators (@ApiProperty, etc.) are no-ops in a browser context.
      // We stub the package so Turbopack doesn't fail when the types dist loads it.
      '@nestjs/swagger': path.resolve(process.cwd(), './lib/nestjs-swagger-stub.js'),
    },
  },
};

export default nextConfig;
