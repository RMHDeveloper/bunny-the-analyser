
import React, { useState, useCallback } from 'react';
import { analyzeLinkedInPost } from './services/analysisService';
import { PersonaAnalysis } from './types';
import PersonaResult from './components/PersonaResult';

const INDUSTRY_GROUPS: { label: string; options: string[] }[] = [
  {
    label: 'Core',
    options: [
      'General',
      'Tech / SaaS',
      'Healthcare / Pharma',
      'Finance / Banking',
      'Creative / Marketing',
      'Manufacturing / Logistics',
      'Education / Academia',
      'Retail / E-commerce',
    ],
  },
  {
    label: 'Trending',
    options: [
      'Artificial Intelligence / ML',
      'Cybersecurity',
      'Climate / CleanTech',
      'Web3 / Crypto',
      'Gaming / Esports',
      'Creator Economy / Media',
      'Real Estate / PropTech',
      'HR / Future of Work',
    ],
  },
];

const App: React.FC = () => {
  const [postContent, setPostContent] = useState<string>('');
  const [selectedIndustry, setSelectedIndustry] = useState<string>('');
  const [analysisResults, setAnalysisResults] = useState<PersonaAnalysis[] | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showResultsPage, setShowResultsPage] = useState<boolean>(false); // New state for page control

  const handleAnalyze = useCallback(async () => {
    if (!postContent.trim()) {
      setError('Please enter a LinkedIn post to analyze.');
      setAnalysisResults(null);
      return;
    }
    if (!selectedIndustry) {
      setError('Please select an industry.');
      setAnalysisResults(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    setAnalysisResults(null); // Clear previous results before new analysis

    try {
      const results = await analyzeLinkedInPost(postContent, selectedIndustry);
      setAnalysisResults(results);
      setShowResultsPage(true); // Show results page on success
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An unexpected error occurred during analysis.');
    } finally {
      setIsLoading(false);
    }
  }, [postContent, selectedIndustry]);

  const handleStartNew = useCallback(() => {
    setPostContent('');
    setSelectedIndustry('');
    setAnalysisResults(null);
    setError(null);
    setIsLoading(false);
    setShowResultsPage(false); // Go back to the input form
  }, []);

  return (
    <div className="container mx-auto max-w-4xl py-8 px-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-start mb-6">
        <img 
          src="https://rabbitmarketinghouse.in/webinar/assets/ll.png" 
          alt="Bunny the Analyzer Logo" 
          className="h-24 w-24 mr-4 object-contain" 
        />
        <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 dark:text-white">
          Bunny the Analyzer
        </h1>
      </div>
      
      {error && (
        <div className="bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg relative mb-6" role="alert">
          <strong className="font-bold mr-2">Error!</strong>
          <span className="block sm:inline">{error}</span>
        </div>
      )}

      {!showResultsPage ? (
        // Input Form Page
        <>
          <p className="text-center text-lg mb-8 text-gray-600 dark:text-gray-300">
            Select an industry and paste your LinkedIn post draft below to get feedback from distinct personas.
          </p>
          <div className="mb-6">
            <label htmlFor="industry-select" className="block text-xl font-medium text-gray-800 dark:text-gray-200 mb-3">
              Select Industry
            </label>
            <select
              id="industry-select"
              className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-base md:text-lg mb-6"
              value={selectedIndustry}
              onChange={(e) => setSelectedIndustry(e.target.value)}
              disabled={isLoading}
            >
              <option value="" disabled>
                -- Choose an Industry --
              </option>
              {INDUSTRY_GROUPS.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>

            <label htmlFor="linkedin-post" className="block text-xl font-medium text-gray-800 dark:text-gray-200 mb-3">
              Your LinkedIn Post Draft
            </label>
            <textarea
              id="linkedin-post"
              className="w-full p-4 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-300 text-base md:text-lg"
              rows={8}
              value={postContent}
              onChange={(e) => setPostContent(e.target.value)}
              placeholder="e.g., 'Just launched my new project! So excited to see the impact this will have on the industry. #innovation #tech #future'"
              disabled={isLoading}
            ></textarea>
          </div>

          <div className="flex justify-center mb-8">
            <button
              onClick={handleAnalyze}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-8 rounded-lg shadow-md transition duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed text-lg"
              disabled={isLoading || !postContent.trim() || !selectedIndustry}
            >
              {isLoading ? (
                <div className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Analyzing...
                </div>
              ) : (
                'Analyze Post'
              )}
            </button>
          </div>
        </>
      ) : (
        // Analysis Results Page
        analysisResults && (
          <div className="mt-8">
            <h2 className="text-3xl font-bold text-center mb-6 text-gray-900 dark:text-white">
              Analysis Results
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {analysisResults.map((persona, index) => (
                <PersonaResult key={index} persona={persona} />
              ))}
            </div>
            <div className="flex justify-center mt-8">
              <button
                onClick={handleStartNew}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-8 rounded-lg shadow-md transition duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 text-lg"
              >
                Start New Analysis
              </button>
            </div>
          </div>
        )
      )}
    </div>
  );
};

export default App;