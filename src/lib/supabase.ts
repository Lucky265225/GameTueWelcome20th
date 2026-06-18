import { createClient } from '@supabase/supabase-js';

// 🟢 แก้ไข: ใช้เครื่องหมาย ! เพื่อบอก TypeScript ว่า "ค่านี้มีชัวร์ๆ ไม่ต้องกลัวหาย"
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// ทำ Singleton ป้องกันการสร้าง Connection ซ้ำซ้อนตอน Dev
const globalForSupabase = globalThis as unknown as {
  supabase: ReturnType<typeof createClient>;
};

export const supabase =
  globalForSupabase.supabase || createClient(supabaseUrl, supabaseAnonKey);

if (process.env.NODE_ENV !== 'production') globalForSupabase.supabase = supabase;

// เรียกใช้ db() เพื่อเข้าถึง Schema หลักทันที
export const db = () => supabase;