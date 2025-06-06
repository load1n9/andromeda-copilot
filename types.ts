import { WorkspaceManager } from "./workspace-manager.ts";

export interface AgentConfig {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  workspaceDir?: string;
  apiKey?: string;
  workspaceManager?: WorkspaceManager;
}

export interface FileOperation {
  type: "write" | "read" | "delete" | "list";
  path: string;
  content?: string;
}

export interface ExecutionResult {
  success: boolean;
  output: string;
  error?: string;
  duration?: number;
}

export interface ChatRequest {
  message: string;
  sessionId?: string;
}

export interface ChatResponse {
  response: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  sessionId: string;
}

export interface Workspace {
  id: string;
  name: string;
  description?: string;
  path: string;
  createdAt: Date;
  lastAccessed: Date;
}

export interface WorkspaceConfig {
  workspaces: Workspace[];
  currentWorkspaceId?: string;
  defaultWorkspacePath: string;
}
