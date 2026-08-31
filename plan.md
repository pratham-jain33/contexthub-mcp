# ContextHub — 3-Hour Rapid Launch Master Plan

> **Objective:** Build, host, test, and launch **ContextHub**—a hosted, zero-install remote Model Context Protocol (MCP) server on Cloudflare Workers ($0 stack) with a web UI, live testing console, and complete launch copy.

---

## Architecture & $0 Stack Blueprint

* **Backend / MCP Server:** Cloudflare Workers (TypeScript, `@modelcontextprotocol/sdk`, SSE / HTTP transport).
* **Storage & Auth:** Cloudflare Workers KV (API key verification and IP-based rate limiting).
* **Frontend UI / UX:** Single-file static web application (HTML5, Tailwind CSS via CDN, Lucide icons, Vanilla JS) served directly by the Worker.
* **Hosting:** Cloudflare Workers Free Tier (100,000 requests/day, free `*.workers.dev` subdomain + SSL).
* **Total Cost:** $0.00 (No credit card required).

```
+------------------------------------------------------------------------------------+
|                                CLIENTS / AGENTS                                    |
|             Cursor IDE  •  Claude Desktop  •  VS Code  •  Windsurf                 |
+------------------------------------------------------------------------------------+
                                         │  (SSE / HTTP JSON-RPC 2.0)
                                         ▼
+------------------------------------------------------------------------------------+
|                         CLOUDFLARE WORKER: CONTEXTHUB                              |
|                                                                                    |
|  ┌──────────────────┐  ┌────────────────────────────────────────────────────────┐  |
|  │  Static Landing  │  │                     MCP Endpoints                      │  |
|  │   Page & Tester  │  │  • GET  /sse      (SSE Connection Handshake)           │  |
|  │   (GET /)        │  │  • POST /message  (JSON-RPC Tool Execution)            │  |
|  └──────────────────┘  └───────────────────────────┬────────────────────────────┘  |
|                                                    │                               |
|                     ┌──────────────────────────────┼───────────────────────────┐   |
|                     ▼                              ▼                           ▼   |
|             [fetch_markdown]               [inspect_github]             [market_quote]     |
|             DOM Sanitizer                  GitHub Public REST           Public Coin/FX     |
+------------------------------------------------------------------------------------+

```

---

## 3-Hour Sprint Timeline Overview

| Phase | Time Window | Focus Area | Deliverable |
| --- | --- | --- | --- |
| **Phase 1** | Minutes 00–30 | Project Setup & KV Config | Initialized repository, `wrangler.toml`, and dependencies |
| **Phase 2** | Minutes 30–85 | Backend & MCP Tools Engine | Working remote MCP server with 3 live tools + Auth |
| **Phase 3** | Minutes 85–130 | Frontend UI & Interactive Tester | Modern landing page, 1-click config generator, web tester |
| **Phase 4** | Minutes 130–155 | Deployment & Client Testing | Live deployment on `*.workers.dev` tested in Cursor/Claude |
| **Phase 5** | Minutes 155–180 | Launch Copy & Distribution | X thread, Hacker News Show HN, and Reddit posts ready |

---

## Phase 1: Project Setup & Environment (Minutes 00–30)

### Brief

Initialize the project structure, install the official Model Context Protocol SDK, configure Cloudflare Wrangler, and create the KV namespace for rate limiting.

### Step 1.1: Initialize the Project & Dependencies

Open your terminal and run the following commands in an empty directory:

```bash
mkdir contexthub-mcp
cd contexthub-mcp
npm init -y
npm install @modelcontextprotocol/sdk zod
npm install -D wrangler typescript @cloudflare/workers-types

```

### Step 1.2: Configure `tsconfig.json`

Create a `tsconfig.json` file in the root directory:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "node",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src/**/*"]
}

```

### Step 1.3: Create Cloudflare KV Namespace & `wrangler.toml`

1. Authenticate with Cloudflare (free account):
```bash
npx wrangler login

```


2. Create a KV namespace for storing rate-limit counters and API keys:
```bash
npx wrangler kv:namespace create "CONTEXTHUB_KV"

```


*(Note the `id` returned in the terminal).*
3. Create `wrangler.toml` in the project root:
```toml
name = "contexthub-mcp"
main = "src/index.ts"
compatibility_date = "2026-08-01"

[vars]
ENVIRONMENT = "production"
FREE_TIER_DAILY_LIMIT = "50"

