import { turso } from './client';
import { Team, ScoringRound, TeamScore, TeamWithMembers, TeamScoreWithRound } from '@/types';
import { getUserById } from './user';

// Ensure tables exist
async function ensureTablesExist() {
    try {
        // Check if teams table exists
        const checkTeamsTable = await turso.execute(`
            SELECT name FROM sqlite_master WHERE type='table' AND name='teams'
        `);

        if (checkTeamsTable.rows.length === 0) {
            // Create teams table
            await turso.execute(`
                CREATE TABLE IF NOT EXISTS teams (
                    id TEXT PRIMARY KEY,
                    event_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    member_ids TEXT NOT NULL,
                    created_by TEXT NOT NULL,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL,
                    FOREIGN KEY (event_id) REFERENCES events(id),
                    FOREIGN KEY (created_by) REFERENCES users(id)
                )
            `);
        }

        // Check if scoring_rounds table exists
        const checkRoundsTable = await turso.execute(`
            SELECT name FROM sqlite_master WHERE type='table' AND name='scoring_rounds'
        `);

        if (checkRoundsTable.rows.length === 0) {
            // Create scoring_rounds table
            await turso.execute(`
                CREATE TABLE IF NOT EXISTS scoring_rounds (
                    id TEXT PRIMARY KEY,
                    event_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    round_number INTEGER NOT NULL,
                    grading_form_schema TEXT,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL,
                    FOREIGN KEY (event_id) REFERENCES events(id)
                )
            `);
        }

        // Check if team_scores table exists
        const checkScoresTable = await turso.execute(`
            SELECT name FROM sqlite_master WHERE type='table' AND name='team_scores'
        `);

        if (checkScoresTable.rows.length === 0) {
            // Create team_scores table
            await turso.execute(`
                CREATE TABLE IF NOT EXISTS team_scores (
                    id TEXT PRIMARY KEY,
                    team_id TEXT NOT NULL,
                    scoring_round_id TEXT NOT NULL,
                    score REAL,
                    form_responses TEXT,
                    graded_by TEXT,
                    graded_at INTEGER,
                    notes TEXT,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL,
                    FOREIGN KEY (team_id) REFERENCES teams(id),
                    FOREIGN KEY (scoring_round_id) REFERENCES scoring_rounds(id),
                    FOREIGN KEY (graded_by) REFERENCES users(id)
                )
            `);
        }
    } catch (error) {
        console.error('Error ensuring tables exist:', error);
    }
}

// Helper to convert database row to Team object
function rowToTeam(row: Record<string, unknown>): Team {
    return {
        id: row.id as string,
        eventId: row.event_id as string,
        name: row.name as string,
        memberIds: JSON.parse(row.member_ids as string),
        createdBy: row.created_by as string,
        createdAt: new Date(row.created_at as number),
        updatedAt: new Date(row.updated_at as number)
    };
}

// Helper to convert database row to ScoringRound object
function rowToScoringRound(row: Record<string, unknown>): ScoringRound {
    return {
        id: row.id as string,
        eventId: row.event_id as string,
        name: row.name as string,
        roundNumber: row.round_number as number,
        createdAt: new Date(row.created_at as number),
        updatedAt: new Date(row.updated_at as number)
    };
}

// Helper to convert database row to TeamScore object
function rowToTeamScore(row: Record<string, unknown>): TeamScore {
    return {
        id: row.id as string,
        teamId: row.team_id as string,
        scoringRoundId: row.scoring_round_id as string,
        score: row.score !== null ? (row.score as number) : undefined,
        gradedBy: row.graded_by as string | undefined,
        gradedAt: row.graded_at ? new Date(row.graded_at as number) : undefined,
        notes: row.notes as string | undefined,
        createdAt: new Date(row.created_at as number),
        updatedAt: new Date(row.updated_at as number)
    };
}

// ============ TEAM OPERATIONS ============

