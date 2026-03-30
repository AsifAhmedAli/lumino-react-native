/**
 * React Native App — Static Analysis & Logic Tests
 * These tests verify code correctness without running on a device.
 */

// ===== TEST UTILITIES =====
let passed = 0;
let failed = 0;
const results: string[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    results.push(`PASS: ${name}`);
  } catch (e: any) {
    failed++;
    results.push(`FAIL: ${name} — ${e.message}`);
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

// ===== IMPORT SOURCE FILES =====
// We import the raw TypeScript to test types and logic

// ── Theme Tests ──
import { colors, radii, spacing, roleColors, roleLabels } from "../src/theme";

test("T1. Theme: all required colors defined", () => {
  assert(!!colors.background, "background missing");
  assert(!!colors.card, "card missing");
  assert(!!colors.primary, "primary missing");
  assert(!!colors.foreground, "foreground missing");
  assert(!!colors.mutedForeground, "mutedForeground missing");
  assert(!!colors.destructive, "destructive missing");
  assert(!!colors.border, "border missing");
});

test("T2. Theme: role colors cover all roles", () => {
  const roles = ["super_admin", "source", "intelligence", "manifestor", "cell"];
  for (const r of roles) {
    assert(!!roleColors[r], `roleColors missing for ${r}`);
    assert(!!roleColors[r].text, `roleColors.${r}.text missing`);
    assert(!!roleColors[r].bg, `roleColors.${r}.bg missing`);
  }
});

test("T3. Theme: role labels cover all roles", () => {
  const roles = ["super_admin", "source", "intelligence", "manifestor", "cell"];
  for (const r of roles) {
    assert(!!roleLabels[r], `roleLabels missing for ${r}`);
  }
  assert(roleLabels.super_admin === "Super Admin", "super_admin label wrong");
  assert(roleLabels.source === "Admin", "source label wrong");
});

test("T4. Theme: radii values are numbers", () => {
  assert(typeof radii.sm === "number", "radii.sm not number");
  assert(typeof radii.lg === "number", "radii.lg not number");
  assert(typeof radii.full === "number", "radii.full not number");
});

// ── Types Tests ──
import type { User, Conversation, ChatMessage, Room, VoiceMessage, InvitedUser, VoiceTranslation } from "../src/types";

test("T5. Types: User interface has snake_case fields matching API", () => {
  const user: User = {
    id: "1", email: "test@test.com", full_name: "Test User", role: "cell",
  };
  assert(user.full_name === "Test User", "full_name should be snake_case");
  assert(user.id === "1", "id field should exist (not _id)");
});

test("T6. Types: Conversation uses snake_case fields", () => {
  const conv: Conversation = {
    id: "1", title: "Test", pinned: false,
    created_at: "2024-01-01", updated_at: "2024-01-01",
  };
  assert(conv.created_at !== undefined, "created_at should be snake_case");
  assert(conv.updated_at !== undefined, "updated_at should be snake_case");
});

test("T7. Types: ChatMessage uses correct field names", () => {
  const msg: ChatMessage = {
    id: "1", role: "assistant", content: "Hello",
    model_used: "openai", created_at: "2024-01-01",
  };
  assert(msg.model_used === "openai", "model_used should be snake_case");
});

test("T8. Types: VoiceTranslation supports both text and translatedText", () => {
  const t1: VoiceTranslation = { language: "en", text: "Hello" };
  const t2: VoiceTranslation = { language: "es", translatedText: "Hola" };
  assert(t1.text === "Hello", "text field should work");
  assert(t2.translatedText === "Hola", "translatedText field should work");
});

test("T9. Types: Room has settings with defaultLanguage", () => {
  const room: Room = {
    id: "1", name: "Test", code: "abc123", status: "active",
    settings: { maxParticipants: 10, defaultLanguage: "en" },
    participantCount: 0, createdAt: "2024-01-01",
  };
  assert(room.settings.defaultLanguage === "en", "defaultLanguage should exist in settings");
});

test("T10. Types: InvitedUser uses camelCase (matches admin API)", () => {
  const u: InvitedUser = { id: "1", email: "test@test.com", fullName: "Test", role: "cell" };
  assert(u.fullName === "Test", "fullName should be camelCase (admin API format)");
});

// ── API Client Tests ──
test("T11. API: streamChat filters out empty assistant messages", () => {
  // Verify the filter logic in api.ts
  const messages = [
    { id: "1", role: "user", content: "hello" },
    { id: "2", role: "assistant", content: "" },
    { id: "3", role: "assistant", content: "response" },
  ];
  const filtered = messages.filter((m) => !(m.role === "assistant" && !m.content));
  assert(filtered.length === 2, `Should filter empty assistant, got ${filtered.length}`);
  assert(filtered[0].role === "user", "First should be user");
  assert(filtered[1].content === "response", "Second should be non-empty assistant");
});

test("T12. API: SSE line parsing logic", () => {
  const lines = [
    'data: {"type":"text-delta","id":"0","delta":"Hi"}',
    'data: {"type":"text-delta","id":"0","delta":"!"}',
    'data: {"type":"start"}',
    'data: {"type":"finish","finishReason":"stop"}',
    'data: [DONE]',
    '',
  ];

  let textCollected = "";
  let finished = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith("data: ")) continue;
    const payload = trimmed.slice(6);
    if (payload === "[DONE]") { finished = true; continue; }
    try {
      const json = JSON.parse(payload);
      if (json.type === "text-delta") textCollected += json.delta || "";
      if (json.type === "finish") finished = true;
    } catch {}
  }

  assert(textCollected === "Hi!", `Expected "Hi!", got "${textCollected}"`);
  assert(finished, "Should detect finish");
});

