// Минимальный статический сервер без зависимостей.
// Понимает --port/--host из аргументов и PORT/HOST из окружения.
const http = require("http");
const fs = require("fs");
const path = require("path");

function arg(name, fallback) {
  const i = process.argv.indexOf("--" + name);
  if (i !== -1 && process.argv[i + 1]) return process.argv[i + 1];
  const eq = process.argv.find(a => a.startsWith("--" + name + "="));
  if (eq) return eq.split("=")[1];
  return fallback;
}

const port = Number(arg("port", process.env.PORT || 7100));
const host = arg("host", process.env.HOST || "127.0.0.1");
const root = __dirname;

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json; charset=utf-8"
};

http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split("?")[0]);
  if (urlPath === "/") urlPath = "/index.html";
  const file = path.normalize(path.join(root, urlPath));
  if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end("Not found"); return; }
    res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
}).listen(port, host, () => {
  console.log(`FreeNet UI prototype: http://${host}:${port}/`);
});
