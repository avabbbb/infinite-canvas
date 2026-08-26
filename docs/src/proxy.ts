import { i18n } from '@/lib/i18n';
import { createI18nMiddleware } from 'fumadocs-core/i18n/middleware';
import { type NextRequest, NextResponse } from 'next/server';

const handleI18n = createI18nMiddleware(i18n);

export default function proxy(request: NextRequest) {
  const pathLocale = request.nextUrl.pathname.split('/')[1];
  // Default English routes use next.config rewrites so hydration keeps the public pathname.
  return i18n.languages.includes(pathLocale) ? handleI18n(request) : NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
