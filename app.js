// ==================== تنظیمات API ====================
const SUPABASE_URL = 'https://ewzgpfpllwhhrjupqyvy.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV3emdwZnBsbHdoaHJqdXBxeXZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4NjUzMTIsImV4cCI6MjA4MDQ0MTMxMn0.Us3nf0wOfYD0_aCDc-3Y0PaxsqUKiBvW95no0SkNgiI';

// API مسیریابی (OpenRouteService)
const ORS_API_KEY = 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjgxNTkwYjU0NDBiYTQwOTg5NjcyMWFjYmUwNTM2OTE4IiwiaCI6Im11cm11cjY0In0=';

// ==================== متغیرهای جدید ====================
let routePolyline = null;
let originCoordinates = null;
let destinationCoordinates = null;
let routeDetails = null;
let destinationMarker = null;

// ==================== سیستم مسیریابی دقیق ====================

/**
 * سیستم محاسبه مسافت و قیمت دقیق
 */
class RouteCalculator {
    constructor() {
        this.baseFares = {
            'economy': {
                base: 50,
                perKm: 25,
                perMinute: 1.2,
                minFare: 80,
                multiplier: 1.0
            },
            'comfort': {
                base: 80,
                perKm: 35,
                perMinute: 1.8,
                minFare: 120,
                multiplier: 1.4
            },
            'bike': {
                base: 30,
                perKm: 15,
                perMinute: 0.6,
                minFare: 50,
                multiplier: 0.7
            }
        };
        
        this.trafficFactors = {
            'low': 1.0,
            'medium': 1.2,
            'high': 1.5,
            'peak': 1.8
        };
        
        this.timeSurcharges = {
            'night': 1.3,      // 22:00 - 05:00
            'peak_hours': 1.4, // 07:00 - 09:00, 16:00 - 18:00
            'weekend': 1.2     // جمعه‌ها
        };
    }

