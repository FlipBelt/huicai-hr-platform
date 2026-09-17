import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Dashboard from '../../../dashboard-client';
import { SESSION_COOKIE, verifySessionToken } from '../../../auth';

export const dynamic='force-dynamic';

export default async function RecruitmentDashboardPage() {
  const token=(await cookies()).get(SESSION_COOKIE)?.value;
  if(!token||!await verifySessionToken(token)) redirect('/login');
  return <Dashboard initialActive={2} initialRecruitingSection="招聘需求"/>;
}
