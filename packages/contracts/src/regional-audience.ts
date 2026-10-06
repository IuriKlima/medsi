import type {Demographics,SourceState} from './market';
export type PopulationGroup={label:string;count:number};
export type AudienceEstimate={label:string;lower:number|null;upper:number|null};
export type RegionalAudience={
 city:string;uf:string;collectedAt:string;
 specialties?:string[];topics?:import('./regional-topics').RegionalTopics;map?:import('./regional-map').RegionalMap;
 ibge:{state:SourceState;data:Demographics|null;sex:PopulationGroup[];ages:PopulationGroup[];sourceUrl:string;message:string};
 facebook?:{state:SourceState;estimates:AudienceEstimate[];sourceUrl:string;message:string;cityKey:string|null};
 trends:{state:SourceState;query:string;geo:string;region:string;period:string;rows:{term:string;interest:number}[];sourceUrl:string;message:string};
};
export type RegionalReview={id?:string;status:'pending'|'running'|'ready'|'failed'|'stale';revision:number;profileVersion?:number;data:RegionalAudience|null;error:string|null;progress?:import('./regional-map').RegionalProgress[]};
