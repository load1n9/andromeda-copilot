import { AndromedaAgent } from "./agent.ts";
import { WorkspaceManager } from "./workspace-manager.ts";
import { colors } from "@cliffy/ansi/colors";

// Check for OpenAI API key
const apiKey = Deno.env.get("OPENAI_API_KEY") ||
  Deno.args.find((arg) => arg.startsWith("--api-key="))?.split("=")[1];
if (!apiKey) {
  console.error(
    colors.red("❌ OPENAI_API_KEY environment variable is required"),
  );
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

// Create workspace manager
const workspaceManager = new WorkspaceManager("./workspaces");

// Get current workspace or default
const currentWorkspace = workspaceManager.getCurrentWorkspace();
const workspaceDir = currentWorkspace?.path ||
  (Deno.args.find((arg) => arg.startsWith("--workspace="))?.split("=")[1] ||
    "./workspace");

console.log(
  colors.dim(
    `📂 Current workspace: ${
      currentWorkspace?.name || "default"
    } (${workspaceDir})`,
  ),
);

const agent = new AndromedaAgent({
  model: Deno.args.find((arg) => arg.startsWith("--model="))?.split("=")[1] ||
    "gpt-4",
  temperature: Number(
    Deno.args.find((arg) => arg.startsWith("--temperature="))?.split("=")[1] ||
      0.7,
  ),
  maxTokens: Number(
    Deno.args.find((arg) => arg.startsWith("--max-tokens="))?.split("=")[1] ||
      2000,
  ),
  workspaceDir,
  workspaceManager,
  apiKey,
});

console.log(colors.magenta.bold("🌌 Andromeda Copilot started!"));
console.log(
  colors.blue(
    "📝 I can write and execute TypeScript/JavaScript files using the Andromeda runtime",
  ),
);
console.log(colors.green('💡 Type your requests below (type "exit" to quit)'));
console.log(colors.green('🧹 Type "clear" to clear conversation history'));
console.log(colors.green('❓ Type "help" for available commands'));
console.log(colors.green('📂 Type "workspace" for workspace management'));
console.log(colors.dim("─".repeat(60)));

function handleWorkspaceCommand(
  args: string[],
  workspaceManager: WorkspaceManager,
): boolean {
  const command = args[0]?.toLowerCase();

  switch (command) {
    case "list":
    case "ls": {
      const workspaces = workspaceManager.listWorkspaces();
      if (workspaces.length === 0) {
        console.log(
          colors.yellow(
            "No workspaces found. Create one with 'workspace create <name>'",
          ),
        );
        return true;
      }

      console.log(colors.blue("\n📂 Available Workspaces:"));
      workspaces.forEach((ws, index) => {
        const current = ws.id === workspaceManager.getCurrentWorkspace()?.id
          ? colors.green(" (current)")
          : "";
        console.log(
          `${colors.cyan(`${index + 1}.`)} ${colors.bold(ws.name)}${current}`,
        );
        if (ws.description) {
          console.log(colors.dim(`   ${ws.description}`));
        }
        console.log(colors.dim(`   Path: ${ws.path}`));
        console.log(
          colors.dim(
            `   Last accessed: ${ws.lastAccessed.toLocaleDateString()}`,
          ),
        );
        console.log();
      });
      return true;
    }

    case "create":
    case "new": {
      const name = args.slice(1).join(" ");
      if (!name) {
        console.log(
          colors.red(
            "❌ Please provide a workspace name: workspace create <name>",
          ),
        );
        return true;
      }

      try {
        const workspace = workspaceManager.createWorkspace(name);
        console.log(colors.green(`✅ Created workspace "${workspace.name}"`));
        console.log(
          colors.blue(
            "💡 Switch to it with: workspace switch " + workspace.name,
          ),
        );
      } catch (error) {
        const errorMessage = error instanceof Error
          ? error.message
          : String(error);
        console.log(colors.red(`❌ ${errorMessage}`));
      }
      return true;
    }

    case "switch":
    case "use": {
      const targetName = args.slice(1).join(" ");
      if (!targetName) {
        console.log(
          colors.red(
            "❌ Please provide a workspace name: workspace switch <name>",
          ),
        );
        return true;
      }

      const target = workspaceManager.getWorkspaceByName(targetName);
      if (!target) {
        console.log(colors.red(`❌ Workspace "${targetName}" not found`));
        return true;
      }

      try {
        workspaceManager.setCurrentWorkspace(target.id);
        console.log(colors.green(`✅ Switched to workspace "${target.name}"`));
      } catch (error) {
        const errorMessage = error instanceof Error
          ? error.message
          : String(error);
        console.log(colors.red(`❌ ${errorMessage}`));
      }
      return true;
    }

    case "delete":
    case "remove": {
      const deleteName = args.slice(1).join(" ");
      if (!deleteName) {
        console.log(
          colors.red(
            "❌ Please provide a workspace name: workspace delete <name>",
          ),
        );
        return true;
      }

      const deleteTarget = workspaceManager.getWorkspaceByName(deleteName);
      if (!deleteTarget) {
        console.log(colors.red(`❌ Workspace "${deleteName}" not found`));
        return true;
      }

      const confirmation = prompt(
        colors.yellow(
          `⚠️  Are you sure you want to delete workspace "${deleteName}"? (y/N): `,
        ),
      );
      if (
        confirmation?.toLowerCase() === "y" ||
        confirmation?.toLowerCase() === "yes"
      ) {
        const deleteFiles = prompt(
          colors.yellow("Delete workspace files too? (y/N): "),
        );
        const shouldDeleteFiles = deleteFiles?.toLowerCase() === "y" ||
          deleteFiles?.toLowerCase() === "yes";

        try {
          workspaceManager.deleteWorkspace(deleteTarget.id, shouldDeleteFiles);
        } catch (error) {
          const errorMessage = error instanceof Error
            ? error.message
            : String(error);
          console.log(colors.red(`❌ ${errorMessage}`));
        }
      } else {
        console.log(colors.blue("Cancelled"));
      }
      return true;
    }

    case "current":
    case "info": {
      const current = workspaceManager.getCurrentWorkspace();
      if (!current) {
        console.log(colors.yellow("No workspace selected (using default)"));
        return true;
      }

      console.log(colors.blue("\n📂 Current Workspace:"));
      console.log(`${colors.bold("Name:")} ${current.name}`);
      if (current.description) {
        console.log(`${colors.bold("Description:")} ${current.description}`);
      }
      console.log(`${colors.bold("Path:")} ${current.path}`);
      console.log(
        `${colors.bold("Created:")} ${current.createdAt.toLocaleDateString()}`,
      );
      console.log(
        `${
          colors.bold("Last accessed:")
        } ${current.lastAccessed.toLocaleDateString()}`,
      );
      console.log();
      return true;
    }

    case "help":
    default: {
      console.log(colors.blue("\n📂 Workspace Commands:"));
      console.log(`${colors.green("workspace list")} - List all workspaces`);
      console.log(
        `${colors.green("workspace create <name>")} - Create a new workspace`,
      );
      console.log(
        `${colors.green("workspace switch <name>")} - Switch to a workspace`,
      );
      console.log(
        `${colors.green("workspace current")} - Show current workspace info`,
      );
      console.log(
        `${colors.green("workspace delete <name>")} - Delete a workspace`,
      );
      console.log(`${colors.green("workspace help")} - Show this help`);
      console.log();
      return true;
    }
  }
}

// Export startChat function for use by launcher
export async function startChat() {
  while (true) {
    const userInput = prompt("You: ");

    if (!userInput) {
      continue;
    }

    if (userInput.toLowerCase() === "exit") {
      console.log(colors.yellow("👋 Goodbye!"));
      break;
    }
    if (userInput.toLowerCase() === "clear") {
      console.log(
        colors.green(
          "🧹 Conversation history cleared! (Note: Each request is independent with the new agent)",
        ),
      );
      continue;
    }
    if (userInput.toLowerCase() === "help") {
      console.log(`
📋 Available commands:
  - exit: Quit the application
  - clear: Clear conversation history
  - help: Show this help message
  - workspace: Manage workspaces (workspace help for details)
  
🌌 Andromeda Agent Capabilities:
  - Write TypeScript/JavaScript files
  - Execute files with Andromeda runtime
  - Read and manage workspace files
  - Create applications and scripts
  
💡 Example requests:
  - "Create a TypeScript file that calculates fibonacci numbers"
  - "Write a simple canvas rendered cat"
  - "Show me the files in the workspace"
  - "Create a calculator application"
      `);
      continue;
    }

    // Check if the input is a workspace command
    if (userInput.startsWith("workspace ")) {
      const workspaceArgs = userInput.slice("workspace ".length).trim().split(
        " ",
      );
      await handleWorkspaceCommand(workspaceArgs, workspaceManager);
      continue;
    }

    try {
      console.log("🤔 Thinking...");

      // Get AI response
      const response = await agent.chat(userInput);
      // Display response
      console.log(
        `\n${colors.blue.bold("🌌 Andromeda Agent:")} ${response.content}\n`,
      );

      // Show token usage
      if (response.usage) {
        console.log(
          colors.dim(
            `📊 Tokens: ${response.usage.totalTokens} (prompt: ${response.usage.promptTokens}, completion: ${response.usage.completionTokens})`,
          ),
        );
      }

      console.log(colors.dim("─".repeat(50)));
    } catch (error) {
      // Handle API key errors with mock response
      if (
        error instanceof Error && (
          error.message.includes("API_KEY_ERROR") ||
          error.message.includes("API key") ||
          error.message.includes("Incorrect API key") ||
          error.message.includes("invalid_api_key")
        )
      ) {
        console.log(
          `\n${
            colors.blue.bold("🌌 Andromeda Agent (Demo Mode):")
          } ⚠️ **Demo Mode**: Invalid OpenAI API key detected. Please set a valid OPENAI_API_KEY in your .env file to use the full functionality.

For now, this is a mock response to test the terminal interface. The agent would normally:
- Write and execute TypeScript files
- Use the Andromeda runtime  
- Access file system operations
- Provide real AI assistance

📋 To fix this, set your OpenAI API key in the .env file.\n`,
        );

        console.log(
          colors.dim("📊 Tokens: 150 (prompt: 50, completion: 100) [Mock]"),
        );
      } else {
        console.error(
          colors.red("❌ Error:"),
          error instanceof Error ? error.message : String(error),
        );
        console.log(colors.yellow("Please try again or check your API key."));
      }
    }
  }
}

if (import.meta.main) {
  await startChat();
}
