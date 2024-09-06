import { createRequestListener } from "@mjackson/node-fetch-server";
import { createRequestHandler } from "@remix-run/server-runtime";
import { lookup } from "mrmime";
import fs from "node:fs";
import * as http from "node:http";
import path from "node:path";
import { styleText } from "node:util";

/** @type {import('vite').ViteDevServer} */
let viteDevServer;
if (process.env.NODE_ENV !== "production") {
  viteDevServer = await import("vite").then((vite) => {
    return vite.createServer({ server: { middlewareMode: true } });
  });
}

let clientDirectory = path.join(process.cwd(), "build", "client");
let publicDirectory = path.join(process.cwd(), "public");

const remixHandler = createRequestHandler(
  viteDevServer
    ? () => viteDevServer.ssrLoadModule("virtual:remix/server-build")
    : await import("./build/server/index.js"),
  process.env.NODE_ENV ?? "production",
);

/**
 * @param {string} filepath
 * @param {Headers} headers
 * @returns {Promise<Response>
 */
function serveFile(filepath, headers) {
  let extension = path.extname(filepath);
  let contentType = lookup(extension);

  let stream = fs.createReadStream(filepath);

  let mergedHeaders = new Headers({
    "content-type": contentType,
    ...headers,
  });

  return new Response(stream, { headers });
}

let handler = async (request, client) => {
  let url = new URL(request.url);
  if (!viteDevServer) {
    if (fs.existsSync(path.join(publicDirectory, url.pathname))) {
      let filepath = path.join(publicDirectory, url.pathname);
      return serveFile(filepath, {
        "cache-control": "public, max-age=3600",
      });
    }

    if (url.pathname.startsWith("/assets/")) {
      let filepath = path.join(clientDirectory, url.pathname);
      return serveFile(filepath, {
        "cache-control": "public, max-age=31536000, immutable",
      });
    }
  }

  return remixHandler(request, { client });
};

let server = http.createServer(async (req, res) => {
  if (viteDevServer) {
    await new Promise((resolve) => {
      return viteDevServer.middlewares(req, res, resolve);
    });
  }

  let listener = createRequestListener(handler);
  return listener(req, res);
});

server.listen(3000);

console.log(styleText("green", "✅ app running at http://localhost:3000"));
