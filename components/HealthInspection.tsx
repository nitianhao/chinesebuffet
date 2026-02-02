'use client';

import { useState } from 'react';

interface Violation {
  code?: string;
  description: string;
  category: 'Critical' | 'General';
  severity?: 'High' | 'Medium' | 'Low';
  corrected?: boolean;
  correctionDate?: string;
}

interface InspectionHistory {
  date: string;
  score?: string | number;
  grade?: string;
  violationsCount?: number;
  criticalViolationsCount?: number;
}

interface ClosureHistory {
  closureDate: string;
  reopenDate?: string;
  reason: string;
  duration?: number;
}

interface RegulatoryAction {
  date: string;
  type: 'Fine' | 'Citation' | 'Warning' | 'Suspension' | 'License Revocation';
  amount?: number;
  description: string;
}

interface HealthInspectionData {
  currentScore?: string | number;
  currentGrade?: string;
  inspectionDate?: string;
  inspectorName?: string;
  violations?: Violation[];
  criticalViolationsCount?: number;
  generalViolationsCount?: number;
  inspectionHistory?: InspectionHistory[];
  closureHistory?: ClosureHistory[];
  hasRecentClosure?: boolean;
  regulatoryActions?: RegulatoryAction[];
  dataSource?: string;
  lastUpdated?: string;
  inspectionFrequency?: string;
  permitNumber?: string;
  healthDepartmentUrl?: string;
}

interface HealthInspectionProps {
  healthInspection: HealthInspectionData | null;
  buffetName?: string;
}

