# 🚀 Build with AI: Google Antigravity & Google AI Studio

> **Repository:** `build-with-ai-antigravity`  
> **Focus:** Agentic Development, AI-Powered Workspaces & Workflow Automation

## 📖 About the Project

This repository contains the hands-on project built during Google's **Build with AI** live workshop. The session focused on transitioning from traditional manual coding to **agent-first software engineering**—combining **Google Antigravity** as an autonomous development environment with **Google AI Studio** to prototype, orchestrate, and deploy intelligent applications.

During the event, we built an AI-powered workspace from scratch and integrated autonomous AI agents capable of planning, executing multi-step tasks, managing files across a stack, and automating complex workflows.

---

## 🛠️ What We Did in This Workshop

### Phase 1: Getting Started with Google Antigravity
* **Explored the Antigravity Environment:** Set up and navigated the core components of the Antigravity developer platform—**Agent Manager**, **Editor**, **Browser**, and **Artifacts**.
* **Understood Agentic Architecture:** Learned how Antigravity's agent harness operates in a continuous *Plan → Act → Observe → Verify* loop inside a sandboxed environment to write, test, and validate code with reduced hallucinations.
* **Built an AI-Powered Workspace from Scratch:** Configured workspace context, prompt rules, and multi-file orchestration so agents can reason across the entire project codebase.

### Phase 2: Build and Deploy with AI
* **Google AI Studio Integration:** Used **Google AI Studio (Build Mode)** and the **Gemini API** to rapidly prototype intelligent features, configure system instructions, and test model responses.
* **Autonomous Agent & Workflow Automation:** Engineered an AI agent capable of automating multi-step workflows—handling code execution, dynamic file updates, and external tool/API interactions.
* **End-to-End Application Deployment:** Connected the frontend/backend logic, configured secure environment variables for API keys, and deployed the working AI application.

---

## ✨ Key Features Built

* **[Feature 1 — e.g., Multi-Step Task Automation]:** *[Briefly describe what your agent automates, e.g., Generates and validates project scaffolding from natural language prompts.]*
* **[Feature 2 — e.g., Gemini-Powered Intelligence]:** *[Briefly describe how Google AI Studio / Gemini API is used in your app.]*
* **[Feature 3 — e.g., Interactive Workspace / UI]:** *[Briefly describe the user interface or CLI workflow you built.]*

---

## 🧰 Tech Stack

* **Agentic Development Platform:** Google Antigravity (IDE / CLI / Agent Manager)
* **AI Prototyping & LLM API:** Google AI Studio & Gemini API
* **Frontend / Backend:** *[e.g., React, Node.js, Python — update with your stack]*
* **Deployment & Hosting:** *[e.g., Google Cloud Run / Firebase / Local Sandbox]*

---

## 📂 Project Structure

```text
build-with-ai-antigravity/
├── src/                  # Core application and agent logic
├── prompts/              # System instructions & agent workflow prompts
├── .env.example          # Environment variable template (API keys)
├── package.json          # Project dependencies (or requirements.txt)
└── README.md             # Project documentation
```

---

## ⚡ Getting Started

### Prerequisites
* Access to **Google Antigravity**
* A **Gemini API Key** from [Google AI Studio](https://aistudio.google.com/)
* *[Node.js v18+ / Python 3.10+ — update based on your runtime]*

### Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone [https://github.com/](https://github.com/)<your-username>/build-with-ai-antigravity.git
   cd build-with-ai-antigravity
   ```

2. **Configure environment variables:**
   Create a `.env` file in the root directory and add your Google AI Studio API key:
   ```env
   GEMINI_API_KEY=your_google_ai_studio_api_key_here
   ```

3. **Install dependencies & run:**
   ```bash
   # If using Node.js:
   npm install
   npm run dev

   # If using Python:
   pip install -r requirements.txt
   python main.py
   ```

---

## 💡 Key Takeaways

* **Agent-First Development:** Shifting from line-by-line coding to supervising and orchestrating parallel agents dramatically accelerates prototyping and debugging.
* **Seamless Ecosystem:** Pairing **Google AI Studio** for rapid model experimentation with **Google Antigravity** for multi-file codebase execution streamlines the path from idea to deployed AI app.

---

## 📜 Acknowledgments

Built during the **Google Build with AI** live hands-on session.
