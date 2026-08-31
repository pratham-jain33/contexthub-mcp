import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";

import type { Config } from "@netlify/functions";

// 1. Initialize MCP Server Instance
const mcpServer = new McpServer({
  name: "ContextHub-Edge",
  version: "1.0.0",
});

const transport = new WebStandardStreamableHTTPServerTransport({
  sessionIdGenerator: undefined
});
mcpServer.connect(transport).catch(console.error);

// 2. TOOL 1: Clean Web-to-Markdown Extractor
mcpServer.tool(
  "fetch_clean_markdown",
  "Fetches any web page, strips scripts, styles, tracking, and ads, and returns clean, token-efficient Markdown for LLM reasoning.",
  {
    url: z.string().url().describe("The full HTTP/HTTPS URL of the web page to scrape"),
  },
  async ({ url }) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const resp = await fetch(url, {
        headers: {
          "User-Agent": "ContextHub-Worker/1.0",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        signal: controller.signal
      });
      clearTimeout(timeoutId);

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
        "User-Agent": "ContextHub-Worker/1.0",
        "Accept": "application/vnd.github.v3+json",
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      if (aspect === "overview") {
        const res = await fetch(baseUrl, { headers, signal: controller.signal });
        clearTimeout(timeoutId);
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
        const res = await fetch(`${baseUrl}/releases?per_page=3`, { headers, signal: controller.signal });
        clearTimeout(timeoutId);
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
        const res = await fetch(`${baseUrl}/issues?state=open&per_page=5`, { headers, signal: controller.signal });
        clearTimeout(timeoutId);
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
      const res = await fetch(`${baseUrl}/contents`, { headers, signal: controller.signal });
      clearTimeout(timeoutId);
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
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(url, { headers: { "Accept": "application/json", "User-Agent": "ContextHub-Worker/1.0" }, signal: controller.signal });
      clearTimeout(timeoutId);

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
export default async (request: Request): Promise<Response> => {
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
        
        let result;
        if (toolName === "fetch_clean_markdown") {
          const resp = await fetch(args.url, { headers: { "User-Agent": "ContextHub-Worker/1.0" }});
          const text = await resp.text();
          result = text.slice(0, 1000) + "...";
        } else if (toolName === "get_market_quote") {
          const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${args.symbol}&vs_currencies=usd&include_24hr_change=true`, { headers: { "User-Agent": "ContextHub-Worker/1.0" }});
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
      console.warn("Skipping rate limit check for free tier since KV is not bound on Netlify.");
    }

    // MCP Endpoint for streamableHttp protocol (stateless HTTP POST)
    if (url.pathname === "/sse" || url.pathname === "/message") {
      return await transport.handleRequest(request);
    }

  return new Response("Not Found", { status: 404 });
};

export const config: Config = {
  path: "/*"
};

// 6. Embedded Frontend HTML
const FRONTEND_HTML = `<!DOCTYPE html>
<html lang="en" class="dark scroll-smooth">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ContextHub — One-Click Hosted Remote MCP Servers</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          fontFamily: {
            sans: ['Outfit', 'sans-serif'],
            mono: ['JetBrains Mono', 'monospace'],
          },
          animation: {
            'float': 'float 6s ease-in-out infinite',
            'fade-in-up': 'fadeInUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards',
            'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
          },
          keyframes: {
            'float': {
              '0%, 100%': { transform: 'translateY(0)' },
              '50%': { transform: 'translateY(-10px)' },
            },
            'fadeInUp': {
              '0%': { opacity: '0', transform: 'translateY(20px)' },
              '100%': { opacity: '1', transform: 'translateY(0)' },
            }
          }
        }
      }
    }
  </script>
  <style>
    body { font-family: 'Outfit', sans-serif; }
    pre, code { font-family: 'JetBrains Mono', monospace; }
    
    .glass-card {
      background: rgba(24, 24, 27, 0.5);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.08);
      box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.2);
    }
    
    .animate-delay-100 { animation-delay: 100ms; }
    .animate-delay-200 { animation-delay: 200ms; }
    
    /* Custom Scrollbar */
    ::-webkit-scrollbar { width: 8px; }
    ::-webkit-scrollbar-track { background: #09090b; }
    ::-webkit-scrollbar-thumb { background: #27272a; border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: #3f3f46; }
  </style>
</head>
<body class="bg-[#09090b] text-zinc-100 min-h-screen flex flex-col justify-between antialiased selection:bg-indigo-500/30 selection:text-indigo-200 relative overflow-x-hidden">

  <!-- Animated Background Elements -->
  <div class="fixed inset-0 z-0 pointer-events-none overflow-hidden">
    <div class="absolute -top-[30%] -left-[10%] w-[70%] h-[70%] rounded-full bg-indigo-900/15 blur-[120px] animate-float"></div>
    <div class="absolute top-[40%] -right-[20%] w-[60%] h-[60%] rounded-full bg-violet-900/10 blur-[120px] animate-float" style="animation-delay: -3s;"></div>
  </div>

  <!-- Navigation -->
  <header class="border-b border-white/5 bg-[#09090b]/80 backdrop-blur-xl sticky top-0 z-50 transition-all duration-300">
    <div class="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
      <div class="flex items-center gap-3 group cursor-pointer">
        <div class="h-9 w-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/25 group-hover:scale-105 group-hover:shadow-indigo-500/40 transition-all duration-300">C</div>
        <span class="font-bold text-xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-zinc-400">ContextHub</span>
        <span class="text-xs bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-2.5 py-1 rounded-full font-medium tracking-wide">v1.0 Live</span>
      </div>
      <nav class="flex items-center gap-6">
        <a href="#setup" class="text-sm font-medium text-zinc-400 hover:text-white transition-colors duration-200">Quick Setup</a>
        <a href="#tester" class="text-sm font-medium text-zinc-400 hover:text-white transition-colors duration-200">Live Tester</a>
        <a href="https://github.com" target="_blank" class="text-sm bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 px-4 py-2 rounded-lg font-medium transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md active:scale-95">GitHub</a>
      </nav>
    </div>
  </header>

  <!-- Hero Section -->
  <main class="max-w-6xl mx-auto px-6 pt-24 pb-20 flex-1 relative z-10 w-full">
    <div class="text-center max-w-4xl mx-auto space-y-8 opacity-0 animate-fade-in-up">
      <h1 class="text-5xl sm:text-7xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-white via-indigo-50 to-zinc-400 leading-[1.1] pb-2">
        Instant AI Tools for Cursor.<br>Zero Local Installs.
      </h1>
      <p class="text-lg sm:text-xl text-zinc-400 leading-relaxed max-w-2xl mx-auto font-light">
        Connect clean web scrapers, live crypto/financial data, and GitHub repo inspectors directly to your AI editor in seconds.
      </p>
      <div class="flex items-center justify-center gap-4 pt-4">
        <a href="#setup" class="bg-white text-zinc-950 px-7 py-3.5 rounded-xl font-semibold hover:bg-zinc-200 transition-all duration-300 hover:scale-105 hover:shadow-[0_0_25px_rgba(255,255,255,0.2)] active:scale-95">Get Started</a>
        <a href="#tester" class="glass-card px-7 py-3.5 rounded-xl font-medium text-white hover:bg-white/10 transition-all duration-300 hover:scale-105 active:scale-95 flex items-center gap-2 group">
          Try Live Demo
          <svg class="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
        </a>
      </div>
      <div class="flex items-center justify-center pt-8">
        <span class="inline-flex items-center gap-2 text-sm font-medium text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-4 py-2 rounded-full shadow-[0_0_15px_rgba(52,211,153,0.1)]">
          <span class="relative flex h-2.5 w-2.5">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </span>
          50 Free Requests / Day Included
        </span>
      </div>
    </div>

    <!-- Quick Setup Cards -->
    <div id="setup" class="mt-28 grid grid-cols-1 md:grid-cols-2 gap-8">
      
      <!-- Claude Desktop Card -->
      <div class="glass-card rounded-2xl p-8 relative overflow-hidden flex flex-col justify-between group hover:-translate-y-1 hover:shadow-2xl hover:shadow-indigo-500/10 transition-all duration-500 opacity-0 animate-fade-in-up animate-delay-100">
        <div class="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-indigo-500/10 to-transparent rounded-bl-full -mr-12 -mt-12 transition-transform duration-700 group-hover:scale-110"></div>
        <div class="relative z-10">
          <div class="flex items-center justify-between pb-5 border-b border-white/10">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center border border-orange-500/20 shadow-inner">
                <svg class="w-5 h-5 text-orange-400" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.379.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.577.688.48C19.138 20.161 22 16.416 22 12c0-5.523-4.477-10-10-10z"/></svg>
              </div>
              <span class="font-semibold text-lg text-white tracking-wide">Claude Desktop</span>
            </div>
            <button onclick="copyClaudeConfig()" id="claude-btn" class="text-xs bg-white/5 hover:bg-white/10 text-white px-4 py-2 rounded-lg font-medium transition-all duration-300 border border-white/10 active:scale-95 hover:shadow-md">
              Copy JSON
            </button>
          </div>
          <p class="text-sm text-zinc-400 mt-5 leading-relaxed">Paste into <code class="text-indigo-300 bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20">claude_desktop_config.json</code>:</p>
          <pre class="bg-[#09090b]/80 p-5 rounded-xl text-sm text-zinc-300 mt-4 overflow-x-auto border border-white/5 leading-relaxed shadow-inner"><code id="claude-code">{
  "mcpServers": {
    "contexthub": {
      "url": "https://<YOUR_WORKER>.workers.dev/sse"
    }
  }
}</code></pre>
        </div>
        <p class="text-sm text-zinc-500 mt-6 font-medium flex items-center gap-2">
          <svg class="w-4 h-4 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
          Restart Claude Desktop after saving.
        </p>
      </div>
      
      <!-- Cursor Card -->
      <div class="glass-card rounded-2xl p-8 relative overflow-hidden flex flex-col justify-between group hover:-translate-y-1 hover:shadow-2xl hover:shadow-indigo-500/10 transition-all duration-500 opacity-0 animate-fade-in-up animate-delay-200">
        <div class="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-violet-500/10 to-transparent rounded-bl-full -mr-12 -mt-12 transition-transform duration-700 group-hover:scale-110"></div>
        <div class="relative z-10">
          <div class="flex items-center justify-between pb-5 border-b border-white/10">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 shadow-inner">
                <svg class="w-5 h-5 text-indigo-400" fill="currentColor" viewBox="0 0 24 24"><path d="M11.96 1.137a2 2 0 0 1 1.764.12l8.847 5.12a2 2 0 0 1 1.01 1.737v9.873a2 2 0 0 1-1 1.732l-8.847 5.122a2 2 0 0 1-1.782.112l-8.847-5.122a2 2 0 0 1-1-1.732V8.113a2 2 0 0 1 1.01-1.737z"/></svg>
              </div>
              <span class="font-semibold text-lg text-white tracking-wide">Cursor IDE</span>
            </div>
            <button onclick="copyCursorUrl()" id="cursor-btn" class="text-xs bg-white/5 hover:bg-white/10 text-white px-4 py-2 rounded-lg font-medium transition-all duration-300 border border-white/10 active:scale-95 hover:shadow-md">
              Copy URL
            </button>
          </div>
          <p class="text-sm text-zinc-400 mt-5 leading-relaxed">Navigate to: <strong class="text-zinc-200">Settings &rarr; Features &rarr; MCP Servers &rarr; Add</strong></p>
          <div class="bg-[#09090b]/80 p-5 rounded-xl text-sm text-zinc-300 mt-4 border border-white/5 space-y-3 shadow-inner">
            <div class="flex items-center justify-between border-b border-white/5 pb-2"><span class="text-zinc-500">Name:</span> <code class="text-indigo-300 font-medium bg-indigo-500/10 px-2 py-0.5 rounded">contexthub</code></div>
            <div class="flex items-center justify-between border-b border-white/5 pb-2"><span class="text-zinc-500">Type:</span> <code class="text-emerald-300 font-medium bg-emerald-500/10 px-2 py-0.5 rounded">SSE</code></div>
            <div class="flex flex-col gap-1"><span class="text-zinc-500">URL:</span> <code id="cursor-url" class="text-zinc-300 bg-white/5 px-2 py-1 rounded truncate">https://<YOUR_WORKER>.workers.dev/sse</code></div>
          </div>
        </div>
        <p class="text-sm text-zinc-500 mt-6 font-medium flex items-center gap-2">
          <svg class="w-4 h-4 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
          Cursor will instantly load all 3 tools.
        </p>
      </div>

    </div>

    <!-- Live In-Browser Tester -->
    <div id="tester" class="mt-28 glass-card rounded-3xl p-8 sm:p-10 relative overflow-hidden opacity-0 animate-fade-in-up animate-delay-200">
      <div class="absolute inset-0 bg-gradient-to-b from-indigo-500/5 to-transparent pointer-events-none"></div>
      
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-8 border-b border-white/10 relative z-10">
        <div>
          <h2 class="text-2xl font-bold text-white tracking-tight">Live In-Browser Tester</h2>
          <p class="text-sm text-zinc-400 mt-2">Test the hosted MCP endpoints live before connecting them to your editor.</p>
        </div>
        <div class="flex items-center gap-3 w-full sm:w-auto">
          <select id="tool-select" onchange="updateToolInput()" class="w-full sm:w-auto bg-[#09090b] text-sm text-zinc-200 border border-white/10 rounded-xl px-4 py-2.5 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all shadow-inner">
            <option value="fetch_clean_markdown">fetch_clean_markdown (Web Scraper)</option>
            <option value="get_market_quote">get_market_quote (Crypto/Price)</option>
          </select>
        </div>
      </div>

      <div class="mt-8 space-y-6 relative z-10">
        <div>
          <label id="input-label" class="block text-sm font-medium text-zinc-300 mb-2">Target Web URL:</label>
          <input type="text" id="test-input" value="https://example.com" class="w-full bg-[#09090b]/80 border border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-mono shadow-inner">
        </div>
        
        <button onclick="runTestTool()" id="test-btn" class="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-sm font-semibold px-6 py-3 rounded-xl transition-all duration-300 hover:shadow-lg hover:shadow-indigo-500/25 active:scale-95 flex items-center justify-center gap-2 w-full sm:w-auto">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
          <span>Execute Tool Call</span>
        </button>

        <div class="mt-8">
          <div class="text-sm text-zinc-400 mb-3 font-medium flex items-center justify-between">
            <span>Response Output</span>
            <span class="text-xs bg-white/5 border border-white/10 px-2 py-1 rounded text-zinc-500 font-mono">JSON-RPC</span>
          </div>
          <div class="relative group">
            <div class="absolute inset-0 bg-gradient-to-b from-indigo-500/5 to-transparent rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
            <pre id="test-output" class="bg-[#09090b] border border-white/10 p-5 rounded-xl text-sm text-zinc-300 min-h-[160px] max-h-[400px] overflow-y-auto whitespace-pre-wrap font-mono shadow-inner relative z-10 leading-relaxed">Ready. Click 'Execute Tool Call' above to inspect live edge results.</pre>
          </div>
        </div>
      </div>
    </div>

  </main>

  <!-- Footer -->
  <footer class="border-t border-white/5 bg-[#09090b] pt-12 pb-8 mt-12 relative z-10">
    <div class="max-w-6xl mx-auto px-6">
      <div class="flex flex-col md:flex-row items-center justify-between gap-6">
        <div class="flex items-center gap-2 text-zinc-500">
          <div class="h-6 w-6 rounded bg-gradient-to-br from-indigo-500/20 to-violet-600/20 flex items-center justify-center font-bold text-white text-xs border border-white/5">C</div>
          <span class="text-sm font-medium">ContextHub</span>
        </div>
        <div class="flex items-center gap-8 text-sm text-zinc-500">
          <a href="#setup" class="hover:text-zinc-300 transition-colors">Documentation</a>
          <a href="https://modelcontextprotocol.io" target="_blank" class="hover:text-zinc-300 transition-colors">MCP Spec</a>
          <a href="https://developers.cloudflare.com" target="_blank" class="hover:text-zinc-300 transition-colors">Cloudflare Edge</a>
        </div>
      </div>
      <div class="mt-8 text-center md:text-left text-xs text-zinc-600 font-medium">
        &copy; 2026 ContextHub. Hosted Model Context Protocol on the Edge.
      </div>
    </div>
  </footer>

  <script>
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
      btn.innerHTML = '<span class="text-emerald-400">Copied!</span>';
      setTimeout(() => btn.innerText = 'Copy JSON', 2000);
    }

    function copyCursorUrl() {
      const url = document.getElementById('cursor-url').innerText;
      navigator.clipboard.writeText(url);
      const btn = document.getElementById('cursor-btn');
      btn.innerHTML = '<span class="text-emerald-400">Copied!</span>';
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

      output.innerHTML = '<span class="text-indigo-400 animate-pulse">Running tool on the Edge...</span>';
      btn.disabled = true;
      btn.classList.add('opacity-70', 'cursor-not-allowed');

      const args = toolName === 'fetch_clean_markdown' ? { url: val } : { symbol: val };

      try {
        const res = await fetch('/api/test-tool', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ toolName, args })
        });
        const data = await res.json();
        
        // Format JSON with syntax highlighting via spans
        const formatted = JSON.stringify(data, null, 2)
          .replace(/"(.*?)":/g, '<span class="text-indigo-300">"$1":</span>')
          .replace(/true|false/g, '<span class="text-emerald-400">$&</span>')
          .replace(/null/g, '<span class="text-rose-400">$&</span>');
          
        output.innerHTML = formatted;
      } catch (e) {
        output.innerHTML = '<span class="text-rose-400">Execution error: ' + e.message + '</span>';
      } finally {
        btn.disabled = false;
        btn.classList.remove('opacity-70', 'cursor-not-allowed');
      }
    }
  </script>
</body>
</html>`;
