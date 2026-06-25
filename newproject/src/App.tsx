/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { auth, db, messaging } from './firebase';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, User, getRedirectResult } from 'firebase/auth';
import { 
  doc, 
  onSnapshot, 
  setDoc, 
  getDoc, 
  updateDoc, 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  limit, 
  getDocs, 
  writeBatch,
  where,
  serverTimestamp,
  Timestamp,
  increment,
  runTransaction,
  deleteDoc,
  arrayUnion,
  getDocFromServer
} from 'firebase/firestore';
import { getToken, onMessage } from 'firebase/messaging';
import { Toaster, toast } from 'react-hot-toast';
import { 
  Home, 
  Gift, 
  Users, 
  Trophy, 
  User as UserIcon, 
  Wallet,
  Settings,
  X,
  Check,
  Globe,
  Save,
  CheckCircle2,
  AlertCircle,
  LogOut,
  ChevronRight,
  TrendingUp,
  Brain,
  Video,
  Copy,
  Share2,
  Clock,
  Lock,
  Sun,
  Moon,
  ArrowUpRight,
  ArrowDownRight,
  ArrowRight,
  Loader2,
  Bell,
  BellOff,
  Star,
  Medal,
  Camera,
  ArrowLeft,
  Link,
  Send,
  Facebook,
  Share,
  Info,
  Gem,
  Zap,
  Search,
  ShoppingCart,
  ShieldCheck,
  PlusCircle,
  Trash2,
  Download
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, formatCurrency, getTodayDateString, getWeekString, getMonthString } from './lib/utils';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer,
  CartesianGrid
} from 'recharts';
import { 
  UserData, 
  Transaction, 
  WithdrawRequest,
  ReferralRecord,
  Activity
} from './types';
import { adService } from './lib/adService';
import {
  COINS_PER_AD,
  COINS_PER_QUIZ,
  COINS_DAILY_BONUS,
  DAILY_AD_LIMIT,
  DAILY_QUIZ_LIMIT,
  AD_COOLDOWN_MS,
  REFERRAL_BONUS,
  COINS_PER_INR,
  WD_UPI_COINS,
  WD_GIFT_COINS,
  ANTI_CHEAT_STRIKE_LIMIT,
  CPAGRIP_PUBLISHER_ID,
  CPAGRIP_OFFERWALL_ID,
  CPALEAD_ID,
  CUSTOM_OFFERWALL_URL,
  MONLIX_ID
} from './constants';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

const calculateLevel = (totalEarnings: number = 0) => {
  const base = 1000;
  const growth = 1.3;
  if (totalEarnings < base) return 1;
  return Math.floor(Math.log(1 + (totalEarnings * (growth - 1)) / base) / Math.log(growth)) + 1;
};

const getLevelProgress = (totalEarnings: number = 0) => {
  const base = 1000;
  const growth = 1.3;
  const currentLvl = calculateLevel(totalEarnings);
  const earningsForCurrent = base * (Math.pow(growth, currentLvl - 1) - 1) / (growth - 1);
  const earningsForNext = base * (Math.pow(growth, currentLvl) - 1) / (growth - 1);
  const progress = ((totalEarnings - earningsForCurrent) / (earningsForNext - earningsForCurrent)) * 100;
  return {
    progress: Math.min(100, Math.max(0, progress)),
    currentLevel: currentLvl,
    nextLevelAt: Math.ceil(earningsForNext),
    remaining: Math.max(0, Math.ceil(earningsForNext - totalEarnings))
  };
};

interface CustomOffer {
  id: string;
  title: string;
  description: string;
  url: string;
  coins: number;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('home');
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [appConfig, setAppConfig] = useState<{ 
    appName: string; 
    appUrl: string;
    monetagZoneId?: string;
    googleH5AdClient?: string;
    dailyQuizLimit?: number;
    cpagripPublisherId?: string;
    cpagripOfferwallId?: string;
    cpaleadId?: string;
    monlixId?: string;
    customOfferwallUrl?: string;
    myleadApiKey?: string;
    myleadOfferwallUrl?: string;
    admobPublisherId?: string;
    admobAppId?: string;
    fanPlacementId?: string;
    specialOffers?: CustomOffer[];
    referralBonus?: number;
    upiThreshold?: number;
    giftThreshold?: number;
    coinsPerInr?: number;
    coinsPerAd?: number;
    watchAndEarnEnabled?: boolean;
  }>({ 
    appName: 'ammo-ra', 
    appUrl: window.location.origin,
    dailyQuizLimit: DAILY_QUIZ_LIMIT,
    specialOffers: [],
    myleadApiKey: '',
    myleadOfferwallUrl: '',
    referralBonus: REFERRAL_BONUS,
    upiThreshold: WD_UPI_COINS,
    giftThreshold: WD_GIFT_COINS,
    coinsPerInr: COINS_PER_INR,
    coinsPerAd: COINS_PER_AD,
    watchAndEarnEnabled: true
  });
  const [deviceLimitReached, setDeviceLimitReached] = useState<string[] | null>(null);
  const [deviceId, setDeviceId] = useState<string>('');
  const [isOffline, setIsOffline] = useState(false);
  const [showSlowConnectionWarning, setShowSlowConnectionWarning] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let retryCount = 0;

    async function testConnection() {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setIsOffline(true);
        return;
      }

      try {
        console.log("Checking Firebase connection...");
        // Use a publicly readable doc to test connectivity
        const testSnap = await getDocFromServer(doc(db, 'appConfig', 'general'));
        if (active) {
          console.log("Firebase connection successful:", testSnap.exists());
          setIsOffline(false);
        }
      } catch (error: any) {
        if (!active) return;
        console.warn("Firebase connection test attempt failed details:", {
          message: error.message,
          code: error.code,
          name: error.name
        });

        const isNetworkErr = error instanceof Error && (
          error.message?.includes('the client is offline') || 
          error.message?.includes('network-request-failed') ||
          (error as any).code === 'unavailable'
        );

        if (isNetworkErr) {
          if (retryCount < 2) {
            retryCount++;
            console.log(`Retrying connection check in 2.5s (attempt ${retryCount}/2)...`);
            setTimeout(() => {
              if (active) testConnection();
            }, 2500);
          } else {
            console.error("Firebase connection check failed. The client might be offline.");
            setIsOffline(true);
          }
        } else {
          // If it's a permission-denied error, we ARE connected to the server
          console.log("Connect test failed but not due to offline status (likely permissions):", (error as any).code || error.message);
          setIsOffline(false);
        }
      }
    }

    testConnection();

    const handleOnline = () => {
      setIsOffline(false);
      testConnection();
    };
    const handleOffline = () => {
      setIsOffline(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      active = false;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Handle slow connection warning timer separately to avoid resetting connection checks
  useEffect(() => {
    if (!loading) {
      setShowSlowConnectionWarning(false);
      return;
    }

    const timer = setTimeout(() => {
      if (loading) {
        setShowSlowConnectionWarning(true);
      }
    }, 10000);

    return () => clearTimeout(timer);
  }, [loading]);

  const [showShop, setShowShop] = useState(false);

  useEffect(() => {
    const unsubscribeGeneral = onSnapshot(doc(db, 'appConfig', 'general'), (snap) => {
      if (snap.exists()) {
        const data = snap.data() as any;
        setAppConfig({
          appName: data.appName || 'ammo-ra',
          appUrl: data.appUrl || window.location.origin,
          monetagZoneId: data.monetagZoneId || '',
          googleH5AdClient: data.googleH5AdClient || '',
          dailyQuizLimit: data.dailyQuizLimit || DAILY_QUIZ_LIMIT,
          cpagripPublisherId: data.cpagripPublisherId || '',
          cpagripOfferwallId: data.cpagripOfferwallId || '',
          cpaleadId: data.cpaleadId || '',
          monlixId: data.monlixId || '',
          customOfferwallUrl: data.customOfferwallUrl || '',
          myleadApiKey: data.myleadApiKey || '',
          myleadOfferwallUrl: data.myleadOfferwallUrl || '',
          admobPublisherId: data.admobPublisherId || '',
          admobAppId: data.admobAppId || '',
          fanPlacementId: data.fanPlacementId || '',
          specialOffers: data.specialOffers || [],
          referralBonus: data.referralBonus || REFERRAL_BONUS,
          upiThreshold: data.upiThreshold || WD_UPI_COINS,
          giftThreshold: data.giftThreshold || WD_GIFT_COINS,
          coinsPerInr: data.coinsPerInr || COINS_PER_INR,
          coinsPerAd: data.coinsPerAd || COINS_PER_AD,
          watchAndEarnEnabled: data.watchAndEarnEnabled ?? true
        });
      }
    });
    return () => unsubscribeGeneral();
  }, []);

  useEffect(() => {
    document.title = appConfig.appName;
  }, [appConfig.appName]);

  useEffect(() => {
    if (userData?.theme === 'light') {
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
    }
  }, [userData?.theme]);

  useEffect(() => {
    let dId = localStorage.getItem('hala_device_id');
    if (!dId) {
      dId = 'dev_' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
      localStorage.setItem('hala_device_id', dId);
    }
    setDeviceId(dId);
  }, []);

  const checkDeviceLimit = async (user: User, id: string) => {
    if (!id) return true;
    
    // Admin bypass: Always allow access for the admin email
    if (user.email === 'pannamandal178@gmail.com') return true;

    try {
      const deviceRef = doc(db, 'devices', id);
      const snap = await getDoc(deviceRef);
      
      if (snap.exists()) {
        const data = snap.data() as { uids: string[], emails: string[] };
        const uids = data.uids || [];
        const emails = data.emails || [];

        if (uids.includes(user.uid)) {
          return true;
        }

        if (uids.length >= 1) {
          setDeviceLimitReached(emails);
          return false;
        }

        // Add user to device
        await updateDoc(deviceRef, {
          uids: [...uids, user.uid],
          emails: [...emails, user.email || 'unknown']
        });
        return true;
      } else {
        // First user on device
        await setDoc(deviceRef, {
          uids: [user.uid],
          emails: [user.email || 'unknown'],
          createdAt: Date.now()
        });
        return true;
      }
    } catch (error: any) {
      if (error.message?.includes('offline') || error.code === 'unavailable') {
        console.warn("Device limit check skipped due to offline status");
        return true; // Gracefully allow if offline
      }
      throw error;
    }
  };

  useEffect(() => {
    // Handle redirect results after signInWithRedirect reloads the page
    getRedirectResult(auth).then((result) => {
      if (result?.user) {
        toast.success('Logged in successfully!');
      }
    }).catch((error: any) => {
      console.error("Redirect login error:", error);
      if (error.code === 'auth/unauthorized-domain') {
        toast.error('This domain is not authorized for login in Firebase console.');
      } else if (error.code === 'auth/account-exists-with-different-credential') {
        toast.error('An account already exists with the same email address but different sign-in credentials.');
      } else if (error.code && error.code !== 'auth/null-user') {
        toast.error(`Login failed: ${error.message}`);
      }
    });

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      try {
        if (user && deviceId) {
          const allowed = await checkDeviceLimit(user, deviceId);
          if (!allowed) {
            setLoading(false);
            return;
          }

          setUser(user);
          const userRef = doc(db, 'users', user.uid);
          const unsubUser = onSnapshot(userRef, async (snapshot) => {
            if (snapshot.exists()) {
              const data = snapshot.data() as UserData;
              const today = getTodayDateString();
              const thisWeek = getWeekString();
              const thisMonth = getMonthString();

              let updates: any = {};
              if (data.quizDate !== today) {
                updates.dailyQuizzes = 0;
                updates.quizDate = today;
              }
              if (data.adsDate !== today) {
                updates.dailyAds = 0;
                updates.adsDate = today;
              }
              if (data.factDate !== today) {
                updates.factDate = today;
              }
              if (data.weeklyDate !== thisWeek) {
                updates.weeklyCoins = 0;
                updates.weeklyDate = thisWeek;
              }
              if (data.monthlyDate !== thisMonth) {
                updates.monthlyCoins = 0;
                updates.monthlyDate = thisMonth;
              }
              if (data.perfectStreak === undefined) {
                updates.perfectStreak = 0;
              }
              if (data.totalQuizzes === undefined) {
                updates.totalQuizzes = data.totalEarnings ? Math.floor(data.totalEarnings / COINS_PER_QUIZ) : 0;
              }
              if (data.badges === undefined) {
                updates.badges = [];
              }
              if (data.inventory === undefined) {
                updates.inventory = [];
              }
              if (data.equippedFrame === undefined) {
                updates.equippedFrame = null;
              }

              if (Object.keys(updates).length > 0) {
                await updateDoc(userRef, updates);
              }

              setUserData({ uid: snapshot.id, ...data, ...updates } as UserData);
              setLoading(false);
            } else {
              handleNewUser(user).catch(err => {
                handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
                setLoading(false);
              });
            }
          }, (error) => {
            handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
            setLoading(false);
          });
          return () => unsubUser();
        } else {
          setUser(user);
          setUserData(null);
          setLoading(false);
        }
      } catch (error: any) {
        if (error.code === 'auth/network-request-failed' || error.message?.includes('network-request-failed')) {
          setAuthError("Network connection failed. Please check your internet or Firebase configuration.");
          toast.error("Network connection failed. Check your internet.");
        } else {
          console.error("Auth state logic error:", error);
        }
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, [deviceId]);

  useEffect(() => {
    if (userData && messaging) {
      const setupNotifications = async () => {
        try {
          const permission = await Notification.requestPermission();
          if (permission === 'granted') {
            const token = await getToken(messaging, {
              vapidKey: 'BKh_pM-vG57u5m76U_vN-vY8P7u-Z9u5v6W_vN-vY8P7' // Placeholder VAPID key
            });
            if (token && token !== userData.fcmToken) {
              await updateDoc(doc(db, 'users', userData.uid), { 
                fcmToken: token,
                pushEnabled: true,
                notifyDailyBonus: userData.notifyDailyBonus ?? true,
                notifyNewOffers: userData.notifyNewOffers ?? true,
                notifyReferrals: userData.notifyReferrals ?? true
              });
            }
          }
        } catch (error) {
          console.error('Notification setup failed:', error);
        }
      };

      if (userData.pushEnabled !== false) {
        setupNotifications();
      }

      const unsubscribeMessage = onMessage(messaging, (payload) => {
        toast((t) => (
          <div className="flex items-center gap-3">
            <Bell className="text-accent" size={20} />
            <div>
              <p className="font-bold text-sm">{payload.notification?.title}</p>
              <p className="text-xs text-gray-500">{payload.notification?.body}</p>
            </div>
          </div>
        ));
      });

      return () => unsubscribeMessage();
    }
  }, [userData?.uid, userData?.pushEnabled]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const ref = urlParams.get('ref');
    if (ref) {
      sessionStorage.setItem('referralCode', ref);
    }
  }, []);

  const generateReferralCode = () => {
    return Math.floor(10000000 + Math.random() * 90000000).toString();
  };

  useEffect(() => {
    if (userData && !userData.referralCode) {
      const refCode = generateReferralCode();
      updateDoc(doc(db, 'users', userData.uid), { referralCode: refCode })
        .catch(err => console.error("Error backfilling referral code:", err));
    }
  }, [userData]);

  const handleNewUser = async (user: User) => {
    const today = getTodayDateString();
    const refCode = generateReferralCode();

    const newUser: UserData = {
      uid: user.uid,
      name: user.displayName || 'User',
      email: user.email || '',
      photoURL: user.photoURL || '',
      coins: 0,
      weeklyCoins: 0,
      monthlyCoins: 0,
      totalEarnings: 0,
      banned: false,
      createdAt: Date.now(),
      totalReferrals: 0,
      referralCoins: 0,
      dailyAds: 0,
      adsDate: today,
      dailyQuizzes: 0,
      totalQuizzes: 0,
      quizDate: today,
      factDate: '',
      weeklyDate: getWeekString(),
      monthlyDate: getMonthString(),
      lastBonusDate: '',
      referralCode: refCode,
      perfectStreak: 0,
      badges: [],
      inventory: [],
      equippedFrame: null
    };

    const userRef = doc(db, 'users', user.uid);
    await setDoc(userRef, newUser);
    setLoading(false);
  };

  const redeemReferralCode = async (refCode: string) => {
    if (!userData || !user) return;
    const code = refCode.trim();
    
    if (!code) {
      toast.error("Please enter a code");
      return;
    }

    if (code === userData.referralCode || code === userData.uid) {
      toast.error("You cannot redeem your own code");
      return;
    }

    if (userData.referredBy) {
      toast.error("You have already redeemed a code");
      return;
    }

    const bonus = appConfig.referralBonus || REFERRAL_BONUS;

    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('referralCode', '==', code), limit(1));
      const querySnap = await getDocs(q);

      if (querySnap.empty) {
        toast.error("Invalid referral code");
        return;
      }

      const referrerDoc = querySnap.docs[0];
      const referrerData = referrerDoc.data() as UserData;
      const referrerId = referrerDoc.id;
      const referrerRef = doc(db, 'users', referrerId);

      const batch = writeBatch(db);
      
      // 1. Update current user
      const userRef = doc(db, 'users', user.uid);
      batch.update(userRef, {
        coins: increment(bonus),
        totalEarnings: increment(bonus),
        weeklyCoins: increment(bonus),
        monthlyCoins: increment(bonus),
        referredBy: code
      });

      // 2. Add transaction for current user
      const userTxRef = doc(collection(db, 'users', user.uid, 'transactions'));
      batch.set(userTxRef, {
        type: 'referral',
        amount: bonus,
        note: `Redeemed code from ${referrerData.nickname || referrerData.name}`,
        createdAt: Date.now()
      });

      // 3. Update referrer
      batch.update(referrerRef, {
        coins: increment(bonus),
        totalEarnings: increment(bonus),
        weeklyCoins: increment(bonus),
        monthlyCoins: increment(bonus),
        totalReferrals: increment(1),
        referralCoins: increment(bonus)
      });

      // 4. Add transaction for referrer
      const referrerTxRef = doc(collection(db, 'users', referrerId, 'transactions'));
      batch.set(referrerTxRef, {
        type: 'referral',
        amount: bonus,
        note: `Referral reward from ${userData.name}`,
        createdAt: Date.now()
      });

      // 5. Add to referral history for referrer
      const referralHistoryRef = doc(collection(db, 'users', referrerId, 'referrals'), user.uid);
      const referralData: ReferralRecord = {
        uid: user.uid,
        name: userData.nickname || userData.name,
        reward: bonus,
        referrerId: referrerId,
        referrerName: referrerData.nickname || referrerData.name,
        createdAt: Date.now()
      };
      
      batch.set(referralHistoryRef, referralData);

      // 6. Add to global referrals collection
      const globalReferralRef = doc(db, 'referrals', `${referrerId}_${user.uid}`);
      batch.set(globalReferralRef, referralData);

      await batch.commit();
      triggerCoinAnimation(30);
      logGlobalActivity({
        userId: userData.uid,
        userName: userData.nickname || (userData.name || "").split(' ')[0],
        type: 'referral',
        message: `${userData.nickname || (userData.name || "").split(' ')[0]} joined using a referral! 🤝`,
        value: bonus
      });
      toast.success(`Successfully redeemed! You got ${bonus} coins.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'referral_redeem');
      toast.error("Failed to redeem code");
    }
  };

  const addTransaction = async (userId: string, type: string, amount: number, note: string) => {
    const tx: Transaction = {
      type: type as any,
      amount,
      note,
      createdAt: Date.now()
    };
    await addDoc(collection(db, 'users', userId, 'transactions'), tx);
  };

  const loginWithGoogle = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      toast.success('Logged in successfully!');
    } catch (error: any) {
      console.error(error);
      if (error.code === 'auth/popup-blocked') {
        toast.error('Login popup was blocked by your browser. Please allow popups or try again.');
      } else if (error.code === 'auth/unauthorized-domain') {
        toast.error('This domain is not authorized for login. Please check Firebase console.');
      } else {
        toast.error(`Login failed: ${error.message || 'Please try again.'}`);
      }
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setUser(null);
      setUserData(null);
      setActiveTab('home');
      toast.success('Signed out successfully');
    } catch (error) {
      console.error(error);
      toast.error('Sign out failed');
    }
  };

  const handleTabChange = async (tab: string) => {
    setActiveTab(tab);
  };

  if (authError && !user) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-background px-6 text-center">
        <AlertCircle className="w-16 h-16 text-red-400 mb-6" />
        <h2 className="text-2xl font-black mb-2">Connection Refused</h2>
        <p className="text-text-muted text-sm max-w-xs">{authError}</p>
        <button 
          onClick={() => window.location.reload()}
          className="mt-8 px-8 py-4 bg-accent text-black font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-accent/20 active:scale-95 transition-all"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (loading || (user && !userData)) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-background space-y-6">
        <Loader2 className="w-12 h-12 text-accent animate-spin" />
        {showSlowConnectionWarning && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center space-y-2"
          >
            <p className="text-xs text-text-muted font-bold uppercase tracking-widest">Slow Connection Detected</p>
            <p className="text-[10px] text-red-400 font-bold px-8 uppercase tracking-tighter">Wait or check your internet. If this persists, ensure Firestore is enabled and rules are deployed in your project.</p>
          </motion.div>
        )}
      </div>
    );
  }

  const handleBuyShopPack = async (pack: { id: string, coins: number, price: string }) => {
    if (!userData) return;
    
    setLoading(true);
    try {
      const batch = writeBatch(db);
      const userRef = doc(db, 'users', userData.uid);
      const txRef = doc(collection(db, 'users', userData.uid, 'transactions'));

      batch.update(userRef, {
        coins: increment(pack.coins),
        totalEarned: increment(pack.coins)
      });

      batch.set(txRef, {
        type: 'purchase',
        amount: pack.coins,
        timestamp: serverTimestamp(),
        description: `Bought ${pack.coins} Coins Pack (${pack.price})`
      });

      await batch.commit();
      toast.success(`Purchased ${pack.coins} coins!`);
      setShowShop(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${userData.uid}`);
      toast.error("Purchase failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (deviceLimitReached) {
    return <DeviceLimitScreen emails={deviceLimitReached} />;
  }

  if (!user) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-background px-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-6"
        >
          <div className="w-20 h-20 bg-accent rounded-3xl flex items-center justify-center mx-auto shadow-[0_0_30px_rgba(0,255,136,0.2)]">
            <TrendingUp className="w-12 h-12 text-black" />
          </div>
          <div className="space-y-2">
            <h1 className="text-4xl font-bold font-sans">{appConfig.appName}</h1>
            <p className="text-gray-400">Join the community and start earning coins today.</p>
          </div>
          <button 
            onClick={loginWithGoogle}
            className="w-full h-14 bg-accent text-black font-semibold rounded-2xl flex items-center justify-center gap-3 hover:opacity-90 transition-opacity"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-6 h-6" alt="Google" />
            Sign in with Google
          </button>
        </motion.div>
      </div>
    );
  }

  if (userData?.banned) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-background px-6 text-center">
        <AlertCircle className="w-16 h-16 text-red-500 mb-4" />
        <h1 className="text-3xl font-bold text-white">Access Denied</h1>
        <p className="text-gray-400 mt-2">Your account has been banned due to violation of our terms and policies.</p>
        <button 
          onClick={handleSignOut}
          className="mt-8 px-6 py-3 bg-red-500/10 text-red-500 border border-red-500/20 rounded-xl font-semibold"
        >
          Sign Out
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-x-hidden flex flex-col selection:bg-accent selection:text-black">
      {isOffline && (
        <div className="fixed top-0 left-0 right-0 z-[100] bg-red-500 text-white p-2 text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2 shadow-lg">
          <AlertCircle size={14} /> Offline Mode - Changes may not sync
        </div>
      )}
      <FloatingCoinAnimation />
      <Toaster position="top-center" toastOptions={{
        style: { background: 'rgba(26, 26, 46, 0.8)', color: '#fff', border: '1px solid rgba(0, 255, 136, 0.2)', backdropFilter: 'blur(10px)' }
      }} />

      <main className="flex-1 pb-24 overflow-y-auto no-scrollbar">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10, filter: 'blur(10px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -10, filter: 'blur(10px)' }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
          >
            {activeTab === 'home' && <HomeScreen userData={userData!} setShowWithdraw={setShowWithdraw} onOpenTab={(tab) => handleTabChange(tab)} appConfig={appConfig} />}
            {activeTab === 'quiz' && <MathQuizScreen userData={userData!} onBack={() => handleTabChange('home')} appConfig={appConfig} />}
            {activeTab === 'offers' && <OffersScreen userData={userData!} appConfig={appConfig} />}
            {activeTab === 'refer' && <ReferScreen userData={userData!} onRedeem={redeemReferralCode} appConfig={appConfig} />}
            {activeTab === 'leaderboard' && <LeaderboardScreen userData={userData!} />}
            {activeTab === 'profile' && <ProfileScreen userData={userData!} onSignOut={handleSignOut} onOpenAdmin={() => setShowAdmin(true)} onOpenShop={() => setShowShop(true)} />}
          </motion.div>
        </AnimatePresence>
      </main>

      <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-[400px] h-20 bg-background/60 backdrop-blur-2xl border border-border rounded-[2rem] px-2 flex items-center justify-around z-40 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
        <NavButton active={activeTab === 'home'} onClick={() => handleTabChange('home')} icon={<Home />} label="Home" />
        <NavButton active={activeTab === 'offers'} onClick={() => handleTabChange('offers')} icon={<Gift />} label="Offers" />
        <NavButton active={activeTab === 'refer'} onClick={() => handleTabChange('refer')} icon={<Users />} label="Refer" />
        <NavButton active={activeTab === 'leaderboard'} onClick={() => handleTabChange('leaderboard')} icon={<Trophy />} label="Ranks" />
        <NavButton active={activeTab === 'profile'} onClick={() => handleTabChange('profile')} icon={<UserIcon />} label="Profile" />
      </nav>

      <WithdrawModal isOpen={showWithdraw} onClose={() => setShowWithdraw(false)} userData={userData!} appConfig={appConfig} />
      {showAdmin && <AdminPanel onClose={() => setShowAdmin(false)} />}
      {showShop && <ShopScreen userData={userData!} onBack={() => setShowShop(false)} onBuy={handleBuyShopPack} />}
    </div>
  );
}

