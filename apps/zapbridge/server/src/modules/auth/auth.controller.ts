import { Request, Response } from 'express';
import { AuthedRequest } from '../../types';
import { registerUser, loginUser, getMe } from './auth.service';

export async function register(req: Request, res: Response) {
  const { email, password, displayName } = req.body ?? {};
  if (!email || !password || !displayName) {
    return res.status(400).json({ error: 'email, password e displayName são obrigatórios' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'A senha deve ter ao menos 6 caracteres' });
  }
  const result = await registerUser(email, password, displayName);
  return res.status(201).json(result);
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body ?? {};
  if (!email || !password) {
    return res.status(400).json({ error: 'email e password são obrigatórios' });
  }
  const result = await loginUser(email, password);
  return res.json(result);
}

export async function logout(_req: Request, res: Response) {
  // JWT é stateless: o cliente descarta o token. Endpoint existe por simetria.
  return res.json({ ok: true });
}

export async function me(req: AuthedRequest, res: Response) {
  const user = await getMe(req.user!.userId);
  return res.json({ user });
}
