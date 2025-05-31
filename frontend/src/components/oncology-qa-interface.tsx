"use client";

import { useState } from "react";
import { QueryForm } from "@/components/query-form";
import { ResponseDisplay } from "@/components/response-display";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import type { QueryHistory } from "@/types";

interface QueryResponse {
  answer: string;
  sources: Array<{
    content: string;
    metadata: Record<string, any>;
    score?: number;
  }>;
  confidence: number;
  num_sources: number;
}

export function OncologyQAInterface() {
  const [queryHistory, setQueryHistory] = useState<QueryHistory[]>([]);
  const [responseData, setResponseData] = useState<QueryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const API_BASE_URL =
    process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  const handleSubmitQuery = async (
    query: string,
    options?: {
      top_k?: number;
      document_filter?: string;
      max_length?: number;
    }
  ) => {
    if (!query.trim()) {
      setError("❗ Please enter a medical question before submitting.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setResponseData(null);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

    try {
      const response = await fetch(`${API_BASE_URL}/query`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          question: query,
          top_k: options?.top_k ?? 5,
          document_filter: options?.document_filter ?? null,
          max_length: options?.max_length ?? 512,
        }),
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage =
          errorData.detail || `Server responded with ${response.status}`;
        throw new Error(errorMessage);
      }

      const data: QueryResponse = await response.json();

      if (!data.answer || !Array.isArray(data.sources)) {
        throw new Error("⚠️ Invalid response format from the server.");
      }

      setResponseData(data);
      setQueryHistory((prev) => [
        ...prev,
        { id: Date.now(), text: query, timestamp: new Date() },
      ]);
    } catch (err: any) {
      if (err.name === "AbortError") {
        setError("⏱️ Request timed out. Please try again.");
      } else {
        console.error("Medical RAG API error:", err);
        setError(err.message || "Unexpected error occurred.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const clearHistory = () => {
    setQueryHistory([]);
    setResponseData(null);
    setError(null);
  };

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <main className="flex-1 p-4 md:p-8 overflow-y-auto">
        <Header />

        <QueryForm onSubmit={handleSubmitQuery} isLoading={isLoading} />

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg my-6">
            ❌ <strong>Error:</strong> {error}
          </div>
        )}

        {!error && responseData && (
          <>
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 p-4 rounded-lg my-6">
              ✅ <strong>Success:</strong> Your question was processed.
              <div className="text-sm mt-2">
                <strong>Confidence:</strong>{" "}
                {(responseData.confidence * 100).toFixed(1)}% |{" "}
                <strong>Sources:</strong> {responseData.num_sources}
              </div>
            </div>
            <ResponseDisplay responseData={responseData} />
          </>
        )}

        {queryHistory.length > 0 && (
          <div className="mt-8 bg-gray-50 border border-gray-200 rounded-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Query History
              </h3>
              <button
                onClick={clearHistory}
                className="text-sm text-red-600 hover:text-red-800"
              >
                Clear History
              </button>
            </div>
            <div className="space-y-2">
              {queryHistory
                .slice(-5)
                .reverse()
                .map((query) => (
                  <div
                    key={query.id}
                    className="text-sm text-gray-600 border-l-2 border-gray-300 pl-3"
                  >
                    <div className="font-medium">{query.text}</div>
                    <div className="text-xs text-gray-500">
                      {query.timestamp.toLocaleString()}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        <Footer />
      </main>
    </div>
  );
}
