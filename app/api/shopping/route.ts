import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getWeekStart } from '@/lib/supabase'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// GET /api/shopping?week=2024-04-15
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const supabase = getSupabase()
  const weekStart = searchParams.get('week') ?? getWeekStart()

  const { data, error } = await supabase
    .from('shopping_list')
    .select('*')
    .eq('week_start', weekStart)
    .order('category')
    .order('item')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data, weekStart })
}

// POST /api/shopping — add item
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { week_start, item, quantity, category } = body
  const supabase = getSupabase()

  const weekStartFinal = week_start ?? getWeekStart()

  const { data, error } = await supabase
    .from('shopping_list')
    .insert({ week_start: weekStartFinal, item, quantity, category: category ?? 'other' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data })
}

// PATCH /api/shopping — toggle checked or update item
export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { id, checked, item, quantity, category } = body
  const supabase = getSupabase()

  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const updates: Record<string, unknown> = {}
  if (checked !== undefined) updates.checked = checked
  if (item !== undefined) updates.item = item
  if (quantity !== undefined) updates.quantity = quantity
  if (category !== undefined) updates.category = category

  const { data, error } = await supabase
    .from('shopping_list')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data })
}

// DELETE /api/shopping?id=xxx
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const supabase = getSupabase()

  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const { error } = await supabase.from('shopping_list').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
