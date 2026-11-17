import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Bike, CheckCircle2, MapPin, Navigation, PackageCheck, Wallet } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { DHAKA_AREAS } from '../lib/i18n';
import { formatBdt } from '../lib/marketplace-logic';
import type { AppUser, Lang, OrderRecord, RiderRecord } from '../types/marketplace';

interface RiderDashboardProps {
  user: AppUser;
  lang: Lang;
  onRefreshUser: () => Promise<void>;
  onTrackOrder: (orderId: number) => void;
  onBack: () => void;
}

export function RiderDashboard({
  user,
  lang,
  onRefreshUser,
  onTrackOrder,
  onBack,
}: RiderDashboardProps) {
  const [rider, setRider] = useState<RiderRecord | null>(null);
  const [availableOrders, setAvailableOrders] = useState<OrderRecord[]>([]);
  const [assignedOrders, setAssignedOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Onboarding form
  const [fullName, setFullName] = useState(user.fullName);
  const [phone, setPhone] = useState('+8801811000003');
  const [email, setEmail] = useState(user.email || 'rider@foodora.bd');
  const [vehicleType, setVehicleType] = useState<'Motorbike' | 'Bicycle' | 'Scooter'>('Motorbike');
  const [zone, setZone] = useState(DHAKA_AREAS[0].name);
  const [nidNumber, setNidNumber] = useState('1995261199887');
  const [registering, setRegistering] = useState(false);

  const canAccessRiderApi =
    user.role === 'rider' || user.role === 'admin' || user.role === 'super_admin';

  const loadWorkspace = useCallback(async () => {
    if (!canAccessRiderApi) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch<{
        rider: RiderRecord | null;
        availableOrders: OrderRecord[];
        assignedOrders: OrderRecord[];
      }>('/api/rider/workspace');
      setRider(res.rider);
      setAvailableOrders(res.availableOrders);
      setAssignedOrders(res.assignedOrders);
    } catch (err) {
      console.error('Failed to load rider workspace:', err);
    } finally {
      setLoading(false);
    }
  }, [canAccessRiderApi]);

  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace]);

  const handleRegisterRider = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegistering(true);
    try {
      const res = await apiFetch<{ rider: RiderRecord }>('/api/riders/register', {
        method: 'POST',
        body: JSON.stringify({ fullName, phone, email, vehicleType, zone, nidNumber }),
      });
      setRider(res.rider);
      await onRefreshUser();
      await loadWorkspace();
    } finally {
      setRegistering(false);
    }
  };

  const handleAcceptOrder = async (orderId: number) => {
    await apiFetch(`/api/rider/orders/${orderId}/accept`, { method: 'POST' });
    await loadWorkspace();
  };

  const handleUpdateStatus = async (orderId: number, status: 'picked_up' | 'on_the_way' | 'delivered') => {
    await apiFetch(`/api/rider/orders/${orderId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    await loadWorkspace();
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-10">
        <div className="h-44 rounded-2xl bg-white border border-neutral-200 flex items-center justify-center text-sm text-neutral-500">
          {lang === 'bn' ? 'রাইডার ড্যাশবোর্ড লোড হচ্ছে...' : 'Loading Rider Workspace...'}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm font-medium text-neutral-600 hover:text-[#E21B70]"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>{lang === 'bn' ? 'মার্কেটপ্লেসে ফিরুন' : 'Back to Storefront'}</span>
      </button>

      {!rider && !canAccessRiderApi ? (
        <form
          onSubmit={handleRegisterRider}
          className="bg-white rounded-2xl border border-neutral-200 p-6 max-w-xl mx-auto space-y-4"
        >
          <div>
            <p className="text-xs font-semibold uppercase text-[#E21B70]">
              {lang === 'bn' ? 'ডেলিভারি পার্টনার নিবন্ধন' : 'Delivery Rider Onboarding'}
            </p>
            <h1 className="text-2xl font-bold text-[#2E3138] mt-1">
              {lang === 'bn' ? 'Foodora BD রাইডার হিসেবে যোগ দিন' : 'Join Foodora BD Delivery Fleet'}
            </h1>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">Full Name</label>
              <input
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">Phone</label>
              <input
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">Vehicle Type</label>
              <select
                value={vehicleType}
                onChange={(e) => setVehicleType(e.target.value as 'Motorbike' | 'Bicycle' | 'Scooter')}
                className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg bg-white"
              >
                <option value="Motorbike">Motorbike</option>
                <option value="Bicycle">Bicycle</option>
                <option value="Scooter">Scooter</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">Dhaka Zone</label>
              <select
                value={zone}
                onChange={(e) => setZone(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg bg-white"
              >
                {DHAKA_AREAS.map((a) => (
                  <option key={a.name} value={a.name}>
                    {a.name} ({a.nameBn})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1">NID Number</label>
            <input
              required
              value={nidNumber}
              onChange={(e) => setNidNumber(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg"
            />
          </div>

          <button
            type="submit"
            disabled={registering}
            className="w-full py-2.5 rounded-xl bg-[#E21B70] text-white text-xs font-semibold"
          >
            {registering
              ? lang === 'bn'
                ? 'নিবন্ধন হচ্ছে...'
                : 'Submitting...'
              : lang === 'bn'
              ? 'রাইডার অ্যাকাউন্ট সক্রিয় করুন'
              : 'Activate Rider Account'}
          </button>
        </form>
      ) : (
        <>
          <div className="bg-white rounded-2xl border border-neutral-200 p-5 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-xl bg-[#FFF0F6] text-[#E21B70] flex items-center justify-center">
                <Bike className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-[#2E3138]">
                  {rider?.fullName || user.fullName}
                </h1>
                <p className="text-xs text-neutral-500">
                  {rider?.vehicleType || 'Motorbike'} · {rider?.zone || 'Gulshan 2'} ·{' '}
                  {lang === 'bn' ? 'অনলাইন ও সক্রিয়' : 'Active & Online'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-6 tabular-nums">
              <div>
                <p className="text-xs text-neutral-500">{lang === 'bn' ? 'সম্পন্ন ডেলিভারি' : 'Deliveries'}</p>
                <p className="text-xl font-bold text-[#2E3138]">{rider?.totalDeliveries ?? 0}</p>
              </div>
              <div>
                <p className="text-xs text-neutral-500">{lang === 'bn' ? 'মোট আয়' : 'Total Earnings'}</p>
                <p className="text-xl font-bold text-[#E21B70]">
                  {formatBdt(rider?.totalEarnings ?? 0, lang)}
                </p>
              </div>
            </div>
          </div>

          {/* Available Platform Deliveries */}
          <section className="space-y-3">
            <h2 className="text-base font-bold text-[#2E3138] flex items-center gap-2">
              <Navigation className="w-4 h-4 text-[#E21B70]" />
              <span>
                {lang === 'bn' ? 'ডেলিভারির জন্য উন্মুক্ত অর্ডার' : 'Available Platform Dispatch Queue'} (
                {availableOrders.length})
              </span>
            </h2>

            {availableOrders.length === 0 ? (
              <div className="bg-white rounded-2xl border border-neutral-200 p-6 text-sm text-neutral-500">
                {lang === 'bn'
                  ? 'এই মুহূর্তে কোনো পেন্ডিং ডেলিভারি নেই।'
                  : 'No unassigned Foodora Rider orders waiting right now.'}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {availableOrders.map((ord) => (
                  <div
                    key={ord.id}
                    className="bg-white rounded-2xl border border-neutral-200 p-4 flex flex-col justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center justify-between text-xs text-neutral-500 font-mono-nums">
                        <span>{ord.orderNumber}</span>
                        <span className="font-bold text-[#E21B70]">
                          +{formatBdt(Math.max(40, ord.deliveryFee), lang)} fee
                        </span>
                      </div>
                      <h3 className="font-bold text-[#2E3138] mt-1">{ord.restaurantName}</h3>
                      <p className="text-xs text-neutral-600 mt-0.5 flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                        <span>
                          {ord.deliveryArea} — {ord.deliveryAddress}
                        </span>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAcceptOrder(ord.id)}
                      className="w-full py-2 rounded-xl bg-[#E21B70] hover:bg-[#C4135E] text-white text-xs font-semibold"
                    >
                      {lang === 'bn' ? 'ডেলিভারি গ্রহণ করুন' : 'Accept Delivery Job'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Assigned Orders */}
          <section className="space-y-3">
            <h2 className="text-base font-bold text-[#2E3138] flex items-center gap-2">
              <PackageCheck className="w-4 h-4 text-[#2E3138]" />
              <span>
                {lang === 'bn' ? 'আপনার নির্ধারিত ডেলিভারি' : 'Your Assigned Deliveries'} ({assignedOrders.length})
              </span>
            </h2>

            {assignedOrders.map((ord) => (
              <div
                key={ord.id}
                className="bg-white rounded-2xl border border-neutral-200 p-5 flex flex-wrap items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <p className="text-xs font-mono-nums text-neutral-500">
                    {ord.orderNumber} · {ord.customerName} ({ord.customerPhone})
                  </p>
                  <h3 className="font-bold text-sm text-[#2E3138]">
                    {ord.restaurantName} → {ord.deliveryArea}
                  </h3>
                  <p className="text-xs text-neutral-600">{ord.deliveryAddress}</p>
                  <p className="text-xs font-semibold text-[#E21B70] uppercase">
                    Status: {ord.status.replace(/_/g, ' ')} ·{' '}
                    {ord.paymentMethod === 'cod'
                      ? `Collect Cash: ${formatBdt(ord.totalAmount, lang)}`
                      : `Prepaid (${ord.paymentMethod.toUpperCase()})`}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onTrackOrder(ord.id)}
                    className="px-3 py-1.5 rounded-lg border border-neutral-200 text-xs font-semibold"
                  >
                    {lang === 'bn' ? 'ম্যাপ দেখুন' : 'Route Map'}
                  </button>
                  {ord.status === 'rider_assigned' && (
                    <button
                      type="button"
                      onClick={() => handleUpdateStatus(ord.id, 'picked_up')}
                      className="px-3.5 py-1.5 rounded-lg bg-[#2E3138] text-white text-xs font-semibold"
                    >
                      {lang === 'bn' ? 'পিকআপ সম্পন্ন' : 'Picked Up'}
                    </button>
                  )}
                  {ord.status === 'picked_up' && (
                    <button
                      type="button"
                      onClick={() => handleUpdateStatus(ord.id, 'on_the_way')}
                      className="px-3.5 py-1.5 rounded-lg bg-[#E21B70] text-white text-xs font-semibold"
                    >
                      {lang === 'bn' ? 'পথে রয়েছি' : 'On The Way'}
                    </button>
                  )}
                  {(ord.status === 'on_the_way' || ord.status === 'picked_up' || ord.status === 'rider_assigned') && (
                    <button
                      type="button"
                      onClick={() => handleUpdateStatus(ord.id, 'delivered')}
                      className="px-3.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold inline-flex items-center gap-1"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{lang === 'bn' ? 'ডেলিভারি সম্পন্ন' : 'Mark Delivered'}</span>
                    </button>
                  )}
                  {ord.status === 'delivered' && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                      <Wallet className="w-3.5 h-3.5" />
                      {lang === 'bn' ? 'সম্পন্ন' : 'Completed'}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
