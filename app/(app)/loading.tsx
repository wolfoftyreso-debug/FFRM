export default function AppLoading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-pulse">
      <div className="h-4 w-24 rounded bg-black/10" />
      <div className="mt-2 h-10 w-56 rounded bg-black/10" />
      <div className="mt-8 space-y-px overflow-hidden rounded-[14px] border border-black/10 bg-white">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="flex h-16 items-center gap-3 px-4">
            <div className="h-10 w-10 rounded-full bg-black/10" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-2/5 rounded bg-black/10" />
              <div className="h-3 w-3/5 rounded bg-black/[0.06]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