    /**
     * محاسبه مسیر دقیق با OpenRouteService
     */
    async calculateRoute(originLat, originLng, destLat, destLng) {
        try {
            console.log('شروع محاسبه مسیر دقیق...', { 
                origin: [originLat, originLng], 
                destination: [destLat, destLng] 
            });
            
            const vehicleType = selectedRideType === 'bike' ? 'driving-motorcycle' : 'driving-car';
            
            const response = await fetch('https://api.openrouteservice.org/v2/directions/' + vehicleType + '/geojson', {
                method: 'POST',
                headers: {
                    'Authorization': ORS_API_KEY,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    coordinates: [
                        [originLng, originLat],
                        [destLng, destLat]
                    ],
                    instructions: false,
                    units: 'km',
                    geometry: true
                })
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('خطای API:', errorText);
                throw new Error(`خطای API: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (!data.features || data.features.length === 0) {
                console.warn('مسیری یافت نشد، از محاسبه جایگزین استفاده می‌کنیم');
                return this.calculateFallbackRoute(originLat, originLng, destLat, destLng);
            }
            
            const route = data.features[0];
            const properties = route.properties;
            const geometry = route.geometry;
            
            // استخراج اطلاعات مسیر
            const distanceKm = properties.segments[0].distance / 1000; // تبدیل به کیلومتر
            const durationSeconds = properties.segments[0].duration; // زمان به ثانیه
            
            routeDetails = {
                distance: distanceKm,
                distanceMeters: properties.segments[0].distance,
                duration: Math.round(durationSeconds / 60), // تبدیل به دقیقه
                durationSeconds: durationSeconds,
                geometry: geometry,
                coordinates: geometry.coordinates,
                summary: properties.summary,
                isAccurate: true,
                timestamp: new Date().toISOString()
            };
            
            console.log('مسیر محاسبه شد:', routeDetails);
            
            return routeDetails;
            
        } catch (error) {
            console.error('خطا در محاسبه مسیر دقیق:', error);
            return this.calculateFallbackRoute(originLat, originLng, destLat, destLng);
        }
    }

    /**
     * محاسبه جایگزین در صورت خطای API
     */
    calculateFallbackRoute(originLat, originLng, destLat, destLng) {
        console.log('استفاده از محاسبه جایگزین');
        
        // محاسبه مستقیم هوایی
        const fallbackDistance = calculateDistance(originLat, originLng, destLat, destLng);
        const fallbackDuration = Math.max(2, Math.round(fallbackDistance * 3)); // فرض: 3 دقیقه به ازای هر کیلومتر
        
        routeDetails = {
            distance: fallbackDistance,
            distanceMeters: fallbackDistance * 1000,
            duration: fallbackDuration,
            durationSeconds: fallbackDuration * 60,
            geometry: null,
            coordinates: [[originLng, originLat], [destLng, destLat]],
            summary: { distance: fallbackDistance * 1000, duration: fallbackDuration * 60 },
            isAccurate: false,
            timestamp: new Date().toISOString()
        };
        
        return routeDetails;
    }

    /**
     * محاسبه قیمت دقیق بر اساس مسیر
     */
    calculatePrice(routeInfo) {
        if (!routeInfo) return 0;
        
        const fare = this.baseFares[selectedRideType] || this.baseFares.economy;
        const now = new Date();
        
        // محاسبه کرایه پایه
        let price = fare.base;
        
        // اضافه کردن کرایه مسافت
        price += routeInfo.distance * fare.perKm;
        
        // اضافه کردن کرایه زمان
        price += routeInfo.duration * fare.perMinute;
        
        // اعمال ضریب ترافیک
        const trafficFactor = this.getTrafficFactor(now);
        price *= trafficFactor;
        
        // اعمال اضافه‌بهای زمانی
        const timeSurcharge = this.getTimeSurcharge(now);
        price *= timeSurcharge;
        
        // اعمال حداقل کرایه
        price = Math.max(price, fare.minFare);
        
        // گرد کردن به نزدیکترین ۱۰ افغانی
        price = Math.ceil(price / 10) * 10;
        
        return Math.round(price);
    }

    /**
     * تعیین ضریب ترافیک
     */
    getTrafficFactor(now) {
        const hour = now.getHours();
        
        if ((hour >= 7 && hour <= 9) || (hour >= 16 && hour <= 18)) {
            return this.trafficFactors.peak;
        } else if ((hour >= 9 && hour <= 12) || (hour >= 14 && hour <= 16)) {
            return this.trafficFactors.high;
        } else if (hour >= 12 && hour <= 14) {
            return this.trafficFactors.medium;
        } else {
            return this.trafficFactors.low;
        }
    }

    /**
     * تعیین اضافه‌بهای زمانی
     */
    getTimeSurcharge(now) {
        const hour = now.getHours();
        const day = now.getDay();
        
        if (hour >= 22 || hour < 5) {
            return this.timeSurcharges.night;
        } else if (day === 5) { // جمعه
            return this.timeSurcharges.weekend;
        } else if ((hour >= 7 && hour <= 9) || (hour >= 16 && hour <= 18)) {
            return this.timeSurcharges.peak_hours;
        }
        
        return 1.0;
    }

    /**
     * دریافت توضیحات قیمت
     */
    getPriceBreakdown(price, routeInfo) {
        const fare = this.baseFares[selectedRideType] || this.baseFares.economy;
        const breakdown = {
            baseFare: fare.base,
            distanceFare: Math.round(routeInfo.distance * fare.perKm),
            timeFare: Math.round(routeInfo.duration * fare.perMinute),
            trafficFactor: this.getTrafficFactor(new Date()),
            timeSurcharge: this.getTimeSurcharge(new Date()),
            total: price
        };
        
        return breakdown;
    }
}

// ایجاد نمونه مسیریاب
const routeCalculator = new RouteCalculator();

// ==================== توابع کمکی جدید ====================

/**
 * فرمت‌دهی مسافت
 */
function formatDistance(km) {
    if (km < 1) {
        const meters = Math.round(km * 1000);
        return `${meters.toLocaleString('fa-IR')} متر`;
    }
    return `${km.toFixed(1).toLocaleString('fa-IR')} کیلومتر`;
}

/**
 * فرمت‌دهی زمان
 */
function formatDuration(minutes) {
    if (minutes < 60) {
        return `${minutes.toLocaleString('fa-IR')} دقیقه`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toLocaleString('fa-IR')} ساعت و ${mins.toLocaleString('fa-IR')} دقیقه`;
}

/**
 * فرمت‌دهی قیمت
 */
function formatPrice(price) {
    return `${price.toLocaleString('fa-IR')} افغانی`;
}

/**
 * تبدیل آدرس به مختصات
 */
async function geocodeAddress(address) {
    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address + ' کابل')}&limit=1&accept-language=fa`
        );
        
        const data = await response.json();
        
        if (data && data.length > 0) {
            return {
                lat: parseFloat(data[0].lat),
                lng: parseFloat(data[0].lon),
                address: data[0].display_name
            };
        }
    } catch (error) {
        console.error('خطا در تبدیل آدرس به مختصات:', error);
    }
    
    return null;
}

// ==================== توابع نقشه و مسیریابی ====================

/**
 * محاسبه و نمایش مسیر دقیق
 */
async function calculateAndShowRoute() {
    try {
        const pickupInput = document.getElementById('pickup');
        const destinationInput = document.getElementById('destination');
        
        if (!pickupInput || !destinationInput) {
            showNotification('لطفاً فیلدهای مبدا و مقصد را پر کنید', 'error');
            return;
        }
        
        const pickupAddress = pickupInput.value.trim();
        const destinationAddress = destinationInput.value.trim();
        
        if (!pickupAddress || !destinationAddress) {
            showNotification('لطفاً مبدا و مقصد را وارد کنید', 'error');
            return;
        }
        
        if (pickupAddress === destinationAddress) {
            showNotification('مبدا و مقصد نمی‌توانند یکسان باشند', 'error');
            return;
        }
        
        // نمایش لودینگ
        const tripCalculator = document.getElementById('tripCalculator');
        if (tripCalculator) {
            tripCalculator.innerHTML = `
                <div class="loading-overlay">
                    <div class="spinner"></div>
                    <p>در حال محاسبه مسیر دقیق...</p>
                </div>
            `;
            tripCalculator.style.display = 'block';
        }
        
        // دریافت مختصات مبدا
        if (!userMarker || !userMarker.getLatLng()) {
            showNotification('لطفاً مبدا را روی نقشه انتخاب کنید', 'error');
            return;
        }
        
        const origin = userMarker.getLatLng();
        originCoordinates = [origin.lat, origin.lng];
        
        // دریافت مختصات مقصد
        let destination;
        
        if (destinationMarker && destinationMarker.getLatLng()) {
            destination = destinationMarker.getLatLng();
        } else {
            // جستجوی آدرس مقصد
            const geocodeResult = await geocodeAddress(destinationAddress);
            if (!geocodeResult) {
                showNotification('آدرس مقصد نامعتبر است', 'error');
                return;
            }
            
            destination = { lat: geocodeResult.lat, lng: geocodeResult.lng };
            
            // اضافه کردن نشانگر مقصد
            if (destinationMarker) map.removeLayer(destinationMarker);
            
            destinationMarker = L.marker([destination.lat, destination.lng], {
                icon: L.divIcon({
                    className: 'destination-marker',
                    html: '<div class="marker-icon"><i class="fas fa-flag-checkered"></i></div>',
                    iconSize: [40, 40]
                })
            }).addTo(map)
            .bindPopup(`<b>مقصد:</b><br>${destinationAddress}`);
        }
        
        destinationCoordinates = [destination.lat, destination.lng];
        
        // محاسبه مسیر دقیق
        const routeInfo = await routeCalculator.calculateRoute(
            originCoordinates[0], originCoordinates[1],
            destinationCoordinates[0], destinationCoordinates[1]
        );
        
        if (!routeInfo) {
            throw new Error('خطا در محاسبه مسیر');
        }
        
        // ذخیره اطلاعات مسیر
        currentDistance = routeInfo.distance;
        routeDetails = routeInfo;
        
        // محاسبه قیمت دقیق
        currentPrice = routeCalculator.calculatePrice(routeInfo);
        
        // رسم مسیر روی نقشه
        drawRouteOnMap(routeInfo);
        
        // نمایش اطلاعات در UI
        updateRouteDisplay(routeInfo, currentPrice);
        
        // نمایش هشدار اگر محاسبه دقیق نباشد
        if (!routeInfo.isAccurate) {
            showNotification('مسافت تقریبی محاسبه شد. برای دقت بیشتر، آدرس دقیق وارد کنید', 'warning');
        }
        
    } catch (error) {
        console.error('خطا در محاسبه مسیر:', error);
        showNotification('خطا در محاسبه مسیر. لطفاً مجدداً تلاش کنید', 'error');
        
        // نمایش خطا در UI
        const tripCalculator = document.getElementById('tripCalculator');
        if (tripCalculator) {
            tripCalculator.innerHTML = `
                <div class="error-message" style="padding: 20px; text-align: center;">
                    <i class="fas fa-exclamation-triangle" style="color: var(--accent); font-size: 48px;"></i>
                    <p>خطا در محاسبه مسیر</p>
                    <button class="btn btn-primary" onclick="calculateAndShowRoute()">تلاش مجدد</button>
                </div>
            `;
        }
    }
}

/**
 * رسم مسیر روی نقشه
 */
function drawRouteOnMap(routeInfo) {
    // حذف مسیر قبلی
    if (routeLayer) {
        map.removeLayer(routeLayer);
        routeLayer = null;
    }
    
    if (routePolyline) {
        map.removeLayer(routePolyline);
        routePolyline = null;
    }
    
    if (!routeInfo || !routeInfo.coordinates) return;
    
    try {
        // اگر مختصات کامل موجود باشد
        if (routeInfo.geometry && routeInfo.geometry.type === 'LineString') {
            // تبدیل مختصات به فرمت Leaflet
            const latLngs = routeInfo.coordinates.map(coord => [coord[1], coord[0]]);
            
            // رسم مسیر اصلی
            routeLayer = L.polyline(latLngs, {
                color: '#3B82F6',
                weight: 5,
                opacity: 0.8,
                lineJoin: 'round',
                lineCap: 'round'
            }).addTo(map);
            
            // رسم حاشیه مسیر
            routePolyline = L.polyline(latLngs, {
                color: '#1D4ED8',
                weight: 7,
                opacity: 0.3,
                lineJoin: 'round',
                lineCap: 'round'
            }).addTo(map);
        } else {
            // رسم خط مستقیم در صورت عدم وجود مختصات دقیق
            const origin = L.latLng(originCoordinates[0], originCoordinates[1]);
            const destination = L.latLng(destinationCoordinates[0], destinationCoordinates[1]);
            
            routeLayer = L.polyline([origin, destination], {
                color: '#3B82F6',
                weight: 4,
                opacity: 0.7,
                dashArray: '10, 10'
            }).addTo(map);
        }
        
        // تنظیم نمای نقشه برای نمایش کامل مسیر
        if (routeLayer.getBounds()) {
            map.fitBounds(routeLayer.getBounds(), {
                padding: [50, 50],
                maxZoom: 16
            });
        }
        
        // اضافه کردن نشانگرهای مبدا و مقدد
        if (originCoordinates && destinationCoordinates) {
            // نشانگر مبدا
            if (userMarker) {
                userMarker.setIcon(L.divIcon({
                    className: 'pickup-marker',
                    html: '<div class="marker-icon"><i class="fas fa-map-marker-alt"></i></div>',
                    iconSize: [40, 40]
                }));
                
                userMarker.bindPopup(`
                    <b>مبدا</b><br>
                    <small>${document.getElementById('pickup').value}</small><br>
                    <small>${formatDistance(routeInfo.distance)} تا مقصد</small>
                `);
            }
            
            // نشانگر مقصد
            if (!destinationMarker) {
                destinationMarker = L.marker([destinationCoordinates[0], destinationCoordinates[1]], {
                    icon: L.divIcon({
                        className: 'destination-marker',
                        html: '<div class="marker-icon"><i class="fas fa-flag-checkered"></i></div>',
                        iconSize: [40, 40]
                    })
                }).addTo(map);
            }
            
            destinationMarker.bindPopup(`
                <b>مقصد</b><br>
                <small>${document.getElementById('destination').value}</small><br>
                <small>${formatDuration(routeInfo.duration)} تا رسیدن</small>
            `);
        }
        
    } catch (error) {
        console.error('خطا در رسم مسیر:', error);
    }
}

/**
 * بروزرسانی نمایش اطلاعات مسیر
 */
function updateRouteDisplay(routeInfo, price) {
    // بروزرسانی ماشین حساب سفر
    const tripCalculator = document.getElementById('tripCalculator');
    if (!tripCalculator) return;
    
    const fare = routeCalculator.baseFares[selectedRideType] || routeCalculator.baseFares.economy;
    const breakdown = routeCalculator.getPriceBreakdown(price, routeInfo);
    
    const now = new Date();
    const trafficFactor = routeCalculator.getTrafficFactor(now);
    const timeSurcharge = routeCalculator.getTimeSurcharge(now);
    
    tripCalculator.innerHTML = `
        <div class="trip-calculator-header">
            <h3>جزئیات سفر</h3>
            <button class="btn btn-secondary btn-sm" onclick="clearRoute()">
                <i class="fas fa-times"></i> پاک کردن
            </button>
        </div>
        
        <div class="trip-details">
            <div class="trip-detail-item">
                <span class="detail-label">مسافت:</span>
                <span class="detail-value">${formatDistance(routeInfo.distance)}</span>
            </div>
            <div class="trip-detail-item">
                <span class="detail-label">زمان تخمینی:</span>
                <span class="detail-value">${formatDuration(routeInfo.duration)}</span>
            </div>
            <div class="trip-detail-item">
                <span class="detail-label">نوع سفر:</span>
                <span class="detail-value">
                    ${selectedRideType === 'economy' ? 'اقتصادی' : 
                      selectedRideType === 'comfort' ? 'کلاسیک' : 'موتور'}
                </span>
            </div>
        </div>
        
        <div class="price-breakdown">
            <h4>جزئیات قیمت</h4>
            <div class="breakdown-item">
                <span>کرایه پایه:</span>
                <span>${formatPrice(breakdown.baseFare)}</span>
            </div>
            <div class="breakdown-item">
                <span>کرایه مسافت (${routeInfo.distance.toFixed(1)} × ${fare.perKm}):</span>
                <span>${formatPrice(breakdown.distanceFare)}</span>
            </div>
            <div class="breakdown-item">
                <span>کرایه زمان (${routeInfo.duration} × ${fare.perMinute.toFixed(1)}):</span>
                <span>${formatPrice(breakdown.timeFare)}</span>
            </div>
            ${trafficFactor > 1 ? `
            <div class="breakdown-item">
                <span>ضریب ترافیک (${trafficFactor.toFixed(1)}×):</span>
                <span>${((trafficFactor - 1) * 100).toFixed(0)}%</span>
            </div>
            ` : ''}
            ${timeSurcharge > 1 ? `
            <div class="breakdown-item">
                <span>اضافه‌بهای زمانی (${timeSurcharge.toFixed(1)}×):</span>
                <span>${((timeSurcharge - 1) * 100).toFixed(0)}%</span>
            </div>
            ` : ''}
            <div class="breakdown-total">
                <span>هزینه نهایی:</span>
                <span class="total-price">${formatPrice(price)}</span>
            </div>
        </div>
        
        ${!routeInfo.isAccurate ? `
        <div class="warning-message">
            <i class="fas fa-info-circle"></i>
            <span>مسافت به صورت تقریبی محاسبه شده است</span>
        </div>
        ` : ''}
        
        <div class="trip-actions">
            <button class="btn btn-primary btn-block" onclick="confirmRoute()">
                <i class="fas fa-check"></i> تایید مسیر و ادامه
            </button>
        </div>
    `;
    
    tripCalculator.style.display = 'block';
    
    // بروزرسانی قیمت در انتخاب نوع سفر
    const priceElement = document.getElementById(`${selectedRideType}Price`);
    if (priceElement) {
        priceElement.textContent = `${formatPrice(price)}`;
    }
}

/**
 * پاک کردن مسیر
 */
function clearRoute() {
    if (routeLayer) {
        map.removeLayer(routeLayer);
        routeLayer = null;
    }
    
    if (routePolyline) {
        map.removeLayer(routePolyline);
        routePolyline = null;
    }
    
    if (destinationMarker) {
        map.removeLayer(destinationMarker);
        destinationMarker = null;
    }
    
    // بازنشانی نشانگر مبدا
    if (userMarker) {
        userMarker.setIcon(L.divIcon({
            className: 'user-marker',
            html: '<div class="marker-icon"><i class="fas fa-user"></i></div>',
            iconSize: [40, 40]
        }));
    }
    
    const tripCalculator = document.getElementById('tripCalculator');
    if (tripCalculator) {
        tripCalculator.style.display = 'none';
    }
    
    originCoordinates = null;
    destinationCoordinates = null;
    routeDetails = null;
    currentDistance = 0;
    currentPrice = 0;
    
    showNotification('مسیر پاک شد', 'info');
}

/**
 * تایید مسیر و ادامه
 */
async function confirmRoute() {
    if (!routeDetails || !currentPrice) {
        showNotification('لطفاً ابتدا مسیر را محاسبه کنید', 'error');
        return;
    }
    
    const pickupInput = document.getElementById('pickup');
    const destinationInput = document.getElementById('destination');
    
    if (!pickupInput || !destinationInput) return;
    
    showNotification('مسیر تایید شد. در حال ثبت سفر...', 'success');
    
    // ایجاد سفر
    const trip = await createTrip(
        pickupInput.value,
        destinationInput.value,
        selectedRideType,
        currentPrice
    );
    
    if (trip) {
        // ذخیره جزئیات مسیر در سفر
        await saveRouteDetails(trip.id, routeDetails);
        
        // شروع جستجوی راننده
        startDriverSearch();
    }
}

/**
 * ذخیره جزئیات مسیر
 */
async function saveRouteDetails(tripId, routeInfo) {
    try {
        const { error } = await supabase
            .from('trip_details')
            .insert([{
                trip_id: tripId,
                distance: routeInfo.distance,
                distance_meters: routeInfo.distanceMeters,
                duration_minutes: routeInfo.duration,
                duration_seconds: routeInfo.durationSeconds,
                origin_coordinates: originCoordinates,
                destination_coordinates: destinationCoordinates,
                geometry: routeInfo.geometry,
                is_accurate: routeInfo.isAccurate,
                calculated_at: routeInfo.timestamp
            }]);
        
        if (error) throw error;
        
        console.log('جزئیات مسیر ذخیره شد');
        
    } catch (error) {
        console.error('خطا در ذخیره جزئیات مسیر:', error);
    }
}

// ==================== بروزرسانی توابع موجود ====================

/**
 * بروزرسانی تابع محاسبه و نمایش قیمت
 */
function calculateAndShowPrice(distance) {
    // این تابع قدیمی است، از تابع جدید calculateAndShowRoute استفاده می‌شود
    showNotification('برای محاسبه دقیق، دکمه "محاسبه مسیر" را بزنید', 'info');
}

/**
 * بروزرسانی reverseGeocode برای تنظیم مبدا
 */
async function reverseGeocode(lat, lng, inputElement) {
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=fa`);
        const data = await response.json();
        
        if (data.display_name) {
            inputElement.value = data.display_name;
            
            // اضافه کردن نشانگر
            if (userMarker) map.removeLayer(userMarker);
            
            userMarker = L.marker([lat, lng], {
                icon: L.divIcon({
                    className: 'pickup-marker',
                    html: '<div class="marker-icon"><i class="fas fa-map-marker-alt"></i></div>',
                    iconSize: [40, 40]
                })
            }).addTo(map)
            .bindPopup('مبدا انتخاب شده<br><small>' + data.display_name + '</small>');
            
            originCoordinates = [lat, lng];
            
            // اگر مقصد هم انتخاب شده بود، محاسبه مسیر
            const destinationInput = document.getElementById('destination');
            if (destinationInput && destinationInput.value.trim()) {
                setTimeout(() => calculateAndShowRoute(), 500);
            }
            
            showNotification('آدرس مبدا انتخاب شد', 'info');
        }
    } catch (error) {
        console.error('Error in reverse geocoding:', error);
        inputElement.value = `موقعیت جغرافیایی: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    }
}

/**
 * بروزرسانی loadPopularDestinations
 */
async function loadPopularDestinations() {
    try {
        // کد قبلی...
        
        // بروزرسانی event listener برای مقاصد
        popularDestinations.forEach(destination => {
            if (destination.latitude && destination.longitude) {
                const marker = L.marker([destination.latitude, destination.longitude], {
                    icon: L.divIcon({
                        className: 'destination-marker',
                        html: '<div class="marker-icon"><i class="fas fa-star"></i></div>',
                        iconSize: [40, 40]
                    })
                })
                .addTo(map)
                .bindPopup(`
                    <b>${destination.name}</b><br>
                    ${destination.description || ''}<br>
                    <small>${destination.visit_count || 0} بازدید</small>
                    <br>
                    <button class="action-btn btn-primary" onclick="selectDestination(${destination.latitude}, ${destination.longitude}, '${destination.name}')">
                        انتخاب به عنوان مقصد
                    </button>
                `);
            }
        });
    } catch (error) {
        // کد قبلی...
    }
}

/**
 * انتخاب مقصد از لیست
 */
async function selectDestination(lat, lng, name) {
    const destinationInput = document.getElementById('destination');
    if (destinationInput) {
        destinationInput.value = name;
        
        // حذف نشانگر مقصد قبلی
        if (destinationMarker) {
            map.removeLayer(destinationMarker);
        }
        
        // اضافه کردن نشانگر مقصد جدید
        destinationMarker = L.marker([lat, lng], {
            icon: L.divIcon({
                className: 'destination-marker',
                html: '<div class="marker-icon"><i class="fas fa-flag-checkered"></i></div>',
                iconSize: [40, 40]
            })
        }).addTo(map)
        .bindPopup('مقصد انتخاب شده<br><small>' + name + '</small>');
        
        destinationCoordinates = [lat, lng];
        
        // اگر مبدا انتخاب شده بود، محاسبه مسیر
        if (originCoordinates) {
            setTimeout(() => calculateAndShowRoute(), 500);
        }
        
        showNotification(`مقصد "${name}" انتخاب شد`, 'info');
    }
}

// ==================== بروزرسانی Event Listeners ====================

/**
 * بروزرسانی window.onload
 */
window.onload = async function() {
    // کد قبلی...
    
    // دکمه محاسبه مسیر جدید
    const calculateRouteBtn = document.createElement('button');
    calculateRouteBtn.id = 'calculateRouteBtn';
    calculateRouteBtn.className = 'btn btn-primary btn-block';
    calculateRouteBtn.innerHTML = '<i class="fas fa-route"></i> محاسبه مسیر دقیق';
    calculateRouteBtn.style.marginTop = '15px';
    
    // اضافه کردن دکمه به فرم
    const rideForm = document.getElementById('rideForm');
    if (rideForm) {
        rideForm.appendChild(calculateRouteBtn);
        
        calculateRouteBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            await calculateAndShowRoute();
        });
    }
    
    // بروزرسانی event listener برای فرم
    if (rideForm) {
        rideForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const pickupInput = document.getElementById('pickup');
            const destinationInput = document.getElementById('destination');
            
            if (!pickupInput || !destinationInput) return;
            
            const pickup = pickupInput.value.trim();
            const destination = destinationInput.value.trim();
            
            if (!pickup || !destination) {
                showNotification('لطفاً مبدا و مقصد را وارد کنید', 'error');
                return;
            }
            
            if (pickup === destination) {
                showNotification('مبدا و مقصد نمی‌توانند یکسان باشند', 'error');
                return;
            }
            
            // بررسی اینکه آیا مسیر محاسبه شده است
            if (!routeDetails || !currentPrice) {
                showNotification('لطفاً ابتدا مسیر را محاسبه کنید', 'error');
                await calculateAndShowRoute();
                return;
            }
            
            // ایجاد سفر
            const trip = await createTrip(pickup, destination, selectedRideType, currentPrice);
            
            if (trip) {
                // ذخیره جزئیات مسیر
                await saveRouteDetails(trip.id, routeDetails);
                
                // شروع جستجوی راننده
                startDriverSearch();
            }
        });
    }
    
    // بروزرسانی انتخاب نوع سفر
    document.querySelectorAll('.ride-type').forEach(type => {
        type.addEventListener('click', () => {
            document.querySelectorAll('.ride-type').forEach(t => t.classList.remove('selected'));
            type.classList.add('selected');
            selectedRideType = type.dataset.type;
            
            // اگر مسیر محاسبه شده بود، مجدداً محاسبه کن
            if (routeDetails) {
                currentPrice = routeCalculator.calculatePrice(routeDetails);
                updateRouteDisplay(routeDetails, currentPrice);
            }
        });
    });
    
    // کد قبلی...
};

// ==================== اضافه کردن CSS برای عناصر جدید ====================
const style = document.createElement('style');
style.textContent = `
    .trip-calculator-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 15px;
    }
    