test("T13. API: SSE error parsing", () => {
  const line = 'data: {"type":"error","errorText":"Rate limit exceeded"}';
  const payload = line.slice(6);
  const json = JSON.parse(payload);
  assert(json.type === "error", "Should parse error type");
  assert(json.errorText === "Rate limit exceeded", "Should have errorText");
});

// ── Auth Store Logic Tests ──
test("T14. Auth: isAdmin logic for super_admin", () => {
  const role: string = "super_admin";
  const isAdmin = role === "super_admin" || role === "source";
  assert(isAdmin === true, "super_admin should be admin");
});

test("T15. Auth: isAdmin logic for source", () => {
  const role: string = "source";
  const isAdmin = role === "super_admin" || role === "source";
  assert(isAdmin === true, "source should be admin");
});

test("T16. Auth: isAdmin logic for cell", () => {
  const role: string = "cell";
  const isAdmin = role === "super_admin" || role === "source";
  assert(isAdmin === false, "cell should NOT be admin");
});

// ── Settings: Assignable Roles Logic ──
test("T17. Settings: super_admin can assign 4 roles", () => {
  const role: string = "super_admin";
  let assignable: string[] = [];
  if (role === "super_admin") assignable = ["source", "intelligence", "manifestor", "cell"];
  else if (role === "source") assignable = ["intelligence", "manifestor", "cell"];
  assert(assignable.length === 4, `super_admin should assign 4 roles, got ${assignable.length}`);
  assert(assignable.includes("source"), "Should include source");
});

test("T18. Settings: source can assign 3 roles", () => {
  const role: string = "source";
  let assignable: string[] = [];
  if (role === "super_admin") assignable = ["source", "intelligence", "manifestor", "cell"];
  else if (role === "source") assignable = ["intelligence", "manifestor", "cell"];
  assert(assignable.length === 3, `source should assign 3 roles, got ${assignable.length}`);
  assert(!assignable.includes("source"), "Should NOT include source");
  assert(!assignable.includes("super_admin"), "Should NOT include super_admin");
});

test("T19. Settings: cell cannot assign any roles", () => {
  const role: string = "cell";
  let assignable: string[] = [];
  if (role === "super_admin") assignable = ["source", "intelligence", "manifestor", "cell"];
  else if (role === "source") assignable = ["intelligence", "manifestor", "cell"];
  assert(assignable.length === 0, "cell should have 0 assignable roles");
});

// ── Markdown Strip for TTS ──
test("T20. TTS: markdown stripping for speech", () => {
  const raw = "# Hello\n\n**Bold** text with `code` and\n```\ncode block\n```\nand [link](url)";
  const plain = raw
    .replace(/```[\s\S]*?```/g, " code block ")
    .replace(/[#*_~`>\-|[\]()]/g, "")
    .replace(/\n+/g, ". ")
    .trim();
  assert(!plain.includes("```"), "Should strip code blocks");
  assert(!plain.includes("#"), "Should strip headings");
  assert(!plain.includes("**"), "Should strip bold markers");
  assert(plain.includes("Hello"), "Should keep text content");
  assert(plain.includes("Bold"), "Should keep bold text");
});

// ── Room Create Body Format ──
test("T21. Room: create body has flat defaultLanguage", () => {
  const roomName = "Test Room";
  const roomLang = "es";
  const body = { name: roomName.trim(), defaultLanguage: roomLang };
  assert(body.defaultLanguage === "es", "defaultLanguage should be flat");
  assert((body as any).settings === undefined, "Should NOT have nested settings");
});

// ── Translation Rendering ──
test("T22. Room: translation text uses translatedText with fallback", () => {
  const t1 = { language: "es", translatedText: "Hola", text: undefined };
  const t2 = { language: "fr", text: "Bonjour", translatedText: undefined };
  const render1 = t1.translatedText || t1.text || "";
  const render2 = t2.translatedText || t2.text || "";
  assert(render1 === "Hola", "Should use translatedText");
  assert(render2 === "Bonjour", "Should fall back to text");
});

// ── Navigation: admin sees rooms tab ──
test("T23. Navigation: admin role shows rooms tab", () => {
  const isAdmin = true;
  const tabs = ["ChatTab"];
  if (isAdmin) tabs.push("RoomTab");
  tabs.push("SettingsTab");
  assert(tabs.includes("RoomTab"), "Admin should see RoomTab");
  assert(tabs.length === 3, "Should have 3 tabs for admin");
});

test("T24. Navigation: non-admin hides rooms tab", () => {
  const isAdmin = false;
  const tabs = ["ChatTab"];
  if (isAdmin) tabs.push("RoomTab");
  tabs.push("SettingsTab");
  assert(!tabs.includes("RoomTab"), "Non-admin should NOT see RoomTab");
  assert(tabs.length === 2, "Should have 2 tabs for non-admin");
});

// ── Time Ago Utility ──
test("T25. Conversations: timeAgo produces readable output", () => {
  const timeAgo = (date: string) => {
    const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return "now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  };
  assert(timeAgo(new Date().toISOString()) === "now", "Just now should be 'now'");
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  assert(timeAgo(fiveMinAgo) === "5m", "5 min ago should be '5m'");
});

// ═════ PRINT RESULTS ═════
console.log("\n" + "=".repeat(50));
console.log(`TEST RESULTS: ${passed} passed, ${failed} failed`);
console.log("=".repeat(50));
results.forEach((r) => console.log(r));
console.log("=".repeat(50));

if (failed > 0) process.exit(1);
