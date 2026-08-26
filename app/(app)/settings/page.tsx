import { format } from "date-fns";
import {
  getOwner,
  getSystemHealth,
  listBlockedNumbers,
  listRecentAiCalls,
} from "@/lib/queries";
import { getSystemState } from "@/lib/system-state";
import {
  logout,
  removeProviderConfig,
  generateElevenLabsGreetings,
  generateReceptionistPrompts,
  testElevenLabsSettings,
  testElksSettings,
  testTwilioSettings,
  unblockNumber,
} from "@/app/actions";
import { Card, PageHeader } from "@/components/ui";
import { fastModel, smartModel } from "@/lib/ai/config";
import { DEFAULT_GLOBAL_CALL_POLICY } from "@/lib/voice/policy";
import { getProviderStatus } from "@/lib/providers/config";
import { ConfirmForm } from "@/components/confirm-form";
import { AutosaveField } from "@/components/autosave-field";
import { VoiceCloneRecorder } from "@/components/voice-clone-recorder";
import { SegmentedLinks } from "@/components/apple-ui";
import { PendingActionButton } from "@/components/pending-action-button";
import { ContactPhotoUploader } from "@/components/contact-photo-uploader";
import {
  DEFAULT_RECEPTIONIST_CONFIG,
  isOwnerAjour,
} from "@/lib/voice/receptionist-config";

