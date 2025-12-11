// ==================== تنظیمات API ====================
const SUPABASE_URL = 'https://ewzgpfpllwhhrjupqyvy.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV3emdwZnBsbHdoaHJqdXBxeXZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4NjUzMTIsImV4cCI6MjA4MDQ0MTMxMn0.Us3nf0wOfYD0_aCDc-3Y0PaxsqUKiBvW95no0SkNgiI';
const ORS_API_KEY = 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjgxNTkwYjU0NDBiYTQwOTg5NjcyMWFjYmUwNTM2OTE4IiwiaCI6Im11cm11cjY0In0=';

// ==================== مقداردهی اولیه ====================
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// متغیرهای سیستمی اصلی
let currentUser = null;
let isAdmin = false;
let selectedRideType = 'economy';
let selectedPaymentMethod = 'cash';
let currentDistance = 0;
let currentPrice = 0;
let currentTripId = null;
let currentDriver = null;
let map = null;
let userMarker = null;
let driverMarkers = [];
let routeLayer = null;
let trackingInterval = null;
let districts = [];
let popularDestinations = [];
let activeDrivers = [];

// متغیرهای سیستم مسیریابی
let destinationMarker = null;
let originCoordinates = null;
let destinationCoordinates = null;
let routeDetails = null;
let routePolyline = null;
let isCalculatingRoute = false;
let routeCalculator = null;

// متغیرهای انتخاب مبدا/مقصد از روی نقشه
let isSelectingPickup = false;
let isSelectingDestination = false;
let selectionMarker = null;

// متغیرهای مدیریت حالت
let isLoading = false;
let isMapInitialized = false;

// ==================== کلاس سیستم مسیریابی ====================
class RouteCalculator {
    constructor() {
        this.baseFares = {
            'economy': {
                base: 50,
                perKm: 25,
                perMinute: 1.2,
                minFare: 80,
                multiplier: 1.0,
                name: 'اقتصادی'
            },
            'comfort': {
                base: 80,
                perKm: 35,
                perMinute: 1.8,
                minFare: 120,
                multiplier: 1.4,
                name: 'کلاسیک'
            },
            'bike': {
                base: 30,
                perKm: 15,
                perMinute: 0.6,
                minFare: 50,
                multiplier: 0.7,
                name: 'موتور'
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

    async calculateRoute(originLat, originLng, destLat, destLng) {
        try {
            if (isCalculatingRoute) {
                throw new Error('در حال محاسبه مسیر دیگر');
            }
            
            isCalculatingRoute = true;
            showLoading('در حال محاسبه دقیق‌ترین مسیر...');
            
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
                    geometry: true,
                    optimize: true
                }),
                signal: AbortSignal.timeout(10000) // تایم‌اوت 10 ثانیه
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('خطای API:', errorText);
                return this.calculateFallbackRoute(originLat, originLng, destLat, destLng);
            }
            
            const data = await response.json();
            
            if (!data.features || data.features.length === 0) {
                return this.calculateFallbackRoute(originLat, originLng, destLat, destLng);
            }
            
            const route = data.features[0];
            const properties = route.properties;
            const geometry = route.geometry;
            
            const distanceKm = properties.segments[0].distance / 1000;
            const durationSeconds = properties.segments[0].duration;
            
            routeDetails = {
                distance: distanceKm,
                distanceMeters: properties.segments[0].distance,
                duration: Math.round(durationSeconds / 60),
                durationSeconds: durationSeconds,
                geometry: geometry,
                coordinates: geometry.coordinates,
                summary: properties.summary,
                isAccurate: true,
                timestamp: new Date().toISOString()
            };
            
            hideLoading();
            isCalculatingRoute = false;
            return routeDetails;
            
        } catch (error) {
            console.error('خطا در محاسبه مسیر دقیق:', error);
            hideLoading();
            isCalculatingRoute = false;
            return this.calculateFallbackRoute(originLat, originLng, destLat, destLng);
        }
    }

    calculateFallbackRoute(originLat, originLng, destLat, destLng) {
        const fallbackDistance = calculateDistance(originLat, originLng, destLat, destLng);
        const fallbackDuration = Math.max(2, Math.round(fallbackDistance * 3));
        
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

    calculatePrice(routeInfo) {
        if (!routeInfo) return 0;
        
        const fare = this.baseFares[selectedRideType] || this.baseFares.economy;
        const now = new Date();
        
        let price = fare.base;
        price += routeInfo.distance * fare.perKm;
        price += routeInfo.duration * fare.perMinute;
        
        const trafficFactor = this.getTrafficFactor(now);
        price *= trafficFactor;
        
        const timeSurcharge = this.getTimeSurcharge(now);
        price *= timeSurcharge;
        
        price = Math.max(price, fare.minFare);
        price = Math.ceil(price / 10) * 10;
        
        return Math.round(price);
    }

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

    getPriceBreakdown(price, routeInfo) {
        const fare = this.baseFares[selectedRideType] || this.baseFares.economy;
        const now = new Date();
        
        return {
            baseFare: fare.base,
            distanceFare: Math.round(routeInfo.distance * fare.perKm),
            timeFare: Math.round(routeInfo.duration * fare.perMinute),
            trafficFactor: this.getTrafficFactor(now),
            timeSurcharge: this.getTimeSurcharge(now),
            total: price,
            rideType: fare.name
        };
    }
}

// ==================== توابع کمکی عمومی ====================
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function throttle(func, limit) {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

function formatDistance(km) {
    if (km < 1) {
        const meters = Math.round(km * 1000);
        return `${meters.toLocaleString('fa-IR')} متر`;
    }
    return `${km.toFixed(1).toLocaleString('fa-IR')} کیلومتر`;
}

function formatDuration(minutes) {
    if (minutes < 60) {
        return `${minutes.toLocaleString('fa-IR')} دقیقه`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toLocaleString('fa-IR')} ساعت و ${mins.toLocaleString('fa-IR')} دقیقه`;
}

function formatPrice(price) {
    return `${price.toLocaleString('fa-IR')} افغانی`;
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

function toRad(value) {
    return value * Math.PI / 180;
}

function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    if (notification) {
        notification.textContent = message;
        notification.className = `notification ${type}`;
        notification.style.display = 'block';
        
        // پاک کردن نوتیفیکیشن قبلی
        const existingNotifications = document.querySelectorAll('.notification:not(:first-child)');
        existingNotifications.forEach(n => n.remove());
        
        setTimeout(() => {
            notification.style.display = 'none';
        }, 5000);
    } else {
        // اگر المنت نوتیفیکیشن وجود ندارد، یکی بساز
        createNotificationElement(message, type);
    }
}

function createNotificationElement(message, type) {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 30px;
        right: 30px;
        padding: 18px 24px;
        background: var(--gradient-dark);
        color: white;
        border-radius: 16px;
        box-shadow: 0 15px 40px rgba(0, 0, 0, 0.2);
        z-index: 3000;
        max-width: 350px;
        font-size: 0.9375rem;
        animation: slideInRight 0.3s ease;
        border: 1px solid rgba(255, 255, 255, 0.1);
        backdrop-filter: blur(10px);
    `;
    
    if (type === 'success') {
        notification.style.background = 'var(--gradient-success)';
    } else if (type === 'error') {
        notification.style.background = 'var(--gradient-danger)';
    } else if (type === 'warning') {
        notification.style.background = 'var(--gradient-warning)';
    } else if (type === 'info') {
        notification.style.background = 'var(--gradient-info)';
    }
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 5000);
}

function showLoading(message = 'در حال بارگذاری...') {
    hideLoading(); // پاک کردن لودینگ قبلی
    
    const loadingOverlay = document.createElement('div');
    loadingOverlay.id = 'loadingOverlay';
    loadingOverlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(10px);
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        z-index: 9999;
        color: white;
    `;
    
    loadingOverlay.innerHTML = `
        <div class="spinner" style="width: 60px; height: 60px; border: 5px solid rgba(255,255,255,0.3); border-top: 5px solid white; border-radius: 50%; animation: spin 1s linear infinite;"></div>
        <p style="margin-top: 20px; font-size: 16px;">${message}</p>
    `;
    
    document.body.appendChild(loadingOverlay);
    document.body.style.overflow = 'hidden';
}

function hideLoading() {
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) {
        loadingOverlay.style.animation = 'fadeOut 0.3s ease';
        setTimeout(() => {
            if (loadingOverlay.parentNode) {
                loadingOverlay.parentNode.removeChild(loadingOverlay);
            }
        }, 300);
    }
    document.body.style.overflow = '';
}

function clearErrors() {
    document.querySelectorAll('.error-message').forEach(el => {
        el.style.display = 'none';
    });
    document.querySelectorAll('.form-input').forEach(el => {
        el.style.borderColor = 'var(--border)';
    });
}

function showError(inputId, message) {
    const errorElement = document.getElementById(inputId + 'Error');
    const inputElement = document.getElementById(inputId);
    
    if (errorElement && inputElement) {
        errorElement.textContent = message;
        errorElement.style.display = 'block';
        inputElement.style.borderColor = 'var(--accent)';
    }
}

// ==================== مدیریت نقشه ====================
async function initMap() {
    if (isMapInitialized || isLoading) return;
    
    try {
        isLoading = true;
        showLoading('در حال بارگذاری نقشه...');
        
        const mapElement = document.getElementById('map');
        if (!mapElement) {
            throw new Error('عنصر نقشه یافت نشد');
        }
        
        // پاک‌سازی نقشه قبلی
        if (map) {
            map.remove();
            map = null;
        }
        
        // تنظیم موقعیت اولیه (کابل)
        const kabulPosition = [34.5553, 69.2075];
        
        // ایجاد نقشه
        map = L.map('map', {
            preferCanvas: true,
            zoomControl: false,
            attributionControl: false,
            zoomSnap: 0.5,
            zoomDelta: 0.5,
            wheelPxPerZoomLevel: 60
        }).setView(kabulPosition, 12);
        
        // اضافه کردن tile layer
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19,
            minZoom: 10,
            detectRetina: true,
            crossOrigin: true
        }).addTo(map);
        
        // اضافه کردن کنترل‌های نقشه
        L.control.zoom({
            position: 'topright'
        }).addTo(map);
        
        L.control.scale({
            position: 'bottomleft',
            metric: true,
            imperial: false
        }).addTo(map);
        
        // اضافه کردن دکمه موقعیت‌یابی
        L.control.locate({
            position: 'topright',
            strings: {
                title: "نمایش موقعیت من"
            },
            locateOptions: {
                maxZoom: 16,
                enableHighAccuracy: true,
                timeout: 10000
            }
        }).addTo(map);
        
        // اضافه کردن دکمه انتخاب از نقشه
        addMapSelectionControl();
        
        // بارگذاری موقعیت کاربر
        await loadUserLocation();
        
        // بارگذاری داده‌های اضافی
        setTimeout(() => {
            loadDistricts();
            loadPopularDestinations();
            loadActiveDrivers();
        }, 1000);
        
        // تنظیم event listeners برای نقشه
        setupMapEvents();
        
        isMapInitialized = true;
        hideLoading();
        showNotification('نقشه با موفقیت بارگذاری شد', 'success');
        
        console.log('Map initialized successfully');
        
    } catch (error) {
        console.error('خطا در بارگذاری نقشه:', error);
        hideLoading();
        showNotification('خطا در بارگذاری نقشه. لطفاً صفحه را رفرش کنید', 'error');
        
        // تلاش مجدد بعد از 5 ثانیه
        setTimeout(() => {
            if (!isMapInitialized) {
                initMap();
            }
        }, 5000);
    } finally {
        isLoading = false;
    }
}

function addMapSelectionControl() {
    if (!map) return;
    
    const MapSelectionControl = L.Control.extend({
        options: {
            position: 'topright'
        },
        
        onAdd: function(map) {
            const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
            container.style.cssText = `
                margin: 10px;
                border-radius: 10px;
                overflow: hidden;
                box-shadow: 0 4px 15px rgba(0,0,0,0.1);
            `;
            
            const button = L.DomUtil.create('a', 'leaflet-control-button', container);
            button.innerHTML = '<i class="fas fa-map-marker-alt"></i>';
            button.title = 'انتخاب مبدا و مقصد از نقشه';
            button.style.cssText = `
                display: block;
                width: 40px;
                height: 40px;
                line-height: 40px;
                text-align: center;
                background: white;
                font-size: 18px;
                color: var(--primary);
                cursor: pointer;
                transition: all 0.3s;
            `;
            
            button.onmouseover = function() {
                this.style.background = 'var(--primary)';
                this.style.color = 'white';
            };
            
            button.onmouseout = function() {
                this.style.background = 'white';
                this.style.color = 'var(--primary)';
            };
            
            L.DomEvent.on(button, 'click', function(e) {
                L.DomEvent.stopPropagation(e);
                L.DomEvent.preventDefault(e);
                openMapSelectionPanel();
            });
            
            return container;
        }
    });
    
    map.addControl(new MapSelectionControl());
}

function setupMapEvents() {
    if (!map) return;
    
    // رویداد resize برای تنظیم مجدد اندازه نقشه
    window.addEventListener('resize', debounce(() => {
        if (map) {
            map.invalidateSize();
        }
    }, 250));
    
    // رویداد click روی نقشه
    map.on('click', function(e) {
        // اگر در حالت انتخاب هستیم، این رویداد توسط handleMapClickForSelection مدیریت می‌شود
        if (!isSelectingPickup && !isSelectingDestination) {
            // می‌توانید اینجا عملکردهای دیگر اضافه کنید
        }
    });
}

async function loadUserLocation() {
    return new Promise((resolve) => {
        if (!navigator.geolocation) {
            showNotification('مرورگر شما از موقعیت‌یابی پشتیبانی نمی‌کند', 'warning');
            resolve();
            return;
        }
        
        const geoOptions = {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 60000
        };
        
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const userLat = position.coords.latitude;
                const userLng = position.coords.longitude;
                
                // حذف نشانگر قبلی
                if (userMarker) {
                    map.removeLayer(userMarker);
                }
                
                // ایجاد نشانگر کاربر
                userMarker = L.marker([userLat, userLng], {
                    icon: L.divIcon({
                        className: 'user-marker',
                        html: '<div class="marker-icon"><i class="fas fa-user"></i></div>',
                        iconSize: [40, 40],
                        popupAnchor: [0, -20]
                    }),
                    title: 'موقعیت شما'
                }).addTo(map)
                .bindPopup('موقعیت شما<br><small>برای انتخاب مبدا، روی نقشه کلیک کنید</small>')
                .openPopup();
                
                // حرکت به موقعیت کاربر
                map.setView([userLat, userLng], 14);
                
                // ذخیره مختصات مبدا
                originCoordinates = [userLat, userLng];
                
                // جستجوی معکوس آدرس
                reverseGeocode(userLat, userLng, document.getElementById('pickup'));
                
                resolve();
            },
            (error) => {
                console.warn('خطای موقعیت‌یابی:', error);
                
                let message = 'خطا در دریافت موقعیت';
                switch(error.code) {
                    case error.PERMISSION_DENIED:
                        message = 'دسترسی به موقعیت مکانی رد شد';
                        break;
                    case error.POSITION_UNAVAILABLE:
                        message = 'اطلاعات موقعیت در دسترس نیست';
                        break;
                    case error.TIMEOUT:
                        message = 'دریافت موقعیت زمان‌بر شد';
                        break;
                }
                
                showNotification(message, 'warning');
                resolve();
            },
            geoOptions
        );
    });
}

// ==================== پنل انتخاب مبدا و مقصد از نقشه ====================
function createMapSelectionPanel() {
    // حذف پنل قبلی اگر وجود دارد
    const existingPanel = document.getElementById('mapSelectionPanel');
    if (existingPanel) existingPanel.remove();
    
    const panelHTML = `
        <div class="map-selection-panel" id="mapSelectionPanel">
            <div class="panel-header">
                <h4><i class="fas fa-map-marker-alt"></i> انتخاب از روی نقشه</h4>
                <button class="btn btn-sm btn-outline-secondary" onclick="closeMapSelectionPanel()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            
            <div class="panel-body">
                <div class="selection-modes">
                    <div class="mode-buttons">
                        <button class="btn btn-outline-primary btn-block" id="selectPickupBtn" onclick="startPickupSelection()">
                            <i class="fas fa-map-pin"></i> انتخاب مبدا از نقشه
                        </button>
                        
                        <button class="btn btn-outline-danger btn-block" id="selectDestinationBtn" onclick="startDestinationSelection()">
                            <i class="fas fa-flag-checkered"></i> انتخاب مقصد از نقشه
                        </button>
                    </div>
                    
                    <div class="current-selections">
                        <div class="selection-item" id="currentPickupDisplay">
                            <div class="selection-label">
                                <i class="fas fa-map-pin text-primary"></i>
                                <span>مبدا:</span>
                            </div>
                            <div class="selection-value" id="pickupValue">
                                ${originCoordinates ? 'انتخاب شده' : 'انتخاب نشده'}
                            </div>
                        </div>
                        
                        <div class="selection-item" id="currentDestinationDisplay">
                            <div class="selection-label">
                                <i class="fas fa-flag-checkered text-danger"></i>
                                <span>مقصد:</span>
                            </div>
                            <div class="selection-value" id="destinationValue">
                                ${destinationCoordinates ? 'انتخاب شده' : 'انتخاب نشده'}
                            </div>
                        </div>
                    </div>
                    
                    <div class="selection-actions" id="selectionActions">
                        <button class="btn btn-primary btn-block" onclick="useMapSelection()" ${!originCoordinates || !destinationCoordinates ? 'disabled' : ''} id="useSelectionBtn">
                            <i class="fas fa-check"></i> استفاده از این آدرس‌ها
                        </button>
                        <button class="btn btn-outline-secondary btn-block" onclick="clearMapSelections()">
                            <i class="fas fa-trash"></i> پاک کردن انتخاب‌ها
                        </button>
                    </div>
                </div>
                
                <div class="selection-instructions" id="selectionInstructions">
                    <div class="instruction-content">
                        <i class="fas fa-info-circle"></i>
                        <p>لطفاً ابتدا یکی از گزینه‌های بالا را انتخاب کنید، سپس روی نقشه کلیک نمایید.</p>
                    </div>
                </div>
                
                <div class="active-selection" id="activeSelectionInfo" style="display: none;">
                    <div class="active-selection-content">
                        <i class="fas fa-hand-pointer"></i>
                        <p>حالت انتخاب فعال است. روی نقشه کلیک کنید...</p>
                        <button class="btn btn-sm btn-outline-secondary" onclick="cancelSelection()">
                            لغو انتخاب
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', panelHTML);
    
    // بروزرسانی مقادیر اگر قبلاً انتخاب شده باشند
    updateSelectionDisplay();
}

function updateSelectionDisplay() {
    const pickupValue = document.getElementById('pickupValue');
    const destinationValue = document.getElementById('destinationValue');
    const useBtn = document.getElementById('useSelectionBtn');
    
    if (pickupValue) {
        if (originCoordinates) {
            const pickupInput = document.getElementById('pickup');
            pickupValue.textContent = pickupInput ? pickupInput.value.substring(0, 50) + '...' : 'انتخاب شده';
            document.getElementById('currentPickupDisplay').classList.add('pickup-selected');
        }
    }
    
    if (destinationValue) {
        if (destinationCoordinates) {
            const destinationInput = document.getElementById('destination');
            destinationValue.textContent = destinationInput ? destinationInput.value.substring(0, 50) + '...' : 'انتخاب شده';
            document.getElementById('currentDestinationDisplay').classList.add('destination-selected');
        }
    }
    
    if (useBtn) {
        useBtn.disabled = !(originCoordinates && destinationCoordinates);
    }
}

function openMapSelectionPanel() {
    createMapSelectionPanel();
    showNotification('پنل انتخاب از روی نقشه باز شد', 'info');
}

function closeMapSelectionPanel() {
    const panel = document.getElementById('mapSelectionPanel');
    if (panel) {
        panel.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => {
            panel.remove();
        }, 300);
    }
    
