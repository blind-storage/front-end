import path from 'path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  turbopack: {
    resolveAlias: {
      '@nestjs/swagger': path.resolve(process.cwd(), './lib/nestjs-swagger-stub.js'),
    },
  },
  webpack(config: any) {
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...config.resolve.alias,
      '@nestjs/swagger': path.resolve(process.cwd(), './lib/nestjs-swagger-stub.js'),
    };
    return config;
  },
};

export default nextConfig;
