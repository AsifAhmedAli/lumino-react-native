import { create } from "zustand";
import { api, ApiError } from "../services/api";
import type { User } from "../types";

interface AuthState {
  user: User | null;
  permissions: string[];
  loading: boolean;
  initialized: boolean;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<{ needsVerification?: boolean; mustChangePassword?: boolean; email?: string }>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  permissions: [],
  loading: true,
  initialized: false,
  isAdmin: false,

  checkAuth: async () => {
    try {
      await api.init();
      if (!api.hasToken) {
        set({ user: null, loading: false, initialized: true, isAdmin: false });
        return;
      }
      const data = await api.request<any>("/api/profile");
      set({
        user: data,
        permissions: data.permissions || [],
        loading: false,
        initialized: true,
        isAdmin: data.role === "super_admin" || data.role === "source",
      });
    } catch {
      await api.clearToken();
      set({ user: null, loading: false, initialized: true, isAdmin: false });
    }
  },

  login: async (email: string, password: string) => {
    const res = await api.request<{
      success: boolean;
      token?: string;
      mustChangePassword?: boolean;
    }>("/api/auth/login", {
      method: "POST",
      body: { email, password },
    });

    // Store the JWT token from response body
    if (res.token) {
      await api.setToken(res.token);
    }

    if (res.mustChangePassword) {
      return { mustChangePassword: true };
    }

    // Fetch profile
    const data = await api.request<any>("/api/profile");
    set({
      user: data,
      permissions: data.permissions || [],
      loading: false,
      isAdmin: data.role === "super_admin" || data.role === "source",
    });

    return {};
  },

  logout: async () => {
    try {
      await api.request("/api/auth/logout", { method: "POST" });
    } catch {
      // Ignore
    }
    await api.clearToken();
    set({ user: null, permissions: [], isAdmin: false });
  },
}));
