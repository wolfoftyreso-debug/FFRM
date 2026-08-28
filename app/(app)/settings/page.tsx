import Link from "next/link";
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
  testApolloSettings,
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
import { CompanyLogoUploader } from "@/components/company-logo-uploader";
import {
  DEFAULT_RECEPTIONIST_CONFIG,
  isOwnerAjour,
} from "@/lib/voice/receptionist-config";
import { parseApolloPublicConfig } from "@/lib/apollo/config";
import { TERMS } from "@/lib/terminology";
import { photoUrl } from "@/lib/photo-url";

const DISPOSITIONS = [
  { value: "RING_THROUGH", label: "Koppla fram till min telefon" },
  { value: "VOICEMAIL", label: "Röstbrevlåda" },
  { value: "SCREEN", label: "AI-växel" },
  { value: "REJECT", label: "Avvisa" },
];

export const dynamic = "force-dynamic";
export const metadata = { title: TERMS.settings };

function healthValue(value: string | undefined): string {
  if (!value) return "aldrig";
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
  const apollo = providers.apollo;
  const apolloConfig = parseApolloPublicConfig(apollo?.publicConfig);
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
      <PageHeader title={TERMS.settings} />
      <div className="mb-6">
        <SegmentedLinks
          active={section}
          items={[
            { id: "profile", label: "Profil", href: "/settings?section=profile" },
            {
              id: "integrations",
              label: "Integrationer",
              href: "/settings?section=integrations",
            },
            { id: "calls", label: "Samtal", href: "/settings?section=calls" },
            {
              id: "diagnostics",
              label: "Diagnostik",
              href: "/settings?section=diagnostics",
            },
          ]}
        />
      </div>
      <div className="space-y-6">
        <Card className={section === "profile" ? "" : "hidden"}>
          <h2 className="mb-4 text-sm font-semibold text-stone-700">
            Din profil och röst
          </h2>
          {owner ? (
            <>
            <ContactPhotoUploader
              name={owner.name}
              endpoint="/api/profile/photo"
              initialPhotoUrl={photoUrl(
                "/api/profile/photo",
                owner.photoDataBase64,
                owner.updatedAt,
              )}
            />
            <CompanyLogoUploader
              company={owner.company}
              endpoint="/api/profile/logo"
              initialLogoUrl={photoUrl(
                "/api/profile/logo",
                owner.companyLogoDataBase64,
                owner.updatedAt,
              )}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <AutosaveField section="owner" field="name" label="Namn" defaultValue={owner.name} />
              <AutosaveField section="owner" field="phoneNumber" label="Mobilnummer" type="tel" defaultValue={owner.phoneNumber ?? ""} />
              <AutosaveField section="owner" field="email" label="E-post" type="email" defaultValue={owner.email ?? ""} />
              <AutosaveField section="owner" field="company" label="Företag" defaultValue={owner.company ?? ""} />
              <AutosaveField section="owner" field="jobTitle" label="Titel" defaultValue={owner.jobTitle ?? ""} />
              <AutosaveField section="owner" field="preferredLanguage" label="Språk" defaultValue={owner.preferredLanguage} />
              <AutosaveField section="owner" field="timezone" label="Tidszon" defaultValue={owner.timezone} />
              <AutosaveField section="owner" field="defaultTone" label="Ton som standard" placeholder="varm, informell" defaultValue={owner.voiceProfile?.defaultTone ?? ""} />
              <AutosaveField section="owner" field="emojiUsage" label="Emojianvändning" placeholder="light" defaultValue={owner.voiceProfile?.emojiUsage ?? ""} />
              <AutosaveField section="owner" field="formality" label="Formalitetsnivå" placeholder="casual" defaultValue={owner.voiceProfile?.formality ?? ""} />
              <div className="sm:col-span-2">
                <AutosaveField section="owner" field="commonExpressions" label="Vanliga uttryck (kommaseparerade)" defaultValue={(owner.voiceProfile?.commonExpressions ?? []).join(", ")} />
              </div>
              <div className="sm:col-span-2">
                <AutosaveField
                  section="owner"
                  field="dialogueOpenings"
                  label="Inledningar (en per rad)"
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
                  label="Avslutningar (en per rad)"
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
              Ingen ägarprofil hittades — kör seed-skriptet (`pnpm db:seed`).
            </p>
          )}
        </Card>

        {section === "calls" && blockedNumbers.length > 0 ? (
          <Card>
            <h2 className="mb-1 text-sm font-semibold text-stone-700">
              Blockerade nummer
            </h2>
            <p className="mb-3 text-sm text-stone-500">
              De här numren avvisas innan samtalspolicyn körs.
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
                      Avblockera
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
                Ditt nummer för SMS, MMS och röst. Uppgifterna lagras krypterade.
              </p>
            </div>
            <ProviderStatus status={elks?.lastTestStatus} />
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <AutosaveField
              section="46elks"
              field="username"
              label="API-användarnamn"
              placeholder={elks ? "Saved — leave blank to keep" : "u_..."}
            />
            <AutosaveField
              section="46elks"
              field="password"
              label="API-lösenord"
              type="password"
              placeholder={elks ? "•••••••• (saved)" : "API password"}
            />
            <div className="sm:col-span-2">
              <AutosaveField
                section="46elks"
                field="fromNumber"
                label="Nummer med SMS, MMS och röst"
                placeholder="+467..."
                defaultValue={String(elks?.publicConfig.fromNumber ?? "")}
              />
            </div>
          </div>
          {elks ? (
            <div className="mt-2 flex flex-wrap gap-3">
              <form action={testElksSettings}>
                <PendingActionButton pendingText="Testar 46elks…">
                  Testa 46elks-anslutningen
                </PendingActionButton>
              </form>
              <ConfirmForm
                action={removeProviderConfig.bind(null, "46elks")}
                label="Ta bort 46elks-konfigurationen"
                confirmText="Ta bort de krypterade 46elks-uppgifterna?"
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
                Skapar rösten för röstbrevlådan och AI-växeln.
              </p>
            </div>
            <ProviderStatus status={eleven?.lastTestStatus} />
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <AutosaveField
              section="elevenlabs"
              field="apiKey"
              label="API-nyckel"
              type="password"
              placeholder={eleven ? "•••••••• (saved)" : "sk_..."}
            />
            <AutosaveField
              section="elevenlabs"
              field="voiceId"
              label="Röst-ID"
              placeholder="Röst-ID från ElevenLabs"
              defaultValue={String(eleven?.publicConfig.voiceId ?? "")}
            />
            <AutosaveField
              section="elevenlabs"
              field="modelId"
              label="Modell"
              defaultValue={String(
                eleven?.publicConfig.modelId ?? "eleven_multilingual_v2",
              )}
            />
            <div />
            <div className="sm:col-span-2">
              <AutosaveField
                section="elevenlabs"
                field="voicemailText"
                label="Hälsning i röstbrevlådan"
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
                label="Hälsning när AI:n växlar okända"
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
                <PendingActionButton pendingText="Testar ElevenLabs…">
                  Testa ElevenLabs-anslutningen
                </PendingActionButton>
              </form>
              <form action={generateElevenLabsGreetings}>
                <PendingActionButton pendingText="Skapar hälsningar…">
                  Skapa båda hälsningarna
                </PendingActionButton>
              </form>
              <ConfirmForm
                action={removeProviderConfig.bind(null, "elevenlabs")}
                label="Ta bort ElevenLabs-konfigurationen"
                confirmText="Ta bort ElevenLabs-uppgifter och genererade hälsningar?"
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

        <Card className={section === "integrations" ? "" : "hidden"}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-stone-700">Apollo</h2>
              <p className="mt-1 text-sm text-stone-500">
                Hämta telefonnummer för målgrupper och geografiskt urval.
                API-nyckeln krypteras.
              </p>
            </div>
            <ProviderStatus status={apollo?.lastTestStatus} />
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <AutosaveField
                section="apollo"
                field="masterKey"
                label="API-nyckel"
                type="password"
                placeholder={apollo ? "•••••••• (sparad)" : "Apollo API key"}
              />
            </div>
            <div className="sm:col-span-2">
              <AutosaveField
                section="apollo"
                field="defaultTitles"
                label="Standardtitlar / målgrupp"
                multiline
                defaultValue={apolloConfig.defaultTitles}
              />
            </div>
            <AutosaveField
              section="apollo"
              field="defaultSeniorities"
              label="Standardsenioritet"
              defaultValue={apolloConfig.defaultSeniorities}
            />
            <AutosaveField
              section="apollo"
              field="defaultPersonLocations"
              label="Standardgeografi (person)"
              defaultValue={apolloConfig.defaultPersonLocations}
            />
            <AutosaveField
              section="apollo"
              field="defaultOrganizationLocations"
              label="Standardgeografi (företag)"
              defaultValue={apolloConfig.defaultOrganizationLocations}
            />
            <AutosaveField
              section="apollo"
              field="defaultIndustries"
              label="Standardbranscher"
              defaultValue={apolloConfig.defaultIndustries}
            />
            <AutosaveField
              section="apollo"
              field="defaultKeywords"
              label="Standardnyckelord"
              defaultValue={apolloConfig.defaultKeywords}
            />
            <AutosaveField
              section="apollo"
              field="defaultLimit"
              label="Max personer per hämtning"
              type="number"
              defaultValue={String(apolloConfig.defaultLimit)}
            />
            <AutosaveField
              section="apollo"
              field="requirePhone"
              label="Bara personer med telefon"
              options={[
                { value: "true", label: "Ja" },
                { value: "false", label: "Nej" },
              ]}
              defaultValue={apolloConfig.requirePhone ? "true" : "false"}
            />
            <AutosaveField
              section="apollo"
              field="revealPhoneNumbers"
              label="Hämta telefonnummer vid sökning"
              options={[
                { value: "true", label: "Ja, förbruka Apollo-krediter" },
                { value: "false", label: "Nej, bara förhandsgranska" },
              ]}
              defaultValue={apolloConfig.revealPhoneNumbers ? "true" : "false"}
            />
            <AutosaveField
              section="apollo"
              field="includeSimilarTitles"
              label="Inkludera liknande titlar"
              options={[
                { value: "true", label: "Ja" },
                { value: "false", label: "Nej, exakta titlar" },
              ]}
              defaultValue={apolloConfig.includeSimilarTitles ? "true" : "false"}
            />
          </div>
          {apollo ? (
            <div className="mt-2 flex flex-wrap gap-3">
              <form action={testApolloSettings}>
                <PendingActionButton pendingText="Testar Apollo…">
                  Testa Apollo
                </PendingActionButton>
              </form>
              <ConfirmForm
                action={removeProviderConfig.bind(null, "apollo")}
                label="Ta bort Apollo"
                confirmText="Ta bort krypterad Apollo-nyckel?"
              />
            </div>
          ) : null}
          <ProviderTestDetail provider={apollo} />
          <p className="mt-3 text-xs text-stone-500">
            Sök och hämta nummer: <Link className="text-[var(--system-blue)]" href="/apollo">/apollo</Link>
            . Webhook: <code>/api/webhooks/apollo/phone</code>
          </p>
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
            Samtalspolicy
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
                label="Din riktiga telefon (dit samtal kopplas)"
                placeholder="+46701234567"
                defaultValue={owner.phoneNumber ?? ""}
              />
              <div />
              <AutosaveField
                section="callPolicy"
                field="knownContacts"
                label="Kända kontakter"
                options={DISPOSITIONS}
                defaultValue={
                  owner.callPolicy?.knownContacts ??
                  DEFAULT_GLOBAL_CALL_POLICY.knownContacts
                }
              />
              <AutosaveField
                section="callPolicy"
                field="unknownCallers"
                label="Okända som ringer"
                options={DISPOSITIONS}
                defaultValue={
                  owner.callPolicy?.unknownCallers ??
                  DEFAULT_GLOBAL_CALL_POLICY.unknownCallers
                }
              />
              <AutosaveField
                section="callPolicy"
                field="nightStart"
                label="Natten börjar"
                type="time"
                defaultValue={
                  owner.callPolicy?.nightStart ??
                  DEFAULT_GLOBAL_CALL_POLICY.nightStart
                }
              />
              <AutosaveField
                section="callPolicy"
                field="nightEnd"
                label="Natten slutar"
                type="time"
                defaultValue={
                  owner.callPolicy?.nightEnd ??
                  DEFAULT_GLOBAL_CALL_POLICY.nightEnd
                }
              />
              <AutosaveField
                section="callPolicy"
                field="nightAction"
                label="Nattetid"
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
                label="Koppla fram nattetid när samtalsprioritet ≥"
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
            Systemhälsa
          </h2>
          {health.webhooksProtected ? null : (
            <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              Webhookarna är oskyddade. Vem som helst som känner till adressen
              kan lägga in SMS, samtal och röstmeddelanden i systemet — och AI:n
              kan svara på dem. Sätt <code>WEBHOOK_TOKEN</code> i miljön och
              lägg till <code>?token=…</code> i webhook-adresserna hos 46elks.
            </p>
          )}
          <dl className="grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
            <div className="flex justify-between">
              <dt className="text-stone-400">Senaste cron-körning</dt>
              <dd>{healthValue(state.lastCronAt)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-stone-400">Senaste 46elks-webhook</dt>
              <dd>{healthValue(state.lastWebhookAt)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-stone-400">Senaste lyckade AI-anrop</dt>
              <dd>{healthValue(state.lastAiAt)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-stone-400">Senast skickade SMS</dt>
              <dd>{healthValue(state.lastSmsSentAt)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-stone-400">Misslyckade schemalagda jobb</dt>
              <dd className={health.failedJobs > 0 ? "text-red-600" : ""}>
                {health.failedJobs}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-stone-400">Senast avvisad webhook</dt>
              <dd
                className={
                  state.lastRejectedWebhookAt ? "text-amber-700" : ""
                }
              >
                {healthValue(state.lastRejectedWebhookAt)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-stone-400">Webhookar</dt>
              <dd className={health.webhooksProtected ? "" : "text-red-600"}>
                {health.webhooksProtected ? "Skyddade" : "Oskyddade"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-stone-400">Väntande eskaleringar</dt>
              <dd className={health.pendingEscalations > 0 ? "text-red-600" : ""}>
                {health.pendingEscalations}
              </dd>
            </div>
          </dl>
        </Card>

        <Card className={section === "diagnostics" ? "" : "hidden"}>
          <h2 className="mb-3 text-sm font-semibold text-stone-700">
            AI-modeller
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
                Senaste AI-anrop
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
            Logga ut
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
        Ansluten
      </span>
    );
  }
  if (status === "FAILED") {
    return (
      <span className="rounded-full bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">
        Fungerar inte
      </span>
    );
  }
  return (
    <span className="rounded-full bg-stone-100 px-2 py-1 text-xs font-semibold text-stone-500">
      Inte testad
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
    return "Uppgifterna avvisades. Skriv in användarnamn/nyckel och lösenord igen.";
  }
  if (/\b403\b|forbidden/i.test(error)) {
    return "Kontot saknar behörighet till den här funktionen.";
  }
  if (/not configured/i.test(error)) {
    return "Fyll i fälten ovan först.";
  }
  return "Anslutningen misslyckades. Kontrollera uppgifterna och försök igen.";
}
