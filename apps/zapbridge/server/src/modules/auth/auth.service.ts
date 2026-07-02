import bcrypt from 'bcryptjs';
import { prisma } from '../../lib/prisma';
import { signToken } from '../../middleware/auth';

export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
}

function toPublic(user: { id: string; email: string; displayName: string }): PublicUser {
  return { id: user.id, email: user.email, displayName: user.displayName };
}

export async function registerUser(email: string, password: string, displayName: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    const err = new Error('E-mail já cadastrado');
    (err as any).status = 409;
    throw err;
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      email: normalizedEmail,
      passwordHash,
      displayName: displayName.trim(),
      setting: { create: {} },
    },
  });
  const token = signToken({ userId: user.id, email: user.email });
  return { token, user: toPublic(user) };
}

export async function loginUser(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (!user) {
    const err = new Error('Credenciais inválidas');
    (err as any).status = 401;
    throw err;
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    const err = new Error('Credenciais inválidas');
    (err as any).status = 401;
    throw err;
  }
  const token = signToken({ userId: user.id, email: user.email });
  return { token, user: toPublic(user) };
}

export async function getMe(userId: string): Promise<PublicUser> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    const err = new Error('Usuário não encontrado');
    (err as any).status = 404;
    throw err;
  }
  return toPublic(user);
}