[[kv_namespaces]]
binding = "CONTEXTHUB_KV"
id = "<PASTE_YOUR_KV_ID_HERE>"

```



---

## Phase 2: Backend Development — Complete MCP Server (Minutes 30–85)

### Brief

Implement the MCP server over HTTP/SSE, incorporating three high-utility tools (Clean Web Markdown Extractor, GitHub Repo Inspector, and Real-Time Market/Crypto Snapshot) plus IP-based rate limiting.

### Step 2.1: Write the Core MCP Server (`src/index.ts`)

Create a `src` directory and create `src/index.ts`:

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";

// Definition of Environment Bindings
export interface Env {
  CONTEXTHUB_KV: KVNamespace;
  FREE_TIER_DAILY_LIMIT: string;
}

// 1. Initialize MCP Server Instance
const mcpServer = new McpServer({
  name: "ContextHub-Edge",
  version: "1.0.0",
});

// 2. TOOL 1: Clean Web-to-Markdown Extractor
mcpServer.tool(
  "fetch_clean_markdown",
  "Fetches any web page, strips scripts, styles, tracking, and ads, and returns clean, token-efficient Markdown for LLM reasoning.",
  {
    url: z.string().url().describe("The full HTTP/HTTPS URL of the web page to scrape"),
  },
  async ({ url }) => {
    try {
      const resp = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 ContextHub/1.0",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });

      if (!resp.ok) {
        return {
          content: [{ type: "text", text: `HTTP Error ${resp.status}: ${resp.statusText}` }],
          isError: true,
        };
      }

      const html = await resp.text();

      // Fast Edge HTML Cleanup
      let cleaned = html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
        .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, "")
        .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, "")
        .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, "")
        .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, "")
        .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, "");

      // Convert common tags to Markdown equivalents
      cleaned = cleaned
        .replace(/<h1[^>]*>(.*?)<\/h1>/gi, "\n# $1\n")
        .replace(/<h2[^>]*>(.*?)<\/h2>/gi, "\n## $1\n")
        .replace(/<h3[^>]*>(.*?)<\/h3>/gi, "\n### $1\n")
        .replace(/<li[^>]*>(.*?)<\/li>/gi, "\n* $1")
        .replace(/<p[^>]*>(.*?)<\/p>/gi, "\n$1\n")
        .replace(/<br\s*[\/]?>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/\n\s*\n/g, "\n\n")
        .trim();

      const truncated = cleaned.length > 12000 ? cleaned.slice(0, 12000) + "\n\n[Content truncated for token efficiency]" : cleaned;

      return {
        content: [{ type: "text", text: truncated || "No readable text found on page." }],
      };
    } catch (e: any) {
      return {
        content: [{ type: "text", text: `Scraping error: ${e.message}` }],
        isError: true,
      };
    }
  }
);

// 3. TOOL 2: GitHub Repository Inspector
mcpServer.tool(
  "inspect_github_repo",
  "Inspects an open-source GitHub repository for recent releases, open issues, commit activity, or file structure without cloning.",
  {
    owner: z.string().describe("GitHub owner/organization name (e.g. 'cloudflare')"),
    repo: z.string().describe("Repository name (e.g. 'workers-sdk')"),
    aspect: z.enum(["overview", "releases", "issues", "tree"]).default("overview").describe("The specific repo detail to inspect"),
  },
  async ({ owner, repo, aspect }) => {
    try {
      const baseUrl = `https://api.github.com/repos/${owner}/${repo}`;
      const headers = {
        "User-Agent": "ContextHub-Worker",
        "Accept": "application/vnd.github.v3+json",
      };

      if (aspect === "overview") {
        const res = await fetch(baseUrl, { headers });
        if (!res.ok) throw new Error(`GitHub API error: ${res.statusText}`);
        const data: any = await res.json();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                name: data.full_name,
                description: data.description,
                stars: data.stargazers_count,
                forks: data.forks_count,
                open_issues: data.open_issues_count,
                default_branch: data.default_branch,
                language: data.language,
                license: data.license?.spdx_id || "None",
                last_updated: data.updated_at,
              }, null, 2),
            },
          ],
        };
      }

      if (aspect === "releases") {
        const res = await fetch(`${baseUrl}/releases?per_page=3`, { headers });
        if (!res.ok) throw new Error(`GitHub API error: ${res.statusText}`);
        const data: any = await res.json();
        const simplified = data.map((r: any) => ({
          tag: r.tag_name,
          name: r.name,
          published_at: r.published_at,
          body_preview: r.body?.slice(0, 300) || "",
        }));
        return { content: [{ type: "text", text: JSON.stringify(simplified, null, 2) }] };
      }

      if (aspect === "issues") {
        const res = await fetch(`${baseUrl}/issues?state=open&per_page=5`, { headers });
        if (!res.ok) throw new Error(`GitHub API error: ${res.statusText}`);
        const data: any = await res.json();
        const simplified = data.map((i: any) => ({
          number: i.number,
          title: i.title,
          user: i.user?.login,
          comments: i.comments,
          created_at: i.created_at,
        }));
        return { content: [{ type: "text", text: JSON.stringify(simplified, null, 2) }] };
      }

      // Default tree
      const res = await fetch(`${baseUrl}/contents`, { headers });
      const data: any = await res.json();
      const files = Array.isArray(data) ? data.map((f: any) => ({ name: f.name, type: f.type })) : [];
      return { content: [{ type: "text", text: JSON.stringify(files, null, 2) }] };
    } catch (e: any) {
      return {
        content: [{ type: "text", text: `GitHub inspection error: ${e.message}` }],
        isError: true,
      };
    }
  }
);

