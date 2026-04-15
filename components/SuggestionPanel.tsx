'use client'

import type { MealPlan } from '@/lib/supabase'
import { DAY_NAMES } from '@/lib/supabase'

interface SuggestionPanelProps {
  suggestedMeals: MealPlan[]
  onApprove: (id: string) => Promise<void>
  onApproveAll: () => Promise<void>
  onDismiss: (id: string) => Promise<void>
}

export default function SuggestionPanel({
  suggestedMeals,
  onApprove,
  onApproveAll,
  onDismiss,
}: SuggestionPanelProps) {
  if (suggestedMeals.length === 0) return null

  const unapproved = suggestedMeals.filter(m => !m.approved)
  if (unapproved.length === 0) return null

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">✨</span>
          <div>
            <h3 className="text-sm font-semibold text-amber-800">AI Suggestions Ready</h3>
            <p className="text-xs text-amber-600">{unapproved.length} meals suggested for next week</p>
          </div>
        </div>
        <button
          onClick={onApproveAll}
          className="px-3 py-1.5 rounded-full bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium transition-colors"
        >
          Approve all
        </button>
      </div>

      <ul className="space-y-1.5">
        {unapproved.map(meal => (
          <li
            key={meal.id}
            className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-amber-100"
          >
            <div className="flex-1 min-w-0">
              <span className="text-xs text-amber-600 font-medium">
                {DAY_NAMES[meal.day_of_week]} · {meal.meal_slot}
              </span>
              <p className="text-sm text-slate-700 truncate">{meal.meal_name}</p>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={() => onApprove(meal.id)}
                className="px-2 py-1 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-medium transition-colors"
              >
                ✓
              </button>
              <button
                onClick={() => onDismiss(meal.id)}
                className="px-2 py-1 rounded-md bg-slate-50 hover:bg-red-50 text-slate-400 hover:text-red-500 text-xs font-medium transition-colors"
              >
                ✕
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
