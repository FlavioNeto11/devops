// Paletas fiéis ao WhatsApp Web (clara e escura). Cores próprias/aproximadas —
// sem usar logo/identidade oficial.

export interface Palette {
  bg: string; // área de conversa (fundo)
  surface: string; // painel (lista/colunas)
  surfaceAlt: string; // cabeçalho/inputs
  header: string; // barra superior
  primary: string;
  primaryDark: string;
  bubbleOut: string; // balão enviado
  bubbleIn: string; // balão recebido
  bubbleOutText: string;
  bubbleInText: string;
  text: string;
  textMuted: string;
  danger: string;
  warning: string;
  border: string;
  badge: string;
  link: string; // ✓✓ lida
  chatPattern: string; // fundo da área de mensagens
}

export const darkColors: Palette = {
  bg: '#0b141a',
  surface: '#111b21',
  surfaceAlt: '#202c33',
  header: '#202c33',
  primary: '#00a884',
  primaryDark: '#017561',
  bubbleOut: '#005c4b',
  bubbleIn: '#202c33',
  bubbleOutText: '#e9edef',
  bubbleInText: '#e9edef',
  text: '#e9edef',
  textMuted: '#8696a0',
  danger: '#f15c6d',
  warning: '#e0a23b',
  border: '#2f3b43',
  badge: '#00a884',
  link: '#53bdeb',
  chatPattern: '#0b141a',
};

export const lightColors: Palette = {
  bg: '#efeae2',
  surface: '#ffffff',
  surfaceAlt: '#f0f2f5',
  header: '#f0f2f5',
  primary: '#00a884',
  primaryDark: '#008069',
  bubbleOut: '#d9fdd3',
  bubbleIn: '#ffffff',
  bubbleOutText: '#111b21',
  bubbleInText: '#111b21',
  text: '#111b21',
  textMuted: '#667781',
  danger: '#e2453a',
  warning: '#b88217',
  border: '#e9edef',
  badge: '#25d366',
  link: '#027eb5',
  chatPattern: '#efeae2',
};

// Fallback estático (escuro) — usado por arquivos ainda não tematizados.
export const colors = darkColors;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
};

export type ThemeName = 'system' | 'light' | 'dark';
