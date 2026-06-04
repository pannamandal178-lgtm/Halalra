import { 
  MONETAG_ZONE_ID, 
  GOOGLE_H5_AD_CLIENT 
} from '../constants';

type AdEventType = 'loading' | 'started' | 'completed' | 'closed' | 'error';

interface AdConfig {
  onEvent: (event: AdEventType, message?: string) => void;
  googleH5AdClient?: string;
  monetagZoneId?: string;
}

class AdService {
  private static instance: AdService;

  private constructor() {}

  static getInstance(): AdService {
    if (!AdService.instance) {
      AdService.instance = new AdService();
    }
    return AdService.instance;
  }

  async showInterstitialAd(config: AdConfig): Promise<void> {
    const { googleH5AdClient, monetagZoneId } = config;

    const finalGoogleH5Client = googleH5AdClient || GOOGLE_H5_AD_CLIENT;
    const finalMonetagZoneId = monetagZoneId || MONETAG_ZONE_ID;

    if (finalGoogleH5Client) {
      return this.showGoogleH5Interstitial(config, finalGoogleH5Client);
    }

    if (finalMonetagZoneId) {
      return this.showMonetagAd(config, finalMonetagZoneId);
    }

    return this.showSimulationAd(config);
  }

  private async showGoogleH5Interstitial(config: AdConfig, clientId: string): Promise<void> {
    config.onEvent('loading');
    
    if (!(window as any).adBreak) {
      const script = document.createElement('script');
      script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${clientId}`;
      script.async = true;
      script.crossOrigin = "anonymous";
      document.head.appendChild(script);

      await new Promise((resolve) => {
        script.onload = resolve;
      });
    }

    try {
      (window as any).adBreak({
        type: 'interstitial',
        name: 'interstitial_transition',
        beforeAd: () => config.onEvent('started'),
        afterAd: () => config.onEvent('closed'),
        adBreakDone: (placementInfo: any) => {
          config.onEvent('completed');
        }
      });
    } catch (e) {
      console.error(e);
      config.onEvent('error', 'Google H5 Interstitial failed');
    }
  }

  async showRewardedAd(config: AdConfig): Promise<void> {
    const { googleH5AdClient, monetagZoneId } = config;

    // Use dynamic config if provided, fallback to constants
    const finalGoogleH5Client = googleH5AdClient || GOOGLE_H5_AD_CLIENT;
    const finalMonetagZoneId = monetagZoneId || MONETAG_ZONE_ID;

    // Priority 1: Google H5 Ads
    if (finalGoogleH5Client) {
      return this.showGoogleH5Ad(config, finalGoogleH5Client);
    }

    // Priority 2: Monetag Zone ID
    if (finalMonetagZoneId) {
      return this.showMonetagAd(config, finalMonetagZoneId);
    }

    // Fallback: Simulation
    return this.showSimulationAd(config);
  }

  private async showGoogleH5Ad(config: AdConfig, clientId: string): Promise<void> {
    config.onEvent('loading');
    
    if (!(window as any).adBreak) {
      const script = document.createElement('script');
      script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${clientId}`;
      script.async = true;
      script.crossOrigin = "anonymous";
      document.head.appendChild(script);

      await new Promise((resolve) => {
        script.onload = resolve;
      });
    }

    try {
      (window as any).adBreak({
        type: 'reward',
        name: 'watch_ad_reward',
        beforeAd: () => config.onEvent('started'),
        afterAd: () => config.onEvent('closed'),
        adBreakDone: (placementInfo: any) => {
          if (placementInfo.breakStatus === 'COMPLETED') {
            config.onEvent('completed');
          } else {
            console.warn("Ad break status:", placementInfo.breakStatus);
            config.onEvent('error', 'Ad not completed');
          }
        }
      });
    } catch (e) {
      console.error(e);
      config.onEvent('error', 'Google H5 Ads failed');
    }
  }

  private async showMonetagAd(config: AdConfig, zoneId: string): Promise<void> {
    config.onEvent('loading');
    
    if (!document.getElementById('monetag-sdk')) {
      const script = document.createElement('script');
      script.id = 'monetag-sdk';
      script.src = `https://native.propellerads.com/ntfc.php?zoneid=${zoneId}`;
      script.async = true;
      document.body.appendChild(script);
    }

    config.onEvent('started');
    await new Promise(r => setTimeout(r, 15000));
    config.onEvent('completed');
    config.onEvent('closed');
  }

  private async showSimulationAd(config: AdConfig): Promise<void> {
    config.onEvent('loading');
    await new Promise(r => setTimeout(r, 1000));
    config.onEvent('started');
    await new Promise(r => setTimeout(r, 10000)); // 10s simulation
    config.onEvent('completed');
    config.onEvent('closed');
  }
}

export const adService = AdService.getInstance();