    if (selectionMarker) {
        map.removeLayer(selectionMarker);
        selectionMarker = null;
    }
    
    isSelectingPickup = false;
    isSelectingDestination = false;
    
    // حذف event listener از نقشه
    if (map) {
        map.off('click', handleMapClickForSelection);
    }
}

function startPickupSelection() {
    isSelectingPickup = true;
    isSelectingDestination = false;
    
    // بروزرسانی UI
    updateSelectionUI();
    
    // اضافه کردن رویداد کلیک به نقشه
    if (map) {
        map.on('click', handleMapClickForSelection);
    }
    
    showNotification('حالا روی نقشه کلیک کنید تا مبدا را انتخاب نمایید', 'info');
}

function startDestinationSelection() {
    isSelectingPickup = false;
    isSelectingDestination = true;
    
    // بروزرسانی UI
    updateSelectionUI();
    
    // اضافه کردن رویداد کلیک به نقشه
    if (map) {
        map.on('click', handleMapClickForSelection);
    }
    
    showNotification('حالا روی نقشه کلیک کنید تا مقصد را انتخاب نمایید', 'info');
}

async function handleMapClickForSelection(e) {
    const lat = e.latlng.lat;
    const lng = e.latlng.lng;
    
    // حذف نشانگر قبلی
    if (selectionMarker) {
        map.removeLayer(selectionMarker);
    }
    
    try {
        if (isSelectingPickup) {
            // ایجاد نشانگر مبدا
            selectionMarker = L.marker([lat, lng], {
                icon: L.divIcon({
                    className: 'selection-marker',
                    html: '<div class="marker-icon pickup-marker-icon"><i class="fas fa-map-pin"></i></div>',
                    iconSize: [40, 40],
                    popupAnchor: [0, -20]
                })
            }).addTo(map);
            
            // جستجوی معکوس آدرس
            const address = await reverseGeocodeForSelection(lat, lng);
            
            // ذخیره مختصات
            originCoordinates = [lat, lng];
            
            // بروزرسانی input
            const pickupInput = document.getElementById('pickup');
            if (pickupInput) {
                pickupInput.value = address || `موقعیت: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
            }
            
            showNotification('مبدا با موفقیت انتخاب شد', 'success');
            
        } else if (isSelectingDestination) {
            // ایجاد نشانگر مقصد
            selectionMarker = L.marker([lat, lng], {
                icon: L.divIcon({
                    className: 'selection-marker',
                    html: '<div class="marker-icon destination-marker-icon"><i class="fas fa-flag-checkered"></i></div>',
                    iconSize: [40, 40],
                    popupAnchor: [0, -20]
                })
            }).addTo(map);
            
            // جستجوی معکوس آدرس
            const address = await reverseGeocodeForSelection(lat, lng);
            
            // ذخیره مختصات
            destinationCoordinates = [lat, lng];
            
            // بروزرسانی input
            const destinationInput = document.getElementById('destination');
            if (destinationInput) {
                destinationInput.value = address || `موقعیت: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
            }
            
            showNotification('مقصد با موفقیت انتخاب شد', 'success');
        }
        
        // بازنشانی حالت انتخاب
        resetSelectionMode();
        
        // بروزرسانی نمایش پنل
        updateSelectionDisplay();
        
        // فعال کردن دکمه استفاده اگر هر دو انتخاب شده باشند
        const useBtn = document.getElementById('useSelectionBtn');
        if (useBtn && originCoordinates && destinationCoordinates) {
            useBtn.disabled = false;
        }
        
    } catch (error) {
        console.error('خطا در انتخاب موقعیت:', error);
        showNotification('خطا در انتخاب موقعیت', 'error');
    }
}

