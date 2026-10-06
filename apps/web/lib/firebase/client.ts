'use client';
import {getApps,initializeApp} from 'firebase/app';
import {getAuth} from 'firebase/auth';
import {firebaseWebConfig,firebaseWebConfigured} from './config';
export function firebaseApp(){if(!firebaseWebConfigured())throw new Error('A conexão Firebase ainda não foi configurada.');return getApps().find(a=>a.name==='medsi')??initializeApp(firebaseWebConfig(),'medsi');}
export const clientFirebaseAuth=()=>getAuth(firebaseApp());
// Analytics stays opt-in and is never initialized during SSR or on private clinical pages.
export async function enableFirebaseAnalytics(consent:boolean){if(!consent||typeof window==='undefined'||!/^\/(?:sobre|planos|contato)?$/.test(window.location.pathname))return null;const {getAnalytics,isSupported}=await import('firebase/analytics');return await isSupported()?getAnalytics(firebaseApp()):null;}
