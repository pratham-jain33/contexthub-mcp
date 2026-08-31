# 🚀 ContextHub Deployment & Testing Guide (Netlify Edition)

You have successfully converted ContextHub to run entirely as a **Netlify Serverless Function**! No Cloudflare, no `wrangler`, no KV configuration needed.

---

## 🛠️ Step 1: Deploy to Netlify
1. Open your Netlify Dashboard and drag-and-drop the entire `ContextHub` folder (or link it to your GitHub repo).
2. Netlify will automatically detect `netlify/functions/server.ts`, install the dependencies via `package.json`, and deploy the server!
3. Your live site will be ready at your Netlify domain (e.g. `https://contexthub.netlify.app`).

---

## 🧪 Step 2: Testing the Live Web Dashboard
1. Open your Netlify URL (e.g., **`https://contexthub.netlify.app`**) in your browser.
2. Scroll to the **"Live In-Browser Tool Tester"**.
3. Select any tool (e.g., `fetch_clean_markdown` or `get_market_quote`).
4. Enter an input (e.g., `https://news.ycombinator.com` or `bitcoin`).
5. Click **Execute Tool Call** to test the live Netlify Function execution!

---

## 🔌 Step 3: Connecting Your AI Client

### For Cursor IDE:
1. Open **Cursor Settings** ➔ **Features** ➔ **MCP Servers**
2. Click **+ Add New MCP Server**
3. Configure:
   - **Name:** `contexthub`
   - **Type:** `SSE`
   - **URL:** `https://your-netlify-app-domain.netlify.app/sse`
4. Click **Save**.

### For Claude Desktop:
Add the following block to your `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "contexthub": {
      "url": "https://your-netlify-app-domain.netlify.app/sse"
    }
  }
}
```
*Restart Claude Desktop to apply the changes!*