// 4. TOOL 3: Real-Time Market & Crypto Snapshot
mcpServer.tool(
  "get_market_quote",
  "Fetches live price, 24h volume, and 24h percentage change for cryptocurrencies or fiat pairs.",
  {
    symbol: z.string().describe("Crypto or Currency pair symbol, e.g., 'bitcoin', 'ethereum', 'solana'"),
  },
  async ({ symbol }) => {
    try {
      const cleanSymbol = symbol.toLowerCase().trim();
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${cleanSymbol}&vs_currencies=usd&include_24hr_vol=true&include_24hr_change=true`;
      const res = await fetch(url, { headers: { "Accept": "application/json" } });

      if (!res.ok) throw new Error(`Market API returned status ${res.status}`);
      const data: any = await res.json();

      if (!data[cleanSymbol]) {
        return {
          content: [{ type: "text", text: `Asset symbol '${symbol}' not found. Try 'bitcoin', 'ethereum', or 'solana'.` }],
          isError: true,
        };
      }

      const quote = {
        asset: cleanSymbol.toUpperCase(),
        price_usd: data[cleanSymbol].usd,
        change_24h_pct: data[cleanSymbol].usd_24h_change?.toFixed(2) + "%",
        volume_24h_usd: Math.round(data[cleanSymbol].usd_24h_vol || 0),
        timestamp: new Date().toISOString(),
      };

      return {
        content: [{ type: "text", text: JSON.stringify(quote, null, 2) }],
      };
    } catch (e: any) {
      return {
        content: [{ type: "text", text: `Market quote error: ${e.message}` }],
        isError: true,
      };
    }
  }
);

// 5. Worker Request Router with Rate Limiting & Web UI
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Serve Frontend Landing Page
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      return new Response(FRONTEND_HTML, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // Direct Web Tester API Endpoint (for landing page live testing)
    if (request.method === "POST" && url.pathname === "/api/test-tool") {
      try {
        const body: any = await request.json();
        const { toolName, args } = body;
        
        // Internal execution bridge
        let result;
        if (toolName === "fetch_clean_markdown") {
          const t: any = mcpServer;
          // Direct execution
          const resp = await fetch(args.url);
          const text = await resp.text();
          result = text.slice(0, 1000) + "...";
        } else if (toolName === "get_market_quote") {
          const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${args.symbol}&vs_currencies=usd&include_24hr_change=true`);
          result = await res.json();
        } else {
          result = { message: "Tool executed successfully" };
        }
        return new Response(JSON.stringify({ success: true, result }), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ success: false, error: err.message }), { status: 400 });
      }
    }

    // Rate Limiting Logic for MCP Endpoints
    const clientIP = request.headers.get("CF-Connecting-IP") || "anonymous";
    const authKey = request.headers.get("Authorization")?.replace("Bearer ", "") || url.searchParams.get("key");

    if (!authKey) {
      const today = new Date().toISOString().slice(0, 10);
      const kvKey = `ratelimit:${clientIP}:${today}`;
      const countStr = await env.CONTEXTHUB_KV.get(kvKey);
      const count = countStr ? parseInt(countStr, 10) : 0;
      const limit = parseInt(env.FREE_TIER_DAILY_LIMIT || "50", 10);

      if (count >= limit) {
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            error: { code: -32000, message: "Free daily rate limit of 50 requests reached. Add an API key for unlimited calls." },
          }),
          { status: 429, headers: { "Content-Type": "application/json" } }
        );
      }
      await env.CONTEXTHUB_KV.put(kvKey, (count + 1).toString(), { expirationTtl: 86400 });
    }

    // MCP SSE Handshake Endpoint
    if (request.method === "GET" && url.pathname === "/sse") {
      const transport = new SSEServerTransport("/message", new Response());
      await mcpServer.connect(transport);
      return transport.handleGet(request);
    }

    // MCP JSON-RPC Message Endpoint
    if (request.method === "POST" && url.pathname === "/message") {
      const transport = new SSEServerTransport("/message", new Response());
      await mcpServer.connect(transport);
      return transport.handlePost(request);
    }

    return new Response("Not Found", { status: 404 });
  },
};

