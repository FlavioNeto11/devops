import React, { useLayoutEffect } from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import { createNativeStackNavigator, NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuthStore } from '../store/auth.store';
import { useTheme } from '../theme/ThemeContext';

import { LandingScreen } from '../screens/LandingScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { RegisterScreen } from '../screens/RegisterScreen';
import { ConnectWhatsAppScreen } from '../screens/ConnectWhatsAppScreen';
import { ChatListScreen } from '../screens/ChatListScreen';
import { WebHome } from '../screens/WebHome';
import { ChatScreen } from '../screens/ChatScreen';
import { ContactsScreen } from '../screens/ContactsScreen';
import { GroupsScreen } from '../screens/GroupsScreen';
import { GroupDetailsScreen } from '../screens/GroupDetailsScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { MediaViewerScreen } from '../screens/MediaViewerScreen';
import { AiConsentScreen } from '../screens/AiConsentScreen';
import { AiAssistantScreen } from '../screens/AiAssistantScreen';
import { KnowledgeBaseScreen } from '../screens/KnowledgeBaseScreen';
import { AutoReplyConfigScreen } from '../screens/AutoReplyConfigScreen';

export type RootStackParamList = {
  Landing: undefined;
  Login: undefined;
  Register: undefined;
  ConnectWhatsApp: undefined;
  ChatList: undefined;
  Chat: { chatId: string; name: string | null; jid: string };
  Contacts: undefined;
  Groups: undefined;
  GroupDetails: { chatId: string; name: string | null };
  Settings: undefined;
  MediaViewer: { mediaId: string; type: string };
  AiConsent: undefined;
  AiAssistant: undefined;
  KnowledgeBase: undefined;
  AutoReplyConfig: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

// Rota inicial: duas colunas (WebHome) no desktop/web largo; lista mobile caso contrário.
function ChatListRoute(props: NativeStackScreenProps<RootStackParamList, 'ChatList'>) {
  const { width } = useWindowDimensions();
  const wide = Platform.OS === 'web' && width >= 900;
  useLayoutEffect(() => {
    props.navigation.setOptions({ headerShown: !wide });
  }, [wide, props.navigation]);
  return wide ? <WebHome {...props} /> : <ChatListScreen {...props} />;
}

export function RootNavigator() {
  const user = useAuthStore((s) => s.user);
  const colors = useTheme();

  const screenOptions = {
    headerStyle: { backgroundColor: colors.header },
    headerTintColor: colors.text,
    contentStyle: { backgroundColor: colors.bg },
  };

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      {!user ? (
        <>
          {Platform.OS === 'web' && (
            <Stack.Screen name="Landing" component={LandingScreen} options={{ headerShown: false }} />
          )}
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Register" component={RegisterScreen} options={{ title: 'Criar conta' }} />
        </>
      ) : (
        <>
          <Stack.Screen name="ChatList" component={ChatListRoute} options={{ title: 'ZapBridge' }} />
          <Stack.Screen
            name="ConnectWhatsApp"
            component={ConnectWhatsAppScreen}
            options={{ title: 'Conectar WhatsApp' }}
          />
          <Stack.Screen name="Chat" component={ChatScreen} options={{ title: 'Conversa' }} />
          <Stack.Screen name="Contacts" component={ContactsScreen} options={{ title: 'Contatos' }} />
          <Stack.Screen name="Groups" component={GroupsScreen} options={{ title: 'Grupos' }} />
          <Stack.Screen
            name="GroupDetails"
            component={GroupDetailsScreen}
            options={{ title: 'Detalhes do grupo' }}
          />
          <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Configurações' }} />
          <Stack.Screen name="MediaViewer" component={MediaViewerScreen} options={{ title: 'Mídia' }} />
          <Stack.Screen name="AiConsent" component={AiConsentScreen} options={{ title: 'Inteligência (IA)' }} />
          <Stack.Screen name="AiAssistant" component={AiAssistantScreen} options={{ title: 'Assistente' }} />
          <Stack.Screen name="KnowledgeBase" component={KnowledgeBaseScreen} options={{ title: 'Base de conhecimento' }} />
          <Stack.Screen name="AutoReplyConfig" component={AutoReplyConfigScreen} options={{ title: 'Auto-resposta' }} />
        </>
      )}
    </Stack.Navigator>
  );
}
