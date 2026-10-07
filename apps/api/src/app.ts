import {databaseConfigured,firebaseBackend} from './platform/config';
import {BackgroundRunner} from './background/runner';
import {RegionalResearchController,regionalResearchReadiness} from './onboarding/regional-research';
import {MedicalIntakeController} from './onboarding/medical-intake-controller';
import {SupportController} from './support/controller';
import {WhatsAppCloudController,WhatsAppCloudWebhookController} from './inbox/whatsapp-cloud-controller';
import {SocialPublicationController} from './social/publication';
import {MarketingProfileController} from './onboarding/marketing-profile-controller';
import {PurchaseController} from './billing/controller';
import {AsaasBillingWebhookController} from './billing/asaas-controller';
import {AdExecutionController} from './campaigns/ad-execution';
import {VisualJobsController} from './ai/visual-jobs';
import {InstagramController} from './onboarding/instagram';
import {LaunchController} from './onboarding/launch';
import {OverviewController} from './dashboard/overview-controller';
import {CompanySiteController,PublicSiteController} from './sites/controller';
import {AdsController} from './campaigns/ads-controller';
import {MetaInboxController} from './inbox/meta-controller';
import {CustomerHistoryController} from './inbox/customer-controller';
import {ManagementController,ManagementIngestionController} from './campaigns/management';
import {CampaignsController} from './campaigns/controller';
import {InboxController} from './inbox/controller';
import { ChannelsController } from './onboarding/channels';
import { OnboardingController } from './onboarding/controller';
import { CalendarController } from './onboarding/calendar-controller';
import { DashboardModule } from './dashboard/controller';
import 'reflect-metadata';
import { OperationsController } from './operations/controller';
import { Controller, Get, Inject, Module } from '@nestjs/common';
import { providers } from '@askadia/integrations';
import { AUTH_CONFIG, AuthGuard, AuthService } from './identity/auth';
import { IdentityController } from './identity/controller';
import { IdentityService } from './identity/service';
@Controller()
export class HealthController {
  constructor(@Inject(BackgroundRunner) private readonly background:BackgroundRunner){}
  @Get('health') health(){return {status:'ok',service:'medsi-api',backgroundExecution:this.background.health(),regionalResearch:regionalResearchReadiness(),mode:process.env.NODE_ENV??'development',databaseProvider:process.env.DATABASE_PROVIDER==='firestore'?'firestore':firebaseBackend()?'firebase-sql-connect':'supabase',database:databaseConfigured()?'configured-not-homologated':'not-configured',authentication:(firebaseBackend()?Boolean(process.env.FIREBASE_PROJECT_ID):Boolean(process.env.SUPABASE_URL&&(process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY)))?'configured-not-homologated':'not-configured'};}
  @Get('integrations') integrations(){return providers.map(provider=>({...provider,status:'unconfigured'}));}
}
@Module({
  imports:[DashboardModule],
  controllers:[RegionalResearchController,MedicalIntakeController,SupportController,PurchaseController,AsaasBillingWebhookController,WhatsAppCloudController,WhatsAppCloudWebhookController,SocialPublicationController,MarketingProfileController,AdExecutionController,VisualJobsController,InstagramController,LaunchController,OverviewController,CompanySiteController,PublicSiteController,AdsController,MetaInboxController,CustomerHistoryController,ManagementController,ManagementIngestionController,CampaignsController,InboxController,ChannelsController,CalendarController,OnboardingController,HealthController,IdentityController,OperationsController],
  providers:[{provide:BackgroundRunner,useFactory:()=>new BackgroundRunner('api')},IdentityService,AuthService,AuthGuard,{provide:AUTH_CONFIG,useFactory:()=>({provider:process.env.DATABASE_PROVIDER,url:process.env.SUPABASE_URL,key:(process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY)})}],
})
export class AppModule {}
