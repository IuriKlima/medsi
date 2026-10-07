import {BadRequestException,Body,Controller,Get,Param,Post,Req,UseGuards} from '@nestjs/common';
import {AuthGuard,type AuthRequest} from '../identity/auth';
import {result} from '../identity/service';
import {marketingFactsRequest} from '../platform/firestore/marketing-profile';
import {adsAccess} from '../campaigns/ads';
@Controller('onboarding/companies/:id/marketing-facts')
@UseGuards(AuthGuard)
export class MarketingProfileController{
 @Get() async read(@Req() r:AuthRequest,@Param('id') company:string){await adsAccess(r,company,'marketing.read');return result(await r.actor.client.rpc('company_onboarding_read',{p_company_id:company}));}
 @Post() async save(@Req() r:AuthRequest,@Param('id') company:string,@Body() body:unknown){const input=marketingFactsRequest.safeParse(body);if(!input.success)throw new BadRequestException('Confira os fatos de marketing.');await adsAccess(r,company,'marketing.write');return result(await r.actor.client.rpc('save_company_marketing_facts',{p_company_id:company,p_request_id:input.data.requestId,p_revision:input.data.revision,p_facts:input.data.facts}));}
}
