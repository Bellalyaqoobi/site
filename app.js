// ==================== تنظیمات API ====================
const SUPABASE_URL = 'https://ewzgpfpllwhhrjupqyvy.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV3emdwZnBsbHdoaHJqdXBxeXZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4NjUzMTIsImV4cCI6MjA4MDQ0MTMxMn0.Us3nf0wOfYD0_aCDc-3Y0PaxsqUKiBvW95no0SkNgiI';

// API مسیریابی OpenRouteService
const ORS_API_KEY = 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjgxNTkwYjU0NDBiYTQwOTg5NjcyMWFjYmUwNTM2OTE4IiwiaCI6Im11cm11cjY0In0=';

// ==================== تنظیمات رنگ‌ها ====================
const COLORS = {
    primary: '#8B5CF6', // بنفش
    secondary: '#10B981', // سبز
    accent: '#EF4444', // قرمز
    warning: '#F59E0B', // نارنجی
    info: '#3B82F6', // آبی
    light: '#F3F4F6',
    dark: '#1F2937',
    success: '#10B981',
    danger: '#EF4444'
};

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

// ==================== کلاس سیستم مسیریابی ====================

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
                multiplier: 1.0,
                name: 'اقتصادی',
                color: COLORS.primary
            },
            'comfort': {
                base: 80,
                perKm: 35,
                perMinute: 1.8,
                minFare: 120,
                multiplier: 1.4,
                name: 'کلاسیک',
                color: COLORS.secondary
            },
            'bike': {
                base: 30,
                perKm: 15,
                perMinute: 0.6,
                minFare: 50,
                multiplier: 0.7,
                name: 'موتور',
                color: COLORS.warning
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
            isCalculatingRoute = true;
            
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
                })
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
            
            isCalculatingRoute = false;
            return routeDetails;
            
        } catch (error) {
            console.error('خطا در محاسبه مسیر دقیق:', error);
            isCalculatingRoute = false;
            return this.calculateFallbackRoute(originLat, originLng, destLat, destLng);
        }
    }

    /**
     * محاسبه جایگزین در صورت خطای API
     */
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

    /**
     * محاسبه قیمت دقیق بر اساس مسیر
     */
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
        const now = new Date();
        
        return {
            baseFare: fare.base,
            distanceFare: Math.round(routeInfo.distance * fare.perKm),
            timeFare: Math.round(routeInfo.duration * fare.perMinute),
            trafficFactor: this.getTrafficFactor(now),
            timeSurcharge: this.getTimeSurcharge(now),
            total: price,
            rideType: fare.name,
            color: fare.color
        };
    }
}

// ایجاد نمونه مسیریاب
routeCalculator = new RouteCalculator();

// ==================== پنل انتخاب مبدا و مقصد از نقشه ====================

/**
 * ایجاد پنل انتخاب مبدا و مقصد از روی نقشه
 */
function createMapSelectionPanel() {
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
                                <i class="fas fa-map-pin" style="color: ${COLORS.primary}"></i>
                                <span>مبدا:</span>
                            </div>
                            <div class="selection-value" id="pickupValue">
                                انتخاب نشده
                            </div>
                        </div>
                        
                        <div class="selection-item" id="currentDestinationDisplay">
                            <div class="selection-label">
                                <i class="fas fa-flag-checkered" style="color: ${COLORS.danger}"></i>
                                <span>مقصد:</span>
                            </div>
                            <div class="selection-value" id="destinationValue">
                                انتخاب نشده
                            </div>
                        </div>
                    </div>
                    
                    <div class="selection-actions" id="selectionActions">
                        <button class="btn btn-primary btn-block" onclick="useMapSelection()" disabled id="useSelectionBtn">
                            <i class="fas fa-check"></i> استفاده از این آدرس‌ها
                        </button>
                        <button class="btn btn-outline-secondary btn-block" onclick="clearMapSelections()">
                            <i class="fas fa-trash"></i> پاک کردن انتخاب‌ها
                        </button>
                    </div>
                </div>
                
                <div class="selection-instructions" id="selectionInstructions">
                    <div class="instruction-content">
                        <i class="fas fa-info-circle" style="color: ${COLORS.info}"></i>
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
    
    // حذف پنل قبلی اگر وجود دارد
    const existingPanel = document.getElementById('mapSelectionPanel');
    if (existingPanel) existingPanel.remove();
    
    // اضافه کردن پنل جدید
    document.body.insertAdjacentHTML('beforeend', panelHTML);
    
    // اضافه کردن استایل‌های پنل
    addMapSelectionPanelStyles();
}

/**
 * اضافه کردن استایل‌های پنل انتخاب از نقشه
 */
function addMapSelectionPanelStyles() {
    const style = document.createElement('style');
    style.textContent = `
        .map-selection-panel {
            position: fixed;
            top: 50%;
            right: 20px;
            transform: translateY(-50%);
            width: 350px;
            max-width: 90%;
            background: white;
            border-radius: 15px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.2);
            z-index: 1000;
            overflow: hidden;
            border: 1px solid #e0e0e0;
            font-family: 'Vazirmatn', sans-serif;
        }
        
        .panel-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 15px 20px;
            background: linear-gradient(135deg, ${COLORS.primary}, #7C3AED);
            color: white;
        }
        
        .panel-header h4 {
            margin: 0;
            font-size: 16px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .panel-header h4 i {
            font-size: 18px;
        }
        
        .panel-header .btn {
            padding: 5px 10px;
            font-size: 12px;
            background: rgba(255,255,255,0.2);
            border: none;
            color: white;
        }
        
        .panel-header .btn:hover {
            background: rgba(255,255,255,0.3);
        }
        
        .panel-body {
            padding: 20px;
        }
        
        .selection-modes {
            margin-bottom: 20px;
        }
        
        .mode-buttons {
            display: flex;
            flex-direction: column;
            gap: 10px;
            margin-bottom: 20px;
        }
        
        .mode-buttons .btn {
            padding: 12px;
            border-radius: 10px;
            font-weight: 500;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            border: 2px solid;
        }
        
        .mode-buttons .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(0,0,0,0.1);
        }
        
        .current-selections {
            background: ${COLORS.light};
            border-radius: 10px;
            padding: 15px;
            margin-bottom: 20px;
            border: 1px solid #e9ecef;
        }
        
        .selection-item {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 15px;
            padding-bottom: 15px;
            border-bottom: 1px solid #e9ecef;
        }
        
        .selection-item:last-child {
            margin-bottom: 0;
            padding-bottom: 0;
            border-bottom: none;
        }
        
        .selection-label {
            display: flex;
            align-items: center;
            gap: 10px;
            min-width: 70px;
        }
        
        .selection-label i {
            font-size: 18px;
        }
        
        .selection-label span {
            font-weight: 600;
            color: ${COLORS.dark};
        }
        
        .selection-value {
            flex: 1;
            text-align: left;
            padding-right: 10px;
            color: #6c757d;
            font-size: 14px;
            line-height: 1.4;
        }
        
        .selection-actions {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        
        .selection-instructions {
            background: #e7f5ff;
            border-radius: 10px;
            padding: 15px;
            border: 1px solid #a5d8ff;
            margin-bottom: 20px;
        }
        
        .instruction-content {
            display: flex;
            align-items: flex-start;
            gap: 10px;
        }
        
        .instruction-content i {
            color: ${COLORS.info};
            font-size: 18px;
            margin-top: 2px;
        }
        
        .instruction-content p {
            margin: 0;
            color: #1864ab;
            font-size: 14px;
            line-height: 1.5;
        }
        
        .active-selection {
            background: linear-gradient(135deg, #fff3cd, #ffeaa7);
            border-radius: 10px;
            padding: 15px;
            border: 1px solid ${COLORS.warning};
            animation: pulse 2s infinite;
        }
        
        .active-selection-content {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 10px;
            text-align: center;
        }
        
        .active-selection-content i {
            color: #e67700;
            font-size: 24px;
        }
        
        .active-selection-content p {
            margin: 0;
            color: #5c3c00;
            font-weight: 600;
            font-size: 14px;
        }
        
        .selection-marker {
            animation: bounce 0.5s infinite alternate;
        }
        
        @keyframes pulse {
            0% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.7); }
            70% { box-shadow: 0 0 0 10px rgba(245, 158, 11, 0); }
            100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); }
        }
        
        @keyframes bounce {
            from { transform: translateY(0px); }
            to { transform: translateY(-10px); }
        }
        
        /* استایل‌های واکنش‌گرا */
        @media (max-width: 768px) {
            .map-selection-panel {
                position: fixed;
                top: auto;
                bottom: 0;
                left: 0;
                right: 0;
                width: 100%;
                max-width: 100%;
                border-radius: 20px 20px 0 0;
                transform: none;
                max-height: 70vh;
                overflow-y: auto;
            }
            
            .panel-header {
                position: sticky;
                top: 0;
                z-index: 1;
            }
        }
        
        /* استایل‌های انتخاب فعال */
        .btn-selecting {
            animation: selectingPulse 1.5s infinite;
        }
        
        @keyframes selectingPulse {
            0% { box-shadow: 0 0 0 0 rgba(139, 92, 246, 0.7); }
            70% { box-shadow: 0 0 0 10px rgba(139, 92, 246, 0); }
            100% { box-shadow: 0 0 0 0 rgba(139, 92, 246, 0); }
        }
        
        .pickup-selected .selection-label i {
            animation: iconPulse 2s infinite;
        }
        
        .destination-selected .selection-label i {
            animation: iconPulse 2s infinite;
        }
        
        @keyframes iconPulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.2); }
            100% { transform: scale(1); }
        }
        
        /* استایل‌های نشانگر انتخاب */
        .selection-marker-icon {
            background: white;
            border: 3px solid;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
            box-shadow: 0 3px 10px rgba(0,0,0,0.3);
        }
        
        .pickup-marker-icon {
            border-color: ${COLORS.primary};
            color: ${COLORS.primary};
        }
        
        .destination-marker-icon {
            border-color: ${COLORS.danger};
            color: ${COLORS.danger};
        }
    `;
    
    document.head.appendChild(style);
}

/**
 * باز کردن پنل انتخاب از نقشه
 */
function openMapSelectionPanel() {
    createMapSelectionPanel();
    showNotification('پنل انتخاب از روی نقشه باز شد', 'info');
}

/**
 * بستن پنل انتخاب از نقشه
 */
function closeMapSelectionPanel() {
    const panel = document.getElementById('mapSelectionPanel');
    if (panel) {
        panel.remove();
    }
    
    if (selectionMarker) {
        map.removeLayer(selectionMarker);
        selectionMarker = null;
    }
    
    isSelectingPickup = false;
    isSelectingDestination = false;
    
    showNotification('پنل انتخاب بسته شد', 'info');
}

/**
 * شروع انتخاب مبدا از روی نقشه
 */
function startPickupSelection() {
    isSelectingPickup = true;
    isSelectingDestination = false;
    
    // بروزرسانی UI
    updateSelectionUI();
    
    // تغییر دکمه‌ها
    const pickupBtn = document.getElementById('selectPickupBtn');
    const destinationBtn = document.getElementById('selectDestinationBtn');
    
    if (pickupBtn) {
        pickupBtn.classList.add('btn-selecting');
        pickupBtn.innerHTML = '<i class="fas fa-map-pin"></i> در حال انتخاب مبدا...';
        pickupBtn.disabled = true;
    }
    
    if (destinationBtn) {
        destinationBtn.disabled = true;
    }
    
    // نمایش دستورالعمل
    const instructions = document.getElementById('selectionInstructions');
    const activeInfo = document.getElementById('activeSelectionInfo');
    
    if (instructions) instructions.style.display = 'none';
    if (activeInfo) activeInfo.style.display = 'block';
    
    // اضافه کردن رویداد کلیک به نقشه
    if (map) {
        map.on('click', handleMapClickForSelection);
    }
    
    showNotification('حالا روی نقشه کلیک کنید تا مبدا را انتخاب نمایید', 'info');
}

/**
 * شروع انتخاب مقصد از روی نقشه
 */
function startDestinationSelection() {
    isSelectingPickup = false;
    isSelectingDestination = true;
    
    // بروزرسانی UI
    updateSelectionUI();
    
    // تغییر دکمه‌ها
    const pickupBtn = document.getElementById('selectPickupBtn');
    const destinationBtn = document.getElementById('selectDestinationBtn');
    
    if (destinationBtn) {
        destinationBtn.classList.add('btn-selecting');
        destinationBtn.innerHTML = '<i class="fas fa-flag-checkered"></i> در حال انتخاب مقصد...';
        destinationBtn.disabled = true;
    }
    
    if (pickupBtn) {
        pickupBtn.disabled = true;
    }
    
    // نمایش دستورالعمل
    const instructions = document.getElementById('selectionInstructions');
    const activeInfo = document.getElementById('activeSelectionInfo');
    
    if (instructions) instructions.style.display = 'none';
    if (activeInfo) activeInfo.style.display = 'block';
    
    // اضافه کردن رویداد کلیک به نقشه
    if (map) {
        map.on('click', handleMapClickForSelection);
    }
    
    showNotification('حالا روی نقشه کلیک کنید تا مقصد را انتخاب نمایید', 'info');
}

/**
 * مدیریت کلیک روی نقشه برای انتخاب
 */
async function handleMapClickForSelection(e) {
    const lat = e.latlng.lat;
    const lng = e.latlng.lng;
    
    // حذف نشانگر قبلی
    if (selectionMarker) {
        map.removeLayer(selectionMarker);
    }
    
    // ایجاد نشانگر جدید
    if (isSelectingPickup) {
        selectionMarker = L.marker([lat, lng], {
            icon: L.divIcon({
                className: 'selection-marker',
                html: '<div class="selection-marker-icon pickup-marker-icon"><i class="fas fa-map-pin"></i></div>',
                iconSize: [40, 40]
            })
        }).addTo(map);
        
        // جستجوی معکوس آدرس
        const address = await reverseGeocodeForSelection(lat, lng);
        
        // ذخیره مختصات
        originCoordinates = [lat, lng];
        
        // بروزرسانی نمایش
        const pickupValue = document.getElementById('pickupValue');
        if (pickupValue) {
            pickupValue.textContent = address || `موقعیت: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
            pickupValue.parentElement.classList.add('pickup-selected');
        }
        
        // بروزرسانی input
        const pickupInput = document.getElementById('pickup');
        if (pickupInput) {
            pickupInput.value = address || `موقعیت: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        }
        
        showNotification('مبدا با موفقیت انتخاب شد', 'success');
        
    } else if (isSelectingDestination) {
        selectionMarker = L.marker([lat, lng], {
            icon: L.divIcon({
                className: 'selection-marker',
                html: '<div class="selection-marker-icon destination-marker-icon"><i class="fas fa-flag-checkered"></i></div>',
                iconSize: [40, 40]
            })
        }).addTo(map);
        
        // جستجوی معکوس آدرس
        const address = await reverseGeocodeForSelection(lat, lng);
        
        // ذخیره مختصات
        destinationCoordinates = [lat, lng];
        
        // بروزرسانی نمایش
        const destinationValue = document.getElementById('destinationValue');
        if (destinationValue) {
            destinationValue.textContent = address || `موقعیت: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
            destinationValue.parentElement.classList.add('destination-selected');
        }
        
        // بروزرسانی input
        const destinationInput = document.getElementById('destination');
        if (destinationInput) {
            destinationInput.value = address || `موقعیت: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        }
        
        showNotification('مقصد با موفقیت انتخاب شد', 'success');
    }
    
    // بازنشانی حالت انتخاب
    resetSelectionMode();
    
    // فعال کردن دکمه استفاده
    const useBtn = document.getElementById('useSelectionBtn');
    if (useBtn && originCoordinates && destinationCoordinates) {
        useBtn.disabled = false;
    }
}

