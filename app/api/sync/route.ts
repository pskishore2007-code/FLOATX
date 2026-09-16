import {NextResponse} from 'next/server';
import {argoApi} from '@/lib/argo-api';
export const dynamic='force-dynamic';
const url=()=>argoApi('/sync');
export async function GET(){try{const r=await fetch(url(),{cache:'no-store',signal:AbortSignal.timeout(25000)});return NextResponse.json(await r.json(),{status:r.status})}catch{return NextResponse.json({status:'error',message:'Python data service unavailable.'},{status:503})}}
export async function POST(request:Request){const origin=request.headers.get('origin');if(origin&&new URL(origin).host!==request.headers.get('host'))return NextResponse.json({message:'Origin rejected'},{status:403});try{const r=await fetch(url(),{method:'POST',signal:AbortSignal.timeout(25000)});return NextResponse.json(await r.json(),{status:r.status})}catch{return NextResponse.json({status:'error',message:'Python data service unavailable.'},{status:503})}}
