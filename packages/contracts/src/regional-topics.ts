import type {SourceState} from './market';

export type TopicRow={term:string;specialty:string;metricLabel:string;metricValue:number|null;sourceUrl:string};
export type TopicSource={state:SourceState;query:string;region:string;period:string;message:string;sourceUrl:string;rows:TopicRow[]};
export type RegionalTopics={google:TopicSource;facebook?:TopicSource;x?:TopicSource};
