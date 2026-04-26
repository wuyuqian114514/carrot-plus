/**
 * Wrapper for all useful contest data.
 */
export class Contest {
  constructor(contest, problems, rows, ratingChanges, oldRatings, fetchTime, isRated) {
    this.contest = contest;
    this.problems = problems;
    this.rows = rows;
    this.ratingChanges = ratingChanges; // undefined if isRated is not YES
    this.oldRatings = oldRatings; // undefined if isRated is not YES
    this.fetchTime = fetchTime;
    this.isRated = isRated;
    this.performances = null;  // To be populated by someone who calculates the performances.
  }
}

Contest.IsRated = {
  YES: 'YES',
  NO: 'NO',
  LIKELY: 'LIKELY',
};

const MAGIC_CACHE_DURATION = 5 * 60 * 1000; // 5 mins
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 1 day; this should never change when magic is off tbh
const RATING_PENDING_MAX_DAYS = 3;

function isOldContest(contest) {
  const daysSinceContestEnd =
    (Date.now() / 1000 - contest.startTimeSeconds - contest.durationSeconds) / (60 * 60 * 24);
  return daysSinceContestEnd > RATING_PENDING_MAX_DAYS;
}

function valid(fetchTime) {
  let now = new Date();
  // Assume Codeforces Magic lasts from 24 Dec to 11 Jan.
  // https://codeforces.com/blog/entry/110477
  const isMagic =
         now.getMonth() === 11 && now.getDate() >= 24
      || now.getMonth() === 0 && now.getDate() <= 11;

  const duration = isMagic ? MAGIC_CACHE_DURATION : CACHE_DURATION;
  return now.getTime() < fetchTime + duration;
}

async function fetchContestData(api, contestId) {
  try {
    return await api.contestStandings(contestId);
  } catch (er) {
    if (!shouldRebuildStandings(er)) {
      throw er;
    }
    console.warn('[Carrot] contest.standings failed, rebuilding from contest.status: %o', er);
    return await rebuildStandingsFromStatus(api, contestId);
  }
}

function shouldRebuildStandings(er) {
  const message = (er && er.message || '').toLowerCase();
  return message.includes('authenticated')
      || message.includes('cloudflare')
      || message.includes('human check')
      || message.includes('invalid json');
}

async function rebuildStandingsFromStatus(api, contestId) {
  const contest = await fetchContest(api, contestId);
  const submissions = await fetchAllContestSubmissions(api, contestId, contest.durationSeconds);
  const problemsByIndex = new Map();
  const submissionsByParty = new Map();
  const parties = new Map();

  for (const submission of submissions) {
    const problem = submission.problem;
    if (!problem || !problem.index) {
      continue;
    }
    problemsByIndex.set(problem.index, problem);
    const key = getPartyKey(submission.author);
    parties.set(key, submission.author);
    if (!submissionsByParty.has(key)) {
      submissionsByParty.set(key, []);
    }
    submissionsByParty.get(key).push(submission);
  }

  const rows = [];
  for (const [key, partySubmissions] of submissionsByParty.entries()) {
    const row = buildRow(parties.get(key), partySubmissions, contest);
    rows.push(row);
  }

  if (contest.type === 'CF') {
    await applyHackScores(api, contestId, parties, rows);
  }

  rows.sort((a, b) => a.points !== b.points ? b.points - a.points : a.penalty - b.penalty);

  return {
    contest,
    problems: Array.from(problemsByIndex.values()).sort((a, b) => a.index.localeCompare(b.index)),
    rows,
  };
}

async function fetchContest(api, contestId) {
  const contests = await api.contestList(false);
  const contest = contests.find((c) => c.id == contestId);
  if (!contest) {
    throw new Error(`Contest ${contestId} not found`);
  }
  return contest;
}

async function fetchAllContestSubmissions(api, contestId, durationSeconds) {
  const pageSize = 10000;
  let from = 1;
  const submissions = [];
  while (true) {
    const page = await api.contestStatus(contestId, from, pageSize);
    for (const submission of page) {
      if (isOfficialContestSubmission(submission, durationSeconds)) {
        submissions.push(submission);
      }
    }
    if (page.length < pageSize) {
      break;
    }
    from += pageSize;
  }
  return submissions;
}

function isOfficialContestSubmission(submission, durationSeconds) {
  const author = submission.author || {};
  const relative = submission.relativeTimeSeconds;
  return author.participantType === 'CONTESTANT'
      && !author.ghost
      && Number.isInteger(relative)
      && relative >= 0
      && relative <= durationSeconds;
}

function getPartyKey(party) {
  if (party.participantId != null) {
    return String(party.participantId);
  }
  return (party.members || []).map((m) => m.handle).sort().join(',');
}

function buildRow(party, submissions, contest) {
  const byProblem = new Map();
  for (const submission of submissions) {
    const index = submission.problem.index;
    if (!byProblem.has(index)) {
      byProblem.set(index, []);
    }
    byProblem.get(index).push(submission);
  }

  let points = 0;
  let penalty = 0;
  for (const problemSubmissions of byProblem.values()) {
    const result = scoreProblem(problemSubmissions, contest);
    points += result.points;
    penalty += result.penalty;
  }
  return { party, points, penalty };
}

