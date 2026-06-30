// Ícones SVG no estilo WhatsApp/iOS (react-native-svg, já dependência).
// Cada ícone aceita { size, color } e usa viewBox 0 0 24 24.
import React from 'react';
import Svg, { Path, Circle } from 'react-native-svg';

type P = { size?: number; color?: string };

export const IconSearch = ({ size = 18, color = '#8d8d93' }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path
      fill={color}
      d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 10-.7.7l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0A4.5 4.5 0 119.5 5a4.5 4.5 0 010 9z"
    />
  </Svg>
);

export const IconCamera = ({ size = 22, color = '#e9edef' }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path
      fill={color}
      d="M9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15a5 5 0 110-10 5 5 0 010 10z"
    />
  </Svg>
);

export const IconPlus = ({ size = 22, color = '#0b0b0b' }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path fill={color} d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
  </Svg>
);

export const IconDots = ({ size = 20, color = '#e9edef' }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Circle cx="5" cy="12" r="2" fill={color} />
    <Circle cx="12" cy="12" r="2" fill={color} />
    <Circle cx="19" cy="12" r="2" fill={color} />
  </Svg>
);

export const IconArchive = ({ size = 20, color = '#8d8d93' }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path
      fill={color}
      d="M20.54 5.23l-1.39-1.68C18.88 3.21 18.47 3 18 3H6c-.47 0-.88.21-1.16.55L3.46 5.23C3.17 5.57 3 6.02 3 6.5V19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6.5c0-.48-.17-.93-.46-1.27zM12 17.5L6.5 12H10v-2h4v2h3.5L12 17.5zM5.12 5l.81-1h12l.94 1H5.12z"
    />
  </Svg>
);

// ✓✓ (lida = azul; entregue/enviada = cinza). singleCheck mostra um ✓ só.
export const IconCheck = ({ size = 16, color = '#8d8d93', double = true }: P & { double?: boolean }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path
      fill={color}
      d="M17.6 6.5l-7.9 9.2-3.3-3.3-1.1 1.1 4.4 4.4 9-10.5z"
    />
    {double && (
      <Path
        fill={color}
        d="M22 6.5l-7.9 9.2-.9-.9-1 1.2 2 2 9-10.5z"
      />
    )}
  </Svg>
);

// ——— Ícones da barra inferior (tab bar) ———

export const IconUpdates = ({ size = 26, color = '#8d8d93' }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Circle cx="12" cy="12" r="3.2" fill={color} />
    <Path
      fill={color}
      d="M12 3a9 9 0 100 18 9 9 0 000-18zm0 1.6a7.4 7.4 0 110 14.8 7.4 7.4 0 010-14.8z"
      opacity={0.5}
    />
  </Svg>
);

export const IconCalls = ({ size = 24, color = '#8d8d93' }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path
      fill={color}
      d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"
    />
  </Svg>
);

export const IconCommunities = ({ size = 26, color = '#8d8d93' }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path
      fill={color}
      d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"
    />
  </Svg>
);

export const IconChats = ({ size = 25, color = '#8d8d93', filled = false }: P & { filled?: boolean }) =>
  filled ? (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill={color}
        d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"
      />
    </Svg>
  ) : (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill={color}
        d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"
      />
    </Svg>
  );

export const IconPerson = ({ size = 26, color = '#8d8d93' }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path
      fill={color}
      d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
    />
  </Svg>
);

export const IconChevronRight = ({ size = 18, color = '#8d8d93' }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
  </Svg>
);
