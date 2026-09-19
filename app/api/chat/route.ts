import { NextResponse } from 'next/server';
export async function POST(request:Request){
  let body: {query?:unknown;mode?:unknown};
  try {body=await request.json();}catch{return NextResponse.json({explanation:'Invalid JSON request.'},{status:400});}
  if(!body||typeof body.query!=='string'||!body.query.trim()||body.query.length>2000) return NextResponse.json({explanation:'Enter a query of 1–2,000 characters.'},{status:400});
  if(body.mode!==undefined&&body.mode!=='exact'&&body.mode!=='semantic'&&body.mode!=='answer')return NextResponse.json({explanation:'Invalid search mode.'},{status:400});
  try {const response=await fetch(`${process.env.ARGO_API_URL||'http://127.0.0.1:8000'}/query`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:body.query,mode:body.mode||'exact'}),signal:AbortSignal.timeout(35000)});
    return NextResponse.json(await response.json(),{status:response.status});
  }catch{return NextResponse.json({status:'unavailable',explanation:'Waiting for ARGO data connection. No scientific answer was generated.'},{status:503});}
}
