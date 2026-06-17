const http = require("http");
const PORT = process.env.PORT || 8081;
setInterval(() => console.log("[crm-worker] tick " + new Date().toISOString()), 5000);
http.createServer((req, res) => {
  if (req.url === "/health") { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ status: "ok" })); }
  else { res.writeHead(404); res.end(); }
}).listen(PORT, () => console.log("[crm-worker] health na porta " + PORT));
