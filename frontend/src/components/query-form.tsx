"use client";

import type React from "react";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";

interface QueryFormProps {
  onSubmit: (query: string) => Promise<void>;
  isLoading: boolean;
}

export function QueryForm({ onSubmit, isLoading }: QueryFormProps) {
  const [query, setQuery] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    await onSubmit(query);
  };

  const handleClear = () => {
    setQuery("");
  };

  const exampleQueries = [
    "What are the latest treatments for stage 3 breast cancer?",
    "Explain the differences between chemotherapy and immunotherapy",
    "What are common side effects of radiation therapy?",
    "How effective is targeted therapy for lung cancer?",
  ];

  return (
    <div className="mb-8">
      <h2 className="text-2xl font-semibold mb-2 flex items-center text-slate-800">
        <span className="mr-2">💬</span> Ask an Oncology Question
      </h2>
      <p className="text-slate-600 mb-4">
        Enter your cancer-related question below and get AI-powered answers with
        source citations
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type your oncology question here..."
          className="min-h-[120px] bg-white border-purple-200 text-slate-900 placeholder:text-slate-500 focus:border-purple-500"
        />

        <div className="flex flex-wrap gap-2 mb-4">
          {exampleQueries.map((example, index) => (
            <button
              key={index}
              type="button"
              onClick={() => setQuery(example)}
              className="text-xs bg-white border border-purple-200 text-purple-700 px-3 py-1 rounded-full hover:bg-purple-50"
            >
              {example}
            </button>
          ))}
        </div>

        <div className="flex gap-3">
          <Button
            type="submit"
            disabled={isLoading || !query.trim()}
            className="bg-gradient-to-r from-purple-600 to-teal-500 hover:from-purple-700 hover:to-teal-600 text-white"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>🔍 Search Oncology Knowledge</>
            )}
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={handleClear}
            className="border-slate-300 text-slate-700 hover:bg-slate-50"
          >
            🗑️ Clear
          </Button>
        </div>
      </form>
    </div>
  );
}
