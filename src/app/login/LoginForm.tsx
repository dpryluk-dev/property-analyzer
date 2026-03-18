'use client';

import { useState, useTransition } from 'react';
import { login } from './actions';

const C = {
  bg: '#0C1017', surface: '#151B23', card: '#1C232D', border: '#2A3441',
  text: '#E2E8F0', dim: '#64748B', accent: '#4F8CFF', white: '#FFFFFF',
  red: '#EF4444', redBg: 'rgba(239,68,68,0.08)',
};

export function LoginForm() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    startTransition(async () => {
      const result = await login(username, password);
      if (result?.error) {
        setError(result.error);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} style={{
      background: C.surface, borderRadius: 14, padding: 28,
      border: `1px solid ${C.border}`,
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    }}>
      <div style={{ marginBottom: 18 }}>
        <label style={{
          display: 'block', fontSize: 11, fontWeight: 600,
          color: C.dim, textTransform: 'uppercase', marginBottom: 6, letterSpacing: 1,
        }}>
          Username
        </label>
        <input
          type="text"
          value={username}
          onChange={e => setUsername(e.target.value)}
          autoComplete="username"
          autoFocus
          required
          style={{
            width: '100%', padding: '11px 14px', background: C.bg,
            border: `1px solid ${C.border}`, borderRadius: 8,
            color: C.text, fontSize: 14, outline: 'none',
            boxSizing: 'border-box',
          }}
          placeholder="Enter username"
        />
      </div>

      <div style={{ marginBottom: 22 }}>
        <label style={{
          display: 'block', fontSize: 11, fontWeight: 600,
          color: C.dim, textTransform: 'uppercase', marginBottom: 6, letterSpacing: 1,
        }}>
          Password
        </label>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          autoComplete="current-password"
          required
          style={{
            width: '100%', padding: '11px 14px', background: C.bg,
            border: `1px solid ${C.border}`, borderRadius: 8,
            color: C.text, fontSize: 14, outline: 'none',
            boxSizing: 'border-box',
          }}
          placeholder="Enter password"
        />
      </div>

      {error && (
        <div style={{
          background: C.redBg, borderRadius: 8, padding: '10px 14px',
          marginBottom: 16, border: `1px solid ${C.red}33`,
        }}>
          <span style={{ fontSize: 13, color: C.red }}>{error}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={isPending || !username || !password}
        style={{
          width: '100%', padding: '12px 0', fontSize: 15, fontWeight: 700,
          border: 'none', borderRadius: 8, cursor: isPending ? 'wait' : 'pointer',
          background: isPending || !username || !password
            ? C.border
            : `linear-gradient(135deg, ${C.accent}, #3B6FD9)`,
          color: C.white,
          opacity: !username || !password ? 0.5 : 1,
          boxShadow: isPending ? 'none' : '0 4px 16px rgba(79,140,255,0.3)',
        }}
      >
        {isPending ? 'Signing in...' : 'Sign In'}
      </button>
    </form>
  );
}
