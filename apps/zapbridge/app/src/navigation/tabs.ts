import { TabKey } from '../components/WhatsAppTabBar';

const TITLES: Record<string, string> = {
  updates: 'Atualizações',
  calls: 'Ligações',
  communities: 'Comunidades',
};

// Roteia o toque numa aba da barra inferior para a tela correspondente.
// Conversas → lista; Você → Configurações; demais → tela "em breve".
export function routeTab(navigation: any, key: TabKey) {
  if (key === 'chats') navigation.navigate('ChatList');
  else if (key === 'you') navigation.navigate('Settings');
  else navigation.navigate('ComingSoon', { tab: key, title: TITLES[key] ?? '' });
}
