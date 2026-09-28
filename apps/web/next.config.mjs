import { loadWebEnv } from "@holypearls/config";

const env = loadWebEnv();

export default {
  reactStrictMode: true,
  // packages/ui ships TypeScript and CSS Modules source.
  transpilePackages: ["@holypearls/ui"],
  // TECH-02 §12: the browser calls /api/* on the web domain; Next forwards it to the API.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${env.API_URL}/:path*` }];
  },
};
