class AndromedaChat {
  apiUrl = "/api";
  sessionId = null;
  totalTokens = 0;
  messageCount = 0;
  isConnected = false;
  currentWorkspace = null;
  elements = {
    messages: document.getElementById("messages"),
    messageInput: document.getElementById("messageInput"),
    sendButton: document.getElementById("sendButton"),
    status: document.getElementById("status"),
    sessionId: document.getElementById("sessionId"),
    totalTokens: document.getElementById("totalTokens"),
    messageCount: document.getElementById("messageCount"),
    tokenCount: document.getElementById("tokenCount"),
    workspaceName: document.getElementById("workspaceName"),
    workspaceBtn: document.getElementById("workspaceBtn"),
    workspaceModal: document.getElementById("workspaceModal"),
    createWorkspaceModal: document.getElementById("createWorkspaceModal"),
    workspaceList: document.getElementById("workspaceList"),
    createWorkspaceBtn: document.getElementById("createWorkspaceBtn"),
    refreshWorkspacesBtn: document.getElementById("refreshWorkspacesBtn"),
    createWorkspaceForm: document.getElementById("createWorkspaceForm"),
    workspaceNameInput: document.getElementById("workspaceNameInput"),
    workspaceDescInput: document.getElementById("workspaceDescInput"),
  };

  constructor() {
    this.validateElements();

    this.init();
  }

  validateElements() {
    const missingElements = [];
    for (const [key, element] of Object.entries(this.elements)) {
      if (!element) {
        missingElements.push(key);
      }
    }

    if (missingElements.length > 0) {
      console.error("Missing DOM elements:", missingElements);
    }

    return missingElements.length === 0;
  }

  init() {
    this.bindEvents();
    this.checkHealth();
    this.autoResizeTextarea();
    this.loadWorkspaces();
  }

  bindEvents() {
    this.elements.sendButton.addEventListener(
      "click",
      () => this.sendMessage(),
    );

    this.elements.messageInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.ctrlKey) {
        e.preventDefault();
        this.sendMessage();
      } else if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    this.elements.messageInput.addEventListener("input", () => {
      const hasText = this.elements.messageInput.value.trim().length > 0;
      this.elements.sendButton.disabled = !hasText || !this.isConnected;
    });

