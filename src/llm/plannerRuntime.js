import { getPlanner } from '@/config/planner.js'
import * as layaBrowser from '@/llm/layaBrowserClient.js'

export function getPlannerRuntime() {
  return getPlanner() === 'laya' ? layaBrowser : null
}

export function usesLayaPlanner() {
  return getPlanner() === 'laya'
}
