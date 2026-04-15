#!/usr/bin/env npx ts-node
/**
 * One-time seed script: parse WhatsApp chat → insert into meal_history table.
 * Run: npx ts-node scripts/seed-history.ts
 */

import { createClient } from '@supabase/supabase-js'
import { parseWhatsAppChat } from '../lib/meal-parser'
import * as path from 'path'
import * as dotenv from 'dotenv'

dotenv.config({ path: path.join(__dirname, '../.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function seed() {
  const chatPath = path.join(
    process.env.HOME!,
    'Downloads/whatsapp_menu_extract/_chat.txt'
  )

  console.log('Parsing WhatsApp chat...')
  const meals = parseWhatsAppChat(chatPath)

  console.log(`Found ${meals.length} unique meals:`)
  meals.forEach(m => console.log(`  ${m.meal_name} (x${m.frequency})`))

  console.log('\nSeeding into Supabase...')
  const { error } = await supabase
    .from('meal_history')
    .upsert(meals, { onConflict: 'meal_name' })

  if (error) {
    console.error('Error seeding:', error)
    process.exit(1)
  }

  console.log('✓ Seed complete!')
}

seed()
