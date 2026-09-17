import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Dashboard from './dashboard-client';
import { SESSION_COOKIE, verifySessionToken } from './auth';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (!token || !(await verifySessionToken(token))) redirect('/login');
  return <Dashboard />;
}
