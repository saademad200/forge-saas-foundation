/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The core ships as built packages; transpilePackages lets Next also handle their
  // ESM/JSX cleanly across the workspace.
  transpilePackages: ["@forge/ui"],
};

export default nextConfig;
