import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { google } from 'googleapis'
import { suggestMeals, generateShoppingList } from '@/lib/claude'
import { format, addWeeks } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'

const SAST_TZ = 'Africa/Johannesburg'
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function getGoogleAuth() {
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  )
  oauth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
  return oauth2
}

async function sendEmail(to: string, subject: string, html: string, text: string) {
  const auth = getGoogleAuth()
  const gmail = google.gmail({ version: 'v1', auth })
  const raw = Buffer.from(
    [`To: ${to}`, `Subject: ${subject}`, 'MIME-Version: 1.0',
     'Content-Type: multipart/alternative; boundary="b"', '',
     '--b', 'Content-Type: text/plain; charset=UTF-8', '', text,
     '--b', 'Content-Type: text/html; charset=UTF-8', '', html, '--b--'].join('\n')
  ).toString('base64url')
  await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })
}

// POST /api/trigger-weekly  — protected by TRIGGER_SECRET
export async function POST(req: NextRequest) {
  const secret = req.headers.get('authorization')?.replace('Bearer ', '')
  if (secret !== process.env.TRIGGER_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const nextWeekStart = format(addWeeks(new Date(), 1), 'yyyy-MM-dd')
  const weekLabel = formatInTimeZone(new Date(nextWeekStart + 'T12:00:00Z'), SAST_TZ, "'Week of' d MMMM")

  const { data: history } = await supabase
    .from('meal_history').select('meal_name, frequency')
    .order('frequency', { ascending: false }).limit(50)

  const { data: recentMeals } = await supabase
    .from('meal_plans').select('meal_name')
    .gte('week_start', format(addWeeks(new Date(), -2), 'yyyy-MM-dd'))
    .eq('is_suggested', false)

  const historyList = (history ?? []).map(h => `${h.meal_name} (cooked ${h.frequency}x)`)
  const recentList = [...new Set((recentMeals ?? []).map(m => m.meal_name))]

  const suggestions = await suggestMeals(historyList, recentList, 7)

  // Clear old unapproved suggestions + insert new ones
  await supabase.from('meal_plans').delete()
    .eq('week_start', nextWeekStart).eq('is_suggested', true).eq('approved', false)

  const rows = suggestions.map(s => ({
    week_start: nextWeekStart,
    day_of_week: s.day,
    meal_slot: 'dinner',
    meal_name: s.dinner,
    notes: s.alternatives.length > 0 ? `Alternatives: ${s.alternatives.join(', ')}` : null,
    is_suggested: true,
    approved: false,
  }))

  await supabase.from('meal_plans').insert(rows)

  // Generate + save shopping list
  try {
    const shoppingItems = await generateShoppingList(suggestions.map(s => s.dinner))
    await supabase.from('shopping_list').delete().eq('week_start', nextWeekStart)
    await supabase.from('shopping_list').insert(
      shoppingItems.map(i => ({
        week_start: nextWeekStart,
        item: i.item,
        quantity: i.quantity || null,
        category: i.category || 'other',
        checked: false,
      }))
    )
  } catch {}

  // Email both users
  const mealSummary = suggestions
    .map(s => `${DAY_NAMES[s.day]}: ${s.dinner}${s.alternatives[0] ? ` (alt: ${s.alternatives[0]})` : ''}`)
    .join('\n')

  const dashboardUrl = process.env.DASHBOARD_URL ?? ''
  const html = `
    <div style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a1a2e">
      <h1 style="font-size:22px;font-weight:700;color:#4f46e5">✨ Meal Plan Ready for ${weekLabel}</h1>
      <p style="color:#6b7280;font-size:14px;margin-bottom:24px">Your AI-generated dinner plan for next week is ready to review and approve.</p>
      <div style="background:#f9fafb;border-radius:12px;padding:16px;margin-bottom:24px;border:1px solid #e5e7eb">
        <h2 style="font-size:14px;font-weight:600;color:#374151;margin:0 0 12px 0">🍽️ Suggested Dinners</h2>
        <pre style="font-size:13px;color:#4b5563;white-space:pre-wrap;margin:0;font-family:inherit">${mealSummary}</pre>
      </div>
      ${dashboardUrl ? `<a href="${dashboardUrl}" style="display:inline-block;background:#4f46e5;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">Open Dashboard →</a>` : ''}
      <p style="color:#9ca3af;font-size:12px;margin-top:24px">Approve or adjust meals before Sunday shopping.</p>
    </div>`

  const text = `Your meal plan for ${weekLabel} is ready!\n\n${mealSummary}\n\n${dashboardUrl ? 'Open the dashboard: ' + dashboardUrl : ''}`

  const subject = `✨ Meal Plan for ${weekLabel} is ready to review`
  const recipients = [process.env.GMAIL_ADDRESS, process.env.NISHKA_EMAIL].filter(Boolean) as string[]
  for (const to of recipients) {
    try { await sendEmail(to, subject, html, text) } catch {}
  }

  return NextResponse.json({ success: true, weekStart: nextWeekStart, suggestions: rows.length })
}
