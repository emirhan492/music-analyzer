import NextAuth, { AuthOptions } from "next-auth";
import SpotifyProvider from "next-auth/providers/spotify";

const scopes = [
  "user-read-email",
  "user-read-private",
  "playlist-read-private",
  "playlist-read-collaborative",
].join(",");

const params = {
  scope: scopes,
  show_dialog: "true", 
};

const LOGIN_URL =
  "https://accounts.spotify.com/authorize?" +
  new URLSearchParams(params).toString();

export const authOptions: AuthOptions = {
  providers: [
    SpotifyProvider({
      clientId: process.env.SPOTIFY_CLIENT_ID!,
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET!,
      authorization: LOGIN_URL,
    }),
  ],
  session: {
    strategy: "jwt",
  },
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async jwt({ token, account }: any) {
      if (account) {
        token.accessToken = account.access_token;
        // 🔥 YENİ: Token yenileme sisteminin çalışması için Refresh Token'ı kaydediyoruz
        token.refreshToken = account.refresh_token; 
      }
      return token;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async session({ session, token }: any) {
      session.accessToken = token.accessToken;
      // 🔥 YENİ: Session'a Refresh Token'ı aktarıyoruz ki API dosyamız bunu kullanabilsin
      session.refreshToken = token.refreshToken; 
      return session;
    },
  },
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };