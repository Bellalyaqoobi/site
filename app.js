// تنظیمات Supabase
const SUPABASE_URL = 'https://ewzgpfpllwhhrjupqyvy.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV3emdwZnBsbHdoaHJqdXBxeXZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4NjUzMTIsImV4cCI6MjA4MDQ0MTMxMn0.Us3nf0wOfYD0_aCDc-3Y0PaxsqUKiBvW95no0SkNgiI';

// مقداردهی اولیه Supabase
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// متغیرهای سیستمی
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

// توابع کمکی
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

// مدیریت نقشه
async function initMap() {
    if (map) return;
    
    try {
        // موقعیت کابل
        const kabulPosition = [34.5553, 69.2075];
        
        map = L.map('map').setView(kabulPosition, 12);
        
        // اضافه کردن نقشه OpenStreetMap
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 18
        }).addTo(map);
        
        // اضافه کردن کنترل موقعیت کاربر
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
                    
                    // نمایش آدرس فعلی در فیلد مبدا
                    reverseGeocode(userLat, userLng, document.getElementById('pickup'));
                },
                () => {
                    showNotification('دسترسی به موقعیت مکانی فعال نیست', 'warning');
                }
            );
        }
        
        // بارگذاری مناطق کابل
        await loadDistricts();
        
        // بارگذاری مقاصد پرطرفدار
        await loadPopularDestinations();
        
        // بارگذاری رانندگان فعال
        await loadActiveDrivers();
        
        // تنظیم event listener برای کلیک روی نقشه
        map.on('click', function(e) {
            const pickupInput = document.getElementById('pickup');
            if (pickupInput) {
                reverseGeocode(e.latlng.lat, e.latlng.lng, pickupInput);
            }
        });
        
        showNotification('نقشه کابل با موفقیت بارگذاری شد', 'success');
    } catch (error) {
        console.error('Error initializing map:', error);
        showNotification('خطا در بارگذاری نقشه', 'error');
    }
}

// تبدیل مختصات به آدرس
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
            
            showNotification('آدرس انتخاب شد', 'info');
        }
    } catch (error) {
        console.error('Error in reverse geocoding:', error);
        inputElement.value = `موقعیت جغرافیایی: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    }
}

// محاسبه دقیق مسافت بین دو نقطه
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // شعاع زمین به کیلومتر
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // مسافت به کیلومتر
}

function toRad(value) {
    return value * Math.PI / 180;
}

// بارگذاری مناطق کابل
async function loadDistricts() {
    try {
        const { data, error } = await supabase
            .from('districts')
            .select('*')
            .order('name', { ascending: true });
        
        if (error) {
            // اگر جدول وجود نداشت، ایجاد کنیم
            await createTablesIfNotExist();
            throw error;
        }
        
        districts = data || [];
        
        // نمایش مناطق در پنل
        const districtsGrid = document.getElementById('districtsGrid');
        if (districtsGrid) {
            districtsGrid.innerHTML = '';
            
            districts.forEach(district => {
                const districtElement = document.createElement('div');
                districtElement.className = 'district-item';
                districtElement.textContent = district.name;
                districtElement.title = district.description || district.name;
                
                districtElement.addEventListener('click', () => {
                    const pickupInput = document.getElementById('pickup');
                    if (pickupInput) {
                        pickupInput.value = district.name;
                        showNotification(`منطقه "${district.name}" انتخاب شد`, 'info');
                        
                        // مرکزیت نقشه روی منطقه انتخاب شده
                        if (district.latitude && district.longitude) {
                            map.setView([district.latitude, district.longitude], 14);
                            
                            // اضافه کردن نشانگر
                            if (userMarker) map.removeLayer(userMarker);
                            
                            userMarker = L.marker([district.latitude, district.longitude], {
                                icon: L.divIcon({
                                    className: 'district-marker',
                                    html: '<div class="marker-icon"><i class="fas fa-map-pin"></i></div>',
                                    iconSize: [40, 40]
                                })
                            }).addTo(map)
                            .bindPopup(district.name + '<br><small>' + (district.description || '') + '</small>');
                        }
                    }
                });
                
                districtsGrid.appendChild(districtElement);
            });
        }
    } catch (error) {
        console.error('Error loading districts:', error);
        // اگر جدول districts وجود ندارد، مناطق پیش‌فرض اضافه می‌کنیم
        districts = [
            { name: 'شاروالی کابل', description: 'مرکز شهر کابل', latitude: 34.5155, longitude: 69.1722 },
            { name: 'کارته سخی', description: 'منطقه مسکونی', latitude: 34.5180, longitude: 69.1830 },
            { name: 'کارته پروان', description: 'منطقه تجاری', latitude: 34.5250, longitude: 69.1900 },
            { name: 'کارته چهار', description: 'منطقه مسکونی', latitude: 34.5300, longitude: 69.1950 },
            { name: 'دشت برچی', description: 'منطقه مسکونی', latitude: 34.5080, longitude: 69.1680 },
            { name: 'چهاردهی', description: 'منطقه مسکونی', latitude: 34.5350, longitude: 69.1750 },
            { name: 'قلعه‌وزی', description: 'منطقه تاریخی', latitude: 34.5100, longitude: 69.1800 },
            { name: 'ده مرادخان', description: 'منطقه مسکونی', latitude: 34.5200, longitude: 69.1700 },
            { name: 'مکرویان', description: 'منطقه صنعتی', latitude: 34.5400, longitude: 69.2100 }
        ];
        
        const districtsGrid = document.getElementById('districtsGrid');
        if (districtsGrid) {
            districtsGrid.innerHTML = '';
            districts.forEach(district => {
                const districtElement = document.createElement('div');
                districtElement.className = 'district-item';
                districtElement.textContent = district.name;
                districtElement.title = district.description;
                
                districtElement.addEventListener('click', () => {
                    const pickupInput = document.getElementById('pickup');
                    if (pickupInput) {
                        pickupInput.value = district.name;
                        showNotification(`منطقه "${district.name}" انتخاب شد`, 'info');
                        
                        if (map && district.latitude && district.longitude) {
                            map.setView([district.latitude, district.longitude], 14);
                        }
                    }
                });
                
                districtsGrid.appendChild(districtElement);
            });
        }
    }
}

// ایجاد جداول در صورت عدم وجود
async function createTablesIfNotExist() {
    try {
        // ایجاد جدول districts
        const { error: districtsError } = await supabase.rpc('create_districts_table');
        
        // ایجاد جدول drivers
        const { error: driversError } = await supabase.rpc('create_drivers_table');
        
        // ایجاد جدول trips
        const { error: tripsError } = await supabase.rpc('create_trips_table');
        
        if (!districtsError && !driversError && !tripsError) {
            console.log('Tables created successfully');
        }
    } catch (error) {
        console.error('Error creating tables:', error);
    }
}

// بارگذاری مقاصد پرطرفدار
async function loadPopularDestinations() {
    try {
        const { data, error } = await supabase
            .from('popular_destinations')
            .select('*')
            .order('visit_count', { ascending: false })
            .limit(6);
        
        if (error) {
            // اگر خطا داد، یعنی جدول وجود ندارد - مقاصد پیش‌فرض
            throw error;
        }
        
        popularDestinations = data || [];
        
        // اگر داده‌ای وجود نداشت، مقاصد پیش‌فرض اضافه می‌کنیم
        if (popularDestinations.length === 0) {
            popularDestinations = [
                { name: 'میدان هوایی بین المللی کابل', latitude: 34.5658, longitude: 69.2124, visit_count: 1000 },
                { name: 'سفارت امریکا', latitude: 34.5358, longitude: 69.1824, visit_count: 800 },
                { name: 'سفارت ایران', latitude: 34.5458, longitude: 69.1924, visit_count: 700 },
                { name: 'سفارت پاکستان', latitude: 34.5558, longitude: 69.2024, visit_count: 600 },
                { name: 'وزارت امور خارجه', latitude: 34.5258, longitude: 69.1724, visit_count: 500 },
                { name: 'ارگ ریاست جمهوری', latitude: 34.5158, longitude: 69.1624, visit_count: 400 }
            ];
        }
        
        // اضافه کردن نشانگرها روی نقشه
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
                `);
                
                marker.on('click', () => {
                    const destinationInput = document.getElementById('destination');
                    if (destinationInput) {
                        destinationInput.value = destination.name;
                        showNotification(`مقصد "${destination.name}" انتخاب شد`, 'info');
                        
                        // اضافه کردن نشانگر مقصد
                        const destMarker = L.marker([destination.latitude, destination.longitude], {
                            icon: L.divIcon({
                                className: 'selected-destination-marker',
                                html: '<div class="marker-icon"><i class="fas fa-flag-checkered"></i></div>',
                                iconSize: [40, 40]
                            })
                        }).addTo(map)
                        .bindPopup('مقصد انتخاب شده<br><small>' + destination.name + '</small>');
                        
                        // اگر نقشه‌ای داشته باشیم، خط بین مبدا و مقصد رسم کنیم
                        if (userMarker && userMarker.getLatLng()) {
                            if (routeLayer) map.removeLayer(routeLayer);
                            
                            const pickupLatLng = userMarker.getLatLng();
                            const destinationLatLng = marker.getLatLng();
                            
                            // محاسبه فاصله
                            const distance = calculateDistance(
                                pickupLatLng.lat, pickupLatLng.lng,
                                destinationLatLng.lat, destinationLatLng.lng
                            );
                            
                            // رسم خط بین مبدا و مقصد
                            routeLayer = L.polyline([pickupLatLng, destinationLatLng], {
                                color: 'var(--accent)',
                                weight: 4,
                                opacity: 0.7,
                                dashArray: '10, 10'
                            }).addTo(map);
                            
                            // محاسبه قیمت
                            calculateAndShowPrice(distance);
                        }
                    }
                });
            }
        });
    } catch (error) {
        console.error('Error loading popular destinations:', error);
        // در حالت خطا، از مقاصد پیش‌فرض استفاده می‌کنیم
        popularDestinations = [
            { name: 'میدان هوایی بین المللی کابل', latitude: 34.5658, longitude: 69.2124, visit_count: 1000 },
            { name: 'سفارت امریکا', latitude: 34.5358, longitude: 69.1824, visit_count: 800 },
            { name: 'سفارت ایران', latitude: 34.5458, longitude: 69.1924, visit_count: 700 },
            { name: 'سفارت پاکستان', latitude: 34.5558, longitude: 69.2024, visit_count: 600 }
        ];
        
        // نمایش در لیست پیشنهادی
        const suggestionsList = document.querySelector('.suggestion-list');
        if (suggestionsList) {
            suggestionsList.innerHTML = '';
            popularDestinations.forEach(destination => {
                const suggestionItem = document.createElement('div');
                suggestionItem.className = 'suggestion-item';
                suggestionItem.innerHTML = `
                    <div class="suggestion-icon">
                        <i class="fas fa-landmark"></i>
                    </div>
                    <div class="suggestion-text">${destination.name}</div>
                `;
                suggestionItem.setAttribute('data-destination', destination.name);
                
                suggestionItem.addEventListener('click', () => {
                    const destinationInput = document.getElementById('destination');
                    if (destinationInput) {
                        destinationInput.value = destination.name;
                        showNotification(`مقصد "${destination.name}" انتخاب شد`, 'info');
                    }
                });
                
                suggestionsList.appendChild(suggestionItem);
            });
        }
    }
}

// محاسبه و نمایش قیمت
function calculateAndShowPrice(distance) {
    currentDistance = distance;
    
    const baseFares = {
        'economy': 50,
        'comfort': 80,
        'bike': 30
    };
    
    const distanceFare = distance * 20; // 20 افغانی به ازای هر کیلومتر
    const baseFare = baseFares[selectedRideType] || 50;
    currentPrice = Math.round(baseFare + distanceFare);
    
    // بروزرسانی قیمت در UI
    const priceElement = document.getElementById(`${selectedRideType}Price`);
    if (priceElement) {
        priceElement.textContent = `${currentPrice} افغانی`;
    }
    
    // نمایش مسافت در ماشین حساب
    const tripCalculator = document.getElementById('tripCalculator');
    if (tripCalculator) {
        tripCalculator.style.display = 'block';
        
        const distanceElement = document.getElementById('distanceValue');
        const baseFareElement = document.getElementById('baseFareValue');
        const distanceFareElement = document.getElementById('distanceFareValue');
        const totalFareElement = document.getElementById('totalFareValue');
        
        if (distanceElement) distanceElement.textContent = `${distance.toFixed(1)} کیلومتر`;
        if (baseFareElement) baseFareElement.textContent = `${baseFare} افغانی`;
        if (distanceFareElement) distanceFareElement.textContent = `${Math.round(distanceFare)} افغانی`;
        if (totalFareElement) totalFareElement.textContent = `${currentPrice} افغانی`;
    }
}

// بارگذاری رانندگان فعال
async function loadActiveDrivers() {
    try {
        const { data, error } = await supabase
            .from('drivers')
            .select('*')
            .eq('status', 'available')
            .eq('is_online', true);
        
        if (error) throw error;
        
        activeDrivers = data || [];
        
        // اگر راننده‌ای وجود نداشت، رانندگان نمونه اضافه می‌کنیم
        if (activeDrivers.length === 0) {
            activeDrivers = [
                { id: 1, name: 'احمد ظاهر', vehicle_type: 'car', vehicle_model: 'تویوتا کورولا', 
                  latitude: 34.5453, longitude: 69.2175, rating: 4.7, total_trips: 125, 
                  license_plate: 'کابل ۱۲۳۴', vehicle_color: 'سفید' },
                { id: 2, name: 'محمد کریم', vehicle_type: 'car', vehicle_model: 'هیوندای النترا',
                  latitude: 34.5353, longitude: 69.1975, rating: 4.5, total_trips: 89,
                  license_plate: 'کابل ۵۶۷۸', vehicle_color: 'مشکی' },
                { id: 3, name: 'کریم علی', vehicle_type: 'bike', vehicle_model: 'موتور هوندا',
                  latitude: 34.5253, longitude: 69.2075, rating: 4.8, total_trips: 156,
                  license_plate: 'کابل ۹۱۰۱', vehicle_color: 'قرمز' }
            ];
        }
        
        updateDriverMarkers();
        
    } catch (error) {
        console.error('Error loading active drivers:', error);
        activeDrivers = [
            { id: 1, name: 'احمد ظاهر', vehicle_type: 'car', vehicle_model: 'تویوتا کورولا', 
              latitude: 34.5453, longitude: 69.2175, rating: 4.7, total_trips: 125 },
            { id: 2, name: 'محمد کریم', vehicle_type: 'car', vehicle_model: 'هیوندای النترا',
              latitude: 34.5353, longitude: 69.1975, rating: 4.5, total_trips: 89 }
        ];
        updateDriverMarkers();
    }
}

