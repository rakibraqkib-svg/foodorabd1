import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bell,
  Bike,
  Check,
  ChevronDown,
  CloudRain,
  CloudSun,
  Copy,
  Filter,
  Heart,
  LocateFixed,
  LogIn,
  MapPin,
  Search,
  Shield,
  ShoppingBag,
  Sparkles,
  Star,
  Store,
  User,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import { AdminDashboard } from './components/AdminDashboard';
import { CartCheckoutDrawer } from './components/CartCheckoutDrawer';
import { CustomerDashboard } from './components/CustomerDashboard';
import { DhakaMapPicker } from './components/DhakaMapPicker';
import { OrderTrackingView } from './components/OrderTrackingView';
import { RestaurantDetailView } from './components/RestaurantDetailView';
import { RiderDashboard } from './components/RiderDashboard';
import { VendorDashboard } from './components/VendorDashboard';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { apiFetch } from './lib/api';
import { CUISINE_CATEGORIES, DHAKA_AREAS, localizeCouponTitle, t } from './lib/i18n';
import { canAddToSingleRestaurantCart, type CartItemInput, formatBdt } from './lib/marketplace-logic';
import type {
  Coupon,
  FoodItem,
  Lang,
  NotificationItem,
  Restaurant,
  ReviewItem,
} from './types/marketplace';

type ViewMode =
  | { type: 'home' }
  | { type: 'restaurant'; slug: string }
  | { type: 'tracking'; orderId: number }
  | { type: 'customer' }
  | { type: 'vendor'; onboarding?: boolean }
  | { type: 'rider' }
  | { type: 'admin' };

const STORAGE_CART_KEY = 'foodora_bd_cart_v1';
const STORAGE_CART_REST_KEY = 'foodora_bd_cart_rest_v1';
const STORAGE_AREA_KEY = 'foodora_bd_area_v1';
const STORAGE_LANG_KEY = 'foodora_bd_lang_v1';

