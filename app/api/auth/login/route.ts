import type { NextRequest } from 'next/server';
import { authPost } from '@/lib/auth-routes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = (req: NextRequest) => authPost(req, 'login');
