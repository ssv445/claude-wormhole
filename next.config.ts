import type { NextConfig } from 'next';
import { execSync } from 'child_process';

// Safe: hardcoded command, no user input — runs at build time only
const gitHash = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();

const nextConfig: NextConfig = {
  // node-pty is native and must not be bundled by webpack
  serverExternalPackages: ['node-pty'],
  env: {
    NEXT_PUBLIC_GIT_HASH: gitHash,
  },
};

export default nextConfig;
