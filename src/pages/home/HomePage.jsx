import LyHeader from "../../shared/components/LyHeader";

const generationModes = ["Auto", "Precise Cutout", "Studio Clean", "Fast Draft"];

const HomePage = () => {
  return (
    <main className="min-h-screen px-4 pb-8 pt-3 sm:px-6">
      <LyHeader />
      <section className="mx-auto mt-6 max-w-4xl rounded-[1.5rem] border border-neutral-200 bg-white/80 p-4 shadow-[0_16px_40px_rgba(0,0,0,0.05)] backdrop-blur sm:p-5">
        <textarea
          className="h-[280px] w-full resize-none border-0 bg-transparent px-3 py-4 text-2xl font-medium leading-tight text-neutral-900 outline-none placeholder:text-neutral-300 focus:ring-0 sm:h-[340px] sm:px-4 sm:py-5 sm:text-3xl"
          placeholder="Remove background from the image"
          autoFocus
        />
        <div className="flex flex-col gap-3 border-t border-neutral-200 px-1 pt-4 sm:flex-row sm:items-center sm:justify-between sm:px-2">
          <button
            type="button"
            className="inline-flex h-10 items-center justify-center rounded-full border border-neutral-300 bg-neutral-50 px-4 text-sm font-medium tracking-wide text-neutral-900 transition hover:border-neutral-900 hover:bg-neutral-100"
          >
            Choose Files
          </button>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="relative">
              <span className="sr-only">Output mode</span>
              <select className="h-10 min-w-44 appearance-none rounded-full border border-neutral-300 bg-neutral-50 px-4 pr-10 text-sm font-medium text-neutral-900 outline-none transition hover:border-neutral-900 focus:border-neutral-900">
                {generationModes.map((mode) => (
                  <option key={mode} value={mode}>
                    {mode}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[10px] text-neutral-500">
                v
              </span>
            </label>
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-full bg-neutral-900 px-5 text-sm font-semibold tracking-wide text-white transition hover:bg-neutral-700"
            >
              Submit
            </button>
          </div>
        </div>
      </section>
    </main>
  );
};

export default HomePage;