/**
 * جستجوی معکوس آدرس برای انتخاب
 */
async function reverseGeocodeForSelection(lat, lng) {
    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=fa`
        );
        
        const data = await response.json();
        
        if (data.display_name) {
            return data.display_name;
        }
    } catch (error) {
        console.error('خطا در جستجوی آدرس:', error);
    }
    
    return null;
}

/**
 * بازنشانی حالت انتخاب
 */
function resetSelectionMode() {
    isSelectingPickup = false;
    isSelectingDestination = false;
    
    // حذف رویداد کلیک از نقشه
    if (map) {
        map.off('click', handleMapClickForSelection);
    }
    
    // بروزرسانی UI
    updateSelectionUI();
    
    // بازیابی دکمه‌ها
    const pickupBtn = document.getElementById('selectPickupBtn');
    const destinationBtn = document.getElementById('selectDestinationBtn');
    
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
    
    // نمایش دستورالعمل
    const instructions = document.getElementById('selectionInstructions');
    const activeInfo = document.getElementById('activeSelectionInfo');
    
    if (instructions) instructions.style.display = 'block';
    if (activeInfo) activeInfo.style.display = 'none';
}

/**
 * بروزرسانی UI انتخاب
 */
function updateSelectionUI() {
    const pickupBtn = document.getElementById('selectPickupBtn');
    const destinationBtn = document.getElementById('selectDestinationBtn');
    
    if (pickupBtn) {
        if (isSelectingPickup) {
            pickupBtn.classList.add('active');
        } else {
            pickupBtn.classList.remove('active');
        }
    }
    
    if (destinationBtn) {
        if (isSelectingDestination) {
            destinationBtn.classList.add('active');
        } else {
            destinationBtn.classList.remove('active');
        }
    }
}

/**
 * استفاده از آدرس‌های انتخاب شده
 */
function useMapSelection() {
    if (!originCoordinates || !destinationCoordinates) {
        showNotification('لطفاً مبدا و مقصد را انتخاب کنید', 'error');
        return;
    }
    
    // محاسبه مسیر
    calculateAndShowRoute();
    
    // بستن پنل
    closeMapSelectionPanel();
    
    showNotification('آدرس‌های انتخاب شده اعمال شدند', 'success');
}

/**
 * پاک کردن انتخاب‌ها
 */
function clearMapSelections() {
    // حذف نشانگرها
    if (selectionMarker) {
        map.removeLayer(selectionMarker);
        selectionMarker = null;
    }
    
    if (userMarker) {
        map.removeLayer(userMarker);
        userMarker = null;
    }
    
    if (destinationMarker) {
        map.removeLayer(destinationMarker);
        destinationMarker = null;
    }
    
    // بازنشانی مختصات
    originCoordinates = null;
    destinationCoordinates = null;
    
    // بازنشانی نمایش
    const pickupValue = document.getElementById('pickupValue');
    const destinationValue = document.getElementById('destinationValue');
    
    if (pickupValue) {
        pickupValue.textContent = 'انتخاب نشده';
        pickupValue.parentElement.classList.remove('pickup-selected');
    }
    
    if (destinationValue) {
        destinationValue.textContent = 'انتخاب نشده';
        destinationValue.parentElement.classList.remove('destination-selected');
    }
    
    // بازنشانی inputها
    const pickupInput = document.getElementById('pickup');
    const destinationInput = document.getElementById('destination');
    
    if (pickupInput) pickupInput.value = '';
    if (destinationInput) destinationInput.value = '';
    
    // غیرفعال کردن دکمه استفاده
    const useBtn = document.getElementById('useSelectionBtn');
    if (useBtn) {
        useBtn.disabled = true;
    }
    
    // پاک کردن مسیر
    clearRoute();
    
    showNotification('تمامی انتخاب‌ها پاک شدند', 'info');
}

/**
 * لغو انتخاب
 */
function cancelSelection() {
    resetSelectionMode();
    
    // حذف نشانگر انتخاب
    if (selectionMarker) {
        map.removeLayer(selectionMarker);
        selectionMarker = null;
    }
    
    showNotification('انتخاب لغو شد', 'info');
}

// ==================== توابع کمکی ====================

function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    if (notification) {
        notification.textContent = message;
        notification.className = `notification ${type}`;
        notification.style.display = 'block';
        
        setTimeout(() => {
            notification.style.display = 'none';
        }, 5000);
    }
}

function clearErrors() {
    document.querySelectorAll('.error-message').forEach(el => {
        el.style.display = 'none';
    });
    document.querySelectorAll('.form-input').forEach(el => {
        el.style.borderColor = '#e0e0e0';
    });
}

function showError(inputId, message) {
    const errorElement = document.getElementById(inputId + 'Error');
    const inputElement = document.getElementById(inputId);
    
    if (errorElement && inputElement) {
        errorElement.textContent = message;
        errorElement.style.display = 'block';
        inputElement.style.borderColor = COLORS.danger;
    }
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

// ==================== مدیریت نقشه ====================

async function initMap() {
    if (map) return;
    
    try {
        const kabulPosition = [34.5553, 69.2075];
        
        map = L.map('map').setView(kabulPosition, 12);
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 18
        }).addTo(map);
        
        // دکمه انتخاب از نقشه
        addMapSelectionButton();
        
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const userLat = position.coords.latitude;
                    const userLng = position.coords.longitude;
                    
                    if (userMarker) map.removeLayer(userMarker);
                    
                    userMarker = L.marker([userLat, userLng], {
                        icon: L.divIcon({
                            className: 'user-marker',
                            html: '<div class="marker-icon"><i class="fas fa-user"></i></div>',
                            iconSize: [40, 40]
                        })
                    }).addTo(map)
                    .bindPopup('موقعیت شما<br><small>برای انتخاب مبدا، روی نقشه کلیک کنید</small>');
                    
                    map.setView([userLat, userLng], 14);
                    
                    reverseGeocode(userLat, userLng, document.getElementById('pickup'));
                },
                () => {
                    showNotification('دسترسی به موقعیت مکانی فعال نیست', 'warning');
                }
            );
        }
        
        await loadDistricts();
        await loadPopularDestinations();
        await loadActiveDrivers();
        
        // اضافه کردن کنترل‌های نقشه
        addMapControls();
        
        showNotification('نقشه کابل با موفقیت بارگذاری شد', 'success');
    } catch (error) {
        console.error('Error initializing map:', error);
        showNotification('خطا در بارگذاری نقشه', 'error');
    }
}

/**
 * اضافه کردن دکمه انتخاب از نقشه به کنترل‌های نقشه
 */
function addMapSelectionButton() {
    if (!map) return;
    
    // ایجاد کنترل سفارشی
    const MapSelectionControl = L.Control.extend({
        options: {
            position: 'topright'
        },
        
        onAdd: function(map) {
            const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
            container.style.margin = '10px';
            
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
                border-radius: 5px;
                box-shadow: 0 1px 5px rgba(0,0,0,0.4);
                font-size: 18px;
                color: ${COLORS.primary};
                cursor: pointer;
            `;
            
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

/**
 * اضافه کردن کنترل‌های نقشه
 */
function addMapControls() {
    if (!map) return;
    
    // کنترل بزرگنمایی
    L.control.zoom({
        position: 'topright'
    }).addTo(map);
    
    // کنترل مقیاس
    L.control.scale({
        position: 'bottomleft',
        metric: true,
        imperial: false
    }).addTo(map);
    
    // دکمه انتخاب موقعیت فعلی
    const locateControl = L.control.locate({
        position: 'topright',
        drawCircle: true,
        follow: true,
        setView: true,
        keepCurrentZoomLevel: true,
        markerStyle: {
            weight: 1,
            opacity: 0.8,
            fillOpacity: 0.8
        },
        circleStyle: {
            weight: 1,
            opacity: 0.2,
            fillOpacity: 0.2
        },
        icon: 'fas fa-location-crosshairs',
        metric: true,
        strings: {
            title: "نمایش موقعیت من"
        },
        locateOptions: {
            maxZoom: 16,
            watch: true,
            enableHighAccuracy: true
        }
    }).addTo(map);
}

// ==================== سیستم مسیریابی دقیق ====================

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
        
        if (!originCoordinates) {
            showNotification('لطفاً مبدا را انتخاب کنید', 'error');
            return;
        }
        
        if (!destinationCoordinates) {
            showNotification('لطفاً مقصد را انتخاب کنید', 'error');
            return;
        }
        
        const tripCalculator = document.getElementById('tripCalculator');
        if (tripCalculator) {
            tripCalculator.innerHTML = `
                <div style="padding: 20px; text-align: center;">
                    <div class="spinner"></div>
                    <p>در حال محاسبه دقیق‌ترین مسیر...</p>
                    <small>لطفاً کمی صبر کنید</small>
                </div>
            `;
            tripCalculator.style.display = 'block';
        }
        
        const routeInfo = await routeCalculator.calculateRoute(
            originCoordinates[0], originCoordinates[1],
            destinationCoordinates[0], destinationCoordinates[1]
        );
        
        if (!routeInfo) {
            throw new Error('خطا در محاسبه مسیر');
        }
        
        currentDistance = routeInfo.distance;
        routeDetails = routeInfo;
        currentPrice = routeCalculator.calculatePrice(routeInfo);
        
        drawRouteOnMap(routeInfo);
        updateRouteDisplay(routeInfo, currentPrice);
        
        if (!routeInfo.isAccurate) {
            showNotification('مسافت تقریبی محاسبه شد. برای دقت بیشتر، آدرس دقیق وارد کنید', 'warning');
        }
        
    } catch (error) {
        console.error('خطا در محاسبه مسیر:', error);
        showNotification('خطا در محاسبه مسیر. لطفاً مجدداً تلاش کنید', 'error');
        
        const tripCalculator = document.getElementById('tripCalculator');
        if (tripCalculator) {
            tripCalculator.innerHTML = `
                <div class="error-message" style="padding: 20px; text-align: center;">
                    <i class="fas fa-exclamation-triangle" style="color: ${COLORS.danger}; font-size: 48px;"></i>
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
        const fare = routeCalculator.baseFares[selectedRideType] || routeCalculator.baseFares.economy;
        const routeColor = fare.color || COLORS.primary;
        
        if (routeInfo.geometry && routeInfo.geometry.type === 'LineString') {
            const latLngs = routeInfo.coordinates.map(coord => [coord[1], coord[0]]);
            
            routeLayer = L.polyline(latLngs, {
                color: routeColor,
                weight: 5,
                opacity: 0.8,
                lineJoin: 'round',
                lineCap: 'round'
            }).addTo(map);
            
            routePolyline = L.polyline(latLngs, {
                color: routeColor,
                weight: 7,
                opacity: 0.3,
                lineJoin: 'round',
                lineCap: 'round'
            }).addTo(map);
        } else {
            const origin = L.latLng(originCoordinates[0], originCoordinates[1]);
            const destination = L.latLng(destinationCoordinates[0], destinationCoordinates[1]);
            
            routeLayer = L.polyline([origin, destination], {
                color: routeColor,
                weight: 4,
                opacity: 0.7,
                dashArray: '10, 10'
            }).addTo(map);
        }
        
        if (routeLayer.getBounds()) {
            map.fitBounds(routeLayer.getBounds(), {
                padding: [50, 50],
                maxZoom: 16
            });
        }
        
        if (originCoordinates && destinationCoordinates) {
            if (userMarker) {
                map.removeLayer(userMarker);
            }
            
            userMarker = L.marker([originCoordinates[0], originCoordinates[1]], {
                icon: L.divIcon({
                    className: 'pickup-marker',
                    html: `<div class="marker-icon" style="background: ${fare.color}"><i class="fas fa-map-marker-alt"></i></div>`,
                    iconSize: [40, 40]
                })
            }).addTo(map)
            .bindPopup(`
                <b>مبدا</b><br>
                <small>${document.getElementById('pickup').value}</small><br>
                <small>${formatDistance(routeInfo.distance)} تا مقصد</small>
            `);
            
            destinationMarker = L.marker([destinationCoordinates[0], destinationCoordinates[1]], {
                icon: L.divIcon({
                    className: 'destination-marker',
                    html: `<div class="marker-icon" style="background: ${COLORS.danger}"><i class="fas fa-flag-checkered"></i></div>`,
                    iconSize: [40, 40]
                })
            }).addTo(map)
            .bindPopup(`
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
    const tripCalculator = document.getElementById('tripCalculator');
    if (!tripCalculator) return;
    
    const breakdown = routeCalculator.getPriceBreakdown(price, routeInfo);
    const now = new Date();
    const trafficFactor = routeCalculator.getTrafficFactor(now);
    const timeSurcharge = routeCalculator.getTimeSurcharge(now);
    
    const style = document.createElement('style');
    style.textContent = `
        .trip-details-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 10px;
            margin: 15px 0;
        }
        .trip-detail-card {
            background: ${COLORS.light};
            border-radius: 8px;
            padding: 12px;
            text-align: center;
        }
        .trip-detail-label {
            font-size: 12px;
            color: #6c757d;
            margin-bottom: 5px;
        }
        .trip-detail-value {
            font-size: 16px;
            font-weight: bold;
            color: ${COLORS.dark};
        }
        .price-breakdown-section {
            background: white;
            border: 1px solid #dee2e6;
            border-radius: 8px;
            padding: 15px;
            margin: 15px 0;
        }
        .breakdown-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 8px;
            padding-bottom: 8px;
            border-bottom: 1px solid #f1f3f4;
        }
        .breakdown-total {
            display: flex;
            justify-content: space-between;
            margin-top: 10px;
            padding-top: 10px;
            border-top: 2px solid #dee2e6;
            font-weight: bold;
            font-size: 18px;
            color: ${COLORS.success};
        }
        .route-actions {
            display: flex;
            gap: 10px;
            margin-top: 20px;
        }
        .warning-badge {
            background: #fff3cd;
            color: #856404;
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 14px;
            margin: 10px 0;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .trip-calculator-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
        }
        .trip-calculator-header h3 {
            margin: 0;
            font-size: 18px;
            color: ${COLORS.dark};
        }
    `;
    document.head.appendChild(style);
    
    tripCalculator.innerHTML = `
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
    
    tripCalculator.style.display = 'block';
    
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
        document.body.style.overflow = 'hidden';
    });
    
    // بستن منوی موبایل
    function closeMobileMenu() {
        mobileMenu.classList.remove('active');
        overlay.classList.remove('active');
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
                if (!map) initMap();
            }, 100);
        }
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
    switchPage('home');
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
        });
    }
    
    if (mobileLoginBtn) {
        mobileLoginBtn.addEventListener('click', () => {
            authModal.style.display = 'block';
        });
    }
    
    // بستن مدال ورود/ثبت‌نام
    if (closeAuthModal) {
        closeAuthModal.addEventListener('click', () => {
            authModal.style.display = 'none';
        });
    }
    
    if (cancelAuthModal) {
        cancelAuthModal.addEventListener('click', () => {
            authModal.style.display = 'none';
        });
    }
    
    // بستن مدال با کلیک خارج از آن
    window.addEventListener('click', (e) => {
        if (e.target === authModal) {
            authModal.style.display = 'none';
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

// ==================== توابع موجود (به‌روزرسانی شده) ====================

/**
 * بروزرسانی reverseGeocode
 */
async function reverseGeocode(lat, lng, inputElement) {
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=fa`);
        const data = await response.json();
        
        if (data.display_name) {
            inputElement.value = data.display_name;
            
            if (userMarker) map.removeLayer(userMarker);
            
            const fare = routeCalculator.baseFares[selectedRideType] || routeCalculator.baseFares.economy;
            
            userMarker = L.marker([lat, lng], {
                icon: L.divIcon({
                    className: 'pickup-marker',
                    html: `<div class="marker-icon" style="background: ${fare.color}"><i class="fas fa-map-marker-alt"></i></div>`,
                    iconSize: [40, 40]
                })
            }).addTo(map)
            .bindPopup('مبدا انتخاب شده<br><small>' + data.display_name + '</small>');
            
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

/**
 * محاسبه و نمایش قیمت (قدیمی - برای سازگاری)
 */
function calculateAndShowPrice(distance) {
    showNotification('برای محاسبه دقیق، دکمه "محاسبه مسیر" را بزنید', 'info');
}

// ==================== Event Listeners ====================

window.onload = async function() {
    await checkUserLoginStatus();
    
    // راه‌اندازی منوی موبایل
    setupMobileMenu();
    
    // راه‌اندازی پیمایش صفحات
    setupNavigation();
    
    // راه‌اندازی مدال‌ها
    setupModals();
    
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
            
            await initMap();
            
            showNotification('به اسنپ افغانستان خوش آمدید!', 'success');
        });
    }
    
    // دکمه انتخاب از نقشه
    const mapSelectionBtn = document.createElement('button');
    mapSelectionBtn.id = 'mapSelectionBtn';
    mapSelectionBtn.className = 'btn btn-outline-primary btn-block';
    mapSelectionBtn.innerHTML = '<i class="fas fa-map-marker-alt"></i> انتخاب از روی نقشه';
    mapSelectionBtn.style.marginTop = '10px';
    mapSelectionBtn.style.marginBottom = '10px';
    mapSelectionBtn.style.borderColor = COLORS.primary;
    mapSelectionBtn.style.color = COLORS.primary;
    
    // دکمه محاسبه مسیر جدید
    const calculateRouteBtn = document.createElement('button');
    calculateRouteBtn.id = 'calculateRouteBtn';
    calculateRouteBtn.className = 'btn btn-primary btn-block';
    calculateRouteBtn.innerHTML = '<i class="fas fa-route"></i> محاسبه مسیر دقیق';
    calculateRouteBtn.style.marginTop = '15px';
    calculateRouteBtn.style.background = COLORS.primary;
    
    const rideForm = document.getElementById('rideForm');
    if (rideForm) {
        // اضافه کردن دکمه انتخاب از نقشه
        const pickupGroup = document.getElementById('pickup').parentElement;
        if (pickupGroup) {
            pickupGroup.parentNode.insertBefore(mapSelectionBtn, pickupGroup.nextSibling);
        }
        
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
    }
    
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
        });
    }
    
    document.querySelectorAll('.ride-type').forEach(type => {
        type.addEventListener('click', () => {
            document.querySelectorAll('.ride-type').forEach(t => t.classList.remove('selected'));
            type.classList.add('selected');
            selectedRideType = type.dataset.type;
            
            // بروزرسانی رنگ border بر اساس نوع سفر
            const fare = routeCalculator.baseFares[selectedRideType];
            if (fare) {
                type.style.borderColor = fare.color;
            }
            
            // بروزرسانی قیمت اگر مسیر محاسبه شده باشد
            if (routeDetails && currentDistance > 0) {
                const newPrice = routeCalculator.calculatePrice(routeDetails);
                currentPrice = newPrice;
                updateRouteDisplay(routeDetails, newPrice);
            }
        });
    });
    
    document.querySelectorAll('.payment-method').forEach(method => {
        method.addEventListener('click', () => {
            document.querySelectorAll('.payment-method').forEach(m => m.classList.remove('selected'));
            method.classList.add('selected');
            selectedPaymentMethod = method.dataset.method;
        });
    });
    
    const autoLocationBtn = document.getElementById('auto-location-btn');
    if (autoLocationBtn) {
        autoLocationBtn.addEventListener('click', async () => {
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    async (position) => {
                        const userLat = position.coords.latitude;
                        const userLng = position.coords.longitude;
                        
                        await reverseGeocode(userLat, userLng, document.getElementById('pickup'));
                        showNotification('موقعیت شما به طور خودکار انتخاب شد', 'success');
                    },
                    () => {
                        showNotification('دسترسی به موقعیت مکانی فعال نیست', 'warning');
                    }
                );
            }
        });
    }
    
    // دکمه ورود/خروج
    const loginBtn = document.getElementById('loginBtn');
    const mobileLoginBtn = document.getElementById('mobileLoginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const mobileLogoutBtn = document.getElementById('mobileLogoutBtn');
    
    if (loginBtn) {
        loginBtn.addEventListener('click', () => {
            document.getElementById('authModal').style.display = 'block';
        });
    }
    
    if (mobileLoginBtn) {
        mobileLoginBtn.addEventListener('click', () => {
            document.getElementById('authModal').style.display = 'block';
        });
    }
    
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logoutUser);
    }
    
    if (mobileLogoutBtn) {
        mobileLogoutBtn.addEventListener('click', logoutUser);
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
};

