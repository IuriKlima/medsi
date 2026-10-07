import {serviceFlowSchema,runServiceFlow} from './service-flow';
import {z} from 'zod';
export const inboxChannelSchema=z.enum(['whatsapp','instagram','facebook','tiktok']);
export type InboxChannel=z.infer<typeof inboxChannelSchema>;
export const inboxLabels:Record<InboxChannel,string>={whatsapp:'WhatsApp',instagram:'Instagram',facebook:'Facebook',tiktok:'TikTok'};
export const serviceSettingsSchema=z.object({channel:inboxChannelSchema,revision:z.number().int().nonnegative(),mode:z.enum(['human','ai','flow']),prompt:z.string().trim().max(8000),rules:z.array(z.object({match:z.string().trim().min(1).max(120),reply:z.string().trim().min(1).max(2000),handoff:z.boolean()}).strict()).max(12),fallback:z.string().trim().max(2000),flow:serviceFlowSchema.nullable().optional(),automatic:z.boolean().optional()}).strict();
export type ServiceSettings=z.infer<typeof serviceSettingsSchema>;
export const quickReplySchema=z.object({id:z.uuid(),shortcut:z.string().regex(/^[a-z0-9_-]{1,30}$/),title:z.string().trim().min(1).max(80),body:z.string().trim().min(1).max(3000),remove:z.boolean().default(false)}).strict();
export type QuickReply={id:string;shortcut:string;title:string;body:string};
export type InboxThread={id:string;channel:InboxChannel;name:string;preview:string;time:string|null;unread:number;group:boolean};
export type InboxMessage={id:string;body:string;fromMe:boolean;time:string|null;kind:string;status:string};
export type InboxConnection={channel:InboxChannel;connected:boolean;available:boolean;message:string};
export type InboxBootstrap={connections:InboxConnection[];quickReplies:QuickReply[];settings:ServiceSettings[];canWrite:boolean;canConfigure:boolean;model:string|null;aiReady?:boolean;automaticReady:boolean};
export function flowReply(settings:ServiceSettings,text:string){if(settings.flow)return runServiceFlow(settings.flow,text);const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();const rule=settings.rules.find(r=>normalize(text).includes(normalize(r.match)));return rule?{text:rule.reply,handoff:rule.handoff}:{text:settings.fallback||'Vou encaminhar sua mensagem para nossa equipe.',handoff:true};}
