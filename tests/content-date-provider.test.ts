import {randomUUID} from 'node:crypto';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const fixture=vi.hoisted(()=>({parse:vi.fn()}));
import {planCalendarDates} from '../apps/api/src/onboarding/content';
const generate=(input:Parameters<typeof planCalendarDates>[0])=>planCalendarDates(input,{responses:{parse:fixture.parse}} as never);
beforeEach(()=>{vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-07T12:00:00Z'));vi.stubEnv('OPENAI_API_KEY','fixture-never-sent');vi.stubEnv('OPENAI_MODEL_COPY','fixture-copy-model');vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('Network forbidden in fixtures')));});
afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs();vi.unstubAllGlobals();vi.clearAllMocks();});
describe('calendar date provider adapter — isolated responses',()=>{
 it('uses configured weekly frequency in prompt and validates the same constraint',async()=>{const ids=Array.from({length:3},()=>randomUUID()),dates=ids.map((id,i)=>({id,date:'2026-10-'+String(i+7).padStart(2,'0')}));fixture.parse.mockResolvedValue({output_parsed:{dates}});const input={month:'2026-10-01',items:ids.map(id=>({id,revision:1,idea:'Fixture'})),facts:{},planning:{postsPerMonth:12,maxPostsPerWeek:3}};expect(await generate(input)).toEqual(dates);expect(fixture.parse.mock.calls[0][0].input[1].content).toContain('No máximo 3 publicações');await expect(generate({...input,planning:{postsPerMonth:8,maxPostsPerWeek:2}})).rejects.toThrow('Invalid planning dates');});
 it('counts existing posts, rejects past dates and accepts current clinic day',async()=>{const id=randomUUID(),input={month:'2026-10-01',items:[{id,revision:1,idea:'Fixture'}],facts:{},planning:{postsPerMonth:8,maxPostsPerWeek:2}};fixture.parse.mockResolvedValue({output_parsed:{dates:[{id,date:'2026-10-07'}]}});expect(await generate(input)).toEqual([{id,date:'2026-10-07'}]);await expect(generate({...input,existingDates:['2026-10-08','2026-10-09']})).rejects.toThrow('Invalid planning dates');fixture.parse.mockResolvedValue({output_parsed:{dates:[{id,date:'2026-10-06'}]}});await expect(generate(input)).rejects.toThrow('Invalid planning dates');});
});
