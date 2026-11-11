import { z } from 'zod';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
export function phone(value) { if (!value) return ''; const p = parsePhoneNumberFromString(value, 'SE'); if (!p?.isValid()) throw new Error('Ange ett giltigt telefonnummer, exempelvis 070 123 45 67.'); return p.number; }
export const studentSchema = z.object({name:z.string().trim().min(2).max(120),email:z.union([z.email(),z.literal('')]),phone:z.string().max(40)});
export const feedbackSchema = z.object({studentId:z.string().uuid(),notes:z.string().trim().min(1).max(10000),text:z.string().trim().min(1).max(11000),channel:z.enum(['sms','email']),subject:z.string().trim().min(1).max(200),source:z.enum(['local','ai','unknown']).default('unknown')});
export function smsParts(text) { const basic = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà"; const ext='^{}\\[~]|€\f'; let count=0; for(const c of text){if(basic.includes(c))count++;else if(ext.includes(c))count+=2;else return Math.max(1,Math.ceil(text.length/(text.length>70?67:70)));} return Math.max(1,Math.ceil(count/(count>160?153:160))); }
