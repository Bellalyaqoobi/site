function showForgotPassword() {
    const loginForm = document.getElementById('loginForm');
    const forgotForm = document.getElementById('forgotPasswordForm');
    
    if (loginForm) loginForm.style.display = 'none';
    if (forgotForm) forgotForm.style.display = 'block';
}

function showLogin() {
    const loginForm = document.getElementById('loginForm');
    const forgotForm = document.getElementById('forgotPasswordForm');
    
    if (loginForm) loginForm.style.display = 'block';
    if (forgotForm) forgotForm.style.display = 'none';
}

// توابع برای تغییر تب‌ها
document.querySelectorAll('.form-tab').forEach(tab => {
    tab.addEventListener('click', function() {
        const tabId = this.getAttribute('data-tab');
        showAuthTab(tabId);
    });
});

function showAuthTab(tabId) {
    // پنهان کردن تمام فرم‌ها
    document.querySelectorAll('.form-tab-content').forEach(content => {
        content.style.display = 'none';
    });
    
    // نمایش فرم انتخاب شده
    const activeContent = document.getElementById(`${tabId}-tab`);
    if (activeContent) {
        activeContent.style.display = 'block';
    }
    
    // به‌روزرسانی تب‌های فعال
    document.querySelectorAll('.form-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    const activeTab = document.querySelector(`[data-tab="${tabId}"]`);
    if (activeTab) {
        activeTab.classList.add('active');
    }
}
