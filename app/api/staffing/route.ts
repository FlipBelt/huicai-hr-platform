import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '../../auth';
import { staffingOverview, updateStaffingPlan } from '../recruitment/service';

export const dynamic='force-dynamic';

export async function GET() {
  const token=(await cookies()).get(SESSION_COOKIE)?.value;
  if(!token||!await verifySessionToken(token)) return NextResponse.json({error:'登录已失效，请重新登录'},{status:401});
  try { return NextResponse.json(await staffingOverview()); }
  catch { return NextResponse.json({error:'编制数据暂时不可用'},{status:503}); }
}

export async function PATCH(request:Request) {
  const token=(await cookies()).get(SESSION_COOKIE)?.value;
  if(!token||!await verifySessionToken(token)) return NextResponse.json({error:'登录已失效，请重新登录'},{status:401});
  try { return NextResponse.json(await updateStaffingPlan(await request.json())); }
  catch { return NextResponse.json({error:'核定编制保存失败，请选择 0–300 的整数'},{status:400}); }
}
