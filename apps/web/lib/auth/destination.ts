export function safeAuthDestination(value:string|null){return value==='/auth/update-password'||Boolean(value&&/^\/workspace#invite=[a-f0-9]{64}$/.test(value)) ? value! : '/entrada';}
