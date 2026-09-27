import { loadWebEnv } from "@holypearls/config";

loadWebEnv();

export default {
  reactStrictMode: true,
  // packages/ui ships TypeScript and CSS Modules source.
  transpilePackages: ["@holypearls/ui"],
};
