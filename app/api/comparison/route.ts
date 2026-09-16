import {NextResponse} from 'next/server';
import {argoApi} from '@/lib/argo-api';
export async function POST(request:Request){
 let body;try{body=await request.json()}catch{return NextResponse.json({error:'Invalid JSON'},{status:400})}
 try{const r=await fetch(argoApi('/comparison'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});return NextResponse.json(await r.json(),{status:r.status})}catch{return NextResponse.json({error:'Comparison service unavailable'},{status:503})}
}
