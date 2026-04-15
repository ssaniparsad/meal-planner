'use client'

import { useState, useEffect, useCallback } from 'react'
import WeekGrid from '@/components/WeekGrid'
import ShoppingList from '@/components/ShoppingList'
import SuggestionPanel from '@/components/SuggestionPanel'
import type { MealPlan, ShoppingItem, MealSlot } from '@/lib/supabase'
import { getWeekStart } from '@/lib/supabase'
import { format, addWeeks, subWeeks, parseISO } from 'date-fns'

export default function DashboardPage() {
  const [weekStart, setWeekStart] = useState(() => getWeekStart())
  const [meals, setMeals] = useState<MealPlan[]>([])
  const [shoppingItems, setShoppingItems] = useState<ShoppingItem[]>([])
  const [ingredientGaps, setIngredientGaps] = useState<{ meal: string; missingIngredients: string[] }[]>([])
  const [loadingMeals, setLoadingMeals] = useState(true)
  const [generatingSuggestions, setGeneratingSuggestions] = useState(false)
  const [generatingShopping, setGeneratingShopping] = useState(false)

  const suggestedMeals = meals.filter(m => m.is_suggested && !m.approved)

  // Fetch meals for current week
  const fetchMeals = useCallback(async (week: string) => {
    setLoadingMeals(true)
    const res = await fetch(`/api/meals?week=${week}`)
    const data = await res.json()
    setMeals(data.meals ?? [])
    setLoadingMeals(false)
  }, [])

  // Fetch shopping list for current week
  const fetchShopping = useCallback(async (week: string) => {
    const res = await fetch(`/api/shopping?week=${week}`)
    const data = await res.json()
    setShoppingItems(data.items ?? [])
  }, [])

  // Fetch ingredient gaps
  const fetchGaps = useCallback(async (week: string) => {
    const res = await fetch(`/api/generate-shopping?week=${week}`)
    const data = await res.json()
    setIngredientGaps(data.gaps ?? [])
  }, [])

  useEffect(() => {
    fetchMeals(weekStart)
    fetchShopping(weekStart)
    fetchGaps(weekStart)
  }, [weekStart, fetchMeals, fetchShopping, fetchGaps])

  // Week navigation
  const goToPrevWeek = () => setWeekStart(w => format(subWeeks(parseISO(w), 1), 'yyyy-MM-dd'))
  const goToNextWeek = () => setWeekStart(w => format(addWeeks(parseISO(w), 1), 'yyyy-MM-dd'))
  const goToCurrentWeek = () => setWeekStart(getWeekStart())

  // Save a meal
  const handleSaveMeal = async (dayIndex: number, slot: MealSlot, name: string) => {
    if (!name) return
    const res = await fetch('/api/meals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ week_start: weekStart, day_of_week: dayIndex, meal_slot: slot, meal_name: name }),
    })
    const data = await res.json()
    if (data.meal) {
      setMeals(prev => {
        const filtered = prev.filter(m => !(m.day_of_week === dayIndex && m.meal_slot === slot))
        return [...filtered, data.meal]
      })
      // Refresh gaps after adding a meal
      fetchGaps(weekStart)
    }
  }

  // Delete a meal
  const handleDeleteMeal = async (id: string) => {
    await fetch(`/api/meals?id=${id}`, { method: 'DELETE' })
    setMeals(prev => prev.filter(m => m.id !== id))
    fetchGaps(weekStart)
  }

  // Generate AI suggestions
  const handleGenerateSuggestions = async () => {
    setGeneratingSuggestions(true)
    const res = await fetch('/api/suggest', { method: 'POST' })
    const data = await res.json()
    if (data.suggestions) {
      // Move to next week to see suggestions
      const nextWeek = format(addWeeks(parseISO(weekStart), 1), 'yyyy-MM-dd')
      setWeekStart(nextWeek)
    }
    setGeneratingSuggestions(false)
  }

  // Approve a suggestion
  const handleApproveSuggestion = async (id: string) => {
    await fetch('/api/meals', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, approved: true }),
    })
    setMeals(prev => prev.map(m => m.id === id ? { ...m, approved: true } : m))
  }

  // Approve all suggestions
  const handleApproveAll = async () => {
    await Promise.all(suggestedMeals.map(m => handleApproveSuggestion(m.id)))
  }

  // Dismiss a suggestion
  const handleDismissSuggestion = async (id: string) => {
    await fetch(`/api/meals?id=${id}`, { method: 'DELETE' })
    setMeals(prev => prev.filter(m => m.id !== id))
  }

  // Shopping list actions
  const handleToggleItem = async (id: string, checked: boolean) => {
    await fetch('/api/shopping', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, checked }),
    })
    setShoppingItems(prev => prev.map(i => i.id === id ? { ...i, checked } : i))
  }

  const handleAddItem = async (item: string) => {
    const res = await fetch('/api/shopping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ week_start: weekStart, item }),
    })
    const data = await res.json()
    if (data.item) setShoppingItems(prev => [...prev, data.item])
  }

  const handleDeleteItem = async (id: string) => {
    await fetch(`/api/shopping?id=${id}`, { method: 'DELETE' })
    setShoppingItems(prev => prev.filter(i => i.id !== id))
  }

  const handleGenerateShopping = async () => {
    setGeneratingShopping(true)
    const res = await fetch('/api/generate-shopping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ week_start: weekStart }),
    })
    const data = await res.json()
    if (data.items) {
      await fetchShopping(weekStart)
      if (data.gaps) setIngredientGaps(data.gaps)
    }
    setGeneratingShopping(false)
  }

  const isCurrentWeek = weekStart === getWeekStart()

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-violet-50/30">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-slate-100">
        <div className="max-w-screen-2xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🍽️</span>
            <div>
              <h1 className="text-lg font-bold text-slate-800">Meal Planner</h1>
              <p className="text-xs text-slate-400">Sheylyn & Nishka</p>
            </div>
          </div>

          {/* Week navigation */}
          <div className="flex items-center gap-2">
            <button
              onClick={goToPrevWeek}
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
            >
              ‹
            </button>
            <button
              onClick={goToCurrentWeek}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                isCurrentWeek
                  ? 'bg-violet-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {isCurrentWeek ? 'This Week' : format(parseISO(weekStart), 'dd MMM')}
            </button>
            <button
              onClick={goToNextWeek}
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
            >
              ›
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-screen-2xl mx-auto px-6 py-8 space-y-6">
        {/* AI Suggestions banner */}
        <SuggestionPanel
          suggestedMeals={suggestedMeals}
          onApprove={handleApproveSuggestion}
          onApproveAll={handleApproveAll}
          onDismiss={handleDismissSuggestion}
        />

        {/* Two-column layout */}
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-6">
          {/* Meal grid */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            {loadingMeals ? (
              <div className="flex items-center justify-center h-48 text-slate-400">
                <span className="inline-block w-6 h-6 border-2 border-slate-200 border-t-violet-500 rounded-full animate-spin mr-3" />
                Loading meals...
              </div>
            ) : (
              <WeekGrid
                weekStart={weekStart}
                meals={meals}
                ingredientGaps={ingredientGaps}
                onSaveMeal={handleSaveMeal}
                onDeleteMeal={handleDeleteMeal}
                onGenerateSuggestions={handleGenerateSuggestions}
                generating={generatingSuggestions}
              />
            )}
          </div>

          {/* Shopping list */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <ShoppingList
              items={shoppingItems}
              onToggle={handleToggleItem}
              onAdd={handleAddItem}
              onDelete={handleDeleteItem}
              onGenerateFromMeals={handleGenerateShopping}
              generating={generatingShopping}
            />
          </div>
        </div>
      </main>
    </div>
  )
}
