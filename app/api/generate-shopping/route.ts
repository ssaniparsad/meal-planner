import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateShoppingList, checkIngredientGaps } from '@/lib/claude'
import { getWeekStart } from '@/lib/supabase'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// POST /api/generate-shopping — AI generates shopping list from current week's meals
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const weekStart = body.week_start ?? getWeekStart()
  const supabase = getSupabase()

  // Get all meals for the week
  const { data: meals } = await supabase
    .from('meal_plans')
    .select('meal_name, meal_slot')
    .eq('week_start', weekStart)

  if (!meals || meals.length === 0) {
    return NextResponse.json({ error: 'No meals found for this week' }, { status: 400 })
  }

  const mealNames = meals.map(m => m.meal_name)

  let items
  try {
    items = await generateShoppingList(mealNames)
  } catch (err) {
    return NextResponse.json({ error: 'AI shopping list generation failed', details: String(err) }, { status: 500 })
  }

  // Clear existing generated shopping items for this week (keep manually added ones)
  // We'll just add/merge — don't delete manually entered items
  const rows = items.map(i => ({
    week_start: weekStart,
    item: i.item,
    quantity: i.quantity || null,
    category: i.category || 'other',
    checked: false,
  }))

  const { error } = await supabase.from('shopping_list').insert(rows)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Also check for gaps
  const existingList = rows.map(r => `${r.item}${r.quantity ? ` x${r.quantity}` : ''}`)
  let gaps: { meal: string; missingIngredients: string[] }[] = []
  try {
    gaps = await checkIngredientGaps(mealNames, existingList)
  } catch {
    // Non-critical, continue without gaps
  }

  return NextResponse.json({ items: rows, gaps, weekStart })
}

// GET /api/generate-shopping?week=xxx — just check ingredient gaps
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const weekStart = searchParams.get('week') ?? getWeekStart()
  const supabase = getSupabase()

  const { data: meals } = await supabase
    .from('meal_plans')
    .select('meal_name')
    .eq('week_start', weekStart)

  const { data: shoppingItems } = await supabase
    .from('shopping_list')
    .select('item, quantity')
    .eq('week_start', weekStart)

  if (!meals?.length) return NextResponse.json({ gaps: [] })

  const mealNames = (meals ?? []).map(m => m.meal_name)
  const shoppingList = (shoppingItems ?? []).map(i => i.item)

  try {
    const gaps = await checkIngredientGaps(mealNames, shoppingList)
    return NextResponse.json({ gaps })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
