import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildVendorAnalytics,
  calculateCartItemUnitPrice,
  calculateCartSubtotal,
  calculateOrderFinancials,
  canAddToSingleRestaurantCart,
  canTransitionOrderStatus,
  convertBdtToCurrency,
  estimateDeliveryFeeAndEta,
  evaluateCoupon,
  formatBdt,
  haversineDistanceKm,
  mapOpenMeteoWeather,
} from './marketplace-logic';

test('cart unit price and subtotal include discount price, variation delta, and add-ons', () => {
  const item = {
    foodItemId: 1,
    restaurantId: 10,
    name: 'Mutton Kacchi',
    nameBn: 'মাটন কাচ্চি',
    imageUrl: '/img.jpg',
    basePrice: 450,
    discountPrice: 400,
    variationName: 'Full',
    variationDelta: 150,
    addons: [
      { name: 'Borhani', price: 60 },
      { name: 'Jali Kabab', price: 80 },
    ],
    quantity: 2,
  };

  // (400 + 150 + 60 + 80) = 690 per unit; * 2 = 1380
  assert.equal(calculateCartItemUnitPrice(item), 690);
  assert.equal(calculateCartSubtotal([item]), 1380);
});

test('single-restaurant cart constraint blocks mixing different restaurants', () => {
  assert.equal(canAddToSingleRestaurantCart([], 5), true);
  assert.equal(canAddToSingleRestaurantCart([{ restaurantId: 5 }], 5), true);
  assert.equal(canAddToSingleRestaurantCart([{ restaurantId: 5 }], 9), false);
});

test('coupon evaluation handles percentage cap, minimum order, and free delivery', () => {
  const pctCoupon = {
    code: 'FOODORA50',
    type: 'percentage' as const,
    value: 50,
    minOrder: 300,
    maxDiscount: 150,
    restaurantId: null,
    isActive: true,
    usedCount: 10,
    usageLimit: 100,
  };

  const underMin = evaluateCoupon(pctCoupon, 250, 49, 1);
  assert.equal(underMin.valid, false);
  assert.equal(underMin.discountAmount, 0);

  const validOrder = evaluateCoupon(pctCoupon, 600, 49, 1);
  assert.equal(validOrder.valid, true);
  assert.equal(validOrder.discountAmount, 150); // capped at maxDiscount 150
  assert.equal(validOrder.deliveryFeeAfterCoupon, 49);

  const freeDel = evaluateCoupon(
    { ...pctCoupon, code: 'FREEDEL', type: 'free_delivery', value: 0, minOrder: 200 },
    400,
    59,
    1
  );
  assert.equal(freeDel.valid, true);
  assert.equal(freeDel.deliveryFeeAfterCoupon, 0);
});

test('order financial commission calculation isolates food revenue from delivery and service fees', () => {
  // User prompt example: Food subtotal ৳1,000, 15% commission = ৳150, Restaurant = ৳850, Delivery = ৳60, Service = ৳10, Total = ৳1,070
  const result = calculateOrderFinancials({
    subtotal: 1000,
    discountAmount: 0,
    deliveryFee: 60,
    serviceFee: 10,
    commissionType: 'percentage',
    commissionRate: 15,
    fixedCommission: 0,
  });

  assert.equal(result.netFoodRevenue, 1000);
  assert.equal(result.platformCommission, 150);
  assert.equal(result.restaurantEarnings, 850);
  assert.equal(result.totalPayable, 1070);

  // Fixed commission mode
  const fixedResult = calculateOrderFinancials({
    subtotal: 500,
    discountAmount: 50,
    deliveryFee: 45,
    serviceFee: 10,
    commissionType: 'fixed',
    commissionRate: 15,
    fixedCommission: 60,
  });
  assert.equal(fixedResult.netFoodRevenue, 450);
  assert.equal(fixedResult.platformCommission, 60);
  assert.equal(fixedResult.restaurantEarnings, 390);
  assert.equal(fixedResult.totalPayable, 505);
});

test('order status transition state machine prevents illegal jumps', () => {
  assert.equal(canTransitionOrderStatus('confirmed', 'accepted'), true);
  assert.equal(canTransitionOrderStatus('preparing', 'ready'), true);
  assert.equal(canTransitionOrderStatus('delivered', 'cancelled'), false);
  assert.equal(canTransitionOrderStatus('cancelled', 'preparing'), false);
});

