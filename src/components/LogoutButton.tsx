'use client';

import { useTransition } from 'react';
import { logout } from '@/app/login/actions';

export function LogoutButton() {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      onClick={() => startTransition(() => logout())}
      disabled={isPending}
      style={{
        position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)',
        background: 'transparent', border: '1px solid #2A3441', borderRadius: 6,
        color: '#64748B', fontSize: 11, padding: '5px 10px', cursor: 'pointer',
        fontWeight: 500,
      }}
    >
      {isPending ? '...' : 'Logout'}
    </button>
  );
}
