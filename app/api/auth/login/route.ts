import { NextResponse } from 'next/server';
import { createSessionToken, SESSION_COOKIE, verifyAdminCredentials } from '../../../auth';

export async function POST(request: Request) {
  let stage = 'request';
  try {
    const body = await request.json() as { username?: string; password?: string };
    const username = body.username?.trim() ?? '';
    const password = body.password ?? '';
    stage = 'credentials';
    if (!username || !password || !(await verifyAdminCredentials(username, password))) {
      return NextResponse.json({ error: '账号或密码不正确' }, { status: 401 });
    }

    stage = 'session';
    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, await createSessionToken(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 8 * 60 * 60,
    });
    return response;
  } catch (error) {
    console.error(`auth_login_${stage}`, error instanceof Error ? error.name : 'UnknownError');
    return NextResponse.json({ error: '登录服务暂不可用，请稍后重试' }, { status: 500 });
  }
}
