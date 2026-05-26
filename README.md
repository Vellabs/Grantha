# Grantha

[![Release](https://github.com/Vellabs/Grantha/actions/workflows/release.yml/badge.svg)](https://github.com/Vellabs/Grantha/actions/workflows/release.yml)
[![Verify](https://github.com/Vellabs/Grantha/actions/workflows/verify.yml/badge.svg)](https://github.com/Vellabs/Grantha/actions/workflows/verify.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Grantha** is an intelligent, local-first knowledge graph and research assistant. It leverages local Large Language Models (LLMs) and Wikipedia to help you map out complex topics, perform deep dives into technical subjects, and generate structured summaries.

---

## 🚀 Prerequisites

To run Grantha successfully, you need the following dependencies installed on your system:

### 1. Ollama (Required)
Grantha relies on a local [Ollama](https://ollama.com/) instance for all AI processing.
- **Install**: [Download Ollama](https://ollama.com/download)
- **Model Configuration**: You can configure your preferred model (e.g., `gemma2:27b`, `llama3.1:8b`) via the built-in Setup Wizard.
- Ensure Ollama is running in the background.

### 2. Rust & Cargo
The backend is built with Rust and Tauri.
- **Install**: [rustup.rs](https://rustup.rs/)
- Ensure you have the latest stable version: `rustc --version`

### 3. Node.js & npm
The frontend is built with React and Vite.
- **Install**: [Node.js](https://nodejs.org/) (Recommended: LTS version)
- Verify installation: `node -v` and `npm -v`

### 4. System Dependencies (Linux Only)
If you are on Linux, you need specific development libraries for Tauri:
- **Debian/Ubuntu**:
  ```bash
  sudo apt-get update
  sudo apt-get install -y libgtk-3-dev libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
  ```

---

## 🛠️ Installation & Setup

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/Vellabs/Grantha.git
   cd grantha
   ```

2. **Install Frontend Dependencies**:
   ```bash
   npm install
   ```

3. **Configure Ollama**:
   Ensure Ollama is running at `http://localhost:11434`.

---

## 💻 Development

Start the application in development mode:
```bash
npm run tauri dev
```
This will launch the Vite development server and open the Grantha desktop window.

---

## 📖 User Guide

### 1. Starting Research
- Enter a topic in the search bar (e.g., "Quantum Computing" or "How do LLMs work?").
- Click **Research**.
- Grantha will scrape Wikipedia and use the local LLM to build an initial tree-structured knowledge graph.

### 2. Navigating the Graph
- **Drag**: Click and drag any node to reposition it. Your layout is automatically saved to a local SQLite database.
- **Zoom**: Use the mouse wheel or trackpad to zoom in and out.
- **Expand/Collapse**: Click the **Expand** button on a node to reveal its sub-topics.

### 3. Deep Dive
- Click on any node to open the **Reader Pane**.
- Click the **Deep Dive** button to instruct the LLM to research that specific sub-topic in more detail, branching the graph further.

### 4. Reading Articles
- When a node is selected, Grantha generates a technical summary or "Article" using the LLM.
- Use the **Regenerate** button to get a fresh perspective on the topic.

---

## 🏗️ Architecture

- **Frontend**: React, Typescript, Vite, Zustand (State Management), React Flow (Graph Visualization).
- **Backend**: Rust, Tauri 2.0, SQLite (Local Data Persistence).
- **AI Engine**: Ollama (Local LLM), Wikipedia API (Context Sourcing).

---

## 📦 Building for Production

To build a standalone executable for your current platform:
```bash
npm run build
```
The installer will be generated in `src-tauri/target/release/bundle/`.

---

## 📝 License

Distributed under the MIT License. See `LICENSE` for more information.

*(Note: Replace `Vellabs/Grantha` in links with the actual repository path once hosted.)*
