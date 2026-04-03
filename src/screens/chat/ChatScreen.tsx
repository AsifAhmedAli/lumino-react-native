import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  useAudioRecorder,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from "expo-audio";
import * as Speech from "expo-speech";
import { colors, radii, spacing } from "../../theme";
import { api } from "../../services/api";
import type { ChatMessage } from "../../types";
import Markdown from "react-native-markdown-display";

export function ChatScreen({ route, navigation }: any) {
  const initialConvId = route.params?.conversationId || null;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(!!initialConvId);
  const [convId, setConvId] = useState<string | null>(initialConvId);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const flatListRef = useRef<FlatList>(null);
  const streamTextRef = useRef("");
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const abortRef = useRef<{ abort: () => void } | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);

  // Keep messagesRef in sync
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  useEffect(() => {
    if (initialConvId) loadConversation();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      abortRef.current?.abort();
    };
  }, []);

  const loadConversation = async () => {
    try {
      const data = await api.request<{ title: string; messages: ChatMessage[] }>(
        `/api/conversations/${initialConvId}`
      );
      setMessages(data.messages || []);
      navigation.setOptions({ title: data.title || "Chat" });
    } catch {
      Alert.alert("Error", "Failed to load conversation");
    } finally {
      setLoadingMsgs(false);
    }
  };

  const scrollToEnd = useCallback(() => {
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 50);
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || streaming) return;
    setInput("");

    // Create conversation if this is the first message
    let currentConvId = convId;
    if (!currentConvId) {
      try {
        const res = await api.request<{ id: string }>("/api/conversations", {
          method: "POST",
          body: { title: "New Conversation" },
        });
        currentConvId = res.id;
        setConvId(currentConvId);
      } catch {
        Alert.alert("Error", "Failed to create conversation");
        return;
      }
    }

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text.trim(),
    };

    const assistantId = `a-${Date.now()}`;
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setStreaming(true);
    streamTextRef.current = "";
    scrollToEnd();

    const allMessages = [...messagesRef.current, userMsg].map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
    }));

    const handle = api.streamChat(
      allMessages,
      currentConvId,
      (delta) => {
        streamTextRef.current += delta;
        const currentText = streamTextRef.current;
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: currentText } : m))
        );
      },
      () => {
        setStreaming(false);
        scrollToEnd();
      },
      (err) => {
        setStreaming(false);
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
        Alert.alert("Error", err);
      }
    );
    abortRef.current = handle;
  }, [streaming, convId, scrollToEnd]);

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
  }, []);

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
      setTranscribing(true);
      const text = await api.uploadAudio(uri, "voice.m4a");
      setTranscribing(false);

      if (text.trim()) {
        sendMessage(text.trim());
      } else {
        Alert.alert("No Speech", "No speech detected. Please try again.");
      }
    } catch {
      setTranscribing(false);
      Alert.alert("Error", "Transcription failed");
    }
  };

  // TTS per message
  const speakMessage = (msg: ChatMessage) => {
    if (speakingId === msg.id) {
      Speech.stop();
      setSpeakingId(null);
      return;
    }
    Speech.stop();
    const plain = msg.content
      .replace(/```[\s\S]*?```/g, " code block ")
      .replace(/[#*_~`>\-|[\]()]/g, "")
      .replace(/\n+/g, ". ")
      .trim();
    if (!plain) return;
    setSpeakingId(msg.id);
    Speech.speak(plain, {
      language: "en-US",
      onDone: () => setSpeakingId(null),
      onStopped: () => setSpeakingId(null),
    });
  };

  const mdStyles: any = {
    body: { color: colors.foreground, fontSize: 15, lineHeight: 22 },
    heading1: { color: colors.foreground, fontSize: 22, fontWeight: "700" },
    heading2: { color: colors.foreground, fontSize: 19, fontWeight: "600" },
    heading3: { color: colors.foreground, fontSize: 17, fontWeight: "600" },
    code_inline: { color: colors.primary, backgroundColor: colors.secondary, borderRadius: 4, paddingHorizontal: 4 },
    code_block: { backgroundColor: colors.background, borderRadius: radii.sm, padding: 12, color: colors.foreground },
    fence: { backgroundColor: colors.background, borderRadius: radii.sm, padding: 12, color: colors.foreground },
    blockquote: { borderLeftColor: colors.primary, borderLeftWidth: 3, paddingLeft: 12, opacity: 0.8 },
    link: { color: colors.primary },
    strong: { fontWeight: "700", color: colors.foreground },
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isUser = item.role === "user";
    const isCurrentlyStreaming = streaming && item.id.startsWith("a-") && !item.content;
    return (
      <View style={[styles.msgRow, isUser && styles.msgRowUser]}>
        <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
          {isUser ? (
            <Text style={styles.userText}>{item.content}</Text>
          ) : isCurrentlyStreaming ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : item.content ? (
            <Markdown style={mdStyles}>{item.content}</Markdown>
          ) : null}
        </View>
        {!isUser && item.content && !streaming && (
          <View style={styles.actions}>
            <TouchableOpacity onPress={() => speakMessage(item)} style={styles.actionBtn}>
              <Ionicons
                name={speakingId === item.id ? "volume-mute" : "volume-medium"}
                size={14}
                color={speakingId === item.id ? colors.primary : colors.mutedForeground}
              />
              <Text style={[styles.actionText, speakingId === item.id && { color: colors.primary }]}>
                {speakingId === item.id ? "Stop" : "Listen"}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
      keyboardVerticalOffset={90}
    >
      {loadingMsgs ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.list}
          onLayout={scrollToEnd}
          ListEmptyComponent={
            <View style={styles.emptyChat}>
              <Text style={styles.emptyChatTitle}>Start a conversation</Text>
              <Text style={styles.emptyChatSub}>Type a message or use voice input</Text>
            </View>
          }
        />
      )}

      <View style={styles.inputBar}>
        {isRecording || transcribing ? (
          <View style={styles.voiceBar}>
            {transcribing ? (
              <>
                <ActivityIndicator color={colors.primary} size="small" />
                <Text style={styles.voiceLabel}>Transcribing...</Text>
              </>
            ) : (
              <>
                <TouchableOpacity onPress={cancelRecording}>
                  <Ionicons name="close-circle" size={28} color={colors.mutedForeground} />
                </TouchableOpacity>
                <View style={styles.recDot} />
                <Text style={styles.voiceTimer}>
                  {Math.floor(recordDuration / 60)}:{String(recordDuration % 60).padStart(2, "0")}
                </Text>
                <View style={{ flex: 1 }} />
                <TouchableOpacity onPress={sendRecording} style={styles.sendVoiceBtn}>
                  <Ionicons name="send" size={18} color={colors.white} />
                </TouchableOpacity>
              </>
            )}
          </View>
        ) : (
          <View style={styles.textBar}>
            <TouchableOpacity onPress={startRecording} disabled={streaming}>
              <Ionicons name="mic" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
            <TextInput
              style={styles.textInput}
              placeholder="Message Lumino..."
              placeholderTextColor={colors.mutedForeground}
              value={input}
              onChangeText={setInput}
              multiline
              maxLength={4000}
            />
            {streaming ? (
              <TouchableOpacity onPress={stopStreaming}>
                <View style={styles.stopBtn}>
                  <Ionicons name="stop" size={14} color={colors.white} />
                </View>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={() => sendMessage(input)} disabled={!input.trim()}>
                <View style={[styles.sendBtn, !input.trim() && { opacity: 0.4 }]}>
                  <Ionicons name="arrow-up" size={18} color={colors.white} />
                </View>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  list: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, flexGrow: 1 },
  msgRow: { marginBottom: spacing.md },
  msgRowUser: { alignItems: "flex-end" },
  bubble: { maxWidth: "85%", borderRadius: radii.lg, paddingHorizontal: 16, paddingVertical: 12 },
  bubbleUser: { backgroundColor: colors.primary, alignSelf: "flex-end" },
  bubbleAssistant: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignSelf: "flex-start" },
  userText: { color: colors.white, fontSize: 15, lineHeight: 22 },
  actions: { flexDirection: "row", paddingLeft: 8, paddingTop: 4, gap: 16 },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  actionText: { fontSize: 11, color: colors.mutedForeground },
  emptyChat: { flex: 1, justifyContent: "center", alignItems: "center", paddingTop: 200 },
  emptyChatTitle: { fontSize: 18, fontWeight: "500", color: colors.mutedForeground },
  emptyChatSub: { fontSize: 13, color: colors.mutedForeground, marginTop: 4 },
  inputBar: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.background },
  textBar: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: spacing.lg, paddingVertical: 10, gap: 8 },
  textInput: {
    flex: 1, backgroundColor: colors.secondary, borderRadius: radii.xl, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 16, paddingVertical: 10, color: colors.foreground, fontSize: 15, maxHeight: 120,
  },
  sendBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, justifyContent: "center", alignItems: "center" },
  stopBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.destructive, justifyContent: "center", alignItems: "center" },
  voiceBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: 12, gap: 12 },
  recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.destructive },
  voiceLabel: { fontSize: 14, color: colors.primary },
  voiceTimer: { fontSize: 14, color: colors.destructive, fontVariant: ["tabular-nums"] },
  sendVoiceBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.destructive, justifyContent: "center", alignItems: "center" },
});
