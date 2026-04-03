import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator,
  Modal, FlatList, Share,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  useAudioRecorder,
  createAudioPlayer,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from "expo-audio";
import QRCode from "react-native-qrcode-svg";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { colors, radii, spacing } from "../../theme";
import { api } from "../../services/api";
import type { VoiceMessage, RoomParticipant } from "../../types";

const LANGUAGES = [
  { id: "en", label: "English" }, { id: "es", label: "Spanish" }, { id: "fr", label: "French" },
  { id: "de", label: "German" }, { id: "it", label: "Italian" }, { id: "pt", label: "Portuguese" },
  { id: "ru", label: "Russian" }, { id: "zh", label: "Chinese" }, { id: "ja", label: "Japanese" },
  { id: "ko", label: "Korean" }, { id: "ar", label: "Arabic" }, { id: "hi", label: "Hindi" },
  { id: "tr", label: "Turkish" }, { id: "nl", label: "Dutch" }, { id: "pl", label: "Polish" },
  { id: "sv", label: "Swedish" }, { id: "uk", label: "Ukrainian" }, { id: "sk", label: "Slovak" },
];

export function RoomDetailScreen({ route, navigation }: any) {
  const { roomId } = route.params;
  const [room, setRoom] = useState<any>(null);
  const [isHost, setIsHost] = useState(true);
  const [participants, setParticipants] = useState<RoomParticipant[]>([]);
  const [messages, setMessages] = useState<VoiceMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [langPickerFor, setLangPickerFor] = useState<string | null>(null);
  const [showSharePanel, setShowSharePanel] = useState(false);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const playerRef = useRef<ReturnType<typeof createAudioPlayer> | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const mountedRef = useRef(true);
  const prevMsgCountRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    loadRoom();
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
      try { playerRef.current?.release(); } catch {}
    };
  }, []);

  const loadRoom = async () => {
    try {
      const data = await api.request<any>(`/api/rooms/${roomId}`);
      setRoom(data);
      setIsHost(data.isHost !== false);
      setParticipants(data.participants || []);
      setMessages(data.messages || []);
      prevMsgCountRef.current = (data.messages || []).length;
      navigation.setOptions({ title: data.name || "Room" });

      // Start polling for real-time updates (SSE doesn't work reliably in React Native)
      if (data.status !== "closed") {
        startPolling();
      }
    } catch {
      Alert.alert("Error", "Failed to load room");
    }
    setLoading(false);
  };

  const startPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      if (!mountedRef.current) return;
      try {
        const data = await api.request<any>(`/api/rooms/${roomId}`);
        if (!mountedRef.current) return;

        setParticipants(data.participants || []);

        const newMessages = data.messages || [];
        if (newMessages.length > prevMsgCountRef.current) {
          setMessages(newMessages);
          // Notify for new messages
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
        }
        prevMsgCountRef.current = newMessages.length;

        // Update room status
        if (data.status) {
          setRoom((prev: any) => prev ? { ...prev, status: data.status } : prev);
          if (data.status === "closed" && pollRef.current) {
            clearInterval(pollRef.current);
          }
        }
      } catch {
        // Silent — will retry next interval
      }
    }, 3000); // Poll every 3 seconds
  };

  // Voice recording
  const startRecording = async () => {
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission Required", "Microphone access is needed for voice messages.");
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setIsRecording(true);
      setRecordDuration(0);
      timerRef.current = setInterval(() => setRecordDuration((d) => d + 1), 1000);
    } catch {
      Alert.alert("Error", "Failed to start recording");
    }
  };

  const cancelRecording = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    try { recorder.stop(); } catch {}
    await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    setIsRecording(false);
    setRecordDuration(0);
  };

  const sendRecording = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!isRecording) return;
    try {
      recorder.stop();
      const uri = recorder.uri;
      setIsRecording(false);
      setRecordDuration(0);
      await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
      if (!uri) return;
      setUploading(true);
      await api.uploadRoomVoice(roomId, uri);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("Error", "Failed to send voice message");
    }
    setUploading(false);
  };

  // Audio playback
  const playMessage = async (msg: any) => {
    // Toggle off if already playing this message
    if (playingId === msg.id) {
      try {
        playerRef.current?.pause();
        playerRef.current?.release();
        playerRef.current = null;
      } catch {}
      setPlayingId(null);
      return;
    }

    // Find audio URL from translations
    let audioSrc: string | null = null;
    for (const t of msg.translations || []) {
      if (t.audioUrl) {
        audioSrc = `${api.baseUrl}${t.audioUrl}`;
        break;
      }
    }
    if (!audioSrc) {
      Alert.alert("No Audio", "This message has no audio available.");
      return;
    }

    try {
      // Release previous player
      try {
        playerRef.current?.pause();
        playerRef.current?.release();
        playerRef.current = null;
      } catch {}

      // Set audio mode for playback
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });

      // Create player with the audio URL
      const newPlayer = createAudioPlayer(audioSrc);
      playerRef.current = newPlayer;
      setPlayingId(msg.id);

      // Listen for status changes
      newPlayer.addListener("playbackStatusUpdate", (status: any) => {
        if (status.didJustFinish) {
          setPlayingId(null);
          try { newPlayer.release(); } catch {}
          if (playerRef.current === newPlayer) playerRef.current = null;
        }
        // Auto-play once loaded
        if (status.isLoaded && !status.playing && !status.didJustFinish) {
          try { newPlayer.play(); } catch {}
        }
      });
    } catch (e: any) {
      console.warn("Playback error:", e?.message || e);
      setPlayingId(null);
    }
  };

  const hasAudio = (msg: any) => {
    return msg.translations?.some((t: any) => t.audioUrl || t.audioBase64);
  };

  const changeLanguage = async (participantId: string, lang: string) => {
    try {
      const res = await api.request(`/api/rooms/${roomId}/participants/${participantId}`, {
        method: "PATCH",
        body: { targetLanguage: lang },
      });
      setParticipants((prev) =>
        prev.map((p) => (p.id === participantId ? { ...p, targetLanguage: lang } : p))
      );
      setLangPickerFor(null);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("Error", "Failed to change language");
    }
  };

  const copyLink = async () => {
    if (!room) return;
    await Clipboard.setStringAsync(`${api.baseUrl}/room/${room.code}`);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert("Copied", "Room link copied to clipboard");
  };

  const shareRoom = async () => {
    if (!room) return;
    const link = `${api.baseUrl}/room/${room.code}`;
    await Share.share({
      message: `Join my Lumino translation room "${room.name}": ${link}`,
      title: "Join Lumino Room",
    });
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

        {room.status !== "closed" && isHost && (
          <View style={styles.card}>
            {/* Invite bar */}
            <View style={styles.inviteBar}>
              <Text style={styles.inviteTitle}>Invite Participants</Text>
              <View style={styles.inviteBtns}>
                <TouchableOpacity style={styles.shareBtn} onPress={shareRoom}>
                  <Ionicons name="share-outline" size={16} color={colors.white} />
                  <Text style={styles.shareBtnText}>Share</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.copyBtn, showSharePanel && styles.copyBtnActive]}
                  onPress={() => setShowSharePanel(!showSharePanel)}
                >
                  <Ionicons name={showSharePanel ? "chevron-up" : "qr-code-outline"} size={16} color={colors.primary} />
                  <Text style={styles.copyText}>{showSharePanel ? "Hide" : "QR / Link"}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Expandable QR + Copy Link panel */}
            {showSharePanel && (
              <View style={styles.qrPanel}>
                <View style={styles.qrCenter}>
                  <QRCode value={roomLink} size={160} backgroundColor="transparent" color={colors.foreground} />
                </View>
                <TouchableOpacity style={styles.copyLinkRow} onPress={copyLink}>
                  <Text style={styles.linkText} numberOfLines={1}>{roomLink}</Text>
                  <Ionicons name="copy-outline" size={14} color={colors.primary} />
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {room.status !== "closed" && (
          <View style={styles.card}>
            {uploading ? (
              <View style={styles.recRow}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.recLabel}>Sending...</Text>
              </View>
            ) : isRecording ? (
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
                <View style={styles.msgHeader}>
                  <Text style={styles.msgSender}>{msg.senderName}</Text>
                  {hasAudio(msg) && (
                    <TouchableOpacity onPress={() => playMessage(msg)} style={styles.playBtn}>
                      <Ionicons
                        name={playingId === msg.id ? "pause-circle" : "play-circle"}
                        size={28}
                        color={playingId === msg.id ? colors.primary : colors.mutedForeground}
                      />
                    </TouchableOpacity>
                  )}
                </View>
                <Text style={styles.msgText}>{msg.originalText}</Text>
                {msg.translations?.map((t: any) => (
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
                {isHost ? (
                  <TouchableOpacity
                    onPress={() => setLangPickerFor(p.id)}
                    style={styles.pLangBtn}
                  >
                    <Text style={styles.pLangBtnText}>
                      {LANGUAGES.find((l) => l.id === p.targetLanguage)?.label || p.targetLanguage?.toUpperCase()}
                    </Text>
                    <Ionicons name="chevron-down" size={12} color={colors.primary} />
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.pLang}>{p.targetLanguage?.toUpperCase()}</Text>
                )}
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Language Picker Modal */}
      <Modal visible={!!langPickerFor} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Language</Text>
              <TouchableOpacity onPress={() => setLangPickerFor(null)}>
                <Ionicons name="close" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={LANGUAGES}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const current = participants.find((p) => p.id === langPickerFor);
                const isSelected = current?.targetLanguage === item.id;
                return (
                  <TouchableOpacity
                    style={[styles.langItem, isSelected && styles.langItemActive]}
                    onPress={() => langPickerFor && changeLanguage(langPickerFor, item.id)}
                  >
                    <Text style={[styles.langItemText, isSelected && { color: colors.primary, fontWeight: "600" }]}>
                      {item.label}
                    </Text>
                    {isSelected && <Ionicons name="checkmark" size={18} color={colors.primary} />}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>
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
  inviteBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  inviteTitle: { fontSize: 14, fontWeight: "600", color: colors.foreground },
  inviteBtns: { flexDirection: "row", gap: spacing.sm },
  shareBtn: { flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingHorizontal: 12, paddingVertical: 7, borderRadius: radii.md, backgroundColor: colors.primary },
  shareBtnText: { color: colors.white, fontWeight: "600", fontSize: 12 },
  copyBtn: { flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingHorizontal: 12, paddingVertical: 7, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border },
  copyBtnActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  copyText: { color: colors.primary, fontWeight: "500", fontSize: 12 },
  qrPanel: { marginTop: spacing.lg, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  qrCenter: { alignItems: "center", paddingVertical: spacing.sm },
  copyLinkRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, marginTop: spacing.md, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: colors.secondary, borderRadius: radii.md },
  linkText: { fontSize: 11, color: colors.mutedForeground, flex: 1 },
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
  msgHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 2 },
  msgSender: { fontSize: 12, fontWeight: "600", color: colors.primary },
  playBtn: { padding: 2 },
  msgText: { fontSize: 14, color: colors.foreground, lineHeight: 20 },
  msgTranslation: { fontSize: 13, color: colors.mutedForeground, marginTop: 4, fontStyle: "italic" },
  emptyText: { fontSize: 13, color: colors.mutedForeground, textAlign: "center", paddingVertical: spacing.md },
  participantRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm },
  connDot: { width: 6, height: 6, borderRadius: 3 },
  pName: { flex: 1, fontSize: 14, color: colors.foreground },
  pLang: { fontSize: 12, color: colors.mutedForeground, backgroundColor: colors.secondary, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radii.sm },
  pLangBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: colors.primaryLight, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radii.sm,
    borderWidth: 1, borderColor: "rgba(108,71,255,0.2)",
  },
  pLangBtnText: { fontSize: 12, color: colors.primary, fontWeight: "500" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modal: { backgroundColor: colors.card, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, maxHeight: "60%", paddingBottom: 30 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  modalTitle: { fontSize: 16, fontWeight: "600", color: colors.foreground },
  langItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  langItemActive: { backgroundColor: colors.primaryLight },
  langItemText: { fontSize: 15, color: colors.foreground },
});
