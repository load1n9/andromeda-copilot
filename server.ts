import { AndromedaAgent } from "./agent.ts";
import { ChatRequest, ChatResponse } from "./types.ts";
import { WorkspaceManager } from "./workspace-manager.ts";
import { colors } from "@cliffy/ansi/colors";

const sessions = new Map<string, AndromedaAgent>();
const workspaceManager = new WorkspaceManager("./workspaces");

function generateSessionId(): string {
  return crypto.randomUUID();
}

function getOrCreateAgent(
  sessionId?: string,
  apiKey?: string,
): { agent: AndromedaAgent; sessionId: string } {
  if (sessionId && sessions.has(sessionId)) {
    return { agent: sessions.get(sessionId)!, sessionId };
  }

  const newSessionId = sessionId || generateSessionId();

  const currentWorkspace = workspaceManager.getCurrentWorkspace();
  const workspaceDir = currentWorkspace?.path || "./workspace";

  const agent = new AndromedaAgent({
    model: "gpt-4",
    temperature: 0.7,
    maxTokens: 3_096,
    workspaceDir,
    workspaceManager,
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
          headers: { ...corsHeaders(), "Content-Type": "application/json" },
        },
      );
    }

    const authHeader = request.headers.get("Authorization");
    const apiKey = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : undefined;

    const { agent, sessionId: newSessionId } = getOrCreateAgent(
      sessionId,
      apiKey,
    );

    console.log(
      colors.blue.bold(`[API] Processing request for session: ${newSessionId}`),
    );
    console.log(colors.cyan(`[API] Message: ${message}`));

    const result = await agent.chat(message);

    const response: ChatResponse = {
      response: result.content,
      usage: result.usage,
      sessionId: newSessionId,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error(colors.red("[API] Error:"), error);

    if (
      error instanceof Error && (
        error.message.includes("API_KEY_ERROR") ||
        error.message.includes("API key") ||
        error.message.includes("Incorrect API key") ||
        error.message.includes("invalid_api_key")
      )
    ) {
      console.log(
        colors.yellow(
          "[API] Invalid API key detected, providing mock response",
        ),
      );

      const mockSessionId = generateSessionId();

      const response: ChatResponse = {
        response:
          "⚠️ **Demo Mode**: Invalid OpenAI API key detected. Please set a valid OPENAI_API_KEY in your .env file to use the full functionality.\n\nFor now, this is a mock response to test the frontend. The agent would normally:\n- Write and execute TypeScript files\n- Use the Andromeda runtime\n- Access file system operations\n- Provide real AI assistance",
        usage: {
          promptTokens: 50,
          completionTokens: 100,
          totalTokens: 150,
        },
        sessionId: mockSessionId,
      };

      return new Response(
        JSON.stringify(response),
        {
          status: 200,
          headers: { ...corsHeaders(), "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Internal server error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      },
    );
  }
}

async function handleStatic(pathname: string): Promise<Response> {
  try {
    let filePath: string;
    if (pathname === "/") {
      filePath = "./web/index.html";
    } else {
      filePath = `./web${pathname}`;
    }

    console.log(colors.dim(`[Static] Serving: ${filePath}`));
    const file = await Deno.readFile(filePath);

    let contentType = "text/plain";
    if (filePath.endsWith(".html")) contentType = "text/html";
    else if (filePath.endsWith(".css")) contentType = "text/css";
    else if (filePath.endsWith(".js")) contentType = "application/javascript";
    else if (filePath.endsWith(".json")) contentType = "application/json";

    return new Response(file, {
      headers: { ...corsHeaders(), "Content-Type": contentType },
    });
  } catch (error) {
    console.error(colors.red(`[Static] Error serving ${pathname}:`), error);
    return new Response("Not Found", {
      status: 404,
      headers: corsHeaders(),
    });
  }
}

// Workspace API handlers
function handleWorkspaceList(_request: Request): Response {
  try {
    const workspaces = workspaceManager.listWorkspaces();
    const current = workspaceManager.getCurrentWorkspace();

    return new Response(
      JSON.stringify({
        workspaces: workspaces.map((ws) => ({
          ...ws,
          createdAt: ws.createdAt.toISOString(),
          lastAccessed: ws.lastAccessed.toISOString(),
        })),
        currentWorkspace: current
          ? {
            ...current,
            createdAt: current.createdAt.toISOString(),
            lastAccessed: current.lastAccessed.toISOString(),
          }
          : null,
      }),
      { headers: { ...corsHeaders(), "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error(colors.red("[API] Workspace list error:"), error);
    return new Response(
      JSON.stringify({ error: "Failed to list workspaces" }),
      {
        status: 500,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      },
    );
  }
}

async function handleWorkspaceCreate(request: Request): Promise<Response> {
  try {
    const body = await request.json();
    const { name, description } = body;

    if (!name) {
      return new Response(
        JSON.stringify({ error: "Workspace name is required" }),
        {
          status: 400,
          headers: { ...corsHeaders(), "Content-Type": "application/json" },
        },
      );
    }

    const workspace = workspaceManager.createWorkspace(name, description);

    return new Response(
      JSON.stringify({
        ...workspace,
        createdAt: workspace.createdAt.toISOString(),
        lastAccessed: workspace.lastAccessed.toISOString(),
      }),
      { headers: { ...corsHeaders(), "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error(colors.red("[API] Workspace create error:"), error);
    const errorMessage = error instanceof Error
      ? error.message
      : "Failed to create workspace";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 400,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      },
    );
  }
}

async function handleWorkspaceSwitch(request: Request): Promise<Response> {
  try {
    const body = await request.json();
    const { id, name } = body;

    if (!id && !name) {
      return new Response(
        JSON.stringify({ error: "Workspace ID or name is required" }),
        {
          status: 400,
          headers: { ...corsHeaders(), "Content-Type": "application/json" },
        },
      );
    }

    let workspaceId = id;
    if (!workspaceId && name) {
      const workspace = workspaceManager.listWorkspaces().find((ws) =>
        ws.name === name
      );
      if (!workspace) {
        return new Response(
          JSON.stringify({ error: `Workspace "${name}" not found` }),
          {
            status: 404,
            headers: { ...corsHeaders(), "Content-Type": "application/json" },
          },
        );
      }
      workspaceId = workspace.id;
    }

    const workspace = workspaceManager.setCurrentWorkspace(workspaceId);

    sessions.clear();

    return new Response(
      JSON.stringify({
        ...workspace,
        createdAt: workspace.createdAt.toISOString(),
        lastAccessed: workspace.lastAccessed.toISOString(),
      }),
      { headers: { ...corsHeaders(), "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error(colors.red("[API] Workspace switch error:"), error);
    const errorMessage = error instanceof Error
      ? error.message
      : "Failed to switch workspace";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 400,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      },
    );
  }
}

function handleWorkspaceDelete(request: Request): Response {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    const deleteFiles = url.searchParams.get("deleteFiles") === "true";

    if (!id) {
      return new Response(
        JSON.stringify({ error: "Workspace ID is required" }),
        {
          status: 400,
          headers: { ...corsHeaders(), "Content-Type": "application/json" },
        },
      );
    }

    const success = workspaceManager.deleteWorkspace(id, deleteFiles);

    if (!success) {
      return new Response(
        JSON.stringify({ error: "Workspace not found" }),
        {
          status: 404,
          headers: { ...corsHeaders(), "Content-Type": "application/json" },
        },
      );
    }

    sessions.clear();

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders(), "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error(colors.red("[API] Workspace delete error:"), error);
    const errorMessage = error instanceof Error
      ? error.message
      : "Failed to delete workspace";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 400,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      },
    );
  }
}

async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const { pathname } = url;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders() });
  }

  if (pathname === "/api/chat" && request.method === "POST") {
    return await handleChat(request);
  }

  if (pathname === "/api/health" && request.method === "GET") {
    return new Response(
      JSON.stringify({ status: "ok", timestamp: new Date().toISOString() }),
      { headers: { ...corsHeaders(), "Content-Type": "application/json" } },
    );
  }

  if (pathname === "/api/sessions" && request.method === "GET") {
    return new Response(
      JSON.stringify({ activeSessions: sessions.size }),
      { headers: { ...corsHeaders(), "Content-Type": "application/json" } },
    );
  }

  if (pathname === "/api/workspaces" && request.method === "GET") {
    return handleWorkspaceList(request);
  }

  if (pathname === "/api/workspaces" && request.method === "POST") {
    return await handleWorkspaceCreate(request);
  }

  if (pathname === "/api/workspaces/switch" && request.method === "POST") {
    return await handleWorkspaceSwitch(request);
  }

  if (pathname === "/api/workspaces" && request.method === "DELETE") {
    return handleWorkspaceDelete(request);
  }

  return await handleStatic(pathname);
}

