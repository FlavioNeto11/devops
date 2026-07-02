import React, { useEffect, useRef } from 'react';
import { Animated, View, StyleSheet } from 'react-native';
import { spacing, Palette } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';

function SkeletonRow({ phase = 0 }: { phase?: number }) {
  const colors = useTheme();
  const opacity = useRef(new Animated.Value(0.25)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(phase * 120),
        Animated.timing(opacity, { toValue: 0.75, duration: 750, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.25, duration: 750, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, []);

  const bg = colors.surfaceAlt;
  return (
    <Animated.View style={[makeRow(), { opacity }]}>
      <View style={[makeAvatar(), { backgroundColor: bg }]} />
      <View style={{ flex: 1 }}>
        <View style={[makeLine(bg), { width: '55%' }]} />
        <View style={[makeLine(bg), { width: '82%', marginTop: 8 }]} />
      </View>
    </Animated.View>
  );
}

export function SkeletonList({ rows = 9 }: { rows?: number }) {
  return (
    <View>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} phase={i % 4} />
      ))}
    </View>
  );
}

// Skeleton para mensagens (dentro da conversa durante carregamento inicial)
function SkeletonBubble({ fromMe, width, phase }: { fromMe: boolean; width: string; phase: number }) {
  const colors = useTheme();
  const opacity = useRef(new Animated.Value(0.2)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(phase * 100),
        Animated.timing(opacity, { toValue: 0.65, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.2, duration: 800, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, []);
  return (
    <Animated.View style={{ opacity, alignItems: fromMe ? 'flex-end' : 'flex-start', marginVertical: 5, paddingHorizontal: 12 }}>
      <View style={{
        width: width as any,
        height: 44,
        borderRadius: 12,
        backgroundColor: fromMe ? colors.bubbleOut : colors.bubbleIn,
      }} />
    </Animated.View>
  );
}

const BUBBLE_PATTERN: { fromMe: boolean; w: string }[] = [
  { fromMe: false, w: '55%' },
  { fromMe: false, w: '38%' },
  { fromMe: true,  w: '42%' },
  { fromMe: false, w: '65%' },
  { fromMe: true,  w: '30%' },
  { fromMe: true,  w: '50%' },
  { fromMe: false, w: '48%' },
];

export function SkeletonMessages() {
  return (
    <View style={{ flex: 1, justifyContent: 'flex-end', paddingVertical: 8 }}>
      {BUBBLE_PATTERN.map((b, i) => (
        <SkeletonBubble key={i} fromMe={b.fromMe} width={b.w} phase={i} />
      ))}
    </View>
  );
}

const makeRow = () => ({ flexDirection: 'row' as const, padding: spacing.md, alignItems: 'center' as const });
const makeAvatar = () => ({ width: 50, height: 50, borderRadius: 25, marginRight: spacing.md });
const makeLine = (bg: string) => ({ height: 12, borderRadius: 6, backgroundColor: bg });
