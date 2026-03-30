import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { colors, radii, spacing } from "../../theme";
import { api } from "../../services/api";
import { useAuthStore } from "../../store/auth";

export function VerifyOTPScreen({ route, navigation }: any) {
  const email = route.params?.email || "";
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const checkAuth = useAuthStore((s) => s.checkAuth);

  const handleVerify = async () => {
    if (otp.length !== 6) return;
    setLoading(true);
    try {
      await api.request("/api/auth/verify-otp", {
        method: "POST",
        body: { email, otp },
      });
      await checkAuth();
    } catch (err: any) {
      Alert.alert("Verification Failed", err.message);
    } finally {
      setLoading(false);
    }
  };

  const resendOTP = async () => {
    try {
      await api.request("/api/auth/resend-otp", { method: "POST", body: { email } });
      Alert.alert("Sent", "A new code has been sent to your email.");
    } catch (err: any) {
      Alert.alert("Error", err.message);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.inner}>
        <Text style={styles.title}>Verify Email</Text>
        <Text style={styles.subtitle}>Enter the 6-digit code sent to {email}</Text>

        <TextInput
          style={styles.input}
          placeholder="000000"
          placeholderTextColor={colors.mutedForeground}
          value={otp}
          onChangeText={setOtp}
          keyboardType="number-pad"
          maxLength={6}
          textAlign="center"
        />

        <TouchableOpacity style={[styles.button, loading && { opacity: 0.5 }]} onPress={handleVerify} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Verify</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={styles.link} onPress={resendOTP}>
          <Text style={styles.linkText}>Resend Code</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  inner: { flex: 1, justifyContent: "center", paddingHorizontal: spacing.xxl },
  title: { fontSize: 24, fontWeight: "700", color: colors.foreground, textAlign: "center", marginBottom: spacing.sm },
  subtitle: { fontSize: 14, color: colors.mutedForeground, textAlign: "center", marginBottom: 32 },
  input: {
    backgroundColor: colors.secondary, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border,
    paddingVertical: 16, color: colors.foreground, fontSize: 24, fontWeight: "700", letterSpacing: 8, marginBottom: spacing.md,
  },
  button: { backgroundColor: colors.primary, borderRadius: radii.md, paddingVertical: 14, alignItems: "center" },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  link: { marginTop: spacing.lg, alignItems: "center" },
  linkText: { color: colors.primary, fontSize: 14 },
});
