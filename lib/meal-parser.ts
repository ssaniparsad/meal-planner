import * as fs from 'fs'

interface ParsedWeek {
  weekDate: string
  meals: Record<string, string[]>  // day -> meal names
  shoppingList: string[]
}

interface MealHistoryEntry {
  meal_name: string
  frequency: number
  last_cooked?: string
  tags: string[]
}

const DAY_PATTERNS = [
  /^sunday[:\s]/i,
  /^monday[:\s]/i,
  /^tuesday[:\s]/i,
  /^wednesday[:\s]/i,
  /^thursday[:\s]/i,
  /^friday[:\s]/i,
  /^saturday[:\s]/i,
]

const SHOPPING_PATTERNS = [/^shopping(?: list)?[:\s]/i, /^to buy[:\s]/i]

// Tag meal names with categories based on keywords
function tagMeal(meal: string): string[] {
  const tags: string[] = []
  const lower = meal.toLowerCase()
  if (/chicken|drumstick|fillet|breast/.test(lower)) tags.push('chicken')
  if (/lamb|chop/.test(lower)) tags.push('lamb')
  if (/fish|salmon|tuna|tinfish/.test(lower)) tags.push('fish')
  if (/pasta|spaghetti/.test(lower)) tags.push('pasta')
  if (/rice/.test(lower)) tags.push('rice')
  if (/veg|vegetabl|corn|beans|spinach/.test(lower)) tags.push('vegetarian')
  if (/curry/.test(lower)) tags.push('curry')
  if (/roast/.test(lower)) tags.push('roast')
  if (/salad/.test(lower)) tags.push('salad')
  return tags
}

export function parseWhatsAppChat(filePath: string): MealHistoryEntry[] {
  const content = fs.readFileSync(filePath, 'utf-8')
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean)

  const mealCounts: Record<string, { count: number; lastDate?: string; tags: string[] }> = {}

  let inShoppingList = false
  let currentDate: string | undefined

  for (const line of lines) {
    // Extract timestamp and message
    const msgMatch = line.match(/^\[(\d{4}\/\d{2}\/\d{2}),\s[\d:]+\]\s[^:]+:\s(.+)$/)
    if (!msgMatch) continue

    const [, dateStr, message] = msgMatch
    const cleanDate = dateStr.replace(/\//g, '-')

    // Skip system messages
    if (message.startsWith('\u200e') || message.includes('changed the group')) continue

    // Check if this is a day header
    const isDayLine = DAY_PATTERNS.some(p => p.test(message))
    const isShoppingLine = SHOPPING_PATTERNS.some(p => p.test(message))

    if (isShoppingLine) {
      inShoppingList = true
      currentDate = cleanDate
      continue
    }

    if (isDayLine) {
      inShoppingList = false
      currentDate = cleanDate

      // Extract meal name from same line e.g. "Monday: Chicken curry"
      const mealPart = message.replace(/^(sunday|monday|tuesday|wednesday|thursday|friday|saturday)[:\s]*/i, '').trim()
      if (mealPart && mealPart.length > 2) {
        const normalized = normalizeMeal(mealPart)
        if (normalized) recordMeal(normalized, cleanDate, mealCounts)
      }
      continue
    }

    // If not in shopping list and message looks like a meal name (short, no URLs)
    if (!inShoppingList && message.length < 60 && !message.includes('http') && currentDate) {
      const normalized = normalizeMeal(message)
      if (normalized) recordMeal(normalized, currentDate, mealCounts)
    }
  }

  return Object.entries(mealCounts).map(([meal_name, data]) => ({
    meal_name,
    frequency: data.count,
    last_cooked: data.lastDate,
    tags: data.tags,
  })).sort((a, b) => b.frequency - a.frequency)
}

function normalizeMeal(raw: string): string | null {
  const cleaned = raw
    .replace(/leftover[s]?/gi, '')
    .replace(/\(.*?\)/g, '')
    .replace(/[^\w\s&/]/g, '')
    .trim()

  // Skip noise
  if (cleaned.length < 4) return null
  if (/milk|bread|eggs|butter|toilet|tp|water|coffee|toothpaste/i.test(cleaned)) return null

  // Title case
  return cleaned.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
}

function recordMeal(
  name: string,
  date: string,
  counts: Record<string, { count: number; lastDate?: string; tags: string[] }>
) {
  if (!counts[name]) {
    counts[name] = { count: 0, tags: tagMeal(name) }
  }
  counts[name].count++
  if (!counts[name].lastDate || date > counts[name].lastDate!) {
    counts[name].lastDate = date
  }
}
