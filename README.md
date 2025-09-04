# Andromeda Copilot

An AI-powered agent that can write and execute TypeScript/JavaScript files using
the latest Andromeda runtime. Available in both terminal and web interfaces with 
comprehensive support for modern development workflows.

## Features

- 🤖 **AI-powered TypeScript/JavaScript code generation** with GPT-4 integration
- 🚀 **Execute code with latest Andromeda runtime** supporting all modern Web APIs
- 🎨 **GPU-Accelerated Canvas operations** with hardware-accelerated 2D graphics
- 🗄️ **SQLite database support** with full CRUD operations and prepared statements
- 💾 **Web Storage APIs** supporting localStorage and sessionStorage
- 🔐 **Web Crypto API** with UUID generation, hashing, and cryptographic operations
- ⚡ **Performance monitoring** with high-precision timing and benchmarking tools
- 📁 **Enhanced file system operations** with comprehensive file management
- 🌐 **Web interface with beautiful UI** showcasing all Andromeda capabilities
- 💻 **Terminal interface for CLI lovers** with full feature parity
- 📊 **Token usage tracking** and conversation history management
- 🔧 **Advanced developer tools** including LSP integration, formatting, and compilation
- 📋 **Task system support** for workflow automation and script management
- 📦 **Import map integration** for modern module resolution
- 🧪 **Performance profiling** with execution timing and resource usage analysis

## Prerequisites

1. **Latest Andromeda Runtime**: Install from
   [tryandromeda/andromeda](https://github.com/tryandromeda/andromeda)

   ```sh
   cargo install --git https://github.com/tryandromeda/andromeda
   ```

2. **OpenAI API Key**: Set your API key as an environment variable

   ```sh
   export OPENAI_API_KEY=your_api_key_here
   ```

## New Andromeda Features Supported

### 🎨 Canvas & Graphics
- GPU-accelerated 2D rendering with WGPU backend
- Full Canvas 2D API support with shapes, paths, and images
- PNG export capabilities
- Hardware-accelerated performance

### 🗄️ Database Operations
- SQLite database integration
- Prepared statements and transactions
- CRUD operations with type safety
- In-memory and persistent database support

### 💾 Web Storage
- localStorage and sessionStorage APIs
- Data persistence across sessions
- Key-value storage with proper serialization

### 🔐 Cryptography
- Web Crypto API implementation
- UUID generation and random value creation
- Hashing algorithms (SHA-256, etc.)
- Cryptographic key generation and operations

### ⚡ Performance APIs
- High-precision timing with performance.now()
- Performance marks and measurements
- Memory usage tracking
- Execution profiling and benchmarking

### 🔧 Developer Tools
- Built-in code formatter ('andromeda fmt')
- Single-file compilation ('andromeda compile')
- Language Server Protocol integration
- Real-time diagnostics and linting
- Shell completion generation

### 📋 Task System
- Define custom tasks in andromeda.json/toml/yaml
- Task dependencies and execution order
- Environment variable support
- Working directory configuration

### 📦 Module Resolution
- Import maps for bare specifier resolution
- CDN integration support
- Modern ES module loading
- TypeScript support without transpilation

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

### Quick Examples

The web interface now includes quick action buttons for:
- 🎨 Canvas demonstrations with shapes and animations
- 🗄️ Database operations with SQLite examples
- 💾 Storage examples using localStorage/sessionStorage
- 🔐 Crypto API demonstrations with UUID and hashing
- ⚡ Performance monitoring and benchmarking
- 📋 Task system configuration and execution
- 📦 Import map setup for modern modules
- ✨ Code formatting and quality tools

## Installation

```sh
deno install -gAf --config deno.json server.ts
```

## API Endpoints

- `POST /api/chat` - Chat with the agent
- `GET /api/health` - Health check
- `GET /api/sessions` - Active sessions count
- `GET /api/workspaces` - List workspaces
- `POST /api/workspaces` - Create workspace
- `POST /api/workspaces/switch` - Switch workspace
- `DELETE /api/workspaces` - Delete workspace

## Advanced Features

### Workspace Management
- Multiple isolated workspaces
- Workspace switching and management
- Session persistence across workspaces

### Performance Profiling
- Execution timing and benchmarking
- Memory usage analysis
- Garbage collection statistics
- Resource utilization monitoring

### Development Workflow
- Automatic code formatting
- Real-time linting and diagnostics
- Task automation and scripting
- Import map configuration
- Module resolution assistance

### Error Handling
- Enhanced error reporting with source context
- Stack trace analysis
- Diagnostic information display
- LSP-based error detection

## Modern Andromeda APIs Available

All the latest Andromeda runtime APIs are supported including:
- File system operations (read, write, copy, move, stat)
- Canvas 2D graphics with GPU acceleration
- SQLite database operations
- Web Storage (localStorage, sessionStorage)
- Web Crypto API
- Performance API with high-precision timing
- Navigator and platform detection
- Fetch API for HTTP requests
- TextEncoder/TextDecoder for text processing
- URL and URLSearchParams for URL manipulation
- Environment variable management
- Process control and command-line arguments

The agent automatically leverages these APIs to create modern, performant applications
that take full advantage of Andromeda's capabilities.
