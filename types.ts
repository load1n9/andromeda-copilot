export interface AgentConfig {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  workspaceDir?: string;
  apiKey?: string;
}

export interface FileOperation {
  type: "write" | "read" | "delete" | "list" | "append";
  path: string;
  content?: string;
}

export interface ExecutionResult {
  success: boolean;
  output: string;
  error?: string;
  duration?: number;
}