// Sub-components follow...
function AdminPanel({ onClose }: { onClose: () => void }) {
  const [requests, setRequests] = useState<WithdrawRequest[]>([]);
  const [allUsers, setAllUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<'withdrawals' | 'users' | 'settings' | 'offers' | 'quizzes'>('withdrawals');
  const [quizzes, setQuizzes] = useState<any[]>([]);
  const [newQuiz, setNewQuiz] = useState({
    question: '',
    optionA: '',
    optionB: '',
    optionC: '',
    optionD: '',
    correctAnswer: 'A' as 'A' | 'B' | 'C' | 'D'
  });
  const [savingQuiz, setSavingQuiz] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [wdFilter, setWdFilter] = useState<'all' | 'pending' | 'completed' | 'rejected'>('all');
  const [wdSort, setWdSort] = useState<'newest' | 'oldest'>('newest');
  const [addingCoinsTo, setAddingCoinsTo] = useState<string | null>(null);
  const [coinsAmount, setCoinsAmount] = useState('');
  const [isProcessingCoins, setIsProcessingCoins] = useState(false);
  const [banningUser, setBanningUser] = useState<string | null>(null);
  const [banReasonInput, setBanReasonInput] = useState('');
  const [appConfig, setAppConfig] = useState<{ 
    appName: string; 
    appUrl: string;
    monetagZoneId?: string;
    googleH5AdClient?: string;
    dailyQuizLimit?: number;
    cpagripPublisherId?: string;
    cpagripOfferwallId?: string;
    cpaleadId?: string;
    monlixId?: string;
    customOfferwallUrl?: string;
    myleadApiKey?: string;
    myleadOfferwallUrl?: string;
    admobPublisherId?: string;
    admobAppId?: string;
    fanPlacementId?: string;
    specialOffers?: CustomOffer[];
    referralBonus?: number;
    upiThreshold?: number;
    giftThreshold?: number;
    coinsPerInr?: number;
    coinsPerAd?: number;
    watchAndEarnEnabled?: boolean;
  }>({ 
    appName: 'ammo-ra', 
    appUrl: window.location.origin,
    dailyQuizLimit: DAILY_QUIZ_LIMIT,
    specialOffers: [],
    myleadApiKey: '',
    myleadOfferwallUrl: '',
    referralBonus: REFERRAL_BONUS,
    upiThreshold: WD_UPI_COINS,
    giftThreshold: WD_GIFT_COINS,
    coinsPerInr: COINS_PER_INR,
    coinsPerAd: COINS_PER_AD,
    watchAndEarnEnabled: true
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [newOffer, setNewOffer] = useState<Partial<CustomOffer>>({
    title: '',
    description: '',
    url: '',
    coins: 0
  });

  const filteredUsers = useMemo(() => {
    if (!searchQuery?.trim()) return allUsers;
    const q = searchQuery.toLowerCase();
    return allUsers.filter(u => 
      (u.name?.toLowerCase()?.includes(q)) || 
      (u.nickname?.toLowerCase()?.includes(q)) || 
      (u.email?.toLowerCase()?.includes(q)) || 
      (u.uid?.toLowerCase()?.includes(q))
    );
  }, [allUsers, searchQuery]);

  const filteredRequests = useMemo(() => {
    let result = [...requests];
    
    if (wdFilter !== 'all') {
      result = result.filter(r => r.status === wdFilter);
    }
    
    result.sort((a, b) => {
      if (wdSort === 'newest') return b.createdAt - a.createdAt;
      return a.createdAt - b.createdAt;
    });
    
    return result;
  }, [requests, wdFilter, wdSort]);

  useEffect(() => {
    setLoading(true);
    let unsubscribeSettings: any;

    const settingsRef = doc(db, 'appConfig', 'general');
    unsubscribeSettings = onSnapshot(settingsRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data() as any;
        setAppConfig({
          appName: data.appName || 'ammo-ra',
          appUrl: data.appUrl || window.location.origin,
          monetagZoneId: data.monetagZoneId || '',
          googleH5AdClient: data.googleH5AdClient || '',
          dailyQuizLimit: data.dailyQuizLimit || DAILY_QUIZ_LIMIT,
          cpagripPublisherId: data.cpagripPublisherId || '',
          cpagripOfferwallId: data.cpagripOfferwallId || '',
          cpaleadId: data.cpaleadId || '',
          monlixId: data.monlixId || '',
          customOfferwallUrl: data.customOfferwallUrl || '',
          myleadApiKey: data.myleadApiKey || '',
          myleadOfferwallUrl: data.myleadOfferwallUrl || '',
          admobPublisherId: data.admobPublisherId || '',
          admobAppId: data.admobAppId || '',
          fanPlacementId: data.fanPlacementId || '',
          specialOffers: data.specialOffers || [],
          referralBonus: data.referralBonus || REFERRAL_BONUS,
          upiThreshold: data.upiThreshold || WD_UPI_COINS,
          giftThreshold: data.giftThreshold || WD_GIFT_COINS,
          coinsPerInr: data.coinsPerInr || COINS_PER_INR,
          coinsPerAd: data.coinsPerAd || COINS_PER_AD,
          watchAndEarnEnabled: data.watchAndEarnEnabled ?? true
        });
      }
    });

    let unsubscribe: any;
    if (activeTab === 'withdrawals') {
      const wdQuery = query(collection(db, 'withdrawals'), orderBy('createdAt', 'desc'), limit(100));
      unsubscribe = onSnapshot(wdQuery, (snapshot) => {
        const data: WithdrawRequest[] = [];
        snapshot.forEach((child) => { 
          data.push({ id: child.id, ...child.data() } as WithdrawRequest); 
        });
        setRequests(data);
        setLoading(false);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'withdrawals');
        setLoading(false);
      });
    } else if (activeTab === 'users') {
      const usersQuery = query(collection(db, 'users'), limit(500)); 
      unsubscribe = onSnapshot(usersQuery, (snapshot) => {
        const data: UserData[] = [];
        snapshot.forEach((child) => { 
          data.push({ ...child.data(), uid: child.id } as UserData); 
        });
        setAllUsers(data.sort((a, b) => (b.coins || 0) - (a.coins || 0)));
        setLoading(false);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'users');
        setLoading(false);
      });
    } else if (activeTab === 'quizzes') {
      const qQuery = query(collection(db, 'quizzes'), orderBy('createdAt', 'desc'));
      unsubscribe = onSnapshot(qQuery, (snapshot) => {
        const data: any[] = [];
        snapshot.forEach((child) => {
          data.push({ id: child.id, ...child.data() });
        });
        setQuizzes(data);
        setLoading(false);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'quizzes');
        setLoading(false);
      });
    } else {
      setLoading(false);
    }

    return () => {
      if (unsubscribe) unsubscribe();
      if (unsubscribeSettings) unsubscribeSettings();
    };
  }, [activeTab]);

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      await setDoc(doc(db, 'appConfig', 'general'), appConfig, { merge: true });
      toast.success("Settings saved!");
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'appConfig/general');
      toast.error("Failed to save settings");
    } finally {
      setSavingSettings(false);
    }
  };

  const handleAddQuiz = async () => {
    if (!newQuiz.question.trim() || !newQuiz.optionA.trim() || !newQuiz.optionB.trim() || !newQuiz.optionC.trim() || !newQuiz.optionD.trim()) {
      toast.error("Please fill in the question and all four options");
      return;
    }
    setSavingQuiz(true);
    try {
      await addDoc(collection(db, 'quizzes'), {
        question: newQuiz.question.trim(),
        optionA: newQuiz.optionA.trim(),
        optionB: newQuiz.optionB.trim(),
        optionC: newQuiz.optionC.trim(),
        optionD: newQuiz.optionD.trim(),
        correctAnswer: newQuiz.correctAnswer,
        createdAt: Date.now()
      });
      toast.success("New quiz question added!");
      setNewQuiz({
        question: '',
        optionA: '',
        optionB: '',
        optionC: '',
        optionD: '',
        correctAnswer: 'A'
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'quizzes');
      toast.error("Failed to add quiz question");
    } finally {
      setSavingQuiz(false);
    }
  };

  const handleDeleteQuiz = async (quizId: string) => {
    try {
      await deleteDoc(doc(db, 'quizzes', quizId));
      toast.success("Quiz question deleted!");
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `quizzes/${quizId}`);
      toast.error("Failed to delete quiz question");
    }
  };

  const handleConfirmAddCoins = async (targetUser: UserData) => {
    const amount = parseInt(coinsAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }

    setIsProcessingCoins(true);
    const toastId = toast.loading(`Adding ${amount} coins...`);

    try {
      const batch = writeBatch(db);
      const userRef = doc(db, 'users', targetUser.uid);
      const transRef = doc(collection(db, 'users', targetUser.uid, 'transactions'));
      
      batch.update(userRef, {
        coins: increment(amount),
        totalEarnings: increment(amount),
        weeklyCoins: increment(amount),
        monthlyCoins: increment(amount)
      });
      
      batch.set(transRef, {
        type: 'bonus',
        amount: amount,
        note: 'Admin Added Coins',
        createdAt: Date.now()
      });
      
      await batch.commit();
      toast.success(`Successfully added ${amount} coins`, { id: toastId });
      setAddingCoinsTo(null);
      setCoinsAmount('');
    } catch (error) {
      console.error(error);
      toast.error("Failed to add coins. Permission denied or connection error.", { id: toastId });
    } finally {
      setIsProcessingCoins(false);
    }
  };

  const handleAction = async (request: WithdrawRequest, action: 'completed' | 'rejected') => {
    try {
      const code = codes[request.id!] || '';

      if (action === 'completed' && (request.type === 'google_play' || request.type === 'amazon') && !code.trim()) {
        toast.error('Please enter the gift card code');
        return;
      }

      const batch = writeBatch(db);
      const wdGlobalRef = doc(db, 'withdrawals', request.id!);
      const wdUserRef = doc(db, 'users', request.uid, 'withdrawals', request.id!);
      
      const wdUpdates: any = { status: action };
      if (action === 'completed' && code.trim()) {
        wdUpdates.code = code;
      }
      
      batch.update(wdGlobalRef, wdUpdates);
      batch.update(wdUserRef, wdUpdates);

      if (action === 'completed') {
        logGlobalActivity({
          userId: request.uid,
          userName: (request.name || "").split(' ')[0],
          type: 'redeem',
          message: `${(request.name || "").split(' ')[0]} just redeemed ₹${request.amount}! 💸`,
          value: request.amount
        });
      }

      if (action === 'rejected') {
        const userRef = doc(db, 'users', request.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          const uData = userSnap.data() as UserData;
          const refundAmount = request.coinCost || (request.type === 'upi' ? WD_UPI_COINS : WD_GIFT_COINS);
          batch.update(userRef, {
            coins: (uData.coins || 0) + refundAmount
          });
          
          const tx: Transaction = {
            type: 'bonus',
            amount: refundAmount,
            note: 'Withdrawal Refund (Rejected)',
            createdAt: Date.now()
          };
          const newTxRef = doc(collection(db, 'users', request.uid, 'transactions'));
          batch.set(newTxRef, tx);
        }
      }

      await batch.commit();
      toast.success(`Request ${action}`);
    } catch (error) {
      console.error(error);
      toast.error('Failed to update request');
    }
  };

  return (
    <div className="fixed inset-0 bg-background z-[70] flex flex-col">
      <div className="p-6 border-b border-border flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-text-primary">Admin Panel</h2>
          <p className="text-xs text-text-muted">Master Control</p>
        </div>
        <button onClick={onClose} className="p-2 bg-surface rounded-full text-text-primary shadow-sm hover:scale-105 transition-all"><X /></button>
      </div>

      {/* Admin Tabs */}
      <div className="p-6 py-2 flex gap-4 border-b border-border">
        <button 
          onClick={() => setActiveTab('withdrawals')}
          className={cn("pb-2 text-sm font-bold transition-all border-b-2", activeTab === 'withdrawals' ? "text-accent border-accent" : "text-text-muted border-transparent")}
        >
          Withdrawals ({activeTab === 'withdrawals' ? requests.length : '...'})
        </button>
        <button 
          onClick={() => setActiveTab('users')}
          className={cn("pb-2 text-sm font-bold transition-all border-b-2", activeTab === 'users' ? "text-accent border-accent" : "text-text-muted border-transparent")}
        >
          Users List
        </button>
        <button 
          onClick={() => setActiveTab('offers')}
          className={cn("pb-2 text-sm font-bold transition-all border-b-2", activeTab === 'offers' ? "text-accent border-accent" : "text-text-muted border-transparent")}
        >
          Offers
        </button>
        <button 
          onClick={() => setActiveTab('settings')}
          className={cn("pb-2 text-sm font-bold transition-all border-b-2", activeTab === 'settings' ? "text-accent border-accent" : "text-text-muted border-transparent")}
        >
          Settings
        </button>
        <button 
          onClick={() => setActiveTab('quizzes')}
          className={cn("pb-2 text-sm font-bold transition-all border-b-2", activeTab === 'quizzes' ? "text-accent border-accent" : "text-text-muted border-transparent")}
        >
          Quizzes
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {loading ? (
          <div className="h-full flex items-center justify-center"><Loader2 className="animate-spin text-accent" /></div>
        ) : activeTab === 'withdrawals' ? (
          <>
            {/* Withdrawal Filters */}
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between bg-surface p-4 rounded-2xl border border-border">
              <div className="flex flex-wrap gap-2">
                {(['all', 'pending', 'completed', 'rejected'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setWdFilter(f)}
                    className={cn(
                      "px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                      wdFilter === f 
                        ? "bg-accent text-black shadow-lg shadow-accent/20" 
                        : "bg-surface border border-border text-text-muted hover:border-text-primary"
                    )}
                  >
                    {f === 'completed' ? 'successful' : f}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 bg-background/50 p-1 rounded-xl border border-border">
                <button
                  onClick={() => setWdSort('newest')}
                  className={cn(
                    "px-3 py-1 rounded-lg text-[10px] font-bold transition-all",
                    wdSort === 'newest' ? "bg-accent text-black" : "text-text-muted hover:text-text-primary"
                  )}
                >
                  Newest
                </button>
                <button
                  onClick={() => setWdSort('oldest')}
                  className={cn(
                    "px-3 py-1 rounded-lg text-[10px] font-bold transition-all",
                    wdSort === 'oldest' ? "bg-accent text-black" : "text-text-muted hover:text-text-primary"
                  )}
                >
                  Oldest
                </button>
              </div>
            </div>

            {filteredRequests.length === 0 ? (
              <div className="h-40 flex flex-col items-center justify-center text-gray-500 opacity-50">
                <Wallet size={32} />
                <p className="text-xs mt-2 uppercase font-black tracking-widest">No matching requests</p>
              </div>
            ) : (
              filteredRequests.map((request) => (
              <div key={request.id} className="glass-card p-4 space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs font-bold text-accent uppercase tracking-widest">{request.type}</p>
                    <p className="text-lg font-mono font-bold">₹{request.amount}</p>
                    <p className="text-sm font-bold text-white">{request.name}</p>
                    <p className="text-xs text-gray-400 mb-2">{request.email}</p>
                    <div className="p-3 bg-white/5 rounded-xl border border-white/10">
                      <p className="text-xs text-gray-500 mb-1">Details:</p>
                      <p className="text-sm text-accent font-mono font-bold break-all">{request.detail}</p>
                    </div>
                  </div>
                  <div className={cn("px-2 py-1 rounded-md text-[10px] font-bold uppercase", 
                    request.status === 'pending' ? "bg-yellow-500/10 text-yellow-500" :
                    request.status === 'completed' ? "bg-accent/10 text-accent" : "bg-red-500/10 text-red-500"
                  )}>
                    {request.status}
                  </div>
                </div>
                
                <div className="flex items-center justify-between text-[10px] text-gray-500 font-mono">
                  <span>UID: {request.uid}</span>
                  <span>{new Date(request.createdAt).toLocaleString()}</span>
                </div>

                {request.status === 'pending' && (
                  <div className="space-y-3">
                    {(request.type === 'google_play' || request.type === 'amazon') && (
                      <div className="space-y-1">
                        <p className="text-[10px] text-accent font-bold uppercase tracking-widest">Enter Redeem Code</p>
                        <input 
                          type="text" 
                          value={codes[request.id!] || ''}
                          onChange={(e) => setCodes(prev => ({ ...prev, [request.id!]: e.target.value }))}
                          placeholder="Ex: 575yahruufdtd547jufh"
                          className="w-full h-10 bg-white/5 border border-white/10 rounded-lg px-3 text-xs text-accent font-mono outline-none focus:border-accent/50 transition-all shadow-inner"
                        />
                      </div>
                    )}
                    <div className="flex gap-2 pt-2">
                      <button 
                        onClick={() => handleAction(request, 'completed')}
                        className="flex-1 h-10 bg-accent text-black font-bold rounded-lg text-xs hover:bg-accent/80 transition-all flex items-center justify-center gap-1"
                      >
                        <CheckCircle2 size={14} /> Mark Paid
                      </button>
                      <button 
                        onClick={() => handleAction(request, 'rejected')}
                        className="flex-1 h-10 bg-red-500 text-white font-bold rounded-lg text-xs hover:bg-red-600 transition-all flex items-center justify-center gap-1"
                      >
                        <X size={14} /> Reject & Refund
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
          </>
        ) : activeTab === 'users' ? (
          <div className="space-y-4">
            <div className="relative group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-accent transition-colors">
                <Search size={18} />
              </div>
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by email, UID, or nickname..."
                className="w-full h-12 bg-surface border border-border rounded-2xl pl-12 pr-4 text-sm outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-all shadow-sm"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            <div className="space-y-2">
              {filteredUsers.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-500 opacity-50 py-20">
                  <Users size={48} />
                  <p>No users found</p>
                </div>
              ) : (
                filteredUsers.map((user) => (
                  <div key={user.uid} className="glass-card p-4 flex items-center justify-between border border-white/5 hover:border-white/10 transition-all">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-accent/20 border border-accent/20 flex items-center justify-center text-accent font-bold">
                        {(user.nickname || user.name || "?").charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-bold">{user.nickname || user.name || "Anonymous"}</p>
                        <p className="text-[10px] text-gray-500 font-mono select-all">ID: {user.uid}</p>
                        <p className="text-[10px] text-gray-500">{user.email || 'No email'}</p>
                        {user.strikes ? (
                          <p className="text-[10px] text-red-500 font-bold mt-1 uppercase tracking-widest flex items-center gap-1">
                            <AlertCircle size={10} /> {user.strikes} Strikes
                          </p>
                        ) : null}
                        {user.banned ? (
                          <p className="text-[10px] text-white bg-red-600 px-2 py-0.5 rounded font-bold mt-1 inline-block uppercase tracking-widest">
                            Banned Account
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <div className="flex gap-2">
                        {user.banned ? (
                          <button 
                            onClick={async () => {
                              try {
                                await updateDoc(doc(db, 'users', user.uid), {
                                  banned: false,
                                  banReason: '',
                                  strikes: 0
                                });
                                toast.success('User unbanned');
                              } catch (err) {
                                toast.error('Action failed');
                              }
                            }}
                            className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all bg-accent/10 text-accent border border-accent/20 hover:bg-accent/20"
                          >
                            Unban
                          </button>
                        ) : banningUser === user.uid ? (
                          <div className="flex flex-col gap-1 items-end animate-in slide-in-from-right-4 duration-200">
                            <div className="flex items-center gap-1">
                              <input 
                                type="text" 
                                value={banReasonInput}
                                onChange={(e) => setBanReasonInput(e.target.value)}
                                placeholder="Ban reason..."
                                className="w-32 h-8 bg-black/40 border border-white/10 rounded px-2 text-[10px] text-red-500 font-mono outline-none focus:border-red-500/40"
                                autoFocus
                              />
                              <button 
                                onClick={async () => {
                                  if (!banReasonInput.trim()) {
                                    toast.error("Please enter a reason");
                                    return;
                                  }
                                  try {
                                    await updateDoc(doc(db, 'users', user.uid), {
                                      banned: true,
                                      banReason: banReasonInput,
                                      strikes: (user.strikes || 0) + 1
                                    });
                                    toast.success('User banned');
                                    setBanningUser(null);
                                    setBanReasonInput('');
                                  } catch (err) {
                                    toast.error('Action failed');
                                  }
                                }}
                                className="h-8 w-8 bg-red-500 text-white rounded flex items-center justify-center hover:bg-red-600 transition-all font-bold"
                              >
                                <Check size={14} />
                              </button>
                              <button 
                                onClick={() => { setBanningUser(null); setBanReasonInput(''); }}
                                className="h-8 w-8 bg-white/5 border border-white/10 text-gray-400 rounded flex items-center justify-center hover:bg-white/10 transition-all"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button 
                            onClick={() => {
                              setBanningUser(user.uid);
                              setBanReasonInput('Account policy violation');
                            }}
                            className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20"
                          >
                            Ban
                          </button>
                        )}
                        <div className="text-right">
                          <p className="text-sm font-mono font-bold text-accent">{user.coins || 0}</p>
                          <p className="text-[10px] text-gray-500 uppercase">Balance</p>
                        </div>
                      </div>
                      {addingCoinsTo === user.uid ? (
                        <div className="flex items-center gap-1 animate-in slide-in-from-right-4 duration-200">
                          <input 
                            type="number" 
                            value={coinsAmount}
                            onChange={(e) => setCoinsAmount(e.target.value)}
                            placeholder="Amount"
                            className="w-20 h-8 bg-black/40 border border-white/10 rounded px-2 text-[10px] text-accent font-mono outline-none focus:border-accent/40"
                            autoFocus
                          />
                          <button 
                            disabled={isProcessingCoins}
                            onClick={() => handleConfirmAddCoins(user)}
                            className="h-8 w-8 bg-accent text-black rounded flex items-center justify-center hover:bg-accent/80 transition-all disabled:opacity-50"
                          >
                            {isProcessingCoins ? <Loader2 size={12} className="animate-spin" /> : <Check size={14} />}
                          </button>
                          <button 
                            onClick={() => { setAddingCoinsTo(null); setCoinsAmount(''); }}
                            className="h-8 w-8 bg-white/5 border border-white/10 text-gray-400 rounded flex items-center justify-center hover:bg-white/10 transition-all"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <button 
                          onClick={() => setAddingCoinsTo(user.uid)}
                          className="px-3 py-1.5 bg-accent/10 border border-accent/20 text-accent text-[10px] font-bold rounded-lg hover:bg-accent/20 transition-all"
                        >
                          + ADD COINS
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : activeTab === 'offers' ? (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="glass-card p-6 space-y-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-lg flex items-center gap-2 text-accent"><Gift size={20} /> Special Offers</h3>
                  <p className="text-xs text-text-muted">Create and manage custom tasks for users</p>
                </div>
              </div>
              
              <div className="space-y-4 p-5 bg-white/5 rounded-3xl border border-white/10 shadow-xl">
                <p className="text-[10px] text-accent font-black uppercase tracking-widest mb-4 flex items-center gap-2">
                  <PlusCircle size={14} /> Add New Special Offer
                </p>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] text-gray-500 uppercase font-black px-1">Offer Title</label>
                    <input 
                      type="text" 
                      value={newOffer.title}
                      onChange={(e) => setNewOffer({ ...newOffer, title: e.target.value })}
                      placeholder="Join Our Telegram"
                      className="w-full h-12 bg-black/40 border border-white/10 rounded-2xl px-4 text-sm outline-none focus:border-accent/40 transition-all font-mono shadow-inner"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] text-gray-500 uppercase font-black px-1">Description / Instructions</label>
                    <textarea 
                      value={newOffer.description}
                      onChange={(e) => setNewOffer({ ...newOffer, description: e.target.value })}
                      placeholder="Follow the link and join our official telegram channel to get rewards instantly."
                      className="w-full h-24 bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm outline-none focus:border-accent/40 transition-all font-mono resize-none shadow-inner"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] text-gray-500 uppercase font-black px-1">Promotion URL</label>
                      <input 
                        type="text" 
                        value={newOffer.url}
                        onChange={(e) => setNewOffer({ ...newOffer, url: e.target.value })}
                        placeholder="https://t.me/yourchannel"
                        className="w-full h-12 bg-black/40 border border-white/10 rounded-2xl px-4 text-sm outline-none focus:border-accent/40 transition-all font-mono shadow-inner"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] text-gray-500 uppercase font-black px-1">Coin Reward</label>
                      <input 
                        type="number" 
                        value={newOffer.coins}
                        onChange={(e) => setNewOffer({ ...newOffer, coins: parseInt(e.target.value) || 0 })}
                        placeholder="100"
                        className="w-full h-12 bg-black/40 border border-white/10 rounded-2xl px-4 text-sm outline-none focus:border-accent/40 transition-all font-mono shadow-inner"
                      />
                    </div>
                  </div>

                  <button 
                    onClick={() => {
                      if (!newOffer.title || !newOffer.url) {
                        toast.error("Title and URL required");
                        return;
                      }
                      const offer: CustomOffer = {
                        id: Date.now().toString(),
                        title: newOffer.title!,
                        description: newOffer.description || '',
                        url: newOffer.url!,
                        coins: newOffer.coins || 0
                      };
                      setAppConfig({
                        ...appConfig,
                        specialOffers: [...(appConfig.specialOffers || []), offer]
                      });
                      setNewOffer({ title: '', description: '', url: '', coins: 0 });
                      toast.success("Offer added! Click 'Save Settings' to apply live.");
                    }}
                    className="w-full h-12 bg-accent text-black text-xs font-black uppercase tracking-widest rounded-2xl shadow-lg shadow-accent/20 hover:scale-[1.02] active:scale-95 transition-all"
                  >
                    ADD OFFER TO LIVE LIST
                  </button>
                </div>
              </div>

              <div className="pt-6 border-t border-white/5 space-y-4">
                <h3 className="text-xs font-black text-text-primary uppercase tracking-[0.2em] px-1">Active Offers ({appConfig.specialOffers?.length || 0})</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {appConfig.specialOffers && appConfig.specialOffers!.length > 0 ? (
                    (appConfig.specialOffers || []).map((offer) => (
                      <div key={offer.id} className="p-4 bg-surface border border-border rounded-3xl flex items-center justify-between group hover:border-accent/30 transition-all">
                        <div className="flex-1 min-w-0 pr-4">
                          <p className="font-bold text-white truncate">{offer.title}</p>
                          <div className="flex items-center gap-2 mt-1">
                             <span className="flex items-center gap-1 text-[10px] text-accent font-black bg-accent/10 px-1.5 py-0.5 rounded border border-accent/20 uppercase tracking-tighter">
                               <Star size={10} /> {offer.coins} Coins
                             </span>
                             <span className="text-[9px] text-text-muted truncate max-w-[150px]">{offer.url}</span>
                          </div>
                        </div>
                        <button 
                          onClick={() => {
                            setAppConfig({
                              ...appConfig,
                              specialOffers: appConfig.specialOffers?.filter(o => o.id !== offer.id)
                            });
                            toast.success("Offer removed (don't forget to save)");
                          }}
                          className="p-3 text-red-400 hover:bg-red-400/10 rounded-2xl transition-all"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="col-span-full py-12 flex flex-col items-center justify-center text-text-muted border-2 border-dashed border-border rounded-[2rem]">
                       <Gift size={40} className="mb-2 opacity-20" />
                       <p className="text-xs font-bold uppercase tracking-widest opacity-40">No special offers active</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-6 border-t border-white/5 flex flex-col sm:flex-row gap-4">
                 <button 
                   onClick={saveSettings}
                   disabled={savingSettings}
                   className="flex-1 h-14 bg-accent text-black text-xs font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-accent/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                 >
                   {savingSettings ? <Loader2 className="animate-spin" /> : <Save />}
                   {savingSettings ? "Saving..." : "Save All Special Offers"}
                 </button>
              </div>
            </div>
          </div>
        ) : activeTab === 'quizzes' ? (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="glass-card p-5 space-y-4">
              <h3 className="font-extrabold flex items-center gap-2 text-white"><PlusCircle size={18} className="text-accent" /> Create New Quiz Question</h3>
              
              <div className="space-y-2">
                <label className="text-[10px] text-gray-500 uppercase font-black px-1">Quiz Question</label>
                <input 
                  type="text" 
                  value={newQuiz.question}
                  onChange={(e) => setNewQuiz({ ...newQuiz, question: e.target.value })}
                  placeholder="e.g. Which country is known as the Land of the Rising Sun?"
                  className="w-full h-12 bg-black/40 border border-white/10 rounded-2xl px-4 text-sm outline-none focus:border-accent/40 transition-all font-sans"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] text-gray-500 uppercase font-black px-1">Option A</label>
                  <input 
                    type="text" 
                    value={newQuiz.optionA}
                    onChange={(e) => setNewQuiz({ ...newQuiz, optionA: e.target.value })}
                    placeholder="Option A"
                    className="w-full h-12 bg-black/40 border border-white/10 rounded-2xl px-4 text-sm outline-none focus:border-accent/40 transition-all font-sans"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] text-gray-500 uppercase font-black px-1">Option B</label>
                  <input 
                    type="text" 
                    value={newQuiz.optionB}
                    onChange={(e) => setNewQuiz({ ...newQuiz, optionB: e.target.value })}
                    placeholder="Option B"
                    className="w-full h-12 bg-black/40 border border-white/10 rounded-2xl px-4 text-sm outline-none focus:border-accent/40 transition-all font-sans"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] text-gray-500 uppercase font-black px-1">Option C</label>
                  <input 
                    type="text" 
                    value={newQuiz.optionC}
                    onChange={(e) => setNewQuiz({ ...newQuiz, optionC: e.target.value })}
                    placeholder="Option C"
                    className="w-full h-12 bg-black/40 border border-white/10 rounded-2xl px-4 text-sm outline-none focus:border-accent/40 transition-all font-sans"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] text-gray-500 uppercase font-black px-1">Option D</label>
                  <input 
                    type="text" 
                    value={newQuiz.optionD}
                    onChange={(e) => setNewQuiz({ ...newQuiz, optionD: e.target.value })}
                    placeholder="Option D"
                    className="w-full h-12 bg-black/40 border border-white/10 rounded-2xl px-4 text-sm outline-none focus:border-accent/40 transition-all font-sans"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] text-gray-500 uppercase font-black px-1">Correct Answer Option</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['A', 'B', 'C', 'D'] as const).map((letter) => (
                    <button
                      key={letter}
                      type="button"
                      onClick={() => setNewQuiz({ ...newQuiz, correctAnswer: letter })}
                      className={cn(
                        "h-12 rounded-2xl font-black text-sm transition-all border",
                        newQuiz.correctAnswer === letter 
                          ? "bg-accent border-accent text-black" 
                          : "bg-white/5 border-white/10 text-white hover:bg-white/10"
                      )}
                    >
                      {letter}
                    </button>
                  ))}
                </div>
              </div>

              <button 
                onClick={handleAddQuiz}
                disabled={savingQuiz}
                className="w-full h-14 bg-accent text-black text-xs font-black uppercase tracking-widest rounded-2xl shadow-lg shadow-accent/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {savingQuiz ? <Loader2 className="animate-spin text-black" size={16} /> : <PlusCircle size={16} />}
                Add Question to Live Database
              </button>
            </div>

            <div className="space-y-4">
              <h3 className="text-xs font-black text-text-primary uppercase tracking-[0.2em] px-1 animate-pulse">Live Custom Trivia Questions ({quizzes.length})</h3>
              <div className="space-y-3">
                {quizzes.length > 0 ? (
                  quizzes.map((quiz, idx) => (
                    <div key={quiz.id || idx} className="p-5 bg-surface border border-border rounded-3xl flex flex-col md:flex-row md:items-center justify-between gap-4 group hover:border-accent/30 transition-all">
                      <div className="space-y-2 flex-1">
                        <p className="font-extrabold text-white text-base">{idx + 1}. {quiz.question}</p>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                          <p className={cn("text-xs font-bold", quiz.correctAnswer === 'A' ? "text-accent font-black" : "text-text-muted")}><span className="font-mono text-xs">A:</span> {quiz.optionA}</p>
                          <p className={cn("text-xs font-bold", quiz.correctAnswer === 'B' ? "text-accent font-black" : "text-text-muted")}><span className="font-mono text-xs">B:</span> {quiz.optionB}</p>
                          <p className={cn("text-xs font-bold", quiz.correctAnswer === 'C' ? "text-accent font-black" : "text-text-muted")}><span className="font-mono text-xs">C:</span> {quiz.optionC}</p>
                          <p className={cn("text-xs font-bold", quiz.correctAnswer === 'D' ? "text-accent font-black" : "text-text-muted")}><span className="font-mono text-xs">D:</span> {quiz.optionD}</p>
                        </div>
                        <div className="pt-1 flex items-center gap-2">
                          <span className="text-[9px] font-black uppercase text-accent bg-accent/10 px-2 py-0.5 rounded border border-accent/20">
                            Correct: Option {quiz.correctAnswer}
                          </span>
                        </div>
                      </div>
                      <button 
                        onClick={() => handleDeleteQuiz(quiz.id)}
                        className="p-3 text-red-400 hover:bg-red-400/10 rounded-2xl self-end md:self-center transition-all"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="py-12 flex flex-col items-center justify-center text-text-muted border-2 border-dashed border-border rounded-[2.5rem]">
                     <Brain size={40} className="mb-2 opacity-20" />
                     <p className="text-xs font-bold uppercase tracking-widest opacity-40">No custom questions created yet</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : activeTab === 'settings' ? (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="glass-card p-4 space-y-4">
              <h3 className="font-bold flex items-center gap-2"><Globe size={18} className="text-accent" /> App Configuration</h3>
              
              <div className="space-y-2">
                <label className="text-[10px] text-gray-500 uppercase font-bold px-1">App Name</label>
                <input 
                  type="text" 
                  value={appConfig.appName}
                  onChange={(e) => setAppConfig({ ...appConfig, appName: e.target.value })}
                  placeholder="App Name (e.g., ammo-ra)"
                  className="w-full h-12 bg-white/5 border border-white/10 rounded-xl px-4 text-sm outline-none focus:border-accent/40 transition-all font-mono"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] text-gray-500 uppercase font-bold px-1">App URL (for referrals)</label>
                <input 
                  type="text" 
                  value={appConfig.appUrl}
                  onChange={(e) => setAppConfig({ ...appConfig, appUrl: e.target.value })}
                  placeholder="https://yourapp.com"
                  className="w-full h-12 bg-white/5 border border-white/10 rounded-xl px-4 text-sm outline-none focus:border-accent/40 transition-all font-mono"
                />
              </div>

              <div className="pt-4 border-t border-white/5 space-y-4">
                <h4 className="text-xs font-bold text-accent uppercase tracking-widest">Ad Settings</h4>
                
                <div className="space-y-2">
                  <label className="text-[10px] text-gray-500 uppercase font-bold px-1">Google H5 Ads Client ID</label>
                  <input 
                    type="text" 
                    value={appConfig.googleH5AdClient}
                    onChange={(e) => setAppConfig({ ...appConfig, googleH5AdClient: e.target.value })}
                    placeholder="ca-pub-xxxxxxxxxxxxxxxx"
                    className="w-full h-12 bg-white/5 border border-white/10 rounded-xl px-4 text-sm outline-none focus:border-accent/40 transition-all font-mono"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] text-gray-500 uppercase font-bold px-1">Monetag Zone ID</label>
                  <input 
                    type="text" 
                    value={appConfig.monetagZoneId}
                    onChange={(e) => setAppConfig({ ...appConfig, monetagZoneId: e.target.value })}
                    placeholder="7654321"
                    className="w-full h-12 bg-white/5 border border-white/10 rounded-xl px-4 text-sm outline-none focus:border-accent/40 transition-all font-mono"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] text-gray-500 uppercase font-bold px-1">Reward Coins per Ad</label>
                  <input 
                    type="number" 
                    value={appConfig.coinsPerAd}
                    onChange={(e) => setAppConfig({ ...appConfig, coinsPerAd: parseInt(e.target.value) || 0 })}
                    placeholder="10"
                    className="w-full h-12 bg-white/5 border border-white/10 rounded-xl px-4 text-sm outline-none focus:border-accent/40 transition-all font-mono"
                  />
                </div>

                <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/10">
                  <div>
                    <h5 className="text-xs font-bold text-white uppercase tracking-wider">Enable Watch & Earn</h5>
                    <p className="text-[10px] text-gray-400">Show or hide the video ads section for users</p>
                  </div>
                  <button 
                    onClick={() => setAppConfig({ ...appConfig, watchAndEarnEnabled: !appConfig.watchAndEarnEnabled })}
                    className={cn(
                      "w-12 h-6 rounded-full p-1 transition-all duration-300",
                      appConfig.watchAndEarnEnabled ? "bg-accent" : "bg-white/10"
                    )}
                  >
                    <div className={cn(
                      "w-4 h-4 bg-white rounded-full transition-all duration-300 transform",
                      appConfig.watchAndEarnEnabled ? "translate-x-6" : "translate-x-0"
                    )} />
                  </button>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] text-gray-500 uppercase font-bold px-1">Daily Quiz Limit</label>
                  <input 
                    type="number" 
                    value={appConfig.dailyQuizLimit}
                    onChange={(e) => setAppConfig({ ...appConfig, dailyQuizLimit: parseInt(e.target.value) || 0 })}
                    placeholder="15"
                    className="w-full h-12 bg-white/5 border border-white/10 rounded-xl px-4 text-sm outline-none focus:border-accent/40 transition-all font-mono"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] text-gray-500 uppercase font-bold px-1">CPALead ID</label>
                  <input 
                    type="text" 
                    value={appConfig.cpaleadId}
                    onChange={(e) => setAppConfig({ ...appConfig, cpaleadId: e.target.value })}
                    placeholder="123456"
                    className="w-full h-12 bg-white/5 border border-white/10 rounded-xl px-4 text-sm outline-none focus:border-accent/40 transition-all font-mono"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] text-gray-500 uppercase font-bold px-1">CPAGrip Pub ID</label>
                    <input 
                      type="text" 
                      value={appConfig.cpagripPublisherId}
                      onChange={(e) => setAppConfig({ ...appConfig, cpagripPublisherId: e.target.value })}
                      placeholder="12345"
                      className="w-full h-12 bg-white/5 border border-white/10 rounded-xl px-4 text-sm outline-none focus:border-accent/40 transition-all font-mono"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] text-gray-500 uppercase font-bold px-1">CPAGrip Wall ID</label>
                    <input 
                      type="text" 
                      value={appConfig.cpagripOfferwallId}
                      onChange={(e) => setAppConfig({ ...appConfig, cpagripOfferwallId: e.target.value })}
                      placeholder="54321"
                      className="w-full h-12 bg-white/5 border border-white/10 rounded-xl px-4 text-sm outline-none focus:border-accent/40 transition-all font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] text-gray-500 uppercase font-bold px-1">Monlix App ID</label>
                  <input 
                    type="text" 
                    value={appConfig.monlixId}
                    onChange={(e) => setAppConfig({ ...appConfig, monlixId: e.target.value })}
                    placeholder="appid_123"
                    className="w-full h-12 bg-white/5 border border-white/10 rounded-xl px-4 text-sm outline-none focus:border-accent/40 transition-all font-mono"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] text-gray-500 uppercase font-bold px-1">Custom Offerwall URL</label>
                  <input 
                    type="text" 
                    value={appConfig.customOfferwallUrl}
                    onChange={(e) => setAppConfig({ ...appConfig, customOfferwallUrl: e.target.value })}
                    placeholder="https://..."
                    className="w-full h-12 bg-white/5 border border-white/10 rounded-xl px-4 text-sm outline-none focus:border-accent/40 transition-all font-mono"
                  />
                </div>

                <div className="space-y-4 pt-4 border-t border-white/5">
                  <h4 className="text-xs font-bold text-accent uppercase tracking-widest">MyLead Settings</h4>
                  
                  <div className="space-y-2">
                    <label className="text-[10px] text-gray-500 uppercase font-bold px-1">MyLead API Key</label>
                    <input 
                      type="text" 
                      value={appConfig.myleadApiKey}
                      onChange={(e) => setAppConfig({ ...appConfig, myleadApiKey: e.target.value })}
                      placeholder="Your MyLead API Key"
                      className="w-full h-12 bg-white/5 border border-white/10 rounded-xl px-4 text-sm outline-none focus:border-accent/40 transition-all font-mono"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] text-gray-500 uppercase font-bold px-1">MyLead Offerwall URL (Optional)</label>
                    <input 
                      type="text" 
                      value={appConfig.myleadOfferwallUrl}
                      onChange={(e) => setAppConfig({ ...appConfig, myleadOfferwallUrl: e.target.value })}
                      placeholder="https://mylead.global/sl/..."
                      className="w-full h-12 bg-white/5 border border-white/10 rounded-xl px-4 text-sm outline-none focus:border-accent/40 transition-all font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] text-gray-500 uppercase font-bold px-1">AdMob Publisher ID</label>
                    <input 
                      type="text" 
                      value={appConfig.admobPublisherId}
                      onChange={(e) => setAppConfig({ ...appConfig, admobPublisherId: e.target.value })}
                      placeholder="pub-xxxxxxxxxxxxxxxx"
                      className="w-full h-12 bg-white/5 border border-white/10 rounded-xl px-4 text-sm outline-none focus:border-accent/40 transition-all font-mono"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] text-gray-500 uppercase font-bold px-1">AdMob App ID</label>
                    <input 
                      type="text" 
                      value={appConfig.admobAppId}
                      onChange={(e) => setAppConfig({ ...appConfig, admobAppId: e.target.value })}
                      placeholder="ca-app-pub-xxxx~xxxx"
                      className="w-full h-12 bg-white/5 border border-white/10 rounded-xl px-4 text-sm outline-none focus:border-accent/40 transition-all font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] text-gray-500 uppercase font-bold px-1">Facebook Placement ID</label>
                  <input 
                    type="text" 
                    value={appConfig.fanPlacementId}
                    onChange={(e) => setAppConfig({ ...appConfig, fanPlacementId: e.target.value })}
                    placeholder="xxxx_xxxx"
                    className="w-full h-12 bg-white/5 border border-white/10 rounded-xl px-4 text-sm outline-none focus:border-accent/40 transition-all font-mono"
                  />
                </div>

                <div className="space-y-2 pt-4 border-t border-white/5">
                  <h4 className="text-xs font-bold text-accent uppercase tracking-widest">Redemption Settings</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] text-gray-500 uppercase font-bold px-1">UPI Min Coins</label>
                      <input 
                        type="number" 
                        value={appConfig.upiThreshold}
                        onChange={(e) => setAppConfig({ ...appConfig, upiThreshold: parseInt(e.target.value) || 0 })}
                        placeholder="2300"
                        className="w-full h-12 bg-white/5 border border-white/10 rounded-xl px-4 text-sm outline-none focus:border-accent/40 transition-all font-mono"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] text-gray-500 uppercase font-bold px-1">Gift Card Min Coins</label>
                      <input 
                        type="number" 
                        value={appConfig.giftThreshold}
                        onChange={(e) => setAppConfig({ ...appConfig, giftThreshold: parseInt(e.target.value) || 0 })}
                        placeholder="2000"
                        className="w-full h-12 bg-white/5 border border-white/10 rounded-xl px-4 text-sm outline-none focus:border-accent/40 transition-all font-mono"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] text-gray-500 uppercase font-bold px-1">Coins Per INR 1</label>
                    <input 
                      type="number" 
                      value={appConfig.coinsPerInr}
                      onChange={(e) => setAppConfig({ ...appConfig, coinsPerInr: parseInt(e.target.value) || 0 })}
                      placeholder="100"
                      className="w-full h-12 bg-white/5 border border-white/10 rounded-xl px-4 text-sm outline-none focus:border-accent/40 transition-all font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-2 pt-4 border-t border-white/5">
                  <h4 className="text-xs font-bold text-accent uppercase tracking-widest">Referral Settings</h4>
                  <div className="space-y-2">
                    <label className="text-[10px] text-gray-500 uppercase font-bold px-1">Referral Bonus (Coins)</label>
                    <input 
                      type="number" 
                      value={appConfig.referralBonus}
                      onChange={(e) => setAppConfig({ ...appConfig, referralBonus: parseInt(e.target.value) || 0 })}
                      placeholder="170"
                      className="w-full h-12 bg-white/5 border border-white/10 rounded-xl px-4 text-sm outline-none focus:border-accent/40 transition-all font-mono"
                    />
                  </div>
                </div>
              </div>

              <button 
                onClick={saveSettings}
                disabled={savingSettings}
                className="w-full h-14 bg-accent text-black font-black uppercase tracking-[0.2em] rounded-2xl shadow-xl shadow-accent/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {savingSettings ? <Loader2 className="animate-spin" /> : <Save />}
                {savingSettings ? "Saving Settings..." : "Save Configuration"}
              </button>
            </div>

            <div className="p-4 bg-accent/5 rounded-2xl border border-accent/10">
              <p className="text-xs text-gray-400 leading-relaxed italic">
                Tip: You can use a bit.ly link or any custom domain here to make your referral links look better.
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "relative flex flex-col items-center justify-center h-full w-16 transition-all duration-300",
        active ? "text-accent" : "text-text-muted hover:text-text-primary"
      )}
    >
      <div className={cn(
        "p-2 rounded-2xl transition-all duration-300 relative z-10",
        active && "bg-accent/10 shadow-[0_0_20px_rgba(0,255,136,0.15)]"
      )}>
        {React.cloneElement(icon as any, { 
          size: 22,
          strokeWidth: active ? 2.5 : 2
        })}
        {active && (
          <motion.div 
            layoutId="nav-dot"
            className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-accent rounded-full"
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          />
        )}
      </div>
      <span className={cn(
        "text-[9px] font-bold tracking-widest uppercase mt-1 transition-all duration-300",
        active ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"
      )}>
        {label}
      </span>
      {active && (
        <motion.div 
          layoutId="nav-glow"
          className="absolute -bottom-2 w-1 h-1 bg-accent rounded-full blur-[2px]"
        />
      )}
    </button>
  );
}

