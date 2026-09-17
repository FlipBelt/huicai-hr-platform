import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '../../../auth';
import { recruitmentDashboard, updateRecruitmentRequest } from '../service';

export const dynamic='force-dynamic';

async function authorized() {
  const token=(await cookies()).get(SESSION_COOKIE)?.value;
  return Boolean(token&&await verifySessionToken(token));
}

export async function GET(request:Request) {
  if(!await authorized()) return NextResponse.json({error:'登录已失效，请重新登录'},{status:401});
  try { return NextResponse.json(await recruitmentDashboard(new URL(request.url).searchParams)); }
  catch(error) { console.error('recruitment_dashboard_failed',error instanceof Error?error.message:'UnknownError'); return NextResponse.json({error:'招聘数据暂时不可用，请先同步组织与花名册数据'},{status:503}); }
}

export async function PATCH(request:Request) {
  if(!await authorized()) return NextResponse.json({error:'登录已失效，请重新登录'},{status:401});
  try { return NextResponse.json(await updateRecruitmentRequest(await request.json())); }
  catch { return NextResponse.json({error:'招聘需求更新失败'},{status:400}); }
}
