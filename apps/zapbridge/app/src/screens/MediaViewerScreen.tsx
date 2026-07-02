import React, { useEffect, useState } from 'react';
import { View, Image, StyleSheet, Dimensions, ActivityIndicator } from 'react-native';
import { ResizeMode, Video } from 'expo-av';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { mediaUrl } from '../api/client';
import { EmptyState } from '../components/EmptyState';
import { colors } from '../theme/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'MediaViewer'>;

const { width } = Dimensions.get('window');

export function MediaViewerScreen({ route }: Props) {
  const { mediaId, type } = route.params;
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    mediaUrl(mediaId).then(setUri);
  }, [mediaId]);

  if (!uri) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {type === 'image' && <Image source={{ uri }} style={styles.media} resizeMode="contain" />}
      {type === 'video' && (
        <Video source={{ uri }} style={styles.media} useNativeControls resizeMode={ResizeMode.CONTAIN} />
      )}
      {type !== 'image' && type !== 'video' && (
        <EmptyState title="Sem pré-visualização" subtitle="Este tipo de mídia não pode ser exibido aqui." />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  media: { width, height: width },
});
