import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_PARENT_ORIGIN = "http://localhost:5173";

export function createSecondOriginApp(
  parentOrigin = process.env.APP_ORIGIN?.trim() || DEFAULT_PARENT_ORIGIN,
) {
  const parsedParent = new URL(parentOrigin);
  if (
    !/^https?:$/.test(parsedParent.protocol) ||
    parsedParent.username ||
    parsedParent.password
  )
    throw new Error("APP_ORIGIN must use HTTP or HTTPS for the secondary lab");
  parentOrigin = parsedParent.origin;
  const app = express();
  app.disable("x-powered-by");
  app.get("/health", (_req, res) =>
    res.set("cache-control", "no-store").json({
      status: "ok",
      origin: "secondary",
      parentOrigin,
    }),
  );
  app.get("/lab-frame", (_req, res) => {
    res
      .set({
        "cache-control": "no-store",
        "content-security-policy": `default-src 'none'; base-uri 'none'; form-action 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-ancestors ${parentOrigin}`,
        "permissions-policy": "camera=(), geolocation=(), microphone=()",
        "referrer-policy": "no-referrer",
        "x-content-type-options": "nosniff",
      })
      .type("html").send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Separate-origin lab frame</title><style>
body{font:16px system-ui;margin:0;padding:1rem;color:#172033;background:#eef4ff}
button{min-width:44px;min-height:32px;border:1px solid #3159a7;border-radius:6px;background:#fff;color:#16366f}
#status{margin-top:.75rem;padding:.5rem;background:#fff;border-radius:6px}
</style></head><body>
<h1>Secondary origin</h1><p>This document is served by the optional origin service.</p>
<button id="send" type="button">Send verified message</button>
<div id="status" role="status" aria-live="polite">Waiting for parent</div>
<script>
const allowedParent=${JSON.stringify(parentOrigin)};
const status=document.querySelector('#status');
window.addEventListener('message',(event)=>{
  if(event.origin!==allowedParent||event.source!==parent)return;
  if(event.data?.type==='test-lab:ping'){
    status.textContent='Parent origin verified';
    parent.postMessage({type:'test-lab:pong',nonce:event.data.nonce},allowedParent);
  }
});
document.querySelector('#send').addEventListener('click',()=>{
  parent.postMessage({type:'test-lab:manual',message:'Hello from the secondary origin'},allowedParent);
});
</script></body></html>`);
  });
  return app;
}

const modulePath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === modulePath) {
  const port = Number(process.env.SECOND_ORIGIN_PORT || 3200);
  const host = process.env.SECOND_ORIGIN_HOST?.trim() || "127.0.0.1";
  createSecondOriginApp().listen(port, host, () =>
    console.info(
      JSON.stringify({ event: "secondary_origin_ready", host, port }),
    ),
  );
}