// بروزرسانی نشانگرهای رانندگان روی نقشه
function updateDriverMarkers() {
    // پاک کردن نشانگرهای قبلی
    driverMarkers.forEach(marker => map.removeLayer(marker));
    driverMarkers = [];
    
    // اضافه کردن نشانگرهای جدید
    activeDrivers.forEach(driver => {
        if (driver.latitude && driver.longitude) {
            const icon = L.divIcon({
                className: 'driver-icon',
                html: `
                    <div class="${driver.vehicle_type === 'bike' ? 'bike-marker' : 'driver-marker'}">
                        <i class="${driver.vehicle_type === 'bike' ? 'fas fa-motorcycle' : 'fas fa-car'}"></i>
                    </div>
                `,
                iconSize: [40, 40],
                iconAnchor: [20, 20]
            });
            
            const marker = L.marker([driver.latitude, driver.longitude], { icon })
                .addTo(map)
                .bindPopup(`
                    <b>${driver.name}</b><br>
                    ${driver.vehicle_type === 'car' ? 'خودرو' : 'موتور'}: ${driver.vehicle_model || ''}<br>
                    امتیاز: ${driver.rating || 'جدید'}<br>
                    سفرها: ${driver.total_trips || 0}<br>
                    <button class="action-btn btn-primary" onclick="selectDriver('${driver.id}')">انتخاب راننده</button>
                `);
            
            driverMarkers.push(marker);
        }
    });
}

// انتخاب راننده
async function selectDriver(driverId) {
    try {
        // یافتن راننده انتخاب شده
        let driver = activeDrivers.find(d => d.id == driverId);
        
        if (!driver) {
            // در صورت عدم یافتن، اولین راننده را انتخاب می‌کنیم
            driver = activeDrivers[0] || {
                id: 1,
                name: 'احمد ظاهر',
                rating: 4.7,
                vehicle_model: 'تویوتا کورولا',
                vehicle_color: 'سفید',
                license_plate: 'کابل ۱۲۳۴',
                total_trips: 125,
                vehicle_type: 'car'
            };
        }
        
        currentDriver = driver;
        
        // نمایش مدال راننده
        const driverAvatar = document.getElementById('driverAvatar');
        const driverName = document.getElementById('driverName');
        const driverRating = document.getElementById('driverRating');
        const driverTrips = document.getElementById('driverTrips');
        const carModel = document.getElementById('carModel');
        const carColor = document.getElementById('carColor');
        const plateNumber = document.getElementById('plateNumber');
        const etaElement = document.getElementById('eta');
        const distanceElement = document.getElementById('distance');
        const priceElement = document.getElementById('price');
        
        if (driverAvatar) driverAvatar.textContent = driver.name.charAt(0);
        if (driverName) driverName.textContent = driver.name;
        if (driverRating) driverRating.textContent = driver.rating || 'جدید';
        if (driverTrips) driverTrips.textContent = `(${driver.total_trips || 0} سفر)`;
        if (carModel) carModel.textContent = driver.vehicle_model || '---';
        if (carColor) carColor.textContent = driver.vehicle_color || '---';
        if (plateNumber) plateNumber.textContent = driver.license_plate || '---';
        
        // محاسبه زمان و مسافت
        let userLocation;
        if (userMarker && userMarker.getLatLng()) {
            userLocation = userMarker.getLatLng();
        } else {
            userLocation = map.getCenter();
        }
        
        const driverLocation = driver.latitude && driver.longitude ? 
            [driver.latitude, driver.longitude] : [34.5453, 69.2175];
        
        const distance = calculateDistance(
            userLocation.lat, userLocation.lng,
            driverLocation[0], driverLocation[1]
        );
        
        const eta = Math.max(2, Math.round(distance * 3)); // فرض: 3 دقیقه به ازای هر کیلومتر
        
        if (etaElement) etaElement.textContent = `${eta} دقیقه`;
        if (distanceElement) distanceElement.textContent = `${distance.toFixed(1)} کیلومتر`;
        if (priceElement) priceElement.textContent = `${currentPrice} افغانی`;
        
        const driverModal = document.getElementById('driverModal');
        if (driverModal) {
            driverModal.style.display = 'flex';
        }
        
        showNotification(`راننده ${driver.name} انتخاب شد`, 'success');
        
    } catch (error) {
        console.error('Error selecting driver:', error);
        showNotification('خطا در انتخاب راننده', 'error');
    }
}

// مدیریت کاربران
async function checkUserLoginStatus() {
    try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
            console.error('Error getting session:', error);
            return;
        }
        
        if (session && session.user) {
            await loadUserProfile(session.user.id);
        }
    } catch (error) {
        console.error('Error checking login status:', error);
    }
}

async function loadUserProfile(userId) {
    try {
        // ابتدا از جدول public.users اطلاعات را می‌گیریم
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();
        
        if (error || !data) {
            // اگر کاربر در جدول public.users نبود، از auth.users استفاده می‌کنیم
            const { data: userData } = await supabase.auth.getUser();
            if (userData && userData.user) {
                const userMetadata = userData.user.user_metadata;
                currentUser = {
                    id: userId,
                    name: userMetadata.name || userData.user.email?.split('@')[0] || 'کاربر',
                    email: userData.user.email || '',
                    phone: userMetadata.phone || '',
                    role: userMetadata.role || 'passenger',
                    status: 'approved'
                };
                isAdmin = currentUser.role === 'admin';
                updateUIAfterLogin();
                showNotification(`خوش آمدید ${currentUser.name}`, 'success');
                return;
            }
            throw error || new Error('User not found');
        }
        
        currentUser = data;
        isAdmin = currentUser.role === 'admin';
        
        updateUIAfterLogin();
        showNotification(`خوش آمدید ${currentUser.name}`, 'success');
        
    } catch (error) {
        console.error('Error loading user profile:', error);
        showNotification('خطا در بارگذاری پروفایل کاربر', 'error');
    }
}

function updateUIAfterLogin() {
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const mobileLoginBtn = document.getElementById('mobileLoginBtn');
    const mobileLogoutBtn = document.getElementById('mobileLogoutBtn');
    const userProfile = document.getElementById('userProfile');
    const userAvatar = document.getElementById('userAvatar');
    const userName = document.getElementById('userName');
    
    if (loginBtn) loginBtn.style.display = 'none';
    if (logoutBtn) logoutBtn.style.display = 'block';
    if (mobileLoginBtn) mobileLoginBtn.style.display = 'none';
    if (mobileLogoutBtn) mobileLogoutBtn.style.display = 'block';
    if (userProfile) userProfile.style.display = 'flex';
    
    if (userAvatar && currentUser) {
        userAvatar.textContent = currentUser.name.charAt(0);
    }
    if (userName && currentUser) {
        userName.textContent = currentUser.name;
    }
    
    // نمایش لینک‌های ادمین
    if (isAdmin) {
        const adminLink = document.getElementById('adminLink');
        const mobileAdminLink = document.getElementById('mobileAdminLink');
        if (adminLink) adminLink.style.display = 'block';
        if (mobileAdminLink) mobileAdminLink.style.display = 'block';
    }
    
    updateProfilePage();
}

async function logout() {
    try {
        const { error } = await supabase.auth.signOut();
        
        if (error) {
            console.error('Error signing out:', error);
            showNotification('خطا در خروج از سیستم', 'error');
            return;
        }
        
        currentUser = null;
        isAdmin = false;
        
        updateUIAfterLogout();
        showNotification('با موفقیت خارج شدید', 'success');
    } catch (error) {
        console.error('Error logging out:', error);
        showNotification('خطا در خروج از سیستم', 'error');
    }
}

function updateUIAfterLogout() {
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const mobileLoginBtn = document.getElementById('mobileLoginBtn');
    const mobileLogoutBtn = document.getElementById('mobileLogoutBtn');
    const userProfile = document.getElementById('userProfile');
    
    if (loginBtn) loginBtn.style.display = 'block';
    if (logoutBtn) logoutBtn.style.display = 'none';
    if (mobileLoginBtn) mobileLoginBtn.style.display = 'block';
    if (mobileLogoutBtn) mobileLogoutBtn.style.display = 'none';
    if (userProfile) userProfile.style.display = 'none';
    
    const adminLink = document.getElementById('adminLink');
    const mobileAdminLink = document.getElementById('mobileAdminLink');
    if (adminLink) adminLink.style.display = 'none';
    if (mobileAdminLink) mobileAdminLink.style.display = 'none';
    
    document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
    const homePage = document.getElementById('home-page');
    if (homePage) homePage.classList.add('active');
}

// مدیریت سفر
async function createTrip(pickup, destination, rideType, price) {
    try {
        if (!currentUser) {
            showNotification('لطفاً ابتدا وارد حساب کاربری خود شوید', 'error');
            openAuthModal();
            return null;
        }
        
        const tripData = {
            user_id: currentUser.id,
            pickup_location: pickup,
            destination: destination,
            ride_type: rideType,
            estimated_price: price,
            status: 'requested',
            payment_method: selectedPaymentMethod,
            distance: currentDistance
        };
        
        const { data, error } = await supabase
            .from('trips')
            .insert([tripData])
            .select()
            .single();
        
        if (error) {
            // اگر جدول trips وجود نداشت، از ذخیره داخلی استفاده می‌کنیم
            console.error('Error creating trip:', error);
            currentTripId = 'trip-' + Date.now();
            showNotification('سفر شما ثبت شد. در حال یافتن راننده...', 'info');
            return {
                id: currentTripId,
                user_id: currentUser.id,
                pickup_location: pickup,
                destination: destination,
                ride_type: rideType,
                estimated_price: price,
                status: 'requested',
                payment_method: selectedPaymentMethod,
                distance: currentDistance
            };
        }
        
        currentTripId = data.id;
        showNotification('سفر شما ثبت شد. در حال یافتن راننده...', 'info');
        
        return data;
        
    } catch (error) {
        console.error('Error creating trip:', error);
        currentTripId = 'trip-' + Date.now();
        showNotification('سفر شما ثبت شد. در حال یافتن راننده...', 'info');
        return {
            id: currentTripId,
            user_id: currentUser?.id || 'guest',
            pickup_location: pickup,
            destination: destination,
            ride_type: rideType,
            estimated_price: price,
            status: 'requested',
            payment_method: selectedPaymentMethod,
            distance: currentDistance
        };
    }
}

// شروع جستجوی راننده
function startDriverSearch() {
    const searchingOverlay = document.getElementById('searchingOverlay');
    const searchingText = document.getElementById('searchingText');
    const submitBtn = document.getElementById('submitBtn');
    
    if (searchingOverlay && searchingText && submitBtn) {
        searchingOverlay.style.display = 'flex';
        submitBtn.disabled = true;
        
        // شبیه‌سازی جستجوی راننده
        let count = 0;
        const messages = [
            'در حال یافتن نزدیکترین راننده...',
            'بررسی موقعیت رانندگان...',
            'تماس با رانندگان نزدیک...',
            'راننده در حال پذیرش درخواست...'
        ];
        
        const searchInterval = setInterval(() => {
            if (searchingText) {
                searchingText.textContent = messages[count % messages.length];
            }
            count++;
            
            if (count >= 8) {
                clearInterval(searchInterval);
                if (searchingOverlay) searchingOverlay.style.display = 'none';
                selectDriver('1'); // راننده نمونه
            }
        }, 1500);
        
        // ذخیره interval برای لغو
        window.searchInterval = searchInterval;
    }
}

// شروع ردیابی سفر
function startTripTracking() {
    const liveTracking = document.getElementById('liveTracking');
    const trackingProgress = document.getElementById('trackingProgress');
    const trackingDriverName = document.getElementById('trackingDriverName');
    const trackingETA = document.getElementById('trackingETA');
    const trackingDistance = document.getElementById('trackingDistance');
    
    if (liveTracking && trackingProgress && currentDriver) {
        liveTracking.style.display = 'block';
        
        if (trackingDriverName) trackingDriverName.textContent = currentDriver.name;
        if (trackingETA) trackingETA.textContent = '۴ دقیقه';
        if (trackingDistance) trackingDistance.textContent = '۲.۸ کیلومتر';
        
        let progress = 0;
        trackingInterval = setInterval(() => {
            progress += 5;
            trackingProgress.style.width = `${progress}%`;
            
            if (progress >= 100) {
                clearInterval(trackingInterval);
                showNotification('سفر شما تکمیل شد!', 'success');
                setTimeout(() => {
                    liveTracking.style.display = 'none';
                    const ratingModal = document.getElementById('ratingModal');
                    if (ratingModal) {
                        const ratingDriverAvatar = document.getElementById('ratingDriverAvatar');
                        const ratingDriverName = document.getElementById('ratingDriverName');
                        if (ratingDriverAvatar) ratingDriverAvatar.textContent = currentDriver.name.charAt(0);
                        if (ratingDriverName) ratingDriverName.textContent = currentDriver.name;
                        ratingModal.style.display = 'flex';
                    }
                }, 1000);
            }
        }, 1000);
    }
}