function WithdrawModal({ isOpen, onClose, userData, appConfig }: { isOpen: boolean; onClose: () => void; userData: UserData; appConfig: any }) {
  const [method, setMethod] = useState<'upi' | 'google_play' | 'amazon'>('upi');
  const [amount, setAmount] = useState(20);
  const [detail, setDetail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const quizLimit = appConfig.dailyQuizLimit || DAILY_QUIZ_LIMIT;
  const coinsPerInr = appConfig.coinsPerInr || COINS_PER_INR;
  const upiMin = appConfig.upiThreshold || WD_UPI_COINS;
  const giftMin = appConfig.giftThreshold || WD_GIFT_COINS;

  const minCoinsForMethod = method === 'upi' ? upiMin : giftMin;
  const coinCost = Math.max(minCoinsForMethod, amount * coinsPerInr);

  const isQuizCompleted = userData.quizDate === getTodayDateString() && (userData.dailyQuizzes || 0) >= quizLimit;
  const canWithdraw = (userData?.coins || 0) >= coinCost && isQuizCompleted;

  const initiateWithdrawal = () => {
    if (!isQuizCompleted) {
      toast.error(`Please complete all ${quizLimit} daily math quizzes first!`);
      return;
    }
    if (method !== 'upi' && !detail.includes('@')) {
      toast.error('Please enter a valid email');
      return;
    }
    if (method === 'upi' && !detail.trim()) {
      toast.error('Please enter your UPI ID');
      return;
    }
    if (!canWithdraw) return;

    setShowConfirm(true);
  };

  const handleWithdraw = async () => {
    setSubmitting(true);
    try {
      const batch = writeBatch(db);
      
      const globalWdRef = doc(collection(db, 'withdrawals'));
      const wdId = globalWdRef.id;
      const userWdRef = doc(db, 'users', userData.uid, 'withdrawals', wdId);
      const userTxRef = doc(collection(db, 'users', userData.uid, 'transactions'));

      const request: WithdrawRequest = {
        uid: userData.uid,
        name: userData.name,
        email: userData.email,
        type: method,
        amount: amount,
        coinCost: coinCost,
        detail,
        status: 'pending',
        createdAt: Date.now()
      };

      const tx: Transaction = {
        type: 'withdraw',
        amount: -coinCost,
        note: `Withdrawal request: ${method.toUpperCase()} (₹${amount})`,
        createdAt: Date.now()
      };

      batch.update(doc(db, 'users', userData.uid), {
        coins: (userData.coins || 0) - coinCost
      });
      batch.set(globalWdRef, request);
      batch.set(userWdRef, request);
      batch.set(userTxRef, tx);

      await batch.commit();

      toast.success('Withdrawal request submitted!');
      resetAndClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'withdrawals');
      toast.error('Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  const resetAndClose = () => {
    setDetail('');
    setAmount(20);
    setShowConfirm(false);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            onClick={resetAndClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end justify-center"
          />
          <motion.div 
            initial={{ y: "100%" }} 
            animate={{ y: 0 }} 
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-background border-t border-border rounded-t-[3rem] p-8 z-50 overflow-hidden"
          >
            {!showConfirm ? (
              <>
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h2 className="text-2xl font-black">Redeem Rewards</h2>
                    <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest mt-1">Select your payout method</p>
                  </div>
                  <button onClick={resetAndClose} className="p-3 bg-surface rounded-2xl text-text-primary hover:bg-white/10 transition-colors"><X size={20} /></button>
                </div>

                <div className="space-y-6">
                  <div className="grid grid-cols-3 gap-3">
                    <OptionCard 
                      active={method === 'upi'} 
                      onClick={() => { setMethod('upi'); setDetail(''); }} 
                      icon={<Wallet />} 
                      label="UPI" 
                    />
                    <OptionCard 
                      active={method === 'google_play'} 
                      onClick={() => { setMethod('google_play'); setDetail(''); }} 
                      icon={<Gift />} 
                      label="Play card" 
                    />
                    <OptionCard 
                      active={method === 'amazon'} 
                      onClick={() => { setMethod('amazon'); setDetail(''); }} 
                      icon={<Gift />} 
                      label="Amazon" 
                    />
                  </div>

                  <div className="space-y-3">
                    <label className="text-[10px] text-text-muted font-black uppercase tracking-[0.2em] px-1">Select Amount</label>
                    <div className="grid grid-cols-3 gap-3">
                      {[20, 50, 100].map((v) => (
                        <button
                          key={v}
                          onClick={() => setAmount(v)}
                          className={cn(
                            "py-4 rounded-2xl border font-black transition-all",
                            amount === v ? "bg-accent border-accent text-black shadow-lg shadow-accent/20" : "bg-white/5 border-white/10 text-white hover:bg-white/10"
                          )}
                        >
                          <span className="text-xs">₹</span>{v}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center justify-between px-2">
                       <p className="text-[10px] text-text-muted font-bold">Cost: <span className="text-accent">{Math.max(minCoinsForMethod, amount * coinsPerInr).toLocaleString()} Coins</span></p>
                       <p className="text-[10px] text-text-muted font-bold">Your Balance: <span className={userData.coins >= coinCost ? "text-green-400" : "text-red-400"}>{userData.coins.toLocaleString()}</span></p>
                    </div>
                  </div>

                  {!canWithdraw ? (
                    <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-start gap-3">
                      <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={16} />
                      <div className="space-y-1">
                        {!isQuizCompleted ? (
                          <p className="text-red-400 text-xs font-bold leading-tight">
                            Task: Complete {quizLimit} quizzes first! ({userData.dailyQuizzes || 0}/{quizLimit})
                          </p>
                        ) : (
                          <p className="text-red-400 text-xs font-bold leading-tight">
                            You need {coinCost - userData.coins} more coins to redeem ₹{amount}.
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-[10px] text-text-muted font-black uppercase tracking-[0.2em] px-1">{method === 'upi' ? 'UPI Number / ID' : 'Email Address'}</label>
                        <input 
                          type="text" 
                          value={detail}
                          onChange={(e) => setDetail(e.target.value)}
                          placeholder={method === 'upi' ? 'Enter UPI Number or ID' : 'email@example.com'}
                          className="w-full h-14 bg-surface border border-border rounded-2xl px-4 text-text-primary focus:border-accent/50 outline-none transition-all font-mono text-sm"
                        />
                      </div>
                    </div>
                  )}

                  <button 
                    onClick={initiateWithdrawal}
                    disabled={!canWithdraw || !detail.trim()}
                    className="w-full h-14 bg-accent text-black font-black uppercase tracking-[0.2em] rounded-2xl shadow-xl shadow-accent/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:grayscale disabled:hover:scale-100"
                  >
                    Submit Request
                  </button>
                </div>
              </>
            ) : (
              <div className="space-y-8 py-4">
                <div className="text-center space-y-4">
                   <div className="w-16 h-16 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-accent/20">
                     <ShieldCheck className="text-accent" size={32} />
                   </div>
                   <h2 className="text-2xl font-black">Confirm Redemption</h2>
                   <p className="text-sm text-text-muted">You are about to redeem ₹{amount} {method.replace('_', ' ')} for {coinCost.toLocaleString()} coins.</p>
                </div>

                <div className="bg-surface border border-border rounded-3xl p-6 space-y-4">
                  <div className="flex justify-between items-center pb-4 border-b border-white/5">
                    <span className="text-xs text-text-muted font-bold uppercase tracking-widest">Amount</span>
                    <span className="text-lg font-black text-white font-mono">₹{amount}</span>
                  </div>
                  <div className="flex justify-between items-center pb-4 border-b border-white/5">
                    <span className="text-xs text-text-muted font-bold uppercase tracking-widest">Payout Detail</span>
                    <span className="text-sm font-bold text-white font-mono truncate max-w-[200px]">{detail}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-text-muted font-bold uppercase tracking-widest">Cost</span>
                    <span className="text-lg font-black text-accent font-mono">{coinCost.toLocaleString()}</span>
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <button 
                    onClick={handleWithdraw}
                    disabled={submitting}
                    className="w-full h-14 bg-accent text-black font-black uppercase tracking-[0.2em] rounded-2xl shadow-xl shadow-accent/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2"
                  >
                    {submitting ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                    {submitting ? 'Processing...' : 'Confirm & Redeem'}
                  </button>
                  <button 
                    onClick={() => setShowConfirm(false)}
                    disabled={submitting}
                    className="w-full h-14 bg-white/5 text-white font-black uppercase tracking-[0.2em] rounded-2xl hover:bg-white/10 transition-all"
                  >
                    Back
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function OptionCard({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "p-4 rounded-2xl border transition-all flex flex-col items-center gap-2",
        active ? "bg-accent/10 border-accent text-accent shadow-lg shadow-accent/10" : "bg-white/5 border-white/10 text-text-muted hover:text-white"
      )}
    >
      <div className={cn("transition-transform duration-300", active && "scale-110")}>
        {React.cloneElement(icon as any, { size: 24, strokeWidth: active ? 2.5 : 2 })}
      </div>
      <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
    </button>
  );
}


function CooldownCircle({ remaining, total }: { remaining: number; total: number }) {
  const percentage = (remaining / total) * 100;
  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative w-10 h-10 flex items-center justify-center">
      <svg className="w-10 h-10 -rotate-90">
        <circle
          cx="20"
          cy="20"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          className="text-blue-500/10"
        />
        <motion.circle
          cx="20"
          cy="20"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.1, ease: "linear" }}
          style={{ 
            strokeDasharray: circumference,
            strokeDashoffset: circumference
          }}
          className="text-blue-400"
        />
      </svg>
      <span className="absolute text-[10px] font-bold font-mono text-blue-400">
        {Math.ceil(remaining / 1000)}s
      </span>
    </div>
  );
}

function AdOverlay({ onFinish }: { onFinish: () => void }) {
  const [timeLeft, setTimeLeft] = useState(8);

  useEffect(() => {
    if (timeLeft <= 0) { onFinish(); return; }
    const t = setTimeout(() => setTimeLeft(prev => prev - 1), 1000);
    return () => clearTimeout(t);
  }, [timeLeft, onFinish]);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: '#000',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: '16px', padding: '20px'
    }}>
      {/* Timer top right */}
      <div style={{ position: 'absolute', top: 16, right: 16,
        width: 50, height: 50, borderRadius: '50%',
        background: 'linear-gradient(135deg, #00ff88, #00cc66)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 20, fontWeight: 'bold', color: '#000'
      }}>{timeLeft}</div>

      <p style={{ color: '#aaa', fontSize: 12, marginBottom: 8 }}>Your reward is loading...</p>

      {/* Ad iframe */}
      <iframe
        src={`https://pannamandal178-lgtm.github.io/Halalra/ad.html?t=${Date.now()}`}
        style={{ width: 320, height: 250, border: 'none', borderRadius: 12, background: '#111' }}
        sandbox="allow-scripts allow-same-origin allow-popups"
      />

      <p style={{ color: '#555', fontSize: 10 }}>Closing in {timeLeft}s</p>
    </div>
  );
}

function MathQuizScreen({ userData, onBack, appConfig }: { userData: UserData; onBack: () => void; appConfig: any }) {
  const [quizMode, setQuizMode] = useState<'select' | 'math' | 'trivia'>('select');
  const [customQuizzes, setCustomQuizzes] = useState<any[]>([]);
  const [triviaQuestion, setTriviaQuestion] = useState<{ q: string; a: string; options: { key: string; val: string }[] } | null>(null);
  const [selectedTrivia, setSelectedTrivia] = useState<string | null>(null);
  const [currentTriviaIdx, setCurrentTriviaIdx] = useState(0);
  const [showQuizAd, setShowQuizAd] = useState(false);
  const [pendingQuizAction, setPendingQuizAction] = useState<(() => void) | null>(null);

  const [question, setQuestion] = useState<{ q: string; a: number; options: number[] } | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [result, setResult] = useState<'correct' | 'wrong' | null>(null);
  const [loading, setLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState(15);
  const [quizStartTime, setQuizStartTime] = useState(Date.now());
  const [violations, setViolations] = useState(0);
  const [questionsAnswered, setQuestionsAnswered] = useState(0);
  const [streak, setStreak] = useState(0);
  const [showFeedbackOverlay, setShowFeedbackOverlay] = useState<'correct' | 'wrong' | null>(null);
  const [isSuspicious, setIsSuspicious] = useState(false);
  const [suspiciousReason, setSuspiciousReason] = useState<string | null>(null);

  const quizLimit = appConfig.dailyQuizLimit || DAILY_QUIZ_LIMIT;

  const handleBack = async () => {
    onBack();
  };

  useEffect(() => {
    if (quizMode === 'trivia') {
      setLoading(true);
      const q = query(collection(db, 'quizzes'), orderBy('createdAt', 'desc'));
      getDocs(q).then((snap) => {
        const list: any[] = [];
        snap.forEach((d) => {
          list.push({ id: d.id, ...d.data() });
        });
        const shuffled = list.sort(() => Math.random() - 0.5);
        setCustomQuizzes(shuffled);
        setCurrentTriviaIdx(0);
        setLoading(false);
      }).catch((err) => {
        console.error("Failed to load trivia quizzes:", err);
        toast.error("Failed to load trivia quizzes");
        setLoading(false);
      });
    }
  }, [quizMode]);

  const generateTriviaQuestion = (list: any[], index: number) => {
    if (list.length === 0) {
      setTriviaQuestion(null);
      return;
    }
    const idx = index % list.length;
    const item = list[idx];
    setTriviaQuestion({
      q: item.question,
      a: item.correctAnswer,
      options: [
        { key: 'A', val: item.optionA },
        { key: 'B', val: item.optionB },
        { key: 'C', val: item.optionC },
        { key: 'D', val: item.optionD }
      ]
    });
    setSelectedTrivia(null);
    setResult(null);
    setTimeLeft(15);
    setQuizStartTime(Date.now());
  };

  useEffect(() => {
    if (quizMode === 'trivia' && customQuizzes.length > 0) {
      generateTriviaQuestion(customQuizzes, currentTriviaIdx);
    }
  }, [customQuizzes, currentTriviaIdx, quizMode]);

  const reportViolation = async (reason: string) => {
    setViolations(prev => prev + 1);
    setIsSuspicious(true);
    setSuspiciousReason(reason);
    toast.error(`Anti-Cheat Warning: ${reason}`, { icon: '🚫', duration: 4000 });
    
    // Clear visual warning after 3 seconds
    setTimeout(() => {
      setIsSuspicious(false);
      setSuspiciousReason(null);
    }, 3000);

    try {
      const userRef = doc(db, 'users', userData.uid);
      const newStrikes = (userData.strikes || 0) + 1;
      
      if (newStrikes >= ANTI_CHEAT_STRIKE_LIMIT) {
        await updateDoc(userRef, { 
          strikes: newStrikes,
          banned: true,
          banReason: `Advanced Anti-Cheat: ${reason}`
        });
        toast.error("Your account has been banned for cheating.");
      } else {
        await updateDoc(userRef, { strikes: newStrikes });
      }
    } catch (err) {
      console.error("Anti-cheat report failed:", err);
    }
  };

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && !result && question) {
        reportViolation("Tab switching detected during active quiz.");
      }
    };

    const handleFocusLoss = () => {
      if (!result && question) {
        reportViolation("Window focus lost during active quiz.");
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleFocusLoss);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleFocusLoss);
    };
  }, [result, question, userData.strikes]);

  const generateQuestion = () => {
    const num1 = Math.floor(Math.random() * 50) + 1;
    const num2 = Math.floor(Math.random() * 50) + 1;
    const answer = num1 + num2;
    
    const options = new Set<number>();
    options.add(answer);
    while (options.size < 4) {
      const wrong = answer + (Math.floor(Math.random() * 20) - 10);
      if (wrong !== answer && wrong > 0) options.add(wrong);
      else options.add(answer + (options.size + 1) * 2);
    }
    
    setQuestion({
      q: `${num1} + ${num2} = ?`,
      a: answer,
      options: Array.from(options).sort(() => Math.random() - 0.5)
    });
    setSelected(null);
    setResult(null);
    setTimeLeft(15);
    setQuizStartTime(Date.now());
  };

  useEffect(() => {
    if (quizMode === 'math') {
      generateQuestion();
    }
  }, [quizMode]);

  useEffect(() => {
    const isQuestionActive = quizMode === 'math' ? question : triviaQuestion;
    if (timeLeft > 0 && isQuestionActive && !result) {
      const timer = setTimeout(() => setTimeLeft(prev => prev - 1), 1000);
      return () => clearTimeout(timer);
    } else if (timeLeft === 0 && !result) {
      setResult('wrong');
      setStreak(0);
      setShowFeedbackOverlay('wrong');
      
      try {
        updateDoc(doc(db, 'users', userData.uid), {
          perfectStreak: 0
        });
      } catch (err) {
        console.error("Failed to reset streak:", err);
      }

      if (quizMode === 'trivia') {
        setTimeout(() => {
          setShowFeedbackOverlay(null);
          setCurrentTriviaIdx(prev => prev + 1);
        }, 1500);
      } else {
        setTimeout(() => {
          setShowFeedbackOverlay(null);
          generateQuestion();
        }, 1500);
      }
    }
  }, [timeLeft, question, triviaQuestion, result, quizMode]);

  const handleAnswer = async (opt: number) => {
    if (selected !== null || result !== null) return;
    
    const solveTime = Date.now() - quizStartTime;
    if (solveTime < 1500) { // Under 1.5 seconds is very suspicious for mental math addition up to 50+50
      reportViolation("Solving effort too low. Answered too quickly.");
      return;
    }

    setSelected(opt);
    setQuestionsAnswered(prev => prev + 1);

    if (opt === question?.a) {
      setResult('correct');
      setStreak(prev => prev + 1);
      setShowFeedbackOverlay('correct');
      setLoading(true);
      if (userData.email === 'pannamandal178@gmail.com') { setLoading(false); return; }

      setPendingQuizAction(() => async () => {
      try {
        const today = getTodayDateString();
        const userRef = doc(db, 'users', userData.uid);
        
        const batch = writeBatch(db);
        
        const isNewDay = userData.quizDate !== today;
        const currentDaily = isNewDay ? 0 : (userData.dailyQuizzes || 0);

        if (currentDaily >= quizLimit) {
          toast.error("Daily quiz limit reached!");
          setLoading(false);
          return;
        }

        const newStreak = (userData.perfectStreak || 0) + 1;
        let achievementUpdate: any = {
          perfectStreak: newStreak
        };

        if (newStreak === 100 && !userData.badges?.includes('Math Genius')) {
          achievementUpdate.badges = arrayUnion('Math Genius');
          toast.success("🏆 Achievement Unlocked: MATH GENIUS!", {
            duration: 6000,
            icon: '🧠'
          });
          logGlobalActivity({
            userId: userData.uid,
            userName: userData.nickname || (userData.name || "").split(' ')[0],
            type: 'achievement',
            message: `${userData.nickname || (userData.name || "").split(' ')[0]} reached a MASSIVE 100x streak! 🧠`,
            value: 100
          });
        } else if (newStreak % 10 === 0 && newStreak > 0) {
          logGlobalActivity({
            userId: userData.uid,
            userName: userData.nickname || (userData.name || "").split(' ')[0],
            type: 'achievement',
            message: `${userData.nickname || (userData.name || "").split(' ')[0]} reached a ${newStreak}x streak! 🔥`,
            value: newStreak
          });
        }

        batch.update(userRef, {
          coins: increment(COINS_PER_QUIZ),
          totalEarnings: increment(COINS_PER_QUIZ),
          weeklyCoins: increment(COINS_PER_QUIZ),
          monthlyCoins: increment(COINS_PER_QUIZ),
          dailyQuizzes: currentDaily + 1,
          totalQuizzes: increment(1),
          quizDate: today,
          ...achievementUpdate
        });

        const txRef = doc(collection(db, 'users', userData.uid, 'transactions'));
        batch.set(txRef, {
          type: 'quiz',
          amount: COINS_PER_QUIZ,
          note: 'Math Master Quiz Reward',
          createdAt: Date.now()
        });

        await batch.commit();
        triggerCoinAnimation(15);
        
        setTimeout(() => {
          setShowFeedbackOverlay(null);
          generateQuestion();
          setLoading(false);
        }, 1200);
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `users/${userData.uid}`);
        toast.error("Failed to reward coins");
        setLoading(false);
      }
      }); setShowQuizAd(true);
    } else {
      setResult('wrong');
      setStreak(0);
      setShowFeedbackOverlay('wrong');
      
      // Reset database perfect streak on mistake
      try {
        updateDoc(doc(db, 'users', userData.uid), {
          perfectStreak: 0
        });
      } catch (err) {
        console.error("Failed to reset streak:", err);
      }

      setTimeout(() => {
        setShowFeedbackOverlay(null);
        generateQuestion();
      }, 1500);
    }
  };

  const handleTriviaAnswer = async (optKey: string) => {
    if (selectedTrivia !== null || result !== null) return;
    
    const solveTime = Date.now() - quizStartTime;
    if (solveTime < 1000) {
      reportViolation("Solving effort too low. Answered too quickly.");
      return;
    }

    setSelectedTrivia(optKey);
    setQuestionsAnswered(prev => prev + 1);

    if (optKey === triviaQuestion?.a) {
      setResult('correct');
      setStreak(prev => prev + 1);
      setShowFeedbackOverlay('correct');
      setLoading(true);
      if (userData.email === 'pannamandal178@gmail.com') { setLoading(false); return; }

      try {
        const today = getTodayDateString();
      setPendingQuizAction(() => async () => {
        const userRef = doc(db, 'users', userData.uid);
        
        const batch = writeBatch(db);
        
        const isNewDay = userData.quizDate !== today;
        const currentDaily = isNewDay ? 0 : (userData.dailyQuizzes || 0);

        if (currentDaily >= quizLimit) {
          toast.error("Daily quiz limit reached!");
          setLoading(false);
          return;
        }

        const newStreak = (userData.perfectStreak || 0) + 1;
        let achievementUpdate: any = {
          perfectStreak: newStreak
        };

        if (newStreak === 100 && !userData.badges?.includes('Quiz Master')) {
          achievementUpdate.badges = arrayUnion('Quiz Master');
          toast.success("🏆 Achievement Unlocked: QUIZ MASTER!", {
            duration: 6000,
            icon: '🧠'
          });
          logGlobalActivity({
            userId: userData.uid,
            userName: userData.nickname || (userData.name || "").split(' ')[0],
            type: 'achievement',
            message: `${userData.nickname || (userData.name || "").split(' ')[0]} reached a MASSIVE 100x Trivia streak! 🎓`,
            value: 100
          });
        }

        batch.update(userRef, {
          coins: increment(COINS_PER_QUIZ),
          totalEarnings: increment(COINS_PER_QUIZ),
          weeklyCoins: increment(COINS_PER_QUIZ),
          monthlyCoins: increment(COINS_PER_QUIZ),
          dailyQuizzes: currentDaily + 1,
          totalQuizzes: increment(1),
          quizDate: today,
          ...achievementUpdate
        });

        const txRef = doc(collection(db, 'users', userData.uid, 'transactions'));
        batch.set(txRef, {
          type: 'quiz',
          amount: COINS_PER_QUIZ,
          note: 'Trivia Master Quiz Reward',
          createdAt: Date.now()
        });

        await batch.commit();
        triggerCoinAnimation(15);
        
        setTimeout(() => {
          setShowFeedbackOverlay(null);
          setCurrentTriviaIdx(prev => prev + 1);
          setLoading(false);
        }, 1200);
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `users/${userData.uid}`);
        toast.error("Failed to reward coins");
        setLoading(false);
      }
    } else {
      setResult('wrong');
      }); setShowQuizAd(true);
      setStreak(0);
      setShowFeedbackOverlay('wrong');
      
      try {
        updateDoc(doc(db, 'users', userData.uid), {
          perfectStreak: 0
        });
      } catch (err) {
        console.error("Failed to reset streak:", err);
      }

      setTimeout(() => {
        setShowFeedbackOverlay(null);
        setCurrentTriviaIdx(prev => prev + 1);
      }, 1500);
    }
  };

  const quizzesLeft = userData.quizDate === getTodayDateString() 
    ? Math.max(0, quizLimit - (userData.dailyQuizzes || 0))
    : quizLimit;

  const completedToday = quizLimit - quizzesLeft;

  if (quizzesLeft === 0 && !result) {
    return (
      <>
      {showQuizAd && (
        <AdOverlay onFinish={() => {
          setShowQuizAd(false);
          if (pendingQuizAction) {
            pendingQuizAction();
            setPendingQuizAction(null);
          }
        }} />
      )}
      <div className="p-6 space-y-8 min-h-screen flex flex-col pt-12">
        <header className="flex items-center gap-4">
          <button onClick={handleBack} className="p-3 bg-surface rounded-2xl border border-border group active:scale-95 transition-all">
            <X size={20} className="text-text-muted group-hover:text-white transition-colors" />
          </button>
          <div>
            <h2 className="text-xl font-bold tracking-tight">Math Master</h2>
          </div>
        </header>

        <div className="flex-1 flex flex-col items-center justify-center text-center space-y-6">
          <div className="w-24 h-24 bg-accent/10 rounded-full flex items-center justify-center text-accent">
            <Trophy size={48} />
          </div>
          <div className="space-y-2">
            <h3 className="text-2xl font-black">Daily Limit Reached!</h3>
            <p className="text-text-muted max-w-[250px]">You've completed all {quizLimit} quizzes for today. Come back tomorrow for more rewards!</p>
          </div>
          <button 
            onClick={handleBack}
            className="h-14 px-10 bg-accent text-black font-black rounded-2xl shadow-lg shadow-accent/20 active:scale-95 transition-all"
          >
            GO BACK
          </button>
        </div>
      </div>
    );
  }

  if (quizMode === 'select') {
    return (
      <div className="p-6 space-y-8 min-h-screen flex flex-col pt-12 bg-[#0c0c16] text-[#eee]">
        <header className="flex items-center gap-4">
          <button onClick={handleBack} className="p-3 bg-surface rounded-2xl border border-border group active:scale-95 transition-all">
            <X size={20} className="text-text-muted group-hover:text-white transition-colors" />
          </button>
          <div>
            <h2 className="text-xl font-bold tracking-tight">Quiz Arena</h2>
            <p className="text-xs text-text-muted">Test your brain and earn real cash rewards!</p>
          </div>
        </header>

        {/* modern progress indicator */}
        <div className="bg-surface/50 border border-border p-5 rounded-[2rem] space-y-4 relative overflow-hidden z-10 shadow-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-accent/10 rounded-2xl text-accent border border-accent/20">
                <Trophy size={20} />
              </div>
              <div>
                <p className="text-[10px] text-text-muted uppercase font-black tracking-widest leading-none mb-1">Today's Remaining limit</p>
                <div className="flex items-baseline gap-1">
                  <span className="font-black text-lg text-white">{quizzesLeft}</span>
                  <span className="text-[10px] text-text-muted font-bold">/ {quizLimit}</span>
                </div>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-text-muted uppercase font-black tracking-widest leading-none mb-1">Current Streak</p>
              <p className="font-black text-accent text-lg">{userData.perfectStreak || 0}x</p>
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col justify-center space-y-6">
          <p className="text-xs font-black text-text-muted uppercase tracking-[0.2em] px-1">Choose your game mode:</p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              onClick={() => {
                if (quizzesLeft <= 0) {
                  toast.error("Daily limit reached! Check back tomorrow.");
                  return;
                }
                setQuizMode('math');
              }}
              className="p-6 bg-surface border border-border rounded-[2.5rem] text-left hover:border-accent/40 active:scale-[0.98] transition-all group flex flex-col justify-between h-48 relative overflow-hidden text-white"
            >
              <div className="absolute top-0 right-0 w-24 h-24 bg-accent/5 rounded-full blur-2xl group-hover:bg-accent/10 transition-all" />
              <div className="w-12 h-12 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent">
                <Brain size={24} />
              </div>
              <div>
                <h3 className="font-extrabold text-white text-lg group-hover:text-accent transition-colors">Math Master</h3>
                <p className="text-xs text-text-muted mt-1">Generate random sum equations and solve within 15 seconds to win.</p>
              </div>
            </button>

            <button
              onClick={() => {
                if (quizzesLeft <= 0) {
                  toast.error("Daily limit reached! Check back tomorrow.");
                  return;
                }
                setQuizMode('trivia');
              }}
              className="p-6 bg-surface border border-border rounded-[2.5rem] text-left hover:border-accent/40 active:scale-[0.98] transition-all group flex flex-col justify-between h-48 relative overflow-hidden text-white"
            >
              <div className="absolute top-0 right-0 w-24 h-24 bg-accent/5 rounded-full blur-2xl group-hover:bg-accent/10 transition-all" />
              <div className="w-12 h-12 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent">
                <Trophy size={24} />
              </div>
              <div>
                <h3 className="font-extrabold text-white text-lg group-hover:text-accent transition-colors">Trivia Zone</h3>
                <p className="text-xs text-text-muted mt-1">Multiple choice questions created by admin. Pick the right choices A, B, C, D to win.</p>
              </div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (quizMode === 'trivia' && customQuizzes.length === 0 && !loading) {
    return (
      <div className="p-6 space-y-8 min-h-screen flex flex-col pt-12 items-center justify-center text-center bg-[#0c0c16]">
        <div className="w-20 h-20 bg-accent/10 border border-accent/20 text-accent rounded-full flex items-center justify-center mb-4 animate-bounce">
          <Brain size={36} />
        </div>
        <h3 className="text-xl font-black text-white">No Custom Quizzes Active!</h3>
        <p className="text-xs text-text-muted max-w-[280px] mt-2 mb-6">
          Admin hasn't uploaded any live trivia questions to the database yet. Try playing the Math quiz mode!
        </p>
        <button
          onClick={() => setQuizMode('select')}
          className="h-12 px-6 bg-accent text-black font-black uppercase text-xs tracking-widest rounded-2xl shadow-lg active:scale-95 transition-all animate-pulse"
        >
          Back To Modes
        </button>
      </div>
    );
  }

  return (
    <div className={cn(
      "p-6 space-y-8 min-h-screen relative overflow-hidden transition-colors duration-300",
      isSuspicious ? "bg-red-950/40" : "bg-[#0c0c16]"
    )}>
      <AnimatePresence>
        {isSuspicious && (
          <motion.div
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -50, opacity: 0 }}
            className="fixed top-0 left-0 right-0 z-[110] bg-red-600 text-white py-3 px-6 flex items-center justify-center gap-3 font-black uppercase tracking-tighter shadow-2xl"
          >
            <AlertCircle size={24} className="animate-pulse" />
            <span>Suspicious Activity Detected: {suspiciousReason}</span>
          </motion.div>
        )}
        {showFeedbackOverlay && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={cn(
              "fixed inset-0 z-[100] flex items-center justify-center pointer-events-none backdrop-blur-[2px]",
              showFeedbackOverlay === 'correct' ? "bg-accent/10" : "bg-red-500/10"
            )}
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 1.5, opacity: 0 }}
              className="flex flex-col items-center"
            >
              <div className={cn(
                "w-24 h-24 rounded-full flex items-center justify-center mb-4",
                showFeedbackOverlay === 'correct' ? "bg-accent text-black" : "bg-red-500 text-white"
              )}>
                {showFeedbackOverlay === 'correct' ? <CheckCircle2 size={48} /> : <X size={48} />}
              </div>
              <h2 className={cn(
                "text-3xl font-black uppercase tracking-tighter",
                showFeedbackOverlay === 'correct' ? "text-accent" : "text-red-500"
              )}>
                {showFeedbackOverlay === 'correct' ? "Correct!" : "Wrong!"}
              </h2>
              {showFeedbackOverlay === 'correct' && (
                <p className="text-white font-bold mt-2">+{COINS_PER_QUIZ} COINS</p>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <header className="flex items-center justify-between relative z-10">
        <div className="flex items-center gap-4">
          <button onClick={handleBack} className="p-3 bg-surface rounded-2xl border border-border group active:scale-95 transition-all">
            <X size={20} className="text-text-muted group-hover:text-white transition-colors" />
          </button>
          <div>
            <h2 className="text-xl font-bold tracking-tight">Math Master</h2>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
              <p className="text-xs text-text-muted font-medium">Live Session</p>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end">
          <div className="flex items-center gap-2 bg-accent/10 px-3 py-1.5 rounded-xl border border-accent/20">
            <TrendingUp size={14} className="text-accent" />
            <span className="text-xs font-black text-accent">{streak}x</span>
          </div>
        </div>
      </header>

      {/* Modern Progress Card */}
      <div className="bg-surface/50 border border-border p-5 rounded-[2rem] space-y-4 relative overflow-hidden z-10 shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-accent/10 rounded-2xl text-accent border border-accent/20">
              <Trophy size={20} />
            </div>
            <div>
              <p className="text-[10px] text-text-muted uppercase font-black tracking-widest leading-none mb-1">Daily Mastery</p>
              <div className="flex items-baseline gap-1">
                <span className="font-black text-lg text-white">{completedToday}</span>
                <span className="text-[10px] text-text-muted font-bold">/ {quizLimit}</span>
              </div>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-text-muted uppercase font-black tracking-widest leading-none mb-1">Lifetime</p>
            <p className="font-black text-accent text-lg">{userData.totalQuizzes || 0}</p>
          </div>
        </div>
        
        <div className="space-y-2">
          <div className="flex justify-between items-center px-1">
             <span className="text-[9px] font-black text-text-muted uppercase tracking-tighter">Daily Progress</span>
             <span className="text-[10px] font-black text-accent">{Math.round((completedToday/quizLimit)*100)}%</span>
          </div>
          <div className="w-full h-3 bg-white/5 rounded-full overflow-hidden p-0.5 border border-white/5">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${(completedToday / quizLimit) * 100}%` }}
              transition={{ type: "spring", damping: 20, stiffness: 100 }}
              className="h-full bg-gradient-to-r from-accent/50 to-accent rounded-full shadow-[0_0_15px_rgba(0,255,136,0.4)]"
            />
          </div>
        </div>
      </div>

      <motion.div 
        animate={isSuspicious ? { x: [-10, 10, -10, 10, 0] } : {}}
        transition={{ duration: 0.4 }}
        className="glass-card p-6 flex flex-col items-center justify-center space-y-10 bg-gradient-to-b from-accent/5 to-transparent relative overflow-hidden group z-10 min-h-[460px] border shadow-2xl"
        style={isSuspicious ? { borderColor: '#ef4444', boxShadow: '0 0 30px rgba(239, 68, 68, 0.2)' } : {}}
      >
        <div className="relative">
          <svg className="w-40 h-40 transform -rotate-90">
            <circle cx="80" cy="80" r="74" stroke="currentColor" strokeWidth="6" fill="transparent" className="text-white/5" />
            <motion.circle 
              cx="80" cy="80" r="74" 
              stroke="currentColor" strokeWidth="6" fill="transparent" 
              className={cn(result === 'correct' ? "text-accent" : result === 'wrong' ? "text-red-500" : "text-accent")}
              strokeDasharray={465}
              initial={{ strokeDashoffset: 0 }}
              animate={{ strokeDashoffset: 465 - (timeLeft / 15) * 465 }}
              transition={{ duration: 1, ease: "linear" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {result === 'correct' ? (
              <motion.div initial={{ scale: 0, rotate: -45 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring' }}><Check size={48} className="text-accent" /></motion.div>
            ) : result === 'wrong' ? (
              <motion.div initial={{ scale: 0, rotate: 45 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring' }}><X size={48} className="text-red-500" /></motion.div>
            ) : (
              <motion.span 
                key={timeLeft}
                initial={{ scale: 0.8, opacity: 0.5 }}
                animate={{ scale: 1, opacity: 1 }}
                className={cn("text-5xl font-black font-mono", timeLeft <= 5 ? "text-red-500" : "text-white")}
              >
                {timeLeft}
              </motion.span>
            )}
            <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest mt-1">SEC</p>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {quizMode === 'math' ? (
            <motion.div 
              key={question?.q}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="text-center space-y-4"
            >
              <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-accent/60">Solve this</p>
              <h1 className="text-5xl font-black tracking-tighter text-white drop-shadow-lg">{question?.q}</h1>
            </motion.div>
          ) : (
            <motion.div 
              key={triviaQuestion?.q}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="text-center space-y-4 px-2"
            >
              <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-accent/60">Choose the correct answer</p>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white drop-shadow-lg leading-snug">{triviaQuestion?.q}</h1>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
          {quizMode === 'math' ? (
            question?.options.map((opt, i) => (
              <motion.button
                key={`${question.q}-${i}`}
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: i * 0.05 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleAnswer(opt)}
                disabled={result !== null || loading || quizzesLeft === 0}
                className={cn(
                  "h-20 rounded-2xl font-black text-xl transition-all border-2 flex items-center justify-center relative overflow-hidden",
                  selected === opt 
                    ? (opt === question.a ? "bg-accent text-black border-accent shadow-[0_0_20px_rgba(0,255,136,0.3)]" : "bg-red-500 text-white border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.3)]")
                    : (result !== null && opt === question.a ? "bg-accent/20 border-accent text-accent" : "bg-surface/50 border-border text-white/50 hover:border-white/20 hover:text-white hover:bg-surface")
                )}
              >
                {opt}
                {selected === opt && (
                  <motion.div 
                    initial={{ scale: 0 }}
                    animate={{ scale: 2 }}
                    className="absolute inset-0 bg-white/20 rounded-full"
                  />
                )}
              </motion.button>
            ))
          ) : (
            triviaQuestion?.options.map((opt, i) => (
              <motion.button
                key={`${triviaQuestion.q}-${i}`}
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: i * 0.05 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleTriviaAnswer(opt.key)}
                disabled={result !== null || loading || quizzesLeft === 0}
                className={cn(
                  "py-4 px-6 rounded-2xl font-bold text-sm transition-all border-2 flex items-center justify-start gap-4 relative overflow-hidden text-left min-h-[64px]",
                  selectedTrivia === opt.key 
                    ? (opt.key === triviaQuestion.a ? "bg-accent text-black border-accent shadow-[0_0_20px_rgba(0,255,136,0.3)]" : "bg-red-500 text-white border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.3)]")
                    : (result !== null && opt.key === triviaQuestion.a ? "bg-accent/20 border-accent text-accent" : "bg-surface/50 border-border text-white/70 hover:border-white/20 hover:text-white hover:bg-surface")
                )}
              >
                <span className={cn(
                  "w-8 h-8 rounded-full border flex items-center justify-center font-black text-xs shrink-0",
                  selectedTrivia === opt.key 
                    ? (opt.key === triviaQuestion.a ? "bg-black/10 border-black/20 text-black" : "bg-black/10 border-black/20 text-white")
                    : (result !== null && opt.key === triviaQuestion.a ? "bg-accent/10 border-accent text-accent" : "bg-white/10 border-white/15 text-white/50")
                )}>
                  {opt.key}
                </span>
                <span className="truncate pr-2">{opt.val}</span>
                {selectedTrivia === opt.key && (
                  <motion.div 
                    initial={{ scale: 0 }}
                    animate={{ scale: 2 }}
                    className="absolute inset-0 bg-white/10 rounded-full pointer-events-none"
                  />
                )}
              </motion.button>
            ))
          )}
        </div>
      </motion.div>

      <div className="flex-1 flex flex-col justify-end space-y-4 pb-4 mt-auto">
        <AnimatePresence mode="wait">
          {result === 'correct' ? (
            <motion.div 
              key="correct-feedback"
              initial={{ x: -20, opacity: 0 }} 
              animate={{ x: 0, opacity: 1 }} 
              exit={{ x: 20, opacity: 0 }}
              className="p-4 bg-accent/5 border border-accent/10 rounded-2xl flex items-center gap-4 animate-pulse"
            >
               <div className="w-10 h-10 rounded-xl bg-accent text-black flex items-center justify-center shadow-lg"><Star size={18} fill="currentColor" /></div>
               <div>
                 <p className="font-extrabold text-accent uppercase tracking-wider text-xs">Perfect Answer!</p>
                 <p className="text-[10px] text-text-muted">Streak: {streak} | Reward: +{COINS_PER_QUIZ} coins</p>
               </div>
            </motion.div>
          ) : result === 'wrong' ? (
            <motion.div 
              key="wrong-feedback"
              initial={{ x: 20, opacity: 0 }} 
              animate={{ x: 0, opacity: 1 }} 
              exit={{ x: -20, opacity: 0 }}
              className="p-4 bg-red-500/5 border border-red-500/10 rounded-2xl flex items-center gap-4"
            >
               <div className="w-10 h-10 rounded-xl bg-red-500 text-white flex items-center justify-center shadow-lg"><Info size={18} /></div>
               <div>
                 <p className="font-extrabold text-red-500 uppercase tracking-wider text-xs">Incorrect Result</p>
                 <p className="text-[10px] text-text-muted">
                   {quizMode === 'math' ? `The answer was ${question?.a}.` : `The correct option was Option ${triviaQuestion?.a}.`} Resetting streak...
                 </p>
               </div>
            </motion.div>
          ) : (
            <motion.div
              key="idle-feedback"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center"
            >
              <p className="text-text-muted text-[9px] font-black uppercase tracking-[0.3em] animate-pulse">
                {quizMode === 'math' ? 'Choose the correct sum' : 'Choose the correct option'}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Decorative Elements */}
      <div className="absolute top-1/4 -right-20 w-80 h-80 bg-accent/5 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-1/4 -left-20 w-80 h-80 bg-accent/5 rounded-full blur-[100px] pointer-events-none" />
    </div>
  );
}

function SocialTicker() {
  const [events, setEvents] = useState<any[]>([]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    // Listen for recent activities
    const qAct = query(
      collection(db, 'activities'),
      orderBy('createdAt', 'desc'),
      limit(10)
    );
    
    const unsub = onSnapshot(qAct, (snap) => {
      const actEvents = snap.docs.map(d => {
        const data = d.data();
        let icon = <Zap size={12}/>;
        if (data.type === 'redeem') icon = <Wallet size={12}/>;
        if (data.type === 'level_up') icon = <TrendingUp size={12}/>;
        if (data.type === 'achievement') icon = <Trophy size={11}/>;
        if (data.type === 'referral') icon = <Users size={12}/>;
        
        return {
          id: d.id,
          type: data.type,
          text: data.message,
          icon
        };
      });

      if (actEvents.length > 0) {
        setEvents(actEvents);
      } else {
        // Fallback to static messages if no activity yet
        setEvents([
          { id: 'm1', type: 'system', text: "Join 10,000+ users earning daily!", icon: <Zap size={12}/> },
          { id: 'm2', type: 'system', text: "Solve quizzes to reach new ranks!", icon: <Trophy size={11}/> },
          { id: 'm3', type: 'system', text: "Refer friends for bonus credits!", icon: <Users size={12}/> }
        ]);
      }
    }, (err) => {
      console.error("Activity Ticker error:", err);
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    if (events.length <= 1) return;
    const interval = setInterval(() => {
      setIndex(prev => (prev + 1) % events.length);
    }, 4500);
    return () => clearInterval(interval);
  }, [events]);

  if (events.length === 0) return null;

  return (
    <div className="mx-auto w-full max-w-[320px] bg-white/5 border border-white/5 rounded-full py-2.5 px-4 shadow-sm overflow-hidden h-10 flex items-center justify-center">
      <AnimatePresence mode="wait">
        <motion.div
          key={events[index]?.id || index}
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -20, opacity: 0 }}
          transition={{ duration: 0.5, ease: "circOut" }}
          className="flex items-center gap-2.5 justify-center w-full"
        >
          <div className="text-accent shrink-0">{events[index]?.icon}</div>
          <p className="text-[10px] font-black text-text-primary truncate uppercase tracking-tight">
            {events[index]?.text}
          </p>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}


function AnimatedCounter({ value, className }: { value: number; className?: string }) {
  const [displayValue, setDisplayValue] = useState(value);

  useEffect(() => {
    let start = displayValue;
    const end = value;
    if (start === end) return;

    const duration = 1000;
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing function (easeOutExpo)
      const easeProgress = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      
      const current = Math.floor(start + (end - start) * easeProgress);
      setDisplayValue(current);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [value]);

  return <span className={className}>{displayValue.toLocaleString()}</span>;
}

function FloatingCoinAnimation() {
  const [coins, setCoins] = useState<{ id: number; x: number; y: number }[]>([]);

  useEffect(() => {
    const handleTrigger = (e: any) => {
      const count = e.detail?.count || 10;
      const startX = e.detail?.x || window.innerWidth / 2;
      const startY = e.detail?.y || window.innerHeight / 2;
      
      const newCoins = Array.from({ length: count }).map((_, i) => ({
        id: Date.now() + i,
        x: startX + (Math.random() - 0.5) * 60,
        y: startY + (Math.random() - 0.5) * 60
      }));
      
      setCoins(prev => [...prev, ...newCoins]);
      
      setTimeout(() => {
        setCoins(prev => prev.filter(c => !newCoins.find(nc => nc.id === c.id)));
      }, 1500);
    };

    window.addEventListener('trigger-coin-animation', handleTrigger);
    return () => window.removeEventListener('trigger-coin-animation', handleTrigger);
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-[9999] overflow-hidden">
      <AnimatePresence>
        {coins.map(coin => (
          <motion.div
            key={coin.id}
            initial={{ x: coin.x, y: coin.y, scale: 0, opacity: 1, rotate: 0 }}
            animate={{ 
              x: 20, 
              y: 60, 
              scale: [0, 1.2, 0.8],
              opacity: [1, 1, 0],
              rotate: 360
            }}
            transition={{ duration: 1, ease: "backIn" }}
            className="absolute"
          >
            <div className="w-5 h-5 bg-accent rounded-full flex items-center justify-center shadow-[0_0_15px_rgba(0,255,136,0.5)] border border-white/20">
              <Star size={10} fill="black" className="text-black" />
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
    </>
  );
}

const triggerCoinAnimation = (count = 10, x?: number, y?: number) => {
  window.dispatchEvent(new CustomEvent('trigger-coin-animation', { detail: { count, x, y } }));
};

const logGlobalActivity = async (activity: Omit<Activity, 'createdAt'>) => {
  try {
    await addDoc(collection(db, 'activities'), {
      ...activity,
      createdAt: Date.now()
    });
  } catch (err) {
    console.error("Error logging activity:", err);
  }
};

function HomeScreen({ userData, setShowWithdraw, onOpenTab, appConfig }: { userData: UserData, setShowWithdraw: (show: boolean) => void, onOpenTab: (tab: string) => void, appConfig: any }) {
  const [claimingBonus, setClaimingBonus] = useState(false);
  const [showFact, setShowFact] = useState(false);
  const [watchingAd, setWatchingAd] = useState(false);
  const [adTimer, setAdTimer] = useState(0);
  const [adCooldown, setAdCooldown] = useState(0);
  const [showBonusAd, setShowBonusAd] = useState(false);
  const [pendingBonusAction, setPendingBonusAction] = useState<(() => void) | null>(null);

  const quizLimit = appConfig.dailyQuizLimit || DAILY_QUIZ_LIMIT;
  const [showAdSuccess, setShowAdSuccess] = useState(false);
  const [successTimer, setSuccessTimer] = useState(0);

  useEffect(() => {
    let timer: any;
    if (adCooldown > 0) {
      timer = setInterval(() => setAdCooldown(prev => Math.max(0, prev - 100)), 100);
    }
    return () => clearInterval(timer);
  }, [adCooldown]);

  const handleDailyBonus = async () => {
    if (userData.email === 'pannamandal178@gmail.com') {
      toast.error('Admin cannot earn coins!');
      return;
    }
    const today = getTodayDateString();
    if (userData.lastBonusDate === today) {
      toast.error('Already claimed today!');
      return;
    }
    // Show 8s ad first, then give bonus
    setPendingBonusAction(() => async () => {
      setClaimingBonus(true);
      await new Promise(r => setTimeout(r, 500));
      try {
        const batch = writeBatch(db);
        const userRef = doc(db, 'users', userData.uid);
        batch.update(userRef, {
          coins: increment(COINS_DAILY_BONUS),
          totalEarnings: increment(COINS_DAILY_BONUS),
          weeklyCoins: increment(COINS_DAILY_BONUS),
          monthlyCoins: increment(COINS_DAILY_BONUS),
          lastBonusDate: today
        });
        const tx: Transaction = {
          type: 'bonus',
          amount: COINS_DAILY_BONUS,
          note: 'Daily bonus claimed',
          createdAt: Date.now()
        };
        const txRef = doc(collection(db, 'users', userData.uid, 'transactions'));
        batch.set(txRef, tx);
        await batch.commit();
        triggerCoinAnimation(20);
        toast.success('Bonus claimed! +10 coins');
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, `users/${userData.uid}`);
        toast.error('Failed to claim bonus');
      } finally {
        setClaimingBonus(false);
      }
    });
    setShowBonusAd(true);
  };

  const handleWatchAd = async () => {
    if (userData.email === 'pannamandal178@gmail.com') {
      toast.error('Admin cannot earn coins!');
      return;
    }
    const today = getTodayDateString();
    let adsCount = userData.adsDate === today ? (userData.dailyAds || 0) : 0;

    if (adsCount >= DAILY_AD_LIMIT) {
      toast.error('Daily ad limit reached!');
      return;
    }
    if (adCooldown > 0) {
      toast.error(`Please wait ${Math.ceil(adCooldown/1000)}s`);
      return;
    }

    setWatchingAd(true);
    setAdTimer(15);
    
    const startTime = Date.now();
    const timerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      setAdTimer(Math.max(0, 15 - elapsed));
    }, 100); // Higher frequency for smoother UI

    const rewardAmount = appConfig.coinsPerAd || COINS_PER_AD;

    try {
      await adService.showRewardedAd({
        googleH5AdClient: appConfig.googleH5AdClient,
        monetagZoneId: appConfig.monetagZoneId,
        onEvent: async (event, message) => {
          if (event === 'loading' && message) {
            toast(message, { icon: '⏳' });
          } else if (event === 'error') {
            clearInterval(timerInterval);
            setAdTimer(0);
            toast.error(message || 'Ad failed to load');
            setWatchingAd(false);
          } else if (event === 'completed') {
            clearInterval(timerInterval);
            setAdTimer(0);
            
            // Final check to prevent injection/speed hacks
            const totalElapsed = Date.now() - startTime;
            if (totalElapsed < 5000) { // Reduced to 5s for better testing and short ads
              toast.error('Ad finished too quickly! Reward voided.');
              setWatchingAd(false);
              return;
            }

            try {
              const batch = writeBatch(db);
              const userRef = doc(db, 'users', userData.uid);

              batch.update(userRef, {
                coins: increment(rewardAmount),
                totalEarnings: increment(rewardAmount),
                weeklyCoins: increment(rewardAmount),
                monthlyCoins: increment(rewardAmount),
                dailyAds: increment(1),
                adsDate: today
              });

              const tx: Transaction = {
                type: 'ad',
                amount: rewardAmount,
                note: 'Watched an ad',
                createdAt: Date.now()
              };
              const txRef = doc(collection(db, 'users', userData.uid, 'transactions'));
              batch.set(txRef, tx);

              await batch.commit();
              triggerCoinAnimation(12);
              setAdCooldown(AD_COOLDOWN_MS);
              
              // Success Sequence
              setShowAdSuccess(true);
              setSuccessTimer(3);
              const sTimer = setInterval(() => {
                setSuccessTimer(prev => Math.max(0, prev - 1));
              }, 1000);

              setTimeout(() => {
                clearInterval(sTimer);
                setShowAdSuccess(false);
                setWatchingAd(false);
              }, 3000);
            } catch (e) {
              handleFirestoreError(e, OperationType.WRITE, `users/${userData.uid}`);
              toast.error('Failed to credit coins');
              setWatchingAd(false);
            }
          }
        }
      });
    } catch (e) {
      toast.error('Ad service error');
      setWatchingAd(false);
      clearInterval(timerInterval);
      setAdTimer(0);
    }
  };

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
  };

  return (
    <>
      {showBonusAd && (
        <AdOverlay onFinish={() => {
          setShowBonusAd(false);
          if (pendingBonusAction) {
            pendingBonusAction();
            setPendingBonusAction(null);
          }
        }} />
      )}
    <motion.div 
      variants={container}
      initial="hidden"
      animate="show"
      className="p-6 space-y-6"
    >
      <motion.header variants={item} className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <img 
              src={userData.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(userData.name)}&background=00ff88&color=000`} 
              className="w-12 h-12 rounded-2xl border-2 border-accent/20 object-cover shadow-lg" 
              alt="" 
            />
            <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-accent rounded-full border-2 border-background" />
          </div>
          <div>
            <h3 className="font-bold text-xl leading-none tracking-tight">Hello, {(userData.name || "").split(' ')[0]}!</h3>
            <span className="text-xs text-text-muted font-medium">Ready to boost your earnings?</span>
          </div>
        </div>
        <button className="p-3 bg-surface rounded-2xl border border-border hover:border-accent/40 transition-all active:scale-90"><Bell size={20} className="text-text-muted" /></button>
      </motion.header>

      {/* Balance Card */}
      <motion.div 
        variants={item}
        className="glass-card p-6 bg-gradient-to-br from-accent/10 via-accent/5 to-transparent border-accent/20 relative overflow-hidden group"
      >
        <div className="relative z-10 space-y-5">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Wallet size={14} className="text-accent" />
                <p className="text-[10px] text-accent font-bold uppercase tracking-[0.2em] opacity-80">Available Coins</p>
              </div>
              <div className="flex items-end gap-2">
                <AnimatedCounter value={userData.coins} className="text-5xl font-black font-mono tracking-tighter text-white" />
                <div className="mb-2 p-1.5 bg-accent/20 rounded-lg">
                  <Star fill="currentColor" size={12} className="text-accent" />
                </div>
              </div>
              <p className="text-text-muted font-mono text-sm font-medium">{formatCurrency(userData.coins)}</p>
            </div>
            
            <motion.button 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                const isQuizCompleted = userData.quizDate === getTodayDateString() && (userData.dailyQuizzes || 0) >= quizLimit;
                if (!isQuizCompleted) {
                  toast.error(`Task Required: Complete all ${quizLimit} math quizzes to unlock withdrawals!`, {
                    icon: '🧠',
                    duration: 4000
                  });
                  return;
                }
                setShowWithdraw(true);
              }}
              className={cn(
                "px-6 py-4 font-bold rounded-2xl shadow-xl transition-all flex items-center gap-2 group-hover:glow-accent",
                userData.quizDate === getTodayDateString() && (userData.dailyQuizzes || 0) >= quizLimit
                  ? "bg-accent text-black"
                  : "bg-white/10 text-text-muted border border-white/5"
              )}
            >
              {userData.quizDate !== getTodayDateString() || (userData.dailyQuizzes || 0) < quizLimit ? <Lock size={16} /> : <ArrowUpRight size={18} />}
              Redeem
            </motion.button>
          </div>

          <div className="pt-4 border-t border-white/5 flex gap-4">
            <div className="flex-1 space-y-1">
              <p className="text-[9px] uppercase font-bold text-text-muted tracking-widest">Weekly Earnings</p>
              <div className="flex items-center gap-1">
                <span className="text-sm font-mono font-bold">+</span>
                <AnimatedCounter value={userData.weeklyCoins || 0} className="text-sm font-mono font-bold" />
              </div>
            </div>
            <div className="flex-1 space-y-1">
              <p className="text-[9px] uppercase font-bold text-text-muted tracking-widest">Monthly Earnings</p>
              <div className="flex items-center gap-1">
                <span className="text-sm font-mono font-bold">+</span>
                <AnimatedCounter value={userData.monthlyCoins || 0} className="text-sm font-mono font-bold" />
              </div>
            </div>
          </div>
        </div>
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-accent/5 rounded-full blur-[80px]" />
        <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-accent/5 rounded-full blur-[80px]" />
      </motion.div>

      {/* Activity Grid (Bento) */}
      <div className="grid grid-cols-2 gap-4">
        {/* Ads Card */}
        {appConfig.watchAndEarnEnabled !== false && (
          <motion.div 
            variants={item}
            className="col-span-2 glass-card p-5 relative overflow-hidden group cursor-pointer active:scale-[0.98] transition-all"
            onClick={() => handleWatchAd()}
          >
            <div className="flex justify-between items-start relative z-10">
              <div className="space-y-4 flex-1">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-400 group-hover:bg-blue-500 group-hover:text-white transition-all duration-300">
                    <Video size={24} />
                  </div>
                  <div>
                    <h4 className="font-bold text-lg">Watch & Earn</h4>
                    <p className="text-xs text-text-muted">Earn +{appConfig.coinsPerAd || COINS_PER_AD} coins per video</p>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-text-muted">
                    <span>Daily Progress</span>
                    <span>{userData.adsDate === getTodayDateString() ? userData.dailyAds : 0}/{DAILY_AD_LIMIT}</span>
                  </div>
                  <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${((userData.adsDate === getTodayDateString() ? userData.dailyAds : 0) / DAILY_AD_LIMIT) * 100}%` }}
                      className="h-full bg-blue-400"
                    />
                  </div>
                </div>
              </div>
              
              <div className="ml-4">
                {watchingAd ? (
                  <div className="flex flex-col items-center">
                    <Loader2 className="animate-spin text-blue-400" size={24} />
                    <span className="text-[10px] font-black text-blue-400 mt-1">{adTimer}s</span>
                  </div>
                ) : adCooldown > 0 ? (
                  <CooldownCircle remaining={adCooldown} total={AD_COOLDOWN_MS} />
                ) : (
                  <div className="p-2 bg-white/5 rounded-full text-blue-400 group-hover:translate-x-1 transition-transform">
                    <ChevronRight size={20} />
                  </div>
                )}
              </div>
            </div>
            <div className="absolute top-0 right-0 p-4 opacity-[0.03] group-hover:opacity-[0.07] transition-opacity">
              <Video size={100} />
            </div>
          </motion.div>
        )}

        {/* Quiz Card */}
        <motion.div 
          variants={item}
          onClick={() => onOpenTab('quiz')}
          className="glass-card p-5 space-y-4 group cursor-pointer active:scale-[0.98] transition-all border-l-4 border-l-purple-500/50"
        >
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400 group-hover:bg-purple-500 group-hover:text-white transition-all">
            <Brain size={20} />
          </div>
          <div>
            <h4 className="font-bold">Math Master</h4>
            <p className="text-[10px] text-text-muted">Solve tasks, earn +{COINS_PER_QUIZ}</p>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full">
              {userData.quizDate === getTodayDateString() ? userData.dailyQuizzes : 0}/{quizLimit}
            </span>
            <ArrowRight size={14} className="text-text-muted group-hover:text-purple-400 transition-colors" />
          </div>
          <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden mt-1">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, ((userData.quizDate === getTodayDateString() ? userData.dailyQuizzes : 0) / quizLimit) * 100)}%` }}
              className="h-full bg-purple-500"
            />
          </div>
        </motion.div>


        {/* Refer Card */}
        <motion.div 
          variants={item}
          onClick={() => onOpenTab('refer')}
          className="glass-card p-5 space-y-4 group cursor-pointer active:scale-[0.98] transition-all border-l-4 border-l-orange-500/50"
        >
          <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-400 group-hover:bg-orange-500 group-hover:text-white transition-all">
            <Users size={20} />
          </div>
          <div>
            <h4 className="font-bold">Affiliate</h4>
            <p className="text-[10px] text-text-muted">Earn +{REFERRAL_BONUS} per user</p>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded-full">
              {userData.totalReferrals} refers
            </span>
            <ArrowRight size={14} className="text-text-muted group-hover:text-orange-400 transition-colors" />
          </div>
        </motion.div>
      </div>

      {/* Daily Bonus Section */}
      <motion.section variants={item} className="space-y-4 pb-4">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-text-muted uppercase tracking-widest flex items-center gap-2">
            <Gift size={14} className="text-accent" /> Extra Tasks
          </h4>
        </div>
        <div className="glass-card p-5 flex items-center justify-between group hover:border-accent/40 bg-gradient-to-r from-accent/5 to-transparent">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center relative overflow-hidden">
               <motion.div 
                animate={{ rotate: claimingBonus ? 360 : 0 }}
                transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                className="relative z-10"
               >
                <Gift className="text-accent" size={28} />
               </motion.div>
               <div className="absolute inset-0 bg-accent/5 animate-pulse" />
            </div>
            <div>
              <h5 className="font-bold text-lg">Daily Chest</h5>
              <p className="text-xs text-text-muted font-medium">Claim your +{COINS_DAILY_BONUS} credits</p>
            </div>
          </div>
          <button 
            disabled={claimingBonus || userData.lastBonusDate === getTodayDateString()}
            onClick={handleDailyBonus}
            className={cn(
              "px-6 py-3 rounded-2xl text-sm font-bold transition-all",
              userData.lastBonusDate === getTodayDateString() 
                ? "bg-white/5 text-text-muted border border-white/5 cursor-not-allowed" 
                : "bg-accent text-black hover:scale-105 active:scale-95 shadow-lg shadow-accent/20"
            )}
          >
            {claimingBonus ? <Loader2 className="animate-spin" size={18} /> : (userData.lastBonusDate === getTodayDateString() ? 'Claimed' : 'Open')}
          </button>
        </div>
      </motion.section>

      {/* Social Ticker */}
      <motion.section variants={item} className="pb-10">
        <SocialTicker />
      </motion.section>
      
      {/* Ad Watching Overlay */}
      <AnimatePresence>
        {watchingAd && adTimer > 0 && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-[280px] glass-card p-10 flex flex-col items-center space-y-6 text-center shadow-2xl border-accent/20 bg-gradient-to-b from-accent/10 to-transparent"
            >
              <div className="relative">
                <div className="w-24 h-24 rounded-full border-4 border-accent/10 flex items-center justify-center relative overflow-hidden">
                  <span className="font-mono font-black text-4xl text-accent">{adTimer}</span>
                  <svg className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none">
                    <circle 
                      cx="48" cy="48" r="44" 
                      fill="none" 
                      stroke="currentColor" 
                      strokeWidth="4" 
                      className="text-accent"
                      strokeDasharray={276}
                      strokeDashoffset={276 - (adTimer / 15) * 276}
                    />
                  </svg>
                </div>
              </div>
              <div className="space-y-2">
                <h3 className="font-black text-2xl uppercase tracking-tighter italic text-white line-height-none">Ad Active</h3>
                <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest leading-relaxed">
                  Stay on the tab for <span className="text-accent">{adTimer}s</span> <br/> 
                  to verify and get <span className="text-white">+{COINS_PER_AD} Coins</span>
                </p>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 bg-accent/10 rounded-xl border border-accent/20 shadow-lg shadow-accent/5">
                <Loader2 className="w-3 h-3 text-accent animate-spin" />
                <span className="text-[8px] font-black uppercase tracking-widest text-accent">Monitoring Progress</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reward Success Overlay */}
      <AnimatePresence>
        {showAdSuccess && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/90 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.8, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.8, y: 20 }}
              className="w-full max-w-sm glass-card p-10 flex flex-col items-center text-center space-y-8 bg-gradient-to-b from-accent/20 to-transparent border-accent/30"
            >
              <div className="relative">
                <motion.div 
                  animate={{ scale: [1, 1.2, 1], rotate: [0, 10, -10, 0] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                  className="w-24 h-24 bg-accent/20 rounded-full flex items-center justify-center text-accent"
                >
                  <Trophy size={48} />
                </motion.div>
                <div className="absolute -top-2 -right-2 bg-accent text-black px-3 py-1 rounded-full text-sm font-black shadow-lg">
                  +{appConfig.coinsPerAd || COINS_PER_AD}
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-3xl font-black italic uppercase tracking-tighter text-white">Awesome!</h3>
                <p className="text-text-muted font-bold text-sm">Reward successfully added to your balance.</p>
              </div>

              <div className="flex flex-col items-center gap-3">
                <div className="w-12 h-12 rounded-full border-2 border-accent/20 flex items-center justify-center relative">
                  <span className="font-mono font-black text-accent text-lg">{successTimer}</span>
                  <svg className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none">
                    <circle 
                      cx="24" cy="24" r="22" 
                      fill="none" 
                      stroke="currentColor" 
                      strokeWidth="2" 
                      className="text-accent"
                      strokeDasharray={140}
                      strokeDashoffset={140 - (successTimer / 3) * 140}
                    />
                  </svg>
                </div>
                <p className="text-[10px] text-text-muted font-black uppercase tracking-widest">Returning in {successTimer}s</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
    </>
  );
}

