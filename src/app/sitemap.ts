import type {MetadataRoute} from 'next';
import {db} from '@/server/db';
export default async function sitemap():Promise<MetadataRoute.Sitemap>{if(process.env.APP_MODE!=='production')return [];const base=process.env.BETTER_AUTH_URL!;const content=await db.publicContent.findMany({where:{publishAt:{lte:new Date()}},select:{slug:true,locale:true,publicationDate:true,archived:true,expiresAt:true}});return content.map(p=>({url:`${base}/${p.locale}/${p.archived||(p.expiresAt&&p.expiresAt<=new Date())?'archive':'stories'}?slug=${encodeURIComponent(p.slug)}`,lastModified:p.publicationDate}));}
