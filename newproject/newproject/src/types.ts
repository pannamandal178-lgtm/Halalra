export interface UserData {
  uid: string;
  name: string;
  email: string;
  photoURL?: string;
  nickname?: string;
  coins: number;
  banned: boolean;
  createdAt: number;
  referredBy?: string;
  referralCode?: string;
  totalReferrals: number;
  referralCoins: number;
  weeklyCoins: number;
  monthlyCoins: number;
  totalEarnings: number;
  dailyAds: number;
  adsDate: string;
  dailyQuizzes: number;
  totalQuizzes?: number;
  quizDate: string;
  factDate?: string;
  weeklyDate?: string;
  monthlyDate?: string;
  lastBonusDate: string;
  fcmToken?: string;
  pushEnabled?: boolean;
  notifyDailyBonus?: boolean;
  notifyNewOffers?: boolean;
  notifyReferrals?: boolean;
  theme?: 'light' | 'dark';
  strikes?: number;
  perfectStreak?: number;
  badges?: string[];
  inventory?: string[];
  equippedFrame?: string;
}

export interface Transaction {
  id?: string;
  type: 'bonus' | 'ad' | 'quiz' | 'referral' | 'withdraw';
  amount: number;
  note: string;
  createdAt: number;
}

export interface ReferralRecord {
  id?: string;
  uid: string;
  name: string;
  reward: number;
  referrerId: string;
  referrerName: string;
  createdAt: number;
}

export interface WithdrawRequest {
  id?: string;
  uid: string;
  name: string;
  email: string;
  type: 'upi' | 'google_play' | 'amazon';
  amount: number;
  coinCost?: number;
  detail: string;
  status: 'pending' | 'completed' | 'rejected';
  code?: string;
  createdAt: number;
}

export interface Activity {
  id?: string;
  userId: string;
  userName: string;
  type: 'redeem' | 'level_up' | 'achievement' | 'referral';
  message: string;
  value?: number;
  createdAt: number;
}