function StatCard({ label, value, icon }: { label: string, value: string, icon: React.ReactNode }) {
  return (
    <div className="glass-card px-3 py-4 flex flex-col items-center justify-center text-center gap-2 group hover:border-accent/40 transition-all">
      <div className="p-2 bg-white/5 rounded-xl text-text-muted group-hover:text-accent group-hover:bg-accent/10 transition-all duration-300">
        {React.cloneElement(icon as any, { size: 18 })}
      </div>
      <div className="space-y-0.5">
        <span className="text-[10px] text-text-muted font-bold uppercase tracking-wider block">{label}</span>
        <span className="font-black text-xs font-mono text-white">{value}</span>
      </div>
    </div>
  );
}
function OffersScreen({ userData, appConfig }: { userData: UserData; appConfig: any }) {
  const [myleadOffers, setMyleadOffers] = useState<any[]>([]);
  const [loadingMyLead, setLoadingMyLead] = useState(false);

  useEffect(() => {
    if (appConfig.myleadApiKey) {
      setLoadingMyLead(true);
      fetch(`https://api.mylead.eu/api/external/v1/campaign/list?token=${appConfig.myleadApiKey}`)
        .then(res => res.json())
        .then(data => {
          if (data && data.data) {
            const offers = Array.isArray(data.data) 
              ? data.data 
              : Object.values(data.data);
            setMyleadOffers(offers.slice(0, 10)); // Top 10 offers
          }
        })
        .catch(err => console.error("MyLead API Error:", err))
        .finally(() => setLoadingMyLead(false));
    }
  }, [appConfig.myleadApiKey]);

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
  };

  const cpagripPub = appConfig.cpagripPublisherId || CPAGRIP_PUBLISHER_ID;
  const cpagripWall = appConfig.cpagripOfferwallId || CPAGRIP_OFFERWALL_ID;
  const cpalead = appConfig.cpaleadId || CPALEAD_ID;
  const monlix = appConfig.monlixId || MONLIX_ID;
  const customWall = appConfig.customOfferwallUrl || CUSTOM_OFFERWALL_URL;

  return (
    <motion.div 
      variants={container}
      initial="hidden"
      animate="show"
      className="p-6 space-y-6"
    >
      <motion.div variants={item} className="space-y-1">
        <h2 className="text-3xl font-black tracking-tight">Offerwalls</h2>
        <p className="text-sm text-text-muted font-medium">Earn huge rewards by completing tasks</p>
      </motion.div>

      <div className="space-y-4">
        {appConfig.specialOffers && appConfig.specialOffers.map((offer: CustomOffer) => (
          <SpecialOfferCard 
            key={offer.id}
            title={offer.title} 
            description={offer.description}
            url={offer.url}
            coins={offer.coins}
          />
        ))}

        {myleadOffers.length > 0 && (
          <div className="space-y-3">
            <p className="text-[10px] text-accent font-black uppercase tracking-widest pl-1">Featured Deals (MyLead)</p>
            {myleadOffers.map((campaign) => (
              <SpecialOfferCard 
                key={campaign?.id || Math.random()}
                title={campaign?.name || "Premium Offer"}
                description={campaign?.description || "Earn by completing this offer"}
                url={(campaign?.url || "") + (campaign?.url?.includes('?') ? '&' : '?') + `uid=${userData.uid}`}
                coins={Math.floor(parseFloat(campaign?.payout || "0") * 100)} // Example conversion
              />
            ))}
          </div>
        )}

        {cpagripWall && (
          <OfferwallSlot 
            title="CPAGrip" 
            description="High paying mobile surveys & apps"
            icon={<Globe className="text-blue-400" />}
            url={`https://www.cpagrip.com/offerwall/${cpagripWall}?user_id=${userData.uid}`} 
          />
        )}

        {appConfig.myleadOfferwallUrl && (
          <OfferwallSlot 
            title="MyLead" 
            description="Premium offers and high payouts"
            icon={<TrendingUp className="text-accent" />}
            url={`${appConfig.myleadOfferwallUrl}${appConfig.myleadOfferwallUrl?.includes('?') ? '&' : '?'}uid=${userData.uid}`} 
          />
        )}

        {monlix && (
          <OfferwallSlot 
            title="Monlix" 
            description="Premium surveys and high-reward offers"
            icon={<TrendingUp className="text-purple-400" />}
            url={`https://offers.monlix.com/?appid=${monlix}&userid=${userData.uid}`} 
          />
        )}

        {customWall && (
          <OfferwallSlot 
            title="Premium Wall" 
            description="Special high-reward invitations"
            icon={<Star className="text-orange-400" />}
            url={`${customWall}${customWall.includes('?') ? '&' : '?'}user_id=${userData.uid}`} 
          />
        )}
      </div>
    </motion.div>
  );
}

