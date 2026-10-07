import {afterEach,describe,expect,it,vi} from 'vitest';
import {testCheckoutEnabled} from '../apps/api/src/billing/controller';
import {asaasSandboxEnabled,configuredAsaasService} from '../apps/api/src/billing/asaas-controller';
describe('Asaas API configuration gates',()=>{
 afterEach(()=>vi.unstubAllEnvs());
 it('requires explicit Firestore sandbox checkout configuration',()=>{vi.stubEnv('DATABASE_PROVIDER','firestore');vi.stubEnv('CHECKOUT_MODE','test');vi.stubEnv('ASAAS_ENVIRONMENT','sandbox');vi.stubEnv('ASAAS_API_KEY','fixture-key');vi.stubEnv('NODE_ENV','test');expect(asaasSandboxEnabled()).toBe(false);vi.stubEnv('CHECKOUT_MODE','asaas_sandbox');expect(asaasSandboxEnabled()).toBe(true);});
 it('disables browser simulated confirmation in production',()=>{vi.stubEnv('CHECKOUT_MODE','test');vi.stubEnv('NODE_ENV','production');expect(testCheckoutEnabled()).toBe(false);});
 it('refuses production environments and real money configuration',()=>{vi.stubEnv('DATABASE_PROVIDER','firestore');vi.stubEnv('CHECKOUT_MODE','asaas_sandbox');vi.stubEnv('ASAAS_ENVIRONMENT','production');vi.stubEnv('ASAAS_API_KEY','fixture-key');vi.stubEnv('NODE_ENV','test');expect(()=>configuredAsaasService()).toThrow();vi.stubEnv('ASAAS_ENVIRONMENT','sandbox');vi.stubEnv('NODE_ENV','production');expect(()=>configuredAsaasService()).toThrow();});
});
