export const config = {
  // vercel.jsonのcleanUrls:trueにより、/admin.htmlへのアクセスは
  // 自動で/admin(拡張子なし)にリダイレクトされる。
  // matcherが/admin.htmlのみだと、そのリダイレクト後のURLにマッチせず
  // Middleware自体が発動しなくなるため、両方を指定しておく。
  matcher: ['/admin.html', '/admin'],
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
