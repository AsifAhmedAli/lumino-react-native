import React, { useState, useEffect } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet,
  Alert, ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii, spacing, roleLabels, roleColors } from "../../theme";
import { api } from "../../services/api";
import { useAuthStore } from "../../store/auth";
import type { InvitedUser } from "../../types";

export function SettingsScreen() {
  const { user, isAdmin, logout } = useAuthStore();
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("cell");
  const [inviting, setInviting] = useState(false);
  const [users, setUsers] = useState<InvitedUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const assignableRoles = (() => {
    const r = user?.role || "cell";
    if (r === "super_admin") return ["source", "intelligence", "manifestor", "cell"];
    if (r === "source") return ["intelligence", "manifestor", "cell"];
    return [];
  })();

  useEffect(() => {
    if (isAdmin) loadUsers();
  }, [isAdmin]);

  const loadUsers = async () => {
    setLoadingUsers(true);
    try {
      const data = await api.request<{ users: InvitedUser[] }>("/api/admin/users");
      setUsers(data.users || []);
    } catch {}
    setLoadingUsers(false);
  };

  const inviteUser = async () => {
    if (!inviteName.trim() || !inviteEmail.trim()) return;
    setInviting(true);
    setMessage(null);
    try {
      await api.request("/api/admin/users", {
        method: "POST",
        body: {
          email: inviteEmail.trim().toLowerCase(),
          fullName: inviteName.trim(),
          role: inviteRole,
        },
      });
      setMessage({ text: `Invitation sent to ${inviteEmail}`, error: false });
      setInviteName("");
      setInviteEmail("");
      loadUsers();
    } catch (err: any) {
      setMessage({ text: err.message || "Failed to invite", error: true });
    }
    setInviting(false);
  };

  const deleteUser = async (u: InvitedUser) => {
    Alert.alert("Remove User", `Revoke access for ${u.fullName}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            await api.requestVoid(`/api/admin/users/${u.id}`);
            setUsers((prev) => prev.filter((x) => x.id !== u.id));
          } catch {
            Alert.alert("Error", "Failed to remove user");
          }
        },
      },
    ]);
  };

  const handleLogout = () => {
    Alert.alert("Sign Out", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: () => logout() },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Profile Card */}
      <View style={styles.card}>
        <View style={styles.profileRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(user?.full_name || "?")[0].toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{user?.full_name || "User"}</Text>
            <Text style={styles.email}>{user?.email || ""}</Text>
          </View>
          <View style={[styles.roleBadge, { backgroundColor: roleColors[user?.role || "cell"]?.bg }]}>
            <Text style={[styles.roleText, { color: roleColors[user?.role || "cell"]?.text }]}>
              {roleLabels[user?.role || "cell"] || user?.role}
            </Text>
          </View>
        </View>
      </View>

      {/* Invite Section (admin only) */}
      {isAdmin && (
        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Ionicons name="person-add" size={18} color={colors.primary} />
            <Text style={styles.sectionTitle}>Invite New User</Text>
          </View>
          <Text style={styles.helperText}>Invited users can access the AI chat assistant.</Text>

          <TextInput
            style={styles.input}
            placeholder="Full Name"
            placeholderTextColor={colors.mutedForeground}
            value={inviteName}
            onChangeText={setInviteName}
          />
          <TextInput
            style={styles.input}
            placeholder="Email Address"
            placeholderTextColor={colors.mutedForeground}
            value={inviteEmail}
            onChangeText={setInviteEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          {/* Role Picker */}
          {assignableRoles.length > 1 && (
            <View style={styles.roleRow}>
              <Text style={styles.roleLabel}>Role</Text>
              <View style={styles.roleChips}>
                {assignableRoles.map((r) => (
                  <TouchableOpacity
                    key={r}
                    style={[styles.chip, inviteRole === r && styles.chipActive]}
                    onPress={() => setInviteRole(r)}
                  >
                    <Text style={[styles.chipText, inviteRole === r && styles.chipTextActive]}>
                      {roleLabels[r] || r}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {message && (
            <Text style={[styles.msg, message.error && styles.msgError]}>{message.text}</Text>
          )}

          <TouchableOpacity
            style={[styles.inviteBtn, (inviting || !inviteName || !inviteEmail) && { opacity: 0.5 }]}
            onPress={inviteUser}
            disabled={inviting || !inviteName || !inviteEmail}
          >
            {inviting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="mail" size={16} color="#fff" />
                <Text style={styles.inviteBtnText}>Send Invitation</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Users List (admin only) */}
      {isAdmin && (
        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Ionicons name="people" size={18} color={colors.foreground} />
            <Text style={styles.sectionTitle}>Registered Users</Text>
            <Text style={styles.countBadge}>{users.length}</Text>
          </View>

          {loadingUsers ? (
            <ActivityIndicator color={colors.primary} style={{ paddingVertical: spacing.lg }} />
          ) : users.length === 0 ? (
            <Text style={styles.emptyText}>No users invited yet</Text>
          ) : (
            users.map((u) => (
              <View key={u.id} style={styles.userRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.userName}>{u.fullName}</Text>
                  <Text style={styles.userEmail}>{u.email}</Text>
                </View>
                <View style={[styles.roleBadgeSm, { backgroundColor: roleColors[u.role]?.bg || colors.secondary }]}>
                  <Text style={[styles.roleBadgeSmText, { color: roleColors[u.role]?.text || colors.mutedForeground }]}>
                    {(roleLabels[u.role] || u.role).toUpperCase()}
                  </Text>
                </View>
                <Text style={{ fontSize: 11, color: u.mustChangePassword ? colors.warning : colors.success }}>
                  {u.mustChangePassword ? "Pending" : "Active"}
                </Text>
                <TouchableOpacity onPress={() => deleteUser(u)}>
                  <Ionicons name="trash-outline" size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>
      )}

      {/* Logout */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={18} color={colors.destructive} />
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: 40 },
  card: { backgroundColor: colors.card, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  profileRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primaryLight, justifyContent: "center", alignItems: "center" },
  avatarText: { fontSize: 18, fontWeight: "700", color: colors.primary },
  name: { fontSize: 15, fontWeight: "600", color: colors.foreground },
  email: { fontSize: 13, color: colors.mutedForeground },
  roleBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radii.full },
  roleText: { fontSize: 11, fontWeight: "700" },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  sectionTitle: { fontSize: 15, fontWeight: "600", color: colors.foreground },
  helperText: { fontSize: 12, color: colors.mutedForeground, marginBottom: spacing.md },
  input: {
    backgroundColor: colors.secondary, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.lg, paddingVertical: 12, color: colors.foreground, fontSize: 14, marginBottom: spacing.sm,
  },
  roleRow: { marginBottom: spacing.sm },
  roleLabel: { fontSize: 13, fontWeight: "500", color: colors.mutedForeground, marginBottom: spacing.xs },
  roleChips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radii.full, backgroundColor: colors.secondary, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  chipText: { fontSize: 12, color: colors.mutedForeground },
  chipTextActive: { color: colors.primary, fontWeight: "600" },
  msg: { fontSize: 12, color: colors.success, marginBottom: spacing.sm },
  msgError: { color: colors.destructive },
  inviteBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm,
    backgroundColor: colors.primary, borderRadius: radii.md, paddingVertical: 12,
  },
  inviteBtnText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  countBadge: { marginLeft: "auto", fontSize: 12, color: colors.mutedForeground, backgroundColor: colors.secondary, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radii.full },
  emptyText: { fontSize: 13, color: colors.mutedForeground, textAlign: "center", paddingVertical: spacing.lg },
  userRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  userName: { fontSize: 14, fontWeight: "500", color: colors.foreground },
  userEmail: { fontSize: 12, color: colors.mutedForeground },
  roleBadgeSm: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: radii.full },
  roleBadgeSmText: { fontSize: 9, fontWeight: "700" },
  logoutBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm,
    backgroundColor: "rgba(239,68,68,0.1)", borderRadius: radii.md, paddingVertical: 14,
  },
  logoutText: { color: colors.destructive, fontWeight: "500" },
});