    document.querySelectorAll(".quick-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const prompt = btn.getAttribute("data-prompt");
        this.elements.messageInput.value = prompt;
        this.elements.messageInput.focus();
        this.elements.sendButton.disabled = false;
      });
    });

    this.elements.workspaceBtn.addEventListener(
      "click",
      () => this.showWorkspaceModal(),
    );
    document.getElementById("modalClose").addEventListener(
      "click",
      () => this.hideWorkspaceModal(),
    );
    document.getElementById("createModalClose").addEventListener(
      "click",
      () => this.hideCreateModal(),
    );
    document.getElementById("cancelCreateBtn").addEventListener(
      "click",
      () => this.hideCreateModal(),
    );
    this.elements.createWorkspaceBtn.addEventListener(
      "click",
      () => this.showCreateModal(),
    );
    this.elements.refreshWorkspacesBtn.addEventListener(
      "click",
      () => this.loadWorkspaces(),
    );
    this.elements.createWorkspaceForm.addEventListener(
      "submit",
      (e) => this.createWorkspace(e),
    );

    this.elements.workspaceModal.addEventListener("click", (e) => {
      if (e.target === this.elements.workspaceModal) {
        this.hideWorkspaceModal();
      }
    });
    this.elements.createWorkspaceModal.addEventListener("click", (e) => {
      if (e.target === this.elements.createWorkspaceModal) {
        this.hideCreateModal();
      }
    });
  }

  autoResizeTextarea() {
    const textarea = this.elements.messageInput;
    textarea.addEventListener("input", () => {
      textarea.style.height = "auto";
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + "px";
    });
  }

  async checkHealth() {
    try {
      const response = await fetch(`${this.apiUrl}/health`);
      if (response.ok) {
        this.setConnected(true);
      } else {
        this.setConnected(false);
      }
    } catch (error) {
      console.error("Health check failed:", error);
      this.setConnected(false);
    }
  }

  setConnected(connected) {
    this.isConnected = connected;
    const statusElement = this.elements.status;

    if (connected) {
      statusElement.className = "status connected";
      statusElement.querySelector("span:last-child").textContent = "Connected";
    } else {
      statusElement.className = "status";
      statusElement.querySelector("span:last-child").textContent =
        "Disconnected";
    }

    this.elements.sendButton.disabled = !connected ||
      this.elements.messageInput.value.trim().length === 0;
  }

  async sendMessage() {
    const message = this.elements.messageInput.value.trim();
    if (!message || !this.isConnected) return;

    this.addMessage("user", message);

    this.elements.messageInput.value = "";
    this.elements.messageInput.style.height = "auto";
    this.elements.sendButton.disabled = true;

    const thinkingId = this.addThinkingIndicator();

    try {
      const response = await fetch(`${this.apiUrl}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: message,
          sessionId: this.sessionId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Request failed");
      }

      if (data.sessionId) {
        this.sessionId = data.sessionId;
        this.elements.sessionId.textContent = data.sessionId.slice(0, 8) +
          "...";
      }

      if (data.usage) {
        this.totalTokens += data.usage.totalTokens;
        this.elements.totalTokens.textContent = this.totalTokens
          .toLocaleString();
        this.elements.tokenCount.textContent =
          `${this.totalTokens.toLocaleString()} tokens used`;
      }

      this.messageCount += 2;
      this.elements.messageCount.textContent = this.messageCount;

      this.removeThinkingIndicator(thinkingId);
      this.addMessage("agent", data.response);
    } catch (error) {
      console.error("Send message failed:", error);
      this.removeThinkingIndicator(thinkingId);
      this.addMessage("agent", `❌ Error: ${error.message}`);
    }
  }

  addMessage(sender, content) {
    const messageDiv = document.createElement("div");
    messageDiv.className = `message ${sender}-message`;

    const avatar = sender === "user" ? "👤" : "🌌";
    const senderName = sender === "user" ? "You" : "Andromeda Copilot";

    messageDiv.innerHTML = `
            <div class="message-header">
                <span class="avatar">${avatar}</span>
                <span class="sender">${senderName}</span>
            </div>
            <div class="message-content">${this.formatMessage(content)}</div>
        `;

    this.elements.messages.appendChild(messageDiv);
    this.scrollToBottom();
  }

  addThinkingIndicator() {
    const thinkingId = Date.now();
    const thinkingDiv = document.createElement("div");
    thinkingDiv.className = "thinking";
    thinkingDiv.id = `thinking-${thinkingId}`;
    thinkingDiv.innerHTML = `
            Thinking
            <div class="thinking-dots">
                <span></span>
                <span></span>
                <span></span>
            </div>
        `;

    this.elements.messages.appendChild(thinkingDiv);
    this.scrollToBottom();

    return thinkingId;
  }

  removeThinkingIndicator(thinkingId) {
    const element = document.getElementById(`thinking-${thinkingId}`);
    if (element) {
      element.remove();
    }
  }
  formatMessage(content) {
    const formatted = content
      .replace(/```([\s\S]*?)```/g, "<pre><code>$1</code></pre>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/\n/g, "<br>");

    return formatted;
  }

  scrollToBottom() {
    this.elements.messages.scrollTop = this.elements.messages.scrollHeight;
  }

  async loadWorkspaces() {
    try {
      const response = await fetch(`${this.apiUrl}/workspaces`);
      if (!response.ok) {
        throw new Error("Failed to load workspaces");
      }

      const data = await response.json();
      this.currentWorkspace = data.currentWorkspace;
      this.updateWorkspaceDisplay();
      this.renderWorkspaceList(data.workspaces);
    } catch (error) {
      console.error("Failed to load workspaces:", error);
      this.showError("Failed to load workspaces");
    }
  }
  updateWorkspaceDisplay() {
    if (this.elements.workspaceName) {
      if (this.currentWorkspace) {
        this.elements.workspaceName.textContent = this.currentWorkspace.name;
      } else {
        this.elements.workspaceName.textContent = "No workspace";
      }
    } else {
      console.error("workspaceName element not found");
    }
  }
  renderWorkspaceList(workspaces) {
    if (!this.elements.workspaceList) {
      console.error("workspaceList element not found");
      return;
    }

    this.elements.workspaceList.innerHTML = "";

    if (workspaces.length === 0) {
      this.elements.workspaceList.innerHTML =
        '<div class="no-workspaces">No workspaces found. Create one to get started!</div>';
      return;
    }

    workspaces.forEach((workspace) => {
      const workspaceItem = document.createElement("div");
      workspaceItem.className = "workspace-item";
      if (
        this.currentWorkspace && workspace.name === this.currentWorkspace.name
      ) {
        workspaceItem.classList.add("active");
      }

      workspaceItem.innerHTML = `
                <div class="workspace-info">
                    <div class="workspace-name">${workspace.name}</div>
                    <div class="workspace-desc">${
        workspace.description || "No description"
      }</div>
                    <div class="workspace-path">${workspace.path}</div>
                </div>
                <div class="workspace-actions">
                    <button class="btn-small btn-primary select-workspace" data-name="${workspace.name}">Select</button>
                    <button class="btn-small btn-danger delete-workspace" data-name="${workspace.name}">Delete</button>
                </div>
            `;

      const selectBtn = workspaceItem.querySelector(".select-workspace");
      const deleteBtn = workspaceItem.querySelector(".delete-workspace");

      selectBtn.addEventListener(
        "click",
        () => this.switchWorkspace(workspace.name),
      );
      deleteBtn.addEventListener(
        "click",
        () => this.deleteWorkspace(workspace.name),
      );

      this.elements.workspaceList.appendChild(workspaceItem);
    });
  }

  async switchWorkspace(workspaceName) {
    try {
      const response = await fetch(`${this.apiUrl}/workspaces/switch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: workspaceName }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to switch workspace");
      }

      await this.loadWorkspaces();
      this.hideWorkspaceModal();
      this.showSuccess(`Switched to workspace: ${workspaceName}`);

      this.sessionId = null;
      this.elements.sessionId.textContent = "New session";
    } catch (error) {
      console.error("Failed to switch workspace:", error);
      this.showError(`Failed to switch workspace: ${error.message}`);
    }
  }

  async deleteWorkspace(workspaceName) {
    if (
      !confirm(
        `Are you sure you want to delete the workspace "${workspaceName}"? This action cannot be undone.`,
      )
    ) {
      return;
    }

    try {
      const response = await fetch(
        `${this.apiUrl}/workspaces/${encodeURIComponent(workspaceName)}`,
        {
          method: "DELETE",
        },
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to delete workspace");
      }

      await this.loadWorkspaces();
      this.showSuccess(`Deleted workspace: ${workspaceName}`);
    } catch (error) {
      console.error("Failed to delete workspace:", error);
      this.showError(`Failed to delete workspace: ${error.message}`);
    }
  }

  async createWorkspace(event) {
    event.preventDefault();

    const name = this.elements.workspaceNameInput.value.trim();
    const description = this.elements.workspaceDescInput.value.trim();

    if (!name) {
      this.showError("Workspace name is required");
      return;
    }

    try {
      const response = await fetch(`${this.apiUrl}/workspaces`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, description }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create workspace");
      }

      this.elements.workspaceNameInput.value = "";
      this.elements.workspaceDescInput.value = "";

      await this.loadWorkspaces();
      this.hideCreateModal();
      this.showSuccess(`Created workspace: ${name}`);
    } catch (error) {
      console.error("Failed to create workspace:", error);
      this.showError(`Failed to create workspace: ${error.message}`);
    }
  }

  showWorkspaceModal() {
    this.elements.workspaceModal.style.display = "flex";
    this.loadWorkspaces();
  }

  hideWorkspaceModal() {
    this.elements.workspaceModal.style.display = "none";
  }

  showCreateModal() {
    this.elements.createWorkspaceModal.style.display = "flex";
    this.elements.workspaceNameInput.focus();
  }

  hideCreateModal() {
    this.elements.createWorkspaceModal.style.display = "none";
    this.elements.workspaceNameInput.value = "";
    this.elements.workspaceDescInput.value = "";
  }

  showSuccess(message) {
    this.showNotification(message, "success");
  }

  showError(message) {
    this.showNotification(message, "error");
  }

  showNotification(message, type = "info") {
    const notification = document.createElement("div");
    notification.className = `notification ${type}`;
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(() => notification.classList.add("show"), 100);

    setTimeout(() => {
      notification.classList.remove("show");
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }, 3000);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  new AndromedaChat();
});
