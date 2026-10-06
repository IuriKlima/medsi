import {firestoreBackend} from './config';

/** Empty Firestore queries consume the daily read quota too. Keep processing
 * responsive after work, but avoid scanning idle or unavailable queues constantly. */
export function queuePollDelay(hadJob:boolean,failed:boolean,normalDelay:number){
 if(!firestoreBackend())return normalDelay;
 return failed?300000:hadJob?normalDelay:60000;
}
