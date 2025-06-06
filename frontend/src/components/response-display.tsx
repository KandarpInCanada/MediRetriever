import { Separator } from "@/components/ui/separator";

interface ResponseDisplayProps {
  responseData: {
    answer?: string;
    source_document?: string;
    doc?: string;
  };
}

export function ResponseDisplay({ responseData }: ResponseDisplayProps) {
  const { answer, source_document, doc } = responseData;

  return (
    <div className="space-y-6">
      <Separator className="my-6 bg-purple-100" />

      <h2 className="text-2xl font-semibold flex items-center text-slate-800">
        <span className="mr-2">📋</span> Oncology Insights
      </h2>

      {/* AI Answer Section */}
      <div className="bg-white border border-purple-200 rounded-xl p-6 shadow-md">
        <div className="flex items-center text-purple-700 font-semibold text-lg mb-3">
          <span className="mr-2">🧬</span> Clinical Answer
        </div>
        <p className="text-slate-800 font-medium">
          {answer || "No answer provided"}
        </p>
      </div>
    </div>
  );
}
