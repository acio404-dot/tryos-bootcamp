import type { NextRequest } from 'next/server';
import { authGet } from '@/lib/auth-routes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = (req: NextRequest) => authGet(req, 'logout');
