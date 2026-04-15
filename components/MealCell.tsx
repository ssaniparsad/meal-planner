'use client'

import { useState, useRef, useEffect } from 'react'
import type { MealPlan, MealSlot } from '@/lib/supabase'

interface MealCellProps {
  dayIndex: number
  slot: MealSlot
  meal?: MealPlan
  onSave: (dayIndex: number, slot: MealSlot, name: string) => Promise<void>
  onDelete?: (id: string) => Promise<void>
  isGap?: boolean  // ingredient missing
}

const SLOT_ICONS: Record<MealSlot, string> = {
  breakfast: '🌅',
  lunch: '☀️',
  dinner: '🌙',
}

export default function MealCell({ dayIndex, slot, meal, onSave, onDelete, isGap }: MealCellProps) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(meal?.meal_name ?? '')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  useEffect(() => {
    setValue(meal?.meal_name ?? '')
  }, [meal?.meal_name])

  const handleSave = async () => {
    if (value.trim() === (meal?.meal_name ?? '')) {
      setEditing(false)
      return
    }
    setSaving(true)
    await onSave(dayIndex, slot, value.trim())
    setSaving(false)
    setEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave()
    if (e.key === 'Escape') {
      setValue(meal?.meal_name ?? '')
      setEditing(false)
    }
  }

  return (
    <div
      className={`group relative min-h-[52px] rounded-lg px-3 py-2 transition-all cursor-pointer
        ${meal?.is_suggested && !meal.approved
          ? 'bg-amber-50 border border-amber-200'
          : meal?.meal_name
          ? isGap
            ? 'bg-red-50 border border-red-200'
            : 'bg-white border border-slate-200 hover:border-slate-300'
          : 'bg-slate-50 border border-dashed border-slate-200 hover:border-slate-300'
        }`}
      onClick={() => !editing && setEditing(true)}
    >
      <div className="flex items-start gap-1.5">
        <span className="text-xs mt-0.5 opacity-60">{SLOT_ICONS[slot]}</span>
        {editing ? (
          <input
            ref={inputRef}
            value={value}
            onChange={e => setValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            placeholder={`Add ${slot}...`}
            className="flex-1 text-sm bg-transparent outline-none text-slate-800 placeholder:text-slate-400 min-w-0"
          />
        ) : (
          <span className={`flex-1 text-sm leading-snug ${meal?.meal_name ? 'text-slate-700' : 'text-slate-400'}`}>
            {meal?.meal_name || `Add ${slot}...`}
          </span>
        )}
        {saving && <span className="text-xs text-slate-400 animate-pulse">saving</span>}
      </div>

      {/* Suggested badge */}
      {meal?.is_suggested && !meal.approved && (
        <span className="absolute top-1 right-1 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">
          AI
        </span>
      )}

      {/* Ingredient gap warning */}
      {isGap && meal?.meal_name && (
        <div className="mt-1 flex items-center gap-1 text-[11px] text-red-500">
          <span>⚠️</span>
          <span>Missing ingredients</span>
        </div>
      )}

      {/* Delete button on hover */}
      {meal?.meal_name && !editing && onDelete && (
        <button
          onClick={e => { e.stopPropagation(); onDelete(meal.id) }}
          className="absolute top-1 right-1 hidden group-hover:flex items-center justify-center w-5 h-5 rounded-full bg-slate-100 hover:bg-red-100 text-slate-400 hover:text-red-500 transition-colors text-xs"
        >
          ×
        </button>
      )}
    </div>
  )
}