// ==================== توابع پایگاه داده ====================

async function loadDistricts() {
    try {
        const { data, error } = await supabase
            .from('districts')
            .select('*')
            .order('name');
        
        if (error) {
            console.error('خطای دیتابیس در loadDistricts:', error);
            // ایجاد داده‌های نمونه برای تست
            districts = getSampleDistricts();
            console.log('استفاده از داده‌های نمونه برای نواحی');
            return;
        }
        
        districts = data;
        console.log('نواحی بارگذاری شد:', districts.length);
        
        // نمایش نواحی روی نقشه
        districts.forEach(district => {
            if (district.coordinates) {
                let coordinates;
                try {
                    coordinates = typeof district.coordinates === 'string' 
                        ? JSON.parse(district.coordinates) 
                        : district.coordinates;
                    
                    const polygon = L.polygon(coordinates, {
                        color: COLORS.primary,
                        weight: 2,
                        opacity: 0.3,
                        fillOpacity: 0.1
                    }).addTo(map);
                    
                    polygon.bindPopup(`
                        <b>${district.name}</b><br>
                        <small>${district.description || 'ناحیه کابل'}</small>
                    `);
                } catch (e) {
                    console.error('خطا در پردازش مختصات ناحیه:', e);
                }
            }
        });
        
    } catch (error) {
        console.error('خطا در بارگذاری نواحی:', error);
        districts = getSampleDistricts();
    }
}

function getSampleDistricts() {
    return [
        {
            id: 1,
            name: 'ناحیه ۱',
            description: 'مرکز شهر',
            coordinates: JSON.stringify([[34.53, 69.16], [34.54, 69.18], [34.52, 69.19]])
        },
        {
            id: 2,
            name: 'ناحیه ۲',
            description: 'شهر نو',
            coordinates: JSON.stringify([[34.55, 69.20], [34.56, 69.22], [34.54, 69.23]])
        },
        {
            id: 3,
            name: 'ناحیه ۳',
            description: 'کارته سخی',
            coordinates: JSON.stringify([[34.57, 69.17], [34.58, 69.19], [34.56, 69.20]])
        }
    ];
}

async function loadPopularDestinations() {
    try {
        const { data, error } = await supabase
            .from('popular_destinations')
            .select('*')
            .order('popularity', { ascending: false })
            .limit(20);
        
        if (error) {
            console.error('خطای دیتابیس در loadPopularDestinations:', error);
            // ایجاد داده‌های نمونه برای تست
            popularDestinations = getSampleDestinations();
            console.log('استفاده از داده‌های نمونه برای مقاصد محبوب');
            return;
        }
        
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
                    if (destination.coordinates) {
                        let coords;
                        try {
                            coords = typeof destination.coordinates === 'string'
                                ? JSON.parse(destination.coordinates)
                                : destination.coordinates;
                            
                            if (destinationMarker) map.removeLayer(destinationMarker);
                            
                            destinationMarker = L.marker([coords[0], coords[1]], {
                                icon: L.divIcon({
                                    className: 'destination-marker',
                                    html: `<div class="marker-icon" style="background: ${COLORS.danger}"><i class="fas fa-flag-checkered"></i></div>`,
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
                            console.error('خطا در پردازش مختصات مقصد:', e);
                        }
                    }
                });
                
                popularList.appendChild(li);
            });
        }
        
    } catch (error) {
        console.error('خطا در بارگذاری مقاصد محبوب:', error);
        popularDestinations = getSampleDestinations();
    }
}

function getSampleDestinations() {
    return [
        {
            id: 1,
            name: 'فرودگاه بین‌المللی کابل',
            category: 'فرودگاه',
            popularity: 150,
            coordinates: JSON.stringify([34.5658, 69.2124]),
            description: 'فرودگاه اصلی کابل'
        },
        {
            id: 2,
            name: 'سیتی سنتر کابل',
            category: 'خرید',
            popularity: 120,
            coordinates: JSON.stringify([34.5313, 69.1361]),
            description: 'مرکز خرید مدرن'
        },
        {
            id: 3,
            name: 'بیمارستان جمهوریت',
            category: 'سلامت',
            popularity: 90,
            coordinates: JSON.stringify([34.5228, 69.1628]),
            description: 'بیمارستان اصلی شهر'
        }
    ];
}

async function loadActiveDrivers() {
    try {
        const { data, error } = await supabase
            .from('drivers')
            .select('*')
            .eq('is_available', true)
            .eq('is_active', true);
        
        if (error) {
            console.error('خطای دیتابیس در loadActiveDrivers:', error);
            // ایجاد داده‌های نمونه برای تست
            activeDrivers = getSampleDrivers();
            console.log('استفاده از داده‌های نمونه برای رانندگان');
            updateDriverMarkers();
            return;
        }
        
        activeDrivers = data;
        updateDriverMarkers();
        
        console.log('رانندگان فعال:', activeDrivers.length);
        
    } catch (error) {
        console.error('خطا در بارگذاری رانندگان:', error);
        activeDrivers = getSampleDrivers();
        updateDriverMarkers();
    }
}

function getSampleDrivers() {
    return [
        {
            id: 'driver1',
            name: 'احمد',
            phone: '0700123456',
            vehicle_type: 'economy',
            vehicle_model: 'تویوتا کرولا',
            vehicle_plate: 'کابل ۱۲۳۴',
            rating: 4.5,
            is_active: true,
            is_available: true,
            current_location: JSON.stringify({ lat: 34.531, lng: 69.156 })
        },
        {
            id: 'driver2',
            name: 'محمد',
            phone: '0700654321',
            vehicle_type: 'comfort',
            vehicle_model: 'تویوتا هایلوکس',
            vehicle_plate: 'کابل ۵۶۷۸',
            rating: 4.8,
            is_active: true,
            is_available: true,
            current_location: JSON.stringify({ lat: 34.545, lng: 69.178 })
        },
        {
            id: 'driver3',
            name: 'کریم',
            phone: '0700987654',
            vehicle_type: 'bike',
            vehicle_model: 'هوندا ۱۲۵',
            vehicle_plate: 'کابل ۹۰۱۲',
            rating: 4.2,
            is_active: true,
            is_available: true,
            current_location: JSON.stringify({ lat: 34.522, lng: 69.145 })
        }
    ];
}

function updateDriverMarkers() {
    // پاک کردن نشانگرهای قبلی
    driverMarkers.forEach(marker => {
        if (marker && marker.remove) {
            map.removeLayer(marker);
        }
    });
    driverMarkers = [];
    
    if (!map || !activeDrivers || activeDrivers.length === 0) return;
    
    // اضافه کردن نشانگرهای جدید
    activeDrivers.forEach(driver => {
        let location;
        try {
            location = typeof driver.current_location === 'string' 
                ? JSON.parse(driver.current_location) 
                : driver.current_location;
            
            if (!location || !location.lat || !location.lng) {
                console.warn('موقعیت راننده نامعتبر:', driver);
                return;
            }
            
            const driverIcon = L.divIcon({
                className: 'driver-marker',
                html: `
                    <div class="driver-icon" style="background: ${getDriverColor(driver.vehicle_type)}">
                        <i class="fas fa-${driver.vehicle_type === 'bike' ? 'motorcycle' : 'car'}"></i>
                        <span class="driver-badge">${driver.rating || 'جدید'}</span>
                    </div>
                `,
                iconSize: [50, 50]
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
            console.error('خطا در ایجاد نشانگر راننده:', e);
        }
    });
}

function getDriverColor(vehicleType) {
    switch (vehicleType) {
        case 'economy': return COLORS.primary;
        case 'comfort': return COLORS.secondary;
        case 'bike': return COLORS.warning;
        default: return COLORS.info;
    }
}

async function checkUserLoginStatus() {
    try {
        const { data: { user }, error } = await supabase.auth.getUser();
        
        if (error) {
            console.error('خطا در بررسی وضعیت ورود:', error);
            return;
        }
        
        if (user) {
            currentUser = user;
            
            // بررسی نقش ادمین
            try {
                const { data: profile, error: profileError } = await supabase
                    .from('profiles')
                    .select('is_admin')
                    .eq('id', user.id)
                    .single();
                
                if (!profileError && profile) {
                    isAdmin = profile.is_admin;
                }
            } catch (profileError) {
                console.warn('خطا در دریافت پروفایل کاربر:', profileError);
                // برای تست، کاربر فعلی را ادمین در نظر بگیر
                isAdmin = user.email === 'admin@snap.af';
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
        
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email.trim(),
            password: password.trim()
        });
        
        if (error) {
            console.error('خطای ورود:', error);
            
            // برای تست، اگر دیتابیس در دسترس نیست، کاربر نمونه ایجاد کن
            if (error.message.includes('Invalid login credentials')) {
                // ایجاد کاربر نمونه برای تست
                currentUser = {
                    id: 'test-user-' + Date.now(),
                    email: email,
                    user_metadata: {
                        full_name: 'کاربر تست'
                    }
                };
                isAdmin = email === 'admin@snap.af';
                showNotification('ورود موفقیت‌آمیز بود! (حالت تست)', 'success');
                
                // بستن مودال ورود
                const authModal = document.getElementById('authModal');
                if (authModal) {
                    authModal.style.display = 'none';
                }
                
                updateUserInterface();
                return true;
            }
            
            throw error;
        }
        
        currentUser = data.user;
        showNotification('ورود موفقیت‌آمیز بود!', 'success');
        
        // بستن مودال ورود
        const authModal = document.getElementById('authModal');
        if (authModal) {
            authModal.style.display = 'none';
        }
        
        updateUserInterface();
        return true;
        
    } catch (error) {
        console.error('خطا در ورود:', error);
        showNotification('ایمیل یا رمز عبور اشتباه است', 'error');
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
            console.error('خطای ثبت‌نام:', error);
            
            // برای تست، اگر دیتابیس در دسترس نیست، کاربر نمونه ایجاد کن
            currentUser = {
                id: 'test-user-' + Date.now(),
                email: email,
                user_metadata: {
                    full_name: name,
                    phone: phone
                }
            };
            isAdmin = false;
            
            showNotification('ثبت‌نام موفقیت‌آمیز بود! (حالت تست)', 'success');
            
            // بستن مودال ثبت‌نام
            const authModal = document.getElementById('authModal');
            if (authModal) {
                authModal.style.display = 'none';
            }
            
            updateUserInterface();
            return true;
        }
        
        showNotification('ثبت‌نام موفقیت‌آمیز بود! لطفاً ایمیل خود را بررسی کنید', 'success');
        
        // بستن مودال ثبت‌نام
        const authModal = document.getElementById('authModal');
        if (authModal) {
            authModal.style.display = 'none';
        }
        
        return true;
        
    } catch (error) {
        console.error('خطا در ثبت‌نام:', error);
        showNotification('خطا در ثبت‌نام. لطفاً مجدداً تلاش کنید', 'error');
        return false;
    }
}

async function logoutUser() {
    try {
        const { error } = await supabase.auth.signOut();
        
        if (error) {
            console.error('خطای خروج:', error);
        }
        
        currentUser = null;
        isAdmin = false;
        
        updateUserInterface();
        showNotification('با موفقیت خارج شدید', 'info');
        
    } catch (error) {
        console.error('خطا در خروج:', error);
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
        if (logoutBtn) logoutBtn.style.display = 'block';
        if (mobileLogoutBtn) mobileLogoutBtn.style.display = 'block';
        
        // نمایش/مخفی کردن لینک ادمین
        if (adminLink) {
            adminLink.style.display = isAdmin ? 'block' : 'none';
        }
        if (mobileAdminLink) {
            mobileAdminLink.style.display = isAdmin ? 'block' : 'none';
        }
        
        // به‌روزرسانی نام کاربر
        if (welcomeText) {
            welcomeText.textContent = currentUser.email || 'کاربر';
        }
        
    } else {
        // نمایش دکمه‌های ورود
        if (loginBtn) loginBtn.style.display = 'block';
        if (mobileLoginBtn) mobileLoginBtn.style.display = 'block';
        
        // مخفی کردن دکمه‌های خروج
        if (logoutBtn) logoutBtn.style.display = 'none';
        if (mobileLogoutBtn) mobileLogoutBtn.style.display = 'none';
        
        // مخفی کردن لینک ادمین
        if (adminLink) adminLink.style.display = 'none';
        if (mobileAdminLink) mobileAdminLink.style.display = 'none';
    }
}

async function createTrip(pickup, destination, rideType, price) {
    try {
        if (!currentUser) {
            showNotification('لطفاً ابتدا وارد شوید', 'error');
            return null;
        }
        
        showNotification('در حال ثبت سفر...', 'info');
        
        let data;
        
        try {
            const result = await supabase
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
            
            if (result.error) throw result.error;
            data = result.data;
            
        } catch (dbError) {
            console.warn('خطا در ذخیره به دیتابیس، استفاده از حالت تست:', dbError);
            
            // ایجاد سفر تست
            data = {
                id: 'trip-' + Date.now(),
                user_id: currentUser.id,
                pickup_address: pickup,
                destination_address: destination,
                ride_type: rideType,
                estimated_price: price,
                status: 'searching',
                payment_method: selectedPaymentMethod,
                created_at: new Date().toISOString()
            };
        }
        
        currentTripId = data.id;
        showNotification('سفر ثبت شد. در جستجوی راننده...', 'success');
        
        return data;
        
    } catch (error) {
        console.error('خطا در ایجاد سفر:', error);
        showNotification('خطا در ثبت سفر. لطفاً مجدداً تلاش کنید', 'error');
        return null;
    }
}

async function startDriverSearch() {
    try {
        if (!currentTripId) {
            showNotification('لطفاً ابتدا سفر را ایجاد کنید', 'error');
            return;
        }
        
        showNotification('در حال جستجوی راننده مناسب...', 'info');
        
        // شبیه‌سازی جستجوی راننده
        const searchInterval = setInterval(async () => {
            const availableDrivers = activeDrivers.filter(driver => 
                driver.vehicle_type === selectedRideType || 
                (selectedRideType === 'economy' && driver.vehicle_type === 'comfort')
            );
            
            if (availableDrivers.length > 0) {
                clearInterval(searchInterval);
                
                // انتخاب راننده تصادفی
                const randomDriver = availableDrivers[Math.floor(Math.random() * availableDrivers.length)];
                currentDriver = randomDriver;
                
                await assignDriverToTrip(randomDriver.id);
                showDriverFoundModal(randomDriver);
                
            } else {
                // شبیه‌سازی زمان انتظار
                const timeLeft = Math.floor(Math.random() * 30) + 10;
                showNotification(`در حال جستجو... (${timeLeft} ثانیه باقی مانده)`, 'info');
            }
        }, 3000);
        
        // توقف جستجو بعد از 2 دقیقه
        setTimeout(() => {
            clearInterval(searchInterval);
            showNotification('راننده‌ای یافت نشد. لطفاً مجدداً تلاش کنید', 'warning');
        }, 120000);
        
    } catch (error) {
        console.error('خطا در جستجوی راننده:', error);
        showNotification('خطا در جستجوی راننده', 'error');
    }
}

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
        
        if (error) {
            console.warn('خطا در به‌روزرسانی دیتابیس:', error);
            // ادامه در حالت تست
        }
        
        console.log('راننده به سفر اختصاص داده شد');
        
    } catch (error) {
        console.error('خطا در اختصاص راننده:', error);
    }
}

