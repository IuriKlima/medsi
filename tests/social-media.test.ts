import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {describe,it,expect} from 'vitest';
import {convertSocialImage} from '../apps/api/src/social/media';
const sharp=createRequire(resolve('apps/api/package.json'))('sharp') as typeof import('sharp').default;
describe('private Instagram JPEG derivatives',()=>{
 it('converts alpha PNG to deterministic metadata-stripped JPEG bytes for approval',async()=>{const source=await sharp({create:{width:1200,height:1200,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).png().toBuffer();const first=await convertSocialImage(source),second=await convertSocialImage(source);expect(first.sha256).toBe(second.sha256);expect(first.bytes.equals(second.bytes)).toBe(true);const info=await sharp(first.bytes).metadata();expect(info.format).toBe('jpeg');expect(info.hasAlpha).toBe(false);expect(info.exif).toBeUndefined();expect(first.width).toBe(1200);});
 it('converts WebP and bounds output dimensions without inventing new imagery',async()=>{const source=await sharp({create:{width:2000,height:2000,channels:3,background:'#abcdef'}}).webp().toBuffer();const result=await convertSocialImage(source);expect(result).toMatchObject({width:1440,height:1440});expect((await sharp(result.bytes).metadata()).format).toBe('jpeg');});
 it('rejects malformed, tiny and unsupported Instagram proportions',async()=>{await expect(convertSocialImage(Buffer.from('not an image'))).rejects.toThrow();const small=await sharp({create:{width:100,height:100,channels:3,background:'#fff'}}).png().toBuffer(),tall=await sharp({create:{width:1000,height:2000,channels:3,background:'#fff'}}).png().toBuffer();await expect(convertSocialImage(small)).rejects.toThrow('320');await expect(convertSocialImage(tall)).rejects.toThrow('proporção');});
});
