# Andromeda Copilot

An AI-powered agent that can write and execute TypeScript/JavaScript files using
the Andromeda runtime. Available in both terminal and web interfaces.

## Features

- 🤖 AI-powered TypeScript/JavaScript code generation
- 🚀 Execute code with Andromeda runtime
- 📁 File system operations
- 🎨 Canvas/Graphics rendering support
- 🌐 Web interface with beautiful UI
- 💻 Terminal interface for CLI lovers
- 📊 Token usage tracking

## Prerequisites

1. **Andromeda Runtime**: Install from
   [tryandromeda/andromeda](https://github.com/tryandromeda/andromeda)

   ```sh
   cargo install --git https://github.com/tryandromeda/andromeda
   ```

2. **OpenAI API Key**: Set your API key as an environment variable

   ```sh
   export OPENAI_API_KEY=your_api_key_here
   ```

## Usage

### Terminal Interface

Run directly in terminal:

```sh
deno task terminal
```

### Web Interface

Start the web server:

```sh
deno task web
```

Then open <http://localhost:8080> in your browser.

## Installation

```sh
deno install -gAf --config deno.json server.ts
```

## API Endpoints

- `POST /api/chat` - Chat with the agent
- `GET /api/health` - Health check
- `GET /api/sessions` - Active sessions count
