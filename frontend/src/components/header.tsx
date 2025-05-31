import Image from "next/image";

export function Header() {
  return (
    <div className="bg-gradient-to-r from-white via-purple-50 to-white rounded-xl p-8 mb-8 text-center border border-slate-200 shadow-lg">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center justify-left mb-4">
            <span className="text-4xl mr-3">🧬</span>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-700 to-teal-600 bg-clip-text text-transparent">
              Oncology RAG Assistant
            </h1>
          </div>
          <div className="flex flex-wrap justify-left gap-2 mt-4">
            {[
              "Diagnosis",
              "Treatment",
              "Research",
              "Clinical Trials",
              "Patient Care",
            ].map((tag) => (
              <span
                key={tag}
                className="bg-purple-50 text-purple-700 text-xs px-3 py-1 rounded-full border border-purple-200"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
        <div className="hidden md:block ml-6">
          <Image
            src="/flow.gif"
            alt="Flow animation"
            width={500}
            height={500}
            className="rounded-lg"
            unoptimized
          />
        </div>
      </div>
    </div>
  );
}
