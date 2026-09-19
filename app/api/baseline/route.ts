import {NextResponse} from 'next/server';
export const dynamic='force-dynamic';
async function proxy(request:Request){const id=new URL(request.url).searchParams.get('profile_id');if(!id)return NextResponse.json({error:'Choose an ARGO profile'},{status:400});try{const r=await fetch(`${process.env.ARGO_API_URL||'http://127.0.0.1:8000'}/baseline?profile_id=${encodeURIComponent(id)}`,{method:request.method,cache:'no-store',signal:AbortSignal.timeout(20000)});return NextResponse.json(await r.json(),{status:r.status})}catch{return NextResponse.json({error:'NOAA baseline service unavailable. Start the Python backend, then retry.'},{status:503})}}
export const GET=proxy;export const POST=proxy;
