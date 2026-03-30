export interface User {
  id: string;
  email: string;
  full_name: string;
  role: string;
  avatar_url?: string | null;
  email_verified?: boolean;
  must_change_password?: boolean;
  color_scheme?: string;
  gradient_palette?: string;
  onboarding_done?: boolean;
  voice_name?: string;
  voice_rate?: number;
  voice_pitch?: number;
  created_at?: string;
  updated_at?: string;
}

export interface Conversation {
  id: string;
  user_id?: string;
  title: string;
  model_used?: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  model_used?: string;
  created_at?: string;
}

export interface Room {
  id: string;
  name: string;
  code: string;
  status: "active" | "paused" | "closed";
  settings: {
    maxParticipants: number;
    defaultLanguage: string;
  };
  participantCount: number;
  createdAt: string;
}

export interface RoomParticipant {
  id: string;
  name: string;
  targetLanguage: string;
  isConnected: boolean;
}

export interface VoiceMessage {
  id: string;
  senderName: string;
  originalText: string;
  translations: VoiceTranslation[];
  audioData?: string;
  createdAt: string;
}

export interface VoiceTranslation {
  language: string;
  text?: string;
  translatedText?: string;
  audioUrl?: string | null;
  audioBase64?: string;
}

export interface InvitedUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  mustChangePassword?: boolean;
  createdAt?: string;
}

export interface StreamPart {
  type: "text" | "start" | "start-step" | "finish-step" | "finish" | "tool-call" | "tool-result" | "error" | "unknown";
  data?: any;
}
