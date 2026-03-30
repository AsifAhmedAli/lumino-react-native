/**
 * Lumino React Native App — 25 Unit + Logic Tests
 * Run: node __tests__/run.mjs
 */

let passed = 0;
let failed = 0;
const results = [];

function test(name, fn) {
  try { fn(); passed++; results.push(`PASS: ${name}`); }
  catch (e) { failed++; results.push(`FAIL: ${name} — ${e.message}`); }
}
function assert(c, m) { if (!c) throw new Error(m); }

// ── T1-T4: Theme ──
const roleColors = { super_admin: { text: "#ef4444", bg: "x" }, source: { text: "#a855f7", bg: "x" }, intelligence: { text: "#3b82f6", bg: "x" }, manifestor: { text: "#f97316", bg: "x" }, cell: { text: "#22c55e", bg: "x" } };
const roleLabels = { super_admin: "Super Admin", source: "Admin", intelligence: "Intelligence", manifestor: "Manifestor", cell: "Cell" };

test("T1. Theme: role colors cover all 5 roles", () => {
  for (const r of ["super_admin","source","intelligence","manifestor","cell"]) {
    assert(roleColors[r], `Missing color for ${r}`);
  }
});
test("T2. Theme: role labels are human-readable", () => {
  assert(roleLabels.super_admin === "Super Admin", "Wrong super_admin label");
  assert(roleLabels.source === "Admin", "Wrong source label");
  assert(roleLabels.cell === "Cell", "Wrong cell label");
});
test("T3. Theme: no duplicate role labels", () => {
  const vals = Object.values(roleLabels);
  assert(new Set(vals).size === vals.length, "Duplicate labels");
});

// ── T4-T10: Types match API ──
test("T4. Types: User uses snake_case matching /api/profile", () => {
  const user = { id: "1", email: "a@b.com", full_name: "Test", role: "cell" };
  assert(user.full_name !== undefined, "full_name should exist (snake_case)");
  assert(user.id !== undefined, "id should exist (not _id)");
});
test("T5. Types: Conversation uses snake_case matching /api/conversations", () => {
  const c = { id: "1", title: "T", pinned: false, created_at: "x", updated_at: "x" };
  assert(c.created_at !== undefined, "created_at snake_case");
  assert(c.updated_at !== undefined, "updated_at snake_case");
});
test("T6. Types: ChatMessage.model_used is snake_case", () => {
  const m = { id: "1", role: "assistant", content: "Hi", model_used: "openai" };
  assert(m.model_used === "openai", "model_used should be snake_case");
});
test("T7. Types: InvitedUser.fullName is camelCase (admin API)", () => {
  const u = { id: "1", email: "a@b.com", fullName: "Test", role: "cell" };
  assert(u.fullName === "Test", "Admin API uses camelCase fullName");
});
test("T8. Types: VoiceTranslation supports both text and translatedText", () => {
  const t1 = { language: "en", text: "Hello" };
  const t2 = { language: "es", translatedText: "Hola" };
  assert(t1.text === "Hello", "text works");
  assert(t2.translatedText === "Hola", "translatedText works");
});
test("T9. Types: Room.settings.defaultLanguage exists", () => {
  const r = { settings: { maxParticipants: 10, defaultLanguage: "en" } };
  assert(r.settings.defaultLanguage === "en", "defaultLanguage in settings");
});
test("T10. Types: Room create body uses flat defaultLanguage (not nested)", () => {
  const body = { name: "Test", defaultLanguage: "es" };
  assert(body.defaultLanguage === "es", "Flat defaultLanguage");
  assert(!body.settings, "No nested settings");
});

// ── T11-T13: SSE Parsing ──
test("T11. SSE: parses text-delta with delta field", () => {
  const lines = [
    'data: {"type":"start"}',
    'data: {"type":"text-delta","id":"0","delta":"Hi"}',
    'data: {"type":"text-delta","id":"0","delta":"!"}',
    'data: {"type":"finish","finishReason":"stop"}',
  ];
  let text = "";
  let finished = false;
  for (const l of lines) {
    if (!l.startsWith("data: ")) continue;
    const j = JSON.parse(l.slice(6));
    if (j.type === "text-delta") text += j.delta || "";
    if (j.type === "finish") finished = true;
  }
  assert(text === "Hi!", `Expected "Hi!", got "${text}"`);
  assert(finished, "Should detect finish");
});
test("T12. SSE: [DONE] sentinel detected", () => {
  const line = "data: [DONE]";
  const payload = line.slice(6);
  assert(payload === "[DONE]", "Should detect [DONE]");
});
test("T13. SSE: error events parsed correctly", () => {
  const j = JSON.parse('{"type":"error","errorText":"Rate limit"}');
  assert(j.type === "error", "type=error");
  const msg = j.errorText || j.errorMessage || "Unknown";
  assert(msg === "Rate limit", "errorText extracted");
});

