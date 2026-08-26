import { format } from "date-fns";
import { getOwner, getSystemHealth, listRecentAiCalls } from "@/lib/queries";
import { getSystemState } from "@/lib/system-state";
import { logout, updateOwnerSettings } from "@/app/actions";
import { Card, PageHeader, PrimaryButton, inputClass, labelClass } from "@/components/ui";
import { fastModel, smartModel } from "@/lib/ai/config";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

function healthValue(value: string | undefined): string {
  if (!value) return "never";
  try {
    return format(new Date(value), "d MMM yyyy HH:mm:ss");
  } catch {
    return value;
  }
}

export default async function SettingsPage() {
  const [owner, health, state, aiCalls] = await Promise.all([
    getOwner(),
    getSystemHealth(),
    getSystemState(),
    listRecentAiCalls(15),
  ]);

  return (
    <>
      <PageHeader title="Settings" />
      <div className="space-y-6">
        <Card>
          <h2 className="mb-4 text-sm font-semibold text-stone-700">
            Your profile and voice
          </h2>
          {owner ? (
            <form action={updateOwnerSettings} className="grid gap-4 sm:grid-cols-2">
              <label className={labelClass}>
                Name
                <input name="name" defaultValue={owner.name} className={inputClass} />
              </label>
              <label className={labelClass}>
                Preferred language
                <input
                  name="preferredLanguage"
                  defaultValue={owner.preferredLanguage}
                  className={inputClass}
                />
              </label>
              <label className={labelClass}>
                Timezone
                <input name="timezone" defaultValue={owner.timezone} className={inputClass} />
              </label>
              <label className={labelClass}>
                Default tone
                <input
                  name="defaultTone"
                  placeholder="warm, informal"
                  defaultValue={owner.voiceProfile?.defaultTone ?? ""}
                  className={inputClass}
                />
              </label>
              <label className={labelClass}>
                Emoji usage
                <input
                  name="emojiUsage"
                  placeholder="light"
                  defaultValue={owner.voiceProfile?.emojiUsage ?? ""}
                  className={inputClass}
                />
              </label>
              <label className={labelClass}>
                Formality
                <input
                  name="formality"
                  placeholder="casual"
                  defaultValue={owner.voiceProfile?.formality ?? ""}
                  className={inputClass}
                />
              </label>
              <label className={`${labelClass} sm:col-span-2`}>
                Common expressions (comma-separated)
                <input
                  name="commonExpressions"
                  defaultValue={(owner.voiceProfile?.commonExpressions ?? []).join(", ")}
                  className={inputClass}
                />
              </label>
              <div className="sm:col-span-2">
                <PrimaryButton>Save</PrimaryButton>
              </div>
            </form>
          ) : (
            <p className="text-sm text-stone-500">
              No owner profile found — run the seed script (`pnpm db:seed`).
            </p>
          )}
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-semibold text-stone-700">
            System health
          </h2>
          <dl className="grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
            <div className="flex justify-between">
              <dt className="text-stone-400">Last cron execution</dt>
              <dd>{healthValue(state.lastCronAt)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-stone-400">Last 46elks webhook</dt>
              <dd>{healthValue(state.lastWebhookAt)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-stone-400">Last successful AI request</dt>
              <dd>{healthValue(state.lastAiAt)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-stone-400">Last SMS sent</dt>
              <dd>{healthValue(state.lastSmsSentAt)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-stone-400">Failed automation executions</dt>
              <dd className={health.failedJobs > 0 ? "text-red-600" : ""}>
                {health.failedJobs}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-stone-400">Pending escalations</dt>
              <dd className={health.pendingEscalations > 0 ? "text-red-600" : ""}>
                {health.pendingEscalations}
              </dd>
            </div>
          </dl>
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-semibold text-stone-700">
            AI models
          </h2>
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-stone-400">Fast model (AI_MODEL_FAST)</dt>
              <dd className="font-mono text-xs">{fastModel()}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-stone-400">Smart model (AI_MODEL_SMART)</dt>
              <dd className="font-mono text-xs">{smartModel()}</dd>
            </div>
          </dl>
          {aiCalls.length > 0 && (
            <>
              <h3 className="mb-1.5 mt-4 text-xs font-semibold uppercase tracking-wide text-stone-400">
                Recent AI calls
              </h3>
              <div className="divide-y divide-stone-100 text-xs text-stone-600">
                {aiCalls.map((call) => (
                  <div key={call.id} className="flex justify-between gap-2 py-1.5">
                    <span>
                      {call.purpose} · {call.model}
                      {!call.ok ? (
                        <span className="ml-1 text-red-600">failed</span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-stone-400">
                      {call.inputTokens ?? "?"}/{call.outputTokens ?? "?"} tok ·{" "}
                      {call.durationMs}ms
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>

        <form action={logout}>
          <button className="text-sm text-stone-400 hover:text-stone-600">
            Sign out
          </button>
        </form>
      </div>
    </>
  );
}
