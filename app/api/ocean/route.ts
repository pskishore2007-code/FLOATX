import { NextResponse } from 'next/server';
import { emptyData } from '@/lib/types';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET() {
  // 1. Try live Python FastAPI service first (if running)
  try {
    const response = await fetch(`${process.env.ARGO_API_URL || 'http://127.0.0.1:8000'}/profiles`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
    if (response.ok) {
      return NextResponse.json(await response.json());
    }
  } catch {
    // Live Python server is not reachable, seamlessly fallback to local dataset snapshot
  }

  // 2. Direct standalone fallback from local dataset snapshot
  try {
    const filePath = path.join(process.cwd(), 'backend', 'data', 'profiles.json');
    if (fs.existsSync(filePath)) {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const data = JSON.parse(content);
      return NextResponse.json(data);
    }
  } catch (err) {
    console.error('Snapshot fallback error:', err);
  }

  return NextResponse.json({
    ...emptyData,
    status: 'error',
    message: 'Waiting for ARGO data connection. Python data service is unreachable.',
  });
}