    .trip-details {
        background: var(--light-gray);
        border-radius: 8px;
        padding: 15px;
        margin-bottom: 15px;
    }
    
    .trip-detail-item {
        display: flex;
        justify-content: space-between;
        margin-bottom: 8px;
        padding-bottom: 8px;
        border-bottom: 1px solid var(--border);
    }
    
    .trip-detail-item:last-child {
        margin-bottom: 0;
        padding-bottom: 0;
        border-bottom: none;
    }
    
    .detail-label {
        color: var(--gray);
    }
    
    .detail-value {
        font-weight: 500;
    }
    
    .price-breakdown {
        background: white;
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 15px;
        margin-bottom: 15px;
    }
    
    .price-breakdown h4 {
        margin: 0 0 10px 0;
        font-size: 14px;
        color: var(--gray);
    }
    
    .breakdown-item {
        display: flex;
        justify-content: space-between;
        margin-bottom: 5px;
        font-size: 13px;
    }
    
    .breakdown-total {
        display: flex;
        justify-content: space-between;
        margin-top: 10px;
        padding-top: 10px;
        border-top: 2px solid var(--border);
        font-weight: bold;
        font-size: 16px;
    }
    
    .total-price {
        color: var(--accent);
    }
    
    .warning-message {
        background: #FEF3C7;
        border: 1px solid #FBBF24;
        color: #92400E;
        padding: 10px;
        border-radius: 6px;
        margin-bottom: 15px;
        font-size: 13px;
        display: flex;
        align-items: center;
        gap: 8px;
    }
    
    .loading-overlay {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 30px;
    }
    
    .spinner {
        width: 40px;
        height: 40px;
        border: 4px solid var(--light-gray);
        border-top: 4px solid var(--accent);
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin-bottom: 15px;
    }
    
    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
    
    .error-message {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
    }
    
    .trip-actions {
        margin-top: 20px;
    }
    
    .btn-block {
        width: 100%;
    }
`;
document.head.appendChild(style);

// ==================== توابع عمومی ====================

window.calculateAndShowRoute = calculateAndShowRoute;
window.clearRoute = clearRoute;
window.selectDestination = selectDestination;
window.confirmRoute = confirmRoute;

console.log('سیستم مسیریابی دقیق اسنپ افغانستان بارگذاری شد!');