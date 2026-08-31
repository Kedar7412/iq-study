export default function Home() {
  const steps = [
    {
      title: "Upload a book",
      description:
        "Drop in your textbook or notes. IQ Study reads the whole thing, cover to cover.",
    },
    {
      title: "Analyze",
      description:
        "It maps concepts to your curriculum and finds what actually matters for your exam.",
    },
    {
      title: "High-probability questions",
      description:
        "Get a focused set of ultra high-probability questions instead of guessing what to study.",
    },
    {
      title: "Personalized adaptive study",
      description:
        "A quick profile tunes the method to how you learn, then pushes recall to build lasting understanding.",
    },
  ];

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-12 px-6 py-20">
      <header className="max-w-2xl text-center">
        <h1 className="text-5xl font-bold tracking-tight sm:text-6xl">
          IQ Study
        </h1>
        <p className="mt-6 text-lg text-gray-600 dark:text-gray-300">
          Upload a book, get ultra high-probability questions from your
          curriculum, and study with a personalized adaptive loop built to make
          concepts stick.
        </p>
      </header>

      <ol className="grid w-full max-w-4xl grid-cols-1 gap-4 sm:grid-cols-2">
        {steps.map((step, index) => (
          <li
            key={step.title}
            className="rounded-lg border border-gray-200 p-6 dark:border-gray-800"
          >
            <div className="text-sm font-medium text-gray-400">
              Step {index + 1}
            </div>
            <h2 className="mt-1 text-xl font-semibold">{step.title}</h2>
            <p className="mt-2 text-gray-600 dark:text-gray-300">
              {step.description}
            </p>
          </li>
        ))}
      </ol>
    </main>
  );
}
