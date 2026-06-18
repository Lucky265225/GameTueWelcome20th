'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/supabase';
import { Swords } from 'lucide-react';

export default function LoginPage() {
  const [playerId, setPlayerId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!playerId || !password) return setError('กรุณากรอกข้อมูลให้ครบถ้วน');

    try {
      setLoading(true);
      const { data, error: dbError } = await db()
        .from('players')
        .select('*')
        .eq('id', playerId.toUpperCase().trim())
        .single();

      if (dbError || !data) {
        setLoading(false);
        return setError('ไม่พบรหัสผู้เล่นนี้ในระบบ');
      }

      if (data.password !== password) {
        setLoading(false);
        return setError('รหัสผ่านไม่ถูกต้อง');
      }

      localStorage.setItem('player_id', data.id);
      localStorage.setItem('team_color', data.team_color);

      if (!data.is_active) {
        router.push(`/register?id=${data.id}`);
      } else {
        router.push('/player');
      }
    } catch (err) {
      setLoading(false);
      setError('ระบบขัดข้อง กรุณาลองใหม่อีกครั้ง');
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-white flex flex-col justify-center items-center p-4 selection:bg-cyan-500 selection:text-black">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-[0_0_50px_rgba(6,182,212,0.15)] relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500" />
        
        <div className="flex justify-center mb-4">
          <div className="p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-2xl text-cyan-400">
            <Swords className="w-8 h-8" />
          </div>
        </div>

        <h1 className="text-2xl font-black text-center tracking-tight uppercase bg-gradient-to-r from-cyan-400 to-indigo-400 bg-clip-text text-transparent mb-1">
          20th Game Companion
        </h1>
        <p className="text-center text-xs text-slate-500 uppercase tracking-widest mb-6">Mobile Operational Center</p>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Player ID</label>
            <input
              type="text"
              value={playerId}
              onChange={(e) => setPlayerId(e.target.value)}
              placeholder="ตัวอย่างเช่น Y01, R05"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white uppercase font-mono font-bold focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/20 transition-all text-sm"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/20 transition-all text-sm"
            />
          </div>

          {error && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-2.5 rounded-xl text-center font-semibold">
              ⚠️ {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 active:scale-[0.98] text-white py-3 rounded-xl font-bold transition shadow-lg shadow-cyan-600/20 text-sm disabled:opacity-50"
          >
            {loading ? 'AUTHENTICATING...' : 'READY FOR BATTLE'}
          </button>
        </form>
      </div>
    </main>
  );
}