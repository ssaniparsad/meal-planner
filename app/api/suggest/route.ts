export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { suggestMeals } from '@/lib/claude'
import { getWeekStart } from '@/lib/supabase'
import { addWeeks, format } from 'date-fns'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// POST /api/suggest — generate AI meal suggestions for next week
export async function POST(req: NextRequest) {
  const supabase = getSupabase()

  // Get next week's Monday
  const nextWeekStart = format(addWeeks(new Date(), 1), 'yyyy-MM-dd')
  const currentWeekStart = getWeekStart()

  // Fetch meal history (sorted by frequency)
  const { data: history } = await supabase
    .from('meal_history')
    .select('meal_name, frequency')
    .order('frequency', { ascending: false })
    .limit(40)

  // Fetch recent meals (last 2 weeks) to avoid repetition
  const { data: recentMeals } = await supabase
    .from('meal_plans')
    .select('meal_name')
    .gte('week_start', format(addWeeks(new Date(), -2), 'yyyy-MM-dd'))

  const historyList = (history ?? []).map(h => `${h.meal_name} (cooked ${h.frequency}x)`)
  const recentList = [...new Set((recentMeals ?? []).map(m => m.meal_name))]

  let suggestions
  try {
    suggestions = await suggestMeals(historyList, recentList, 7)
  } catch (err) {
    return NextResponse.json({ error: 'AI suggestion failed', details: String(err) }, { status: 500 })
  }

  // Write suggestions to meal_plans for dinners
  const rows = suggestions.map(s => ({
    week_start: nextWeekStart,
    day_of_week: s.day,
    meal_slot: 'dinner',
    meal_name: s.dinner,
    notes: s.alternatives.length > 0 ? `Alternatives: ${s.alternatives.join(', ')}` : undefined,
    is_suggested: true,
    approved: false,
  }))

  // Clear previous unapproved suggestions for next week
  await supabase
    .from('meal_plans')
    .delete()
    .eq('week_start', nextWeekStart)
    .eq('is_suggested', true)
    .eq('approved', false)

  const { error } = await supabase.from('meal_plans').insert(rows)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ suggestions: rows, weekStart: nextWeekStart })
}
