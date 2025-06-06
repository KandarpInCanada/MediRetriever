"use client";

import { useState, useEffect } from "react";
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

// Rate limiting interface
interface RateLimitTracker {
  timestamps: number[];
  isLimited: boolean;
  resetTime: number | null;
}

// Timer hook for countdown
const useCountdown = (targetTime: number | null) => {
  const [timeLeft, setTimeLeft] = useState(0);

  useEffect(() => {
    if (!targetTime) {
      setTimeLeft(0);
      return;
    }

    const updateTimer = () => {
      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((targetTime - now) / 1000));
      setTimeLeft(remaining);
    };

    updateTimer(); // Initial update
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [targetTime]);

  return timeLeft;
};

export function OncologyQAInterface() {
  const [queryHistory, setQueryHistory] = useState<QueryHistory[]>([]);
  const [responseData, setResponseData] = useState<QueryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiBaseUrl, setApiBaseUrl] = useState("http://localhost:8000");

  // Rate limiting state
  const [rateLimitTracker, setRateLimitTracker] = useState<RateLimitTracker>({
    timestamps: [],
    isLimited: false,
    resetTime: null,
  });

  // Live countdown timer
  const countdownSeconds = useCountdown(rateLimitTracker.resetTime);

  // Fetch dynamic config at runtime
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch("/api/config");
        const data = await res.json();
        setApiBaseUrl(data.apiUrl || "http://localhost:8000");
      } catch (err) {
        console.error("Failed to load runtime config:", err);
      }
    };

    fetchConfig();
  }, []);

  // Rate limiting logic
  const checkRateLimit = (): {
    allowed: boolean;
    delayMs: number;
    message?: string;
  } => {
    const now = Date.now();
    const oneMinuteAgo = now - 60000; // 1 minute in milliseconds

    // Clean up old timestamps (older than 1 minute)
    const recentTimestamps = rateLimitTracker.timestamps.filter(
      (timestamp) => timestamp > oneMinuteAgo
    );

    // Update tracker with cleaned timestamps
    setRateLimitTracker((prev) => ({
      ...prev,
      timestamps: recentTimestamps,
    }));

    if (recentTimestamps.length >= 3) {
      // Calculate delay based on how many requests over the limit
      const excessRequests = recentTimestamps.length - 2; // -2 because 3 is the limit
      const baseDelay = 10000; // 10 seconds base delay
      const delayMs = baseDelay * Math.pow(2, excessRequests - 1); // Exponential backoff

      // Calculate when the oldest request will expire
      const oldestTimestamp = Math.min(...recentTimestamps);
      const resetTime = oldestTimestamp + 60000; // 1 minute after oldest request
      const timeUntilReset = Math.max(0, resetTime - now);

      setRateLimitTracker((prev) => ({
        ...prev,
        isLimited: true,
        resetTime: resetTime,
      }));

      return {
        allowed: false,
        delayMs: Math.max(delayMs, 5000), // Minimum 5 seconds delay
        message: `⏱️ Rate limit exceeded. You've made ${
          recentTimestamps.length
        } requests in the last minute. Please wait ${Math.ceil(
          timeUntilReset / 1000
        )} seconds before trying again.`,
      };
    }

    setRateLimitTracker((prev) => ({
      ...prev,
      isLimited: false,
      resetTime: null,
    }));

    return { allowed: true, delayMs: 0 };
  };

  // Add request timestamp to tracker
  const addRequestTimestamp = () => {
    const now = Date.now();
    setRateLimitTracker((prev) => ({
      ...prev,
      timestamps: [...prev.timestamps, now],
    }));
  };

  // Mock data for different types of questions
  const getMockResponse = (query: string): QueryResponse => {
    const queryLower = query.toLowerCase().trim();

    // Check for math queries like "2 + 2" or similar mathematical expressions
    const mathPattern = /^\s*\d+\s*[\+\-\*\/]\s*\d+\s*\??\s*$/;
    if (
      mathPattern.test(queryLower) ||
      queryLower.includes("2 + 2") ||
      queryLower.includes("2+2")
    ) {
      return {
        answer:
          "Not valid - This system is designed for oncology-related medical questions only. Please ask questions about cancer, treatments, or related medical topics.",
        sources: [],
        confidence: 0,
        num_sources: 0,
      };
    }

    const mockResponses = {
      "lung cancer": {
        answer:
          "Lung cancer is the leading cause of cancer-related deaths worldwide. There are two main types: non-small cell lung cancer (NSCLC) and small cell lung cancer (SCLC). NSCLC accounts for approximately 85% of all lung cancer cases. Treatment options include surgery, chemotherapy, radiation therapy, targeted therapy, and immunotherapy, depending on the stage and type of cancer.",
        sources: [
          {
            content:
              "Non-small cell lung cancer (NSCLC) represents approximately 85% of all lung cancer diagnoses. The most common subtypes include adenocarcinoma, squamous cell carcinoma, and large cell carcinoma.",
            metadata: {
              title: "Lung Cancer Classification and Epidemiology",
              journal: "Journal of Clinical Oncology",
              year: 2023,
              doi: "10.1200/JCO.2023.41.16",
            },
            score: 0.92,
          },
          {
            content:
              "Treatment approaches for lung cancer have evolved significantly with the introduction of targeted therapies and immunotherapy. Molecular testing is now standard practice to identify actionable mutations.",
            metadata: {
              title: "Advances in Lung Cancer Treatment",
              journal: "Nature Reviews Cancer",
              year: 2023,
              doi: "10.1038/s41568-023-00567-4",
            },
            score: 0.88,
          },
        ],
        confidence: 0.91,
        num_sources: 2,
      },
      "breast cancer": {
        answer:
          "Breast cancer is the second most common cancer in women. It can be classified into several subtypes based on hormone receptor status and HER2 expression. Treatment typically involves a multidisciplinary approach including surgery, chemotherapy, radiation therapy, hormone therapy, and targeted therapy. Early detection through screening mammography significantly improves outcomes.",
        sources: [
          {
            content:
              "Breast cancer subtypes are classified based on estrogen receptor (ER), progesterone receptor (PR), and human epidermal growth factor receptor 2 (HER2) status, which guides treatment decisions.",
            metadata: {
              title: "Molecular Subtypes of Breast Cancer",
              journal: "New England Journal of Medicine",
              year: 2023,
              doi: "10.1056/NEJMra2208860",
            },
            score: 0.94,
          },
        ],
        confidence: 0.89,
        num_sources: 1,
      },
      "prostate cancer": {
        answer:
          "Prostate cancer is the most common cancer in men. It often grows slowly and may not cause symptoms initially. PSA screening helps with early detection. Treatment options range from active surveillance for low-risk disease to surgery, radiation therapy, hormone therapy, and chemotherapy for advanced cases. The choice depends on cancer stage, grade, patient age, and overall health.",
        sources: [
          {
            content:
              "Prostate cancer risk stratification uses PSA levels, Gleason score, and clinical stage to guide treatment decisions. Low-risk patients may benefit from active surveillance.",
            metadata: {
              title: "Prostate Cancer Management Guidelines",
              journal: "European Urology",
              year: 2023,
              doi: "10.1016/j.eururo.2023.04.016",
            },
            score: 0.89,
          },
        ],
        confidence: 0.87,
        num_sources: 1,
      },
      "colon cancer": {
        answer:
          "Colorectal cancer is the third most common cancer worldwide. It typically develops from precancerous polyps over many years. Screening with colonoscopy can prevent cancer by detecting and removing polyps. Treatment involves surgery as the primary approach, often combined with chemotherapy for advanced stages. Targeted therapies are available for specific molecular subtypes.",
        sources: [
          {
            content:
              "Colorectal cancer screening programs have significantly reduced incidence and mortality through early detection and removal of precancerous adenomatous polyps.",
            metadata: {
              title: "Colorectal Cancer Screening and Prevention",
              journal: "Gastroenterology",
              year: 2023,
              doi: "10.1053/j.gastro.2023.02.028",
            },
            score: 0.91,
          },
        ],
        confidence: 0.88,
        num_sources: 1,
      },
      "pancreatic cancer": {
        answer:
          "Pancreatic cancer is one of the most aggressive cancers with poor prognosis due to late diagnosis and limited treatment options. Most cases are pancreatic ductal adenocarcinoma. Surgery offers the only chance for cure but is possible in only 15-20% of patients. Chemotherapy regimens like FOLFIRINOX and gemcitabine-based combinations are standard treatments for advanced disease.",
        sources: [
          {
            content:
              "Pancreatic ductal adenocarcinoma has a 5-year survival rate of approximately 11%, making it one of the deadliest cancers. Early detection remains challenging due to lack of specific symptoms.",
            metadata: {
              title:
                "Pancreatic Cancer: Current Challenges and Future Directions",
              journal: "Nature Reviews Gastroenterology & Hepatology",
              year: 2023,
              doi: "10.1038/s41575-023-00756-9",
            },
            score: 0.93,
          },
        ],
        confidence: 0.85,
        num_sources: 1,
      },
      chemotherapy: {
        answer:
          "Chemotherapy is a systemic treatment that uses drugs to destroy cancer cells throughout the body. It works by interfering with cancer cell division and growth. Common side effects include fatigue, nausea, hair loss, and increased infection risk due to lowered white blood cell counts. The specific regimen depends on cancer type, stage, and patient factors.",
        sources: [
          {
            content:
              "Chemotherapy agents target rapidly dividing cells by interfering with DNA replication, cell division, or cellular metabolism. Different classes include alkylating agents, antimetabolites, and topoisomerase inhibitors.",
            metadata: {
              title: "Mechanisms of Chemotherapy Action",
              journal: "Cancer Research",
              year: 2023,
              doi: "10.1158/0008-5472.CAN-23-0156",
            },
            score: 0.87,
          },
          {
            content:
              "Management of chemotherapy-induced side effects has improved significantly with supportive care measures including antiemetics, growth factors, and prophylactic antibiotics.",
            metadata: {
              title: "Supportive Care in Oncology",
              journal: "Journal of Clinical Oncology",
              year: 2023,
              doi: "10.1200/JCO.2023.41.15",
            },
            score: 0.85,
          },
        ],
        confidence: 0.86,
        num_sources: 2,
      },
      immunotherapy: {
        answer:
          "Immunotherapy harnesses the body's immune system to fight cancer. Checkpoint inhibitors like PD-1 and PD-L1 inhibitors have revolutionized cancer treatment across multiple tumor types. These drugs work by blocking proteins that prevent immune cells from attacking cancer cells. Response rates vary by cancer type, but durable responses are often seen in responding patients.",
        sources: [
          {
            content:
              "Immune checkpoint inhibitors target regulatory pathways in T cells to enhance anti-tumor immune responses. PD-1/PD-L1 and CTLA-4 are the most clinically successful targets to date.",
            metadata: {
              title: "Immune Checkpoint Blockade in Cancer Therapy",
              journal: "Cell",
              year: 2023,
              doi: "10.1016/j.cell.2023.03.006",
            },
            score: 0.93,
          },
        ],
        confidence: 0.9,
        num_sources: 1,
      },
      "radiation therapy": {
        answer:
          "Radiation therapy uses high-energy beams to destroy cancer cells and shrink tumors. It can be delivered externally (external beam radiation) or internally (brachytherapy). Modern techniques like IMRT, SBRT, and proton therapy allow precise targeting while minimizing damage to healthy tissue. Side effects depend on the treatment area and may include fatigue, skin changes, and organ-specific effects.",
        sources: [
          {
            content:
              "Advanced radiation therapy techniques such as intensity-modulated radiation therapy (IMRT) and stereotactic body radiation therapy (SBRT) have improved treatment precision and reduced toxicity.",
            metadata: {
              title: "Advances in Radiation Oncology",
              journal: "International Journal of Radiation Oncology",
              year: 2023,
              doi: "10.1016/j.ijrobp.2023.03.045",
            },
            score: 0.88,
          },
        ],
        confidence: 0.87,
        num_sources: 1,
      },
      "targeted therapy": {
        answer:
          "Targeted therapy uses drugs that specifically target molecular abnormalities in cancer cells. These treatments are designed to interfere with specific proteins or pathways that cancer cells need to grow and survive. Examples include tyrosine kinase inhibitors, monoclonal antibodies, and CDK4/6 inhibitors. Molecular testing is essential to identify patients who will benefit from specific targeted therapies.",
        sources: [
          {
            content:
              "Targeted therapies have transformed cancer treatment by focusing on specific molecular alterations. Companion diagnostics are crucial for identifying patients likely to respond to specific targeted agents.",
            metadata: {
              title: "Precision Medicine in Oncology",
              journal: "Nature Medicine",
              year: 2023,
              doi: "10.1038/s41591-023-02367-9",
            },
            score: 0.92,
          },
        ],
        confidence: 0.89,
        num_sources: 1,
      },
      "side effects": {
        answer:
          "Cancer treatment side effects vary depending on the type of therapy. Common effects include fatigue, nausea, hair loss, neuropathy, and increased infection risk. Management strategies include supportive medications, lifestyle modifications, and dose adjustments. Many side effects are temporary and resolve after treatment completion, while others may be long-term or permanent.",
        sources: [
          {
            content:
              "Comprehensive supportive care programs can significantly reduce treatment-related toxicities and improve quality of life during cancer treatment.",
            metadata: {
              title: "Managing Cancer Treatment Side Effects",
              journal: "Journal of Clinical Oncology",
              year: 2023,
              doi: "10.1200/JCO.2023.41.18",
            },
            score: 0.86,
          },
        ],
        confidence: 0.84,
        num_sources: 1,
      },
      staging: {
        answer:
          "Cancer staging describes the size and extent of cancer spread. The TNM system is most commonly used: T (tumor size and local invasion), N (lymph node involvement), and M (metastasis to distant organs). These combine into stages 0-IV. Staging guides treatment decisions and prognosis, with earlier stages generally having better outcomes.",
        sources: [
          {
            content:
              "The TNM staging system provides a standardized method for describing cancer extent and is essential for treatment planning and prognostic assessment.",
            metadata: {
              title: "Cancer Staging Manual 8th Edition",
              publisher: "American Joint Committee on Cancer",
              year: 2023,
              doi: "10.1007/978-3-319-40618-3",
            },
            score: 0.95,
          },
        ],
        confidence: 0.92,
        num_sources: 1,
      },
      prognosis: {
        answer:
          "Cancer prognosis depends on multiple factors including cancer type, stage at diagnosis, molecular characteristics, patient age, and overall health. Five-year survival rates provide general guidance but individual outcomes can vary significantly. Advances in treatment have improved prognosis for many cancer types, with some previously fatal cancers now becoming chronic manageable diseases.",
        sources: [
          {
            content:
              "Prognostic factors in cancer include tumor stage, grade, molecular markers, and patient-specific factors. Personalized prognostic models are increasingly being developed.",
            metadata: {
              title: "Cancer Prognosis and Survival Analysis",
              journal: "CA: A Cancer Journal for Clinicians",
              year: 2023,
              doi: "10.3322/caac.21765",
            },
            score: 0.89,
          },
        ],
        confidence: 0.86,
        num_sources: 1,
      },
      "clinical trials": {
        answer:
          "Clinical trials are research studies that test new treatments, drugs, or medical devices in people. They are conducted in phases (I-IV) to evaluate safety and effectiveness. Participation in clinical trials can provide access to cutting-edge treatments and contribute to advancing cancer care. Patients should discuss trial options with their oncology team.",
        sources: [
          {
            content:
              "Clinical trials are essential for developing new cancer treatments. Phase I trials test safety, Phase II evaluate effectiveness, and Phase III compare new treatments to standard care.",
            metadata: {
              title: "Clinical Trial Design in Oncology",
              journal: "Journal of Clinical Oncology",
              year: 2023,
              doi: "10.1200/JCO.2023.41.20",
            },
            score: 0.91,
          },
        ],
        confidence: 0.88,
        num_sources: 1,
      },
      "palliative care": {
        answer:
          "Palliative care focuses on improving quality of life for patients with serious illnesses by managing symptoms and providing emotional support. It can be provided alongside curative treatments and is not limited to end-of-life care. Benefits include better symptom control, improved communication, and enhanced quality of life for both patients and families.",
        sources: [
          {
            content:
              "Early integration of palliative care in cancer treatment has been shown to improve quality of life, reduce aggressive end-of-life care, and may even extend survival in some cases.",
            metadata: {
              title: "Palliative Care in Oncology",
              journal: "New England Journal of Medicine",
              year: 2023,
              doi: "10.1056/NEJMra2208860",
            },
            score: 0.87,
          },
        ],
        confidence: 0.85,
        num_sources: 1,
      },
      screening: {
        answer:
          "Cancer screening involves testing for cancer in people without symptoms. Effective screening programs exist for breast, cervical, colorectal, and lung cancers. Screening can detect cancer early when treatment is most effective or identify precancerous conditions that can be treated to prevent cancer. Guidelines vary by age, risk factors, and cancer type.",
        sources: [
          {
            content:
              "Population-based cancer screening programs have significantly reduced mortality for several cancer types through early detection and treatment of precancerous lesions.",
            metadata: {
              title: "Cancer Screening Guidelines",
              journal: "CA: A Cancer Journal for Clinicians",
              year: 2023,
              doi: "10.3322/caac.21764",
            },
            score: 0.93,
          },
        ],
        confidence: 0.9,
        num_sources: 1,
      },
      biomarkers: {
        answer:
          "Biomarkers are biological indicators that can be measured to assess disease status, prognosis, or treatment response. In oncology, biomarkers include tumor markers (like PSA, CEA), genetic mutations (like BRCA1/2, EGFR), and protein expression levels (like HER2, PD-L1). They guide treatment selection, monitor response, and detect recurrence.",
        sources: [
          {
            content:
              "Molecular biomarkers have revolutionized cancer care by enabling personalized treatment approaches based on tumor-specific characteristics rather than just anatomical location.",
            metadata: {
              title: "Biomarkers in Precision Oncology",
              journal: "Nature Reviews Clinical Oncology",
              year: 2023,
              doi: "10.1038/s41571-023-00756-2",
            },
            score: 0.94,
          },
        ],
        confidence: 0.91,
        num_sources: 1,
      },
      "genetic testing": {
        answer:
          "Genetic testing in oncology can identify inherited cancer predisposition syndromes and tumor-specific mutations. Germline testing looks for inherited mutations (like BRCA1/2 for breast/ovarian cancer), while somatic testing analyzes tumor DNA for acquired mutations that may guide targeted therapy. Results inform treatment decisions and family screening recommendations.",
        sources: [
          {
            content:
              "Genetic testing has become integral to cancer care, with both germline and somatic testing providing crucial information for treatment planning and family counseling.",
            metadata: {
              title: "Genetic Testing in Oncology Practice",
              journal: "Journal of Clinical Oncology",
              year: 2023,
              doi: "10.1200/JCO.2023.41.22",
            },
            score: 0.9,
          },
        ],
        confidence: 0.88,
        num_sources: 1,
      },
    };

    // Enhanced keyword matching
    // Direct keyword matches
    for (const [key, response] of Object.entries(mockResponses)) {
      if (queryLower.includes(key)) {
        return response;
      }
    }

    // Additional keyword mappings for better matching
    const keywordMappings = {
      chemo: "chemotherapy",
      radiation: "radiation therapy",
      radiotherapy: "radiation therapy",
      surgery: "staging", // Use staging as general surgical info
      tumor: "staging",
      metastasis: "staging",
      spread: "staging",
      survival: "prognosis",
      outlook: "prognosis",
      hereditary: "genetic testing",
      inherited: "genetic testing",
      mutation: "genetic testing",
      gene: "genetic testing",
      marker: "biomarkers",
      test: "biomarkers",
      trial: "clinical trials",
      study: "clinical trials",
      experimental: "clinical trials",
      pain: "palliative care",
      comfort: "palliative care",
      "quality of life": "palliative care",
      mammogram: "screening",
      colonoscopy: "screening",
      "pap smear": "screening",
      prevention: "screening",
    };

    // Check keyword mappings
    for (const [keyword, mappedKey] of Object.entries(keywordMappings)) {
      if (queryLower.includes(keyword) && mappedKey in mockResponses) {
        return mockResponses[mappedKey as keyof typeof mockResponses];
      }
    }

    // Default response for unmatched queries
    return {
      answer:
        "Based on current medical literature, this is a complex oncological question that requires careful consideration of multiple factors including patient history, staging, molecular characteristics, and treatment guidelines. I recommend consulting with a qualified oncologist for personalized medical advice and treatment planning. If you have specific questions about cancer types, treatments, side effects, or screening, please feel free to ask more specific questions.",
      sources: [
        {
          content:
            "Oncological treatment decisions should always be individualized based on comprehensive patient assessment, tumor characteristics, and current evidence-based guidelines.",
          metadata: {
            title: "Personalized Cancer Care Guidelines",
            journal: "Journal of Personalized Medicine",
            year: 2023,
            doi: "10.3390/jpm11050123",
          },
          score: 0.78,
        },
      ],
      confidence: 0.75,
      num_sources: 1,
    };
  };

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

    // Check rate limit before processing
    const rateLimitCheck = checkRateLimit();

    if (!rateLimitCheck.allowed) {
      setError(
        `${rateLimitCheck.message} Time remaining: ${countdownSeconds} seconds`
      );
      return;
    }

    setIsLoading(true);
    setError(null);
    setResponseData(null);

    // Add request timestamp to tracker
    addRequestTimestamp();

    try {
      // Base delay for normal requests (3-5 seconds)
      let delayTime = Math.random() * 2000 + 3000;

      // Add additional delay if approaching rate limit
      const recentRequestCount =
        rateLimitTracker.timestamps.filter(
          (timestamp) => timestamp > Date.now() - 60000
        ).length + 1; // +1 for current request

      if (recentRequestCount >= 2) {
        // Start adding delays when approaching the limit
        const additionalDelay = (recentRequestCount - 1) * 2000; // 2 seconds per excess request
        delayTime += additionalDelay;
      }

      await new Promise((resolve) => setTimeout(resolve, delayTime));

      // Mock response instead of actual API call
      const mockData = getMockResponse(query);

      setResponseData(mockData);
      setQueryHistory((prev) => [
        ...prev,
        { id: Date.now(), text: query, timestamp: new Date() },
      ]);
    } catch (err: any) {
      console.error("Mock API error:", err);
      setError(err.message || "Unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  const clearHistory = () => {
    setQueryHistory([]);
    setResponseData(null);
    setError(null);
  };

  // Calculate current request count for display
  const getCurrentRequestCount = () => {
    const oneMinuteAgo = Date.now() - 60000;
    return rateLimitTracker.timestamps.filter(
      (timestamp) => timestamp > oneMinuteAgo
    ).length;
  };

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <main className="flex-1 p-4 md:p-8 overflow-y-auto">
        <Header />

        {/* Rate Limit Status Display */}
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex justify-between items-center text-sm">
            <span className="text-blue-700">
              <strong>Request Status:</strong> {getCurrentRequestCount()}/3
              requests in the last minute
            </span>
            {rateLimitTracker.isLimited && countdownSeconds > 0 && (
              <span className="text-orange-600 font-medium">
                🕐 Rate limited - Resets in{" "}
                <span className="font-mono bg-orange-100 px-2 py-1 rounded">
                  {countdownSeconds}s
                </span>
              </span>
            )}
            {rateLimitTracker.isLimited && countdownSeconds === 0 && (
              <span className="text-green-600 font-medium">
                ✅ Rate limit reset - You can make requests again
              </span>
            )}
          </div>
          {getCurrentRequestCount() >= 2 && !rateLimitTracker.isLimited && (
            <div className="mt-1 text-xs text-blue-600">
              ⚠️ Approaching rate limit. Requests may be delayed.
            </div>
          )}
          {rateLimitTracker.isLimited && countdownSeconds > 0 && (
            <div className="mt-2">
              <div className="text-xs text-orange-600 mb-1">
                Rate limit progress:
              </div>
              <div className="w-full bg-orange-200 rounded-full h-2">
                <div
                  className="bg-orange-500 h-2 rounded-full transition-all duration-1000 ease-linear"
                  style={{
                    width: `${Math.max(
                      0,
                      100 - (countdownSeconds / 60) * 100
                    )}%`,
                  }}
                ></div>
              </div>
              <div className="text-xs text-orange-600 mt-1 text-center">
                {countdownSeconds > 0
                  ? `${Math.floor(countdownSeconds / 60)}:${String(
                      countdownSeconds % 60
                    ).padStart(2, "0")} remaining`
                  : "Ready!"}
              </div>
            </div>
          )}
        </div>

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
