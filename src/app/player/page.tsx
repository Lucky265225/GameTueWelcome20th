'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { db, supabase } from '@/lib/supabase';
import { ShieldAlert, Timer } from 'lucide-react';

export default function PlayerDashboard() {
  const [player, setPlayer] = useState<any>(null);
  
  // ฟอร์มส่งข้อมูล
  const [targetId, setTargetId] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [dropCodeInput, setDropCodeInput] = useState('');
  
  const [actionMessage, setActionMessage] = useState({ text: '', isError: false });
  const [loadingAction, setLoadingAction] = useState(false);
  const router = useRouter();

  // ⏱️ ระบบ Cooldown 30 วินาที 
  const [cooldownTime, setCooldownTime] = useState(0);

  useEffect(() => {
    const cachedId = localStorage.getItem('player_id');
    if (!cachedId) return router.push('/');

    const initFetch = async () => {
      const { data: pData } = await db().from('players').select('*').eq('id', cachedId).single();
      if (pData) setPlayer(pData);
    };
    initFetch();

    // 🌐 ท่อ Realtime อัจฉริยะ ป้องกันบั๊กตัวพิมพ์เล็ก-ใหญ่ และตัดช่องว่างทิ้ง
    const playerChannel = supabase
      .channel(`my-private-score-${cachedId}`)
      .on(
        'postgres_changes', 
        { event: 'UPDATE', schema: 'public', table: 'players', filter: `id=eq.${cachedId}` }, 
        (payload) => {
          const oldData = payload.old;
          const newData = payload.new;
          
          setPlayer(newData);

          // 🚨 เช็กกลไกคูลดาวน์สำหรับฝั่ง "คนรับโอน"
          if (newData.score > (oldData?.score || 0) && newData.last_transfer_by) {
            // แปลงข้อมูลทุกอย่างให้เป็นตัวพิมพ์เล็ก + ตัดช่องว่างทิ้งก่อนเอามาเทียบกัน ป้องกันบั๊กสะกดไม่ตรงกัน
            const myColor = newData.team_color?.trim().toLowerCase();
            const senderColor = newData.last_transfer_by?.trim().toLowerCase();

            // หากเป็นคนละสีกันจริง (โอนข้ามทีมชัวร์) -> เครื่องคนรับสั่งขังตัวเองติดคูลดาวน์ทันที 30 วิ
            if (myColor && senderColor && myColor !== senderColor) {
              setCooldownTime(30);
              setActionMessage({ 
                text: `⚠️ คุณได้รับแต้มโอนข้ามทีม! ระบบล็อกคูลดาวน์โอนต่อ 30 วินาที!`, 
                isError: true 
              });
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(playerChannel);
    };
  }, [router]);

  // ⏱️ ฟังก์ชันนับถอยหลัง Cooldown ทุกๆ 1 วินาที
  useEffect(() => {
    if (cooldownTime <= 0) return;
    const timer = setInterval(() => {
      setCooldownTime((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownTime]);

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionMessage({ text: '', isError: false });
    const amount = parseInt(transferAmount);
    const cleanTargetId = targetId.toUpperCase().trim();

    if (cooldownTime > 0) {
      return setActionMessage({ text: `ระบบโอนติดคูลดาวน์! กรุณารออีก ${cooldownTime} วินาที`, isError: true });
    }
    if (!cleanTargetId || isNaN(amount) || amount <= 0) {
      return setActionMessage({ text: 'กรุณากรอกข้อมูลการโอนให้ถูกต้อง', isError: true });
    }
    if (player.score < amount) {
      return setActionMessage({ text: 'แต้มของคุณมีไม่เพียงพอสำหรับการโอน', isError: true });
    }
    if (player.id === cleanTargetId) {
      return setActionMessage({ text: 'ไม่สามารถโอนแต้มให้ตัวเองได้', isError: true });
    }

    try {
      setLoadingAction(true);
      
      const { data: targetPlayer, error } = await db()
        .from('players')
        .select('*')
        .eq('id', cleanTargetId)
        .single();

      if (error || !targetPlayer) {
        setLoadingAction(false);
        return setActionMessage({ text: 'ไม่พบรหัสผู้เล่นปลายทางในระบบ', isError: true });
      }

      if (!targetPlayer.is_active) {
        setLoadingAction(false);
        return setActionMessage({ text: `ไม่สามารถโอนได้เนื่องจากไอดี ${cleanTargetId} ยังไม่ได้เปิดใช้งาน ❌`, isError: true });
      }

      const isCrossTeam = player.team_color?.trim().toLowerCase() !== targetPlayer.team_color?.trim().toLowerCase();

      // 📤 อัปเดตข้อมูลขึ้น Supabase
      // ฝั่งคนโอน: ลดแต้มปกติ
      await db().from('players').update({ score: player.score - amount }).eq('id', player.id);
      
      // ฝั่งคนรับ: เพิ่มแต้ม + แนบสีทีมของคนโอนไปบอก เพื่อให้ท่อ Realtime ฝั่งนู้นใช้ดักล็อกคูลดาวน์คู่
      await db().from('players').update({ 
        score: targetPlayer.score + amount,
        last_transfer_by: player.team_color // บันทึกสีทีมตัวเองส่งไปให้คนรับตรวจเช็ก
      }).eq('id', targetPlayer.id);

      // ✨ [Optimistic Update] ปรับแต้มบนหน้าจอมือถือตัวเองทันทีโดยไม่ต้องรอ Fetch ใหม่
      setPlayer((prev: any) => ({ ...prev, score: prev.score - amount }));

      // หากเป็นการโอนข้ามทีม ฝั่งคนโอนจะเข้าสู่สถานะคูลดาวน์ทันที 30 วินาที
      if (isCrossTeam) {
        setCooldownTime(30);
        setActionMessage({ text: `โอนข้ามทีมสำเร็จ! มอบ ${amount} แต้มให้ ${targetPlayer.id} ⚠️ แพ็คคู่คูลดาวน์ทำงาน 30 วินาที!`, isError: false });
      } else {
        setActionMessage({ text: `โอนให้เพื่อนร่วมทีมสำเร็จ! มอบ ${amount} แต้มให้แก่ ${targetPlayer.id} เรียบร้อย`, isError: false });
      }

      setTargetId('');
      setTransferAmount('');
      setLoadingAction(false);
    } catch (err) {
      setLoadingAction(false);
      setActionMessage({ text: 'เกิดข้อผิดพลาดในการทำรายการโอน', isError: true });
    }
  };

  const handleClaimCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionMessage({ text: '', isError: false });
    const cleanedCode = dropCodeInput.trim().toUpperCase();
    if (!cleanedCode) return;

    try {
      setLoadingAction(true);
      const { data: cData, error } = await db().from('drop_codes').select('*').eq('code', cleanedCode).single();

      if (error || !cData) {
        setLoadingAction(false);
        return setActionMessage({ text: 'ไม่พบรหัสโค้ดนี้ในระบบ', isError: true });
      }
      if (cData.is_used) {
        setLoadingAction(false);
        return setActionMessage({ text: 'โค้ดนี้ถูกใช้งานไปแล้ว ❌', isError: true });
      }

      let newScore = player.score;
      let alertMsg = '';

      if (cData.effect_type === 'plus_points') {
        newScore += cData.value_amount;
        alertMsg = `ได้รับแต้มส่วนตัวเพิ่ม +${cData.value_amount} แต้ม!`;
      } else if (cData.effect_type === 'minus_20') {
        newScore = Math.max(0, newScore - 20);
        alertMsg = `แย่แล้ว! โดนกับดักหักแต้มส่วนตัว -20 แต้ม!`;
      } else if (cData.effect_type === 'multiply_x2') {
        newScore = newScore * 2;
        alertMsg = `คูณสองติดสปีด! แต้มเพิ่มเป็น 2 เท่า!`;
      } else if (cData.effect_type === 'team_plus_5') {
        alertMsg = `ส่งเอฟเฟกต์บวกแต้มให้ทุกคนในทีมสี ${player.team_color} เรียบร้อย!`;
        await supabase.rpc('bulk_plus_team_score', { target_team: player.team_color, plus_amount: 5 });
      } else if (cData.effect_type === 'enemy_minus_5') {
        alertMsg = `ส่งกับดักระเบิดหักแต้มศัตรูทุกสี -5 แต้มเรียบร้อย!`;
        await supabase.rpc('bulk_minus_enemies_score', { my_team: player.team_color, minus_amount: 5 });
      }

      await db().from('drop_codes').update({ is_used: true, used_by: player.id, used_at: new Date().toISOString() }).eq('code', cleanedCode);
      
      // เมื่อใช้ไอเทม จะไม่มีการส่งฟิลด์ last_transfer_by ระบบไอเทมจึงจะไม่กวนคูลดาวน์โอนข้ามทีม
      if (cData.effect_type !== 'team_plus_5' && cData.effect_type !== 'enemy_minus_5') {
        await db().from('players').update({ score: newScore }).eq('id', player.id);
        setPlayer((prev: any) => ({ ...prev, score: newScore }));
      }

      setActionMessage({ text: `สำเร็จ! ${alertMsg}`, isError: false });
      setDropCodeInput('');
      setLoadingAction(false);
    } catch (err) {
      setLoadingAction(false);
      setActionMessage({ text: 'เกิดข้อผิดพลาดในการเคลมรหัส', isError: true });
    }
  };

  if (!player) return <div className="min-h-screen bg-slate-950 flex justify-center items-center text-xs tracking-widest text-slate-400">CONNECTING...</div>;

  const isJailed = player.score <= 0;

  return (
    <main className={`min-h-screen p-4 flex flex-col items-center transition-colors duration-500 ${isJailed ? 'bg-red-950/90' : 'bg-slate-950'}`}>
      <div className="w-full max-w-sm space-y-4">
        
        {/* บัตรสเตตัสผู้เล่น */}
        {isJailed ? (
          <div className="bg-red-900/40 border-2 border-red-500 rounded-2xl p-5 text-center space-y-2 shadow-[0_0_30px_rgba(239,68,68,0.3)] animate-pulse">
            <ShieldAlert className="w-12 h-12 text-red-500 mx-auto" />
            <h2 className="text-2xl font-black text-white">คุณติดคุก! 🚨</h2>
            <p className="text-xs text-red-300">คะแนนหมดลงแล้ว ฟังก์ชันถูกล็อก จนกว่าแอดมินจะปล่อยตัว</p>
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ backgroundColor: player.team_color }} />
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[10px] px-2 py-0.5 bg-slate-800 text-slate-400 font-mono font-bold rounded">{player.id}</span>
                <h2 className="text-xl font-black mt-1.5 text-slate-100">{player.player_name || 'No Name'}</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  TEAM: <span className="font-bold uppercase" style={{ color: player.team_color }}>{player.team_color}</span>
                </p>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-500 uppercase block">YOUR SCORE</span>
                <span className="text-4xl font-black text-emerald-400 font-mono tracking-tight">{player.score}</span>
              </div>
            </div>
          </div>
        )}

        {actionMessage.text && (
          <div className={`text-xs p-3 rounded-xl border font-bold text-center ${actionMessage.isError ? 'text-red-400 bg-red-500/10 border-red-500/20' : 'text-green-400 bg-emerald-500/10 border-emerald-500/20'}`}>
            {actionMessage.isError ? '❌ ' : '⚡ '} {actionMessage.text}
          </div>
        )}

        {/* เคลมโค้ด */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <form onSubmit={handleClaimCode} className="flex gap-2">
            <input
              type="text"
              value={dropCodeInput}
              onChange={(e) => setDropCodeInput(e.target.value)}
              disabled={isJailed || loadingAction}
              placeholder="กรอกรหัส Drop Point ลับ"
              className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono uppercase text-xs focus:outline-none focus:border-cyan-500"
            />
            <button 
              type="submit" 
              disabled={isJailed || loadingAction} 
              className="bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-bold px-4 rounded-xl text-xs uppercase transition"
            >
              {loadingAction ? 'WAIT...' : 'CLAIM'}
            </button>
          </form>
        </div>

        {/* โอนแต้ม */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <form onSubmit={handleTransfer} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                disabled={isJailed || loadingAction || cooldownTime > 0}
                placeholder="ID เพื่อน (เช่น B02)"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono uppercase text-xs focus:outline-none disabled:opacity-50"
              />
              <input
                type="number"
                value={transferAmount}
                onChange={(e) => setTransferAmount(e.target.value)}
                disabled={isJailed || loadingAction || cooldownTime > 0}
                placeholder="จำนวนแต้ม"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono text-xs focus:outline-none disabled:opacity-50"
              />
            </div>
            
            <button 
              type="submit" 
              disabled={isJailed || loadingAction || cooldownTime > 0} 
              className={`w-full font-bold py-2 rounded-xl text-xs uppercase tracking-widest transition flex items-center justify-center gap-1 ${
                cooldownTime > 0 
                  ? 'bg-red-900/60 border border-red-500 text-red-300 cursor-not-allowed animate-pulse' 
                  : 'bg-slate-800 hover:bg-emerald-600 disabled:bg-slate-900 disabled:border-slate-800 disabled:text-slate-600 border border-slate-700 hover:border-emerald-500 text-slate-200 hover:text-white'
              }`}
            >
              {loadingAction ? (
                'PROCESSING...'
              ) : cooldownTime > 0 ? (
                <>
                  <Timer className="w-3.5 h-3.5 animate-spin" />
                  COOLDOWN: {cooldownTime}S
                </>
              ) : (
                'EXECUTE TRANSFER'
              )}
            </button>
          </form>
        </div>

      </div>
    </main>
  );
}