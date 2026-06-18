'use client';
import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { db } from '@/lib/supabase';
import { UserPlus } from 'lucide-react';

function RegisterForm() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!id) router.push('/');
  }, [id, router]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('กรุณาระบุชื่อเล่นเพื่อเข้าแข่งขัน');

    try {
      setLoading(true);
      // เปลี่ยนสถานะ อัปเดตชื่อ และแถมแต้มตั้งต้น 50 แต้มตามกติกา
      const { error: updateError } = await db()
        .from('players')
        .update({ 
          player_name: name.trim(), 
          is_active: true,
          score: 50 
        })
        .eq('id', id);

      if (updateError) throw updateError;
      router.push('/player');
    } catch (err) {
      setLoading(false);
      setError('ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่');
    }
  };

  return (
    <div className="w-full max-w-sm bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl">
      <div className="flex justify-center mb-3">
        <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400">
          <UserPlus className="w-6 h-6" />
        </div>
      </div>

      <h2 className="text-xl font-black text-center mb-1">INITIALIZATION</h2>
      <p className="text-center text-xs text-slate-400 mb-6">
        รหัสการ์ดของคุณคือ: <span className="text-yellow-400 font-mono font-bold">{id}</span>
      </p>

      <form onSubmit={handleRegister} className="space-y-4">
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">ชื่อเล่น / ชื่อทีม</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ตั้งชื่อเล่นเท่ๆ ของคุณ"
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-emerald-500 transition-all"
            maxLength={15}
          />
          <span className="text-[10px] text-slate-500 mt-1 block">💡 ได้รับคะแนนโบนัสแรกเข้าฟรี 50 แต้มทันที</span>
        </div>

        {error && <div className="text-xs text-red-400 bg-red-500/10 p-3 rounded-xl border border-red-500/20">{error}</div>}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl transition text-sm disabled:opacity-50"
        >
          {loading ? 'CREATING AVATAR...' : 'DEPLOY TO BATTLEFIELD'}
        </button>
      </form>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-white flex justify-center items-center p-4">
      <Suspense fallback={<div className="text-xs tracking-widest text-slate-400 animate-pulse">LOADING CONFIGURATION...</div>}>
        <RegisterForm />
      </Suspense>
    </main>
  );
}