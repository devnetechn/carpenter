import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: { signIn: "/admin/login" },
  session: { strategy: "jwt" },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const isLoginPage = request.nextUrl.pathname === "/admin/login";
      const isAdminRoute = request.nextUrl.pathname.startsWith("/admin");
      if (isAdminRoute && !isLoginPage) {
        return !!auth;
      }
      return true;
    },
  },
} satisfies NextAuthConfig;
