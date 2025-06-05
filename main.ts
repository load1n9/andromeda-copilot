import { AndromedaAgent } from "./agent.ts";

// Check for OpenAI API key
const apiKey = Deno.env.get("OPENAI_API_KEY") ||
  Deno.args.find((arg) => arg.startsWith("--api-key="))?.split("=")[1];
if (!apiKey) {
  console.error("❌ OPENAI_API_KEY environment variable is required");
  console.log("Please set your OpenAI API key:");
  console.log("export OPENAI_API_KEY=your_api_key_here");
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
  console.error("❌ Andromeda runtime is not installed or not in PATH");
  console.log("Please install Andromeda runtime:");
  console.log("cargo install --git https://github.com/tryandromeda/andromeda");
  Deno.exit(1);
}

// Create Andromeda agent with configuration
const agent = new AndromedaAgent({
  model: "gpt-4",
  temperature: 0.7,
  maxTokens: 2000,
  workspaceDir: "./workspace",
  apiKey,
});

console.log("🌌 Andromeda AI Agent started!");
console.log(
  "📝 I can write and execute TypeScript/JavaScript files using the Andromeda runtime",
);
console.log('💡 Type your requests below (type "exit" to quit)');
console.log('🧹 Type "clear" to clear conversation history');
console.log('❓ Type "help" for available commands');
console.log("─".repeat(60));

async function startChat() {
  while (true) {
    const userInput = prompt("You: ");

    if (!userInput) {
      continue;
    }

    if (userInput.toLowerCase() === "exit") {
      console.log("👋 Goodbye!");
      break;
    }
    if (userInput.toLowerCase() === "clear") {
      console.log(
        "🧹 Conversation history cleared! (Note: Each request is independent with the new agent)",
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
  - "Write a simple web server and execute it"
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
      console.log(`\n🌌 Andromeda Agent: ${response.content}\n`);

      // Show token usage
      if (response.usage) {
        console.log(
          `📊 Tokens: ${response.usage.totalTokens} (prompt: ${response.usage.promptTokens}, completion: ${response.usage.completionTokens})`,
        );
      }

      console.log("─".repeat(50));
    } catch (error) {
      console.error(
        "❌ Error:",
        error instanceof Error ? error.message : String(error),
      );
      console.log("Please try again or check your API key.");
    }
  }
}

// Start the chat application
if (import.meta.main) {
  await startChat();
}
