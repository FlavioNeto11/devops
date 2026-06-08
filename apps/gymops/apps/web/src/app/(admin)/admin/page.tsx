'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Índice de /admin → redireciona para a lista de academias.
// Garante que o bare /admin (ex.: bookmark ou redirect de login) não dê 404.
export default function AdminIndexPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admin/organizations');
  }, [router]);
  return null;
}