function OfferwallSlot({ title, description, icon, url, onOpen }: { title: string; description: string; icon: React.ReactNode; url: string; onOpen?: () => void }) {
  const [show, setShow] = useState(false);
  return (
    <motion.div 
      variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
      className="glass-card overflow-hidden group"
    >
      <div className="p-5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center group-hover:bg-accent/10 group-hover:text-accent transition-all">
            {icon}
          </div>
          <div>
            <h4 className="font-bold text-lg">{title}</h4>
            <p className="text-[10px] text-text-muted font-bold uppercase tracking-wider">{description}</p>
          </div>
        </div>
        <button 
          onClick={() => {
            if (onOpen) { onOpen(); return; }
            setShow(!show);
          }}
          className={cn(
            "px-5 py-2.5 rounded-xl text-xs font-black transition-all active:scale-95",
            show ? "bg-red-500/10 text-red-500 border border-red-500/20" : "bg-accent text-black shadow-lg shadow-accent/10"
          )}
        >
          {onOpen ? 'LAUNCH' : (show ? 'CLOSE' : 'LAUNCH')}
        </button>
      </div>
      <AnimatePresence>
        {show && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="h-[600px] bg-white rounded-b-2xl">
              {url ? (
                <iframe src={url} className="w-full h-full border-none" title={title} />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-black p-10 text-center space-y-6">
                  <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center">
                    <AlertCircle size={40} className="text-gray-300" />
                  </div>
                  <div className="space-y-2">
                    <p className="font-black text-xl">Wall Offline</p>
                    <p className="text-sm text-gray-500 max-w-[240px]">This offerwall hash hasn't been configured by the administrator yet.</p>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function SpecialOfferCard({ title, description, url, coins }: { title: string; description: string; url: string; coins: number; key?: any }) {
  return (
    <motion.div 
      variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
      className="p-5 glass-card bg-gradient-to-br from-accent/10 to-transparent border-accent/20 relative overflow-hidden group"
    >
      <div className="absolute -top-12 -right-12 w-32 h-32 bg-accent opacity-5 blur-3xl rounded-full" />
      
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center text-accent">
              <Gift size={20} />
            </div>
            <div>
              <h4 className="font-black text-white">{title}</h4>
              <div className="flex items-center gap-1">
                <Star fill="currentColor" className="text-accent" size={10} />
                <span className="text-[10px] font-black text-accent font-mono">+{coins} COINS</span>
              </div>
            </div>
          </div>
          <a 
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-accent text-black text-[10px] font-black uppercase tracking-widest rounded-lg hover:scale-105 active:scale-95 transition-all shadow-lg shadow-accent/20"
          >
            Start Task
          </a>
        </div>
        
        {description && (
          <div className="p-3 bg-black/40 border border-white/5 rounded-xl">
            <div className="flex items-center gap-2 mb-1">
              <Info size={12} className="text-text-muted" />
              <p className="text-[9px] text-text-muted font-black uppercase tracking-widest">How to complete:</p>
            </div>
            <p className="text-[11px] text-gray-300 font-medium leading-relaxed">{description}</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function ReferScreen({ userData, onRedeem, appConfig }: { userData: UserData; onRedeem: (code: string) => Promise<void>; appConfig: any }) {
  const [appUrl, setAppUrl] = useState(window.location.origin);
  const [appName, setAppName] = useState('ammo-ra');
  const [redeemCode, setRedeemCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [referrals, setReferrals] = useState<ReferralRecord[]>([]);

  useEffect(() => {
    const q = query(collection(db, 'users', userData.uid, 'referrals'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snap) => {
      const records: ReferralRecord[] = [];
      snap.forEach(doc => {
        records.push({ id: doc.id, ...doc.data() } as ReferralRecord);
      });
      setReferrals(records);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `users/${userData.uid}/referrals`);
    });
    return () => unsubscribe();
  }, [userData.uid]);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'appConfig', 'general'), (snap) => {
      if (snap.exists()) {
        const data = snap.data() as any;
        if (data.appUrl) setAppUrl(data.appUrl);
        if (data.appName) setAppName(data.appName);
      }
    });
    return () => unsubscribe();
  }, []);

  const handleRedeem = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    await onRedeem(redeemCode);
    setRedeemCode('');
    setIsSubmitting(false);
  };

  const referLink = useMemo(() => {
    const code = userData.referralCode || userData.uid;
    if (!appUrl) return `${window.location.origin}/?ref=${code}`;
    const baseUrl = appUrl.endsWith('/') ? appUrl.slice(0, -1) : appUrl;
    return `${baseUrl}/?ref=${code}`;
  }, [userData.uid, userData.referralCode, appUrl]);
  
  const copyCode = () => {
    navigator.clipboard.writeText(userData.referralCode || userData.uid);
    toast.success('Referral code copied!');
  };

  const copyLink = () => {
    navigator.clipboard.writeText(referLink);
    toast.success('Referral link copied!');
  };

  const shareWA = () => {
    const bonus = appConfig.referralBonus || REFERRAL_BONUS;
    const msg = `Hey! Use my link to join ${appName} and get ${bonus} bonus coins: ${referLink}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`);
  };

  const shareTelegram = () => {
    const bonus = appConfig.referralBonus || REFERRAL_BONUS;
    const msg = `Hey! Use my link to join ${appName} and get ${bonus} bonus coins: ${referLink}`;
    window.open(`https://t.me/share/url?url=${encodeURIComponent(referLink)}&text=${encodeURIComponent(msg)}`);
  };

  const shareFB = () => {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(referLink)}`);
  };

  const shareNative = async () => {
    if (navigator.share) {
      const bonus = appConfig.referralBonus || REFERRAL_BONUS;
      try {
        await navigator.share({
          title: appName,
          text: `Join ${appName} and get ${bonus} bonus coins!`,
          url: referLink,
        });
      } catch (err) {
        console.log('Error sharing:', err);
      }
    } else {
      copyLink();
    }
  };

  const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.1 } }
  };

  const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } };

  const chartData = useMemo(() => {
    if (referrals.length === 0) return [];
    
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
    });

    const dataMap: Record<string, number> = {};
    last7Days.forEach(day => dataMap[day] = 0);

    referrals.forEach(ref => {
      const dateKey = new Date(ref.createdAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
      if (dataMap[dateKey] !== undefined) {
        dataMap[dateKey]++;
      }
    });

    return last7Days.map(date => ({
      date,
      count: dataMap[date]
    }));
  }, [referrals]);

  return (
    <motion.div 
      variants={container}
      initial="hidden"
      animate="show"
      className="p-6 space-y-8"
    >
      <motion.div variants={item} className="space-y-1">
        <h2 className="text-3xl font-black tracking-tight">Invite & Earn</h2>
        <p className="text-sm text-text-muted font-medium">Build your network, earn passive income</p>
      </motion.div>

      <motion.div variants={item} className="glass-card p-8 bg-gradient-to-br from-orange-500/10 via-transparent to-transparent border-orange-500/20 relative overflow-hidden flex flex-col items-center text-center space-y-6">
        <div className="w-20 h-20 bg-orange-500 text-black rounded-[2rem] flex items-center justify-center shadow-2xl relative z-10 animate-float">
          <Users size={36} />
        </div>
        
        <div className="space-y-2 relative z-10 w-full">
          <p className="text-[10px] text-orange-500 uppercase tracking-[0.4em] font-black">Your Unique Code (Tap to copy)</p>
          <button 
            onClick={copyCode}
            className="w-full bg-surface border border-white/5 px-6 py-4 rounded-2xl flex items-center justify-between group hover:border-accent/40 transition-all active:scale-[0.98]"
          >
            <p className="text-xl font-black font-mono tracking-tighter text-white truncate mr-4">{userData.referralCode || userData.uid}</p>
            <div className="p-3 bg-white/5 rounded-xl text-accent group-hover:bg-accent group-hover:text-black transition-all">
              <Copy size={20} />
            </div>
          </button>
        </div>

        <div className="flex flex-col gap-3 w-full relative z-10">
          <div className="grid grid-cols-2 gap-3">
            <button onClick={shareWA} className="h-14 bg-[#25D366] text-black rounded-2xl flex items-center justify-center gap-2 font-black text-xs shadow-xl shadow-[#25D366]/20 active:scale-95 transition-all">
              <Share2 size={16} /> WHATSAPP
            </button>
            <button onClick={shareTelegram} className="h-14 bg-[#0088cc] text-white rounded-2xl flex items-center justify-center gap-2 font-black text-xs shadow-xl shadow-[#0088cc]/20 active:scale-95 transition-all">
              <Send size={16} /> TELEGRAM
            </button>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <button onClick={shareFB} className="h-14 bg-[#1877F2] text-white rounded-2xl flex items-center justify-center gap-2 font-black text-xs shadow-xl shadow-[#1877F2]/20 active:scale-95 transition-all">
              <Facebook size={16} /> FACEBOOK
            </button>
            <button onClick={shareNative} className="h-14 bg-accent text-black rounded-2xl flex items-center justify-center gap-2 font-black text-xs shadow-xl shadow-accent/20 active:scale-95 transition-all">
              <Share size={16} /> MORE
            </button>
          </div>

          <button onClick={copyLink} className="h-14 bg-surface border border-border rounded-2xl flex items-center justify-center gap-2 font-black text-sm hover:border-white/20 transition-all active:scale-95 group">
            <Link size={18} className="text-accent group-hover:rotate-12 transition-transform" /> COPY INVITE LINK
          </button>
        </div>

        {!userData.referredBy && (
          <motion.div variants={item} className="w-full space-y-3 pt-4 border-t border-white/5">
            <p className="text-[10px] text-text-muted uppercase font-black tracking-widest text-left px-2">Have a Referral Code?</p>
            <div className="flex gap-2">
              <input 
                className="flex-1 bg-background border border-border rounded-2xl px-5 h-14 text-white font-bold outline-none focus:border-accent/40 transition-all text-sm"
                placeholder="Enter 8-digit code"
                value={redeemCode}
                onChange={(e) => setRedeemCode(e.target.value)}
              />
              <button 
                onClick={handleRedeem}
                disabled={isSubmitting || !redeemCode.trim()}
                className="h-14 px-6 bg-accent text-black font-black text-xs uppercase tracking-widest rounded-2xl shadow-lg shadow-accent/10 active:scale-95 transition-all disabled:opacity-50 disabled:grayscale"
              >
                {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : 'Claim'}
              </button>
            </div>
          </motion.div>
        )}

        <motion.div variants={item} className="w-full space-y-4">
          <div className="flex items-center justify-between px-2">
            <p className="text-[10px] text-orange-500 uppercase font-black tracking-widest">Network Growth</p>
            <span className="text-[10px] text-text-muted font-bold">Last 7 Days</span>
          </div>
          
          <div className="h-40 w-full bg-white/5 rounded-[2rem] p-4 border border-white/5 overflow-hidden">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ffffff05" />
                <XAxis 
                  dataKey="date" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 9, fill: '#666', fontWeight: 'bold' }}
                  dy={10}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#12121a', 
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '12px',
                    fontSize: '10px',
                    fontWeight: 'bold'
                  }}
                  itemStyle={{ color: '#f97316' }}
                  cursor={{ stroke: '#f97316', strokeWidth: 1, strokeDasharray: '4 4' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="count" 
                  stroke="#f97316" 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#colorCount)" 
                  animationDuration={1500}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
        <div className="absolute top-0 right-0 w-40 h-40 bg-orange-500/5 rounded-full blur-[60px]" />
      </motion.div>

      <div className="grid grid-cols-2 gap-4">
        <motion.div variants={item} className="glass-card p-5 space-y-2 border-l-4 border-l-accent">
          <p className="text-[10px] text-text-muted uppercase font-black tracking-widest">Total Refers</p>
          <p className="text-3xl font-black text-white">{userData.totalReferrals}</p>
        </motion.div>
        <motion.div variants={item} className="glass-card p-5 space-y-2 border-l-4 border-l-blue-500">
          <p className="text-[10px] text-text-muted uppercase font-black tracking-widest">Coins Earned</p>
          <p className="text-3xl font-black text-accent">{userData.referralCoins}</p>
        </motion.div>
      </div>

      <motion.div variants={item} className="space-y-6">
        <h4 className="font-black text-sm uppercase tracking-widest flex items-center gap-3">
          <div className="w-1 h-4 bg-accent rounded-full" />
          Referral Earnings Breakdown
        </h4>
        
        <div className="space-y-3">
          {referrals.length > 0 ? (
            referrals.map((ref) => (
              <div key={ref.id} className="glass-card p-4 flex items-center justify-between group hover:border-accent/30 transition-all">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent font-black text-sm uppercase">
                    {ref.name ? ref.name.substring(0, 2) : '??'}
                  </div>
                  <div>
                    <h5 className="font-bold text-sm text-white">{ref.name || 'Anonymous'}</h5>
                    <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest">
                      Joined {new Date(ref.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-accent font-black font-mono">+{ref.reward}</p>
                  <p className="text-[10px] text-text-muted font-bold uppercase">Coins</p>
                </div>
              </div>
            ))
          ) : (
            <div className="p-10 border-2 border-dashed border-white/5 rounded-3xl flex flex-col items-center justify-center text-center space-y-4">
              <div className="p-3 bg-white/5 rounded-full text-white/20">
                <Users size={32} />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-bold text-white/40">No referrals yet</p>
                <p className="text-[10px] text-text-muted max-w-[200px]">Share your link to see your network grow here!</p>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      <motion.div variants={item} className="space-y-6">
        <h4 className="font-black text-sm uppercase tracking-widest flex items-center gap-3">
          <div className="w-1 h-4 bg-accent rounded-full" />
          How it works
        </h4>
        <div className="space-y-5">
          <ReferStep num={1} title="Share Link" text="Send your invitation link to your friends and social groups." />
          <ReferStep num={2} title="Friend Joins" text="They register an account using your referral link today." />
          <ReferStep num={3} title="Get Rewarded" text={`You both receive ${REFERRAL_BONUS} coins reward instantly!`} />
        </div>
      </motion.div>
    </motion.div>
  );
}

function ReferStep({ num, title, text }: { num: number; title: string; text: string }) {
  return (
    <div className="flex gap-5">
      <div className="w-12 h-12 rounded-2xl bg-surface border border-border flex items-center justify-center text-accent font-black shadow-lg shrink-0 text-xl">{num}</div>
      <div className="space-y-1">
        <p className="font-bold text-white tracking-tight">{title}</p>
        <p className="text-xs text-text-muted leading-relaxed font-medium">{text}</p>
      </div>
    </div>
  );
}

const COSMETIC_FRAMES = [
  { id: 'gold', name: 'Golden Glow', price: 2000, color: 'from-yellow-400 via-yellow-200 to-yellow-600', animation: 'animate-pulse' },
  { id: 'neon', name: 'Neon Cyber', price: 5000, color: 'from-cyan-400 via-blue-500 to-purple-600', animation: 'animate-pulse' },
  { id: 'fire', name: 'Phoenix Fire', price: 8000, color: 'from-orange-600 via-red-500 to-yellow-500', animation: 'animate-pulse' },
  { id: 'void', name: 'Void Walker', price: 15000, color: 'from-purple-900 via-indigo-900 to-black', animation: 'animate-pulse' },
  { id: 'rainbow', name: 'Prismatic', price: 25000, color: 'from-red-500 via-green-500 to-blue-500', animation: 'animate-pulse' },
];

function ShopScreen({ userData, onBack, onBuy }: { userData: UserData, onBack: () => void, onBuy: (pack: any) => void }) {
  const [activeTab, setActiveTab] = useState<'coins' | 'cosmetics'>('coins');
  const [buying, setBuying] = useState(false);

  const buyFrame = async (frame: typeof COSMETIC_FRAMES[0]) => {
    if (userData.coins < frame.price) {
      toast.error("Insufficient coins!");
      return;
    }
    if (userData.inventory?.includes(frame.id)) {
      toast.error("You already own this frame!");
      return;
    }

    setBuying(true);
    try {
      const userRef = doc(db, 'users', userData.uid);
      await runTransaction(db, async (transaction) => {
        const userSnap = await transaction.get(userRef);
        const currentCoins = userSnap.data()?.coins || 0;
        if (currentCoins < frame.price) throw new Error("Insufficient coins");

        transaction.update(userRef, {
          coins: increment(-frame.price),
          inventory: arrayUnion(frame.id)
        });

        const txRef = doc(collection(db, 'users', userData.uid, 'transactions'));
        transaction.set(txRef, {
          type: 'cosmetic_purchase',
          amount: -frame.price,
          note: `Purchased ${frame.name} Frame`,
          createdAt: Date.now()
        });
      });
      toast.success(`Purchased ${frame.name}!`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to purchase frame");
    } finally {
      setBuying(false);
    }
  };

  const equipFrame = async (frameId: string) => {
    try {
      const userRef = doc(db, 'users', userData.uid);
      await updateDoc(userRef, {
        equippedFrame: userData.equippedFrame === frameId ? null : frameId
      });
      toast.success(userData.equippedFrame === frameId ? "Frame unequipped" : "Frame equipped!");
    } catch (err) {
      console.error(err);
      toast.error("Failed to equip frame");
    }
  };

  const packs = [
    { id: 'coins_500', coins: 500, price: '$0.99', icon: <Gem size={20} />, popular: false },
    { id: 'coins_1500', coins: 1500, price: '$1.99', icon: <Gem size={24} />, popular: true },
    { id: 'coins_5000', coins: 5000, price: '$4.99', icon: <Gem size={28} />, popular: false },
    { id: 'coins_12000', coins: 12000, price: '$9.99', icon: <Trophy size={32} />, popular: false },
  ];

  return (
    <motion.div 
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      className="fixed inset-0 z-50 bg-background flex flex-col"
    >
      <header className="p-6 flex items-center justify-between border-b border-white/5 bg-surface/50 backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-3 bg-white/5 rounded-2xl border border-white/10 active:scale-95 transition-all">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="text-xl font-bold">Coin Store</h2>
            <p className="text-[10px] text-accent font-black uppercase tracking-widest">Upgrade your profile</p>
          </div>
        </div>
        <div className="px-4 py-2 bg-accent/10 border border-accent/20 rounded-xl flex items-center gap-2">
          <Gem size={14} className="text-accent" />
          <span className="text-sm font-black text-accent">{userData.coins.toLocaleString()}</span>
        </div>
      </header>

      <div className="p-4">
        <div className="flex bg-surface p-1 rounded-2xl border border-border">
          {(['coins', 'cosmetics'] as const).map(t => (
            <button 
              key={t} 
              onClick={() => setActiveTab(t)} 
              className={cn(
                "flex-1 py-2 text-[10px] font-black rounded-xl transition-all capitalize tracking-widest", 
                activeTab === t ? "bg-accent text-black shadow-lg shadow-accent/10" : "text-text-muted hover:text-white"
              )}
            >
              {t === 'coins' ? 'Coin Packs' : 'Cosmetics'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6 pt-2">
        {activeTab === 'coins' ? (
          <>
            <div className="bg-gradient-to-br from-accent/20 to-blue-500/10 p-8 rounded-[2rem] border border-accent/20 relative overflow-hidden group">
              <div className="relative z-10 space-y-2">
                <h3 className="text-2xl font-black text-white leading-tight">PREMIUM<br/>CURRENCY</h3>
                <p className="text-sm text-white/60">Unlock special features and boost your earnings potential with coin packs.</p>
              </div>
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                className="absolute -top-10 -right-10 opacity-20 text-accent group-hover:scale-110 transition-transform"
              >
                <Zap size={180} fill="currentColor" />
              </motion.div>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {packs.map((pack) => (
                <div
                  key={pack.id}
                  className={cn(
                    "p-6 rounded-[2rem] border transition-all flex items-center justify-between gap-4 relative overflow-hidden grayscale opacity-60 cursor-not-allowed",
                    pack.popular ? "bg-accent/10 border-accent/40" : "bg-surface border-white/5"
                  )}
                >
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg",
                      pack.popular ? "bg-accent text-black" : "bg-white/5 text-accent"
                    )}>
                      {pack.icon}
                    </div>
                    <div className="text-left">
                      <p className="text-lg font-black text-white">{pack.coins.toLocaleString()} COINS</p>
                      <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest">Coming Soon</p>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <div className="bg-white/10 px-3 py-1 rounded-full">
                      <p className="text-xs font-black text-white/40 uppercase tracking-widest">Soon</p>
                    </div>
                  </div>

                  {pack.popular && (
                    <div className="absolute top-0 right-0">
                      <div className="bg-accent text-black text-[8px] font-black uppercase px-4 py-1 rotate-45 translate-x-[20px] translate-y-[5px] shadow-sm">
                        BEST VALUE
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="bg-gradient-to-br from-purple-500/20 to-blue-500/10 p-8 rounded-[2rem] border border-white/5 relative overflow-hidden group">
              <div className="relative z-10 space-y-2">
                <h3 className="text-2xl font-black text-white leading-tight">LEADERBOARD<br/>FRAMES</h3>
                <p className="text-sm text-white/60">Standalone from the crowd with unique animated profile frames.</p>
              </div>
              <motion.div 
                animate={{ rotate: -360 }}
                transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
                className="absolute -top-10 -right-10 opacity-20 text-purple-400 group-hover:scale-110 transition-transform"
              >
                <Medal size={180} fill="currentColor" />
              </motion.div>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {COSMETIC_FRAMES.map((frame) => {
                const isOwned = userData.inventory?.includes(frame.id);
                const isEquipped = userData.equippedFrame === frame.id;
                
                return (
                  <div key={frame.id} className="p-6 bg-surface border border-white/5 rounded-[2rem] flex items-center justify-between gap-4 group hover:border-white/10 transition-all">
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "w-16 h-16 rounded-2xl relative p-1 transition-all",
                        frame.animation
                      )} style={{ background: `linear-gradient(to bottom right, var(--tw-gradient-stops))` }}>
                        <div className={cn("absolute inset-0 bg-gradient-to-br rounded-2xl opacity-50", frame.color)} />
                        <div className="w-full h-full bg-surface-dark rounded-xl flex items-center justify-center relative z-10 overflow-hidden">
                          {userData.photoURL ? (
                            <img src={userData.photoURL} className="w-full h-full object-cover opacity-80" />
                          ) : (
                            <UserIcon className="text-white/20" size={24} />
                          )}
                        </div>
                      </div>
                      <div className="text-left">
                        <p className="text-lg font-black text-white">{frame.name}</p>
                        <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest">
                          {isOwned ? (isEquipped ? 'Currently Equipped' : 'Owned') : `${frame.price.toLocaleString()} Coins`}
                        </p>
                      </div>
                    </div>

                    <button 
                      onClick={() => isOwned ? equipFrame(frame.id) : buyFrame(frame)}
                      disabled={buying || (!isOwned && userData.coins < frame.price)}
                      className={cn(
                        "px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all active:scale-95",
                        isOwned 
                          ? (isEquipped ? "bg-red-500/10 text-red-500 border border-red-500/20" : "bg-accent text-black")
                          : "bg-white/5 text-white border border-white/10 hover:bg-white/10 disabled:opacity-50"
                      )}
                    >
                      {isOwned ? (isEquipped ? 'Unequip' : 'Equip') : buying ? 'Processing...' : 'Purchase'}
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div className="p-6 bg-white/5 border border-white/10 rounded-3xl space-y-4">
          <div className="flex items-center gap-2 text-text-muted">
            <Info size={16} />
            <p className="text-xs font-medium">Terms of Purchase</p>
          </div>
          <p className="text-[10px] text-text-muted leading-relaxed">
            All purchases are virtual items only and hold no real-world monetary value. Transactions are simulated for demonstration purposes. Frames are visible on the public leaderboard to all users.
          </p>
        </div>
      </div>
    </motion.div>
  );
}

function LeaderboardScreen({ userData }: { userData: UserData }) {
  const [tab, setTab] = useState<'all' | 'weekly' | 'monthly'>('all');
  const [ranks, setRanks] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [resetStats, setResetStats] = useState<{ lastWeekly?: number; lastMonthly?: number }>({});

  const isAdmin = userData.email === 'pannamandal178@gmail.com';

  useEffect(() => {
    setLoading(true);
    const sortField = tab === 'all' ? 'totalEarnings' : (tab === 'weekly' ? 'weeklyCoins' : 'monthlyCoins');
    
    // Pillar 8 Compliance: Explicitly filter to match security rules
    const ranksQuery = query(
      collection(db, 'users'), 
      where(sortField, '>=', 0),
      orderBy(sortField, 'desc'), 
      limit(50)
    );
    const unsubscribe = onSnapshot(ranksQuery, (snapshot) => {
      const data: UserData[] = [];
      snapshot.forEach((child) => { data.push({ uid: child.id, ...child.data() } as UserData); });
      setRanks(data);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
      setLoading(false);
    });

    if (isAdmin) {
      const configRef = doc(db, 'appConfig', 'leaderboard');
      getDoc(configRef).then(snap => {
        if (snap.exists()) {
          setResetStats(snap.data() as any);
        }
      });
    }

    return () => unsubscribe();
  }, [tab, isAdmin]);

  const resetLeaderboard = async (type: 'weekly' | 'monthly') => {
    if (!isAdmin || !window.confirm(`Are you sure you want to reset all ${type} coins to 0?`)) return;
    
    setResetting(true);
    const toastId = toast.loading(`Resetting ${type} coins...`);
    
    try {
      const usersSnap = await getDocs(collection(db, 'users'));
      let batch = writeBatch(db);
      let count = 0;
      let totalUpdated = 0;

      for (const userDoc of usersSnap.docs) {
        batch.update(userDoc.ref, {
          [type === 'weekly' ? 'weeklyCoins' : 'monthlyCoins']: 0
        });
        count++;
        totalUpdated++;

        if (count === 400) {
          await batch.commit();
          batch = writeBatch(db);
          count = 0;
        }
      }

      if (count > 0) {
        await batch.commit();
      }

      await setDoc(doc(db, 'appConfig', 'leaderboard'), {
        [type === 'weekly' ? 'lastWeekly' : 'lastMonthly']: Date.now()
      }, { merge: true });

      setResetStats(prev => ({ ...prev, [type === 'weekly' ? 'lastWeekly' : 'lastMonthly']: Date.now() }));
      toast.success(`Reset complete! Processed ${totalUpdated} users.`, { id: toastId });
    } catch (error) {
      console.error("Reset failed:", error);
      toast.error("Reset failed. Check console for details.", { id: toastId });
    } finally {
      setResetting(false);
    }
  };

  const currentTabCoins = (u: UserData) => tab === 'all' ? (u.totalEarnings || 0) : (tab === 'weekly' ? (u.weeklyCoins || 0) : (u.monthlyCoins || 0));
  const userRank = ranks.findIndex(r => r.uid === userData.uid) + 1;

  const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.1 } }
  };

  const item = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } };

  return (
    <motion.div 
      variants={container}
      initial="hidden"
      animate="show"
      className="flex flex-col h-full"
    >
      <div className="p-6 pb-2 space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h2 className="text-3xl font-black tracking-tight">Hall of Fame</h2>
            <p className="text-xs text-text-muted font-bold uppercase tracking-widest">Top Earners</p>
          </div>
          {isAdmin && (
            <div className="flex gap-2">
              <div className="flex flex-col items-end gap-1">
                <button onClick={() => resetLeaderboard('weekly')} disabled={resetting} className="px-3 py-1 bg-red-500/10 text-red-500 text-[10px] font-black uppercase tracking-tighter rounded-lg border border-red-500/20 active:scale-95 transition-all">Reset Weekly</button>
                <button onClick={() => resetLeaderboard('monthly')} disabled={resetting} className="px-3 py-1 bg-orange-500/10 text-orange-500 text-[10px] font-black uppercase tracking-tighter rounded-lg border border-orange-500/20 active:scale-95 transition-all">Reset Monthly</button>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex bg-surface p-1 rounded-2xl border border-border">
            {(['all', 'weekly', 'monthly'] as const).map(t => (
              <button 
                key={t} 
                onClick={() => setTab(t)} 
                className={cn(
                  "flex-1 py-2 text-[10px] font-black rounded-xl transition-all capitalize tracking-widest", 
                  tab === t ? "bg-accent text-black shadow-lg shadow-accent/10" : "text-text-muted hover:text-white"
                )}
              >
                {t === 'all' ? 'All Time' : t}
              </button>
            ))}
          </div>
          
          {tab !== 'all' && (
            <div className="flex items-center gap-2 px-2">
              <Zap size={12} className="text-accent" />
              <p className="text-[10px] text-text-muted font-bold uppercase tracking-tight">
                Leaderboard resets {tab === 'weekly' ? 'every Monday' : 'every 1st of month'}. Earn your spot at the top!
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar pb-24">
        {loading ? (
          <div className="h-40 flex items-center justify-center"><Loader2 className="animate-spin text-accent" /></div>
        ) : (
          <div className="space-y-8 mt-12 bg-gradient-to-b from-accent/5 to-transparent pt-4">
            {/* Podium Section */}
            <div className="flex items-end justify-center gap-4 px-6">
              {ranks[1] && <PodiumPosition user={ranks[1]} rank={2} coins={currentTabCoins(ranks[1])} color="#CBD5E1" badge="#94A3B8" />}
              {ranks[0] && <PodiumPosition user={ranks[0]} rank={1} coins={currentTabCoins(ranks[0])} color="#FFD700" badge="#EAB308" isMain />}
              {ranks[2] && <PodiumPosition user={ranks[2]} rank={3} coins={currentTabCoins(ranks[2])} color="#944002" badge="#8A4513" />}
            </div>

            {/* List Section */}
            <div className="px-6 space-y-3 pb-8">
              {ranks.slice(3).map((u, i) => (
                <RankRow key={u.uid} user={u} rank={i + 4} coins={currentTabCoins(u)} isMe={u.uid === userData.uid} />
              ))}
              {userRank > 50 && (
                <div className="pt-4">
                  <div className="text-center text-xs text-text-muted mb-4 opacity-50 font-black">•••</div>
                  <RankRow user={userData} rank={userRank} coins={currentTabCoins(userData)} isMe />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function PodiumPosition({ user, rank, coins, color, badge, isMain }: { user: UserData; rank: number; coins: number; color: string; badge: string; isMain?: boolean }) {
  const frame = COSMETIC_FRAMES.find(f => f.id === user.equippedFrame);

  return (
    <motion.div 
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.2 + rank * 0.1 }}
      className={cn("flex flex-col items-center gap-4", isMain ? "-mt-10" : "mb-2")}
    >
      <div className="relative">
        <div 
          className={cn(
            "rounded-[2.5rem] p-1 shadow-2xl relative z-10 transition-all",
            isMain ? "w-28 h-28" : "w-20 h-20",
            frame?.animation
          )}
          style={frame ? { background: `linear-gradient(to bottom right, var(--tw-gradient-stops))` } : { borderColor: color, borderWidth: '4px' }}
        >
          {frame && <div className={cn("absolute inset-0 bg-gradient-to-br rounded-[2.5rem] opacity-60", frame.color)} />}
          <div className="w-full h-full bg-surface-dark rounded-[2.2rem] flex items-center justify-center relative z-10 overflow-hidden">
            <img 
              src={user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=${color.replace('#', '')}&color=fff`} 
              className="w-full h-full rounded-[2.2rem] object-cover" 
              alt="" 
            />
          </div>
        </div>
        <div className="absolute -bottom-1 -right-1 w-9 h-9 rounded-[1rem] text-black flex items-center justify-center shadow-lg border-2 border-background z-20 font-black text-xs" style={{ backgroundColor: badge }}>
          {rank}
        </div>
      </div>
      <div className="text-center space-y-1">
        <div className="flex items-center justify-center gap-1.5">
          <p className="text-[11px] font-black truncate max-w-[64px] text-white tracking-tight">{user.nickname || (user.name || "").split(' ')[0]}</p>
          {user.badges?.includes('Math Genius') && <Medal size={10} className="text-yellow-400 shrink-0" />}
          <span className="text-[8px] font-black text-accent bg-accent/10 px-1 py-0.5 rounded border border-accent/20 uppercase shrink-0">L{calculateLevel(user.totalEarnings)}</span>
        </div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/5 rounded-full border border-white/5">
          <Star fill="#EAB308" size={10} className="text-yellow-500" />
          <span className="text-[10px] font-black text-white font-mono">{coins.toLocaleString()}</span>
        </div>
      </div>
    </motion.div>
  );
}

