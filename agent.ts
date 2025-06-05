// deno-lint-ignore-file require-await
import { generateText, tool } from "ai";
import { createOpenAI, OpenAIProvider } from "@ai-sdk/openai";
import { z } from "zod";
import { AgentConfig, ExecutionResult, FileOperation } from "./types.ts";

export class AndromedaAgent {
  #config: AgentConfig;
  #workspaceDir: string;
  #openai: OpenAIProvider;

  constructor(config: AgentConfig) {
    this.#workspaceDir = config.workspaceDir || "./workspace";
    this.#config = {
      temperature: 0.7,
      maxTokens: 2000,
      ...config,
    };

    this.#openai = createOpenAI({
      apiKey: config.apiKey || Deno.env.get("OPENAI_API_KEY"),
    });
  }

  #getTools() {
    return {
      writeFile: tool({
        description: "Write content to a file in the workspace",
        parameters: z.object({
          path: z.string().describe(
            "The file path relative to the workspace directory",
          ),
          content: z.string().describe("The content to write to the file"),
        }),
        execute: async ({ path, content }) => {
          return this.#executeFileOperation({
            type: "write",
            path,
            content,
          });
        },
      }),
      readFile: tool({
        description: "Read the content of a file from the workspace",
        parameters: z.object({
          path: z.string().describe(
            "The file path relative to the workspace directory",
          ),
        }),
        execute: async ({ path }) => {
          return this.#executeFileOperation({
            type: "read",
            path,
          });
        },
      }),
      deleteFile: tool({
        description: "Delete a file from the workspace",
        parameters: z.object({
          path: z.string().describe(
            "The file path relative to the workspace directory",
          ),
        }),
        execute: async ({ path }) => {
          return this.#executeFileOperation({
            type: "delete",
            path,
          });
        },
      }),
      listFiles: tool({
        description: "List files in the workspace directory",
        parameters: z.object({
          directory: z.string().describe(
            "The directory path relative to the workspace directory (optional, defaults to root)",
          ).default("."),
        }),
        execute: async ({ directory }) => {
          return this.#executeFileOperation({
            type: "list",
            path: directory,
          });
        },
      }),
      executeFile: tool({
        description:
          "Execute a TypeScript/JavaScript file using the Andromeda runtime",
        parameters: z.object({
          path: z.string().describe(
            "The file path relative to the workspace directory",
          ),
          args: z.array(z.string()).describe(
            "Command line arguments to pass to the file (optional)",
          ).default([]),
        }),
        execute: async ({ path, args }) => {
          const result = await this.#executeCode(path, args);
          return {
            success: result.success,
            output: result.output +
              (result.error ? `\nERROR:\n${result.error}` : ""),
          };
        },
      }),
      runAndDebug: tool({
        description:
          "Run a file with Andromeda and return stdout and stderr for manual refactoring",
        parameters: z.object({
          path: z.string().describe("File path relative to workspace"),
          args: z.array(z.string()).default([]).describe(
            "Arguments to pass to the file",
          ),
        }),
        execute: async ({ path, args }) => {
          const result = await this.#executeCode(path, args);
          return {
            success: result.success,
            output: `STDOUT:\n${result.output}\nSTDERR:\n${result.error || ""}`,
          };
        },
      }),
      copyFile: tool({
        description: "Copy a file from one path to another in the workspace",
        parameters: z.object({
          src: z.string().describe("Source file path relative to workspace"),
          dest: z.string().describe(
            "Destination file path relative to workspace",
          ),
        }),
        execute: async ({ src, dest }) => {
          const fullSrc = `${this.#workspaceDir}/${src}`;
          const fullDest = `${this.#workspaceDir}/${dest}`;
          await Deno.copyFile(fullSrc, fullDest);
          return {
            success: true,
            output: `File copied from ${src} to ${dest}`,
          };
        },
      }),
      moveFile: tool({
        description: "Move or rename a file in the workspace",
        parameters: z.object({
          src: z.string().describe("Source file path relative to workspace"),
          dest: z.string().describe(
            "Destination file path relative to workspace",
          ),
        }),
        execute: async ({ src, dest }) => {
          const fullSrc = `${this.#workspaceDir}/${src}`;
          const fullDest = `${this.#workspaceDir}/${dest}`;
          await Deno.rename(fullSrc, fullDest);
          return { success: true, output: `File moved from ${src} to ${dest}` };
        },
      }),
      getEnv: tool({
        description: "Get an environment variable value",
        parameters: z.object({
          key: z.string().describe("Environment variable name"),
        }),
        execute: async ({ key }) => {
          const value = Deno.env.get(key) || "";
          return { success: true, output: value };
        },
      }),
      setEnv: tool({
        description: "Set an environment variable",
        parameters: z.object({
          key: z.string().describe("Environment variable name"),
          value: z.string().describe("Value to set"),
        }),
        execute: async ({ key, value }) => {
          Deno.env.set(key, value);
          return { success: true, output: `Set ${key}` };
        },
      }),
      removeEnv: tool({
        description: "Remove an environment variable",
        parameters: z.object({
          key: z.string().describe("Environment variable name"),
        }),
        execute: async ({ key }) => {
          Deno.env.delete(key);
          return { success: true, output: `Removed ${key}` };
        },
      }),
      listEnv: tool({
        description: "List all environment variables",
        parameters: z.object({}),
        execute: async () => {
          const keys = Deno.env.toObject();
          const listing = Object.entries(keys)
            .map(([k, v]) => `${k}=${v}`)
            .join("\n");
          return { success: true, output: listing };
        },
      }),
      fetchUrl: tool({
        description: "Fetch content from a URL",
        parameters: z.object({
          url: z.string().describe("HTTP URL to fetch"),
          method: z.string().default("GET"),
          headers: z.record(z.string(), z.string()).optional(),
          body: z.string().optional(),
        }),
        execute: async ({ url, method, headers, body }) => {
          const res = await fetch(url, { method, headers, body });
          const text = await res.text();
          return { success: true, output: `Status: ${res.status}\n${text}` };
        },
      }),
      runShell: tool({
        description: "Run a shell command in the workspace",
        parameters: z.object({
          command: z.string().describe("Command to run"),
        }),
        execute: async ({ command }) => {
          const shell = Deno.env.get("SHELL") || "pwsh.exe";
          const args = shell.toLowerCase().includes("pwsh")
            ? ["-Command", command]
            : ["-c", command];
          const cmd = new Deno.Command(shell, {
            args,
            stdout: "piped",
            stderr: "piped",
          });
          const proc = cmd.spawn();
          const { code, stdout, stderr } = await proc.output();
          const outTxt = new TextDecoder().decode(stdout);
          const errTxt = new TextDecoder().decode(stderr);
          if (code === 0) {
            return { success: true, output: outTxt };
          }
          return { success: false, output: outTxt, error: errTxt };
        },
      }),
      typeCheck: tool({
        description: "Type-check the workspace using Deno",
        parameters: z.object({
          config: z.string().optional().describe(
            "Optional deno.json path relative to workspace",
          ),
        }),
        execute: async ({ config }) => {
          const cmd = new Deno.Command("deno", {
            args: [
              "check",
              ...(config
                ? ["--config", `${this.#workspaceDir}/${config}`]
                : []),
              ".",
            ],
            stdout: "piped",
            stderr: "piped",
          });
          const proc = cmd.spawn();
          const { code, stdout, stderr } = await proc.output();
          const output = new TextDecoder().decode(stdout) +
            new TextDecoder().decode(stderr);
          return { success: code === 0, output };
        },
      }),
    };
  }

  async chat(userMessage: string): Promise<{
    content: string;
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
  }> {
    try {
      const systemPrompt =
        `You are an AI agent that can control the Andromeda runtime and write TypeScript files.

You have access to tools that allow you to:
1. writeFile - Create or update TypeScript/JavaScript files in the workspace
2. readFile - Read existing files from the workspace
3. deleteFile - Delete files from the workspace
4. listFiles - List files in the workspace directory
5. executeFile - Execute TypeScript/JavaScript files using the Andromeda runtime

The Andromeda runtime is a JavaScript/TypeScript runtime written in Rust that provides the following built-in APIs:

**File System Operations:**
- Andromeda.readTextFileSync(path: string): string - Read text files synchronously
- Andromeda.writeTextFileSync(path: string, data: string): void - Write text files synchronously

**Environment & Process:**
- Andromeda.args: string[] - Access command-line arguments
- Andromeda.exit(code?: number): void - Exit the program
- Andromeda.sleep(duration: number): Promise<void> - Async sleep function

**Environment Variables:**
- Andromeda.env.get(key: string): string - Get environment variable
- Andromeda.env.set(key: string, value: string): void - Set environment variable
- Andromeda.env.remove(key: string): void - Remove environment variable
- Andromeda.env.keys(): string[] - Get all environment variable keys

**Input/Output:**
- console and all its apis are implemented
- Andromeda.stdin.readLine(): string - Read line from standard input
- Andromeda.stdout.write(message: string): void - Write to standard output
- prompt(message: string): string - Prompt user for input
- confirm(message: string): boolean - Prompt user for confirmation

**Canvas/Graphics:**
- OffscreenCanvas class for 2D graphics rendering:
  - new OffscreenCanvas(width: number, height: number) - Create canvas with dimensions
  - canvas.getWidth(): number - Get canvas width
  - canvas.getHeight(): number - Get canvas height
  - canvas.getContext("2d"): CanvasRenderingContext2D | null - Get 2D rendering context
  - canvas.render(): boolean - Finalize GPU operations and extract pixel data
  - canvas.saveAsPng(path: string): boolean - Save canvas as PNG image file

- CanvasRenderingContext2D drawing operations:
  - Properties: fillStyle, strokeStyle, lineWidth, globalAlpha (0.0-1.0 transparency)
  - Rectangles: fillRect(x, y, width, height), clearRect(x, y, width, height), rect(x, y, width, height)
  - Paths: beginPath(), closePath(), moveTo(x, y), lineTo(x, y), fill(), stroke()
  - Shapes: arc(x, y, radius, startAngle, endAngle), ellipse(x, y, radiusX, radiusY, rotation, startAngle, endAngle, counterclockwise?)
  - Curves: bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y), quadraticCurveTo(cpx, cpy, x, y), arcTo(x1, y1, x2, y2, radius)
  - Advanced: roundRect(x, y, w, h, radii), save(), restore()

- ImageBitmap for image handling:
  - createImageBitmap(path: string): Promise<ImageBitmap> - Load images from file path
  - ImageBitmap.width: number, ImageBitmap.height: number - Image dimensions

**Testing Utilities:**
- assert(condition: boolean, message: string): void
- assertEquals<T>(value1: T, value2: T, message: string): void
- assertNotEquals<T>(value1: T, value2: T, message: string): void
- assertThrows(fn: () => void, message: string): void

When creating TypeScript files for Andromeda:
- Use these built-in APIs instead of Node.js or Deno APIs
- No need to import anything - all APIs are globally available
- Focus on TypeScript features and modern JavaScript syntax
- Use the console object for debugging (console.log, etc.)

IMPORTANT: When calling tools, always use proper JSON formatting. For multi-line content in the writeFile tool, use proper JSON string escaping with \\n for newlines, not template literals or backticks.
Andromeda does not support the ! TypeScript feature for non-null assertions, so avoid using it in your code.
Current workspace directory: ${this.#workspaceDir}

When you use tools, always explain what you're doing and show the results to the user.`;
      const result = await generateText({
        model: this.#openai(this.#config.model || "gpt-4"),
        system: systemPrompt,
        prompt: userMessage,
        tools: this.#getTools(),
        maxSteps: 10,
        temperature: this.#config.temperature,
        maxTokens: this.#config.maxTokens,
        toolChoice: "auto",
      });

      return {
        content: result.text,
        usage: result.usage
          ? {
            promptTokens: result.usage.promptTokens,
            completionTokens: result.usage.completionTokens,
            totalTokens: result.usage.totalTokens,
          }
          : undefined,
      };
    } catch (error) {
      console.error("Error generating response:", error);
      throw new Error("Failed to generate AI response");
    }
  }

  async #executeFileOperation(
    operation: FileOperation,
  ): Promise<ExecutionResult> {
    const fullPath = `${this.#workspaceDir}/${operation.path}`;

    try {
      switch (operation.type) {
        case "write":
          await Deno.mkdir(this.#workspaceDir, { recursive: true });
          await Deno.writeTextFile(fullPath, operation.content!);
          return {
            success: true,
            output: `File written successfully: ${operation.path}`,
          };

        case "read": {
          const content = await Deno.readTextFile(fullPath);
          return {
            success: true,
            output: content,
          };
        }

        case "delete":
          await Deno.remove(fullPath);
          return {
            success: true,
            output: `File deleted successfully: ${operation.path}`,
          };

        case "append": {
          await Deno.mkdir(this.#workspaceDir, { recursive: true });
          
          let existingContent = "";
          try {
            existingContent = await Deno.readTextFile(fullPath);
          } catch (_) {
            // File doesn't exist yet, will create new
          }
          
          const newContent = existingContent + operation.content!;
          await Deno.writeTextFile(fullPath, newContent);
          
          return {
            success: true,
            output: `Content appended successfully to: ${operation.path}`,
          };
        }

        case "list": {
          const files: string[] = [];
          const listPath = operation.path === "."
            ? this.#workspaceDir
            : fullPath;

          try {
            for await (const dirEntry of Deno.readDir(listPath)) {
              if (dirEntry.isFile) {
                files.push(dirEntry.name);
              } else if (dirEntry.isDirectory) {
                files.push(`${dirEntry.name}/`);
              }
            }
            return {
              success: true,
              output: files.length > 0
                ? files.join("\n")
                : "No files in workspace",
            };
          } catch (_) {
            // Directory doesn't exist, create it and return empty
            await Deno.mkdir(listPath, { recursive: true });
            return {
              success: true,
              output: "No files in workspace (directory created)",
            };
          }
        }

        default:
          return {
            success: false,
            output: "",
            // deno-lint-ignore no-explicit-any
            error: `Unknown operation type: ${(operation as any).type}`,
          };
      }
    } catch (error) {
      return {
        success: false,
        output: "",
        error: `Failed to execute ${operation.type} operation: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  }

  async #executeCode(
    path: string,
    args: string[] = [],
  ): Promise<ExecutionResult> {
    try {
      const fullPath = `${this.#workspaceDir}/${path}`;
      const startTime = Date.now();

      const command = new Deno.Command("andromeda", {
        args: ["run", fullPath, ...args],
        stdout: "piped",
        stderr: "piped",
      });

      const process = command.spawn();
      const { code, stdout, stderr } = await process.output();

      const duration = Date.now() - startTime;
      const output = new TextDecoder().decode(stdout);
      const errorOutput = new TextDecoder().decode(stderr);

      if (code === 0) {
        return {
          success: true,
          output: output || "Execution completed successfully",
          duration,
        };
      } else {
        return {
          success: false,
          output: output,
          error: errorOutput || "Execution failed",
          duration,
        };
      }
    } catch (error) {
      return {
        success: false,
        output: "",
        error: `Failed to execute file: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  }
}
