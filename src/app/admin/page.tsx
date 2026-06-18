'use client';
import { useEffect, useState } from 'react';
import { db } from '@/lib/supabase';
import { Settings, RefreshCw, Plus, Minus, Users } from 'lucide-react';

export default function AdminDashboard() {
  const [isAuthed, setIsAuthed] = useState(false);
  const [adminPass, setAdminPass] = useState('');
  const [authError, setAuthError] = useState('');

  // บอร์ดควบคุมเกม
  const [allPlayers, setAllPlayers] = useState<any[]>([]);
  const [grandTotalScore, setGrandTotalScore] = useState(0);
  const [activePlayersCount, setActivePlayersCount] = useState(0);
  const [teamScores, setTeamScores] = useState({ blue: 0, red: 0, green: 0, yellow: 0 });
  const [isRefreshing, setIsRefreshing] = useState(false);

  // ระบบบวก/ลบคะแนนแบบพระเจ้า (God Mode)
  const [searchId, setSearchId] = useState('');
  const [targetPlayer, setTargetPlayer] = useState<any>(null);
  const [scoreModifyAmount, setScoreModifyAmount] = useState('10');

  useEffect(() => {
    if (localStorage.getItem('admin_session') === 'true') setIsAuthed(true);
  }, []);

  const calculateStats = (playersList: any[]) => {
    let grandTotal = 0;
    let activeCount = 0;
    let teams = { blue: 0, red: 0, green: 0, yellow: 0 };

    playersList.forEach((p) => {
      const score = p.score || 0;
      grandTotal += score;
      if (p.is_active) activeCount += 1;

      const color = p.team_color?.toLowerCase();
      if (color === 'blue') teams.blue += score;
      if (color === 'red') teams.red += score;
      if (color === 'green') teams.green += score;
      if (color === 'yellow') teams.yellow += score;
    });

    setGrandTotalScore(grandTotal);
    setActivePlayersCount(activeCount);
    setTeamScores(teams);
  };

  // 🔄 ฟังก์ชันแมนนวล: กดดึงข้อมูลล่าสุดจากคลาวด์เมื่อแอดมินต้องการ
  const fetchLatestData = async () => {
    try {
      setIsRefreshing(true);
      const { data: p, error } = await db()
        .from('players')
        .select('*')
        .order('id', { ascending: true });
      
      if (error) throw error;

      if (p) {
        setAllPlayers(p);
        calculateStats(p);
        
        // ถ้ากำลังเปิดหน้าต่างคุมใครค้างไว้ ให้ดึงค่าอัปเดตของคนนั้นมาด้วย
        if (targetPlayer) {
          const updatedTarget = p.find(item => item.id === targetPlayer.id);
          if (updatedTarget) setTargetPlayer(updatedTarget);
        }
      }
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการดึงข้อมูลล่าสุด');
    } finally {
      setIsRefreshing(false);
    }
  };

  // ดึงข้อมูลครั้งแรกครั้งเดียวตอนล็อกอินผ่าน (ไม่มีการเปิดท่อค้างไว้)
  useEffect(() => {
    if (isAuthed) {
      fetchLatestData();
    }
  }, [isAuthed]);

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPass === 'GameTUR2026') {
      localStorage.setItem('admin_session', 'true');
      setIsAuthed(true);
    } else {
      setAuthError('รหัสผ่านผู้ดูแลระบบไม่ถูกต้อง!');
    }
  };

  const handleFindPlayer = () => {
    const found = allPlayers.find(p => p.id === searchId.trim().toUpperCase());
    if (found) setTargetPlayer(found);
    else alert('ไม่พบผู้เล่นรหัสนี้ในระบบ (ลองกดปุ่มอัปเดตข้อมูลดูก่อนนะครับ)');
  };

  const handleModifyScore = async (type: 'PLUS' | 'MINUS') => {
    if (!targetPlayer) return;
    const amount = parseInt(scoreModifyAmount);
    if (isNaN(amount) || amount <= 0) return alert('กรุณาระบุจำนวนแต้มที่ถูกต้อง');

    const currentScore = targetPlayer.score || 0;
    const newScore = type === 'PLUS' ? currentScore + amount : Math.max(0, currentScore - amount);

    try {
      const { error } = await db().from('players').update({ score: newScore }).eq('id', targetPlayer.id);
      if (error) throw error;
      
      // อัปเดตข้อมูลหน้าจอทันทีหลังปรับแต้มสำเร็จโดยไม่ต้องรอรีเฟรชใหญ่
      const updatedPlayer = { ...targetPlayer, score: newScore };
      setTargetPlayer(updatedPlayer);
      
      const updatedList = allPlayers.map(p => p.id === targetPlayer.id ? updatedPlayer : p);
      setAllPlayers(updatedList);
      calculateStats(updatedList);
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการปรับคะแนน');
    }
  };

  const handleCleanReset = async () => {
    if (!confirm('⚠️ ยืนยันที่จะล้างกระดานเกม?\n- คะแนนทุกคนจะกลายเป็น 0\n- ชื่อเล่นจะถูกล้าง\n- บังคับเปิดสิทธิ์ลงทะเบียนใหม่ทั้งหมด')) return;

    try {
      await db().from('players').update({ score: 0, player_name: null, is_active: false }).neq('id', '');
      await db().from('drop_codes').update({ is_used: false, used_by: null, used_at: null }).neq('code', '');
      setTargetPlayer(null);
      setSearchId('');
      fetchLatestData(); // โหลดข้อมูลเปล่าๆ กลับมาโชว์
      alert('⚡ ล้างข้อมูลสำเร็จกระดานคะแนนเคลียร์เรียบร้อย!');
    } catch (err) {
      alert('เกิดข้อผิดพลาด');
    }
  };

  if (!isAuthed) {
    return (
      <main className="min-h-screen bg-slate-950 text-white flex justify-center items-center p-4">
        <div className="w-full max-w-sm bg-slate-900 border border-red-500/20 p-6 rounded-2xl">
          <h1 className="text-xl font-black text-center text-red-500 uppercase mb-4">🔒 COMMAND LOCK</h1>
          <form onSubmit={handleAdminLogin} className="space-y-4">
            <input
              type="password"
              value={adminPass}
              onChange={(e) => setAdminPass(e.target.value)}
              placeholder="ENTER ADMIN SECURITY KEY"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-center text-sm font-mono text-white focus:outline-none"
            />
            {authError && <p className="text-xs text-red-400 font-bold text-center">{authError}</p>}
            <button type="submit" className="w-full bg-red-600 hover:bg-red-500 py-3 text-xs font-black rounded-xl">AUTHORIZE ACCESS</button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white p-4 max-w-md mx-auto space-y-4 pb-20">
      
      {/* ส่วนหัวแอดมิน */}
      <div className="flex justify-between items-center border-b border-slate-800 pb-3">
        <div>
          <h1 className="text-xl font-black text-slate-100 flex items-center gap-1">
            <Settings className="w-5 h-5 text-red-500" /> MASTER PANEL
          </h1>
          <p className="text-[10px] text-slate-400 uppercase">โหมดปลอดภัยสูงสุด (ควบคุมด้วยมือ)</p>
        </div>
      </div>

      {/* 🔄 ปุ่มรีเฟรชใหญ่ประหยัดโควตา */}
      <button
        type="button"
        onClick={fetchLatestData}
        disabled={isRefreshing}
        className={`w-full py-3 rounded-2xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 border transition ${
          isRefreshing 
            ? 'bg-slate-900 border-slate-800 text-slate-500 cursor-not-allowed' 
            : 'bg-cyan-600 border-cyan-500 text-white hover:bg-cyan-500 shadow-[0_0_15px_rgba(8,145,178,0.2)]'
        }`}
      >
        <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
        {isRefreshing ? 'ดึงข้อมูลจากเซิร์ฟเวอร์...' : 'อัปเดตข้อมูลล่าสุด (FETCH LATEST)'}
      </button>

      {/* บอร์ดสถิติรวม */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-center">
          <span className="text-[9px] uppercase font-bold text-slate-400">คะแนนรวมทั้งหมดในเซิร์ฟ</span>
          <div className="text-2xl font-black font-mono text-cyan-400 mt-0.5">{grandTotalScore}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-center">
          <span className="text-[9px] uppercase font-bold text-slate-400">ผู้เล่นที่ Active แล้ว</span>
          <div className="text-2xl font-black font-mono text-emerald-400 mt-0.5">{activePlayersCount} คน</div>
        </div>
      </div>

      {/* 📊 บอร์ดสรุปคะแนนทีม 4 สี */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
        <span className="text-[10px] uppercase font-bold text-slate-400 block">📊 SCORE SUM BY TEAM</span>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-slate-950 p-2.5 rounded-xl text-center"><span className="text-blue-400 font-bold">BLUE TEAM</span> <div className="text-xl font-black font-mono text-white">{teamScores.blue}</div></div>
          <div className="bg-slate-950 p-2.5 rounded-xl text-center"><span className="text-red-400 font-bold">RED TEAM</span> <div className="text-xl font-black font-mono text-white">{teamScores.red}</div></div>
          <div className="bg-slate-950 p-2.5 rounded-xl text-center"><span className="text-green-400 font-bold">GREEN TEAM</span> <div className="text-xl font-black font-mono text-white">{teamScores.green}</div></div>
          <div className="bg-slate-950 p-2.5 rounded-xl text-center"><span className="text-yellow-400 font-bold">YELLOW TEAM</span> <div className="text-xl font-black font-mono text-white">{teamScores.yellow}</div></div>
        </div>
      </div>

      {/* GOD MODE: เพิ่ม/ลดแต้มรัวนิ้วไร้ขีดจำกัด */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
        <h3 className="text-xs font-bold text-slate-300 uppercase flex items-center gap-1">👑 GOD MODE: จัดการแต้มผู้เล่น</h3>
        {!targetPlayer ? (
          <div className="flex gap-2">
            <input type="text" value={searchId} onChange={(e) => setSearchId(e.target.value)} placeholder="ค้นหาไอดีผู้เล่น เช่น Y01" className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 uppercase font-mono text-xs text-white focus:outline-none" />
            <button type="button" onClick={handleFindPlayer} className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-xl text-xs font-bold text-white">ค้นหา</button>
          </div>
        ) : (
          <div className="bg-slate-950 p-3 rounded-xl space-y-3 border border-blue-500/20">
            <div className="flex justify-between items-center text-xs">
              <span>ไอดี: <span className="font-bold text-yellow-400 font-mono">{targetPlayer.id}</span> ({targetPlayer.player_name || 'ยังไม่ลงชื่อ'})</span>
              <span className="font-bold px-1.5 py-0.5 rounded text-[10px]" style={{ backgroundColor: targetPlayer.team_color }}>ทีม {targetPlayer.team_color}</span>
            </div>
            <div className="text-center font-mono"><span className="text-[10px] text-slate-500 block">แต้มปัจจุบัน</span><span className="text-2xl font-black text-emerald-400">{targetPlayer.score} PTS</span></div>
            <div className="flex gap-2">
              <input type="number" value={scoreModifyAmount} onChange={(e) => setScoreModifyAmount(e.target.value)} className="w-20 bg-slate-900 border border-slate-800 rounded-xl text-center text-sm text-white focus:outline-none" />
              <button type="button" onClick={() => handleModifyScore('PLUS')} className="flex-1 bg-emerald-600 font-bold text-xs py-2 rounded-xl text-white"><Plus className="w-3.5 h-3.5 inline mr-0.5" /> บวกแต้ม</button>
              <button type="button" onClick={() => handleModifyScore('MINUS')} className="flex-1 bg-red-600 font-bold text-xs py-2 rounded-xl text-white"><Minus className="w-3.5 h-3.5 inline mr-0.5" /> หักแต้ม</button>
            </div>
            <button type="button" onClick={() => { setTargetPlayer(null); setSearchId(''); }} className="text-[10px] text-slate-500 underline block w-full text-center">ปิดหน้าต่างควบคุมบุคคล</button>
          </div>
        )}
      </div>

      {/* แผงตารางรายชื่อผู้เล่นทั้งหมดในสนาม */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
        <h3 className="text-xs font-bold text-slate-300 uppercase flex items-center gap-1">
          <Users className="w-3.5 h-3.5 text-slate-400" /> PLAYERS MANIFEST
        </h3>
        <div className="max-h-52 overflow-y-auto rounded-xl font-mono text-xs divide-y divide-slate-950">
          {allPlayers.map((p) => {
            const isPlayerJailed = p.score <= 0;
            return (
              <div key={p.id} className={`p-2.5 flex justify-between items-center ${isPlayerJailed ? 'bg-red-950/20 text-red-400' : 'bg-slate-900 text-slate-300'}`}>
                <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.team_color }} /><span>{p.id} - {p.player_name || '[PENDING]'}</span></div>
                <div className="flex items-center gap-2"><span>{p.score} PTS</span>{isPlayerJailed && <span className="bg-red-600 text-white text-[8px] font-bold px-1 rounded">JAIL</span>}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ปุ่มล้างระบบ */}
      <button onClick={handleCleanReset} className="w-full bg-red-950 border border-red-900/40 py-3 rounded-2xl text-red-400 text-xs font-black uppercase tracking-wider transition hover:bg-red-900"><RefreshCw className="w-3 h-3 inline mr-1" /> SOFT CLEAN RESET GAME</button>
    </main>
  );
}