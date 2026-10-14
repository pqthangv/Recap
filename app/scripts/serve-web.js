// Tries the web version on this computer the way Cloudflare Pages serves it: run
// `npm run web:preview` (it builds dist/ first), then open http://localhost:8090.
// - Every response gets the two headers from public/_headers. Without them the browser won't let
//   the database run (`npx expo start --web` doesn't add them to the page, so use this instead).
// - "/privacy" serves privacy.html, and any other unknown path serves the app (index.html).
// Create with AI talks to the real server, which only accepts recapflashcards.com: to try it here,
// run the local server with WEB_ORIGINS=http://localhost:8090 and build with EXPO_PUBLIC_API_URL.
const fs = require('fs');
const http = require('http');
const path = require('path');

const root = path.join(__dirname, '..', 'dist');
const port = Number(process.env.PORT || 8090);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
};

http
  .createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file =
      [url, `${url}.html`, path.join(url, 'index.html')]
        .map((p) => path.join(root, p))
        .find((p) => p.startsWith(root) && fs.existsSync(p) && fs.statSync(p).isFile()) ??
      path.join(root, 'index.html');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    res.setHeader('Content-Type', types[path.extname(file)] ?? 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  })
  .listen(port, 'localhost', () => console.log(`Recap web: http://localhost:${port}`));
