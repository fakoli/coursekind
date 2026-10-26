#!/usr/bin/env node
/**
 * Study Buddy tailnet host.
 *
 * Serves frontend/dist and proxies /api/* to the loopback-only FastAPI
 * backend. Tailscale Serve terminates HTTPS and forwards here.
 */
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '../frontend/dist');
const PORT = parseInt(process.argv[2] || process.env.PORT || '4173', 10);
const BACKEND = process.env.BACKEND_URL || 'http://127.0.0.1:8010';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

async function serveStatic(req, res) {
  let urlPath = decodeURIComponent(new URL(req.url, 'http://local').pathname);
  if (urlPath === '/') urlPath = '/index.html';
  let filePath = path.join(DIST, urlPath);

  if (!filePath.startsWith(DIST)) return send(res, 403, 'Forbidden');

  try {
    const fileStat = await stat(filePath);
    if (fileStat.isDirectory()) filePath = path.join(filePath, 'index.html');
  } catch {
    if (!path.extname(urlPath)) {
      filePath = path.join(DIST, 'index.html');
    } else {
      return send(res, 404, 'Not found');
    }
  }

  try {
    const data = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': data.length,
    });
    res.end(data);
  } catch (error) {
    send(res, 500, `Server error: ${error.message}`);
  }
}

function proxyToBackend(req, res) {
  const target = new URL(BACKEND);
  const proxyReq = http.request(
    {
      hostname: target.hostname,
      port: target.port || 80,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: target.host },
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );

  proxyReq.on('error', (error) => {
    send(res, 502, `Backend unavailable: ${error.message}`, {
      'Content-Type': 'text/plain',
    });
  });
  req.pipe(proxyReq);
}

const server = http.createServer((req, res) => {
  const urlPath = new URL(req.url, 'http://local').pathname;
  if (urlPath.startsWith('/api/')) {
    proxyToBackend(req, res);
  } else if (urlPath === '/health') {
    send(res, 200, JSON.stringify({ status: 'healthy', host: 'coursekind' }), {
      'Content-Type': 'application/json',
    });
  } else {
    serveStatic(req, res);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Study Buddy host: http://127.0.0.1:${PORT}`);
  console.log(`API proxy: ${BACKEND}`);
});
