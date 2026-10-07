import {describe,it,expect} from 'vitest';
import {proposeCurrentMonthDates,planningPreferencesSchema} from '../apps/api/src/onboarding/planning';
import {respectsWeeklyLimit} from '../apps/api/src/onboarding/seasonal';
describe('current month configurable planning',()=>{
 it('uses remaining current month days without forcing seven days or spilling to next month',()=>{
  const dates=proposeCurrentMonthDates('2026-10','2026-10-07',8,2);expect(dates).toHaveLength(8);expect(dates.every(d=>d>='2026-10-07'&&d<='2026-10-31')).toBe(true);expect(respectsWeeklyLimit(dates)).toBe(true);
 });
 it('supports quantity and frequency other than legacy eight and two',()=>{
  const dates=proposeCurrentMonthDates('2026-10','2026-10-07',12,4);expect(dates).toHaveLength(12);expect(new Set(dates).size).toBe(12);expect(respectsWeeklyLimit(dates,[],4)).toBe(true);
 });
 it('rejects impossible quantity instead of silently changing quantity or month',()=>{
  expect(()=>proposeCurrentMonthDates('2026-10','2026-10-30',8,2)).toThrow('Quantidade não cabe');expect(planningPreferencesSchema.safeParse({postsPerMonth:0,maxPostsPerWeek:2}).success).toBe(false);
 });
});
