import type {MetadataRoute} from 'next';
export default function robots():MetadataRoute.Robots{return {rules:{userAgent:'*',disallow:process.env.APP_MODE==='production'?['/api/private/','/en/dashboard','/hi/dashboard','/en/workspace','/hi/workspace']:['/']}};}