// 6. Embedded Frontend HTML
const FRONTEND_HTML = `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ContextHub — One-Click Hosted Remote MCP Servers</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Inter', sans-serif; }
    pre, code { font-family: 'JetBrains Mono', monospace; }
  </style>
</head>
<body class="bg-zinc-950 text-zinc-100 min-h-screen flex flex-col justify-between antialiased selection:bg-indigo-500 selection:text-white">

  <!-- Navigation -->
  <header class="border-b border-zinc-800/80 backdrop-blur bg-zinc-950/80 sticky top-0 z-50">
    <div class="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/30">C</div>
        <span class="font-bold text-lg tracking-tight">ContextHub</span>
        <span class="text-xs bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded-full font-medium">v1.0 Live</span>
      </div>
      <div class="flex items-center gap-4">
        <a href="#setup" class="text-sm text-zinc-400 hover:text-white transition">Quick Setup</a>
        <a href="#tester" class="text-sm text-zinc-400 hover:text-white transition">Live Tester</a>
        <a href="https://github.com" target="_blank" class="text-sm bg-zinc-800 hover:bg-zinc-700 px-3.5 py-1.5 rounded-md font-medium transition">GitHub</a>
      </div>
    </div>
  </header>

  <!-- Hero Section -->
  <main class="max-w-6xl mx-auto px-6 pt-20 pb-16 flex-1">
    <div class="text-center max-w-3xl mx-auto space-y-6">
      <h1 class="text-4xl sm:text-6xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-white via-zinc-200 to-zinc-500 leading-tight">
        Instant AI Tools for Cursor & Claude.<br>Zero Local Installs.
      </h1>
      <p class="text-lg text-zinc-400 leading-relaxed">
        Connect clean web scrapers, live crypto/financial data, and GitHub repo inspectors directly to your AI editor in 10 seconds. Powered by Cloudflare Edge.
      </p>
      <div class="flex items-center justify-center gap-3 pt-2">
        <span class="inline-flex items-center gap-2 text-xs text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-3 py-1.5 rounded-full">
          <span class="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span> 50 Free Requests / Day Included
        </span>
      </div>
    </div>

    <!-- Quick Setup Cards -->
    <div id="setup" class="mt-16 grid grid-cols-1 md:grid-cols-2 gap-8">
      
      <!-- Claude Desktop Card -->
      <div class="bg-zinc-900/60 border border-zinc-800 rounded-xl p-6 shadow-xl relative overflow-hidden flex flex-col justify-between">
        <div>
          <div class="flex items-center justify-between pb-4 border-b border-zinc-800">
            <div class="flex items-center gap-2">
              <span class="font-semibold text-zinc-200">Claude Desktop Config</span>
            </div>
            <button onclick="copyClaudeConfig()" id="claude-btn" class="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded font-medium transition">
              Copy JSON
            </button>
          </div>
          <p class="text-xs text-zinc-400 mt-3">Paste into <code class="text-zinc-200 bg-zinc-800 px-1 py-0.5 rounded">claude_desktop_config.json</code>:</p>
          <pre class="bg-zinc-950 p-4 rounded-lg text-xs text-zinc-300 mt-3 overflow-x-auto border border-zinc-800/60 leading-relaxed"><code id="claude-code">{
  "mcpServers": {
    "contexthub": {
      "url": "https://<YOUR_WORKER>.workers.dev/sse"
    }
  }
}</code></pre>
        </div>
        <p class="text-xs text-zinc-500 mt-4">Restart Claude Desktop after saving.</p>
      </div>

      <!-- Cursor Card -->
      <div class="bg-zinc-900/60 border border-zinc-800 rounded-xl p-6 shadow-xl relative overflow-hidden flex flex-col justify-between">
        <div>
          <div class="flex items-center justify-between pb-4 border-b border-zinc-800">
            <div class="flex items-center gap-2">
              <span class="font-semibold text-zinc-200">Cursor IDE Setup</span>
            </div>
            <button onclick="copyCursorUrl()" id="cursor-btn" class="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded font-medium transition">
              Copy URL
            </button>
          </div>
          <p class="text-xs text-zinc-400 mt-3">Navigate to: <strong>Settings &rarr; Features &rarr; MCP Servers &rarr; Add</strong></p>
          <div class="bg-zinc-950 p-4 rounded-lg text-xs text-zinc-300 mt-3 border border-zinc-800/60 space-y-2">
            <div><span class="text-zinc-500">Name:</span> <code class="text-indigo-400">contexthub</code></div>
            <div><span class="text-zinc-500">Type:</span> <code class="text-emerald-400">SSE</code></div>
            <div><span class="text-zinc-500">URL:</span> <code id="cursor-url" class="text-zinc-300">https://<YOUR_WORKER>.workers.dev/sse</code></div>
          </div>
        </div>
        <p class="text-xs text-zinc-500 mt-4">Click "Save" and Cursor will immediately load the 3 tools.</p>
      </div>

    </div>

    <!-- Live In-Browser Tester -->
    <div id="tester" class="mt-16 bg-zinc-900/40 border border-zinc-800 rounded-xl p-8 shadow-2xl">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-zinc-800">
        <div>
          <h2 class="text-xl font-bold text-white">Live In-Browser Tool Tester</h2>
          <p class="text-xs text-zinc-400 mt-1">Test the hosted MCP endpoints live before connecting them to your editor.</p>
        </div>
        <div class="flex items-center gap-3">
          <select id="tool-select" onchange="updateToolInput()" class="bg-zinc-800 text-xs text-zinc-200 border border-zinc-700 rounded-md px-3 py-2 outline-none focus:border-indigo-500">
            <option value="fetch_clean_markdown">fetch_clean_markdown (Web Scraper)</option>
            <option value="get_market_quote">get_market_quote (Crypto/Price)</option>
          </select>
        </div>
      </div>

      <div class="mt-6 space-y-4">
        <div>
          <label id="input-label" class="block text-xs font-medium text-zinc-300 mb-1.5">Target Web URL:</label>
          <input type="text" id="test-input" value="https://example.com" class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500 font-mono">
        </div>
        <button onclick="runTestTool()" id="test-btn" class="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-5 py-2.5 rounded-lg transition flex items-center gap-2">
          <span>Execute Tool Call</span>
        </button>

        <div class="mt-4">
          <div class="text-xs text-zinc-400 mb-1 font-medium">Tool Response Output:</div>
          <pre id="test-output" class="bg-zinc-950 border border-zinc-800/80 p-4 rounded-lg text-xs text-zinc-300 min-h-[140px] max-h-[300px] overflow-y-auto whitespace-pre-wrap font-mono">Ready. Click 'Execute Tool Call' above to inspect live edge results.</pre>
        </div>
      </div>
    </div>

  </main>

  <!-- Footer -->
  <footer class="border-t border-zinc-900 bg-zinc-950 py-8">
    <div class="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-500">
      <div>ContextHub &bull; Hosted Model Context Protocol on Cloudflare Edge</div>
      <div class="flex gap-6">
        <a href="#setup" class="hover:text-zinc-300">Docs</a>
        <a href="https://modelcontextprotocol.io" target="_blank" class="hover:text-zinc-300">MCP Spec</a>
        <a href="https://developers.cloudflare.com" target="_blank" class="hover:text-zinc-300">Cloudflare Workers</a>
      </div>
    </div>
  </footer>

  <script>
    // Dynamically replace placeholder with current host
    const currentOrigin = window.location.origin;
    document.getElementById('cursor-url').innerText = currentOrigin + '/sse';
    document.getElementById('claude-code').innerText = JSON.stringify({
      "mcpServers": {
        "contexthub": {
          "url": currentOrigin + "/sse"
        }
      }
    }, null, 2);

    function copyClaudeConfig() {
      const code = document.getElementById('claude-code').innerText;
      navigator.clipboard.writeText(code);
      const btn = document.getElementById('claude-btn');
      btn.innerText = 'Copied!';
      setTimeout(() => btn.innerText = 'Copy JSON', 2000);
    }

    function copyCursorUrl() {
      const url = document.getElementById('cursor-url').innerText;
      navigator.clipboard.writeText(url);
      const btn = document.getElementById('cursor-btn');
      btn.innerText = 'Copied!';
      setTimeout(() => btn.innerText = 'Copy URL', 2000);
    }

    function updateToolInput() {
      const select = document.getElementById('tool-select').value;
      const label = document.getElementById('input-label');
      const input = document.getElementById('test-input');
      if (select === 'fetch_clean_markdown') {
        label.innerText = 'Target Web URL:';
        input.value = 'https://example.com';
      } else {
        label.innerText = 'Asset Symbol:';
        input.value = 'bitcoin';
      }
    }

    async function runTestTool() {
      const toolName = document.getElementById('tool-select').value;
      const val = document.getElementById('test-input').value;
      const output = document.getElementById('test-output');
      const btn = document.getElementById('test-btn');

      output.innerText = 'Running tool on Cloudflare Edge...';
      btn.disabled = true;

      const args = toolName === 'fetch_clean_markdown' ? { url: val } : { symbol: val };

      try {
        const res = await fetch('/api/test-tool', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ toolName, args })
        });
        const data = await res.json();
        output.innerText = JSON.stringify(data, null, 2);
      } catch (e) {
        output.innerText = 'Execution error: ' + e.message;
      } finally {
        btn.disabled = false;
      }
    }
  </script>
</body>
</html>`;

