import {Injectable,type OnModuleDestroy} from '@nestjs/common';
import {closePostgres} from './postgres';
@Injectable()
export class DatabaseLifecycle implements OnModuleDestroy {
 async onModuleDestroy(){await closePostgres();}
}
