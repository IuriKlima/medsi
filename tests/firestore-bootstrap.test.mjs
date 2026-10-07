import {describe,it,expect} from 'vitest';
import {bootstrapTarget,bootstrapWrites,bootstrapDocuments} from '../scripts/firestore-bootstrap-core.mjs';
const env={FIREBASE_PROJECT_ID:'demo-medsi-new',NEXT_PUBLIC_FIREBASE_PROJECT_ID:'demo-medsi-new',FIRESTORE_DATABASE_ID:'clinic-test'};
describe('Firestore bootstrap targets and non-destructive seed',()=>{
 it('uses the configured project and database, never the historical project',()=>{
  expect(bootstrapTarget(['--apply','--project=demo-medsi-new'],env)).toEqual({project:'demo-medsi-new',databaseId:'clinic-test',apply:true,plan:false});
 });
 it('requires an explicit matching project for writes and rejects mixed web/server projects',()=>{
  expect(()=>bootstrapTarget(['--apply'],env)).toThrow('Explicit project');
  expect(()=>bootstrapTarget(['--apply','--project=demo-old'],env)).toThrow('Explicit project');
  expect(()=>bootstrapTarget([],{...env,NEXT_PUBLIC_FIREBASE_PROJECT_ID:'demo-old'})).toThrow('same project');
  expect(()=>bootstrapTarget([],{})).toThrow('FIREBASE_PROJECT_ID');
 });
 it('validates path segments and forbids applying an offline plan',()=>{
  expect(()=>bootstrapTarget([],{...env,FIRESTORE_DATABASE_ID:'bad/path'})).toThrow('database');
  expect(()=>bootstrapTarget(['--apply','--plan','--project=demo-medsi-new'],env)).toThrow('plan');
 });
 it('creates only the namespace and existing catalogue, with create-only preconditions',()=>{
  const base='projects/demo-medsi-new/databases/clinic-test/documents';
  const writes=bootstrapWrites(base,[],bootstrapDocuments('2026-10-07T12:00:00Z'));
  expect(writes.map(w=>w.update.name)).toEqual([base+'/medsi/v1',base+'/medsi/v1/plan_catalog/askadia_monthly',base+'/medsi/v1/plan_catalog/askadia_semiannual']);
  expect(writes.every(w=>w.currentDocument.exists===false)).toBe(true);
  expect(writes[0].update.fields.productionReady).toEqual({booleanValue:false});
 });
 it('preserves existing plans and makes repeated initialization a no-op',()=>{
  const base='projects/demo-medsi-new/databases/clinic-test/documents',docs=bootstrapDocuments('2026-10-07T12:00:00Z');
  const existing=bootstrapWrites(base,[],docs).map(w=>w.update);
  existing[1].fields.price_cents={integerValue:'123456'};
  expect(bootstrapWrites(base,existing,docs)).toEqual([]);
  expect(existing[1].fields.price_cents.integerValue).toBe('123456');
  expect(bootstrapWrites(base,existing.slice(0,2),docs)).toHaveLength(1);
 });
 it('rejects an incompatible existing namespace before constructing writes',()=>{
  const base='projects/demo-medsi-new/databases/clinic-test/documents';
  expect(()=>bootstrapWrites(base,[{name:base+'/medsi/v1',fields:{application:{stringValue:'Other'}}}],bootstrapDocuments())).toThrow('namespace');
 });
});
