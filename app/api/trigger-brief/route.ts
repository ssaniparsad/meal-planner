import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { google } from 'googleapis'
import ical from 'node-ical'
import { composeMorningBrief, checkIngredientGaps } from '@/lib/claude'
import { getWeekStart } from '@/lib/supabase'
import { formatInTimeZone } from 'date-fns-tz'
import { startOfDay, endOfDay, isToday } from 'date-fns'

const SAST_TZ = 'Africa/Johannesburg'

function getGoogleAuth() {
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  )
  oauth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
  return oauth2
}

async function getCalendarEvents(date: Date) {
  const results: { time: string; title: string; location?: string }[] = []

  // Google Calendar
  try {
    const auth = getGoogleAuth()
    const calendar = google.calendar({ version: 'v3', auth })
    const res = await calendar.events.list({
      calendarId: 'primary',
      timeMin: startOfDay(date).toISOString(),
      timeMax: endOfDay(date).toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    })
    for (const event of res.data.items ?? []) {
      results.push({
        time: event.start?.dateTime
          ? formatInTimeZone(new Date(event.start.dateTime), SAST_TZ, 'HH:mm')
          : 'All day',
        title: event.summary ?? 'Untitled',
        location: event.location ?? undefined,
      })
    }
  } catch {}

  // iCloud Calendar
  const icsUrl = process.env.ICLOUD_CALENDAR_URL
  if (icsUrl) {
    try {
      const events = await ical.async.fromURL(icsUrl)
      for (const event of Object.values(events)) {
        if (!event || event.type !== 'VEVENT') continue
        const vevent = event as unknown as { start?: Date; summary?: string }
        const start = vevent.start
        if (!start || !isToday(start)) continue
        results.push({
          time: formatInTimeZone(start, SAST_TZ, 'HH:mm'),
          title: vevent.summary ?? 'Untitled',
        })
      }
    } catch {}
  }

  return results.sort((a, b) => a.time.localeCompare(b.time))
}

async function getImportantEmails() {
  try {
    const auth = getGoogleAuth()
    const gmail = google.gmail({ version: 'v1', auth })
    const res = await gmail.users.messages.list({
      userId: 'me',
      q: 'is:unread newer_than:1d -category:promotions -category:social',
      maxResults: 10,
    })
    const messages = res.data.messages ?? []
    const emails: { from: string; subject: string }[] = []
    for (const msg of messages.slice(0, 5)) {
      const detail = await gmail.users.messages.get({
        userId: 'me', id: msg.id!, format: 'metadata',
        metadataHeaders: ['From', 'Subject'],
      })
      const headers = detail.data.payload?.headers ?? []
      const from = headers.find(h => h.name === 'From')?.value ?? ''
      const subject = headers.find(h => h.name === 'Subject')?.value ?? '(no subject)'
      emails.push({ from: from.replace(/<[^>]+>/, '').trim().replace(/"/g, '') || from, subject })
    }
    return emails
  } catch { return [] }
}

async function sendEmail(subject: string, html: string, text: string) {
  const auth = getGoogleAuth()
  const gmail = google.gmail({ version: 'v1', auth })
  const to = process.env.GMAIL_ADDRESS!
  const raw = Buffer.from(
    [`To: ${to}`, `Subject: ${subject}`, 'MIME-Version: 1.0',
     'Content-Type: multipart/alternative; boundary="b"', '',
     '--b', 'Content-Type: text/plain; charset=UTF-8', '', text,
     '--b', 'Content-Type: text/html; charset=UTF-8', '', html, '--b--'].join('\n')
  ).toString('base64url')
  await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })
}

// POST /api/trigger-brief  — protected by TRIGGER_SECRET
export async function POST(req: NextRequest) {
  const secret = req.headers.get('authorization')?.replace('Bearer ', '')
  if (secret !== process.env.TRIGGER_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const today = new Date()
  const todayLabel = formatInTimeZone(today, SAST_TZ, 'EEEE d MMMM yyyy')
  const jsDay = today.getDay()
  const dayIndex = jsDay === 0 ? 6 : jsDay - 1
  const weekStart = getWeekStart(today)

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [calendarEvents, emailSummary, mealsData, shoppingData] = await Promise.all([
    getCalendarEvents(today),
    getImportantEmails(),
    supabase.from('meal_plans').select('meal_slot, meal_name').eq('week_start', weekStart).eq('day_of_week', dayIndex),
    supabase.from('shopping_list').select('item').eq('week_start', weekStart),
  ])

  const meals = (mealsData.data ?? []).map(m => ({ slot: m.meal_slot, name: m.meal_name }))
  const shoppingList = (shoppingData.data ?? []).map(i => i.item)
  const mealNames = meals.map(m => m.name)

  let gaps: { meal: string; missingIngredients: string[] }[] = []
  if (mealNames.length > 0) {
    try { gaps = await checkIngredientGaps(mealNames, shoppingList) } catch {}
  }

  const email = await composeMorningBrief({
    date: todayLabel,
    calendarEvents,
    importantEmails: emailSummary,
    meals,
    ingredientGaps: gaps,
  })

  await sendEmail(email.subject, email.html, email.text)

  return NextResponse.json({ success: true, date: todayLabel })
}
