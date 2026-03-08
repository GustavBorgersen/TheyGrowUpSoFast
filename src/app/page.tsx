import Link from 'next/link'

export default function HomePage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      {/* Hero */}
      <section className="flex flex-col items-center justify-center px-6 py-24 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
          Watch them grow —
          <br />
          <span className="text-blue-400">one photo at a time</span>
        </h1>
        <p className="mt-6 max-w-xl text-lg text-zinc-400">
          Upload photos of someone over the years. We align each face and turn them into a
          smooth timelapse video — all in your browser, no uploads required.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row gap-4 items-center">
          <Link
            href="/guest"
            className="rounded-xl bg-blue-600 px-8 py-4 text-base font-semibold text-white hover:bg-blue-500 transition min-h-[44px] flex items-center"
          >
            Try it free →
          </Link>
          <Link
            href="/login"
            className="rounded-xl border border-zinc-700 px-8 py-4 text-base font-semibold text-zinc-300 hover:border-zinc-500 hover:text-white transition min-h-[44px] flex items-center"
          >
            Sign in with Google
          </Link>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-4xl px-6 pb-24">
        <h2 className="text-center text-2xl font-semibold text-zinc-200 mb-12">How it works</h2>
        <div className="grid gap-8 sm:grid-cols-3">
          <Step n={1} title="Upload" description="Drag and drop photos from any year. Sort oldest first." />
          <Step n={2} title="Align" description="We detect each face and center it with eyes level — automatically." />
          <Step n={3} title="Download" description="Get a perfectly aligned MP4 timelapse you can keep forever." />
        </div>
      </section>

      {/* Save CTA */}
      <section className="border-t border-zinc-800 px-6 py-16 text-center">
        <h2 className="text-xl font-semibold text-zinc-200">Want to save your projects?</h2>
        <p className="mt-3 text-zinc-400">
          Sign in with Google to save your projects, pick from Google Photos, and come back anytime.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-flex items-center rounded-xl border border-zinc-700 px-6 py-3 text-sm font-medium text-zinc-300 hover:border-zinc-500 hover:text-white transition min-h-[44px]"
        >
          Create free account →
        </Link>
      </section>
    </main>
  )
}

function Step({ n, title, description }: { n: number; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center text-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-sm font-bold">
        {n}
      </div>
      <h3 className="font-semibold text-zinc-100">{title}</h3>
      <p className="text-sm text-zinc-400">{description}</p>
    </div>
  )
}
