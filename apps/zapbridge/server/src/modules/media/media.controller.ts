import { Response } from 'express';
import { existsSync } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { downloadContentFromMessage } from '@whiskeysockets/baileys';
import { AuthedRequest } from '../../types';
import { prisma } from '../../lib/prisma';
import { env } from '../../config/env';

type MediaContentType = 'image' | 'video' | 'audio' | 'document';

// Baixa a mídia sob demanda (Baileys downloadContentFromMessage), grava em disco e retorna o caminho.
async function ensureDownloaded(media: {
  id: string;
  type: string;
  mediaKey: string | null;
  directPath: string | null;
  url: string | null;
}): Promise<string | null> {
  if (!media.mediaKey) return null;
  await fs.mkdir(env.mediaDir, { recursive: true });
  const filePath = path.join(env.mediaDir, media.id);
  try {
    const stream = await downloadContentFromMessage(
      {
        url: media.url ?? undefined,
        directPath: media.directPath ?? undefined,
        mediaKey: Buffer.from(media.mediaKey, 'base64'),
      } as any,
      media.type as MediaContentType,
      {},
    );
    let buffer = Buffer.from([]);
    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
    await fs.writeFile(filePath, buffer);
    await prisma.media.update({
      where: { id: media.id },
      data: { localPath: filePath, size: buffer.length, downloaded: true },
    });
    return filePath;
  } catch {
    await prisma.media.update({ where: { id: media.id }, data: { expired: true } }).catch(() => undefined);
    return null;
  }
}

export async function getMedia(req: AuthedRequest, res: Response) {
  const media = await prisma.media.findUnique({
    where: { id: req.params.id },
    include: { message: { include: { chat: { include: { session: true } } } } },
  });
  if (!media) return res.status(404).json({ error: 'Mídia não encontrada' });

  // Garante que a mídia pertence ao usuário autenticado.
  if (media.message.chat.session.userId !== req.user!.userId) {
    return res.status(404).json({ error: 'Mídia não encontrada' });
  }

  // Já baixada?
  let filePath = media.localPath && existsSync(media.localPath) ? media.localPath : null;
  // Baixa sob demanda na primeira visualização.
  if (!filePath && !media.expired) {
    filePath = await ensureDownloaded(media);
  }
  if (!filePath) return res.status(410).json({ error: 'Mídia indisponível ou expirada' });

  if (media.mimeType) res.type(media.mimeType);
  // Permite reprodução/seek em <audio>/<video>.
  res.setHeader('Accept-Ranges', 'bytes');
  return res.sendFile(filePath);
}
