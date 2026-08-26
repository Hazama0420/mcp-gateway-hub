// Di middleware.ts, ubah matcher agar TIDAK menyentuh /api sama sekali untuk sementara:
export const config = {
  matcher: [
    // Kecualikan _next, favicon, DAN SELURUH RUTE /api/ agar benar-benar bersih
    '/((?!_next/static|_next/image|favicon.ico|api/).*)',
  ],
};