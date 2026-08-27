
import React from 'react';
import { PersonaAnalysis } from '../types';

interface PersonaResultProps {
  persona: PersonaAnalysis;
}

const PersonaResult: React.FC<PersonaResultProps> = ({ persona }) => {
  const getRatingColor = (rating: number): string => {
    if (rating >= 8) return 'bg-green-500'; // 8, 9, 10
    if (rating >= 5) return 'bg-yellow-500'; // 5, 6, 7
    return 'bg-red-500'; // 1, 2, 3, 4
  };

  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md mb-4 border border-gray-200 dark:border-gray-700">
      <h3 className="text-xl font-semibold mb-1 text-indigo-700 dark:text-indigo-400">
        {persona.name}: <span className="font-normal text-gray-800 dark:text-gray-200">{persona.archetype}</span>
      </h3>
      <p className="text-sm italic text-gray-500 dark:text-gray-400 mb-3">{persona.bio}</p>

      <div className="mb-3">
        <p className="text-md font-medium text-gray-700 dark:text-gray-300">
          <span className="font-semibold">The Gut Reaction:</span> "{persona.gutReaction}"
        </p>
      </div>
      
      <div className="flex items-center mb-3">
        <span className="text-md font-medium text-gray-600 dark:text-gray-400 mr-2">Likelihood to Engage:</span>
        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-lg font-bold ${getRatingColor(persona.likelihoodToEngage)}`}>
          {persona.likelihoodToEngage}
        </div>
      </div>

      <p className="text-md text-gray-700 dark:text-gray-300">
        <span className="font-semibold">The Verdict:</span> {persona.verdict}
      </p>
    </div>
  );
};

export default PersonaResult;
