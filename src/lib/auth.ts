import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";

export type AppRole = "admin" | "seller";

export function useSession() {
  return useQuery({
    queryKey: ["session"],
    queryFn: async (): Promise<Session | null> => {
      const { data } = await supabase.auth.getSession();
      return data.session ?? null;
    },
    staleTime: 60_000,
  });
}

export function useMyRole() {
  const { data: session } = useSession();
  return useQuery({
    queryKey: ["my-role", session?.user.id],
    enabled: !!session?.user.id,
    queryFn: async (): Promise<AppRole | null> => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session!.user.id);
      if (error) throw error;
      if (!data?.length) return null;
      if (data.some((r) => r.role === "admin")) return "admin";
      return "seller";
    },
    staleTime: 60_000,
  });
}

export function useSignOut() {
  const qc = useQueryClient();
  const nav = useNavigate();
  return async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    nav({ to: "/auth", replace: true });
  };
}

export function formatSDG(n: number | string | null | undefined) {
  const v = Number(n ?? 0);
  return v.toLocaleString("ar-SD", { maximumFractionDigits: 2 }) + " ج.س";
}
