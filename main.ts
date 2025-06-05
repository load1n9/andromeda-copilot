import { AndromedaAgent } from "./agent.ts";
import { colors } from "https://deno.land/x/cliffy@v1.0.0-rc.7/ansi/colors.ts";

// Check for OpenAI API key
const apiKey = Deno.env.get("OPENAI_API_KEY") ||
  Deno.args.find((arg) => arg.startsWith("--api-key="))?.split("=")[1];
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

// Create Andromeda agent with configuration
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
  workspaceDir: Deno.args.find((arg) =>
    arg.startsWith("--workspace=")
  )?.split("=")[1] || "./workspace",
  apiKey,
});

console.log(colors.magenta.bold("🌌 Andromeda AI Agent started!"));
console.log(
  colors.blue("📝 I can write and execute TypeScript/JavaScript files using the Andromeda runtime"),
);
console.log(colors.green('💡 Type your requests below (type "exit" to quit)'));
console.log(colors.green('🧹 Type "clear" to clear conversation history'));
console.log(colors.green('❓ Type "help" for available commands'));
console.log(colors.dim("─".repeat(60)));

async function startChat() {
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
        colors.green("🧹 Conversation history cleared! (Note: Each request is independent with the new agent)"),
      );
      continue;
    }
    if (userInput.toLowerCase() === "help") {
      console.log(`
📋 Available commands:
  - exit: Quit the application
  - clear: Clear conversation history
  - help: Show this help message
  
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

    try {
      console.log("🤔 Thinking...");

      // Get AI response
      const response = await agent.chat(userInput);
      // Display response
      console.log(`\n${colors.blue.bold("🌌 Andromeda Agent:")} ${response.content}\n`);

      // Show token usage
      if (response.usage) {
        console.log(
          colors.dim(`📊 Tokens: ${response.usage.totalTokens} (prompt: ${response.usage.promptTokens}, completion: ${response.usage.completionTokens})`),
        );
      }

      console.log(colors.dim("─".repeat(50)));
    } catch (error) {
      console.error(
        colors.red("❌ Error:"),
        error instanceof Error ? error.message : String(error),
      );
      console.log(colors.yellow("Please try again or check your API key."));
    }
  }
}

if (import.meta.main) {
  await startChat();
}