async function startServer(port = 8080) {
  console.log(
    colors.magenta.bold(`🌐 Andromeda API Server starting on port ${port}`),
  );
  console.log(colors.blue(`📡 API endpoints:`));
  console.log(colors.cyan(`  POST /api/chat - Chat with the agent`));
  console.log(colors.cyan(`  GET  /api/health - Health check`));
  console.log(colors.cyan(`  GET  /api/sessions - Active sessions count`));
  console.log(colors.cyan(`  GET  /api/workspaces - List workspaces`));
  console.log(colors.cyan(`  POST /api/workspaces - Create workspace`));
  console.log(colors.cyan(`  POST /api/workspaces/switch - Switch workspace`));
  console.log(colors.cyan(`  DELETE /api/workspaces - Delete workspace`));
  console.log(colors.blue(`🌍 Web interface: http://localhost:${port}`));
  console.log(colors.dim("─".repeat(50)));

  const server = Deno.serve({ port }, handleRequest);
  await server.finished;
}

if (import.meta.main) {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    console.error(
      colors.red("❌ OPENAI_API_KEY environment variable is required"),
    );
    console.log(colors.yellow("Please set your OpenAI API key:"));
    console.log(colors.cyan("export OPENAI_API_KEY=your_api_key_here"));
    Deno.exit(1);
  }

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
    console.error(
      colors.red("❌ Andromeda runtime is not installed or not in PATH"),
    );
    console.log(colors.yellow("Please install Andromeda runtime:"));
    console.log(
      colors.cyan(
        "cargo install --git https://github.com/tryandromeda/andromeda",
      ),
    );
    Deno.exit(1);
  }

  const port = Number(Deno.args[0]) || 8080;
  await startServer(port);
}