function scoreProblem(problemSubmissions, contest) {
  problemSubmissions.sort((a, b) =>
    a.creationTimeSeconds !== b.creationTimeSeconds
      ? a.creationTimeSeconds - b.creationTimeSeconds
      : a.id - b.id);

  let wrongBeforeAccepted = 0;
  let accepted = null;
  for (const submission of problemSubmissions) {
    if (submission.verdict === 'OK') {
      accepted = submission;
      break;
    }
    if (countsAsWrongAttempt(submission)) {
      wrongBeforeAccepted += 1;
    }
  }
  if (!accepted) {
    return { points: 0, penalty: 0 };
  }

  const minute = Math.trunc(accepted.relativeTimeSeconds / 60);
  if (contest.type === 'ICPC') {
    return { points: 1, penalty: minute + 10 * wrongBeforeAccepted };
  }

  const maxPoints = accepted.problem.points || 0;
  const durationMinutes = contest.durationSeconds / 60;
  const timePenalty = Math.floor(120 * maxPoints * minute / (250 * durationMinutes));
  const score = Math.max(0.3 * maxPoints, maxPoints - timePenalty) - 50 * wrongBeforeAccepted;
  return { points: score, penalty: minute };
}

function countsAsWrongAttempt(submission) {
  if (submission.verdict === undefined
      || submission.verdict === 'OK'
      || submission.verdict === 'COMPILATION_ERROR') {
    return false;
  }
  if (submission.verdict === 'HACKED' || submission.verdict === 'SKIPPED') {
    return true;
  }
  return (submission.passedTestCount || 0) > 0;
}

async function applyHackScores(api, contestId, parties, rows) {
  let hacks;
  try {
    hacks = await api.contestHacks(contestId);
  } catch (_) {
    return;
  }

  const rowsByParty = new Map(rows.map((row) => [getPartyKey(row.party), row]));
  for (const hack of hacks) {
    const hacker = hack.hacker || {};
    if (hacker.participantType !== 'CONTESTANT' || hacker.ghost) {
      continue;
    }
    const key = getPartyKey(hacker);
    let row = rowsByParty.get(key);
    if (!row) {
      row = { party: hacker, points: 0, penalty: 0 };
      rowsByParty.set(key, row);
      parties.set(key, hacker);
      rows.push(row);
    }
    if (hack.verdict === 'HACK_SUCCESSFUL') {
      row.points += 100;
    } else if (hack.verdict === 'HACK_UNSUCCESSFUL') {
      row.points -= 50;
    }
  }
}

const MAX_FINISHED_CONTESTS_TO_CACHE = 15;
const CONTESTS_COMPLETE_KEY = 'cache.contests_complete';

/**
 * Fetches complete contest information from the API. Caches finished contests.
 */
export class ContestsComplete {
  constructor(api, storage) {
    this.api = api;
    this.storage = storage;
  }

  async fetch(contestId) {
    const [contestMap, contestMapIds] = await this.storage.get(CONTESTS_COMPLETE_KEY, [{}, []]);
    const cachedContest = contestMap[contestId];
    if (cachedContest !== undefined && valid(cachedContest.fetchTime)) {
      return cachedContest;
    }

    const { contest, problems, rows } = await fetchContestData(this.api, contestId);
    let ratingChanges;
    let oldRatings;
    let isRated = Contest.IsRated.LIKELY;
    const fetchTime = Date.now();
    if (contest.phase === 'FINISHED') {
      try {
        ratingChanges = await this.api.contestRatingChanges(contestId);
        if (ratingChanges) {
          if (ratingChanges.length > 0) {
            isRated = Contest.IsRated.YES;
            oldRatings = adjustOldRatings(contestId, ratingChanges);
          } else {
            ratingChanges = undefined; // Reset to undefined if it was an empty array
          }
        }
      } catch (er) {
        if (er.message.includes('Rating changes are unavailable for this contest')) {
          isRated = Contest.IsRated.NO;
        } else {
          throw er;
        }
      }
    }
    if (isRated === Contest.IsRated.LIKELY && isOldContest(contest)) {
      isRated = Contest.IsRated.NO;
    }
    const isFinished = isRated === Contest.IsRated.NO || isRated === Contest.IsRated.YES;

    const c = new Contest(contest, problems, rows, ratingChanges, oldRatings, fetchTime, isRated);

    // If the contest is finished, the contest data doesn't change so cache it.
    // The exception is during new year's magic, when people change handles and handles on the
    // ranklist can become outdated. So cache it only for a small duration.
    // TODO: New users can also change handles upto a week(?) after joining. Is this a big enough
    // issue to stop caching completely?
    if (isFinished) {
      contestMap[contestId] = c;
      contestMapIds.push(contestId);
      if (contestMapIds.length > MAX_FINISHED_CONTESTS_TO_CACHE) {
        const oldestId = contestMapIds.shift();
        delete contestMap[oldestId];
      }
      await this.storage.set(CONTESTS_COMPLETE_KEY, [contestMap, contestMapIds]);
    }

    return c;
  }
}

const FAKE_RATINGS_SINCE_CONTEST = 1360;
const NEW_DEFAULT_RATING = 1400;

function adjustOldRatings(contestId, ratingChanges) {
  const oldRatings = {};
  if (contestId < FAKE_RATINGS_SINCE_CONTEST) {
    for (const change of ratingChanges) {
      oldRatings[change.handle] = change.oldRating;
    }
  } else {
    for (const change of ratingChanges) {
      oldRatings[change.handle] = change.oldRating == 0 ? NEW_DEFAULT_RATING : change.oldRating;
    }
    // Note: This a band-aid for CF's fake ratings (see Github #18).
    // If CF tells us that a user had rating 0, we consider that the user is in fact unrated.
    // This unfortunately means that a user who truly has rating 0 will be considered to have
    // DEFAULT_RATING, but such cases are unlikely compared to the regular presence of unrated
    // users.
  }
  return oldRatings;
}
