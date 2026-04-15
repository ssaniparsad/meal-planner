'use client'

import { useState } from 'react'
import MealCell from './MealCell'
import type { MealPlan, MealSlot } from '@/lib/supabase'
import { DAY_NAMES } from '@/lib/supabase'
import { format, addDays, parseISO } from 'date-fns'

interface IngredientGap {
  meal: string
  missingIngredients: string[]
}

interface WeekGridProps {
  weekStart: string
  meals: MealPlan[]
  ingredientGaps: IngredientGap[]
  onSaveMeal: (dayIndex: number, slot: MealSlot, name: string) => Promise<void>
  onDeleteMeal: (id: string) => Promise<void>
  onGenerateSuggestions: () => Promise<void>
  generating: boolean
}

const SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner']

export default function WeekGrid({
  weekStart,
  meals,
  ingredientGaps,
  onSaveMeal,
  onDeleteMeal,
  onGenerateSuggestions,
  generating,
}: WeekGridProps) {
  const gapMealNames = new Set(ingredientGaps.map(g => g.meal.toLowerCase()))

  function getMeal(day: number, slot: MealSlot): MealPlan | undefined {
    return meals.find(m => m.day_of_week === day && m.meal_slot === slot)
  }

  function isGap(meal?: MealPlan): boolean {
    if (!meal) return false
    return gapMealNames.has(meal.meal_name.toLowerCase())
  }

  return (
    <div className="space-y-4">
      {/* Week header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-700">
          Week of {format(parseISO(weekStart), 'dd MMM yyyy')}
        </h2>
        <button
          onClick={onGenerateSuggestions}
          disabled={generating}
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {generating ? (
            <>
              <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Generating...
            </>
          ) : (
            <>✨ AI Suggest Week</>
          )}
        </button>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 gap-3">
        {/* Day headers */}
        {DAY_NAMES.map((day, i) => (
          <div key={day} className="text-center">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
              {day.slice(0, 3)}
            </div>
            <div className="text-lg font-bold text-slate-800">
              {format(addDays(parseISO(weekStart), i), 'd')}
            </div>
          </div>
        ))}

        {/* Meal rows — one slot row at a time */}
        {SLOTS.map(slot => (
          <>
            {DAY_NAMES.map((_, dayIndex) => {
              const meal = getMeal(dayIndex, slot)
              return (
                <MealCell
                  key={`${dayIndex}-${slot}`}
                  dayIndex={dayIndex}
                  slot={slot}
                  meal={meal}
                  onSave={onSaveMeal}
                  onDelete={onDeleteMeal}
                  isGap={isGap(meal)}
                />
              )
            })}
          </>
        ))}
      </div>

      {/* Gap summary */}
      {ingredientGaps.length > 0 && (
        <div className="mt-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-sm font-semibold text-red-700 mb-2">⚠️ Missing from shopping list:</p>
          <ul className="space-y-1">
            {ingredientGaps.map(gap => (
              <li key={gap.meal} className="text-sm text-red-600">
                <span className="font-medium">{gap.meal}:</span>{' '}
                {gap.missingIngredients.join(', ')}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