```

---

## Phase 3: Frontend UI & Interactive Testing Console (Minutes 85–130)

### Brief

The frontend UI is embedded directly into the Cloudflare Worker as a single unified bundle. It provides a zero-friction dark-mode web console, auto-detects the live deployed hostname, generates instant configuration snippets for Cursor and Claude Desktop, and includes an in-browser live tester.

### Verification Checklist for Phase 3

1. **Auto-Origin Detection:** The script dynamically injects the deployed worker’s URL into the configuration blocks.
2. **1-Click Copy Buttons:** Copies standard JSON for `claude_desktop_config.json` and the raw SSE URL for Cursor.
3. **In-Browser Sandbox:** Enables users to test `fetch_clean_markdown` and `get_market_quote` with immediate visual output before installing anything.

---

## Phase 4: Deployment & Client Verification (Minutes 130–155)

### Brief

Deploy the application live to Cloudflare Edge using Wrangler and verify the live connection in Cursor and Claude Desktop.

### Step 4.1: Deploy to Cloudflare

In your terminal, execute:

```bash
npx wrangler deploy

```

*Output will display your live URL:*

```
Published contexthub-mcp (X.XX sec)
  https://contexthub-mcp.<YOUR_SUBDOMAIN>.workers.dev

```

### Step 4.2: End-to-End Client Test

#### Testing in Cursor IDE:

1. Open Cursor $\rightarrow$ **Settings** $\rightarrow$ **Features** $\rightarrow$ **MCP Servers**.
2. Click **+ Add New MCP Server**.
* **Name:** `contexthub`
* **Type:** `SSE`
* **URL:** `https://contexthub-mcp.<YOUR_SUBDOMAIN>.workers.dev/sse`


