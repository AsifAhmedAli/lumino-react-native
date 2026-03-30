import { StyleSheet } from "react-native";

export const colors = {
  background: "#0a0a0f",
  card: "#12121a",
  secondary: "#1a1a25",
  border: "#2a2a3a",
  glassBg: "rgba(255,255,255,0.04)",
  glassBorder: "rgba(255,255,255,0.08)",
  primary: "#6c47ff",
  primaryLight: "rgba(108,71,255,0.15)",
  foreground: "#f0f0f5",
  mutedForeground: "#8a8a9a",
  destructive: "#ef4444",
  success: "#22c55e",
  warning: "#eab308",
  white: "#ffffff",
};

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 9999,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
};

export const typography = StyleSheet.create({
  h1: { fontSize: 24, fontWeight: "700", color: colors.foreground },
  h2: { fontSize: 20, fontWeight: "600", color: colors.foreground },
  h3: { fontSize: 17, fontWeight: "600", color: colors.foreground },
  body: { fontSize: 15, color: colors.foreground, lineHeight: 22 },
  caption: { fontSize: 13, color: colors.mutedForeground },
  caption2: { fontSize: 11, color: colors.mutedForeground },
  label: { fontSize: 13, fontWeight: "500", color: colors.mutedForeground },
});

export const roleColors: Record<string, { text: string; bg: string }> = {
  super_admin: { text: "#ef4444", bg: "rgba(239,68,68,0.15)" },
  source: { text: "#a855f7", bg: "rgba(168,85,247,0.15)" },
  intelligence: { text: "#3b82f6", bg: "rgba(59,130,246,0.15)" },
  manifestor: { text: "#f97316", bg: "rgba(249,115,22,0.15)" },
  cell: { text: "#22c55e", bg: "rgba(34,197,94,0.15)" },
};

export const roleLabels: Record<string, string> = {
  super_admin: "Super Admin",
  source: "Admin",
  intelligence: "Intelligence",
  manifestor: "Manifestor",
  cell: "Cell",
};
