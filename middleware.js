export const config = {
  matcher: '/admin.html',
};

export default function middleware(request) {
  const authHeader = request.headers.get('authorization');

  const user = process.env.ADMIN_BASIC_USER;
  const pass = process.env.ADMIN_BASIC_PASS;

  if (authHeader) {
    const encoded = authHeader.split(' ')[1] || '';
    const decoded = atob(encoded);
    const [inputUser, inputPass] = decoded.split(':');
    if (inputUser === user && inputPass === pass) {
      return; // 認証OK、そのまま通す
    }
  }

  return new Response('認証が必要です', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Admin Area"',
    },
  });
}
