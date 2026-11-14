export type GameType = 'rps' | 'guess' | 'ttt';
export type ActiveView =
  | 'dashboard'
  | 'rps'
  | 'guess'
  | 'ttt'
  | 'multiplayer'
  | 'link-preview'
  | 'profile'
  | 'settings';

export interface UserSettings {
  soundEnabled: boolean;
  musicEnabled: boolean;
  animationsEnabled: boolean;
  theme: 'dark' | 'light';
  privacyPublicProfile: boolean;
  privacyShowActivity: boolean;
}

export interface UserStats {
  totalGames: number;
  totalWins: number;
  totalLosses: number;
  totalDraws: number;
  winRate: number;
  highestScore: number;
  perGame: {
    rps: { played: number; wins: number; highScore: number };
    guess: { played: number; wins: number; highScore: number };
    ttt: { played: number; wins: number; highScore: number };
  };
}

export interface UserProfile {
  id: string;
  email: string;
  username: string;
  avatarUrl: string;
  emailVerified: boolean;
  hasPassword: boolean;
  xp: number;
  level: number;
  currentLevelXp: number;
  nextLevelXp: number;
  coins: number;
  currentStreak: number;
  bestStreak: number;
  settings: UserSettings;
  stats: UserStats;
  createdAt: string;
}

export interface MatchRecord {
  id: string;
  gameType: GameType;
  mode: 'ai' | 'local' | 'online';
  difficulty: string;
  opponentName: string;
  result: 'win' | 'loss' | 'draw';
  score: number;
  xpEarned: number;
  coinsEarned: number;
  detailsJson: string | null;
  createdAt: string;
}

export interface AchievementItem {
  key: string;
  title: string;
  description: string;
  category: string;
  rewardCoins: number;
  unlocked: boolean;
  unlockedAt: string | null;
}

export interface LeaderboardEntry {
  rank: number;
  id: string;
  username: string;
  avatarUrl: string;
  xp: number;
  level: number;
  coins: number;
  bestStreak: number;
  totalGames: number;
  totalWins: number;
  winRate: number;
  isCurrentUser: boolean;
}

export interface LinkPreviewData {
  url: string;
  finalUrl: string;
  title: string;
  description: string;
  image: string | null;
  siteName: string;
  favicon: string | null;
  fallback: boolean;
  fallbackReason?: string;
}

export interface SharedLinkItem {
  id: string;
  url: string;
  title: string;
  description: string;
  imageUrl: string | null;
  siteName: string | null;
  note: string | null;
  createdAt: string;
  username: string;
  avatarUrl: string;
}

export interface RoomView {
  id: string;
  code: string;
  gameType: 'rps' | 'ttt';
  status: string;
  host: { id: string; username: string; avatarUrl: string; score: number };
  guest: { id: string; username: string; avatarUrl: string; score: number } | null;
  draws: number;
  role: 'host' | 'guest' | 'spectator';
  state: {
    gameType: 'rps' | 'ttt';
    board?: Array<'X' | 'O' | null>;
    turn?: 'X' | 'O';
    winner?: 'X' | 'O' | 'draw' | null;
    winningLine?: number[] | null;
    round?: number;
    hostMove?: 'rock' | 'paper' | 'scissors' | 'locked' | null;
    guestMove?: 'rock' | 'paper' | 'scissors' | 'locked' | null;
    lastRound?: {
      round: number;
      hostMove: 'rock' | 'paper' | 'scissors';
      guestMove: 'rock' | 'paper' | 'scissors';
      winner: 'host' | 'guest' | 'draw';
    } | null;
    chat?: Array<{ id: string; username: string; text: string; createdAt: string }>;
  };
}

export interface RoomSummary {
  code: string;
  gameType: 'rps' | 'ttt';
  status: string;
  createdAt: string;
  hostUsername: string;
  hostId: string;
  guestUsername: string | null;
  guestId: string | null;
}

export interface InvitationItem {
  id: string;
  roomCode: string;
  gameType: 'rps' | 'ttt';
  status?: string;
  fromUsername: string;
  fromAvatar: string;
  createdAt: string;
}