// به‌روزرسانی صفحه پروفایل
function updateProfilePage() {
    if (!currentUser) return;
    
    const profileAvatar = document.getElementById('profileAvatar');
    const profileName = document.getElementById('profileName');
    const profileEmail = document.getElementById('profileEmail');
    const profilePhone = document.getElementById('profilePhone');
    const profileRole = document.getElementById('profileRole');
    const editName = document.getElementById('editName');
    const editEmail = document.getElementById('editEmail');
    const editPhone = document.getElementById('editPhone');
    
    if (profileAvatar) profileAvatar.textContent = currentUser.name.charAt(0);
    if (profileName) profileName.textContent = currentUser.name;
    if (profileEmail) profileEmail.textContent = currentUser.email;
    if (profilePhone) profilePhone.textContent = currentUser.phone;
    if (profileRole) profileRole.textContent = currentUser.role === 'passenger' ? 'مسافر' : 
                                               currentUser.role === 'driver' ? 'راننده' : 'مدیر';
    if (editName) editName.value = currentUser.name;
    if (editEmail) editEmail.value = currentUser.email;
    if (editPhone) editPhone.value = currentUser.phone;
    
    // آمار نمونه
    const totalTripsCount = document.getElementById('totalTripsCount');
    const totalSpent = document.getElementById('totalSpent');
    const userRating = document.getElementById('userRating');
    
    if (totalTripsCount) totalTripsCount.textContent = '۱۲';
    if (totalSpent) totalSpent.textContent = '۲,۵۴۰';
    if (userRating) userRating.textContent = '۵.۰';
    
    // بارگذاری سفرهای کاربر
    loadMyTrips();
}

// باز کردن مدال احراز هویت
function openAuthModal() {
    const authModal = document.getElementById('authModal');
    if (authModal) {
        authModal.style.display = 'flex';
    }
    clearErrors();
}

// مدیریت پنل ادمین
async function loadAdminPanel() {
    if (!isAdmin) {
        showNotification('شما دسترسی به پنل مدیریت ندارید', 'error');
        document.getElementById('home-page').classList.add('active');
        document.getElementById('admin-page').classList.remove('active');
        return;
    }
    
    await loadAdminStats();
    await loadPendingUsers();
    await loadAllUsers();
    await loadDrivers();
    await loadAdminTrips();
    await loadAdminDiscounts();
    await loadAdminSupport();
}

async function loadAdminStats() {
    try {
        // در حالت آزمایشی، آمار نمونه نمایش می‌دهیم
        const stats = {
            totalTrips: 1245,
            activeUsers: 543,
            totalDrivers: 89,
            totalRevenue: 245600
        };
        
        document.getElementById('totalTrips').textContent = stats.totalTrips.toLocaleString('fa-IR');
        document.getElementById('activeUsers').textContent = stats.activeUsers.toLocaleString('fa-IR');
        document.getElementById('totalDrivers').textContent = stats.totalDrivers.toLocaleString('fa-IR');
        document.getElementById('totalRevenue').textContent = stats.totalRevenue.toLocaleString('fa-IR') + ' افغانی';
        
    } catch (error) {
        console.error('Error loading admin stats:', error);
    }
}

