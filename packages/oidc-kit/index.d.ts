// Tipos de @flavioneto11/oidc-kit (entry Node).

export interface TokenPayload { iat?: number; exp?: number; jti?: string; sub?: string; email?: string; name?: string; roles?: string[]; [k: string]: unknown; }
export interface EncryptedPayload { ciphertext: string; iv: string; tag: string; }

export function hashTokenSha256(token: string): string;
export function hashPassword(password: string): string;
export function verifyPassword(password: string, passwordHash: string): boolean;
export function createAccessToken(payload: TokenPayload, opts: { secret: string; ttlSeconds?: number; prefix?: string }): string;
export function verifyAccessToken(token: string, opts: { secret: string; prefix?: string }):
  | { valid: false; reason: string }
  | { valid: true; payload: TokenPayload };
export function createRefreshToken(opts?: { prefix?: string }): string;
export function encryptSecret(plainText: string, opts: { secret: string }): EncryptedPayload;
export function decryptSecret(cipherPayload: Partial<EncryptedPayload>, opts: { secret: string }): string;

export function validateKeycloakToken(
  accessToken: string,
  opts: { userinfoUrl: string; fetchImpl?: typeof fetch },
): Promise<{ ok: true; claims: Record<string, unknown> } | { ok: false; code: string }>;
export function claimsToProfile(claims: Record<string, unknown>): { email: string; name: string };

export function requireSession(opts: { secret: string; prefix?: string }): (req: any, res: any, next: any) => void;
