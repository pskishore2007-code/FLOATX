import { NextResponse } from 'next/server';
import { emptyData } from '@/lib/types';
import { argoApi } from '@/lib/argo-api';
export const dynamic = 'force-dynamic';
export async function GET(){
  try {const response = await fetch(argoApi('/profiles'), {cache:'no-store',signal:AbortSignal.timeout(5000)});
    if(!response.ok) throw new Error('Data service unavailable');
    return NextResponse.json(await response.json());
  } catch { return NextResponse.json({...emptyData,status:'error',message:'Waiting for ARGO data connection. Python data service is unreachable.'}); }
}
