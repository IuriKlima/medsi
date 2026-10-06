/** Application aliases are exact hostnames, never a wildcard shared by other tenants. */
export function isApplicationHost(host:string,env:NodeJS.ProcessEnv=process.env):boolean {
 const normalized=host.toLowerCase().replace(/\.$/,'');
 const hosts=new Set(['localhost','127.0.0.1']);
 try {
  const origin=new URL(env.WEB_ORIGIN||'http://127.0.0.1:3000');
  if(['http:','https:'].includes(origin.protocol)&&!origin.username&&!origin.password){
   const canonical=origin.hostname.toLowerCase().replace(/\.$/,'');
   hosts.add(canonical);hosts.add('www.'+canonical);
  }
 } catch { /* Invalid configuration must not turn every customer host into the app. */ }
 for(const alias of (env.APP_HOSTNAMES||'').split(',')){
  const value=alias.trim().toLowerCase().replace(/\.$/,'');
  if(value.length<=253&&value.split('.').every(label=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)))hosts.add(value);
 }
 return hosts.has(normalized);
}
