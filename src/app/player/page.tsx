'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { db, supabase } from '@/lib/supabase';
import { ShieldAlert, User, Eye, ArrowLeftRight, X } from 'lucide-react';

export default function PlayerDashboard() {
  const [player, setPlayer] = useState<any>(null);
  
  // ฟอร์มส่งข้อมูลปกติ
  const [targetId, setTargetId] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [dropCodeInput, setDropCodeInput] = useState('');
  
  const [actionMessage, setActionMessage] = useState({ text: '', isError: false });
  const [loadingAction, setLoadingAction] = useState(false);
  const router = useRouter();

  // ⏱️ ระบบ Cooldown 
  const [cooldownTime, setCooldownTime] = useState(0);

  // 🔮 ระบบ Popup สำหรับไอเทมลับ (See Score / Swap Score)
  const [activePopup, setActivePopup] = useState<{ type: 'see_score' | 'swap_score'; codeData: any } | null>(null);
  const [targetQuery, setTargetQuery] = useState(''); // เก็บค่าที่พิมพ์ค้นหา (ID หรือ ชื่อ)
  const [popupMessage, setPopupMessage] = useState({ text: '', isError: false });

  const calculateRemainingCooldown = (cooldownUntilStr: string | null) => {
    if (!cooldownUntilStr) return 0;
    const remaining = Math.ceil((new Date(cooldownUntilStr).getTime() - Date.now()) / 1000);
    return remaining > 0 ? remaining : 0;
  };

  useEffect(() => {
    const cachedId = localStorage.getItem('player_id');
    if (!cachedId) return router.push('/');

    const initFetch = async () => {
      const { data: pData } = await db().from('players').select('*').eq('id', cachedId).single();
      if (pData) {
        setPlayer(pData);
        const remaining = calculateRemainingCooldown(pData.cooldown_until);
        if (remaining > 0) setCooldownTime(remaining);
      }
    };
    initFetch();

    const playerChannel = supabase
      .channel(`my-private-score-${cachedId}`)
      .on(
        'postgres_changes', 
        { event: 'UPDATE', schema: 'public', table: 'players', filter: `id=eq.${cachedId}` }, 
        (payload) => {
          const newData = payload.new;
          setPlayer(newData);

          if (newData) {
            const remaining = calculateRemainingCooldown(newData.cooldown_until);
            if (remaining > 0) {
              setCooldownTime(remaining);
            }

            if (newData.last_transfer_by) {
              const myColor = newData.team_color?.trim().toLowerCase();
              const senderColor = newData.last_transfer_by?.trim().toLowerCase();

              if (myColor && senderColor && myColor !== senderColor) {
                setActionMessage({ 
                  text: `⚠️ คุณได้รับแต้มโอนข้ามทีม! ระบบล็อกคูลดาวน์โอนต่อ 30 วินาที!`, 
                  isError: true 
                });
                
                const futureTime = new Date(Date.now() + 30000).toISOString();
                db().from('players').update({ 
                  cooldown_until: futureTime,
                  last_transfer_by: null 
                }).eq('id', cachedId);
              }
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(playerChannel);
    };
  }, [router]);

  useEffect(() => {
    if (cooldownTime <= 0) return;
    const timer = setInterval(() => {
      setCooldownTime((prev) => (prev - 1 <= 0 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownTime]);

  // ฟังก์ชันโอนเงินปกติ
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
    if (amount % 5 !== 0) {
      return setActionMessage({ text: '❌ จำนวนแต้มที่โอนต้องหารด้วย 5 ลงตัวเท่านั้น', isError: true });
    }
    if (player.score < amount) {
      return setActionMessage({ text: 'แต้มของคุณมีไม่เพียงพอสำหรับการโอน', isError: true });
    }
    if (player.id === cleanTargetId) {
      return setActionMessage({ text: 'ไม่สามารถโอนแต้มให้ตัวเองได้', isError: true });
    }

    try {
      setLoadingAction(true);
      
      const { data: latestMe } = await db().from('players').select('cooldown_until, score').eq('id', player.id).single();
      const dbRemaining = calculateRemainingCooldown(latestMe?.cooldown_until);
      
      if (dbRemaining > 0) {
        setCooldownTime(dbRemaining);
        setLoadingAction(false);
        return setActionMessage({ text: `ปฏิเสธคำขอ! ฐานข้อมูลตรวจพบว่าคุณยังติดคูลดาวน์อีก ${dbRemaining} วินาที`, isError: true });
      }

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
      const futureTime = new Date(Date.now() + 30000).toISOString();

      await db().from('players').update({ 
        score: latestMe.score - amount,
        cooldown_until: isCrossTeam ? futureTime : null
      }).eq('id', player.id);
      
      await db().from('players').update({ 
        score: targetPlayer.score + amount,
        last_transfer_by: player.team_color 
      }).eq('id', targetPlayer.id);

      setPlayer((prev: any) => ({ 
        ...prev, 
        score: latestMe.score - amount,
        cooldown_until: isCrossTeam ? futureTime : null 
      }));

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

  // ฟังก์ชันเคลมโค้ดหลัก
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

      // ดักจับถ้าเป็นโค้ดประเภท See Score หรือ Swap Score
      if (cData.effect_type === 'see_score' || cData.effect_type === 'swap_score') {
        setTargetQuery('');
        setPopupMessage({ text: '', isError: false });
        setActivePopup({ type: cData.effect_type, codeData: cData }); // เปิด Popup
        setLoadingAction(false);
        return; 
      }

      // เอฟเฟกต์ปกติแบบเดิม
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

  // ฟังก์ชันประมวลผลคำขอจากใน Popup (แก้ไขเพิ่มระบบสืบค้นแยกแบบยืดหยุ่น)
  const handlePopupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePopup) return;
    setPopupMessage({ text: '', isError: false });

    const cleanQuery = targetQuery.trim();
    if (!cleanQuery) return setPopupMessage({ text: 'กรุณากรอกรหัส ID หรือชื่อผู้เล่น', isError: true });

    try {
      setLoadingAction(true);

      // 🔍 ค้นหาขั้นที่ 1: ค้นหาจาก ID ตรงๆ ดูก่อน (แปลงเป็นตัวใหญ่)
      let { data: targetPlayer } = await db()
        .from('players')
        .select('*')
        .eq('id', cleanQuery.toUpperCase())
        .maybeSingle();

      // 🔍 ค้นหาขั้นที่ 2: ถ้า ID หาไม่เจอ ให้ลองหาตามชื่อ (player_name)
      if (!targetPlayer) {
        const { data: nameMatch } = await db()
          .from('players')
          .select('*')
          .ilike('player_name', cleanQuery)
          .maybeSingle();
        
        targetPlayer = nameMatch;
      }

      // ตรวจสอบผลลัพธ์การค้นหา
      if (!targetPlayer) {
        setLoadingAction(false);
        return setPopupMessage({ text: '❌ ไม่พบข้อมูลผู้เล่นหรือชื่อนี้ในระบบ', isError: true });
      }

      if (targetPlayer.id === player.id) {
        setLoadingAction(false);
        return setPopupMessage({ text: '❌ ไม่สามารถเลือกตัวเองเป็นเป้าหมายได้', isError: true });
      }

      const code = activePopup.codeData.code;

      if (activePopup.type === 'see_score') {
        // --- 🔍 1. เอฟเฟกต์เห็นแต้มคนอื่น ---
        await db().from('drop_codes').update({ is_used: true, used_by: player.id, used_at: new Date().toISOString() }).eq('code', code);
        
        setPopupMessage({ 
          text: `🔍 ส่องสำเร็จ! ผู้เล่น [${targetPlayer.id}] ${targetPlayer.player_name || ''} ปัจจุบันมีคะแนนเท่ากับ: ${targetPlayer.score} แต้ม!`, 
          isError: false 
        });
        
        setActionMessage({ text: `ใช้โค้ดส่องแต้ม ${code} สำเร็จแล้ว!`, isError: false });
        setDropCodeInput('');
        setLoadingAction(false);

      } else if (activePopup.type === 'swap_score') {
        // --- 🔄 2. เอฟเฟกต์สลับแต้ม ---
        const myCurrentScore = player.score;
        const targetCurrentScore = targetPlayer.score;

        await db().from('players').update({ score: targetCurrentScore }).eq('id', player.id);
        await db().from('players').update({ score: myCurrentScore }).eq('id', targetPlayer.id);
        await db().from('drop_codes').update({ is_used: true, used_by: player.id, used_at: new Date().toISOString() }).eq('code', code);

        setPlayer((prev: any) => ({ ...prev, score: targetCurrentScore }));

        setActionMessage({ 
          text: `💥 มหาเวทย์สลับร่างสำเร็จ! คุณสลับแต้มกับ [${targetPlayer.id}] แล้ว (แต้มใหม่ของคุณคือ ${targetCurrentScore})`, 
          isError: false 
        });
        
        setDropCodeInput('');
        setLoadingAction(false);
        setActivePopup(null); // สลับคะแนนสำเร็จให้ปิดป๊อปอัพทันที
      }

    } catch (err) {
      setLoadingAction(false);
      setPopupMessage({ text: 'เกิดข้อผิดพลาดในการประมวลผลคำสั่งพิเศษ', isError: true });
    }
  };

  if (!player) return <div className="min-h-screen bg-slate-950 flex justify-center items-center text-xs tracking-widest text-slate-400">CONNECTING...</div>;

  const isJailed = player.score <= 0;

  return (
    <main className={`min-h-screen p-4 flex flex-col items-center transition-colors duration-500 relative ${isJailed ? 'bg-red-950/90' : 'bg-slate-950'}`}>
      <div className="w-full max-w-sm space-y-4">
        
        {/* บัตรสเตตัสผู้เล่น */}
        {isJailed ? (
          <div className="bg-red-900/40 border-2 border-red-500 rounded-2xl p-5 text-center space-y-2 shadow-[0_0_30px_rgba(239,68,68,0.3)] animate-pulse">
            <ShieldAlert className="w-12 h-12 text-red-500 mx-auto" />
            <div className="inline-block px-4 py-1 bg-red-500 text-white font-mono text-xl font-black rounded-lg tracking-wider mb-1">{player.id}</div>
            <h2 className="text-2xl font-black text-white">คุณติดคุก! 🚨</h2>
            <p className="text-xs text-red-300">คะแนนหมดลงแล้ว ฟังก์ชันถูกล็อก จนกว่าแอดมินจะปล่อยตัว</p>
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-[4px]" style={{ backgroundColor: player.team_color }} />
            <div className="flex justify-between items-center">
              <div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-950 border border-slate-800 text-cyan-400 font-mono text-lg font-black rounded-xl tracking-widest shadow-inner">
                  {player.id}
                </div>
                <h2 className="text-xl font-black mt-2 text-slate-100">{player.player_name || 'No Name'}</h2>
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
              {loadingAction ? 'PROCESSING...' : cooldownTime > 0 ? `COOLDOWN: ${cooldownTime}S` : 'EXECUTE TRANSFER'}
            </button>
          </form>
        </div>

      </div>

      {/* 🔮 UI โมดอล POPUP พิเศษสำหรับไอเทมส่องแต้ม / สลับแต้ม */}
      {activePopup && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex justify-center items-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-sm rounded-2xl p-5 space-y-4 relative shadow-2xl">
            
            {/* ปุ่มปิด Popup */}
            <button 
              onClick={() => setActivePopup(null)} 
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
            >
              <X className="w-4 h-4" />
            </button>

            {/* หัวข้อตามไอเทมที่ใช้ */}
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
              {activePopup.type === 'see_score' ? (
                <>
                  <div className="p-2 bg-cyan-500/10 text-cyan-400 rounded-xl"><Eye className="w-5 h-5" /></div>
                  <div>
                    <h3 className="text-sm font-black text-white uppercase">ACTIVATED: ดูคะแนนคนอื่น</h3>
                    <p className="text-[10px] text-slate-400">ค้นหาเป้าหมายเพื่อแอบดูคะแนน</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl"><ArrowLeftRight className="w-5 h-5" /></div>
                  <div>
                    <h3 className="text-sm font-black text-amber-400 uppercase">ACTIVATED: มหาเวทย์สลับแต้ม</h3>
                    <p className="text-[10px] text-slate-400">เลือกเป้าหมายที่จะสลับคะแนนด้วย</p>
                  </div>
                </>
              )}
            </div>

            {/* ฟอร์มกรอกเป้าหมาย */}
            <form onSubmit={handlePopupSubmit} className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-slate-400 block mb-1">ระบุผู้เล่นเป้าหมาย (พิมพ์ ID หรือ ชื่อจริงก็ได้)</label>
                <input
                  type="text"
                  placeholder="เช่น Y01 หรือ ชื่อผู้เล่น"
                  value={targetQuery}
                  onChange={(e) => setTargetQuery(e.target.value)}
                  disabled={loadingAction}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white text-xs font-bold focus:outline-none focus:border-cyan-500"
                />
              </div>

              <button
                type="submit"
                disabled={loadingAction}
                className={`w-full py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition ${
                  activePopup.type === 'see_score' 
                    ? 'bg-cyan-600 hover:bg-cyan-500 text-white' 
                    : 'bg-amber-600 hover:bg-amber-500 text-white'
                }`}
              >
                {loadingAction ? 'กำลังตรวจสอบ...' : 'ยืนยันเป้าหมาย'}
              </button>
            </form>

            {/* ส่วนแสดงผลข้อมูลการส่อง หรือ Error ใน Popup */}
            {popupMessage.text && (
              <div className={`text-xs p-3 rounded-xl border font-bold text-center leading-relaxed ${
                popupMessage.isError 
                  ? 'text-red-400 bg-red-500/10 border-red-500/20' 
                  : 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20'
              }`}>
                {popupMessage.text}
              </div>
            )}

          </div>
        </div>
      )}

    </main>
  );
}