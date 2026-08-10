import type {NextFunction,Response} from 'express'; import jwt from 'jsonwebtoken'; import type {AuthRequest,Claims,Role} from './types.js';
const secret=process.env.JWT_SECRET||'local-development-secret-change-me';
export const sign=(user:Claims,expires='2h')=>jwt.sign(user,secret,{expiresIn:expires as jwt.SignOptions['expiresIn']});
export function auth(req:AuthRequest,res:Response,next:NextFunction){const token=req.headers.authorization?.replace('Bearer ','')||req.cookies?.token; if(!token)return res.status(401).json({error:'Authentication required'});try{req.user=jwt.verify(token,secret) as Claims;next()}catch{return res.status(401).json({error:'Session expired'})}}
export const roles=(...allowed:Role[])=>(req:AuthRequest,res:Response,next:NextFunction)=>req.user&&allowed.includes(req.user.role)?next():res.status(403).json({error:'Insufficient role'});
