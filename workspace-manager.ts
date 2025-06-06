import { colors } from "@cliffy/ansi/colors";
import { Workspace, WorkspaceConfig } from "./types.ts";

function existsSync(path: string): boolean {
  try {
    Deno.statSync(path);
    return true;
  } catch {
    return false;
  }
}

function join(...paths: string[]): string {
  return paths.join("/").replace(/\/+/g, "/");
}

export class WorkspaceManager {
  #configPath: string;
  #config: WorkspaceConfig;
  #defaultWorkspacePath: string;

  constructor(configDir: string = "./workspaces") {
    this.#defaultWorkspacePath = configDir;
    this.#configPath = join(configDir, "workspaces.json");
    this.#config = this.#loadConfig();
  }

  #loadConfig(): WorkspaceConfig {
    try {
      if (existsSync(this.#configPath)) {
        const configText = Deno.readTextFileSync(this.#configPath);
        const parsedConfig = JSON.parse(configText);
        parsedConfig.workspaces = parsedConfig.workspaces.map((
          w: Workspace,
        ) => ({
          ...w,
          createdAt: new Date(w.createdAt),
          lastAccessed: new Date(w.lastAccessed),
        }));

        return parsedConfig;
      }
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);
      console.warn(
        colors.yellow(
          `Warning: Could not load workspace config: ${errorMessage}`,
        ),
      );
    }

    return {
      workspaces: [],
      defaultWorkspacePath: this.#defaultWorkspacePath,
    };
  }

  #saveConfig(): void {
    try {
      const configDir = this.#configPath.substring(
        0,
        this.#configPath.lastIndexOf("/"),
      );
      if (!existsSync(configDir)) {
        Deno.mkdirSync(configDir, { recursive: true });
      }

      Deno.writeTextFileSync(
        this.#configPath,
        JSON.stringify(this.#config, null, 2),
      );
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);
      console.error(
        colors.red(`Error saving workspace config: ${errorMessage}`),
      );
    }
  }

  #generateId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  #sanitizeName(name: string): string {
    return name.replace(/[^a-zA-Z0-9-_\s]/g, "").trim();
  }

  createWorkspace(
    name: string,
    description?: string,
    customPath?: string,
  ): Workspace {
    const sanitizedName = this.#sanitizeName(name);
    if (!sanitizedName) {
      throw new Error(
        "Workspace name cannot be empty or contain only special characters",
      );
    }

    const existing = this.#config.workspaces.find((w) =>
      w.name.toLowerCase() === sanitizedName.toLowerCase()
    );
    if (existing) {
      throw new Error(`Workspace "${sanitizedName}" already exists`);
    }

    const id = this.#generateId();
    const workspacePath = customPath ||
      join(
        this.#defaultWorkspacePath,
        sanitizedName.replace(/\s+/g, "-").toLowerCase(),
      );

    // Create workspace directory
    if (!existsSync(workspacePath)) {
      Deno.mkdirSync(workspacePath, { recursive: true });
    }

    const workspace: Workspace = {
      id,
      name: sanitizedName,
      description,
      path: workspacePath,
      createdAt: new Date(),
      lastAccessed: new Date(),
    };

    this.#config.workspaces.push(workspace);
    this.#saveConfig();

    console.log(
      colors.green(
        `✅ Workspace "${sanitizedName}" created at: ${workspacePath}`,
      ),
    );
    return workspace;
  }

  listWorkspaces(): Workspace[] {
    return [...this.#config.workspaces].sort((a, b) =>
      b.lastAccessed.getTime() - a.lastAccessed.getTime()
    );
  }

  getWorkspace(id: string): Workspace | undefined {
    return this.#config.workspaces.find((w) => w.id === id);
  }

  getWorkspaceByName(name: string): Workspace | undefined {
    return this.#config.workspaces.find((w) =>
      w.name.toLowerCase() === name.toLowerCase()
    );
  }

  deleteWorkspace(id: string, deleteFiles: boolean = false): boolean {
    const workspaceIndex = this.#config.workspaces.findIndex((w) =>
      w.id === id
    );
    if (workspaceIndex === -1) {
      return false;
    }

    const workspace = this.#config.workspaces[workspaceIndex];

    if (deleteFiles) {
      try {
        if (existsSync(workspace.path)) {
          Deno.removeSync(workspace.path, { recursive: true });
          console.log(
            colors.yellow(`🗑️  Deleted workspace files at: ${workspace.path}`),
          );
        }
      } catch (error) {
        const errorMessage = error instanceof Error
          ? error.message
          : String(error);
        console.warn(
          colors.yellow(
            `Warning: Could not delete workspace files: ${errorMessage}`,
          ),
        );
      }
    }

    this.#config.workspaces.splice(workspaceIndex, 1);

    if (this.#config.currentWorkspaceId === id) {
      this.#config.currentWorkspaceId = undefined;
    }

    this.#saveConfig();
    console.log(colors.green(`✅ Workspace "${workspace.name}" deleted`));
    return true;
  }

  setCurrentWorkspace(id: string): Workspace {
    const workspace = this.getWorkspace(id);
    if (!workspace) {
      throw new Error(`Workspace with ID "${id}" not found`);
    }

    workspace.lastAccessed = new Date();
    this.#config.currentWorkspaceId = id;
    this.#saveConfig();

    console.log(colors.blue(`📂 Switched to workspace: ${workspace.name}`));
    return workspace;
  }

  getCurrentWorkspace(): Workspace | undefined {
    if (!this.#config.currentWorkspaceId) {
      return undefined;
    }
    return this.getWorkspace(this.#config.currentWorkspaceId);
  }

  renameWorkspace(id: string, newName: string): boolean {
    const workspace = this.getWorkspace(id);
    if (!workspace) {
      return false;
    }

    const sanitizedName = this.#sanitizeName(newName);
    if (!sanitizedName) {
      throw new Error(
        "Workspace name cannot be empty or contain only special characters",
      );
    }

    // Check if workspace with this name already exists
    const existing = this.#config.workspaces.find((w) =>
      w.id !== id && w.name.toLowerCase() === sanitizedName.toLowerCase()
    );
    if (existing) {
      throw new Error(`Workspace "${sanitizedName}" already exists`);
    }

    workspace.name = sanitizedName;
    this.#saveConfig();

    console.log(colors.green(`✅ Workspace renamed to: ${sanitizedName}`));
    return true;
  }

  updateWorkspaceDescription(id: string, description: string): boolean {
    const workspace = this.getWorkspace(id);
    if (!workspace) {
      return false;
    }

    workspace.description = description;
    this.#saveConfig();

    console.log(colors.green(`✅ Workspace description updated`));
    return true;
  }

  getWorkspaceStats(): { total: number; current: string | null } {
    return {
      total: this.#config.workspaces.length,
      current: this.getCurrentWorkspace()?.name || null,
    };
  }
}
