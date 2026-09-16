import { NextResponse } from 'next/server';
import { emptyData } from '@/lib/types';
import { argoApi } from '@/lib/argo-api';
export const dynamic = 'force-dynamic';
export async function GET(){
  try {
    const target = argoApi('/profiles');
    const response = await fetch(target, {cache:'no-store',signal:AbortSignal.timeout(25000)});
    if(!response.ok) throw new Error(`Data service responded with ${response.status}`);
    return NextResponse.json(await response.json());
  } catch (err: any) { 
    return NextResponse.json({...emptyData,status:'error',message:'Waiting for ARGO data connection. Python data service is unreachable.', debug: String(err?.message || err)}); 
  }
}

