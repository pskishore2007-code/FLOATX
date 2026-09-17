import { NextResponse } from 'next/server';
import { emptyData } from '@/lib/types';
import { argoApi } from '@/lib/argo-api';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';
export async function GET(){
  try {
    const target = argoApi('/profiles');
    const response = await fetch(target, {cache:'no-store',signal:AbortSignal.timeout(4000)});
    if(response.ok) {
      const data = await response.json();
      if (Array.isArray(data.profiles) && data.profiles.length > 0) {
        return NextResponse.json(data);
      }
    }
  } catch {
    // Backend service not yet reachable, fallback to cached snapshot
  }

  // Fallback to locally stored snapshot if Python service is offline
  try {
    const candidates = [
      path.join(process.cwd(), 'data', 'profiles.json'),
      path.join(process.cwd(), 'backend', 'data', 'profiles.json'),
      path.join(process.cwd(), '..', 'backend', 'data', 'profiles.json'),
    ];
    for (const file of candidates) {
      if (fs.existsSync(/*turbopackIgnore: true*/ file)) {
        const raw = fs.readFileSync(/*turbopackIgnore: true*/ file, 'utf-8');
        const data = JSON.parse(raw);
        if (data && Array.isArray(data.profiles) && data.profiles.length > 0) {
          return NextResponse.json(data);
        }
      }
    }
  } catch (err) {
    console.error('Snapshot fallback error:', err);
  }

  return NextResponse.json({...emptyData,status:'error',message:'Waiting for ARGO data connection. Python data service is unreachable.'}); 
}