const DISPOSITIONS = [
  { value: "RING_THROUGH", label: "Ring through to my phone" },
  { value: "VOICEMAIL", label: "Voicemail" },
  { value: "SCREEN", label: "AI screening" },
  { value: "REJECT", label: "Reject" },
];

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

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const requestedSection = (await searchParams).section ?? "integrations";
  const section = ["profile", "integrations", "calls", "diagnostics"].includes(
    requestedSection,
  )
    ? requestedSection
    : "integrations";
  const [owner, health, state, aiCalls, blockedNumbers, providers] =
    await Promise.all([
    getOwner(),
    getSystemHealth(),
    getSystemState(),
    listRecentAiCalls(15),
    listBlockedNumbers(),
      getProviderStatus(),
    ]);
  const elks = providers["46elks"];
  const twilio = providers.twilio;
  const eleven = providers.elevenlabs;
  const messagingProvider =
    state.messagingProvider === "twilio" ? "twilio" : "46elks";
  const receptionistConfig = {
    ...DEFAULT_RECEPTIONIST_CONFIG,
    ...(owner?.receptionistConfig ?? {}),
  };
  const availability = owner
    ? isOwnerAjour({
        config: receptionistConfig,
        lastActiveAt: owner.lastActiveAt,
        timezone: owner.timezone,
      })
    : null;

  return (
    <>
      <PageHeader title="Settings" />
      <div className="mb-6">
        <SegmentedLinks
          active={section}
          items={[
            { id: "profile", label: "Profile", href: "/settings?section=profile" },
            {
              id: "integrations",
              label: "Integrations",
              href: "/settings?section=integrations",
            },
            { id: "calls", label: "Calls", href: "/settings?section=calls" },
            {
              id: "diagnostics",
              label: "Diagnostics",
              href: "/settings?section=diagnostics",
            },
          ]}
        />
      </div>
      <div className="space-y-6">
        <Card className={section === "profile" ? "" : "hidden"}>
          <h2 className="mb-4 text-sm font-semibold text-stone-700">
            Your profile and voice
          </h2>
          {owner ? (
            <>
            <ContactPhotoUploader
              name={owner.name}
              endpoint="/api/profile/photo"
              initialPhotoUrl={
                owner.photoDataBase64 ? "/api/profile/photo" : null
              }
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <AutosaveField section="owner" field="name" label="Name" defaultValue={owner.name} />
              <AutosaveField section="owner" field="phoneNumber" label="Mobile number" type="tel" defaultValue={owner.phoneNumber ?? ""} />
              <AutosaveField section="owner" field="email" label="Email" type="email" defaultValue={owner.email ?? ""} />
              <AutosaveField section="owner" field="preferredLanguage" label="Preferred language" defaultValue={owner.preferredLanguage} />
              <AutosaveField section="owner" field="timezone" label="Timezone" defaultValue={owner.timezone} />
              <AutosaveField section="owner" field="defaultTone" label="Default tone" placeholder="warm, informal" defaultValue={owner.voiceProfile?.defaultTone ?? ""} />
              <AutosaveField section="owner" field="emojiUsage" label="Emoji usage" placeholder="light" defaultValue={owner.voiceProfile?.emojiUsage ?? ""} />
              <AutosaveField section="owner" field="formality" label="Formality" placeholder="casual" defaultValue={owner.voiceProfile?.formality ?? ""} />
              <div className="sm:col-span-2">
                <AutosaveField section="owner" field="commonExpressions" label="Common expressions (comma-separated)" defaultValue={(owner.voiceProfile?.commonExpressions ?? []).join(", ")} />
              </div>
              <div className="sm:col-span-2">
                <AutosaveField
                  section="owner"
                  field="dialogueOpenings"
                  label="Dialogue openings (one per line)"
                  multiline
                  placeholder={"Hej! Hur är läget?\nTjena! Hoppas allt är bra.\nHallå där!"}
                  defaultValue={(owner.voiceProfile?.dialogueOpenings ?? []).join(
                    "\n",
                  )}
                />
              </div>
              <div className="sm:col-span-2">
                <AutosaveField
                  section="owner"
                  field="dialogueClosings"
                  label="Dialogue closings (one per line)"
                  multiline
                  placeholder={"Vi hörs!\nHa det fint.\nHör av dig när du kan."}
                  defaultValue={(owner.voiceProfile?.dialogueClosings ?? []).join(
                    "\n",
                  )}
                />
              </div>
            </div>
            </>
          ) : (
            <p className="text-sm text-stone-500">
              No owner profile found — run the seed script (`pnpm db:seed`).
            </p>
          )}
        </Card>

        {section === "calls" && blockedNumbers.length > 0 ? (
          <Card>
            <h2 className="mb-1 text-sm font-semibold text-stone-700">
              Blocked numbers
            </h2>
            <p className="mb-3 text-sm text-stone-500">
              These callers are rejected before call policy runs.
            </p>
            <div className="divide-y divide-stone-100">
              {blockedNumbers.map((blocked) => (
                <div
                  key={blocked.phoneNumber}
                  className="flex min-h-12 items-center justify-between gap-3"
                >
                  <div>
                    <p className="text-sm font-medium">{blocked.phoneNumber}</p>
                    {blocked.reason ? (
                      <p className="text-xs text-stone-400">{blocked.reason}</p>
                    ) : null}
                  </div>
                  <form action={unblockNumber.bind(null, blocked.phoneNumber)}>
                    <button className="px-3 text-sm font-medium text-[var(--system-red)]">
                      Unblock
                    </button>
                  </form>
                </div>
              ))}
            </div>
          </Card>
        ) : null}

        <Card className={section === "integrations" ? "" : "hidden"}>
          <h2 className="text-sm font-semibold text-stone-700">
            Aktiv SMS/MMS-leverantör
          </h2>
          <p className="mt-1 text-sm text-stone-500">
            Bytet påverkar nya utgående meddelanden. AI-växel och samtal ligger
            kvar på 46elks.
          </p>
          <div className="mt-4">
            <AutosaveField
              section="messaging"
              field="provider"
              label="Leverantör"
              options={[
                { value: "46elks", label: "46elks" },
                { value: "twilio", label: "Twilio" },
              ]}
              defaultValue={messagingProvider}
            />
          </div>
        </Card>

        <Card className={section === "integrations" ? "" : "hidden"}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-stone-700">46elks</h2>
              <p className="mt-1 text-sm text-stone-500">
                Your SMS, MMS and voice number. Secrets are encrypted at rest.
              </p>
            </div>
            <ProviderStatus status={elks?.lastTestStatus} />
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <AutosaveField
              section="46elks"
              field="username"
              label="API username"
              placeholder={elks ? "Saved — leave blank to keep" : "u_..."}
            />
            <AutosaveField
              section="46elks"
              field="password"
              label="API password"
              type="password"
              placeholder={elks ? "•••••••• (saved)" : "API password"}
            />
            <div className="sm:col-span-2">
              <AutosaveField
                section="46elks"
                field="fromNumber"
                label="MMS/SMS/voice-enabled number"
                placeholder="+467..."
                defaultValue={String(elks?.publicConfig.fromNumber ?? "")}
              />
            </div>
          </div>
          {elks ? (
            <div className="mt-2 flex flex-wrap gap-3">
              <form action={testElksSettings}>
                <PendingActionButton pendingText="Testing 46elks…">
                  Test 46elks connection
                </PendingActionButton>
              </form>
              <ConfirmForm
                action={removeProviderConfig.bind(null, "46elks")}
                label="Remove 46elks configuration"
                confirmText="Remove the encrypted 46elks credentials?"
              />
            </div>
          ) : null}
          <ProviderTestDetail provider={elks} />
        </Card>

        <Card className={section === "integrations" ? "" : "hidden"}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-stone-700">Twilio</h2>
              <p className="mt-1 text-sm text-stone-500">
                Alternativ adapter för SMS och MMS. Hemligheter krypteras.
              </p>
            </div>
            <ProviderStatus status={twilio?.lastTestStatus} />
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <AutosaveField
              section="twilio"
              field="accountSid"
              label="Account SID"
              placeholder="AC…"
              defaultValue={String(twilio?.publicConfig.accountSid ?? "")}
            />
            <AutosaveField
              section="twilio"
              field="fromNumber"
              label="Twilio-nummer"
              placeholder="+46…"
              defaultValue={String(twilio?.publicConfig.fromNumber ?? "")}
            />
            <AutosaveField
              section="twilio"
              field="apiKeySid"
              label="API Key SID"
              type="password"
              placeholder={twilio ? "SK… (sparad)" : "SK…"}
            />
            <AutosaveField
              section="twilio"
              field="apiKeySecret"
              label="API Key Secret"
              type="password"
              placeholder={twilio ? "•••••••• (sparad)" : "API key secret"}
            />
            <div className="sm:col-span-2">
              <AutosaveField
                section="twilio"
                field="authToken"
                label="Auth Token för webhook-signaturer"
                type="password"
                placeholder={twilio ? "•••••••• (sparad)" : "Auth token"}
              />
            </div>
          </div>
          {twilio ? (
            <div className="mt-2 flex flex-wrap gap-3">
              <form action={testTwilioSettings}>
                <PendingActionButton pendingText="Testar Twilio…">
                  Testa Twilio
                </PendingActionButton>
              </form>
              <ConfirmForm
                action={removeProviderConfig.bind(null, "twilio")}
                label="Ta bort Twilio"
                confirmText="Ta bort krypterade Twilio-uppgifter?"
              />
            </div>
          ) : null}
          <ProviderTestDetail provider={twilio} />
          <p className="mt-3 text-xs text-stone-500">
            Inkommande webhook: <code>/api/webhooks/twilio/messaging</code>
          </p>
        </Card>

        <Card className={section === "integrations" ? "" : "hidden"}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-stone-700">
                ElevenLabs
              </h2>
              <p className="mt-1 text-sm text-stone-500">
                Generates the voicemail and caller-screening voice.
              </p>
            </div>
            <ProviderStatus status={eleven?.lastTestStatus} />
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <AutosaveField
              section="elevenlabs"
              field="apiKey"
              label="API key"
              type="password"
              placeholder={eleven ? "•••••••• (saved)" : "sk_..."}
            />
            <AutosaveField
              section="elevenlabs"
              field="voiceId"
              label="Voice ID"
              placeholder="Voice ID from ElevenLabs"
              defaultValue={String(eleven?.publicConfig.voiceId ?? "")}
            />
            <AutosaveField
              section="elevenlabs"
              field="modelId"
              label="Model"
              defaultValue={String(
                eleven?.publicConfig.modelId ?? "eleven_multilingual_v2",
              )}
            />
            <div />
            <div className="sm:col-span-2">
              <AutosaveField
                section="elevenlabs"
                field="voicemailText"
                label="Voicemail greeting"
                multiline
                defaultValue={String(
                  eleven?.publicConfig.voicemailText ??
                    "Hej! Jag kan inte svara just nu. Lämna gärna ett meddelande efter tonen.",
                )}
              />
            </div>
            <div className="sm:col-span-2">
              <AutosaveField
                section="elevenlabs"
                field="screeningText"
                label="Unknown-caller screening greeting"
                multiline
                defaultValue={String(
                  eleven?.publicConfig.screeningText ??
                    "Hej! Du har kommit till min telefonassistent. Berätta gärna kort vad ärendet gäller.",
                )}
              />
            </div>
          </div>
          {eleven ? (
            <div className="mt-2 flex flex-wrap gap-3">
              <form action={testElevenLabsSettings}>
                <PendingActionButton pendingText="Testing ElevenLabs…">
                  Test ElevenLabs connection
                </PendingActionButton>
              </form>
              <form action={generateElevenLabsGreetings}>
                <PendingActionButton pendingText="Generating greetings…">
                  Generate both greetings
                </PendingActionButton>
              </form>
              <ConfirmForm
                action={removeProviderConfig.bind(null, "elevenlabs")}
                label="Remove ElevenLabs configuration"
                confirmText="Remove ElevenLabs credentials and generated greetings?"
              />
            </div>
          ) : null}
          {eleven?.publicConfig.voicemailAudioId &&
          eleven.publicConfig.screeningAudioId ? (
            <p className="mt-2 text-xs font-medium text-[var(--system-green)]">
              Generated greetings are saved. They become active for 46elks
              when APP_URL and WEBHOOK_TOKEN are configured.
            </p>
          ) : null}
          <ProviderTestDetail provider={eleven} />
          <VoiceCloneRecorder
            currentVoiceName={
              eleven?.publicConfig.voiceName
                ? String(eleven.publicConfig.voiceName)
                : undefined
            }
          />
        </Card>

        <Card className={section === "calls" ? "" : "hidden"}>
          <h2 className="mb-1 text-sm font-semibold text-stone-700">
            AI-växel
          </h2>
          <p className="mb-4 text-sm text-stone-500">
            Assistenten kräver namn och ärende innan ett samtal kan kopplas.
          </p>
          {availability ? (
            <p
              className={`mb-4 rounded-xl px-3 py-2 text-sm font-medium ${
                availability.available
                  ? "bg-green-50 text-green-800"
                  : "bg-amber-50 text-amber-800"
              }`}
            >
              {availability.available ? "Ajour" : "Ej ajour"} ·{" "}
              {availability.reason}
            </p>
          ) : null}
          {owner ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <AutosaveField
                section="receptionist"
                field="enabled"
                label="AI-växel"
                options={[
                  { value: "false", label: "Av" },
                  { value: "true", label: "Alla inkommande samtal" },
                ]}
                defaultValue={String(
                  owner.receptionistConfig?.enabled ??
                    DEFAULT_RECEPTIONIST_CONFIG.enabled,
                )}
              />
              <AutosaveField
                section="receptionist"
                field="availabilityMode"
                label="Ajour"
                options={[
                  { value: "AUTO", label: "Automatiskt" },
                  { value: "AJOUR", label: "Ajour nu" },
                  { value: "NOT_AJOUR", label: "Ej ajour" },
                ]}
                defaultValue={
                  owner.receptionistConfig?.availabilityMode ??
                  DEFAULT_RECEPTIONIST_CONFIG.availabilityMode
                }
              />
              <AutosaveField
                section="receptionist"
                field="workStart"
                label="Arbetsdag börjar"
                type="time"
                defaultValue={
                  owner.receptionistConfig?.workStart ??
                  DEFAULT_RECEPTIONIST_CONFIG.workStart
                }
              />
              <AutosaveField
                section="receptionist"
                field="workEnd"
                label="Arbetsdag slutar"
                type="time"
                defaultValue={
                  owner.receptionistConfig?.workEnd ??
                  DEFAULT_RECEPTIONIST_CONFIG.workEnd
                }
              />
              <AutosaveField
                section="receptionist"
                field="activeWindowMinutes"
                label="Ajour efter aktivitet (minuter)"
                type="number"
                defaultValue={String(
                  owner.receptionistConfig?.activeWindowMinutes ??
                    DEFAULT_RECEPTIONIST_CONFIG.activeWindowMinutes,
                )}
              />
              <div />
              <div className="sm:col-span-2">
                <AutosaveField
                  section="receptionist"
                  field="greetingText"
                  label="Svarsfras"
                  multiline
                  defaultValue={
                    owner.receptionistConfig?.greetingText ??
                    DEFAULT_RECEPTIONIST_CONFIG.greetingText
                  }
                />
              </div>
              <div className="sm:col-span-2">
                <AutosaveField
                  section="receptionist"
                  field="retryText"
                  label="Om namn eller ärende saknas"
                  multiline
                  defaultValue={
                    owner.receptionistConfig?.retryText ??
                    DEFAULT_RECEPTIONIST_CONFIG.retryText
                  }
                />
              </div>
              <div className="sm:col-span-2">
                <AutosaveField
                  section="receptionist"
                  field="connectText"
                  label="Före framkoppling"
                  multiline
                  defaultValue={
                    owner.receptionistConfig?.connectText ??
                    DEFAULT_RECEPTIONIST_CONFIG.connectText
                  }
                />
              </div>
              <div className="sm:col-span-2">
                <AutosaveField
                  section="receptionist"
                  field="callbackText"
                  label="När återuppringning behövs"
                  multiline
                  defaultValue={
                    owner.receptionistConfig?.callbackText ??
                    DEFAULT_RECEPTIONIST_CONFIG.callbackText
                  }
                />
              </div>
              <div className="sm:col-span-2">
                <AutosaveField
                  section="receptionist"
                  field="licensedHoldAudioUrl"
                  label="Licensierat vänteljud (valfri URL)"
                  type="url"
                  placeholder="https://…/hold.mp3"
                  defaultValue={
                    owner.receptionistConfig?.licensedHoldAudioUrl ?? ""
                  }
                />
                <p className="mt-1 text-xs text-stone-500">
                  Lägg bara in musik du har rätt att spela för inringare.
                </p>
              </div>
              <form
                action={generateReceptionistPrompts}
                className="sm:col-span-2"
              >
                <PendingActionButton
                  pendingText="Skapar röstfraser…"
                  variant="filled"
                >
                  Skapa röstfraser med min AI-röst
                </PendingActionButton>
              </form>
              {owner.receptionistConfig?.greetingAudioId &&
              owner.receptionistConfig?.retryAudioId &&
              owner.receptionistConfig?.connectAudioId &&
              owner.receptionistConfig?.callbackAudioId ? (
                <p className="text-xs font-medium text-[var(--system-green)] sm:col-span-2">
                  Röstfraserna är klara.
                </p>
              ) : null}
            </div>
          ) : null}
        </Card>

        <Card className={section === "calls" ? "" : "hidden"}>
          <h2 className="mb-1 text-sm font-semibold text-stone-700">
            Call policy
          </h2>
          <p className="mb-4 text-sm text-stone-500">
            How incoming calls to your number are handled. Per-contact
            settings override this.
          </p>
          {owner ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <AutosaveField
                section="callPolicy"
                field="ownerPhone"
                label="Your real phone (ring-through target)"
                placeholder="+46701234567"
                defaultValue={owner.phoneNumber ?? ""}
              />
              <div />
              <AutosaveField
                section="callPolicy"
                field="knownContacts"
                label="Known contacts"
                options={DISPOSITIONS}
                defaultValue={
                  owner.callPolicy?.knownContacts ??
                  DEFAULT_GLOBAL_CALL_POLICY.knownContacts
                }
              />
              <AutosaveField
                section="callPolicy"
                field="unknownCallers"
                label="Unknown callers"
                options={DISPOSITIONS}
                defaultValue={
                  owner.callPolicy?.unknownCallers ??
                  DEFAULT_GLOBAL_CALL_POLICY.unknownCallers
                }
              />
              <AutosaveField
                section="callPolicy"
                field="nightStart"
                label="Night starts"
                type="time"
                defaultValue={
                  owner.callPolicy?.nightStart ??
                  DEFAULT_GLOBAL_CALL_POLICY.nightStart
                }
              />
              <AutosaveField
                section="callPolicy"
                field="nightEnd"
                label="Night ends"
                type="time"
                defaultValue={
                  owner.callPolicy?.nightEnd ??
                  DEFAULT_GLOBAL_CALL_POLICY.nightEnd
                }
              />
              <AutosaveField
                section="callPolicy"
                field="nightAction"
                label="At night"
                options={DISPOSITIONS.filter(
                  (disposition) => disposition.value !== "RING_THROUGH",
                )}
                defaultValue={
                  owner.callPolicy?.nightAction ??
                  DEFAULT_GLOBAL_CALL_POLICY.nightAction
                }
              />
              <AutosaveField
                section="callPolicy"
                field="nightPriorityThreshold"
                label="Ring through at night when call-through priority ≥"
                type="number"
                defaultValue={String(
                  owner.callPolicy?.nightPriorityThreshold ??
                    DEFAULT_GLOBAL_CALL_POLICY.nightPriorityThreshold,
                )}
              />
            </div>
          ) : null}
        </Card>

        <Card className={section === "diagnostics" ? "" : "hidden"}>
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
              <dt className="text-stone-400">Failed scheduled jobs</dt>
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

        <Card className={section === "diagnostics" ? "" : "hidden"}>
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

        <form
          action={logout}
          className={section === "profile" ? "" : "hidden"}
        >
          <button className="text-sm text-stone-400 hover:text-stone-600">
            Sign out
          </button>
        </form>
      </div>
    </>
  );
}

