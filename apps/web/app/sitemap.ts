import type {MetadataRoute} from 'next';
import {publicSiteOrigin} from '../lib/public-site';
export default function sitemap():MetadataRoute.Sitemap{const origin=publicSiteOrigin();return origin?['','/planos','/lp/marketing-medico','/lp/atendimento-medico','/sobre','/contato','/suporte'].map(path=>({url:origin+path,changeFrequency:'monthly',priority:path===''?1:path.startsWith('/lp/')?.8:.5})):[];}
