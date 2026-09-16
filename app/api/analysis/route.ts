import {NextResponse} from 'next/server';
import {argoApi} from '@/lib/argo-api';
export async function GET(request:Request){
 const id=new URL(request.url).searchParams.get('float_id');
 if(!id||!/^\d{7}$/.test(id))return NextResponse.json({error:'Invalid float ID'},{status:400});
 try{const r=await fetch(argoApi(`/analysis?float_id=${id}`),{cache:'no-store',signal:AbortSignal.timeout(15000)});return NextResponse.json(await r.json(),{status:r.status})}catch{return NextResponse.json({error:'Analysis service unavailable'},{status:503})}
}
