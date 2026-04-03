import * as SecureStore from "expo-secure-store";

const BASE_URL = "https://backendload-pre-prod.omniaiflow.com";
const AUTH_TOKEN_KEY = "auth_token";

class ApiClient {
  private token: string | null = null;

  async init() {
    this.token = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
  }

  async setToken(token: string) {
    this.token = token;
    await SecureStore.setItemAsync(AUTH_TOKEN_KEY, token);
  }

  async clearToken() {
    this.token = null;
    await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);
  }

  get hasToken() {
    return !!this.token;
  }

  get currentToken() {
    return this.token;
  }

  private authHeaders(): Record<string, string> {
    const h: Record<string, string> = {};
    if (this.token) {
      h["Authorization"] = `Bearer ${this.token}`;
    }
    return h;
  }

  async request<T>(
    path: string,
    options: { method?: string; body?: any; query?: Record<string, string> } = {}
  ): Promise<T> {
    const { method = "GET", body, query } = options;
    let url = `${BASE_URL}${path}`;
    if (query) {
      const params = Object.entries(query).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
      url += `?${params}`;
    }

    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...this.authHeaders(),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (res.status === 401) throw new ApiError("Unauthorized", 401);
    if (res.status === 403) {
      const err = await res.json().catch(() => ({}));
      throw new ApiError(err.error || "Forbidden", 403, err);
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new ApiError(err.error || `Request failed (${res.status})`, res.status);
    }

    const text = await res.text();
    if (!text) return {} as T;
    return JSON.parse(text);
  }

  async requestVoid(path: string, options: { method?: string; body?: any } = {}) {
    const { method = "DELETE", body } = options;
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...this.authHeaders(),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) throw new ApiError("Unauthorized", 401);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new ApiError(err.error || "Request failed", res.status);
    }
  }

  /**
   * Stream chat using XMLHttpRequest (React Native doesn't support ReadableStream).
   * Parses AI SDK v6 UI Message Stream (SSE format).
   */
  streamChat(
    messages: { id: string; role: string; content: string }[],
    conversationId: string | null,
    onText: (text: string) => void,
    onDone: () => void,
    onError: (msg: string) => void
  ): { abort: () => void } {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BASE_URL}/api/chat`);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.setRequestHeader("Accept", "text/event-stream");
    if (this.token) {
      xhr.setRequestHeader("Authorization", `Bearer ${this.token}`);
    }

    let lastIndex = 0;
    let finished = false;

    xhr.onprogress = () => {
      const text = xhr.responseText;
      const newText = text.slice(lastIndex);
      lastIndex = text.length;

      const lines = newText.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;

        const payload = trimmed.slice(6);
        if (payload === "[DONE]") {
          finished = true;
          onDone();
          return;
        }

        try {
          const json = JSON.parse(payload);
          switch (json.type) {
            case "text-delta":
              onText(json.delta || "");
              break;
            case "finish":
              finished = true;
              onDone();
              return;
            case "error":
            case "error-text":
              onError(json.errorText || json.errorMessage || "Unknown error");
              finished = true;
              return;
          }
        } catch {
          // Skip unparseable lines
        }
      }
    };

    xhr.onloadend = () => {
      if (!finished) {
        if (xhr.status === 401) {
          onError("Unauthorized");
        } else if (xhr.status !== 200) {
          try {
            const err = JSON.parse(xhr.responseText);
            onError(err.error || "Failed to get response");
          } catch {
            onError("Failed to get response");
          }
        } else {
          onDone();
        }
      }
    };

    xhr.onerror = () => {
      if (!finished) onError("Network error");
    };

    const body = JSON.stringify({
      messages: messages.filter((m) => !(m.role === "assistant" && !m.content)),
      conversationId,
    });
    xhr.send(body);

    return { abort: () => xhr.abort() };
  }

  async uploadAudio(fileUri: string, filename: string): Promise<string> {
    const form = new FormData();
    form.append("audio", {
      uri: fileUri,
      type: "audio/m4a",
      name: filename,
    } as any);

    const res = await fetch(`${BASE_URL}/api/transcribe`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        ...this.authHeaders(),
      },
      body: form,
    });

    if (!res.ok) throw new ApiError("Transcription failed", res.status);
    const json = await res.json();
    return json.text || "";
  }

  async uploadRoomVoice(roomId: string, fileUri: string): Promise<any> {
    const form = new FormData();
    form.append("audio", {
      uri: fileUri,
      type: "audio/m4a",
      name: "voice.m4a",
    } as any);

    const res = await fetch(`${BASE_URL}/api/rooms/${roomId}/voice`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        ...this.authHeaders(),
      },
      body: form,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new ApiError(err.error || "Upload failed", res.status);
    }
    return res.json();
  }

  /**
   * Connect to SSE endpoint using XMLHttpRequest (React Native compatible).
   * Returns an abort function.
   */
  connectSSE(
    path: string,
    onEvent: (event: any) => void,
    onError?: () => void
  ): { abort: () => void } {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", `${BASE_URL}${path}`);
    if (this.token) {
      xhr.setRequestHeader("Authorization", `Bearer ${this.token}`);
    }

    let lastIndex = 0;
    let currentEventType = "";

    xhr.onprogress = () => {
      const text = xhr.responseText;
      const newText = text.slice(lastIndex);
      lastIndex = text.length;

      const lines = newText.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          currentEventType = "";
          continue;
        }
        // Capture event type from "event: <name>" lines
        if (trimmed.startsWith("event: ")) {
          currentEventType = trimmed.slice(7);
          continue;
        }
        if (!trimmed.startsWith("data: ")) continue;
        try {
          const data = JSON.parse(trimmed.slice(6));
          // Inject the event type into the data object
          if (currentEventType && !data.type) {
            data.type = currentEventType;
          }
          onEvent(data);
        } catch {
          // Skip
        }
      }
    };

    xhr.onerror = () => onError?.();
    xhr.onloadend = () => onError?.();

    xhr.send();
    return { abort: () => xhr.abort() };
  }

  get baseUrl() {
    return BASE_URL;
  }
}

export class ApiError extends Error {
  public data?: any;
  constructor(message: string, public status: number, data?: any) {
    super(message);
    this.name = "ApiError";
    this.data = data;
  }
}

export const api = new ApiClient();
