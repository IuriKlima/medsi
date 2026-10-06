/** A brand change does not imply a registered domain. */
export function publicSiteOrigin():string|undefined {
 const value=process.env.PUBLIC_SITE_URL||process.env.WEB_ORIGIN;if(!value)return undefined;
 try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url.origin:undefined;}catch{return undefined;}
}
