#!/usr/bin/env npx ts-node
/**
 * Daily Morning Brief Script
 * Runs at 8:00am SAST (6:00 UTC) via Claude Code CronCreate trigger.
 *
 * What it does:
 * 1. Fetches today's calendar events (Google Calendar + iCloud ICS)
 * 2. Summarises key unread emails (last 24h)
 * 3. Gets today's planned meals from Supabase
 * 4. Checks for ingredient gaps in the shopping list
 * 5. Composes + sends a beautiful HTML email to Sheylyn's Gmail
 */

import { createClient } from '@supabase/supabase-js'
import { google } from 'googleapis'
import ical from 'node-ical'
import * as https from 'https'
import * as path from 'path'
import * as dotenv from 'dotenv'
import { composeMorningBrief, checkIngredientGaps } from '../lib/claude'
import { getWeekStart, DAY_NAMES } from '../lib/supabase'
import { format, parseISO, isToday, startOfDay, endOfDay } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'

dotenv.config({ path: path.join(__dirname, '../.env.local') })

const SAST_TZ = 'Africa/Johannesburg'

// ─── Supabase ───────────────────────────────────────────────────────────────
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// ─── Google Auth ─────────────────────────────────────────────────────────────
function getGoogleAuth() {
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  )
  oauth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
  return oauth2
}

// ─── Google Calendar ─────────────────────────────────────────────────────────
async function getGoogleCalendarEvents(date: Date) {
  try {
    const auth = getGoogleAuth()
    const calendar = google.calendar({ version: 'v3', auth })

    const timeMin = startOfDay(date).toISOString()
    const timeMax = endOfDay(date).toISOString()

    const res = await calendar.events.list({
      calendarId: 'primary',
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
    })

    return (res.data.items ?? []).map(event => ({
      time: event.start?.dateTime
        ? formatInTimeZone(new Date(event.start.dateTime), SAST_TZ, 'HH:mm')
        : 'All day',
      title: event.summary ?? 'Untitled',
      location: event.location,
    }))
  } catch (err) {
    console.error('Google Calendar error:', err)
    return []
  }
}

// ─── iCloud Calendar ─────────────────────────────────────────────────────────
async function getICloudEvents(date: Date): Promise<{ time: string; title: string }[]> {
  const icsUrl = process.env.ICLOUD_CALENDAR_URL
  if (!icsUrl) return []

  try {
    const events = await ical.async.fromURL(icsUrl)
    const todayEvents: { time: string; title: string }[] = []

    for (const event of Object.values(events)) {
      if (!event || event.type !== 'VEVENT') continue
      const vevent = event as unknown as { start?: Date; summary?: string }
      const start = vevent.start
      if (!start || !isToday(start)) continue
      todayEvents.push({
        time: formatInTimeZone(start, SAST_TZ, 'HH:mm'),
        title: vevent.summary ?? 'Untitled',
      })
    }

    return todayEvents.sort((a, b) => a.time.localeCompare(b.time))
  } catch (err) {
    console.error('iCloud Calendar error:', err)
    return []
  }
}

// ─── Gmail (via REST API using OAuth token) ───────────────────────────────────
async function getImportantEmails(auth: ReturnType<typeof getGoogleAuth>) {
  try {
    const gmail = google.gmail({ version: 'v1', auth })

    // Get unread messages from last 24h, excluding promotions/social
    const res = await gmail.users.messages.list({
      userId: 'me',
      q: 'is:unread newer_than:1d -category:promotions -category:social',
      maxResults: 10,
    })

    const messages = res.data.messages ?? []
    const emails: { from: string; subject: string }[] = []

    for (const msg of messages.slice(0, 5)) {
      const detail = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id!,
        format: 'metadata',
        metadataHeaders: ['From', 'Subject'],
      })

      const headers = detail.data.payload?.headers ?? []
      const from = headers.find(h => h.name === 'From')?.value ?? ''
      const subject = headers.find(h => h.name === 'Subject')?.value ?? '(no subject)'

      // Extract display name from "Name <email>" format
      const fromName = from.replace(/<[^>]+>/, '').trim().replace(/"/g, '') || from

      emails.push({ from: fromName, subject })
    }

    return emails
  } catch (err) {
    console.error('Gmail error:', err)
    return []
  }
}

// ─── Send email via Gmail API ─────────────────────────────────────────────────
async function sendEmail(
  auth: ReturnType<typeof getGoogleAuth>,
  to: string,
  subject: string,
  html: string,
  text: string
) {
  const gmail = google.gmail({ version: 'v1', auth })

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

// ─── Main ─────────────────────────────────────────────────────────────────────
async function runDailyBrief() {
  const today = new Date()
  const todayLabel = formatInTimeZone(today, SAST_TZ, 'EEEE d MMMM yyyy')
  console.log(`Running daily brief for ${todayLabel}`)

  // Get today's day of week (Mon=0, Sun=6)
  const jsDay = today.getDay() // 0=Sun
  const dayIndex = jsDay === 0 ? 6 : jsDay - 1
  const weekStart = getWeekStart(today)

  // Parallel data fetching
  const auth = getGoogleAuth()
  const [googleEvents, icloudEvents, emailSummary, mealsData, shoppingData] = await Promise.all([
    getGoogleCalendarEvents(today),
    getICloudEvents(today),
    getImportantEmails(auth),
    supabase.from('meal_plans').select('meal_slot, meal_name').eq('week_start', weekStart).eq('day_of_week', dayIndex),
    supabase.from('shopping_list').select('item').eq('week_start', weekStart),
  ])

  // Merge calendar events and sort by time
  const allEvents = [...googleEvents, ...icloudEvents].sort((a, b) => a.time.localeCompare(b.time))

  const meals = (mealsData.data ?? []).map(m => ({
    slot: m.meal_slot,
    name: m.meal_name,
  }))

  const shoppingList = (shoppingData.data ?? []).map(i => i.item)
  const mealNames = meals.map(m => m.name)

  // Check ingredient gaps
  let gaps: { meal: string; missingIngredients: string[] }[] = []
  if (mealNames.length > 0 && shoppingList.length > 0) {
    try {
      gaps = await checkIngredientGaps(mealNames, shoppingList)
    } catch {
      // non-critical
    }
  }

  // Compose email with Claude
  const email = await composeMorningBrief({
    date: todayLabel,
    calendarEvents: allEvents,
    importantEmails: emailSummary,
    meals,
    ingredientGaps: gaps,
  })

  // Send it
  const recipient = process.env.GMAIL_ADDRESS!
  await sendEmail(auth, recipient, email.subject, email.html, email.text)

  console.log(`✓ Morning brief sent to ${recipient}`)
}

runDailyBrief().catch(err => {
  console.error('Daily brief failed:', err)
  process.exit(1)
})