async function reverseGeocodeForSelection(lat, lng) {
    try {
        const cacheKey = `geocode_${lat.toFixed(4)}_${lng.toFixed(4)}`;
        const cached = localStorage.getItem(cacheKey);
        
        if (cached) {
            return JSON.parse(cached);
        }
        
        const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=fa&zoom=18`,
            {
                headers: {
                    'User-Agent': 'SnapAfghanistan/1.0'
                }
            }
        );
        
        if (!response.ok) {
            throw new Error('خطا در دریافت آدرس');
        }
        
        const data = await response.json();
        
        if (data.display_name) {
            localStorage.setItem(cacheKey, JSON.stringify(data.display_name));
            return data.display_name;
        }
        
        return null;
    } catch (error) {
        console.error('خطا در جستجوی آدرس:', error);
        return null;
    }
}

function resetSelectionMode() {
    isSelectingPickup = false;
    isSelectingDestination = false;
    
    // حذف event listener از نقشه
    if (map) {
        map.off('click', handleMapClickForSelection);
    }
    
    // بروزرسانی UI
    updateSelectionUI();
    
    // پنهان کردن دستورالعمل فعال
    const activeInfo = document.getElementById('activeSelectionInfo');
    const instructions = document.getElementById('selectionInstructions');
    
    if (activeInfo) activeInfo.style.display = 'none';
    if (instructions) instructions.style.display = 'block';
}

function updateSelectionUI() {
    const pickupBtn = document.getElementById('selectPickupBtn');
    const destinationBtn = document.getElementById('selectDestinationBtn');
    const activeInfo = document.getElementById('activeSelectionInfo');
    const instructions = document.getElementById('selectionInstructions');
    
    if (isSelectingPickup) {
        if (pickupBtn) {
            pickupBtn.classList.add('btn-selecting');
            pickupBtn.innerHTML = '<i class="fas fa-map-pin"></i> در حال انتخاب مبدا...';
            pickupBtn.disabled = true;
        }
        if (destinationBtn) destinationBtn.disabled = true;
        if (activeInfo) activeInfo.style.display = 'block';
        if (instructions) instructions.style.display = 'none';
        
    } else if (isSelectingDestination) {
        if (destinationBtn) {
            destinationBtn.classList.add('btn-selecting');
            destinationBtn.innerHTML = '<i class="fas fa-flag-checkered"></i> در حال انتخاب مقصد...';
            destinationBtn.disabled = true;
        }
        if (pickupBtn) pickupBtn.disabled = true;
        if (activeInfo) activeInfo.style.display = 'block';
        if (instructions) instructions.style.display = 'none';
        
    } else {
        // بازنشانی دکمه‌ها
        if (pickupBtn) {
            pickupBtn.classList.remove('btn-selecting');
            pickupBtn.innerHTML = '<i class="fas fa-map-pin"></i> انتخاب مبدا از نقشه';
            pickupBtn.disabled = false;
        }
        if (destinationBtn) {
            destinationBtn.classList.remove('btn-selecting');
            destinationBtn.innerHTML = '<i class="fas fa-flag-checkered"></i> انتخاب مقصد از نقشه';
            destinationBtn.disabled = false;
        }
    }
}

function useMapSelection() {
    if (!originCoordinates || !destinationCoordinates) {
        showNotification('لطفاً مبدا و مقصد را انتخاب کنید', 'error');
        return;
    }
    
    // بستن پنل انتخاب
    closeMapSelectionPanel();
    
    // محاسبه مسیر
    calculateAndShowRoute();
    
    showNotification('آدرس‌های انتخاب شده اعمال شدند', 'success');
}

function clearMapSelections() {
    // حذف نشانگرها
    if (selectionMarker) {
        map.removeLayer(selectionMarker);
        selectionMarker = null;
    }
    
    // بازنشانی مختصات
    originCoordinates = null;
    destinationCoordinates = null;
    
    // بازنشانی inputها
    const pickupInput = document.getElementById('pickup');
    const destinationInput = document.getElementById('destination');
    
    if (pickupInput) pickupInput.value = '';
    if (destinationInput) destinationInput.value = '';
    
    // پاک کردن مسیر
    clearRoute();
    
    // بروزرسانی نمایش
    updateSelectionDisplay();
    
    // غیرفعال کردن دکمه استفاده
    const useBtn = document.getElementById('useSelectionBtn');
    if (useBtn) {
        useBtn.disabled = true;
    }
    
    // حذف کلاس‌های انتخاب شده
    const pickupDisplay = document.getElementById('currentPickupDisplay');
    const destinationDisplay = document.getElementById('currentDestinationDisplay');
    
    if (pickupDisplay) pickupDisplay.classList.remove('pickup-selected');
    if (destinationDisplay) destinationDisplay.classList.remove('destination-selected');
    
    showNotification('تمامی انتخاب‌ها پاک شدند', 'info');
}

function cancelSelection() {
    resetSelectionMode();
    
    // حذف نشانگر انتخاب
    if (selectionMarker) {
        map.removeLayer(selectionMarker);
        selectionMarker = null;
    }
    
    showNotification('انتخاب لغو شد', 'info');
}

// ==================== سیستم مسیریابی ====================
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
        
        if (!originCoordinates) {
            showNotification('لطفاً مبدا را انتخاب کنید', 'error');
            return;
        }
        
        if (!destinationCoordinates) {
            showNotification('لطفاً مقصد را انتخاب کنید', 'error');
            return;
        }
        
        // ایجاد نمونه مسیریاب اگر وجود ندارد
        if (!routeCalculator) {
            routeCalculator = new RouteCalculator();
        }
        
        // نمایش loading
        showLoading('در حال محاسبه دقیق‌ترین مسیر...');
        
        // محاسبه مسیر
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
        currentPrice = routeCalculator.calculatePrice(routeInfo);
        
        // رسم مسیر روی نقشه
        drawRouteOnMap(routeInfo);
        
        // نمایش اطلاعات مسیر
        updateRouteDisplay(routeInfo, currentPrice);
        
        if (!routeInfo.isAccurate) {
            showNotification('مسافت تقریبی محاسبه شد. برای دقت بیشتر، آدرس دقیق وارد کنید', 'warning');
        }
        
        showNotification('مسیر با موفقیت محاسبه شد', 'success');
        
    } catch (error) {
        console.error('خطا در محاسبه مسیر:', error);
        showNotification('خطا در محاسبه مسیر. لطفاً مجدداً تلاش کنید', 'error');
        
        // نمایش پیام خطا در trip calculator
        const tripCalculator = document.getElementById('tripCalculator');
        if (tripCalculator) {
            tripCalculator.innerHTML = `
                <div class="error-message" style="padding: 20px; text-align: center;">
                    <i class="fas fa-exclamation-triangle" style="color: var(--accent); font-size: 48px;"></i>
                    <p>خطا در محاسبه مسیر</p>
                    <button class="btn btn-primary" onclick="calculateAndShowRoute()">تلاش مجدد</button>
                </div>
            `;
            tripCalculator.style.display = 'block';
        }
    } finally {
        hideLoading();
    }
}

function drawRouteOnMap(routeInfo) {
    // پاک‌سازی مسیر قبلی
    clearRoute();
    
    if (!routeInfo || !routeInfo.coordinates || !map) return;
    
    try {
        if (routeInfo.geometry && routeInfo.geometry.type === 'LineString') {
            const latLngs = routeInfo.coordinates.map(coord => [coord[1], coord[0]]);
            
            // رسم خط مسیر اصلی
            routeLayer = L.polyline(latLngs, {
                color: '#3B82F6',
                weight: 5,
                opacity: 0.8,
                lineJoin: 'round',
                lineCap: 'round',
                smoothFactor: 1
            }).addTo(map);
            
            // رسم سایه مسیر
            routePolyline = L.polyline(latLngs, {
                color: '#1D4ED8',
                weight: 7,
                opacity: 0.3,
                lineJoin: 'round',
                lineCap: 'round',
                smoothFactor: 1
            }).addTo(map);
            
        } else {
            // استفاده از مسیر مستقیم اگر geometry موجود نباشد
            const origin = L.latLng(originCoordinates[0], originCoordinates[1]);
            const destination = L.latLng(destinationCoordinates[0], destinationCoordinates[1]);
            
            routeLayer = L.polyline([origin, destination], {
                color: '#3B82F6',
                weight: 4,
                opacity: 0.7,
                dashArray: '10, 10',
                lineJoin: 'round',
                lineCap: 'round'
            }).addTo(map);
        }
        
        // اضافه کردن نشانگر مبدا
        if (originCoordinates) {
            if (userMarker) {
                map.removeLayer(userMarker);
            }
            
            userMarker = L.marker([originCoordinates[0], originCoordinates[1]], {
                icon: L.divIcon({
                    className: 'pickup-marker',
                    html: '<div class="marker-icon"><i class="fas fa-map-marker-alt"></i></div>',
                    iconSize: [40, 40],
                    popupAnchor: [0, -20]
                }),
                title: 'مبدا'
            }).addTo(map)
            .bindPopup(`
                <b>مبدا</b><br>
                <small>${document.getElementById('pickup').value.substring(0, 100)}</small><br>
                <small>${formatDistance(routeInfo.distance)} تا مقصد</small>
            `);
        }
        
        // اضافه کردن نشانگر مقصد
        if (destinationCoordinates) {
            destinationMarker = L.marker([destinationCoordinates[0], destinationCoordinates[1]], {
                icon: L.divIcon({
                    className: 'destination-marker',
                    html: '<div class="marker-icon"><i class="fas fa-flag-checkered"></i></div>',
                    iconSize: [40, 40],
                    popupAnchor: [0, -20]
                }),
                title: 'مقصد'
            }).addTo(map)
            .bindPopup(`
                <b>مقصد</b><br>
                <small>${document.getElementById('destination').value.substring(0, 100)}</small><br>
                <small>${formatDuration(routeInfo.duration)} تا رسیدن</small>
            `);
        }
        
        // تنظیم view برای نمایش کامل مسیر
        if (routeLayer.getBounds()) {
            map.fitBounds(routeLayer.getBounds(), {
                padding: [50, 50],
                maxZoom: 16,
                animate: true,
                duration: 1
            });
        }
        
    } catch (error) {
        console.error('خطا در رسم مسیر:', error);
        showNotification('خطا در نمایش مسیر روی نقشه', 'warning');
    }
}

function updateRouteDisplay(routeInfo, price) {
    const tripCalculator = document.getElementById('tripCalculator');
    if (!tripCalculator) return;
    
    if (!routeCalculator) {
        routeCalculator = new RouteCalculator();
    }
    
    const breakdown = routeCalculator.getPriceBreakdown(price, routeInfo);
    const now = new Date();
    const trafficFactor = routeCalculator.getTrafficFactor(now);
    const timeSurcharge = routeCalculator.getTimeSurcharge(now);
    
    const html = `
        <div class="trip-calculator-header">
            <h3>جزئیات سفر</h3>
            <button class="btn btn-secondary btn-sm" onclick="clearRoute()">
                <i class="fas fa-times"></i> پاک کردن
            </button>
        </div>
        
        <div class="trip-details-grid">
            <div class="trip-detail-card">
                <div class="trip-detail-label">مسافت</div>
                <div class="trip-detail-value">${formatDistance(routeInfo.distance)}</div>
            </div>
            <div class="trip-detail-card">
                <div class="trip-detail-label">زمان تخمینی</div>
                <div class="trip-detail-value">${formatDuration(routeInfo.duration)}</div>
            </div>
            <div class="trip-detail-card">
                <div class="trip-detail-label">نوع سفر</div>
                <div class="trip-detail-value">${breakdown.rideType}</div>
            </div>
            <div class="trip-detail-card">
                <div class="trip-detail-label">وضعیت ترافیک</div>
                <div class="trip-detail-value">${trafficFactor > 1 ? 'شلوغ' : 'آزاد'}</div>
            </div>
        </div>
        
        <div class="price-breakdown-section">
            <h4>جزئیات قیمت</h4>
            <div class="breakdown-row">
                <span>کرایه پایه:</span>
                <span>${formatPrice(breakdown.baseFare)}</span>
            </div>
            <div class="breakdown-row">
                <span>کرایه مسافت (${routeInfo.distance.toFixed(1)} × ${routeCalculator.baseFares[selectedRideType].perKm}):</span>
                <span>${formatPrice(breakdown.distanceFare)}</span>
            </div>
            <div class="breakdown-row">
                <span>کرایه زمان (${routeInfo.duration} × ${routeCalculator.baseFares[selectedRideType].perMinute.toFixed(1)}):</span>
                <span>${formatPrice(breakdown.timeFare)}</span>
            </div>
            ${trafficFactor > 1 ? `
            <div class="breakdown-row">
                <span>ضریب ترافیک (${trafficFactor.toFixed(1)}×):</span>
                <span>${((trafficFactor - 1) * 100).toFixed(0)}% اضافه</span>
            </div>
            ` : ''}
            ${timeSurcharge > 1 ? `
            <div class="breakdown-row">
                <span>اضافه‌بهای زمانی (${timeSurcharge.toFixed(1)}×):</span>
                <span>${((timeSurcharge - 1) * 100).toFixed(0)}% اضافه</span>
            </div>
            ` : ''}
            <div class="breakdown-total">
                <span>هزینه نهایی:</span>
                <span>${formatPrice(breakdown.total)}</span>
            </div>
        </div>
        
        ${!routeInfo.isAccurate ? `
        <div class="warning-badge">
            <i class="fas fa-info-circle"></i>
            <span>مسافت به صورت تقریبی محاسبه شده است</span>
        </div>
        ` : ''}
        
        <div class="route-actions">
            <button class="btn btn-primary flex-grow-1" onclick="confirmRoute()">
                <i class="fas fa-check"></i> تایید و ادامه
            </button>
            <button class="btn btn-outline-primary" onclick="calculateAndShowRoute()">
                <i class="fas fa-redo"></i> محاسبه مجدد
            </button>
        </div>
    `;
    
    tripCalculator.innerHTML = html;
    tripCalculator.style.display = 'block';
    
    // بروزرسانی قیمت در ride type selector
    const priceElement = document.getElementById(`${selectedRideType}Price`);
    if (priceElement) {
        priceElement.textContent = `${formatPrice(price)}`;
    }
}

function clearRoute() {
    // پاک‌سازی مسیر از نقشه
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
    
    // بازنشانی نشانگر کاربر به حالت اولیه
    if (userMarker) {
        userMarker.setIcon(L.divIcon({
            className: 'user-marker',
            html: '<div class="marker-icon"><i class="fas fa-user"></i></div>',
            iconSize: [40, 40]
        }));
    }
    
    // پنهان کردن trip calculator
    const tripCalculator = document.getElementById('tripCalculator');
    if (tripCalculator) {
        tripCalculator.style.display = 'none';
    }
    
    // بازنشانی متغیرها
    routeDetails = null;
    currentDistance = 0;
    currentPrice = 0;
    
    showNotification('مسیر پاک شد', 'info');
}

async function confirmRoute() {
    if (!routeDetails || !currentPrice) {
        showNotification('لطفاً ابتدا مسیر را محاسبه کنید', 'error');
        return;
    }
    
    if (!currentUser) {
        showNotification('لطفاً ابتدا وارد شوید', 'error');
        document.getElementById('authModal').style.display = 'block';
        return;
    }
    
    const pickupInput = document.getElementById('pickup');
    const destinationInput = document.getElementById('destination');
    
    if (!pickupInput || !destinationInput) return;
    
    showNotification('مسیر تایید شد. در حال ثبت سفر...', 'info');
    
    const trip = await createTrip(
        pickupInput.value,
        destinationInput.value,
        selectedRideType,
        currentPrice
    );
    
    if (trip) {
        await saveRouteDetails(trip.id, routeDetails);
        startDriverSearch();
    }
}

// ==================== مدیریت کاربر و احراز هویت ====================
async function checkUserLoginStatus() {
    try {
        const { data: { user }, error } = await supabase.auth.getUser();
        
        if (error) {
            console.error('خطا در دریافت اطلاعات کاربر:', error);
            return;
        }
        
        if (user) {
            currentUser = user;
            console.log('کاربر وارد شده:', user.email);
            
            // دریافت اطلاعات پروفایل
            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('is_admin')
                .eq('id', user.id)
                .single();
            
            if (!profileError && profile) {
                isAdmin = profile.is_admin;
                console.log('نقش کاربر:', isAdmin ? 'ادمین' : 'کاربر عادی');
            }
            
            updateUserInterface();
        }
        
    } catch (error) {
        console.error('خطا در بررسی وضعیت ورود:', error);
    }
}

async function loginUser(email, password) {
    try {
        clearErrors();
        
        if (!email || !password) {
            showError('loginEmail', 'لطفاً ایمیل را وارد کنید');
            showError('loginPassword', 'لطفاً رمز عبور را وارد کنید');
            return false;
        }
        
        showLoading('در حال ورود...');
        
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email.trim(),
            password: password.trim()
        });
        
        if (error) {
            hideLoading();
            throw error;
        }
        
        currentUser = data.user;
        
        // دریافت اطلاعات پروفایل
        const { data: profile } = await supabase
            .from('profiles')
            .select('is_admin')
            .eq('id', currentUser.id)
            .single();
        
        if (profile) {
            isAdmin = profile.is_admin;
        }
        
        hideLoading();
        showNotification('ورود موفقیت‌آمیز بود!', 'success');
        
        // بستن مودال ورود
        const authModal = document.getElementById('authModal');
        if (authModal) {
            authModal.style.display = 'none';
        }
        
        // پاک کردن فرم
        document.getElementById('loginForm').reset();
        
        updateUserInterface();
        return true;
        
    } catch (error) {
        console.error('خطا در ورود:', error);
        hideLoading();
        showNotification(error.message || 'ایمیل یا رمز عبور اشتباه است', 'error');
        return false;
    }
}

async function registerUser(email, password, name, phone) {
    try {
        clearErrors();
        
        if (!email || !password || !name || !phone) {
            showNotification('لطفاً تمام فیلدها را پر کنید', 'error');
            return false;
        }
        
        if (password.length < 6) {
            showError('registerPassword', 'رمز عبور باید حداقل ۶ حرف باشد');
            return false;
        }
        
        showLoading('در حال ثبت‌نام...');
        
        const { data, error } = await supabase.auth.signUp({
            email: email.trim(),
            password: password.trim(),
            options: {
                data: {
                    full_name: name.trim(),
                    phone: phone.trim()
                }
            }
        });
        
        if (error) {
            hideLoading();
            throw error;
        }
        
        hideLoading();
        showNotification('ثبت‌نام موفقیت‌آمیز بود! لطفاً ایمیل خود را بررسی کنید', 'success');
        
        // بستن مودال ثبت‌نام
        const authModal = document.getElementById('authModal');
        if (authModal) {
            authModal.style.display = 'none';
        }
        
        // پاک کردن فرم
        document.getElementById('registerForm').reset();
        
        return true;
        
    } catch (error) {
        console.error('خطا در ثبت‌نام:', error);
        hideLoading();
        showNotification(error.message || 'خطا در ثبت‌نام. لطفاً مجدداً تلاش کنید', 'error');
        return false;
    }
}

async function logoutUser() {
    try {
        if (confirm('آیا از خروج اطمینان دارید؟')) {
            showLoading('در حال خروج...');
            
            const { error } = await supabase.auth.signOut();
            
            if (error) throw error;
            
            currentUser = null;
            isAdmin = false;
            
            hideLoading();
            showNotification('با موفقیت خارج شدید', 'info');
            
            updateUserInterface();
            
            // بستن منوی موبایل اگر باز است
            const mobileMenu = document.getElementById('mobileMenu');
            const overlay = document.getElementById('overlay');
            const hamburger = document.getElementById('hamburger');
            
            if (mobileMenu) mobileMenu.classList.remove('active');
            if (overlay) overlay.classList.remove('active');
            if (hamburger) hamburger.classList.remove('active');
            document.body.style.overflow = '';
        }
        
    } catch (error) {
        console.error('خطا در خروج:', error);
        hideLoading();
        showNotification('خطا در خروج از سیستم', 'error');
    }
}

function updateUserInterface() {
    const loginBtn = document.getElementById('loginBtn');
    const mobileLoginBtn = document.getElementById('mobileLoginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const mobileLogoutBtn = document.getElementById('mobileLogoutBtn');
    const adminLink = document.getElementById('adminLink');
    const mobileAdminLink = document.getElementById('mobileAdminLink');
    const welcomeText = document.getElementById('welcome-text');
    
    if (currentUser) {
        // مخفی کردن دکمه‌های ورود
        if (loginBtn) loginBtn.style.display = 'none';
        if (mobileLoginBtn) mobileLoginBtn.style.display = 'none';
        
        // نمایش دکمه‌های خروج
        if (logoutBtn) logoutBtn.style.display = 'flex';
        if (mobileLogoutBtn) mobileLogoutBtn.style.display = 'flex';
        
        // نمایش/مخفی کردن لینک ادمین
        if (adminLink) {
            adminLink.style.display = isAdmin ? 'flex' : 'none';
        }
        if (mobileAdminLink) {
            mobileAdminLink.style.display = isAdmin ? 'flex' : 'none';
        }
        
        // به‌روزرسانی نام کاربر
        if (welcomeText) {
            const userName = currentUser.user_metadata?.full_name || currentUser.email?.split('@')[0] || 'کاربر';
            welcomeText.textContent = `خوش آمدید، ${userName}`;
        }
        
    } else {
        // نمایش دکمه‌های ورود
        if (loginBtn) loginBtn.style.display = 'flex';
        if (mobileLoginBtn) mobileLoginBtn.style.display = 'flex';
        
        // مخفی کردن دکمه‌های خروج
        if (logoutBtn) logoutBtn.style.display = 'none';
        if (mobileLogoutBtn) mobileLogoutBtn.style.display = 'none';
        
        // مخفی کردن لینک ادمین
        if (adminLink) adminLink.style.display = 'none';
        if (mobileAdminLink) mobileAdminLink.style.display = 'none';
        
        // بازنشانی متن خوشآمدگویی
        if (welcomeText) {
            welcomeText.textContent = 'به اسنپ افغانستان خوش آمدید';
        }
    }
}

// ==================== مدیریت سفرها ====================
async function createTrip(pickup, destination, rideType, price) {
    try {
        if (!currentUser) {
            showNotification('لطفاً ابتدا وارد شوید', 'error');
            return null;
        }
        
        showLoading('در حال ثبت سفر...');
        
        const { data, error } = await supabase
            .from('trips')
            .insert([{
                user_id: currentUser.id,
                pickup_address: pickup,
                destination_address: destination,
                ride_type: rideType,
                estimated_price: price,
                status: 'searching',
                payment_method: selectedPaymentMethod,
                created_at: new Date().toISOString()
            }])
            .select()
            .single();
        
        if (error) {
            hideLoading();
            throw error;
        }
        
        currentTripId = data.id;
        
        hideLoading();
        showNotification('سفر ثبت شد. در جستجوی راننده...', 'success');
        
        return data;
        
    } catch (error) {
        console.error('خطا در ایجاد سفر:', error);
        hideLoading();
        showNotification('خطا در ثبت سفر. لطفاً مجدداً تلاش کنید', 'error');
        return null;
    }
}

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

async function startDriverSearch() {
    try {
        if (!currentTripId) {
            showNotification('لطفاً ابتدا سفر را ایجاد کنید', 'error');
            return;
        }
        
        showNotification('در حال جستجوی راننده مناسب...', 'info');
        
        // نمایش overlay جستجو
        const searchingOverlay = document.createElement('div');
        searchingOverlay.className = 'searching-overlay';
        searchingOverlay.innerHTML = `
            <div class="searching-animation"></div>
            <div class="searching-text">در حال جستجوی راننده...</div>
            <div class="cancel-search" onclick="cancelDriverSearch()">لغو جستجو</div>
        `;
        document.querySelector('.map-container').appendChild(searchingOverlay);
        
        // شبیه‌سازی جستجوی راننده
        let searchTimeout;
        let searchAttempts = 0;
        const maxAttempts = 10;
        
        const searchDriver = async () => {
            searchAttempts++;
            
            // فیلتر رانندگان فعال و مناسب
            const availableDrivers = activeDrivers.filter(driver => {
                const isVehicleMatch = driver.vehicle_type === selectedRideType || 
                    (selectedRideType === 'economy' && driver.vehicle_type === 'comfort');
                return driver.is_available && driver.is_active && isVehicleMatch;
            });
            
            if (availableDrivers.length > 0) {
                // انتخاب راننده
                const randomDriver = availableDrivers[Math.floor(Math.random() * availableDrivers.length)];
                currentDriver = randomDriver;
                
                // حذف overlay جستجو
                searchingOverlay.remove();
                
                await assignDriverToTrip(randomDriver.id);
                showDriverFoundModal(randomDriver);
                
            } else if (searchAttempts < maxAttempts) {
                // ادامه جستجو
                const timeLeft = maxAttempts - searchAttempts;
                searchingOverlay.querySelector('.searching-text').textContent = 
                    `در حال جستجو... (${timeLeft} تلاش باقی مانده)`;
                
                searchTimeout = setTimeout(searchDriver, 2000);
            } else {
                // پایان جستجو
                searchingOverlay.remove();
                showNotification('راننده‌ای یافت نشد. لطفاً مجدداً تلاش کنید', 'warning');
                await updateTripStatus('cancelled');
            }
        };
        
        searchDriver();
        
        // توقف جستجو بعد از 30 ثانیه
        setTimeout(() => {
            if (searchTimeout) {
                clearTimeout(searchTimeout);
                searchingOverlay.remove();
                showNotification('زمان جستجو به پایان رسید', 'warning');
                updateTripStatus('cancelled');
            }
        }, 30000);
        
    } catch (error) {
        console.error('خطا در جستجوی راننده:', error);
        showNotification('خطا در جستجوی راننده', 'error');
    }
}

function cancelDriverSearch() {
    const searchingOverlay = document.querySelector('.searching-overlay');
    if (searchingOverlay) {
        searchingOverlay.remove();
    }
    showNotification('جستجوی راننده لغو شد', 'info');
    updateTripStatus('cancelled');
}

async function updateTripStatus(status) {
    try {
        if (!currentTripId) return;
        
        const { error } = await supabase
            .from('trips')
            .update({ status: status })
            .eq('id', currentTripId);
        
        if (error) throw error;
        
    } catch (error) {
        console.error('خطا در به‌روزرسانی وضعیت سفر:', error);
    }
}

// ==================== مدیریت منوی موبایل ====================
function setupMobileMenu() {
    const hamburger = document.getElementById('hamburger');
    const mobileMenu = document.getElementById('mobileMenu');
    const closeMenu = document.getElementById('closeMenu');
    const overlay = document.getElementById('overlay');
    const mobileNavLinks = document.querySelectorAll('.mobile-nav-links .nav-link');
    
    if (!hamburger || !mobileMenu || !overlay) {
        console.error('عناصر منوی موبایل یافت نشدند');
        return;
    }
    
    // باز کردن منوی موبایل
    hamburger.addEventListener('click', () => {
        mobileMenu.classList.add('active');
        overlay.classList.add('active');
        hamburger.classList.add('active');
        document.body.style.overflow = 'hidden';
    });
    
    // بستن منوی موبایل
    function closeMobileMenu() {
        mobileMenu.classList.remove('active');
        overlay.classList.remove('active');
        hamburger.classList.remove('active');
        document.body.style.overflow = '';
    }
    
    if (closeMenu) {
        closeMenu.addEventListener('click', closeMobileMenu);
    }
    
    overlay.addEventListener('click', closeMobileMenu);
    
    // بستن منو با کلیک روی لینک‌ها
    mobileNavLinks.forEach(link => {
        link.addEventListener('click', closeMobileMenu);
    });
    
    // بستن با کلید ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && mobileMenu.classList.contains('active')) {
            closeMobileMenu();
        }
    });
    
    // جلوگیری از اسکرول در پس‌زمینه
    mobileMenu.addEventListener('touchmove', (e) => {
        e.preventDefault();
    }, { passive: false });
}

// ==================== مدیریت پیمایش بین صفحات ====================
function setupNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');
    const mobileNavLinks = document.querySelectorAll('.mobile-nav-links .nav-link');
    const pages = document.querySelectorAll('.page');
    
    function switchPage(pageId) {
        // غیرفعال کردن همه صفحات
        pages.forEach(page => {
            page.classList.remove('active');
        });
        
        // غیرفعال کردن همه لینک‌ها
        navLinks.forEach(link => {
            link.classList.remove('active');
        });
        
        mobileNavLinks.forEach(link => {
            link.classList.remove('active');
        });
        
        // فعال کردن صفحه مورد نظر
        const targetPage = document.getElementById(pageId + '-page');
        if (targetPage) {
            targetPage.classList.add('active');
        }
        
        // فعال کردن لینک مربوطه
        const activeLink = document.querySelector(`.nav-link[data-page="${pageId}"]`);
        const mobileActiveLink = document.querySelector(`.mobile-nav-links .nav-link[data-page="${pageId}"]`);
        
        if (activeLink) activeLink.classList.add('active');
        if (mobileActiveLink) mobileActiveLink.classList.add('active');
        
        // بروزرسانی عنوان صفحه
        updatePageTitle(pageId);
        
        // در صورت صفحه اصلی، نقشه را بارگذاری کن
        if (pageId === 'home') {
            setTimeout(() => {
                if (!isMapInitialized) {
                    initMap();
                } else if (map) {
                    // تنظیم مجدد اندازه نقشه
                    setTimeout(() => {
                        map.invalidateSize();
                    }, 100);
                }
            }, 300);
        }
        
        // بستن منوی موبایل
        const mobileMenu = document.getElementById('mobileMenu');
        const overlay = document.getElementById('overlay');
        const hamburger = document.getElementById('hamburger');
        
        if (mobileMenu) mobileMenu.classList.remove('active');
        if (overlay) overlay.classList.remove('active');
        if (hamburger) hamburger.classList.remove('active');
        document.body.style.overflow = '';
    }
    
    function updatePageTitle(pageId) {
        const titles = {
            'home': 'اسنپ افغانستان - درخواست سفر',
            'my-trips': 'سفرهای من',
            'discounts': 'تخفیف‌ها',
            'support': 'پشتیبانی',
            'profile': 'پروفایل',
            'admin': 'پنل مدیریت'
        };
        
        if (titles[pageId]) {
            document.title = titles[pageId];
        }
    }
    
    // اضافه کردن event listener به لینک‌های دسکتاپ
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const pageId = link.getAttribute('data-page');
            switchPage(pageId);
        });
    });
    
    // اضافه کردن event listener به لینک‌های موبایل
    mobileNavLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const pageId = link.getAttribute('data-page');
            switchPage(pageId);
        });
    });
    
    // نمایش صفحه خانه به صورت پیش‌فرض
    setTimeout(() => {
        switchPage('home');
    }, 100);
}

// ==================== مدیریت مدال‌ها ====================
function setupModals() {
    const authModal = document.getElementById('authModal');
    const loginBtn = document.getElementById('loginBtn');
    const mobileLoginBtn = document.getElementById('mobileLoginBtn');
    const closeAuthModal = document.getElementById('closeAuthModal');
    const cancelAuthModal = document.getElementById('cancelAuthModal');
    
    // باز کردن مدال ورود/ثبت‌نام
    if (loginBtn) {
        loginBtn.addEventListener('click', () => {
            authModal.style.display = 'block';
            document.body.style.overflow = 'hidden';
        });
    }
    
    if (mobileLoginBtn) {
        mobileLoginBtn.addEventListener('click', () => {
            authModal.style.display = 'block';
            document.body.style.overflow = 'hidden';
        });
    }
    
    // بستن مدال ورود/ثبت‌نام
    if (closeAuthModal) {
        closeAuthModal.addEventListener('click', () => {
            authModal.style.display = 'none';
            document.body.style.overflow = '';
        });
    }
    
    if (cancelAuthModal) {
        cancelAuthModal.addEventListener('click', () => {
            authModal.style.display = 'none';
            document.body.style.overflow = '';
        });
    }
    
    // بستن مدال با کلیک خارج از آن
    window.addEventListener('click', (e) => {
        if (e.target === authModal) {
            authModal.style.display = 'none';
            document.body.style.overflow = '';
        }
    });
    
    // مدیریت تب‌های فرم
    const formTabs = document.querySelectorAll('.form-tab');
    formTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabId = tab.getAttribute('data-tab');
            
            // غیرفعال کردن همه تب‌ها
            formTabs.forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.form-tab-content').forEach(c => c.classList.remove('active'));
            
            // فعال کردن تب انتخاب شده
            tab.classList.add('active');
            document.getElementById(`${tabId}-tab`).classList.add('active');
        });
    });
    
    // مدیریت نمایش/مخفی کردن رمز عبور
    setupPasswordToggles();
}

function setupPasswordToggles() {
    const passwordToggles = document.querySelectorAll('.password-toggle');
    
    passwordToggles.forEach(toggle => {
        toggle.addEventListener('click', () => {
            const input = toggle.previousElementSibling;
            const icon = toggle.querySelector('i');
            
            if (input.type === 'password') {
                input.type = 'text';
                icon.classList.remove('fa-eye');
                icon.classList.add('fa-eye-slash');
            } else {
                input.type = 'password';
                icon.classList.remove('fa-eye-slash');
                icon.classList.add('fa-eye');
            }
        });
    });
}

// ==================== توابع پایگاه داده ====================
async function loadDistricts() {
    try {
        const { data, error } = await supabase
            .from('districts')
            .select('*')
            .order('name');
        
        if (error) throw error;
        
        districts = data;
        console.log('نواحی بارگذاری شد:', districts.length);
        
        // نمایش نواحی روی نقشه (اگر نقشه وجود دارد)
        if (map) {
            districts.forEach(district => {
                if (district.coordinates) {
                    try {
                        const coordinates = JSON.parse(district.coordinates);
                        const polygon = L.polygon(coordinates, {
                            color: '#4F46E5',
                            weight: 2,
                            opacity: 0.3,
                            fillOpacity: 0.1,
                            fillColor: '#4F46E5'
                        }).addTo(map);
                        
                        polygon.bindPopup(`
                            <b>${district.name}</b><br>
                            <small>${district.description || 'ناحیه کابل'}</small>
                        `);
                    } catch (e) {
                        console.error('خطا در نمایش ناحیه:', district.name, e);
                    }
                }
            });
        }
        
        // پر کردن لیست نواحی در UI
        const districtsGrid = document.querySelector('.districts-grid');
        if (districtsGrid && districts.length > 0) {
            districtsGrid.innerHTML = '';
            districts.forEach(district => {
                const item = document.createElement('div');
                item.className = 'district-item';
                item.textContent = district.name;
                item.title = district.description || district.name;
                item.addEventListener('click', () => {
                    document.getElementById('destination').value = district.name;
                    showNotification(`ناحیه ${district.name} انتخاب شد`, 'info');
                });
                districtsGrid.appendChild(item);
            });
        }
        
    } catch (error) {
        console.error('خطا در بارگذاری نواحی:', error);
    }
}

async function loadPopularDestinations() {
    try {
        const { data, error } = await supabase
            .from('popular_destinations')
            .select('*')
            .order('popularity', { ascending: false })
            .limit(20);
        
        if (error) throw error;
        
        popularDestinations = data;
        
        // اضافه کردن به لیست مقاصد محبوب
        const popularList = document.getElementById('popular-destinations');
        if (popularList) {
            popularList.innerHTML = '';
            
            popularDestinations.forEach(destination => {
                const li = document.createElement('li');
                li.className = 'popular-destination-item';
                li.innerHTML = `
                    <div>
                        <strong>${destination.name}</strong>
                        <small>${destination.category || 'عمومی'}</small>
                    </div>
                    <span class="popularity-badge">${destination.popularity} بار</span>
                `;
                
                li.addEventListener('click', async () => {
                    document.getElementById('destination').value = destination.name;
                    
                    // اضافه کردن نشانگر روی نقشه
                    if (destination.coordinates && map) {
                        try {
                            const coords = JSON.parse(destination.coordinates);
                            
                            if (destinationMarker) map.removeLayer(destinationMarker);
                            
                            destinationMarker = L.marker([coords[0], coords[1]], {
                                icon: L.divIcon({
                                    className: 'destination-marker',
                                    html: '<div class="marker-icon"><i class="fas fa-flag-checkered"></i></div>',
                                    iconSize: [40, 40]
                                })
                            }).addTo(map)
                            .bindPopup(`<b>${destination.name}</b><br><small>${destination.description || 'مقصد محبوب'}</small>`);
                            
                            destinationCoordinates = [coords[0], coords[1]];
                            
                            // محاسبه مسیر اگر مبدا انتخاب شده باشد
                            if (originCoordinates) {
                                await calculateAndShowRoute();
                            }
                        } catch (e) {
                            console.error('خطا در نمایش مقصد:', e);
                        }
                    }
                });
                
                popularList.appendChild(li);
            });
        }
        
    } catch (error) {
        console.error('خطا در بارگذاری مقاصد محبوب:', error);
    }
}

async function loadActiveDrivers() {
    try {
        const { data, error } = await supabase
            .from('drivers')
            .select('*')
            .eq('is_available', true)
            .eq('is_active', true);
        
        if (error) throw error;
        
        activeDrivers = data;
        
        // پاک کردن نشانگرهای قبلی
        driverMarkers.forEach(marker => {
            if (map && marker) {
                map.removeLayer(marker);
            }
        });
        driverMarkers = [];
        
        // اضافه کردن نشانگرهای جدید
        if (map) {
            activeDrivers.forEach(driver => {
                if (driver.current_location) {
                    try {
                        const location = JSON.parse(driver.current_location);
                        
                        const driverIcon = L.divIcon({
                            className: 'driver-marker',
                            html: `
                                <div class="driver-icon">
                                    <i class="fas fa-${driver.vehicle_type === 'bike' ? 'motorcycle' : 'car'}"></i>
                                    <span class="driver-badge">${driver.rating || 'جدید'}</span>
                                </div>
                            `,
                            iconSize: [50, 50],
                            popupAnchor: [0, -25]
                        });
                        
                        const marker = L.marker([location.lat, location.lng], { icon: driverIcon })
                            .addTo(map)
                            .bindPopup(`
                                <b>راننده ${driver.name}</b><br>
                                <small>${driver.vehicle_type === 'bike' ? 'موتور' : driver.vehicle_type === 'comfort' ? 'کلاسیک' : 'اقتصادی'}</small><br>
                                <small>${driver.vehicle_model || 'بدون مدل'}</small><br>
                                <small>پلاک: ${driver.vehicle_plate || 'نامشخص'}</small><br>
                                <small>امتیاز: ${driver.rating || 'جدید'}</small>
                            `);
                        
                        driverMarkers.push(marker);
                    } catch (e) {
                        console.error('خطا در نمایش راننده:', driver.name, e);
                    }
                }
            });
        }
        
        console.log('رانندگان فعال:', activeDrivers.length);
        
    } catch (error) {
        console.error('خطا در بارگذاری رانندگان:', error);
    }
}

// ==================== رویدادهای اصلی صفحه ====================
window.onload = async function() {
    try {
        // بررسی وضعیت ورود کاربر
        await checkUserLoginStatus();
        
        // راه‌اندازی منوی موبایل
        setupMobileMenu();
        
        // راه‌اندازی پیمایش صفحات
        setupNavigation();
        
        // راه‌اندازی مدال‌ها
        setupModals();
        
        // دکمه شروع استفاده
        const startUsingBtn = document.getElementById('start-using-btn');
        if (startUsingBtn) {
            startUsingBtn.addEventListener('click', async () => {
                const welcomePage = document.getElementById('welcome-page');
                const mainHeader = document.getElementById('main-header');
                const mainContainer = document.getElementById('main-container');
                const mainFooter = document.getElementById('main-footer');
                
                if (welcomePage) welcomePage.style.display = 'none';
                if (mainHeader) mainHeader.style.display = 'block';
                if (mainContainer) mainContainer.style.display = 'block';
                if (mainFooter) mainFooter.style.display = 'block';
                
                // بارگذاری نقشه
                await initMap();
                
                showNotification('به اسنپ افغانستان خوش آمدید!', 'success');
            });
        }
        
        // تنظیم event listener برای فرم درخواست سفر
        const rideForm = document.getElementById('rideForm');
        if (rideForm) {
            // دکمه انتخاب از نقشه
            const mapSelectionBtn = document.createElement('button');
            mapSelectionBtn.id = 'mapSelectionBtn';
            mapSelectionBtn.className = 'btn btn-outline-primary btn-block';
            mapSelectionBtn.innerHTML = '<i class="fas fa-map-marker-alt"></i> انتخاب از روی نقشه';
            mapSelectionBtn.style.marginTop = '10px';
            mapSelectionBtn.style.marginBottom = '10px';
            
            // دکمه محاسبه مسیر
            const calculateRouteBtn = document.createElement('button');
            calculateRouteBtn.id = 'calculateRouteBtn';
            calculateRouteBtn.className = 'btn btn-primary btn-block';
            calculateRouteBtn.innerHTML = '<i class="fas fa-route"></i> محاسبه مسیر دقیق';
            calculateRouteBtn.style.marginTop = '15px';
            
            // اضافه کردن دکمه انتخاب از نقشه
            const pickupGroup = document.getElementById('pickup').parentElement;
            if (pickupGroup) {
                pickupGroup.parentNode.insertBefore(mapSelectionBtn, pickupGroup.nextSibling);
            }
            
            // اضافه کردن دکمه محاسبه مسیر
            rideForm.appendChild(calculateRouteBtn);
            
            // رویداد دکمه انتخاب از نقشه
            mapSelectionBtn.addEventListener('click', (e) => {
                e.preventDefault();
                openMapSelectionPanel();
            });
            
            // رویداد دکمه محاسبه مسیر
            calculateRouteBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                await calculateAndShowRoute();
            });
            
            // رویداد submit فرم
            rideForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await handleRideRequest();
            });
        }
        
        // تنظیم event listener برای نوع سفر
        document.querySelectorAll('.ride-type').forEach(type => {
            type.addEventListener('click', () => {
                // حذف انتخاب قبلی
                document.querySelectorAll('.ride-type').forEach(t => t.classList.remove('selected'));
                
                // انتخاب جدید
                type.classList.add('selected');
                selectedRideType = type.dataset.type;
                
                // بروزرسانی قیمت اگر مسیر محاسبه شده باشد
                if (routeDetails && currentDistance > 0 && routeCalculator) {
                    const newPrice = routeCalculator.calculatePrice(routeDetails);
                    currentPrice = newPrice;
                    updateRouteDisplay(routeDetails, newPrice);
                }
                
                // بروزرسانی نمایش قیمت
                const priceElements = document.querySelectorAll('.ride-price');
                priceElements.forEach(el => {
                    if (el.closest('.ride-type').dataset.type === selectedRideType) {
                        el.style.opacity = '1';
                    } else {
                        el.style.opacity = '0.5';
                    }
                });
            });
        });
        
        // تنظیم event listener برای روش پرداخت
        document.querySelectorAll('.payment-method').forEach(method => {
            method.addEventListener('click', () => {
                document.querySelectorAll('.payment-method').forEach(m => m.classList.remove('selected'));
                method.classList.add('selected');
                selectedPaymentMethod = method.dataset.method;
            });
        });
        
        // دکمه موقعیت‌یابی خودکار
        const autoLocationBtn = document.getElementById('auto-location-btn');
        if (autoLocationBtn) {
            autoLocationBtn.addEventListener('click', async () => {
                if (navigator.geolocation) {
                    showLoading('در حال دریافت موقعیت...');
                    
                    navigator.geolocation.getCurrentPosition(
                        async (position) => {
                            const userLat = position.coords.latitude;
                            const userLng = position.coords.longitude;
                            
                            await reverseGeocode(userLat, userLng, document.getElementById('pickup'));
                            hideLoading();
                            showNotification('موقعیت شما به طور خودکار انتخاب شد', 'success');
                        },
                        (error) => {
                            hideLoading();
                            console.error('خطای موقعیت‌یابی:', error);
                            showNotification('دسترسی به موقعیت مکانی فعال نیست', 'warning');
                        },
                        {
                            enableHighAccuracy: true,
                            timeout: 10000,
                            maximumAge: 0
                        }
                    );
                } else {
                    showNotification('مرورگر شما از موقعیت‌یابی پشتیبانی نمی‌کند', 'warning');
                }
            });
        }
        
        // فرم ورود
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const email = document.getElementById('loginEmail').value;
                const password = document.getElementById('loginPassword').value;
                await loginUser(email, password);
            });
        }
        
        // فرم ثبت‌نام
        const registerForm = document.getElementById('registerForm');
        if (registerForm) {
            registerForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const email = document.getElementById('registerEmail').value;
                const password = document.getElementById('registerPassword').value;
                const name = document.getElementById('registerName').value;
                const phone = document.getElementById('registerPhone').value;
                await registerUser(email, password, name, phone);
            });
        }
        
        // دکمه باز کردن پنل ادمین
        const adminLink = document.getElementById('adminLink');
        const mobileAdminLink = document.getElementById('mobileAdminLink');
        
        if (adminLink) {
            adminLink.addEventListener('click', (e) => {
                e.preventDefault();
                if (isAdmin) {
                    openAdminPanel();
                } else {
                    showNotification('شما دسترسی ادمین ندارید', 'error');
                }
            });
        }
        
        if (mobileAdminLink) {
            mobileAdminLink.addEventListener('click', (e) => {
                e.preventDefault();
                if (isAdmin) {
                    openAdminPanel();
                } else {
                    showNotification('شما دسترسی ادمین ندارید', 'error');
                }
            });
        }
        
        // ایجاد نمونه اولیه مسیریاب
        routeCalculator = new RouteCalculator();
        
        console.log('برنامه با موفقیت بارگذاری شد');
        
    } catch (error) {
        console.error('خطا در راه‌اندازی برنامه:', error);
        showNotification('خطا در بارگذاری برنامه. لطفاً صفحه را رفرش کنید', 'error');
    }
};

// ==================== توابع دیگر ====================
async function handleRideRequest() {
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
    
    if (!routeDetails || !currentPrice) {
        showNotification('لطفاً ابتدا مسیر را محاسبه کنید', 'error');
        await calculateAndShowRoute();
        return;
    }
    
    const trip = await createTrip(pickup, destination, selectedRideType, currentPrice);
    
    if (trip) {
        await saveRouteDetails(trip.id, routeDetails);
        startDriverSearch();
    }
}

async function reverseGeocode(lat, lng, inputElement) {
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=fa&zoom=18`);
        
        if (!response.ok) {
            throw new Error('خطا در دریافت آدرس');
        }
        
        const data = await response.json();
        
        if (data.display_name) {
            inputElement.value = data.display_name;
            
            if (userMarker && map) {
                map.removeLayer(userMarker);
            }
            
            userMarker = L.marker([lat, lng], {
                icon: L.divIcon({
                    className: 'pickup-marker',
                    html: '<div class="marker-icon"><i class="fas fa-map-marker-alt"></i></div>',
                    iconSize: [40, 40]
                })
            }).addTo(map)
            .bindPopup('مبدا انتخاب شده<br><small>' + data.display_name.substring(0, 100) + '</small>');
            
            originCoordinates = [lat, lng];
            
            const destinationInput = document.getElementById('destination');
            if (destinationInput && destinationInput.value.trim() && destinationCoordinates) {
                setTimeout(() => calculateAndShowRoute(), 500);
            }
            
            showNotification('آدرس مبدا انتخاب شد', 'info');
        }
    } catch (error) {
        console.error('Error in reverse geocoding:', error);
        inputElement.value = `موقعیت جغرافیایی: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    }
}

// ==================== توابع برای modal راننده ====================
async function assignDriverToTrip(driverId) {
    try {
        const { error } = await supabase
            .from('trips')
            .update({
                driver_id: driverId,
                status: 'driver_assigned',
                driver_assigned_at: new Date().toISOString()
            })
            .eq('id', currentTripId);
        
        if (error) throw error;
        
        console.log('راننده به سفر اختصاص داده شد');
        
    } catch (error) {
        console.error('خطا در اختصاص راننده:', error);
    }
}

function showDriverFoundModal(driver) {
    const modalHTML = `
        <div class="modal" id="driverFoundModal" style="display: block;">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title"><i class="fas fa-car"></i> راننده پیدا شد! 🎉</h5>
                    <button type="button" class="close-modal" onclick="closeDriverModal()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="driver-info">
                        <div class="driver-details">
                            <div class="driver-avatar">
                                ${driver.name.charAt(0)}
                            </div>
                            <div class="driver-name-rating">
                                <h3>${driver.name}</h3>
                                <div class="driver-rating">
                                    <div class="stars">
                                        ${generateStarRating(driver.rating || 5)}
                                    </div>
                                    <span>${driver.rating || 'جدید'}</span>
                                </div>
                            </div>
                        </div>
                        
                        <div class="car-details">
                            <div class="car-info">
                                <div class="car-model">${driver.vehicle_model || 'نامشخص'}</div>
                                <div class="car-color">${driver.vehicle_type === 'bike' ? 'موتور' : 
                                   driver.vehicle_type === 'comfort' ? 'کلاسیک' : 'اقتصادی'}</div>
                            </div>
                            <div class="car-plate">${driver.vehicle_plate || 'نامشخص'}</div>
                        </div>
                    </div>
                    
                    <div class="trip-info">
                        <div class="trip-detail">
                            <i class="fas fa-route"></i>
                            <div class="value">${formatDistance(routeDetails?.distance || 0)}</div>
                            <span>مسافت</span>
                        </div>
                        <div class="trip-detail">
                            <i class="fas fa-clock"></i>
                            <div class="value">${formatDuration(routeDetails?.duration || 0)}</div>
                            <span>زمان تخمینی</span>
                        </div>
                        <div class="trip-detail">
                            <i class="fas fa-money-bill-wave"></i>
                            <div class="value">${formatPrice(currentPrice)}</div>
                            <span>هزینه</span>
                        </div>
                    </div>
                    
                    <div class="arrival-time" style="text-align: center; margin: 20px 0; padding: 15px; background: #f8f9fa; border-radius: 10px;">
                        <i class="fas fa-clock"></i>
                        <span style="font-weight: bold; margin-right: 10px;">زمان رسیدن راننده:</span>
                        <span id="arrivalTime">${Math.floor(Math.random() * 10) + 5} دقیقه</span>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" onclick="closeDriverModal()">لغو سفر</button>
                    <button type="button" class="btn btn-primary" onclick="startTrip()">تایید و شروع سفر</button>
                </div>
            </div>
        </div>
    `;
    
    // حذف مودال قبلی اگر وجود دارد
    const existingModal = document.getElementById('driverFoundModal');
    if (existingModal) existingModal.remove();
    
    // اضافه کردن مودال جدید
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // شروع ردیابی موقعیت راننده
    simulateDriverTracking(driver);
}

function generateStarRating(rating) {
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    let stars = '';
    
    for (let i = 0; i < 5; i++) {
        if (i < fullStars) {
            stars += '<i class="fas fa-star"></i>';
        } else if (i === fullStars && hasHalfStar) {
            stars += '<i class="fas fa-star-half-alt"></i>';
        } else {
            stars += '<i class="far fa-star"></i>';
        }
    }
    
    return stars;
}

function closeDriverModal() {
    const modal = document.getElementById('driverFoundModal');
    if (modal) {
        modal.style.animation = 'fadeOut 0.3s ease';
        setTimeout(() => modal.remove(), 300);
    }
    
    // لغو ردیابی
    if (trackingInterval) {
        clearInterval(trackingInterval);
        trackingInterval = null;
    }
    
    // لغو سفر
    updateTripStatus('cancelled');
    
    showNotification('سفر لغو شد', 'info');
}

function simulateDriverTracking(driver) {
    if (trackingInterval) {
        clearInterval(trackingInterval);
    }
    
    let driverLat = originCoordinates[0];
    let driverLng = originCoordinates[1];
    const destinationLat = destinationCoordinates[0];
    const destinationLng = destinationCoordinates[1];
    
    // ایجاد نشانگر راننده
    const driverMarker = L.marker([driverLat, driverLng], {
        icon: L.divIcon({
            className: 'active-driver-marker',
            html: '<div class="marker-icon"><i class="fas fa-car"></i></div>',
            iconSize: [40, 40],
            popupAnchor: [0, -20]
        })
    }).addTo(map);
    
    trackingInterval = setInterval(() => {
        // حرکت راننده به سمت مبدا
        const latDiff = originCoordinates[0] - driverLat;
        const lngDiff = originCoordinates[1] - driverLng;
        
        driverLat += latDiff * 0.1;
        driverLng += lngDiff * 0.1;
        
        driverMarker.setLatLng([driverLat, driverLng]);
        
        // محاسبه فاصله تا مبدا
        const distanceToOrigin = calculateDistance(driverLat, driverLng, originCoordinates[0], originCoordinates[1]);
        const arrivalTime = Math.max(1, Math.round(distanceToOrigin * 10));
        
        // به‌روزرسانی زمان رسیدن در مودال
        const arrivalElement = document.getElementById('arrivalTime');
        if (arrivalElement) {
            arrivalElement.textContent = `${arrivalTime} دقیقه`;
        }
        
        // اگر راننده به مبدا رسید
        if (distanceToOrigin < 0.05) { // 50 متر
            clearInterval(trackingInterval);
            showNotification('راننده به مبدا رسید!', 'success');
            
            // به‌روزرسانی مودال
            const startBtn = document.querySelector('#driverFoundModal .btn-primary');
            if (startBtn) {
                startBtn.textContent = 'شروع سفر';
                startBtn.focus();
            }
        }
        
    }, 1000);
}

async function startTrip() {
    try {
        // بستن مودال راننده
        closeDriverModal();
        
        // به‌روزرسانی وضعیت سفر
        const { error } = await supabase
            .from('trips')
            .update({
                status: 'started',
                started_at: new Date().toISOString()
            })
            .eq('id', currentTripId);
        
        if (error) throw error;
        
        // نمایش صفحه سفر در حال انجام
        showTripInProgress();
        
        showNotification('سفر شروع شد!', 'success');
        
    } catch (error) {
        console.error('خطا در شروع سفر:', error);
        showNotification('خطا در شروع سفر', 'error');
    }
}

// ==================== مدیریت وضعیت سفر در حال انجام ====================
function showTripInProgress() {
    // مخفی کردن فرم اصلی
    const rideForm = document.getElementById('rideForm');
    const tripCalculator = document.getElementById('tripCalculator');
    
    if (rideForm) rideForm.style.display = 'none';
    if (tripCalculator) tripCalculator.style.display = 'none';
    
    // ایجاد صفحه سفر در حال انجام
    const tripInProgressHTML = `
        <div class="trip-in-progress-container">
            <div class="trip-header">
                <h3><i class="fas fa-car"></i> سفر در حال انجام</h3>
                <button class="btn btn-sm btn-outline-danger" onclick="cancelTrip()">
                    <i class="fas fa-times"></i> لغو سفر
                </button>
            </div>
            
            <div class="trip-info-card">
                <div class="trip-details">
                    <div class="detail-row">
                        <span class="detail-label">راننده:</span>
                        <span class="detail-value">${currentDriver?.name || 'نامشخص'}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">وسیله نقلیه:</span>
                        <span class="detail-value">${currentDriver?.vehicle_model || 'نامشخص'} - ${currentDriver?.vehicle_plate || 'نامشخص'}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">مبدا:</span>
                        <span class="detail-value">${document.getElementById('pickup')?.value.substring(0, 50) || 'نامشخص'}...</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">مقصد:</span>
                        <span class="detail-value">${document.getElementById('destination')?.value.substring(0, 50) || 'نامشخص'}...</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">هزینه:</span>
                        <span class="detail-value">${formatPrice(currentPrice)}</span>
                    </div>
                </div>
                
                <div class="trip-progress">
                    <div class="progress-labels">
                        <span>در راه مبدا</span>
                        <span>در حال سفر</span>
                        <span>پایان سفر</span>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-step active"></div>
                        <div class="progress-step"></div>
                        <div class="progress-step"></div>
                    </div>
                </div>
                
                <div class="trip-actions">
                    <button class="btn btn-outline-primary" onclick="callDriver()">
                        <i class="fas fa-phone"></i> تماس با راننده
                    </button>
                    <button class="btn btn-outline-primary" onclick="messageDriver()">
                        <i class="fas fa-comment"></i> پیام به راننده
                    </button>
                    <button class="btn btn-primary" onclick="completeTrip()">
                        <i class="fas fa-flag-checkered"></i> پایان سفر
                    </button>
                </div>
            </div>
        </div>
    `;
    
    const mainContainer = document.getElementById('main-container');
    if (mainContainer) {
        mainContainer.insertAdjacentHTML('beforeend', tripInProgressHTML);
    }
    
    // شروع شبیه‌سازی سفر
    simulateTripProgress();
}

function simulateTripProgress() {
    let progress = 0;
    const progressSteps = document.querySelectorAll('.progress-step');
    
    const tripProgress = setInterval(() => {
        progress += 0.02; // 2% در هر ثانیه
        
        if (progress >= 1) {
            progress = 1;
            clearInterval(tripProgress);
            showNotification('به مقصد نزدیک می‌شوید!', 'info');
        }
        
        // به‌روزرسانی مراحل پیشرفت
        if (progress >= 0.3 && progress < 0.6) {
            progressSteps[0].classList.remove('active');
            progressSteps[1].classList.add('active');
        } else if (progress >= 0.6) {
            progressSteps[1].classList.remove('active');
            progressSteps[2].classList.add('active');
        }
        
    }, 1000);
}

function callDriver() {
    if (currentDriver?.phone) {
        window.open(`tel:${currentDriver.phone}`, '_blank');
    } else {
        showNotification('شماره تماس راننده موجود نیست', 'warning');
    }
}

function messageDriver() {
    showNotification('سیستم پیام‌رسانی به زودی فعال خواهد شد', 'info');
}

async function completeTrip() {
    try {
        // به‌روزرسانی وضعیت سفر
        const { error } = await supabase
            .from('trips')
            .update({
                status: 'completed',
                completed_at: new Date().toISOString(),
                actual_price: currentPrice
            })
            .eq('id', currentTripId);
        
        if (error) throw error;
        
        // پاک کردن المان‌های سفر
        const tripContainer = document.querySelector('.trip-in-progress-container');
        if (tripContainer) tripContainer.remove();
        
        // نمایش مجدد فرم اصلی
        const rideForm = document.getElementById('rideForm');
        if (rideForm) rideForm.style.display = 'block';
        
        // نمایش صفحه پرداخت
        showPaymentScreen();
        
        showNotification('سفر با موفقیت به پایان رسید!', 'success');
        
    } catch (error) {
        console.error('خطا در تکمیل سفر:', error);
        showNotification('خطا در تکمیل سفر', 'error');
    }
}

async function cancelTrip() {
    try {
        if (confirm('آیا از لغو سفر مطمئن هستید؟')) {
            const { error } = await supabase
                .from('trips')
                .update({
                    status: 'cancelled',
                    cancelled_at: new Date().toISOString(),
                    cancelled_by: 'user'
                })
                .eq('id', currentTripId);
            
            if (error) throw error;
            
            // پاک کردن المان‌های سفر
            const tripContainer = document.querySelector('.trip-in-progress-container');
            if (tripContainer) tripContainer.remove();
            
            // پاک کردن ردیابی
            if (trackingInterval) {
                clearInterval(trackingInterval);
                trackingInterval = null;
            }
            
            // نمایش مجدد فرم اصلی
            const rideForm = document.getElementById('rideForm');
            if (rideForm) rideForm.style.display = 'block';
            
            currentTripId = null;
            currentDriver = null;
            
            showNotification('سفر لغو شد', 'info');
        }
        
    } catch (error) {
        console.error('خطا در لغو سفر:', error);
        showNotification('خطا در لغو سفر', 'error');
    }
}

// ==================== مدیریت پرداخت ====================
function showPaymentScreen() {
    const paymentHTML = `
        <div class="payment-container">
            <div class="payment-card">
                <div class="payment-header">
                    <h3><i class="fas fa-credit-card"></i> پرداخت</h3>
                </div>
                
                <div class="payment-info">
                    <div class="payment-detail">
                        <span>مبلغ قابل پرداخت:</span>
                        <span class="payment-amount">${formatPrice(currentPrice)}</span>
                    </div>
                    
                    <div class="payment-methods-selection">
                        <h5>روش پرداخت:</h5>
                        <div class="payment-methods-grid">
                            <div class="payment-method ${selectedPaymentMethod === 'cash' ? 'selected' : ''}" 
                                 data-method="cash" onclick="selectPaymentMethod('cash')">
                                <i class="fas fa-money-bill-wave"></i>
                                <span>نقدی</span>
                            </div>
                            <div class="payment-method ${selectedPaymentMethod === 'wallet' ? 'selected' : ''}" 
                                 data-method="wallet" onclick="selectPaymentMethod('wallet')">
                                <i class="fas fa-wallet"></i>
                                <span>کیف پول</span>
                            </div>
                            <div class="payment-method ${selectedPaymentMethod === 'card' ? 'selected' : ''}" 
                                 data-method="card" onclick="selectPaymentMethod('card')">
                                <i class="fas fa-credit-card"></i>
                                <span>کارت بانکی</span>
                            </div>
                        </div>
                    </div>
                    
                    ${selectedPaymentMethod === 'wallet' ? `
                    <div class="wallet-balance">
                        <span>موجودی کیف پول:</span>
                        <span class="balance-amount">${formatPrice(50000)}</span>
                    </div>
                    ` : ''}
                    
                    ${selectedPaymentMethod === 'card' ? `
                    <div class="card-details">
                        <div class="form-group">
                            <label for="cardNumber">شماره کارت:</label>
                            <input type="text" id="cardNumber" class="form-input" 
                                   placeholder="**** **** **** ****" maxlength="19" oninput="formatCardNumber(this)">
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label for="expiryDate">تاریخ انقضا:</label>
                                <input type="text" id="expiryDate" class="form-input" 
                                       placeholder="MM/YY" maxlength="5" oninput="formatExpiryDate(this)">
                            </div>
                            <div class="form-group">
                                <label for="cvv">CVV:</label>
                                <input type="password" id="cvv" class="form-input" 
                                       placeholder="***" maxlength="3" oninput="this.value = this.value.replace(/[^0-9]/g, '')">
                            </div>
                        </div>
                    </div>
                    ` : ''}
                </div>
                
                <div class="payment-actions">
                    <button class="btn btn-outline-secondary" onclick="skipPayment()">
                        پرداخت بعدی
                    </button>
                    <button class="btn btn-primary" onclick="processPayment()">
                        <i class="fas fa-lock"></i> پرداخت
                    </button>
                </div>
            </div>
        </div>
    `;
    
    const mainContainer = document.getElementById('main-container');
    if (mainContainer) {
        mainContainer.insertAdjacentHTML('beforeend', paymentHTML);
    }
}

function selectPaymentMethod(method) {
    selectedPaymentMethod = method;
    
    // به‌روزرسانی ظاهر دکمه‌ها
    document.querySelectorAll('.payment-method').forEach(el => {
        el.classList.remove('selected');
        if (el.dataset.method === method) {
            el.classList.add('selected');
        }
    });
    
    // به‌روزرسانی نمایش جزئیات پرداخت
    const paymentContainer = document.querySelector('.payment-container');
    if (paymentContainer) {
        // حذف و ایجاد مجدد برای نمایش تغییرات
        paymentContainer.remove();
        showPaymentScreen();
    }
}

function formatCardNumber(input) {
    let value = input.value.replace(/\D/g, '');
    value = value.replace(/(.{4})/g, '$1 ').trim();
    input.value = value.substring(0, 19);
}

function formatExpiryDate(input) {
    let value = input.value.replace(/\D/g, '');
    if (value.length >= 2) {
        value = value.substring(0, 2) + '/' + value.substring(2);
    }
    input.value = value.substring(0, 5);
}

async function processPayment() {
    try {
        if (selectedPaymentMethod === 'card') {
            const cardNumber = document.getElementById('cardNumber').value.replace(/\s/g, '');
            const expiryDate = document.getElementById('expiryDate').value;
            const cvv = document.getElementById('cvv').value;
            
            if (cardNumber.length !== 16) {
                showNotification('شماره کارت باید ۱۶ رقم باشد', 'error');
                return;
            }
            
            if (!/^\d{2}\/\d{2}$/.test(expiryDate)) {
                showNotification('فرمت تاریخ انقضا صحیح نیست (MM/YY)', 'error');
                return;
            }
            
            if (cvv.length !== 3) {
                showNotification('CVV باید ۳ رقم باشد', 'error');
                return;
            }
        }
        
        showLoading('در حال پردازش پرداخت...');
        
        // شبیه‌سازی پردازش پرداخت
        setTimeout(async () => {
            try {
                // به‌روزرسانی وضعیت سفر
                const { error } = await supabase
                    .from('trips')
                    .update({
                        payment_status: 'paid',
                        paid_at: new Date().toISOString(),
                        payment_method: selectedPaymentMethod
                    })
                    .eq('id', currentTripId);
                
                if (error) throw error;
                
                hideLoading();
                
                // حذف صفحه پرداخت
                const paymentContainer = document.querySelector('.payment-container');
                if (paymentContainer) paymentContainer.remove();
                
                // نمایش صفحه تشکر
                showThankYouScreen();
                
                showNotification('پرداخت با موفقیت انجام شد!', 'success');
                
            } catch (error) {
                hideLoading();
                console.error('خطا در به‌روزرسانی وضعیت پرداخت:', error);
                showNotification('خطا در پرداخت. لطفاً مجدداً تلاش کنید', 'error');
            }
        }, 2000);
        
    } catch (error) {
        console.error('خطا در پردازش پرداخت:', error);
        showNotification('خطا در پرداخت. لطفاً مجدداً تلاش کنید', 'error');
    }
}

function skipPayment() {
    if (confirm('آیا مایلید پرداخت را برای بعد موکول کنید؟')) {
        const paymentContainer = document.querySelector('.payment-container');
        if (paymentContainer) paymentContainer.remove();
        
        showThankYouScreen();
        showNotification('می‌توانید بعداً پرداخت کنید', 'info');
    }
}

// ==================== صفحه تشکر و رتبه‌دهی ====================
function showThankYouScreen() {
    const thankYouHTML = `
        <div class="thank-you-container">
            <div class="thank-you-card">
                <div class="success-icon">
                    <i class="fas fa-check-circle"></i>
                </div>
                <h2>سفر شما تکمیل شد!</h2>
                <p class="thank-you-message">
                    از همراهی شما سپاسگزاریم. امیدواریم سفری خوب و ایمن داشته‌باشید.
                </p>
                
                <div class="trip-summary">
                    <h4>خلاصه سفر</h4>
                    <div class="summary-item">
                        <span>شماره سفر:</span>
                        <span>${currentTripId}</span>
                    </div>
                    <div class="summary-item">
                        <span>راننده:</span>
                        <span>${currentDriver?.name || 'نامشخص'}</span>
                    </div>
                    <div class="summary-item">
                        <span>مسافت:</span>
                        <span>${formatDistance(currentDistance)}</span>
                    </div>
                    <div class="summary-item">
                        <span>هزینه:</span>
                        <span>${formatPrice(currentPrice)}</span>
                    </div>
                </div>
                
                <div class="thank-you-actions">
                    <button class="btn btn-outline-primary" onclick="rateDriver()">
                        <i class="fas fa-star"></i> امتیاز به راننده
                    </button>
                    <button class="btn btn-primary" onclick="newTrip()">
                        <i class="fas fa-plus"></i> سفر جدید
                    </button>
                </div>
            </div>
        </div>
    `;
    
    const mainContainer = document.getElementById('main-container');
    if (mainContainer) {
        mainContainer.insertAdjacentHTML('beforeend', thankYouHTML);
    }
}

function rateDriver() {
    const ratingHTML = `
        <div class="modal" id="ratingModal" style="display: block;">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title"><i class="fas fa-star"></i> امتیاز به راننده</h5>
                    <button type="button" class="close-modal" onclick="closeRatingModal()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="driver-info text-center">
                        <h4>${currentDriver?.name || 'راننده'}</h4>
                        <p>لطفاً به راننده امتیاز دهید:</p>
                        
                        <div class="rating-stars">
                            <i class="far fa-star" data-rating="1" onmouseover="highlightStars(1)" onclick="setRating(1)"></i>
                            <i class="far fa-star" data-rating="2" onmouseover="highlightStars(2)" onclick="setRating(2)"></i>
                            <i class="far fa-star" data-rating="3" onmouseover="highlightStars(3)" onclick="setRating(3)"></i>
                            <i class="far fa-star" data-rating="4" onmouseover="highlightStars(4)" onclick="setRating(4)"></i>
                            <i class="far fa-star" data-rating="5" onmouseover="highlightStars(5)" onclick="setRating(5)"></i>
                        </div>
                        
                        <div class="rating-tags">
                            <span class="rating-tag" data-tag="آداب معاشرت">آداب معاشرت</span>
                            <span class="rating-tag" data-tag="رعایت قوانین">رعایت قوانین</span>
                            <span class="rating-tag" data-tag="نظافت خودرو">نظافت خودرو</span>
                            <span class="rating-tag" data-tag="آرامش رانندگی">آرامش رانندگی</span>
                            <span class="rating-tag" data-tag="مسیریابی">مسیریابی</span>
                        </div>
                        
                        <div class="form-group mt-3">
                            <textarea id="ratingComment" class="form-input" 
                                      placeholder="نظر خود را بنویسید (اختیاری)..." 
                                      rows="3"></textarea>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" onclick="closeRatingModal()">
                        بعداً
                    </button>
                    <button type="button" class="btn btn-primary" onclick="submitRating()">
                        ثبت امتیاز
                    </button>
                </div>
            </div>
        </div>
    `;
    
    // حذف مودال قبلی
    const existingModal = document.getElementById('ratingModal');
    if (existingModal) existingModal.remove();
    
    // اضافه کردن مودال جدید
    document.body.insertAdjacentHTML('beforeend', ratingHTML);
    
    // تنظیم رویدادها برای تگ‌ها
    document.querySelectorAll('.rating-tag').forEach(tag => {
        tag.addEventListener('click', function() {
            this.classList.toggle('selected');
        });
    });
}

let selectedRating = 0;

function highlightStars(rating) {
    const stars = document.querySelectorAll('.rating-stars i');
    stars.forEach(star => {
        const starRating = parseInt(star.dataset.rating);
        if (starRating <= rating) {
            star.classList.remove('far');
            star.classList.add('fas');
        } else {
            star.classList.remove('fas');
            star.classList.add('far');
        }
    });
}

function setRating(rating) {
    selectedRating = rating;
    highlightStars(rating);
}

function closeRatingModal() {
    const modal = document.getElementById('ratingModal');
    if (modal) {
        modal.style.animation = 'fadeOut 0.3s ease';
        setTimeout(() => modal.remove(), 300);
    }
}

async function submitRating() {
    try {
        if (selectedRating === 0) {
            showNotification('لطفاً امتیاز دهید', 'error');
            return;
        }
        
        // جمع‌آوری تگ‌های انتخاب شده
        const selectedTags = [];
        document.querySelectorAll('.rating-tag.selected').forEach(tag => {
            selectedTags.push(tag.dataset.tag);
        });
        
        const comment = document.getElementById('ratingComment').value.trim();
        
        // ذخیره امتیاز در دیتابیس
        const { error } = await supabase
            .from('ratings')
            .insert([{
                trip_id: currentTripId,
                driver_id: currentDriver?.id,
                user_id: currentUser.id,
                rating: selectedRating,
                tags: selectedTags,
                comment: comment,
                created_at: new Date().toISOString()
            }]);
        
        if (error) throw error;
        
        // بستن مودال
        closeRatingModal();
        
        showNotification('امتیاز شما ثبت شد. متشکریم!', 'success');
        
    } catch (error) {
        console.error('خطا در ثبت امتیاز:', error);
        showNotification('خطا در ثبت امتیاز', 'error');
    }
}

function newTrip() {
    // پاک کردن همه المان‌های اضافی
    document.querySelectorAll('.thank-you-container, .payment-container, .trip-in-progress-container').forEach(el => {
        el.remove();
    });
    
    // پاک کردن مسیر از نقشه
    clearRoute();
    
    // نمایش مجدد فرم اصلی
    const rideForm = document.getElementById('rideForm');
    if (rideForm) rideForm.style.display = 'block';
    
    // بازنشانی متغیرها
    currentTripId = null;
    currentDriver = null;
    
    showNotification('برای سفری جدید، مبدا و مقصد را انتخاب کنید', 'info');
}

// ==================== پنل مدیریت ====================
function openAdminPanel() {
    const adminHTML = `
        <div class="modal" id="adminModal" style="display: block;">
            <div class="modal-content" style="max-width: 900px;">
                <div class="modal-header">
                    <h5 class="modal-title"><i class="fas fa-cog"></i> پنل مدیریت</h5>
                    <button type="button" class="close-modal" onclick="closeAdminPanel()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="admin-tabs">
                        <ul class="nav nav-tabs" id="adminTabs">
                            <li class="nav-item">
                                <button class="nav-link active" data-bs-toggle="tab" data-bs-target="#tripsTab">
                                    <i class="fas fa-car"></i> سفرها
                                </button>
                            </li>
                            <li class="nav-item">
                                <button class="nav-link" data-bs-toggle="tab" data-bs-target="#driversTab">
                                    <i class="fas fa-users"></i> رانندگان
                                </button>
                            </li>
                            <li class="nav-item">
                                <button class="nav-link" data-bs-toggle="tab" data-bs-target="#analyticsTab">
                                    <i class="fas fa-chart-bar"></i> آمار
                                </button>
                            </li>
                            <li class="nav-item">
                                <button class="nav-link" data-bs-toggle="tab" data-bs-target="#settingsTab">
                                    <i class="fas fa-sliders-h"></i> تنظیمات
                                </button>
                            </li>
                        </ul>
                        
                        <div class="tab-content mt-3">
                            <div class="tab-pane fade show active" id="tripsTab">
                                <div id="tripsTableContainer">
                                    <div class="text-center">
                                        <div class="spinner"></div>
                                        <p>در حال بارگذاری...</p>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="tab-pane fade" id="driversTab">
                                <div id="driversTableContainer">
                                    <div class="text-center">
                                        <div class="spinner"></div>
                                        <p>در حال بارگذاری...</p>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="tab-pane fade" id="analyticsTab">
                                <div id="analyticsContainer">
                                    <div class="text-center">
                                        <div class="spinner"></div>
                                        <p>در حال بارگذاری...</p>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="tab-pane fade" id="settingsTab">
                                <div class="settings-section">
                                    <h5>تنظیمات کرایه</h5>
                                    <form id="fareSettingsForm">
                                        <div class="form-group">
                                            <label for="baseFare">کرایه پایه (افغانی):</label>
                                            <input type="number" id="baseFare" class="form-input" min="0" value="50">
                                        </div>
                                        <div class="form-group">
                                            <label for="perKm">کرایه هر کیلومتر (افغانی):</label>
                                            <input type="number" id="perKm" class="form-input" min="0" value="25">
                                        </div>
                                        <div class="form-group">
                                            <label for="perMinute">کرایه هر دقیقه (افغانی):</label>
                                            <input type="number" id="perMinute" class="form-input" min="0" step="0.1" value="1.2">
                                        </div>
                                        <button type="submit" class="btn btn-primary">ذخیره تنظیمات</button>
                                    </form>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // حذف مودال قبلی
    const existingModal = document.getElementById('adminModal');
    if (existingModal) existingModal.remove();
    
    // اضافه کردن مودال جدید
    document.body.insertAdjacentHTML('beforeend', adminHTML);
    
    // بارگذاری داده‌ها
    loadAdminTrips();
    loadAdminDrivers();
    loadAdminAnalytics();
    
    // تنظیم رویداد فرم
    document.getElementById('fareSettingsForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveFareSettings();
    });
    
    // تنظیم رویداد تب‌ها
    document.querySelectorAll('#adminTabs .nav-link').forEach(tab => {
        tab.addEventListener('click', function(e) {
            e.preventDefault();
            
            // حذف کلاس active از همه تب‌ها
            document.querySelectorAll('#adminTabs .nav-link').forEach(t => {
                t.classList.remove('active');
            });
            
            // حذف کلاس active از همه محتواها
            document.querySelectorAll('.tab-pane').forEach(pane => {
                pane.classList.remove('show', 'active');
            });
            
            // اضافه کردن کلاس active به تب انتخاب شده
            this.classList.add('active');
            
            // نمایش محتوای مربوطه
            const target = this.getAttribute('data-bs-target');
            const pane = document.querySelector(target);
            if (pane) {
                pane.classList.add('show', 'active');
            }
        });
    });
}

