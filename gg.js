// ==================== تنظیمات API ====================
const SUPABASE_URL = 'https://wuyhybsocviswsfnixdp.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind1eWh5YnNvY3Zpc3dzZm5peGRwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0Nzg2MzIsImV4cCI6MjA4MjA1NDYzMn0.DXdz7v17Q3qmX18hCMFn6HmBwBQK0-EViKZlfaezDhQ';

// API مسیریابی OpenRouteService
const ORS_API_KEY = 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjgxNTkwYjU0NDBiYTQwOTg5NjcyMWFjYmUwNTM2OTE4IiwiaCI6Im11cm11cjY0In0=';

// ==================== تنظیمات رنگ‌ها ====================
const COLORS = {
    primary: '#8B5CF6',
    secondary: '#10B981',
    accent: '#EF4444',
    warning: '#F59E0B',
    info: '#3B82F6',
    light: '#F3F4F6',
    dark: '#1F2937',
    success: '#10B981',
    danger: '#EF4444',
    gray: '#6B7280'
};

// ==================== مقداردهی اولیه ====================
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

// متغیرهای مدیریتی
let cities = [];
let districts = [];
let services = [];
let drivers = [];
let users = [];
let stations = [];
let coupons = [];
let commissions = [];
let fares = [];
let representatives = [];
let tickets = [];

// ==================== کلاس مدیریت سیستم ====================

class TaxiManagementSystem {
    constructor() {
        this.init();
    }

    async init() {
        await this.loadCities();
        await this.loadDistricts();
        await this.loadServices();
        await this.loadFares();
        await this.loadCommissions();
        await this.loadCoupons();
        await this.loadStations();
        await this.loadRepresentatives();
    }

    async loadCities() {
        try {
            const { data, error } = await supabase
                .from('cities')
                .select('*')
                .eq('is_active', true);
            
            if (!error) cities = data;
        } catch (error) {
            console.error('Error loading cities:', error);
        }
    }

    async loadDistricts() {
        try {
            const { data, error } = await supabase
                .from('districts')
                .select('*')
                .eq('is_active', true);
            
            if (!error) districts = data;
        } catch (error) {
            console.error('Error loading districts:', error);
        }
    }

    async loadServices() {
        try {
            const { data, error } = await supabase
                .from('services')
                .select('*')
                .eq('is_active', true);
            
            if (!error) services = data;
        } catch (error) {
            console.error('Error loading services:', error);
        }
    }

    async loadFares() {
        try {
            const { data, error } = await supabase
                .from('fares')
                .select('*')
                .eq('is_active', true);
            
            if (!error) fares = data;
        } catch (error) {
            console.error('Error loading fares:', error);
        }
    }

    async loadCommissions() {
        try {
            const { data, error } = await supabase
                .from('commissions')
                .select('*')
                .eq('is_active', true);
            
            if (!error) commissions = data;
        } catch (error) {
            console.error('Error loading commissions:', error);
        }
    }

    async loadCoupons() {
        try {
            const { data, error } = await supabase
                .from('coupons')
                .select('*')
                .eq('is_active', true)
                .gte('expiry_date', new Date().toISOString());
            
            if (!error) coupons = data;
        } catch (error) {
            console.error('Error loading coupons:', error);
        }
    }

    async loadStations() {
        try {
            const { data, error } = await supabase
                .from('stations')
                .select('*')
                .eq('is_active', true);
            
            if (!error) stations = data;
        } catch (error) {
            console.error('Error loading stations:', error);
        }
    }

    async loadRepresentatives() {
        try {
            const { data, error } = await supabase
                .from('representatives')
                .select('*')
                .eq('is_active', true);
            
            if (!error) representatives = data;
        } catch (error) {
            console.error('Error loading representatives:', error);
        }
    }

    // محاسبه کرایه داینامیک
    calculateDynamicFare(distance, duration, serviceType, cityId, districtId, trafficLevel = 'normal') {
        let fare = 0;
        
        // یافتن فرمول کرایه بر اساس پارامترها
        const fareFormula = fares.find(f => 
            f.city_id === cityId && 
            f.district_id === districtId && 
            f.service_type === serviceType &&
            f.min_distance <= distance && 
            f.max_distance >= distance
        );
        
        if (fareFormula) {
            fare = fareFormula.base_fare;
            fare += distance * fareFormula.per_km;
            fare += duration * fareFormula.per_minute;
            
            // اعمال ضریب ترافیک
            const trafficFactor = this.getTrafficFactor(trafficLevel);
            fare *= trafficFactor;
            
            // اعمال درصد افزایش/کاهش زمانی
            const timeFactor = this.getTimeFactor();
            fare *= timeFactor;
        }
        
        return Math.max(fare, fareFormula?.min_fare || 0);
    }

    getTrafficFactor(trafficLevel) {
        const factors = {
            'low': 1.0,
            'normal': 1.0,
            'high': 1.2,
            'very_high': 1.5
        };
        return factors[trafficLevel] || 1.0;
    }

    getTimeFactor() {
        const now = new Date();
        const hour = now.getHours();
        const day = now.getDay();
        
        // بررسی ساعات اوج
        if ((hour >= 7 && hour <= 9) || (hour >= 16 && hour <= 18)) {
            return 1.3; // 30% افزایش در ساعات اوج
        }
        
        // بررسی شب
        if (hour >= 22 || hour < 5) {
            return 1.2; // 20% افزایش در شب
        }
        
        return 1.0;
    }

    // محاسبه کمیسیون
    calculateCommission(fareAmount, driverId, serviceType, cityId, districtId) {
        const commissionRule = commissions.find(c => 
            c.city_id === cityId && 
            c.district_id === districtId && 
            c.service_type === serviceType
        );
        
        if (commissionRule) {
            let commission = fareAmount * (commissionRule.percentage / 100);
            
            // اعتبار اضافی برای رانندگان بر اساس تعداد سفر
            const driver = drivers.find(d => d.id === driverId);
            if (driver && driver.trip_count >= commissionRule.min_trips) {
                commission -= commissionRule.extra_credit; // کمیسیون منفی = اعتبار اضافی
            }
            
            return Math.max(commission, 0);
        }
        
        return fareAmount * 0.2; // کمیسیون پیش‌فرض 20%
    }

    // اعتبارسنجی کوپن
    validateCoupon(code, userId, amount, cityId, districtId) {
        const coupon = coupons.find(c => 
            c.code === code && 
            c.is_active && 
            new Date(c.expiry_date) > new Date()
        );
        
        if (!coupon) return { valid: false, message: 'کوپن نامعتبر' };
        
        // بررسی محدوده جغرافیایی
        if (coupon.city_id && coupon.city_id !== cityId) {
            return { valid: false, message: 'کوپن برای این شهر معتبر نیست' };
        }
        
        if (coupon.district_id && coupon.district_id !== districtId) {
            return { valid: false, message: 'کوپن برای این منطقه معتبر نیست' };
        }
        
        // بررسی محدوده مسافتی
        if (coupon.min_distance && currentDistance < coupon.min_distance) {
            return { valid: false, message: 'کوپن برای مسافت کمتر از حد مجاز معتبر نیست' };
        }
        
        if (coupon.max_distance && currentDistance > coupon.max_distance) {
            return { valid: false, message: 'کوپن برای مسافت بیشتر از حد مجاز معتبر نیست' };
        }
        
        // محاسبه تخفیف
        let discount = 0;
        if (coupon.discount_type === 'percentage') {
            discount = amount * (coupon.discount_value / 100);
        } else {
            discount = coupon.discount_value;
        }
        
        // محدودیت حداکثر تخفیف
        if (coupon.max_discount && discount > coupon.max_discount) {
            discount = coupon.max_discount;
        }
        
        return {
            valid: true,
            discount: discount,
            message: `تخفیف ${discount.toLocaleString('fa-IR')} افغانی اعمال شد`
        };
    }
}

// ایجاد نمونه سیستم
const taxiSystem = new TaxiManagementSystem();

// ==================== پورتال مدیریت ====================

