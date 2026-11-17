import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  Download,
  Package,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Shield,
  Sliders,
  Store,
  Tag,
  Trash2,
  Upload,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { DHAKA_AREAS } from '../lib/i18n';
import { formatBdt, OrderStatus } from '../lib/marketplace-logic';
import type {
  AuditLogItem,
  Coupon,
  FoodItem,
  Lang,
  LedgerEntry,
  OrderRecord,
  PayoutRecord,
  PlatformSettings,
  Restaurant,
  RiderRecord,
} from '../types/marketplace';

interface AdminUserRow {
  id: number;
  uid: string;
  email: string;
  fullName: string;
  role: string;
  status: string;
}

interface AdminDashboardProps {
  lang: Lang;
  onRestaurantsMutated: () => Promise<void>;
  onBack: () => void;
}

interface ProductFormState {
  id?: number;
  restaurantId: number;
  category: string;
  name: string;
  nameBn: string;
  description: string;
  imageUrl: string;
  price: string;
  discountPrice: string;
  inStock: boolean;
  isAvailable: boolean;
  isPopular: boolean;
}

interface RestaurantFormState {
  id?: number;
  name: string;
  nameBn: string;
  cuisine: string;
  area: string;
  address: string;
  description: string;
  coverUrl: string;
  deliveryFee: string;
  minOrder: string;
  discountPct: string;
  openingHours: string;
  deliveryMode: 'platform' | 'restaurant' | 'third_party';
  commissionRate: string;
  subscriptionPlan: 'free' | 'basic' | 'premium' | 'enterprise';
  isOpen: boolean;
  isSponsored: boolean;
}

const ORDER_STATUS_OPTIONS: OrderStatus[] = [
  'confirmed',
  'accepted',
  'preparing',
  'ready',
  'rider_assigned',
  'picked_up',
  'on_the_way',
  'delivered',
  'cancelled',
];

