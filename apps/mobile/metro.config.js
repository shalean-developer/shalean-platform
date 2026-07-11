const http = require("http");
const https = require("https");
const path = require("path");
const { URL } = require("url");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

/**
 * Mobile sits under apps/mobile with file: links to packages/*.
 * Root package.json has no workspaces field, so Expo cannot auto-detect the
 * monorepo — we must watch packages/ and prefer the app's node_modules.
 *
 * @see https://docs.expo.dev/guides/monorepos/
 */
const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");
const packagesRoot = path.resolve(monorepoRoot, "packages");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [packagesRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];
// Resolve package.json "exports" that point at TypeScript source (e.g. @shalean/utils).
config.resolver.unstable_enablePackageExports = true;

/**
 * Expo web has no CORS on production APIs. In web __DEV__ the app uses a
 * same-origin base URL; Metro proxies `/api/*` to EXPO_PUBLIC_API_BASE_URL.
 */
function apiProxyTarget() {
  return (
    process.env.EXPO_PUBLIC_API_BASE_URL?.trim() || "https://shalean.co.za"
  ).replace(/\/+$/, "");
}

const prevEnhance = config.server?.enhanceMiddleware;
config.server = {
  ...config.server,
  enhanceMiddleware: (middleware, server) => {
    const base = typeof prevEnhance === "function" ? prevEnhance(middleware, server) : middleware;
    return (req, res, next) => {
      const reqUrl = req.url || "";
      if (!reqUrl.startsWith("/api/") && reqUrl !== "/api") {
        return base(req, res, next);
      }

      let target;
      try {
        target = new URL(reqUrl, `${apiProxyTarget()}/`);
      } catch (err) {
        console.error("[metro api-proxy] bad target", err);
        res.statusCode = 502;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Bad API proxy target." }));
        return;
      }

      const transport = target.protocol === "https:" ? https : http;
      const headers = { ...req.headers, host: target.host };
      delete headers["accept-encoding"];

      const proxyReq = transport.request(
        {
          protocol: target.protocol,
          hostname: target.hostname,
          port: target.port || (target.protocol === "https:" ? 443 : 80),
          path: `${target.pathname}${target.search}`,
          method: req.method,
          headers,
        },
        (proxyRes) => {
          res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
          proxyRes.pipe(res);
        },
      );

      proxyReq.on("error", (err) => {
        console.error("[metro api-proxy]", err.message);
        if (!res.headersSent) {
          res.statusCode = 502;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Could not reach the API proxy target." }));
        }
      });

      req.pipe(proxyReq);
    };
  },
};

module.exports = withNativeWind(config, { input: "./global.css" });