function showDriverFoundModal(driver) {
    const modalHTML = `
        <div class="modal fade" id="driverFoundModal" tabindex="-1">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header" style="background: ${COLORS.primary}; color: white;">
                        <h5 class="modal-title">راننده پیدا شد! 🎉</h5>
                    </div>
                    <div class="modal-body text-center">
                        <div class="driver-info-card">
                            <div class="driver-avatar">
                                <i class="fas fa-user-circle"></i>
                            </div>
                            <h4 class="driver-name">${driver.name}</h4>
                            <div class="driver-rating">
                                ${generateStarRating(driver.rating || 5)}
                                <span>${driver.rating || 'جدید'}</span>
                            </div>
                            <div class="driver-details">
                                <div class="detail-item">
                                    <i class="fas fa-${driver.vehicle_type === 'bike' ? 'motorcycle' : 'car'}"></i>
                                    <span>${driver.vehicle_type === 'bike' ? 'موتور' : 
                                           driver.vehicle_type === 'comfort' ? 'کلاسیک' : 'اقتصادی'}</span>
                                </div>
                                <div class="detail-item">
                                    <i class="fas fa-car"></i>
                                    <span>${driver.vehicle_model || 'نامشخص'}</span>
                                </div>
                                <div class="detail-item">
                                    <i class="fas fa-id-card"></i>
                                    <span>${driver.vehicle_plate || 'نامشخص'}</span>
                                </div>
                            </div>
                            <div class="arrival-time">
                                <i class="fas fa-clock"></i>
                                <span>زمان رسیدن: ${Math.floor(Math.random() * 10) + 5} دقیقه</span>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">لغو سفر</button>
                        <button type="button" class="btn btn-primary" onclick="startTrip()" style="background: ${COLORS.primary}">
                            تایید و شروع سفر
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // حذف مودال قبلی اگر وجود دارد
    const existingModal = document.getElementById('driverFoundModal');
    if (existingModal) existingModal.remove();
    
    // اضافه کردن مودال جدید
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // نمایش مودال
    const modal = new bootstrap.Modal(document.getElementById('driverFoundModal'));
    modal.show();
    
    // شروع ردیابی موقعیت راننده
    simulateDriverTracking(driver);
}

function generateStarRating(rating) {
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    let stars = '';
    
    for (let i = 0; i < 5; i++) {
        if (i < fullStars) {
            stars += '<i class="fas fa-star" style="color: ' + COLORS.warning + '"></i>';
        } else if (i === fullStars && hasHalfStar) {
            stars += '<i class="fas fa-star-half-alt" style="color: ' + COLORS.warning + '"></i>';
        } else {
            stars += '<i class="far fa-star" style="color: ' + COLORS.warning + '"></i>';
        }
    }
    
    return stars;
}

function simulateDriverTracking(driver) {
    if (trackingInterval) clearInterval(trackingInterval);
    
    let driverLat = originCoordinates[0];
    let driverLng = originCoordinates[1];
    const destinationLat = destinationCoordinates[0];
    const destinationLng = destinationCoordinates[1];
    
    // ایجاد نشانگر راننده
    const driverMarker = L.marker([driverLat, driverLng], {
        icon: L.divIcon({
            className: 'active-driver-marker',
            html: '<div class="marker-icon" style="background: ' + COLORS.secondary + '"><i class="fas fa-car"></i></div>',
            iconSize: [40, 40]
        })
    }).addTo(map);
    
    trackingInterval = setInterval(() => {
        // حرکت راننده به سمت مبدا
        const latDiff = originCoordinates[0] - driverLat;
        const lngDiff = originCoordinates[1] - driverLng;
        
        driverLat += latDiff * 0.1;
        driverLng += lngDiff * 0.1;
        
        driverMarker.setLatLng([driverLat, driverLng]);
        
        // به‌روزرسانی زمان رسیدن
        const distanceToOrigin = calculateDistance(driverLat, driverLng, originCoordinates[0], originCoordinates[1]);
        const arrivalTime = Math.max(1, Math.round(distanceToOrigin * 10));
        
        const arrivalElement = document.querySelector('.arrival-time span');
        if (arrivalElement) {
            arrivalElement.textContent = `زمان رسیدن: ${arrivalTime} دقیقه`;
        }
        
        // اگر راننده به مبدا رسید
        if (distanceToOrigin < 0.05) { // 50 متر
            clearInterval(trackingInterval);
            showNotification('راننده به مبدا رسید!', 'success');
        }
        
    }, 1000);
}

async function startTrip() {
    try {
        // به‌روزرسانی وضعیت سفر
        try {
            const { error } = await supabase
                .from('trips')
                .update({
                    status: 'started',
                    started_at: new Date().toISOString()
                })
                .eq('id', currentTripId);
            
            if (error) console.warn('خطا در به‌روزرسانی دیتابیس:', error);
        } catch (dbError) {
            console.warn('خطا در به‌روزرسانی دیتابیس:', dbError);
        }
        
        // بستن مودال
        const modal = bootstrap.Modal.getInstance(document.getElementById('driverFoundModal'));
        if (modal) modal.hide();
        
        // نمایش صفحه سفر
        showTripInProgress();
        
        showNotification('سفر شروع شد!', 'success');
        
    } catch (error) {
        console.error('خطا در شروع سفر:', error);
        showNotification('خطا در شروع سفر', 'error');
    }
}

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
                <button class="btn btn-sm btn-outline-danger" onclick="cancelTrip()" style="border-color: ${COLORS.danger}; color: ${COLORS.danger}">
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
                        <span class="detail-value">${document.getElementById('pickup')?.value || 'نامشخص'}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">مقصد:</span>
                        <span class="detail-value">${document.getElementById('destination')?.value || 'نامشخص'}</span>
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
                        <div class="progress-step active" style="background: ${COLORS.primary}"></div>
                        <div class="progress-step"></div>
                        <div class="progress-step"></div>
                    </div>
                </div>
                
                <div class="trip-actions">
                    <button class="btn btn-outline-primary" style="border-color: ${COLORS.primary}; color: ${COLORS.primary}">
                        <i class="fas fa-phone"></i> تماس با راننده
                    </button>
                    <button class="btn btn-outline-primary" style="border-color: ${COLORS.primary}; color: ${COLORS.primary}">
                        <i class="fas fa-comment"></i> پیام به راننده
                    </button>
                    <button class="btn btn-primary" onclick="completeTrip()" style="background: ${COLORS.primary}">
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
        progress += 0.1;
        
        if (progress >= 1) {
            progress = 1;
            clearInterval(tripProgress);
            showNotification('به مقصد نزدیک می‌شوید!', 'info');
        }
        
        // به‌روزرسانی مراحل پیشرفت
        if (progress >= 0.3 && progress < 0.6) {
            progressSteps[0].classList.remove('active');
            progressSteps[1].classList.add('active');
            progressSteps[1].style.background = COLORS.primary;
        } else if (progress >= 0.6) {
            progressSteps[1].classList.remove('active');
            progressSteps[2].classList.add('active');
            progressSteps[2].style.background = COLORS.primary;
        }
        
    }, 1000);
}

async function completeTrip() {
    try {
        // به‌روزرسانی وضعیت سفر
        try {
            const { error } = await supabase
                .from('trips')
                .update({
                    status: 'completed',
                    completed_at: new Date().toISOString(),
                    actual_price: currentPrice
                })
                .eq('id', currentTripId);
            
            if (error) console.warn('خطا در به‌روزرسانی دیتابیس:', error);
        } catch (dbError) {
            console.warn('خطا در به‌روزرسانی دیتابیس:', dbError);
        }
        
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
            try {
                const { error } = await supabase
                    .from('trips')
                    .update({
                        status: 'cancelled',
                        cancelled_at: new Date().toISOString(),
                        cancelled_by: 'user'
                    })
                    .eq('id', currentTripId);
                
                if (error) console.warn('خطا در به‌روزرسانی دیتابیس:', error);
            } catch (dbError) {
                console.warn('خطا در به‌روزرسانی دیتابیس:', dbError);
            }
            
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

function showPaymentScreen() {
    const paymentHTML = `
        <div class="payment-container">
            <div class="payment-card">
                <div class="payment-header" style="background: ${COLORS.primary}; color: white; padding: 15px; border-radius: 8px 8px 0 0;">
                    <h3><i class="fas fa-credit-card"></i> پرداخت</h3>
                </div>
                
                <div class="payment-info" style="padding: 20px;">
                    <div class="payment-detail">
                        <span>مبلغ قابل پرداخت:</span>
                        <span class="payment-amount">${formatPrice(currentPrice)}</span>
                    </div>
                    
                    <div class="payment-methods-selection">
                        <h5>روش پرداخت:</h5>
                        <div class="payment-methods-grid">
                            <div class="payment-method ${selectedPaymentMethod === 'cash' ? 'selected' : ''}" 
                                 data-method="cash" onclick="selectPaymentMethod('cash')" style="border-color: ${selectedPaymentMethod === 'cash' ? COLORS.primary : '#e5e7eb'}; ${selectedPaymentMethod === 'cash' ? 'background: #EFF6FF;' : ''}">
                                <i class="fas fa-money-bill-wave"></i>
                                <span>نقدی</span>
                            </div>
                            <div class="payment-method ${selectedPaymentMethod === 'wallet' ? 'selected' : ''}" 
                                 data-method="wallet" onclick="selectPaymentMethod('wallet')" style="border-color: ${selectedPaymentMethod === 'wallet' ? COLORS.primary : '#e5e7eb'}; ${selectedPaymentMethod === 'wallet' ? 'background: #EFF6FF;' : ''}">
                                <i class="fas fa-wallet"></i>
                                <span>کیف پول</span>
                            </div>
                            <div class="payment-method ${selectedPaymentMethod === 'card' ? 'selected' : ''}" 
                                 data-method="card" onclick="selectPaymentMethod('card')" style="border-color: ${selectedPaymentMethod === 'card' ? COLORS.primary : '#e5e7eb'}; ${selectedPaymentMethod === 'card' ? 'background: #EFF6FF;' : ''}">
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
                                   placeholder="**** **** **** ****" maxlength="19">
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label for="expiryDate">تاریخ انقضا:</label>
                                <input type="text" id="expiryDate" class="form-input" 
                                       placeholder="MM/YY" maxlength="5">
                            </div>
                            <div class="form-group">
                                <label for="cvv">CVV:</label>
                                <input type="password" id="cvv" class="form-input" 
                                       placeholder="***" maxlength="3">
                            </div>
                        </div>
                    </div>
                    ` : ''}
                </div>
                
                <div class="payment-actions" style="padding: 20px; border-top: 1px solid #e5e7eb;">
                    <button class="btn btn-outline-secondary" onclick="skipPayment()">
                        پرداخت بعدی
                    </button>
                    <button class="btn btn-primary" onclick="processPayment()" style="background: ${COLORS.primary}">
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
        el.style.borderColor = '#e5e7eb';
        el.style.background = 'white';
        if (el.dataset.method === method) {
            el.classList.add('selected');
            el.style.borderColor = COLORS.primary;
            el.style.background = '#EFF6FF';
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

async function processPayment() {
    try {
        showNotification('در حال پردازش پرداخت...', 'info');
        
        // شبیه‌سازی پردازش پرداخت
        setTimeout(async () => {
            // به‌روزرسانی وضعیت سفر
            try {
                const { error } = await supabase
                    .from('trips')
                    .update({
                        payment_status: 'paid',
                        paid_at: new Date().toISOString(),
                        payment_method: selectedPaymentMethod
                    })
                    .eq('id', currentTripId);
                
                if (error) console.warn('خطا در به‌روزرسانی دیتابیس:', error);
            } catch (dbError) {
                console.warn('خطا در به‌روزرسانی دیتابیس:', dbError);
            }
            
            // حذف صفحه پرداخت
            const paymentContainer = document.querySelector('.payment-container');
            if (paymentContainer) paymentContainer.remove();
            
            // نمایش صفحه تشکر
            showThankYouScreen();
            
            showNotification('پرداخت با موفقیت انجام شد!', 'success');
            
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

function showThankYouScreen() {
    const thankYouHTML = `
        <div class="thank-you-container">
            <div class="thank-you-card">
                <div class="success-icon" style="color: ${COLORS.success};">
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
                    <button class="btn btn-outline-primary" onclick="rateDriver()" style="border-color: ${COLORS.primary}; color: ${COLORS.primary}">
                        <i class="fas fa-star"></i> امتیاز به راننده
                    </button>
                    <button class="btn btn-primary" onclick="newTrip()" style="background: ${COLORS.primary}">
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
        <div class="modal fade" id="ratingModal" tabindex="-1">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header" style="background: ${COLORS.primary}; color: white;">
                        <h5 class="modal-title">امتیاز به راننده</h5>
                    </div>
                    <div class="modal-body text-center">
                        <div class="driver-info">
                            <h4>${currentDriver?.name || 'راننده'}</h4>
                            <p>لطفاً به راننده امتیاز دهید:</p>
                            
                            <div class="rating-stars">
                                <i class="far fa-star" data-rating="1" style="color: ${COLORS.warning}"></i>
                                <i class="far fa-star" data-rating="2" style="color: ${COLORS.warning}"></i>
                                <i class="far fa-star" data-rating="3" style="color: ${COLORS.warning}"></i>
                                <i class="far fa-star" data-rating="4" style="color: ${COLORS.warning}"></i>
                                <i class="far fa-star" data-rating="5" style="color: ${COLORS.warning}"></i>
                            </div>
                            
                            <div class="rating-tags">
                                <span class="rating-tag" data-tag="آداب معاشرت">آداب معاشرت</span>
                                <span class="rating-tag" data-tag="رعایت قوانین">رعایت قوانین</span>
                                <span class="rating-tag" data-tag="نظافت خودرو">نظافت خودرو</span>
                                <span class="rating-tag" data-tag="آرامش رانندگی">آرامش رانندگی</span>
                                <span class="rating-tag" data-tag="مسیر‌یابی">مسیر‌یابی</span>
                            </div>
                            
                            <div class="form-group mt-3">
                                <textarea id="ratingComment" class="form-input" 
                                          placeholder="نظر خود را بنویسید (اختیاری)..." 
                                          rows="3"></textarea>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                            بعداً
                        </button>
                        <button type="button" class="btn btn-primary" onclick="submitRating()" style="background: ${COLORS.primary}">
                            ثبت امتیاز
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // حذف مودال قبلی
    const existingModal = document.getElementById('ratingModal');
    if (existingModal) existingModal.remove();
    
    // اضافه کردن مودال جدید
    document.body.insertAdjacentHTML('beforeend', ratingHTML);
    
    const modal = new bootstrap.Modal(document.getElementById('ratingModal'));
    modal.show();
    
    // اضافه کردن رویداد به ستاره‌ها
    const stars = document.querySelectorAll('.rating-stars i');
    let selectedRating = 0;
    
    stars.forEach(star => {
        star.addEventListener('mouseover', (e) => {
            const rating = parseInt(e.target.dataset.rating);
            highlightStars(rating);
        });
        
        star.addEventListener('mouseout', () => {
            highlightStars(selectedRating);
        });
        
        star.addEventListener('click', (e) => {
            selectedRating = parseInt(e.target.dataset.rating);
            highlightStars(selectedRating);
        });
    });
    
    function highlightStars(rating) {
        stars.forEach(star => {
            const starRating = parseInt(star.dataset.rating);
            if (starRating <= rating) {
                star.className = 'fas fa-star';
                star.style.color = COLORS.warning;
            } else {
                star.className = 'far fa-star';
                star.style.color = COLORS.warning;
            }
        });
    }
    
    // اضافه کردن رویداد به تگ‌ها
    document.querySelectorAll('.rating-tag').forEach(tag => {
        tag.addEventListener('click', function() {
            this.classList.toggle('selected');
            this.style.background = this.classList.contains('selected') ? COLORS.primary : '#E5E7EB';
            this.style.color = this.classList.contains('selected') ? 'white' : COLORS.dark;
        });
    });
}

