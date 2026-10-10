import {NextResponse, type NextRequest} from 'next/server';

// Optional access gate. The studio has no user accounts, so every visitor shares the same
// projects. Set STUDIO_PASSWORD to require HTTP Basic auth on every page and API route
// (username is ignored). Without it the deployment is open: do not expose GPU credentials publicly.
export function middleware(req: NextRequest) {
  const password = process.env.STUDIO_PASSWORD;
  if (!password) return NextResponse.next();
  const header = req.headers.get('authorization') || '';
  if (header.startsWith('Basic ')) {
    try {
      const decoded = atob(header.slice(6));
      const given = decoded.slice(decoded.indexOf(':') + 1);
      if (given.length === password.length && timingSafe(given, password)) return NextResponse.next();
    } catch {}
  }
  return new NextResponse('Authentication required', {status: 401, headers: {'WWW-Authenticate': 'Basic realm="AI Video Studio", charset="UTF-8"'}});
}

function timingSafe(a: string, b: string) {
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const config = {matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']};