function createAdminPortal() {
    const portalHTML = `
        <div class="admin-portal" id="adminPortal">
            <div class="portal-sidebar">
                <div class="portal-logo">
                    <h3><i class="fas fa-cog"></i> پورتال مدیریت</h3>
                </div>
                
                <nav class="portal-nav">
                    <div class="nav-section">
                        <h4><i class="fas fa-map"></i> مدیریت جغرافیایی</h4>
                        <ul>
                            <li><a href="#" onclick="showSection('cities')"><i class="fas fa-city"></i> شهرها</a></li>
                            <li><a href="#" onclick="showSection('districts')"><i class="fas fa-map-marker-alt"></i> مناطق</a></li>
                            <li><a href="#" onclick="showSection('stations')"><i class="fas fa-store"></i> ایستگاه‌ها</a></li>
                        </ul>
                    </div>
                    
                    <div class="nav-section">
                        <h4><i class="fas fa-money-bill-wave"></i> مدیریت مالی</h4>
                        <ul>
                            <li><a href="#" onclick="showSection('fares')"><i class="fas fa-calculator"></i> فرمول‌های کرایه</a></li>
                            <li><a href="#" onclick="showSection('commissions')"><i class="fas fa-percentage"></i> کمیسیون‌ها</a></li>
                            <li><a href="#" onclick="showSection('coupons')"><i class="fas fa-tag"></i> کوپن‌ها</a></li>
                        </ul>
                    </div>
                    
                    <div class="nav-section">
                        <h4><i class="fas fa-users"></i> مدیریت کاربران</h4>
                        <ul>
                            <li><a href="#" onclick="showSection('passengers')"><i class="fas fa-user-friends"></i> مسافران</a></li>
                            <li><a href="#" onclick="showSection('drivers')"><i class="fas fa-car"></i> رانندگان</a></li>
                            <li><a href="#" onclick="showSection('operators')"><i class="fas fa-headset"></i> اپراتورها</a></li>
                            <li><a href="#" onclick="showSection('representatives')"><i class="fas fa-building"></i> نمایندگان</a></li>
                        </ul>
                    </div>
                    
                    <div class="nav-section">
                        <h4><i class="fas fa-chart-line"></i> گزارشات</h4>
                        <ul>
                            <li><a href="#" onclick="showSection('reports')"><i class="fas fa-chart-bar"></i> گزارش مالی</a></li>
                            <li><a href="#" onclick="showSection('tripsReport')"><i class="fas fa-road"></i> گزارش سفرها</a></li>
                            <li><a href="#" onclick="showSection('discountsReport')"><i class="fas fa-tags"></i> گزارش تخفیف‌ها</a></li>
                        </ul>
                    </div>
                    
                    <div class="nav-section">
                        <h4><i class="fas fa-tools"></i> سیستم</h4>
                        <ul>
                            <li><a href="#" onclick="showSection('services')"><i class="fas fa-concierge-bell"></i> خدمات</a></li>
                            <li><a href="#" onclick="showSection('support')"><i class="fas fa-life-ring"></i> پشتیبانی</a></li>
                            <li><a href="#" onclick="showSection('settings')"><i class="fas fa-sliders-h"></i> تنظیمات</a></li>
                        </ul>
                    </div>
                </nav>
            </div>
            
            <div class="portal-content" id="portalContent">
                <div class="content-header">
                    <h2 id="contentTitle">داشبورد مدیریت</h2>
                    <div class="header-actions">
                        <button class="btn btn-primary" onclick="exportToExcel()">
                            <i class="fas fa-file-excel"></i> خروجی اکسل
                        </button>
                        <button class="btn btn-secondary" onclick="refreshData()">
                            <i class="fas fa-sync-alt"></i> بروزرسانی
                        </button>
                    </div>
                </div>
                
                <div class="content-body">
                    <div id="dynamicContent">
                        <!-- محتوای داینامیک اینجا بارگذاری می‌شود -->
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.innerHTML = portalHTML;
    addAdminPortalStyles();
    loadDashboard();
}

function addAdminPortalStyles() {
    const style = document.createElement('style');
    style.textContent = `
        .admin-portal {
            display: flex;
            height: 100vh;
            background: #f8f9fa;
            font-family: 'Vazirmatn', sans-serif;
        }
        
        .portal-sidebar {
            width: 280px;
            background: white;
            border-left: 1px solid #e5e7eb;
            overflow-y: auto;
        }
        
        .portal-logo {
            padding: 20px;
            border-bottom: 1px solid #e5e7eb;
            background: linear-gradient(135deg, ${COLORS.primary}, #7C3AED);
            color: white;
        }
        
        .portal-logo h3 {
            margin: 0;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .nav-section {
            padding: 20px;
            border-bottom: 1px solid #e5e7eb;
        }
        
        .nav-section h4 {
            margin: 0 0 15px 0;
            color: ${COLORS.gray};
            font-size: 14px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .nav-section ul {
            list-style: none;
            padding: 0;
            margin: 0;
        }
        
        .nav-section li {
            margin-bottom: 10px;
        }
        
        .nav-section a {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px 15px;
            color: ${COLORS.dark};
            text-decoration: none;
            border-radius: 8px;
            transition: all 0.3s;
        }
        
        .nav-section a:hover {
            background: ${COLORS.light};
            color: ${COLORS.primary};
        }
        
        .nav-section a.active {
            background: ${COLORS.primary};
            color: white;
        }
        
        .portal-content {
            flex: 1;
            overflow-y: auto;
        }
        
        .content-header {
            padding: 20px;
            background: white;
            border-bottom: 1px solid #e5e7eb;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .header-actions {
            display: flex;
            gap: 10px;
        }
        
        .content-body {
            padding: 20px;
        }
        
        .dashboard-cards {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        
        .dashboard-card {
            background: white;
            border-radius: 10px;
            padding: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        
        .dashboard-card h3 {
            margin: 0 0 10px 0;
            color: ${COLORS.gray};
            font-size: 14px;
        }
        
        .dashboard-card .value {
            font-size: 32px;
            font-weight: bold;
            color: ${COLORS.primary};
        }
        
        .dashboard-card .change {
            font-size: 12px;
            color: ${COLORS.success};
            margin-top: 5px;
        }
        
        .recent-table {
            background: white;
            border-radius: 10px;
            padding: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        
        .data-table {
            width: 100%;
            border-collapse: collapse;
        }
        
        .data-table th {
            background: ${COLORS.light};
            padding: 12px;
            text-align: right;
            color: ${COLORS.dark};
            font-weight: 600;
            border-bottom: 2px solid #e5e7eb;
        }
        
        .data-table td {
            padding: 12px;
            border-bottom: 1px solid #e5e7eb;
        }
        
        .data-table tr:hover {
            background: ${COLORS.light};
        }
        
        .form-modal {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            display: none;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        }
        
        .form-modal.active {
            display: flex;
        }
        
        .form-modal-content {
            background: white;
            border-radius: 10px;
            width: 90%;
            max-width: 800px;
            max-height: 90vh;
            overflow-y: auto;
        }
        
        .form-modal-header {
            padding: 20px;
            border-bottom: 1px solid #e5e7eb;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .form-modal-body {
            padding: 20px;
        }
        
        .form-row {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 20px;
            margin-bottom: 20px;
        }
        
        .form-group {
            margin-bottom: 20px;
        }
        
        .form-label {
            display: block;
            margin-bottom: 5px;
            color: ${COLORS.dark};
            font-weight: 500;
        }
        
        .form-control {
            width: 100%;
            padding: 10px;
            border: 1px solid #e5e7eb;
            border-radius: 6px;
            font-size: 14px;
        }
        
        .form-control:focus {
            outline: none;
            border-color: ${COLORS.primary};
        }
        
        .btn {
            padding: 10px 20px;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            display: inline-flex;
            align-items: center;
            gap: 8px;
            transition: all 0.3s;
        }
        
        .btn-primary {
            background: ${COLORS.primary};
            color: white;
        }
        
        .btn-primary:hover {
            background: #7C3AED;
        }
        
        .btn-secondary {
            background: ${COLORS.gray};
            color: white;
        }
        
        .btn-danger {
            background: ${COLORS.danger};
            color: white;
        }
        
        .btn-success {
            background: ${COLORS.success};
            color: white;
        }
        
        .btn-sm {
            padding: 5px 10px;
            font-size: 12px;
        }
        
        .action-buttons {
            display: flex;
            gap: 5px;
        }
        
        .status-badge {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 500;
        }
        
        .status-active {
            background: #D1FAE5;
            color: #065F46;
        }
        
        .status-inactive {
            background: #FEE2E2;
            color: #991B1B;
        }
        
        .filter-bar {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
            padding: 15px;
            background: white;
            border-radius: 10px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        
        .date-range {
            display: flex;
            gap: 10px;
            align-items: center;
        }
    `;
    
    document.head.appendChild(style);
}

function showSection(section) {
    const title = getSectionTitle(section);
    document.getElementById('contentTitle').textContent = title;
    
    switch(section) {
        case 'cities':
            loadCities();
            break;
        case 'districts':
            loadDistricts();
            break;
        case 'stations':
            loadStations();
            break;
        case 'fares':
            loadFares();
            break;
        case 'commissions':
            loadCommissions();
            break;
        case 'coupons':
            loadCoupons();
            break;
        case 'passengers':
            loadPassengers();
            break;
        case 'drivers':
            loadDrivers();
            break;
        case 'services':
            loadServices();
            break;
        case 'reports':
            loadReports();
            break;
        case 'tripsReport':
            loadTripsReport();
            break;
        default:
            loadDashboard();
    }
}

function getSectionTitle(section) {
    const titles = {
        'cities': 'مدیریت شهرها',
        'districts': 'مدیریت مناطق',
        'stations': 'مدیریت ایستگاه‌ها',
        'fares': 'فرمول‌های کرایه',
        'commissions': 'کمیسیون‌ها',
        'coupons': 'مدیریت کوپن‌ها',
        'passengers': 'مدیریت مسافران',
        'drivers': 'مدیریت رانندگان',
        'services': 'مدیریت خدمات',
        'reports': 'گزارشات مالی',
        'tripsReport': 'گزارش سفرها'
    };
    return titles[section] || 'داشبورد مدیریت';
}

async function loadDashboard() {
    const content = document.getElementById('dynamicContent');
    content.innerHTML = `
        <div class="dashboard-cards">
            <div class="dashboard-card">
                <h3>سفرهای امروز</h3>
                <div class="value">1,247</div>
                <div class="change">↑ 12% نسبت به دیروز</div>
            </div>
            <div class="dashboard-card">
                <h3>درآمد امروز</h3>
                <div class="value">245,000 افغانی</div>
                <div class="change">↑ 8% نسبت به دیروز</div>
            </div>
            <div class="dashboard-card">
                <h3>رانندگان آنلاین</h3>
                <div class="value">342</div>
                <div class="change">↓ 5% نسبت به دیروز</div>
            </div>
            <div class="dashboard-card">
                <h3>مسافران جدید</h3>
                <div class="value">89</div>
                <div class="change">↑ 15% نسبت به دیروز</div>
            </div>
        </div>
        
        <div class="recent-table">
            <h3>آخرین سفرها</h3>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>شماره سفر</th>
                        <th>مسافر</th>
                        <th>راننده</th>
                        <th>مبلغ</th>
                        <th>وضعیت</th>
                        <th>زمان</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>TRP-001234</td>
                        <td>احمد محمدی</td>
                        <td>کریم احمدی</td>
                        <td>150 افغانی</td>
                        <td><span class="status-badge status-active">تکمیل شده</span></td>
                        <td>10:30 امروز</td>
                    </tr>
                    <tr>
                        <td>TRP-001233</td>
                        <td>محمود کریمی</td>
                        <td>رضا محمودی</td>
                        <td>200 افغانی</td>
                        <td><span class="status-badge status-active">تکمیل شده</span></td>
                        <td>09:45 امروز</td>
                    </tr>
                </tbody>
            </table>
        </div>
    `;
}

// ==================== سیستم مدیریت شهرها و مناطق ====================

async function loadCities() {
    try {
        const { data, error } = await supabase
            .from('cities')
            .select('*')
            .order('name');
        
        const content = document.getElementById('dynamicContent');
        
        if (error) {
            content.innerHTML = `<div class="error">خطا در بارگذاری شهرها: ${error.message}</div>`;
            return;
        }
        
        let html = `
            <div class="filter-bar">
                <button class="btn btn-primary" onclick="showCityForm()">
                    <i class="fas fa-plus"></i> افزودن شهر جدید
                </button>
                <input type="text" class="form-control" placeholder="جستجوی شهر..." onkeyup="filterCities(this.value)">
            </div>
            
            <div class="recent-table">
                <table class="data-table" id="citiesTable">
                    <thead>
                        <tr>
                            <th>نام شهر</th>
                            <th>استان</th>
                            <th>تعداد مناطق</th>
                            <th>وضعیت</th>
                            <th>تاریخ ایجاد</th>
                            <th>عملیات</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        data.forEach(city => {
            html += `
                <tr>
                    <td>${city.name}</td>
                    <td>${city.province}</td>
                    <td>${city.district_count || 0}</td>
                    <td>
                        <span class="status-badge ${city.is_active ? 'status-active' : 'status-inactive'}">
                            ${city.is_active ? 'فعال' : 'غیرفعال'}
                        </span>
                    </td>
                    <td>${new Date(city.created_at).toLocaleDateString('fa-IR')}</td>
                    <td>
                        <div class="action-buttons">
                            <button class="btn btn-sm btn-primary" onclick="editCity('${city.id}')">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn btn-sm ${city.is_active ? 'btn-danger' : 'btn-success'}" 
                                    onclick="toggleCityStatus('${city.id}', ${city.is_active})">
                                <i class="fas ${city.is_active ? 'fa-ban' : 'fa-check'}"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });
        
        html += `
                    </tbody>
                </table>
            </div>
        `;
        
        content.innerHTML = html;
        
    } catch (error) {
        console.error('Error loading cities:', error);
    }
}

function showCityForm(cityId = null) {
    const modalHTML = `
        <div class="form-modal active" id="cityModal">
            <div class="form-modal-content">
                <div class="form-modal-header">
                    <h3>${cityId ? 'ویرایش شهر' : 'افزودن شهر جدید'}</h3>
                    <button class="btn btn-secondary" onclick="closeModal()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="form-modal-body">
                    <form id="cityForm" onsubmit="saveCity(event, '${cityId}')">
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">نام شهر</label>
                                <input type="text" class="form-control" id="cityName" required>
                            </div>
                            <div class="form-group">
                                <label class="form-label">استان</label>
                                <input type="text" class="form-control" id="cityProvince" required>
                            </div>
                        </div>
                        
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">عرض جغرافیایی</label>
                                <input type="number" step="any" class="form-control" id="cityLat">
                            </div>
                            <div class="form-group">
                                <label class="form-label">طول جغرافیایی</label>
                                <input type="number" step="any" class="form-control" id="cityLng">
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">وضعیت</label>
                            <select class="form-control" id="cityStatus">
                                <option value="true">فعال</option>
                                <option value="false">غیرفعال</option>
                            </select>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">توضیحات</label>
                            <textarea class="form-control" id="cityDescription" rows="3"></textarea>
                        </div>
                        
                        <div class="form-modal-footer" style="display: flex; gap: 10px; margin-top: 20px;">
                            <button type="submit" class="btn btn-primary">ذخیره</button>
                            <button type="button" class="btn btn-secondary" onclick="closeModal()">لغو</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    if (cityId) {
        loadCityData(cityId);
    }
}

async function loadCityData(cityId) {
    try {
        const { data, error } = await supabase
            .from('cities')
            .select('*')
            .eq('id', cityId)
            .single();
        
        if (!error && data) {
            document.getElementById('cityName').value = data.name;
            document.getElementById('cityProvince').value = data.province;
            document.getElementById('cityLat').value = data.latitude || '';
            document.getElementById('cityLng').value = data.longitude || '';
            document.getElementById('cityStatus').value = data.is_active;
            document.getElementById('cityDescription').value = data.description || '';
        }
    } catch (error) {
        console.error('Error loading city data:', error);
    }
}

async function saveCity(event, cityId) {
    event.preventDefault();
    
    const cityData = {
        name: document.getElementById('cityName').value,
        province: document.getElementById('cityProvince').value,
        latitude: parseFloat(document.getElementById('cityLat').value) || null,
        longitude: parseFloat(document.getElementById('cityLng').value) || null,
        is_active: document.getElementById('cityStatus').value === 'true',
        description: document.getElementById('cityDescription').value,
        updated_at: new Date().toISOString()
    };
    
    try {
        let result;
        
        if (cityId) {
            result = await supabase
                .from('cities')
                .update(cityData)
                .eq('id', cityId);
        } else {
            cityData.created_at = new Date().toISOString();
            result = await supabase
                .from('cities')
                .insert([cityData]);
        }
        
        if (result.error) {
            alert('خطا در ذخیره شهر: ' + result.error.message);
        } else {
            closeModal();
            loadCities();
            alert('شهر با موفقیت ذخیره شد');
        }
    } catch (error) {
        console.error('Error saving city:', error);
        alert('خطا در ذخیره شهر');
    }
}

// ==================== سیستم مدیریت فرمول‌های کرایه ====================

async function loadFares() {
    try {
        const { data, error } = await supabase
            .from('fares')
            .select(`
                *,
                cities (name),
                districts (name),
                services (name)
            `)
            .order('created_at', { ascending: false });
        
        const content = document.getElementById('dynamicContent');
        
        let html = `
            <div class="filter-bar">
                <button class="btn btn-primary" onclick="showFareForm()">
                    <i class="fas fa-plus"></i> فرمول جدید
                </button>
                <select class="form-control" onchange="filterFares(this.value)">
                    <option value="">همه شهرها</option>
                    ${cities.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
                </select>
                <select class="form-control" onchange="filterFaresByService(this.value)">
                    <option value="">همه خدمات</option>
                    ${services.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
                </select>
            </div>
            
            <div class="recent-table">
                <table class="data-table" id="faresTable">
                    <thead>
                        <tr>
                            <th>شهر</th>
                            <th>منطقه</th>
                            <th>نوع خدمات</th>
                            <th>کرایه پایه</th>
                            <th>هر کیلومتر</th>
                            <th>هر دقیقه</th>
                            <th>حداقل کرایه</th>
                            <th>وضعیت</th>
                            <th>عملیات</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        data.forEach(fare => {
            html += `
                <tr>
                    <td>${fare.cities?.name || '-'}</td>
                    <td>${fare.districts?.name || 'همه مناطق'}</td>
                    <td>${fare.services?.name || 'همه خدمات'}</td>
                    <td>${fare.base_fare} افغانی</td>
                    <td>${fare.per_km} افغانی</td>
                    <td>${fare.per_minute} افغانی</td>
                    <td>${fare.min_fare} افغانی</td>
                    <td>
                        <span class="status-badge ${fare.is_active ? 'status-active' : 'status-inactive'}">
                            ${fare.is_active ? 'فعال' : 'غیرفعال'}
                        </span>
                    </td>
                    <td>
                        <div class="action-buttons">
                            <button class="btn btn-sm btn-primary" onclick="editFare('${fare.id}')">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn btn-sm btn-danger" onclick="deleteFare('${fare.id}')">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });
        
        html += `
                    </tbody>
                </table>
            </div>
        `;
        
        content.innerHTML = html;
        
    } catch (error) {
        console.error('Error loading fares:', error);
    }
}

function showFareForm(fareId = null) {
    const modalHTML = `
        <div class="form-modal active" id="fareModal">
            <div class="form-modal-content">
                <div class="form-modal-header">
                    <h3>${fareId ? 'ویرایش فرمول کرایه' : 'فرمول کرایه جدید'}</h3>
                    <button class="btn btn-secondary" onclick="closeModal()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="form-modal-body">
                    <form id="fareForm" onsubmit="saveFare(event, '${fareId}')">
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">شهر</label>
                                <select class="form-control" id="fareCity" required>
                                    <option value="">انتخاب شهر</option>
                                    ${cities.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
                                </select>
                            </div>
                            <div class="form-group">
                                <label class="form-label">منطقه (اختیاری)</label>
                                <select class="form-control" id="fareDistrict">
                                    <option value="">همه مناطق</option>
                                    ${districts.map(d => `<option value="${d.id}">${d.name}</option>`).join('')}
                                </select>
                            </div>
                        </div>
                        
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">نوع خدمات</label>
                                <select class="form-control" id="fareService" required>
                                    <option value="">انتخاب خدمات</option>
                                    ${services.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
                                </select>
                            </div>
                            <div class="form-group">
                                <label class="form-label">نوع وسیله</label>
                                <select class="form-control" id="fareVehicleType">
                                    <option value="car">ماشین</option>
                                    <option value="bike">موتور</option>
                                    <option value="van">ون</option>
                                </select>
                            </div>
                        </div>
                        
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">کرایه پایه (افغانی)</label>
                                <input type="number" class="form-control" id="fareBase" required min="0">
                            </div>
                            <div class="form-group">
                                <label class="form-label">کرایه هر کیلومتر (افغانی)</label>
                                <input type="number" step="0.1" class="form-control" id="farePerKm" required min="0">
                            </div>
                        </div>
                        
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">کرایه هر دقیقه (افغانی)</label>
                                <input type="number" step="0.1" class="form-control" id="farePerMinute" required min="0">
                            </div>
                            <div class="form-group">
                                <label class="form-label">حداقل کرایه (افغانی)</label>
                                <input type="number" class="form-control" id="fareMin" required min="0">
                            </div>
                        </div>
                        
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">حداقل مسافت (کیلومتر)</label>
                                <input type="number" step="0.1" class="form-control" id="fareMinDistance" required min="0">
                            </div>
                            <div class="form-group">
                                <label class="form-label">حداکثر مسافت (کیلومتر)</label>
                                <input type="number" step="0.1" class="form-control" id="fareMaxDistance" required min="0">
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">ضریب ترافیک</label>
                            <input type="number" step="0.1" class="form-control" id="fareTrafficFactor" value="1.0" min="1">
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">وضعیت</label>
                            <select class="form-control" id="fareStatus">
                                <option value="true">فعال</option>
                                <option value="false">غیرفعال</option>
                            </select>
                        </div>
                        
                        <div class="form-modal-footer">
                            <button type="submit" class="btn btn-primary">ذخیره</button>
                            <button type="button" class="btn btn-secondary" onclick="closeModal()">لغو</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    if (fareId) {
        loadFareData(fareId);
    }
}

// ==================== سیستم کمیسیون رانندگان ====================

async function loadCommissions() {
    try {
        const { data, error } = await supabase
            .from('commissions')
            .select(`
                *,
                cities (name),
                districts (name),
                services (name)
            `)
            .order('created_at', { ascending: false });
        
        const content = document.getElementById('dynamicContent');
        
        let html = `
            <div class="filter-bar">
                <button class="btn btn-primary" onclick="showCommissionForm()">
                    <i class="fas fa-plus"></i> قانون کمیسیون جدید
                </button>
            </div>
            
            <div class="recent-table">
                <table class="data-table" id="commissionsTable">
                    <thead>
                        <tr>
                            <th>شهر</th>
                            <th>منطقه</th>
                            <th>خدمات</th>
                            <th>درصد کمیسیون</th>
                            <th>حداقل سفرها</th>
                            <th>اعتبار اضافی</th>
                            <th>نوع سفر</th>
                            <th>وضعیت</th>
                            <th>عملیات</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        data.forEach(commission => {
            html += `
                <tr>
                    <td>${commission.cities?.name || 'همه شهرها'}</td>
                    <td>${commission.districts?.name || 'همه مناطق'}</td>
                    <td>${commission.services?.name || 'همه خدمات'}</td>
                    <td>${commission.percentage}%</td>
                    <td>${commission.min_trips || 0}</td>
                    <td>${commission.extra_credit || 0} افغانی</td>
                    <td>${commission.trip_type === 'app' ? 'اپلیکیشن' : 'تلفنی'}</td>
                    <td>
                        <span class="status-badge ${commission.is_active ? 'status-active' : 'status-inactive'}">
                            ${commission.is_active ? 'فعال' : 'غیرفعال'}
                        </span>
                    </td>
                    <td>
                        <div class="action-buttons">
                            <button class="btn btn-sm btn-primary" onclick="editCommission('${commission.id}')">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn btn-sm btn-danger" onclick="deleteCommission('${commission.id}')">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });
        
        html += `
                    </tbody>
                </table>
            </div>
        `;
        
        content.innerHTML = html;
        
    } catch (error) {
        console.error('Error loading commissions:', error);
    }
}

function showCommissionForm(commissionId = null) {
    const modalHTML = `
        <div class="form-modal active" id="commissionModal">
            <div class="form-modal-content">
                <div class="form-modal-header">
                    <h3>${commissionId ? 'ویرایش قانون کمیسیون' : 'قانون کمیسیون جدید'}</h3>
                    <button class="btn btn-secondary" onclick="closeModal()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="form-modal-body">
                    <form id="commissionForm" onsubmit="saveCommission(event, '${commissionId}')">
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">شهر</label>
                                <select class="form-control" id="commissionCity">
                                    <option value="">همه شهرها</option>
                                    ${cities.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
                                </select>
                            </div>
                            <div class="form-group">
                                <label class="form-label">منطقه (اختیاری)</label>
                                <select class="form-control" id="commissionDistrict">
                                    <option value="">همه مناطق</option>
                                    ${districts.map(d => `<option value="${d.id}">${d.name}</option>`).join('')}
                                </select>
                            </div>
                        </div>
                        
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">نوع خدمات</label>
                                <select class="form-control" id="commissionService">
                                    <option value="">همه خدمات</option>
                                    ${services.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
                                </select>
                            </div>
                            <div class="form-group">
                                <label class="form-label">نوع سفر</label>
                                <select class="form-control" id="commissionTripType" required>
                                    <option value="app">اپلیکیشن</option>
                                    <option value="phone">تلفنی</option>
                                    <option value="station">ایستگاهی</option>
                                </select>
                            </div>
                        </div>
                        
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">درصد کمیسیون</label>
                                <input type="number" step="0.1" class="form-control" id="commissionPercentage" required min="0" max="100">
                            </div>
                            <div class="form-group">
                                <label class="form-label">حداقل تعداد سفر (برای اعتبار اضافی)</label>
                                <input type="number" class="form-control" id="commissionMinTrips" min="0">
                            </div>
                        </div>
                        
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">اعتبار اضافی (کمیسیون منفی)</label>
                                <input type="number" class="form-control" id="commissionExtraCredit" min="0">
                            </div>
                            <div class="form-group">
                                <label class="form-label">اعتبار در هر سفر</label>
                                <input type="number" class="form-control" id="commissionPerTrip" min="0">
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">تاریخ شروع</label>
                            <input type="date" class="form-control" id="commissionStartDate" required>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">تاریخ انقضا</label>
                            <input type="date" class="form-control" id="commissionExpiryDate">
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">وضعیت</label>
                            <select class="form-control" id="commissionStatus">
                                <option value="true">فعال</option>
                                <option value="false">غیرفعال</option>
                            </select>
                        </div>
                        
                        <div class="form-modal-footer">
                            <button type="submit" class="btn btn-primary">ذخیره</button>
                            <button type="button" class="btn btn-secondary" onclick="closeModal()">لغو</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('commissionStartDate').value = today;
    
    if (commissionId) {
        loadCommissionData(commissionId);
    }
}

// ==================== سیستم کوپن تخفیف ====================

async function loadCoupons() {
    try {
        const { data, error } = await supabase
            .from('coupons')
            .select(`
                *,
                cities (name),
                districts (name)
            `)
            .order('created_at', { ascending: false });
        
        const content = document.getElementById('dynamicContent');
        
        let html = `
            <div class="filter-bar">
                <button class="btn btn-primary" onclick="showCouponForm()">
                    <i class="fas fa-plus"></i> کوپن جدید
                </button>
                <button class="btn btn-secondary" onclick="generateBulkCoupons()">
                    <i class="fas fa-barcode"></i> تولید دسته‌ای
                </button>
                <input type="text" class="form-control" placeholder="جستجوی کد..." onkeyup="filterCoupons(this.value)">
            </div>
            
            <div class="recent-table">
                <table class="data-table" id="couponsTable">
                    <thead>
                        <tr>
                            <th>کد تخفیف</th>
                            <th>نوع تخفیف</th>
                            <th>مقدار</th>
                            <th>شهر</th>
                            <th>حداکثر استفاده</th>
                            <th>استفاده شده</th>
                            <th>انقضا</th>
                            <th>وضعیت</th>
                            <th>عملیات</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        data.forEach(coupon => {
            html += `
                <tr>
                    <td><strong>${coupon.code}</strong></td>
                    <td>${coupon.discount_type === 'percentage' ? 'درصدی' : 'مبلغی'}</td>
                    <td>
                        ${coupon.discount_type === 'percentage' ? 
                          `${coupon.discount_value}%` : 
                          `${coupon.discount_value} افغانی`}
                    </td>
                    <td>${coupon.cities?.name || 'همه شهرها'}</td>
                    <td>${coupon.max_usage || 'نامحدود'}</td>
                    <td>${coupon.used_count || 0}</td>
                    <td>${new Date(coupon.expiry_date).toLocaleDateString('fa-IR')}</td>
                    <td>
                        <span class="status-badge ${coupon.is_active ? 'status-active' : 'status-inactive'}">
                            ${coupon.is_active ? 'فعال' : 'غیرفعال'}
                        </span>
                    </td>
                    <td>
                        <div class="action-buttons">
                            <button class="btn btn-sm btn-primary" onclick="editCoupon('${coupon.id}')">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn btn-sm btn-danger" onclick="deleteCoupon('${coupon.id}')">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });
        
        html += `
                    </tbody>
                </table>
            </div>
        `;
        
        content.innerHTML = html;
        
    } catch (error) {
        console.error('Error loading coupons:', error);
    }
}

function showCouponForm(couponId = null) {
    const modalHTML = `
        <div class="form-modal active" id="couponModal">
            <div class="form-modal-content">
                <div class="form-modal-header">
                    <h3>${couponId ? 'ویرایش کوپن' : 'کوپن جدید'}</h3>
                    <button class="btn btn-secondary" onclick="closeModal()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="form-modal-body">
                    <form id="couponForm" onsubmit="saveCoupon(event, '${couponId}')">
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">کد تخفیف</label>
                                <div style="display: flex; gap: 10px;">
                                    <input type="text" class="form-control" id="couponPrefix" placeholder="پیشوند (اختیاری)" style="flex: 1;">
                                    <input type="text" class="form-control" id="couponCode" placeholder="کد" style="flex: 2;" required>
                                    <button type="button" class="btn btn-secondary" onclick="generateCouponCode()">
                                        <i class="fas fa-random"></i>
                                    </button>
                                </div>
                            </div>
                            <div class="form-group">
                                <label class="form-label">تعداد (برای تولید دسته‌ای)</label>
                                <input type="number" class="form-control" id="couponQuantity" min="1" value="1">
                            </div>
                        </div>
                        
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">نوع تخفیف</label>
                                <select class="form-control" id="couponDiscountType" required>
                                    <option value="percentage">درصدی</option>
                                    <option value="fixed">مبلغی</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label class="form-label">مقدار تخفیف</label>
                                <input type="number" step="0.1" class="form-control" id="couponDiscountValue" required min="0">
                            </div>
                        </div>
                        
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">حداکثر تخفیف (برای درصدی)</label>
                                <input type="number" class="form-control" id="couponMaxDiscount" min="0">
                            </div>
                            <div class="form-group">
                                <label class="form-label">حداقل خرید</label>
                                <input type="number" class="form-control" id="couponMinAmount" min="0">
                            </div>
                        </div>
                        
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">شهر</label>
                                <select class="form-control" id="couponCity">
                                    <option value="">همه شهرها</option>
                                    ${cities.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
                                </select>
                            </div>
                            <div class="form-group">
                                <label class="form-label">منطقه (اختیاری)</label>
                                <select class="form-control" id="couponDistrict">
                                    <option value="">همه مناطق</option>
                                    ${districts.map(d => `<option value="${d.id}">${d.name}</option>`).join('')}
                                </select>
                            </div>
                        </div>
                        
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">حداکثر استفاده</label>
                                <input type="number" class="form-control" id="couponMaxUsage" min="1">
                            </div>
                            <div class="form-group">
                                <label class="form-label">استفاده برای کاربر</label>
                                <input type="number" class="form-control" id="couponPerUser" min="1" value="1">
                            </div>
                        </div>
                        
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">تاریخ شروع</label>
                                <input type="date" class="form-control" id="couponStartDate" required>
                            </div>
                            <div class="form-group">
                                <label class="form-label">تاریخ انقضا</label>
                                <input type="date" class="form-control" id="couponExpiryDate" required>
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">وضعیت</label>
                            <select class="form-control" id="couponStatus">
                                <option value="true">فعال</option>
                                <option value="false">غیرفعال</option>
                            </select>
                        </div>
                        
                        <div class="form-modal-footer">
                            <button type="submit" class="btn btn-primary">ذخیره</button>
                            <button type="button" class="btn btn-secondary" onclick="closeModal()">لغو</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('couponStartDate').value = today;
    
    // تنظیم تاریخ انقضا به یک ماه بعد
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    document.getElementById('couponExpiryDate').value = nextMonth.toISOString().split('T')[0];
    
    if (couponId) {
        loadCouponData(couponId);
    }
}

function generateCouponCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    document.getElementById('couponCode').value = code;
}

// ==================== سیستم سفارش تاکسی ====================

class TaxiOrderSystem {
    constructor() {
        this.currentOrder = null;
        this.selectedServices = [];
        this.stops = [];
    }
    
    async createOrder(passengerData, pickup, destination, stops = [], services = [], couponCode = null) {
        try {
            // ثبت‌نام خودکار مسافر
            let passengerId = passengerData.id;
            if (!passengerId) {
                const { data: passenger, error } = await this.registerPassenger(passengerData);
                if (error) throw error;
                passengerId = passenger.id;
            }
            
            // اعتبارسنجی کوپن
            let discount = 0;
            if (couponCode) {
                const validation = taxiSystem.validateCoupon(couponCode, passengerId, 0, 1, 1);
                if (validation.valid) {
                    discount = validation.discount;
                }
            }
            
            // محاسبه کرایه
            const fare = await this.calculateFare(pickup, destination, stops, services);
            
            // ایجاد سفارش
            const orderData = {
                passenger_id: passengerId,
                pickup_address: pickup.address,
                pickup_coordinates: JSON.stringify([pickup.lat, pickup.lng]),
                destination_address: destination.address,
                destination_coordinates: JSON.stringify([destination.lat, destination.lng]),
                stops: JSON.stringify(stops),
                services: JSON.stringify(services),
                estimated_distance: fare.distance,
                estimated_duration: fare.duration,
                estimated_fare: fare.amount,
                discount: discount,
                final_fare: fare.amount - discount,
                status: 'pending',
                payment_method: 'cash',
                created_at: new Date().toISOString()
            };
            
            const { data: order, error } = await supabase
                .from('orders')
                .insert([orderData])
                .select()
                .single();
            
            if (error) throw error;
            
            this.currentOrder = order;
            return order;
            
        } catch (error) {
            console.error('Error creating order:', error);
            throw error;
        }
    }
    
    async registerPassenger(passengerData) {
        try {
            const { data, error } = await supabase
                .from('passengers')
                .insert([{
                    phone: passengerData.phone,
                    name: passengerData.name,
                    email: passengerData.email || null,
                    is_active: true,
                    registered_at: new Date().toISOString()
                }])
                .select()
                .single();
            
            if (error) {
                // اگر کاربر از قبل وجود دارد، برگرداندن آن
                const { data: existing } = await supabase
                    .from('passengers')
                    .select('*')
                    .eq('phone', passengerData.phone)
                    .single();
                
                if (existing) return { data: existing, error: null };
                throw error;
            }
            
            return { data, error: null };
        } catch (error) {
            return { data: null, error };
        }
    }
    
    async calculateFare(pickup, destination, stops, services) {
        try {
            // محاسبه مسافت و زمان با API
            const route = await this.calculateRoute(pickup, destination, stops);
            
            // محاسبه کرایه با سیستم داینامیک
            const fare = taxiSystem.calculateDynamicFare(
                route.distance,
                route.duration,
                services[0]?.type || 'economy',
                1, // cityId
                1, // districtId
                'normal'
            );
            
            // اضافه کردن هزینه توقف‌ها
            stops.forEach(stop => {
                fare += 50; // هزینه اضافی برای هر توقف
            });
            
            // اضافه کردن هزینه خدمات اضافی
            services.forEach(service => {
                fare += service.extra_fee || 0;
            });
            
            return {
                distance: route.distance,
                duration: route.duration,
                amount: fare
            };
            
        } catch (error) {
            console.error('Error calculating fare:', error);
            // محاسبه ساده در صورت خطا
            const distance = this.calculateDistance(
                pickup.lat, pickup.lng,
                destination.lat, destination.lng
            );
            const duration = distance * 3; // 3 دقیقه برای هر کیلومتر
            
            return {
                distance: distance,
                duration: Math.round(duration),
                amount: distance * 25 // 25 افغانی برای هر کیلومتر
            };
        }
    }
    
    async calculateRoute(pickup, destination, stops) {
        try {
            const coordinates = [
                [pickup.lng, pickup.lat],
                ...stops.map(stop => [stop.lng, stop.lat]),
                [destination.lng, destination.lat]
            ];
            
            const response = await fetch('https://api.openrouteservice.org/v2/directions/driving-car/geojson', {
                method: 'POST',
                headers: {
                    'Authorization': ORS_API_KEY,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    coordinates: coordinates,
                    instructions: false,
                    units: 'km'
                })
            });
            
            const data = await response.json();
            
            if (data.features && data.features[0]) {
                const route = data.features[0].properties;
                return {
                    distance: route.segments[0].distance / 1000,
                    duration: Math.round(route.segments[0].duration / 60)
                };
            }
            
            throw new Error('Route calculation failed');
            
        } catch (error) {
            throw error;
        }
    }
    
    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371;
        const dLat = this.toRad(lat2 - lat1);
        const dLon = this.toRad(lon2 - lon1);
        const a = 
            Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) * 
            Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }
    
    toRad(value) {
        return value * Math.PI / 180;
    }
}

// ==================== سیستم سفارش تاکسی توسط اپراتور ====================

class OperatorOrderSystem extends TaxiOrderSystem {
    constructor(operatorId) {
        super();
        this.operatorId = operatorId;
    }
    
    async createOperatorOrder(passengerPhone, pickup, destination, stops = [], services = [], couponCode = null, notes = '') {
        try {
            // یافتن یا ثبت‌نام مسافر
            let passenger = await this.findPassengerByPhone(passengerPhone);
            
            if (!passenger) {
                // ثبت‌نام خودکار مسافر جدید
                const { data: newPassenger, error } = await supabase
                    .from('passengers')
                    .insert([{
                        phone: passengerPhone,
                        name: 'مسافر ناشناس',
                        registered_by: this.operatorId,
                        is_active: true,
                        registered_at: new Date().toISOString()
                    }])
                    .select()
                    .single();
                
                if (error) throw error;
                passenger = newPassenger;
            }
            
            // ایجاد سفارش
            const order = await this.createOrder(
                passenger,
                pickup,
                destination,
                stops,
                services,
                couponCode
            );
            
            // ثبت یادداشت اپراتور
            if (notes) {
                await supabase
                    .from('order_notes')
                    .insert([{
                        order_id: order.id,
                        operator_id: this.operatorId,
                        note: notes,
                        created_at: new Date().toISOString()
                    }]);
            }
            
            // ارسال پیامک به مسافر
            await this.sendSMS(passenger.phone, `سفارش شما با شماره ${order.id} ثبت شد. راننده به زودی با شما تماس می‌گیرد.`);
            
            return order;
            
        } catch (error) {
            console.error('Error creating operator order:', error);
            throw error;
        }
    }
    
    async findPassengerByPhone(phone) {
        try {
            const { data, error } = await supabase
                .from('passengers')
                .select('*')
                .eq('phone', phone)
                .single();
            
            if (error) return null;
            return data;
        } catch (error) {
            return null;
        }
    }
    
    async sendSMS(phone, message) {
        // اینجا API پیامک وصل می‌شود
        console.log(`SMS to ${phone}: ${message}`);
        // در حالت واقعی:
        // await fetch('SMS_API_URL', { method: 'POST', body: JSON.stringify({ phone, message }) });
    }
}

// ==================== سیستم ثبت سفارش سفر تلفنی ====================

class PhoneOrderSystem {
    constructor() {
        this.stationQueues = new Map();
    }
    
    async createPhoneOrder(stationId, passengerPhone, destinationStationId = null) {
        try {
            // بررسی ظرفیت ایستگاه
            const station = await this.getStation(stationId);
            if (!station || !station.is_active) {
                throw new Error('ایستگاه فعال نیست');
            }
            
            // بررسی صف ایستگاه
            if (station.max_queue && this.getStationQueueSize(stationId) >= station.max_queue) {
                throw new Error('صف ایستگاه پر است');
            }
            
            // یافتن یا ثبت‌نام مسافر
            let passenger = await this.findPassengerByPhone(passengerPhone);
            if (!passenger) {
                passenger = await this.registerAutoPassenger(passengerPhone);
            }
            
            // محاسبه کرایه بین ایستگاه‌ها
            let fare = 0;
            if (destinationStationId) {
                fare = await this.calculateStationFare(stationId, destinationStationId);
            } else {
                // کرایه بر اساس جدول ماتریسی
                fare = station.base_fare || 100;
            }
            
            // ایجاد سفارش تلفنی
            const orderData = {
                passenger_id: passenger.id,
                station_id: stationId,
                destination_station_id: destinationStationId,
                fare: fare,
                status: 'waiting',
                order_type: 'phone',
                created_at: new Date().toISOString()
            };
            
            const { data: order, error } = await supabase
                .from('phone_orders')
                .insert([orderData])
                .select()
                .single();
            
            if (error) throw error;
            
            // اضافه کردن به صف ایستگاه
            this.addToStationQueue(stationId, order.id);
            
            // ارسال پیامک
            await this.sendOrderConfirmation(passenger.phone, order);
            
            // تخصیص به اپراتور
            await this.assignToOperator(order.id);
            
            return order;
            
        } catch (error) {
            console.error('Error creating phone order:', error);
            throw error;
        }
    }
    
    async getStation(stationId) {
        try {
            const { data, error } = await supabase
                .from('stations')
                .select('*')
                .eq('id', stationId)
                .single();
            
            return data;
        } catch (error) {
            return null;
        }
    }
    
    getStationQueueSize(stationId) {
        return this.stationQueues.get(stationId)?.length || 0;
    }
    
    addToStationQueue(stationId, orderId) {
        if (!this.stationQueues.has(stationId)) {
            this.stationQueues.set(stationId, []);
        }
        this.stationQueues.get(stationId).push(orderId);
    }
    
    async calculateStationFare(fromStationId, toStationId) {
        try {
            const { data, error } = await supabase
                .from('station_fares')
                .select('*')
                .eq('from_station_id', fromStationId)
                .eq('to_station_id', toStationId)
                .single();
            
            if (!error && data) {
                return data.fare;
            }
            
            // محاسبه ساده بر اساس فاصله
            const fromStation = await this.getStation(fromStationId);
            const toStation = await this.getStation(toStationId);
            
            if (fromStation && toStation) {
                const distance = this.calculateDistance(
                    fromStation.latitude, fromStation.longitude,
                    toStation.latitude, toStation.longitude
                );
                return distance * 25; // 25 افغانی برای هر کیلومتر
            }
            
            return 100; // کرایه پیش‌فرض
        } catch (error) {
            return 100;
        }
    }
    
    async registerAutoPassenger(phone) {
        try {
            const { data, error } = await supabase
                .from('passengers')
                .insert([{
                    phone: phone,
                    name: 'مسافر تلفنی',
                    is_active: true,
                    registered_at: new Date().toISOString()
                }])
                .select()
                .single();
            
            return data;
        } catch (error) {
            throw error;
        }
    }
    
    async sendOrderConfirmation(phone, order) {
        const message = `سفارش تلفنی شما با شماره ${order.id} ثبت شد. کرایه: ${order.fare} افغانی`;
        // ارسال پیامک واقعی
        console.log(`SMS to ${phone}: ${message}`);
    }
    
    async assignToOperator(orderId) {
        // اینجا منطق تخصیص سفارش به اپراتور پیاده‌سازی می‌شود
        // می‌تواند بر اساس نوبت یا تخصص اپراتور باشد
    }
    
    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371;
        const dLat = this.toRad(lat2 - lat1);
        const dLon = this.toRad(lon2 - lon1);
        const a = 
            Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) * 
            Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }
    
    toRad(value) {
        return value * Math.PI / 180;
    }
}

// ==================== سیستم تشکیل صف رانندگان ====================

class DriverQueueSystem {
    constructor() {
        this.stationQueues = new Map();
        this.driverLocations = new Map();
    }
    
    async addDriverToQueue(stationId, driverId) {
        try {
            const station = await this.getStation(stationId);
            if (!station || !station.is_active) {
                throw new Error('ایستگاه فعال نیست');
            }
            
            // بررسی وجود راننده در صف‌های دیگر
            await this.removeDriverFromAllQueues(driverId);
            
            // اضافه کردن به صف
            if (!this.stationQueues.has(stationId)) {
                this.stationQueues.set(stationId, []);
            }
            
            const queue = this.stationQueues.get(stationId);
            queue.push({
                driverId: driverId,
                joinedAt: new Date(),
                priority: await this.calculateDriverPriority(driverId)
            });
            
            // مرتب‌سازی صف بر اساس اولویت
            queue.sort((a, b) => b.priority - a.priority);
            
            // به‌روزرسانی وضعیت راننده
            await this.updateDriverStatus(driverId, 'in_queue', stationId);
            
            return true;
            
        } catch (error) {
            console.error('Error adding driver to queue:', error);
            return false;
        }
    }
    
    async removeDriverFromQueue(stationId, driverId) {
        try {
            if (this.stationQueues.has(stationId)) {
                const queue = this.stationQueues.get(stationId);
                const index = queue.findIndex(item => item.driverId === driverId);
                if (index > -1) {
                    queue.splice(index, 1);
                    
                    // به‌روزرسانی وضعیت راننده
                    await this.updateDriverStatus(driverId, 'available');
                    
                    return true;
                }
            }
            return false;
        } catch (error) {
            console.error('Error removing driver from queue:', error);
            return false;
        }
    }
    
    async removeDriverFromAllQueues(driverId) {
        for (const [stationId, queue] of this.stationQueues.entries()) {
            const index = queue.findIndex(item => item.driverId === driverId);
            if (index > -1) {
                queue.splice(index, 1);
                await this.updateDriverStatus(driverId, 'available');
            }
        }
    }
    
    async getNextDriver(stationId) {
        try {
            if (!this.stationQueues.has(stationId) || this.stationQueues.get(stationId).length === 0) {
                return null;
            }
            
            const queue = this.stationQueues.get(stationId);
            const nextDriver = queue[0];
            
            // حذف از صف
            queue.shift();
            
            // به‌روزرسانی وضعیت راننده
            await this.updateDriverStatus(nextDriver.driverId, 'on_trip');
            
            return nextDriver.driverId;
            
        } catch (error) {
            console.error('Error getting next driver:', error);
            return null;
        }
    }
    
    async calculateDriverPriority(driverId) {
        try {
            const { data: driver, error } = await supabase
                .from('drivers')
                .select('rating, trip_count, rejection_rate, online_hours_today')
                .eq('id', driverId)
                .single();
            
            if (error) return 0;
            
            let priority = 0;
            
            // امتیاز راننده (30%)
            priority += (driver.rating || 3) * 10;
            
            // تعداد سفرهای موفق (25%)
            priority += Math.min(driver.trip_count || 0, 100) * 0.25;
            
            // ساعت‌های آنلاین امروز (20%)
            priority += (driver.online_hours_today || 0) * 5;
            
            // نرخ رد سفر (منفی) (25%)
            priority -= (driver.rejection_rate || 0) * 25;
            
            return priority;
            
        } catch (error) {
            return 0;
        }
    }
    
    async updateDriverStatus(driverId, status, stationId = null) {
        try {
            const updates = {
                status: status,
                last_status_update: new Date().toISOString()
            };
            
            if (stationId) {
                updates.current_station_id = stationId;
            }
            
            await supabase
                .from('drivers')
                .update(updates)
                .eq('id', driverId);
        } catch (error) {
            console.error('Error updating driver status:', error);
        }
    }
    
    async getStation(stationId) {
        try {
            const { data, error } = await supabase
                .from('stations')
                .select('*')
                .eq('id', stationId)
                .single();
            
            return data;
        } catch (error) {
            return null;
        }
    }
    
    getQueueInfo(stationId) {
        if (!this.stationQueues.has(stationId)) {
            return {
                count: 0,
                drivers: [],
                waitTime: 0
            };
        }
        
        const queue = this.stationQueues.get(stationId);
        const avgWaitTime = queue.length * 5; // 5 دقیقه برای هر راننده در صف
        
        return {
            count: queue.length,
            drivers: queue.map(item => item.driverId),
            waitTime: avgWaitTime
        };
    }
}

// ==================== سیستم تعریف نمایندگی ====================

class RepresentativeSystem {
    constructor() {
        this.representatives = [];
    }
    
    async createRepresentative(data) {
        try {
            const representativeData = {
                name: data.name,
                city_id: data.city_id,
                phone: data.phone,
                email: data.email,
                address: data.address,
                commission_rate: data.commission_rate || 10,
                is_active: true,
                created_at: new Date().toISOString()
            };
            
            const { data: rep, error } = await supabase
                .from('representatives')
                .insert([representativeData])
                .select()
                .single();
            
            if (error) throw error;
            
            // ایجاد کاربر برای نماینده
            await this.createRepresentativeUser(rep, data.password);
            
            return rep;
            
        } catch (error) {
            console.error('Error creating representative:', error);
            throw error;
        }
    }
    
    async createRepresentativeUser(representative, password) {
        try {
            // ایجاد کاربر در سیستم auth
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email: representative.email,
                password: password,
                options: {
                    data: {
                        name: representative.name,
                        phone: representative.phone,
                        role: 'representative',
                        representative_id: representative.id
                    }
                }
            });
            
            if (authError) throw authError;
            
            // ایجاد پروفایل کاربر
            await supabase
                .from('profiles')
                .insert([{
                    id: authData.user.id,
                    email: representative.email,
                    name: representative.name,
                    phone: representative.phone,
                    role: 'representative',
                    representative_id: representative.id,
                    created_at: new Date().toISOString()
                }]);
            
            return authData.user;
            
        } catch (error) {
            console.error('Error creating representative user:', error);
            throw error;
        }
    }
    
    async getRepresentativeDashboard(representativeId) {
        try {
            const representative = await this.getRepresentative(representativeId);
            if (!representative) throw new Error('نماینده یافت نشد');
            
            // آمار منطقه‌ای
            const stats = await this.getRegionalStats(representative.city_id);
            
            // رانندگان زیرمجموعه
            const drivers = await this.getRepresentativeDrivers(representativeId);
            
            // درخواست‌های منطقه
            const requests = await this.getRegionalRequests(representative.city_id);
            
            // نقشه رانندگان
            const driverLocations = await this.getDriverLocations(representative.city_id);
            
            return {
                representative: representative,
                stats: stats,
                drivers: drivers,
                requests: requests,
                driverLocations: driverLocations
            };
            
        } catch (error) {
            console.error('Error getting dashboard:', error);
            throw error;
        }
    }
    
    async getRegionalStats(cityId) {
        try {
            const now = new Date();
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
            
            const [driversResult, tripsResult, revenueResult] = await Promise.all([
                supabase
                    .from('drivers')
                    .select('id', { count: 'exact' })
                    .eq('city_id', cityId)
                    .eq('is_active', true),
                
                supabase
                    .from('trips')
                    .select('id', { count: 'exact' })
                    .eq('city_id', cityId)
                    .gte('created_at', weekAgo.toISOString()),
                
                supabase
                    .from('trips')
                    .select('fare')
                    .eq('city_id', cityId)
                    .eq('status', 'completed')
                    .gte('created_at', today.toISOString())
            ]);
            
            const totalRevenue = revenueResult.data?.reduce((sum, trip) => sum + (trip.fare || 0), 0) || 0;
            
            return {
                total_drivers: driversResult.count || 0,
                weekly_trips: tripsResult.count || 0,
                today_revenue: totalRevenue,
                city_id: cityId
            };
            
        } catch (error) {
            console.error('Error getting regional stats:', error);
            return {
                total_drivers: 0,
                weekly_trips: 0,
                today_revenue: 0,
                city_id: cityId
            };
        }
    }
    
    async getRepresentative(representativeId) {
        try {
            const { data, error } = await supabase
                .from('representatives')
                .select('*')
                .eq('id', representativeId)
                .single();
            
            return data;
        } catch (error) {
            return null;
        }
    }
    
    async getRepresentativeDrivers(representativeId) {
        try {
            const { data, error } = await supabase
                .from('drivers')
                .select(`
                    *,
                    cities (name)
                `)
                .eq('representative_id', representativeId)
                .eq('is_active', true)
                .order('created_at', { ascending: false })
                .limit(50);
            
            return data || [];
        } catch (error) {
            return [];
        }
    }
    
    async getRegionalRequests(cityId) {
        try {
            const { data, error } = await supabase
                .from('trips')
                .select(`
                    *,
                    passengers (name, phone)
                `)
                .eq('city_id', cityId)
                .eq('status', 'searching')
                .order('created_at', { ascending: false })
                .limit(20);
            
            return data || [];
        } catch (error) {
            return [];
        }
    }
    
    async getDriverLocations(cityId) {
        try {
            const { data, error } = await supabase
                .from('drivers')
                .select('id, name, current_location, vehicle_type')
                .eq('city_id', cityId)
                .eq('is_online', true)
                .eq('is_active', true);
            
            return data || [];
        } catch (error) {
            return [];
        }
    }
}

// ==================== مدیریت مدارک رانندگان ====================

class DriverDocumentSystem {
    constructor() {
        this.requiredDocuments = [
            { id: 'license', name: 'گواهینامه رانندگی', type: 'image' },
            { id: 'national_id', name: 'کارت ملی', type: 'image' },
            { id: 'vehicle_card', name: 'کارت ماشین', type: 'image' },
            { id: 'insurance', name: 'بیمه نامه', type: 'image' },
            { id: 'profile_photo', name: 'عکس پرسنلی', type: 'image' }
        ];
    }
    
    async uploadDocument(driverId, documentType, file, metadata = {}) {
        try {
            // آپلود فایل به Supabase Storage
            const fileExt = file.name.split('.').pop();
            const fileName = `${driverId}_${documentType}_${Date.now()}.${fileExt}`;
            const filePath = `driver_documents/${fileName}`;
            
            const { error: uploadError } = await supabase.storage
                .from('documents')
                .upload(filePath, file);
            
            if (uploadError) throw uploadError;
            
            // دریافت URL عمومی
            const { data: urlData } = supabase.storage
                .from('documents')
                .getPublicUrl(filePath);
            
            // ذخیره اطلاعات در دیتابیس
            const documentData = {
                driver_id: driverId,
                document_type: documentType,
                file_url: urlData.publicUrl,
                file_name: fileName,
                file_size: file.size,
                mime_type: file.type,
                metadata: JSON.stringify(metadata),
                uploaded_at: new Date().toISOString(),
                status: 'pending',
                verified_by: null,
                verified_at: null
            };
            
            const { data: doc, error: dbError } = await supabase
                .from('driver_documents')
                .insert([documentData])
                .select()
                .single();
            
            if (dbError) throw dbError;
            
            // بررسی تکمیل مدارک راننده
            await this.checkDriverDocumentsCompletion(driverId);
            
            return doc;
            
        } catch (error) {
            console.error('Error uploading document:', error);
            throw error;
        }
    }
    
    async verifyDocument(documentId, adminId, status, notes = '') {
        try {
            const updates = {
                status: status,
                verified_by: adminId,
                verified_at: new Date().toISOString(),
                verification_notes: notes
            };
            
            const { data, error } = await supabase
                .from('driver_documents')
                .update(updates)
                .eq('id', documentId)
                .select()
                .single();
            
            if (error) throw error;
            
            // بررسی وضعیت کلی راننده
            await this.updateDriverStatus(data.driver_id);
            
            return data;
            
        } catch (error) {
            console.error('Error verifying document:', error);
            throw error;
        }
    }
    
    async checkDriverDocumentsCompletion(driverId) {
        try {
            const { data: documents, error } = await supabase
                .from('driver_documents')
                .select('*')
                .eq('driver_id', driverId);
            
            if (error) throw error;
            
            // بررسی مدارک ضروری
            const requiredDocs = this.requiredDocuments.map(doc => doc.id);
            const uploadedDocs = documents.map(doc => doc.document_type);
            
            const missingDocs = requiredDocs.filter(doc => !uploadedDocs.includes(doc));
            const allVerified = documents.every(doc => doc.status === 'verified');
            
            let driverStatus = 'pending_documents';
            
            if (missingDocs.length === 0) {
                driverStatus = allVerified ? 'documents_verified' : 'documents_uploaded';
            }
            
            // به‌روزرسانی وضعیت راننده
            await supabase
                .from('drivers')
                .update({
                    document_status: driverStatus,
                    missing_documents: missingDocs.length > 0 ? JSON.stringify(missingDocs) : null,
                    documents_verified: allVerified,
                    updated_at: new Date().toISOString()
                })
                .eq('id', driverId);
            
            return {
                uploaded: uploadedDocs.length,
                required: requiredDocs.length,
                missing: missingDocs,
                all_verified: allVerified,
                status: driverStatus
            };
            
        } catch (error) {
            console.error('Error checking documents:', error);
            throw error;
        }
    }
    
    async updateDriverStatus(driverId) {
        try {
            const { data: driver, error } = await supabase
                .from('drivers')
                .select('document_status, documents_verified')
                .eq('id', driverId)
                .single();
            
            if (error) throw error;
            
            if (driver.document_status === 'documents_verified' && driver.documents_verified) {
                // فعال کردن راننده اگر مدارک کامل است
                await supabase
                    .from('drivers')
                    .update({
                        is_active: true,
                        activation_date: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', driverId);
            }
            
        } catch (error) {
            console.error('Error updating driver status:', error);
            throw error;
        }
    }
    
    async getDriverDocuments(driverId) {
        try {
            const { data: documents, error } = await supabase
                .from('driver_documents')
                .select('*')
                .eq('driver_id', driverId)
                .order('uploaded_at', { ascending: false });
            
            if (error) throw error;
            
            // گروه‌بندی مدارک بر اساس نوع
            const groupedDocs = {};
            documents.forEach(doc => {
                if (!groupedDocs[doc.document_type]) {
                    groupedDocs[doc.document_type] = [];
                }
                groupedDocs[doc.document_type].push(doc);
            });
            
            return {
                documents: documents,
                grouped: groupedDocs,
                required: this.requiredDocuments,
                stats: {
                    total: documents.length,
                    verified: documents.filter(d => d.status === 'verified').length,
                    pending: documents.filter(d => d.status === 'pending').length,
                    rejected: documents.filter(d => d.status === 'rejected').length
                }
            };
            
        } catch (error) {
            console.error('Error getting driver documents:', error);
            throw error;
        }
    }
}

// ==================== مدیریت مسافران ====================

async function loadPassengers() {
    try {
        const { data, error } = await supabase
            .from('passengers')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);
        
        const content = document.getElementById('dynamicContent');
        
        let html = `
            <div class="filter-bar">
                <button class="btn btn-primary" onclick="showPassengerForm()">
                    <i class="fas fa-plus"></i> افزودن مسافر
                </button>
                <input type="text" class="form-control" placeholder="جستجوی نام یا شماره..." 
                       onkeyup="filterPassengers(this.value)">
                <select class="form-control" onchange="filterPassengersByStatus(this.value)">
                    <option value="">همه وضعیت‌ها</option>
                    <option value="active">فعال</option>
                    <option value="blocked">مسدود شده</option>
                </select>
            </div>
            
            <div class="recent-table">
                <table class="data-table" id="passengersTable">
                    <thead>
                        <tr>
                            <th>نام</th>
                            <th>شماره تماس</th>
                            <th>ایمیل</th>
                            <th>تعداد سفرها</th>
                            <th>اعتبار کیف پول</th>
                            <th>وضعیت</th>
                            <th>تاریخ ثبت‌نام</th>
                            <th>عملیات</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        data.forEach(passenger => {
            html += `
                <tr>
                    <td>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <div style="width: 40px; height: 40px; background: #e5e7eb; border-radius: 50%; 
                                 display: flex; align-items: center; justify-content: center;">
                                <i class="fas fa-user"></i>
                            </div>
                            <div>
                                <strong>${passenger.name || 'نامشخص'}</strong>
                                ${passenger.phone_verified ? 
                                 '<br><small style="color: green;">✓ تایید شده</small>' : 
                                 '<br><small style="color: orange;">در انتظار تایید</small>'}
                            </div>
                        </div>
                    </td>
                    <td>${passenger.phone}</td>
                    <td>${passenger.email || '-'}</td>
                    <td>${passenger.trip_count || 0}</td>
                    <td>
                        <span class="${passenger.wallet_balance > 0 ? 'text-success' : 'text-muted'}">
                            ${(passenger.wallet_balance || 0).toLocaleString('fa-IR')} افغانی
                        </span>
                    </td>
                    <td>
                        <span class="status-badge ${passenger.is_active ? 'status-active' : 'status-inactive'}">
                            ${passenger.is_active ? 'فعال' : 'مسدود'}
                        </span>
                    </td>
                    <td>${new Date(passenger.created_at).toLocaleDateString('fa-IR')}</td>
                    <td>
                        <div class="action-buttons">
                            <button class="btn btn-sm btn-primary" onclick="editPassenger('${passenger.id}')">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn btn-sm ${passenger.is_active ? 'btn-danger' : 'btn-success'}" 
                                    onclick="togglePassengerStatus('${passenger.id}', ${passenger.is_active})">
                                <i class="fas ${passenger.is_active ? 'fa-ban' : 'fa-check'}"></i>
                            </button>
                            <button class="btn btn-sm btn-info" onclick="viewPassengerTrips('${passenger.id}')">
                                <i class="fas fa-history"></i>
                            </button>
                            <button class="btn btn-sm btn-warning" onclick="manageWallet('${passenger.id}')">
                                <i class="fas fa-wallet"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });
        
        html += `
                    </tbody>
                </table>
            </div>
        `;
        
        content.innerHTML = html;
        
    } catch (error) {
        console.error('Error loading passengers:', error);
    }
}

function manageWallet(passengerId) {
    const modalHTML = `
        <div class="form-modal active" id="walletModal">
            <div class="form-modal-content">
                <div class="form-modal-header">
                    <h3>مدیریت کیف پول مسافر</h3>
                    <button class="btn btn-secondary" onclick="closeModal()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="form-modal-body">
                    <div id="walletInfo" style="text-align: center; margin-bottom: 20px;">
                        <div class="wallet-balance" style="font-size: 24px; font-weight: bold; color: ${COLORS.primary};">
                            در حال بارگذاری...
                        </div>
                        <div class="wallet-transactions" style="margin-top: 20px; max-height: 300px; overflow-y: auto;">
                            <h4>تراکنش‌های اخیر</h4>
                            <div id="transactionsList">در حال بارگذاری...</div>
                        </div>
                    </div>
                    
                    <form id="walletForm" onsubmit="updateWallet(event, '${passengerId}')">
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">عملیات</label>
                                <select class="form-control" id="walletOperation" required>
                                    <option value="add">افزایش اعتبار</option>
                                    <option value="subtract">کسر اعتبار</option>
                                    <option value="set">تنظیم مقدار</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label class="form-label">مبلغ (افغانی)</label>
                                <input type="number" class="form-control" id="walletAmount" required min="0">
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">توضیحات</label>
                            <textarea class="form-control" id="walletDescription" rows="2" required></textarea>
                        </div>
                        
                        <div class="form-modal-footer">
                            <button type="submit" class="btn btn-primary">انجام عملیات</button>
                            <button type="button" class="btn btn-secondary" onclick="closeModal()">لغو</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    loadWalletInfo(passengerId);
}

async function loadWalletInfo(passengerId) {
    try {
        // دریافت اطلاعات مسافر
        const { data: passenger, error } = await supabase
            .from('passengers')
            .select('name, phone, wallet_balance')
            .eq('id', passengerId)
            .single();
        
        if (!error) {
            document.querySelector('.wallet-balance').innerHTML = `
                ${passenger.name}<br>
                <small>${passenger.phone}</small><br>
                <span style="color: ${COLORS.success}">
                    ${(passenger.wallet_balance || 0).toLocaleString('fa-IR')} افغانی
                </span>
            `;
        }
        
        // دریافت تراکنش‌ها
        const { data: transactions } = await supabase
            .from('wallet_transactions')
            .select('*')
            .eq('passenger_id', passengerId)
            .order('created_at', { ascending: false })
            .limit(10);
        
        if (transactions) {
            let transactionsHTML = '<table style="width: 100%; font-size: 12px;">';
            transactions.forEach(transaction => {
                const amountClass = transaction.amount > 0 ? 'text-success' : 'text-danger';
                transactionsHTML += `
                    <tr>
                        <td>${new Date(transaction.created_at).toLocaleString('fa-IR')}</td>
                        <td><span class="${amountClass}">${transaction.amount > 0 ? '+' : ''}${transaction.amount}</span></td>
                        <td>${transaction.description}</td>
                        <td>${transaction.admin_name || 'سیستم'}</td>
                    </tr>
                `;
            });
            transactionsHTML += '</table>';
            document.getElementById('transactionsList').innerHTML = transactionsHTML;
        }
        
    } catch (error) {
        console.error('Error loading wallet info:', error);
    }
}

// ==================== مدیریت رانندگان ====================

async function loadDrivers() {
    try {
        const { data, error } = await supabase
            .from('drivers')
            .select(`
                *,
                cities (name),
                representatives (name)
            `)
            .order('created_at', { ascending: false })
            .limit(50);
        
        const content = document.getElementById('dynamicContent');
        
        let html = `
            <div class="filter-bar">
                <button class="btn btn-primary" onclick="showDriverForm()">
                    <i class="fas fa-plus"></i> ثبت راننده جدید
                </button>
                <input type="text" class="form-control" placeholder="جستجوی نام یا شماره..." 
                       onkeyup="filterDrivers(this.value)">
                <select class="form-control" onchange="filterDriversByCity(this.value)">
                    <option value="">همه شهرها</option>
                    ${cities.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
                </select>
                <select class="form-control" onchange="filterDriversByStatus(this.value)">
                    <option value="">همه وضعیت‌ها</option>
                    <option value="active">فعال</option>
                    <option value="inactive">غیرفعال</option>
                    <option value="blocked">مسدود</option>
                </select>
            </div>
            
            <div class="recent-table">
                <table class="data-table" id="driversTable">
                    <thead>
                        <tr>
                            <th>راننده</th>
                            <th>اطلاعات تماس</th>
                            <th>وسیله نقلیه</th>
                            <th>شهر</th>
                            <th>امتیاز</th>
                            <th>وضعیت</th>
                            <th>آخرین لوکیشن</th>
                            <th>عملیات</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        data.forEach(driver => {
            const statusColor = driver.is_active ? 
                (driver.is_online ? 'status-active' : 'status-inactive') : 
                'status-inactive';
            
            const statusText = driver.is_active ? 
                (driver.is_online ? 'آنلاین' : 'آفلاین') : 
                'غیرفعال';
            
            html += `
                <tr>
                    <td>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <div style="width: 40px; height: 40px; background: #e5e7eb; border-radius: 50%; 
                                 display: flex; align-items: center; justify-content: center;">
                                <i class="fas fa-user"></i>
                            </div>
                            <div>
                                <strong>${driver.name}</strong><br>
                                <small>${driver.representatives?.name || 'بدون نماینده'}</small>
                            </div>
                        </div>
                    </td>
                    <td>
                        ${driver.phone}<br>
                        <small>${driver.email || '-'}</small>
                    </td>
                    <td>
                        ${driver.vehicle_model || '-'}<br>
                        <small>${driver.vehicle_plate || 'بدون پلاک'}</small>
                    </td>
                    <td>${driver.cities?.name || '-'}</td>
                    <td>
                        <div style="display: flex; align-items: center; gap: 5px;">
                            <span style="color: ${COLORS.warning}">
                                <i class="fas fa-star"></i> ${driver.rating || 'جدید'}
                            </span>
                            <br>
                            <small>${driver.trip_count || 0} سفر</small>
                        </div>
                    </td>
                    <td>
                        <span class="status-badge ${statusColor}">
                            ${statusText}
                        </span>
                    </td>
                    <td>
                        <small>
                            ${driver.last_location_update ? 
                             new Date(driver.last_location_update).toLocaleTimeString('fa-IR') : 
                             'نامشخص'}
                        </small>
                    </td>
                    <td>
                        <div class="action-buttons">
                            <button class="btn btn-sm btn-primary" onclick="editDriver('${driver.id}')">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn btn-sm btn-info" onclick="viewDriverDetails('${driver.id}')">
                                <i class="fas fa-info-circle"></i>
                            </button>
                            <button class="btn btn-sm btn-warning" onclick="sendMessageToDriver('${driver.id}')">
                                <i class="fas fa-comment"></i>
                            </button>
                            <button class="btn btn-sm btn-danger" onclick="blockDriver('${driver.id}', ${driver.is_active})">
                                <i class="fas fa-ban"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });
        
        html += `
                    </tbody>
                </table>
            </div>
        `;
        
        content.innerHTML = html;
        
    } catch (error) {
        console.error('Error loading drivers:', error);
    }
}

function viewDriverDetails(driverId) {
    const modalHTML = `
        <div class="form-modal active" id="driverDetailsModal">
            <div class="form-modal-content">
                <div class="form-modal-header">
                    <h3>جزئیات راننده</h3>
                    <button class="btn btn-secondary" onclick="closeModal()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="form-modal-body">
                    <div id="driverDetailsContent" style="text-align: center;">
                        <div class="spinner"></div>
                        <p>در حال بارگذاری...</p>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    loadDriverDetails(driverId);
}

async function loadDriverDetails(driverId) {
    try {
        const { data: driver, error } = await supabase
            .from('drivers')
            .select(`
                *,
                cities (name),
                representatives (name),
                documents:driver_documents(*)
            `)
            .eq('id', driverId)
            .single();
        
        if (error) throw error;
        
        // دریافت سفرهای اخیر
        const { data: recentTrips } = await supabase
            .from('trips')
            .select('*')
            .eq('driver_id', driverId)
            .order('created_at', { ascending: false })
            .limit(5);
        
        // دریافت تراکنش‌های مالی
        const { data: transactions } = await supabase
            .from('driver_transactions')
            .select('*')
            .eq('driver_id', driverId)
            .order('created_at', { ascending: false })
            .limit(10);
        
        let documentsHTML = '';
        if (driver.documents && driver.documents.length > 0) {
            documentsHTML = '<h4>مدارک:</h4><ul>';
            driver.documents.forEach(doc => {
                documentsHTML += `
                    <li>
                        ${doc.document_type}: 
                        <span class="status-badge ${doc.status === 'verified' ? 'status-active' : 'status-inactive'}">
                            ${doc.status === 'verified' ? 'تایید شده' : 'در انتظار'}
                        </span>
                        ${doc.file_url ? 
                         `<a href="${doc.file_url}" target="_blank">مشاهده</a>` : 
                         ''}
                    </li>
                `;
            });
            documentsHTML += '</ul>';
        }
        
        let tripsHTML = '';
        if (recentTrips && recentTrips.length > 0) {
            tripsHTML = '<h4>آخرین سفرها:</h4><table style="width: 100%; font-size: 12px;">';
            recentTrips.forEach(trip => {
                tripsHTML += `
                    <tr>
                        <td>${new Date(trip.created_at).toLocaleDateString('fa-IR')}</td>
                        <td>${trip.pickup_address?.substring(0, 20)}...</td>
                        <td>${trip.destination_address?.substring(0, 20)}...</td>
                        <td>${trip.fare} افغانی</td>
                        <td>
                            <span class="status-badge ${trip.status === 'completed' ? 'status-active' : 'status-inactive'}">
                                ${trip.status}
                            </span>
                        </td>
                    </tr>
                `;
            });
            tripsHTML += '</table>';
        }
        
        const content = `
            <div style="text-align: right;">
                <div style="display: flex; align-items: center; gap: 20px; margin-bottom: 20px;">
                    <div style="flex: 1;">
                        <h3>${driver.name}</h3>
                        <p>${driver.phone} | ${driver.email || 'بدون ایمیل'}</p>
                        <p>شهر: ${driver.cities?.name || 'نامشخص'}</p>
                        <p>نماینده: ${driver.representatives?.name || 'بدون نماینده'}</p>
                    </div>
                    <div style="width: 100px; height: 100px; background: #e5e7eb; border-radius: 50%; 
                         display: flex; align-items: center; justify-content: center; font-size: 40px;">
                        <i class="fas fa-user"></i>
                    </div>
                </div>
                
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin-bottom: 20px;">
                    <div class="dashboard-card">
                        <h3>امتیاز</h3>
                        <div class="value">${driver.rating || 'جدید'}</div>
                    </div>
                    <div class="dashboard-card">
                        <h3>تعداد سفرها</h3>
                        <div class="value">${driver.trip_count || 0}</div>
                    </div>
                    <div class="dashboard-card">
                        <h3>درآمد امروز</h3>
                        <div class="value">${driver.today_earnings || 0} افغانی</div>
                    </div>
                    <div class="dashboard-card">
                        <h3>ساعت آنلاین</h3>
                        <div class="value">${driver.online_hours_today || 0} ساعت</div>
                    </div>
                </div>
                
                ${documentsHTML}
                ${tripsHTML}
                
                <div class="form-modal-footer" style="margin-top: 20px;">
                    <button class="btn btn-primary" onclick="sendSMS('${driver.phone}')">
                        <i class="fas fa-sms"></i> ارسال پیامک
                    </button>
                    <button class="btn btn-warning" onclick="manageDriverDocuments('${driver.id}')">
                        <i class="fas fa-file-alt"></i> مدیریت مدارک
                    </button>
                    <button class="btn btn-danger" onclick="blockDriver('${driver.id}', ${driver.is_active})">
                        <i class="fas fa-ban"></i> ${driver.is_active ? 'مسدود کردن' : 'آزاد کردن'}
                    </button>
                </div>
            </div>
        `;
        
        document.getElementById('driverDetailsContent').innerHTML = content;
        
    } catch (error) {
        console.error('Error loading driver details:', error);
        document.getElementById('driverDetailsContent').innerHTML = 
            '<p class="error">خطا در بارگذاری اطلاعات راننده</p>';
    }
}

// ==================== گزارشات ====================

async function loadReports() {
    const content = document.getElementById('dynamicContent');
    
    let html = `
        <div class="filter-bar">
            <div class="date-range">
                <label>از تاریخ:</label>
                <input type="date" class="form-control" id="reportFromDate">
                <label>تا تاریخ:</label>
                <input type="date" class="form-control" id="reportToDate" value="${new Date().toISOString().split('T')[0]}">
                <select class="form-control" id="reportType">
                    <option value="financial">گزارش مالی</option>
                    <option value="trips">گزارش سفرها</option>
                    <option value="drivers">گزارش رانندگان</option>
                    <option value="passengers">گزارش مسافران</option>
                </select>
                <button class="btn btn-primary" onclick="generateReport()">
                    <i class="fas fa-chart-bar"></i> تولید گزارش
                </button>
                <button class="btn btn-success" onclick="exportReportToExcel()">
                    <i class="fas fa-file-excel"></i> خروجی اکسل
                </button>
            </div>
        </div>
        
        <div id="reportResults">
            <div style="text-align: center; padding: 50px; color: ${COLORS.gray};">
                <i class="fas fa-chart-line fa-3x"></i>
                <h3>گزارشی انتخاب نشده است</h3>
                <p>برای مشاهده گزارش، پارامترهای مورد نظر را انتخاب کرده و دکمه "تولید گزارش" را بزنید.</p>
            </div>
        </div>
    `;
    
    content.innerHTML = html;
}

async function generateReport() {
    const fromDate = document.getElementById('reportFromDate').value;
    const toDate = document.getElementById('reportToDate').value;
    const reportType = document.getElementById('reportType').value;
    
    if (!fromDate || !toDate) {
        alert('لطفاً بازه تاریخ را انتخاب کنید');
        return;
    }
    
    const resultsDiv = document.getElementById('reportResults');
    resultsDiv.innerHTML = '<div class="spinner"></div><p>در حال تولید گزارش...</p>';
    
    try {
        let reportData;
        
        switch(reportType) {
            case 'financial':
                reportData = await generateFinancialReport(fromDate, toDate);
                break;
            case 'trips':
                reportData = await generateTripsReport(fromDate, toDate);
                break;
            case 'drivers':
                reportData = await generateDriversReport(fromDate, toDate);
                break;
            case 'passengers':
                reportData = await generatePassengersReport(fromDate, toDate);
                break;
            default:
                reportData = { error: 'نوع گزارش نامعتبر' };
        }
        
        displayReportResults(reportData, reportType);
        
    } catch (error) {
        console.error('Error generating report:', error);
        resultsDiv.innerHTML = '<p class="error">خطا در تولید گزارش</p>';
    }
}

async function generateFinancialReport(fromDate, toDate) {
    try {
        const from = new Date(fromDate);
        const to = new Date(toDate);
        to.setDate(to.getDate() + 1); // شامل خود تاریخ بشود
        
        // دریافت اطلاعات مالی
        const [tripsResult, transactionsResult, refundsResult] = await Promise.all([
            supabase
                .from('trips')
                .select('fare, discount, commission, status')
                .eq('status', 'completed')
                .gte('created_at', from.toISOString())
                .lt('created_at', to.toISOString()),
            
            supabase
                .from('wallet_transactions')
                .select('amount, type')
                .gte('created_at', from.toISOString())
                .lt('created_at', to.toISOString()),
            
            supabase
                .from('refunds')
                .select('amount')
                .eq('status', 'completed')
                .gte('created_at', from.toISOString())
                .lt('created_at', to.toISOString())
        ]);
        
        const trips = tripsResult.data || [];
        const transactions = transactionsResult.data || [];
        const refunds = refundsResult.data || [];
        
        // محاسبات
        const totalRevenue = trips.reduce((sum, trip) => sum + (trip.fare || 0), 0);
        const totalDiscounts = trips.reduce((sum, trip) => sum + (trip.discount || 0), 0);
        const totalCommissions = trips.reduce((sum, trip) => sum + (trip.commission || 0), 0);
        const netRevenue = totalRevenue - totalCommissions;
        
        const walletDeposits = transactions
            .filter(t => t.type === 'deposit')
            .reduce((sum, t) => sum + (t.amount || 0), 0);
        
        const walletWithdrawals = Math.abs(transactions
            .filter(t => t.type === 'withdrawal')
            .reduce((sum, t) => sum + (t.amount || 0), 0));
        
        const totalRefunds = refunds.reduce((sum, refund) => sum + (refund.amount || 0), 0);
        
        return {
            period: `${fromDate} تا ${toDate}`,
            summary: {
                total_revenue: totalRevenue,
                total_discounts: totalDiscounts,
                total_commissions: totalCommissions,
                net_revenue: netRevenue,
                wallet_deposits: walletDeposits,
                wallet_withdrawals: walletWithdrawals,
                total_refunds: totalRefunds,
                net_profit: netRevenue - totalRefunds
            },
            trips_count: trips.length,
            daily_breakdown: await getDailyBreakdown(fromDate, toDate)
        };
        
    } catch (error) {
        console.error('Error generating financial report:', error);
        throw error;
    }
}

async function getDailyBreakdown(fromDate, toDate) {
    try {
        const { data, error } = await supabase
            .from('trips')
            .select('fare, created_at')
            .eq('status', 'completed')
            .gte('created_at', fromDate)
            .lt('created_at', toDate)
            .order('created_at');
        
        if (error) return [];
        
        const breakdown = {};
        data.forEach(trip => {
            const date = trip.created_at.split('T')[0];
            if (!breakdown[date]) {
                breakdown[date] = { revenue: 0, trips: 0 };
            }
            breakdown[date].revenue += trip.fare || 0;
            breakdown[date].trips += 1;
        });
        
        return breakdown;
    } catch (error) {
        return [];
    }
}

function displayReportResults(data, reportType) {
    const resultsDiv = document.getElementById('reportResults');
    
    if (data.error) {
        resultsDiv.innerHTML = `<p class="error">${data.error}</p>`;
        return;
    }
    
    let html = `
        <div class="report-header">
            <h3>گزارش ${getReportTypeText(reportType)}</h3>
            <p>بازه زمانی: ${data.period}</p>
        </div>
    `;
    
    switch(reportType) {
        case 'financial':
            html += displayFinancialReport(data);
            break;
        case 'trips':
            html += displayTripsReport(data);
            break;
        case 'drivers':
            html += displayDriversReport(data);
            break;
        case 'passengers':
            html += displayPassengersReport(data);
            break;
    }
    
    resultsDiv.innerHTML = html;
}

function displayFinancialReport(data) {
    const summary = data.summary;
    
    return `
        <div class="dashboard-cards" style="margin-top: 20px;">
            <div class="dashboard-card">
                <h3>درآمد کل</h3>
                <div class="value">${summary.total_revenue.toLocaleString('fa-IR')} افغانی</div>
            </div>
            <div class="dashboard-card">
                <h3>تخفیف‌ها</h3>
                <div class="value">${summary.total_discounts.toLocaleString('fa-IR')} افغانی</div>
            </div>
            <div class="dashboard-card">
                <h3>کمیسیون‌ها</h3>
                <div class="value">${summary.total_commissions.toLocaleString('fa-IR')} افغانی</div>
            </div>
            <div class="dashboard-card">
                <h3>درآمد خالص</h3>
                <div class="value">${summary.net_revenue.toLocaleString('fa-IR')} افغانی</div>
            </div>
        </div>
        
        <div class="recent-table" style="margin-top: 20px;">
            <h3>جزئیات روزانه</h3>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>تاریخ</th>
                        <th>تعداد سفر</th>
                        <th>درآمد</th>
                        <th>میانگین هر سفر</th>
                    </tr>
                </thead>
                <tbody>
                    ${Object.entries(data.daily_breakdown).map(([date, stats]) => `
                        <tr>
                            <td>${date}</td>
                            <td>${stats.trips}</td>
                            <td>${stats.revenue.toLocaleString('fa-IR')} افغانی</td>
                            <td>${stats.trips > 0 ? (stats.revenue / stats.trips).toLocaleString('fa-IR') : 0} افغانی</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        
        <div style="margin-top: 20px; padding: 20px; background: white; border-radius: 10px;">
            <h4>خلاصه مالی</h4>
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px;">
                <div><strong>سود خالص:</strong> ${summary.net_profit.toLocaleString('fa-IR')} افغانی</div>
                <div><strong>واریزی کیف پول:</strong> ${summary.wallet_deposits.toLocaleString('fa-IR')} افغانی</div>
                <div><strong>برداشت کیف پول:</strong> ${summary.wallet_withdrawals.toLocaleString('fa-IR')} افغانی</div>
                <div><strong>عودت وجه:</strong> ${summary.total_refunds.toLocaleString('fa-IR')} افغانی</div>
            </div>
        </div>
    `;
}

function getReportTypeText(type) {
    const types = {
        'financial': 'مالی',
        'trips': 'سفرها',
        'drivers': 'رانندگان',
        'passengers': 'مسافران'
    };
    return types[type] || type;
}

// ==================== سیستم پشتیبانی ====================

class SupportSystem {
    constructor() {
        this.tickets = [];
    }
    
    async createTicket(userId, userType, subject, description, priority = 'medium') {
        try {
            const ticketData = {
                user_id: userId,
                user_type: userType,
                subject: subject,
                description: description,
                priority: priority,
                status: 'open',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
            
            const { data: ticket, error } = await supabase
                .from('support_tickets')
                .insert([ticketData])
                .select()
                .single();
            
            if (error) throw error;
            
            // ارسال ایمیل به پشتیبانی
            await this.sendSupportNotification(ticket);
            
            // ارسال نوتیفیکیشن درون‌برنامه‌ای
            await this.sendInAppNotification(ticket);
            
            return ticket;
            
        } catch (error) {
            console.error('Error creating ticket:', error);
            throw error;
        }
    }
    
    async sendSupportNotification(ticket) {
        // اینجا ایمیل به تیم پشتیبانی ارسال می‌شود
        const emailData = {
            to: 'support@snap.af',
            subject: `تیکت جدید: ${ticket.subject}`,
            body: `
                تیکت جدید ایجاد شد:
                - کاربر: ${ticket.user_id}
                - نوع: ${ticket.user_type}
                - اولویت: ${ticket.priority}
                - موضوع: ${ticket.subject}
                - توضیحات: ${ticket.description}
                
                برای مشاهده و پاسخ به تیکت، به پنل مدیریت مراجعه کنید.
            `
        };
        
        console.log('Sending support email:', emailData);
        // در حالت واقعی:
        // await fetch('EMAIL_API_URL', { method: 'POST', body: JSON.stringify(emailData) });
    }
    
    async sendInAppNotification(ticket) {
        // ارسال نوتیفیکیشن به ادمین‌ها
        const { data: admins, error } = await supabase
            .from('profiles')
            .select('id')
            .eq('role', 'admin')
            .eq('is_active', true);
        
        if (!error && admins) {
            admins.forEach(async admin => {
                await supabase
                    .from('notifications')
                    .insert([{
                        user_id: admin.id,
                        title: 'تیکت جدید',
                        message: `تیکت جدید با اولویت ${ticket.priority} ایجاد شد`,
                        type: 'support',
                        data: JSON.stringify({ ticket_id: ticket.id }),
                        created_at: new Date().toISOString()
                    }]);
            });
        }
    }
    
    async addReply(ticketId, userId, userType, message, isInternal = false) {
        try {
            const replyData = {
                ticket_id: ticketId,
                user_id: userId,
                user_type: userType,
                message: message,
                is_internal: isInternal,
                created_at: new Date().toISOString()
            };
            
            const { data: reply, error } = await supabase
                .from('ticket_replies')
                .insert([replyData])
                .select()
                .single();
            
            if (error) throw error;
            
            // به‌روزرسانی تیکت
            await supabase
                .from('support_tickets')
                .update({
                    status: isInternal ? ticket.status : 'waiting_for_user',
                    updated_at: new Date().toISOString(),
                    last_reply_at: new Date().toISOString(),
                    last_reply_by: userId
                })
                .eq('id', ticketId);
            
            // ارسال ایمیل به کاربر (اگر پاسخ عمومی باشد)
            if (!isInternal) {
                await this.sendReplyNotification(ticketId, userId, message);
            }
            
            return reply;
            
        } catch (error) {
            console.error('Error adding reply:', error);
            throw error;
        }
    }
    
    async getTicketWithReplies(ticketId) {
        try {
            const { data: ticket, error: ticketError } = await supabase
                .from('support_tickets')
                .select('*')
                .eq('id', ticketId)
                .single();
            
            if (ticketError) throw ticketError;
            
            const { data: replies, error: repliesError } = await supabase
                .from('ticket_replies')
                .select('*')
                .eq('ticket_id', ticketId)
                .order('created_at', { ascending: true });
            
            if (repliesError) throw repliesError;
            
            // دریافت اطلاعات کاربران
            const userIds = [
                ticket.user_id,
                ...replies.map(reply => reply.user_id)
            ].filter((v, i, a) => a.indexOf(v) === i);
            
            const users = await this.getUsersInfo(userIds);
            
            return {
                ticket: ticket,
                replies: replies.map(reply => ({
                    ...reply,
                    user_info: users.find(u => u.id === reply.user_id)
                })),
                user_info: users.find(u => u.id === ticket.user_id)
            };
            
        } catch (error) {
            console.error('Error getting ticket:', error);
            throw error;
        }
    }
    
    async getUsersInfo(userIds) {
        try {
            // دریافت اطلاعات از جدول profiles
            const { data: profiles, error } = await supabase
                .from('profiles')
                .select('id, name, email, phone, role')
                .in('id', userIds);
            
            if (error) return [];
            
            // اگر کاربری در profiles نبود، از جدول passengers یا drivers دریافت کن
            const missingIds = userIds.filter(id => !profiles.find(p => p.id === id));
            
            let additionalUsers = [];
            if (missingIds.length > 0) {
                const [passengers, drivers] = await Promise.all([
                    supabase
                        .from('passengers')
                        .select('id, name, phone')
                        .in('id', missingIds),
                    supabase
                        .from('drivers')
                        .select('id, name, phone')
                        .in('id', missingIds)
                ]);
                
                if (passengers.data) {
                    additionalUsers = additionalUsers.concat(
                        passengers.data.map(p => ({
                            id: p.id,
                            name: p.name,
                            phone: p.phone,
                            role: 'passenger'
                        }))
                    );
                }
                
                if (drivers.data) {
                    additionalUsers = additionalUsers.concat(
                        drivers.data.map(d => ({
                            id: d.id,
                            name: d.name,
                            phone: d.phone,
                            role: 'driver'
                        }))
                    );
                }
            }
            
            return [...profiles, ...additionalUsers];
            
        } catch (error) {
            console.error('Error getting users info:', error);
            return [];
        }
    }
    
    async sendReplyNotification(ticketId, userId, message) {
        // دریافت اطلاعات تیکت
        const { data: ticket, error } = await supabase
            .from('support_tickets')
            .select('user_id, user_type, subject')
            .eq('id', ticketId)
            .single();
        
        if (error) return;
        
        // ارسال ایمیل به کاربر
        const userInfo = await this.getUserContactInfo(ticket.user_id, ticket.user_type);
        
        if (userInfo.email) {
            const emailData = {
                to: userInfo.email,
                subject: `پاسخ به تیکت: ${ticket.subject}`,
                body: `
                    سلام ${userInfo.name},
                    
                    پاسخ جدید به تیکت شما دریافت شد:
                    
                    ${message}
                    
                    برای مشاهده کامل مکالمات، به پنل کاربری خود مراجعه کنید.
                    
                    با احترام،
                    تیم پشتیبانی اسنپ
                `
            };
            
            console.log('Sending reply email:', emailData);
            // ارسال ایمیل واقعی
        }
        
        if (userInfo.phone) {
            const smsMessage = `پاسخ جدید به تیکت شما دریافت شد. موضوع: ${ticket.subject}`;
            console.log(`Sending SMS to ${userInfo.phone}: ${smsMessage}`);
            // ارسال پیامک واقعی
        }
    }
    
    async getUserContactInfo(userId, userType) {
        try {
            if (userType === 'passenger') {
                const { data, error } = await supabase
                    .from('passengers')
                    .select('name, email, phone')
                    .eq('id', userId)
                    .single();
                
                if (!error) return data;
            } else if (userType === 'driver') {
                const { data, error } = await supabase
                    .from('drivers')
                    .select('name, email, phone')
                    .eq('id', userId)
                    .single();
                
                if (!error) return data;
            }
            
            // تلاش برای یافتن در profiles
            const { data, error } = await supabase
                .from('profiles')
                .select('name, email, phone')
                .eq('id', userId)
                .single();
            
            if (!error) return data;
            
            return { name: 'کاربر', email: null, phone: null };
            
        } catch (error) {
            return { name: 'کاربر', email: null, phone: null };
        }
    }
    
    async getTickets(status = null, priority = null, userType = null) {
        try {
            let query = supabase
                .from('support_tickets')
                .select('*')
                .order('created_at', { ascending: false });
            
            if (status) {
                query = query.eq('status', status);
            }
            
            if (priority) {
                query = query.eq('priority', priority);
            }
            
            if (userType) {
                query = query.eq('user_type', userType);
            }
            
            const { data, error } = await query;
            
            if (error) throw error;
            
            // اضافه کردن اطلاعات کاربران
            const ticketsWithUsers = await Promise.all(
                data.map(async ticket => {
                    const userInfo = await this.getUserContactInfo(ticket.user_id, ticket.user_type);
                    return {
                        ...ticket,
                        user_name: userInfo.name,
                        user_phone: userInfo.phone
                    };
                })
            );
            
            return ticketsWithUsers;
            
        } catch (error) {
            console.error('Error getting tickets:', error);
            throw error;
        }
    }
    
    async updateTicketStatus(ticketId, status, adminId) {
        try {
            const updates = {
                status: status,
                updated_at: new Date().toISOString(),
                handled_by: adminId,
                handled_at: status === 'closed' ? new Date().toISOString() : null
            };
            
            const { data, error } = await supabase
                .from('support_tickets')
                .update(updates)
                .eq('id', ticketId)
                .select()
                .single();
            
            if (error) throw error;
            
            // ارسال نوتیفیکیشن به کاربر
            await this.sendStatusUpdateNotification(ticketId, status);
            
            return data;
            
        } catch (error) {
            console.error('Error updating ticket status:', error);
            throw error;
        }
    }
    
    async sendStatusUpdateNotification(ticketId, status) {
        const statusTexts = {
            'open': 'باز',
            'in_progress': 'در حال بررسی',
            'waiting_for_user': 'در انتظار کاربر',
            'closed': 'بسته'
        };
        
        const { data: ticket } = await supabase
            .from('support_tickets')
            .select('user_id, user_type, subject')
            .eq('id', ticketId)
            .single();
        
        if (!ticket) return;
        
        const userInfo = await this.getUserContactInfo(ticket.user_id, ticket.user_type);
        
        if (userInfo.email) {
            const emailData = {
                to: userInfo.email,
                subject: `به‌روزرسانی وضعیت تیکت: ${ticket.subject}`,
                body: `
                    سلام ${userInfo.name},
                    
                    وضعیت تیکت شما به "${statusTexts[status] || status}" تغییر یافت.
                    
                    موضوع: ${ticket.subject}
                    وضعیت جدید: ${statusTexts[status] || status}
                    
                    برای مشاهده جزئیات، به پنل کاربری خود مراجعه کنید.
                    
                    با احترام،
                    تیم پشتیبانی اسنپ
                `
            };
            
            console.log('Sending status update email:', emailData);
        }
    }
}

// ==================== سیستم امتیازدهی ====================

class RatingSystem {
    constructor() {
        this.maxRating = 5;
        this.minRating = 1;
    }
    
    async submitRating(tripId, ratedBy, ratedUser, rating, comment = '', tags = []) {
        try {
            // اعتبارسنجی امتیاز
            if (rating < this.minRating || rating > this.maxRating) {
                throw new Error(`امتیاز باید بین ${this.minRating} تا ${this.maxRating} باشد`);
            }
            
            const ratingData = {
                trip_id: tripId,
                rated_by: ratedBy,
                rated_by_type: this.getUserType(ratedBy),
                rated_user: ratedUser,
                rated_user_type: this.getUserType(ratedUser),
                rating: rating,
                comment: comment,
                tags: JSON.stringify(tags),
                created_at: new Date().toISOString()
            };
            
            const { data: ratingRecord, error } = await supabase
                .from('ratings')
                .insert([ratingData])
                .select()
                .single();
            
            if (error) throw error;
            
            // به‌روزرسانی میانگین امتیاز کاربر
            await this.updateUserAverageRating(ratedUser);
            
            return ratingRecord;
            
        } catch (error) {
            console.error('Error submitting rating:', error);
            throw error;
        }
    }
    
    async updateUserAverageRating(userId) {
        try {
            const { data: ratings, error } = await supabase
                .from('ratings')
                .select('rating')
                .eq('rated_user', userId);
            
            if (error) throw error;
            
            if (ratings.length === 0) return;
            
            const average = ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length;
            
            // تشخیص نوع کاربر
            const userType = await this.detectUserType(userId);
            
            if (userType === 'driver') {
                await supabase
                    .from('drivers')
                    .update({ rating: Math.round(average * 10) / 10 })
                    .eq('id', userId);
            } else if (userType === 'passenger') {
                await supabase
                    .from('passengers')
                    .update({ rating: Math.round(average * 10) / 10 })
                    .eq('id', userId);
            }
            
        } catch (error) {
            console.error('Error updating average rating:', error);
        }
    }
    
    async detectUserType(userId) {
        try {
            // بررسی در رانندگان
            const { data: driver, error: driverError } = await supabase
                .from('drivers')
                .select('id')
                .eq('id', userId)
                .single();
            
            if (!driverError && driver) return 'driver';
            
            // بررسی در مسافران
            const { data: passenger, error: passengerError } = await supabase
                .from('passengers')
                .select('id')
                .eq('id', userId)
                .single();
            
            if (!passengerError && passenger) return 'passenger';
            
            // بررسی در profiles
            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', userId)
                .single();
            
            if (!profileError && profile) {
                return profile.role === 'driver' ? 'driver' : 'passenger';
            }
            
            return 'unknown';
            
        } catch (error) {
            return 'unknown';
        }
    }
    
    getUserType(userId) {
        // این تابع باید بر اساس ساختار سیستم شما پیاده‌سازی شود
        return 'user';
    }
    
    async getUserRatings(userId, limit = 20) {
        try {
            const { data: ratings, error } = await supabase
                .from('ratings')
                .select(`
                    *,
                    rated_by_user:profiles!rated_by(name),
                    trip:trips(pickup_address, destination_address)
                `)
                .eq('rated_user', userId)
                .order('created_at', { ascending: false })
                .limit(limit);
            
            if (error) throw error;
            
            return ratings || [];
            
        } catch (error) {
            console.error('Error getting user ratings:', error);
            return [];
        }
    }
    
    async getRatingSummary(userId) {
        try {
            const { data: ratings, error } = await supabase
                .from('ratings')
                .select('rating, tags, comment')
                .eq('rated_user', userId);
            
            if (error) throw error;
            
            if (ratings.length === 0) {
                return {
                    average: 0,
                    count: 0,
                    distribution: {},
                    common_tags: []
                };
            }
            
            // محاسبه میانگین
            const average = ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length;
            
            // توزیع امتیازها
            const distribution = {};
            for (let i = 1; i <= 5; i++) {
                distribution[i] = ratings.filter(r => Math.round(r.rating) === i).length;
            }
            
            // برچسب‌های پرتکرار
            const tagCounts = {};
            ratings.forEach(rating => {
                if (rating.tags) {
                    const tags = JSON.parse(rating.tags);
                    tags.forEach(tag => {
                        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
                    });
                }
            });
            
            const commonTags = Object.entries(tagCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([tag, count]) => ({ tag, count }));
            
            return {
                average: Math.round(average * 10) / 10,
                count: ratings.length,
                distribution: distribution,
                common_tags: commonTags,
                last_ratings: ratings.slice(0, 5)
            };
            
        } catch (error) {
            console.error('Error getting rating summary:', error);
            throw error;
        }
    }
}

// ==================== سیستم نوتیفیکیشن ====================

class NotificationSystem {
    constructor() {
        this.notifications = [];
    }
    
    async sendNotification(userId, title, message, type = 'info', data = {}) {
        try {
            const notificationData = {
                user_id: userId,
                title: title,
                message: message,
                type: type,
                data: JSON.stringify(data),
                is_read: false,
                created_at: new Date().toISOString()
            };
            
            const { data: notification, error } = await supabase
                .from('notifications')
                .insert([notificationData])
                .select()
                .single();
            
            if (error) throw error;
            
            // ارسال نوتیفیکیشن فوری (در صورت پشتیبانی مرورگر)
            if ('Notification' in window && Notification.permission === 'granted') {
                this.sendBrowserNotification(title, message);
            }
            
            return notification;
            
        } catch (error) {
            console.error('Error sending notification:', error);
            throw error;
        }
    }
    
    sendBrowserNotification(title, message) {
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(title, {
                body: message,
                icon: '/icon.png',
                badge: '/badge.png'
            });
        }
    }
    
    async getUserNotifications(userId, unreadOnly = false, limit = 50) {
        try {
            let query = supabase
                .from('notifications')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false });
            
            if (unreadOnly) {
                query = query.eq('is_read', false);
            }
            
            if (limit) {
                query = query.limit(limit);
            }
            
            const { data, error } = await query;
            
            if (error) throw error;
            
            return data || [];
            
        } catch (error) {
            console.error('Error getting notifications:', error);
            return [];
        }
    }
    
    async markAsRead(notificationId) {
        try {
            const { error } = await supabase
                .from('notifications')
                .update({ is_read: true, read_at: new Date().toISOString() })
                .eq('id', notificationId);
            
            if (error) throw error;
            
            return true;
            
        } catch (error) {
            console.error('Error marking notification as read:', error);
            return false;
        }
    }
    
    async markAllAsRead(userId) {
        try {
            const { error } = await supabase
                .from('notifications')
                .update({ is_read: true, read_at: new Date().toISOString() })
                .eq('user_id', userId)
                .eq('is_read', false);
            
            if (error) throw error;
            
            return true;
            
        } catch (error) {
            console.error('Error marking all notifications as read:', error);
            return false;
        }
    }
    
    async getNotificationCount(userId) {
        try {
            const { count, error } = await supabase
                .from('notifications')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', userId)
                .eq('is_read', false);
            
            if (error) throw error;
            
            return count || 0;
            
        } catch (error) {
            console.error('Error getting notification count:', error);
            return 0;
        }
    }
    
    async sendBulkNotification(userIds, title, message, type = 'info', data = {}) {
        try {
            const notifications = userIds.map(userId => ({
                user_id: userId,
                title: title,
                message: message,
                type: type,
                data: JSON.stringify(data),
                is_read: false,
                created_at: new Date().toISOString()
            }));
            
            const { data: results, error } = await supabase
                .from('notifications')
                .insert(notifications)
                .select();
            
            if (error) throw error;
            
            return results;
            
        } catch (error) {
            console.error('Error sending bulk notifications:', error);
            throw error;
        }
    }
}

// ==================== سیستم شارژ حساب مجازی ====================

class WalletSystem {
    constructor() {
        this.transactionTypes = {
            DEPOSIT: 'deposit',
            WITHDRAWAL: 'withdrawal',
            PAYMENT: 'payment',
            REFUND: 'refund',
            BONUS: 'bonus',
            PENALTY: 'penalty'
        };
    }
    
    async getBalance(userId, userType) {
        try {
            let tableName;
            let idField;
            
            if (userType === 'passenger') {
                tableName = 'passengers';
                idField = 'id';
            } else if (userType === 'driver') {
                tableName = 'drivers';
                idField = 'id';
            } else {
                throw new Error('نوع کاربر نامعتبر است');
            }
            
            const { data, error } = await supabase
                .from(tableName)
                .select('wallet_balance')
                .eq(idField, userId)
                .single();
            
            if (error) throw error;
            
            return data.wallet_balance || 0;
            
        } catch (error) {
            console.error('Error getting balance:', error);
            throw error;
        }
    }
    
    async addTransaction(userId, userType, amount, type, description, referenceId = null, metadata = {}) {
        try {
            // اعتبارسنجی مقدار
            if (amount <= 0) {
                throw new Error('مبلغ باید بزرگتر از صفر باشد');
            }
            
            if (!Object.values(this.transactionTypes).includes(type)) {
                throw new Error('نوع تراکنش نامعتبر است');
            }
            
            // ایجاد تراکنش
            const transactionData = {
                user_id: userId,
                user_type: userType,
                amount: amount,
                type: type,
                description: description,
                reference_id: referenceId,
                metadata: JSON.stringify(metadata),
                status: 'completed',
                created_at: new Date().toISOString()
            };
            
            const { data: transaction, error: transactionError } = await supabase
                .from('wallet_transactions')
                .insert([transactionData])
                .select()
                .single();
            
            if (transactionError) throw transactionError;
            
            // به‌روزرسانی موجودی
            await this.updateBalance(userId, userType, amount, type);
            
            // ارسال نوتیفیکیشن
            await this.sendTransactionNotification(userId, userType, transaction);
            
            return transaction;
            
        } catch (error) {
            console.error('Error adding transaction:', error);
            throw error;
        }
    }
    
    async updateBalance(userId, userType, amount, transactionType) {
        try {
            let tableName;
            let idField;
            
            if (userType === 'passenger') {
                tableName = 'passengers';
                idField = 'id';
            } else if (userType === 'driver') {
                tableName = 'drivers';
                idField = 'id';
            } else {
                throw new Error('نوع کاربر نامعتبر است');
            }
            
            // دریافت موجودی فعلی
            const currentBalance = await this.getBalance(userId, userType);
            
            // محاسبه موجودی جدید
            let newBalance = currentBalance;
            if (transactionType === this.transactionTypes.DEPOSIT || 
                transactionType === this.transactionTypes.REFUND ||
                transactionType === this.transactionTypes.BONUS) {
                newBalance += amount;
            } else if (transactionType === this.transactionTypes.WITHDRAWAL ||
                      transactionType === this.transactionTypes.PAYMENT ||
                      transactionType === this.transactionTypes.PENALTY) {
                newBalance -= amount;
            }
            
            // اطمینان از منفی نشدن موجودی
            if (newBalance < 0) {
                throw new Error('موجودی کافی نیست');
            }
            
            // به‌روزرسانی موجودی
            const { error } = await supabase
                .from(tableName)
                .update({ wallet_balance: newBalance, updated_at: new Date().toISOString() })
                .eq(idField, userId);
            
            if (error) throw error;
            
            return newBalance;
            
        } catch (error) {
            console.error('Error updating balance:', error);
            throw error;
        }
    }
    
    async sendTransactionNotification(userId, userType, transaction) {
        const notificationSystem = new NotificationSystem();
        
        let title = '';
        let message = '';
        
        switch(transaction.type) {
            case this.transactionTypes.DEPOSIT:
                title = 'واریز موفق';
                message = `مبلغ ${transaction.amount.toLocaleString('fa-IR')} افغانی به کیف پول شما واریز شد`;
                break;
            case this.transactionTypes.WITHDRAWAL:
                title = 'برداشت موفق';
                message = `مبلغ ${transaction.amount.toLocaleString('fa-IR')} افغانی از کیف پول شما برداشت شد`;
                break;
            case this.transactionTypes.PAYMENT:
                title = 'پرداخت موفق';
                message = `مبلغ ${transaction.amount.toLocaleString('fa-IR')} افغانی از کیف پول شما کسر شد`;
                break;
            case this.transactionTypes.REFUND:
                title = 'عودت وجه';
                message = `مبلغ ${transaction.amount.toLocaleString('fa-IR')} افغانی به کیف پول شما بازگردانده شد`;
                break;
        }
        
        if (title && message) {
            await notificationSystem.sendNotification(
                userId,
                title,
                message,
                'wallet',
                { transaction_id: transaction.id }
            );
        }
    }
    
    async getTransactionHistory(userId, userType, limit = 50, offset = 0) {
        try {
            const { data, error } = await supabase
                .from('wallet_transactions')
                .select('*')
                .eq('user_id', userId)
                .eq('user_type', userType)
                .order('created_at', { ascending: false })
                .range(offset, offset + limit - 1);
            
            if (error) throw error;
            
            return data || [];
            
        } catch (error) {
            console.error('Error getting transaction history:', error);
            throw error;
        }
    }
    
    async initiateDeposit(userId, userType, amount, paymentMethod, metadata = {}) {
        try {
            // ایجاد درخواست واریز
            const depositData = {
                user_id: userId,
                user_type: userType,
                amount: amount,
                payment_method: paymentMethod,
                status: 'pending',
                metadata: JSON.stringify(metadata),
                created_at: new Date().toISOString()
            };
            
            const { data: deposit, error } = await supabase
                .from('deposit_requests')
                .insert([depositData])
                .select()
                .single();
            
            if (error) throw error;
            
            // ارسال درخواست به درگاه پرداخت
            const paymentUrl = await this.generatePaymentUrl(deposit.id, amount);
            
            return {
                deposit: deposit,
                payment_url: paymentUrl
            };
            
        } catch (error) {
            console.error('Error initiating deposit:', error);
            throw error;
        }
    }
    
    async generatePaymentUrl(depositId, amount) {
        // اینجا باید با درگاه پرداخت ارتباط برقرار شود
        // این یک نمونه ساده است
        return `https://payment.snap.af/pay?deposit_id=${depositId}&amount=${amount}`;
    }
    
    async verifyDeposit(depositId, transactionId) {
        try {
            // تایید پرداخت با درگاه
            const isVerified = await this.verifyPaymentWithGateway(transactionId);
            
            if (!isVerified) {
                throw new Error('پرداخت تایید نشد');
            }
            
            // دریافت اطلاعات واریز
            const { data: deposit, error: depositError } = await supabase
                .from('deposit_requests')
                .select('*')
                .eq('id', depositId)
                .single();
            
            if (depositError) throw depositError;
            
            if (deposit.status !== 'pending') {
                throw new Error('درخواست واریز قبلاً پردازش شده است');
            }
            
            // به‌روزرسانی وضعیت واریز
            const { error: updateError } = await supabase
                .from('deposit_requests')
                .update({
                    status: 'completed',
                    transaction_id: transactionId,
                    completed_at: new Date().toISOString()
                })
                .eq('id', depositId);
            
            if (updateError) throw updateError;
            
            // اضافه کردن موجودی به کیف پول
            await this.addTransaction(
                deposit.user_id,
                deposit.user_type,
                deposit.amount,
                this.transactionTypes.DEPOSIT,
                'واریز از طریق درگاه پرداخت',
                depositId,
                { transaction_id: transactionId }
            );
            
            return true;
            
        } catch (error) {
            console.error('Error verifying deposit:', error);
            
            // در صورت خطا، وضعیت واریز را به ناموفق تغییر بده
            await supabase
                .from('deposit_requests')
                .update({
                    status: 'failed',
                    failure_reason: error.message,
                    updated_at: new Date().toISOString()
                })
                .eq('id', depositId);
            
            throw error;
        }
    }
    
    async verifyPaymentWithGateway(transactionId) {
        // اینجا باید با API درگاه پرداخت ارتباط برقرار شود
        // در این نمونه، همیشه true برمی‌گردانیم
        return true;
    }
}

// ==================== سیستم چندزبانه ====================

class MultiLanguageSystem {
    constructor() {
        this.currentLanguage = 'fa';
        this.translations = {
            fa: this.getPersianTranslations(),
            en: this.getEnglishTranslations(),
            ps: this.getPashtoTranslations()
        };
    }
    
    getPersianTranslations() {
        return {
            // عمومی
            'app.name': 'اسنپ افغانستان',
            'app.slogan': 'سریع‌ترین راه برای رسیدن به مقصد',
            'welcome': 'خوش آمدید',
            'loading': 'در حال بارگذاری...',
            'error': 'خطا',
            'success': 'موفقیت',
            'warning': 'هشدار',
            'info': 'اطلاعات',
            
            // دکمه‌ها
            'button.save': 'ذخیره',
            'button.cancel': 'لغو',
            'button.submit': 'ثبت',
            'button.edit': 'ویرایش',
            'button.delete': 'حذف',
            'button.search': 'جستجو',
            'button.filter': 'فیلتر',
            'button.export': 'خروجی',
            'button.import': 'ورودی',
            
            // فرم‌ها
            'form.required': 'این فیلد الزامی است',
            'form.invalid': 'مقدار وارد شده نامعتبر است',
            'form.email': 'ایمیل',
            'form.password': 'رمز عبور',
            'form.name': 'نام',
            'form.phone': 'شماره تلفن',
            'form.address': 'آدرس',
            
            // منو
            'menu.dashboard': 'داشبورد',
            'menu.trips': 'سفرها',
            'menu.drivers': 'رانندگان',
            'menu.passengers': 'مسافران',
            'menu.reports': 'گزارشات',
            'menu.settings': 'تنظیمات',
            'menu.support': 'پشتیبانی',
            
            // وضعیت‌ها
            'status.active': 'فعال',
            'status.inactive': 'غیرفعال',
            'status.pending': 'در انتظار',
            'status.completed': 'تکمیل شده',
            'status.cancelled': 'لغو شده',
            'status.approved': 'تایید شده',
            'status.rejected': 'رد شده',
            
            // پیام‌ها
            'message.login_success': 'ورود موفقیت‌آمیز بود',
            'message.logout_success': 'خروج موفقیت‌آمیز بود',
            'message.save_success': 'ذخیره موفقیت‌آمیز بود',
            'message.delete_success': 'حذف موفقیت‌آمیز بود',
            'message.error_occurred': 'خطایی رخ داد',
            'message.no_data': 'داده‌ای یافت نشد',
            'message.confirm_delete': 'آیا از حذف این آیتم مطمئن هستید؟'
        };
    }
    
    getEnglishTranslations() {
        return {
            // General
            'app.name': 'Snap Afghanistan',
            'app.slogan': 'The fastest way to your destination',
            'welcome': 'Welcome',
            'loading': 'Loading...',
            'error': 'Error',
            'success': 'Success',
            'warning': 'Warning',
            'info': 'Information',
            
            // Buttons
            'button.save': 'Save',
            'button.cancel': 'Cancel',
            'button.submit': 'Submit',
            'button.edit': 'Edit',
            'button.delete': 'Delete',
            'button.search': 'Search',
            'button.filter': 'Filter',
            'button.export': 'Export',
            'button.import': 'Import',
            
            // Forms
            'form.required': 'This field is required',
            'form.invalid': 'Invalid value',
            'form.email': 'Email',
            'form.password': 'Password',
            'form.name': 'Name',
            'form.phone': 'Phone',
            'form.address': 'Address',
            
            // Menu
            'menu.dashboard': 'Dashboard',
            'menu.trips': 'Trips',
            'menu.drivers': 'Drivers',
            'menu.passengers': 'Passengers',
            'menu.reports': 'Reports',
            'menu.settings': 'Settings',
            'menu.support': 'Support',
            
            // Status
            'status.active': 'Active',
            'status.inactive': 'Inactive',
            'status.pending': 'Pending',
            'status.completed': 'Completed',
            'status.cancelled': 'Cancelled',
            'status.approved': 'Approved',
            'status.rejected': 'Rejected',
            
            // Messages
            'message.login_success': 'Login successful',
            'message.logout_success': 'Logout successful',
            'message.save_success': 'Save successful',
            'message.delete_success': 'Delete successful',
            'message.error_occurred': 'An error occurred',
            'message.no_data': 'No data found',
            'message.confirm_delete': 'Are you sure you want to delete this item?'
        };
    }
    
    getPashtoTranslations() {
        return {
            // عمومي
            'app.name': 'سنپ افغانستان',
            'app.slogan': 'ستړی لاره چې خپل موخې ته ورسېږي',
            'welcome': 'ښه راغلاست',
            'loading': 'بار کېږي...',
            'error': 'تېروتنه',
            'success': 'بریالیتوب',
            'warning': 'خبرتیا',
            'info': 'معلومات',
            
            // تڼۍ
            'button.save': 'خوندي کول',
            'button.cancel': 'لغوه کول',
            'button.submit': 'ثبتول',
            'button.edit': 'سمول',
            'button.delete': 'ړنګول',
            'button.search': 'لټون',
            'button.filter': 'فلټر',
            'button.export': 'صادرول',
            'button.import': 'واردول',
            
            // فورمه
            'form.required': 'دا ځای اړین دی',
            'form.invalid': 'ناسم ارزښت',
            'form.email': 'برېښنالیک',
            'form.password': 'پټنوم',
            'form.name': 'نوم',
            'form.phone': 'د تلیفون شمېره',
            'form.address': 'پته',
            
            // منو
            'menu.dashboard': 'ډشبورډ',
            'menu.trips': 'سفرونه',
            'menu.drivers': 'چلوونکي',
            'menu.passengers': 'مسافرین',
            'menu.reports': 'راپورونه',
            'menu.settings': 'ترتیبات',
            'menu.support': 'ملاتړ',
            
            // حالتونه
            'status.active': 'فعال',
            'status.inactive': 'غیرفعال',
            'status.pending': 'په تمه',
            'status.completed': 'بشپړ شوی',
            'status.cancelled': 'لغوه شوی',
            'status.approved': 'تایید شوی',
            'status.rejected': 'رد شوی',
            
            // پیغامونه
            'message.login_success': 'ننوتل بریالي شول',
            'message.logout_success': 'وتل بریالي شول',
            'message.save_success': 'خوندي کول بریالي شول',
            'message.delete_success': 'ړنګول بریالي شول',
            'message.error_occurred': 'یوه تېروتنه رامنځته شوه',
            'message.no_data': 'هیڅ معلومات ونه موندل شول',
            'message.confirm_delete': 'آیا تاسو ډاډه یاست چې دا توکی ړنګول غواړئ؟'
        };
    }
    
    setLanguage(lang) {
        if (this.translations[lang]) {
            this.currentLanguage = lang;
            this.applyTranslations();
            
            // ذخیره زبان در localStorage
            localStorage.setItem('app_language', lang);
            
            // تغییر جهت متن
            document.documentElement.dir = lang === 'fa' || lang === 'ps' ? 'rtl' : 'ltr';
            document.documentElement.lang = lang;
        }
    }
    
    applyTranslations() {
        const elements = document.querySelectorAll('[data-translate]');
        elements.forEach(element => {
            const key = element.getAttribute('data-translate');
            const translation = this.translations[this.currentLanguage][key];
            if (translation) {
                element.textContent = translation;
            }
        });
        
        // به‌روزرسانی عناصر input placeholder
        const inputs = document.querySelectorAll('[data-translate-placeholder]');
        inputs.forEach(input => {
            const key = input.getAttribute('data-translate-placeholder');
            const translation = this.translations[this.currentLanguage][key];
            if (translation) {
                input.placeholder = translation;
            }
        });
        
        // به‌روزرسانی عناصر title
        const titles = document.querySelectorAll('[data-translate-title]');
        titles.forEach(element => {
            const key = element.getAttribute('data-translate-title');
            const translation = this.translations[this.currentLanguage][key];
            if (translation) {
                element.title = translation;
            }
        });
    }
    
    translate(key, params = {}) {
        let translation = this.translations[this.currentLanguage][key];
        
        if (!translation) {
            console.warn(`Translation key not found: ${key}`);
            return key;
        }
        
        // جایگزینی پارامترها
        Object.keys(params).forEach(param => {
            translation = translation.replace(`{${param}}`, params[param]);
        });
        
        return translation;
    }
    
    init() {
        // خواندن زبان ذخیره شده
        const savedLang = localStorage.getItem('app_language');
        if (savedLang && this.translations[savedLang]) {
            this.currentLanguage = savedLang;
        } else {
            // تشخیص زبان مرورگر
            const browserLang = navigator.language.split('-')[0];
            if (this.translations[browserLang]) {
                this.currentLanguage = browserLang;
            }
        }
        
        // اعمال ترجمه‌ها
        this.applyTranslations();
        
        // اضافه کردن سوئیچ زبان به صفحه
        this.addLanguageSwitcher();
    }
    
    addLanguageSwitcher() {
        const switcherHTML = `
            <div class="language-switcher">
                <button class="btn btn-sm ${this.currentLanguage === 'fa' ? 'btn-primary' : 'btn-secondary'}" 
                        onclick="multiLang.setLanguage('fa')">
                    فارسی
                </button>
                <button class="btn btn-sm ${this.currentLanguage === 'en' ? 'btn-primary' : 'btn-secondary'}" 
                        onclick="multiLang.setLanguage('en')">
                    English
                </button>
                <button class="btn btn-sm ${this.currentLanguage === 'ps' ? 'btn-primary' : 'btn-secondary'}" 
                        onclick="multiLang.setLanguage('ps')">
                    پښتو
                </button>
            </div>
        `;
        
        // اضافه کردن سوئیچ به هدر
        const header = document.querySelector('.content-header');
        if (header) {
            header.insertAdjacentHTML('beforeend', switcherHTML);
        }
    }
}

// ==================== سیستم تاریخ شمسی و میلادی ====================

class DateSystem {
    constructor() {
        this.currentCalendar = 'jalali'; // پیش‌فرض شمسی
    }
    
    setCalendar(calendar) {
        this.currentCalendar = calendar;
        localStorage.setItem('app_calendar', calendar);
        this.updateAllDates();
    }
    
    getCurrentDate() {
        const now = new Date();
        return this.formatDate(now);
    }
    
    formatDate(date, format = 'full') {
        if (this.currentCalendar === 'jalali') {
            return this.toJalali(date, format);
        } else {
            return this.toGregorian(date, format);
        }
    }
    
    toJalali(gregorianDate, format = 'full') {
        // تبدیل تاریخ میلادی به شمسی
        // این یک پیاده‌سازی ساده است، برای استفاده واقعی از کتابخانه‌ای مثل jalali-js استفاده کنید
        const gDate = new Date(gregorianDate);
        const gy = gDate.getFullYear();
        const gm = gDate.getMonth() + 1;
        const gd = gDate.getDate();
        
        // الگوریتم تبدیل (ساده شده)
        const gDaysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        const jDaysInMonth = [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 29];
        
        let jy = gy - 621;
        let jm, jd;
        
        // محاسبات دقیق نیاز به الگوریتم کامل دارد
        // اینجا فقط یک تبدیل ساده نشان داده شده
        
        const gregorianDayOfYear = this.getDayOfYear(gy, gm, gd);
        let jalaliDayOfYear = gregorianDayOfYear - 79;
        
        if (jalaliDayOfYear < 1) {
            jy--;
            jalaliDayOfYear += 365;
        }
        
        jm = 0;
        while (jalaliDayOfYear > jDaysInMonth[jm]) {
            jalaliDayOfYear -= jDaysInMonth[jm];
            jm++;
        }
        jm++;
        jd = jalaliDayOfYear;
        
        switch (format) {
            case 'full':
                return `${jy}/${this.pad(jm)}/${this.pad(jd)}`;
            case 'short':
                return `${this.pad(jm)}/${this.pad(jd)}`;
            case 'year':
                return jy.toString();
            case 'month':
                return jm.toString();
            case 'day':
                return jd.toString();
            default:
                return `${jy}/${this.pad(jm)}/${this.pad(jd)}`;
        }
    }
    
    toGregorian(jalaliDate, format = 'full') {
        // تبدیل تاریخ شمسی به میلادی
        // اینجا هم پیاده‌سازی ساده شده
        return new Date().toLocaleDateString('en-US');
    }
    
    getDayOfYear(year, month, day) {
        const monthDays = [31, (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        let dayOfYear = day;
        for (let i = 0; i < month - 1; i++) {
            dayOfYear += monthDays[i];
        }
        return dayOfYear;
    }
    
    pad(num) {
        return num.toString().padStart(2, '0');
    }
    
    updateAllDates() {
        // به‌روزرسانی تمام تاریخ‌های صفحه
        const dateElements = document.querySelectorAll('[data-date]');
        dateElements.forEach(element => {
            const dateStr = element.getAttribute('data-date');
            const date = new Date(dateStr);
            const formattedDate = this.formatDate(date);
            element.textContent = formattedDate;
        });
    }
    
    addCalendarSwitcher() {
        const switcherHTML = `
            <div class="calendar-switcher">
                <button class="btn btn-sm ${this.currentCalendar === 'jalali' ? 'btn-primary' : 'btn-secondary'}" 
                        onclick="dateSystem.setCalendar('jalali')">
                    شمسی
                </button>
                <button class="btn btn-sm ${this.currentCalendar === 'gregorian' ? 'btn-primary' : 'btn-secondary'}" 
                        onclick="dateSystem.setCalendar('gregorian')">
                    میلادی
                </button>
            </div>
        `;
        
        const header = document.querySelector('.content-header');
        if (header) {
            header.insertAdjacentHTML('beforeend', switcherHTML);
        }
    }
    
    init() {
        const savedCalendar = localStorage.getItem('app_calendar');
        if (savedCalendar) {
            this.currentCalendar = savedCalendar;
        }
        this.addCalendarSwitcher();
    }
}

// ==================== تابع‌های کمکی ====================

function closeModal() {
    const modal = document.querySelector('.form-modal.active');
    if (modal) {
        modal.remove();
    }
}

function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <i class="fas ${type === 'success' ? 'fa-check-circle' : 
                           type === 'error' ? 'fa-exclamation-circle' : 
                           type === 'warning' ? 'fa-exclamation-triangle' : 
                           'fa-info-circle'}"></i>
            <span>${message}</span>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    // نمایش انیمیشن
    setTimeout(() => {
        notification.classList.add('show');
    }, 10);
    
    // حذف بعد از چند ثانیه
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 5000);
}

async function exportToExcel() {
    try {
        // اینجا باید با یک کتابخانه یا API خروجی اکسل تولید شود
        showNotification('در حال تولید فایل اکسل...', 'info');
        
        // نمونه ساختار برای اکسل
        const data = [
            ['شماره', 'نام', 'ایمیل', 'تلفن', 'تاریخ ثبت'],
            ['1', 'احمد', 'ahmad@example.com', '0700123456', '1402/10/15'],
            ['2', 'محمود', 'mahmood@example.com', '0700654321', '1402/10/16']
        ];
        
        // تبدیل به CSV (نمونه ساده)
        const csv = data.map(row => row.join(',')).join('\n');
        
        // ایجاد فایل و دانلود
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `report_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        
        showNotification('فایل اکسل با موفقیت دانلود شد', 'success');
        
    } catch (error) {
        console.error('Error exporting to Excel:', error);
        showNotification('خطا در تولید فایل اکسل', 'error');
    }
}

function refreshData() {
    const currentSection = document.getElementById('contentTitle').textContent;
    showSection(getSectionKeyFromTitle(currentSection));
    showNotification('داده‌ها به‌روزرسانی شدند', 'success');
}

function getSectionKeyFromTitle(title) {
    // این تابع عنوان صفحه را به کلید مربوطه تبدیل می‌کند
    const mapping = {
        'مدیریت شهرها': 'cities',
        'مدیریت مناطق': 'districts',
        'فرمول‌های کرایه': 'fares',
        'کمیسیون‌ها': 'commissions',
        'مدیریت کوپن‌ها': 'coupons',
        'مدیریت مسافران': 'passengers',
        'مدیریت رانندگان': 'drivers',
        'گزارشات مالی': 'reports',
        'گزارش سفرها': 'tripsReport'
    };
    
    return mapping[title] || 'dashboard';
}

// ==================== راه‌اندازی اولیه ====================

document.addEventListener('DOMContentLoaded', async function() {
    // بررسی وضعیت ورود
    await checkUserLoginStatus();
    
    // اگر کاربر ادمین بود، پورتال مدیریت را نمایش بده
    if (isAdmin) {
        createAdminPortal();
        
        // راه‌اندازی سیستم چندزبانه
        window.multiLang = new MultiLanguageSystem();
        multiLang.init();
        
        // راه‌اندازی سیستم تاریخ
        window.dateSystem = new DateSystem();
        dateSystem.init();
        
        // بارگذاری داشبورد
        loadDashboard();
        
        showNotification('پورتال مدیریت با موفقیت بارگذاری شد', 'success');
    } else {
        // نمایش صفحه کاربر عادی
        showUserInterface();
    }
});

async function checkUserLoginStatus() {
    try {
        const { data: { user }, error } = await supabase.auth.getUser();
        
        if (error) throw error;
        
        if (user) {
            currentUser = user;
            
            // بررسی نقش کاربر
            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', user.id)
                .single();
            
            if (!profileError && profile) {
                isAdmin = profile.role === 'admin';
            }
        }
    } catch (error) {
        console.error('Error checking login status:', error);
    }
}

function showUserInterface() {
    // اینجا رابط کاربری معمولی برای مسافران و رانندگان نمایش داده می‌شود
    document.body.innerHTML = `
        <div class="user-interface">
            <h1>به اسنپ افغانستان خوش آمدید</h1>
            <p>لطفاً از طریق اپلیکیشن موبایل وارد شوید.</p>
            <div class="download-links">
                <a href="#" class="btn btn-primary">
                    <i class="fab fa-android"></i> دانلود اندروید
                </a>
                <a href="#" class="btn btn-primary">
                    <i class="fab fa-apple"></i> دانلود iOS
                </a>
            </div>
        </div>
    `;
}

// ==================== اکسپورت برای استفاده در کنسول ====================

// ایجاد نمونه‌های سیستم برای استفاده در کنسول
window.taxiSystem = taxiSystem;
window.supportSystem = new SupportSystem();
window.ratingSystem = new RatingSystem();
window.notificationSystem = new NotificationSystem();
window.walletSystem = new WalletSystem();

console.log('سیستم جامع مدیریت تاکسی آنلاین بارگذاری شد.');
console.log('سیستم‌های در دسترس:');
console.log('- taxiSystem: سیستم مدیریت کرایه و کمیسیون');
console.log('- supportSystem: سیستم پشتیبانی');
console.log('- ratingSystem: سیستم امتیازدهی');
console.log('- notificationSystem: سیستم نوتیفیکیشن');
console.log('- walletSystem: سیستم کیف پول');
console.log('- multiLang: سیستم چندزبانه');
console.log('- dateSystem: سیستم تاریخ');

// ==================== استایل‌های اضافی ====================

const additionalStyles = document.createElement('style');
additionalStyles.textContent = `
    /* استایل‌های نوتیفیکیشن */
    .notification {
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        background: white;
        border-radius: 10px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        z-index: 10000;
        transform: translateX(150%);
        transition: transform 0.3s ease;
        border-right: 4px solid ${COLORS.primary};
    }
    
    .notification.show {
        transform: translateX(0);
    }
    
    .notification.success {
        border-right-color: ${COLORS.success};
    }
    
    .notification.error {
        border-right-color: ${COLORS.danger};
    }
    
    .notification.warning {
        border-right-color: ${COLORS.warning};
    }
    
    .notification.info {
        border-right-color: ${COLORS.info};
    }
    
    .notification-content {
        display: flex;
        align-items: center;
        gap: 10px;
    }
    
    .notification i {
        font-size: 20px;
    }
    
    /* استایل‌های سوئیچ زبان */
    .language-switcher {
        display: flex;
        gap: 5px;
        margin-right: 10px;
    }
    
    .calendar-switcher {
        display: flex;
        gap: 5px;
        margin-right: 10px;
    }
    
    /* استایل‌های رابط کاربری */
    .user-interface {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100vh;
        text-align: center;
        padding: 20px;
    }
    
    .download-links {
        display: flex;
        gap: 20px;
        margin-top: 30px;
    }
    
    .download-links .btn {
        padding: 15px 30px;
        font-size: 18px;
        display: flex;
        align-items: center;
        gap: 10px;
    }
    
    /* استایل‌های واکنش‌گرا */
    @media (max-width: 768px) {
        .admin-portal {
            flex-direction: column;
        }
        
        .portal-sidebar {
            width: 100%;
            height: auto;
            max-height: 300px;
        }
        
        .portal-content {
            overflow-x: hidden;
        }
        
        .form-row {
            grid-template-columns: 1fr;
        }
        
        .dashboard-cards {
            grid-template-columns: 1fr;
        }
        
        .filter-bar {
            flex-direction: column;
            gap: 10px;
        }
        
        .date-range {
            flex-direction: column;
            align-items: stretch;
        }
        
        .language-switcher,
        .calendar-switcher {
            flex-wrap: wrap;
        }
    }
    
    /* استایل‌های مخصوص چاپ */
    @media print {
        .portal-sidebar,
        .filter-bar,
        .action-buttons,
        .language-switcher,
        .calendar-switcher {
            display: none !important;
        }
        
        .portal-content {
            width: 100% !important;
        }
        
        .content-header {
            position: static !important;
        }
    }
    
    /* انیمیشن‌ها */
    @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }
    
    .fade-in {
        animation: fadeIn 0.3s ease;
    }
    
    /* استایل‌های پیشرفته جدول */
    .table-scroll {
        overflow-x: auto;
    }
    
    .table-sticky th {
        position: sticky;
        top: 0;
        background: white;
        z-index: 1;
    }
    
    /* استایل‌های کارت */
    .card {
        background: white;
        border-radius: 10px;
        padding: 20px;
        margin-bottom: 20px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        transition: transform 0.3s, box-shadow 0.3s;
    }
    
    .card:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 8px rgba(0,0,0,0.15);
    }
    
    .card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 15px;
        padding-bottom: 10px;
        border-bottom: 1px solid ${COLORS.light};
    }
    
    .card-body {
        margin-top: 10px;
    }
`;

document.head.appendChild(additionalStyles);

// ==================== لاگ سیستمی ====================

class SystemLogger {
    constructor() {
        this.logLevels = {
            INFO: 'info',
            WARNING: 'warning',
            ERROR: 'error',
            DEBUG: 'debug'
        };
    }
    
    async log(level, module, action, details, userId = null) {
        try {
            const logData = {
                level: level,
                module: module,
                action: action,
                details: JSON.stringify(details),
                user_id: userId,
                ip_address: await this.getIP(),
                user_agent: navigator.userAgent,
                created_at: new Date().toISOString()
            };
            
            await supabase
                .from('system_logs')
                .insert([logData]);
            
            // همچنین در کنسول نمایش بده
            const consoleMethod = level === this.logLevels.ERROR ? 'error' :
                                level === this.logLevels.WARNING ? 'warn' :
                                level === this.logLevels.INFO ? 'info' : 'log';
            
            console[consoleMethod](`[${module}] ${action}:`, details);
            
        } catch (error) {
            console.error('Error logging:', error);
        }
    }
    
    async getIP() {
        try {
            const response = await fetch('https://api.ipify.org?format=json');
            const data = await response.json();
            return data.ip;
        } catch (error) {
            return 'unknown';
        }
    }
    
    async getLogs(filters = {}) {
        try {
            let query = supabase
                .from('system_logs')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(100);
            
            if (filters.level) {
                query = query.eq('level', filters.level);
            }
            
            if (filters.module) {
                query = query.eq('module', filters.module);
            }
            
            if (filters.userId) {
                query = query.eq('user_id', filters.userId);
            }
            
            if (filters.startDate) {
                query = query.gte('created_at', filters.startDate);
            }
            
            if (filters.endDate) {
                query = query.lte('created_at', filters.endDate);
            }
            
            const { data, error } = await query;
            
            if (error) throw error;
            
            return data || [];
            
        } catch (error) {
            console.error('Error getting logs:', error);
            return [];
        }
    }
}

// ایجاد نمونه logger
window.logger = new SystemLogger();

console.log('سیستم جامع مدیریت تاکسی آنلاین آماده است!');
console.log('برای دسترسی به سیستم‌های مختلف از window استفاده کنید');
console.log('مثال: window.taxiSystem, window.supportSystem, window.logger');