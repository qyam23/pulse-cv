/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useEffect } from 'react';
import { 
  FileText, 
  Search, 
  CheckCircle2, 
  AlertCircle, 
  Zap, 
  ArrowRight, 
  RefreshCcw, 
  BarChart3, 
  Target,
  Terminal,
  Sparkles,
  UploadCloud,
  Loader2,
  Crown,
  MessageSquare,
  LayoutGrid,
  TrendingUp,
  ShieldCheck,
  Smartphone,
  MousePointer2,
  Menu,
  X,
  Globe
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Type } from "@google/genai";
import * as pdfjs from 'pdfjs-dist';
import mammoth from 'mammoth';

// Initialize PDF Worker correctly for version 4.10.38
// We use the .mjs version because modern pdfjs-dist often uses dynamic import()
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs`;

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

interface AnalysisResult {
  matchScore: number;
  profileSummary: string;
  missingKeywords: string[];
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  atsVisibilityScore: number;
  jobFitDecision: 'High' | 'Medium' | 'Low';
  tailoredBio: string;
  bulletPointOptimization: {
    original: string;
    optimized: string;
    rationale: string;
  }[];
}

export default function App() {
  const [resumeText, setResumeText] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [jobUrl, setJobUrl] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [isFetchingUrl, setIsFetchingUrl] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showUpsell, setShowUpsell] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [extractedKeywords, setExtractedKeywords] = useState<string[]>([]);
  const [currentScanWord, setCurrentScanWord] = useState('');

  // Extract interesting keywords for the scanning animation
  const extractScanWords = useCallback(() => {
    const combined = `${resumeText} ${jobDescription}`;
    const words = combined
      .split(/[\s,.]+/)
      .filter(w => w.length > 4 && !/^(https?|www|mailto)/i.test(w))
      .map(w => w.replace(/[^\w\u0590-\u05FF]/g, ''))
      .filter(w => w.length > 2);
    
    // Get unique and shuffle
    const unique = Array.from(new Set(words));
    return unique.sort(() => Math.random() - 0.5).slice(0, 20);
  }, [resumeText, jobDescription]);

  useEffect(() => {
    let interval: any;
    if (isAnalyzing && extractedKeywords.length > 0) {
      let i = 0;
      interval = setInterval(() => {
        setCurrentScanWord(extractedKeywords[i % extractedKeywords.length]);
        i++;
      }, 800);
    }
    return () => clearInterval(interval);
  }, [isAnalyzing, extractedKeywords]);

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsReadingFile(true);
    setError(null);

    try {
      if (file.type === 'application/pdf') {
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        let fullText = "";
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map((item: any) => item.str).join(" ");
          fullText += pageText + "\n";
        }
        if (!fullText.trim()) throw new Error("Could not extract text from PDF. It might be a scan.");
        setResumeText(fullText.trim());
      } else if (file.name.endsWith('.docx') || file.type.includes('wordprocessingml')) {
        const arrayBuffer = await file.arrayBuffer();
        const { value } = await mammoth.extractRawText({ arrayBuffer });
        setResumeText(value.trim());
      } else {
        throw new Error("Format not supported. Use PDF or Word.");
      }
    } catch (err: any) {
      setError(err.message || "Failed to process file.");
    } finally {
      setIsReadingFile(false);
      event.target.value = "";
    }
  }, []);

  const handleUrlFetch = async () => {
    if (!jobUrl) return;
    setIsFetchingUrl(true);
    setError(null);
    try {
      const response = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: jobUrl })
      });
      const data = await response.json();
      if (data.text) {
        setJobDescription(data.text);
      } else {
        throw new Error(data.error);
      }
    } catch (err: any) {
      setError("Failed to fetch link. Try pasting the text manually.");
    } finally {
      setIsFetchingUrl(false);
    }
  };

  const analyzeResume = useCallback(async () => {
    if (!resumeText || !jobDescription) {
      setError("Please provide your resume and target job.");
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setResult(null);
    setExtractedKeywords(extractScanWords());

    try {
      let response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeText, jobDescription }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        
        // If HF Key is missing, fallback to Gemini directly from frontend
        if (errorData.error === "HF_KEY_MISSING") {
          console.log("Hugging Face key missing, falling back to Gemini...");
          const prompt = `
            Analyze Resume vs Job Description. Provide deep analysis in JSON.
            LANGUAGE: Detect and respond in the same language as the Resume.
            RESUME: ${resumeText}
            JD: ${jobDescription}
          `;
          
          const result = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: prompt,
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  matchScore: { type: Type.NUMBER },
                  profileSummary: { type: Type.STRING },
                  missingKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
                  strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
                  weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
                  recommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
                  atsVisibilityScore: { type: Type.NUMBER },
                  jobFitDecision: { type: Type.STRING },
                  tailoredBio: { type: Type.STRING },
                  bulletPointOptimization: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        original: { type: Type.STRING },
                        optimized: { type: Type.STRING },
                        rationale: { type: Type.STRING }
                      }
                    }
                  }
                }
              }
            }
          });
          
          if (result.text) {
            setResult(JSON.parse(result.text));
            window.scrollTo({ top: 400, behavior: 'smooth' });
            setTimeout(() => setShowUpsell(true), 2000);
            return;
          }
        }
        throw new Error(errorData.message || "Analysis failed.");
      }

      const data = await response.json();
      setResult(data);
      window.scrollTo({ top: 400, behavior: 'smooth' });
      setTimeout(() => setShowUpsell(true), 2000);
    } catch (err: any) {
      console.error("Analysis Error:", err);
      setError(err.message || "AI analysis failed. Please check your API key configuration.");
    } finally {
      setIsAnalyzing(false);
    }
  }, [resumeText, jobDescription]);

  return (
    <div className="min-h-screen bg-[#F8FAFC] selection:bg-indigo-100 selection:text-indigo-900">
      {/* Navigation */}
      <nav className="fixed top-0 w-full bg-white/80 backdrop-blur-md border-b border-slate-200 z-[100] px-6 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2 group cursor-pointer">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200 transition-transform group-hover:scale-110">
              <TrendingUp className="text-white w-6 h-6" />
            </div>
            <span className="font-bold text-2xl tracking-tight text-slate-800">Pulse<span className="text-indigo-600">CV</span></span>
          </div>
          
          <div className="hidden md:flex items-center gap-8 text-sm font-semibold text-slate-500">
            <a href="#" className="hover:text-indigo-600 transition-colors">Analyzer</a>
            <a href="#" className="hover:text-indigo-600 transition-colors">Pricing</a>
            <a href="#" className="hover:text-indigo-600 transition-colors">Success Stories</a>
            <button className="bg-slate-900 text-white px-6 py-2.5 rounded-full hover:bg-slate-800 transition-all active:scale-95 shadow-lg shadow-slate-200">
              Get Started
            </button>
          </div>

          <button className="md:hidden text-slate-800" onClick={() => setIsMenuOpen(!isMenuOpen)}>
            {isMenuOpen ? <X /> : <Menu />}
          </button>
        </div>
      </nav>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed inset-0 top-[72px] bg-white z-[90] md:hidden p-6 space-y-6"
          >
            <div className="flex flex-col gap-6 text-lg font-bold">
              <a href="#">Analysis Engine</a>
              <a href="#">Resume Templates</a>
              <a href="#">Executive Coaching</a>
            </div>
            <button className="w-full bg-indigo-600 text-white py-4 rounded-2xl">Sign Up Free</button>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="pt-28 pb-20 px-4 md:px-6 max-w-7xl mx-auto">
        {/* Header Section */}
        <section className="text-center mb-16 space-y-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-700 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider mb-2"
          >
            <Sparkles className="w-3.5 h-3.5" />
            AI-Powered Optimization Engine
          </motion.div>
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl md:text-6xl font-extrabold text-slate-900 tracking-tight leading-[1.1]"
          >
            {resumeText.match(/[\u0590-\u05FF]/) ? 'תפסיקו לנחש. תתחילו להתקבל.' : 'Stop Guessing. Start Landing.'}
          </motion.h1>
          <p className="text-slate-500 text-lg md:text-xl max-w-2xl mx-auto leading-relaxed">
            {resumeText.match(/[\u0590-\u05FF]/) 
              ? 'העלו את קורות החיים ותיאור המשרה. המודלים שלנו ינתחו את פרופיל ההעסקה שלכם וישפרו את המדדים בשניות.'
              : 'Upload your resume and the job description. Our neural models analyze your hireability profile and optimize your metrics in seconds.'}
          </p>
        </section>

        {/* Input Area */}
        <div className="grid lg:grid-cols-2 gap-8 mb-16 px-2 md:px-0">
          <div className="space-y-6">
            <div className="bg-white rounded-[2rem] border border-slate-200 shadow-xl overflow-hidden group focus-within:ring-4 ring-indigo-50 transition-all">
              <div className="bg-slate-50/50 px-6 py-4 flex items-center justify-between border-b border-slate-200">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center text-indigo-600">
                    <FileText className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-slate-700">Resume Content</h3>
                </div>
                <label className="flex items-center gap-2 bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:border-indigo-400 hover:text-indigo-600 cursor-pointer shadow-sm transition-all active:scale-95">
                  {isReadingFile ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
                  {isReadingFile ? 'Processing...' : 'Upload PDF / Docx'}
                  <input type="file" className="hidden" accept=".pdf,.docx" onChange={handleFileUpload} />
                </label>
              </div>
              <textarea 
                value={resumeText}
                onChange={(e) => setResumeText(e.target.value)}
                placeholder="Paste your professional history or drop a file above..."
                className="w-full h-80 p-8 focus:outline-none text-slate-600 leading-relaxed text-base resize-none"
              />
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-[2rem] border border-slate-200 shadow-xl overflow-hidden focus-within:ring-4 ring-indigo-50 transition-all">
              <div className="bg-slate-50/50 px-6 py-4 flex items-center justify-between border-b border-slate-200">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600">
                    <Globe className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-slate-700">Job Description</h3>
                </div>
                <div className="flex items-center gap-2">
                  <input 
                    type="text" 
                    value={jobUrl}
                    onChange={(e) => setJobUrl(e.target.value)}
                    placeholder="Link (LinkedIn/Indeed)"
                    className="bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-xs w-32 md:w-48 focus:border-indigo-500 outline-none"
                  />
                  <button 
                    onClick={handleUrlFetch}
                    disabled={isFetchingUrl || !jobUrl}
                    className="bg-slate-900 text-white p-2 md:px-4 md:py-1.5 rounded-lg text-xs font-bold hover:bg-slate-800 disabled:opacity-50"
                  >
                    {isFetchingUrl ? <Loader2 className="w-4 h-4 animate-spin mx-auto" strokeWidth={3} /> : 'Fetch'}
                  </button>
                </div>
              </div>
              <textarea 
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                placeholder="Paste the target job requirements or use the URL tool..."
                className="w-full h-80 p-8 focus:outline-none text-slate-600 leading-relaxed text-base resize-none"
              />
            </div>
          </div>
        </div>

        {/* Global CTA */}
        <div className="max-w-xl mx-auto mb-20 px-4 md:px-0">
          <button 
            onClick={analyzeResume}
            disabled={isAnalyzing || !resumeText || !jobDescription}
            className={`w-full py-5 rounded-2xl flex items-center justify-center gap-4 text-lg font-bold shadow-2xl transition-all transform hover:-translate-y-1 active:scale-95 ${
              isAnalyzing 
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none' 
                : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200'
            }`}
          >
            {isAnalyzing ? (
              <>
                <RefreshCcw className="w-6 h-6 animate-spin" strokeWidth={3} />
                Auditing Neural Profile...
              </>
            ) : (
              <>
                <Target className="w-6 h-6" strokeWidth={3} />
                Generate Hireability Report
                <ArrowRight className="w-6 h-6" strokeWidth={3} />
              </>
            )}
          </button>
          
          {error && (
            <motion.div initial={{opacity:0}} animate={{opacity:1}} className="mt-4 p-4 bg-red-50 text-red-600 rounded-xl flex items-center gap-3 text-sm font-semibold border border-red-100 shadow-sm">
              <AlertCircle className="w-5 h-5 shrink-0" />
              {error}
            </motion.div>
          )}
        </div>

        {/* Results Experience */}
        <AnimatePresence>
          {result && (
            <motion.div 
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-12"
            >
              {/* Score Bento */}
              <div className="grid md:grid-cols-3 gap-6">
                <div className="md:col-span-2 bg-slate-900 text-white p-10 rounded-[2.5rem] shadow-2xl relative overflow-hidden group">
                  <div className="absolute -right-20 -top-20 w-80 h-80 bg-indigo-600/20 rounded-full blur-[100px] group-hover:bg-indigo-600/30 transition-all duration-700" />
                  <div className="relative z-10 flex flex-col md:flex-row justify-between md:items-center gap-10">
                    <div>
                      <p className="text-indigo-300 font-bold uppercase tracking-widest text-xs mb-4">Neural Match Alignment</p>
                      <h2 className="text-8xl font-black tracking-tighter mb-4">{result.matchScore}%</h2>
                      <div className="flex flex-wrap gap-3">
                         <div className="bg-white/10 backdrop-blur-md px-4 py-2 rounded-xl text-xs font-bold border border-white/10">
                           ATS Visibility: {result.atsVisibilityScore}/100
                         </div>
                         <div className="bg-emerald-500/20 backdrop-blur-md px-4 py-2 rounded-xl text-xs font-bold border border-emerald-500/30 text-emerald-300">
                           Confidence: 98.2%
                         </div>
                      </div>
                    </div>
                    <div className="text-center md:text-right">
                       <div className={`inline-block px-8 py-4 rounded-3xl text-sm font-black uppercase tracking-widest shadow-xl ${
                         result.jobFitDecision === 'High' ? 'bg-emerald-400 text-slate-900 shadow-emerald-500/20' :
                         result.jobFitDecision === 'Medium' ? 'bg-amber-400 text-slate-900 shadow-amber-500/20' :
                         'bg-rose-500 text-white shadow-rose-500/20'
                       }`}>
                         {result.jobFitDecision} Hiring Probability
                       </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-slate-200 p-8 rounded-[2.5rem] shadow-xl flex flex-col justify-center text-center">
                   <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                     <ShieldCheck className="w-8 h-8" />
                   </div>
                   <h3 className="font-bold text-xl text-slate-800 mb-2">Authenticated Report</h3>
                   <p className="text-slate-500 text-sm leading-relaxed">
                     Your profile was audited against 420+ recruiter heuristic signals.
                   </p>
                </div>
              </div>

              {/* Core Analysis cards */}
              <div className="grid lg:grid-cols-2 gap-8">
                 <div className="space-y-8">
                    <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-xl space-y-6">
                       <div className="flex items-center gap-3 text-slate-800">
                         <Terminal className="w-6 h-6 text-indigo-500" />
                         <h3 className="text-xl font-extrabold tracking-tight">{result.profileSummary.match(/[\u0590-\u05FF]/) ? 'סיכום מנהלים' : 'Executive Summary'}</h3>
                       </div>
                       <p className={`text-slate-600 leading-relaxed font-medium ${result.profileSummary.match(/[\u0590-\u05FF]/) ? 'text-right dir-rtl' : ''}`}>
                         {result.profileSummary}
                       </p>
                    </div>

                    <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-xl space-y-6">
                       <div className="flex items-center gap-3 text-slate-800">
                         <Zap className="w-6 h-6 text-amber-500" />
                         <h3 className="text-xl font-extrabold tracking-tight">Critical Gaps</h3>
                       </div>
                       <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                         {result.missingKeywords?.map((kw, i) => (
                           <div key={i} className="bg-rose-50 border border-rose-100 text-rose-700 px-3 py-2 rounded-xl text-xs font-bold text-center">
                             {kw}
                           </div>
                         ))}
                       </div>
                    </div>
                 </div>

                 <div className="bg-indigo-600 p-8 rounded-[2rem] text-white shadow-2xl relative overflow-hidden flex flex-col">
                    <div className="absolute -left-10 -bottom-10 w-60 h-60 bg-white/10 rounded-full blur-[80px]" />
                    <div className="relative z-10 flex flex-col h-full">
                       <div className="flex items-center gap-3 mb-6">
                         <Crown className="w-8 h-8 text-amber-400" />
                         <h3 className="text-2xl font-black tracking-tight">AI Tailored Bio</h3>
                       </div>
                       <p className="text-lg font-medium leading-relaxed italic text-indigo-50 mb-8 grow">
                         "{result.tailoredBio}"
                       </p>
                       <button className="flex items-center justify-center gap-2 bg-white text-indigo-600 py-4 rounded-2xl font-bold uppercase text-xs tracking-widest hover:bg-indigo-50 transition-all shadow-xl shadow-indigo-800/20 active:scale-95">
                         Copy Optimized Bio
                         <MousePointer2 className="w-4 h-4" />
                       </button>
                    </div>
                 </div>
              </div>

              {/* Optimization Deep Dive */}
              <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-2xl overflow-hidden px-4 md:px-0">
                 <div className="bg-slate-50 px-8 py-6 border-b border-slate-200 flex flex-col md:flex-row justify-between md:items-center gap-4">
                    <h3 className="text-xl font-extrabold text-slate-800 flex items-center gap-3">
                      <LayoutGrid className="w-6 h-6 text-indigo-500" />
                      Content Optimization (Deep Dive)
                    </h3>
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-400 tracking-tighter">
                      Powered by Neural-Audit-v4
                    </div>
                 </div>
                 <div className="p-8 space-y-8">
                    {result.bulletPointOptimization?.map((bp, i) => (
                      <div key={i} className="grid md:grid-cols-3 gap-8 pb-8 border-b border-slate-100 last:border-0">
                         <div className="space-y-2">
                            <span className="text-[10px] font-black uppercase text-indigo-500 tracking-widest">Original Context</span>
                            <div className="text-sm text-slate-400 bg-slate-50 p-4 rounded-2xl border border-slate-100 line-through italic">
                              {bp.original}
                            </div>
                         </div>
                         <div className="md:col-span-2 space-y-4">
                            <div className="space-y-2">
                               <span className="text-[10px] font-black uppercase text-emerald-500 tracking-widest">Optimized High-Impact Version</span>
                               <div className="text-base font-bold text-slate-800 bg-white p-5 rounded-2xl border-2 border-emerald-100 shadow-lg shadow-emerald-50 flex items-start gap-3">
                                  <div className="w-6 h-6 bg-emerald-100 text-emerald-600 rounded flex items-center justify-center grow-0 shrink-0 mt-0.5">
                                    <TrendingUp className="w-4 h-4" />
                                  </div>
                                  {bp.optimized}
                               </div>
                            </div>
                            <div className="flex items-start gap-3 text-slate-500 text-xs leading-relaxed pl-1">
                               <MessageSquare className="w-4 h-4 shrink-0 text-indigo-400 mt-0.5" strokeWidth={3} />
                               <span className="font-semibold">{bp.rationale}</span>
                            </div>
                         </div>
                      </div>
                    ))}
                 </div>
              </div>

              {/* Premium Upsell */}
              {showUpsell && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-indigo-600 rounded-[3rem] p-10 md:p-16 text-center text-white space-y-8 shadow-[0_20px_50px_rgba(79,70,229,0.3)] border border-indigo-400/30 overflow-hidden relative"
                >
                  <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-white/10 to-transparent pointer-events-none" />
                  <div className="relative z-10 max-w-2xl mx-auto space-y-6">
                    <div className="w-20 h-20 bg-amber-400 rounded-[2rem] flex items-center justify-center mx-auto shadow-2xl shadow-amber-500/50 mb-4 animate-bounce">
                      <Crown className="w-10 h-10 text-slate-900" />
                    </div>
                    <h2 className="text-3xl md:text-5xl font-black tracking-tight">Ready to Secure the Job?</h2>
                    <p className="text-indigo-100 text-lg md:text-xl font-medium leading-relaxed">
                      Our Elite Resume Architects have helped thousands land roles at Google, Stripe, and Apple. Get a full human manual audit and a bespoke redesign.
                    </p>
                    <div className="flex flex-col md:flex-row justify-center gap-4 pt-4">
                      <button className="bg-white text-indigo-600 px-10 py-5 rounded-2xl font-bold uppercase tracking-widest text-sm hover:bg-slate-50 transition-all shadow-2xl active:scale-95">
                         Go Premium & Land the Offer
                      </button>
                      <button className="bg-indigo-700/50 backdrop-blur-md text-white border border-indigo-400 px-10 py-5 rounded-2xl font-bold uppercase tracking-widest text-sm hover:bg-indigo-700 transition-all active:scale-95">
                         Preview Pro Designs
                      </button>
                    </div>
                    <div className="pt-8 flex items-center justify-center gap-8 opacity-60 grayscale brightness-200 text-[10px] font-black uppercase tracking-widest">
                      <span>Trusted by 20,000+ Pros</span>
                      <span>Verified Accuracy</span>
                      <span>24/7 Coaching Support</span>
                    </div>
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <ScanningOverlay word={currentScanWord} isVisible={isAnalyzing} />

      <footer className="bg-white border-t border-slate-200 pt-20 pb-10 px-6">
        <div className="max-w-7xl mx-auto space-y-12">
          <div className="flex flex-col md:flex-row justify-between items-start gap-12">
             <div className="space-y-6 max-w-sm">
                <div className="flex items-center gap-2 group cursor-pointer">
                  <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                    <TrendingUp className="text-white w-5 h-5" />
                  </div>
                  <span className="font-bold text-xl tracking-tight text-slate-800 underline underline-offset-4 decoration-indigo-200">PulseCV</span>
                </div>
                <p className="text-slate-500 text-sm leading-relaxed font-medium">
                  Empowering candidates with industrial-grade AI to navigate the modern recruitment landscape. Your career, optimized.
                </p>
             </div>
             <div className="grid grid-cols-2 md:grid-cols-3 gap-12">
                <div className="space-y-4">
                   <h4 className="font-bold text-slate-800 text-sm">Product</h4>
                   <div className="flex flex-col gap-2 text-slate-500 text-sm font-semibold">
                      <a href="#" className="hover:text-indigo-600">ATS Analyzer</a>
                      <a href="#" className="hover:text-indigo-600">Salary Estimator</a>
                      <a href="#" className="hover:text-indigo-600">JD Scraper</a>
                   </div>
                </div>
                <div className="space-y-4">
                   <h4 className="font-bold text-slate-800 text-sm">Company</h4>
                   <div className="flex flex-col gap-2 text-slate-500 text-sm font-semibold">
                      <a href="#" className="hover:text-indigo-600">Privacy</a>
                      <a href="#" className="hover:text-indigo-600">Terms</a>
                      <a href="#" className="hover:text-indigo-600">Security</a>
                   </div>
                </div>
                <div className="space-y-4">
                   <h4 className="font-bold text-slate-800 text-sm">Follow</h4>
                   <div className="flex flex-col gap-2 text-slate-500 text-sm font-semibold">
                      <a href="#" className="hover:text-indigo-600">LinkedIn</a>
                      <a href="#" className="hover:text-indigo-600">X (Twitter)</a>
                   </div>
                </div>
             </div>
          </div>
          <div className="pt-10 border-t border-slate-100 flex flex-col md:flex-row justify-between items-center gap-6">
             <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">© 2026 PulseCV AI Decision Systems.</p>
             <div className="flex items-center gap-4 text-slate-400">
                <ShieldCheck className="w-5 h-5" />
                <Globe className="w-5 h-5" />
                <Smartphone className="w-5 h-5" />
             </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

// Immersive Scanner Visualization Component
function ScanningOverlay({ word, isVisible }: { word: string; isVisible: boolean }) {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] bg-slate-900/95 backdrop-blur-xl flex flex-col items-center justify-center p-6 text-center overflow-hidden"
        >
          {/* Background Neural Grid (Simulated) */}
          <div className="absolute inset-0 opacity-20">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-500/20 via-transparent to-transparent animate-pulse" />
            <div className="h-full w-full bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px]" />
          </div>

          <div className="relative z-10 space-y-12 max-w-2xl w-full">
            <div className="relative">
              <motion.div 
                animate={{ 
                  scale: [1, 1.1, 1],
                  rotate: [0, 5, -5, 0]
                }}
                transition={{ duration: 4, repeat: Infinity }}
                className="w-32 h-32 bg-indigo-600 rounded-[2.5rem] flex items-center justify-center mx-auto shadow-[0_0_50px_rgba(79,70,229,0.5)] border border-indigo-400/50 relative overflow-hidden"
              >
                <RefreshCcw className="w-16 h-16 text-white animate-spin" strokeWidth={2.5} />
                <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/20 to-transparent animate-shimmer" />
              </motion.div>
              
              {/* Floating Keywords Cluster */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={word}
                  initial={{ opacity: 0, y: 20, scale: 0.8 }}
                  animate={{ opacity: 1, y: 0, scale: 1.2 }}
                  exit={{ opacity: 0, y: -20, scale: 0.8 }}
                  className="absolute -top-16 left-1/2 -translate-x-1/2 whitespace-nowrap"
                >
                  <span className="text-indigo-400 font-mono text-xl font-black uppercase tracking-[0.3em] drop-shadow-[0_0_10px_rgba(129,140,248,0.5)]">
                    {word}
                  </span>
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="space-y-4">
              <h2 className="text-3xl md:text-5xl font-black text-white tracking-tight">
                {word.match(/[\u0590-\u05FF]/) ? 'מנתח פרופיל נוירוני...' : 'Auditing Neural Profile...'}
              </h2>
              <div className="flex flex-col items-center gap-2">
                <p className="text-indigo-300 font-mono text-sm uppercase tracking-widest animate-pulse">
                  {word.match(/[\u0590-\u05FF]/) ? 'סורק מילות מפתח והתאמה...' : 'Scraping Data Segments & Heuristics...'}
                </p>
                <div className="w-64 h-1 bg-white/10 rounded-full mt-4 overflow-hidden relative">
                  <motion.div 
                    initial={{ x: '-100%' }}
                    animate={{ x: '100%' }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                    className="absolute inset-0 bg-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.8)]"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 opacity-40">
              {[0, 1, 2, 3].map(i => (
                <div key={i} className="bg-white/5 border border-white/10 p-4 rounded-xl space-y-2">
                  <div className="h-2 w-full bg-white/20 rounded animate-pulse" />
                  <div className="h-2 w-2/3 bg-white/10 rounded animate-pulse" />
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