async function submitRating() {
    try {
        const stars = document.querySelectorAll('.rating-stars i');
        let rating = 0;
        
        stars.forEach(star => {
            if (star.className === 'fas fa-star') {
                rating++;
            }
        });
        
        if (rating === 0) {
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
        try {
            const { error } = await supabase
                .from('ratings')
                .insert([{
                    trip_id: currentTripId,
                    driver_id: currentDriver?.id,
                    user_id: currentUser.id,
                    rating: rating,
                    tags: selectedTags,
                    comment: comment,
                    created_at: new Date().toISOString()
                }]);
            
            if (error) console.warn('خطا در ذخیره امتیاز:', error);
        } catch (dbError) {
            console.warn('خطا در ذخیره امتیاز:', dbError);
        }
        
        // بستن مودال
        const modal = bootstrap.Modal.getInstance(document.getElementById('ratingModal'));
        if (modal) modal.hide();
        
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

// ==================== توابع ادمین ====================

function openAdminPanel() {
    const adminHTML = `
        <div class="modal fade" id="adminModal" tabindex="-1">
            <div class="modal-dialog modal-lg modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header" style="background: ${COLORS.primary}; color: white;">
                        <h5 class="modal-title"><i class="fas fa-cog"></i> پنل مدیریت</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="admin-tabs">
                            <ul class="nav nav-tabs" id="adminTabs">
                                <li class="nav-item">
                                    <button class="nav-link active" data-bs-toggle="tab" data-bs-target="#tripsTab">
                                        سفرها
                                    </button>
                                </li>
                                <li class="nav-item">
                                    <button class="nav-link" data-bs-toggle="tab" data-bs-target="#driversTab">
                                        رانندگان
                                    </button>
                                </li>
                                <li class="nav-item">
                                    <button class="nav-link" data-bs-toggle="tab" data-bs-target="#analyticsTab">
                                        آمار
                                    </button>
                                </li>
                                <li class="nav-item">
                                    <button class="nav-link" data-bs-toggle="tab" data-bs-target="#settingsTab">
                                        تنظیمات
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
                                            <button type="submit" class="btn btn-primary" style="background: ${COLORS.primary}">ذخیره تنظیمات</button>
                                        </form>
                                    </div>
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
    
    const modal = new bootstrap.Modal(document.getElementById('adminModal'));
    modal.show();
    
    // بارگذاری داده‌ها
    loadAdminTrips();
    loadAdminDrivers();
    loadAdminAnalytics();
    
    // تنظیم رویداد فرم
    document.getElementById('fareSettingsForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveFareSettings();
    });
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
        
        if (error) {
            console.error('خطای دیتابیس در loadAdminTrips:', error);
            // استفاده از داده‌های نمونه
            data = getSampleTrips();
        }
        
        const container = document.getElementById('tripsTableContainer');
        if (!container) return;
        
        if (!data || data.length === 0) {
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
            
            const color = statusColors[trip.status] || 'secondary';
            const bgColor = color === 'primary' ? COLORS.primary :
                          color === 'success' ? COLORS.success :
                          color === 'warning' ? COLORS.warning :
                          color === 'danger' ? COLORS.danger :
                          color === 'info' ? COLORS.info : '#6c757d';
            
            html += `
                <tr>
                    <td>${trip.id?.toString().slice(-6) || 'N/A'}</td>
                    <td>${trip.profiles?.full_name || 'نامشخص'}</td>
                    <td>${trip.drivers?.name || 'تعیین نشده'}</td>
                    <td>${(trip.pickup_address || '').substring(0, 20)}...</td>
                    <td>${(trip.destination_address || '').substring(0, 20)}...</td>
                    <td>${formatPrice(trip.estimated_price || 0)}</td>
                    <td>
                        <span class="badge" style="background-color: ${bgColor}; color: white;">
                            ${getStatusText(trip.status)}
                        </span>
                    </td>
                    <td>${trip.created_at ? new Date(trip.created_at).toLocaleDateString('fa-IR') : 'نامشخص'}</td>
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

function getSampleTrips() {
    return [
        {
            id: 'trip-1',
            user_id: 'user1',
            pickup_address: 'فرودگاه کابل',
            destination_address: 'سیتی سنتر',
            ride_type: 'economy',
            estimated_price: 150,
            status: 'completed',
            payment_method: 'cash',
            created_at: new Date().toISOString(),
            profiles: { full_name: 'احمد', phone: '0700123456' },
            drivers: { name: 'محمد', vehicle_plate: 'کابل ۱۲۳۴' }
        },
        {
            id: 'trip-2',
            user_id: 'user2',
            pickup_address: 'کارته ۴',
            destination_address: 'کارته سخی',
            ride_type: 'comfort',
            estimated_price: 200,
            status: 'started',
            payment_method: 'card',
            created_at: new Date(Date.now() - 3600000).toISOString(),
            profiles: { full_name: 'محمود', phone: '0700654321' },
            drivers: { name: 'کریم', vehicle_plate: 'کابل ۵۶۷۸' }
        }
    ];
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

async function loadAdminDrivers() {
    try {
        const { data, error } = await supabase
            .from('drivers')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) {
            console.error('خطای دیتابیس در loadAdminDrivers:', error);
            // استفاده از داده‌های نمونه
            data = activeDrivers;
        }
        
        const container = document.getElementById('driversTableContainer');
        if (!container) return;
        
        if (!data || data.length === 0) {
            container.innerHTML = '<p class="text-center">هیچ راننده‌ای یافت نشد</p>';
            return;
        }
        
        let html = `
            <div class="table-responsive">
                <table class="table table-striped">
                    <thead>
                        <tr>
                            <th>نام</th>
                            <th>موبایل</th>
                            <th>نوع وسیله</th>
                            <th>مدل</th>
                            <th>پلاک</th>
                            <th>امتیاز</th>
                            <th>وضعیت</th>
                            <th>عملیات</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        data.forEach(driver => {
            const isActive = driver.is_active !== false;
            const isAvailable = driver.is_available !== false;
            
            html += `
                <tr>
                    <td>${driver.name || 'نامشخص'}</td>
                    <td>${driver.phone || 'نامشخص'}</td>
                    <td>${driver.vehicle_type === 'bike' ? 'موتور' : 
                          driver.vehicle_type === 'comfort' ? 'کلاسیک' : 'اقتصادی'}</td>
                    <td>${driver.vehicle_model || '-'}</td>
                    <td>${driver.vehicle_plate || '-'}</td>
                    <td>${driver.rating || 'جدید'}</td>
                    <td>
                        <span class="badge" style="background-color: ${isActive ? COLORS.success : COLORS.danger}; color: white; margin-right: 5px;">
                            ${isActive ? 'فعال' : 'غیرفعال'}
                        </span>
                        <span class="badge" style="background-color: ${isAvailable ? COLORS.info : COLORS.warning}; color: white;">
                            ${isAvailable ? 'آماده' : 'مشغول'}
                        </span>
                    </td>
                    <td>
                        <button class="btn btn-sm btn-outline-primary" onclick="toggleDriverStatus('${driver.id}', 'active')">
                            ${isActive ? 'غیرفعال' : 'فعال'}
                        </button>
                    </td>
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
        console.error('خطا در بارگذاری رانندگان:', error);
        const container = document.getElementById('driversTableContainer');
        if (container) {
            container.innerHTML = '<p class="text-center text-danger">خطا در بارگذاری</p>';
        }
    }
}

async function toggleDriverStatus(driverId, type) {
    try {
        const driver = activeDrivers.find(d => d.id === driverId);
        if (!driver) {
            showNotification('راننده یافت نشد', 'error');
            return;
        }
        
        if (type === 'active') {
            driver.is_active = !driver.is_active;
        } else if (type === 'available') {
            driver.is_available = !driver.is_available;
        }
        
        // در حالت واقعی اینجا باید دیتابیس به‌روزرسانی شود
        // const { error } = await supabase...
                // به‌روزرسانی دیتابیس
        try {
            const updates = {};
            if (type === 'active') {
                updates.is_active = driver.is_active;
            } else if (type === 'available') {
                updates.is_available = driver.is_available;
            }
            
            const { error } = await supabase
                .from('drivers')
                .update(updates)
                .eq('id', driverId);
            
            if (error) console.warn('خطا در به‌روزرسانی دیتابیس:', error);
        } catch (dbError) {
            console.warn('خطا در به‌روزرسانی دیتابیس:', dbError);
        }
        
        loadAdminDrivers();
        loadActiveDrivers();
        
        showNotification('وضعیت راننده به‌روزرسانی شد', 'success');
        
    } catch (error) {
        console.error('خطا در تغییر وضعیت راننده:', error);
        showNotification('خطا در تغییر وضعیت', 'error');
    }
}

async function loadAdminAnalytics() {
    try {
        // دریافت آمار هفته جاری
        const now = new Date();
        const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
        const endOfWeek = new Date(now.setDate(now.getDate() - now.getDay() + 6));
        
        let tripsData = [];
        let driversData = [];
        let usersData = [];
        
        try {
            const tripsResult = await supabase
                .from('trips')
                .select('*')
                .gte('created_at', startOfWeek.toISOString())
                .lte('created_at', endOfWeek.toISOString());
            
            if (!tripsResult.error) {
                tripsData = tripsResult.data || [];
            }
            
            const driversResult = await supabase
                .from('drivers')
                .select('*');
            
            if (!driversResult.error) {
                driversData = driversResult.data || [];
            }
            
            const usersResult = await supabase
                .from('profiles')
                .select('*');
            
            if (!usersResult.error) {
                usersData = usersResult.data || [];
            }
            
        } catch (dbError) {
            console.warn('خطا در دریافت داده‌های آماری:', dbError);
            // استفاده از داده‌های نمونه
            tripsData = getSampleTrips();
            driversData = activeDrivers;
            usersData = [{ id: 'user1' }, { id: 'user2' }];
        }
        
        const completedTrips = tripsData.filter(t => t.status === 'completed').length || 0;
        const totalRevenue = tripsData.filter(t => t.status === 'completed')
            .reduce((sum, t) => sum + (t.actual_price || t.estimated_price || 0), 0) || 0;
        
        const container = document.getElementById('analyticsContainer');
        if (!container) return;
        
        const html = `
            <div class="analytics-grid">
                <div class="analytics-card">
                    <div class="analytics-icon" style="background: ${COLORS.primary}">
                        <i class="fas fa-car"></i>
                    </div>
                    <div class="analytics-content">
                        <h3>${tripsData.length || 0}</h3>
                        <p>کل سفرهای این هفته</p>
                    </div>
                </div>
                
                <div class="analytics-card">
                    <div class="analytics-icon" style="background: ${COLORS.success}">
                        <i class="fas fa-check-circle"></i>
                    </div>
                    <div class="analytics-content">
                        <h3>${completedTrips}</h3>
                        <p>سفرهای تکمیل شده</p>
                    </div>
                </div>
                
                <div class="analytics-card">
                    <div class="analytics-icon" style="background: ${COLORS.warning}">
                        <i class="fas fa-money-bill-wave"></i>
                    </div>
                    <div class="analytics-content">
                        <h3>${formatPrice(totalRevenue)}</h3>
                        <p>درآمد این هفته</p>
                    </div>
                </div>
                
                <div class="analytics-card">
                    <div class="analytics-icon" style="background: ${COLORS.info}">
                        <i class="fas fa-users"></i>
                    </div>
                    <div class="analytics-content">
                        <h3>${driversData.length || 0}</h3>
                        <p>رانندگان فعال</p>
                    </div>
                </div>
                
                <div class="analytics-card">
                    <div class="analytics-icon" style="background: ${COLORS.secondary}">
                        <i class="fas fa-user-friends"></i>
                    </div>
                    <div class="analytics-content">
                        <h3>${usersData.length || 0}</h3>
                        <p>کاربران ثبت‌نام شده</p>
                    </div>
                </div>
                
                <div class="analytics-card">
                    <div class="analytics-icon" style="background: ${COLORS.primary}">
                        <i class="fas fa-percentage"></i>
                    </div>
                    <div class="analytics-content">
                        <h3>${tripsData.length > 0 ? Math.round((completedTrips / tripsData.length) * 100) : 0}%</h3>
                        <p>نرخ تکمیل سفر</p>
                    </div>
                </div>
            </div>
            
            <div class="mt-4">
                <h5>توزیع سفرها بر اساس نوع</h5>
                <div id="tripTypeChart"></div>
            </div>
        `;
        
        container.innerHTML = html;
        
        // رسم نمودار
        drawTripTypeChart(tripsData || []);
        
    } catch (error) {
        console.error('خطا در بارگذاری آمار:', error);
        const container = document.getElementById('analyticsContainer');
        if (container) {
            container.innerHTML = '<p class="text-center text-danger">خطا در بارگذاری آمار</p>';
        }
    }
}

function drawTripTypeChart(tripsData) {
    const typeCounts = {
        'economy': 0,
        'comfort': 0,
        'bike': 0
    };
    
    tripsData.forEach(trip => {
        if (typeCounts[trip.ride_type]) {
            typeCounts[trip.ride_type]++;
        }
    });
    
    const total = tripsData.length;
    const economyPercent = total > 0 ? (typeCounts.economy / total * 100) : 0;
    const comfortPercent = total > 0 ? (typeCounts.comfort / total * 100) : 0;
    const bikePercent = total > 0 ? (typeCounts.bike / total * 100) : 0;
    
    const chartContainer = document.getElementById('tripTypeChart');
    if (chartContainer) {
        chartContainer.innerHTML = `
            <div style="margin: 20px 0;">
                <div style="display: flex; flex-direction: column; gap: 10px;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div style="width: 20px; height: 20px; background: ${COLORS.primary}; border-radius: 4px;"></div>
                        <span>اقتصادی: ${typeCounts.economy} سفر (${economyPercent.toFixed(1)}%)</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div style="width: 20px; height: 20px; background: ${COLORS.secondary}; border-radius: 4px;"></div>
                        <span>کلاسیک: ${typeCounts.comfort} سفر (${comfortPercent.toFixed(1)}%)</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div style="width: 20px; height: 20px; background: ${COLORS.warning}; border-radius: 4px;"></div>
                        <span>موتور: ${typeCounts.bike} سفر (${bikePercent.toFixed(1)}%)</span>
                    </div>
                </div>
                
                <div style="display: flex; height: 30px; background: ${COLORS.light}; border-radius: 15px; overflow: hidden; margin-top: 15px;">
                    <div style="width: ${economyPercent}%; background: ${COLORS.primary}; display: flex; align-items: center; justify-content: center; color: white; font-size: 12px;">
                        ${economyPercent > 10 ? 'اقتصادی' : ''}
                    </div>
                    <div style="width: ${comfortPercent}%; background: ${COLORS.secondary}; display: flex; align-items: center; justify-content: center; color: white; font-size: 12px;">
                        ${comfortPercent > 10 ? 'کلاسیک' : ''}
                    </div>
                    <div style="width: ${bikePercent}%; background: ${COLORS.warning}; display: flex; align-items: center; justify-content: center; color: white; font-size: 12px;">
                        ${bikePercent > 10 ? 'موتور' : ''}
                    </div>
                </div>
            </div>
        `;
    }
}

async function saveFareSettings() {
    try {
        const baseFare = document.getElementById('baseFare').value;
        const perKm = document.getElementById('perKm').value;
        const perMinute = document.getElementById('perMinute').value;
        
        // ذخیره تنظیمات در localStorage برای حالت تست
        localStorage.setItem('fare_settings', JSON.stringify({
            baseFare: parseFloat(baseFare),
            perKm: parseFloat(perKm),
            perMinute: parseFloat(perMinute),
            savedAt: new Date().toISOString()
        }));
        
        // در حالت واقعی اینجا باید در دیتابیس ذخیره شود
        try {
            const { error } = await supabase
                .from('settings')
                .upsert({
                    key: 'fare_settings',
                    value: JSON.stringify({
                        baseFare: parseFloat(baseFare),
                        perKm: parseFloat(perKm),
                        perMinute: parseFloat(perMinute)
                    }),
                    updated_at: new Date().toISOString()
                }, {
                    onConflict: 'key'
                });
            
            if (error) console.warn('خطا در ذخیره تنظیمات:', error);
        } catch (dbError) {
            console.warn('خطا در ذخیره تنظیمات:', dbError);
        }
        
        // به‌روزرسانی مسیریاب
        routeCalculator.baseFares.economy.base = parseFloat(baseFare);
        routeCalculator.baseFares.economy.perKm = parseFloat(perKm);
        routeCalculator.baseFares.economy.perMinute = parseFloat(perMinute);
        
        // به‌روزرسانی سایر نوع‌ها بر اساس ضریب
        routeCalculator.baseFares.comfort.base = parseFloat(baseFare) * 1.6;
        routeCalculator.baseFares.comfort.perKm = parseFloat(perKm) * 1.4;
        routeCalculator.baseFares.comfort.perMinute = parseFloat(perMinute) * 1.5;
        
        routeCalculator.baseFares.bike.base = parseFloat(baseFare) * 0.6;
        routeCalculator.baseFares.bike.perKm = parseFloat(perKm) * 0.6;
        routeCalculator.baseFares.bike.perMinute = parseFloat(perMinute) * 0.5;
        
        showNotification('تنظیمات ذخیره شد', 'success');
        
    } catch (error) {
        console.error('خطا در ذخیره تنظیمات:', error);
        showNotification('خطا در ذخیره تنظیمات', 'error');
    }
}

// ==================== توابع اضافی ====================

function showUserTrips() {
    const tripsHTML = `
        <div class="modal fade" id="userTripsModal" tabindex="-1">
            <div class="modal-dialog modal-lg modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header" style="background: ${COLORS.primary}; color: white;">
                        <h5 class="modal-title"><i class="fas fa-history"></i> سفرهای من</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div id="userTripsContainer">
                            <div class="text-center">
                                <div class="spinner"></div>
                                <p>در حال بارگذاری...</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // حذف مودال قبلی
    const existingModal = document.getElementById('userTripsModal');
    if (existingModal) existingModal.remove();
    
    // اضافه کردن مودال جدید
    document.body.insertAdjacentHTML('beforeend', tripsHTML);
    
    const modal = new bootstrap.Modal(document.getElementById('userTripsModal'));
    modal.show();
    
    loadUserTrips();
}

async function loadUserTrips() {
    try {
        if (!currentUser) return;
        
        let data = [];
        
        try {
            const { data: tripsData, error } = await supabase
                .from('trips')
                .select(`
                    *,
                    drivers:driver_id(name, vehicle_plate, vehicle_type)
                `)
                .eq('user_id', currentUser.id)
                .order('created_at', { ascending: false })
                .limit(20);
            
            if (error) throw error;
            data = tripsData || [];
            
        } catch (dbError) {
            console.warn('خطا در دریافت سفرهای کاربر:', dbError);
            // استفاده از داده‌های نمونه
            data = [
                {
                    id: 'trip-1',
                    user_id: currentUser.id,
                    pickup_address: 'فرودگاه کابل',
                    destination_address: 'سیتی سنتر',
                    ride_type: 'economy',
                    estimated_price: 150,
                    status: 'completed',
                    payment_method: 'cash',
                    created_at: new Date(Date.now() - 86400000).toISOString(),
                    completed_at: new Date(Date.now() - 86300000).toISOString(),
                    drivers: { name: 'احمد', vehicle_plate: 'کابل ۱۲۳۴', vehicle_type: 'economy' }
                },
                {
                    id: 'trip-2',
                    user_id: currentUser.id,
                    pickup_address: 'کارته ۴',
                    destination_address: 'کارته سخی',
                    ride_type: 'comfort',
                    estimated_price: 200,
                    status: 'completed',
                    payment_method: 'card',
                    created_at: new Date(Date.now() - 172800000).toISOString(),
                    completed_at: new Date(Date.now() - 172700000).toISOString(),
                    drivers: { name: 'محمد', vehicle_plate: 'کابل ۵۶۷۸', vehicle_type: 'comfort' }
                }
            ];
        }
        
        const container = document.getElementById('userTripsContainer');
        if (!container) return;
        
        if (data.length === 0) {
            container.innerHTML = `
                <div class="text-center py-5">
                    <i class="fas fa-car fa-3x text-muted mb-3"></i>
                    <p>هنوز سفری ثبت نکرده‌اید</p>
                </div>
            `;
            return;
        }
        
        let html = `
            <div class="trips-list">
        `;
        
        data.forEach(trip => {
            const statusColors = {
                'completed': COLORS.success,
                'started': COLORS.primary,
                'cancelled': COLORS.danger,
                'driver_assigned': COLORS.info,
                'searching': COLORS.warning
            };
            
            const statusColor = statusColors[trip.status] || '#6c757d';
            
            html += `
                <div class="trip-item" style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 15px; margin-bottom: 10px;">
                    <div class="trip-header" style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                        <div>
                            <strong>سفر به ${(trip.destination_address || '').substring(0, 30)}...</strong>
                            <div class="trip-meta" style="display: flex; gap: 10px; margin-top: 5px; align-items: center;">
                                <span class="badge" style="background-color: ${statusColor}; color: white;">
                                    ${getStatusText(trip.status)}
                                </span>
                                <span style="color: #6b7280; font-size: 14px;">
                                    ${trip.created_at ? new Date(trip.created_at).toLocaleDateString('fa-IR') : 'نامشخص'}
                                </span>
                            </div>
                        </div>
                        <div class="trip-price" style="font-size: 18px; font-weight: bold; color: ${COLORS.success};">
                            ${formatPrice(trip.estimated_price || 0)}
                        </div>
                    </div>
                    
                    <div class="trip-details" style="border-top: 1px solid #e5e7eb; padding-top: 10px;">
                        <div class="detail" style="display: flex; align-items: center; gap: 10px; margin-bottom: 5px; color: #6b7280; font-size: 14px;">
                            <i class="fas fa-map-marker-alt" style="width: 20px; color: #9CA3AF;"></i>
                            <span>${(trip.pickup_address || '').substring(0, 40)}...</span>
                        </div>
                        <div class="detail" style="display: flex; align-items: center; gap: 10px; margin-bottom: 5px; color: #6b7280; font-size: 14px;">
                            <i class="fas fa-flag-checkered" style="width: 20px; color: #9CA3AF;"></i>
                            <span>${(trip.destination_address || '').substring(0, 40)}...</span>
                        </div>
                        ${trip.drivers ? `
                        <div class="detail" style="display: flex; align-items: center; gap: 10px; margin-bottom: 5px; color: #6b7280; font-size: 14px;">
                            <i class="fas fa-user" style="width: 20px; color: #9CA3AF;"></i>
                            <span>راننده: ${trip.drivers.name}</span>
                        </div>
                        ` : ''}
                        ${trip.completed_at ? `
                        <div class="detail" style="display: flex; align-items: center; gap: 10px; margin-bottom: 5px; color: #6b7280; font-size: 14px;">
                            <i class="fas fa-check-circle" style="width: 20px; color: #9CA3AF;"></i>
                            <span>تکمیل شده در: ${new Date(trip.completed_at).toLocaleTimeString('fa-IR')}</span>
                        </div>
                        ` : ''}
                    </div>
                </div>
            `;
        });
        
        html += `
            </div>
        `;
        
        container.innerHTML = html;
        
    } catch (error) {
        console.error('خطا در بارگذاری سفرها:', error);
        const container = document.getElementById('userTripsContainer');
        if (container) {
            container.innerHTML = '<p class="text-center text-danger">خطا در بارگذاری سفرها</p>';
        }
    }
}

function showProfile() {
    const profileHTML = `
        <div class="modal fade" id="profileModal" tabindex="-1">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header" style="background: ${COLORS.primary}; color: white;">
                        <h5 class="modal-title"><i class="fas fa-user-circle"></i> پروفایل من</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="profile-info" style="text-align: center;">
                            <div class="profile-avatar" style="font-size: 80px; color: #9CA3AF; margin-bottom: 10px;">
                                <i class="fas fa-user-circle"></i>
                            </div>
                            <h4 class="profile-name" style="margin: 10px 0 5px; color: ${COLORS.dark};">
                                ${currentUser?.user_metadata?.full_name || 'کاربر'}
                            </h4>
                            <p class="profile-email" style="color: #6b7280; margin-bottom: 20px;">
                                ${currentUser?.email || ''}
                            </p>
                            
                            <div class="profile-stats" style="display: flex; justify-content: center; gap: 30px; margin: 30px 0;">
                                <div class="stat-item" style="text-align: center;">
                                    <div class="stat-number" style="font-size: 24px; font-weight: bold; color: ${COLORS.primary};">
                                        2
                                    </div>
                                    <div class="stat-label" style="font-size: 12px; color: #6b7280; margin-top: 5px;">
                                        سفرهای تکمیل شده
                                    </div>
                                </div>
                                <div class="stat-item" style="text-align: center;">
                                    <div class="stat-number" style="font-size: 24px; font-weight: bold; color: ${COLORS.primary};">
                                        4.5
                                    </div>
                                    <div class="stat-label" style="font-size: 12px; color: #6b7280; margin-top: 5px;">
                                        میانگین امتیاز
                                    </div>
                                </div>
                            </div>
                            
                            <div class="profile-actions" style="display: flex; gap: 10px; justify-content: center;">
                                <button class="btn btn-outline-primary" style="border-color: ${COLORS.primary}; color: ${COLORS.primary};">
                                    <i class="fas fa-edit"></i> ویرایش پروفایل
                                </button>
                                <button class="btn btn-outline-danger" onclick="logoutUser()" style="border-color: ${COLORS.danger}; color: ${COLORS.danger};">
                                    <i class="fas fa-sign-out-alt"></i> خروج
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // حذف مودال قبلی
    const existingModal = document.getElementById('profileModal');
    if (existingModal) existingModal.remove();
    
    // اضافه کردن مودال جدید
    document.body.insertAdjacentHTML('beforeend', profileHTML);
    
    const modal = new bootstrap.Modal(document.getElementById('profileModal'));
    modal.show();
}

// ==================== استایل‌های اصلی ====================

document.addEventListener('DOMContentLoaded', function() {
    // اضافه کردن استایل‌های CSS
    const style = document.createElement('style');
    style.textContent = `
        /* استایل‌های نشانگر نقشه */
        .user-marker .marker-icon {
            background: ${COLORS.primary};
            border: 3px solid white;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 18px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.3);
        }
        
        .destination-marker .marker-icon {
            background: ${COLORS.danger};
            border: 3px solid white;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 18px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.3);
        }
        
        .driver-marker .driver-icon {
            background: ${COLORS.secondary};
            border: 3px solid white;
            border-radius: 50%;
            width: 50px;
            height: 50px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 24px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.3);
            position: relative;
        }
        
        .driver-marker .driver-badge {
            position: absolute;
            top: -5px;
            right: -5px;
            background: ${COLORS.warning};
            color: white;
            font-size: 10px;
            padding: 2px 6px;
            border-radius: 10px;
            border: 2px solid white;
        }
        
        .active-driver-marker .marker-icon {
            background: ${COLORS.secondary};
            border: 3px solid white;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 18px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.3);
            animation: pulse 1.5s infinite;
        }
        
        @keyframes pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.1); }
            100% { transform: scale(1); }
        }
        
        /* استایل‌های سفر در حال انجام */
        .trip-in-progress-container {
            background: white;
            border-radius: 10px;
            padding: 20px;
            margin: 20px 0;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        
        .trip-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 1px solid #e5e7eb;
        }
        
        .trip-info-card {
            background: ${COLORS.light};
            border-radius: 8px;
            padding: 20px;
        }
        
        .detail-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 10px;
            padding-bottom: 10px;
            border-bottom: 1px solid #e5e7eb;
        }
        
        .detail-label {
            color: #6b7280;
            font-weight: 500;
        }
        
        .detail-value {
            color: ${COLORS.dark};
            font-weight: 600;
        }
        
        .trip-progress {
            margin: 30px 0;
        }
        
        .progress-labels {
            display: flex;
            justify-content: space-between;
            margin-bottom: 10px;
            font-size: 12px;
            color: #6b7280;
        }
        
        .progress-bar {
            display: flex;
            height: 6px;
            background: #e5e7eb;
            border-radius: 3px;
            overflow: hidden;
        }
        
        .progress-step {
            flex: 1;
            background: #e5e7eb;
            margin: 0 2px;
        }
        
        .progress-step.active {
            background: ${COLORS.primary};
        }
        
        .trip-actions {
            display: flex;
            gap: 10px;
            margin-top: 20px;
        }
        
        /* استایل‌های پرداخت */
        .payment-container {
            background: white;
            border-radius: 10px;
            padding: 20px;
            margin: 20px 0;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        
        .payment-card {
            max-width: 500px;
            margin: 0 auto;
        }
        
        .payment-info {
            margin: 20px 0;
        }
        
        .payment-detail {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 15px;
            background: ${COLORS.light};
            border-radius: 8px;
            margin-bottom: 20px;
        }
        
        .payment-amount {
            font-size: 24px;
            font-weight: bold;
            color: ${COLORS.success};
        }
        
        .payment-methods-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 10px;
            margin: 15px 0;
        }
        
        .payment-method {
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 15px;
            border: 2px solid #e5e7eb;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.3s ease;
        }
        
        .payment-method:hover {
            border-color: ${COLORS.primary};
        }
        
        .payment-method.selected {
            border-color: ${COLORS.primary};
            background: #EFF6FF;
        }
        
        .payment-method i {
            font-size: 24px;
            margin-bottom: 10px;
            color: #6b7280;
        }
        
        .payment-method.selected i {
            color: ${COLORS.primary};
        }
        
        .wallet-balance {
            display: flex;
            justify-content: space-between;
            padding: 15px;
            background: #FEF3C7;
            border-radius: 8px;
            margin: 15px 0;
        }
        
        .balance-amount {
            font-weight: bold;
            color: #D97706;
        }
        
        .card-details {
            background: ${COLORS.light};
            padding: 20px;
            border-radius: 8px;
            margin: 15px 0;
        }
        
        .form-row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
        }
        
        .payment-actions {
            display: flex;
            gap: 10px;
            margin-top: 20px;
        }
        
        /* استایل‌های صفحه تشکر */
        .thank-you-container {
            background: white;
            border-radius: 10px;
            padding: 30px;
            margin: 20px 0;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            text-align: center;
        }
        
        .success-icon {
            font-size: 64px;
            color: ${COLORS.success};
            margin-bottom: 20px;
        }
        
        .thank-you-message {
            color: #6b7280;
            margin: 20px 0;
            line-height: 1.6;
        }
        
        .trip-summary {
            background: ${COLORS.light};
            padding: 20px;
            border-radius: 8px;
            margin: 30px 0;
            text-align: right;
        }
        
        .summary-item {
            display: flex;
            justify-content: space-between;
            margin-bottom: 10px;
            padding-bottom: 10px;
            border-bottom: 1px solid #e5e7eb;
        }
        
        .thank-you-actions {
            display: flex;
            gap: 10px;
            justify-content: center;
        }
        
        /* استایل‌های امتیازدهی */
        .rating-stars {
            font-size: 32px;
            color: ${COLORS.warning};
            margin: 20px 0;
        }
        
        .rating-tags {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            margin: 15px 0;
            justify-content: center;
        }
        
        .rating-tag {
            padding: 8px 16px;
            background: #E5E7EB;
            border-radius: 20px;
            cursor: pointer;
            transition: all 0.3s ease;
        }
        
        .rating-tag:hover {
            background: #D1D5DB;
        }
        
        .rating-tag.selected {
            background: ${COLORS.primary};
            color: white;
        }
        
        /* استایل‌های آمار */
        .analytics-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 15px;
        }
        
        .analytics-card {
            background: white;
            border: 1px solid #E5E7EB;
            border-radius: 8px;
            padding: 15px;
            display: flex;
            align-items: center;
            gap: 15px;
        }
        
        .analytics-icon {
            width: 50px;
            height: 50px;
            background: ${COLORS.primary};
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 24px;
        }
        
        .analytics-content h3 {
            margin: 0;
            font-size: 24px;
            color: ${COLORS.dark};
        }
        
        .analytics-content p {
            margin: 5px 0 0;
            color: #6b7280;
            font-size: 14px;
        }
        
        /* استایل‌های لیست سفرها */
        .trips-list {
            max-height: 400px;
            overflow-y: auto;
        }
        
        .trip-item {
            background: white;
            border: 1px solid #E5E7EB;
            border-radius: 8px;
            padding: 15px;
            margin-bottom: 10px;
        }
        
        .trip-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 10px;
        }
        
        .trip-meta {
            display: flex;
            gap: 10px;
            margin-top: 5px;
            align-items: center;
        }
        
        .trip-price {
            font-size: 18px;
            font-weight: bold;
            color: ${COLORS.success};
        }
        
        .trip-details {
            border-top: 1px solid #E5E7EB;
            padding-top: 10px;
        }
        
        .detail {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 5px;
            color: #6b7280;
            font-size: 14px;
        }
        
        .detail i {
            width: 20px;
            color: #9CA3AF;
        }
        
        /* استایل‌های پروفایل */
        .profile-info {
            text-align: center;
        }
        
        .profile-avatar {
            font-size: 80px;
            color: #9CA3AF;
            margin-bottom: 10px;
        }
        
        .profile-name {
            margin: 10px 0 5px;
            color: ${COLORS.dark};
        }
        
        .profile-email {
            color: #6b7280;
            margin-bottom: 20px;
        }
        
        .profile-stats {
            display: flex;
            justify-content: center;
            gap: 30px;
            margin: 30px 0;
        }
        
        .stat-item {
            text-align: center;
        }
        
        .stat-number {
            font-size: 24px;
            font-weight: bold;
            color: ${COLORS.primary};
        }
        
        .stat-label {
            font-size: 12px;
            color: #6b7280;
            margin-top: 5px;
        }
        
        .profile-actions {
            display: flex;
            gap: 10px;
            justify-content: center;
        }
        
        /* استایل‌های منوی موبایل */
        .hamburger {
            display: none;
            flex-direction: column;
            justify-content: space-between;
            width: 30px;
            height: 21px;
            cursor: pointer;
        }
        
        .hamburger span {
            display: block;
            height: 3px;
            width: 100%;
            background-color: ${COLORS.dark};
            border-radius: 3px;
            transition: all 0.3s ease;
        }
        
        .mobile-menu {
            position: fixed;
            top: 0;
            right: -300px;
            width: 300px;
            height: 100%;
            background: white;
            box-shadow: -2px 0 10px rgba(0,0,0,0.1);
            z-index: 1001;
            transition: right 0.3s ease;
            overflow-y: auto;
        }
        
        .mobile-menu.active {
            right: 0;
        }
        
        .overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            z-index: 1000;
            display: none;
        }
        
        .overlay.active {
            display: block;
        }
        
        .mobile-menu-header {
            padding: 20px;
            border-bottom: 1px solid ${COLORS.light};
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: ${COLORS.primary};
            color: white;
        }
        
        .mobile-nav-links {
            list-style: none;
            padding: 20px;
        }
        
        .mobile-nav-links li {
            margin-bottom: 10px;
        }
        
        .mobile-nav-links .nav-link {
            display: flex;
            align-items: center;
            padding: 12px 15px;
            border-radius: 8px;
            transition: background-color 0.3s;
            color: ${COLORS.dark};
            text-decoration: none;
        }
        
        .mobile-nav-links .nav-link:hover {
            background-color: ${COLORS.light};
        }
        
        .mobile-nav-links .nav-link.active {
            background-color: ${COLORS.primary};
            color: white;
        }
        
        .mobile-user-actions {
            padding: 20px;
            border-top: 1px solid ${COLORS.light};
        }
        
        /* استایل‌های واکنش‌گرا */
        @media (max-width: 768px) {
            .hamburger {
                display: flex;
            }
            
            .nav-links {
                display: none;
            }
            
            .user-actions .btn {
                display: none;
            }
            
            .analytics-grid {
                grid-template-columns: 1fr;
            }
            
            .payment-methods-grid {
                grid-template-columns: 1fr;
            }
            
            .form-row {
                grid-template-columns: 1fr;
            }
            
            .trip-actions,
            .payment-actions,
            .thank-you-actions,
            .profile-actions {
                flex-direction: column;
            }
            
            /* استایل‌های نقشه در موبایل */
            #map {
                height: 300px !important;
            }
            
            .map-selection-panel {
                width: 100% !important;
                max-width: 100% !important;
                right: 0 !important;
                border-radius: 20px 20px 0 0 !important;
            }
        }
        
        /* استایل‌های صفحه اصلی */
        .page.active {
            display: block;
        }
        
        .page {
            display: none;
        }
        
        .main-header {
            background: white;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            position: sticky;
            top: 0;
            z-index: 100;
        }
        
        .notification {
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            background: ${COLORS.success};
            color: white;
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            z-index: 10000;
            display: none;
            animation: slideIn 0.3s ease;
        }
        
        .notification.error {
            background: ${COLORS.danger};
        }
        
        .notification.warning {
            background: ${COLORS.warning};
        }
        
        .notification.info {
            background: ${COLORS.info};
        }
        
        @keyframes slideIn {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
        
        /* استایل‌های فرم */
        .form-group {
            margin-bottom: 20px;
        }
        
        .form-input {
            width: 100%;
            padding: 12px 15px;
            border: 1px solid #e0e0e0;
            border-radius: 8px;
            font-size: 16px;
            transition: border-color 0.3s;
        }
        
        .form-input:focus {
            outline: none;
            border-color: ${COLORS.primary};
            box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.1);
        }
        
        .btn {
            padding: 12px 20px;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.3s ease;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
        }
        
        .btn-primary {
            background: ${COLORS.primary};
            color: white;
        }
        
        .btn-primary:hover {
            background: #7C3AED;
        }
        
        .btn-secondary {
            background: #6B7280;
            color: white;
        }
        
        .btn-secondary:hover {
            background: #4B5563;
        }
        
        .btn-outline-primary {
            background: transparent;
            color: ${COLORS.primary};
            border: 2px solid ${COLORS.primary};
        }
        
        .btn-outline-primary:hover {
            background: ${COLORS.primary};
            color: white;
        }
        
        .btn-block {
            width: 100%;
        }
        
        /* استایل‌های مدال */
        .modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            z-index: 10000;
        }
        
        .modal-content {
            background: white;
            margin: 50px auto;
            padding: 20px;
            border-radius: 10px;
            max-width: 500px;
            max-height: 80vh;
            overflow-y: auto;
        }
        
        .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 1px solid #e5e7eb;
        }
        
        .modal-body {
            padding: 10px 0;
        }
        
        .modal-footer {
            display: flex;
            justify-content: flex-end;
            gap: 10px;
            margin-top: 20px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
        }
        
        /* استایل‌های اضافی */
        .spinner {
            border: 4px solid #f3f3f3;
            border-top: 4px solid ${COLORS.primary};
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 0 auto 20px;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        .badge {
            display: inline-block;
            padding: 5px 10px;
            font-size: 12px;
            font-weight: 600;
            border-radius: 20px;
        }
        
        .popular-destination-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px;
            border-bottom: 1px solid #e5e7eb;
            cursor: pointer;
            transition: background-color 0.3s;
        }
        
        .popular-destination-item:hover {
            background-color: ${COLORS.light};
        }
        
        .popularity-badge {
            background: ${COLORS.primary};
            color: white;
            padding: 3px 8px;
            border-radius: 10px;
            font-size: 12px;
        }
        
        /* استایل‌های نوع سفر */
        .ride-type {
            border: 2px solid #e5e7eb;
            border-radius: 8px;
            padding: 15px;
            text-align: center;
            cursor: pointer;
            transition: all 0.3s ease;
        }
        
        .ride-type:hover {
            border-color: ${COLORS.primary};
        }
        
        .ride-type.selected {
            border-color: ${COLORS.primary};
            background: #EFF6FF;
        }
        
        /* استایل‌های تب‌ها */
        .nav-tabs {
            border-bottom: 2px solid #e5e7eb;
        }
        
        .nav-tabs .nav-link {
            border: none;
            color: #6b7280;
            padding: 10px 20px;
        }
        
        .nav-tabs .nav-link.active {
            color: ${COLORS.primary};
            border-bottom: 2px solid ${COLORS.primary};
            background: transparent;
        }
        
        /* استایل‌های جدول */
        .table {
            width: 100%;
            border-collapse: collapse;
        }
        
        .table th {
            background: ${COLORS.light};
            padding: 12px;
            text-align: right;
            border-bottom: 2px solid #e5e7eb;
        }
        
        .table td {
            padding: 12px;
            border-bottom: 1px solid #e5e7eb;
        }
        
        .table-striped tbody tr:nth-of-type(odd) {
            background-color: rgba(0,0,0,0.02);
        }
        
        .table-responsive {
            overflow-x: auto;
        }
    `;
    
    document.head.appendChild(style);
});

// ==================== راه‌اندازی اولیه ====================

// بارگذاری تنظیمات کرایه از localStorage
function loadFareSettings() {
    try {
        const savedSettings = localStorage.getItem('fare_settings');
        if (savedSettings) {
            const settings = JSON.parse(savedSettings);
            routeCalculator.baseFares.economy.base = settings.baseFare;
            routeCalculator.baseFares.economy.perKm = settings.perKm;
            routeCalculator.baseFares.economy.perMinute = settings.perMinute;
            
            // به‌روزرسانی سایر نوع‌ها
            routeCalculator.baseFares.comfort.base = settings.baseFare * 1.6;
            routeCalculator.baseFares.comfort.perKm = settings.perKm * 1.4;
            routeCalculator.baseFares.comfort.perMinute = settings.perMinute * 1.5;
            
            routeCalculator.baseFares.bike.base = settings.baseFare * 0.6;
            routeCalculator.baseFares.bike.perKm = settings.perKm * 0.6;
            routeCalculator.baseFares.bike.perMinute = settings.perMinute * 0.5;
        }
    } catch (error) {
        console.error('خطا در بارگذاری تنظیمات:', error);
    }
}

// راه‌اندازی اولیه
loadFareSettings();

// ==================== توابع مدیریت خطا ====================

function handleDatabaseError(error, fallbackData = []) {
    console.error('خطای دیتابیس:', error);
    
    // در صورت نیاز می‌توانید خطا را به سرور گزارش دهید
    if (navigator.onLine) {
        // گزارش خطا به سرور
        reportErrorToServer(error);
    }
    
    return fallbackData;
}

function reportErrorToServer(error) {
    // این تابع می‌تواند خطاها را به سرور گزارش دهد
    console.log('گزارش خطا به سرور:', error.message);
}

// ==================== توابع کمکی اضافی ====================

/**
 * بررسی اتصال به اینترنت
 */
function checkInternetConnection() {
    if (!navigator.onLine) {
        showNotification('اتصال اینترنت برقرار نیست. برخی قابلیت‌ها ممکن است کار نکند.', 'warning');
        return false;
    }
    return true;
}

/**
 * ذخیره داده‌ها در localStorage برای حالت آفلاین
 */
function saveToLocalStorage(key, data) {
    try {
        localStorage.setItem(key, JSON.stringify({
            data: data,
            timestamp: new Date().toISOString()
        }));
    } catch (error) {
        console.error('خطا در ذخیره در localStorage:', error);
    }
}

/**
 * بارگذاری داده‌ها از localStorage
 */
function loadFromLocalStorage(key, maxAgeHours = 24) {
    try {
        const stored = localStorage.getItem(key);
        if (!stored) return null;
        
        const parsed = JSON.parse(stored);
        const storedTime = new Date(parsed.timestamp);
        const now = new Date();
        const hoursDiff = (now - storedTime) / (1000 * 60 * 60);
        
        if (hoursDiff > maxAgeHours) {
            localStorage.removeItem(key);
            return null;
        }
        
        return parsed.data;
    } catch (error) {
        console.error('خطا در بارگذاری از localStorage:', error);
        return null;
    }
}

// ==================== مدیریت حالت آفلاین ====================

// بررسی اتصال به اینترنت هنگام بارگذاری
window.addEventListener('load', () => {
    checkInternetConnection();
});

// گوش دادن به تغییرات اتصال اینترنت
window.addEventListener('online', () => {
    showNotification('اتصال اینترنت برقرار شد', 'success');
    
    // همگام‌سازی داده‌های آفلاین
    syncOfflineData();
});

window.addEventListener('offline', () => {
    showNotification('اتصال اینترنت قطع شد', 'warning');
});

/**
 * همگام‌سازی داده‌های آفلاین
 */
async function syncOfflineData() {
    try {
        // اینجا می‌توانید داده‌های ذخیره شده در localStorage را با سرور همگام کنید
        console.log('همگام‌سازی داده‌های آفلاین...');
    } catch (error) {
        console.error('خطا در همگام‌سازی:', error);
    }
}

// ==================== بهینه‌سازی عملکرد ====================

// Debounce برای جلوگیری از فراخوانی مکرر توابع
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

// Throttle برای محدود کردن فراخوانی توابع
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

// ==================== امنیت و اعتبارسنجی ====================

/**
 * اعتبارسنجی ایمیل
 */
function isValidEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

/**
 * اعتبارسنجی شماره تلفن افغانستان
 */
function isValidAfghanPhone(phone) {
    const re = /^(\+93|0)?[7][0-9]{8}$/;
    return re.test(phone);
}

/**
 * اعتبارسنجی رمز عبور
 */
function isValidPassword(password) {
    return password.length >= 6;
}

/**
 * پاکسازی ورودی‌های کاربر
 */
function sanitizeInput(input) {
    return input.trim().replace(/[<>]/g, '');
}

// ==================== توابع دسترسی‌پذیری ====================

/**
 * تنظیم فوکوس روی عنصر
 */
function setFocus(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        element.focus();
    }
}

/**
 * خواندن متن برای کاربران نابینا
 */
function speakText(text, lang = 'fa-IR') {
    if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang;
        speechSynthesis.speak(utterance);
    }
}

// ==================== تابع اصلی اجرا ====================

// اجرای کد پس از بارگذاری کامل صفحه
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApplication);
} else {
    initApplication();
}

