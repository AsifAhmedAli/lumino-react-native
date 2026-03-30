import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Audio } from "expo-av";
import QRCode from "react-native-qrcode-svg";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { colors, radii, spacing } from "../../theme";
import { api } from "../../services/api";
import type { VoiceMessage, RoomParticipant } from "../../types";

export function RoomDetailScreen({ route, navigation }: any) {
  const { roomId } = route.params;
  const [room, setRoom] = useState<any>(null);
  const [participants, setParticipants] = useState<RoomParticipant[]>([]);
  const [messages, setMessages] = useState<VoiceMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [recordDuration, setRecordDuration] = useState(0);
  const [uploading, setUploading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const sseAbortRef = useRef<{ abort: () => void } | null>(null);

  useEffect(() => {
    loadRoom();
    return () => {
      sseAbortRef.current?.abort();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const loadRoom = async () => {
    try {
      const data = await api.request<any>(`/api/rooms/${roomId}`);
      setRoom(data);
      setParticipants(data.participants || []);
      // API returns "messages", not "voiceMessages"
      setMessages(data.messages || []);
      navigation.setOptions({ title: data.name || "Room" });

      // Connect SSE after loading
      if (data.status !== "closed") {
        connectSSE();
      }
    } catch {
      Alert.alert("Error", "Failed to load room");
    }
    setLoading(false);
  };

  const connectSSE = () => {
    sseAbortRef.current?.abort();

    const handle = api.connectSSE(
      `/api/rooms/${roomId}/events`,
      (event) => {
        switch (event.type) {
          case "participant:joined":
            setParticipants((prev) => [
              ...prev.filter((p) => p.id !== event.participant.id),
              event.participant,
            ]);
            break;
          case "participant:left":
            setParticipants((prev) => prev.filter((p) => p.id !== event.participantId));
            break;
          case "voice:translated":
            setMessages((prev) => [...prev, event.message]);
            setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
            break;
        }
      },
      () => {
        // Reconnect after delay
        setTimeout(() => connectSSE(), 3000);
      }
    );
    sseAbortRef.current = handle;
  };

  // Voice recording
  const startRecording = async () => {
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission Required", "Microphone access is needed for voice messages.");
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording: rec } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(rec);
      setRecordDuration(0);
      timerRef.current = setInterval(() => setRecordDuration((d) => d + 1), 1000);
    } catch {
      Alert.alert("Error", "Failed to start recording");
    }
  };

  const cancelRecording = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    try { await recording?.stopAndUnloadAsync(); } catch {}
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});
    setRecording(null);
    setRecordDuration(0);
  };

  const sendRecording = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!recording) return;
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);
      setRecordDuration(0);
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});
      if (!uri) return;
      setUploading(true);
      await api.uploadRoomVoice(roomId, uri);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("Error", "Failed to send voice message");
    }
    setUploading(false);
  };

  const copyLink = async () => {
    if (!room) return;
    await Clipboard.setStringAsync(`${api.baseUrl}/room/${room.code}`);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert("Copied", "Room link copied to clipboard");
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;
  }

  if (!room) return null;

  const roomLink = `${api.baseUrl}/room/${room.code}`;

  return (
    <View style={styles.container}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll}>
        {room.status === "closed" && (
          <View style={styles.closedBanner}>
            <Ionicons name="lock-closed" size={16} color={colors.destructive} />
            <Text style={styles.closedText}>This room is closed</Text>
          </View>
        )}

        {room.status !== "closed" && (
          <View style={styles.card}>
            <View style={styles.qrCenter}>
              <QRCode value={roomLink} size={160} backgroundColor="transparent" color={colors.foreground} />
            </View>
            <TouchableOpacity style={styles.copyBtn} onPress={copyLink}>
              <Ionicons name="copy-outline" size={16} color={colors.primary} />
              <Text style={styles.copyText}>Copy Room Link</Text>
            </TouchableOpacity>
          </View>
        )}

        {room.status !== "closed" && (
          <View style={styles.card}>
            {uploading ? (
              <View style={styles.recRow}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.recLabel}>Sending...</Text>
              </View>
            ) : recording ? (
              <View style={styles.recRow}>
                <TouchableOpacity onPress={cancelRecording}>
                  <Ionicons name="close-circle" size={28} color={colors.mutedForeground} />
                </TouchableOpacity>
                <View style={styles.recDot} />
                <Text style={styles.recTimer}>
                  {Math.floor(recordDuration / 60)}:{String(recordDuration % 60).padStart(2, "0")}
                </Text>
                <View style={{ flex: 1 }} />
                <TouchableOpacity onPress={sendRecording} style={styles.sendVoiceBtn}>
                  <Ionicons name="send" size={18} color={colors.white} />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.micBtn} onPress={startRecording}>
                <Ionicons name="mic" size={24} color={colors.primary} />
                <Text style={styles.micText}>Tap to Record</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {messages.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Messages</Text>
            {messages.map((msg) => (
              <View key={msg.id} style={styles.msgItem}>
                <Text style={styles.msgSender}>{msg.senderName}</Text>
                <Text style={styles.msgText}>{msg.originalText}</Text>
                {msg.translations?.map((t) => (
                  <Text key={t.language} style={styles.msgTranslation}>
                    [{t.language.toUpperCase()}] {t.translatedText || t.text}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        )}

        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Participants</Text>
            <Text style={styles.badge}>{participants.length}</Text>
          </View>
          {participants.length === 0 ? (
            <Text style={styles.emptyText}>No participants yet</Text>
          ) : (
            participants.map((p) => (
              <View key={p.id} style={styles.participantRow}>
                <View style={[styles.connDot, { backgroundColor: p.isConnected ? colors.success : colors.destructive }]} />
                <Text style={styles.pName}>{p.name}</Text>
                <Text style={styles.pLang}>{p.targetLanguage?.toUpperCase()}</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  scroll: { padding: spacing.lg, gap: spacing.lg, paddingBottom: 40 },
  card: { backgroundColor: colors.card, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  closedBanner: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md,
    backgroundColor: "rgba(239,68,68,0.1)", borderRadius: radii.md,
  },
  closedText: { color: colors.destructive, fontWeight: "500" },
  qrCenter: { alignItems: "center", paddingVertical: spacing.md },
  copyBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, marginTop: spacing.md },
  copyText: { color: colors.primary, fontWeight: "500", fontSize: 14 },
  recRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.destructive },
  recTimer: { fontSize: 14, color: colors.destructive, fontVariant: ["tabular-nums"] },
  recLabel: { color: colors.primary, fontSize: 14 },
  sendVoiceBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.destructive, justifyContent: "center", alignItems: "center" },
  micBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, paddingVertical: spacing.sm },
  micText: { color: colors.primary, fontWeight: "500" },
  sectionTitle: { fontSize: 15, fontWeight: "600", color: colors.foreground, marginBottom: spacing.sm },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  badge: { fontSize: 12, color: colors.mutedForeground, backgroundColor: colors.secondary, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radii.full },
  msgItem: { paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  msgSender: { fontSize: 12, fontWeight: "600", color: colors.primary, marginBottom: 2 },
  msgText: { fontSize: 14, color: colors.foreground, lineHeight: 20 },
  msgTranslation: { fontSize: 13, color: colors.mutedForeground, marginTop: 4, fontStyle: "italic" },
  emptyText: { fontSize: 13, color: colors.mutedForeground, textAlign: "center", paddingVertical: spacing.md },
  participantRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm },
  connDot: { width: 6, height: 6, borderRadius: 3 },
  pName: { flex: 1, fontSize: 14, color: colors.foreground },
  pLang: { fontSize: 12, color: colors.mutedForeground, backgroundColor: colors.secondary, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radii.sm },
});
