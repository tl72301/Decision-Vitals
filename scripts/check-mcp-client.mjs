// scripts/check-mcp-client.mjs
//
// Connects a REAL MCP client to the server over real HTTP and asserts the
// handshake, tool list, resource list and a tool call all succeed.
//
// This exists because unit tests against the handler passed while an actual
// client could not connect at all: the server advertised
// capabilities.tasks.requests.tools.call as `true` where the schema requires an
// object, so every client rejected the initialize result. The only symptom a
// user saw was "couldn't connect to the server".
//
// Run: node scripts/check-mcp-client.mjs
// Exits non-zero on failure, so it is safe to wire into CI.

// A throwaway value, invented here and used only by this script. The server
// compares the query key against whatever LIVE_MODE_PASSPHRASE holds, so the
// test proves the gate works without the real one ever appearing in the repo.
const PASSPHRASE = "local-test-passphrase";
process.env.LIVE_MODE_PASSPHRASE = PASSPHRASE;
process.env.KV_REST_API_URL = "https://fake-kv.example.com";
process.env.KV_REST_API_TOKEN = "tok";
const kv = new Map();
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const u = url.toString();
  if (u === "https://fake-kv.example.com") {
    const J=(o)=>({ok:true,status:200,json:async()=>o,text:async()=>JSON.stringify(o)});
    const [cmd,key,value]=JSON.parse(init.body);
    if(cmd==="GET") return J({result:kv.get(key)??null});
    if(cmd==="SET"){kv.set(key,value);return J({result:"OK"});}
    return J({result:null});
  }
  return realFetch(url, init);
};

const { createServer } = await import("node:http");
const handler = (await import("/home/user/Decision-Vitals/api/mcp.js")).default;

// Wrap the Vercel-style handler in a real HTTP server, parsing the body the
// way Vercel does, so a genuine MCP client talks to it over the wire.
const server = createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (raw) { try { req.body = JSON.parse(raw); } catch { req.body = undefined; } }
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (o) => { res.setHeader("content-type","application/json"); res.end(JSON.stringify(o)); return res; };
  try { await handler(req, res); } catch (e) { if(!res.headersSent){res.statusCode=500;res.end(String(e));} }
});
await new Promise(r => server.listen(0, r));
const port = server.address().port;
const url = `http://127.0.0.1:${port}/api/mcp?key=${encodeURIComponent(PASSPHRASE)}`;

const { Client } = await import("/home/user/Decision-Vitals/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js");
const { StreamableHTTPClientTransport } = await import("/home/user/Decision-Vitals/node_modules/@modelcontextprotocol/sdk/dist/esm/client/streamableHttp.js");

const client = new Client({ name: "probe", version: "1.0.0" }, { capabilities: {} });
try {
  await client.connect(new StreamableHTTPClientTransport(new URL(url)));
  console.log("CONNECT: ok");
  const tools = await client.listTools();
  console.log("TOOLS:", tools.tools.map(t=>t.name).join(", "));
  const resources = await client.listResources();
  console.log("RESOURCES:", resources.resources.map(r=>r.uri).join(", "));
  const call = await client.callTool({ name: "open_assumptions", arguments: { decisionId: "sample-cafe" } });
  console.log("CALL open_assumptions:", call.structuredContent ? "structuredContent ok" : JSON.stringify(call).slice(0,120));
} catch (e) {
  console.error("FAILED:", e?.message ?? String(e));
  if (e?.cause) console.error("CAUSE:", String(e.cause).slice(0, 300));
  server.close();
  process.exit(1);
}
server.close();
process.exit(0);