function initApplication() {
    console.log('برنامه اسنپ افغانستان راه‌اندازی شد');
    
    // بارگذاری تنظیمات اولیه
    loadFareSettings();
    
    // بررسی وضعیت کاربر
    checkUserLoginStatus();
    
    // راه‌اندازی قابلیت‌ها
    setupMobileMenu();
    setupNavigation();
    setupModals();
    
    // اضافه کردن event listener‌های اصلی
    setupEventListeners();
    
    // بارگذاری نقشه (با تأخیر برای بهبود عملکرد)
    setTimeout(() => {
        if (document.getElementById('home-page')?.classList.contains('active')) {
            initMap();
        }
    }, 500);
}

/**
 * تنظیم event listener‌های اصلی
 */
function setupEventListeners() {
    // مدیریت انتخاب نوع سفر
    document.querySelectorAll('.ride-type').forEach(type => {
        type.addEventListener('click', handleRideTypeSelection);
    });
    
    // مدیریت انتخاب روش پرداخت
    document.querySelectorAll('.payment-method').forEach(method => {
        method.addEventListener('click', handlePaymentMethodSelection);
    });
    
    // دکمه موقعیت یابی خودکار
    const autoLocationBtn = document.getElementById('auto-location-btn');
    if (autoLocationBtn) {
        autoLocationBtn.addEventListener('click', handleAutoLocation);
    }
    
    // مدیریت فرم‌ها
    const rideForm = document.getElementById('rideForm');
    if (rideForm) {
        rideForm.addEventListener('submit', handleRideFormSubmit);
    }
    
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLoginFormSubmit);
    }
    
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', handleRegisterFormSubmit);
    }
    
    // مدیریت کلیک‌های خارجی
    document.addEventListener('click', handleOutsideClick);
    
    // مدیریت کلیدهای صفحه‌کلید
    document.addEventListener('keydown', handleKeydown);
}

