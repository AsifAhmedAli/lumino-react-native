import React from "react";
import { ActivityIndicator, View } from "react-native";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme";
import { useAuthStore } from "../store/auth";

// Auth screens
import { LoginScreen } from "../screens/auth/LoginScreen";
import { SignupScreen } from "../screens/auth/SignupScreen";
import { VerifyOTPScreen } from "../screens/auth/VerifyOTPScreen";
import { ForgotPasswordScreen } from "../screens/auth/ForgotPasswordScreen";

// Main screens
import { ConversationsScreen } from "../screens/chat/ConversationsScreen";
import { ChatScreen } from "../screens/chat/ChatScreen";
import { RoomListScreen } from "../screens/room/RoomListScreen";
import { RoomDetailScreen } from "../screens/room/RoomDetailScreen";
import { SettingsScreen } from "../screens/settings/SettingsScreen";

const darkTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.primary,
    background: colors.background,
    card: colors.card,
    text: colors.foreground,
    border: colors.border,
    notification: colors.primary,
  },
};

const AuthStack = createNativeStackNavigator();
const MainStack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const ChatStack = createNativeStackNavigator();
const RoomStack = createNativeStackNavigator();

function ChatNavigator() {
  return (
    <ChatStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.foreground,
        headerShadowVisible: false,
      }}
    >
      <ChatStack.Screen name="Conversations" component={ConversationsScreen} options={{ title: "Chats" }} />
      <ChatStack.Screen name="Chat" component={ChatScreen} options={{ title: "New Chat" }} />
    </ChatStack.Navigator>
  );
}

function RoomNavigator() {
  return (
    <RoomStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.foreground,
        headerShadowVisible: false,
      }}
    >
      <RoomStack.Screen name="Rooms" component={RoomListScreen} options={{ title: "Translation Rooms" }} />
      <RoomStack.Screen name="RoomDetail" component={RoomDetailScreen} options={{ title: "Room" }} />
    </RoomStack.Navigator>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          borderTopWidth: 0.5,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarIcon: ({ color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap = "chatbubbles";
          if (route.name === "ChatTab") iconName = "chatbubbles";
          else if (route.name === "RoomTab") iconName = "globe";
          else if (route.name === "SettingsTab") iconName = "settings";
          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="ChatTab" component={ChatNavigator} options={{ title: "Chats" }} />
      <Tab.Screen name="RoomTab" component={RoomNavigator} options={{ title: "Rooms" }} />
      <Tab.Screen name="SettingsTab" component={SettingsScreen} options={{ title: "Settings", headerShown: true, headerStyle: { backgroundColor: colors.background }, headerTintColor: colors.foreground, headerShadowVisible: false }} />
    </Tab.Navigator>
  );
}

function AuthNavigator() {
  return (
    <AuthStack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Signup" component={SignupScreen} />
      <AuthStack.Screen name="VerifyOTP" component={VerifyOTPScreen} />
      <AuthStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </AuthStack.Navigator>
  );
}

export function Navigation() {
  const { user, loading, initialized } = useAuthStore();

  if (!initialized || loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer theme={darkTheme}>
      {user ? <MainTabs /> : <AuthNavigator />}
    </NavigationContainer>
  );
}
