import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // @tracegraph/shared currently ships types only, but transpiling the
  // workspace package keeps the door open for shared runtime helpers.
  transpilePackages: ['@tracegraph/shared'],
};

export default nextConfig;
