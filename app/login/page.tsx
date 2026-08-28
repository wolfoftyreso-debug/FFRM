import { login } from "./actions";

export const metadata = { title: "Logga in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 px-4">
      <form
        action={login}
        className="w-full max-w-sm rounded-xl border border-stone-200 bg-white p-8 shadow-sm"
      >
        <h1 className="text-lg font-semibold text-stone-900">
          Personal Phone
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          Logga in på din privata telefon.
        </p>
        {params.error ? (
          <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            Fel lösenord.
          </p>
        ) : null}
        <label className="mt-6 block text-sm font-medium text-stone-700">
          Lösenord
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            autoFocus
            className="mt-1 h-12 w-full rounded-xl border border-black/10 bg-black/[0.035] px-3 text-[16px] focus:outline-none"
          />
        </label>
        <button
          type="submit"
          className="mt-6 h-12 w-full rounded-xl bg-[var(--system-blue)] px-4 text-[16px] font-semibold text-white"
        >
          Logga in
        </button>
      </form>
    </main>
  );
}