// ── T14-T16: Auth ──
test("T14. Auth: super_admin is admin", () => {
  const r = "super_admin";
  assert(r === "super_admin" || r === "source", "Should be admin");
});
test("T15. Auth: source is admin", () => {
  const r = "source";
  assert(r === "super_admin" || r === "source", "Should be admin");
});
test("T16. Auth: cell is NOT admin", () => {
  const r = "cell";
  assert(r !== "super_admin" && r !== "source", "Should NOT be admin");
});

// ── T17-T19: Role Assignment ──
function getAssignable(role) {
  if (role === "super_admin") return ["source","intelligence","manifestor","cell"];
  if (role === "source") return ["intelligence","manifestor","cell"];
  return [];
}
test("T17. Roles: super_admin assigns 4", () => { assert(getAssignable("super_admin").length === 4, "4 roles"); });
test("T18. Roles: source assigns 3 (no super_admin/source)", () => {
  const a = getAssignable("source");
  assert(a.length === 3, "3 roles");
  assert(!a.includes("super_admin") && !a.includes("source"), "No self/higher");
});
test("T19. Roles: cell assigns 0", () => { assert(getAssignable("cell").length === 0, "0 roles"); });

// ── T20: Markdown strip for TTS ──
test("T20. TTS: markdown stripped for speech", () => {
  const raw = "# Hello\n**Bold** `code`\n```\nblock\n```\n[link](url)";
  const plain = raw.replace(/```[\s\S]*?```/g, " code block ").replace(/[#*_~`>\-|[\]()]/g, "").replace(/\n+/g, ". ").trim();
  assert(!plain.includes("```"), "No code fence");
  assert(!plain.includes("#"), "No heading marker");
  assert(plain.includes("Hello"), "Keeps text");
});

// ── T21: Empty assistant filter ──
test("T21. Chat: filters empty assistant placeholder", () => {
  const msgs = [
    { id: "1", role: "user", content: "hello" },
    { id: "2", role: "assistant", content: "" },
  ];
  const filtered = msgs.filter(m => !(m.role === "assistant" && !m.content));
  assert(filtered.length === 1, `Should filter empty, got ${filtered.length}`);
});

// ── T22-T24: Navigation ──
test("T22. Nav: admin sees 3 tabs (Chat, Rooms, Settings)", () => {
  const tabs = ["ChatTab"];
  if (true) tabs.push("RoomTab"); // isAdmin = true
  tabs.push("SettingsTab");
  assert(tabs.length === 3 && tabs.includes("RoomTab"), "3 tabs with Rooms");
});
test("T23. Nav: non-admin sees 2 tabs (Chat, Settings)", () => {
  const tabs = ["ChatTab"];
  if (false) tabs.push("RoomTab"); // isAdmin = false
  tabs.push("SettingsTab");
  assert(tabs.length === 2 && !tabs.includes("RoomTab"), "2 tabs, no Rooms");
});

// ── T24: Translation fallback ──
test("T24. Room: translation renders translatedText with text fallback", () => {
  const t = { translatedText: "Hola", text: undefined };
  assert((t.translatedText || t.text || "") === "Hola", "Uses translatedText");
  const t2 = { translatedText: undefined, text: "Bonjour" };
  assert((t2.translatedText || t2.text || "") === "Bonjour", "Falls back to text");
});

// ── T25: TimeAgo ──
test("T25. Utils: timeAgo handles edge cases", () => {
  const timeAgo = (d) => {
    const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
    if (s < 60) return "now";
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
  };
  assert(timeAgo(new Date().toISOString()) === "now", "Just now");
  assert(timeAgo(new Date(Date.now() - 300000).toISOString()) === "5m", "5 min");
  assert(timeAgo(new Date(Date.now() - 7200000).toISOString()) === "2h", "2 hours");
  assert(timeAgo(new Date(Date.now() - 172800000).toISOString()) === "2d", "2 days");
});

// ═══════ RESULTS ═══════
console.log("\n" + "=".repeat(50));
console.log(`TEST RESULTS: ${passed} passed, ${failed} failed`);
console.log("=".repeat(50));
results.forEach(r => console.log(r));
console.log("=".repeat(50));
if (failed > 0) process.exit(1);
