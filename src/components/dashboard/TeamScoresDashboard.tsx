'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

interface Team {
    id: string;
    eventId: string;
    name: string;
    memberIds: string[];
    createdBy: string;
    createdAt: string;
    updatedAt: string;
}

interface ScoringRound {
    id: string;
    eventId: string;
    name: string;
    roundNumber: number;
    createdAt: string;
    updatedAt: string;
}

interface TeamScore {
    id: string;
    teamId: string;
    scoringRoundId: string;
    score?: number;
    gradedBy?: string;
    gradedAt?: string;
    notes?: string;
    createdAt: string;
    updatedAt: string;
    team?: Team;
    round?: ScoringRound;
}

interface LeaderboardEntry {
    team: Team;
    scores: TeamScore[];
    totalScore: number;
}

interface DashboardData {
    leaderboard: LeaderboardEntry[];
    rounds: ScoringRound[];
}

export default function TeamScoresDashboard({ eventId }: { eventId: string }) {
    const { data: session } = useSession();
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
    const [selectedRound, setSelectedRound] = useState<string>('');
    const [roundScores, setRoundScores] = useState<TeamScore[]>([]);
    const [showRoundView, setShowRoundView] = useState(false);
    const [newRoundName, setNewRoundName] = useState('');
    const [showNewRoundForm, setShowNewRoundForm] = useState(false);
    const [creatingRound, setCreatingRound] = useState(false);

    // Mentor grading state
    const [gradingQRCode, setGradingQRCode] = useState('');
    const [gradingScore, setGradingScore] = useState('');
    const [gradingNotes, setGradingNotes] = useState('');
    const [gradingRoundId, setGradingRoundId] = useState('');
    const [showGradeScanner, setShowGradeScanner] = useState(false);

    // Editing state
    const [editingScoreId, setEditingScoreId] = useState<string | null>(null);
    const [editScoreValue, setEditScoreValue] = useState('');
    const [editNotesValue, setEditNotesValue] = useState('');

    const isMentor = session?.user?.role === 'mentor';
    const isOrganizer = session?.user?.role === 'organizer' || session?.user?.role === 'admin';

    // Check authorization
    useEffect(() => {
        if (session && session.user.role !== 'organizer' && session.user.role !== 'mentor' && session.user.role !== 'admin') {
            setError('Only organizers, mentors and admins can access this page');
            router.push('/');
        }
    }, [session, router]);

    // Fetch dashboard data
    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                const res = await fetch(`/api/organizer/team-scores?eventId=${eventId}`);

                if (!res.ok) {
                    throw new Error('Failed to fetch team scores');
                }

                const data: DashboardData = await res.json();
                setDashboardData(data);

                // Set first round as default if available
                if (data.rounds.length > 0) {
                    setSelectedRound(data.rounds[0].id);
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to fetch team scores');
            } finally {
                setLoading(false);
            }
        };

        if (eventId) {
            fetchData();
        }
    }, [eventId]);

    // Fetch scores for selected round
    useEffect(() => {
        const fetchRoundScores = async () => {
            if (!selectedRound) return;

            try {
                const res = await fetch(
                    `/api/organizer/team-scores?eventId=${eventId}&view=round&roundId=${selectedRound}`
                );

                if (!res.ok) {
                    throw new Error('Failed to fetch round scores');
                }

                const scores: TeamScore[] = await res.json();
                setRoundScores(scores);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to fetch round scores');
            }
        };

        if (showRoundView && selectedRound) {
            fetchRoundScores();
        }
    }, [showRoundView, selectedRound, eventId]);

    const handleEditClick = (score: TeamScore) => {
        setEditingScoreId(score.id);
        setEditScoreValue(score.score?.toString() || '');
        setEditNotesValue(score.notes || '');
    };

    const handleCancelEdit = () => {
        setEditingScoreId(null);
        setEditScoreValue('');
        setEditNotesValue('');
    };

    const handleSaveEdit = async (score: TeamScore) => {
        try {
            const res = await fetch('/api/mentor/teams/grade', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    eventId,
                    teamId: score.teamId,
                    scoringRoundId: score.scoringRoundId,
                    score: Number(editScoreValue),
                    notes: editNotesValue || undefined
                })
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to update score');
            }

            // Refresh data
            const dashboardRes = await fetch(`/api/organizer/team-scores?eventId=${eventId}`);
            const freshData: DashboardData = await dashboardRes.json();
            setDashboardData(freshData);

            // Also refresh round scores if we are in round view
            if (showRoundView && selectedRound) {
                const roundRes = await fetch(
                    `/api/organizer/team-scores?eventId=${eventId}&view=round&roundId=${selectedRound}`
                );
                const scores: TeamScore[] = await roundRes.json();
                setRoundScores(scores);
            }

            setEditingScoreId(null);
            alert('Score updated successfully');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to update score');
        }
    };

    // Handle creating a new scoring round
    const handleCreateRound = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!newRoundName.trim()) {
            setError('Round name is required');
            return;
        }

        try {
            setCreatingRound(true);
            const nextRoundNumber = (dashboardData?.rounds.length || 0) + 1;

            const res = await fetch('/api/organizer/scoring-rounds', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    eventId,
                    name: newRoundName,
                    roundNumber: nextRoundNumber,
                    action: 'create'
                })
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Failed to create round');
            }

            // Reset form and refresh data
            setNewRoundName('');
            setShowNewRoundForm(false);
            setError('');

            // Refresh dashboard data
            const dashboardRes = await fetch(`/api/organizer/team-scores?eventId=${eventId}`);
            const freshData: DashboardData = await dashboardRes.json();
            setDashboardData(freshData);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create round');
        } finally {
            setCreatingRound(false);
        }
    };

    // Handle mentor grading submission
    const handleGradeSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!gradingQRCode || !gradingRoundId || !gradingScore) {
            setError('Please fill in all required fields');
            return;
        }

        const score = parseFloat(gradingScore);
        if (isNaN(score)) {
            setError('Score must be a valid number');
            return;
        }

        try {
            const res = await fetch('/api/mentor/teams/grade', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    eventId,
                    qrCode: gradingQRCode,
                    scoringRoundId: gradingRoundId,
                    score,
                    notes: gradingNotes || undefined
                })
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Failed to submit grade');
            }

            // Reset form
            setGradingQRCode('');
            setGradingScore('');
            setGradingNotes('');
            setGradingRoundId('');
            setError('');

            alert('Grade submitted successfully!');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to submit grade');
        }
    };



    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="text-center">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                    <p className="mt-2 text-slate-600">Loading team scores...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 md:space-y-8">
            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">
                    {error}
                </div>
            )}

            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 space-y-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                        <p className="text-xs uppercase tracking-wide text-slate-500">Dashboard</p>
                        <h1 className="text-2xl font-semibold text-slate-900">Organizer Dashboard</h1>
                        <p className="text-slate-600 mt-1">Track team performance across evaluation rounds</p>
                    </div>
                </div>

                {/* No Rounds Available State */}
                {dashboardData && dashboardData.rounds.length === 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                        <div className="flex items-center justify-between">
                            <p className="text-amber-900 font-medium">
                                No scoring rounds available. Create rounds to begin tracking team scores.
                            </p>
                            {isOrganizer && (
                                <button
                                    onClick={() => setShowNewRoundForm(!showNewRoundForm)}
                                    className="px-3 py-2 rounded-full text-sm font-medium border bg-emerald-600 text-white border-emerald-600 shadow-sm hover:bg-emerald-700 transition"
                                >
                                    + Create Round
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {/* Navigation Buttons - Only for Organizers */}
                {isOrganizer && dashboardData && dashboardData.rounds.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                        <button
                            onClick={() => setShowRoundView(false)}
                            className={`px-3 py-2 rounded-full text-sm font-medium border transition ${!showRoundView
                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-200'
                                }`}
                        >
                            Overall Leaderboard
                        </button>
                        <button
                            onClick={() => setShowRoundView(true)}
                            className={`px-3 py-2 rounded-full text-sm font-medium border transition ${showRoundView
                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-200'
                                }`}
                        >
                            By Round
                        </button>
                        <button
                            onClick={() => setShowNewRoundForm(!showNewRoundForm)}
                            className="px-3 py-2 rounded-full text-sm font-medium border bg-emerald-600 text-white border-emerald-600 shadow-sm hover:bg-emerald-700 transition ml-auto"
                        >
                            + Create Round
                        </button>
                    </div>
                )}
            </div>

            {/* Create New Round Form - Only for Organizers */}
            {isOrganizer && showNewRoundForm && (
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 space-y-5">
                    <h2 className="text-xl font-semibold text-slate-900">Create New Scoring Round</h2>
                    <form onSubmit={handleCreateRound} className="space-y-5">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">Round Name</label>
                            <input
                                type="text"
                                value={newRoundName}
                                onChange={(e) => setNewRoundName(e.target.value)}
                                placeholder="e.g., Round 1 Review, Final Review"
                                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm shadow-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition"
                            />
                        </div>
                        <div className="flex gap-3 pt-2">
                            <button
                                type="submit"
                                disabled={creatingRound || !newRoundName.trim()}
                                className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed font-medium text-sm shadow-sm transition"
                            >
                                {creatingRound ? 'Creating...' : 'Create Round'}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setShowNewRoundForm(false);
                                    setNewRoundName('');
                                }}
                                className="px-4 py-2.5 bg-slate-600 text-white rounded-xl hover:bg-slate-700 font-medium text-sm shadow-sm transition"
                            >
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Mentor Grading Interface */}
            {isMentor && (
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 space-y-5">
                    <h2 className="text-xl font-semibold text-slate-900">Grade Team</h2>

                    {dashboardData && dashboardData.rounds.length === 0 ? (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                            <div className="flex items-center justify-between">
                                <p className="text-amber-900 font-medium">
                                    {isOrganizer
                                        ? 'No scoring rounds available. Create a round above to begin grading.'
                                        : 'No scoring rounds available. Ask the organizer to create rounds first.'}
                                </p>
                            </div>
                        </div>
                    ) : (
                        <form onSubmit={handleGradeSubmit} className="space-y-5">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">Scoring Round</label>
                                <select
                                    value={gradingRoundId}
                                    onChange={(e) => setGradingRoundId(e.target.value)}
                                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm shadow-sm focus:outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100 transition"
                                >
                                    <option value="">Select a round...</option>
                                    {dashboardData?.rounds.map((round) => (
                                        <option key={round.id} value={round.id}>
                                            {round.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">Team Member QR Code</label>
                                <input
                                    type="text"
                                    value={gradingQRCode}
                                    onChange={(e) => setGradingQRCode(e.target.value)}
                                    placeholder="Scan or enter QR code"
                                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm shadow-sm focus:outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100 transition"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">Score</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={gradingScore}
                                    onChange={(e) => setGradingScore(e.target.value)}
                                    placeholder="Enter score"
                                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm shadow-sm focus:outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100 transition"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">Notes (Optional)</label>
                                <textarea
                                    value={gradingNotes}
                                    onChange={(e) => setGradingNotes(e.target.value)}
                                    placeholder="Add any comments about the team's performance"
                                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm shadow-sm focus:outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100 transition"
                                    rows={3}
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={!gradingQRCode || !gradingRoundId || !gradingScore}
                                className="w-full px-4 py-2.5 bg-rose-600 text-white rounded-xl hover:bg-rose-700 disabled:bg-slate-300 disabled:cursor-not-allowed font-medium text-sm shadow-sm transition"
                            >
                                Submit Grade
                            </button>
                        </form>
                    )}
                </div>
            )}

            {/* Overall Leaderboard View - Only for Organizers */}
            {isOrganizer && !showRoundView && dashboardData && (
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
                    <h2 className="text-xl font-semibold text-slate-900 mb-5">Overall Leaderboard</h2>

                    {dashboardData.leaderboard.length === 0 ? (
                        <p className="text-slate-600">No teams yet</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-slate-50 border-b border-slate-200">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-sm font-medium text-slate-700">Rank</th>
                                        <th className="px-4 py-3 text-left text-sm font-medium text-slate-700">Team Name</th>
                                        <th className="px-4 py-3 text-right text-sm font-medium text-slate-700">Members</th>
                                        {dashboardData.rounds.map((round) => (
                                            <th key={round.id} className="px-4 py-3 text-right text-sm font-medium text-slate-700">
                                                {round.name}
                                            </th>
                                        ))}
                                        <th className="px-4 py-3 text-right text-sm font-medium text-slate-700">Total Score</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {dashboardData.leaderboard.map((entry, idx) => (
                                        <tr key={entry.team.id} className="border-b border-slate-200 hover:bg-slate-50 transition">
                                            <td className="px-4 py-3 font-bold text-lg text-slate-900">#{idx + 1}</td>
                                            <td className="px-4 py-3 font-semibold text-slate-900">{entry.team.name}</td>
                                            <td className="px-4 py-3 text-right text-sm text-slate-600">
                                                {entry.team.memberIds.length} members
                                            </td>
                                            {dashboardData.rounds.map((round) => {
                                                const score = entry.scores.find((s) => s.scoringRoundId === round.id);
                                                return (
                                                    <td key={round.id} className="px-4 py-3 text-right">
                                                        {score && score.score !== undefined ? (
                                                            <span className="inline-block bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-sm font-medium">
                                                                {score.score.toFixed(2)}
                                                            </span>
                                                        ) : (
                                                            <span className="text-slate-400">—</span>
                                                        )}
                                                    </td>
                                                );
                                            })}
                                            <td className="px-4 py-3 text-right font-bold bg-amber-50">
                                                {entry.totalScore.toFixed(2)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Round-Specific View - Only for Organizers */}
            {isOrganizer && showRoundView && dashboardData && dashboardData.rounds.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
                    <h2 className="text-xl font-semibold text-slate-900 mb-5">Scores by Round</h2>

                    <div className="mb-6">
                        <label className="block text-sm font-medium text-slate-700 mb-2">Select Round:</label>
                        <select
                            value={selectedRound}
                            onChange={(e) => setSelectedRound(e.target.value)}
                            className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm shadow-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition"
                        >
                            {dashboardData.rounds.map((round) => (
                                <option key={round.id} value={round.id}>
                                    {round.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Grading Progress */}
                    <div className="mb-6 bg-slate-50 rounded-xl p-4 border border-slate-200">
                        <h3 className="text-sm font-medium text-slate-900 mb-3">Grading Progress</h3>

                        {/* Current Round Progress */}
                        <div className="mb-4">
                            <div className="flex justify-between text-sm mb-1">
                                <span className="font-medium text-indigo-700">
                                    {dashboardData.rounds.find(r => r.id === selectedRound)?.name}
                                </span>
                                <span className="text-slate-600">
                                    {roundScores.filter(s => s.score !== undefined).length} / {dashboardData.leaderboard.length} teams
                                </span>
                            </div>
                            <div className="w-full bg-slate-200 rounded-full h-2.5">
                                <div
                                    className="bg-indigo-600 h-2.5 rounded-full transition-all duration-500"
                                    style={{ width: `${(roundScores.filter(s => s.score !== undefined).length / Math.max(dashboardData.leaderboard.length, 1)) * 100}%` }}
                                ></div>
                            </div>
                        </div>

                        {/* Other Rounds Summary */}
                        {dashboardData.rounds.length > 1 && (
                            <div className="space-y-2 pt-2 border-t border-slate-200">
                                {dashboardData.rounds
                                    .filter(r => r.id !== selectedRound)
                                    .map(round => {
                                        const gradedCount = dashboardData.leaderboard.filter(entry =>
                                            entry.scores.some(s => s.scoringRoundId === round.id && s.score !== undefined)
                                        ).length;
                                        const total = dashboardData.leaderboard.length;
                                        const percent = Math.round((gradedCount / Math.max(total, 1)) * 100);

                                        return (
                                            <div key={round.id} className="flex items-center justify-between text-xs text-slate-500">
                                                <span>{round.name}</span>
                                                <div className="flex items-center gap-2">
                                                    <div className="w-16 bg-slate-200 rounded-full h-1.5">
                                                        <div
                                                            className="bg-slate-400 h-1.5 rounded-full"
                                                            style={{ width: `${percent}%` }}
                                                        ></div>
                                                    </div>
                                                    <span>{gradedCount}/{total}</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                            </div>
                        )}
                    </div>

                    {roundScores.length === 0 ? (
                        <p className="text-slate-600">No teams graded for this round yet</p>
                    ) : (
                        <div className="space-y-4">
                            {roundScores.map((score, idx) => (
                                <div key={score.id} className="border border-slate-200 rounded-xl p-4 bg-slate-50">
                                    {editingScoreId === score.id ? (
                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between">
                                                <h3 className="font-bold text-lg text-slate-900">
                                                    #{idx + 1} {score.team?.name}
                                                </h3>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-slate-700 mb-1">Score</label>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    value={editScoreValue}
                                                    onChange={(e) => setEditScoreValue(e.target.value)}
                                                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-slate-700 mb-1">Notes</label>
                                                <textarea
                                                    value={editNotesValue}
                                                    onChange={(e) => setEditNotesValue(e.target.value)}
                                                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                                    rows={2}
                                                />
                                            </div>
                                            <div className="flex gap-2 justify-end">
                                                <button
                                                    onClick={handleCancelEdit}
                                                    className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition"
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    onClick={() => handleSaveEdit(score)}
                                                    className="px-3 py-1.5 text-sm bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg transition"
                                                >
                                                    Save
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="flex items-center justify-between mb-2">
                                                <div>
                                                    <h3 className="font-bold text-lg text-slate-900">
                                                        #{idx + 1} {score.team?.name}
                                                    </h3>
                                                    <p className="text-sm text-slate-600">
                                                        {score.team?.memberIds.length} members
                                                    </p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-3xl font-bold text-indigo-600">
                                                        {score.score !== undefined ? score.score.toFixed(2) : '—'}
                                                    </p>
                                                </div>
                                            </div>
                                            {score.notes && (
                                                <p className="text-sm text-slate-700 bg-white p-2 rounded-lg italic border border-slate-200">
                                                    &quot;{score.notes}&quot;
                                                </p>
                                            )}
                                            <div className="flex items-center justify-between mt-2">
                                                {score.gradedAt && (
                                                    <p className="text-xs text-slate-500">
                                                        Graded at {new Date(score.gradedAt).toLocaleString()}
                                                    </p>
                                                )}
                                                {isOrganizer && (
                                                    <button
                                                        onClick={() => handleEditClick(score)}
                                                        className="text-xs font-medium text-indigo-600 hover:text-indigo-800 ml-auto"
                                                    >
                                                        Edit
                                                    </button>
                                                )}
                                            </div>
                                        </>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}


                </div>
            )}

            {/* Summary Statistics - Only for Organizers */}
            {isOrganizer && dashboardData && !showRoundView && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
                        <p className="text-slate-600 text-sm font-medium">Total Teams</p>
                        <p className="text-3xl font-bold text-slate-900 mt-2">{dashboardData.leaderboard.length}</p>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
                        <p className="text-slate-600 text-sm font-medium">Total Rounds</p>
                        <p className="text-3xl font-bold text-slate-900 mt-2">{dashboardData.rounds.length}</p>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
                        <p className="text-slate-600 text-sm font-medium">Total Participants</p>
                        <p className="text-3xl font-bold text-slate-900 mt-2">
                            {dashboardData.leaderboard.reduce(
                                (sum, entry) => sum + entry.team.memberIds.length,
                                0
                            )}
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
