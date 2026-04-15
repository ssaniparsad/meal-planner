export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getWeekStart } from '@/lib/supabase'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// GET /api/meals?week=2024-04-15  (or ?date=today for today's meals)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const supabase = getSupabase()

  let weekStart = searchParams.get('week')
  const dateParam = searchParams.get('date')

  if (dateParam === 'today' || dateParam) {
    const date = dateParam === 'today' ? new Date() : new Date(dateParam)
    weekStart = getWeekStart(date)
  }

  if (!weekStart) weekStart = getWeekStart()

  const { data, error } = await supabase
    .from('meal_plans')
    .select('*')
    .eq('week_start', weekStart)
    .order('day_of_week')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ meals: data, weekStart })
}

// POST /api/meals  — upsert a meal
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { week_start, day_of_week, meal_slot, meal_name, notes, is_suggested, approved } = body
  const supabase = getSupabase()

  if (!week_start || day_of_week === undefined || !meal_slot || !meal_name) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Delete existing entry for this slot first (upsert by logical key)
  await supabase
    .from('meal_plans')
    .delete()
    .eq('week_start', week_start)
    .eq('day_of_week', day_of_week)
    .eq('meal_slot', meal_slot)

  const { data, error } = await supabase
    .from('meal_plans')
    .insert({ week_start, day_of_week, meal_slot, meal_name, notes, is_suggested: is_suggested ?? false, approved: approved ?? false })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Update meal_history frequency (best-effort, ignore errors)
  try { await supabase.rpc('increment_meal_frequency', { p_meal_name: meal_name }) } catch {}

  return NextResponse.json({ meal: data })
}

// DELETE /api/meals?id=xxx
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const supabase = getSupabase()

  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const { error } = await supabase.from('meal_plans').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

// PATCH /api/meals — update approved status
export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { id, approved } = body
  const supabase = getSupabase()

  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const { data, error } = await supabase
    .from('meal_plans')
    .update({ approved })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ meal: data })
}
