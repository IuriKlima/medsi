import {z} from 'zod';
export const regionalPointSchema=z.object({lat:z.number().finite().min(-34).max(6),lng:z.number().finite().min(-74).max(-28)}).strict();
export const regionalRadiusSchema=z.union([z.literal(1000),z.literal(3000),z.literal(5000),z.literal(10000)]);
export const regionalMapRequestSchema=z.object({center:regionalPointSchema,radiusM:regionalRadiusSchema}).strict();
export type RegionalPoint=z.infer<typeof regionalPointSchema>;
export type RegionalMapRequest=z.infer<typeof regionalMapRequestSchema>;
/** OpenStreetMap element (node/123) or Google Places resource (google/ChIJ...). */
export const regionalCompetitorIdPattern=/^(?:(node|way|relation)\/\d+|google\/[\w-]{5,200})$/;
/** Deterministic public link, so the server can verify it instead of trusting provider URLs. */
export function regionalCompetitorUrl(id:string){return id.startsWith('google/')?'https://www.google.com/maps/place/?q=place_id:'+id.slice(7):'https://www.openstreetmap.org/'+id;}
export const regionalCompetitorSchema=z.object({id:z.string().regex(regionalCompetitorIdPattern),name:z.string().min(1).max(200),address:z.string().max(500),lat:z.number().finite().min(-34).max(6),lng:z.number().finite().min(-74).max(-28),distanceM:z.number().finite().nonnegative().max(10000),category:z.string().max(200),sourceUrl:z.string().url().max(400),
  specialty:z.string().max(160).nullable().optional(),rating:z.number().finite().min(0).max(5).nullable().optional(),reviewCount:z.number().int().nonnegative().nullable().optional(),phone:z.string().max(40).nullable().optional(),website:z.string().url().max(500).nullable().optional(),
 evidence:z.array(z.object({kind:z.enum(['specialty','category','name']),value:z.string().min(1).max(500),sourceUrl:z.string().url().max(400)})).max(30).optional(),
 relevance:z.object({status:z.enum(['compatible','ambiguous','incompatible']),matchedServices:z.array(z.string().max(200)).max(30),reason:z.string().max(500),evidence:z.array(z.object({kind:z.enum(['specialty','category','name']),value:z.string().min(1).max(500),sourceUrl:z.string().url().max(400)})).max(30)}).optional(),
});
export type RegionalCompetitor=z.infer<typeof regionalCompetitorSchema>;
export const regionalMapSchema=z.object({
 state:z.enum(['available','unavailable','pending']),center:regionalPointSchema.nullable(),viewport:regionalPointSchema.nullable(),
 radiusM:regionalRadiusSchema,locationConfirmed:z.boolean(),selectionConfirmed:z.boolean(),
 /** customer: point confirmed on the map. address: located by the server from the confirmed address. */
 centerSource:z.enum(['customer','address']).optional(),
 provider:z.enum(['osm','google']).optional(),
 competitors:z.array(regionalCompetitorSchema).max(50),reviewCandidates:z.array(regionalCompetitorSchema).max(50).optional(),confirmedCandidateIds:z.array(z.string().regex(regionalCompetitorIdPattern)).max(20).optional(),
 selectedIds:z.array(z.string().regex(regionalCompetitorIdPattern)).max(20),message:z.string().max(2000),sourceUrl:z.enum(['https://www.openstreetmap.org/copyright','https://www.google.com/maps']),
});
export type RegionalMap=z.infer<typeof regionalMapSchema>;
export type RegionalProgress={source:'ibge'|'facebook'|'google'|'x'|'map';state:'running'|'completed'|'unavailable';updatedAt:string};
export function regionalDistance(a:RegionalPoint,b:RegionalPoint){const rad=Math.PI/180,dLat=(b.lat-a.lat)*rad,dLng=(b.lng-a.lng)*rad;const h=Math.sin(dLat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dLng/2)**2;return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));}
