import { redirect } from "next/navigation";
import { auth } from "../auth";

export type ChatGPTUser = {
  displayName: string;
  email: string;
  fullName: string | null;
};

const LOGIN_PATH = "/login";

export async function getChatGPTUser(): Promise<ChatGPTUser | null> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return null;

  const displayName = session.user.name || email;
  return { displayName, email, fullName: session.user.name || null };
}

export async function requireChatGPTUser(
  returnTo: string,
): Promise<ChatGPTUser> {
  const user = await getChatGPTUser();
  if (user) return user;

  redirect(loginPath(returnTo));
}

export function loginPath(returnTo: string): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `${LOGIN_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

function safeRelativeReturnPath(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) return "/";

  let url: URL;
  try {
    url = new URL(value, "https://app.local");
  } catch {
    return "/";
  }
  if (url.origin !== "https://app.local") return "/";
  if (isReservedAuthPath(url.pathname)) return "/";

  return `${url.pathname}${url.search}${url.hash}`;
}

function isReservedAuthPath(pathname: string): boolean {
  return pathname === LOGIN_PATH;
}
