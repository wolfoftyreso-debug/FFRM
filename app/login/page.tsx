import { login } from "./actions";

export const metadata = { title: "Sign in" };

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
          Relationship Agent
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          Sign in to your private workspace.
        </p>
        {params.error ? (
          <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            Wrong password.
          </p>
        ) : null}
        <label className="mt-6 block text-sm font-medium text-stone-700">
          Password
          <input
            type="password"
            name="password"
            required
            autoFocus
            className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-stone-500 focus:outline-none"
          />
        </label>
        <button
          type="submit"
          className="mt-6 w-full rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700"
        >
          Sign in
        </button>
      </form>
    </main>
  );
}
