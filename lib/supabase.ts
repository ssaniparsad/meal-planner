import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Types
export type MealSlot = 'breakfast' | 'lunch' | 'dinner'

export interface MealPlan {
  id: string
  week_start: string   // ISO date string, always a Monday
  day_of_week: number  // 0 = Mon, 6 = Sun
  meal_slot: MealSlot
  meal_name: string
  notes?: string
  is_suggested: boolean
  approved: boolean
  created_at: string
  updated_at: string
}

export interface ShoppingItem {
  id: string
  week_start: string
  item: string
  quantity?: string
  category?: 'produce' | 'meat' | 'dairy' | 'pantry' | 'other'
  checked: boolean
  created_at: string
}

export interface MealHistory {
  id: string
  meal_name: string
  frequency: number
  last_cooked?: string
  source: string
  tags?: string[]
}

// Helpers
export function getWeekStart(date: Date = new Date()): string {
  const d = new Date(date)
  const day = d.getDay()
  // Adjust so Monday = 0
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d.toISOString().split('T')[0]
}

export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
