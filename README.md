<div align="center">
  
# ⚡️ ContextHub

**Instant AI Tools for Cursor & Claude. Zero Local Installs.**

[![Deploy](https://img.shields.io/badge/Deploy-Netlify-00C7B7?style=for-the-badge&logo=netlify)](https://www.netlify.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.style=for-the-badge)](https://opensource.org/licenses/MIT)

</div>

---

## 🚀 What is ContextHub?

Model Context Protocol (MCP) servers are incredible—they give your AI agents (like Claude or Cursor) superpowers to browse the web, check GitHub, and fetch live data. 

**But setting them up is usually a nightmare.** 

Instead of forcing you to clone repositories, configure Python/Node environments, debug local ports, or run Docker containers, **ContextHub is a fully-hosted, plug-and-play solution**. It runs as a Netlify Serverless Function, meaning you can connect it to your favorite AI editor in **10 seconds flat**.

---

## 🛠️ Included Tools (Out of the Box)

Your AI agent instantly gets access to these premium tools:

1. 🧹 **Clean Web Scraper** (`fetch_clean_markdown`)
   * Give your AI any URL, and it instantly strips away ads, tracking scripts, and pop-ups. It returns clean, token-efficient Markdown that your LLM can actually read.
   
2. 🐙 **GitHub Repo Inspector** (`inspect_github_repo`)
   * Let your AI read open issues, check the file tree, and analyze recent releases of any public repository—without needing to `git clone` anything locally.
   
3. 📈 **Real-Time Market Data** (`get_market_quote`)
   * Live cryptocurrency and fiat pricing snapshots, complete with 24-hour volume and percentage changes, delivered as structured JSON.

---

## ⚡ How to Connect in 10 Seconds

No installations. No terminal commands. 

### For Cursor IDE:
1. Open **Cursor Settings** ➔ **Features** ➔ **MCP Servers**
2. Click **+ Add New MCP Server**
3. Set Type to `SSE` and paste your deployment URL (e.g., `https://your-domain.com/sse`).
4. Click **Save** and start prompting!

### For Claude Desktop:
1. Open your Claude configuration file.
2. Paste in your deployment URL.
3. Restart Claude Desktop. The hammer icon will now show your new superpowers!

---

## 🌍 Try it Live

ContextHub comes with a built-in **Live In-Browser Tester**. Just navigate to your deployed URL in any web browser to access a sleek, dark-mode dashboard where you can manually test the tools before connecting them to your AI.

---

*Ready to supercharge your AI workflows? Follow the deployment steps to get your own instance running for free!*