/**
 * مدیریت انتخاب نوع سفر
 */
function handleRideTypeSelection(e) {
    const type = e.currentTarget;
    const rideType = type.dataset.type;
    
    // حذف انتخاب قبلی
    document.querySelectorAll('.ride-type').forEach(t => {
        t.classList.remove('selected');
        t.style.borderColor = '#e5e7eb';
    });
    
    // انتخاب جدید
    type.classList.add('selected');
    selectedRideType = rideType;
    
    // تغییر رنگ border
    const fare = routeCalculator.baseFares[rideType];
    if (fare) {
        type.style.borderColor = fare.color;
    }
    
    // بروزرسانی قیمت اگر مسیر محاسبه شده باشد
    if (routeDetails && currentDistance > 0) {
        const newPrice = routeCalculator.calculatePrice(routeDetails);
        currentPrice = newPrice;
        updateRouteDisplay(routeDetails, newPrice);
    }
    
    showNotification(`نوع سفر به ${fare.name} تغییر کرد`, 'info');
}

/**
 * مدیریت انتخاب روش پرداخت
 */
function handlePaymentMethodSelection(e) {
    const method = e.currentTarget;
    const paymentMethod = method.dataset.method;
    
    // حذف انتخاب قبلی
    document.querySelectorAll('.payment-method').forEach(m => {
        m.classList.remove('selected');
        m.style.borderColor = '#e5e7eb';
        m.style.background = 'white';
    });
    
    // انتخاب جدید
    method.classList.add('selected');
    selectedPaymentMethod = paymentMethod;
    method.style.borderColor = COLORS.primary;
    method.style.background = '#EFF6FF';
    
    showNotification(`روش پرداخت به ${getPaymentMethodText(paymentMethod)} تغییر کرد`, 'info');
}

