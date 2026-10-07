import {z} from 'zod';

export const visualDescriptionSchema=z.object({
 description:z.string().min(10).max(2200),category:z.enum(['logo','space','equipment','activity','people','design_reference','other']),
 orientation:z.enum(['landscape','portrait','square']),colors:z.array(z.string().max(40)).max(6),
 visibleText:z.string().max(1000),recommendedUse:z.string().max(1200),alt:z.string().max(220),
}).strict();

export const describableImageTypes=['image/jpeg','image/png','image/webp'];
export function imageDescriptionDefaults(mime:string){return {visual_description:null,description_status:describableImageTypes.includes(mime)?'pending':'unsupported',description_attempts:0,description_token:null,description_updated_at:null,description_model:null};}
