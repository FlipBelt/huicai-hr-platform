'use client';

import { FormEvent, useState } from 'react';

export default function LoginPage() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setLoading(true);
    const form = new FormData(event.currentTarget);
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: form.get('username'), password: form.get('password') }),
    });
    if (response.ok) {
      window.location.replace('/');
      return;
    }
    const result = await response.json().catch(() => ({ error: '登录失败，请重试' }));
    setError(result.error || '登录失败，请重试');
    setLoading(false);
  }

  return <main className="login-shell">
    <section className="login-intro">
      <div className="login-brand"><span className="brand-mark">HR</span><strong>人资管理系统</strong></div>
      <div><p className="login-kicker">一体化人力资源管理平台</p><h1>让组织、人才与业务<br/>高效协同</h1><p>统一管理组织架构、招聘、绩效、薪酬、假勤与数据报表。</p></div>
      <div className="login-footnote">企业数据安全保护 · 管理员专属访问</div>
    </section>
    <section className="login-panel">
      <form className="login-card" onSubmit={submit}>
        <div className="mobile-login-brand"><span className="brand-mark">HR</span><strong>人资管理系统</strong></div>
        <p className="eyebrow">WELCOME BACK</p>
        <h2>登录管理后台</h2>
        <p className="login-help">请输入管理员账号和密码</p>
        <label>管理员账号<input name="username" autoComplete="username" required placeholder="请输入管理员账号" /></label>
        <label>登录密码<input name="password" type="password" autoComplete="current-password" required placeholder="请输入登录密码" /></label>
        {error && <p className="login-error" role="alert">{error}</p>}
        <button className="login-submit" disabled={loading}>{loading ? '正在登录…' : '登录系统'}</button>
        <p className="login-tip">连续 8 小时无操作后需要重新登录</p>
      </form>
    </section>
  </main>;
}