// Create a new team
export async function createTeam(
    eventId: string,
    name: string,
    memberIds: string[],
    createdBy: string
): Promise<Team> {
    await ensureTablesExist();
    const now = Date.now();
    const id = crypto.randomUUID();

    await turso.execute({
        sql: `
      INSERT INTO teams (id, event_id, name, member_ids, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
        args: [id, eventId, name, JSON.stringify(memberIds), createdBy, now, now]
    });

    return {
        id,
        eventId,
        name,
        memberIds,
        createdBy,
        createdAt: new Date(now),
        updatedAt: new Date(now)
    };
}

// Get team by ID
export async function getTeamById(id: string): Promise<Team | null> {
    await ensureTablesExist();
    const result = await turso.execute({
        sql: `SELECT * FROM teams WHERE id = ?`,
        args: [id]
    });

    if (result.rows.length === 0) {
        return null;
    }

    return rowToTeam(result.rows[0]);
}

// Get team by any member's QR code (registration)
export async function getTeamByMemberRegistration(registrationId: string): Promise<Team | null> {
    await ensureTablesExist();
    // First, get the registration to find the user
    const regResult = await turso.execute({
        sql: `SELECT user_id FROM registrations WHERE id = ?`,
        args: [registrationId]
    });

    if (regResult.rows.length === 0) {
        return null;
    }

    const userId = regResult.rows[0].user_id as string;

    // Find team that has this user
    const teamResult = await turso.execute({
        sql: `SELECT * FROM teams WHERE member_ids LIKE ?`,
        args: [`%"${userId}"%`]
    });

    if (teamResult.rows.length === 0) {
        return null;
    }

    return rowToTeam(teamResult.rows[0]);
}

// Get all teams for an event
export async function getEventTeams(eventId: string): Promise<Team[]> {
    await ensureTablesExist();
    const result = await turso.execute({
        sql: `SELECT * FROM teams WHERE event_id = ? ORDER BY created_at DESC`,
        args: [eventId]
    });

    return result.rows.map(rowToTeam);
}

// Get teams with member details
export async function getTeamsWithMembers(eventId: string): Promise<TeamWithMembers[]> {
    const teams = await getEventTeams(eventId);

    const teamsWithMembers: TeamWithMembers[] = [];

    for (const team of teams) {
        const members = [];
        for (const memberId of team.memberIds) {
            const user = await getUserById(memberId);
            if (user) {
                members.push(user);
            }
        }

        const createdBy = await getUserById(team.createdBy);

        teamsWithMembers.push({
            ...team,
            members,
            createdByName: createdBy?.name
        });
    }

    return teamsWithMembers;
}

// Update team name
export async function updateTeamName(teamId: string, name: string): Promise<Team | null> {
    const now = Date.now();

    await turso.execute({
        sql: `UPDATE teams SET name = ?, updated_at = ? WHERE id = ?`,
        args: [name, now, teamId]
    });

    return getTeamById(teamId);
}

// Update team members
export async function updateTeamMembers(teamId: string, memberIds: string[]): Promise<Team | null> {
    const now = Date.now();

    await turso.execute({
        sql: `UPDATE teams SET member_ids = ?, updated_at = ? WHERE id = ?`,
        args: [JSON.stringify(memberIds), now, teamId]
    });

    return getTeamById(teamId);
}

// ============ SCORING ROUND OPERATIONS ============

// Create a new scoring round
export async function createScoringRound(
    eventId: string,
    name: string,
    roundNumber: number
): Promise<ScoringRound> {
    await ensureTablesExist();
    const now = Date.now();
    const id = crypto.randomUUID();

    await turso.execute({
        sql: `
            INSERT INTO scoring_rounds (id, event_id, name, round_number, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
    `,
        args: [id, eventId, name, roundNumber, now, now]
    });

    return {
        id,
        eventId,
        name,
        roundNumber,
        createdAt: new Date(now),
        updatedAt: new Date(now)
    };
}

// Get scoring round by ID
export async function getScoringRoundById(id: string): Promise<ScoringRound | null> {
    await ensureTablesExist();
    const result = await turso.execute({
        sql: `SELECT * FROM scoring_rounds WHERE id = ?`,
        args: [id]
    });

    if (result.rows.length === 0) {
        return null;
    }

    return rowToScoringRound(result.rows[0]);
}

// Get all scoring rounds for an event
export async function getEventScoringRounds(eventId: string): Promise<ScoringRound[]> {
    await ensureTablesExist();
    const result = await turso.execute({
        sql: `SELECT * FROM scoring_rounds WHERE event_id = ? ORDER BY round_number ASC`,
        args: [eventId]
    });

    return result.rows.map(rowToScoringRound);
}

// Delete scoring round
export async function deleteScoringRound(roundId: string): Promise<boolean> {
    await ensureTablesExist();
    // First delete all team scores for this round
    await turso.execute({
        sql: `DELETE FROM team_scores WHERE scoring_round_id = ?`,
        args: [roundId]
    });

    // Then delete the round
    await turso.execute({
        sql: `DELETE FROM scoring_rounds WHERE id = ?`,
        args: [roundId]
    });

    return true;
}

// ============ TEAM SCORE OPERATIONS ============

// Create or get team score entry for a team in a round
export async function getOrCreateTeamScore(
    teamId: string,
    scoringRoundId: string
): Promise<TeamScore> {
    await ensureTablesExist();
    // Check if already exists
    const result = await turso.execute({
        sql: `SELECT * FROM team_scores WHERE team_id = ? AND scoring_round_id = ?`,
        args: [teamId, scoringRoundId]
    });

    if (result.rows.length > 0) {
        return rowToTeamScore(result.rows[0]);
    }

    // Create new entry
    const now = Date.now();
    const id = crypto.randomUUID();

    await turso.execute({
        sql: `
      INSERT INTO team_scores (id, team_id, scoring_round_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `,
        args: [id, teamId, scoringRoundId, now, now]
    });

    return {
        id,
        teamId,
        scoringRoundId,
        createdAt: new Date(now),
        updatedAt: new Date(now)
    };
}

// Grade a team for a round
export async function gradeTeam(
    teamId: string,
    scoringRoundId: string,
    score: number,
    gradedBy: string,
    notes?: string
): Promise<TeamScore> {
    const now = Date.now();

    // Get or create the score entry first
    await getOrCreateTeamScore(teamId, scoringRoundId);

    // Update the score
    await turso.execute({
        sql: `
      UPDATE team_scores 
      SET score = ?, graded_by = ?, graded_at = ?, notes = ?, updated_at = ?
      WHERE team_id = ? AND scoring_round_id = ?
    `,
        args: [score, gradedBy, now, notes || null, now, teamId, scoringRoundId]
    });

    // Fetch and return the updated score
    const result = await turso.execute({
        sql: `SELECT * FROM team_scores WHERE team_id = ? AND scoring_round_id = ?`,
        args: [teamId, scoringRoundId]
    });

    return rowToTeamScore(result.rows[0]);
}

// Get team score for a round
export async function getTeamScore(teamId: string, scoringRoundId: string): Promise<TeamScore | null> {
    await ensureTablesExist();
    const result = await turso.execute({
        sql: `SELECT * FROM team_scores WHERE team_id = ? AND scoring_round_id = ?`,
        args: [teamId, scoringRoundId]
    });

    if (result.rows.length === 0) {
        return null;
    }

    return rowToTeamScore(result.rows[0]);
}

// Get all scores for a team
export async function getTeamAllScores(teamId: string): Promise<TeamScoreWithRound[]> {
    await ensureTablesExist();
    const result = await turso.execute({
        sql: `
      SELECT ts.*, sr.id as round_id, sr.event_id, sr.name as round_name, sr.round_number
      FROM team_scores ts
      JOIN scoring_rounds sr ON ts.scoring_round_id = sr.id
      WHERE ts.team_id = ?
      ORDER BY sr.round_number ASC
    `,
        args: [teamId]
    });

    const scores: TeamScoreWithRound[] = [];
    for (const row of result.rows) {
        scores.push({
            ...rowToTeamScore(row),
            round: {
                id: row.round_id as string,
                eventId: row.event_id as string,
                name: row.round_name as string,
                roundNumber: row.round_number as number,
                createdAt: new Date(0),
                updatedAt: new Date(0)
            }
        });
    }

    return scores;
}

// Get all scores for a round (for dashboard)
export async function getRoundAllScores(roundId: string): Promise<TeamScoreWithRound[]> {
    await ensureTablesExist();
    const result = await turso.execute({
        sql: `
      SELECT ts.*, t.id as team_id, t.name as team_name, t.event_id, t.member_ids
      FROM team_scores ts
      JOIN teams t ON ts.team_id = t.id
      WHERE ts.scoring_round_id = ?
      ORDER BY ts.score DESC NULLS LAST, t.name ASC
    `,
        args: [roundId]
    });

    const scores: TeamScoreWithRound[] = [];
    for (const row of result.rows) {
        scores.push({
            ...rowToTeamScore(row),
            team: {
                id: row.team_id as string,
                eventId: row.event_id as string,
                name: row.team_name as string,
                memberIds: JSON.parse(row.member_ids as string),
                createdBy: '',
                createdAt: new Date(0),
                updatedAt: new Date(0)
            }
        });
    }

    return scores;
}

// Get leaderboard for an event across all rounds
export async function getEventLeaderboard(eventId: string): Promise<Array<{
    team: Team;
    scores: TeamScore[];
    totalScore: number;
}>> {
    const teams = await getEventTeams(eventId);
    const leaderboard = [];

    for (const team of teams) {
        const allScores = await getTeamAllScores(team.id);
        const scores = allScores.map(ts => ({
            id: ts.id,
            teamId: ts.teamId,
            scoringRoundId: ts.scoringRoundId,
            score: ts.score,
            gradedBy: ts.gradedBy,
            gradedAt: ts.gradedAt,
            notes: ts.notes,
            createdAt: ts.createdAt,
            updatedAt: ts.updatedAt
        }));

        const totalScore = scores.reduce((sum, score) => sum + (score.score || 0), 0);

        leaderboard.push({
            team,
            scores,
            totalScore
        });
    }

    // Sort by total score descending
    leaderboard.sort((a, b) => b.totalScore - a.totalScore);

    return leaderboard;
}
