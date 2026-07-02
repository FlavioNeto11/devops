import { Response } from 'express';
import { AuthedRequest } from '../../types';
import { prisma } from '../../lib/prisma';
import { getSessionIdOrThrow } from '../chats/chats.service';

export async function getContacts(req: AuthedRequest, res: Response) {
  const sessionId = await getSessionIdOrThrow(req.user!.userId);
  const search = (req.query.search as string) || undefined;
  const contacts = await prisma.contact.findMany({
    where: { sessionId, ...(search ? { name: { contains: search } } : {}) },
    orderBy: { name: 'asc' },
    take: 500,
  });
  return res.json({ contacts });
}
