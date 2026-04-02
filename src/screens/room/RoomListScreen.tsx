import React, { useState, useCallback } from "react";
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator,
  RefreshControl, TextInput, Alert, Modal,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii, spacing } from "../../theme";
import { api } from "../../services/api";
import { useAuthStore } from "../../store/auth";
import type { Room } from "../../types";

const LANGUAGES = [
  { id: "en", label: "English" }, { id: "es", label: "Spanish" }, { id: "fr", label: "French" },
  { id: "de", label: "German" }, { id: "it", label: "Italian" }, { id: "pt", label: "Portuguese" },
  { id: "ru", label: "Russian" }, { id: "zh", label: "Chinese" }, { id: "ja", label: "Japanese" },
  { id: "ko", label: "Korean" }, { id: "ar", label: "Arabic" }, { id: "hi", label: "Hindi" },
  { id: "tr", label: "Turkish" }, { id: "nl", label: "Dutch" }, { id: "pl", label: "Polish" },
  { id: "sv", label: "Swedish" }, { id: "da", label: "Danish" }, { id: "fi", label: "Finnish" },
  { id: "no", label: "Norwegian" }, { id: "cs", label: "Czech" }, { id: "sk", label: "Slovak" },
  { id: "uk", label: "Ukrainian" }, { id: "th", label: "Thai" }, { id: "vi", label: "Vietnamese" },
];

export function RoomListScreen({ navigation }: any) {
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [createModal, setCreateModal] = useState(false);
  const [roomName, setRoomName] = useState("");
  const [roomLang, setRoomLang] = useState("en");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const results: Room[] = [];

      // Admin: load hosted rooms
      if (isAdmin) {
        const hosted = await api.request<{ rooms: Room[] }>("/api/rooms");
        results.push(...(hosted.rooms || []));
      }

      // All users: load rooms they've joined as participant
      try {
        const joined = await api.request<{ rooms: Room[] }>("/api/rooms/my");
        // Avoid duplicates (admin might host + participate)
        const hostedIds = new Set(results.map((r) => r.id));
        for (const r of joined.rooms || []) {
          if (!hostedIds.has(r.id)) results.push(r);
        }
      } catch {}

      setRooms(results);
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, [isAdmin]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const createRoom = async () => {
    if (!roomName.trim()) return;
    setCreating(true);
    try {
      await api.request("/api/rooms", {
        method: "POST",
        body: { name: roomName.trim(), defaultLanguage: roomLang },
      });
      setCreateModal(false);
      setRoomName("");
      load();
    } catch (err: any) {
      Alert.alert("Error", err.message);
    }
    setCreating(false);
  };

  const statusColor = (s: string) =>
    s === "active" ? colors.success : s === "paused" ? colors.warning : colors.destructive;

  const renderItem = ({ item }: { item: Room }) => (
    <TouchableOpacity
      style={styles.item}
      onPress={() => navigation.navigate("RoomDetail", { roomId: item.id, roomName: item.name })}
    >
      <View style={[styles.statusDot, { backgroundColor: statusColor(item.status) }]} />
      <View style={styles.itemContent}>
        <Text style={styles.itemTitle}>{item.name}</Text>
        <Text style={styles.itemSub}>
          {item.participantCount} participant{item.participantCount !== 1 ? "s" : ""} · {(item.settings?.defaultLanguage || "en").toUpperCase()}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
    </TouchableOpacity>
  );

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={rooms}
        keyExtractor={(i) => i.id}
        renderItem={renderItem}
        contentContainerStyle={rooms.length === 0 ? styles.center : undefined}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="globe-outline" size={48} color={colors.mutedForeground} />
            <Text style={styles.emptyText}>No translation rooms</Text>
          </View>
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />
        }
      />

      {isAdmin && (
        <TouchableOpacity style={styles.fab} onPress={() => setCreateModal(true)}>
          <Ionicons name="add" size={28} color={colors.white} />
        </TouchableOpacity>
      )}

      {/* Create Room Modal */}
      <Modal visible={createModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Create Room</Text>
            <TextInput
              style={styles.input}
              placeholder="Room Name"
              placeholderTextColor={colors.mutedForeground}
              value={roomName}
              onChangeText={setRoomName}
            />
            <Text style={styles.label}>Default Language</Text>
            <View style={styles.langGrid}>
              {LANGUAGES.map((l) => (
                <TouchableOpacity
                  key={l.id}
                  style={[styles.langChip, roomLang === l.id && styles.langChipActive]}
                  onPress={() => setRoomLang(l.id)}
                >
                  <Text style={[styles.langText, roomLang === l.id && styles.langTextActive]}>{l.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setCreateModal(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.createBtn, creating && { opacity: 0.5 }]}
                onPress={createRoom}
                disabled={creating || !roomName.trim()}
              >
                {creating ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.createText}>Create</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  item: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, gap: spacing.md,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  itemContent: { flex: 1 },
  itemTitle: { fontSize: 15, fontWeight: "500", color: colors.foreground },
  itemSub: { fontSize: 12, color: colors.mutedForeground, marginTop: 2 },
  empty: { alignItems: "center", gap: spacing.sm },
  emptyText: { fontSize: 16, fontWeight: "500", color: colors.mutedForeground },
  fab: {
    position: "absolute", bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.primary, justifyContent: "center", alignItems: "center",
    shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5,
  },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modal: { backgroundColor: colors.card, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, padding: spacing.xxl },
  modalTitle: { fontSize: 18, fontWeight: "600", color: colors.foreground, marginBottom: spacing.lg },
  input: {
    backgroundColor: colors.secondary, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.lg, paddingVertical: 12, color: colors.foreground, fontSize: 15, marginBottom: spacing.md,
  },
  label: { fontSize: 13, fontWeight: "500", color: colors.mutedForeground, marginBottom: spacing.sm },
  langGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.lg },
  langChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radii.full, backgroundColor: colors.secondary, borderWidth: 1, borderColor: colors.border },
  langChipActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  langText: { fontSize: 12, color: colors.mutedForeground },
  langTextActive: { color: colors.primary, fontWeight: "600" },
  modalActions: { flexDirection: "row", gap: spacing.md },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: radii.md, backgroundColor: colors.secondary, alignItems: "center" },
  cancelText: { color: colors.mutedForeground, fontWeight: "500" },
  createBtn: { flex: 1, paddingVertical: 12, borderRadius: radii.md, backgroundColor: colors.primary, alignItems: "center" },
  createText: { color: colors.white, fontWeight: "600" },
});