test('haversine distance and delivery fee ETA work for Dhaka coordinates', () => {
  // Gulshan 2 to Banani (~1.5 km)
  const km = haversineDistanceKm(23.7949, 90.4144, 23.7937, 90.4066);
  assert.ok(km > 0.5 && km < 2.5);
  const quote = estimateDeliveryFeeAndEta(km, 49, 'platform');
  assert.equal(quote.fee, 49);
  assert.ok(quote.etaMinutes >= 15);
  assert.equal(formatBdt(1070, 'bn'), '৳১,০৭০');
  assert.equal(formatBdt(1070, 'en'), '৳1,070');
});

test('weather mapping and BDT currency conversion behave deterministically', () => {
  const clear = mapOpenMeteoWeather(0, 0);
  assert.equal(clear.isRaining, false);
  assert.equal(clear.rainBufferMin, 0);

  const rainy = mapOpenMeteoWeather(63, 1.4);
  assert.equal(rainy.isRaining, true);
  assert.equal(rainy.rainBufferMin, 7);

  const storm = mapOpenMeteoWeather(95, 4.0);
  assert.equal(storm.isRaining, true);
  assert.equal(storm.rainBufferMin, 12);

  assert.equal(convertBdtToCurrency(1200, 0.00833), 10);
  assert.equal(convertBdtToCurrency(-10, 0.0083), 0);
});

test('vendor analytics aggregates daily/monthly order trends, revenue, and top-selling items', () => {
  const summary = buildVendorAnalytics(
    [
      {
        id: 1,
        status: 'delivered',
        subtotal: 900,
        discountAmount: 100,
        totalAmount: 859,
        restaurantEarnings: 680,
        createdAt: '2026-10-10T12:00:00Z',
        itemsSnapshotJson: [
          { foodItemId: 101, name: 'Kacchi Biryani', nameBn: 'কাচ্চি বিরিয়ানি', quantity: 2, unitPrice: 450, lineTotal: 900 },
        ],
      },
      {
        id: 2,
        status: 'preparing',
        subtotal: 500,
        discountAmount: 0,
        totalAmount: 559,
        restaurantEarnings: 425,
        createdAt: '2026-11-16T14:00:00Z',
        itemsSnapshotJson: [
          { foodItemId: 101, name: 'Kacchi Biryani', nameBn: 'কাচ্চি বিরিয়ানি', quantity: 1, unitPrice: 450, lineTotal: 450 },
          { foodItemId: 102, name: 'Borhani', nameBn: 'বোরহানি', quantity: 1, unitPrice: 50, lineTotal: 50 },
        ],
      },
      {
        id: 3,
        status: 'cancelled',
        subtotal: 700,
        discountAmount: 0,
        totalAmount: 750,
        restaurantEarnings: 595,
        createdAt: '2026-11-16T15:00:00Z',
        itemsSnapshotJson: [
          { foodItemId: 102, name: 'Borhani', nameBn: 'বোরহানি', quantity: 10, unitPrice: 70, lineTotal: 700 },
        ],
      },
    ],
    [],
    [
      { id: 101, name: 'Kacchi Biryani', nameBn: 'কাচ্চি বিরিয়ানি', category: 'Biryani' },
      { id: 102, name: 'Borhani', nameBn: 'বোরহানি', category: 'Drinks' },
    ]
  );

  assert.equal(summary.totalOrders, 2);
  assert.equal(summary.deliveredOrders, 1);
  assert.equal(summary.grossRevenue, 1300);
  assert.equal(summary.netVendorRevenue, 1105);
  assert.equal(summary.avgOrderValue, 650);
  assert.equal(summary.dailySeries.length, 2);
  assert.equal(summary.monthlySeries.length, 2);
  assert.equal(summary.topSellingItems[0].foodItemId, 101);
  assert.equal(summary.topSellingItems[0].quantitySold, 3);
  assert.equal(summary.topSellingItems[0].category, 'Biryani');
  assert.equal(summary.topSellingItems[1].quantitySold, 1);
});