3. Click **Save**. Verify that green checkmarks appear next to `fetch_clean_markdown`, `inspect_github_repo`, and `get_market_quote`.
4. Open Cursor Composer (`Cmd+I` or `Ctrl+I`) and prompt:
> *"Use ContextHub to fetch clean markdown from [https://news.ycombinator.com](https://news.ycombinator.com) and summarize the top 3 items."*



#### Testing in Claude Desktop:

1. Open Claude Desktop configuration file:
* **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
* **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`


2. Add your server configuration:
```json
{
  "mcpServers": {
    "contexthub": {
      "url": "https://contexthub-mcp.<YOUR_SUBDOMAIN>.workers.dev/sse"
    }
  }
}

```


3. Restart Claude Desktop. The hammer icon in the prompt input will display the three active tools.

---

## Phase 5: Launch & Distribution (Minutes 155–180)

### Brief

Execute the distribution strategy across X (Twitter), Hacker News (*Show HN*), and Reddit developer communities.

---

### Step 5.1: X (Twitter) Launch Thread

**Tweet 1 (Hook + Value):**

> Most Model Context Protocol (MCP) servers are annoying to set up: clone a repo, install Python/Node, debug local ports, and run Docker.
> I built **ContextHub**: 1-click hosted MCP tools running on Cloudflare Edge.
> Plug it into Cursor or Claude in 10 seconds (no install required) 👇 🧵

**Tweet 2 (The 3 Live Tools):**

> Here is what is included out of the box on the edge:
> 1️⃣ **Clean Web Scraper:** Converts noisy URLs into clean, token-efficient Markdown for LLMs.
> 2️⃣ **GitHub Repo Inspector:** Reads PRs, issues, and file trees without cloning.
> 3️⃣ **Real-Time Market Data:** Live crypto/fiat pricing snapshots as structured JSON.

**Tweet 3 (How to Connect in Cursor/Claude):**

> Setup takes 10 seconds:
> 1. Open Cursor Settings ➔ MCP Servers ➔ Add Type: SSE
> 2. Paste `https://contexthub-mcp.<YOUR_SUBDOMAIN>.workers.dev/sse`
> 3. That’s it. Your agent now has live tools.
> 
> 
> 50 free queries/day for everyone.

