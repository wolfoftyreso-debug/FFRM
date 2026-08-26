import { getAttentionSummary } from "@/lib/queries";
import { AppNavigation } from "@/components/app-navigation";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let messageBadge = 0;
  let phoneBadge = 0;
  try {
    const attention = await getAttentionSummary();
    messageBadge = attention.escalated.length + attention.draftCount;
    phoneBadge = attention.voicemailNeedsYou;
  } catch {
    // Database may be unavailable during first-time setup; render anyway.
  }

  return (
    <div className="flex min-h-screen">
      <AppNavigation messageBadge={messageBadge} phoneBadge={phoneBadge} />
      <div className="min-w-0 flex-1 pb-20 md:pb-0">
        <main className="mx-auto max-w-5xl px-4 py-5 md:px-8 md:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