const RankRow: React.FC<{ user: UserData; rank: number; coins: number; isMe?: boolean }> = ({ user, rank, coins, isMe }) => {
  const frame = COSMETIC_FRAMES.find(f => f.id === user.equippedFrame);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(rank * 0.05, 1) }}
      className={cn(
        "flex items-center justify-between p-4 rounded-[2rem] group transition-all duration-300",
        isMe ? "bg-accent/10 border border-accent/30 shadow-[0_0_20px_rgba(0,255,136,0.05)]" : "bg-surface border border-border hover:border-white/20"
      )}
    >
      <div className="flex items-center gap-4">
        <div className="w-8 flex justify-center">
           <span className={cn(
             "text-[10px] font-black font-mono",
             rank <= 10 ? "text-accent" : "text-text-muted"
           )}>#{rank}</span>
        </div>
        <div className="relative">
          <div 
            className={cn(
              "w-12 h-12 rounded-xl p-0.5 relative z-10 transition-all",
              frame?.animation
            )}
            style={frame ? { background: `linear-gradient(to bottom right, var(--tw-gradient-stops))` } : {}}
          >
            {frame && <div className={cn("absolute inset-0 bg-gradient-to-br rounded-xl opacity-60", frame.color)} />}
            <div className="w-full h-full bg-surface rounded-lg flex items-center justify-center relative z-10 overflow-hidden">
              <img 
                src={user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=00ff88&color=000`} 
                className="w-full h-full object-cover" 
                alt="" 
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
          {isMe && <div className="absolute -top-1 -right-1 w-3 h-3 bg-accent rounded-full border-2 border-background z-20" />}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-black text-white tracking-tight leading-none">{user.nickname || user.name}</p>
            {user.badges?.includes('Math Genius') && <Medal size={12} className="text-yellow-400 shrink-0" />}
            <span className="text-[9px] font-black text-accent bg-accent/10 px-1.5 py-0.5 rounded uppercase border border-accent/20 shrink-0">Lvl {calculateLevel(user.totalEarnings)}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-2xl border border-white/5">
        <Star size={12} fill="currentColor" className="text-accent" />
        <span className="text-xs font-black text-white font-mono">{coins.toLocaleString()}</span>
      </div>
    </motion.div>
  );
};

function SettingToggle({ icon, label, checked, onToggle }: { icon: React.ReactNode; label: string; checked: boolean; onToggle: () => void }) {
  return (
    <div className="p-5 bg-background/40 border border-border/50 rounded-3xl flex items-center justify-between group hover:border-white/10 transition-all">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-2xl bg-surface border border-border flex items-center justify-center text-text-muted group-hover:text-accent group-hover:border-accent/20 transition-all">
          {icon}
        </div>
        <p className="font-bold text-white text-sm">{label}</p>
      </div>
      <button 
        onClick={onToggle}
        className={cn(
          "w-12 h-6 rounded-full relative transition-all duration-300",
          checked ? "bg-accent" : "bg-surface"
        )}
      >
        <div className={cn(
          "absolute top-1 w-4 h-4 rounded-full bg-white transition-all duration-300 shadow-sm",
          checked ? "left-7" : "left-1"
        )} />
      </button>
    </div>
  );
}

function ProfileScreen({ userData, onSignOut, onOpenAdmin, onOpenShop }: { userData: UserData; onSignOut: () => void; onOpenAdmin: () => void; onOpenShop: () => void }) {
  const lvlInfo = getLevelProgress(userData.totalEarnings);
  const [history, setHistory] = useState<Transaction[]>([]);
  const [withdraws, setWithdraws] = useState<WithdrawRequest[]>([]);
  const [profileTab, setProfileTab] = useState<'activity' | 'withdrawals' | 'settings'>('activity');
  const [activityFilter, setActivityFilter] = useState<'all' | 'ad' | 'quiz' | 'referral' | 'withdraw'>('all');
  const [nickname, setNickname] = useState(userData.nickname || '');
  const [name, setName] = useState(userData.name || '');
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [uploading, setUploading] = useState(false);

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const isAdmin = userData.email === 'pannamandal178@gmail.com';

  useEffect(() => {
    const txQuery = query(collection(db, 'users', userData.uid, 'transactions'), orderBy('createdAt', 'desc'), limit(30));
    const unsubTx = onSnapshot(txQuery, (snapshot) => {
      const data: Transaction[] = [];
      snapshot.forEach((child) => { data.push({ id: child.id, ...child.data() } as Transaction); });
      setHistory(data);
    }, (error) => handleFirestoreError(error, OperationType.GET, `users/${userData.uid}/transactions`));

    const wrQuery = query(collection(db, 'users', userData.uid, 'withdrawals'), orderBy('createdAt', 'desc'), limit(20));
    const unsubWr = onSnapshot(wrQuery, (snapshot) => {
      const data: WithdrawRequest[] = [];
      snapshot.forEach((child) => { data.push({ id: child.id, ...child.data() } as WithdrawRequest); });
      setWithdraws(data);
    }, (error) => handleFirestoreError(error, OperationType.GET, `users/${userData.uid}/withdrawals`));

    return () => {
      unsubTx();
      unsubWr();
    };
  }, [userData.uid]);

  const updateProfile = async () => {
    if (!nickname.trim() && !name.trim()) return setIsEditingProfile(false);
    try {
      await updateDoc(doc(db, 'users', userData.uid), { 
        nickname: nickname.trim() || userData.nickname,
        name: name.trim() || userData.name
      });
      toast.success('Profile updated');
      setIsEditingProfile(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${userData.uid}`);
      toast.error('Failed to update profile');
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 800000) { // ~800KB limit for Firestore doc size safety
      toast.error('Image too large. Please use an image under 800KB.');
      return;
    }

    setUploading(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const base64String = reader.result as string;
        await updateDoc(doc(db, 'users', userData.uid), { photoURL: base64String });
        toast.success('Photo updated');
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `users/${userData.uid}`);
        toast.error('Failed to update photo');
      } finally {
        setUploading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const toggleSetting = async (field: string, current: boolean) => {
    try {
      await updateDoc(doc(db, 'users', userData.uid), { [field]: !current });
      toast.success('Setting updated');
    } catch (error) {
      toast.error('Failed to update setting');
    }
  };

  const updateSettingValue = async (field: string, value: any) => {
    try {
      await updateDoc(doc(db, 'users', userData.uid), { [field]: value });
      toast.success('Setting updated');
    } catch (error) {
      toast.error('Failed to update setting');
    }
  };

  const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.1 } }
  };

  return (
    <motion.div 
      variants={container}
      initial="hidden"
      animate="show"
      className="flex flex-col h-full bg-background min-h-screen"
    >
      {/* Theme Toggle */}
      <button 
        onClick={() => updateSettingValue('theme', userData.theme === 'light' ? 'dark' : 'light')}
        className="absolute top-8 right-8 w-12 h-12 bg-surface border border-border rounded-2xl flex items-center justify-center text-text-muted hover:text-accent shadow-xl z-20 transition-all hover:scale-110 active:scale-95"
        title="Toggle Theme"
      >
        {userData.theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
      </button>

      {/* Header / Profile Info */}
      <div className="p-8 flex flex-col items-center space-y-6 relative overflow-hidden">
        <div className="relative group">
          <div className="w-24 h-24 rounded-[2.5rem] p-1 border-2 border-accent/20 bg-surface shadow-2xl relative z-10 transition-transform group-hover:scale-105 overflow-hidden">
            {uploading ? (
              <div className="w-full h-full rounded-[2.2rem] bg-background/50 flex items-center justify-center">
                <Loader2 className="animate-spin text-accent" />
              </div>
            ) : (
              <img 
                src={userData.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(userData.name)}&background=00ff88&color=000`} 
                className="w-full h-full rounded-[2.2rem] object-cover" 
                alt="" 
              />
            )}
          </div>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handlePhotoUpload} 
            accept="image/*" 
            className="hidden" 
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="absolute -bottom-1 -right-1 w-8 h-8 bg-accent text-black rounded-xl shadow-lg z-20 flex items-center justify-center border-2 border-background hover:scale-110 active:scale-95 transition-all"
          >
             <Camera size={14} />
          </button>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 bg-accent/5 rounded-full blur-[40px] -z-0" />
        </div>

        <div className="text-center space-y-3 z-10 w-full max-w-xs">
          <div className="flex flex-col items-center gap-1">
            {isEditingProfile ? (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="space-y-4 w-full bg-surface p-6 rounded-[2rem] border border-accent/20 shadow-2xl"
              >
                <div className="space-y-2 text-left">
                  <label className="text-[10px] font-black uppercase tracking-widest text-accent px-1">Full Name</label>
                  <input 
                    className="w-full bg-background/50 border border-border rounded-xl h-12 px-4 text-text-primary outline-none focus:border-accent/30 transition-all font-bold"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Full Name"
                  />
                </div>
                <div className="space-y-2 text-left">
                  <label className="text-[10px] font-black uppercase tracking-widest text-accent px-1">Gaming Nickname</label>
                  <input 
                    className="w-full bg-background/50 border border-border rounded-xl h-12 px-4 text-text-primary outline-none focus:border-accent/30 transition-all font-bold"
                    value={nickname}
                    onChange={e => setNickname(e.target.value)}
                    placeholder="Nickname"
                  />
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={updateProfile}
                    className="flex-1 h-12 bg-accent text-black font-black uppercase tracking-widest rounded-xl text-[10px] shadow-lg shadow-accent/10 transition-all hover:bg-accent/80 active:scale-95"
                  >
                    Save Changes
                  </button>
                  <button 
                    onClick={() => setIsEditingProfile(false)}
                    className="h-12 px-4 bg-white/5 text-gray-400 font-bold rounded-xl text-[10px] uppercase tracking-widest hover:text-white transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </motion.div>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <h2 className="text-3xl font-black tracking-tight text-white">{userData.nickname || userData.name}</h2>
                  <span className="text-xs font-black text-accent bg-accent/10 px-2 py-1 rounded-lg border border-accent/20 uppercase">Lvl {calculateLevel(userData.totalEarnings)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-text-muted">{userData.name}</p>
                  <button onClick={() => setIsEditingProfile(true)} className="p-1.5 bg-surface rounded-lg border border-border text-text-muted hover:text-white transition-all flex items-center gap-1">
                    <Settings size={12} />
                    <span className="text-[8px] font-black uppercase">Edit</span>
                  </button>
                </div>
              </>
            )}
          </div>
          
          {/* Badges Display */}
          {(userData.badges && userData.badges.length > 0) && (
            <div className="flex flex-wrap justify-center gap-2 mt-2">
              {userData.badges.map((badge, idx) => (
                <div key={idx} className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-400 text-black rounded-full font-black text-[9px] uppercase tracking-tighter shadow-[0_0_15px_rgba(250,204,21,0.3)] animate-bounce" style={{ animationDelay: `${idx * 0.2}s`, animationDuration: '2s' }}>
                  <Medal size={10} />
                  {badge}
                </div>
              ))}
            </div>
          )}

          {/* Level Progress */}
          <div className="mt-4 p-4 bg-surface border border-border rounded-2xl w-full text-left shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center text-accent">
                  <TrendingUp size={16} />
                </div>
                <div>
                  <p className="text-[10px] font-black text-accent uppercase tracking-widest leading-none mb-1">Level {lvlInfo.currentLevel}</p>
                  <p className="text-xs font-bold text-white leading-none">To Level {lvlInfo.currentLevel + 1}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs font-black text-white leading-none mb-1">{lvlInfo.remaining.toLocaleString()}</p>
                <p className="text-[9px] font-bold text-text-muted uppercase tracking-tighter leading-none">Coins Needed</p>
              </div>
            </div>
            <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
               <motion.div 
                 initial={{ width: 0 }}
                 animate={{ width: `${lvlInfo.progress}%` }}
                 className="h-full bg-gradient-to-r from-accent to-blue-400"
               />
            </div>
            <div className="flex justify-between mt-2">
              <span className="text-[9px] font-bold text-text-muted uppercase tracking-wide">{(userData.totalEarnings || 0).toLocaleString()} XP</span>
              <span className="text-[9px] font-bold text-text-muted uppercase tracking-wide">{lvlInfo.nextLevelAt.toLocaleString()} XP</span>
            </div>
          </div>

          <div className="flex gap-2 mt-2">
            <div className="flex-1 p-3 bg-surface border border-border rounded-2xl text-center space-y-1">
              <p className="text-[10px] font-black text-text-muted uppercase tracking-widest leading-none">Lifetime Quizzes</p>
              <p className="text-sm font-black text-white">{userData.totalQuizzes || 0}</p>
            </div>
            <div className="flex-1 p-3 bg-surface border border-border rounded-2xl text-center space-y-1">
              <p className="text-[10px] font-black text-text-muted uppercase tracking-widest leading-none">Best Streak</p>
              <p className="text-sm font-black text-white">{userData.perfectStreak || 0}</p>
            </div>
          </div>

          <div className="mt-4 p-3 bg-accent/5 rounded-2xl border border-accent/10">
            <p className="text-[9px] font-black text-accent uppercase tracking-widest mb-1">Current Achievement Progress</p>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white">Genius Streak</span>
              <span className="text-xs font-black text-accent">{userData.perfectStreak || 0}/100</span>
            </div>
            <div className="w-full h-1 bg-white/5 rounded-full mt-1.5 overflow-hidden">
               <motion.div 
                 initial={{ width: 0 }}
                 animate={{ width: `${Math.min(100, (userData.perfectStreak || 0))}%` }}
                 className="h-full bg-accent"
               />
            </div>
          </div>

          <p className="text-xs text-text-muted font-bold tracking-widest uppercase opacity-60 mt-4">ID: {userData.uid.substring(0, 10)}</p>
          
          <div className="flex gap-2 justify-center pt-2">
            {isAdmin && (
              <button onClick={onOpenAdmin} className="px-4 py-1.5 bg-accent/10 text-accent border border-accent/20 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-accent/20 active:scale-95 transition-all">
                Control Hub
              </button>
            )}
            <button onClick={onOpenShop} className="px-4 py-1.5 bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-yellow-500/20 active:scale-95 transition-all flex items-center gap-2">
              <ShoppingCart size={12} />
              Buy Coins (Soon)
            </button>
            <button onClick={onSignOut} className="px-4 py-1.5 bg-red-500/10 text-red-500 border border-red-500/20 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-500/20 active:scale-95 transition-all">
               Logout
            </button>
          </div>
        </div>
      </div>

      {/* Tabs Content */}
      <div className="flex-1 bg-surface rounded-t-[3rem] border-t border-border flex flex-col overflow-hidden shadow-[0_-20px_100px_rgba(0,0,0,0.4)]">
        <div className="p-8">
           <div className="flex bg-background/50 p-1 rounded-2xl border border-border">
             {(['activity', 'withdrawals', 'settings'] as const).map(t => (
               <button 
                 key={t}
                 onClick={() => setProfileTab(t)}
                 className={cn(
                   "flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all",
                   profileTab === t ? "bg-accent text-black shadow-lg" : "text-text-muted hover:text-white"
                 )}
               >
                 {t}
               </button>
             ))}
           </div>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar px-8 pb-32">
          <AnimatePresence mode="wait">
            {profileTab === 'activity' && (
              <motion.div 
                key="activity"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
                  {(['all', 'ad', 'quiz', 'referral', 'withdraw'] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setActivityFilter(f)}
                      className={cn(
                        "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all whitespace-nowrap",
                        activityFilter === f 
                          ? "bg-accent/10 text-accent border-accent/20" 
                          : "bg-background/20 text-text-muted border-border hover:text-white"
                      )}
                    >
                      {f === 'all' ? 'All' : f + 's'}
                    </button>
                  ))}
                </div>

                {history.filter(tx => activityFilter === 'all' || tx.type === activityFilter).length > 0 ? (
                  history.filter(tx => activityFilter === 'all' || tx.type === activityFilter).map(tx => <TxRow key={tx.id} tx={tx} />)
                ) : (
                  <div className="text-center py-20 text-text-muted font-bold text-xs uppercase opacity-30">No {activityFilter === 'all' ? '' : activityFilter} activity yet</div>
                )}
              </motion.div>
            )}

            {profileTab === 'withdrawals' && (
              <motion.div 
                key="withdrawals"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                {withdraws.length > 0 ? (
                  withdraws.map(wr => <WithdrawRow key={wr.id} wr={wr} />)
                ) : (
                  <div className="text-center py-20 text-text-muted font-bold text-xs uppercase opacity-30">No requests yet</div>
                )}
              </motion.div>
            )}

            {profileTab === 'settings' && (
              <motion.div 
                key="settings"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-3"
              >
                <div className="space-y-3">
                  <div className="flex items-center gap-2 px-1">
                    <Sun size={14} className="text-text-muted" />
                    <p className="text-[10px] font-black uppercase tracking-widest text-text-muted">Appearance</p>
                  </div>
                  <div className="flex bg-background/50 p-1 rounded-2xl border border-border">
                    {(['dark', 'light'] as const).map(t => (
                      <button 
                        key={t}
                        onClick={() => updateSettingValue('theme', t)}
                        className={cn(
                          "flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2",
                          userData.theme === t ? "bg-accent text-black shadow-lg" : "text-text-muted hover:text-white"
                        )}
                      >
                        {t === 'dark' ? <Moon size={14} /> : <Sun size={14} />}
                        {t} mode
                      </button>
                    ))}
                  </div>
                </div>
                <SettingToggle 
                  icon={<Bell size={18} />} 
                  label="Push Notifications" 
                  checked={!!userData.pushEnabled} 
                  onToggle={() => toggleSetting('pushEnabled', !!userData.pushEnabled)} 
                />
                <div className="p-6 bg-background/20 rounded-3xl border border-border space-y-4">
                  <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-text-muted">About ammo-ra</h4>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-text-primary">Version</p>
                      <p className="text-xs text-accent font-mono">v4.0.0-gold</p>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-text-primary">Support</p>
                      <p className="text-xs text-text-muted">support@ammo-ra.com</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

const WithdrawRow: React.FC<{ wr: WithdrawRequest }> = ({ wr }) => {
  const getStatusColor = (status: string) => {
    switch(status) {
      case 'completed': return 'text-accent bg-accent/10 border-accent/20';
      case 'rejected': return 'text-red-500 bg-red-500/10 border-red-500/20';
      default: return 'text-orange-500 bg-orange-500/10 border-orange-500/20';
    }
  };

  return (
    <div className="glass-card p-4 flex items-center justify-between border-white/[0.03]">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-surface border border-border text-text-primary capitalize">
          {wr.type[0]}
        </div>
        <div>
          <p className="text-sm font-bold capitalize">{wr.type.replace('_', ' ')}</p>
          <p className="text-[10px] text-gray-500">{new Date(wr.createdAt).toLocaleDateString()}</p>
          {wr.status === 'completed' && wr.code && (
            <div className="mt-1 flex items-center justify-between gap-1.5 p-1.5 bg-accent/5 border border-accent/10 rounded-lg group grow">
              <div className="flex items-center gap-1.5 overflow-hidden">
                <Gift size={10} className="text-accent flex-shrink-0" />
                <p className="text-[10px] font-mono font-bold text-accent truncate select-all">{wr.code}</p>
              </div>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(wr.code || '');
                  toast.success('Code copied!');
                }}
                className="p-1 px-2 bg-accent text-black rounded text-[8px] font-bold hover:scale-105 active:scale-95 transition-all flex items-center gap-1 flex-shrink-0"
              >
                <Copy size={8} />
                Copy
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="text-right flex flex-col items-end gap-1">
        <p className="text-sm font-bold font-mono text-text-primary">-{wr.amount}</p>
        <div className={cn("text-[8px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border", getStatusColor(wr.status))}>
          {wr.status}
        </div>
      </div>
    </div>
  );
};

const TxRow: React.FC<{ tx: Transaction }> = ({ tx }) => {
  const isPositive = tx.amount > 0;
  const getIcon = () => {
    switch(tx.type) {
      case 'bonus': return <Gift size={16} />;
      case 'ad': return <Video size={16} />;
      case 'quiz': return <Brain size={16} />;
      case 'referral': return <Users size={16} />;
      case 'withdraw': return <ArrowUpRight size={16} />;
      default: return <ArrowDownRight size={16} />;
    }
  };
  return (
    <div className="glass-card p-4 flex items-center justify-between border-white/[0.03]">
      <div className="flex items-center gap-3">
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center border", isPositive ? "bg-accent/10 border-accent/20 text-accent" : "bg-red-500/10 border-red-500/20 text-red-500")}>{getIcon()}</div>
        <div>
          <p className="text-sm font-bold">{tx.note}</p>
          <p className="text-[10px] text-gray-500">{new Date(tx.createdAt).toLocaleDateString()} • {new Date(tx.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
        </div>
      </div>
      <div className="text-right">
        <p className={cn("text-sm font-bold font-mono", isPositive ? "text-accent" : "text-red-500")}>{isPositive ? '+' : ''}{tx.amount}</p>
        <p className="text-[10px] text-gray-500">coins</p>
      </div>
    </div>
  );
};


function DeviceLimitScreen({ emails }: { emails: string[] }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6 text-white font-sans">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md bg-surface p-10 rounded-[3rem] border border-white/5 shadow-2xl text-center space-y-8"
      >
        <div className="w-24 h-24 bg-red-500/10 rounded-[2.5rem] flex items-center justify-center mx-auto shadow-2xl shadow-red-500/10">
          <AlertCircle size={48} className="text-red-500" />
        </div>
        
        <div className="space-y-4">
          <h2 className="text-4xl font-black tracking-tight leading-none text-white">Security<br />Limit!</h2>
          <p className="text-text-muted font-medium text-lg leading-relaxed">
            You can only use up to 2 accounts on this device. You've already logged in with:
          </p>
        </div>

        <div className="space-y-3">
          {emails.map((email, i) => (
            <div key={i} className="bg-background/50 p-5 rounded-3xl border border-white/5 flex items-center gap-4 group">
              <div className="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center text-text-muted shrink-0 group-hover:bg-accent/10 group-hover:text-accent transition-all">
                <Globe size={18} />
              </div>
              <p className="font-bold text-white truncate text-lg tracking-tight">{email}</p>
            </div>
          ))}
        </div>

        <button 
          onClick={() => signOut(auth).then(() => window.location.reload())}
          className="w-full h-16 bg-red-500 text-white font-black uppercase tracking-[0.2em] rounded-3xl shadow-xl shadow-red-500/20 active:scale-95 transition-all text-sm flex items-center justify-center gap-3"
        >
          <LogOut size={20} /> Logout
        </button>
        
        <p className="text-[10px] text-text-muted font-black uppercase tracking-widest opacity-50">
          Security policy enforces max 2 accounts per hardware
        </p>
      </motion.div>
    </div>
  );
}


