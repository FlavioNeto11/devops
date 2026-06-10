export type VideoTipo = 'palestra' | 'depoimento' | 'entrevista';

export type Video = {
  id: string;
  /** Id do YouTube (placeholder — vazio mostra "vídeo em breve"). */
  youtubeId: string;
  title: string;
  tipo: VideoTipo;
  featured?: boolean;
};

export const videoTipoLabel: Record<VideoTipo, string> = {
  palestra: 'Palestra',
  depoimento: 'Depoimento',
  entrevista: 'Entrevista',
};

/**
 * Galeria de vídeos. PLACEHOLDERS: preencha `youtubeId` com os ids reais
 * (ex.: em https://youtu.be/<id>, o id é a parte final). Enquanto vazios, a
 * seção de Mídia exibe um estado "vídeos em breve" — sem player quebrado.
 */
export const videos: Video[] = [
  { id: 'apresentacao', youtubeId: '', title: 'Apresentação — quem é Ana Rabottini', tipo: 'entrevista', featured: true },
  { id: 'palestra-nr1', youtubeId: '', title: 'Trecho — NR-1 e saúde mental nas organizações', tipo: 'palestra' },
  { id: 'palestra-neuro', youtubeId: '', title: 'Trecho — Neurodiversidade nas empresas', tipo: 'palestra' },
];

export const hasAnyVideo = videos.some((v) => v.youtubeId.trim().length > 0);
