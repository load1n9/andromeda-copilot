import { AndromedaAgent } from "./agent.ts";
import { colors } from "https://deno.land/x/cliffy@v1.0.0-rc.7/ansi/colors.ts";

interface ChatRequest {
  message: string;
  sessionId?: string;
}

interface ChatResponse {
  response: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  sessionId: string;
}

// Store agent sessions
const sessions = new Map<string, AndromedaAgent>();

function generateSessionId(): string {
  return crypto.randomUUID();
}

function getOrCreateAgent(sessionId?: string, apiKey?: string): { agent: AndromedaAgent; sessionId: string } {
  if (sessionId && sessions.has(sessionId)) {
    return { agent: sessions.get(sessionId)!, sessionId };
  }

  const newSessionId = sessionId || generateSessionId();
  const agent = new AndromedaAgent({
    model: "gpt-4",
    temperature: 0.7,
    maxTokens: 2000,
    workspaceDir: "./workspace",
    apiKey: apiKey || Deno.env.get("OPENAI_API_KEY"),
  });

  sessions.set(newSessionId, agent);
  return { agent, sessionId: newSessionId };
}

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

async function handleChat(request: Request): Promise<Response> {
  try {
    const body: ChatRequest = await request.json();
    const { message, sessionId } = body;

    if (!message) {
      return new Response(
        JSON.stringify({ error: "Message is required" }),
        { 
          status: 400, 
          headers: { ...corsHeaders(), "Content-Type": "application/json" } 
        }
      );
    }

    // Get API key from Authorization header if provided
    const authHeader = request.headers.get("Authorization");
    const apiKey = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;

    const { agent, sessionId: newSessionId } = getOrCreateAgent(sessionId, apiKey);

    console.log(colors.blue.bold(`[API] Processing request for session: ${newSessionId}`));
    console.log(colors.cyan(`[API] Message: ${message}`));

    const result = await agent.chat(message);

    const response: ChatResponse = {
      response: result.content,
      usage: result.usage,
      sessionId: newSessionId,
    };

    return new Response(
      JSON.stringify(response),
      {
        status: 200,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error(colors.red("[API] Error:"), error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Internal server error" 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders(), "Content-Type": "application/json" } 
      }
    );
  }
}

async function handleStatic(pathname: string): Promise<Response> {
  try {
    // Serve static files from the web directory
    const filePath = `./web${pathname === "/" ? "/index.html" : pathname}`;
    const file = await Deno.readFile(filePath);
    
    let contentType = "text/plain";
    if (pathname.endsWith(".html")) contentType = "text/html";
    else if (pathname.endsWith(".css")) contentType = "text/css";
    else if (pathname.endsWith(".js")) contentType = "application/javascript";
    else if (pathname.endsWith(".json")) contentType = "application/json";

    return new Response(file, {
      headers: { ...corsHeaders(), "Content-Type": contentType },
    });
  } catch {
    return new Response("Not Found", { 
      status: 404, 
      headers: corsHeaders() 
    });
  }
}

async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const { pathname } = url;

  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders() });
  }

  // API routes
  if (pathname === "/api/chat" && request.method === "POST") {
    return handleChat(request);
  }

  if (pathname === "/api/health" && request.method === "GET") {
    return new Response(
      JSON.stringify({ status: "ok", timestamp: new Date().toISOString() }),
      { headers: { ...corsHeaders(), "Content-Type": "application/json" } }
    );
  }

  if (pathname === "/api/sessions" && request.method === "GET") {
    return new Response(
      JSON.stringify({ activeSessions: sessions.size }),
      { headers: { ...corsHeaders(), "Content-Type": "application/json" } }
    );
  }

  // Static file serving
  return handleStatic(pathname);
}

async function startServer(port = 8080) {
  console.log(colors.magenta.bold(`🌐 Andromeda API Server starting on port ${port}`));
  console.log(colors.blue(`📡 API endpoints:`));
  console.log(colors.cyan(`  POST /api/chat - Chat with the agent`));
  console.log(colors.cyan(`  GET  /api/health - Health check`));
  console.log(colors.cyan(`  GET  /api/sessions - Active sessions count`));
  console.log(colors.blue(`🌍 Web interface: http://localhost:${port}`));
  console.log(colors.dim("─".repeat(50)));

  const server = Deno.serve({ port }, handleRequest);
  await server.finished;
}

if (import.meta.main) {
  // Check for OpenAI API key
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    console.error(colors.red("❌ OPENAI_API_KEY environment variable is required"));
    console.log(colors.yellow("Please set your OpenAI API key:"));
    console.log(colors.cyan("export OPENAI_API_KEY=your_api_key_here"));
    Deno.exit(1);
  }

  // Check if Andromeda runtime is installed
  try {
    const command = new Deno.Command("andromeda", {
      args: ["--version"],
      stdout: "piped",
      stderr: "piped",
    });

    const process = command.spawn();
    const { code } = await process.output();

    if (code !== 0) {
      throw new Error("Andromeda not found");
    }
  } catch {
    console.error(colors.red("❌ Andromeda runtime is not installed or not in PATH"));
    console.log(colors.yellow("Please install Andromeda runtime:"));
    console.log(colors.cyan("cargo install --git https://github.com/tryandromeda/andromeda"));
    Deno.exit(1);
  }

  const port = Number(Deno.args[0]) || 8080;
  await startServer(port);
}
