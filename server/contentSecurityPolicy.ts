import type { RequestHandler } from "express";
import helmet from "helmet";

// The Phase 2 srcDoc fixtures use three deliberate inline event handlers. CSP
// Level 3 unsafe-hashes permits only these exact handler bodies, without
// enabling arbitrary inline script in the parent application.
const frameHandlerHashes = [
  "'sha256-rnZaWME2N6DqL0DBWLZXJnZQ82c8ex/tTQarEdTbXg8='",
  "'sha256-B9krPt1ToYWA9CYLuhR67Wk02+onUeMvi6vWkZ1rcGs='",
  "'sha256-XFvzm5EFrq6A/t4c4h0wVRF4100DNAvKTiTfbVNPFQE='",
] as const;

function configuredFrameOrigins(environment: NodeJS.ProcessEnv) {
  const configured = [
    environment.SECOND_ORIGIN_URL,
    ...(environment.FRAME_ORIGINS || "").split(","),
  ];
  if (environment.NODE_ENV !== "production" && !environment.SECOND_ORIGIN_URL)
    configured.push("http://localhost:3200", "http://127.0.0.1:3200");
  return configured.flatMap((value) => {
    if (!value?.trim()) return [];
    try {
      const url = new URL(value.trim());
      return ["http:", "https:"].includes(url.protocol) ? [url.origin] : [];
    } catch {
      return [];
    }
  });
}

export function createContentSecurityPolicy(
  environment: NodeJS.ProcessEnv = process.env,
): RequestHandler {
  const applicationPolicy = helmet.contentSecurityPolicy({
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", "data:"],
        formAction: ["'self'"],
        frameAncestors: ["'self'"],
        frameSrc: ["'self'", ...configuredFrameOrigins(environment)],
        imgSrc: ["'self'", "data:", "blob:"],
        manifestSrc: ["'self'"],
        mediaSrc: ["'self'", "blob:"],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        scriptSrcAttr: ["'unsafe-hashes'", ...frameHandlerHashes],
        styleSrc: ["'self'"],
        // React uses element.style for several deterministic graphics and
        // responsive labs; this does not permit inline <style> elements.
        styleSrcAttr: ["'unsafe-inline'"],
        workerSrc: ["'self'", "blob:"],
        upgradeInsecureRequests:
          environment.NODE_ENV === "production" ? [] : null,
      },
    }),
    documentationPolicy = helmet.contentSecurityPolicy({
      directives: {
        defaultSrc: ["'none'"],
        baseUri: ["'self'"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", "data:"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        imgSrc: ["'self'", "data:"],
        objectSrc: ["'none'"],
        // swagger-ui-express generates one inline bootstrap script and inline
        // styles. The exception is restricted to /api/docs responses.
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        upgradeInsecureRequests:
          environment.NODE_ENV === "production" ? [] : null,
      },
    });

  return (req, res, next) =>
    (req.path === "/api/docs" || req.path.startsWith("/api/docs/")
      ? documentationPolicy
      : applicationPolicy)(req, res, next);
}
