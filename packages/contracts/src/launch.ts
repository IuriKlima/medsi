import {z} from 'zod';

const suggestion=z.object({title:z.string().min(1).max(120),objective:z.string().max(600),audience:z.string().max(600),steps:z.array(z.string().max(600)).min(1).max(6),message:z.string().max(1500),requirements:z.array(z.string().max(300)).max(8),successMetric:z.string().max(300)}).strict();
export const launchRecommendationsSchema=z.object({summary:z.string().max(1500),whatsapp:z.array(suggestion).min(1).max(3),messages:z.array(suggestion).min(1).max(3),traffic:z.array(suggestion).min(1).max(3),unknowns:z.array(z.string().max(300)).max(20)}).strict();
export type LaunchRecommendations=z.infer<typeof launchRecommendationsSchema>;
export type LaunchJob={id:string;kind:'site'|'recommendations';status:'pending'|'running'|'completed'|'failed'|'stale';error:string|null;updated_at:string;output:LaunchRecommendations|null};
export type LaunchSnapshot={production?:{status:string;missingTexts:number;missingImages:number;error:string|null};siteGeneration?:{status:string;error:string|null}|null;profileVersion:number;confirmed:boolean;approved:boolean;available:boolean;contentAvailable:boolean;siteAvailable?:boolean;proposalOnly?:boolean;jobs:LaunchJob[];content:{status:string;stage:string;error:string|null}|null;canEdit:boolean};
