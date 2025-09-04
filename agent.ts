// deno-lint-ignore-file require-await
import { generateText, tool } from "ai";
import { createOpenAI, OpenAIProvider } from "@ai-sdk/openai";
import { z } from "zod";
import { colors } from "@cliffy/ansi/colors";
import { WorkspaceManager } from "./workspace-manager.ts";
import { AgentConfig, ExecutionResult, FileOperation } from "./types.ts";

export class AndromedaAgent {
  #config: AgentConfig;
  #workspaceDir: string;
  #openai: OpenAIProvider;
  #workspaceManager?: WorkspaceManager;

  constructor(config: AgentConfig) {
    this.#workspaceDir = config.workspaceDir || "./workspace";
    this.#workspaceManager = config.workspaceManager;
    this.#config = {
      temperature: 0.7,
      maxTokens: 3_096,
      ...config,
    };

    this.#openai = createOpenAI({
      apiKey: config.apiKey || Deno.env.get("OPENAI_API_KEY"),
    });
  }

  // Get current workspace directory
  getCurrentWorkspaceDir(): string {
    if (this.#workspaceManager) {
      const current = this.#workspaceManager.getCurrentWorkspace();
      return current?.path || this.#workspaceDir;
    }
    return this.#workspaceDir;
  }

  #getTools() {
    const logTask = (name: string, detail: string): void => {
      console.log(colors.dim(`[${name}] ${detail}`));
    };
    return {
      writeFile: tool({
        description: "Write content to a file in the workspace",
        parameters: z.object({
          path: z.string().describe(
            "The file path relative to the workspace directory",
          ),
          // Allow content as a single string or array of strings to avoid invalid argument errors
          content: z.union([z.string(), z.array(z.string())]).describe(
            "The content to write to the file, as a string or array of lines",
          ),
        }),
        execute: async (
          { path, content }: { path: string; content: string | string[] },
        ) => {
          logTask("writeFile", path);
          // Normalize content to string
          const fileContent = Array.isArray(content)
            ? content.join("\n")
            : content;
          return this.#executeFileOperation({
            type: "write",
            path,
            content: fileContent,
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
        execute: async ({ path }: { path: string }) => {
          logTask("readFile", path);
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
        execute: async ({ path }: { path: string }) => {
          logTask("deleteFile", path);
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
        execute: async ({ directory }: { directory: string }) => {
          logTask("listFiles", directory);
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
        execute: async ({ path, args }: { path: string; args: string[] }) => {
          logTask("executeFile", path);
          const result = await this.#executeCode(path, args);
          console.log(colors.green(`\n📦 Andromeda runtime output:`));
          console.log(colors.white(result.output));
          if (result.error) {
            console.log(colors.red(`\n📦 Andromeda runtime error:`));
            console.log(colors.red(result.error));
          }
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
        execute: async ({ path, args }: { path: string; args: string[] }) => {
          logTask("runAndDebug", path);
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
        execute: async ({ src, dest }: { src: string; dest: string }) => {
          logTask("copyFile", `${src} -> ${dest}`);
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
        execute: async ({ src, dest }: { src: string; dest: string }) => {
          logTask("moveFile", `${src} -> ${dest}`);
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
        execute: async ({ key }: { key: string }) => {
          logTask("getEnv", key);
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
        execute: async ({ key, value }: { key: string; value: string }) => {
          logTask("setEnv", key);
          Deno.env.set(key, value);
          return { success: true, output: `Set ${key}` };
        },
      }),
      removeEnv: tool({
        description: "Remove an environment variable",
        parameters: z.object({
          key: z.string().describe("Environment variable name"),
        }),
        execute: async ({ key }: { key: string }) => {
          logTask("removeEnv", key);
          Deno.env.delete(key);
          return { success: true, output: `Removed ${key}` };
        },
      }),
      listEnv: tool({
        description: "List all environment variables",
        parameters: z.object({}),
        execute: async (_params: Record<PropertyKey, never>) => {
          logTask("listEnv", "all vars");
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
        execute: async (
          { url, method, headers, body }: {
            url: string;
            method: string;
            headers?: Record<string, string>;
            body?: string;
          },
        ) => {
          logTask("fetchUrl", url);
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
        execute: async ({ command }: { command: string }) => {
          logTask("runShell", command);
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
        execute: async ({ config }: { config?: string }) => {
          logTask("typeCheck", config || "default");
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
      think: tool({
        description:
          "Use this tool to think through complex problems and log reasoning without making external changes. Use when complex reasoning or memory is needed.",
        parameters: z.object({
          thought: z.string().describe(
            "A thought or reasoning step to record in the log",
          ),
        }),
        execute: async ({ thought }: { thought: string }) => {
          console.log(
            colors.blue.bold(`🧠 [Agent Thought]`),
            colors.cyan(thought),
          );
          return {
            success: true,
            output: "Thought recorded in log",
          };
        },
      }),
      // New Andromeda APIs
      formatCode: tool({
        description: "Format TypeScript/JavaScript files using Andromeda's built-in formatter",
        parameters: z.object({
          paths: z.array(z.string()).describe("File paths to format (relative to workspace)"),
        }),
        execute: async ({ paths }: { paths: string[] }) => {
          logTask("formatCode", paths.join(", "));
          const fullPaths = paths.map(p => `${this.getCurrentWorkspaceDir()}/${p}`);
          const cmd = new Deno.Command("andromeda", {
            args: ["fmt", ...fullPaths],
            stdout: "piped",
            stderr: "piped",
            cwd: this.getCurrentWorkspaceDir(),
          });
          const proc = cmd.spawn();
          const { code, stdout, stderr } = await proc.output();
          const output = new TextDecoder().decode(stdout);
          const error = new TextDecoder().decode(stderr);
          return {
            success: code === 0,
            output: output || "Files formatted successfully",
            error: error || undefined,
          };
        },
      }),
      compileToExecutable: tool({
        description: "Compile a TypeScript/JavaScript file to a standalone executable using Andromeda",
        parameters: z.object({
          inputFile: z.string().describe("Input TypeScript/JavaScript file path"),
          outputFile: z.string().describe("Output executable file path"),
        }),
        execute: async ({ inputFile, outputFile }: { inputFile: string; outputFile: string }) => {
          logTask("compileToExecutable", `${inputFile} -> ${outputFile}`);
          const cmd = new Deno.Command("andromeda", {
            args: ["compile", inputFile, outputFile],
            stdout: "piped",
            stderr: "piped",
            cwd: this.getCurrentWorkspaceDir(),
          });
          const proc = cmd.spawn();
          const { code, stdout, stderr } = await proc.output();
          const output = new TextDecoder().decode(stdout);
          const error = new TextDecoder().decode(stderr);
          return {
            success: code === 0,
            output: output || `Compiled ${inputFile} to ${outputFile}`,
            error: error || undefined,
          };
        },
      }),
      lintCode: tool({
        description: "Run Andromeda's Language Server Protocol linting on files",
        parameters: z.object({
          paths: z.array(z.string()).describe("File paths to lint (relative to workspace)"),
        }),
        execute: async ({ paths }: { paths: string[] }) => {
          logTask("lintCode", paths.join(", "));
          const cmd = new Deno.Command("andromeda", {
            args: ["check", ...paths],
            stdout: "piped",
            stderr: "piped",
            cwd: this.getCurrentWorkspaceDir(),
          });
          const proc = cmd.spawn();
          const { code, stdout, stderr } = await proc.output();
          const output = new TextDecoder().decode(stdout);
          const error = new TextDecoder().decode(stderr);
          return {
            success: code === 0,
            output: output || "No linting issues found",
            error: error || undefined,
          };
        },
      }),
      runTask: tool({
        description: "Run a predefined task from andromeda.json/toml/yaml configuration",
        parameters: z.object({
          taskName: z.string().describe("Name of the task to run"),
        }),
        execute: async ({ taskName }: { taskName: string }) => {
          logTask("runTask", taskName);
          const cmd = new Deno.Command("andromeda", {
            args: ["task", taskName],
            stdout: "piped",
            stderr: "piped",
            cwd: this.getCurrentWorkspaceDir(),
          });
          const proc = cmd.spawn();
          const { code, stdout, stderr } = await proc.output();
          const output = new TextDecoder().decode(stdout);
          const error = new TextDecoder().decode(stderr);
          return {
            success: code === 0,
            output: output || `Task ${taskName} completed`,
            error: error || undefined,
          };
        },
      }),
      listTasks: tool({
        description: "List all available tasks from configuration",
        parameters: z.object({}),
        execute: async () => {
          logTask("listTasks", "all");
          const cmd = new Deno.Command("andromeda", {
            args: ["task"],
            stdout: "piped",
            stderr: "piped",
            cwd: this.getCurrentWorkspaceDir(),
          });
          const proc = cmd.spawn();
          const { code, stdout, stderr } = await proc.output();
          const output = new TextDecoder().decode(stdout);
          const error = new TextDecoder().decode(stderr);
          return {
            success: code === 0,
            output: output || "No tasks found",
            error: error || undefined,
          };
        },
      }),
      startRepl: tool({
        description: "Start an interactive REPL session with Andromeda",
        parameters: z.object({
          options: z.object({
            exposeInternals: z.boolean().default(false),
            printInternals: z.boolean().default(false),
            disableGc: z.boolean().default(false),
          }).default({}),
        }),
        execute: async ({ options }: { options: { exposeInternals?: boolean; printInternals?: boolean; disableGc?: boolean } }) => {
          logTask("startRepl", "interactive session");
          const args = ["repl"];
          if (options.exposeInternals) args.push("--expose-internals");
          if (options.printInternals) args.push("--print-internals");
          if (options.disableGc) args.push("--disable-gc");
          
          return {
            success: true,
            output: `REPL would start with: andromeda ${args.join(" ")}\nNote: Interactive REPL cannot be started from this context.`,
          };
        },
      }),
      createImportMap: tool({
        description: "Create or update an import map configuration for modern module resolution",
        parameters: z.object({
          imports: z.record(z.string(), z.string()).describe("Import map entries"),
          configFile: z.string().default("andromeda.json").describe("Configuration file name"),
        }),
        execute: async ({ imports, configFile }: { imports: Record<string, string>; configFile: string }) => {
          logTask("createImportMap", configFile);
          const configPath = `${this.getCurrentWorkspaceDir()}/${configFile}`;
          
          let config = {};
          try {
            const existing = await Deno.readTextFile(configPath);
            config = JSON.parse(existing);
          } catch {
            // File doesn't exist or is invalid, start fresh
          }
          
          const updatedConfig = {
            ...config,
            imports: {
              ...(config as any).imports || {},
              ...imports,
            },
          };
          
          await Deno.writeTextFile(configPath, JSON.stringify(updatedConfig, null, 2));
          
          return {
            success: true,
            output: `Import map updated in ${configFile}`,
          };
        },
      }),
      createConfiguration: tool({
        description: "Create or update Andromeda configuration file with tasks, import maps, and settings",
        parameters: z.object({
          config: z.object({
            tasks: z.record(z.string(), z.union([
              z.string(),
              z.object({
                description: z.string().optional(),
                command: z.string(),
                env: z.record(z.string(), z.string()).optional(),
                dependencies: z.array(z.string()).optional(),
                cwd: z.string().optional(),
              })
            ])).optional(),
            imports: z.record(z.string(), z.string()).optional(),
            exclude: z.array(z.string()).optional(),
            include: z.array(z.string()).optional(),
          }),
          configFile: z.string().default("andromeda.json").describe("Configuration file name"),
        }),
        execute: async ({ config, configFile }: { config: Record<string, unknown>; configFile: string }) => {
          logTask("createConfiguration", configFile);
          const configPath = `${this.getCurrentWorkspaceDir()}/${configFile}`;
          
          let existingConfig = {};
          try {
            const existing = await Deno.readTextFile(configPath);
            existingConfig = JSON.parse(existing);
          } catch {
            // File doesn't exist or is invalid, start fresh
          }
          
          const updatedConfig = {
            ...existingConfig,
            ...config,
          };
          
          await Deno.writeTextFile(configPath, JSON.stringify(updatedConfig, null, 2));
          
          return {
            success: true,
            output: `Configuration updated in ${configFile}`,
          };
        },
      }),
      diagnostics: tool({
        description: "Get comprehensive diagnostics for TypeScript/JavaScript files using Andromeda's LSP",
        parameters: z.object({
          files: z.array(z.string()).describe("File paths to analyze"),
          includeWarnings: z.boolean().default(true),
          includeHints: z.boolean().default(false),
        }),
        execute: async ({ files, includeWarnings: _includeWarnings, includeHints: _includeHints }: { files: string[]; includeWarnings: boolean; includeHints: boolean }) => {
          logTask("diagnostics", files.join(", "));
          
          // Use andromeda check for comprehensive analysis
          const cmd = new Deno.Command("andromeda", {
            args: ["check", "--verbose", ...files],
            stdout: "piped",
            stderr: "piped",
            cwd: this.getCurrentWorkspaceDir(),
          });
          const proc = cmd.spawn();
          const { code: _code, stdout, stderr } = await proc.output();
          const output = new TextDecoder().decode(stdout);
          const error = new TextDecoder().decode(stderr);
          
          return {
            success: true, // Always return diagnostics even if there are issues
            output: `Diagnostics for ${files.join(", ")}:\n${output}\n${error}`,
          };
        },
      }),
      upgradeAndromeda: tool({
        description: "Upgrade Andromeda runtime to the latest version",
        parameters: z.object({
          force: z.boolean().default(false).describe("Force upgrade even if already latest"),
          version: z.string().optional().describe("Specific version to upgrade to"),
          dryRun: z.boolean().default(false).describe("Preview what would be upgraded"),
        }),
        execute: async ({ force, version, dryRun }: { force: boolean; version?: string; dryRun: boolean }) => {
          logTask("upgradeAndromeda", version || "latest");
          const args = ["upgrade"];
          if (force) args.push("--force");
          if (version) args.push("--version", version);
          if (dryRun) args.push("--dry-run");
          
          const cmd = new Deno.Command("andromeda", {
            args,
            stdout: "piped",
            stderr: "piped",
          });
          const proc = cmd.spawn();
          const { code, stdout, stderr } = await proc.output();
          const output = new TextDecoder().decode(stdout);
          const error = new TextDecoder().decode(stderr);
          
          return {
            success: code === 0,
            output: output || `Andromeda upgrade ${dryRun ? "preview" : "completed"}`,
            error: error || undefined,
          };
        },
      }),
      generateCompletions: tool({
        description: "Generate shell completion scripts for Andromeda",
        parameters: z.object({
          shell: z.enum(["bash", "zsh", "fish", "powershell"]).optional(),
          outputFile: z.string().optional().describe("File to save completions to"),
        }),
        execute: async ({ shell, outputFile }: { shell?: string; outputFile?: string }) => {
          logTask("generateCompletions", shell || "auto-detect");
          const args = ["completions"];
          if (shell) args.push(shell);
          
          const cmd = new Deno.Command("andromeda", {
            args,
            stdout: "piped",
            stderr: "piped",
          });
          const proc = cmd.spawn();
          const { code, stdout, stderr } = await proc.output();
          const output = new TextDecoder().decode(stdout);
          const error = new TextDecoder().decode(stderr);
          
          if (outputFile && code === 0) {
            const outputPath = `${this.getCurrentWorkspaceDir()}/${outputFile}`;
            await Deno.writeTextFile(outputPath, output);
          }
          
          return {
            success: code === 0,
            output: outputFile ? `Completions saved to ${outputFile}` : output,
            error: error || undefined,
          };
        },
      }),
      performanceBenchmark: tool({
        description: "Run a performance benchmark on a TypeScript/JavaScript file",
        parameters: z.object({
          path: z.string().describe("File path to benchmark"),
          iterations: z.number().default(1).describe("Number of iterations to run"),
          warmup: z.boolean().default(true).describe("Run warmup iterations"),
        }),
        execute: async ({ path, iterations, warmup }: { path: string; iterations: number; warmup: boolean }) => {
          logTask("performanceBenchmark", `${path} x${iterations}`);
          
          const results: Array<{ iteration: number; duration: number; success: boolean; output?: string; error?: string }> = [];
          
          // Warmup run
          if (warmup) {
            await this.#executeCode(path, []);
          }
          
          for (let i = 0; i < iterations; i++) {
            const start = performance.now();
            const result = await this.#executeCode(path, []);
            const duration = performance.now() - start;
            
            results.push({
              iteration: i + 1,
              duration,
              success: result.success,
              output: result.output,
              error: result.error,
            });
          }
          
          const successfulRuns = results.filter(r => r.success);
          const avgDuration = successfulRuns.reduce((sum, r) => sum + r.duration, 0) / successfulRuns.length;
          const minDuration = Math.min(...successfulRuns.map(r => r.duration));
          const maxDuration = Math.max(...successfulRuns.map(r => r.duration));
          
          return {
            success: true,
            output: `Performance Benchmark Results for ${path}:
Iterations: ${iterations}
Successful runs: ${successfulRuns.length}/${iterations}
Average duration: ${avgDuration.toFixed(2)}ms
Min duration: ${minDuration.toFixed(2)}ms
Max duration: ${maxDuration.toFixed(2)}ms

Individual results:
${results.map(r => `  Run ${r.iteration}: ${r.duration.toFixed(2)}ms ${r.success ? '✓' : '✗'}`).join('\n')}`,
          };
        },
      }),
      profileExecution: tool({
        description: "Profile execution of a TypeScript/JavaScript file with detailed metrics",
        parameters: z.object({
          path: z.string().describe("File path to profile"),
          enableGcStats: z.boolean().default(false).describe("Enable garbage collection statistics"),
          enableMemoryStats: z.boolean().default(false).describe("Enable memory usage statistics"),
        }),
        execute: async ({ path, enableGcStats, enableMemoryStats }: { path: string; enableGcStats: boolean; enableMemoryStats: boolean }) => {
          logTask("profileExecution", path);
          
          const args = ["run"];
          if (enableGcStats) args.push("--print-internals");
          if (enableMemoryStats) args.push("--verbose");
          args.push(path);
          
          const cmd = new Deno.Command("andromeda", {
            args,
            stdout: "piped",
            stderr: "piped",
            cwd: this.getCurrentWorkspaceDir(),
          });
          
          const start = performance.now();
          const proc = cmd.spawn();
          const { code, stdout, stderr } = await proc.output();
          const duration = performance.now() - start;
          
          const output = new TextDecoder().decode(stdout);
          const error = new TextDecoder().decode(stderr);
          
          return {
            success: code === 0,
            output: `Execution Profile for ${path}:
Total execution time: ${duration.toFixed(2)}ms
Exit code: ${code}

Standard Output:
${output}

${error ? `Diagnostic Information:\n${error}` : ''}`,
            error: code !== 0 ? error : undefined,
          };
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
6. formatCode - Format code using Andromeda's built-in formatter
7. compileToExecutable - Compile TypeScript/JavaScript to standalone executables
8. lintCode - Run Andromeda's LSP linting on files
9. runTask - Execute predefined tasks from configuration
10. listTasks - List all available tasks
11. startRepl - Information about starting interactive REPL
12. createImportMap - Create/update import maps for modern module resolution

The Andromeda runtime is a modern JavaScript/TypeScript runtime written in Rust that provides the following built-in APIs:

**File System Operations:**
- Andromeda.readTextFileSync(path: string): string - Read text files synchronously
- Andromeda.writeTextFileSync(path: string, data: string): void - Write text files synchronously
- Andromeda.readFile(path: string): Promise<Uint8Array> - Read binary files asynchronously
- Andromeda.writeFile(path: string, data: Uint8Array): Promise<void> - Write binary files asynchronously
- Andromeda.copyFile(src: string, dest: string): Promise<void> - Copy files
- Andromeda.rename(oldPath: string, newPath: string): Promise<void> - Rename/move files
- Andromeda.remove(path: string): Promise<void> - Remove files/directories
- Andromeda.mkdir(path: string): Promise<void> - Create directories
- Andromeda.stat(path: string): Promise<FileInfo> - Get file information

**Environment & Process:**
- Andromeda.args: string[] - Access command-line arguments
- Andromeda.exit(code?: number): void - Exit the program
- Andromeda.sleep(duration: number): Promise<void> - Async sleep function

**Environment Variables:**
- Andromeda.env.get(key: string): string - Get environment variable
- Andromeda.env.set(key: string, value: string): void - Set environment variable
- Andromeda.env.remove(key: string): void - Remove environment variable
- Andromeda.env.keys(): string[] - Get all environment variable keys

**Canvas/Graphics (GPU-Accelerated with WGPU):**
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

**SQLite Database Support:**
- Database class for SQLite operations:
  - new Database(path: string) - Open/create database
  - db.prepare(sql: string): Statement - Prepare SQL statement
  - statement.run(...params): RunResult - Execute statement
  - statement.get(...params): any - Get single row
  - statement.all(...params): any[] - Get all rows
  - db.close(): void - Close database

**Web Storage APIs:**
- localStorage and sessionStorage for data persistence:
  - localStorage.setItem(key: string, value: string): void
  - localStorage.getItem(key: string): string | null
  - localStorage.removeItem(key: string): void
  - localStorage.clear(): void
  - localStorage.length: number
  - localStorage.key(index: number): string | null

**Web Crypto API:**
- crypto.randomUUID(): string - Generate UUID
- crypto.getRandomValues(array: TypedArray): TypedArray - Fill with random values
- crypto.subtle.digest(algorithm: string, data: BufferSource): Promise<ArrayBuffer> - Hash data
- crypto.subtle.generateKey(...): Promise<CryptoKey> - Generate cryptographic keys
- crypto.subtle.encrypt/decrypt/sign/verify operations

**Performance API:**
- performance.now(): number - High-precision timestamp
- performance.mark(name: string): void - Create performance mark
- performance.measure(name: string, startMark?: string, endMark?: string): void - Measure performance
- performance.timeOrigin: number - Time origin for performance measurements

**Web Standards:**
- TextEncoder/TextDecoder for text encoding
- navigator.userAgent and platform detection
- queueMicrotask(callback: Function): void - Schedule microtasks
- URL and URLSearchParams for URL manipulation
- fetch() for HTTP requests
- setTimeout/setInterval/clearTimeout/clearInterval for timing

**Input/Output:**
- console and all its apis are implemented
- Andromeda.stdin.readLine(): string - Read line from standard input
- Andromeda.stdout.write(message: string): void - Write to standard output
- prompt(message: string): string - Prompt user for input
- confirm(message: string): boolean - Prompt user for confirmation

**Testing Utilities:**
- assert(condition: boolean, message: string): void
- assertEquals<T>(value1: T, value2: T, message: string): void
- assertNotEquals<T>(value1: T, value2: T, message: string): void
- assertThrows(fn: () => void, message: string): void

**Task System:**
Andromeda supports a powerful task system through configuration files (andromeda.json, andromeda.toml, or andromeda.yaml):
- Define custom tasks with commands, descriptions, environment variables
- Support task dependencies and execution order
- Run tasks with 'andromeda task <name>'

**Import Maps:**
Modern module resolution with bare specifiers:
- Configure import maps in andromeda.json
- Support for CDN integration and local modules
- Bare specifier resolution (e.g., import from "lodash")

When creating TypeScript files for Andromeda:
- Use these built-in APIs instead of Node.js or Deno APIs
- No need to import anything - all APIs are globally available
- Focus on TypeScript features and modern JavaScript syntax
- Use the console object for debugging (console.log, etc.)
- Take advantage of GPU-accelerated Canvas for graphics
- Use SQLite for data persistence
- Leverage Web Storage for client-side data
- Use Web Crypto for security operations
- Implement performance monitoring with the Performance API

IMPORTANT: When calling tools, always use proper JSON formatting. For multi-line content in the writeFile tool, use proper JSON string escaping with \\n for newlines, not template literals or backticks.
Andromeda does not support the ! TypeScript feature for non-null assertions, so avoid using it in your code.
Current workspace directory: ${this.getCurrentWorkspaceDir()}

When you use tools, always explain what you're doing and show the results to the user.`;

      console.log(
        colors.green.bold("🧠 [Thought]"),
        colors.dim("System prompt snippet:"),
      );
      console.log(colors.gray(systemPrompt.slice(0, 200) + "..."));
      console.log(
        colors.green.bold("🧠 [Thought]"),
        colors.dim("User message:"),
      );
      console.log(colors.yellow(userMessage));
      console.log(colors.magenta("🤔 Thinking..."));

      const result = await generateText({
        model: this.#openai(this.#config.model || "gpt-4"),
        system: systemPrompt,
        prompt: userMessage,
        tools: this.#getTools(),
        maxSteps: 20,
        temperature: this.#config.temperature,
        maxTokens: this.#config.maxTokens,
        toolChoice: "auto",
      });

      console.log(
        colors.green.bold("🧠 [Thought]"),
        colors.dim("AI raw response:"),
      );
      console.log(colors.gray(result.text));

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

      if (
        error instanceof Error && (
          error.message.includes("API key") ||
          error.message.includes("Incorrect API key") ||
          error.message.includes("invalid_api_key")
        )
      ) {
        throw new Error(`API_KEY_ERROR: ${error.message}`);
      }

      throw new Error("Failed to generate AI response");
    }
  }

  async #executeFileOperation(
    operation: FileOperation,
  ): Promise<ExecutionResult> {
    const workspaceDir = this.getCurrentWorkspaceDir();
    const fullPath = `${workspaceDir}/${operation.path}`;

    try {
      switch (operation.type) {
        case "write":
          await Deno.mkdir(workspaceDir, { recursive: true });
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

        case "list": {
          const files: string[] = [];
          const listPath = operation.path === "." ? workspaceDir : fullPath;

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
