// serve.ts — serve game/ on http://localhost:8080 for local playtesting.
// Node 22, standard library only; serves only files under game/, no listing.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = join(here, 'game');
const port = Number(process.env.PORT ?? 8080);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    let rel = normalize(url.pathname).replace(/^\//, '');
    if (rel === '') rel = 'index.html';
    const file = join(root, rel);
    if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
    const st = await stat(file);
    if (!st.isFile()) { res.writeHead(404); res.end('not found'); return; }
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});

server.listen(port, () => {
  console.log(`RIPTIDE on http://localhost:${port} — open it in desktop Chrome, click DEPLOY, and play.`);
});