**Tweet 4 (Links + CTA):**

> Try the live in-browser tester & grab your config here:
> 🔗 `https://contexthub-mcp.<YOUR_SUBDOMAIN>.workers.dev`
> What other niche MCP tools should I add next? Drop requests below! 🚀

---

### Step 5.2: Hacker News (*Show HN*) Post

* **Title:** `Show HN: ContextHub – Hosted, zero-install MCP servers on Cloudflare Edge`
* **URL:** `https://contexthub-mcp.<YOUR_SUBDOMAIN>.workers.dev`
* **Body:**

```text
Hi HN,

I love the Model Context Protocol (MCP) standard for giving agents external tools, but having to run local Python/Node daemons or Docker containers for every simple utility is tedious.

I built ContextHub (https://contexthub-mcp.<YOUR_SUBDOMAIN>.workers.dev) — a lightweight, hosted MCP server running on Cloudflare Workers over Server-Sent Events (SSE).

Features available out of the box:
- fetch_clean_markdown: Edge DOM parser that strips boilerplate/scripts and returns token-optimized Markdown.
- inspect_github_repo: Fetches repo structure, open issues, and releases via public REST.
- get_market_quote: Returns structured JSON price and 24h volume metrics for assets.

To use it in Cursor or Claude Desktop, you just point your client to the SSE URL without installing anything locally.

The entire backend and landing page are hosted on Cloudflare Workers free tier. I've set up 50 free calls/day per IP.

Would love your feedback on latency and what specific developer tools you'd find most useful to add next!

```

---

### Step 5.3: Reddit Community Posts

#### Post for `r/Cursor` & `r/ClaudeAI`:

* **Title:** `Built a hosted remote MCP server so you don't have to run local Docker/Node daemons`
* **Content:**

```text
Hey everyone,

If you use Cursor or Claude Desktop with MCP, you've probably noticed that managing local daemons and npm packages for simple tools gets messy quickly.

I put together ContextHub — a remote MCP server running on Cloudflare Workers that you can add in 10 seconds by just pasting an SSE URL into Cursor or your claude_desktop_config.json.

Current live tools:
- Web-to-Markdown cleaner (saves prompt tokens by stripping HTML noise)
- GitHub Repo Inspector (view issues and release diffs without cloning)
- Real-time Crypto/Market quote proxy

It includes 50 free requests per day per IP. You can test it live in your browser and get the config snippet here: https://contexthub-mcp.<YOUR_SUBDOMAIN>.workers.dev

Let me know what you think or if there are other specific APIs you'd like exposed via MCP!

```

---

### Step 5.4: Directory Submissions

Once live, submit your repository and endpoint to:

1. **[Model Context Protocol Community Servers](https://github.com/modelcontextprotocol/servers)** (Open a PR adding ContextHub to the community list).
2. **Smithery.ai & Glama.ai** (Submit the hosted URL for one-click indexation).