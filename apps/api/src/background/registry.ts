import {AsaasBillingReconciliationWorker} from '../billing/reconciliation';
import {asaasSandboxEnabled} from '../billing/asaas-controller';
import {SocialPublicationWorker,socialPublicationConfigured} from '../social/publication';
import {RegionalResearchWorker,regionalResearchConfigured} from '../onboarding/regional-research';
import {CompetitorResearchWorker,InstagramMonitor,competitorResearchConfigured,instagramWatchConfigured} from '../onboarding/instagram';
import {AdPreparationWorker,AdExecutionWorker,adsExecutionConfigured} from '../campaigns/ad-execution';
import {VisualJobs,visualJobsConfigured} from '../ai/visual-jobs';
import {LaunchPreparation,launchConfigured,sitePreparationConfigured} from '../onboarding/launch';
import {ContentPreparation,contentPreparationConfigured} from '../onboarding/content-preparation';
import {ImageDescriptions,imageDescriptionsConfigured} from '../onboarding/image-descriptions';
import {CampaignDelivery,campaignDeliveryConfigured} from '../campaigns/delivery';
import {InboxAutomation,automationConfigured} from '../inbox/automation';
import type {BackgroundHandler} from './runner';

/** The existing durable processors, with no second queue or retry policy. */
export const backgroundHandlers:BackgroundHandler[]=[
 {id:'billing-reconciliation',processor:AsaasBillingReconciliationWorker,configured:()=>asaasSandboxEnabled()&&process.env.ASAAS_RECONCILIATION_ENABLED!=='false'},
 {id:'social-publication',processor:SocialPublicationWorker,configured:socialPublicationConfigured},
 {id:'regional-research',processor:RegionalResearchWorker,configured:regionalResearchConfigured},
 {id:'competitor-research',processor:CompetitorResearchWorker,configured:competitorResearchConfigured},
 {id:'ad-preparation',processor:AdPreparationWorker,configured:adsExecutionConfigured},
 {id:'ad-execution',processor:AdExecutionWorker,configured:adsExecutionConfigured},
 {id:'visual-jobs',processor:VisualJobs,configured:visualJobsConfigured},
 {id:'instagram-monitor',processor:InstagramMonitor,configured:instagramWatchConfigured},
 {id:'launch-and-site-preparation',processor:LaunchPreparation,configured:()=>launchConfigured()||sitePreparationConfigured()},
 {id:'content-preparation-and-production',processor:ContentPreparation,configured:contentPreparationConfigured},
 {id:'image-descriptions',processor:ImageDescriptions,configured:imageDescriptionsConfigured},
 // API routes gate activation on these processors' local lastPoll. Keep that contract
 // until a separately verified cross-process heartbeat is available.
 {id:'campaign-delivery',processor:CampaignDelivery,configured:campaignDeliveryConfigured,apiOnly:true},
 {id:'inbox-automation',processor:InboxAutomation,configured:automationConfigured,apiOnly:true},
];