function MarketplaceApp() {
  const { user, loading: authLoading, signInWithGoogle, signInSandboxPersona, refreshUser } =
    useAuth();

  const [lang, setLang] = useState<Lang>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_LANG_KEY);
      return saved === 'bn' ? 'bn' : 'en';
    } catch {
      return 'en';
    }
  });
  const [mapsApiKey, setMapsApiKey] = useState('');
  const [gmpQuotaBanner, setGmpQuotaBanner] = useState(false);

  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loadingStore, setLoadingStore] = useState(true);

  const [view, setView] = useState<ViewMode>(() => {
    const params = new URLSearchParams(window.location.search);
    const orderParam = Number(params.get('order'));
    if (Number.isInteger(orderParam) && orderParam > 0) {
      return { type: 'tracking', orderId: orderParam };
    }
    return { type: 'home' };
  });

  // Restaurant detail state
  const [detailData, setDetailData] = useState<{
    restaurant: Restaurant;
    items: FoodItem[];
    reviews: ReviewItem[];
  } | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Selected delivery area
  const [selectedArea, setSelectedArea] = useState<{ name: string; nameBn: string; lat: number; lng: number }>(
    () => {
      try {
        const raw = localStorage.getItem(STORAGE_AREA_KEY);
        if (raw) return JSON.parse(raw);
      } catch {
        // ignore
      }
      return DHAKA_AREAS[0];
    }
  );
  const [locationModalOpen, setLocationModalOpen] = useState(false);

  // Filters
  const [fulfillmentTab, setFulfillmentTab] = useState<'delivery' | 'pickup'>('delivery');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCuisine, setSelectedCuisine] = useState('All');
  const [sortBy, setSortBy] = useState<'relevance' | 'rating' | 'fastest' | 'lowFee'>('relevance');
  const [onlyDiscount, setOnlyDiscount] = useState(false);
  const [onlyFreeFirst, setOnlyFreeFirst] = useState(false);
  const [priceTierFilter, setPriceTierFilter] = useState<string>('');
  const [deliveryFleetFilter, setDeliveryFleetFilter] = useState<'all' | 'platform' | 'third_party'>('all');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // Cart state
  const [cartItems, setCartItems] = useState<CartItemInput[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_CART_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [cartRestaurant, setCartRestaurant] = useState<Restaurant | null>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_CART_REST_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [cartOpen, setCartOpen] = useState(false);
  const [pendingSwitchItem, setPendingSwitchItem] = useState<{
    restaurant: Restaurant;
    item: CartItemInput;
  } | null>(null);

  // Favorites, Notifications, Auth Modal, Toast
  const [favoriteIds, setFavoriteIds] = useState<number[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Free API state: Open-Meteo live Dhaka weather + OpenStreetMap Nominatim search
  const [weather, setWeather] = useState<{
    tempC: number;
    labelEn: string;
    labelBn: string;
    isRaining: boolean;
    rainBufferMin: number;
  } | null>(null);
  const [osmQuery, setOsmQuery] = useState('');
  const [osmPlaces, setOsmPlaces] = useState<
    Array<{ displayName: string; shortName: string; lat: number; lng: number }>
  >([]);
  const [osmSearching, setOsmSearching] = useState(false);
  const [locatingGps, setLocatingGps] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? null : prev));
    }, 3000);
  }, []);

  // Listen for Google Maps quota / auth fallback event (Case A)
  useEffect(() => {
    const handler = () => setGmpQuotaBanner(true);
    window.addEventListener('gmp-quota-exceeded', handler);
    return () => window.removeEventListener('gmp-quota-exceeded', handler);
  }, []);

  // Sync cart & area to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_CART_KEY, JSON.stringify(cartItems));
      localStorage.setItem(STORAGE_CART_REST_KEY, JSON.stringify(cartRestaurant));
    } catch {
      // ignore
    }
  }, [cartItems, cartRestaurant]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_AREA_KEY, JSON.stringify(selectedArea));
    } catch {
      // ignore
    }
  }, [selectedArea]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_LANG_KEY, lang);
    } catch {
      // ignore
    }
    document.documentElement.lang = lang;
    document.title =
      lang === 'bn'
        ? 'Foodora BD — বাংলাদেশের অনলাইন ফুড ডেলিভারি মার্কেটপ্লেস'
        : 'Foodora BD — Multi-Vendor Food Delivery Marketplace';
  }, [lang]);

  // Sync URL query param for tracking persistence across reload
  useEffect(() => {
    const url = new URL(window.location.href);
    if (view.type === 'tracking') {
      url.searchParams.set('order', String(view.orderId));
    } else {
      url.searchParams.delete('order');
    }
    window.history.replaceState({}, '', url.toString());
  }, [view]);

  const loadStorefront = useCallback(async () => {
    setLoadingStore(true);
    try {
      const [cfgRes, restRes, coupRes] = await Promise.all([
        apiFetch<{ mapsApiKey: string }>('/api/public-config'),
        apiFetch<{ restaurants: Restaurant[] }>('/api/restaurants'),
        apiFetch<{ coupons: Coupon[] }>('/api/coupons'),
      ]);
      setMapsApiKey(cfgRes.mapsApiKey || '');
      setRestaurants(restRes.restaurants);
      setCoupons(coupRes.coupons);
    } catch (err) {
      console.error('Failed to load storefront data:', err);
    } finally {
      setLoadingStore(false);
    }
  }, []);

  useEffect(() => {
    loadStorefront();
  }, [loadStorefront]);

  // Load favorites & notifications when user session is active
  const loadUserSignals = useCallback(async () => {
    if (!user) return;
    try {
      const [favRes, notifRes] = await Promise.all([
        apiFetch<{ favorites: Array<{ restaurantId: number }> }>('/api/customer/favorites'),
        apiFetch<{ notifications: NotificationItem[] }>('/api/notifications'),
      ]);
      setFavoriteIds(favRes.favorites.map((f) => f.restaurantId));
      setNotifications(notifRes.notifications);
    } catch {
      // ignore if guest
    }
  }, [user]);

  useEffect(() => {
    loadUserSignals();
  }, [loadUserSignals]);

  // Fetch live Dhaka zone weather from Open-Meteo proxy
  useEffect(() => {
    let cancelled = false;
    apiFetch<{
      weather: {
        tempC: number;
        labelEn: string;
        labelBn: string;
        isRaining: boolean;
        rainBufferMin: number;
      };
    }>(`/api/free/weather?lat=${selectedArea.lat}&lng=${selectedArea.lng}`)
      .then((res) => {
        if (!cancelled) setWeather(res.weather);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selectedArea.lat, selectedArea.lng]);

  const handleOsmSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!osmQuery.trim()) return;
    setOsmSearching(true);
    try {
      const res = await apiFetch<{
        places: Array<{ displayName: string; shortName: string; lat: number; lng: number }>;
      }>(`/api/free/geocode?q=${encodeURIComponent(osmQuery.trim())}`);
      setOsmPlaces(res.places);
    } finally {
      setOsmSearching(false);
    }
  };

  const handleUseCurrentGps = () => {
    if (!navigator.geolocation) {
      showToast(lang === 'bn' ? 'জিপিএস সমর্থিত নয়' : 'Geolocation unavailable');
      return;
    }
    setLocatingGps(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const res = await apiFetch<{ areaName: string; displayName: string }>(
            `/api/free/reverse-geocode?lat=${lat}&lng=${lng}`
          );
          setSelectedArea({
            name: res.areaName || 'Dhaka',
            nameBn: res.areaName || 'ঢাকা',
            lat,
            lng,
          });
          showToast(
            lang === 'bn' ? `অবস্থান সেট হয়েছে: ${res.areaName}` : `Location set: ${res.areaName}`
          );
        } finally {
          setLocatingGps(false);
        }
      },
      () => {
        setLocatingGps(false);
        showToast(lang === 'bn' ? 'লোকেশন পারমিশন পাওয়া যায়নি' : 'Location permission denied');
      },
      { timeout: 5000 }
    );
  };

  const openRestaurant = useCallback(async (slug: string) => {
    setView({ type: 'restaurant', slug });
    setLoadingDetail(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    try {
      const res = await apiFetch<{
        restaurant: Restaurant;
        items: FoodItem[];
        reviews: ReviewItem[];
      }>(`/api/restaurants/${slug}`);
      setDetailData(res);
    } catch (err) {
      console.error('Failed to load restaurant detail:', err);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  const handleToggleFavorite = async (restaurantId: number) => {
    if (!user) {
      setAuthModalOpen(true);
      return;
    }
    const res = await apiFetch<{ favorited: boolean }>('/api/customer/favorites', {
      method: 'POST',
      body: JSON.stringify({ restaurantId }),
    });
    setFavoriteIds((prev) =>
      res.favorited ? [...prev, restaurantId] : prev.filter((id) => id !== restaurantId)
    );
  };

  const handleAddToCart = (restaurant: Restaurant, item: CartItemInput) => {
    const allowed = canAddToSingleRestaurantCart(cartItems, restaurant.id);
    if (!allowed) {
      setPendingSwitchItem({ restaurant, item });
      return;
    }
    setCartRestaurant(restaurant);
    setCartItems((prev) => [...prev, item]);
    showToast(
      lang === 'bn' ? `${item.nameBn} কার্টে যোগ হয়েছে` : `${item.name} added to cart`
    );
  };

  const confirmSwitchRestaurantCart = () => {
    if (!pendingSwitchItem) return;
    setCartRestaurant(pendingSwitchItem.restaurant);
    setCartItems([pendingSwitchItem.item]);
    setPendingSwitchItem(null);
    showToast(
      lang === 'bn' ? 'নতুন রেস্টুরেন্টের কার্ট শুরু হয়েছে' : 'Started new cart for this restaurant'
    );
  };

  const handleUpdateQty = (idx: number, delta: number) => {
    setCartItems((prev) =>
      prev
        .map((it, i) => (i === idx ? { ...it, quantity: it.quantity + delta } : it))
        .filter((it) => it.quantity > 0)
    );
  };

  const handleRemoveCartItem = (idx: number) => {
    setCartItems((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      if (next.length === 0) setCartRestaurant(null);
      return next;
    });
  };

  const handleClearCart = () => {
    setCartItems([]);
    setCartRestaurant(null);
  };

  const handleSwitchWorkspace = async (
    role: 'customer' | 'restaurant_owner' | 'rider' | 'super_admin',
    targetView: ViewMode
  ) => {
    await signInSandboxPersona(role);
    setAuthModalOpen(false);
    setView(targetView);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const filteredRestaurants = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = restaurants.filter((r) => {
      if (selectedCuisine !== 'All' && !r.cuisine.toLowerCase().includes(selectedCuisine.toLowerCase())) {
        return false;
      }
      if (onlyDiscount && r.discountPct <= 0) return false;
      if (onlyFreeFirst && r.deliveryFee > 50) return false;
      if (priceTierFilter && r.priceTier !== priceTierFilter) return false;
      if (deliveryFleetFilter !== 'all' && r.deliveryMode !== deliveryFleetFilter) return false;
      if (q) {
        return (
          r.name.toLowerCase().includes(q) ||
          r.nameBn.toLowerCase().includes(q) ||
          r.cuisine.toLowerCase().includes(q) ||
          r.area.toLowerCase().includes(q)
        );
      }
      return true;
    });

    const sorted = [...list];
    if (sortBy === 'rating') {
      sorted.sort((a, b) => Number(b.rating) - Number(a.rating));
    } else if (sortBy === 'fastest') {
      sorted.sort((a, b) => a.deliveryTimeMin - b.deliveryTimeMin);
    } else if (sortBy === 'lowFee') {
      sorted.sort((a, b) => a.deliveryFee - b.deliveryFee);
    } else {
      sorted.sort((a, b) => {
        if (a.isSponsored !== b.isSponsored) return a.isSponsored ? -1 : 1;
        return Number(b.rating) - Number(a.rating);
      });
    }
    return sorted;
  }, [restaurants, selectedCuisine, onlyDiscount, onlyFreeFirst, priceTierFilter, deliveryFleetFilter, searchQuery, sortBy]);

  const totalCartItems = cartItems.reduce((s, i) => s + i.quantity, 0);
  const unreadNotifs = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="min-h-screen flex flex-col bg-white text-[#2E3138]">
      {/* GMP Quota Exceeded Banner (Case A) */}
      {gmpQuotaBanner && (
        <div
          role="alert"
          className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-900 flex items-center justify-between gap-3 sticky top-0 z-50"
        >
          <span>
            {lang === 'bn'
              ? 'Google Maps ডেমো কোটা পূর্ণ হয়েছে — ঢাকা কো-অর্ডিনেট ম্যাপ ফলব্যাক মোডে চলছে।'
              : 'Google Maps demo quota exceeded — using interactive Dhaka coordinate map fallback.'}
          </span>
          <button
            type="button"
            onClick={() => setGmpQuotaBanner(false)}
            className="font-semibold underline shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Top #E21B70 Partner Bar (Foodpanda BD Style White-Outlined Buttons) */}
      <div className="bg-[#E21B70] text-white text-xs">
        <div className="max-w-[1400px] mx-auto px-3 sm:px-6 h-11 flex items-center justify-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => handleSwitchWorkspace('restaurant_owner', { type: 'vendor', onboarding: false })}
            className="px-3 sm:px-4 py-1 rounded-lg border border-white/80 hover:bg-white/15 font-bold text-[10px] sm:text-[11px] uppercase tracking-wide inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
          >
            <Store className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t(lang, 'partnerCta')}</span>
            <span className="sm:hidden">Partner</span>
          </button>
          <button
            type="button"
            onClick={() => handleSwitchWorkspace('rider', { type: 'rider' })}
            className="px-3 sm:px-4 py-1 rounded-lg border border-white/80 hover:bg-white/15 font-bold text-[10px] sm:text-[11px] uppercase tracking-wide inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
          >
            <Bike className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t(lang, 'riderCta')}</span>
            <span className="sm:hidden">Rider</span>
          </button>
          <button
            type="button"
            onClick={() => handleSwitchWorkspace('super_admin', { type: 'admin' })}
            className="px-3 sm:px-4 py-1 rounded-lg border border-white/80 hover:bg-white/15 font-bold text-[10px] sm:text-[11px] uppercase tracking-wide inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
          >
            <Shield className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t(lang, 'adminCta')}</span>
            <span className="sm:hidden">Admin</span>
          </button>
        </div>
      </div>

      {/* Main 2-Tier Clean White Sticky Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-neutral-200 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
        {/* Top Row: Brand, Inline Location, Auth, Lang, Orders, Cart */}
        <div className="max-w-[1400px] mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-3 sm:gap-5 min-w-0">
            <button
              type="button"
              onClick={() => setView({ type: 'home' })}
              className="flex items-center gap-2 shrink-0 group whitespace-nowrap"
            >
              <span className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-[#E21B70] text-white flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform">
                <UtensilsCrossed className="w-4 h-4 sm:w-5 sm:h-5" />
              </span>
              <span className="text-lg sm:text-[21px] font-extrabold tracking-tight text-[#E21B70]">
                foodora<span className="text-[#2E3138]">bd</span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => setLocationModalOpen(true)}
              className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-neutral-100 text-xs font-semibold text-[#2E3138] max-w-[270px] truncate transition-colors"
            >
              <MapPin className="w-4 h-4 text-[#E21B70] shrink-0" />
              <span className="truncate">
                {lang === 'bn' ? selectedArea.nameBn : selectedArea.name}, Dhaka
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
            </button>
          </div>

          {/* Right Action Controls */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            {authLoading ? (
              <div className="w-9 sm:w-20 h-9 rounded-lg bg-neutral-100" />
            ) : (
              <button
                type="button"
                onClick={() => setAuthModalOpen(true)}
                className="p-1.5 sm:px-3.5 sm:py-1.5 rounded-lg border border-neutral-300 hover:border-[#2E3138] text-xs font-bold text-[#2E3138] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
              >
                <User className="w-4 h-4 text-[#E21B70]" />
                <span className="hidden sm:inline max-w-[100px] truncate">
                  {user ? user.fullName.split(' ')[0] : t(lang, 'login')}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setView({ type: 'customer' })}
              className="hidden sm:inline-flex px-3.5 py-1.5 rounded-lg bg-[#E21B70] hover:bg-[#C4135E] text-white text-xs font-bold whitespace-nowrap shrink-0 transition-colors"
            >
              {t(lang, 'myOrders')}
            </button>

            {/* Segmented EN | বাংলা Toggle */}
            <div
              role="group"
              aria-label="Language switcher"
              className="inline-flex items-center rounded-lg border border-neutral-200 bg-[#F7F7F7] p-0.5 shrink-0"
            >
              <button
                type="button"
                onClick={() => setLang('en')}
                className={`px-1.5 sm:px-2 py-1 rounded-md text-[11px] font-bold whitespace-nowrap shrink-0 transition-colors ${
                  lang === 'en'
                    ? 'bg-[#2E3138] text-white shadow-xs'
                    : 'text-neutral-600 hover:text-[#2E3138]'
                }`}
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => setLang('bn')}
                className={`px-1.5 sm:px-2 py-1 rounded-md text-[11px] font-bold whitespace-nowrap shrink-0 transition-colors ${
                  lang === 'bn'
                    ? 'bg-[#2E3138] text-white shadow-xs'
                    : 'text-neutral-600 hover:text-[#2E3138]'
                }`}
              >
                বাংলা
              </button>
            </div>

            {/* Notifications */}
            <div className="relative">
              <button
                type="button"
                aria-label="Notifications"
                onClick={() => setNotifOpen((v) => !v)}
                className="relative p-1.5 sm:p-2 rounded-lg border border-neutral-200 hover:border-[#E21B70] text-neutral-700 transition-colors"
              >
                <Bell className="w-4 h-4" />
                {unreadNotifs > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#E21B70] text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                    {unreadNotifs}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl border border-neutral-200 shadow-xl p-3 z-50">
                  <div className="flex items-center justify-between pb-2 border-b border-neutral-100">
                    <span className="text-xs font-bold text-[#2E3138]">
                      {lang === 'bn' ? 'বিজ্ঞপ্তি' : 'Notifications'}
                    </span>
                    <button
                      type="button"
                      onClick={async () => {
                        await apiFetch('/api/notifications/read-all', { method: 'POST' });
                        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
                      }}
                      className="text-[11px] font-semibold text-[#E21B70]"
                    >
                      {lang === 'bn' ? 'সব পড়া হয়েছে' : 'Mark all read'}
                    </button>
                  </div>
                  <div className="max-h-64 overflow-y-auto divide-y divide-neutral-100">
                    {notifications.length === 0 ? (
                      <p className="py-6 text-center text-xs text-neutral-400">
                        {lang === 'bn' ? 'কোনো বিজ্ঞপ্তি নেই' : 'No notifications'}
                      </p>
                    ) : (
                      notifications.map((n) => (
                        <div key={n.id} className="py-2.5 text-xs">
                          <p className="font-semibold text-[#2E3138]">{n.title}</p>
                          <p className="text-neutral-500 mt-0.5">{n.message}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Cart Button */}
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              aria-label="Open Cart"
              className="px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-lg bg-[#E21B70] hover:bg-[#C4135E] text-white text-xs font-bold inline-flex items-center gap-1.5 tabular-nums whitespace-nowrap shrink-0 transition-colors"
            >
              <ShoppingBag className="w-4 h-4" />
              <span className="hidden sm:inline">{t(lang, 'cart')}</span>
              <span className="px-1.5 py-0.5 rounded bg-white/20 text-[11px]">{totalCartItems}</span>
            </button>
          </div>
        </div>

        {/* Sub-Navigation Row on Storefront Home (Delivery / Pickup Underlined Tabs + Pill Search) */}
        {view.type === 'home' && (
          <div className="hidden lg:block border-t border-neutral-100 bg-white">
            <div className="max-w-[1400px] mx-auto px-6 h-12 flex items-center justify-between gap-6">
              <div className="flex items-center gap-7 h-full">
                <button
                  type="button"
                  onClick={() => setFulfillmentTab('delivery')}
                  className={`h-full inline-flex items-center gap-1.5 text-xs font-bold border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                    fulfillmentTab === 'delivery'
                      ? 'border-[#E21B70] text-[#E21B70]'
                      : 'border-transparent text-neutral-600 hover:text-[#2E3138]'
                  }`}
                >
                  <Bike className="w-4 h-4" />
                  <span>{t(lang, 'delivery')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFulfillmentTab('pickup')}
                  className={`h-full inline-flex items-center gap-1.5 text-xs font-bold border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                    fulfillmentTab === 'pickup'
                      ? 'border-[#E21B70] text-[#E21B70]'
                      : 'border-transparent text-neutral-600 hover:text-[#2E3138]'
                  }`}
                >
                  <ShoppingBag className="w-4 h-4" />
                  <span>{t(lang, 'pickup')}</span>
                </button>

                {weather && (
                  <span
                    data-testid="dhaka-weather-status"
                    className="inline-flex items-center gap-1.5 text-xs text-neutral-600 tabular-nums whitespace-nowrap shrink-0"
                  >
                    {weather.isRaining ? (
                      <CloudRain className="w-3.5 h-3.5 text-[#E21B70]" />
                    ) : (
                      <CloudSun className="w-3.5 h-3.5 text-[#E21B70]" />
                    )}
                    <span>
                      {weather.tempC}°C · {lang === 'bn' ? weather.labelBn : weather.labelEn}
                      {weather.rainBufferMin > 0
                        ? lang === 'bn'
                          ? ` (+${weather.rainBufferMin} মি. রাইডার সময়)`
                          : ` (+${weather.rainBufferMin}m rider buffer)`
                        : ''}
                    </span>
                  </span>
                )}
              </div>

              <div className="flex items-center gap-4">
                <div className="relative w-80 xl:w-96">
                  <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t(lang, 'searchPlaceholder')}
                    className="w-full pl-10 pr-4 py-1.5 rounded-full bg-[#F7F7F7] border border-neutral-200 text-xs focus:outline-none focus:bg-white focus:border-[#E21B70] transition-colors"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleSwitchWorkspace('restaurant_owner', { type: 'vendor', onboarding: true })}
                  className="text-xs font-bold text-[#E21B70] hover:underline whitespace-nowrap shrink-0"
                >
                  {lang === 'bn' ? '+ আপনার রেস্টুরেন্ট যুক্ত করুন' : '+ List Your Restaurant'}
                </button>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Main Content Router */}
      <main className="flex-1">
        {view.type === 'restaurant' ? (
          loadingDetail || !detailData ? (
            <div className="max-w-6xl mx-auto px-4 py-10">
              <div className="h-56 rounded-2xl bg-white border border-neutral-200 flex items-center justify-center text-sm text-neutral-500">
                {lang === 'bn' ? 'মেনু লোড হচ্ছে...' : 'Loading restaurant menu...'}
              </div>
            </div>
          ) : (
            <RestaurantDetailView
              restaurant={detailData.restaurant}
              items={detailData.items}
              reviews={detailData.reviews}
              lang={lang}
              mapsApiKey={mapsApiKey}
              isFavorited={favoriteIds.includes(detailData.restaurant.id)}
              onToggleFavorite={handleToggleFavorite}
              onAddToCart={(item) => handleAddToCart(detailData.restaurant, item)}
              onBack={() => setView({ type: 'home' })}
            />
          )
        ) : view.type === 'tracking' ? (
          <OrderTrackingView
            orderId={view.orderId}
            lang={lang}
            mapsApiKey={mapsApiKey}
            onBack={() => setView({ type: 'home' })}
          />
        ) : view.type === 'customer' && user ? (
          <CustomerDashboard
            user={user}
            lang={lang}
            mapsApiKey={mapsApiKey}
            restaurants={restaurants}
            favoriteIds={favoriteIds}
            onToggleFavorite={handleToggleFavorite}
            onSelectRestaurant={openRestaurant}
            onTrackOrder={(orderId) => setView({ type: 'tracking', orderId })}
            onSelectDefaultAddress={(areaName, lat, lng) => {
              const found = DHAKA_AREAS.find((a) => a.name === areaName);
              setSelectedArea({
                name: areaName,
                nameBn: found?.nameBn || areaName,
                lat,
                lng,
              });
              showToast(lang === 'bn' ? 'ডেলিভারি ঠিকানা আপডেট হয়েছে' : 'Delivery location updated');
            }}
            onBack={() => setView({ type: 'home' })}
          />
        ) : view.type === 'vendor' && user ? (
          <VendorDashboard
            user={user}
            lang={lang}
            mapsApiKey={mapsApiKey}
            initialOnboarding={view.onboarding}
            onRefreshUser={refreshUser}
            onBack={() => setView({ type: 'home' })}
          />
        ) : view.type === 'rider' && user ? (
          <RiderDashboard
            user={user}
            lang={lang}
            onRefreshUser={refreshUser}
            onTrackOrder={(orderId) => setView({ type: 'tracking', orderId })}
            onBack={() => setView({ type: 'home' })}
          />
        ) : view.type === 'admin' ? (
          <AdminDashboard
            lang={lang}
            onRestaurantsMutated={loadStorefront}
            onBack={() => setView({ type: 'home' })}
          />
        ) : (
          /* Storefront Homepage (Foodpanda BD Visual Architecture) */
          <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 flex flex-col lg:flex-row gap-7">
            {/* Left Sidebar (Foodpanda BD Dark Promo Card + Clean Filter Panel) */}
            <aside className="hidden lg:block w-[248px] shrink-0 space-y-5">
              {/* Dark Charcoal Promo Ticket Card */}
              <div className="rounded-2xl bg-[#33373D] text-white p-4 space-y-3 shadow-xs">
                <div className="bg-white text-[#2E3138] rounded-xl p-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-bold text-[#E21B70] uppercase tracking-wider">
                      {lang === 'bn' ? 'প্রথম অর্ডার কোড' : 'First Order Code'}
                    </p>
                    <p className="text-sm font-extrabold font-mono-nums tracking-wide">FOODORA50</p>
                  </div>
                  <button
                    type="button"
                    aria-label="Copy FOODORA50 promo code"
                    onClick={() => {
                      navigator.clipboard?.writeText('FOODORA50');
                      setCopiedCode('FOODORA50');
                      showToast(lang === 'bn' ? 'FOODORA50 কপি হয়েছে' : 'Copied FOODORA50');
                    }}
                    className="p-2 rounded-lg bg-[#FFF0F6] text-[#E21B70] hover:bg-[#E21B70] hover:text-white transition-colors"
                  >
                    {copiedCode === 'FOODORA50' ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
                <p className="text-xs leading-relaxed text-white/90 font-medium">
                  {lang === 'bn'
                    ? 'প্রথম অর্ডারে ৫০% ছাড় ও ফ্রি ডেলিভারি আনলক করুন।'
                    : 'Unlock 50% off & free Dhaka delivery on your first order.'}
                </p>
                <div className="grid grid-cols-2 gap-2 pt-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (restaurants[0]) openRestaurant(restaurants[0].slug);
                    }}
                    className="py-1.5 rounded-lg bg-white text-[#2E3138] hover:bg-[#FFF0F6] text-[11px] font-bold transition-colors"
                  >
                    {lang === 'bn' ? 'অর্ডার করুন' : 'Order Now'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setOnlyDiscount((v) => !v)}
                    className="py-1.5 rounded-lg border border-white/25 hover:bg-white/10 text-white text-[11px] font-semibold transition-colors"
                  >
                    {lang === 'bn' ? 'অফার দেখুন' : 'View Deals'}
                  </button>
                </div>
              </div>

              {/* Clean Filters Card */}
              <div className="bg-white rounded-2xl border border-neutral-200 p-4 space-y-5 sticky top-32">
                <div className="flex items-center justify-between">
                  <h2 className="font-bold text-sm text-[#2E3138] flex items-center gap-1.5">
                    <Filter className="w-4 h-4 text-[#E21B70]" />
                    <span>{t(lang, 'filters')}</span>
                  </h2>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCuisine('All');
                      setSortBy('relevance');
                      setOnlyDiscount(false);
                      setOnlyFreeFirst(false);
                      setPriceTierFilter('');
                      setDeliveryFleetFilter('all');
                      setSearchQuery('');
                    }}
                    className="text-[11px] font-semibold text-[#E21B70] hover:underline"
                  >
                    {t(lang, 'clearFilters')}
                  </button>
                </div>

                {/* Sort By */}
                <div className="space-y-2">
                  <p className="text-xs font-bold text-neutral-700">{t(lang, 'sortBy')}</p>
                  {[
                    { id: 'relevance' as const, label: t(lang, 'relevance') },
                    { id: 'rating' as const, label: t(lang, 'rating') },
                    { id: 'fastest' as const, label: t(lang, 'fastest') },
                    { id: 'lowFee' as const, label: t(lang, 'lowFee') },
                  ].map((opt) => (
                    <label key={opt.id} className="flex items-center gap-2 text-xs text-neutral-700 cursor-pointer hover:text-[#2E3138]">
                      <input
                        type="radio"
                        name="sort"
                        checked={sortBy === opt.id}
                        onChange={() => setSortBy(opt.id)}
                        className="accent-[#E21B70]"
                      />
                      <span>{opt.label}</span>
                    </label>
                  ))}
                </div>

                {/* Offers */}
                <div className="space-y-2 pt-3 border-t border-neutral-100">
                  <p className="text-xs font-bold text-neutral-700">{t(lang, 'offers')}</p>
                  <label className="flex items-center gap-2 text-xs text-neutral-700 cursor-pointer hover:text-[#2E3138]">
                    <input
                      type="checkbox"
                      checked={onlyDiscount}
                      onChange={(e) => setOnlyDiscount(e.target.checked)}
                      className="accent-[#E21B70]"
                    />
                    <span>{t(lang, 'hasDiscount')}</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs text-neutral-700 cursor-pointer hover:text-[#2E3138]">
                    <input
                      type="checkbox"
                      checked={onlyFreeFirst}
                      onChange={(e) => setOnlyFreeFirst(e.target.checked)}
                      className="accent-[#E21B70]"
                    />
                    <span>{t(lang, 'freeFirstOrder')}</span>
                  </label>
                </div>

                {/* Delivery Fleet */}
                <div className="space-y-2 pt-3 border-t border-neutral-100">
                  <p className="text-xs font-bold text-neutral-700">{t(lang, 'deliveryFilter')}</p>
                  <div className="space-y-1.5">
                    {[
                      { id: 'all' as const, label: lang === 'bn' ? 'সব রাইডার' : 'All Fleets' },
                      { id: 'platform' as const, label: 'Foodora Rider' },
                      { id: 'third_party' as const, label: 'Pathao Courier' },
                    ].map((opt) => (
                      <label key={opt.id} className="flex items-center gap-2 text-xs text-neutral-700 cursor-pointer hover:text-[#2E3138]">
                        <input
                          type="radio"
                          name="delivery-fleet"
                          checked={deliveryFleetFilter === opt.id}
                          onChange={() => setDeliveryFleetFilter(opt.id)}
                          className="accent-[#E21B70]"
                        />
                        <span>{opt.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Price Tier */}
                <div className="space-y-2 pt-3 border-t border-neutral-100">
                  <p className="text-xs font-bold text-neutral-700">{t(lang, 'priceRange')}</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {['৳', '৳৳', '৳৳৳'].map((tier) => (
                      <button
                        key={tier}
                        type="button"
                        onClick={() => setPriceTierFilter((p) => (p === tier ? '' : tier))}
                        className={`py-1.5 rounded-lg border text-xs font-bold transition-colors ${
                          priceTierFilter === tier
                            ? 'border-[#E21B70] bg-[#FFF0F6] text-[#E21B70]'
                            : 'border-neutral-200 text-neutral-600 hover:border-neutral-300'
                        }`}
                      >
                        {tier}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </aside>

            {/* Main Storefront Column */}
            <div className="flex-1 min-w-0 space-y-8">
              {/* Mobile Location + Search + Mode Switcher + Weather */}
              <div className="lg:hidden space-y-2.5">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setLocationModalOpen(true)}
                    className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-neutral-200 text-xs font-semibold truncate"
                  >
                    <MapPin className="w-4 h-4 text-[#E21B70] shrink-0" />
                    <span className="truncate">
                      {lang === 'bn' ? selectedArea.nameBn : selectedArea.name}, Dhaka
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMobileFiltersOpen((v) => !v)}
                    className="px-3 py-2 rounded-xl bg-white border border-neutral-200 text-xs font-semibold inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                  >
                    <Filter className="w-3.5 h-3.5 text-[#E21B70]" />
                    <span>{t(lang, 'filters')}</span>
                  </button>
                </div>

                <div className="relative">
                  <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t(lang, 'searchPlaceholder')}
                    className="w-full pl-9 pr-3 py-2 rounded-full bg-[#F7F7F7] border border-neutral-200 text-sm focus:outline-none focus:bg-white focus:border-[#E21B70]"
                  />
                </div>

                <div className="flex items-center justify-between gap-2 text-xs">
                  <div className="inline-flex rounded-lg border border-neutral-200 p-0.5 bg-[#F7F7F7]">
                    <button
                      type="button"
                      onClick={() => setFulfillmentTab('delivery')}
                      className={`px-3 py-1 rounded-md font-bold ${
                        fulfillmentTab === 'delivery' ? 'bg-[#E21B70] text-white' : 'text-neutral-600'
                      }`}
                    >
                      {t(lang, 'delivery')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setFulfillmentTab('pickup')}
                      className={`px-3 py-1 rounded-md font-bold ${
                        fulfillmentTab === 'pickup' ? 'bg-[#E21B70] text-white' : 'text-neutral-600'
                      }`}
                    >
                      {t(lang, 'pickup')}
                    </button>
                  </div>
                  {weather && (
                    <span className="inline-flex items-center gap-1 text-neutral-600 tabular-nums">
                      {weather.isRaining ? (
                        <CloudRain className="w-3.5 h-3.5 text-[#E21B70]" />
                      ) : (
                        <CloudSun className="w-3.5 h-3.5 text-[#E21B70]" />
                      )}
                      <span>{weather.tempC}°C · {lang === 'bn' ? weather.labelBn : weather.labelEn}</span>
                    </span>
                  )}
                </div>

                {mobileFiltersOpen && (
                  <div className="bg-white rounded-xl border border-neutral-200 p-3 flex flex-wrap gap-2 text-xs">
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as 'relevance' | 'rating' | 'fastest' | 'lowFee')}
                      className="px-2.5 py-1.5 border border-neutral-200 rounded-lg bg-white"
                    >
                      <option value="relevance">{t(lang, 'relevance')}</option>
                      <option value="rating">{t(lang, 'rating')}</option>
                      <option value="fastest">{t(lang, 'fastest')}</option>
                      <option value="lowFee">{t(lang, 'lowFee')}</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => setOnlyDiscount((v) => !v)}
                      className={`px-3 py-1.5 rounded-lg border font-semibold ${
                        onlyDiscount ? 'border-[#E21B70] bg-[#FFF0F6] text-[#E21B70]' : 'border-neutral-200'
                      }`}
                    >
                      {t(lang, 'hasDiscount')}
                    </button>
                  </div>
                )}
              </div>

              {/* Hero Promotional Banner — Signature Foodpanda BD Soft Rose Blush + #E21B70 CTA */}
              <section className="rounded-2xl overflow-hidden bg-gradient-to-r from-[#FFF0F6] via-[#FCE6EE] to-[#FAD8E6] border border-[#F5C6D8]/70 grid grid-cols-1 lg:grid-cols-12 items-stretch">
                <div className="lg:col-span-7 p-6 sm:p-8 lg:p-10 flex flex-col justify-center space-y-3.5">
                  <div>
                    <span className="inline-block px-2.5 py-1 rounded-md bg-[#E21B70]/12 text-[#E21B70] text-[11px] font-extrabold uppercase tracking-wider">
                      {t(lang, 'heroBadge')}
                    </span>
                  </div>
                  <h1 className="text-2xl sm:text-3xl lg:text-[32px] font-extrabold text-[#2E3138] leading-[1.16] tracking-tight text-balance">
                    {t(lang, 'heroHeadline')}
                  </h1>
                  <p className="text-xs sm:text-sm text-neutral-700 leading-relaxed max-w-xl">
                    {t(lang, 'heroSub')}
                  </p>
                  <p className="text-[11px] sm:text-xs text-neutral-600 font-medium">
                    {t(lang, 'heroTrust')}
                  </p>
                  <div className="pt-1 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        if (restaurants[0]) openRestaurant(restaurants[0].slug);
                      }}
                      className="px-5 py-2.5 rounded-lg bg-[#E21B70] hover:bg-[#C4135E] text-white text-xs font-bold transition-colors shadow-xs whitespace-nowrap shrink-0"
                    >
                      {t(lang, 'heroBtn')}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSwitchWorkspace('restaurant_owner', { type: 'vendor', onboarding: true })}
                      className="px-4 py-2.5 rounded-lg border border-[#E21B70]/35 bg-white/85 hover:bg-white text-[#E21B70] text-xs font-bold transition-colors whitespace-nowrap shrink-0"
                    >
                      {t(lang, 'partnerCta')}
                    </button>
                  </div>
                </div>

                <div className="lg:col-span-5 relative h-48 sm:h-56 lg:h-auto min-h-[220px] bg-[#FAD8E6]">
                  <img
                    src="/src/assets/images/hero_e21b70_feast_1794846866285.jpg"
                    alt="Dhaka Feast"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                  <div className="hidden lg:block absolute inset-y-0 left-0 w-20 bg-gradient-to-r from-[#FCE4EE] via-[#FCE4EE]/55 to-transparent pointer-events-none" />
                </div>
              </section>

              {/* Explore by Cuisine — Clean Borderless Foodpanda Tiles */}
              <section className="space-y-3.5">
                <h2 className="text-xl font-extrabold text-[#2E3138] tracking-tight">{t(lang, 'favCuisines')}</h2>
                <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar">
                  {CUISINE_CATEGORIES.map((c) => {
                    const active = selectedCuisine === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setSelectedCuisine(c.id)}
                        className="shrink-0 w-20 sm:w-24 text-center group"
                      >
                        <div
                          className={`w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden bg-neutral-100 mx-auto mb-2 transition-all duration-200 ${
                            active
                              ? 'ring-2 ring-[#E21B70] ring-offset-2'
                              : 'group-hover:-translate-y-0.5 group-hover:shadow-md'
                          }`}
                        >
                          <img
                            src={c.img}
                            alt={c.labelEn}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        </div>
                        <p
                          className={`text-xs font-bold truncate ${
                            active ? 'text-[#E21B70]' : 'text-[#2E3138]'
                          }`}
                        >
                          {lang === 'bn' ? c.labelBn : c.labelEn}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Daily Deals — Vibrant #E21B70 Foodpanda Split Promo Cards */}
              {coupons.length > 0 && (
                <section className="space-y-3.5">
                  <h2 className="text-xl font-extrabold text-[#2E3138] tracking-tight">{t(lang, 'dailyDeals')}</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {coupons.slice(0, 3).map((c, idx) => {
                      const dealThumbs = [
                        '/src/assets/images/food_kacchi_biriyani_1794831373742.jpg',
                        '/src/assets/images/food_tandoori_kabab_1794831377175.jpg',
                        '/src/assets/images/food_gourmet_burger_1794831375029.jpg',
                      ];
                      return (
                        <div
                          key={c.id}
                          className="rounded-2xl bg-gradient-to-br from-[#E21B70] to-[#C4135E] text-white p-4 flex items-center justify-between gap-3 shadow-[0_6px_18px_rgba(226,27,112,0.2)] hover:shadow-[0_10px_24px_rgba(226,27,112,0.3)] transition-shadow"
                        >
                          <div className="min-w-0 flex-1 space-y-2">
                            <p className="font-extrabold text-base leading-snug line-clamp-2">
                              {localizeCouponTitle(c.code, c.title, lang)}
                            </p>
                            <p className="text-[11px] text-white/85 tabular-nums">
                              {t(lang, 'minOrderLabel')} {formatBdt(c.minOrder, lang)}
                            </p>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard?.writeText(c.code);
                                setCopiedCode(c.code);
                                showToast(
                                  lang === 'bn' ? `কুপন ${c.code} কপি হয়েছে` : `Coupon ${c.code} copied`
                                );
                              }}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white text-[#E21B70] hover:bg-[#FFF0F6] text-[11px] font-extrabold font-mono-nums transition-colors"
                            >
                              <span>{c.code}</span>
                              <span>·</span>
                              <span>
                                {copiedCode === c.code
                                  ? lang === 'bn'
                                    ? 'কপি হয়েছে'
                                    : 'Copied'
                                  : lang === 'bn'
                                  ? 'কপি'
                                  : 'Copy'}
                              </span>
                            </button>
                          </div>
                          <img
                            src={dealThumbs[idx % dealThumbs.length]}
                            alt={c.code}
                            referrerPolicy="no-referrer"
                            className="w-20 h-20 rounded-full object-cover border-2 border-white/30 shadow-md shrink-0 bg-white/10"
                          />
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* All Restaurants Grid — Clean Foodpanda Unboxed Typography Below Photo */}
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-extrabold text-[#2E3138] tracking-tight">
                    {t(lang, 'allRestaurants')}{' '}
                    <span className="text-sm font-semibold text-neutral-400 tabular-nums">
                      ({filteredRestaurants.length})
                    </span>
                  </h2>
                </div>

                {loadingStore ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <div key={n} className="space-y-2.5">
                        <div className="aspect-[16/10] rounded-xl bg-neutral-100" />
                        <div className="h-4 w-2/3 rounded bg-neutral-100" />
                        <div className="h-3 w-1/2 rounded bg-neutral-100" />
                      </div>
                    ))}
                  </div>
                ) : filteredRestaurants.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-neutral-200 p-12 text-center">
                    <p className="font-bold text-[#2E3138]">{t(lang, 'noResults')}</p>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCuisine('All');
                        setSearchQuery('');
                        setOnlyDiscount(false);
                        setOnlyFreeFirst(false);
                        setPriceTierFilter('');
                        setDeliveryFleetFilter('all');
                      }}
                      className="mt-3 px-4 py-2 rounded-lg bg-[#E21B70] text-white text-xs font-semibold"
                    >
                      {t(lang, 'clearFilters')}
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                    {filteredRestaurants.map((rest) => {
                      const isFav = favoriteIds.includes(rest.id);
                      return (
                        <article
                          key={rest.id}
                          onClick={() => openRestaurant(rest.slug)}
                          className="group cursor-pointer flex flex-col"
                        >
                          <div className="relative aspect-[16/10] rounded-xl bg-neutral-100 overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
                            <img
                              src={rest.coverUrl}
                              alt={rest.name}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                            {/* Single Clean Image Tag */}
                            {rest.discountPct > 0 ? (
                              <span className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-md bg-[#E21B70] text-white text-[11px] font-bold shadow-xs">
                                {rest.discountPct}{t(lang, 'discountOff')}
                              </span>
                            ) : rest.isSponsored ? (
                              <span className="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded bg-black/65 text-white text-[10px] font-semibold">
                                {t(lang, 'sponsored')}
                              </span>
                            ) : rest.isNew ? (
                              <span className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-md bg-emerald-600 text-white text-[11px] font-bold">
                                {t(lang, 'newBadge')}
                              </span>
                            ) : null}

                            <button
                              type="button"
                              aria-label={`Favorite ${rest.name}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleFavorite(rest.id);
                              }}
                              className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-white/95 shadow-sm flex items-center justify-center text-neutral-700 hover:text-[#E21B70] transition-colors"
                            >
                              <Heart
                                className={`w-4 h-4 ${isFav ? 'text-[#E21B70] fill-[#E21B70]' : ''}`}
                              />
                            </button>
                          </div>

                          <div className="pt-2.5 px-0.5 space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <h3 className="font-bold text-[15px] text-[#2E3138] group-hover:text-[#E21B70] transition-colors truncate">
                                {lang === 'bn' ? rest.nameBn : rest.name}
                              </h3>
                              <span className="inline-flex items-center gap-1 text-xs font-bold text-[#2E3138] shrink-0 tabular-nums">
                                <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                                {rest.rating}
                                <span className="font-normal text-neutral-500">({rest.reviewCount})</span>
                              </span>
                            </div>

                            <p className="text-xs text-neutral-500 truncate tabular-nums">
                              {rest.deliveryTimeMin} {t(lang, 'minFrom')} · {rest.priceTier} · {rest.cuisine} · {rest.area}
                            </p>

                            <p className="text-xs font-semibold text-[#E21B70] inline-flex items-center gap-1.5 tabular-nums">
                              <Bike className="w-3.5 h-3.5 shrink-0" />
                              <span>
                                {fulfillmentTab === 'pickup'
                                  ? lang === 'bn'
                                    ? 'পিকআপ ফ্রি'
                                    : 'Free Pickup'
                                  : rest.deliveryFee <= 35
                                  ? t(lang, 'firstOrderFree')
                                  : formatBdt(rest.deliveryFee, lang)}
                              </span>
                              <span className="text-neutral-400 font-normal">
                                · {rest.deliveryMode === 'third_party' ? 'Pathao' : 'Foodora Rider'}
                              </span>
                            </p>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          </div>
        )}
      </main>

      {/* Mobile Sticky Bottom Cart Bar (<= 15% viewport height) */}
      {totalCartItems > 0 && !cartOpen && view.type !== 'tracking' && (
        <div className="lg:hidden sticky bottom-0 z-30 bg-white border-t border-neutral-200 px-4 py-2.5 flex items-center justify-between gap-3">
          <div className="text-xs">
            <p className="font-bold text-[#2E3138]">
              {totalCartItems} {lang === 'bn' ? 'টি আইটেম' : 'items'} · {cartRestaurant?.name}
            </p>
            <p className="text-neutral-500">{lang === 'bn' ? 'চেকআউট করতে ট্যাপ করুন' : 'Tap to view cart'}</p>
          </div>
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="px-4 py-2 rounded-lg bg-[#E21B70] text-white text-xs font-bold"
          >
            {t(lang, 'cart')} ({totalCartItems})
          </button>
        </div>
      )}

      {/* Foodpanda-Style Cuisine Directory & Marketplace Footer */}
      <footer className="bg-white border-t border-neutral-200 mt-14">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-10 space-y-8 text-xs text-neutral-600">
          {/* Popular Dhaka Cuisines Directory */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 pb-8 border-b border-neutral-100">
            <div className="space-y-1.5">
              <p className="font-bold text-[#2E3138] underline decoration-neutral-300 underline-offset-4">
                {lang === 'bn' ? 'ঢাকায় বিরিয়ানি ডেলিভারি' : 'Biriyani Delivery in Dhaka'}
              </p>
              <p className="leading-relaxed">
                Sultan&apos;s Dine, Kacchi Bhai, Tehari Ghar, Haji Biriyani, Star Kabab
              </p>
            </div>
            <div className="space-y-1.5">
              <p className="font-bold text-[#2E3138] underline decoration-neutral-300 underline-offset-4">
                {lang === 'bn' ? 'বার্গার ও ফাস্ট ফুড' : 'Burgers & Fast Food'}
              </p>
              <p className="leading-relaxed">
                Chillox, Takeout Banani, Madchef, Burger Xpress, Herfy Gulshan
              </p>
            </div>
            <div className="space-y-1.5">
              <p className="font-bold text-[#2E3138] underline decoration-neutral-300 underline-offset-4">
                {lang === 'bn' ? 'পিজ্জা ও ইতালিয়ান' : 'Pizza & Italian'}
              </p>
              <p className="leading-relaxed">
                Pizza Hut Gulshan 2, Pizzaburg, Bella Italia, Cheez Banani
              </p>
            </div>
            <div className="space-y-1.5">
              <p className="font-bold text-[#2E3138] underline decoration-neutral-300 underline-offset-4">
                {lang === 'bn' ? 'বাংলাদেশি ও কাবাব' : 'Bangladeshi & Kabab'}
              </p>
              <p className="leading-relaxed">
                Star Kabab, Mezzan Haile Aaiun, Shodeshi Banani, Ghoroa Hotel
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 items-start">
            <div className="space-y-2">
              <p className="text-lg font-extrabold text-[#E21B70]">
                foodora<span className="text-[#2E3138]">bd</span>
              </p>
              <p className="leading-relaxed">
                {lang === 'bn'
                  ? 'বাংলাদেশের আধুনিক মাল্টি-ভেন্ডর ফুড ডেলিভারি মার্কেটপ্লেস।'
                  : 'Bangladesh’s full-stack multi-vendor food delivery marketplace.'}
              </p>
              <p className="text-neutral-400">© 2026 Foodora BD</p>
            </div>

            <div className="space-y-1.5">
              <p className="font-bold text-[#2E3138] text-sm">
                {lang === 'bn' ? 'ঢাকা ডেলিভারি জোন' : 'Dhaka Delivery Zones'}
              </p>
              <p>Gulshan 1 &amp; 2 · Banani · Dhanmondi</p>
              <p>Uttara · Mirpur · Bashundhara R/A · Motijheel</p>
            </div>

            <div className="space-y-1.5">
              <p className="font-bold text-[#2E3138] text-sm">
                {lang === 'bn' ? 'মার্কেটপ্লেস পোর্টাল' : 'Partner Portals'}
              </p>
              <button
                type="button"
                onClick={() => handleSwitchWorkspace('restaurant_owner', { type: 'vendor', onboarding: true })}
                className="block hover:text-[#E21B70]"
              >
                {t(lang, 'partnerCta')}
              </button>
              <button
                type="button"
                onClick={() => handleSwitchWorkspace('rider', { type: 'rider' })}
                className="block hover:text-[#E21B70]"
              >
                {t(lang, 'riderCta')}
              </button>
              <button
                type="button"
                onClick={() => handleSwitchWorkspace('super_admin', { type: 'admin' })}
                className="block hover:text-[#E21B70]"
              >
                {t(lang, 'adminCta')}
              </button>
            </div>

            <div className="space-y-1.5">
              <p className="font-bold text-[#2E3138] text-sm">
                {lang === 'bn' ? 'পেমেন্ট ও ডেলিভারি' : 'Payments & Couriers'}
              </p>
              <p>bKash · Nagad · SSLCommerz · Cash on Delivery</p>
              <p>Foodora Own Riders · Pathao Courier</p>
            </div>
          </div>
        </div>
      </footer>

      {/* Cart & Checkout Drawer */}
      <CartCheckoutDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        cartItems={cartItems}
        restaurant={cartRestaurant}
        lang={lang}
        mapsApiKey={mapsApiKey}
        selectedArea={selectedArea}
        customerName={user?.fullName || 'Rahim Uddin'}
        onUpdateQty={handleUpdateQty}
        onRemoveItem={handleRemoveCartItem}
        onClearCart={handleClearCart}
        onOrderCreated={(orderId) => {
          setCartOpen(false);
          setView({ type: 'tracking', orderId });
          loadUserSignals();
        }}
      />

      {/* Single-Restaurant Cart Conflict Modal */}
      {pendingSwitchItem && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-xl">
            <h3 className="font-bold text-base text-[#2E3138]">
              {lang === 'bn' ? 'নতুন কার্ট শুরু করবেন?' : 'Replace items in cart?'}
            </h3>
            <p className="text-xs text-neutral-600">
              {lang === 'bn'
                ? `আপনার কার্টে ইতিমধ্যে ${cartRestaurant?.name}-এর খাবার রয়েছে। নতুন রেস্টুরেন্টের খাবার যোগ করলে পূর্বের কার্ট খালি হবে।`
                : `Your cart contains items from ${cartRestaurant?.name}. Starting a new order will clear your previous cart.`}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingSwitchItem(null)}
                className="px-4 py-2 rounded-xl border border-neutral-200 text-xs font-semibold"
              >
                {lang === 'bn' ? 'বাতিল' : 'Keep Existing'}
              </button>
              <button
                type="button"
                onClick={confirmSwitchRestaurantCart}
                className="px-4 py-2 rounded-xl bg-[#E21B70] text-white text-xs font-semibold"
              >
                {lang === 'bn' ? 'নতুন কার্ট শুরু করুন' : 'Start New Cart'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Location Picker Modal */}
      {locationModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-[#2E3138]">
                {t(lang, 'selectAddress')}
              </h3>
              <button
                type="button"
                onClick={() => setLocationModalOpen(false)}
                className="p-1.5 rounded-lg text-neutral-500 hover:bg-neutral-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleOsmSearch} className="flex flex-wrap sm:flex-nowrap gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={osmQuery}
                  onChange={(e) => setOsmQuery(e.target.value)}
                  placeholder={
                    lang === 'bn'
                      ? 'ঢাকার রাস্তার নাম বা এলাকা লিখুন (যেমন: Banani Road 11)...'
                      : 'Search Dhaka street or landmark (OpenStreetMap)...'
                  }
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-neutral-200 text-xs focus:outline-none focus:border-[#E21B70]"
                />
              </div>
              <button
                type="submit"
                disabled={osmSearching}
                className="px-3.5 py-2 rounded-xl bg-[#E21B70] hover:bg-[#C4135E] text-white text-xs font-semibold whitespace-nowrap shrink-0"
              >
                {osmSearching ? '...' : lang === 'bn' ? 'খুঁজুন' : 'Find Address'}
              </button>
              <button
                type="button"
                onClick={handleUseCurrentGps}
                disabled={locatingGps}
                className="px-3 py-2 rounded-xl border border-neutral-200 hover:border-[#E21B70] text-xs font-semibold text-[#2E3138] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <LocateFixed className="w-3.5 h-3.5 text-[#E21B70]" />
                <span>{locatingGps ? '...' : lang === 'bn' ? 'GPS অবস্থান' : 'Use GPS'}</span>
              </button>
            </form>

            {osmPlaces.length > 0 && (
              <div className="rounded-xl border border-neutral-200 divide-y divide-neutral-100 max-h-36 overflow-y-auto bg-[#FAFAFB]">
                {osmPlaces.map((p, i) => (
                  <button
                    key={`${p.lat}-${p.lng}-${i}`}
                    type="button"
                    onClick={() => {
                      setSelectedArea({
                        name: p.shortName,
                        nameBn: p.shortName,
                        lat: p.lat,
                        lng: p.lng,
                      });
                      setOsmPlaces([]);
                    }}
                    className="w-full px-3 py-2 text-left hover:bg-[#FFF0F6] text-xs transition-colors flex items-center gap-2"
                  >
                    <MapPin className="w-3.5 h-3.5 text-[#E21B70] shrink-0" />
                    <span className="truncate font-medium text-[#2E3138]">{p.displayName}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {DHAKA_AREAS.map((a) => (
                <button
                  key={a.name}
                  type="button"
                  onClick={() => setSelectedArea(a)}
                  className={`px-3 py-2 rounded-xl border text-xs font-semibold text-left ${
                    selectedArea.name === a.name
                      ? 'border-[#E21B70] bg-[#FFF0F6] text-[#E21B70]'
                      : 'border-neutral-200 text-neutral-700 hover:border-neutral-300'
                  }`}
                >
                  {lang === 'bn' ? a.nameBn : a.name}
                </button>
              ))}
            </div>

            <DhakaMapPicker
              mapsApiKey={mapsApiKey}
              lang={lang}
              center={{ lat: selectedArea.lat, lng: selectedArea.lng }}
              markerLabel={selectedArea.name}
              interactive
              heightClass="h-[260px]"
              onSelectLocation={(c) => {
                const found = DHAKA_AREAS.find((a) => a.name === c.areaName);
                setSelectedArea({
                  name: c.areaName || selectedArea.name,
                  nameBn: found?.nameBn || c.areaName || selectedArea.nameBn,
                  lat: c.lat,
                  lng: c.lng,
                });
              }}
            />

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setLocationModalOpen(false)}
                className="px-5 py-2.5 rounded-xl bg-[#E21B70] text-white text-xs font-semibold"
              >
                {lang === 'bn' ? 'এলাকা নিশ্চিত করুন' : 'Confirm Delivery Zone'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Auth & Workspace Role Switcher Modal */}
      {authModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-[#2E3138]">
                {lang === 'bn' ? 'অ্যাকাউন্ট ও রোল পোর্টাল' : 'Account & Role Workspaces'}
              </h3>
              <button
                type="button"
                onClick={() => setAuthModalOpen(false)}
                className="p-1.5 rounded-lg text-neutral-500 hover:bg-neutral-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {user && (
              <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-200 text-xs">
                <p className="font-bold text-[#2E3138]">{user.fullName}</p>
                <p className="text-neutral-500">
                  {user.email} · Role: <span className="uppercase font-semibold">{user.role}</span>
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={async () => {
                await signInWithGoogle();
                setAuthModalOpen(false);
              }}
              className="w-full py-2.5 rounded-xl border border-neutral-300 hover:border-[#E21B70] text-xs font-bold text-[#2E3138] inline-flex items-center justify-center gap-2"
            >
              <LogIn className="w-4 h-4 text-[#E21B70]" />
              <span>{lang === 'bn' ? 'Google দিয়ে লগইন করুন' : 'Continue with Google OAuth'}</span>
            </button>

            <div className="pt-2 border-t border-neutral-100 space-y-2">
              <p className="text-[11px] font-bold uppercase text-neutral-500">
                {lang === 'bn' ? 'দ্রুত ওয়ার্কস্পেস পরিবর্তন (ডেলিভারি / ভেন্ডর / অ্যাডমিন)' : 'Switch Role Workspace'}
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => handleSwitchWorkspace('customer', { type: 'customer' })}
                  className="p-3 rounded-xl border border-neutral-200 hover:border-[#E21B70] text-left font-semibold"
                >
                  <User className="w-4 h-4 text-[#E21B70] mb-1" />
                  Customer Portal
                </button>
                <button
                  type="button"
                  onClick={() => handleSwitchWorkspace('restaurant_owner', { type: 'vendor' })}
                  className="p-3 rounded-xl border border-neutral-200 hover:border-[#E21B70] text-left font-semibold"
                >
                  <Store className="w-4 h-4 text-[#E21B70] mb-1" />
                  Vendor Dashboard
                </button>
                <button
                  type="button"
                  onClick={() => handleSwitchWorkspace('rider', { type: 'rider' })}
                  className="p-3 rounded-xl border border-neutral-200 hover:border-[#E21B70] text-left font-semibold"
                >
                  <Bike className="w-4 h-4 text-[#E21B70] mb-1" />
                  Rider Portal
                </button>
                <button
                  type="button"
                  onClick={() => handleSwitchWorkspace('super_admin', { type: 'admin' })}
                  className="p-3 rounded-xl border border-neutral-200 hover:border-[#E21B70] text-left font-semibold"
                >
                  <Shield className="w-4 h-4 text-[#E21B70] mb-1" />
                  Super Admin
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-xl bg-[#2E3138] text-white text-xs font-semibold shadow-lg">
          {toastMsg}
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MarketplaceApp />
    </AuthProvider>
  );
}
