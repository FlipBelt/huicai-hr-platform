import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: '人资管理系统 · 一体化人力资源平台',
  description: '组织、人才、业务与数据一体化的人力资源管理系统',
  openGraph: {
    title: '人资管理系统 · 一体化人力资源平台',
    description: '组织、人才、业务与数据一体化的人力资源管理系统',
    images: [{ url: 'https://huicai-hr-platform.fb-gpt-4108.chatgpt.site/og.png', width: 1735, height: 941, alt: '人资管理系统' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: '人资管理系统 · 一体化人力资源平台',
    description: '组织、人才、业务与数据一体化的人力资源管理系统',
    images: ['https://huicai-hr-platform.fb-gpt-4108.chatgpt.site/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
