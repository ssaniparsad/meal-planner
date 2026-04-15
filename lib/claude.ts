import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export async function suggestMeals(
  mealHistory: string[],
  recentMeals: string[],
  daysNeeded: number = 7
): Promise<{ day: number; dinner: string; alternatives: string[] }[]> {
  const message = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 1024,
    system: `You are a helpful meal planning assistant for a South African couple (Sheylyn and Nishka).
They enjoy a variety of meals including chicken dishes, pasta, fish, lamb, and vegetarian options.
Respond ONLY with valid JSON — no prose, no markdown fences.`,
    messages: [
      {
        role: 'user',
        content: `Based on this family's meal history, suggest a 7-day dinner plan for next week.
Avoid repeating any of the recent meals listed below.
Include 2 alternatives per day.

Meal history (most frequent first):
${mealHistory.join('\n')}

Recent meals to avoid:
${recentMeals.join('\n')}

Respond as JSON array with ${daysNeeded} objects:
[{ "day": 0, "dinner": "Meal name", "alternatives": ["Alt 1", "Alt 2"] }, ...]
where day 0 = Monday, day 6 = Sunday.`,
      },
    ],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''
  return JSON.parse(text)
}

export async function generateShoppingList(
  meals: string[]
): Promise<{ item: string; quantity: string; category: string }[]> {
  const message = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 1024,
    system: `You are a practical meal planning assistant. Given a list of meals, generate a concise shopping list.
Group items sensibly. Respond ONLY with valid JSON — no prose, no markdown fences.`,
    messages: [
      {
        role: 'user',
        content: `Generate a shopping list for these meals this week:
${meals.join('\n')}

Respond as JSON array:
[{ "item": "Chicken breasts", "quantity": "4", "category": "meat" }, ...]
Categories: produce | meat | dairy | pantry | other`,
      },
    ],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''
  return JSON.parse(text)
}

export async function checkIngredientGaps(
  meals: string[],
  shoppingList: string[]
): Promise<{ meal: string; missingIngredients: string[] }[]> {
  const message = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 512,
    system: `You are a practical meal planning assistant.
Respond ONLY with valid JSON — no prose, no markdown fences.`,
    messages: [
      {
        role: 'user',
        content: `For each meal below, identify key ingredients that are NOT covered by the shopping list.
Only flag clearly missing essentials (main proteins, key vegetables) — ignore staples like salt, oil, butter.

Meals:
${meals.join('\n')}

Shopping list:
${shoppingList.join('\n')}

Respond as JSON array. Only include meals that have gaps:
[{ "meal": "Chicken curry", "missingIngredients": ["Coconut milk", "Curry paste"] }, ...]`,
      },
    ],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''
  return JSON.parse(text)
}

export async function composeMorningBrief(params: {
  date: string
  calendarEvents: { time: string; title: string; location?: string }[]
  importantEmails: { from: string; subject: string }[]
  meals: { slot: string; name: string }[]
  ingredientGaps: { meal: string; missingIngredients: string[] }[]
}): Promise<{ subject: string; html: string; text: string }> {
  const message = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 2048,
    system: `You compose beautiful daily morning brief emails.
The tone is warm, personal, and practical. The user's name is Sheylyn.
Respond ONLY with valid JSON — no prose, no markdown fences.`,
    messages: [
      {
        role: 'user',
        content: `Compose a morning brief email for ${params.date}.

Calendar events: ${JSON.stringify(params.calendarEvents)}
Important emails: ${JSON.stringify(params.importantEmails)}
Today's meals: ${JSON.stringify(params.meals)}
Ingredient gaps: ${JSON.stringify(params.ingredientGaps)}

Return JSON: { "subject": "...", "html": "...", "text": "..." }
The HTML should be clean, readable, well-structured with emoji section headers.
Keep it concise — under 400 words total.`,
      },
    ],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''
  return JSON.parse(text)
}
