import { headers } from "next/headers";
import Scene from "@/components/Scene";
import { detectLang } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default function Page() {
  const h = headers();
  const acceptLanguage = h.get("accept-language");
  const country =
    h.get("x-vercel-ip-country") ||
    h.get("cf-ipcountry") ||
    h.get("x-country-code") ||
    null;
  const lang = detectLang(acceptLanguage, country);
  return <Scene lang={lang} />;
}