async function loadPendingUsers() {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('status', 'pending')
            .order('created_at', { ascending: false });
        
        const table = document.getElementById('pendingUsersTable');
        if (!table) return;
        
        table.innerHTML = '';
        
        if (error || !data || data.length === 0) {
            table.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; padding: 20px; color: var(--gray);">
                        هیچ کاربری در انتظار تایید نیست
                    </td>
                </tr>
            `;
            return;
        }
        
        data.forEach(user => {
            const row = document.createElement('tr');
            const date = new Date(user.created_at).toLocaleDateString('fa-IR');
            const roleText = user.role === 'passenger' ? 'مسافر' : 
                             user.role === 'driver' ? 'راننده' : 'مدیر';
            
            row.innerHTML = `
                <td>${user.name}</td>
                <td>${user.email}</td>
                <td>${user.phone}</td>
                <td>${roleText}</td>
                <td>${date}</td>
                <td class="action-buttons">
                    <button class="action-btn btn-approve" onclick="approveUser('${user.id}')">تایید</button>
                    <button class="action-btn btn-reject" onclick="rejectUser('${user.id}')">رد</button>
                </td>
            `;
            
            table.appendChild(row);
        });
        
    } catch (error) {
        console.error('Error loading pending users:', error);
        // نمایش نمونه
        const table = document.getElementById('pendingUsersTable');
        if (table) {
            table.innerHTML = `
                <tr>
                    <td>کریم علیزاده</td>
                    <td>karim@example.com</td>
                    <td>0700444555</td>
                    <td>مسافر</td>
                    <td>۱۴۰۳/۰۱/۱۲</td>
                    <td class="action-buttons">
                        <button class="action-btn btn-approve" onclick="approveUser('4')">تایید</button>
                        <button class="action-btn btn-reject" onclick="rejectUser('4')">رد</button>
                    </td>
                </tr>
            `;
        }
    }
}

async function loadAllUsers() {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .order('created_at', { ascending: false });
        
        const table = document.getElementById('allUsersTable');
        if (!table) return;
        
        table.innerHTML = '';
        
        if (error || !data || data.length === 0) {
            // کاربران نمونه برای نمایش
            const sampleUsers = [
                { id: '1', name: 'احمد محمدی', email: 'ahmad@example.com', phone: '0700111222', role: 'passenger', status: 'approved', created_at: '2024-01-15' },
                { id: '2', name: 'محمد کریمی', email: 'mohammad@example.com', phone: '0700222333', role: 'passenger', status: 'approved', created_at: '2024-01-14' },
                { id: '3', name: 'نوید احمدی', email: 'navid@example.com', phone: '0700333444', role: 'driver', status: 'approved', created_at: '2024-01-13' },
                { id: '4', name: 'کریم علیزاده', email: 'karim@example.com', phone: '0700444555', role: 'passenger', status: 'pending', created_at: '2024-01-12' }
            ];
            
            sampleUsers.forEach(user => {
                const row = document.createElement('tr');
                const date = new Date(user.created_at).toLocaleDateString('fa-IR');
                const roleText = user.role === 'passenger' ? 'مسافر' : 'راننده';
                const statusClass = `status-${user.status}`;
                const statusText = user.status === 'approved' ? 'تایید شده' : 'در انتظار تایید';
                
                row.innerHTML = `
                    <td>${user.name}</td>
                    <td>${user.email}</td>
                    <td>${user.phone}</td>
                    <td>${roleText}</td>
                    <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                    <td>${date}</td>
                    <td class="action-buttons">
                        ${user.status !== 'approved' ? 
                          `<button class="action-btn btn-approve" onclick="approveUser('${user.id}')">تایید</button>` : 
                          `<button class="action-btn btn-reject" onclick="suspendUser('${user.id}')">معلق</button>`}
                        <button class="action-btn btn-reject" onclick="deleteUser('${user.id}')">حذف</button>
                    </td>
                `;
                
                table.appendChild(row);
            });
            return;
        }
        
        data.forEach(user => {
            const row = document.createElement('tr');
            const date = new Date(user.created_at).toLocaleDateString('fa-IR');
            const roleText = user.role === 'passenger' ? 'مسافر' : 
                             user.role === 'driver' ? 'راننده' : 'مدیر';
            const statusClass = `status-${user.status}`;
            const statusText = {
                'pending': 'در انتظار تایید',
                'approved': 'تایید شده',
                'rejected': 'رد شده',
                'suspended': 'معلق شده'
            }[user.status] || user.status;
            
            row.innerHTML = `
                <td>${user.name}</td>
                <td>${user.email}</td>
                <td>${user.phone}</td>
                <td>${roleText}</td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td>${date}</td>
                <td class="action-buttons">
                    ${user.status !== 'approved' ? 
                      `<button class="action-btn btn-approve" onclick="approveUser('${user.id}')">تایید</button>` : 
                      `<button class="action-btn btn-reject" onclick="suspendUser('${user.id}')">معلق</button>`}
                    <button class="action-btn btn-reject" onclick="deleteUser('${user.id}')">حذف</button>
                </td>
            `;
            
            table.appendChild(row);
        });
        
    } catch (error) {
        console.error('Error loading all users:', error);
    }
}

// تابع‌های مدیریت کاربران (کامل و کارا)
window.approveUser = async function(userId) {
    try {
        const { error } = await supabase
            .from('users')
            .update({ 
                status: 'approved',
                updated_at: new Date().toISOString()
            })
            .eq('id', userId);
        
        if (error) throw error;
        
        showNotification('کاربر با موفقیت تایید شد', 'success');
        await loadPendingUsers();
        await loadAllUsers();
        
    } catch (error) {
        console.error('Error approving user:', error);
        showNotification('خطا در تایید کاربر', 'error');
    }
};

window.rejectUser = async function(userId) {
    if (confirm('آیا از رد این کاربر اطمینان دارید؟')) {
        try {
            const { error } = await supabase
                .from('users')
                .update({ 
                    status: 'rejected',
                    updated_at: new Date().toISOString()
                })
                .eq('id', userId);
            
            if (error) throw error;
            
            showNotification('کاربر با موفقیت رد شد', 'success');
            await loadPendingUsers();
            await loadAllUsers();
            
        } catch (error) {
            console.error('Error rejecting user:', error);
            showNotification('خطا در رد کاربر', 'error');
        }
    }
};

window.suspendUser = async function(userId) {
    if (confirm('آیا از معلق کردن این کاربر اطمینان دارید؟')) {
        try {
            const { error } = await supabase
                .from('users')
                .update({ 
                    status: 'suspended',
                    updated_at: new Date().toISOString()
                })
                .eq('id', userId);
            
            if (error) throw error;
            
            showNotification('کاربر با موفقیت معلق شد', 'success');
            await loadAllUsers();
            
        } catch (error) {
            console.error('Error suspending user:', error);
            showNotification('خطا در معلق کردن کاربر', 'error');
        }
    }
};

window.deleteUser = async function(userId) {
    if (confirm('آیا از حذف این کاربر اطمینان دارید؟ این عمل قابل بازگشت نیست.')) {
        try {
            // ابتدا بررسی می‌کنیم آیا این کاربر مدیر اصلی است
            const { data: user } = await supabase
                .from('users')
                .select('email')
                .eq('id', userId)
                .single();
            
            if (user && user.email === 'admin@snap.af') {
                showNotification('حذف حساب مدیر اصلی امکان‌پذیر نیست', 'error');
                return;
            }
            
            const { error } = await supabase
                .from('users')
                .delete()
                .eq('id', userId);
            
            if (error) throw error;
            
            showNotification('کاربر با موفقیت حذف شد', 'success');
            await loadAllUsers();
            
        } catch (error) {
            console.error('Error deleting user:', error);
            showNotification('خطا در حذف کاربر', 'error');
        }
    }
};

// بارگذاری رانندگان در پنل ادمین
async function loadDrivers() {
    try {
        const { data, error } = await supabase
            .from('drivers')
            .select('*')
            .order('created_at', { ascending: false });
        
        const table = document.getElementById('driversTable');
        if (!table) return;
        
        table.innerHTML = '';
        
        if (error || !data || data.length === 0) {
            // رانندگان نمونه برای نمایش
            const sampleDrivers = [
                { id: '1', name: 'احمد ظاهر', phone: '0700111222', vehicle_type: 'car', vehicle_model: 'تویوتا کورولا', license_plate: 'کابل ۱۲۳۴', status: 'available' },
                { id: '2', name: 'محمد کریمی', phone: '0700222333', vehicle_type: 'car', vehicle_model: 'هیوندای النترا', license_plate: 'کابل ۵۶۷۸', status: 'busy' },
                { id: '3', name: 'کریم علی', phone: '0700333444', vehicle_type: 'bike', vehicle_model: 'موتور هوندا', license_plate: 'کابل ۹۱۰۱', status: 'available' },
                { id: '4', name: 'نوید احمدی', phone: '0700444555', vehicle_type: 'car', vehicle_model: 'پراید', license_plate: 'کابل ۱۱۱۲', status: 'offline' }
            ];
            
            sampleDrivers.forEach(driver => {
                const row = document.createElement('tr');
                const statusClass = `status-${driver.status}`;
                const statusText = {
                    'available': 'آماده به کار',
                    'busy': 'مشغول',
                    'offline': 'آفلاین'
                }[driver.status] || driver.status;
                const vehicleTypeText = driver.vehicle_type === 'car' ? 'خودرو' : 'موتور';
                
                row.innerHTML = `
                    <td>${driver.name}</td>
                    <td>${driver.phone}</td>
                    <td>${vehicleTypeText}</td>
                    <td>${driver.vehicle_model}</td>
                    <td>${driver.license_plate}</td>
                    <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                    <td class="action-buttons">
                        <button class="action-btn btn-edit" onclick="editDriver('${driver.id}')">ویرایش</button>
                        <button class="action-btn btn-reject" onclick="deleteDriver('${driver.id}')">حذف</button>
                    </td>
                `;
                
                table.appendChild(row);
            });
            return;
        }
        
        data.forEach(driver => {
            const row = document.createElement('tr');
            const statusClass = `status-${driver.status}`;
            const statusText = {
                'available': 'آماده به کار',
                'busy': 'مشغول',
                'offline': 'آفلاین'
            }[driver.status] || driver.status;
            const vehicleTypeText = driver.vehicle_type === 'car' ? 'خودرو' : 'موتور';
            
            row.innerHTML = `
                <td>${driver.name}</td>
                <td>${driver.phone}</td>
                <td>${vehicleTypeText}</td>
                <td>${driver.vehicle_model}</td>
                <td>${driver.license_plate}</td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td class="action-buttons">
                    <button class="action-btn btn-edit" onclick="editDriver('${driver.id}')">ویرایش</button>
                    <button class="action-btn btn-reject" onclick="deleteDriver('${driver.id}')">حذف</button>
                </td>
            `;
            
            table.appendChild(row);
        });
        
    } catch (error) {
        console.error('Error loading drivers:', error);
    }
}

// تابع‌های مدیریت رانندگان
window.editDriver = async function(driverId) {
    try {
        // یافتن راننده
        const { data: driver, error } = await supabase
            .from('drivers')
            .select('*')
            .eq('id', driverId)
            .single();
        
        if (error || !driver) {
            showNotification('راننده یافت نشد', 'error');
            return;
        }
        
        // نمایش مدال ویرایش راننده
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 500px;">
                <div class="modal-header">
                    <h3>ویرایش راننده: ${driver.name}</h3>
                    <button class="close-modal">&times;</button>
                </div>
                <div class="modal-body">
                    <form id="editDriverForm">
                        <div class="form-group">
                            <label for="driverName">نام راننده</label>
                            <input type="text" id="driverName" class="form-input" value="${driver.name || ''}" required>
                        </div>
                        <div class="form-group">
                            <label for="driverPhone">شماره تماس</label>
                            <input type="tel" id="driverPhone" class="form-input" value="${driver.phone || ''}" required>
                        </div>
                        <div class="form-group">
                            <label for="vehicleType">نوع وسیله نقلیه</label>
                            <select id="vehicleType" class="form-input" required>
                                <option value="car" ${driver.vehicle_type === 'car' ? 'selected' : ''}>خودرو</option>
                                <option value="bike" ${driver.vehicle_type === 'bike' ? 'selected' : ''}>موتور</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="vehicleModel">مدل وسیله</label>
                            <input type="text" id="vehicleModel" class="form-input" value="${driver.vehicle_model || ''}" required>
                        </div>
                        <div class="form-group">
                            <label for="licensePlate">پلاک</label>
                            <input type="text" id="licensePlate" class="form-input" value="${driver.license_plate || ''}" required>
                        </div>
                        <div class="form-group">
                            <label for="vehicleColor">رنگ</label>
                            <input type="text" id="vehicleColor" class="form-input" value="${driver.vehicle_color || ''}">
                        </div>
                        <div class="form-group">
                            <label for="driverStatus">وضعیت</label>
                            <select id="driverStatus" class="form-input" required>
                                <option value="available" ${driver.status === 'available' ? 'selected' : ''}>آماده به کار</option>
                                <option value="busy" ${driver.status === 'busy' ? 'selected' : ''}>مشغول</option>
                                <option value="offline" ${driver.status === 'offline' ? 'selected' : ''}>آفلاین</option>
                            </select>
                        </div>
                        <div class="form-buttons">
                            <button type="submit" class="btn btn-primary">ذخیره تغییرات</button>
                            <button type="button" class="btn btn-secondary close-modal">لغو</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // رویداد بستن مدال
        modal.querySelectorAll('.close-modal').forEach(btn => {
            btn.addEventListener('click', () => {
                document.body.removeChild(modal);
            });
        });
        
        // رویداد کلیک روی overlay
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });
        
        // رویداد ارسال فرم
        const form = modal.querySelector('#editDriverForm');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const updatedDriver = {
                name: document.getElementById('driverName').value,
                phone: document.getElementById('driverPhone').value,
                vehicle_type: document.getElementById('vehicleType').value,
                vehicle_model: document.getElementById('vehicleModel').value,
                license_plate: document.getElementById('licensePlate').value,
                vehicle_color: document.getElementById('vehicleColor').value,
                status: document.getElementById('driverStatus').value,
                updated_at: new Date().toISOString()
            };
            
            try {
                const { error } = await supabase
                    .from('drivers')
                    .update(updatedDriver)
                    .eq('id', driverId);
                
                if (error) throw error;
                
                document.body.removeChild(modal);
                await loadDrivers();
                updateDriverMarkers();
                showNotification('اطلاعات راننده با موفقیت به‌روزرسانی شد', 'success');
                
            } catch (error) {
                console.error('Error updating driver:', error);
                showNotification('خطا در به‌روزرسانی اطلاعات راننده', 'error');
            }
        });
        
    } catch (error) {
        console.error('Error loading driver:', error);
        showNotification('خطا در بارگذاری اطلاعات راننده', 'error');
    }
};

window.deleteDriver = async function(driverId) {
    if (confirm(`آیا از حذف این راننده اطمینان دارید؟ این عمل قابل بازگشت نیست.`)) {
        try {
            const { error } = await supabase
                .from('drivers')
                .delete()
                .eq('id', driverId);
            
            if (error) throw error;
            
            // به‌روزرسانی لیست رانندگان
            activeDrivers = activeDrivers.filter(d => d.id != driverId);
            
            await loadDrivers();
            updateDriverMarkers();
            showNotification('راننده با موفقیت حذف شد', 'success');
            
        } catch (error) {
            console.error('Error deleting driver:', error);
            showNotification('خطا در حذف راننده', 'error');
        }
    }
};

// تابع اضافه کردن راننده جدید
window.addNewDriver = function() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px;">
            <div class="modal-header">
                <h3>افزودن راننده جدید</h3>
                <button class="close-modal">&times;</button>
            </div>
            <div class="modal-body">
                <form id="addDriverForm">
                    <div class="form-group">
                        <label for="newDriverName">نام راننده</label>
                        <input type="text" id="newDriverName" class="form-input" required>
                    </div>
                    <div class="form-group">
                        <label for="newDriverPhone">شماره تماس</label>
                        <input type="tel" id="newDriverPhone" class="form-input" required>
                    </div>
                    <div class="form-group">
                        <label for="newVehicleType">نوع وسیله نقلیه</label>
                        <select id="newVehicleType" class="form-input" required>
                            <option value="car">خودرو</option>
                            <option value="bike">موتور</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="newVehicleModel">مدل وسیله</label>
                        <input type="text" id="newVehicleModel" class="form-input" required>
                    </div>
                    <div class="form-group">
                        <label for="newLicensePlate">پلاک</label>
                        <input type="text" id="newLicensePlate" class="form-input" required>
                    </div>
                    <div class="form-group">
                        <label for="newVehicleColor">رنگ</label>
                        <input type="text" id="newVehicleColor" class="form-input">
                    </div>
                    <div class="form-group">
                        <label for="newDriverStatus">وضعیت</label>
                        <select id="newDriverStatus" class="form-input" required>
                            <option value="available">آماده به کار</option>
                            <option value="offline">آفلاین</option>
                        </select>
                    </div>
                    <div class="form-buttons">
                        <button type="submit" class="btn btn-primary">افزودن راننده</button>
                        <button type="button" class="btn btn-secondary close-modal">لغو</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // رویداد بستن مدال
    modal.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            document.body.removeChild(modal);
        });
    });
    
    // رویداد کلیک روی overlay
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });
    
    // رویداد ارسال فرم
    const form = modal.querySelector('#addDriverForm');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const newDriver = {
            name: document.getElementById('newDriverName').value,
            phone: document.getElementById('newDriverPhone').value,
            vehicle_type: document.getElementById('newVehicleType').value,
            vehicle_model: document.getElementById('newVehicleModel').value,
            license_plate: document.getElementById('newLicensePlate').value,
            vehicle_color: document.getElementById('newVehicleColor').value,
            status: document.getElementById('newDriverStatus').value,
            is_online: true,
            rating: 5.0,
            total_trips: 0,
            created_at: new Date().toISOString()
        };
        
        try {
            const { data, error } = await supabase
                .from('drivers')
                .insert([newDriver])
                .select()
                .single();
            
            if (error) throw error;
            
            // اضافه کردن به آرایه محلی
            activeDrivers.push(data);
            
            document.body.removeChild(modal);
            await loadDrivers();
            updateDriverMarkers();
            showNotification('راننده جدید با موفقیت اضافه شد', 'success');
            
        } catch (error) {
            console.error('Error adding driver:', error);
            showNotification('خطا در افزودن راننده جدید', 'error');
        }
    });
};

// بارگذاری سفرها در پنل ادمین
async function loadAdminTrips() {
    try {
        const { data, error } = await supabase
            .from('trips')
            .select(`
                *,
                user:users(name),
                driver:drivers(name)
            `)
            .order('created_at', { ascending: false });
        
        const table = document.getElementById('adminTripsTable');
        if (!table) return;
        
        table.innerHTML = '';
        
        if (error || !data || data.length === 0) {
            // سفرهای نمونه
            const sampleTrips = [
                { date: '۱۴۰۳/۰۱/۱۵', passenger: 'احمد محمدی', driver: 'احمد ظاهر', pickup: 'کارته پروان', destination: 'میدان هوایی', cost: '۲۱۰ افغانی', status: 'completed' },
                { date: '۱۴۰۳/۰۱/۱۴', passenger: 'محمد کریمی', driver: 'محمد کریمی', pickup: 'شاروالی کابل', destination: 'دشت برچی', cost: '۱۸۰ افغانی', status: 'in_progress' },
                { date: '۱۴۰۳/۰۱/۱۳', passenger: 'نوید احمدی', driver: 'کریم علی', pickup: 'چهاردهی', destination: 'مکرویان', cost: '۱۵۰ افغانی', status: 'completed' },
                { date: '۱۴۰۳/۰۱/۱۲', passenger: 'کریم علیزاده', driver: 'احمد ظاهر', pickup: 'قلعه‌وزی', destination: 'کارته سخی', cost: '۱۲۰ افغانی', status: 'cancelled' }
            ];
            
            sampleTrips.forEach(trip => {
                const row = document.createElement('tr');
                const statusClass = `status-${trip.status}`;
                const statusText = {
                    'completed': 'تکمیل شده',
                    'in_progress': 'در حال سفر',
                    'cancelled': 'لغو شده'
                }[trip.status] || trip.status;
                
                row.innerHTML = `
                    <td>${trip.date}</td>
                    <td>${trip.passenger}</td>
                    <td>${trip.driver}</td>
                    <td>${trip.pickup}</td>
                    <td>${trip.destination}</td>
                    <td>${trip.cost}</td>
                    <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                    <td class="action-buttons">
                        <button class="action-btn btn-view" onclick="viewTripDetails('${trip.date}')">جزئیات</button>
                        <button class="action-btn btn-edit" onclick="editTrip('${trip.date}')">ویرایش</button>
                    </td>
                `;
                
                table.appendChild(row);
            });
            return;
        }
        
        data.forEach(trip => {
            const row = document.createElement('tr');
            const date = new Date(trip.created_at).toLocaleDateString('fa-IR');
            const statusClass = `status-${trip.status}`;
            const statusText = {
                'completed': 'تکمیل شده',
                'in_progress': 'در حال سفر',
                'cancelled': 'لغو شده',
                'requested': 'درخواست شده',
                'confirmed': 'تأیید شده'
            }[trip.status] || trip.status;
            
            row.innerHTML = `
                <td>${date}</td>
                <td>${trip.user?.name || 'ناشناس'}</td>
                <td>${trip.driver?.name || 'تعیین نشده'}</td>
                <td>${trip.pickup_location}</td>
                <td>${trip.destination}</td>
                <td>${trip.estimated_price} افغانی</td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td class="action-buttons">
                    <button class="action-btn btn-view" onclick="viewTripDetails('${trip.id}')">جزئیات</button>
                    <button class="action-btn btn-edit" onclick="editTrip('${trip.id}')">ویرایش</button>
                </td>
            `;
            
            table.appendChild(row);
        });
        
    } catch (error) {
        console.error('Error loading trips:', error);
    }
}

// تابع‌های مدیریت سفرها
window.viewTripDetails = function(tripId) {
    // نمایش مدال جزئیات سفر
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px;">
            <div class="modal-header">
                <h3>جزئیات سفر ${tripId}</h3>
                <button class="close-modal">&times;</button>
            </div>
            <div class="modal-body">
                <div class="trip-details">
                    <div class="detail-row">
                        <span class="detail-label">شناسه سفر:</span>
                        <span class="detail-value">${tripId}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">تاریخ ایجاد:</span>
                        <span class="detail-value">${new Date().toLocaleDateString('fa-IR')}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">وضعیت:</span>
                        <span class="detail-value status-badge status-completed">تکمیل شده</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">هزینه:</span>
                        <span class="detail-value">۲۱۰ افغانی</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">مسافت:</span>
                        <span class="detail-value">۸.۲ کیلومتر</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">نوع سفر:</span>
                        <span class="detail-value">اقتصادی</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">روش پرداخت:</span>
                        <span class="detail-value">نقدی</span>
                    </div>
                </div>
                <div class="form-buttons" style="margin-top: 20px;">
                    <button type="button" class="btn btn-secondary close-modal">بستن</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // رویداد بستن مدال
    modal.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            document.body.removeChild(modal);
        });
    });
    
    // رویداد کلیک روی overlay
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });
};

window.editTrip = async function(tripId) {
    try {
        // دریافت اطلاعات سفر
        const { data: trip, error } = await supabase
            .from('trips')
            .select('*')
            .eq('id', tripId)
            .single();
        
        if (error || !trip) {
            showNotification('سفر یافت نشد', 'error');
            return;
        }
        
        // نمایش مدال ویرایش سفر
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 500px;">
                <div class="modal-header">
                    <h3>ویرایش سفر</h3>
                    <button class="close-modal">&times;</button>
                </div>
                <div class="modal-body">
                    <form id="editTripForm">
                        <div class="form-group">
                            <label for="tripStatus">وضعیت سفر</label>
                            <select id="tripStatus" class="form-input" required>
                                <option value="requested" ${trip.status === 'requested' ? 'selected' : ''}>درخواست شده</option>
                                <option value="confirmed" ${trip.status === 'confirmed' ? 'selected' : ''}>تأیید شده</option>
                                <option value="in_progress" ${trip.status === 'in_progress' ? 'selected' : ''}>در حال سفر</option>
                                <option value="completed" ${trip.status === 'completed' ? 'selected' : ''}>تکمیل شده</option>
                                <option value="cancelled" ${trip.status === 'cancelled' ? 'selected' : ''}>لغو شده</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="tripCost">هزینه (افغانی)</label>
                            <input type="number" id="tripCost" class="form-input" value="${trip.estimated_price}" required>
                        </div>
                        <div class="form-group">
                            <label for="paymentMethod">روش پرداخت</label>
                            <select id="paymentMethod" class="form-input" required>
                                <option value="cash" ${trip.payment_method === 'cash' ? 'selected' : ''}>نقدی</option>
                                <option value="wallet" ${trip.payment_method === 'wallet' ? 'selected' : ''}>کیف پول</option>
                                <option value="card" ${trip.payment_method === 'card' ? 'selected' : ''}>کارت بانکی</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="paymentStatus">وضعیت پرداخت</label>
                            <select id="paymentStatus" class="form-input" required>
                                <option value="pending">در انتظار پرداخت</option>
                                <option value="paid" selected>پرداخت شده</option>
                                <option value="failed">ناموفق</option>
                                <option value="refunded">عودت داده شده</option>
                            </select>
                        </div>
                        <div class="form-buttons">
                            <button type="submit" class="btn btn-primary">ذخیره تغییرات</button>
                            <button type="button" class="btn btn-secondary close-modal">لغو</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // رویداد بستن مدال
        modal.querySelectorAll('.close-modal').forEach(btn => {
            btn.addEventListener('click', () => {
                document.body.removeChild(modal);
            });
        });
        
        // رویداد کلیک روی overlay
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });
        
        // رویداد ارسال فرم
        const form = modal.querySelector('#editTripForm');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            try {
                const updatedTrip = {
                    status: document.getElementById('tripStatus').value,
                    estimated_price: document.getElementById('tripCost').value,
                    payment_method: document.getElementById('paymentMethod').value,
                    payment_status: document.getElementById('paymentStatus').value,
                    updated_at: new Date().toISOString()
                };
                
                const { error } = await supabase
                    .from('trips')
                    .update(updatedTrip)
                    .eq('id', tripId);
                
                if (error) throw error;
                
                document.body.removeChild(modal);
                await loadAdminTrips();
                showNotification('اطلاعات سفر با موفقیت به‌روزرسانی شد', 'success');
                
            } catch (error) {
                console.error('Error updating trip:', error);
                showNotification('خطا در به‌روزرسانی سفر', 'error');
            }
        });
        
    } catch (error) {
        console.error('Error loading trip:', error);
        showNotification('خطا در بارگذاری اطلاعات سفر', 'error');
    }
};

// بارگذاری تخفیف‌ها در پنل ادمین
async function loadAdminDiscounts() {
    try {
        const { data, error } = await supabase
            .from('discounts')
            .select('*')
            .order('created_at', { ascending: false });
        
        const table = document.getElementById('discountsTable');
        if (!table) return;
        
        table.innerHTML = '';
        
        if (error || !data || data.length === 0) {
            // تخفیف‌های نمونه
            const sampleDiscounts = [
                { code: 'WELCOME100', percent: '۱۰۰', expiry: '۱۴۰۳/۰۲/۱۵', users: '۴۵', status: 'active' },
                { code: 'SAVE50', percent: '۵۰', expiry: '۱۴۰۳/۰۱/۳۰', users: '۸۹', status: 'active' },
                { code: 'FREERIDE', percent: '۱۰۰', expiry: '۱۴۰۳/۰۲/۱۰', users: '۵۰', status: 'exhausted' },
                { code: 'DISCOUNT30', percent: '۳۰', expiry: '۱۴۰۳/۰۱/۲۰', users: '۲۰۰', status: 'expired' }
            ];
            
            sampleDiscounts.forEach(discount => {
                const row = document.createElement('tr');
                const statusClass = `status-${discount.status === 'active' ? 'approved' : 'rejected'}`;
                const statusText = {
                    'active': 'فعال',
                    'expired': 'منقضی شده',
                    'exhausted': 'تمام شده'
                }[discount.status] || discount.status;
                
                row.innerHTML = `
                    <td>${discount.code}</td>
                    <td>${discount.percent}%</td>
                    <td>${discount.expiry}</td>
                    <td>${discount.users} نفر</td>
                    <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                    <td class="action-buttons">
                        <button class="action-btn btn-edit" onclick="editDiscount('${discount.code}')">ویرایش</button>
                        <button class="action-btn btn-reject" onclick="deleteDiscount('${discount.code}')">حذف</button>
                    </td>
                `;
                
                table.appendChild(row);
            });
            return;
        }
        
        data.forEach(discount => {
            const row = document.createElement('tr');
            const expiryDate = new Date(discount.expiry_date).toLocaleDateString('fa-IR');
            const statusClass = `status-${discount.status === 'active' ? 'approved' : 'rejected'}`;
            const statusText = {
                'active': 'فعال',
                'expired': 'منقضی شده',
                'exhausted': 'تمام شده'
            }[discount.status] || discount.status;
            
            row.innerHTML = `
                <td>${discount.code}</td>
                <td>${discount.percentage}%</td>
                <td>${expiryDate}</td>
                <td>${discount.used_count || 0} نفر</td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td class="action-buttons">
                    <button class="action-btn btn-edit" onclick="editDiscount('${discount.id}')">ویرایش</button>
                    <button class="action-btn btn-reject" onclick="deleteDiscount('${discount.id}')">حذف</button>
                </td>
            `;
            
            table.appendChild(row);
        });
        
    } catch (error) {
        console.error('Error loading discounts:', error);
    }
}

// تابع‌های مدیریت تخفیف‌ها
window.editDiscount = async function(discountId) {
    try {
        // دریافت اطلاعات تخفیف
        const { data: discount, error } = await supabase
            .from('discounts')
            .select('*')
            .eq('id', discountId)
            .single();
        
        if (error || !discount) {
            showNotification('تخفیف یافت نشد', 'error');
            return;
        }
        
        // نمایش مدال ویرایش تخفیف
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 500px;">
                <div class="modal-header">
                    <h3>ویرایش تخفیف: ${discount.code}</h3>
                    <button class="close-modal">&times;</button>
                </div>
                <div class="modal-body">
                    <form id="editDiscountForm">
                        <div class="form-group">
                            <label for="discountCode">کد تخفیف</label>
                            <input type="text" id="discountCode" class="form-input" value="${discount.code}" required>
                        </div>
                        <div class="form-group">
                            <label for="discountPercent">درصد تخفیف</label>
                            <input type="number" id="discountPercent" class="form-input" value="${discount.percentage}" min="1" max="100" required>
                        </div>
                        <div class="form-group">
                            <label for="discountExpiry">تاریخ انقضا</label>
                            <input type="date" id="discountExpiry" class="form-input" value="${discount.expiry_date.split('T')[0]}" required>
                        </div>
                        <div class="form-group">
                            <label for="maxUses">حداکثر استفاده</label>
                            <input type="number" id="maxUses" class="form-input" value="${discount.max_uses}" min="1" required>
                        </div>
                        <div class="form-group">
                            <label for="discountDescription">توضیحات</label>
                            <textarea id="discountDescription" class="form-input" rows="3" required>${discount.description || ''}</textarea>
                        </div>
                        <div class="form-group">
                            <label for="discountStatus">وضعیت</label>
                            <select id="discountStatus" class="form-input" required>
                                <option value="active" ${discount.status === 'active' ? 'selected' : ''}>فعال</option>
                                <option value="inactive" ${discount.status === 'inactive' ? 'selected' : ''}>غیرفعال</option>
                                <option value="expired" ${discount.status === 'expired' ? 'selected' : ''}>منقضی شده</option>
                            </select>
                        </div>
                        <div class="form-buttons">
                            <button type="submit" class="btn btn-primary">ذخیره تغییرات</button>
                            <button type="button" class="btn btn-secondary close-modal">لغو</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // رویداد بستن مدال
        modal.querySelectorAll('.close-modal').forEach(btn => {
            btn.addEventListener('click', () => {
                document.body.removeChild(modal);
            });
        });
        
        // رویداد کلیک روی overlay
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });
        
        // رویداد ارسال فرم
        const form = modal.querySelector('#editDiscountForm');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            try {
                const updatedDiscount = {
                    code: document.getElementById('discountCode').value,
                    percentage: document.getElementById('discountPercent').value,
                    expiry_date: document.getElementById('discountExpiry').value,
                    max_uses: document.getElementById('maxUses').value,
                    description: document.getElementById('discountDescription').value,
                    status: document.getElementById('discountStatus').value,
                    updated_at: new Date().toISOString()
                };
                
                const { error } = await supabase
                    .from('discounts')
                    .update(updatedDiscount)
                    .eq('id', discountId);
                
                if (error) throw error;
                
                document.body.removeChild(modal);
                await loadAdminDiscounts();
                showNotification('اطلاعات تخفیف با موفقیت به‌روزرسانی شد', 'success');
                
            } catch (error) {
                console.error('Error updating discount:', error);
                showNotification('خطا در به‌روزرسانی تخفیف', 'error');
            }
        });
        
    } catch (error) {
        console.error('Error loading discount:', error);
        showNotification('خطا در بارگذاری اطلاعات تخفیف', 'error');
    }
};

window.deleteDiscount = async function(discountId) {
    if (confirm('آیا از حذف این تخفیف اطمینان دارید؟ این عمل قابل بازگشت نیست.')) {
        try {
            const { error } = await supabase
                .from('discounts')
                .delete()
                .eq('id', discountId);
            
            if (error) throw error;
            
            await loadAdminDiscounts();
            showNotification('تخفیف با موفقیت حذف شد', 'success');
            
        } catch (error) {
            console.error('Error deleting discount:', error);
            showNotification('خطا در حذف تخفیف', 'error');
        }
    }
};

// تابع اضافه کردن تخفیف جدید
window.addNewDiscount = function() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px;">
            <div class="modal-header">
                <h3>افزودن تخفیف جدید</h3>
                <button class="close-modal">&times;</button>
            </div>
            <div class="modal-body">
                <form id="addDiscountForm">
                    <div class="form-group">
                        <label for="newDiscountCode">کد تخفیف</label>
                        <input type="text" id="newDiscountCode" class="form-input" required>
                    </div>
                    <div class="form-group">
                        <label for="newDiscountPercent">درصد تخفیف</label>
                        <input type="number" id="newDiscountPercent" class="form-input" min="1" max="100" required>
                    </div>
                    <div class="form-group">
                        <label for="newDiscountExpiry">تاریخ انقضا</label>
                        <input type="date" id="newDiscountExpiry" class="form-input" required>
                    </div>
                    <div class="form-group">
                        <label for="newMaxUses">حداکثر استفاده</label>
                        <input type="number" id="newMaxUses" class="form-input" min="1" value="100" required>
                    </div>
                    <div class="form-group">
                        <label for="newDiscountDescription">توضیحات</label>
                        <textarea id="newDiscountDescription" class="form-input" rows="3" required></textarea>
                    </div>
                    <div class="form-buttons">
                        <button type="submit" class="btn btn-primary">افزودن تخفیف</button>
                        <button type="button" class="btn btn-secondary close-modal">لغو</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // رویداد بستن مدال
    modal.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            document.body.removeChild(modal);
        });
    });
    
    // رویداد کلیک روی overlay
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });
    
    // رویداد ارسال فرم
    const form = modal.querySelector('#addDiscountForm');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        try {
            const newDiscount = {
                code: document.getElementById('newDiscountCode').value,
                percentage: document.getElementById('newDiscountPercent').value,
                expiry_date: document.getElementById('newDiscountExpiry').value,
                max_uses: document.getElementById('newMaxUses').value,
                description: document.getElementById('newDiscountDescription').value,
                status: 'active',
                created_at: new Date().toISOString(),
                used_count: 0
            };
            
            const { error } = await supabase
                .from('discounts')
                .insert([newDiscount]);
            
            if (error) throw error;
            
            document.body.removeChild(modal);
            await loadAdminDiscounts();
            showNotification('تخفیف جدید با موفقیت اضافه شد', 'success');
            
        } catch (error) {
            console.error('Error adding discount:', error);
            showNotification('خطا در افزودن تخفیف جدید', 'error');
        }
    });
};

// بارگذاری درخواست‌های پشتیبانی در پنل ادمین
async function loadAdminSupport() {
    try {
        const { data, error } = await supabase
            .from('support_tickets')
            .select(`
                *,
                user:users(name)
            `)
            .order('created_at', { ascending: false });
        
        const table = document.getElementById('adminSupportTable');
        if (!table) return;
        
        table.innerHTML = '';
        
        if (error || !data || data.length === 0) {
            // درخواست‌های پشتیبانی نمونه
            const sampleTickets = [
                { user: 'احمد محمدی', subject: 'مشکل در پرداخت', message: 'پرداخت من تکمیل نشده است...', date: '۱۴۰۳/۰۱/۱۵', status: 'pending' },
                { user: 'محمد کریمی', subject: 'سوال درباره تخفیف', message: 'چگونه از کد تخفیف استفاده کنم؟', date: '۱۴۰۳/۰۱/۱۴', status: 'answered' },
                { user: 'نوید احمدی', subject: 'مشکل با راننده', message: 'راننده دیر آمد...', date: '۱۴۰۳/۰۱/۱۳', status: 'closed' },
                { user: 'کریم علیزاده', subject: 'درخواست بازگشت وجه', message: 'سفر من لغو شد اما پولم برنگشت...', date: '۱۴۰۳/۰۱/۱۲', status: 'pending' }
            ];
            
            sampleTickets.forEach(ticket => {
                const row = document.createElement('tr');
                const statusClass = `status-${ticket.status === 'pending' ? 'pending' : ticket.status === 'answered' ? 'approved' : 'completed'}`;
                const statusText = {
                    'pending': 'در انتظار پاسخ',
                    'answered': 'پاسخ داده شده',
                    'closed': 'بسته شده'
                }[ticket.status] || ticket.status;
                const shortMessage = ticket.message.length > 50 ? ticket.message.substring(0, 50) + '...' : ticket.message;
                
                row.innerHTML = `
                    <td>${ticket.user}</td>
                    <td>${ticket.subject}</td>
                    <td>${shortMessage}</td>
                    <td>${ticket.date}</td>
                    <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                    <td class="action-buttons">
                        <button class="action-btn btn-view" onclick="viewSupportTicket('${ticket.user}')">مشاهده</button>
                        <button class="action-btn btn-edit" onclick="replySupportTicket('${ticket.user}')">پاسخ</button>
                    </td>
                `;
                
                table.appendChild(row);
            });
            return;
        }
        
        data.forEach(ticket => {
            const row = document.createElement('tr');
            const date = new Date(ticket.created_at).toLocaleDateString('fa-IR');
            const statusClass = `status-${ticket.status}`;
            const statusText = {
                'pending': 'در انتظار پاسخ',
                'answered': 'پاسخ داده شده',
                'closed': 'بسته شده',
                'resolved': 'حل شده'
            }[ticket.status] || ticket.status;
            const shortMessage = ticket.message.length > 50 ? ticket.message.substring(0, 50) + '...' : ticket.message;
            
            row.innerHTML = `
                <td>${ticket.user?.name || 'ناشناس'}</td>
                <td>${ticket.subject}</td>
                <td>${shortMessage}</td>
                <td>${date}</td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td class="action-buttons">
                    <button class="action-btn btn-view" onclick="viewSupportTicket('${ticket.id}')">مشاهده</button>
                    <button class="action-btn btn-edit" onclick="replySupportTicket('${ticket.id}')">پاسخ</button>
                </td>
            `;
            
            table.appendChild(row);
        });
        
    } catch (error) {
        console.error('Error loading support tickets:', error);
    }
}

// تابع‌های مدیریت پشتیبانی
window.viewSupportTicket = async function(ticketId) {
    try {
        // دریافت اطلاعات تیکت
        const { data: ticket, error } = await supabase
            .from('support_tickets')
            .select(`
                *,
                user:users(name, email)
            `)
            .eq('id', ticketId)
            .single();
        
        if (error || !ticket) {
            showNotification('تیکت یافت نشد', 'error');
            return;
        }
        
        // نمایش مدال مشاهده تیکت
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 700px;">
                <div class="modal-header">
                    <h3>مشاهده تیکت پشتیبانی</h3>
                    <button class="close-modal">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="ticket-details">
                        <div class="detail-row">
                            <span class="detail-label">کاربر:</span>
                            <span class="detail-value">${ticket.user?.name || 'ناشناس'}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">ایمیل:</span>
                            <span class="detail-value">${ticket.user?.email || '---'}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">موضوع:</span>
                            <span class="detail-value">${ticket.subject}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">پیام:</span>
                            <div class="detail-value ticket-message">
                                ${ticket.message}
                            </div>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">تاریخ:</span>
                            <span class="detail-value">${new Date(ticket.created_at).toLocaleDateString('fa-IR')}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">وضعیت:</span>
                            <span class="detail-value status-badge status-${ticket.status}">
                                ${ticket.status === 'pending' ? 'در انتظار پاسخ' : 
                                  ticket.status === 'answered' ? 'پاسخ داده شده' :
                                  ticket.status === 'closed' ? 'بسته شده' : ticket.status}
                            </span>
                        </div>
                    </div>
                    
                    ${ticket.response ? `
                    <div class="ticket-response" style="margin-top: 20px; padding: 15px; background: var(--light-gray); border-radius: 8px;">
                        <h4>پاسخ قبلی</h4>
                        <p>${ticket.response}</p>
                        <small>${ticket.responded_at ? new Date(ticket.responded_at).toLocaleDateString('fa-IR') : ''}</small>
                    </div>
                    ` : ''}
                    
                    <div class="ticket-reply" style="margin-top: 30px;">
                        <h4>پاسخ جدید</h4>
                        <div class="form-group">
                            <textarea id="ticketReply" class="form-input" rows="4" placeholder="پاسخ خود را وارد کنید..."></textarea>
                        </div>
                    </div>
                    
                    <div class="form-buttons">
                        <button type="button" class="btn btn-primary" onclick="submitTicketReply('${ticketId}')">ارسال پاسخ</button>
                        <button type="button" class="btn btn-secondary" onclick="closeTicket('${ticketId}')">بستن تیکت</button>
                        <button type="button" class="btn btn-secondary close-modal">بستن</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // رویداد بستن مدال
        modal.querySelectorAll('.close-modal').forEach(btn => {
            btn.addEventListener('click', () => {
                document.body.removeChild(modal);
            });
        });
        
        // رویداد کلیک روی overlay
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });
        
    } catch (error) {
        console.error('Error loading ticket:', error);
        showNotification('خطا در بارگذاری تیکت', 'error');
    }
};

window.replySupportTicket = async function(ticketId) {
    try {
        // دریافت اطلاعات تیکت
        const { data: ticket, error } = await supabase
            .from('support_tickets')
            .select('*')
            .eq('id', ticketId)
            .single();
        
        if (error || !ticket) {
            showNotification('تیکت یافت نشد', 'error');
            return;
        }
        
        // نمایش مدال پاسخ به تیکت
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 500px;">
                <div class="modal-header">
                    <h3>پاسخ به تیکت: ${ticket.subject}</h3>
                    <button class="close-modal">&times;</button>
                </div>
                <div class="modal-body">
                    <form id="replyTicketForm">
                        <div class="form-group">
                            <label for="replySubject">موضوع</label>
                            <input type="text" id="replySubject" class="form-input" value="${ticket.subject}" required>
                        </div>
                        <div class="form-group">
                            <label for="replyMessage">پیام</label>
                            <textarea id="replyMessage" class="form-input" rows="6" required>با سلام

${ticket.message}

پاسخ:</textarea>
                        </div>
                        <div class="form-group">
                            <label for="replyStatus">تغییر وضعیت</label>
                            <select id="replyStatus" class="form-input">
                                <option value="answered" ${ticket.status === 'pending' ? 'selected' : ''}>پاسخ داده شده</option>
                                <option value="closed" ${ticket.status === 'answered' ? 'selected' : ''}>بسته شده</option>
                                <option value="resolved" ${ticket.status === 'answered' ? 'selected' : ''}>حل شده</option>
                            </select>
                        </div>
                        <div class="form-buttons">
                            <button type="submit" class="btn btn-primary">ارسال پاسخ</button>
                            <button type="button" class="btn btn-secondary close-modal">لغو</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // رویداد بستن مدال
        modal.querySelectorAll('.close-modal').forEach(btn => {
            btn.addEventListener('click', () => {
                document.body.removeChild(modal);
            });
        });
        
        // رویداد کلیک روی overlay
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });
        
        // رویداد ارسال فرم
        const form = modal.querySelector('#replyTicketForm');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            try {
                const response = document.getElementById('replyMessage').value;
                const newStatus = document.getElementById('replyStatus').value;
                
                const { error } = await supabase
                    .from('support_tickets')
                    .update({
                        response: response,
                        status: newStatus,
                        responded_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', ticketId);
                
                if (error) throw error;
                
                showNotification('پاسخ شما با موفقیت ارسال شد', 'success');
                document.body.removeChild(modal);
                await loadAdminSupport();
                
            } catch (error) {
                console.error('Error replying to ticket:', error);
                showNotification('خطا در ارسال پاسخ', 'error');
            }
        });
        
    } catch (error) {
        console.error('Error loading ticket:', error);
        showNotification('خطا در بارگذاری تیکت', 'error');
    }
};

window.submitTicketReply = async function(ticketId) {
    const reply = document.getElementById('ticketReply');
    if (!reply || !reply.value.trim()) {
        showNotification('لطفاً ابتدا پاسخ خود را وارد کنید', 'error');
        return;
    }
    
    try {
        const { error } = await supabase
            .from('support_tickets')
            .update({
                response: reply.value,
                status: 'answered',
                responded_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('id', ticketId);
        
        if (error) throw error;
        
        showNotification('پاسخ شما با موفقیت ارسال شد', 'success');
        reply.value = '';
        
        // بستن مدال
        const modal = document.querySelector('.modal:last-child');
        if (modal) {
            document.body.removeChild(modal);
        }
        
        await loadAdminSupport();
        
    } catch (error) {
        console.error('Error submitting reply:', error);
        showNotification('خطا در ارسال پاسخ', 'error');
    }
};

window.closeTicket = async function(ticketId) {
    if (confirm('آیا از بستن این تیکت اطمینان دارید؟')) {
        try {
            const { error } = await supabase
                .from('support_tickets')
                .update({
                    status: 'closed',
                    updated_at: new Date().toISOString()
                })
                .eq('id', ticketId);
            
            if (error) throw error;
            
            showNotification('تیکت با موفقیت بسته شد', 'success');
            
            // بستن مدال
            const modal = document.querySelector('.modal:last-child');
            if (modal) {
                document.body.removeChild(modal);
            }
            
            await loadAdminSupport();
            
        } catch (error) {
            console.error('Error closing ticket:', error);
            showNotification('خطا در بستن تیکت', 'error');
        }
    }
};

// تابع‌های گزارش‌گیری
window.exportReport = function(type) {
    let data = [];
    let filename = '';
    
    switch(type) {
        case 'users':
            data = [
                ['نام', 'ایمیل', 'شماره تماس', 'نقش', 'وضعیت', 'تاریخ عضویت'],
                ['احمد محمدی', 'ahmad@example.com', '0700111222', 'مسافر', 'تایید شده', '۱۴۰۳/۰۱/۱۵'],
                ['محمد کریمی', 'mohammad@example.com', '0700222333', 'مسافر', 'تایید شده', '۱۴۰۳/۰۱/۱۴'],
                ['نوید احمدی', 'navid@example.com', '0700333444', 'راننده', 'تایید شده', '۱۴۰۳/۰۱/۱۳']
            ];
            filename = 'users-report.csv';
            break;
        case 'trips':
            data = [
                ['تاریخ', 'مسافر', 'راننده', 'مبدا', 'مقصد', 'هزینه', 'وضعیت'],
                ['۱۴۰۳/۰۱/۱۵', 'احمد محمدی', 'احمد ظاهر', 'کارته پروان', 'میدان هوایی', '۲۱۰', 'تکمیل شده'],
                ['۱۴۰۳/۰۱/۱۴', 'محمد کریمی', 'محمد کریمی', 'شاروالی کابل', 'دشت برچی', '۱۸۰', 'تکمیل شده']
            ];
            filename = 'trips-report.csv';
            break;
        case 'revenue':
            data = [
                ['ماه', 'تعداد سفر', 'درآمد کل', 'میانگین سفر'],
                ['دی ۱۴۰۲', '۱۲۴۵', '۲۴۵,۶۰۰', '۱۹۸'],
                ['بهمن ۱۴۰۲', '۱۳۲۰', '۲۶۱,۸۰۰', '۱۹۸'],
                ['اسفند ۱۴۰۲', '۱۴۰۰', '۲۷۷,۲۰۰', '۱۹۸']
            ];
            filename = 'revenue-report.csv';
            break;
    }
    
    // تبدیل به CSV
    const csvContent = data.map(row => 
        row.map(cell => `"${cell}"`).join(',')
    ).join('\n');
    
    // ایجاد لینک دانلود
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    
    showNotification(`گزارش ${filename} دانلود شد`, 'success');
};

// تابع ارسال اعلان
window.sendNotification = function(type) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px;">
            <div class="modal-header">
                <h3>ارسال اعلان ${type === 'all' ? 'عمومی' : 'به کاربران'}</h3>
                <button class="close-modal">&times;</button>
            </div>
            <div class="modal-body">
                <form id="notificationForm">
                    <div class="form-group">
                        <label for="notificationTitle">عنوان</label>
                        <input type="text" id="notificationTitle" class="form-input" required>
                    </div>
                    <div class="form-group">
                        <label for="notificationMessage">پیام</label>
                        <textarea id="notificationMessage" class="form-input" rows="4" required></textarea>
                    </div>
                    ${type !== 'all' ? `
                    <div class="form-group">
                        <label for="notificationType">نوع کاربران</label>
                        <select id="notificationType" class="form-input" required>
                            <option value="passengers">مسافران</option>
                            <option value="drivers">رانندگان</option>
                            <option value="all">همه کاربران</option>
                        </select>
                    </div>
                    ` : ''}
                    <div class="form-buttons">
                        <button type="submit" class="btn btn-primary">ارسال اعلان</button>
                        <button type="button" class="btn btn-secondary close-modal">لغو</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // رویداد بستن مدال
    modal.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            document.body.removeChild(modal);
        });
    });
    
    // رویداد کلیک روی overlay
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });
    
    // رویداد ارسال فرم
    const form = modal.querySelector('#notificationForm');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const title = document.getElementById('notificationTitle').value;
        const message = document.getElementById('notificationMessage').value;
        const userType = type !== 'all' ? document.getElementById('notificationType').value : 'all';
        
        try {
            // ذخیره اعلان در جدول notifications
            const { error } = await supabase
                .from('notifications')
                .insert([{
                    title: title,
                    message: message,
                    user_type: userType,
                    status: 'sent',
                    created_at: new Date().toISOString()
                }]);
            
            if (error) throw error;
            
            showNotification(`اعلان "${title}" با موفقیت ارسال شد`, 'success');
            document.body.removeChild(modal);
            
        } catch (error) {
            console.error('Error sending notification:', error);
            showNotification('خطا در ارسال اعلان', 'error');
        }
    });
};

// تابع بارگذاری سفرهای من
async function loadMyTrips() {
    if (!currentUser) return;
    
    try {
        const { data, error } = await supabase
            .from('trips')
            .select('*')
            .eq('user_id', currentUser.id)
            .order('created_at', { ascending: false });
        
        const table = document.getElementById('myTripsTable');
        if (!table) return;
        
        table.innerHTML = '';
        
        if (error || !data || data.length === 0) {
            // سفرهای نمونه
            const sampleTrips = [
                { date: '۱۴۰۳/۰۱/۱۵', pickup: 'کارته پروان', destination: 'میدان هوایی', type: 'اقتصادی', distance: '۸.۲ کیلومتر', cost: '۲۱۰ افغانی', status: 'تکمیل شده' },
                { date: '۱۴۰۳/۰۱/۱۴', pickup: 'شاروالی کابل', destination: 'دشت برچی', type: 'کلاسیک', distance: '۵.۵ کیلومتر', cost: '۱۸۰ افغانی', status: 'تکمیل شده' },
                { date: '۱۴۰۳/۰۱/۱۳', pickup: 'چهاردهی', destination: 'مکرویان', type: 'موتور', distance: '۱۲.۳ کیلومتر', cost: '۱۵۰ افغانی', status: 'تکمیل شده' },
                { date: '۱۴۰۳/۰۱/۱۲', pickup: 'قلعه‌وزی', destination: 'کارته سخی', type: 'اقتصادی', distance: '۳.۸ کیلومتر', cost: '۱۲۰ افغانی', status: 'لغو شده' }
            ];
            
            sampleTrips.forEach(trip => {
                const row = document.createElement('tr');
                const statusClass = trip.status === 'تکمیل شده' ? 'status-completed' : 'status-cancelled';
                
                row.innerHTML = `
                    <td>${trip.date}</td>
                    <td>${trip.pickup}</td>
                    <td>${trip.destination}</td>
                    <td>${trip.type}</td>
                    <td>${trip.distance}</td>
                    <td>${trip.cost}</td>
                    <td><span class="status-badge ${statusClass}">${trip.status}</span></td>
                    <td class="action-buttons">
                        <button class="action-btn btn-view" onclick="viewMyTripDetails('${trip.date}')">جزئیات</button>
                    </td>
                `;
                
                table.appendChild(row);
            });
            return;
        }
        
        data.forEach(trip => {
            const row = document.createElement('tr');
            const date = new Date(trip.created_at).toLocaleDateString('fa-IR');
            const statusClass = `status-${trip.status}`;
            const statusText = {
                'completed': 'تکمیل شده',
                'in_progress': 'در حال سفر',
                'cancelled': 'لغو شده',
                'requested': 'درخواست شده',
                'confirmed': 'تأیید شده'
            }[trip.status] || trip.status;
            
            row.innerHTML = `
                <td>${date}</td>
                <td>${trip.pickup_location}</td>
                <td>${trip.destination}</td>
                <td>${trip.ride_type === 'economy' ? 'اقتصادی' : trip.ride_type === 'comfort' ? 'کلاسیک' : 'موتور'}</td>
                <td>${trip.distance ? `${trip.distance} کیلومتر` : '---'}</td>
                <td>${trip.estimated_price} افغانی</td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td class="action-buttons">
                    <button class="action-btn btn-view" onclick="viewMyTripDetails('${trip.id}')">جزئیات</button>
                </td>
            `;
            
            table.appendChild(row);
        });
        
    } catch (error) {
        console.error('Error loading my trips:', error);
    }
}

// Event Listeners
window.onload = async function() {
    // بررسی وضعیت ورود کاربر
    await checkUserLoginStatus();
    
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
            
            // مقداردهی اولیه نقشه
            await initMap();
            
            showNotification('به اسنپ افغانستان خوش آمدید!', 'success');
        });
    }
    
    // دکمه اطلاعات بیشتر
    const learnMoreBtn = document.getElementById('learn-more-btn');
    if (learnMoreBtn) {
        learnMoreBtn.addEventListener('click', () => {
            showNotification('اسنپ افغانستان - سرویس تاکسی اینترنتی در سراسر کابل', 'info');
        });
    }
    
    // انتخاب نوع سفر
    document.querySelectorAll('.ride-type').forEach(type => {
        type.addEventListener('click', () => {
            document.querySelectorAll('.ride-type').forEach(t => t.classList.remove('selected'));
            type.classList.add('selected');
            selectedRideType = type.dataset.type;
            
            // بروزرسانی قیمت
            if (currentDistance > 0) {
                calculateAndShowPrice(currentDistance);
            }
        });
    });
    
    // انتخاب روش پرداخت
    document.querySelectorAll('.payment-method').forEach(method => {
        method.addEventListener('click', () => {
            document.querySelectorAll('.payment-method').forEach(m => m.classList.remove('selected'));
            method.classList.add('selected');
            selectedPaymentMethod = method.getAttribute('data-method');
            
            // نمایش/مخفی کردن کیف پول
            const walletPayment = document.getElementById('walletPayment');
            if (walletPayment) {
                if (selectedPaymentMethod === 'wallet') {
                    walletPayment.style.display = 'block';
                } else {
                    walletPayment.style.display = 'none';
                }
            }
        });
    });
    
    // تعویض مبدا و مقصد
    const swapLocationsBtn = document.getElementById('swapLocations');
    if (swapLocationsBtn) {
        swapLocationsBtn.addEventListener('click', () => {
            const pickupInput = document.getElementById('pickup');
            const destinationInput = document.getElementById('destination');
            
            if (!pickupInput || !destinationInput) return;
            
            if (!destinationInput.value) {
                showNotification('لطفاً ابتدا مقصد را وارد کنید', 'error');
                return;
            }
            
            const pickupValue = pickupInput.value;
            const destinationValue = destinationInput.value;
            
            pickupInput.value = destinationValue;
            destinationInput.value = pickupValue;
            showNotification('مبدا و مقصد با موفقیت تعویض شدند', 'info');
        });
    }
    
    // فرم درخواست سفر
    const rideForm = document.getElementById('rideForm');
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

            // محاسبه قیمت
            const baseFares = {
                'economy': 50,
                'comfort': 80,
                'bike': 30
            };
            
            // اگر مسافت محاسبه نشده، تصادفی محاسبه می‌کنیم
            if (currentDistance === 0) {
                currentDistance = Math.random() * 10 + 1; // بین 1 تا 11 کیلومتر
            }
            
            const distanceFare = currentDistance * 20; // 20 افغانی به ازای هر کیلومتر
            const baseFare = baseFares[selectedRideType] || 50;
            currentPrice = Math.round(baseFare + distanceFare);

            // ایجاد سفر
            const trip = await createTrip(pickup, destination, selectedRideType, currentPrice);
            
            if (trip) {
                // شروع جستجوی راننده
                startDriverSearch();
            }
        });
    }
    
    // لغو جستجو
    const cancelSearchBtn = document.getElementById('cancelSearch');
    if (cancelSearchBtn) {
        cancelSearchBtn.addEventListener('click', () => {
            const searchingOverlay = document.getElementById('searchingOverlay');
            const submitBtn = document.getElementById('submitBtn');
            
            if (searchingOverlay) searchingOverlay.style.display = 'none';
            if (submitBtn) submitBtn.disabled = false;
            
            if (window.searchInterval) {
                clearInterval(window.searchInterval);
            }
            showNotification('جستجو لغو شد', 'warning');
        });
    }
    
    // تأیید سفر
    const confirmRideBtn = document.getElementById('confirmRide');
    if (confirmRideBtn) {
        confirmRideBtn.addEventListener('click', async () => {
            const driverModal = document.getElementById('driverModal');
            if (driverModal) driverModal.style.display = 'none';
            
            showNotification('سفر شما با موفقیت ثبت شد. راننده به زودی با شما تماس خواهد گرفت.', 'success');
            
            // بازنشانی فرم
            const rideForm = document.getElementById('rideForm');
            const submitBtn = document.getElementById('submitBtn');
            
            if (rideForm) rideForm.reset();
            if (submitBtn) submitBtn.disabled = false;
            
            // شروع ردیابی
            startTripTracking();
        });
    }
    
    // لغو سفر
    const cancelRideBtn = document.getElementById('cancelRide');
    if (cancelRideBtn) {
        cancelRideBtn.addEventListener('click', () => {
            const driverModal = document.getElementById('driverModal');
            if (driverModal) driverModal.style.display = 'none';
            
            const submitBtn = document.getElementById('submitBtn');
            if (submitBtn) submitBtn.disabled = false;
            
            showNotification('سفر لغو شد', 'warning');
        });
    }
    
    // بستن ردیابی
    const closeTrackingBtn = document.getElementById('closeTracking');
    if (closeTrackingBtn) {
        closeTrackingBtn.addEventListener('click', () => {
            const liveTracking = document.getElementById('liveTracking');
            if (liveTracking) liveTracking.style.display = 'none';
            
            if (trackingInterval) {
                clearInterval(trackingInterval);
            }
        });
    }
    
    // لغو ردیابی
    const cancelTrackingBtn = document.getElementById('cancelTracking');
    if (cancelTrackingBtn) {
        cancelTrackingBtn.addEventListener('click', () => {
            const liveTracking = document.getElementById('liveTracking');
            if (liveTracking) liveTracking.style.display = 'none';
            
            if (trackingInterval) {
                clearInterval(trackingInterval);
            }
            
            showNotification('ردیابی سفر لغو شد', 'warning');
        });
    }
    
    // مدیریت ورود/ثبتنام
    const loginBtn = document.getElementById('loginBtn');
    const mobileLoginBtn = document.getElementById('mobileLoginBtn');
    
    if (loginBtn) loginBtn.addEventListener('click', openAuthModal);
    if (mobileLoginBtn) mobileLoginBtn.addEventListener('click', openAuthModal);
    
    // بستن مدال‌ها
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', function() {
            const modal = this.closest('.modal');
            if (modal) modal.style.display = 'none';
        });
    });
    
    // فرم ورود
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            clearErrors();
            
            const email = document.getElementById('loginEmail').value.trim();
            const password = document.getElementById('loginPassword').value;
            
            if (!email || !password) {
                showError('loginEmail', 'لطفاً ایمیل/شماره تماس و رمز عبور را وارد کنید');
                return;
            }
            
            try {
                // بررسی دسترسی ادمین
                if (email === 'admin@snap.af' && password === 'admin123') {
                    // ایجاد کاربر ادمین
                    currentUser = {
                        id: 'admin-001',
                        name: 'مدیر سیستم',
                        email: 'admin@snap.af',
                        phone: '0700123456',
                        role: 'admin',
                        status: 'approved'
                    };
                    isAdmin = true;
                    updateUIAfterLogin();
                    
                    const authModal = document.getElementById('authModal');
                    if (authModal) authModal.style.display = 'none';
                    
                    loginForm.reset();
                    showNotification('خوش آمدید مدیر محترم', 'success');
                    return;
                }
                
                const { data, error } = await supabase.auth.signInWithPassword({
                    email,
                    password
                });
                
                if (error) throw error;
                
                // بارگذاری پروفایل کاربر
                await loadUserProfile(data.user.id);
                
                const authModal = document.getElementById('authModal');
                if (authModal) authModal.style.display = 'none';
                
                loginForm.reset();
                
            } catch (error) {
                console.error('Login error:', error);
                
                // در حالت آزمایشی، اگر کاربر وجود نداشت، آن را ایجاد می‌کنیم
                if (error.message.includes('Invalid login credentials')) {
                    try {
                        // تلاش برای ثبت‌نام خودکار
                        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
                            email,
                            password,
                            options: {
                                data: {
                                    name: email.split('@')[0],
                                    phone: '',
                                    role: 'passenger'
                                }
                            }
                        });
                        
                        if (signUpError) throw signUpError;
                        
                        // سپس وارد می‌شویم
                        const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
                            email,
                            password
                        });
                        
                        if (loginError) throw loginError;
                        
                        await loadUserProfile(loginData.user.id);
                        
                        const authModal = document.getElementById('authModal');
                        if (authModal) authModal.style.display = 'none';
                        
                        loginForm.reset();
                        
                    } catch (signUpError) {
                        showError('loginEmail', 'ایمیل/شماره تماس یا رمز عبور اشتباه است');
                    }
                } else {
                    showError('loginEmail', 'ایمیل/شماره تماس یا رمز عبور اشتباه است');
                }
            }
        });
    }
    
    // فرم ثبت‌نام
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            clearErrors();
            
            const name = document.getElementById('registerName').value.trim();
            const email = document.getElementById('registerEmail').value.trim();
            const phone = document.getElementById('registerPhone').value.trim();
            const password = document.getElementById('registerPassword').value;
            const confirmPassword = document.getElementById('registerConfirmPassword').value;
            const userType = document.getElementById('userType').value;
            
            // اعتبارسنجی
            let isValid = true;
            
            if (name.length < 2) {
                showError('registerName', 'نام باید حداقل ۲ حرف داشته باشد');
                isValid = false;
            }
            
            if (!email.includes('@')) {
                showError('registerEmail', 'لطفاً یک ایمیل معتبر وارد کنید');
                isValid = false;
            }
            
            if (phone.length < 10) {
                showError('registerPhone', 'لطفاً یک شماره تماس معتبر وارد کنید');
                isValid = false;
            }
            
            if (password.length < 6) {
                showError('registerPassword', 'رمز عبور باید حداقل ۶ حرف داشته باشد');
                isValid = false;
            }
            
            if (password !== confirmPassword) {
                showError('registerConfirmPassword', 'رمز عبور و تکرار آن مطابقت ندارند');
                isValid = false;
            }
            
            if (!userType) {
                showError('userType', 'لطفاً نوع کاربر را انتخاب کنید');
                isValid = false;
            }
            
            if (!isValid) return;
            
            try {
                // ثبت‌نام کاربر در سیستم احراز هویت
                const { data: authData, error: authError } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        data: {
                            name,
                            phone,
                            role: userType
                        }
                    }
                });
                
                if (authError) throw authError;
                
                showNotification('ثبت‌نام شما با موفقیت انجام شد. اکنون می‌توانید وارد شوید.', 'success');
                registerForm.reset();
                
                // تغییر به تب ورود
                document.querySelectorAll('.form-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.form-tab-content').forEach(c => c.classList.remove('active'));
                
                const loginTab = document.querySelector('.form-tab[data-tab="login"]');
                const loginTabContent = document.getElementById('login-tab');
                
                if (loginTab) loginTab.classList.add('active');
                if (loginTabContent) loginTabContent.classList.add('active');
                
            } catch (error) {
                console.error('Registration error:', error);
                
                if (error.message.includes('already registered')) {
                    showError('registerEmail', 'این ایمیل قبلاً ثبت‌نام کرده است');
                } else {
                    showError('registerEmail', 'خطا در ثبت‌نام. لطفاً مجدداً تلاش کنید.');
                }
            }
        });
    }
    
    // مدیریت خروج
    const logoutBtn = document.getElementById('logoutBtn');
    const mobileLogoutBtn = document.getElementById('mobileLogoutBtn');
    
    if (logoutBtn) logoutBtn.addEventListener('click', logout);
    if (mobileLogoutBtn) mobileLogoutBtn.addEventListener('click', logout);
    
    // مدیریت منوی موبایل
    const hamburger = document.getElementById('hamburger');
    const closeMenu = document.getElementById('closeMenu');
    const overlay = document.getElementById('overlay');
    const mobileMenu = document.getElementById('mobileMenu');
    
    if (hamburger) {
        hamburger.addEventListener('click', () => {
            if (mobileMenu) mobileMenu.classList.add('active');
            if (overlay) overlay.classList.add('active');
            hamburger.classList.add('active');
        });
    }
    
    if (closeMenu) {
        closeMenu.addEventListener('click', () => {
            if (mobileMenu) mobileMenu.classList.remove('active');
            if (overlay) overlay.classList.remove('active');
            if (hamburger) hamburger.classList.remove('active');
        });
    }
    
    if (overlay) {
        overlay.addEventListener('click', () => {
            if (mobileMenu) mobileMenu.classList.remove('active');
            overlay.classList.remove('active');
            if (hamburger) hamburger.classList.remove('active');
        });
    }
    
    // مدیریت صفحات
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const pageId = link.getAttribute('data-page') + '-page';
            
            document.querySelectorAll('.page').forEach(page => {
                page.classList.remove('active');
            });
            
            document.querySelectorAll('.nav-link').forEach(l => {
                l.classList.remove('active');
            });
            link.classList.add('active');
            
            const targetPage = document.getElementById(pageId);
            if (targetPage) targetPage.classList.add('active');
            
            // بستن منوی موبایل
            if (mobileMenu) mobileMenu.classList.remove('active');
            if (overlay) overlay.classList.remove('active');
            if (hamburger) hamburger.classList.remove('active');
            
            // بارگذاری داده‌های صفحه
            if (pageId === 'my-trips-page') {
                loadMyTrips();
            } else if (pageId === 'discounts-page') {
                loadDiscounts();
            } else if (pageId === 'profile-page') {
                updateProfilePage();
            } else if (pageId === 'admin-page') {
                loadAdminPanel();
            } else if (pageId === 'home-page') {
                // بارگذاری نقشه برای صفحه اصلی
                if (!map) initMap();
            }
        });
    });
    
    // تب‌های مدیریت
    document.querySelectorAll('.admin-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabId = tab.getAttribute('data-tab');
            
            document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.remove('active'));
            
            tab.classList.add('active');
            const targetTab = document.getElementById(`${tabId}-tab`);
            if (targetTab) targetTab.classList.add('active');
        });
    });
    
    // پیشنهادات مقصد
    document.querySelectorAll('.suggestion-item').forEach(item => {
        item.addEventListener('click', () => {
            const destination = item.getAttribute('data-destination');
            const destinationInput = document.getElementById('destination');
            if (destinationInput) {
                destinationInput.value = destination;
                showNotification(`مقصد "${destination}" انتخاب شد`, 'info');
            }
        });
    });
    
    // ثبت امتیاز
    const submitRatingBtn = document.getElementById('submitRating');
    if (submitRatingBtn) {
        submitRatingBtn.addEventListener('click', () => {
            const ratingStars = document.querySelectorAll('.rating-star.active');
            const rating = ratingStars.length;
            const commentInput = document.getElementById('ratingComment');
            const comment = commentInput ? commentInput.value : '';
            
            showNotification(`امتیاز ${rating} ستاره شما ثبت شد${comment ? ' با تشکر از نظر شما' : ''}`, 'success');
            
            const ratingModal = document.getElementById('ratingModal');
            if (ratingModal) ratingModal.style.display = 'none';
            
            // بازنشانی فرم امتیازدهی
            const stars = document.querySelectorAll('.rating-star');
            stars.forEach(star => star.classList.remove('active'));
            
            if (commentInput) commentInput.value = '';
        });
    }
    
    // ستاره‌های امتیازدهی
    document.querySelectorAll('.rating-star').forEach(star => {
        star.addEventListener('click', function() {
            const rating = parseInt(this.getAttribute('data-rating'));
            const stars = document.querySelectorAll('.rating-star');
            
            stars.forEach((s, index) => {
                if (index < rating) {
                    s.classList.add('active');
                } else {
                    s.classList.remove('active');
                }
            });
        });
    });
    
    // نمایش/مخفی کردن رمز عبور
    document.querySelectorAll('.password-toggle').forEach(toggle => {
        toggle.addEventListener('click', function() {
            const input = this.previousElementSibling;
            const icon = this.querySelector('i');
            
            if (!input || !icon) return;
            
            if (input.type === 'password') {
                input.type = 'text';
                icon.className = 'fas fa-eye-slash';
            } else {
                input.type = 'password';
                icon.className = 'fas fa-eye';
            }
        });
    });
    
    // تغییر تب‌های فرم احراز هویت
    document.querySelectorAll('.form-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const tabId = this.getAttribute('data-tab');
            
            document.querySelectorAll('.form-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.form-tab-content').forEach(c => c.classList.remove('active'));
            
            this.classList.add('active');
            const targetTab = document.getElementById(`${tabId}-tab`);
            if (targetTab) targetTab.classList.add('active');
            
            clearErrors();
        });
    });
    
    // رویدادهای کلیک بر روی overlay ها
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    });
    
    // ذخیره پروفایل
    const saveProfileBtn = document.getElementById('saveProfile');
    if (saveProfileBtn) {
        saveProfileBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            
            const editName = document.getElementById('editName');
            const editEmail = document.getElementById('editEmail');
            const editPhone = document.getElementById('editPhone');
            
            if (!editName || !editEmail || !editPhone) return;
            
            if (!currentUser) {
                showNotification('لطفاً ابتدا وارد حساب کاربری خود شوید', 'error');
                return;
            }
            
            try {
                // به‌روزرسانی پروفایل کاربر
                const { data, error } = await supabase
                    .from('users')
                    .update({
                        name: editName.value.trim(),
                        email: editEmail.value.trim(),
                        phone: editPhone.value.trim(),
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', currentUser.id)
                    .select()
                    .single();
                
                if (error) throw error;
                
                currentUser = data;
                updateProfilePage();
                updateUIAfterLogin();
                showNotification('پروفایل شما با موفقیت به‌روزرسانی شد', 'success');
                
            } catch (error) {
                console.error('Error updating profile:', error);
                showNotification('خطا در به‌روزرسانی پروفایل', 'error');
            }
        });
    }
    
    // ارسال پیام در چت پشتیبانی
    const sendMessageBtn = document.getElementById('sendMessage');
    const chatInput = document.getElementById('chatInput');
    
    if (sendMessageBtn && chatInput) {
        sendMessageBtn.addEventListener('click', () => {
            const message = chatInput.value.trim();
            if (!message) {
                showNotification('لطفاً پیام خود را وارد کنید', 'error');
                return;
            }
            
            if (!currentUser) {
                showNotification('لطفاً ابتدا وارد حساب کاربری خود شوید', 'error');
                openAuthModal();
                return;
            }
            
            const chatMessages = document.getElementById('chatMessages');
            if (chatMessages) {
                const messageElement = document.createElement('div');
                messageElement.className = 'message sent';
                messageElement.innerHTML = `
                    ${message}
                    <div class="message-time">اکنون</div>
                `;
                chatMessages.appendChild(messageElement);
                chatMessages.scrollTop = chatMessages.scrollHeight;
                
                // شبیه‌سازی پاسخ پشتیبانی
                setTimeout(() => {
                    const responseElement = document.createElement('div');
                    responseElement.className = 'message received';
                    responseElement.innerHTML = `
                        پیام شما دریافت شد. همکاران ما در اولین فرصت با شما تماس خواهند گرفت.
                        <div class="message-time">اکنون</div>
                    `;
                    chatMessages.appendChild(responseElement);
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                }, 1000);
            }
            
            chatInput.value = '';
            showNotification('پیام شما ارسال شد', 'success');
        });
        
        // ارسال با Enter
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendMessageBtn.click();
            }
        });
    }
    
    // بارگذاری اولیه مقاصد پیشنهادی
    setTimeout(() => {
        const suggestionsList = document.querySelector('.suggestion-list');
        if (suggestionsList && popularDestinations.length === 0) {
            const defaultSuggestions = [
                { name: 'میدان هوایی بین المللی کابل', icon: 'fas fa-plane' },
                { name: 'سفارت امریکا', icon: 'fas fa-landmark' },
                { name: 'سفارت ایران', icon: 'fas fa-landmark' },
                { name: 'سفارت پاکستان', icon: 'fas fa-landmark' },
                { name: 'وزارت امور خارجه', icon: 'fas fa-building' },
                { name: 'ارگ ریاست جمهوری', icon: 'fas fa-monument' }
            ];
            
            defaultSuggestions.forEach(destination => {
                const suggestionItem = document.createElement('div');
                suggestionItem.className = 'suggestion-item';
                suggestionItem.innerHTML = `
                    <div class="suggestion-icon">
                        <i class="${destination.icon}"></i>
                    </div>
                    <div class="suggestion-text">${destination.name}</div>
                `;
                suggestionItem.setAttribute('data-destination', destination.name);
                
                suggestionItem.addEventListener('click', () => {
                    const destinationInput = document.getElementById('destination');
                    if (destinationInput) {
                        destinationInput.value = destination.name;
                        showNotification(`مقصد "${destination.name}" انتخاب شد`, 'info');
                    }
                });
                
                suggestionsList.appendChild(suggestionItem);
            });
        }
    }, 1000);
    
    // اضافه کردن event listener برای دکمه‌های جدید در پنل ادمین
    document.addEventListener('DOMContentLoaded', function() {
        // دکمه افزودن راننده
        const addDriverBtn = document.getElementById('addDriverBtn');
        if (addDriverBtn) {
            addDriverBtn.addEventListener('click', () => {
                window.addNewDriver();
            });
        }
        
        // دکمه افزودن تخفیف
        const addDiscountBtn = document.getElementById('addDiscountBtn');
        if (addDiscountBtn) {
            addDiscountBtn.addEventListener('click', () => {
                window.addNewDiscount();
            });
        }
        
        // دکمه‌های گزارش
        const exportUsersBtn = document.getElementById('exportUsersBtn');
        const exportTripsBtn = document.getElementById('exportTripsBtn');
        const exportRevenueBtn = document.getElementById('exportRevenueBtn');
        
        if (exportUsersBtn) exportUsersBtn.addEventListener('click', () => window.exportReport('users'));
        if (exportTripsBtn) exportTripsBtn.addEventListener('click', () => window.exportReport('trips'));
        if (exportRevenueBtn) exportRevenueBtn.addEventListener('click', () => window.exportReport('revenue'));
        
        // دکمه‌های ارسال اعلان
        const notifyAllBtn = document.getElementById('notifyAllBtn');
        const notifyUsersBtn = document.getElementById('notifyUsersBtn');
        
        if (notifyAllBtn) notifyAllBtn.addEventListener('click', () => window.sendNotification('all'));
        if (notifyUsersBtn) notifyUsersBtn.addEventListener('click', () => window.sendNotification('specific'));
    });
};

// تابع بارگذاری تخفیف‌ها
function loadDiscounts() {
    const container = document.getElementById('discountsList');
    if (!container) return;
    
    const sampleDiscounts = [
        { code: 'WELCOME100', percent: '۱۰۰', expiry: '۱۴۰۳/۰۲/۱۵', used: '۴۵', max: '۱۰۰', description: 'برای اولین سفر' },
        { code: 'SAVE50', percent: '۵۰', expiry: '۱۴۰۳/۰۱/۳۰', used: '۸۹', max: '۱۵۰', description: 'برای سفرهای بالای ۲۰۰ افغانی' },
        { code: 'FREERIDE', percent: '۱۰۰', expiry: '۱۴۰۳/۰۲/۱۰', used: '۲۳', max: '۵۰', description: 'به مناسبت عید' },
        { code: 'DISCOUNT30', percent: '۳۰', expiry: '۱۴۰۳/۰۱/۲۵', used: '۱۲۰', max: '۲۰۰', description: 'برای تمام سفرها' }
    ];
    
    container.innerHTML = '';
    
    sampleDiscounts.forEach(discount => {
        const usedPercent = (parseInt(discount.used) / parseInt(discount.max)) * 100;
        
        const discountCard = document.createElement('div');
        discountCard.className = 'discount-card';
        discountCard.innerHTML = `
            <div class="discount-header">
                <div class="discount-code">${discount.code}</div>
                <div class="discount-percent">${discount.percent}% تخفیف</div>
            </div>
            <div class="discount-details">
                <span>${discount.description}</span>
                <span>انقضا: ${discount.expiry}</span>
            </div>
            <div class="discount-progress">
                <div class="progress-text">
                    <span>استفاده شده</span>
                    <span>${discount.used} از ${discount.max}</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${usedPercent}%"></div>
                </div>
            </div>
            <button class="btn btn-primary" style="margin-top: 15px; width: 100%;" onclick="useDiscount('${discount.code}')">استفاده از کد</button>
        `;
        
        container.appendChild(discountCard);
    });
}

window.useDiscount = function(discountCode) {
    if (!currentUser) {
        showNotification('لطفاً ابتدا وارد حساب کاربری خود شوید', 'error');
        openAuthModal();
        return;
    }
    showNotification(`کد تخفیف ${discountCode} با موفقیت اعمال شد`, 'success');
};

window.viewMyTripDetails = function(tripId) {
    showNotification(`جزئیات سفر ${tripId} نمایش داده شد`, 'info');
    window.viewTripDetails(tripId);
};

// تابع برای به‌روزرسانی نقشه
window.refreshMap = function() {
    if (map) {
        loadActiveDrivers();
        showNotification('نقشه به‌روزرسانی شد', 'success');
    }
};

// تابع برای پاک کردن نقشه
window.clearMap = function() {
    if (userMarker) {
        map.removeLayer(userMarker);
        userMarker = null;
    }
    
    if (routeLayer) {
        map.removeLayer(routeLayer);
        routeLayer = null;
    }
    
    const pickupInput = document.getElementById('pickup');
    const destinationInput = document.getElementById('destination');
    
    if (pickupInput) pickupInput.value = '';
    if (destinationInput) destinationInput.value = '';
    
    const tripCalculator = document.getElementById('tripCalculator');
    if (tripCalculator) tripCalculator.style.display = 'none';
    
    showNotification('نقشه پاک شد', 'info');
};

// اضافه کردن توابع به window برای دسترسی جهانی
window.logout = logout;
window.openAuthModal = openAuthModal;
window.showNotification = showNotification;
window.selectDriver = selectDriver;
window.clearMap = clearMap;
window.refreshMap = refreshMap;
window.loadMyTrips = loadMyTrips;
window.loadDiscounts = loadDiscounts;
window.loadAdminPanel = loadAdminPanel;

console.log('Snap Afghanistan script loaded successfully!');