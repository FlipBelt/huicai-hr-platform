import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '../../../auth';
import { recruitmentDashboard } from '../service';

export const dynamic='force-dynamic';

export async function GET(request:Request) {
  const token=(await cookies()).get(SESSION_COOKIE)?.value;
  if(!token||!await verifySessionToken(token)) return NextResponse.json({error:'登录已失效，请重新登录'},{status:401});
  try { const data=await recruitmentDashboard(new URL(request.url).searchParams); return NextResponse.json({summary:data.summary,todos:data.todos,warningDepartments:data.warningDepartments}); }
  catch { return NextResponse.json({error:'待办事项暂时不可用'},{status:503}); }
}
