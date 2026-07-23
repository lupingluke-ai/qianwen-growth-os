import type { DefaultSession } from "next-auth";
import type { WorkspaceRole } from "./app/lib/workspace-db";

declare module "next-auth" {
  interface Session {
    user: {
      role: WorkspaceRole;
      memberId: number;
    } & DefaultSession["user"];
  }

  interface User {
    role?: WorkspaceRole;
    memberId?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: WorkspaceRole;
    memberId?: number;
    displayName?: string;
  }
}
