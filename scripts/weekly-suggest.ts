#!/usr/bin/env npx ts-node
/**
 * Weekly Meal Plan Suggestion Script
 * Runs every Saturday at 8:00pm SAST (18:00 UTC) via Claude Code CronCreate trigger.
 *
 * What it does:
 * 1. Fetches meal history from Supabase
 * 2. Fetches recent meals (last 2 weeks) to avoid repetition
 * 3. Uses Claude to generate a full week's dinner suggestions + alternatives
 * 4. Writes suggestions to Supabase (is_suggested=true, approved=false)
 * 5. Generates a shopping list from the suggested meals
 * 6. Emails BOTH Sheylyn and Nishka: "Your meal plan is ready to review"
 */

import { createClient } from '@supabase/supabase-js'
import { google } from 'googleapis'
import { suggestMeals, generateShoppingList } from '../lib/claude'
import * as path from 'path'
import * as dotenv from 'dotenv'
import { format, addWeeks } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import { getWeekStart } from '../lib/supabase'

dotenv.config({ path: path.join(__dirname, '../.env.local') })

const SAST_TZ = 'Africa/Johannesburg'
const DASHBOARD_URL = process.env.DASHBOARD_URL ?? 'http://localhost:3000'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function getGoogleAuth() {
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  )
  oauth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
  return oauth2
}

async function sendNotificationEmail(to: string, weekLabel: string, mealSummary: string) {
  const auth = getGoogleAuth()
  const gmail = google.gmail({ version: 'v1', auth })

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1a1a2e;">
      <h1 style="font-size: 22px; font-weight: 700; color: #4f46e5; margin-bottom: 4px;">✨ Meal Plan Ready for ${weekLabel}</h1>
      <p style="color: #6b7280; font-size: 14px; margin-bottom: 24px;">Your AI-generated meal suggestions for next week are ready to review.</p>

      <div style="background: #f9fafb; border-radius: 12px; padding: 16px; margin-bottom: 24px; border: 1px solid #e5e7eb;">
        <h2 style="font-size: 14px; font-weight: 600; color: #374151; margin: 0 0 12px 0;">🍽️ Suggested Dinners</h2>
        <pre style="font-size: 13px; color: #4b5563; white-space: pre-wrap; margin: 0; font-family: inherit;">${mealSummary}</pre>
      </div>

      <a href="${DASHBOARD_URL}" style="display: inline-block; background: #4f46e5; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
        Open Dashboard →
      </a>

      <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">
        Open the dashboard to approve, tweak, or replace any suggestions before Sunday shopping.
      </p>
    </div>
  `

  const text = `Your meal plan for ${weekLabel} is ready!\n\n${mealSummary}\n\nOpen the dashboard: ${DASHBOARD_URL}`

  const subject = `✨ Meal Plan for ${weekLabel} is ready to review`
  const messageParts = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: multipart/alternative; boundary="boundary"',
    '',
    '--boundary',
    'Content-Type: text/plain; charset=UTF-8',
    '',
    text,
    '--boundary',
    'Content-Type: text/html; charset=UTF-8',
    '',
    html,
    '--boundary--',
  ]

  const message = messageParts.join('\n')
  const encoded = Buffer.from(message).toString('base64url')

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encoded },
  })
}

async function runWeeklySuggest() {
  const nextWeekStart = format(addWeeks(new Date(), 1), 'yyyy-MM-dd')
  const weekLabel = formatInTimeZone(new Date(nextWeekStart + 'T12:00:00Z'), SAST_TZ, "'Week of' d MMMM")

  console.log(`Generating meal suggestions for ${weekLabel}`)

  // Fetch meal history sorted by frequency
  const { data: history } = await supabase
    .from('meal_history')
    .select('meal_name, frequency')
    .order('frequency', { ascending: false })
    .limit(50)

  // Fetch recent meals to avoid repetition
  const { data: recentMeals } = await supabase
    .from('meal_plans')
    .select('meal_name')
    .gte('week_start', format(addWeeks(new Date(), -2), 'yyyy-MM-dd'))
    .eq('is_suggested', false)  // only actual meals, not past suggestions

  const historyList = (history ?? []).map(h => `${h.meal_name} (cooked ${h.frequency}x)`)
  const recentList = [...new Set((recentMeals ?? []).map(m => m.meal_name))]

  console.log(`Using ${historyList.length} meals from history, avoiding ${recentList.length} recent meals`)

  // Generate AI suggestions
  const suggestions = await suggestMeals(historyList, recentList, 7)

  // Clear previous unapproved suggestions for next week
  await supabase
    .from('meal_plans')
    .delete()
    .eq('week_start', nextWeekStart)
    .eq('is_suggested', true)
    .eq('approved', false)

  // Insert new suggestions
  const rows = suggestions.map(s => ({
    week_start: nextWeekStart,
    day_of_week: s.day,
    meal_slot: 'dinner',
    meal_name: s.dinner,
    notes: s.alternatives.length > 0 ? `Alternatives: ${s.alternatives.join(', ')}` : null,
    is_suggested: true,
    approved: false,
  }))

  const { error: insertError } = await supabase.from('meal_plans').insert(rows)
  if (insertError) {
    console.error('Failed to insert suggestions:', insertError)
    process.exit(1)
  }

  console.log(`✓ Inserted ${rows.length} dinner suggestions`)

  // Generate shopping list from suggested meals
  const mealNames = suggestions.map(s => s.dinner)
  let shoppingItems: { item: string; quantity: string; category: string }[] = []

  try {
    shoppingItems = await generateShoppingList(mealNames)

    // Clear previous draft shopping list for next week
    await supabase.from('shopping_list').delete().eq('week_start', nextWeekStart)

    const shopRows = shoppingItems.map(i => ({
      week_start: nextWeekStart,
      item: i.item,
      quantity: i.quantity || null,
      category: i.category || 'other',
      checked: false,
    }))

    await supabase.from('shopping_list').insert(shopRows)
    console.log(`✓ Generated shopping list with ${shopRows.length} items`)
  } catch (err) {
    console.error('Shopping list generation failed (non-critical):', err)
  }

  // Build email summary
  const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  const mealSummary = suggestions
    .map(s => `${DAY_NAMES[s.day]}: ${s.dinner}${s.alternatives.length > 0 ? ` (alt: ${s.alternatives[0]})` : ''}`)
    .join('\n')

  // Email both Sheylyn and Nishka
  const recipients = [
    process.env.GMAIL_ADDRESS,
    process.env.NISHKA_EMAIL,
  ].filter(Boolean) as string[]

  for (const recipient of recipients) {
    try {
      await sendNotificationEmail(recipient, weekLabel, mealSummary)
      console.log(`✓ Notification sent to ${recipient}`)
    } catch (err) {
      console.error(`Failed to send to ${recipient}:`, err)
    }
  }

  console.log(`\n✓ Weekly suggest complete for ${weekLabel}`)
}

runWeeklySuggest().catch(err => {
  console.error('Weekly suggest failed:', err)
  process.exit(1)
})
