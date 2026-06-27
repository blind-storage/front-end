import path from 'path';
import type { NextConfig } from 'next';
import type { Configuration } from 'webpack';

const nextConfig: NextConfig = {
  output: 'standalone',
  turbopack: {
    resolveAlias: {
      '@nestjs/swagger': path.resolve(process.cwd(), './lib/nestjs-swagger-stub.js'),
    },
  },
  webpack(config: Configuration) {
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...(config.resolve.alias as Record<string, string>),
      '@nestjs/swagger': path.resolve(process.cwd(), './lib/nestjs-swagger-stub.js'),
    };
    return config;
  },
};

export default nextConfig;
