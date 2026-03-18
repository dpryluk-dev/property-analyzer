import { LoginForm } from './LoginForm';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';

export default async function LoginPage() {
  // If already logged in, redirect to home
  const session = await getSession();
  if (session) redirect('/');

  return (
    <main style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
      background: '#0C1017',
    }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 72, height: 72, borderRadius: 16, margin: '0 auto 16px',
            background: 'linear-gradient(135deg, #4F8CFF, #3B6FD9)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 28, fontWeight: 800, color: '#fff',
            boxShadow: '0 8px 32px rgba(79,140,255,0.25)',
          }}>
            PL
          </div>
          <div style={{ fontSize: 10, color: '#4F8CFF', textTransform: 'uppercase', letterSpacing: 3, fontWeight: 600 }}>
            Pryluk-Lewin
          </div>
          <h1 style={{
            fontSize: 22, fontWeight: 700, margin: '4px 0 0',
            background: 'linear-gradient(135deg, #FFF, #4F8CFF)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            Real Estate Hub
          </h1>
        </div>

        <LoginForm />
      </div>
    </main>
  );
}
