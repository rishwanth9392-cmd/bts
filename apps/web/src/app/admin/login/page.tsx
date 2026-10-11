'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, Input, Button } from '@bts/ui';

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('admin@bmsit.edu');
  const [password, setPassword] = useState('Admin@BTS2026');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'admin', email, password }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error?.message || 'Login failed. Please verify credentials.');
        return;
      }

      router.push('/admin/dashboard');
      router.refresh();
    } catch (err) {
      console.error(err);
      setError('Network error. Failed to connect to server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-white px-6 pb-12 pt-8 sm:items-center">
      <div className="w-full max-w-sm">
        {/* Top Branding */}
        <div className="mb-6 flex items-center gap-2.5">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-200/60 bg-amber-50 shadow-xs">
            <svg
              className="h-6 w-6 text-amber-500"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M4 16c0 .88.39 1.67 1 2.22V20c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h8v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4s-8 .5-8 4v10zm3.5 1c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm1.5-6H6V6h12v5z" />
            </svg>
          </div>
          <span className="text-xl font-black tracking-tight text-gray-900">
            BTS
          </span>
        </div>

        {/* Header with Squircle Icon */}
        <div className="mb-5 flex items-center gap-3.5">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#EAF2FF] border border-[#D8E7FF] shadow-xs">
            <span className="text-2xl font-black text-[#2B70E4]">A</span>
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-gray-900">Admin Portal</h1>
            <p className="text-xs text-gray-500">Sign in to manage BTS fleet and routes</p>
          </div>
        </div>

        {/* Yellow Accent Pill Bar */}
        <div className="mb-6 h-1.5 w-10 rounded-full bg-amber-400" />

        <Card title="Admin Sign In">
          <form onSubmit={handleSubmit} className="mt-2 space-y-4">
            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-600">
                {error}
              </div>
            )}

            <Input
              id="email"
              label="Email Address"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@bmsit.edu"
            />

            <Input
              id="password"
              label="Password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />

            <Button
              type="submit"
              size="lg"
              className="w-full mt-2"
              disabled={loading}
            >
              {loading ? 'Signing in...' : 'Sign In as Admin'}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <Link href="/welcome" className="text-xs font-medium text-gray-500 hover:text-gray-900">
              ← Back to role selection
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