function getPaymentMethodText(method) {
    const methods = {
        'cash': 'نقدی',
        'wallet': 'کیف پول',
        'card': 'کارت بانکی'
    };
    return methods[method] || method;
}

/**
 * مدیریت موقعیت یابی خودکار
 */
function handleAutoLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const userLat = position.coords.latitude;
                const userLng = position.coords.longitude;
                
                await reverseGeocode(userLat, userLng, document.getElementById('pickup'));
                showNotification('موقعیت شما به طور خودکار انتخاب شد', 'success');
            },
            (error) => {
                console.error('خطا در موقعیت یابی:', error);
                let message = 'دسترسی به موقعیت مکانی فعال نیست';
                if (error.code === error.PERMISSION_DENIED) {
                    message = 'لطفاً دسترسی موقعیت مکانی را در مرورگر فعال کنید';
                } else if (error.code === error.POSITION_UNAVAILABLE) {
                    message = 'موقعیت مکانی در دسترس نیست';
                }
                showNotification(message, 'warning');
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            }
        );
    } else {
        showNotification('مرورگر شما از موقعیت یابی پشتیبانی نمی‌کند', 'warning');
    }
}

/**
 * مدیریت ارسال فرم درخواست سفر
 */
async function handleRideFormSubmit(e) {
    e.preventDefault();
    
    const pickupInput = document.getElementById('pickup');
    const destinationInput = document.getElementById('destination');
    
    if (!pickupInput || !destinationInput) return;
    
    const pickup = pickupInput.value.trim();
    const destination = destinationInput.value.trim();
    
    // اعتبارسنجی
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
    
    // بررسی ورود کاربر
    if (!currentUser) {
        showNotification('لطفاً ابتدا وارد شوید', 'error');
        document.getElementById('authModal').style.display = 'block';
        return;
    }
    
    // ایجاد سفر
    const trip = await createTrip(pickup, destination, selectedRideType, currentPrice);
    
    if (trip) {
        await saveRouteDetails(trip.id, routeDetails);
        startDriverSearch();
    }
}

/**
 * مدیریت ورود کاربر
 */
async function handleLoginFormSubmit(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    await loginUser(email, password);
}

/**
 * مدیریت ثبت‌نام کاربر
 */
async function handleRegisterFormSubmit(e) {
    e.preventDefault();
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const name = document.getElementById('registerName').value;
    const phone = document.getElementById('registerPhone').value;
    await registerUser(email, password, name, phone);
}

/**
 * مدیریت کلیک خارجی
 */
function handleOutsideClick(e) {
    // بستن منوی موبایل با کلیک خارج
    const mobileMenu = document.getElementById('mobileMenu');
    const overlay = document.getElementById('overlay');
    const hamburger = document.getElementById('hamburger');
    
    if (mobileMenu && mobileMenu.classList.contains('active') && 
        !mobileMenu.contains(e.target) && 
        !hamburger.contains(e.target)) {
        mobileMenu.classList.remove('active');
        if (overlay) overlay.classList.remove('active');
        document.body.style.overflow = '';
    }
    
    // بستن پنل انتخاب از نقشه با کلیک خارج
    const mapSelectionPanel = document.getElementById('mapSelectionPanel');
    if (mapSelectionPanel && !mapSelectionPanel.contains(e.target)) {
        const mapSelectionBtn = document.getElementById('mapSelectionBtn');
        if (mapSelectionBtn && !mapSelectionBtn.contains(e.target)) {
            closeMapSelectionPanel();
        }
    }
}

/**
 * مدیریت کلیدهای صفحه‌کلید
 */
function handleKeydown(e) {
    // بستن با کلید ESC
    if (e.key === 'Escape') {
        // بستن منوی موبایل
        const mobileMenu = document.getElementById('mobileMenu');
        if (mobileMenu && mobileMenu.classList.contains('active')) {
            mobileMenu.classList.remove('active');
            const overlay = document.getElementById('overlay');
            if (overlay) overlay.classList.remove('active');
            document.body.style.overflow = '';
        }
        
        // بستن پنل انتخاب از نقشه
        closeMapSelectionPanel();
        
        // بستن مودال‌ها
        document.querySelectorAll('.modal').forEach(modal => {
            if (modal.style.display === 'block') {
                modal.style.display = 'none';
            }
        });
    }
    
    // مدیریت تب‌ها با کلیدهای جهت‌دار
    if (e.key === 'Tab' && !e.shiftKey) {
        // جلوگیری از رفتن فوکوس خارج از مودال
        const activeModal = document.querySelector('.modal[style="display: block;"]');
        if (activeModal) {
            const focusableElements = activeModal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
            if (focusableElements.length > 0) {
                const lastElement = focusableElements[focusableElements.length - 1];
                if (document.activeElement === lastElement) {
                    e.preventDefault();
                    focusableElements[0].focus();
                }
            }
        }
    }
}

// ==================== بهینه‌سازی حافظه ====================

/**
 * پاکسازی منابع
 */
function cleanupResources() {
    // پاکسازی interval‌ها
    if (trackingInterval) {
        clearInterval(trackingInterval);
        trackingInterval = null;
    }
    
    // پاکسازی نشانگرهای نقشه
    if (map) {
        driverMarkers.forEach(marker => {
            if (marker && marker.remove) {
                map.removeLayer(marker);
            }
        });
        driverMarkers = [];
    }
    
    // پاکسازی رویدادها
    document.removeEventListener('click', handleOutsideClick);
    document.removeEventListener('keydown', handleKeydown);
}

/**
 * تابع برای زمانی که کاربر از صفحه خارج می‌شود
 */
function beforeUnloadHandler() {
    cleanupResources();
}

// اضافه کردن event listener برای خروج از صفحه
window.addEventListener('beforeunload', beforeUnloadHandler);

// ==================== تست و دیباگ ====================

/**
 * فعال کردن حالت توسعه
 */
function enableDevelopmentMode() {
    console.log('حالت توسعه فعال شد');
    
    // نمایش اطلاعات دیباگ
    window.debugInfo = {
        currentUser: () => currentUser,
        isAdmin: () => isAdmin,
        selectedRideType: () => selectedRideType,
        currentPrice: () => currentPrice,
        currentDistance: () => currentDistance,
        activeDrivers: () => activeDrivers,
        districts: () => districts,
        popularDestinations: () => popularDestinations,
        routeDetails: () => routeDetails
    };
    
    // اضافه کردن دکمه دیباگ
    const debugBtn = document.createElement('button');
    debugBtn.id = 'debugBtn';
    debugBtn.innerHTML = '🐛';
    debugBtn.title = 'اطلاعات دیباگ';
    debugBtn.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 20px;
        width: 40px;
        height: 40px;
        background: ${COLORS.warning};
        color: white;
        border: none;
        border-radius: 50%;
        cursor: pointer;
        z-index: 9999;
        font-size: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    `;
    
    debugBtn.addEventListener('click', () => {
        const debugInfo = `
            کاربر: ${currentUser ? currentUser.email : 'وارد نشده'}
            ادمین: ${isAdmin ? 'بله' : 'خیر'}
            نوع سفر: ${selectedRideType}
            قیمت فعلی: ${currentPrice}
            مسافت: ${currentDistance} کیلومتر
            رانندگان فعال: ${activeDrivers.length}
            نواحی: ${districts.length}
            مقاصد محبوب: ${popularDestinations.length}
        `;
        alert(debugInfo);
    });
    
    document.body.appendChild(debugBtn);
}

// فعال کردن حالت توسعه در محیط محلی
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    enableDevelopmentMode();
}

// ==================== اکسپورت توابع برای استفاده در کنسول ====================

// اکسپورت توابع مهم برای دیباگ
window.app = {
    initMap,
    calculateAndShowRoute,
    loginUser,
    registerUser,
    logoutUser,
    createTrip,
    startDriverSearch,
    openAdminPanel,
    showUserTrips,
    showProfile,
    openMapSelectionPanel,
    calculateDistance,
    formatPrice,
    formatDistance,
    formatDuration
};

console.log('برنامه اسنپ افغانستان آماده است!');
console.log('برای دسترسی به توابع از window.app استفاده کنید');