function closeAdminPanel() {
    const modal = document.getElementById('adminModal');
    if (modal) {
        modal.style.animation = 'fadeOut 0.3s ease';
        setTimeout(() => modal.remove(), 300);
    }
}

async function loadAdminTrips() {
    try {
        const { data, error } = await supabase
            .from('trips')
            .select(`
                *,
                profiles:user_id(full_name, phone),
                drivers:driver_id(name, vehicle_plate)
            `)
            .order('created_at', { ascending: false })
            .limit(50);
        
        if (error) throw error;
        
        const container = document.getElementById('tripsTableContainer');
        if (!container) return;
        
        if (data.length === 0) {
            container.innerHTML = '<p class="text-center">هیچ سفری یافت نشد</p>';
            return;
        }
        
        let html = `
            <div class="table-responsive">
                <table class="table table-striped">
                    <thead>
                        <tr>
                            <th>شماره</th>
                            <th>کاربر</th>
                            <th>راننده</th>
                            <th>مبدا</th>
                            <th>مقصد</th>
                            <th>مبلغ</th>
                            <th>وضعیت</th>
                            <th>تاریخ</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        data.forEach(trip => {
            const statusColors = {
                'searching': 'warning',
                'driver_assigned': 'info',
                'started': 'primary',
                'completed': 'success',
                'cancelled': 'danger'
            };
            
            html += `
                <tr>
                    <td>${trip.id.slice(-6)}</td>
                    <td>${trip.profiles?.full_name || 'نامشخص'}</td>
                    <td>${trip.drivers?.name || 'تعیین نشده'}</td>
                    <td>${(trip.pickup_address || '').substring(0, 20)}...</td>
                    <td>${(trip.destination_address || '').substring(0, 20)}...</td>
                    <td>${formatPrice(trip.estimated_price || 0)}</td>
                    <td>
                        <span class="badge bg-${statusColors[trip.status] || 'secondary'}">
                            ${getStatusText(trip.status)}
                        </span>
                    </td>
                    <td>${new Date(trip.created_at).toLocaleDateString('fa-IR')}</td>
                </tr>
            `;
        });
        
        html += `
                    </tbody>
                </table>
            </div>
        `;
        
        container.innerHTML = html;
        
    } catch (error) {
        console.error('خطا در بارگذاری سفرها:', error);
        const container = document.getElementById('tripsTableContainer');
        if (container) {
            container.innerHTML = '<p class="text-center text-danger">خطا در بارگذاری</p>';
        }
    }
}

function getStatusText(status) {
    const statusMap = {
        'searching': 'در جستجو',
        'driver_assigned': 'راننده یافت شد',
        'started': 'شروع شده',
        'completed': 'تکمیل شده',
        'cancelled': 'لغو شده'
    };
    
    return statusMap[status] || status;
}

// توابع دیگر مربوط به پنل مدیریت...

// ==================== اضافه کردن استایل‌های اضافی ====================
const additionalStyles = `
    @keyframes slideOutRight {
        from {
            opacity: 1;
            transform: translateX(0);
        }
        to {
            opacity: 0;
            transform: translateX(100%);
        }
    }
    
    @keyframes fadeOut {
        from {
            opacity: 1;
        }
        to {
            opacity: 0;
        }
    }
    
    .badge {
        padding: 4px 8px;
        border-radius: 12px;
        font-size: 12px;
        font-weight: 600;
    }
    
    .bg-primary { background-color: var(--primary) !important; }
    .bg-secondary { background-color: var(--secondary) !important; }
    .bg-success { background-color: #10B981 !important; }
    .bg-danger { background-color: var(--accent) !important; }
    .bg-warning { background-color: #F59E0B !important; }
    .bg-info { background-color: #3B82F6 !important; }
    
    .table-responsive {
        overflow-x: auto;
    }
    
    .table {
        width: 100%;
        border-collapse: collapse;
    }
    
    .table th,
    .table td {
        padding: 12px;
        text-align: right;
        border-bottom: 1px solid var(--border);
    }
    
    .table th {
        background-color: var(--light);
        font-weight: 600;
    }
    
    .table-striped tbody tr:nth-of-type(odd) {
        background-color: rgba(0, 0, 0, 0.02);
    }
    
    .nav-tabs {
        border-bottom: 2px solid var(--border);
        display: flex;
        gap: 10px;
    }
    
    .nav-tabs .nav-link {
        padding: 10px 20px;
        border: none;
        background: none;
        color: var(--gray);
        cursor: pointer;
        font-weight: 500;
        position: relative;
    }
    
    .nav-tabs .nav-link.active {
        color: var(--primary);
    }
    
    .nav-tabs .nav-link.active::after {
        content: '';
        position: absolute;
        bottom: -2px;
        left: 0;
        right: 0;
        height: 2px;
        background: var(--primary);
    }
    
    .tab-content {
        padding-top: 20px;
    }
    
    .tab-pane {
        display: none;
    }
    
    .tab-pane.active {
        display: block;
    }
    
    .settings-section {
        padding: 20px;
        background: var(--light);
        border-radius: 10px;
        border: 1px solid var(--border);
    }
    
    .settings-section h5 {
        margin-bottom: 20px;
        color: var(--dark);
    }
    
    .warning-badge {
        background: #fff3cd;
        color: #856404;
        padding: 12px;
        border-radius: 8px;
        margin: 15px 0;
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 14px;
    }
    
    .warning-badge i {
        font-size: 16px;
    }
`;

// اضافه کردن استایل‌های اضافی به صفحه
const styleElement = document.createElement('style');
styleElement.textContent = additionalStyles;
document.head.appendChild(styleElement);

// ==================== رویدادهای window ====================
window.addEventListener('beforeunload', function() {
    // پاک‌سازی intervalها قبل از بسته شدن صفحه
    if (trackingInterval) {
        clearInterval(trackingInterval);
    }
});

window.addEventListener('online', function() {
    showNotification('اتصال اینترنت برقرار شد', 'success');
});

window.addEventListener('offline', function() {
    showNotification('اتصال اینترنت قطع شد', 'warning');
});

// ==================== شروع برنامه ====================
// این تابع زمانی که DOM کاملاً بارگذاری شد اجرا می‌شود
document.addEventListener('DOMContentLoaded', function() {
    // تأخیر برای اطمینان از بارگذاری کامل فونت‌ها و استایل‌ها
    setTimeout(() => {
        window.onload();
    }, 100);
});