export function AdminDashboard({ lang, onRestaurantsMutated, onBack }: AdminDashboardProps) {
  const [tab, setTab] = useState<
    'overview' | 'products' | 'restaurants' | 'orders' | 'finance' | 'coupons' | 'users'
  >('overview');
  const [loading, setLoading] = useState(true);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [products, setProducts] = useState<FoodItem[]>([]);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [payouts, setPayouts] = useState<PayoutRecord[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [riders, setRiders] = useState<RiderRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Global Platform Settings Form
  const [platformName, setPlatformName] = useState('Foodora BD');
  const [defaultCommissionPct, setDefaultCommissionPct] = useState('15.00');
  const [defaultDeliveryFee, setDefaultDeliveryFee] = useState('49');
  const [serviceFee, setServiceFee] = useState('10');
  const [minOrderDefault, setMinOrderDefault] = useState('150');
  const [savingSettings, setSavingSettings] = useState(false);

  // Product Catalog Filter & Modal
  const [productSearch, setProductSearch] = useState('');
  const [productRestFilter, setProductRestFilter] = useState<string>('all');
  const [productModal, setProductModal] = useState<ProductFormState | null>(null);
  const [savingProduct, setSavingProduct] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Restaurant Create / Edit Modal
  const [restaurantModal, setRestaurantModal] = useState<RestaurantFormState | null>(null);
  const [savingRestaurant, setSavingRestaurant] = useState(false);

  // New coupon form
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [couponType, setCouponType] = useState<'percentage' | 'fixed' | 'free_delivery'>('fixed');
  const [value, setValue] = useState('100');
  const [minOrder, setMinOrder] = useState('350');

  const loadAdmin = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{
        restaurants: Restaurant[];
        products: FoodItem[];
        orders: OrderRecord[];
        users: AdminUserRow[];
        ledger: LedgerEntry[];
        payouts: PayoutRecord[];
        coupons: Coupon[];
        riders: RiderRecord[];
        auditLogs: AuditLogItem[];
        settings: PlatformSettings | null;
      }>('/api/admin/workspace');
      setRestaurants(res.restaurants);
      setProducts(res.products || []);
      setOrders(res.orders);
      setUsers(res.users);
      setLedger(res.ledger);
      setPayouts(res.payouts);
      setCoupons(res.coupons);
      setRiders(res.riders);
      setAuditLogs(res.auditLogs || []);
      setSettings(res.settings);
      if (res.settings) {
        setPlatformName(res.settings.platformName);
        setDefaultCommissionPct(String(res.settings.defaultCommissionPct));
        setDefaultDeliveryFee(String(res.settings.defaultDeliveryFee));
        setServiceFee(String(res.settings.serviceFee));
        setMinOrderDefault(String(res.settings.minOrderDefault));
      }
    } catch (err) {
      console.error('Failed to load admin workspace:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAdmin();
  }, [loadAdmin]);

  const restaurantNameMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const r of restaurants) {
      map.set(r.id, lang === 'bn' ? r.nameBn : r.name);
    }
    return map;
  }, [restaurants, lang]);

  const filteredProducts = useMemo(() => {
    return products.filter((item) => {
      if (productRestFilter !== 'all' && item.restaurantId !== Number(productRestFilter)) {
        return false;
      }
      if (productSearch.trim()) {
        const q = productSearch.trim().toLowerCase();
        return (
          item.name.toLowerCase().includes(q) ||
          item.nameBn.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [products, productRestFilter, productSearch]);

  const handleUploadImage = async (file: File, onUploaded: (url: string) => void) => {
    setUploadingPhoto(true);
    setFeedback(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Could not read file'));
        reader.readAsDataURL(file);
      });
      const res = await apiFetch<{ imageUrl: string }>('/api/upload-image', {
        method: 'POST',
        body: JSON.stringify({ dataUrl, filename: file.name }),
      });
      onUploaded(res.imageUrl);
      setFeedback(lang === 'bn' ? 'ছবি সফলভাবে আপলোড হয়েছে।' : 'Image uploaded successfully.');
    } catch (err: unknown) {
      setFeedback(err instanceof Error ? err.message : 'Image upload failed');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSaveGlobalSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      await apiFetch('/api/admin/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          platformName: platformName.trim(),
          defaultCommissionPct: defaultCommissionPct.trim(),
          defaultDeliveryFee: Number(defaultDeliveryFee) || 0,
          serviceFee: Number(serviceFee) || 0,
          minOrderDefault: Number(minOrderDefault) || 0,
        }),
      });
      setFeedback(
        lang === 'bn'
          ? 'প্ল্যাটফর্ম সিস্টেম সেটিংস সংরক্ষণ করা হয়েছে।'
          : 'Global system settings saved.'
      );
      await loadAdmin();
    } finally {
      setSavingSettings(false);
    }
  };

  const handleToggleSetting = async (key: keyof PlatformSettings, val: boolean) => {
    await apiFetch('/api/admin/settings', {
      method: 'PATCH',
      body: JSON.stringify({ [key]: val }),
    });
    setFeedback(`Updated ${String(key)} to ${val ? 'ON' : 'OFF'}.`);
    await loadAdmin();
  };

  const openCreateProductModal = () => {
    const defaultRestId = restaurants[0]?.id || 1;
    setProductModal({
      restaurantId: defaultRestId,
      category: 'Main Course',
      name: '',
      nameBn: '',
      description: '',
      imageUrl: '',
      price: '350',
      discountPrice: '',
      inStock: true,
      isAvailable: true,
      isPopular: true,
    });
  };

  const openEditProductModal = (item: FoodItem) => {
    setProductModal({
      id: item.id,
      restaurantId: item.restaurantId,
      category: item.category,
      name: item.name,
      nameBn: item.nameBn,
      description: item.description || '',
      imageUrl: item.imageUrl || '',
      price: String(item.price),
      discountPrice: item.discountPrice ? String(item.discountPrice) : '',
      inStock: item.inStock,
      isAvailable: item.isAvailable,
      isPopular: item.isPopular,
    });
  };

  const handleSaveProductModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productModal) return;
    setSavingProduct(true);
    try {
      const payload = {
        restaurantId: Number(productModal.restaurantId),
        category: productModal.category.trim(),
        name: productModal.name.trim(),
        nameBn: productModal.nameBn.trim() || productModal.name.trim(),
        description: productModal.description.trim(),
        imageUrl: productModal.imageUrl.trim(),
        price: Number(productModal.price) || 100,
        discountPrice: productModal.discountPrice ? Number(productModal.discountPrice) : null,
        inStock: productModal.inStock,
        isAvailable: productModal.isAvailable,
        isPopular: productModal.isPopular,
      };

      if (productModal.id) {
        await apiFetch(`/api/admin/products/${productModal.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        setFeedback(lang === 'bn' ? 'পণ্য আপডেট সম্পন্ন হয়েছে।' : `Updated "${payload.name}".`);
      } else {
        await apiFetch('/api/admin/products', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setFeedback(lang === 'bn' ? 'নতুন পণ্য আপলোড হয়েছে।' : `Uploaded "${payload.name}".`);
      }
      setProductModal(null);
      await loadAdmin();
    } finally {
      setSavingProduct(false);
    }
  };

  const handleQuickProductToggle = async (item: FoodItem, field: 'inStock' | 'isPopular') => {
    await apiFetch(`/api/admin/products/${item.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ [field]: !item[field] }),
    });
    await loadAdmin();
  };

  const handleDeleteProduct = async (item: FoodItem) => {
    await apiFetch(`/api/admin/products/${item.id}`, { method: 'DELETE' });
    setFeedback(lang === 'bn' ? 'পণ্য মুছে ফেলা হয়েছে।' : `Deleted "${item.name}".`);
    await loadAdmin();
  };

  const openCreateRestaurantModal = () => {
    setRestaurantModal({
      name: '',
      nameBn: '',
      cuisine: 'Bangladeshi',
      area: DHAKA_AREAS[0].name,
      address: '',
      description: '',
      coverUrl: '',
      deliveryFee: '49',
      minOrder: '150',
      discountPct: '15',
      openingHours: '10:00 AM - 11:30 PM',
      deliveryMode: 'platform',
      commissionRate: '15.00',
      subscriptionPlan: 'basic',
      isOpen: true,
      isSponsored: false,
    });
  };

  const openEditRestaurantModal = (r: Restaurant) => {
    setRestaurantModal({
      id: r.id,
      name: r.name,
      nameBn: r.nameBn,
      cuisine: r.cuisine,
      area: r.area,
      address: r.address,
      description: r.description,
      coverUrl: r.coverUrl,
      deliveryFee: String(r.deliveryFee),
      minOrder: String(r.minOrder),
      discountPct: String(r.discountPct),
      openingHours: r.openingHours,
      deliveryMode: r.deliveryMode,
      commissionRate: r.commissionRate,
      subscriptionPlan: r.subscriptionPlan,
      isOpen: r.isOpen,
      isSponsored: r.isSponsored,
    });
  };

  const handleSaveRestaurantModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restaurantModal) return;
    setSavingRestaurant(true);
    try {
      const payload = {
        name: restaurantModal.name.trim(),
        nameBn: restaurantModal.nameBn.trim() || restaurantModal.name.trim(),
        cuisine: restaurantModal.cuisine.trim(),
        area: restaurantModal.area.trim(),
        address: restaurantModal.address.trim(),
        description: restaurantModal.description.trim(),
        coverUrl: restaurantModal.coverUrl.trim(),
        deliveryFee: Number(restaurantModal.deliveryFee) || 0,
        minOrder: Number(restaurantModal.minOrder) || 0,
        discountPct: Number(restaurantModal.discountPct) || 0,
        openingHours: restaurantModal.openingHours.trim(),
        deliveryMode: restaurantModal.deliveryMode,
        commissionRate: restaurantModal.commissionRate.trim(),
        subscriptionPlan: restaurantModal.subscriptionPlan,
        isOpen: restaurantModal.isOpen,
        isSponsored: restaurantModal.isSponsored,
      };
      if (restaurantModal.id) {
        await apiFetch(`/api/admin/restaurants/${restaurantModal.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        setFeedback(`Updated restaurant "${payload.name}".`);
      } else {
        await apiFetch('/api/admin/restaurants', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setFeedback(`Created restaurant "${payload.name}".`);
      }
      setRestaurantModal(null);
      await loadAdmin();
      await onRestaurantsMutated();
    } finally {
      setSavingRestaurant(false);
    }
  };

  const handleUpdateRestaurant = async (
    id: number,
    patch: Partial<{
      status: 'pending' | 'approved' | 'rejected' | 'suspended';
      commissionRate: string;
      subscriptionPlan: 'free' | 'basic' | 'premium' | 'enterprise';
      isSponsored: boolean;
      isOpen: boolean;
    }>
  ) => {
    await apiFetch(`/api/admin/restaurants/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    setFeedback(lang === 'bn' ? 'রেস্টুরেন্ট তথ্য আপডেট হয়েছে।' : 'Restaurant configuration saved.');
    await loadAdmin();
    await onRestaurantsMutated();
  };

  const handleOrderOverride = async (
    orderId: number,
    patch: { status: OrderStatus; riderUid?: string | null }
  ) => {
    await apiFetch(`/api/admin/orders/${orderId}/status`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    setFeedback(`Order #${orderId} updated.`);
    await loadAdmin();
  };

  const handleRefundOrder = async (orderId: number) => {
    await apiFetch(`/api/admin/orders/${orderId}/refund`, {
      method: 'PATCH',
      body: JSON.stringify({ reason: 'Cancelled & refunded by Super Admin' }),
    });
    setFeedback(
      lang === 'bn'
        ? 'অর্ডার বাতিল ও কমিশন রিভার্সাল সম্পন্ন হয়েছে।'
        : 'Order cancelled and commission reversed in ledger.'
    );
    await loadAdmin();
  };

  const handlePayoutDecision = async (id: number, status: 'paid' | 'rejected') => {
    await apiFetch(`/api/admin/payouts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    await loadAdmin();
  };

  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !title.trim()) return;
    await apiFetch('/api/admin/coupons', {
      method: 'POST',
      body: JSON.stringify({
        code: code.trim().toUpperCase(),
        title: title.trim(),
        type: couponType,
        value: Number(value) || 0,
        minOrder: Number(minOrder) || 0,
        maxDiscount: 300,
      }),
    });
    setCode('');
    setTitle('');
    setFeedback(lang === 'bn' ? 'নতুন কুপন প্রকাশিত হয়েছে।' : 'Promo coupon published.');
    await loadAdmin();
  };

  const handleToggleCoupon = async (c: Coupon) => {
    await apiFetch(`/api/admin/coupons/${c.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive: !c.isActive }),
    });
    await loadAdmin();
  };

  const handleDeleteCoupon = async (id: number) => {
    await apiFetch(`/api/admin/coupons/${id}`, { method: 'DELETE' });
    await loadAdmin();
  };

  const handleUpdateUser = async (
    u: AdminUserRow,
    patch: Partial<{ role: string; status: string }>
  ) => {
    await apiFetch(`/api/admin/users/${u.id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    setFeedback(`Updated user ${u.email}.`);
    await loadAdmin();
  };

  const handleUpdateRider = async (
    r: RiderRecord,
    patch: Partial<{ status: string; isAvailable: boolean }>
  ) => {
    await apiFetch(`/api/admin/riders/${r.id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    setFeedback(`Updated rider ${r.fullName}.`);
    await loadAdmin();
  };

  const gmv = orders
    .filter((o) => o.status !== 'cancelled')
    .reduce((s, o) => s + o.totalAmount, 0);
  const netCommission = ledger.reduce((s, l) => s + l.commissionAmount, 0);
  const pendingCount = restaurants.filter((r) => r.status === 'pending').length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-medium text-neutral-600 hover:text-[#E21B70]"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{lang === 'bn' ? 'মার্কেটপ্লেসে ফিরুন' : 'Back to Storefront'}</span>
        </button>

        <div className="flex flex-wrap items-center gap-2.5">
          <a
            href="/api/export/project-zip"
            download="foodora-bd-project.zip"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#E21B70] hover:bg-[#C4135E] text-white text-xs font-semibold transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{lang === 'bn' ? 'প্রোজেক্ট ZIP ডাউনলোড' : 'Download Project ZIP'}</span>
          </a>

          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#2E3138] text-white text-xs font-semibold">
            <Shield className="w-3.5 h-3.5 text-[#E21B70]" />
            <span>{lang === 'bn' ? 'হোল সিস্টেম অ্যাডমিন কন্ট্রোল' : 'Whole-System Super Admin'}</span>
          </div>
        </div>
      </div>

      {feedback && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{feedback}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            aria-label="Dismiss notification"
            className="text-emerald-700 hover:text-emerald-950"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Platform KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 tabular-nums">
        <div className="bg-white rounded-2xl border border-neutral-200 p-4">
          <p className="text-xs text-neutral-500">{lang === 'bn' ? 'মোট GMV' : 'Gross Merchandise Value'}</p>
          <p className="text-2xl font-bold text-[#2E3138] mt-1">{formatBdt(gmv, lang)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-neutral-200 p-4">
          <p className="text-xs text-neutral-500">{lang === 'bn' ? 'প্ল্যাটফর্ম কমিশন' : 'Net Commission'}</p>
          <p className="text-2xl font-bold text-[#E21B70] mt-1">{formatBdt(netCommission, lang)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-neutral-200 p-4">
          <p className="text-xs text-neutral-500">{lang === 'bn' ? 'মোট পণ্য (মেনু)' : 'Total Menu Products'}</p>
          <p className="text-2xl font-bold text-[#2E3138] mt-1">{products.length}</p>
        </div>
        <div className="bg-white rounded-2xl border border-neutral-200 p-4">
          <p className="text-xs text-neutral-500">{lang === 'bn' ? 'অনুমোদনের অপেক্ষায়' : 'Pending Approvals'}</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">{pendingCount}</p>
        </div>
        <div className="bg-white rounded-2xl border border-neutral-200 p-4">
          <p className="text-xs text-neutral-500">{lang === 'bn' ? 'সক্রিয় রাইডার' : 'Active Riders'}</p>
          <p className="text-2xl font-bold text-[#2E3138] mt-1">{riders.length}</p>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: 'overview' as const, labelBn: 'সিস্টেম কন্ট্রোল ও এক্সপোর্ট', labelEn: 'System Control & Export', icon: Sliders },
          { id: 'products' as const, labelBn: 'প্রোডাক্ট আপলোড ও এডিট', labelEn: 'Products & Catalog', icon: Package },
          { id: 'restaurants' as const, labelBn: 'রেস্টুরেন্ট ও অনুমোদন', labelEn: 'Restaurants', icon: Store },
          { id: 'orders' as const, labelBn: 'অর্ডার ও ডিসপ্যাচ', labelEn: 'Orders & Dispatch', icon: RotateCcw },
          { id: 'finance' as const, labelBn: 'কমিশন ও পেআউট', labelEn: 'Ledger & Payouts', icon: Wallet },
          { id: 'coupons' as const, labelBn: 'কুপন ম্যানেজমেন্ট', labelEn: 'Coupons', icon: Tag },
          { id: 'users' as const, labelBn: 'ইউজার ও রাইডার', labelEn: 'Users & Riders', icon: Users },
        ].map((tItem) => {
          const Icon = tItem.icon;
          return (
            <button
              key={tItem.id}
              type="button"
              onClick={() => setTab(tItem.id)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 border transition-colors ${
                tab === tItem.id
                  ? 'bg-[#E21B70] text-white border-[#E21B70]'
                  : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{lang === 'bn' ? tItem.labelBn : tItem.labelEn}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="h-44 rounded-2xl bg-white border border-neutral-200 flex items-center justify-center text-sm text-neutral-500">
          {lang === 'bn' ? 'অ্যাডমিন সিস্টেম লোড হচ্ছে...' : 'Loading Whole-System Admin Control...'}
        </div>
      ) : tab === 'overview' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Global Numeric & Brand Config */}
          <form
            onSubmit={handleSaveGlobalSettings}
            className="lg:col-span-6 bg-white rounded-2xl border border-neutral-200 p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-sm text-[#2E3138] flex items-center gap-2">
                <Settings className="w-4 h-4 text-[#E21B70]" />
                <span>
                  {lang === 'bn' ? 'গ্লোবাল প্ল্যাটফর্ম সিস্টেম সেটিংস' : 'Global Platform Parameters'}
                </span>
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="sm:col-span-2">
                <label className="block font-semibold text-neutral-700 mb-1">Platform Brand Name</label>
                <input
                  value={platformName}
                  onChange={(e) => setPlatformName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Default Commission (%)</label>
                <input
                  value={defaultCommissionPct}
                  onChange={(e) => setDefaultCommissionPct(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg tabular-nums"
                />
              </div>
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Default Delivery Fee (৳)</label>
                <input
                  type="number"
                  value={defaultDeliveryFee}
                  onChange={(e) => setDefaultDeliveryFee(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg tabular-nums"
                />
              </div>
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Platform Service Fee (৳)</label>
                <input
                  type="number"
                  value={serviceFee}
                  onChange={(e) => setServiceFee(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg tabular-nums"
                />
              </div>
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Default Minimum Order (৳)</label>
                <input
                  type="number"
                  value={minOrderDefault}
                  onChange={(e) => setMinOrderDefault(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg tabular-nums"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={savingSettings}
              className="px-5 py-2.5 rounded-xl bg-[#E21B70] hover:bg-[#C4135E] text-white text-xs font-semibold disabled:opacity-50"
            >
              {savingSettings ? 'Saving...' : lang === 'bn' ? 'সিস্টেম সেটিংস সেভ করুন' : 'Save System Settings'}
            </button>
          </form>

          {/* Payment Gateways, Couriers & Clean ZIP Export */}
          <div className="lg:col-span-6 space-y-6">
            <div className="bg-white rounded-2xl border border-neutral-200 p-5 space-y-3">
              <h2 className="font-bold text-sm text-[#2E3138] flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-[#E21B70]" />
                <span>
                  {lang === 'bn'
                    ? 'পেমেন্ট গেটওয়ে ও ডেলিভারি কুরিয়ার কন্ট্রোল'
                    : 'Payment Gateways & Pathao Courier Toggles'}
                </span>
              </h2>
              {settings && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                  {[
                    { key: 'pathaoEnabled' as const, label: 'Pathao Courier Dispatch' },
                    { key: 'pathaoSandbox' as const, label: 'Pathao Sandbox Mode' },
                    { key: 'bkashEnabled' as const, label: 'bKash Tokenized Checkout' },
                    { key: 'bkashSandbox' as const, label: 'bKash Sandbox Mode' },
                    { key: 'sslcommerzEnabled' as const, label: 'SSLCommerz Cards/MFS' },
                    { key: 'sslcommerzSandbox' as const, label: 'SSLCommerz Sandbox Mode' },
                  ].map((item) => (
                    <div
                      key={item.key}
                      className="flex items-center justify-between p-2.5 rounded-xl border border-neutral-200"
                    >
                      <span className="font-semibold text-[#2E3138]">{item.label}</span>
                      <button
                        type="button"
                        onClick={() => handleToggleSetting(item.key, !settings[item.key])}
                        className={`px-2.5 py-1 rounded-lg font-semibold ${
                          settings[item.key]
                            ? 'bg-emerald-600 text-white'
                            : 'bg-neutral-200 text-neutral-700'
                        }`}
                      >
                        {settings[item.key] ? 'ON' : 'OFF'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-[#2E3138] text-white rounded-2xl p-5 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[#FF7EB3]">
                    Portable Source Bundle
                  </p>
                  <h3 className="font-bold text-base mt-0.5">
                    {lang === 'bn'
                      ? 'সম্পূর্ণ প্রোজেক্ট ZIP ডাউনলোড ও অন্য অ্যাকাউন্টে ওপেন'
                      : 'Export Clean Project ZIP (Error-Free)'}
                  </h3>
                  <p className="text-xs text-neutral-300 mt-1">
                    Downloads full TypeScript frontend + Express backend + Drizzle schema without node_modules or secret keys.
                  </p>
                </div>
                <a
                  href="/api/export/project-zip"
                  download="foodora-bd-project.zip"
                  className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#E21B70] hover:bg-[#C4135E] text-white text-xs font-bold"
                >
                  <Download className="w-4 h-4" />
                  <span>Download ZIP</span>
                </a>
              </div>
            </div>
          </div>

          {/* System Audit Logs */}
          <div className="lg:col-span-12 bg-white rounded-2xl border border-neutral-200 p-5 overflow-x-auto">
            <h2 className="font-bold text-sm text-[#2E3138] mb-3 flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#E21B70]" />
              <span>{lang === 'bn' ? 'সিস্টেম অডিট লগ' : 'Live System Audit Trail'}</span>
            </h2>
            {auditLogs.length === 0 ? (
              <p className="text-xs text-neutral-500">No admin mutations logged yet.</p>
            ) : (
              <table className="w-full text-xs text-left tabular-nums">
                <thead>
                  <tr className="border-b border-neutral-200 text-neutral-500">
                    <th className="py-2">Action</th>
                    <th className="py-2">Target</th>
                    <th className="py-2">Actor</th>
                    <th className="py-2">Details</th>
                    <th className="py-2 text-right">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.slice(0, 15).map((log) => (
                    <tr key={log.id} className="border-b border-neutral-100">
                      <td className="py-2 font-bold uppercase text-[#E21B70]">{log.action}</td>
                      <td className="py-2 text-neutral-700">
                        {log.targetType} #{log.targetId}
                      </td>
                      <td className="py-2 text-neutral-500">{log.actorUid}</td>
                      <td className="py-2 text-neutral-600 max-w-md truncate">{log.details}</td>
                      <td className="py-2 text-right text-neutral-400">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : tab === 'products' ? (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-neutral-200 p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[260px]">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder={lang === 'bn' ? 'পণ্য বা ক্যাটাগরি খুঁজুন...' : 'Search product name or category...'}
                  className="w-full pl-9 pr-3 py-2 text-xs border border-neutral-200 rounded-xl"
                />
              </div>
              <select
                value={productRestFilter}
                onChange={(e) => setProductRestFilter(e.target.value)}
                aria-label="Filter products by restaurant"
                className="px-3 py-2 text-xs border border-neutral-200 rounded-xl bg-white"
              >
                <option value="all">{lang === 'bn' ? 'সব রেস্টুরেন্ট' : 'All Restaurants'}</option>
                {restaurants.map((r) => (
                  <option key={r.id} value={String(r.id)}>
                    {lang === 'bn' ? r.nameBn : r.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={openCreateProductModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#E21B70] hover:bg-[#C4135E] text-white text-xs font-semibold"
            >
              <Plus className="w-4 h-4" />
              <span>{lang === 'bn' ? 'নতুন পণ্য আপলোড করুন' : 'Upload / Add Product'}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredProducts.map((item) => (
              <div
                key={item.id}
                className="bg-white rounded-2xl border border-neutral-200 p-4 flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    className="w-16 h-16 rounded-xl object-cover shrink-0 bg-neutral-100"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600">
                        {item.category}
                      </span>
                      <span className="text-[10px] text-neutral-400 truncate">
                        {restaurantNameMap.get(item.restaurantId) || `Rest #${item.restaurantId}`}
                      </span>
                    </div>
                    <h3 className="font-bold text-sm text-[#2E3138] truncate mt-0.5">
                      {lang === 'bn' ? item.nameBn : item.name}
                    </h3>
                    <p className="text-xs font-bold text-[#E21B70] tabular-nums">
                      {formatBdt(item.discountPrice ?? item.price, lang)}
                      {item.discountPrice && (
                        <span className="ml-1.5 text-neutral-400 line-through font-normal">
                          {formatBdt(item.price, lang)}
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => openEditProductModal(item)}
                    aria-label={`Edit product ${item.name}`}
                    className="px-2.5 py-1.5 rounded-lg border border-neutral-200 hover:border-[#E21B70] text-xs font-semibold text-neutral-700 inline-flex items-center gap-1"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span>Edit</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickProductToggle(item, 'inStock')}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border ${
                      item.inStock
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-amber-200 bg-amber-50 text-amber-700'
                    }`}
                  >
                    {item.inStock ? 'In Stock' : 'Out'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteProduct(item)}
                    aria-label={`Delete product ${item.name}`}
                    className="p-2 rounded-lg text-neutral-400 hover:text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : tab === 'restaurants' ? (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={openCreateRestaurantModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#E21B70] hover:bg-[#C4135E] text-white text-xs font-semibold"
            >
              <Plus className="w-4 h-4" />
              <span>{lang === 'bn' ? 'নতুন রেস্টুরেন্ট যুক্ত করুন' : 'Create Restaurant'}</span>
            </button>
          </div>

          <div className="space-y-3">
            {restaurants.map((rest) => (
              <div
                key={rest.id}
                className="bg-white rounded-2xl border border-neutral-200 p-4 flex flex-wrap items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3">
                  <img
                    src={rest.coverUrl}
                    alt={rest.name}
                    className="w-14 h-14 rounded-xl object-cover bg-neutral-100 shrink-0"
                  />
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-sm text-[#2E3138]">
                        {rest.name} ({rest.nameBn})
                      </h3>
                      <span
                        className={`text-[11px] font-bold uppercase px-2 py-0.5 rounded ${
                          rest.status === 'approved'
                            ? 'bg-emerald-50 text-emerald-700'
                            : rest.status === 'pending'
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-red-50 text-red-700'
                        }`}
                      >
                        {rest.status}
                      </span>
                    </div>
                    <p className="text-xs text-neutral-500">
                      {rest.area} · {rest.cuisine} · Fee ৳{rest.deliveryFee} · Min ৳{rest.minOrder} · Mode:{' '}
                      {rest.deliveryMode}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => openEditRestaurantModal(rest)}
                    aria-label={`Edit restaurant ${rest.name}`}
                    className="px-2.5 py-1 rounded border border-neutral-200 hover:border-[#E21B70] font-semibold inline-flex items-center gap-1"
                  >
                    <Pencil className="w-3 h-3" />
                    <span>Edit</span>
                  </button>

                  <label className="inline-flex items-center gap-1 text-neutral-600">
                    <span>Comm %</span>
                    <input
                      type="text"
                      defaultValue={rest.commissionRate}
                      onBlur={(e) => {
                        if (e.target.value !== rest.commissionRate) {
                          handleUpdateRestaurant(rest.id, { commissionRate: e.target.value });
                        }
                      }}
                      className="w-14 px-2 py-1 border border-neutral-200 rounded text-center tabular-nums"
                    />
                  </label>

                  <select
                    value={rest.subscriptionPlan}
                    onChange={(e) =>
                      handleUpdateRestaurant(rest.id, {
                        subscriptionPlan: e.target.value as 'free' | 'basic' | 'premium' | 'enterprise',
                      })
                    }
                    aria-label={`Plan for ${rest.name}`}
                    className="px-2 py-1 border border-neutral-200 rounded bg-white"
                  >
                    <option value="free">Free</option>
                    <option value="basic">Basic</option>
                    <option value="premium">Premium</option>
                    <option value="enterprise">Enterprise</option>
                  </select>

                  <button
                    type="button"
                    onClick={() => handleUpdateRestaurant(rest.id, { isSponsored: !rest.isSponsored })}
                    className={`px-2.5 py-1 rounded border font-semibold ${
                      rest.isSponsored
                        ? 'border-[#E21B70] bg-[#FFF0F6] text-[#E21B70]'
                        : 'border-neutral-200 text-neutral-600'
                    }`}
                  >
                    {rest.isSponsored ? 'Sponsored' : 'Sponsor'}
                  </button>

                  {rest.status !== 'approved' ? (
                    <button
                      type="button"
                      onClick={() => handleUpdateRestaurant(rest.id, { status: 'approved' })}
                      className="px-3 py-1 rounded bg-emerald-600 text-white font-semibold"
                    >
                      {lang === 'bn' ? 'অনুমোদন দিন' : 'Approve'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleUpdateRestaurant(rest.id, { status: 'suspended' })}
                      className="px-3 py-1 rounded border border-red-200 text-red-600 font-semibold"
                    >
                      {lang === 'bn' ? 'স্থগিত করুন' : 'Suspend'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : tab === 'orders' ? (
        <div className="bg-white rounded-2xl border border-neutral-200 p-5 overflow-x-auto">
          <table className="w-full text-xs text-left tabular-nums">
            <thead>
              <tr className="border-b border-neutral-200 text-neutral-500">
                <th className="py-2">Order</th>
                <th className="py-2">Restaurant</th>
                <th className="py-2">Customer</th>
                <th className="py-2">Status Control</th>
                <th className="py-2">Assign Rider</th>
                <th className="py-2 text-right">Total</th>
                <th className="py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-b border-neutral-100">
                  <td className="py-2.5 font-mono-nums font-semibold">
                    {o.orderNumber}
                    <div className="text-[11px] text-neutral-400">
                      {o.paymentMethod.toUpperCase()} ({o.paymentStatus})
                    </div>
                  </td>
                  <td className="py-2.5">{o.restaurantName}</td>
                  <td className="py-2.5">
                    {o.customerName}
                    <div className="text-neutral-400">{o.deliveryArea}</div>
                  </td>
                  <td className="py-2.5">
                    <select
                      value={o.status}
                      aria-label={`Order status for ${o.orderNumber}`}
                      onChange={(e) =>
                        handleOrderOverride(o.id, { status: e.target.value as OrderStatus })
                      }
                      className="px-2 py-1 border border-neutral-200 rounded bg-white font-semibold text-[#2E3138]"
                    >
                      {ORDER_STATUS_OPTIONS.map((st) => (
                        <option key={st} value={st}>
                          {st.replace(/_/g, ' ')}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2.5">
                    <select
                      value={o.riderUid || ''}
                      aria-label={`Assign rider for ${o.orderNumber}`}
                      onChange={(e) =>
                        handleOrderOverride(o.id, {
                          status: o.status === 'ready' && e.target.value ? 'rider_assigned' : o.status,
                          riderUid: e.target.value || null,
                        })
                      }
                      className="px-2 py-1 border border-neutral-200 rounded bg-white"
                    >
                      <option value="">Unassigned</option>
                      {riders.map((r) => (
                        <option key={r.uid} value={r.uid}>
                          {r.fullName} ({r.zone})
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2.5 text-right font-semibold">{formatBdt(o.totalAmount, lang)}</td>
                  <td className="py-2.5 text-right">
                    {o.status !== 'cancelled' && (
                      <button
                        type="button"
                        onClick={() => handleRefundOrder(o.id)}
                        className="px-2.5 py-1 rounded border border-red-200 text-red-600 font-semibold hover:bg-red-50"
                      >
                        {lang === 'bn' ? 'রিফান্ড ও রিভার্স' : 'Cancel & Refund'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : tab === 'finance' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 bg-white rounded-2xl border border-neutral-200 p-5 overflow-x-auto">
            <h2 className="font-bold text-sm text-[#2E3138] mb-3">
              {lang === 'bn' ? 'প্ল্যাটফর্ম কমিশন লেজার' : 'Platform Commission Ledger'}
            </h2>
            <table className="w-full text-xs text-left tabular-nums">
              <thead>
                <tr className="border-b border-neutral-200 text-neutral-500">
                  <th className="py-2">Entry</th>
                  <th className="py-2">Note</th>
                  <th className="py-2 text-right">Commission</th>
                  <th className="py-2 text-right">Vendor Net</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((l) => (
                  <tr key={l.id} className="border-b border-neutral-100">
                    <td className="py-2 font-semibold uppercase">{l.entryType.replace('_', ' ')}</td>
                    <td className="py-2 text-neutral-600">{l.note}</td>
                    <td
                      className={`py-2 text-right font-bold ${
                        l.commissionAmount < 0 ? 'text-red-600' : 'text-emerald-700'
                      }`}
                    >
                      {formatBdt(l.commissionAmount, lang)}
                    </td>
                    <td className="py-2 text-right">{formatBdt(l.netRestaurantAmount, lang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="lg:col-span-5 bg-white rounded-2xl border border-neutral-200 p-5 space-y-3">
            <h2 className="font-bold text-sm text-[#2E3138]">
              {lang === 'bn' ? 'রেস্টুরেন্ট পেআউট অনুমোদন' : 'Restaurant Payout Queue'}
            </h2>
            {payouts.map((p) => (
              <div
                key={p.id}
                className="p-3 rounded-xl border border-neutral-200 flex items-center justify-between gap-2 text-xs"
              >
                <div>
                  <p className="font-bold text-[#2E3138]">{p.restaurantName}</p>
                  <p className="text-neutral-500 tabular-nums">
                    {formatBdt(p.amount, lang)} · {p.method.toUpperCase()} ({p.accountNumber})
                  </p>
                </div>
                {p.status === 'pending' ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handlePayoutDecision(p.id, 'paid')}
                      className="px-2.5 py-1 rounded bg-emerald-600 text-white font-semibold"
                    >
                      Pay
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePayoutDecision(p.id, 'rejected')}
                      className="px-2.5 py-1 rounded border border-red-200 text-red-600 font-semibold"
                    >
                      Reject
                    </button>
                  </div>
                ) : (
                  <span className="font-bold uppercase text-neutral-600">{p.status}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : tab === 'coupons' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleCreateCoupon}
            className="lg:col-span-5 bg-white rounded-2xl border border-neutral-200 p-5 space-y-3 h-fit"
          >
            <h2 className="font-bold text-sm text-[#2E3138]">
              {lang === 'bn' ? 'নতুন প্রোমো কুপন তৈরি করুন' : 'Create Marketplace Coupon'}
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <input
                required
                placeholder="Code (e.g. EID100)"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="px-3 py-2 text-sm border border-neutral-200 rounded-lg uppercase"
              />
              <select
                value={couponType}
                onChange={(e) => setCouponType(e.target.value as 'percentage' | 'fixed' | 'free_delivery')}
                className="px-3 py-2 text-sm border border-neutral-200 rounded-lg bg-white"
              >
                <option value="fixed">Fixed BDT Off</option>
                <option value="percentage">Percentage Off</option>
                <option value="free_delivery">Free Delivery</option>
              </select>
            </div>
            <input
              required
              placeholder="Campaign Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                type="number"
                placeholder="Value"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="px-3 py-2 text-sm border border-neutral-200 rounded-lg"
              />
              <input
                type="number"
                placeholder="Min Order"
                value={minOrder}
                onChange={(e) => setMinOrder(e.target.value)}
                className="px-3 py-2 text-sm border border-neutral-200 rounded-lg"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-[#E21B70] text-white text-xs font-semibold"
            >
              {lang === 'bn' ? 'কুপন প্রকাশ করুন' : 'Publish Coupon'}
            </button>
          </form>

          <div className="lg:col-span-7 bg-white rounded-2xl border border-neutral-200 p-5 space-y-2.5">
            <h3 className="font-bold text-sm text-[#2E3138]">
              Marketplace Coupons ({coupons.length})
            </h3>
            {coupons.map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-2 text-xs border-b border-neutral-100 pb-2.5"
              >
                <div>
                  <span className="font-mono-nums font-bold text-[#E21B70]">{c.code}</span> — {c.title}
                  <p className="text-[11px] text-neutral-400 tabular-nums">
                    Type: {c.type} · Value: {c.value} · Min ৳{c.minOrder}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleToggleCoupon(c)}
                    className={`px-2.5 py-1 rounded-lg font-semibold ${
                      c.isActive
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-neutral-100 text-neutral-600 border border-neutral-200'
                    }`}
                  >
                    {c.isActive ? 'Active' : 'Paused'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteCoupon(c.id)}
                    aria-label={`Delete coupon ${c.code}`}
                    className="p-1.5 rounded-lg text-neutral-400 hover:text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl border border-neutral-200 p-5 space-y-3">
            <h2 className="font-bold text-sm text-[#2E3138]">Platform Users & Roles ({users.length})</h2>
            {users.map((u) => (
              <div
                key={u.id}
                className="flex flex-wrap items-center justify-between gap-2 text-xs border-b border-neutral-100 pb-2.5"
              >
                <div>
                  <p className="font-semibold text-[#2E3138]">{u.fullName}</p>
                  <p className="text-neutral-500">{u.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={u.role}
                    aria-label={`Role for ${u.email}`}
                    onChange={(e) => handleUpdateUser(u, { role: e.target.value })}
                    className="px-2 py-1 border border-neutral-200 rounded bg-white font-semibold"
                  >
                    <option value="customer">customer</option>
                    <option value="restaurant_owner">restaurant_owner</option>
                    <option value="rider">rider</option>
                    <option value="super_admin">super_admin</option>
                  </select>
                  <button
                    type="button"
                    onClick={() =>
                      handleUpdateUser(u, { status: u.status === 'suspended' ? 'active' : 'suspended' })
                    }
                    className={`px-2.5 py-1 rounded border font-semibold ${
                      u.status === 'suspended'
                        ? 'border-emerald-200 text-emerald-700'
                        : 'border-red-200 text-red-600'
                    }`}
                  >
                    {u.status === 'suspended' ? 'Activate' : 'Suspend'}
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-2xl border border-neutral-200 p-5 space-y-3">
            <h2 className="font-bold text-sm text-[#2E3138]">Registered Riders ({riders.length})</h2>
            {riders.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 text-xs border-b border-neutral-100 pb-2.5"
              >
                <div>
                  <p className="font-semibold text-[#2E3138]">
                    {r.fullName} · {r.vehicleType}
                  </p>
                  <p className="text-neutral-500">
                    {r.zone} · {r.phone} · {r.totalDeliveries} trips ({formatBdt(r.totalEarnings, lang)})
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={r.status}
                    aria-label={`Status for rider ${r.fullName}`}
                    onChange={(e) => handleUpdateRider(r, { status: e.target.value })}
                    className="px-2 py-1 border border-neutral-200 rounded bg-white font-semibold"
                  >
                    <option value="approved">approved</option>
                    <option value="pending">pending</option>
                    <option value="suspended">suspended</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => handleUpdateRider(r, { isAvailable: !r.isAvailable })}
                    className={`px-2.5 py-1 rounded font-semibold ${
                      r.isAvailable
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-neutral-100 text-neutral-600 border border-neutral-200'
                    }`}
                  >
                    {r.isAvailable ? 'Online' : 'Offline'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upload / Edit Product Modal */}
      {productModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveProductModal}
            className="bg-white rounded-2xl border border-neutral-200 max-w-xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-[#2E3138]">
                {productModal.id
                  ? lang === 'bn'
                    ? 'পণ্য সম্পাদনা করুন'
                    : 'Edit Product'
                  : lang === 'bn'
                  ? 'নতুন পণ্য আপলোড করুন'
                  : 'Upload New Product'}
              </h3>
              <button
                type="button"
                onClick={() => setProductModal(null)}
                aria-label="Close product modal"
                className="p-1.5 rounded-lg text-neutral-500 hover:bg-neutral-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Restaurant</label>
                <select
                  value={productModal.restaurantId}
                  onChange={(e) =>
                    setProductModal({ ...productModal, restaurantId: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg bg-white"
                >
                  {restaurants.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Category</label>
                <input
                  required
                  value={productModal.category}
                  onChange={(e) => setProductModal({ ...productModal, category: e.target.value })}
                  placeholder="e.g. Biriyani, Burgers, Drinks"
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Product Name (English)</label>
                <input
                  required
                  value={productModal.name}
                  onChange={(e) => setProductModal({ ...productModal, name: e.target.value })}
                  placeholder="e.g. Royal Mutton Kacchi"
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">পণ্যের নাম (বাংলা)</label>
                <input
                  required
                  value={productModal.nameBn}
                  onChange={(e) => setProductModal({ ...productModal, nameBn: e.target.value })}
                  placeholder="যেমন: রয়েল মাটন কাচ্চি"
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Price (BDT ৳)</label>
                <input
                  required
                  type="number"
                  min="10"
                  value={productModal.price}
                  onChange={(e) => setProductModal({ ...productModal, price: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">
                  Discount Price (Optional ৳)
                </label>
                <input
                  type="number"
                  min="0"
                  placeholder="e.g. 299"
                  value={productModal.discountPrice}
                  onChange={(e) =>
                    setProductModal({ ...productModal, discountPrice: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg"
                />
              </div>
            </div>

            <div className="space-y-1.5 text-xs">
              <label className="block font-semibold text-neutral-700">
                Product Photo (File Upload or URL)
              </label>
              <div className="flex items-center gap-2">
                <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-50 hover:border-[#E21B70] font-semibold">
                  <Upload className="w-3.5 h-3.5 text-[#E21B70]" />
                  <span>{uploadingPhoto ? 'Uploading...' : 'Upload Image'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        handleUploadImage(f, (url) =>
                          setProductModal((prev) => (prev ? { ...prev, imageUrl: url } : null))
                        );
                      }
                    }}
                  />
                </label>
                <input
                  type="text"
                  value={productModal.imageUrl}
                  onChange={(e) => setProductModal({ ...productModal, imageUrl: e.target.value })}
                  placeholder="https://... or leave blank for restaurant cover"
                  className="flex-1 min-w-0 px-3 py-2 text-xs border border-neutral-200 rounded-lg"
                />
              </div>
              {productModal.imageUrl && (
                <img
                  src={productModal.imageUrl}
                  alt="Preview"
                  className="w-20 h-20 rounded-xl object-cover border border-neutral-200 mt-1"
                />
              )}
            </div>

            <div className="text-xs">
              <label className="block font-semibold text-neutral-700 mb-1">Description</label>
              <textarea
                rows={2}
                value={productModal.description}
                onChange={(e) => setProductModal({ ...productModal, description: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg"
              />
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-neutral-700">
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={productModal.inStock}
                  onChange={(e) => setProductModal({ ...productModal, inStock: e.target.checked })}
                />
                <span>In Stock</span>
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={productModal.isAvailable}
                  onChange={(e) =>
                    setProductModal({ ...productModal, isAvailable: e.target.checked })
                  }
                />
                <span>Visible on Menu</span>
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={productModal.isPopular}
                  onChange={(e) =>
                    setProductModal({ ...productModal, isPopular: e.target.checked })
                  }
                />
                <span>Popular Item</span>
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setProductModal(null)}
                className="px-4 py-2 rounded-xl border border-neutral-200 text-xs font-semibold text-neutral-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingProduct || uploadingPhoto}
                className="px-5 py-2 rounded-xl bg-[#E21B70] text-white text-xs font-semibold disabled:opacity-50"
              >
                {savingProduct
                  ? 'Saving...'
                  : productModal.id
                  ? 'Save Product Changes'
                  : 'Publish Product'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Create / Edit Restaurant Modal */}
      {restaurantModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveRestaurantModal}
            className="bg-white rounded-2xl border border-neutral-200 max-w-xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-[#2E3138]">
                {restaurantModal.id ? 'Edit Restaurant' : 'Create Approved Restaurant'}
              </h3>
              <button
                type="button"
                onClick={() => setRestaurantModal(null)}
                aria-label="Close restaurant modal"
                className="p-1.5 rounded-lg text-neutral-500 hover:bg-neutral-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Name (EN)</label>
                <input
                  required
                  value={restaurantModal.name}
                  onChange={(e) => setRestaurantModal({ ...restaurantModal, name: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Name (BN)</label>
                <input
                  required
                  value={restaurantModal.nameBn}
                  onChange={(e) =>
                    setRestaurantModal({ ...restaurantModal, nameBn: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Cuisine</label>
                <input
                  required
                  value={restaurantModal.cuisine}
                  onChange={(e) =>
                    setRestaurantModal({ ...restaurantModal, cuisine: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Dhaka Area</label>
                <select
                  value={restaurantModal.area}
                  onChange={(e) => setRestaurantModal({ ...restaurantModal, area: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg bg-white"
                >
                  {DHAKA_AREAS.map((a) => (
                    <option key={a.name} value={a.name}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block font-semibold text-neutral-700 mb-1">Address</label>
                <input
                  required
                  value={restaurantModal.address}
                  onChange={(e) =>
                    setRestaurantModal({ ...restaurantModal, address: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Delivery Fee (৳)</label>
                <input
                  type="number"
                  value={restaurantModal.deliveryFee}
                  onChange={(e) =>
                    setRestaurantModal({ ...restaurantModal, deliveryFee: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Minimum Order (৳)</label>
                <input
                  type="number"
                  value={restaurantModal.minOrder}
                  onChange={(e) =>
                    setRestaurantModal({ ...restaurantModal, minOrder: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Discount Badge (%)</label>
                <input
                  type="number"
                  value={restaurantModal.discountPct}
                  onChange={(e) =>
                    setRestaurantModal({ ...restaurantModal, discountPct: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Opening Hours</label>
                <input
                  value={restaurantModal.openingHours}
                  onChange={(e) =>
                    setRestaurantModal({ ...restaurantModal, openingHours: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg"
                />
              </div>
            </div>

            <div className="space-y-1.5 text-xs">
              <label className="block font-semibold text-neutral-700">Cover Image</label>
              <div className="flex items-center gap-2">
                <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-50 hover:border-[#E21B70] font-semibold">
                  <Upload className="w-3.5 h-3.5 text-[#E21B70]" />
                  <span>Upload Cover</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        handleUploadImage(f, (url) =>
                          setRestaurantModal((prev) => (prev ? { ...prev, coverUrl: url } : null))
                        );
                      }
                    }}
                  />
                </label>
                <input
                  type="text"
                  value={restaurantModal.coverUrl}
                  onChange={(e) =>
                    setRestaurantModal({ ...restaurantModal, coverUrl: e.target.value })
                  }
                  placeholder="https://... or /uploads/..."
                  className="flex-1 min-w-0 px-3 py-2 text-xs border border-neutral-200 rounded-lg"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRestaurantModal(null)}
                className="px-4 py-2 rounded-xl border border-neutral-200 text-xs font-semibold text-neutral-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingRestaurant || uploadingPhoto}
                className="px-5 py-2 rounded-xl bg-[#E21B70] text-white text-xs font-semibold disabled:opacity-50"
              >
                {savingRestaurant ? 'Saving...' : 'Save Restaurant'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