function ProviderStatus({ status }: { status?: string | null }) {
  if (status === "OK") {
    return (
      <span className="rounded-full bg-green-50 px-2 py-1 text-xs font-semibold text-green-700">
        CONNECTED
      </span>
    );
  }
  if (status === "FAILED") {
    return (
      <span className="rounded-full bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">
        FAILED
      </span>
    );
  }
  return (
    <span className="rounded-full bg-stone-100 px-2 py-1 text-xs font-semibold text-stone-500">
      NOT TESTED
    </span>
  );
}

function ProviderTestDetail({
  provider,
}: {
  provider?:
    | {
        lastTestAt: Date | null;
        lastTestError: string | null;
      }
    | undefined;
}) {
  if (!provider?.lastTestAt) return null;
  return (
    <p
      className={`mt-2 text-xs ${
        provider.lastTestError ? "text-red-600" : "text-stone-400"
      }`}
    >
      Tested {format(provider.lastTestAt, "d MMM HH:mm")}
      {provider.lastTestError
        ? ` · ${friendlyProviderError(provider.lastTestError)}`
        : " · OK"}
    </p>
  );
}

function friendlyProviderError(error: string) {
  if (/\b401\b|authentication|unauthorized/i.test(error)) {
    return "Credentials were rejected. Re-enter the username/key and password.";
  }
  if (/\b403\b|forbidden/i.test(error)) {
    return "This account does not have access to the requested feature.";
  }
  if (/not configured/i.test(error)) {
    return "Complete the required fields above.";
  }
  return "Connection failed. Check the provider settings and try again.";
}
