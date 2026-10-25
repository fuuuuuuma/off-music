import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api.ts";
import type { User } from "../types.ts";
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: Record<string, unknown>) => void;
          renderButton: (
            element: HTMLElement,
            options: Record<string, unknown>,
          ) => void;
          disableAutoSelect: () => void;
        };
      };
    };
  }
}
let googleScript: Promise<void> | undefined;
function loadGoogle() {
  if (window.google) return Promise.resolve();
  return (googleScript ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      googleScript = undefined;
      reject(new Error("Googleを読み込めませんでした"));
    };
    document.head.append(s);
  }));
}
export function GoogleButton({
  clientId,
  onLogin,
  onError,
}: {
  clientId: string;
  onLogin: (u: User) => void;
  onError: (s: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null),
    [pending, setPending] = useState(true);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { nonce } = await api<{ nonce: string }>("/auth/nonce");
        await loadGoogle();
        if (!active || !ref.current) return;
        window.google!.accounts.id.initialize({
          client_id: clientId,
          nonce,
          auto_select: false,
          callback: async ({ credential }: { credential: string }) => {
            try {
              setPending(true);
              const { user } = await api<{ user: User }>("/auth/google", {
                credential,
              });
              if (active) onLogin(user);
            } catch (e) {
              onError((e as Error).message);
            } finally {
              if (active) setPending(false);
            }
          },
        });
        window.google!.accounts.id.renderButton(ref.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          shape: "pill",
          text: "signin_with",
          width: 280,
          locale: "ja",
        });
        setPending(false);
      } catch (e) {
        onError((e as Error).message);
        setPending(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [clientId]);
  return (
    <div className="google-login">
      <div ref={ref} />
      {pending && <small>Googleに接続中…</small>}
    </div>
  );
}
