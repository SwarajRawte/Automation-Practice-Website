import type { Request } from 'express';
export type Role='ADMIN'|'USER'|'VIEWER';
export interface Claims {id:number;email:string;role:Role;name:string}
export interface AuthRequest extends Request {user?:Claims}
