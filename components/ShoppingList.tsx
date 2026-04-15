'use client'

import { useState } from 'react'
import type { ShoppingItem } from '@/lib/supabase'

interface ShoppingListProps {
  items: ShoppingItem[]
  onToggle: (id: string, checked: boolean) => Promise<void>
  onAdd: (item: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onGenerateFromMeals: () => Promise<void>
  generating: boolean
}

const CATEGORY_ICONS: Record<string, string> = {
  produce: '🥦',
  meat: '🥩',
  dairy: '🥛',
  pantry: '🫙',
  other: '🛒',
}

const CATEGORY_ORDER = ['produce', 'meat', 'dairy', 'pantry', 'other']

export default function ShoppingList({
  items,
  onToggle,
  onAdd,
  onDelete,
  onGenerateFromMeals,
  generating,
}: ShoppingListProps) {
  const [newItem, setNewItem] = useState('')

  const grouped = CATEGORY_ORDER.reduce<Record<string, ShoppingItem[]>>((acc, cat) => {
    const catItems = items.filter(i => (i.category ?? 'other') === cat)
    if (catItems.length > 0) acc[cat] = catItems
    return acc
  }, {})

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newItem.trim()) return
    await onAdd(newItem.trim())
    setNewItem('')
  }

  const checkedCount = items.filter(i => i.checked).length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-700">Shopping List</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {checkedCount}/{items.length} items
          </p>
        </div>
        <button
          onClick={onGenerateFromMeals}
          disabled={generating}
          className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition-colors disabled:opacity-50"
        >
          {generating ? (
            <>
              <span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Generating...
            </>
          ) : (
            <>✨ Generate from meals</>
          )}
        </button>
      </div>

      {/* Add item form */}
      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          value={newItem}
          onChange={e => setNewItem(e.target.value)}
          placeholder="Add item..."
          className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-violet-400 placeholder:text-slate-400"
        />
        <button
          type="submit"
          className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium transition-colors"
        >
          Add
        </button>
      </form>

      {/* Grouped items */}
      {Object.entries(grouped).map(([category, catItems]) => (
        <div key={category} className="space-y-1">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
            <span>{CATEGORY_ICONS[category]}</span>
            {category}
          </h3>
          <ul className="space-y-1">
            {catItems.map(item => (
              <li
                key={item.id}
                className="group flex items-center gap-2.5 px-3 py-2 rounded-lg bg-white border border-slate-100 hover:border-slate-200 transition-all"
              >
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={e => onToggle(item.id, e.target.checked)}
                  className="w-4 h-4 rounded accent-violet-600 cursor-pointer flex-shrink-0"
                />
                <span className={`flex-1 text-sm ${item.checked ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                  {item.item}
                  {item.quantity && (
                    <span className="text-slate-400 ml-1 text-xs">× {item.quantity}</span>
                  )}
                </span>
                <button
                  onClick={() => onDelete(item.id)}
                  className="hidden group-hover:block text-slate-300 hover:text-red-400 transition-colors text-sm"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {items.length === 0 && (
        <div className="text-center py-8 text-slate-400 text-sm">
          <p>No items yet.</p>
          <p className="mt-1">Add items manually or generate from your meal plan.</p>
        </div>
      )}
    </div>
  )
}