export default function HealthInspection({ healthInspection, buffetName }: HealthInspectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showViolations, setShowViolations] = useState(false);

  if (!healthInspection) {
    return null;
  }

  const getGradeColor = (grade?: string) => {
    if (!grade) return 'gray';
    const upperGrade = grade.toUpperCase();
    if (upperGrade === 'A') return 'green';
    if (upperGrade === 'B') return 'yellow';
    if (upperGrade === 'C') return 'red';
    return 'gray';
  };

  const getGradeBgColor = (grade?: string) => {
    if (!grade) return 'bg-gray-100';
    const upperGrade = grade.toUpperCase();
    if (upperGrade === 'A') return 'bg-green-100';
    if (upperGrade === 'B') return 'bg-yellow-100';
    if (upperGrade === 'C') return 'bg-red-100';
    return 'bg-gray-100';
  };

  const getScoreColor = (score?: string | number) => {
    if (typeof score === 'number') {
      if (score >= 90) return 'text-green-600';
      if (score >= 80) return 'text-yellow-600';
      return 'text-red-600';
    }
    return 'text-gray-600';
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return dateString;
    }
  };

  const grade = healthInspection.currentGrade;
  const score = healthInspection.currentScore;
  const hasViolations = (healthInspection.criticalViolationsCount || 0) > 0 || 
                        (healthInspection.generalViolationsCount || 0) > 0;
  const hasClosures = healthInspection.hasRecentClosure || 
                      (healthInspection.closureHistory && healthInspection.closureHistory.length > 0);

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-4 sm:px-6 pt-5 sm:pt-6 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Health Inspection</h2>
          </div>
          {healthInspection.dataSource && (
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
              {healthInspection.dataSource}
            </span>
          )}
        </div>
      </div>

      <div className="px-4 sm:px-6 pb-5 sm:pb-6">
        {/* Current Inspection Status */}
        <div className="mb-6">
          <div className="flex items-center gap-4 flex-wrap">
            {/* Grade Display */}
            {grade && (
              <div className={`flex items-center justify-center w-20 h-20 rounded-xl ${getGradeBgColor(grade)} border-4 border-${getGradeColor(grade)}-500`}>
                <span className={`text-4xl font-bold text-${getGradeColor(grade)}-700`}>
                  {grade}
                </span>
              </div>
            )}

            {/* Score Display */}
            {score && (
              <div className="flex flex-col">
                <span className="text-sm text-gray-600 font-medium">Inspection Score</span>
                <span className={`text-3xl font-bold ${getScoreColor(score)}`}>
                  {typeof score === 'number' ? score : score}
                </span>
              </div>
            )}

            {/* Inspection Date */}
            {healthInspection.inspectionDate && (
              <div className="flex flex-col">
                <span className="text-sm text-gray-600 font-medium">Last Inspection</span>
                <span className="text-lg font-semibold text-gray-900">
                  {formatDate(healthInspection.inspectionDate)}
                </span>
              </div>
            )}

            {/* Violations Summary */}
            {hasViolations && (
              <div className="flex flex-col">
                <span className="text-sm text-gray-600 font-medium">Violations</span>
                <div className="flex items-center gap-2">
                  {healthInspection.criticalViolationsCount && healthInspection.criticalViolationsCount > 0 && (
                    <span className="text-lg font-bold text-red-600">
                      {healthInspection.criticalViolationsCount} Critical
                    </span>
                  )}
                  {healthInspection.generalViolationsCount && healthInspection.generalViolationsCount > 0 && (
                    <span className="text-lg font-semibold text-yellow-600">
                      {healthInspection.generalViolationsCount} General
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Closure Warning */}
        {hasClosures && (
          <div className="mb-6 p-4 bg-red-50 border-2 border-red-200 rounded-xl">
            <div className="flex items-start gap-3">
              <svg className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div className="flex-1">
                <h3 className="font-bold text-red-900 mb-1">Recent Closure Notice</h3>
                <p className="text-sm text-red-800">
                  This establishment has been closed for health violations within the last 2 years.
                </p>
                {healthInspection.closureHistory && healthInspection.closureHistory.length > 0 && (
                  <button
                    onClick={() => setShowHistory(!showHistory)}
                    className="mt-2 text-sm font-semibold text-red-700 hover:text-red-900 underline"
                  >
                    {showHistory ? 'Hide' : 'Show'} closure details
                  </button>
                )}
              </div>
            </div>

            {showHistory && healthInspection.closureHistory && (
              <div className="mt-4 space-y-2">
                {healthInspection.closureHistory.map((closure, idx) => (
                  <div key={idx} className="p-3 bg-white rounded-lg border border-red-200">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-gray-900">
                        Closed: {formatDate(closure.closureDate)}
                      </span>
                      {closure.reopenDate && (
                        <span className="text-sm text-gray-600">
                          Reopened: {formatDate(closure.reopenDate)}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-700">{closure.reason}</p>
                    {closure.duration && (
                      <p className="text-xs text-gray-500 mt-1">
                        Duration: {closure.duration} days
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Violations List */}
        {healthInspection.violations && healthInspection.violations.length > 0 && (
          <div className="mb-6">
            <button
              onClick={() => setShowViolations(!showViolations)}
              className="flex items-center justify-between w-full p-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <span className="font-semibold text-gray-900">
                View Violations ({healthInspection.violations.length})
              </span>
              <svg
                className={`w-5 h-5 text-gray-600 transition-transform ${showViolations ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showViolations && (
              <div className="mt-4 space-y-3">
                {healthInspection.violations.map((violation, idx) => (
                  <div
                    key={idx}
                    className={`p-4 rounded-lg border-2 ${
                      violation.category === 'Critical'
                        ? 'bg-red-50 border-red-200'
                        : 'bg-yellow-50 border-yellow-200'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-1 rounded text-xs font-bold ${
                            violation.category === 'Critical'
                              ? 'bg-red-600 text-white'
                              : 'bg-yellow-600 text-white'
                          }`}
                        >
                          {violation.category}
                        </span>
                        {violation.code && (
                          <span className="text-xs text-gray-600 font-mono bg-white px-2 py-1 rounded">
                            Code: {violation.code}
                          </span>
                        )}
                        {violation.corrected && (
                          <span className="text-xs text-green-700 bg-green-100 px-2 py-1 rounded font-semibold">
                            ✓ Corrected
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-gray-800">{violation.description}</p>
                    {violation.correctionDate && (
                      <p className="text-xs text-gray-600 mt-2">
                        Corrected on: {formatDate(violation.correctionDate)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Inspection History */}
        {healthInspection.inspectionHistory && healthInspection.inspectionHistory.length > 0 && (
          <div className="mb-6">
            <h3 className="font-bold text-gray-900 mb-3">Inspection History</h3>
            <div className="space-y-2">
              {healthInspection.inspectionHistory.slice(0, isExpanded ? 10 : 5).map((inspection, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-700">
                      {formatDate(inspection.date)}
                    </span>
                    {inspection.grade && (
                      <span className={`px-2 py-1 rounded text-xs font-bold ${getGradeBgColor(inspection.grade)} text-${getGradeColor(inspection.grade)}-700`}>
                        {inspection.grade}
                      </span>
                    )}
                    {inspection.score && (
                      <span className={`text-sm font-semibold ${getScoreColor(inspection.score)}`}>
                        Score: {inspection.score}
                      </span>
                    )}
                  </div>
                  {inspection.violationsCount !== undefined && (
                    <span className="text-xs text-gray-600">
                      {inspection.violationsCount} violation{inspection.violationsCount !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              ))}
            </div>
            {healthInspection.inspectionHistory.length > 5 && (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="mt-3 text-sm font-semibold text-[var(--accent1)] hover:text-[var(--accent1)]"
              >
                {isExpanded ? 'Show less' : `Show all ${healthInspection.inspectionHistory.length} inspections`}
              </button>
            )}
          </div>
        )}

        {/* Regulatory Actions */}
        {healthInspection.regulatoryActions && healthInspection.regulatoryActions.length > 0 && (
          <div className="mb-6">
            <h3 className="font-bold text-gray-900 mb-3">Regulatory Actions</h3>
            <div className="space-y-2">
              {healthInspection.regulatoryActions.map((action, idx) => (
                <div key={idx} className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-gray-900">{action.type}</span>
                    <span className="text-sm text-gray-600">{formatDate(action.date)}</span>
                  </div>
                  <p className="text-sm text-gray-700">{action.description}</p>
                  {action.amount && (
                    <p className="text-sm font-semibold text-orange-700 mt-1">
                      Amount: ${action.amount.toLocaleString()}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer Links */}
        <div className="pt-4 border-t border-gray-200">
          <div className="flex items-center justify-between text-sm text-gray-600">
            {healthInspection.lastUpdated && (
              <span>Last updated: {formatDate(healthInspection.lastUpdated)}</span>
            )}
            {healthInspection.healthDepartmentUrl && (
              <a
                href={healthInspection.healthDepartmentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--accent1)] hover:text-[var(--accent1)] font-semibold flex items-center gap-1"
              >
                View official records
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
















